/**
 * MCP Skill Adapter — Zendesk
 *
 * Maps Zendesk Support API endpoints to MCP tool handlers.
 * Zendesk uses a dynamic base URL based on the customer's subdomain:
 * https://{subdomain}.zendesk.com/api/v2
 *
 * The subdomain is read from ctx.skillConfig.subdomain.
 *
 * Zendesk API docs: https://developer.zendesk.com/api-reference/ticketing/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Zendesk base URL from skill config */
function zdUrl(ctx: ToolExecutionContext): string {
  const subdomain = ctx.skillConfig.subdomain;
  if (!subdomain) {
    throw new Error('Zendesk subdomain is required in skillConfig (e.g. { subdomain: "mycompany" })');
  }
  return `https://${subdomain}.zendesk.com/api/v2`;
}

function zendeskError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Zendesk error responses: { error: "RecordInvalid", description: "...", details: {...} }
      const errorType = data.error || '';
      const desc = data.description || data.message || err.message;
      const details = data.details ? ` -- ${JSON.stringify(data.details)}` : '';
      return { content: `Zendesk API error [${errorType}]: ${desc}${details}`, isError: true };
    }
    return { content: `Zendesk API error: ${err.message}`, isError: true };
  }
  return { content: `Zendesk API error: ${String(err)}`, isError: true };
}

/** Format a Zendesk ticket for display */
function formatTicket(ticket: any): string {
  const subject = ticket.subject || '(no subject)';
  const status = ticket.status || 'unknown';
  const priority = ticket.priority || 'none';
  const requester = ticket.requester_id || 'unknown';
  const assignee = ticket.assignee_id || 'unassigned';
  const created = ticket.created_at ? ticket.created_at.slice(0, 16) : '';
  return `#${ticket.id} ${subject} -- ${status} (${priority}) -- requester: ${requester}, assignee: ${assignee} -- ${created}`;
}

// ─── Tool: zendesk_create_ticket ────────────────────────

const createTicket: ToolHandler = {
  description:
    'Create a new support ticket in Zendesk. Provide a subject, description, and optional priority and type.',
  inputSchema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Ticket subject line',
      },
      description: {
        type: 'string',
        description: 'Ticket description / initial comment body',
      },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'normal', 'low'],
        description: 'Ticket priority (default: "normal")',
      },
      type: {
        type: 'string',
        enum: ['problem', 'incident', 'question', 'task'],
        description: 'Ticket type',
      },
      requester_email: {
        type: 'string',
        description: 'Email of the requester (creates or matches an existing user)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the ticket',
      },
      assignee_id: {
        type: 'number',
        description: 'Agent user ID to assign the ticket to',
      },
    },
    required: ['subject', 'description'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zdUrl(ctx);

      const ticket: Record<string, any> = {
        subject: params.subject,
        comment: { body: params.description },
        priority: params.priority || 'normal',
      };
      if (params.type) ticket.type = params.type;
      if (params.requester_email) {
        ticket.requester = { email: params.requester_email };
      }
      if (params.tags?.length) ticket.tags = params.tags;
      if (params.assignee_id) ticket.assignee_id = params.assignee_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/tickets.json`,
        body: { ticket },
      });

      const t = result.ticket;
      return {
        content: `Ticket created: #${t.id} "${t.subject}" -- ${t.status} (${t.priority})`,
        metadata: {
          ticketId: t.id,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
        },
      };
    } catch (err) {
      return zendeskError(err);
    }
  },
};

// ─── Tool: zendesk_list_tickets ─────────────────────────

const listTickets: ToolHandler = {
  description:
    'List support tickets from Zendesk. Optionally filter by status or sort order.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
        description: 'Filter by ticket status',
      },
      sort_by: {
        type: 'string',
        enum: ['created_at', 'updated_at', 'priority', 'status'],
        description: 'Sort field (default: "created_at")',
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "desc")',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zdUrl(ctx);

      const query: Record<string, string> = {
        sort_by: params.sort_by || 'created_at',
        sort_order: params.sort_order || 'desc',
        per_page: String(params.per_page ?? 25),
      };
      if (params.page) query.page = String(params.page);

      // If filtering by status, use the search endpoint
      let result: any;
      if (params.status) {
        result = await ctx.apiExecutor.request({
          method: 'GET',
          url: `${baseUrl}/search.json`,
          query: {
            query: `type:ticket status:${params.status}`,
            sort_by: query.sort_by,
            sort_order: query.sort_order,
            per_page: query.per_page,
            ...(params.page ? { page: query.page } : {}),
          },
        });
        const tickets: any[] = result.results || [];
        if (tickets.length === 0) {
          return { content: `No tickets found with status "${params.status}".` };
        }
        const lines = tickets.map((t: any) => formatTicket(t));
        return {
          content: `Found ${result.count ?? tickets.length} tickets with status "${params.status}" (showing ${tickets.length}):\n${lines.join('\n')}`,
          metadata: { count: tickets.length, total: result.count, status: params.status },
        };
      }

      result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/tickets.json`,
        query,
      });

      const tickets: any[] = result.tickets || [];
      if (tickets.length === 0) {
        return { content: 'No tickets found.' };
      }

      const lines = tickets.map((t: any) => formatTicket(t));
      const total = result.count ?? tickets.length;

      return {
        content: `Found ${total} tickets (showing ${tickets.length}):\n${lines.join('\n')}`,
        metadata: { count: tickets.length, total },
      };
    } catch (err) {
      return zendeskError(err);
    }
  },
};

// ─── Tool: zendesk_update_ticket ────────────────────────

const updateTicket: ToolHandler = {
  description:
    'Update an existing Zendesk ticket. Can change status, priority, assignee, tags, or add a comment.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_id: {
        type: 'number',
        description: 'The ticket ID to update',
      },
      status: {
        type: 'string',
        enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
        description: 'Set the ticket status',
      },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'normal', 'low'],
        description: 'Set the ticket priority',
      },
      assignee_id: {
        type: 'number',
        description: 'Assign to a specific agent by user ID',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replace the ticket tags with this list',
      },
      comment: {
        type: 'string',
        description: 'Add a comment to the ticket (optional)',
      },
      public_comment: {
        type: 'boolean',
        description: 'Whether the comment is public (visible to requester) or internal (default: true)',
      },
    },
    required: ['ticket_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zdUrl(ctx);

      const ticket: Record<string, any> = {};
      if (params.status) ticket.status = params.status;
      if (params.priority) ticket.priority = params.priority;
      if (params.assignee_id) ticket.assignee_id = params.assignee_id;
      if (params.tags) ticket.tags = params.tags;
      if (params.comment) {
        ticket.comment = {
          body: params.comment,
          public: params.public_comment ?? true,
        };
      }

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/tickets/${params.ticket_id}.json`,
        body: { ticket },
      });

      const t = result.ticket;
      return {
        content: `Ticket #${t.id} updated -- status: ${t.status}, priority: ${t.priority}${params.comment ? ' (comment added)' : ''}`,
        metadata: {
          ticketId: t.id,
          status: t.status,
          priority: t.priority,
        },
      };
    } catch (err) {
      return zendeskError(err);
    }
  },
};

// ─── Tool: zendesk_add_comment ──────────────────────────

const addComment: ToolHandler = {
  description:
    'Add a comment (public or internal note) to an existing Zendesk ticket without changing other ticket fields.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_id: {
        type: 'number',
        description: 'The ticket ID to comment on',
      },
      body: {
        type: 'string',
        description: 'The comment body text',
      },
      public: {
        type: 'boolean',
        description: 'Whether the comment is public (visible to requester) or an internal note (default: true)',
      },
      author_id: {
        type: 'number',
        description: 'User ID of the comment author (optional, defaults to the authenticated user)',
      },
    },
    required: ['ticket_id', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zdUrl(ctx);

      const comment: Record<string, any> = {
        body: params.body,
        public: params.public ?? true,
      };
      if (params.author_id) comment.author_id = params.author_id;

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/tickets/${params.ticket_id}.json`,
        body: {
          ticket: { comment },
        },
      });

      const t = result.ticket;
      const visibility = (params.public ?? true) ? 'public' : 'internal';
      return {
        content: `${visibility.charAt(0).toUpperCase() + visibility.slice(1)} comment added to ticket #${t.id}`,
        metadata: {
          ticketId: t.id,
          visibility,
        },
      };
    } catch (err) {
      return zendeskError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const zendeskAdapter: SkillAdapter = {
  skillId: 'zendesk-tickets',
  name: 'Zendesk Tickets',
  // Base URL is dynamic based on subdomain; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://zendesk.com/api/v2',
  auth: {
    type: 'oauth2',
    provider: 'zendesk',
    headerPrefix: 'Bearer',
  },
  tools: {
    zendesk_create_ticket: createTicket,
    zendesk_list_tickets: listTickets,
    zendesk_update_ticket: updateTicket,
    zendesk_add_comment: addComment,
  },
  configSchema: {
    subdomain: {
      type: 'string' as const,
      label: 'Zendesk Subdomain',
      description: 'Your Zendesk subdomain (e.g. "mycompany" for mycompany.zendesk.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
