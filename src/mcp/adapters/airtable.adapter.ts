/**
 * MCP Skill Adapter — Airtable
 *
 * Maps Airtable REST API endpoints to MCP tool handlers.
 * Airtable paths follow the pattern /{baseId}/{tableIdOrName} for record operations.
 *
 * Airtable API docs: https://airtable.com/developers/web/api/introduction
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function airtableError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errObj = data.error;
      if (errObj && typeof errObj === 'object') {
        const message = errObj.message || errObj.type || 'unknown error';
        return { content: `Airtable API error: ${message}`, isError: true };
      }
      if (data.message) {
        return { content: `Airtable API error: ${data.message}`, isError: true };
      }
    }
    return { content: `Airtable API error: ${err.message}`, isError: true };
  }
  return { content: `Airtable API error: ${String(err)}`, isError: true };
}

/**
 * Format a record's fields into a human-readable string.
 */
function formatFields(fields: Record<string, any>): string {
  return Object.entries(fields)
    .map(([key, val]) => {
      const display = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      return `${key}: ${display}`;
    })
    .join(', ');
}

// ─── Tool: airtable_list_records ────────────────────────

const listRecords: ToolHandler = {
  description:
    'List records from an Airtable table. Provide the base ID and table name or ID. Optionally filter with a formula, sort, or limit results.',
  inputSchema: {
    type: 'object',
    properties: {
      baseId: {
        type: 'string',
        description: 'Airtable base ID (e.g. "appXXXXXXXXXX")',
      },
      tableIdOrName: {
        type: 'string',
        description: 'Table ID or name (e.g. "Tasks" or "tblXXXXXXXXXX")',
      },
      filterByFormula: {
        type: 'string',
        description: 'Airtable formula to filter records (e.g. "{Status} = \'Done\'")',
      },
      maxRecords: {
        type: 'number',
        description: 'Maximum number of records to return (default 100)',
      },
      sort: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
        description: 'Sort configuration (e.g. [{"field": "Created", "direction": "desc"}])',
      },
      view: {
        type: 'string',
        description: 'View name or ID to filter by (optional)',
      },
    },
    required: ['baseId', 'tableIdOrName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};

      if (params.filterByFormula) query.filterByFormula = params.filterByFormula;
      if (params.maxRecords) query.maxRecords = String(params.maxRecords);
      if (params.view) query.view = params.view;

      // Sort params need special handling for query string format
      if (params.sort?.length) {
        params.sort.forEach((s: any, i: number) => {
          query[`sort[${i}][field]`] = s.field;
          if (s.direction) query[`sort[${i}][direction]`] = s.direction;
        });
      }

      const path = `/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}`;
      const result = await ctx.apiExecutor.get(path, query);
      const records: any[] = result.records || [];

      if (records.length === 0) {
        return { content: 'No records found.' };
      }

      const lines = records.map((r: any) => {
        const fields = formatFields(r.fields || {});
        return `${r.id}: ${fields}`;
      });

      return {
        content: `Found ${records.length} records:\n${lines.join('\n')}`,
        metadata: {
          count: records.length,
          baseId: params.baseId,
          table: params.tableIdOrName,
          offset: result.offset,
        },
      };
    } catch (err) {
      return airtableError(err);
    }
  },
};

// ─── Tool: airtable_create_record ───────────────────────

const createRecord: ToolHandler = {
  description:
    'Create a new record in an Airtable table. Provide the base ID, table name, and field values.',
  inputSchema: {
    type: 'object',
    properties: {
      baseId: {
        type: 'string',
        description: 'Airtable base ID (e.g. "appXXXXXXXXXX")',
      },
      tableIdOrName: {
        type: 'string',
        description: 'Table ID or name',
      },
      fields: {
        type: 'object',
        description: 'Field values for the new record (e.g. {"Name": "Task 1", "Status": "Todo", "Priority": "High"})',
      },
      typecast: {
        type: 'boolean',
        description: 'If true, Airtable will try to coerce string values to the correct cell type (default false)',
      },
    },
    required: ['baseId', 'tableIdOrName', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const path = `/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}`;
      const body: Record<string, any> = {
        fields: params.fields,
      };

      if (params.typecast) body.typecast = true;

      const result = await ctx.apiExecutor.post(path, body);

      const fieldsSummary = formatFields(result.fields || {});

      return {
        content: `Record created (ID: ${result.id}): ${fieldsSummary}`,
        metadata: {
          id: result.id,
          baseId: params.baseId,
          table: params.tableIdOrName,
          fields: result.fields,
        },
      };
    } catch (err) {
      return airtableError(err);
    }
  },
};

// ─── Tool: airtable_update_record ───────────────────────

const updateRecord: ToolHandler = {
  description:
    'Update an existing record in an Airtable table. Provide the base ID, table name, record ID, and the fields to update.',
  inputSchema: {
    type: 'object',
    properties: {
      baseId: {
        type: 'string',
        description: 'Airtable base ID (e.g. "appXXXXXXXXXX")',
      },
      tableIdOrName: {
        type: 'string',
        description: 'Table ID or name',
      },
      recordId: {
        type: 'string',
        description: 'ID of the record to update (e.g. "recXXXXXXXXXX")',
      },
      fields: {
        type: 'object',
        description: 'Field values to update (only specified fields are changed)',
      },
      typecast: {
        type: 'boolean',
        description: 'If true, Airtable will try to coerce string values to the correct cell type (default false)',
      },
    },
    required: ['baseId', 'tableIdOrName', 'recordId', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const path = `/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}/${params.recordId}`;
      const body: Record<string, any> = {
        fields: params.fields,
      };

      if (params.typecast) body.typecast = true;

      const result = await ctx.apiExecutor.patch(path, body);

      const fieldsSummary = formatFields(result.fields || {});

      return {
        content: `Record ${result.id} updated: ${fieldsSummary}`,
        metadata: {
          id: result.id,
          baseId: params.baseId,
          table: params.tableIdOrName,
          fields: result.fields,
        },
      };
    } catch (err) {
      return airtableError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const airtableAdapter: SkillAdapter = {
  skillId: 'airtable-bases',
  name: 'Airtable',
  baseUrl: 'https://api.airtable.com/v0',
  auth: {
    type: 'oauth2',
    provider: 'airtable',
    headerPrefix: 'Bearer',
  },
  tools: {
    airtable_list_records: listRecords,
    airtable_create_record: createRecord,
    airtable_update_record: updateRecord,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
  configSchema: {
    baseId: {
      type: 'string' as const,
      label: 'Airtable Base ID',
      description: 'Default Airtable base ID (starts with "app")',
      required: false,
      placeholder: 'appXXXXXXXXXXXXXX',
    },
  },
};
