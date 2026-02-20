/**
 * MCP Skill Adapter — Splunk
 *
 * Maps Splunk REST API endpoints to MCP tool handlers.
 * Covers search jobs, saved searches, search results, indexes, and alert creation.
 *
 * The Splunk instance URL is dynamic, resolved from ctx.skillConfig.instanceUrl.
 *
 * Splunk REST API docs: https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTprolog
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Splunk instance base URL from skill config. */
function splunkUrl(ctx: ToolExecutionContext): string {
  return (
    ctx.skillConfig.instanceUrl || 'https://localhost:8089'
  ).replace(/\/$/, '');
}

function splunkError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const messages: any[] = data.messages || [];
      if (messages.length > 0) {
        const details = messages.map((m: any) => `[${m.type}] ${m.text}`).join('; ');
        return { content: `Splunk API error: ${details}`, isError: true };
      }
      return { content: `Splunk API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Splunk API error: ${err.message}`, isError: true };
  }
  return { content: `Splunk API error: ${String(err)}`, isError: true };
}

// ─── Tool: splunk_search ────────────────────────────────

const splunkSearch: ToolHandler = {
  description:
    'Create and run a Splunk search job. Provide an SPL query and optional time range. Returns the search job ID for result retrieval.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'SPL search query (e.g. "search index=main error | head 10")',
      },
      earliest_time: {
        type: 'string',
        description: 'Earliest time for the search (e.g. "-1h", "-24h@h", "2024-01-01T00:00:00")',
      },
      latest_time: {
        type: 'string',
        description: 'Latest time for the search (e.g. "now", "-1h")',
      },
      max_count: {
        type: 'number',
        description: 'Maximum number of results to return (default 100)',
      },
    },
    required: ['search'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = splunkUrl(ctx);
      const body: Record<string, any> = {
        search: params.search.startsWith('search ') ? params.search : `search ${params.search}`,
        output_mode: 'json',
        max_count: params.max_count ?? 100,
      };
      if (params.earliest_time) body.earliest_time = params.earliest_time;
      if (params.latest_time) body.latest_time = params.latest_time;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/services/search/jobs`,
        body,
      });

      const sid = result.sid || result.entry?.[0]?.content?.sid || 'unknown';

      return {
        content: `Search job created with SID: ${sid}\nQuery: ${params.search}\nUse splunk_get_search_results to retrieve results once the job completes.`,
        metadata: {
          sid,
          search: params.search,
        },
      };
    } catch (err) {
      return splunkError(err);
    }
  },
};

// ─── Tool: splunk_list_saved_searches ───────────────────

const listSavedSearches: ToolHandler = {
  description:
    'List saved searches in Splunk. Returns search names, schedules, and next run times.',
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Maximum number of saved searches to return (default 20)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      search: {
        type: 'string',
        description: 'Filter saved searches by name (substring match)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = splunkUrl(ctx);
      const query: Record<string, string> = {
        output_mode: 'json',
        count: String(params.count ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.search) query.search = params.search;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/services/saved/searches`,
        query,
      });

      const entries: any[] = result.entry || [];

      if (entries.length === 0) {
        return {
          content: 'No saved searches found.',
          metadata: { searchCount: 0 },
        };
      }

      const lines = entries.map((e: any) => {
        const name = e.name || 'unknown';
        const content = e.content || {};
        const scheduled = content.is_scheduled ? 'scheduled' : 'not scheduled';
        const cron = content.cron_schedule || 'N/A';
        const disabled = content.disabled ? ' [DISABLED]' : '';
        return `• ${name} — ${scheduled}, cron: ${cron}${disabled}`;
      });

      return {
        content: `Found ${entries.length} saved search(es):\n\n${lines.join('\n')}`,
        metadata: { searchCount: entries.length },
      };
    } catch (err) {
      return splunkError(err);
    }
  },
};

// ─── Tool: splunk_get_search_results ────────────────────

const getSearchResults: ToolHandler = {
  description:
    'Retrieve results of a completed Splunk search job by its SID. Returns result rows with field values.',
  inputSchema: {
    type: 'object',
    properties: {
      sid: {
        type: 'string',
        description: 'Search job ID (SID) returned by splunk_search',
      },
      count: {
        type: 'number',
        description: 'Maximum number of results to retrieve (default 50)',
      },
      offset: {
        type: 'number',
        description: 'Result offset for pagination (default 0)',
      },
    },
    required: ['sid'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = splunkUrl(ctx);
      const query: Record<string, string> = {
        output_mode: 'json',
        count: String(params.count ?? 50),
        offset: String(params.offset ?? 0),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/services/search/jobs/${params.sid}/results`,
        query,
      });

      const rows: any[] = result.results || [];

      if (rows.length === 0) {
        return {
          content: `No results found for search job ${params.sid}. The job may still be running — try again shortly.`,
          metadata: { resultCount: 0, sid: params.sid },
        };
      }

      const lines = rows.map((row: any, idx: number) => {
        const fields = Object.entries(row)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        return `  ${idx + 1}. ${fields}`;
      });

      return {
        content: `Search job ${params.sid} — ${rows.length} result(s):\n\n${lines.join('\n')}`,
        metadata: { resultCount: rows.length, sid: params.sid },
      };
    } catch (err) {
      return splunkError(err);
    }
  },
};

// ─── Tool: splunk_list_indexes ──────────────────────────

const listIndexes: ToolHandler = {
  description:
    'List Splunk indexes. Returns index names, sizes, event counts, and data models.',
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Maximum number of indexes to return (default 30)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = splunkUrl(ctx);
      const query: Record<string, string> = {
        output_mode: 'json',
        count: String(params.count ?? 30),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/services/data/indexes`,
        query,
      });

      const entries: any[] = result.entry || [];

      if (entries.length === 0) {
        return {
          content: 'No indexes found.',
          metadata: { indexCount: 0 },
        };
      }

      const lines = entries.map((e: any) => {
        const name = e.name || 'unknown';
        const content = e.content || {};
        const totalEventCount = content.totalEventCount || 0;
        const currentDBSizeMB = content.currentDBSizeMB || 0;
        const disabled = content.disabled ? ' [DISABLED]' : '';
        return `• ${name} — events: ${totalEventCount}, size: ${currentDBSizeMB} MB${disabled}`;
      });

      return {
        content: `Found ${entries.length} index(es):\n\n${lines.join('\n')}`,
        metadata: { indexCount: entries.length },
      };
    } catch (err) {
      return splunkError(err);
    }
  },
};

// ─── Tool: splunk_create_alert ──────────────────────────

const createAlert: ToolHandler = {
  description:
    'Create a new Splunk saved search configured as an alert. Specify the search query, schedule, and alert conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the alert / saved search',
      },
      search: {
        type: 'string',
        description: 'SPL search query for the alert',
      },
      cron_schedule: {
        type: 'string',
        description: 'Cron schedule for the alert (e.g. "*/5 * * * *")',
      },
      alert_type: {
        type: 'string',
        enum: ['number of events', 'number of hosts', 'number of sources'],
        description: 'Type of alert condition (default: "number of events")',
      },
      alert_threshold: {
        type: 'number',
        description: 'Threshold value that triggers the alert (default 0)',
      },
      alert_comparator: {
        type: 'string',
        enum: ['greater than', 'less than', 'equal to', 'not equal to'],
        description: 'Comparison operator for the threshold (default: "greater than")',
      },
    },
    required: ['name', 'search', 'cron_schedule'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = splunkUrl(ctx);
      const body: Record<string, any> = {
        name: params.name,
        search: params.search,
        cron_schedule: params.cron_schedule,
        is_scheduled: true,
        alert_type: params.alert_type || 'number of events',
        alert_threshold: String(params.alert_threshold ?? 0),
        alert_comparator: params.alert_comparator || 'greater than',
        'alert.suppress': false,
        output_mode: 'json',
      };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/services/saved/searches`,
        body,
      });

      const entry = result.entry?.[0] || {};
      const alertName = entry.name || params.name;

      return {
        content: `Alert "${alertName}" created successfully.\nSearch: ${params.search}\nSchedule: ${params.cron_schedule}`,
        metadata: {
          name: alertName,
          search: params.search,
          cronSchedule: params.cron_schedule,
        },
      };
    } catch (err) {
      return splunkError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const splunkAdapter: SkillAdapter = {
  skillId: 'splunk',
  name: 'Splunk',
  // Base URL is dynamic from ctx.skillConfig.instanceUrl; tools use full URLs
  baseUrl: 'https://localhost:8089/services',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    splunk_search: splunkSearch,
    splunk_list_saved_searches: listSavedSearches,
    splunk_get_search_results: getSearchResults,
    splunk_list_indexes: listIndexes,
    splunk_create_alert: createAlert,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
  configSchema: {
    instanceUrl: {
      type: 'string' as const,
      label: 'Splunk Instance URL',
      description: 'Your Splunk instance management URL (including port)',
      required: true,
      placeholder: 'https://splunk.example.com:8089',
    },
  },
};
