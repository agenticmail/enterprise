/**
 * MCP Skill Adapter — Crisp Chat
 *
 * Maps Crisp REST API v1 endpoints to MCP tool handlers.
 * Crisp uses identifier + key pair authentication via Basic auth.
 *
 * The website ID is read from ctx.skillConfig.websiteId.
 *
 * Crisp API docs: https://docs.crisp.chat/references/rest-api/v1/
 *
 * Tools:
 *   - crisp_list_conversations      List conversations
 *   - crisp_send_message            Send a message in a conversation
 *   - crisp_get_conversation        Get details of a conversation
 *   - crisp_list_people             List people / contacts
 *   - crisp_update_conversation     Update conversation state or meta
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the website ID from skill config */
function websiteId(ctx: ToolExecutionContext): string {
  const id = ctx.skillConfig.websiteId;
  if (!id) {
    throw new Error('Crisp website ID is required in skillConfig (e.g. { websiteId: "abc-def-123" })');
  }
  return id;
}

function crispError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const reason = data.reason || '';
      const message = data.message || err.message;
      return { content: `Crisp API error [${reason}]: ${message}`, isError: true };
    }
    return { content: `Crisp API error: ${err.message}`, isError: true };
  }
  return { content: `Crisp API error: ${String(err)}`, isError: true };
}

/** Format a Crisp conversation for display */
function formatConversation(convo: any): string {
  const sessionId = convo.session_id || 'unknown';
  const state = convo.state || 'unknown';
  const status = convo.availability || '';
  const nickname = convo.meta?.nickname || convo.meta?.email || '(anonymous)';
  const lastMessage = convo.last_message || '(no messages)';
  const unread = convo.unread?.operator ?? 0;
  const created = convo.created_at
    ? new Date(convo.created_at).toISOString().slice(0, 16)
    : '';
  return `[${sessionId}] ${nickname} -- ${state}${status ? '/' + status : ''} -- unread: ${unread} -- last: "${typeof lastMessage === 'string' ? lastMessage.slice(0, 60) : '...'}" -- ${created}`;
}

/** Format a Crisp person / contact for display */
function formatPerson(person: any): string {
  const nickname = person.nickname || '(no name)';
  const email = person.email || '(no email)';
  const peopleId = person.people_id || 'unknown';
  const segments = (person.segments || []).join(', ');
  const segStr = segments ? ` -- segments: [${segments}]` : '';
  return `${nickname} <${email}> (ID: ${peopleId})${segStr}`;
}

// ─── Tool: crisp_list_conversations ─────────────────────

const listConversations: ToolHandler = {
  description:
    'List conversations from Crisp. Returns session IDs, visitor info, states, and last messages.',
  inputSchema: {
    type: 'object',
    properties: {
      page_number: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      search_query: {
        type: 'string',
        description: 'Search query to filter conversations',
      },
      search_type: {
        type: 'string',
        enum: ['text', 'segment'],
        description: 'Type of search (default: "text")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const wid = websiteId(ctx);
      const query: Record<string, string> = {
        page_number: String(params.page_number ?? 1),
      };
      if (params.search_query) query.search_query = params.search_query;
      if (params.search_type) query.search_type = params.search_type;

      const result = await ctx.apiExecutor.get(`/website/${wid}/conversations`, query);

      const conversations: any[] = result.data || [];
      if (conversations.length === 0) {
        return { content: 'No conversations found.', metadata: { conversationCount: 0 } };
      }

      const lines = conversations.map((c: any) => formatConversation(c));
      return {
        content: `${conversations.length} conversation(s):\n${lines.join('\n')}`,
        metadata: { conversationCount: conversations.length },
      };
    } catch (err) {
      return crispError(err);
    }
  },
};

// ─── Tool: crisp_send_message ───────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a message in a Crisp conversation. Can send text or a note (internal message).',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The conversation session ID to send the message in',
      },
      content: {
        type: 'string',
        description: 'Message content (text)',
      },
      type: {
        type: 'string',
        enum: ['text', 'note', 'file', 'animation'],
        description: 'Message type (default: "text")',
      },
      from: {
        type: 'string',
        enum: ['operator', 'user'],
        description: 'Who is sending the message (default: "operator")',
      },
    },
    required: ['session_id', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const wid = websiteId(ctx);
      const body: Record<string, any> = {
        type: params.type || 'text',
        content: params.content,
        from: params.from || 'operator',
        origin: 'chat',
      };

      const result = await ctx.apiExecutor.post(
        `/website/${wid}/conversation/${params.session_id}/message`,
        body,
      );

      const msgType = params.type || 'text';
      return {
        content: `${msgType === 'note' ? 'Note' : 'Message'} sent to conversation ${params.session_id}`,
        metadata: {
          sessionId: params.session_id,
          fingerprint: result.data?.fingerprint,
          type: msgType,
        },
      };
    } catch (err) {
      return crispError(err);
    }
  },
};

// ─── Tool: crisp_get_conversation ───────────────────────

const getConversation: ToolHandler = {
  description:
    'Get details of a specific Crisp conversation by session ID. Returns visitor info, state, and message history.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The conversation session ID',
      },
    },
    required: ['session_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const wid = websiteId(ctx);

      // Get conversation metadata
      const meta = await ctx.apiExecutor.get(
        `/website/${wid}/conversation/${params.session_id}/meta`,
      );

      // Get recent messages
      const messages = await ctx.apiExecutor.get(
        `/website/${wid}/conversation/${params.session_id}/messages`,
      );

      const metaData = meta.data || meta;
      const nickname = metaData.nickname || '(anonymous)';
      const email = metaData.email || '(no email)';
      const state = metaData.state || 'unknown';
      const segments = (metaData.segments || []).join(', ');

      const msgList: any[] = (messages.data || []).slice(-10);
      const messageLines = msgList.map((m: any) => {
        const from = m.from || 'unknown';
        const content = typeof m.content === 'string' ? m.content.slice(0, 100) : '(non-text)';
        const ts = m.timestamp ? new Date(m.timestamp).toISOString().slice(11, 16) : '';
        return `  [${ts}] ${from}: ${content}`;
      });

      const content = [
        `Conversation: ${params.session_id}`,
        `Visitor: ${nickname} <${email}>`,
        `State: ${state}`,
        segments ? `Segments: ${segments}` : null,
        messageLines.length > 0 ? `\nRecent messages (last ${messageLines.length}):\n${messageLines.join('\n')}` : '\nNo messages yet.',
      ].filter(Boolean).join('\n');

      return {
        content,
        metadata: {
          sessionId: params.session_id,
          nickname,
          email,
          state,
          messageCount: msgList.length,
        },
      };
    } catch (err) {
      return crispError(err);
    }
  },
};

// ─── Tool: crisp_list_people ────────────────────────────

const listPeople: ToolHandler = {
  description:
    'List people (contacts) from Crisp. Optionally search by name or email.',
  inputSchema: {
    type: 'object',
    properties: {
      page_number: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      search_field: {
        type: 'string',
        enum: ['email', 'nickname'],
        description: 'Field to search by',
      },
      search_query: {
        type: 'string',
        description: 'Search query value',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const wid = websiteId(ctx);
      const query: Record<string, string> = {
        page_number: String(params.page_number ?? 1),
      };
      if (params.search_field) query.search_field = params.search_field;
      if (params.search_query) query.search_query = params.search_query;

      const result = await ctx.apiExecutor.get(`/website/${wid}/people/profiles`, query);

      const people: any[] = result.data || [];
      if (people.length === 0) {
        return { content: 'No people found.', metadata: { peopleCount: 0 } };
      }

      const lines = people.map((p: any) => formatPerson(p));
      return {
        content: `${people.length} contact(s):\n${lines.join('\n')}`,
        metadata: { peopleCount: people.length },
      };
    } catch (err) {
      return crispError(err);
    }
  },
};

// ─── Tool: crisp_update_conversation ────────────────────

const updateConversation: ToolHandler = {
  description:
    'Update a Crisp conversation state or metadata. Can change state to resolved, pending, or unresolved.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The conversation session ID to update',
      },
      state: {
        type: 'string',
        enum: ['pending', 'unresolved', 'resolved'],
        description: 'New conversation state',
      },
      nickname: {
        type: 'string',
        description: 'Update the visitor nickname',
      },
      email: {
        type: 'string',
        description: 'Update the visitor email',
      },
      segments: {
        type: 'array',
        items: { type: 'string' },
        description: 'Update the conversation segments (tags)',
      },
    },
    required: ['session_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const wid = websiteId(ctx);
      const updates: string[] = [];

      // Update state if provided
      if (params.state) {
        await ctx.apiExecutor.patch(
          `/website/${wid}/conversation/${params.session_id}/state`,
          { state: params.state },
        );
        updates.push(`state -> ${params.state}`);
      }

      // Update meta if any meta fields are provided
      const metaBody: Record<string, any> = {};
      if (params.nickname) metaBody.nickname = params.nickname;
      if (params.email) metaBody.email = params.email;
      if (params.segments) metaBody.segments = params.segments;

      if (Object.keys(metaBody).length > 0) {
        await ctx.apiExecutor.patch(
          `/website/${wid}/conversation/${params.session_id}/meta`,
          metaBody,
        );
        updates.push(...Object.keys(metaBody).map(k => `${k} updated`));
      }

      if (updates.length === 0) {
        return {
          content: 'No updates specified for the conversation.',
          isError: true,
        };
      }

      return {
        content: `Conversation ${params.session_id} updated: ${updates.join(', ')}`,
        metadata: {
          sessionId: params.session_id,
          updates,
        },
      };
    } catch (err) {
      return crispError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const crispAdapter: SkillAdapter = {
  skillId: 'crisp',
  name: 'Crisp Chat',
  baseUrl: 'https://api.crisp.chat/v1',
  auth: {
    type: 'credentials',
    fields: ['identifier', 'key'],
  },
  tools: {
    crisp_list_conversations: listConversations,
    crisp_send_message: sendMessage,
    crisp_get_conversation: getConversation,
    crisp_list_people: listPeople,
    crisp_update_conversation: updateConversation,
  },
  configSchema: {
    websiteId: {
      type: 'string' as const,
      label: 'Website ID',
      description: 'Your Crisp website ID (found in your Crisp dashboard settings)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
