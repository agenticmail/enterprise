/**
 * MCP Skill Adapter — Zoho CRM
 *
 * Maps Zoho CRM API v5 endpoints to MCP tool handlers.
 * Zoho CRM supports multiple data centers; the datacenter is configured
 * via ctx.skillConfig.datacenter (default: 'com').
 *
 * Zoho CRM API docs: https://www.zoho.com/crm/developer/docs/api/v5/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve Zoho API base URL from datacenter config */
function zohoUrl(ctx: ToolExecutionContext): string {
  const dc = ctx.skillConfig.datacenter || 'com';
  return `https://www.zohoapis.${dc}/crm/v5`;
}

function zohoError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code || '';
      const message = data.message || data.details?.expected_data_type || err.message;
      const status = data.status || '';
      return { content: `Zoho CRM API error [${code}]: ${message}${status ? ` (${status})` : ''}`, isError: true };
    }
    return { content: `Zoho CRM API error: ${err.message}`, isError: true };
  }
  return { content: `Zoho CRM API error: ${String(err)}`, isError: true };
}

/** Format a Zoho CRM record for display */
function formatRecord(record: any, module: string): string {
  const id = record.id || 'unknown';
  const name = record.Full_Name || record.Name || record.Deal_Name || record.Subject || record.Email || '(unnamed)';
  const owner = record.Owner?.name || 'unassigned';
  const created = record.Created_Time ? record.Created_Time.slice(0, 16) : '';
  const extras: string[] = [];

  if (record.Email) extras.push(`email: ${record.Email}`);
  if (record.Phone) extras.push(`phone: ${record.Phone}`);
  if (record.Stage) extras.push(`stage: ${record.Stage}`);
  if (record.Amount) extras.push(`amount: ${record.Amount}`);
  if (record.Account_Name?.name) extras.push(`account: ${record.Account_Name.name}`);

  const extraStr = extras.length > 0 ? ` -- ${extras.join(', ')}` : '';
  return `[${module}] ${name} -- owner: ${owner}${extraStr} -- ${created} (ID: ${id})`;
}

// ─── Tool: zoho_list_records ────────────────────────────

const listRecords: ToolHandler = {
  description:
    'List records from a Zoho CRM module (Leads, Contacts, Accounts, Deals, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        description: 'CRM module name (e.g. "Leads", "Contacts", "Accounts", "Deals")',
      },
      fields: {
        type: 'string',
        description: 'Comma-separated list of fields to return (e.g. "Full_Name,Email,Phone")',
      },
      sort_by: {
        type: 'string',
        description: 'Field name to sort by',
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "desc")',
      },
      per_page: {
        type: 'number',
        description: 'Records per page (default 20, max 200)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
    required: ['module'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zohoUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 1),
      };
      if (params.fields) query.fields = params.fields;
      if (params.sort_by) query.sort_by = params.sort_by;
      if (params.sort_order) query.sort_order = params.sort_order;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${params.module}`,
        query,
      });

      const records: any[] = result.data || [];
      if (records.length === 0) {
        return { content: `No ${params.module} records found.` };
      }

      const lines = records.map((r: any) => formatRecord(r, params.module));
      const morePages = result.info?.more_records;

      return {
        content: `Found ${records.length} ${params.module} records:\n${lines.join('\n')}${morePages ? '\n\n(More records available)' : ''}`,
        metadata: { count: records.length, module: params.module, morePages: !!morePages },
      };
    } catch (err) {
      return zohoError(err);
    }
  },
};

// ─── Tool: zoho_get_record ──────────────────────────────

const getRecord: ToolHandler = {
  description:
    'Get a single record from a Zoho CRM module by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        description: 'CRM module name (e.g. "Leads", "Contacts", "Deals")',
      },
      record_id: {
        type: 'string',
        description: 'The record ID to retrieve',
      },
    },
    required: ['module', 'record_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zohoUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${params.module}/${params.record_id}`,
      });

      const records: any[] = result.data || [];
      if (records.length === 0) {
        return { content: `Record ${params.record_id} not found in ${params.module}.` };
      }

      const record = records[0];
      const fields = Object.entries(record)
        .filter(([k]) => k !== '$' && k !== 'id')
        .map(([k, v]) => {
          if (v && typeof v === 'object' && (v as any).name) return `${k}: ${(v as any).name}`;
          if (v === null || v === undefined) return null;
          return `${k}: ${v}`;
        })
        .filter(Boolean);

      return {
        content: `[${params.module}] Record ${record.id}:\n${fields.join('\n')}`,
        metadata: { module: params.module, recordId: record.id },
      };
    } catch (err) {
      return zohoError(err);
    }
  },
};

// ─── Tool: zoho_create_record ───────────────────────────

const createRecord: ToolHandler = {
  description:
    'Create a new record in a Zoho CRM module. Provide the module name and field values.',
  inputSchema: {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        description: 'CRM module name (e.g. "Leads", "Contacts", "Deals")',
      },
      data: {
        type: 'object',
        description: 'Field values for the new record (e.g. { "Last_Name": "Doe", "Email": "j@example.com" })',
      },
      trigger: {
        type: 'array',
        items: { type: 'string' },
        description: 'Triggers to execute (e.g. ["workflow", "approval", "blueprint"])',
      },
    },
    required: ['module', 'data'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zohoUrl(ctx);

      const body: Record<string, any> = {
        data: [params.data],
      };
      if (params.trigger?.length) body.trigger = params.trigger;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/${params.module}`,
        body,
      });

      const record = result.data?.[0];
      if (!record || record.status === 'error') {
        const msg = record?.message || 'Unknown error creating record';
        return { content: `Zoho CRM error: ${msg}`, isError: true };
      }

      return {
        content: `${params.module} record created: ID ${record.details?.id || 'unknown'} -- ${record.message || 'success'}`,
        metadata: {
          module: params.module,
          recordId: record.details?.id,
          status: record.status,
        },
      };
    } catch (err) {
      return zohoError(err);
    }
  },
};

// ─── Tool: zoho_update_record ───────────────────────────

const updateRecord: ToolHandler = {
  description:
    'Update an existing record in a Zoho CRM module. Provide the module, record ID, and fields to update.',
  inputSchema: {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        description: 'CRM module name (e.g. "Leads", "Contacts", "Deals")',
      },
      record_id: {
        type: 'string',
        description: 'The record ID to update',
      },
      data: {
        type: 'object',
        description: 'Field values to update (e.g. { "Phone": "+15551234567", "Rating": "Hot" })',
      },
    },
    required: ['module', 'record_id', 'data'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zohoUrl(ctx);

      const body: Record<string, any> = {
        data: [{ ...params.data, id: params.record_id }],
      };

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/${params.module}`,
        body,
      });

      const record = result.data?.[0];
      if (!record || record.status === 'error') {
        const msg = record?.message || 'Unknown error updating record';
        return { content: `Zoho CRM error: ${msg}`, isError: true };
      }

      return {
        content: `${params.module} record ${params.record_id} updated -- ${record.message || 'success'}`,
        metadata: {
          module: params.module,
          recordId: params.record_id,
          status: record.status,
        },
      };
    } catch (err) {
      return zohoError(err);
    }
  },
};

// ─── Tool: zoho_search_records ──────────────────────────

const searchRecords: ToolHandler = {
  description:
    'Search records in a Zoho CRM module using criteria, email, phone, or word search.',
  inputSchema: {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        description: 'CRM module name (e.g. "Leads", "Contacts", "Deals")',
      },
      criteria: {
        type: 'string',
        description: 'Search criteria (e.g. "(Last_Name:equals:Doe)and(Email:starts_with:j)")',
      },
      email: {
        type: 'string',
        description: 'Search by email address',
      },
      phone: {
        type: 'string',
        description: 'Search by phone number',
      },
      word: {
        type: 'string',
        description: 'Free-text word search across all fields',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 200)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
    required: ['module'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = zohoUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 1),
      };
      if (params.criteria) query.criteria = params.criteria;
      if (params.email) query.email = params.email;
      if (params.phone) query.phone = params.phone;
      if (params.word) query.word = params.word;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${params.module}/search`,
        query,
      });

      const records: any[] = result.data || [];
      if (records.length === 0) {
        return { content: `No ${params.module} records found matching the search.` };
      }

      const lines = records.map((r: any) => formatRecord(r, params.module));
      const morePages = result.info?.more_records;

      return {
        content: `Found ${records.length} ${params.module} records:\n${lines.join('\n')}${morePages ? '\n\n(More records available)' : ''}`,
        metadata: { count: records.length, module: params.module, morePages: !!morePages },
      };
    } catch (err) {
      return zohoError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const zohoCrmAdapter: SkillAdapter = {
  skillId: 'zoho-crm',
  name: 'Zoho CRM',
  baseUrl: 'https://www.zohoapis.com/crm/v5',
  auth: {
    type: 'oauth2',
    provider: 'zoho',
  },
  tools: {
    zoho_list_records: listRecords,
    zoho_get_record: getRecord,
    zoho_create_record: createRecord,
    zoho_update_record: updateRecord,
    zoho_search_records: searchRecords,
  },
  configSchema: {
    datacenter: {
      type: 'select' as const,
      label: 'Data Center',
      description: 'Zoho data center region for API requests',
      options: [
        { label: 'US', value: 'com' },
        { label: 'EU', value: 'eu' },
        { label: 'IN', value: 'in' },
        { label: 'AU', value: 'com.au' },
      ],
      default: 'com',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
