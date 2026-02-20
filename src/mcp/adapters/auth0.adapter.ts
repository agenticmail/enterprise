/**
 * MCP Skill Adapter — Auth0
 *
 * Maps Auth0 Management API v2 endpoints to MCP tool handlers.
 * Covers user management, connection listing, client listing, and user blocking.
 *
 * The Auth0 domain is dynamic, resolved from ctx.skillConfig.domain.
 *
 * Auth0 Management API docs: https://auth0.com/docs/api/management/v2
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Auth0 Management API base URL from skill config domain. */
function auth0Url(ctx: ToolExecutionContext): string {
  const domain = ctx.skillConfig.domain || 'example.auth0.com';
  // Ensure domain includes auth0.com
  const fullDomain = domain.includes('.') ? domain : `${domain}.auth0.com`;
  return `https://${fullDomain}/api/v2`;
}

function auth0Error(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const statusCode = data.statusCode || '';
      const errorType = data.error || '';
      const message = data.message || data.error_description || err.message;
      return {
        content: `Auth0 API error (${statusCode} ${errorType}): ${message}`,
        isError: true,
      };
    }
    return { content: `Auth0 API error: ${err.message}`, isError: true };
  }
  return { content: `Auth0 API error: ${String(err)}`, isError: true };
}

// ─── Tool: auth0_list_users ─────────────────────────────

const listUsers: ToolHandler = {
  description:
    'List Auth0 users. Optionally search using Lucene query syntax or filter by connection.',
  inputSchema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Lucene query string (e.g. "email:*@example.com" or "name:John")',
      },
      connection: {
        type: 'string',
        description: 'Filter by connection name (e.g. "Username-Password-Authentication")',
      },
      per_page: {
        type: 'number',
        description: 'Number of users per page (default 20, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (0-indexed)',
      },
      sort: {
        type: 'string',
        description: 'Sort field and order (e.g. "created_at:-1" for newest first)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = auth0Url(ctx);
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 0),
        include_totals: 'true',
      };
      if (params.q) query.q = params.q;
      if (params.connection) query.connection = params.connection;
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/users`,
        query,
      });

      const users: any[] = result.users || (Array.isArray(result) ? result : []);
      const total = result.total || users.length;

      if (users.length === 0) {
        return {
          content: 'No users found.',
          metadata: { userCount: 0, total: 0 },
        };
      }

      const lines = users.map((u: any) => {
        const name = u.name || u.email || 'unknown';
        const email = u.email || 'no email';
        const logins = u.logins_count ?? 0;
        const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString() : 'never';
        const blocked = u.blocked ? ' [BLOCKED]' : '';
        return `• ${name} (${email}) — logins: ${logins}, last login: ${lastLogin}${blocked} (ID: ${u.user_id})`;
      });

      return {
        content: `Found ${users.length} of ${total} user(s):\n\n${lines.join('\n')}`,
        metadata: { userCount: users.length, total },
      };
    } catch (err) {
      return auth0Error(err);
    }
  },
};

// ─── Tool: auth0_get_user ───────────────────────────────

const getUser: ToolHandler = {
  description:
    'Retrieve details of a specific Auth0 user by their user_id. Returns profile, identities, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'The Auth0 user ID (e.g. "auth0|507f1f77bcf86cd799439011")',
      },
    },
    required: ['user_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = auth0Url(ctx);
      const user = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/users/${encodeURIComponent(params.user_id)}`,
      });

      const identities = (user.identities || []).map((id: any) => {
        return `${id.provider}/${id.connection}`;
      }).join(', ') || 'none';

      const content = [
        `User: ${user.name || 'N/A'} (ID: ${user.user_id})`,
        `Email: ${user.email || 'N/A'} (verified: ${user.email_verified ? 'yes' : 'no'})`,
        `Nickname: ${user.nickname || 'N/A'}`,
        `Picture: ${user.picture || 'N/A'}`,
        `Blocked: ${user.blocked ? 'Yes' : 'No'}`,
        `Login count: ${user.logins_count ?? 0}`,
        `Last login: ${user.last_login ? new Date(user.last_login).toLocaleString() : 'never'}`,
        `Last IP: ${user.last_ip || 'N/A'}`,
        `Created: ${user.created_at ? new Date(user.created_at).toLocaleString() : 'unknown'}`,
        `Identities: ${identities}`,
      ].join('\n');

      return {
        content,
        metadata: {
          userId: user.user_id,
          email: user.email,
          blocked: user.blocked,
        },
      };
    } catch (err) {
      return auth0Error(err);
    }
  },
};

// ─── Tool: auth0_list_connections ────────────────────────

const listConnections: ToolHandler = {
  description:
    'List Auth0 connections (identity providers). Returns connection names, strategies, and enabled clients.',
  inputSchema: {
    type: 'object',
    properties: {
      strategy: {
        type: 'string',
        description: 'Filter by strategy type (e.g. "auth0", "google-oauth2", "samlp")',
      },
      per_page: {
        type: 'number',
        description: 'Number of connections per page (default 20, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (0-indexed)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = auth0Url(ctx);
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 0),
      };
      if (params.strategy) query.strategy = params.strategy;

      const connections: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/connections`,
        query,
      });

      if (!Array.isArray(connections) || connections.length === 0) {
        return {
          content: 'No connections found.',
          metadata: { connectionCount: 0 },
        };
      }

      const lines = connections.map((c: any) => {
        const enabledClients = (c.enabled_clients || []).length;
        return `• ${c.name} (ID: ${c.id}) — strategy: ${c.strategy || 'unknown'}, enabled clients: ${enabledClients}`;
      });

      return {
        content: `Found ${connections.length} connection(s):\n\n${lines.join('\n')}`,
        metadata: { connectionCount: connections.length },
      };
    } catch (err) {
      return auth0Error(err);
    }
  },
};

// ─── Tool: auth0_list_clients ───────────────────────────

const listClients: ToolHandler = {
  description:
    'List Auth0 clients (applications). Returns client names, IDs, app types, and callback URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Number of clients per page (default 20, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (0-indexed)',
      },
      app_type: {
        type: 'string',
        enum: ['native', 'spa', 'regular_web', 'non_interactive'],
        description: 'Filter by application type',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = auth0Url(ctx);
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 0),
        include_totals: 'true',
      };
      if (params.app_type) query.app_type = params.app_type;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/clients`,
        query,
      });

      const clients: any[] = result.clients || (Array.isArray(result) ? result : []);
      const total = result.total || clients.length;

      if (clients.length === 0) {
        return {
          content: 'No clients found.',
          metadata: { clientCount: 0, total: 0 },
        };
      }

      const lines = clients.map((c: any) => {
        const appType = c.app_type || 'unknown';
        const callbacks = (c.callbacks || []).length;
        const isGlobal = c.global ? ' [GLOBAL]' : '';
        return `• ${c.name} (ID: ${c.client_id}) — type: ${appType}, callbacks: ${callbacks}${isGlobal}`;
      });

      return {
        content: `Found ${clients.length} of ${total} client(s):\n\n${lines.join('\n')}`,
        metadata: { clientCount: clients.length, total },
      };
    } catch (err) {
      return auth0Error(err);
    }
  },
};

// ─── Tool: auth0_block_user ─────────────────────────────

const blockUser: ToolHandler = {
  description:
    'Block or unblock an Auth0 user by setting the blocked flag. Blocked users cannot log in.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'The Auth0 user ID to block or unblock',
      },
      blocked: {
        type: 'boolean',
        description: 'Set to true to block the user, false to unblock (default true)',
      },
    },
    required: ['user_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = auth0Url(ctx);
      const blocked = params.blocked !== false;

      const result = await ctx.apiExecutor.request({
        method: 'PATCH',
        path: undefined,
        url: `${baseUrl}/users/${encodeURIComponent(params.user_id)}`,
        body: { blocked },
      });

      const action = blocked ? 'blocked' : 'unblocked';
      return {
        content: `User ${params.user_id} has been ${action} successfully.`,
        metadata: {
          userId: params.user_id,
          blocked,
          action,
        },
      };
    } catch (err) {
      return auth0Error(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const auth0Adapter: SkillAdapter = {
  skillId: 'auth0',
  name: 'Auth0',
  // Base URL is dynamic from ctx.skillConfig.domain; tools use full URLs
  baseUrl: 'https://example.auth0.com/api/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    auth0_list_users: listUsers,
    auth0_get_user: getUser,
    auth0_list_connections: listConnections,
    auth0_list_clients: listClients,
    auth0_block_user: blockUser,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    domain: {
      type: 'string' as const,
      label: 'Auth0 Domain',
      description: 'Your Auth0 tenant domain',
      required: true,
      placeholder: 'myapp.auth0.com',
    },
  },
};
