/**
 * Agent Local Task Routes
 * Mounted at /local-tasks/* on the engine sub-app.
 *
 * Read/admin surface over an agent's local task tracker (agent_tasks),
 * so the dashboard's agent-detail page can show — and lightly manage —
 * what the agent is tracking. (NOT /tasks — that's the inter-agent
 * delegation queue.)
 */

import { Hono } from 'hono';
import type { AgentTaskManager, TaskStatus } from './agent-tasks.js';

export function createLocalTaskRoutes(taskManager: AgentTaskManager) {
  const router = new Hono();

  // All tasks for an agent (optional ?list= &status= &includeCompleted=)
  router.get('/agent/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const statusQ = c.req.query('status');
      const tasks = await taskManager.listTasks({
        agentId,
        list: c.req.query('list') || undefined,
        status: (statusQ as TaskStatus) || undefined,
        includeCompleted: c.req.query('includeCompleted') === 'true' || !!statusQ,
        limit: parseInt(c.req.query('limit') || '500'),
      });
      return c.json({ tasks, total: tasks.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/agent/:agentId/stats', async (c) => {
    try {
      const stats = await taskManager.getStats(c.req.param('agentId'));
      const lists = await taskManager.listLists(c.req.param('agentId'));
      return c.json({ stats, lists });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // Light management from the dashboard (operator oversight).
  router.patch('/agent/:agentId/:id', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const updated = await taskManager.updateTask(c.req.param('agentId'), c.req.param('id'), body);
      if (!updated) return c.json({ error: 'Task not found' }, 404);
      return c.json({ task: updated });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.delete('/agent/:agentId/:id', async (c) => {
    try {
      await taskManager.deleteTask(c.req.param('agentId'), c.req.param('id'));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/agent/:agentId/clear-completed', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const removed = await taskManager.clearCompleted(c.req.param('agentId'), body.list || undefined);
      return c.json({ ok: true, removed });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
