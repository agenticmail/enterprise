/**
 * MCP Skill Adapter — Render
 *
 * Maps Render REST API endpoints to MCP tool handlers.
 * Provides access to service management, deploy listing,
 * deploy triggering, and environment variable management.
 *
 * Render API docs: https://api-docs.render.com/reference/introduction
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function renderError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || err.message;
      const id = data.id || '';
      const detail = id ? `${msg} (id: ${id})` : msg;
      return { content: `Render API error: ${detail}`, isError: true };
    }
    return { content: `Render API error: ${err.message}`, isError: true };
  }
  return { content: `Render API error: ${String(err)}`, isError: true };
}

// ─── Tool: render_list_services ─────────────────────────

const listServices: ToolHandler = {
  description:
    'List all services in the Render account. Returns service names, types, regions, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['web_service', 'static_site', 'private_service', 'background_worker', 'cron_job'],
        description: 'Filter by service type (optional)',
      },
      name: {
        type: 'string',
        description: 'Filter by service name (partial match)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of services to return (default 20)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.type) query.type = params.type;
      if (params.name) query.name = params.name;
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get('/services', query);

      const services: any[] = Array.isArray(result) ? result : (result.services || []);
      if (services.length === 0) {
        return { content: 'No Render services found.' };
      }

      const lines = services.map((item: any) => {
        const svc = item.service || item;
        const name = svc.name || 'unknown';
        const id = svc.id || 'unknown';
        const type = svc.type || 'unknown';
        const region = svc.region || 'unknown';
        const suspended = svc.suspended === 'suspended' ? ' [SUSPENDED]' : '';
        const url = svc.serviceDetails?.url || 'N/A';
        return `${name} (ID: ${id}) — ${type}, region: ${region}${suspended}\n  URL: ${url}`;
      });

      return {
        content: `Found ${services.length} service(s):\n${lines.join('\n')}`,
        metadata: { count: services.length },
      };
    } catch (err) {
      return renderError(err);
    }
  },
};

// ─── Tool: render_get_service ───────────────────────────

const getService: ToolHandler = {
  description:
    'Get detailed information about a specific Render service by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      serviceId: {
        type: 'string',
        description: 'Render service ID (e.g. "srv-abc123")',
      },
    },
    required: ['serviceId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/services/${params.serviceId}`);

      const svc = result.service || result;
      const details = svc.serviceDetails || {};

      return {
        content: [
          `Service: ${svc.name || 'unknown'}`,
          `ID: ${svc.id || params.serviceId}`,
          `Type: ${svc.type || 'unknown'}`,
          `Region: ${svc.region || 'unknown'}`,
          `Status: ${svc.suspended || 'active'}`,
          `URL: ${details.url || 'N/A'}`,
          `Build Command: ${details.buildCommand || 'N/A'}`,
          `Start Command: ${details.startCommand || 'N/A'}`,
          `Repo: ${svc.repo || 'N/A'}`,
          `Branch: ${svc.branch || 'N/A'}`,
          `Auto Deploy: ${svc.autoDeploy || 'unknown'}`,
          `Created: ${svc.createdAt || 'unknown'}`,
          `Updated: ${svc.updatedAt || 'unknown'}`,
        ].join('\n'),
        metadata: {
          serviceId: svc.id || params.serviceId,
          name: svc.name,
          type: svc.type,
          url: details.url,
        },
      };
    } catch (err) {
      return renderError(err);
    }
  },
};

// ─── Tool: render_list_deploys ──────────────────────────

const listDeploys: ToolHandler = {
  description:
    'List recent deploys for a Render service. Returns deploy IDs, statuses, commit info, and timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      serviceId: {
        type: 'string',
        description: 'Render service ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of deploys to return (default 20)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
    required: ['serviceId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get(`/services/${params.serviceId}/deploys`, query);

      const deploys: any[] = Array.isArray(result) ? result : (result.deploys || []);
      if (deploys.length === 0) {
        return { content: `No deploys found for service "${params.serviceId}".` };
      }

      const lines = deploys.map((item: any) => {
        const d = item.deploy || item;
        const id = d.id || 'unknown';
        const status = d.status || 'unknown';
        const commit = d.commit?.id?.slice(0, 7) || 'N/A';
        const message = d.commit?.message?.split('\n')[0] || 'no message';
        const created = d.createdAt
          ? new Date(d.createdAt).toISOString().slice(0, 16)
          : 'unknown';
        const finishedAt = d.finishedAt
          ? new Date(d.finishedAt).toISOString().slice(0, 16)
          : 'in progress';
        return `${id} — ${status} (${commit}) ${message}\n  created: ${created}, finished: ${finishedAt}`;
      });

      return {
        content: `Found ${deploys.length} deploy(s) for service "${params.serviceId}":\n${lines.join('\n')}`,
        metadata: { count: deploys.length, serviceId: params.serviceId },
      };
    } catch (err) {
      return renderError(err);
    }
  },
};

// ─── Tool: render_trigger_deploy ────────────────────────

const triggerDeploy: ToolHandler = {
  description:
    'Trigger a new deploy for a Render service. Optionally clear the build cache.',
  inputSchema: {
    type: 'object',
    properties: {
      serviceId: {
        type: 'string',
        description: 'Render service ID',
      },
      clearCache: {
        type: 'string',
        enum: ['clear', 'do_not_clear'],
        description: 'Whether to clear the build cache (default: "do_not_clear")',
      },
    },
    required: ['serviceId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.clearCache) body.clearCache = params.clearCache;

      const result = await ctx.apiExecutor.post(
        `/services/${params.serviceId}/deploys`,
        body,
      );

      const deploy = result.deploy || result;
      const id = deploy.id || 'unknown';
      const status = deploy.status || 'created';

      return {
        content: `Deploy triggered for service "${params.serviceId}"\nDeploy ID: ${id}\nStatus: ${status}`,
        metadata: {
          serviceId: params.serviceId,
          deployId: id,
          status,
        },
      };
    } catch (err) {
      return renderError(err);
    }
  },
};

// ─── Tool: render_list_envs ─────────────────────────────

const listEnvs: ToolHandler = {
  description:
    'List environment variables for a Render service. Sensitive values are masked.',
  inputSchema: {
    type: 'object',
    properties: {
      serviceId: {
        type: 'string',
        description: 'Render service ID',
      },
    },
    required: ['serviceId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/services/${params.serviceId}/env-vars`);

      const envVars: any[] = Array.isArray(result) ? result : (result.envVars || []);
      if (envVars.length === 0) {
        return { content: `No environment variables found for service "${params.serviceId}".` };
      }

      const lines = envVars.map((ev: any) => {
        const item = ev.envVar || ev;
        const key = item.key || 'unknown';
        const value = item.value || '';
        // Mask sensitive values
        const masked = value.length > 4
          ? `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 20))}${value.slice(-2)}`
          : '****';
        return `${key}=${masked}`;
      });

      return {
        content: `Environment variables for service "${params.serviceId}" (${envVars.length} var(s)):\n${lines.join('\n')}`,
        metadata: {
          count: envVars.length,
          serviceId: params.serviceId,
          keys: envVars.map((ev: any) => (ev.envVar || ev).key),
        },
      };
    } catch (err) {
      return renderError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const renderAdapter: SkillAdapter = {
  skillId: 'render',
  name: 'Render',
  baseUrl: 'https://api.render.com/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    render_list_services: listServices,
    render_get_service: getService,
    render_list_deploys: listDeploys,
    render_trigger_deploy: triggerDeploy,
    render_list_envs: listEnvs,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
