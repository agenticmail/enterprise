/**
 * MCP Skill Adapter — Postmark
 *
 * Maps Postmark API endpoints to MCP tool handlers.
 * Covers email sending, templates, delivery stats, and message search.
 *
 * Postmark API docs: https://postmarkapp.com/developer/api/overview
 *
 * Auth: Server API token passed via X-Postmark-Server-Token header.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function postmarkError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errorCode = data.ErrorCode ? `[${data.ErrorCode}] ` : '';
      const message = data.Message || err.message;
      return { content: `Postmark API error: ${errorCode}${message}`, isError: true };
    }
    return { content: `Postmark API error: ${err.message}`, isError: true };
  }
  return { content: `Postmark API error: ${String(err)}`, isError: true };
}

// ─── Tool: postmark_send_email ──────────────────────────

const sendEmail: ToolHandler = {
  description:
    'Send a transactional email via Postmark. Supports plain text and HTML content, plus CC and BCC recipients.',
  inputSchema: {
    type: 'object',
    properties: {
      From: {
        type: 'string',
        description: 'Sender email address (must be a confirmed Sender Signature)',
      },
      To: {
        type: 'string',
        description: 'Recipient email address (comma-separated for multiple)',
      },
      Subject: {
        type: 'string',
        description: 'Email subject line',
      },
      TextBody: {
        type: 'string',
        description: 'Plain text body content',
      },
      HtmlBody: {
        type: 'string',
        description: 'HTML body content (optional)',
      },
      Cc: {
        type: 'string',
        description: 'CC recipients (comma-separated)',
      },
      Bcc: {
        type: 'string',
        description: 'BCC recipients (comma-separated)',
      },
      Tag: {
        type: 'string',
        description: 'Tag for categorizing the message',
      },
      MessageStream: {
        type: 'string',
        description: 'Message stream ID (default: "outbound")',
      },
    },
    required: ['From', 'To', 'Subject'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        From: params.From,
        To: params.To,
        Subject: params.Subject,
      };
      if (params.TextBody) body.TextBody = params.TextBody;
      if (params.HtmlBody) body.HtmlBody = params.HtmlBody;
      if (params.Cc) body.Cc = params.Cc;
      if (params.Bcc) body.Bcc = params.Bcc;
      if (params.Tag) body.Tag = params.Tag;
      if (params.MessageStream) body.MessageStream = params.MessageStream;

      // Ensure at least one body content
      if (!body.TextBody && !body.HtmlBody) {
        body.TextBody = '(no content)';
      }

      const result = await ctx.apiExecutor.post('/email', body);

      const messageId = result.MessageID || 'N/A';
      const status = result.ErrorCode === 0 ? 'Sent' : result.Message;

      return {
        content: `Email sent to ${params.To}\nSubject: ${params.Subject}\nMessage ID: ${messageId}\nStatus: ${status}`,
        metadata: { messageId, to: params.To, subject: params.Subject },
      };
    } catch (err) {
      return postmarkError(err);
    }
  },
};

// ─── Tool: postmark_list_templates ──────────────────────

const listTemplates: ToolHandler = {
  description:
    'List email templates from Postmark. Returns template names, IDs, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of templates to return (default 100, max 500)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      templateType: {
        type: 'string',
        enum: ['Standard', 'Layout'],
        description: 'Filter by template type',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        Count: String(params.count ?? 100),
        Offset: String(params.offset ?? 0),
      };
      if (params.templateType) query.TemplateType = params.templateType;

      const result = await ctx.apiExecutor.get('/templates', query);

      const templates: any[] = result.Templates || [];
      const total = result.TotalCount ?? templates.length;

      if (templates.length === 0) {
        return { content: 'No templates found.', metadata: { count: 0 } };
      }

      const lines = templates.map((t: any) => {
        const name = t.Name || '(unnamed)';
        const alias = t.Alias ? ` (alias: ${t.Alias})` : '';
        const active = t.Active ? 'active' : 'inactive';
        const type = t.TemplateType || 'Standard';
        return `${name}${alias} -- ${type} -- ${active} (ID: ${t.TemplateId})`;
      });

      return {
        content: `Found ${total} templates (showing ${templates.length}):\n${lines.join('\n')}`,
        metadata: { count: templates.length, total },
      };
    } catch (err) {
      return postmarkError(err);
    }
  },
};

// ─── Tool: postmark_send_template ───────────────────────

const sendTemplate: ToolHandler = {
  description:
    'Send a templated email via Postmark. Provide the template ID or alias and the template model (variables).',
  inputSchema: {
    type: 'object',
    properties: {
      TemplateId: {
        type: 'number',
        description: 'Template ID to use (provide this or TemplateAlias)',
      },
      TemplateAlias: {
        type: 'string',
        description: 'Template alias to use (provide this or TemplateId)',
      },
      TemplateModel: {
        type: 'object',
        description: 'Template variables (e.g. { "name": "John", "product_name": "MyApp" })',
      },
      From: {
        type: 'string',
        description: 'Sender email address',
      },
      To: {
        type: 'string',
        description: 'Recipient email address',
      },
      Tag: {
        type: 'string',
        description: 'Tag for categorizing the message',
      },
      MessageStream: {
        type: 'string',
        description: 'Message stream ID (default: "outbound")',
      },
    },
    required: ['From', 'To'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!params.TemplateId && !params.TemplateAlias) {
        return { content: 'Either TemplateId or TemplateAlias is required.', isError: true };
      }

      const body: Record<string, any> = {
        From: params.From,
        To: params.To,
        TemplateModel: params.TemplateModel || {},
      };
      if (params.TemplateId) body.TemplateId = params.TemplateId;
      if (params.TemplateAlias) body.TemplateAlias = params.TemplateAlias;
      if (params.Tag) body.Tag = params.Tag;
      if (params.MessageStream) body.MessageStream = params.MessageStream;

      const result = await ctx.apiExecutor.post('/email/withTemplate', body);

      const messageId = result.MessageID || 'N/A';
      const templateRef = params.TemplateAlias || params.TemplateId;

      return {
        content: `Templated email sent to ${params.To}\nTemplate: ${templateRef}\nMessage ID: ${messageId}`,
        metadata: { messageId, to: params.To, template: templateRef },
      };
    } catch (err) {
      return postmarkError(err);
    }
  },
};

// ─── Tool: postmark_get_delivery_stats ──────────────────

const getDeliveryStats: ToolHandler = {
  description:
    'Get delivery statistics from Postmark. Returns counts for bounces by type (hard, soft, spam complaints, etc.).',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/deliverystats');

      const inactive = result.InactiveMails ?? 0;
      const bounces = result.Bounces || [];

      if (bounces.length === 0 && inactive === 0) {
        return {
          content: 'No delivery issues recorded.',
          metadata: { inactiveMails: 0, bounceTypes: 0 },
        };
      }

      const lines = bounces.map((b: any) => {
        const type = b.Type || b.Name || 'unknown';
        const count = b.Count ?? 0;
        return `  ${type}: ${count}`;
      });

      return {
        content: `Delivery Statistics:\n  Inactive Mails: ${inactive}\n  Bounces by type:\n${lines.join('\n')}`,
        metadata: { inactiveMails: inactive, bounceTypes: bounces.length },
      };
    } catch (err) {
      return postmarkError(err);
    }
  },
};

// ─── Tool: postmark_search_messages ─────────────────────

const searchMessages: ToolHandler = {
  description:
    'Search outbound messages sent via Postmark. Filter by recipient, tag, subject, or status.',
  inputSchema: {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        description: 'Filter by recipient email address',
      },
      fromemail: {
        type: 'string',
        description: 'Filter by sender email address',
      },
      tag: {
        type: 'string',
        description: 'Filter by message tag',
      },
      subject: {
        type: 'string',
        description: 'Filter by subject line (partial match)',
      },
      status: {
        type: 'string',
        enum: ['queued', 'sent', 'processed'],
        description: 'Filter by message status',
      },
      count: {
        type: 'number',
        description: 'Number of messages to return (default 50, max 500)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      messagestream: {
        type: 'string',
        description: 'Filter by message stream ID',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        count: String(params.count ?? 50),
        offset: String(params.offset ?? 0),
      };
      if (params.recipient) query.recipient = params.recipient;
      if (params.fromemail) query.fromemail = params.fromemail;
      if (params.tag) query.tag = params.tag;
      if (params.subject) query.subject = params.subject;
      if (params.status) query.status = params.status;
      if (params.messagestream) query.messagestream = params.messagestream;

      const result = await ctx.apiExecutor.get('/messages/outbound', query);

      const messages: any[] = result.Messages || [];
      const total = result.TotalCount ?? messages.length;

      if (messages.length === 0) {
        return { content: 'No messages found.', metadata: { count: 0 } };
      }

      const lines = messages.map((m: any) => {
        const to = m.Recipients?.join(', ') || 'unknown';
        const subject = m.Subject || '(no subject)';
        const status = m.Status || 'unknown';
        const sentAt = m.ReceivedAt ? m.ReceivedAt.slice(0, 16) : '';
        const tag = m.Tag ? ` [${m.Tag}]` : '';
        return `To: ${to} -- "${subject}"${tag} -- ${status} -- ${sentAt} (ID: ${m.MessageID})`;
      });

      return {
        content: `Found ${total} messages (showing ${messages.length}):\n${lines.join('\n')}`,
        metadata: { count: messages.length, total },
      };
    } catch (err) {
      return postmarkError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const postmarkAdapter: SkillAdapter = {
  skillId: 'postmark',
  name: 'Postmark',
  baseUrl: 'https://api.postmarkapp.com',
  auth: {
    type: 'api_key',
    headerName: 'X-Postmark-Server-Token',
  },
  tools: {
    postmark_send_email: sendEmail,
    postmark_list_templates: listTemplates,
    postmark_send_template: sendTemplate,
    postmark_get_delivery_stats: getDeliveryStats,
    postmark_search_messages: searchMessages,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
