/**
 * IMAP Email Poller
 * ─────────────────────────────────────────────────────────────────────────
 * Background poller for agents configured with `provider: 'imap'` (email +
 * app password or domain mailbox). Mirrors the architecture of the Gmail
 * OAuth poller (./email-poller.ts) but uses IMAP semantics:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │                ImapEmailPoller                       │
 *   │  ┌────────────────────────────────────────────────┐  │
 *   │  │  for each agent with emailConfig.provider=imap │  │
 *   │  │  ┌──────────────────────────────────────────┐  │  │
 *   │  │  │  long-lived ImapFlow connection (one per │  │  │
 *   │  │  │  mailbox; recreate on disconnect)        │  │  │
 *   │  │  │  - circuit breaker (per-agent)           │  │  │
 *   │  │  │  - UIDVALIDITY + lastUid persisted to    │  │  │
 *   │  │  │    engine_settings.imap_poller_state     │  │  │
 *   │  │  └──────────────────────────────────────────┘  │  │
 *   │  └────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────┘
 *
 *   Polls INBOX every `intervalMs` (default 30s).
 *   On each poll: fetch UIDs > lastUid, parse new ones, dispatch to the
 *   agent's runtime at POST localhost:<port>/api/runtime/email.
 *
 *   Self-loop, work-hours, manager-bypass, and bot-skip rules mirror the
 *   Gmail poller for consistency.
 *
 *   If the agent has `sendAsAlias` configured, only messages whose To/Cc
 *   contains the alias are dispatched — otherwise the alias inbox is
 *   indistinguishable from the underlying mailbox and the agent would see
 *   every personal email the mailbox owner receives.
 *
 *   IMAP IDLE (push) is NOT used in v1 — interval polling is simpler,
 *   more robust on flaky networks, and matches the Gmail poller cadence.
 *   We can add IDLE in v2 if latency becomes a complaint.
 */

// ─── Constants ──────────────────────────────────────────

const DEFAULT_INTERVAL = 30_000; // 30s between poll cycles, matches Gmail poller
const MAX_NEW_PER_CYCLE = 50;    // cap on UIDs fetched per poll (avoid huge backfills)
const CIRCUIT_BREAKER_THRESHOLD = 5;
const INITIAL_BACKOFF = 30_000;
const MAX_BACKOFF = 300_000; // 5 min
const STATE_SAVE_INTERVAL = 5; // save state every N polls
const FETCH_TIMEOUT_MS = 20_000;
const CONNECT_TIMEOUT_MS = 15_000;

// ─── Types ──────────────────────────────────────────────

export interface ImapEmailPollerConfig {
  engineDb: EngineDB;
  lifecycle: any;
  intervalMs?: number;
  agentPorts?: Record<string, number>;
  workforce?: any;
}

interface EngineDB {
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<void>;
}

interface ImapMailbox {
  agentId: string;
  agentName: string;
  agentEmail: string;
  sendAsAlias: string;
  port: number;
  host: string;

  // IMAP connection params (re-used to (re)connect)
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;

  // Live client (lazy; recreated on disconnect)
  client: any | null;
  connecting: boolean;

  // Incremental state
  uidvalidity: number;
  lastUid: number;

  // Circuit breaker
  consecutiveFailures: number;
  backoffMs: number;
  nextPollAfter: number;
  circuitOpen: boolean;

  // Stats
  totalPolled: number;
  totalDispatched: number;
  lastPollAt: string;
  lastError: string;
  lastDispatchAt: string;
}

interface ImapPollerState {
  mailboxes: Record<string, {
    uidvalidity: number;
    lastUid: number;
    lastPollAt: string;
  }>;
  savedAt: string;
}

// ─── ImapEmailPoller ────────────────────────────────────

export class ImapEmailPoller {
  private config: ImapEmailPollerConfig;
  private mailboxes: Map<string, ImapMailbox> = new Map();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollCount = 0;
  private shuttingDown = false;

  constructor(config: ImapEmailPollerConfig) {
    this.config = config;
  }

  // ─── Lifecycle ────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('[imap-poller] Initializing...');

    await this.discoverMailboxes();
    await this.loadState();

    if (this.mailboxes.size === 0) {
      console.log('[imap-poller] No IMAP-enabled agents found, will retry on next discovery');
    } else {
      const list = [...this.mailboxes.values()]
        .map(m => `${m.agentName} <${m.agentEmail}${m.sendAsAlias ? ` via ${m.sendAsAlias}` : ''}>`)
        .join(', ');
      console.log(`[imap-poller] Monitoring ${this.mailboxes.size} mailbox(es): ${list}`);
    }

    const intervalMs = this.config.intervalMs ?? DEFAULT_INTERVAL;
    this.pollTimer = setInterval(() => {
      this.pollAll().catch(e => console.warn(`[imap-poller] poll cycle error: ${e.message}`));
      // Re-discover on every cycle so newly-configured agents are picked up
      // without a restart. Cheap — just walks the in-memory agent list.
      this.discoverMailboxes().catch(() => {});
    }, intervalMs);

    console.log(`[imap-poller] ✅ Started (interval: ${intervalMs / 1000}s)`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.shuttingDown = true;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.saveState().catch(e => console.warn(`[imap-poller] Failed to save state on shutdown: ${e.message}`));

    // Close all IMAP clients
    for (const mailbox of this.mailboxes.values()) {
      await this.disconnect(mailbox).catch(() => {});
    }
    this.mailboxes.clear();
    console.log('[imap-poller] Stopped');
  }

  // ─── Discovery ────────────────────────────────────────

  async discoverMailboxes(): Promise<void> {
    const allAgents = this.config.lifecycle.getAllAgents();
    let agentPorts = { ...(this.config.agentPorts || {}) };
    try {
      const rows = await this.config.engineDb.query(
        `SELECT value FROM engine_settings WHERE key = 'standalone_agents'`,
      );
      if (rows?.[0]) {
        const sa = JSON.parse((rows[0] as any).value);
        for (const a of sa) agentPorts[a.id] = a.port;
      }
    } catch {}

    const seenAgentIds = new Set<string>();

    for (const agent of allAgents) {
      const emailConfig = agent.config?.emailConfig;
      if (!emailConfig) continue;

      // Only handle IMAP-provider agents. Google/Microsoft OAuth use the
      // dedicated Gmail poller.
      if (emailConfig.provider !== 'imap') continue;

      // Required: host + auth
      const imapHost = emailConfig.imapHost;
      const imapPort = emailConfig.imapPort || 993;
      const imapUser = emailConfig.smtpUser || emailConfig.email;
      const imapPass = emailConfig.password || emailConfig.smtpPass;
      if (!imapHost || !imapUser || !imapPass) {
        // Config not yet complete; skip silently — the agent's mailbox
        // page will show "configured: false / missing fields".
        continue;
      }

      seenAgentIds.add(agent.id);

      const dep = agent.config?.deployment;
      const port = agentPorts[agent.id] || dep?.port || dep?.config?.local?.port || 3100;
      const existing = this.mailboxes.get(agent.id);

      // If the agent's IMAP creds changed under us, force-reconnect.
      const credsChanged = existing && (
        existing.imapHost !== imapHost ||
        existing.imapPort !== imapPort ||
        existing.imapUser !== imapUser ||
        existing.imapPass !== imapPass
      );

      if (existing && !credsChanged) {
        // Update mutable fields (alias, port) in place.
        existing.sendAsAlias = emailConfig.sendAsAlias || '';
        existing.port = port;
        existing.agentName = agent.config?.displayName || agent.config?.name || agent.name || existing.agentName;
        existing.agentEmail = emailConfig.email || existing.agentEmail;
        continue;
      }

      if (credsChanged && existing) {
        console.log(`[imap-poller] ${existing.agentName}: credentials changed, reconnecting`);
        await this.disconnect(existing).catch(() => {});
      }

      const mailbox: ImapMailbox = {
        agentId: agent.id,
        agentName: agent.config?.displayName || agent.config?.name || agent.name || 'Unknown',
        agentEmail: emailConfig.email || '',
        sendAsAlias: emailConfig.sendAsAlias || '',
        port,
        host: 'localhost',

        imapHost,
        imapPort,
        imapUser,
        imapPass,

        client: null,
        connecting: false,

        uidvalidity: 0,
        lastUid: 0,

        consecutiveFailures: 0,
        backoffMs: 0,
        nextPollAfter: 0,
        circuitOpen: false,

        totalPolled: 0,
        totalDispatched: 0,
        lastPollAt: '',
        lastError: '',
        lastDispatchAt: '',
      };
      this.mailboxes.set(agent.id, mailbox);
    }

    // Remove mailboxes for agents that no longer exist or are no longer IMAP-configured.
    for (const [id, mailbox] of this.mailboxes) {
      if (!seenAgentIds.has(id)) {
        console.log(`[imap-poller] Removing mailbox for ${mailbox.agentName} (agent removed or reconfigured)`);
        await this.disconnect(mailbox).catch(() => {});
        this.mailboxes.delete(id);
      }
    }
  }

  // ─── Connection management ────────────────────────────

  private async ensureConnection(mailbox: ImapMailbox): Promise<any> {
    if (mailbox.client && mailbox.client.usable) return mailbox.client;
    if (mailbox.connecting) {
      // Another caller is mid-connect; wait briefly then re-check.
      await new Promise(r => setTimeout(r, 500));
      if (mailbox.client && mailbox.client.usable) return mailbox.client;
    }

    mailbox.connecting = true;
    try {
      const { ImapFlow } = await import('imapflow');
      const client = new (ImapFlow as any)({
        host: mailbox.imapHost,
        port: mailbox.imapPort,
        secure: true,
        auth: { user: mailbox.imapUser, pass: mailbox.imapPass },
        logger: false,
        socketTimeout: FETCH_TIMEOUT_MS,
        greetingTimeout: CONNECT_TIMEOUT_MS,
      });
      // Suppress uncaught socket errors so a transient network blip doesn't
      // bring down the engine process. Real failures still surface via
      // explicit fetch/lock errors and the circuit breaker.
      client.on('error', (err: any) => {
        console.warn(`[imap-poller] ${mailbox.agentName}: IMAP socket error (suppressed): ${err.message}`);
      });
      client.on('close', () => {
        if (mailbox.client === client) mailbox.client = null;
      });
      await client.connect();
      mailbox.client = client;
      return client;
    } finally {
      mailbox.connecting = false;
    }
  }

  private async disconnect(mailbox: ImapMailbox): Promise<void> {
    if (!mailbox.client) return;
    try {
      await mailbox.client.logout();
    } catch {}
    mailbox.client = null;
  }

  // ─── Polling ──────────────────────────────────────────

  private async pollAll(): Promise<void> {
    if (this.shuttingDown) return;
    this.pollCount++;

    for (const [, mailbox] of this.mailboxes) {
      if (this.shuttingDown) return;

      if (mailbox.circuitOpen && Date.now() < mailbox.nextPollAfter) {
        continue; // backoff
      }

      try {
        await this.pollMailbox(mailbox);
        this.resetCircuitBreaker(mailbox);
      } catch (e: any) {
        this.handlePollError(mailbox, e);
        // If the connection is bad, drop it so next cycle reconnects.
        await this.disconnect(mailbox).catch(() => {});
      }
    }

    if (this.pollCount % STATE_SAVE_INTERVAL === 0) {
      await this.saveState().catch(e => console.warn(`[imap-poller] State save failed: ${e.message}`));
    }
  }

  private async pollMailbox(mailbox: ImapMailbox): Promise<void> {
    mailbox.lastPollAt = new Date().toISOString();
    mailbox.totalPolled++;

    const client = await this.ensureConnection(mailbox);
    const lock = await client.getMailboxLock('INBOX');

    try {
      // imapflow exposes the open mailbox status via client.mailbox after
      // getMailboxLock. uidvalidity changes are rare (re-numbering events)
      // but when they happen our cached lastUid is meaningless, so reset.
      const mboxInfo = (client as any).mailbox;
      const currentUidvalidity = Number(mboxInfo?.uidValidity ?? mboxInfo?.uidvalidity ?? 0);
      if (!currentUidvalidity) {
        // No UIDVALIDITY exposed — be conservative, do nothing this cycle.
        return;
      }

      if (mailbox.uidvalidity && mailbox.uidvalidity !== currentUidvalidity) {
        console.warn(`[imap-poller] ${mailbox.agentName}: UIDVALIDITY changed (${mailbox.uidvalidity} → ${currentUidvalidity}); resetting lastUid`);
        // Seed lastUid to the current uidNext so we don't backfill years
        // of mail.
        mailbox.lastUid = Math.max(0, Number(mboxInfo?.uidNext ?? 0) - 1);
        mailbox.uidvalidity = currentUidvalidity;
        return; // skip this cycle; pick up new mail next round
      }
      mailbox.uidvalidity = currentUidvalidity;

      // First-ever poll: seed lastUid to the current UID-NEXT minus 1 so
      // we don't dispatch the entire historical inbox.
      if (!mailbox.lastUid) {
        mailbox.lastUid = Math.max(0, Number(mboxInfo?.uidNext ?? 0) - 1);
        console.log(`[imap-poller] ${mailbox.agentName}: seeded lastUid=${mailbox.lastUid} (uidvalidity=${mailbox.uidvalidity})`);
        return;
      }

      // Fetch UIDs strictly greater than lastUid.
      const range = `${mailbox.lastUid + 1}:*`;
      const newUids: number[] = [];
      try {
        // imapflow.search returns numeric UIDs.
        const found: any = await client.search({ uid: range }, { uid: true });
        if (Array.isArray(found)) {
          for (const uid of found) {
            const n = Number(uid);
            if (n > mailbox.lastUid) newUids.push(n);
          }
        }
      } catch (e: any) {
        // Empty mailbox or no new messages may throw on some servers; treat as 0.
        if (!/NO MESSAGES|NO SEARCH/i.test(e.message || '')) throw e;
      }

      if (newUids.length === 0) return;

      newUids.sort((a, b) => a - b);
      const slice = newUids.slice(0, MAX_NEW_PER_CYCLE);

      for (const uid of slice) {
        if (this.shuttingDown) return;
        try {
          await this.processMessage(mailbox, client, uid);
        } catch (e: any) {
          // Skip the individual message but continue with the rest. Don't
          // advance lastUid past it so we retry next cycle.
          console.warn(`[imap-poller] ${mailbox.agentName}: uid=${uid} processing failed: ${e.message}`);
          throw e;
        }
        // Advance lastUid incrementally so partial-batch failure still
        // makes forward progress on the messages that succeeded.
        if (uid > mailbox.lastUid) mailbox.lastUid = uid;
      }

      // If we capped, leave the rest for next cycle (lastUid is already at
      // the last processed UID, so the slice picks up where we stopped).
      if (newUids.length > MAX_NEW_PER_CYCLE) {
        console.log(`[imap-poller] ${mailbox.agentName}: capped batch at ${MAX_NEW_PER_CYCLE}, ${newUids.length - MAX_NEW_PER_CYCLE} more queued for next cycle`);
      }
    } finally {
      lock.release();
    }
  }

  // ─── Message processing ───────────────────────────────

  private async processMessage(mailbox: ImapMailbox, client: any, uid: number): Promise<void> {
    const msg: any = await client.fetchOne(String(uid), {
      uid: true,
      envelope: true,
      bodyStructure: true,
      flags: true,
      internalDate: true,
    });
    if (!msg) return;

    const env = msg.envelope || {};
    const subject = (env.subject || '').toString();
    const fromList = env.from || [];
    const fromAddr = fromList[0] || {};
    const fromEmail = (fromAddr.address || '').toLowerCase();
    const fromName = fromAddr.name || '';
    const toList = env.to || [];
    const ccList = env.cc || [];
    const messageId = env.messageId || `<imap-${mailbox.uidvalidity}-${uid}@local>`;
    const threadId = env.inReplyTo || messageId; // best-effort
    const flags: string[] = Array.isArray(msg.flags) ? msg.flags.map((f: any) => String(f)) : [];

    // ── Skip rules (mirror the Gmail poller) ────────────
    // Drafts
    if (flags.includes('\\Draft')) return;
    // Already-deleted on server
    if (flags.includes('\\Deleted')) return;
    // Self-loop: from the agent itself OR the alias
    const selfEmails = [mailbox.agentEmail, mailbox.sendAsAlias]
      .filter(Boolean)
      .map(e => e.toLowerCase());
    if (fromEmail && selfEmails.includes(fromEmail)) return;

    // Alias filter: when the agent has a Send-as alias, only dispatch
    // messages addressed to that alias. Otherwise the agent would see
    // every email in the underlying mailbox owner's inbox.
    if (mailbox.sendAsAlias) {
      const alias = mailbox.sendAsAlias.toLowerCase();
      const addressedToAlias = [...toList, ...ccList]
        .map((a: any) => (a?.address || '').toLowerCase())
        .some(a => a === alias);
      if (!addressedToAlias) return;
    }

    // Work-hours enforcement: only manager can wake the agent off-hours.
    if (this.config.workforce) {
      const { onDuty, reason } = this.config.workforce.shouldBeWorking(mailbox.agentId);
      if (!onDuty) {
        const managerEmail = this.config.workforce.getManagerEmail(mailbox.agentId);
        const isFromManager = managerEmail && fromEmail === String(managerEmail).toLowerCase();
        if (!isFromManager) {
          console.log(`[imap-poller] ${mailbox.agentName}: SKIPPED uid=${uid} from ${fromEmail} — ${reason}`);
          return; // lastUid still advances; we won't retry
        }
        console.log(`[imap-poller] ${mailbox.agentName}: off-hours but manager email — waking agent`);
      }
    }

    // ── Extract body ────────────────────────────────────
    const { text, html } = await this.extractBody(client, uid, msg.bodyStructure);

    console.log(`[imap-poller] ${mailbox.agentName}: new email uid=${uid} from ${fromEmail}: "${subject.slice(0, 60)}"`);

    // Mark as read so the user sees the same UI state as a human reading
    // it. Best-effort; if it fails we still dispatch.
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } catch {}

    // ── Dispatch ────────────────────────────────────────
    await this.dispatchToAgent(mailbox, {
      messageId,
      threadId,
      from: { name: fromName, email: fromEmail },
      to: toList.map((a: any) => a?.address).filter(Boolean).join(', '),
      cc: ccList.map((a: any) => a?.address).filter(Boolean).join(', '),
      subject,
      body: text,
      html,
      date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
      inReplyTo: env.inReplyTo || '',
      references: '',
      snippet: (text || '').slice(0, 200),
      labelIds: flags,
      hasAttachments: this.hasAttachments(msg.bodyStructure),
    });

    mailbox.totalDispatched++;
    mailbox.lastDispatchAt = new Date().toISOString();
  }

  private async extractBody(client: any, uid: number, structure: any): Promise<{ text: string; html: string }> {
    if (!structure) return { text: '', html: '' };

    // Find the first text/plain and text/html parts.
    const find = (node: any, type: string, subtype: string): any => {
      if (!node) return null;
      if (String(node.type || '').toLowerCase() === type && String(node.subtype || '').toLowerCase() === subtype) {
        return node;
      }
      const children = node.childNodes || [];
      for (const child of children) {
        const hit = find(child, type, subtype);
        if (hit) return hit;
      }
      return null;
    };

    const downloadPart = async (part: string): Promise<string> => {
      try {
        const dl: any = await client.download(String(uid), part, { uid: true });
        if (!dl) return '';
        // imapflow's download returns { content: Readable, meta: ... }
        const stream = dl.content;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        return Buffer.concat(chunks).toString('utf8');
      } catch {
        return '';
      }
    };

    const plain = find(structure, 'text', 'plain');
    const html = find(structure, 'text', 'html');

    let text = plain ? await downloadPart(plain.part || '1') : '';
    let htmlBody = html ? await downloadPart(html.part || '1') : '';

    // If we only got HTML, derive a plain-text fallback so downstream
    // agents always have a body field. Tag-strip is intentionally crude;
    // good enough for short replies.
    if (!text && htmlBody) {
      text = htmlBody
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|li)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    return { text, html: htmlBody };
  }

  private hasAttachments(structure: any): boolean {
    if (!structure) return false;
    if (String(structure.disposition || '').toLowerCase() === 'attachment') return true;
    const children = structure.childNodes || [];
    for (const child of children) {
      if (this.hasAttachments(child)) return true;
    }
    return false;
  }

  // ─── Dispatch ────────────────────────────────────────

  private async dispatchToAgent(mailbox: ImapMailbox, email: any): Promise<void> {
    const url = `http://${mailbox.host}:${mailbox.port}/api/runtime/email`;
    const _rtSecret = process.env.AGENT_RUNTIME_SECRET || process.env.RUNTIME_SECRET || '';
    const _hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_rtSecret) _hdrs['x-agent-internal-key'] = _rtSecret;

    const resp = await fetch(url, {
      method: 'POST',
      headers: _hdrs,
      body: JSON.stringify({
        source: 'imap',
        agentId: mailbox.agentId,
        ...email,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      // Don't advance lastUid on dispatch failure — handled by caller
      // throwing, which surfaces to the circuit breaker.
      throw new Error(`Agent dispatch returned ${resp.status}: ${text.slice(0, 100)}`);
    }
  }

  // ─── Circuit breaker ─────────────────────────────────

  private handlePollError(mailbox: ImapMailbox, error: Error): void {
    mailbox.consecutiveFailures++;
    mailbox.lastError = error.message;

    if (mailbox.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      mailbox.circuitOpen = true;
      mailbox.backoffMs = Math.min(
        mailbox.backoffMs ? mailbox.backoffMs * 2 : INITIAL_BACKOFF,
        MAX_BACKOFF,
      );
      mailbox.nextPollAfter = Date.now() + mailbox.backoffMs;
      console.warn(`[imap-poller] ${mailbox.agentName}: circuit OPEN (${mailbox.consecutiveFailures} failures), backoff ${mailbox.backoffMs / 1000}s`);
    } else {
      console.warn(`[imap-poller] ${mailbox.agentName}: poll error (${mailbox.consecutiveFailures}/${CIRCUIT_BREAKER_THRESHOLD}): ${error.message.slice(0, 100)}`);
    }
  }

  private resetCircuitBreaker(mailbox: ImapMailbox): void {
    if (mailbox.consecutiveFailures > 0 || mailbox.circuitOpen) {
      if (mailbox.circuitOpen) {
        console.log(`[imap-poller] ${mailbox.agentName}: circuit CLOSED (recovered)`);
      }
      mailbox.consecutiveFailures = 0;
      mailbox.backoffMs = 0;
      mailbox.nextPollAfter = 0;
      mailbox.circuitOpen = false;
    }
  }

  // ─── State persistence ───────────────────────────────

  private async loadState(): Promise<void> {
    try {
      const rows = await this.config.engineDb.query(
        `SELECT value FROM engine_settings WHERE key = 'imap_poller_state'`,
      );
      if (!rows?.[0]) return;
      const state: ImapPollerState = JSON.parse((rows[0] as any).value);
      let restored = 0;
      for (const [agentId, saved] of Object.entries(state.mailboxes || {})) {
        const mailbox = this.mailboxes.get(agentId);
        if (!mailbox) continue;
        mailbox.uidvalidity = saved.uidvalidity || 0;
        mailbox.lastUid = saved.lastUid || 0;
        restored++;
      }
      if (restored > 0) {
        console.log(`[imap-poller] Restored state for ${restored} mailbox(es) (saved: ${state.savedAt})`);
      }
    } catch {
      // fresh start
    }
  }

  private async saveState(): Promise<void> {
    const mailboxes: ImapPollerState['mailboxes'] = {};
    for (const [agentId, mailbox] of this.mailboxes) {
      mailboxes[agentId] = {
        uidvalidity: mailbox.uidvalidity,
        lastUid: mailbox.lastUid,
        lastPollAt: mailbox.lastPollAt,
      };
    }
    const state: ImapPollerState = {
      mailboxes,
      savedAt: new Date().toISOString(),
    };
    try {
      await this.config.engineDb.execute(
        `INSERT INTO engine_settings (key, value, updated_at) VALUES ($1, $2, now()::text)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()::text`,
        ['imap_poller_state', JSON.stringify(state)],
      );
    } catch (e: any) {
      // engine_settings may not support ON CONFLICT in all backends —
      // fall back to UPDATE then INSERT.
      try {
        await this.config.engineDb.execute(
          `UPDATE engine_settings SET value = $1, updated_at = now()::text WHERE key = $2`,
          [JSON.stringify(state), 'imap_poller_state'],
        );
        await this.config.engineDb.execute(
          `INSERT INTO engine_settings (key, value, updated_at)
             SELECT $1, $2, now()::text
             WHERE NOT EXISTS (SELECT 1 FROM engine_settings WHERE key = $1)`,
          ['imap_poller_state', JSON.stringify(state)],
        );
      } catch (inner: any) {
        console.warn(`[imap-poller] state save failed: ${inner.message}`);
      }
    }
  }

  // ─── Observability ───────────────────────────────────

  getStats() {
    return {
      running: this.running,
      pollCount: this.pollCount,
      mailboxes: [...this.mailboxes.values()].map(m => ({
        agentId: m.agentId,
        agentName: m.agentName,
        agentEmail: m.agentEmail,
        sendAsAlias: m.sendAsAlias,
        uidvalidity: m.uidvalidity,
        lastUid: m.lastUid,
        totalPolled: m.totalPolled,
        totalDispatched: m.totalDispatched,
        lastPollAt: m.lastPollAt,
        lastDispatchAt: m.lastDispatchAt,
        lastError: m.lastError,
        circuitOpen: m.circuitOpen,
      })),
    };
  }
}

export default ImapEmailPoller;
