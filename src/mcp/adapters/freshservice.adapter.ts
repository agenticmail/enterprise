/**
 * MCP Skill Adapter — Freshservice ITSM
 *
 * Maps Freshservice REST API v2 endpoints to MCP tool handlers.
 * Freshservice uses a dynamic domain URL: https://{domain}.freshservice.com/api/v2
 *
 * The domain is read from ctx.skillConfig.domain.
 *
 * Freshservice API docs: https://api.freshservice.com/
 *
 * Tools:
 *   - fs_list_tickets       List tickets with optional filters
 *   - fs_create_ticket      Create a new ticket
 *   - fs_update_ticket      Update an existing ticket
 *   - fs_list_assets        List assets / configuration items
 *   - fs_list_changes       List change requests
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Freshservice base URL from skill config */
function fsUrl(ctx: ToolExecutionContext): string {
  const domain = ctx.skillConfig.domain;
  if (!domain) {
    throw new Error('Freshservice domain is required in skillConfig (e.g. { domain: "mycompany" })');
  }
  return `https://${domain}.freshservice.com/api/v2`;
}

function fsError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const description = data.description || data.message || err.message;
      const errors = data.errors
        ? ` -- ${data.errors.map((e: any) => `${e.field}: ${e.message}`).join('; ')}`
        : '';
      return { content: `Freshservice API error: ${description}${errors}`, isError: true };
    }
    return { content: `Freshservice API error: ${err.message}`, isError: true };
  }
  return { content: `Freshservice API error: ${String(err)}`, isError: true };
}

/** Map numeric status to readable string */
function ticketStatus(status: number): string {
  const map: Record<number, string> = {
    2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed',
  };
  return map[status] || String(status);
}

/** Map numeric priority to readable string */
function ticketPriority(priority: number): string {
  const map: Record<number, string> = {
    1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent',
  };
  return map[priority] || String(priority);
}

/** Format a Freshservice ticket for display */
function formatTicket(ticket: any): string {
  const subject = ticket.subject || '(no subject)';
  const status = ticketStatus(ticket.status);
  const priority = ticketPriority(ticket.priority);
  const requester = ticket.requester?.name || ticket.requester_id || 'unknown';
  const agent = ticket.responder_id || 'unassigned';
  const created = ticket.created_at ? ticket.created_at.slice(0, 16) : '';
  return `#${ticket.id} "${subject}" -- ${status} (${priority}) -- requester: ${requester} -- agent: ${agent} -- ${created}`;
}

/** Format a Freshservice asset for display */
function formatAsset(asset: any): string {
  const name = asset.name || '(unnamed)';
  const type = asset.asset_type_id || 'N/A';
  const state = asset.ci_type_id || 'N/A';
  const assigned = asset.user_id || 'unassigned';
  return `${name} (ID: ${asset.display_id || asset.id}) -- type: ${type} -- state: ${state} -- assigned: ${assigned}`;
}

/** Format a Freshservice change for display */
function formatChange(change: any): string {
  const subject = change.subject || '(no subject)';
  const status = change.status || 'unknown';
  const priority = change.priority || 'N/A';
  const changeType = change.change_type || 'N/A';
  const risk = change.risk || 'N/A';
  return `#${change.id} "${subject}" -- status: ${status} -- priority: ${priority} -- type: ${changeType} -- risk: ${risk}`;
}

// ─── Tool: fs_list_tickets ──────────────────────────────

const listTickets: ToolHandler = {
  description:
    'List tickets from Freshservice. Optionally filter by status, priority, or requester.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      filter: {
        type: 'string',
        enum: ['new_and_my_open', 'watching', 'spam', 'deleted'],
        description: 'Predefined filter to apply',
      },
      requester_id: {
        type: 'number',
        description: 'Filter by requester user ID',
      },
      email: {
        type: 'string',
        description: 'Filter tickets by requester email',
      },
      updated_since: {
        type: 'string',
        description: 'Return tickets updated since this date (ISO 8601)',
      },
      order_type: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: "desc")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 30),
        page: String(params.page ?? 1),
      };
      if (params.filter) query.filter = params.filter;
      if (params.requester_id) query.requester_id = String(params.requester_id);
      if (params.email) query.email = params.email;
      if (params.updated_since) query.updated_since = params.updated_since;
      if (params.order_type) query.order_type = params.order_type;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/tickets`,
        query,
      });

      const tickets: any[] = result.tickets || [];
      if (tickets.length === 0) {
        return { content: 'No tickets found.', metadata: { ticketCount: 0 } };
      }

      const lines = tickets.map((t: any) => formatTicket(t));
      return {
        content: `${tickets.length} ticket(s):\n${lines.join('\n')}`,
        metadata: { ticketCount: tickets.length },
      };
    } catch (err) {
      return fsError(err);
    }
  },
};

// ─── Tool: fs_create_ticket ─────────────────────────────

const createTicket: ToolHandler = {
  description:
    'Create a new ticket in Freshservice. Provide a subject, description, and requester email.',
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
        description: 'Priority: 1=Low, 2=Medium, 3=High, 4=Urgent (default: 1)',
      },
      status: {
        type: 'number',
        enum: [2, 3, 4, 5],
        description: 'Status: 2=Open, 3=Pending, 4=Resolved, 5=Closed (default: 2)',
      },
      type: {
        type: 'string',
        enum: ['Incident', 'Service Request'],
        description: 'Ticket type (default: "Incident")',
      },
      category: {
        type: 'string',
        description: 'Ticket category',
      },
      responder_id: {
        type: 'number',
        description: 'Agent ID to assign the ticket to',
      },
      group_id: {
        type: 'number',
        description: 'Group ID to assign the ticket to',
      },
    },
    required: ['subject', 'description', 'email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);
      const body: Record<string, any> = {
        subject: params.subject,
        description: params.description,
        email: params.email,
        priority: params.priority || 1,
        status: params.status || 2,
      };
      if (params.type) body.type = params.type;
      if (params.category) body.category = params.category;
      if (params.responder_id) body.responder_id = params.responder_id;
      if (params.group_id) body.group_id = params.group_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/tickets`,
        body,
      });

      const t = result.ticket;
      return {
        content: `Ticket created: #${t.id} "${t.subject}" -- ${ticketStatus(t.status)} (${ticketPriority(t.priority)})`,
        metadata: {
          ticketId: t.id,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
        },
      };
    } catch (err) {
      return fsError(err);
    }
  },
};

// ─── Tool: fs_update_ticket ─────────────────────────────

const updateTicket: ToolHandler = {
  description:
    'Update an existing Freshservice ticket. Can change status, priority, assignee, or add a reply.',
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
        description: 'New status: 2=Open, 3=Pending, 4=Resolved, 5=Closed',
      },
      priority: {
        type: 'number',
        enum: [1, 2, 3, 4],
        description: 'New priority: 1=Low, 2=Medium, 3=High, 4=Urgent',
      },
      responder_id: {
        type: 'number',
        description: 'Agent ID to reassign to',
      },
      group_id: {
        type: 'number',
        description: 'Group ID to reassign to',
      },
      category: {
        type: 'string',
        description: 'New ticket category',
      },
    },
    required: ['ticket_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);
      const body: Record<string, any> = {};
      if (params.status) body.status = params.status;
      if (params.priority) body.priority = params.priority;
      if (params.responder_id) body.responder_id = params.responder_id;
      if (params.group_id) body.group_id = params.group_id;
      if (params.category) body.category = params.category;

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/tickets/${params.ticket_id}`,
        body,
      });

      const t = result.ticket;
      return {
        content: `Ticket #${t.id} updated -- ${ticketStatus(t.status)} (${ticketPriority(t.priority)})`,
        metadata: {
          ticketId: t.id,
          status: t.status,
          priority: t.priority,
        },
      };
    } catch (err) {
      return fsError(err);
    }
  },
};

// ─── Tool: fs_list_assets ───────────────────────────────

const listAssets: ToolHandler = {
  description:
    'List assets (configuration items) from Freshservice. Optionally search by name.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      search: {
        type: 'string',
        description: 'Search term to filter assets by name',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 30),
        page: String(params.page ?? 1),
      };

      let url = `${baseUrl}/assets`;
      if (params.search) {
        url = `${baseUrl}/assets`;
        query.search = params.search;
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url,
        query,
      });

      const assets: any[] = result.assets || [];
      if (assets.length === 0) {
        return { content: 'No assets found.', metadata: { assetCount: 0 } };
      }

      const lines = assets.map((a: any) => formatAsset(a));
      return {
        content: `${assets.length} asset(s):\n${lines.join('\n')}`,
        metadata: { assetCount: assets.length },
      };
    } catch (err) {
      return fsError(err);
    }
  },
};

// ─── Tool: fs_list_changes ──────────────────────────────

const listChanges: ToolHandler = {
  description:
    'List change requests from Freshservice. Optionally filter by status or requester.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      filter: {
        type: 'string',
        enum: ['my_open', 'unassigned', 'all'],
        description: 'Predefined filter to apply',
      },
      updated_since: {
        type: 'string',
        description: 'Return changes updated since this date (ISO 8601)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 30),
        page: String(params.page ?? 1),
      };
      if (params.filter) query.filter = params.filter;
      if (params.updated_since) query.updated_since = params.updated_since;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/changes`,
        query,
      });

      const changes: any[] = result.changes || [];
      if (changes.length === 0) {
        return { content: 'No change requests found.', metadata: { changeCount: 0 } };
      }

      const lines = changes.map((c: any) => formatChange(c));
      return {
        content: `${changes.length} change request(s):\n${lines.join('\n')}`,
        metadata: { changeCount: changes.length },
      };
    } catch (err) {
      return fsError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const freshserviceAdapter: SkillAdapter = {
  skillId: 'freshservice',
  name: 'Freshservice ITSM',
  // Base URL is dynamic based on domain; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://DOMAIN.freshservice.com/api/v2',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    fs_list_tickets: listTickets,
    fs_create_ticket: createTicket,
    fs_update_ticket: updateTicket,
    fs_list_assets: listAssets,
    fs_list_changes: listChanges,
  },
  configSchema: {
    domain: {
      type: 'string' as const,
      label: 'Freshservice Domain',
      description: 'Your Freshservice domain (e.g. "mycompany" for mycompany.freshservice.com)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
