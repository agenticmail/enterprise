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
import { validate, requireRole, ValidationError } from '../middleware/index.js';
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
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);
    const agents = await db.listAgents({ status, limit, offset });
    const total = await db.countAgents(status);
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
    }).catch(() => {});

    return c.json({ ok: true, message: 'Password reset successfully' });
  });

  api.delete('/users/:id', requireRole('owner'), async (c) => {
    const existing = await db.getUser(c.req.param('id'));
    if (!existing) return c.json({ error: 'User not found' }, 404);

    // Cannot delete yourself
    const requesterId = c.get('userId');
    if (requesterId === c.req.param('id')) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    await db.deleteUser(c.req.param('id'));
    return c.json({ ok: true });
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
    ]);

    const settings = await updateSettingsAndEmit(body);
    return c.json(settings);
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
        var resp = await fetch(ollamaHost + '/api/tags');
        var data = await resp.json() as any;
        return c.json({ models: (data.models || []).map(function(m: any) { return { id: m.name, name: m.name, size: m.size }; }) });
      } catch (err: any) {
        return c.json({ error: 'Cannot connect to Ollama: ' + err.message }, 502);
      }
    }

    // OpenAI-compatible local auto-discovery (vLLM, LM Studio, LiteLLM)
    if (provider && provider.isLocal && provider.apiType === 'openai-compatible') {
      try {
        var resp = await fetch(provider.baseUrl + '/models');
        var data = await resp.json() as any;
        return c.json({ models: (data.data || []).map(function(m: any) { return { id: m.id, name: m.id }; }) });
      } catch (err: any) {
        return c.json({ error: 'Cannot connect to ' + provider.name + ': ' + err.message }, 502);
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

  return api;
}
