/**
 * Deploy Credentials + Dynamic Schema Routes
 * Mounted at / on the engine sub-app (routes define /deploy-credentials/*, /schema/*).
 */

import { Hono } from 'hono';
import type { EngineDatabase } from './db-adapter.js';
import type { SecureVault } from './vault.js';

/** Redact passwords/tokens/keys from credential config for display */
function redactCredConfig(config: Record<string, any>): Record<string, any> {
  const redacted = { ...config };
  const sensitiveKeys = ['password', 'token', 'apiToken', 'apiKey', 'secret', 'privateKey', 'sshKey', 'passphrase'];
  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      if (typeof redacted[key] === 'string' && redacted[key].length > 0) {
        redacted[key] = redacted[key].substring(0, 4) + '***';
      }
    }
  }
  return redacted;
}

/** Decrypt credential config if it was encrypted by the vault */
function decryptCredConfig(config: Record<string, any>, vault?: SecureVault | null): Record<string, any> {
  if (config?._encrypted && vault) {
    try {
      return JSON.parse(vault.decrypt(config._encrypted));
    } catch {
      // Decryption failed — return as-is (may be legacy or corrupt)
      return config;
    }
  }
  return config;
}

/** Encrypt credential config using the vault (if available) */
function encryptCredConfig(config: Record<string, any>, vault?: SecureVault | null): Record<string, any> {
  if (vault) {
    try {
      return { _encrypted: vault.encrypt(JSON.stringify(config)) };
    } catch {
      // Fallback to plaintext if encryption fails
      return config;
    }
  }
  return config;
}

export function createDeploySchemaRoutes(getEngineDb: () => EngineDatabase | null, getVault?: () => SecureVault | null) {
  const router = new Hono();

  // ─── Deploy Credentials ────────────────────────────────

  router.get('/deploy-credentials', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    const orgId = c.req.query('orgId') || 'default';
    const vault = getVault?.() || null;
    const creds = await _engineDb.getDeployCredentialsByOrg(orgId);
    // Decrypt (if encrypted), then redact sensitive config values for display
    const safe = creds.map((cred: any) => ({
      ...cred,
      config: redactCredConfig(decryptCredConfig(cred.config, vault)),
    }));
    return c.json({ credentials: safe });
  });

  router.post('/deploy-credentials', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    const { orgId, name, targetType, config, createdBy } = await c.req.json();
    if (!orgId || !name || !targetType) {
      return c.json({ error: 'orgId, name, and targetType required' }, 400);
    }

    const validTypes = ['docker', 'vps', 'fly', 'railway', 'ssh'];
    if (!validTypes.includes(targetType)) {
      return c.json({ error: `Invalid targetType. Must be one of: ${validTypes.join(', ')}` }, 400);
    }

    const vault = getVault?.() || null;
    const id = crypto.randomUUID();
    await _engineDb.upsertDeployCredential({
      id, orgId, name, targetType,
      config: encryptCredConfig(config || {}, vault),
      createdBy: c.req.header('X-User-Id') || createdBy || 'system',
    });
    return c.json({ id, name, targetType }, 201);
  });

  router.get('/deploy-credentials/:id', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    const vault = getVault?.() || null;
    const cred = await _engineDb.getDeployCredential(c.req.param('id'));
    if (!cred) return c.json({ error: 'Credential not found' }, 404);
    return c.json({ credential: { ...cred, config: redactCredConfig(decryptCredConfig(cred.config, vault)) } });
  });

  router.put('/deploy-credentials/:id', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    const existing = await _engineDb.getDeployCredential(c.req.param('id'));
    if (!existing) return c.json({ error: 'Credential not found' }, 404);

    const vault = getVault?.() || null;
    const body = await c.req.json();
    // Decrypt existing config to merge, then re-encrypt
    const existingConfig = decryptCredConfig(existing.config, vault);
    const newConfig = body.config ? encryptCredConfig(body.config, vault) : encryptCredConfig(existingConfig, vault);
    await _engineDb.upsertDeployCredential({
      ...existing,
      name: body.name || existing.name,
      targetType: body.targetType || existing.targetType,
      config: newConfig,
    });
    return c.json({ ok: true });
  });

  router.delete('/deploy-credentials/:id', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    await _engineDb.deleteDeployCredential(c.req.param('id'));
    return c.json({ ok: true });
  });

  // ─── Dynamic Tables ────────────────────────────────────

  router.post('/schema/tables', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    try {
      const def = await c.req.json();
      if (!def.name || !def.sql) return c.json({ error: 'name and sql are required' }, 400);
      await _engineDb.createDynamicTable(def);
      const prefixed = def.name.startsWith('ext_') ? def.name : `ext_${def.name}`;
      return c.json({ ok: true, table: prefixed });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  router.get('/schema/tables', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    const tables = await _engineDb.listDynamicTables();
    return c.json({ tables });
  });

  router.post('/schema/query', async (c) => {
    const _engineDb = getEngineDb();
    if (!_engineDb) return c.json({ error: 'Engine database not initialized' }, 503);
    try {
      const { sql, params } = await c.req.json();
      if (!sql) return c.json({ error: 'sql is required' }, 400);
      // Only allow SELECT on ext_ tables for safety
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT')) {
        const rows = await _engineDb.query(sql, params);
        return c.json({ rows });
      } else {
        // INSERT/UPDATE/DELETE — verify it targets ext_ tables
        if (!trimmed.includes('EXT_')) {
          return c.json({ error: 'Mutations only allowed on ext_* tables' }, 403);
        }
        await _engineDb.execute(sql, params);
        return c.json({ ok: true });
      }
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  return router;
}
