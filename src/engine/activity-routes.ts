/**
 * Activity + Monitoring + Engine Stats Routes
 * Mounted at / on the engine sub-app (routes define /activity/*, /stats/*).
 */

import { Hono } from 'hono';
import type { ActivityTracker } from './activity.js';
import type { TenantManager } from './tenant.js';
import type { AgentLifecycleManager } from './lifecycle.js';

export function createActivityRoutes(opts: {
  activity: ActivityTracker;
  tenants: TenantManager;
  lifecycle: AgentLifecycleManager;
}) {
  const { activity, tenants, lifecycle } = opts;
  const router = new Hono();

  // ─── Activity & Monitoring ──────────────────────────────

  router.get('/activity/events', (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const typeFilter = c.req.query('type') || undefined;
    const allEvents = activity.getEvents({
      agentId: c.req.query('agentId') || undefined,
      orgId: c.req.query('orgId') || undefined,
      since: c.req.query('since') || undefined,
      types: typeFilter ? [typeFilter as any] : undefined,
      limit: 10000, // get all matching, paginate below
    });
    const search = (c.req.query('search') || '').toLowerCase();
    const filtered = search
      ? allEvents.filter(e => (e.type || '').toLowerCase().includes(search) || JSON.stringify(e.data || '').toLowerCase().includes(search))
      : allEvents;
    return c.json({ events: filtered.slice(offset, offset + limit), total: filtered.length });
  });

  router.get('/activity/tool-calls', (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const allCalls = activity.getToolCalls({
      agentId: c.req.query('agentId') || undefined,
      orgId: c.req.query('orgId') || undefined,
      toolId: c.req.query('toolId') || undefined,
      limit: 10000,
    });
    const search = (c.req.query('search') || '').toLowerCase();
    const filtered = search
      ? allCalls.filter(tc => (tc.toolId || (tc as any).tool || '').toLowerCase().includes(search))
      : allCalls;
    return c.json({ toolCalls: filtered.slice(offset, offset + limit), total: filtered.length });
  });

  router.get('/activity/conversation/:sessionId', async (c) => {
    const entries = await activity.getConversation(c.req.param('sessionId'));
    return c.json({ entries, total: entries.length });
  });

  router.get('/activity/timeline/:agentId/:date', (c) => {
    const timeline = activity.getTimeline(c.req.param('agentId'), c.req.param('date'));
    return c.json({ timeline });
  });

  router.get('/activity/stats', (c) => {
    const orgId = c.req.query('orgId');
    return c.json(activity.getStats(orgId || undefined));
  });

  // SSE endpoint for real-time events
  router.get('/activity/stream', (c) => {
    const orgId = c.req.query('orgId');
    const agentId = c.req.query('agentId');

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
          catch { unsubscribe(); }
        };

        // Send heartbeat every 30s
        const heartbeat = setInterval(() => send(JSON.stringify({ type: 'heartbeat' })), 30_000);

        const unsubscribe = activity.subscribe((event) => {
          if (orgId && event.orgId !== orgId) return;
          if (agentId && event.agentId !== agentId) return;
          send(JSON.stringify(event));
        });

        // Cleanup on close
        c.req.raw.signal.addEventListener('abort', () => {
          unsubscribe();
          clearInterval(heartbeat);
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  // ─── Knowledge Contributions (org_knowledge memories) ───

  router.get('/activity/knowledge-contributions', async (c) => {
    const orgId = c.req.query('orgId');
    const agentId = c.req.query('agentId');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    try {
      const db = (activity as any).engineDb;
      if (!db) return c.json({ contributions: [], total: 0 });
      let where = "WHERE category = 'org_knowledge'";
      const params: any[] = [];
      if (orgId) { params.push(orgId); where += ` AND org_id = $${params.length}`; }
      if (agentId) { params.push(agentId); where += ` AND agent_id = $${params.length}`; }
      const countResult = await db.db.get(`SELECT COUNT(*) as c FROM agent_memory ${where}`, params);
      const total = parseInt(countResult?.c || '0');
      params.push(limit, offset);
      const rows = await db.db.all(`SELECT * FROM agent_memory ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return c.json({ contributions: rows || [], total });
    } catch (e: any) {
      return c.json({ contributions: [], total: 0, error: e.message });
    }
  });

  // ─── Engine Stats (Dashboard Overview) ──────────────────

  router.get('/stats/:orgId', (c) => {
    const orgId = c.req.param('orgId');
    const org = tenants.getOrg(orgId);
    const agents = lifecycle.getAgentsByOrg(orgId);
    const orgUsage = lifecycle.getOrgUsage(orgId);
    const realTimeStats = activity.getStats(orgId);

    return c.json({
      org: org ? { name: org.name, plan: org.plan, limits: org.limits, usage: org.usage } : null,
      agents: {
        total: agents.length,
        byState: agents.reduce((acc, a) => { acc[a.state] = (acc[a.state] || 0) + 1; return acc; }, {} as Record<string, number>),
      },
      usage: orgUsage,
      realTime: realTimeStats,
    });
  });

  return router;
}
