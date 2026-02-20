/**
 * MCP Skill Adapter — Bitbucket
 *
 * Maps Bitbucket Cloud REST API 2.0 endpoints to MCP tool handlers.
 * Bitbucket uses a paginated response envelope with `values`, `size`,
 * `page`, and `next` fields.
 *
 * Bitbucket REST API docs: https://developer.atlassian.com/cloud/bitbucket/rest/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function bitbucketError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error?.message || data.error?.detail || data.message || err.message;
      return { content: `Bitbucket API error: ${msg}`, isError: true };
    }
    return { content: `Bitbucket API error: ${err.message}`, isError: true };
  }
  return { content: `Bitbucket API error: ${String(err)}`, isError: true };
}

// ─── Tool: bitbucket_list_repos ─────────────────────────

const listRepos: ToolHandler = {
  description:
    'List repositories for a Bitbucket workspace. Returns repository names, slugs, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Workspace slug or UUID',
      },
      role: {
        type: 'string',
        enum: ['admin', 'contributor', 'member', 'owner'],
        description: 'Filter by the authenticated user\'s role (optional)',
      },
      pagelen: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
    },
    required: ['workspace'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        pagelen: String(params.pagelen ?? 25),
      };
      if (params.role) query.role = params.role;

      const result = await ctx.apiExecutor.get(
        `/repositories/${params.workspace}`,
        query,
      );

      const repos: any[] = Array.isArray(result.values) ? result.values : [];
      if (repos.length === 0) {
        return { content: `No repositories found in workspace "${params.workspace}".` };
      }

      const lines = repos.map((r: any) => {
        const desc = r.description ? ` -- ${r.description}` : '';
        const lang = r.language || 'unknown';
        return `${r.full_name}${desc} (${lang}, ${r.is_private ? 'private' : 'public'})`;
      });

      return {
        content: `Found ${repos.length} repositories in ${params.workspace}:\n${lines.join('\n')}`,
        metadata: { count: repos.length, workspace: params.workspace },
      };
    } catch (err) {
      return bitbucketError(err);
    }
  },
};

// ─── Tool: bitbucket_create_pull_request ────────────────

const createPullRequest: ToolHandler = {
  description:
    'Create a pull request in a Bitbucket repository. Specify source and destination branches.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Workspace slug or UUID',
      },
      repo_slug: {
        type: 'string',
        description: 'Repository slug',
      },
      title: {
        type: 'string',
        description: 'Pull request title',
      },
      description: {
        type: 'string',
        description: 'Pull request description (Markdown supported)',
      },
      source_branch: {
        type: 'string',
        description: 'Source branch name (contains the changes)',
      },
      destination_branch: {
        type: 'string',
        description: 'Destination branch name to merge into (e.g. "main")',
      },
      close_source_branch: {
        type: 'boolean',
        description: 'Whether to close the source branch after merge (default: false)',
      },
    },
    required: ['workspace', 'repo_slug', 'title', 'source_branch', 'destination_branch'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        title: params.title,
        source: {
          branch: { name: params.source_branch },
        },
        destination: {
          branch: { name: params.destination_branch },
        },
      };
      if (params.description) body.description = params.description;
      if (params.close_source_branch !== undefined) {
        body.close_source_branch = params.close_source_branch;
      }

      const result = await ctx.apiExecutor.post(
        `/repositories/${params.workspace}/${params.repo_slug}/pullrequests`,
        body,
      );

      return {
        content: `PR #${result.id} created: ${result.links?.html?.href || result.links?.self?.href}\n${result.title}\n${params.source_branch} -> ${params.destination_branch}`,
        metadata: {
          id: result.id,
          url: result.links?.html?.href,
          workspace: params.workspace,
          repo_slug: params.repo_slug,
          source_branch: params.source_branch,
          destination_branch: params.destination_branch,
        },
      };
    } catch (err) {
      return bitbucketError(err);
    }
  },
};

// ─── Tool: bitbucket_list_pull_requests ─────────────────

const listPullRequests: ToolHandler = {
  description:
    'List pull requests in a Bitbucket repository. Filter by state (OPEN, MERGED, DECLINED, SUPERSEDED).',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Workspace slug or UUID',
      },
      repo_slug: {
        type: 'string',
        description: 'Repository slug',
      },
      state: {
        type: 'string',
        enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
        description: 'Filter by pull request state (default: "OPEN")',
      },
      pagelen: {
        type: 'number',
        description: 'Results per page (default 25, max 50)',
      },
    },
    required: ['workspace', 'repo_slug'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        state: params.state || 'OPEN',
        pagelen: String(params.pagelen ?? 25),
      };

      const result = await ctx.apiExecutor.get(
        `/repositories/${params.workspace}/${params.repo_slug}/pullrequests`,
        query,
      );

      const prs: any[] = Array.isArray(result.values) ? result.values : [];
      if (prs.length === 0) {
        return {
          content: `No ${query.state} pull requests found in ${params.workspace}/${params.repo_slug}.`,
        };
      }

      const lines = prs.map((pr: any) => {
        const author = pr.author?.display_name || pr.author?.nickname || 'unknown';
        const src = pr.source?.branch?.name || '?';
        const dst = pr.destination?.branch?.name || '?';
        return `#${pr.id} ${pr.title} (${pr.state}) -- ${src} -> ${dst} by ${author}`;
      });

      return {
        content: `Found ${prs.length} pull requests in ${params.workspace}/${params.repo_slug}:\n${lines.join('\n')}`,
        metadata: {
          count: prs.length,
          workspace: params.workspace,
          repo_slug: params.repo_slug,
        },
      };
    } catch (err) {
      return bitbucketError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const bitbucketAdapter: SkillAdapter = {
  skillId: 'bitbucket-repos',
  name: 'Bitbucket',
  baseUrl: 'https://api.bitbucket.org/2.0',
  auth: {
    type: 'oauth2',
    provider: 'bitbucket',
  },
  tools: {
    bitbucket_list_repos: listRepos,
    bitbucket_create_pull_request: createPullRequest,
    bitbucket_list_pull_requests: listPullRequests,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
  configSchema: {
    workspace: {
      type: 'string' as const,
      label: 'Bitbucket Workspace',
      description: 'Your Bitbucket workspace slug',
      required: true,
      placeholder: 'my-workspace',
    },
  },
};
