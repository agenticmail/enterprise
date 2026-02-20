/**
 * MCP Skill Adapter — New Relic
 *
 * Maps New Relic REST and NerdGraph API endpoints to MCP tool handlers.
 * Covers application monitoring, NRQL queries, alerts, and synthetics.
 *
 * New Relic API docs: https://docs.newrelic.com/docs/apis/rest-api-v2/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function nrError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const title = data.error?.title || data.title || '';
      const detail = data.error?.detail || data.detail || err.message;
      const msg = title ? `${title}: ${detail}` : detail;
      return { content: `New Relic API error: ${msg}`, isError: true };
    }
    return { content: `New Relic API error: ${err.message}`, isError: true };
  }
  return { content: `New Relic API error: ${String(err)}`, isError: true };
}

/** Resolve the account ID from skill config. */
function accountId(ctx: ToolExecutionContext): string {
  return ctx.skillConfig.accountId || 'unknown';
}

// ─── Tool: nr_list_applications ─────────────────────────

const listApplications: ToolHandler = {
  description:
    'List New Relic APM applications. Optionally filter by name or health status.',
  inputSchema: {
    type: 'object',
    properties: {
      filter_name: {
        type: 'string',
        description: 'Filter applications by name (substring match)',
      },
      filter_host: {
        type: 'string',
        description: 'Filter applications by host name',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.filter_name) query['filter[name]'] = params.filter_name;
      if (params.filter_host) query['filter[host]'] = params.filter_host;
      if (params.page) query.page = String(params.page);

      const result = await ctx.apiExecutor.get('/applications.json', query);
      const apps: any[] = result.applications || [];

      if (apps.length === 0) {
        return {
          content: 'No applications found.',
          metadata: { appCount: 0 },
        };
      }

      const lines = apps.map((a: any) => {
        const health = a.health_status || 'unknown';
        const reporting = a.reporting ? 'reporting' : 'not reporting';
        const lang = a.language || 'unknown';
        return `• ${a.name} (ID: ${a.id}) — ${health}, ${reporting}, language: ${lang}`;
      });

      return {
        content: `Found ${apps.length} application(s):\n\n${lines.join('\n')}`,
        metadata: { appCount: apps.length },
      };
    } catch (err) {
      return nrError(err);
    }
  },
};

// ─── Tool: nr_get_application ───────────────────────────

const getApplication: ToolHandler = {
  description:
    'Retrieve details of a specific New Relic APM application by ID. Returns health status, throughput, response time, and error rate.',
  inputSchema: {
    type: 'object',
    properties: {
      application_id: {
        type: 'number',
        description: 'The numeric application ID',
      },
    },
    required: ['application_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/applications/${params.application_id}.json`);
      const app = result.application || {};

      const summary = app.application_summary || {};
      const content = [
        `Application: ${app.name} (ID: ${app.id})`,
        `Health: ${app.health_status || 'unknown'}`,
        `Language: ${app.language || 'unknown'}`,
        `Reporting: ${app.reporting ? 'Yes' : 'No'}`,
        `Response time: ${summary.response_time ?? 'N/A'} ms`,
        `Throughput: ${summary.throughput ?? 'N/A'} rpm`,
        `Error rate: ${summary.error_rate ?? 'N/A'}%`,
        `Apdex target: ${summary.apdex_target ?? 'N/A'}`,
        `Apdex score: ${summary.apdex_score ?? 'N/A'}`,
        `Last reported: ${app.last_reported_at || 'unknown'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          applicationId: app.id,
          name: app.name,
          healthStatus: app.health_status,
        },
      };
    } catch (err) {
      return nrError(err);
    }
  },
};

// ─── Tool: nr_query_nrql ────────────────────────────────

const queryNrql: ToolHandler = {
  description:
    'Execute a NRQL query against New Relic Insights. Returns query results as structured data.',
  inputSchema: {
    type: 'object',
    properties: {
      nrql: {
        type: 'string',
        description: 'NRQL query string (e.g. "SELECT count(*) FROM Transaction SINCE 1 hour ago")',
      },
    },
    required: ['nrql'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const acctId = accountId(ctx);
      const query: Record<string, string> = {
        nrql: params.nrql,
      };

      const result = await ctx.apiExecutor.get(
        `/accounts/${acctId}/query`,
        query,
      );

      const results = result.results || [];
      if (results.length === 0) {
        return {
          content: 'NRQL query returned no results.',
          metadata: { resultCount: 0, nrql: params.nrql },
        };
      }

      const formatted = results.map((r: any, idx: number) => {
        const entries = Object.entries(r)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(', ');
        return `  ${idx + 1}. ${entries}`;
      });

      return {
        content: `NRQL: ${params.nrql}\n\n${results.length} result(s):\n${formatted.join('\n')}`,
        metadata: { resultCount: results.length, nrql: params.nrql },
      };
    } catch (err) {
      return nrError(err);
    }
  },
};

// ─── Tool: nr_list_alerts ───────────────────────────────

const listAlerts: ToolHandler = {
  description:
    'List New Relic alert policies. Returns policy names, IDs, and incident preferences.',
  inputSchema: {
    type: 'object',
    properties: {
      filter_name: {
        type: 'string',
        description: 'Filter alert policies by name (exact match)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.filter_name) query['filter[name]'] = params.filter_name;
      if (params.page) query.page = String(params.page);

      const result = await ctx.apiExecutor.get('/alerts_policies.json', query);
      const policies: any[] = result.policies || [];

      if (policies.length === 0) {
        return {
          content: 'No alert policies found.',
          metadata: { policyCount: 0 },
        };
      }

      const lines = policies.map((p: any) => {
        const preference = p.incident_preference || 'unknown';
        const created = p.created_at ? new Date(p.created_at * 1000).toLocaleString() : 'unknown';
        return `• ${p.name} (ID: ${p.id}) — preference: ${preference}, created: ${created}`;
      });

      return {
        content: `Found ${policies.length} alert policy(ies):\n\n${lines.join('\n')}`,
        metadata: { policyCount: policies.length },
      };
    } catch (err) {
      return nrError(err);
    }
  },
};

// ─── Tool: nr_get_synthetics ────────────────────────────

const getSynthetics: ToolHandler = {
  description:
    'List New Relic Synthetics monitors. Returns monitor names, types, statuses, and locations.',
  inputSchema: {
    type: 'object',
    properties: {
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      limit: {
        type: 'number',
        description: 'Number of monitors to return (default 20, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        offset: String(params.offset ?? 0),
        limit: String(params.limit ?? 20),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: 'https://synthetics.newrelic.com/synthetics/api/v3/monitors',
        query,
      });

      const monitors: any[] = result.monitors || [];

      if (monitors.length === 0) {
        return {
          content: 'No Synthetics monitors found.',
          metadata: { monitorCount: 0 },
        };
      }

      const lines = monitors.map((m: any) => {
        const status = m.status || 'unknown';
        const type = m.type || 'unknown';
        const frequency = m.frequency ? `${m.frequency} min` : 'unknown';
        const locations = (m.locations || []).join(', ') || 'none';
        return `• ${m.name} (ID: ${m.id}) — ${type}, status: ${status}, freq: ${frequency}, locations: ${locations}`;
      });

      return {
        content: `Found ${monitors.length} Synthetics monitor(s):\n\n${lines.join('\n')}`,
        metadata: { monitorCount: monitors.length },
      };
    } catch (err) {
      return nrError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const newrelicAdapter: SkillAdapter = {
  skillId: 'newrelic',
  name: 'New Relic',
  baseUrl: 'https://api.newrelic.com/v2',
  auth: {
    type: 'api_key',
    headerName: 'Api-Key',
  },
  tools: {
    nr_list_applications: listApplications,
    nr_get_application: getApplication,
    nr_query_nrql: queryNrql,
    nr_list_alerts: listAlerts,
    nr_get_synthetics: getSynthetics,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    accountId: {
      type: 'string' as const,
      label: 'Account ID',
      description: 'Your New Relic account ID',
      required: true,
      placeholder: '1234567',
    },
  },
};
