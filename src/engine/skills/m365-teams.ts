import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-teams',
  name: 'Microsoft Teams',
  description: 'Chat, channels, meetings, calls, and screen sharing. Manage teams and channels programmatically.',
  category: 'collaboration',
  risk: 'medium',
  icon: '💜',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_teams_send', name: 'Send Message', description: 'Send message in Teams channel or chat', category: 'communicate', risk: 'medium', skillId: 'm365-teams', sideEffects: ['sends-message'] },
  { id: 'm365_teams_read', name: 'Read Messages', description: 'Read Teams messages', category: 'read', risk: 'low', skillId: 'm365-teams', sideEffects: [] },
  { id: 'm365_teams_channels', name: 'List Channels', description: 'List Teams channels', category: 'read', risk: 'low', skillId: 'm365-teams', sideEffects: [] },
  { id: 'm365_teams_create_channel', name: 'Create Channel', description: 'Create Teams channel', category: 'write', risk: 'medium', skillId: 'm365-teams', sideEffects: [] },
  { id: 'm365_teams_meeting', name: 'Schedule Meeting', description: 'Schedule Teams meeting', category: 'write', risk: 'medium', skillId: 'm365-teams', sideEffects: ['sends-email'] },
  { id: 'm365_teams_members', name: 'Manage Members', description: 'Add/remove team members', category: 'write', risk: 'medium', skillId: 'm365-teams', sideEffects: [] },
];
