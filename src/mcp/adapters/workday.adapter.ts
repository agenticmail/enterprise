/**
 * MCP Skill Adapter — Workday
 *
 * Maps Workday REST API endpoints to MCP tool handlers.
 * Covers worker management, organization lookup, and time-off balances.
 *
 * The tenant name is read from ctx.skillConfig.tenant
 * and used to build the dynamic base URL.
 *
 * Workday API docs: https://community.workday.com/sites/default/files/file-hosting/restapi/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Workday base URL from skill config */
function wdUrl(ctx: ToolExecutionContext): string {
  const tenant = ctx.skillConfig.tenant;
  if (!tenant) {
    throw new Error('Workday tenant is required in skillConfig (e.g. { tenant: "mycompany" })');
  }
  return `https://${tenant}.workday.com/api/v1`;
}

function workdayError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error_description || data.error || data.message || err.message;
      return { content: `Workday API error: ${msg}`, isError: true };
    }
    return { content: `Workday API error: ${err.message}`, isError: true };
  }
  return { content: `Workday API error: ${String(err)}`, isError: true };
}

/** Format a Workday worker for display */
function formatWorker(worker: any): string {
  const descriptor = worker.descriptor || '(no name)';
  const id = worker.id || worker.workerId || 'N/A';
  const email = worker.primaryWorkEmail || worker.email || '';
  const emailPart = email ? ` <${email}>` : '';
  const position = worker.primaryPosition?.descriptor || worker.jobTitle || '';
  const posPart = position ? ` -- ${position}` : '';
  return `${descriptor}${emailPart}${posPart} (ID: ${id})`;
}

// ─── Tool: workday_list_workers ─────────────────────────

const listWorkers: ToolHandler = {
  description:
    'List workers from Workday. Returns a paginated list of all workers in the organization.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of workers to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wdUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/workers`,
        query,
      });

      const workers: any[] = result.data || [];
      const total = result.total ?? workers.length;

      if (workers.length === 0) {
        return { content: 'No workers found.' };
      }

      const lines = workers.map((w: any) => formatWorker(w));

      return {
        content: `Found ${total} workers (showing ${workers.length}):\n${lines.join('\n')}`,
        metadata: { count: workers.length, total },
      };
    } catch (err) {
      return workdayError(err);
    }
  },
};

// ─── Tool: workday_get_worker ───────────────────────────

const getWorker: ToolHandler = {
  description:
    'Get detailed information about a specific Workday worker by their ID. Returns name, position, department, manager, and contact info.',
  inputSchema: {
    type: 'object',
    properties: {
      worker_id: {
        type: 'string',
        description: 'The Workday worker ID',
      },
    },
    required: ['worker_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wdUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/workers/${params.worker_id}`,
      });

      const details = [
        `Name: ${result.descriptor || 'N/A'}`,
        `Worker ID: ${result.id || params.worker_id}`,
        `Email: ${result.primaryWorkEmail || 'N/A'}`,
        `Position: ${result.primaryPosition?.descriptor || 'N/A'}`,
        `Department: ${result.primaryPosition?.businessUnit?.descriptor || 'N/A'}`,
        `Manager: ${result.manager?.descriptor || 'N/A'}`,
        `Location: ${result.primaryWorkLocation?.descriptor || 'N/A'}`,
        `Hire Date: ${result.hireDate || 'N/A'}`,
        `Status: ${result.workerStatus?.descriptor || 'N/A'}`,
      ].join('\n');

      return {
        content: `Worker Details:\n${details}`,
        metadata: {
          workerId: params.worker_id,
          name: result.descriptor,
          email: result.primaryWorkEmail,
        },
      };
    } catch (err) {
      return workdayError(err);
    }
  },
};

// ─── Tool: workday_search_workers ───────────────────────

const searchWorkers: ToolHandler = {
  description:
    'Search for workers in Workday by name, email, or other criteria. Returns matching worker records.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string (searches name, email, worker ID)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 100)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wdUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/workers/search`,
        body: {
          query: params.query,
          limit: params.limit ?? 20,
        },
      });

      const workers: any[] = result.data || [];
      const total = result.total ?? workers.length;

      if (workers.length === 0) {
        return { content: `No workers found matching "${params.query}".` };
      }

      const lines = workers.map((w: any) => formatWorker(w));

      return {
        content: `Found ${total} workers matching "${params.query}" (showing ${workers.length}):\n${lines.join('\n')}`,
        metadata: { count: workers.length, total, query: params.query },
      };
    } catch (err) {
      return workdayError(err);
    }
  },
};

// ─── Tool: workday_list_organizations ───────────────────

const listOrganizations: ToolHandler = {
  description:
    'List organizations (departments, cost centers, divisions) in Workday. Useful for understanding the org structure.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['department', 'cost_center', 'division', 'company'],
        description: 'Organization type to filter by (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 50)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wdUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 50),
      };
      if (params.type) query.type = params.type;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/organizations`,
        query,
      });

      const orgs: any[] = result.data || [];
      if (orgs.length === 0) {
        return { content: 'No organizations found.' };
      }

      const lines = orgs.map((org: any) => {
        const name = org.descriptor || org.name || '(unnamed)';
        const type = org.organizationType?.descriptor || org.type || 'N/A';
        const head = org.leader?.descriptor ? ` -- Head: ${org.leader.descriptor}` : '';
        return `${name} (${type})${head} (ID: ${org.id})`;
      });

      return {
        content: `Found ${orgs.length} organizations:\n${lines.join('\n')}`,
        metadata: { count: orgs.length },
      };
    } catch (err) {
      return workdayError(err);
    }
  },
};

// ─── Tool: workday_get_time_off_balance ─────────────────

const getTimeOffBalance: ToolHandler = {
  description:
    'Get time-off balance information for a specific Workday worker. Shows available balances across different time-off plans.',
  inputSchema: {
    type: 'object',
    properties: {
      worker_id: {
        type: 'string',
        description: 'The Workday worker ID',
      },
      as_of_date: {
        type: 'string',
        description: 'Balance as of this date in YYYY-MM-DD format (default: today)',
      },
    },
    required: ['worker_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wdUrl(ctx);

      const query: Record<string, string> = {};
      if (params.as_of_date) query.asOfDate = params.as_of_date;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/workers/${params.worker_id}/timeOff/balances`,
        query,
      });

      const balances: any[] = result.data || [];
      if (balances.length === 0) {
        return {
          content: `No time-off balances found for worker #${params.worker_id}.`,
          metadata: { workerId: params.worker_id },
        };
      }

      const lines = balances.map((b: any) => {
        const planName = b.timeOffPlan?.descriptor || b.name || 'Unknown Plan';
        const balance = b.balance ?? 'N/A';
        const unit = b.unit?.descriptor || 'days';
        return `${planName}: ${balance} ${unit}`;
      });

      return {
        content: `Time-off balances for worker #${params.worker_id}:\n${lines.join('\n')}`,
        metadata: {
          workerId: params.worker_id,
          planCount: balances.length,
        },
      };
    } catch (err) {
      return workdayError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const workdayAdapter: SkillAdapter = {
  skillId: 'workday',
  name: 'Workday',
  // Base URL is dynamic based on tenant; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://TENANT.workday.com/api/v1',
  auth: {
    type: 'oauth2',
    provider: 'workday',
  },
  tools: {
    workday_list_workers: listWorkers,
    workday_get_worker: getWorker,
    workday_search_workers: searchWorkers,
    workday_list_organizations: listOrganizations,
    workday_get_time_off_balance: getTimeOffBalance,
  },
  configSchema: {
    tenant: {
      type: 'string' as const,
      label: 'Workday Tenant',
      description: 'Your Workday tenant name (e.g. "mycompany" for mycompany.workday.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
