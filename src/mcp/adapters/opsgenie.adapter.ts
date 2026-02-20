/**
 * MCP Skill Adapter — OpsGenie
 *
 * Maps OpsGenie Alert and Schedule API endpoints to MCP tool handlers.
 * OpsGenie uses GenieKey-based authentication.
 *
 * OpsGenie API docs: https://docs.opsgenie.com/docs/api-overview
 *
 * Tools:
 *   - opsgenie_list_alerts         List alerts with optional filters
 *   - opsgenie_create_alert        Create a new alert
 *   - opsgenie_acknowledge_alert   Acknowledge an alert
 *   - opsgenie_close_alert         Close an alert
 *   - opsgenie_list_schedules      List on-call schedules
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function opsgenieError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || err.message;
      const errors = data.errors ? ` -- ${JSON.stringify(data.errors)}` : '';
      return { content: `OpsGenie API error: ${message}${errors}`, isError: true };
    }
    return { content: `OpsGenie API error: ${err.message}`, isError: true };
  }
  return { content: `OpsGenie API error: ${String(err)}`, isError: true };
}

/** Format an OpsGenie alert for display */
function formatAlert(alert: any): string {
  const message = alert.message || '(no message)';
  const status = alert.status || 'unknown';
  const priority = alert.priority || 'N/A';
  const owner = alert.owner || 'unassigned';
  const created = alert.createdAt ? alert.createdAt.slice(0, 16) : '';
  const acknowledged = alert.acknowledged ? ' [acked]' : '';
  return `"${message}" (ID: ${alert.id}) -- ${status} (P${priority})${acknowledged} -- owner: ${owner} -- ${created}`;
}

/** Format an OpsGenie schedule for display */
function formatSchedule(schedule: any): string {
  const name = schedule.name || '(unnamed)';
  const enabled = schedule.enabled ? 'enabled' : 'disabled';
  const timezone = schedule.timezone || 'N/A';
  const team = schedule.ownerTeam?.name || 'N/A';
  return `${name} (ID: ${schedule.id}) -- ${enabled} -- timezone: ${timezone} -- team: ${team}`;
}

// ─── Tool: opsgenie_list_alerts ─────────────────────────

const listAlerts: ToolHandler = {
  description:
    'List alerts from OpsGenie. Optionally filter by query, status, or priority.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max alerts to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      query: {
        type: 'string',
        description: 'OpsGenie search query (e.g. "status=open AND priority=P1")',
      },
      sort: {
        type: 'string',
        enum: ['createdAt', 'updatedAt', 'tinyId'],
        description: 'Sort field (default: "createdAt")',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: "desc")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
        sort: params.sort || 'createdAt',
        order: params.order || 'desc',
      };
      if (params.query) query.query = params.query;

      const result = await ctx.apiExecutor.get('/alerts', query);

      const alerts: any[] = result.data || [];
      if (alerts.length === 0) {
        return { content: 'No alerts found.', metadata: { alertCount: 0 } };
      }

      const lines = alerts.map((a: any) => formatAlert(a));
      return {
        content: `${alerts.length} alert(s):\n${lines.join('\n')}`,
        metadata: { alertCount: alerts.length },
      };
    } catch (err) {
      return opsgenieError(err);
    }
  },
};

// ─── Tool: opsgenie_create_alert ────────────────────────

const createAlert: ToolHandler = {
  description:
    'Create a new alert in OpsGenie. Provide a message and optional priority, tags, and description.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Alert message (up to 130 characters)',
      },
      description: {
        type: 'string',
        description: 'Detailed description of the alert (up to 15000 characters)',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3', 'P4', 'P5'],
        description: 'Alert priority (default: "P3")',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to attach to the alert',
      },
      responders: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['team', 'user', 'escalation', 'schedule'] },
            id: { type: 'string' },
          },
          required: ['type', 'id'],
        },
        description: 'Responders to notify',
      },
      alias: {
        type: 'string',
        description: 'Unique alias for deduplication',
      },
    },
    required: ['message'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        message: params.message,
        priority: params.priority || 'P3',
      };
      if (params.description) body.description = params.description;
      if (params.tags?.length) body.tags = params.tags;
      if (params.responders?.length) body.responders = params.responders;
      if (params.alias) body.alias = params.alias;

      const result = await ctx.apiExecutor.post('/alerts', body);

      return {
        content: `Alert created: "${params.message}" -- request ID: ${result.requestId}`,
        metadata: {
          requestId: result.requestId,
          result: result.result,
          message: params.message,
          priority: params.priority || 'P3',
        },
      };
    } catch (err) {
      return opsgenieError(err);
    }
  },
};

// ─── Tool: opsgenie_acknowledge_alert ───────────────────

const acknowledgeAlert: ToolHandler = {
  description:
    'Acknowledge an OpsGenie alert. Accepts the alert by ID or alias.',
  inputSchema: {
    type: 'object',
    properties: {
      alert_id: {
        type: 'string',
        description: 'The alert ID or alias to acknowledge',
      },
      identifier_type: {
        type: 'string',
        enum: ['id', 'alias', 'tiny'],
        description: 'Type of identifier used (default: "id")',
      },
      user: {
        type: 'string',
        description: 'Display name of the user acknowledging the alert',
      },
      note: {
        type: 'string',
        description: 'Note to add when acknowledging',
      },
    },
    required: ['alert_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.identifier_type && params.identifier_type !== 'id') {
        query.identifierType = params.identifier_type;
      }

      const body: Record<string, any> = {};
      if (params.user) body.user = params.user;
      if (params.note) body.note = params.note;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/alerts/${params.alert_id}/acknowledge`,
        query,
        body,
      });

      return {
        content: `Alert ${params.alert_id} acknowledged -- ${result.result || 'success'}`,
        metadata: {
          requestId: result.requestId,
          alertId: params.alert_id,
        },
      };
    } catch (err) {
      return opsgenieError(err);
    }
  },
};

// ─── Tool: opsgenie_close_alert ─────────────────────────

const closeAlert: ToolHandler = {
  description:
    'Close an OpsGenie alert. Accepts the alert by ID or alias.',
  inputSchema: {
    type: 'object',
    properties: {
      alert_id: {
        type: 'string',
        description: 'The alert ID or alias to close',
      },
      identifier_type: {
        type: 'string',
        enum: ['id', 'alias', 'tiny'],
        description: 'Type of identifier used (default: "id")',
      },
      user: {
        type: 'string',
        description: 'Display name of the user closing the alert',
      },
      note: {
        type: 'string',
        description: 'Note to add when closing',
      },
    },
    required: ['alert_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.identifier_type && params.identifier_type !== 'id') {
        query.identifierType = params.identifier_type;
      }

      const body: Record<string, any> = {};
      if (params.user) body.user = params.user;
      if (params.note) body.note = params.note;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/alerts/${params.alert_id}/close`,
        query,
        body,
      });

      return {
        content: `Alert ${params.alert_id} closed -- ${result.result || 'success'}`,
        metadata: {
          requestId: result.requestId,
          alertId: params.alert_id,
        },
      };
    } catch (err) {
      return opsgenieError(err);
    }
  },
};

// ─── Tool: opsgenie_list_schedules ──────────────────────

const listSchedules: ToolHandler = {
  description:
    'List on-call schedules from OpsGenie. Returns schedule names, timezones, and teams.',
  inputSchema: {
    type: 'object',
    properties: {
      expand: {
        type: 'array',
        items: { type: 'string', enum: ['rotation'] },
        description: 'Expand additional fields (e.g. ["rotation"])',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.expand?.length) query.expand = params.expand.join(',');

      const result = await ctx.apiExecutor.get('/schedules', query);

      const schedules: any[] = result.data || [];
      if (schedules.length === 0) {
        return { content: 'No schedules found.', metadata: { scheduleCount: 0 } };
      }

      const lines = schedules.map((s: any) => formatSchedule(s));
      return {
        content: `${schedules.length} schedule(s):\n${lines.join('\n')}`,
        metadata: { scheduleCount: schedules.length },
      };
    } catch (err) {
      return opsgenieError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const opsgenieAdapter: SkillAdapter = {
  skillId: 'opsgenie',
  name: 'OpsGenie',
  baseUrl: 'https://api.opsgenie.com/v2',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'GenieKey',
  },
  tools: {
    opsgenie_list_alerts: listAlerts,
    opsgenie_create_alert: createAlert,
    opsgenie_acknowledge_alert: acknowledgeAlert,
    opsgenie_close_alert: closeAlert,
    opsgenie_list_schedules: listSchedules,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
