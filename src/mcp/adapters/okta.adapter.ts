/**
 * MCP Skill Adapter — Okta
 *
 * Maps Okta REST API v1 endpoints to MCP tool handlers.
 * Covers user management, group listing, application listing, and user deactivation.
 *
 * The Okta domain is dynamic, resolved from ctx.skillConfig.domain.
 *
 * Okta API docs: https://developer.okta.com/docs/reference/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Okta base URL from skill config domain. */
function oktaUrl(ctx: ToolExecutionContext): string {
  const domain = ctx.skillConfig.domain || 'example';
  // Support full domain or just subdomain
  if (domain.includes('.')) {
    return `https://${domain}/api/v1`;
  }
  return `https://${domain}.okta.com/api/v1`;
}

function oktaError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errorCode = data.errorCode || '';
      const errorSummary = data.errorSummary || data.message || err.message;
      const causes = (data.errorCauses || []).map((c: any) => c.errorSummary).join('; ');
      const msg = causes ? `${errorSummary} (${causes})` : errorSummary;
      return { content: `Okta API error [${errorCode}]: ${msg}`, isError: true };
    }
    return { content: `Okta API error: ${err.message}`, isError: true };
  }
  return { content: `Okta API error: ${String(err)}`, isError: true };
}

/** Format an Okta user status to a readable label. */
function userStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'ACTIVE': return 'Active';
    case 'STAGED': return 'Staged';
    case 'PROVISIONED': return 'Provisioned';
    case 'DEPROVISIONED': return 'Deprovisioned';
    case 'RECOVERY': return 'Recovery';
    case 'PASSWORD_EXPIRED': return 'Password Expired';
    case 'LOCKED_OUT': return 'Locked Out';
    case 'SUSPENDED': return 'Suspended';
    default: return status ?? 'unknown';
  }
}

// ─── Tool: okta_list_users ──────────────────────────────

const listUsers: ToolHandler = {
  description:
    'List Okta users. Optionally filter by search query, status, or pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Search query — matches against firstName, lastName, and email',
      },
      filter: {
        type: 'string',
        description: 'Okta filter expression (e.g. "status eq \\"ACTIVE\\"")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of users to return (default 20, max 200)',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor from the previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = oktaUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.q) query.q = params.q;
      if (params.filter) query.filter = params.filter;
      if (params.after) query.after = params.after;

      const users: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/users`,
        query,
      });

      if (!Array.isArray(users) || users.length === 0) {
        return {
          content: 'No users found.',
          metadata: { userCount: 0 },
        };
      }

      const lines = users.map((u: any) => {
        const profile = u.profile || {};
        const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'unknown';
        const email = profile.email || 'no email';
        const status = userStatusLabel(u.status);
        return `• ${name} (${email}) — ${status} (ID: ${u.id})`;
      });

      return {
        content: `Found ${users.length} user(s):\n\n${lines.join('\n')}`,
        metadata: { userCount: users.length },
      };
    } catch (err) {
      return oktaError(err);
    }
  },
};

// ─── Tool: okta_get_user ────────────────────────────────

const getUser: ToolHandler = {
  description:
    'Retrieve details of a specific Okta user by ID or login. Returns profile, status, and group memberships.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'User ID or login (email address)',
      },
    },
    required: ['user_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = oktaUrl(ctx);
      const user = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/users/${encodeURIComponent(params.user_id)}`,
      });

      const profile = user.profile || {};
      const content = [
        `User: ${profile.firstName || ''} ${profile.lastName || ''} (ID: ${user.id})`,
        `Login: ${profile.login || 'N/A'}`,
        `Email: ${profile.email || 'N/A'}`,
        `Status: ${userStatusLabel(user.status)}`,
        `Created: ${user.created ? new Date(user.created).toLocaleString() : 'unknown'}`,
        `Last login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'never'}`,
        `Last updated: ${user.lastUpdated ? new Date(user.lastUpdated).toLocaleString() : 'unknown'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          userId: user.id,
          login: profile.login,
          status: user.status,
        },
      };
    } catch (err) {
      return oktaError(err);
    }
  },
};

// ─── Tool: okta_list_groups ─────────────────────────────

const listGroups: ToolHandler = {
  description:
    'List Okta groups. Optionally filter by name or type.',
  inputSchema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Search query — matches group name',
      },
      filter: {
        type: 'string',
        description: 'Okta filter expression (e.g. "type eq \\"OKTA_GROUP\\"")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of groups to return (default 20, max 200)',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor from the previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = oktaUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.q) query.q = params.q;
      if (params.filter) query.filter = params.filter;
      if (params.after) query.after = params.after;

      const groups: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/groups`,
        query,
      });

      if (!Array.isArray(groups) || groups.length === 0) {
        return {
          content: 'No groups found.',
          metadata: { groupCount: 0 },
        };
      }

      const lines = groups.map((g: any) => {
        const profile = g.profile || {};
        const name = profile.name || 'unnamed';
        const description = profile.description || 'no description';
        const type = g.type || 'unknown';
        return `• ${name} (ID: ${g.id}) — type: ${type}, description: ${description}`;
      });

      return {
        content: `Found ${groups.length} group(s):\n\n${lines.join('\n')}`,
        metadata: { groupCount: groups.length },
      };
    } catch (err) {
      return oktaError(err);
    }
  },
};

// ─── Tool: okta_list_apps ───────────────────────────────

const listApps: ToolHandler = {
  description:
    'List Okta applications. Returns app names, labels, statuses, and sign-on modes.',
  inputSchema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Search query — matches app label',
      },
      filter: {
        type: 'string',
        description: 'Okta filter expression (e.g. "status eq \\"ACTIVE\\"")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of apps to return (default 20, max 200)',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor from the previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = oktaUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.q) query.q = params.q;
      if (params.filter) query.filter = params.filter;
      if (params.after) query.after = params.after;

      const apps: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/apps`,
        query,
      });

      if (!Array.isArray(apps) || apps.length === 0) {
        return {
          content: 'No applications found.',
          metadata: { appCount: 0 },
        };
      }

      const lines = apps.map((a: any) => {
        const label = a.label || 'unnamed';
        const status = a.status || 'unknown';
        const signOnMode = a.signOnMode || 'unknown';
        return `• ${label} (ID: ${a.id}) — status: ${status}, sign-on: ${signOnMode}`;
      });

      return {
        content: `Found ${apps.length} application(s):\n\n${lines.join('\n')}`,
        metadata: { appCount: apps.length },
      };
    } catch (err) {
      return oktaError(err);
    }
  },
};

// ─── Tool: okta_deactivate_user ─────────────────────────

const deactivateUser: ToolHandler = {
  description:
    'Deactivate an Okta user by their user ID. This changes the user status to DEPROVISIONED. The user can be reactivated later.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'The user ID to deactivate',
      },
      send_email: {
        type: 'boolean',
        description: 'Whether to send a deactivation email to the user (default false)',
      },
    },
    required: ['user_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = oktaUrl(ctx);
      const query: Record<string, string> = {};
      if (params.send_email !== undefined) {
        query.sendEmail = String(params.send_email);
      }

      await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/users/${params.user_id}/lifecycle/deactivate`,
        query,
      });

      return {
        content: `User ${params.user_id} has been deactivated successfully.`,
        metadata: {
          userId: params.user_id,
          action: 'deactivate',
        },
      };
    } catch (err) {
      return oktaError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const oktaAdapter: SkillAdapter = {
  skillId: 'okta',
  name: 'Okta Identity',
  // Base URL is dynamic from ctx.skillConfig.domain; tools use full URLs
  baseUrl: 'https://example.okta.com/api/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'SSWS',
  },
  tools: {
    okta_list_users: listUsers,
    okta_get_user: getUser,
    okta_list_groups: listGroups,
    okta_list_apps: listApps,
    okta_deactivate_user: deactivateUser,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    domain: {
      type: 'string' as const,
      label: 'Okta Domain',
      description: 'Your Okta domain (subdomain only, or full domain)',
      required: true,
      placeholder: 'mycompany',
    },
  },
};
