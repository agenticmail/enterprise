/**
 * Session Manager
 *
 * Manages agent conversation sessions with database persistence.
 * Supports create, get, update, append, list, delete, and compact.
 *
 * Storage: agent_sessions + agent_session_messages tables (migration v14).
 */

import { nanoid } from 'nanoid';
import type { AgentMessage, SessionState, SessionStatus } from './types.js';

// ─── Types ───────────────────────────────────────────────

export interface SessionManagerConfig {
  /** Engine database instance for SQL queries */
  engineDb: import('../engine/db-adapter.js').EngineDatabase;
}

// ─── Session Manager ─────────────────────────────────────

export class SessionManager {
  private db: import('../engine/db-adapter.js').EngineDatabase;

  constructor(config: SessionManagerConfig) {
    this.db = config.engineDb;
  }

  /**
   * Create a new session.
   */
  async createSession(agentId: string, orgId: string, parentSessionId?: string): Promise<SessionState> {
    var id = nanoid(21);
    var now = Date.now();

    await this.db.run(
      `INSERT INTO agent_sessions (id, agent_id, org_id, status, token_count, turn_count, parent_session_id, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 0, 0, ?, ?, ?)`,
      [id, agentId, orgId, parentSessionId || null, now, now],
    );

    return {
      id,
      agentId,
      orgId,
      messages: [],
      status: 'active',
      tokenCount: 0,
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
      parentSessionId,
    };
  }

  /**
   * Get a session by ID, including all messages.
   */
  async getSession(sessionId: string): Promise<SessionState | null> {
    var rows = await this.db.query(
      `SELECT * FROM agent_sessions WHERE id = ?`,
      [sessionId],
    );

    if (!rows || rows.length === 0) return null;

    var row = rows[0] as any;
    var messages = await this.getMessages(sessionId);

    return {
      id: row.id,
      agentId: row.agent_id,
      orgId: row.org_id,
      messages,
      status: row.status as SessionStatus,
      tokenCount: row.token_count || 0,
      turnCount: row.turn_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastHeartbeatAt: row.last_heartbeat_at || row.updated_at,
      parentSessionId: row.parent_session_id || undefined,
    };
  }

  /**
   * Update session metadata (status, token count, turn count).
   */
  async updateSession(sessionId: string, updates: Partial<Pick<SessionState, 'status' | 'tokenCount' | 'turnCount' | 'lastHeartbeatAt'>>): Promise<void> {
    var setClauses: string[] = [];
    var values: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.tokenCount !== undefined) {
      setClauses.push('token_count = ?');
      values.push(updates.tokenCount);
    }
    if (updates.turnCount !== undefined) {
      setClauses.push('turn_count = ?');
      values.push(updates.turnCount);
    }
    if (updates.lastHeartbeatAt !== undefined) {
      setClauses.push('last_heartbeat_at = ?');
      values.push(updates.lastHeartbeatAt);
    }

    setClauses.push('updated_at = ?');
    values.push(Date.now());
    values.push(sessionId);

    if (setClauses.length > 1) {
      await this.db.run(
        `UPDATE agent_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
        values,
      );
    }
  }

  /**
   * Append a message to a session.
   */
  async appendMessage(sessionId: string, message: AgentMessage): Promise<void> {
    var id = nanoid(21);
    var now = Date.now();

    var contentStr = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);

    var toolCallsStr = message.tool_calls ? JSON.stringify(message.tool_calls) : null;
    var toolResultsStr = message.tool_results ? JSON.stringify(message.tool_results) : null;

    await this.db.run(
      `INSERT INTO agent_session_messages (id, session_id, role, content, tool_calls, tool_results, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, sessionId, message.role, contentStr, toolCallsStr, toolResultsStr, now],
    );

    // Update session timestamp
    await this.db.run(
      `UPDATE agent_sessions SET updated_at = ? WHERE id = ?`,
      [now, sessionId],
    );
  }

  /**
   * Append multiple messages at once.
   */
  async appendMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
    for (var msg of messages) {
      await this.appendMessage(sessionId, msg);
    }
  }

  /**
   * List sessions for an agent.
   */
  async listSessions(agentId: string, opts?: { status?: string; limit?: number; offset?: number }): Promise<Omit<SessionState, 'messages'>[]> {
    var conditions = ['agent_id = ?'];
    var values: any[] = [agentId];

    if (opts?.status) {
      conditions.push('status = ?');
      values.push(opts.status);
    }

    var limit = opts?.limit ?? 50;
    var offset = opts?.offset ?? 0;

    var rows = await this.db.query(
      `SELECT * FROM agent_sessions WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    return (rows || []).map(function(row: any) {
      return {
        id: row.id,
        agentId: row.agent_id,
        orgId: row.org_id,
        status: row.status as SessionStatus,
        tokenCount: row.token_count || 0,
        turnCount: row.turn_count || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastHeartbeatAt: row.last_heartbeat_at || row.updated_at,
        parentSessionId: row.parent_session_id || undefined,
      };
    });
  }

  /**
   * Delete a session and all its messages.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM agent_session_messages WHERE session_id = ?`,
      [sessionId],
    );
    await this.db.run(
      `DELETE FROM agent_sessions WHERE id = ?`,
      [sessionId],
    );
  }

  /**
   * Compact a session by removing old messages and keeping a summary.
   */
  async compactSession(sessionId: string, keepLastN?: number): Promise<void> {
    var messages = await this.getMessages(sessionId);
    var keep = keepLastN ?? 10;

    if (messages.length <= keep) return;

    // Delete all messages for this session
    await this.db.run(
      `DELETE FROM agent_session_messages WHERE session_id = ?`,
      [sessionId],
    );

    // Re-insert only the recent messages
    var recentMessages = messages.slice(-keep);
    for (var msg of recentMessages) {
      await this.appendMessage(sessionId, msg);
    }
  }

  /**
   * Replace all messages in a session.
   */
  async replaceMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
    await this.db.run(
      `DELETE FROM agent_session_messages WHERE session_id = ?`,
      [sessionId],
    );
    await this.appendMessages(sessionId, messages);
  }

  /**
   * Find all active sessions (for resume on startup).
   */
  async findActiveSessions(): Promise<Omit<SessionState, 'messages'>[]> {
    var rows = await this.db.query(
      `SELECT * FROM agent_sessions WHERE status = 'active' OR status = 'resuming' ORDER BY updated_at DESC`,
      [],
    );
    return (rows || []).map(function(row: any) {
      return {
        id: row.id,
        agentId: row.agent_id,
        orgId: row.org_id,
        status: row.status as SessionStatus,
        tokenCount: row.token_count || 0,
        turnCount: row.turn_count || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastHeartbeatAt: row.last_heartbeat_at || row.updated_at,
        parentSessionId: row.parent_session_id || undefined,
      };
    });
  }

  /**
   * Touch a session (heartbeat) — updates the heartbeat and updated_at timestamps.
   */
  async touchSession(sessionId: string, updates?: { tokenCount?: number; turnCount?: number }): Promise<void> {
    var now = Date.now();
    var setClauses = ['updated_at = ?', 'last_heartbeat_at = ?'];
    var values: any[] = [now, now];
    if (updates?.tokenCount !== undefined) {
      setClauses.push('token_count = ?');
      values.push(updates.tokenCount);
    }
    if (updates?.turnCount !== undefined) {
      setClauses.push('turn_count = ?');
      values.push(updates.turnCount);
    }
    values.push(sessionId);
    await this.db.run(
      `UPDATE agent_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
  }

  /**
   * Mark sessions as failed if they haven't sent a heartbeat within the timeout period.
   * Returns the IDs of sessions that were marked stale.
   */
  async markStaleSessions(timeoutMs: number): Promise<string[]> {
    var cutoff = Date.now() - timeoutMs;
    var rows = await this.db.query(
      `SELECT id FROM agent_sessions WHERE status = 'active' AND (last_heartbeat_at < ? OR (last_heartbeat_at IS NULL AND updated_at < ?))`,
      [cutoff, cutoff],
    );
    var staleIds = (rows || []).map(function(r: any) { return r.id; });
    for (var id of staleIds) {
      await this.db.run(
        `UPDATE agent_sessions SET status = 'failed', updated_at = ? WHERE id = ?`,
        [Date.now(), id],
      );
    }
    return staleIds;
  }

  // ─── Private ─────────────────────────────────────

  private async getMessages(sessionId: string): Promise<AgentMessage[]> {
    var rows = await this.db.query(
      `SELECT * FROM agent_session_messages WHERE session_id = ? ORDER BY created_at ASC`,
      [sessionId],
    );

    return (rows || []).map(function(row: any) {
      var content: any;
      try {
        content = JSON.parse(row.content);
      } catch {
        content = row.content;
      }

      var toolCalls: any;
      if (row.tool_calls) {
        try { toolCalls = JSON.parse(row.tool_calls); } catch {}
      }

      var toolResults: any;
      if (row.tool_results) {
        try { toolResults = JSON.parse(row.tool_results); } catch {}
      }

      return {
        role: row.role as AgentMessage['role'],
        content,
        tool_calls: toolCalls || undefined,
        tool_results: toolResults || undefined,
      };
    });
  }
}
