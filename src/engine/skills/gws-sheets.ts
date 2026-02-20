import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-sheets',
  name: 'Google Sheets',
  description: 'Spreadsheets, formulas, charts, data validation, and Apps Script.',
  category: 'analytics',
  risk: 'low',
  icon: '📊',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_sheets_read', name: 'Read Sheet', description: 'Read Google Sheets data', category: 'read', risk: 'low', skillId: 'gws-sheets', sideEffects: [] },
  { id: 'gws_sheets_write', name: 'Write Sheet', description: 'Write data to Google Sheets', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: ['modifies-files'] },
  { id: 'gws_sheets_create', name: 'Create Sheet', description: 'Create Google Spreadsheet', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: [] },
  { id: 'gws_sheets_formula', name: 'Run Formula', description: 'Execute Sheets formula', category: 'read', risk: 'low', skillId: 'gws-sheets', sideEffects: [] },
];
