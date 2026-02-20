import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-vault',
  name: 'Google Vault',
  description: 'eDiscovery, litigation holds, compliance, and data retention.',
  category: 'legal',
  risk: 'high',
  icon: '🏛️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_vault_holds', name: 'Manage Holds', description: 'Create/manage litigation holds', category: 'write', risk: 'high', skillId: 'gws-vault', sideEffects: [] },
  { id: 'gws_vault_export', name: 'Export Data', description: 'Export data for eDiscovery', category: 'read', risk: 'high', skillId: 'gws-vault', sideEffects: [] },
];
