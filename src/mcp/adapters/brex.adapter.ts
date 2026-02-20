/**
 * MCP Skill Adapter — Brex
 *
 * Maps Brex Platform API endpoints to MCP tool handlers.
 * API reference: https://developer.brex.com/openapi/
 *
 * Brex uses Bearer token authentication. All endpoints are under
 * https://platform.brexapis.com.
 *
 * Tools:
 *   - brex_list_transactions  List card transactions
 *   - brex_list_cards         List cards
 *   - brex_list_users         List users/employees
 *   - brex_get_account        Get account details
 *   - brex_list_vendors       List vendors/recipients
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function brexError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message ?? data.error ?? err.message;
      return { content: `Brex API error: ${msg}`, isError: true };
    }
    return { content: `Brex API error: ${err.message}`, isError: true };
  }
  return { content: `Brex API error: ${String(err)}`, isError: true };
}

/** Format a Brex Money object. */
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

// ─── Tool: brex_list_transactions ───────────────────────

const brexListTransactions: ToolHandler = {
  description:
    'List Brex card transactions. Optionally filter by date range or user. Returns transaction descriptions, amounts, and dates.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 25)',
      },
      user_id: {
        type: 'string',
        description: 'Filter transactions by user ID',
      },
      posted_at_start: {
        type: 'string',
        description: 'Filter transactions posted after this date (ISO 8601)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);
      if (params.user_id) query.user_id = params.user_id;
      if (params.posted_at_start) query['posted_at_start'] = params.posted_at_start;

      const data = await ctx.apiExecutor.get('/v2/transactions/card/primary', query);

      const items: any[] = data.items ?? [];
      if (items.length === 0) {
        return { content: 'No transactions found.', metadata: { transactionCount: 0 } };
      }

      const lines = items.map((tx: any) => {
        const amount = formatMoney(tx.amount);
        const merchant = tx.merchant?.raw_descriptor ?? tx.description ?? 'unknown';
        const date = formatDate(tx.posted_at);
        const status = tx.status ?? 'unknown';
        return `  - ${tx.id} — ${amount} — ${merchant} — ${status} — ${date}`;
      });

      return {
        content: `Found ${items.length} transaction(s):\n\n${lines.join('\n')}`,
        metadata: {
          transactionCount: items.length,
          nextCursor: data.next_cursor,
        },
      };
    } catch (err) {
      return brexError(err);
    }
  },
};

// ─── Tool: brex_list_cards ──────────────────────────────

const brexListCards: ToolHandler = {
  description:
    'List Brex cards. Optionally filter by user or card status. Returns card details including last four digits and limits.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'Filter cards by user ID',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 25)',
      },
      status: {
        type: 'string',
        enum: ['ACTIVE', 'TERMINATED', 'LOCKED'],
        description: 'Filter by card status',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.user_id) query.user_id = params.user_id;
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);
      if (params.status) query.status = params.status;

      const data = await ctx.apiExecutor.get('/v2/cards', query);

      const items: any[] = data.items ?? [];
      if (items.length === 0) {
        return { content: 'No cards found.', metadata: { cardCount: 0 } };
      }

      const lines = items.map((card: any) => {
        const last4 = card.last_four ?? '****';
        const status = card.status ?? 'unknown';
        const cardName = card.card_name ?? '';
        const limit = card.spend_controls?.spend_limit
          ? formatMoney(card.spend_controls.spend_limit)
          : 'no limit';
        const owner = card.owner?.user_id ?? 'unknown';
        return `  - *${last4} ${cardName} (ID: ${card.id}) — ${status} — limit: ${limit} — owner: ${owner}`;
      });

      return {
        content: `Found ${items.length} card(s):\n\n${lines.join('\n')}`,
        metadata: {
          cardCount: items.length,
          nextCursor: data.next_cursor,
        },
      };
    } catch (err) {
      return brexError(err);
    }
  },
};

// ─── Tool: brex_list_users ──────────────────────────────

const brexListUsers: ToolHandler = {
  description:
    'List users (employees) in Brex. Returns user names, emails, roles, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 25)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);

      const data = await ctx.apiExecutor.get('/v2/users', query);

      const items: any[] = data.items ?? [];
      if (items.length === 0) {
        return { content: 'No users found.', metadata: { userCount: 0 } };
      }

      const lines = items.map((user: any) => {
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '(unnamed)';
        const email = user.email ?? 'no email';
        const status = user.status ?? 'unknown';
        const role = user.role ?? 'unknown';
        return `  - ${name} (ID: ${user.id}) — ${email} — ${role} — ${status}`;
      });

      return {
        content: `Found ${items.length} user(s):\n\n${lines.join('\n')}`,
        metadata: {
          userCount: items.length,
          nextCursor: data.next_cursor,
        },
      };
    } catch (err) {
      return brexError(err);
    }
  },
};

// ─── Tool: brex_get_account ─────────────────────────────

const brexGetAccount: ToolHandler = {
  description:
    'Get Brex account details including the primary cash account balance and status.',
  inputSchema: {
    type: 'object',
    properties: {
      account_id: {
        type: 'string',
        description: 'Brex account ID. If omitted, returns the primary account.',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const path = params.account_id
        ? `/v2/accounts/cash/${params.account_id}`
        : '/v2/accounts/cash/primary';

      const account = await ctx.apiExecutor.get(path);

      const balance = formatMoney(account.current_balance);
      const available = formatMoney(account.available_balance);
      const name = account.name ?? 'Primary Account';
      const status = account.status ?? 'unknown';

      const content = [
        `Account: ${name} (ID: ${account.id})`,
        `Status: ${status}`,
        `Current Balance: ${balance}`,
        `Available Balance: ${available}`,
        `Account Number: ${account.account_number ?? 'N/A'}`,
        `Routing Number: ${account.routing_number ?? 'N/A'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          accountId: account.id,
          status,
          currentBalance: account.current_balance?.amount,
          currency: account.current_balance?.currency,
        },
      };
    } catch (err) {
      return brexError(err);
    }
  },
};

// ─── Tool: brex_list_vendors ────────────────────────────

const brexListVendors: ToolHandler = {
  description:
    'List vendors (payment recipients) in Brex. Returns vendor names, payment methods, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 25)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.cursor) query.cursor = params.cursor;
      if (params.limit) query.limit = String(params.limit);

      const data = await ctx.apiExecutor.get('/v1/vendors', query);

      const items: any[] = data.items ?? [];
      if (items.length === 0) {
        return { content: 'No vendors found.', metadata: { vendorCount: 0 } };
      }

      const lines = items.map((v: any) => {
        const name = v.company_name ?? v.name ?? '(unnamed)';
        const email = v.email ?? 'no email';
        const paymentType = v.payment_accounts?.[0]?.type ?? 'unknown';
        return `  - ${name} (ID: ${v.id}) — ${email} — payment: ${paymentType}`;
      });

      return {
        content: `Found ${items.length} vendor(s):\n\n${lines.join('\n')}`,
        metadata: {
          vendorCount: items.length,
          nextCursor: data.next_cursor,
        },
      };
    } catch (err) {
      return brexError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const brexAdapter: SkillAdapter = {
  skillId: 'brex',
  name: 'Brex',
  baseUrl: 'https://platform.brexapis.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    brex_list_transactions: brexListTransactions,
    brex_list_cards: brexListCards,
    brex_list_users: brexListUsers,
    brex_get_account: brexGetAccount,
    brex_list_vendors: brexListVendors,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
