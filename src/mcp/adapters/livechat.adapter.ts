/**
 * MCP Skill Adapter — LiveChat
 *
 * Maps LiveChat API v3.5 endpoints to MCP tool handlers.
 * Supports chat listing, event sending, agent management, and chat retrieval.
 *
 * LiveChat API docs: https://developers.livechat.com/docs/messaging/agent-chat-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function livechatError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.error?.message || data.error?.type || err.message;
      return { content: `LiveChat API error: ${detail}`, isError: true };
    }
    return { content: `LiveChat API error: ${err.message}`, isError: true };
  }
  return { content: `LiveChat API error: ${String(err)}`, isError: true };
}

// ─── Tool: livechat_list_chats ──────────────────────────

const listChats: ToolHandler = {
  description:
    'List active and recent chats from LiveChat. Returns chat summaries with visitor names and last messages.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of chats to return (default 20)',
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order by date (default: "desc")',
      },
      filters: {
        type: 'object',
        description: 'Optional filters object (e.g. { "agent_ids": ["agent@example.com"] })',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        limit: params.limit ?? 20,
        sort_order: params.sort_order || 'desc',
      };
      if (params.filters) body.filters = params.filters;

      const result = await ctx.apiExecutor.post('/agent/action/list_chats', body);

      const chats: any[] = result.chats_summary || result.chats || [];
      if (chats.length === 0) {
        return { content: 'No chats found.' };
      }

      const lines = chats.map((chat: any) => {
        const id = chat.id || 'unknown';
        const visitor = chat.users?.find((u: any) => u.type === 'customer');
        const visitorName = visitor?.name || visitor?.email || 'Unknown visitor';
        const lastEvent = chat.last_event_per_type?.message?.text?.slice(0, 80) || 'No recent message';
        const agentCount = chat.users?.filter((u: any) => u.type === 'agent').length || 0;
        return `${visitorName} — ${lastEvent} — ${agentCount} agent(s) — ID: ${id}`;
      });

      return {
        content: `Found ${chats.length} chats:\n${lines.join('\n')}`,
        metadata: { count: chats.length },
      };
    } catch (err) {
      return livechatError(err);
    }
  },
};

// ─── Tool: livechat_send_event ──────────────────────────

const sendEvent: ToolHandler = {
  description:
    'Send a message event to an active LiveChat conversation. The agent must be assigned to the chat.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: 'The ID of the chat to send the message to',
      },
      text: {
        type: 'string',
        description: 'The message text to send',
      },
      type: {
        type: 'string',
        enum: ['message', 'system_message'],
        description: 'Event type (default: "message")',
      },
    },
    required: ['chat_id', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        chat_id: params.chat_id,
        event: {
          type: params.type || 'message',
          text: params.text,
        },
      };

      const result = await ctx.apiExecutor.post('/agent/action/send_event', body);

      const eventId = result.event_id || 'unknown';
      return {
        content: `Message sent to chat ${params.chat_id} (event ID: ${eventId})`,
        metadata: { eventId, chatId: params.chat_id },
      };
    } catch (err) {
      return livechatError(err);
    }
  },
};

// ─── Tool: livechat_list_agents ─────────────────────────

const listAgents: ToolHandler = {
  description:
    'List agents in the LiveChat account. Returns agent names, emails, and current availability status.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of agents to return (default 25)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.limit) body.limit = params.limit;

      const result = await ctx.apiExecutor.post('/agent/action/list_routing_statuses', body);

      const agents: any[] = result || [];
      if (agents.length === 0) {
        return { content: 'No agents found.' };
      }

      const lines = agents.map((agent: any) => {
        const status = agent.status || 'unknown';
        const id = agent.agent_id || 'unknown';
        return `${id} — Status: ${status}`;
      });

      return {
        content: `Found ${agents.length} agents:\n${lines.join('\n')}`,
        metadata: { count: agents.length },
      };
    } catch (err) {
      return livechatError(err);
    }
  },
};

// ─── Tool: livechat_get_chat ────────────────────────────

const getChat: ToolHandler = {
  description:
    'Get full details of a specific LiveChat conversation including all messages and participants.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: 'The ID of the chat to retrieve',
      },
      thread_id: {
        type: 'string',
        description: 'Specific thread ID within the chat (optional, returns latest thread if omitted)',
      },
    },
    required: ['chat_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        chat_id: params.chat_id,
      };
      if (params.thread_id) body.thread_id = params.thread_id;

      const result = await ctx.apiExecutor.post('/agent/action/get_chat', body);

      const users = result.users || [];
      const thread = result.thread || result.threads?.[0];
      const events: any[] = thread?.events || [];

      const participantLines = users.map((u: any) => {
        return `  ${u.name || u.email || u.id} (${u.type || 'unknown'})`;
      });

      const messageSummary = events
        .filter((e: any) => e.type === 'message')
        .slice(-5)
        .map((e: any) => {
          const author = e.author_id || 'unknown';
          const text = (e.text || '').slice(0, 120);
          return `  [${author}]: ${text}`;
        });

      return {
        content: [
          `Chat: ${params.chat_id}`,
          `Participants:`,
          ...participantLines,
          `Total events: ${events.length}`,
          `Last messages:`,
          ...messageSummary,
        ].join('\n'),
        metadata: {
          chatId: params.chat_id,
          userCount: users.length,
          eventCount: events.length,
        },
      };
    } catch (err) {
      return livechatError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const livechatAdapter: SkillAdapter = {
  skillId: 'livechat',
  name: 'LiveChat',
  baseUrl: 'https://api.livechatinc.com/v3.5',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    livechat_list_chats: listChats,
    livechat_send_event: sendEvent,
    livechat_list_agents: listAgents,
    livechat_get_chat: getChat,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
