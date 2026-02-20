/**
 * MCP Skill Adapter — Linear
 *
 * Maps Linear GraphQL API to MCP tool handlers.
 * Linear uses a single GraphQL endpoint for all operations;
 * each tool constructs the appropriate query/mutation and variables.
 *
 * Linear API docs: https://developers.linear.app/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Execute a GraphQL operation against Linear's API */
async function graphql(
  ctx: ToolExecutionContext,
  query: string,
  variables?: Record<string, any>,
): Promise<any> {
  const result = await ctx.apiExecutor.post('/graphql', { query, variables });

  // Linear returns errors in the GraphQL response body
  if (result.errors && result.errors.length > 0) {
    const messages = result.errors.map((e: any) => e.message).join('; ');
    const err = new Error(`Linear GraphQL error: ${messages}`);
    (err as any).graphqlErrors = result.errors;
    throw err;
  }

  return result.data;
}

function linearError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: message, isError: true };
}

// ─── Tool: linear_create_issue ──────────────────────────

const createIssue: ToolHandler = {
  description:
    'Create a new issue in Linear. Specify a title, team, and optionally a description, priority, assignee, and labels.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Issue title',
      },
      description: {
        type: 'string',
        description: 'Issue description (supports markdown, optional)',
      },
      teamId: {
        type: 'string',
        description: 'ID of the team to create the issue in',
      },
      priority: {
        type: 'number',
        description: 'Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low (optional)',
      },
      assigneeId: {
        type: 'string',
        description: 'ID of the user to assign the issue to (optional)',
      },
      labelIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of label IDs to attach to the issue (optional)',
      },
    },
    required: ['title', 'teamId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const mutation = `
        mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
              state {
                name
              }
            }
          }
        }
      `;

      const input: Record<string, any> = {
        title: params.title,
        teamId: params.teamId,
      };
      if (params.description) input.description = params.description;
      if (params.priority !== undefined) input.priority = params.priority;
      if (params.assigneeId) input.assigneeId = params.assigneeId;
      if (params.labelIds && params.labelIds.length > 0) input.labelIds = params.labelIds;

      const data = await graphql(ctx, mutation, { input });
      const result = data.issueCreate;

      if (!result.success) {
        return { content: 'Failed to create issue — Linear returned success: false', isError: true };
      }

      const issue = result.issue;
      return {
        content: [
          `Issue ${issue.identifier} created: ${issue.title}`,
          `URL: ${issue.url}`,
          `State: ${issue.state?.name || 'unknown'}`,
        ].join('\n'),
        metadata: {
          id: issue.id,
          identifier: issue.identifier,
          url: issue.url,
        },
      };
    } catch (err) {
      return linearError(err);
    }
  },
};

// ─── Tool: linear_list_issues ───────────────────────────

const listIssues: ToolHandler = {
  description:
    'List issues from Linear, optionally filtered by team or custom filter. Returns issue identifiers, titles, states, and assignees.',
  inputSchema: {
    type: 'object',
    properties: {
      teamId: {
        type: 'string',
        description: 'Filter issues by team ID (optional)',
      },
      first: {
        type: 'number',
        description: 'Number of issues to return (default 20)',
      },
      filter: {
        type: 'object',
        description: 'Linear IssueFilter object for advanced filtering (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const issueQuery = `
        query($filter: IssueFilter, $first: Int) {
          issues(filter: $filter, first: $first) {
            nodes {
              id
              identifier
              title
              state {
                name
              }
              assignee {
                name
              }
              priority
              priorityLabel
              createdAt
            }
          }
        }
      `;

      const variables: Record<string, any> = {
        first: params.first ?? 20,
      };

      // Build filter — merge teamId into any provided filter
      if (params.teamId || params.filter) {
        const filter: Record<string, any> = { ...(params.filter || {}) };
        if (params.teamId) {
          filter.team = { id: { eq: params.teamId } };
        }
        variables.filter = filter;
      }

      const data = await graphql(ctx, issueQuery, variables);
      const issues: any[] = data.issues?.nodes || [];

      if (issues.length === 0) {
        return { content: 'No issues found.' };
      }

      const lines = issues.map((issue: any) => {
        const assignee = issue.assignee?.name || 'Unassigned';
        const priority = issue.priorityLabel || 'No priority';
        return `[${priority}] ${issue.identifier} ${issue.title} — ${issue.state?.name || 'unknown'} (${assignee})`;
      });

      return {
        content: `Found ${issues.length} issues:\n${lines.join('\n')}`,
        metadata: { count: issues.length },
      };
    } catch (err) {
      return linearError(err);
    }
  },
};

// ─── Tool: linear_search_issues ─────────────────────────

const searchIssues: ToolHandler = {
  description:
    'Search for issues in Linear by text query. Returns matching issues with identifiers, titles, states, and URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search term to find matching issues',
      },
      first: {
        type: 'number',
        description: 'Number of results to return (default 20)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const searchQuery = `
        query($term: String!, $first: Int) {
          searchIssues(term: $term, first: $first) {
            nodes {
              id
              identifier
              title
              state {
                name
              }
              assignee {
                name
              }
              url
            }
          }
        }
      `;

      const variables = {
        term: params.query,
        first: params.first ?? 20,
      };

      const data = await graphql(ctx, searchQuery, variables);
      const issues: any[] = data.searchIssues?.nodes || [];

      if (issues.length === 0) {
        return { content: `No issues found for: "${params.query}"` };
      }

      const lines = issues.map((issue: any) => {
        const state = issue.state?.name || 'unknown';
        return `${issue.identifier} ${issue.title} — ${state} — ${issue.url}`;
      });

      return {
        content: `Found ${issues.length} results:\n${lines.join('\n')}`,
        metadata: { count: issues.length, query: params.query },
      };
    } catch (err) {
      return linearError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const linearAdapter: SkillAdapter = {
  skillId: 'linear',
  name: 'Linear',
  baseUrl: 'https://api.linear.app',
  auth: {
    type: 'oauth2',
    provider: 'linear',
    headerPrefix: 'Bearer',
  },
  tools: {
    linear_create_issue: createIssue,
    linear_list_issues: listIssues,
    linear_search_issues: searchIssues,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
