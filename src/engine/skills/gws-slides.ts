import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-slides',
  name: 'Google Slides',
  description: 'Presentations, slides, speaker notes, and collaborative editing.',
  category: 'productivity',
  risk: 'low',
  icon: '🎞️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_slides_create', name: 'Create Slides', description: 'Create Google Slides', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'gws_slides_edit', name: 'Edit Slides', description: 'Edit presentation slides', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: [] },
];
