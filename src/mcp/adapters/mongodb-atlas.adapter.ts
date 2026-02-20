/**
 * MCP Skill Adapter — MongoDB Atlas
 *
 * Maps MongoDB Atlas Administration API v2 endpoints to MCP tool handlers.
 * Provides access to cluster management, database listing, project management,
 * and performance metrics.
 *
 * MongoDB Atlas API docs: https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function atlasError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.detail || data.reason || data.error || err.message;
      const errorCode = data.errorCode || '';
      const msg = errorCode ? `${detail} (code: ${errorCode})` : detail;
      return { content: `Atlas API error: ${msg}`, isError: true };
    }
    return { content: `Atlas API error: ${err.message}`, isError: true };
  }
  return { content: `Atlas API error: ${String(err)}`, isError: true };
}

// ─── Tool: atlas_list_clusters ──────────────────────────

const listClusters: ToolHandler = {
  description:
    'List all clusters in a MongoDB Atlas project. Returns cluster names, states, MongoDB versions, and provider settings.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Atlas project (group) ID. Uses configured project ID if omitted.',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const groupId = params.groupId || ctx.skillConfig.groupId;
      if (!groupId) {
        return { content: 'Error: groupId is required. Provide it as a parameter or configure it in skill settings.', isError: true };
      }

      const result = await ctx.apiExecutor.get(`/groups/${groupId}/clusters`);

      const clusters: any[] = result.results || [];
      if (clusters.length === 0) {
        return { content: `No clusters found in project ${groupId}.` };
      }

      const lines = clusters.map((c: any) => {
        const name = c.name || 'unknown';
        const state = c.stateName || 'unknown';
        const version = c.mongoDBVersion || 'unknown';
        const provider = c.providerSettings?.providerName || 'unknown';
        const region = c.providerSettings?.regionName || 'unknown';
        const tier = c.providerSettings?.instanceSizeName || 'unknown';
        return `${name} — ${state}, v${version}, ${provider}/${region} (${tier})`;
      });

      return {
        content: `Found ${clusters.length} cluster(s) in project ${groupId}:\n${lines.join('\n')}`,
        metadata: { count: clusters.length, groupId },
      };
    } catch (err) {
      return atlasError(err);
    }
  },
};

// ─── Tool: atlas_get_cluster ────────────────────────────

const getCluster: ToolHandler = {
  description:
    'Get detailed information about a specific MongoDB Atlas cluster by name.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Atlas project (group) ID. Uses configured project ID if omitted.',
      },
      clusterName: {
        type: 'string',
        description: 'Name of the cluster to retrieve',
      },
    },
    required: ['clusterName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const groupId = params.groupId || ctx.skillConfig.groupId;
      if (!groupId) {
        return { content: 'Error: groupId is required.', isError: true };
      }

      const result = await ctx.apiExecutor.get(
        `/groups/${groupId}/clusters/${params.clusterName}`,
      );

      const provider = result.providerSettings || {};
      return {
        content: [
          `Cluster: ${result.name}`,
          `State: ${result.stateName || 'unknown'}`,
          `MongoDB Version: ${result.mongoDBVersion || 'unknown'}`,
          `Provider: ${provider.providerName || 'unknown'}`,
          `Region: ${provider.regionName || 'unknown'}`,
          `Instance Size: ${provider.instanceSizeName || 'unknown'}`,
          `Disk Size GB: ${result.diskSizeGB ?? 'N/A'}`,
          `Backup Enabled: ${result.backupEnabled ?? 'N/A'}`,
          `Connection String: ${result.connectionStrings?.standardSrv || 'N/A'}`,
        ].join('\n'),
        metadata: {
          name: result.name,
          state: result.stateName,
          mongoDBVersion: result.mongoDBVersion,
          groupId,
        },
      };
    } catch (err) {
      return atlasError(err);
    }
  },
};

// ─── Tool: atlas_list_databases ─────────────────────────

const listDatabases: ToolHandler = {
  description:
    'List databases in a MongoDB Atlas cluster. Returns database names and sizes.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Atlas project (group) ID. Uses configured project ID if omitted.',
      },
      clusterName: {
        type: 'string',
        description: 'Name of the cluster',
      },
    },
    required: ['clusterName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const groupId = params.groupId || ctx.skillConfig.groupId;
      if (!groupId) {
        return { content: 'Error: groupId is required.', isError: true };
      }

      const result = await ctx.apiExecutor.get(
        `/groups/${groupId}/processes/${params.clusterName}/databases`,
      );

      const databases: any[] = result.results || [];
      if (databases.length === 0) {
        return { content: `No databases found in cluster ${params.clusterName}.` };
      }

      const lines = databases.map((db: any) => {
        const name = db.databaseName || 'unknown';
        const sizeOnDisk = db.sizeOnDisk ? `${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB` : 'N/A';
        return `${name} — size: ${sizeOnDisk}`;
      });

      return {
        content: `Found ${databases.length} database(s) in cluster ${params.clusterName}:\n${lines.join('\n')}`,
        metadata: { count: databases.length, clusterName: params.clusterName, groupId },
      };
    } catch (err) {
      return atlasError(err);
    }
  },
};

// ─── Tool: atlas_list_projects ──────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects (groups) accessible to the authenticated Atlas user.',
  inputSchema: {
    type: 'object',
    properties: {
      pageNum: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      itemsPerPage: {
        type: 'number',
        description: 'Number of items per page (default 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        pageNum: String(params.pageNum ?? 1),
        itemsPerPage: String(params.itemsPerPage ?? 100),
      };

      const result = await ctx.apiExecutor.get('/groups', query);

      const projects: any[] = result.results || [];
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const name = p.name || 'unknown';
        const id = p.id || 'unknown';
        const clusterCount = p.clusterCount ?? 'N/A';
        const created = p.created ? new Date(p.created).toISOString().slice(0, 10) : 'unknown';
        return `${name} (ID: ${id}) — ${clusterCount} cluster(s), created: ${created}`;
      });

      return {
        content: `Found ${projects.length} project(s):\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return atlasError(err);
    }
  },
};

// ─── Tool: atlas_get_metrics ────────────────────────────

const getMetrics: ToolHandler = {
  description:
    'Get performance metrics for a MongoDB Atlas cluster process. Returns metrics such as connections, opcounters, and memory usage.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Atlas project (group) ID. Uses configured project ID if omitted.',
      },
      processId: {
        type: 'string',
        description: 'Process ID in the format hostname:port (e.g. "cluster0-shard-00-00.abc12.mongodb.net:27017")',
      },
      granularity: {
        type: 'string',
        enum: ['PT1M', 'PT5M', 'PT1H', 'P1D'],
        description: 'Metric granularity (default: PT1H)',
      },
      period: {
        type: 'string',
        description: 'ISO 8601 duration for the time window (e.g. "PT1H", "P1D"). Default: PT1H',
      },
      m: {
        type: 'string',
        description: 'Comma-separated metric names (e.g. "CONNECTIONS,OPCOUNTER_CMD")',
      },
    },
    required: ['processId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const groupId = params.groupId || ctx.skillConfig.groupId;
      if (!groupId) {
        return { content: 'Error: groupId is required.', isError: true };
      }

      const query: Record<string, string> = {
        granularity: params.granularity || 'PT1H',
        period: params.period || 'PT1H',
      };
      if (params.m) query.m = params.m;

      const result = await ctx.apiExecutor.get(
        `/groups/${groupId}/processes/${params.processId}/measurements`,
        query,
      );

      const measurements: any[] = result.measurements || [];
      if (measurements.length === 0) {
        return { content: `No metrics found for process ${params.processId}.` };
      }

      const lines = measurements.map((m: any) => {
        const name = m.name || 'unknown';
        const units = m.units || '';
        const dataPoints = m.dataPoints || [];
        const latest = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : null;
        const value = latest?.value ?? 'N/A';
        return `${name}: ${value} ${units}`;
      });

      return {
        content: `Metrics for process ${params.processId}:\n${lines.join('\n')}`,
        metadata: { processId: params.processId, metricCount: measurements.length, groupId },
      };
    } catch (err) {
      return atlasError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const mongodbAtlasAdapter: SkillAdapter = {
  skillId: 'mongodb-atlas',
  name: 'MongoDB Atlas',
  baseUrl: 'https://cloud.mongodb.com/api/atlas/v2',
  auth: {
    type: 'credentials',
    fields: ['publicKey', 'privateKey'],
  },
  tools: {
    atlas_list_clusters: listClusters,
    atlas_get_cluster: getCluster,
    atlas_list_databases: listDatabases,
    atlas_list_projects: listProjects,
    atlas_get_metrics: getMetrics,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    groupId: {
      type: 'string' as const,
      label: 'Project ID',
      description: 'Default MongoDB Atlas project (group) ID',
      required: true,
      placeholder: '60c8a8f9e4b0a1b2c3d4e5f6',
    },
  },
};
