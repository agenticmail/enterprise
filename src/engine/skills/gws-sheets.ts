import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-sheets',
  name: 'Google Sheets',
  description: 'Spreadsheet read/write, cell operations, and sheet management.',
  category: 'productivity',
  risk: 'low',
  icon: Emoji.barChart,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_sheets_get', name: 'Get Spreadsheet', description: 'Get spreadsheet metadata', category: 'read', risk: 'low', skillId: 'gws-sheets', sideEffects: [] },
  { id: 'google_sheets_read', name: 'Read Sheet', description: 'Read data from a sheet range', category: 'read', risk: 'low', skillId: 'gws-sheets', sideEffects: [] },
  { id: 'google_sheets_write', name: 'Write Sheet', description: 'Write data to a sheet range', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: ['modifies-files'] },
  { id: 'google_sheets_append', name: 'Append Rows', description: 'Append rows to a sheet', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: ['modifies-files'] },
  { id: 'google_sheets_clear', name: 'Clear Range', description: 'Clear a sheet range', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: ['modifies-files'] },
  { id: 'google_sheets_create', name: 'Create Spreadsheet', description: 'Create new spreadsheet', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: [] },
  { id: 'google_sheets_add_sheet', name: 'Add Sheet', description: 'Add a new sheet/tab', category: 'write', risk: 'low', skillId: 'gws-sheets', sideEffects: ['modifies-files'] },
];
