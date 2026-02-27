/**
 * Ambient Memory System — Human-like "faint remembrance" for agents
 *
 * Humans don't remember every email or chat message perfectly, but they have
 * a faint sense of "I've seen something about X" or "someone mentioned Y last week."
 * This module gives agents that same ambient awareness.
 *
 * TWO CHANNELS:
 * 1. Chat Space Memory — Recent messages from spaces the agent is in
 * 2. Email Memory — Subject lines, senders, and key content from inbox
 *
 * HOW IT WORKS:
 * - On session spawn: fetch recent space history + recall relevant memories
 * - Periodic ingestion: index new chat messages and emails into BM25F memory
 * - Memory decays naturally (confidence drops over time) — like human forgetting
 * - Recalled memories get boosted (access count) — like human reinforcement
 *
 * ARCHITECTURE:
 *   Chat API / Email API
 *         │
 *    AmbientMemory.ingest()  ← periodic (every few minutes)
 *         │
 *    AgentMemoryManager (BM25F + Postgres)
 *         │
 *    AmbientMemory.recall(query)  ← on session spawn
 *         │
 *    System prompt injection ("You faintly recall...")
 */

import type { AgentMemoryManager } from './agent-memory.js';
import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export interface ChatMessageRecord {
  messageName: string;      // spaces/XXX/messages/YYY (unique ID)
  spaceId: string;          // spaces/XXX
  spaceName: string;        // "Agentic Mail Support"
  senderName: string;
  senderEmail: string;
  text: string;
  timestamp: string;        // ISO datetime
  threadId?: string;
}

export interface EmailRecord {
  messageId: string;        // unique email ID
  from: string;
  fromName: string;
  to: string;
  subject: string;
  snippet: string;          // first ~200 chars
  timestamp: string;
  labels?: string[];
}

interface AmbientMemoryConfig {
  agentId: string;
  memoryManager: AgentMemoryManager;
  engineDb: EngineDatabase;
  /** Max chat messages to fetch on session spawn for context */
  chatContextLimit?: number;
  /** Max ambient memories to recall for context injection */
  recallLimit?: number;
}

// ─── Ambient Memory Class ───────────────────────────────

export class AmbientMemory {
  private agentId: string;
  private memory: AgentMemoryManager;
  private db: EngineDatabase;
  private chatContextLimit: number;
  private recallLimit: number;

  /** Persistent cursor: last indexed chat message name per space */
  private chatCursors = new Map<string, string>();
  /** Persistent cursor: last indexed email ID */
  private lastEmailCursor: string | null = null;
  /** Whether we've loaded cursors from DB */
  private cursorsLoaded = false;

  constructor(config: AmbientMemoryConfig) {
    this.agentId = config.agentId;
    this.memory = config.memoryManager;
    this.db = config.engineDb;
    this.chatContextLimit = config.chatContextLimit || 30;
    this.recallLimit = config.recallLimit || 8;
  }

  // ─── Persistent Cursor Management ───────────────────

  /**
   * Load dedup cursors from DB. Called lazily on first use.
   * Stored in engine_settings as JSON: { chatCursors: { spaceId: lastMessageName }, lastEmailId: "..." }
   */
  private async loadCursors(): Promise<void> {
    if (this.cursorsLoaded) return;
    this.cursorsLoaded = true;
    try {
      const rows = await this.db.query<any>(
        `SELECT value FROM engine_settings WHERE key = $1`,
        [`ambient_cursors:${this.agentId}`]
      );
      if (rows?.[0]?.value) {
        const data = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        if (data.chatCursors) {
          for (const [k, v] of Object.entries(data.chatCursors)) {
            this.chatCursors.set(k, v as string);
          }
        }
        if (data.lastEmailId) this.lastEmailCursor = data.lastEmailId;
      }
    } catch {
      // engine_settings table may not exist yet — that's fine
    }
  }

  /**
   * Persist cursors to DB so they survive restarts.
   */
  private async saveCursors(): Promise<void> {
    const data = {
      chatCursors: Object.fromEntries(this.chatCursors),
      lastEmailId: this.lastEmailCursor,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.db.execute(
        `INSERT INTO engine_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`ambient_cursors:${this.agentId}`, JSON.stringify(data)]
      );
    } catch {
      // Non-fatal — cursors are an optimization, not critical
    }
  }

  // ─── Chat Space Context ─────────────────────────────

  /**
   * Fetch recent messages from a Chat space and return formatted context.
   * Also indexes new messages into ambient memory for future recall.
   */
  async getChatSpaceContext(
    spaceId: string,
    spaceName: string,
    getToken: () => Promise<string>,
    opts?: { limit?: number; excludeSender?: string }
  ): Promise<string> {
    const limit = opts?.limit || this.chatContextLimit;

    try {
      const token = await getToken();
      const url = new URL(`https://chat.googleapis.com/v1/${spaceId}/messages`);
      url.searchParams.set('pageSize', String(limit));
      url.searchParams.set('orderBy', 'createTime desc');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn(`[ambient-memory] Failed to fetch space history for ${spaceId}: ${res.status}`);
        return '';
      }

      const data = await res.json();
      const messages: ChatMessageRecord[] = (data.messages || [])
        .filter((m: any) => m.sender?.type !== 'BOT')
        .map((m: any) => ({
          messageName: m.name,
          spaceId,
          spaceName,
          senderName: m.sender?.displayName || 'Unknown',
          senderEmail: m.sender?.email || '',
          text: m.text || m.argumentText || '',
          timestamp: m.createTime,
          threadId: m.thread?.name,
        }))
        .reverse(); // chronological order

      // Index new messages into BM25F memory (background, don't block)
      this.indexChatMessages(messages).catch(err =>
        console.warn(`[ambient-memory] Chat indexing error: ${err.message}`)
      );

      // Format as conversation context
      if (messages.length === 0) return '';

      const lines = messages.map(m => {
        const time = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const name = m.senderName.split(' ')[0]; // first name only
        return `[${time}] ${name}: ${m.text.slice(0, 300)}`;
      });

      return `## Recent Conversation in "${spaceName}" (last ${messages.length} messages)\n${lines.join('\n')}`;
    } catch (err: any) {
      console.warn(`[ambient-memory] Error fetching space context: ${err.message}`);
      return '';
    }
  }

  /**
   * Index chat messages into the agent's BM25F memory for future recall.
   * Uses persistent cursor to skip already-indexed messages across restarts.
   */
  private async indexChatMessages(messages: ChatMessageRecord[]): Promise<void> {
    await this.loadCursors();

    const spaceId = messages[0]?.spaceId;
    if (!spaceId) return;
    const cursor = this.chatCursors.get(spaceId);
    let newCount = 0;
    let latestName = cursor;

    for (const msg of messages) {
      // Skip messages at or before the cursor (messages are in chronological order)
      if (cursor && msg.messageName <= cursor) continue;
      if (!msg.text.trim() || msg.text.length < 10) continue;

      await this.memory.storeMemory(this.agentId, {
        content: `[Chat: ${msg.spaceName}] ${msg.senderName}: ${msg.text.slice(0, 500)}`,
        category: 'context',
        importance: 'low',
        confidence: 0.6,
        title: `Chat message from ${msg.senderName} in ${msg.spaceName}`,
      });

      if (!latestName || msg.messageName > latestName) latestName = msg.messageName;
      newCount++;
    }

    // Update cursor if we indexed new messages
    if (latestName && latestName !== cursor) {
      this.chatCursors.set(spaceId, latestName);
      await this.saveCursors();
      if (newCount > 0) {
        console.log(`[ambient-memory] Indexed ${newCount} new chat messages in ${messages[0]?.spaceName}, cursor → ${latestName}`);
      }
    }
  }

  // ─── Email Context ──────────────────────────────────

  /**
   * Index recent emails into ambient memory.
   * Stores lightweight summaries (subject + sender + snippet) for recall.
   * Uses persistent cursor to skip already-indexed emails across restarts.
   */
  async indexEmails(emails: EmailRecord[]): Promise<number> {
    await this.loadCursors();

    let indexed = 0;
    let latestId = this.lastEmailCursor;

    for (const email of emails) {
      // Skip if at or before cursor
      if (this.lastEmailCursor && email.messageId <= this.lastEmailCursor) continue;
      if (!email.subject && !email.snippet) continue;

      const content = [
        `From: ${email.fromName || email.from}`,
        `Subject: ${email.subject}`,
        email.snippet ? `Preview: ${email.snippet.slice(0, 200)}` : '',
        email.labels?.length ? `Labels: ${email.labels.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      await this.memory.storeMemory(this.agentId, {
        content: `[Email] ${content}`,
        category: 'context',
        importance: 'low',
        confidence: 0.5,
        title: `Email from ${email.fromName || email.from}: ${email.subject}`,
      });

      if (!latestId || email.messageId > latestId) latestId = email.messageId;
      indexed++;
    }

    // Update cursor
    if (latestId && latestId !== this.lastEmailCursor) {
      this.lastEmailCursor = latestId;
      await this.saveCursors();
      if (indexed > 0) {
        console.log(`[ambient-memory] Indexed ${indexed} new emails, cursor → ${latestId}`);
      }
    }

    return indexed;
  }

  // ─── Recall ─────────────────────────────────────────

  /**
   * Search ambient memory for context relevant to the current message.
   * Returns a formatted string for system prompt injection.
   */
  async recall(query: string, opts?: { limit?: number; categories?: string[] }): Promise<string> {
    const limit = opts?.limit || this.recallLimit;

    const results = await this.memory.recall(this.agentId, query, limit);
    if (results.length === 0) return '';

    // Filter to ambient categories (context, interaction_pattern)
    const ambient = results.filter(r =>
      r.category === 'context' || r.category === 'interaction_pattern'
    );
    if (ambient.length === 0) return '';

    // Format as "faint remembrance" — human-like recall
    const lines = ambient.map(r => {
      const age = getTimeAgo(r.createdAt);
      // Extract the core content without the [Chat:] or [Email] prefix for cleaner display
      const content = r.content.replace(/^\[(Chat|Email)[^\]]*\]\s*/, '');
      const source = r.content.startsWith('[Chat') ? 'chat' : r.content.startsWith('[Email') ? 'email' : 'memory';
      return `- (${source}, ${age}) ${content.slice(0, 200)}`;
    });

    return `## Ambient Memory — Things You Faintly Recall\nThese are fragments from your past conversations and emails. Not perfect recall, but enough to recognize context:\n${lines.join('\n')}`;
  }

  /**
   * Messaging context builder — fetches recent conversation history from WhatsApp/Telegram
   * plus ambient recall. Used for non-Google Chat messaging sources.
   */
  async buildMessagingContext(
    messageText: string,
    source: string,
    contactId: string,
  ): Promise<string> {
    const [chatHistory, ambientContext] = await Promise.all([
      this.getMessagingHistory(source, contactId),
      this.recall(messageText),
    ]);

    const parts: string[] = [];
    if (chatHistory) parts.push(chatHistory);
    if (ambientContext) parts.push(ambientContext);
    return parts.join('\n\n');
  }

  /**
   * Fetch recent conversation history from a messaging platform.
   */
  private async getMessagingHistory(source: string, contactId: string): Promise<string> {
    try {
      if (source === 'whatsapp') {
        // WhatsApp: Baileys doesn't persist history — return empty for now
        // TODO: Store WhatsApp messages in Postgres for ambient recall
        return '';
      } else if (source === 'telegram') {
        // Telegram: Bot API doesn't provide chat history — return empty for now
        // TODO: Store Telegram messages in Postgres for ambient recall
        return '';
      }
    } catch (err: any) {
      console.warn(`[ambient-memory] Failed to fetch ${source} history for ${contactId}: ${err.message}`);
    }
    return '';
  }

  /**
   * Full context builder — combines space history + ambient recall.
   * This is the main entry point for injecting memory into a chat session.
   */
  async buildSessionContext(
    messageText: string,
    spaceId: string,
    spaceName: string,
    getToken: () => Promise<string>,
  ): Promise<string> {
    // Parallel fetch: space history + ambient recall
    const [spaceContext, ambientContext] = await Promise.all([
      this.getChatSpaceContext(spaceId, spaceName, getToken),
      this.recall(messageText),
    ]);

    const parts: string[] = [];
    if (spaceContext) parts.push(spaceContext);
    if (ambientContext) parts.push(ambientContext);

    return parts.join('\n\n');
  }
}

// ─── Helpers ────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
