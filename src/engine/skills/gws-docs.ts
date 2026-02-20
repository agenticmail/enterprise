import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-docs',
  name: 'Google Docs',
  description: 'Collaborative document editing, comments, suggestions, and templates.',
  category: 'productivity',
  risk: 'low',
  icon: '📄',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_docs_create', name: 'Create Doc', description: 'Create Google Doc', category: 'write', risk: 'low', skillId: 'gws-docs', sideEffects: ['modifies-files'] },
  { id: 'gws_docs_edit', name: 'Edit Doc', description: 'Edit Google Doc content', category: 'write', risk: 'low', skillId: 'gws-docs', sideEffects: ['modifies-files'] },
  { id: 'gws_docs_read', name: 'Read Doc', description: 'Read Google Doc content', category: 'read', risk: 'low', skillId: 'gws-docs', sideEffects: [] },
];
