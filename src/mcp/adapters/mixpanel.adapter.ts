/**
 * MCP Skill Adapter — Mixpanel
 *
 * Maps Mixpanel API endpoints to MCP tool handlers.
 * API reference: https://developer.mixpanel.com/reference
 *
 * Auth uses Basic auth with the API secret as the username (password is empty).
 *
 * Tools:
 *   - mixpanel_query_events   Query event data with optional filters
 *   - mixpanel_get_funnels    Get funnel analysis data
 *   - mixpanel_get_retention  Get retention analysis data
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
  ResolvedCredentials,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function mixpanelError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      return {
        content: `Mixpanel API error: ${data.error || data.message || err.message}`,
        isError: true,
      };
    }
    return { content: `Mixpanel API error: ${err.message}`, isError: true };
  }
  return { content: `Mixpanel API error: ${String(err)}`, isError: true };
}

/** Format a number with thousands separators. */
function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return 'N/A';
  return n.toLocaleString('en-US');
}

// ─── Tool: mixpanel_query_events ────────────────────────

const mixpanelQueryEvents: ToolHandler = {
  description:
    'Query Mixpanel event data for a given date range. Returns event counts broken down by the specified event names.',
  inputSchema: {
    type: 'object',
    properties: {
      event: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of event names to query (e.g. ["Sign Up", "Purchase"])',
      },
      from_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      to_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      unit: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month'],
        description: 'Time unit for grouping results (default: day)',
      },
    },
    required: ['event', 'from_date', 'to_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        from_date: params.from_date,
        to_date: params.to_date,
        unit: params.unit ?? 'day',
      };
      // Mixpanel expects event as repeated query params or JSON-encoded
      query.event = JSON.stringify(params.event);

      const data = await ctx.apiExecutor.get('/segmentation', query);

      const seriesData = data.data?.values ?? {};
      const eventNames = Object.keys(seriesData);

      if (eventNames.length === 0) {
        return {
          content: 'No event data returned for the specified query.',
          metadata: { eventCount: 0 },
        };
      }

      const lines = eventNames.map((name: string) => {
        const dateValues = seriesData[name] ?? {};
        const dates = Object.keys(dateValues).sort();
        const total = (Object.values(dateValues) as number[]).reduce((sum: number, v) => sum + (Number(v) || 0), 0);
        const lastDate = dates[dates.length - 1];
        const lastValue = dateValues[lastDate] ?? 0;
        return `${name}: total ${formatNumber(total)}, latest (${lastDate}): ${formatNumber(Number(lastValue))}`;
      });

      return {
        content: `Event data from ${params.from_date} to ${params.to_date}:\n\n${lines.join('\n')}`,
        metadata: {
          eventNames,
          fromDate: params.from_date,
          toDate: params.to_date,
        },
      };
    } catch (err) {
      return mixpanelError(err);
    }
  },
};

// ─── Tool: mixpanel_get_funnels ─────────────────────────

const mixpanelGetFunnels: ToolHandler = {
  description:
    'Get funnel analysis data from Mixpanel. Returns step-by-step conversion rates for a specified funnel.',
  inputSchema: {
    type: 'object',
    properties: {
      funnel_id: {
        type: 'number',
        description: 'The numeric ID of the funnel to retrieve',
      },
      from_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      to_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      unit: {
        type: 'string',
        enum: ['day', 'week', 'month'],
        description: 'Time unit for grouping (default: day)',
      },
    },
    required: ['funnel_id', 'from_date', 'to_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        funnel_id: String(params.funnel_id),
        from_date: params.from_date,
        to_date: params.to_date,
      };
      if (params.unit) query.unit = params.unit;

      const data = await ctx.apiExecutor.get('/funnels', query);

      const meta = data.meta ?? {};
      const funnelData = data.data ?? {};
      const dates = Object.keys(funnelData).sort();

      if (dates.length === 0) {
        return {
          content: 'No funnel data returned for the specified parameters.',
          metadata: { funnelId: params.funnel_id },
        };
      }

      // Use the most recent date's steps for the summary
      const latestDate = dates[dates.length - 1];
      const steps: any[] = funnelData[latestDate]?.steps ?? [];

      const stepLines = steps.map((step: any, i: number) => {
        const count = formatNumber(step.count);
        const rate = step.step_conv_ratio != null
          ? (step.step_conv_ratio * 100).toFixed(1) + '%'
          : 'N/A';
        const overallRate = step.overall_conv_ratio != null
          ? (step.overall_conv_ratio * 100).toFixed(1) + '%'
          : 'N/A';
        return `  Step ${i + 1}: ${step.event ?? 'unknown'} — ${count} users, step conversion: ${rate}, overall: ${overallRate}`;
      });

      return {
        content: [
          `Funnel ${params.funnel_id} (${params.from_date} to ${params.to_date})`,
          `Data points: ${dates.length}`,
          `Latest breakdown (${latestDate}):`,
          ...stepLines,
        ].join('\n'),
        metadata: {
          funnelId: params.funnel_id,
          dateCount: dates.length,
          stepCount: steps.length,
        },
      };
    } catch (err) {
      return mixpanelError(err);
    }
  },
};

// ─── Tool: mixpanel_get_retention ───────────────────────

const mixpanelGetRetention: ToolHandler = {
  description:
    'Get retention analysis data from Mixpanel. Shows how many users return after their first event over a specified period.',
  inputSchema: {
    type: 'object',
    properties: {
      from_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      to_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      born_event: {
        type: 'string',
        description: 'The initial event that defines the cohort (e.g. "Sign Up")',
      },
      event: {
        type: 'string',
        description: 'The return event to measure retention for (e.g. "App Open")',
      },
      retention_type: {
        type: 'string',
        enum: ['birth', 'compounded'],
        description: 'Retention type: "birth" (default) or "compounded"',
      },
      unit: {
        type: 'string',
        enum: ['day', 'week', 'month'],
        description: 'Time unit for retention periods (default: day)',
      },
    },
    required: ['from_date', 'to_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        from_date: params.from_date,
        to_date: params.to_date,
      };
      if (params.born_event) query.born_event = params.born_event;
      if (params.event) query.event = params.event;
      if (params.retention_type) query.retention_type = params.retention_type;
      if (params.unit) query.unit = params.unit;

      const data = await ctx.apiExecutor.get('/retention', query);

      const results: any[] = data.results ?? [];
      if (results.length === 0) {
        return {
          content: 'No retention data returned for the specified parameters.',
          metadata: { cohortCount: 0 },
        };
      }

      const lines = results.slice(0, 15).map((cohort: any) => {
        const date = cohort.date ?? 'unknown';
        const first = cohort.first ?? 0;
        const counts: number[] = cohort.counts ?? [];
        const retentionRates = counts.map((c: number) =>
          first > 0 ? ((c / first) * 100).toFixed(1) + '%' : '0%',
        );
        return `${date}: ${formatNumber(first)} users — retention: ${retentionRates.join(', ')}`;
      });

      const truncNote = results.length > 15 ? `\n\n(Showing 15 of ${results.length} cohorts)` : '';

      return {
        content: `Retention data (${params.from_date} to ${params.to_date}):\n\n${lines.join('\n')}${truncNote}`,
        metadata: {
          cohortCount: results.length,
          fromDate: params.from_date,
          toDate: params.to_date,
        },
      };
    } catch (err) {
      return mixpanelError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const mixpanelAdapter: SkillAdapter = {
  skillId: 'mixpanel-analytics',
  name: 'Mixpanel',
  baseUrl: 'https://mixpanel.com/api/2.0',
  auth: {
    type: 'credentials',
    fields: ['projectToken', 'apiSecret'],
  },
  tools: {
    mixpanel_query_events: mixpanelQueryEvents,
    mixpanel_get_funnels: mixpanelGetFunnels,
    mixpanel_get_retention: mixpanelGetRetention,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },

  async initialize(credentials: ResolvedCredentials): Promise<void> {
    const apiSecret = credentials.fields?.apiSecret;
    if (!apiSecret) {
      throw new Error('Mixpanel credentials require an apiSecret field');
    }
    // Mixpanel uses Basic auth with apiSecret as username and empty password
    const encoded = Buffer.from(`${apiSecret}:`).toString('base64');
    mixpanelAdapter.defaultHeaders = {
      Authorization: `Basic ${encoded}`,
    };
  },
};
