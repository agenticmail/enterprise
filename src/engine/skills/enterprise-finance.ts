import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-finance',
  name: 'Budget & Expense Management',
  description: 'Check budgets, submit expenses, track spending, generate financial summaries, and flag over-budget items. Integrates with connected accounting systems.',
  category: 'finance',
  risk: 'medium',
  icon: '💰',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_fin_check_budget',
    name: 'Check Budget',
    description: 'Check remaining budget for a project, department, or cost center. Returns allocated, spent, remaining, and projected end-of-period balance.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-finance',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        budgetId: { type: 'string', description: 'Budget/project/department ID' },
        period: { type: 'string', enum: ['current-month', 'current-quarter', 'current-year', 'custom'], default: 'current-month' },
        startDate: { type: 'string', description: 'Custom period start (ISO date)' },
        endDate: { type: 'string', description: 'Custom period end' },
      },
      required: ['budgetId'],
    },
  },
  {
    id: 'ent_fin_submit_expense',
    name: 'Submit Expense Report',
    description: 'Submit an expense report with line items for approval. Attaches receipts and routes to the appropriate approver based on amount thresholds.',
    category: 'write',
    risk: 'medium',
    skillId: 'enterprise-finance',
    sideEffects: ['network-request', 'sends-email'],
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Expense report title' },
        department: { type: 'string' },
        lineItems: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string', default: 'USD' }, category: { type: 'string', enum: ['travel', 'meals', 'supplies', 'software', 'equipment', 'services', 'other'] }, date: { type: 'string' }, receiptPath: { type: 'string' } } } },
        notes: { type: 'string' },
        costCenter: { type: 'string' },
      },
      required: ['title', 'lineItems'],
    },
  },
  {
    id: 'ent_fin_spending_summary',
    name: 'Spending Summary',
    description: 'Generate a spending summary broken down by category, department, vendor, or time period. Useful for financial reviews and forecasting.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-finance',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['category', 'department', 'vendor', 'month', 'project'] },
        period: { type: 'string', enum: ['current-month', 'current-quarter', 'current-year', 'last-30-days', 'last-90-days'] },
        department: { type: 'string', description: 'Filter by department' },
        format: { type: 'string', enum: ['json', 'markdown', 'csv'], default: 'markdown' },
      },
      required: ['groupBy', 'period'],
    },
  },
  {
    id: 'ent_fin_invoice_status',
    name: 'Check Invoice Status',
    description: 'Check the payment status of vendor invoices: pending, approved, paid, overdue.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-finance',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice number or ID' },
        vendor: { type: 'string', description: 'Vendor name (for searching)' },
        status: { type: 'string', enum: ['all', 'pending', 'approved', 'paid', 'overdue'], default: 'all' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    id: 'ent_fin_forecast',
    name: 'Budget Forecast',
    description: 'Project end-of-period spending based on current trends. Flags budgets at risk of being exceeded.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-finance',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        budgetId: { type: 'string' },
        forecastPeriod: { type: 'string', enum: ['end-of-month', 'end-of-quarter', 'end-of-year'] },
      },
      required: ['budgetId'],
    },
  },
];
