import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-bookings',
  name: 'Bookings',
  description: 'Appointment scheduling, calendar management, and booking pages.',
  category: 'productivity',
  risk: 'low',
  icon: '📅',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_bookings_list', name: 'List Bookings', description: 'List appointments', category: 'read', risk: 'low', skillId: 'm365-bookings', sideEffects: [] },
  { id: 'm365_bookings_create', name: 'Create Booking', description: 'Create appointment', category: 'write', risk: 'low', skillId: 'm365-bookings', sideEffects: ['sends-email'] },
];
