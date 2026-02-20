/**
 * MCP Skill Adapter — Microsoft Power Automate
 *
 * Maps Microsoft Power Automate (Flow) API endpoints to MCP tool handlers.
 * Handles flow listing, triggering, inspection, run listing, and run details.
 *
 * The environment ID is read from ctx.skillConfig.environment.
 *
 * Power Automate API docs: https://learn.microsoft.com/en-us/power-automate/web-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Power Automate environment ID from skill config */
function envId(ctx: ToolExecutionContext): string {
  const env = ctx.skillConfig.environment;
  if (!env) {
    throw new Error('Power Automate environment ID is required in skillConfig (e.g. { environment: "Default-xxxx-xxxx" })');
  }
  return env;
}

function paError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Power Automate returns { error: { code, message } }
      const errorObj = data.error || data;
      const msg = errorObj.message || err.message;
      const code = errorObj.code || '';
      const codePart = code ? `[${code}] ` : '';
      return { content: `Power Automate API error: ${codePart}${msg}`, isError: true };
    }
    return { content: `Power Automate API error: ${err.message}`, isError: true };
  }
  return { content: `Power Automate API error: ${String(err)}`, isError: true };
}

/** Format flow state into readable label */
function flowStateLabel(state: string | undefined): string {
  const labels: Record<string, string> = {
    Started: '[Active]',
    Stopped: '[Stopped]',
    Suspended: '[Suspended]',
  };
  return labels[state ?? ''] ?? `[${state ?? 'unknown'}]`;
}

/** Format run status */
function runStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    Succeeded: '[Success]',
    Failed: '[Failed]',
    Running: '[Running]',
    Cancelled: '[Cancelled]',
    Waiting: '[Waiting]',
  };
  return labels[status ?? ''] ?? `[${status ?? 'unknown'}]`;
}

// ─── Tool: pa_list_flows ────────────────────────────────

const listFlows: ToolHandler = {
  description:
    'List flows (automations) in the Power Automate environment. Returns flow names, states, and trigger types.',
  inputSchema: {
    type: 'object',
    properties: {
      top: {
        type: 'number',
        description: 'Maximum number of flows to return (default 50)',
      },
      filter: {
        type: 'string',
        description: 'OData filter expression (e.g. "properties/state eq \'Started\'" for active flows only)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const environment = envId(ctx);

      const query: Record<string, string> = {
        'api-version': '2016-11-01',
        '$top': String(params.top ?? 50),
      };
      if (params.filter) query['$filter'] = params.filter;

      const result = await ctx.apiExecutor.get(
        `/providers/Microsoft.ProcessSimple/environments/${environment}/flows`,
        query,
      );

      const flows: any[] = result.value || [];
      if (flows.length === 0) {
        return { content: 'No flows found in this environment.' };
      }

      const lines = flows.map((f: any) => {
        const props = f.properties || {};
        const name = props.displayName || '(unnamed)';
        const state = flowStateLabel(props.state);
        const trigger = props.definitionSummary?.triggers?.[0]?.kind || 'unknown';
        const modified = props.lastModifiedTime
          ? new Date(props.lastModifiedTime).toLocaleDateString()
          : 'N/A';
        return `${name} ${state} -- Trigger: ${trigger} -- Modified: ${modified} (ID: ${f.name})`;
      });

      return {
        content: `${flows.length} flows in environment:\n${lines.join('\n')}`,
        metadata: { count: flows.length, environment },
      };
    } catch (err) {
      return paError(err);
    }
  },
};

// ─── Tool: pa_run_flow ──────────────────────────────────

const runFlow: ToolHandler = {
  description:
    'Trigger a Power Automate flow (must have an HTTP request or manual trigger). Optionally pass input data as the request body.',
  inputSchema: {
    type: 'object',
    properties: {
      flow_id: {
        type: 'string',
        description: 'The flow ID to trigger',
      },
      trigger_name: {
        type: 'string',
        description: 'Name of the trigger to invoke (default: "manual")',
      },
      input_data: {
        type: 'object',
        description: 'Input data to pass to the flow trigger (optional)',
      },
    },
    required: ['flow_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const environment = envId(ctx);
      const triggerName = params.trigger_name || 'manual';

      const result = await ctx.apiExecutor.post(
        `/providers/Microsoft.ProcessSimple/environments/${environment}/flows/${params.flow_id}/triggers/${triggerName}/run`,
        {
          ...(params.input_data || {}),
        },
      );

      const runId = result.name || result.id || 'unknown';
      const status = result.properties?.status || result.status || 'Triggered';

      return {
        content: `Flow triggered successfully.\nFlow ID: ${params.flow_id}\nRun ID: ${runId}\nStatus: ${status}`,
        metadata: {
          flowId: params.flow_id,
          runId,
          status,
          triggerName,
        },
      };
    } catch (err) {
      return paError(err);
    }
  },
};

// ─── Tool: pa_get_flow ──────────────────────────────────

const getFlow: ToolHandler = {
  description:
    'Get detailed information about a specific Power Automate flow. Returns name, state, trigger details, action count, and connection references.',
  inputSchema: {
    type: 'object',
    properties: {
      flow_id: {
        type: 'string',
        description: 'The flow ID to retrieve',
      },
    },
    required: ['flow_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const environment = envId(ctx);

      const result = await ctx.apiExecutor.get(
        `/providers/Microsoft.ProcessSimple/environments/${environment}/flows/${params.flow_id}`,
        { 'api-version': '2016-11-01' },
      );

      const props = result.properties || {};
      const triggers = props.definitionSummary?.triggers || [];
      const actions = props.definitionSummary?.actions || [];
      const connections = Object.keys(props.connectionReferences || {});

      const details = [
        `Flow: ${props.displayName || '(unnamed)'}`,
        `ID: ${result.name || params.flow_id}`,
        `State: ${flowStateLabel(props.state)}`,
        `Created: ${props.createdTime ? new Date(props.createdTime).toLocaleDateString() : 'N/A'}`,
        `Modified: ${props.lastModifiedTime ? new Date(props.lastModifiedTime).toLocaleDateString() : 'N/A'}`,
        `Creator: ${props.creator?.userId || 'N/A'}`,
        '',
        `Triggers (${triggers.length}):`,
        ...triggers.map((t: any) => `  - ${t.type || 'unknown'} (${t.kind || 'N/A'})`),
        '',
        `Actions: ${actions.length} step(s)`,
        `Connections: ${connections.length > 0 ? connections.join(', ') : 'None'}`,
      ].join('\n');

      return {
        content: details,
        metadata: {
          flowId: params.flow_id,
          name: props.displayName,
          state: props.state,
          actionCount: actions.length,
        },
      };
    } catch (err) {
      return paError(err);
    }
  },
};

// ─── Tool: pa_list_runs ─────────────────────────────────

const listRuns: ToolHandler = {
  description:
    'List recent runs (execution history) for a Power Automate flow. Returns run IDs, statuses, and durations.',
  inputSchema: {
    type: 'object',
    properties: {
      flow_id: {
        type: 'string',
        description: 'The flow ID to list runs for',
      },
      top: {
        type: 'number',
        description: 'Maximum number of runs to return (default 25)',
      },
      filter: {
        type: 'string',
        description: 'OData filter (e.g. "properties/status eq \'Failed\'" for failed runs only)',
      },
    },
    required: ['flow_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const environment = envId(ctx);

      const query: Record<string, string> = {
        'api-version': '2016-11-01',
        '$top': String(params.top ?? 25),
      };
      if (params.filter) query['$filter'] = params.filter;

      const result = await ctx.apiExecutor.get(
        `/providers/Microsoft.ProcessSimple/environments/${environment}/flows/${params.flow_id}/runs`,
        query,
      );

      const runs: any[] = result.value || [];
      if (runs.length === 0) {
        return { content: `No runs found for flow ${params.flow_id}.` };
      }

      const lines = runs.map((r: any) => {
        const props = r.properties || {};
        const status = runStatusLabel(props.status);
        const started = props.startTime ? new Date(props.startTime).toLocaleString() : 'N/A';
        const ended = props.endTime ? new Date(props.endTime).toLocaleString() : 'in progress';
        const trigger = props.trigger?.name || 'N/A';
        return `${status} Run ${r.name} -- Started: ${started} -- Ended: ${ended} -- Trigger: ${trigger}`;
      });

      return {
        content: `${runs.length} runs for flow ${params.flow_id}:\n${lines.join('\n')}`,
        metadata: { count: runs.length, flowId: params.flow_id },
      };
    } catch (err) {
      return paError(err);
    }
  },
};

// ─── Tool: pa_get_run ───────────────────────────────────

const getRun: ToolHandler = {
  description:
    'Get detailed information about a specific Power Automate flow run. Returns status, duration, trigger details, and action results.',
  inputSchema: {
    type: 'object',
    properties: {
      flow_id: {
        type: 'string',
        description: 'The flow ID',
      },
      run_id: {
        type: 'string',
        description: 'The run ID to retrieve',
      },
    },
    required: ['flow_id', 'run_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const environment = envId(ctx);

      const result = await ctx.apiExecutor.get(
        `/providers/Microsoft.ProcessSimple/environments/${environment}/flows/${params.flow_id}/runs/${params.run_id}`,
        { 'api-version': '2016-11-01' },
      );

      const props = result.properties || {};
      const startTime = props.startTime ? new Date(props.startTime) : null;
      const endTime = props.endTime ? new Date(props.endTime) : null;
      const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : null;
      const durationStr = durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : 'N/A';

      const details = [
        `Run: ${result.name || params.run_id}`,
        `Flow: ${params.flow_id}`,
        `Status: ${runStatusLabel(props.status)}`,
        `Started: ${startTime ? startTime.toLocaleString() : 'N/A'}`,
        `Ended: ${endTime ? endTime.toLocaleString() : 'in progress'}`,
        `Duration: ${durationStr}`,
        `Trigger: ${props.trigger?.name || 'N/A'} (${props.trigger?.status || 'N/A'})`,
        `Error: ${props.error?.message || props.code || 'None'}`,
      ].join('\n');

      return {
        content: `Flow Run Details:\n${details}`,
        metadata: {
          flowId: params.flow_id,
          runId: params.run_id,
          status: props.status,
          durationMs,
        },
      };
    } catch (err) {
      return paError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const powerAutomateAdapter: SkillAdapter = {
  skillId: 'power-automate',
  name: 'Microsoft Power Automate',
  baseUrl: 'https://api.flow.microsoft.com',
  auth: {
    type: 'oauth2',
    provider: 'microsoft',
  },
  tools: {
    pa_list_flows: listFlows,
    pa_run_flow: runFlow,
    pa_get_flow: getFlow,
    pa_list_runs: listRuns,
    pa_get_run: getRun,
  },
  configSchema: {
    environment: {
      type: 'string' as const,
      label: 'Environment ID',
      description: 'Your Power Automate environment ID (e.g. "Default-xxxx-xxxx-xxxx-xxxxxxxxxxxx")',
      required: true,
      placeholder: 'Default-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
