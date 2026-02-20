/**
 * Agent-to-Agent Communication Routes
 * Mounted at /messages/* and /tasks/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { AgentCommunicationBus } from './communication.js';

export function createCommunicationRoutes(commBus: AgentCommunicationBus) {
  const router = new Hono();

  // ─── Messages ──────────────────────────────────────────

  router.post('/observe', async (c) => {
    const body = await c.req.json();
    if (!body.orgId || !body.agentId || !body.toolId) return c.json({ error: 'orgId, agentId, toolId required' }, 400);
    const messages = await commBus.observeToolCall(body);
    return c.json({ observed: messages.length > 0, messages });
  });

  router.post('/', async (c) => {
    const body = await c.req.json();
    if (!body.orgId || !body.fromAgentId || !body.toAgentId) return c.json({ error: 'orgId, fromAgentId, toAgentId required' }, 400);
    const msg = await commBus.sendMessage(body);
    return c.json({ message: msg }, 201);
  });

  router.post('/broadcast', async (c) => {
    const body = await c.req.json();
    if (!body.orgId || !body.fromAgentId || !body.agentIds) return c.json({ error: 'orgId, fromAgentId, agentIds required' }, 400);
    const messages = await commBus.broadcast(body);
    return c.json({ messages, total: messages.length });
  });

  router.get('/topology', (c) => {
    const topology = commBus.getTopology({
      orgId: c.req.query('orgId') || undefined,
      since: c.req.query('since') || undefined,
      agentId: c.req.query('agentId') || undefined,
    });
    return c.json({ topology });
  });

  router.get('/', (c) => {
    const result = commBus.getMessages({
      orgId: c.req.query('orgId') || undefined,
      agentId: c.req.query('agentId') || undefined,
      type: c.req.query('type') as any || undefined,
      status: c.req.query('status') as any || undefined,
      direction: c.req.query('direction') as any || undefined,
      channel: c.req.query('channel') as any || undefined,
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0'),
    });
    return c.json(result);
  });

  router.get('/:id', (c) => {
    const msg = commBus.getMessage(c.req.param('id'));
    if (!msg) return c.json({ error: 'Message not found' }, 404);
    return c.json({ message: msg });
  });

  router.post('/:id/read', async (c) => {
    await commBus.markRead(c.req.param('id'));
    return c.json({ success: true });
  });

  router.get('/inbox/:agentId', (c) => {
    const msgs = commBus.getInbox(c.req.param('agentId'), c.req.query('orgId') || undefined);
    return c.json({ messages: msgs, total: msgs.length });
  });

  router.post('/handoff', async (c) => {
    const body = await c.req.json();
    if (!body.orgId || !body.fromAgentId || !body.toAgentId) return c.json({ error: 'orgId, fromAgentId, toAgentId required' }, 400);
    const msg = await commBus.handoff(body);
    return c.json({ handoff: msg }, 201);
  });

  // SSE endpoint for agent message stream
  router.get('/stream', (c) => {
    const agentId = c.req.query('agentId');
    if (!agentId) return c.json({ error: 'agentId required' }, 400);

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
          catch { unsubscribe(); }
        };

        const heartbeat = setInterval(() => send(JSON.stringify({ type: 'heartbeat' })), 30_000);
        const unsubscribe = commBus.onMessage(agentId!, (msg) => { send(JSON.stringify(msg)); });

        c.req.raw.signal.addEventListener('abort', () => {
          unsubscribe();
          clearInterval(heartbeat);
        });
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  });

  return router;
}

export function createTaskRoutes(commBus: AgentCommunicationBus) {
  const router = new Hono();

  router.post('/delegate', async (c) => {
    const body = await c.req.json();
    if (!body.orgId || !body.fromAgentId || !body.toAgentId) return c.json({ error: 'orgId, fromAgentId, toAgentId required' }, 400);
    const msg = await commBus.delegateTask(body);
    return c.json({ task: msg }, 201);
  });

  router.post('/:id/claim', async (c) => {
    const { agentId } = await c.req.json();
    if (!agentId) return c.json({ error: 'agentId required' }, 400);
    const msg = await commBus.claimTask(c.req.param('id'), agentId);
    if (!msg) return c.json({ error: 'Task not found or unauthorized' }, 404);
    return c.json({ task: msg });
  });

  router.post('/:id/complete', async (c) => {
    const { agentId, result } = await c.req.json();
    if (!agentId) return c.json({ error: 'agentId required' }, 400);
    const msg = await commBus.completeTask(c.req.param('id'), agentId, result);
    if (!msg) return c.json({ error: 'Task not found or unauthorized' }, 404);
    return c.json({ task: msg });
  });

  return router;
}
