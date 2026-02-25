/**
 * AgenticMail — Core Email & Agent Communication Platform
 *
 * The company's flagship product. Provides AI agents with full email capabilities,
 * inter-agent communication, storage, SMS, task management, and more.
 */

import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'agenticmail',
  name: 'AgenticMail',
  description: 'AI-native email platform — send/receive email, inter-agent messaging, storage, SMS, task management, and multi-agent coordination.',
  category: 'communication',
  risk: 'medium',
  icon: '📬',
  source: 'builtin',
};

const S = 'agenticmail'; // skillId shorthand

export const TOOLS: ToolDefinition[] = [
  // ─── Email Core ────────────────────────────────────────
  { id: 'agenticmail_send', name: 'Send Email', description: 'Send an email from the agent mailbox. Outbound guard scans for PII/credentials.', category: 'communicate', risk: 'high', skillId: S, sideEffects: ['sends-email'] },
  { id: 'agenticmail_reply', name: 'Reply to Email', description: 'Reply to an email by UID. Outbound guard applies.', category: 'communicate', risk: 'high', skillId: S, sideEffects: ['sends-email'] },
  { id: 'agenticmail_forward', name: 'Forward Email', description: 'Forward an email to another recipient.', category: 'communicate', risk: 'high', skillId: S, sideEffects: ['sends-email'] },
  { id: 'agenticmail_inbox', name: 'List Inbox', description: 'List recent emails in the inbox.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_read', name: 'Read Email', description: 'Read a specific email by UID with security metadata.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_search', name: 'Search Emails', description: 'Search emails by criteria. Supports relay search for connected Gmail/Outlook.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_digest', name: 'Inbox Digest', description: 'Compact inbox digest with subject, sender, date, and text preview.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_delete', name: 'Delete Email', description: 'Delete an email by UID.', category: 'destroy', risk: 'medium', skillId: S, sideEffects: ['deletes-data'] },
  { id: 'agenticmail_move', name: 'Move Email', description: 'Move an email to another folder.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_mark_read', name: 'Mark Read', description: 'Mark an email as read.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_mark_unread', name: 'Mark Unread', description: 'Mark an email as unread.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_folders', name: 'List Folders', description: 'List all mail folders.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_create_folder', name: 'Create Folder', description: 'Create a new mail folder.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_list_folder', name: 'List Folder', description: 'List messages in a specific folder (Sent, Drafts, Trash, etc.).', category: 'read', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Batch Operations ──────────────────────────────────
  { id: 'agenticmail_batch_read', name: 'Batch Read', description: 'Read multiple emails at once by UIDs.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_batch_delete', name: 'Batch Delete', description: 'Delete multiple emails by UIDs.', category: 'destroy', risk: 'medium', skillId: S, sideEffects: ['deletes-data'] },
  { id: 'agenticmail_batch_move', name: 'Batch Move', description: 'Move multiple emails to another folder.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_batch_mark_read', name: 'Batch Mark Read', description: 'Mark multiple emails as read.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_batch_mark_unread', name: 'Batch Mark Unread', description: 'Mark multiple emails as unread.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Drafts ────────────────────────────────────────────
  { id: 'agenticmail_drafts', name: 'Manage Drafts', description: 'List, create, update, delete, or send email drafts.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Templates & Signatures ────────────────────────────
  { id: 'agenticmail_templates', name: 'Email Templates', description: 'List, create, or delete email templates.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_template_send', name: 'Send from Template', description: 'Send email using a saved template with variable substitution.', category: 'communicate', risk: 'high', skillId: S, sideEffects: ['sends-email'] },
  { id: 'agenticmail_signatures', name: 'Email Signatures', description: 'List, create, or delete email signatures.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Tags & Rules ──────────────────────────────────────
  { id: 'agenticmail_tags', name: 'Manage Tags', description: 'List, create, delete, tag/untag messages, get messages by tag.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_rules', name: 'Email Rules', description: 'Auto-process incoming messages with server-side rules.', category: 'write', risk: 'medium', skillId: S, sideEffects: [] },

  // ─── Scheduling ────────────────────────────────────────
  { id: 'agenticmail_schedule', name: 'Schedule Email', description: 'Create, list, or cancel scheduled emails.', category: 'communicate', risk: 'medium', skillId: S, sideEffects: ['sends-email'] },

  // ─── Spam Management ───────────────────────────────────
  { id: 'agenticmail_spam', name: 'Spam Management', description: 'List spam, report/unreport messages, get spam scores.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Agent Communication ───────────────────────────────
  { id: 'agenticmail_list_agents', name: 'List Agents', description: 'Discover all available AI agents and their emails/roles.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_message_agent', name: 'Message Agent', description: 'Send a message to another AI agent by name.', category: 'communicate', risk: 'medium', skillId: S, sideEffects: ['sends-email'] },
  { id: 'agenticmail_call_agent', name: 'Call Agent', description: 'RPC call to another agent — sync or async. Auto-spawns sessions.', category: 'execute', risk: 'medium', skillId: S, sideEffects: ['spawns-agent'] },
  { id: 'agenticmail_check_messages', name: 'Check Messages', description: 'Check for new unread messages from other agents or external senders.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_wait_for_email', name: 'Wait for Email', description: 'Push-based wait for new email or task notification (SSE).', category: 'read', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Task Management ───────────────────────────────────
  { id: 'agenticmail_check_tasks', name: 'Check Tasks', description: 'Check for pending tasks assigned to you or tasks you assigned.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_claim_task', name: 'Claim Task', description: 'Claim a pending task to start working on it.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_submit_result', name: 'Submit Result', description: 'Submit result for a claimed task, marking it complete.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_complete_task', name: 'Complete Task', description: 'Claim and submit result in one call.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Storage / Database ────────────────────────────────
  { id: 'agenticmail_storage', name: 'Agent Storage', description: 'Full database management — tables, CRUD, indexes, aggregations, raw SQL.', category: 'write', risk: 'medium', skillId: S, sideEffects: ['writes-data'] },

  // ─── Contacts ──────────────────────────────────────────
  { id: 'agenticmail_contacts', name: 'Manage Contacts', description: 'List, add, or delete contacts.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },

  // ─── SMS / Phone ───────────────────────────────────────
  { id: 'agenticmail_sms_setup', name: 'SMS Setup', description: 'Configure SMS/phone via Google Voice.', category: 'write', risk: 'medium', skillId: S, sideEffects: [] },
  { id: 'agenticmail_sms_send', name: 'Send SMS', description: 'Send an SMS text message via Google Voice.', category: 'communicate', risk: 'high', skillId: S, sideEffects: ['sends-sms'] },
  { id: 'agenticmail_sms_messages', name: 'List SMS', description: 'List SMS messages (inbound and outbound).', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_sms_check_code', name: 'Check SMS Code', description: 'Check for recent verification/OTP codes from SMS.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_sms_read_voice', name: 'Read Google Voice', description: 'Read SMS directly from Google Voice web interface.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_sms_record', name: 'Record SMS', description: 'Record an SMS from Google Voice or other source.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_sms_parse_email', name: 'Parse SMS Email', description: 'Parse SMS from forwarded Google Voice email.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_sms_config', name: 'SMS Config', description: 'Get current SMS/phone number configuration.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Account & Setup ───────────────────────────────────
  { id: 'agenticmail_whoami', name: 'Who Am I', description: 'Get the current agent account info — name, email, role, metadata.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_update_metadata', name: 'Update Metadata', description: 'Update the current agent metadata.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_status', name: 'Server Status', description: 'Check AgenticMail server health status.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_gateway_status', name: 'Gateway Status', description: 'Check email gateway status (relay, domain, or none).', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_pending_emails', name: 'Pending Emails', description: 'Check outbound emails blocked by the outbound guard.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Admin ─────────────────────────────────────────────
  { id: 'agenticmail_create_account', name: 'Create Agent Account', description: 'Create a new agent email account (requires master key).', category: 'write', risk: 'high', skillId: S, sideEffects: ['creates-account'] },
  { id: 'agenticmail_delete_agent', name: 'Delete Agent', description: 'Delete an agent account permanently.', category: 'destroy', risk: 'critical', skillId: S, sideEffects: ['deletes-data'] },
  { id: 'agenticmail_cleanup', name: 'Cleanup Agents', description: 'List or remove inactive non-persistent agent accounts.', category: 'destroy', risk: 'high', skillId: S, sideEffects: ['deletes-data'] },
  { id: 'agenticmail_deletion_reports', name: 'Deletion Reports', description: 'List past agent deletion reports.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },

  // ─── Relay & Domain Setup ──────────────────────────────
  { id: 'agenticmail_setup_guide', name: 'Setup Guide', description: 'Comparison of email setup modes (Relay vs Domain).', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_setup_relay', name: 'Setup Relay', description: 'Configure Gmail/Outlook relay for real internet email.', category: 'write', risk: 'high', skillId: S, sideEffects: ['configures-email'] },
  { id: 'agenticmail_setup_domain', name: 'Setup Domain', description: 'Set up custom domain via Cloudflare with DKIM/SPF/DMARC.', category: 'write', risk: 'high', skillId: S, sideEffects: ['configures-email'] },
  { id: 'agenticmail_setup_gmail_alias', name: 'Gmail Alias Setup', description: 'Instructions to add agent email as Gmail "Send mail as" alias.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_setup_payment', name: 'Payment Setup', description: 'Instructions for adding payment to Cloudflare for domain purchase.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_purchase_domain', name: 'Search Domains', description: 'Search for available domains via Cloudflare Registrar.', category: 'read', risk: 'low', skillId: S, sideEffects: [] },
  { id: 'agenticmail_test_email', name: 'Test Email', description: 'Send a test email to verify gateway configuration.', category: 'communicate', risk: 'medium', skillId: S, sideEffects: ['sends-email'] },
  { id: 'agenticmail_import_relay', name: 'Import Relay Email', description: 'Import email from connected Gmail/Outlook into local inbox.', category: 'write', risk: 'low', skillId: S, sideEffects: [] },
];
