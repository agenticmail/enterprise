/**
 * MCP Skill Adapter — Klaviyo
 *
 * Maps Klaviyo API endpoints to MCP tool handlers.
 * Covers profiles, events, campaigns, flows, and metrics.
 *
 * Klaviyo API docs: https://developers.klaviyo.com/en/reference/api-overview
 *
 * Auth: API key sent via Authorization header with "Klaviyo-API-Key" prefix.
 * All requests must include the 'revision' header.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function klaviyoError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Klaviyo returns { errors: [{ id, status, code, title, detail }] }
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => e.detail || e.title || 'unknown error').join('; ');
        return { content: `Klaviyo API error: ${details}`, isError: true };
      }
      return { content: `Klaviyo API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Klaviyo API error: ${err.message}`, isError: true };
  }
  return { content: `Klaviyo API error: ${String(err)}`, isError: true };
}

/** Format a Klaviyo profile for display */
function formatProfile(profile: any): string {
  const attrs = profile.attributes || {};
  const name = [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = attrs.email || '(no email)';
  const phone = attrs.phone_number ? ` | ${attrs.phone_number}` : '';
  return `${name} <${email}>${phone} (ID: ${profile.id})`;
}

// ─── Tool: klaviyo_list_profiles ────────────────────────

const listProfiles: ToolHandler = {
  description:
    'List profiles (contacts) from Klaviyo. Supports filtering by email and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter expression (e.g. equals(email,"user@example.com"))',
      },
      page_size: {
        type: 'number',
        description: 'Number of profiles to return per page (default 20, max 100)',
      },
      page_cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 20),
      };
      if (params.filter) query.filter = params.filter;
      if (params.page_cursor) query['page[cursor]'] = params.page_cursor;

      const result = await ctx.apiExecutor.get('/profiles', query);

      const profiles: any[] = result.data || [];
      if (profiles.length === 0) {
        return { content: 'No profiles found.', metadata: { count: 0 } };
      }

      const lines = profiles.map((p: any) => formatProfile(p));
      const nextCursor = result.links?.next || null;

      return {
        content: `Found ${profiles.length} profiles:\n${lines.join('\n')}${nextCursor ? '\n\n(More available — use page_cursor to paginate)' : ''}`,
        metadata: { count: profiles.length, hasMore: !!nextCursor },
      };
    } catch (err) {
      return klaviyoError(err);
    }
  },
};

// ─── Tool: klaviyo_create_event ─────────────────────────

const createEvent: ToolHandler = {
  description:
    'Track a custom event in Klaviyo. Events are used for triggering flows, segmentation, and analytics.',
  inputSchema: {
    type: 'object',
    properties: {
      metric_name: {
        type: 'string',
        description: 'Name of the event/metric to track (e.g. "Viewed Product", "Added to Cart")',
      },
      profile_email: {
        type: 'string',
        description: 'Email address of the profile to associate the event with',
      },
      profile_id: {
        type: 'string',
        description: 'Klaviyo profile ID (alternative to email)',
      },
      properties: {
        type: 'object',
        description: 'Custom properties for the event (e.g. { "product_name": "T-Shirt", "price": 29.99 })',
      },
      value: {
        type: 'number',
        description: 'Numeric value for the event (e.g. order total)',
      },
      time: {
        type: 'string',
        description: 'ISO 8601 timestamp for the event (defaults to now)',
      },
    },
    required: ['metric_name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const profile: Record<string, any> = {};
      if (params.profile_email) profile.email = params.profile_email;
      if (params.profile_id) profile.id = params.profile_id;

      if (!profile.email && !profile.id) {
        return { content: 'Either profile_email or profile_id is required.', isError: true };
      }

      const eventData: Record<string, any> = {
        type: 'event',
        attributes: {
          metric: { data: { type: 'metric', attributes: { name: params.metric_name } } },
          profile: { data: { type: 'profile', attributes: profile } },
          properties: params.properties || {},
        },
      };

      if (params.value != null) eventData.attributes.value = params.value;
      if (params.time) eventData.attributes.time = params.time;

      await ctx.apiExecutor.post('/events', { data: eventData });

      const target = params.profile_email || params.profile_id;
      return {
        content: `Event "${params.metric_name}" tracked for ${target}`,
        metadata: { metricName: params.metric_name, profile: target },
      };
    } catch (err) {
      return klaviyoError(err);
    }
  },
};

// ─── Tool: klaviyo_list_campaigns ───────────────────────

const listCampaigns: ToolHandler = {
  description:
    'List email campaigns from Klaviyo. Returns campaign names, statuses, and send times.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter expression (e.g. equals(messages.channel,"email"))',
      },
      page_size: {
        type: 'number',
        description: 'Number of campaigns to return (default 20, max 50)',
      },
      sort: {
        type: 'string',
        description: 'Sort field (e.g. "-created_at" for newest first)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 20),
      };
      if (params.filter) query.filter = params.filter;
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get('/campaigns', query);

      const campaigns: any[] = result.data || [];
      if (campaigns.length === 0) {
        return { content: 'No campaigns found.', metadata: { count: 0 } };
      }

      const lines = campaigns.map((c: any) => {
        const attrs = c.attributes || {};
        const name = attrs.name || '(untitled)';
        const status = attrs.status || 'unknown';
        const sendTime = attrs.send_time || 'not scheduled';
        return `${name} -- ${status} -- send: ${sendTime} (ID: ${c.id})`;
      });

      return {
        content: `Found ${campaigns.length} campaigns:\n${lines.join('\n')}`,
        metadata: { count: campaigns.length },
      };
    } catch (err) {
      return klaviyoError(err);
    }
  },
};

// ─── Tool: klaviyo_list_flows ───────────────────────────

const listFlows: ToolHandler = {
  description:
    'List automation flows from Klaviyo. Returns flow names, statuses, and trigger types.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter expression (e.g. equals(status,"live"))',
      },
      page_size: {
        type: 'number',
        description: 'Number of flows to return (default 20, max 50)',
      },
      sort: {
        type: 'string',
        description: 'Sort field (e.g. "-created" for newest first)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 20),
      };
      if (params.filter) query.filter = params.filter;
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get('/flows', query);

      const flows: any[] = result.data || [];
      if (flows.length === 0) {
        return { content: 'No flows found.', metadata: { count: 0 } };
      }

      const lines = flows.map((f: any) => {
        const attrs = f.attributes || {};
        const name = attrs.name || '(unnamed)';
        const status = attrs.status || 'unknown';
        const trigger = attrs.trigger_type || 'N/A';
        const created = attrs.created ? attrs.created.slice(0, 10) : '';
        return `${name} -- ${status} -- trigger: ${trigger} -- created: ${created} (ID: ${f.id})`;
      });

      return {
        content: `Found ${flows.length} flows:\n${lines.join('\n')}`,
        metadata: { count: flows.length },
      };
    } catch (err) {
      return klaviyoError(err);
    }
  },
};

// ─── Tool: klaviyo_get_metrics ──────────────────────────

const getMetrics: ToolHandler = {
  description:
    'List available metrics (event types) in Klaviyo. Returns metric names, integration sources, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Number of metrics to return (default 20, max 50)',
      },
      page_cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 20),
      };
      if (params.page_cursor) query['page[cursor]'] = params.page_cursor;

      const result = await ctx.apiExecutor.get('/metrics', query);

      const metrics: any[] = result.data || [];
      if (metrics.length === 0) {
        return { content: 'No metrics found.', metadata: { count: 0 } };
      }

      const lines = metrics.map((m: any) => {
        const attrs = m.attributes || {};
        const name = attrs.name || '(unnamed)';
        const integration = attrs.integration?.name || 'custom';
        const created = attrs.created ? attrs.created.slice(0, 10) : '';
        return `${name} -- source: ${integration} -- created: ${created} (ID: ${m.id})`;
      });

      return {
        content: `Found ${metrics.length} metrics:\n${lines.join('\n')}`,
        metadata: { count: metrics.length },
      };
    } catch (err) {
      return klaviyoError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const klaviyoAdapter: SkillAdapter = {
  skillId: 'klaviyo',
  name: 'Klaviyo',
  baseUrl: 'https://a.klaviyo.com/api',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Klaviyo-API-Key',
  },
  defaultHeaders: {
    'revision': '2024-02-15',
  },
  tools: {
    klaviyo_list_profiles: listProfiles,
    klaviyo_create_event: createEvent,
    klaviyo_list_campaigns: listCampaigns,
    klaviyo_list_flows: listFlows,
    klaviyo_get_metrics: getMetrics,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
