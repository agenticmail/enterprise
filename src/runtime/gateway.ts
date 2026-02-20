/**
 * Runtime Gateway — HTTP API for Agent Sessions
 *
 * Hono sub-app that exposes agent session management via HTTP.
 * Mounted at /runtime/* on the engine app.
 *
 * Endpoints:
 *   POST   /sessions              — spawn a new agent session
 *   GET    /sessions              — list sessions (by agentId)
 *   GET    /sessions/:id          — get session details
 *   DELETE /sessions/:id          — terminate session
 *   POST   /sessions/:id/message  — send message to active session
 *   GET    /sessions/:id/stream   — SSE stream of session events
 *   POST   /spawn                 — spawn sub-agent
 *   POST   /hooks/inbound         — webhook for inbound email trigger
 *   GET    /health                — runtime health check
 */

import { Hono } from 'hono';
import type { AgentRuntime } from './index.js';
import type { StreamEvent } from './types.js';

// ─── Types ───────────────────────────────────────────────

export interface GatewayConfig {
  runtime: AgentRuntime;
}

// ─── SSE Event Streams ───────────────────────────────────

var activeStreams = new Map<string, Set<(event: StreamEvent) => void>>();

export function emitSessionEvent(sessionId: string, event: StreamEvent): void {
  var listeners = activeStreams.get(sessionId);
  if (listeners) {
    for (var listener of listeners) {
      listener(event);
    }
  }
}

// ─── Create Gateway App ──────────────────────────────────

export function createRuntimeGateway(config: GatewayConfig): Hono {
  var app = new Hono();
  var runtime = config.runtime;

  // ─── Health Check ────────────────────────────────

  app.get('/health', function(c) {
    return c.json({
      status: 'ok',
      runtime: 'active',
      sessions: runtime.getActiveSessionCount(),
    });
  });

  // ─── Spawn Session ───────────────────────────────

  app.post('/sessions', async function(c) {
    try {
      var body = await c.req.json();
      var agentId = body.agentId;
      var message = body.message;
      var orgId = body.orgId || 'default';
      var modelOverride = body.model;
      var systemPrompt = body.systemPrompt;

      if (!agentId) {
        return c.json({ error: 'agentId is required' }, 400);
      }
      if (!message) {
        return c.json({ error: 'message is required' }, 400);
      }

      var session = await runtime.spawnSession({
        agentId,
        orgId,
        message,
        model: modelOverride,
        systemPrompt,
      });

      return c.json({
        sessionId: session.id,
        agentId: session.agentId,
        status: session.status,
        createdAt: session.createdAt,
      }, 201);

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── List Sessions ───────────────────────────────

  app.get('/sessions', async function(c) {
    try {
      var agentId = c.req.query('agentId');
      var status = c.req.query('status');
      var limit = parseInt(c.req.query('limit') || '50', 10);

      if (!agentId) {
        return c.json({ error: 'agentId query parameter required' }, 400);
      }

      var sessions = await runtime.listSessions(agentId, { status, limit });
      return c.json({ sessions });

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Get Session ─────────────────────────────────

  app.get('/sessions/:id', async function(c) {
    try {
      var sessionId = c.req.param('id');
      var session = await runtime.getSession(sessionId);

      if (!session) {
        return c.json({ error: 'Session not found' }, 404);
      }

      return c.json(session);

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Delete Session ──────────────────────────────

  app.delete('/sessions/:id', async function(c) {
    try {
      var sessionId = c.req.param('id');
      await runtime.terminateSession(sessionId);
      return c.json({ status: 'terminated' });

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Send Message ────────────────────────────────

  app.post('/sessions/:id/message', async function(c) {
    try {
      var sessionId = c.req.param('id');
      var body = await c.req.json();
      var message = body.message;

      if (!message) {
        return c.json({ error: 'message is required' }, 400);
      }

      await runtime.sendMessage(sessionId, message);
      return c.json({ status: 'sent' });

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── SSE Stream ──────────────────────────────────

  app.get('/sessions/:id/stream', function(c) {
    var sessionId = c.req.param('id');

    return new Response(
      new ReadableStream({
        start(controller) {
          var encoder = new TextEncoder();

          function sendEvent(event: StreamEvent) {
            try {
              var data = JSON.stringify(event);
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));

              // Close stream on session end or error
              if (event.type === 'session_end' || event.type === 'error') {
                cleanup();
                controller.close();
              }
            } catch { /* stream may be closed */ }
          }

          function cleanup() {
            var listeners = activeStreams.get(sessionId);
            if (listeners) {
              listeners.delete(sendEvent);
              if (listeners.size === 0) activeStreams.delete(sessionId);
            }
          }

          // Register listener
          if (!activeStreams.has(sessionId)) {
            activeStreams.set(sessionId, new Set());
          }
          activeStreams.get(sessionId)!.add(sendEvent);

          // Send initial keepalive
          controller.enqueue(encoder.encode(': connected\n\n'));
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      },
    );
  });

  // ─── Spawn Sub-Agent ─────────────────────────────

  app.post('/spawn', async function(c) {
    try {
      var body = await c.req.json();
      var parentSessionId = body.parentSessionId;
      var task = body.task;
      var agentId = body.agentId;
      var model = body.model;

      if (!parentSessionId || !task) {
        return c.json({ error: 'parentSessionId and task are required' }, 400);
      }

      var result = await runtime.spawnSubAgent({
        parentSessionId,
        task,
        agentId,
        model,
      });

      return c.json(result, 201);

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Inbound Email Hook ──────────────────────────

  app.post('/hooks/inbound', async function(c) {
    try {
      var body = await c.req.json();
      var result = await runtime.handleInboundEmail(body);
      return c.json(result);

    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
