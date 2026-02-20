/**
 * Follow-Up Scheduler
 *
 * Manages scheduled follow-ups and reminders for agents.
 * Persists to database for crash recovery — survives restarts.
 * Uses setInterval to check for due follow-ups and injects
 * them as system messages into active sessions.
 */

import { nanoid } from 'nanoid';
import type { FollowUp } from './types.js';

// ─── Types ──────────────────────────────────────────────

export interface FollowUpSchedulerConfig {
  /** Callback when a follow-up is due */
  onDue: (followUp: FollowUp) => Promise<void>;
  /** Engine DB for persistence (optional — falls back to in-memory if not provided) */
  engineDb?: import('../engine/db-adapter.js').EngineDatabase;
  /** How often to check for due follow-ups (default: 30s) */
  checkIntervalMs?: number;
}

// ─── Follow-Up Scheduler ─────────────────────────────────

export class FollowUpScheduler {
  private followUps = new Map<string, FollowUp>();
  private timer: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private onDue: (followUp: FollowUp) => Promise<void>;
  private db: import('../engine/db-adapter.js').EngineDatabase | null;

  constructor(opts: FollowUpSchedulerConfig) {
    this.onDue = opts.onDue;
    this.db = opts.engineDb || null;
    this.checkIntervalMs = opts.checkIntervalMs ?? 30_000;
  }

  /**
   * Schedule a new follow-up.
   */
  async schedule(opts: {
    agentId: string;
    sessionId?: string;
    message: string;
    executeAt: Date;
  }): Promise<string> {
    var id = nanoid(12);
    var now = Date.now();
    var followUp: FollowUp = {
      id,
      agentId: opts.agentId,
      sessionId: opts.sessionId,
      message: opts.message,
      executeAt: opts.executeAt.getTime(),
      status: 'pending',
      createdAt: now,
    };

    this.followUps.set(id, followUp);

    // Persist to DB
    if (this.db) {
      try {
        await this.db.run(
          `INSERT INTO agent_followups (id, agent_id, session_id, message, execute_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
          [id, opts.agentId, opts.sessionId || null, opts.message, followUp.executeAt, now],
        );
      } catch (err: any) {
        console.warn('[followup] Failed to persist follow-up:', err.message);
      }
    }

    return id;
  }

  /**
   * Cancel a pending follow-up.
   */
  async cancel(followUpId: string): Promise<boolean> {
    var followUp = this.followUps.get(followUpId);
    if (!followUp || followUp.status !== 'pending') return false;

    followUp.status = 'cancelled';
    this.followUps.delete(followUpId);

    if (this.db) {
      try {
        await this.db.run(
          `UPDATE agent_followups SET status = 'cancelled' WHERE id = ?`,
          [followUpId],
        );
      } catch {}
    }

    return true;
  }

  /**
   * List pending follow-ups for an agent.
   */
  listPending(agentId: string): FollowUp[] {
    var results: FollowUp[] = [];
    for (var [, fu] of this.followUps) {
      if (fu.agentId === agentId && fu.status === 'pending') {
        results.push(fu);
      }
    }
    return results.sort(function(a, b) { return a.executeAt - b.executeAt; });
  }

  /**
   * Start the scheduler. Loads pending follow-ups from DB if available.
   */
  async start(): Promise<void> {
    if (this.timer) return;

    // Load pending follow-ups from DB
    if (this.db) {
      try {
        var rows = await this.db.query(
          `SELECT * FROM agent_followups WHERE status = 'pending' ORDER BY execute_at ASC`,
          [],
        );
        for (var row of (rows || [])) {
          var r = row as any;
          var followUp: FollowUp = {
            id: r.id,
            agentId: r.agent_id,
            sessionId: r.session_id || undefined,
            message: r.message,
            executeAt: r.execute_at,
            status: 'pending',
            createdAt: r.created_at,
          };
          this.followUps.set(followUp.id, followUp);
        }
        if (this.followUps.size > 0) {
          console.log(`[followup] Loaded ${this.followUps.size} pending follow-ups from DB`);
        }
      } catch (err: any) {
        console.warn('[followup] Failed to load follow-ups from DB:', err.message);
      }
    }

    var self = this;
    this.timer = setInterval(async function() {
      await self.checkDueFollowUps();
    }, this.checkIntervalMs);
    // Don't hold the process open
    this.timer.unref();
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check for and execute due follow-ups.
   */
  private async checkDueFollowUps(): Promise<void> {
    var now = Date.now();
    var due: FollowUp[] = [];

    for (var [id, fu] of this.followUps) {
      if (fu.status === 'pending' && fu.executeAt <= now) {
        due.push(fu);
      }
    }

    for (var followUp of due) {
      try {
        followUp.status = 'executed';
        await this.onDue(followUp);
        this.followUps.delete(followUp.id);

        // Update DB
        if (this.db) {
          try {
            await this.db.run(
              `UPDATE agent_followups SET status = 'executed' WHERE id = ?`,
              [followUp.id],
            );
          } catch {}
        }
      } catch (err) {
        console.warn(`[followup] Failed to execute follow-up ${followUp.id}: ${err}`);
        // Keep in map for retry on next tick
        followUp.status = 'pending';
      }
    }
  }

  /**
   * Get count of pending follow-ups.
   */
  getPendingCount(): number {
    var count = 0;
    for (var [, fu] of this.followUps) {
      if (fu.status === 'pending') count++;
    }
    return count;
  }
}
