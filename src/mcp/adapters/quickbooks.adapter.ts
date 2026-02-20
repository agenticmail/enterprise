/**
 * MCP Skill Adapter — QuickBooks Online
 *
 * Maps QuickBooks Online REST API v3 endpoints to MCP tool handlers.
 * API reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities
 *
 * QuickBooks paths are scoped to a company via /company/{realmId}/...
 * The realmId is read from ctx.skillConfig.realmId.
 *
 * The base URL differs by environment:
 *   - Production: https://quickbooks.api.intuit.com/v3
 *   - Sandbox:    https://sandbox-quickbooks.api.intuit.com/v3
 *
 * Tools:
 *   - quickbooks_query           Execute a QuickBooks query (SOQL-like)
 *   - quickbooks_create_invoice  Create an invoice for a customer
 *   - quickbooks_list_customers  List customers with optional filtering
 *   - quickbooks_get_company_info  Get company profile information
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the QuickBooks base URL, supporting sandbox mode. */
function qbBaseUrl(ctx: ToolExecutionContext): string {
  const sandbox = ctx.skillConfig.sandbox === true || ctx.skillConfig.environment === 'sandbox';
  return sandbox
    ? 'https://sandbox-quickbooks.api.intuit.com/v3'
    : 'https://quickbooks.api.intuit.com/v3';
}

/** Resolve the realmId (company ID) from skill config. */
function realmId(ctx: ToolExecutionContext): string {
  const id = ctx.skillConfig.realmId || ctx.skillConfig.companyId;
  if (!id) throw new Error('QuickBooks realmId is not configured. Set skillConfig.realmId.');
  return id;
}

/** Build a human-readable error result from a QuickBooks API error. */
function qbError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // QBO wraps errors in Fault.Error[]
      const faultErrors: any[] = data.Fault?.Error ?? [];
      if (faultErrors.length > 0) {
        const details = faultErrors
          .map((e: any) => `${e.code ?? 'ERR'}: ${e.Message ?? e.Detail ?? 'Unknown error'}`)
          .join('; ');
        return { content: `QuickBooks API error: ${details}`, isError: true };
      }
      if (data.message) {
        return { content: `QuickBooks API error: ${data.message}`, isError: true };
      }
    }
    return { content: `QuickBooks API error: ${err.message}`, isError: true };
  }
  return { content: String(err), isError: true };
}

/** Format a QuickBooks monetary amount. */
function formatAmount(amount: number | string | undefined, currency: string = 'USD'): string {
  if (amount === undefined || amount === null) return 'N/A';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'N/A';
  return `${num.toFixed(2)} ${currency}`;
}

/** Format a date string (YYYY-MM-DD) to a readable form. */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Tool: quickbooks_query ─────────────────────────────

const quickbooksQuery: ToolHandler = {
  description:
    'Execute a QuickBooks query using the query language (similar to SQL). Returns matching entities. Example: "SELECT * FROM Invoice WHERE TotalAmt > 100 MAXRESULTS 10".',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'QuickBooks query string (e.g. "SELECT * FROM Customer WHERE DisplayName LIKE \'%Acme%\' MAXRESULTS 25")',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = qbBaseUrl(ctx);
      const realm = realmId(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/company/${realm}/query`,
        query: { query: params.query },
        headers: { Accept: 'application/json' },
      });

      const response = result.QueryResponse ?? {};
      // The entity key varies (Invoice, Customer, etc.), grab the first array
      const entityKey = Object.keys(response).find((k) => Array.isArray(response[k]));
      const records: any[] = entityKey ? response[entityKey] : [];
      const totalCount = response.totalCount ?? records.length;

      if (records.length === 0) {
        return {
          content: `Query returned 0 results: ${params.query}`,
          metadata: { totalCount: 0, query: params.query },
        };
      }

      const lines = records.slice(0, 50).map((r: any) => {
        const name = r.DisplayName || r.Name || r.DocNumber || r.Id || 'unknown';
        const id = r.Id ?? '';
        const extra: string[] = [];
        if (r.TotalAmt != null) extra.push(`Total: ${formatAmount(r.TotalAmt, r.CurrencyRef?.value)}`);
        if (r.Balance != null) extra.push(`Balance: ${formatAmount(r.Balance)}`);
        if (r.PrimaryEmailAddr?.Address) extra.push(r.PrimaryEmailAddr.Address);
        const extraStr = extra.length > 0 ? ` (${extra.join(', ')})` : '';
        return `  - [${id}] ${name}${extraStr}`;
      });

      const truncNote = records.length > 50 ? `\n\n(Showing first 50 of ${records.length} results)` : '';

      return {
        content: `Found ${totalCount} result(s):\n\n${lines.join('\n')}${truncNote}`,
        metadata: { totalCount, shown: Math.min(records.length, 50), query: params.query },
      };
    } catch (err) {
      return qbError(err);
    }
  },
};

// ─── Tool: quickbooks_create_invoice ────────────────────

const quickbooksCreateInvoice: ToolHandler = {
  description:
    'Create a new invoice in QuickBooks Online for a customer. Provide at least one line item with amount and description.',
  inputSchema: {
    type: 'object',
    properties: {
      customer_id: {
        type: 'string',
        description: 'QuickBooks Customer ID (the value of Customer.Id)',
      },
      line_items: {
        type: 'array',
        description: 'Invoice line items',
        items: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Line item description',
            },
            amount: {
              type: 'number',
              description: 'Line item amount',
            },
            quantity: {
              type: 'number',
              description: 'Quantity (default 1)',
            },
            item_id: {
              type: 'string',
              description: 'QuickBooks Item ID (optional, for catalog items)',
            },
          },
          required: ['description', 'amount'],
        },
        minItems: 1,
      },
      due_date: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format (optional)',
      },
      email: {
        type: 'string',
        description: 'Email address to send the invoice to (optional)',
      },
    },
    required: ['customer_id', 'line_items'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = qbBaseUrl(ctx);
      const realm = realmId(ctx);

      const lines = params.line_items.map((item: any) => {
        const line: Record<string, any> = {
          DetailType: 'SalesItemLineDetail',
          Amount: item.amount,
          Description: item.description,
          SalesItemLineDetail: {
            Qty: item.quantity ?? 1,
            UnitPrice: item.amount / (item.quantity ?? 1),
          },
        };
        if (item.item_id) {
          line.SalesItemLineDetail.ItemRef = { value: item.item_id };
        }
        return line;
      });

      const body: Record<string, any> = {
        CustomerRef: { value: params.customer_id },
        Line: lines,
      };
      if (params.due_date) body.DueDate = params.due_date;
      if (params.email) body.BillEmail = { Address: params.email };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/company/${realm}/invoice`,
        body,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      });

      const invoice = result.Invoice ?? result;
      const totalAmt = formatAmount(invoice.TotalAmt, invoice.CurrencyRef?.value);
      const dueDate = formatDate(invoice.DueDate);

      return {
        content: `Invoice created: #${invoice.DocNumber ?? invoice.Id} for ${totalAmt}, due ${dueDate}`,
        metadata: {
          invoiceId: invoice.Id,
          docNumber: invoice.DocNumber,
          totalAmt: invoice.TotalAmt,
          customerId: params.customer_id,
        },
      };
    } catch (err) {
      return qbError(err);
    }
  },
};

// ─── Tool: quickbooks_list_customers ────────────────────

const quickbooksListCustomers: ToolHandler = {
  description:
    'List customers in QuickBooks Online. Optionally filter by display name. Returns customer names, IDs, emails, and balances.',
  inputSchema: {
    type: 'object',
    properties: {
      display_name: {
        type: 'string',
        description: 'Filter customers whose DisplayName contains this string (optional)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default 25, max 1000)',
      },
      active: {
        type: 'boolean',
        description: 'Filter by active status (default: true)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = qbBaseUrl(ctx);
      const realm = realmId(ctx);
      const maxResults = params.max_results ?? 25;

      // Build the query
      const conditions: string[] = [];
      if (params.display_name) {
        conditions.push(`DisplayName LIKE '%${params.display_name}%'`);
      }
      if (params.active !== undefined) {
        conditions.push(`Active = ${params.active}`);
      }
      const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const queryStr = `SELECT * FROM Customer${where} MAXRESULTS ${maxResults}`;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/company/${realm}/query`,
        query: { query: queryStr },
        headers: { Accept: 'application/json' },
      });

      const customers: any[] = result.QueryResponse?.Customer ?? [];
      if (customers.length === 0) {
        return {
          content: 'No customers found.',
          metadata: { customerCount: 0 },
        };
      }

      const lines = customers.map((c: any) => {
        const name = c.DisplayName ?? c.CompanyName ?? '(unnamed)';
        const email = c.PrimaryEmailAddr?.Address ?? 'no email';
        const balance = formatAmount(c.Balance);
        return `  - ${name} (ID: ${c.Id}) -- ${email} -- Balance: ${balance}`;
      });

      return {
        content: `Found ${customers.length} customer(s):\n\n${lines.join('\n')}`,
        metadata: {
          customerCount: customers.length,
          totalCount: result.QueryResponse?.totalCount ?? customers.length,
        },
      };
    } catch (err) {
      return qbError(err);
    }
  },
};

// ─── Tool: quickbooks_get_company_info ──────────────────

const quickbooksGetCompanyInfo: ToolHandler = {
  description:
    'Get the company profile information from QuickBooks Online, including name, address, and fiscal year.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = qbBaseUrl(ctx);
      const realm = realmId(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/company/${realm}/companyinfo/${realm}`,
        headers: { Accept: 'application/json' },
      });

      const info = result.CompanyInfo ?? result;
      const name = info.CompanyName ?? '(unknown)';
      const legalName = info.LegalName ?? name;
      const email = info.Email?.Address ?? 'N/A';
      const phone = info.PrimaryPhone?.FreeFormNumber ?? 'N/A';
      const country = info.Country ?? '';
      const fiscalStart = info.FiscalYearStartMonth ?? 'N/A';

      const addr = info.CompanyAddr;
      const addressLines = addr
        ? [addr.Line1, addr.City, addr.CountrySubDivisionCode, addr.PostalCode]
            .filter(Boolean)
            .join(', ')
        : 'N/A';

      const content = [
        `Company: ${name}`,
        `Legal name: ${legalName}`,
        `Address: ${addressLines}`,
        `Country: ${country}`,
        `Phone: ${phone}`,
        `Email: ${email}`,
        `Fiscal year starts: Month ${fiscalStart}`,
        `Realm ID: ${realm}`,
      ].join('\n');

      return {
        content,
        metadata: {
          companyName: name,
          realmId: realm,
          country,
        },
      };
    } catch (err) {
      return qbError(err);
    }
  },
};

// ─── Adapter ────────────────────────────────────────────

export const quickbooksAdapter: SkillAdapter = {
  skillId: 'quickbooks-accounting',
  name: 'QuickBooks',
  // Base URL is dynamic (production vs sandbox); tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://quickbooks.api.intuit.com/v3',
  auth: {
    type: 'oauth2',
    provider: 'intuit',
    headerPrefix: 'Bearer',
  },
  tools: {
    quickbooks_query: quickbooksQuery,
    quickbooks_create_invoice: quickbooksCreateInvoice,
    quickbooks_list_customers: quickbooksListCustomers,
    quickbooks_get_company_info: quickbooksGetCompanyInfo,
  },
  configSchema: {
    realmId: {
      type: 'string' as const,
      label: 'Company ID (Realm ID)',
      description: 'Your QuickBooks company realm ID',
      required: true,
      placeholder: '123456789',
    },
    sandbox: {
      type: 'boolean' as const,
      label: 'Sandbox Mode',
      description: 'Use QuickBooks sandbox environment for testing',
      default: false,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
