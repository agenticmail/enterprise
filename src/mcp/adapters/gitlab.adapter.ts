/**
 * MCP Skill Adapter — GitLab
 *
 * Maps GitLab REST API v4 endpoints to MCP tool handlers.
 * Project paths must be URL-encoded when used in API paths
 * (e.g. "my-group/my-project" becomes "my-group%2Fmy-project").
 *
 * GitLab REST API docs: https://docs.gitlab.com/ee/api/rest/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function gitlabError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const parts = [data.message || data.error || err.message];
      if (Array.isArray(data.errors)) {
        for (const e of data.errors) {
          parts.push(`  - ${typeof e === 'string' ? e : JSON.stringify(e)}`);
        }
      }
      return { content: `GitLab API error: ${parts.join('\n')}`, isError: true };
    }
    return { content: `GitLab API error: ${err.message}`, isError: true };
  }
  return { content: `GitLab API error: ${String(err)}`, isError: true };
}

/** URL-encode a full project path (e.g. "group/subgroup/project"). */
function encodeProject(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

// ─── Tool: gitlab_create_issue ──────────────────────────

const createIssue: ToolHandler = {
  description:
    'Create a new issue in a GitLab project. Requires the full project path and a title.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Full project path (e.g. "my-group/my-project")',
      },
      title: {
        type: 'string',
        description: 'Issue title',
      },
      description: {
        type: 'string',
        description: 'Issue description (Markdown supported)',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated list of label names',
      },
      assignee_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of user IDs to assign',
      },
    },
    required: ['project', 'title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { title: params.title };
      if (params.description) body.description = params.description;
      if (params.labels) body.labels = params.labels;
      if (params.assignee_ids?.length) body.assignee_ids = params.assignee_ids;

      const result = await ctx.apiExecutor.post(
        `/projects/${encodeProject(params.project)}/issues`,
        body,
      );

      return {
        content: `Issue #${result.iid} created: ${result.web_url}\nTitle: ${result.title}`,
        metadata: {
          iid: result.iid,
          id: result.id,
          url: result.web_url,
          project: params.project,
        },
      };
    } catch (err) {
      return gitlabError(err);
    }
  },
};

// ─── Tool: gitlab_list_issues ───────────────────────────

const listIssues: ToolHandler = {
  description:
    'List issues in a GitLab project. Filter by state (opened/closed/all) and labels.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Full project path (e.g. "my-group/my-project")',
      },
      state: {
        type: 'string',
        enum: ['opened', 'closed', 'all'],
        description: 'Filter by issue state (default: "opened")',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated list of label names to filter by',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 100)',
      },
    },
    required: ['project'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        state: params.state || 'opened',
        per_page: String(params.per_page ?? 20),
      };
      if (params.labels) query.labels = params.labels;

      const result = await ctx.apiExecutor.get(
        `/projects/${encodeProject(params.project)}/issues`,
        query,
      );

      const issues: any[] = Array.isArray(result) ? result : [];
      if (issues.length === 0) {
        return {
          content: `No ${query.state} issues found in ${params.project}.`,
        };
      }

      const lines = issues.map((issue: any) => {
        const assignee = issue.assignee?.username || 'unassigned';
        return `#${issue.iid} ${issue.title} (${issue.state}) -- assigned to ${assignee}`;
      });

      return {
        content: `Found ${issues.length} issues in ${params.project}:\n${lines.join('\n')}`,
        metadata: { count: issues.length, project: params.project },
      };
    } catch (err) {
      return gitlabError(err);
    }
  },
};

// ─── Tool: gitlab_list_projects ─────────────────────────

const listProjects: ToolHandler = {
  description:
    'List GitLab projects accessible to the authenticated user. Optionally search by name.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search projects by name',
      },
      owned: {
        type: 'boolean',
        description: 'Only list projects owned by the authenticated user (default: false)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
      };
      if (params.search) query.search = params.search;
      if (params.owned) query.owned = 'true';

      const result = await ctx.apiExecutor.get('/projects', query);

      const projects: any[] = Array.isArray(result) ? result : [];
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const desc = p.description ? ` -- ${p.description}` : '';
        const stars = p.star_count ?? 0;
        return `${p.path_with_namespace}${desc} (${stars} stars)`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return gitlabError(err);
    }
  },
};

// ─── Tool: gitlab_list_pipelines ────────────────────────

const listPipelines: ToolHandler = {
  description:
    'List CI/CD pipelines for a GitLab project. Filter by status or ref (branch/tag).',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Full project path (e.g. "my-group/my-project")',
      },
      status: {
        type: 'string',
        enum: ['running', 'pending', 'success', 'failed', 'canceled', 'skipped', 'manual'],
        description: 'Filter pipelines by status',
      },
      ref: {
        type: 'string',
        description: 'Filter by branch or tag name',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 100)',
      },
    },
    required: ['project'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
      };
      if (params.status) query.status = params.status;
      if (params.ref) query.ref = params.ref;

      const result = await ctx.apiExecutor.get(
        `/projects/${encodeProject(params.project)}/pipelines`,
        query,
      );

      const pipelines: any[] = Array.isArray(result) ? result : [];
      if (pipelines.length === 0) {
        return {
          content: `No pipelines found in ${params.project}.`,
        };
      }

      const lines = pipelines.map((p: any) => {
        const ref = p.ref || 'unknown';
        return `#${p.id} ${p.status} (ref: ${ref}) -- ${p.web_url}`;
      });

      return {
        content: `Found ${pipelines.length} pipelines in ${params.project}:\n${lines.join('\n')}`,
        metadata: { count: pipelines.length, project: params.project },
      };
    } catch (err) {
      return gitlabError(err);
    }
  },
};

// ─── Tool: gitlab_trigger_pipeline ──────────────────────

const triggerPipeline: ToolHandler = {
  description:
    'Trigger a new CI/CD pipeline for a branch or tag in a GitLab project.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Full project path (e.g. "my-group/my-project")',
      },
      ref: {
        type: 'string',
        description: 'Branch or tag name to run the pipeline on',
      },
      variables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['key', 'value'],
        },
        description: 'Pipeline variables as key/value pairs',
      },
    },
    required: ['project', 'ref'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { ref: params.ref };
      if (params.variables?.length) body.variables = params.variables;

      const result = await ctx.apiExecutor.post(
        `/projects/${encodeProject(params.project)}/pipeline`,
        body,
      );

      return {
        content: `Pipeline #${result.id} triggered on ref "${result.ref}": ${result.web_url}\nStatus: ${result.status}`,
        metadata: {
          id: result.id,
          ref: result.ref,
          status: result.status,
          url: result.web_url,
          project: params.project,
        },
      };
    } catch (err) {
      return gitlabError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const gitlabAdapter: SkillAdapter = {
  skillId: 'gitlab-ci',
  name: 'GitLab',
  baseUrl: 'https://gitlab.com/api/v4',
  auth: {
    type: 'oauth2',
    provider: 'gitlab',
  },
  tools: {
    gitlab_create_issue: createIssue,
    gitlab_list_issues: listIssues,
    gitlab_list_projects: listProjects,
    gitlab_list_pipelines: listPipelines,
    gitlab_trigger_pipeline: triggerPipeline,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
  configSchema: {
    host: {
      type: 'string' as const,
      label: 'GitLab Instance URL',
      description: 'Your GitLab instance URL (leave empty for gitlab.com)',
      required: false,
      default: 'https://gitlab.com',
      placeholder: 'https://gitlab.example.com',
    },
  },
};
