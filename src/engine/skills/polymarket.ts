import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket',
  name: 'Polymarket Trading',
  description: `Full-featured prediction market trading on Polymarket with a unified analysis pipeline chaining 8+ engines.

## MANDATORY TRADING PIPELINE — Follow This Order EVERY Time

### Pre-Trade Analysis (ALL required before ANY order):
1. **poly_recall_lessons** — Check past lessons to avoid repeating mistakes
2. **poly_batch_screen** or **poly_screen_markets** — Find opportunities (8 strategies, scoring 0-120)
3. **poly_full_analysis** — Run the COMPLETE unified pipeline on top candidates. Chains: screener → quant (Kelly/Black-Scholes/Monte Carlo/VaR) → analytics (regime/smart money/microstructure) → on-chain (orderbook/whales/flow) → social (Twitter/Reddit) → feeds (news/odds) → counter-intel (manipulation/risk). Returns synthesized score (0-100) with action recommendation.
   - For rapid decisions, use **poly_quick_analysis** instead (fast subset: quant + orderbook + regime + smart money + manipulation)
4. **poly_estimate_fill** — Simulate the order against the live orderbook (check slippage, liquidity, fill probability)

### Trade Execution (only after analysis passes):
5. **poly_record_prediction** — Journal your prediction BEFORE placing the trade
6. **poly_place_order** — Execute the trade

### Post-Trade Learning Loop (run periodically):
7. **poly_unresolved_predictions** — Check which predictions need resolution
8. **poly_resolve_prediction** — Log actual outcomes when markets settle
9. **poly_trade_review** — Review wins/losses, extract patterns
10. **poly_record_lesson** — Store actionable lessons for future recall
11. **poly_calibration** — Check if you're overconfident or underconfident
12. **poly_strategy_performance** — See which signals/strategies actually work

### Portfolio Management:
- **poly_portfolio_review** — Full portfolio review: position overview + correlation matrix + Kelly sizing + P&L attribution + recommendations
- **poly_portfolio_optimizer** — Concentration analysis, risk metrics
- **poly_drawdown_monitor** — Track and alert on drawdowns

### Continuous Monitoring (run poly_heartbeat every 15-30 min):
- Checks all price alerts and fires triggered ones
- Monitors open positions for P&L (flags >10% moves for take-profit/stop-loss)
- Detects settled markets to resolve predictions
- Verifies balance and API health
- Optionally scans for new opportunities (run_screener=true)

### Available Analysis Engines (all callable individually):
- **Quant**: poly_kelly_criterion, poly_binary_pricing, poly_bayesian_update, poly_monte_carlo, poly_technical_indicators, poly_volatility, poly_stat_arb, poly_value_at_risk, poly_entropy, poly_generate_signal
- **On-Chain**: poly_whale_tracker, poly_orderbook_depth, poly_onchain_flow, poly_wallet_profiler, poly_liquidity_map, poly_transaction_decoder
- **Social**: poly_twitter_sentiment, poly_polymarket_comments, poly_reddit_pulse, poly_telegram_monitor, poly_social_velocity
- **Feeds**: poly_official_sources, poly_odds_aggregator, poly_resolution_tracker, poly_breaking_news, poly_calendar_events
- **Analytics**: poly_market_correlation, poly_arbitrage_scanner, poly_regime_detector, poly_smart_money_index, poly_market_microstructure
- **Counter-Intel**: poly_manipulation_detector, poly_resolution_risk, poly_counterparty_analysis
- **Execution**: poly_sniper, poly_scale_in, poly_hedge, poly_exit_strategy

### Goals & Performance Tracking:
- **poly_goals** — Check performance goals at session start and after trades.
- Size positions and pick trades to hit targets. Quality over quantity.
- If drawdown exceeds target, STOP trading and wait.

### RULES:
- ALWAYS run poly_full_analysis or poly_quick_analysis before placing trades. The pipeline synthesizes data from 8+ engines into one actionable recommendation.
- If poly_estimate_fill shows slippage > 3% or insufficient liquidity, DO NOT trade.
- If poly_recall_lessons returns relevant warnings, factor them into your decision.
- Minimum confidence of 65% required to place a trade.
- Always include reasoning and signals_used in poly_record_prediction.
- Run poly_heartbeat regularly to catch alerts, position changes, and settled markets.
- When poly_heartbeat reports actions_needed, act on them immediately.

Built on the CLOB API (Polygon/USDC). Supports autonomous or approval-gated trading.`,
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
    name: 'Wallet Status',
    description: 'Check if a wallet is configured. Agents cannot create wallets — the user must create a Polymarket account at polymarket.com, then import the wallet private key via the enterprise dashboard Wallet tab.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
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
        order: { type: 'string', enum: ['volume', 'liquidity', 'startDate', 'endDate', 'createdAt'], default: 'volume' },
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
    id: 'poly_swap_to_usdce',
    name: 'Swap USDC to USDC.e',
    description: 'Swap native USDC to USDC.e (bridged) on Polygon via Uniswap V3. Polymarket ONLY accepts USDC.e for trading. Run this if wallet has native USDC but no USDC.e.',
    category: 'write',
    risk: 'high',
    skillId: 'polymarket',
    sideEffects: ['on-chain transaction', 'token swap'],
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount in USD to swap. Leave empty to swap entire native USDC balance.' },
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
    description: 'Redeem winning conditional tokens for USDC after a market resolves. Checks Data API for redeemable positions and calls CTF contract redeemPositions(). Use redeem_all=true to claim ALL redeemable positions. MUST be called after markets resolve — check regularly!',
    category: 'write',
    risk: 'medium',
    skillId: 'polymarket',
    sideEffects: ['financial'],
    parameters: {
      type: 'object',
      properties: {
        condition_id: { type: 'string', description: 'Specific conditionId to redeem' },
        redeem_all: { type: 'boolean', description: 'Redeem all redeemable positions (default: false)' },
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
    description: 'Place a limit or market order. IMPORTANT: You MUST complete the full analysis pipeline BEFORE calling this — poly_recall_lessons → poly_screen_markets → poly_analyze_market → poly_estimate_fill → poly_record_prediction → THEN poly_place_order. Never skip steps. Supports GTC, FOK, GTD order types. Includes pre-trade risk checks (position size, daily limits, balance, slippage protection). In approval mode, queues for human review. In autonomous mode, executes directly.',
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
    id: 'poly_transfer_funds',
    name: 'Transfer Funds',
    description: 'Transfer USDC/MATIC to a whitelisted withdrawal address. Always requires human approval. Destination must be pre-registered with 24h cooling period.',
    category: 'execute',
    risk: 'critical',
    skillId: 'polymarket',
    sideEffects: ['financial', 'network-request'],
    parameters: {
      type: 'object',
      properties: {
        to_label: { type: 'string', description: 'Label of whitelisted address' },
        amount: { type: 'number', description: 'Amount to transfer' },
        token: { type: 'string', description: 'USDC or MATIC' },
        reason: { type: 'string', description: 'Reason for transfer' },
      },
      required: ['to_label', 'amount'],
    },
  },

  {
    id: 'poly_goals',
    name: 'Performance Goals',
    description: 'Check and evaluate your performance goals. Track progress against daily/weekly/monthly targets set by your manager.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'evaluate', 'list'], description: 'check/evaluate/list goals' },
      },
      required: ['action'],
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
    name: 'Market Watcher',
    description: 'COMPREHENSIVE MARKET WATCHER — run every 15-30 min. Checks: price alerts (fires triggered), open positions (P&L, stop-loss/take-profit), unresolved predictions (settled markets), balance health, API status. Optional: run quick screener for new opportunities. Returns full status report with prioritized actions needed.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        check_alerts: { type: 'boolean', description: 'Check price alerts (default: true)' },
        check_positions: { type: 'boolean', description: 'Check open positions (default: true)' },
        check_predictions: { type: 'boolean', description: 'Check unresolved predictions (default: true)' },
        check_balance: { type: 'boolean', description: 'Check wallet/exchange balance (default: true)' },
        run_screener: { type: 'boolean', description: 'Run quick screener for new opportunities (default: false)' },
      },
    },
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
  {
    id: 'poly_watcher',
    name: 'Market Watcher',
    description: 'Manage automated market monitors (24/7 surveillance). Create, list, pause, resume, delete watchers. 12 types: price_level, price_change, market_scan, news_intelligence, crypto_price, resolution_watch, portfolio_drift, volume_surge, geopolitical, cross_signal, arbitrage_scan, sentiment_shift.',
    category: 'write',
    risk: 'medium',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { action: { type: 'string' }, watcher_type: { type: 'string' }, config: { type: 'object' } } },
  },
  {
    id: 'poly_watcher_config',
    name: 'Watcher AI Config',
    description: 'Configure AI model for background market analysis. Set provider, model, API key, daily budget. Supports xai/grok, openai, groq, deepseek, etc.',
    category: 'write',
    risk: 'medium',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { action: { type: 'string' }, ai_provider: { type: 'string' }, ai_model: { type: 'string' } } },
  },
  {
    id: 'poly_watcher_events',
    name: 'Watcher Signals',
    description: 'Check signals generated by market watchers. ALWAYS check at session start. Actions: check (unread), list, acknowledge, acknowledge_all.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { action: { type: 'string' } } },
  },
  {
    id: 'poly_setup_monitors',
    name: 'Quick Monitor Setup',
    description: 'One-click setup: creates comprehensive monitoring suite (crypto tracker, portfolio drift, resolution watcher, arbitrage scanner, AI news intelligence, geopolitical scanner, cross-signal correlator, sentiment trackers, and auto SL/TP for open positions).',
    category: 'write',
    risk: 'medium',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { keywords: { type: 'array' }, regions: { type: 'array' } } },
  },
  // ═══ EXECUTION ═══
  { id: 'poly_sniper', name: 'Sniper Order', description: 'Place a sniper order that triggers when price hits target.', category: 'write', risk: 'critical', skillId: 'polymarket', sideEffects: ['financial'], parameters: { type: 'object', properties: {} } },
  { id: 'poly_scale_in', name: 'Scale-In Order', description: 'DCA into a position with multiple orders at different prices.', category: 'write', risk: 'critical', skillId: 'polymarket', sideEffects: ['financial'], parameters: { type: 'object', properties: {} } },
  { id: 'poly_hedge', name: 'Hedge Position', description: 'Create a hedge for an existing position to reduce risk.', category: 'write', risk: 'critical', skillId: 'polymarket', sideEffects: ['financial'], parameters: { type: 'object', properties: {} } },
  { id: 'poly_exit_strategy', name: 'Exit Rules', description: 'Set automated exit rules (stop-loss, take-profit, trailing stop).', category: 'write', risk: 'high', skillId: 'polymarket', sideEffects: ['financial'], parameters: { type: 'object', properties: {} } },
  // ═══ SOCIAL INTELLIGENCE ═══
  { id: 'poly_twitter_sentiment', name: 'Twitter Sentiment', description: 'Analyze Twitter/X sentiment for a topic or market.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_polymarket_comments', name: 'Comment Sentiment', description: 'Analyze Polymarket comment sentiment on a market.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_reddit_pulse', name: 'Reddit Pulse', description: 'Check Reddit discussion volume and sentiment for a topic.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_telegram_monitor', name: 'Telegram Monitor', description: 'Monitor Telegram channels for relevant signals.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_social_velocity', name: 'Social Velocity', description: 'Track social mention velocity and acceleration.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ FEEDS & EVENTS ═══
  { id: 'poly_calendar_events', name: 'Event Calendar', description: 'Manage catalytic events that could move markets. Actions: add, remove, list, upcoming.', category: 'write', risk: 'low', skillId: 'polymarket', sideEffects: ['storage'], parameters: { type: 'object', properties: {} } },
  { id: 'poly_official_sources', name: 'Official Sources', description: 'Check official government/institutional sources for resolution data.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_odds_aggregator', name: 'Odds Aggregator', description: 'Compare Polymarket odds with other prediction platforms/bookmakers.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_resolution_tracker', name: 'Resolution Tracker', description: 'Track markets approaching resolution with countdown and criteria.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_breaking_news', name: 'Breaking News', description: 'Monitor breaking news feeds for market-moving events.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ ON-CHAIN INTELLIGENCE ═══
  { id: 'poly_whale_tracker', name: 'Whale Tracker', description: 'Track large wallet activity on Polymarket contracts.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_orderbook_depth', name: 'Orderbook Depth', description: 'Deep orderbook analysis with heatmap-style depth visualization.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_onchain_flow', name: 'On-Chain Flow', description: 'Analyze USDC flow into/out of Polymarket contracts.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_wallet_profiler', name: 'Wallet Profiler', description: 'Profile a wallet: win rate, volume, favorite markets, PnL.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_liquidity_map', name: 'Liquidity Map', description: 'Map liquidity distribution across price levels.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_transaction_decoder', name: 'Transaction Decoder', description: 'Decode and explain Polymarket on-chain transactions.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ ANALYTICS ═══
  { id: 'poly_market_correlation', name: 'Market Correlation', description: 'Find correlated markets and detect divergences.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_arbitrage_scanner', name: 'Arbitrage Scanner', description: 'Scan for arbitrage opportunities across related markets.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_regime_detector', name: 'Regime Detector', description: 'Detect market regime changes (trending, mean-reverting, volatile).', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_smart_money_index', name: 'Smart Money Index', description: 'Track smart money flow vs retail activity.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_market_microstructure', name: 'Market Microstructure', description: 'Analyze tick-level market microstructure (spread dynamics, fill rates).', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ PORTFOLIO ═══
  { id: 'poly_portfolio_optimizer', name: 'Portfolio Optimizer', description: 'Optimize portfolio allocation using Kelly criterion and risk constraints.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_drawdown_monitor', name: 'Drawdown Monitor', description: 'Monitor portfolio drawdown: record snapshots, check status, view history. Alerts when drawdown exceeds threshold.', category: 'write', risk: 'low', skillId: 'polymarket', sideEffects: ['storage'], parameters: { type: 'object', properties: {} } },
  { id: 'poly_pnl_attribution', name: 'P&L Attribution', description: 'Attribute P&L to individual trades, strategies, and market categories.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ QUANT ═══
  { id: 'poly_kelly_criterion', name: 'Kelly Criterion', description: 'Calculate optimal position size using Kelly criterion.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_binary_pricing', name: 'Binary Pricing', description: 'Price binary options using Black-Scholes and implied volatility.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_bayesian_update', name: 'Bayesian Update', description: 'Update probability estimates with new evidence using Bayes theorem.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_monte_carlo', name: 'Monte Carlo Simulation', description: 'Run Monte Carlo simulations on portfolio scenarios.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_technical_indicators', name: 'Technical Indicators', description: 'Calculate technical indicators (RSI, MACD, Bollinger, etc.) on price series.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_volatility', name: 'Volatility Analysis', description: 'Analyze historical and implied volatility.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_stat_arb', name: 'Statistical Arbitrage', description: 'Find statistical arbitrage opportunities using cointegration analysis.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_value_at_risk', name: 'Value at Risk', description: 'Calculate portfolio VaR and CVaR at various confidence levels.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_entropy', name: 'Market Entropy', description: 'Measure market entropy and information content of price movements.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_news_feed', name: 'News Feed', description: 'Fetch and analyze news articles related to a market topic. Scores sentiment and assesses market impact.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_sentiment_analysis', name: 'Sentiment Analysis', description: 'Analyze sentiment of text, headlines, or market comments. Returns score (-1 to 1) with confidence.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_generate_signal', name: 'Generate Signal', description: 'Composite trading signal combining orderbook, technicals, momentum, mean-reversion, fundamental edge, and volume analysis.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_correlation_matrix', name: 'Correlation Matrix', description: 'Calculate correlation matrix between multiple prediction market tokens for diversification analysis.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_efficiency_test', name: 'Efficiency Test', description: 'Test if a market is informationally efficient using runs test, autocorrelation, variance ratio, and entropy.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ COUNTER-INTELLIGENCE ═══
  { id: 'poly_manipulation_detector', name: 'Manipulation Detector', description: 'Detect potential market manipulation (wash trading, spoofing, layering).', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_resolution_risk', name: 'Resolution Risk', description: 'Assess risk of disputed or unexpected resolution.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_counterparty_analysis', name: 'Counterparty Analysis', description: 'Analyze who is on the other side of a trade and their track record.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  // ═══ SCREENER ═══
  {
    id: 'poly_screen_markets',
    name: 'Market Screener',
    description: 'Quant-level market screener with 8 strategies (best_opportunities, high_volume, closing_soon, mispriced, contested, safe_bets, new_markets, momentum). Scores markets 0-100 across liquidity, volume, spread, edge, timing, and momentum signals. Returns actionable trade recommendations.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket',
    sideEffects: [],
    parameters: { type: 'object', properties: { strategy: { type: 'string' }, limit: { type: 'number' }, min_volume: { type: 'number' }, min_liquidity: { type: 'number' } } },
  },
  // ═══ UNIFIED PIPELINE ═══
  { id: 'poly_full_analysis', name: 'Full Analysis Pipeline', description: 'COMPLETE unified analysis: screener → quant (Kelly/Monte Carlo/VaR) → analytics (regime/smart money) → on-chain (orderbook/whales/flow) → social (Twitter/Reddit) → feeds (news/odds) → counter-intel (manipulation/risk). Returns score 0-100 with action recommendation. ALWAYS run before trading.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { token_id: { type: 'string' }, market_slug: { type: 'string' }, market_question: { type: 'string' }, bankroll: { type: 'number' }, skip_slow: { type: 'boolean' } }, required: ['token_id'] } },
  { id: 'poly_quick_analysis', name: 'Quick Analysis', description: 'Fast analysis: quant + orderbook + regime + smart money + manipulation. Returns score, action, Kelly sizing, thesis. Use for rapid decisions.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { token_id: { type: 'string' }, market_question: { type: 'string' }, bankroll: { type: 'number' } }, required: ['token_id'] } },
  { id: 'poly_batch_screen', name: 'Batch Screen', description: 'Screen and rank multiple markets. 8 strategies: momentum, contested, best_opportunities, high_volume, closing_soon, mispriced, safe_bets, new_markets.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' }, strategy: { type: 'string' } } } },
  { id: 'poly_portfolio_review', name: 'Portfolio Review', description: 'Complete portfolio review: positions + correlation matrix + Kelly sizing + P&L attribution + recommendations.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { positions: { type: 'string' }, bankroll: { type: 'number' } }, required: ['positions', 'bankroll'] } },
  // ═══ OPTIMIZER ═══
  { id: 'poly_daily_scorecard', name: 'Daily Scorecard', description: 'Daily trading dashboard: real-time P&L vs target, win rate, capital utilization, and whether to keep trading or stop.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { daily_target: { type: 'number' }, max_daily_loss: { type: 'number' } } } },
  { id: 'poly_momentum_scanner', name: 'Momentum Scanner', description: 'Scan all positions and watchlist for momentum signals, price velocity, and breakout alerts.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { min_velocity: { type: 'number' }, lookback_hours: { type: 'number' } } } },
  { id: 'poly_quick_edge', name: 'Quick Edge Finder', description: 'Fast edge detection: find immediate trading opportunities from mispriced markets, unusual volume, or news catalysts.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { min_edge: { type: 'number' }, max_results: { type: 'number' } } } },
  { id: 'poly_position_heatmap', name: 'Position Heatmap', description: 'Visual heatmap of all positions: size, P&L, risk, correlation, and time-to-expiry.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: {} } },
  { id: 'poly_profit_lock', name: 'Profit Lock', description: 'Identify positions with unrealized profits that should be locked in. Suggests exit timing and partial takes.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { min_profit_pct: { type: 'number' } } } },
  { id: 'poly_capital_recycler', name: 'Capital Recycler', description: 'Find idle capital in low-conviction positions that could be recycled into higher-conviction opportunities.', category: 'read', risk: 'low', skillId: 'polymarket', sideEffects: [], parameters: { type: 'object', properties: { min_idle_hours: { type: 'number' } } } },
];
