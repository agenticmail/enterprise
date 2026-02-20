/**
 * MCP Skill Adapter — Vercel
 *
 * Maps Vercel REST API endpoints to MCP tool handlers.
 * Provides access to deployments, projects, and deployment details.
 *
 * Vercel REST API docs: https://vercel.com/docs/rest-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function vercelError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error?.message || data.message || err.message;
      const code = data.error?.code || '';
      const detail = code ? `${msg} (code: ${code})` : msg;
      return { content: `Vercel API error: ${detail}`, isError: true };
    }
    return { content: `Vercel API error: ${err.message}`, isError: true };
  }
  return { content: `Vercel API error: ${String(err)}`, isError: true };
}

// ─── Tool: vercel_list_deployments ──────────────────────

const listDeployments: ToolHandler = {
  description:
    'List recent deployments for a Vercel project or team. Optionally filter by project and state.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Filter by project ID or name (optional)',
      },
      state: {
        type: 'string',
        enum: ['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED'],
        description: 'Filter by deployment state (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of deployments to return (default 20, max 100)',
      },
      teamId: {
        type: 'string',
        description: 'Team ID to scope the request to (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.projectId) query.projectId = params.projectId;
      if (params.state) query.state = params.state;
      if (params.teamId) query.teamId = params.teamId;

      const result = await ctx.apiExecutor.get('/v6/deployments', query);

      const deployments: any[] = Array.isArray(result.deployments) ? result.deployments : [];
      if (deployments.length === 0) {
        return { content: 'No deployments found.' };
      }

      const lines = deployments.map((d: any) => {
        const created = d.created ? new Date(d.created).toISOString().slice(0, 16) : '';
        const url = d.url || 'no URL';
        return `${d.uid} ${d.state || d.readyState || 'unknown'} -- ${url} (${created})`;
      });

      return {
        content: `Found ${deployments.length} deployments:\n${lines.join('\n')}`,
        metadata: { count: deployments.length },
      };
    } catch (err) {
      return vercelError(err);
    }
  },
};

// ─── Tool: vercel_get_deployment ────────────────────────

const getDeployment: ToolHandler = {
  description:
    'Get detailed information about a specific Vercel deployment by its ID or URL.',
  inputSchema: {
    type: 'object',
    properties: {
      idOrUrl: {
        type: 'string',
        description: 'Deployment ID (uid) or deployment URL',
      },
      teamId: {
        type: 'string',
        description: 'Team ID to scope the request to (optional)',
      },
    },
    required: ['idOrUrl'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.teamId) query.teamId = params.teamId;

      const result = await ctx.apiExecutor.get(
        `/v13/deployments/${params.idOrUrl}`,
        query,
      );

      const created = result.created ? new Date(result.created).toISOString().slice(0, 16) : '';
      const ready = result.ready ? new Date(result.ready).toISOString().slice(0, 16) : 'N/A';

      return {
        content: [
          `Deployment: ${result.uid || result.id}`,
          `Name: ${result.name || 'unknown'}`,
          `URL: ${result.url || 'N/A'}`,
          `State: ${result.readyState || result.state || 'unknown'}`,
          `Created: ${created}`,
          `Ready: ${ready}`,
          `Target: ${result.target || 'preview'}`,
          `Creator: ${result.creator?.username || result.creator?.email || 'unknown'}`,
        ].join('\n'),
        metadata: {
          uid: result.uid || result.id,
          url: result.url,
          state: result.readyState || result.state,
          name: result.name,
          target: result.target,
        },
      };
    } catch (err) {
      return vercelError(err);
    }
  },
};

// ─── Tool: vercel_list_projects ─────────────────────────

const listProjects: ToolHandler = {
  description:
    'List projects in the authenticated Vercel account or team.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of projects to return (default 20, max 100)',
      },
      search: {
        type: 'string',
        description: 'Search projects by name (optional)',
      },
      teamId: {
        type: 'string',
        description: 'Team ID to scope the request to (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.search) query.search = params.search;
      if (params.teamId) query.teamId = params.teamId;

      const result = await ctx.apiExecutor.get('/v9/projects', query);

      const projects: any[] = Array.isArray(result.projects) ? result.projects : [];
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const framework = p.framework || 'unknown';
        const updated = p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : '';
        return `${p.name} (${framework}) -- updated: ${updated}`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return vercelError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const vercelAdapter: SkillAdapter = {
  skillId: 'vercel-deployments',
  name: 'Vercel',
  baseUrl: 'https://api.vercel.com',
  auth: {
    type: 'oauth2',
    provider: 'vercel',
  },
  tools: {
    vercel_list_deployments: listDeployments,
    vercel_get_deployment: getDeployment,
    vercel_list_projects: listProjects,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
