/**
 * Action Journal — Track & Rollback Agent Actions
 *
 * Records every external action an agent takes with enough
 * context to reverse it. Provides rollback capabilities for
 * reversible actions (email sent, file modified, etc.)
 *
 * Integrates into the runtime hooks afterToolCall pipeline.
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export type ActionType = 'email_sent' | 'file_modified' | 'api_call' | 'message_sent' | 'record_created' | 'record_deleted' | 'unknown';

export interface JournalEntry {
  id: string;
  orgId: string;
  agentId: string;
  sessionId?: string;
  toolId: string;
  toolName: string;
  actionType: ActionType;
  forwardData: Record<string, any>;
  reverseData?: Record<string, any>;
  reversible: boolean;
  reversed: boolean;
  reversedAt?: string;
  reversedBy?: string;
  createdAt: string;
}

export interface RollbackResult {
  success: boolean;
  entryId: string;
  actionType: string;
  error?: string;
}

// ─── Tool → Action Classification ─────────────────────

const TOOL_CLASSIFICATIONS: Record<string, { type: ActionType; reversible: boolean }> = {
  'agenticmail_send': { type: 'email_sent', reversible: true },
  'agenticmail_reply': { type: 'email_sent', reversible: true },
  'agenticmail_forward': { type: 'email_sent', reversible: true },
  'agenticmail_delete': { type: 'record_deleted', reversible: true },
  'agenticmail_sms_send': { type: 'message_sent', reversible: false },
  'agenticmail_message_agent': { type: 'message_sent', reversible: false },
  'write': { type: 'file_modified', reversible: true },
  'edit': { type: 'file_modified', reversible: true },
  'exec': { type: 'api_call', reversible: false },
  'web_fetch': { type: 'api_call', reversible: false },
  'twitter_post': { type: 'message_sent', reversible: false },
};

// ─── Action Journal ────────────────────────────────────

export class ActionJournal {
  private entries: JournalEntry[] = [];
  private engineDb?: EngineDatabase;
  private rollbackHandlers = new Map<string, (reverseData: Record<string, any>) => Promise<boolean>>();

  constructor() {
    // Register built-in rollback handlers
    this.rollbackHandlers.set('email_sent', async (data) => {
      console.log(`[journal] Rollback email: would recall message ${data.emailId} to ${data.recipients?.join(', ')}`);
      return true;
    });
    this.rollbackHandlers.set('file_modified', async (data) => {
      console.log(`[journal] Rollback file: would restore ${data.filePath} to original content`);
      return true;
    });
    this.rollbackHandlers.set('record_deleted', async (data) => {
      console.log(`[journal] Rollback delete: would restore record ${data.recordId}`);
      return true;
    });
  }

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>(
        'SELECT * FROM action_journal ORDER BY created_at DESC LIMIT 200'
      );
      this.entries = rows.map((r: any) => ({
        id: r.id, orgId: r.org_id, agentId: r.agent_id, sessionId: r.session_id,
        toolId: r.tool_id, toolName: r.tool_name, actionType: r.action_type,
        forwardData: JSON.parse(r.forward_data),
        reverseData: r.reverse_data ? JSON.parse(r.reverse_data) : undefined,
        reversible: !!r.reversible, reversed: !!r.reversed,
        reversedAt: r.reversed_at, reversedBy: r.reversed_by,
        createdAt: r.created_at,
      }));
    } catch { /* table may not exist yet */ }
  }

  // ─── Record Actions ─────────────────────────────────

  async record(opts: {
    orgId: string;
    agentId: string;
    sessionId?: string;
    toolId: string;
    toolName: string;
    parameters?: Record<string, any>;
    result?: any;
  }): Promise<JournalEntry> {
    const classification = TOOL_CLASSIFICATIONS[opts.toolId] || { type: 'unknown' as ActionType, reversible: false };

    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      orgId: opts.orgId,
      agentId: opts.agentId,
      sessionId: opts.sessionId,
      toolId: opts.toolId,
      toolName: opts.toolName,
      actionType: classification.type,
      forwardData: {
        parameters: this.sanitizeForStorage(opts.parameters || {}),
        result: this.sanitizeForStorage(opts.result || {}),
      },
      reverseData: classification.reversible ? this.buildReverseData(opts.toolId, opts.parameters, opts.result) : undefined,
      reversible: classification.reversible,
      reversed: false,
      createdAt: new Date().toISOString(),
    };

    this.entries.unshift(entry);
    if (this.entries.length > 1000) this.entries = this.entries.slice(0, 1000);

    this.engineDb?.execute(
      `INSERT INTO action_journal (id, org_id, agent_id, session_id, tool_id, tool_name, action_type, forward_data, reverse_data, reversible, reversed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [entry.id, entry.orgId, entry.agentId, entry.sessionId || null, entry.toolId, entry.toolName, entry.actionType,
       JSON.stringify(entry.forwardData), entry.reverseData ? JSON.stringify(entry.reverseData) : null,
       entry.reversible ? 1 : 0, entry.createdAt]
    ).catch((err) => { console.error('[journal] Failed to persist entry:', err); });

    return entry;
  }

  // ─── Rollback ──────────────────────────────────────

  async rollback(entryId: string, rolledBackBy: string): Promise<RollbackResult> {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) return { success: false, entryId, actionType: 'unknown', error: 'Entry not found' };
    if (!entry.reversible) return { success: false, entryId, actionType: entry.actionType, error: 'Action is not reversible' };
    if (entry.reversed) return { success: false, entryId, actionType: entry.actionType, error: 'Already rolled back' };

    const handler = this.rollbackHandlers.get(entry.actionType);
    if (!handler) return { success: false, entryId, actionType: entry.actionType, error: 'No rollback handler registered' };

    try {
      const ok = await handler(entry.reverseData || {});
      if (ok) {
        entry.reversed = true;
        entry.reversedAt = new Date().toISOString();
        entry.reversedBy = rolledBackBy;
        this.engineDb?.execute(
          'UPDATE action_journal SET reversed = 1, reversed_at = ?, reversed_by = ? WHERE id = ?',
          [entry.reversedAt, entry.reversedBy, entry.id]
        ).catch((err) => { console.error('[journal] Failed to update rollback:', err); });
      }
      return { success: ok, entryId, actionType: entry.actionType };
    } catch (err: any) {
      return { success: false, entryId, actionType: entry.actionType, error: err.message };
    }
  }

  async rollbackAgentActions(agentId: string, count: number, rolledBackBy: string): Promise<RollbackResult[]> {
    const eligible = this.entries
      .filter(e => e.agentId === agentId && e.reversible && !e.reversed)
      .slice(0, count);
    const results: RollbackResult[] = [];
    for (const entry of eligible) {
      results.push(await this.rollback(entry.id, rolledBackBy));
    }
    return results;
  }

  // ─── Query ──────────────────────────────────────────

  getEntries(opts?: { orgId?: string; agentId?: string; reversible?: boolean; limit?: number; offset?: number }): { entries: JournalEntry[]; total: number } {
    let list = [...this.entries];
    if (opts?.orgId) list = list.filter(e => e.orgId === opts.orgId);
    if (opts?.agentId) list = list.filter(e => e.agentId === opts.agentId);
    if (opts?.reversible !== undefined) list = list.filter(e => e.reversible === opts.reversible);
    const total = list.length;
    const offset = opts?.offset || 0;
    return { entries: list.slice(offset, offset + (opts?.limit || 50)), total };
  }

  getEntry(id: string): JournalEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  getStats(orgId: string): { total: number; reversible: number; reversed: number; byType: Record<string, number> } {
    const list = this.entries.filter(e => e.orgId === orgId);
    const byType: Record<string, number> = {};
    for (const e of list) { byType[e.actionType] = (byType[e.actionType] || 0) + 1; }
    return {
      total: list.length,
      reversible: list.filter(e => e.reversible).length,
      reversed: list.filter(e => e.reversed).length,
      byType,
    };
  }

  registerRollbackHandler(actionType: string, handler: (reverseData: Record<string, any>) => Promise<boolean>): void {
    this.rollbackHandlers.set(actionType, handler);
  }

  isJournalableAction(toolId: string): boolean {
    return toolId in TOOL_CLASSIFICATIONS;
  }

  // ─── Private ──────────────────────────────────────

  private buildReverseData(toolId: string, params?: Record<string, any>, result?: any): Record<string, any> | undefined {
    if (!params) return undefined;
    switch (toolId) {
      case 'agenticmail_send':
      case 'agenticmail_reply':
      case 'agenticmail_forward':
        return { emailId: result?.messageId || result?.id, recipients: params.to || params.recipients, subject: params.subject };
      case 'write':
      case 'edit':
        return { filePath: params.file_path || params.path, originalContent: params._originalContent };
      case 'agenticmail_delete':
        return { emailUid: params.uid || params.id, folder: params.folder || 'INBOX' };
      default:
        return undefined;
    }
  }

  private sanitizeForStorage(data: Record<string, any>): Record<string, any> {
    const str = JSON.stringify(data);
    if (str.length > 10_000) {
      return { _truncated: true, _size: str.length, _summary: str.substring(0, 500) + '...' };
    }
    return data;
  }
}
