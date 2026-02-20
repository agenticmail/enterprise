/**
 * MCP Skill Adapter — Freshdesk
 *
 * Maps Freshdesk Support API v2 endpoints to MCP tool handlers.
 * Freshdesk uses a dynamic base URL based on the customer's domain:
 * https://{domain}.freshdesk.com/api/v2
 *
 * The domain is read from ctx.skillConfig.domain.
 *
 * Freshdesk API docs: https://developers.freshdesk.com/api/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Freshdesk base URL from skill config */
function fdUrl(ctx: ToolExecutionContext): string {
  const domain = ctx.skillConfig.domain;
  if (!domain) {
    throw new Error('Freshdesk domain is required in skillConfig (e.g. { domain: "mycompany" })');
  }
  return `https://${domain}.freshdesk.com/api/v2`;
}

function freshdeskError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const desc = data.description || data.message || err.message;
      const errors = Array.isArray(data.errors)
        ? ` -- ${data.errors.map((e: any) => `${e.field}: ${e.message}`).join('; ')}`
        : '';
      return { content: `Freshdesk API error: ${desc}${errors}`, isError: true };
    }
    return { content: `Freshdesk API error: ${err.message}`, isError: true };
  }
  return { content: `Freshdesk API error: ${String(err)}`, isError: true };
}

/** Format a Freshdesk ticket for display */
function formatTicket(ticket: any): string {
  const subject = ticket.subject || '(no subject)';
  const status = ['', 'Open', 'Pending', 'Resolved', 'Closed'][ticket.status] || `status:${ticket.status}`;
  const priority = ['', 'Low', 'Medium', 'High', 'Urgent'][ticket.priority] || `priority:${ticket.priority}`;
  const requester = ticket.requester_id || 'unknown';
  const created = ticket.created_at ? ticket.created_at.slice(0, 16) : '';
  return `#${ticket.id} ${subject} -- ${status} (${priority}) -- requester: ${requester} -- ${created}`;
}

/** Format a Freshdesk contact for display */
function formatContact(contact: any): string {
  const name = contact.name || '(no name)';
  const email = contact.email || '(no email)';
  const phone = contact.phone ? ` -- ${contact.phone}` : '';
  const company = contact.company_id ? ` -- company: ${contact.company_id}` : '';
  return `${name} <${email}>${phone}${company} (ID: ${contact.id})`;
}

// ─── Tool: freshdesk_list_tickets ───────────────────────

const listTickets: ToolHandler = {
  description:
    'List support tickets from Freshdesk. Optionally filter by status, priority, or requester email.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['new_and_my_open', 'watching', 'spam', 'deleted'],
        description: 'Predefined ticket filter',
      },
      email: {
        type: 'string',
        description: 'Filter tickets by requester email',
      },
      order_by: {
        type: 'string',
        enum: ['created_at', 'due_by', 'updated_at', 'status'],
        description: 'Sort field (default: "created_at")',
      },
      order_type: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "desc")',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fdUrl(ctx);

      const query: Record<string, string> = {
        order_by: params.order_by || 'created_at',
        order_type: params.order_type || 'desc',
        per_page: String(params.per_page ?? 30),
      };
      if (params.page) query.page = String(params.page);
      if (params.filter) query.filter = params.filter;
      if (params.email) query.email = params.email;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/tickets`,
        query,
      });

      const tickets: any[] = Array.isArray(result) ? result : result.tickets || [];
      if (tickets.length === 0) {
        return { content: 'No tickets found.' };
      }

      const lines = tickets.map((t: any) => formatTicket(t));
      return {
        content: `Found ${tickets.length} tickets:\n${lines.join('\n')}`,
        metadata: { count: tickets.length },
      };
    } catch (err) {
      return freshdeskError(err);
    }
  },
};

// ─── Tool: freshdesk_create_ticket ──────────────────────

const createTicket: ToolHandler = {
  description:
    'Create a new support ticket in Freshdesk. Provide a subject, description, and requester email.',
  inputSchema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Ticket subject line',
      },
      description: {
        type: 'string',
        description: 'Ticket description (HTML supported)',
      },
      email: {
        type: 'string',
        description: 'Requester email address',
      },
      priority: {
        type: 'number',
        enum: [1, 2, 3, 4],
        description: 'Priority: 1=Low, 2=Medium, 3=High, 4=Urgent',
      },
      status: {
        type: 'number',
        enum: [2, 3, 4, 5],
        description: 'Status: 2=Open, 3=Pending, 4=Resolved, 5=Closed',
      },
      type: {
        type: 'string',
        description: 'Ticket type (e.g. "Question", "Incident", "Problem")',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the ticket',
      },
    },
    required: ['subject', 'description', 'email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fdUrl(ctx);

      const body: Record<string, any> = {
        subject: params.subject,
        description: params.description,
        email: params.email,
        priority: params.priority || 1,
        status: params.status || 2,
      };
      if (params.type) body.type = params.type;
      if (params.tags?.length) body.tags = params.tags;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/tickets`,
        body,
      });

      return {
        content: `Ticket created: #${result.id} "${result.subject}" -- status: ${result.status}, priority: ${result.priority}`,
        metadata: {
          ticketId: result.id,
          subject: result.subject,
          status: result.status,
          priority: result.priority,
        },
      };
    } catch (err) {
      return freshdeskError(err);
    }
  },
};

// ─── Tool: freshdesk_update_ticket ──────────────────────

const updateTicket: ToolHandler = {
  description:
    'Update an existing Freshdesk ticket. Can change status, priority, assignee, or add tags.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_id: {
        type: 'number',
        description: 'The ticket ID to update',
      },
      status: {
        type: 'number',
        enum: [2, 3, 4, 5],
        description: 'Status: 2=Open, 3=Pending, 4=Resolved, 5=Closed',
      },
      priority: {
        type: 'number',
        enum: [1, 2, 3, 4],
        description: 'Priority: 1=Low, 2=Medium, 3=High, 4=Urgent',
      },
      responder_id: {
        type: 'number',
        description: 'Agent ID to assign the ticket to',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to set on the ticket',
      },
      type: {
        type: 'string',
        description: 'Ticket type',
      },
    },
    required: ['ticket_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fdUrl(ctx);

      const body: Record<string, any> = {};
      if (params.status) body.status = params.status;
      if (params.priority) body.priority = params.priority;
      if (params.responder_id) body.responder_id = params.responder_id;
      if (params.tags) body.tags = params.tags;
      if (params.type) body.type = params.type;

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/tickets/${params.ticket_id}`,
        body,
      });

      return {
        content: `Ticket #${result.id} updated -- status: ${result.status}, priority: ${result.priority}`,
        metadata: {
          ticketId: result.id,
          status: result.status,
          priority: result.priority,
        },
      };
    } catch (err) {
      return freshdeskError(err);
    }
  },
};

// ─── Tool: freshdesk_list_contacts ──────────────────────

const listContacts: ToolHandler = {
  description:
    'List contacts from Freshdesk. Optionally filter by email, phone, or company.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Filter by exact email address',
      },
      phone: {
        type: 'string',
        description: 'Filter by phone number',
      },
      company_id: {
        type: 'number',
        description: 'Filter by company ID',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fdUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 30),
      };
      if (params.page) query.page = String(params.page);
      if (params.email) query.email = params.email;
      if (params.phone) query.phone = params.phone;
      if (params.company_id) query.company_id = String(params.company_id);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/contacts`,
        query,
      });

      const contacts: any[] = Array.isArray(result) ? result : result.contacts || [];
      if (contacts.length === 0) {
        return { content: 'No contacts found.' };
      }

      const lines = contacts.map((c: any) => formatContact(c));
      return {
        content: `Found ${contacts.length} contacts:\n${lines.join('\n')}`,
        metadata: { count: contacts.length },
      };
    } catch (err) {
      return freshdeskError(err);
    }
  },
};

// ─── Tool: freshdesk_add_reply ──────────────────────────

const addReply: ToolHandler = {
  description:
    'Add a reply to an existing Freshdesk ticket. Can send a public reply or an internal note.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_id: {
        type: 'number',
        description: 'The ticket ID to reply to',
      },
      body: {
        type: 'string',
        description: 'Reply body text (HTML supported)',
      },
      private: {
        type: 'boolean',
        description: 'If true, adds as an internal note instead of a public reply (default: false)',
      },
      user_id: {
        type: 'number',
        description: 'User ID of the agent sending the reply',
      },
    },
    required: ['ticket_id', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fdUrl(ctx);

      const isNote = params.private === true;
      const endpoint = isNote
        ? `${baseUrl}/tickets/${params.ticket_id}/notes`
        : `${baseUrl}/tickets/${params.ticket_id}/reply`;

      const body: Record<string, any> = {
        body: params.body,
      };
      if (isNote && params.private !== undefined) body.private = true;
      if (params.user_id) body.user_id = params.user_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: endpoint,
        body,
      });

      const replyType = isNote ? 'Internal note' : 'Reply';
      return {
        content: `${replyType} added to ticket #${params.ticket_id} (conversation ID: ${result.id})`,
        metadata: {
          ticketId: params.ticket_id,
          conversationId: result.id,
          type: isNote ? 'note' : 'reply',
        },
      };
    } catch (err) {
      return freshdeskError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const freshdeskAdapter: SkillAdapter = {
  skillId: 'freshdesk',
  name: 'Freshdesk Support',
  baseUrl: 'https://DOMAIN.freshdesk.com/api/v2',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    freshdesk_list_tickets: listTickets,
    freshdesk_create_ticket: createTicket,
    freshdesk_update_ticket: updateTicket,
    freshdesk_list_contacts: listContacts,
    freshdesk_add_reply: addReply,
  },
  configSchema: {
    domain: {
      type: 'string' as const,
      label: 'Freshdesk Domain',
      description: 'Your Freshdesk subdomain (e.g. "mycompany" for mycompany.freshdesk.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
