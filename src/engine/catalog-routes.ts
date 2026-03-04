/**
 * Catalog Routes — Skills + Souls + Permission Profiles + Config Generation
 * Mounted at / on the engine sub-app (routes define /skills/*, /souls/*, /profiles/*, /permissions/*, /config/*).
 */

import { Hono } from 'hono';
import type { PermissionEngine, SkillSuite } from './skills.js';
import type { SkillDefinition } from './skills.js';
import type { AgentConfigGenerator, AgentConfig } from './agent-config.js';
import type { AgentLifecycleManager } from './lifecycle.js';

interface PresetProfile {
  name: string;
  [key: string]: any;
}

interface SoulLibrary {
  getSoulTemplates: () => any[];
  getSoulTemplatesByCategory: () => Record<string, any[]>;
  getSoulTemplate: (id: string) => any | undefined;
  searchSoulTemplates: (query: string) => any[];
  SOUL_CATEGORIES: Record<string, any>;
}

export function createCatalogRoutes(opts: {
  skills: Omit<SkillDefinition, 'tools'>[];
  presets: readonly PresetProfile[];
  permissions: PermissionEngine;
  configGen: AgentConfigGenerator;
  soulLib: SoulLibrary;
  suites?: SkillSuite[];
  lifecycle?: AgentLifecycleManager;
}) {
  const { skills, presets, permissions, configGen, soulLib, suites = [], lifecycle } = opts;

  /** Resolve org ID from Hono context or body. */
  function resolveOrgId(c: any, body: any): string {
    return body?.orgId || c.get?.('orgId') || c.req?.header('x-org-id') || 'default';
  }
  const router = new Hono();

  // ─── Skills Catalog ─────────────────────────────────────

  router.get('/skills', (c) => {
    return c.json({ skills, categories: [...new Set(skills.map(s => s.category))], total: skills.length });
  });

  router.get('/skills/by-category', (c) => {
    const grouped: Record<string, typeof skills> = {};
    for (const skill of skills) {
      if (!grouped[skill.category]) grouped[skill.category] = [];
      grouped[skill.category].push(skill);
    }
    return c.json({ categories: grouped });
  });

  router.get('/skills/suites', (c) => {
    return c.json({ suites, total: suites.length });
  });

  router.get('/skills/:id', (c) => {
    const skill = skills.find(s => s.id === c.req.param('id'));
    if (!skill) return c.json({ error: 'Skill not found' }, 404);
    return c.json({ skill });
  });

  // ─── Soul Library (Pre-built Role Templates) ────────────

  // Helper: load custom roles from DB
  const getCustomRoles = async (orgId?: string) => {
    try {
      const db = (lifecycle as any)?.engineDb;
      if (!db) return [];
      const sql = orgId
        ? 'SELECT * FROM custom_roles WHERE (org_id = ? OR org_id IS NULL) ORDER BY category, name'
        : 'SELECT * FROM custom_roles ORDER BY category, name';
      const params = orgId ? [orgId] : [];
      const rows = (await db.query(sql, params).catch(() => [])).filter((r: any) => r.is_active !== false && r.is_active !== 0);
      return (rows || []).map((r: any) => {
        const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
        return {
          id: r.id, name: r.name, category: r.category || 'operations',
          description: r.description, personality: r.personality || '',
          identity: parse(r.identity) || {}, suggestedSkills: parse(r.suggested_skills) || [],
          suggestedPreset: r.suggested_preset || null, tags: parse(r.tags) || [],
          isCustom: true,
        };
      });
    } catch { return []; }
  };

  router.get('/souls', async (c) => {
    const templates = soulLib.getSoulTemplates();
    const custom = await getCustomRoles(c.req.query('orgId') || undefined);
    const all = templates.concat(custom);
    return c.json({ templates: all, categories: soulLib.SOUL_CATEGORIES, total: all.length });
  });

  router.get('/souls/by-category', async (c) => {
    const categories = soulLib.getSoulTemplatesByCategory();
    const custom = await getCustomRoles(c.req.query('orgId') || undefined);
    // Merge custom roles into categories
    for (const role of custom) {
      const cat = role.category || 'operations';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(role);
    }
    return c.json({ categories, categoryMeta: soulLib.SOUL_CATEGORIES });
  });

  router.get('/souls/search', async (c) => {
    const q = c.req.query('q') || '';
    const results = soulLib.searchSoulTemplates(q);
    const custom = await getCustomRoles();
    const filtered = custom.filter((r: any) => {
      const ql = q.toLowerCase();
      return (r.name || '').toLowerCase().includes(ql) || (r.description || '').toLowerCase().includes(ql) || (r.tags || []).some((t: string) => t.includes(ql));
    });
    return c.json({ templates: results.concat(filtered), total: results.length + filtered.length });
  });

  router.get('/souls/:id', async (c) => {
    const template = soulLib.getSoulTemplate(c.req.param('id'));
    if (template) return c.json({ template });
    // Check custom roles
    try {
      const db = (lifecycle as any)?.engineDb;
      if (db) {
        const rows = await db.query('SELECT * FROM custom_roles WHERE id = ?', [c.req.param('id')]);
        const row = rows[0];
        if (row) {
          const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
          return c.json({ template: { id: row.id, name: row.name, category: row.category, description: row.description, personality: row.personality, identity: parse(row.identity), suggestedSkills: parse(row.suggested_skills), suggestedPreset: row.suggested_preset, tags: parse(row.tags), isCustom: true } });
        }
      }
    } catch {}
    return c.json({ error: 'Soul template not found' }, 404);
  });

  // ─── Permission Profiles ────────────────────────────────

  router.get('/profiles/presets', (c) => c.json({ presets }));

  router.get('/profiles/:agentId', (c) => {
    const profile = permissions.getProfile(c.req.param('agentId'));
    if (!profile) return c.json({ error: 'No profile assigned' }, 404);
    return c.json({ profile });
  });

  router.put('/profiles/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    const profile = await c.req.json();
    const orgId = resolveOrgId(c, profile);
    profile.id = profile.id || agentId;
    profile.updatedAt = new Date().toISOString();
    if (!profile.createdAt) profile.createdAt = profile.updatedAt;
    permissions.setProfile(agentId, profile, orgId);
    // Also persist permissionProfileId into agent config
    if (lifecycle) {
      const agent = lifecycle.getAgent(agentId);
      if (agent) {
        agent.config.permissionProfileId = profile.id;
        agent.permissionProfileId = profile.id;
        lifecycle.saveAgent(agentId).catch(() => {});
      }
    }
    return c.json({ success: true, profile });
  });

  router.post('/profiles/:agentId/apply-preset', async (c) => {
    const agentId = c.req.param('agentId');
    const { presetName } = await c.req.json();
    const orgId = resolveOrgId(c, {});
    const preset = presets.find(p => p.name === presetName);
    if (!preset) return c.json({ error: 'Preset not found' }, 404);
    const profile = { ...preset, id: agentId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    permissions.setProfile(agentId, profile as any, orgId);
    // Also persist permissionProfileId into agent config
    if (lifecycle) {
      const agent = lifecycle.getAgent(agentId);
      if (agent) {
        agent.config.permissionProfileId = agentId;
        agent.permissionProfileId = agentId;
        lifecycle.saveAgent(agentId).catch(() => {});
      }
    }
    return c.json({ success: true, profile });
  });

  router.post('/permissions/check', async (c) => {
    const { agentId, toolId } = await c.req.json();
    return c.json(permissions.checkPermission(agentId, toolId));
  });

  router.get('/permissions/:agentId/tools', (c) => {
    const tools = permissions.getAvailableTools(c.req.param('agentId'));
    return c.json({ tools, total: tools.length });
  });

  router.get('/permissions/:agentId/policy', (c) => {
    return c.json(permissions.generateToolPolicy(c.req.param('agentId')));
  });

  // ─── Config Generation ──────────────────────────────────

  router.post('/config/workspace', async (c) => {
    const config: AgentConfig = await c.req.json();
    return c.json({ files: configGen.generateWorkspace(config) });
  });

  router.post('/config/gateway', async (c) => {
    const config: AgentConfig = await c.req.json();
    return c.json({ config: configGen.generateGatewayConfig(config) });
  });

  router.post('/config/docker-compose', async (c) => {
    const config: AgentConfig = await c.req.json();
    return c.json({ compose: configGen.generateDockerCompose(config) });
  });

  router.post('/config/systemd', async (c) => {
    const config: AgentConfig = await c.req.json();
    return c.json({ unit: configGen.generateSystemdUnit(config) });
  });

  router.post('/config/deploy-script', async (c) => {
    const config: AgentConfig = await c.req.json();
    return c.json({ script: configGen.generateVPSDeployScript(config) });
  });

  return router;
}
