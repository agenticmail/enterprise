/**
 * MCP Skill Adapter — Fly.io
 *
 * Maps Fly.io Machines API endpoints to MCP tool handlers.
 * Provides access to app management, machine listing, and machine
 * start/stop operations.
 *
 * Fly.io Machines API docs: https://fly.io/docs/machines/api/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function flyError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error || data.message || err.message;
      const status = data.status || '';
      const detail = status ? `${msg} (status: ${status})` : msg;
      return { content: `Fly.io API error: ${detail}`, isError: true };
    }
    return { content: `Fly.io API error: ${err.message}`, isError: true };
  }
  return { content: `Fly.io API error: ${String(err)}`, isError: true };
}

// ─── Tool: fly_list_apps ────────────────────────────────

const listApps: ToolHandler = {
  description:
    'List all Fly.io apps in the organization. Returns app names, statuses, and networks.',
  inputSchema: {
    type: 'object',
    properties: {
      orgSlug: {
        type: 'string',
        description: 'Organization slug to filter by (uses configured org if omitted)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      const orgSlug = params.orgSlug || ctx.skillConfig.orgSlug;
      if (orgSlug) query.org_slug = orgSlug;

      const result = await ctx.apiExecutor.get('/apps', query);

      const apps: any[] = result.apps || (Array.isArray(result) ? result : []);
      if (apps.length === 0) {
        return { content: 'No Fly.io apps found.' };
      }

      const lines = apps.map((app: any) => {
        const name = app.name || 'unknown';
        const status = app.status || 'unknown';
        const org = app.organization?.slug || 'personal';
        const network = app.network || 'default';
        return `${name} — ${status}, org: ${org}, network: ${network}`;
      });

      return {
        content: `Found ${apps.length} Fly.io app(s):\n${lines.join('\n')}`,
        metadata: { count: apps.length },
      };
    } catch (err) {
      return flyError(err);
    }
  },
};

// ─── Tool: fly_get_app ──────────────────────────────────

const getApp: ToolHandler = {
  description:
    'Get detailed information about a specific Fly.io app by name.',
  inputSchema: {
    type: 'object',
    properties: {
      appName: {
        type: 'string',
        description: 'Fly.io app name',
      },
    },
    required: ['appName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/apps/${params.appName}`);

      return {
        content: [
          `App: ${result.name || params.appName}`,
          `ID: ${result.id || 'unknown'}`,
          `Status: ${result.status || 'unknown'}`,
          `Organization: ${result.organization?.slug || 'personal'}`,
          `Network: ${result.network || 'default'}`,
          `Hostname: ${result.hostname || 'N/A'}`,
          `Created: ${result.created_at || 'unknown'}`,
        ].join('\n'),
        metadata: {
          appName: result.name || params.appName,
          id: result.id,
          status: result.status,
        },
      };
    } catch (err) {
      return flyError(err);
    }
  },
};

// ─── Tool: fly_list_machines ────────────────────────────

const listMachines: ToolHandler = {
  description:
    'List all machines (VMs) for a Fly.io app. Returns machine IDs, states, regions, and image info.',
  inputSchema: {
    type: 'object',
    properties: {
      appName: {
        type: 'string',
        description: 'Fly.io app name',
      },
      includeDeleted: {
        type: 'boolean',
        description: 'Include destroyed machines in the listing (default false)',
      },
      region: {
        type: 'string',
        description: 'Filter by region code (e.g. "iad", "lhr")',
      },
    },
    required: ['appName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.includeDeleted) query.include_deleted = 'true';
      if (params.region) query.region = params.region;

      const result = await ctx.apiExecutor.get(`/apps/${params.appName}/machines`, query);

      const machines: any[] = Array.isArray(result) ? result : [];
      if (machines.length === 0) {
        return { content: `No machines found for app "${params.appName}".` };
      }

      const lines = machines.map((m: any) => {
        const id = m.id || 'unknown';
        const name = m.name || 'unnamed';
        const state = m.state || 'unknown';
        const region = m.region || 'unknown';
        const image = m.config?.image || m.image_ref?.repository || 'unknown';
        const cpus = m.config?.guest?.cpus || 'N/A';
        const memory = m.config?.guest?.memory_mb ? `${m.config.guest.memory_mb}MB` : 'N/A';
        return `${name} (${id}) — ${state}, region: ${region}, image: ${image}, ${cpus} CPU / ${memory} RAM`;
      });

      return {
        content: `Found ${machines.length} machine(s) for "${params.appName}":\n${lines.join('\n')}`,
        metadata: { count: machines.length, appName: params.appName },
      };
    } catch (err) {
      return flyError(err);
    }
  },
};

// ─── Tool: fly_start_machine ────────────────────────────

const startMachine: ToolHandler = {
  description:
    'Start a stopped Fly.io machine. The machine must be in a stopped state.',
  inputSchema: {
    type: 'object',
    properties: {
      appName: {
        type: 'string',
        description: 'Fly.io app name',
      },
      machineId: {
        type: 'string',
        description: 'Machine ID to start',
      },
    },
    required: ['appName', 'machineId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.post(
        `/apps/${params.appName}/machines/${params.machineId}/start`,
      );

      const status = result.status || result.state || 'started';
      return {
        content: `Machine "${params.machineId}" start requested for app "${params.appName}". Status: ${status}`,
        metadata: {
          machineId: params.machineId,
          appName: params.appName,
          status,
        },
      };
    } catch (err) {
      return flyError(err);
    }
  },
};

// ─── Tool: fly_stop_machine ─────────────────────────────

const stopMachine: ToolHandler = {
  description:
    'Stop a running Fly.io machine. Optionally send a specific signal.',
  inputSchema: {
    type: 'object',
    properties: {
      appName: {
        type: 'string',
        description: 'Fly.io app name',
      },
      machineId: {
        type: 'string',
        description: 'Machine ID to stop',
      },
      signal: {
        type: 'string',
        description: 'Signal to send (e.g. "SIGTERM", "SIGINT"). Default: "SIGTERM"',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds before force-stopping (default 5)',
      },
    },
    required: ['appName', 'machineId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.signal) body.signal = params.signal;
      if (params.timeout) body.timeout = params.timeout;

      const result = await ctx.apiExecutor.post(
        `/apps/${params.appName}/machines/${params.machineId}/stop`,
        body,
      );

      const status = result.status || result.state || 'stopped';
      return {
        content: `Machine "${params.machineId}" stop requested for app "${params.appName}". Status: ${status}`,
        metadata: {
          machineId: params.machineId,
          appName: params.appName,
          status,
        },
      };
    } catch (err) {
      return flyError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const flyioAdapter: SkillAdapter = {
  skillId: 'flyio',
  name: 'Fly.io',
  baseUrl: 'https://api.machines.dev/v1',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    fly_list_apps: listApps,
    fly_get_app: getApp,
    fly_list_machines: listMachines,
    fly_start_machine: startMachine,
    fly_stop_machine: stopMachine,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    orgSlug: {
      type: 'string' as const,
      label: 'Organization Slug',
      description: 'Default Fly.io organization slug (optional, filters app listing)',
      required: false,
      placeholder: 'my-org',
    },
  },
};
