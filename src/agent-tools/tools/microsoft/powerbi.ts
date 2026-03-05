/**
 * Microsoft Power BI Tools
 *
 * Reports, dashboards, datasets, and data refresh via Power BI REST API.
 * Uses Microsoft Graph API + Power BI API endpoints.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';

const PBI_BASE = 'https://api.powerbi.com/v1.0/myorg';

async function pbi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const method = opts?.method || 'GET';
  const url = new URL(PBI_BASE + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Power BI API ${res.status}: ${err}`);
  }
  if (res.status === 200 || res.status === 201) return res.json().catch(() => ({}));
  return {};
}

export function createPowerBITools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'powerbi_list_workspaces',
      description: 'List Power BI workspaces (groups) the agent has access to.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await pbi(token, '/groups');
          const workspaces = (data.value || []).map((w: any) => ({
            id: w.id, name: w.name, isOnDedicatedCapacity: w.isOnDedicatedCapacity,
            type: w.type,
          }));
          return jsonResult({ workspaces, count: workspaces.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_list_reports',
      description: 'List reports in a Power BI workspace.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          workspaceId: { type: 'string', description: 'Workspace (group) ID. Omit for "My Workspace".' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/reports`
            : '/reports';
          const data = await pbi(token, path);
          const reports = (data.value || []).map((r: any) => ({
            id: r.id, name: r.name, datasetId: r.datasetId,
            webUrl: r.webUrl, embedUrl: r.embedUrl,
            reportType: r.reportType,
          }));
          return jsonResult({ reports, count: reports.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_list_dashboards',
      description: 'List dashboards in a Power BI workspace.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID. Omit for "My Workspace".' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/dashboards`
            : '/dashboards';
          const data = await pbi(token, path);
          const dashboards = (data.value || []).map((d: any) => ({
            id: d.id, displayName: d.displayName,
            webUrl: d.webUrl, embedUrl: d.embedUrl,
            isReadOnly: d.isReadOnly,
          }));
          return jsonResult({ dashboards, count: dashboards.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_list_datasets',
      description: 'List datasets in a Power BI workspace.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID. Omit for "My Workspace".' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/datasets`
            : '/datasets';
          const data = await pbi(token, path);
          const datasets = (data.value || []).map((d: any) => ({
            id: d.id, name: d.name,
            configuredBy: d.configuredBy,
            isRefreshable: d.isRefreshable,
            isOnPremGatewayRequired: d.isOnPremGatewayRequired,
            webUrl: d.webUrl,
          }));
          return jsonResult({ datasets, count: datasets.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_refresh_dataset',
      description: 'Trigger a data refresh on a Power BI dataset.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          datasetId: { type: 'string', description: 'Dataset ID to refresh' },
          workspaceId: { type: 'string', description: 'Workspace ID (omit for My Workspace)' },
          notifyOption: { type: 'string', description: 'NoNotification, MailOnFailure, or MailOnCompletion (default: NoNotification)' },
        },
        required: ['datasetId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/datasets/${params.datasetId}/refreshes`
            : `/datasets/${params.datasetId}/refreshes`;
          await pbi(token, path, {
            method: 'POST',
            body: { notifyOption: params.notifyOption || 'NoNotification' },
          });
          return jsonResult({ refreshTriggered: true, datasetId: params.datasetId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_refresh_history',
      description: 'Get refresh history for a dataset.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          datasetId: { type: 'string', description: 'Dataset ID' },
          workspaceId: { type: 'string', description: 'Workspace ID' },
          maxResults: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['datasetId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/datasets/${params.datasetId}/refreshes`
            : `/datasets/${params.datasetId}/refreshes`;
          const data = await pbi(token, path, {
            query: { '$top': String(params.maxResults || 10) }
          });
          const history = (data.value || []).map((r: any) => ({
            id: r.requestId, refreshType: r.refreshType,
            status: r.status, startTime: r.startTime, endTime: r.endTime,
            serviceExceptionJson: r.serviceExceptionJson,
          }));
          return jsonResult({ refreshHistory: history, count: history.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_execute_query',
      description: 'Execute a DAX query against a Power BI dataset. Returns tabular results.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          datasetId: { type: 'string', description: 'Dataset ID' },
          workspaceId: { type: 'string', description: 'Workspace ID' },
          query: { type: 'string', description: 'DAX query (e.g., "EVALUATE TOPN(10, \'Sales\', \'Sales\'[Amount], DESC)")' },
        },
        required: ['datasetId', 'query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/datasets/${params.datasetId}/executeQueries`
            : `/datasets/${params.datasetId}/executeQueries`;
          const data = await pbi(token, path, {
            method: 'POST',
            body: {
              queries: [{ query: params.query }],
              serializerSettings: { includeNulls: true },
            },
          });
          const result = data.results?.[0];
          const tables = result?.tables?.[0];
          return jsonResult({
            columns: tables?.columns?.map((c: any) => c.name),
            rows: tables?.rows,
            rowCount: tables?.rows?.length || 0,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerbi_dashboard_tiles',
      description: 'List tiles (widgets) on a Power BI dashboard.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          dashboardId: { type: 'string', description: 'Dashboard ID' },
          workspaceId: { type: 'string', description: 'Workspace ID' },
        },
        required: ['dashboardId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.workspaceId
            ? `/groups/${params.workspaceId}/dashboards/${params.dashboardId}/tiles`
            : `/dashboards/${params.dashboardId}/tiles`;
          const data = await pbi(token, path);
          const tiles = (data.value || []).map((t: any) => ({
            id: t.id, title: t.title,
            reportId: t.reportId, datasetId: t.datasetId,
            embedUrl: t.embedUrl,
            rowSpan: t.rowSpan, colSpan: t.colSpan,
          }));
          return jsonResult({ tiles, count: tiles.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
