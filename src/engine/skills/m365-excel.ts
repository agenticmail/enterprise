import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-excel',
  name: 'Excel',
  description: 'Spreadsheets, formulas, data analysis, charts, pivot tables, and workbook automation.',
  category: 'analytics',
  risk: 'low',
  icon: '📊',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'm365_excel_read',
    name: 'Read Workbook',
    description: 'Read Excel workbook data',
    category: 'read',
    risk: 'low',
    skillId: 'm365-excel',
    sideEffects: [],
  },
  {
    id: 'm365_excel_write',
    name: 'Write Workbook',
    description: 'Write data to Excel',
    category: 'write',
    risk: 'low',
    skillId: 'm365-excel',
    sideEffects: ['modifies-files'],
  },
  {
    id: 'm365_excel_chart',
    name: 'Create Chart',
    description: 'Create Excel chart',
    category: 'write',
    risk: 'low',
    skillId: 'm365-excel',
    sideEffects: [],
  },
  {
    id: 'm365_excel_formula',
    name: 'Run Formula',
    description: 'Execute Excel formula',
    category: 'read',
    risk: 'low',
    skillId: 'm365-excel',
    sideEffects: [],
  },
  {
    id: 'm365_excel_pivot',
    name: 'Pivot Table',
    description: 'Create or refresh pivot table',
    category: 'write',
    risk: 'low',
    skillId: 'm365-excel',
    sideEffects: [],
  },
];
