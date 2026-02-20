/**
 * MCP Skill Adapter — Grafana
 *
 * Maps Grafana HTTP API endpoints to MCP tool handlers.
 * Covers dashboard browsing, alert listing, datasource listing, and search.
 *
 * The Grafana instance URL is dynamic, resolved from ctx.skillConfig.instanceUrl.
 *
 * Grafana HTTP API docs: https://grafana.com/docs/grafana/latest/developers/http_api/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Grafana instance base URL from skill config. */
function grafanaUrl(ctx: ToolExecutionContext): string {
  return (
    ctx.skillConfig.instanceUrl || 'https://grafana.example.com'
  ).replace(/\/$/, '');
}

function grafanaError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.error || err.message;
      return { content: `Grafana API error: ${message}`, isError: true };
    }
    return { content: `Grafana API error: ${err.message}`, isError: true };
  }
  return { content: `Grafana API error: ${String(err)}`, isError: true };
}

// ─── Tool: grafana_list_dashboards ──────────────────────

const listDashboards: ToolHandler = {
  description:
    'List Grafana dashboards. Optionally filter by folder ID or tag. Returns dashboard titles, UIDs, and URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'number',
        description: 'Filter dashboards by folder ID',
      },
      tag: {
        type: 'string',
        description: 'Filter dashboards by tag',
      },
      type: {
        type: 'string',
        enum: ['dash-db', 'dash-folder'],
        description: 'Filter by type (default: "dash-db")',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default 25)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = grafanaUrl(ctx);
      const query: Record<string, string> = {
        type: params.type || 'dash-db',
        limit: String(params.limit ?? 25),
      };
      if (params.folder_id) query.folderIds = String(params.folder_id);
      if (params.tag) query.tag = params.tag;

      const dashboards: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/api/search`,
        query,
      });

      if (!Array.isArray(dashboards) || dashboards.length === 0) {
        return {
          content: 'No dashboards found.',
          metadata: { dashboardCount: 0 },
        };
      }

      const lines = dashboards.map((d: any) => {
        const tags = (d.tags || []).join(', ') || 'no tags';
        return `• ${d.title} (UID: ${d.uid}) — folder: ${d.folderTitle || 'General'}, tags: ${tags}`;
      });

      return {
        content: `Found ${dashboards.length} dashboard(s):\n\n${lines.join('\n')}`,
        metadata: { dashboardCount: dashboards.length },
      };
    } catch (err) {
      return grafanaError(err);
    }
  },
};

// ─── Tool: grafana_get_dashboard ────────────────────────

const getDashboard: ToolHandler = {
  description:
    'Retrieve a specific Grafana dashboard by UID. Returns dashboard title, panels, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'The dashboard UID',
      },
    },
    required: ['uid'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = grafanaUrl(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/api/dashboards/uid/${params.uid}`,
      });

      const dash = result.dashboard || {};
      const meta = result.meta || {};
      const panels: any[] = dash.panels || [];

      const panelList = panels.map((p: any) => {
        return `  - ${p.title || 'Untitled'} (type: ${p.type || 'unknown'}, ID: ${p.id})`;
      });

      const content = [
        `Dashboard: ${dash.title || 'Untitled'} (UID: ${dash.uid})`,
        `Folder: ${meta.folderTitle || 'General'}`,
        `Created by: ${meta.createdBy || 'unknown'}`,
        `Updated: ${meta.updated || 'unknown'}`,
        `Version: ${dash.version || 0}`,
        `Tags: ${(dash.tags || []).join(', ') || 'none'}`,
        `Panels (${panels.length}):`,
        ...panelList,
      ].join('\n');

      return {
        content,
        metadata: {
          uid: dash.uid,
          title: dash.title,
          panelCount: panels.length,
        },
      };
    } catch (err) {
      return grafanaError(err);
    }
  },
};

// ─── Tool: grafana_list_alerts ──────────────────────────

const listAlerts: ToolHandler = {
  description:
    'List Grafana alert rules. Returns alert names, states, and associated dashboards.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['all', 'no_data', 'paused', 'alerting', 'ok', 'pending'],
        description: 'Filter by alert state (default: "all")',
      },
      dashboard_id: {
        type: 'number',
        description: 'Filter alerts by dashboard ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of alerts to return (default 25)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = grafanaUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.state && params.state !== 'all') query.state = params.state;
      if (params.dashboard_id) query.dashboardId = String(params.dashboard_id);

      const alerts: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/api/alerts`,
        query,
      });

      if (!Array.isArray(alerts) || alerts.length === 0) {
        return {
          content: 'No alerts found.',
          metadata: { alertCount: 0 },
        };
      }

      const lines = alerts.map((a: any) => {
        const state = (a.state || 'unknown').toUpperCase();
        const dashboard = a.dashboardSlug || 'unknown';
        return `[${state}] ${a.name} (ID: ${a.id}) — dashboard: ${dashboard}, panel: ${a.panelId || 'N/A'}`;
      });

      return {
        content: `Found ${alerts.length} alert(s):\n\n${lines.join('\n')}`,
        metadata: { alertCount: alerts.length },
      };
    } catch (err) {
      return grafanaError(err);
    }
  },
};

// ─── Tool: grafana_list_datasources ─────────────────────

const listDatasources: ToolHandler = {
  description:
    'List all Grafana datasources. Returns datasource names, types, and connection details.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = grafanaUrl(ctx);
      const datasources: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/api/datasources`,
      });

      if (!Array.isArray(datasources) || datasources.length === 0) {
        return {
          content: 'No datasources configured.',
          metadata: { datasourceCount: 0 },
        };
      }

      const lines = datasources.map((ds: any) => {
        const isDefault = ds.isDefault ? ' [DEFAULT]' : '';
        return `• ${ds.name} (ID: ${ds.id}) — type: ${ds.type}, url: ${ds.url || 'N/A'}${isDefault}`;
      });

      return {
        content: `Found ${datasources.length} datasource(s):\n\n${lines.join('\n')}`,
        metadata: { datasourceCount: datasources.length },
      };
    } catch (err) {
      return grafanaError(err);
    }
  },
};

// ─── Tool: grafana_search ───────────────────────────────

const grafanaSearch: ToolHandler = {
  description:
    'Search Grafana for dashboards and folders by query string. Returns matching items with types and UIDs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      tag: {
        type: 'string',
        description: 'Filter by tag',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default 25)',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = grafanaUrl(ctx);
      const query: Record<string, string> = {
        query: params.query,
        limit: String(params.limit ?? 25),
      };
      if (params.tag) query.tag = params.tag;

      const results: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/api/search`,
        query,
      });

      if (!Array.isArray(results) || results.length === 0) {
        return {
          content: `No results found for "${params.query}".`,
          metadata: { resultCount: 0, query: params.query },
        };
      }

      const lines = results.map((r: any) => {
        const type = r.type === 'dash-folder' ? 'FOLDER' : 'DASHBOARD';
        const tags = (r.tags || []).join(', ') || 'no tags';
        return `[${type}] ${r.title} (UID: ${r.uid}) — tags: ${tags}`;
      });

      return {
        content: `Found ${results.length} result(s) for "${params.query}":\n\n${lines.join('\n')}`,
        metadata: { resultCount: results.length, query: params.query },
      };
    } catch (err) {
      return grafanaError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const grafanaAdapter: SkillAdapter = {
  skillId: 'grafana',
  name: 'Grafana',
  // Base URL is dynamic from ctx.skillConfig.instanceUrl; tools use full URLs
  baseUrl: 'https://grafana.example.com/api',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    grafana_list_dashboards: listDashboards,
    grafana_get_dashboard: getDashboard,
    grafana_list_alerts: listAlerts,
    grafana_list_datasources: listDatasources,
    grafana_search: grafanaSearch,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    instanceUrl: {
      type: 'string' as const,
      label: 'Grafana URL',
      description: 'Your Grafana instance URL',
      required: true,
      placeholder: 'https://grafana.example.com',
    },
  },
};
