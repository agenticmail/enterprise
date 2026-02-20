/**
 * MCP Skill Adapter — Google Analytics (GA4)
 *
 * Maps Google Analytics Data API (v1beta) endpoints to MCP tool handlers.
 * API reference: https://developers.google.com/analytics/devguides/reporting/data/v1
 *
 * Uses OAuth2 with Google provider. Property IDs are passed per-tool.
 *
 * Tools:
 *   - ga_run_report       Run a custom analytics report
 *   - ga_get_realtime     Get realtime active user data
 *   - ga_list_properties  List accessible GA4 properties
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function gaError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error?.message || data.message || err.message;
      const code = data.error?.code ? ` (code ${data.error.code})` : '';
      return { content: `Google Analytics API error: ${msg}${code}`, isError: true };
    }
    return { content: `Google Analytics API error: ${err.message}`, isError: true };
  }
  return { content: `Google Analytics API error: ${String(err)}`, isError: true };
}

/** Format a GA4 dimension/metric header row value. */
function formatDimensionValue(val: any): string {
  return val?.value ?? '(not set)';
}

function formatMetricValue(val: any): string {
  return val?.value ?? '0';
}

// ─── Tool: ga_run_report ────────────────────────────────

const gaRunReport: ToolHandler = {
  description:
    'Run a Google Analytics 4 report for a property. Specify dimensions, metrics, and a date range. Returns tabular report data.',
  inputSchema: {
    type: 'object',
    properties: {
      property_id: {
        type: 'string',
        description: 'GA4 property ID (numeric, e.g. "123456789")',
      },
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Dimension names (e.g. ["city", "deviceCategory"])',
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Metric names (e.g. ["activeUsers", "sessions"])',
      },
      start_date: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD or relative like "7daysAgo")',
      },
      end_date: {
        type: 'string',
        description: 'End date (YYYY-MM-DD or "today")',
      },
      limit: {
        type: 'number',
        description: 'Max rows to return (default 100, max 10000)',
      },
    },
    required: ['property_id', 'metrics', 'start_date', 'end_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        dateRanges: [
          { startDate: params.start_date, endDate: params.end_date },
        ],
        metrics: params.metrics.map((m: string) => ({ name: m })),
        limit: params.limit ?? 100,
      };

      if (params.dimensions && params.dimensions.length > 0) {
        body.dimensions = params.dimensions.map((d: string) => ({ name: d }));
      }

      const data = await ctx.apiExecutor.post(
        `/properties/${params.property_id}:runReport`,
        body,
      );

      const rows: any[] = data.rows ?? [];
      if (rows.length === 0) {
        return {
          content: 'No data returned for the specified report parameters.',
          metadata: { rowCount: 0, propertyId: params.property_id },
        };
      }

      // Build header
      const dimHeaders = (data.dimensionHeaders ?? []).map((h: any) => h.name);
      const metricHeaders = (data.metricHeaders ?? []).map((h: any) => h.name);
      const header = [...dimHeaders, ...metricHeaders].join(' | ');

      // Build rows
      const rowLines = rows.slice(0, 50).map((row: any) => {
        const dims = (row.dimensionValues ?? []).map(formatDimensionValue);
        const mets = (row.metricValues ?? []).map(formatMetricValue);
        return [...dims, ...mets].join(' | ');
      });

      const truncNote = rows.length > 50 ? `\n\n(Showing 50 of ${rows.length} rows)` : '';

      return {
        content: [
          `Report for property ${params.property_id} (${params.start_date} to ${params.end_date}):`,
          '',
          header,
          '-'.repeat(header.length),
          ...rowLines,
          truncNote,
        ].join('\n'),
        metadata: {
          propertyId: params.property_id,
          rowCount: rows.length,
          dimensions: dimHeaders,
          metrics: metricHeaders,
        },
      };
    } catch (err) {
      return gaError(err);
    }
  },
};

// ─── Tool: ga_get_realtime ──────────────────────────────

const gaGetRealtime: ToolHandler = {
  description:
    'Get realtime analytics data for a GA4 property. Shows currently active users and optional dimension breakdowns.',
  inputSchema: {
    type: 'object',
    properties: {
      property_id: {
        type: 'string',
        description: 'GA4 property ID (numeric, e.g. "123456789")',
      },
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Realtime dimensions (e.g. ["country", "unifiedScreenName"])',
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Realtime metrics (default: ["activeUsers"])',
      },
      limit: {
        type: 'number',
        description: 'Max rows to return (default 50)',
      },
    },
    required: ['property_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        metrics: (params.metrics ?? ['activeUsers']).map((m: string) => ({ name: m })),
        limit: params.limit ?? 50,
      };

      if (params.dimensions && params.dimensions.length > 0) {
        body.dimensions = params.dimensions.map((d: string) => ({ name: d }));
      }

      const data = await ctx.apiExecutor.post(
        `/properties/${params.property_id}:runRealtimeReport`,
        body,
      );

      const rows: any[] = data.rows ?? [];
      if (rows.length === 0) {
        return {
          content: `No realtime data available for property ${params.property_id}.`,
          metadata: { rowCount: 0, propertyId: params.property_id },
        };
      }

      const dimHeaders = (data.dimensionHeaders ?? []).map((h: any) => h.name);
      const metricHeaders = (data.metricHeaders ?? []).map((h: any) => h.name);

      const rowLines = rows.map((row: any) => {
        const dims = (row.dimensionValues ?? []).map(formatDimensionValue);
        const mets = (row.metricValues ?? []).map(formatMetricValue);
        return [...dims, ...mets].join(' | ');
      });

      const header = [...dimHeaders, ...metricHeaders].join(' | ');

      return {
        content: [
          `Realtime data for property ${params.property_id}:`,
          '',
          header,
          '-'.repeat(header.length),
          ...rowLines,
        ].join('\n'),
        metadata: {
          propertyId: params.property_id,
          rowCount: rows.length,
        },
      };
    } catch (err) {
      return gaError(err);
    }
  },
};

// ─── Tool: ga_list_properties ───────────────────────────

const gaListProperties: ToolHandler = {
  description:
    'List Google Analytics 4 properties accessible to the authenticated account. Uses the GA Admin API.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Number of properties to return (default 50, max 200)',
      },
      page_token: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        pageSize: String(params.page_size ?? 50),
      };
      if (params.page_token) query.pageToken = params.page_token;

      // The Admin API is at a different base; use full URL override
      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: 'https://analyticsadmin.googleapis.com/v1beta/properties',
        query,
      });

      const properties: any[] = data.properties ?? [];
      if (properties.length === 0) {
        return {
          content: 'No GA4 properties found for this account.',
          metadata: { propertyCount: 0 },
        };
      }

      const lines = properties.map((p: any) => {
        const id = p.name?.replace('properties/', '') ?? 'unknown';
        const displayName = p.displayName ?? '(unnamed)';
        const timeZone = p.timeZone ?? '';
        const industry = p.industryCategory ?? '';
        return `${displayName} (ID: ${id}) — timezone: ${timeZone}${industry ? `, industry: ${industry}` : ''}`;
      });

      return {
        content: `Found ${properties.length} GA4 property/properties:\n\n${lines.join('\n')}`,
        metadata: {
          propertyCount: properties.length,
          nextPageToken: data.nextPageToken ?? null,
        },
      };
    } catch (err) {
      return gaError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const googleAnalyticsAdapter: SkillAdapter = {
  skillId: 'google-analytics',
  name: 'Google Analytics',
  baseUrl: 'https://analyticsdata.googleapis.com/v1beta',
  auth: {
    type: 'oauth2',
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  },
  tools: {
    ga_run_report: gaRunReport,
    ga_get_realtime: gaGetRealtime,
    ga_list_properties: gaListProperties,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
