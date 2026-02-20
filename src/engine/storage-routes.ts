/**
 * Cloud Storage Routes
 * Mounted at /storage/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { StorageManager } from './storage-manager.js';

export function createStorageRoutes(storage: StorageManager) {
  const router = new Hono();

  // Configure storage provider for an org
  router.post('/configure', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.type) return c.json({ error: 'orgId and type are required' }, 400);
      const createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
      const config = await storage.configureStorage(body.orgId, body, createdBy);
      // Redact vault credential id
      return c.json({ success: true, config: { ...config, vaultCredentialId: config.vaultCredentialId ? '***' : undefined } });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get current storage config (credentials redacted)
  router.get('/config', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const config = await storage.getStorageConfig(orgId);
      if (!config) return c.json({ config: null, message: 'No storage configured, using local filesystem' });
      return c.json({ config: { ...config, vaultCredentialId: config.vaultCredentialId ? '***' : undefined } });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Health check
  router.get('/health', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const result = await storage.healthCheck(orgId);
      return c.json(result);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Upload file (base64 in JSON body)
  router.post('/upload', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.fileName || !body.data) {
        return c.json({ error: 'orgId, fileName, and data (base64) are required' }, 400);
      }
      const record = await storage.uploadDocument(body.orgId, {
        fileName: body.fileName,
        data: body.data,  // base64 string
        contentType: body.contentType || 'application/octet-stream',
        relatedType: body.relatedType,
        relatedId: body.relatedId,
        metadata: body.metadata,
        createdBy: c.req.header('X-User-Id') || body.createdBy || 'system',
      });
      return c.json({ success: true, object: record }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get presigned download URL
  router.get('/download/:key{.+}', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const key = c.req.param('key');
      const expires = parseInt(c.req.query('expires') || '3600');
      const url = await storage.getDocumentUrl(orgId, key, expires);
      return c.json({ url });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Delete file
  router.delete('/files/:key{.+}', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const deleted = await storage.deleteDocument(orgId, c.req.param('key'));
      return c.json({ success: deleted });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // List files
  router.get('/files', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const objects = await storage.listDocuments(orgId, {
        relatedType: c.req.query('relatedType') || undefined,
        relatedId: c.req.query('relatedId') || undefined,
        limit: parseInt(c.req.query('limit') || '100'),
      });
      return c.json({ objects, total: objects.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Presigned upload URL (for direct client upload)
  router.post('/presign-upload', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.key) return c.json({ error: 'orgId and key required' }, 400);
      const provider = await storage.getProvider(body.orgId);
      const url = await provider.getPresignedUploadUrl(body.key, body.expiresInSeconds || 3600);
      return c.json({ url, key: body.key });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  return router;
}
