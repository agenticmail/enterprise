/**
 * MCP Skill Adapter — Calendly
 *
 * Maps Calendly API v2 endpoints to MCP tool handlers.
 * Supports event listing, event type management, and event cancellation.
 *
 * Calendly API docs: https://developer.calendly.com/api-docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function calendlyError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.title || err.message;
      return { content: `Calendly API error: ${detail}`, isError: true };
    }
    return { content: `Calendly API error: ${err.message}`, isError: true };
  }
  return { content: `Calendly API error: ${String(err)}`, isError: true };
}

/** Format a Calendly event for human-readable display */
function formatEvent(event: any): string {
  const name = event.name || 'Untitled';
  const status = event.status || 'unknown';
  const start = event.start_time ? event.start_time.slice(0, 16) : 'N/A';
  const end = event.end_time ? event.end_time.slice(0, 16) : 'N/A';
  const location = event.location?.location || event.location?.type || 'No location';
  return `${name} (${status}) — ${start} to ${end} — ${location}`;
}

// ─── Tool: calendly_list_events ─────────────────────────

const listEvents: ToolHandler = {
  description:
    'List scheduled Calendly events. Filter by status and date range. Requires the user URI.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Calendly user URI (e.g. "https://api.calendly.com/users/XXXXXXXXX")',
      },
      status: {
        type: 'string',
        enum: ['active', 'canceled'],
        description: 'Filter by event status (optional)',
      },
      min_start_time: {
        type: 'string',
        description: 'Minimum start time in ISO 8601 format (optional)',
      },
      max_start_time: {
        type: 'string',
        description: 'Maximum start time in ISO 8601 format (optional)',
      },
      count: {
        type: 'number',
        description: 'Number of events to return (default 20)',
      },
    },
    required: ['user'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        user: params.user,
        count: String(params.count ?? 20),
      };
      if (params.status) query.status = params.status;
      if (params.min_start_time) query.min_start_time = params.min_start_time;
      if (params.max_start_time) query.max_start_time = params.max_start_time;

      const result = await ctx.apiExecutor.get('/scheduled_events', query);

      const events: any[] = result.collection || [];
      if (events.length === 0) {
        return { content: 'No scheduled events found.' };
      }

      const lines = events.map((e: any) => formatEvent(e));

      return {
        content: `Found ${events.length} events:\n${lines.join('\n')}`,
        metadata: { count: events.length },
      };
    } catch (err) {
      return calendlyError(err);
    }
  },
};

// ─── Tool: calendly_get_event ───────────────────────────

const getEvent: ToolHandler = {
  description:
    'Get detailed information about a specific Calendly event by its UUID.',
  inputSchema: {
    type: 'object',
    properties: {
      event_uuid: {
        type: 'string',
        description: 'The UUID of the event to retrieve',
      },
    },
    required: ['event_uuid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/scheduled_events/${params.event_uuid}`,
      );

      const event = result.resource || result;
      const invitees = event.event_memberships?.length || 0;
      const location = event.location?.location || event.location?.type || 'No location';

      return {
        content: [
          `Event: ${event.name || 'Untitled'}`,
          `Status: ${event.status || 'unknown'}`,
          `Start: ${event.start_time || 'N/A'}`,
          `End: ${event.end_time || 'N/A'}`,
          `Location: ${location}`,
          `Invitees: ${invitees}`,
          `Event Type: ${event.event_type || 'N/A'}`,
          `Created: ${event.created_at || 'N/A'}`,
        ].join('\n'),
        metadata: {
          uuid: params.event_uuid,
          name: event.name,
          status: event.status,
          startTime: event.start_time,
        },
      };
    } catch (err) {
      return calendlyError(err);
    }
  },
};

// ─── Tool: calendly_list_event_types ────────────────────

const listEventTypes: ToolHandler = {
  description:
    'List available Calendly event types (booking pages) for a user. Returns names, durations, and scheduling URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Calendly user URI (e.g. "https://api.calendly.com/users/XXXXXXXXX")',
      },
      active: {
        type: 'boolean',
        description: 'Filter by active/inactive event types (optional)',
      },
      count: {
        type: 'number',
        description: 'Number of results to return (default 20)',
      },
    },
    required: ['user'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        user: params.user,
        count: String(params.count ?? 20),
      };
      if (params.active !== undefined) query.active = String(params.active);

      const result = await ctx.apiExecutor.get('/event_types', query);

      const types: any[] = result.collection || [];
      if (types.length === 0) {
        return { content: 'No event types found.' };
      }

      const lines = types.map((t: any) => {
        const active = t.active ? 'active' : 'inactive';
        const duration = t.duration ? `${t.duration} min` : 'N/A';
        const url = t.scheduling_url || 'N/A';
        return `${t.name} (${active}, ${duration}) — ${url}`;
      });

      return {
        content: `Found ${types.length} event types:\n${lines.join('\n')}`,
        metadata: { count: types.length },
      };
    } catch (err) {
      return calendlyError(err);
    }
  },
};

// ─── Tool: calendly_cancel_event ────────────────────────

const cancelEvent: ToolHandler = {
  description:
    'Cancel a scheduled Calendly event. Provide the event UUID and an optional cancellation reason.',
  inputSchema: {
    type: 'object',
    properties: {
      event_uuid: {
        type: 'string',
        description: 'The UUID of the event to cancel',
      },
      reason: {
        type: 'string',
        description: 'Cancellation reason to share with invitees (optional)',
      },
    },
    required: ['event_uuid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.reason) body.reason = params.reason;

      await ctx.apiExecutor.post(
        `/scheduled_events/${params.event_uuid}/cancellation`,
        body,
      );

      const reasonText = params.reason ? ` Reason: ${params.reason}` : '';
      return {
        content: `Event ${params.event_uuid} has been cancelled.${reasonText}`,
        metadata: { uuid: params.event_uuid, reason: params.reason },
      };
    } catch (err) {
      return calendlyError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const calendlyAdapter: SkillAdapter = {
  skillId: 'calendly',
  name: 'Calendly',
  baseUrl: 'https://api.calendly.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    calendly_list_events: listEvents,
    calendly_get_event: getEvent,
    calendly_list_event_types: listEventTypes,
    calendly_cancel_event: cancelEvent,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
