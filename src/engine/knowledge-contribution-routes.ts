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

export function createKnowledgeContributionRoutes(manager: KnowledgeContributionManager, opts?: { lifecycle?: any }) {
  const router = new Hono();
  const getAgentName = (agentId: string) => {
    try {
      const agent = opts?.lifecycle?.getAgent?.(agentId);
      return agent?.config?.identity?.name || agent?.config?.displayName || agent?.config?.name || agent?.name || null;
    } catch { return null; }
  };

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
      const enriched = schedules.map((s: any) => {
        const base = manager.getBase(s.baseId);
        return {
          ...s,
          agentName: getAgentName(s.agentId),
          targetBaseId: s.baseId,
          baseName: base?.name || s.baseId,
          nextRun: s.nextRunAt,
        };
      });
      return c.json({ schedules: enriched });
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
      const baseId = body.baseId || body.targetBaseId;
      if (!baseId) return c.json({ error: 'baseId is required' }, 400);
      if (!body.frequency) return c.json({ error: 'frequency is required' }, 400);
      const schedule = await manager.createSchedule({
        orgId: body.orgId,
        agentId: body.agentId,
        baseId,
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

  // Support both PATCH and PUT (dashboard sends PUT)
  router.put('/schedules/:id', async (c) => {
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

  // Alias: dashboard calls /contributions, which maps to /cycles
  router.get('/contributions', async (c) => {
    try {
      const orgId = c.req.query('orgId') || undefined;
      const agentId = c.req.query('agentId') || undefined;
      const limit = parseInt(c.req.query('limit') || '50');
      
      // Get formal cycles
      const cycles = await manager.listCycles({ orgId, agentId, limit });
      
      // Also pull org_knowledge from agent_memory (where agents actually store contributions)
      let memoryContribs: any[] = [];
      try {
        const db = (manager as any).db;
        if (db) {
          let where = "WHERE category = 'org_knowledge'";
          const params: any[] = [];
          if (agentId) { params.push(agentId); where += ` AND agent_id = $${params.length}`; }
          params.push(limit);
          const rows = await db.all(`SELECT * FROM agent_memory ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
          memoryContribs = (rows || []).map((r: any) => ({
            id: r.id,
            agentId: r.agent_id,
            agentName: getAgentName(r.agent_id),
            baseId: null,
            baseName: 'Organizational Knowledge',
            category: r.category,
            title: (r.title || '').replace(/^knowledge-contrib-/, '').replace(/-/g, ' '),
            content: r.content,
            importance: r.importance,
            confidence: r.confidence,
            status: 'approved',
            createdAt: r.created_at,
            source: 'memory',
          }));
        }
      } catch { /* non-blocking */ }
      
      const all = [...memoryContribs, ...cycles].sort((a, b) => 
        new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime()
      ).slice(0, limit);
      
      return c.json({ contributions: all, cycles, total: all.length });
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
      // Supplement with agent_memory org_knowledge count
      try {
        const db = (manager as any).db;
        if (db) {
          const r = await db.get("SELECT COUNT(*) as c FROM agent_memory WHERE category = 'org_knowledge'");
          (stats as any).totalContributions = ((stats as any).totalContributions || 0) + parseInt(r?.c || '0');
          if (!stats.totalEntries) stats.totalEntries = parseInt(r?.c || '0');
        }
      } catch {}
      return c.json({ stats });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // Timeline data for charts
  router.get('/stats/timeline', async (c) => {
    try {
      const db = (manager as any).db;
      if (!db) return c.json({ timeline: [], byAgent: [], byCategory: [], confidenceOverTime: [] });

      const days = parseInt(c.req.query('days') || '30');
      const agentId = c.req.query('agentId') || undefined;

      // Contributions per day
      let timelineQuery = `SELECT DATE(created_at) as day, COUNT(*) as count, AVG(confidence) as avg_confidence FROM agent_memory WHERE category = 'org_knowledge'`;
      const params: any[] = [];
      if (agentId) { params.push(agentId); timelineQuery += ` AND agent_id = $${params.length}`; }
      params.push(days);
      timelineQuery += ` AND created_at >= NOW() - INTERVAL '1 day' * $${params.length} GROUP BY DATE(created_at) ORDER BY day`;
      const timeline = await db.all(timelineQuery, params).catch(() => []) || [];

      // By agent
      let byAgentQuery = `SELECT agent_id, COUNT(*) as count, AVG(confidence) as avg_confidence FROM agent_memory WHERE category = 'org_knowledge'`;
      const params2: any[] = [];
      params2.push(days);
      byAgentQuery += ` AND created_at >= NOW() - INTERVAL '1 day' * $${params2.length} GROUP BY agent_id ORDER BY count DESC`;
      const byAgentRows = await db.all(byAgentQuery, params2).catch(() => []) || [];
      const byAgent = byAgentRows.map((r: any) => ({
        agentId: r.agent_id,
        agentName: getAgentName(r.agent_id) || r.agent_id,
        count: parseInt(r.count),
        avgConfidence: parseFloat(r.avg_confidence || '0'),
      }));

      // By category (from content/title patterns)
      let byCatQuery = `SELECT importance, COUNT(*) as count FROM agent_memory WHERE category = 'org_knowledge'`;
      const params3: any[] = [];
      params3.push(days);
      byCatQuery += ` AND created_at >= NOW() - INTERVAL '1 day' * $${params3.length} GROUP BY importance ORDER BY count DESC`;
      const byCategory = await db.all(byCatQuery, params3).catch(() => []) || [];

      // Confidence over time (weekly buckets)
      let confQuery = `SELECT DATE_TRUNC('week', created_at) as week, AVG(confidence) as avg_confidence, MIN(confidence) as min_confidence, MAX(confidence) as max_confidence, COUNT(*) as count FROM agent_memory WHERE category = 'org_knowledge'`;
      const params4: any[] = [];
      params4.push(days);
      confQuery += ` AND created_at >= NOW() - INTERVAL '1 day' * $${params4.length} GROUP BY DATE_TRUNC('week', created_at) ORDER BY week`;
      const confidenceOverTime = await db.all(confQuery, params4).catch(() => []) || [];

      // Per-agent daily breakdown
      let agentDailyQuery = `SELECT DATE(created_at) as day, agent_id, COUNT(*) as count FROM agent_memory WHERE category = 'org_knowledge'`;
      const params5: any[] = [];
      params5.push(days);
      agentDailyQuery += ` AND created_at >= NOW() - INTERVAL '1 day' * $${params5.length} GROUP BY DATE(created_at), agent_id ORDER BY day`;
      const agentDaily = await db.all(agentDailyQuery, params5).catch(() => []) || [];
      const agentDailyEnriched = (agentDaily || []).map((r: any) => ({
        day: r.day,
        agentId: r.agent_id,
        agentName: getAgentName(r.agent_id) || r.agent_id,
        count: parseInt(r.count),
      }));

      return c.json({
        timeline: (timeline || []).map((r: any) => ({ day: r.day, count: parseInt(r.count), avgConfidence: parseFloat(r.avg_confidence || '0') })),
        byAgent,
        byCategory: (byCategory || []).map((r: any) => ({ category: r.importance || 'unset', count: parseInt(r.count) })),
        confidenceOverTime: (confidenceOverTime || []).map((r: any) => ({
          week: r.week,
          avgConfidence: parseFloat(r.avg_confidence || '0'),
          minConfidence: parseFloat(r.min_confidence || '0'),
          maxConfidence: parseFloat(r.max_confidence || '0'),
          count: parseInt(r.count),
        })),
        agentDaily: agentDailyEnriched,
      });
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

  // ─── Knowledge Search Metrics ─────────────────────────

  router.get('/search-metrics', async (c) => {
    try {
      const db = (manager as any).db;
      if (!db) return c.json({ error: 'Database not available' }, 500);

      const days = parseInt(c.req.query('days') || '7');
      const agentId = c.req.query('agentId');
      const since = new Date(Date.now() - days * 86400000).toISOString();

      let sql = `SELECT * FROM knowledge_search_log WHERE timestamp >= ?`;
      const params: any[] = [since];
      if (agentId) {
        sql += ` AND agent_id = ?`;
        params.push(agentId);
      }
      sql += ` ORDER BY timestamp DESC LIMIT 500`;

      let rows: any[];
      try {
        rows = await db.all(sql, params) || [];
      } catch (e: any) {
        // Table may not exist yet
        if (e.message?.includes('does not exist') || e.message?.includes('no such table')) {
          rows = [];
        } else throw e;
      }

      // Aggregate metrics
      const totalSearches = rows.length;
      const kbSearches = rows.filter((r: any) => r.search_type === 'knowledge_base').length;
      const hubSearches = rows.filter((r: any) => r.search_type === 'knowledge_hub').length;
      const helpfulSearches = rows.filter((r: any) => r.was_helpful).length;
      const hitRate = totalSearches > 0 ? Math.round((helpfulSearches / totalSearches) * 100) : 0;

      // By agent
      const byAgent: Record<string, { total: number; helpful: number; hitRate: number }> = {};
      for (const r of rows) {
        const aid = r.agent_id;
        if (!byAgent[aid]) byAgent[aid] = { total: 0, helpful: 0, hitRate: 0 };
        byAgent[aid].total++;
        if (r.was_helpful) byAgent[aid].helpful++;
      }
      for (const a of Object.values(byAgent)) {
        a.hitRate = a.total > 0 ? Math.round((a.helpful / a.total) * 100) : 0;
      }

      // Timeline (daily)
      const timeline: Record<string, { date: string; kb: number; hub: number; helpful: number }> = {};
      for (const r of rows) {
        const day = (r.timestamp || '').slice(0, 10);
        if (!timeline[day]) timeline[day] = { date: day, kb: 0, hub: 0, helpful: 0 };
        if (r.search_type === 'knowledge_base') timeline[day].kb++;
        else timeline[day].hub++;
        if (r.was_helpful) timeline[day].helpful++;
      }

      // Recent searches
      const recent = rows.slice(0, 20).map((r: any) => ({
        id: r.id,
        agentId: r.agent_id,
        type: r.search_type,
        query: r.query,
        results: r.results_count,
        topScore: r.top_score,
        helpful: r.was_helpful,
        durationMs: r.duration_ms,
        timestamp: r.timestamp,
      }));

      return c.json({
        totalSearches,
        kbSearches,
        hubSearches,
        helpfulSearches,
        hitRate,
        byAgent,
        timeline: Object.values(timeline).sort((a, b) => a.date.localeCompare(b.date)),
        recent,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
