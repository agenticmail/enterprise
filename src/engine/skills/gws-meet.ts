import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-meet',
  name: 'Google Meet',
  description: 'Video conferencing, screen sharing, recording, and breakout rooms.',
  category: 'collaboration',
  risk: 'medium',
  icon: '📹',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_meet_create', name: 'Create Meeting', description: 'Create Google Meet link', category: 'write', risk: 'low', skillId: 'gws-meet', sideEffects: [] },
  { id: 'gws_meet_list', name: 'List Recordings', description: 'List Meet recordings', category: 'read', risk: 'low', skillId: 'gws-meet', sideEffects: [] },
];
