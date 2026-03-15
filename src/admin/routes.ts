/**
 * Admin API Routes
 * 
 * CRUD for agents, users, audit logs, rules, settings.
 * All routes are protected by auth middleware (applied in server.ts).
 * Input validation on all mutations. RBAC on sensitive operations.
 */

import { Hono } from 'hono';
import { configBus } from '../engine/config-bus.js';
import type { AppEnv } from '../types/hono-env.js';
import type { DatabaseAdapter } from '../db/adapter.js';
import { validate, requireRole, ValidationError, transportEncryptionMiddleware } from '../middleware/index.js';
import { PROVIDER_REGISTRY, type ProviderDef } from '../runtime/providers.js';
import { USDC_ADDRESS as USDC_E_SHARED } from '../polymarket-engines/shared.js';

/**
 * Validate an API key by making a lightweight request to the provider.
 * Each provider has a different validation endpoint.
 */
async function validateProviderApiKey(
  providerId: string,
  apiKey: string,
  provider: ProviderDef,
): Promise<{ ok: boolean; error?: string }> {
  const timeout = 10_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    let resp: Response;

    switch (providerId) {
      case 'anthropic': {
        // POST /v1/messages with a tiny request — Anthropic returns 401 for bad keys
        resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-20250414', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: ctrl.signal,
        });
        // 200 or 400 (valid key, bad request) = key works; 401/403 = bad key
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key (HTTP ' + resp.status + ')' };
        }
        return { ok: true };
      }

      case 'openai': {
        // GET /v1/models — lightweight, just lists models
        resp = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key (HTTP ' + resp.status + ')' };
        }
        return { ok: true };
      }

      case 'google': {
        // GET /v1beta/models — list Gemini models
        resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, {
          signal: ctrl.signal,
        });
        if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key (HTTP ' + resp.status + ')' };
        }
        return { ok: true };
      }

      case 'xai': {
        resp = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'deepseek': {
        resp = await fetch('https://api.deepseek.com/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'mistral': {
        resp = await fetch('https://api.mistral.ai/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'groq': {
        resp = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'together': {
        resp = await fetch('https://api.together.xyz/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'openrouter': {
        resp = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'fireworks': {
        resp = await fetch('https://api.fireworks.ai/inference/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      case 'cerebras': {
        resp = await fetch('https://api.cerebras.ai/v1/models', {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: ctrl.signal,
        });
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: 'Invalid API key' };
        }
        return { ok: true };
      }

      // Local providers (ollama, vllm, lmstudio, litellm) — skip validation
      case 'ollama':
      case 'vllm':
      case 'lmstudio':
      case 'litellm':
        return { ok: true };

      default: {
        // For unknown/custom providers, try GET /models with Bearer auth
        try {
          resp = await fetch(provider.baseUrl + '/models', {
            headers: { Authorization: 'Bearer ' + apiKey },
            signal: ctrl.signal,
          });
          if (resp.status === 401 || resp.status === 403) {
            return { ok: false, error: 'Invalid API key' };
          }
          return { ok: true };
        } catch {
          // Can't reach — skip validation for custom providers
          return { ok: true };
        }
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { ok: false, error: 'Validation timed out — provider not reachable' };
    }
    return { ok: false, error: e.message || 'Connection failed' };
  } finally {
    clearTimeout(timer);
  }
}
import { deployToFly, getAppStatus, destroyApp, type FlyConfig, type AppConfig } from '../deploy/fly.js';
import { SecureVault } from '../engine/vault.js';
import { getWatcherEngineStatus, controlWatcherEngine } from '../agent-tools/tools/polymarket-watcher.js';
import { importSDK, getProxyState, loadProxyConfig, saveProxyConfig, startProxy, stopProxy, deployProxyToVPS, autoConnectProxy, initPolymarketDB, flushClobClient } from '../agent-tools/tools/polymarket-runtime.js';
import { executeOrder } from '../agent-tools/tools/polymarket.js';

// Shared vault instance for encrypting/decrypting provider API keys
const vault = new SecureVault();

export function createAdminRoutes(db: DatabaseAdapter) {
  const api = new Hono<AppEnv>();

  // Transport encryption middleware — decrypts incoming, encrypts outgoing
  api.use('*', transportEncryptionMiddleware());

  // Wrapper: updateSettings + auto-emit config change events
  const updateSettingsAndEmit = async (updates: any) => {
    const result = await db.updateSettings(updates);
    configBus.emitSettings(Object.keys(updates));
    return result;
  };

  // ─── Dashboard Stats ────────────────────────────────

  api.get('/stats', async (c) => {
    const clientOrgId = c.req.query('clientOrgId') || '';
    if (clientOrgId) {
      // Scoped stats for client org users
      const allAgents = await db.listAgents({ limit: 1000, offset: 0 });
      const orgAgents = allAgents.filter((a: any) => a.client_org_id === clientOrgId);
      const activeOrgAgents = orgAgents.filter((a: any) => a.status === 'active');
      // Count users in this client org
      let orgUsers = 0;
      try {
        const allUsers = await db.listUsers();
        orgUsers = allUsers.filter((u: any) => u.client_org_id === clientOrgId).length;
      } catch { orgUsers = 0; }
      // Count audit events for this org's agents
      let orgAudit = 0;
      try {
        const agentIds = orgAgents.map((a: any) => a.id);
        if (agentIds.length > 0) {
          const result = await (db as any).pool?.query?.(
            `SELECT COUNT(*) FROM audit_log WHERE org_id = $1`,
            [clientOrgId]
          );
          orgAudit = result?.rows?.[0]?.count ? parseInt(result.rows[0].count, 10) : 0;
        }
      } catch { orgAudit = 0; }
      return c.json({
        totalAgents: orgAgents.length,
        activeAgents: activeOrgAgents.length,
        totalUsers: orgUsers,
        totalEmails: 0,
        totalAuditEvents: orgAudit,
      });
    }
    const stats = await db.getStats();
    return c.json(stats);
  });

  // ─── Agents ─────────────────────────────────────────

  api.get('/agents', async (c) => {
    const status = c.req.query('status') as any;
    const clientOrgId = c.req.query('clientOrgId') || '';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);
    let agents = await db.listAgents({ status, limit, offset });
    let total = await db.countAgents(status);
    // Filter by client org if requested
    if (clientOrgId) {
      agents = agents.filter((a: any) => a.client_org_id === clientOrgId);
      total = agents.length;
    }
    return c.json({ agents, total, limit, offset });
  });

  api.get('/agents/:id', async (c) => {
    const agent = await db.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    return c.json(agent);
  });

  api.post('/agents', async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 64, pattern: /^[a-zA-Z0-9_-]+$/ },
      { field: 'email', type: 'email' },
      { field: 'role', type: 'string', maxLength: 32 },
    ]);

    // Check for duplicate name
    const existing = await db.getAgentByName(body.name);
    if (existing) {
      return c.json({ error: 'Agent name already exists' }, 409);
    }

    const userId = c.get('userId') || 'system';
    const agent = await db.createAgent({ ...body, createdBy: userId });
    return c.json(agent, 201);
  });

  api.patch('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await db.getAgent(id);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', minLength: 1, maxLength: 64 },
      { field: 'email', type: 'email' },
      { field: 'role', type: 'string', maxLength: 32 },
      { field: 'status', type: 'string', pattern: /^(active|archived|suspended)$/ },
    ]);

    // If renaming, check for conflicts
    if (body.name && body.name !== existing.name) {
      const conflict = await db.getAgentByName(body.name);
      if (conflict) return c.json({ error: 'Agent name already exists' }, 409);
    }

    const agent = await db.updateAgent(id, body);

    // Update billing_rate if provided
    if ('billingRate' in body || 'billing_rate' in body) {
      const rate = body.billingRate ?? body.billing_rate ?? 0;
      try {
        await (db as any).pool.query('UPDATE agents SET billing_rate = $1 WHERE id = $2', [rate, id]);
      } catch {
        try { const edb = (db as any).db; if (edb?.prepare) edb.prepare('UPDATE agents SET billing_rate = ? WHERE id = ?').run(rate, id); } catch { /* ignore */ }
      }
    }

    configBus.emitAgentUpdate(id, Object.keys(body));
    return c.json(agent);
  });

  api.post('/agents/:id/archive', async (c) => {
    const existing = await db.getAgent(c.req.param('id'));
    if (!existing) return c.json({ error: 'Agent not found' }, 404);
    if (existing.status === 'archived') return c.json({ error: 'Agent already archived' }, 400);

    await db.archiveAgent(c.req.param('id'));
    return c.json({ ok: true, status: 'archived' });
  });

  api.post('/agents/:id/restore', async (c) => {
    const existing = await db.getAgent(c.req.param('id'));
    if (!existing) return c.json({ error: 'Agent not found' }, 404);
    if (existing.status !== 'archived') return c.json({ error: 'Agent is not archived' }, 400);

    await db.updateAgent(c.req.param('id'), { status: 'active' } as any);
    return c.json({ ok: true, status: 'active' });
  });

  // Permanent delete — owner/admin only
  api.delete('/agents/:id', requireRole('admin'), async (c) => {
    const existing = await db.getAgent(c.req.param('id'));
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    await db.deleteAgent(c.req.param('id'));
    return c.json({ ok: true });
  });

  // ─── Agent Deployment ─────────────────────────────────

  api.post('/agents/:id/deploy', requireRole('admin'), async (c) => {
    const agentId = c.req.param('id');
    const agent = await db.getAgent(agentId);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json().catch(() => ({}));
    const targetType = body.targetType || 'fly';
    const config = body.config || {};

    // Get deployment credentials
    const settings = await db.getSettings();
    const pricingConfig = (settings as any)?.modelPricingConfig || {};
    const _providerApiKeys = pricingConfig.providerApiKeys || {};

    if (targetType === 'fly') {
      // Get Fly.io API token from deploy credentials or config
      let flyToken = config.flyApiToken || process.env.FLY_API_TOKEN;
      if (!flyToken && body.credentialId) {
        // Look up stored credential
        try {
          const creds = await (db as any).query?.('SELECT config FROM deploy_credentials WHERE id = $1', [body.credentialId]);
          if (creds?.rows?.[0]?.config) {
            const credConfig = typeof creds.rows[0].config === 'string' ? JSON.parse(creds.rows[0].config) : creds.rows[0].config;
            flyToken = credConfig.apiToken;
          }
        } catch { /* ignore */ }
      }

      if (!flyToken) {
        return c.json({ error: 'Fly.io API token required. Add it in Settings → Deployments or pass flyApiToken in config.' }, 400);
      }

      const flyConfig: FlyConfig = {
        apiToken: flyToken,
        org: config.flyOrg || 'personal',
        image: config.image || 'node:22-slim',
        regions: config.regions || ['iad'],
      };

      const agentName = (agent as any).name || agentId;
      const appConfig: AppConfig = {
        subdomain: agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        dbType: 'postgres',
        dbConnectionString: process.env.DATABASE_URL || '',
        jwtSecret: process.env.JWT_SECRET || 'agent-' + agentId,
        smtpHost: (settings as any)?.smtpHost,
        smtpPort: (settings as any)?.smtpPort,
        smtpUser: (settings as any)?.smtpUser,
        smtpPass: (settings as any)?.smtpPass,
        memoryMb: config.memoryMb || 256,
        cpuKind: config.cpuKind || 'shared',
        cpus: config.cpus || 1,
      };

      try {
        const result = await deployToFly(appConfig, flyConfig);

        // Update agent record with deployment info (stored in metadata)
        const existingAgent = await db.getAgent(agentId);
        const existingMeta = (existingAgent as any)?.metadata || {};
        await db.updateAgent(agentId, {
          status: result.status === 'started' ? 'active' : 'error',
          metadata: {
            ...existingMeta,
            deployment: {
              target: 'fly',
              appName: result.appName,
              url: result.url,
              region: result.region,
              machineId: result.machineId,
              deployedAt: new Date().toISOString(),
              deployedBy: body.deployedBy || 'dashboard',
              status: result.status,
            },
          },
        } as any);

        return c.json({
          success: result.status === 'started',
          deployment: result,
        });
      } catch (err: any) {
        return c.json({ error: 'Deployment failed: ' + err.message }, 500);
      }
    }

    if (targetType === 'local') {
      const existingAgent = await db.getAgent(agentId);
      const existingMeta = (existingAgent as any)?.metadata || {};
      await db.updateAgent(agentId, {
        status: 'active',
        metadata: {
          ...existingMeta,
          deployment: {
            target: 'local',
            url: `http://localhost:${3000 + Math.floor(Math.random() * 1000)}`,
            deployedAt: new Date().toISOString(),
            deployedBy: body.deployedBy || 'dashboard',
            status: 'started',
          },
        },
      } as any);
      return c.json({ success: true, deployment: { status: 'started', target: 'local' } });
    }

    return c.json({ error: 'Unsupported deploy target: ' + targetType + '. Supported: fly, docker, vps, local' }, 400);
  });

  // Get deployment status
  api.get('/agents/:id/deploy', requireRole('admin'), async (c) => {
    const agent = await db.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const meta = (agent as any).metadata || {};
    const info = meta.deployment;
    if (!info) return c.json({ deployed: false });

    if (info.target === 'fly' && info.appName) {
      const flyToken = process.env.FLY_API_TOKEN;
      if (flyToken) {
        try {
          const status = await getAppStatus(info.appName, { apiToken: flyToken });
          return c.json({ deployed: true, ...info, live: status });
        } catch { /* fall through */ }
      }
    }

    return c.json({ deployed: true, ...info });
  });

  // Destroy deployment
  api.delete('/agents/:id/deploy', requireRole('admin'), async (c) => {
    const agent = await db.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const meta = (agent as any).metadata || {};
    const info = meta.deployment;
    if (!info) return c.json({ error: 'Agent not deployed' }, 400);

    if (info.target === 'fly' && info.appName) {
      const flyToken = process.env.FLY_API_TOKEN;
      if (flyToken) {
        try {
          await destroyApp(info.appName, { apiToken: flyToken });
        } catch (err: any) {
          return c.json({ error: 'Failed to destroy: ' + err.message }, 500);
        }
      }
    }

    delete meta.deployment;
    await db.updateAgent(c.req.param('id'), { status: 'inactive', metadata: meta } as any);
    return c.json({ ok: true, message: 'Deployment destroyed' });
  });

  // ─── Users ──────────────────────────────────────────

  api.get('/users', requireRole('admin'), async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);
    const users = await db.listUsers({ limit, offset });
    // Strip sensitive fields
    const safe = users.map(({ passwordHash, totpSecret, totpBackupCodes, ...u }) => u);
    return c.json({ users: safe, limit, offset });
  });

  api.post('/users', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'email', type: 'email', required: true },
      { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 128 },
      { field: 'role', type: 'string', required: true, pattern: /^(owner|admin|member|viewer)$/ },
      { field: 'password', type: 'string', minLength: 8, maxLength: 128 },
    ]);

    // Check duplicate email
    const existing = await db.getUserByEmail(body.email);
    if (existing) return c.json({ error: 'Email already registered' }, 409);

    const user = await db.createUser(body);

    // Mark as must-reset-password (admin-created accounts)
    try {
      await (db as any).pool.query(
        'UPDATE users SET must_reset_password = TRUE WHERE id = $1',
        [user.id]
      );
    } catch {
      try {
        const edb = (db as any).db;
        if (edb?.prepare) edb.prepare('UPDATE users SET must_reset_password = 1 WHERE id = ?').run(user.id);
      } catch { /* ignore */ }
    }

    // Set client org if provided
    if (body.clientOrgId) {
      try {
        await (db as any).pool.query('UPDATE users SET client_org_id = $1 WHERE id = $2', [body.clientOrgId, user.id]);
      } catch {
        try { const edb = (db as any).db; if (edb?.prepare) edb.prepare('UPDATE users SET client_org_id = ? WHERE id = ?').run(body.clientOrgId, user.id); } catch { /* ignore */ }
      }
    }

    // Set initial permissions if provided
    if (body.permissions && body.permissions !== '*') {
      try {
        await (db as any).pool.query(
          'UPDATE users SET permissions = $1 WHERE id = $2',
          [JSON.stringify(body.permissions), user.id]
        );
      } catch {
        try {
          const edb = (db as any).db;
          if (edb?.prepare) edb.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(body.permissions), user.id);
        } catch { /* ignore */ }
      }
    }

    const { passwordHash, ...safe } = user;
    return c.json(safe, 201);
  });

  api.patch('/users/:id', requireRole('admin'), async (c) => {
    const existing = await db.getUser(c.req.param('id'));
    if (!existing) return c.json({ error: 'User not found' }, 404);

    const body = await c.req.json();
    validate(body, [
      { field: 'email', type: 'email' },
      { field: 'name', type: 'string', minLength: 1, maxLength: 128 },
      { field: 'role', type: 'string', pattern: /^(owner|admin|member|viewer)$/ },
    ]);

    const user = await db.updateUser(c.req.param('id'), body);

    // Update client_org_id if provided
    if ('clientOrgId' in body) {
      const orgVal = body.clientOrgId || null;
      try {
        await (db as any).pool.query('UPDATE users SET client_org_id = $1 WHERE id = $2', [orgVal, user.id]);
      } catch {
        try { const edb = (db as any).db; if (edb?.prepare) edb.prepare('UPDATE users SET client_org_id = ? WHERE id = ?').run(orgVal, user.id); } catch { /* ignore */ }
      }
    }

    const { passwordHash, ...safe } = user;
    return c.json(safe);
  });

  // ─── Reset Password (admin/owner can reset any user's password) ──

  api.post('/users/:id/reset-password', requireRole('admin'), async (c) => {
    const existing = await db.getUser(c.req.param('id'));
    if (!existing) return c.json({ error: 'User not found' }, 404);

    const body = await c.req.json();
    const newPassword = body.password;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const { default: bcrypt } = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Use raw SQL via the pool — updateUser doesn't handle password_hash
    await (db as any).pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, c.req.param('id')]
    );

    await db.logEvent({
      actor: c.get('userId') || 'system',
      actorType: 'user',
      action: 'user.password_reset',
      resource: `user:${c.req.param('id')}`,
      details: { targetEmail: existing.email, resetBy: 'admin' },
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip'),
      orgId: c.get('userOrgId' as any) || undefined,
    }).catch(() => {});

    return c.json({ ok: true, message: 'Password reset successfully' });
  });

  // ─── Deactivate / Reactivate User ──────────────────

  api.post('/users/:id/deactivate', requireRole('admin'), async (c) => {
    const existing = await db.getUser(c.req.param('id'));
    if (!existing) return c.json({ error: 'User not found' }, 404);
    const requesterId = c.get('userId');
    if (requesterId === c.req.param('id')) return c.json({ error: 'Cannot deactivate your own account' }, 400);

    try {
      await (db as any).pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [c.req.param('id')]);
    } catch {
      const edb = (db as any).db;
      if (edb?.prepare) edb.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(c.req.param('id'));
    }

    await db.logEvent({
      actor: c.get('userId') || 'system', actorType: 'user', action: 'user.deactivated',
      resource: `user:${c.req.param('id')}`, details: { targetEmail: existing.email },
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      orgId: c.get('userOrgId' as any) || undefined,
    }).catch(() => {});

    return c.json({ ok: true, message: 'User deactivated' });
  });

  api.post('/users/:id/reactivate', requireRole('admin'), async (c) => {
    const existing = await db.getUser(c.req.param('id'));
    if (!existing) return c.json({ error: 'User not found' }, 404);

    try {
      await (db as any).pool.query('UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [c.req.param('id')]);
    } catch {
      const edb = (db as any).db;
      if (edb?.prepare) edb.prepare('UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(c.req.param('id'));
    }

    await db.logEvent({
      actor: c.get('userId') || 'system', actorType: 'user', action: 'user.reactivated',
      resource: `user:${c.req.param('id')}`, details: { targetEmail: existing.email },
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      orgId: c.get('userOrgId' as any) || undefined,
    }).catch(() => {});

    return c.json({ ok: true, message: 'User reactivated' });
  });

  // ─── Delete User (owner only, requires confirmation token) ──

  api.delete('/users/:id', requireRole('owner'), async (c) => {
    const existing = await db.getUser(c.req.param('id'));
    if (!existing) return c.json({ error: 'User not found' }, 404);

    const requesterId = c.get('userId');
    if (requesterId === c.req.param('id')) return c.json({ error: 'Cannot delete your own account' }, 400);

    // Require confirmation token from frontend (5-step modal flow)
    const body = await c.req.json().catch(() => ({}));
    if (body.confirmationToken !== 'DELETE_USER_' + existing.email) {
      return c.json({ error: 'Invalid confirmation. Delete requires 5-step confirmation from the dashboard.' }, 400);
    }

    await db.deleteUser(c.req.param('id'));

    await db.logEvent({
      actor: c.get('userId') || 'system', actorType: 'user', action: 'user.deleted',
      resource: `user:${c.req.param('id')}`, details: { targetEmail: existing.email },
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      orgId: c.get('userOrgId' as any) || undefined,
    }).catch(() => {});

    return c.json({ ok: true });
  });

  // ─── Page Registry (for permission UI) ──────────────

  api.get('/page-registry', requireRole('admin'), async (c) => {
    const { PAGE_REGISTRY } = await import('./page-registry.js');
    return c.json(PAGE_REGISTRY);
  });

  // ─── User Permissions ──────────────────────────────

  api.get('/users/:id/permissions', requireRole('admin'), async (c) => {
    const user = await db.getUser(c.req.param('id'));
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ userId: c.req.param('id'), permissions: user.permissions ?? '*' });
  });

  api.put('/users/:id/permissions', requireRole('admin'), async (c) => {
    const user = await db.getUser(c.req.param('id'));
    if (!user) return c.json({ error: 'User not found' }, 404);

    const body = await c.req.json();
    const permissions = body.permissions;

    // Validate: must be '*' or an object of pageId → true | string[]
    if (permissions !== '*') {
      if (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions)) {
        return c.json({ error: 'permissions must be "*" or an object mapping pageId to true or string[]' }, 400);
      }
      const { PAGE_REGISTRY } = await import('./page-registry.js');
      for (const [pageId, grant] of Object.entries(permissions)) {
        if (pageId === '_allowedAgents') {
          // Validate: must be '*' or string[]
          if (grant !== '*' && !Array.isArray(grant)) {
            return c.json({ error: '_allowedAgents must be "*" or string[]' }, 400);
          }
          continue;
        }
        if (!(pageId in PAGE_REGISTRY)) {
          return c.json({ error: `Unknown page: ${pageId}` }, 400);
        }
        if (grant !== true && !Array.isArray(grant)) {
          return c.json({ error: `Permission for "${pageId}" must be true or string[]` }, 400);
        }
      }
    }

    const serialized = JSON.stringify(permissions);
    try {
      await (db as any).pool.query(
        'UPDATE users SET permissions = $1, updated_at = NOW() WHERE id = $2',
        [serialized, c.req.param('id')]
      );
    } catch {
      // SQLite/other fallback
      const edb = (db as any).db || (db as any).pool;
      if (edb?.prepare) {
        edb.prepare('UPDATE users SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(serialized, c.req.param('id'));
      }
    }

    await db.logEvent({
      actor: c.get('userId') || 'system',
      actorType: 'user',
      action: 'user.permissions_updated',
      resource: `user:${c.req.param('id')}`,
      details: { permissions, targetEmail: user.email },
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      orgId: c.get('userOrgId' as any) || undefined,
    }).catch(() => {});

    return c.json({ ok: true, permissions });
  });

  // ─── Current User Permissions (for frontend filtering) ──

  api.get('/me/permissions', async (c) => {
    const userId = c.get('userId' as any);
    const userRole = c.get('userRole' as any);
    if (!userId) return c.json({ error: 'Not authenticated' }, 401);

    const user = await db.getUser(userId);
    const clientOrgId = user?.clientOrgId || c.get('clientOrgId' as any) || null;

    // Owner and admin always get full access
    if (userRole === 'owner' || userRole === 'admin') {
      return c.json({ permissions: '*', role: userRole, clientOrgId });
    }

    // Client org users get restricted page access by default
    if (clientOrgId) {
      const userPerms = user?.permissions;
      // Default client org pages — hide internal-only pages
      const clientPages: Record<string, boolean> = {
        dashboard: true, agents: true, roles: true, skills: true,
        'community-skills': true, 'skill-connections': true, 'database-access': true,
        knowledge: true, 'knowledge-contributions': true, 'memory-transfer': true,
        approvals: true, 'org-chart': true, 'task-pipeline': true, workforce: true,
        messages: true, guardrails: true, journal: true, activity: true,
        dlp: true, compliance: true, vault: true, audit: true, settings: true,
      };

      // Check org-level allowed_pages — merge additional pages granted by parent org
      try {
        const engineDb = db.getEngineDB();
        let orgRow: any;
        if ((db as any)._query) {
          const { rows } = await (db as any)._query(`SELECT allowed_pages FROM client_organizations WHERE id = $1`, [clientOrgId]);
          orgRow = rows?.[0];
        } else if (engineDb) {
          orgRow = await engineDb.get(`SELECT allowed_pages FROM client_organizations WHERE id = ?`, [clientOrgId]);
        }
        if (orgRow?.allowed_pages) {
          const extraPages = typeof orgRow.allowed_pages === 'string' ? JSON.parse(orgRow.allowed_pages) : orgRow.allowed_pages;
          if (Array.isArray(extraPages)) {
            extraPages.forEach((p: string) => { clientPages[p] = true; });
          }
        }
      } catch {}

      if (userPerms && userPerms !== '*') {
        return c.json({ permissions: userPerms, role: userRole, clientOrgId });
      }
      return c.json({ permissions: clientPages, role: userRole, clientOrgId });
    }

    return c.json({ permissions: user?.permissions ?? '*', role: userRole, clientOrgId });
  });

  // ─── Platform Capabilities ──────────────────────────

  api.get('/platform-capabilities', requireRole('admin'), async (c) => {
    const os = await import('node:os');
    const settings = await db.getSettings();
    return c.json({ capabilities: settings?.platformCapabilities || {}, serverOS: os.platform() });
  });

  api.put('/platform-capabilities', requireRole('owner'), async (c) => {
    const body = await c.req.json();
    const userId = c.get('userId') || 'system';
    const capabilities = {
      localSystemAccess: !!body.localSystemAccess,
      telegram: !!body.telegram,
      whatsapp: !!body.whatsapp,
      enabledAt: new Date().toISOString(),
      enabledBy: userId,
    };

    await updateSettingsAndEmit({ platformCapabilities: capabilities } as any);

    // Also emit per-capability events for services that listen specifically
    for (const [cap, enabled] of Object.entries(body)) {
      if (cap === 'enabledAt' || cap === 'enabledBy') continue;
      configBus.emitCapability(cap, !!enabled);
    }

    await db.logEvent({
      actor: userId,
      actorType: 'user',
      action: 'platform.capabilities_updated',
      resource: 'company_settings',
      details: capabilities,
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip'),
      orgId: c.get('userOrgId' as any) || undefined,
    }).catch(() => {});

    return c.json({ ok: true, capabilities });
  });

  // ─── WhatsApp QR Code ────────────────────────────────

  api.get('/whatsapp/qr/:agentId', requireRole('admin'), async (c) => {
    try {
      var { getWhatsAppQR, isWhatsAppConnected } = await import('../agent-tools/tools/messaging/whatsapp.js');
      var agentId = c.req.param('agentId');
      if (isWhatsAppConnected(agentId)) {
        return c.json({ status: 'connected' });
      }
      var qr = getWhatsAppQR(agentId);
      if (qr) {
        return c.json({ status: 'awaiting_scan', qr });
      }
      return c.json({ status: 'not_initialized', message: 'Agent has not started WhatsApp connection yet.' });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Audit Log ──────────────────────────────────────

  api.get('/audit', requireRole('admin'), async (c) => {
    const filters = {
      actor: c.req.query('actor') || undefined,
      action: c.req.query('action') || undefined,
      resource: c.req.query('resource') || undefined,
      orgId: c.req.query('orgId') || undefined,
      from: c.req.query('from') ? new Date(c.req.query('from')!) : undefined,
      to: c.req.query('to') ? new Date(c.req.query('to')!) : undefined,
      limit: Math.min(parseInt(c.req.query('limit') || '50'), 500),
      offset: Math.max(parseInt(c.req.query('offset') || '0'), 0),
    };

    // Validate date params
    if (filters.from && isNaN(filters.from.getTime())) {
      return c.json({ error: 'Invalid "from" date' }, 400);
    }
    if (filters.to && isNaN(filters.to.getTime())) {
      return c.json({ error: 'Invalid "to" date' }, 400);
    }

    const result = await db.queryAudit(filters);
    return c.json(result);
  });

  // ─── API Keys ───────────────────────────────────────

  api.get('/api-keys', requireRole('admin'), async (c) => {
    const keys = await db.listApiKeys();
    // Never expose key hashes
    const safe = keys.map(({ keyHash, ...k }) => k);
    return c.json({ keys: safe });
  });

  api.post('/api-keys', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 64 },
    ]);

    const userId = c.get('userId') || 'system';
    const scopes = Array.isArray(body.scopes) ? body.scopes : ['*'];
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;

    const { key, plaintext } = await db.createApiKey({
      name: body.name,
      scopes,
      createdBy: userId,
      expiresAt,
    });

    // Only time the plaintext key is returned — emphasize this
    const { keyHash, ...safeKey } = key;
    return c.json({
      key: safeKey,
      plaintext,
      warning: 'Store this key securely. It will not be shown again.',
    }, 201);
  });

  api.delete('/api-keys/:id', requireRole('admin'), async (c) => {
    const existing = await db.getApiKey(c.req.param('id'));
    if (!existing) return c.json({ error: 'API key not found' }, 404);

    await db.revokeApiKey(c.req.param('id'));
    return c.json({ ok: true, revoked: true });
  });

  // ─── Email Rules ────────────────────────────────────

  api.get('/rules', async (c) => {
    const agentId = c.req.query('agentId') || undefined;
    const rules = await db.getRules(agentId);
    return c.json({ rules });
  });

  api.post('/rules', async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 128 },
    ]);

    // Validate conditions/actions are objects
    if (body.conditions && typeof body.conditions !== 'object') {
      return c.json({ error: 'conditions must be an object' }, 400);
    }
    if (body.actions && typeof body.actions !== 'object') {
      return c.json({ error: 'actions must be an object' }, 400);
    }

    const rule = await db.createRule({
      name: body.name,
      agentId: body.agentId,
      conditions: body.conditions || {},
      actions: body.actions || {},
      priority: body.priority ?? 0,
      enabled: body.enabled ?? true,
    });
    return c.json(rule, 201);
  });

  api.patch('/rules/:id', async (c) => {
    const body = await c.req.json();
    const rule = await db.updateRule(c.req.param('id'), body);
    return c.json(rule);
  });

  api.delete('/rules/:id', async (c) => {
    await db.deleteRule(c.req.param('id'));
    return c.json({ ok: true });
  });

  // ─── Settings ───────────────────────────────────────

  api.get('/settings', async (c) => {
    const settings = await db.getSettings();
    if (!settings) return c.json({ error: 'Not configured' }, 404);

    // Redact sensitive fields
    const safe = { ...settings } as any;
    if (safe.smtpPass) safe.smtpPass = '***';
    if (safe.dkimPrivateKey) safe.dkimPrivateKey = '***';
    // Redact SSO secrets
    if (safe.ssoConfig?.oidc?.clientSecret) {
      safe.ssoConfig = { ...safe.ssoConfig, oidc: { ...safe.ssoConfig.oidc, clientSecret: '***' } };
    }
    return c.json(safe);
  });

  api.patch('/settings', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', minLength: 1, maxLength: 128 },
      { field: 'domain', type: 'string', maxLength: 253 },
      { field: 'subdomain', type: 'string', maxLength: 64 },
      { field: 'primaryColor', type: 'string', pattern: /^#[0-9a-fA-F]{6}$/ },
      { field: 'logoUrl', type: 'url' },
      { field: 'smtpHost', type: 'string', maxLength: 253 },
      { field: 'smtpPort', type: 'number' },
      { field: 'smtpUser', type: 'string', maxLength: 253 },
      { field: 'smtpPass', type: 'string', maxLength: 253 },
      { field: 'dkimPrivateKey', type: 'string' },
      { field: 'cfApiToken', type: 'string', maxLength: 500 },
      { field: 'cfAccountId', type: 'string', maxLength: 100 },
      { field: 'plan', type: 'string', maxLength: 32 },
      { field: 'signatureTemplate', type: 'string', maxLength: 10000 },
      { field: 'branding', type: 'object' },
    ]);

    const settings = await updateSettingsAndEmit(body);
    return c.json(settings);
  });

  // ─── Branding Asset Upload ──────────────────────────

  api.post('/settings/branding', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    const { type, data, filename } = body; // type: 'logo' | 'favicon' | 'login_bg', data: base64 string
    if (!type || !data) return c.json({ error: 'type and data are required' }, 400);
    if (!['logo', 'favicon', 'login_bg', 'login_logo'].includes(type)) return c.json({ error: 'Invalid type' }, 400);

    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');

    const brandDir = path.join(os.homedir(), '.agenticmail', 'branding');
    if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });

    // Decode base64 (strip data URL prefix if present)
    const base64 = data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    // Determine extension from filename or data URL
    const ext = filename ? path.extname(filename).toLowerCase() : '.png';
    const validExts = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif', '.webp'];
    if (!validExts.includes(ext)) return c.json({ error: 'Invalid file type. Supported: ' + validExts.join(', ') }, 400);

    // Save original
    const savedName = type + ext;
    fs.writeFileSync(path.join(brandDir, savedName), buffer);

    // Auto-generate favicon from logo upload
    if (type === 'logo' || type === 'favicon') {
      try {
        // Generate multiple sizes for favicon
        const sharp = (await import('sharp')).default;
        const sizes = [16, 32, 48, 64, 180, 192, 512];
        for (const size of sizes) {
          await sharp(buffer).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(brandDir, `icon-${size}.png`));
        }
        // Generate ICO (just use 32px PNG as simple favicon)
        await sharp(buffer).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(brandDir, 'favicon.png'));
        // Apple touch icon
        await sharp(buffer).resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(brandDir, 'apple-touch-icon.png'));
      } catch (e: any) {
        console.warn('[branding] Sharp not available, skipping icon generation:', e.message);
        // Still save the original — just won't have auto-generated sizes
      }
    }

    // Save branding config to settings (with cache-busting timestamp)
    const settings = await db.getSettings();
    const branding = settings?.branding || {};
    const v = Date.now();
    (branding as any)[type] = `/branding/${savedName}?v=${v}`;
    if (type === 'logo' || type === 'favicon') {
      (branding as any).favicon = `/branding/favicon.png?v=${v}`;
      (branding as any).appleTouchIcon = `/branding/apple-touch-icon.png?v=${v}`;
      (branding as any).icon192 = `/branding/icon-192.png?v=${v}`;
      (branding as any).icon512 = `/branding/icon-512.png?v=${v}`;
    }
    await updateSettingsAndEmit({ branding });

    return c.json({ success: true, branding, message: 'Branding assets saved. Refresh to see changes.' });
  });

  api.delete('/settings/branding/:type', requireRole('admin'), async (c) => {
    const type = c.req.param('type');
    if (!['logo', 'favicon', 'login_bg', 'login_logo'].includes(type)) return c.json({ error: 'Invalid type' }, 400);

    const settings = await db.getSettings();
    const branding = settings?.branding || {};
    delete (branding as any)[type];
    // If removing logo, also remove auto-generated icons
    if (type === 'logo') {
      delete (branding as any).favicon;
      delete (branding as any).appleTouchIcon;
      delete (branding as any).icon192;
      delete (branding as any).icon512;
    }
    await updateSettingsAndEmit({ branding });
    return c.json({ success: true, branding });
  });

  // ─── SSO Configuration ────────────────────────────

  api.get('/settings/sso', requireRole('admin'), async (c) => {
    const settings = await db.getSettings();
    if (!settings) return c.json({ ssoConfig: null });

    const sso = settings.ssoConfig || {};
    // Redact secrets for display
    const safe = { ...sso } as any;
    if (safe.oidc?.clientSecret) {
      safe.oidc = { ...safe.oidc, clientSecret: '***' };
    }
    if (safe.saml?.certificate) {
      // Show first/last 20 chars of cert
      const cert = safe.saml.certificate;
      safe.saml = {
        ...safe.saml,
        certificate: cert.length > 50
          ? cert.substring(0, 20) + '...' + cert.substring(cert.length - 20)
          : cert,
        certificateConfigured: true,
      };
    }
    return c.json({ ssoConfig: safe });
  });

  api.put('/settings/sso/saml', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'entityId', type: 'string', required: true, minLength: 1, maxLength: 512 },
      { field: 'ssoUrl', type: 'url', required: true },
      { field: 'certificate', type: 'string', required: true, minLength: 10 },
    ]);

    const settings = await db.getSettings();
    const current = settings?.ssoConfig || {};
    const ssoConfig = {
      ...current,
      saml: {
        entityId: body.entityId,
        ssoUrl: body.ssoUrl,
        certificate: body.certificate,
        signatureAlgorithm: body.signatureAlgorithm || 'RSA-SHA256',
        autoProvision: body.autoProvision ?? true,
        defaultRole: body.defaultRole || 'member',
        allowedDomains: body.allowedDomains || [],
      },
    };

    await updateSettingsAndEmit({ ssoConfig } as any);
    return c.json({ ok: true, provider: 'saml', configured: true });
  });

  api.put('/settings/sso/oidc', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'clientId', type: 'string', required: true, minLength: 1, maxLength: 256 },
      { field: 'clientSecret', type: 'string', required: true, minLength: 1, maxLength: 512 },
      { field: 'discoveryUrl', type: 'url', required: true },
    ]);

    const settings = await db.getSettings();
    const current = settings?.ssoConfig || {};

    // If clientSecret is '***', keep the existing one
    let clientSecret = body.clientSecret;
    if (clientSecret === '***' && current.oidc?.clientSecret) {
      clientSecret = current.oidc.clientSecret;
    }

    const ssoConfig = {
      ...current,
      oidc: {
        clientId: body.clientId,
        clientSecret,
        discoveryUrl: body.discoveryUrl,
        scopes: body.scopes || ['openid', 'email', 'profile'],
        autoProvision: body.autoProvision ?? true,
        defaultRole: body.defaultRole || 'member',
        allowedDomains: body.allowedDomains || [],
      },
    };

    await updateSettingsAndEmit({ ssoConfig } as any);
    return c.json({ ok: true, provider: 'oidc', configured: true });
  });

  api.delete('/settings/sso/:provider', requireRole('admin'), async (c) => {
    const provider = c.req.param('provider');
    if (provider !== 'saml' && provider !== 'oidc') {
      return c.json({ error: 'Invalid provider. Use "saml" or "oidc".' }, 400);
    }

    const settings = await db.getSettings();
    const current = settings?.ssoConfig || {};
    const ssoConfig = { ...current };
    delete (ssoConfig as any)[provider];

    await updateSettingsAndEmit({ ssoConfig } as any);
    return c.json({ ok: true, provider, removed: true });
  });

  // Test OIDC discovery URL
  api.post('/settings/sso/oidc/test', requireRole('admin'), async (c) => {
    const { discoveryUrl } = await c.req.json();
    if (!discoveryUrl) return c.json({ error: 'discoveryUrl required' }, 400);

    try {
      const res = await fetch(discoveryUrl);
      if (!res.ok) return c.json({ ok: false, error: `HTTP ${res.status}` });
      const doc = await res.json();

      return c.json({
        ok: true,
        issuer: doc.issuer,
        hasAuthorizationEndpoint: !!doc.authorization_endpoint,
        hasTokenEndpoint: !!doc.token_endpoint,
        hasUserinfoEndpoint: !!doc.userinfo_endpoint,
        hasJwksUri: !!doc.jwks_uri,
        supportedScopes: doc.scopes_supported,
      });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message });
    }
  });

  // ─── Organization Email Config ─────────────────────

  api.get('/settings/org-email', requireRole('admin'), async (c) => {
    const settings = await db.getSettings();
    const cfg = settings?.orgEmailConfig;
    if (!cfg) return c.json({ configured: false });
    return c.json({
      configured: cfg.configured || false,
      provider: cfg.provider,
      label: cfg.label,
      oauthClientId: cfg.oauthClientId,
      oauthTenantId: cfg.oauthTenantId,
    });
  });

  api.put('/settings/org-email', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    const { provider, oauthClientId, oauthClientSecret, oauthTenantId } = body;
    if (!provider || !['google', 'microsoft'].includes(provider)) {
      return c.json({ error: 'provider must be "google" or "microsoft"' }, 400);
    }
    if (!oauthClientId || !oauthClientSecret) {
      return c.json({ error: 'oauthClientId and oauthClientSecret are required' }, 400);
    }
    const label = provider === 'google' ? 'Google Workspace' : 'Microsoft 365';
    const orgEmailConfig = {
      provider,
      oauthClientId,
      oauthClientSecret,
      oauthTenantId: provider === 'microsoft' ? (oauthTenantId || 'common') : undefined,
      oauthRedirectUri: '', // Will be set per-agent at OAuth time
      configured: true,
      label,
    };
    await updateSettingsAndEmit({ orgEmailConfig } as any);
    return c.json({ success: true, orgEmailConfig: { configured: true, provider, label, oauthClientId, oauthTenantId: orgEmailConfig.oauthTenantId } });
  });

  api.delete('/settings/org-email', requireRole('admin'), async (c) => {
    await updateSettingsAndEmit({ orgEmailConfig: null } as any);
    return c.json({ success: true });
  });

  // ─── Tool Security Config ─────────────────────────

  api.get('/settings/tool-security', requireRole('admin'), async (c) => {
    const settings = await db.getSettings();
    return c.json({ toolSecurityConfig: settings?.toolSecurityConfig || {} });
  });

  api.put('/settings/tool-security', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    // Validate top-level shape
    if (body && typeof body !== 'object') {
      return c.json({ error: 'Body must be a JSON object' }, 400);
    }
    await updateSettingsAndEmit({ toolSecurityConfig: body } as any);
    const settings = await db.getSettings();
    return c.json({ toolSecurityConfig: settings?.toolSecurityConfig || {} });
  });

  // ─── Firewall Config ──────────────────────────────────

  api.get('/settings/firewall', requireRole('admin'), async (c) => {
    const settings = await db.getSettings();
    return c.json({ firewallConfig: settings?.firewallConfig || {} });
  });

  api.put('/settings/firewall', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    if (body && typeof body !== 'object') {
      return c.json({ error: 'Body must be a JSON object' }, 400);
    }
    // Validate mode fields
    if (body.ipAccess?.mode && !['allowlist', 'blocklist'].includes(body.ipAccess.mode)) {
      return c.json({ error: 'ipAccess.mode must be "allowlist" or "blocklist"' }, 400);
    }
    if (body.egress?.mode && !['allowlist', 'blocklist'].includes(body.egress.mode)) {
      return c.json({ error: 'egress.mode must be "allowlist" or "blocklist"' }, 400);
    }
    // Validate CIDR entries
    const { isValidIpOrCidr } = await import('../lib/cidr.js');
    for (const entry of (body.ipAccess?.allowlist || [])) {
      if (!isValidIpOrCidr(entry)) return c.json({ error: 'Invalid IP/CIDR in allowlist: ' + entry }, 400);
    }
    for (const entry of (body.ipAccess?.blocklist || [])) {
      if (!isValidIpOrCidr(entry)) return c.json({ error: 'Invalid IP/CIDR in blocklist: ' + entry }, 400);
    }
    for (const entry of (body.trustedProxies?.ips || [])) {
      if (!isValidIpOrCidr(entry)) return c.json({ error: 'Invalid IP/CIDR in trusted proxies: ' + entry }, 400);
    }
    // Self-lockout protection for allowlist mode
    if (body.ipAccess?.enabled && body.ipAccess?.mode === 'allowlist' && body.ipAccess?.allowlist?.length > 0) {
      const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '';
      if (clientIp && clientIp !== 'unknown') {
        const { compileIpMatcher } = await import('../lib/cidr.js');
        const matcher = compileIpMatcher(body.ipAccess.allowlist);
        if (!matcher(clientIp)) {
          return c.json({ error: 'Your current IP (' + clientIp + ') is not in the allowlist. Add it first to avoid lockout.' }, 400);
        }
      }
    }
    await updateSettingsAndEmit({ firewallConfig: body } as any);
    // Hot-reload ALL network middleware (firewall, security headers, rate limiting, HTTPS, egress, proxy)
    try { const { invalidateNetworkConfig } = await import('../middleware/network-config.js'); await invalidateNetworkConfig(); } catch {}
    const settings = await db.getSettings();
    return c.json({ firewallConfig: settings?.firewallConfig || {} });
  });

  api.post('/settings/firewall/test-ip', requireRole('admin'), async (c) => {
    const { ip } = await c.req.json();
    if (!ip) return c.json({ error: 'ip is required' }, 400);
    const { isValidIpOrCidr, compileIpMatcher } = await import('../lib/cidr.js');
    if (!isValidIpOrCidr(ip)) return c.json({ error: 'Invalid IP address' }, 400);
    const settings = await db.getSettings();
    const ipAccess = settings?.firewallConfig?.ipAccess;
    if (!ipAccess?.enabled) {
      return c.json({ ip, allowed: true, reason: 'IP access control is disabled' });
    }
    if (ipAccess.mode === 'allowlist') {
      const matcher = compileIpMatcher(ipAccess.allowlist || []);
      const allowed = matcher(ip);
      return c.json({ ip, allowed, reason: allowed ? 'IP matches allowlist' : 'IP not in allowlist' });
    } else {
      const matcher = compileIpMatcher(ipAccess.blocklist || []);
      const blocked = matcher(ip);
      return c.json({ ip, allowed: !blocked, reason: blocked ? 'IP matches blocklist' : 'IP not in blocklist' });
    }
  });

  // ─── Model Pricing Config ──────────────────────────────

  api.get('/settings/model-pricing', requireRole('admin'), async (c) => {
    const settings = await db.getSettings();
    var config = settings?.modelPricingConfig || { models: [], currency: 'USD' };
    // Pre-seed with defaults if empty
    if (!config.models || config.models.length === 0) {
      config.models = getDefaultModelPricing();
    }
    return c.json({ modelPricingConfig: config });
  });

  api.put('/settings/model-pricing', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Body must be a JSON object' }, 400);
    }
    // Validate models array
    if (body.models && Array.isArray(body.models)) {
      for (const m of body.models) {
        if (!m.provider || !m.modelId) {
          return c.json({ error: 'Each model must have provider and modelId' }, 400);
        }
        if (typeof m.inputCostPerMillion !== 'number' || m.inputCostPerMillion < 0) {
          return c.json({ error: `Invalid inputCostPerMillion for ${m.modelId}` }, 400);
        }
        if (typeof m.outputCostPerMillion !== 'number' || m.outputCostPerMillion < 0) {
          return c.json({ error: `Invalid outputCostPerMillion for ${m.modelId}` }, 400);
        }
      }
    }
    body.updatedAt = new Date().toISOString();
    await updateSettingsAndEmit({ modelPricingConfig: body } as any);
    const settings = await db.getSettings();
    return c.json({ modelPricingConfig: settings?.modelPricingConfig || {} });
  });

  // ─── Provider Management ─────────────────────────────

  api.get('/providers', requireRole('admin'), async (c) => {
    var settings = await db.getSettings();
    var pricingConfig = (settings as any)?.modelPricingConfig;
    var savedApiKeys = pricingConfig?.providerApiKeys || {};
    var builtIn = Object.values(PROVIDER_REGISTRY).map(function(p) {
      var configured = !p.requiresApiKey || !!savedApiKeys[p.id];
      return {
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        apiType: p.apiType,
        isLocal: p.isLocal,
        requiresApiKey: p.requiresApiKey,
        configured: configured,
        source: 'built-in' as const,
        defaultModels: p.defaultModels || [],
      };
    });

    var customProviders = pricingConfig?.customProviders || [];
    var custom = customProviders.map(function(p: any) {
      return { ...p, configured: true, source: 'custom' as const };
    });

    return c.json({ providers: [...builtIn, ...custom] });
  });

  api.post('/providers', requireRole('admin'), async (c) => {
    var body = await c.req.json();
    if (!body.id || !body.name || !body.baseUrl || !body.apiType) {
      return c.json({ error: 'id, name, baseUrl, and apiType are required' }, 400);
    }
    if (PROVIDER_REGISTRY[body.id]) {
      return c.json({ error: 'Cannot override built-in provider' }, 409);
    }
    var validTypes = ['anthropic', 'openai-compatible', 'google', 'ollama'];
    if (!validTypes.includes(body.apiType)) {
      return c.json({ error: 'apiType must be one of: ' + validTypes.join(', ') }, 400);
    }

    var settings = await db.getSettings();
    var config = (settings as any)?.modelPricingConfig || { models: [], currency: 'USD' };
    config.customProviders = config.customProviders || [];

    if (config.customProviders.find(function(p: any) { return p.id === body.id; })) {
      return c.json({ error: 'Custom provider with this ID already exists' }, 409);
    }

    config.customProviders.push({
      id: body.id,
      name: body.name,
      baseUrl: body.baseUrl,
      apiType: body.apiType,
      apiKeyEnvVar: body.apiKeyEnvVar || '',
      headers: body.headers || {},
      models: body.models || [],
    });

    await updateSettingsAndEmit({ modelPricingConfig: config } as any);
    return c.json({ ok: true, provider: body });
  });

  // ─── Provider API Key Management ────────────────────────
  api.post('/providers/:id/api-key', requireRole('admin'), async (c) => {
    var id = c.req.param('id');
    var provider = PROVIDER_REGISTRY[id];
    if (!provider) {
      return c.json({ error: 'Unknown provider' }, 404);
    }
    var body = await c.req.json();
    var apiKey = body.apiKey?.trim();
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 5) {
      return c.json({ error: 'Valid API key required' }, 400);
    }
    var skipValidation = body.skipValidation === true;

    // Validate the API key against the provider before saving
    if (!skipValidation) {
      try {
        var valid = await validateProviderApiKey(id, apiKey, provider);
        if (!valid.ok) {
          return c.json({ error: 'API key validation failed: ' + valid.error, validationFailed: true }, 400);
        }
      } catch (e: any) {
        return c.json({ error: 'API key validation failed: ' + (e.message || 'Unknown error'), validationFailed: true }, 400);
      }
    }

    // Store API key encrypted via vault
    var settings = await db.getSettings();
    var config = (settings as any)?.modelPricingConfig || { models: [], currency: 'USD' };
    config.providerApiKeys = config.providerApiKeys || {};
    config.providerApiKeys[id] = vault.encrypt(apiKey);
    await updateSettingsAndEmit({ modelPricingConfig: config } as any);

    return c.json({ ok: true, message: 'API key saved for ' + provider.name, validated: !skipValidation });
  });

  api.put('/providers/:id', requireRole('admin'), async (c) => {
    var id = c.req.param('id');
    if (PROVIDER_REGISTRY[id]) {
      return c.json({ error: 'Cannot modify built-in provider' }, 400);
    }

    var body = await c.req.json();
    var settings = await db.getSettings();
    var config = (settings as any)?.modelPricingConfig || { models: [], currency: 'USD' };
    config.customProviders = config.customProviders || [];

    var idx = config.customProviders.findIndex(function(p: any) { return p.id === id; });
    if (idx === -1) {
      return c.json({ error: 'Custom provider not found' }, 404);
    }

    config.customProviders[idx] = Object.assign({}, config.customProviders[idx], body, { id: id });
    await updateSettingsAndEmit({ modelPricingConfig: config } as any);
    return c.json({ ok: true, provider: config.customProviders[idx] });
  });

  api.delete('/providers/:id', requireRole('admin'), async (c) => {
    var id = c.req.param('id');
    if (PROVIDER_REGISTRY[id]) {
      return c.json({ error: 'Cannot delete built-in provider' }, 400);
    }

    var settings = await db.getSettings();
    var config = (settings as any)?.modelPricingConfig || { models: [], currency: 'USD' };
    config.customProviders = config.customProviders || [];

    var before = config.customProviders.length;
    config.customProviders = config.customProviders.filter(function(p: any) { return p.id !== id; });

    if (config.customProviders.length === before) {
      return c.json({ error: 'Custom provider not found' }, 404);
    }

    await updateSettingsAndEmit({ modelPricingConfig: config } as any);
    return c.json({ ok: true });
  });

  api.get('/providers/:id/models', requireRole('admin'), async (c) => {
    var id = c.req.param('id');
    var provider = PROVIDER_REGISTRY[id];

    // Ollama auto-discovery
    if (id === 'ollama' || (provider && provider.apiType === 'ollama')) {
      var ollamaHost = process.env.OLLAMA_HOST || (provider ? provider.baseUrl : 'http://localhost:11434');
      try {
        var resp = await fetch(ollamaHost + '/api/tags', { signal: AbortSignal.timeout(3000) });
        var data = await resp.json() as any;
        return c.json({ models: (data.models || []).map(function(m: any) { return { id: m.name, name: m.name, size: m.size }; }) });
      } catch (err: any) {
        return c.json({ models: [], error: 'Cannot connect to Ollama: ' + err.message });
      }
    }

    // OpenAI-compatible local auto-discovery (vLLM, LM Studio, LiteLLM)
    if (provider && provider.isLocal && provider.apiType === 'openai-compatible') {
      try {
        var resp = await fetch(provider.baseUrl + '/models', { signal: AbortSignal.timeout(3000) });
        var data = await resp.json() as any;
        return c.json({ models: (data.data || []).map(function(m: any) { return { id: m.id, name: m.id }; }) });
      } catch (err: any) {
        return c.json({ models: [], error: 'Cannot connect to ' + provider.name + ': ' + err.message });
      }
    }

    // Cloud providers — return default models from registry
    if (provider && provider.defaultModels) {
      return c.json({ models: provider.defaultModels.map(function(mid: string) { return { id: mid, name: mid }; }) });
    }

    // Custom providers — check DB
    var settings = await db.getSettings();
    var pricingConfig = (settings as any)?.modelPricingConfig;
    var customProviders = pricingConfig?.customProviders || [];
    var customProvider = customProviders.find(function(p: any) { return p.id === id; });
    if (customProvider && customProvider.models) {
      return c.json({ models: customProvider.models });
    }

    return c.json({ models: [] });
  });

  // ─── Retention ──────────────────────────────────────

  api.get('/retention', requireRole('admin'), async (c) => {
    const policy = await db.getRetentionPolicy();
    return c.json(policy);
  });

  api.put('/retention', requireRole('owner'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'enabled', type: 'boolean', required: true },
      { field: 'retainDays', type: 'number', required: true, min: 1, max: 3650 },
      { field: 'archiveFirst', type: 'boolean' },
    ]);

    await db.setRetentionPolicy({
      enabled: body.enabled,
      retainDays: body.retainDays,
      excludeTags: body.excludeTags || [],
      archiveFirst: body.archiveFirst ?? true,
    });
    return c.json({ ok: true });
  });

  // ─── Security ────────────────────────────────────────

  api.get('/settings/security', requireRole('admin'), async (c) => {
    try {
      const settings = await db.getSettings();
      const securityConfig = (settings as any)?.securityConfig || {};
      return c.json({ securityConfig });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  api.put('/settings/security', requireRole('admin'), async (c) => {
    try {
      const body = await c.req.json();
      const { securityConfig } = body;

      if (!securityConfig || typeof securityConfig !== 'object') {
        return c.json({ error: 'securityConfig is required and must be an object' }, 400);
      }

      await updateSettingsAndEmit({ securityConfig } as any);

      // Sync transport encryption config to middleware
      if (securityConfig.transportEncryption) {
        try {
          const { setTransportEncryptionConfig } = await import('../middleware/transport-encryption.js');
          setTransportEncryptionConfig(securityConfig.transportEncryption);
        } catch {}
      }

      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  api.get('/settings/security/events', requireRole('admin'), async (c) => {
    try {
      const query = c.req.query();
      const filter = {
        eventType: query.eventType ? query.eventType.split(',') : undefined,
        severity: query.severity ? query.severity.split(',') : undefined,
        agentId: query.agentId,
        sourceIp: query.sourceIp,
        fromDate: query.fromDate,
        toDate: query.toDate,
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0
      };

      const events = await (db as any).getSecurityEvents(filter);
      return c.json({ events });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  api.get('/settings/security/port-scan', requireRole('admin'), async (c) => {
    try {
      const { scanPorts } = await import('../security/port-scanner.js');
      const result = await scanPorts();
      return c.json({ scanResult: result });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  api.get('/agents/:id/security', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('id');
      const agent = await db.getAgent(agentId);
      
      if (!agent) {
        return c.json({ error: 'Agent not found' }, 404);
      }

      const securityOverrides = (agent as any)?.securityOverrides || {};
      return c.json({ securityOverrides });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  api.put('/agents/:id/security', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('id');
      const body = await c.req.json();
      const { securityOverrides } = body;

      const agent = await db.getAgent(agentId);
      if (!agent) {
        return c.json({ error: 'Agent not found' }, 404);
      }

      await db.updateAgent(agentId, { securityOverrides } as any);
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── CORS Helper ────────────────────────────────────
  /** Add an origin to CORS list, optionally removing an old one */
  async function updateCorsOrigin(newOrigin: string, oldOrigin?: string) {
    try {
      var settings = await db.getSettings();
      var fw = settings.firewallConfig || {};
      var net = fw.network || {};
      var origins: string[] = Array.isArray(net.corsOrigins) ? [...net.corsOrigins] : [];
      // Remove old if present
      if (oldOrigin) origins = origins.filter((o: string) => o !== oldOrigin);
      // Add new if not already present
      if (!origins.includes(newOrigin)) origins.push(newOrigin);
      await updateSettingsAndEmit({ firewallConfig: { ...fw, network: { ...net, corsOrigins: origins } } } as any);
      try { const { invalidateNetworkConfig } = await import('../middleware/network-config.js'); await invalidateNetworkConfig(); } catch {}
    } catch { /* non-critical */ }
  }

  // ─── Get CORS Origins ─────────────────────────────────
  api.get('/domain/cors', requireRole('admin'), async (c) => {
    try {
      var settings = await db.getSettings();
      var origins = settings?.firewallConfig?.network?.corsOrigins || [];
      return c.json({ origins });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Update CORS Origins ──────────────────────────────
  api.post('/domain/cors', requireRole('admin'), async (c) => {
    var body = await c.req.json();
    if (!Array.isArray(body.origins)) {
      return c.json({ error: 'origins must be an array of URLs' }, 400);
    }
    // Validate each origin
    for (var o of body.origins) {
      if (typeof o !== 'string') return c.json({ error: 'Each origin must be a string' }, 400);
      if (o !== '*' && !o.startsWith('http://') && !o.startsWith('https://')) {
        return c.json({ error: 'Origin "' + o + '" must start with http:// or https://' }, 400);
      }
    }
    try {
      var settings = await db.getSettings();
      var fw = settings.firewallConfig || {};
      var net = fw.network || {};
      await updateSettingsAndEmit({ firewallConfig: { ...fw, network: { ...net, corsOrigins: body.origins } } } as any);
      try { const { invalidateNetworkConfig } = await import('../middleware/network-config.js'); await invalidateNetworkConfig(); } catch {}
      return c.json({ success: true, origins: body.origins });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Domain Registration ────────────────────────────

  api.post('/domain/register', requireRole('admin'), async (c) => {
    var body = await c.req.json();
    if (!body.domain) {
      return c.json({ error: 'domain is required' }, 400);
    }

    var domain = String(body.domain).toLowerCase().trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    try {
      var { DomainLock } = await import('../domain-lock/index.js');
      var lock = new DomainLock();

      // Generate deployment key
      var keyPair = await lock.generateDeploymentKey();

      // Get company info for registration
      var settings = await db.getSettings();

      // Register with central registry
      var result = await lock.register(domain, keyPair.hash, {
        orgName: settings?.name,
        contactEmail: body.contactEmail,
      });

      if (!result.success) {
        return c.json({ error: result.error, statusCode: result.statusCode }, 400);
      }

      // Store in settings
      await updateSettingsAndEmit({
        domain: domain,
        deploymentKeyHash: keyPair.hash,
        domainRegistrationId: result.registrationId,
        domainDnsChallenge: result.dnsChallenge,
        domainRegisteredAt: new Date().toISOString(),
        domainStatus: 'pending_dns',
      } as any);

      return c.json({
        deploymentKey: keyPair.plaintext,
        dnsChallenge: result.dnsChallenge,
        registrationId: result.registrationId,
      });
    } catch (err: any) {
      return c.json({ error: err.message || 'Domain registration failed' }, 500);
    }
  });

  api.post('/domain/verify', requireRole('admin'), async (c) => {
    var body = await c.req.json();
    if (!body.domain) {
      return c.json({ error: 'domain is required' }, 400);
    }

    var domain = String(body.domain).toLowerCase().trim();

    try {
      var { DomainLock } = await import('../domain-lock/index.js');
      var lock = new DomainLock();

      var result = await lock.checkVerification(domain);

      if (result.verified) {
        await updateSettingsAndEmit({
          domainStatus: 'verified',
          domainVerifiedAt: new Date().toISOString(),
        } as any);
        return c.json({ verified: true });
      }

      return c.json({ verified: false, error: result.error });
    } catch (err: any) {
      return c.json({ error: err.message || 'Verification check failed' }, 500);
    }
  });

  // ─── Domain Status (GET) ──────────────────────────────
  api.get('/domain/status', requireRole('admin'), async (c) => {
    try {
      var settings = await db.getSettings();
      return c.json({
        domain: settings.domain || null,
        subdomain: settings.subdomain || null,
        status: settings.domainStatus || 'unregistered',
        registeredAt: settings.domainRegisteredAt || null,
        verifiedAt: settings.domainVerifiedAt || null,
        dnsChallenge: settings.domainDnsChallenge || null,
        useRootDomain: settings.useRootDomain || false,
        plan: settings.plan || 'self-hosted',
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Domain Change ────────────────────────────────────
  api.post('/domain/change', requireRole('admin'), async (c) => {
    var body = await c.req.json();
    if (!body.domain) {
      return c.json({ error: 'domain is required' }, 400);
    }

    var domain = String(body.domain).toLowerCase().trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    try {
      var { DomainLock } = await import('../domain-lock/index.js');
      var lock = new DomainLock();
      var keyPair = await lock.generateDeploymentKey();
      var settings = await db.getSettings();

      var result = await lock.register(domain, keyPair.hash, {
        orgName: settings?.name,
        contactEmail: body.contactEmail,
      });

      if (!result.success) {
        return c.json({ error: result.error, statusCode: result.statusCode }, 400);
      }

      var oldDomain = settings.domain;
      await updateSettingsAndEmit({
        domain: domain,
        useRootDomain: body.useRootDomain || false,
        deploymentKeyHash: keyPair.hash,
        domainRegistrationId: result.registrationId,
        domainDnsChallenge: result.dnsChallenge,
        domainRegisteredAt: new Date().toISOString(),
        domainStatus: 'pending_dns',
        domainVerifiedAt: undefined,
      } as any);

      // Auto-update CORS
      await updateCorsOrigin('https://' + domain, oldDomain ? 'https://' + oldDomain : undefined);

      return c.json({
        success: true,
        deploymentKey: keyPair.plaintext,
        dnsChallenge: result.dnsChallenge,
        registrationId: result.registrationId,
      });
    } catch (err: any) {
      return c.json({ error: err.message || 'Domain change failed' }, 500);
    }
  });

  // ─── Subdomain Update ─────────────────────────────────
  api.post('/domain/subdomain', requireRole('admin'), async (c) => {
    var body = await c.req.json();
    if (!body.subdomain) {
      return c.json({ error: 'subdomain is required' }, 400);
    }
    var sub = String(body.subdomain).toLowerCase().trim().replace(/\.agenticmail\.io$/, '');
    if (sub.length < 2) {
      return c.json({ error: 'Subdomain must be at least 2 characters.' }, 400);
    }
    if (sub.length > 63) {
      return c.json({ error: 'Subdomain must be 63 characters or fewer.' }, 400);
    }
    if (/^-|-$/.test(sub)) {
      return c.json({ error: 'Subdomain cannot start or end with a hyphen.' }, 400);
    }
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) {
      return c.json({ error: 'Subdomain can only contain lowercase letters, numbers, and hyphens.' }, 400);
    }
    // Reserved subdomains
    var reserved = ['www', 'mail', 'api', 'app', 'admin', 'dashboard', 'help', 'support', 'docs', 'status', 'blog', 'cdn', 'static', 'assets', 'ns1', 'ns2'];
    if (reserved.includes(sub)) {
      return c.json({ error: '"' + sub + '" is a reserved subdomain. Please choose a different one.' }, 400);
    }
    try {
      var settings = await db.getSettings();
      var oldSub = settings.subdomain || null;
      await updateSettingsAndEmit({ subdomain: sub } as any);
      // Auto-update CORS
      await updateCorsOrigin(
        'https://' + sub + '.agenticmail.io',
        oldSub ? 'https://' + oldSub + '.agenticmail.io' : undefined,
      );
      return c.json({ success: true, subdomain: sub, oldSubdomain: oldSub, plan: settings.plan || 'self-hosted' });
    } catch (err: any) {
      return c.json({ error: err.message || 'Subdomain update failed' }, 500);
    }
  });

  // ─── Remove Custom Domain ─────────────────────────────
  api.delete('/domain', requireRole('admin'), async (c) => {
    try {
      var settings = await db.getSettings();
      var oldDomain = settings.domain;
      await updateSettingsAndEmit({
        domain: undefined,
        domainStatus: undefined,
        domainDnsChallenge: undefined,
        domainRegisteredAt: undefined,
        domainVerifiedAt: undefined,
        domainRegistrationId: undefined,
        deploymentKeyHash: undefined,
      } as any);
      // Remove old domain from CORS
      if (oldDomain) {
        try {
          var fw = settings.firewallConfig || {};
          var net = fw.network || {};
          var origins: string[] = Array.isArray(net.corsOrigins) ? net.corsOrigins.filter((o: string) => o !== 'https://' + oldDomain) : [];
          await updateSettingsAndEmit({ firewallConfig: { ...fw, network: { ...net, corsOrigins: origins } } } as any);
          try { const { invalidateNetworkConfig } = await import('../middleware/network-config.js'); await invalidateNetworkConfig(); } catch {}
        } catch {}
      }
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message || 'Failed to remove domain' }, 500);
    }
  });

  function getDefaultModelPricing() {
    return [
      // Anthropic (Feb 2026 — 1M context window)
      { provider: 'anthropic', modelId: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', inputCostPerMillion: 5, outputCostPerMillion: 25, contextWindow: 1000000 },
      { provider: 'anthropic', modelId: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', inputCostPerMillion: 3, outputCostPerMillion: 15, contextWindow: 1000000 },
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', inputCostPerMillion: 3, outputCostPerMillion: 15, contextWindow: 1000000 },
      { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', inputCostPerMillion: 0.8, outputCostPerMillion: 4, contextWindow: 200000 },
      // OpenAI
      { provider: 'openai', modelId: 'gpt-4o', displayName: 'GPT-4o', inputCostPerMillion: 2.5, outputCostPerMillion: 10, contextWindow: 128000 },
      { provider: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', inputCostPerMillion: 0.15, outputCostPerMillion: 0.6, contextWindow: 128000 },
      { provider: 'openai', modelId: 'gpt-4.1', displayName: 'GPT-4.1', inputCostPerMillion: 2, outputCostPerMillion: 8, contextWindow: 1000000 },
      { provider: 'openai', modelId: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', inputCostPerMillion: 0.4, outputCostPerMillion: 1.6, contextWindow: 1000000 },
      { provider: 'openai', modelId: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', inputCostPerMillion: 0.1, outputCostPerMillion: 0.4, contextWindow: 1000000 },
      { provider: 'openai', modelId: 'o3', displayName: 'o3', inputCostPerMillion: 10, outputCostPerMillion: 40, contextWindow: 200000 },
      { provider: 'openai', modelId: 'o4-mini', displayName: 'o4-mini', inputCostPerMillion: 1.1, outputCostPerMillion: 4.4, contextWindow: 200000 },
      // Google Gemini (up to 2M context)
      { provider: 'google', modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputCostPerMillion: 2.5, outputCostPerMillion: 15, contextWindow: 1000000 },
      { provider: 'google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', inputCostPerMillion: 0.15, outputCostPerMillion: 0.6, contextWindow: 1000000 },
      { provider: 'google', modelId: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', inputCostPerMillion: 0.1, outputCostPerMillion: 0.4, contextWindow: 1000000 },
      { provider: 'google', modelId: 'gemini-3-pro', displayName: 'Gemini 3 Pro', inputCostPerMillion: 2.5, outputCostPerMillion: 15, contextWindow: 1000000 },
      // DeepSeek (128K context)
      { provider: 'deepseek', modelId: 'deepseek-chat', displayName: 'DeepSeek Chat (V3)', inputCostPerMillion: 0.14, outputCostPerMillion: 0.28, contextWindow: 128000 },
      { provider: 'deepseek', modelId: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner (R1)', inputCostPerMillion: 0.55, outputCostPerMillion: 2.19, contextWindow: 128000 },
      // xAI Grok (2M context window)
      { provider: 'xai', modelId: 'grok-4', displayName: 'Grok 4', inputCostPerMillion: 3, outputCostPerMillion: 15, contextWindow: 2000000 },
      { provider: 'xai', modelId: 'grok-4-fast', displayName: 'Grok 4 Fast', inputCostPerMillion: 0.2, outputCostPerMillion: 0.5, contextWindow: 2000000 },
      { provider: 'xai', modelId: 'grok-3', displayName: 'Grok 3', inputCostPerMillion: 3, outputCostPerMillion: 15, contextWindow: 131072 },
      { provider: 'xai', modelId: 'grok-3-mini', displayName: 'Grok 3 Mini', inputCostPerMillion: 0.3, outputCostPerMillion: 0.5, contextWindow: 131072 },
      // Mistral
      { provider: 'mistral', modelId: 'mistral-large-latest', displayName: 'Mistral Large', inputCostPerMillion: 2, outputCostPerMillion: 6, contextWindow: 128000 },
      { provider: 'mistral', modelId: 'mistral-small-latest', displayName: 'Mistral Small', inputCostPerMillion: 0.1, outputCostPerMillion: 0.3, contextWindow: 128000 },
      // Groq (inference provider)
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B (Groq)', inputCostPerMillion: 0.59, outputCostPerMillion: 0.79, contextWindow: 128000 },
      // Together (inference provider)
      { provider: 'together', modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B (Together)', inputCostPerMillion: 0.88, outputCostPerMillion: 0.88, contextWindow: 128000 },
    ];
  }

  // ─── Cloudflare Tunnel Deployment ───────────────────

  /** Check if cloudflared is installed and tunnel status */
  api.get('/tunnel/status', requireRole('admin'), async (c) => {
    try {
      const { execSync } = await import('child_process');
      let installed = false;
      let version = '';
      let running = false;
      let config: any = null;

      try {
        version = execSync('cloudflared --version 2>&1', { encoding: 'utf8', timeout: 5000 }).trim();
        installed = true;
      } catch { /* not installed */ }

      // Check if running via pm2
      try {
        const pm2List = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
        const procs = JSON.parse(pm2List);
        const cf = procs.find((p: any) => p.name === 'cloudflared');
        running = cf?.pm2_env?.status === 'online';
      } catch { /* pm2 not available */ }

      // Read config
      const os = await import('os');
      const fs = await import('fs');
      const path = await import('path');
      const cfDir = path.join(os.default.homedir(), '.cloudflared');
      const cfgPath = path.join(cfDir, 'config.yml');
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, 'utf8');
        // Parse simple YAML
        const tunnelMatch = raw.match(/^tunnel:\s*(.+)$/m);
        const hostnameMatch = raw.match(/hostname:\s*(.+)$/m);
        const serviceMatch = raw.match(/service:\s*(http.+)$/m);
        config = {
          tunnelId: tunnelMatch?.[1]?.trim(),
          hostname: hostnameMatch?.[1]?.trim(),
          service: serviceMatch?.[1]?.trim(),
          raw,
        };
      }

      return c.json({ installed, version, running, config });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  /** Install cloudflared */
  api.post('/tunnel/install', requireRole('admin'), async (c) => {
    try {
      const { execSync } = await import('child_process');
      const os = await import('os');
      const platform = os.default.platform();

      if (platform === 'darwin') {
        // macOS — try brew first
        try {
          execSync(process.platform === 'win32' ? 'where brew' : 'which brew', { timeout: 3000 });
          execSync('brew install cloudflared 2>&1', { encoding: 'utf8', timeout: 120000 });
        } catch {
          // Direct download
          const arch = os.default.arch() === 'arm64' ? 'arm64' : 'amd64';
          execSync(`curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arch} && chmod +x /usr/local/bin/cloudflared`, { timeout: 60000 });
        }
      } else if (platform === 'linux') {
        const arch = os.default.arch() === 'arm64' ? 'arm64' : 'amd64';
        execSync(`curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch} && chmod +x /usr/local/bin/cloudflared`, { timeout: 60000 });
      } else {
        return c.json({ error: 'Unsupported platform: ' + platform }, 400);
      }

      const version = execSync('cloudflared --version 2>&1', { encoding: 'utf8', timeout: 5000 }).trim();
      return c.json({ success: true, version });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  /** Authenticate with Cloudflare (opens browser for login) */
  api.post('/tunnel/login', requireRole('admin'), async (c) => {
    try {
      const { exec: execCb } = await import('child_process');
      const { promisify } = await import('util');
      const execP = promisify(execCb);
      // This opens the browser for CF login — cert.pem is saved to ~/.cloudflared/
      await execP('cloudflared tunnel login', { timeout: 120000 });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: 'Login failed or timed out. Make sure to complete the browser authorization. ' + e.message }, 500);
    }
  });

  /** Create tunnel, configure DNS, and start */
  api.post('/tunnel/deploy', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    const { domain, tunnelName, port } = body;
    if (!domain) return c.json({ error: 'domain is required' }, 400);

    const localPort = port || 3200;
    const name = tunnelName || 'agenticmail-enterprise';

    try {
      const { execSync } = await import('child_process');
      const os = await import('os');
      const fs = await import('fs');
      const path = await import('path');
      const cfDir = path.join(os.default.homedir(), '.cloudflared');
      const steps: string[] = [];

      // Check cert exists (user must have logged in)
      if (!fs.existsSync(path.join(cfDir, 'cert.pem'))) {
        return c.json({ error: 'Not authenticated with Cloudflare. Click "Login to Cloudflare" first.' }, 400);
      }

      // 1. Create tunnel
      let tunnelId = '';
      try {
        const out = execSync(`cloudflared tunnel create ${name} 2>&1`, { encoding: 'utf8', timeout: 30000 });
        const match = out.match(/Created tunnel .+ with id ([a-f0-9-]+)/);
        tunnelId = match?.[1] || '';
        steps.push('Created tunnel: ' + name + ' (' + tunnelId + ')');
      } catch (e: any) {
        // Tunnel might already exist
        if (e.message?.includes('already exists')) {
          const listOut = execSync('cloudflared tunnel list --output json 2>&1', { encoding: 'utf8', timeout: 15000 });
          const tunnels = JSON.parse(listOut);
          const existing = tunnels.find((t: any) => t.name === name);
          if (existing) {
            tunnelId = existing.id;
            steps.push('Using existing tunnel: ' + name + ' (' + tunnelId + ')');
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }

      if (!tunnelId) return c.json({ error: 'Failed to get tunnel ID' }, 500);

      // 2. Write config
      const config = [
        `tunnel: ${tunnelId}`,
        `credentials-file: ${path.join(cfDir, tunnelId + '.json')}`,
        '',
        'ingress:',
        `  - hostname: ${domain}`,
        `    service: http://localhost:${localPort}`,
        '  - service: http_status:404',
      ].join('\n');

      fs.writeFileSync(path.join(cfDir, 'config.yml'), config);
      steps.push('Wrote config: ' + domain + ' → localhost:' + localPort);

      // 3. Route DNS
      try {
        execSync(`cloudflared tunnel route dns ${tunnelId} ${domain} 2>&1`, { encoding: 'utf8', timeout: 30000 });
        steps.push('DNS CNAME created: ' + domain + ' → ' + tunnelId + '.cfargotunnel.com');
      } catch (e: any) {
        if (e.message?.includes('already exists')) {
          steps.push('DNS CNAME already exists for ' + domain);
        } else {
          steps.push('DNS routing failed (you may need to add CNAME manually): ' + e.message);
        }
      }

      // 4. Start with PM2
      try {
        execSync(process.platform === 'win32' ? 'where pm2' : 'which pm2', { timeout: 3000 });
        // Stop existing if any
        try { execSync('pm2 delete cloudflared 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
        execSync(`pm2 start cloudflared --name cloudflared -- tunnel run`, { encoding: 'utf8', timeout: 15000 });
        execSync('pm2 save 2>/dev/null', { timeout: 5000 });
        steps.push('Started cloudflared via PM2 (auto-restarts on crash)');
      } catch {
        // No PM2 — try running directly in background
        try {
          const { spawn } = await import('child_process');
          const child = spawn('cloudflared', ['tunnel', 'run'], { detached: true, stdio: 'ignore' });
          child.unref();
          steps.push('Started cloudflared in background (install PM2 for auto-restart)');
        } catch (e2: any) {
          steps.push('Could not start tunnel automatically: ' + e2.message);
        }
      }

      // 5. Update CORS to allow the new domain
      try {
        if (db) {
          const corsRows = await (db as any).query(`SELECT value FROM admin_settings WHERE key = 'cors_origins'`);
          let origins: string[] = [];
          if (corsRows?.[0]) {
            try { origins = JSON.parse((corsRows[0] as any).value); } catch { origins = []; }
          }
          const newOrigin = 'https://' + domain;
          if (!origins.includes(newOrigin)) {
            origins.push(newOrigin);
            await (db as any).execute(
              `INSERT INTO admin_settings (key, value) VALUES ('cors_origins', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
              [JSON.stringify(origins)]
            );
            steps.push('Added ' + newOrigin + ' to CORS allowed origins');
          }
        }
      } catch { /* non-critical */ }

      return c.json({ success: true, tunnelId, domain, steps });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Client Organizations ─────────────────────────────

  api.get('/organizations', async (c) => {
    try {
      // Org-bound users can only see their own organization
      const clientOrgId = c.get('clientOrgId' as any);
      if (clientOrgId) {
        const isPostgres = (db as any).pool;
        if (isPostgres) {
          const { rows } = await (db as any)._query(
            `SELECT o.*, COUNT(a.id) as agent_count FROM client_organizations o LEFT JOIN agents a ON a.client_org_id = o.id WHERE o.id = $1 GROUP BY o.id`, [clientOrgId]);
          return c.json({ organizations: rows });
        }
        return c.json({ organizations: [] });
      }

      // Full access for admins/owners
      const userRole = c.get('userRole' as any);
      if (userRole !== 'admin' && userRole !== 'owner') {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }

      const isPostgres = (db as any).pool;
      if (isPostgres) {
        const { rows } = await (db as any)._query(`
          SELECT o.*, COUNT(a.id) as agent_count
          FROM client_organizations o
          LEFT JOIN agents a ON a.client_org_id = o.id
          GROUP BY o.id
          ORDER BY o.created_at DESC
        `);
        return c.json({ organizations: rows });
      } else {
        const engineDb = db.getEngineDB();
        const rows = await engineDb!.all(`
          SELECT o.*, COUNT(a.id) as agent_count
          FROM client_organizations o
          LEFT JOIN agents a ON a.client_org_id = o.id
          GROUP BY o.id
          ORDER BY o.created_at DESC
        `);
        return c.json({ organizations: rows });
      }
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.post('/organizations', requireRole('admin'), async (c) => {
    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 128 },
      { field: 'slug', type: 'string', required: true, minLength: 1, maxLength: 64, pattern: /^[a-z0-9-]+$/ },
      { field: 'contact_name', type: 'string', maxLength: 128 },
      { field: 'contact_email', type: 'email' },
      { field: 'description', type: 'string', maxLength: 512 },
    ]);
    const id = (await import('crypto')).randomUUID();
    try {
      const isPostgres = (db as any).pool;
      if (isPostgres) {
        await (db as any)._query(
          `INSERT INTO client_organizations (id, name, slug, contact_name, contact_email, description, billing_rate_per_agent, currency) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, body.name, body.slug, body.contact_name || null, body.contact_email || null, body.description || null, body.billing_rate_per_agent || 0, body.currency || 'USD']
        );
        const { rows } = await (db as any)._query(`SELECT * FROM client_organizations WHERE id = $1`, [id]);
        return c.json(rows[0], 201);
      } else {
        const engineDb = db.getEngineDB();
        await engineDb!.run(
          `INSERT INTO client_organizations (id, name, slug, contact_name, contact_email, description, billing_rate_per_agent, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, body.name, body.slug, body.contact_name || null, body.contact_email || null, body.description || null, body.billing_rate_per_agent || 0, body.currency || 'USD']
        );
        const row = await engineDb!.get(`SELECT * FROM client_organizations WHERE id = ?`, [id]);
        return c.json(row, 201);
      }
    } catch (e: any) {
      if (e.message?.includes('UNIQUE') || e.code === '23505') return c.json({ error: 'Slug already exists' }, 409);
      return c.json({ error: e.message }, 500);
    }
  });

  api.get('/organizations/:id', async (c) => {
    const id = c.req.param('id');
    const userRole = c.get('userRole' as any);
    const userClientOrgId = c.get('clientOrgId' as any);
    // Non-admins can only access their own client org
    if (userRole !== 'owner' && userRole !== 'admin') {
      if (!userClientOrgId || userClientOrgId !== id) return c.json({ error: 'Forbidden' }, 403);
    }
    try {
      const isPostgres = (db as any).pool;
      if (isPostgres) {
        const { rows: orgs } = await (db as any)._query(`SELECT * FROM client_organizations WHERE id = $1`, [id]);
        if (!orgs[0]) return c.json({ error: 'Organization not found' }, 404);
        const { rows: agents } = await (db as any)._query(`SELECT id, name, email, role, status FROM agents WHERE client_org_id = $1`, [id]);
        return c.json({ ...orgs[0], agents });
      } else {
        const engineDb = db.getEngineDB();
        const org = await engineDb!.get(`SELECT * FROM client_organizations WHERE id = ?`, [id]);
        if (!org) return c.json({ error: 'Organization not found' }, 404);
        const agents = await engineDb!.all(`SELECT id, name, email, role, status FROM agents WHERE client_org_id = ?`, [id]);
        return c.json({ ...(org as any), agents });
      }
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.patch('/organizations/:id', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    validate(body, [
      { field: 'name', type: 'string', minLength: 1, maxLength: 128 },
      { field: 'contact_name', type: 'string', maxLength: 128 },
      { field: 'contact_email', type: 'email' },
      { field: 'description', type: 'string', maxLength: 512 },
    ]);
    try {
      const fields: string[] = [];
      const values: any[] = [];
      const isPostgres = (db as any).pool;
      let idx = 1;
      for (const key of ['name', 'contact_name', 'contact_email', 'description', 'billing_rate_per_agent', 'currency']) {
        if (body[key] !== undefined) {
          fields.push(isPostgres ? `${key} = $${idx++}` : `${key} = ?`);
          values.push(body[key]);
        }
      }
      // JSON fields
      if (body.allowed_roles !== undefined) {
        fields.push(isPostgres ? `allowed_roles = $${idx++}` : `allowed_roles = ?`);
        values.push(JSON.stringify(body.allowed_roles));
      }
      if (body.allowed_skills !== undefined) {
        fields.push(isPostgres ? `allowed_skills = $${idx++}` : `allowed_skills = ?`);
        values.push(JSON.stringify(body.allowed_skills));
      }
      if (body.allowed_pages !== undefined) {
        fields.push(isPostgres ? `allowed_pages = $${idx++}` : `allowed_pages = ?`);
        values.push(JSON.stringify(body.allowed_pages));
      }
      if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
      fields.push(isPostgres ? `updated_at = NOW()` : `updated_at = CURRENT_TIMESTAMP`);
      values.push(id);
      const where = isPostgres ? `$${idx}` : '?';
      const sql = `UPDATE client_organizations SET ${fields.join(', ')} WHERE id = ${where}`;
      if (isPostgres) {
        await (db as any)._query(sql, values);
        const { rows } = await (db as any)._query(`SELECT * FROM client_organizations WHERE id = $1`, [id]);
        return c.json(rows[0]);
      } else {
        const engineDb = db.getEngineDB();
        await engineDb!.run(sql, values);
        const row = await engineDb!.get(`SELECT * FROM client_organizations WHERE id = ?`, [id]);
        return c.json(row);
      }
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.post('/organizations/:id/toggle', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    try {
      const isPostgres = (db as any).pool;
      if (isPostgres) {
        const { rows } = await (db as any)._query(`SELECT is_active FROM client_organizations WHERE id = $1`, [id]);
        if (!rows[0]) return c.json({ error: 'Organization not found' }, 404);
        const newActive = !rows[0].is_active;
        await (db as any)._query(`UPDATE client_organizations SET is_active = $1, updated_at = NOW() WHERE id = $2`, [newActive, id]);
        const newStatus = newActive ? 'active' : 'suspended';
        await (db as any)._query(`UPDATE agents SET status = $1 WHERE client_org_id = $2`, [newStatus, id]);
        return c.json({ is_active: newActive });
      } else {
        const engineDb = db.getEngineDB();
        const org = await engineDb!.get<any>(`SELECT is_active FROM client_organizations WHERE id = ?`, [id]);
        if (!org) return c.json({ error: 'Organization not found' }, 404);
        const newActive = !(org.is_active);
        await engineDb!.run(`UPDATE client_organizations SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newActive ? 1 : 0, id]);
        const newStatus = newActive ? 'active' : 'suspended';
        await engineDb!.run(`UPDATE agents SET status = ? WHERE client_org_id = ?`, [newStatus, id]);
        return c.json({ is_active: newActive });
      }
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.delete('/organizations/:id', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    try {
      const isPostgres = (db as any).pool;
      if (isPostgres) {
        const { rows: agents } = await (db as any)._query(`SELECT id FROM agents WHERE client_org_id = $1`, [id]);
        if (agents.length > 0) return c.json({ error: 'Cannot delete organization with linked agents. Unassign all agents first.' }, 400);
        await (db as any)._query(`DELETE FROM client_organizations WHERE id = $1`, [id]);
      } else {
        const engineDb = db.getEngineDB();
        const agents = await engineDb!.all(`SELECT id FROM agents WHERE client_org_id = ?`, [id]);
        if (agents.length > 0) return c.json({ error: 'Cannot delete organization with linked agents. Unassign all agents first.' }, 400);
        await engineDb!.run(`DELETE FROM client_organizations WHERE id = ?`, [id]);
      }
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Agent-Org Linking ──────────────────────────────────

  api.post('/agents/:id/assign-org', requireRole('admin'), async (c) => {
    const agentId = c.req.param('id');
    const { orgId, clearCredentials } = await c.req.json();
    if (!orgId) return c.json({ error: 'orgId is required' }, 400);
    try {
      const isPostgres = (db as any).pool;

      // Get current org to detect reassignment
      let previousOrgId: string | null = null;
      if (isPostgres) {
        const { rows } = await (db as any)._query(`SELECT client_org_id FROM agents WHERE id = $1`, [agentId]);
        previousOrgId = rows[0]?.client_org_id || null;
      } else {
        const row = await db.getEngineDB()!.get(`SELECT client_org_id FROM agents WHERE id = ?`, [agentId]);
        previousOrgId = (row as any)?.client_org_id || null;
      }

      const isReassignment = previousOrgId && previousOrgId !== orgId;

      // Update admin agents table
      if (isPostgres) {
        await (db as any)._query(`UPDATE agents SET client_org_id = $1 WHERE id = $2`, [orgId, agentId]);
      } else {
        await db.getEngineDB()!.run(`UPDATE agents SET client_org_id = ? WHERE id = ?`, [orgId, agentId]);
      }
      // Also update engine managed_agents table
      const engineDb = db.getEngineDB();
      if (engineDb) {
        try {
          if (isPostgres) {
            await (db as any)._query(`UPDATE managed_agents SET client_org_id = $1, updated_at = NOW() WHERE id = $2`, [orgId, agentId]);
          } else {
            await engineDb.run(`UPDATE managed_agents SET client_org_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orgId, agentId]);
          }
        } catch { /* column may not exist yet before migration */ }
      }

      // ALWAYS clear agent credentials when assigning to an org
      // Agent should start fresh with the new org's inherited credentials
      let credentialsCleared = 0;
      if (clearCredentials !== false) {
        try {
          // Clear agent-level email config from DB
          if (isPostgres) {
            await (db as any)._query(
              `UPDATE managed_agents SET config = config - 'emailConfig' - 'email', updated_at = NOW() WHERE id = $1`,
              [agentId]
            ).catch(() => {});
          } else {
            // SQLite: read-modify-write
            const row = await db.getEngineDB()!.get(`SELECT config FROM managed_agents WHERE id = ?`, [agentId]);
            if (row) {
              const cfg = JSON.parse((row as any).config || '{}');
              delete cfg.emailConfig;
              delete cfg.email;
              await db.getEngineDB()!.run(`UPDATE managed_agents SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(cfg), agentId]);
            }
          }
          // Clear per-agent vault secrets from previous org (if reassignment)
          if (previousOrgId && (globalThis as any).__vault) {
            const vault = (globalThis as any).__vault;
            try {
              const secrets = await vault.getSecretsByOrg(previousOrgId, 'skill_credential');
              for (const secret of secrets) {
                if (secret.name?.includes(':agent:' + agentId)) {
                  await vault.deleteSecret(secret.id);
                  credentialsCleared++;
                }
              }
            } catch { /* vault may not support this query */ }
          }
        } catch { /* best effort */ }
      }

      // Clear in-memory + push new org's credentials to the running agent
      let credentialsPushed = false;
      try {
        const oi = (globalThis as any).__orgIntegrations;
        if (oi) {
          // Force-clear ALL email config from running agent (in-memory)
          const agent = oi.lifecycle?.getAgent?.(agentId);
          if (agent?.config) {
            agent.config.emailConfig = null;
            if (agent.config.email) agent.config.email = null;
          }
          // Update the agent's client_org_id in-memory
          if (agent) {
            agent.client_org_id = orgId;
            agent.clientOrgId = orgId;
          }
          // Push new org's credentials
          credentialsPushed = await oi.pushCredentialsToAgent(agentId, orgId);
        }
      } catch { /* best effort */ }

      return c.json({ success: true, reassigned: !!isReassignment, previousOrgId, credentialsCleared, credentialsPushed });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.post('/agents/:id/unassign-org', requireRole('admin'), async (c) => {
    const agentId = c.req.param('id');
    try {
      const isPostgres = (db as any).pool;

      // Get current org before clearing
      let previousOrgId: string | null = null;
      if (isPostgres) {
        const { rows } = await (db as any)._query(`SELECT client_org_id FROM agents WHERE id = $1`, [agentId]);
        previousOrgId = rows[0]?.client_org_id || null;
      } else {
        const row = await db.getEngineDB()!.get(`SELECT client_org_id FROM agents WHERE id = ?`, [agentId]);
        previousOrgId = (row as any)?.client_org_id || null;
      }

      // Update admin agents table
      if (isPostgres) {
        await (db as any)._query(`UPDATE agents SET client_org_id = NULL WHERE id = $1`, [agentId]);
      } else {
        await db.getEngineDB()!.run(`UPDATE agents SET client_org_id = NULL WHERE id = ?`, [agentId]);
      }
      // Also update engine managed_agents table
      const engineDb = db.getEngineDB();
      if (engineDb) {
        try {
          if (isPostgres) {
            await (db as any)._query(`UPDATE managed_agents SET client_org_id = NULL, updated_at = NOW() WHERE id = $1`, [agentId]);
          } else {
            await engineDb.run(`UPDATE managed_agents SET client_org_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [agentId]);
          }
        } catch { /* column may not exist yet before migration */ }
      }

      // Clear org-inherited credentials from DB
      let credentialsCleared = 0;
      if (previousOrgId) {
        try {
          if (isPostgres) {
            await (db as any)._query(
              `UPDATE managed_agents SET config = config - 'emailConfig' - 'email', updated_at = NOW() WHERE id = $1`,
              [agentId]
            ).catch(() => {});
          } else {
            const row = await db.getEngineDB()!.get(`SELECT config FROM managed_agents WHERE id = ?`, [agentId]);
            if (row) {
              const cfg = JSON.parse((row as any).config || '{}');
              delete cfg.emailConfig;
              delete cfg.email;
              await db.getEngineDB()!.run(`UPDATE managed_agents SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(cfg), agentId]);
            }
          }
          if ((globalThis as any).__vault) {
            const vault = (globalThis as any).__vault;
            try {
              const secrets = await vault.getSecretsByOrg(previousOrgId, 'skill_credential');
              for (const secret of secrets) {
                if (secret.name?.includes(':agent:' + agentId)) {
                  await vault.deleteSecret(secret.id);
                  credentialsCleared++;
                }
              }
            } catch { /* best effort */ }
          }
        } catch { /* best effort */ }
      }

      // Clear ALL credentials from the running agent (in-memory)
      try {
        const oi = (globalThis as any).__orgIntegrations;
        if (oi) {
          const agent = oi.lifecycle?.getAgent?.(agentId);
          if (agent?.config) {
            agent.config.emailConfig = null;
            if (agent.config.email) agent.config.email = null;
          }
          if (agent) {
            agent.client_org_id = null;
            agent.clientOrgId = null;
          }
        }
      } catch { /* best effort */ }

      return c.json({ success: true, previousOrgId, credentialsCleared });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Agent Knowledge Access ─────────────────────────────

  api.get('/agents/:id/knowledge-access', requireRole('admin'), async (c) => {
    const agentId = c.req.param('id');
    try {
      const isPostgres = (db as any).pool;
      if (isPostgres) {
        const { rows } = await (db as any)._query(`SELECT * FROM agent_knowledge_access WHERE agent_id = $1`, [agentId]);
        return c.json({ grants: rows });
      } else {
        const rows = await db.getEngineDB()!.all(`SELECT * FROM agent_knowledge_access WHERE agent_id = ?`, [agentId]);
        return c.json({ grants: rows });
      }
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.put('/agents/:id/knowledge-access', requireRole('admin'), async (c) => {
    const agentId = c.req.param('id');
    const { grants } = await c.req.json();
    if (!Array.isArray(grants)) return c.json({ error: 'grants must be an array' }, 400);
    try {
      const isPostgres = (db as any).pool;
      if (isPostgres) {
        await (db as any)._query(`DELETE FROM agent_knowledge_access WHERE agent_id = $1`, [agentId]);
        for (const g of grants) {
          const id = (await import('crypto')).randomUUID();
          await (db as any)._query(
            `INSERT INTO agent_knowledge_access (id, agent_id, knowledge_base_id, access_type) VALUES ($1, $2, $3, $4)`,
            [id, agentId, g.knowledgeBaseId, g.accessType || 'read']
          );
        }
      } else {
        const engineDb = db.getEngineDB()!;
        await engineDb.run(`DELETE FROM agent_knowledge_access WHERE agent_id = ?`, [agentId]);
        for (const g of grants) {
          const id = (await import('crypto')).randomUUID();
          await engineDb.run(
            `INSERT INTO agent_knowledge_access (id, agent_id, knowledge_base_id, access_type) VALUES (?, ?, ?, ?)`,
            [id, agentId, g.knowledgeBaseId, g.accessType || 'read']
          );
        }
      }
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Organization Billing ────────────────────────────

  api.get('/organizations/:id/billing', requireRole('admin'), async (c) => {
    const orgId = c.req.param('id');
    const months = parseInt(c.req.query('months') || '12');
    try {
      const isPostgres = (db as any).pool;
      let records: any[];
      if (isPostgres) {
        const { rows } = await (db as any)._query(
          `SELECT * FROM org_billing_records WHERE org_id = $1 ORDER BY month DESC LIMIT $2`,
          [orgId, months]
        );
        records = rows;
      } else {
        records = await db.getEngineDB()!.all(
          `SELECT * FROM org_billing_records WHERE org_id = ? ORDER BY month DESC LIMIT ?`,
          [orgId, months]
        );
      }
      return c.json({ records });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.put('/organizations/:id/billing', requireRole('admin'), async (c) => {
    const orgId = c.req.param('id');
    const { records } = await c.req.json();
    if (!Array.isArray(records)) return c.json({ error: 'records must be an array' }, 400);
    try {
      const isPostgres = (db as any).pool;
      const { randomUUID } = await import('crypto');
      for (const r of records) {
        if (!r.month) continue;
        if (isPostgres) {
          await (db as any)._query(
            `INSERT INTO org_billing_records (id, org_id, agent_id, month, revenue, token_cost, input_tokens, output_tokens, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (org_id, agent_id, month) DO UPDATE SET
               revenue = EXCLUDED.revenue, token_cost = EXCLUDED.token_cost,
               input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
               notes = EXCLUDED.notes, updated_at = NOW()`,
            [randomUUID(), orgId, r.agentId || null, r.month, r.revenue || 0, r.tokenCost || 0, r.inputTokens || 0, r.outputTokens || 0, r.notes || null]
          );
        } else {
          const id = randomUUID();
          await db.getEngineDB()!.run(
            `INSERT OR REPLACE INTO org_billing_records (id, org_id, agent_id, month, revenue, token_cost, input_tokens, output_tokens, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, orgId, r.agentId || null, r.month, r.revenue || 0, r.tokenCost || 0, r.inputTokens || 0, r.outputTokens || 0, r.notes || null]
          );
        }
      }
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Organization Billing Summary ─────────────────────

  api.get('/organizations/:id/billing-summary', requireRole('admin'), async (c) => {
    const orgId = c.req.param('id');
    try {
      const isPostgres = (db as any).pool;
      let rows: any[];
      if (isPostgres) {
        const result = await (db as any)._query(
          `SELECT month, SUM(revenue) as total_revenue, SUM(token_cost) as total_cost,
                  SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens
           FROM org_billing_records WHERE org_id = $1
           GROUP BY month ORDER BY month ASC`, [orgId]
        );
        rows = result.rows;
      } else {
        rows = await db.getEngineDB()!.all(
          `SELECT month, SUM(revenue) as total_revenue, SUM(token_cost) as total_cost,
                  SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens
           FROM org_billing_records WHERE org_id = ?
           GROUP BY month ORDER BY month ASC`, [orgId]
        );
      }
      return c.json({ summary: rows });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  /** Stop and optionally delete tunnel */
  api.post('/tunnel/stop', requireRole('admin'), async (c) => {
    try {
      const { execSync } = await import('child_process');
      try { execSync('pm2 stop cloudflared 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
      try { execSync('pm2 delete cloudflared 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Custom Agent Roles (Soul Templates) ──────────────

  const rolesQuery = async (sql: string, params: any[] = []) => {
    const isPostgres = (db as any).pool;
    if (isPostgres) {
      const { rows } = await (db as any)._query(sql, params);
      return rows;
    } else {
      const engineDb = db.getEngineDB();
      return await engineDb!.all(sql.replace(/\$(\d+)/g, '?'), params);
    }
  };

  const rolesExec = async (sql: string, params: any[] = []) => {
    const isPostgres = (db as any).pool;
    if (isPostgres) {
      await (db as any)._query(sql, params);
    } else {
      const engineDb = db.getEngineDB();
      await engineDb!.run(sql.replace(/\$(\d+)/g, '?'), params);
    }
  };

  const rolesGet = async (sql: string, params: any[] = []) => {
    const isPostgres = (db as any).pool;
    if (isPostgres) {
      const { rows } = await (db as any)._query(sql, params);
      return rows[0] || null;
    } else {
      const engineDb = db.getEngineDB();
      return await engineDb!.get(sql.replace(/\$(\d+)/g, '?'), params);
    }
  };

  const mapRole = (r: any) => {
    if (!r) return null;
    const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
    return {
      id: r.id, name: r.name, slug: r.slug, category: r.category || 'operations',
      description: r.description, personality: r.personality || '',
      identity: parse(r.identity) || {}, suggestedSkills: parse(r.suggested_skills) || [],
      suggestedPreset: r.suggested_preset || null, tags: parse(r.tags) || [],
      orgId: r.org_id, isActive: r.is_active !== false && r.is_active !== 0,
      isCustom: true, metadata: parse(r.metadata),
      createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  };

  // List custom agent roles
  api.get('/roles', requireRole('admin'), async (c) => {
    try {
      const orgId = c.req.query('orgId');
      let sql: string, params: any[];
      if (orgId) {
        sql = 'SELECT * FROM custom_roles WHERE (org_id = $1 OR org_id IS NULL) AND is_active = $2 ORDER BY category, name';
        params = [orgId, (db as any).pool ? true : 1];
      } else {
        sql = 'SELECT * FROM custom_roles ORDER BY category, name';
        params = [];
      }
      const rows = await rolesQuery(sql, params);
      return c.json({ roles: rows.map(mapRole) });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get single role
  api.get('/roles/:id', requireRole('admin'), async (c) => {
    try {
      const role = mapRole(await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [c.req.param('id')]));
      if (!role) return c.json({ error: 'Role not found' }, 404);
      return c.json(role);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Create role
  api.post('/roles', requireRole('admin'), async (c) => {
    try {
      const body = await c.req.json();
      validate(body, [
        { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 128 },
        { field: 'category', type: 'string', required: true },
        { field: 'description', type: 'string', maxLength: 1024 },
      ]);
      const slug = (body.slug || body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const existing = body.orgId
        ? await rolesGet('SELECT id FROM custom_roles WHERE slug = $1 AND org_id = $2', [slug, body.orgId])
        : await rolesGet('SELECT id FROM custom_roles WHERE slug = $1 AND org_id IS NULL', [slug]);
      if (existing) return c.json({ error: 'A role with this name already exists' }, 409);

      const id = crypto.randomUUID();
      const isPostgres = (db as any).pool;
      await rolesExec(
        `INSERT INTO custom_roles (id, name, slug, category, description, personality, identity, suggested_skills, suggested_preset, tags, org_id, is_active, metadata, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id, body.name, slug, body.category || 'operations', body.description || null,
          body.personality || null, JSON.stringify(body.identity || {}),
          JSON.stringify(body.suggestedSkills || []), body.suggestedPreset || null,
          JSON.stringify(body.tags || []), body.orgId || null,
          isPostgres ? true : 1, JSON.stringify(body.metadata || {}),
          (c as any).get?.('userId') || 'system',
        ]
      );
      return c.json(mapRole(await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [id])), 201);
    } catch (e: any) { return c.json({ error: e.message }, e instanceof ValidationError ? 400 : 500); }
  });

  // Update role
  api.put('/roles/:id', requireRole('admin'), async (c) => {
    try {
      const existing = await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [c.req.param('id')]);
      if (!existing) return c.json({ error: 'Role not found' }, 404);
      const body = await c.req.json();
      const isPostgres = (db as any).pool;
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      const strMap: Record<string, string> = { name: 'name', category: 'category', description: 'description', personality: 'personality', suggestedPreset: 'suggested_preset' };
      for (const [key, col] of Object.entries(strMap)) {
        if (body[key] !== undefined) { fields.push(`${col} = $${i++}`); values.push(body[key]); }
      }
      if (body.identity !== undefined) { fields.push(`identity = $${i++}`); values.push(JSON.stringify(body.identity)); }
      if (body.suggestedSkills !== undefined) { fields.push(`suggested_skills = $${i++}`); values.push(JSON.stringify(body.suggestedSkills)); }
      if (body.tags !== undefined) { fields.push(`tags = $${i++}`); values.push(JSON.stringify(body.tags)); }
      if (body.orgId !== undefined) { fields.push(`org_id = $${i++}`); values.push(body.orgId || null); }
      if (body.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(isPostgres ? !!body.isActive : (body.isActive ? 1 : 0)); }
      if (body.metadata !== undefined) { fields.push(`metadata = $${i++}`); values.push(JSON.stringify(body.metadata)); }
      if (body.name && body.name !== existing.name) {
        const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        fields.push(`slug = $${i++}`); values.push(slug);
      }
      if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
      fields.push(`updated_at = $${i++}`); values.push(new Date().toISOString());
      values.push(c.req.param('id'));
      await rolesExec(`UPDATE custom_roles SET ${fields.join(', ')} WHERE id = $${i}`, values);
      return c.json(mapRole(await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [c.req.param('id')])));
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Delete role
  api.delete('/roles/:id', requireRole('admin'), async (c) => {
    try {
      const existing = await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [c.req.param('id')]);
      if (!existing) return c.json({ error: 'Role not found' }, 404);
      await rolesExec('DELETE FROM custom_roles WHERE id = $1', [c.req.param('id')]);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Duplicate role
  api.post('/roles/:id/duplicate', requireRole('admin'), async (c) => {
    try {
      const source = mapRole(await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [c.req.param('id')]));
      if (!source) return c.json({ error: 'Role not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const newName = body.name || source.name + ' (Copy)';
      const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = crypto.randomUUID();
      const isPostgres = (db as any).pool;
      await rolesExec(
        `INSERT INTO custom_roles (id, name, slug, category, description, personality, identity, suggested_skills, suggested_preset, tags, org_id, is_active, metadata, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id, newName, slug, source.category, source.description, source.personality,
          JSON.stringify(source.identity), JSON.stringify(source.suggestedSkills),
          source.suggestedPreset, JSON.stringify(source.tags), source.orgId || null,
          isPostgres ? true : 1, JSON.stringify(source.metadata),
          (c as any).get?.('userId') || 'system',
        ]
      );
      return c.json(mapRole(await rolesGet('SELECT * FROM custom_roles WHERE id = $1', [id])), 201);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── System Update Endpoints ─────────────────────────
  
  api.get('/system/update-check', async (c) => {
    try {
      const { checkForUpdate, getCachedUpdateCheck } = await import('../cli-update.js');
      // Return cached if checked within last 5 minutes
      const cached = getCachedUpdateCheck();
      if (cached && Date.now() - new Date(cached.checkedAt).getTime() < 5 * 60_000) {
        return c.json(cached);
      }
      const info = await checkForUpdate();
      return c.json(info);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  api.post('/system/update', async (c) => {
    try {
      const { performUpdate } = await import('../cli-update.js');
      // Run update in background — response returns immediately
      const result = await performUpdate({ restart: true });
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ═══ POLYMARKET TRADING MANAGEMENT ═══════════════════════════

  // Helper: get engine DB for raw SQL queries (works across SQLite, Postgres, MySQL)
  const edb = () => db.getEngineDB();

  // Get trading config for an agent
  // ─── SOCKS Proxy Management ─────────────────────────────────
  // Ensure polymarket proxy table exists
  let _polyTablesInit = false;
  async function ensurePolyDB() {
    if (_polyTablesInit) return;
    const e = edb();
    if (!e) return;
    try {
      // initPolymarketDB expects db.execute(); engine DB has run/get/all — shim it
      const dbShim = (e as any).execute ? e : Object.assign({}, e, {
        execute: (e as any).run || (e as any).execute,
        query: (e as any).all || (e as any).query,
      });
      await initPolymarketDB(dbShim);

      // Ensure poly_goals table exists (not part of initPolymarketDB)
      await e.run(`CREATE TABLE IF NOT EXISTS poly_goals (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        period TEXT NOT NULL DEFAULT 'daily',
        target_value REAL NOT NULL,
        current_value REAL DEFAULT 0,
        met INTEGER DEFAULT 0,
        met_at TEXT,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        times_met INTEGER DEFAULT 0,
        times_missed INTEGER DEFAULT 0,
        last_evaluated TEXT,
        enabled INTEGER DEFAULT 1,
        notify_on_met INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      _polyTablesInit = true;
    } catch (err: any) {
      console.error('[polymarket] Failed to init tables:', err.message);
    }
  }

  // Eagerly init polymarket tables so they exist before any route is hit
  ensurePolyDB().catch((e: any) => console.warn('[polymarket] Eager init:', e.message));

  // Middleware: ensure poly tables exist for ALL /polymarket/* routes
  api.use('/polymarket/*', async (_c, next) => { await ensurePolyDB(); return next(); });

  api.get('/polymarket/proxy/status', requireRole('admin'), async (c) => {
    await autoConnectProxy(edb());
    const state = getProxyState();
    const config = await loadProxyConfig(edb());
    return c.json({
      ...state,
      configured: !!config,
      config: config ? { proxyMode: config.proxyMode, proxyUrl: config.proxyUrl, vpsHost: config.vpsHost, vpsUser: config.vpsUser, vpsPort: config.vpsPort, socksPort: config.socksPort, authMethod: config.authMethod, enabled: config.enabled } : null,
    });
  });

  api.post('/polymarket/proxy/config', requireRole('owner'), async (c) => {
    try {
      const body = await c.req.json();
      await saveProxyConfig(edb(), {
        enabled: body.enabled ?? false,
        proxyMode: body.proxyMode || 'http',
        proxyUrl: body.proxyUrl || undefined,
        proxyToken: body.proxyToken || undefined,
        vpsHost: body.vpsHost || '',
        vpsUser: body.vpsUser || 'root',
        vpsPort: body.vpsPort || 22,
        socksPort: body.socksPort || 1080,
        authMethod: body.authMethod || 'password',
        sshKeyPath: body.sshKeyPath || undefined,
        sshKeyContent: body.sshKeyContent || undefined,
        password: body.password || undefined,
      });
      return c.json({ status: 'saved' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/proxy/connect', requireRole('owner'), async (c) => {
    try {
      const state = await startProxy(edb());
      return c.json(state);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/proxy/disconnect', requireRole('owner'), async (c) => {
    await stopProxy();
    return c.json({ status: 'disconnected' });
  });

  api.post('/polymarket/proxy/test', requireRole('admin'), async (c) => {
    const state = getProxyState();
    if (!state.connected) return c.json({ error: 'Proxy not connected' }, 400);
    try {
      const config = await loadProxyConfig(edb());
      if (config?.proxyMode === 'http' && config.proxyUrl) {
        // Test HTTP proxy by hitting /time through it
        const headers: Record<string, string> = {};
        if (config.proxyToken) headers['x-proxy-token'] = config.proxyToken;
        const res = await fetch(config.proxyUrl.replace(/\/$/, '') + '/time', { headers, signal: AbortSignal.timeout(10000) });
        const time = await res.text();
        return c.json({ status: 'ok', clobTime: time, geoblock: { blocked: false } });
      }
      // SOCKS tunnel test
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      const agent = new SocksProxyAgent(`socks5://127.0.0.1:${state.socksPort}`);
      const res = await fetch('https://clob.polymarket.com/time', { agent } as any);
      const time = await res.text();
      const geoRes = await fetch('https://polymarket.com/api/geoblock', { agent } as any);
      const geo = await geoRes.json();
      return c.json({ status: 'ok', clobTime: time, geoblock: geo });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Auto-deploy proxy to VPS
  api.post('/polymarket/proxy/setup', requireRole('owner'), async (c) => {
    try {
      const body = await c.req.json();
      if (!body.host) return c.json({ error: 'Server address is required' }, 400);

      const result = await deployProxyToVPS({
        host: body.host,
        user: body.user || 'root',
        password: body.password || undefined,
        sshKeyPath: body.sshKeyPath || undefined,
        sshKeyContent: body.sshKeyContent || undefined,
        port: body.sshPort || 22,
      });

      if (result.success) {
        // Auto-save the proxy config
        await saveProxyConfig(edb(), {
          enabled: true,
          proxyMode: 'http',
          proxyUrl: result.proxyUrl,
          proxyToken: result.proxyToken,
          vpsHost: body.host,
          vpsUser: body.user || 'root',
          vpsPort: body.sshPort || 22,
          authMethod: body.password ? 'password' : 'key',
          password: body.password || undefined,
          sshKeyPath: body.sshKeyPath || undefined,
          sshKeyContent: body.sshKeyContent || undefined,
        });
      }

      return c.json(result);
    } catch (e: any) { return c.json({ error: e.message, logs: [] }, 500); }
  });

  api.get('/polymarket/:agentId/config', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const row = await edb()?.get(`SELECT * FROM poly_trading_config WHERE agent_id = ?`, [agentId]);
      return c.json({ config: row || null });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Update trading config
  api.put('/polymarket/:agentId/config', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      const fields = ['mode', 'max_position_size', 'max_order_size', 'max_total_exposure', 'max_daily_trades',
        'max_daily_loss', 'max_drawdown_pct', 'stop_loss_pct', 'take_profit_pct', 'cash_reserve_pct',
        'proactive_interval_mins', 'proactive_max_daily'];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const f of fields) {
        if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(body[f]); }
      }
      if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);
      sets.push('updated_at = CURRENT_TIMESTAMP');
      const changedFields = fields.filter(f => body[f] !== undefined);
      const insertPlaceholders = changedFields.map(() => '?').join(',');
      // Params: [agentId, ...insertVals, ...updateVals, agentId_for_fallback]
      // For the upsert: INSERT needs agentId + vals, ON CONFLICT SET needs vals again
      await edb()?.run(`
        INSERT INTO poly_trading_config (agent_id, ${changedFields.join(',')}, updated_at)
        VALUES (?, ${insertPlaceholders}, CURRENT_TIMESTAMP)
        ON CONFLICT (agent_id) DO UPDATE SET ${sets.join(', ')}
      `, [agentId, ...vals, ...vals]).catch(() =>
        edb()?.run(`UPDATE poly_trading_config SET ${sets.join(', ')} WHERE agent_id = ?`, [...vals, agentId])
      );
      return c.json({ status: 'ok' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get pending trades for an agent (includes approval-pending AND placed-but-unfilled orders)
  api.get('/polymarket/:agentId/pending', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      // Approval-mode pending trades
      const pendingRows = await edb()?.all(`SELECT *, 'approval' as source FROM poly_pending_trades WHERE agent_id = ? AND status = 'pending' ORDER BY created_at DESC`, [agentId]) || [];
      // Auto-placed but not yet filled orders from trade log
      const placedRows = await edb()?.all(`SELECT *, 'placed' as source FROM poly_trade_log WHERE agent_id = ? AND status = 'placed' ORDER BY created_at DESC`, [agentId]) || [];
      return c.json({ trades: [...pendingRows, ...placedRows] });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Approve or reject a pending trade
  api.post('/polymarket/trades/:tradeId/decide', requireRole('admin'), async (c) => {
    try {
      const tradeId = c.req.param('tradeId');
      const { decision, reason } = await c.req.json();

      if (decision === 'approve') {
        // Load trade BEFORE resolving
        const trade = await edb()?.get(`SELECT * FROM poly_pending_trades WHERE id = ? AND status = 'pending'`, [tradeId]) as any;
        if (!trade) return c.json({ error: 'Trade not found or already resolved' }, 404);

        await edb()?.run(`UPDATE poly_pending_trades SET status = 'approved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?`,
          [reason || 'admin', tradeId]);

        // Execute the trade on-chain
        try {
          const db = { execute: (sql: string, params: any[]) => edb()?.all(sql.replace(/\$(\d+)/g, '?'), params), query: (sql: string, params: any[]) => edb()?.all(sql.replace(/\$(\d+)/g, '?'), params) };
          const result = await executeOrder(trade.agent_id, db, tradeId, {
            token_id: trade.token_id, side: trade.side,
            price: trade.price, size: trade.size,
            order_type: trade.order_type, tick_size: trade.tick_size,
            neg_risk: trade.neg_risk, market_question: trade.market_question,
            outcome: trade.outcome, rationale: trade.rationale,
          }, 'admin_approved');
          const parsed = typeof result === 'string' ? JSON.parse(result) : result;
          return c.json({ status: 'ok', decision: 'approve', execution: parsed });
        } catch (execErr: any) {
          return c.json({ status: 'ok', decision: 'approve', execution_error: execErr.message });
        }
      } else {
        await edb()?.run(`UPDATE poly_pending_trades SET status = 'rejected', resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?`,
          [reason || 'admin', tradeId]);
        return c.json({ status: 'ok', decision: 'reject' });
      }
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get trade history for an agent
  api.get('/polymarket/:agentId/trades', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const limit = parseInt(c.req.query('limit') || '50');
      const rows = await edb()?.all(`SELECT * FROM poly_trade_log WHERE agent_id = ? AND status != 'placed' ORDER BY created_at DESC LIMIT ?`, [agentId, limit]) || [];
      return c.json({ trades: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get wallet status (address only, never expose private key)
  api.get('/polymarket/:agentId/wallet', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const row = await edb()?.get(`SELECT agent_id, funder_address, private_key_encrypted, signature_type, created_at, updated_at FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!row) return c.json({ wallet: null });

      // Derive signer address from private key so UI can show the real trading address
      let signerAddress: string | null = null;
      if (row.private_key_encrypted) {
        try {
          const { SecureVault } = await import('../engine/vault.js');
          let vault: any; try { vault = new SecureVault(); } catch {}
          const pk = vault ? vault.decrypt(row.private_key_encrypted) : row.private_key_encrypted;
          try {
            const { createRequire } = await import('module');
            const sdkDir = (await import('path')).join((await import('os')).homedir(), '.agenticmail/polymarket-sdk');
            const req = createRequire(sdkDir + '/node_modules/.package.json');
            const { Wallet } = req('@ethersproject/wallet');
            signerAddress = new Wallet(pk).address;
          } catch {
            try { const { Wallet } = await import('ethers' as any); signerAddress = new Wallet(pk).address; } catch {}
          }
        } catch {}
      }

      const mismatch = signerAddress && signerAddress !== row.funder_address;
      return c.json({ wallet: {
        address: row.funder_address,
        signerAddress: signerAddress || row.funder_address,
        mismatch: !!mismatch,
        signatureType: row.signature_type,
        connected: true,
        createdAt: row.created_at,
      }});
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Generate a new wallet (OWNER ONLY)
  api.post('/polymarket/:agentId/wallet/create', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');

      // Check if wallet already exists
      const existing = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (existing?.funder_address) return c.json({ error: 'Wallet already exists at ' + existing.funder_address + '. Delete it first or use import to replace.' }, 400);

      // Generate wallet using ethersproject
      let address: string, privateKey: string;
      try {
        const { createRequire } = await import('module');
        const sdkDir = (await import('path')).join((await import('os')).homedir(), '.agenticmail/polymarket-sdk');
        const req = createRequire(sdkDir + '/node_modules/.package.json');
        const { Wallet } = req('@ethersproject/wallet');
        const wallet = Wallet.createRandom();
        address = wallet.address;
        privateKey = wallet.privateKey;
      } catch {
        try {
          const { Wallet } = await import('ethers' as any);
          const wallet = Wallet.createRandom();
          address = wallet.address;
          privateKey = wallet.privateKey;
        } catch {
          return c.json({ error: 'SDK not installed. Run the agent once to auto-install.' }, 500);
        }
      }

      // Encrypt and store
      const { SecureVault } = await import('../engine/vault.js');
      let vault: any;
      try { vault = new SecureVault(); } catch {}
      const encrypt = (val: string) => { try { return vault ? vault.encrypt(val) : val; } catch { return val; } };

      await edb()?.run(`
        INSERT INTO poly_wallet_credentials (agent_id, private_key_encrypted, funder_address, signature_type, updated_at)
        VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
      `, [agentId, encrypt(privateKey), address]);

      flushClobClient(agentId);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.created', resourceType: 'agent', resourceId: agentId, details: { address }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}

      return c.json({ status: 'ok', address, privateKey });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Import API credentials only (OWNER ONLY) — for existing Polymarket users
  api.post('/polymarket/:agentId/wallet/import-api-creds', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      if (!body.api_key || !body.api_secret || !body.api_passphrase) return c.json({ error: 'api_key, api_secret, and api_passphrase are required' }, 400);

      const { SecureVault } = await import('../engine/vault.js');
      let vault: any;
      try { vault = new SecureVault(); } catch {}
      const encrypt = (val: string) => { try { return vault ? vault.encrypt(val) : val; } catch { return val; } };

      // Check if wallet row exists
      const existing = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (existing) {
        // Update API creds on existing wallet
        await edb()?.run(`UPDATE poly_wallet_credentials SET api_key = ?, api_secret = ?, api_passphrase = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`,
          [encrypt(body.api_key), encrypt(body.api_secret), encrypt(body.api_passphrase), agentId]);
      } else {
        // Create new row with just API creds (no private key)
        await edb()?.run(`INSERT INTO poly_wallet_credentials (agent_id, api_key, api_secret, api_passphrase, funder_address, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [agentId, encrypt(body.api_key), encrypt(body.api_secret), encrypt(body.api_passphrase), body.wallet_address || '']);
      }

      flushClobClient(agentId);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.api_creds_imported', resourceType: 'agent', resourceId: agentId, details: { hasKey: true }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}

      return c.json({ status: 'ok', message: 'API credentials imported. Agent can now trade using your existing Polymarket account.' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Import wallet private key (OWNER ONLY)
  api.post('/polymarket/:agentId/wallet/import', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      if (!body.private_key) return c.json({ error: 'private_key is required' }, 400);

      const pk = body.private_key.startsWith('0x') ? body.private_key : `0x${body.private_key}`;

      // Validate the private key by deriving the address
      let address: string;
      try {
        const { createRequire } = await import('module');
        const sdkDir = (await import('path')).join((await import('os')).homedir(), '.agenticmail/polymarket-sdk');
        const req = createRequire(sdkDir + '/node_modules/.package.json');
        const { Wallet } = req('@ethersproject/wallet');
        const wallet = new Wallet(pk);
        address = wallet.address;
      } catch {
        // Fallback: try ethers from enterprise node_modules
        try {
          const { Wallet } = await import('ethers' as any);
          const wallet = new Wallet(pk);
          address = wallet.address;
        } catch {
          return c.json({ error: 'Invalid private key or SDK not installed' }, 400);
        }
      }

      // SAFETY: Check if wallet already exists — require explicit confirmation to overwrite
      const existing = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (existing?.funder_address && existing.funder_address !== address && !body.confirm_overwrite) {
        return c.json({
          error: 'EXISTING_WALLET',
          existing_address: existing.funder_address,
          new_address: address,
          message: `This agent already has a wallet at ${existing.funder_address}. Importing a new key will PERMANENTLY replace it. Export and back up the existing private key first. Send confirm_overwrite: true to proceed.`,
        }, 409);
      }

      // Encrypt and store
      const { SecureVault } = await import('../engine/vault.js');
      let vault: any;
      try { vault = new SecureVault(); } catch {}

      const encrypt = (val: string) => {
        if (!val) return val;
        try { return vault ? vault.encrypt(val) : val; } catch { return val; }
      };

      await edb()?.run(`
        INSERT INTO poly_wallet_credentials (agent_id, private_key_encrypted, funder_address, signature_type, updated_at)
        VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (agent_id) DO UPDATE SET
          private_key_encrypted = ?, funder_address = ?, signature_type = 0, api_key = NULL, api_secret = NULL, api_passphrase = NULL, updated_at = CURRENT_TIMESTAMP
      `, [agentId, encrypt(pk), address, encrypt(pk), address]);

      flushClobClient(agentId);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.imported', resourceType: 'agent', resourceId: agentId, details: { address, replaced: existing?.funder_address || null }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}

      return c.json({ status: 'ok', address, message: 'Wallet imported successfully. API keys will be derived automatically on first use.' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Export wallet private key (OWNER ONLY — requires password confirmation)
  api.post('/polymarket/:agentId/wallet/export', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      if (!body.confirm || body.confirm !== 'EXPORT') {
        return c.json({ error: 'Must send { confirm: "EXPORT" } to confirm private key export' }, 400);
      }
      const row = await edb()?.get(`SELECT private_key_encrypted, funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!row) return c.json({ error: 'No wallet found for this agent' }, 404);

      // Audit log this sensitive action
      try {
        await (db as any).createAuditLog({
          userId: c.get('userId' as any),
          action: 'wallet.private_key_exported',
          resourceType: 'agent',
          resourceId: agentId,
          details: { address: row.funder_address },
          ipAddress: c.req.header('x-forwarded-for') || 'unknown',
        });
      } catch {}

      // Decrypt the private key
      const pk: string = (() => { try { return vault.decrypt(row.private_key_encrypted); } catch { return row.private_key_encrypted; } })();

      // Derive the REAL address from the decrypted key
      let derivedAddress: string | null = null;
      try {
        const { createRequire } = await import('module');
        const sdkDir = (await import('path')).join((await import('os')).homedir(), '.agenticmail/polymarket-sdk');
        const req = createRequire(sdkDir + '/node_modules/.package.json');
        const { Wallet: W } = req('@ethersproject/wallet');
        derivedAddress = new W(pk).address;
      } catch {
        try { const { Wallet: W } = await import('ethers' as any); derivedAddress = new W(pk).address; } catch {}
      }

      const mismatch = derivedAddress && derivedAddress !== row.funder_address;
      return c.json({
        address: derivedAddress || row.funder_address,
        storedFunderAddress: row.funder_address,
        privateKey: pk,
        mismatch: !!mismatch,
        warning: mismatch
          ? `CRITICAL: The private key derives address ${derivedAddress} but the stored funder address is ${row.funder_address}. These do NOT match! The key may have been corrupted by a vault key change. Check your VAULT_KEY environment variable.`
          : 'This private key controls all funds in this wallet. Store it securely. Anyone with this key can drain the wallet.',
        importInstructions: {
          metamask: '1. Open MetaMask → Import Account → Paste private key',
          rabby: '1. Open Rabby → Add Address → Import Private Key → Paste',
          polymarket: 'Use this key to sign into polymarket.com via wallet connect',
        }
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Sync wallet — flush in-memory cache, show both funder and signer addresses
  api.post('/polymarket/:agentId/wallet/sync', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const flushed = flushClobClient(agentId);
      const row = await edb()?.get(`SELECT funder_address, private_key_encrypted, updated_at FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!row) return c.json({ status: 'ok', flushed, wallet: null, message: 'No wallet found in database.' });

      // Derive the signer address from the private key
      let signerAddress: string | null = null;
      if (row.private_key_encrypted) {
        try {
          const { SecureVault } = await import('../engine/vault.js');
          let vault: any; try { vault = new SecureVault(); } catch {}
          const pk = vault ? vault.decrypt(row.private_key_encrypted) : row.private_key_encrypted;
          try {
            const { createRequire } = await import('module');
            const sdkDir = (await import('path')).join((await import('os')).homedir(), '.agenticmail/polymarket-sdk');
            const req = createRequire(sdkDir + '/node_modules/.package.json');
            const { Wallet } = req('@ethersproject/wallet');
            signerAddress = new Wallet(pk).address;
          } catch {
            try { const { Wallet } = await import('ethers' as any); signerAddress = new Wallet(pk).address; } catch {}
          }
        } catch {}
      }

      const isSameAddress = signerAddress === row.funder_address;
      return c.json({
        status: 'ok',
        flushed,
        wallet: {
          funderAddress: row.funder_address,
          signerAddress,
          isSameAddress,
          updatedAt: row.updated_at,
        },
        message: flushed
          ? 'Cache flushed. Agent will reload from DB on next use.'
          : 'Wallet is in sync.',
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Whitelisted Withdrawal Addresses ──────────────────────
  api.get('/polymarket/:agentId/wallet/whitelist', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_whitelisted_addresses WHERE agent_id = ? ORDER BY created_at DESC`, [agentId]).catch(() => []) || [];
      return c.json({ addresses: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/:agentId/wallet/whitelist', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      if (!body.label || !body.address) return c.json({ error: 'label and address are required' }, 400);
      // Validate Ethereum address format
      const addr = body.address.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return c.json({ error: 'Invalid Ethereum address format. Must be 0x followed by 40 hex characters.' }, 400);
      // Check for duplicate
      const existing = await edb()?.get(`SELECT id FROM poly_whitelisted_addresses WHERE agent_id = ? AND address = ?`, [agentId, addr.toLowerCase()]);
      if (existing) return c.json({ error: 'This address is already whitelisted' }, 409);
      // Configurable cooling period (default 24h, min 0)
      const coolingHours = Math.max(0, body.cooling_hours != null ? body.cooling_hours : 24);
      const coolingUntil = new Date(Date.now() + coolingHours * 3600000).toISOString();
      const id = crypto.randomUUID();
      await edb()?.run(
        `INSERT INTO poly_whitelisted_addresses (id, agent_id, label, address, added_by, per_tx_limit, daily_limit, cooling_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, agentId, body.label.trim(), addr.toLowerCase(), c.get('userId' as any) || 'unknown', body.per_tx_limit || 100, body.daily_limit || 500, coolingUntil]
      );
      // Audit log
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.whitelist_added', resourceType: 'agent', resourceId: agentId, details: { label: body.label, address: addr, coolingUntil }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
      return c.json({ success: true, id, coolingUntil, coolingHours, message: (coolingHours > 0 ? coolingHours + '-hour cooling period active. Transfers to this address will be blocked until ' + coolingUntil : 'Address added with no cooling period.') });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.delete('/polymarket/:agentId/wallet/whitelist/:addrId', requireRole('owner'), async (c) => {
    try {
      const addrId = c.req.param('addrId');
      const agentId = c.req.param('agentId');
      // Check for pending transfers first
      const pending = await edb()?.get(`SELECT COUNT(*) as cnt FROM poly_transfer_requests WHERE whitelist_id = ? AND status = 'pending'`, [addrId]);
      if (pending?.cnt > 0) return c.json({ error: 'Cannot remove: there are pending transfers to this address. Reject them first.' }, 400);
      const row = await edb()?.get(`SELECT label, address FROM poly_whitelisted_addresses WHERE id = ?`, [addrId]);
      await edb()?.run(`DELETE FROM poly_whitelisted_addresses WHERE id = ? AND agent_id = ?`, [addrId, agentId]);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.whitelist_removed', resourceType: 'agent', resourceId: agentId, details: { label: row?.label, address: row?.address }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.put('/polymarket/:agentId/wallet/whitelist/:addrId', requireRole('owner'), async (c) => {
    try {
      const addrId = c.req.param('addrId');
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      const updates: string[] = []; const vals: any[] = [];
      if (body.label) { updates.push('label = ?'); vals.push(body.label); }
      if (body.per_tx_limit != null) { updates.push('per_tx_limit = ?'); vals.push(body.per_tx_limit); }
      if (body.daily_limit != null) { updates.push('daily_limit = ?'); vals.push(body.daily_limit); }
      if (body.is_active != null) { updates.push('is_active = ?'); vals.push(body.is_active ? 1 : 0); }
      if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);
      vals.push(addrId, agentId);
      await edb()?.run(`UPDATE poly_whitelisted_addresses SET ${updates.join(', ')} WHERE id = ? AND agent_id = ?`, vals);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.whitelist_updated', resourceType: 'agent', resourceId: agentId, details: body, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Transfer Requests ──────────────────────
  api.get('/polymarket/:agentId/transfers', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_transfer_requests WHERE agent_id = ? ORDER BY created_at DESC`, [agentId]).catch(() => []) || [];
      return c.json({ transfers: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/:agentId/transfers/:txId/approve', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const txId = c.req.param('txId');
      const tx = await edb()?.get(`SELECT * FROM poly_transfer_requests WHERE id = ? AND agent_id = ?`, [txId, agentId]) as any;
      if (!tx) return c.json({ error: 'Transfer not found' }, 404);
      if (tx.status !== 'pending') return c.json({ error: 'Transfer is not pending (status: ' + tx.status + ')' }, 400);
      if (tx.expires_at < new Date().toISOString()) {
        await edb()?.run(`UPDATE poly_transfer_requests SET status = 'expired', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, [txId]);
        return c.json({ error: 'Transfer has expired' }, 400);
      }

      // Execute on-chain transfer
      try {
        const creds = await edb()?.get(`SELECT private_key_encrypted, funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
        if (!creds) { await edb()?.run(`UPDATE poly_transfer_requests SET status = 'failed', error = 'No wallet credentials', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, [txId]); return c.json({ error: 'No wallet configured' }, 400); }

        // Use ethers to send transaction
        let txHash = '';
        const decryptedKey = (() => { try { return vault.decrypt(creds.private_key_encrypted); } catch { return creds.private_key_encrypted; } })();
        try {
          const { Wallet, JsonRpcProvider } = await importSDK('ethers');
          const provider = new JsonRpcProvider('https://polygon.drpc.org');
          const wallet = new Wallet(decryptedKey, provider);
          if (tx.token === 'MATIC') {
            const sendTx = await wallet.sendTransaction({ to: tx.to_address, value: BigInt(Math.floor(tx.amount * 1e18)).toString() });
            txHash = sendTx.hash;
          } else {
            // USDC transfer (ERC-20)
            const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
            const iface = new (await importSDK('ethers')).Interface(['function transfer(address to, uint256 amount) returns (bool)']);
            const data = iface.encodeFunctionData('transfer', [tx.to_address, BigInt(Math.floor(tx.amount * 1e6)).toString()]);
            const sendTx = await wallet.sendTransaction({ to: USDC_POLYGON, data });
            txHash = sendTx.hash;
          }
        } catch (ethersErr: any) {
          // Fallback: try ethers v5
          try {
            const { Wallet: W5 } = await importSDK('@ethersproject/wallet');
            const { JsonRpcProvider: P5 } = await importSDK('@ethersproject/providers');
            const { Contract: C5 } = await importSDK('@ethersproject/contracts');
            const provider5 = new P5('https://polygon.drpc.org');
            const wallet5 = new W5(decryptedKey, provider5);
            if (tx.token === 'MATIC') {
              const sendTx = await wallet5.sendTransaction({ to: tx.to_address, value: (BigInt(Math.floor(tx.amount * 1e18))).toString() });
              txHash = sendTx.hash;
            } else {
              const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
              const usdc = new C5(USDC_POLYGON, ['function transfer(address to, uint256 amount) returns (bool)'], wallet5);
              const sendTx = await usdc.transfer(tx.to_address, (BigInt(Math.floor(tx.amount * 1e6))).toString());
              txHash = sendTx.hash;
            }
          } catch (v5Err: any) {
            throw new Error(`Transfer execution failed: ${ethersErr.message}. Fallback: ${v5Err.message}`);
          }
        }

        // Update transfer record
        await edb()?.run(`UPDATE poly_transfer_requests SET status = 'completed', approved_by = ?, tx_hash = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, [c.get('userId' as any), txHash, txId]);
        // Update daily tracking
        const today = new Date().toISOString().slice(0, 10);
        await edb()?.run(
          `INSERT INTO poly_transfer_daily (agent_id, address, date, total_transferred, tx_count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(agent_id, address, date) DO UPDATE SET total_transferred = total_transferred + ?, tx_count = tx_count + 1`,
          [agentId, tx.to_address, today, tx.amount, tx.amount]
        );
        // Audit
        try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.transfer_approved', resourceType: 'agent', resourceId: agentId, details: { amount: tx.amount, token: tx.token, to: tx.to_address, label: tx.to_label, txHash }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
        return c.json({ success: true, txHash, status: 'completed' });
      } catch (execErr: any) {
        await edb()?.run(`UPDATE poly_transfer_requests SET status = 'failed', error = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, [execErr.message, txId]);
        try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.transfer_failed', resourceType: 'agent', resourceId: agentId, details: { amount: tx.amount, error: execErr.message }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
        return c.json({ error: 'Transfer execution failed: ' + execErr.message }, 500);
      }
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/:agentId/transfers/:txId/reject', requireRole('owner'), async (c) => {
    try {
      const txId = c.req.param('txId');
      const agentId = c.req.param('agentId');
      const body = await c.req.json().catch(() => ({}));
      await edb()?.run(`UPDATE poly_transfer_requests SET status = 'rejected', approved_by = ?, error = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND agent_id = ?`,
        [c.get('userId' as any), body.reason || 'Rejected by owner', txId, agentId]);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.transfer_rejected', resourceType: 'agent', resourceId: agentId, details: { txId, reason: body.reason }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Wallet Security: 2FA/PIN for transfers ──────────────
  api.get('/polymarket/:agentId/wallet/security-status', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const userId = c.get('userId' as any);
      // Check if user has 2FA enabled
      const user = await db.getUser(userId);
      const has2fa = !!(user as any)?.totpEnabled;
      // Check if wallet PIN exists for this agent
      const pinRow = await edb()?.get(`SELECT id FROM poly_wallet_pins WHERE agent_id = ?`, [agentId]) as any;
      const hasPin = !!pinRow;
      return c.json({ has2fa, hasPin });
    } catch (e: any) { return c.json({ has2fa: false, hasPin: false }); }
  });

  api.post('/polymarket/:agentId/wallet/setup-pin', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      // Sanitize: extract pin, coerce to string, strip non-digits
      const rawPin = String(body?.pin ?? '').replace(/\D/g, '').slice(0, 6);
      if (!rawPin || rawPin.length !== 6) return c.json({ error: 'PIN must be exactly 6 digits' }, 400);
      // Reject trivial PINs
      if (/^(.)\1{5}$/.test(rawPin) || rawPin === '123456' || rawPin === '654321') {
        return c.json({ error: 'PIN is too simple. Choose a less predictable 6-digit PIN.' }, 400);
      }
      // Encrypt PIN using the shared vault instance (same key used for wallet credentials)
      const crypto = await import('node:crypto');
      const encryptedPin = vault.encrypt(rawPin);
      // Ensure table exists (cross-DB compatible)
      await edb()?.run(`CREATE TABLE IF NOT EXISTS poly_wallet_pins (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL UNIQUE, encrypted_pin TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      // Upsert — ON CONFLICT works on both SQLite 3.24+ and Postgres
      const id = crypto.randomUUID();
      await edb()?.run(
        `INSERT INTO poly_wallet_pins (id, agent_id, encrypted_pin, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (agent_id) DO UPDATE SET encrypted_pin = ?, updated_at = CURRENT_TIMESTAMP`,
        [id, agentId, encryptedPin, encryptedPin]);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.pin_setup', resourceType: 'agent', resourceId: agentId, details: {}, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
      return c.json({ ok: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/:agentId/wallet/verify-transfer', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      const method = String(body?.method ?? '');
      const code = String(body?.code ?? '').replace(/\D/g, '').slice(0, 6);
      if (!code || code.length !== 6) return c.json({ ok: false, error: 'Code must be exactly 6 digits' }, 400);
      if (method === '2fa') {
        const userId = c.get('userId' as any);
        const user = await db.getUser(userId) as any;
        if (!user?.totpSecret) return c.json({ ok: false, error: '2FA not set up' }, 400);
        // Verify TOTP
        const crypto = await import('node:crypto');
        const epoch = Math.floor(Date.now() / 30000);
        let valid = false;
        for (let i = -1; i <= 1; i++) {
          const counter = epoch + i;
          const buf = Buffer.alloc(8);
          buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
          buf.writeUInt32BE(counter & 0xFFFFFFFF, 4);
          let secret = user.totpSecret;
          // Decode base32
          const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
          let bits = '', bytes: number[] = [];
          for (const ch of secret.toUpperCase().replace(/=+$/, '')) {
            const val = base32chars.indexOf(ch);
            if (val >= 0) bits += val.toString(2).padStart(5, '0');
          }
          for (let b = 0; b + 8 <= bits.length; b += 8) bytes.push(parseInt(bits.slice(b, b + 8), 2));
          const keyBuf = Buffer.from(bytes);
          const hmac = crypto.createHmac('sha1', keyBuf).update(buf).digest();
          const offset = hmac[hmac.length - 1] & 0xf;
          const otp = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
          if (otp.toString().padStart(6, '0') === code) { valid = true; break; }
        }
        if (!valid) return c.json({ ok: false, error: 'Invalid 2FA code' }, 401);
        try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.2fa_verified', resourceType: 'agent', resourceId: agentId, details: {}, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
        return c.json({ ok: true });
      } else if (method === 'pin') {
        const pinRow = await edb()?.get(`SELECT encrypted_pin FROM poly_wallet_pins WHERE agent_id = ?`, [agentId]) as any;
        if (!pinRow) return c.json({ ok: false, error: 'No wallet PIN set up' }, 400);
        // Decrypt and verify using the shared vault instance
        const decrypted = vault.decrypt(pinRow.encrypted_pin);
        if (decrypted !== code) return c.json({ ok: false, error: 'Invalid PIN' }, 401);
        try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.pin_verified', resourceType: 'agent', resourceId: agentId, details: {}, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
        return c.json({ ok: true });
      }
      return c.json({ ok: false, error: 'Invalid verification method' }, 400);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/:agentId/wallet/swap', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const { direction, amount } = await c.req.json();
      if (!direction || !amount || amount <= 0) return c.json({ error: 'Invalid swap parameters' }, 400);

      // Load wallet credentials
      const creds = await edb()?.get(`SELECT private_key_encrypted, funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!creds?.funder_address) return c.json({ error: 'No wallet configured' }, 404);

      const decryptedKey = (() => { try { return vault.decrypt(creds.private_key_encrypted); } catch { return creds.private_key_encrypted; } })();

      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.swap_initiated', resourceType: 'agent', resourceId: agentId, details: { direction, amount }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}

      // Direct on-chain swap via Uniswap V3 — no agent/LLM needed
      const { Wallet, JsonRpcProvider, Contract } = await import('ethers');
      const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
      const USDC_BRIDGED = USDC_E_SHARED;
      const SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'; // Uniswap V3 SwapRouter02

      // Connect to Polygon with RPC fallback
      let provider: any = null;
      for (const rpc of ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com']) {
        try { provider = new JsonRpcProvider(rpc); await provider.getNetwork(); break; } catch { provider = null; }
      }
      if (!provider) return c.json({ error: 'Cannot connect to Polygon RPC' }, 502);

      const wallet = new Wallet(decryptedKey, provider);

      const erc20Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function approve(address,uint256) returns (bool)',
        'function allowance(address,address) view returns (uint256)',
      ];
      const swapRouterAbi = [
        'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
      ];

      const tokenIn = direction === 'native_to_bridged' ? USDC_NATIVE : USDC_BRIDGED;
      const tokenOut = direction === 'native_to_bridged' ? USDC_BRIDGED : USDC_NATIVE;
      const tokenContract = new Contract(tokenIn, erc20Abi, wallet);

      // Check balance
      const balance = await tokenContract.balanceOf(wallet.address);
      if (balance === BigInt(0)) {
        return c.json({ error: direction === 'native_to_bridged' ? 'No native USDC to swap' : 'No USDC.e to swap' }, 400);
      }

      let swapAmount = BigInt(Math.floor(amount * 1e6));
      if (swapAmount > balance) swapAmount = balance;
      const swapUSD = (Number(swapAmount) / 1e6).toFixed(2);

      // Approve router if needed
      const currentAllowance = await tokenContract.allowance(wallet.address, SWAP_ROUTER);
      if (currentAllowance < swapAmount) {
        const approveTx = await tokenContract.approve(SWAP_ROUTER, '115792089237316195423570985008687907853269984665640564039457584007913129639935');
        await approveTx.wait();
      }

      // Execute swap with fee tier fallback (0.01% → 0.05%)
      const router = new Contract(SWAP_ROUTER, swapRouterAbi, wallet);
      let receipt: any;
      let feeTier = '0.01%';

      // Helper: wait for tx with RPC retry (Polygon RPCs flake on getTransactionReceipt)
      const waitWithRetry = async (tx: any, retries = 3) => {
        for (let attempt = 0; attempt < retries; attempt++) {
          try { return await tx.wait(); } catch (waitErr: any) {
            if (attempt === retries - 1) throw waitErr;
            // Temporary RPC error — retry with fresh provider
            if (waitErr.code === 'UNKNOWN_ERROR' || waitErr.message?.includes('Temporary internal error')) {
              await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
              continue;
            }
            throw waitErr;
          }
        }
      };

      try {
        const minOut = swapAmount * BigInt(995) / BigInt(1000); // 0.5% slippage
        const tx = await router.exactInputSingle({
          tokenIn, tokenOut, fee: 100, recipient: wallet.address,
          amountIn: swapAmount, amountOutMinimum: minOut, sqrtPriceLimitX96: BigInt(0),
        });
        receipt = await waitWithRetry(tx);
      } catch (swapErr: any) {
        if (swapErr.message?.includes('revert') || swapErr.message?.includes('STF') || swapErr.message?.includes('Too little received')) {
          const minOut = swapAmount * BigInt(990) / BigInt(1000); // 1% slippage
          const tx = await router.exactInputSingle({
            tokenIn, tokenOut, fee: 500, recipient: wallet.address,
            amountIn: swapAmount, amountOutMinimum: minOut, sqrtPriceLimitX96: BigInt(0),
          });
          receipt = await waitWithRetry(tx);
          feeTier = '0.05%';
        } else {
          throw swapErr;
        }
      }

      // Get new balance of output token
      const outContract = new Contract(tokenOut, ['function balanceOf(address) view returns (uint256)'], provider);
      const newBal = await outContract.balanceOf(wallet.address);
      const label = direction === 'native_to_bridged' ? 'Native USDC → USDC.e' : 'USDC.e → Native USDC';

      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.swap_completed', resourceType: 'agent', resourceId: agentId, details: { direction, amount: swapUSD, txHash: receipt.hash, feeTier }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}

      return c.json({
        ok: true,
        message: `Swapped $${swapUSD} ${label}`,
        txHash: receipt.hash,
        feeTier,
        newBalance: (Number(newBal) / 1e6).toFixed(2),
      });
    } catch (e: any) { return c.json({ error: `Swap failed: ${e.message}` }, 500); }
  });

  // ── Redeem winning positions — direct on-chain, no LLM needed ──
  api.post('/polymarket/:agentId/wallet/redeem', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json().catch(() => ({}));
      const conditionId = body.condition_id;

      // Load wallet credentials
      const creds = await edb()?.get(`SELECT private_key_encrypted, funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!creds?.funder_address) return c.json({ error: 'No wallet configured' }, 404);
      const decryptedKey = (() => { try { return vault.decrypt(creds.private_key_encrypted); } catch { return creds.private_key_encrypted; } })();

      // Fetch redeemable positions from Polymarket Data API
      const posRes = await fetch(`https://data-api.polymarket.com/positions?user=${creds.funder_address}&sizeThreshold=0`);
      const positions = await posRes.json();
      const redeemable = (positions as any[]).filter((pos: any) => pos.redeemable === true);
      if (!redeemable.length) return c.json({ ok: true, status: 'nothing_to_redeem', message: 'No redeemable positions found.' });

      // Filter by condition_id if specified, otherwise redeem all
      const toRedeem = conditionId
        ? redeemable.filter((pos: any) => pos.conditionId === conditionId)
        : redeemable;
      if (!toRedeem.length) return c.json({ error: `No redeemable position found for condition ${conditionId}` }, 404);

      // Connect to Polygon
      const { Wallet, JsonRpcProvider, Contract } = await import('ethers');
      const CTF = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
      const CTF_ABI = ['function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external'];

      let provider: any = null;
      for (const rpc of ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com']) {
        try { provider = new JsonRpcProvider(rpc); await provider.getNetwork(); break; } catch { provider = null; }
      }
      if (!provider) return c.json({ error: 'Cannot connect to Polygon RPC' }, 502);

      const wallet = new Wallet(decryptedKey, provider);
      const ctf = new Contract(CTF, CTF_ABI, wallet);
      const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';

      const results: any[] = [];
      for (const pos of toRedeem) {
        try {
          const indexSets = pos.negativeRisk ? [1] : [1, 2];
          const tx = await ctf.redeemPositions(USDC_E_SHARED, parentCollectionId, pos.conditionId, indexSets, { gasLimit: 300000 });
          const receipt = await tx.wait();

          // Update trade log (best effort)
          try {
            await edb()?.run(`UPDATE poly_trade_log SET status = 'redeemed', pnl = ? WHERE token_id = ? AND agent_id = ? AND status != 'redeemed'`,
              [pos.cashPnl || 0, pos.asset, agentId]);
          } catch {}

          results.push({ title: pos.title, outcome: pos.outcome, conditionId: pos.conditionId, shares: pos.size, value: pos.currentValue, profit: pos.cashPnl, txHash: receipt.hash, status: 'redeemed' });
        } catch (e: any) {
          results.push({ title: pos.title, conditionId: pos.conditionId, status: 'failed', error: e.message });
        }
      }

      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.redeem', resourceType: 'agent', resourceId: agentId, details: { redeemed: results.filter(r => r.status === 'redeemed').length, failed: results.filter(r => r.status === 'failed').length }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}

      return c.json({
        ok: true,
        redeemed: results.filter(r => r.status === 'redeemed').length,
        failed: results.filter(r => r.status === 'failed').length,
        total_value: results.filter(r => r.status === 'redeemed').reduce((s, r) => s + (r.value || 0), 0),
        total_profit: results.filter(r => r.status === 'redeemed').reduce((s, r) => s + (r.profit || 0), 0),
        details: results,
      });
    } catch (e: any) { return c.json({ error: `Redeem failed: ${e.message}` }, 500); }
  });

  api.post('/polymarket/:agentId/wallet/transfer', requireRole('owner'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const { to_address, amount, token, reason } = await c.req.json();
      if (!to_address || !amount || amount <= 0) return c.json({ error: 'Invalid transfer parameters' }, 400);
      // Verify address is whitelisted
      const wl = await edb()?.get(`SELECT id, label, per_tx_limit, daily_limit, cooling_until FROM poly_whitelisted_addresses WHERE agent_id = ? AND address = ?`, [agentId, to_address]) as any;
      if (wl && wl.cooling_until && new Date(wl.cooling_until) > new Date()) return c.json({ error: 'Address is still in cooling period until ' + wl.cooling_until }, 403);
      if (!wl) return c.json({ error: 'Address not whitelisted or still in cooling period' }, 403);
      if (wl.per_tx_limit && amount > wl.per_tx_limit) return c.json({ error: `Exceeds per-transaction limit of $${wl.per_tx_limit}` }, 400);
      // Check daily limit
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const todayTotal = await edb()?.get(`SELECT COALESCE(SUM(amount), 0) as total FROM poly_transfer_requests WHERE agent_id = ? AND to_address = ? AND status = 'completed' AND created_at > ?`, [agentId, to_address, oneDayAgo]) as any;
      if (wl.daily_limit && (todayTotal?.total || 0) + amount > wl.daily_limit) return c.json({ error: `Exceeds daily limit of $${wl.daily_limit}` }, 400);
      // Create transfer request
      const crypto = await import('node:crypto');
      const txId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 4 * 3600000).toISOString();
      await edb()?.run(`INSERT INTO poly_transfer_requests (id, agent_id, whitelist_id, to_address, to_label, amount, token, reason, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?)`,
        [txId, agentId, wl.id, to_address, wl.label, amount, token || 'USDC.e', reason || '', expiresAt]);
      try { await (db as any).createAuditLog({ userId: c.get('userId' as any), action: 'wallet.transfer_created', resourceType: 'agent', resourceId: agentId, details: { txId, to_address, amount, token, reason }, ipAddress: c.req.header('x-forwarded-for') || 'unknown' }); } catch {}
      return c.json({ ok: true, txId, message: `Transfer of ${amount} ${token || 'USDC.e'} to ${wl.label} submitted. Awaiting execution.` });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Balance cache to prevent flickering when RPC calls fail
  const balanceCache = new Map<string, { usdc: number; usdce?: number; usdcNative?: number; matic: number; ts: number }>();

  // Get live wallet balance from Polymarket + Polygon
  api.get('/polymarket/:agentId/wallet/balance', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const row = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!row?.funder_address) return c.json({ error: 'No wallet configured' }, 404);
      const address = row.funder_address;

      // Parallel fetch: USDC.e (bridged) + USDC (native) + POL balance
      const USDC_E_CONTRACT = USDC_E_SHARED;
      const USDC_NATIVE_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC — NOT directly usable on Polymarket
      const POLYGON_RPCS = ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'];
      const addrHex = address.slice(2).toLowerCase();
      const balanceOfData = '0x70a08231000000000000000000000000' + addrHex;
      const safeBigInt = (hex: string): bigint => { try { return hex && hex.length > 2 ? BigInt(hex) : 0n; } catch { return 0n; } };

      // Try each RPC until we get a valid balance response (not just a ping)
      let usdceRes: any = null, usdcNativeRes: any = null, maticRes: any = null;
      let rpcSuccess = false;
      for (const rpc of POLYGON_RPCS) {
        try {
          const [r1, r2, r3] = await Promise.all([
            fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [
                { to: USDC_E_CONTRACT, data: balanceOfData }, 'latest'
              ] }),
              signal: AbortSignal.timeout(5000),
            }).then(r => r.json()).catch(() => null),
            fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_call', params: [
                { to: USDC_NATIVE_CONTRACT, data: balanceOfData }, 'latest'
              ] }),
              signal: AbortSignal.timeout(5000),
            }).then(r => r.json()).catch(() => null),
            fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_getBalance', params: [address, 'latest'] }),
              signal: AbortSignal.timeout(5000),
            }).then(r => r.json()).catch(() => null),
          ]);
          // Check if at least USDC.e returned a valid result (primary balance)
          if (r1?.result && !r1.error) {
            usdceRes = r1; usdcNativeRes = r2; maticRes = r3;
            rpcSuccess = true;
            break;
          }
        } catch {}
      }

      const cached = balanceCache.get(address);

      // Start with cached values as fallback (don't default to 0)
      let usdceBalance = cached?.usdce ?? 0;
      let usdcNativeBalance = cached?.usdcNative ?? 0;
      let maticBalance = cached?.matic ?? 0;

      if (usdceRes?.result && !usdceRes.error) {
        usdceBalance = Number(safeBigInt(usdceRes.result)) / 1e6;
      }
      if (usdcNativeRes?.result && !usdcNativeRes.error) {
        usdcNativeBalance = Number(safeBigInt(usdcNativeRes.result)) / 1e6;
      }
      if (maticRes?.result && !maticRes.error) {
        maticBalance = Number(safeBigInt(maticRes.result)) / 1e18;
      }

      // Fetch exchange balance (funds deposited to Polymarket exchange for trading)
      // Read creds directly from edb() and create a minimal ClobClient inline —
      // avoids getClobClient's saveWalletCredentials which breaks Postgres $N param reuse
      let exchangeBalance = 0;
      try {
        const e = edb();
        const creds = e ? await e.get(
          `SELECT private_key_encrypted, funder_address, signature_type, api_key, api_secret, api_passphrase FROM poly_wallet_credentials WHERE agent_id = ?`,
          [agentId]
        ) as any : null;
        if (creds?.api_key && creds?.private_key_encrypted) {
          const dec = (v: string) => { try { return vault?.decrypt?.(v) || v; } catch { return v; } };
          const { ensureSDK, importSDK } = await import('../agent-tools/tools/polymarket-runtime.js');
          const sdk = await ensureSDK();
          if (sdk.ready) {
            const { ClobClient } = await importSDK('@polymarket/clob-client');
            const { Wallet } = await importSDK('@ethersproject/wallet');
            const signer = new Wallet(dec(creds.private_key_encrypted));
            const client = new ClobClient(
              'https://clob.polymarket.com', 137, signer,
              { apiKey: dec(creds.api_key), secret: dec(creds.api_secret), passphrase: dec(creds.api_passphrase) },
              creds.signature_type || 0,
              creds.funder_address || signer.address,
            );
            const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
            exchangeBalance = Number(bal.balance || 0) / 1e6;
          }
        }
      } catch (exchErr: any) {
        console.warn(`[wallet-balance] Exchange balance fetch failed: ${exchErr?.message}`);
      }

      // Log RPC results for debugging balance issues
      if (!rpcSuccess) {
        console.log(`[wallet-balance] All RPCs failed for ${address.slice(0, 10)}... — using ${cached ? 'cached' : 'zero'} values`);
      }

      // Only cache when RPC actually returned data — never overwrite good cache with zeros from failed RPCs
      if (rpcSuccess) {
        balanceCache.set(address, { usdce: usdceBalance, usdcNative: usdcNativeBalance, usdc: usdceBalance + usdcNativeBalance, matic: maticBalance, ts: Date.now() });
      }

      // Get open positions from Polymarket Data API for accurate portfolio values
      const paperPos = await edb()?.all(`SELECT SUM(entry_price * size) as total_invested, COUNT(*) as open_count FROM poly_paper_positions WHERE agent_id = ? AND closed = 0`, [agentId]) as any[] || [];
      const pp = paperPos[0] || { total_invested: 0, open_count: 0 };

      let liveInvested = 0, liveCurrentValue = 0, liveCount = 0, livePnl = 0;
      try {
        const posResp = await fetch(`https://data-api.polymarket.com/positions?user=${address}`);
        const posData = await posResp.json();
        if (Array.isArray(posData)) {
          for (const p of posData) {
            if (parseFloat(p.size) <= 0) continue;
            liveInvested += parseFloat(p.initialValue) || 0;
            liveCurrentValue += parseFloat(p.currentValue) || 0;
            livePnl += parseFloat(p.cashPnl) || 0;
            liveCount++;
          }
        }
      } catch {}

      const pos = {
        total_invested: (Number(pp.total_invested) || 0) + liveInvested,
        current_value: liveCurrentValue,
        pnl: livePnl,
        open_count: (Number(pp.open_count) || 0) + liveCount,
      };

      const totalUsdc = usdceBalance + usdcNativeBalance;
      const needsSwap = usdceBalance < 1 && usdcNativeBalance > 1;

      return c.json({
        address,
        balances: {
          usdc: +totalUsdc.toFixed(6),
          usdce: +usdceBalance.toFixed(6),
          usdcNative: +usdcNativeBalance.toFixed(6),
          matic: +maticBalance.toFixed(6),
          exchange: +exchangeBalance.toFixed(6),
        },
        needsSwap,
        portfolio: {
          investedValue: +pos.total_invested.toFixed(2),
          currentValue: +pos.current_value.toFixed(2),
          pnl: +pos.pnl.toFixed(2),
          openPositions: pos.open_count || 0,
          totalValue: +pos.current_value.toFixed(2),
        },
        network: 'Polygon',
        depositAddress: address,
        depositInstructions: 'Send USDC.e (bridged USDC) on Polygon network to ' + address,
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // On-chain transaction history — real USDC wallet transfers
  api.get('/polymarket/:agentId/wallet/transactions', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const row = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      if (!row?.funder_address) return c.json({ error: 'No wallet configured' }, 404);
      const address = row.funder_address.toLowerCase();
      const page = parseInt(c.req.query('page') || '1');
      const pageSize = parseInt(c.req.query('pageSize') || '25');

      const RPC = 'https://polygon-bor-rpc.publicnode.com';
      const USDC_BRIDGED = USDC_E_SHARED;
      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const addrPadded = '0x000000000000000000000000' + address.slice(2);

      // Get current block
      const blockRes = await fetch(RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
      }).then(r => r.json()).catch(() => ({ result: '0x0' }));
      const currentBlock = parseInt(blockRes?.result || '0x0', 16);

      // Scan 50k-block chunks, up to 500k blocks back (~6 days on Polygon)
      const allLogs: any[] = [];
      const maxScan = 500000;
      const chunkSize = 49999;

      const fetches: Promise<void>[] = [];
      for (let to = currentBlock; to > currentBlock - maxScan; to -= chunkSize) {
        const fromBlock = Math.max(currentBlock - maxScan, to - chunkSize);
        const toBlock = to;
        const fromHex = '0x' + fromBlock.toString(16);
        const toHex = '0x' + toBlock.toString(16);

        fetches.push(
          Promise.all([
            fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: fromHex, toBlock: toHex, address: USDC_BRIDGED, topics: [TRANSFER_TOPIC, null, addrPadded] }] })
            }).then(r => r.json()).then(d => { if (d?.result) allLogs.push(...d.result.map((l: any) => ({ ...l, direction: 'in' }))); }).catch(() => {}),
            fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: fromHex, toBlock: toHex, address: USDC_BRIDGED, topics: [TRANSFER_TOPIC, addrPadded, null] }] })
            }).then(r => r.json()).then(d => { if (d?.result) allLogs.push(...d.result.map((l: any) => ({ ...l, direction: 'out' }))); }).catch(() => {}),
          ]).then(() => {})
        );
      }
      await Promise.all(fetches);

      // Parse logs into transactions
      const transactions = allLogs.map((log: any) => {
        const from = '0x' + (log.topics[1] || '').slice(26);
        const to = '0x' + (log.topics[2] || '').slice(26);
        const rawValue = BigInt(log.data || '0x0');
        const value = Number(rawValue) / 1e6;
        const blockNum = parseInt(log.blockNumber || '0x0', 16);
        return {
          hash: log.transactionHash,
          type: 'erc20',
          token: 'USDC.e',
          from, to,
          value: +value.toFixed(6),
          direction: log.direction,
          timestamp: blockNum, // Will use block as sort key
          block: blockNum,
          gas: null,
          status: 'confirmed',
        };
      });

      // Sort by block desc
      transactions.sort((a, b) => b.block - a.block);

      // Try to get timestamps from blocks (batch the unique blocks)
      const uniqueBlocks = [...new Set(transactions.map(t => t.block))];
      const blockTimestamps: Record<number, number> = {};
      await Promise.all(uniqueBlocks.slice(0, 25).map(async (b) => {
        try {
          const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x' + b.toString(16), false] })
          }).then(r => r.json());
          if (res?.result?.timestamp) blockTimestamps[b] = parseInt(res.result.timestamp, 16) * 1000;
        } catch {}
      }));
      for (const tx of transactions) {
        if (blockTimestamps[tx.block]) tx.timestamp = blockTimestamps[tx.block];
      }

      return c.json({ address, transactions, page, pageSize, total: transactions.length, hasMore: transactions.length >= pageSize });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ── Archive System ──────────────────────────────────────────

  // Get archived data for a specific tab
  api.get('/polymarket/:agentId/archive/:tab', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const tab = c.req.param('tab');
      const e = edb();
      const limit = parseInt(c.req.query('limit') || '100');

      let tableName = '';
      if (tab === 'trades') tableName = 'poly_trade_log_archive';
      else if (tab === 'exits') tableName = 'poly_exit_rules_archive';
      else if (tab === 'alerts') tableName = 'poly_price_alerts_archive';
      else if (tab === 'events') tableName = 'poly_watcher_events_archive';
      else return c.json({ rows: [], total: 0, message: 'Unknown archive tab: ' + tab });

      // Check if archive table exists
      try {
        const rows = await e?.all(`SELECT * FROM ${tableName} WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`, [agentId, limit]) || [];
        const countRow = await e?.get(`SELECT COUNT(*) as cnt FROM ${tableName} WHERE agent_id = ?`, [agentId]) as any;
        return c.json({ rows, total: countRow?.cnt || rows.length });
      } catch {
        // Archive table doesn't exist yet — no archived data
        return c.json({ rows: [], total: 0, message: 'No archived data yet. Use the Archive action to move old data here.' });
      }
    } catch (e: any) { return c.json({ rows: [], total: 0, error: e.message }); }
  });

  // Create archive tables on first use (lazy init in the archive endpoint below)

  // Archive completed/closed data for a specific tab
  api.post('/polymarket/:agentId/archive', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const { tab } = await c.req.json();
      const e = edb();
      const results: Record<string, number> = {};

      // Lazy-create archive tables
      for (const t of ['poly_trade_log', 'poly_price_alerts', 'poly_watcher_events', 'poly_exit_rules', 'poly_watchers']) {
        await e?.run(`CREATE TABLE IF NOT EXISTS ${t}_archive (LIKE ${t} INCLUDING ALL)`).catch(() => {
          // Fallback for older Postgres or SQLite: create with same columns manually
        });
      }

      if (tab === 'trades' || tab === 'all') {
        // Archive non-active trades (filled, failed, rejected, cancelled, no_position, no_wallet)
        await e?.run(`
          INSERT INTO poly_trade_log_archive SELECT * FROM poly_trade_log 
          WHERE agent_id = $1 AND status NOT IN ('placed', 'pending')
        `, [agentId]).catch(() => {});
        await e?.run(`
          DELETE FROM poly_trade_log WHERE agent_id = $1 AND status NOT IN ('placed', 'pending')
        `, [agentId]).catch(() => {});

        // Also archive 'placed' trades for positions that no longer exist on-chain
        let closedCount = 0;
        try {
          const wallet = await e?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = $1`, [agentId]) as any;
          if (wallet?.funder_address) {
            const posResp = await fetch(`https://data-api.polymarket.com/positions?user=${wallet.funder_address}`);
            const posData = await posResp.json();
            const liveTokens = new Set(
              (Array.isArray(posData) ? posData : []).filter((p: any) => parseFloat(p.size) > 0).map((p: any) => p.asset)
            );
            // Get all placed trades
            const placedTrades = await e?.all(
              `SELECT id, token_id FROM poly_trade_log WHERE agent_id = $1 AND status = 'placed'`, [agentId]
            ) || [];
            const closedIds = (placedTrades as any[]).filter(t => !liveTokens.has(t.token_id)).map(t => t.id);
            if (closedIds.length > 0) {
              const placeholders = closedIds.map((_: any, i: number) => `$${i + 1}`).join(',');
              await e?.run(`INSERT INTO poly_trade_log_archive SELECT * FROM poly_trade_log WHERE id IN (${placeholders})`, closedIds).catch(() => {});
              const del = await e?.run(`DELETE FROM poly_trade_log WHERE id IN (${placeholders})`, closedIds).catch(() => ({ changes: 0 }));
              closedCount = (del as any)?.rowCount || (del as any)?.changes || 0;
            }
          }
        } catch {}
        results.trades = closedCount;
      }

      if (tab === 'alerts' || tab === 'all') {
        // Archive triggered alerts
        const moved = await e?.run(`
          INSERT INTO poly_price_alerts_archive SELECT * FROM poly_price_alerts 
          WHERE agent_id = $1 AND triggered = 1
        `, [agentId]).catch(() => ({ changes: 0 }));
        const deleted = await e?.run(`
          DELETE FROM poly_price_alerts WHERE agent_id = $1 AND triggered = 1
        `, [agentId]).catch(() => ({ changes: 0 }));
        results.alerts = (deleted as any)?.rowCount || (deleted as any)?.changes || 0;
      }

      if (tab === 'signals' || tab === 'all') {
        // Archive acknowledged watcher events
        const moved = await e?.run(`
          INSERT INTO poly_watcher_events_archive SELECT * FROM poly_watcher_events 
          WHERE agent_id = $1 AND acknowledged = 1
        `, [agentId]).catch(() => ({ changes: 0 }));
        const deleted = await e?.run(`
          DELETE FROM poly_watcher_events WHERE agent_id = $1 AND acknowledged = 1
        `, [agentId]).catch(() => ({ changes: 0 }));
        results.signals = (deleted as any)?.rowCount || (deleted as any)?.changes || 0;
      }

      if (tab === 'exits' || tab === 'all') {
        // Archive inactive exit rules
        const moved = await e?.run(`
          INSERT INTO poly_exit_rules_archive SELECT * FROM poly_exit_rules 
          WHERE agent_id = $1 AND status IN ('fired', 'cancelled', 'expired')
        `, [agentId]).catch(() => ({ changes: 0 }));
        const deleted = await e?.run(`
          DELETE FROM poly_exit_rules WHERE agent_id = $1 AND status IN ('fired', 'cancelled', 'expired')
        `, [agentId]).catch(() => ({ changes: 0 }));
        results.exits = (deleted as any)?.rowCount || (deleted as any)?.changes || 0;
      }

      if (tab === 'watchers' || tab === 'all') {
        // Archive paused/disabled watchers whose tokens no longer have positions
        // For 'all' tab: archive paused watchers. For 'watchers' tab: archive paused ones.
        await e?.run(`
          INSERT INTO poly_watchers_archive SELECT * FROM poly_watchers 
          WHERE agent_id = $1 AND status IN ('paused', 'disabled')
        `, [agentId]).catch(() => {});
        const deleted = await e?.run(`
          DELETE FROM poly_watchers WHERE agent_id = $1 AND status IN ('paused', 'disabled')
        `, [agentId]).catch(() => ({ changes: 0 }));
        results.watchers = (deleted as any)?.rowCount || (deleted as any)?.changes || 0;
      }

      return c.json({ status: 'ok', archived: results });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // View archived data
  api.get('/polymarket/:agentId/archive/:tab', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const tab = c.req.param('tab');
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const tableMap: Record<string, string> = {
        trades: 'poly_trade_log_archive',
        alerts: 'poly_price_alerts_archive',
        signals: 'poly_watcher_events_archive',
        exits: 'poly_exit_rules_archive',
        watchers: 'poly_watchers_archive',
      };
      const table = tableMap[tab];
      if (!table) return c.json({ error: 'Invalid tab' }, 400);
      const rows = await edb()?.all(`SELECT * FROM ${table} WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [agentId, limit, offset]) || [];
      const countRow = await edb()?.get(`SELECT COUNT(*) as cnt FROM ${table} WHERE agent_id = $1`, [agentId]) as any;
      return c.json({ rows, total: countRow?.cnt || 0 });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ── Performance Goals System ──────────────────────────────
  // (poly_goals table is now created in ensurePolyDB above)

  // List goals
  api.get('/polymarket/:agentId/goals', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_goals WHERE agent_id = ? ORDER BY created_at DESC`, [agentId]) || [];
      return c.json({ goals: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Create goal
  api.post('/polymarket/:agentId/goals', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      const id = 'goal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await edb()?.run(
        `INSERT INTO poly_goals (id, agent_id, name, type, period, target_value, notify_on_met, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, agentId, body.name, body.type, body.period || 'daily', body.target_value, body.notify_on_met !== false ? 1 : 0, 1]
      );
      return c.json({ id, status: 'created' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Update goal
  api.put('/polymarket/:agentId/goals/:goalId', requireRole('admin'), async (c) => {
    try {
      const { goalId } = c.req.param() as any;
      const body = await c.req.json();
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ['name', 'type', 'period', 'target_value', 'notify_on_met', 'enabled']) {
        if (body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(body[k]); }
      }
      if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);
      sets.push("updated_at = CURRENT_TIMESTAMP");
      vals.push(goalId);
      await edb()?.run(`UPDATE poly_goals SET ${sets.join(', ')} WHERE id = ?`, vals);
      return c.json({ status: 'updated' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Delete goal
  api.delete('/polymarket/:agentId/goals/:goalId', requireRole('admin'), async (c) => {
    try {
      const { goalId } = c.req.param() as any;
      await edb()?.run(`DELETE FROM poly_goals WHERE id = ?`, [goalId]);
      return c.json({ status: 'deleted' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Evaluate all goals for an agent (called by agent tool or on dashboard load)
  api.post('/polymarket/:agentId/goals/evaluate', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const goals = await edb()?.all(`SELECT * FROM poly_goals WHERE agent_id = ? AND enabled = 1`, [agentId]) as any[] || [];
      if (goals.length === 0) return c.json({ evaluated: 0, results: [] });

      // Gather current portfolio data
      const POLYGON_RPC = 'https://polygon.drpc.org';
      const USDC_CONTRACT = USDC_E_SHARED;
      const walletRow = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      let usdcBalance = 0;
      if (walletRow?.funder_address) {
        try {
          const balRes = await fetch(POLYGON_RPC, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [
              { to: USDC_CONTRACT, data: '0x70a08231000000000000000000000000' + walletRow.funder_address.slice(2).toLowerCase() }, 'latest'
            ] })
          }).then(r => r.json());
          usdcBalance = Number(BigInt(balRes?.result || '0x0')) / 1e6;
        } catch {}
      }

      // Get paper trading stats
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
      const monthStart = new Date(now.getTime() - 30 * 86400000).toISOString();

      const paperPositions = await edb()?.all(`SELECT * FROM poly_paper_positions WHERE agent_id = ?`, [agentId]) as any[] || [];
      const closedToday = paperPositions.filter((p: any) => p.closed && p.closed_at >= todayStart);
      const closedWeek = paperPositions.filter((p: any) => p.closed && p.closed_at >= weekStart);
      const closedMonth = paperPositions.filter((p: any) => p.closed && p.closed_at >= monthStart);
      const openPositions = paperPositions.filter((p: any) => !p.closed);

      const calcPnl = (positions: any[]) => positions.reduce((sum: number, p: any) => sum + (p.pnl || 0), 0);
      const calcWinRate = (positions: any[]) => {
        if (positions.length === 0) return 0;
        const wins = positions.filter((p: any) => (p.pnl || 0) > 0).length;
        return (wins / positions.length) * 100;
      };

      const invested = openPositions.reduce((s: number, p: any) => s + ((p.entry_price || 0) * (p.size || 0)), 0);
      const portfolioValue = usdcBalance + invested;

      // Count real trades from poly_trade_log (in addition to paper positions)
      const realTradesToday = await edb()?.get(
        `SELECT COUNT(*) as cnt FROM poly_trade_log WHERE agent_id = ? AND created_at::timestamptz > ?::timestamptz`,
        [agentId, todayStart]
      ).catch(() => ({ cnt: 0 })) as any;
      const realTradesWeek = await edb()?.get(
        `SELECT COUNT(*) as cnt FROM poly_trade_log WHERE agent_id = ? AND created_at::timestamptz > ?::timestamptz`,
        [agentId, weekStart]
      ).catch(() => ({ cnt: 0 })) as any;

      const paperTradesToday = closedToday.length + openPositions.filter((p: any) => p.created_at >= todayStart).length;
      const paperTradesWeek = closedWeek.length;

      // Metric lookup
      const metrics: Record<string, number> = {
        daily_pnl_pct: invested > 0 ? (calcPnl(closedToday) / invested) * 100 : 0,
        daily_pnl_usd: calcPnl(closedToday),
        weekly_pnl_pct: invested > 0 ? (calcPnl(closedWeek) / invested) * 100 : 0,
        weekly_pnl_usd: calcPnl(closedWeek),
        monthly_pnl_pct: invested > 0 ? (calcPnl(closedMonth) / invested) * 100 : 0,
        monthly_pnl_usd: calcPnl(closedMonth),
        win_rate: calcWinRate([...closedToday, ...closedWeek]),
        total_trades_today: Math.max(paperTradesToday, parseInt(realTradesToday?.cnt || '0')),
        total_trades_week: Math.max(paperTradesWeek, parseInt(realTradesWeek?.cnt || '0')),
        portfolio_value: portfolioValue,
        balance: usdcBalance,
        open_positions: openPositions.length,
        max_drawdown: 0, // TODO: calculate from PnL timeline
      };

      const results: any[] = [];
      for (const goal of goals) {
        // Map goal type to metric
        let currentValue = 0;
        const typeMap: Record<string, string> = {
          daily_pnl_pct: 'daily_pnl_pct', daily_pnl_usd: 'daily_pnl_usd',
          weekly_pnl_pct: 'weekly_pnl_pct', weekly_pnl_usd: 'weekly_pnl_usd',
          monthly_pnl_pct: 'monthly_pnl_pct', monthly_pnl_usd: 'monthly_pnl_usd',
          win_rate: 'win_rate', min_trades_daily: 'total_trades_today',
          min_trades_weekly: 'total_trades_week', portfolio_value: 'portfolio_value',
          max_drawdown: 'max_drawdown', balance_target: 'balance',
        };
        const metricKey = typeMap[goal.type] || goal.type;
        currentValue = metrics[metricKey] || 0;

        // For max_drawdown, goal is met when current is BELOW target (inverted)
        const isMaxType = goal.type === 'max_drawdown';
        const met = isMaxType ? (currentValue <= goal.target_value) : (currentValue >= goal.target_value);
        const wasMet = !!goal.met;
        const newStreak = met ? (goal.streak || 0) + 1 : 0;
        const bestStreak = Math.max(goal.best_streak || 0, newStreak);

        await edb()?.run(
          `UPDATE poly_goals SET current_value = ?, met = ?, streak = ?, best_streak = ?, times_met = times_met + ?, times_missed = times_missed + ?, last_evaluated = CAST(CURRENT_TIMESTAMP AS TEXT), met_at = CASE WHEN ? = 1 AND met = 0 THEN CAST(CURRENT_TIMESTAMP AS TEXT) ELSE met_at END, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = ?`,
          [currentValue, met ? 1 : 0, newStreak, bestStreak, (met && !wasMet) ? 1 : 0, (!met && wasMet) ? 1 : 0, met ? 1 : 0, goal.id]
        );

        const remaining = isMaxType ? 0 : Math.max(0, goal.target_value - currentValue);
        const progress = isMaxType ? (currentValue <= goal.target_value ? 100 : 0) : Math.min(100, goal.target_value > 0 ? (currentValue / goal.target_value) * 100 : 0);

        results.push({
          id: goal.id, name: goal.name, type: goal.type,
          target: goal.target_value, current: +currentValue.toFixed(4),
          met, justAchieved: met && !wasMet,
          remaining: +remaining.toFixed(4), progress: +progress.toFixed(1),
          streak: newStreak, bestStreak,
        });
      }

      return c.json({ evaluated: results.length, results, metrics });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // SSE price stream for watched markets
  api.get('/polymarket/:agentId/price-stream', requireRole('admin'), async (c) => {
    const agentId = c.req.param('agentId');
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
          catch { clearInterval(poll); }
        };
        send(JSON.stringify({ type: 'connected' }));

        // Poll Polymarket prices every 3 seconds for active positions
        const poll = setInterval(async () => {
          try {
            const e = edb();
            // Get active paper positions + live trades + alerts
            const paperRows = await e?.all(
              `SELECT DISTINCT token_id, market_question, side, entry_price, size FROM poly_paper_positions WHERE agent_id = ? AND closed = 0`, [agentId]
            ).catch(() => []) || [];
            // Live positions from Polymarket Data API (real on-chain)
            let liveTradeRows: any[] = [];
            const resolvedPrices: Record<string, number> = {}; // token_id → resolved price (1.0 for winner, 0 for loser)
            try {
              const wallet = await e?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]);
              if (wallet?.funder_address) {
                const posResp = await fetch(`https://data-api.polymarket.com/positions?user=${wallet.funder_address}&sizeThreshold=0`);
                const posData = await posResp.json();
                if (Array.isArray(posData)) {
                  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
                  liveTradeRows = posData.filter((p: any) => parseFloat(p.size) > 0).map((p: any) => {
                    // If position is redeemable or curPrice is exactly 0 or 1, it's resolved
                    const curPrice = parseFloat(p.curPrice) || 0;
                    const isResolved = p.redeemable || curPrice === 1 || curPrice === 0;
                    if (isResolved) {
                      resolvedPrices[p.asset] = curPrice;
                    }
                    return {
                      token_id: p.asset,
                      conditionId: p.conditionId || '',
                      market_question: p.title || 'Unknown',
                      outcome: p.outcome || '',
                      side: 'BUY',
                      entry_price: parseFloat(p.avgPrice) || 0,
                      size: parseFloat(p.size) || 0,
                      redeemable: p.redeemable || false,
                      resolved_price: isResolved ? curPrice : undefined,
                      endDate: p.endDate || p.expirationDate || '',
                      isWon: isResolved && curPrice >= 0.99,
                      isLost: isResolved && curPrice <= 0.01,
                    };
                  }).filter((p: any) => {
                    // Auto-hide lost positions after 3 days (non-redeemable, resolved to 0)
                    if (p.isLost && !p.redeemable && p.endDate) {
                      const endTime = new Date(p.endDate).getTime();
                      if (!isNaN(endTime) && Date.now() - endTime > THREE_DAYS_MS) return false;
                    }
                    return true;
                  });
                }
              }
            } catch {
              // Fallback to trade log netted
              const rawRows = await e?.all(
                `SELECT token_id, market_question, outcome, side, price as entry_price, size FROM poly_trade_log WHERE agent_id = ? AND status = 'placed' AND clob_order_id IS NOT NULL`, [agentId]
              ).catch(() => []) || [];
              const netMap = new Map<string, any>();
              for (const r of rawRows as any[]) {
                if (!netMap.has(r.token_id)) netMap.set(r.token_id, { ...r, size: 0, side: 'BUY' });
                const entry = netMap.get(r.token_id)!;
                entry.size += r.side === 'BUY' ? parseFloat(r.size) : -parseFloat(r.size);
              }
              liveTradeRows = Array.from(netMap.values()).filter((p: any) => p.size > 0.01);
            }
            const alertRows = await e?.all(
              `SELECT DISTINCT token_id, market_id FROM poly_price_alerts WHERE agent_id = ? AND triggered = 0`, [agentId]
            ).catch(() => []) || [];

            // Merge paper + live positions
            const allPositionRows = [...paperRows, ...liveTradeRows];

            if (allPositionRows.length === 0 && alertRows.length === 0) {
              send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
              return;
            }

            // Fetch current prices for all unique token IDs
            const tokenIds = [...new Set([...allPositionRows.map((r: any) => r.token_id), ...alertRows.map((r: any) => r.token_id)].filter(Boolean))];
            const prices: Record<string, number> = {};

            await Promise.all(tokenIds.map(async (tid: string) => {
              try {
                // Use resolved price from Data API if available (market ended)
                if (resolvedPrices[tid] !== undefined) {
                  prices[tid] = resolvedPrices[tid];
                  return;
                }
                const res = await fetch(`https://clob.polymarket.com/midpoint?token_id=${tid}`);
                const data = await res.json();
                prices[tid] = parseFloat(data?.mid || '0');
              } catch { /* skip */ }
            }));

            // Calculate P&L for each position (paper + live)
            const positions = allPositionRows.map((p: any) => {
              const currentPrice = prices[p.token_id] || p.entry_price;
              const pnl = p.side?.toLowerCase() === 'buy'
                ? (currentPrice - p.entry_price) * p.size
                : (p.entry_price - currentPrice) * p.size;
              // Use actual outcome from DB if available, otherwise derive from side
              const sideLower = (p.side || '').toLowerCase();
              const outcome = p.outcome
                ? p.outcome
                : (sideLower === 'buy' || sideLower === 'sell')
                  ? (sideLower === 'buy' ? 'YES' : 'NO')
                  : p.side;
              return {
                token_id: p.token_id,
                conditionId: p.conditionId || '',
                market: p.market_question,
                side: p.side,
                outcome: outcome,
                entry: p.entry_price,
                current: +currentPrice.toFixed(4),
                size: p.size,
                pnl: +pnl.toFixed(2),
                pnlPct: +((pnl / (p.entry_price * p.size)) * 100).toFixed(2),
                redeemable: p.redeemable || false,
                resolved: resolvedPrices[p.token_id] !== undefined,
                isWon: p.isWon || false,
                isLost: p.isLost || false,
                endDate: p.endDate || '',
              };
            });

            const totalPnl = positions.reduce((s: number, p: any) => s + p.pnl, 0);

            send(JSON.stringify({
              type: 'prices',
              positions,
              totalPnl: +totalPnl.toFixed(2),
              ts: Date.now(),
            }));
          } catch (err: any) {
            send(JSON.stringify({ type: 'error', message: err.message }));
          }
        }, 3000);

        c.req.raw.signal?.addEventListener('abort', () => { clearInterval(poll); });
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  });

  // Get alerts for an agent
  api.get('/polymarket/:agentId/alerts', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_price_alerts WHERE agent_id = ? ORDER BY created_at DESC`, [agentId]) || [];
      return c.json({ alerts: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Delete an alert
  api.delete('/polymarket/alerts/:alertId', requireRole('admin'), async (c) => {
    try {
      await edb()?.run(`DELETE FROM poly_price_alerts WHERE id = ?`, [c.req.param('alertId')]);
      return c.json({ status: 'ok' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get paper positions for an agent
  api.get('/polymarket/:agentId/paper', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_paper_positions WHERE agent_id = ? ORDER BY created_at DESC`, [agentId]) || [];
      return c.json({ positions: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Live positions (real trades with CLOB order IDs)
  api.get('/polymarket/:agentId/live-positions', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      // Get wallet address for this agent
      const wallet = await edb()?.get(
        `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]
      );
      const address = wallet?.funder_address;
      if (!address) return c.json({ positions: [] });

      // Fetch real positions from Polymarket Data API
      try {
        const resp = await fetch(`https://data-api.polymarket.com/positions?user=${address}`);
        const data = await resp.json();
        if (Array.isArray(data)) {
          const positions = data.filter((p: any) => parseFloat(p.size) > 0).map((p: any) => ({
            id: p.conditionId || p.asset,
            token_id: p.asset,
            market_question: p.title || 'Unknown',
            outcome: p.outcome || '',
            side: 'BUY',
            entry_price: parseFloat(p.avgPrice) || 0,
            size: parseFloat(p.size) || 0,
            current_price: parseFloat(p.curPrice) || 0,
            pnl: parseFloat(p.cashPnl) || 0,
            pnl_pct: parseFloat(p.percentPnl) || 0,
            initial_value: parseFloat(p.initialValue) || 0,
            current_value: parseFloat(p.currentValue) || 0,
            position_type: 'live',
            created_at: null,
          }));
          return c.json({ positions });
        }
      } catch (apiErr: any) {
        console.warn(`[live-positions] Data API failed, falling back to trade log: ${apiErr.message}`);
      }

      // Fallback: trade log — only use FILLED orders for position calculation
      const rows = await edb()?.all(
        `SELECT token_id, market_question, outcome, side, price as entry_price, size, created_at
         FROM poly_trade_log WHERE agent_id = ? AND status = 'filled' AND clob_order_id IS NOT NULL
         ORDER BY created_at DESC`, [agentId]
      ) || [];
      // Net positions by token_id
      const netMap = new Map<string, any>();
      for (const r of rows as any[]) {
        const key = r.token_id;
        if (!netMap.has(key)) netMap.set(key, { ...r, size: 0, side: 'BUY', position_type: 'live' });
        const entry = netMap.get(key)!;
        entry.size += r.side === 'BUY' ? parseFloat(r.size) : -parseFloat(r.size);
      }
      const positions = Array.from(netMap.values()).filter((p: any) => p.size > 0.01);
      return c.json({ positions });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Manual trade execution from dashboard
  api.post('/polymarket/:agentId/manual-trade', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      const { token_id, side, size, market_question, outcome } = body;
      if (!token_id || !side || !size) return c.json({ error: 'Missing token_id, side, or size' }, 400);
      if (!['BUY', 'SELL'].includes(side)) return c.json({ error: 'side must be BUY or SELL' }, 400);
      if (size < 1) return c.json({ error: 'Minimum size is 1 share' }, 400);

      // For BUY orders, validate against wallet balance
      if (side === 'BUY') {
        try {
          const walletRow = await edb()?.get(`SELECT address FROM poly_wallets WHERE agent_id = ?`, [agentId]) as any;
          if (walletRow?.address) {
            const USDC_E = USDC_E_SHARED;
            const balResp = await fetch(`https://polygon-bor-rpc.publicnode.com`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: USDC_E, data: '0x70a08231000000000000000000000000' + walletRow.address.slice(2) }, 'latest'] }),
              signal: AbortSignal.timeout(6000),
            });
            const balData = await balResp.json();
            const usdcBal = parseInt(balData?.result || '0', 16) / 1e6;
            // Quick cost estimate: price * size
            const midResp2 = await fetch(`https://clob.polymarket.com/midpoint?token_id=${token_id}`, { signal: AbortSignal.timeout(6000) });
            const midData2 = await midResp2.json();
            const estPrice = parseFloat(midData2?.mid || '0');
            if (estPrice > 0 && estPrice * size > usdcBal) {
              return c.json({ error: `Insufficient funds: need $${(estPrice * size).toFixed(2)} but wallet has $${usdcBal.toFixed(2)} USDC` }, 400);
            }
          }
        } catch {} // Don't block trade if balance check fails
      }

      // Get current midpoint price
      const midResp = await fetch(`https://clob.polymarket.com/midpoint?token_id=${token_id}`, { signal: AbortSignal.timeout(8000) });
      const midData = await midResp.json();
      const price = parseFloat(midData?.mid || '0');
      if (!price) return c.json({ error: 'Could not fetch current price' }, 400);

      const tradeId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const e = edb();
      // The polymarket tools use $N-style params which can be REUSED (e.g. ON CONFLICT SET col=$2).
      // edb() converts ?→$N internally, which breaks reused params (15 ?'s but 8 values).
      // Use rawQuery/rawExec which pass $N params directly to Postgres without conversion.
      const dbIface = {
        execute: async (sql: string, params?: any[]) => (e as any)?.rawExec?.(sql, params) || e?.run(sql.replace(/\$(\d+)/g, '?'), params),
        query: async (sql: string, params?: any[]) => (e as any)?.rawQuery?.(sql, params) || e?.all(sql.replace(/\$(\d+)/g, '?'), params),
        get: async (sql: string, params?: any[]) => { const rows = await ((e as any)?.rawQuery?.(sql, params) || e?.all(sql.replace(/\$(\d+)/g, '?'), params)); return rows?.[0]; },
        getEngineDB: () => e,
      };

      // Verify wallet is accessible before attempting trade
      const testCreds = await e?.all('SELECT agent_id FROM poly_wallet_credentials WHERE agent_id = ?', [agentId]);
      if (!testCreds || testCreds.length === 0) {
        return c.json({ error: 'No wallet credentials found for this agent. Set up a wallet first.' }, 400);
      }

      console.log(`[manual-trade] ${side} ${size} shares, agent=${agentId}, token=${token_id.slice(0,12)}..., price=${price}`);

      // Clear cached CLOB client (may have failed previously with bad db wrapper)
      try {
        const { getClobClient } = await import('../agent-tools/tools/polymarket-runtime.js');
        // clientInstances is module-level cache — if it previously failed, it won't have an entry
        // so getClobClient will re-derive. Just verify it works now:
        const testClient = await (getClobClient as any)(agentId, dbIface);
        if (!testClient) {
          return c.json({ error: 'Could not initialize trading client. Check wallet setup and SDK.' }, 500);
        }
        console.log(`[manual-trade] CLOB client ready for ${agentId}`);
      } catch (preErr: any) {
        console.log(`[manual-trade] CLOB client error:`, preErr.message);
        return c.json({ error: 'Trading client error: ' + preErr.message }, 500);
      }

      const result = await executeOrder(agentId, dbIface, tradeId, {
        token_id, side, price, size,
        order_type: 'GTC',
        market_question: market_question || 'Manual trade',
        outcome: outcome || '',
        rationale: 'Manual trade from dashboard',
      }, 'manual_dashboard');

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log(`[manual-trade] Result status: ${parsed?.status || parsed?.error || 'unknown'}`, JSON.stringify(parsed).slice(0, 200));

      // If executeOrder returned an error status, surface it properly
      if (parsed?.status === 'no_wallet' || parsed?.status === 'error' || parsed?.error) {
        return c.json({ error: parsed?.message || parsed?.error || 'Trade failed: ' + (parsed?.status || 'unknown') }, 400);
      }
      return c.json({ status: 'ok', trade: parsed });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Search markets for manual trading — full screener analysis + orderbook
  api.get('/polymarket/markets/search', requireRole('admin'), async (c) => {
    try {
      const q = c.req.query('q') || '';
      const strategy = c.req.query('strategy') || 'best_opportunities';
      if (!q || q.length < 2) return c.json({ markets: [] });

      // Fetch from screener + direct Gamma search for maximum coverage
      const { screenMarkets } = await import('../polymarket-engines/screener.js');
      const { apiFetch, GAMMA_API } = await import('../polymarket-engines/shared.js');

      // Run screener and direct Gamma search in parallel
      // Note: /markets endpoint ignores search param — only use /events for keyword search
      const [result, directEvents] = await Promise.all([
        (screenMarkets as any)({ query: q, strategy, limit: 20, includeOrderbook: true }).catch(() => ({ markets: [], scanned: 0, qualified: 0 })),
        apiFetch(`${GAMMA_API}/events?search=${encodeURIComponent(q)}&active=true&closed=false&limit=50&order=volume&ascending=false`).catch(() => []),
      ]);
      const directMarkets: any[] = [];

      // Extract markets from events
      const eventMarkets: any[] = [];
      if (Array.isArray(directEvents)) {
        for (const ev of directEvents) {
          if (ev.markets && Array.isArray(ev.markets)) {
            for (const m of ev.markets) {
              if (m.active && !m.closed) eventMarkets.push(m);
            }
          }
        }
      }

      // Merge direct results as extra scored markets (with basic scoring)
      const screenerIds = new Set((result.markets || []).map((sm: any) => sm.market?.id || sm.market?.conditionId));
      const allDirect = [...(Array.isArray(directMarkets) ? directMarkets : []), ...eventMarkets];
      const { parseMarket } = await import('../polymarket-engines/shared.js');
      for (const raw of allDirect) {
        const pm = parseMarket(raw);
        if (!pm.active || pm.clobTokenIds.length === 0 || pm.liquidity < 1) continue;
        const key = pm.id;
        if (screenerIds.has(key)) continue;
        screenerIds.add(key);
        // Add with basic scores
        const yesP = pm.outcomePrices[0] || 0.5;
        result.markets.push({
          market: pm,
          scores: { total: Math.min(pm.liquidity / 100, 20) + Math.min(pm.volume / 10000, 20), liquidity: Math.min(pm.liquidity / 100, 20), volume: Math.min(pm.volume / 10000, 20), spread: 0, edge: 0, timing: 0, momentum: 0 },
          analysis: { overround: (yesP + (pm.outcomePrices[1] || 0.5) - 1) * 100, orderbook: null },
          recommendation: { action: 'watch', confidence: 0 },
        });
      }
      // Re-sort by score
      result.markets.sort((a: any, b: any) => (b.scores?.total || 0) - (a.scores?.total || 0));

      // Filter out garbage markets (low scores, extreme spreads, dead liquidity)
      const filtered = (result.markets || []).filter((sm: any) => {
        const spreadPct = sm.analysis?.orderbook?.spreadPct ?? 0;
        const liq = sm.market?.liquidity || 0;
        const prices = sm.market?.outcomePrices || [];
        // Kill extreme-price markets (Yes ≤1¢ or ≥99.5¢ = truly decided)
        const yesP = prices[0] || 0.5;
        if (yesP <= 0.01 || yesP >= 0.995) return false;
        // Kill markets with insane spread (>500%)
        if (spreadPct > 500) return false;
        // Kill truly dead markets (<$50 liquidity)
        if (liq < 50) return false;
        return true;
      });

      // Run unified pipeline on top results (quick depth: quant + onchain)
      const { quickAnalysis } = await import('../polymarket-engines/pipeline.js');
      const top10 = filtered.slice(0, 10).filter((sm: any) => sm.market?.clobTokenIds?.[0]);

      let pipelineResults: any[] = [];
      try {
        pipelineResults = await Promise.all(top10.map((sm: any) => {
          const m = sm.market || {};
          return quickAnalysis(m.clobTokenIds[0], m.question, 100).then(r => ({ ...r, tokenId: m.clobTokenIds[0] })).catch(() => null);
        }));
        pipelineResults = pipelineResults.filter(Boolean);
      } catch (pipeErr: any) {
        console.log('[pipeline] Error:', pipeErr.message);
      }

      // Index pipeline results by tokenId for lookup
      const pipelineMap = new Map<string, any>();
      for (const pr of pipelineResults) pipelineMap.set(pr.tokenId, pr);

      // Transform screener output to frontend format
      const markets = filtered.map((sm: any) => {
        const m = sm.market || {};
        const tokens = m.clobTokenIds || [];
        const outcomes = m.outcomes || ['Yes', 'No'];
        const prices: Record<string, number> = {};
        const spread: Record<string, any> = {};
        for (let i = 0; i < outcomes.length; i++) {
          prices[outcomes[i]] = m.outcomePrices?.[i] || 0;
          const ob = sm.analysis?.orderbook;
          if (ob && i === 0) {
            spread[outcomes[i]] = { bid: ob.bestBid || 0, ask: ob.bestAsk || 0, depth: Math.min(ob.bidDepth5 || 0, ob.askDepth5 || 0) };
            // Compute complementary spread for second outcome
            if (outcomes[1]) spread[outcomes[1]] = { bid: 1 - (ob.bestAsk || 1), ask: 1 - (ob.bestBid || 0), depth: spread[outcomes[0]].depth };
          }
        }
        return {
          id: m.id, question: m.question, slug: m.slug,
          tokens, outcomes, prices, spread,
          volume24hr: m.volume24hr || m.volume || 0,
          liquidity: m.liquidity || 0,
          endDate: m.endDate, startDate: m.startDate,
          // Screener scores
          scores: sm.scores || {},
          analysis: {
            // Quantitative analysis
            overround: sm.analysis?.overround,
            hoursToClose: sm.analysis?.hoursToClose,
            volumePerHour: sm.analysis?.volumePerHour,
            priceLevel: sm.analysis?.priceLevel,
            edgeType: sm.analysis?.edgeType,
            orderbook: sm.analysis?.orderbook ? {
              bestBid: sm.analysis.orderbook.bestBid,
              bestAsk: sm.analysis.orderbook.bestAsk,
              spreadPct: sm.analysis.orderbook.spreadPct,
              bidDepth5: sm.analysis.orderbook.bidDepth5,
              askDepth5: sm.analysis.orderbook.askDepth5,
              imbalance: sm.analysis.orderbook.imbalance,
            } : null,
          },
          // Screener recommendation
          recommendation: sm.recommendation || null,
          // Pipeline enrichment (quant + onchain + composite)
          pipeline: (() => {
            const pr = pipelineMap.get(m.clobTokenIds?.[0]);
            if (!pr) return null;
            return {
              score: pr.score,
              action: pr.action,
              thesis: pr.thesis,
              kelly: pr.kelly,
              regime: pr.regime,
              smart_money: pr.smart_money,
              manipulation_risk: pr.manipulation_risk,
              orderbook: pr.orderbook,
            };
          })(),
        };
      });

      return c.json({ markets, strategy: result.strategy, scanned: result.scanned, qualified: result.qualified, summary: result.summary });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Pause/resume trading
  api.post('/polymarket/:agentId/pause', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const { action, reason } = await c.req.json();
      const today = new Date().toISOString().split('T')[0];
      const e = edb();
      if (action === 'pause') {
        // 1. Mark daily counter as paused
        await e?.run(`
          INSERT INTO poly_daily_counters (agent_id, date, paused, pause_reason) VALUES (?, ?, 1, ?)
          ON CONFLICT (agent_id, date) DO UPDATE SET paused = 1, pause_reason = ?
        `, [agentId, today, reason || 'Admin paused', reason || 'Admin paused']);
        // 2. Also set proactive pause (watcher checks this table)
        try {
          await e?.run(`CREATE TABLE IF NOT EXISTS poly_proactive_pause (agent_id TEXT PRIMARY KEY, paused_at TEXT NOT NULL, reason TEXT)`);
          await e?.run(`INSERT OR REPLACE INTO poly_proactive_pause (agent_id, paused_at, reason) VALUES (?, ?, ?)`,
            [agentId, new Date().toISOString(), reason || 'Dashboard paused']);
        } catch {}
      } else {
        // 1. Clear daily counter pause
        await e?.run(`UPDATE poly_daily_counters SET paused = 0, pause_reason = '' WHERE agent_id = ? AND date = ?`, [agentId, today]);
        // 2. Clear proactive pause (so watcher can wake agent again)
        try {
          await e?.run(`DELETE FROM poly_proactive_pause WHERE agent_id = ?`, [agentId]);
        } catch {}
        // 3. Wake the agent to resume trading
        try {
          const agentRow = await e?.get(`SELECT config FROM managed_agents WHERE id = ?`, [agentId]);
          const agentConfig = typeof agentRow?.config === 'string' ? JSON.parse(agentRow.config) : agentRow?.config;
          const dep = agentConfig?.deployment;
          const port = dep?.port || dep?.config?.local?.port || 3101;
          const secret = process.env.AGENT_RUNTIME_SECRET || process.env.JWT_SECRET || '';
          // Determine best channel for wake message
          const messaging = agentConfig?.messagingChannels || {};
          const tgChatId = messaging.telegram?.chatId || messaging.telegram?.trustedChatIds?.[0] || agentConfig?.managerIdentity?.telegramId;
          const wakeSource = tgChatId ? 'telegram' : 'system';
          const wakeSenderId = tgChatId || 'dashboard@system';
          const wakeSpaceId = tgChatId || 'dashboard_resume';
          const resp = await fetch(`http://127.0.0.1:${port}/api/runtime/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
            body: JSON.stringify({
              source: wakeSource,
              senderName: 'Manager',
              senderEmail: wakeSenderId,
              spaceName: 'DM',
              spaceId: wakeSpaceId,
              threadId: '',
              isDM: true,
              messageText: '[TRADING RESUMED] Your trading has been resumed from the dashboard. Check your current positions and look for new opportunities.',
              isManager: true,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) console.warn(`[polymarket] Resume wake failed: ${resp.status}`);
        } catch (wakeErr: any) {
          console.warn(`[polymarket] Resume wake error: ${wakeErr.message}`);
        }
      }
      return c.json({ status: 'ok', action });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Dashboard summary — all polymarket agents
  api.get('/polymarket/dashboard', requireRole('admin'), async (c) => {
    try {
      const configs = await edb()?.all(`SELECT * FROM poly_trading_config`).catch(() => []) || [];
      const wallets = await edb()?.all(`SELECT agent_id, funder_address, signature_type FROM poly_wallet_credentials`).catch(() => []) || [];
      const pendingTrades = await edb()?.all(`SELECT agent_id, COUNT(*) as cnt FROM poly_pending_trades WHERE status = 'pending' GROUP BY agent_id`).catch(() => []) || [];
      const today = new Date().toISOString().split('T')[0];
      const dailyCounters = await edb()?.all(`SELECT * FROM poly_daily_counters WHERE date = ?`, [today]).catch(() => []) || [];
      return c.json({ configs, wallets, pendingTrades, dailyCounters });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Daily scorecard for a specific agent
  api.get('/polymarket/:agentId/daily-scorecard', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const today = new Date().toISOString().split('T')[0];
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      // Get wallet address
      const walletRow = await edb()?.get(`SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) as any;
      const address = walletRow?.funder_address;

      // Wallet balance — multi-RPC fallback
      let usdcBalance = 0;
      if (address) {
        const RPCS = ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com'];
        const addrHex = address.slice(2).toLowerCase();
        const callData = '0x70a08231000000000000000000000000' + addrHex;
        for (const rpc of RPCS) {
          try {
            const r = await fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: USDC_E_SHARED, data: callData }, 'latest'] }),
              signal: AbortSignal.timeout(4000),
            }).then(r => r.json());
            if (r?.result && !r.error) { usdcBalance = Number(BigInt(r.result)) / 1e6; break; }
          } catch {}
        }
      }

      // Daily counters
      const counter = await edb()?.get(`SELECT * FROM poly_daily_counters WHERE agent_id = ? AND date = ?`, [agentId, today]).catch(() => null) as any;

      // ── Positions from Polymarket Data API (sizeThreshold=0 to include resolved) ──
      let allPositions: any[] = [];
      let openPositions: any[] = [];
      let unrealizedPnl = 0;
      let realizedPnl = 0;
      let deployed = 0;
      let winsToday = 0;
      let lossesToday = 0;
      if (address) {
        try {
          const resp = await fetch(`https://data-api.polymarket.com/positions?user=${address}&sizeThreshold=0`, { signal: AbortSignal.timeout(8000) });
          const data = await resp.json();
          if (Array.isArray(data)) {
            allPositions = data;
            for (const pos of data) {
              const pnl = parseFloat(pos.cashPnl ?? pos.pnl ?? '0');
              const size = parseFloat(pos.size ?? '0');
              const entryPrice = parseFloat(pos.avgPrice ?? pos.avg_price ?? '0');
              const currentPrice = parseFloat(pos.curPrice ?? pos.current_price ?? '0');
              if (isNaN(pnl)) continue;

              if (size <= 0 || pos.resolved || pos.closed) {
                // Closed/resolved position — cashPnl is realized P&L
                realizedPnl += pnl;
                if (pnl > 0) winsToday++;
                else if (pnl < 0) lossesToday++;
              } else {
                // Open position — calculate unrealized from price difference
                openPositions.push(pos);
                const unrealPnl = currentPrice > 0 && entryPrice > 0
                  ? (currentPrice - entryPrice) * size
                  : pnl;
                unrealizedPnl += unrealPnl;
                deployed += size * entryPrice;
              }
            }
          }
        } catch {}
      }

      // Trade count from counter (most accurate) or trade log
      const tradesToday = counter?.trade_count || 0;

      // Daily goal target
      // Prefer daily_pnl_usd (absolute $) over daily_pnl_pct (percentage) — the scorecard modal sets USD targets
      const dailyGoal = await edb()?.get(`SELECT target_value, type FROM poly_goals WHERE agent_id = ? AND type IN ('daily_pnl_usd', 'daily_pnl_pct') AND enabled = 1 ORDER BY CASE type WHEN 'daily_pnl_usd' THEN 0 ELSE 1 END LIMIT 1`, [agentId]).catch(() => null) as any;
      const dailyTarget = dailyGoal?.target_value || 0;

      const totalPnl = realizedPnl + unrealizedPnl;
      const progressPct = dailyTarget > 0 ? (totalPnl / dailyTarget) * 100 : 0;
      const winRate = (winsToday + lossesToday) > 0 ? (winsToday / (winsToday + lossesToday)) * 100 : 0;

      let status = 'ON_TRACK';
      if (totalPnl <= -(counter?.max_daily_loss || 50)) status = 'STOP_TRADING';
      else if (progressPct >= 100) status = 'TARGET_HIT';
      else if (progressPct >= 70) status = 'AHEAD';
      else if (progressPct < 30 && tradesToday > 3) status = 'BEHIND';

      return c.json({
        date: today,
        total_pnl: +totalPnl.toFixed(2),
        realized_pnl: +realizedPnl.toFixed(2),
        unrealized_pnl: +unrealizedPnl.toFixed(2),
        daily_target: dailyTarget,
        target_progress_pct: +progressPct.toFixed(1),
        trades_today: tradesToday,
        wins_today: winsToday,
        losses_today: lossesToday,
        win_rate_today: +winRate.toFixed(1),
        open_positions: openPositions.length,
        available_capital: +usdcBalance.toFixed(2),
        deployed_capital: +deployed.toFixed(2),
        daily_loss: +(counter?.daily_loss || 0).toFixed(2),
        paused: !!counter?.paused,
        status,
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ═══ POLYMARKET REAL-TIME STREAM ══════════════════════════════

  // SSE stream for polymarket dashboard updates
  api.get('/polymarket/stream', requireRole('admin'), async (c) => {
    const agentId = c.req.query('agentId');
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
          catch { clearInterval(poll); }
        };

        // Send initial heartbeat
        send(JSON.stringify({ type: 'connected' }));

        // Poll for changes every 5 seconds (lightweight — just counts + status)
        let lastPendingCount = -1;
        let lastTradeCount = -1;
        let lastAlertCount = -1;
        let lastPredCount = -1;
        let lastPaused = false;

        const poll = setInterval(async () => {
          try {
            // Lightweight queries — just counts
            const e = edb();
            const pendingRow = agentId
              ? await e?.get(`SELECT COUNT(*) as cnt FROM poly_pending_trades WHERE agent_id = ? AND status = 'pending'`, [agentId]).catch(() => ({ cnt: 0 }))
              : await e?.get(`SELECT COUNT(*) as cnt FROM poly_pending_trades WHERE status = 'pending'`).catch(() => ({ cnt: 0 }));
            const pendingCount = (pendingRow as any)?.cnt ?? 0;

            const tradeRow = agentId
              ? await e?.get(`SELECT COUNT(*) as cnt FROM poly_trade_log WHERE agent_id = ?`, [agentId]).catch(() => ({ cnt: 0 }))
              : await e?.get(`SELECT COUNT(*) as cnt FROM poly_trade_log`).catch(() => ({ cnt: 0 }));
            const tradeCount = (tradeRow as any)?.cnt ?? 0;

            const alertRow = agentId
              ? await e?.get(`SELECT COUNT(*) as cnt FROM poly_price_alerts WHERE agent_id = ? AND triggered = 0`, [agentId]).catch(() => ({ cnt: 0 }))
              : await e?.get(`SELECT COUNT(*) as cnt FROM poly_price_alerts WHERE triggered = 0`).catch(() => ({ cnt: 0 }));
            const alertCount = (alertRow as any)?.cnt ?? 0;

            const predRow = agentId
              ? await e?.get(`SELECT COUNT(*) as cnt FROM poly_predictions WHERE agent_id = ?`, [agentId]).catch(() => ({ cnt: 0 }))
              : await e?.get(`SELECT COUNT(*) as cnt FROM poly_predictions`).catch(() => ({ cnt: 0 }));
            const predCount = (predRow as any)?.cnt ?? 0;

            const today = new Date().toISOString().split('T')[0];
            const pauseRow = agentId
              ? await e?.get(`SELECT paused FROM poly_daily_counters WHERE agent_id = ? AND date = ?`, [agentId, today]).catch(() => undefined)
              : await e?.get(`SELECT paused FROM poly_daily_counters WHERE date = ? LIMIT 1`, [today]).catch(() => undefined);
            const isPaused = !!(pauseRow as any)?.paused;

            // Only send if something changed
            const changed = pendingCount !== lastPendingCount || tradeCount !== lastTradeCount ||
                            alertCount !== lastAlertCount || predCount !== lastPredCount || isPaused !== lastPaused;

            if (changed) {
              lastPendingCount = pendingCount;
              lastTradeCount = tradeCount;
              lastAlertCount = alertCount;
              lastPredCount = predCount;
              lastPaused = isPaused;

              send(JSON.stringify({
                type: 'update',
                pending: pendingCount,
                trades: tradeCount,
                alerts: alertCount,
                predictions: predCount,
                paused: isPaused,
                timestamp: new Date().toISOString(),
              }));
            } else {
              // Keepalive
              send(JSON.stringify({ type: 'heartbeat' }));
            }
          } catch (err: any) {
            send(JSON.stringify({ type: 'error', message: err.message }));
          }
        }, 5000);

        // Cleanup
        c.req.raw.signal?.addEventListener('abort', () => { clearInterval(poll); });
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  });

  // ═══ POLYMARKET LEARNING / JOURNAL ════════════════════════════

  // Get predictions for an agent
  api.get('/polymarket/:agentId/predictions', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const resolved = c.req.query('resolved');
      const limit = parseInt(c.req.query('limit') || '50');
      const query = resolved !== undefined
        ? `SELECT * FROM poly_predictions WHERE agent_id = ? AND resolved = ? ORDER BY created_at DESC LIMIT ?`
        : `SELECT * FROM poly_predictions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`;
      const params = resolved !== undefined ? [agentId, resolved === 'true' ? 1 : 0, limit] : [agentId, limit];
      const rows = await edb()?.all(query, params).catch(() => []) || [];
      return c.json({ predictions: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get calibration data
  api.get('/polymarket/:agentId/calibration', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_calibration WHERE agent_id = ? ORDER BY bucket`, [agentId]).catch(() => []) || [];
      return c.json({ calibration: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get strategy performance
  api.get('/polymarket/:agentId/strategies', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`
        SELECT *, CASE WHEN total_predictions > 0 THEN ROUND(CAST(correct_predictions AS REAL) / total_predictions * 100, 1) ELSE 0 END as win_rate
        FROM poly_strategy_stats WHERE agent_id = ? ORDER BY total_pnl DESC
      `, [agentId]).catch(() => []) || [];
      return c.json({ strategies: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Get lessons
  api.get('/polymarket/:agentId/lessons', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all(`SELECT * FROM poly_lessons WHERE agent_id = ? ORDER BY importance DESC, created_at DESC`, [agentId]).catch(() => []) || [];
      return c.json({ lessons: rows });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Delete a lesson
  api.delete('/polymarket/lessons/:lessonId', requireRole('admin'), async (c) => {
    try {
      await edb()?.run(`DELETE FROM poly_lessons WHERE id = ?`, [c.req.param('lessonId')]);
      return c.json({ status: 'ok' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Polymarket: On-Chain Intelligence ──────────────────────
  api.get('/polymarket/:agentId/whales', requireRole('admin'), async (c) => {
    try {
      const rows = await edb()?.all('SELECT * FROM poly_whale_wallets ORDER BY total_volume DESC LIMIT 50').catch(() => []) || [];
      return c.json({ whales: rows });
    } catch { return c.json({ whales: [] }); }
  });

  api.get('/polymarket/:agentId/flow', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_flow_snapshots ORDER BY timestamp DESC LIMIT 50').catch(() => []) || [];
      return c.json({ snapshots: rows });
    } catch { return c.json({ snapshots: [] }); }
  });

  // ─── Polymarket: Social Intelligence ──────────────────────
  api.get('/polymarket/:agentId/social', requireRole('admin'), async (c) => {
    try {
      const rows = await edb()?.all('SELECT * FROM poly_social_signals ORDER BY timestamp DESC LIMIT 100').catch(() => []) || [];
      return c.json({ signals: rows });
    } catch { return c.json({ signals: [] }); }
  });

  api.get('/polymarket/:agentId/social/watchlist', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_social_watchlist WHERE agent_id = ? AND active = 1', [agentId]).catch(() => []) || [];
      return c.json({ watchlist: rows });
    } catch { return c.json({ watchlist: [] }); }
  });

  // ─── Polymarket: Event Calendar ──────────────────────
  api.get('/polymarket/:agentId/events', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_event_calendar WHERE agent_id = ? ORDER BY event_date ASC', [agentId]).catch(() => []) || [];
      return c.json({ events: rows.map((r: any) => ({ ...r, related_markets: JSON.parse(r.related_markets || '[]') })) });
    } catch { return c.json({ events: [] }); }
  });

  api.delete('/polymarket/events/:eventId', requireRole('admin'), async (c) => {
    try {
      await edb()?.run('DELETE FROM poly_event_calendar WHERE id = ?', [c.req.param('eventId')]);
      return c.json({ status: 'ok' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.get('/polymarket/:agentId/news-alerts', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_news_alerts WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 50', [agentId]).catch(() => []) || [];
      return c.json({ alerts: rows });
    } catch { return c.json({ alerts: [] }); }
  });

  // ─── Polymarket: Analytics ──────────────────────
  api.get('/polymarket/:agentId/correlations', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_correlations WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 50', [agentId]).catch(() => []) || [];
      return c.json({ correlations: rows });
    } catch { return c.json({ correlations: [] }); }
  });

  api.get('/polymarket/:agentId/arbitrage', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all("SELECT * FROM poly_arb_opportunities WHERE agent_id = ? AND status = 'open' ORDER BY timestamp DESC LIMIT 30", [agentId]).catch(() => []) || [];
      return c.json({ opportunities: rows.map((r: any) => ({ ...r, markets: JSON.parse(r.markets || '{}') })) });
    } catch { return c.json({ opportunities: [] }); }
  });

  api.get('/polymarket/:agentId/regimes', requireRole('admin'), async (c) => {
    try {
      const rows = await edb()?.all('SELECT * FROM poly_regime_signals ORDER BY timestamp DESC LIMIT 50').catch(() => []) || [];
      return c.json({ regimes: rows });
    } catch { return c.json({ regimes: [] }); }
  });

  // ─── Polymarket: Execution ──────────────────────
  api.get('/polymarket/:agentId/snipers', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_sniper_orders WHERE agent_id = ? ORDER BY created_at DESC', [agentId]).catch(() => []) || [];
      return c.json({ snipers: rows });
    } catch { return c.json({ snipers: [] }); }
  });

  api.delete('/polymarket/snipers/:sniperId', requireRole('admin'), async (c) => {
    try {
      await edb()?.run("UPDATE poly_sniper_orders SET status = 'cancelled' WHERE id = ?", [c.req.param('sniperId')]);
      return c.json({ status: 'ok' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.get('/polymarket/:agentId/scale-orders', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_scale_orders WHERE agent_id = ? ORDER BY created_at DESC', [agentId]).catch(() => []) || [];
      return c.json({ orders: rows });
    } catch { return c.json({ orders: [] }); }
  });

  api.get('/polymarket/:agentId/hedges', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_hedges WHERE agent_id = ? ORDER BY created_at DESC', [agentId]).catch(() => []) || [];
      return c.json({ hedges: rows });
    } catch { return c.json({ hedges: [] }); }
  });

  api.get('/polymarket/:agentId/exit-rules', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all("SELECT * FROM poly_exit_rules WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC", [agentId]).catch(() => []) || [];
      return c.json({ rules: rows });
    } catch { return c.json({ rules: [] }); }
  });

  api.delete('/polymarket/exit-rules/:ruleId', requireRole('admin'), async (c) => {
    try {
      await edb()?.run("UPDATE poly_exit_rules SET status = 'removed' WHERE id = ?", [c.req.param('ruleId')]);
      return c.json({ status: 'ok' });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Polymarket: Portfolio ──────────────────────
  api.get('/polymarket/:agentId/drawdown', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_portfolio_snapshots WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 100', [agentId]).catch(() => []) || [];
      const peak = rows.length ? Math.max(...rows.map((r: any) => r.total_value)) : 0;
      const current = rows[0]?.total_value || 0;
      return c.json({ snapshots: rows, peak, current, drawdown_pct: peak > 0 ? +((peak - current) / peak * 100).toFixed(2) : 0 });
    } catch { return c.json({ snapshots: [], peak: 0, current: 0, drawdown_pct: 0 }); }
  });

  api.get('/polymarket/:agentId/pnl-attribution', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const e = edb();
      const byStrategy = await e?.all(`SELECT strategy, COUNT(*) as trades, SUM(wins) as wins, SUM(net_pnl) as total_pnl, AVG(avg_hold_hours) as avg_hold
        FROM poly_pnl_attribution WHERE agent_id = ? AND strategy IS NOT NULL GROUP BY strategy ORDER BY total_pnl DESC`, [agentId]).catch(() => []) || [];
      const byCategory = await e?.all(`SELECT category, COUNT(*) as trades, SUM(wins) as wins, SUM(net_pnl) as total_pnl
        FROM poly_pnl_attribution WHERE agent_id = ? AND category IS NOT NULL GROUP BY category ORDER BY total_pnl DESC`, [agentId]).catch(() => []) || [];
      const bySignal = await e?.all(`SELECT signal_source, COUNT(*) as trades, SUM(wins) as wins, SUM(net_pnl) as total_pnl
        FROM poly_pnl_attribution WHERE agent_id = ? AND signal_source IS NOT NULL GROUP BY signal_source ORDER BY total_pnl DESC`, [agentId]).catch(() => []) || [];
      return c.json({ byStrategy, byCategory, bySignal });
    } catch { return c.json({ byStrategy: [], byCategory: [], bySignal: [] }); }
  });

  // ─── Polymarket: Counter-Intelligence ──────────────────────
  api.get('/polymarket/:agentId/odds-snapshots', requireRole('admin'), async (c) => {
    try {
      const rows = await edb()?.all('SELECT * FROM poly_odds_snapshots ORDER BY timestamp DESC LIMIT 100').catch(() => []) || [];
      return c.json({ snapshots: rows });
    } catch { return c.json({ snapshots: [] }); }
  });

  // ─── Polymarket: Watchers / Automation ────────────────────
  api.get('/polymarket/:agentId/watchers', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_watchers WHERE agent_id = ? ORDER BY created_at DESC', [agentId]).catch(() => []) || [];
      return c.json({ watchers: rows.map((r: any) => ({ ...r, config: (() => { try { return JSON.parse(r.config || '{}'); } catch { return {}; } })() })) });
    } catch { return c.json({ watchers: [] }); }
  });

  api.get('/polymarket/:agentId/watcher-events', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const rows = await edb()?.all('SELECT * FROM poly_watcher_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 200', [agentId]).catch(() => []) || [];
      return c.json({ events: rows.map((r: any) => ({ ...r, data: (() => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } })() })) });
    } catch { return c.json({ events: [] }); }
  });

  api.post('/polymarket/watchers/:id/toggle', requireRole('admin'), async (c) => {
    try {
      const id = c.req.param('id');
      const w = await edb()?.get('SELECT status FROM poly_watchers WHERE id = ?', [id]);
      const newStatus = w?.status === 'active' ? 'paused' : 'active';
      await edb()?.run('UPDATE poly_watchers SET status = ? WHERE id = ?', [newStatus, id]);
      return c.json({ success: true, status: newStatus });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.delete('/polymarket/watchers/:id', requireRole('admin'), async (c) => {
    try {
      const id = c.req.param('id');
      await edb()?.run('DELETE FROM poly_watchers WHERE id = ?', [id]);
      await edb()?.run('DELETE FROM poly_watcher_events WHERE watcher_id = ?', [id]);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/:agentId/watcher-events/acknowledge-all', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      await edb()?.run('UPDATE poly_watcher_events SET acknowledged = 1 WHERE agent_id = ? AND acknowledged = 0', [agentId]);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Polymarket: Watcher AI Config ─────────────────────────
  api.get('/polymarket/:agentId/watcher-config', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const cfg = await edb()?.get('SELECT * FROM poly_watcher_config WHERE agent_id = ?', [agentId]).catch(() => null);
      if (!cfg) return c.json({ configured: false });
      return c.json({
        configured: true,
        provider: cfg.ai_provider,
        model: cfg.ai_model,
        has_api_key: !!cfg.ai_api_key,
        has_custom_key: !!(cfg.ai_api_key && !cfg.use_org_key),
        use_org_key: cfg.use_org_key !== 0,
        budget_daily: cfg.analysis_budget_daily,
        used_today: cfg.analysis_count_today,
        remaining_today: (cfg.analysis_budget_daily || 100) - (cfg.analysis_count_today || 0),
        max_spawn_per_hour: cfg.max_spawn_per_hour,
      });
    } catch { return c.json({ configured: false }); }
  });

  api.post('/polymarket/:agentId/watcher-config', requireRole('admin'), async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json();
      const existing = await edb()?.get('SELECT * FROM poly_watcher_config WHERE agent_id = ?', [agentId]).catch(() => null);
      if (existing) {
        const updates: string[] = []; const vals: any[] = [];
        if (body.ai_provider) { updates.push('ai_provider = ?'); vals.push(body.ai_provider); }
        if (body.ai_model) { updates.push('ai_model = ?'); vals.push(body.ai_model); }
        if (body.ai_api_key) { updates.push('ai_api_key = ?'); vals.push(body.ai_api_key); }
        if (body.use_org_key != null) { updates.push('use_org_key = ?'); vals.push(body.use_org_key ? 1 : 0); }
        // When using org key, resolve and store it
        if (body.use_org_key && body.ai_provider) {
          const settings2 = await db.getSettings();
          const pc = (settings2 as any)?.modelPricingConfig || {};
          const savedKeys = pc.providerApiKeys || {};
          const encKey = savedKeys[body.ai_provider];
          if (encKey) {
            const resolved = vault.decrypt(encKey);
            updates.push('ai_api_key = ?'); vals.push(resolved);
          }
        } else if (!body.use_org_key && !body.ai_api_key) { /* keep existing custom key */ }
        if (body.analysis_budget_daily != null) { updates.push('analysis_budget_daily = ?'); vals.push(body.analysis_budget_daily); }
        if (body.max_spawn_per_hour != null) { updates.push('max_spawn_per_hour = ?'); vals.push(body.max_spawn_per_hour); }
        updates.push('updated_at = CURRENT_TIMESTAMP');
        vals.push(agentId);
        await edb()?.run(`UPDATE poly_watcher_config SET ${updates.join(', ')} WHERE agent_id = ?`, vals);
      } else {
        // Resolve API key
        let resolvedKey = body.ai_api_key || '';
        if (body.use_org_key && body.ai_provider) {
          const settings2 = await db.getSettings();
          const pc = (settings2 as any)?.modelPricingConfig || {};
          const savedKeys = pc.providerApiKeys || {};
          const encKey = savedKeys[body.ai_provider];
          if (encKey) resolvedKey = vault.decrypt(encKey);
        }
        await edb()?.run(
          'INSERT INTO poly_watcher_config (agent_id, ai_provider, ai_model, ai_api_key, analysis_budget_daily, max_spawn_per_hour, use_org_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [agentId, body.ai_provider || 'xai', body.ai_model || 'grok-3-mini', resolvedKey, body.analysis_budget_daily || 100, body.max_spawn_per_hour || 6, body.use_org_key ? 1 : 0]
        );
      }
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Polymarket: Watcher Engine Status & Control ──────────
  api.get('/polymarket/engine/status', requireRole('admin'), async (c) => {
    try {
      const status = getWatcherEngineStatus();
      // Also get counts from DB
      const totalWatchers = await edb()?.get('SELECT COUNT(*) as cnt FROM poly_watchers').catch(() => ({ cnt: 0 }));
      const activeWatchers = await edb()?.get(`SELECT COUNT(*) as cnt FROM poly_watchers WHERE status = 'active'`).catch(() => ({ cnt: 0 }));
      const pausedWatchers = await edb()?.get(`SELECT COUNT(*) as cnt FROM poly_watchers WHERE status = 'paused'`).catch(() => ({ cnt: 0 }));
      const totalEvents = await edb()?.get('SELECT COUNT(*) as cnt FROM poly_watcher_events').catch(() => ({ cnt: 0 }));
      const unackEvents = await edb()?.get('SELECT COUNT(*) as cnt FROM poly_watcher_events WHERE acknowledged = 0').catch(() => ({ cnt: 0 }));
      return c.json({
        ...status,
        totalWatchers: totalWatchers?.cnt || 0,
        activeWatchers: activeWatchers?.cnt || 0,
        pausedWatchers: pausedWatchers?.cnt || 0,
        totalEvents: totalEvents?.cnt || 0,
        unacknowledgedEvents: unackEvents?.cnt || 0,
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  api.post('/polymarket/engine/control', requireRole('admin'), async (c) => {
    try {
      const body = await c.req.json();
      const action = body.action; // 'start' | 'stop'
      if (action !== 'start' && action !== 'stop') return c.json({ error: 'Invalid action' }, 400);
      controlWatcherEngine(action);
      return c.json({ success: true, ...getWatcherEngineStatus() });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // Auto-connect polymarket proxy 5s after routes are registered
  setTimeout(async () => {
    try {
      await ensurePolyDB();
      await autoConnectProxy(edb());
    } catch (e: any) {
      console.warn(`[polymarket-proxy] Startup auto-connect failed: ${e.message}`);
    }
  }, 5000);

  return api;
}
