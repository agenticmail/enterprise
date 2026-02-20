/**
 * MCP Skill Adapter — Jira
 *
 * Maps Jira Cloud REST API v3 endpoints to MCP tool handlers.
 * The Jira base URL is dynamic per-tenant (e.g. https://acme.atlassian.net).
 * Each tool resolves the host from `ctx.skillConfig.host` and uses
 * `ctx.apiExecutor.request()` with a full URL override to bypass the
 * default base URL.
 *
 * Jira Cloud REST API docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

const DEFAULT_HOST = 'https://your-domain.atlassian.net';

/**
 * Resolve the Jira instance base URL from skill config.
 */
function getJiraHost(ctx: ToolExecutionContext): string {
  const host = ctx.skillConfig.host || DEFAULT_HOST;
  return host.replace(/\/$/, '');
}

/**
 * Build an Atlassian Document Format (ADF) document from a plain text string.
 * Jira v3 requires ADF for description and comment bodies.
 */
function toAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  };
}

function jiraError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Jira returns errors as { errorMessages: string[], errors: Record<string, string> }
      const messages: string[] = [];
      if (Array.isArray(data.errorMessages)) {
        messages.push(...data.errorMessages);
      }
      if (data.errors && typeof data.errors === 'object') {
        for (const [field, msg] of Object.entries(data.errors)) {
          messages.push(`${field}: ${msg}`);
        }
      }
      if (messages.length > 0) {
        return { content: `Jira API error: ${messages.join('; ')}`, isError: true };
      }
    }
    return { content: `Jira API error: ${err.message}`, isError: true };
  }
  return { content: `Jira API error: ${String(err)}`, isError: true };
}

// ─── Tool: jira_create_issue ────────────────────────────

const createIssue: ToolHandler = {
  description:
    'Create a new Jira issue. Specify the project key, summary, and optionally description, issue type, priority, assignee, and labels.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project key (e.g. "PROJ", "ENG")',
      },
      summary: {
        type: 'string',
        description: 'Issue summary / title',
      },
      description: {
        type: 'string',
        description: 'Issue description (plain text, will be converted to ADF)',
      },
      issuetype: {
        type: 'string',
        description: 'Issue type name (default: "Task"). Common: "Bug", "Story", "Epic", "Task"',
      },
      priority: {
        type: 'string',
        enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
        description: 'Priority level',
      },
      assignee: {
        type: 'string',
        description: 'Assignee account ID (Atlassian account ID)',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to apply to the issue',
      },
    },
    required: ['project', 'summary'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getJiraHost(ctx);

      const fields: Record<string, any> = {
        project: { key: params.project },
        summary: params.summary,
        issuetype: { name: params.issuetype || 'Task' },
      };

      if (params.description) {
        fields.description = toAdf(params.description);
      }
      if (params.priority) {
        fields.priority = { name: params.priority };
      }
      if (params.assignee) {
        fields.assignee = { accountId: params.assignee };
      }
      if (params.labels?.length) {
        fields.labels = params.labels;
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/rest/api/3/issue`,
        body: { fields },
      });

      const issueUrl = `${host}/browse/${result.key}`;

      return {
        content: `Issue ${result.key} created: ${issueUrl}`,
        metadata: {
          key: result.key,
          id: result.id,
          url: issueUrl,
          project: params.project,
        },
      };
    } catch (err) {
      return jiraError(err);
    }
  },
};

// ─── Tool: jira_search ──────────────────────────────────

const searchIssues: ToolHandler = {
  description:
    'Search for Jira issues using JQL (Jira Query Language). Returns matching issues with key, summary, status, and assignee.',
  inputSchema: {
    type: 'object',
    properties: {
      jql: {
        type: 'string',
        description:
          'JQL query string (e.g. "project = PROJ AND status = Open", "assignee = currentUser() ORDER BY updated DESC")',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default 20)',
      },
      fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fields to return (default: ["summary", "status", "assignee", "priority"])',
      },
    },
    required: ['jql'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getJiraHost(ctx);

      const body = {
        jql: params.jql,
        maxResults: params.maxResults ?? 20,
        fields: params.fields || ['summary', 'status', 'assignee', 'priority'],
      };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/rest/api/3/search`,
        body,
      });

      const issues: any[] = result.issues || [];
      const total: number = result.total ?? 0;

      if (issues.length === 0) {
        return { content: `No issues found for JQL: ${params.jql}` };
      }

      const lines = issues.map((issue: any) => {
        const f = issue.fields || {};
        const summary = f.summary || 'Untitled';
        const status = f.status?.name || 'Unknown';
        const assignee = f.assignee?.displayName || 'Unassigned';
        const priority = f.priority?.name ? ` [${f.priority.name}]` : '';
        return `${issue.key} ${summary} -- ${status} (${assignee})${priority}`;
      });

      return {
        content: `Found ${total} issues (showing ${issues.length}):\n${lines.join('\n')}`,
        metadata: { total, shown: issues.length, jql: params.jql },
      };
    } catch (err) {
      return jiraError(err);
    }
  },
};

// ─── Tool: jira_get_issue ───────────────────────────────

const getIssue: ToolHandler = {
  description:
    'Get detailed information about a single Jira issue by its key (e.g. "PROJ-123").',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: {
        type: 'string',
        description: 'Issue key (e.g. "PROJ-123")',
      },
    },
    required: ['issueKey'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getJiraHost(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${host}/rest/api/3/issue/${params.issueKey}`,
      });

      const f = result.fields || {};
      const summary = f.summary || 'Untitled';
      const status = f.status?.name || 'Unknown';
      const priority = f.priority?.name || 'None';
      const assignee = f.assignee?.displayName || 'Unassigned';
      const reporter = f.reporter?.displayName || 'Unknown';
      const created = f.created ? new Date(f.created).toISOString().slice(0, 16) : 'Unknown';
      const updated = f.updated ? new Date(f.updated).toISOString().slice(0, 16) : 'Unknown';
      const issueType = f.issuetype?.name || 'Unknown';
      const labels = f.labels?.length ? f.labels.join(', ') : 'None';
      const issueUrl = `${host}/browse/${result.key}`;

      // Extract plain text from ADF description if present
      let description = 'No description';
      if (f.description && f.description.content) {
        const textParts: string[] = [];
        for (const block of f.description.content) {
          if (block.content) {
            for (const inline of block.content) {
              if (inline.text) textParts.push(inline.text);
            }
          }
          textParts.push('');
        }
        const extracted = textParts.join('\n').trim();
        if (extracted) description = extracted;
      }

      const output = [
        `${result.key}: ${summary}`,
        `URL: ${issueUrl}`,
        `Type: ${issueType}`,
        `Status: ${status}`,
        `Priority: ${priority}`,
        `Assignee: ${assignee}`,
        `Reporter: ${reporter}`,
        `Labels: ${labels}`,
        `Created: ${created}`,
        `Updated: ${updated}`,
        ``,
        `Description:`,
        description,
      ].join('\n');

      return {
        content: output,
        metadata: {
          key: result.key,
          id: result.id,
          url: issueUrl,
          status,
          assignee,
        },
      };
    } catch (err) {
      return jiraError(err);
    }
  },
};

// ─── Tool: jira_transition_issue ────────────────────────

const transitionIssue: ToolHandler = {
  description:
    'Transition a Jira issue to a new status (e.g. move from "To Do" to "In Progress"). Requires the transition ID. Optionally add a comment.',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: {
        type: 'string',
        description: 'Issue key (e.g. "PROJ-123")',
      },
      transitionId: {
        type: 'string',
        description:
          'Transition ID to execute. Use jira_get_issue or the Jira UI to find available transition IDs.',
      },
      comment: {
        type: 'string',
        description: 'Optional comment to add with the transition',
      },
    },
    required: ['issueKey', 'transitionId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getJiraHost(ctx);

      // First, fetch available transitions to validate and get the name
      const transitionsResult = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${host}/rest/api/3/issue/${params.issueKey}/transitions`,
      });

      const available: any[] = transitionsResult.transitions || [];
      const target = available.find((t: any) => String(t.id) === String(params.transitionId));

      if (!target) {
        const availableList = available
          .map((t: any) => `  ${t.id}: ${t.name} -> ${t.to?.name || 'unknown'}`)
          .join('\n');
        return {
          content: `Transition ID "${params.transitionId}" is not available for ${params.issueKey}.\nAvailable transitions:\n${availableList}`,
          isError: true,
        };
      }

      // Build the transition payload
      const body: Record<string, any> = {
        transition: { id: params.transitionId },
      };

      if (params.comment) {
        body.update = {
          comment: [
            {
              add: {
                body: toAdf(params.comment),
              },
            },
          ],
        };
      }

      await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/rest/api/3/issue/${params.issueKey}/transitions`,
        body,
      });

      const commentNote = params.comment ? ' (with comment)' : '';
      return {
        content: `Transitioned ${params.issueKey} via "${target.name}" -> ${target.to?.name || 'new status'} (transition ID: ${params.transitionId})${commentNote}`,
        metadata: {
          issueKey: params.issueKey,
          transitionId: params.transitionId,
          transitionName: target.name,
          toStatus: target.to?.name,
        },
      };
    } catch (err) {
      return jiraError(err);
    }
  },
};

// ─── Tool: jira_add_comment ─────────────────────────────

const addComment: ToolHandler = {
  description:
    'Add a comment to a Jira issue. The comment body is plain text and will be converted to ADF format.',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: {
        type: 'string',
        description: 'Issue key (e.g. "PROJ-123")',
      },
      body: {
        type: 'string',
        description: 'Comment text (plain text)',
      },
    },
    required: ['issueKey', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getJiraHost(ctx);

      const requestBody = {
        body: toAdf(params.body),
      };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/rest/api/3/issue/${params.issueKey}/comment`,
        body: requestBody,
      });

      return {
        content: `Comment added to ${params.issueKey} (comment ID: ${result.id})`,
        metadata: {
          issueKey: params.issueKey,
          commentId: result.id,
          author: result.author?.displayName,
        },
      };
    } catch (err) {
      return jiraError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const jiraAdapter: SkillAdapter = {
  skillId: 'jira',
  name: 'Jira',
  baseUrl: DEFAULT_HOST,
  auth: {
    type: 'oauth2',
    provider: 'atlassian',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Accept': 'application/json',
  },
  tools: {
    jira_create_issue: createIssue,
    jira_search: searchIssues,
    jira_get_issue: getIssue,
    jira_transition_issue: transitionIssue,
    jira_add_comment: addComment,
  },
  configSchema: {
    host: {
      type: 'string' as const,
      label: 'Jira Instance URL',
      description: 'Your Atlassian Cloud URL (e.g. https://yourcompany.atlassian.net)',
      required: true,
      placeholder: 'https://yourcompany.atlassian.net',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
