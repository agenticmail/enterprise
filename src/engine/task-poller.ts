/**
 * Task Poller — Monitors stuck tasks and ensures they get picked up.
 *
 * Runs on an interval and checks for tasks that are:
 * - 'created' or 'assigned' for too long without progressing to 'in_progress'
 * - 'in_progress' but stale (no activity update for a long time)
 *
 * For each stuck task, the poller either:
 * 1. Routes the task to an existing active session for the agent (via sendMessage)
 * 2. Spawns a new session to pick up the task
 * 3. Fails the task if max retries are exceeded
 */

import type { TaskQueueManager, TaskRecord } from './task-queue.js';
import type { SessionRouter } from './session-router.js';

// ─── Types ────────────────────────────────────────────────

export interface TaskPollerConfig {
  /** How often to poll in ms (default: 2 minutes) */
  intervalMs?: number;
  /** How long a created/assigned task can sit before being considered stuck (default: 5 min) */
  stuckThresholdMs?: number;
  /** How long an in_progress task can go without activity before being considered stale (default: 15 min) */
  staleThresholdMs?: number;
  /** Max times a task can be retried before being marked failed (default: 3) */
  maxRetries?: number;
  /** Max task age in ms — tasks older than this are auto-failed instead of recovered (default: 1 hour) */
  maxTaskAgeMs?: number;
  /** Whether to log debug output (default: false) */
  debug?: boolean;
}

export interface TaskPollerDeps {
  taskQueue: TaskQueueManager;
  sessionRouter: SessionRouter;
  /** Spawn a new session for the task. Return the session ID. */
  spawnForTask: (task: TaskRecord) => Promise<string | null>;
  /** Send a message into an existing session. */
  sendToSession: (sessionId: string, message: string) => Promise<void>;
}

interface RetryState {
  count: number;
  lastAttempt: number;
}

// ─── Task Poller ──────────────────────────────────────────

export class TaskPoller {
  private intervalMs: number;
  private stuckThresholdMs: number;
  private staleThresholdMs: number;
  private maxRetries: number;
  private maxTaskAgeMs: number;
  private debug: boolean;

  private deps: TaskPollerDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retries = new Map<string, RetryState>();
  private processing = false;
  /** Tasks currently being recovered — prevents duplicate spawns */
  private recovering = new Set<string>();

  constructor(deps: TaskPollerDeps, config?: TaskPollerConfig) {
    this.deps = deps;
    this.intervalMs = config?.intervalMs ?? 2 * 60 * 1000;        // 2 min
    this.stuckThresholdMs = config?.stuckThresholdMs ?? 5 * 60 * 1000;  // 5 min
    this.staleThresholdMs = config?.staleThresholdMs ?? 30 * 60 * 1000; // 30 min — agent sessions can run 20+ tool calls
    this.maxRetries = config?.maxRetries ?? 3;
    this.maxTaskAgeMs = config?.maxTaskAgeMs ?? 45 * 60 * 1000; // 45 min — trading sessions with analysis can be long
    this.debug = config?.debug ?? false;
  }

  /**
   * Start the poller. Safe to call multiple times (no-op if already running).
   */
  start(): void {
    if (this.timer) return;
    this.log('Starting task poller', `interval=${this.intervalMs}ms`);
    // Run once immediately, then on interval
    setTimeout(() => this.poll().catch(e => this.log('Poll error:', e.message)), 5000);
    this.timer = setInterval(() => {
      this.poll().catch(e => this.log('Poll error:', e.message));
    }, this.intervalMs);
  }

  /**
   * Stop the poller.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log('Task poller stopped');
    }
  }

  /**
   * Run a single poll cycle. Can be called manually for testing.
   */
  async poll(): Promise<{ checked: number; recovered: number; failed: number }> {
    if (this.processing) {
      this.log('Skipping poll — previous cycle still running');
      return { checked: 0, recovered: 0, failed: 0 };
    }
    this.processing = true;
    let checked = 0, recovered = 0, failed = 0;

    try {
      const now = Date.now();

      // Sync from database first — ensures we catch tasks that were reset, added externally,
      // or survived a process restart. This is the enterprise-grade approach.
      try {
        await this.deps.taskQueue.syncFromDb?.();
      } catch (syncErr: any) {
        this.log('DB sync warning (non-fatal):', syncErr.message);
      }

      const activeTasks = this.deps.taskQueue.getActiveTasks();
      checked = activeTasks.length;

      if (checked === 0) {
        this.cleanupRetryState();
        return { checked, recovered, failed };
      }

      this.log(`Checking ${checked} active tasks`);

      for (const task of activeTasks) {
        try {
          const stuck = this.isStuck(task, now);
          if (!stuck) continue;

          this.log(`Stuck task: ${task.id.slice(0, 8)} "${task.title.slice(0, 50)}" — status=${task.status}, reason=${stuck}`);

          // Auto-fail tasks that are too old
          if (stuck.includes('too old')) {
            this.log(`Task ${task.id.slice(0, 8)} is too old, marking as failed`);
            await this.deps.taskQueue.updateTask(task.id, {
              status: 'failed',
              error: `Task abandoned: ${stuck}`,
            });
            this.retries.delete(task.id);
            failed++;
            continue;
          }

          // Check retry count
          const retry = this.retries.get(task.id);
          const retryCount = retry?.count ?? 0;

          if (retryCount >= this.maxRetries) {
            // Max retries exceeded — fail the task
            this.log(`Task ${task.id} exceeded max retries (${this.maxRetries}), marking as failed`);
            await this.deps.taskQueue.updateTask(task.id, {
              status: 'failed',
              error: `Task stuck and exceeded ${this.maxRetries} recovery attempts. Last stuck reason: ${stuck}`,
            });
            this.retries.delete(task.id);
            failed++;
            continue;
          }

          // Skip if already being recovered
          if (this.recovering.has(task.id)) {
            this.log(`Task ${task.id.slice(0, 8)} already being recovered, skipping`);
            continue;
          }

          // Try to recover
          this.recovering.add(task.id);
          const didRecover = await this.recover(task, stuck);
          this.retries.set(task.id, {
            count: retryCount + 1,
            lastAttempt: now,
          });

          if (didRecover) recovered++;
        } catch (e: any) {
          this.log(`Error processing stuck task ${task.id}:`, e.message);
        }
      }

      this.cleanupRetryState();
    } finally {
      this.processing = false;
    }

    if (recovered > 0 || failed > 0) {
      this.log(`Poll complete: checked=${checked}, recovered=${recovered}, failed=${failed}`);
    }

    return { checked, recovered, failed };
  }

  // ─── Private ──────────────────────────────────────────

  /**
   * Determine if a task is stuck and why.
   */
  private isStuck(task: TaskRecord, now: number): string | null {
    const createdMs = new Date(task.createdAt).getTime();

    // Skip tasks older than maxTaskAgeMs — but only if no recent activity
    if (now - createdMs > this.maxTaskAgeMs) {
      const lastLogMs = task.activityLog.length > 0
        ? new Date(task.activityLog[task.activityLog.length - 1].ts).getTime()
        : 0;
      // If there was activity in the last 5 minutes, the session is still working — don't kill it
      if (lastLogMs && now - lastLogMs < 5 * 60 * 1000) {
        return null;
      }
      return `task too old (${Math.round((now - createdMs) / 60000)}min) with no recent activity, auto-failing`;
    }

    const lastActivity = task.startedAt
      ? new Date(task.startedAt).getTime()
      : task.assignedAt
        ? new Date(task.assignedAt).getTime()
        : createdMs;

    // Check activity log for most recent event
    const lastLogMs = task.activityLog.length > 0
      ? new Date(task.activityLog[task.activityLog.length - 1].ts).getTime()
      : lastActivity;

    const effectiveLastActivity = Math.max(lastActivity, lastLogMs);

    if (task.status === 'created' || task.status === 'assigned') {
      // Task hasn't started yet
      if (now - createdMs > this.stuckThresholdMs) {
        return `${task.status} for ${Math.round((now - createdMs) / 1000)}s without starting`;
      }
    }

    if (task.status === 'in_progress') {
      // Task started but no recent activity
      if (now - effectiveLastActivity > this.staleThresholdMs) {
        return `in_progress but no activity for ${Math.round((now - effectiveLastActivity) / 1000)}s`;
      }
    }

    // Don't retry too quickly — wait at least 1 minute between attempts
    const retry = this.retries.get(task.id);
    if (retry && now - retry.lastAttempt < 60_000) {
      return null; // Too soon to retry
    }

    return null;
  }

  /**
   * Attempt to recover a stuck task.
   */
  private async recover(task: TaskRecord, reason: string): Promise<boolean> {
    const { sessionRouter, taskQueue, spawnForTask, sendToSession } = this.deps;
    const agentId = task.assignedTo;

    // Strategy 1: If the task already has a session ID, check if it's still active
    if (task.sessionId) {
      const activeSessions = sessionRouter.getActiveSessions(agentId);
      const sessionStillActive = activeSessions.find(s => s.sessionId === task.sessionId);

      if (sessionStillActive) {
        // Session exists — nudge it with a reminder
        this.log(`Task ${task.id}: session ${task.sessionId} still active, sending nudge`);
        try {
          await sendToSession(task.sessionId, this.buildNudgeMessage(task, reason));
          await taskQueue.updateTask(task.id, {
            activityLog: [
              ...task.activityLog,
              { ts: new Date().toISOString(), type: 'note', agent: 'task-poller', detail: `Nudged active session: ${reason}` },
            ],
          });
          return true;
        } catch (e: any) {
          this.log(`Failed to nudge session ${task.sessionId}:`, e.message);
        }
      }
    }

    // Session not found or gone — this means a crash/restart happened
    if (task.sessionId) {
      this.log(`Task ${task.id.slice(0, 8)}: session ${task.sessionId} is DEAD (agent crash/restart)`);
      await taskQueue.updateTask(task.id, {
        status: 'assigned',
        sessionId: null as any,
        activityLog: [
          ...task.activityLog,
          {
            ts: new Date().toISOString(),
            type: 'crash',
            agent: 'task-poller',
            detail: `Session ${task.sessionId} died (agent crash/restart). Reason: ${reason}. Recovering...`,
            previousStatus: task.status,
            retryCount: (this.retries.get(task.id)?.count ?? 0) + 1,
            nextRetryAt: new Date(Date.now() + 5000).toISOString(),
          },
        ],
      });
    }

    // Strategy 2: Check if agent has ANY active session to route to
    const activeSessions = sessionRouter.getActiveSessions(agentId);
    const chatSession = activeSessions.find(s => s.type === 'chat' || s.type === 'task');

    if (chatSession) {
      this.log(`Task ${task.id}: routing to active session ${chatSession.sessionId}`);
      try {
        await sendToSession(chatSession.sessionId, this.buildRouteMessage(task));
        await taskQueue.updateTask(task.id, {
          sessionId: chatSession.sessionId,
          activityLog: [
            ...task.activityLog,
            { ts: new Date().toISOString(), type: 'note', agent: 'task-poller', detail: `Routed to active session ${chatSession.sessionId}: ${reason}` },
          ],
        });
        return true;
      } catch (e: any) {
        this.log(`Failed to route to session ${chatSession.sessionId}:`, e.message);
      }
    }

    // Strategy 3: Spawn a new session
    this.log(`Task ${task.id.slice(0, 8)}: spawning new session`);
    try {
      const sessionId = await spawnForTask(task);
      if (sessionId) {
        // Keep in recovering set until task completes — prevent duplicate spawns
        // It will be cleaned up by cleanupRetryState when task is completed/failed
        const retryCount = (this.retries.get(task.id)?.count ?? 0) + 1;
        await taskQueue.updateTask(task.id, {
          status: 'in_progress',
          sessionId,
          startedAt: new Date().toISOString(),
          activityLog: [
            ...task.activityLog,
            {
              ts: new Date().toISOString(),
              type: 'recovery',
              agent: 'task-poller',
              detail: `Recovery session spawned (attempt ${retryCount}/${this.maxRetries}): ${reason}`,
              sessionId,
              retryCount,
            },
          ],
        });
        return true;
      }
    } catch (e: any) {
      this.log(`Failed to spawn session for task ${task.id.slice(0, 8)}:`, e.message);
      // Log the failure
      await taskQueue.updateTask(task.id, {
        activityLog: [
          ...task.activityLog,
          {
            ts: new Date().toISOString(),
            type: 'error',
            agent: 'task-poller',
            detail: `Recovery spawn failed: ${e.message}. Will retry in ~${Math.round(this.intervalMs / 1000)}s.`,
          },
        ],
      }).catch(() => {});
    }

    return false;
  }

  /**
   * Build a nudge message for an existing session that seems stuck.
   */
  private buildNudgeMessage(task: TaskRecord, reason: string): string {
    return `[System — Task Poller] Your assigned task "${task.title}" (ID: ${task.id}) appears stuck (${reason}). ` +
      `If you're still working on it, please continue. If blocked, update the task status or request help.`;
  }

  /**
   * Build a message to route a stuck task to an active session.
   */
  private buildRouteMessage(task: TaskRecord): string {
    return `[System — Task Poller] A stuck task has been routed to your session for recovery.\n\n` +
      `Task: ${task.title}\n` +
      `ID: ${task.id}\n` +
      `Category: ${task.category}\n` +
      `Priority: ${task.priority}\n` +
      `Description: ${task.description}\n\n` +
      `Please pick up this task and work on it.`;
  }

  /**
   * Clean up retry state for completed/failed tasks.
   */
  private cleanupRetryState(): void {
    for (const [taskId] of this.retries) {
      const task = this.deps.taskQueue.getTask(taskId);
      if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        this.retries.delete(taskId);
        this.recovering.delete(taskId);
      }
    }
    // Also clean recovering set
    for (const taskId of this.recovering) {
      const task = this.deps.taskQueue.getTask(taskId);
      if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        this.recovering.delete(taskId);
      }
    }
  }

  private log(...args: any[]): void {
    // Always log important events; only suppress routine "Checking N active tasks" when debug is off
    const first = String(args[0] || '');
    const isRoutine = first.startsWith('Checking ') || first.startsWith('Skipping poll');
    if (this.debug || !isRoutine) {
      console.log('[TaskPoller]', ...args);
    }
  }
}
