/**
 * MCP Skill Adapter — PayPal
 *
 * Maps PayPal REST API v2 endpoints to MCP tool handlers.
 * API reference: https://developer.paypal.com/api/rest/
 *
 * PayPal supports sandbox mode via ctx.skillConfig.sandbox.
 * Sandbox base URL: https://api-m.sandbox.paypal.com/v2
 * Production base URL: https://api-m.paypal.com/v2
 *
 * Tools:
 *   - paypal_list_transactions  List recent transactions
 *   - paypal_create_payment     Create a payment order
 *   - paypal_get_order          Get order details by ID
 *   - paypal_create_payout      Create a batch payout
 *   - paypal_list_disputes      List payment disputes
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the PayPal API base URL, supporting sandbox mode. */
function ppBaseUrl(ctx: ToolExecutionContext): string {
  const sandbox = ctx.skillConfig.sandbox === true;
  return sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function paypalError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const details = Array.isArray(data.details)
        ? data.details.map((d: any) => d.description ?? d.issue ?? String(d)).join('; ')
        : '';
      const msg = data.message ?? data.error_description ?? err.message;
      return { content: `PayPal API error: ${msg}${details ? ` — ${details}` : ''}`, isError: true };
    }
    return { content: `PayPal API error: ${err.message}`, isError: true };
  }
  return { content: `PayPal API error: ${String(err)}`, isError: true };
}

/** Format a monetary amount. */
function formatAmount(value: string | number | undefined, currency: string = 'USD'): string {
  if (value === undefined || value === null) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
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

// ─── Tool: paypal_list_transactions ─────────────────────

const paypalListTransactions: ToolHandler = {
  description:
    'List PayPal transactions within a date range. Returns transaction IDs, amounts, statuses, and payer info.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date in ISO 8601 format (e.g. "2024-01-01T00:00:00Z")',
      },
      end_date: {
        type: 'string',
        description: 'End date in ISO 8601 format (e.g. "2024-01-31T23:59:59Z")',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 500)',
      },
      transaction_status: {
        type: 'string',
        description: 'Filter by status (e.g. "S" for success, "D" for denied)',
      },
    },
    required: ['start_date', 'end_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = ppBaseUrl(ctx);
      const query: Record<string, string> = {
        start_date: params.start_date,
        end_date: params.end_date,
        page: String(params.page ?? 1),
        page_size: String(params.page_size ?? 20),
        fields: 'all',
      };
      if (params.transaction_status) {
        query.transaction_status = params.transaction_status;
      }

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/v1/reporting/transactions`,
        query,
      });

      const transactions: any[] = data.transaction_details ?? [];
      if (transactions.length === 0) {
        return { content: 'No transactions found.', metadata: { transactionCount: 0 } };
      }

      const lines = transactions.map((tx: any) => {
        const info = tx.transaction_info ?? {};
        const id = info.transaction_id ?? 'unknown';
        const amount = info.transaction_amount
          ? formatAmount(info.transaction_amount.value, info.transaction_amount.currency_code)
          : 'N/A';
        const status = info.transaction_status ?? 'unknown';
        const date = formatDate(info.transaction_initiation_date);
        const payer = tx.payer_info?.email_address ?? 'unknown';
        return `  - ${id} — ${amount} — ${status} — ${date} — ${payer}`;
      });

      const totalItems = data.total_items ?? transactions.length;
      return {
        content: `Found ${totalItems} transaction(s) (showing ${transactions.length}):\n\n${lines.join('\n')}`,
        metadata: { transactionCount: transactions.length, totalItems },
      };
    } catch (err) {
      return paypalError(err);
    }
  },
};

// ─── Tool: paypal_create_payment ────────────────────────

const paypalCreatePayment: ToolHandler = {
  description:
    'Create a PayPal payment order. Specify the amount, currency, and intent. Returns an order ID and approval URL.',
  inputSchema: {
    type: 'object',
    properties: {
      amount: {
        type: 'string',
        description: 'Payment amount as a string (e.g. "50.00")',
      },
      currency: {
        type: 'string',
        description: 'Currency code (e.g. "USD", "EUR"). Default: USD',
      },
      intent: {
        type: 'string',
        enum: ['CAPTURE', 'AUTHORIZE'],
        description: 'Payment intent (default: CAPTURE)',
      },
      description: {
        type: 'string',
        description: 'Payment description',
      },
      return_url: {
        type: 'string',
        description: 'URL to redirect to after payment approval',
      },
      cancel_url: {
        type: 'string',
        description: 'URL to redirect to if payment is cancelled',
      },
    },
    required: ['amount'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = ppBaseUrl(ctx);
      const body: Record<string, any> = {
        intent: params.intent ?? 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: params.currency ?? 'USD',
              value: params.amount,
            },
            description: params.description,
          },
        ],
      };

      if (params.return_url || params.cancel_url) {
        body.application_context = {
          return_url: params.return_url,
          cancel_url: params.cancel_url,
        };
      }

      const order = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v2/checkout/orders`,
        body,
      });

      const approveLink = (order.links ?? []).find((l: any) => l.rel === 'approve');
      const approveUrl = approveLink?.href ?? 'N/A';

      return {
        content: `Order created: ${order.id} — Status: ${order.status}\nApproval URL: ${approveUrl}`,
        metadata: {
          orderId: order.id,
          status: order.status,
          approveUrl,
        },
      };
    } catch (err) {
      return paypalError(err);
    }
  },
};

// ─── Tool: paypal_get_order ─────────────────────────────

const paypalGetOrder: ToolHandler = {
  description:
    'Retrieve details of a PayPal order by its ID. Returns order status, amounts, and payer information.',
  inputSchema: {
    type: 'object',
    properties: {
      order_id: {
        type: 'string',
        description: 'PayPal order ID',
      },
    },
    required: ['order_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = ppBaseUrl(ctx);
      const order = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/v2/checkout/orders/${params.order_id}`,
      });

      const unit = order.purchase_units?.[0] ?? {};
      const amount = unit.amount
        ? formatAmount(unit.amount.value, unit.amount.currency_code)
        : 'N/A';
      const payer = order.payer?.email_address ?? 'unknown';
      const created = formatDate(order.create_time);

      const content = [
        `Order: ${order.id}`,
        `Status: ${order.status}`,
        `Amount: ${amount}`,
        `Payer: ${payer}`,
        `Created: ${created}`,
        `Intent: ${order.intent}`,
      ].join('\n');

      return {
        content,
        metadata: {
          orderId: order.id,
          status: order.status,
          amount: unit.amount?.value,
          currency: unit.amount?.currency_code,
        },
      };
    } catch (err) {
      return paypalError(err);
    }
  },
};

// ─── Tool: paypal_create_payout ─────────────────────────

const paypalCreatePayout: ToolHandler = {
  description:
    'Create a PayPal batch payout to send money to one or more recipients via email.',
  inputSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Payout items — each specifies a recipient email and amount',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Recipient PayPal email' },
            amount: { type: 'string', description: 'Payout amount (e.g. "25.00")' },
            currency: { type: 'string', description: 'Currency code (default USD)' },
            note: { type: 'string', description: 'Note to recipient' },
          },
          required: ['email', 'amount'],
        },
        minItems: 1,
      },
      email_subject: {
        type: 'string',
        description: 'Email subject line for the payout notification',
      },
    },
    required: ['items'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = ppBaseUrl(ctx);
      const senderBatchId = `batch_${Date.now()}`;

      const items = params.items.map((item: any, i: number) => ({
        recipient_type: 'EMAIL',
        amount: {
          value: item.amount,
          currency: item.currency ?? 'USD',
        },
        receiver: item.email,
        note: item.note ?? '',
        sender_item_id: `item_${i}_${Date.now()}`,
      }));

      const body = {
        sender_batch_header: {
          sender_batch_id: senderBatchId,
          email_subject: params.email_subject ?? 'You have a payment',
          email_message: 'You received a payout.',
        },
        items,
      };

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v1/payments/payouts`,
        body,
      });

      const batchHeader = data.batch_header ?? {};
      return {
        content: `Payout batch created: ${batchHeader.payout_batch_id ?? senderBatchId} — Status: ${batchHeader.batch_status ?? 'PENDING'} — ${items.length} recipient(s)`,
        metadata: {
          payoutBatchId: batchHeader.payout_batch_id,
          batchStatus: batchHeader.batch_status,
          recipientCount: items.length,
        },
      };
    } catch (err) {
      return paypalError(err);
    }
  },
};

// ─── Tool: paypal_list_disputes ─────────────────────────

const paypalListDisputes: ToolHandler = {
  description:
    'List PayPal payment disputes. Optionally filter by status or date range. Returns dispute IDs, reasons, and amounts.',
  inputSchema: {
    type: 'object',
    properties: {
      dispute_state: {
        type: 'string',
        enum: ['OPEN', 'WAITING_FOR_BUYER_RESPONSE', 'WAITING_FOR_SELLER_RESPONSE', 'UNDER_REVIEW', 'RESOLVED'],
        description: 'Filter by dispute state',
      },
      start_time: {
        type: 'string',
        description: 'Filter disputes created after this time (ISO 8601)',
      },
      page_size: {
        type: 'number',
        description: 'Results per page (default 10, max 50)',
      },
      next_page_token: {
        type: 'string',
        description: 'Pagination token for the next page',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = ppBaseUrl(ctx);
      const query: Record<string, string> = {
        page_size: String(params.page_size ?? 10),
      };
      if (params.dispute_state) query.dispute_state = params.dispute_state;
      if (params.start_time) query.start_time = params.start_time;
      if (params.next_page_token) query.next_page_token = params.next_page_token;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/v1/customer/disputes`,
        query,
      });

      const disputes: any[] = data.items ?? [];
      if (disputes.length === 0) {
        return { content: 'No disputes found.', metadata: { disputeCount: 0 } };
      }

      const lines = disputes.map((d: any) => {
        const amount = d.dispute_amount
          ? formatAmount(d.dispute_amount.value, d.dispute_amount.currency_code)
          : 'N/A';
        const reason = d.reason ?? 'unknown';
        const status = d.status ?? 'unknown';
        const created = formatDate(d.create_time);
        return `  - ${d.dispute_id} — ${amount} — ${reason} — ${status} — ${created}`;
      });

      return {
        content: `Found ${disputes.length} dispute(s):\n\n${lines.join('\n')}`,
        metadata: { disputeCount: disputes.length },
      };
    } catch (err) {
      return paypalError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const paypalAdapter: SkillAdapter = {
  skillId: 'paypal',
  name: 'PayPal',
  baseUrl: 'https://api-m.paypal.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'paypal',
  },
  tools: {
    paypal_list_transactions: paypalListTransactions,
    paypal_create_payment: paypalCreatePayment,
    paypal_get_order: paypalGetOrder,
    paypal_create_payout: paypalCreatePayout,
    paypal_list_disputes: paypalListDisputes,
  },
  configSchema: {
    sandbox: {
      type: 'boolean' as const,
      label: 'Sandbox Mode',
      description: 'Use PayPal sandbox environment for testing',
      default: false,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
