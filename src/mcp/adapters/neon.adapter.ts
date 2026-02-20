/**
 * MCP Skill Adapter — Neon Serverless Postgres
 *
 * Maps Neon API v2 endpoints to MCP tool handlers.
 * Provides access to project management, branch operations,
 * and endpoint listing for Neon serverless Postgres databases.
 *
 * Neon API docs: https://api-docs.neon.tech/reference/getting-started-with-neon-api
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function neonError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      const code = data.code || '';
      const detail = code ? `${msg} (code: ${code})` : msg;
      return { content: `Neon API error: ${detail}`, isError: true };
    }
    return { content: `Neon API error: ${err.message}`, isError: true };
  }
  return { content: `Neon API error: ${String(err)}`, isError: true };
}

// ─── Tool: neon_list_projects ───────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all Neon projects accessible to the authenticated user. Returns project names, IDs, regions, and creation dates.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of projects to return (default 10, max 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 10),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get('/projects', query);

      const projects: any[] = result.projects || [];
      if (projects.length === 0) {
        return { content: 'No Neon projects found.' };
      }

      const lines = projects.map((p: any) => {
        const name = p.name || 'unnamed';
        const id = p.id || 'unknown';
        const region = p.region_id || 'unknown';
        const created = p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : 'unknown';
        const pgVersion = p.pg_version || 'unknown';
        return `${name} (ID: ${id}) — region: ${region}, PG ${pgVersion}, created: ${created}`;
      });

      return {
        content: `Found ${projects.length} Neon project(s):\n${lines.join('\n')}`,
        metadata: {
          count: projects.length,
          cursor: result.pagination?.cursor || null,
        },
      };
    } catch (err) {
      return neonError(err);
    }
  },
};

// ─── Tool: neon_get_project ─────────────────────────────

const getProject: ToolHandler = {
  description:
    'Get detailed information about a specific Neon project by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Neon project ID',
      },
    },
    required: ['projectId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/projects/${params.projectId}`);

      const project = result.project || result;
      return {
        content: [
          `Project: ${project.name || 'unnamed'}`,
          `ID: ${project.id || params.projectId}`,
          `Region: ${project.region_id || 'unknown'}`,
          `Platform: ${project.platform_id || 'unknown'}`,
          `PostgreSQL Version: ${project.pg_version || 'unknown'}`,
          `Store Size: ${project.store_size ? `${(project.store_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`,
          `Active Time: ${project.active_time_seconds ? `${Math.round(project.active_time_seconds / 3600)}h` : 'N/A'}`,
          `Created: ${project.created_at || 'unknown'}`,
          `Updated: ${project.updated_at || 'unknown'}`,
        ].join('\n'),
        metadata: {
          projectId: project.id || params.projectId,
          name: project.name,
          region: project.region_id,
        },
      };
    } catch (err) {
      return neonError(err);
    }
  },
};

// ─── Tool: neon_list_branches ───────────────────────────

const listBranches: ToolHandler = {
  description:
    'List branches in a Neon project. Returns branch names, IDs, parent info, and timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Neon project ID',
      },
    },
    required: ['projectId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/projects/${params.projectId}/branches`);

      const branches: any[] = result.branches || [];
      if (branches.length === 0) {
        return { content: `No branches found in project ${params.projectId}.` };
      }

      const lines = branches.map((b: any) => {
        const name = b.name || 'unnamed';
        const id = b.id || 'unknown';
        const primary = b.primary ? ' [PRIMARY]' : '';
        const parent = b.parent_id ? ` (parent: ${b.parent_id})` : '';
        const created = b.created_at ? new Date(b.created_at).toISOString().slice(0, 16) : 'unknown';
        return `${name} (ID: ${id})${primary}${parent} — created: ${created}`;
      });

      return {
        content: `Found ${branches.length} branch(es) in project ${params.projectId}:\n${lines.join('\n')}`,
        metadata: { count: branches.length, projectId: params.projectId },
      };
    } catch (err) {
      return neonError(err);
    }
  },
};

// ─── Tool: neon_create_branch ───────────────────────────

const createBranch: ToolHandler = {
  description:
    'Create a new branch in a Neon project. Optionally specify a parent branch and endpoint configuration.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Neon project ID',
      },
      branchName: {
        type: 'string',
        description: 'Name for the new branch',
      },
      parentId: {
        type: 'string',
        description: 'Parent branch ID (defaults to the primary branch if omitted)',
      },
      parentTimestamp: {
        type: 'string',
        description: 'ISO 8601 timestamp for point-in-time branching from the parent',
      },
    },
    required: ['projectId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        branch: {},
        endpoints: [{ type: 'read_write' }],
      };
      if (params.branchName) body.branch.name = params.branchName;
      if (params.parentId) body.branch.parent_id = params.parentId;
      if (params.parentTimestamp) body.branch.parent_timestamp = params.parentTimestamp;

      const result = await ctx.apiExecutor.post(
        `/projects/${params.projectId}/branches`,
        body,
      );

      const branch = result.branch || {};
      const endpoints = result.endpoints || [];
      const endpoint = endpoints.length > 0 ? endpoints[0] : null;

      return {
        content: [
          `Branch created: ${branch.name || 'unnamed'}`,
          `Branch ID: ${branch.id || 'unknown'}`,
          `Parent: ${branch.parent_id || 'primary'}`,
          `Created: ${branch.created_at || 'now'}`,
          endpoint ? `Endpoint: ${endpoint.host || 'pending'}` : 'Endpoint: pending',
        ].join('\n'),
        metadata: {
          branchId: branch.id,
          branchName: branch.name,
          projectId: params.projectId,
          endpointId: endpoint?.id || null,
        },
      };
    } catch (err) {
      return neonError(err);
    }
  },
};

// ─── Tool: neon_list_endpoints ──────────────────────────

const listEndpoints: ToolHandler = {
  description:
    'List compute endpoints in a Neon project. Returns endpoint IDs, hosts, branch associations, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Neon project ID',
      },
    },
    required: ['projectId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/projects/${params.projectId}/endpoints`);

      const endpoints: any[] = result.endpoints || [];
      if (endpoints.length === 0) {
        return { content: `No endpoints found in project ${params.projectId}.` };
      }

      const lines = endpoints.map((e: any) => {
        const id = e.id || 'unknown';
        const host = e.host || 'unknown';
        const branchId = e.branch_id || 'unknown';
        const type = e.type || 'unknown';
        const currentState = e.current_state || 'unknown';
        const autoscaling = e.autoscaling_limit_min_cu && e.autoscaling_limit_max_cu
          ? `${e.autoscaling_limit_min_cu}-${e.autoscaling_limit_max_cu} CU`
          : 'N/A';
        return `${id} — ${host} (${type}, ${currentState}, branch: ${branchId}, autoscaling: ${autoscaling})`;
      });

      return {
        content: `Found ${endpoints.length} endpoint(s) in project ${params.projectId}:\n${lines.join('\n')}`,
        metadata: { count: endpoints.length, projectId: params.projectId },
      };
    } catch (err) {
      return neonError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const neonAdapter: SkillAdapter = {
  skillId: 'neon',
  name: 'Neon Serverless Postgres',
  baseUrl: 'https://console.neon.tech/api/v2',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    neon_list_projects: listProjects,
    neon_get_project: getProject,
    neon_list_branches: listBranches,
    neon_create_branch: createBranch,
    neon_list_endpoints: listEndpoints,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
