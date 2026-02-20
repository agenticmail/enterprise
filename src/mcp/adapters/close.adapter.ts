/**
 * MCP Skill Adapter — Close CRM
 *
 * Maps Close CRM REST API v1 endpoints to MCP tool handlers.
 * Close uses Basic authentication with the API key as username.
 *
 * Close API docs: https://developer.close.com/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function closeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errorMsg = data.error || data.message || err.message;
      const fieldErrors = data['field-errors']
        ? ` -- ${JSON.stringify(data['field-errors'])}`
        : '';
      return { content: `Close API error: ${errorMsg}${fieldErrors}`, isError: true };
    }
    return { content: `Close API error: ${err.message}`, isError: true };
  }
  return { content: `Close API error: ${String(err)}`, isError: true };
}

/** Format a Close lead for display */
function formatLead(lead: any): string {
  const name = lead.display_name || lead.name || '(unnamed)';
  const status = lead.status_label || 'unknown';
  const contacts = lead.contacts?.length || 0;
  const created = lead.date_created ? lead.date_created.slice(0, 16) : '';
  const url = lead.url || '';
  return `${name} -- ${status} -- ${contacts} contact(s) -- ${created} (ID: ${lead.id})`;
}

/** Format a Close opportunity for display */
function formatOpportunity(opp: any): string {
  const name = opp.note || opp.lead_name || '(unnamed)';
  const status = opp.status_label || opp.status_type || 'unknown';
  const value = opp.value_formatted || (opp.value != null ? `$${opp.value / 100}` : 'N/A');
  const confidence = opp.confidence != null ? `${opp.confidence}%` : '';
  const created = opp.date_created ? opp.date_created.slice(0, 16) : '';
  return `${name} -- ${status} -- ${value}${confidence ? ` (${confidence})` : ''} -- ${created} (ID: ${opp.id})`;
}

// ─── Tool: close_list_leads ─────────────────────────────

const listLeads: ToolHandler = {
  description:
    'List leads from Close CRM with optional pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      _skip: {
        type: 'number',
        description: 'Number of leads to skip (for pagination, default 0)',
      },
      _limit: {
        type: 'number',
        description: 'Max leads to return (default 25, max 100)',
      },
      _order_by: {
        type: 'string',
        description: 'Sort order (e.g. "date_created", "-date_created")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        _skip: String(params._skip ?? 0),
        _limit: String(params._limit ?? 25),
      };
      if (params._order_by) query._order_by = params._order_by;

      const result = await ctx.apiExecutor.get('/lead', query);

      const leads: any[] = result.data || [];
      if (leads.length === 0) {
        return { content: 'No leads found.' };
      }

      const lines = leads.map((l: any) => formatLead(l));
      const hasMore = result.has_more;

      return {
        content: `Found ${leads.length} leads:\n${lines.join('\n')}${hasMore ? '\n\n(More leads available)' : ''}`,
        metadata: { count: leads.length, total: result.total_results, hasMore: !!hasMore },
      };
    } catch (err) {
      return closeError(err);
    }
  },
};

// ─── Tool: close_create_lead ────────────────────────────

const createLead: ToolHandler = {
  description:
    'Create a new lead in Close CRM. Provide a name and optional contacts, custom fields, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Lead/company name',
      },
      url: {
        type: 'string',
        description: 'Company website URL',
      },
      description: {
        type: 'string',
        description: 'Lead description or notes',
      },
      status_id: {
        type: 'string',
        description: 'Lead status ID',
      },
      contacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            title: { type: 'string' },
            emails: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  type: { type: 'string' },
                },
                required: ['email'],
              },
            },
            phones: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  phone: { type: 'string' },
                  type: { type: 'string' },
                },
                required: ['phone'],
              },
            },
          },
        },
        description: 'Contacts to add to the lead',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { name: params.name };
      if (params.url) body.url = params.url;
      if (params.description) body.description = params.description;
      if (params.status_id) body.status_id = params.status_id;
      if (params.contacts?.length) body.contacts = params.contacts;

      const result = await ctx.apiExecutor.post('/lead', body);

      return {
        content: `Lead created: ${formatLead(result)}`,
        metadata: {
          leadId: result.id,
          name: result.display_name || result.name,
        },
      };
    } catch (err) {
      return closeError(err);
    }
  },
};

// ─── Tool: close_search_leads ───────────────────────────

const searchLeads: ToolHandler = {
  description:
    'Search leads in Close CRM using a query string. Supports Close search syntax.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query using Close search syntax (e.g. "company:Acme" or "lead_status:Active")',
      },
      _limit: {
        type: 'number',
        description: 'Max results to return (default 25)',
      },
      _skip: {
        type: 'number',
        description: 'Number of results to skip for pagination',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        query: params.query,
        _limit: params._limit ?? 25,
      };
      if (params._skip) body._skip = params._skip;

      const result = await ctx.apiExecutor.post('/lead/search', body);

      const leads: any[] = result.data || [];
      if (leads.length === 0) {
        return { content: `No leads found matching "${params.query}".` };
      }

      const lines = leads.map((l: any) => formatLead(l));
      return {
        content: `Found ${result.total_results || leads.length} leads (showing ${leads.length}):\n${lines.join('\n')}`,
        metadata: { count: leads.length, total: result.total_results, query: params.query },
      };
    } catch (err) {
      return closeError(err);
    }
  },
};

// ─── Tool: close_create_activity ────────────────────────

const createActivity: ToolHandler = {
  description:
    'Create an activity (note, call, or email) on a Close CRM lead.',
  inputSchema: {
    type: 'object',
    properties: {
      activity_type: {
        type: 'string',
        enum: ['note', 'call', 'email'],
        description: 'Type of activity to create',
      },
      lead_id: {
        type: 'string',
        description: 'Lead ID to attach the activity to',
      },
      note: {
        type: 'string',
        description: 'Note content (for note activities) or call/email notes',
      },
      subject: {
        type: 'string',
        description: 'Subject line (for email activities)',
      },
      body_text: {
        type: 'string',
        description: 'Body text (for email activities)',
      },
      direction: {
        type: 'string',
        enum: ['outbound', 'inbound'],
        description: 'Direction of the activity (for call/email, default: "outbound")',
      },
      duration: {
        type: 'number',
        description: 'Call duration in seconds (for call activities)',
      },
    },
    required: ['activity_type', 'lead_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const activityType = params.activity_type;
      const body: Record<string, any> = {
        lead_id: params.lead_id,
      };

      if (activityType === 'note') {
        body.note = params.note || '';
      } else if (activityType === 'call') {
        body.direction = params.direction || 'outbound';
        body.note = params.note || '';
        if (params.duration) body.duration = params.duration;
      } else if (activityType === 'email') {
        body.subject = params.subject || '';
        body.body_text = params.body_text || params.note || '';
        body.direction = params.direction || 'outbound';
      }

      const result = await ctx.apiExecutor.post(`/activity/${activityType}`, body);

      return {
        content: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} activity created on lead ${params.lead_id} (activity ID: ${result.id})`,
        metadata: {
          activityId: result.id,
          activityType,
          leadId: params.lead_id,
        },
      };
    } catch (err) {
      return closeError(err);
    }
  },
};

// ─── Tool: close_list_opportunities ─────────────────────

const listOpportunities: ToolHandler = {
  description:
    'List opportunities from Close CRM with optional filtering by lead or status.',
  inputSchema: {
    type: 'object',
    properties: {
      lead_id: {
        type: 'string',
        description: 'Filter opportunities by lead ID',
      },
      status_type: {
        type: 'string',
        enum: ['active', 'won', 'lost'],
        description: 'Filter by opportunity status type',
      },
      _limit: {
        type: 'number',
        description: 'Max results to return (default 25)',
      },
      _skip: {
        type: 'number',
        description: 'Number of results to skip for pagination',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        _limit: String(params._limit ?? 25),
      };
      if (params._skip) query._skip = String(params._skip);
      if (params.lead_id) query.lead_id = params.lead_id;
      if (params.status_type) query.status_type = params.status_type;

      const result = await ctx.apiExecutor.get('/opportunity', query);

      const opportunities: any[] = result.data || [];
      if (opportunities.length === 0) {
        return { content: 'No opportunities found.' };
      }

      const lines = opportunities.map((o: any) => formatOpportunity(o));
      const hasMore = result.has_more;

      return {
        content: `Found ${opportunities.length} opportunities:\n${lines.join('\n')}${hasMore ? '\n\n(More opportunities available)' : ''}`,
        metadata: { count: opportunities.length, total: result.total_results, hasMore: !!hasMore },
      };
    } catch (err) {
      return closeError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const closeAdapter: SkillAdapter = {
  skillId: 'close-crm',
  name: 'Close CRM',
  baseUrl: 'https://api.close.com/api/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    close_list_leads: listLeads,
    close_create_lead: createLead,
    close_search_leads: searchLeads,
    close_create_activity: createActivity,
    close_list_opportunities: listOpportunities,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
