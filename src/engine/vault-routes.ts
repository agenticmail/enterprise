/**
 * Secure Vault Routes
 * Mounted at /vault/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { SecureVault } from './vault.js';
import type { DLPEngine } from './dlp.js';

export function createVaultRoutes(vault: SecureVault, dlp?: DLPEngine) {
  const router = new Hono();

  // ─── Secrets CRUD ────────────────────────────────────

  // POST /secrets — Store a new secret
  router.post('/secrets', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId || !body.name || !body.value) {
        return c.json({ error: 'orgId, name, and value are required' }, 400);
      }
      const createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
      const entry = await vault.storeSecret(
        body.orgId, body.name, body.category || 'custom',
        body.value, body.metadata, createdBy
      );
      await vault.auditLog(body.orgId, 'encrypt', createdBy, entry.id, { name: body.name });
      // Return entry WITHOUT the encrypted value for safety
      return c.json({ success: true, entry: { ...entry, encryptedValue: undefined } }, 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /secrets — List secrets for org (metadata only, no decrypted values)
  router.get('/secrets', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const category = c.req.query('category') || undefined;
      const entries = await vault.getSecretsByOrg(orgId, category);
      // Strip encrypted values from response
      const safe = entries.map(e => ({ ...e, encryptedValue: '[encrypted]' }));
      return c.json({ secrets: safe, total: safe.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /secrets/:id — Get a secret (decrypted, admin only)
  router.get('/secrets/:id', async (c) => {
    try {
      const result = await vault.getSecret(c.req.param('id'));
      if (!result) return c.json({ error: 'Secret not found' }, 404);
      const actor = c.req.header('X-User-Id') || 'admin';
      await vault.auditLog(result.entry.orgId, 'decrypt', actor, result.entry.id);
      return c.json({ entry: { ...result.entry, encryptedValue: undefined }, value: result.decrypted });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // DELETE /secrets/:id — Delete a secret
  router.delete('/secrets/:id', async (c) => {
    try {
      const deleted = await vault.deleteSecret(c.req.param('id'));
      if (!deleted) return c.json({ error: 'Secret not found' }, 404);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Rotation ────────────────────────────────────────

  // POST /secrets/:id/rotate — Rotate a specific secret
  router.post('/secrets/:id/rotate', async (c) => {
    try {
      const rotated = await vault.rotateSecret(c.req.param('id'));
      if (!rotated) return c.json({ error: 'Secret not found' }, 404);
      const actor = c.req.header('X-User-Id') || 'admin';
      await vault.auditLog(rotated.orgId, 'rotate', actor, rotated.id);
      return c.json({ success: true, entry: { ...rotated, encryptedValue: '[encrypted]' } });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /rotate-all — Rotate all secrets for an org
  router.post('/rotate-all', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId required' }, 400);
      const result = await vault.rotateAllSecrets(body.orgId);
      const actor = c.req.header('X-User-Id') || 'admin';
      await vault.auditLog(body.orgId, 'rotate_all', actor, undefined, { rotated: result.rotated });
      return c.json({ success: true, ...result });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Migration ───────────────────────────────────────

  // POST /migrate-credentials — Migrate plaintext deploy_credentials to vault
  router.post('/migrate-credentials', async (c) => {
    try {
      const actor = c.req.header('X-User-Id') || 'admin';
      const result = await vault.migrateDeployCredentials();
      await vault.auditLog('system', 'migrate', actor, undefined, result);
      return c.json({ success: true, ...result });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Audit Log ───────────────────────────────────────

  // GET /audit-log — View vault access audit trail
  router.get('/audit-log', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const entries = await vault.getAuditLog(orgId, {
        entryId: c.req.query('entryId') || undefined,
        action: c.req.query('action') || undefined,
        limit: parseInt(c.req.query('limit') || '100'),
      });
      return c.json({ entries, total: entries.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Status ──────────────────────────────────────────

  // GET /status — Vault health
  router.get('/status', (c) => {
    try {
      const status = vault.getStatus();
      return c.json(status);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  return router;
}
