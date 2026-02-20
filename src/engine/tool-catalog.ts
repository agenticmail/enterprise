/**
 * Tool Catalog — Exact mapping of all AgenticMail Enterprise tools
 *
 * Every tool ID here matches the ACTUAL registered tool name in the runtime.
 * Sourced from:
 * - Core tools (read, write, edit, exec, web_search, etc.)
 * - AgenticMail tools (agenticmail_send, agenticmail_reply, etc.)
 * - Platform tools (browser, canvas, nodes, cron, etc.)
 *
 * This is the single source of truth for the permission engine.
 */

import type { ToolDefinition, SkillCategory, RiskLevel, SideEffect } from './skills.js';
import { M365_TOOLS as M365_SKILL_TOOLS, GWS_TOOLS as GWS_SKILL_TOOLS, ENTERPRISE_UTILITY_TOOLS } from './skills/index.js';

// ─── Core Platform Tools ────────────────────────────────

export const CORE_TOOLS: ToolDefinition[] = [
  // File system
  { id: 'read', name: 'Read File', description: 'Read file contents (text and images)', category: 'read', risk: 'low', skillId: 'files', sideEffects: [] },
  { id: 'write', name: 'Write File', description: 'Create or overwrite files', category: 'write', risk: 'medium', skillId: 'files', sideEffects: ['modifies-files'] },
  { id: 'edit', name: 'Edit File', description: 'Make precise edits to files', category: 'write', risk: 'medium', skillId: 'files', sideEffects: ['modifies-files'] },

  // Execution
  { id: 'exec', name: 'Shell Command', description: 'Execute shell commands', category: 'execute', risk: 'critical', skillId: 'exec', sideEffects: ['runs-code', 'modifies-files', 'network-request'] },
  { id: 'process', name: 'Process Manager', description: 'Manage running exec sessions', category: 'execute', risk: 'high', skillId: 'exec', sideEffects: ['runs-code'] },

  // Web
  { id: 'web_search', name: 'Web Search', description: 'Search the web via Brave Search API', category: 'read', risk: 'low', skillId: 'web-search', sideEffects: ['network-request'] },
  { id: 'web_fetch', name: 'Web Fetch', description: 'Fetch and extract content from URLs', category: 'read', risk: 'low', skillId: 'web-fetch', sideEffects: ['network-request'] },

  // Browser
  { id: 'browser', name: 'Browser Control', description: 'Automate web browsers', category: 'execute', risk: 'high', skillId: 'browser', sideEffects: ['network-request', 'runs-code'] },

  // Canvas
  { id: 'canvas', name: 'Canvas', description: 'Present/eval/snapshot rendered UI', category: 'read', risk: 'low', skillId: 'canvas', sideEffects: [] },

  // Nodes
  { id: 'nodes', name: 'Node Control', description: 'Control paired devices', category: 'execute', risk: 'high', skillId: 'nodes', sideEffects: ['controls-device'] },

  // Cron
  { id: 'cron', name: 'Cron Jobs', description: 'Schedule tasks and reminders', category: 'write', risk: 'medium', skillId: 'cron', sideEffects: [] },

  // Messaging
  { id: 'message', name: 'Send Message', description: 'Send messages via channels', category: 'communicate', risk: 'high', skillId: 'messaging', sideEffects: ['sends-message'] },

  // Gateway
  { id: 'gateway', name: 'Gateway Control', description: 'Restart, configure, and update the agent runtime', category: 'execute', risk: 'critical', skillId: 'gateway', sideEffects: ['runs-code'] },

  // Sessions / Sub-agents
  { id: 'agents_list', name: 'List Agents', description: 'List agent IDs for spawning', category: 'read', risk: 'low', skillId: 'sessions', sideEffects: [] },
  { id: 'sessions_list', name: 'List Sessions', description: 'List active sessions', category: 'read', risk: 'low', skillId: 'sessions', sideEffects: [] },
  { id: 'sessions_history', name: 'Session History', description: 'Fetch message history', category: 'read', risk: 'low', skillId: 'sessions', sideEffects: [] },
  { id: 'sessions_send', name: 'Send to Session', description: 'Send message to another session', category: 'communicate', risk: 'medium', skillId: 'sessions', sideEffects: ['sends-message'] },
  { id: 'sessions_spawn', name: 'Spawn Sub-Agent', description: 'Spawn a background sub-agent', category: 'execute', risk: 'medium', skillId: 'sessions', sideEffects: [] },
  { id: 'subagents', name: 'Sub-Agent Control', description: 'List, steer, or kill sub-agents', category: 'execute', risk: 'medium', skillId: 'sessions', sideEffects: [] },
  { id: 'session_status', name: 'Session Status', description: 'Show session usage and status', category: 'read', risk: 'low', skillId: 'sessions', sideEffects: [] },

  // Image
  { id: 'image', name: 'Image Analysis', description: 'Analyze images with vision model', category: 'read', risk: 'low', skillId: 'media', sideEffects: [] },

  // TTS
  { id: 'tts', name: 'Text-to-Speech', description: 'Convert text to speech audio', category: 'write', risk: 'low', skillId: 'media', sideEffects: [] },

  // Memory
  { id: 'memory_search', name: 'Memory Search', description: 'Search agent memory files', category: 'read', risk: 'low', skillId: 'memory', sideEffects: [] },
  { id: 'memory_get', name: 'Memory Get', description: 'Read memory file snippets', category: 'read', risk: 'low', skillId: 'memory', sideEffects: [] },
];

// ─── AgenticMail Tools (all 63) ─────────────────────────

export const AGENTICMAIL_TOOLS: ToolDefinition[] = [
  // Core email
  { id: 'agenticmail_inbox', name: 'Inbox', description: 'List recent emails', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_read', name: 'Read Email', description: 'Read a specific email by UID', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_send', name: 'Send Email', description: 'Send an email', category: 'communicate', risk: 'high', skillId: 'agenticmail', sideEffects: ['sends-email'] },
  { id: 'agenticmail_reply', name: 'Reply to Email', description: 'Reply to an email', category: 'communicate', risk: 'high', skillId: 'agenticmail', sideEffects: ['sends-email'] },
  { id: 'agenticmail_forward', name: 'Forward Email', description: 'Forward an email', category: 'communicate', risk: 'high', skillId: 'agenticmail', sideEffects: ['sends-email'] },
  { id: 'agenticmail_search', name: 'Search Email', description: 'Search emails', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_delete', name: 'Delete Email', description: 'Delete an email', category: 'destroy', risk: 'medium', skillId: 'agenticmail', sideEffects: ['deletes-data'] },
  { id: 'agenticmail_move', name: 'Move Email', description: 'Move email to folder', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_mark_read', name: 'Mark Read', description: 'Mark email as read', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_mark_unread', name: 'Mark Unread', description: 'Mark email as unread', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_digest', name: 'Inbox Digest', description: 'Get compact inbox digest', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_list_folder', name: 'List Folder', description: 'List messages in a folder', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_folders', name: 'List Folders', description: 'List all mail folders', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_create_folder', name: 'Create Folder', description: 'Create a mail folder', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_import_relay', name: 'Import Relay', description: 'Import email from Gmail/Outlook', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },

  // Batch operations
  { id: 'agenticmail_batch_read', name: 'Batch Read', description: 'Read multiple emails', category: 'read', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_batch_delete', name: 'Batch Delete', description: 'Delete multiple emails', category: 'destroy', risk: 'medium', skillId: 'agenticmail', sideEffects: ['deletes-data'] },
  { id: 'agenticmail_batch_move', name: 'Batch Move', description: 'Move multiple emails', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_batch_mark_read', name: 'Batch Mark Read', description: 'Mark multiple as read', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_batch_mark_unread', name: 'Batch Mark Unread', description: 'Mark multiple as unread', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },

  // Agent coordination
  { id: 'agenticmail_call_agent', name: 'Call Agent', description: 'Call another agent with a task', category: 'execute', risk: 'medium', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_message_agent', name: 'Message Agent', description: 'Send message to another agent', category: 'communicate', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: ['sends-message'] },
  { id: 'agenticmail_list_agents', name: 'List Agents', description: 'List available agents', category: 'read', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_check_messages', name: 'Check Messages', description: 'Check for unread messages', category: 'read', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_check_tasks', name: 'Check Tasks', description: 'Check pending tasks', category: 'read', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_claim_task', name: 'Claim Task', description: 'Claim a pending task', category: 'write', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_complete_task', name: 'Complete Task', description: 'Complete a claimed task', category: 'write', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_submit_result', name: 'Submit Result', description: 'Submit task result', category: 'write', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },
  { id: 'agenticmail_wait_for_email', name: 'Wait for Email', description: 'Wait for new email (SSE)', category: 'read', risk: 'low', skillId: 'agenticmail-coordination', sideEffects: [] },

  // Account management
  { id: 'agenticmail_create_account', name: 'Create Account', description: 'Create agent email account', category: 'write', risk: 'high', skillId: 'agenticmail-admin', sideEffects: [] },
  { id: 'agenticmail_delete_agent', name: 'Delete Agent', description: 'Delete agent account', category: 'destroy', risk: 'critical', skillId: 'agenticmail-admin', sideEffects: ['deletes-data'] },
  { id: 'agenticmail_cleanup', name: 'Cleanup Agents', description: 'Remove inactive agents', category: 'destroy', risk: 'high', skillId: 'agenticmail-admin', sideEffects: ['deletes-data'] },
  { id: 'agenticmail_deletion_reports', name: 'Deletion Reports', description: 'List deletion reports', category: 'read', risk: 'low', skillId: 'agenticmail-admin', sideEffects: [] },
  { id: 'agenticmail_whoami', name: 'Who Am I', description: 'Get agent account info', category: 'read', risk: 'low', skillId: 'agenticmail-admin', sideEffects: [] },
  { id: 'agenticmail_update_metadata', name: 'Update Metadata', description: 'Update agent metadata', category: 'write', risk: 'low', skillId: 'agenticmail-admin', sideEffects: [] },
  { id: 'agenticmail_status', name: 'Server Status', description: 'Check server health', category: 'read', risk: 'low', skillId: 'agenticmail-admin', sideEffects: [] },
  { id: 'agenticmail_pending_emails', name: 'Pending Emails', description: 'Check blocked outbound emails', category: 'read', risk: 'low', skillId: 'agenticmail-admin', sideEffects: [] },

  // Organization
  { id: 'agenticmail_contacts', name: 'Contacts', description: 'Manage contacts', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_tags', name: 'Tags', description: 'Manage email tags/labels', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_signatures', name: 'Signatures', description: 'Manage email signatures', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_templates', name: 'Templates', description: 'Manage email templates', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_template_send', name: 'Send Template', description: 'Send email from template', category: 'communicate', risk: 'high', skillId: 'agenticmail', sideEffects: ['sends-email'] },
  { id: 'agenticmail_rules', name: 'Email Rules', description: 'Manage auto-processing rules', category: 'write', risk: 'medium', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_spam', name: 'Spam Management', description: 'Manage spam folder', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_drafts', name: 'Drafts', description: 'Manage email drafts', category: 'write', risk: 'low', skillId: 'agenticmail', sideEffects: [] },
  { id: 'agenticmail_schedule', name: 'Schedule Email', description: 'Schedule emails for later', category: 'communicate', risk: 'medium', skillId: 'agenticmail', sideEffects: ['sends-email'] },

  // Setup (admin only)
  { id: 'agenticmail_setup_relay', name: 'Setup Relay', description: 'Configure Gmail/Outlook relay', category: 'write', risk: 'critical', skillId: 'agenticmail-setup', sideEffects: [] },
  { id: 'agenticmail_setup_domain', name: 'Setup Domain', description: 'Configure custom domain', category: 'write', risk: 'critical', skillId: 'agenticmail-setup', sideEffects: [] },
  { id: 'agenticmail_setup_guide', name: 'Setup Guide', description: 'Email setup comparison', category: 'read', risk: 'low', skillId: 'agenticmail-setup', sideEffects: [] },
  { id: 'agenticmail_setup_gmail_alias', name: 'Gmail Alias', description: 'Add Gmail send-as alias', category: 'read', risk: 'low', skillId: 'agenticmail-setup', sideEffects: [] },
  { id: 'agenticmail_setup_payment', name: 'Setup Payment', description: 'Add Cloudflare payment', category: 'read', risk: 'low', skillId: 'agenticmail-setup', sideEffects: [] },
  { id: 'agenticmail_purchase_domain', name: 'Purchase Domain', description: 'Search available domains', category: 'read', risk: 'low', skillId: 'agenticmail-setup', sideEffects: [] },
  { id: 'agenticmail_test_email', name: 'Test Email', description: 'Send test email', category: 'communicate', risk: 'low', skillId: 'agenticmail-setup', sideEffects: ['sends-email'] },
  { id: 'agenticmail_gateway_status', name: 'Gateway Status', description: 'Check email gateway', category: 'read', risk: 'low', skillId: 'agenticmail-setup', sideEffects: [] },

  // SMS
  { id: 'agenticmail_sms_send', name: 'Send SMS', description: 'Send SMS via Google Voice', category: 'communicate', risk: 'high', skillId: 'agenticmail-sms', sideEffects: ['sends-sms'] },
  { id: 'agenticmail_sms_messages', name: 'SMS Messages', description: 'List SMS messages', category: 'read', risk: 'low', skillId: 'agenticmail-sms', sideEffects: [] },
  { id: 'agenticmail_sms_check_code', name: 'Check SMS Code', description: 'Check for verification codes', category: 'read', risk: 'low', skillId: 'agenticmail-sms', sideEffects: [] },
  { id: 'agenticmail_sms_read_voice', name: 'Read Voice SMS', description: 'Read SMS from Google Voice', category: 'read', risk: 'low', skillId: 'agenticmail-sms', sideEffects: [] },
  { id: 'agenticmail_sms_record', name: 'Record SMS', description: 'Save SMS to database', category: 'write', risk: 'low', skillId: 'agenticmail-sms', sideEffects: [] },
  { id: 'agenticmail_sms_parse_email', name: 'Parse SMS Email', description: 'Parse SMS from forwarded email', category: 'read', risk: 'low', skillId: 'agenticmail-sms', sideEffects: [] },
  { id: 'agenticmail_sms_setup', name: 'SMS Setup', description: 'Configure Google Voice SMS', category: 'write', risk: 'medium', skillId: 'agenticmail-sms', sideEffects: [] },
  { id: 'agenticmail_sms_config', name: 'SMS Config', description: 'Get SMS configuration', category: 'read', risk: 'low', skillId: 'agenticmail-sms', sideEffects: [] },
];

// ─── Microsoft 365 Tools (from individual skill files) ──

export const MICROSOFT_365_TOOLS: ToolDefinition[] = M365_SKILL_TOOLS;

// ─── Google Workspace Tools (from individual skill files) ─

export const GOOGLE_WORKSPACE_TOOLS: ToolDefinition[] = GWS_SKILL_TOOLS;

// ─── Enterprise Integration Tools ───────────────────────

export const ENTERPRISE_TOOLS: ToolDefinition[] = [
  // Slack
  { id: 'slack_send', name: 'Send Message', description: 'Send Slack message', category: 'communicate', risk: 'medium', skillId: 'slack', sideEffects: ['sends-message'] },
  { id: 'slack_channels', name: 'List Channels', description: 'List Slack channels', category: 'read', risk: 'low', skillId: 'slack', sideEffects: [] },
  { id: 'slack_create_channel', name: 'Create Channel', description: 'Create Slack channel', category: 'write', risk: 'medium', skillId: 'slack', sideEffects: [] },
  { id: 'slack_search', name: 'Search Messages', description: 'Search Slack messages', category: 'read', risk: 'low', skillId: 'slack', sideEffects: [] },
  { id: 'slack_react', name: 'Add Reaction', description: 'Add emoji reaction', category: 'write', risk: 'low', skillId: 'slack', sideEffects: [] },
  { id: 'slack_upload', name: 'Upload File', description: 'Upload file to Slack', category: 'write', risk: 'medium', skillId: 'slack', sideEffects: ['modifies-files'] },

  // Zoom
  { id: 'zoom_create', name: 'Create Meeting', description: 'Schedule Zoom meeting', category: 'write', risk: 'medium', skillId: 'zoom', sideEffects: ['sends-email'] },
  { id: 'zoom_list', name: 'List Meetings', description: 'List scheduled meetings', category: 'read', risk: 'low', skillId: 'zoom', sideEffects: [] },
  { id: 'zoom_recordings', name: 'List Recordings', description: 'List meeting recordings', category: 'read', risk: 'low', skillId: 'zoom', sideEffects: [] },

  // Salesforce
  { id: 'sf_query', name: 'SOQL Query', description: 'Run Salesforce SOQL query', category: 'read', risk: 'low', skillId: 'salesforce', sideEffects: [] },
  { id: 'sf_create', name: 'Create Record', description: 'Create Salesforce record', category: 'write', risk: 'medium', skillId: 'salesforce', sideEffects: [] },
  { id: 'sf_update', name: 'Update Record', description: 'Update Salesforce record', category: 'write', risk: 'medium', skillId: 'salesforce', sideEffects: [] },
  { id: 'sf_delete', name: 'Delete Record', description: 'Delete Salesforce record', category: 'destroy', risk: 'high', skillId: 'salesforce', sideEffects: ['deletes-data'] },
  { id: 'sf_report', name: 'Run Report', description: 'Run Salesforce report', category: 'read', risk: 'low', skillId: 'salesforce', sideEffects: [] },

  // HubSpot
  { id: 'hs_contacts', name: 'Manage Contacts', description: 'CRUD HubSpot contacts', category: 'write', risk: 'medium', skillId: 'hubspot-crm', sideEffects: [] },
  { id: 'hs_deals', name: 'Manage Deals', description: 'CRUD HubSpot deals', category: 'write', risk: 'medium', skillId: 'hubspot-crm', sideEffects: [] },
  { id: 'hs_tickets', name: 'Manage Tickets', description: 'CRUD HubSpot tickets', category: 'write', risk: 'medium', skillId: 'hubspot-service', sideEffects: [] },
  { id: 'hs_email', name: 'Send Campaign', description: 'Send HubSpot email campaign', category: 'communicate', risk: 'high', skillId: 'hubspot-marketing', sideEffects: ['sends-email'] },

  // Jira
  { id: 'jira_issues', name: 'List Issues', description: 'Search Jira issues with JQL', category: 'read', risk: 'low', skillId: 'jira', sideEffects: [] },
  { id: 'jira_create', name: 'Create Issue', description: 'Create Jira issue', category: 'write', risk: 'medium', skillId: 'jira', sideEffects: [] },
  { id: 'jira_update', name: 'Update Issue', description: 'Update Jira issue', category: 'write', risk: 'medium', skillId: 'jira', sideEffects: [] },
  { id: 'jira_transition', name: 'Transition Issue', description: 'Move issue through workflow', category: 'write', risk: 'medium', skillId: 'jira', sideEffects: [] },
  { id: 'jira_comment', name: 'Add Comment', description: 'Comment on Jira issue', category: 'write', risk: 'low', skillId: 'jira', sideEffects: [] },

  // Notion
  { id: 'notion_pages', name: 'Manage Pages', description: 'CRUD Notion pages', category: 'write', risk: 'medium', skillId: 'notion', sideEffects: [] },
  { id: 'notion_databases', name: 'Query Database', description: 'Query Notion database', category: 'read', risk: 'low', skillId: 'notion', sideEffects: [] },
  { id: 'notion_search', name: 'Search Notion', description: 'Search across Notion workspace', category: 'read', risk: 'low', skillId: 'notion', sideEffects: [] },

  // Linear
  { id: 'linear_issues', name: 'List Issues', description: 'List Linear issues', category: 'read', risk: 'low', skillId: 'linear', sideEffects: [] },
  { id: 'linear_create', name: 'Create Issue', description: 'Create Linear issue', category: 'write', risk: 'medium', skillId: 'linear', sideEffects: [] },
  { id: 'linear_update', name: 'Update Issue', description: 'Update Linear issue', category: 'write', risk: 'medium', skillId: 'linear', sideEffects: [] },

  // Asana
  { id: 'asana_tasks', name: 'List Tasks', description: 'List Asana tasks', category: 'read', risk: 'low', skillId: 'asana', sideEffects: [] },
  { id: 'asana_create', name: 'Create Task', description: 'Create Asana task', category: 'write', risk: 'medium', skillId: 'asana', sideEffects: [] },
  { id: 'asana_update', name: 'Update Task', description: 'Update Asana task', category: 'write', risk: 'medium', skillId: 'asana', sideEffects: [] },

  // Zendesk
  { id: 'zd_tickets', name: 'List Tickets', description: 'List Zendesk tickets', category: 'read', risk: 'low', skillId: 'zendesk', sideEffects: [] },
  { id: 'zd_create', name: 'Create Ticket', description: 'Create Zendesk ticket', category: 'write', risk: 'medium', skillId: 'zendesk', sideEffects: [] },
  { id: 'zd_update', name: 'Update Ticket', description: 'Update Zendesk ticket', category: 'write', risk: 'medium', skillId: 'zendesk', sideEffects: [] },
  { id: 'zd_reply', name: 'Reply to Ticket', description: 'Reply to Zendesk ticket', category: 'communicate', risk: 'medium', skillId: 'zendesk', sideEffects: ['sends-email'] },

  // Stripe
  { id: 'stripe_customers', name: 'Manage Customers', description: 'CRUD Stripe customers', category: 'write', risk: 'medium', skillId: 'stripe', sideEffects: [] },
  { id: 'stripe_charges', name: 'List Charges', description: 'List Stripe charges', category: 'read', risk: 'low', skillId: 'stripe', sideEffects: [] },
  { id: 'stripe_invoices', name: 'Manage Invoices', description: 'Create/send Stripe invoices', category: 'write', risk: 'high', skillId: 'stripe', sideEffects: ['financial', 'sends-email'] },
  { id: 'stripe_subscriptions', name: 'Manage Subscriptions', description: 'CRUD subscriptions', category: 'write', risk: 'high', skillId: 'stripe', sideEffects: ['financial'] },
  { id: 'stripe_refund', name: 'Issue Refund', description: 'Refund a charge', category: 'write', risk: 'high', skillId: 'stripe', sideEffects: ['financial'] },

  // Docker
  { id: 'docker_ps', name: 'List Containers', description: 'List Docker containers', category: 'read', risk: 'low', skillId: 'docker', sideEffects: [] },
  { id: 'docker_run', name: 'Run Container', description: 'Start Docker container', category: 'execute', risk: 'high', skillId: 'docker', sideEffects: ['runs-code'] },
  { id: 'docker_build', name: 'Build Image', description: 'Build Docker image', category: 'execute', risk: 'high', skillId: 'docker', sideEffects: ['runs-code', 'modifies-files'] },
  { id: 'docker_logs', name: 'Container Logs', description: 'View container logs', category: 'read', risk: 'low', skillId: 'docker', sideEffects: [] },

  // Kubernetes
  { id: 'k8s_get', name: 'Get Resources', description: 'List Kubernetes resources', category: 'read', risk: 'low', skillId: 'kubernetes', sideEffects: [] },
  { id: 'k8s_apply', name: 'Apply Manifest', description: 'Apply Kubernetes manifest', category: 'execute', risk: 'high', skillId: 'kubernetes', sideEffects: ['runs-code'] },
  { id: 'k8s_delete', name: 'Delete Resource', description: 'Delete Kubernetes resource', category: 'destroy', risk: 'high', skillId: 'kubernetes', sideEffects: ['deletes-data'] },
  { id: 'k8s_logs', name: 'Pod Logs', description: 'View pod logs', category: 'read', risk: 'low', skillId: 'kubernetes', sideEffects: [] },
  { id: 'k8s_exec', name: 'Exec in Pod', description: 'Execute command in pod', category: 'execute', risk: 'high', skillId: 'kubernetes', sideEffects: ['runs-code'] },

  // Terraform
  { id: 'tf_plan', name: 'Terraform Plan', description: 'Run terraform plan', category: 'read', risk: 'medium', skillId: 'terraform', sideEffects: [] },
  { id: 'tf_apply', name: 'Terraform Apply', description: 'Run terraform apply', category: 'execute', risk: 'high', skillId: 'terraform', sideEffects: ['runs-code', 'network-request'] },
  { id: 'tf_state', name: 'Terraform State', description: 'Read terraform state', category: 'read', risk: 'low', skillId: 'terraform', sideEffects: [] },

  // Shopify
  { id: 'shopify_products', name: 'Manage Products', description: 'CRUD Shopify products', category: 'write', risk: 'medium', skillId: 'shopify', sideEffects: [] },
  { id: 'shopify_orders', name: 'List Orders', description: 'List Shopify orders', category: 'read', risk: 'low', skillId: 'shopify', sideEffects: [] },
  { id: 'shopify_customers', name: 'Manage Customers', description: 'CRUD Shopify customers', category: 'write', risk: 'medium', skillId: 'shopify', sideEffects: [] },
  { id: 'shopify_inventory', name: 'Manage Inventory', description: 'Update inventory levels', category: 'write', risk: 'medium', skillId: 'shopify', sideEffects: [] },

  // Dropbox
  { id: 'dropbox_list', name: 'List Files', description: 'List Dropbox files', category: 'read', risk: 'low', skillId: 'dropbox', sideEffects: [] },
  { id: 'dropbox_upload', name: 'Upload File', description: 'Upload to Dropbox', category: 'write', risk: 'medium', skillId: 'dropbox', sideEffects: ['modifies-files'] },
  { id: 'dropbox_download', name: 'Download File', description: 'Download from Dropbox', category: 'read', risk: 'low', skillId: 'dropbox', sideEffects: [] },
  { id: 'dropbox_share', name: 'Share Link', description: 'Create sharing link', category: 'write', risk: 'medium', skillId: 'dropbox', sideEffects: [] },

  // Datadog
  { id: 'dd_metrics', name: 'Query Metrics', description: 'Query Datadog metrics', category: 'read', risk: 'low', skillId: 'datadog', sideEffects: [] },
  { id: 'dd_events', name: 'List Events', description: 'List Datadog events', category: 'read', risk: 'low', skillId: 'datadog', sideEffects: [] },
  { id: 'dd_monitors', name: 'Manage Monitors', description: 'CRUD Datadog monitors', category: 'write', risk: 'medium', skillId: 'datadog', sideEffects: [] },
  { id: 'dd_dashboards', name: 'Manage Dashboards', description: 'CRUD Datadog dashboards', category: 'write', risk: 'low', skillId: 'datadog', sideEffects: [] },

  // PagerDuty
  { id: 'pd_incidents', name: 'List Incidents', description: 'List PagerDuty incidents', category: 'read', risk: 'low', skillId: 'pagerduty', sideEffects: [] },
  { id: 'pd_create', name: 'Create Incident', description: 'Create PagerDuty incident', category: 'write', risk: 'high', skillId: 'pagerduty', sideEffects: ['sends-message'] },
  { id: 'pd_acknowledge', name: 'Acknowledge Incident', description: 'Acknowledge incident', category: 'write', risk: 'medium', skillId: 'pagerduty', sideEffects: [] },
  { id: 'pd_resolve', name: 'Resolve Incident', description: 'Resolve incident', category: 'write', risk: 'medium', skillId: 'pagerduty', sideEffects: [] },

  // Sentry
  { id: 'sentry_issues', name: 'List Issues', description: 'List Sentry issues', category: 'read', risk: 'low', skillId: 'sentry', sideEffects: [] },
  { id: 'sentry_resolve', name: 'Resolve Issue', description: 'Resolve Sentry issue', category: 'write', risk: 'low', skillId: 'sentry', sideEffects: [] },
  { id: 'sentry_assign', name: 'Assign Issue', description: 'Assign Sentry issue', category: 'write', risk: 'low', skillId: 'sentry', sideEffects: [] },

  // DocuSign
  { id: 'ds_send', name: 'Send Envelope', description: 'Send DocuSign envelope', category: 'communicate', risk: 'high', skillId: 'docusign', sideEffects: ['sends-email'] },
  { id: 'ds_status', name: 'Envelope Status', description: 'Check envelope status', category: 'read', risk: 'low', skillId: 'docusign', sideEffects: [] },
  { id: 'ds_templates', name: 'List Templates', description: 'List DocuSign templates', category: 'read', risk: 'low', skillId: 'docusign', sideEffects: [] },

  // Mailchimp
  { id: 'mc_campaigns', name: 'List Campaigns', description: 'List Mailchimp campaigns', category: 'read', risk: 'low', skillId: 'mailchimp', sideEffects: [] },
  { id: 'mc_send', name: 'Send Campaign', description: 'Send Mailchimp campaign', category: 'communicate', risk: 'high', skillId: 'mailchimp', sideEffects: ['sends-email'] },
  { id: 'mc_audiences', name: 'Manage Audiences', description: 'CRUD Mailchimp audiences', category: 'write', risk: 'medium', skillId: 'mailchimp', sideEffects: [] },

  // Confluence
  { id: 'conf_pages', name: 'List Pages', description: 'List Confluence pages', category: 'read', risk: 'low', skillId: 'confluence', sideEffects: [] },
  { id: 'conf_create', name: 'Create Page', description: 'Create Confluence page', category: 'write', risk: 'medium', skillId: 'confluence', sideEffects: [] },
  { id: 'conf_update', name: 'Update Page', description: 'Update Confluence page', category: 'write', risk: 'medium', skillId: 'confluence', sideEffects: [] },
  { id: 'conf_search', name: 'Search Confluence', description: 'Search across spaces', category: 'read', risk: 'low', skillId: 'confluence', sideEffects: [] },

  // GitHub Actions
  { id: 'gha_workflows', name: 'List Workflows', description: 'List GitHub Actions workflows', category: 'read', risk: 'low', skillId: 'github-actions', sideEffects: [] },
  { id: 'gha_trigger', name: 'Trigger Workflow', description: 'Trigger workflow dispatch', category: 'execute', risk: 'medium', skillId: 'github-actions', sideEffects: ['runs-code'] },
  { id: 'gha_runs', name: 'List Runs', description: 'List workflow runs', category: 'read', risk: 'low', skillId: 'github-actions', sideEffects: [] },
  { id: 'gha_logs', name: 'Get Run Logs', description: 'Download workflow run logs', category: 'read', risk: 'low', skillId: 'github-actions', sideEffects: [] },

  // Figma
  { id: 'figma_files', name: 'List Files', description: 'List Figma files', category: 'read', risk: 'low', skillId: 'figma', sideEffects: [] },
  { id: 'figma_export', name: 'Export Assets', description: 'Export Figma assets', category: 'read', risk: 'low', skillId: 'figma', sideEffects: [] },
  { id: 'figma_comments', name: 'Manage Comments', description: 'CRUD Figma comments', category: 'write', risk: 'low', skillId: 'figma', sideEffects: [] },

  // Twilio
  { id: 'twilio_sms', name: 'Send SMS', description: 'Send SMS via Twilio', category: 'communicate', risk: 'high', skillId: 'twilio', sideEffects: ['sends-sms'] },
  { id: 'twilio_call', name: 'Make Call', description: 'Initiate phone call', category: 'communicate', risk: 'high', skillId: 'twilio', sideEffects: ['sends-message'] },
  { id: 'twilio_messages', name: 'List Messages', description: 'List Twilio messages', category: 'read', risk: 'low', skillId: 'twilio', sideEffects: [] },

  // Zapier
  { id: 'zapier_trigger', name: 'Trigger Zap', description: 'Trigger a Zapier webhook', category: 'execute', risk: 'medium', skillId: 'zapier', sideEffects: ['network-request'] },
  { id: 'zapier_list', name: 'List Zaps', description: 'List configured Zaps', category: 'read', risk: 'low', skillId: 'zapier', sideEffects: [] },
];

/**
 * Complete tool catalog — all tools from Core + AgenticMail + M365 + Google Workspace + Enterprise + Enterprise Utility
 */
export const ALL_TOOLS: ToolDefinition[] = [
  ...CORE_TOOLS,
  ...AGENTICMAIL_TOOLS,
  ...MICROSOFT_365_TOOLS,
  ...GOOGLE_WORKSPACE_TOOLS,
  ...ENTERPRISE_TOOLS,
  ...ENTERPRISE_UTILITY_TOOLS,
];

/**
 * Tool ID → ToolDefinition lookup
 */
export const TOOL_INDEX: Map<string, ToolDefinition> = new Map(ALL_TOOLS.map(t => [t.id, t]));

/**
 * Skill ID → Tool IDs mapping
 */
export function getToolsBySkill(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const tool of ALL_TOOLS) {
    const list = map.get(tool.skillId) || [];
    list.push(tool.id);
    map.set(tool.skillId, list);
  }
  return map;
}

/**
 * Generate tools.allow / tools.deny policy config
 */
export function generateToolPolicy(allowedToolIds: string[], blockedToolIds: string[]): {
  'tools.allow'?: string[];
  'tools.deny'?: string[];
} {
  const config: any = {};
  // tools.allow is the allowlist; tools.deny is the denylist
  // If allowlist is set, only those tools are available
  // If denylist is set, all tools except those are available
  if (blockedToolIds.length > 0 && allowedToolIds.length === 0) {
    config['tools.deny'] = blockedToolIds;
  } else if (allowedToolIds.length > 0) {
    config['tools.allow'] = allowedToolIds;
  }
  return config;
}
