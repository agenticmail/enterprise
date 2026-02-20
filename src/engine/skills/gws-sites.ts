import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-sites',
  name: 'Google Sites',
  description: 'Simple website creation and publishing.',
  category: 'productivity',
  risk: 'low',
  icon: '🌐',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_sites_create', name: 'Create Site', description: 'Create Google Site', category: 'write', risk: 'low', skillId: 'gws-sites', sideEffects: [] },
];
