/**
 * Centralized Task Queue System
 *
 * Tracks all agent tasks with rich metadata — before spawn, during execution,
 * and after completion. Provides SSE for real-time dashboard updates.
 *
 * Every task flows through: created → assigned → in_progress → completed|failed|cancelled
 */

import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────

export type TaskStatus = 'created' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskRecord {
  id: string;
  orgId: string;

  // Who
  assignedTo: string;        // agent ID
  assignedToName: string;    // agent display name
  createdBy: string;         // 'system' | agent ID | user ID
  createdByName: string;

  // What
  title: string;             // short summary
  description: string;       // detailed task description
  category: string;          // 'email' | 'research' | 'meeting' | 'workflow' | 'custom'
  tags: string[];

  // Status
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;          // 0-100

  // Timing
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  estimatedDurationMs: number | null;
  actualDurationMs: number | null;

  // Result
  result: Record<string, unknown> | null;   // outcome metadata
  error: string | null;

  // Relationships
  parentTaskId: string | null;   // for sub-tasks
  relatedAgentIds: string[];     // other agents involved
  sessionId: string | null;      // linked session if any

  // Model info
  model: string | null;
  fallbackModel: string | null;
  modelUsed: string | null;      // actual model that executed
  tokensUsed: number;
  costUsd: number;

  // Source platform
  source: string | null;         // 'telegram' | 'whatsapp' | 'email' | 'google_chat' | 'internal' | 'api'

  // Task chain (multi-agent delegation tracking)
  chainId: string | null;        // shared ID across all tasks in a delegation chain
  chainSeq: number;              // sequence number within chain (0 = origin)
  delegatedFrom: string | null;  // task ID this was delegated from
  delegatedTo: string | null;    // task ID this was delegated to
  delegationType: string | null; // 'delegation' | 'review' | 'revision' | 'escalation' | 'return'

  // Customer context (for support/external-facing tasks)
  customerContext: {
    name: string;
    email: string;
    phone: string;
    company: string;
    channel: string;            // 'email' | 'chat' | 'phone' | 'whatsapp' | 'ticket'
    isNew: boolean;
    metadata: Record<string, unknown>;
  } | null;

  // Activity log (micro-events within a task)
  activityLog: Array<{
    ts: string;
    type: string;                // 'created' | 'assigned' | 'started' | 'delegated' | 'returned' | 'progress' | 'completed' | 'failed' | 'note'
    agent: string;
    detail: string;
  }>;
}

type TaskListener = (event: TaskEvent) => void;

export interface TaskEvent {
  type: 'task_created' | 'task_updated' | 'task_completed' | 'task_failed' | 'task_cancelled' | 'task_progress';
  task: TaskRecord;
  timestamp: string;
}

// ─── Task Queue Manager ───────────────────────────────────

export class TaskQueueManager {
  private tasks = new Map<string, TaskRecord>();
  private listeners = new Set<TaskListener>();
  private db: any;
  private initialized = false;

  constructor(db?: any) {
    this.db = db;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.db) {
      // Compatibility: EngineDatabase has query()/run() but not all()/get()
      if (!this.db.all && this.db.query) this.db.all = this.db.query.bind(this.db);
      if (!this.db.get && this.db.query) this.db.get = async (sql: string, params?: any[]) => { const rows = await this.db.query(sql, params); return rows?.[0] ?? null; };
      try {
        await this.db.run(`CREATE TABLE IF NOT EXISTS task_pipeline (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          assigned_to TEXT NOT NULL,
          assigned_to_name TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL DEFAULT 'system',
          created_by_name TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'custom',
          tags TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'created',
          priority TEXT NOT NULL DEFAULT 'normal',
          progress INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          assigned_at TEXT,
          started_at TEXT,
          completed_at TEXT,
          estimated_duration_ms INTEGER,
          actual_duration_ms INTEGER,
          result TEXT,
          error TEXT,
          parent_task_id TEXT,
          related_agent_ids TEXT NOT NULL DEFAULT '[]',
          session_id TEXT,
          model TEXT,
          fallback_model TEXT,
          model_used TEXT,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          chain_id TEXT,
          chain_seq INTEGER NOT NULL DEFAULT 0,
          delegated_from TEXT,
          delegated_to TEXT,
          delegation_type TEXT,
          customer_context TEXT,
          activity_log TEXT NOT NULL DEFAULT '[]',
          source TEXT
        )`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_pipeline_org ON task_pipeline(org_id)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_pipeline_agent ON task_pipeline(assigned_to)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_pipeline_status ON task_pipeline(status)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_pipeline_created ON task_pipeline(created_at)`);
        // Add new columns to existing tables (safe — catch errors if already exist)
        for (const col of [
          ['chain_id', 'TEXT'], ['chain_seq', 'INTEGER DEFAULT 0'], ['delegated_from', 'TEXT'],
          ['delegated_to', 'TEXT'], ['delegation_type', 'TEXT'], ['customer_context', 'TEXT'],
          ['activity_log', 'TEXT DEFAULT \'[]\''],
          ['source', 'TEXT']
        ]) {
          try { await this.db.run(`ALTER TABLE task_pipeline ADD COLUMN ${col[0]} ${col[1]}`); } catch { /* already exists */ }
        }

        // Create chain index AFTER columns are ensured
        try { await this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_pipeline_chain ON task_pipeline(chain_id)`); } catch { /* already exists */ }

        // Load recent tasks into memory
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rows = await this.db.all(`SELECT * FROM task_pipeline WHERE status IN ('created','assigned','in_progress') OR created_at > ? ORDER BY created_at DESC LIMIT 500`, [cutoff]);
        for (const row of rows || []) {
          this.tasks.set(row.id, this.rowToTask(row));
        }
      } catch (e: any) {
        console.error('[TaskQueue] DB init error:', e.message);
      }
    }
    this.initialized = true;
  }

  // ─── CRUD ─────────────────────────────────────────────

  async createTask(opts: {
    orgId: string;
    assignedTo: string;
    assignedToName: string;
    createdBy?: string;
    createdByName?: string;
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    priority?: TaskPriority;
    parentTaskId?: string;
    relatedAgentIds?: string[];
    sessionId?: string;
    model?: string;
    fallbackModel?: string;
    estimatedDurationMs?: number;
    chainId?: string;
    chainSeq?: number;
    delegatedFrom?: string;
    delegationType?: string;
    customerContext?: TaskRecord['customerContext'];
    source?: string;
  }): Promise<TaskRecord> {
    await this.init();
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(),
      orgId: opts.orgId,
      assignedTo: opts.assignedTo,
      assignedToName: opts.assignedToName,
      createdBy: opts.createdBy || 'system',
      createdByName: opts.createdByName || 'System',
      title: opts.title,
      description: opts.description || '',
      category: opts.category || 'custom',
      tags: opts.tags || [],
      status: 'created',
      priority: opts.priority || 'normal',
      progress: 0,
      createdAt: now,
      assignedAt: null,
      startedAt: null,
      completedAt: null,
      estimatedDurationMs: opts.estimatedDurationMs || null,
      actualDurationMs: null,
      result: null,
      error: null,
      parentTaskId: opts.parentTaskId || null,
      relatedAgentIds: opts.relatedAgentIds || [],
      sessionId: opts.sessionId || null,
      model: opts.model || null,
      fallbackModel: opts.fallbackModel || null,
      modelUsed: null,
      tokensUsed: 0,
      costUsd: 0,
      chainId: opts.chainId || randomUUID(),
      chainSeq: opts.chainSeq || 0,
      delegatedFrom: opts.delegatedFrom || null,
      delegatedTo: null,
      delegationType: opts.delegationType || null,
      customerContext: opts.customerContext || null,
      source: opts.source || null,
      activityLog: [{ ts: now, type: 'created', agent: opts.createdBy || 'system', detail: 'Task created' }],
    };
    this.tasks.set(task.id, task);
    await this.persist(task);
    this.emit({ type: 'task_created', task, timestamp: now });
    return task;
  }

  /**
   * Delegate a task from one agent to another, creating a new linked task in the chain.
   */
  async delegateTask(taskId: string, opts: {
    toAgent: string;
    toAgentName: string;
    delegationType?: string;
    title?: string;
    description?: string;
    priority?: TaskPriority;
  }): Promise<TaskRecord | null> {
    const source = this.tasks.get(taskId);
    if (!source) return null;

    const now = new Date().toISOString();
    source.activityLog.push({ ts: now, type: 'delegated', agent: source.assignedTo, detail: `Delegated to ${opts.toAgentName} (${opts.delegationType || 'delegation'})` });

    // Create the new delegated task
    const delegated = await this.createTask({
      orgId: source.orgId,
      assignedTo: opts.toAgent,
      assignedToName: opts.toAgentName,
      createdBy: source.assignedTo,
      createdByName: source.assignedToName,
      title: opts.title || source.title,
      description: opts.description || source.description,
      category: source.category,
      tags: [...source.tags],
      priority: opts.priority || source.priority,
      parentTaskId: source.parentTaskId || undefined,
      relatedAgentIds: [...new Set([...source.relatedAgentIds, source.assignedTo])],
      chainId: source.chainId || undefined,
      chainSeq: (source.chainSeq || 0) + 1,
      delegatedFrom: source.id,
      delegationType: opts.delegationType || 'delegation',
      customerContext: source.customerContext,
    });

    // Update source to point to delegated task
    source.delegatedTo = delegated.id;
    await this.persist(source);
    this.emit({ type: 'task_updated', task: source, timestamp: now });

    return delegated;
  }

  /**
   * Get full task chain by chainId — all tasks in a delegation flow.
   */
  getTaskChain(chainId: string): TaskRecord[] {
    const chain: TaskRecord[] = [];
    for (const t of this.tasks.values()) {
      if (t.chainId === chainId) chain.push(t);
    }
    return chain.sort((a, b) => (a.chainSeq || 0) - (b.chainSeq || 0));
  }

  async updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'status' | 'progress' | 'result' | 'error' | 'modelUsed' | 'tokensUsed' | 'costUsd' | 'sessionId' | 'title' | 'description' | 'priority' | 'activityLog'>>): Promise<TaskRecord | null> {
    await this.init();
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const now = new Date().toISOString();

    if (updates.status === 'assigned' && !task.assignedAt) { task.assignedAt = now; task.activityLog.push({ ts: now, type: 'assigned', agent: task.assignedTo, detail: 'Task assigned' }); }
    if (updates.status === 'in_progress' && !task.startedAt) { task.startedAt = now; task.activityLog.push({ ts: now, type: 'started', agent: task.assignedTo, detail: 'Work started' }); }
    if (updates.progress !== undefined && updates.progress !== task.progress) { task.activityLog.push({ ts: now, type: 'progress', agent: task.assignedTo, detail: `Progress: ${updates.progress}%` }); }
    if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
      task.completedAt = now;
      if (task.startedAt) task.actualDurationMs = new Date(now).getTime() - new Date(task.startedAt).getTime();
      if (updates.status === 'completed') {
        task.progress = 100;
        const dur = task.actualDurationMs ? ` in ${Math.round(task.actualDurationMs / 1000)}s` : '';
        const tokens = updates.tokensUsed ? ` (${updates.tokensUsed.toLocaleString()} tokens` + (updates.costUsd ? `, $${updates.costUsd.toFixed(4)}` : '') + ')' : '';
        task.activityLog.push({ ts: now, type: 'completed', agent: task.assignedTo, detail: `Task completed${dur}${tokens}` });
      }
      if (updates.status === 'failed') {
        task.activityLog.push({ ts: now, type: 'failed', agent: task.assignedTo, detail: `Task failed: ${updates.error || 'Unknown error'}` });
      }
      if (updates.status === 'cancelled') {
        task.activityLog.push({ ts: now, type: 'cancelled', agent: task.assignedTo, detail: 'Task cancelled' });
      }
    }

    Object.assign(task, updates);
    await this.persist(task);

    const eventType = updates.status === 'completed' ? 'task_completed'
      : updates.status === 'failed' ? 'task_failed'
      : updates.status === 'cancelled' ? 'task_cancelled'
      : updates.progress !== undefined ? 'task_progress'
      : 'task_updated';

    this.emit({ type: eventType, task, timestamp: now });
    return task;
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  // ─── Queries ──────────────────────────────────────────

  getActiveTasks(orgId?: string): TaskRecord[] {
    const active: TaskRecord[] = [];
    for (const t of this.tasks.values()) {
      if (t.status === 'created' || t.status === 'assigned' || t.status === 'in_progress') {
        if (!orgId || t.orgId === orgId) active.push(t);
      }
    }
    return active.sort((a, b) => {
      const pri = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (pri[a.priority] - pri[b.priority]) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
  }

  getAllTasks(orgId?: string, limit = 100): TaskRecord[] {
    const all: TaskRecord[] = [];
    for (const t of this.tasks.values()) {
      if (!orgId || t.orgId === orgId) all.push(t);
    }
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  }

  getAgentTasks(agentId: string, includeCompleted = false): TaskRecord[] {
    const res: TaskRecord[] = [];
    for (const t of this.tasks.values()) {
      if (t.assignedTo === agentId) {
        if (includeCompleted || t.status === 'created' || t.status === 'assigned' || t.status === 'in_progress') {
          res.push(t);
        }
      }
    }
    return res.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getTaskBySessionId(sessionId: string): Promise<TaskRecord | null> {
    if (this.db) {
      try {
        const row = await this.db.get(
          `SELECT * FROM task_pipeline WHERE session_id = ? AND status = 'in_progress' ORDER BY created_at DESC LIMIT 1`,
          [sessionId]
        );
        return row ? this.rowToTask(row) : null;
      } catch { /* fall through */ }
    }
    for (const task of this.tasks.values()) {
      if (task.sessionId === sessionId && task.status === 'in_progress') return task;
    }
    return null;
  }

  async getTaskHistory(orgId: string, limit = 50, offset = 0): Promise<TaskRecord[]> {
    if (this.db) {
      try {
        const rows = await this.db.all(
          `SELECT * FROM task_pipeline WHERE org_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [orgId, limit, offset]
        );
        return (rows || []).map((r: any) => this.rowToTask(r));
      } catch { /* fall through */ }
    }
    return this.getAllTasks(orgId, limit);
  }

  async getPipelineStats(orgId?: string): Promise<{
    created: number; assigned: number; inProgress: number; completed: number; failed: number; cancelled: number; total: number;
    todayCompleted: number; todayFailed: number; todayCreated: number; avgDurationMs: number; totalCost: number; totalTokens: number;
    topAgents: Array<{ agent: string; name: string; completed: number; active: number }>;
  }> {
    const stats = {
      created: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0, cancelled: 0, total: 0,
      todayCompleted: 0, todayFailed: 0, todayCreated: 0, avgDurationMs: 0, totalCost: 0, totalTokens: 0,
      topAgents: [] as Array<{ agent: string; name: string; completed: number; active: number }>,
    };
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    let durationSum = 0; let durationCount = 0;
    const agentMap = new Map<string, { name: string; completed: number; active: number }>();

    for (const t of this.tasks.values()) {
      if (orgId && t.orgId !== orgId) continue;
      stats.total++;
      if (t.status === 'created') stats.created++;
      else if (t.status === 'assigned') stats.assigned++;
      else if (t.status === 'in_progress') stats.inProgress++;
      else if (t.status === 'completed') stats.completed++;
      else if (t.status === 'failed') stats.failed++;
      else if (t.status === 'cancelled') stats.cancelled++;

      // Today metrics
      const createdMs = new Date(t.createdAt).getTime();
      if (createdMs >= todayMs) stats.todayCreated++;
      if (t.completedAt && new Date(t.completedAt).getTime() >= todayMs) {
        if (t.status === 'completed') stats.todayCompleted++;
        if (t.status === 'failed') stats.todayFailed++;
      }
      if (t.actualDurationMs) { durationSum += t.actualDurationMs; durationCount++; }
      stats.totalCost += t.costUsd || 0;
      stats.totalTokens += t.tokensUsed || 0;

      // Per-agent
      if (t.assignedTo) {
        if (!agentMap.has(t.assignedTo)) agentMap.set(t.assignedTo, { name: t.assignedToName || t.assignedTo, completed: 0, active: 0 });
        const a = agentMap.get(t.assignedTo)!;
        if (t.status === 'completed') a.completed++;
        if (t.status === 'in_progress' || t.status === 'assigned') a.active++;
      }
    }
    stats.avgDurationMs = durationCount > 0 ? Math.round(durationSum / durationCount) : 0;
    stats.topAgents = Array.from(agentMap.entries())
      .map(([agent, d]) => ({ agent, ...d }))
      .sort((a, b) => (b.completed + b.active) - (a.completed + a.active))
      .slice(0, 5);

    // If DB available, also query today's stats from DB to catch anything not in memory
    if (this.db) {
      try {
        const todayISO = todayStart.toISOString();
        const dbToday = await this.db.get(
          `SELECT COUNT(*) FILTER (WHERE status='completed' AND completed_at >= ?) as dc,
                  COUNT(*) FILTER (WHERE status='failed' AND completed_at >= ?) as df,
                  COUNT(*) FILTER (WHERE created_at >= ?) as dn
           FROM task_pipeline` + (orgId ? ` WHERE org_id = ?` : ''),
          orgId ? [todayISO, todayISO, todayISO, orgId] : [todayISO, todayISO, todayISO]
        ).catch(() => null);
        // Postgres FILTER may not work on all DBs, fallback to separate counts
        if (!dbToday || dbToday.dc === undefined) {
          const r1 = await this.db.get(`SELECT COUNT(*) as c FROM task_pipeline WHERE status='completed' AND completed_at >= ?`, [todayISO]).catch(() => null);
          const r2 = await this.db.get(`SELECT COUNT(*) as c FROM task_pipeline WHERE status='failed' AND completed_at >= ?`, [todayISO]).catch(() => null);
          const r3 = await this.db.get(`SELECT COUNT(*) as c FROM task_pipeline WHERE created_at >= ?`, [todayISO]).catch(() => null);
          if (r1?.c > stats.todayCompleted) stats.todayCompleted = r1.c;
          if (r2?.c > stats.todayFailed) stats.todayFailed = r2.c;
          if (r3?.c > stats.todayCreated) stats.todayCreated = r3.c;
        } else {
          if (dbToday.dc > stats.todayCompleted) stats.todayCompleted = dbToday.dc;
          if (dbToday.df > stats.todayFailed) stats.todayFailed = dbToday.df;
          if (dbToday.dn > stats.todayCreated) stats.todayCreated = dbToday.dn;
        }
      } catch { /* ignore — in-memory stats are fine */ }
    }

    return stats;
  }

  // ─── SSE Subscriptions ────────────────────────────────

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: TaskEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch { /* ignore */ }
    }
  }

  // ─── Persistence ──────────────────────────────────────

  private async persist(task: TaskRecord): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.run(`INSERT INTO task_pipeline (
        id, org_id, assigned_to, assigned_to_name, created_by, created_by_name,
        title, description, category, tags, status, priority, progress,
        created_at, assigned_at, started_at, completed_at,
        estimated_duration_ms, actual_duration_ms, result, error,
        parent_task_id, related_agent_ids, session_id,
        model, fallback_model, model_used, tokens_used, cost_usd,
        chain_id, chain_seq, delegated_from, delegated_to, delegation_type,
        customer_context, activity_log, source
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT (id) DO UPDATE SET
          status=EXCLUDED.status, priority=EXCLUDED.priority, progress=EXCLUDED.progress,
          assigned_at=EXCLUDED.assigned_at, started_at=EXCLUDED.started_at, completed_at=EXCLUDED.completed_at,
          actual_duration_ms=EXCLUDED.actual_duration_ms, result=EXCLUDED.result, error=EXCLUDED.error,
          model_used=EXCLUDED.model_used, tokens_used=EXCLUDED.tokens_used, cost_usd=EXCLUDED.cost_usd,
          session_id=EXCLUDED.session_id, title=EXCLUDED.title, description=EXCLUDED.description,
          delegated_to=EXCLUDED.delegated_to, activity_log=EXCLUDED.activity_log`, [
        task.id, task.orgId, task.assignedTo, task.assignedToName,
        task.createdBy, task.createdByName,
        task.title, task.description, task.category, JSON.stringify(task.tags),
        task.status, task.priority, task.progress,
        task.createdAt, task.assignedAt, task.startedAt, task.completedAt,
        task.estimatedDurationMs, task.actualDurationMs,
        task.result ? JSON.stringify(task.result) : null,
        task.error,
        task.parentTaskId, JSON.stringify(task.relatedAgentIds), task.sessionId,
        task.model, task.fallbackModel, task.modelUsed, task.tokensUsed, task.costUsd,
        task.chainId, task.chainSeq, task.delegatedFrom, task.delegatedTo, task.delegationType,
        task.customerContext ? JSON.stringify(task.customerContext) : null,
        JSON.stringify(task.activityLog || []),
        task.source,
      ]);
    } catch (e: any) {
      console.error('[TaskQueue] persist error:', e.message);
    }
  }

  private rowToTask(row: any): TaskRecord {
    return {
      id: row.id,
      orgId: row.org_id,
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name || '',
      createdBy: row.created_by || 'system',
      createdByName: row.created_by_name || '',
      title: row.title,
      description: row.description || '',
      category: row.category || 'custom',
      tags: safeJson(row.tags, []),
      status: row.status as TaskStatus,
      priority: (row.priority || 'normal') as TaskPriority,
      progress: row.progress || 0,
      createdAt: row.created_at,
      assignedAt: row.assigned_at || null,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
      estimatedDurationMs: row.estimated_duration_ms || null,
      actualDurationMs: row.actual_duration_ms || null,
      result: safeJson(row.result, null),
      error: row.error || null,
      parentTaskId: row.parent_task_id || null,
      relatedAgentIds: safeJson(row.related_agent_ids, []),
      sessionId: row.session_id || null,
      model: row.model || null,
      fallbackModel: row.fallback_model || null,
      modelUsed: row.model_used || null,
      tokensUsed: row.tokens_used || 0,
      costUsd: row.cost_usd || 0,
      chainId: row.chain_id || null,
      chainSeq: row.chain_seq || 0,
      delegatedFrom: row.delegated_from || null,
      delegatedTo: row.delegated_to || null,
      delegationType: row.delegation_type || null,
      customerContext: safeJson(row.customer_context, null),
      source: row.source || null,
      activityLog: safeJson(row.activity_log, []),
    };
  }
}

function safeJson(v: any, fallback: any): any {
  if (!v || typeof v !== 'string') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
