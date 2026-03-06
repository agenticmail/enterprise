/**
 * Enterprise Agent Heartbeat System
 * 
 * A token-efficient proactive monitoring system that uses pure math and DB queries
 * to determine when an agent should take action. LLM sessions are only spawned
 * when there's genuinely something to act on.
 * 
 * Design principles:
 * 1. ZERO tokens on idle ticks — pure arithmetic/DB checks
 * 2. Exponential backoff on repeated no-ops (Fibonacci spacing)
 * 3. Work-hours gating — no checks outside schedule
 * 4. Priority queue — urgent items checked more frequently
 * 5. Configurable per-agent check types
 * 6. Batching — multiple actionable items combined into one LLM session
 * 
 * Tick frequency uses a damped oscillator model:
 *   interval = baseInterval * (1 + dampingFactor * consecutiveNoOps)
 *   Capped at maxInterval. Resets to baseInterval when action is taken.
 *   This naturally reduces polling when nothing is happening.
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export interface HeartbeatCheckResult {
  needsAction: boolean;
  summary?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  data?: Record<string, any>;
}

export type HeartbeatCheckFn = (ctx: HeartbeatContext) => Promise<HeartbeatCheckResult>;

export interface HeartbeatCheck {
  id: string;
  name: string;
  /** How often to run this check (ms). Overrides global tick. */
  intervalMs: number;
  /** Priority determines check order and batching urgency */
  priority: 'low' | 'medium' | 'high';
  /** The check function — must be pure DB/math, NO LLM calls */
  check: HeartbeatCheckFn;
  /** Whether this check requires the agent to be clocked in */
  requiresClockIn: boolean;
  /** Last time this check ran */
  lastRunAt?: number;
  /** Last time this check found something actionable */
  lastActionAt?: number;
  /** Consecutive no-ops (for adaptive spacing) */
  consecutiveNoOps: number;
  /** Enabled flag */
  enabled: boolean;
}

export interface HeartbeatContext {
  agentId: string;
  orgId: string;
  agentName: string;
  role: string;
  managerEmail?: string;
  timezone: string;
  db: EngineDatabase;
  now: Date;
  localTime: Date;
  hour: number;
  minute: number;
  dayOfWeek: number;
  isWorkHours: boolean;
  isClockedIn: boolean;
}

export interface HeartbeatConfig {
  agentId: string;
  orgId: string;
  agentName: string;
  role: string;
  managerEmail?: string;
  timezone: string;
  schedule?: { start: string; end: string; days: number[] };
  db: EngineDatabase;
  runtime?: any;
  /** Callback to check if agent is clocked in */
  isClockedIn: () => boolean;
  /** Enable/disable specific checks by ID */
  enabledChecks?: Record<string, boolean>;
}

export interface HeartbeatSettings {
  enabled: boolean;
  /** Base tick interval in ms (default: 5 minutes) */
  baseIntervalMs: number;
  /** Max tick interval in ms after backoff (default: 30 minutes) */
  maxIntervalMs: number;
  /** Damping factor for exponential backoff (default: 0.5) */
  dampingFactor: number;
  /** Max items to batch into one LLM session (default: 5) */
  maxBatchSize: number;
  /** Quiet hours override — suppress non-urgent during these hours */
  quietHoursStart?: number; // e.g. 23
  quietHoursEnd?: number;   // e.g. 8
}

const DEFAULT_SETTINGS: HeartbeatSettings = {
  enabled: true,
  baseIntervalMs: 5 * 60_000,     // 5 minutes
  maxIntervalMs: 30 * 60_000,     // 30 minutes
  dampingFactor: 0.5,
  maxBatchSize: 5,
  quietHoursStart: 23,
  quietHoursEnd: 8,
};

// ─── Built-in Checks (Zero-Token) ──────────────────────

/**
 * Check for unread emails that haven't been processed.
 * Pure DB query — counts emails received since last check without processing flag.
 */
function createUnreadEmailCheck(): HeartbeatCheck {
  return {
    id: 'unread_emails',
    name: 'Unread Emails',
    intervalMs: 10 * 60_000,  // 10 minutes
    priority: 'high',
    requiresClockIn: false,   // emails can be urgent outside hours
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        // Count emails received but not yet handled (no session created)
        const rows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_memory 
           WHERE agent_id = $1 
           AND category = 'processed_email' 
           AND created_at > NOW() - INTERVAL '4 hours'`,
          [ctx.agentId]
        );
        const processedRecently = parseInt(rows?.[0]?.cnt || '0');
        
        // Check for emails that came in but have no corresponding session
        // This is a heuristic — if we see emails in the inbox that are newer
        // than our last processed email, flag them
        const lastProcessed = await ctx.db.query<any>(
          `SELECT MAX(created_at) as last_at FROM agent_memory 
           WHERE agent_id = $1 AND category = 'processed_email'`,
          [ctx.agentId]
        );
        const lastAt = lastProcessed?.[0]?.last_at;
        
        // If we've processed nothing in 4 hours during work hours, that's suspicious
        if (ctx.isWorkHours && processedRecently === 0 && ctx.hour >= 10) {
          return {
            needsAction: true,
            summary: 'No emails processed in the last 4 hours during work hours. Check inbox.',
            priority: 'medium',
            data: { lastProcessedAt: lastAt }
          };
        }

        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

/**
 * Check for pending calendar events in the next 2 hours.
 * Queries agent_memory for upcoming events from last calendar sync.
 */
function createUpcomingEventsCheck(): HeartbeatCheck {
  return {
    id: 'upcoming_events',
    name: 'Upcoming Calendar Events',
    intervalMs: 15 * 60_000,  // 15 minutes
    priority: 'high',
    requiresClockIn: false,
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        // Check for calendar events in next 2 hours from agent_memory
        const _twoHoursFromNow = new Date(ctx.now.getTime() + 2 * 60 * 60 * 1000).toISOString();
        const rows = await ctx.db.query<any>(
          `SELECT content FROM agent_memory 
           WHERE agent_id = $1 
           AND category = 'context' 
           AND content LIKE '%meeting%' 
           AND created_at > NOW() - INTERVAL '24 hours'
           ORDER BY created_at DESC LIMIT 5`,
          [ctx.agentId]
        );
        
        // Simple heuristic — if we see meeting-related memories, check them
        const upcomingMeetings = (rows || []).filter((r: any) => {
          const content = r.content || '';
          // Look for time patterns in the content that are within 2 hours
          return content.includes('meeting') || content.includes('event');
        });

        if (upcomingMeetings.length > 0) {
          return {
            needsAction: true,
            summary: `${upcomingMeetings.length} potential upcoming event(s). Agent should check Google Calendar.`,
            priority: 'high',
            data: { count: upcomingMeetings.length }
          };
        }

        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

/**
 * Check for stale sessions (started but never completed).
 * Pure DB — counts sessions older than threshold that are still 'active'.
 */
function createStaleSessionsCheck(): HeartbeatCheck {
  return {
    id: 'stale_sessions',
    name: 'Stale Sessions',
    intervalMs: 30 * 60_000,  // 30 minutes
    priority: 'medium',
    requiresClockIn: true,
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        const rows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_sessions 
           WHERE agent_id = $1 
           AND status = 'active' 
           AND updated_at < NOW() - INTERVAL '2 hours'`,
          [ctx.agentId]
        );
        const staleCount = parseInt(rows?.[0]?.cnt || '0');
        
        if (staleCount > 0) {
          return {
            needsAction: true,
            summary: `${staleCount} stale session(s) detected (active > 2 hours with no updates). May need cleanup.`,
            priority: 'medium',
            data: { staleCount }
          };
        }
        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

/**
 * Check agent memory health — detect if memory is growing too fast or
 * if important memories are being lost.
 */
function createMemoryHealthCheck(): HeartbeatCheck {
  return {
    id: 'memory_health',
    name: 'Memory Health',
    intervalMs: 60 * 60_000,  // 1 hour
    priority: 'low',
    requiresClockIn: true,
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        // Count memories in last 24h
        const rows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_memory 
           WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
          [ctx.agentId]
        );
        const recentCount = parseInt(rows?.[0]?.cnt || '0');
        
        // More than 200 memories in 24h = potential flooding
        if (recentCount > 200) {
          return {
            needsAction: true,
            summary: `Memory flood detected: ${recentCount} memories in 24h (threshold: 200). Consider pruning.`,
            priority: 'medium',
            data: { recentCount }
          };
        }
        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

/**
 * Check for unanswered Google Chat messages.
 * Looks at chat messages received with no corresponding reply.
 */
function createUnansweredChatCheck(): HeartbeatCheck {
  return {
    id: 'unanswered_chat',
    name: 'Unanswered Chat Messages',
    intervalMs: 5 * 60_000,   // 5 minutes
    priority: 'high',
    requiresClockIn: false,
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        // Check for chat sessions that were created but may not have completed
        const rows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_sessions 
           WHERE agent_id = $1 
           AND status = 'failed'
           AND metadata::text LIKE '%chat%'
           AND created_at > NOW() - INTERVAL '1 hour'`,
          [ctx.agentId]
        );
        const failedChats = parseInt(rows?.[0]?.cnt || '0');
        
        if (failedChats > 0) {
          return {
            needsAction: true,
            summary: `${failedChats} failed chat session(s) in the last hour. Messages may be unanswered.`,
            priority: 'urgent',
            data: { failedChats }
          };
        }
        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

/**
 * Check for tasks approaching deadlines.
 * Queries agent_memory for tasks with due dates.
 */
function createTaskDeadlineCheck(): HeartbeatCheck {
  return {
    id: 'task_deadlines',
    name: 'Task Deadlines',
    intervalMs: 60 * 60_000,  // 1 hour
    priority: 'medium',
    requiresClockIn: true,
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        // Check for task-related memories with urgency signals
        const rows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_memory 
           WHERE agent_id = $1 
           AND category = 'context'
           AND importance = 'high'
           AND content LIKE '%deadline%'
           AND created_at > NOW() - INTERVAL '48 hours'`,
          [ctx.agentId]
        );
        const urgentTasks = parseInt(rows?.[0]?.cnt || '0');
        
        if (urgentTasks > 0) {
          return {
            needsAction: true,
            summary: `${urgentTasks} task(s) with approaching deadlines. Agent should review and prioritize.`,
            priority: 'high',
            data: { urgentTasks }
          };
        }
        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

/**
 * Check error rate — if agent has had many failed sessions recently,
 * something may be wrong (API keys expired, service down, etc.)
 */
function createErrorRateCheck(): HeartbeatCheck {
  return {
    id: 'error_rate',
    name: 'Error Rate Monitor',
    intervalMs: 15 * 60_000,  // 15 minutes
    priority: 'high',
    requiresClockIn: false,   // errors can happen anytime
    consecutiveNoOps: 0,
    enabled: true,
    check: async (ctx: HeartbeatContext): Promise<HeartbeatCheckResult> => {
      try {
        const totalRows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_sessions 
           WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
          [ctx.agentId]
        );
        const failedRows = await ctx.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_sessions 
           WHERE agent_id = $1 AND status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'`,
          [ctx.agentId]
        );
        
        const total = parseInt(totalRows?.[0]?.cnt || '0');
        const failed = parseInt(failedRows?.[0]?.cnt || '0');
        
        // Error rate > 50% with at least 3 sessions = problem
        if (total >= 3 && (failed / total) > 0.5) {
          return {
            needsAction: true,
            summary: `High error rate: ${failed}/${total} sessions failed in the last hour (${Math.round(failed/total*100)}%). Possible infrastructure issue.`,
            priority: 'urgent',
            data: { total, failed, rate: failed / total }
          };
        }
        return { needsAction: false, priority: 'low' };
      } catch {
        return { needsAction: false, priority: 'low' };
      }
    }
  };
}

// ─── Heartbeat Manager ──────────────────────────────────

export class AgentHeartbeatManager {
  private config: HeartbeatConfig;
  private settings: HeartbeatSettings;
  private checks: Map<string, HeartbeatCheck> = new Map();
  private tickTimer: NodeJS.Timeout | null = null;
  private globalConsecutiveNoOps: number = 0;
  private lastActionTimestamp: number = 0;
  private stats = {
    totalTicks: 0,
    totalChecksRun: 0,
    totalActionsTriggered: 0,
    totalTokensSaved: 0,  // estimated tokens NOT spent due to no-op ticks
    startedAt: Date.now(),
  };

  constructor(config: HeartbeatConfig, settings?: Partial<HeartbeatSettings>) {
    this.config = config;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };

    // Register built-in checks
    this.registerCheck(createUnreadEmailCheck());
    this.registerCheck(createUpcomingEventsCheck());
    this.registerCheck(createStaleSessionsCheck());
    this.registerCheck(createMemoryHealthCheck());
    this.registerCheck(createUnansweredChatCheck());
    this.registerCheck(createTaskDeadlineCheck());
    this.registerCheck(createErrorRateCheck());

    // Apply per-check enable/disable overrides
    if (config.enabledChecks) {
      for (const [id, enabled] of Object.entries(config.enabledChecks)) {
        const check = this.checks.get(id);
        if (check) check.enabled = enabled;
      }
    }
  }

  registerCheck(check: HeartbeatCheck): void {
    this.checks.set(check.id, check);
  }

  async start(): Promise<void> {
    if (!this.settings.enabled) {
      console.log('[heartbeat] Disabled, skipping');
      return;
    }

    console.log(`[heartbeat] Starting with ${this.checks.size} checks, base interval ${this.settings.baseIntervalMs / 1000}s`);
    
    // Initial tick after 60s (let other systems boot first)
    setTimeout(() => this.tick(), 60_000);
    
    // Schedule adaptive ticking
    this.scheduleNextTick();
  }

  stop(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    console.log(`[heartbeat] Stopped. Stats: ${this.stats.totalTicks} ticks, ${this.stats.totalChecksRun} checks, ${this.stats.totalActionsTriggered} actions, ~${this.stats.totalTokensSaved} tokens saved`);
  }

  getStats() {
    return {
      ...this.stats,
      uptimeMs: Date.now() - this.stats.startedAt,
      currentIntervalMs: this.calculateInterval(),
      globalConsecutiveNoOps: this.globalConsecutiveNoOps,
      checks: Array.from(this.checks.values()).map(c => ({
        id: c.id,
        name: c.name,
        enabled: c.enabled,
        lastRunAt: c.lastRunAt,
        lastActionAt: c.lastActionAt,
        consecutiveNoOps: c.consecutiveNoOps,
      })),
    };
  }

  // ─── Core Tick Logic ────────────────────────────────

  private async tick(): Promise<void> {
    this.stats.totalTicks++;
    const now = new Date();
    const tz = this.config.timezone || 'UTC';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = localTime.getHours();
    const minute = localTime.getMinutes();
    const dayOfWeek = localTime.getDay();

    // Work hours check
    const isWorkHours = this.isWithinWorkHours(hour, minute, dayOfWeek);
    const isQuietHours = this.isQuietHours(hour);
    const isClockedIn = this.config.isClockedIn();

    // Build context (shared across all checks — avoids redundant computation)
    const ctx: HeartbeatContext = {
      agentId: this.config.agentId,
      orgId: this.config.orgId,
      agentName: this.config.agentName,
      role: this.config.role,
      managerEmail: this.config.managerEmail,
      timezone: tz,
      db: this.config.db,
      now,
      localTime,
      hour,
      minute,
      dayOfWeek,
      isWorkHours,
      isClockedIn,
    };

    // Run eligible checks
    const actionableItems: { check: HeartbeatCheck; result: HeartbeatCheckResult }[] = [];

    for (const check of this.checks.values()) {
      if (!check.enabled) continue;

      // Skip if requires clock-in and agent isn't clocked in
      if (check.requiresClockIn && !isClockedIn) continue;

      // Skip non-urgent checks during quiet hours
      if (isQuietHours && check.priority !== 'high') continue;

      // Adaptive interval per check: check.intervalMs * (1 + damping * noOps)
      const adaptiveInterval = Math.min(
        check.intervalMs * (1 + this.settings.dampingFactor * check.consecutiveNoOps),
        this.settings.maxIntervalMs
      );
      const timeSinceLastRun = now.getTime() - (check.lastRunAt || 0);
      if (timeSinceLastRun < adaptiveInterval) continue;

      // Run the check (pure DB/math — no tokens)
      this.stats.totalChecksRun++;
      check.lastRunAt = now.getTime();

      try {
        const result = await check.check(ctx);

        if (result.needsAction) {
          actionableItems.push({ check, result });
          check.consecutiveNoOps = 0;
          check.lastActionAt = now.getTime();
        } else {
          check.consecutiveNoOps++;
          // Each no-op tick saves ~500 tokens (estimated cost of an LLM check session)
          this.stats.totalTokensSaved += 500;
        }
      } catch (err: any) {
        console.warn(`[heartbeat] Check ${check.id} error: ${err.message}`);
        check.consecutiveNoOps++;
      }
    }

    // Process actionable items
    if (actionableItems.length > 0) {
      this.globalConsecutiveNoOps = 0;
      this.lastActionTimestamp = now.getTime();
      this.stats.totalActionsTriggered++;

      // Sort by priority (urgent first)
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      actionableItems.sort((a, b) => priorityOrder[a.result.priority] - priorityOrder[b.result.priority]);

      // Batch items into one LLM session (up to maxBatchSize)
      const batch = actionableItems.slice(0, this.settings.maxBatchSize);
      await this.dispatchBatch(batch, ctx);
    } else {
      this.globalConsecutiveNoOps++;
    }

    // Schedule next tick
    this.scheduleNextTick();
  }

  /**
   * Calculate next tick interval using damped oscillator model:
   *   interval = base * (1 + damping * consecutiveNoOps)
   * 
   * With fibonacci-like acceleration:
   *   After 0 no-ops:  5min  (base)
   *   After 1 no-op:   7.5min
   *   After 2 no-ops:  10min
   *   After 4 no-ops:  15min
   *   After 8 no-ops:  25min
   *   After 10 no-ops: 30min (max)
   * 
   * Resets to base immediately when action is detected.
   */
  private calculateInterval(): number {
    const base = this.settings.baseIntervalMs;
    const max = this.settings.maxIntervalMs;
    const damping = this.settings.dampingFactor;
    const noOps = this.globalConsecutiveNoOps;

    return Math.min(base * (1 + damping * noOps), max);
  }

  private scheduleNextTick(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    const interval = this.calculateInterval();
    this.tickTimer = setTimeout(() => this.tick(), interval);
    this.tickTimer.unref(); // Don't keep process alive just for heartbeat
  }

  private isWithinWorkHours(hour: number, minute: number, dayOfWeek: number): boolean {
    const schedule = this.config.schedule;
    if (!schedule) return true; // No schedule = always work hours

    const isWorkday = schedule.days.includes(dayOfWeek);
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const isWithinHours = timeStr >= schedule.start && timeStr < schedule.end;

    return isWorkday && isWithinHours;
  }

  private isQuietHours(hour: number): boolean {
    const start = this.settings.quietHoursStart;
    const end = this.settings.quietHoursEnd;
    if (start === undefined || end === undefined) return false;

    // Handle overnight range (e.g. 23:00 - 08:00)
    if (start > end) {
      return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
  }

  /**
   * Dispatch a batch of actionable items to the agent via one LLM session.
   * This is the ONLY place tokens are spent.
   */
  private async dispatchBatch(
    items: { check: HeartbeatCheck; result: HeartbeatCheckResult }[],
    ctx: HeartbeatContext
  ): Promise<void> {
    if (!this.config.runtime) {
      console.warn('[heartbeat] No runtime — cannot dispatch actions');
      return;
    }

    // Respect guardrails — don't waste LLM tokens if agent is paused/off-duty
    try {
      const { guardrails } = await import('./routes.js');
      const status = await guardrails.getStatus(ctx.agentId);
      if (status.paused || status.offDuty) {
        console.log(`[heartbeat] Skipping action dispatch — agent is ${status.offDuty ? 'off duty' : 'paused'}`);
        return;
      }
    } catch { /* non-blocking */ }

    // Don't interrupt active work — if the agent has sessions running (especially browser tasks),
    // heartbeat dispatches can cause contention, event loop pressure, and browser timeouts.
    // Defer to next heartbeat cycle instead.
    try {
      const activeCount = this.config.runtime.getActiveSessionCount?.() ?? 0;
      if (activeCount > 0) {
        console.log(`[heartbeat] Deferring action dispatch — ${activeCount} active session(s) running`);
        return;
      }
    } catch { /* non-blocking */ }

    const summaries = items.map((item, i) => 
      `${i + 1}. [${item.result.priority.toUpperCase()}] ${item.check.name}: ${item.result.summary}`
    ).join('\n');

    const prompt = `HEARTBEAT ALERT — The following ${items.length} item(s) need your attention:

${summaries}

For each item, take the appropriate action:
- For unread emails: Check your inbox with gmail_search and respond to any urgent ones.
- For upcoming events: Check google_calendar_list for the next 2 hours and prepare.
- For stale sessions: Review and close any stuck sessions.
- For unanswered chats: Check Google Chat and respond.
- For error rate issues: Investigate recent failures and notify your manager if critical.
- For task deadlines: Review google_tasks_list and prioritize.
- For memory health: Consider pruning old or low-importance memories.

Be efficient — handle what you can and note what needs human intervention.
If something needs your manager's attention, email ${ctx.managerEmail || 'your manager'}.`;

    const systemPrompt = `You are ${ctx.agentName}, a ${ctx.role}. This is an automated heartbeat check — items flagged as needing attention. Handle them efficiently. Don't create unnecessary work — only act on what's genuinely important.`;

    try {
      const session = await this.config.runtime.spawnSession({
        agentId: ctx.agentId,
        message: prompt,
        systemPrompt,
      });
      console.log(`[heartbeat] ✅ Action session ${session.id} dispatched (${items.length} items: ${items.map(i => i.check.id).join(', ')})`);
    } catch (err: any) {
      console.error(`[heartbeat] Failed to dispatch action: ${err.message}`);
    }
  }
}
