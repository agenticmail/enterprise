import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-power-bi',
  name: 'Power BI',
  description: 'Business intelligence dashboards, reports, datasets, and data refresh.',
  category: 'analytics',
  risk: 'medium',
  icon: '📈',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_pbi_dashboards', name: 'List Dashboards', description: 'List Power BI dashboards', category: 'read', risk: 'low', skillId: 'm365-power-bi', sideEffects: [] },
  { id: 'm365_pbi_reports', name: 'List Reports', description: 'List Power BI reports', category: 'read', risk: 'low', skillId: 'm365-power-bi', sideEffects: [] },
  { id: 'm365_pbi_refresh', name: 'Refresh Dataset', description: 'Trigger dataset refresh', category: 'execute', risk: 'medium', skillId: 'm365-power-bi', sideEffects: [] },
  { id: 'm365_pbi_export', name: 'Export Report', description: 'Export report to PDF/PPTX', category: 'read', risk: 'low', skillId: 'm365-power-bi', sideEffects: [] },
];
