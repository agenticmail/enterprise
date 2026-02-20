/**
 * MCP Skill Adapter — Cisco Webex
 *
 * Maps Webex REST API endpoints to MCP tool handlers.
 * Supports messaging, room management, and people lookup.
 *
 * Webex API docs: https://developer.webex.com/docs/api/getting-started
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function webexError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.errors?.[0]?.description || err.message;
      return { content: `Webex API error: ${detail}`, isError: true };
    }
    return { content: `Webex API error: ${err.message}`, isError: true };
  }
  return { content: `Webex API error: ${String(err)}`, isError: true };
}

// ─── Tool: webex_send_message ───────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a message to a Webex room (space). Provide the room ID and message text. Supports Markdown formatting.',
  inputSchema: {
    type: 'object',
    properties: {
      roomId: {
        type: 'string',
        description: 'The ID of the room (space) to send the message to',
      },
      text: {
        type: 'string',
        description: 'Plain text message content',
      },
      markdown: {
        type: 'string',
        description: 'Markdown-formatted message content (optional, overrides plain text display)',
      },
    },
    required: ['roomId', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        roomId: params.roomId,
        text: params.text,
      };
      if (params.markdown) body.markdown = params.markdown;

      const result = await ctx.apiExecutor.post('/messages', body);

      return {
        content: `Message sent to room ${params.roomId} (message ID: ${result.id})`,
        metadata: { messageId: result.id, roomId: params.roomId },
      };
    } catch (err) {
      return webexError(err);
    }
  },
};

// ─── Tool: webex_list_rooms ─────────────────────────────

const listRooms: ToolHandler = {
  description:
    'List Webex rooms (spaces) the authenticated user belongs to. Returns room names, IDs, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['direct', 'group'],
        description: 'Filter by room type: "direct" for 1:1, "group" for group spaces (optional)',
      },
      max: {
        type: 'number',
        description: 'Maximum number of rooms to return (default 50)',
      },
      sortBy: {
        type: 'string',
        enum: ['id', 'lastactivity', 'created'],
        description: 'Sort order (default: "lastactivity")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        max: String(params.max ?? 50),
      };
      if (params.type) query.type = params.type;
      if (params.sortBy) query.sortBy = params.sortBy;

      const result = await ctx.apiExecutor.get('/rooms', query);

      const rooms: any[] = result.items || [];
      if (rooms.length === 0) {
        return { content: 'No rooms found.' };
      }

      const lines = rooms.map((r: any) => {
        const type = r.type || 'unknown';
        const lastActivity = r.lastActivity ? r.lastActivity.slice(0, 16) : 'N/A';
        return `${r.title} (${type}) — ID: ${r.id} — Last activity: ${lastActivity}`;
      });

      return {
        content: `Found ${rooms.length} rooms:\n${lines.join('\n')}`,
        metadata: { count: rooms.length },
      };
    } catch (err) {
      return webexError(err);
    }
  },
};

// ─── Tool: webex_create_room ────────────────────────────

const createRoom: ToolHandler = {
  description:
    'Create a new Webex room (space). Provide a title for the room.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The name of the new room',
      },
      isLocked: {
        type: 'boolean',
        description: 'Whether the room should be moderated (optional)',
      },
    },
    required: ['title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        title: params.title,
      };
      if (params.isLocked !== undefined) body.isLocked = params.isLocked;

      const result = await ctx.apiExecutor.post('/rooms', body);

      const locked = result.isLocked ? ' (moderated)' : '';
      return {
        content: `Room "${result.title}" created${locked} (ID: ${result.id})`,
        metadata: { roomId: result.id, title: result.title },
      };
    } catch (err) {
      return webexError(err);
    }
  },
};

// ─── Tool: webex_list_people ────────────────────────────

const listPeople: ToolHandler = {
  description:
    'Search for people in the Webex organization. Filter by email, display name, or organization ID.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Filter by exact email address',
      },
      displayName: {
        type: 'string',
        description: 'Filter by display name (partial match)',
      },
      max: {
        type: 'number',
        description: 'Maximum number of results to return (default 25)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        max: String(params.max ?? 25),
      };
      if (params.email) query.email = params.email;
      if (params.displayName) query.displayName = params.displayName;

      const result = await ctx.apiExecutor.get('/people', query);

      const people: any[] = result.items || [];
      if (people.length === 0) {
        return { content: 'No people found matching the criteria.' };
      }

      const lines = people.map((p: any) => {
        const emails = (p.emails || []).join(', ');
        const status = p.status || 'unknown';
        return `${p.displayName} (${status}) — ${emails}`;
      });

      return {
        content: `Found ${people.length} people:\n${lines.join('\n')}`,
        metadata: { count: people.length },
      };
    } catch (err) {
      return webexError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const webexAdapter: SkillAdapter = {
  skillId: 'webex',
  name: 'Webex',
  baseUrl: 'https://webexapis.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'webex',
  },
  tools: {
    webex_send_message: sendMessage,
    webex_list_rooms: listRooms,
    webex_create_room: createRoom,
    webex_list_people: listPeople,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 15 },
};
