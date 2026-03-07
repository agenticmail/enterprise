/**
 * Centralized Gmail Email Poller
 *
 * Enterprise-grade email polling engine that monitors Gmail inboxes for all agents
 * from a single process. Replaces per-agent polling in cli-agent.ts.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │                  EmailPoller                        │
 *   │  ┌───────────────────────────────────────────────┐  │
 *   │  │  Agent Mailbox 1 (Fola)                       │  │
 *   │  │  - Gmail History API → delta detection        │  │
 *   │  │  - historyId cursor (DB-persisted)            │  │
 *   │  │  - processedIds set (DB-persisted, capped)    │  │
 *   │  │  - circuit breaker (per-agent)                │  │
 *   │  └───────────────────────────────────────────────┘  │
 *   │  ┌───────────────────────────────────────────────┐  │
 *   │  │  Agent Mailbox 2 (John)                       │  │
 *   │  │  - Same structure                             │  │
 *   │  └───────────────────────────────────────────────┘  │
 *   │                                                     │
 *   │  Dispatch: HTTP POST to agent process               │
 *   │  State: DB-persisted in engine_settings             │
 *   │  Token: OAuth refresh per-agent                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * Key features:
 *   - Gmail History API for efficient delta detection (no full inbox scans)
 *   - Automatic fallback to list+filter when historyId expires (404)
 *   - Per-agent circuit breaker with exponential backoff
 *   - DB-persisted state (cursors, processedIds) survives restarts
 *   - Gmail 404 retry for recently-created messages (race condition)
 *   - ProcessedIds cap with LRU trimming (keeps last 2000)
 *   - Token refresh with retry and lifecycle persistence
 *   - Staggered per-agent polling to spread API load
 *   - Graceful shutdown with state save
 */

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';
const DEFAULT_INTERVAL = 30_000; // 30s between polls
const MAX_PROCESSED_IDS = 2000;
const TRIM_TO = 1500;
const MAX_HISTORY_MESSAGES = 100; // Safety cap per poll cycle
const MESSAGE_READ_RETRY_DELAY = 2000; // 2s wait before retrying 404
const MESSAGE_READ_MAX_RETRIES = 2;
const STATE_SAVE_INTERVAL = 5; // Save state every N polls
const INITIAL_BACKOFF = 30_000; // 30s
const MAX_BACKOFF = 300_000; // 5 min
const CIRCUIT_BREAKER_THRESHOLD = 5; // consecutive failures before circuit opens

// ─── Types ──────────────────────────────────────────

export interface EmailPollerConfig {
  /** Engine DB for state persistence */
  engineDb: EngineDB;
  /** Lifecycle manager for agent config + token persistence */
  lifecycle: any;
  /** Interval between poll cycles (ms) */
  intervalMs?: number;
  /** Known standalone agent ports (agentId → port) */
  agentPorts?: Record<string, number>;
  /** Workforce manager for work hours enforcement */
  workforce?: any;
}

interface EngineDB {
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<void>;
}

interface AgentMailbox {
  agentId: string;
  agentName: string;
  agentEmail: string;
  port: number; // Standalone agent HTTP port
  host: string;

  // Gmail state
  historyId: string;
  processedIds: Set<string>;
  useHistoryApi: boolean;

  // OAuth
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRefreshToken: string;
  accessToken: string;
  tokenExpiry: string;

  // Circuit breaker
  consecutiveFailures: number;
  backoffMs: number;
  nextPollAfter: number; // timestamp
  circuitOpen: boolean;

  // Stats
  totalPolled: number;
  totalDispatched: number;
  lastPollAt: string;
  lastError: string;
  lastDispatchAt: string;
}

interface PollerState {
  mailboxes: Record<string, {
    historyId: string;
    processedIds: string[]; // Last MAX_PROCESSED_IDS
    lastPollAt: string;
  }>;
  savedAt: string;
}

// ─── EmailPoller ────────────────────────────────────

export class EmailPoller {
  private config: EmailPollerConfig;
  private mailboxes: Map<string, AgentMailbox> = new Map();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollCount = 0;
  private shuttingDown = false;

  constructor(config: EmailPollerConfig) {
    this.config = config;
  }

  // ─── Lifecycle ──────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('[email-poller] Initializing...');

    // Discover email-enabled agents
    await this.discoverMailboxes();

    // Load persisted state (must be after discoverMailboxes)
    await this.loadState();

    if (this.mailboxes.size === 0) {
      console.log('[email-poller] No email-enabled agents found, will retry on next discovery');
    } else {
      console.log(`[email-poller] Monitoring ${this.mailboxes.size} mailbox(es): ${[...this.mailboxes.values()].map(m => `${m.agentName} <${m.agentEmail}>`).join(', ')}`);
    }

    // Connect all mailboxes (get initial historyId, validate tokens)
    await this.connectAll();

    const interval = this.config.intervalMs || DEFAULT_INTERVAL;
    console.log(`[email-poller] ✅ Started (interval: ${interval / 1000}s)`);

    // Staggered first poll — spread agents across the interval
    const stagger = Math.floor(interval / Math.max(this.mailboxes.size, 1));
    let delay = 3000; // First poll after 3s
    for (const [, mailbox] of this.mailboxes) {
      setTimeout(() => this.pollMailbox(mailbox), delay);
      delay += stagger;
    }

    // Regular poll loop
    this.pollTimer = setInterval(() => this.pollAll(), interval);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.shuttingDown = true;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Save final state
    await this.saveState().catch(e => console.warn(`[email-poller] Failed to save state on shutdown: ${e.message}`));

    console.log('[email-poller] Stopped');
  }

  // ─── Discovery ──────────────────────────────────────

  private async discoverMailboxes(): Promise<void> {
    const allAgents = this.config.lifecycle.getAllAgents();

    // Load standalone agent ports from DB
    let agentPorts: Record<string, number> = { ...this.config.agentPorts };
    try {
      const rows = await this.config.engineDb.query(
        `SELECT value FROM engine_settings WHERE key = 'standalone_agents'`
      );
      if (rows?.[0]) {
        const sa = JSON.parse((rows[0] as any).value);
        for (const a of sa) agentPorts[a.id] = a.port;
      }
    } catch {}

    for (const agent of allAgents) {
      const emailConfig = agent.config?.emailConfig;
      if (!emailConfig) continue;

      // Must have Gmail OAuth (oauthProvider === 'google' or provider detection)
      const providerType = emailConfig.provider || (emailConfig.oauthProvider === 'google' ? 'google' : emailConfig.oauthProvider);
      if (providerType !== 'google') continue; // This poller is Gmail-specific

      // Must have OAuth credentials
      if (!emailConfig.oauthRefreshToken || !emailConfig.oauthClientId || !emailConfig.oauthClientSecret) continue;

      const agentEmail = emailConfig.email || agent.config?.email?.address || '';
      const dep = agent.config?.deployment;
      const port = agentPorts[agent.id] || dep?.port || dep?.config?.local?.port || 3100;

      this.mailboxes.set(agent.id, {
        agentId: agent.id,
        agentName: agent.config?.displayName || agent.config?.name || agent.name || 'Unknown',
        agentEmail,
        port,
        host: 'localhost',

        historyId: '',
        processedIds: new Set(),
        useHistoryApi: false, // Set after connect

        oauthClientId: emailConfig.oauthClientId,
        oauthClientSecret: emailConfig.oauthClientSecret,
        oauthRefreshToken: emailConfig.oauthRefreshToken,
        accessToken: emailConfig.oauthAccessToken || '',
        tokenExpiry: emailConfig.oauthTokenExpiry || '',

        consecutiveFailures: 0,
        backoffMs: 0,
        nextPollAfter: 0,
        circuitOpen: false,

        totalPolled: 0,
        totalDispatched: 0,
        lastPollAt: '',
        lastError: '',
        lastDispatchAt: '',
      });
    }

    console.log(`[email-poller] Discovered ${this.mailboxes.size} Gmail-enabled agent(s)`);
  }

  // ─── Connection ─────────────────────────────────────

  private async connectAll(): Promise<void> {
    for (const [, mailbox] of this.mailboxes) {
      try {
        await this.connectMailbox(mailbox);
      } catch (e: any) {
        console.warn(`[email-poller] ${mailbox.agentName}: connection failed — ${e.message}`);
        mailbox.lastError = e.message;
      }
    }
  }

  private async connectMailbox(mailbox: AgentMailbox): Promise<void> {
    // Refresh token
    const _token = await this.refreshToken(mailbox);

    // Get profile + historyId
    const profile = await this.gmailFetch(mailbox, '/profile');
    const apiHistoryId = profile.historyId || '';

    // Only overwrite historyId if we don't have a persisted one
    // (persisted one is more recent from last poll)
    if (!mailbox.historyId && apiHistoryId) {
      mailbox.historyId = apiHistoryId;
    }

    mailbox.useHistoryApi = !!mailbox.historyId;

    // Load existing inbox to seed processedIds (only if no persisted state)
    if (mailbox.processedIds.size === 0) {
      try {
        const data = await this.gmailFetch(mailbox, '/messages?labelIds=INBOX&maxResults=50');
        for (const msg of (data.messages || [])) {
          mailbox.processedIds.add(msg.id);
        }
        console.log(`[email-poller] ${mailbox.agentName}: seeded ${mailbox.processedIds.size} existing messages`);
      } catch {}
    }

    // Also load persisted processedIds from agent_memory
    try {
      const prev = await this.config.engineDb.query(
        `SELECT content FROM agent_memory WHERE agent_id = $1 AND category = 'processed_email'`,
        [mailbox.agentId]
      );
      if (prev) {
        let restored = 0;
        for (const row of prev) {
          if (!mailbox.processedIds.has((row as any).content)) {
            mailbox.processedIds.add((row as any).content);
            restored++;
          }
        }
        if (restored > 0) console.log(`[email-poller] ${mailbox.agentName}: restored ${restored} processed IDs from agent_memory`);
      }
    } catch {}

    console.log(`[email-poller] ${mailbox.agentName}: connected (historyId: ${mailbox.historyId}, processedIds: ${mailbox.processedIds.size})`);
  }

  // ─── Token Management ───────────────────────────────

  private async refreshToken(mailbox: AgentMailbox): Promise<string> {
    // Check if current token is still valid (with 5min buffer)
    if (mailbox.accessToken && mailbox.tokenExpiry) {
      const expiry = new Date(mailbox.tokenExpiry).getTime();
      if (Date.now() < expiry - 300_000) {
        return mailbox.accessToken;
      }
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: mailbox.oauthClientId,
        client_secret: mailbox.oauthClientSecret,
        refresh_token: mailbox.oauthRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await res.json() as any;
    if (!data.access_token) {
      throw new Error(`Token refresh failed: ${data.error || 'unknown'}`);
    }

    mailbox.accessToken = data.access_token;
    if (data.expires_in) {
      mailbox.tokenExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
    }

    // Persist refreshed token to lifecycle
    try {
      const agent = this.config.lifecycle.getAgent(mailbox.agentId);
      if (agent?.config?.emailConfig) {
        agent.config.emailConfig.oauthAccessToken = data.access_token;
        if (data.expires_in) {
          agent.config.emailConfig.oauthTokenExpiry = mailbox.tokenExpiry;
        }
        this.config.lifecycle.saveAgent(mailbox.agentId).catch(() => {});
      }
    } catch {}

    return data.access_token;
  }

  // ─── Gmail API ──────────────────────────────────────

  private async gmailFetch(mailbox: AgentMailbox, path: string, opts?: RequestInit): Promise<any> {
    // Ensure fresh token
    await this.refreshToken(mailbox);

    const res = await fetch(`${GMAIL_BASE}/users/me${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${mailbox.accessToken}`,
        'Content-Type': 'application/json',
        ...opts?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gmail API ${res.status}: ${text.slice(0, 200)}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  // ─── Polling ────────────────────────────────────────

  private async pollAll(): Promise<void> {
    if (this.shuttingDown) return;
    this.pollCount++;

    for (const [, mailbox] of this.mailboxes) {
      if (this.shuttingDown) return;

      // Circuit breaker check
      if (mailbox.circuitOpen && Date.now() < mailbox.nextPollAfter) {
        continue; // Skip this mailbox until backoff expires
      }

      try {
        await this.pollMailbox(mailbox);
        this.resetCircuitBreaker(mailbox);
      } catch (e: any) {
        this.handlePollError(mailbox, e);
      }
    }

    // Periodic state save
    if (this.pollCount % STATE_SAVE_INTERVAL === 0) {
      await this.saveState().catch(e => console.warn(`[email-poller] State save failed: ${e.message}`));
    }
  }

  private async pollMailbox(mailbox: AgentMailbox): Promise<void> {
    mailbox.lastPollAt = new Date().toISOString();
    mailbox.totalPolled++;

    let newMessageIds: string[] = [];

    if (mailbox.useHistoryApi && mailbox.historyId) {
      // ── Primary: Gmail History API ──
      try {
        newMessageIds = await this.pollViaHistory(mailbox);
      } catch (e: any) {
        if (e.message.includes('404') || e.message.includes('historyId')) {
          // historyId expired — fall back to list, then re-seed historyId
          console.warn(`[email-poller] ${mailbox.agentName}: historyId expired, falling back to list`);
          newMessageIds = await this.pollViaList(mailbox);
          // Re-fetch profile to get new historyId
          try {
            const profile = await this.gmailFetch(mailbox, '/profile');
            if (profile.historyId) mailbox.historyId = profile.historyId;
          } catch {}
        } else if (e.message.includes('401')) {
          // Token expired — refresh and retry once
          await this.refreshToken(mailbox);
          newMessageIds = await this.pollViaHistory(mailbox);
        } else {
          throw e; // Unexpected error — let circuit breaker handle
        }
      }
    } else {
      // ── Fallback: List-based polling ──
      newMessageIds = await this.pollViaList(mailbox);
    }

    if (newMessageIds.length === 0) return;

    console.log(`[email-poller] ${mailbox.agentName}: ${newMessageIds.length} new message(s)`);

    // Process each new message
    for (const msgId of newMessageIds) {
      if (this.shuttingDown) return;
      mailbox.processedIds.add(msgId);

      try {
        await this.processMessage(mailbox, msgId);
      } catch (e: any) {
        console.warn(`[email-poller] ${mailbox.agentName}: failed to process ${msgId}: ${e.message.slice(0, 100)}`);
        // Don't remove from processedIds — avoid infinite retry loop
        // The session failure callback will handle retry if needed
      }
    }

    // Trim processedIds
    if (mailbox.processedIds.size > MAX_PROCESSED_IDS) {
      const arr = [...mailbox.processedIds];
      mailbox.processedIds = new Set(arr.slice(arr.length - TRIM_TO));
    }
  }

  // ─── History API Polling ────────────────────────────

  private async pollViaHistory(mailbox: AgentMailbox): Promise<string[]> {
    const data = await this.gmailFetch(
      mailbox,
      `/history?startHistoryId=${mailbox.historyId}&historyTypes=messageAdded&labelId=INBOX&maxResults=${MAX_HISTORY_MESSAGES}`
    );

    // Always update historyId (even if no new messages)
    if (data.historyId) mailbox.historyId = data.historyId;

    const newIds: string[] = [];
    for (const h of (data.history || [])) {
      for (const added of (h.messagesAdded || [])) {
        const id = added.message?.id;
        if (id && !mailbox.processedIds.has(id)) {
          newIds.push(id);
        }
      }
    }

    return newIds.slice(0, MAX_HISTORY_MESSAGES); // Safety cap
  }

  // ─── List-based Polling (Fallback) ──────────────────

  private async pollViaList(mailbox: AgentMailbox): Promise<string[]> {
    // List recent inbox messages
    const data = await this.gmailFetch(mailbox, '/messages?labelIds=INBOX&maxResults=20');
    const allIds = (data.messages || []).map((m: any) => m.id);

    // Filter to unprocessed
    const newIds = allIds.filter((id: string) => !mailbox.processedIds.has(id));

    // Update historyId from a fresh profile call (so next poll uses History API)
    if (!mailbox.historyId) {
      try {
        const profile = await this.gmailFetch(mailbox, '/profile');
        if (profile.historyId) {
          mailbox.historyId = profile.historyId;
          mailbox.useHistoryApi = true;
        }
      } catch {}
    }

    return newIds;
  }

  // ─── Message Processing ─────────────────────────────

  private async processMessage(mailbox: AgentMailbox, msgId: string): Promise<void> {
    // Read full message (with retry for 404 race condition)
    const fullMsg = await this.readMessageWithRetry(mailbox, msgId);
    if (!fullMsg) return; // Permanently failed

    const from = this.extractFrom(fullMsg);
    const subject = this.getHeader(fullMsg, 'Subject');

    // Skip emails from the agent itself
    if (from.email.toLowerCase() === mailbox.agentEmail.toLowerCase()) return;

    // Skip drafts (no From header or has DRAFT label)
    if (!from.email || (fullMsg.labelIds || []).includes('DRAFT')) return;

    // ── Work hours enforcement ──
    // Only manager emails bypass off-hours restriction
    if (this.config.workforce) {
      const { onDuty, reason } = this.config.workforce.shouldBeWorking(mailbox.agentId);
      if (!onDuty) {
        const managerEmail = this.config.workforce.getManagerEmail(mailbox.agentId);
        const isFromManager = managerEmail && from.email.toLowerCase() === managerEmail.toLowerCase();
        if (!isFromManager) {
          console.log(`[email-poller] ${mailbox.agentName}: SKIPPED email from ${from.email} — ${reason}. Only manager can wake agent off-hours.`);
          // Still mark as processed so we don't retry, but don't dispatch
          await this.persistProcessedId(mailbox, msgId, subject);
          return;
        }
        console.log(`[email-poller] ${mailbox.agentName}: off-hours but manager email — waking agent`);
      }
    }

    console.log(`[email-poller] ${mailbox.agentName}: new email from ${from.email}: "${subject}"`);

    // Mark as read
    try {
      await this.gmailFetch(mailbox, `/messages/${msgId}/modify`, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    } catch {}

    // Persist processed ID to agent_memory (survives restarts)
    await this.persistProcessedId(mailbox, msgId, subject);

    // Extract body
    const body = this.extractBody(fullMsg);

    // Dispatch to agent process
    await this.dispatchToAgent(mailbox, {
      messageId: msgId,
      threadId: fullMsg.threadId,
      from,
      to: this.getHeader(fullMsg, 'To'),
      cc: this.getHeader(fullMsg, 'Cc'),
      subject,
      body,
      html: this.extractHtml(fullMsg),
      date: this.getHeader(fullMsg, 'Date'),
      inReplyTo: this.getHeader(fullMsg, 'In-Reply-To'),
      references: this.getHeader(fullMsg, 'References'),
      snippet: fullMsg.snippet || '',
      labelIds: fullMsg.labelIds || [],
      hasAttachments: this.hasAttachments(fullMsg),
    });

    mailbox.totalDispatched++;
    mailbox.lastDispatchAt = new Date().toISOString();
  }

  private async readMessageWithRetry(mailbox: AgentMailbox, msgId: string): Promise<any | null> {
    for (let attempt = 0; attempt <= MESSAGE_READ_MAX_RETRIES; attempt++) {
      try {
        return await this.gmailFetch(mailbox, `/messages/${msgId}?format=full`);
      } catch (e: any) {
        if (e.message.includes('404') && attempt < MESSAGE_READ_MAX_RETRIES) {
          // Gmail 404 race — message exists in history but not yet readable
          console.log(`[email-poller] ${mailbox.agentName}: message ${msgId} not found (attempt ${attempt + 1}), retrying...`);
          await new Promise(r => setTimeout(r, MESSAGE_READ_RETRY_DELAY * (attempt + 1)));
          continue;
        }
        if (e.message.includes('404')) {
          console.warn(`[email-poller] ${mailbox.agentName}: message ${msgId} permanently not found, skipping`);
          return null;
        }
        throw e;
      }
    }
    return null;
  }

  // ─── Dispatch to Agent Process ──────────────────────

  private async dispatchToAgent(mailbox: AgentMailbox, email: any): Promise<void> {
    const url = `http://${mailbox.host}:${mailbox.port}/api/runtime/email`;

    try {
      const _rtSecret = process.env.AGENT_RUNTIME_SECRET || process.env.RUNTIME_SECRET || '';
      const _hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
      if (_rtSecret) _hdrs['x-agent-internal-key'] = _rtSecret;
      const resp = await fetch(url, {
        method: 'POST',
        headers: _hdrs,
        body: JSON.stringify({
          source: 'gmail',
          agentId: mailbox.agentId,
          ...email,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Agent returned ${resp.status}: ${text.slice(0, 100)}`);
      }
    } catch (e: any) {
      // If agent is unreachable, log but don't remove from processedIds
      // (agent will get the email when it comes back online via re-poll)
      console.warn(`[email-poller] ${mailbox.agentName}: dispatch failed to ${mailbox.host}:${mailbox.port}: ${e.message}`);
      // Remove from processed so it retries next poll
      mailbox.processedIds.delete(email.messageId);
      throw e;
    }
  }

  // ─── Circuit Breaker ────────────────────────────────

  private handlePollError(mailbox: AgentMailbox, error: Error): void {
    mailbox.consecutiveFailures++;
    mailbox.lastError = error.message;

    if (mailbox.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      mailbox.circuitOpen = true;
      mailbox.backoffMs = Math.min(
        mailbox.backoffMs ? mailbox.backoffMs * 2 : INITIAL_BACKOFF,
        MAX_BACKOFF
      );
      mailbox.nextPollAfter = Date.now() + mailbox.backoffMs;
      console.warn(`[email-poller] ${mailbox.agentName}: circuit OPEN (${mailbox.consecutiveFailures} failures), backoff ${mailbox.backoffMs / 1000}s`);
    } else {
      console.warn(`[email-poller] ${mailbox.agentName}: poll error (${mailbox.consecutiveFailures}/${CIRCUIT_BREAKER_THRESHOLD}): ${error.message.slice(0, 100)}`);
    }
  }

  private resetCircuitBreaker(mailbox: AgentMailbox): void {
    if (mailbox.consecutiveFailures > 0 || mailbox.circuitOpen) {
      if (mailbox.circuitOpen) {
        console.log(`[email-poller] ${mailbox.agentName}: circuit CLOSED (recovered)`);
      }
      mailbox.consecutiveFailures = 0;
      mailbox.backoffMs = 0;
      mailbox.nextPollAfter = 0;
      mailbox.circuitOpen = false;
    }
  }

  // ─── State Persistence ──────────────────────────────

  private async loadState(): Promise<void> {
    try {
      const rows = await this.config.engineDb.query(
        `SELECT value FROM engine_settings WHERE key = 'email_poller_state'`
      );
      if (!rows?.[0]) return;

      const state: PollerState = JSON.parse((rows[0] as any).value);
      let restored = 0;

      for (const [agentId, saved] of Object.entries(state.mailboxes || {})) {
        const mailbox = this.mailboxes.get(agentId);
        if (!mailbox) continue;

        if (saved.historyId) mailbox.historyId = saved.historyId;
        if (saved.processedIds) {
          for (const id of saved.processedIds) mailbox.processedIds.add(id);
        }
        mailbox.useHistoryApi = !!mailbox.historyId;
        restored++;
      }

      if (restored > 0) {
        console.log(`[email-poller] Restored state for ${restored} mailbox(es) (saved: ${state.savedAt})`);
      }
    } catch {
      // Fresh start
    }
  }

  private async saveState(): Promise<void> {
    const mailboxes: PollerState['mailboxes'] = {};

    for (const [agentId, mailbox] of this.mailboxes) {
      mailboxes[agentId] = {
        historyId: mailbox.historyId,
        processedIds: [...mailbox.processedIds].slice(-MAX_PROCESSED_IDS),
        lastPollAt: mailbox.lastPollAt,
      };
    }

    const state: PollerState = {
      mailboxes,
      savedAt: new Date().toISOString(),
    };

    try {
      await this.config.engineDb.execute(
        `INSERT INTO engine_settings (key, value) VALUES ('email_poller_state', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [JSON.stringify(state)]
      );
    } catch (e: any) {
      // Auto-create table if missing (fresh install)
      if (e.message?.includes('does not exist') || e.message?.includes('no such table')) {
        try {
          await this.config.engineDb.execute(`CREATE TABLE IF NOT EXISTS engine_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
          await this.config.engineDb.execute(
            `INSERT INTO engine_settings (key, value) VALUES ('email_poller_state', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
            [JSON.stringify(state)]
          );
          return;
        } catch { /* ignore */ }
      }
      console.warn(`[email-poller] Failed to save state: ${e.message}`);
    }
  }

  private async persistProcessedId(mailbox: AgentMailbox, msgId: string, subject: string): Promise<void> {
    try {
      const ts = new Date().toISOString();
      const orgRows = await this.config.engineDb.query(
        `SELECT org_id FROM managed_agents WHERE id = $1`, [mailbox.agentId]
      );
      const orgId = orgRows?.[0]?.org_id || '';

      await this.config.engineDb.execute(
        `INSERT INTO agent_memory (id, agent_id, org_id, category, title, content, source, importance, confidence, access_count, tags, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [crypto.randomUUID(), mailbox.agentId, orgId, 'processed_email',
         `Processed: ${(subject || msgId).slice(0, 200)}`, msgId, 'system', 'low', 1.0, 0, '[]', '{}', ts, ts]
      );
    } catch {}
  }

  // ─── Gmail Helpers ──────────────────────────────────

  private getHeader(msg: any, name: string): string {
    const headers = msg.payload?.headers || [];
    const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    return h?.value || '';
  }

  private extractFrom(msg: any): { name: string; email: string } {
    const from = this.getHeader(msg, 'From');
    const match = from.match(/^(.*?)\s*<(.+?)>$/);
    if (match) {
      return { name: match[1].replace(/"/g, '').trim(), email: match[2] };
    }
    return { name: '', email: from };
  }

  private extractBody(msg: any): string {
    let body = '';
    const extract = (payload: any) => {
      if (payload.mimeType === 'text/plain' && payload.body?.data) {
        body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      }
      if (payload.parts) payload.parts.forEach(extract);
    };
    if (msg.payload) extract(msg.payload);
    return body;
  }

  private extractHtml(msg: any): string {
    let html = '';
    const extract = (payload: any) => {
      if (payload.mimeType === 'text/html' && payload.body?.data) {
        html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      }
      if (payload.parts) payload.parts.forEach(extract);
    };
    if (msg.payload) extract(msg.payload);
    return html;
  }

  private hasAttachments(msg: any): boolean {
    const check = (payload: any): boolean => {
      if (payload.filename && payload.body?.attachmentId) return true;
      if (payload.parts) return payload.parts.some(check);
      return false;
    };
    return msg.payload ? check(msg.payload) : false;
  }

  // ─── Public API ─────────────────────────────────────

  getStatus(): Record<string, any> {
    const mailboxes: any[] = [];
    for (const [, m] of this.mailboxes) {
      mailboxes.push({
        agentId: m.agentId,
        agentName: m.agentName,
        agentEmail: m.agentEmail,
        historyId: m.historyId,
        processedIds: m.processedIds.size,
        useHistoryApi: m.useHistoryApi,
        circuitOpen: m.circuitOpen,
        consecutiveFailures: m.consecutiveFailures,
        backoffMs: m.backoffMs,
        totalPolled: m.totalPolled,
        totalDispatched: m.totalDispatched,
        lastPollAt: m.lastPollAt,
        lastError: m.lastError,
        lastDispatchAt: m.lastDispatchAt,
      });
    }

    return {
      running: this.running,
      pollCount: this.pollCount,
      mailboxCount: this.mailboxes.size,
      mailboxes,
    };
  }

  /** Force re-discovery of agents (e.g. after new agent created) */
  async rediscover(): Promise<void> {
    const oldIds = new Set(this.mailboxes.keys());
    await this.discoverMailboxes();

    // Connect any new mailboxes
    for (const [id, mailbox] of this.mailboxes) {
      if (!oldIds.has(id)) {
        try {
          await this.connectMailbox(mailbox);
          console.log(`[email-poller] Added new mailbox: ${mailbox.agentName} <${mailbox.agentEmail}>`);
        } catch (e: any) {
          console.warn(`[email-poller] Failed to connect new mailbox ${mailbox.agentName}: ${e.message}`);
        }
      }
    }
  }
}
