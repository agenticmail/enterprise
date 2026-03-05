/**
 * Microsoft Excel Tools
 *
 * Spreadsheet operations via Microsoft Graph API — read/write cells, ranges, tables, worksheets.
 * Works with Excel files stored in OneDrive or SharePoint.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

function itemPath(p: { itemId?: string; path?: string; driveId?: string }): string {
  if (p.driveId && p.itemId) return `/drives/${p.driveId}/items/${p.itemId}`;
  if (p.itemId) return `/me/drive/items/${p.itemId}`;
  if (p.path) return `/me/drive/root:${p.path}:`;
  throw new Error('Provide itemId or path to the Excel file');
}

export function createExcelTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'excel_list_worksheets',
      description: 'List all worksheets in an Excel workbook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID of the Excel file' },
          path: { type: 'string', description: 'File path (alternative to itemId, e.g., "/Documents/Budget.xlsx")' },
          driveId: { type: 'string', description: 'Drive ID (for SharePoint drives)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const data = await graph(token, `${base}/workbook/worksheets`);
          const sheets = (data.value || []).map((s: any) => ({
            id: s.id, name: s.name, position: s.position, visibility: s.visibility,
          }));
          return jsonResult({ worksheets: sheets, count: sheets.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_read_range',
      description: 'Read a range of cells from an Excel worksheet. Returns values, formulas, and formatting.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path (alternative to itemId)' },
          driveId: { type: 'string', description: 'Drive ID (for SharePoint)' },
          worksheet: { type: 'string', description: 'Worksheet name (default: first sheet)' },
          range: { type: 'string', description: 'Cell range (e.g., "A1:D10", "Sheet1!A1:Z100"). Omit for used range.' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          let rangePath: string;
          if (params.range) {
            const _ws = params.worksheet ? `/worksheets/${encodeURIComponent(params.worksheet)}` : '/worksheets';
            // If range contains !, it has sheet name embedded
            if (params.range.includes('!')) {
              rangePath = `${base}/workbook/worksheets/${encodeURIComponent(params.range.split('!')[0])}/range(address='${params.range.split('!')[1]}')`;
            } else if (params.worksheet) {
              rangePath = `${base}/workbook/worksheets/${encodeURIComponent(params.worksheet)}/range(address='${params.range}')`;
            } else {
              rangePath = `${base}/workbook/worksheets('Sheet1')/range(address='${params.range}')`;
            }
          } else {
            const ws = params.worksheet || 'Sheet1';
            rangePath = `${base}/workbook/worksheets/${encodeURIComponent(ws)}/usedRange`;
          }
          const data = await graph(token, rangePath, {
            query: { '$select': 'address,values,text,formulas,numberFormat,rowCount,columnCount' }
          });
          return jsonResult({
            address: data.address,
            values: data.values,
            text: data.text,
            formulas: data.formulas,
            rows: data.rowCount,
            columns: data.columnCount,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_write_range',
      description: 'Write values to a range of cells in an Excel worksheet.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path (alternative to itemId)' },
          driveId: { type: 'string', description: 'Drive ID (for SharePoint)' },
          worksheet: { type: 'string', description: 'Worksheet name (default: Sheet1)' },
          range: { type: 'string', description: 'Cell range to write to (e.g., "A1:C3")' },
          values: { type: 'array', description: 'Array of arrays — each inner array is a row (e.g., [["Name","Age"],["Alice",30]])' },
        },
        required: ['range', 'values'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const ws = params.worksheet || 'Sheet1';
          await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/range(address='${params.range}')`, {
            method: 'PATCH',
            body: { values: params.values },
          });
          return jsonResult({ written: true, range: params.range, worksheet: ws });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_add_row',
      description: 'Add a row to an Excel table (structured table, not just a range).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          worksheet: { type: 'string', description: 'Worksheet name' },
          tableName: { type: 'string', description: 'Table name (default: first table found)' },
          values: { type: 'array', description: 'Row values as array (e.g., ["Alice", 30, "alice@example.com"])' },
        },
        required: ['values'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          let tablePath: string;
          if (params.tableName) {
            tablePath = params.worksheet
              ? `${base}/workbook/worksheets/${encodeURIComponent(params.worksheet)}/tables/${encodeURIComponent(params.tableName)}`
              : `${base}/workbook/tables/${encodeURIComponent(params.tableName)}`;
          } else {
            // Get first table
            const ws = params.worksheet || 'Sheet1';
            const tables = await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/tables`);
            if (!tables.value?.length) throw new Error('No tables found in worksheet. Create a table first or use excel_write_range.');
            tablePath = `${base}/workbook/tables/${tables.value[0].id}`;
          }
          const row = await graph(token, `${tablePath}/rows/add`, {
            method: 'POST',
            body: { values: [params.values] },
          });
          return jsonResult({ added: true, index: row.index });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_list_tables',
      description: 'List all tables in an Excel workbook or specific worksheet.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          worksheet: { type: 'string', description: 'Worksheet name (omit for all tables in workbook)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const tablesPath = params.worksheet
            ? `${base}/workbook/worksheets/${encodeURIComponent(params.worksheet)}/tables`
            : `${base}/workbook/tables`;
          const data = await graph(token, tablesPath);
          const tables = (data.value || []).map((t: any) => ({
            id: t.id, name: t.name, rows: t.rowCount,
            columns: t.columns?.length, showHeaders: t.showHeaders,
            style: t.style,
          }));
          return jsonResult({ tables, count: tables.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_read_table',
      description: 'Read all data from an Excel table including headers.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          tableName: { type: 'string', description: 'Table name or ID' },
        },
        required: ['tableName'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const [headerData, bodyData] = await Promise.all([
            graph(token, `${base}/workbook/tables/${encodeURIComponent(params.tableName)}/headerRowRange`),
            graph(token, `${base}/workbook/tables/${encodeURIComponent(params.tableName)}/dataBodyRange`),
          ]);
          return jsonResult({
            headers: headerData.values?.[0],
            rows: bodyData.values,
            rowCount: bodyData.rowCount,
            columnCount: bodyData.columnCount,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_create_worksheet',
      description: 'Add a new worksheet to an Excel workbook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          name: { type: 'string', description: 'Worksheet name' },
        },
        required: ['name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const ws = await graph(token, `${base}/workbook/worksheets/add`, {
            method: 'POST',
            body: { name: params.name },
          });
          return jsonResult({ id: ws.id, name: ws.name, position: ws.position });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
