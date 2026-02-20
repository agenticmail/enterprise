/**
 * MCP Skill Adapter — Buffer
 *
 * Maps Buffer API v1 endpoints to MCP tool handlers.
 * Covers social media profile management, update scheduling, and analytics.
 *
 * Buffer API docs: https://buffer.com/developers/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function bufferError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.error || err.message;
      return { content: `Buffer API error: ${message}`, isError: true };
    }
    return { content: `Buffer API error: ${err.message}`, isError: true };
  }
  return { content: `Buffer API error: ${String(err)}`, isError: true };
}

/** Format a Buffer profile for display */
function formatProfile(profile: any): string {
  const service = profile.service || 'unknown';
  const handle = profile.service_username || profile.formatted_username || '(unknown)';
  const type = profile.service_type || '';
  return `${service}: @${handle}${type ? ` (${type})` : ''} (ID: ${profile.id})`;
}

/** Format a Buffer update for display */
function formatUpdate(update: any): string {
  const text = update.text ? (update.text.length > 80 ? update.text.slice(0, 80) + '...' : update.text) : '(no text)';
  const status = update.status || 'unknown';
  const scheduled = update.scheduled_at ? new Date(update.scheduled_at * 1000).toISOString().slice(0, 16) : 'N/A';
  return `"${text}" -- ${status} -- scheduled: ${scheduled} (ID: ${update.id})`;
}

// ─── Tool: buffer_list_profiles ─────────────────────────

const listProfiles: ToolHandler = {
  description:
    'List social media profiles connected to your Buffer account. Returns service names, usernames, and profile IDs.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/profiles.json');

      const profiles: any[] = Array.isArray(result) ? result : [];
      if (profiles.length === 0) {
        return { content: 'No social profiles connected.', metadata: { count: 0 } };
      }

      const lines = profiles.map((p: any) => formatProfile(p));

      return {
        content: `Found ${profiles.length} connected profiles:\n${lines.join('\n')}`,
        metadata: { count: profiles.length },
      };
    } catch (err) {
      return bufferError(err);
    }
  },
};

// ─── Tool: buffer_create_update ─────────────────────────

const createUpdate: ToolHandler = {
  description:
    'Create a new social media update (post) via Buffer. Can be scheduled or added to the queue.',
  inputSchema: {
    type: 'object',
    properties: {
      profile_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of Buffer profile IDs to post to',
      },
      text: {
        type: 'string',
        description: 'The text content of the update',
      },
      media: {
        type: 'object',
        description: 'Media attachment: { link?: string, photo?: string, thumbnail?: string, description?: string }',
      },
      scheduled_at: {
        type: 'string',
        description: 'ISO 8601 datetime for scheduling (optional — omit to add to queue)',
      },
      now: {
        type: 'boolean',
        description: 'Set to true to share immediately instead of adding to queue',
      },
    },
    required: ['profile_ids', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        profile_ids: params.profile_ids,
        text: params.text,
      };
      if (params.media) body.media = params.media;
      if (params.scheduled_at) body.scheduled_at = params.scheduled_at;
      if (params.now) body.now = params.now;

      const result = await ctx.apiExecutor.post('/updates/create.json', body);

      if (!result.success) {
        return { content: `Buffer update failed: ${result.message || 'Unknown error'}`, isError: true };
      }

      const updates: any[] = result.updates || [];
      const count = updates.length;

      return {
        content: `Update created for ${count} profile(s):\n${updates.map((u: any) => formatUpdate(u)).join('\n')}`,
        metadata: { updateCount: count, profileIds: params.profile_ids },
      };
    } catch (err) {
      return bufferError(err);
    }
  },
};

// ─── Tool: buffer_list_updates ──────────────────────────

const listUpdates: ToolHandler = {
  description:
    'List pending or sent updates for a specific Buffer profile. Returns update text, status, and scheduled times.',
  inputSchema: {
    type: 'object',
    properties: {
      profile_id: {
        type: 'string',
        description: 'The Buffer profile ID to list updates for',
      },
      status: {
        type: 'string',
        enum: ['pending', 'sent'],
        description: 'Filter by update status (default: "pending")',
      },
      count: {
        type: 'number',
        description: 'Number of updates to return (default 20, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    required: ['profile_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const status = params.status || 'pending';
      const query: Record<string, string> = {
        count: String(params.count ?? 20),
        page: String(params.page ?? 1),
      };

      const result = await ctx.apiExecutor.get(
        `/profiles/${params.profile_id}/updates/${status}.json`,
        query,
      );

      const updates: any[] = result.updates || [];
      const total = result.total ?? updates.length;

      if (updates.length === 0) {
        return { content: `No ${status} updates found for this profile.`, metadata: { count: 0 } };
      }

      const lines = updates.map((u: any) => formatUpdate(u));

      return {
        content: `Found ${total} ${status} updates (showing ${updates.length}):\n${lines.join('\n')}`,
        metadata: { count: updates.length, total, status },
      };
    } catch (err) {
      return bufferError(err);
    }
  },
};

// ─── Tool: buffer_get_analytics ─────────────────────────

const getAnalytics: ToolHandler = {
  description:
    'Get interaction analytics for a specific Buffer update. Returns clicks, likes, shares, comments, and reach.',
  inputSchema: {
    type: 'object',
    properties: {
      update_id: {
        type: 'string',
        description: 'The Buffer update ID to get analytics for',
      },
    },
    required: ['update_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/updates/${params.update_id}/interactions.json`);

      const interactions: any[] = result.interactions || [];
      const total = result.total ?? interactions.length;

      if (interactions.length === 0) {
        return {
          content: `No interactions found for update ${params.update_id}.`,
          metadata: { updateId: params.update_id, count: 0 },
        };
      }

      const lines = interactions.map((i: any) => {
        const type = i.type || 'unknown';
        const user = i.username || i.user?.username || 'unknown';
        const text = i.text ? (i.text.length > 60 ? i.text.slice(0, 60) + '...' : i.text) : '';
        return `${type} by @${user}${text ? `: "${text}"` : ''}`;
      });

      return {
        content: `Found ${total} interactions for update ${params.update_id}:\n${lines.join('\n')}`,
        metadata: { updateId: params.update_id, count: interactions.length, total },
      };
    } catch (err) {
      return bufferError(err);
    }
  },
};

// ─── Tool: buffer_shuffle_queue ─────────────────────────

const shuffleQueue: ToolHandler = {
  description:
    'Shuffle the order of pending updates in a Buffer profile queue. Randomizes the scheduled order.',
  inputSchema: {
    type: 'object',
    properties: {
      profile_id: {
        type: 'string',
        description: 'The Buffer profile ID whose queue to shuffle',
      },
    },
    required: ['profile_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.post(
        `/profiles/${params.profile_id}/updates/shuffle.json`,
      );

      if (result.success) {
        return {
          content: `Queue shuffled for profile ${params.profile_id}.`,
          metadata: { profileId: params.profile_id },
        };
      }

      return {
        content: `Shuffle failed: ${result.message || 'Unknown error'}`,
        isError: true,
      };
    } catch (err) {
      return bufferError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const bufferAdapter: SkillAdapter = {
  skillId: 'buffer',
  name: 'Buffer Social Media',
  baseUrl: 'https://api.bufferapp.com/1',
  auth: {
    type: 'oauth2',
    provider: 'buffer',
  },
  tools: {
    buffer_list_profiles: listProfiles,
    buffer_create_update: createUpdate,
    buffer_list_updates: listUpdates,
    buffer_get_analytics: getAnalytics,
    buffer_shuffle_queue: shuffleQueue,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
