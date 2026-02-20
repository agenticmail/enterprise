/**
 * MCP Skill Adapter — Gong
 *
 * Maps Gong Revenue Intelligence API v2 endpoints to MCP tool handlers.
 * Covers call listing, call details, transcripts, and user management.
 *
 * Gong API docs: https://us-66463.app.gong.io/settings/api/documentation
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function gongError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.errors?.[0]?.message || data.message || err.message;
      const code = data.errors?.[0]?.code || data.requestId || '';
      return { content: `Gong API error${code ? ` [${code}]` : ''}: ${msg}`, isError: true };
    }
    return { content: `Gong API error: ${err.message}`, isError: true };
  }
  return { content: `Gong API error: ${String(err)}`, isError: true };
}

/** Format a Gong call for display */
function formatCall(call: any): string {
  const title = call.title || '(no title)';
  const started = call.started ? call.started.slice(0, 16) : 'unknown';
  const duration = call.duration != null ? `${Math.round(call.duration / 60)}min` : 'N/A';
  const direction = call.direction || 'unknown';
  const parties = (call.parties || [])
    .map((p: any) => p.name || p.emailAddress || 'unknown')
    .slice(0, 3)
    .join(', ');
  const partiesPart = parties ? ` -- participants: ${parties}` : '';
  return `"${title}" -- ${direction} -- ${duration} -- ${started}${partiesPart} (ID: ${call.id})`;
}

/** Format a Gong user for display */
function formatUser(user: any): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = user.emailAddress || '(no email)';
  const role = user.managerId ? `reports to ${user.managerId}` : 'no manager';
  const active = user.active ? 'active' : 'inactive';
  return `${name} <${email}> -- ${active} -- ${role} (ID: ${user.id})`;
}

// ─── Tool: gong_list_calls ──────────────────────────────

const listCalls: ToolHandler = {
  description:
    'List calls from Gong. Filter by date range, user, or workspace. Returns call titles, durations, and participants.',
  inputSchema: {
    type: 'object',
    properties: {
      fromDateTime: {
        type: 'string',
        description: 'Start date in ISO format (e.g. "2025-01-01T00:00:00Z")',
      },
      toDateTime: {
        type: 'string',
        description: 'End date in ISO format',
      },
      workspaceId: {
        type: 'string',
        description: 'Filter by workspace ID',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    required: ['fromDateTime', 'toDateTime'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        filter: {
          fromDateTime: params.fromDateTime,
          toDateTime: params.toDateTime,
        },
      };
      if (params.workspaceId) body.filter.workspaceId = params.workspaceId;
      if (params.cursor) body.cursor = params.cursor;

      const result = await ctx.apiExecutor.post('/calls/extensive', body);

      const calls: any[] = result.calls || [];
      if (calls.length === 0) {
        return { content: 'No calls found in the specified date range.' };
      }

      const lines = calls.map((c: any) => formatCall(c));
      const records = result.records || {};

      return {
        content: `Found ${records.totalRecords || calls.length} calls (showing ${calls.length}):\n${lines.join('\n')}${records.cursor ? '\n\n(More available)' : ''}`,
        metadata: {
          count: calls.length,
          total: records.totalRecords,
          cursor: records.cursor,
        },
      };
    } catch (err) {
      return gongError(err);
    }
  },
};

// ─── Tool: gong_get_call ────────────────────────────────

const getCall: ToolHandler = {
  description:
    'Get detailed information about a specific Gong call, including participants, duration, and media.',
  inputSchema: {
    type: 'object',
    properties: {
      call_id: {
        type: 'string',
        description: 'The Gong call ID to retrieve',
      },
    },
    required: ['call_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        filter: {
          callIds: [params.call_id],
        },
      };

      const result = await ctx.apiExecutor.post('/calls/extensive', body);

      const calls: any[] = result.calls || [];
      if (calls.length === 0) {
        return { content: `Call ${params.call_id} not found.` };
      }

      const call = calls[0];
      const details: string[] = [];
      details.push(`Title: ${call.title || '(no title)'}`);
      details.push(`ID: ${call.id}`);
      details.push(`Direction: ${call.direction || 'unknown'}`);
      details.push(`Started: ${call.started || 'unknown'}`);
      details.push(`Duration: ${call.duration != null ? `${Math.round(call.duration / 60)} minutes` : 'N/A'}`);
      if (call.url) details.push(`URL: ${call.url}`);
      if (call.purpose) details.push(`Purpose: ${call.purpose}`);
      if (call.scope) details.push(`Scope: ${call.scope}`);

      const parties = (call.parties || []).map((p: any) => {
        const name = p.name || 'unknown';
        const email = p.emailAddress || '';
        const affiliation = p.affiliation || '';
        return `  - ${name}${email ? ` <${email}>` : ''} (${affiliation})`;
      });
      if (parties.length > 0) {
        details.push(`Participants:\n${parties.join('\n')}`);
      }

      return {
        content: details.join('\n'),
        metadata: { callId: call.id, title: call.title },
      };
    } catch (err) {
      return gongError(err);
    }
  },
};

// ─── Tool: gong_get_call_transcript ─────────────────────

const getCallTranscript: ToolHandler = {
  description:
    'Get the transcript of a specific Gong call. Returns speaker-attributed text with timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      call_id: {
        type: 'string',
        description: 'The Gong call ID to get the transcript for',
      },
    },
    required: ['call_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        filter: {
          callIds: [params.call_id],
        },
      };

      const result = await ctx.apiExecutor.post('/calls/transcript', body);

      const transcripts: any[] = result.callTranscripts || [];
      if (transcripts.length === 0) {
        return { content: `No transcript available for call ${params.call_id}.` };
      }

      const transcript = transcripts[0];
      const sentences = transcript.transcript || [];

      if (sentences.length === 0) {
        return { content: `Transcript for call ${params.call_id} is empty.` };
      }

      const lines = sentences.map((s: any) => {
        const speaker = s.speakerName || s.speakerId || 'Unknown';
        const start = s.start != null ? `[${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, '0')}]` : '';
        return `${start} ${speaker}: ${s.text || ''}`;
      });

      const maxLines = 100;
      const truncated = lines.length > maxLines;
      const displayLines = truncated ? lines.slice(0, maxLines) : lines;

      return {
        content: `Transcript for call ${params.call_id} (${sentences.length} segments):\n\n${displayLines.join('\n')}${truncated ? `\n\n... (${lines.length - maxLines} more segments)` : ''}`,
        metadata: {
          callId: params.call_id,
          segmentCount: sentences.length,
          truncated,
        },
      };
    } catch (err) {
      return gongError(err);
    }
  },
};

// ─── Tool: gong_list_users ──────────────────────────────

const listUsers: ToolHandler = {
  description:
    'List users in your Gong workspace. Returns user names, emails, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      includeDeactivated: {
        type: 'boolean',
        description: 'Include deactivated users (default: false)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.cursor) body.cursor = params.cursor;
      if (params.includeDeactivated) body.includeDeactivated = params.includeDeactivated;

      const result = await ctx.apiExecutor.post('/users/extensive', body);

      const users: any[] = result.users || [];
      if (users.length === 0) {
        return { content: 'No users found.' };
      }

      const lines = users.map((u: any) => formatUser(u));
      const records = result.records || {};

      return {
        content: `Found ${records.totalRecords || users.length} users (showing ${users.length}):\n${lines.join('\n')}${records.cursor ? '\n\n(More available)' : ''}`,
        metadata: {
          count: users.length,
          total: records.totalRecords,
          cursor: records.cursor,
        },
      };
    } catch (err) {
      return gongError(err);
    }
  },
};

// ─── Tool: gong_search_calls ────────────────────────────

const searchCalls: ToolHandler = {
  description:
    'Search Gong calls by keywords, speaker, or content. Returns matching calls with relevance.',
  inputSchema: {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Keywords to search for in call transcripts and titles',
      },
      fromDateTime: {
        type: 'string',
        description: 'Start date in ISO format',
      },
      toDateTime: {
        type: 'string',
        description: 'End date in ISO format',
      },
      speakerIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by speaker user IDs',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    required: ['keywords'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        filter: {
          callIds: undefined,
        },
        contentSelector: {
          context: 'Extended',
          exposedFields: {
            content: {
              keywords: params.keywords,
            },
          },
        },
      };

      if (params.fromDateTime) body.filter.fromDateTime = params.fromDateTime;
      if (params.toDateTime) body.filter.toDateTime = params.toDateTime;
      if (params.speakerIds?.length) body.filter.speakerIds = params.speakerIds;
      if (params.cursor) body.cursor = params.cursor;

      const result = await ctx.apiExecutor.post('/calls/extensive', body);

      const calls: any[] = result.calls || [];
      if (calls.length === 0) {
        return { content: `No calls found matching keywords: ${params.keywords.join(', ')}` };
      }

      const lines = calls.map((c: any) => formatCall(c));
      const records = result.records || {};

      return {
        content: `Found ${records.totalRecords || calls.length} calls matching "${params.keywords.join(', ')}" (showing ${calls.length}):\n${lines.join('\n')}`,
        metadata: {
          count: calls.length,
          total: records.totalRecords,
          keywords: params.keywords,
        },
      };
    } catch (err) {
      return gongError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const gongAdapter: SkillAdapter = {
  skillId: 'gong',
  name: 'Gong Revenue Intelligence',
  baseUrl: 'https://api.gong.io/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    gong_list_calls: listCalls,
    gong_get_call: getCall,
    gong_get_call_transcript: getCallTranscript,
    gong_list_users: listUsers,
    gong_search_calls: searchCalls,
  },
  rateLimits: {
    requestsPerSecond: 3,
    burstLimit: 10,
  },
};
