/**
 * Knowledge Base Routes
 * Mounted at / on the engine sub-app (routes define /knowledge-bases/*).
 */

import { Hono } from 'hono';
import type { KnowledgeBaseEngine } from './knowledge.js';

export function createKnowledgeRoutes(knowledgeBase: KnowledgeBaseEngine) {
  const router = new Hono();

  // ─── Knowledge Base ─────────────────────────────────────

  router.post('/knowledge-bases', async (c) => {
    const { orgId, name, description, agentIds, config } = await c.req.json();
    const kb = knowledgeBase.createKnowledgeBase(orgId, { name, description, agentIds, config });
    return c.json({ knowledgeBase: kb }, 201);
  });

  router.get('/knowledge-bases', (c) => {
    const orgId = c.req.query('orgId');
    const agentId = c.req.query('agentId');
    if (agentId) return c.json({ knowledgeBases: knowledgeBase.getKnowledgeBasesForAgent(agentId) });
    if (orgId) return c.json({ knowledgeBases: knowledgeBase.getKnowledgeBasesByOrg(orgId) });
    // No filter = return all (admin dashboard context)
    return c.json({ knowledgeBases: knowledgeBase.getAllKnowledgeBases() });
  });

  router.get('/knowledge-bases/:id', (c) => {
    const kb = knowledgeBase.getKnowledgeBase(c.req.param('id'));
    if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
    return c.json({ knowledgeBase: kb });
  });

  router.post('/knowledge-bases/:id/documents', async (c) => {
    const { name, content, sourceType, sourceUrl, mimeType, metadata } = await c.req.json();
    try {
      const doc = await knowledgeBase.ingestDocument(c.req.param('id'), { name, content, sourceType, sourceUrl, mimeType, metadata });
      return c.json({ document: doc }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.delete('/knowledge-bases/:kbId/documents/:docId', (c) => {
    const ok = knowledgeBase.deleteDocument(c.req.param('kbId'), c.req.param('docId'));
    return ok ? c.json({ success: true }) : c.json({ error: 'Not found' }, 404);
  });

  router.post('/knowledge-bases/search', async (c) => {
    const { agentId, query, kbIds, maxResults, minScore } = await c.req.json();
    const results = await knowledgeBase.search(agentId, query, { kbIds, maxResults, minScore });
    return c.json({ results, total: results.length });
  });

  router.post('/knowledge-bases/context', async (c) => {
    const { agentId, query, maxTokens } = await c.req.json();
    const context = await knowledgeBase.getContext(agentId, query, maxTokens);
    return c.json({ context });
  });

  router.delete('/knowledge-bases/:id', (c) => {
    const ok = knowledgeBase.deleteKnowledgeBase(c.req.param('id'));
    return ok ? c.json({ success: true }) : c.json({ error: 'Not found' }, 404);
  });

  return router;
}
