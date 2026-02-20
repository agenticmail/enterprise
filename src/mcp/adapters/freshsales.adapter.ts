/**
 * MCP Skill Adapter — Freshsales CRM
 *
 * Maps Freshsales CRM API endpoints to MCP tool handlers.
 * Freshsales uses a dynamic base URL based on the customer's domain:
 * https://{domain}.myfreshworks.com/crm/sales/api
 *
 * The domain is read from ctx.skillConfig.domain.
 *
 * Freshsales API docs: https://developers.freshworks.com/crm/api/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Freshsales base URL from skill config */
function fsUrl(ctx: ToolExecutionContext): string {
  const domain = ctx.skillConfig.domain;
  if (!domain) {
    throw new Error('Freshsales domain is required in skillConfig (e.g. { domain: "mycompany" })');
  }
  return `https://${domain}.myfreshworks.com/crm/sales/api`;
}

function freshsalesError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.errors?.message?.[0] || err.message;
      return { content: `Freshsales API error: ${msg}`, isError: true };
    }
    return { content: `Freshsales API error: ${err.message}`, isError: true };
  }
  return { content: `Freshsales API error: ${String(err)}`, isError: true };
}

/** Format a Freshsales contact for display */
function formatContact(contact: any): string {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = contact.email || '(no email)';
  const phone = contact.mobile_number || contact.work_number || '';
  const company = contact.company?.name || '';
  const jobTitle = contact.job_title || '';
  const phonePart = phone ? ` -- ${phone}` : '';
  const jobPart = jobTitle ? `, ${jobTitle}` : '';
  const companyPart = company ? ` @ ${company}` : '';
  return `${name} <${email}>${jobPart}${companyPart}${phonePart} (ID: ${contact.id})`;
}

/** Format a Freshsales deal for display */
function formatDeal(deal: any): string {
  const name = deal.name || '(unnamed)';
  const amount = deal.amount != null ? `$${Number(deal.amount).toLocaleString()}` : 'N/A';
  const stage = deal.deal_stage?.name || 'unknown';
  const probability = deal.probability != null ? `${deal.probability}%` : '';
  const closeDate = deal.expected_close ? deal.expected_close.slice(0, 10) : 'N/A';
  const owner = deal.owner?.name || 'unassigned';
  return `${name} -- ${amount} -- ${stage}${probability ? ` (${probability})` : ''} -- close: ${closeDate} -- ${owner} (ID: ${deal.id})`;
}

// ─── Tool: freshsales_list_contacts ─────────────────────

const listContacts: ToolHandler = {
  description:
    'List contacts from Freshsales CRM with optional filtering and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      view_id: {
        type: 'number',
        description: 'View/filter ID to apply (e.g. from predefined views)',
      },
      sort: {
        type: 'string',
        description: 'Sort field (e.g. "created_at", "updated_at")',
      },
      sort_type: {
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
      const baseUrl = fsUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.view_id) query.view_id = String(params.view_id);
      if (params.sort) query.sort = params.sort;
      if (params.sort_type) query.sort_type = params.sort_type;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/contacts/view/${params.view_id || ''}`,
        query,
      });

      const contacts: any[] = result.contacts || [];
      if (contacts.length === 0) {
        return { content: 'No contacts found.' };
      }

      const lines = contacts.map((c: any) => formatContact(c));
      const meta = result.meta || {};

      return {
        content: `Found ${meta.total || contacts.length} contacts (showing ${contacts.length}):\n${lines.join('\n')}`,
        metadata: { count: contacts.length, total: meta.total },
      };
    } catch (err) {
      return freshsalesError(err);
    }
  },
};

// ─── Tool: freshsales_create_contact ────────────────────

const createContact: ToolHandler = {
  description:
    'Create a new contact in Freshsales CRM. Provide at least an email or last name.',
  inputSchema: {
    type: 'object',
    properties: {
      first_name: {
        type: 'string',
        description: 'Contact first name',
      },
      last_name: {
        type: 'string',
        description: 'Contact last name',
      },
      email: {
        type: 'string',
        description: 'Contact email address',
      },
      mobile_number: {
        type: 'string',
        description: 'Mobile phone number',
      },
      work_number: {
        type: 'string',
        description: 'Work phone number',
      },
      job_title: {
        type: 'string',
        description: 'Job title',
      },
      company_id: {
        type: 'number',
        description: 'Associated company/account ID',
      },
      lifecycle_stage_id: {
        type: 'number',
        description: 'Lifecycle stage ID',
      },
      owner_id: {
        type: 'number',
        description: 'Owner (sales rep) user ID',
      },
    },
    required: ['email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);

      const contact: Record<string, any> = { email: params.email };
      if (params.first_name) contact.first_name = params.first_name;
      if (params.last_name) contact.last_name = params.last_name;
      if (params.mobile_number) contact.mobile_number = params.mobile_number;
      if (params.work_number) contact.work_number = params.work_number;
      if (params.job_title) contact.job_title = params.job_title;
      if (params.company_id) contact.company_id = params.company_id;
      if (params.lifecycle_stage_id) contact.lifecycle_stage_id = params.lifecycle_stage_id;
      if (params.owner_id) contact.owner_id = params.owner_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/contacts`,
        body: { contact },
      });

      const c = result.contact;
      return {
        content: `Contact created: ${formatContact(c)}`,
        metadata: {
          contactId: c.id,
          email: c.email,
        },
      };
    } catch (err) {
      return freshsalesError(err);
    }
  },
};

// ─── Tool: freshsales_list_deals ────────────────────────

const listDeals: ToolHandler = {
  description:
    'List deals from Freshsales CRM with optional filtering and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      view_id: {
        type: 'number',
        description: 'View/filter ID to apply',
      },
      sort: {
        type: 'string',
        description: 'Sort field (e.g. "created_at", "amount")',
      },
      sort_type: {
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
      const baseUrl = fsUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.view_id) query.view_id = String(params.view_id);
      if (params.sort) query.sort = params.sort;
      if (params.sort_type) query.sort_type = params.sort_type;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/deals/view/${params.view_id || ''}`,
        query,
      });

      const deals: any[] = result.deals || [];
      if (deals.length === 0) {
        return { content: 'No deals found.' };
      }

      const lines = deals.map((d: any) => formatDeal(d));
      const meta = result.meta || {};

      return {
        content: `Found ${meta.total || deals.length} deals (showing ${deals.length}):\n${lines.join('\n')}`,
        metadata: { count: deals.length, total: meta.total },
      };
    } catch (err) {
      return freshsalesError(err);
    }
  },
};

// ─── Tool: freshsales_create_deal ───────────────────────

const createDeal: ToolHandler = {
  description:
    'Create a new deal in Freshsales CRM. Provide at least a name.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Deal name',
      },
      amount: {
        type: 'number',
        description: 'Deal amount',
      },
      expected_close: {
        type: 'string',
        description: 'Expected close date in ISO format (e.g. "2025-12-31")',
      },
      deal_stage_id: {
        type: 'number',
        description: 'Deal stage ID',
      },
      deal_pipeline_id: {
        type: 'number',
        description: 'Deal pipeline ID',
      },
      contact_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs of contacts to associate with this deal',
      },
      company_id: {
        type: 'number',
        description: 'Associated company/account ID',
      },
      owner_id: {
        type: 'number',
        description: 'Owner (sales rep) user ID',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);

      const deal: Record<string, any> = { name: params.name };
      if (params.amount !== undefined) deal.amount = params.amount;
      if (params.expected_close) deal.expected_close = params.expected_close;
      if (params.deal_stage_id) deal.deal_stage_id = params.deal_stage_id;
      if (params.deal_pipeline_id) deal.deal_pipeline_id = params.deal_pipeline_id;
      if (params.contact_ids?.length) deal.contacts_id = params.contact_ids;
      if (params.company_id) deal.company_id = params.company_id;
      if (params.owner_id) deal.owner_id = params.owner_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/deals`,
        body: { deal },
      });

      const d = result.deal;
      return {
        content: `Deal created: "${d.name}" -- ${d.amount != null ? `$${d.amount}` : 'N/A'} (ID: ${d.id})`,
        metadata: {
          dealId: d.id,
          name: d.name,
          amount: d.amount,
        },
      };
    } catch (err) {
      return freshsalesError(err);
    }
  },
};

// ─── Tool: freshsales_search ────────────────────────────

const search: ToolHandler = {
  description:
    'Search across Freshsales CRM entities (contacts, deals, accounts, etc.) by keyword.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search keyword or phrase',
      },
      entities: {
        type: 'string',
        description: 'Comma-separated entity types to search (e.g. "contact,deal,account"). Defaults to all.',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = fsUrl(ctx);

      const query: Record<string, string> = {
        q: params.query,
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.entities) query.include = params.entities;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/search`,
        query,
      });

      const items: any[] = [];
      for (const [entity, records] of Object.entries(result)) {
        if (Array.isArray(records)) {
          for (const r of records as any[]) {
            items.push(`[${entity}] ${r.display_name || r.name || r.email || r.id} (ID: ${r.id})`);
          }
        }
      }

      if (items.length === 0) {
        return { content: `No results found for "${params.query}".` };
      }

      return {
        content: `Found ${items.length} results for "${params.query}":\n${items.join('\n')}`,
        metadata: { count: items.length, query: params.query },
      };
    } catch (err) {
      return freshsalesError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const freshsalesAdapter: SkillAdapter = {
  skillId: 'freshsales',
  name: 'Freshsales CRM',
  baseUrl: 'https://DOMAIN.myfreshworks.com/crm/sales/api',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Token token=',
  },
  tools: {
    freshsales_list_contacts: listContacts,
    freshsales_create_contact: createContact,
    freshsales_list_deals: listDeals,
    freshsales_create_deal: createDeal,
    freshsales_search: search,
  },
  configSchema: {
    domain: {
      type: 'string' as const,
      label: 'Freshsales Domain',
      description: 'Your Freshsales subdomain (e.g. "mycompany" for mycompany.myfreshworks.com)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
