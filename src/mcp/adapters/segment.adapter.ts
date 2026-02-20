/**
 * MCP Skill Adapter — Segment
 *
 * Maps Segment Public API endpoints to MCP tool handlers.
 * API reference: https://docs.segmentapis.com/tag/Sources
 *
 * Auth uses a Bearer token (Segment API token).
 *
 * Tools:
 *   - segment_list_sources       List configured sources
 *   - segment_list_destinations  List configured destinations
 *   - segment_track_event        Send a track event via the Segment HTTP API
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function segmentError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors = Array.isArray(data.errors)
        ? data.errors.map((e: any) => e.message ?? e).join('; ')
        : '';
      return {
        content: `Segment API error: ${errors || data.message || err.message}`,
        isError: true,
      };
    }
    return { content: `Segment API error: ${err.message}`, isError: true };
  }
  return { content: `Segment API error: ${String(err)}`, isError: true };
}

/** Format a Segment source for display. */
function formatSource(source: any): string {
  const name = source.name ?? '(unnamed)';
  const slug = source.slug ?? '';
  const id = source.id ?? 'unknown';
  const enabled = source.enabled ? 'enabled' : 'disabled';
  const writeKey = source.writeKeys?.[0] ? `write key: ${source.writeKeys[0].slice(0, 8)}...` : 'no write key';
  return `${name} (${slug}, ID: ${id}) — ${enabled}, ${writeKey}`;
}

/** Format a Segment destination for display. */
function formatDestination(dest: any): string {
  const name = dest.name ?? '(unnamed)';
  const id = dest.id ?? 'unknown';
  const enabled = dest.enabled ? 'enabled' : 'disabled';
  const metadata = dest.metadata?.name ?? dest.metadata?.slug ?? '';
  return `${name} (ID: ${id}) — ${enabled}${metadata ? `, type: ${metadata}` : ''}`;
}

// ─── Tool: segment_list_sources ─────────────────────────

const segmentListSources: ToolHandler = {
  description:
    'List all Segment sources in the workspace. Returns source names, IDs, slugs, and enabled status.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Number of sources to return per page (default 50, max 200)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page_size) query['pagination.count'] = String(params.page_size);
      if (params.cursor) query['pagination.cursor'] = params.cursor;

      const data = await ctx.apiExecutor.get('/sources', query);

      const sources: any[] = data.data?.sources ?? [];
      if (sources.length === 0) {
        return {
          content: 'No sources found in this workspace.',
          metadata: { sourceCount: 0 },
        };
      }

      const lines = sources.map(formatSource);

      return {
        content: `Found ${sources.length} source(s):\n\n${lines.join('\n')}`,
        metadata: {
          sourceCount: sources.length,
          nextCursor: data.data?.pagination?.next ?? null,
        },
      };
    } catch (err) {
      return segmentError(err);
    }
  },
};

// ─── Tool: segment_list_destinations ────────────────────

const segmentListDestinations: ToolHandler = {
  description:
    'List all Segment destinations for a given source. Returns destination names, types, and enabled status.',
  inputSchema: {
    type: 'object',
    properties: {
      source_id: {
        type: 'string',
        description: 'The Segment source ID to list destinations for',
      },
      page_size: {
        type: 'number',
        description: 'Number of destinations to return per page (default 50, max 200)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    required: ['source_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page_size) query['pagination.count'] = String(params.page_size);
      if (params.cursor) query['pagination.cursor'] = params.cursor;

      const data = await ctx.apiExecutor.get(
        `/sources/${params.source_id}/destinations`,
        query,
      );

      const destinations: any[] = data.data?.destinations ?? [];
      if (destinations.length === 0) {
        return {
          content: `No destinations found for source ${params.source_id}.`,
          metadata: { destinationCount: 0, sourceId: params.source_id },
        };
      }

      const lines = destinations.map(formatDestination);

      return {
        content: `Found ${destinations.length} destination(s) for source ${params.source_id}:\n\n${lines.join('\n')}`,
        metadata: {
          destinationCount: destinations.length,
          sourceId: params.source_id,
          nextCursor: data.data?.pagination?.next ?? null,
        },
      };
    } catch (err) {
      return segmentError(err);
    }
  },
};

// ─── Tool: segment_track_event ──────────────────────────

const segmentTrackEvent: ToolHandler = {
  description:
    'Send a track event through Segment. Requires an event name and user/anonymous ID. Properties are optional.',
  inputSchema: {
    type: 'object',
    properties: {
      event: {
        type: 'string',
        description: 'The name of the event (e.g. "Order Completed")',
      },
      user_id: {
        type: 'string',
        description: 'The user ID associated with the event',
      },
      anonymous_id: {
        type: 'string',
        description: 'An anonymous ID if user_id is not available',
      },
      properties: {
        type: 'object',
        description: 'Event properties as key-value pairs (e.g. { "revenue": 29.99, "plan": "pro" })',
        additionalProperties: true,
      },
      context: {
        type: 'object',
        description: 'Additional context (e.g. { "ip": "1.2.3.4", "locale": "en-US" })',
        additionalProperties: true,
      },
    },
    required: ['event'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      if (!params.user_id && !params.anonymous_id) {
        return {
          content: 'Error: either user_id or anonymous_id must be provided.',
          isError: true,
        };
      }

      const body: Record<string, any> = {
        event: params.event,
        type: 'track',
      };
      if (params.user_id) body.userId = params.user_id;
      if (params.anonymous_id) body.anonymousId = params.anonymous_id;
      if (params.properties) body.properties = params.properties;
      if (params.context) body.context = params.context;

      const data = await ctx.apiExecutor.post('/track', body);

      return {
        content: `Track event "${params.event}" sent successfully for ${params.user_id ? `user ${params.user_id}` : `anonymous ${params.anonymous_id}`}.`,
        metadata: {
          event: params.event,
          userId: params.user_id ?? null,
          anonymousId: params.anonymous_id ?? null,
          success: data.success ?? true,
        },
      };
    } catch (err) {
      return segmentError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const segmentAdapter: SkillAdapter = {
  skillId: 'segment-cdp',
  name: 'Segment',
  baseUrl: 'https://api.segmentapis.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    segment_list_sources: segmentListSources,
    segment_list_destinations: segmentListDestinations,
    segment_track_event: segmentTrackEvent,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
