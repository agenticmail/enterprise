import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'smtp-email',
  name: 'Email (SMTP/IMAP)',
  description: 'Send, read, and manage emails via SMTP/IMAP — works with any email provider (Gmail, Outlook, Yahoo, custom).',
  category: 'communication',
  risk: 'high',
  icon: Emoji.email,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'email_send', name: 'Send Email', description: 'Send an email via SMTP', category: 'communicate', risk: 'high', skillId: 'smtp-email', sideEffects: ['sends-email'] },
  { id: 'email_reply', name: 'Reply to Email', description: 'Reply to an email by message ID', category: 'communicate', risk: 'high', skillId: 'smtp-email', sideEffects: ['sends-email'] },
  { id: 'email_forward', name: 'Forward Email', description: 'Forward an email to another recipient', category: 'communicate', risk: 'high', skillId: 'smtp-email', sideEffects: ['sends-email'] },
  { id: 'email_search', name: 'Search Emails', description: 'Search inbox via IMAP (by sender, subject, date, text)', category: 'read', risk: 'low', skillId: 'smtp-email', sideEffects: [] },
  { id: 'email_read', name: 'Read Email', description: 'Read a specific email by sequence number or UID', category: 'read', risk: 'low', skillId: 'smtp-email', sideEffects: [] },
  { id: 'email_list', name: 'List Emails', description: 'List recent emails from inbox or folder', category: 'read', risk: 'low', skillId: 'smtp-email', sideEffects: [] },
  { id: 'email_folders', name: 'List Folders', description: 'List available email folders/mailboxes', category: 'read', risk: 'low', skillId: 'smtp-email', sideEffects: [] },
  { id: 'email_move', name: 'Move Email', description: 'Move an email to a different folder', category: 'write', risk: 'low', skillId: 'smtp-email', sideEffects: [] },
  { id: 'email_delete', name: 'Delete Email', description: 'Move email to trash or permanently delete', category: 'destroy', risk: 'medium', skillId: 'smtp-email', sideEffects: ['deletes-data'] },
  { id: 'email_mark_read', name: 'Mark Read/Unread', description: 'Mark emails as read or unread', category: 'write', risk: 'low', skillId: 'smtp-email', sideEffects: [] },
];
