/**
 * MCP Skill Adapter — HubSpot
 *
 * Maps HubSpot CRM API endpoints to MCP tool handlers.
 * Covers contacts, deals, and the unified CRM search endpoint.
 *
 * HubSpot API docs: https://developers.hubspot.com/docs/api/crm
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function hubspotError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const category = data.category ? ` [${data.category}]` : '';
      const details = data.message || err.message;
      return { content: `HubSpot API error${category}: ${details}`, isError: true };
    }
    return { content: `HubSpot API error: ${err.message}`, isError: true };
  }
  return { content: `HubSpot API error: ${String(err)}`, isError: true };
}

/** Format a HubSpot contact for display */
function formatContact(contact: any): string {
  const props = contact.properties || {};
  const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || '(no name)';
  const email = props.email || '(no email)';
  const company = props.company ? ` @ ${props.company}` : '';
  return `${name} <${email}>${company} (ID: ${contact.id})`;
}

/** Format a HubSpot deal for display */
function formatDeal(deal: any): string {
  const props = deal.properties || {};
  const name = props.dealname || 'Untitled';
  const stage = props.dealstage || 'unknown';
  const amount = props.amount ? `$${Number(props.amount).toLocaleString()}` : 'N/A';
  const closeDate = props.closedate ? props.closedate.slice(0, 10) : 'N/A';
  return `${name} -- ${stage} -- ${amount} -- close: ${closeDate} (ID: ${deal.id})`;
}

// ─── Tool: hubspot_create_contact ───────────────────────

const createContact: ToolHandler = {
  description:
    'Create a new contact in HubSpot CRM. Provide at least an email address, plus optional name and company fields.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Contact email address',
      },
      firstname: {
        type: 'string',
        description: 'Contact first name',
      },
      lastname: {
        type: 'string',
        description: 'Contact last name',
      },
      company: {
        type: 'string',
        description: 'Company name',
      },
      phone: {
        type: 'string',
        description: 'Phone number',
      },
      lifecyclestage: {
        type: 'string',
        description: 'Lifecycle stage (e.g. "subscriber", "lead", "opportunity", "customer")',
      },
    },
    required: ['email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const properties: Record<string, any> = { email: params.email };
      if (params.firstname) properties.firstname = params.firstname;
      if (params.lastname) properties.lastname = params.lastname;
      if (params.company) properties.company = params.company;
      if (params.phone) properties.phone = params.phone;
      if (params.lifecyclestage) properties.lifecyclestage = params.lifecyclestage;

      const result = await ctx.apiExecutor.post('/crm/v3/objects/contacts', { properties });

      const display = formatContact(result);
      return {
        content: `Contact created: ${display}`,
        metadata: {
          contactId: result.id,
          email: params.email,
        },
      };
    } catch (err) {
      return hubspotError(err);
    }
  },
};

// ─── Tool: hubspot_list_contacts ────────────────────────

const listContacts: ToolHandler = {
  description:
    'List contacts from HubSpot CRM with optional property selection and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of contacts to return (default 10, max 100)',
      },
      properties: {
        type: 'array',
        items: { type: 'string' },
        description: 'Contact properties to include (e.g. ["email", "firstname", "lastname", "company"])',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 10),
      };
      if (params.properties?.length) {
        query.properties = params.properties.join(',');
      } else {
        query.properties = 'email,firstname,lastname,company';
      }
      if (params.after) query.after = params.after;

      const result = await ctx.apiExecutor.get('/crm/v3/objects/contacts', query);

      const contacts: any[] = result.results || [];
      if (contacts.length === 0) {
        return { content: 'No contacts found.' };
      }

      const lines = contacts.map((c: any) => formatContact(c));
      const nextCursor = result.paging?.next?.after;

      return {
        content: `Found ${contacts.length} contacts:\n${lines.join('\n')}${nextCursor ? `\n\n(More available, cursor: ${nextCursor})` : ''}`,
        metadata: {
          count: contacts.length,
          after: nextCursor,
        },
      };
    } catch (err) {
      return hubspotError(err);
    }
  },
};

// ─── Tool: hubspot_create_deal ──────────────────────────

const createDeal: ToolHandler = {
  description:
    'Create a new deal in HubSpot CRM. Provide the deal name, stage, and optional amount and close date.',
  inputSchema: {
    type: 'object',
    properties: {
      dealname: {
        type: 'string',
        description: 'Name of the deal',
      },
      dealstage: {
        type: 'string',
        description: 'Deal stage ID (e.g. "appointmentscheduled", "qualifiedtobuy", "closedwon")',
      },
      amount: {
        type: 'string',
        description: 'Deal amount (as a string, e.g. "50000")',
      },
      closedate: {
        type: 'string',
        description: 'Expected close date in ISO format (e.g. "2025-06-30")',
      },
      pipeline: {
        type: 'string',
        description: 'Pipeline ID (default is the default pipeline)',
      },
    },
    required: ['dealname', 'dealstage'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const properties: Record<string, any> = {
        dealname: params.dealname,
        dealstage: params.dealstage,
      };
      if (params.amount) properties.amount = params.amount;
      if (params.closedate) properties.closedate = params.closedate;
      if (params.pipeline) properties.pipeline = params.pipeline;

      const result = await ctx.apiExecutor.post('/crm/v3/objects/deals', { properties });

      const display = formatDeal(result);
      return {
        content: `Deal created: ${display}`,
        metadata: {
          dealId: result.id,
          dealname: params.dealname,
          dealstage: params.dealstage,
        },
      };
    } catch (err) {
      return hubspotError(err);
    }
  },
};

// ─── Tool: hubspot_list_deals ───────────────────────────

const listDeals: ToolHandler = {
  description:
    'List deals from HubSpot CRM with optional property selection and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of deals to return (default 10, max 100)',
      },
      properties: {
        type: 'array',
        items: { type: 'string' },
        description: 'Deal properties to include (e.g. ["dealname", "dealstage", "amount", "closedate"])',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 10),
      };
      if (params.properties?.length) {
        query.properties = params.properties.join(',');
      } else {
        query.properties = 'dealname,dealstage,amount,closedate';
      }
      if (params.after) query.after = params.after;

      const result = await ctx.apiExecutor.get('/crm/v3/objects/deals', query);

      const deals: any[] = result.results || [];
      if (deals.length === 0) {
        return { content: 'No deals found.' };
      }

      const lines = deals.map((d: any) => formatDeal(d));
      const nextCursor = result.paging?.next?.after;

      return {
        content: `Found ${deals.length} deals:\n${lines.join('\n')}${nextCursor ? `\n\n(More available, cursor: ${nextCursor})` : ''}`,
        metadata: {
          count: deals.length,
          after: nextCursor,
        },
      };
    } catch (err) {
      return hubspotError(err);
    }
  },
};

// ─── Tool: hubspot_search ───────────────────────────────

const search: ToolHandler = {
  description:
    'Search HubSpot CRM objects (contacts, deals, companies, tickets) using filters. Returns matching records with requested properties.',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        enum: ['contacts', 'deals', 'companies', 'tickets'],
        description: 'The CRM object type to search',
      },
      query: {
        type: 'string',
        description: 'Free-text search query (searches across default searchable properties)',
      },
      filters: {
        type: 'array',
        description: 'Array of filter objects: [{ propertyName, operator, value }]. Operators: "EQ", "NEQ", "LT", "GT", "CONTAINS", "HAS_PROPERTY", etc.',
        items: {
          type: 'object',
          properties: {
            propertyName: { type: 'string' },
            operator: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['propertyName', 'operator', 'value'],
        },
      },
      properties: {
        type: 'array',
        items: { type: 'string' },
        description: 'Properties to return in results',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default 10, max 100)',
      },
    },
    required: ['object_type'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        limit: params.limit ?? 10,
      };
      if (params.query) body.query = params.query;
      if (params.properties?.length) body.properties = params.properties;
      if (params.filters?.length) {
        body.filterGroups = [{ filters: params.filters }];
      }

      const result = await ctx.apiExecutor.post(
        `/crm/v3/objects/${params.object_type}/search`,
        body,
      );

      const records: any[] = result.results || [];
      const total = result.total ?? records.length;

      if (records.length === 0) {
        return { content: `No ${params.object_type} found matching the search criteria.` };
      }

      const lines = records.map((r: any) => {
        const props = r.properties || {};
        const name = props.dealname || props.firstname
          ? [props.firstname, props.lastname].filter(Boolean).join(' ')
          : props.name || props.subject || props.email || r.id;
        const id = r.id;
        const extras = Object.entries(props)
          .filter(([k]) => !['dealname', 'firstname', 'lastname', 'name', 'hs_object_id'].includes(k))
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        return `${name} (ID: ${id})${extras ? ` -- ${extras}` : ''}`;
      });

      return {
        content: `Found ${total} ${params.object_type} (showing ${records.length}):\n${lines.join('\n')}`,
        metadata: {
          objectType: params.object_type,
          total,
          shown: records.length,
        },
      };
    } catch (err) {
      return hubspotError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const hubspotAdapter: SkillAdapter = {
  skillId: 'hubspot-crm',
  name: 'HubSpot CRM',
  baseUrl: 'https://api.hubapi.com',
  auth: {
    type: 'oauth2',
    provider: 'hubspot',
    headerPrefix: 'Bearer',
  },
  tools: {
    hubspot_create_contact: createContact,
    hubspot_list_contacts: listContacts,
    hubspot_create_deal: createDeal,
    hubspot_list_deals: listDeals,
    hubspot_search: search,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
