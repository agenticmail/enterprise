/**
 * MCP Skill Adapter — GitHub
 *
 * Maps GitHub REST API v3 endpoints to MCP tool handlers.
 * Uses the pre-authenticated API executor with the `application/vnd.github+json`
 * accept header and API version pinning.
 *
 * GitHub REST API docs: https://docs.github.com/en/rest
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function githubError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    // GitHub returns structured error responses with a "message" field
    // and sometimes a "documentation_url" and "errors" array.
    if (data && typeof data === 'object') {
      const parts = [data.message || err.message];
      if (Array.isArray(data.errors)) {
        for (const e of data.errors) {
          parts.push(`  - ${e.field || e.resource}: ${e.message || e.code}`);
        }
      }
      return { content: `GitHub API error: ${parts.join('\n')}`, isError: true };
    }
    return { content: `GitHub API error: ${err.message}`, isError: true };
  }
  return { content: `GitHub API error: ${String(err)}`, isError: true };
}

// ─── Tool: github_create_issue ──────────────────────────

const createIssue: ToolHandler = {
  description:
    'Create a new issue in a GitHub repository. Requires owner, repo, and title. Optionally set body, labels, and assignees.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      title: {
        type: 'string',
        description: 'Issue title',
      },
      body: {
        type: 'string',
        description: 'Issue body (Markdown supported)',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to apply (e.g. ["bug", "high-priority"])',
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
        description: 'GitHub usernames to assign',
      },
    },
    required: ['owner', 'repo', 'title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { title: params.title };
      if (params.body) body.body = params.body;
      if (params.labels?.length) body.labels = params.labels;
      if (params.assignees?.length) body.assignees = params.assignees;

      const result = await ctx.apiExecutor.post(
        `/repos/${params.owner}/${params.repo}/issues`,
        body,
      );

      return {
        content: `Issue #${result.number} created: ${result.html_url}\nTitle: ${result.title}`,
        metadata: {
          number: result.number,
          url: result.html_url,
          owner: params.owner,
          repo: params.repo,
        },
      };
    } catch (err) {
      return githubError(err);
    }
  },
};

// ─── Tool: github_list_issues ───────────────────────────

const listIssues: ToolHandler = {
  description:
    'List issues in a GitHub repository. Filter by state (open/closed/all) and labels.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      state: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        description: 'Filter by issue state (default: "open")',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated list of label names to filter by',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
    },
    required: ['owner', 'repo'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        state: params.state || 'open',
        per_page: String(params.per_page ?? 30),
      };
      if (params.labels) query.labels = params.labels;

      const result = await ctx.apiExecutor.get(
        `/repos/${params.owner}/${params.repo}/issues`,
        query,
      );

      const issues: any[] = Array.isArray(result) ? result : [];
      if (issues.length === 0) {
        return {
          content: `No ${query.state} issues found in ${params.owner}/${params.repo}.`,
        };
      }

      const lines = issues.map((issue: any) => {
        const prTag = issue.pull_request ? ' [PR]' : '';
        return `#${issue.number} ${issue.title} (${issue.state})${prTag} -- by ${issue.user?.login || 'unknown'}`;
      });

      return {
        content: `Found ${issues.length} issues in ${params.owner}/${params.repo}:\n${lines.join('\n')}`,
        metadata: { count: issues.length, owner: params.owner, repo: params.repo },
      };
    } catch (err) {
      return githubError(err);
    }
  },
};

// ─── Tool: github_update_issue ──────────────────────────

const updateIssue: ToolHandler = {
  description:
    'Update an existing GitHub issue. Can change title, body, state, labels, or assignees.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      issue_number: {
        type: 'number',
        description: 'Issue number to update',
      },
      title: {
        type: 'string',
        description: 'New issue title',
      },
      body: {
        type: 'string',
        description: 'New issue body',
      },
      state: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Set issue state to "open" or "closed"',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replace labels with this list',
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replace assignees with this list of usernames',
      },
    },
    required: ['owner', 'repo', 'issue_number'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.title !== undefined) body.title = params.title;
      if (params.body !== undefined) body.body = params.body;
      if (params.state !== undefined) body.state = params.state;
      if (params.labels !== undefined) body.labels = params.labels;
      if (params.assignees !== undefined) body.assignees = params.assignees;

      const result = await ctx.apiExecutor.patch(
        `/repos/${params.owner}/${params.repo}/issues/${params.issue_number}`,
        body,
      );

      return {
        content: `Issue #${result.number} updated: ${result.html_url}`,
        metadata: {
          number: result.number,
          url: result.html_url,
          state: result.state,
        },
      };
    } catch (err) {
      return githubError(err);
    }
  },
};

// ─── Tool: github_create_pull_request ───────────────────

const createPullRequest: ToolHandler = {
  description:
    'Create a pull request in a GitHub repository. Specify the head branch (source) and base branch (target).',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      title: {
        type: 'string',
        description: 'Pull request title',
      },
      body: {
        type: 'string',
        description: 'Pull request description (Markdown supported)',
      },
      head: {
        type: 'string',
        description: 'Branch name containing the changes (source branch)',
      },
      base: {
        type: 'string',
        description: 'Branch to merge into (target branch, e.g. "main")',
      },
    },
    required: ['owner', 'repo', 'title', 'head', 'base'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        title: params.title,
        head: params.head,
        base: params.base,
      };
      if (params.body) body.body = params.body;

      const result = await ctx.apiExecutor.post(
        `/repos/${params.owner}/${params.repo}/pulls`,
        body,
      );

      return {
        content: `PR #${result.number} created: ${result.html_url}\n${result.title}\n${params.head} -> ${params.base}`,
        metadata: {
          number: result.number,
          url: result.html_url,
          head: params.head,
          base: params.base,
        },
      };
    } catch (err) {
      return githubError(err);
    }
  },
};

// ─── Tool: github_list_repos ────────────────────────────

const listRepos: ToolHandler = {
  description:
    'List repositories for the authenticated GitHub user. Filter by type and sort order.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'owner', 'public', 'private', 'member'],
        description: 'Type of repositories to list (default: "owner")',
      },
      sort: {
        type: 'string',
        enum: ['created', 'updated', 'pushed', 'full_name'],
        description: 'Sort field (default: "updated")',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        type: params.type || 'owner',
        sort: params.sort || 'updated',
        per_page: String(params.per_page ?? 30),
      };

      const result = await ctx.apiExecutor.get('/user/repos', query);

      const repos: any[] = Array.isArray(result) ? result : [];
      if (repos.length === 0) {
        return { content: 'No repositories found.' };
      }

      const lines = repos.map((r: any) => {
        const desc = r.description ? ` -- ${r.description}` : '';
        const lang = r.language || 'unknown';
        const stars = r.stargazers_count ?? 0;
        return `${r.full_name}${desc} (${lang}, ${stars} stars)`;
      });

      return {
        content: `Found ${repos.length} repositories:\n${lines.join('\n')}`,
        metadata: { count: repos.length },
      };
    } catch (err) {
      return githubError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const githubAdapter: SkillAdapter = {
  skillId: 'github',
  name: 'GitHub',
  baseUrl: 'https://api.github.com',
  auth: {
    type: 'oauth2',
    provider: 'github',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  tools: {
    github_create_issue: createIssue,
    github_list_issues: listIssues,
    github_update_issue: updateIssue,
    github_create_pull_request: createPullRequest,
    github_list_repos: listRepos,
  },
  rateLimits: { requestsPerSecond: 1, requestsPerMinute: 80, burstLimit: 10 },
};
