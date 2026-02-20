/**
 * MCP Skill Adapter — Hootsuite
 *
 * Maps Hootsuite Platform API v1 endpoints to MCP tool handlers.
 * Covers social profile management, message scheduling, analytics, and streams.
 *
 * Hootsuite API docs: https://developer.hootsuite.com/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function hootsuiteError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Hootsuite returns { errors: [{ code, message }] }
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => e.message || e.code || 'unknown error').join('; ');
        return { content: `Hootsuite API error: ${details}`, isError: true };
      }
      return { content: `Hootsuite API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Hootsuite API error: ${err.message}`, isError: true };
  }
  return { content: `Hootsuite API error: ${String(err)}`, isError: true };
}

/** Format a Hootsuite social profile for display */
function formatProfile(profile: any): string {
  const type = profile.type || 'unknown';
  const socialName = profile.socialNetworkUsername || profile.socialNetworkId || '(unknown)';
  return `${type}: @${socialName} (ID: ${profile.id})`;
}

/** Format a Hootsuite message for display */
function formatMessage(msg: any): string {
  const text = msg.text ? (msg.text.length > 80 ? msg.text.slice(0, 80) + '...' : msg.text) : '(no text)';
  const state = msg.state || 'unknown';
  const scheduledAt = msg.scheduledSendTime || 'N/A';
  return `"${text}" -- ${state} -- scheduled: ${scheduledAt} (ID: ${msg.id})`;
}

// ─── Tool: hootsuite_list_profiles ──────────────────────

const listProfiles: ToolHandler = {
  description:
    'List social media profiles connected to your Hootsuite account. Returns service types, usernames, and profile IDs.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/socialProfiles');

      const profiles: any[] = result.data || [];
      if (profiles.length === 0) {
        return { content: 'No social profiles connected.', metadata: { count: 0 } };
      }

      const lines = profiles.map((p: any) => formatProfile(p));

      return {
        content: `Found ${profiles.length} connected profiles:\n${lines.join('\n')}`,
        metadata: { count: profiles.length },
      };
    } catch (err) {
      return hootsuiteError(err);
    }
  },
};

// ─── Tool: hootsuite_schedule_message ───────────────────

const scheduleMessage: ToolHandler = {
  description:
    'Schedule a social media message via Hootsuite. Posts to one or more social profiles at a specified time.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text content of the message',
      },
      socialProfileIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of Hootsuite social profile IDs to post to',
      },
      scheduledSendTime: {
        type: 'string',
        description: 'ISO 8601 datetime for when to publish the message (required)',
      },
      mediaUrls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of media URLs to attach to the message (optional)',
      },
    },
    required: ['text', 'socialProfileIds', 'scheduledSendTime'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        text: params.text,
        socialProfileIds: params.socialProfileIds,
        scheduledSendTime: params.scheduledSendTime,
      };
      if (params.mediaUrls?.length) {
        body.mediaUrls = params.mediaUrls.map((url: string) => ({ url }));
      }

      const result = await ctx.apiExecutor.post('/messages', body);

      const msg = result.data;
      return {
        content: `Message scheduled: ${formatMessage(msg)}`,
        metadata: {
          messageId: msg.id,
          profileCount: params.socialProfileIds.length,
          scheduledSendTime: params.scheduledSendTime,
        },
      };
    } catch (err) {
      return hootsuiteError(err);
    }
  },
};

// ─── Tool: hootsuite_list_messages ──────────────────────

const listMessages: ToolHandler = {
  description:
    'List scheduled messages from Hootsuite. Optionally filter by state or date range.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['SCHEDULED', 'SENT', 'FAILED'],
        description: 'Filter by message state',
      },
      startTime: {
        type: 'string',
        description: 'Start of date range in ISO 8601 format',
      },
      endTime: {
        type: 'string',
        description: 'End of date range in ISO 8601 format',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of messages to return (default 20, max 100)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.state) query.state = params.state;
      if (params.startTime) query.startTime = params.startTime;
      if (params.endTime) query.endTime = params.endTime;
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get('/messages', query);

      const messages: any[] = result.data || [];
      if (messages.length === 0) {
        return { content: 'No messages found.', metadata: { count: 0 } };
      }

      const lines = messages.map((m: any) => formatMessage(m));
      const nextCursor = result.cursor || null;

      return {
        content: `Found ${messages.length} messages:\n${lines.join('\n')}${nextCursor ? '\n\n(More available — use cursor to paginate)' : ''}`,
        metadata: { count: messages.length, hasMore: !!nextCursor },
      };
    } catch (err) {
      return hootsuiteError(err);
    }
  },
};

// ─── Tool: hootsuite_get_analytics ──────────────────────

const getAnalytics: ToolHandler = {
  description:
    'Get social media analytics from Hootsuite for a specific profile. Returns engagement metrics like followers, posts, and interactions.',
  inputSchema: {
    type: 'object',
    properties: {
      socialProfileId: {
        type: 'string',
        description: 'The Hootsuite social profile ID to get analytics for',
      },
      startTime: {
        type: 'string',
        description: 'Start of date range in ISO 8601 format',
      },
      endTime: {
        type: 'string',
        description: 'End of date range in ISO 8601 format',
      },
    },
    required: ['socialProfileId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        socialProfileId: params.socialProfileId,
      };
      if (params.startTime) query.startTime = params.startTime;
      if (params.endTime) query.endTime = params.endTime;

      const result = await ctx.apiExecutor.get('/analytics/socialProfiles', query);

      const data = result.data;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return {
          content: `No analytics data available for profile ${params.socialProfileId}.`,
          metadata: { socialProfileId: params.socialProfileId },
        };
      }

      const metrics = Array.isArray(data) ? data : [data];
      const lines = metrics.map((m: any) => {
        const entries = Object.entries(m)
          .filter(([k]) => k !== 'id' && k !== 'socialProfileId')
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n');
        return entries;
      });

      return {
        content: `Analytics for profile ${params.socialProfileId}:\n${lines.join('\n\n')}`,
        metadata: { socialProfileId: params.socialProfileId },
      };
    } catch (err) {
      return hootsuiteError(err);
    }
  },
};

// ─── Tool: hootsuite_list_streams ───────────────────────

const listStreams: ToolHandler = {
  description:
    'List content streams configured in Hootsuite. Streams are feeds of social content (mentions, timelines, searches, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      socialProfileId: {
        type: 'string',
        description: 'Filter streams by social profile ID (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.socialProfileId) query.socialProfileId = params.socialProfileId;

      const result = await ctx.apiExecutor.get('/streams', query);

      const streams: any[] = result.data || [];
      if (streams.length === 0) {
        return { content: 'No streams found.', metadata: { count: 0 } };
      }

      const lines = streams.map((s: any) => {
        const type = s.type || 'unknown';
        const title = s.title || '(untitled)';
        const profileId = s.socialProfileId || 'N/A';
        return `${title} -- type: ${type} -- profile: ${profileId} (ID: ${s.id})`;
      });

      return {
        content: `Found ${streams.length} streams:\n${lines.join('\n')}`,
        metadata: { count: streams.length },
      };
    } catch (err) {
      return hootsuiteError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const hootsuiteAdapter: SkillAdapter = {
  skillId: 'hootsuite',
  name: 'Hootsuite',
  baseUrl: 'https://platform.hootsuite.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'hootsuite',
  },
  tools: {
    hootsuite_list_profiles: listProfiles,
    hootsuite_schedule_message: scheduleMessage,
    hootsuite_list_messages: listMessages,
    hootsuite_get_analytics: getAnalytics,
    hootsuite_list_streams: listStreams,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
