/**
 * MCP Skill Adapter — SendGrid
 *
 * Maps SendGrid v3 API endpoints to MCP tool handlers.
 * Handles transactional email sending, contact management, and email stats.
 *
 * SendGrid API docs: https://docs.sendgrid.com/api-reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function sendgridError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // SendGrid returns { errors: [{ message, field, help }] }
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => e.message || e.field || 'unknown error').join('; ');
        return { content: `SendGrid API error: ${details}`, isError: true };
      }
      return { content: `SendGrid API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `SendGrid API error: ${err.message}`, isError: true };
  }
  return { content: `SendGrid API error: ${String(err)}`, isError: true };
}

// ─── Tool: sendgrid_send_email ──────────────────────────

const sendEmail: ToolHandler = {
  description:
    'Send a transactional email via SendGrid. Supports plain text and HTML content, plus CC and BCC recipients.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address',
      },
      from: {
        type: 'string',
        description: 'Sender email address (must be a verified sender in SendGrid)',
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
        description: 'HTML body content (optional, takes precedence over text in email clients)',
      },
      cc: {
        type: 'array',
        items: { type: 'string' },
        description: 'CC recipient email addresses (optional)',
      },
      bcc: {
        type: 'array',
        items: { type: 'string' },
        description: 'BCC recipient email addresses (optional)',
      },
    },
    required: ['to', 'from', 'subject'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const toList: any[] = [{ email: params.to }];
      const personalization: Record<string, any> = { to: toList };
      if (params.cc?.length) personalization.cc = params.cc.map((e: string) => ({ email: e }));
      if (params.bcc?.length) personalization.bcc = params.bcc.map((e: string) => ({ email: e }));

      const content: any[] = [];
      if (params.text) content.push({ type: 'text/plain', value: params.text });
      if (params.html) content.push({ type: 'text/html', value: params.html });
      if (content.length === 0) {
        content.push({ type: 'text/plain', value: '(no content)' });
      }

      const body = {
        personalizations: [personalization],
        from: { email: params.from },
        subject: params.subject,
        content,
      };

      // SendGrid returns 202 Accepted with no body on success
      await ctx.apiExecutor.post('/mail/send', body);

      const ccInfo = params.cc?.length ? ` (CC: ${params.cc.join(', ')})` : '';
      return {
        content: `Email sent to ${params.to}${ccInfo}\nSubject: ${params.subject}`,
        metadata: {
          to: params.to,
          from: params.from,
          subject: params.subject,
        },
      };
    } catch (err) {
      return sendgridError(err);
    }
  },
};

// ─── Tool: sendgrid_list_contacts ───────────────────────

const listContacts: ToolHandler = {
  description:
    'List marketing contacts in SendGrid. Returns contact emails, names, and IDs. Use search to find specific contacts.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Number of contacts to return (default 50, max 1000)',
      },
      search: {
        type: 'string',
        description: 'Search query to filter contacts by email, name, etc. Uses SGQL syntax (e.g. "email LIKE \'%@example.com\'")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      // If a search query is provided, use the search endpoint
      if (params.search) {
        const result = await ctx.apiExecutor.post('/marketing/contacts/search', {
          query: params.search,
        });

        const contacts: any[] = result.result || [];
        if (contacts.length === 0) {
          return { content: `No contacts found matching: ${params.search}` };
        }

        const lines = contacts.map((c: any) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
          return `${name} <${c.email}> (ID: ${c.id})`;
        });

        return {
          content: `Found ${contacts.length} contacts:\n${lines.join('\n')}`,
          metadata: { count: contacts.length, query: params.search },
        };
      }

      // Otherwise, list all contacts
      const query: Record<string, string> = {};
      if (params.page_size) query.page_size = String(params.page_size);

      const result = await ctx.apiExecutor.get('/marketing/contacts', query);

      const contacts: any[] = result.result || [];
      const count = result.contact_count ?? contacts.length;

      if (contacts.length === 0) {
        return { content: 'No contacts found.', metadata: { count: 0 } };
      }

      const lines = contacts.map((c: any) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
        return `${name} <${c.email}> (ID: ${c.id})`;
      });

      return {
        content: `${count} total contacts (showing ${contacts.length}):\n${lines.join('\n')}`,
        metadata: { totalCount: count, shown: contacts.length },
      };
    } catch (err) {
      return sendgridError(err);
    }
  },
};

// ─── Tool: sendgrid_get_stats ───────────────────────────

const getStats: ToolHandler = {
  description:
    'Get email sending statistics from SendGrid for a given date range. Returns delivery, open, click, bounce, and spam report counts.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format (required)',
      },
      end_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format (optional, defaults to today)',
      },
      aggregated_by: {
        type: 'string',
        enum: ['day', 'week', 'month'],
        description: 'Aggregation period (default: "day")',
      },
    },
    required: ['start_date'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        start_date: params.start_date,
      };
      if (params.end_date) query.end_date = params.end_date;
      if (params.aggregated_by) query.aggregated_by = params.aggregated_by;

      const result = await ctx.apiExecutor.get('/stats', query);

      const stats: any[] = Array.isArray(result) ? result : [];
      if (stats.length === 0) {
        return { content: `No stats available for the specified date range.` };
      }

      const lines = stats.map((entry: any) => {
        const date = entry.date || 'unknown';
        const metrics = entry.stats?.[0]?.metrics || {};
        return [
          `${date}:`,
          `  Requests: ${metrics.requests ?? 0}`,
          `  Delivered: ${metrics.delivered ?? 0}`,
          `  Opens: ${metrics.opens ?? 0}`,
          `  Clicks: ${metrics.clicks ?? 0}`,
          `  Bounces: ${metrics.bounces ?? 0}`,
          `  Spam Reports: ${metrics.spam_reports ?? 0}`,
        ].join('\n');
      });

      return {
        content: `Email statistics:\n${lines.join('\n\n')}`,
        metadata: { periodCount: stats.length, startDate: params.start_date },
      };
    } catch (err) {
      return sendgridError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const sendgridAdapter: SkillAdapter = {
  skillId: 'sendgrid-email',
  name: 'SendGrid Email',
  baseUrl: 'https://api.sendgrid.com/v3',
  auth: {
    type: 'api_key',
    headerPrefix: 'Bearer',
  },
  tools: {
    sendgrid_send_email: sendEmail,
    sendgrid_list_contacts: listContacts,
    sendgrid_get_stats: getStats,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 30,
  },
};
