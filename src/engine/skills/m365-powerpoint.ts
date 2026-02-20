import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-powerpoint',
  name: 'PowerPoint',
  description: 'Create and edit presentations, slides, animations, and speaker notes.',
  category: 'productivity',
  risk: 'low',
  icon: '📽️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'm365_ppt_create',
    name: 'Create Presentation',
    description: 'Create PowerPoint file',
    category: 'write',
    risk: 'low',
    skillId: 'm365-powerpoint',
    sideEffects: ['modifies-files'],
  },
  {
    id: 'm365_ppt_edit',
    name: 'Edit Slides',
    description: 'Edit PowerPoint slides',
    category: 'write',
    risk: 'low',
    skillId: 'm365-powerpoint',
    sideEffects: ['modifies-files'],
  },
];
