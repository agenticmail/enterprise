import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-gmail',
  name: 'Gmail',
  description: 'Send, read, search, label, draft, and manage emails via Gmail API.',
  category: 'communication',
  risk: 'high',
  icon: '✉️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gmail_search', name: 'Search Gmail', description: 'Search Gmail with queries', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_read', name: 'Read Email', description: 'Read a Gmail message', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_thread', name: 'Read Thread', description: 'Read a Gmail thread', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_send', name: 'Send Email', description: 'Send email via Gmail', category: 'communicate', risk: 'high', skillId: 'gws-gmail', sideEffects: ['sends-email'] },
  { id: 'gmail_reply', name: 'Reply', description: 'Reply to a Gmail message', category: 'communicate', risk: 'high', skillId: 'gws-gmail', sideEffects: ['sends-email'] },
  { id: 'gmail_forward', name: 'Forward', description: 'Forward a Gmail message', category: 'communicate', risk: 'high', skillId: 'gws-gmail', sideEffects: ['sends-email'] },
  { id: 'gmail_modify', name: 'Modify Labels', description: 'Add/remove labels on messages', category: 'write', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_trash', name: 'Trash', description: 'Move message to trash', category: 'destroy', risk: 'medium', skillId: 'gws-gmail', sideEffects: ['deletes-data'] },
  { id: 'gmail_labels', name: 'Manage Labels', description: 'List/create/delete Gmail labels', category: 'write', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_drafts', name: 'Drafts', description: 'List/create/send drafts', category: 'write', risk: 'medium', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_attachment', name: 'Attachment', description: 'Download email attachment', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_profile', name: 'Profile', description: 'Get Gmail profile info', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_vacation', name: 'Vacation Responder', description: 'Get/set vacation auto-reply', category: 'write', risk: 'medium', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_get_signature', name: 'Get Signature', description: 'Get Gmail signature', category: 'read', risk: 'low', skillId: 'gws-gmail', sideEffects: [] },
  { id: 'gmail_set_signature', name: 'Set Signature', description: 'Set Gmail signature', category: 'write', risk: 'medium', skillId: 'gws-gmail', sideEffects: [] },
];
