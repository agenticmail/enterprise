/**
 * MCP Skill Adapter — Recurly
 *
 * Maps Recurly REST API v3 endpoints to MCP tool handlers.
 * API reference: https://developers.recurly.com/api/v2021-02-25/
 *
 * Recurly uses Basic auth with the API key as the username and empty password.
 * All requests include Accept: application/vnd.recurly.v2021-02-25+json.
 *
 * Tools:
 *   - recurly_list_accounts        List accounts (customers)
 *   - recurly_list_subscriptions   List subscriptions
 *   - recurly_list_invoices        List invoices
 *   - recurly_get_account          Get a single account by ID
 *   - recurly_list_plans           List subscription plans
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Standard Recurly headers. */
const RECURLY_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.recurly.v2021-02-25+json',
  'Content-Type': 'application/json',
};

function recurlyError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errObj = data.error ?? data;
      const msg = errObj.message ?? errObj.type ?? err.message;
      return { content: `Recurly API error: ${msg}`, isError: true };
    }
    return { content: `Recurly API error: ${err.message}`, isError: true };
  }
  return { content: `Recurly API error: ${String(err)}`, isError: true };
}

/** Format a monetary amount (Recurly uses float amounts). */
function formatAmount(amount: number | undefined, currency: string = 'USD'): string {
  if (amount === undefined || amount === null) return 'N/A';
  return `${amount.toFixed(2)} ${currency}`;
}

/** Format a date string. */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tool: recurly_list_accounts ────────────────────────

const recurlyListAccounts: ToolHandler = {
  description:
    'List accounts (customers) in Recurly. Optionally filter by state or email. Returns account codes, emails, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['active', 'closed', 'past_due'],
        description: 'Filter by account state',
      },
      email: {
        type: 'string',
        description: 'Filter by email address',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 200)',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: desc)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        order: params.order ?? 'desc',
      };
      if (params.state) query.state = params.state;
      if (params.email) query.email = params.email;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/accounts',
        query,
        headers: RECURLY_HEADERS,
      });

      const accounts: any[] = data.data ?? [];
      if (accounts.length === 0) {
        return { content: 'No accounts found.', metadata: { accountCount: 0 } };
      }

      const lines = accounts.map((acct: any) => {
        const name = [acct.first_name, acct.last_name].filter(Boolean).join(' ') || acct.company || '(unnamed)';
        const email = acct.email ?? 'no email';
        const state = acct.state ?? 'unknown';
        const created = formatDate(acct.created_at);
        return `  - ${name} (code: ${acct.code}, ID: ${acct.id}) — ${email} — ${state} — ${created}`;
      });

      return {
        content: `Found ${accounts.length} account(s):\n\n${lines.join('\n')}`,
        metadata: {
          accountCount: accounts.length,
          hasMore: data.has_more ?? false,
        },
      };
    } catch (err) {
      return recurlyError(err);
    }
  },
};

// ─── Tool: recurly_list_subscriptions ───────────────────

const recurlyListSubscriptions: ToolHandler = {
  description:
    'List subscriptions in Recurly. Optionally filter by state or plan. Returns subscription IDs, plans, statuses, and amounts.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['active', 'canceled', 'expired', 'future', 'in_trial', 'live', 'paused'],
        description: 'Filter by subscription state',
      },
      plan_id: {
        type: 'string',
        description: 'Filter by plan ID',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 200)',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: desc)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        order: params.order ?? 'desc',
      };
      if (params.state) query.state = params.state;
      if (params.plan_id) query['plan_id'] = params.plan_id;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/subscriptions',
        query,
        headers: RECURLY_HEADERS,
      });

      const subscriptions: any[] = data.data ?? [];
      if (subscriptions.length === 0) {
        return { content: 'No subscriptions found.', metadata: { subscriptionCount: 0 } };
      }

      const lines = subscriptions.map((sub: any) => {
        const planCode = sub.plan?.code ?? 'unknown plan';
        const state = sub.state ?? 'unknown';
        const amount = formatAmount(sub.unit_amount, sub.currency);
        const currentPeriodEnd = formatDate(sub.current_period_ends_at);
        const accountCode = sub.account?.code ?? 'N/A';
        return `  - ${sub.id} — ${planCode} — ${state} — ${amount} — ends: ${currentPeriodEnd} — account: ${accountCode}`;
      });

      return {
        content: `Found ${subscriptions.length} subscription(s):\n\n${lines.join('\n')}`,
        metadata: {
          subscriptionCount: subscriptions.length,
          hasMore: data.has_more ?? false,
        },
      };
    } catch (err) {
      return recurlyError(err);
    }
  },
};

// ─── Tool: recurly_list_invoices ────────────────────────

const recurlyListInvoices: ToolHandler = {
  description:
    'List invoices in Recurly. Optionally filter by state or type. Returns invoice numbers, amounts, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['pending', 'processing', 'past_due', 'paid', 'failed', 'voided'],
        description: 'Filter by invoice state',
      },
      type: {
        type: 'string',
        enum: ['charge', 'credit', 'legacy'],
        description: 'Filter by invoice type',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 200)',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: desc)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        order: params.order ?? 'desc',
      };
      if (params.state) query.state = params.state;
      if (params.type) query.type = params.type;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/invoices',
        query,
        headers: RECURLY_HEADERS,
      });

      const invoices: any[] = data.data ?? [];
      if (invoices.length === 0) {
        return { content: 'No invoices found.', metadata: { invoiceCount: 0 } };
      }

      const lines = invoices.map((inv: any) => {
        const number = inv.number ?? inv.id;
        const state = inv.state ?? 'unknown';
        const total = formatAmount(inv.total, inv.currency);
        const date = formatDate(inv.created_at);
        const accountCode = inv.account?.code ?? 'N/A';
        return `  - #${number} (ID: ${inv.id}) — ${total} — ${state} — ${date} — account: ${accountCode}`;
      });

      return {
        content: `Found ${invoices.length} invoice(s):\n\n${lines.join('\n')}`,
        metadata: {
          invoiceCount: invoices.length,
          hasMore: data.has_more ?? false,
        },
      };
    } catch (err) {
      return recurlyError(err);
    }
  },
};

// ─── Tool: recurly_get_account ──────────────────────────

const recurlyGetAccount: ToolHandler = {
  description:
    'Retrieve details of a single Recurly account by its ID or code. Returns account name, email, state, and billing info.',
  inputSchema: {
    type: 'object',
    properties: {
      account_id: {
        type: 'string',
        description: 'Recurly account ID or account code (prefixed with "code-" for code lookups)',
      },
    },
    required: ['account_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const acct = await ctx.apiExecutor.request({
        method: 'GET',
        path: `/accounts/${params.account_id}`,
        headers: RECURLY_HEADERS,
      });

      const name = [acct.first_name, acct.last_name].filter(Boolean).join(' ') || acct.company || '(unnamed)';
      const email = acct.email ?? 'N/A';
      const state = acct.state ?? 'unknown';
      const created = formatDate(acct.created_at);
      const balance = formatAmount(acct.hosted_login_token ? undefined : 0, acct.bill_to ?? 'USD');

      const addr = acct.address ?? {};
      const addressStr = [addr.street1, addr.street2, addr.city, addr.region, addr.postal_code, addr.country]
        .filter(Boolean)
        .join(', ') || 'N/A';

      const content = [
        `Account: ${name}`,
        `Code: ${acct.code}`,
        `ID: ${acct.id}`,
        `Email: ${email}`,
        `State: ${state}`,
        `Company: ${acct.company ?? 'N/A'}`,
        `Address: ${addressStr}`,
        `Created: ${created}`,
      ].join('\n');

      return {
        content,
        metadata: {
          accountId: acct.id,
          code: acct.code,
          state,
          email,
        },
      };
    } catch (err) {
      return recurlyError(err);
    }
  },
};

// ─── Tool: recurly_list_plans ───────────────────────────

const recurlyListPlans: ToolHandler = {
  description:
    'List subscription plans in Recurly. Returns plan names, codes, pricing, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Filter by plan state',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20, max 200)',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: desc)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        order: params.order ?? 'desc',
      };
      if (params.state) query.state = params.state;

      const data = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/plans',
        query,
        headers: RECURLY_HEADERS,
      });

      const plans: any[] = data.data ?? [];
      if (plans.length === 0) {
        return { content: 'No plans found.', metadata: { planCount: 0 } };
      }

      const lines = plans.map((plan: any) => {
        const state = plan.state ?? 'unknown';
        const interval = plan.interval_unit
          ? `${plan.interval_length ?? 1}x ${plan.interval_unit}`
          : 'N/A';
        const currencies = (plan.currencies ?? []).map((c: any) =>
          `${c.unit_amount?.toFixed(2) ?? '?'} ${c.currency}`
        ).join(', ') || 'N/A';
        return `  - ${plan.name} (code: ${plan.code}, ID: ${plan.id}) — ${state} — ${interval} — ${currencies}`;
      });

      return {
        content: `Found ${plans.length} plan(s):\n\n${lines.join('\n')}`,
        metadata: {
          planCount: plans.length,
          hasMore: data.has_more ?? false,
        },
      };
    } catch (err) {
      return recurlyError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const recurlyAdapter: SkillAdapter = {
  skillId: 'recurly',
  name: 'Recurly',
  baseUrl: 'https://v3.recurly.com',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  defaultHeaders: RECURLY_HEADERS,
  tools: {
    recurly_list_accounts: recurlyListAccounts,
    recurly_list_subscriptions: recurlyListSubscriptions,
    recurly_list_invoices: recurlyListInvoices,
    recurly_get_account: recurlyGetAccount,
    recurly_list_plans: recurlyListPlans,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
