/**
 * Agent Workforce Manager — Working Hours, Clock-In/Out & Task Queue
 *
 * Manages agent work schedules with automatic enforcement:
 * - Per-agent working hours (standard 9-5, shift-based, or custom)
 * - Automated clock-in/out at scheduled times
 * - Off-hours enforcement via guardrails pipeline
 * - Task queue for work continuity between sessions
 * - Automated counter resets (daily/weekly/monthly/annual)
 */

import type { EngineDatabase } from './db-adapter.js';
import type { AgentLifecycleManager, ManagedAgent, LifecycleEventType } from './lifecycle.js';
import type { GuardrailEngine } from './guardrails.js';
import { computeNextFire, validateCron } from './cron.js';

// ─── Types ──────────────────────────────────────────────

export interface WorkSchedule {
  id: string;
  agentId: string;
  orgId: string;
  timezone: string;                    // IANA timezone e.g. "America/New_York"
  scheduleType: 'standard' | 'shift' | 'custom';
  config: {
    standardHours?: {
      start: string;                   // "09:00"
      end: string;                     // "17:00"
      daysOfWeek: number[];            // 0=Sun, 1=Mon ... 6=Sat
    };
    shifts?: {
      name: string;
      start: string;
      end: string;
      daysOfWeek: number[];
    }[];
    customRules?: {
      date: string;                    // "2026-03-15"
      type: 'off' | 'working';
      start?: string;
      end?: string;
      reason?: string;
    }[];
  };
  enforceClockIn: boolean;
  enforceClockOut: boolean;
  autoWakeEnabled: boolean;
  offHoursAction: 'pause' | 'stop' | 'queue';
  gracePeriodMinutes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClockRecord {
  id: string;
  agentId: string;
  orgId: string;
  type: 'clock_in' | 'clock_out' | 'auto_pause' | 'auto_wake' | 'overtime_start' | 'overtime_end';
  triggeredBy: string;
  scheduledAt?: string;
  actualAt: string;
  reason?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface QueuedTask {
  id: string;
  agentId: string;
  orgId: string;
  type: 'continue' | 'new' | 'scheduled' | 'delegation' | 'recurring';
  title: string;
  description?: string;
  context: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'queued' | 'in_progress' | 'completed' | 'cancelled' | 'template';
  source: string;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  /**
   * Cron expression. When set, this row is a recurring TEMPLATE — it never
   * executes itself; the scheduler clones it into a queued execution row
   * each time `nextFireAt` falls due.
   */
  recurrenceRule?: string;
  /** IANA timezone for cron evaluation (defaults to UTC) */
  recurrenceTimezone?: string;
  /** Execution rows point back to their template via this field */
  parentTaskId?: string;
  /** Templates only: next computed fire time (UTC ISO) */
  nextFireAt?: string;
  /** Templates only: most recent fire time (UTC ISO) */
  lastFiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkforceStatus {
  agents: {
    id: string;
    name: string;
    clockStatus: 'clocked_in' | 'clocked_out' | 'no_schedule';
    schedule?: WorkSchedule;
    nextEvent?: { type: string; at: string };
    queuedTasks: number;
  }[];
  totalClocked: number;
  totalOff: number;
  totalUnscheduled: number;
}

// ─── Workforce Manager ──────────────────────────────────

export class WorkforceManager {
  private schedules = new Map<string, WorkSchedule>();
  private clockStatus = new Map<string, 'clocked_in' | 'clocked_out'>();
  private engineDb?: EngineDatabase;
  private lifecycle?: AgentLifecycleManager;
  private guardrails?: GuardrailEngine;
  private schedulerInterval?: NodeJS.Timeout;
  private lastDailyReset: string = '';
  private lastWeeklyReset: string = '';
  private lastMonthlyReset: string = '';
  private lastAnnualReset: string = '';
  private eventListeners: ((event: any) => void)[] = [];

  constructor(opts?: { lifecycle?: AgentLifecycleManager; guardrails?: GuardrailEngine }) {
    if (opts?.lifecycle) this.lifecycle = opts.lifecycle;
    if (opts?.guardrails) this.guardrails = opts.guardrails;
  }

  // ─── Database ─────────────────────────────────────────

  /**
   * Set the database adapter and load schedules from DB.
   * Initializes clock status based on current time vs each agent's schedule.
   */
  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  /**
   * Load all work schedules from DB and initialize clock status.
   */
  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM work_schedules WHERE enabled = TRUE');
      for (const r of rows) {
        const schedule: WorkSchedule = {
          id: r.id,
          agentId: r.agent_id,
          orgId: r.org_id,
          timezone: r.timezone || 'UTC',
          scheduleType: r.schedule_type || 'standard',
          config: typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {}),
          enforceClockIn: !!r.enforce_clock_in,
          enforceClockOut: !!r.enforce_clock_out,
          autoWakeEnabled: !!r.auto_wake_enabled,
          offHoursAction: r.off_hours_action || 'pause',
          gracePeriodMinutes: r.grace_period_minutes ?? 5,
          enabled: !!r.enabled,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
        this.schedules.set(schedule.agentId, schedule);

        // Determine initial clock status based on current time
        const localNow = this.toTimezone(new Date(), schedule.timezone);
        if (this.isWithinWorkingHours(schedule, localNow)) {
          this.clockStatus.set(schedule.agentId, 'clocked_in');
        } else {
          this.clockStatus.set(schedule.agentId, 'clocked_out');
        }
      }
    } catch {
      // Table may not exist yet if migrations haven't run
    }
  }

  // ─── Schedule CRUD ────────────────────────────────────

  /**
   * Create or update a work schedule for an agent.
   */
  async setSchedule(schedule: WorkSchedule): Promise<void> {
    this.schedules.set(schedule.agentId, schedule);

    if (this.engineDb) {
      await this.engineDb.execute(
        `INSERT INTO work_schedules (id, agent_id, org_id, timezone, schedule_type, config, enforce_clock_in, enforce_clock_out, auto_wake_enabled, off_hours_action, grace_period_minutes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           timezone=excluded.timezone, schedule_type=excluded.schedule_type,
           config=excluded.config, enforce_clock_in=excluded.enforce_clock_in,
           enforce_clock_out=excluded.enforce_clock_out, auto_wake_enabled=excluded.auto_wake_enabled,
           off_hours_action=excluded.off_hours_action, grace_period_minutes=excluded.grace_period_minutes,
           enabled=excluded.enabled, updated_at=excluded.updated_at`,
        [
          schedule.id, schedule.agentId, schedule.orgId, schedule.timezone,
          schedule.scheduleType, JSON.stringify(schedule.config),
          schedule.enforceClockIn ? 1 : 0, schedule.enforceClockOut ? 1 : 0,
          schedule.autoWakeEnabled ? 1 : 0, schedule.offHoursAction,
          schedule.gracePeriodMinutes, schedule.enabled ? 1 : 0,
          schedule.createdAt, schedule.updatedAt,
        ]
      ).catch((err) => { console.error('[workforce] Failed to persist schedule:', err); });
    }

    // Initialize clock status for new schedule
    if (!this.clockStatus.has(schedule.agentId)) {
      const localNow = this.toTimezone(new Date(), schedule.timezone);
      if (this.isWithinWorkingHours(schedule, localNow)) {
        this.clockStatus.set(schedule.agentId, 'clocked_in');
      } else {
        this.clockStatus.set(schedule.agentId, 'clocked_out');
      }
    }

    this.emitEvent('schedule_set', { agentId: schedule.agentId, schedule });
  }

  /**
   * Remove an agent's work schedule.
   */
  async removeSchedule(agentId: string): Promise<void> {
    this.schedules.delete(agentId);
    this.clockStatus.delete(agentId);

    if (this.engineDb) {
      await this.engineDb.execute('DELETE FROM work_schedules WHERE agent_id = ?', [agentId])
        .catch((err) => { console.error('[workforce] Failed to delete schedule:', err); });
    }

    this.emitEvent('schedule_removed', { agentId });
  }

  /**
   * Get the work schedule for an agent.
   */
  getSchedule(agentId: string): WorkSchedule | undefined {
    return this.schedules.get(agentId);
  }

  /**
   * Get all work schedules for an organization.
   */
  getSchedulesByOrg(orgId: string): WorkSchedule[] {
    const results: WorkSchedule[] = [];
    for (const schedule of this.schedules.values()) {
      if (schedule.orgId === orgId) results.push(schedule);
    }
    return results;
  }

  // ─── Clock Operations ────────────────────────────────

  /**
   * Clock an agent in — mark as working and resume if paused.
   */
  async clockIn(agentId: string, triggeredBy: string): Promise<ClockRecord> {
    const schedule = this.schedules.get(agentId);
    const orgId = schedule?.orgId || 'default';

    this.clockStatus.set(agentId, 'clocked_in');

    const record = await this.recordClockEvent(agentId, orgId, 'clock_in', triggeredBy);

    // Resume agent if it was paused by guardrails
    if (this.guardrails) {
      try {
        await this.guardrails.resumeAgent(agentId, 'Clock-in: resuming agent', triggeredBy);
      } catch { /* agent may not be paused */ }
    }

    this.emitEvent('clock_in', { agentId, triggeredBy, record });
    return record;
  }

  /**
   * Clock an agent out — mark as off-duty and enforce off-hours action.
   */
  async clockOut(agentId: string, triggeredBy: string, reason?: string): Promise<ClockRecord> {
    const schedule = this.schedules.get(agentId);
    const orgId = schedule?.orgId || 'default';

    this.clockStatus.set(agentId, 'clocked_out');

    const record = await this.recordClockEvent(agentId, orgId, 'clock_out', triggeredBy, undefined, reason);

    // Enforce off-hours action based on schedule
    if (schedule) {
      switch (schedule.offHoursAction) {
        case 'pause':
          if (this.guardrails) {
            await this.guardrails.pauseAgent(agentId, reason || 'Clock-out: agent paused', triggeredBy);
          }
          break;
        case 'stop':
          if (this.lifecycle) {
            await this.lifecycle.stop(agentId, triggeredBy, reason || 'Clock-out: agent stopped').catch(() => {});
          }
          break;
        case 'queue':
          // Just mark status — don't interrupt the agent
          break;
      }
    }

    this.emitEvent('clock_out', { agentId, triggeredBy, reason, record });
    return record;
  }

  /**
   * Get the current clock status of an agent.
   * Returns 'no_schedule' if the agent has no work schedule.
   */
  getClockStatus(agentId: string): 'clocked_in' | 'clocked_out' | 'no_schedule' {
    if (!this.schedules.has(agentId)) return 'no_schedule';
    return this.clockStatus.get(agentId) || 'clocked_out';
  }

  /**
   * Returns true if the agent has a schedule AND is clocked out.
   * Returns false if no schedule exists (no restrictions apply).
   * Queried by the guardrails status endpoint.
   */
  isOffDuty(agentId: string): boolean {
    if (!this.schedules.has(agentId)) return false;
    return this.clockStatus.get(agentId) === 'clocked_out';
  }

  /**
   * Check if an agent should be working RIGHT NOW based on their schedule.
   * Returns { onDuty, schedule, reason } — does not depend on clock status,
   * only the schedule definition.
   */
  shouldBeWorking(agentId: string): { onDuty: boolean; schedule: WorkSchedule | null; reason: string } {
    const schedule = this.schedules.get(agentId);
    if (!schedule || !schedule.enabled) {
      return { onDuty: true, schedule: null, reason: 'No schedule defined — always on' };
    }

    // Get current time in the agent's timezone
    const tz = schedule.timezone || 'UTC';
    const localNow = this.toTimezone(new Date(), tz);
    const within = this.isWithinWorkingHours(schedule, localNow);

    if (within) {
      return { onDuty: true, schedule, reason: 'Within scheduled work hours' };
    } else {
      const dayOfWeek = localNow.getDay();
      const timeStr = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}`;
      return { onDuty: false, schedule, reason: `Off duty (${tz}: ${timeStr}, day ${dayOfWeek})` };
    }
  }

  /**
   * Get the manager email for an agent (for bypass checks)
   */
  getManagerEmail(agentId: string): string {
    const agent = this.lifecycle?.getAgent(agentId);
    if (!agent) return '';
    const config = agent.config || {};
    return (config as any).managerEmail
      || ((config as any).manager?.type === 'external' ? (config as any).manager?.email : '')
      || '';
  }

  // ─── Task Queue ──────────────────────────────────────

  /**
   * Add a task to the agent's queue.
   *
   * If `recurrenceRule` is set the row is stored as a TEMPLATE
   * (status='template'). The scheduler will clone it into execution
   * rows on each fire of the cron expression. `nextFireAt` is computed
   * here so the scheduler can pick it up on its next tick.
   */
  async addTask(task: Omit<QueuedTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<QueuedTask> {
    const now = new Date().toISOString();

    // Validate + compute next fire for recurring templates
    let nextFireAt: string | undefined;
    let status = task.status;
    if (task.recurrenceRule) {
      const err = validateCron(task.recurrenceRule);
      if (err) throw new Error(`invalid recurrenceRule: ${err}`);
      const tz = task.recurrenceTimezone || 'UTC';
      const next = computeNextFire(task.recurrenceRule, tz);
      if (!next) throw new Error('recurrenceRule produced no future fire time within 1 year');
      nextFireAt = next.toISOString();
      status = 'template';
    }

    const queued: QueuedTask = {
      ...task,
      status,
      nextFireAt: nextFireAt || task.nextFireAt,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    if (this.engineDb) {
      await this.engineDb.execute(
        `INSERT INTO task_queue (id, agent_id, org_id, type, title, description, context, priority, status, source, scheduled_for, started_at, completed_at, recurrence_rule, recurrence_timezone, parent_task_id, next_fire_at, last_fired_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queued.id, queued.agentId, queued.orgId, queued.type,
          queued.title, queued.description || null, JSON.stringify(queued.context),
          queued.priority, queued.status, queued.source,
          queued.scheduledFor || null, queued.startedAt || null,
          queued.completedAt || null,
          queued.recurrenceRule || null, queued.recurrenceTimezone || null,
          queued.parentTaskId || null, queued.nextFireAt || null,
          queued.lastFiredAt || null,
          queued.createdAt, queued.updatedAt,
        ]
      ).catch((err) => { console.error('[workforce] Failed to persist task:', err); });
    }

    this.emitEvent(queued.status === 'template' ? 'recurring_task_added' : 'task_added', { task: queued });
    return queued;
  }

  /**
   * Get tasks for an agent, optionally filtered by status.
   * Ordered by priority (urgent first) then creation time (oldest first).
   */
  async getAgentTasks(agentId: string, status?: QueuedTask['status']): Promise<QueuedTask[]> {
    if (!this.engineDb) return [];

    const priorityOrder = "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END";
    // Templates are returned alongside one-shot tasks so the dashboard
    // task queue shows the full picture (recurring shifts + ad-hoc
    // tasks). The UI distinguishes templates via the 'template' status
    // badge + a "next fire" column. Status filters can still narrow
    // either side.
    let sql = `SELECT * FROM task_queue WHERE agent_id = ?`;
    const params: any[] = [agentId];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY ${priorityOrder} ASC, created_at ASC`;

    try {
      const rows = await this.engineDb.query<any>(sql, params);
      return rows.map((r: any) => this.rowToTask(r));
    } catch {
      return [];
    }
  }

  /**
   * Update fields on a queued task.
   */
  async updateTask(taskId: string, updates: Partial<Pick<QueuedTask, 'status' | 'startedAt' | 'completedAt' | 'priority'>>): Promise<void> {
    if (!this.engineDb) return;

    const sets: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.startedAt !== undefined) {
      sets.push('started_at = ?');
      params.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      sets.push('completed_at = ?');
      params.push(updates.completedAt);
    }
    if (updates.priority !== undefined) {
      sets.push('priority = ?');
      params.push(updates.priority);
    }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(taskId);

    await this.engineDb.execute(
      `UPDATE task_queue SET ${sets.join(', ')} WHERE id = ?`,
      params
    ).catch((err) => { console.error('[workforce] Failed to update task:', err); });
  }

  /**
   * Save the agent's current work context as a 'continue' task.
   * Used at clock-out to preserve work state for the next session.
   */
  async saveTaskState(agentId: string, context: Record<string, any>): Promise<QueuedTask> {
    const schedule = this.schedules.get(agentId);
    const orgId = schedule?.orgId || 'default';

    return this.addTask({
      agentId,
      orgId,
      type: 'continue',
      title: 'Continue previous work session',
      description: 'Auto-saved work state from clock-out',
      context,
      priority: 'normal',
      status: 'queued',
      source: 'workforce-scheduler',
    });
  }

  // ─── Scheduler ───────────────────────────────────────

  /**
   * Start the scheduler loop — runs every 60 seconds.
   */
  startScheduler(): void {
    this.stopScheduler();
    this.schedulerTick().catch((err) => { console.error('[workforce] Scheduler tick error:', err); });
    this.schedulerInterval = setInterval(() => {
      this.schedulerTick().catch((err) => { console.error('[workforce] Scheduler tick error:', err); });
    }, 60_000);

    // Sync Gmail vacation responder state on startup (delayed to allow tokens to load)
    setTimeout(() => this.syncVacationState().catch(() => {}), 15_000);
  }

  /**
   * Sync Gmail vacation auto-responder with current clock status.
   * Called on startup to ensure responder matches actual work hours state.
   */
  private async syncVacationState(): Promise<void> {
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled) continue;
      const status = this.clockStatus.get(schedule.agentId);
      const isOffDuty = status === 'clocked_out';
      try {
        await this.setGmailVacation(schedule.agentId, isOffDuty, isOffDuty ? schedule : undefined);
      } catch (e: any) {
        // Silent — not all agents may have Gmail
      }
    }
  }

  /**
   * Stop the scheduler loop.
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
    }
  }

  /**
   * Core automation loop — runs every minute.
   * Checks schedules and auto-clocks agents in/out as needed.
   */
  private async schedulerTick(): Promise<void> {
    const now = new Date();

    // Reset counters as needed
    this.checkAndResetCounters(now);

    // Process each enabled schedule
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled) continue;

      try {
        const localNow = this.toTimezone(now, schedule.timezone);
        const shouldBeWorking = this.isWithinWorkingHours(schedule, localNow);
        const currentStatus = this.clockStatus.get(schedule.agentId);

        if (shouldBeWorking && currentStatus === 'clocked_out' && schedule.autoWakeEnabled) {
          await this.autoClockIn(schedule.agentId, schedule);
        } else if (!shouldBeWorking && currentStatus === 'clocked_in' && schedule.enforceClockOut) {
          await this.autoClockOut(schedule.agentId, schedule);
        }
      } catch (err) {
        console.error(`[workforce] Scheduler error for agent ${schedule.agentId}:`, err);
      }
    }

    // Fire any recurring task templates that are due
    await this.fireRecurringTasks(now).catch((err) => {
      console.error('[workforce] Recurring task fire error:', err);
    });
  }

  /**
   * Find recurring task TEMPLATES whose next_fire_at has come due, clone each
   * into a fresh queued execution row, and compute the next fire time.
   *
   * Executions point back to their template via parent_task_id so history is
   * preserved across runs. The template's own status stays 'template'; it
   * never executes itself.
   *
   * `fireBudget` caps how many executions we'll spawn per tick to prevent a
   * thundering herd if the engine has been offline for a while — extra fires
   * are still scheduled correctly on subsequent ticks via next_fire_at.
   */
  private async fireRecurringTasks(now: Date, fireBudget = 25): Promise<void> {
    if (!this.engineDb) return;

    const nowIso = now.toISOString();
    let dueTemplates: any[] = [];
    try {
      dueTemplates = await this.engineDb.query<any>(
        `SELECT * FROM task_queue WHERE status = 'template' AND recurrence_rule IS NOT NULL AND next_fire_at IS NOT NULL AND next_fire_at <= ? ORDER BY next_fire_at ASC LIMIT ?`,
        [nowIso, fireBudget],
      );
    } catch {
      // Column may not exist yet on a partially-migrated DB — bail silently.
      return;
    }

    for (const r of dueTemplates) {
      try {
        const tpl = this.rowToTask(r);
        const execId = crypto.randomUUID();
        const cloneCreatedAt = nowIso;

        // Clone into a queued execution row. The execution inherits the
        // template's title/description/context so downstream session
        // routing sees a normal one-shot task with no special handling.
        await this.engineDb.execute(
          `INSERT INTO task_queue (id, agent_id, org_id, type, title, description, context, priority, status, source, scheduled_for, parent_task_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
          [
            execId, tpl.agentId, tpl.orgId,
            // Surface 'scheduled' so existing pollers treat this as a wake-up.
            'scheduled',
            tpl.title, tpl.description || null,
            JSON.stringify({ ...tpl.context, _recurringTemplateId: tpl.id }),
            tpl.priority, tpl.source || 'recurring',
            tpl.nextFireAt || nowIso, tpl.id, cloneCreatedAt, cloneCreatedAt,
          ],
        );

        // Compute the next fire time strictly after the fire we just emitted.
        // Using nextFireAt (rather than `now`) keeps the cadence stable even
        // if a tick was delayed.
        const afterDate = tpl.nextFireAt ? new Date(tpl.nextFireAt) : now;
        const next = computeNextFire(
          tpl.recurrenceRule!,
          tpl.recurrenceTimezone || 'UTC',
          afterDate,
        );
        await this.engineDb.execute(
          `UPDATE task_queue SET next_fire_at = ?, last_fired_at = ?, updated_at = ? WHERE id = ?`,
          [next ? next.toISOString() : null, nowIso, nowIso, tpl.id],
        );

        this.emitEvent('recurring_task_fired', {
          templateId: tpl.id,
          executionId: execId,
          agentId: tpl.agentId,
          title: tpl.title,
          nextFireAt: next ? next.toISOString() : null,
        });
      } catch (err: any) {
        console.error(`[workforce] Failed to fire recurring task ${r.id}:`, err.message);
        // Push next_fire_at forward by one minute on failure so we don't hot-loop.
        try {
          const fallback = new Date(now.getTime() + 60_000).toISOString();
          await this.engineDb.execute(
            `UPDATE task_queue SET next_fire_at = ?, updated_at = ? WHERE id = ?`,
            [fallback, nowIso, r.id],
          );
        } catch { /* best effort */ }
      }
    }
  }

  // ─── Recurring Task API ──────────────────────────────

  /** List recurring task templates, optionally filtered by agent. */
  async listRecurringTemplates(agentId?: string): Promise<QueuedTask[]> {
    if (!this.engineDb) return [];
    try {
      const sql = agentId
        ? `SELECT * FROM task_queue WHERE status = 'template' AND agent_id = ? ORDER BY next_fire_at ASC`
        : `SELECT * FROM task_queue WHERE status = 'template' ORDER BY next_fire_at ASC`;
      const rows = await this.engineDb.query<any>(sql, agentId ? [agentId] : []);
      return rows.map((r: any) => this.rowToTask(r));
    } catch {
      return [];
    }
  }

  /**
   * Update a recurring template. Only fields meaningful for recurrence are
   * editable; status changes go through the normal updateTask path.
   * Recomputes nextFireAt when the rule or timezone changes.
   */
  async updateRecurringTemplate(
    templateId: string,
    updates: {
      title?: string;
      description?: string;
      priority?: QueuedTask['priority'];
      recurrenceRule?: string;
      recurrenceTimezone?: string;
      context?: Record<string, any>;
      enabled?: boolean;
    },
  ): Promise<QueuedTask | null> {
    if (!this.engineDb) return null;
    const rows = await this.engineDb.query<any>(
      `SELECT * FROM task_queue WHERE id = ? AND status IN ('template', 'cancelled')`,
      [templateId],
    );
    if (rows.length === 0) return null;
    const existing = this.rowToTask(rows[0]);

    const newRule = updates.recurrenceRule ?? existing.recurrenceRule;
    const newTz = updates.recurrenceTimezone ?? existing.recurrenceTimezone ?? 'UTC';
    if (newRule) {
      const err = validateCron(newRule);
      if (err) throw new Error(`invalid recurrenceRule: ${err}`);
    }

    const ruleChanged = updates.recurrenceRule !== undefined || updates.recurrenceTimezone !== undefined;
    let nextFireAt = existing.nextFireAt;
    if (ruleChanged && newRule) {
      const next = computeNextFire(newRule, newTz);
      nextFireAt = next ? next.toISOString() : undefined;
    }

    const status = updates.enabled === false ? 'cancelled' : 'template';
    const nowIso = new Date().toISOString();
    const sets: string[] = [];
    const vals: any[] = [];
    const push = (col: string, val: any) => { sets.push(`${col} = ?`); vals.push(val); };

    if (updates.title !== undefined) push('title', updates.title);
    if (updates.description !== undefined) push('description', updates.description);
    if (updates.priority !== undefined) push('priority', updates.priority);
    if (updates.context !== undefined) push('context', JSON.stringify(updates.context));
    if (updates.recurrenceRule !== undefined) push('recurrence_rule', newRule || null);
    if (updates.recurrenceTimezone !== undefined) push('recurrence_timezone', newTz);
    if (ruleChanged) push('next_fire_at', nextFireAt || null);
    if (updates.enabled !== undefined) push('status', status);
    push('updated_at', nowIso);
    vals.push(templateId);

    await this.engineDb.execute(
      `UPDATE task_queue SET ${sets.join(', ')} WHERE id = ?`,
      vals,
    );

    const updated = await this.engineDb.query<any>('SELECT * FROM task_queue WHERE id = ?', [templateId]);
    return updated.length ? this.rowToTask(updated[0]) : null;
  }

  /** Delete a recurring template. Existing execution rows are preserved. */
  async deleteRecurringTemplate(templateId: string): Promise<boolean> {
    if (!this.engineDb) return false;
    try {
      await this.engineDb.execute(
        `DELETE FROM task_queue WHERE id = ? AND status = 'template'`,
        [templateId],
      );
      return true;
    } catch (err: any) {
      console.error(`[workforce] Failed to delete template ${templateId}:`, err.message);
      return false;
    }
  }

  /**
   * Automatically clock an agent in at the start of their work hours.
   */
  private async autoClockIn(agentId: string, schedule: WorkSchedule): Promise<void> {
    // Record the auto-wake clock event
    await this.recordClockEvent(agentId, schedule.orgId, 'auto_wake', 'workforce-scheduler');

    this.clockStatus.set(agentId, 'clocked_in');

    // Resume agent via guardrails
    if (this.guardrails) {
      try {
        await this.guardrails.resumeAgent(
          agentId,
          'Scheduled clock-in: start of work hours',
          'workforce-scheduler'
        );
      } catch { /* agent may not be paused */ }
    }

    // Check for pending tasks and notify via lifecycle event
    try {
      const pendingTasks = await this.getAgentTasks(agentId, 'queued');
      if (pendingTasks.length > 0) {
        this.emitEvent('tasks_pending', {
          agentId,
          count: pendingTasks.length,
          tasks: pendingTasks.slice(0, 5).map(t => ({ id: t.id, title: t.title, priority: t.priority })),
          message: `${pendingTasks.length} task(s) waiting in queue from previous session`,
        });
      }
    } catch { /* best effort */ }

    this.emitEvent('auto_clock_in', { agentId, schedule: schedule.id });

    // Disable Gmail vacation auto-responder (agent is back on duty)
    await this.setGmailVacation(agentId, false).catch(e =>
      console.warn(`[workforce] ${agentId}: failed to disable vacation responder: ${e.message}`)
    );
  }

  /**
   * Automatically clock an agent out at the end of their work hours.
   */
  private async autoClockOut(agentId: string, schedule: WorkSchedule): Promise<void> {
    const eventType = schedule.offHoursAction === 'pause' ? 'auto_pause' : 'clock_out';
    await this.recordClockEvent(agentId, schedule.orgId, eventType, 'workforce-scheduler');

    this.clockStatus.set(agentId, 'clocked_out');

    switch (schedule.offHoursAction) {
      case 'pause':
        if (this.guardrails) {
          try {
            await this.guardrails.pauseAgent(
              agentId,
              'Scheduled clock-out: end of work hours',
              'workforce-scheduler'
            );
          } catch { /* best effort */ }
        }
        break;
      case 'stop':
        if (this.lifecycle) {
          await this.lifecycle.stop(agentId, 'workforce-scheduler', 'End of work hours').catch(() => {});
        }
        break;
      case 'queue':
        // Don't interrupt — just mark the status
        break;
    }

    this.emitEvent('auto_clock_out', { agentId, schedule: schedule.id, action: schedule.offHoursAction });

    // Enable Gmail vacation auto-responder (agent is off duty)
    await this.setGmailVacation(agentId, true, schedule).catch(e =>
      console.warn(`[workforce] ${agentId}: failed to enable vacation responder: ${e.message}`)
    );
  }

  /**
   * Check if daily/weekly/monthly/annual counters need resetting.
   * Deduplicates resets using date keys.
   */
  private checkAndResetCounters(now: Date): void {
    const dateKey = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getUTCDay();
    const dayOfMonth = now.getUTCDate();
    const month = now.getUTCMonth();

    if (dateKey !== this.lastDailyReset) {
      this.lastDailyReset = dateKey;
      this.lifecycle?.resetDailyCounters();
    }
    if (dayOfWeek === 1 && dateKey !== this.lastWeeklyReset) {
      this.lastWeeklyReset = dateKey;
      this.lifecycle?.resetWeeklyCounters();
    }
    if (dayOfMonth === 1 && dateKey !== this.lastMonthlyReset) {
      this.lastMonthlyReset = dateKey;
      this.lifecycle?.resetMonthlyCounters();
    }
    if (month === 0 && dayOfMonth === 1 && dateKey !== this.lastAnnualReset) {
      this.lastAnnualReset = dateKey;
      this.lifecycle?.resetAnnualCounters();
    }
  }

  // ─── Working Hours Logic ─────────────────────────────

  /**
   * Determine if the current local time falls within a schedule's working hours.
   * Checks custom rules first, then standard/shift configuration.
   */
  private isWithinWorkingHours(schedule: WorkSchedule, localNow: Date): boolean {
    const dayOfWeek = localNow.getDay(); // 0=Sun
    const hours = localNow.getHours();
    const minutes = localNow.getMinutes();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const dateStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;

    // 1. Check custom rules first — they override everything
    if (schedule.config.customRules) {
      const todayRule = schedule.config.customRules.find(r => r.date === dateStr);
      if (todayRule) {
        if (todayRule.type === 'off') return false;
        if (todayRule.type === 'working') {
          if (todayRule.start && todayRule.end) {
            return timeStr >= todayRule.start && timeStr < todayRule.end;
          }
          return true; // Working day with no time restriction
        }
      }
    }

    // 2. Standard schedule
    if (schedule.scheduleType === 'standard' && schedule.config.standardHours) {
      const { start, end, daysOfWeek } = schedule.config.standardHours;
      if (!daysOfWeek.includes(dayOfWeek)) return false;

      const grace = schedule.gracePeriodMinutes;
      const effectiveStart = this.subtractMinutes(start, grace);
      const effectiveEnd = this.addMinutes(end, grace);

      return timeStr >= effectiveStart && timeStr < effectiveEnd;
    }

    // 3. Shift schedule
    if (schedule.scheduleType === 'shift' && schedule.config.shifts) {
      for (const shift of schedule.config.shifts) {
        if (!shift.daysOfWeek.includes(dayOfWeek)) continue;

        const grace = schedule.gracePeriodMinutes;
        const effectiveStart = this.subtractMinutes(shift.start, grace);
        const effectiveEnd = this.addMinutes(shift.end, grace);

        // Handle overnight shifts (e.g. 22:00 → 06:00)
        if (effectiveStart > effectiveEnd) {
          // Overnight: either after start OR before end
          if (timeStr >= effectiveStart || timeStr < effectiveEnd) return true;
        } else {
          if (timeStr >= effectiveStart && timeStr < effectiveEnd) return true;
        }
      }
      return false;
    }

    // Default: no restrictions — agent can work any time
    return true;
  }

  // ─── Clock Records ───────────────────────────────────

  /**
   * Persist a clock event to the database and return the record.
   */
  private async recordClockEvent(
    agentId: string,
    orgId: string,
    type: ClockRecord['type'],
    triggeredBy: string,
    scheduledAt?: string,
    reason?: string,
  ): Promise<ClockRecord> {
    const now = new Date().toISOString();
    const record: ClockRecord = {
      id: crypto.randomUUID(),
      agentId,
      orgId,
      type,
      triggeredBy,
      scheduledAt,
      actualAt: now,
      reason,
      metadata: {},
      createdAt: now,
    };

    if (this.engineDb) {
      await this.engineDb.execute(
        `INSERT INTO clock_records (id, agent_id, org_id, type, triggered_by, scheduled_at, actual_at, reason, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id, record.agentId, record.orgId, record.type,
          record.triggeredBy, record.scheduledAt || null, record.actualAt,
          record.reason || null, JSON.stringify(record.metadata), record.createdAt,
        ]
      ).catch((err) => { console.error('[workforce] Failed to persist clock record:', err); });
    }

    return record;
  }

  /**
   * Query clock records with optional filters.
   */
  async getClockRecords(opts?: {
    agentId?: string;
    orgId?: string;
    limit?: number;
    since?: string;
  }): Promise<ClockRecord[]> {
    if (!this.engineDb) return [];

    let sql = 'SELECT * FROM clock_records WHERE 1=1';
    const params: any[] = [];

    if (opts?.agentId) {
      sql += ' AND agent_id = ?';
      params.push(opts.agentId);
    }
    if (opts?.orgId) {
      sql += ' AND org_id = ?';
      params.push(opts.orgId);
    }
    if (opts?.since) {
      sql += ' AND created_at >= ?';
      params.push(opts.since);
    }

    sql += ' ORDER BY created_at DESC';
    sql += ` LIMIT ?`;
    params.push(opts?.limit || 100);

    try {
      const rows = await this.engineDb.query<any>(sql, params);
      return rows.map((r: any) => ({
        id: r.id,
        agentId: r.agent_id,
        orgId: r.org_id,
        type: r.type,
        triggeredBy: r.triggered_by,
        scheduledAt: r.scheduled_at || undefined,
        actualAt: r.actual_at,
        reason: r.reason || undefined,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }

  // ─── Workforce Status ────────────────────────────────

  /**
   * Build a complete workforce status report for an organization.
   */
  async getWorkforceStatus(orgId: string): Promise<WorkforceStatus> {
    const agents: WorkforceStatus['agents'] = [];
    let totalClocked = 0;
    let totalOff = 0;
    let totalUnscheduled = 0;

    for (const schedule of this.schedules.values()) {
      if (schedule.orgId !== orgId) continue;

      const status = this.getClockStatus(schedule.agentId);
      let queuedTasks = 0;

      // Count queued tasks from DB
      if (this.engineDb) {
        try {
          const countRows = await this.engineDb.query<any>(
            "SELECT COUNT(*) as cnt FROM task_queue WHERE agent_id = ? AND status = 'queued'",
            [schedule.agentId]
          );
          queuedTasks = countRows[0]?.cnt || 0;
        } catch { /* best effort */ }
      }

      // Compute next event
      const nextEvent = this.computeNextEvent(schedule);

      agents.push({
        id: schedule.agentId,
        name: schedule.agentId, // Name resolved externally
        clockStatus: status,
        schedule,
        nextEvent,
        queuedTasks,
      });

      if (status === 'clocked_in') totalClocked++;
      else if (status === 'clocked_out') totalOff++;
      else totalUnscheduled++;
    }

    return { agents, totalClocked, totalOff, totalUnscheduled };
  }

  /**
   * Compute the next clock event for a schedule based on current status.
   */
  private computeNextEvent(schedule: WorkSchedule): { type: string; at: string } | undefined {
    const now = new Date();
    const localNow = this.toTimezone(now, schedule.timezone);
    const currentStatus = this.clockStatus.get(schedule.agentId);

    if (schedule.scheduleType === 'standard' && schedule.config.standardHours) {
      const { start, end, daysOfWeek } = schedule.config.standardHours;
      const today = localNow.getDay();

      if (currentStatus === 'clocked_in') {
        // Next event is clock-out at end time today
        return { type: 'clock_out', at: this.nextOccurrence(localNow, end, [today]) };
      } else {
        // Next event is clock-in at start time on next working day
        const nextDay = this.findNextWorkingDay(localNow, daysOfWeek);
        return { type: 'clock_in', at: this.nextOccurrence(localNow, start, [nextDay]) };
      }
    }

    if (schedule.scheduleType === 'shift' && schedule.config.shifts?.length) {
      const shift = schedule.config.shifts[0]; // Use first shift for next event
      if (currentStatus === 'clocked_in') {
        return { type: 'clock_out', at: this.nextOccurrence(localNow, shift.end, shift.daysOfWeek) };
      } else {
        return { type: 'clock_in', at: this.nextOccurrence(localNow, shift.start, shift.daysOfWeek) };
      }
    }

    return undefined;
  }

  /**
   * Find the next occurrence of a time on a valid working day.
   */
  private nextOccurrence(localNow: Date, time: string, daysOfWeek: number[]): string {
    const [h, m] = time.split(':').map(Number);
    const candidate = new Date(localNow);
    candidate.setHours(h, m, 0, 0);

    // If today's time is in the past or today isn't a working day, advance
    if (candidate <= localNow || !daysOfWeek.includes(candidate.getDay())) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(h, m, 0, 0);
      while (!daysOfWeek.includes(candidate.getDay())) {
        candidate.setDate(candidate.getDate() + 1);
      }
    }

    return candidate.toISOString();
  }

  /**
   * Find the next day that falls on a working day.
   */
  private findNextWorkingDay(localNow: Date, daysOfWeek: number[]): number {
    let day = localNow.getDay();
    for (let i = 0; i < 7; i++) {
      const check = (day + i) % 7;
      if (daysOfWeek.includes(check)) {
        // If it's today, check if the working hours haven't started yet
        if (i === 0) return check;
        return check;
      }
    }
    return day; // Fallback
  }

  // ─── Events ──────────────────────────────────────────

  /**
   * Subscribe to workforce events. Returns an unsubscribe function.
   */
  onEvent(listener: (event: any) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /**
   * Emit a workforce event to all registered listeners.
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      ...data,
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch { /* don't let listener errors break the manager */ }
    }
  }

  // ─── Lifecycle ───────────────────────────────────────

  /**
   * Shut down the workforce manager — stop scheduler and clear state.
   */
  shutdown(): void {
    this.stopScheduler();
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
    }
  }

  // ─── Time Utilities ──────────────────────────────────

  // ─── Gmail Vacation Auto-Responder ─────────────────

  /**
   * Toggle Gmail vacation (out-of-office) auto-responder for an agent.
   * Uses the Gmail API `users.settings.updateVacation` endpoint.
   *
   * When enabled, Gmail automatically replies to incoming emails with an
   * out-of-office message. The responder only sends one reply per sender
   * per 4 days (Gmail's built-in rate limiting).
   *
   * restrictToContacts=false ensures ALL senders get the auto-reply.
   * Manager emails still get through to the agent via the poller bypass,
   * but they'll also receive the auto-reply from Gmail (acceptable trade-off).
   */
  private async setGmailVacation(agentId: string, enable: boolean, schedule?: WorkSchedule): Promise<void> {
    // Get agent's email config for OAuth token
    const agent = this.lifecycle?.getAgent(agentId);
    if (!agent) return;

    const emailConfig = agent.config?.emailConfig;
    if (!emailConfig?.oauthRefreshToken || emailConfig.provider !== 'google') return;

    // Refresh the access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: emailConfig.oauthClientId,
        client_secret: emailConfig.oauthClientSecret,
        refresh_token: emailConfig.oauthRefreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('Token refresh failed');

    const accessToken = tokenData.access_token;
    const agentName = agent.config?.displayName || agent.config?.name || 'Agent';

    // Build vacation settings
    let body: Record<string, any>;
    if (enable) {
      // Calculate next start time from schedule
      const tz = schedule?.timezone || 'UTC';
      const nextStart = this.getNextWorkStart(schedule);

      const responseSubject = `Out of Office - ${agentName}`;
      const responseBody = [
        `Hi,\n`,
        `Thank you for your email. I'm currently outside of my working hours and will respond when I'm back.`,
        schedule ? `\nMy regular working hours are ${this.formatScheduleHours(schedule)} (${tz}).` : '',
        nextStart ? `\nI expect to be back ${nextStart}.` : '',
        `\nIf this is urgent, please reach out to my manager directly.`,
        `\nBest regards,\n${agentName}`,
      ].filter(Boolean).join('\n');

      body = {
        enableAutoReply: true,
        responseSubject,
        responseBodyPlainText: responseBody,
        restrictToContacts: false,
        restrictToDomain: false,
      };
    } else {
      body = {
        enableAutoReply: false,
      };
    }

    // Call Gmail API
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/vacation', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gmail API ${res.status}: ${text.slice(0, 200)}`);
    }

    console.log(`[workforce] ${agentName}: vacation auto-responder ${enable ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get a human-readable description of the next work start time.
   */
  private getNextWorkStart(schedule?: WorkSchedule): string {
    if (!schedule) return '';

    const tz = schedule.timezone || 'UTC';
    const now = this.toTimezone(new Date(), tz);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (schedule.scheduleType === 'standard' && schedule.config.standardHours) {
      const { start, daysOfWeek } = schedule.config.standardHours;
      // Find next working day
      for (let d = 0; d <= 7; d++) {
        const checkDay = (now.getDay() + d) % 7;
        if (daysOfWeek.includes(checkDay)) {
          if (d === 0 && `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` < start) {
            return `today at ${start} ${tz}`;
          }
          if (d === 0) continue; // Already past start time today
          if (d === 1) return `tomorrow at ${start} ${tz}`;
          return `${dayNames[checkDay]} at ${start} ${tz}`;
        }
      }
    }

    if (schedule.scheduleType === 'shift' && schedule.config.shifts?.length) {
      const firstShift = schedule.config.shifts[0];
      return `next shift at ${firstShift.start} ${tz}`;
    }

    return '';
  }

  /**
   * Format schedule hours for the vacation message.
   */
  private formatScheduleHours(schedule: WorkSchedule): string {
    if (schedule.scheduleType === 'standard' && schedule.config.standardHours) {
      const { start, end, daysOfWeek } = schedule.config.standardHours;
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = daysOfWeek.map(d => dayNames[d]).join(', ');
      return `${start} - ${end}, ${days}`;
    }
    if (schedule.scheduleType === 'shift' && schedule.config.shifts?.length) {
      return schedule.config.shifts.map(s => `${s.name}: ${s.start}-${s.end}`).join(', ');
    }
    return 'variable hours';
  }

  /**
   * Convert a Date to a specific timezone.
   */
  private toTimezone(date: Date, timezone: string): Date {
    const str = date.toLocaleString('en-US', { timeZone: timezone });
    return new Date(str);
  }

  /**
   * Add minutes to a time string (HH:MM) and return the new time string.
   * Wraps around midnight.
   */
  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  /**
   * Subtract minutes from a time string (HH:MM) and return the new time string.
   * Wraps around midnight.
   */
  private subtractMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    let total = h * 60 + m - minutes;
    if (total < 0) total += 1440;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  // ─── Row Mappers ─────────────────────────────────────

  /**
   * Map a database row to a QueuedTask.
   */
  private rowToTask(r: any): QueuedTask {
    return {
      id: r.id,
      agentId: r.agent_id,
      orgId: r.org_id,
      type: r.type,
      title: r.title,
      description: r.description || undefined,
      context: typeof r.context === 'string' ? JSON.parse(r.context) : (r.context || {}),
      priority: r.priority,
      status: r.status,
      source: r.source,
      scheduledFor: r.scheduled_for || undefined,
      startedAt: r.started_at || undefined,
      completedAt: r.completed_at || undefined,
      recurrenceRule: r.recurrence_rule || undefined,
      recurrenceTimezone: r.recurrence_timezone || undefined,
      parentTaskId: r.parent_task_id || undefined,
      nextFireAt: r.next_fire_at || undefined,
      lastFiredAt: r.last_fired_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
