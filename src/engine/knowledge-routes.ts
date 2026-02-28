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

  // Update knowledge base name/description
  router.put('/knowledge-bases/:id', async (c) => {
    const id = c.req.param('id');
    const kb = knowledgeBase.getKnowledgeBase(id);
    if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
    const body = await c.req.json();
    if (body.name !== undefined) (kb as any).name = body.name;
    if (body.description !== undefined) (kb as any).description = body.description;
    (kb as any).updatedAt = new Date().toISOString();
    // Persist to DB if engine supports it
    if ((knowledgeBase as any).db) {
      try {
        await (knowledgeBase as any).db.execute(
          'UPDATE knowledge_bases SET name = $1, description = $2, updated_at = $3 WHERE id = $4',
          [kb.name, kb.description, (kb as any).updatedAt, id]
        );
      } catch { /* in-memory only fallback */ }
    }
    return c.json({ knowledgeBase: kb });
  });

  // Get chunks for a specific document
  router.get('/knowledge-bases/:kbId/documents/:docId/chunks', (c) => {
    const kbId = c.req.param('kbId');
    const docId = c.req.param('docId');
    const kb = knowledgeBase.getKnowledgeBase(kbId);
    if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);
    // Find the document and return its chunks
    const doc = kb.documents?.find((d: any) => d.id === docId);
    if (!doc) return c.json({ error: 'Document not found' }, 404);
    const docChunks = (doc.chunks || []).slice().sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
    return c.json({ chunks: docChunks, total: docChunks.length });
  });

  // Edit a document (rename, update metadata)
  router.put('/knowledge-bases/:kbId/documents/:docId', async (c) => {
    const docId = c.req.param('docId');
    const kbId = c.req.param('kbId');
    const body = await c.req.json();
    try {
      const db = (knowledgeBase as any).engineDb;
      if (!db) return c.json({ error: 'No database' }, 500);
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (body.name !== undefined) { sets.push(`name = $${i++}`); vals.push(body.name); }
      if (body.sourceUrl !== undefined) { sets.push(`source_url = $${i++}`); vals.push(body.sourceUrl); }
      if (body.status !== undefined) { sets.push(`status = $${i++}`); vals.push(body.status); }
      sets.push(`updated_at = $${i++}`); vals.push(new Date().toISOString());
      vals.push(docId);
      await db.run(`UPDATE kb_documents SET ${sets.join(', ')} WHERE id = $${i}`, vals);
      await knowledgeBase.reloadKnowledgeBase(kbId);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 400); }
  });

  // Edit a chunk (update content, metadata)
  router.put('/knowledge-bases/:kbId/chunks/:chunkId', async (c) => {
    const chunkId = c.req.param('chunkId');
    const kbId = c.req.param('kbId');
    const body = await c.req.json();
    try {
      const db = (knowledgeBase as any).engineDb;
      if (!db) return c.json({ error: 'No database' }, 500);
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (body.content !== undefined) {
        sets.push(`content = $${i++}`); vals.push(body.content);
        sets.push(`token_count = $${i++}`); vals.push(Math.ceil(body.content.length / 4));
      }
      if (body.metadata !== undefined) { sets.push(`metadata = $${i++}`); vals.push(JSON.stringify(body.metadata)); }
      vals.push(chunkId);
      await db.run(`UPDATE kb_chunks SET ${sets.join(', ')} WHERE id = $${i}`, vals);
      await knowledgeBase.reloadKnowledgeBase(kbId);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 400); }
  });

  // Delete a single chunk
  router.delete('/knowledge-bases/:kbId/chunks/:chunkId', async (c) => {
    const kbId = c.req.param('kbId');
    const chunkId = c.req.param('chunkId');
    try {
      const db = (knowledgeBase as any).engineDb;
      if (!db) return c.json({ error: 'No database' }, 500);
      await db.run('DELETE FROM kb_chunks WHERE id = $1', [chunkId]);
      await knowledgeBase.reloadKnowledgeBase(kbId);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 400); }
  });

  router.delete('/knowledge-bases/:id', (c) => {
    const ok = knowledgeBase.deleteKnowledgeBase(c.req.param('id'));
    return ok ? c.json({ success: true }) : c.json({ error: 'Not found' }, 404);
  });

  return router;
}
