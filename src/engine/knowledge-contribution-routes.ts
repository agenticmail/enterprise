/**
 * Knowledge Contribution System Routes
 * Mounted at /knowledge/* on the engine sub-app.
 *
 * Endpoints:
 *   Bases:       GET  /bases, GET /bases/:id, POST /bases, DELETE /bases/:id
 *   Roles:       GET  /roles, GET /roles/:role/categories
 *   Entries:     GET  /bases/:id/entries, POST /bases/:id/entries,
 *                GET  /entries/:id, PUT /entries/:id/approve, PUT /entries/:id/reject,
 *                PUT  /entries/:id/archive, POST /entries/:id/vote,
 *                POST /entries/:id/record-usage
 *   Schedules:   GET  /schedules, GET /schedules/agent/:agentId,
 *                POST /schedules, PATCH /schedules/:id, DELETE /schedules/:id
 *   Cycles:      POST /contribute/:agentId, GET /cycles, POST /run-due
 *   Bootstrap:   GET  /bootstrap/:role
 *   Stats:       GET  /stats, GET /stats/agent/:agentId
 *   Maintenance: POST /maintenance/decay, POST /maintenance/archive
 */

import { Hono } from 'hono';
import type { KnowledgeContributionManager } from './knowledge-contribution.js';

export function createKnowledgeContributionRoutes(manager: KnowledgeContributionManager) {
  const router = new Hono();

  // ─── Knowledge Bases ───────────────────────────────────

  router.get('/bases', async (c) => {
    try {
      const orgId = c.req.query('orgId');
      if (!orgId) return c.json({ error: 'orgId query parameter is required' }, 400);
      const role = c.req.query('role') || undefined;
      const bases = await manager.listBases(orgId, role);
      return c.json({ bases });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/bases/:id', async (c) => {
    try {
      const base = await manager.getBase(c.req.param('id'));
      if (!base) return c.json({ error: 'Knowledge base not found' }, 404);
      return c.json({ base });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/bases', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId is required' }, 400);
      if (!body.name) return c.json({ error: 'name is required' }, 400);
      if (!body.role) return c.json({ error: 'role is required' }, 400);
      const base = await manager.createBase({
        orgId: body.orgId,
        name: body.name,
        description: body.description || '',
        role: body.role,
        createdBy: userId,
      });
      return c.json({ base }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.delete('/bases/:id', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      await manager.deleteBase(c.req.param('id'), userId);
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Role Categories ───────────────────────────────────

  router.get('/roles', async (c) => {
    try {
      const roles = await manager.listRoles();
      return c.json({ roles });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/roles/:role/categories', async (c) => {
    try {
      const categories = await manager.getCategoriesForRole(c.req.param('role'));
      if (!categories) return c.json({ error: 'Role not found' }, 404);
      return c.json({ categories });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Entries ───────────────────────────────────────────

  router.get('/bases/:id/entries', async (c) => {
    try {
      const baseId = c.req.param('id');
      const entries = await manager.listEntries(baseId, {
        categoryId: c.req.query('categoryId') || undefined,
        status: (c.req.query('status') || undefined) as 'pending' | 'approved' | 'rejected' | 'archived' | undefined,
        minQuality: c.req.query('minQuality') ? parseFloat(c.req.query('minQuality')!) : undefined,
        search: c.req.query('search') || undefined,
        limit: parseInt(c.req.query('limit') || '50'),
        offset: parseInt(c.req.query('offset') || '0'),
      });
      return c.json({ entries });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/bases/:id/entries', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const baseId = c.req.param('id');
      const body = await c.req.json();
      if (!body.categoryId) return c.json({ error: 'categoryId is required' }, 400);
      if (!body.title) return c.json({ error: 'title is required' }, 400);
      if (!body.content) return c.json({ error: 'content is required' }, 400);
      const entry = await manager.contributeEntry(baseId, {
        categoryId: body.categoryId,
        title: body.title,
        content: body.content,
        summary: body.summary || '',
        tags: body.tags || [],
        sourceAgentId: body.sourceAgentId || undefined,
        sourceMemoryId: body.sourceMemoryId || undefined,
        confidence: body.confidence ?? 1.0,
        contributedBy: userId,
      });
      return c.json({ entry }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/entries/:id', async (c) => {
    try {
      const entry = await manager.getEntry(c.req.param('id'));
      if (!entry) return c.json({ error: 'Entry not found' }, 404);
      return c.json({ entry });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.put('/entries/:id/approve', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const entry = await manager.approveEntry(c.req.param('id'), userId);
      if (!entry) return c.json({ error: 'Entry not found' }, 404);
      return c.json({ entry });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.put('/entries/:id/reject', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const entry = await manager.rejectEntry(c.req.param('id'), userId);
      if (!entry) return c.json({ error: 'Entry not found' }, 404);
      return c.json({ entry });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.put('/entries/:id/archive', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const entry = await manager.archiveEntry(c.req.param('id'), userId);
      if (!entry) return c.json({ error: 'Entry not found' }, 404);
      return c.json({ entry });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/entries/:id/vote', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const body = await c.req.json();
      if (!body.direction || !['up', 'down'].includes(body.direction)) {
        return c.json({ error: 'direction must be "up" or "down"' }, 400);
      }
      const result = await manager.vote(c.req.param('id'), userId, body.direction);
      return c.json({ result });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/entries/:id/record-usage', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const agentId = body.agentId || c.req.header('X-Agent-Id') || undefined;
      await manager.recordUsage(c.req.param('id'), agentId);
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Contribution Schedules ────────────────────────────

  router.get('/schedules', async (c) => {
    try {
      const orgId = c.req.query('orgId');
      if (!orgId) return c.json({ error: 'orgId query parameter is required' }, 400);
      const schedules = await manager.listSchedules(orgId);
      return c.json({ schedules });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/schedules/agent/:agentId', async (c) => {
    try {
      const schedule = await manager.getScheduleForAgent(c.req.param('agentId'));
      if (!schedule) return c.json({ error: 'Schedule not found for agent' }, 404);
      return c.json({ schedule });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/schedules', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId is required' }, 400);
      if (!body.agentId) return c.json({ error: 'agentId is required' }, 400);
      if (!body.baseId) return c.json({ error: 'baseId is required' }, 400);
      if (!body.frequency) return c.json({ error: 'frequency is required' }, 400);
      const schedule = await manager.createSchedule({
        orgId: body.orgId,
        agentId: body.agentId,
        baseId: body.baseId,
        frequency: body.frequency,
        dayOfWeek: body.dayOfWeek ?? undefined,
        filters: body.filters || {},
        createdBy: userId,
      });
      return c.json({ schedule }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.patch('/schedules/:id', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const body = await c.req.json();
      const schedule = await manager.updateSchedule(c.req.param('id'), body, userId);
      if (!schedule) return c.json({ error: 'Schedule not found' }, 404);
      return c.json({ schedule });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.delete('/schedules/:id', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      await manager.deleteSchedule(c.req.param('id'), userId);
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Contribution Cycles ───────────────────────────────

  router.post('/contribute/:agentId', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const cycle = await manager.triggerContribution(c.req.param('agentId'), userId);
      return c.json({ cycle }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/cycles', async (c) => {
    try {
      const orgId = c.req.query('orgId') || undefined;
      const agentId = c.req.query('agentId') || undefined;
      const limit = parseInt(c.req.query('limit') || '50');
      const cycles = await manager.listCycles({ orgId, agentId, limit });
      return c.json({ cycles });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/run-due', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const result = await manager.runDueCycles(userId);
      return c.json({ result });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Bootstrap ─────────────────────────────────────────

  router.get('/bootstrap/:role', async (c) => {
    try {
      const role = c.req.param('role');
      const categories = c.req.query('categories')
        ? c.req.query('categories')!.split(',').map((s) => s.trim())
        : undefined;
      const minQuality = c.req.query('minQuality')
        ? parseFloat(c.req.query('minQuality')!)
        : undefined;
      const limit = parseInt(c.req.query('limit') || '50');
      const knowledge = await manager.getBootstrapKnowledge(role, {
        categories,
        minQuality,
        limit,
      });
      return c.json({ knowledge });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Stats ─────────────────────────────────────────────

  router.get('/stats', async (c) => {
    try {
      const orgId = c.req.query('orgId') || undefined;
      const stats = await manager.getStats(orgId);
      return c.json({ stats });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/stats/agent/:agentId', async (c) => {
    try {
      const stats = await manager.getAgentStats(c.req.param('agentId'));
      if (!stats) return c.json({ error: 'Agent not found' }, 404);
      return c.json({ stats });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Maintenance ───────────────────────────────────────

  router.post('/maintenance/decay', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const result = await manager.runQualityDecay(userId);
      return c.json({ result });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/maintenance/archive', async (c) => {
    try {
      const userId = c.req.header('X-User-Id') || 'admin';
      const body = await c.req.json().catch(() => ({}));
      const maxAgeDays = body.maxAgeDays || 90;
      const result = await manager.archiveStaleEntries(maxAgeDays, userId);
      return c.json({ result });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
