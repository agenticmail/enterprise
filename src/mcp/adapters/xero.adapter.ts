/**
 * MCP Skill Adapter — Xero Accounting
 *
 * Maps Xero Accounting REST API endpoints to MCP tool handlers.
 * API reference: https://developer.xero.com/documentation/api/accounting/overview
 *
 * Xero requires a Tenant ID header (xero-tenant-id) on every request,
 * which is read from ctx.skillConfig.tenantId.
 *
 * Tools:
 *   - xero_list_invoices      List invoices with optional filters
 *   - xero_create_invoice     Create a new invoice for a contact
 *   - xero_list_contacts      List contacts with optional search
 *   - xero_get_balance_sheet  Retrieve the balance sheet report
 *   - xero_list_payments      List payments with optional filters
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Xero Tenant ID from skill config. */
function tenantId(ctx: ToolExecutionContext): string {
  const id = ctx.skillConfig.tenantId;
  if (!id) throw new Error('Xero tenantId is not configured. Set skillConfig.tenantId.');
  return id;
}

/** Build standard Xero headers including tenant ID. */
function xeroHeaders(ctx: ToolExecutionContext): Record<string, string> {
  return {
    'xero-tenant-id': tenantId(ctx),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function xeroError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.Message || data.Detail || data.message || err.message;
      return { content: `Xero API error: ${msg}`, isError: true };
    }
    return { content: `Xero API error: ${err.message}`, isError: true };
  }
  return { content: `Xero API error: ${String(err)}`, isError: true };
}

/** Format a monetary amount. */
function formatAmount(amount: number | undefined, currency: string = 'USD'): string {
  if (amount === undefined || amount === null) return 'N/A';
  return `${amount.toFixed(2)} ${currency}`;
}

/** Format a Xero date string. */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  // Xero returns dates like "/Date(1234567890000+0000)/" or ISO strings
  const msMatch = dateStr.match(/\/Date\((\d+)/);
  if (msMatch) {
    return new Date(parseInt(msMatch[1], 10)).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tool: xero_list_invoices ───────────────────────────

const xeroListInvoices: ToolHandler = {
  description:
    'List Xero invoices with optional filters by status, contact, or date range. Returns invoice numbers, amounts, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'],
        description: 'Filter by invoice status',
      },
      contact_id: {
        type: 'string',
        description: 'Filter by Xero Contact ID',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (1-indexed, default 1)',
      },
      modified_since: {
        type: 'string',
        description: 'Only return invoices modified after this date (ISO 8601)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page) query.page = String(params.page);

      const where: string[] = [];
      if (params.status) where.push(`Status=="${params.status}"`);
      if (params.contact_id) where.push(`Contact.ContactID=guid("${params.contact_id}")`);
      if (where.length > 0) query.where = where.join(' AND ');

      const headers: Record<string, string> = xeroHeaders(ctx);
      if (params.modified_since) {
        headers['If-Modified-Since'] = params.modified_since;
      }

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/Invoices',
        query,
        headers,
      });

      const invoices: any[] = data.Invoices ?? [];
      if (invoices.length === 0) {
        return { content: 'No invoices found.', metadata: { invoiceCount: 0 } };
      }

      const lines = invoices.map((inv: any) => {
        const num = inv.InvoiceNumber ?? inv.InvoiceID;
        const total = formatAmount(inv.Total, inv.CurrencyCode);
        const status = inv.Status ?? 'unknown';
        const date = formatDate(inv.DateString ?? inv.Date);
        const contact = inv.Contact?.Name ?? 'unknown';
        return `  - ${num} — ${status} — ${total} — ${contact} — ${date}`;
      });

      return {
        content: `Found ${invoices.length} invoice(s):\n\n${lines.join('\n')}`,
        metadata: { invoiceCount: invoices.length },
      };
    } catch (err) {
      return xeroError(err);
    }
  },
};

// ─── Tool: xero_create_invoice ──────────────────────────

const xeroCreateInvoice: ToolHandler = {
  description:
    'Create a new sales invoice in Xero for a given contact. Provide at least one line item with description and amount.',
  inputSchema: {
    type: 'object',
    properties: {
      contact_id: {
        type: 'string',
        description: 'Xero Contact ID for the invoice recipient',
      },
      line_items: {
        type: 'array',
        description: 'Invoice line items',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Line item description' },
            quantity: { type: 'number', description: 'Quantity (default 1)' },
            unit_amount: { type: 'number', description: 'Unit price' },
            account_code: { type: 'string', description: 'Xero account code (e.g. "200")' },
          },
          required: ['description', 'unit_amount'],
        },
        minItems: 1,
      },
      due_date: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format',
      },
      reference: {
        type: 'string',
        description: 'Invoice reference / PO number',
      },
      type: {
        type: 'string',
        enum: ['ACCREC', 'ACCPAY'],
        description: 'Invoice type: ACCREC (sales) or ACCPAY (bill). Default: ACCREC',
      },
    },
    required: ['contact_id', 'line_items'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const lineItems = params.line_items.map((item: any) => ({
        Description: item.description,
        Quantity: item.quantity ?? 1,
        UnitAmount: item.unit_amount,
        AccountCode: item.account_code ?? '200',
      }));

      const body: Record<string, any> = {
        Type: params.type ?? 'ACCREC',
        Contact: { ContactID: params.contact_id },
        LineItems: lineItems,
        Status: 'DRAFT',
      };
      if (params.due_date) body.DueDate = params.due_date;
      if (params.reference) body.Reference = params.reference;

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/Invoices',
        body,
        headers: xeroHeaders(ctx),
      });

      const invoice = data.Invoices?.[0] ?? data;
      return {
        content: `Invoice created: ${invoice.InvoiceNumber ?? invoice.InvoiceID} — Total: ${formatAmount(invoice.Total, invoice.CurrencyCode)} — Status: ${invoice.Status}`,
        metadata: {
          invoiceId: invoice.InvoiceID,
          invoiceNumber: invoice.InvoiceNumber,
          total: invoice.Total,
          status: invoice.Status,
        },
      };
    } catch (err) {
      return xeroError(err);
    }
  },
};

// ─── Tool: xero_list_contacts ───────────────────────────

const xeroListContacts: ToolHandler = {
  description:
    'List contacts in Xero. Optionally search by name or filter by active status. Returns contact names, emails, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search contacts by name (substring match)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (1-indexed, default 1)',
      },
      include_archived: {
        type: 'boolean',
        description: 'Include archived contacts (default false)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page) query.page = String(params.page);
      if (params.search) {
        query.where = `Name.Contains("${params.search}")`;
      }
      if (params.include_archived) {
        query.includeArchived = 'true';
      }

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/Contacts',
        query,
        headers: xeroHeaders(ctx),
      });

      const contacts: any[] = data.Contacts ?? [];
      if (contacts.length === 0) {
        return { content: 'No contacts found.', metadata: { contactCount: 0 } };
      }

      const lines = contacts.map((c: any) => {
        const email = c.EmailAddress ?? 'no email';
        const status = c.ContactStatus ?? 'unknown';
        return `  - ${c.Name} (ID: ${c.ContactID}) — ${email} — ${status}`;
      });

      return {
        content: `Found ${contacts.length} contact(s):\n\n${lines.join('\n')}`,
        metadata: { contactCount: contacts.length },
      };
    } catch (err) {
      return xeroError(err);
    }
  },
};

// ─── Tool: xero_get_balance_sheet ───────────────────────

const xeroGetBalanceSheet: ToolHandler = {
  description:
    'Retrieve the balance sheet report from Xero. Optionally specify a date for a point-in-time snapshot.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Balance sheet date in YYYY-MM-DD format (default: today)',
      },
      periods: {
        type: 'number',
        description: 'Number of comparison periods (default 0)',
      },
      timeframe: {
        type: 'string',
        enum: ['MONTH', 'QUARTER', 'YEAR'],
        description: 'Comparison period timeframe (default MONTH)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.date) query.date = params.date;
      if (params.periods) query.periods = String(params.periods);
      if (params.timeframe) query.timeframe = params.timeframe;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/Reports/BalanceSheet',
        query,
        headers: xeroHeaders(ctx),
      });

      const reports: any[] = data.Reports ?? [];
      if (reports.length === 0) {
        return { content: 'No balance sheet data returned.', metadata: {} };
      }

      const report = reports[0];
      const title = report.ReportName ?? 'Balance Sheet';
      const date = report.ReportDate ?? 'unknown';

      const sections: string[] = [`${title} — as of ${date}\n`];
      for (const row of report.Rows ?? []) {
        if (row.RowType === 'Header') continue;
        if (row.RowType === 'Section') {
          sections.push(`\n${row.Title ?? ''}`);
          for (const subRow of row.Rows ?? []) {
            const cells = subRow.Cells ?? [];
            const label = cells[0]?.Value ?? '';
            const value = cells[1]?.Value ?? '';
            if (label) sections.push(`  ${label}: ${value}`);
          }
        }
        if (row.RowType === 'SummaryRow') {
          const cells = row.Cells ?? [];
          const label = cells[0]?.Value ?? '';
          const value = cells[1]?.Value ?? '';
          sections.push(`\n${label}: ${value}`);
        }
      }

      return {
        content: sections.join('\n'),
        metadata: { reportName: title, reportDate: date },
      };
    } catch (err) {
      return xeroError(err);
    }
  },
};

// ─── Tool: xero_list_payments ───────────────────────────

const xeroListPayments: ToolHandler = {
  description:
    'List payments in Xero. Optionally filter by status or invoice. Returns payment amounts, dates, and references.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['AUTHORISED', 'DELETED'],
        description: 'Filter by payment status',
      },
      invoice_id: {
        type: 'string',
        description: 'Filter payments for a specific invoice ID',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (1-indexed, default 1)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page) query.page = String(params.page);

      const where: string[] = [];
      if (params.status) where.push(`Status=="${params.status}"`);
      if (params.invoice_id) where.push(`Invoice.InvoiceID=guid("${params.invoice_id}")`);
      if (where.length > 0) query.where = where.join(' AND ');

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/Payments',
        query,
        headers: xeroHeaders(ctx),
      });

      const payments: any[] = data.Payments ?? [];
      if (payments.length === 0) {
        return { content: 'No payments found.', metadata: { paymentCount: 0 } };
      }

      const lines = payments.map((p: any) => {
        const amount = formatAmount(p.Amount, p.CurrencyCode);
        const date = formatDate(p.Date);
        const ref = p.Reference ?? 'no ref';
        const status = p.Status ?? 'unknown';
        return `  - ${p.PaymentID} — ${amount} — ${date} — ${status} — ref: ${ref}`;
      });

      return {
        content: `Found ${payments.length} payment(s):\n\n${lines.join('\n')}`,
        metadata: { paymentCount: payments.length },
      };
    } catch (err) {
      return xeroError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const xeroAdapter: SkillAdapter = {
  skillId: 'xero',
  name: 'Xero Accounting',
  baseUrl: 'https://api.xero.com/api.xro/2.0',
  auth: {
    type: 'oauth2',
    provider: 'xero',
  },
  tools: {
    xero_list_invoices: xeroListInvoices,
    xero_create_invoice: xeroCreateInvoice,
    xero_list_contacts: xeroListContacts,
    xero_get_balance_sheet: xeroGetBalanceSheet,
    xero_list_payments: xeroListPayments,
  },
  configSchema: {
    tenantId: {
      type: 'string' as const,
      label: 'Xero Tenant ID',
      description: 'Your Xero organization tenant ID',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
