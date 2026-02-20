/**
 * MCP Skill Adapter — Front
 *
 * Maps Front REST API endpoints to MCP tool handlers.
 * Front is a shared inbox / customer communication platform.
 *
 * Front API docs: https://dev.frontapp.com/reference/introduction
 *
 * Tools:
 *   - front_list_conversations     List conversations with optional filters
 *   - front_send_reply             Send a reply to a conversation
 *   - front_list_inboxes           List inboxes
 *   - front_assign_conversation    Assign a conversation to a teammate
 *   - front_tag_conversation       Add or remove tags on a conversation
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function frontError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors = data._error;
      if (errors && typeof errors === 'object') {
        return { content: `Front API error [${errors.status || ''}]: ${errors.title || ''} -- ${errors.message || err.message}`, isError: true };
      }
      return { content: `Front API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Front API error: ${err.message}`, isError: true };
  }
  return { content: `Front API error: ${String(err)}`, isError: true };
}

/** Format a Front conversation for display */
function formatConversation(convo: any): string {
  const id = convo.id || 'unknown';
  const subject = convo.subject || '(no subject)';
  const status = convo.status || 'unknown';
  const assignee = convo.assignee?.email || 'unassigned';
  const inboxes = (convo.inboxes || []).map((i: any) => i.name || i.id).join(', ') || 'N/A';
  const lastMessage = convo.last_message?.created_at
    ? new Date(convo.last_message.created_at * 1000).toISOString().slice(0, 16)
    : '';
  const tags = (convo.tags || []).map((t: any) => t.name).join(', ');
  const tagStr = tags ? ` -- tags: [${tags}]` : '';
  return `"${subject}" (${id}) -- ${status} -- assignee: ${assignee} -- inbox: ${inboxes} -- ${lastMessage}${tagStr}`;
}

/** Format a Front inbox for display */
function formatInbox(inbox: any): string {
  const name = inbox.name || '(unnamed)';
  const type = inbox.type || 'unknown';
  const address = inbox.address || 'N/A';
  return `${name} (ID: ${inbox.id}) -- type: ${type} -- address: ${address}`;
}

// ─── Tool: front_list_conversations ─────────────────────

const listConversations: ToolHandler = {
  description:
    'List conversations from Front. Returns subjects, statuses, assignees, and tags.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max conversations to return (default 25, max 100)',
      },
      page_token: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
      q: {
        type: 'string',
        description: 'Search query to filter conversations',
      },
      status: {
        type: 'string',
        enum: ['open', 'archived', 'deleted', 'spam'],
        description: 'Filter by conversation status',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.page_token) query.page_token = params.page_token;
      if (params.q) query.q = params.q;

      // Use search endpoint if query is provided
      let result: any;
      if (params.q) {
        result = await ctx.apiExecutor.get('/conversations/search/' + encodeURIComponent(params.q), query);
      } else {
        result = await ctx.apiExecutor.get('/conversations', query);
      }

      const conversations: any[] = result._results || result.data || [];
      if (conversations.length === 0) {
        return { content: 'No conversations found.', metadata: { conversationCount: 0 } };
      }

      // Filter by status client-side if needed
      let filtered = conversations;
      if (params.status) {
        filtered = conversations.filter((c: any) => c.status === params.status);
      }

      if (filtered.length === 0) {
        return { content: `No conversations found with status "${params.status}".`, metadata: { conversationCount: 0 } };
      }

      const lines = filtered.map((c: any) => formatConversation(c));
      const nextToken = result._pagination?.next;
      return {
        content: `${filtered.length} conversation(s):\n${lines.join('\n')}${nextToken ? `\n\n(More available, page_token: ${nextToken})` : ''}`,
        metadata: { conversationCount: filtered.length, nextToken },
      };
    } catch (err) {
      return frontError(err);
    }
  },
};

// ─── Tool: front_send_reply ─────────────────────────────

const sendReply: ToolHandler = {
  description:
    'Send a reply to a Front conversation. The reply is sent as an email from the assigned inbox.',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        description: 'The conversation ID to reply to',
      },
      body: {
        type: 'string',
        description: 'Reply body (HTML supported)',
      },
      author_id: {
        type: 'string',
        description: 'Teammate ID sending the reply (uses "alt:email:" prefix for email-based lookup)',
      },
      channel_id: {
        type: 'string',
        description: 'Channel ID to send the reply from (optional, defaults to the conversation channel)',
      },
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'Override recipient email addresses',
      },
    },
    required: ['conversation_id', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        body: params.body,
      };
      if (params.author_id) body.author_id = params.author_id;
      if (params.channel_id) body.channel_id = params.channel_id;
      if (params.to?.length) body.to = params.to;

      await ctx.apiExecutor.post(
        `/conversations/${params.conversation_id}/messages`,
        body,
      );

      return {
        content: `Reply sent to conversation ${params.conversation_id}`,
        metadata: {
          conversationId: params.conversation_id,
        },
      };
    } catch (err) {
      return frontError(err);
    }
  },
};

// ─── Tool: front_list_inboxes ───────────────────────────

const listInboxes: ToolHandler = {
  description:
    'List inboxes from Front. Returns inbox names, types, and addresses.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/inboxes');

      const inboxes: any[] = result._results || result.data || [];
      if (inboxes.length === 0) {
        return { content: 'No inboxes found.', metadata: { inboxCount: 0 } };
      }

      const lines = inboxes.map((i: any) => formatInbox(i));
      return {
        content: `${inboxes.length} inbox(es):\n${lines.join('\n')}`,
        metadata: { inboxCount: inboxes.length },
      };
    } catch (err) {
      return frontError(err);
    }
  },
};

// ─── Tool: front_assign_conversation ────────────────────

const assignConversation: ToolHandler = {
  description:
    'Assign a Front conversation to a specific teammate. Can also unassign by omitting assignee_id.',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        description: 'The conversation ID to assign',
      },
      assignee_id: {
        type: 'string',
        description: 'Teammate ID to assign to (omit to unassign)',
      },
    },
    required: ['conversation_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        assignee_id: params.assignee_id || '',
      };

      await ctx.apiExecutor.patch(
        `/conversations/${params.conversation_id}/assignee`,
        body,
      );

      const action = params.assignee_id ? `assigned to ${params.assignee_id}` : 'unassigned';
      return {
        content: `Conversation ${params.conversation_id} ${action}`,
        metadata: {
          conversationId: params.conversation_id,
          assigneeId: params.assignee_id || null,
        },
      };
    } catch (err) {
      return frontError(err);
    }
  },
};

// ─── Tool: front_tag_conversation ───────────────────────

const tagConversation: ToolHandler = {
  description:
    'Add or remove tags on a Front conversation.',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        description: 'The conversation ID to tag',
      },
      tag_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tag IDs to add to the conversation',
      },
      untag_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tag IDs to remove from the conversation',
      },
    },
    required: ['conversation_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      // Add tags
      if (params.tag_ids?.length) {
        for (const tagId of params.tag_ids) {
          await ctx.apiExecutor.post(
            `/conversations/${params.conversation_id}/tags`,
            { tag_ids: [tagId] },
          );
        }
      }

      // Remove tags
      if (params.untag_ids?.length) {
        for (const tagId of params.untag_ids) {
          await ctx.apiExecutor.delete(
            `/conversations/${params.conversation_id}/tags`,
            { tag_ids: tagId },
          );
        }
      }

      const added = params.tag_ids?.length || 0;
      const removed = params.untag_ids?.length || 0;
      return {
        content: `Conversation ${params.conversation_id} tags updated: ${added} added, ${removed} removed`,
        metadata: {
          conversationId: params.conversation_id,
          tagsAdded: added,
          tagsRemoved: removed,
        },
      };
    } catch (err) {
      return frontError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const frontAdapter: SkillAdapter = {
  skillId: 'front',
  name: 'Front',
  baseUrl: 'https://api2.frontapp.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  tools: {
    front_list_conversations: listConversations,
    front_send_reply: sendReply,
    front_list_inboxes: listInboxes,
    front_assign_conversation: assignConversation,
    front_tag_conversation: tagConversation,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
