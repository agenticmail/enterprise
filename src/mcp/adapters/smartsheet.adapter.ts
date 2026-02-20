/**
 * MCP Skill Adapter — Smartsheet
 *
 * Maps Smartsheet API 2.0 endpoints to MCP tool handlers.
 * Covers sheet listing, retrieval, row operations, and search.
 *
 * Smartsheet API docs: https://smartsheet.redoc.ly/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function smartsheetError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.errorCode || err.message;
      return { content: `Smartsheet API error: ${detail}`, isError: true };
    }
    return { content: `Smartsheet API error: ${err.message}`, isError: true };
  }
  return { content: `Smartsheet API error: ${String(err)}`, isError: true };
}

/** Format a Smartsheet cell value for display */
function formatCellValue(cell: any): string {
  if (cell.displayValue) return cell.displayValue;
  if (cell.value !== undefined && cell.value !== null) return String(cell.value);
  return '';
}

// ─── Tool: smartsheet_list_sheets ───────────────────────

const listSheets: ToolHandler = {
  description:
    'List all sheets accessible to the authenticated Smartsheet user. Returns sheet names, IDs, and modification dates.',
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      pageSize: {
        type: 'number',
        description: 'Number of sheets per page (default 100)',
      },
      includeAll: {
        type: 'boolean',
        description: 'Include all results without pagination (default false)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page) query.page = String(params.page);
      if (params.pageSize) query.pageSize = String(params.pageSize);
      if (params.includeAll) query.includeAll = 'true';

      const result = await ctx.apiExecutor.get('/sheets', query);

      const sheets: any[] = result.data || [];
      const totalCount = result.totalCount ?? sheets.length;

      if (sheets.length === 0) {
        return { content: 'No sheets found.' };
      }

      const lines = sheets.map((s: any) => {
        const modified = s.modifiedAt ? new Date(s.modifiedAt).toISOString().slice(0, 10) : '';
        const rows = s.totalRowCount ?? '?';
        return `${s.id}: ${s.name} — ${rows} rows (modified: ${modified})`;
      });

      return {
        content: `Found ${totalCount} sheets (showing ${sheets.length}):\n${lines.join('\n')}`,
        metadata: { totalCount, shown: sheets.length },
      };
    } catch (err) {
      return smartsheetError(err);
    }
  },
};

// ─── Tool: smartsheet_get_sheet ─────────────────────────

const getSheet: ToolHandler = {
  description:
    'Retrieve a Smartsheet sheet with its columns and rows. Returns structured data for analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: {
        type: 'number',
        description: 'The Smartsheet sheet ID',
      },
      rowNumbers: {
        type: 'string',
        description: 'Comma-separated row numbers to include (optional — omit for all rows)',
      },
      columnIds: {
        type: 'string',
        description: 'Comma-separated column IDs to include (optional — omit for all columns)',
      },
      pageSize: {
        type: 'number',
        description: 'Number of rows per page (optional)',
      },
    },
    required: ['sheetId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.rowNumbers) query.rowNumbers = params.rowNumbers;
      if (params.columnIds) query.columnIds = params.columnIds;
      if (params.pageSize) query.pageSize = String(params.pageSize);

      const result = await ctx.apiExecutor.get(`/sheets/${params.sheetId}`, query);

      const columns: any[] = result.columns || [];
      const rows: any[] = result.rows || [];

      // Build column ID → title map
      const colMap = new Map<number, string>();
      for (const col of columns) {
        colMap.set(col.id, col.title);
      }

      const header = columns.map((c: any) => c.title).join(' | ');
      const rowLines = rows.slice(0, 50).map((row: any) => {
        const cells = (row.cells || []).map((cell: any) => formatCellValue(cell));
        return cells.join(' | ');
      });

      const truncated = rows.length > 50 ? `\n... and ${rows.length - 50} more rows` : '';

      return {
        content: `Sheet: ${result.name} (${rows.length} rows, ${columns.length} columns)\n\n${header}\n${rowLines.join('\n')}${truncated}`,
        metadata: { sheetId: result.id, name: result.name, rowCount: rows.length, columnCount: columns.length },
      };
    } catch (err) {
      return smartsheetError(err);
    }
  },
};

// ─── Tool: smartsheet_add_rows ──────────────────────────

const addRows: ToolHandler = {
  description:
    'Add one or more rows to a Smartsheet sheet. Each row specifies cell values mapped to column IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: {
        type: 'number',
        description: 'The Smartsheet sheet ID',
      },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            toTop: { type: 'boolean', description: 'Add to top of sheet' },
            toBottom: { type: 'boolean', description: 'Add to bottom of sheet' },
            cells: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  columnId: { type: 'number', description: 'Column ID' },
                  value: { description: 'Cell value (string, number, or boolean)' },
                },
                required: ['columnId', 'value'],
              },
            },
          },
          required: ['cells'],
        },
        description: 'Array of rows to add',
      },
    },
    required: ['sheetId', 'rows'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.post(`/sheets/${params.sheetId}/rows`, params.rows);

      const addedRows: any[] = result.result || [];
      const count = addedRows.length;

      return {
        content: `Added ${count} row(s) to sheet ${params.sheetId}.`,
        metadata: { addedCount: count, sheetId: params.sheetId },
      };
    } catch (err) {
      return smartsheetError(err);
    }
  },
};

// ─── Tool: smartsheet_update_rows ───────────────────────

const updateRows: ToolHandler = {
  description:
    'Update existing rows in a Smartsheet sheet. Each row specifies the row ID and new cell values.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: {
        type: 'number',
        description: 'The Smartsheet sheet ID',
      },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Row ID to update' },
            cells: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  columnId: { type: 'number', description: 'Column ID' },
                  value: { description: 'New cell value' },
                },
                required: ['columnId', 'value'],
              },
            },
          },
          required: ['id', 'cells'],
        },
        description: 'Array of rows to update',
      },
    },
    required: ['sheetId', 'rows'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.put(`/sheets/${params.sheetId}/rows`, params.rows);

      const updatedRows: any[] = result.result || [];
      const count = updatedRows.length;

      return {
        content: `Updated ${count} row(s) in sheet ${params.sheetId}.`,
        metadata: { updatedCount: count, sheetId: params.sheetId },
      };
    } catch (err) {
      return smartsheetError(err);
    }
  },
};

// ─── Tool: smartsheet_search ────────────────────────────

const searchSheets: ToolHandler = {
  description:
    'Search across all Smartsheet sheets for a query string. Returns matching sheets, rows, and cell values.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/search', { query: params.query });

      const results: any[] = result.results || [];
      const totalCount = result.totalCount ?? results.length;

      if (results.length === 0) {
        return { content: `No results found for: "${params.query}"` };
      }

      const lines = results.map((r: any) => {
        const context = r.contextData?.join(' > ') || '';
        return `[${r.objectType}] ${r.text || 'no text'} — ${context} (ID: ${r.objectId})`;
      });

      return {
        content: `Found ${totalCount} results (showing ${results.length}):\n${lines.join('\n')}`,
        metadata: { totalCount, shown: results.length, query: params.query },
      };
    } catch (err) {
      return smartsheetError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const smartsheetAdapter: SkillAdapter = {
  skillId: 'smartsheet',
  name: 'Smartsheet',
  baseUrl: 'https://api.smartsheet.com/2.0',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    smartsheet_list_sheets: listSheets,
    smartsheet_get_sheet: getSheet,
    smartsheet_add_rows: addRows,
    smartsheet_update_rows: updateRows,
    smartsheet_search: searchSheets,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
