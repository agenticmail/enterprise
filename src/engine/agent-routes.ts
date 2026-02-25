/**
 * Agent Lifecycle + Budget + Bridge Routes
 * Mounted at / on the engine sub-app (routes define /agents/*, /usage/*, /budget/*, /bridge/*).
 */

import { Hono } from 'hono';
import type { AgentLifecycleManager } from './lifecycle.js';
import type { PermissionEngine } from './skills.js';
import type { DatabaseAdapter } from '../db/adapter.js';

export function createAgentRoutes(opts: {
  lifecycle: AgentLifecycleManager;
  permissions: PermissionEngine;
  getAdminDb: () => DatabaseAdapter | null;
}) {
  const { lifecycle, permissions, getAdminDb } = opts;
  const router = new Hono();

  // ─── Agent Lifecycle ────────────────────────────────────

  router.post('/agents', async (c) => {
    const { orgId, config, createdBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || createdBy;
      const agent = await lifecycle.createAgent(orgId, config, actor);
      return c.json({ agent }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/agents', (c) => {
    const orgId = c.req.query('orgId');
    if (!orgId) return c.json({ error: 'orgId required' }, 400);
    const agents = lifecycle.getAgentsByOrg(orgId);
    return c.json({ agents, total: agents.length });
  });

  router.get('/agents/:id', async (c) => {
    const agent = lifecycle.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    // Refresh state and usage from DB (agent machine writes directly)
    try {
      const fresh = await lifecycle.loadAgentFromDb(c.req.param('id'));
      if (fresh) {
        if (fresh.state) agent.state = fresh.state;
        if (fresh.usage) agent.usage = fresh.usage;
      }
    } catch {}
    return c.json({ agent });
  });

  router.patch('/agents/:id/config', async (c) => {
    const { updates, updatedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || updatedBy;
      const agent = await lifecycle.updateConfig(c.req.param('id'), updates, actor);
      // Sync name/email to admin agents table
      const adminDb = getAdminDb();
      if (adminDb && (updates.name || updates.email)) {
        const sync: any = {};
        if (updates.name) sync.name = updates.name;
        if (updates.email) sync.email = updates.email;
        adminDb.updateAgent(c.req.param('id'), sync).catch(() => {});
      }
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/deploy', async (c) => {
    const { deployedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || deployedBy;
      const agent = await lifecycle.deploy(c.req.param('id'), actor);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/reset-state', async (c) => {
    try {
      const agent = lifecycle.getAgent(c.req.param('id'));
      if (!agent) return c.json({ error: 'Agent not found' }, 404);
      if (!['error', 'degraded', 'deploying', 'provisioning', 'starting', 'draft'].includes(agent.state)) {
        return c.json({ error: `Cannot reset from state "${agent.state}"` }, 400);
      }
      // Reset to ready
      (agent as any).state = 'ready';
      (agent as any).stateMessage = 'State reset by admin';
      (agent as any).updatedAt = new Date().toISOString();
      await lifecycle.saveAgent(c.req.param('id'));
      return c.json({ agent, message: 'State reset to ready' });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/stop', async (c) => {
    const { stoppedBy, reason } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || stoppedBy;
      const agent = await lifecycle.stop(c.req.param('id'), actor, reason);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/restart', async (c) => {
    const { restartedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || restartedBy;
      const agent = await lifecycle.restart(c.req.param('id'), actor);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/hot-update', async (c) => {
    const { updates, updatedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || updatedBy;
      const agent = await lifecycle.hotUpdate(c.req.param('id'), updates, actor);
      // Sync name/email to admin agents table
      const adminDb = getAdminDb();
      if (adminDb && (updates.name || updates.email)) {
        const sync: any = {};
        if (updates.name) sync.name = updates.name;
        if (updates.email) sync.email = updates.email;
        adminDb.updateAgent(c.req.param('id'), sync).catch(() => {});
      }
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.delete('/agents/:id', async (c) => {
    const { destroyedBy } = await c.req.json().catch(() => ({ destroyedBy: 'unknown' }));
    try {
      const actor = c.req.header('X-User-Id') || destroyedBy;
      await lifecycle.destroy(c.req.param('id'), actor);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/agents/:id/usage', async (c) => {
    const agentId = c.req.param('id');
    const agent = lifecycle.getAgent(agentId);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    // Read fresh usage from DB (agent machine writes directly to DB, not to this server's memory)
    try {
      const freshAgent = await lifecycle.loadAgentFromDb(agentId);
      if (freshAgent) {
        const dbUsage = freshAgent.usage || {};
        const freshState = freshAgent.state || agent.state;
        // Also update in-memory state so other endpoints see it
        if (freshAgent.state && freshAgent.state !== agent.state) {
          agent.state = freshAgent.state;
        }
        if (dbUsage.tokensToday > 0 || (dbUsage.lastUpdated && dbUsage.lastUpdated > (agent.usage?.lastUpdated || ''))) {
          return c.json({ usage: dbUsage, health: agent.health, state: freshState });
        }
        return c.json({ usage: agent.usage, health: agent.health, state: freshState });
      }
    } catch (err: any) {
      console.error('[usage-api] DB load failed:', err.message);
    }
    return c.json({ usage: agent.usage, health: agent.health, state: agent.state });
  });

  router.get('/usage/:orgId', (c) => {
    return c.json(lifecycle.getOrgUsage(c.req.param('orgId')));
  });

  // ─── Per-Agent Budget Controls ─────────────────────────

  router.get('/agents/:id/budget', (c) => {
    const config = lifecycle.getBudgetConfig(c.req.param('id'));
    if (!config) return c.json({ budgetConfig: null });
    return c.json({ budgetConfig: config });
  });

  router.put('/agents/:id/budget', async (c) => {
    const config = await c.req.json();
    try {
      await lifecycle.setBudgetConfig(c.req.param('id'), config);
      return c.json({ success: true, budgetConfig: config });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/budget/alerts', (c) => {
    const alerts = lifecycle.getBudgetAlerts({
      orgId: c.req.query('orgId') || undefined,
      agentId: c.req.query('agentId') || undefined,
      acknowledged: c.req.query('acknowledged') === 'true' ? true : c.req.query('acknowledged') === 'false' ? false : undefined,
      limit: parseInt(c.req.query('limit') || '50'),
    });
    return c.json({ alerts, total: alerts.length });
  });

  router.post('/budget/alerts/:id/acknowledge', async (c) => {
    try {
      await lifecycle.acknowledgeBudgetAlert(c.req.param('id'));
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/budget/summary/:orgId', (c) => {
    return c.json(lifecycle.getBudgetSummary(c.req.param('orgId')));
  });

  // ─── Per-Agent Tool Security ──────────────────────────

  router.get('/agents/:id/tool-security', async (c) => {
    const agent = lifecycle.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const agentOverrides = agent.config?.toolSecurity || {};

    // Get org defaults from admin DB if available
    var orgDefaults: Record<string, any> = {};
    var adminDb = getAdminDb();
    if (adminDb) {
      try {
        var settings = await adminDb.getSettings();
        orgDefaults = settings?.toolSecurityConfig || {};
      } catch { /* ignore — admin DB may not be available */ }
    }

    // Deep merge org defaults + agent overrides
    var merged = { ...orgDefaults };
    if (agentOverrides.security) {
      merged.security = { ...(merged.security || {}), ...agentOverrides.security };
    }
    if (agentOverrides.middleware) {
      merged.middleware = { ...(merged.middleware || {}), ...agentOverrides.middleware };
    }

    return c.json({ toolSecurity: merged, orgDefaults, agentOverrides });
  });

  router.patch('/agents/:id/tool-security', async (c) => {
    const { toolSecurity, updatedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || updatedBy || 'dashboard';
      const agent = await lifecycle.updateConfig(c.req.param('id'), { toolSecurity }, actor);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // ─── Agent Creation Bridge ──────────────────────────────

  /**
   * POST /bridge/agents — Unified agent creation that creates both:
   * 1. An admin-level agent record (via the base DatabaseAdapter)
   * 2. An engine managed_agent record (via lifecycle manager)
   * Returns both IDs and the full agent object.
   */
  router.post('/bridge/agents', async (c) => {
    const { orgId, name, email, displayName, role, model, deployment, permissionProfile, presetName, createdBy, persona, permissions: permissionsData, skills, knowledgeBases, description, soulId, deployTarget } = await c.req.json();

    if (!name || !orgId) {
      return c.json({ error: 'name and orgId are required' }, 400);
    }

    const actor = c.req.header('X-User-Id') || createdBy || 'system';
    const agentId = crypto.randomUUID();

    // Build the engine AgentConfig — store EVERYTHING from the wizard
    const agentEmail = email || `${name.toLowerCase().replace(/\s+/g, '-')}@agenticmail.local`;
    const agentRole = role || 'assistant';
    const agentDescription = description || persona?.description || '';

    const config: any = {
      id: agentId,
      name,
      displayName: displayName || name,
      email: agentEmail,
      role: agentRole,
      description: agentDescription,
      soulId: soulId || null,
      identity: {
        name,
        displayName: displayName || name,
        email: agentEmail,
        role: agentRole,
        personality: persona?.personality || 'professional',
        description: agentDescription,
        avatar: persona?.avatar || null,
        gender: persona?.gender || '',
        dateOfBirth: persona?.dateOfBirth || '',
        maritalStatus: persona?.maritalStatus || '',
        culturalBackground: persona?.culturalBackground || '',
        language: persona?.language || 'en-us',
        traits: persona?.traits || {},
      },
      model: model || {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        thinkingLevel: 'medium',
      },
      skills: Array.isArray(skills) ? skills : [],
      knowledgeBases: Array.isArray(knowledgeBases) ? knowledgeBases : [],
      deployment: deployment || {
        target: deployTarget || 'docker',
        config: { docker: { image: 'agenticmail/agent', tag: 'latest', ports: [3000], env: {}, volumes: [], restart: 'unless-stopped' } },
      },
      permissionProfileId: permissionProfile || 'default',
    };

    // Apply permissions: start from preset if specified, then overlay granular settings
    if (presetName || permissionsData) {
      let profile: any = { id: agentId, name: presetName || 'Custom', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

      if (presetName) {
        const { PRESET_PROFILES } = await import('./skills.js');
        const preset = PRESET_PROFILES.find((p: any) => p.name === presetName);
        if (preset) Object.assign(profile, preset);
      }

      // Overlay granular permission settings from the UI
      if (permissionsData) {
        if (permissionsData.maxRiskLevel) profile.maxRiskLevel = permissionsData.maxRiskLevel;
        if (permissionsData.blockedSideEffects) profile.blockedSideEffects = permissionsData.blockedSideEffects;
        if (permissionsData.requireApproval) profile.requireApproval = permissionsData.requireApproval;
        if (permissionsData.rateLimits) profile.rateLimits = permissionsData.rateLimits;
        if (permissionsData.constraints) profile.constraints = permissionsData.constraints;
      }

      permissions.setProfile(agentId, profile as any, orgId);
    }

    const _adminDb = getAdminDb();

    try {
      // 1) Create admin agent record (shared ID)
      let adminAgent = null;
      if (_adminDb) {
        adminAgent = await _adminDb.createAgent({
          id: agentId,
          name,
          email: agentEmail,
          role: agentRole,
          metadata: { engineLinked: true, orgId, soulId: soulId || undefined },
          createdBy: actor,
        });
      }

      // 2) Create engine managed agent (same ID via config.id)
      const managedAgent = await lifecycle.createAgent(orgId, config, actor);

      return c.json({
        agent: managedAgent,
        adminAgent,
        agentId,
      }, 201);
    } catch (e: any) {
      // If engine creation fails but admin was created, best-effort cleanup
      if (_adminDb) {
        try { await _adminDb.deleteAgent(agentId); } catch { /* best effort */ }
      }
      return c.json({ error: e.message }, 400);
    }
  });

  /**
   * DELETE /bridge/agents/:id — Unified agent deletion.
   * Removes both the admin record and the engine managed agent.
   */
  router.delete('/bridge/agents/:id', async (c) => {
    const agentId = c.req.param('id');
    const { destroyedBy } = await c.req.json().catch(() => ({ destroyedBy: 'unknown' }));
    const actor = c.req.header('X-User-Id') || destroyedBy;
    const errors: string[] = [];
    const _adminDb = getAdminDb();

    // 1) Destroy engine agent
    try {
      await lifecycle.destroy(agentId, actor);
    } catch (e: any) {
      errors.push(`engine: ${e.message}`);
    }

    // 2) Delete admin agent
    if (_adminDb) {
      try {
        await _adminDb.deleteAgent(agentId);
      } catch (e: any) {
        errors.push(`admin: ${e.message}`);
      }
    }

    if (errors.length > 0) {
      return c.json({ success: false, errors }, 207);
    }
    return c.json({ success: true });
  });

  /**
   * GET /bridge/agents/:id/full — Get full agent info combining admin + engine data
   */
  router.get('/bridge/agents/:id/full', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);

    if (!managed) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    const profile = permissions.getProfile(agentId);
    const tools = permissions.getAvailableTools(agentId);

    return c.json({
      agent: managed,
      permissions: profile,
      availableTools: tools.length,
      state: managed.state,
      health: managed.health,
      usage: managed.usage,
    });
  });

  // ─── Birthday Routes ──────────────────────────────────

  router.get('/birthdays/upcoming', (c) => {
    const days = parseInt(c.req.query('days') || '30');
    const upcoming = lifecycle.getUpcomingBirthdays(days);
    return c.json({
      upcoming: upcoming.map(b => ({
        agentId: b.agent.id,
        name: b.agent.config.displayName,
        dateOfBirth: b.dateOfBirth,
        turningAge: b.age,
        daysUntil: b.daysUntil,
      })),
      total: upcoming.length,
    });
  });

  // ─── Email Configuration ──────────────────────────────

  /**
   * GET /bridge/agents/:id/email-config — Get agent's email configuration (without password).
   */
  router.get('/bridge/agents/:id/email-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    // Fetch org-level email config
    let orgEmailConfig: any = null;
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        const settings = await adminDb.getSettings();
        if (settings?.orgEmailConfig?.configured) {
          orgEmailConfig = {
            provider: settings.orgEmailConfig.provider,
            label: settings.orgEmailConfig.label,
            oauthClientId: settings.orgEmailConfig.oauthClientId,
            oauthTenantId: settings.orgEmailConfig.oauthTenantId,
          };
        }
      }
    } catch {}

    const emailConfig = managed.config?.emailConfig || null;
    if (!emailConfig) return c.json({ configured: false, orgEmailConfig });

    // Return config without sensitive data
    return c.json({
      configured: true,
      provider: emailConfig.provider,
      email: emailConfig.email,
      status: emailConfig.status || 'unknown',
      // IMAP details (no password)
      imapHost: emailConfig.imapHost,
      imapPort: emailConfig.imapPort,
      smtpHost: emailConfig.smtpHost,
      smtpPort: emailConfig.smtpPort,
      // OAuth details (no tokens)
      oauthProvider: emailConfig.oauthProvider,
      oauthClientId: emailConfig.oauthClientId,
      oauthConfigured: !!emailConfig.oauthAccessToken,
      oauthAuthUrl: emailConfig.oauthAuthUrl || undefined,
      lastConnected: emailConfig.lastConnected,
      lastError: emailConfig.lastError,
      orgEmailConfig,
    });
  });

  /**
   * PUT /bridge/agents/:id/email-config — Set or update agent's email configuration.
   *
   * Supports three modes:
   *   1. IMAP/SMTP: { provider: 'imap', email, password, imapHost, smtpHost, ... }
   *   2. Microsoft OAuth: { provider: 'microsoft', oauthClientId, oauthClientSecret, oauthTenantId }
   *   3. Google OAuth: { provider: 'google', oauthClientId, oauthClientSecret }
   *
   * For IMAP, auto-detects settings for known providers (Microsoft 365, Gmail, etc.)
   */
  router.put('/bridge/agents/:id/email-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    let { provider, email, password, imapHost, imapPort, smtpHost, smtpPort, preset,
            oauthClientId, oauthClientSecret, oauthTenantId, oauthRedirectUri } = body;
    const useOrgConfig = body.useOrgConfig === true;

    if (!provider) return c.json({ error: 'provider is required (imap, microsoft, or google)' }, 400);

    // If using org-level OAuth config, inherit client credentials
    if (useOrgConfig && (provider === 'google' || provider === 'microsoft')) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          const settings = await adminDb.getSettings();
          if (settings?.orgEmailConfig?.configured && settings.orgEmailConfig.provider === provider) {
            oauthClientId = oauthClientId || settings.orgEmailConfig.oauthClientId;
            oauthClientSecret = oauthClientSecret || settings.orgEmailConfig.oauthClientSecret;
            if (provider === 'microsoft') oauthTenantId = oauthTenantId || settings.orgEmailConfig.oauthTenantId;
          } else {
            return c.json({ error: 'Organization email config not found or provider mismatch' }, 400);
          }
        }
      } catch {}
    }
    if (!email && provider === 'imap') return c.json({ error: 'email is required' }, 400);

    // Preserve existing tokens/state when re-configuring (e.g. to pick up new scopes)
    const existingConfig = managed.config?.emailConfig || {};
    const emailConfig: any = {
      provider,
      email: email || existingConfig.email || (managed.config?.identity as any)?.email || managed.config?.email,
      updatedAt: new Date().toISOString(),
    };
    // Preserve existing OAuth tokens so re-auth doesn't lose refresh_token
    if (existingConfig.oauthRefreshToken) emailConfig.oauthRefreshToken = existingConfig.oauthRefreshToken;
    if (existingConfig.oauthAccessToken) emailConfig.oauthAccessToken = existingConfig.oauthAccessToken;
    if (existingConfig.oauthTokenExpiry) emailConfig.oauthTokenExpiry = existingConfig.oauthTokenExpiry;
    if (existingConfig.lastConnected) emailConfig.lastConnected = existingConfig.lastConnected;

    if (provider === 'imap') {
      // Auto-detect IMAP/SMTP from well-known providers
      if (preset && !imapHost) {
        const PRESETS: Record<string, any> = {
          'microsoft365': { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
          'gmail': { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
          'yahoo': { imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465 },
          'zoho': { imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 587 },
          'fastmail': { imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587 },
          'icloud': { imapHost: 'imap.mail.me.com', imapPort: 993, smtpHost: 'smtp.mail.me.com', smtpPort: 587 },
        };
        const presetConfig = PRESETS[preset];
        if (presetConfig) Object.assign(emailConfig, presetConfig);
        else return c.json({ error: `Unknown preset: ${preset}. Valid: ${Object.keys(PRESETS).join(', ')}` }, 400);
      } else {
        emailConfig.imapHost = imapHost;
        emailConfig.imapPort = imapPort || 993;
        emailConfig.smtpHost = smtpHost;
        emailConfig.smtpPort = smtpPort || 587;
      }

      if (!emailConfig.imapHost || !emailConfig.smtpHost) {
        return c.json({ error: 'imapHost and smtpHost are required (or use a preset)' }, 400);
      }

      if (password) {
        emailConfig.password = password; // stored encrypted in production
      }

      emailConfig.status = 'configured';

    } else if (provider === 'microsoft') {
      // Microsoft OAuth (Azure AD / Entra ID)
      emailConfig.oauthProvider = 'microsoft';
      emailConfig.oauthClientId = oauthClientId;
      emailConfig.oauthClientSecret = oauthClientSecret;
      emailConfig.oauthTenantId = oauthTenantId || 'common';
      emailConfig.oauthRedirectUri = oauthRedirectUri || '';
      emailConfig.oauthScopes = [
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/Files.ReadWrite',
        'https://graph.microsoft.com/Contacts.ReadWrite',
        'offline_access',
      ];

      if (!oauthClientId) return c.json({ error: 'oauthClientId is required for Microsoft OAuth' }, 400);

      // Build the authorization URL
      const authUrl = `https://login.microsoftonline.com/${emailConfig.oauthTenantId}/oauth2/v2.0/authorize?` +
        `client_id=${encodeURIComponent(oauthClientId)}&response_type=code&` +
        `redirect_uri=${encodeURIComponent(emailConfig.oauthRedirectUri)}&` +
        `scope=${encodeURIComponent(emailConfig.oauthScopes.join(' '))}&` +
        `state=${agentId}&prompt=consent`;
      emailConfig.oauthAuthUrl = authUrl;
      emailConfig.status = 'awaiting_oauth';

    } else if (provider === 'google') {
      // Google OAuth (Google Workspace)
      emailConfig.oauthProvider = 'google';
      emailConfig.oauthClientId = oauthClientId;
      emailConfig.oauthClientSecret = oauthClientSecret;
      emailConfig.oauthRedirectUri = oauthRedirectUri || '';
      emailConfig.oauthScopes = [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/chat.spaces',
        'https://www.googleapis.com/auth/chat.spaces.create',
        'https://www.googleapis.com/auth/chat.messages',
        'https://www.googleapis.com/auth/chat.messages.create',
        'https://www.googleapis.com/auth/chat.memberships',
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.responses.readonly',
      ];

      if (!oauthClientId) return c.json({ error: 'oauthClientId is required for Google OAuth' }, 400);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(oauthClientId)}&response_type=code&` +
        `redirect_uri=${encodeURIComponent(emailConfig.oauthRedirectUri)}&` +
        `scope=${encodeURIComponent(emailConfig.oauthScopes.join(' '))}&` +
        `access_type=offline&prompt=consent&state=${agentId}`;
      emailConfig.oauthAuthUrl = authUrl;
      emailConfig.status = 'awaiting_oauth';
    } else {
      return c.json({ error: `Unknown provider: ${provider}. Valid: imap, microsoft, google` }, 400);
    }

    // Save to agent config and persist to DB
    const _managed = lifecycle.getAgent(agentId); if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
    await lifecycle.saveAgent(agentId);

    // Also update the primary agents table email if we have one
    if (emailConfig.email) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) await adminDb.updateAgent(agentId, { email: emailConfig.email });
      } catch { /* non-critical */ }
    }

    return c.json({
      success: true,
      emailConfig: {
        provider: emailConfig.provider,
        email: emailConfig.email,
        status: emailConfig.status,
        oauthAuthUrl: emailConfig.oauthAuthUrl || undefined,
      },
    });
  });

  /**
   * POST /bridge/agents/:id/email-config/oauth-callback — Exchange OAuth code for tokens.
   * Called after user completes the OAuth consent flow.
   */
  router.post('/bridge/agents/:id/email-config/oauth-callback', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const { code } = await c.req.json();
    if (!code) return c.json({ error: 'OAuth authorization code is required' }, 400);

    const emailConfig = managed.config?.emailConfig;
    if (!emailConfig) return c.json({ error: 'No email config found — configure email first' }, 400);

    try {
      if (emailConfig.oauthProvider === 'microsoft') {
        const tokenRes = await fetch(`https://login.microsoftonline.com/${emailConfig.oauthTenantId || 'common'}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: emailConfig.oauthClientId,
            client_secret: emailConfig.oauthClientSecret,
            code,
            redirect_uri: emailConfig.oauthRedirectUri,
            grant_type: 'authorization_code',
            scope: emailConfig.oauthScopes.join(' '),
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          return c.json({ error: `Microsoft token exchange failed: ${errText}` }, 400);
        }

        const tokens = await tokenRes.json() as any;
        emailConfig.oauthAccessToken = tokens.access_token;
        emailConfig.oauthRefreshToken = tokens.refresh_token;
        emailConfig.oauthTokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

        // Get the user's email from Graph
        try {
          const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,displayName', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json() as any;
            if (profile.mail) emailConfig.email = profile.mail;
          }
        } catch {}

      } else if (emailConfig.oauthProvider === 'google') {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: emailConfig.oauthClientId,
            client_secret: emailConfig.oauthClientSecret,
            code,
            redirect_uri: emailConfig.oauthRedirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          return c.json({ error: `Google token exchange failed: ${errText}` }, 400);
        }

        const tokens = await tokenRes.json() as any;
        emailConfig.oauthAccessToken = tokens.access_token;
        // Only overwrite refresh_token if Google returned one (re-auth may not include it)
        if (tokens.refresh_token) {
          emailConfig.oauthRefreshToken = tokens.refresh_token;
        }
        emailConfig.oauthTokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

        // Get the user's email from Gmail
        try {
          const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json() as any;
            if (profile.emailAddress) emailConfig.email = profile.emailAddress;
          }
        } catch {}
      }

      emailConfig.status = 'connected';
      emailConfig.lastConnected = new Date().toISOString();
      emailConfig.lastError = null;
      const _managed = lifecycle.getAgent(agentId); if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
      await lifecycle.saveAgent(agentId);

      return c.json({ success: true, email: emailConfig.email, status: 'connected' });
    } catch (err: any) {
      emailConfig.status = 'error';
      emailConfig.lastError = err.message;
      const _managed = lifecycle.getAgent(agentId); if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
      await lifecycle.saveAgent(agentId);
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * POST /bridge/agents/:id/email-config/test — Test email connection.
   */
  router.post('/bridge/agents/:id/email-config/test', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const emailConfig = managed.config?.emailConfig;
    if (!emailConfig) return c.json({ error: 'No email config found' }, 400);

    try {
      if (emailConfig.provider === 'imap') {
        // Test IMAP connection
        const { ImapFlow } = await import('imapflow');
        const client = new (ImapFlow as any)({
          host: emailConfig.imapHost,
          port: emailConfig.imapPort || 993,
          secure: true,
          auth: { user: emailConfig.email, pass: emailConfig.password },
          logger: false,
        });
        await client.connect();
        const status = await client.status('INBOX', { messages: true, unseen: true });
        await client.logout();

        return c.json({ success: true, inbox: { total: status.messages, unread: status.unseen } });
      } else if (emailConfig.provider === 'microsoft' && emailConfig.oauthAccessToken) {
        const res = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount', {
          headers: { Authorization: `Bearer ${emailConfig.oauthAccessToken}` },
        });
        if (!res.ok) throw new Error(`Graph API ${res.status}`);
        const data = await res.json() as any;
        return c.json({ success: true, inbox: { total: data.totalItemCount, unread: data.unreadItemCount } });
      } else if (emailConfig.provider === 'google' && emailConfig.oauthAccessToken) {
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${emailConfig.oauthAccessToken}` },
        });
        if (!res.ok) throw new Error(`Gmail API ${res.status}`);
        const data = await res.json() as any;
        return c.json({ success: true, email: data.emailAddress, totalMessages: data.messagesTotal });
      } else {
        return c.json({ error: 'Provider not fully configured or unsupported' }, 400);
      }
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 200);
    }
  });

  /**
   * POST /bridge/agents/:id/email-config/reauthorize — Generate a new OAuth URL with updated scopes.
   * Preserves all existing config/tokens. Just builds a fresh auth URL for re-consent.
   */
  router.post('/bridge/agents/:id/email-config/reauthorize', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const emailConfig = managed.config?.emailConfig;
    if (!emailConfig) return c.json({ error: 'No email config found' }, 400);

    if (emailConfig.oauthProvider === 'google') {
      const clientId = emailConfig.oauthClientId;
      const redirectUri = emailConfig.oauthRedirectUri;
      if (!clientId) return c.json({ error: 'No OAuth client ID configured' }, 400);

      // Updated scopes
      const scopes = [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/chat.spaces',
        'https://www.googleapis.com/auth/chat.spaces.create',
        'https://www.googleapis.com/auth/chat.messages',
        'https://www.googleapis.com/auth/chat.messages.create',
        'https://www.googleapis.com/auth/chat.memberships',
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.responses.readonly',
      ];

      emailConfig.oauthScopes = scopes;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `access_type=offline&prompt=consent&state=${agentId}`;
      emailConfig.oauthAuthUrl = authUrl;

      const _managed = lifecycle.getAgent(agentId);
      if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
      await lifecycle.saveAgent(agentId);

      return c.json({ success: true, oauthAuthUrl: authUrl, scopeCount: scopes.length });
    } else if (emailConfig.oauthProvider === 'microsoft') {
      return c.json({ error: 'Microsoft re-authorization not yet implemented' }, 400);
    }
    return c.json({ error: 'No OAuth provider configured' }, 400);
  });

  /**
   * DELETE /bridge/agents/:id/email-config — Disconnect email.
   */
  router.delete('/bridge/agents/:id/email-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const _m = lifecycle.getAgent(agentId); if (_m) { _m.config.emailConfig = null; _m.updatedAt = new Date().toISOString(); }
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════
  // TOOL ACCESS CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  /** Master tool catalog — all available tools grouped by category */
  const TOOL_CATALOG = [
    {
      id: 'core', name: 'Core Tools', description: 'File operations, shell, search, and browser',
      icon: '🔧', alwaysOn: true,
      tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'web_fetch', 'web_search', 'browser', 'memory'],
    },
    {
      id: 'agenticmail', name: 'AgenticMail', description: 'Email send/receive, inbox management, inter-agent messaging',
      icon: '📧',
      tools: ['agenticmail_inbox', 'agenticmail_read', 'agenticmail_send', 'agenticmail_reply', 'agenticmail_forward',
              'agenticmail_search', 'agenticmail_labels', 'agenticmail_folders', 'agenticmail_drafts',
              'agenticmail_move', 'agenticmail_delete', 'agenticmail_batch_read', 'agenticmail_batch_delete',
              'agenticmail_contacts', 'agenticmail_templates', 'agenticmail_message_agent', 'agenticmail_call_agent',
              'agenticmail_check_tasks', 'agenticmail_complete_task', 'agenticmail_identity'],
    },
    {
      id: 'gmail', name: 'Gmail', description: 'Native Gmail API — search, send, reply, labels, drafts, threads, attachments',
      icon: '✉️', requiresOAuth: 'google',
      tools: ['gmail_search', 'gmail_read', 'gmail_thread', 'gmail_send', 'gmail_reply', 'gmail_forward',
              'gmail_modify', 'gmail_trash', 'gmail_labels', 'gmail_drafts', 'gmail_attachment', 'gmail_profile', 'gmail_vacation'],
    },
    {
      id: 'google_calendar', name: 'Google Calendar', description: 'Event management, scheduling, free/busy lookup',
      icon: '📅', requiresOAuth: 'google',
      tools: ['google_calendar_list', 'google_calendar_events', 'google_calendar_create_event',
              'google_calendar_update_event', 'google_calendar_delete_event', 'google_calendar_freebusy'],
    },
    {
      id: 'google_drive', name: 'Google Drive', description: 'File management, search, sharing, content export',
      icon: '📁', requiresOAuth: 'google',
      tools: ['google_drive_list', 'google_drive_get', 'google_drive_create', 'google_drive_delete',
              'google_drive_share', 'google_drive_move'],
    },
    {
      id: 'google_sheets', name: 'Google Sheets', description: 'Spreadsheet read/write, cell operations, formulas',
      icon: '📊', requiresOAuth: 'google',
      tools: ['google_sheets_get', 'google_sheets_read', 'google_sheets_write', 'google_sheets_append',
              'google_sheets_clear', 'google_sheets_create', 'google_sheets_add_sheet'],
    },
    {
      id: 'google_docs', name: 'Google Docs', description: 'Document read/write, text insert, find & replace',
      icon: '📝', requiresOAuth: 'google',
      tools: ['google_docs_read', 'google_docs_create', 'google_docs_write'],
    },
    {
      id: 'google_contacts', name: 'Google Contacts', description: 'Contact search, directory lookup, CRUD',
      icon: '👥', requiresOAuth: 'google',
      tools: ['google_contacts_list', 'google_contacts_search', 'google_contacts_search_directory',
              'google_contacts_create', 'google_contacts_update'],
    },
    {
      id: 'google_tasks', name: 'Google Tasks', description: 'Task lists, create/complete/update tasks, due dates',
      icon: '✅', requiresOAuth: 'google',
      tools: ['google_tasks_list_tasklists', 'google_tasks_list', 'google_tasks_create', 'google_tasks_update',
              'google_tasks_complete', 'google_tasks_delete'],
    },
    {
      id: 'google_chat', name: 'Google Chat', description: 'Send messages, manage spaces, read conversations',
      icon: '💬', requiresOAuth: 'google',
      tools: ['google_chat_list_spaces', 'google_chat_list_members', 'google_chat_list_messages',
              'google_chat_send_message', 'google_chat_create_space'],
    },
    {
      id: 'google_slides', name: 'Google Slides', description: 'Create and edit presentations, add slides, text, images',
      icon: '🎨', requiresOAuth: 'google',
      tools: ['google_slides_get', 'google_slides_create', 'google_slides_add_slide',
              'google_slides_add_text', 'google_slides_add_image'],
    },
    {
      id: 'google_forms', name: 'Google Forms', description: 'Create forms, add questions, read responses',
      icon: '📋', requiresOAuth: 'google',
      tools: ['google_forms_get', 'google_forms_create', 'google_forms_add_question',
              'google_forms_responses', 'google_forms_response_summary'],
    },
    {
      id: 'meetings', name: 'Meetings', description: 'Join Google Meet calls. Take notes, chat, share screen, send summaries.',
      icon: '🎥', requiresOAuth: 'google',
      tools: ['meetings_upcoming', 'meeting_join', 'meeting_action', 'meetings_scan_inbox', 'meeting_rsvp'],
    },
    {
      id: 'google_maps', name: 'Google Maps', description: 'Places search, directions, distance calculation, geocoding, autocomplete',
      icon: '🗺️', requiresIntegration: 'google-maps',
      tools: ['google_maps_search', 'google_maps_nearby', 'google_maps_place_details', 'google_maps_directions',
              'google_maps_distance', 'google_maps_geocode', 'google_maps_autocomplete', 'google_maps_static',
              'google_maps_timezone', 'google_maps_elevation'],
    },
    {
      id: 'enterprise_database', name: 'Database', description: 'SQL queries, schema inspection, data sampling',
      icon: '🗄️',
      tools: ['enterprise_sql_query', 'enterprise_sql_schema', 'enterprise_sql_explain',
              'enterprise_sql_tables', 'enterprise_sql_sample', 'enterprise_sql_write'],
    },
    {
      id: 'enterprise_spreadsheet', name: 'Spreadsheet', description: 'CSV/Excel read, write, filter, aggregate, transform, pivot',
      icon: '📈',
      tools: ['enterprise_csv_read', 'enterprise_csv_write', 'enterprise_csv_filter', 'enterprise_csv_aggregate',
              'enterprise_csv_transform', 'enterprise_csv_merge', 'enterprise_csv_pivot', 'enterprise_csv_convert'],
    },
    {
      id: 'enterprise_documents', name: 'Documents', description: 'PDF/DOCX generation, OCR, format conversion',
      icon: '📄',
      tools: ['enterprise_pdf_generate', 'enterprise_docx_generate', 'enterprise_ocr', 'enterprise_invoice_parse',
              'enterprise_doc_convert', 'enterprise_doc_merge', 'enterprise_doc_extract', 'enterprise_doc_sign'],
    },
    {
      id: 'enterprise_http', name: 'HTTP Client', description: 'HTTP requests, GraphQL, batch calls, downloads',
      icon: '🌐',
      tools: ['enterprise_http_request', 'enterprise_http_graphql', 'enterprise_http_batch', 'enterprise_http_download'],
    },
    {
      id: 'enterprise_security', name: 'Security Scanning', description: 'Secret scanning, PII detection, dependency audit',
      icon: '🔒',
      tools: ['enterprise_secret_scan', 'enterprise_pii_scan', 'enterprise_pii_redact',
              'enterprise_dep_audit', 'enterprise_compliance_check', 'enterprise_hash'],
    },
    {
      id: 'enterprise_code', name: 'Code Sandbox', description: 'Run JavaScript, Python, shell scripts, JSON transforms',
      icon: '💻',
      tools: ['enterprise_run_js', 'enterprise_run_python', 'enterprise_run_shell',
              'enterprise_json_transform', 'enterprise_regex'],
    },
    {
      id: 'enterprise_diff', name: 'Diff', description: 'Text, JSON, and spreadsheet comparison',
      icon: '↔️',
      tools: ['enterprise_text_diff', 'enterprise_json_diff', 'enterprise_spreadsheet_diff', 'enterprise_diff_summary'],
    },
  ];

  // ═══════════════════════════════════════════════════════════
  // SYSTEM CAPABILITIES
  // ═══════════════════════════════════════════════════════════

  router.get('/bridge/system/capabilities', async (c) => {
    try {
      const { detectCapabilities, getCapabilitySummary } = await import('../runtime/environment.js');
      const caps = detectCapabilities();
      const summary = getCapabilitySummary(caps);
      return c.json({ ...summary, raw: caps });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // BROWSER CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  router.get('/bridge/agents/:id/browser-config', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    return c.json({ config: managed.config?.browserConfig || {} });
  });

  /**
   * POST /bridge/agents/:id/browser-config/launch-meeting-browser
   * Launches a meeting-ready headed Chrome instance with virtual display + audio.
   * Returns the CDP URL for the agent to connect to.
   */
  router.post('/bridge/agents/:id/browser-config/launch-meeting-browser', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    try {
      // Check system capabilities first
      const { detectCapabilities, getCapabilitySummary } = await import('../runtime/environment.js');
      const caps = detectCapabilities();
      if (!caps.canJoinMeetings) {
        const summary = getCapabilitySummary(caps);
        return c.json({
          error: 'Meeting browser cannot run on this ' + summary.deployment + ' deployment',
          deployment: summary.deployment,
          missing: summary.unavailable,
          recommendations: summary.recommendations,
          hint: 'Deploy on a VM with display + audio, or configure a Remote Browser (CDP) provider.',
        }, 400);
      }

      const { execSync, spawn } = await import('node:child_process');
      const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';

      // Check if a meeting browser is already running for this agent
      const existingPort = (managed.config as any)?.meetingBrowserPort;
      if (existingPort) {
        try {
          const resp = await fetch(`http://127.0.0.1:${existingPort}/json/version`, { signal: AbortSignal.timeout(2000) });
          if (resp.ok) {
            const data = await resp.json() as any;
            return c.json({ ok: true, alreadyRunning: true, cdpUrl: data.webSocketDebuggerUrl, port: existingPort, browserVersion: data.Browser });
          }
        } catch { /* not running, will launch new one */ }
      }

      // Find available port
      const net = await import('node:net');
      const port = await new Promise<number>((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
          const p = (srv.address() as any).port;
          srv.close(() => resolve(p));
        });
        srv.on('error', reject);
      });

      // Launch Chrome with meeting-optimized flags
      const chromeArgs = [
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-sandbox',
        // Meeting-specific: auto-grant camera/mic permissions
        '--use-fake-ui-for-media-stream',
        '--auto-accept-camera-and-microphone-capture',
        // Use virtual audio
        '--use-fake-device-for-media-stream',
        // Window size for meeting UI
        '--window-size=1920,1080',
        '--start-maximized',
        // User data dir for persistent logins
        `/tmp/meeting-browser-${agentId.slice(0, 8)}`,
      ];

      const child = spawn(chromePath, chromeArgs, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, DISPLAY: ':99' },
      });
      child.unref();

      // Wait for Chrome to be ready
      let cdpUrl = '';
      let browserVersion = '';
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const resp = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
          if (resp.ok) {
            const data = await resp.json() as any;
            cdpUrl = data.webSocketDebuggerUrl;
            browserVersion = data.Browser;
            break;
          }
        } catch { /* retry */ }
      }

      if (!cdpUrl) {
        return c.json({ error: 'Chrome launched but CDP not responding after 15s' });
      }

      // Save port to agent config for reuse
      if (!managed.config) managed.config = {} as any;
      (managed.config as any).meetingBrowserPort = port;
      (managed.config as any).meetingBrowserCdpUrl = cdpUrl;
      managed.updatedAt = new Date().toISOString();
      await lifecycle.saveAgent(agentId);

      return c.json({ ok: true, cdpUrl, port, browserVersion, pid: child.pid });
    } catch (e: any) {
      return c.json({ error: 'Failed to launch meeting browser: ' + e.message });
    }
  });

  /**
   * POST /bridge/agents/:id/browser-config/stop-meeting-browser
   * Kills the meeting browser process for this agent.
   */
  router.post('/bridge/agents/:id/browser-config/stop-meeting-browser', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    try {
      const port = (managed.config as any)?.meetingBrowserPort;
      if (!port) return c.json({ error: 'No meeting browser is tracked for this agent' }, 400);

      // Try to close gracefully via CDP
      let closed = false;
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
          // Get the websocket URL and send Browser.close
          const data = await resp.json() as any;
          if (data.webSocketDebuggerUrl) {
            try {
              const closeResp = await fetch(`http://127.0.0.1:${port}/json/close`, { method: 'PUT', signal: AbortSignal.timeout(3000) });
              closed = true;
            } catch { /* fallback to kill */ }
          }
        }
      } catch { /* not running or not reachable */ }

      // Fallback: kill by port
      if (!closed) {
        try {
          const { execSync } = await import('node:child_process');
          execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { timeout: 5000 });
          closed = true;
        } catch { /* already dead */ }
      }

      // Clear config
      delete (managed.config as any).meetingBrowserPort;
      delete (managed.config as any).meetingBrowserCdpUrl;
      managed.updatedAt = new Date().toISOString();
      await lifecycle.saveAgent(agentId);

      return c.json({ ok: true, stopped: true, port });
    } catch (e: any) {
      return c.json({ error: 'Failed to stop meeting browser: ' + e.message }, 500);
    }
  });

  router.post('/bridge/agents/:id/browser-config/test', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const cfg = managed.config?.browserConfig || {};
    const provider = cfg.provider || 'local';

    try {
      if (provider === 'local') {
        // Test local Chromium availability
        try {
          const { execSync } = await import('node:child_process');
          const chromePath = cfg.executablePath || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
          const version = execSync(`${chromePath} --version 2>/dev/null || echo "not found"`, { timeout: 5000 }).toString().trim();
          if (version.includes('not found')) {
            return c.json({ error: 'Chromium not found at ' + chromePath });
          }
          return c.json({ ok: true, browserVersion: version, provider: 'local' });
        } catch (e: any) {
          return c.json({ error: 'Chromium not available: ' + e.message });
        }
      }

      if (provider === 'remote-cdp') {
        if (!cfg.cdpUrl) return c.json({ error: 'CDP URL not configured' });
        try {
          // Extract HTTP URL from WS URL to query /json/version
          const wsUrl = new URL(cfg.cdpUrl);
          const httpUrl = `http://${wsUrl.hostname}:${wsUrl.port}/json/version`;
          const resp = await fetch(httpUrl, { signal: AbortSignal.timeout(cfg.cdpTimeout || 10000) });
          if (!resp.ok) return c.json({ error: `CDP endpoint returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: data.Browser || data['User-Agent'], webSocketUrl: data.webSocketDebuggerUrl, provider: 'remote-cdp' });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to CDP: ' + e.message });
        }
      }

      if (provider === 'browserless') {
        if (!cfg.browserlessToken) return c.json({ error: 'Browserless API token not configured' });
        const endpoint = cfg.browserlessEndpoint || 'https://chrome.browserless.io';
        try {
          const resp = await fetch(`${endpoint}/config?token=${cfg.browserlessToken}`, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return c.json({ error: `Browserless returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: data.chrome?.version || 'Connected', provider: 'browserless', concurrent: data.concurrent });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to Browserless: ' + e.message });
        }
      }

      if (provider === 'browserbase') {
        if (!cfg.browserbaseApiKey) return c.json({ error: 'Browserbase API key not configured' });
        try {
          const resp = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'x-bb-api-key': cfg.browserbaseApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: cfg.browserbaseProjectId }),
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) return c.json({ error: `Browserbase returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: 'Session created: ' + (data.id || 'OK'), provider: 'browserbase' });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to Browserbase: ' + e.message });
        }
      }

      if (provider === 'steel') {
        if (!cfg.steelApiKey) return c.json({ error: 'Steel API key not configured' });
        const endpoint = cfg.steelEndpoint || 'https://api.steel.dev';
        try {
          const resp = await fetch(`${endpoint}/v1/sessions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cfg.steelApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeout: 60 }),
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) return c.json({ error: `Steel returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: 'Session: ' + (data.id || 'OK'), provider: 'steel' });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to Steel: ' + e.message });
        }
      }

      return c.json({ ok: true, provider, note: 'Connection test not implemented for this provider' });
    } catch (e: any) {
      return c.json({ error: e.message });
    }
  });

  router.put('/bridge/agents/:id/browser-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    const body = await c.req.json();
    if (!managed.config) managed.config = {} as any;
    managed.config.browserConfig = body;
    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════
  // TOOL RESTRICTIONS
  // ═══════════════════════════════════════════════════════════

  router.get('/bridge/agents/:id/tool-restrictions', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    return c.json({ restrictions: managed.config?.toolRestrictions || {} });
  });

  router.put('/bridge/agents/:id/tool-restrictions', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    const body = await c.req.json();
    if (!managed.config) managed.config = {} as any;
    managed.config.toolRestrictions = body;
    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true });
  });

  /**
   * GET /bridge/agents/:id/tools — List available tool categories with enabled/disabled status
   */
  router.get('/bridge/agents/:id/tools', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const toolConfig = managed.config?.toolAccess || {};
    const emailConfig = managed.config?.emailConfig;
    const hasGoogleOAuth = emailConfig?.oauthProvider === 'google' && emailConfig?.oauthAccessToken;
    const hasMicrosoftOAuth = emailConfig?.oauthProvider === 'microsoft' && emailConfig?.oauthAccessToken;

    const categories = TOOL_CATALOG.map((cat: any) => {
      const isAvailable = cat.requiresOAuth
        ? (cat.requiresOAuth === 'google' && hasGoogleOAuth) || (cat.requiresOAuth === 'microsoft' && hasMicrosoftOAuth)
        : cat.requiresIntegration
          ? true // Integration availability is checked at runtime via vault
          : true;

      // Default: core is always on, others on if available
      const defaultEnabled = cat.alwaysOn || isAvailable;
      const enabled = cat.alwaysOn ? true : (toolConfig[cat.id] !== undefined ? toolConfig[cat.id] : defaultEnabled);

      return {
        id: cat.id, name: cat.name, description: cat.description, icon: cat.icon,
        toolCount: cat.tools.length, tools: cat.tools,
        enabled, isAvailable, alwaysOn: cat.alwaysOn || false,
        requiresOAuth: cat.requiresOAuth || null,
        requiresIntegration: cat.requiresIntegration || null,
      };
    });

    const totalTools = categories.reduce((s, c) => s + c.toolCount, 0);
    const enabledTools = categories.filter(c => c.enabled).reduce((s, c) => s + c.toolCount, 0);

    return c.json({ categories, totalTools, enabledTools });
  });

  /**
   * PUT /bridge/agents/:id/tools — Update tool access configuration
   * Body: { [categoryId]: boolean }
   */
  router.put('/bridge/agents/:id/tools', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    if (!managed.config) managed.config = {} as any;
    if (!managed.config.toolAccess) managed.config.toolAccess = {};

    for (const [catId, enabled] of Object.entries(body)) {
      // Don't allow disabling core tools
      const cat = TOOL_CATALOG.find(c => c.id === catId);
      if (cat?.alwaysOn) continue;
      managed.config.toolAccess[catId] = !!enabled;
    }

    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true, toolAccess: managed.config.toolAccess });
  });

  return router;
}
