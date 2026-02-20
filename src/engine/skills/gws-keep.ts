import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-keep',
  name: 'Google Keep',
  description: 'Notes, lists, reminders, and labels.',
  category: 'productivity',
  risk: 'low',
  icon: '📌',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_keep_create', name: 'Create Note', description: 'Create Google Keep note', category: 'write', risk: 'low', skillId: 'gws-keep', sideEffects: [] },
  { id: 'gws_keep_list', name: 'List Notes', description: 'List Google Keep notes', category: 'read', risk: 'low', skillId: 'gws-keep', sideEffects: [] },
];
