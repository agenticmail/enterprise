import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-groups',
  name: 'Google Groups',
  description: 'Mailing lists, access groups, and group management.',
  category: 'communication',
  risk: 'low',
  icon: '👥',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_groups_create', name: 'Create Group', description: 'Create Google Group', category: 'write', risk: 'medium', skillId: 'gws-groups', sideEffects: [] },
  { id: 'gws_groups_members', name: 'Manage Members', description: 'Add/remove group members', category: 'write', risk: 'medium', skillId: 'gws-groups', sideEffects: [] },
];
