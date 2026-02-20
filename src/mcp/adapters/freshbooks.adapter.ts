/**
 * MCP Skill Adapter — FreshBooks
 *
 * Maps FreshBooks Accounting API endpoints to MCP tool handlers.
 * API reference: https://www.freshbooks.com/api/
 *
 * FreshBooks API paths are scoped by account ID:
 *   /accounting/account/{accountId}/...
 * The accountId is read from ctx.skillConfig.accountId.
 *
 * Tools:
 *   - freshbooks_list_clients      List clients with optional search
 *   - freshbooks_create_invoice    Create a new invoice
 *   - freshbooks_list_invoices     List invoices with filters
 *   - freshbooks_list_expenses     List expenses with filters
 *   - freshbooks_get_profit_loss   Get the profit & loss report
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the FreshBooks account ID from skill config. */
function accountId(ctx: ToolExecutionContext): string {
  const id = ctx.skillConfig.accountId;
  if (!id) throw new Error('FreshBooks accountId is not configured. Set skillConfig.accountId.');
  return id;
}

/** Build the FreshBooks accounting base path. */
function accountPath(ctx: ToolExecutionContext): string {
  return `/accounting/account/${accountId(ctx)}`;
}

function freshbooksError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const response = data.response ?? data;
      const errors = response.errors ?? [];
      if (Array.isArray(errors) && errors.length > 0) {
        const details = errors.map((e: any) => e.message ?? e.errno ?? String(e)).join('; ');
        return { content: `FreshBooks API error: ${details}`, isError: true };
      }
      return { content: `FreshBooks API error: ${response.message ?? err.message}`, isError: true };
    }
    return { content: `FreshBooks API error: ${err.message}`, isError: true };
  }
  return { content: `FreshBooks API error: ${String(err)}`, isError: true };
}

/** Format a monetary amount. */
function formatAmount(amount: string | number | undefined, currency: string = 'USD'): string {
  if (amount === undefined || amount === null) return 'N/A';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'N/A';
  return `${num.toFixed(2)} ${currency}`;
}

/** Format a date string. */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tool: freshbooks_list_clients ──────────────────────

const freshbooksListClients: ToolHandler = {
  description:
    'List clients in FreshBooks. Optionally search by organization name or email. Returns client names, emails, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search clients by organization name or email',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 25),
      };
      if (params.search) {
        query['search[organization_like]'] = params.search;
      }

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: `${accountPath(ctx)}/users/clients`,
        query,
      });

      const clients: any[] = data.response?.result?.clients ?? [];
      if (clients.length === 0) {
        return { content: 'No clients found.', metadata: { clientCount: 0 } };
      }

      const lines = clients.map((c: any) => {
        const org = c.organization ?? '(no organization)';
        const name = [c.fname, c.lname].filter(Boolean).join(' ') || '(unnamed)';
        const email = c.email ?? 'no email';
        return `  - ${org} — ${name} (ID: ${c.id}) — ${email}`;
      });

      const total = data.response?.result?.total ?? clients.length;
      return {
        content: `Found ${total} client(s) (showing ${clients.length}):\n\n${lines.join('\n')}`,
        metadata: { clientCount: clients.length, total },
      };
    } catch (err) {
      return freshbooksError(err);
    }
  },
};

// ─── Tool: freshbooks_create_invoice ────────────────────

const freshbooksCreateInvoice: ToolHandler = {
  description:
    'Create a new invoice in FreshBooks for a client. Provide at least one line item with name and amount.',
  inputSchema: {
    type: 'object',
    properties: {
      customer_id: {
        type: 'string',
        description: 'FreshBooks client/customer ID',
      },
      lines: {
        type: 'array',
        description: 'Invoice line items',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Line item name/description' },
            amount: { type: 'number', description: 'Line item unit cost' },
            quantity: { type: 'number', description: 'Quantity (default 1)' },
          },
          required: ['name', 'amount'],
        },
        minItems: 1,
      },
      due_offset_days: {
        type: 'number',
        description: 'Number of days until due (default 30)',
      },
      notes: {
        type: 'string',
        description: 'Notes to include on the invoice',
      },
      status: {
        type: 'number',
        description: 'Invoice status: 1=draft, 2=sent (default 1)',
      },
    },
    required: ['customer_id', 'lines'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const lines = params.lines.map((item: any) => ({
        name: item.name,
        qty: item.quantity ?? 1,
        unit_cost: { amount: String(item.amount), code: 'USD' },
        type: 0,
      }));

      const body: Record<string, any> = {
        invoice: {
          customerid: params.customer_id,
          create_date: new Date().toISOString().split('T')[0],
          due_offset_days: params.due_offset_days ?? 30,
          lines,
          status: params.status ?? 1,
        },
      };
      if (params.notes) body.invoice.notes = params.notes;

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        path: `${accountPath(ctx)}/invoices/invoices`,
        body,
      });

      const invoice = data.response?.result?.invoice ?? data;
      const amount = formatAmount(invoice.amount?.amount, invoice.amount?.code);
      return {
        content: `Invoice created: #${invoice.invoice_number ?? invoice.id} — ${amount} — Status: ${invoice.status === 1 ? 'draft' : 'sent'}`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: invoice.amount?.amount,
          customerId: params.customer_id,
        },
      };
    } catch (err) {
      return freshbooksError(err);
    }
  },
};

// ─── Tool: freshbooks_list_invoices ─────────────────────

const freshbooksListInvoices: ToolHandler = {
  description:
    'List invoices in FreshBooks. Optionally filter by status or customer. Returns invoice numbers, amounts, and dates.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'number',
        description: 'Filter by status: 1=draft, 2=sent, 3=viewed, 4=paid, 5=partial',
      },
      customer_id: {
        type: 'string',
        description: 'Filter by customer ID',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 25),
      };
      if (params.status) query['search[status]'] = String(params.status);
      if (params.customer_id) query['search[customerid]'] = params.customer_id;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: `${accountPath(ctx)}/invoices/invoices`,
        query,
      });

      const invoices: any[] = data.response?.result?.invoices ?? [];
      if (invoices.length === 0) {
        return { content: 'No invoices found.', metadata: { invoiceCount: 0 } };
      }

      const lines = invoices.map((inv: any) => {
        const num = inv.invoice_number ?? inv.id;
        const amount = formatAmount(inv.amount?.amount, inv.amount?.code);
        const statusLabels: Record<number, string> = { 1: 'draft', 2: 'sent', 3: 'viewed', 4: 'paid', 5: 'partial' };
        const status = statusLabels[inv.status] ?? String(inv.status);
        const date = formatDate(inv.create_date);
        return `  - #${num} — ${amount} — ${status} — ${date}`;
      });

      const total = data.response?.result?.total ?? invoices.length;
      return {
        content: `Found ${total} invoice(s) (showing ${invoices.length}):\n\n${lines.join('\n')}`,
        metadata: { invoiceCount: invoices.length, total },
      };
    } catch (err) {
      return freshbooksError(err);
    }
  },
};

// ─── Tool: freshbooks_list_expenses ─────────────────────

const freshbooksListExpenses: ToolHandler = {
  description:
    'List expenses in FreshBooks. Optionally filter by category or date range. Returns expense descriptions, amounts, and vendors.',
  inputSchema: {
    type: 'object',
    properties: {
      category_id: {
        type: 'string',
        description: 'Filter by expense category ID',
      },
      date_from: {
        type: 'string',
        description: 'Filter expenses from this date (YYYY-MM-DD)',
      },
      date_to: {
        type: 'string',
        description: 'Filter expenses up to this date (YYYY-MM-DD)',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 25),
      };
      if (params.category_id) query['search[categoryid]'] = params.category_id;
      if (params.date_from) query['search[date_min]'] = params.date_from;
      if (params.date_to) query['search[date_max]'] = params.date_to;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: `${accountPath(ctx)}/expenses/expenses`,
        query,
      });

      const expenses: any[] = data.response?.result?.expenses ?? [];
      if (expenses.length === 0) {
        return { content: 'No expenses found.', metadata: { expenseCount: 0 } };
      }

      const lines = expenses.map((exp: any) => {
        const amount = formatAmount(exp.amount?.amount, exp.amount?.code);
        const vendor = exp.vendor ?? 'unknown vendor';
        const date = formatDate(exp.date);
        const note = exp.notes ?? '';
        return `  - ${vendor} — ${amount} — ${date}${note ? ' — ' + note : ''}`;
      });

      const total = data.response?.result?.total ?? expenses.length;
      return {
        content: `Found ${total} expense(s) (showing ${expenses.length}):\n\n${lines.join('\n')}`,
        metadata: { expenseCount: expenses.length, total },
      };
    } catch (err) {
      return freshbooksError(err);
    }
  },
};

// ─── Tool: freshbooks_get_profit_loss ───────────────────

const freshbooksGetProfitLoss: ToolHandler = {
  description:
    'Retrieve the profit & loss report from FreshBooks. Specify a date range for the report period.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Report start date in YYYY-MM-DD format',
      },
      end_date: {
        type: 'string',
        description: 'Report end date in YYYY-MM-DD format',
      },
    },
    required: ['start_date', 'end_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        start_date: params.start_date,
        end_date: params.end_date,
      };

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: `${accountPath(ctx)}/reports/accounting/profitloss`,
        query,
      });

      const report = data.response?.result?.profitloss ?? data;
      const revenue = report.revenue?.total ?? 'N/A';
      const expenses = report.expenses?.total ?? 'N/A';
      const netProfit = report.net_profit?.total ?? 'N/A';
      const currency = report.currency_code ?? 'USD';

      const sections: string[] = [
        `Profit & Loss Report: ${params.start_date} to ${params.end_date}`,
        `Currency: ${currency}`,
        '',
        `Total Revenue: ${formatAmount(revenue, currency)}`,
        `Total Expenses: ${formatAmount(expenses, currency)}`,
        `Net Profit: ${formatAmount(netProfit, currency)}`,
      ];

      // Include revenue breakdown if available
      const revenueItems: any[] = report.revenue?.children ?? [];
      if (revenueItems.length > 0) {
        sections.push('', 'Revenue Breakdown:');
        for (const item of revenueItems) {
          sections.push(`  ${item.description}: ${formatAmount(item.total, currency)}`);
        }
      }

      // Include expense breakdown if available
      const expenseItems: any[] = report.expenses?.children ?? [];
      if (expenseItems.length > 0) {
        sections.push('', 'Expense Breakdown:');
        for (const item of expenseItems) {
          sections.push(`  ${item.description}: ${formatAmount(item.total, currency)}`);
        }
      }

      return {
        content: sections.join('\n'),
        metadata: {
          revenue,
          expenses,
          netProfit,
          startDate: params.start_date,
          endDate: params.end_date,
        },
      };
    } catch (err) {
      return freshbooksError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const freshbooksAdapter: SkillAdapter = {
  skillId: 'freshbooks',
  name: 'FreshBooks',
  baseUrl: 'https://api.freshbooks.com/accounting/account/ACCOUNT_ID',
  auth: {
    type: 'oauth2',
    provider: 'freshbooks',
  },
  tools: {
    freshbooks_list_clients: freshbooksListClients,
    freshbooks_create_invoice: freshbooksCreateInvoice,
    freshbooks_list_invoices: freshbooksListInvoices,
    freshbooks_list_expenses: freshbooksListExpenses,
    freshbooks_get_profit_loss: freshbooksGetProfitLoss,
  },
  configSchema: {
    accountId: {
      type: 'string' as const,
      label: 'Account ID',
      description: 'Your FreshBooks account ID',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
