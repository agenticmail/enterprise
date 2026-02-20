/**
 * MCP Skill Adapter — Zoom
 *
 * Maps Zoom REST API v2 endpoints to MCP tool handlers.
 * Uses OAuth2 for authentication via the Zoom provider.
 *
 * Zoom API docs: https://developers.zoom.us/docs/api/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function zoomError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code ? ` (code ${data.code})` : '';
      return { content: `Zoom API error: ${data.message || err.message}${code}`, isError: true };
    }
    return { content: `Zoom API error: ${err.message}`, isError: true };
  }
  return { content: `Zoom API error: ${String(err)}`, isError: true };
}

/** Format a Zoom meeting for display */
function formatMeeting(m: any): string {
  const topic = m.topic || 'Untitled';
  const startTime = m.start_time || 'unscheduled';
  const duration = m.duration ? `${m.duration} min` : 'N/A';
  const joinUrl = m.join_url || '';
  const status = m.status || 'unknown';
  return `${topic} (ID: ${m.id}) -- ${startTime}, ${duration}, status: ${status}${joinUrl ? `\n  Join: ${joinUrl}` : ''}`;
}

// ─── Tool: zoom_create_meeting ──────────────────────────

const createMeeting: ToolHandler = {
  description:
    'Create a new Zoom meeting. Specify the topic, start time, duration, and optional settings like password and waiting room.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Meeting topic / title',
      },
      start_time: {
        type: 'string',
        description: 'Meeting start time in ISO 8601 format (e.g. "2025-01-15T10:00:00Z"). Omit for instant meeting.',
      },
      duration: {
        type: 'number',
        description: 'Meeting duration in minutes (default 60)',
      },
      timezone: {
        type: 'string',
        description: 'Timezone (e.g. "America/New_York"). Defaults to the host timezone.',
      },
      type: {
        type: 'number',
        enum: [1, 2, 3, 8],
        description: 'Meeting type: 1=instant, 2=scheduled (default), 3=recurring no fixed time, 8=recurring fixed time',
      },
      password: {
        type: 'string',
        description: 'Meeting passcode (optional)',
      },
      waiting_room: {
        type: 'boolean',
        description: 'Enable waiting room (optional)',
      },
    },
    required: ['topic'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        topic: params.topic,
        type: params.type ?? 2,
        duration: params.duration ?? 60,
      };
      if (params.start_time) body.start_time = params.start_time;
      if (params.timezone) body.timezone = params.timezone;

      const settings: Record<string, any> = {};
      if (params.password) settings.passcode = params.password;
      if (params.waiting_room !== undefined) settings.waiting_room = params.waiting_room;
      if (Object.keys(settings).length > 0) body.settings = settings;

      const result = await ctx.apiExecutor.post('/users/me/meetings', body);

      return {
        content: [
          `Meeting created: ${result.topic}`,
          `ID: ${result.id}`,
          `Start: ${result.start_time || 'instant'}`,
          `Duration: ${result.duration} min`,
          `Join URL: ${result.join_url}`,
          `Host URL: ${result.start_url}`,
        ].join('\n'),
        metadata: {
          meetingId: result.id,
          topic: result.topic,
          joinUrl: result.join_url,
          startUrl: result.start_url,
          startTime: result.start_time,
        },
      };
    } catch (err) {
      return zoomError(err);
    }
  },
};

// ─── Tool: zoom_list_meetings ───────────────────────────

const listMeetings: ToolHandler = {
  description:
    'List meetings for the authenticated Zoom user. Filter by type (scheduled, live, upcoming).',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['scheduled', 'live', 'upcoming', 'upcoming_meetings', 'previous_meetings'],
        description: 'Type of meetings to list (default: "scheduled")',
      },
      page_size: {
        type: 'number',
        description: 'Number of meetings per page (default 30, max 300)',
      },
      next_page_token: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        type: params.type || 'scheduled',
        page_size: String(params.page_size ?? 30),
      };
      if (params.next_page_token) query.next_page_token = params.next_page_token;

      const result = await ctx.apiExecutor.get('/users/me/meetings', query);

      const meetings: any[] = result.meetings || [];
      if (meetings.length === 0) {
        return { content: 'No meetings found.' };
      }

      const lines = meetings.map((m: any) => formatMeeting(m));

      return {
        content: `Found ${meetings.length} meetings (total: ${result.total_records ?? '?'}):\n\n${lines.join('\n\n')}`,
        metadata: {
          count: meetings.length,
          totalRecords: result.total_records,
          nextPageToken: result.next_page_token,
        },
      };
    } catch (err) {
      return zoomError(err);
    }
  },
};

// ─── Tool: zoom_get_meeting ─────────────────────────────

const getMeeting: ToolHandler = {
  description:
    'Get details of a specific Zoom meeting by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      meeting_id: {
        type: 'number',
        description: 'The Zoom meeting ID',
      },
    },
    required: ['meeting_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/meetings/${params.meeting_id}`);

      const settings = result.settings || {};
      return {
        content: [
          `Meeting: ${result.topic}`,
          `ID: ${result.id}`,
          `Host: ${result.host_email || 'unknown'}`,
          `Status: ${result.status || 'unknown'}`,
          `Type: ${result.type}`,
          `Start: ${result.start_time || 'N/A'}`,
          `Duration: ${result.duration} min`,
          `Timezone: ${result.timezone || 'N/A'}`,
          `Join URL: ${result.join_url}`,
          `Waiting Room: ${settings.waiting_room ? 'enabled' : 'disabled'}`,
          `Recording: ${settings.auto_recording || 'none'}`,
        ].join('\n'),
        metadata: {
          meetingId: result.id,
          topic: result.topic,
          hostEmail: result.host_email,
          status: result.status,
          joinUrl: result.join_url,
        },
      };
    } catch (err) {
      return zoomError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const zoomAdapter: SkillAdapter = {
  skillId: 'zoom-meetings',
  name: 'Zoom Meetings',
  baseUrl: 'https://api.zoom.us/v2',
  auth: {
    type: 'oauth2',
    provider: 'zoom',
    headerPrefix: 'Bearer',
  },
  tools: {
    zoom_create_meeting: createMeeting,
    zoom_list_meetings: listMeetings,
    zoom_get_meeting: getMeeting,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
