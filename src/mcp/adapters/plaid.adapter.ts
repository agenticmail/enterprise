/**
 * MCP Skill Adapter — Plaid
 *
 * Maps Plaid API endpoints to MCP tool handlers.
 * API reference: https://plaid.com/docs/api/
 *
 * Plaid uses API key authentication (client_id + secret) sent in the request body.
 * The environment (production vs sandbox) is configured via ctx.skillConfig.environment.
 *
 * Base URLs:
 *   - Production: https://production.plaid.com
 *   - Sandbox:    https://sandbox.plaid.com
 *
 * Tools:
 *   - plaid_get_accounts      Get linked bank accounts
 *   - plaid_get_transactions  Get transactions for an account
 *   - plaid_get_balance       Get real-time account balances
 *   - plaid_get_identity      Get account holder identity info
 *   - plaid_get_institutions  Search financial institutions
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Plaid API base URL based on configured environment. */
function plaidBaseUrl(ctx: ToolExecutionContext): string {
  const env = ctx.skillConfig.environment ?? 'sandbox';
  switch (env) {
    case 'production': return 'https://production.plaid.com';
    case 'sandbox': return 'https://sandbox.plaid.com';
    default: return 'https://sandbox.plaid.com';
  }
}

function plaidError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.error_code ?? '';
      const msg = data.error_message ?? data.message ?? err.message;
      return { content: `Plaid API error: ${code ? code + ' — ' : ''}${msg}`, isError: true };
    }
    return { content: `Plaid API error: ${err.message}`, isError: true };
  }
  return { content: `Plaid API error: ${String(err)}`, isError: true };
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

// ─── Tool: plaid_get_accounts ───────────────────────────

const plaidGetAccounts: ToolHandler = {
  description:
    'Get linked bank accounts via Plaid. Requires an access token. Returns account names, types, balances, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      access_token: {
        type: 'string',
        description: 'Plaid access token for the linked item',
      },
    },
    required: ['access_token'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = plaidBaseUrl(ctx);
      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/accounts/get`,
        body: {
          access_token: params.access_token,
        },
      });

      const accounts: any[] = data.accounts ?? [];
      if (accounts.length === 0) {
        return { content: 'No accounts found.', metadata: { accountCount: 0 } };
      }

      const lines = accounts.map((acct: any) => {
        const name = acct.name ?? acct.official_name ?? '(unnamed)';
        const type = acct.type ?? 'unknown';
        const subtype = acct.subtype ?? '';
        const balance = formatAmount(acct.balances?.current, acct.balances?.iso_currency_code);
        const available = formatAmount(acct.balances?.available, acct.balances?.iso_currency_code);
        return `  - ${name} (ID: ${acct.account_id}) — ${type}/${subtype} — current: ${balance}, available: ${available}`;
      });

      return {
        content: `Found ${accounts.length} account(s):\n\n${lines.join('\n')}`,
        metadata: {
          accountCount: accounts.length,
          itemId: data.item?.item_id,
        },
      };
    } catch (err) {
      return plaidError(err);
    }
  },
};

// ─── Tool: plaid_get_transactions ───────────────────────

const plaidGetTransactions: ToolHandler = {
  description:
    'Get transactions for linked accounts via Plaid. Specify a date range and optional account filter.',
  inputSchema: {
    type: 'object',
    properties: {
      access_token: {
        type: 'string',
        description: 'Plaid access token for the linked item',
      },
      start_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      end_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      account_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter transactions to specific account IDs (optional)',
      },
      count: {
        type: 'number',
        description: 'Max transactions to return (default 100, max 500)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    required: ['access_token', 'start_date', 'end_date'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = plaidBaseUrl(ctx);
      const body: Record<string, any> = {
        access_token: params.access_token,
        start_date: params.start_date,
        end_date: params.end_date,
        options: {
          count: params.count ?? 100,
          offset: params.offset ?? 0,
        },
      };
      if (params.account_ids) {
        body.options.account_ids = params.account_ids;
      }

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/transactions/get`,
        body,
      });

      const transactions: any[] = data.transactions ?? [];
      if (transactions.length === 0) {
        return { content: 'No transactions found.', metadata: { transactionCount: 0, totalTransactions: data.total_transactions ?? 0 } };
      }

      const lines = transactions.slice(0, 50).map((tx: any) => {
        const name = tx.name ?? tx.merchant_name ?? 'unknown';
        const amount = formatAmount(tx.amount, tx.iso_currency_code);
        const date = formatDate(tx.date);
        const category = (tx.category ?? []).join(' > ') || 'uncategorized';
        return `  - ${name} — ${amount} — ${date} — ${category}`;
      });

      const total = data.total_transactions ?? transactions.length;
      const truncNote = transactions.length > 50 ? `\n\n(Showing first 50 of ${transactions.length})` : '';

      return {
        content: `Found ${total} transaction(s) (showing ${Math.min(transactions.length, 50)}):\n\n${lines.join('\n')}${truncNote}`,
        metadata: {
          transactionCount: transactions.length,
          totalTransactions: total,
        },
      };
    } catch (err) {
      return plaidError(err);
    }
  },
};

// ─── Tool: plaid_get_balance ────────────────────────────

const plaidGetBalance: ToolHandler = {
  description:
    'Get real-time account balances via Plaid. Returns current and available balances for all linked accounts.',
  inputSchema: {
    type: 'object',
    properties: {
      access_token: {
        type: 'string',
        description: 'Plaid access token for the linked item',
      },
      account_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter to specific account IDs (optional)',
      },
    },
    required: ['access_token'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = plaidBaseUrl(ctx);
      const body: Record<string, any> = {
        access_token: params.access_token,
      };
      if (params.account_ids) {
        body.options = { account_ids: params.account_ids };
      }

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/accounts/balance/get`,
        body,
      });

      const accounts: any[] = data.accounts ?? [];
      if (accounts.length === 0) {
        return { content: 'No accounts found.', metadata: { accountCount: 0 } };
      }

      const lines = accounts.map((acct: any) => {
        const name = acct.name ?? '(unnamed)';
        const currency = acct.balances?.iso_currency_code ?? 'USD';
        const current = formatAmount(acct.balances?.current, currency);
        const available = formatAmount(acct.balances?.available, currency);
        const limit = acct.balances?.limit != null ? formatAmount(acct.balances.limit, currency) : 'N/A';
        return `  - ${name} (${acct.account_id}) — current: ${current}, available: ${available}, limit: ${limit}`;
      });

      return {
        content: `Balances for ${accounts.length} account(s):\n\n${lines.join('\n')}`,
        metadata: { accountCount: accounts.length },
      };
    } catch (err) {
      return plaidError(err);
    }
  },
};

// ─── Tool: plaid_get_identity ───────────────────────────

const plaidGetIdentity: ToolHandler = {
  description:
    'Get identity information for account holders via Plaid. Returns names, addresses, emails, and phone numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      access_token: {
        type: 'string',
        description: 'Plaid access token for the linked item',
      },
      account_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter to specific account IDs (optional)',
      },
    },
    required: ['access_token'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = plaidBaseUrl(ctx);
      const body: Record<string, any> = {
        access_token: params.access_token,
      };
      if (params.account_ids) {
        body.options = { account_ids: params.account_ids };
      }

      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/identity/get`,
        body,
      });

      const accounts: any[] = data.accounts ?? [];
      if (accounts.length === 0) {
        return { content: 'No identity information found.', metadata: { accountCount: 0 } };
      }

      const sections: string[] = [];
      for (const acct of accounts) {
        const owners: any[] = acct.owners ?? [];
        for (const owner of owners) {
          const names = (owner.names ?? []).join(', ') || 'unknown';
          const emails = (owner.emails ?? []).map((e: any) => e.data).join(', ') || 'N/A';
          const phones = (owner.phone_numbers ?? []).map((p: any) => p.data).join(', ') || 'N/A';
          const addrs = (owner.addresses ?? []).map((a: any) => {
            const d = a.data ?? {};
            return [d.street, d.city, d.region, d.postal_code, d.country].filter(Boolean).join(', ');
          }).join('; ') || 'N/A';

          sections.push([
            `Account: ${acct.name} (${acct.account_id})`,
            `  Names: ${names}`,
            `  Emails: ${emails}`,
            `  Phones: ${phones}`,
            `  Addresses: ${addrs}`,
          ].join('\n'));
        }
      }

      return {
        content: `Identity information:\n\n${sections.join('\n\n')}`,
        metadata: { accountCount: accounts.length },
      };
    } catch (err) {
      return plaidError(err);
    }
  },
};

// ─── Tool: plaid_get_institutions ───────────────────────

const plaidGetInstitutions: ToolHandler = {
  description:
    'Search for financial institutions supported by Plaid. Returns institution names, IDs, and supported products.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for institution name (e.g. "Chase", "Bank of America")',
      },
      country_codes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Country codes to search in (default: ["US"])',
      },
      count: {
        type: 'number',
        description: 'Max results to return (default 10)',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const base = plaidBaseUrl(ctx);
      const data = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/institutions/search`,
        body: {
          query: params.query,
          country_codes: params.country_codes ?? ['US'],
          options: {
            include_optional_metadata: true,
          },
          products: [],
        },
      });

      const institutions: any[] = data.institutions ?? [];
      if (institutions.length === 0) {
        return { content: 'No institutions found.', metadata: { institutionCount: 0 } };
      }

      const lines = institutions.slice(0, params.count ?? 10).map((inst: any) => {
        const products = (inst.products ?? []).join(', ') || 'N/A';
        const url = inst.url ?? '';
        return `  - ${inst.name} (ID: ${inst.institution_id}) — products: ${products}${url ? ' — ' + url : ''}`;
      });

      return {
        content: `Found ${institutions.length} institution(s):\n\n${lines.join('\n')}`,
        metadata: { institutionCount: institutions.length },
      };
    } catch (err) {
      return plaidError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const plaidAdapter: SkillAdapter = {
  skillId: 'plaid',
  name: 'Plaid',
  baseUrl: 'https://production.plaid.com',
  auth: {
    type: 'api_key',
  },
  tools: {
    plaid_get_accounts: plaidGetAccounts,
    plaid_get_transactions: plaidGetTransactions,
    plaid_get_balance: plaidGetBalance,
    plaid_get_identity: plaidGetIdentity,
    plaid_get_institutions: plaidGetInstitutions,
  },
  configSchema: {
    environment: {
      type: 'select' as const,
      label: 'Environment',
      description: 'Plaid API environment',
      options: [
        { label: 'Production', value: 'production' },
        { label: 'Sandbox', value: 'sandbox' },
      ],
      default: 'sandbox',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
