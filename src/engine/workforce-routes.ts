/**
 * Workforce Management API Routes
 *
 * Mounted at /workforce/* on the engine router.
 * Provides REST endpoints for schedule management, clock operations,
 * task queuing, and budget overview.
 */

import { Hono } from 'hono';
import type { WorkforceManager } from './workforce.js';

export function createWorkforceRoutes(workforce: WorkforceManager, opts?: { lifecycle?: any }) {
  const router = new Hono();

  // ─── Schedule CRUD ──────────────────────────────────────

  /** List all schedules for the requesting org */
  router.get('/schedules', async (c) => {
    try {
      const orgId = c.req.header('X-User-Id') || 'default';
      const schedules = await workforce.getSchedulesByOrg(orgId);
      return c.json({ schedules, total: schedules.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get a specific agent's schedule */
  router.get('/schedules/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const schedule = await workforce.getSchedule(agentId);
      return c.json({ schedule: schedule || null });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Create or update a schedule */
  router.post('/schedules', async (c) => {
    try {
      const body = await c.req.json();

      if (!body.agentId) {
        return c.json({ error: 'agentId is required' }, 400);
      }
      if (!body.orgId) {
        return c.json({ error: 'orgId is required' }, 400);
      }

      const schedule = {
        id: body.id || crypto.randomUUID(),
        agentId: body.agentId,
        orgId: body.orgId,
        timezone: body.timezone || 'UTC',
        scheduleType: body.scheduleType,
        config: body.config,
        enforceClockIn: body.enforceClockIn ?? false,
        enforceClockOut: body.enforceClockOut ?? false,
        autoWakeEnabled: body.autoWakeEnabled ?? false,
        offHoursAction: body.offHoursAction || 'queue',
        gracePeriodMinutes: body.gracePeriodMinutes ?? 5,
        enabled: body.enabled ?? true,
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await workforce.setSchedule(schedule);
      return c.json({ schedule }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Remove an agent's schedule */
  router.delete('/schedules/:agentId', async (c) => {
    try {
      await workforce.removeSchedule(c.req.param('agentId'));
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Clock In/Out ───────────────────────────────────────

  /** Manual clock-in for an agent */
  router.post('/clock-in/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const userId = c.req.header('X-User-Id') || 'admin';
      const record = await workforce.clockIn(agentId, 'admin:' + userId);
      return c.json({ record });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Manual clock-out for an agent */
  router.post('/clock-out/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const userId = c.req.header('X-User-Id') || 'admin';
      const { reason } = await c.req.json().catch(() => ({ reason: undefined }));
      const record = await workforce.clockOut(agentId, 'admin:' + userId, reason);
      return c.json({ record });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** List clock records with optional filters */
  router.get('/clock-records', async (c) => {
    try {
      const agentId = c.req.query('agentId') || undefined;
      const limit = parseInt(c.req.query('limit') || '50');
      const since = c.req.query('since') || undefined;

      const records = await workforce.getClockRecords({
        agentId,
        limit,
        since,
      });
      return c.json({ records, total: records.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get clock records for a specific agent */
  router.get('/clock-records/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const records = await workforce.getClockRecords({
        agentId,
        limit: 50,
      });
      return c.json({ records, total: records.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Workforce Status ───────────────────────────────────

  /** Get workforce status for all agents in the org */
  router.get('/status', async (c) => {
    try {
      const orgId = c.req.header('X-User-Id') || 'default';
      const status = await workforce.getWorkforceStatus(orgId);
      return c.json(status);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get a single agent's shift status including schedule and queued tasks */
  router.get('/status/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');

      // Fetch schedule, latest clock record, and queued tasks in parallel
      const [schedule, clockRecords, queuedTasks] = await Promise.all([
        workforce.getSchedule(agentId),
        workforce.getClockRecords({ agentId, limit: 1 }),
        workforce.getAgentTasks(agentId, 'queued'),
      ]);

      const latestClock = clockRecords.length > 0 ? clockRecords[0] : null;
      const isOffDuty = !latestClock || latestClock.type === 'clock_out';

      return c.json({
        agentId,
        clockStatus: latestClock,
        schedule: schedule || null,
        queuedTasks,
        isOffDuty,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Task Queue ─────────────────────────────────────────

  /** Add a task to an agent's queue */
  router.post('/tasks', async (c) => {
    try {
      const body = await c.req.json();

      if (!body.agentId) {
        return c.json({ error: 'agentId is required' }, 400);
      }
      if (!body.orgId) {
        return c.json({ error: 'orgId is required' }, 400);
      }
      if (!body.title) {
        return c.json({ error: 'title is required' }, 400);
      }

      const task = {
        id: body.id || crypto.randomUUID(),
        agentId: body.agentId,
        orgId: body.orgId,
        type: body.type || 'general',
        title: body.title,
        description: body.description || '',
        context: body.context || {},
        priority: body.priority || 'normal',
        source: body.source || 'api',
        status: 'queued' as const,
        scheduledFor: body.scheduledFor || null,
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await workforce.addTask(task);
      return c.json({ task }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get an agent's task queue, optionally filtered by status */
  router.get('/tasks/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const status = (c.req.query('status') || undefined) as 'completed' | 'queued' | 'in_progress' | 'cancelled' | undefined;
      const tasks = await workforce.getAgentTasks(agentId, status);
      return c.json({ tasks, total: tasks.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Update a task's status, priority, title, or description */
  router.patch('/tasks/:taskId', async (c) => {
    try {
      const taskId = c.req.param('taskId');
      const body = await c.req.json();

      const updates: Record<string, any> = {};
      if (body.status !== undefined) updates.status = body.status;
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      updates.updatedAt = new Date().toISOString();

      if (Object.keys(updates).length <= 1) {
        return c.json({ error: 'No valid update fields provided' }, 400);
      }

      await workforce.updateTask(taskId, updates);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Budget Overview ────────────────────────────────────

  /** Extended budget overview, requires lifecycle manager to be configured */
  router.get('/budget-overview', async (c) => {
    try {
      const orgId = c.req.header('X-User-Id') || 'default';

      if (!opts?.lifecycle?.getBudgetSummary) {
        return c.json(
          { error: 'Budget overview not available — lifecycle manager not configured' },
          501,
        );
      }

      const summary = await opts.lifecycle.getBudgetSummary(orgId);
      return c.json(summary);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
