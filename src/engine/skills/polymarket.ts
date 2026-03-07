import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket',
  name: 'Polymarket Trading',
  description: 'Full-featured prediction market trading on Polymarket. Market discovery, order management, portfolio tracking, risk management, price alerts, event analysis, neg-risk support, and autonomous or approval-gated trading. Built on the CLOB API (Polygon/USDC).',
  category: 'finance',
  risk: 'critical',
  icon: Emoji.chartUp,
  source: 'builtin',
  version: '2.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  // ═══════════════════════════════════════════════════════════════
  //  ACCOUNT & ONBOARDING
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_create_account',
    name: 'Create Account',
    description: 'Create or import a Polymarket wallet. "auto" generates a fresh wallet and can use the browser to complete signup. "import" lets users provide their existing private key. All credentials persist in the enterprise database — survives server restarts and redeployments.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['accesses-secrets', 'storage'],
    parameters: { type: 'object', properties: {
      method: { type: 'string', enum: ['auto', 'import'], description: '"auto" = generate fresh wallet, "import" = use existing key' },
      private_key: { type: 'string', description: 'For import: existing Ethereum private key' },
      funder_address: { type: 'string', description: 'For import: Polymarket profile address' },
      signature_type: { type: 'number', enum: [0, 1, 2], default: 0 },
    }},
  },

  {
    id: 'poly_check_sdk',
    name: 'Check SDK Status',
    description: 'Check if the Polymarket SDK is installed and auto-install if missing. Also shows wallet connection status. Run this first to verify the system is ready.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  // ═══════════════════════════════════════════════════════════════
  //  MARKET DISCOVERY & DATA (Public — no auth required)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_search_markets',
    name: 'Search Markets',
    description: 'Search and browse active prediction markets. Filter by category, status, volume, liquidity, or keyword. Returns market questions, prices, token IDs, and metadata needed for trading.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword or phrase (e.g. "Trump", "Bitcoin", "Fed rate")' },
        category: { type: 'string', description: 'Filter by tag (e.g. "politics", "crypto", "sports", "science", "pop-culture", "business", "finance")' },
        active: { type: 'boolean', description: 'Only show active (open) markets', default: true },
        closed: { type: 'boolean', description: 'Include closed/resolved markets', default: false },
        limit: { type: 'number', description: 'Max results (1-100)', default: 20 },
        offset: { type: 'number', description: 'Pagination offset', default: 0 },
        order: { type: 'string', enum: ['volume', 'liquidity', 'start_date', 'end_date', 'created_at'], default: 'volume' },
        ascending: { type: 'boolean', default: false },
        min_volume: { type: 'number', description: 'Minimum total volume in USDC' },
        min_liquidity: { type: 'number', description: 'Minimum current liquidity in USDC' },
        end_date_before: { type: 'string', description: 'Only markets ending before this ISO date' },
        end_date_after: { type: 'string', description: 'Only markets ending after this ISO date' },
      },
    },
  },

  {
    id: 'poly_get_market',
    name: 'Get Market Details',
    description: 'Full details for a specific market: description, resolution source/criteria, current prices for all outcomes, token IDs, tick size, neg-risk flag, volume, liquidity, and timestamps.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Market condition ID, slug, or question_id' },
      },
      required: ['market_id'],
    },
  },

  {
    id: 'poly_get_event',
    name: 'Get Event',
    description: 'Get a Polymarket event and ALL its associated markets. Events group related markets (e.g. "2024 Election" contains "President", "Senate", etc). Returns all sub-markets with prices.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event ID or slug' },
      },
      required: ['event_id'],
    },
  },

  {
    id: 'poly_get_prices',
    name: 'Get Prices',
    description: 'Current prices, midpoint, and spread for an outcome token. Supports batch lookup of multiple tokens for speed. Use for real-time price monitoring.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Single outcome token ID' },
        token_ids: { type: 'array', items: { type: 'string' }, description: 'Batch: multiple token IDs (faster than individual calls)' },
        side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Price side' },
      },
    },
  },

  {
    id: 'poly_get_orderbook',
    name: 'Get Order Book',
    description: 'Full order book (bids and asks) with depth. Shows best bid/ask, spread, total liquidity per side, and individual price levels. Essential for sizing orders and detecting thin markets.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Outcome token ID' },
        depth: { type: 'number', description: 'Number of price levels to return (default: all)' },
      },
      required: ['token_id'],
    },
  },

  {
    id: 'poly_get_trades',
    name: 'Get Recent Trades',
    description: 'Recent trade history for a market or token. Shows price, size, side, maker/taker, and timestamp. Use for momentum analysis and detecting large/whale trades.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Filter by outcome token ID' },
        market_id: { type: 'string', description: 'Filter by market/condition ID' },
        limit: { type: 'number', default: 50 },
        before: { type: 'string', description: 'Cursor/timestamp for pagination (get older trades)' },
        min_size: { type: 'number', description: 'Only show trades >= this USDC size (whale filter)' },
      },
    },
  },

  {
    id: 'poly_price_history',
    name: 'Price History',
    description: 'Historical price timeseries for a token. Returns OHLCV-style candles or raw price points. Essential for trend analysis, support/resistance, and backtesting.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Outcome token ID' },
        market_id: { type: 'string', description: 'Or market condition ID (returns both YES/NO)' },
        interval: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h', '1d'], description: 'Candle interval', default: '1h' },
        start_ts: { type: 'string', description: 'Start timestamp (ISO)' },
        end_ts: { type: 'string', description: 'End timestamp (ISO)' },
        fidelity: { type: 'number', description: 'Number of data points to return (alternative to interval)' },
      },
    },
  },

  {
    id: 'poly_trending_markets',
    name: 'Trending Markets',
    description: 'Hot markets by recent volume, new activity, or big price moves. Great for opportunity discovery. Optionally filter by category.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 20 },
        category: { type: 'string' },
        sort_by: { type: 'string', enum: ['volume_24h', 'volume_change', 'price_change', 'new', 'closing_soon'], default: 'volume_24h' },
      },
    },
  },

  {
    id: 'poly_market_comments',
    name: 'Market Comments',
    description: 'Read comments/discussion on a market. Useful for sentiment analysis and understanding community consensus.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Market condition ID' },
        limit: { type: 'number', default: 30 },
        order: { type: 'string', enum: ['newest', 'oldest', 'popular'], default: 'newest' },
      },
      required: ['market_id'],
    },
  },

  {
    id: 'poly_related_markets',
    name: 'Related Markets',
    description: 'Find markets related to a given market — same event, similar topic, or correlated outcomes. Useful for hedging and multi-market strategies.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Source market to find related markets for' },
        limit: { type: 'number', default: 10 },
      },
      required: ['market_id'],
    },
  },

  {
    id: 'poly_market_news',
    name: 'Market News',
    description: 'Fetch recent news articles related to a market question. Cross-references market topic with news sources for alpha generation.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Market ID to find news for' },
        query: { type: 'string', description: 'Or provide a direct search query' },
        hours: { type: 'number', description: 'Only news from last N hours', default: 24 },
        limit: { type: 'number', default: 10 },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  WALLET & ACCOUNT SETUP
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_setup_wallet',
    name: 'Setup Wallet',
    description: 'Initialize the trading client with an Ethereum private key. Derives API credentials (L1→L2 auth), stores them in the agent vault. Must be called before any authenticated operations. Supports EOA, email/Magic, and browser proxy wallets.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['accesses-secrets'],
    parameters: {
      type: 'object',
      properties: {
        private_key: { type: 'string', description: 'Ethereum private key (hex with or without 0x prefix). Stored in vault, never logged.' },
        funder_address: { type: 'string', description: 'Polymarket profile address (where USDC lives). Derived from key if omitted.' },
        signature_type: { type: 'number', enum: [0, 1, 2], description: '0=EOA/MetaMask (default), 1=Email/Magic, 2=Browser proxy', default: 0 },
        rpc_url: { type: 'string', description: 'Custom Polygon RPC URL (default: public Polygon RPC). Use a private RPC for speed.' },
      },
      required: ['private_key'],
    },
  },

  {
    id: 'poly_wallet_status',
    name: 'Wallet Status',
    description: 'Check if wallet is connected, API credentials are valid, and the connection to the CLOB API is healthy. Also shows allowance status.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_set_allowances',
    name: 'Set Token Allowances',
    description: 'Approve the Polymarket CTF Exchange contract to spend your USDC and conditional tokens. Required before first trade for EOA wallets. Checks current allowance first and only sends tx if needed.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        token: { type: 'string', enum: ['usdc', 'ctf', 'both'], description: 'Which token to approve', default: 'both' },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  BALANCE & FUNDS
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_get_balance',
    name: 'Get Balance',
    description: 'Get USDC balance, conditional token balances, and allowance status. Shows available trading capital and funds locked in positions.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_deposit',
    name: 'Deposit USDC',
    description: 'Get deposit instructions/address for funding the Polymarket wallet with USDC on Polygon. Can also trigger a bridge deposit from Ethereum mainnet if bridge credentials are configured.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount of USDC to deposit (for bridge)' },
        source_chain: { type: 'string', enum: ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism'], description: 'Source chain for bridge deposit' },
      },
    },
  },

  {
    id: 'poly_withdraw',
    name: 'Withdraw USDC',
    description: 'Withdraw USDC from Polymarket to an external wallet address. Requires explicit confirmation.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount of USDC to withdraw' },
        to_address: { type: 'string', description: 'Destination wallet address on Polygon' },
      },
      required: ['amount', 'to_address'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  PORTFOLIO & POSITIONS
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_get_positions',
    name: 'Get Positions',
    description: 'All current open positions with market details, entry price, current price, unrealized P&L, size, and outcome. Includes both binary and multi-outcome (neg-risk) positions.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Filter by specific market' },
        min_value: { type: 'number', description: 'Only positions worth >= this USDC' },
        sort_by: { type: 'string', enum: ['value', 'pnl', 'pnl_pct', 'entry_date'], default: 'value' },
      },
    },
  },

  {
    id: 'poly_get_closed_positions',
    name: 'Get Closed Positions',
    description: 'Historical closed/resolved positions with realized P&L. Use for performance tracking and strategy review.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 50 },
        offset: { type: 'number', default: 0 },
        market_id: { type: 'string' },
        won_only: { type: 'boolean', description: 'Only show winning positions' },
        lost_only: { type: 'boolean', description: 'Only show losing positions' },
      },
    },
  },

  {
    id: 'poly_redeem',
    name: 'Redeem Winnings',
    description: 'Redeem winning conditional tokens for USDC after a market resolves. Checks resolution status and redeems all available winning tokens. Can also redeem complementary positions (YES+NO pairs).',
    category: 'write',
    risk: 'medium',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Redeem for specific market' },
        redeem_all: { type: 'boolean', description: 'Redeem all available winning positions', default: false },
        redeem_pairs: { type: 'boolean', description: 'Also redeem complementary token pairs (YES+NO → USDC)', default: true },
      },
    },
  },

  {
    id: 'poly_portfolio_summary',
    name: 'Portfolio Summary',
    description: 'Comprehensive portfolio analytics: total value, cash balance, unrealized P&L, realized P&L, win/loss ratio, Sharpe ratio, max drawdown, best/worst positions, daily/weekly/monthly performance, exposure by category, and risk metrics.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'], default: 'all' },
        include_closed: { type: 'boolean', description: 'Include resolved positions in P&L', default: true },
        include_charts: { type: 'boolean', description: 'Include ASCII equity curve', default: false },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  ORDER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_place_order',
    name: 'Place Order',
    description: 'Place a limit or market order. Supports GTC, FOK, GTD order types. Includes pre-trade risk checks (position size, daily limits, balance, slippage protection). In approval mode, queues for human review. In autonomous mode, executes directly. Handles neg-risk markets automatically.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Outcome token ID (YES or NO)' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        price: { type: 'number', description: 'Limit price (0.01-0.99). Omit for market order.' },
        size: { type: 'number', description: 'Number of shares (USDC notional value)' },
        order_type: { type: 'string', enum: ['GTC', 'FOK', 'GTD'], default: 'GTC' },
        expiration: { type: 'string', description: 'ISO timestamp for GTD orders' },
        max_slippage_pct: { type: 'number', description: 'Max acceptable slippage from midpoint for market orders (%)', default: 2 },
        tick_size: { type: 'string', description: 'Market tick size (0.1, 0.01, 0.001). Auto-detected if omitted.' },
        neg_risk: { type: 'boolean', description: 'Is this a neg-risk (multi-outcome) market? Auto-detected if omitted.' },
        market_question: { type: 'string', description: 'Human-readable question (for audit/approval display)' },
        outcome: { type: 'string', description: 'Human-readable outcome name (for audit)' },
        rationale: { type: 'string', description: 'Trading rationale (stored in trade log)' },
        urgency: { type: 'string', enum: ['normal', 'high', 'critical'], description: 'Order urgency — critical uses aggressive pricing', default: 'normal' },
      },
      required: ['token_id', 'side', 'size'],
    },
  },

  {
    id: 'poly_place_batch_orders',
    name: 'Place Batch Orders',
    description: 'Place multiple orders atomically in a single API call. Much faster than individual orders. Use for multi-leg strategies, hedging, or rebalancing. All-or-nothing execution available.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          description: 'Array of order objects (same schema as poly_place_order params)',
          items: {
            type: 'object',
            properties: {
              token_id: { type: 'string' },
              side: { type: 'string', enum: ['BUY', 'SELL'] },
              price: { type: 'number' },
              size: { type: 'number' },
              order_type: { type: 'string', enum: ['GTC', 'FOK', 'GTD'] },
              neg_risk: { type: 'boolean' },
              tick_size: { type: 'string' },
            },
            required: ['token_id', 'side', 'size'],
          },
        },
        atomic: { type: 'boolean', description: 'All-or-nothing: fail entire batch if any order fails', default: false },
        rationale: { type: 'string', description: 'Strategy rationale for the batch' },
      },
      required: ['orders'],
    },
  },

  {
    id: 'poly_get_open_orders',
    name: 'Get Open Orders',
    description: 'All open/pending orders with type, price, size, fill status, time placed, and market details.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string' },
        token_id: { type: 'string' },
      },
    },
  },

  {
    id: 'poly_get_order',
    name: 'Get Order Details',
    description: 'Get details of a specific order by ID: status, fill amount, average fill price, fee, timestamps.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
      },
      required: ['order_id'],
    },
  },

  {
    id: 'poly_cancel_order',
    name: 'Cancel Order',
    description: 'Cancel an open or pending order by ID. If the order is partially filled, only the unfilled portion is cancelled.',
    category: 'write',
    risk: 'medium',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
      },
      required: ['order_id'],
    },
  },

  {
    id: 'poly_cancel_orders',
    name: 'Cancel Multiple Orders',
    description: 'Cancel multiple orders at once. Faster than individual cancels. Optionally cancel all orders in a specific market.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        order_ids: { type: 'array', items: { type: 'string' }, description: 'Specific order IDs to cancel' },
        market_id: { type: 'string', description: 'Cancel all orders in this market' },
        token_id: { type: 'string', description: 'Cancel all orders for this token' },
        side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Cancel only buy or sell orders' },
      },
    },
  },

  {
    id: 'poly_cancel_all',
    name: 'Cancel All Orders',
    description: 'Emergency: cancel ALL open orders across all markets. Use as a panic button or before system shutdown.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Must be true to execute', default: false },
      },
    },
  },

  {
    id: 'poly_replace_order',
    name: 'Replace Order',
    description: 'Atomically cancel an existing order and place a new one. Faster and safer than separate cancel+place (no gap where you have no order). Use for price adjustments.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        old_order_id: { type: 'string', description: 'Order ID to cancel' },
        token_id: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        price: { type: 'number' },
        size: { type: 'number' },
        order_type: { type: 'string', enum: ['GTC', 'FOK', 'GTD'], default: 'GTC' },
      },
      required: ['old_order_id', 'token_id', 'side', 'price', 'size'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  TRADE HISTORY & AUDIT
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_trade_history',
    name: 'Trade History',
    description: 'Complete trade history with fill prices, fees, timestamps, slippage, and P&L per trade. Supports filtering and export.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 50 },
        offset: { type: 'number', default: 0 },
        market_id: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        start_date: { type: 'string', description: 'ISO date filter start' },
        end_date: { type: 'string', description: 'ISO date filter end' },
        min_size: { type: 'number' },
      },
    },
  },

  {
    id: 'poly_export_trades',
    name: 'Export Trades',
    description: 'Export trade history as CSV or JSON for tax reporting, backtesting, or external analysis.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: ['writes-file'],
    parameters: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        include_fees: { type: 'boolean', default: true },
        output_path: { type: 'string', description: 'File path to write to (optional, returns data if omitted)' },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  ANALYSIS & INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_analyze_market',
    name: 'Analyze Market',
    description: 'Deep market analysis: price history trends, volume profile, order book imbalance, large trades (whale activity), implied probability, spread analysis, related news, and trading recommendation with confidence level.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string' },
        depth: { type: 'string', enum: ['quick', 'standard', 'deep'], description: 'Analysis depth — quick=prices only, deep=full analysis with news', default: 'standard' },
        include_news: { type: 'boolean', default: true },
        include_whale_trades: { type: 'boolean', description: 'Analyze large recent trades', default: true },
        include_book_analysis: { type: 'boolean', description: 'Order book depth/imbalance analysis', default: true },
      },
      required: ['market_id'],
    },
  },

  {
    id: 'poly_compare_markets',
    name: 'Compare Markets',
    description: 'Side-by-side comparison of 2+ markets: prices, volume, liquidity, spread, and relative value. Use for correlation analysis and finding the best expression of a thesis.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_ids: { type: 'array', items: { type: 'string' }, description: 'List of market IDs to compare' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Specific metrics to compare (prices, volume, liquidity, spread)' },
      },
      required: ['market_ids'],
    },
  },

  {
    id: 'poly_estimate_fill',
    name: 'Estimate Fill',
    description: 'Simulate an order against the current order book WITHOUT placing it. Returns estimated average fill price, total cost, slippage, and number of price levels consumed. Critical for sizing large orders.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        size: { type: 'number', description: 'Order size in USDC' },
      },
      required: ['token_id', 'side', 'size'],
    },
  },

  {
    id: 'poly_scan_opportunities',
    name: 'Scan Opportunities',
    description: 'Automated opportunity scanner: finds markets with unusual volume spikes, price dislocations, closing-soon with wide spreads, new markets with thin books, or arbitrage between related markets.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        strategies: {
          type: 'array',
          items: { type: 'string', enum: ['volume_spike', 'price_dislocation', 'closing_soon', 'new_market', 'thin_book', 'whale_following', 'mean_reversion'] },
          description: 'Which opportunity types to scan for',
        },
        categories: { type: 'array', items: { type: 'string' }, description: 'Limit scan to these categories' },
        min_edge: { type: 'number', description: 'Minimum perceived edge (%) to report', default: 5 },
        limit: { type: 'number', default: 20 },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  CONFIGURATION & RISK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_set_config',
    name: 'Configure Trading',
    description: 'Set trading mode and risk parameters. Controls approval vs autonomous mode, position limits, daily loss limits, stop-loss/take-profit, category restrictions, and notification preferences.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['approval', 'autonomous', 'paper'], description: 'approval=human approves trades, autonomous=agent trades freely, paper=simulated (no real money)' },
        max_position_size: { type: 'number', description: 'Max USDC per single position' },
        max_order_size: { type: 'number', description: 'Max USDC per single order' },
        max_total_exposure: { type: 'number', description: 'Max total portfolio value' },
        max_daily_trades: { type: 'number', description: 'Max trades per 24h' },
        max_daily_loss: { type: 'number', description: 'Max daily loss before auto-pause (USDC)' },
        max_drawdown_pct: { type: 'number', description: 'Max portfolio drawdown % before circuit breaker' },
        allowed_categories: { type: 'array', items: { type: 'string' } },
        blocked_categories: { type: 'array', items: { type: 'string' } },
        blocked_markets: { type: 'array', items: { type: 'string' }, description: 'Specific market IDs to never trade' },
        min_liquidity: { type: 'number', description: 'Min book liquidity to trade a market' },
        min_volume: { type: 'number', description: 'Min 24h volume to trade a market' },
        max_spread_pct: { type: 'number', description: 'Max bid-ask spread % to trade (avoids illiquid markets)' },
        stop_loss_pct: { type: 'number', description: 'Auto-sell positions that drop by this %' },
        take_profit_pct: { type: 'number', description: 'Auto-sell positions that gain by this %' },
        trailing_stop_pct: { type: 'number', description: 'Trailing stop-loss %' },
        rebalance_interval: { type: 'string', enum: ['never', '1h', '4h', '12h', '24h'], description: 'Auto-rebalance frequency' },
        notification_channel: { type: 'string', description: 'Channel for alerts (telegram, discord, whatsapp, email)' },
        notify_on: { type: 'array', items: { type: 'string', enum: ['trade_placed', 'trade_filled', 'stop_loss', 'take_profit', 'circuit_breaker', 'market_resolved', 'large_move', 'approval_needed'] }, description: 'Which events trigger notifications' },
        cash_reserve_pct: { type: 'number', description: 'Always keep this % of portfolio as cash', default: 20 },
      },
    },
  },

  {
    id: 'poly_get_config',
    name: 'Get Trading Config',
    description: 'Current trading configuration: mode, limits, restrictions, notification settings, and active circuit breakers.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_circuit_breaker',
    name: 'Circuit Breaker',
    description: 'Emergency controls: pause all trading, resume trading, or check circuit breaker status. Auto-triggered by daily loss limit or max drawdown. Manual override available.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'pause', 'resume', 'reset_daily'], description: 'pause=stop all trading, resume=allow trading, reset_daily=reset daily counters' },
        reason: { type: 'string', description: 'Reason for pause/resume (logged)' },
      },
      required: ['action'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  PRICE ALERTS & MONITORING
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_set_alert',
    name: 'Set Price Alert',
    description: 'Set a price alert on a token. Triggers notification when price crosses threshold. Supports both absolute price and % change alerts.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: ['sends-message'],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token to monitor' },
        market_question: { type: 'string', description: 'Human-readable label' },
        condition: { type: 'string', enum: ['above', 'below', 'crosses'], description: 'Trigger when price goes above, below, or crosses the target' },
        target_price: { type: 'number', description: 'Target price (0.01-0.99)' },
        pct_change: { type: 'number', description: 'Or trigger on % change from current price' },
        repeat: { type: 'boolean', description: 'Re-arm after triggering', default: false },
        auto_trade: { type: 'object', description: 'Auto-place an order when alert triggers', properties: {
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          size: { type: 'number' },
          price: { type: 'number' },
        }},
      },
      required: ['token_id', 'condition'],
    },
  },

  {
    id: 'poly_list_alerts',
    name: 'List Alerts',
    description: 'List all active price alerts with their status and trigger history.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_delete_alert',
    name: 'Delete Alert',
    description: 'Remove a price alert.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        alert_id: { type: 'string' },
        delete_all: { type: 'boolean', description: 'Delete all alerts', default: false },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  APPROVAL QUEUE (for approval mode)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_pending_trades',
    name: 'Pending Trade Approvals',
    description: 'List trades waiting for human approval. Shows market, outcome, side, size, price, agent rationale, and time queued.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_approve_trade',
    name: 'Approve Trade',
    description: 'Approve a pending trade for execution. Can modify price/size before approving.',
    category: 'write',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        trade_id: { type: 'string' },
        modify_price: { type: 'number', description: 'Override the proposed price' },
        modify_size: { type: 'number', description: 'Override the proposed size' },
      },
      required: ['trade_id'],
    },
  },

  {
    id: 'poly_reject_trade',
    name: 'Reject Trade',
    description: 'Reject a pending trade with reason. Stored in trade log for strategy improvement.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        trade_id: { type: 'string' },
        reason: { type: 'string', description: 'Why this trade was rejected' },
      },
      required: ['trade_id'],
    },
  },

  {
    id: 'poly_auto_approve_rule',
    name: 'Auto-Approve Rule',
    description: 'Set rules for auto-approving trades in approval mode. E.g. auto-approve buys under $10, or auto-approve in specific categories. Reduces friction while maintaining oversight for large trades.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'remove'] },
        rule_id: { type: 'string', description: 'For remove action' },
        max_size: { type: 'number', description: 'Auto-approve orders up to this USDC size' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Auto-approve in these categories only' },
        sides: { type: 'array', items: { type: 'string', enum: ['BUY', 'SELL'] }, description: 'Auto-approve only buys, sells, or both' },
      },
      required: ['action'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  LEADERBOARD & SOCIAL
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_leaderboard',
    name: 'Trader Leaderboard',
    description: 'Top traders by profit, volume, or win rate. Follow smart money by tracking what the best traders are buying.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'all'], default: 'weekly' },
        limit: { type: 'number', default: 20 },
        sort_by: { type: 'string', enum: ['profit', 'volume', 'markets_traded'], default: 'profit' },
      },
    },
  },

  {
    id: 'poly_top_holders',
    name: 'Top Holders',
    description: 'Largest position holders for a market. Shows their entry size and direction. Smart money indicator.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string' },
        outcome: { type: 'string', enum: ['YES', 'NO', 'all'], default: 'all' },
        limit: { type: 'number', default: 20 },
      },
      required: ['market_id'],
    },
  },

  {
    id: 'poly_track_wallet',
    name: 'Track Wallet',
    description: 'Follow a specific wallet address to see their trades and positions in real-time. Use for copy-trading the leaderboard leaders.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Ethereum/Polygon wallet address to track' },
        include_positions: { type: 'boolean', default: true },
        include_trades: { type: 'boolean', default: true },
        limit: { type: 'number', default: 20 },
      },
      required: ['address'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  PAPER TRADING (Simulation)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_paper_trade',
    name: 'Paper Trade',
    description: 'Simulate a trade at current market prices without risking real money. Tracks simulated portfolio separately. Use for strategy testing before going live.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        price: { type: 'number' },
        size: { type: 'number' },
        market_question: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['token_id', 'side', 'size'],
    },
  },

  {
    id: 'poly_paper_portfolio',
    name: 'Paper Portfolio',
    description: 'View paper trading portfolio: simulated positions, P&L, and performance metrics. Compare with what real trading would have returned.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  // ═══════════════════════════════════════════════════════════════
  //  SYSTEM & HEALTH
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_api_status',
    name: 'API Status',
    description: 'Check Polymarket API health: CLOB API latency, Gamma API status, Polygon RPC health, and rate limit usage.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_gas_price',
    name: 'Gas Price',
    description: 'Current Polygon gas price and estimated transaction costs. Useful for timing blockchain transactions (deposits, withdrawals, redemptions).',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  {
    id: 'poly_heartbeat',
    name: 'Trading Heartbeat',
    description: 'Send a keepalive heartbeat to the CLOB API. Required to keep orders active during extended sessions. Auto-sent by the client, but can be triggered manually.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },

  // ═══════════════════════════════════════════════════════════════
  //  LEARNING & TRADE JOURNAL
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'poly_record_prediction',
    name: 'Record Prediction',
    description: 'Journal a prediction BEFORE trading. Logs what you think, why, and how confident you are. Essential for learning from outcomes.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' }, market_id: { type: 'string' }, market_question: { type: 'string' },
      predicted_outcome: { type: 'string' }, predicted_probability: { type: 'number' },
      confidence: { type: 'number' }, reasoning: { type: 'string' },
      signals_used: { type: 'array', items: { type: 'string' } }, category: { type: 'string' },
    }, required: ['token_id', 'predicted_outcome', 'predicted_probability', 'confidence'] },
  },
  {
    id: 'poly_resolve_prediction',
    name: 'Resolve Prediction',
    description: 'Record the outcome of a prediction after market settles. Updates calibration scores and strategy stats. This is the feedback loop.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      prediction_id: { type: 'string' }, actual_outcome: { type: 'string' }, pnl: { type: 'number' },
    }, required: ['prediction_id', 'actual_outcome'] },
  },
  {
    id: 'poly_trade_review',
    name: 'Trade Review',
    description: 'Review recent resolved trades to extract lessons. Shows what went right and wrong. Run regularly to learn from mistakes.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    id: 'poly_record_lesson',
    name: 'Record Lesson',
    description: 'Store a lesson learned from reviewing trades. These are recalled before future trades to prevent repeating mistakes.',
    category: 'write',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      lesson: { type: 'string' }, category: { type: 'string' },
      source_prediction_ids: { type: 'array', items: { type: 'string' } },
      importance: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
    }, required: ['lesson'] },
  },
  {
    id: 'poly_recall_lessons',
    name: 'Recall Lessons',
    description: 'Recall lessons from past trades before making new ones. Filtered by market category.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { category: { type: 'string' } } },
  },
  {
    id: 'poly_calibration',
    name: 'Calibration Check',
    description: 'Check prediction calibration — are you overconfident or underconfident at each confidence level? Essential for improving accuracy over time.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'poly_strategy_performance',
    name: 'Strategy Rankings',
    description: 'See which signals/strategies are making money and which are losing. Rankings by win rate and P&L. Use to stop using bad signals.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'poly_unresolved_predictions',
    name: 'Open Predictions',
    description: 'List predictions awaiting resolution. Check which markets have open predictions and resolve them when markets settle.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { market_id: { type: 'string' } } },
  },
];
