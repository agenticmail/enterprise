/**
 * AgentTaskManager — per-agent local task tracker (Postgres-backed).
 *
 * A Google-Tasks-style checklist that an agent owns and updates AS IT
 * WORKS. This is deliberately separate from `task_queue` (the inter-agent
 * delegation/spawn queue): this is the agent's OWN to-do list — e.g.
 * "120 NC cities, mark each DONE as the emails go out". Survives restarts
 * and deployments (it's in the DB), so an agent never loses its place.
 *
 * Lists are just a `list` label (auto-created by name) — multiple lists
 * per agent without a separate table. Tasks support subtasks (parent_id),
 * priority, due dates, tags, notes, and ordered positions.
 */

import crypto from 'node:crypto';

// Minimal DB surface we depend on — matches what AgentMemoryManager uses.
interface EngineDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<any>;
}

export type TaskStatus = 'needs_action' | 'in_progress' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'normal' | 'high';

export const TASK_STATUSES: TaskStatus[] = ['needs_action', 'in_progress', 'completed', 'blocked'];
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];

export interface AgentTask {
  id: string;
  agentId: string;
  orgId: string;
  list: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string | null;
  parentId: string | null;
  position: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskInput {
  agentId: string;
  orgId?: string;
  list?: string;
  title: string;
  notes?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: string | null;
  parentId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: string | null;
  list?: string;
  parentId?: string | null;
  position?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListTaskOptions {
  agentId: string;
  list?: string;
  status?: TaskStatus | TaskStatus[];
  parentId?: string | null;
  tag?: string;
  includeCompleted?: boolean;
  limit?: number;
}

export class AgentTaskManager {
  private db?: EngineDatabase;

  async setDb(db: EngineDatabase): Promise<void> {
    this.db = db;
  }

  get ready(): boolean { return !!this.db; }

  private rowToTask(r: any): AgentTask {
    const parse = (v: any, fallback: any) => {
      if (v == null) return fallback;
      if (typeof v === 'object') return v; // postgres JSONB returns objects
      try { return JSON.parse(v); } catch { return fallback; }
    };
    return {
      id: r.id,
      agentId: r.agent_id,
      orgId: r.org_id,
      list: r.list || 'Tasks',
      title: r.title,
      notes: r.notes || '',
      status: r.status,
      priority: r.priority || 'normal',
      due: r.due ?? null,
      parentId: r.parent_id ?? null,
      position: typeof r.position === 'number' ? r.position : Number(r.position) || 0,
      tags: parse(r.tags, []),
      metadata: parse(r.metadata, {}),
      createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
      completedAt: r.completed_at ? (typeof r.completed_at === 'string' ? r.completed_at : new Date(r.completed_at).toISOString()) : null,
    };
  }

  async createTask(input: CreateTaskInput): Promise<AgentTask> {
    if (!this.db) throw new Error('Task manager DB not initialized');
    const now = new Date().toISOString();
    const list = (input.list || 'Tasks').trim() || 'Tasks';

    // Append to the end of the list by default.
    const maxRows = await this.db.query<any>(
      'SELECT COALESCE(MAX(position), -1) AS maxpos FROM agent_tasks WHERE agent_id = ? AND list = ?',
      [input.agentId, list],
    );
    const position = (Number(maxRows?.[0]?.maxpos) || -1) + 1;

    const task: AgentTask = {
      id: crypto.randomUUID(),
      agentId: input.agentId,
      orgId: input.orgId || 'default',
      list,
      title: input.title,
      notes: input.notes || '',
      status: input.status || 'needs_action',
      priority: input.priority || 'normal',
      due: input.due ?? null,
      parentId: input.parentId ?? null,
      position,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      completedAt: input.status === 'completed' ? now : null,
    };

    await this.db.execute(
      `INSERT INTO agent_tasks (id, agent_id, org_id, list, title, notes, status, priority, due, parent_id, position, tags, metadata, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id, task.agentId, task.orgId, task.list, task.title, task.notes,
        task.status, task.priority, task.due, task.parentId, task.position,
        JSON.stringify(task.tags), JSON.stringify(task.metadata),
        task.createdAt, task.updatedAt, task.completedAt,
      ],
    );
    return task;
  }

  async getTask(agentId: string, id: string): Promise<AgentTask | null> {
    if (!this.db) return null;
    const rows = await this.db.query<any>('SELECT * FROM agent_tasks WHERE agent_id = ? AND id = ?', [agentId, id]);
    return rows[0] ? this.rowToTask(rows[0]) : null;
  }

  async listTasks(opts: ListTaskOptions): Promise<AgentTask[]> {
    if (!this.db) return [];
    const where: string[] = ['agent_id = ?'];
    const params: any[] = [opts.agentId];
    if (opts.list) { where.push('list = ?'); params.push(opts.list); }
    if (opts.status) {
      const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
      where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    } else if (!opts.includeCompleted) {
      where.push("status != 'completed'");
    }
    if (opts.parentId !== undefined) {
      if (opts.parentId === null) where.push('parent_id IS NULL');
      else { where.push('parent_id = ?'); params.push(opts.parentId); }
    }
    const limit = Math.min(opts.limit ?? 200, 500);
    const rows = await this.db.query<any>(
      `SELECT * FROM agent_tasks WHERE ${where.join(' AND ')} ORDER BY list ASC, position ASC, created_at ASC LIMIT ${limit}`,
      params,
    );
    let tasks = rows.map((r) => this.rowToTask(r));
    if (opts.tag) tasks = tasks.filter((t) => t.tags.includes(opts.tag!));
    return tasks;
  }

  async updateTask(agentId: string, id: string, updates: UpdateTaskInput): Promise<AgentTask | null> {
    const existing = await this.getTask(agentId, id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const next: AgentTask = { ...existing, ...stripUndefined(updates), updatedAt: now } as AgentTask;
    // completed_at bookkeeping
    if (updates.status === 'completed' && existing.status !== 'completed') next.completedAt = now;
    if (updates.status && updates.status !== 'completed') next.completedAt = null;

    await this.db!.execute(
      `UPDATE agent_tasks SET list = ?, title = ?, notes = ?, status = ?, priority = ?, due = ?, parent_id = ?, position = ?, tags = ?, metadata = ?, updated_at = ?, completed_at = ?
       WHERE agent_id = ? AND id = ?`,
      [
        next.list, next.title, next.notes, next.status, next.priority, next.due,
        next.parentId, next.position, JSON.stringify(next.tags), JSON.stringify(next.metadata),
        next.updatedAt, next.completedAt, agentId, id,
      ],
    );
    return next;
  }

  async deleteTask(agentId: string, id: string): Promise<boolean> {
    if (!this.db) return false;
    // Cascade: delete the task and any subtasks.
    await this.db.execute('DELETE FROM agent_tasks WHERE agent_id = ? AND (id = ? OR parent_id = ?)', [agentId, id, id]);
    return true;
  }

  async clearCompleted(agentId: string, list?: string): Promise<number> {
    if (!this.db) return 0;
    const before = await this.listTasks({ agentId, list, status: 'completed', includeCompleted: true, limit: 500 });
    if (list) await this.db.execute("DELETE FROM agent_tasks WHERE agent_id = ? AND list = ? AND status = 'completed'", [agentId, list]);
    else await this.db.execute("DELETE FROM agent_tasks WHERE agent_id = ? AND status = 'completed'", [agentId]);
    return before.length;
  }

  async getStats(agentId: string): Promise<{ total: number; byStatus: Record<string, number>; byList: Record<string, number> }> {
    if (!this.db) return { total: 0, byStatus: {}, byList: {} };
    const rows = await this.db.query<any>('SELECT status, list FROM agent_tasks WHERE agent_id = ?', [agentId]);
    const byStatus: Record<string, number> = {};
    const byList: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byList[r.list || 'Tasks'] = (byList[r.list || 'Tasks'] || 0) + 1;
    }
    return { total: rows.length, byStatus, byList };
  }

  async listLists(agentId: string): Promise<string[]> {
    if (!this.db) return [];
    const rows = await this.db.query<any>('SELECT DISTINCT list FROM agent_tasks WHERE agent_id = ? ORDER BY list ASC', [agentId]);
    return rows.map((r) => r.list || 'Tasks');
  }
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj)) { if ((obj as any)[k] !== undefined) (out as any)[k] = (obj as any)[k]; }
  return out;
}
