/**
 * MCP Skill Adapter — Heroku
 *
 * Maps Heroku Platform API endpoints to MCP tool handlers.
 * Provides access to app management, dyno listing, dyno restarts,
 * and config var retrieval.
 *
 * Heroku API docs: https://devcenter.heroku.com/articles/platform-api-reference
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function herokuError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || err.message;
      const id = data.id || '';
      const detail = id ? `${msg} (id: ${id})` : msg;
      return { content: `Heroku API error: ${detail}`, isError: true };
    }
    return { content: `Heroku API error: ${err.message}`, isError: true };
  }
  return { content: `Heroku API error: ${String(err)}`, isError: true };
}

// ─── Tool: heroku_list_apps ─────────────────────────────

const listApps: ToolHandler = {
  description:
    'List all Heroku apps accessible to the authenticated user. Returns app names, regions, stacks, and last updated times.',
  inputSchema: {
    type: 'object',
    properties: {
      range: {
        type: 'string',
        description: 'Range header for pagination (e.g. "id ..; max=50")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers: Record<string, string> = {};
      if (params.range) headers['Range'] = params.range;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/apps',
        headers,
      });

      const apps: any[] = Array.isArray(result) ? result : [];
      if (apps.length === 0) {
        return { content: 'No Heroku apps found.' };
      }

      const lines = apps.map((app: any) => {
        const name = app.name || 'unknown';
        const region = app.region?.name || 'unknown';
        const stack = app.build_stack?.name || app.stack?.name || 'unknown';
        const updated = app.updated_at
          ? new Date(app.updated_at).toISOString().slice(0, 16)
          : 'unknown';
        const webUrl = app.web_url || 'N/A';
        return `${name} — region: ${region}, stack: ${stack}, updated: ${updated}\n  URL: ${webUrl}`;
      });

      return {
        content: `Found ${apps.length} app(s):\n${lines.join('\n')}`,
        metadata: { count: apps.length },
      };
    } catch (err) {
      return herokuError(err);
    }
  },
};

// ─── Tool: heroku_get_app ───────────────────────────────

const getApp: ToolHandler = {
  description:
    'Get detailed information about a specific Heroku app by name or ID.',
  inputSchema: {
    type: 'object',
    properties: {
      appIdOrName: {
        type: 'string',
        description: 'App name or UUID',
      },
    },
    required: ['appIdOrName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/apps/${params.appIdOrName}`);

      return {
        content: [
          `App: ${result.name || 'unknown'}`,
          `ID: ${result.id || 'unknown'}`,
          `Region: ${result.region?.name || 'unknown'}`,
          `Stack: ${result.build_stack?.name || result.stack?.name || 'unknown'}`,
          `Web URL: ${result.web_url || 'N/A'}`,
          `Git URL: ${result.git_url || 'N/A'}`,
          `Owner: ${result.owner?.email || 'unknown'}`,
          `Team: ${result.team?.name || 'personal'}`,
          `Maintenance: ${result.maintenance ? 'ON' : 'OFF'}`,
          `Created: ${result.created_at || 'unknown'}`,
          `Updated: ${result.updated_at || 'unknown'}`,
          `Slug Size: ${result.slug_size ? `${(result.slug_size / 1024 / 1024).toFixed(1)} MB` : 'N/A'}`,
          `Repo Size: ${result.repo_size ? `${(result.repo_size / 1024 / 1024).toFixed(1)} MB` : 'N/A'}`,
        ].join('\n'),
        metadata: {
          name: result.name,
          id: result.id,
          region: result.region?.name,
          webUrl: result.web_url,
        },
      };
    } catch (err) {
      return herokuError(err);
    }
  },
};

// ─── Tool: heroku_list_dynos ────────────────────────────

const listDynos: ToolHandler = {
  description:
    'List all dynos for a Heroku app. Returns dyno names, types, states, sizes, and commands.',
  inputSchema: {
    type: 'object',
    properties: {
      appIdOrName: {
        type: 'string',
        description: 'App name or UUID',
      },
    },
    required: ['appIdOrName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/apps/${params.appIdOrName}/dynos`);

      const dynos: any[] = Array.isArray(result) ? result : [];
      if (dynos.length === 0) {
        return { content: `No dynos found for app "${params.appIdOrName}".` };
      }

      const lines = dynos.map((d: any) => {
        const name = d.name || 'unknown';
        const type = d.type || 'unknown';
        const state = d.state || 'unknown';
        const size = d.size || 'unknown';
        const command = d.command || 'N/A';
        const updated = d.updated_at
          ? new Date(d.updated_at).toISOString().slice(0, 16)
          : 'unknown';
        return `${name} (${type}) — ${state}, size: ${size}, updated: ${updated}\n  command: ${command}`;
      });

      return {
        content: `Found ${dynos.length} dyno(s) for "${params.appIdOrName}":\n${lines.join('\n')}`,
        metadata: { count: dynos.length, app: params.appIdOrName },
      };
    } catch (err) {
      return herokuError(err);
    }
  },
};

// ─── Tool: heroku_restart_dyno ──────────────────────────

const restartDyno: ToolHandler = {
  description:
    'Restart a specific dyno or all dynos for a Heroku app. If dynoIdOrName is omitted, all dynos are restarted.',
  inputSchema: {
    type: 'object',
    properties: {
      appIdOrName: {
        type: 'string',
        description: 'App name or UUID',
      },
      dynoIdOrName: {
        type: 'string',
        description: 'Dyno name or UUID (e.g. "web.1"). Omit to restart all dynos.',
      },
    },
    required: ['appIdOrName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (params.dynoIdOrName) {
        await ctx.apiExecutor.delete(
          `/apps/${params.appIdOrName}/dynos/${params.dynoIdOrName}`,
        );
        return {
          content: `Dyno "${params.dynoIdOrName}" restarted for app "${params.appIdOrName}".`,
          metadata: { app: params.appIdOrName, dyno: params.dynoIdOrName },
        };
      } else {
        await ctx.apiExecutor.delete(`/apps/${params.appIdOrName}/dynos`);
        return {
          content: `All dynos restarted for app "${params.appIdOrName}".`,
          metadata: { app: params.appIdOrName, dyno: 'all' },
        };
      }
    } catch (err) {
      return herokuError(err);
    }
  },
};

// ─── Tool: heroku_get_config ────────────────────────────

const getConfig: ToolHandler = {
  description:
    'Get config vars (environment variables) for a Heroku app. Returns all key-value pairs. Sensitive values may be masked.',
  inputSchema: {
    type: 'object',
    properties: {
      appIdOrName: {
        type: 'string',
        description: 'App name or UUID',
      },
    },
    required: ['appIdOrName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/apps/${params.appIdOrName}/config-vars`);

      const vars = result && typeof result === 'object' ? result : {};
      const entries = Object.entries(vars);

      if (entries.length === 0) {
        return { content: `No config vars found for app "${params.appIdOrName}".` };
      }

      const lines = entries.map(([key, value]) => {
        // Mask potentially sensitive values
        const masked = typeof value === 'string' && value.length > 4
          ? `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 20))}${value.slice(-2)}`
          : '****';
        return `${key}=${masked}`;
      });

      return {
        content: `Config vars for "${params.appIdOrName}" (${entries.length} var(s)):\n${lines.join('\n')}`,
        metadata: { count: entries.length, app: params.appIdOrName, keys: entries.map(([k]) => k) },
      };
    } catch (err) {
      return herokuError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const herokuAdapter: SkillAdapter = {
  skillId: 'heroku',
  name: 'Heroku',
  baseUrl: 'https://api.heroku.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Accept': 'application/vnd.heroku+json; version=3',
  },
  tools: {
    heroku_list_apps: listApps,
    heroku_get_app: getApp,
    heroku_list_dynos: listDynos,
    heroku_restart_dyno: restartDyno,
    heroku_get_config: getConfig,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
