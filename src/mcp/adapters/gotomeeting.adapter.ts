/**
 * MCP Skill Adapter — GoTo Meeting
 *
 * Maps GoTo Meeting REST API v1 endpoints to MCP tool handlers.
 * Supports meeting creation, listing, retrieval, and deletion.
 *
 * GoTo Meeting API docs: https://developer.goto.com/GoToMeetingV1
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function gotoError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.description || err.message;
      const code = data.errorCode ? ` (${data.errorCode})` : '';
      return { content: `GoTo Meeting API error: ${detail}${code}`, isError: true };
    }
    return { content: `GoTo Meeting API error: ${err.message}`, isError: true };
  }
  return { content: `GoTo Meeting API error: ${String(err)}`, isError: true };
}

/** Format a GoTo meeting for human-readable display */
function formatMeeting(meeting: any): string {
  const subject = meeting.subject || 'Untitled Meeting';
  const status = meeting.status || 'unknown';
  const start = meeting.startTime || 'N/A';
  const end = meeting.endTime || 'N/A';
  const id = meeting.meetingId || meeting.uniqueMeetingId || 'unknown';
  const maxParticipants = meeting.maxParticipants ?? 'N/A';
  return `${subject} (${status}) — ${start} to ${end} — Max: ${maxParticipants} — ID: ${id}`;
}

// ─── Tool: goto_list_meetings ───────────────────────────

const listMeetings: ToolHandler = {
  description:
    'List upcoming and past GoTo Meetings. Filter by date range and whether to include historical meetings.',
  inputSchema: {
    type: 'object',
    properties: {
      scheduled: {
        type: 'boolean',
        description: 'If true, return only scheduled (future) meetings (default: true)',
      },
      history: {
        type: 'boolean',
        description: 'If true, include historical (past) meetings',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.scheduled !== undefined) query.scheduled = String(params.scheduled);
      if (params.history !== undefined) query.history = String(params.history);

      const result = await ctx.apiExecutor.get('/meetings', query);

      const meetings: any[] = Array.isArray(result) ? result : result.meetings || [];
      if (meetings.length === 0) {
        return { content: 'No meetings found.' };
      }

      const lines = meetings.map((m: any) => formatMeeting(m));

      return {
        content: `Found ${meetings.length} meetings:\n${lines.join('\n')}`,
        metadata: { count: meetings.length },
      };
    } catch (err) {
      return gotoError(err);
    }
  },
};

// ─── Tool: goto_create_meeting ──────────────────────────

const createMeeting: ToolHandler = {
  description:
    'Create a new GoTo Meeting. Specify subject, start and end times, and optional password.',
  inputSchema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Meeting subject / title',
      },
      starttime: {
        type: 'string',
        description: 'Meeting start time in ISO 8601 format (e.g. "2024-12-01T14:00:00Z")',
      },
      endtime: {
        type: 'string',
        description: 'Meeting end time in ISO 8601 format',
      },
      passwordrequired: {
        type: 'boolean',
        description: 'Whether a password is required to join (default: false)',
      },
      conferencecallinfo: {
        type: 'string',
        enum: ['VoIP', 'PSTN', 'Hybrid', 'None'],
        description: 'Conference call type (default: "VoIP")',
      },
      meetingtype: {
        type: 'string',
        enum: ['scheduled', 'recurring', 'immediate'],
        description: 'Type of meeting (default: "scheduled")',
      },
    },
    required: ['subject', 'starttime', 'endtime'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        subject: params.subject,
        starttime: params.starttime,
        endtime: params.endtime,
        meetingtype: params.meetingtype || 'scheduled',
        conferencecallinfo: params.conferencecallinfo || 'VoIP',
      };
      if (params.passwordrequired !== undefined) body.passwordrequired = params.passwordrequired;

      const result = await ctx.apiExecutor.post('/meetings', body);

      // GoTo API returns an array with a single meeting object
      const meeting = Array.isArray(result) ? result[0] : result;
      const joinUrl = meeting.joinURL || 'N/A';
      const meetingId = meeting.meetingId || meeting.uniqueMeetingId || 'unknown';

      return {
        content: [
          `Meeting created: ${params.subject}`,
          `Meeting ID: ${meetingId}`,
          `Start: ${params.starttime}`,
          `End: ${params.endtime}`,
          `Join URL: ${joinUrl}`,
        ].join('\n'),
        metadata: {
          meetingId,
          subject: params.subject,
          joinUrl,
        },
      };
    } catch (err) {
      return gotoError(err);
    }
  },
};

// ─── Tool: goto_get_meeting ─────────────────────────────

const getMeeting: ToolHandler = {
  description:
    'Get detailed information about a specific GoTo Meeting by its meeting ID.',
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

      // GoTo may return array or single object
      const meeting = Array.isArray(result) ? result[0] : result;
      const joinUrl = meeting.joinURL || 'N/A';
      const status = meeting.status || 'unknown';
      const maxParticipants = meeting.maxParticipants ?? 'N/A';

      return {
        content: [
          `Meeting: ${meeting.subject || 'Untitled'}`,
          `Status: ${status}`,
          `Meeting ID: ${params.meeting_id}`,
          `Start: ${meeting.startTime || 'N/A'}`,
          `End: ${meeting.endTime || 'N/A'}`,
          `Max Participants: ${maxParticipants}`,
          `Conference Call: ${meeting.conferenceCallInfo || 'N/A'}`,
          `Join URL: ${joinUrl}`,
        ].join('\n'),
        metadata: {
          meetingId: params.meeting_id,
          subject: meeting.subject,
          status,
          joinUrl,
        },
      };
    } catch (err) {
      return gotoError(err);
    }
  },
};

// ─── Tool: goto_delete_meeting ──────────────────────────

const deleteMeeting: ToolHandler = {
  description:
    'Delete (cancel) a scheduled GoTo Meeting by its meeting ID. This action cannot be undone.',
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
        content: `Meeting ${params.meeting_id} has been deleted.`,
        metadata: { meetingId: params.meeting_id, deleted: true },
      };
    } catch (err) {
      return gotoError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const gotomeetingAdapter: SkillAdapter = {
  skillId: 'gotomeeting',
  name: 'GoTo Meeting',
  baseUrl: 'https://api.getgo.com/G2M/rest/v1',
  auth: {
    type: 'oauth2',
    provider: 'goto',
  },
  tools: {
    goto_list_meetings: listMeetings,
    goto_create_meeting: createMeeting,
    goto_get_meeting: getMeeting,
    goto_delete_meeting: deleteMeeting,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
