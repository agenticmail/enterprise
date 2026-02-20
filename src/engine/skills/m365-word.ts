import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-word',
  name: 'Word',
  description: 'Create, edit, and format documents. Mail merge, templates, and document generation.',
  category: 'productivity',
  risk: 'low',
  icon: '📝',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'm365_word_create',
    name: 'Create Document',
    description: 'Create Word document',
    category: 'write',
    risk: 'low',
    skillId: 'm365-word',
    sideEffects: ['modifies-files'],
  },
  {
    id: 'm365_word_edit',
    name: 'Edit Document',
    description: 'Edit Word document content',
    category: 'write',
    risk: 'low',
    skillId: 'm365-word',
    sideEffects: ['modifies-files'],
  },
  {
    id: 'm365_word_export',
    name: 'Export Document',
    description: 'Export Word document to PDF',
    category: 'read',
    risk: 'low',
    skillId: 'm365-word',
    sideEffects: [],
  },
];
