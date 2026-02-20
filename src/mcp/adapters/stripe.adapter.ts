/**
 * MCP Skill Adapter — Stripe
 *
 * Maps Stripe REST API endpoints to MCP tool handlers.
 * API reference: https://stripe.com/docs/api
 *
 * Important: Stripe uses application/x-www-form-urlencoded for POST bodies.
 * We use ctx.apiExecutor.request({ formEncoded: true }) for all write operations.
 *
 * Tools:
 *   - stripe_list_customers      List customers with optional email filter
 *   - stripe_create_customer     Create a new customer
 *   - stripe_create_invoice      Create a draft invoice for a customer
 *   - stripe_list_subscriptions  List subscriptions with optional filters
 *   - stripe_create_payment_link Create a payment link for one or more line items
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Format a Stripe amount (in cents) as a currency string. */
function formatAmount(amountCents: number | undefined, currency: string | undefined): string {
  if (amountCents === undefined || amountCents === null) return 'N/A';
  const cur = (currency ?? 'usd').toUpperCase();
  const amount = (amountCents / 100).toFixed(2);
  return `${amount} ${cur}`;
}

/** Format a Unix timestamp into a readable date. */
function fromUnix(ts: number | undefined): string {
  if (!ts) return 'unknown';
  return new Date(ts * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Flatten line_items array into Stripe's form-encoded nested param format.
 * e.g. [{ price: "price_xxx", quantity: 1 }] becomes:
 *   { "line_items[0][price]": "price_xxx", "line_items[0][quantity]": "1" }
 */
function flattenLineItems(items: Array<{ price: string; quantity: number }>): Record<string, string> {
  const result: Record<string, string> = {};
  items.forEach((item, i) => {
    result[`line_items[${i}][price]`] = item.price;
    result[`line_items[${i}][quantity]`] = String(item.quantity);
  });
  return result;
}

// ─── Tool Handlers ──────────────────────────────────────

const stripeListCustomers: ToolHandler = {
  description:
    'List Stripe customers, optionally filtered by email. Returns customer names, IDs, and balances.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max customers to return (default 10, max 100)',
      },
      email: {
        type: 'string',
        description: 'Filter by exact email address',
      },
      starting_after: {
        type: 'string',
        description: 'Cursor for pagination — customer ID to start after',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const query: Record<string, string> = {
      limit: String(params.limit ?? 10),
    };
    if (params.email) query.email = params.email;
    if (params.starting_after) query.starting_after = params.starting_after;

    const data = await ctx.apiExecutor.get('/v1/customers', query);

    const customers: any[] = data.data ?? [];
    if (customers.length === 0) {
      return {
        content: 'No customers found.',
        metadata: { customerCount: 0, hasMore: false },
      };
    }

    const lines = customers.map((c: any) => {
      const label = c.name || c.email || '(no name)';
      const balance = formatAmount(c.balance, c.currency);
      return `\u2022 ${label} (ID: ${c.id}) \u2014 balance: ${balance}`;
    });

    return {
      content: `${customers.length} customer(s):\n\n${lines.join('\n')}`,
      metadata: {
        customerCount: customers.length,
        hasMore: data.has_more ?? false,
      },
    };
  },
};

const stripeCreateCustomer: ToolHandler = {
  description:
    'Create a new Stripe customer with an email and optional name, description, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Customer email address',
      },
      name: {
        type: 'string',
        description: 'Customer full name',
      },
      description: {
        type: 'string',
        description: 'Internal description for this customer',
      },
      metadata: {
        type: 'object',
        description: 'Key-value metadata pairs to attach to the customer',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['email'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const body: Record<string, any> = { email: params.email };
    if (params.name) body.name = params.name;
    if (params.description) body.description = params.description;
    if (params.metadata) body.metadata = params.metadata;

    const customer = await ctx.apiExecutor.request({
      method: 'POST',
      path: '/v1/customers',
      body,
      formEncoded: true,
    });

    const displayName = customer.name || customer.email;
    return {
      content: `Customer created: ${displayName} (${customer.id}) \u2014 ${customer.email}`,
      metadata: {
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
      },
    };
  },
};

const stripeCreateInvoice: ToolHandler = {
  description:
    'Create a draft invoice for an existing Stripe customer. The invoice can be finalized and sent later.',
  inputSchema: {
    type: 'object',
    properties: {
      customer: {
        type: 'string',
        description: 'Stripe customer ID (e.g. cus_xxxxx)',
      },
      description: {
        type: 'string',
        description: 'Invoice description / memo',
      },
      auto_advance: {
        type: 'boolean',
        description:
          'Whether the invoice should auto-finalize and attempt payment (default true)',
      },
      collection_method: {
        type: 'string',
        enum: ['charge_automatically', 'send_invoice'],
        description: 'How to collect payment (default: charge_automatically)',
      },
    },
    required: ['customer'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const body: Record<string, any> = {
      customer: params.customer,
      auto_advance: params.auto_advance ?? true,
      collection_method: params.collection_method ?? 'charge_automatically',
    };
    if (params.description) body.description = params.description;

    // send_invoice requires days_until_due
    if (body.collection_method === 'send_invoice' && !body.days_until_due) {
      body.days_until_due = 30;
    }

    const invoice = await ctx.apiExecutor.request({
      method: 'POST',
      path: '/v1/invoices',
      body,
      formEncoded: true,
    });

    return {
      content: `Invoice ${invoice.id} created for customer ${invoice.customer} \u2014 status: ${invoice.status}`,
      metadata: {
        invoiceId: invoice.id,
        customerId: invoice.customer,
        status: invoice.status,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
      },
    };
  },
};

const stripeListSubscriptions: ToolHandler = {
  description:
    'List Stripe subscriptions, optionally filtered by customer or status.',
  inputSchema: {
    type: 'object',
    properties: {
      customer: {
        type: 'string',
        description: 'Filter by customer ID',
      },
      status: {
        type: 'string',
        enum: ['active', 'past_due', 'canceled', 'all'],
        description: 'Filter by subscription status (default: active)',
      },
      limit: {
        type: 'number',
        description: 'Max subscriptions to return (default 10, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const query: Record<string, string> = {
      limit: String(params.limit ?? 10),
      status: params.status ?? 'active',
    };
    if (params.customer) query.customer = params.customer;

    const data = await ctx.apiExecutor.get('/v1/subscriptions', query);

    const subscriptions: any[] = data.data ?? [];
    if (subscriptions.length === 0) {
      return {
        content: 'No subscriptions found.',
        metadata: { subscriptionCount: 0, hasMore: false },
      };
    }

    const lines = subscriptions.map((sub: any) => {
      const status = sub.status ?? 'unknown';

      // Extract pricing from the first item in the subscription
      let pricing = 'N/A';
      const items: any[] = sub.items?.data ?? [];
      if (items.length > 0) {
        const plan = items[0].plan ?? items[0].price;
        if (plan) {
          const amount = formatAmount(plan.amount ?? plan.unit_amount, plan.currency);
          const interval = plan.interval ?? 'period';
          pricing = `${amount}/${interval}`;
        }
      }

      return `\u2022 ${sub.id} \u2014 ${status} \u2014 ${pricing} \u2014 customer: ${sub.customer}`;
    });

    return {
      content: `${subscriptions.length} subscription(s):\n\n${lines.join('\n')}`,
      metadata: {
        subscriptionCount: subscriptions.length,
        hasMore: data.has_more ?? false,
      },
    };
  },
};

const stripeCreatePaymentLink: ToolHandler = {
  description:
    'Create a Stripe payment link for one or more priced line items. Returns a shareable URL.',
  inputSchema: {
    type: 'object',
    properties: {
      line_items: {
        type: 'array',
        description: 'Array of line items, each with a Stripe price ID and quantity',
        items: {
          type: 'object',
          properties: {
            price: {
              type: 'string',
              description: 'Stripe price ID (e.g. price_xxxxx)',
            },
            quantity: {
              type: 'number',
              description: 'Quantity (must be >= 1)',
            },
          },
          required: ['price', 'quantity'],
        },
        minItems: 1,
      },
    },
    required: ['line_items'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const { line_items } = params;

    if (!Array.isArray(line_items) || line_items.length === 0) {
      return {
        content: 'Error: line_items must be a non-empty array of { price, quantity } objects.',
        isError: true,
      };
    }

    // Build the form body with Stripe's nested array syntax
    const formBody = flattenLineItems(line_items);

    const paymentLink = await ctx.apiExecutor.request({
      method: 'POST',
      path: '/v1/payment_links',
      body: formBody,
      formEncoded: true,
    });

    return {
      content: `Payment link created: ${paymentLink.url}`,
      metadata: {
        paymentLinkId: paymentLink.id,
        url: paymentLink.url,
        active: paymentLink.active,
        lineItemCount: line_items.length,
      },
    };
  },
};

// ─── Adapter ────────────────────────────────────────────

export const stripeAdapter: SkillAdapter = {
  skillId: 'stripe',
  name: 'Stripe',
  baseUrl: 'https://api.stripe.com',
  auth: {
    type: 'api_key',
    headerPrefix: 'Bearer',
  },
  tools: {
    stripe_list_customers: stripeListCustomers,
    stripe_create_customer: stripeCreateCustomer,
    stripe_create_invoice: stripeCreateInvoice,
    stripe_list_subscriptions: stripeListSubscriptions,
    stripe_create_payment_link: stripeCreatePaymentLink,
  },
  rateLimits: { requestsPerSecond: 25, burstLimit: 50 },
};
