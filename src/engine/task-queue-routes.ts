/**
 * Task Queue Routes
 *
 * REST + SSE endpoints for the centralized task pipeline.
 * Dashboard subscribes to /task-pipeline/stream for real-time updates.
 */

import { Hono } from 'hono';
import type { TaskQueueManager } from './task-queue.js';

export function createTaskQueueRoutes(taskQueue: TaskQueueManager) {
  const router = new Hono();

  // GET /task-pipeline — all tasks (paginated)
  router.get('/', async (c) => {
    const orgId = c.req.query('orgId') || '';
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');
    const tasks = await taskQueue.getTaskHistory(orgId, limit, offset);
    return c.json({ tasks });
  });

  // GET /task-pipeline/active — only active tasks
  router.get('/active', (c) => {
    const orgId = c.req.query('orgId') || '';
    const tasks = taskQueue.getActiveTasks(orgId);
    return c.json({ tasks });
  });

  // GET /task-pipeline/stats — pipeline statistics
  router.get('/stats', async (c) => {
    const orgId = c.req.query('orgId') || '';
    const stats = await taskQueue.getPipelineStats(orgId);
    return c.json(stats);
  });

  // GET /task-pipeline/agent/:agentId — tasks for specific agent
  router.get('/agent/:agentId', (c) => {
    const agentId = c.req.param('agentId');
    const includeCompleted = c.req.query('completed') === 'true';
    const tasks = taskQueue.getAgentTasks(agentId, includeCompleted);
    return c.json({ tasks });
  });

  // GET /task-pipeline/:id — single task detail
  router.get('/:id', (c) => {
    const task = taskQueue.getTask(c.req.param('id'));
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json({ task });
  });

  // GET /task-pipeline/chain/:chainId — full task chain (delegation flow)
  router.get('/chain/:chainId', (c) => {
    const chain = taskQueue.getTaskChain(c.req.param('chainId'));
    if (!chain.length) return c.json({ error: 'Chain not found' }, 404);
    return c.json({ chain });
  });

  // POST /task-pipeline/:id/delegate — delegate task to another agent
  router.post('/:id/delegate', async (c) => {
    const body = await c.req.json();
    const task = await taskQueue.delegateTask(c.req.param('id'), {
      toAgent: body.toAgent,
      toAgentName: body.toAgentName || body.toAgent,
      delegationType: body.delegationType || 'delegation',
      title: body.title,
      description: body.description,
      priority: body.priority,
    });
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json({ task }, 201);
  });

  // POST /task-pipeline — create task manually
  router.post('/', async (c) => {
    const body = await c.req.json();
    const task = await taskQueue.createTask({
      orgId: body.orgId || '',
      assignedTo: body.assignedTo || '',
      assignedToName: body.assignedToName || '',
      createdBy: body.createdBy || 'dashboard',
      createdByName: body.createdByName || 'Dashboard User',
      title: body.title || 'Untitled Task',
      description: body.description || '',
      category: body.category,
      tags: body.tags,
      priority: body.priority,
      parentTaskId: body.parentTaskId,
      relatedAgentIds: body.relatedAgentIds,
      model: body.model,
      fallbackModel: body.fallbackModel,
    });
    return c.json({ task }, 201);
  });

  // PATCH /task-pipeline/:id — update task
  router.patch('/:id', async (c) => {
    const body = await c.req.json();
    const task = await taskQueue.updateTask(c.req.param('id'), body);
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json({ task });
  });

  // POST /task-pipeline/:id/cancel — cancel a task
  router.post('/:id/cancel', async (c) => {
    const task = await taskQueue.updateTask(c.req.param('id'), { status: 'cancelled' });
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json({ task });
  });

  // ─── SSE Stream ────────────────────────────────────────
  router.get('/stream', (c) => {
    let alive = true;
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: string) => {
          if (!alive) return;
          try { controller.enqueue(enc.encode(data)); } catch { alive = false; }
        };

        // Send initial state
        const active = taskQueue.getActiveTasks();
        const stats = taskQueue.getPipelineStats();
        send(`data: ${JSON.stringify({ type: 'init', tasks: active, stats })}\n\n`);

        // Subscribe to real-time events
        const unsub = taskQueue.subscribe((event) => {
          send(`data: ${JSON.stringify(event)}\n\n`);
        });

        // Heartbeat every 30s
        const hb = setInterval(() => { send(': heartbeat\n\n'); }, 30_000);

        // Cleanup on close
        c.req.raw.signal?.addEventListener('abort', () => {
          alive = false;
          unsub();
          clearInterval(hb);
          try { controller.close(); } catch { /* ignore */ }
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

  return router;
}
