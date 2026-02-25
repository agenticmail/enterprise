import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-meet',
  name: 'Google Meet',
  description: 'Join meetings, take notes, chat, share screen, send summaries.',
  category: 'collaboration',
  risk: 'medium',
  icon: Emoji.video,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'meetings_upcoming', name: 'Upcoming Meetings', description: 'List upcoming meetings from calendar', category: 'read', risk: 'low', skillId: 'gws-meet', sideEffects: [] },
  { id: 'meeting_join', name: 'Join Meeting', description: 'Join a Google Meet call', category: 'write', risk: 'medium', skillId: 'gws-meet', sideEffects: [] },
  { id: 'meeting_action', name: 'Meeting Action', description: 'Chat, share screen, take notes in a meeting', category: 'write', risk: 'medium', skillId: 'gws-meet', sideEffects: ['sends-message'] },
  { id: 'meetings_scan_inbox', name: 'Scan Inbox', description: 'Scan inbox for meeting invites', category: 'read', risk: 'low', skillId: 'gws-meet', sideEffects: [] },
  { id: 'meeting_rsvp', name: 'RSVP', description: 'Accept or decline a meeting invite', category: 'write', risk: 'medium', skillId: 'gws-meet', sideEffects: ['sends-email'] },
  { id: 'meeting_speak', name: 'Speak in Meeting', description: 'Speak via TTS in a meeting', category: 'write', risk: 'medium', skillId: 'gws-meet', sideEffects: [] },
  { id: 'meeting_audio_setup', name: 'Audio Setup', description: 'Configure meeting audio', category: 'write', risk: 'low', skillId: 'gws-meet', sideEffects: [] },
  { id: 'meeting_voices', name: 'List Voices', description: 'List available TTS voices', category: 'read', risk: 'low', skillId: 'gws-meet', sideEffects: [] },
];
