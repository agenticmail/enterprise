/**
 * MCP Skill Adapter — Twilio
 *
 * Maps Twilio REST API endpoints to MCP tool handlers.
 * Twilio uses Basic authentication with Account SID and Auth Token,
 * and sends POST bodies as application/x-www-form-urlencoded.
 *
 * Twilio REST API docs: https://www.twilio.com/docs/sms/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext, ResolvedCredentials } from '../framework/types.js';

// ─── State ──────────────────────────────────────────────

let accountSid = '';

// ─── Helpers ────────────────────────────────────────────

function twilioError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code ? ` (code ${data.code})` : '';
      return { content: `Twilio API error: ${data.message || err.message}${code}`, isError: true };
    }
    return { content: `Twilio API error: ${err.message}`, isError: true };
  }
  return { content: `Twilio API error: ${String(err)}`, isError: true };
}

/** Format a Twilio message record for display */
function formatMessage(msg: any): string {
  const from = msg.from || 'unknown';
  const to = msg.to || 'unknown';
  const status = msg.status || 'unknown';
  const body = (msg.body || '').slice(0, 160);
  const date = msg.date_sent || msg.date_created || '';
  return `[${status}] ${from} -> ${to} (${date}): ${body}`;
}

// ─── Tool: twilio_send_sms ──────────────────────────────

const sendSms: ToolHandler = {
  description:
    'Send an SMS message via Twilio. Requires a "From" phone number (your Twilio number) and a "To" phone number.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Destination phone number in E.164 format (e.g. "+15551234567")',
      },
      from: {
        type: 'string',
        description: 'Your Twilio phone number in E.164 format (e.g. "+15559876543")',
      },
      body: {
        type: 'string',
        description: 'The text message body (max 1600 characters)',
      },
    },
    required: ['to', 'from', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        body: {
          To: params.to,
          From: params.from,
          Body: params.body,
        },
        formEncoded: true,
      });

      return {
        content: `SMS sent (SID: ${result.sid})\nFrom: ${result.from} -> To: ${result.to}\nStatus: ${result.status}`,
        metadata: {
          sid: result.sid,
          from: result.from,
          to: result.to,
          status: result.status,
        },
      };
    } catch (err) {
      return twilioError(err);
    }
  },
};

// ─── Tool: twilio_list_messages ─────────────────────────

const listMessages: ToolHandler = {
  description:
    'List recent SMS messages from the Twilio account. Optionally filter by sender, recipient, or date.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Filter by recipient phone number (E.164 format)',
      },
      from: {
        type: 'string',
        description: 'Filter by sender phone number (E.164 format)',
      },
      date_sent: {
        type: 'string',
        description: 'Filter by date sent (YYYY-MM-DD format)',
      },
      page_size: {
        type: 'number',
        description: 'Number of messages to return (default 20, max 1000)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        PageSize: String(params.page_size ?? 20),
      };
      if (params.to) query.To = params.to;
      if (params.from) query.From = params.from;
      if (params.date_sent) query.DateSent = params.date_sent;

      const result = await ctx.apiExecutor.get(
        `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        query,
      );

      const messages: any[] = result.messages || [];
      if (messages.length === 0) {
        return { content: 'No messages found.' };
      }

      const lines = messages.map((m: any) => formatMessage(m));

      return {
        content: `Found ${messages.length} messages:\n${lines.join('\n')}`,
        metadata: { count: messages.length },
      };
    } catch (err) {
      return twilioError(err);
    }
  },
};

// ─── Tool: twilio_get_message ───────────────────────────

const getMessage: ToolHandler = {
  description:
    'Get details of a specific SMS message by its SID.',
  inputSchema: {
    type: 'object',
    properties: {
      message_sid: {
        type: 'string',
        description: 'The message SID (e.g. "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")',
      },
    },
    required: ['message_sid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/2010-04-01/Accounts/${accountSid}/Messages/${params.message_sid}.json`,
      );

      const price = result.price ? `${result.price} ${result.price_unit}` : 'N/A';

      return {
        content: [
          `Message ${result.sid}`,
          `From: ${result.from} -> To: ${result.to}`,
          `Status: ${result.status}`,
          `Body: ${result.body}`,
          `Date Sent: ${result.date_sent || 'N/A'}`,
          `Price: ${price}`,
        ].join('\n'),
        metadata: {
          sid: result.sid,
          from: result.from,
          to: result.to,
          status: result.status,
          dateSent: result.date_sent,
          price: result.price,
        },
      };
    } catch (err) {
      return twilioError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const twilioAdapter: SkillAdapter = {
  skillId: 'twilio-sms',
  name: 'Twilio SMS',
  baseUrl: 'https://api.twilio.com',
  auth: {
    type: 'credentials',
    fields: ['accountSid', 'authToken'],
  },
  tools: {
    twilio_send_sms: sendSms,
    twilio_list_messages: listMessages,
    twilio_get_message: getMessage,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 30,
  },

  async initialize(credentials: ResolvedCredentials): Promise<void> {
    const sid = credentials.fields?.accountSid;
    const token = credentials.fields?.authToken;
    if (!sid || !token) {
      throw new Error('Twilio credentials require accountSid and authToken fields');
    }
    accountSid = sid;
    // Set Basic auth header: base64(accountSid:authToken)
    const encoded = Buffer.from(`${sid}:${token}`).toString('base64');
    // The framework reads defaultHeaders after initialize()
    twilioAdapter.defaultHeaders = {
      Authorization: `Basic ${encoded}`,
    };
  },
};
