/**
 * Catalog Routes — Skills + Souls + Permission Profiles + Config Generation
 * Mounted at / on the engine sub-app (routes define /skills/*, /souls/*, /profiles/*, /permissions/*, /config/*).
 */

import { Hono } from 'hono';
import type { PermissionEngine, SkillSuite } from './skills.js';
import type { SkillDefinition } from './skills.js';
import type { AgentConfigGenerator, AgentConfig } from './agent-config.js';

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
}) {
  const { skills, presets, permissions, configGen, soulLib, suites = [] } = opts;
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

  router.get('/souls', (c) => {
    const templates = soulLib.getSoulTemplates();
    return c.json({ templates, categories: soulLib.SOUL_CATEGORIES, total: templates.length });
  });

  router.get('/souls/by-category', (c) => {
    return c.json({ categories: soulLib.getSoulTemplatesByCategory(), categoryMeta: soulLib.SOUL_CATEGORIES });
  });

  router.get('/souls/search', (c) => {
    const q = c.req.query('q') || '';
    const results = soulLib.searchSoulTemplates(q);
    return c.json({ templates: results, total: results.length });
  });

  router.get('/souls/:id', (c) => {
    const template = soulLib.getSoulTemplate(c.req.param('id'));
    if (!template) return c.json({ error: 'Soul template not found' }, 404);
    return c.json({ template });
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
    profile.id = profile.id || agentId;
    profile.updatedAt = new Date().toISOString();
    if (!profile.createdAt) profile.createdAt = profile.updatedAt;
    permissions.setProfile(agentId, profile);
    return c.json({ success: true, profile });
  });

  router.post('/profiles/:agentId/apply-preset', async (c) => {
    const agentId = c.req.param('agentId');
    const { presetName } = await c.req.json();
    const preset = presets.find(p => p.name === presetName);
    if (!preset) return c.json({ error: 'Preset not found' }, 404);
    const profile = { ...preset, id: agentId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    permissions.setProfile(agentId, profile as any);
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
