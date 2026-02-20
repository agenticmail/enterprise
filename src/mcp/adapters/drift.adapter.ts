/**
 * MCP Skill Adapter — Drift
 *
 * Maps Drift Conversational Marketing API endpoints to MCP tool handlers.
 * Covers conversations, messages, and contacts for conversational marketing.
 *
 * Drift API docs: https://devdocs.drift.com/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function driftError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error?.message || data.message || err.message;
      const type = data.error?.type || '';
      return { content: `Drift API error${type ? ` [${type}]` : ''}: ${msg}`, isError: true };
    }
    return { content: `Drift API error: ${err.message}`, isError: true };
  }
  return { content: `Drift API error: ${String(err)}`, isError: true };
}

/** Format a Drift conversation for display */
function formatConversation(convo: any): string {
  const id = convo.id || 'unknown';
  const status = convo.status || 'unknown';
  const createdAt = convo.createdAt
    ? new Date(convo.createdAt).toISOString().slice(0, 16)
    : '';
  const updatedAt = convo.updatedAt
    ? new Date(convo.updatedAt).toISOString().slice(0, 16)
    : '';
  const contactId = convo.contactId || 'unknown';
  const inboxId = convo.inboxId ? `inbox: ${convo.inboxId}` : '';
  return `#${id} -- ${status} -- contact: ${contactId}${inboxId ? ` -- ${inboxId}` : ''} -- created: ${createdAt}, updated: ${updatedAt}`;
}

/** Format a Drift contact for display */
function formatContact(contact: any): string {
  const attrs = contact.attributes || contact;
  const name = attrs.name || [attrs.firstName, attrs.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = attrs.email || '(no email)';
  const phone = attrs.phone || '';
  const company = attrs.company || attrs.companyName || '';
  const phonePart = phone ? ` -- ${phone}` : '';
  const companyPart = company ? ` @ ${company}` : '';
  return `${name} <${email}>${companyPart}${phonePart} (ID: ${contact.id})`;
}

/** Format a Drift message for display */
function formatMessage(msg: any): string {
  const type = msg.type || 'unknown';
  const author = msg.author?.type === 'contact'
    ? `contact:${msg.author.id}`
    : msg.author?.type === 'user'
      ? `agent:${msg.author.id}`
      : msg.author?.type || 'bot';
  const body = msg.body ? msg.body.substring(0, 100) + (msg.body.length > 100 ? '...' : '') : '(no body)';
  const created = msg.createdAt
    ? new Date(msg.createdAt).toISOString().slice(0, 16)
    : '';
  return `[${type}] ${author}: ${body} -- ${created} (ID: ${msg.id})`;
}

// ─── Tool: drift_list_conversations ─────────────────────

const listConversations: ToolHandler = {
  description:
    'List conversations from Drift. Returns conversation IDs, statuses, and contact information.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'closed', 'pending', 'bulk_sent'],
        description: 'Filter by conversation status',
      },
      limit: {
        type: 'number',
        description: 'Max conversations to return (default 25, max 50)',
      },
      next: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.status) query.status = params.status;
      if (params.next) query.next = params.next;

      const result = await ctx.apiExecutor.get('/conversations', query);

      const conversations: any[] = result.data || [];
      if (conversations.length === 0) {
        return { content: 'No conversations found.' };
      }

      const lines = conversations.map((c: any) => formatConversation(c));
      const pagination = result.pagination || {};

      return {
        content: `Found ${conversations.length} conversations:\n${lines.join('\n')}${pagination.next ? '\n\n(More available)' : ''}`,
        metadata: {
          count: conversations.length,
          hasMore: !!pagination.next,
          next: pagination.next,
        },
      };
    } catch (err) {
      return driftError(err);
    }
  },
};

// ─── Tool: drift_send_message ───────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a message in a Drift conversation. Can send as a user (agent) or post a chat message.',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'number',
        description: 'The conversation ID to send the message in',
      },
      body: {
        type: 'string',
        description: 'Message body text',
      },
      type: {
        type: 'string',
        enum: ['chat', 'private_note'],
        description: 'Message type: "chat" for a visible message, "private_note" for an internal note (default: "chat")',
      },
      user_id: {
        type: 'number',
        description: 'Agent user ID sending the message (required for agent replies)',
      },
    },
    required: ['conversation_id', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        body: params.body,
        type: params.type || 'chat',
      };
      if (params.user_id) body.userId = params.user_id;

      const result = await ctx.apiExecutor.post(
        `/conversations/${params.conversation_id}/messages`,
        body,
      );

      const msg = result.data || result;
      const msgType = params.type || 'chat';
      return {
        content: `${msgType === 'private_note' ? 'Private note' : 'Message'} sent in conversation #${params.conversation_id} (message ID: ${msg.id || 'sent'})`,
        metadata: {
          conversationId: params.conversation_id,
          messageId: msg.id,
          type: msgType,
        },
      };
    } catch (err) {
      return driftError(err);
    }
  },
};

// ─── Tool: drift_list_contacts ──────────────────────────

const listContacts: ToolHandler = {
  description:
    'List contacts from Drift. Returns contact names, emails, and companies.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Filter by email address',
      },
      limit: {
        type: 'number',
        description: 'Max contacts to return (default 25)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      // If filtering by email, use the lookup endpoint
      if (params.email) {
        const result = await ctx.apiExecutor.get('/contacts', { email: params.email });

        const contacts: any[] = result.data || [];
        if (contacts.length === 0) {
          return { content: `No contacts found with email "${params.email}".` };
        }

        const lines = contacts.map((c: any) => formatContact(c));
        return {
          content: `Found ${contacts.length} contacts:\n${lines.join('\n')}`,
          metadata: { count: contacts.length },
        };
      }

      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get('/contacts', query);

      const contacts: any[] = result.data || [];
      if (contacts.length === 0) {
        return { content: 'No contacts found.' };
      }

      const lines = contacts.map((c: any) => formatContact(c));
      const pagination = result.pagination || {};

      return {
        content: `Found ${contacts.length} contacts:\n${lines.join('\n')}${pagination.next ? '\n\n(More available)' : ''}`,
        metadata: { count: contacts.length, hasMore: !!pagination.next },
      };
    } catch (err) {
      return driftError(err);
    }
  },
};

// ─── Tool: drift_get_conversation ───────────────────────

const getConversation: ToolHandler = {
  description:
    'Get detailed information about a specific Drift conversation, including its messages.',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'number',
        description: 'The conversation ID to retrieve',
      },
    },
    required: ['conversation_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/conversations/${params.conversation_id}`);

      const convo = result.data;
      if (!convo) {
        return { content: `Conversation ${params.conversation_id} not found.` };
      }

      const details: string[] = [];
      details.push(`Conversation #${convo.id}`);
      details.push(`Status: ${convo.status || 'unknown'}`);
      details.push(`Contact: ${convo.contactId || 'unknown'}`);
      if (convo.inboxId) details.push(`Inbox: ${convo.inboxId}`);
      if (convo.createdAt) details.push(`Created: ${new Date(convo.createdAt).toISOString().slice(0, 16)}`);
      if (convo.updatedAt) details.push(`Updated: ${new Date(convo.updatedAt).toISOString().slice(0, 16)}`);

      // Fetch messages
      const msgsResult = await ctx.apiExecutor.get(`/conversations/${params.conversation_id}/messages`);

      const messages: any[] = msgsResult.data?.messages || msgsResult.data || [];
      if (messages.length > 0) {
        const msgLines = messages.slice(0, 20).map((m: any) => formatMessage(m));
        details.push(`\nMessages (${messages.length} total, showing up to 20):\n${msgLines.join('\n')}`);
      }

      return {
        content: details.join('\n'),
        metadata: {
          conversationId: convo.id,
          status: convo.status,
          messageCount: messages.length,
        },
      };
    } catch (err) {
      return driftError(err);
    }
  },
};

// ─── Tool: drift_create_contact ─────────────────────────

const createContact: ToolHandler = {
  description:
    'Create a new contact in Drift. Provide at least an email address.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Contact email address',
      },
      name: {
        type: 'string',
        description: 'Contact full name',
      },
      phone: {
        type: 'string',
        description: 'Phone number',
      },
      company: {
        type: 'string',
        description: 'Company name',
      },
      custom_attributes: {
        type: 'object',
        description: 'Custom attributes as key-value pairs',
      },
    },
    required: ['email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const attributes: Record<string, any> = {
        email: params.email,
      };
      if (params.name) attributes.name = params.name;
      if (params.phone) attributes.phone = params.phone;
      if (params.company) attributes.company = params.company;
      if (params.custom_attributes) {
        Object.assign(attributes, params.custom_attributes);
      }

      const result = await ctx.apiExecutor.post('/contacts', { attributes });

      const contact = result.data || result;
      return {
        content: `Contact created: ${formatContact(contact)}`,
        metadata: {
          contactId: contact.id,
          email: params.email,
        },
      };
    } catch (err) {
      return driftError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const driftAdapter: SkillAdapter = {
  skillId: 'drift',
  name: 'Drift Conversational Marketing',
  baseUrl: 'https://driftapi.com',
  auth: {
    type: 'oauth2',
    provider: 'drift',
  },
  tools: {
    drift_list_conversations: listConversations,
    drift_send_message: sendMessage,
    drift_list_contacts: listContacts,
    drift_get_conversation: getConversation,
    drift_create_contact: createContact,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
