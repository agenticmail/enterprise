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
  type: 'continue' | 'new' | 'scheduled' | 'delegation';
  title: string;
  description?: string;
  context: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'queued' | 'in_progress' | 'completed' | 'cancelled';
  source: string;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
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
      const rows = await this.engineDb.query<any>('SELECT * FROM work_schedules WHERE enabled = 1');
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

  // ─── Task Queue ──────────────────────────────────────

  /**
   * Add a task to the agent's queue.
   */
  async addTask(task: Omit<QueuedTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<QueuedTask> {
    const now = new Date().toISOString();
    const queued: QueuedTask = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    if (this.engineDb) {
      await this.engineDb.execute(
        `INSERT INTO task_queue (id, agent_id, org_id, type, title, description, context, priority, status, source, scheduled_for, started_at, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queued.id, queued.agentId, queued.orgId, queued.type,
          queued.title, queued.description || null, JSON.stringify(queued.context),
          queued.priority, queued.status, queued.source,
          queued.scheduledFor || null, queued.startedAt || null,
          queued.completedAt || null, queued.createdAt, queued.updatedAt,
        ]
      ).catch((err) => { console.error('[workforce] Failed to persist task:', err); });
    }

    this.emitEvent('task_added', { task: queued });
    return queued;
  }

  /**
   * Get tasks for an agent, optionally filtered by status.
   * Ordered by priority (urgent first) then creation time (oldest first).
   */
  async getAgentTasks(agentId: string, status?: QueuedTask['status']): Promise<QueuedTask[]> {
    if (!this.engineDb) return [];

    const priorityOrder = "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END";
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
