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

  router.get('/agents/:id', (c) => {
    const agent = lifecycle.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    return c.json({ agent });
  });

  router.patch('/agents/:id/config', async (c) => {
    const { updates, updatedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || updatedBy;
      const agent = await lifecycle.updateConfig(c.req.param('id'), updates, actor);
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

  router.get('/agents/:id/usage', (c) => {
    const agent = lifecycle.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
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
    const { orgId, name, email, displayName, role, model, deployment, permissionProfile, presetName, createdBy, persona, permissions: permissionsData } = await c.req.json();

    if (!name || !orgId) {
      return c.json({ error: 'name and orgId are required' }, 400);
    }

    const actor = c.req.header('X-User-Id') || createdBy || 'system';
    const agentId = crypto.randomUUID();

    // Build the engine AgentConfig
    const config: any = {
      id: agentId,
      name,
      displayName: displayName || name,
      identity: {
        role: role || 'assistant',
        personality: 'professional',
        ...(persona?.avatar && { avatar: persona.avatar }),
        ...(persona?.gender && { gender: persona.gender }),
        ...(persona?.dateOfBirth && { dateOfBirth: persona.dateOfBirth }),
        ...(persona?.maritalStatus && { maritalStatus: persona.maritalStatus }),
        ...(persona?.culturalBackground && { culturalBackground: persona.culturalBackground }),
        ...(persona?.language && { language: persona.language }),
        ...(persona?.traits && { traits: persona.traits }),
      },
      model: model || {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        thinkingLevel: 'medium',
      },
      deployment: deployment || {
        target: 'docker',
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

      permissions.setProfile(agentId, profile as any);
    }

    const _adminDb = getAdminDb();

    try {
      // 1) Create admin agent record (shared ID)
      let adminAgent = null;
      if (_adminDb) {
        adminAgent = await _adminDb.createAgent({
          id: agentId,
          name,
          email: email || `${name.toLowerCase().replace(/\s+/g, '-')}@agenticmail.local`,
          role: role || 'assistant',
          metadata: { engineLinked: true, orgId },
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

  return router;
}
