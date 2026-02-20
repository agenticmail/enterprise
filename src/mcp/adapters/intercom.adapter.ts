/**
 * MCP Skill Adapter — Intercom
 *
 * Maps Intercom REST API endpoints to MCP tool handlers.
 * Covers contact creation, conversation listing, and conversation replies.
 *
 * Intercom API docs: https://developers.intercom.com/docs/references/rest-api/api.intercom.io/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function intercomError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Intercom error responses: { type: "error.list", errors: [{ code, message }] }
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => `${e.code || 'error'}: ${e.message}`).join('; ');
        return { content: `Intercom API error: ${details}`, isError: true };
      }
      return { content: `Intercom API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Intercom API error: ${err.message}`, isError: true };
  }
  return { content: `Intercom API error: ${String(err)}`, isError: true };
}

/** Format an Intercom contact for display */
function formatContact(contact: any): string {
  const name = contact.name || '(no name)';
  const email = contact.email || '(no email)';
  const role = contact.role || 'user';
  const created = contact.created_at
    ? new Date(contact.created_at * 1000).toISOString().slice(0, 10)
    : '';
  return `${name} <${email}> -- ${role} -- created: ${created} (ID: ${contact.id})`;
}

/** Format an Intercom conversation for display */
function formatConversation(convo: any): string {
  const id = convo.id || 'unknown';
  const state = convo.state || 'unknown';
  const title = convo.title || convo.source?.subject || '(no subject)';
  const assignee = convo.assignee?.name || convo.assignee?.email || 'unassigned';
  const created = convo.created_at
    ? new Date(convo.created_at * 1000).toISOString().slice(0, 16)
    : '';
  const waiting = convo.waiting_since
    ? ` -- waiting since ${new Date(convo.waiting_since * 1000).toISOString().slice(0, 16)}`
    : '';
  return `#${id} "${title}" -- ${state} -- assignee: ${assignee} -- ${created}${waiting}`;
}

// ─── Tool: intercom_create_contact ──────────────────────

const createContact: ToolHandler = {
  description:
    'Create a new contact (lead or user) in Intercom. Provide at least an email or external_id.',
  inputSchema: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        enum: ['user', 'lead'],
        description: 'Contact role: "user" for identified users, "lead" for anonymous leads (default: "user")',
      },
      email: {
        type: 'string',
        description: 'Contact email address',
      },
      external_id: {
        type: 'string',
        description: 'Unique ID from your system for this contact',
      },
      name: {
        type: 'string',
        description: 'Contact full name',
      },
      phone: {
        type: 'string',
        description: 'Contact phone number',
      },
      avatar: {
        type: 'string',
        description: 'URL to the contact avatar image',
      },
      custom_attributes: {
        type: 'object',
        description: 'Custom attributes as key-value pairs',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        role: params.role || 'user',
      };
      if (params.email) body.email = params.email;
      if (params.external_id) body.external_id = params.external_id;
      if (params.name) body.name = params.name;
      if (params.phone) body.phone = params.phone;
      if (params.avatar) body.avatar = params.avatar;
      if (params.custom_attributes) body.custom_attributes = params.custom_attributes;

      if (!body.email && !body.external_id) {
        return {
          content: 'Error: At least one of "email" or "external_id" is required to create a contact.',
          isError: true,
        };
      }

      const result = await ctx.apiExecutor.post('/contacts', body);

      return {
        content: `Contact created: ${formatContact(result)}`,
        metadata: {
          contactId: result.id,
          email: result.email,
          role: result.role,
        },
      };
    } catch (err) {
      return intercomError(err);
    }
  },
};

// ─── Tool: intercom_list_conversations ──────────────────

const listConversations: ToolHandler = {
  description:
    'List conversations from Intercom. Returns conversation subjects, states, and assignees.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Number of conversations per page (default 20, max 150)',
      },
      starting_after: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
      };
      if (params.starting_after) query.starting_after = params.starting_after;

      const result = await ctx.apiExecutor.get('/conversations', query);

      const conversations: any[] = result.conversations || result.data || [];
      if (conversations.length === 0) {
        return { content: 'No conversations found.' };
      }

      const lines = conversations.map((c: any) => formatConversation(c));
      const nextCursor = result.pages?.next?.starting_after;

      return {
        content: `Found ${conversations.length} conversations:\n${lines.join('\n')}${nextCursor ? `\n\n(More available, cursor: ${nextCursor})` : ''}`,
        metadata: {
          count: conversations.length,
          totalCount: result.total_count,
          nextCursor,
        },
      };
    } catch (err) {
      return intercomError(err);
    }
  },
};

// ─── Tool: intercom_reply_conversation ──────────────────

const replyConversation: ToolHandler = {
  description:
    'Reply to an existing Intercom conversation. Can send as an admin (agent), or add an internal note.',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        description: 'The conversation ID to reply to',
      },
      body: {
        type: 'string',
        description: 'Reply body text (supports HTML)',
      },
      message_type: {
        type: 'string',
        enum: ['comment', 'note'],
        description: '"comment" for a public reply, "note" for an internal note (default: "comment")',
      },
      admin_id: {
        type: 'string',
        description: 'The admin (agent) ID sending the reply. Required for admin replies.',
      },
      type: {
        type: 'string',
        enum: ['admin', 'user'],
        description: 'Who is replying: "admin" or "user" (default: "admin")',
      },
    },
    required: ['conversation_id', 'body', 'admin_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        message_type: params.message_type || 'comment',
        type: params.type || 'admin',
        admin_id: params.admin_id,
        body: params.body,
      };

      const result = await ctx.apiExecutor.post(
        `/conversations/${params.conversation_id}/reply`,
        body,
      );

      const msgType = params.message_type || 'comment';
      const convoId = result.conversation_id || params.conversation_id;
      return {
        content: `${msgType === 'note' ? 'Internal note' : 'Reply'} added to conversation #${convoId}`,
        metadata: {
          conversationId: convoId,
          messageType: msgType,
          adminId: params.admin_id,
        },
      };
    } catch (err) {
      return intercomError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const intercomAdapter: SkillAdapter = {
  skillId: 'intercom-support',
  name: 'Intercom Support',
  baseUrl: 'https://api.intercom.io',
  auth: {
    type: 'oauth2',
    provider: 'intercom',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Accept': 'application/json',
    'Intercom-Version': '2.11',
  },
  tools: {
    intercom_create_contact: createContact,
    intercom_list_conversations: listConversations,
    intercom_reply_conversation: replyConversation,
  },
  rateLimits: {
    requestsPerSecond: 8,
    burstLimit: 16,
  },
};
