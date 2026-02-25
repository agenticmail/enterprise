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

  /** Track which messages we've already indexed (in-memory, survives for session) */
  private indexedChatMessages = new Set<string>();
  private indexedEmails = new Set<string>();

  constructor(config: AmbientMemoryConfig) {
    this.agentId = config.agentId;
    this.memory = config.memoryManager;
    this.db = config.engineDb;
    this.chatContextLimit = config.chatContextLimit || 30;
    this.recallLimit = config.recallLimit || 8;
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
   * Only indexes messages we haven't seen before.
   */
  private async indexChatMessages(messages: ChatMessageRecord[]): Promise<void> {
    for (const msg of messages) {
      if (this.indexedChatMessages.has(msg.messageName)) continue;
      if (!msg.text.trim() || msg.text.length < 10) continue;

      // Store as ambient memory — lower importance, decays naturally
      await this.memory.storeMemory(this.agentId, {
        content: `[Chat: ${msg.spaceName}] ${msg.senderName}: ${msg.text.slice(0, 500)}`,
        category: 'context',
        importance: 'low',
        confidence: 0.6,
        title: `Chat message from ${msg.senderName} in ${msg.spaceName}`,
      });

      this.indexedChatMessages.add(msg.messageName);
    }
  }

  // ─── Email Context ──────────────────────────────────

  /**
   * Index recent emails into ambient memory.
   * Stores lightweight summaries (subject + sender + snippet) for recall.
   */
  async indexEmails(emails: EmailRecord[]): Promise<number> {
    let indexed = 0;
    for (const email of emails) {
      if (this.indexedEmails.has(email.messageId)) continue;
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

      this.indexedEmails.add(email.messageId);
      indexed++;
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
