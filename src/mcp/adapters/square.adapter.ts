/**
 * MCP Skill Adapter — Square
 *
 * Maps Square REST API v2 endpoints to MCP tool handlers.
 * API reference: https://developer.squareup.com/reference/square
 *
 * Square supports sandbox mode via ctx.skillConfig.sandbox.
 * Sandbox base URL: https://connect.squareupsandbox.com/v2
 * Production base URL: https://connect.squareup.com/v2
 *
 * Tools:
 *   - square_list_payments     List payments with optional filters
 *   - square_create_payment    Create a payment
 *   - square_list_customers    List customers
 *   - square_list_catalog      List catalog objects
 *   - square_create_invoice    Create an invoice
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Square API base URL, supporting sandbox mode. */
function sqBaseUrl(ctx: ToolExecutionContext): string {
  const sandbox = ctx.skillConfig.sandbox === true;
  return sandbox
    ? 'https://connect.squareupsandbox.com/v2'
    : 'https://connect.squareup.com/v2';
}

function squareError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors = Array.isArray(data.errors)
        ? data.errors.map((e: any) => `${e.category}: ${e.detail ?? e.code}`).join('; ')
        : '';
      return { content: `Square API error: ${errors || data.message || err.message}`, isError: true };
    }
    return { content: `Square API error: ${err.message}`, isError: true };
  }
  return { content: `Square API error: ${String(err)}`, isError: true };
}

/** Format a Square Money object (amount is in smallest currency unit). */
function formatMoney(money: any): string {
  if (!money || money.amount === undefined) return 'N/A';
  const amount = (money.amount / 100).toFixed(2);
  const currency = money.currency ?? 'USD';
  return `${amount} ${currency}`;
}

/** Format a date string. */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tool: square_list_payments ─────────────────────────

const squareListPayments: ToolHandler = {
  description:
    'List Square payments with optional filters by date range, status, or location. Returns payment IDs, amounts, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      begin_time: {
        type: 'string',
        description: 'Start time in RFC 3339 format (e.g. "2024-01-01T00:00:00Z")',
      },
      end_time: {
        type: 'string',
        description: 'End time in RFC 3339 format',
      },
      location_id: {
        type: 'string',
        description: 'Filter by Square location ID',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = sqBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.begin_time) query.begin_time = params.begin_time;
      if (params.end_time) query.end_time = params.end_time;
      if (params.location_id) query.location_id = params.location_id;
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/payments`,
        query,
      });

      const payments: any[] = data.payments ?? [];
      if (payments.length === 0) {
        return { content: 'No payments found.', metadata: { paymentCount: 0 } };
      }

      const lines = payments.map((p: any) => {
        const amount = formatMoney(p.amount_money);
        const status = p.status ?? 'unknown';
        const date = formatDate(p.created_at);
        const source = p.source_type ?? 'unknown';
        return `  - ${p.id} — ${amount} — ${status} — ${source} — ${date}`;
      });

      return {
        content: `Found ${payments.length} payment(s):\n\n${lines.join('\n')}`,
        metadata: {
          paymentCount: payments.length,
          cursor: data.cursor,
        },
      };
    } catch (err) {
      return squareError(err);
    }
  },
};

// ─── Tool: square_create_payment ────────────────────────

const squareCreatePayment: ToolHandler = {
  description:
    'Create a payment in Square. Requires a source ID (e.g. nonce from a card) and an amount.',
  inputSchema: {
    type: 'object',
    properties: {
      source_id: {
        type: 'string',
        description: 'Payment source ID (card nonce, token, or "cnon:card-nonce-ok" for sandbox)',
      },
      amount: {
        type: 'number',
        description: 'Payment amount in the smallest currency unit (e.g. cents for USD)',
      },
      currency: {
        type: 'string',
        description: 'Currency code (default: USD)',
      },
      location_id: {
        type: 'string',
        description: 'Square location ID to associate the payment with',
      },
      note: {
        type: 'string',
        description: 'Optional note for the payment',
      },
      customer_id: {
        type: 'string',
        description: 'Square customer ID to associate with the payment',
      },
    },
    required: ['source_id', 'amount'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = sqBaseUrl(ctx);
      const body: Record<string, any> = {
        source_id: params.source_id,
        idempotency_key: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amount_money: {
          amount: params.amount,
          currency: params.currency ?? 'USD',
        },
      };
      if (params.location_id) body.location_id = params.location_id;
      if (params.note) body.note = params.note;
      if (params.customer_id) body.customer_id = params.customer_id;

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/payments`,
        body,
      });

      const payment = data.payment ?? data;
      const amount = formatMoney(payment.amount_money);
      return {
        content: `Payment created: ${payment.id} — ${amount} — Status: ${payment.status}`,
        metadata: {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount_money?.amount,
          currency: payment.amount_money?.currency,
        },
      };
    } catch (err) {
      return squareError(err);
    }
  },
};

// ─── Tool: square_list_customers ────────────────────────

const squareListCustomers: ToolHandler = {
  description:
    'List customers in Square. Optionally sort or paginate. Returns customer names, emails, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 100)',
      },
      sort_field: {
        type: 'string',
        enum: ['DEFAULT', 'CREATED_AT'],
        description: 'Sort field (default: DEFAULT)',
      },
      sort_order: {
        type: 'string',
        enum: ['ASC', 'DESC'],
        description: 'Sort order (default: ASC)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = sqBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);
      if (params.sort_field) query.sort_field = params.sort_field;
      if (params.sort_order) query.sort_order = params.sort_order;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/customers`,
        query,
      });

      const customers: any[] = data.customers ?? [];
      if (customers.length === 0) {
        return { content: 'No customers found.', metadata: { customerCount: 0 } };
      }

      const lines = customers.map((c: any) => {
        const name = [c.given_name, c.family_name].filter(Boolean).join(' ') || c.company_name || '(unnamed)';
        const email = c.email_address ?? 'no email';
        const phone = c.phone_number ?? '';
        return `  - ${name} (ID: ${c.id}) — ${email}${phone ? ' — ' + phone : ''}`;
      });

      return {
        content: `Found ${customers.length} customer(s):\n\n${lines.join('\n')}`,
        metadata: {
          customerCount: customers.length,
          cursor: data.cursor,
        },
      };
    } catch (err) {
      return squareError(err);
    }
  },
};

// ─── Tool: square_list_catalog ──────────────────────────

const squareListCatalog: ToolHandler = {
  description:
    'List catalog objects in Square (items, categories, discounts, taxes). Returns object names, types, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      types: {
        type: 'string',
        description: 'Comma-separated object types to list (e.g. "ITEM,CATEGORY,DISCOUNT"). Default: ITEM',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 25, max 200)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = sqBaseUrl(ctx);
      const query: Record<string, string> = {
        types: params.types ?? 'ITEM',
      };
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/catalog/list`,
        query,
      });

      const objects: any[] = data.objects ?? [];
      if (objects.length === 0) {
        return { content: 'No catalog objects found.', metadata: { objectCount: 0 } };
      }

      const lines = objects.map((obj: any) => {
        const type = obj.type ?? 'unknown';
        const itemData = obj.item_data ?? obj.category_data ?? obj.discount_data ?? {};
        const name = itemData.name ?? obj.id;
        const variations = obj.item_data?.variations ?? [];
        const priceInfo = variations.length > 0
          ? ` — ${formatMoney(variations[0].item_variation_data?.price_money)}`
          : '';
        return `  - [${type}] ${name} (ID: ${obj.id})${priceInfo}`;
      });

      return {
        content: `Found ${objects.length} catalog object(s):\n\n${lines.join('\n')}`,
        metadata: {
          objectCount: objects.length,
          cursor: data.cursor,
        },
      };
    } catch (err) {
      return squareError(err);
    }
  },
};

// ─── Tool: square_create_invoice ────────────────────────

const squareCreateInvoice: ToolHandler = {
  description:
    'Create an invoice in Square for a customer and order. Specify the location, payment request, and delivery method.',
  inputSchema: {
    type: 'object',
    properties: {
      location_id: {
        type: 'string',
        description: 'Square location ID',
      },
      order_id: {
        type: 'string',
        description: 'Square order ID to attach to the invoice',
      },
      customer_id: {
        type: 'string',
        description: 'Square customer ID (primary recipient)',
      },
      due_date: {
        type: 'string',
        description: 'Payment due date in YYYY-MM-DD format',
      },
      title: {
        type: 'string',
        description: 'Invoice title',
      },
      description: {
        type: 'string',
        description: 'Invoice description',
      },
      delivery_method: {
        type: 'string',
        enum: ['EMAIL', 'SMS', 'SHARE_MANUALLY'],
        description: 'How to deliver the invoice (default: EMAIL)',
      },
    },
    required: ['location_id', 'order_id', 'customer_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = sqBaseUrl(ctx);
      const body: Record<string, any> = {
        idempotency_key: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        invoice: {
          location_id: params.location_id,
          order_id: params.order_id,
          primary_recipient: { customer_id: params.customer_id },
          payment_requests: [
            {
              request_type: 'BALANCE',
              due_date: params.due_date ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            },
          ],
          delivery_method: params.delivery_method ?? 'EMAIL',
          title: params.title,
          description: params.description,
        },
      };

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/invoices`,
        body,
      });

      const invoice = data.invoice ?? data;
      return {
        content: `Invoice created: ${invoice.id} — Status: ${invoice.status} — ${invoice.title ?? 'Untitled'}`,
        metadata: {
          invoiceId: invoice.id,
          status: invoice.status,
          orderId: params.order_id,
          customerId: params.customer_id,
        },
      };
    } catch (err) {
      return squareError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const squareAdapter: SkillAdapter = {
  skillId: 'square',
  name: 'Square',
  baseUrl: 'https://connect.squareup.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'square',
  },
  tools: {
    square_list_payments: squareListPayments,
    square_create_payment: squareCreatePayment,
    square_list_customers: squareListCustomers,
    square_list_catalog: squareListCatalog,
    square_create_invoice: squareCreateInvoice,
  },
  configSchema: {
    sandbox: {
      type: 'boolean' as const,
      label: 'Sandbox Mode',
      description: 'Use Square sandbox environment for testing',
      default: false,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
