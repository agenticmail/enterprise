import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-forms',
  name: 'Google Forms',
  description: 'Surveys, quizzes, and response collection.',
  category: 'productivity',
  risk: 'low',
  icon: '📋',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_forms_create', name: 'Create Form', description: 'Create Google Form', category: 'write', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'gws_forms_responses', name: 'Get Responses', description: 'Get form responses', category: 'read', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
];
