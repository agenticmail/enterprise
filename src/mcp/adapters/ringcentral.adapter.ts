/**
 * MCP Skill Adapter — RingCentral
 *
 * Maps RingCentral REST API v1.0 endpoints to MCP tool handlers.
 * Supports SMS messaging, extension management, call logs, and fax.
 *
 * RingCentral API docs: https://developers.ringcentral.com/api-reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function ringcentralError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.errorCode || err.message;
      const code = data.errorCode ? ` (${data.errorCode})` : '';
      return { content: `RingCentral API error: ${detail}${code}`, isError: true };
    }
    return { content: `RingCentral API error: ${err.message}`, isError: true };
  }
  return { content: `RingCentral API error: ${String(err)}`, isError: true };
}

// ─── Tool: ringcentral_send_sms ─────────────────────────

const sendSms: ToolHandler = {
  description:
    'Send an SMS message via RingCentral. Requires the sender extension phone number and recipient number.',
  inputSchema: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Sender phone number in E.164 format (must be a RingCentral number)',
      },
      to: {
        type: 'string',
        description: 'Recipient phone number in E.164 format (e.g. "+15551234567")',
      },
      text: {
        type: 'string',
        description: 'The SMS message body',
      },
    },
    required: ['from', 'to', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        from: { phoneNumber: params.from },
        to: [{ phoneNumber: params.to }],
        text: params.text,
      };

      const result = await ctx.apiExecutor.post('/account/~/extension/~/sms', body);

      return {
        content: `SMS sent (ID: ${result.id})\nFrom: ${params.from} -> To: ${params.to}\nStatus: ${result.messageStatus || 'Queued'}`,
        metadata: {
          id: result.id,
          from: params.from,
          to: params.to,
          status: result.messageStatus,
        },
      };
    } catch (err) {
      return ringcentralError(err);
    }
  },
};

// ─── Tool: ringcentral_list_extensions ──────────────────

const listExtensions: ToolHandler = {
  description:
    'List extensions (users, departments, IVR menus) on the RingCentral account.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['User', 'Department', 'Announcement', 'Voicemail', 'IvrMenu', 'PagingOnly', 'ParkLocation'],
        description: 'Filter by extension type (optional)',
      },
      status: {
        type: 'string',
        enum: ['Enabled', 'Disabled', 'NotActivated'],
        description: 'Filter by extension status (optional)',
      },
      perPage: {
        type: 'number',
        description: 'Number of results per page (default 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        perPage: String(params.perPage ?? 100),
      };
      if (params.type) query.type = params.type;
      if (params.status) query.status = params.status;

      const result = await ctx.apiExecutor.get('/account/~/extension', query);

      const extensions: any[] = result.records || [];
      if (extensions.length === 0) {
        return { content: 'No extensions found.' };
      }

      const lines = extensions.map((ext: any) => {
        const status = ext.status || 'unknown';
        const type = ext.type || 'unknown';
        const number = ext.extensionNumber || 'N/A';
        return `${ext.name} — Ext ${number} (${type}, ${status})`;
      });

      return {
        content: `Found ${extensions.length} extensions:\n${lines.join('\n')}`,
        metadata: { count: extensions.length },
      };
    } catch (err) {
      return ringcentralError(err);
    }
  },
};

// ─── Tool: ringcentral_get_call_log ─────────────────────

const getCallLog: ToolHandler = {
  description:
    'Retrieve the call log for the authenticated user or account. Filter by type, direction, and date range.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['Voice', 'Fax'],
        description: 'Filter by call type (optional)',
      },
      direction: {
        type: 'string',
        enum: ['Inbound', 'Outbound'],
        description: 'Filter by call direction (optional)',
      },
      dateFrom: {
        type: 'string',
        description: 'Start date in ISO 8601 format (e.g. "2024-01-01T00:00:00Z")',
      },
      dateTo: {
        type: 'string',
        description: 'End date in ISO 8601 format',
      },
      perPage: {
        type: 'number',
        description: 'Number of records per page (default 25)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        perPage: String(params.perPage ?? 25),
      };
      if (params.type) query.type = params.type;
      if (params.direction) query.direction = params.direction;
      if (params.dateFrom) query.dateFrom = params.dateFrom;
      if (params.dateTo) query.dateTo = params.dateTo;

      const result = await ctx.apiExecutor.get('/account/~/extension/~/call-log', query);

      const records: any[] = result.records || [];
      if (records.length === 0) {
        return { content: 'No call log entries found.' };
      }

      const lines = records.map((r: any) => {
        const direction = r.direction || 'unknown';
        const from = r.from?.phoneNumber || r.from?.name || 'unknown';
        const to = r.to?.phoneNumber || r.to?.name || 'unknown';
        const duration = r.duration ? `${r.duration}s` : 'N/A';
        const result = r.result || 'unknown';
        const date = r.startTime ? r.startTime.slice(0, 16) : '';
        return `[${direction}] ${from} -> ${to} — ${duration} — ${result} (${date})`;
      });

      return {
        content: `Found ${records.length} call log entries:\n${lines.join('\n')}`,
        metadata: { count: records.length },
      };
    } catch (err) {
      return ringcentralError(err);
    }
  },
};

// ─── Tool: ringcentral_send_fax ─────────────────────────

const sendFax: ToolHandler = {
  description:
    'Send a fax via RingCentral. Provide the recipient fax number and text content to fax.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient fax number in E.164 format (e.g. "+15551234567")',
      },
      text: {
        type: 'string',
        description: 'Text content to include in the fax body',
      },
      coverPageText: {
        type: 'string',
        description: 'Cover page message (optional)',
      },
      resolution: {
        type: 'string',
        enum: ['High', 'Low'],
        description: 'Fax resolution (default: "High")',
      },
    },
    required: ['to', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        to: [{ phoneNumber: params.to }],
        faxResolution: params.resolution || 'High',
      };
      if (params.coverPageText) body.coverPageText = params.coverPageText;

      // RingCentral fax API uses multipart; send text as body content
      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/account/~/extension/~/fax',
        body: {
          ...body,
          text: params.text,
        },
      });

      return {
        content: `Fax sent to ${params.to} (ID: ${result.id})\nStatus: ${result.messageStatus || 'Queued'}`,
        metadata: {
          id: result.id,
          to: params.to,
          status: result.messageStatus,
        },
      };
    } catch (err) {
      return ringcentralError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const ringcentralAdapter: SkillAdapter = {
  skillId: 'ringcentral',
  name: 'RingCentral',
  baseUrl: 'https://platform.ringcentral.com/restapi/v1.0',
  auth: {
    type: 'oauth2',
    provider: 'ringcentral',
  },
  tools: {
    ringcentral_send_sms: sendSms,
    ringcentral_list_extensions: listExtensions,
    ringcentral_get_call_log: getCallLog,
    ringcentral_send_fax: sendFax,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
};
