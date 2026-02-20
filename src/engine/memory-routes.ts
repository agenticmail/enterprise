/**
 * Agent Memory Routes
 * Mounted at /memory/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { AgentMemoryManager } from './agent-memory.js';
import { MEMORY_CATEGORIES } from './agent-memory.js';

export function createMemoryRoutes(memoryManager: AgentMemoryManager) {
  const router = new Hono();

  // ─── Query ─────────────────────────────────────────────────

  router.get('/categories', (c) => {
    return c.json({ categories: MEMORY_CATEGORIES });
  });

  router.get('/agent/:agentId', async (c) => {
    try {
      const memories = await memoryManager.queryMemories({
        agentId: c.req.param('agentId'),
        category: c.req.query('category') || undefined,
        importance: c.req.query('importance') || undefined,
        source: c.req.query('source') || undefined,
        query: c.req.query('q') || undefined,
        limit: parseInt(c.req.query('limit') || '100'),
      });
      return c.json({ memories, total: memories.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/agent/:agentId/stats', async (c) => {
    try {
      const stats = await memoryManager.getStats(c.req.param('agentId'));
      return c.json({ stats });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/org/:orgId/stats', async (c) => {
    try {
      const stats = await memoryManager.getStatsByOrg(c.req.param('orgId'));
      return c.json({ stats });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/:id', async (c) => {
    const memory = await memoryManager.getMemory(c.req.param('id'));
    if (!memory) return c.json({ error: 'Memory not found' }, 404);
    // Record access for tracking
    await memoryManager.recordAccess(memory.id);
    return c.json({ memory });
  });

  // ─── CRUD ──────────────────────────────────────────────────

  router.post('/', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.agentId || !body.title || !body.content) {
        return c.json({ error: 'agentId, title, and content are required' }, 400);
      }
      const memory = await memoryManager.createMemory({
        agentId: body.agentId,
        orgId: body.orgId || 'default',
        category: body.category || 'context',
        title: body.title,
        content: body.content,
        source: body.source || 'admin',
        importance: body.importance || 'normal',
        confidence: body.confidence ?? 1.0,
        lastAccessedAt: undefined,
        expiresAt: body.expiresAt || undefined,
        tags: body.tags || [],
        metadata: body.metadata || {},
      });
      return c.json({ success: true, memory }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.put('/:id', async (c) => {
    try {
      const body = await c.req.json();
      await memoryManager.updateMemory(c.req.param('id'), body);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.delete('/:id', async (c) => {
    await memoryManager.deleteMemory(c.req.param('id'));
    return c.json({ success: true });
  });

  // ─── Context Generation ────────────────────────────────────────

  router.post('/agent/:agentId/context', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const context = await memoryManager.generateMemoryContext(
        c.req.param('agentId'),
        body.query || undefined,
        body.maxTokens || 1500,
      );
      return c.json({ context });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Memory Lifecycle ──────────────────────────────────────────

  router.post('/agent/:agentId/prune', async (c) => {
    try {
      const count = await memoryManager.pruneExpired(c.req.param('agentId'));
      return c.json({ success: true, pruned: count });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/agent/:agentId/decay', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const count = await memoryManager.decayConfidence(c.req.param('agentId'), body.decayRate);
      return c.json({ success: true, decayed: count });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
