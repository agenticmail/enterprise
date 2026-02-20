import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-calendar',
  name: 'Google Calendar',
  description: 'Events, scheduling, availability, room booking, and calendar sharing.',
  category: 'productivity',
  risk: 'low',
  icon: '📅',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_cal_list', name: 'List Events', description: 'List Google Calendar events', category: 'read', risk: 'low', skillId: 'gws-calendar', sideEffects: [] },
  { id: 'gws_cal_create', name: 'Create Event', description: 'Create calendar event', category: 'write', risk: 'medium', skillId: 'gws-calendar', sideEffects: ['sends-email'] },
  { id: 'gws_cal_update', name: 'Update Event', description: 'Update calendar event', category: 'write', risk: 'medium', skillId: 'gws-calendar', sideEffects: [] },
  { id: 'gws_cal_delete', name: 'Delete Event', description: 'Delete calendar event', category: 'destroy', risk: 'medium', skillId: 'gws-calendar', sideEffects: ['deletes-data'] },
  { id: 'gws_cal_freebusy', name: 'Check Availability', description: 'Check free/busy status', category: 'read', risk: 'low', skillId: 'gws-calendar', sideEffects: [] },
];
