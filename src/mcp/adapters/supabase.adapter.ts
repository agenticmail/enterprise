/**
 * MCP Skill Adapter — Supabase
 *
 * Maps Supabase PostgREST and RPC endpoints to MCP tool handlers.
 * Provides access to querying, inserting, updating, and deleting rows,
 * as well as invoking custom database functions via RPC.
 *
 * Supabase API docs: https://supabase.com/docs/guides/api
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
  ResolvedCredentials,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function supabaseError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.hint || data.details || err.message;
      const code = data.code || '';
      const detail = code ? `${msg} (code: ${code})` : msg;
      return { content: `Supabase API error: ${detail}`, isError: true };
    }
    return { content: `Supabase API error: ${err.message}`, isError: true };
  }
  return { content: `Supabase API error: ${String(err)}`, isError: true };
}

// ─── Tool: supabase_query ───────────────────────────────

const query: ToolHandler = {
  description:
    'Query rows from a Supabase table using PostgREST syntax. Supports select, filtering, ordering, and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'Table name to query',
      },
      select: {
        type: 'string',
        description: 'Columns to select (e.g. "id,name,email" or "*"). Default: "*"',
      },
      filter: {
        type: 'string',
        description: 'PostgREST filter string (e.g. "status=eq.active&age=gt.18")',
      },
      order: {
        type: 'string',
        description: 'Order by clause (e.g. "created_at.desc")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of rows to return (default 50)',
      },
      offset: {
        type: 'number',
        description: 'Number of rows to skip (default 0)',
      },
    },
    required: ['table'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        select: params.select || '*',
      };
      if (params.order) query.order = params.order;
      if (params.limit) query.limit = String(params.limit);
      if (params.offset) query.offset = String(params.offset);

      // Parse filter string into query params
      if (params.filter) {
        const filterParts = params.filter.split('&');
        for (const part of filterParts) {
          const [key, ...rest] = part.split('=');
          if (key && rest.length > 0) {
            query[key] = rest.join('=');
          }
        }
      }

      const result = await ctx.apiExecutor.get(`/${params.table}`, query);

      const rows: any[] = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        return { content: `No rows found in table "${params.table}".` };
      }

      return {
        content: `Found ${rows.length} row(s) in "${params.table}":\n${JSON.stringify(rows, null, 2)}`,
        metadata: { count: rows.length, table: params.table },
      };
    } catch (err) {
      return supabaseError(err);
    }
  },
};

// ─── Tool: supabase_insert ──────────────────────────────

const insert: ToolHandler = {
  description:
    'Insert one or more rows into a Supabase table. Returns the inserted rows.',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'Table name to insert into',
      },
      rows: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of row objects to insert (e.g. [{"name": "Alice", "email": "a@b.com"}])',
      },
      upsert: {
        type: 'boolean',
        description: 'If true, perform an upsert (insert or update on conflict). Default: false',
      },
    },
    required: ['table', 'rows'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers: Record<string, string> = {
        'Prefer': 'return=representation',
      };
      if (params.upsert) {
        headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/${params.table}`,
        headers,
        body: params.rows,
      });

      const inserted: any[] = Array.isArray(result) ? result : [result];
      return {
        content: `Inserted ${inserted.length} row(s) into "${params.table}":\n${JSON.stringify(inserted, null, 2)}`,
        metadata: { count: inserted.length, table: params.table },
      };
    } catch (err) {
      return supabaseError(err);
    }
  },
};

// ─── Tool: supabase_update ──────────────────────────────

const update: ToolHandler = {
  description:
    'Update rows in a Supabase table matching a filter. Returns the updated rows.',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'Table name to update',
      },
      filter: {
        type: 'string',
        description: 'PostgREST filter to identify rows (e.g. "id=eq.123"). Required to prevent accidental full-table updates.',
      },
      data: {
        type: 'object',
        description: 'Object with column values to update (e.g. {"status": "active"})',
      },
    },
    required: ['table', 'filter', 'data'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const queryParams: Record<string, string> = {};
      const filterParts = params.filter.split('&');
      for (const part of filterParts) {
        const [key, ...rest] = part.split('=');
        if (key && rest.length > 0) {
          queryParams[key] = rest.join('=');
        }
      }

      const result = await ctx.apiExecutor.request({
        method: 'PATCH',
        path: `/${params.table}`,
        query: queryParams,
        headers: { 'Prefer': 'return=representation' },
        body: params.data,
      });

      const updated: any[] = Array.isArray(result) ? result : [result];
      return {
        content: `Updated ${updated.length} row(s) in "${params.table}":\n${JSON.stringify(updated, null, 2)}`,
        metadata: { count: updated.length, table: params.table },
      };
    } catch (err) {
      return supabaseError(err);
    }
  },
};

// ─── Tool: supabase_delete ──────────────────────────────

const deleteRows: ToolHandler = {
  description:
    'Delete rows from a Supabase table matching a filter. Returns the deleted rows.',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'Table name to delete from',
      },
      filter: {
        type: 'string',
        description: 'PostgREST filter to identify rows to delete (e.g. "id=eq.123"). Required to prevent accidental full-table deletion.',
      },
    },
    required: ['table', 'filter'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const queryParams: Record<string, string> = {};
      const filterParts = params.filter.split('&');
      for (const part of filterParts) {
        const [key, ...rest] = part.split('=');
        if (key && rest.length > 0) {
          queryParams[key] = rest.join('=');
        }
      }

      const result = await ctx.apiExecutor.request({
        method: 'DELETE',
        path: `/${params.table}`,
        query: queryParams,
        headers: { 'Prefer': 'return=representation' },
      });

      const deleted: any[] = Array.isArray(result) ? result : [result];
      return {
        content: `Deleted ${deleted.length} row(s) from "${params.table}":\n${JSON.stringify(deleted, null, 2)}`,
        metadata: { count: deleted.length, table: params.table },
      };
    } catch (err) {
      return supabaseError(err);
    }
  },
};

// ─── Tool: supabase_rpc ─────────────────────────────────

const rpc: ToolHandler = {
  description:
    'Call a Supabase database function (RPC). Pass the function name and an optional parameter object.',
  inputSchema: {
    type: 'object',
    properties: {
      functionName: {
        type: 'string',
        description: 'Name of the database function to invoke',
      },
      params: {
        type: 'object',
        description: 'Parameters to pass to the function (optional)',
      },
    },
    required: ['functionName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.post(
        `/rpc/${params.functionName}`,
        params.params || {},
      );

      const formatted = typeof result === 'object'
        ? JSON.stringify(result, null, 2)
        : String(result);

      return {
        content: `RPC "${params.functionName}" result:\n${formatted}`,
        metadata: { functionName: params.functionName },
      };
    } catch (err) {
      return supabaseError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const supabaseAdapter: SkillAdapter = {
  skillId: 'supabase',
  name: 'Supabase',
  baseUrl: 'https://REFERENCE.supabase.co/rest/v1',
  auth: {
    type: 'api_key',
    headerName: 'apikey',
  },
  tools: {
    supabase_query: query,
    supabase_insert: insert,
    supabase_update: update,
    supabase_delete: deleteRows,
    supabase_rpc: rpc,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 30 },
  configSchema: {
    projectRef: {
      type: 'string' as const,
      label: 'Project Reference',
      description: 'Supabase project reference ID (found in project URL)',
      required: true,
      placeholder: 'abcdefghijklmnop',
    },
  },
  async initialize(credentials: ResolvedCredentials) {
    // Dynamic base URL will be set by the framework using projectRef from config
  },
};
