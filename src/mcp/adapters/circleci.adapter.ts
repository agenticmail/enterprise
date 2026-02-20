/**
 * MCP Skill Adapter — CircleCI
 *
 * Maps CircleCI API v2 endpoints to MCP tool handlers.
 * Uses token-based auth with a custom header name ("Circle-Token")
 * instead of the standard Authorization header.
 *
 * CircleCI API docs: https://circleci.com/docs/api/v2/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function circleciError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || err.message;
      return { content: `CircleCI API error: ${msg}`, isError: true };
    }
    return { content: `CircleCI API error: ${err.message}`, isError: true };
  }
  return { content: `CircleCI API error: ${String(err)}`, isError: true };
}

// ─── Tool: circleci_list_pipelines ──────────────────────

const listPipelines: ToolHandler = {
  description:
    'List recent pipelines for a CircleCI project. Provide the project slug (e.g. "gh/my-org/my-repo").',
  inputSchema: {
    type: 'object',
    properties: {
      project_slug: {
        type: 'string',
        description: 'Project slug in the form "vcs-type/org-name/repo-name" (e.g. "gh/acme/api-server")',
      },
      branch: {
        type: 'string',
        description: 'Filter pipelines by branch name (optional)',
      },
      page_token: {
        type: 'string',
        description: 'Page token for pagination (optional)',
      },
    },
    required: ['project_slug'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.branch) query.branch = params.branch;
      if (params.page_token) query['page-token'] = params.page_token;

      const result = await ctx.apiExecutor.get(
        `/project/${params.project_slug}/pipeline`,
        query,
      );

      const pipelines: any[] = Array.isArray(result.items) ? result.items : [];
      if (pipelines.length === 0) {
        return {
          content: `No pipelines found for ${params.project_slug}.`,
        };
      }

      const lines = pipelines.map((p: any) => {
        const branch = p.vcs?.branch || 'unknown';
        const status = p.state || 'unknown';
        const createdAt = p.created_at ? new Date(p.created_at).toISOString().slice(0, 16) : '';
        return `${p.id} (${status}) -- branch: ${branch}, created: ${createdAt}`;
      });

      return {
        content: `Found ${pipelines.length} pipelines for ${params.project_slug}:\n${lines.join('\n')}`,
        metadata: {
          count: pipelines.length,
          project_slug: params.project_slug,
          next_page_token: result.next_page_token,
        },
      };
    } catch (err) {
      return circleciError(err);
    }
  },
};

// ─── Tool: circleci_get_pipeline ────────────────────────

const getPipeline: ToolHandler = {
  description:
    'Get details for a specific CircleCI pipeline by its ID, including its configuration and trigger information.',
  inputSchema: {
    type: 'object',
    properties: {
      pipeline_id: {
        type: 'string',
        description: 'Pipeline UUID',
      },
    },
    required: ['pipeline_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/pipeline/${params.pipeline_id}`);

      const branch = result.vcs?.branch || 'unknown';
      const revision = result.vcs?.revision ? result.vcs.revision.slice(0, 8) : 'unknown';
      const createdAt = result.created_at ? new Date(result.created_at).toISOString().slice(0, 16) : '';
      const trigger = result.trigger?.type || 'unknown';

      return {
        content: [
          `Pipeline: ${result.id}`,
          `State: ${result.state || 'unknown'}`,
          `Branch: ${branch}`,
          `Revision: ${revision}`,
          `Trigger: ${trigger}`,
          `Created: ${createdAt}`,
          `Project: ${result.project_slug || 'unknown'}`,
        ].join('\n'),
        metadata: {
          id: result.id,
          state: result.state,
          project_slug: result.project_slug,
          branch,
          revision: result.vcs?.revision,
        },
      };
    } catch (err) {
      return circleciError(err);
    }
  },
};

// ─── Tool: circleci_trigger_pipeline ────────────────────

const triggerPipeline: ToolHandler = {
  description:
    'Trigger a new pipeline for a CircleCI project on a given branch or tag.',
  inputSchema: {
    type: 'object',
    properties: {
      project_slug: {
        type: 'string',
        description: 'Project slug in the form "vcs-type/org-name/repo-name" (e.g. "gh/acme/api-server")',
      },
      branch: {
        type: 'string',
        description: 'Branch name to run the pipeline on (provide branch or tag, not both)',
      },
      tag: {
        type: 'string',
        description: 'Tag name to run the pipeline on (provide branch or tag, not both)',
      },
      parameters: {
        type: 'object',
        description: 'Pipeline parameters as key/value pairs (optional)',
      },
    },
    required: ['project_slug'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.branch) body.branch = params.branch;
      if (params.tag) body.tag = params.tag;
      if (params.parameters && Object.keys(params.parameters).length > 0) {
        body.parameters = params.parameters;
      }

      const result = await ctx.apiExecutor.post(
        `/project/${params.project_slug}/pipeline`,
        body,
      );

      return {
        content: `Pipeline ${result.id} triggered for ${params.project_slug}\nState: ${result.state || 'created'}\nNumber: ${result.number || 'N/A'}`,
        metadata: {
          id: result.id,
          state: result.state,
          number: result.number,
          project_slug: params.project_slug,
        },
      };
    } catch (err) {
      return circleciError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const circleciAdapter: SkillAdapter = {
  skillId: 'circleci-pipelines',
  name: 'CircleCI',
  baseUrl: 'https://circleci.com/api/v2',
  auth: {
    type: 'token',
    headerName: 'Circle-Token',
    headerPrefix: '',
  },
  tools: {
    circleci_list_pipelines: listPipelines,
    circleci_get_pipeline: getPipeline,
    circleci_trigger_pipeline: triggerPipeline,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
