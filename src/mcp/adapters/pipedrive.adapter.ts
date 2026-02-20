/**
 * MCP Skill Adapter — Pipedrive
 *
 * Maps Pipedrive REST API v1 endpoints to MCP tool handlers.
 * Pipedrive uses an API token passed as the `api_token` query parameter
 * on every request (not in headers).
 *
 * Pipedrive API docs: https://developers.pipedrive.com/docs/api/v1
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function pipedriveError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errorMsg = data.error || data.error_info || err.message;
      return { content: `Pipedrive API error: ${errorMsg}`, isError: true };
    }
    return { content: `Pipedrive API error: ${err.message}`, isError: true };
  }
  return { content: `Pipedrive API error: ${String(err)}`, isError: true };
}

/**
 * Pipedrive uses api_token as a query parameter on every request.
 * This helper merges the token into the query object.
 */
function withToken(ctx: ToolExecutionContext, query?: Record<string, string>): Record<string, string> {
  const token = ctx.credentials.apiKey || ctx.credentials.token || '';
  return { ...query, api_token: token };
}

/** Format a Pipedrive deal for display */
function formatDeal(deal: any): string {
  const title = deal.title || 'Untitled';
  const value = deal.value != null ? `${deal.currency || ''} ${deal.value}`.trim() : 'N/A';
  const stage = deal.stage_id ? `stage ${deal.stage_id}` : 'unknown stage';
  const status = deal.status || 'open';
  const person = deal.person_name || 'unassigned';
  const org = deal.org_name || '';
  return `${title} -- ${value} -- ${stage} -- ${status} -- ${person}${org ? ` @ ${org}` : ''} (ID: ${deal.id})`;
}

/** Format a Pipedrive person for display */
function formatPerson(person: any): string {
  const name = person.name || '(no name)';
  const email = person.primary_email || (person.email?.[0]?.value) || '(no email)';
  const phone = person.primary_phone || (person.phone?.[0]?.value) || '';
  const org = person.org_name || '';
  const phonePart = phone ? ` -- ${phone}` : '';
  return `${name} <${email}>${phonePart}${org ? ` @ ${org}` : ''} (ID: ${person.id})`;
}

// ─── Tool: pipedrive_create_deal ────────────────────────

const createDeal: ToolHandler = {
  description:
    'Create a new deal in Pipedrive. Provide a title and optionally set value, currency, stage, and associated person/organization.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Deal title',
      },
      value: {
        type: 'number',
        description: 'Deal monetary value',
      },
      currency: {
        type: 'string',
        description: 'Deal currency code (e.g. "USD", "EUR"). Defaults to account default.',
      },
      stage_id: {
        type: 'number',
        description: 'Pipeline stage ID to place the deal in',
      },
      person_id: {
        type: 'number',
        description: 'ID of the person to associate with this deal',
      },
      org_id: {
        type: 'number',
        description: 'ID of the organization to associate with this deal',
      },
      status: {
        type: 'string',
        enum: ['open', 'won', 'lost', 'deleted'],
        description: 'Deal status (default: "open")',
      },
    },
    required: ['title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { title: params.title };
      if (params.value !== undefined) body.value = params.value;
      if (params.currency) body.currency = params.currency;
      if (params.stage_id) body.stage_id = params.stage_id;
      if (params.person_id) body.person_id = params.person_id;
      if (params.org_id) body.org_id = params.org_id;
      if (params.status) body.status = params.status;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/deals',
        query: withToken(ctx),
        body,
      });

      if (!result.success) {
        return { content: `Pipedrive error: ${result.error || 'unknown error'}`, isError: true };
      }

      const deal = result.data;
      return {
        content: `Deal created: ${formatDeal(deal)}`,
        metadata: {
          dealId: deal.id,
          title: deal.title,
        },
      };
    } catch (err) {
      return pipedriveError(err);
    }
  },
};

// ─── Tool: pipedrive_list_deals ─────────────────────────

const listDeals: ToolHandler = {
  description:
    'List deals from Pipedrive. Optionally filter by status, stage, or user.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
        description: 'Filter by deal status (default: "all_not_deleted")',
      },
      stage_id: {
        type: 'number',
        description: 'Filter by pipeline stage ID',
      },
      user_id: {
        type: 'number',
        description: 'Filter by owner user ID',
      },
      start: {
        type: 'number',
        description: 'Pagination offset (default 0)',
      },
      limit: {
        type: 'number',
        description: 'Number of deals to return (default 20, max 500)',
      },
      sort: {
        type: 'string',
        description: 'Sort field and direction (e.g. "add_time DESC", "value ASC")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        start: String(params.start ?? 0),
        limit: String(params.limit ?? 20),
      };
      if (params.status) query.status = params.status;
      if (params.stage_id) query.stage_id = String(params.stage_id);
      if (params.user_id) query.user_id = String(params.user_id);
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/deals',
        query: withToken(ctx, query),
      });

      if (!result.success) {
        return { content: `Pipedrive error: ${result.error || 'unknown error'}`, isError: true };
      }

      const deals: any[] = result.data || [];
      if (deals.length === 0) {
        return { content: 'No deals found.' };
      }

      const lines = deals.map((d: any) => formatDeal(d));
      const moreAvailable = result.additional_data?.pagination?.more_items_in_collection;

      return {
        content: `Found ${deals.length} deals:\n${lines.join('\n')}${moreAvailable ? '\n\n(More deals available)' : ''}`,
        metadata: {
          count: deals.length,
          moreAvailable: !!moreAvailable,
        },
      };
    } catch (err) {
      return pipedriveError(err);
    }
  },
};

// ─── Tool: pipedrive_create_person ──────────────────────

const createPerson: ToolHandler = {
  description:
    'Create a new person (contact) in Pipedrive. Provide at least a name, plus optional email, phone, and organization.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Person full name',
      },
      email: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            label: { type: 'string', enum: ['work', 'home', 'other'] },
          },
          required: ['value'],
        },
        description: 'Email addresses (e.g. [{ "value": "j@example.com", "label": "work" }])',
      },
      phone: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            label: { type: 'string', enum: ['work', 'home', 'mobile', 'other'] },
          },
          required: ['value'],
        },
        description: 'Phone numbers (e.g. [{ "value": "+15551234567", "label": "mobile" }])',
      },
      org_id: {
        type: 'number',
        description: 'Organization ID to associate with this person',
      },
      visible_to: {
        type: 'number',
        enum: [1, 3, 5, 7],
        description: 'Visibility: 1=owner only, 3=owner team, 5=owner team + sub-teams, 7=entire company',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { name: params.name };
      if (params.email) body.email = params.email;
      if (params.phone) body.phone = params.phone;
      if (params.org_id) body.org_id = params.org_id;
      if (params.visible_to) body.visible_to = params.visible_to;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/persons',
        query: withToken(ctx),
        body,
      });

      if (!result.success) {
        return { content: `Pipedrive error: ${result.error || 'unknown error'}`, isError: true };
      }

      const person = result.data;
      return {
        content: `Person created: ${formatPerson(person)}`,
        metadata: {
          personId: person.id,
          name: person.name,
        },
      };
    } catch (err) {
      return pipedriveError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const pipedriveAdapter: SkillAdapter = {
  skillId: 'pipedrive-deals',
  name: 'Pipedrive Deals',
  baseUrl: 'https://api.pipedrive.com/v1',
  auth: {
    type: 'api_key',
    // Pipedrive passes api_token as a query parameter, not in headers.
    // The withToken() helper injects it into every request's query object.
    // We set headerName to a no-op to prevent the framework from injecting it as a header.
    headerName: '',
  },
  tools: {
    pipedrive_create_deal: createDeal,
    pipedrive_list_deals: listDeals,
    pipedrive_create_person: createPerson,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
  configSchema: {
    companyDomain: {
      type: 'string' as const,
      label: 'Pipedrive Company Domain',
      description: 'Your Pipedrive company subdomain (e.g. "mycompany" for mycompany.pipedrive.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
};
