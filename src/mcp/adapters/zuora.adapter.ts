/**
 * MCP Skill Adapter — Zuora
 *
 * Maps Zuora REST API endpoints to MCP tool handlers.
 * API reference: https://www.zuora.com/developer/api-references/api/overview/
 *
 * Zuora uses OAuth2 authentication. The base URL differs by environment:
 *   - Production: https://rest.zuora.com
 *   - Sandbox:    https://rest.apisandbox.zuora.com
 *
 * Tools:
 *   - zuora_list_subscriptions   List subscriptions
 *   - zuora_create_subscription  Create a new subscription
 *   - zuora_list_accounts        List billing accounts
 *   - zuora_list_invoices        List invoices
 *   - zuora_query                Execute a ZOQL query
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Zuora API base URL, supporting sandbox mode. */
function zuoraBaseUrl(ctx: ToolExecutionContext): string {
  const sandbox = ctx.skillConfig.sandbox === true;
  return sandbox
    ? 'https://rest.apisandbox.zuora.com'
    : 'https://rest.zuora.com';
}

function zuoraError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const reasons = Array.isArray(data.reasons)
        ? data.reasons.map((r: any) => `${r.code ?? ''}: ${r.message ?? ''}`).join('; ')
        : '';
      const msg = reasons || data.message || err.message;
      return { content: `Zuora API error: ${msg}`, isError: true };
    }
    return { content: `Zuora API error: ${err.message}`, isError: true };
  }
  return { content: `Zuora API error: ${String(err)}`, isError: true };
}

/** Format a monetary amount. */
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

// ─── Tool: zuora_list_subscriptions ─────────────────────

const zuoraListSubscriptions: ToolHandler = {
  description:
    'List subscriptions in Zuora. Optionally filter by account or status. Returns subscription numbers, statuses, and terms.',
  inputSchema: {
    type: 'object',
    properties: {
      account_key: {
        type: 'string',
        description: 'Zuora account ID or account number to filter subscriptions',
      },
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 40)',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = zuoraBaseUrl(ctx);

      if (params.account_key) {
        // Subscriptions by account
        const data = await ctx.apiExecutor.request({
          method: 'GET',
          url: `${base}/v1/subscriptions/accounts/${params.account_key}`,
          query: {
            pageSize: String(params.page_size ?? 20),
            page: String(params.page ?? 1),
          },
        });

        const subscriptions: any[] = data.subscriptions ?? [];
        if (subscriptions.length === 0) {
          return { content: 'No subscriptions found for this account.', metadata: { subscriptionCount: 0 } };
        }

        const lines = subscriptions.map((sub: any) => {
          const status = sub.status ?? 'unknown';
          const termType = sub.termType ?? 'N/A';
          const contractDate = formatDate(sub.contractEffectiveDate);
          return `  - ${sub.subscriptionNumber} (ID: ${sub.id}) — ${status} — term: ${termType} — effective: ${contractDate}`;
        });

        return {
          content: `Found ${subscriptions.length} subscription(s):\n\n${lines.join('\n')}`,
          metadata: {
            subscriptionCount: subscriptions.length,
            nextPage: data.nextPage,
          },
        };
      }

      // List all via ZOQL if no account filter
      const queryResult = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v1/action/query`,
        body: {
          queryString: `SELECT Id, SubscriptionNumber, Status, TermType, ContractEffectiveDate, AccountId FROM Subscription ORDER BY CreatedDate DESC`,
        },
      });

      const records: any[] = queryResult.records ?? [];
      if (records.length === 0) {
        return { content: 'No subscriptions found.', metadata: { subscriptionCount: 0 } };
      }

      const lines = records.slice(0, 50).map((sub: any) => {
        const status = sub.Status ?? 'unknown';
        const termType = sub.TermType ?? 'N/A';
        const date = formatDate(sub.ContractEffectiveDate);
        return `  - ${sub.SubscriptionNumber} (ID: ${sub.Id}) — ${status} — ${termType} — ${date}`;
      });

      return {
        content: `Found ${records.length} subscription(s):\n\n${lines.join('\n')}`,
        metadata: {
          subscriptionCount: records.length,
          done: queryResult.done ?? true,
        },
      };
    } catch (err) {
      return zuoraError(err);
    }
  },
};

// ─── Tool: zuora_create_subscription ────────────────────

const zuoraCreateSubscription: ToolHandler = {
  description:
    'Create a new subscription in Zuora. Specify an account and rate plan.',
  inputSchema: {
    type: 'object',
    properties: {
      account_key: {
        type: 'string',
        description: 'Zuora account ID or account number',
      },
      contract_effective_date: {
        type: 'string',
        description: 'Contract effective date in YYYY-MM-DD format',
      },
      term_type: {
        type: 'string',
        enum: ['TERMED', 'EVERGREEN'],
        description: 'Subscription term type (default: EVERGREEN)',
      },
      initial_term: {
        type: 'number',
        description: 'Initial term in months (required for TERMED, e.g. 12)',
      },
      renewal_term: {
        type: 'number',
        description: 'Renewal term in months (for TERMED, e.g. 12)',
      },
      rate_plan_id: {
        type: 'string',
        description: 'Product rate plan ID to subscribe to',
      },
      notes: {
        type: 'string',
        description: 'Notes for the subscription',
      },
    },
    required: ['account_key', 'contract_effective_date', 'rate_plan_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = zuoraBaseUrl(ctx);
      const body: Record<string, any> = {
        accountKey: params.account_key,
        contractEffectiveDate: params.contract_effective_date,
        termType: params.term_type ?? 'EVERGREEN',
        subscribeToRatePlans: [
          { productRatePlanId: params.rate_plan_id },
        ],
      };
      if (params.initial_term) body.initialTerm = params.initial_term;
      if (params.renewal_term) body.renewalTerm = params.renewal_term;
      if (params.notes) body.notes = params.notes;

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v1/subscriptions`,
        body,
      });

      const subNumber = data.subscriptionNumber ?? data.subscriptionId ?? 'unknown';
      return {
        content: `Subscription created: ${subNumber} — success: ${data.success ?? true}`,
        metadata: {
          subscriptionId: data.subscriptionId,
          subscriptionNumber: data.subscriptionNumber,
          success: data.success,
        },
      };
    } catch (err) {
      return zuoraError(err);
    }
  },
};

// ─── Tool: zuora_list_accounts ──────────────────────────

const zuoraListAccounts: ToolHandler = {
  description:
    'List billing accounts in Zuora. Returns account names, numbers, statuses, and balances.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 40)',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = zuoraBaseUrl(ctx);

      // Use ZOQL to list accounts
      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v1/action/query`,
        body: {
          queryString: 'SELECT Id, Name, AccountNumber, Status, Balance, Currency FROM Account ORDER BY CreatedDate DESC',
        },
      });

      const records: any[] = data.records ?? [];
      if (records.length === 0) {
        return { content: 'No accounts found.', metadata: { accountCount: 0 } };
      }

      const lines = records.slice(0, 50).map((acct: any) => {
        const balance = formatAmount(acct.Balance, acct.Currency);
        const status = acct.Status ?? 'unknown';
        return `  - ${acct.Name} (#${acct.AccountNumber}, ID: ${acct.Id}) — ${status} — balance: ${balance}`;
      });

      return {
        content: `Found ${records.length} account(s):\n\n${lines.join('\n')}`,
        metadata: {
          accountCount: records.length,
          done: data.done ?? true,
        },
      };
    } catch (err) {
      return zuoraError(err);
    }
  },
};

// ─── Tool: zuora_list_invoices ──────────────────────────

const zuoraListInvoices: ToolHandler = {
  description:
    'List invoices in Zuora. Optionally filter by account. Returns invoice numbers, amounts, statuses, and dates.',
  inputSchema: {
    type: 'object',
    properties: {
      account_key: {
        type: 'string',
        description: 'Zuora account ID or account number to filter invoices',
      },
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 40)',
      },
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default 1)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = zuoraBaseUrl(ctx);

      if (params.account_key) {
        const data = await ctx.apiExecutor.request({
          method: 'GET',
          url: `${base}/v1/invoices/accounts/${params.account_key}`,
          query: {
            pageSize: String(params.page_size ?? 20),
            page: String(params.page ?? 1),
          },
        });

        const invoices: any[] = data.invoices ?? [];
        if (invoices.length === 0) {
          return { content: 'No invoices found for this account.', metadata: { invoiceCount: 0 } };
        }

        const lines = invoices.map((inv: any) => {
          const amount = formatAmount(inv.amount, inv.currency);
          const balance = formatAmount(inv.balance, inv.currency);
          const status = inv.status ?? 'unknown';
          const date = formatDate(inv.invoiceDate);
          return `  - ${inv.invoiceNumber} (ID: ${inv.id}) — ${amount} — balance: ${balance} — ${status} — ${date}`;
        });

        return {
          content: `Found ${invoices.length} invoice(s):\n\n${lines.join('\n')}`,
          metadata: { invoiceCount: invoices.length, nextPage: data.nextPage },
        };
      }

      // List all via ZOQL
      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v1/action/query`,
        body: {
          queryString: 'SELECT Id, InvoiceNumber, Amount, Balance, Status, InvoiceDate, AccountId FROM Invoice ORDER BY CreatedDate DESC',
        },
      });

      const records: any[] = data.records ?? [];
      if (records.length === 0) {
        return { content: 'No invoices found.', metadata: { invoiceCount: 0 } };
      }

      const lines = records.slice(0, 50).map((inv: any) => {
        const amount = formatAmount(inv.Amount);
        const balance = formatAmount(inv.Balance);
        const status = inv.Status ?? 'unknown';
        const date = formatDate(inv.InvoiceDate);
        return `  - ${inv.InvoiceNumber} (ID: ${inv.Id}) — ${amount} — balance: ${balance} — ${status} — ${date}`;
      });

      return {
        content: `Found ${records.length} invoice(s):\n\n${lines.join('\n')}`,
        metadata: { invoiceCount: records.length, done: data.done ?? true },
      };
    } catch (err) {
      return zuoraError(err);
    }
  },
};

// ─── Tool: zuora_query ──────────────────────────────────

const zuoraQuery: ToolHandler = {
  description:
    'Execute a ZOQL (Zuora Object Query Language) query against Zuora. Returns matching records. Example: "SELECT Id, Name, Status FROM Account WHERE Status = \'Active\'".',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'ZOQL query string',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = zuoraBaseUrl(ctx);
      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/v1/action/query`,
        body: {
          queryString: params.query,
        },
      });

      const records: any[] = data.records ?? [];
      if (records.length === 0) {
        return {
          content: `Query returned 0 results: ${params.query}`,
          metadata: { totalCount: 0, query: params.query },
        };
      }

      // Format records as key-value lines
      const lines = records.slice(0, 50).map((record: any) => {
        const fields = Object.entries(record)
          .filter(([key]) => key !== 'Id')
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        const id = record.Id ?? 'unknown';
        return `  - [${id}] ${fields}`;
      });

      const truncNote = records.length > 50 ? `\n\n(Showing first 50 of ${records.length} results)` : '';
      const done = data.done !== false;

      return {
        content: `Found ${records.length} result(s):\n\n${lines.join('\n')}${truncNote}`,
        metadata: {
          totalCount: records.length,
          done,
          query: params.query,
          queryLocator: data.queryLocator,
        },
      };
    } catch (err) {
      return zuoraError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const zuoraAdapter: SkillAdapter = {
  skillId: 'zuora',
  name: 'Zuora',
  baseUrl: 'https://rest.zuora.com',
  auth: {
    type: 'oauth2',
    provider: 'zuora',
  },
  tools: {
    zuora_list_subscriptions: zuoraListSubscriptions,
    zuora_create_subscription: zuoraCreateSubscription,
    zuora_list_accounts: zuoraListAccounts,
    zuora_list_invoices: zuoraListInvoices,
    zuora_query: zuoraQuery,
  },
  configSchema: {
    sandbox: {
      type: 'boolean' as const,
      label: 'Sandbox Mode',
      description: 'Use Zuora sandbox environment for testing',
      default: false,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
