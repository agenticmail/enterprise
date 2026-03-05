/**
 * AgenticMail Agent Tools — Enterprise Native
 *
 * These tools give enterprise agents email capabilities by calling
 * the org's email provider (Microsoft Graph / Gmail API) directly.
 * No separate AgenticMail server needed — agents authenticate via
 * the org's OAuth/SSO identity.
 *
 * Architecture:
 *   Agent tool call
 *     → AgenticMailManager.getProvider(agentId)
 *       → IEmailProvider (MS Graph / Gmail / IMAP)
 *         → Org mailbox
 */

import type { AnyAgentTool, ToolCreationOptions, ToolParameterSchema } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import type { IEmailProvider, SendEmailOptions, SearchCriteria, AgentMessage, AgentTask } from '../../agenticmail/types.js';

/** Manager interface — we only need getProvider() */
export interface AgenticMailManagerRef {
  getProvider(agentId: string): IEmailProvider;
  getIdentity?(agentId: string): { email: string; name: string } | undefined;
  /** Inter-agent messaging (if available) */
  sendAgentMessage?(msg: Omit<AgentMessage, 'id' | 'createdAt' | 'read'>): Promise<AgentMessage>;
  listAgentMessages?(agentId: string): Promise<AgentMessage[]>;
  /** Task management (if available) */
  createTask?(task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentTask>;
  listTasks?(agentId: string, direction?: 'incoming' | 'outgoing'): Promise<AgentTask[]>;
  claimTask?(taskId: string): Promise<AgentTask>;
  completeTask?(taskId: string, result: any): Promise<AgentTask>;
  /** Agent spawning for call_agent (if available) */
  spawnAgent?(agentId: string, taskId: string, payload: any): Promise<void>;
  /** Agent discovery (if available) */
  listAgents?(): Promise<{ agentId: string; name: string; email: string; role?: string }[]>;
  /** Storage/database access (if available) */
  storage?(agentId: string, operation: any): Promise<any>;
}

export interface AgenticMailToolsConfig {
  /** The AgenticMailManager instance */
  manager: AgenticMailManagerRef;
  /** The agent ID these tools are for */
  agentId: string;
}

/**
 * Create all AgenticMail tools backed by the org's email provider.
 * Tools operate on the agent's mailbox via OAuth — no API keys needed.
 */
export function createAgenticMailTools(
  config: AgenticMailToolsConfig,
  _options?: ToolCreationOptions,
): AnyAgentTool[] {
  const { manager, agentId } = config;
  const tools: AnyAgentTool[] = [];

  // ─── Helpers ──────────────────────────────────────────────────────

  function getProvider(): IEmailProvider {
    return manager.getProvider(agentId);
  }

  function p(props: Record<string, any>, required?: string[]): ToolParameterSchema {
    return { type: 'object', properties: props, required };
  }

  function defTool(
    name: string,
    label: string,
    description: string,
    params: ToolParameterSchema,
    risk: 'low' | 'medium' | 'high' | 'critical',
    handler: (args: Record<string, unknown>) => Promise<any>,
  ): void {
    tools.push({
      name,
      label,
      description,
      category: 'utility',
      risk,
      parameters: params,
      execute: async (_toolCallId, args) => {
        try {
          const result = await handler(args as Record<string, unknown>);
          return jsonResult(result ?? { success: true });
        } catch (err: any) {
          return errorResult(err.message || String(err));
        }
      },
    });
  }

  // ─── Email Core ───────────────────────────────────────────────────

  defTool('agenticmail_send', 'Send Email',
    'Send an email from your org mailbox.',
    p({
      to: { type: 'string', description: 'Recipient email' },
      subject: { type: 'string', description: 'Email subject' },
      text: { type: 'string', description: 'Plain text body' },
      html: { type: 'string', description: 'HTML body' },
      cc: { type: 'string', description: 'CC recipients' },
      bcc: { type: 'string', description: 'BCC recipients' },
      replyTo: { type: 'string', description: 'Reply-to address' },
      inReplyTo: { type: 'string', description: 'Message-ID to reply to' },
      references: { type: 'array', description: 'Message-IDs for threading' },
    }, ['to', 'subject']),
    'high',
    async (args) => {
      const provider = getProvider();
      const opts: SendEmailOptions = {
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.text || ''),
        html: args.html ? String(args.html) : undefined,
        cc: args.cc ? String(args.cc) : undefined,
        bcc: args.bcc ? String(args.bcc) : undefined,
        replyTo: args.replyTo ? String(args.replyTo) : undefined,
        inReplyTo: args.inReplyTo ? String(args.inReplyTo) : undefined,
        references: args.references as string[] | undefined,
      };
      return provider.send(opts);
    },
  );

  defTool('agenticmail_reply', 'Reply to Email',
    'Reply to an email by UID.',
    p({
      uid: { type: 'string', description: 'Email UID to reply to' },
      text: { type: 'string', description: 'Reply text' },
      replyAll: { type: 'boolean', description: 'Reply to all recipients' },
    }, ['uid', 'text']),
    'high',
    async (args) => {
      const provider = getProvider();
      return provider.reply(String(args.uid), String(args.text), !!args.replyAll);
    },
  );

  defTool('agenticmail_forward', 'Forward Email',
    'Forward an email to another recipient.',
    p({
      uid: { type: 'string', description: 'Email UID to forward' },
      to: { type: 'string', description: 'Recipient to forward to' },
      text: { type: 'string', description: 'Additional message' },
    }, ['uid', 'to']),
    'high',
    async (args) => {
      const provider = getProvider();
      return provider.forward(String(args.uid), String(args.to), args.text ? String(args.text) : undefined);
    },
  );

  defTool('agenticmail_inbox', 'List Inbox',
    'List recent emails in the inbox.',
    p({
      limit: { type: 'number', description: 'Max messages (default 20)' },
      offset: { type: 'number', description: 'Skip messages (default 0)' },
    }),
    'low',
    async (args) => {
      const provider = getProvider();
      return provider.listMessages('INBOX', {
        limit: args.limit ? Number(args.limit) : 20,
        offset: args.offset ? Number(args.offset) : 0,
      });
    },
  );

  defTool('agenticmail_read', 'Read Email',
    'Read a specific email by UID.',
    p({
      uid: { type: 'string', description: 'Email UID' },
      folder: { type: 'string', description: 'Folder (default INBOX)' },
    }, ['uid']),
    'low',
    async (args) => {
      const provider = getProvider();
      return provider.readMessage(String(args.uid), args.folder ? String(args.folder) : undefined);
    },
  );

  defTool('agenticmail_search', 'Search Emails',
    'Search emails by criteria.',
    p({
      from: { type: 'string', description: 'Sender address' },
      to: { type: 'string', description: 'Recipient address' },
      subject: { type: 'string', description: 'Subject keyword' },
      text: { type: 'string', description: 'Body text' },
      since: { type: 'string', description: 'Since date (ISO 8601)' },
      before: { type: 'string', description: 'Before date (ISO 8601)' },
      seen: { type: 'boolean', description: 'Filter by read/unread' },
    }),
    'low',
    async (args) => {
      const provider = getProvider();
      const criteria: SearchCriteria = {};
      if (args.from) criteria.from = String(args.from);
      if (args.to) criteria.to = String(args.to);
      if (args.subject) criteria.subject = String(args.subject);
      if (args.text) criteria.text = String(args.text);
      if (args.since) criteria.since = String(args.since);
      if (args.before) criteria.before = String(args.before);
      if (args.seen !== undefined) criteria.seen = !!args.seen;
      return provider.searchMessages(criteria);
    },
  );

  defTool('agenticmail_delete', 'Delete Email',
    'Delete an email by UID.',
    p({
      uid: { type: 'string', description: 'Email UID' },
      folder: { type: 'string', description: 'Folder (default INBOX)' },
    }, ['uid']),
    'medium',
    async (args) => {
      const provider = getProvider();
      await provider.deleteMessage(String(args.uid), args.folder ? String(args.folder) : undefined);
      return { success: true };
    },
  );

  defTool('agenticmail_move', 'Move Email',
    'Move an email to another folder.',
    p({
      uid: { type: 'string', description: 'Email UID' },
      to: { type: 'string', description: 'Destination folder' },
      from: { type: 'string', description: 'Source folder (default INBOX)' },
    }, ['uid', 'to']),
    'low',
    async (args) => {
      const provider = getProvider();
      await provider.moveMessage(String(args.uid), String(args.to), args.from ? String(args.from) : undefined);
      return { success: true };
    },
  );

  defTool('agenticmail_mark_read', 'Mark Read',
    'Mark an email as read.',
    p({ uid: { type: 'string', description: 'Email UID' } }, ['uid']),
    'low',
    async (args) => {
      const provider = getProvider();
      await provider.markRead(String(args.uid));
      return { success: true };
    },
  );

  defTool('agenticmail_mark_unread', 'Mark Unread',
    'Mark an email as unread.',
    p({ uid: { type: 'string', description: 'Email UID' } }, ['uid']),
    'low',
    async (args) => {
      const provider = getProvider();
      await provider.markUnread(String(args.uid));
      return { success: true };
    },
  );

  defTool('agenticmail_folders', 'List Folders',
    'List all mail folders.',
    p({}),
    'low',
    async () => {
      const provider = getProvider();
      return provider.listFolders();
    },
  );

  defTool('agenticmail_list_folder', 'List Folder',
    'List messages in a specific folder.',
    p({
      folder: { type: 'string', description: 'Folder path (e.g. Sent, Trash)' },
      limit: { type: 'number', description: 'Max messages (default 20)' },
      offset: { type: 'number', description: 'Skip messages (default 0)' },
    }, ['folder']),
    'low',
    async (args) => {
      const provider = getProvider();
      return provider.listMessages(String(args.folder), {
        limit: args.limit ? Number(args.limit) : 20,
        offset: args.offset ? Number(args.offset) : 0,
      });
    },
  );

  defTool('agenticmail_create_folder', 'Create Folder',
    'Create a new mail folder.',
    p({ name: { type: 'string', description: 'Folder name' } }, ['name']),
    'low',
    async (args) => {
      const provider = getProvider();
      await provider.createFolder(String(args.name));
      return { success: true };
    },
  );

  // ─── Batch Operations ──────────────────────────────────────────────

  defTool('agenticmail_batch_read', 'Batch Read',
    'Read multiple emails at once by UIDs.',
    p({
      uids: { type: 'array', description: 'Array of UIDs to read' },
      folder: { type: 'string', description: 'Folder (default INBOX)' },
    }, ['uids']),
    'low',
    async (args) => {
      const provider = getProvider();
      const uids = (args.uids as string[]).map(String);
      const folder = args.folder ? String(args.folder) : undefined;
      const results = await Promise.all(uids.map(uid => provider.readMessage(uid, folder).catch(err => ({ uid, error: err.message }))));
      return results;
    },
  );

  defTool('agenticmail_batch_delete', 'Batch Delete',
    'Delete multiple emails by UIDs.',
    p({
      uids: { type: 'array', description: 'UIDs to delete' },
      folder: { type: 'string', description: 'Folder (default INBOX)' },
    }, ['uids']),
    'medium',
    async (args) => {
      const provider = getProvider();
      const uids = (args.uids as string[]).map(String);
      const folder = args.folder ? String(args.folder) : undefined;
      await provider.batchDelete(uids, folder);
      return { success: true, count: uids.length };
    },
  );

  defTool('agenticmail_batch_move', 'Batch Move',
    'Move multiple emails to another folder.',
    p({
      uids: { type: 'array', description: 'UIDs to move' },
      to: { type: 'string', description: 'Destination folder' },
      from: { type: 'string', description: 'Source folder (default INBOX)' },
    }, ['uids', 'to']),
    'low',
    async (args) => {
      const provider = getProvider();
      const uids = (args.uids as string[]).map(String);
      await provider.batchMove(uids, String(args.to), args.from ? String(args.from) : undefined);
      return { success: true, count: uids.length };
    },
  );

  defTool('agenticmail_batch_mark_read', 'Batch Mark Read',
    'Mark multiple emails as read.',
    p({
      uids: { type: 'array', description: 'UIDs to mark as read' },
      folder: { type: 'string', description: 'Folder (default INBOX)' },
    }, ['uids']),
    'low',
    async (args) => {
      const provider = getProvider();
      const uids = (args.uids as string[]).map(String);
      await provider.batchMarkRead(uids, args.folder ? String(args.folder) : undefined);
      return { success: true, count: uids.length };
    },
  );

  defTool('agenticmail_batch_mark_unread', 'Batch Mark Unread',
    'Mark multiple emails as unread.',
    p({
      uids: { type: 'array', description: 'UIDs to mark as unread' },
      folder: { type: 'string', description: 'Folder (default INBOX)' },
    }, ['uids']),
    'low',
    async (args) => {
      const provider = getProvider();
      const uids = (args.uids as string[]).map(String);
      await provider.batchMarkUnread(uids, args.folder ? String(args.folder) : undefined);
      return { success: true, count: uids.length };
    },
  );

  // ─── Agent Identity ────────────────────────────────────────────────

  defTool('agenticmail_whoami', 'Who Am I',
    'Get your email identity and account info.',
    p({}),
    'low',
    async () => {
      const identity = manager.getIdentity?.(agentId);
      if (!identity) return { agentId, note: 'Identity details not available' };
      return { agentId, email: identity.email, name: identity.name };
    },
  );

  defTool('agenticmail_update_metadata', 'Update Metadata',
    'Update the current agent\'s metadata. Merges provided keys with existing metadata.',
    p({
      metadata: { type: 'object', description: 'Metadata key-value pairs to set or update' },
    }, ['metadata']),
    'low',
    async (args) => {
      // Enterprise version: metadata updates would go through the org's user management
      // For now, return success as a stub - real implementation would update agent profile
      return { success: true, metadata: args.metadata, note: 'Metadata update not implemented in this enterprise deployment' };
    },
  );

  // ─── Communication & Discovery ─────────────────────────────────────

  if (manager.listAgents || true) {
    defTool('agenticmail_list_agents', 'List Agents',
      'List all AI agents in the system with their email addresses and roles.',
      p({}),
      'low',
      async () => {
        // Enterprise version: would query the org directory for other agents
        // For now, return basic info
        return { agents: [{ agentId, name: agentId, email: manager.getIdentity?.(agentId)?.email || `${agentId}@localhost` }], note: 'Agent discovery not fully implemented in this enterprise deployment' };
      },
    );
  }

  if (manager.sendAgentMessage) {
    defTool('agenticmail_message_agent', 'Message Agent',
      'Send a message to another AI agent.',
      p({
        agent: { type: 'string', description: 'Recipient agent ID' },
        subject: { type: 'string', description: 'Message subject' },
        text: { type: 'string', description: 'Message body' },
        priority: { type: 'string', description: 'Priority: normal, high, urgent' },
      }, ['agent', 'subject', 'text']),
      'medium',
      async (args) => {
        return manager.sendAgentMessage!({
          from: agentId,
          to: String(args.agent),
          subject: String(args.subject),
          body: String(args.text),
          priority: (args.priority as any) || 'normal',
        });
      },
    );
  }

  if (manager.listAgentMessages) {
    defTool('agenticmail_check_messages', 'Check Messages',
      'Check for new messages from other agents.',
      p({}),
      'low',
      async () => {
        return manager.listAgentMessages!(agentId);
      },
    );
  }

  // ─── Task Management ───────────────────────────────────────────────

  if (manager.listTasks) {
    defTool('agenticmail_check_tasks', 'Check Tasks',
      'Check for pending tasks assigned to you.',
      p({
        direction: { type: 'string', description: 'incoming or outgoing (default incoming)' },
        assignee: { type: 'string', description: 'Check tasks for a specific agent by name (e.g., your parent/coordinator agent). Only for incoming direction.' },
      }),
      'low',
      async (args) => {
        return manager.listTasks!(args.assignee ? String(args.assignee) : agentId, (args.direction as any) || 'incoming');
      },
    );
  }

  if (manager.claimTask) {
    defTool('agenticmail_claim_task', 'Claim Task',
      'Claim a pending task.',
      p({ id: { type: 'string', description: 'Task ID' } }, ['id']),
      'low',
      async (args) => manager.claimTask!(String(args.id)),
    );
  }

  if (manager.completeTask) {
    defTool('agenticmail_complete_task', 'Complete Task',
      'Claim and submit result in one call.',
      p({
        id: { type: 'string', description: 'Task ID' },
        result: { type: 'object', description: 'Task result data' },
      }, ['id']),
      'low',
      async (args) => manager.completeTask!(String(args.id), args.result),
    );
  }

  if (manager.completeTask) {
    defTool('agenticmail_submit_result', 'Submit Result',
      'Submit the result for a claimed task, marking it as completed.',
      p({
        id: { type: 'string', description: 'Task ID' },
        result: { type: 'object', description: 'Task result data' },
      }, ['id']),
      'low',
      async (args) => {
        // In enterprise, this would be separate from complete_task if there's a claim/submit workflow
        // For now, use the same implementation as complete_task
        return manager.completeTask!(String(args.id), args.result);
      },
    );
  }

  // ─── Digest & Efficiency Tools ─────────────────────────────────────

  defTool('agenticmail_digest', 'Inbox Digest',
    'Get a compact inbox digest with subject, sender, date, flags and a text preview for each message.',
    p({
      limit: { type: 'number', description: 'Max messages (default: 20, max: 50)' },
      offset: { type: 'number', description: 'Skip messages (default: 0)' },
      folder: { type: 'string', description: 'Folder (default: INBOX)' },
      previewLength: { type: 'number', description: 'Preview text length (default: 200, max: 500)' },
    }),
    'low',
    async (args) => {
      const provider = getProvider();
      const folder = args.folder ? String(args.folder) : 'INBOX';
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const offset = Math.max(Number(args.offset) || 0, 0);
      const previewLength = Math.min(Math.max(Number(args.previewLength) || 200, 50), 500);

      const envelopes = await provider.listMessages(folder, { limit, offset });
      
      // Create digest by reading preview of each message
      const digest = [];
      for (const envelope of envelopes) {
        try {
          const message = await provider.readMessage(envelope.uid, folder);
          const preview = (message.body || '').slice(0, previewLength);
          digest.push({
            uid: envelope.uid,
            from: envelope.from,
            to: envelope.to,
            subject: envelope.subject,
            date: envelope.date,
            read: envelope.read,
            flagged: envelope.flagged,
            hasAttachments: envelope.hasAttachments,
            preview,
          });
        } catch (err) {
          // If we can't read a message, include envelope with error note
          digest.push({
            ...envelope,
            preview: `[Error reading message: ${(err as Error).message}]`,
          });
        }
      }

      return { messages: digest, count: digest.length, folder };
    },
  );

  // ─── Contact Management ────────────────────────────────────────────

  defTool('agenticmail_contacts', 'Manage Contacts',
    'Manage contacts (list, add, delete).',
    p({
      action: { type: 'string', description: 'list, add, or delete' },
      email: { type: 'string', description: 'Contact email (for add)' },
      name: { type: 'string', description: 'Contact name (for add)' },
      id: { type: 'string', description: 'Contact ID (for delete)' },
    }, ['action']),
    'low',
    async (args) => {
      // Enterprise version: would integrate with org's contact directory (Exchange, Google Contacts, etc.)
      const action = String(args.action);
      
      if (action === 'list') {
        return { contacts: [], note: 'Contact management not implemented in this enterprise deployment' };
      }
      if (action === 'add') {
        return { success: true, note: 'Contact add not implemented in this enterprise deployment', email: args.email, name: args.name };
      }
      if (action === 'delete') {
        return { success: true, note: 'Contact delete not implemented in this enterprise deployment', id: args.id };
      }
      
      return { success: false, error: 'Invalid action. Use: list, add, or delete' };
    },
  );

  // ─── Tag Management ─────────────────────────────────────────────────

  defTool('agenticmail_tags', 'Manage Tags',
    'Manage tags/labels: list, create, delete, tag/untag messages, get messages by tag.',
    p({
      action: { type: 'string', description: 'list, create, delete, tag_message, untag_message, get_messages, get_message_tags' },
      name: { type: 'string', description: 'Tag name (for create)' },
      color: { type: 'string', description: 'Tag color hex (for create)' },
      id: { type: 'string', description: 'Tag ID (for delete, tag/untag, get_messages)' },
      uid: { type: 'string', description: 'Message UID (for tag/untag)' },
      folder: { type: 'string', description: 'Folder (default: INBOX)' },
    }, ['action']),
    'low',
    async (args) => {
      // Enterprise version: would use provider's native labeling (Gmail labels, Outlook categories, etc.)
      const action = String(args.action);
      
      if (action === 'list') {
        return { tags: [], note: 'Tag management not implemented in this enterprise deployment' };
      }
      if (action === 'create') {
        return { success: true, id: 'stub-tag-id', name: args.name, color: args.color, note: 'Tag create not implemented in this enterprise deployment' };
      }
      if (action === 'delete') {
        return { success: true, note: 'Tag delete not implemented in this enterprise deployment' };
      }
      if (action === 'tag_message') {
        return { success: true, note: 'Message tagging not implemented in this enterprise deployment' };
      }
      if (action === 'untag_message') {
        return { success: true, note: 'Message untagging not implemented in this enterprise deployment' };
      }
      if (action === 'get_messages') {
        return { messages: [], note: 'Get tagged messages not implemented in this enterprise deployment' };
      }
      if (action === 'get_message_tags') {
        return { tags: [], note: 'Get message tags not implemented in this enterprise deployment' };
      }
      
      return { success: false, error: 'Invalid action' };
    },
  );

  // ─── Draft Management ───────────────────────────────────────────────

  defTool('agenticmail_drafts', 'Manage Drafts',
    'Manage email drafts: list, create, update, delete, or send a draft.',
    p({
      action: { type: 'string', description: 'list, create, update, delete, or send' },
      id: { type: 'string', description: 'Draft ID (for update, delete, send)' },
      to: { type: 'string', description: 'Recipient (for create/update)' },
      subject: { type: 'string', description: 'Subject (for create/update)' },
      text: { type: 'string', description: 'Body text (for create/update)' },
    }, ['action']),
    'medium',
    async (args) => {
      // Enterprise version: would use provider's native draft support
      const action = String(args.action);
      
      if (action === 'list') {
        return { drafts: [], note: 'Draft management not implemented in this enterprise deployment' };
      }
      if (action === 'create') {
        return { success: true, id: 'stub-draft-id', to: args.to, subject: args.subject, note: 'Draft create not implemented in this enterprise deployment' };
      }
      if (action === 'update') {
        return { success: true, note: 'Draft update not implemented in this enterprise deployment' };
      }
      if (action === 'delete') {
        return { success: true, note: 'Draft delete not implemented in this enterprise deployment' };
      }
      if (action === 'send') {
        // For send, we could potentially implement this by using the regular send functionality
        return { success: true, note: 'Draft send not implemented - use agenticmail_send instead' };
      }
      
      return { success: false, error: 'Invalid action. Use: list, create, update, delete, or send' };
    },
  );

  // ─── Signature Management ───────────────────────────────────────────

  defTool('agenticmail_signatures', 'Manage Signatures',
    'Manage email signatures: list, create, or delete.',
    p({
      action: { type: 'string', description: 'list, create, or delete' },
      id: { type: 'string', description: 'Signature ID (for delete)' },
      name: { type: 'string', description: 'Signature name (for create)' },
      text: { type: 'string', description: 'Signature text content (for create)' },
      isDefault: { type: 'boolean', description: 'Set as default signature (for create)' },
    }, ['action']),
    'low',
    async (args) => {
      // Enterprise version: would use provider's signature management
      const action = String(args.action);
      
      if (action === 'list') {
        return { signatures: [], note: 'Signature management not implemented in this enterprise deployment' };
      }
      if (action === 'create') {
        return { success: true, id: 'stub-signature-id', name: args.name, text: args.text, isDefault: args.isDefault, note: 'Signature create not implemented in this enterprise deployment' };
      }
      if (action === 'delete') {
        return { success: true, note: 'Signature delete not implemented in this enterprise deployment' };
      }
      
      return { success: false, error: 'Invalid action. Use: list, create, or delete' };
    },
  );

  // ─── Template Management ────────────────────────────────────────────

  defTool('agenticmail_templates', 'Manage Templates',
    'Manage email templates: list, create, or delete.',
    p({
      action: { type: 'string', description: 'list, create, or delete' },
      id: { type: 'string', description: 'Template ID (for delete)' },
      name: { type: 'string', description: 'Template name (for create)' },
      subject: { type: 'string', description: 'Template subject (for create)' },
      text: { type: 'string', description: 'Template body text (for create)' },
    }, ['action']),
    'low',
    async (args) => {
      // Enterprise version: would store templates in company's template system
      const action = String(args.action);
      
      if (action === 'list') {
        return { templates: [], note: 'Template management not implemented in this enterprise deployment' };
      }
      if (action === 'create') {
        return { success: true, id: 'stub-template-id', name: args.name, subject: args.subject, text: args.text, note: 'Template create not implemented in this enterprise deployment' };
      }
      if (action === 'delete') {
        return { success: true, note: 'Template delete not implemented in this enterprise deployment' };
      }
      
      return { success: false, error: 'Invalid action. Use: list, create, or delete' };
    },
  );

  defTool('agenticmail_template_send', 'Send Template',
    'Send an email using a saved template with variable substitution.',
    p({
      id: { type: 'string', description: 'Template ID' },
      to: { type: 'string', description: 'Recipient email' },
      variables: { type: 'object', description: 'Variables to substitute: { name: "Alice", company: "Acme" }' },
      cc: { type: 'string', description: 'CC recipients' },
      bcc: { type: 'string', description: 'BCC recipients' },
    }, ['id', 'to']),
    'high',
    async (_args) => {
      // Enterprise version: would load template and perform substitution, then send
      return { success: false, error: 'Template send not implemented in this enterprise deployment - use agenticmail_send instead' };
    },
  );

  // ─── Rules & Automation ─────────────────────────────────────────────

  defTool('agenticmail_rules', 'Manage Rules',
    'Manage server-side email rules that auto-process incoming messages.',
    p({
      action: { type: 'string', description: 'list, create, or delete' },
      id: { type: 'string', description: 'Rule ID (for delete)' },
      name: { type: 'string', description: 'Rule name (for create)' },
      priority: { type: 'number', description: 'Higher priority rules match first (for create)' },
      conditions: { type: 'object', description: 'Match conditions: { from_contains?, from_exact?, subject_contains?, subject_regex?, to_contains?, has_attachment? }' },
      actions: { type: 'object', description: 'Actions on match: { move_to?, mark_read?, delete?, add_tags? }' },
    }, ['action']),
    'low',
    async (args) => {
      // Enterprise version: would use provider's native rules (Outlook rules, Gmail filters)
      const action = String(args.action);
      
      if (action === 'list') {
        return { rules: [], note: 'Email rules not implemented in this enterprise deployment' };
      }
      if (action === 'create') {
        return { success: true, id: 'stub-rule-id', name: args.name, priority: args.priority, note: 'Rule create not implemented in this enterprise deployment' };
      }
      if (action === 'delete') {
        return { success: true, note: 'Rule delete not implemented in this enterprise deployment' };
      }
      
      return { success: false, error: 'Invalid action. Use: list, create, or delete' };
    },
  );

  // ─── Scheduling ─────────────────────────────────────────────────────

  defTool('agenticmail_schedule', 'Schedule Email',
    'Manage scheduled emails: create, list, or cancel.',
    p({
      action: { type: 'string', description: 'create, list, or cancel' },
      to: { type: 'string', description: 'Recipient (for create)' },
      subject: { type: 'string', description: 'Subject (for create)' },
      text: { type: 'string', description: 'Body text (for create)' },
      sendAt: { type: 'string', description: 'When to send (for create). Examples: "in 30 minutes", "tomorrow 8am", or ISO 8601' },
      id: { type: 'string', description: 'Scheduled email ID (for cancel)' },
    }, ['action']),
    'medium',
    async (args) => {
      // Enterprise version: would use provider's native scheduling or enterprise scheduler
      const action = String(args.action);
      
      if (action === 'list') {
        return { scheduled: [], note: 'Email scheduling not implemented in this enterprise deployment' };
      }
      if (action === 'create') {
        return { success: true, id: 'stub-scheduled-id', sendAt: args.sendAt, note: 'Email scheduling not implemented in this enterprise deployment' };
      }
      if (action === 'cancel') {
        return { success: true, note: 'Email scheduling not implemented in this enterprise deployment' };
      }
      
      return { success: false, error: 'Invalid action. Use: create, list, or cancel' };
    },
  );

  // ─── Spam Management ────────────────────────────────────────────────

  defTool('agenticmail_spam', 'Manage Spam',
    'Manage spam: list the spam folder, report a message as spam, mark as not-spam, or get spam score.',
    p({
      action: { type: 'string', description: 'list, report, not_spam, or score' },
      uid: { type: 'string', description: 'Message UID (for report, not_spam, score)' },
      folder: { type: 'string', description: 'Source folder (for report/score, default: INBOX)' },
      limit: { type: 'number', description: 'Max messages to list (for list, default: 20)' },
      offset: { type: 'number', description: 'Skip messages (for list, default: 0)' },
    }, ['action']),
    'low',
    async (args) => {
      const provider = getProvider();
      const action = String(args.action);
      
      if (action === 'list') {
        // List spam folder
        try {
          const limit = Math.max(Number(args.limit) || 20, 1);
          const offset = Math.max(Number(args.offset) || 0, 0);
          const messages = await provider.listMessages('Spam', { limit, offset });
          return { messages, count: messages.length };
        } catch (err) {
          return { messages: [], count: 0, note: 'Spam folder not available or accessible' };
        }
      }
      if (action === 'report') {
        // Move message to spam folder
        if (!args.uid) return { success: false, error: 'uid is required' };
        const folder = args.folder ? String(args.folder) : 'INBOX';
        try {
          await provider.moveMessage(String(args.uid), 'Spam', folder);
          return { success: true, uid: args.uid, action: 'moved to spam' };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }
      if (action === 'not_spam') {
        // Move message back to inbox
        if (!args.uid) return { success: false, error: 'uid is required' };
        try {
          await provider.moveMessage(String(args.uid), 'INBOX', 'Spam');
          return { success: true, uid: args.uid, action: 'moved to inbox' };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }
      if (action === 'score') {
        // Enterprise version: would analyze spam score, for now return basic info
        if (!args.uid) return { success: false, error: 'uid is required' };
        return { uid: args.uid, score: 0, category: 'unknown', note: 'Spam scoring not implemented in this enterprise deployment' };
      }
      
      return { success: false, error: 'Invalid action. Use: list, report, not_spam, or score' };
    },
  );

  // ─── Push Notifications ─────────────────────────────────────────────

  defTool('agenticmail_wait_for_email', 'Wait for Email',
    'Wait for a new email or task notification using push notifications.',
    p({
      timeout: { type: 'number', description: 'Max seconds to wait (default: 120, max: 300)' },
    }),
    'low',
    async (args) => {
      // Enterprise version: would set up real-time notifications via provider's APIs
      // For now, implement as a simple polling fallback
      const timeoutSec = Math.min(Math.max(Number(args.timeout) || 120, 5), 300);
      
      return {
        arrived: false,
        reason: 'Push notifications not implemented in this enterprise deployment',
        mode: 'fallback',
        note: 'Use agenticmail_inbox or agenticmail_check_messages to poll for new messages',
        timeout: timeoutSec,
      };
    },
  );

  // ─── Storage (if available) ──────────────────────────────────────────

  if (manager.storage) {
    defTool('agenticmail_storage', 'Database Storage',
      'Full database management for agents. Create/alter/drop tables, CRUD rows, manage indexes, etc.',
      p({
        action: { type: 'string', description: 'create_table, list_tables, describe_table, insert, upsert, query, aggregate, update, delete_rows, truncate, drop_table, etc.' },
        table: { type: 'string', description: 'Table name' },
        description: { type: 'string', description: 'For create_table: human-readable description' },
        columns: { type: 'array', description: 'For create_table: [{name, type, required?, default?, unique?, primaryKey?}]' },
        shared: { type: 'boolean', description: 'For create_table: accessible by all agents (default: false)' },
        timestamps: { type: 'boolean', description: 'For create_table: auto-add created_at/updated_at (default: true)' },
        rows: { type: 'array', description: 'For insert/upsert: array of row objects' },
        where: { type: 'object', description: 'For query/update/delete_rows: filter conditions' },
        set: { type: 'object', description: 'For update: {column: newValue}' },
        orderBy: { type: 'string', description: 'For query: ORDER BY clause' },
        limit: { type: 'number', description: 'For query: max rows' },
        offset: { type: 'number', description: 'For query: skip N rows' },
        selectColumns: { type: 'array', description: 'For query: specific columns to select' },
      }, ['action']),
      'medium',
      async (args) => {
        // Enterprise version: would use the enterprise database system
        return manager.storage!(agentId, args);
      },
    );
  }

  // ─── Advanced Call Agent (CRITICAL) ─────────────────────────────────

  if (manager.createTask && manager.spawnAgent) {
    defTool('agenticmail_call_agent', 'Call Agent',
      'Call another agent with a task. Supports sync (wait for result) and async (fire-and-forget) modes.',
      p({
        target: { type: 'string', description: 'Name of the agent to call' },
        task: { type: 'string', description: 'Task description' },
        payload: { type: 'object', description: 'Additional data for the task' },
        timeout: { type: 'number', description: 'Max seconds to wait (sync mode only). Default: auto-scaled by complexity (light=60s, standard=180s, full=300s). Max: 600.' },
        mode: { type: 'string', description: '"light" (no email, minimal context), "standard" (email but trimmed context), "full" (all coordination features). Default: auto-detect from task complexity.' },
        async: { type: 'boolean', description: 'If true, returns immediately after spawning. The agent will email/notify when done. Use for long-running tasks.' },
      }, ['target', 'task']),
      'high',
      async (args: any) => {
        const taskText = (args.task || '').toLowerCase();
        
        // Auto-detect mode from task complexity
        let mode: string = args.mode || 'auto';
        if (mode === 'auto') {
          const needsWebTools = /\b(search|research|find|look\s?up|browse|web|scrape|fetch|summarize|analyze|compare|review|check.*(?:site|url|link|page)|read.*(?:article|page|url))\b/i;
          const needsCoordination = /\b(email|send.*to|forward|reply|agent|coordinate|delegate|multi.?step|pipeline|hand.?off)\b/i;
          const needsFileOps = /\b(file|read|write|upload|download|install|deploy|create.*(?:doc|report|pdf))\b/i;
          const isLongRunning = /\b(monitor|watch|poll|continuous|ongoing|daily|hourly|schedule|repeat|long.?running|over.*time|days?|hours?|overnight)\b/i;

          if (isLongRunning.test(taskText) || needsCoordination.test(taskText)) {
            mode = 'full';
          } else if (needsWebTools.test(taskText) || needsFileOps.test(taskText)) {
            mode = 'standard';
          } else if (taskText.length < 200) {
            mode = 'light';
          } else {
            mode = 'standard';
          }
        }

        // Auto-detect async for long-running tasks
        const isAsync = args.async === true ||
          /\b(monitor|watch|continuous|ongoing|daily|hourly|overnight|days?|hours?)\b/i.test(taskText);

        // Dynamic timeout based on mode and complexity
        const defaultTimeouts: Record<string, number> = { light: 60, standard: 180, full: 300 };
        const maxTimeout = 600;
        const timeoutSec = isAsync ? 0 : Math.min(Math.max(Number(args.timeout) || defaultTimeouts[mode] || 180, 5), maxTimeout);

        const taskPayload = {
          task: args.task,
          _mode: mode,
          _async: isAsync,
          ...(args.payload || {}),
        };

        // Step 1: Create the task
        const created = await manager.createTask!({
          assignee: String(args.target),
          assigner: agentId,
          title: String(args.task),
          description: String(args.task),
          status: 'pending',
          priority: 'normal',
          // payload: taskPayload, // Add if AgentTask interface supports payload
        });
        
        const taskId = created.id;

        // Step 2: Spawn the agent session if needed
        if (manager.spawnAgent) {
          await manager.spawnAgent(String(args.target), taskId, taskPayload);
        }

        // Step 3a: Async mode — return immediately
        if (isAsync) {
          return {
            taskId,
            status: 'spawned',
            mode,
            async: true,
            message: `Task assigned to "${args.target}" and agent spawned. It will run independently and notify you when done. Check progress with agenticmail_check_tasks.`,
          };
        }

        // Step 3b: Sync mode — poll for completion
        const deadline = Date.now() + timeoutSec * 1000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            // Check if task is completed by querying the task manager
            const tasks = await manager.listTasks!(agentId, 'outgoing');
            const task = Array.isArray(tasks) ? tasks.find((t: any) => t.id === taskId) : (tasks as any).tasks?.find((t: any) => t.id === taskId);
            
            if (task?.status === 'completed') {
              return { taskId, status: 'completed', mode, result: task.result };
            }
            if (task?.status === 'cancelled') {
              return { taskId, status: 'failed', mode, error: 'Task was cancelled' };
            }
          } catch { /* poll error — retry on next cycle */ }
        }

        return { taskId, status: 'timeout', mode, message: `Task not completed within ${timeoutSec}s. The agent is still running — check with agenticmail_check_tasks or wait for email notification.` };
      },
    );
  }

  return tools;
}
