/**
 * Google Sheets Tools
 *
 * Read, write, and manipulate spreadsheets via Google Sheets API v4.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sapi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const method = opts?.method || 'GET';
  const url = new URL(BASE + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Google Sheets API ${res.status}: ${err}`); }
  if (res.status === 204) return {};
  return res.json();
}

export function createGoogleSheetsTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  return [
    {
      name: 'google_sheets_get',
      description: 'Get spreadsheet metadata: title, sheets/tabs, row counts.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID (required — from the URL)' },
        },
        required: ['spreadsheetId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await sapi(token, `/${params.spreadsheetId}`, {
            query: { fields: 'spreadsheetId,properties.title,sheets.properties' },
          });
          const sheets = (data.sheets || []).map((s: any) => ({
            sheetId: s.properties.sheetId, title: s.properties.title,
            rowCount: s.properties.gridProperties?.rowCount,
            columnCount: s.properties.gridProperties?.columnCount,
          }));
          return jsonResult({ spreadsheetId: data.spreadsheetId, title: data.properties?.title, sheets });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_sheets_read',
      description: 'Read cell values from a sheet range. Returns a 2D array of values.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID (required)' },
          range: { type: 'string', description: 'A1 notation range, e.g. "Sheet1!A1:D10" or "Sheet1" for entire sheet (required)' },
          majorDimension: { type: 'string', description: '"ROWS" (default) or "COLUMNS"' },
        },
        required: ['spreadsheetId', 'range'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {};
          if (params.majorDimension) query.majorDimension = params.majorDimension;
          const data = await sapi(token, `/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}`, { query });
          const values = data.values || [];
          return jsonResult({
            range: data.range, majorDimension: data.majorDimension || 'ROWS',
            values, rowCount: values.length, columnCount: values[0]?.length || 0,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_sheets_write',
      description: 'Write values to a sheet range. Provide rows as JSON array of arrays.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID (required)' },
          range: { type: 'string', description: 'A1 notation range to write to, e.g. "Sheet1!A1" (required)' },
          values: { type: 'string', description: 'JSON array of arrays, e.g. [["Name","Score"],["Alice",95],["Bob",87]] (required)' },
          inputOption: { type: 'string', description: '"RAW" or "USER_ENTERED" (default: "USER_ENTERED" — parses formulas/numbers)' },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          let values: any[][];
          try { values = JSON.parse(params.values); } catch { return errorResult('Invalid JSON for values — must be array of arrays'); }
          const data = await sapi(token, `/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}`, {
            method: 'PUT',
            query: { valueInputOption: params.inputOption || 'USER_ENTERED' },
            body: { range: params.range, majorDimension: 'ROWS', values },
          });
          return jsonResult({ updated: true, updatedRange: data.updatedRange, updatedRows: data.updatedRows, updatedColumns: data.updatedColumns, updatedCells: data.updatedCells });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_sheets_append',
      description: 'Append rows to the end of a sheet (after existing data).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID (required)' },
          range: { type: 'string', description: 'Sheet range to append to, e.g. "Sheet1" (required)' },
          values: { type: 'string', description: 'JSON array of arrays to append (required)' },
          inputOption: { type: 'string', description: '"RAW" or "USER_ENTERED" (default: "USER_ENTERED")' },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          let values: any[][];
          try { values = JSON.parse(params.values); } catch { return errorResult('Invalid JSON for values'); }
          const data = await sapi(token, `/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}:append`, {
            method: 'POST',
            query: { valueInputOption: params.inputOption || 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
            body: { range: params.range, majorDimension: 'ROWS', values },
          });
          return jsonResult({ appended: true, updatedRange: data.updates?.updatedRange, updatedRows: data.updates?.updatedRows, updatedCells: data.updates?.updatedCells });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_sheets_clear',
      description: 'Clear values from a range (keeps formatting).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID (required)' },
          range: { type: 'string', description: 'Range to clear, e.g. "Sheet1!A2:D100" (required)' },
        },
        required: ['spreadsheetId', 'range'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await sapi(token, `/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}:clear`, { method: 'POST', body: {} });
          return jsonResult({ cleared: true, clearedRange: data.clearedRange });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_sheets_create',
      description: 'Create a new spreadsheet.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Spreadsheet title (required)' },
          sheetTitles: { type: 'string', description: 'Comma-separated sheet/tab names (default: "Sheet1")' },
        },
        required: ['title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const sheets = (params.sheetTitles || 'Sheet1').split(',').map((t: string, i: number) => ({
            properties: { title: t.trim(), index: i },
          }));
          const data = await sapi(token, '', {
            method: 'POST',
            body: { properties: { title: params.title }, sheets },
          });
          return jsonResult({
            created: true, spreadsheetId: data.spreadsheetId,
            title: data.properties?.title,
            url: data.spreadsheetUrl,
            sheets: (data.sheets || []).map((s: any) => s.properties?.title),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_sheets_add_sheet',
      description: 'Add a new sheet/tab to an existing spreadsheet.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID (required)' },
          title: { type: 'string', description: 'New sheet/tab name (required)' },
        },
        required: ['spreadsheetId', 'title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await sapi(token, `/${params.spreadsheetId}:batchUpdate`, {
            method: 'POST',
            body: { requests: [{ addSheet: { properties: { title: params.title } } }] },
          });
          const reply = data.replies?.[0]?.addSheet?.properties;
          return jsonResult({ added: true, sheetId: reply?.sheetId, title: reply?.title });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
