import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-chat',
  name: 'Google Chat',
  description: 'Messaging, spaces, threads, and bot integrations.',
  category: 'collaboration',
  risk: 'medium',
  icon: '💬',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_chat_send', name: 'Send Chat', description: 'Send Google Chat message', category: 'communicate', risk: 'medium', skillId: 'gws-chat', sideEffects: ['sends-message'] },
  { id: 'gws_chat_spaces', name: 'List Spaces', description: 'List Chat spaces', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
];
