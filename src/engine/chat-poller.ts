/**
 * Centralized Google Chat Poller
 *
 * ONE poller per enterprise server — polls all monitored spaces,
 * routes messages to the right agent via smart dispatch.
 *
 * Architecture:
 *   Google Chat API ← single poller (30s interval)
 *         │
 *    Smart Router (no LLM for 90% of messages)
 *         │
 *   ┌─────┼─────┐
 *   ▼     ▼     ▼
 * Agent1 Agent2 Agent3  ← via POST /api/runtime/chat
 *
 * Routing priority:
 *   1. Direct @mention → that agent
 *   2. Thread ownership → whoever started the thread owns it
 *   3. DM → space's assigned agent
 *   4. Role/keyword match → agent whose role matches
 *   5. Round-robin / default agent → fallback
 *
 * Scaling notes:
 *   - Single poller regardless of agent count
 *   - One API call per space per interval (not per agent)
 *   - Message dedup via DB-persisted cursor (last message name per space)
 *   - Circuit breaker on API failures (exponential backoff)
 *   - No LLM calls for routing — pure rule-based
 */

import type { AgentLifecycleManager } from './lifecycle.js';

// ─── Types ──────────────────────────────────────────────

interface ChatMessage {
  name: string;          // spaces/XXX/messages/YYY
  sender: {
    name?: string;       // users/123
    displayName?: string;
    email?: string;
    type?: 'HUMAN' | 'BOT';
  };
  text: string;
  createTime: string;
  thread?: { name?: string };
  space?: { name?: string; displayName?: string; type?: string };
  argumentText?: string; // text without @mention prefix
  annotations?: any[];   // Google Chat annotations (mentions, etc.)
}

interface MonitoredSpace {
  spaceId: string;       // spaces/XXX
  displayName: string;
  /** Agent IDs that are "members" of this space */
  agentIds: string[];
  /** Default agent for unrouted messages */
  defaultAgentId?: string;
  /** Last processed message name (cursor) */
  lastMessageName?: string;
  /** Last processed message timestamp */
  lastMessageTime?: string;
}

interface AgentEndpoint {
  id: string;
  name: string;
  displayName: string;
  email: string;         // agent's email — used to skip own messages
  port: number;
  host: string;
  roles: string[];       // e.g. ['calendar', 'email', 'general']
  keywords: string[];    // trigger keywords for routing
  enabled: boolean;
}

interface ChatPollerConfig {
  lifecycle: AgentLifecycleManager;
  getToken: () => Promise<string>;  // OAuth token for Chat API
  engineDb: any;
  /** Agent endpoints for forwarding */
  agents: AgentEndpoint[];
  /** Poll interval in ms (default: 30000) */
  intervalMs?: number;
  /** Max backoff on errors in ms (default: 300000 = 5 min) */
  maxBackoffMs?: number;
  /** Workforce manager for work hours enforcement */
  workforce?: any;
}

interface ThreadOwnership {
  threadName: string;
  agentId: string;
  lastActivity: number;
}

// ─── Constants ──────────────────────────────────────────

const CHAT_BASE = 'https://chat.googleapis.com/v1';
const DEFAULT_INTERVAL = 30_000;
const MAX_BACKOFF = 300_000;
const THREAD_OWNERSHIP_TTL = 24 * 60 * 60 * 1000; // 24h

// ─── Chat Poller Class ──────────────────────────────────

export class ChatPoller {
  private config: ChatPollerConfig;
  private spaces: Map<string, MonitoredSpace> = new Map();
  private threadOwners: Map<string, ThreadOwnership> = new Map();
  private processedMessages: Set<string> = new Set();
  private userEmailCache: Map<string, string> = new Map(); // users/123 → email
  private userDisplayNames: Map<string, string> = new Map(); // users/123 → display name
  private timer: ReturnType<typeof setInterval> | null = null;
  private backoffMs = 0;
  private consecutiveErrors = 0;
  private running = false;
  private pollCount = 0;

  constructor(config: ChatPollerConfig) {
    this.config = config;
  }

  // ─── Lifecycle ──────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Discover spaces to monitor (before loadState, so cursors can be restored)
    await this.discoverSpaces();

    // Load persisted state (cursors, thread ownership)
    await this.loadState();

    if (this.spaces.size === 0) {
      console.log('[chat-poller] No spaces to monitor. Will check again on next poll.');
    } else {
      console.log(`[chat-poller] Monitoring ${this.spaces.size} space(s): ${[...this.spaces.values()].map(s => s.displayName).join(', ')}`);
    }

    // Start polling loop
    const interval = this.config.intervalMs || DEFAULT_INTERVAL;
    console.log(`[chat-poller] ✅ Started (interval: ${interval / 1000}s)`);

    // Load manual user→email mappings from DB (for external spaces where API can't resolve)
    try {
      const rows = await this.config.engineDb.query(
        `SELECT value FROM engine_settings WHERE key = 'chat_user_mappings'`
      );
      if (rows?.[0]?.value) {
        const mappings = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        // Format: { "users/123": "email" } or { "users/123": { email: "...", displayName: "..." } }
        for (const [key, val] of Object.entries(mappings as Record<string, any>)) {
          const email = typeof val === 'string' ? val : val?.email;
          const displayName = typeof val === 'object' ? val?.displayName : undefined;
          if (email) this.userEmailCache.set(key, email);
          if (displayName) this.userDisplayNames.set(key, displayName);
        }
        console.log(`[chat-poller] Loaded ${Object.keys(mappings).length} manual user→email mapping(s)`);
      }
    } catch {}

    // Resolve user emails from space memberships (needs a token)
    try {
      const token = await this.config.getToken();
      await this.resolveSpaceMembers(token);
    } catch (err: any) {
      console.warn(`[chat-poller] Could not resolve member emails: ${err.message}`);
    }

    // If we have no persisted state, do a "catch-up" poll to mark existing messages as seen
    // This prevents replying to old messages on first startup
    const hadState = this.processedMessages.size > 0;
    if (!hadState && this.spaces.size > 0) {
      await this.catchUpExistingMessages().catch(err =>
        console.error(`[chat-poller] Catch-up error: ${err.message}`)
      );
    } else {
      // Normal first poll
      this.poll().catch(err => console.error(`[chat-poller] Initial poll error: ${err.message}`));
    }

    this.timer = setInterval(() => {
      if (this.backoffMs > 0) {
        this.backoffMs = Math.max(0, this.backoffMs - interval);
        if (this.backoffMs > 0) {
          console.log(`[chat-poller] Backing off (${Math.round(this.backoffMs / 1000)}s remaining)`);
          return;
        }
      }
      this.poll().catch(err => console.error(`[chat-poller] Poll error: ${err.message}`));
    }, interval);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.saveState().catch(() => {});
    console.log('[chat-poller] Stopped');
  }

  // ─── Space Management ───────────────────────────────

  /** Add a space to monitor */
  addSpace(space: MonitoredSpace): void {
    this.spaces.set(space.spaceId, space);
    console.log(`[chat-poller] Added space: ${space.displayName} (${space.spaceId}), agents: ${space.agentIds.join(', ')}`);
  }

  /** Remove a space from monitoring */
  removeSpace(spaceId: string): void {
    this.spaces.delete(spaceId);
  }

  /** Get monitoring status */
  getStatus(): { running: boolean; spaces: number; pollCount: number; consecutiveErrors: number; backoffMs: number } {
    return {
      running: this.running,
      spaces: this.spaces.size,
      pollCount: this.pollCount,
      consecutiveErrors: this.consecutiveErrors,
      backoffMs: this.backoffMs,
    };
  }

  // ─── Resolve User Emails via Space Members ───────────

  /** Pre-load user ID → email mappings from space membership lists */
  private async resolveSpaceMembers(token: string): Promise<void> {
    for (const [, space] of this.spaces) {
      try {
        const url = new URL(`${CHAT_BASE}/${space.spaceId}/members`);
        url.searchParams.set('pageSize', '100');
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const data = await res.json() as any;
        for (const m of (data.memberships || [])) {
          const userId = m.member?.name; // users/123456
          const email = m.member?.email || m.member?.domainId || '';
          const displayName = m.member?.displayName || '';
          if (userId && email) {
            this.userEmailCache.set(userId, email);
          }
          // Cache displayName for all users (even without email)
          if (userId && displayName) {
            this.userDisplayNames.set(userId, displayName);
          }
          // Also try People API for users without email
          if (userId && !email) {
            const personEmail = await this.resolveViaDirectory(token, userId).catch(() => '');
            if (personEmail) {
              this.userEmailCache.set(userId, personEmail);
            }
          }
          // Cache displayName → email mapping too (for agent filtering)
          if (displayName && email) {
            this.userEmailCache.set(`name:${displayName}`, email);
          }
        }
      } catch {}
    }
    if (this.userEmailCache.size > 0) {
      console.log(`[chat-poller] Resolved ${this.userEmailCache.size} user mapping(s) from space memberships`);
    }
  }

  /** 
   * Resolve email for a user ID using multiple strategies.
   * Works for both Workspace and external (Gmail) users.
   */
  private async resolveViaDirectory(token: string, userId: string): Promise<string> {
    const numericId = userId.replace('users/', '');

    // Strategy 1: People API (works for Workspace users)
    try {
      const res = await fetch(
        `https://people.googleapis.com/v1/people/${numericId}?personFields=emailAddresses`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) }
      );
      if (res.ok) {
        const data = await res.json() as any;
        const email = data.emailAddresses?.[0]?.value;
        if (email) return email;
      }
    } catch {}

    // Strategy 2: Check all monitored spaces for member details
    // Chat API returns member info including email for space members
    for (const space of this.spaces.values()) {
      try {
        const res = await fetch(
          `${CHAT_BASE}/${space.spaceId}/members?filter=member.type%3D%22HUMAN%22&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) }
        );
        if (!res.ok) continue;
        const data = await res.json() as any;
        for (const m of (data.memberships || [])) {
          const memberId = m.member?.name;
          const email = m.member?.email || '';
          const displayName = m.member?.displayName || '';
          if (memberId && email) {
            this.userEmailCache.set(memberId, email);
            if (displayName) this.userDisplayNames.set(memberId, displayName);
          }
          if (memberId === userId && email) return email;
        }
      } catch {}
    }

    // Strategy 3: Google Contacts / Other People connections
    try {
      const res = await fetch(
        `https://people.googleapis.com/v1/people:searchContacts?query=${numericId}&readMask=emailAddresses,names&pageSize=5`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) }
      );
      if (res.ok) {
        const data = await res.json() as any;
        const email = data.results?.[0]?.person?.emailAddresses?.[0]?.value;
        if (email) return email;
      }
    } catch {}

    return '';
  }

  /**
   * Lazy-resolve email for a sender on first encounter.
   * Called during message processing when cache misses.
   */
  private async lazyResolveEmail(userId: string): Promise<string> {
    // Already cached?
    if (this.userEmailCache.has(userId)) return this.userEmailCache.get(userId)!;
    
    try {
      const token = await this.config.getToken();
      const email = await this.resolveViaDirectory(token, userId);
      if (email) {
        this.userEmailCache.set(userId, email);
        console.log(`[chat-poller] Lazy-resolved ${userId} → ${email}`);
        return email;
      }
    } catch {}
    return '';
  }

  /** Look up email for a sender user ID */
  private resolveEmail(senderName: string, rawEmail: string): string {
    if (rawEmail) return rawEmail;
    // Check cache
    if (senderName && this.userEmailCache.has(senderName)) {
      return this.userEmailCache.get(senderName)!;
    }
    // Extract from users/email@domain format (sometimes used)
    if (senderName?.startsWith('users/') && senderName.includes('@')) {
      return senderName.replace('users/', '');
    }
    return '';
  }

  // ─── Initial Catch-Up (mark existing messages as seen) ──

  private async catchUpExistingMessages(): Promise<void> {
    let token: string;
    try {
      token = await this.config.getToken();
    } catch (err: any) {
      console.error(`[chat-poller] Catch-up token refresh failed: ${err.message}`);
      return;
    }

    for (const [, space] of this.spaces) {
      try {
        let totalMarked = 0;
        let pageToken: string | undefined;

        // Paginate through ALL messages to mark them as seen
        do {
          const url = new URL(`${CHAT_BASE}/${space.spaceId}/messages`);
          url.searchParams.set('pageSize', '1000');
          url.searchParams.set('orderBy', 'createTime desc');
          if (pageToken) url.searchParams.set('pageToken', pageToken);

          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) {
            console.warn(`[chat-poller] Catch-up failed for ${space.displayName}: ${res.status}`);
            break;
          }

          const data = await res.json() as any;
          const messages = data.messages || [];

          for (const m of messages) {
            if (m.name) this.processedMessages.add(m.name);
          }

          // Set cursor to the latest message (first page, first item = newest)
          if (totalMarked === 0 && messages.length > 0) {
            space.lastMessageName = messages[0].name;
            space.lastMessageTime = messages[0].createTime;
          }

          totalMarked += messages.length;
          pageToken = data.nextPageToken;

          // Safety: cap at 5000 messages
          if (totalMarked >= 5000) break;
        } while (pageToken);

        console.log(`[chat-poller] Catch-up: marked ${totalMarked} existing messages in ${space.displayName} as seen`);
      } catch (err: any) {
        console.warn(`[chat-poller] Catch-up error for ${space.displayName}: ${err.message}`);
      }
    }

    // Persist the initial state
    await this.saveState().catch(() => {});
  }

  // ─── Core Poll Loop ─────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running) return;
    this.pollCount++;

    // Re-discover spaces periodically (every 20 polls ≈ 10 min)
    if (this.pollCount % 20 === 0) {
      await this.discoverSpaces();
    }

    // Clean up expired thread ownership
    this.cleanThreadOwnership();

    let token: string;
    try {
      token = await this.config.getToken();
    } catch (err: any) {
      console.error(`[chat-poller] Token refresh failed: ${err.message}`);
      this.handleError();
      return;
    }

    let hadError = false;

    for (const [spaceId, space] of this.spaces) {
      try {
        await this.pollSpace(token, space);
      } catch (err: any) {
        console.error(`[chat-poller] Error polling ${space.displayName}: ${err.message}`);
        hadError = true;
      }
    }

    if (hadError) {
      this.handleError();
    } else {
      // Reset backoff on success
      this.consecutiveErrors = 0;
      this.backoffMs = 0;
    }

    // Persist state periodically (every 5 polls)
    if (this.pollCount % 5 === 0) {
      await this.saveState().catch(() => {});
    }
  }

  private async pollSpace(token: string, space: MonitoredSpace): Promise<void> {
    // Build filter: only messages after our cursor
    const query: Record<string, string> = {
      pageSize: '50',
      orderBy: 'createTime asc',
    };
    if (space.lastMessageTime) {
      // Fetch messages created after our last known time
      query.filter = `createTime > "${space.lastMessageTime}"`;
    }

    const url = new URL(`${CHAT_BASE}/${space.spaceId}/messages`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Chat API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const messages: ChatMessage[] = (data.messages || []).map((m: any) => {
      return {
      name: m.name,
      sender: {
        name: m.sender?.name,
        displayName: m.sender?.displayName || this.userDisplayNames.get(m.sender?.name || '') || '',
        // Resolve email from cache, domainId, or users/email@domain format
        email: this.resolveEmail(m.sender?.name, m.sender?.email || m.sender?.domainId || ''),
        type: m.sender?.type,
      },
      text: m.argumentText?.trim() || m.text?.trim() || '',
      annotations: m.annotations,  // preserve for mention detection
      createTime: m.createTime,
      thread: m.thread,
      space: m.space || { name: space.spaceId, displayName: space.displayName },
    };});

    if (messages.length === 0) return;
    if (this.pollCount <= 5) {
      console.log(`[chat-poller] ${space.displayName}: fetched ${messages.length} messages (poll #${this.pollCount}, cursor: ${space.lastMessageTime || 'none'})`);
    }

    // Build set of agent emails/names to skip (agents' own messages)
    const agentEmails = new Set(this.config.agents.map(a => a.email?.toLowerCase()).filter(Boolean));
    const agentDisplayNames = new Set(this.config.agents.map(a => a.displayName).filter(Boolean));

    // Process new messages (skip already-seen, bot messages, and agent's own messages)
    let newCount = 0;
    for (const msg of messages) {
      // Skip bot messages
      if (msg.sender.type === 'BOT') continue;

      // Skip messages FROM our own agents (they send via OAuth, look like humans)
      const senderEmail = (msg.sender.email || '').toLowerCase();
      const senderName = msg.sender.displayName || '';
      const senderUserId = msg.sender.name || '';
      if (senderEmail && agentEmails.has(senderEmail)) continue;
      if (senderName && agentDisplayNames.has(senderName)) continue;
      // Also check via user ID cache
      const cachedEmail = senderUserId ? this.userEmailCache.get(senderUserId) : '';
      if (cachedEmail && agentEmails.has(cachedEmail.toLowerCase())) continue;

      // Skip already processed
      if (this.processedMessages.has(msg.name)) continue;

      // Lazy-resolve email if still unknown
      if (!msg.sender.email && msg.sender.name) {
        const resolved = await this.lazyResolveEmail(msg.sender.name);
        if (resolved) {
          msg.sender.email = resolved;
          // Also try to get display name from cache
          if (!msg.sender.displayName || msg.sender.displayName === 'Unknown') {
            msg.sender.displayName = this.userDisplayNames.get(msg.sender.name) || msg.sender.displayName;
          }
        }
      }

      // Route and dispatch
      await this.routeMessage(msg, space);
      this.processedMessages.add(msg.name);
      newCount++;

      // Update cursor
      space.lastMessageName = msg.name;
      space.lastMessageTime = msg.createTime;
    }

    // Always update cursor to latest message time (even if all skipped)
    // so we don't re-fetch the same messages next poll
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (!space.lastMessageTime || last.createTime > space.lastMessageTime) {
        space.lastMessageName = last.name;
        space.lastMessageTime = last.createTime;
      }
    }

    if (newCount > 0) {
      console.log(`[chat-poller] ${space.displayName}: ${newCount} new message(s) processed`);
    }

    // Cap processedMessages set size (keep last 5000)
    if (this.processedMessages.size > 5000) {
      const arr = [...this.processedMessages];
      this.processedMessages = new Set(arr.slice(arr.length - 3000));
    }
  }

  // ─── Smart Message Router ───────────────────────────

  private async routeMessage(msg: ChatMessage, space: MonitoredSpace): Promise<void> {
    const agents = this.config.agents.filter(a => a.enabled && space.agentIds.includes(a.id));

    if (agents.length === 0) {
      console.warn(`[chat-poller] No active agents for space ${space.displayName}, dropping message`);
      return;
    }

    // ─── Priority 1: Direct @mention (check ALL space agents, not just enabled) ──
    // If someone @mentions a disabled agent, we still route to that agent (wake it up).
    const allSpaceAgents = this.config.agents.filter(a => space.agentIds.includes(a.id));
    console.log(`[chat-poller] Routing: text="${msg.text.slice(0,80)}", agents=[${allSpaceAgents.map(a => `${a.name}/${a.displayName}(${a.enabled?'on':'off'})`).join(', ')}], annotations=${JSON.stringify(msg.annotations?.length || 0)}`);
    const mentionedAgent = this.findMentionedAgent(msg.text, allSpaceAgents, msg.annotations);
    if (mentionedAgent) {
      // Record thread ownership
      if (msg.thread?.name) {
        this.threadOwners.set(msg.thread.name, {
          threadName: msg.thread.name,
          agentId: mentionedAgent.id,
          lastActivity: Date.now(),
        });
      }
      await this.dispatchToAgent(mentionedAgent, msg, space);
      return;
    }

    // If only one enabled agent and no mention match, route to them
    if (agents.length === 1) {
      await this.dispatchToAgent(agents[0], msg, space);
      return;
    }

    // ─── Priority 2: Thread ownership ─────────────────
    if (msg.thread?.name) {
      const owner = this.threadOwners.get(msg.thread.name);
      if (owner) {
        const ownerAgent = agents.find(a => a.id === owner.agentId);
        if (ownerAgent) {
          owner.lastActivity = Date.now();
          await this.dispatchToAgent(ownerAgent, msg, space);
          return;
        }
      }
    }

    // ─── Priority 3: Role/keyword match ───────────────
    const keywordAgent = this.findKeywordAgent(msg.text, agents);
    if (keywordAgent) {
      if (msg.thread?.name) {
        this.threadOwners.set(msg.thread.name, {
          threadName: msg.thread.name,
          agentId: keywordAgent.id,
          lastActivity: Date.now(),
        });
      }
      await this.dispatchToAgent(keywordAgent, msg, space);
      return;
    }

    // ─── Priority 4: Default agent ────────────────────
    if (space.defaultAgentId) {
      const defaultAgent = agents.find(a => a.id === space.defaultAgentId);
      if (defaultAgent) {
        await this.dispatchToAgent(defaultAgent, msg, space);
        return;
      }
    }

    // ─── Priority 5: Round-robin fallback ─────────────
    // Use message hash to distribute evenly (deterministic, not random)
    const hash = this.simpleHash(msg.name);
    const target = agents[hash % agents.length];
    await this.dispatchToAgent(target, msg, space);
  }

  /** Check if message directly mentions an agent by name or via annotations */
  private findMentionedAgent(text: string, agents: AgentEndpoint[], annotations?: any[]): AgentEndpoint | null {
    const lower = text.toLowerCase();

    // Method 1: Check Google Chat annotations (most reliable — structured mention data)
    if (annotations?.length) {
      for (const ann of annotations) {
        if (ann.type === 'USER_MENTION' && ann.userMention) {
          const mentionedEmail = ann.userMention.user?.email?.toLowerCase();
          const mentionedName = ann.userMention.user?.displayName?.toLowerCase();
          for (const agent of agents) {
            if (mentionedEmail && agent.email?.toLowerCase() === mentionedEmail) return agent;
            if (mentionedName && agent.displayName?.toLowerCase() === mentionedName) return agent;
            if (mentionedName && agent.name?.toLowerCase() === mentionedName) return agent;
          }
        }
      }
    }

    // Method 2: Text pattern matching (fallback)
    for (const agent of agents) {
      const names = [agent.name, agent.displayName].filter(Boolean).map(n => n.toLowerCase());
      for (const name of names) {
        // Match @name, name at start, or just name anywhere preceded by space/start
        if (lower.includes(`@${name}`) || lower.startsWith(`${name},`) || lower.startsWith(`${name} `)) {
          return agent;
        }
      }
    }
    return null;
  }

  /** Match message to agent by keywords/role */
  private findKeywordAgent(text: string, agents: AgentEndpoint[]): AgentEndpoint | null {
    const lower = text.toLowerCase();
    let bestMatch: AgentEndpoint | null = null;
    let bestScore = 0;

    for (const agent of agents) {
      let score = 0;
      for (const kw of agent.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          score += kw.length; // Longer keyword = stronger match
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    // Only return if we have a meaningful match (at least one keyword hit)
    return bestScore > 0 ? bestMatch : null;
  }

  // ─── Dispatch to Agent ──────────────────────────────

  private async dispatchToAgent(agent: AgentEndpoint, msg: ChatMessage, space: MonitoredSpace): Promise<void> {
    // ── Work hours enforcement ──
    if (this.config.workforce) {
      const { onDuty, reason } = this.config.workforce.shouldBeWorking(agent.id);
      if (!onDuty) {
        const managerEmail = this.config.workforce.getManagerEmail(agent.id);
        const senderEmail = msg.sender.email || this.userEmailCache.get(msg.sender.name || '') || '';
        const isFromManager = managerEmail && senderEmail.toLowerCase() === managerEmail.toLowerCase();
        if (!isFromManager) {
          const senderId2 = msg.sender.name || 'no-id';
          const senderDisplay = msg.sender.displayName || 'no-name';
          console.log(`[chat-poller] ${agent.displayName}: SKIPPED chat from ${senderEmail || 'unknown'} (id=${senderId2}, name="${senderDisplay}") — ${reason}. Only manager can wake agent off-hours.`);
          return;
        }
        console.log(`[chat-poller] ${agent.displayName}: off-hours but manager message — waking agent`);
      }
    }

    const senderId = msg.sender.name || '';
    const chatContext = {
      source: 'google_chat',
      senderName: msg.sender.displayName || this.userDisplayNames.get(senderId) || 'Unknown',
      senderEmail: msg.sender.email || this.userEmailCache.get(senderId) || '',
      spaceName: space.displayName || 'Chat',
      spaceId: space.spaceId,
      threadId: msg.thread?.name || '',
      isDM: space.agentIds.length === 1, // heuristic: single-agent space is like a DM
      messageText: msg.text,
    };

    const url = `http://${agent.host}:${agent.port}/api/runtime/chat`;

    try {
      const _rtSecret = process.env.AGENT_RUNTIME_SECRET || process.env.RUNTIME_SECRET || '';
      const _hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
      if (_rtSecret) _hdrs['x-agent-internal-key'] = _rtSecret;
      const resp = await fetch(url, {
        method: 'POST',
        headers: _hdrs,
        body: JSON.stringify(chatContext),
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        console.log(`[chat-poller] → ${agent.displayName}: [from: ${chatContext.senderName} <${chatContext.senderEmail}>] "${msg.text.slice(0, 60)}"`);
      } else {
        console.warn(`[chat-poller] Agent ${agent.displayName} returned ${resp.status}`);
      }
    } catch (err: any) {
      console.warn(`[chat-poller] Agent ${agent.displayName} unreachable (${agent.host}:${agent.port}): ${err.message}`);
    }
  }

  // ─── Space Discovery ────────────────────────────────

  /** Discover spaces from agent configs in DB */
  private async discoverSpaces(): Promise<void> {
    try {
      // Load chat_spaces config from DB (admin-configured)
      const rows = await this.config.engineDb.query(
        `SELECT key, value FROM engine_settings WHERE key = 'chat_spaces'`
      );
      if (rows && rows.length > 0) {
        const spacesConfig = JSON.parse((rows[0] as any).value);
        for (const sc of spacesConfig) {
          if (!this.spaces.has(sc.spaceId)) {
            this.addSpace({
              spaceId: sc.spaceId,
              displayName: sc.displayName || sc.spaceId,
              agentIds: sc.agentIds || [],
              defaultAgentId: sc.defaultAgentId,
            });
          } else {
            // Update agent assignments
            const existing = this.spaces.get(sc.spaceId)!;
            existing.agentIds = sc.agentIds || existing.agentIds;
            existing.defaultAgentId = sc.defaultAgentId || existing.defaultAgentId;
          }
        }
      }
    } catch {
      // engine_settings table might not exist yet or no chat_spaces key — that's fine
    }
  }

  // ─── State Persistence ──────────────────────────────

  private async loadState(): Promise<void> {
    try {
      const rows = await this.config.engineDb.query(
        `SELECT key, value FROM engine_settings WHERE key = 'chat_poller_state'`
      );
      if (rows && rows.length > 0) {
        const state = JSON.parse((rows[0] as any).value);

        // Restore cursors
        if (state.cursors) {
          for (const [spaceId, cursor] of Object.entries(state.cursors as Record<string, any>)) {
            const space = this.spaces.get(spaceId);
            if (space) {
              space.lastMessageName = cursor.lastMessageName;
              space.lastMessageTime = cursor.lastMessageTime;
            }
          }
        }

        // Restore thread ownership
        if (state.threadOwners) {
          for (const to of state.threadOwners) {
            this.threadOwners.set(to.threadName, to);
          }
        }

        // Restore processed message IDs (last 1000)
        if (state.processedIds) {
          for (const id of state.processedIds) {
            this.processedMessages.add(id);
          }
        }

        console.log(`[chat-poller] Restored state: ${this.processedMessages.size} processed IDs, ${this.threadOwners.size} thread owners`);
      }
    } catch {
      // Fresh start — no persisted state
    }
  }

  private async saveState(): Promise<void> {
    const cursors: Record<string, any> = {};
    for (const [spaceId, space] of this.spaces) {
      if (space.lastMessageName) {
        cursors[spaceId] = {
          lastMessageName: space.lastMessageName,
          lastMessageTime: space.lastMessageTime,
        };
      }
    }

    const state = {
      cursors,
      threadOwners: [...this.threadOwners.values()].filter(to => Date.now() - to.lastActivity < THREAD_OWNERSHIP_TTL),
      processedIds: [...this.processedMessages].slice(-1000), // Keep last 1000
      savedAt: new Date().toISOString(),
    };

    try {
      await this.config.engineDb.execute(
        `INSERT INTO engine_settings (key, value) VALUES ('chat_poller_state', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [JSON.stringify(state)]
      );
    } catch (err: any) {
      console.warn(`[chat-poller] Failed to persist state: ${err.message}`);
    }
  }

  // ─── Error Handling / Circuit Breaker ───────────────

  private handleError(): void {
    this.consecutiveErrors++;
    const maxBackoff = this.config.maxBackoffMs || MAX_BACKOFF;
    // Exponential backoff: 30s, 60s, 120s, 240s, capped at max
    this.backoffMs = Math.min(maxBackoff, DEFAULT_INTERVAL * Math.pow(2, this.consecutiveErrors - 1));
    console.warn(`[chat-poller] ${this.consecutiveErrors} consecutive errors, backing off ${Math.round(this.backoffMs / 1000)}s`);
  }

  // ─── Utilities ──────────────────────────────────────

  private cleanThreadOwnership(): void {
    const now = Date.now();
    for (const [key, to] of this.threadOwners) {
      if (now - to.lastActivity > THREAD_OWNERSHIP_TTL) {
        this.threadOwners.delete(key);
      }
    }
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}

// ─── Factory ────────────────────────────────────────────

export function createChatPoller(config: ChatPollerConfig): ChatPoller {
  return new ChatPoller(config);
}
