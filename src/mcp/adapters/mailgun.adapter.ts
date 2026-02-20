/**
 * MCP Skill Adapter — Mailgun
 *
 * Maps Mailgun API v3 endpoints to MCP tool handlers.
 * Covers email sending, event tracking, validation, domains, and statistics.
 *
 * Mailgun API docs: https://documentation.mailgun.com/en/latest/api-reference.html
 *
 * The API base URL varies by region:
 *   US: https://api.mailgun.net/v3
 *   EU: https://api.eu.mailgun.net/v3
 *
 * Auth uses HTTP Basic with "api" as the username and the API key as password.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve Mailgun base URL from skill config (region + domain) */
function mgUrl(ctx: ToolExecutionContext): { baseUrl: string; domain: string } {
  const domain = ctx.skillConfig.domain;
  if (!domain) {
    throw new Error('Mailgun domain is required in skillConfig (e.g. { domain: "mg.example.com" })');
  }
  const region = ctx.skillConfig.region || 'us';
  const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
  return { baseUrl, domain };
}

function mailgunError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.error || err.message;
      return { content: `Mailgun API error: ${message}`, isError: true };
    }
    return { content: `Mailgun API error: ${err.message}`, isError: true };
  }
  return { content: `Mailgun API error: ${String(err)}`, isError: true };
}

// ─── Tool: mailgun_send_email ───────────────────────────

const sendEmail: ToolHandler = {
  description:
    'Send an email via Mailgun. Supports plain text and HTML content, plus CC and BCC recipients.',
  inputSchema: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Sender email address (e.g. "User <user@mg.example.com>")',
      },
      to: {
        type: 'string',
        description: 'Recipient email address (comma-separated for multiple)',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      text: {
        type: 'string',
        description: 'Plain text body content',
      },
      html: {
        type: 'string',
        description: 'HTML body content (optional)',
      },
      cc: {
        type: 'string',
        description: 'CC recipients (comma-separated)',
      },
      bcc: {
        type: 'string',
        description: 'BCC recipients (comma-separated)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for tracking (max 3)',
      },
    },
    required: ['from', 'to', 'subject'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { baseUrl, domain } = mgUrl(ctx);

      const body: Record<string, any> = {
        from: params.from,
        to: params.to,
        subject: params.subject,
      };
      if (params.text) body.text = params.text;
      if (params.html) body.html = params.html;
      if (params.cc) body.cc = params.cc;
      if (params.bcc) body.bcc = params.bcc;
      if (params.tags?.length) {
        params.tags.forEach((tag: string, i: number) => {
          body[`o:tag[${i}]`] = tag;
        });
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/${domain}/messages`,
        body,
        formEncoded: true,
      });

      return {
        content: `Email sent: ${result.message || 'Queued'}\nID: ${result.id || 'N/A'}`,
        metadata: { messageId: result.id, to: params.to, subject: params.subject },
      };
    } catch (err) {
      return mailgunError(err);
    }
  },
};

// ─── Tool: mailgun_list_events ──────────────────────────

const listEvents: ToolHandler = {
  description:
    'List email events from Mailgun (deliveries, opens, clicks, bounces, etc.) for the configured domain.',
  inputSchema: {
    type: 'object',
    properties: {
      event: {
        type: 'string',
        enum: ['accepted', 'delivered', 'failed', 'opened', 'clicked', 'unsubscribed', 'complained', 'stored'],
        description: 'Filter by event type',
      },
      begin: {
        type: 'string',
        description: 'Start date/time in RFC 2822 format or Unix timestamp',
      },
      end: {
        type: 'string',
        description: 'End date/time in RFC 2822 format or Unix timestamp',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of events to return (default 25, max 300)',
      },
      recipient: {
        type: 'string',
        description: 'Filter by recipient email address',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { baseUrl, domain } = mgUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.event) query.event = params.event;
      if (params.begin) query.begin = params.begin;
      if (params.end) query.end = params.end;
      if (params.recipient) query.recipient = params.recipient;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${domain}/events`,
        query,
      });

      const events: any[] = result.items || [];
      if (events.length === 0) {
        return { content: 'No events found.', metadata: { count: 0 } };
      }

      const lines = events.map((e: any) => {
        const event = e.event || 'unknown';
        const recipient = e.recipient || 'unknown';
        const subject = e.message?.headers?.subject || '';
        const timestamp = e.timestamp ? new Date(e.timestamp * 1000).toISOString().slice(0, 16) : '';
        return `${event} -- ${recipient} -- "${subject}" -- ${timestamp}`;
      });

      return {
        content: `Found ${events.length} events:\n${lines.join('\n')}`,
        metadata: { count: events.length },
      };
    } catch (err) {
      return mailgunError(err);
    }
  },
};

// ─── Tool: mailgun_validate_email ───────────────────────

const validateEmail: ToolHandler = {
  description:
    'Validate an email address using Mailgun\'s email validation service. Checks deliverability, risk, and suggests corrections.',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Email address to validate',
      },
    },
    required: ['address'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const region = ctx.skillConfig.region || 'us';
      const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net/v4' : 'https://api.mailgun.net/v4';

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/address/validate`,
        query: { address: params.address },
      });

      const risk = result.risk || 'unknown';
      const result_status = result.result || 'unknown';
      const reason = result.reason ? ` (${result.reason.join(', ')})` : '';
      const suggestion = result.did_you_mean ? `\nDid you mean: ${result.did_you_mean}` : '';
      const disposable = result.is_disposable_address ? ' [disposable]' : '';
      const role = result.is_role_address ? ' [role address]' : '';

      return {
        content: `Validation for ${params.address}:\n  Result: ${result_status}\n  Risk: ${risk}${reason}${disposable}${role}${suggestion}`,
        metadata: {
          address: params.address,
          result: result_status,
          risk,
          isDisposable: result.is_disposable_address,
          isRole: result.is_role_address,
        },
      };
    } catch (err) {
      return mailgunError(err);
    }
  },
};

// ─── Tool: mailgun_list_domains ─────────────────────────

const listDomains: ToolHandler = {
  description:
    'List sending domains configured in Mailgun. Returns domain names, states, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of domains to return (default 100)',
      },
      skip: {
        type: 'number',
        description: 'Number of domains to skip for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const region = ctx.skillConfig.region || 'us';
      const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';

      const query: Record<string, string> = {
        limit: String(params.limit ?? 100),
        skip: String(params.skip ?? 0),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/domains`,
        query,
      });

      const domains: any[] = result.items || [];
      const total = result.total_count ?? domains.length;

      if (domains.length === 0) {
        return { content: 'No domains found.', metadata: { count: 0 } };
      }

      const lines = domains.map((d: any) => {
        const name = d.name || '(unknown)';
        const state = d.state || 'unknown';
        const type = d.type || 'unknown';
        const created = d.created_at ? d.created_at.slice(0, 10) : '';
        return `${name} -- ${state} -- ${type} -- created: ${created}`;
      });

      return {
        content: `Found ${total} domains (showing ${domains.length}):\n${lines.join('\n')}`,
        metadata: { count: domains.length, total },
      };
    } catch (err) {
      return mailgunError(err);
    }
  },
};

// ─── Tool: mailgun_get_stats ────────────────────────────

const getStats: ToolHandler = {
  description:
    'Get email sending statistics from Mailgun for the configured domain. Returns delivery, open, click, bounce, and complaint counts.',
  inputSchema: {
    type: 'object',
    properties: {
      event: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['accepted', 'delivered', 'failed', 'opened', 'clicked', 'unsubscribed', 'complained', 'stored'],
        },
        description: 'Event types to include in stats (default: all)',
      },
      duration: {
        type: 'string',
        description: 'Duration to query (e.g. "1m" for 1 month, "7d" for 7 days)',
      },
      resolution: {
        type: 'string',
        enum: ['hour', 'day', 'month'],
        description: 'Time resolution for stats (default: "day")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { baseUrl, domain } = mgUrl(ctx);

      const query: Record<string, string> = {
        resolution: params.resolution || 'day',
        duration: params.duration || '7d',
      };
      if (params.event?.length) {
        query.event = params.event.join(',');
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${domain}/stats/total`,
        query,
      });

      const stats = result.stats || [];
      if (stats.length === 0) {
        return { content: 'No statistics available for the specified period.', metadata: {} };
      }

      const lines = stats.map((entry: any) => {
        const time = entry.time ? new Date(entry.time).toISOString().slice(0, 10) : 'unknown';
        const accepted = entry.accepted?.total ?? 0;
        const delivered = entry.delivered?.total ?? 0;
        const failed = entry.failed?.total ?? 0;
        const opened = entry.opened?.total ?? 0;
        const clicked = entry.clicked?.total ?? 0;
        return [
          `${time}:`,
          `  Accepted: ${accepted}`,
          `  Delivered: ${delivered}`,
          `  Failed: ${failed}`,
          `  Opened: ${opened}`,
          `  Clicked: ${clicked}`,
        ].join('\n');
      });

      return {
        content: `Email statistics for ${domain}:\n${lines.join('\n\n')}`,
        metadata: { domain, periodCount: stats.length },
      };
    } catch (err) {
      return mailgunError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const mailgunAdapter: SkillAdapter = {
  skillId: 'mailgun',
  name: 'Mailgun',
  baseUrl: 'https://api.mailgun.net/v3',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    mailgun_send_email: sendEmail,
    mailgun_list_events: listEvents,
    mailgun_validate_email: validateEmail,
    mailgun_list_domains: listDomains,
    mailgun_get_stats: getStats,
  },
  configSchema: {
    domain: {
      type: 'string' as const,
      label: 'Mail Domain',
      description: 'Your Mailgun sending domain (e.g. "mg.example.com")',
      required: true,
    },
    region: {
      type: 'select' as const,
      label: 'Region',
      description: 'Mailgun API region',
      options: [
        { label: 'US', value: 'us' },
        { label: 'EU', value: 'eu' },
      ],
      default: 'us',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
