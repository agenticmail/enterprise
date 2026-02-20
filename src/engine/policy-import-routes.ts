/**
 * Bulk Policy Import Routes
 * Mounted at /policies/* on the engine sub-app (before the main policy CRUD routes).
 */

import { Hono } from 'hono';
import { PolicyImporter } from './policy-import.js';

export function createPolicyImportRoutes(importer: PolicyImporter) {
  const router = new Hono();

  // ─── Import Endpoints ────────────────────────────────

  // POST /import — Batch import JSON policies
  router.post('/import', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.policies || !Array.isArray(body.policies)) {
        return c.json({ error: 'orgId and policies array are required' }, 400);
      }
      body.createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
      const job = await importer.importJson(body);
      return c.json({ success: true, job }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /import/documents — Import from base64-encoded documents
  router.post('/import/documents', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.documents || !Array.isArray(body.documents)) {
        return c.json({ error: 'orgId and documents array are required' }, 400);
      }
      body.createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
      const job = await importer.importDocuments(body);
      return c.json({ success: true, job }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /import/urls — Import from remote URLs
  router.post('/import/urls', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.urls || !Array.isArray(body.urls)) {
        return c.json({ error: 'orgId and urls array are required' }, 400);
      }
      body.createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
      const job = await importer.importFromUrls(body);
      return c.json({ success: true, job }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /import/template-pack — Import industry template pack
  router.post('/import/template-pack', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.pack) {
        return c.json({ error: 'orgId and pack are required' }, 400);
      }
      const createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
      const job = await importer.importTemplatePack(body.orgId, body.pack, createdBy);
      return c.json({ success: true, job }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /import/preview — Dry-run: parse and return what would be imported
  router.post('/import/preview', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId required' }, 400);
      body.dryRun = true;
      body.createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';

      let job: any;
      if (body.policies) job = await importer.importJson(body);
      else if (body.documents) job = await importer.importDocuments(body);
      else if (body.urls) job = await importer.importFromUrls(body);
      else return c.json({ error: 'Provide policies, documents, or urls' }, 400);

      return c.json({ preview: true, job });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Job Tracking ────────────────────────────────────

  // GET /import/jobs — List import jobs for org
  router.get('/import/jobs', (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const jobs = importer.getJobsByOrg(orgId);
      return c.json({ jobs, total: jobs.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /import/jobs/:id — Get job status/progress
  router.get('/import/jobs/:id', (c) => {
    try {
      const job = importer.getJob(c.req.param('id'));
      if (!job) return c.json({ error: 'Job not found' }, 404);
      return c.json({ job });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Template Packs ──────────────────────────────────

  // GET /import/template-packs — List available template packs
  router.get('/import/template-packs', (c) => {
    try {
      const packs = PolicyImporter.getTemplatePacks();
      return c.json({ packs });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /import/template-packs/:id — Get specific template pack details
  router.get('/import/template-packs/:id', (c) => {
    try {
      const pack = PolicyImporter.getTemplatePack(c.req.param('id'));
      if (!pack) return c.json({ error: 'Template pack not found' }, 404);
      return c.json({ pack });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  return router;
}
