/**
 * AgenticMail Agent Tools — Enterprise Finance
 *
 * File-based budget and expense tracking system. Manages budgets,
 * expenses, and invoices stored in {workspaceDir}/.agenticmail/finance.json
 * with atomic writes and spending forecasts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, errorResult } from '../common.js';

type Budget = {
  id: string;
  name: string;
  amount: number;
  spent: number;
  currency: string;
  period: string;
  department: string;
};

type Expense = {
  id: string;
  budgetId: string;
  amount: number;
  description: string;
  category: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
};

type Invoice = {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string;
  paidDate?: string;
};

type FinanceStore = {
  budgets: Budget[];
  expenses: Expense[];
  invoices: Invoice[];
};

async function loadFinanceStore(storePath: string): Promise<FinanceStore> {
  try {
    var content = await fs.readFile(storePath, 'utf-8');
    return JSON.parse(content) as FinanceStore;
  } catch {
    return { budgets: [], expenses: [], invoices: [] };
  }
}

async function saveFinanceStore(storePath: string, store: FinanceStore): Promise<void> {
  var dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  var data = JSON.stringify(store, null, 2);
  var tmpPath = storePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, storePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

function getBudgetStatus(spent: number, amount: number): string {
  var pct = amount > 0 ? (spent / amount) * 100 : 0;
  if (pct > 90) return 'critical';
  if (pct > 75) return 'warning';
  return 'healthy';
}

function filterExpensesByPeriod(expenses: Expense[], period: string): Expense[] {
  var now = new Date();
  var cutoff: Date;

  switch (period) {
    case 'day':
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week': {
      var dayOfWeek = now.getDay();
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      break;
    }
    case 'month':
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter': {
      var quarterStart = Math.floor(now.getMonth() / 3) * 3;
      cutoff = new Date(now.getFullYear(), quarterStart, 1);
      break;
    }
    case 'year':
      cutoff = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return expenses.filter(function(e) {
    return new Date(e.date).getTime() >= cutoff.getTime();
  });
}

export function createEnterpriseFinanceTools(options?: ToolCreationOptions): AnyAgentTool[] {
  var storePath = path.join(
    options?.workspaceDir || process.cwd(),
    '.agenticmail',
    'finance.json',
  );

  return [
    {
      name: 'ent_fin_check_budget',
      label: 'Check Budget',
      description: 'Check budget status including allocated, spent, and remaining amounts. Shows all budgets if no ID specified. Color-codes: >90% critical, >75% warning.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          budget_id: { type: 'string', description: 'Optional budget ID. If omitted, shows all budgets.' },
          department: { type: 'string', description: 'Optional department filter.' },
        },
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var budgetId = readStringParam(params, 'budget_id');
          var department = readStringParam(params, 'department');
          var store = await loadFinanceStore(storePath);

          if (store.budgets.length === 0) {
            return jsonResult({
              message: 'No budgets found. Create a budget entry in finance.json to get started.',
              budgets: [],
            });
          }

          var budgets = store.budgets;
          if (budgetId) {
            budgets = budgets.filter(function(b) { return b.id === budgetId; });
            if (budgets.length === 0) {
              return errorResult('Budget not found: ' + budgetId);
            }
          }
          if (department) {
            budgets = budgets.filter(function(b) { return b.department === department; });
          }

          var summary = budgets.map(function(b) {
            var remaining = b.amount - b.spent;
            var pctUsed = b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0;
            return {
              id: b.id,
              name: b.name,
              department: b.department,
              currency: b.currency,
              period: b.period,
              allocated: b.amount,
              spent: b.spent,
              remaining: remaining,
              percentUsed: pctUsed,
              status: getBudgetStatus(b.spent, b.amount),
            };
          });

          return jsonResult({ count: summary.length, budgets: summary });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to check budget.');
        }
      },
    },
    {
      name: 'ent_fin_submit_expense',
      label: 'Submit Expense',
      description: 'Submit a new expense against a budget. Warns if the expense would exceed the budget but still submits it.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          budget_id: { type: 'string', description: 'Budget ID to charge this expense to.' },
          amount: { type: 'number', description: 'Expense amount (positive number).' },
          description: { type: 'string', description: 'Description of the expense.' },
          category: { type: 'string', description: 'Expense category.', enum: ['travel', 'meals', 'software', 'hardware', 'services', 'other'] },
          submitted_by: { type: 'string', description: 'Name or email of the person submitting.' },
        },
        required: ['budget_id', 'amount', 'description', 'category', 'submitted_by'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var budgetId = readStringParam(params, 'budget_id', { required: true });
          var amount = readNumberParam(params, 'amount', { required: true })!;
          var description = readStringParam(params, 'description', { required: true });
          var category = readStringParam(params, 'category', { required: true });
          var submittedBy = readStringParam(params, 'submitted_by', { required: true });

          if (amount <= 0) {
            return errorResult('Amount must be a positive number.');
          }

          var validCategories = ['travel', 'meals', 'software', 'hardware', 'services', 'other'];
          if (validCategories.indexOf(category) === -1) {
            return errorResult('Invalid category "' + category + '". Must be one of: ' + validCategories.join(', '));
          }

          var store = await loadFinanceStore(storePath);
          var budget = store.budgets.find(function(b) { return b.id === budgetId; });

          var warning: string | undefined;
          if (!budget) {
            warning = 'Budget "' + budgetId + '" not found. Expense submitted without budget validation.';
          } else {
            var remaining = budget.amount - budget.spent;
            if (amount > remaining) {
              warning = 'This expense (' + amount + ' ' + budget.currency + ') exceeds remaining budget (' + remaining.toFixed(2) + ' ' + budget.currency + ').';
            }
            budget.spent = budget.spent + amount;
          }

          var expense: Expense = {
            id: crypto.randomUUID(),
            budgetId: budgetId,
            amount: amount,
            description: description,
            category: category,
            submittedBy: submittedBy,
            status: 'pending',
            date: new Date().toISOString(),
          };

          store.expenses.push(expense);
          await saveFinanceStore(storePath, store);

          var result: Record<string, unknown> = { expense: expense };
          if (warning) {
            result.warning = warning;
          }
          return jsonResult(result);
        } catch (err: any) {
          return errorResult(err.message || 'Failed to submit expense.');
        }
      },
    },
    {
      name: 'ent_fin_spending_summary',
      label: 'Spending Summary',
      description: 'Aggregate spending by period, department, or category. Returns totals and breakdowns.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Time period to summarize.', enum: ['day', 'week', 'month', 'quarter', 'year'] },
          department: { type: 'string', description: 'Optional department filter.' },
          category: { type: 'string', description: 'Optional expense category filter.' },
        },
        required: ['period'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var period = readStringParam(params, 'period', { required: true });
          var department = readStringParam(params, 'department');
          var categoryFilter = readStringParam(params, 'category');

          var store = await loadFinanceStore(storePath);
          var expenses = filterExpensesByPeriod(store.expenses, period);

          // Apply department filter via budget lookup
          if (department) {
            var deptBudgetIds = store.budgets
              .filter(function(b) { return b.department === department; })
              .map(function(b) { return b.id; });
            expenses = expenses.filter(function(e) {
              return deptBudgetIds.indexOf(e.budgetId) !== -1;
            });
          }

          if (categoryFilter) {
            expenses = expenses.filter(function(e) { return e.category === categoryFilter; });
          }

          // Group by category
          var byCategory: Record<string, number> = {};
          var total = 0;
          for (var i = 0; i < expenses.length; i++) {
            var exp = expenses[i];
            if (!byCategory[exp.category]) byCategory[exp.category] = 0;
            byCategory[exp.category] = byCategory[exp.category] + exp.amount;
            total = total + exp.amount;
          }

          // Group by submitter
          var bySubmitter: Record<string, number> = {};
          for (var j = 0; j < expenses.length; j++) {
            var exp2 = expenses[j];
            if (!bySubmitter[exp2.submittedBy]) bySubmitter[exp2.submittedBy] = 0;
            bySubmitter[exp2.submittedBy] = bySubmitter[exp2.submittedBy] + exp2.amount;
          }

          var categoryBreakdown = Object.keys(byCategory).map(function(cat) {
            return { category: cat, amount: Math.round(byCategory[cat] * 100) / 100 };
          }).sort(function(a, b) { return b.amount - a.amount; });

          var submitterBreakdown = Object.keys(bySubmitter).map(function(sub) {
            return { submitter: sub, amount: Math.round(bySubmitter[sub] * 100) / 100 };
          }).sort(function(a, b) { return b.amount - a.amount; });

          return jsonResult({
            period: period,
            department: department || 'all',
            totalExpenses: expenses.length,
            totalAmount: Math.round(total * 100) / 100,
            byCategory: categoryBreakdown,
            bySubmitter: submitterBreakdown,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to generate spending summary.');
        }
      },
    },
    {
      name: 'ent_fin_invoice_status',
      label: 'Invoice Status',
      description: 'Check the status of invoices. Shows all invoices if no ID specified.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string', description: 'Optional invoice ID. If omitted, shows all invoices.' },
        },
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var invoiceId = readStringParam(params, 'invoice_id');
          var store = await loadFinanceStore(storePath);

          if (store.invoices.length === 0) {
            return jsonResult({
              message: 'No invoices found. Add invoice records to finance.json to track invoice status.',
              invoices: [],
            });
          }

          var invoices = store.invoices;
          if (invoiceId) {
            invoices = invoices.filter(function(inv) { return inv.id === invoiceId; });
            if (invoices.length === 0) {
              return errorResult('Invoice not found: ' + invoiceId);
            }
          }

          // Check for overdue invoices
          var now = Date.now();
          var results = invoices.map(function(inv) {
            var isOverdue = inv.status !== 'paid' && inv.status !== 'cancelled' && new Date(inv.dueDate).getTime() < now;
            return {
              id: inv.id,
              vendor: inv.vendor,
              amount: inv.amount,
              currency: inv.currency,
              status: isOverdue ? 'overdue' : inv.status,
              dueDate: inv.dueDate,
              paidDate: inv.paidDate || null,
              daysUntilDue: isOverdue ? 0 : Math.ceil((new Date(inv.dueDate).getTime() - now) / (1000 * 60 * 60 * 24)),
            };
          });

          return jsonResult({ count: results.length, invoices: results });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to check invoice status.');
        }
      },
    },
    {
      name: 'ent_fin_forecast',
      label: 'Spending Forecast',
      description: 'Project spending based on the current burn rate. Calculates daily spend from recent expenses and projects forward to estimate budget depletion.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          budget_id: { type: 'string', description: 'Budget ID to forecast.' },
          months_ahead: { type: 'number', description: 'Number of months to project (default 3).', default: 3 },
        },
        required: ['budget_id'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var budgetId = readStringParam(params, 'budget_id', { required: true });
          var monthsAhead = readNumberParam(params, 'months_ahead', { integer: true }) ?? 3;

          var store = await loadFinanceStore(storePath);
          var budget = store.budgets.find(function(b) { return b.id === budgetId; });

          if (!budget) {
            return errorResult('Budget not found: ' + budgetId);
          }

          // Get expenses for this budget in current period
          var budgetExpenses = store.expenses.filter(function(e) { return e.budgetId === budgetId; });

          if (budgetExpenses.length === 0) {
            return jsonResult({
              budget_id: budgetId,
              budget_name: budget.name,
              allocated: budget.amount,
              spent: budget.spent,
              remaining: budget.amount - budget.spent,
              message: 'No expenses recorded for this budget. Cannot calculate burn rate.',
            });
          }

          // Calculate daily burn rate from expense history
          var dates = budgetExpenses.map(function(e) { return new Date(e.date).getTime(); });
          var earliest = Math.min.apply(null, dates);
          var latest = Math.max.apply(null, dates);
          var daySpan = Math.max(1, Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)));

          var totalSpent = budgetExpenses.reduce(function(sum, e) { return sum + e.amount; }, 0);
          var dailyBurnRate = totalSpent / daySpan;
          var remaining = budget.amount - budget.spent;

          // Calculate depletion date
          var daysUntilDepletion = dailyBurnRate > 0 ? Math.ceil(remaining / dailyBurnRate) : Infinity;
          var depletionDate = daysUntilDepletion === Infinity
            ? null
            : new Date(Date.now() + daysUntilDepletion * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          // Project spending for each month
          var projections: Array<{ month: string; projectedSpend: number; cumulativeSpend: number; remainingBudget: number }> = [];
          var cumulative = budget.spent;
          for (var m = 0; m < monthsAhead; m++) {
            var targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + m + 1);
            var monthLabel = targetDate.toISOString().slice(0, 7);
            var daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
            var monthSpend = Math.round(dailyBurnRate * daysInMonth * 100) / 100;
            cumulative = Math.round((cumulative + monthSpend) * 100) / 100;
            projections.push({
              month: monthLabel,
              projectedSpend: monthSpend,
              cumulativeSpend: cumulative,
              remainingBudget: Math.round((budget.amount - cumulative) * 100) / 100,
            });
          }

          return jsonResult({
            budget_id: budgetId,
            budget_name: budget.name,
            currency: budget.currency,
            allocated: budget.amount,
            spent: budget.spent,
            remaining: Math.round(remaining * 100) / 100,
            dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
            daysUntilDepletion: daysUntilDepletion === Infinity ? null : daysUntilDepletion,
            estimatedDepletionDate: depletionDate,
            status: getBudgetStatus(budget.spent, budget.amount),
            projections: projections,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to generate forecast.');
        }
      },
    },
  ];
}
