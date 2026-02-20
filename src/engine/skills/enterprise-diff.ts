import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-diff',
  name: 'Comparison & Diff',
  description: 'Compare documents, datasets, configurations, and code to find differences. Supports text diff, JSON/YAML structural diff, spreadsheet comparison, and config audit. Generates human-readable change reports.',
  category: 'data',
  risk: 'low',
  icon: '🔀',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_diff_text',
    name: 'Diff Text',
    description: 'Compare two text strings or files line-by-line. Returns additions, deletions, and modifications with line numbers. Supports unified and side-by-side diff formats.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-diff',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        left: { type: 'string', description: 'Left text or file path' },
        right: { type: 'string', description: 'Right text or file path' },
        format: { type: 'string', enum: ['unified', 'side-by-side', 'json', 'html'], default: 'unified' },
        ignoreWhitespace: { type: 'boolean', default: false },
        contextLines: { type: 'number', description: 'Lines of context around changes', default: 3 },
      },
      required: ['left', 'right'],
    },
  },
  {
    id: 'ent_diff_json',
    name: 'Diff JSON/YAML',
    description: 'Structural comparison of two JSON or YAML objects. Shows added, removed, and modified keys with their paths. Understands nested structures and arrays.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-diff',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        left: { type: ['object', 'string'], description: 'Left JSON object or file path' },
        right: { type: ['object', 'string'], description: 'Right JSON object or file path' },
        ignoreOrder: { type: 'boolean', description: 'Ignore array order', default: false },
        deep: { type: 'boolean', description: 'Deep comparison of nested objects', default: true },
      },
      required: ['left', 'right'],
    },
  },
  {
    id: 'ent_diff_spreadsheet',
    name: 'Diff Spreadsheets',
    description: 'Compare two spreadsheets cell-by-cell. Highlights added/removed rows, changed cells, and structural differences (new columns, reordered data). Supports Excel and CSV.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-diff',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        leftFile: { type: 'string', description: 'Path to first spreadsheet' },
        rightFile: { type: 'string', description: 'Path to second spreadsheet' },
        keyColumns: { type: 'array', items: { type: 'string' }, description: 'Columns to use as row identifiers for matching' },
        ignoreColumns: { type: 'array', items: { type: 'string' }, description: 'Columns to exclude from comparison' },
        sheet: { type: 'string', description: 'Sheet name (Excel only)' },
      },
      required: ['leftFile', 'rightFile'],
    },
  },
  {
    id: 'ent_diff_summary',
    name: 'Generate Change Summary',
    description: 'Generate a human-readable summary of differences between two versions of a document, dataset, or configuration. Explains what changed, what was added/removed, and the impact.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-diff',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        left: { type: 'string', description: 'Original version (text, file path, or JSON)' },
        right: { type: 'string', description: 'New version' },
        context: { type: 'string', description: 'What these documents represent (e.g., "employee handbook", "API config")' },
        format: { type: 'string', enum: ['text', 'markdown', 'html'], default: 'markdown' },
      },
      required: ['left', 'right'],
    },
  },
];
