import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-calendar',
  name: 'Google Calendar',
  description: 'Event management, scheduling, and free/busy lookup.',
  category: 'productivity',
  risk: 'medium',
  icon: '📅',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_calendar_list', name: 'List Calendars', description: 'List available calendars', category: 'read', risk: 'low', skillId: 'gws-calendar', sideEffects: [] },
  { id: 'google_calendar_events', name: 'List Events', description: 'List calendar events', category: 'read', risk: 'low', skillId: 'gws-calendar', sideEffects: [] },
  { id: 'google_calendar_create_event', name: 'Create Event', description: 'Create calendar event', category: 'write', risk: 'medium', skillId: 'gws-calendar', sideEffects: ['sends-email'] },
  { id: 'google_calendar_update_event', name: 'Update Event', description: 'Update calendar event', category: 'write', risk: 'medium', skillId: 'gws-calendar', sideEffects: [] },
  { id: 'google_calendar_delete_event', name: 'Delete Event', description: 'Delete calendar event', category: 'destroy', risk: 'medium', skillId: 'gws-calendar', sideEffects: ['deletes-data'] },
  { id: 'google_calendar_freebusy', name: 'Free/Busy', description: 'Check free/busy availability', category: 'read', risk: 'low', skillId: 'gws-calendar', sideEffects: [] },
];
