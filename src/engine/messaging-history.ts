/**
 * Messaging History — Persistent conversation storage for WhatsApp/Telegram
 *
 * Stores all inbound + outbound messages in Postgres for:
 * 1. Ambient memory context injection (recent conversation history)
 * 2. Long-term conversation recall via BM25F memory search
 * 3. Analytics and audit trail
 *
 * SCALABILITY:
 * - Composite index on (agent_id, platform, contact_id, created_at DESC) for fast lookups
 * - Configurable context window (default: last 30 messages, max 4000 chars)
 * - Auto-cleanup of old messages (configurable retention)
 * - Efficient single-query fetch with LIMIT + ORDER BY indexed columns
 */

// DB is used as raw pool with .query() './db-adapter.js';

export interface MessageRecord {
  agentId: string;
  platform: 'whatsapp' | 'telegram' | string;
  contactId: string;      // JID for WhatsApp, chat ID for Telegram
  direction: 'inbound' | 'outbound';
  senderName?: string;
  messageText: string;
  messageId?: string;
  isGroup?: boolean;
  groupName?: string;
  metadata?: Record<string, any>;
}

const MAX_CONTEXT_MESSAGES = 30;
const MAX_CONTEXT_CHARS = 4000;

/**
 * Store a message in the history table.
 * Designed for fire-and-forget — errors are logged but don't block.
 */
export async function storeMessage(db: any, msg: MessageRecord): Promise<void> {
  try {
    await db.query(
      `INSERT INTO messaging_history (agent_id, platform, contact_id, direction, sender_name, message_text, message_id, is_group, group_name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        msg.agentId,
        msg.platform,
        msg.contactId,
        msg.direction,
        msg.senderName || null,
        msg.messageText,
        msg.messageId || null,
        msg.isGroup ? true : false,
        msg.groupName || null,
        JSON.stringify(msg.metadata || {}),
      ],
    );
  } catch (err: any) {
    // Non-fatal — don't crash the message flow
    console.warn(`[messaging-history] Failed to store message: ${err.message}`);
  }
}

/**
 * Fetch recent conversation history for a contact.
 * Returns messages formatted for system prompt injection.
 *
 * Uses reverse chronological fetch + reverse to get newest messages
 * in correct chronological order, bounded by both count and character limit.
 */
export async function getRecentHistory(
  db: any,
  agentId: string,
  platform: string,
  contactId: string,
  options?: { maxMessages?: number; maxChars?: number },
): Promise<string> {
  const maxMsg = options?.maxMessages || MAX_CONTEXT_MESSAGES;
  const maxChars = options?.maxChars || MAX_CONTEXT_CHARS;

  try {
    const result = await db.query(
      `SELECT direction, sender_name, message_text, created_at
       FROM messaging_history
       WHERE agent_id = $1 AND platform = $2 AND contact_id = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [agentId, platform, contactId, maxMsg],
    );

    // db.query returns rows directly (not { rows: [...] })
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    if (rows.length === 0) return '';

    // Reverse to chronological order
    const messages = [...rows].reverse();

    // Find the latest known human name from inbound messages (handles name changes)
    let latestHumanName = 'User';
    for (let i = messages.length - 1; i >= 0; i--) {
      const sn = messages[i].sender_name;
      if (messages[i].direction === 'inbound' && sn && sn !== 'Unknown' && !sn.includes('@') && !sn.match(/^[0-9a-f-]{36}$/i)) {
        latestHumanName = sn;
        break;
      }
    }

    // Build context string, respecting character limit
    const lines: string[] = [];
    let totalChars = 0;

    // Work backwards from most recent to ensure we always include the latest messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const name = m.direction === 'inbound' ? latestHumanName : 'You';
      const line = `${name}: ${m.message_text}`;
      if (totalChars + line.length > maxChars && lines.length > 0) break;
      lines.unshift(line);
      totalChars += line.length;
    }

    if (lines.length === 0) return '';

    return `RECENT CONVERSATION HISTORY (${lines.length} messages):\n${lines.join('\n')}`;
  } catch (err: any) {
    console.warn(`[messaging-history] Failed to fetch history: ${err.message}`);
    return '';
  }
}

/**
 * Get conversation summary stats for a contact.
 */
export async function getConversationStats(
  db: any,
  agentId: string,
  platform: string,
  contactId: string,
): Promise<{ totalMessages: number; firstMessage?: string; lastMessage?: string } | null> {
  try {
    const result = await db.query(
      `SELECT COUNT(*) as total,
              MIN(created_at) as first_msg,
              MAX(created_at) as last_msg
       FROM messaging_history
       WHERE agent_id = $1 AND platform = $2 AND contact_id = $3`,
      [agentId, platform, contactId],
    );
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      totalMessages: parseInt(row.total) || 0,
      firstMessage: row.first_msg,
      lastMessage: row.last_msg,
    };
  } catch {
    return null;
  }
}

/**
 * Clean up old messages beyond retention period.
 * Call periodically (e.g., daily via cron or heartbeat).
 */
export async function cleanupOldMessages(
  db: any,
  retentionDays: number = 90,
): Promise<number> {
  try {
    const result = await db.query(
      `DELETE FROM messaging_history WHERE created_at < NOW() - INTERVAL '${retentionDays} days'`,
    );
    return (result as any).rowCount || 0;
  } catch (err: any) {
    console.warn(`[messaging-history] Cleanup failed: ${err.message}`);
    return 0;
  }
}
