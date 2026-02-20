import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-whiteboard',
  name: 'Whiteboard',
  description: 'Collaborative digital whiteboard for brainstorming and visual collaboration.',
  category: 'collaboration',
  risk: 'low',
  icon: '🖊️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_wb_create', name: 'Create Whiteboard', description: 'Create whiteboard', category: 'write', risk: 'low', skillId: 'm365-whiteboard', sideEffects: [] },
];
