import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-gmail',
  name: 'Gmail',
  description: 'Google email — send, receive, labels, filters, and smart compose.',
  category: 'communication',
  risk: 'medium',
  icon: '✉️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_gmail_send', name: 'Send Email', description: 'Send email via Gmail', category: 'communicate', risk: 'high', skillId: 'gws-gmail', sideEffects: ['sends-email'] },
  { id: 'gws_gmail_read', name: 'Read Email', description: 'Read Gmail messages', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gws_gmail_search', name: 'Search Gmail', description: 'Search Gmail with queries', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gws_gmail_labels', name: 'Manage Labels', description: 'Create/edit Gmail labels', category: 'write', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gws_gmail_filters', name: 'Manage Filters', description: 'Create/edit Gmail filters', category: 'write', risk: 'medium', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gws_gmail_delete', name: 'Delete Email', description: 'Delete Gmail message', category: 'destroy', risk: 'medium', skillId: 'gws-gmail', sideEffects: ['deletes-data'] },
];
