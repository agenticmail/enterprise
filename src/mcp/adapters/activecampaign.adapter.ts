/**
 * MCP Skill Adapter — ActiveCampaign
 *
 * Maps ActiveCampaign API v3 endpoints to MCP tool handlers.
 * Covers contacts, deals, and automations management.
 *
 * ActiveCampaign API docs: https://developers.activecampaign.com/reference
 *
 * Base URL is dynamic based on the customer's account name:
 * https://{account}.api-us1.com/api/3
 *
 * The account name is read from ctx.skillConfig.account.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the ActiveCampaign base URL from skill config */
function acUrl(ctx: ToolExecutionContext): string {
  const account = ctx.skillConfig.account;
  if (!account) {
    throw new Error('ActiveCampaign account name is required in skillConfig (e.g. { account: "mycompany" })');
  }
  return `https://${account}.api-us1.com/api/3`;
}

function activecampaignError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.error || err.message;
      const errors = data.errors ? ` -- ${JSON.stringify(data.errors)}` : '';
      return { content: `ActiveCampaign API error: ${message}${errors}`, isError: true };
    }
    return { content: `ActiveCampaign API error: ${err.message}`, isError: true };
  }
  return { content: `ActiveCampaign API error: ${String(err)}`, isError: true };
}

/** Format an ActiveCampaign contact for display */
function formatContact(contact: any): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = contact.email || '(no email)';
  const phone = contact.phone ? ` | ${contact.phone}` : '';
  return `${name} <${email}>${phone} (ID: ${contact.id})`;
}

/** Format an ActiveCampaign deal for display */
function formatDeal(deal: any): string {
  const title = deal.title || 'Untitled';
  const value = deal.value ? `$${Number(deal.value / 100).toLocaleString()}` : 'N/A';
  const stage = deal.stage || 'unknown';
  const status = deal.status === '0' ? 'Open' : deal.status === '1' ? 'Won' : deal.status === '2' ? 'Lost' : deal.status;
  return `${title} -- ${status} -- ${value} -- stage: ${stage} (ID: ${deal.id})`;
}

// ─── Tool: ac_list_contacts ─────────────────────────────

const listContacts: ToolHandler = {
  description:
    'List contacts from ActiveCampaign. Optionally filter by email or search query. Returns contact names, emails, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search contacts by email or name',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of contacts to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = acUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.search) query.search = params.search;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/contacts`,
        query,
      });

      const contacts: any[] = result.contacts || [];
      if (contacts.length === 0) {
        return { content: 'No contacts found.', metadata: { count: 0 } };
      }

      const lines = contacts.map((c: any) => formatContact(c));
      const total = result.meta?.total ?? contacts.length;

      return {
        content: `Found ${total} contacts (showing ${contacts.length}):\n${lines.join('\n')}`,
        metadata: { count: contacts.length, total },
      };
    } catch (err) {
      return activecampaignError(err);
    }
  },
};

// ─── Tool: ac_create_contact ────────────────────────────

const createContact: ToolHandler = {
  description:
    'Create a new contact in ActiveCampaign. Provide at least an email address, plus optional name and phone fields.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Contact email address',
      },
      firstName: {
        type: 'string',
        description: 'Contact first name',
      },
      lastName: {
        type: 'string',
        description: 'Contact last name',
      },
      phone: {
        type: 'string',
        description: 'Contact phone number',
      },
    },
    required: ['email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = acUrl(ctx);

      const contact: Record<string, any> = { email: params.email };
      if (params.firstName) contact.firstName = params.firstName;
      if (params.lastName) contact.lastName = params.lastName;
      if (params.phone) contact.phone = params.phone;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/contacts`,
        body: { contact },
      });

      const c = result.contact;
      return {
        content: `Contact created: ${formatContact(c)}`,
        metadata: { contactId: c.id, email: params.email },
      };
    } catch (err) {
      return activecampaignError(err);
    }
  },
};

// ─── Tool: ac_list_deals ────────────────────────────────

const listDeals: ToolHandler = {
  description:
    'List deals from ActiveCampaign CRM. Optionally filter by stage or search query.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search deals by title',
      },
      stage: {
        type: 'number',
        description: 'Filter by stage ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of deals to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = acUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.search) query['filters[search]'] = params.search;
      if (params.stage) query['filters[stage]'] = String(params.stage);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/deals`,
        query,
      });

      const deals: any[] = result.deals || [];
      if (deals.length === 0) {
        return { content: 'No deals found.', metadata: { count: 0 } };
      }

      const lines = deals.map((d: any) => formatDeal(d));
      const total = result.meta?.total ?? deals.length;

      return {
        content: `Found ${total} deals (showing ${deals.length}):\n${lines.join('\n')}`,
        metadata: { count: deals.length, total },
      };
    } catch (err) {
      return activecampaignError(err);
    }
  },
};

// ─── Tool: ac_list_automations ──────────────────────────

const listAutomations: ToolHandler = {
  description:
    'List automations from ActiveCampaign. Returns automation names, statuses, and trigger info.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of automations to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = acUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/automations`,
        query,
      });

      const automations: any[] = result.automations || [];
      if (automations.length === 0) {
        return { content: 'No automations found.', metadata: { count: 0 } };
      }

      const lines = automations.map((a: any) => {
        const name = a.name || '(unnamed)';
        const status = a.status === '1' ? 'Active' : 'Inactive';
        const entered = a.entered ?? 0;
        return `${name} -- ${status} -- ${entered} contacts entered (ID: ${a.id})`;
      });

      const total = result.meta?.total ?? automations.length;

      return {
        content: `Found ${total} automations (showing ${automations.length}):\n${lines.join('\n')}`,
        metadata: { count: automations.length, total },
      };
    } catch (err) {
      return activecampaignError(err);
    }
  },
};

// ─── Tool: ac_create_deal ───────────────────────────────

const createDeal: ToolHandler = {
  description:
    'Create a new deal in ActiveCampaign CRM. Provide a title, value, and pipeline/stage info.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Deal title',
      },
      value: {
        type: 'number',
        description: 'Deal value in cents (e.g. 50000 = $500.00)',
      },
      currency: {
        type: 'string',
        description: 'Currency code (e.g. "usd")',
      },
      group: {
        type: 'string',
        description: 'Pipeline ID',
      },
      stage: {
        type: 'string',
        description: 'Stage ID within the pipeline',
      },
      owner: {
        type: 'string',
        description: 'Owner user ID',
      },
      contact: {
        type: 'string',
        description: 'Primary contact ID to associate with the deal',
      },
    },
    required: ['title', 'value'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = acUrl(ctx);

      const deal: Record<string, any> = {
        title: params.title,
        value: params.value,
        currency: params.currency || 'usd',
      };
      if (params.group) deal.group = params.group;
      if (params.stage) deal.stage = params.stage;
      if (params.owner) deal.owner = params.owner;
      if (params.contact) deal.contact = params.contact;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/deals`,
        body: { deal },
      });

      const d = result.deal;
      return {
        content: `Deal created: ${formatDeal(d)}`,
        metadata: { dealId: d.id, title: params.title },
      };
    } catch (err) {
      return activecampaignError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const activecampaignAdapter: SkillAdapter = {
  skillId: 'activecampaign',
  name: 'ActiveCampaign',
  // Base URL is dynamic based on account name; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://ACCOUNT.api-us1.com/api/3',
  auth: {
    type: 'api_key',
    headerName: 'Api-Token',
  },
  tools: {
    ac_list_contacts: listContacts,
    ac_create_contact: createContact,
    ac_list_deals: listDeals,
    ac_list_automations: listAutomations,
    ac_create_deal: createDeal,
  },
  configSchema: {
    account: {
      type: 'string' as const,
      label: 'Account Name',
      description: 'Your ActiveCampaign account name (e.g. "mycompany" for mycompany.api-us1.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
