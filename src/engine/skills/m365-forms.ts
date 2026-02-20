import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-forms',
  name: 'Microsoft Forms',
  description: 'Create surveys, quizzes, polls, and collect responses.',
  category: 'productivity',
  risk: 'low',
  icon: '📋',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_forms_create', name: 'Create Form', description: 'Create Microsoft Form', category: 'write', risk: 'low', skillId: 'm365-forms', sideEffects: [] },
  { id: 'm365_forms_responses', name: 'Get Responses', description: 'Get form responses', category: 'read', risk: 'low', skillId: 'm365-forms', sideEffects: [] },
];
