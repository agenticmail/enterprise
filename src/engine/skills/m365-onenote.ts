import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-onenote',
  name: 'OneNote',
  description: 'Digital notebooks, sections, pages, and handwriting recognition.',
  category: 'productivity',
  risk: 'low',
  icon: '📓',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_onenote_read', name: 'Read Notebook', description: 'Read OneNote pages', category: 'read', risk: 'low', skillId: 'm365-onenote', sideEffects: [] },
  { id: 'm365_onenote_write', name: 'Write Notebook', description: 'Create/edit OneNote pages', category: 'write', risk: 'low', skillId: 'm365-onenote', sideEffects: [] },
];
