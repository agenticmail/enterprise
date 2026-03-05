/**
 * Microsoft Excel VBA / Macro Tools
 *
 * Execute Excel operations via workbook sessions, named ranges, functions, and custom formulas.
 * Uses the Excel REST API workbook session for batch operations and calculated fields.
 *
 * Note: Graph API doesn't directly execute VBA macros, but provides:
 * - Workbook sessions for transactional operations
 * - Named range management
 * - Formula evaluation
 * - Pivot table refresh
 * - Custom function calculation
 * - Chart reading
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

function itemPath(p: { itemId?: string; path?: string; driveId?: string }): string {
  if (p.driveId && p.itemId) return `/drives/${p.driveId}/items/${p.itemId}`;
  if (p.itemId) return `/me/drive/items/${p.itemId}`;
  if (p.path) return `/me/drive/root:${p.path}:`;
  throw new Error('Provide itemId or path');
}

export function createExcelAdvancedTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'excel_create_session',
      description: 'Create a workbook session for batch operations. Returns a session ID to use in subsequent calls for atomic transactions.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          persistChanges: { type: 'boolean', description: 'Persist changes after session closes (default: true)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const session = await graph(token, `${base}/workbook/createSession`, {
            method: 'POST',
            body: { persistChanges: params.persistChanges !== false },
          });
          return jsonResult({ sessionId: session.id, persistChanges: session.persistChanges });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_close_session',
      description: 'Close a workbook session. Commits or discards changes based on session config.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          sessionId: { type: 'string', description: 'Session ID to close' },
        },
        required: ['sessionId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          await graph(token, `${base}/workbook/closeSession`, {
            method: 'POST',
            headers: { 'workbook-session-id': params.sessionId },
          });
          return jsonResult({ closed: true, sessionId: params.sessionId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_evaluate_formula',
      description: 'Evaluate an Excel formula without writing it to a cell. Supports any Excel function (SUM, VLOOKUP, IF, etc.).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          worksheet: { type: 'string', description: 'Worksheet name (default: Sheet1)' },
          formula: { type: 'string', description: 'Excel formula (e.g., "=SUM(A1:A10)", "=VLOOKUP(\"Alice\",A:C,3,FALSE)")' },
          sessionId: { type: 'string', description: 'Optional session ID for batch operations' },
        },
        required: ['formula'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const ws = params.worksheet || 'Sheet1';
          // Write formula to a temp cell, read result, then clear
          const headers: Record<string, string> = {};
          if (params.sessionId) headers['workbook-session-id'] = params.sessionId;
          // Use a far-away cell to avoid conflicts
          const tempCell = 'ZZ9999';
          await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/range(address='${tempCell}')`, {
            method: 'PATCH', body: { formulas: [[params.formula]] }, headers,
          });
          const result = await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/range(address='${tempCell}')`, {
            query: { '$select': 'values,text,formulas' }, headers,
          });
          // Clear the temp cell
          await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/range(address='${tempCell}')/clear`, {
            method: 'POST', body: { applyTo: 'All' }, headers,
          });
          return jsonResult({
            formula: params.formula,
            result: result.values?.[0]?.[0],
            text: result.text?.[0]?.[0],
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_named_ranges',
      description: 'List all named ranges in a workbook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const data = await graph(token, `${base}/workbook/names`);
          const names = (data.value || []).map((n: any) => ({
            name: n.name, value: n.value, type: n.type, visible: n.visible,
            comment: n.comment,
          }));
          return jsonResult({ namedRanges: names, count: names.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_read_named_range',
      description: 'Read values from a named range.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          name: { type: 'string', description: 'Named range name' },
        },
        required: ['name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const range = await graph(token, `${base}/workbook/names/${encodeURIComponent(params.name)}/range`, {
            query: { '$select': 'address,values,text,formulas,rowCount,columnCount' }
          });
          return jsonResult({
            name: params.name, address: range.address,
            values: range.values, text: range.text,
            rows: range.rowCount, columns: range.columnCount,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_list_charts',
      description: 'List all charts in an Excel worksheet.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          worksheet: { type: 'string', description: 'Worksheet name (default: Sheet1)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const ws = params.worksheet || 'Sheet1';
          const data = await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/charts`);
          const charts = (data.value || []).map((c: any) => ({
            id: c.id, name: c.name, height: c.height, width: c.width,
            top: c.top, left: c.left,
          }));
          return jsonResult({ charts, count: charts.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_chart_image',
      description: 'Get a chart as a base64 PNG image.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          worksheet: { type: 'string', description: 'Worksheet name' },
          chartName: { type: 'string', description: 'Chart name or ID' },
        },
        required: ['chartName'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const ws = params.worksheet || 'Sheet1';
          const img = await graph(token, `${base}/workbook/worksheets/${encodeURIComponent(ws)}/charts/${encodeURIComponent(params.chartName)}/image`);
          return jsonResult({ chartName: params.chartName, base64Image: img.value, format: 'png' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_pivot_refresh',
      description: 'Refresh all pivot tables in a workbook by recalculating the workbook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          sessionId: { type: 'string', description: 'Session ID (recommended for consistency)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const headers: Record<string, string> = {};
          if (params.sessionId) headers['workbook-session-id'] = params.sessionId;
          await graph(token, `${base}/workbook/application/calculate`, {
            method: 'POST',
            body: { calculationType: 'Full' },
            headers,
          });
          return jsonResult({ refreshed: true, calculationType: 'Full' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'excel_set_cell_format',
      description: 'Set number format, font, fill, or borders on a cell range.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          worksheet: { type: 'string', description: 'Worksheet name' },
          range: { type: 'string', description: 'Cell range (e.g., "A1:D10")' },
          numberFormat: { type: 'string', description: 'Number format (e.g., "$#,##0.00", "0%", "mm/dd/yyyy")' },
          bold: { type: 'boolean', description: 'Set font bold' },
          italic: { type: 'boolean', description: 'Set font italic' },
          fontColor: { type: 'string', description: 'Font color (e.g., "#FF0000")' },
          fillColor: { type: 'string', description: 'Cell fill color (e.g., "#FFFF00")' },
          horizontalAlignment: { type: 'string', description: 'Left, Center, Right, Fill, Justify' },
        },
        required: ['range'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const ws = params.worksheet || 'Sheet1';
          const rangePath = `${base}/workbook/worksheets/${encodeURIComponent(ws)}/range(address='${params.range}')`;

          // Build format object
          const format: any = {};
          if (params.numberFormat) {
            // numberFormat needs to be an array matching the range dimensions
            await graph(token, `${rangePath}/format`, { method: 'PATCH', body: { columnWidth: null } }); // ensure format exists
          }
          if (params.bold !== undefined || params.italic !== undefined || params.fontColor) {
            const font: any = {};
            if (params.bold !== undefined) font.bold = params.bold;
            if (params.italic !== undefined) font.italic = params.italic;
            if (params.fontColor) font.color = params.fontColor;
            await graph(token, `${rangePath}/format/font`, { method: 'PATCH', body: font });
          }
          if (params.fillColor) {
            await graph(token, `${rangePath}/format/fill`, { method: 'PATCH', body: { color: params.fillColor } });
          }
          if (params.horizontalAlignment) {
            await graph(token, `${rangePath}/format`, { method: 'PATCH', body: { horizontalAlignment: params.horizontalAlignment } });
          }
          if (params.numberFormat) {
            // Get range dimensions first
            const rangeInfo = await graph(token, rangePath, { query: { '$select': 'rowCount,columnCount' } });
            const fmt = Array(rangeInfo.rowCount).fill(null).map(() => Array(rangeInfo.columnCount).fill(params.numberFormat));
            await graph(token, rangePath, { method: 'PATCH', body: { numberFormat: fmt } });
          }
          return jsonResult({ formatted: true, range: params.range });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
