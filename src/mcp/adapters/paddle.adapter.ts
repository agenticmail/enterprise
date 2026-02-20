/**
 * MCP Skill Adapter — Paddle
 *
 * Maps Paddle Billing API endpoints to MCP tool handlers.
 * API reference: https://developer.paddle.com/api-reference/overview
 *
 * Paddle uses Bearer token authentication.
 * Sandbox base URL: https://sandbox-api.paddle.com
 * Production base URL: https://api.paddle.com
 *
 * Tools:
 *   - paddle_list_products        List products
 *   - paddle_list_prices          List prices for products
 *   - paddle_list_subscriptions   List subscriptions
 *   - paddle_list_transactions    List transactions
 *   - paddle_list_customers       List customers
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Paddle API base URL, supporting sandbox mode. */
function paddleBaseUrl(ctx: ToolExecutionContext): string {
  const sandbox = ctx.skillConfig.sandbox === true;
  return sandbox
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com';
}

function paddleError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errObj = data.error ?? {};
      const msg = errObj.detail ?? errObj.message ?? data.message ?? err.message;
      const code = errObj.code ?? '';
      return { content: `Paddle API error: ${code ? code + ' — ' : ''}${msg}`, isError: true };
    }
    return { content: `Paddle API error: ${err.message}`, isError: true };
  }
  return { content: `Paddle API error: ${String(err)}`, isError: true };
}

/** Format a Paddle Money object. */
function formatMoney(money: any): string {
  if (!money || money.amount === undefined) return 'N/A';
  const amount = money.amount;
  const currency = money.currency_code ?? 'USD';
  return `${amount} ${currency}`;
}

/** Format a date string. */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tool: paddle_list_products ─────────────────────────

const paddleListProducts: ToolHandler = {
  description:
    'List products in Paddle. Optionally filter by status or tax category. Returns product names, IDs, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by product status',
      },
      tax_category: {
        type: 'string',
        description: 'Filter by tax category',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor — return results after this ID',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 200)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = paddleBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.status) query['status'] = params.status;
      if (params.tax_category) query['tax_category'] = params.tax_category;
      if (params.after) query['after'] = params.after;
      if (params.per_page) query['per_page'] = String(params.per_page);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/products`,
        query,
      });

      const products: any[] = data.data ?? [];
      if (products.length === 0) {
        return { content: 'No products found.', metadata: { productCount: 0 } };
      }

      const lines = products.map((p: any) => {
        const status = p.status ?? 'unknown';
        const taxCategory = p.tax_category ?? 'N/A';
        const created = formatDate(p.created_at);
        return `  - ${p.name} (ID: ${p.id}) — ${status} — tax: ${taxCategory} — created: ${created}`;
      });

      return {
        content: `Found ${products.length} product(s):\n\n${lines.join('\n')}`,
        metadata: {
          productCount: products.length,
          hasMore: data.meta?.has_more ?? false,
        },
      };
    } catch (err) {
      return paddleError(err);
    }
  },
};

// ─── Tool: paddle_list_prices ───────────────────────────

const paddleListPrices: ToolHandler = {
  description:
    'List prices in Paddle. Optionally filter by product or status. Returns price amounts, intervals, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: {
        type: 'string',
        description: 'Filter prices by product ID',
      },
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by price status',
      },
      recurring: {
        type: 'boolean',
        description: 'Filter by recurring (true) or one-time (false)',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor — return results after this ID',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 200)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = paddleBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.product_id) query['product_id'] = params.product_id;
      if (params.status) query['status'] = params.status;
      if (params.recurring !== undefined) query['recurring'] = String(params.recurring);
      if (params.after) query['after'] = params.after;
      if (params.per_page) query['per_page'] = String(params.per_page);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/prices`,
        query,
      });

      const prices: any[] = data.data ?? [];
      if (prices.length === 0) {
        return { content: 'No prices found.', metadata: { priceCount: 0 } };
      }

      const lines = prices.map((p: any) => {
        const amount = formatMoney(p.unit_price);
        const interval = p.billing_cycle
          ? `${p.billing_cycle.frequency}x ${p.billing_cycle.interval}`
          : 'one-time';
        const status = p.status ?? 'unknown';
        const productId = p.product_id ?? 'N/A';
        return `  - ${p.description ?? p.id} (ID: ${p.id}) — ${amount} — ${interval} — ${status} — product: ${productId}`;
      });

      return {
        content: `Found ${prices.length} price(s):\n\n${lines.join('\n')}`,
        metadata: {
          priceCount: prices.length,
          hasMore: data.meta?.has_more ?? false,
        },
      };
    } catch (err) {
      return paddleError(err);
    }
  },
};

// ─── Tool: paddle_list_subscriptions ────────────────────

const paddleListSubscriptions: ToolHandler = {
  description:
    'List subscriptions in Paddle. Optionally filter by status or customer. Returns subscription IDs, statuses, and pricing.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'canceled', 'past_due', 'paused', 'trialing'],
        description: 'Filter by subscription status',
      },
      customer_id: {
        type: 'string',
        description: 'Filter by customer ID',
      },
      price_id: {
        type: 'string',
        description: 'Filter by price ID',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor — return results after this ID',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 200)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = paddleBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.status) query['status'] = params.status;
      if (params.customer_id) query['customer_id'] = params.customer_id;
      if (params.price_id) query['price_id'] = params.price_id;
      if (params.after) query['after'] = params.after;
      if (params.per_page) query['per_page'] = String(params.per_page);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/subscriptions`,
        query,
      });

      const subscriptions: any[] = data.data ?? [];
      if (subscriptions.length === 0) {
        return { content: 'No subscriptions found.', metadata: { subscriptionCount: 0 } };
      }

      const lines = subscriptions.map((sub: any) => {
        const status = sub.status ?? 'unknown';
        const customerId = sub.customer_id ?? 'N/A';
        const nextBilled = formatDate(sub.next_billed_at);
        const items = sub.items ?? [];
        const priceInfo = items.length > 0
          ? formatMoney(items[0].price?.unit_price)
          : 'N/A';
        return `  - ${sub.id} — ${status} — ${priceInfo} — customer: ${customerId} — next billed: ${nextBilled}`;
      });

      return {
        content: `Found ${subscriptions.length} subscription(s):\n\n${lines.join('\n')}`,
        metadata: {
          subscriptionCount: subscriptions.length,
          hasMore: data.meta?.has_more ?? false,
        },
      };
    } catch (err) {
      return paddleError(err);
    }
  },
};

// ─── Tool: paddle_list_transactions ─────────────────────

const paddleListTransactions: ToolHandler = {
  description:
    'List transactions in Paddle. Optionally filter by status or subscription. Returns transaction IDs, amounts, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['draft', 'ready', 'billed', 'paid', 'completed', 'canceled', 'past_due'],
        description: 'Filter by transaction status',
      },
      subscription_id: {
        type: 'string',
        description: 'Filter by subscription ID',
      },
      customer_id: {
        type: 'string',
        description: 'Filter by customer ID',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor — return results after this ID',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 200)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = paddleBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.status) query['status'] = params.status;
      if (params.subscription_id) query['subscription_id'] = params.subscription_id;
      if (params.customer_id) query['customer_id'] = params.customer_id;
      if (params.after) query['after'] = params.after;
      if (params.per_page) query['per_page'] = String(params.per_page);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/transactions`,
        query,
      });

      const transactions: any[] = data.data ?? [];
      if (transactions.length === 0) {
        return { content: 'No transactions found.', metadata: { transactionCount: 0 } };
      }

      const lines = transactions.map((tx: any) => {
        const status = tx.status ?? 'unknown';
        const total = tx.details?.totals?.grand_total
          ? `${tx.details.totals.grand_total} ${tx.currency_code ?? ''}`
          : 'N/A';
        const created = formatDate(tx.created_at);
        const customerId = tx.customer_id ?? 'N/A';
        return `  - ${tx.id} — ${total} — ${status} — ${created} — customer: ${customerId}`;
      });

      return {
        content: `Found ${transactions.length} transaction(s):\n\n${lines.join('\n')}`,
        metadata: {
          transactionCount: transactions.length,
          hasMore: data.meta?.has_more ?? false,
        },
      };
    } catch (err) {
      return paddleError(err);
    }
  },
};

// ─── Tool: paddle_list_customers ────────────────────────

const paddleListCustomers: ToolHandler = {
  description:
    'List customers in Paddle. Optionally filter by email or status. Returns customer names, emails, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Filter by exact email address',
      },
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by customer status',
      },
      after: {
        type: 'string',
        description: 'Pagination cursor — return results after this ID',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 200)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = paddleBaseUrl(ctx);
      const query: Record<string, string> = {};
      if (params.email) query['email'] = params.email;
      if (params.status) query['status'] = params.status;
      if (params.after) query['after'] = params.after;
      if (params.per_page) query['per_page'] = String(params.per_page);

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/customers`,
        query,
      });

      const customers: any[] = data.data ?? [];
      if (customers.length === 0) {
        return { content: 'No customers found.', metadata: { customerCount: 0 } };
      }

      const lines = customers.map((c: any) => {
        const name = c.name ?? '(unnamed)';
        const email = c.email ?? 'no email';
        const status = c.status ?? 'unknown';
        const created = formatDate(c.created_at);
        return `  - ${name} (ID: ${c.id}) — ${email} — ${status} — created: ${created}`;
      });

      return {
        content: `Found ${customers.length} customer(s):\n\n${lines.join('\n')}`,
        metadata: {
          customerCount: customers.length,
          hasMore: data.meta?.has_more ?? false,
        },
      };
    } catch (err) {
      return paddleError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const paddleAdapter: SkillAdapter = {
  skillId: 'paddle',
  name: 'Paddle',
  baseUrl: 'https://api.paddle.com',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    paddle_list_products: paddleListProducts,
    paddle_list_prices: paddleListPrices,
    paddle_list_subscriptions: paddleListSubscriptions,
    paddle_list_transactions: paddleListTransactions,
    paddle_list_customers: paddleListCustomers,
  },
  configSchema: {
    sandbox: {
      type: 'boolean' as const,
      label: 'Sandbox Mode',
      description: 'Use Paddle sandbox environment for testing',
      default: false,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
