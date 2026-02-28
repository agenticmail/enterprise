/**
 * Knowledge Import — API Routes
 *
 * Endpoints:
 *   GET    /sources                — List available import sources
 *   GET    /sources/:type          — Get config fields for a source
 *   POST   /validate               — Validate source config (dry run)
 *   POST   /start                  — Start an import job
 *   GET    /jobs                   — List import jobs for org
 *   GET    /jobs/:id               — Get job status + progress
 *   POST   /jobs/:id/cancel        — Cancel a running job
 *   POST   /upload                 — Upload files for file-upload import
 */

import { Hono } from 'hono';
import type { KnowledgeImportManager } from './import-manager.js';

export function createKnowledgeImportRoutes(manager: KnowledgeImportManager) {
  const router = new Hono();

  // List available import sources
  router.get('/sources', (c) => {
    return c.json({ sources: manager.getSources() });
  });

  // Get config for a specific source
  router.get('/sources/:type', (c) => {
    const source = manager.getSourceConfig(c.req.param('type') as any);
    if (!source) return c.json({ error: 'Unknown source type' }, 404);
    return c.json({ source });
  });

  // Validate source config (dry run)
  router.post('/validate', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.sourceType) return c.json({ error: 'sourceType is required' }, 400);
      const result = await manager.validateSource(body.sourceType, body.config || {});
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // Start an import job
  router.post('/start', async (c) => {
    try {
      const body = await c.req.json();
      const userId = c.req.header('X-User-Id') || 'admin';
      if (!body.orgId) return c.json({ error: 'orgId is required' }, 400);
      if (!body.baseId) return c.json({ error: 'baseId is required (target knowledge base)' }, 400);
      if (!body.sourceType) return c.json({ error: 'sourceType is required' }, 400);
      if (!body.config) return c.json({ error: 'config is required' }, 400);

      const job = await manager.startImport({
        orgId: body.orgId,
        baseId: body.baseId,
        sourceType: body.sourceType,
        sourceConfig: body.config,
        createdBy: userId,
        categoryId: body.categoryId,
      });

      return c.json({ job }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // List jobs
  router.get('/jobs', (c) => {
    const orgId = c.req.query('orgId');
    if (!orgId) return c.json({ error: 'orgId query parameter is required' }, 400);
    const limit = parseInt(c.req.query('limit') || '50');
    const jobs = manager.listJobs(orgId, limit);
    return c.json({ jobs });
  });

  // Get single job
  router.get('/jobs/:id', (c) => {
    const job = manager.getJob(c.req.param('id'));
    if (!job) return c.json({ error: 'Job not found' }, 404);
    return c.json({ job });
  });

  // Cancel job
  router.post('/jobs/:id/cancel', (c) => {
    const ok = manager.cancelJob(c.req.param('id'));
    if (!ok) return c.json({ error: 'Job not found or not running' }, 400);
    return c.json({ ok: true });
  });

  return router;
}
