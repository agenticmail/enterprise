/**
 * Google Sheets — system prompts for spreadsheet operations.
 */

import type { PromptContext } from '../index.js';

export interface SheetsTaskContext extends PromptContext {
  taskDescription: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetName?: string;
}

export function buildSheetsTaskPrompt(ctx: SheetsTaskContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Sheets Task
${ctx.taskDescription}
${ctx.spreadsheetId ? `- **Spreadsheet ID**: ${ctx.spreadsheetId}` : ''}
${ctx.spreadsheetTitle ? `- **Title**: ${ctx.spreadsheetTitle}` : ''}
${ctx.sheetName ? `- **Sheet**: ${ctx.sheetName}` : ''}

## Available Tools
- google_sheets_create — create a new spreadsheet
- google_sheets_get — read cell values (A1 notation)
- google_sheets_update — write cell values
- google_sheets_append — append rows to a sheet
- google_sheets_list — list recent spreadsheets
- google_sheets_add_sheet — add a new sheet tab
- google_sheets_format — format cells (bold, color, etc.)
`;
}
