import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-outlook',
  name: 'Outlook',
  description: 'Email, calendar, contacts, and scheduling via Microsoft Outlook. Send/receive mail, manage events, book rooms.',
  category: 'communication',
  risk: 'medium',
  icon: '📬',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_mail_send', name: 'Send Mail', description: 'Send email via Outlook', category: 'communicate', risk: 'high', skillId: 'm365-outlook', sideEffects: ['sends-email'] },
  { id: 'm365_mail_read', name: 'Read Mail', description: 'Read emails from mailbox', category: 'read', risk: 'low', skillId: 'm365-outlook', sideEffects: [] },
  { id: 'm365_mail_search', name: 'Search Mail', description: 'Search mailbox with filters', category: 'read', risk: 'low', skillId: 'm365-outlook', sideEffects: [] },
  { id: 'm365_mail_delete', name: 'Delete Mail', description: 'Delete email from mailbox', category: 'destroy', risk: 'medium', skillId: 'm365-outlook', sideEffects: ['deletes-data'] },
  { id: 'm365_mail_move', name: 'Move Mail', description: 'Move email to folder', category: 'write', risk: 'low', skillId: 'm365-outlook', sideEffects: [] },
  { id: 'm365_mail_reply', name: 'Reply to Mail', description: 'Reply to an email', category: 'communicate', risk: 'high', skillId: 'm365-outlook', sideEffects: ['sends-email'] },
  { id: 'm365_calendar_list', name: 'List Events', description: 'List calendar events', category: 'read', risk: 'low', skillId: 'm365-outlook', sideEffects: [] },
  { id: 'm365_calendar_create', name: 'Create Event', description: 'Create calendar event', category: 'write', risk: 'medium', skillId: 'm365-outlook', sideEffects: ['sends-email'] },
  { id: 'm365_calendar_update', name: 'Update Event', description: 'Update calendar event', category: 'write', risk: 'medium', skillId: 'm365-outlook', sideEffects: [] },
  { id: 'm365_calendar_delete', name: 'Delete Event', description: 'Delete calendar event', category: 'destroy', risk: 'medium', skillId: 'm365-outlook', sideEffects: ['deletes-data'] },
  { id: 'm365_contacts_list', name: 'List Contacts', description: 'List Outlook contacts', category: 'read', risk: 'low', skillId: 'm365-outlook', sideEffects: [] },
  { id: 'm365_contacts_create', name: 'Create Contact', description: 'Create Outlook contact', category: 'write', risk: 'low', skillId: 'm365-outlook', sideEffects: [] },
];
