/**
 * MCP Skill Adapter — Chargebee
 *
 * Maps Chargebee API v2 endpoints to MCP tool handlers.
 * API reference: https://apidocs.chargebee.com/docs/api/
 *
 * Chargebee uses Basic auth with the API key as the username and empty password.
 * The site name is configured via ctx.skillConfig.site.
 * Base URL pattern: https://{site}.chargebee.com/api/v2
 *
 * Tools:
 *   - chargebee_list_subscriptions   List subscriptions
 *   - chargebee_create_subscription  Create a new subscription
 *   - chargebee_list_customers       List customers
 *   - chargebee_list_invoices        List invoices
 *   - chargebee_cancel_subscription  Cancel a subscription
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Chargebee base URL from the configured site. */
function cbBaseUrl(ctx: ToolExecutionContext): string {
  const site = ctx.skillConfig.site;
  if (!site) throw new Error('Chargebee site is not configured. Set skillConfig.site.');
  return `https://${site}.chargebee.com/api/v2`;
}

function chargebeeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message ?? data.error_msg ?? err.message;
      const code = data.error_code ?? data.api_error_code ?? '';
      return { content: `Chargebee API error: ${code ? code + ' — ' : ''}${msg}`, isError: true };
    }
    return { content: `Chargebee API error: ${err.message}`, isError: true };
  }
  return { content: `Chargebee API error: ${String(err)}`, isError: true };
}

/** Format a Chargebee amount (in cents). */
function formatAmount(amountCents: number | undefined, currency: string = 'USD'): string {
  if (amountCents === undefined || amountCents === null) return 'N/A';
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

/** Format a Unix timestamp. */
function fromUnix(ts: number | undefined): string {
  if (!ts) return 'unknown';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tool: chargebee_list_subscriptions ─────────────────

const chargebeeListSubscriptions: ToolHandler = {
  description:
    'List Chargebee subscriptions. Optionally filter by status, customer, or plan. Returns subscription IDs, plans, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'in_trial', 'non_renewing', 'paused', 'cancelled'],
        description: 'Filter by subscription status',
      },
      customer_id: {
        type: 'string',
        description: 'Filter by customer ID',
      },
      plan_id: {
        type: 'string',
        description: 'Filter by plan ID',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 100)',
      },
      offset: {
        type: 'string',
        description: 'Pagination offset from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = cbBaseUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.status) query['status[is]'] = params.status;
      if (params.customer_id) query['customer_id[is]'] = params.customer_id;
      if (params.plan_id) query['plan_id[is]'] = params.plan_id;
      if (params.offset) query.offset = params.offset;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/subscriptions`,
        query,
      });

      const items: any[] = data.list ?? [];
      if (items.length === 0) {
        return { content: 'No subscriptions found.', metadata: { subscriptionCount: 0 } };
      }

      const lines = items.map((entry: any) => {
        const sub = entry.subscription ?? {};
        const plan = sub.plan_id ?? 'unknown plan';
        const status = sub.status ?? 'unknown';
        const amount = formatAmount(sub.plan_amount, sub.currency_code);
        const nextBilling = fromUnix(sub.next_billing_at);
        const customerId = sub.customer_id ?? 'unknown';
        return `  - ${sub.id} — ${plan} — ${status} — ${amount} — next billing: ${nextBilling} — customer: ${customerId}`;
      });

      return {
        content: `Found ${items.length} subscription(s):\n\n${lines.join('\n')}`,
        metadata: {
          subscriptionCount: items.length,
          nextOffset: data.next_offset,
        },
      };
    } catch (err) {
      return chargebeeError(err);
    }
  },
};

// ─── Tool: chargebee_create_subscription ────────────────

const chargebeeCreateSubscription: ToolHandler = {
  description:
    'Create a new subscription in Chargebee. Specify a plan and customer details.',
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: {
        type: 'string',
        description: 'Chargebee plan ID to subscribe to',
      },
      customer_id: {
        type: 'string',
        description: 'Existing Chargebee customer ID (if omitted, provide customer details)',
      },
      customer_email: {
        type: 'string',
        description: 'Customer email (used if creating a new customer)',
      },
      customer_first_name: {
        type: 'string',
        description: 'Customer first name',
      },
      customer_last_name: {
        type: 'string',
        description: 'Customer last name',
      },
      plan_quantity: {
        type: 'number',
        description: 'Plan quantity (default 1)',
      },
      trial_end: {
        type: 'number',
        description: 'Trial end date as Unix timestamp (optional)',
      },
    },
    required: ['plan_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = cbBaseUrl(ctx);
      const body: Record<string, any> = {
        plan_id: params.plan_id,
      };
      if (params.customer_id) body.customer_id = params.customer_id;
      if (params.customer_email) body['customer[email]'] = params.customer_email;
      if (params.customer_first_name) body['customer[first_name]'] = params.customer_first_name;
      if (params.customer_last_name) body['customer[last_name]'] = params.customer_last_name;
      if (params.plan_quantity) body.plan_quantity = params.plan_quantity;
      if (params.trial_end) body.trial_end = params.trial_end;

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/subscriptions`,
        body,
        formEncoded: true,
      });

      const sub = data.subscription ?? {};
      const customer = data.customer ?? {};
      return {
        content: `Subscription created: ${sub.id} — plan: ${sub.plan_id} — status: ${sub.status} — customer: ${customer.email ?? customer.id}`,
        metadata: {
          subscriptionId: sub.id,
          planId: sub.plan_id,
          status: sub.status,
          customerId: customer.id,
        },
      };
    } catch (err) {
      return chargebeeError(err);
    }
  },
};

// ─── Tool: chargebee_list_customers ─────────────────────

const chargebeeListCustomers: ToolHandler = {
  description:
    'List customers in Chargebee. Optionally filter by email or name. Returns customer names, emails, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Filter by exact email address',
      },
      first_name: {
        type: 'string',
        description: 'Filter by first name (exact match)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 100)',
      },
      offset: {
        type: 'string',
        description: 'Pagination offset from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = cbBaseUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.email) query['email[is]'] = params.email;
      if (params.first_name) query['first_name[is]'] = params.first_name;
      if (params.offset) query.offset = params.offset;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/customers`,
        query,
      });

      const items: any[] = data.list ?? [];
      if (items.length === 0) {
        return { content: 'No customers found.', metadata: { customerCount: 0 } };
      }

      const lines = items.map((entry: any) => {
        const c = entry.customer ?? {};
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)';
        const email = c.email ?? 'no email';
        const created = fromUnix(c.created_at);
        return `  - ${name} (ID: ${c.id}) — ${email} — created: ${created}`;
      });

      return {
        content: `Found ${items.length} customer(s):\n\n${lines.join('\n')}`,
        metadata: {
          customerCount: items.length,
          nextOffset: data.next_offset,
        },
      };
    } catch (err) {
      return chargebeeError(err);
    }
  },
};

// ─── Tool: chargebee_list_invoices ──────────────────────

const chargebeeListInvoices: ToolHandler = {
  description:
    'List invoices in Chargebee. Optionally filter by status or customer. Returns invoice IDs, amounts, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['paid', 'posted', 'payment_due', 'not_paid', 'voided', 'pending'],
        description: 'Filter by invoice status',
      },
      customer_id: {
        type: 'string',
        description: 'Filter by customer ID',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 100)',
      },
      offset: {
        type: 'string',
        description: 'Pagination offset from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = cbBaseUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.status) query['status[is]'] = params.status;
      if (params.customer_id) query['customer_id[is]'] = params.customer_id;
      if (params.offset) query.offset = params.offset;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/invoices`,
        query,
      });

      const items: any[] = data.list ?? [];
      if (items.length === 0) {
        return { content: 'No invoices found.', metadata: { invoiceCount: 0 } };
      }

      const lines = items.map((entry: any) => {
        const inv = entry.invoice ?? {};
        const amount = formatAmount(inv.total, inv.currency_code);
        const status = inv.status ?? 'unknown';
        const date = fromUnix(inv.date);
        const customerId = inv.customer_id ?? 'unknown';
        return `  - ${inv.id} — ${amount} — ${status} — ${date} — customer: ${customerId}`;
      });

      return {
        content: `Found ${items.length} invoice(s):\n\n${lines.join('\n')}`,
        metadata: {
          invoiceCount: items.length,
          nextOffset: data.next_offset,
        },
      };
    } catch (err) {
      return chargebeeError(err);
    }
  },
};

// ─── Tool: chargebee_cancel_subscription ────────────────

const chargebeeCancelSubscription: ToolHandler = {
  description:
    'Cancel a Chargebee subscription. Choose to cancel immediately or at the end of the current term.',
  inputSchema: {
    type: 'object',
    properties: {
      subscription_id: {
        type: 'string',
        description: 'Chargebee subscription ID to cancel',
      },
      end_of_term: {
        type: 'boolean',
        description: 'If true, cancel at end of current billing term. If false, cancel immediately. Default: true.',
      },
      cancel_reason_code: {
        type: 'string',
        description: 'Reason code for cancellation (optional)',
      },
    },
    required: ['subscription_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = cbBaseUrl(ctx);
      const endOfTerm = params.end_of_term !== false;

      const body: Record<string, any> = {
        end_of_term: endOfTerm,
      };
      if (params.cancel_reason_code) body.cancel_reason_code = params.cancel_reason_code;

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/subscriptions/${params.subscription_id}/cancel`,
        body,
        formEncoded: true,
      });

      const sub = data.subscription ?? {};
      const cancelAt = endOfTerm ? fromUnix(sub.current_term_end) : 'immediately';
      return {
        content: `Subscription ${sub.id} cancelled — status: ${sub.status} — cancels: ${cancelAt}`,
        metadata: {
          subscriptionId: sub.id,
          status: sub.status,
          endOfTerm,
        },
      };
    } catch (err) {
      return chargebeeError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const chargebeeAdapter: SkillAdapter = {
  skillId: 'chargebee',
  name: 'Chargebee',
  baseUrl: 'https://SITE.chargebee.com/api/v2',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    chargebee_list_subscriptions: chargebeeListSubscriptions,
    chargebee_create_subscription: chargebeeCreateSubscription,
    chargebee_list_customers: chargebeeListCustomers,
    chargebee_list_invoices: chargebeeListInvoices,
    chargebee_cancel_subscription: chargebeeCancelSubscription,
  },
  configSchema: {
    site: {
      type: 'string' as const,
      label: 'Chargebee Site',
      description: 'Your Chargebee site name (e.g. "mycompany" for mycompany.chargebee.com)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
