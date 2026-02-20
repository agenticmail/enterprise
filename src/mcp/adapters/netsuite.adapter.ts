/**
 * MCP Skill Adapter — NetSuite ERP
 *
 * Maps NetSuite REST API (SuiteTalk) endpoints to MCP tool handlers.
 * Handles record search, retrieval, creation, saved search listing, and SuiteQL execution.
 *
 * The account ID is read from ctx.skillConfig.accountId and used
 * to build the dynamic base URL.
 *
 * NetSuite REST API docs: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1540391670.html
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the NetSuite base URL from skill config */
function nsBaseUrl(ctx: ToolExecutionContext): string {
  const accountId = ctx.skillConfig.accountId;
  if (!accountId) {
    throw new Error('NetSuite accountId is required in skillConfig (e.g. { accountId: "TSTDRV1234567" })');
  }
  // NetSuite account IDs use underscores in URLs where hyphens appear in the ID
  const normalizedId = accountId.toLowerCase().replace(/-/g, '_');
  return `https://${normalizedId}.suitetalk.api.netsuite.com/services/rest/record/v1`;
}

/** Resolve the SuiteQL base URL */
function nsQueryUrl(ctx: ToolExecutionContext): string {
  const accountId = ctx.skillConfig.accountId;
  if (!accountId) {
    throw new Error('NetSuite accountId is required in skillConfig');
  }
  const normalizedId = accountId.toLowerCase().replace(/-/g, '_');
  return `https://${normalizedId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
}

function netsuiteError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // NetSuite returns { "o:errorDetails": [{ detail, "o:errorCode" }] } or { title, status, detail }
      const errorDetails = data['o:errorDetails'];
      if (Array.isArray(errorDetails) && errorDetails.length > 0) {
        const details = errorDetails.map((e: any) => `${e['o:errorCode'] || 'ERROR'}: ${e.detail || e.message}`).join('; ');
        return { content: `NetSuite API error: ${details}`, isError: true };
      }
      if (data.title || data.detail) {
        return { content: `NetSuite API error: ${data.title || ''} ${data.detail || ''}`.trim(), isError: true };
      }
    }
    return { content: `NetSuite API error: ${err.message}`, isError: true };
  }
  return { content: `NetSuite API error: ${String(err)}`, isError: true };
}

/** Format a NetSuite record for display */
function formatRecord(record: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === 'links' || key === 'o:errorDetails') continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Nested reference — show refName or id
      const ref = value.refName || value.name || value.id || JSON.stringify(value);
      lines.push(`${key}: ${ref}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

// ─── Tool: netsuite_search ──────────────────────────────

const netsuiteSearch: ToolHandler = {
  description:
    'Search for records in NetSuite by record type. Supports filtering and field selection. Returns a list of matching records.',
  inputSchema: {
    type: 'object',
    properties: {
      record_type: {
        type: 'string',
        description: 'NetSuite record type (e.g. "customer", "invoice", "salesOrder", "employee", "item")',
      },
      q: {
        type: 'string',
        description: 'Search query string to filter records',
      },
      fields: {
        type: 'string',
        description: 'Comma-separated list of fields to return (e.g. "companyName,email,phone")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 1000)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    required: ['record_type'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = nsBaseUrl(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.q) query.q = params.q;
      if (params.fields) query.fields = params.fields;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${params.record_type}`,
        query,
      });

      const items: any[] = result.items || [];
      const totalResults = result.totalResults ?? items.length;

      if (items.length === 0) {
        return { content: `No ${params.record_type} records found.` };
      }

      const lines = items.map((item: any) => {
        const id = item.id || 'N/A';
        const name = item.companyName || item.entityId || item.tranId || item.itemId || item.name || item.refName || '(unnamed)';
        const extra: string[] = [];
        for (const [key, value] of Object.entries(item)) {
          if (['id', 'links', 'companyName', 'entityId', 'tranId', 'itemId', 'name', 'refName'].includes(key)) continue;
          if (value === null || value === undefined || typeof value === 'object') continue;
          extra.push(`${key}: ${value}`);
        }
        const extraPart = extra.length > 0 ? ` (${extra.slice(0, 3).join(', ')})` : '';
        return `${name}${extraPart} (ID: ${id})`;
      });

      return {
        content: `Found ${totalResults} ${params.record_type} records (showing ${items.length}):\n${lines.join('\n')}`,
        metadata: {
          recordType: params.record_type,
          count: items.length,
          totalResults,
        },
      };
    } catch (err) {
      return netsuiteError(err);
    }
  },
};

// ─── Tool: netsuite_get_record ──────────────────────────

const getRecord: ToolHandler = {
  description:
    'Get a specific NetSuite record by its type and internal ID. Returns all accessible fields for the record.',
  inputSchema: {
    type: 'object',
    properties: {
      record_type: {
        type: 'string',
        description: 'NetSuite record type (e.g. "customer", "invoice", "salesOrder")',
      },
      id: {
        type: 'string',
        description: 'Internal ID of the record',
      },
      fields: {
        type: 'string',
        description: 'Comma-separated list of fields to return (optional, returns all if omitted)',
      },
      expand_sub_resources: {
        type: 'boolean',
        description: 'Include sublists/subrecords in the response (default: false)',
      },
    },
    required: ['record_type', 'id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = nsBaseUrl(ctx);

      const query: Record<string, string> = {};
      if (params.fields) query.fields = params.fields;
      if (params.expand_sub_resources) query.expandSubResources = 'true';

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/${params.record_type}/${params.id}`,
        query,
      });

      return {
        content: `${params.record_type} #${params.id}:\n${formatRecord(result)}`,
        metadata: {
          recordType: params.record_type,
          id: params.id,
        },
      };
    } catch (err) {
      return netsuiteError(err);
    }
  },
};

// ─── Tool: netsuite_create_record ───────────────────────

const createRecord: ToolHandler = {
  description:
    'Create a new record in NetSuite. Specify the record type and field values.',
  inputSchema: {
    type: 'object',
    properties: {
      record_type: {
        type: 'string',
        description: 'NetSuite record type (e.g. "customer", "contact", "salesOrder")',
      },
      fields: {
        type: 'object',
        description: 'Field values for the new record (e.g. { "companyName": "Acme Corp", "subsidiary": { "id": "1" } })',
      },
    },
    required: ['record_type', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = nsBaseUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/${params.record_type}`,
        body: params.fields,
      });

      // NetSuite returns 204 with Location header for the new record, or the record object
      const id = result?.id || result?.internalId || 'unknown';

      return {
        content: `Created ${params.record_type} record (ID: ${id})`,
        metadata: {
          recordType: params.record_type,
          id,
        },
      };
    } catch (err) {
      return netsuiteError(err);
    }
  },
};

// ─── Tool: netsuite_list_saved_searches ─────────────────

const listSavedSearches: ToolHandler = {
  description:
    'List saved searches in NetSuite. Returns search names, types, and IDs. Useful for discovering available reports.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Filter by record type (e.g. "customer", "transaction", "item"). Optional.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 50)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const queryUrl = nsQueryUrl(ctx);
      let sql = 'SELECT id, title, recordtype FROM savedsearch';
      const conditions: string[] = [];
      if (params.type) conditions.push(`recordtype = '${params.type}'`);
      if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
      sql += ` ORDER BY title ASC`;
      const limit = params.limit ?? 50;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: queryUrl,
        body: { q: sql },
        headers: { prefer: `transient, maxpagesize=${limit}` },
      });

      const items: any[] = result.items || [];
      if (items.length === 0) {
        return { content: 'No saved searches found.' };
      }

      const lines = items.map((s: any) => {
        const title = s.title || '(unnamed)';
        const type = s.recordtype || 'N/A';
        return `${title} [${type}] (ID: ${s.id})`;
      });

      return {
        content: `${items.length} saved searches:\n${lines.join('\n')}`,
        metadata: { count: items.length },
      };
    } catch (err) {
      return netsuiteError(err);
    }
  },
};

// ─── Tool: netsuite_run_suiteql ─────────────────────────

const runSuiteQL: ToolHandler = {
  description:
    'Execute a SuiteQL query against NetSuite. SuiteQL is a SQL-like query language for NetSuite data. Returns a formatted result set.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SuiteQL query string (e.g. "SELECT id, companyname, email FROM customer WHERE isinactive = \'F\' FETCH FIRST 20 ROWS ONLY")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of rows to return (default 100, max 1000)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const queryUrl = nsQueryUrl(ctx);
      const limit = params.limit ?? 100;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: queryUrl,
        body: { q: params.query },
        headers: { prefer: `transient, maxpagesize=${limit}` },
      });

      const items: any[] = result.items || [];
      const totalResults = result.totalResults ?? items.length;
      const hasMore = result.hasMore ?? false;

      if (items.length === 0) {
        return { content: `Query returned 0 rows: ${params.query}` };
      }

      // Build table from result items
      const columns = items.length > 0 ? Object.keys(items[0]).filter(k => k !== 'links') : [];
      const header = columns.join(' | ');
      const separator = columns.map(c => '-'.repeat(Math.max(c.length, 3))).join('-+-');
      const rows = items.map((row: any) =>
        columns.map(c => (row[c] === null || row[c] === undefined) ? 'NULL' : String(row[c])).join(' | ')
      );

      const maxRows = 50;
      const displayRows = rows.slice(0, maxRows);
      const truncNote = rows.length > maxRows ? `\n... and ${rows.length - maxRows} more row(s)` : '';
      const moreNote = hasMore ? `\n(More results available — total: ${totalResults})` : '';

      return {
        content: `Query returned ${totalResults} row(s):\n\n${header}\n${separator}\n${displayRows.join('\n')}${truncNote}${moreNote}`,
        metadata: {
          rowCount: items.length,
          totalResults,
          hasMore,
          query: params.query,
        },
      };
    } catch (err) {
      return netsuiteError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const netsuiteAdapter: SkillAdapter = {
  skillId: 'netsuite',
  name: 'NetSuite ERP',
  // Base URL is dynamic from ctx.skillConfig.accountId; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://ACCOUNT_ID.suitetalk.api.netsuite.com/services/rest/record/v1',
  auth: {
    type: 'oauth2',
    provider: 'netsuite',
  },
  tools: {
    netsuite_search: netsuiteSearch,
    netsuite_get_record: getRecord,
    netsuite_create_record: createRecord,
    netsuite_list_saved_searches: listSavedSearches,
    netsuite_run_suiteql: runSuiteQL,
  },
  configSchema: {
    accountId: {
      type: 'string' as const,
      label: 'Account ID',
      description: 'Your NetSuite account ID (e.g. "TSTDRV1234567" or "1234567-sb1")',
      required: true,
      placeholder: 'TSTDRV1234567',
    },
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
