/**
 * MCP Skill Adapter — Sentry
 *
 * Maps Sentry REST API endpoints to MCP tool handlers.
 * Covers issue listing, event browsing, project listing, and issue resolution.
 *
 * Sentry API docs: https://docs.sentry.io/api/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function sentryError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.detail || data.message || err.message;
      return { content: `Sentry API error: ${detail}`, isError: true };
    }
    return { content: `Sentry API error: ${err.message}`, isError: true };
  }
  return { content: `Sentry API error: ${String(err)}`, isError: true };
}

/** Resolve the organization slug from skill config. */
function orgSlug(ctx: ToolExecutionContext): string {
  return ctx.skillConfig.organization || 'unknown';
}

// ─── Tool: sentry_list_issues ───────────────────────────

const listIssues: ToolHandler = {
  description:
    'List Sentry issues for a project. Filter by query string, sort order, or status.',
  inputSchema: {
    type: 'object',
    properties: {
      project_slug: {
        type: 'string',
        description: 'The project slug (e.g. "my-web-app")',
      },
      query: {
        type: 'string',
        description: 'Search query (e.g. "is:unresolved level:error")',
      },
      sort: {
        type: 'string',
        enum: ['date', 'new', 'priority', 'freq', 'user'],
        description: 'Sort order for issues (default: "date")',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    required: ['project_slug'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const org = orgSlug(ctx);
      const query: Record<string, string> = {};
      if (params.query) query.query = params.query;
      if (params.sort) query.sort = params.sort;
      if (params.cursor) query.cursor = params.cursor;

      const issues: any[] = await ctx.apiExecutor.get(
        `/projects/${org}/${params.project_slug}/issues/`,
        query,
      );

      if (!Array.isArray(issues) || issues.length === 0) {
        return {
          content: `No issues found in project "${params.project_slug}".`,
          metadata: { issueCount: 0 },
        };
      }

      const lines = issues.map((i: any) => {
        const level = (i.level || 'unknown').toUpperCase();
        const count = i.count || 0;
        const users = i.userCount || 0;
        const lastSeen = i.lastSeen ? new Date(i.lastSeen).toLocaleString() : 'unknown';
        return `[${level}] ${i.title} (ID: ${i.id}) — events: ${count}, users: ${users}, last seen: ${lastSeen}`;
      });

      return {
        content: `Found ${issues.length} issue(s) in "${params.project_slug}":\n\n${lines.join('\n')}`,
        metadata: { issueCount: issues.length },
      };
    } catch (err) {
      return sentryError(err);
    }
  },
};

// ─── Tool: sentry_get_issue ─────────────────────────────

const getIssue: ToolHandler = {
  description:
    'Retrieve details of a specific Sentry issue by its ID. Returns title, culprit, status, event count, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      issue_id: {
        type: 'string',
        description: 'The numeric Sentry issue ID',
      },
    },
    required: ['issue_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const issue = await ctx.apiExecutor.get(`/issues/${params.issue_id}/`);

      const content = [
        `Issue: ${issue.title} (ID: ${issue.id})`,
        `Status: ${issue.status}`,
        `Level: ${(issue.level || 'unknown').toUpperCase()}`,
        `Culprit: ${issue.culprit || '(none)'}`,
        `Platform: ${issue.platform || 'unknown'}`,
        `Events: ${issue.count || 0}`,
        `Users affected: ${issue.userCount || 0}`,
        `First seen: ${issue.firstSeen ? new Date(issue.firstSeen).toLocaleString() : 'unknown'}`,
        `Last seen: ${issue.lastSeen ? new Date(issue.lastSeen).toLocaleString() : 'unknown'}`,
        `Link: ${issue.permalink || 'N/A'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          issueId: issue.id,
          title: issue.title,
          status: issue.status,
          level: issue.level,
        },
      };
    } catch (err) {
      return sentryError(err);
    }
  },
};

// ─── Tool: sentry_list_events ───────────────────────────

const listEvents: ToolHandler = {
  description:
    'List events for a specific Sentry issue. Returns event IDs, timestamps, and tags.',
  inputSchema: {
    type: 'object',
    properties: {
      issue_id: {
        type: 'string',
        description: 'The numeric Sentry issue ID',
      },
      full: {
        type: 'boolean',
        description: 'Include full event details (default false)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    required: ['issue_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.full) query.full = 'true';
      if (params.cursor) query.cursor = params.cursor;

      const events: any[] = await ctx.apiExecutor.get(
        `/issues/${params.issue_id}/events/`,
        query,
      );

      if (!Array.isArray(events) || events.length === 0) {
        return {
          content: `No events found for issue ${params.issue_id}.`,
          metadata: { eventCount: 0 },
        };
      }

      const lines = events.map((e: any) => {
        const date = e.dateCreated ? new Date(e.dateCreated).toLocaleString() : 'unknown';
        const tags = (e.tags || []).map((t: any) => `${t.key}=${t.value}`).join(', ') || 'no tags';
        return `• ${e.eventID} (${date}) — tags: ${tags}`;
      });

      return {
        content: `Found ${events.length} event(s) for issue ${params.issue_id}:\n\n${lines.join('\n')}`,
        metadata: { eventCount: events.length, issueId: params.issue_id },
      };
    } catch (err) {
      return sentryError(err);
    }
  },
};

// ─── Tool: sentry_list_projects ─────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all Sentry projects in the organization. Returns project slugs, platforms, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const org = orgSlug(ctx);
      const query: Record<string, string> = {};
      if (params.cursor) query.cursor = params.cursor;

      const projects: any[] = await ctx.apiExecutor.get(
        `/organizations/${org}/projects/`,
        query,
      );

      if (!Array.isArray(projects) || projects.length === 0) {
        return {
          content: `No projects found in organization "${org}".`,
          metadata: { projectCount: 0 },
        };
      }

      const lines = projects.map((p: any) => {
        const platform = p.platform || 'unknown';
        const status = p.status || 'active';
        return `• ${p.slug} — platform: ${platform}, status: ${status} (ID: ${p.id})`;
      });

      return {
        content: `Found ${projects.length} project(s) in "${org}":\n\n${lines.join('\n')}`,
        metadata: { projectCount: projects.length, organization: org },
      };
    } catch (err) {
      return sentryError(err);
    }
  },
};

// ─── Tool: sentry_resolve_issue ─────────────────────────

const resolveIssue: ToolHandler = {
  description:
    'Resolve a Sentry issue by setting its status to "resolved". Can also set status to "ignored" or "unresolved".',
  inputSchema: {
    type: 'object',
    properties: {
      issue_id: {
        type: 'string',
        description: 'The numeric Sentry issue ID',
      },
      status: {
        type: 'string',
        enum: ['resolved', 'unresolved', 'ignored'],
        description: 'New status for the issue (default: "resolved")',
      },
    },
    required: ['issue_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const newStatus = params.status || 'resolved';
      const result = await ctx.apiExecutor.put(`/issues/${params.issue_id}/`, {
        status: newStatus,
      });

      return {
        content: `Issue ${params.issue_id} updated to "${result.status || newStatus}".`,
        metadata: {
          issueId: params.issue_id,
          status: result.status || newStatus,
        },
      };
    } catch (err) {
      return sentryError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const sentryAdapter: SkillAdapter = {
  skillId: 'sentry',
  name: 'Sentry Error Tracking',
  baseUrl: 'https://sentry.io/api/0',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    sentry_list_issues: listIssues,
    sentry_get_issue: getIssue,
    sentry_list_events: listEvents,
    sentry_list_projects: listProjects,
    sentry_resolve_issue: resolveIssue,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
  configSchema: {
    organization: {
      type: 'string' as const,
      label: 'Organization Slug',
      description: 'Your Sentry organization slug (found in dashboard URL)',
      required: true,
      placeholder: 'my-org',
    },
  },
};
