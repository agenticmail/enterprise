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
import { PROVIDER_REGISTRY, type ProviderDef, type CustomProviderDef } from '../runtime/providers.js';

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

    const body = await c.req.json();
    const targetType = body.targetType || 'fly';
    const config = body.config || {};

    // Get deployment credentials
    const settings = await db.getSettings();
    const pricingConfig = (settings as any)?.modelPricingConfig || {};
    const providerApiKeys = pricingConfig.providerApiKeys || {};

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

    // Owner and admin always get full access
    if (userRole === 'owner' || userRole === 'admin') {
      return c.json({ permissions: '*', role: userRole });
    }

    const user = await db.getUser(userId);
    return c.json({ permissions: user?.permissions ?? '*', role: userRole, clientOrgId: user?.clientOrgId || null });
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
          execSync('which brew', { timeout: 3000 });
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
        execSync('which pm2', { timeout: 3000 });
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

  api.get('/organizations', requireRole('admin'), async (c) => {
    try {
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

  api.get('/organizations/:id', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
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
      if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
      fields.push(isPostgres ? `updated_at = NOW()` : `updated_at = datetime('now')`);
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
        await engineDb!.run(`UPDATE client_organizations SET is_active = ?, updated_at = datetime('now') WHERE id = ?`, [newActive ? 1 : 0, id]);
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
            await engineDb.run(`UPDATE managed_agents SET client_org_id = ?, updated_at = datetime('now') WHERE id = ?`, [orgId, agentId]);
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
              await db.getEngineDB()!.run(`UPDATE managed_agents SET config = ?, updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(cfg), agentId]);
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
            await engineDb.run(`UPDATE managed_agents SET client_org_id = NULL, updated_at = datetime('now') WHERE id = ?`, [agentId]);
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
              await db.getEngineDB()!.run(`UPDATE managed_agents SET config = ?, updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(cfg), agentId]);
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

  return api;
}
