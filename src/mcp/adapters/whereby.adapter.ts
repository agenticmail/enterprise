/**
 * MCP Skill Adapter — Whereby
 *
 * Maps Whereby REST API v1 endpoints to MCP tool handlers.
 * Supports creating, retrieving, listing, and deleting video meeting rooms.
 *
 * Whereby API docs: https://whereby.dev/http-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function wherebyError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.error || err.message;
      return { content: `Whereby API error: ${detail}`, isError: true };
    }
    return { content: `Whereby API error: ${err.message}`, isError: true };
  }
  return { content: `Whereby API error: ${String(err)}`, isError: true };
}

// ─── Tool: whereby_create_meeting ───────────────────────

const createMeeting: ToolHandler = {
  description:
    'Create a new Whereby video meeting room. Specify an end date and optional room settings.',
  inputSchema: {
    type: 'object',
    properties: {
      endDate: {
        type: 'string',
        description: 'When the meeting room expires in ISO 8601 format (e.g. "2024-12-01T23:59:59Z")',
      },
      roomNamePrefix: {
        type: 'string',
        description: 'Custom prefix for the room name (optional)',
      },
      roomMode: {
        type: 'string',
        enum: ['normal', 'group'],
        description: 'Room mode: "normal" (up to 4) or "group" (up to 200) participants (default: "normal")',
      },
      isLocked: {
        type: 'boolean',
        description: 'Whether the room requires a knock to enter (default: false)',
      },
      fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional fields to include in the response (e.g. ["hostRoomUrl"])',
      },
    },
    required: ['endDate'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        endDate: params.endDate,
      };
      if (params.roomNamePrefix) body.roomNamePrefix = params.roomNamePrefix;
      if (params.roomMode) body.roomMode = params.roomMode;
      if (params.isLocked !== undefined) body.isLocked = params.isLocked;
      if (params.fields?.length) body.fields = params.fields;

      const result = await ctx.apiExecutor.post('/meetings', body);

      const locked = result.isLocked ? ' (locked)' : '';
      return {
        content: [
          `Meeting room created${locked}`,
          `Meeting ID: ${result.meetingId}`,
          `Room URL: ${result.roomUrl || 'N/A'}`,
          `Host URL: ${result.hostRoomUrl || 'N/A'}`,
          `Mode: ${result.roomMode || 'normal'}`,
          `Expires: ${result.endDate}`,
        ].join('\n'),
        metadata: {
          meetingId: result.meetingId,
          roomUrl: result.roomUrl,
          hostRoomUrl: result.hostRoomUrl,
          endDate: result.endDate,
        },
      };
    } catch (err) {
      return wherebyError(err);
    }
  },
};

// ─── Tool: whereby_get_meeting ──────────────────────────

const getMeeting: ToolHandler = {
  description:
    'Get details of a specific Whereby meeting room by its meeting ID.',
  inputSchema: {
    type: 'object',
    properties: {
      meeting_id: {
        type: 'string',
        description: 'The unique meeting ID to retrieve',
      },
    },
    required: ['meeting_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/meetings/${params.meeting_id}`);

      return {
        content: [
          `Meeting ID: ${result.meetingId}`,
          `Room URL: ${result.roomUrl || 'N/A'}`,
          `Host URL: ${result.hostRoomUrl || 'N/A'}`,
          `Mode: ${result.roomMode || 'normal'}`,
          `Locked: ${result.isLocked ? 'Yes' : 'No'}`,
          `Start: ${result.startDate || 'N/A'}`,
          `End: ${result.endDate || 'N/A'}`,
          `Created: ${result.createdAt || 'N/A'}`,
        ].join('\n'),
        metadata: {
          meetingId: result.meetingId,
          roomUrl: result.roomUrl,
          roomMode: result.roomMode,
          endDate: result.endDate,
        },
      };
    } catch (err) {
      return wherebyError(err);
    }
  },
};

// ─── Tool: whereby_delete_meeting ───────────────────────

const deleteMeeting: ToolHandler = {
  description:
    'Delete a Whereby meeting room by its meeting ID. The room URL will no longer be accessible.',
  inputSchema: {
    type: 'object',
    properties: {
      meeting_id: {
        type: 'string',
        description: 'The unique meeting ID to delete',
      },
    },
    required: ['meeting_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      await ctx.apiExecutor.delete(`/meetings/${params.meeting_id}`);

      return {
        content: `Meeting ${params.meeting_id} has been deleted. The room URL is no longer accessible.`,
        metadata: { meetingId: params.meeting_id, deleted: true },
      };
    } catch (err) {
      return wherebyError(err);
    }
  },
};

// ─── Tool: whereby_list_meetings ────────────────────────

const listMeetings: ToolHandler = {
  description:
    'List all active Whereby meeting rooms. Returns room URLs, modes, and expiration dates.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of meetings to return (default 20)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor for the next page of results (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get('/meetings', query);

      const meetings: any[] = result.results || result.data || [];
      if (meetings.length === 0) {
        return { content: 'No active meeting rooms found.' };
      }

      const lines = meetings.map((m: any) => {
        const mode = m.roomMode || 'normal';
        const locked = m.isLocked ? ' (locked)' : '';
        const endDate = m.endDate ? m.endDate.slice(0, 16) : 'N/A';
        return `${m.roomUrl || 'N/A'}${locked} — ${mode} mode — Expires: ${endDate} — ID: ${m.meetingId}`;
      });

      const nextCursor = result.nextCursor || result.pagination?.cursor;
      const paginationNote = nextCursor ? `\n(Next cursor: ${nextCursor})` : '';

      return {
        content: `Found ${meetings.length} meeting rooms:\n${lines.join('\n')}${paginationNote}`,
        metadata: { count: meetings.length, nextCursor },
      };
    } catch (err) {
      return wherebyError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const wherebyAdapter: SkillAdapter = {
  skillId: 'whereby',
  name: 'Whereby',
  baseUrl: 'https://api.whereby.dev/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    whereby_create_meeting: createMeeting,
    whereby_get_meeting: getMeeting,
    whereby_delete_meeting: deleteMeeting,
    whereby_list_meetings: listMeetings,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
