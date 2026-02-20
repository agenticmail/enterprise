/**
 * MCP Skill Adapter — Datadog
 *
 * Maps Datadog REST API endpoints to MCP tool handlers.
 * API reference: https://docs.datadoghq.com/api/latest/
 *
 * Auth uses API key + Application key sent as custom headers.
 *
 * Tools:
 *   - datadog_list_monitors   List monitors with optional filters
 *   - datadog_get_monitor     Retrieve a single monitor by ID
 *   - datadog_query_metrics   Query timeseries metric data
 *   - datadog_list_events     List events from the event stream
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
  ResolvedCredentials,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function datadogError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors = Array.isArray(data.errors) ? data.errors.join('; ') : '';
      return {
        content: `Datadog API error: ${errors || data.message || err.message}`,
        isError: true,
      };
    }
    return { content: `Datadog API error: ${err.message}`, isError: true };
  }
  return { content: `Datadog API error: ${String(err)}`, isError: true };
}

/** Format a Unix timestamp (seconds) into a readable date. */
function fromUnix(ts: number | undefined): string {
  if (!ts) return 'unknown';
  return new Date(ts * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Map Datadog monitor overall_state to a readable label. */
function monitorStateLabel(state: string | undefined): string {
  switch (state) {
    case 'OK': return 'OK';
    case 'Alert': return 'ALERT';
    case 'Warn': return 'WARNING';
    case 'No Data': return 'NO DATA';
    default: return state ?? 'unknown';
  }
}

// ─── Tool: datadog_list_monitors ────────────────────────

const datadogListMonitors: ToolHandler = {
  description:
    'List Datadog monitors. Optionally filter by name, tags, or monitor type. Returns monitor names, states, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Filter monitors by name (substring match)',
      },
      tags: {
        type: 'string',
        description: 'Comma-separated list of tags to filter by (e.g. "env:prod,team:backend")',
      },
      monitor_tags: {
        type: 'string',
        description: 'Comma-separated list of monitor tags to filter by',
      },
      page_size: {
        type: 'number',
        description: 'Number of monitors to return (default 20, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (0-indexed)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page_size: String(params.page_size ?? 20),
        page: String(params.page ?? 0),
      };
      if (params.name) query.name = params.name;
      if (params.tags) query.tags = params.tags;
      if (params.monitor_tags) query.monitor_tags = params.monitor_tags;

      const monitors: any[] = await ctx.apiExecutor.get('/api/v1/monitor', query);

      if (!Array.isArray(monitors) || monitors.length === 0) {
        return {
          content: 'No monitors found.',
          metadata: { monitorCount: 0 },
        };
      }

      const lines = monitors.map((m: any) => {
        const state = monitorStateLabel(m.overall_state);
        const tags = (m.tags ?? []).join(', ') || 'no tags';
        return `[${state}] ${m.name} (ID: ${m.id}) — type: ${m.type}, tags: ${tags}`;
      });

      return {
        content: `Found ${monitors.length} monitor(s):\n\n${lines.join('\n')}`,
        metadata: {
          monitorCount: monitors.length,
        },
      };
    } catch (err) {
      return datadogError(err);
    }
  },
};

// ─── Tool: datadog_get_monitor ──────────────────────────

const datadogGetMonitor: ToolHandler = {
  description:
    'Retrieve details of a specific Datadog monitor by its ID. Returns the monitor name, query, state, and configuration.',
  inputSchema: {
    type: 'object',
    properties: {
      monitor_id: {
        type: 'number',
        description: 'The numeric ID of the monitor to retrieve',
      },
    },
    required: ['monitor_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const monitor = await ctx.apiExecutor.get(`/api/v1/monitor/${params.monitor_id}`);

      const state = monitorStateLabel(monitor.overall_state);
      const tags = (monitor.tags ?? []).join(', ') || 'none';
      const created = monitor.created ? new Date(monitor.created).toLocaleString() : 'unknown';
      const modified = monitor.modified ? new Date(monitor.modified).toLocaleString() : 'unknown';

      const content = [
        `Monitor: ${monitor.name} (ID: ${monitor.id})`,
        `State: ${state}`,
        `Type: ${monitor.type}`,
        `Query: ${monitor.query}`,
        `Message: ${monitor.message || '(none)'}`,
        `Tags: ${tags}`,
        `Created: ${created}`,
        `Modified: ${modified}`,
      ].join('\n');

      return {
        content,
        metadata: {
          monitorId: monitor.id,
          name: monitor.name,
          state: monitor.overall_state,
          type: monitor.type,
        },
      };
    } catch (err) {
      return datadogError(err);
    }
  },
};

// ─── Tool: datadog_query_metrics ────────────────────────

const datadogQueryMetrics: ToolHandler = {
  description:
    'Query Datadog timeseries metric data. Provide a metric query string and a time range. Returns datapoints with timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Datadog metric query (e.g. "avg:system.cpu.user{env:prod}")',
      },
      from: {
        type: 'number',
        description: 'Start time as a Unix epoch timestamp (seconds)',
      },
      to: {
        type: 'number',
        description: 'End time as a Unix epoch timestamp (seconds)',
      },
    },
    required: ['query', 'from', 'to'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        query: params.query,
        from: String(params.from),
        to: String(params.to),
      };

      const data = await ctx.apiExecutor.get('/api/v1/query', query);

      const series: any[] = data.series ?? [];
      if (series.length === 0) {
        return {
          content: 'No metric data returned for the given query and time range.',
          metadata: { seriesCount: 0 },
        };
      }

      const lines = series.map((s: any) => {
        const scope = s.scope ?? 'unknown';
        const pointCount = s.pointlist?.length ?? 0;
        const lastPoint = s.pointlist?.[s.pointlist.length - 1];
        const lastValue = lastPoint ? lastPoint[1]?.toFixed(4) : 'N/A';
        const lastTime = lastPoint ? fromUnix(lastPoint[0] / 1000) : 'N/A';
        return `${s.metric} {${scope}} — ${pointCount} points, latest: ${lastValue} at ${lastTime}`;
      });

      return {
        content: `Query: ${params.query}\nTime range: ${fromUnix(params.from)} to ${fromUnix(params.to)}\n\n${series.length} series returned:\n${lines.join('\n')}`,
        metadata: {
          seriesCount: series.length,
          query: params.query,
          from: params.from,
          to: params.to,
        },
      };
    } catch (err) {
      return datadogError(err);
    }
  },
};

// ─── Tool: datadog_list_events ──────────────────────────

const datadogListEvents: ToolHandler = {
  description:
    'List events from the Datadog event stream. Filter by time range, priority, or tags.',
  inputSchema: {
    type: 'object',
    properties: {
      start: {
        type: 'number',
        description: 'Start time as a Unix epoch timestamp (seconds)',
      },
      end: {
        type: 'number',
        description: 'End time as a Unix epoch timestamp (seconds)',
      },
      priority: {
        type: 'string',
        enum: ['normal', 'low'],
        description: 'Filter by event priority (optional)',
      },
      tags: {
        type: 'string',
        description: 'Comma-separated tags to filter events (e.g. "env:prod,service:web")',
      },
      page_size: {
        type: 'number',
        description: 'Number of events to return (default 20)',
      },
    },
    required: ['start', 'end'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        start: String(params.start),
        end: String(params.end),
      };
      if (params.priority) query.priority = params.priority;
      if (params.tags) query.tags = params.tags;

      const data = await ctx.apiExecutor.get('/api/v1/events', query);

      const events: any[] = data.events ?? [];
      if (events.length === 0) {
        return {
          content: 'No events found in the specified time range.',
          metadata: { eventCount: 0 },
        };
      }

      const limited = events.slice(0, params.page_size ?? 20);
      const lines = limited.map((e: any) => {
        const date = fromUnix(e.date_happened);
        const priority = e.priority ?? 'normal';
        const tags = (e.tags ?? []).join(', ') || 'no tags';
        return `[${priority}] ${e.title} (${date}) — tags: ${tags}`;
      });

      return {
        content: `Found ${events.length} event(s):\n\n${lines.join('\n')}`,
        metadata: {
          eventCount: events.length,
          displayedCount: limited.length,
        },
      };
    } catch (err) {
      return datadogError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const datadogAdapter: SkillAdapter = {
  skillId: 'datadog-monitoring',
  name: 'Datadog',
  baseUrl: 'https://api.datadoghq.com',
  auth: {
    type: 'credentials',
    fields: ['apiKey', 'applicationKey'],
  },
  tools: {
    datadog_list_monitors: datadogListMonitors,
    datadog_get_monitor: datadogGetMonitor,
    datadog_query_metrics: datadogQueryMetrics,
    datadog_list_events: datadogListEvents,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
  configSchema: {
    site: {
      type: 'select' as const,
      label: 'Datadog Site',
      description: 'Your Datadog site region',
      required: true,
      default: 'datadoghq.com',
      options: [
        { label: 'US1 (datadoghq.com)', value: 'datadoghq.com' },
        { label: 'US3 (us3.datadoghq.com)', value: 'us3.datadoghq.com' },
        { label: 'US5 (us5.datadoghq.com)', value: 'us5.datadoghq.com' },
        { label: 'EU (datadoghq.eu)', value: 'datadoghq.eu' },
      ],
    },
  },

  async initialize(credentials: ResolvedCredentials): Promise<void> {
    const apiKey = credentials.fields?.apiKey;
    const appKey = credentials.fields?.applicationKey;
    if (!apiKey || !appKey) {
      throw new Error('Datadog credentials require apiKey and applicationKey fields');
    }
    datadogAdapter.defaultHeaders = {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
    };
  },
};
