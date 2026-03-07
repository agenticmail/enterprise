/**
 * Polymarket Trading Tool Implementation
 * 
 * Full-featured prediction market trading via Polymarket CLOB + Gamma APIs.
 * Supports approval-gated and autonomous modes with comprehensive risk management.
 * 
 * Architecture:
 * - Read-only: Direct Gamma/CLOB API (no auth)
 * - Trading: @polymarket/clob-client SDK (auth required)
 * - Config/alerts/paper: Local agent storage
 * 
 * Speed: Connection pooling, 5min market cache, parallel fetches, 10s timeouts
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import {
  ensureSDK, getClobClient, initPolymarketDB, saveWalletCredentials, generateWallet,
  loadConfig, saveConfig, getDailyCounter, incrementDailyCounter, pauseTrading, resumeTrading,
  savePendingTrade, getPendingTrades, resolvePendingTrade, logTrade,
  saveAlert, getAlerts, deleteAlert, deleteAllAlerts,
  savePaperPosition, getPaperPositions,
  getAutoApproveRules, saveAutoApproveRule, deleteAutoApproveRule,
  initLearningDB, recordPrediction, resolvePrediction, storeLesson,
  recallLessons, getCalibration, getStrategyPerformance,
  getUnresolvedPredictions, getResolvedPredictions, markLessonsExtracted,
  type TradingConfig,
} from './polymarket-runtime.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
const CHAIN_ID = 137;

// ─── Caches ──────────────────────────────────────────────────
const marketCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60_000;

// Keep the local interface for backward compat but delegate to DB
interface _TradingConfig {
  mode: 'approval' | 'autonomous' | 'paper';
  maxPositionSize: number;
  maxOrderSize: number;
  maxTotalExposure: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  maxDrawdownPct: number;
  allowedCategories: string[];
  blockedCategories: string[];
  blockedMarkets: string[];
  minLiquidity: number;
  minVolume: number;
  maxSpreadPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  rebalanceInterval: string;
  notificationChannel: string;
  notifyOn: string[];
  cashReservePct: number;
}

interface PendingTrade {
  id: string;
  agentId: string;
  tokenId: string;
  side: string;
  price: number | null;
  size: number;
  orderType: string;
  tickSize: string;
  negRisk: boolean;
  marketQuestion: string;
  outcome: string;
  rationale: string;
  urgency: string;
  createdAt: string;
}

interface PriceAlert {
  id: string;
  tokenId: string;
  marketQuestion: string;
  condition: string;
  targetPrice?: number;
  pctChange?: number;
  basePrice?: number;
  repeat: boolean;
  autoTrade?: { side: string; size: number; price?: number };
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

interface PaperPosition {
  tokenId: string;
  side: string;
  entryPrice: number;
  size: number;
  marketQuestion: string;
  rationale: string;
  createdAt: string;
}

interface AutoApproveRule {
  id: string;
  maxSize: number;
  categories: string[];
  sides: string[];
}

interface DailyCounter {
  count: number;
  loss: number;
  date: string;
}

const agentConfigs = new Map<string, TradingConfig>();
const pendingTrades = new Map<string, PendingTrade>();
const priceAlerts = new Map<string, PriceAlert[]>();
const paperPositions = new Map<string, PaperPosition[]>();
const autoApproveRules = new Map<string, AutoApproveRule[]>();
const dailyCounters = new Map<string, DailyCounter>();
const circuitBreakerState = new Map<string, { paused: boolean; reason: string; pausedAt?: string }>();
const walletState = new Map<string, { connected: boolean; address?: string; sigType?: number }>();

// ─── Helpers ─────────────────────────────────────────────────

async function apiFetch(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs || 10_000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  } finally {
    clearTimeout(t);
  }
}

function cached(key: string): any | null {
  const e = marketCache.get(key);
  return (e && Date.now() - e.ts < CACHE_TTL) ? e.data : null;
}

function setCache(key: string, data: any) {
  marketCache.set(key, { data, ts: Date.now() });
}

function getConfig(agentId: string): TradingConfig {
  return agentConfigs.get(agentId) || {
    mode: 'approval',
    maxPositionSize: 100,
    maxOrderSize: 50,
    maxTotalExposure: 500,
    maxDailyTrades: 10,
    maxDailyLoss: 50,
    maxDrawdownPct: 20,
    allowedCategories: [],
    blockedCategories: [],
    blockedMarkets: [],
    minLiquidity: 0,
    minVolume: 0,
    maxSpreadPct: 100,
    stopLossPct: 0,
    takeProfitPct: 0,
    trailingStopPct: 0,
    rebalanceInterval: 'never',
    notificationChannel: '',
    notifyOn: ['trade_filled', 'stop_loss', 'circuit_breaker', 'market_resolved'],
    cashReservePct: 20,
  };
}

function getLocalDailyCounter(agentId: string): DailyCounter {
  const today = new Date().toISOString().split('T')[0];
  let c = dailyCounters.get(agentId);
  if (!c || c.date !== today) {
    c = { count: 0, loss: 0, date: today };
    dailyCounters.set(agentId, c);
  }
  return c;
}

function preTradeChecks(agentId: string, config: TradingConfig, params: any): string | null {
  // Circuit breaker
  const cb = circuitBreakerState.get(agentId);
  if (cb?.paused) return `Trading paused by circuit breaker: ${cb.reason}`;

  // Size limits
  if (params.size > config.maxOrderSize) return `Order size $${params.size} exceeds max order size $${config.maxOrderSize}`;
  if (params.size > config.maxPositionSize) return `Position size $${params.size} exceeds max position size $${config.maxPositionSize}`;

  // Daily limits
  const counter = getLocalDailyCounter(agentId);
  if (counter.count >= config.maxDailyTrades) return `Daily trade limit (${config.maxDailyTrades}) reached`;
  if (config.maxDailyLoss > 0 && counter.loss >= config.maxDailyLoss) {
    circuitBreakerState.set(agentId, { paused: true, reason: 'Daily loss limit hit', pausedAt: new Date().toISOString() });
    return `Daily loss limit ($${config.maxDailyLoss}) reached — circuit breaker activated`;
  }

  // Category restrictions
  // (would need market metadata to check — skip if not available)

  // Blocked markets
  if (config.blockedMarkets.length > 0 && params.market_id && config.blockedMarkets.includes(params.market_id)) {
    return `Market ${params.market_id} is blocked`;
  }

  return null;
}

function checkAutoApprove(agentId: string, trade: PendingTrade): boolean {
  const rules = autoApproveRules.get(agentId) || [];
  for (const rule of rules) {
    if (trade.size <= rule.maxSize) {
      if (rule.sides.length > 0 && !rule.sides.includes(trade.side)) continue;
      // Category check would require market metadata
      return true;
    }
  }
  return false;
}

/**
 * Execute an order via CLOB SDK. Auto-installs SDK if needed.
 * Logs the trade to DB regardless of outcome.
 */
async function executeOrder(agentId: string, db: any, tradeId: string, p: any, source: string): Promise<any> {
  const sdk = await ensureSDK();
  if (!sdk.ready) {
    // SDK not ready — log as pending_sdk and store in DB
    await logTrade(db, {
      id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
      outcome: p.outcome, side: p.side, price: p.price, size: p.size,
      status: 'pending_sdk', rationale: p.rationale,
    });
    return jsonResult({
      status: 'pending_sdk',
      trade_id: tradeId,
      message: `Order logged. SDK installing: ${sdk.message}. Will execute when ready.`,
      order: { tokenId: p.token_id, side: p.side, price: p.price, size: p.size },
      persisted: true,
    });
  }

  // Get the CLOB client
  const client = await getClobClient(agentId, db);
  if (!client) {
    await logTrade(db, {
      id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
      outcome: p.outcome, side: p.side, price: p.price, size: p.size,
      status: 'no_wallet', rationale: p.rationale,
    });
    return errorResult('No wallet configured. Use poly_create_account or poly_setup_wallet first.');
  }

  try {
    // Build the order using CLOB SDK
    const { Side } = await import('@polymarket/clob-client' as any);
    const side = p.side === 'BUY' ? Side.BUY : Side.SELL;

    const orderArgs: any = {
      tokenID: p.token_id,
      side,
      size: p.size,
    };
    if (p.price) orderArgs.price = p.price;
    if (p.tick_size) orderArgs.feeRateBps = undefined; // SDK handles fees
    if (p.neg_risk !== undefined) orderArgs.negRisk = p.neg_risk;

    // Create and submit order
    const signedOrder = await client.client.createOrder(orderArgs);
    const response = await client.client.postOrder(signedOrder, p.order_type || 'GTC');

    // Log success
    await logTrade(db, {
      id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
      outcome: p.outcome, side: p.side, price: p.price, size: p.size,
      status: 'placed', rationale: p.rationale, clobOrderId: response?.orderID || response?.id,
    });

    return jsonResult({
      status: 'placed',
      trade_id: tradeId,
      clob_order_id: response?.orderID || response?.id,
      source,
      message: `Order placed: ${p.side} ${p.size} shares at ${p.price || 'market'}`,
      response,
      persisted: true,
    });
  } catch (e: any) {
    // Log failure
    await logTrade(db, {
      id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
      outcome: p.outcome, side: p.side, price: p.price, size: p.size,
      status: 'failed', rationale: `${p.rationale || ''} [ERROR: ${e.message}]`,
    });

    return errorResult(`Order execution failed: ${e.message}`);
  }
}

function slimMarket(m: any) {
  return {
    id: m.conditionId || m.id,
    question: m.question,
    slug: m.slug,
    category: m.tags?.[0],
    outcomes: m.outcomes,
    outcomePrices: m.outcomePrices,
    clobTokenIds: m.clobTokenIds,
    volume: m.volume,
    liquidity: m.liquidity,
    endDate: m.endDate,
    active: m.active,
    closed: m.closed,
    resolved: m.resolved,
    negRisk: m.negRisk,
    tickSize: m.minimumTickSize,
  };
}

// ─── Tool Factory ────────────────────────────────────────────

export function createPolymarketTools(options: ToolCreationOptions): AnyAgentTool[] {
  const agentId = options.agentId || 'default';
  const db = (options as any).engineDb;

  // Initialize DB tables on first call
  if (db) {
    initPolymarketDB(db).catch((e: any) => console.warn('[polymarket] DB init:', e.message));
    initLearningDB(db).catch((e: any) => console.warn('[polymarket] Learning DB init:', e.message));
  }

  const tools: AnyAgentTool[] = [

    // ═══ ACCOUNT & ONBOARDING ═══════════════════════════════════

    {
      name: 'poly_create_account',
      description: 'Create a new Polymarket account using the browser. Generates a fresh Ethereum wallet, navigates to polymarket.com, and completes the signup flow. The wallet credentials are stored securely in the enterprise database. The agent handles the entire flow autonomously.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        method: { type: 'string', description: '"auto" = agent creates wallet + signs up via browser. "import" = user provides existing private key.', enum: ['auto', 'import'] },
        private_key: { type: 'string', description: 'For import method: existing Ethereum private key' },
        funder_address: { type: 'string', description: 'For import method: Polymarket profile address' },
        signature_type: { type: 'number', description: '0=EOA, 1=Email/Magic, 2=Browser proxy', default: 0 },
      }},
      async execute(_id: string, p: any) {
        try {
          if (p.method === 'import' && p.private_key) {
            // User providing their own key
            const sdk = await ensureSDK();

            let address = '(pending SDK)';
            let funder = p.funder_address;
            if (sdk.ready) {
              try {
                const { Wallet } = await import('@ethersproject/wallet' as any);
                const key = p.private_key.startsWith('0x') ? p.private_key : `0x${p.private_key}`;
                const wallet = new Wallet(key);
                address = wallet.address;
                funder = funder || address;
              } catch (e: any) {
                return errorResult(`Invalid private key: ${e.message}`);
              }
            }

            // Store in DB
            await saveWalletCredentials(agentId, db, {
              privateKey: p.private_key.startsWith('0x') ? p.private_key : `0x${p.private_key}`,
              funderAddress: funder,
              signatureType: p.signature_type || 0,
            });

            // Try to derive API creds immediately
            if (sdk.ready) {
              try {
                const client = await getClobClient(agentId, db);
                if (client) {
                  return jsonResult({
                    status: 'connected',
                    method: 'import',
                    address: client.address,
                    funder: client.funderAddress,
                    message: 'Wallet imported and CLOB API credentials derived. Ready to trade.',
                    next_steps: ['Fund wallet with USDC on Polygon', 'Configure trading with poly_set_config', 'Start with poly_search_markets'],
                  });
                }
              } catch {}
            }

            return jsonResult({
              status: 'stored',
              method: 'import',
              address,
              message: 'Wallet credentials stored. SDK will auto-install on first trade attempt.',
              sdk_status: sdk.ready ? 'ready' : sdk.message,
            });
          }

          // Auto-create: generate wallet + browser signup
          const wallet = await generateWallet();
          if (!wallet) return errorResult('Failed to generate wallet. SDK may need to be installed.');

          // Store the generated wallet
          await saveWalletCredentials(agentId, db, {
            privateKey: wallet.privateKey,
            funderAddress: wallet.address,
            signatureType: 0,
          });

          return jsonResult({
            status: 'wallet_generated',
            address: wallet.address,
            message: 'Fresh wallet generated and stored in database. To complete Polymarket account setup:',
            next_steps: [
              '1. Use the browser tool to navigate to https://polymarket.com and sign up with this wallet',
              '2. Or send USDC directly to the wallet address on Polygon and trade via API',
              '3. The agent can navigate polymarket.com to complete signup if browser access is available',
            ],
            funding: {
              address: wallet.address,
              network: 'Polygon (MATIC)',
              token: 'USDC',
            },
            note: 'Private key is stored securely in the enterprise database. Never share it.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_check_sdk',
      description: 'Check if the Polymarket SDK is installed and ready. If not installed, auto-installs it. Use this to verify the system is ready for trading before attempting any authenticated operations.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const result = await ensureSDK();
        const walletClient = await getClobClient(agentId, db);
        return jsonResult({
          sdk_ready: result.ready,
          sdk_message: result.message,
          wallet_connected: !!walletClient,
          wallet_address: walletClient?.address || null,
          funder_address: walletClient?.funderAddress || null,
        });
      },
    },

    // ═══ MARKET DISCOVERY ═══════════════════════════════════════

    {
      name: 'poly_search_markets',
      description: 'Search prediction markets',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        query: { type: 'string' }, category: { type: 'string' },
        active: { type: 'boolean' }, closed: { type: 'boolean' },
        limit: { type: 'number' }, offset: { type: 'number' },
        order: { type: 'string' }, ascending: { type: 'boolean' },
        min_volume: { type: 'number' }, min_liquidity: { type: 'number' },
        end_date_before: { type: 'string' }, end_date_after: { type: 'string' },
      }},
      async execute(_id: string, p: any) {
        try {
          const qs = new URLSearchParams();
          if (p.query) qs.set('search', p.query);
          if (p.category) qs.set('tag', p.category);
          if (p.active !== undefined) qs.set('active', String(p.active));
          if (p.closed !== undefined) qs.set('closed', String(p.closed));
          qs.set('limit', String(p.limit || 20));
          if (p.offset) qs.set('offset', String(p.offset));
          if (p.order) qs.set('order', p.order);
          if (p.ascending !== undefined) qs.set('ascending', String(p.ascending));
          if (p.end_date_before) qs.set('end_date_max', p.end_date_before);
          if (p.end_date_after) qs.set('end_date_min', p.end_date_after);

          const raw = await apiFetch(`${GAMMA_API}/markets?${qs}`);
          let markets = (Array.isArray(raw) ? raw : []).map(slimMarket);

          // Post-filter by volume/liquidity (Gamma API may not support these filters)
          if (p.min_volume) markets = markets.filter((m: any) => parseFloat(m.volume || '0') >= p.min_volume);
          if (p.min_liquidity) markets = markets.filter((m: any) => parseFloat(m.liquidity || '0') >= p.min_liquidity);

          return jsonResult({ count: markets.length, markets });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_market',
      description: 'Get market details',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' } }, required: ['market_id'] },
      async execute(_id: string, p: any) {
        try {
          const c = cached(`market:${p.market_id}`);
          if (c) return jsonResult(c);

          let m;
          try { m = await apiFetch(`${GAMMA_API}/markets/${p.market_id}`); }
          catch { const arr = await apiFetch(`${GAMMA_API}/markets?slug=${p.market_id}&limit=1`); m = Array.isArray(arr) && arr[0]; }
          if (!m) return errorResult('Market not found');

          const result = {
            ...slimMarket(m),
            description: m.description,
            startDate: m.startDate,
            resolutionSource: m.resolutionSource,
            resolutionDetails: m.resolutionDetails,
            creator: m.creator,
            eventId: m.eventId,
          };
          setCache(`market:${p.market_id}`, result);
          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_event',
      description: 'Get event with all sub-markets',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { event_id: { type: 'string' } }, required: ['event_id'] },
      async execute(_id: string, p: any) {
        try {
          const event = await apiFetch(`${GAMMA_API}/events/${p.event_id}`);
          if (!event) return errorResult('Event not found');
          return jsonResult({
            id: event.id,
            title: event.title || event.name,
            description: event.description,
            markets: (event.markets || []).map(slimMarket),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_prices',
      description: 'Get current prices',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, token_ids: { type: 'array', items: { type: 'string' } }, side: { type: 'string' },
      }},
      async execute(_id: string, p: any) {
        try {
          const ids = p.token_ids || (p.token_id ? [p.token_id] : []);
          if (ids.length === 0) return errorResult('Provide token_id or token_ids');

          // Parallel fetch for speed
          const results = await Promise.all(ids.map(async (tid: string) => {
            const [mid, price] = await Promise.all([
              apiFetch(`${CLOB_API}/midpoint?token_id=${tid}`).catch(() => null),
              p.side ? apiFetch(`${CLOB_API}/price?token_id=${tid}&side=${p.side}`).catch(() => null) : null,
            ]);
            return { tokenId: tid, midpoint: mid?.mid, price: price?.price };
          }));

          return jsonResult(ids.length === 1 ? results[0] : { prices: results });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_orderbook',
      description: 'Get order book',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { token_id: { type: 'string' }, depth: { type: 'number' } }, required: ['token_id'] },
      async execute(_id: string, p: any) {
        try {
          const book = await apiFetch(`${CLOB_API}/book?token_id=${p.token_id}`);
          if (p.depth && book) {
            if (book.bids) book.bids = book.bids.slice(0, p.depth);
            if (book.asks) book.asks = book.asks.slice(0, p.depth);
          }
          // Add computed spread
          const bestBid = book?.bids?.[0]?.price;
          const bestAsk = book?.asks?.[0]?.price;
          if (bestBid && bestAsk) {
            book._spread = (parseFloat(bestAsk) - parseFloat(bestBid)).toFixed(4);
            book._spreadPct = ((parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestAsk) * 100).toFixed(2) + '%';
            book._midpoint = ((parseFloat(bestAsk) + parseFloat(bestBid)) / 2).toFixed(4);
          }
          return jsonResult(book);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_trades',
      description: 'Get recent trades',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, market_id: { type: 'string' },
        limit: { type: 'number' }, before: { type: 'string' }, min_size: { type: 'number' },
      }},
      async execute(_id: string, p: any) {
        try {
          const qs = new URLSearchParams();
          if (p.token_id) qs.set('asset_id', p.token_id);
          if (p.market_id) qs.set('market', p.market_id);
          qs.set('limit', String(p.limit || 50));
          if (p.before) qs.set('before', p.before);
          let trades = await apiFetch(`${CLOB_API}/trades?${qs}`);
          if (p.min_size && Array.isArray(trades)) {
            trades = trades.filter((t: any) => parseFloat(t.size || '0') >= p.min_size);
          }
          return jsonResult(trades);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_price_history',
      description: 'Historical price timeseries',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, market_id: { type: 'string' },
        interval: { type: 'string' }, start_ts: { type: 'string' }, end_ts: { type: 'string' },
        fidelity: { type: 'number' },
      }},
      async execute(_id: string, p: any) {
        try {
          const qs = new URLSearchParams();
          if (p.market_id) qs.set('market', p.market_id);
          if (p.token_id) qs.set('asset_id', p.token_id);
          if (p.fidelity) qs.set('fidelity', String(p.fidelity));
          if (p.start_ts) qs.set('startTs', String(new Date(p.start_ts).getTime() / 1000));
          if (p.end_ts) qs.set('endTs', String(new Date(p.end_ts).getTime() / 1000));

          const history = await apiFetch(`${GAMMA_API}/markets/${p.market_id || p.token_id}/timeseries?${qs}`).catch(() => null);
          if (!history) {
            // Fallback: fetch from CLOB trades and aggregate
            return jsonResult({ status: 'limited', message: 'Timeseries API not available for this market. Use poly_get_trades for raw trade data.' });
          }
          return jsonResult(history);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_trending_markets',
      description: 'Trending markets',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        limit: { type: 'number' }, category: { type: 'string' }, sort_by: { type: 'string' },
      }},
      async execute(_id: string, p: any) {
        try {
          const qs = new URLSearchParams({ active: 'true', closed: 'false', order: 'volume', ascending: 'false', limit: String(p.limit || 20) });
          if (p.category) qs.set('tag', p.category);

          // For closing_soon, sort by end_date ascending
          if (p.sort_by === 'closing_soon') { qs.set('order', 'end_date'); qs.set('ascending', 'true'); }
          if (p.sort_by === 'new') { qs.set('order', 'created_at'); qs.set('ascending', 'false'); }

          const raw = await apiFetch(`${GAMMA_API}/markets?${qs}`);
          return jsonResult({ count: (raw || []).length, markets: (Array.isArray(raw) ? raw : []).map(slimMarket) });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_market_comments',
      description: 'Market comments/discussion',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, limit: { type: 'number' }, order: { type: 'string' } }, required: ['market_id'] },
      async execute(_id: string, p: any) {
        try {
          const qs = new URLSearchParams({ limit: String(p.limit || 30) });
          const comments = await apiFetch(`${GAMMA_API}/comments?market=${p.market_id}&${qs}`);
          return jsonResult(comments);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_related_markets',
      description: 'Find related markets',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, limit: { type: 'number' } }, required: ['market_id'] },
      async execute(_id: string, p: any) {
        try {
          // Get market's event, then all markets in that event
          const market = await apiFetch(`${GAMMA_API}/markets/${p.market_id}`).catch(() => null);
          if (!market?.eventId) return jsonResult({ related: [], message: 'No event association found' });

          const eventMarkets = await apiFetch(`${GAMMA_API}/markets?event_id=${market.eventId}&limit=${p.limit || 10}`);
          const related = (Array.isArray(eventMarkets) ? eventMarkets : [])
            .filter((m: any) => (m.conditionId || m.id) !== p.market_id)
            .map(slimMarket);
          return jsonResult({ eventId: market.eventId, related });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_market_news',
      description: 'Related news for a market',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, query: { type: 'string' }, hours: { type: 'number' }, limit: { type: 'number' } }},
      async execute(_id: string, p: any) {
        try {
          // Get market question for search
          let query = p.query;
          if (!query && p.market_id) {
            const m = cached(`market:${p.market_id}`) || await apiFetch(`${GAMMA_API}/markets/${p.market_id}`).catch(() => null);
            query = m?.question;
          }
          if (!query) return errorResult('Provide market_id or query');
          return jsonResult({
            status: 'use_web_search',
            message: `Search news for: "${query}". Use the enterprise-http or web search tools to find related articles.`,
            suggested_query: query,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ═══ WALLET & ACCOUNT ═══════════════════════════════════════

    {
      name: 'poly_setup_wallet',
      description: 'Initialize trading wallet — auto-installs SDK if needed, stores credentials in enterprise DB',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        private_key: { type: 'string' }, funder_address: { type: 'string' },
        signature_type: { type: 'number' }, rpc_url: { type: 'string' },
      }, required: ['private_key'] },
      async execute(_id: string, p: any) {
        try {
          // Auto-install SDK if needed
          const sdk = await ensureSDK();
          if (!sdk.ready) {
            // Store creds anyway so they're ready when SDK installs
            await saveWalletCredentials(agentId, db, {
              privateKey: p.private_key.startsWith('0x') ? p.private_key : `0x${p.private_key}`,
              funderAddress: p.funder_address,
              signatureType: p.signature_type || 0,
              rpcUrl: p.rpc_url,
            });
            return jsonResult({
              status: 'credentials_stored',
              message: `Wallet credentials saved to database. SDK status: ${sdk.message}`,
              note: 'Credentials are persisted — they will survive server restarts. SDK will auto-install on next attempt.',
            });
          }

          // Store in DB first
          await saveWalletCredentials(agentId, db, {
            privateKey: p.private_key.startsWith('0x') ? p.private_key : `0x${p.private_key}`,
            funderAddress: p.funder_address,
            signatureType: p.signature_type || 0,
            rpcUrl: p.rpc_url,
          });

          // Initialize client (loads from DB, derives API creds if needed)
          const client = await getClobClient(agentId, db);
          if (!client) return errorResult('Failed to initialize CLOB client after saving credentials');

          walletState.set(agentId, { connected: true, address: client.funderAddress, sigType: p.signature_type || 0 });

          return jsonResult({
            status: 'connected',
            address: client.funderAddress,
            signer_address: client.address,
            signature_type: p.signature_type || 0,
            persisted: true,
            note: 'Credentials stored in enterprise database. Will survive server restarts and redeployments.',
          });
        } catch (e: any) { return errorResult(`Wallet setup failed: ${e.message}`); }
      },
    },

    {
      name: 'poly_wallet_status',
      description: 'Check wallet connection status',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const client = await getClobClient(agentId, db);
        if (!client) return jsonResult({ connected: false, message: 'No wallet connected. Run poly_create_account or poly_setup_wallet.' });
        return jsonResult({ connected: true, address: client.address, funder: client.funderAddress, signatureType: client.signatureType });
      },
    },

    {
      name: 'poly_set_allowances',
      description: 'Set token allowances for trading',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { token: { type: 'string' } }},
      async execute(_id: string, p: any) {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected. Run poly_create_account first.');
        try {
          const tx = await client.client.setAllowances();
          return jsonResult({ status: 'allowances_set', transaction: tx });
        } catch (e: any) {
          return jsonResult({ status: 'requires_funding', message: `Set allowances failed: ${e.message}. Ensure wallet has MATIC for gas.` });
        }
      },
    },

    // ═══ BALANCE & FUNDS ════════════════════════════════════════

    {
      name: 'poly_get_balance',
      description: 'Get wallet balance',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        try {
          const balance = await client.client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
          return jsonResult({ address: client.address, balance });
        } catch (e: any) {
          return jsonResult({ address: client.address, status: 'balance_check_failed', message: e.message });
        }
      },
    },

    {
      name: 'poly_deposit',
      description: 'Deposit instructions',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { amount: { type: 'number' }, source_chain: { type: 'string' } }},
      async execute() {
        const client = await getClobClient(agentId, db);
        const addr = client?.address || '(connect wallet first)';
        return jsonResult({
          deposit_address: addr,
          network: 'Polygon (MATIC)',
          token: 'USDC (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)',
          instructions: [
            `1. Send USDC on Polygon to: ${addr}`,
            '2. Wait for confirmation (~2 seconds on Polygon)',
            '3. Funds will appear in your Polymarket balance',
            'Note: You can also deposit via polymarket.com bridge from Ethereum, Arbitrum, Base, or Optimism.',
          ],
        });
      },
    },

    {
      name: 'poly_withdraw',
      description: 'Withdraw USDC',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { amount: { type: 'number' }, to_address: { type: 'string' } }, required: ['amount', 'to_address'] },
      async execute(_id: string, p: any) {
        const config = await loadConfig(agentId, db);
        if (config.mode === 'approval') {
          return jsonResult({ status: 'requires_approval', message: `Withdrawal of $${p.amount} USDC to ${p.to_address} requires human approval.` });
        }
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        return jsonResult({ status: 'requires_manual', message: `Withdraw $${p.amount} USDC to ${p.to_address}. Use polymarket.com/portfolio for manual withdrawals.` });
      },
    },

    // ═══ PORTFOLIO & POSITIONS ══════════════════════════════════

    {
      name: 'poly_get_positions',
      description: 'Get open positions',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, min_value: { type: 'number' }, sort_by: { type: 'string' } }},
      async execute(_id: string, p: any) {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        try {
          const positions = await apiFetch(`${GAMMA_API}/positions?user=${client.address}&limit=100`).catch(() => null);
          if (!positions) return jsonResult({ address: client.address, status: 'no_positions' });
          return jsonResult(positions);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_closed_positions',
      description: 'Get closed positions',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { limit: { type: 'number' }, offset: { type: 'number' }, market_id: { type: 'string' }, won_only: { type: 'boolean' }, lost_only: { type: 'boolean' } }},
      async execute(_id: string, p: any) {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        try {
          const qs = new URLSearchParams({ user: client.address, limit: String(p.limit || 50) });
          if (p.offset) qs.set('offset', String(p.offset));
          const positions = await apiFetch(`${GAMMA_API}/positions/closed?${qs}`).catch(() => null);
          return jsonResult(positions || { address: client.address, status: 'no_closed_positions' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_redeem',
      description: 'Redeem winning tokens',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, redeem_all: { type: 'boolean' }, redeem_pairs: { type: 'boolean' } }},
      async execute() {
        return jsonResult({ status: 'requires_sdk', message: 'Redemption requires authenticated CLOB client with blockchain tx capability.' });
      },
    },

    {
      name: 'poly_portfolio_summary',
      description: 'Portfolio analytics',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { period: { type: 'string' }, include_closed: { type: 'boolean' }, include_charts: { type: 'boolean' } }},
      async execute(_id: string, p: any) {
        const config = await loadConfig(agentId, db);
        const counter = await getDailyCounter(agentId, db);
        const paperPos = await getPaperPositions(agentId, db);
        const client = await getClobClient(agentId, db);

        return jsonResult({
          wallet: client?.address || 'Not connected',
          config_mode: config.mode,
          daily_trades: `${counter.count}/${config.maxDailyTrades}`,
          daily_loss: `$${counter.loss}/$${config.maxDailyLoss}`,
          circuit_breaker: counter.paused ? `PAUSED: ${counter.reason}` : 'OK',
          paper_positions: paperPos.length,
          sdk_ready: (await ensureSDK()).ready,
        });
      },
    },

    // ═══ ORDER MANAGEMENT ═══════════════════════════════════════

    {
      name: 'poly_place_order',
      description: 'Place an order',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, side: { type: 'string' },
        price: { type: 'number' }, size: { type: 'number' },
        order_type: { type: 'string' }, expiration: { type: 'string' },
        max_slippage_pct: { type: 'number' }, tick_size: { type: 'string' },
        neg_risk: { type: 'boolean' }, market_question: { type: 'string' },
        outcome: { type: 'string' }, rationale: { type: 'string' }, urgency: { type: 'string' },
      }, required: ['token_id', 'side', 'size'] },
      async execute(_id: string, p: any) {
        const config = await loadConfig(agentId, db);

        // Pre-trade risk checks
        const check = preTradeChecks(agentId, config, p);
        if (check) return errorResult(check);

        // Paper trading mode
        if (config.mode === 'paper') {
          const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`).catch(() => ({ mid: p.price || 0.5 }));
          const fillPrice = p.price || parseFloat(mid?.mid || '0.5');

          await savePaperPosition(db, {
            agentId, tokenId: p.token_id, side: p.side, entryPrice: fillPrice,
            size: p.size, marketQuestion: p.market_question || '', rationale: p.rationale || '',
          });
          await incrementDailyCounter(agentId, db);

          const tradeId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await logTrade(db, {
            id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
            outcome: p.outcome, side: p.side, price: fillPrice, size: p.size,
            fillPrice, fillSize: p.size, status: 'paper_filled', rationale: p.rationale,
          });

          return jsonResult({
            status: 'paper_filled',
            message: `PAPER TRADE: ${p.side} ${p.size} shares at ${fillPrice}`,
            trade_id: tradeId,
            persisted: true,
          });
        }

        // Slippage check for market orders
        if (!p.price && p.max_slippage_pct) {
          try {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
            const midPrice = parseFloat(mid?.mid || '0.5');
            const book = await apiFetch(`${CLOB_API}/book?token_id=${p.token_id}`);
            const levels = p.side === 'BUY' ? (book?.asks || []) : (book?.bids || []);
            if (levels.length === 0) return errorResult('Order book is empty — cannot execute market order');

            let filled = 0, cost = 0;
            for (const level of levels) {
              const lvlPrice = parseFloat(level.price);
              const lvlSize = parseFloat(level.size);
              const fill = Math.min(p.size - filled, lvlSize);
              cost += fill * lvlPrice;
              filled += fill;
              if (filled >= p.size) break;
            }
            if (filled < p.size) return errorResult(`Insufficient liquidity: only ${filled.toFixed(2)} of ${p.size} available`);
            const avgPrice = cost / filled;
            const slippage = Math.abs(avgPrice - midPrice) / midPrice * 100;
            if (slippage > p.max_slippage_pct) {
              return errorResult(`Slippage ${slippage.toFixed(2)}% exceeds max ${p.max_slippage_pct}%. Midpoint: ${midPrice}, estimated avg fill: ${avgPrice.toFixed(4)}`);
            }
          } catch (e: any) { /* Non-fatal */ }
        }

        const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Approval mode
        if (config.mode === 'approval') {
          // Check auto-approve rules
          const rules = await getAutoApproveRules(agentId, db);
          const autoApproved = rules.some((rule: any) =>
            p.size <= rule.maxSize && rule.sides.includes(p.side)
          );

          if (autoApproved) {
            await incrementDailyCounter(agentId, db);
            // Auto-approved — attempt execution
            return await executeOrder(agentId, db, tradeId, p, 'auto_approved');
          }

          // Queue for manual approval
          await savePendingTrade(db, {
            id: tradeId, agentId, tokenId: p.token_id, side: p.side,
            price: p.price || null, size: p.size,
            orderType: p.order_type || 'GTC', tickSize: p.tick_size || '0.01',
            negRisk: p.neg_risk || false, marketQuestion: p.market_question || '',
            outcome: p.outcome || '', rationale: p.rationale || '', urgency: p.urgency || 'normal',
          });

          return jsonResult({
            status: 'pending_approval',
            trade_id: tradeId,
            message: `Trade queued for approval: ${p.side} $${p.size} of "${p.outcome || p.token_id}" at ${p.price || 'market'}`,
            persisted: true,
            dashboard_url: '/polymarket',
          });
        }

        // Autonomous mode — execute directly
        await incrementDailyCounter(agentId, db);
        return await executeOrder(agentId, db, tradeId, p, 'autonomous');
      },
    },

    {
      name: 'poly_place_batch_orders',
      description: 'Place multiple orders at once',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        orders: { type: 'array', items: { type: 'object' } },
        atomic: { type: 'boolean' }, rationale: { type: 'string' },
      }, required: ['orders'] },
      async execute(_id: string, p: any) {
        const config = await loadConfig(agentId, db);
        const results: any[] = [];
        const errors: any[] = [];

        for (const order of (p.orders || [])) {
          const check = preTradeChecks(agentId, config, order);
          if (check) {
            if (p.atomic) return errorResult(`Atomic batch failed: ${check}`);
            errors.push({ order, error: check });
            continue;
          }
          results.push({ ...order, status: config.mode === 'approval' ? 'pending_approval' : 'queued' });
        }

        return jsonResult({
          total: (p.orders || []).length,
          accepted: results.length,
          rejected: errors.length,
          orders: results,
          errors: errors.length > 0 ? errors : undefined,
          note: config.mode === 'approval' ? 'All orders queued for approval' : 'Batch execution requires SDK',
        });
      },
    },

    {
      name: 'poly_get_open_orders',
      description: 'Get open orders',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, token_id: { type: 'string' } }},
      async execute() {
        const pending = Array.from(pendingTrades.values()).filter(t => t.agentId === agentId);
        return jsonResult({ pending_approvals: pending, live_orders: 'requires_sdk' });
      },
    },

    {
      name: 'poly_get_order',
      description: 'Get order details',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { order_id: { type: 'string' } }, required: ['order_id'] },
      async execute(_id: string, p: any) {
        const pending = pendingTrades.get(p.order_id);
        if (pending) return jsonResult({ status: 'pending_approval', trade: pending });
        return jsonResult({ status: 'requires_sdk', message: 'Live order lookup requires authenticated CLOB client.' });
      },
    },

    {
      name: 'poly_cancel_order',
      description: 'Cancel an order',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { order_id: { type: 'string' } }, required: ['order_id'] },
      async execute(_id: string, p: any) {
        if (pendingTrades.has(p.order_id)) {
          pendingTrades.delete(p.order_id);
          return jsonResult({ status: 'cancelled', type: 'pending_approval', order_id: p.order_id });
        }
        return jsonResult({ status: 'requires_sdk', message: 'Cancelling live orders requires CLOB client SDK' });
      },
    },

    {
      name: 'poly_cancel_orders',
      description: 'Cancel multiple orders',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        order_ids: { type: 'array', items: { type: 'string' } },
        market_id: { type: 'string' }, token_id: { type: 'string' }, side: { type: 'string' },
      }},
      async execute(_id: string, p: any) {
        let cancelled: string[] = [];
        if (p.order_ids) {
          for (const id of p.order_ids) { if (pendingTrades.delete(id)) cancelled.push(id); }
        } else {
          // Cancel all matching pending trades
          for (const [id, t] of pendingTrades) {
            if (t.agentId !== agentId) continue;
            if (p.token_id && t.tokenId !== p.token_id) continue;
            if (p.side && t.side !== p.side) continue;
            pendingTrades.delete(id);
            cancelled.push(id);
          }
        }
        return jsonResult({ cancelled_count: cancelled.length, cancelled_ids: cancelled });
      },
    },

    {
      name: 'poly_cancel_all',
      description: 'Cancel ALL orders (emergency)',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { confirm: { type: 'boolean' } }},
      async execute(_id: string, p: any) {
        if (!p.confirm) return errorResult('Set confirm=true to cancel all orders');
        const cancelled: string[] = [];
        for (const [id, t] of pendingTrades) {
          if (t.agentId === agentId) { pendingTrades.delete(id); cancelled.push(id); }
        }
        return jsonResult({ status: 'all_cancelled', cancelled_pending: cancelled.length, note: 'Live CLOB orders require SDK to cancel' });
      },
    },

    {
      name: 'poly_replace_order',
      description: 'Replace an order atomically',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        old_order_id: { type: 'string' }, token_id: { type: 'string' },
        side: { type: 'string' }, price: { type: 'number' }, size: { type: 'number' },
        order_type: { type: 'string' },
      }, required: ['old_order_id', 'token_id', 'side', 'price', 'size'] },
      async execute(_id: string, p: any) {
        // Cancel old
        pendingTrades.delete(p.old_order_id);
        // Place new (reuse place_order logic)
        const config = await loadConfig(agentId, db);
        const check = preTradeChecks(agentId, config, p);
        if (check) return errorResult(check);

        return jsonResult({ status: 'replaced', cancelled: p.old_order_id, new_order: { token_id: p.token_id, side: p.side, price: p.price, size: p.size } });
      },
    },

    // ═══ TRADE HISTORY ══════════════════════════════════════════

    {
      name: 'poly_trade_history',
      description: 'Trade history',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        limit: { type: 'number' }, offset: { type: 'number' }, market_id: { type: 'string' },
        side: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' }, min_size: { type: 'number' },
      }},
      async execute(_id: string, p: any) {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        try {
          const qs = new URLSearchParams({ maker_address: client.address, limit: String(p.limit || 50) });
          if (p.market_id) qs.set('market', p.market_id);
          const trades = await apiFetch(`${CLOB_API}/trades?${qs}`).catch(() => null);
          return jsonResult(trades || { status: 'requires_sdk' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_export_trades',
      description: 'Export trade history',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        format: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' },
        include_fees: { type: 'boolean' }, output_path: { type: 'string' },
      }},
      async execute() {
        return jsonResult({ status: 'requires_sdk', message: 'Trade export requires authenticated CLOB client for full history access.' });
      },
    },

    // ═══ ANALYSIS ═══════════════════════════════════════════════

    {
      name: 'poly_analyze_market',
      description: 'Deep market analysis',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        market_id: { type: 'string' }, depth: { type: 'string' },
        include_news: { type: 'boolean' }, include_whale_trades: { type: 'boolean' },
        include_book_analysis: { type: 'boolean' },
      }, required: ['market_id'] },
      async execute(_id: string, p: any) {
        try {
          // Parallel fetch everything we need
          const [marketData, timeseries] = await Promise.all([
            apiFetch(`${GAMMA_API}/markets/${p.market_id}`).catch(() => null),
            apiFetch(`${GAMMA_API}/markets/${p.market_id}/timeseries?fidelity=50`).catch(() => null),
          ]);

          if (!marketData) return errorResult('Market not found');

          let yesPrice: number | null = null, noPrice: number | null = null;
          try {
            const prices = JSON.parse(marketData.outcomePrices || '[]');
            yesPrice = parseFloat(prices[0]);
            noPrice = parseFloat(prices[1]);
          } catch {}

          // Order book analysis
          let bookAnalysis: any = null;
          if (p.include_book_analysis !== false && marketData.clobTokenIds) {
            try {
              const tokenIds = JSON.parse(marketData.clobTokenIds || '[]');
              if (tokenIds[0]) {
                const book = await apiFetch(`${CLOB_API}/book?token_id=${tokenIds[0]}`);
                const totalBids = (book?.bids || []).reduce((s: number, b: any) => s + parseFloat(b.size) * parseFloat(b.price), 0);
                const totalAsks = (book?.asks || []).reduce((s: number, a: any) => s + parseFloat(a.size) * parseFloat(a.price), 0);
                const bestBid = book?.bids?.[0]?.price;
                const bestAsk = book?.asks?.[0]?.price;
                bookAnalysis = {
                  bestBid, bestAsk,
                  spread: bestBid && bestAsk ? (parseFloat(bestAsk) - parseFloat(bestBid)).toFixed(4) : null,
                  spreadPct: bestBid && bestAsk ? ((parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestAsk) * 100).toFixed(2) + '%' : null,
                  bidLiquidity: totalBids.toFixed(2),
                  askLiquidity: totalAsks.toFixed(2),
                  imbalance: totalBids + totalAsks > 0 ? ((totalBids - totalAsks) / (totalBids + totalAsks) * 100).toFixed(1) + '%' : null,
                  bidLevels: (book?.bids || []).length,
                  askLevels: (book?.asks || []).length,
                };
              }
            } catch {}
          }

          // Whale trades
          let whaleTrades: any = null;
          if (p.include_whale_trades !== false) {
            try {
              const tokenIds = JSON.parse(marketData.clobTokenIds || '[]');
              if (tokenIds[0]) {
                const trades = await apiFetch(`${CLOB_API}/trades?asset_id=${tokenIds[0]}&limit=50`);
                const largeOnes = (Array.isArray(trades) ? trades : [])
                  .filter((t: any) => parseFloat(t.size || '0') >= 50)
                  .slice(0, 10);
                if (largeOnes.length > 0) whaleTrades = largeOnes;
              }
            } catch {}
          }

          // Price movement from timeseries
          let priceMovement: any = null;
          if (Array.isArray(timeseries) && timeseries.length >= 2) {
            const first = timeseries[0];
            const last = timeseries[timeseries.length - 1];
            const firstP = parseFloat(first?.p || first?.price || '0');
            const lastP = parseFloat(last?.p || last?.price || '0');
            if (firstP > 0) {
              priceMovement = {
                startPrice: firstP.toFixed(3),
                currentPrice: lastP.toFixed(3),
                changePct: ((lastP - firstP) / firstP * 100).toFixed(1) + '%',
                dataPoints: timeseries.length,
              };
            }
          }

          return jsonResult({
            market: {
              question: marketData.question,
              description: marketData.description?.slice(0, 800),
              volume: marketData.volume,
              liquidity: marketData.liquidity,
              endDate: marketData.endDate,
              resolved: marketData.resolved,
              negRisk: marketData.negRisk,
              tickSize: marketData.minimumTickSize,
              clobTokenIds: marketData.clobTokenIds,
            },
            prices: { yes: yesPrice, no: noPrice },
            impliedProbability: {
              yes: yesPrice ? `${(yesPrice * 100).toFixed(1)}%` : null,
              no: noPrice ? `${(noPrice * 100).toFixed(1)}%` : null,
              overround: yesPrice && noPrice ? ((yesPrice + noPrice - 1) * 100).toFixed(2) + '%' : null,
            },
            priceMovement,
            orderBook: bookAnalysis,
            whaleTrades,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_compare_markets',
      description: 'Compare markets side-by-side',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        market_ids: { type: 'array', items: { type: 'string' } }, metrics: { type: 'array', items: { type: 'string' } },
      }, required: ['market_ids'] },
      async execute(_id: string, p: any) {
        try {
          const results = await Promise.all(
            (p.market_ids || []).map(async (id: string) => {
              const m = await apiFetch(`${GAMMA_API}/markets/${id}`).catch(() => null);
              if (!m) return { id, error: 'not found' };
              let prices: any = {};
              try { const pp = JSON.parse(m.outcomePrices || '[]'); prices = { yes: pp[0], no: pp[1] }; } catch {}
              return { id: m.conditionId || m.id, question: m.question, ...prices, volume: m.volume, liquidity: m.liquidity, endDate: m.endDate };
            })
          );
          return jsonResult({ comparison: results });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_estimate_fill',
      description: 'Simulate order fill against order book',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, side: { type: 'string' }, size: { type: 'number' },
      }, required: ['token_id', 'side', 'size'] },
      async execute(_id: string, p: any) {
        try {
          const [book, mid] = await Promise.all([
            apiFetch(`${CLOB_API}/book?token_id=${p.token_id}`),
            apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`),
          ]);

          const levels = p.side === 'BUY' ? (book?.asks || []) : (book?.bids || []);
          const midPrice = parseFloat(mid?.mid || '0.5');

          let filled = 0, totalCost = 0, levelsConsumed = 0;
          for (const level of levels) {
            const lvlPrice = parseFloat(level.price);
            const lvlSize = parseFloat(level.size);
            const fill = Math.min(p.size - filled, lvlSize);
            totalCost += fill * lvlPrice;
            filled += fill;
            levelsConsumed++;
            if (filled >= p.size) break;
          }

          const avgPrice = filled > 0 ? totalCost / filled : 0;
          const slippage = midPrice > 0 ? Math.abs(avgPrice - midPrice) / midPrice * 100 : 0;

          return jsonResult({
            requested_size: p.size,
            fillable_size: parseFloat(filled.toFixed(4)),
            fully_fillable: filled >= p.size,
            midpoint: midPrice,
            estimated_avg_price: parseFloat(avgPrice.toFixed(6)),
            estimated_cost: parseFloat(totalCost.toFixed(2)),
            slippage_pct: parseFloat(slippage.toFixed(3)),
            price_levels_consumed: levelsConsumed,
            total_levels_available: levels.length,
            warning: filled < p.size ? `Only ${filled.toFixed(2)} of ${p.size} can be filled at current liquidity` : undefined,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_scan_opportunities',
      description: 'Automated opportunity scanner',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        strategies: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: { type: 'string' } },
        min_edge: { type: 'number' }, limit: { type: 'number' },
      }},
      async execute(_id: string, p: any) {
        try {
          // Fetch high-volume active markets
          const qs = new URLSearchParams({ active: 'true', closed: 'false', order: 'volume', ascending: 'false', limit: String(p.limit || 30) });
          if (p.categories?.length) qs.set('tag', p.categories[0]);
          const markets = await apiFetch(`${GAMMA_API}/markets?${qs}`);
          const arr = Array.isArray(markets) ? markets : [];

          const opportunities: any[] = [];
          for (const m of arr.slice(0, 15)) { // Limit to prevent rate limiting
            try {
              const prices = JSON.parse(m.outcomePrices || '[]');
              const yesP = parseFloat(prices[0] || '0');
              const noP = parseFloat(prices[1] || '0');
              const overround = (yesP + noP - 1) * 100;

              // Price dislocation: overround significantly different from 0
              if (Math.abs(overround) > (p.min_edge || 5)) {
                opportunities.push({
                  type: 'overround_anomaly',
                  market: m.question,
                  id: m.conditionId || m.id,
                  yesPrice: yesP, noPrice: noP,
                  overround: overround.toFixed(2) + '%',
                  edge: Math.abs(overround).toFixed(1) + '%',
                });
              }

              // Closing soon with volume
              if (m.endDate) {
                const hoursToClose = (new Date(m.endDate).getTime() - Date.now()) / 3600000;
                if (hoursToClose > 0 && hoursToClose < 48 && parseFloat(m.volume || '0') > 10000) {
                  opportunities.push({
                    type: 'closing_soon',
                    market: m.question,
                    id: m.conditionId || m.id,
                    hoursToClose: hoursToClose.toFixed(1),
                    volume: m.volume,
                    yesPrice: yesP,
                  });
                }
              }
            } catch {}
          }

          return jsonResult({ scanned: arr.length, opportunities: opportunities.slice(0, p.limit || 20) });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ═══ CONFIGURATION ══════════════════════════════════════════

    {
      name: 'poly_set_config',
      description: 'Configure trading behavior',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        mode: { type: 'string' }, max_position_size: { type: 'number' },
        max_order_size: { type: 'number' }, max_total_exposure: { type: 'number' },
        max_daily_trades: { type: 'number' }, max_daily_loss: { type: 'number' },
        max_drawdown_pct: { type: 'number' }, allowed_categories: { type: 'array', items: { type: 'string' } },
        blocked_categories: { type: 'array', items: { type: 'string' } },
        blocked_markets: { type: 'array', items: { type: 'string' } },
        min_liquidity: { type: 'number' }, min_volume: { type: 'number' },
        max_spread_pct: { type: 'number' }, stop_loss_pct: { type: 'number' },
        take_profit_pct: { type: 'number' }, trailing_stop_pct: { type: 'number' },
        rebalance_interval: { type: 'string' }, notification_channel: { type: 'string' },
        notify_on: { type: 'array', items: { type: 'string' } }, cash_reserve_pct: { type: 'number' },
      }},
      async execute(_id: string, p: any) {
        const existing = await loadConfig(agentId, db);
        const updated: TradingConfig = {
          mode: p.mode || existing.mode,
          maxPositionSize: p.max_position_size ?? existing.maxPositionSize,
          maxOrderSize: p.max_order_size ?? existing.maxOrderSize,
          maxTotalExposure: p.max_total_exposure ?? existing.maxTotalExposure,
          maxDailyTrades: p.max_daily_trades ?? existing.maxDailyTrades,
          maxDailyLoss: p.max_daily_loss ?? existing.maxDailyLoss,
          maxDrawdownPct: p.max_drawdown_pct ?? existing.maxDrawdownPct,
          allowedCategories: p.allowed_categories ?? existing.allowedCategories,
          blockedCategories: p.blocked_categories ?? existing.blockedCategories,
          blockedMarkets: p.blocked_markets ?? existing.blockedMarkets,
          minLiquidity: p.min_liquidity ?? existing.minLiquidity,
          minVolume: p.min_volume ?? existing.minVolume,
          maxSpreadPct: p.max_spread_pct ?? existing.maxSpreadPct,
          stopLossPct: p.stop_loss_pct ?? existing.stopLossPct,
          takeProfitPct: p.take_profit_pct ?? existing.takeProfitPct,
          trailingStopPct: p.trailing_stop_pct ?? existing.trailingStopPct,
          rebalanceInterval: p.rebalance_interval ?? existing.rebalanceInterval,
          notificationChannel: p.notification_channel ?? existing.notificationChannel,
          notifyOn: p.notify_on ?? existing.notifyOn,
          cashReservePct: p.cash_reserve_pct ?? existing.cashReservePct,
        };
        await saveConfig(agentId, db, updated);
        agentConfigs.set(agentId, updated); // Keep in-memory cache too
        return jsonResult({ status: 'ok', config: updated, persisted: true });
      },
    },

    {
      name: 'poly_get_config',
      description: 'Get current config',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() { return jsonResult(await loadConfig(agentId, db)); },
    },

    {
      name: 'poly_circuit_breaker',
      description: 'Circuit breaker controls',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { action: { type: 'string' }, reason: { type: 'string' } }, required: ['action'] },
      async execute(_id: string, p: any) {
        switch (p.action) {
          case 'status': {
            const counter = await getDailyCounter(agentId, db);
            return jsonResult({ paused: counter.paused, reason: counter.reason, dailyTrades: counter.count, dailyLoss: counter.loss });
          }
          case 'pause':
            await pauseTrading(agentId, db, p.reason || 'Manual pause');
            circuitBreakerState.set(agentId, { paused: true, reason: p.reason || 'Manual pause', pausedAt: new Date().toISOString() });
            return jsonResult({ status: 'paused', reason: p.reason || 'Manual pause' });
          case 'resume':
            await resumeTrading(agentId, db);
            circuitBreakerState.set(agentId, { paused: false, reason: '' });
            return jsonResult({ status: 'resumed' });
          case 'reset_daily':
            await resumeTrading(agentId, db);
            dailyCounters.delete(agentId);
            circuitBreakerState.set(agentId, { paused: false, reason: '' });
            return jsonResult({ status: 'reset', message: 'Daily counters and circuit breaker reset' });
          default:
            return errorResult('action must be: status, pause, resume, or reset_daily');
        }
      },
    },

    // ═══ PRICE ALERTS ═══════════════════════════════════════════

    {
      name: 'poly_set_alert',
      description: 'Set a price alert',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, market_question: { type: 'string' },
        condition: { type: 'string' }, target_price: { type: 'number' },
        pct_change: { type: 'number' }, repeat: { type: 'boolean' },
        auto_trade: { type: 'object' },
      }, required: ['token_id', 'condition'] },
      async execute(_id: string, p: any) {
        // Get current price as baseline
        let basePrice = 0.5;
        try {
          const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
          basePrice = parseFloat(mid?.mid || '0.5');
        } catch {}

        const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await saveAlert(db, {
          id: alertId, agentId, tokenId: p.token_id, marketQuestion: p.market_question || '',
          condition: p.condition, targetPrice: p.target_price,
          pctChange: p.pct_change, basePrice,
          repeat: p.repeat || false, autoTrade: p.auto_trade,
        });

        return jsonResult({ status: 'created', alert_id: alertId, persisted: true, note: 'Alerts are checked during heartbeat/polling.' });
      },
    },

    {
      name: 'poly_list_alerts',
      description: 'List price alerts',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const alerts = await getAlerts(agentId, db);
        return jsonResult({ count: alerts.length, alerts });
      },
    },

    {
      name: 'poly_delete_alert',
      description: 'Delete price alert',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { alert_id: { type: 'string' }, delete_all: { type: 'boolean' } }},
      async execute(_id: string, p: any) {
        if (p.delete_all) {
          await deleteAllAlerts(agentId, db);
          return jsonResult({ status: 'all_deleted' });
        }
        await deleteAlert(db, p.alert_id);
        return jsonResult({ status: 'deleted' });
      },
    },

    // ═══ APPROVAL QUEUE ═════════════════════════════════════════

    {
      name: 'poly_pending_trades',
      description: 'List pending approvals',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const pending = await getPendingTrades(agentId, db);
        return jsonResult({ count: pending.length, trades: pending });
      },
    },

    {
      name: 'poly_approve_trade',
      description: 'Approve a trade and execute it',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { trade_id: { type: 'string' }, modify_price: { type: 'number' }, modify_size: { type: 'number' } }, required: ['trade_id'] },
      async execute(_id: string, p: any) {
        await resolvePendingTrade(db, p.trade_id, 'approved', 'agent');
        await incrementDailyCounter(agentId, db);

        // Execute the approved trade
        // Load the trade details from DB to get token_id etc
        const pending = await getPendingTrades(agentId, db);
        const trade = pending.find((t: any) => t.id === p.trade_id);

        if (trade) {
          const execResult = await executeOrder(agentId, db, p.trade_id, {
            token_id: trade.token_id, side: trade.side,
            price: p.modify_price || trade.price, size: p.modify_size || trade.size,
            order_type: trade.order_type, tick_size: trade.tick_size,
            neg_risk: trade.neg_risk, market_question: trade.market_question,
            outcome: trade.outcome, rationale: trade.rationale,
          }, 'approved');
          return execResult;
        }

        return jsonResult({ status: 'approved', trade_id: p.trade_id, message: 'Trade approved' });
      },
    },

    {
      name: 'poly_reject_trade',
      description: 'Reject a trade',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { trade_id: { type: 'string' }, reason: { type: 'string' } }, required: ['trade_id'] },
      async execute(_id: string, p: any) {
        await resolvePendingTrade(db, p.trade_id, 'rejected', p.reason || 'agent');
        return jsonResult({ status: 'rejected', trade_id: p.trade_id, reason: p.reason });
      },
    },

    {
      name: 'poly_auto_approve_rule',
      description: 'Auto-approve rules',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        action: { type: 'string' }, rule_id: { type: 'string' },
        max_size: { type: 'number' }, categories: { type: 'array', items: { type: 'string' } },
        sides: { type: 'array', items: { type: 'string' } },
      }, required: ['action'] },
      async execute(_id: string, p: any) {
        const rules = await getAutoApproveRules(agentId, db);
        switch (p.action) {
          case 'list':
            return jsonResult({ rules });
          case 'add': {
            const rule = {
              id: `rule_${Date.now()}`,
              agentId,
              maxSize: p.max_size || 10,
              categories: p.categories || [],
              sides: p.sides || ['BUY', 'SELL'],
            };
            await saveAutoApproveRule(db, rule);
            return jsonResult({ status: 'added', rule, total_rules: rules.length + 1 });
          }
          case 'remove': {
            await deleteAutoApproveRule(db, p.rule_id);
            return jsonResult({ status: 'removed' });
          }
          default: return errorResult('action must be: list, add, or remove');
        }
      },
    },

    // ═══ LEADERBOARD & SOCIAL ═══════════════════════════════════

    {
      name: 'poly_leaderboard',
      description: 'Top traders',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { period: { type: 'string' }, limit: { type: 'number' }, sort_by: { type: 'string' } }},
      async execute(_id: string, p: any) {
        try {
          const data = await apiFetch(`${GAMMA_API}/leaderboard?limit=${p.limit || 20}`);
          return jsonResult(data);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_top_holders',
      description: 'Top holders for a market',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, outcome: { type: 'string' }, limit: { type: 'number' } }, required: ['market_id'] },
      async execute(_id: string, p: any) {
        try {
          const data = await apiFetch(`${GAMMA_API}/markets/${p.market_id}/holders?limit=${p.limit || 20}`);
          return jsonResult(data);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_track_wallet',
      description: 'Track a wallet\'s activity',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        address: { type: 'string' }, include_positions: { type: 'boolean' },
        include_trades: { type: 'boolean' }, limit: { type: 'number' },
      }, required: ['address'] },
      async execute(_id: string, p: any) {
        try {
          const results: any = { address: p.address };
          const [positions, trades] = await Promise.all([
            p.include_positions !== false ? apiFetch(`${GAMMA_API}/positions?user=${p.address}&limit=${p.limit || 20}`).catch(() => null) : null,
            p.include_trades !== false ? apiFetch(`${CLOB_API}/trades?maker_address=${p.address}&limit=${p.limit || 20}`).catch(() => null) : null,
          ]);
          if (positions) results.positions = positions;
          if (trades) results.trades = trades;
          return jsonResult(results);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ═══ PAPER TRADING ══════════════════════════════════════════

    {
      name: 'poly_paper_trade',
      description: 'Simulate a trade',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, side: { type: 'string' },
        price: { type: 'number' }, size: { type: 'number' },
        market_question: { type: 'string' }, rationale: { type: 'string' },
      }, required: ['token_id', 'side', 'size'] },
      async execute(_id: string, p: any) {
        try {
          const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`).catch(() => ({ mid: p.price || '0.5' }));
          const fillPrice = p.price || parseFloat(mid?.mid || '0.5');

          await savePaperPosition(db, {
            agentId, tokenId: p.token_id, side: p.side, entryPrice: fillPrice,
            size: p.size, marketQuestion: p.market_question || '', rationale: p.rationale || '',
          });

          return jsonResult({ status: 'paper_filled', entry_price: fillPrice, persisted: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_paper_portfolio',
      description: 'Paper trading portfolio',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const positions = await getPaperPositions(agentId, db);
        // Fetch current prices for P&L
        const withPnl = await Promise.all(positions.map(async (pos: any) => {
          try {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${pos.token_id}`);
            const currentPrice = parseFloat(mid?.mid || String(pos.entry_price));
            const pnl = pos.side === 'BUY'
              ? (currentPrice - pos.entry_price) * pos.size
              : (pos.entry_price - currentPrice) * pos.size;
            return { ...pos, currentPrice, pnl: parseFloat(pnl.toFixed(2)), pnlPct: parseFloat(((pnl / (pos.entry_price * pos.size)) * 100).toFixed(2)) };
          } catch {
            return { ...pos, currentPrice: null, pnl: null };
          }
        }));

        const totalPnl = withPnl.reduce((s: number, p: any) => s + (p.pnl || 0), 0);
        const winners = withPnl.filter((p: any) => (p.pnl || 0) > 0).length;
        const losers = withPnl.filter((p: any) => (p.pnl || 0) < 0).length;

        return jsonResult({
          positions: withPnl,
          summary: {
            totalPositions: positions.length,
            totalPnl: parseFloat(totalPnl.toFixed(2)),
            winners, losers,
            winRate: positions.length > 0 ? `${((winners / positions.length) * 100).toFixed(0)}%` : 'N/A',
          },
        });
      },
    },

    // ═══ SYSTEM & HEALTH ════════════════════════════════════════

    {
      name: 'poly_api_status',
      description: 'Check API health',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const start = Date.now();
        try {
          const [clobOk, gammaOk] = await Promise.all([
            apiFetch(`${CLOB_API}/`, { timeoutMs: 5000 }).then(() => true).catch(() => false),
            apiFetch(`${GAMMA_API}/markets?limit=1`, { timeoutMs: 5000 }).then(() => true).catch(() => false),
          ]);
          return jsonResult({
            clob_api: clobOk ? 'healthy' : 'unreachable',
            gamma_api: gammaOk ? 'healthy' : 'unreachable',
            latency_ms: Date.now() - start,
            chain: 'Polygon (137)',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_gas_price',
      description: 'Polygon gas price',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        try {
          const gas = await apiFetch('https://gasstation.polygon.technology/v2');
          return jsonResult(gas);
        } catch (e: any) {
          return jsonResult({ status: 'fallback', message: 'Gas API unavailable. Polygon typically costs <0.01 MATIC per tx.' });
        }
      },
    },

    {
      name: 'poly_heartbeat',
      description: 'CLOB API keepalive',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        try {
          const ok = await apiFetch(`${CLOB_API}/`);
          return jsonResult({ status: 'ok', response: ok });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ═══ LEARNING & TRADE JOURNAL ═══════════════════════════════

    {
      name: 'poly_record_prediction',
      description: 'Record a prediction BEFORE placing a trade. This is your pre-trade journal entry — write down what you think will happen, why, and how confident you are. Essential for learning from outcomes later. Call this before every poly_place_order.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string', description: 'Token being traded' },
        market_id: { type: 'string', description: 'Market ID' },
        market_question: { type: 'string', description: 'Market question text' },
        predicted_outcome: { type: 'string', description: 'What you predict (e.g. "Yes", "No", "price_up", "price_down")' },
        predicted_probability: { type: 'number', description: 'Your estimated probability (0-1)' },
        confidence: { type: 'number', description: 'How confident you are in your analysis (0-1)' },
        reasoning: { type: 'string', description: 'Why you think this — be specific. Future you will review this.' },
        signals_used: { type: 'array', items: { type: 'string' }, description: 'Which signals/tools influenced this (e.g. ["RSI", "news_sentiment", "order_book_imbalance"])' },
        category: { type: 'string', description: 'Market category (e.g. "politics", "crypto", "sports")' },
      }, required: ['token_id', 'predicted_outcome', 'predicted_probability', 'confidence'] },
      async execute(_id: string, p: any) {
        try {
          // Get current market price
          let marketPrice = 0.5;
          try {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
            marketPrice = parseFloat(mid?.mid || '0.5');
          } catch {}

          const predId = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await recordPrediction(db, {
            id: predId, agentId, marketId: p.market_id, tokenId: p.token_id,
            marketQuestion: p.market_question, predictedOutcome: p.predicted_outcome,
            predictedProbability: p.predicted_probability, marketPrice,
            confidence: p.confidence, reasoning: p.reasoning,
            signalsUsed: p.signals_used, category: p.category,
          });

          const edge = p.predicted_probability - marketPrice;
          return jsonResult({
            status: 'recorded',
            prediction_id: predId,
            your_estimate: `${(p.predicted_probability * 100).toFixed(1)}%`,
            market_price: `${(marketPrice * 100).toFixed(1)}%`,
            edge: `${(edge * 100).toFixed(1)}%`,
            confidence: `${(p.confidence * 100).toFixed(0)}%`,
            message: 'Prediction journaled. After the market resolves, use poly_resolve_prediction to log the outcome and learn.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_resolve_prediction',
      description: 'Resolve a prediction after a market settles. Records whether you were right or wrong, calculates P&L, and updates your calibration scores and strategy stats. This is the feedback loop — without it, you cannot learn.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        prediction_id: { type: 'string', description: 'ID from poly_record_prediction' },
        actual_outcome: { type: 'string', description: 'What actually happened (e.g. "Yes", "No")' },
        pnl: { type: 'number', description: 'Profit/loss in USDC from this trade' },
      }, required: ['prediction_id', 'actual_outcome'] },
      async execute(_id: string, p: any) {
        try {
          await resolvePrediction(db, p.prediction_id, p.actual_outcome, p.pnl || 0);
          return jsonResult({
            status: 'resolved',
            prediction_id: p.prediction_id,
            actual_outcome: p.actual_outcome,
            pnl: p.pnl || 0,
            message: 'Prediction resolved. Calibration and strategy stats updated. Run poly_trade_review to extract lessons.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_trade_review',
      description: 'Review recent resolved trades to extract lessons learned. This is your retrospective — look at what went right and wrong, identify patterns in your mistakes, and record actionable lessons. Do this regularly (daily or after every batch of resolutions). The lessons you record here will be recalled before future trades.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        limit: { type: 'number', description: 'How many resolved trades to review (default: 10)' },
      }},
      async execute(_id: string, p: any) {
        try {
          const resolved = await getResolvedPredictions(agentId, db, p.limit || 10);
          if (resolved.length === 0) return jsonResult({ message: 'No unreviewed trades. Either no trades have resolved or all have been reviewed.' });

          const correct = resolved.filter((r: any) => r.was_correct);
          const wrong = resolved.filter((r: any) => !r.was_correct);
          const totalPnl = resolved.reduce((s: number, r: any) => s + (r.pnl || 0), 0);

          return jsonResult({
            trades_to_review: resolved.length,
            summary: {
              correct: correct.length,
              wrong: wrong.length,
              win_rate: `${((correct.length / resolved.length) * 100).toFixed(0)}%`,
              total_pnl: totalPnl.toFixed(2),
            },
            wrong_predictions: wrong.map((w: any) => ({
              id: w.id,
              market: w.market_question,
              predicted: w.predicted_outcome,
              actual: w.actual_outcome,
              confidence: `${(w.confidence * 100).toFixed(0)}%`,
              reasoning: w.reasoning,
              your_probability: `${(w.predicted_probability * 100).toFixed(1)}%`,
              market_price: `${(w.market_price_at_prediction * 100).toFixed(1)}%`,
              pnl: w.pnl,
            })),
            correct_predictions: correct.map((c: any) => ({
              id: c.id,
              market: c.market_question,
              confidence: `${(c.confidence * 100).toFixed(0)}%`,
              pnl: c.pnl,
            })),
            instructions: 'Review the wrong predictions carefully. For each one, ask: Why was I wrong? Was my reasoning flawed, or was it bad luck? Then call poly_record_lesson with your insights. After review, these trades will be marked as reviewed.',
            prediction_ids: resolved.map((r: any) => r.id),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_record_lesson',
      description: 'Record a lesson learned from reviewing trades. These lessons persist in the database and are recalled before future trades to prevent repeating mistakes. Be specific and actionable — "I was wrong about X because Y, next time I should Z."',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        lesson: { type: 'string', description: 'The lesson. Be specific: "I overweighted news sentiment for crypto markets — price already moved before I saw the news. Use order flow signals instead."' },
        category: { type: 'string', description: 'Market category this applies to (e.g. "politics", "crypto", "sports", "general")', default: 'general' },
        source_prediction_ids: { type: 'array', items: { type: 'string' }, description: 'Prediction IDs that led to this lesson' },
        importance: { type: 'string', enum: ['critical', 'high', 'normal', 'low'], default: 'normal' },
      }, required: ['lesson'] },
      async execute(_id: string, p: any) {
        try {
          const lessonId = `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await storeLesson(db, {
            id: lessonId, agentId, lesson: p.lesson, category: p.category || 'general',
            sourcePredictionIds: p.source_prediction_ids, importance: p.importance,
          });

          // Mark source predictions as reviewed
          if (p.source_prediction_ids?.length) {
            await markLessonsExtracted(db, p.source_prediction_ids);
          }

          return jsonResult({
            status: 'recorded',
            lesson_id: lessonId,
            message: 'Lesson stored. It will be recalled before future trades in this category.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_recall_lessons',
      description: 'Recall lessons learned from past trades. Call this BEFORE making a new trade to avoid repeating mistakes. Returns relevant lessons filtered by market category.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        category: { type: 'string', description: 'Market category to recall lessons for (e.g. "politics", "crypto"). Omit for all lessons.' },
      }},
      async execute(_id: string, p: any) {
        try {
          const lessons = await recallLessons(agentId, db, p.category);
          if (lessons.length === 0) return jsonResult({ message: 'No lessons recorded yet. Trade, review, and learn.' });

          return jsonResult({
            count: lessons.length,
            lessons: lessons.map((l: any) => ({
              lesson: l.lesson,
              category: l.category,
              importance: l.importance,
              times_applied: l.times_applied,
              recorded_at: l.created_at,
            })),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_calibration',
      description: 'Check your prediction calibration — are you overconfident or underconfident? Shows your accuracy at each confidence level. A well-calibrated predictor who says "70% confident" should be right ~70% of the time. Use this to adjust your confidence levels.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        try {
          const calibration = await getCalibration(agentId, db);
          if (calibration.length === 0) return jsonResult({ message: 'No resolved predictions yet. Record and resolve predictions to build calibration data.' });

          const totalPreds = calibration.reduce((s: number, c: any) => s + c.predictions, 0);
          const totalCorrect = calibration.reduce((s: number, c: any) => s + c.correct, 0);

          // Calculate Brier score equivalent
          let brierSum = 0;
          for (const bucket of calibration) {
            const midpoint = parseInt(bucket.bucket) / 100 + 0.05;
            const actualRate = bucket.predictions > 0 ? bucket.correct / bucket.predictions : 0;
            brierSum += bucket.predictions * (midpoint - actualRate) ** 2;
          }
          const avgCalibrationError = totalPreds > 0 ? Math.sqrt(brierSum / totalPreds) : 0;

          return jsonResult({
            overall: {
              total_predictions: totalPreds,
              total_correct: totalCorrect,
              overall_accuracy: `${((totalCorrect / (totalPreds || 1)) * 100).toFixed(1)}%`,
              calibration_error: `${(avgCalibrationError * 100).toFixed(1)}%`,
              assessment: avgCalibrationError < 0.05 ? 'WELL_CALIBRATED' :
                          avgCalibrationError < 0.10 ? 'SLIGHTLY_OFF' :
                          avgCalibrationError < 0.20 ? 'POORLY_CALIBRATED' : 'SEVERELY_MISCALIBRATED',
            },
            buckets: calibration.map((c: any) => {
              const actualRate = c.predictions > 0 ? (c.correct / c.predictions * 100).toFixed(1) : '0.0';
              const expected = parseInt(c.bucket) + 5; // midpoint of bucket
              return {
                confidence_range: c.bucket,
                predictions: c.predictions,
                correct: c.correct,
                actual_accuracy: `${actualRate}%`,
                expected_accuracy: `~${expected}%`,
                bias: parseFloat(actualRate) > expected ? 'UNDERCONFIDENT (good — means you have more edge than you think)' :
                      parseFloat(actualRate) < expected - 10 ? 'OVERCONFIDENT (bad — reduce confidence or be more selective)' : 'CALIBRATED',
              };
            }),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_strategy_performance',
      description: 'See which trading signals/strategies are actually working for you and which are losing money. Rankings by win rate and P&L. Use this to stop using bad signals and double down on good ones.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        try {
          const strategies = await getStrategyPerformance(agentId, db);
          if (strategies.length === 0) return jsonResult({ message: 'No strategy data yet. Record predictions with signals_used to track performance by strategy.' });

          return jsonResult({
            strategies: strategies.map((s: any) => ({
              name: s.strategy_name,
              trades: s.total_predictions,
              wins: s.correct_predictions,
              win_rate: `${s.win_rate}%`,
              total_pnl: `$${s.total_pnl.toFixed(2)}`,
              avg_confidence: `${(s.avg_confidence * 100).toFixed(0)}%`,
              verdict: s.win_rate > 60 ? 'KEEP — this signal works' :
                       s.win_rate > 45 ? 'NEUTRAL — needs more data' :
                       'CONSIDER DROPPING — losing signal',
            })),
            recommendation: 'Weight future trades toward your best-performing signals. Drop or reduce weight on consistently losing strategies.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_unresolved_predictions',
      description: 'List predictions that havent been resolved yet. Use this to check which markets you have open predictions on, and resolve them when the market settles.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        market_id: { type: 'string', description: 'Filter by market ID' },
      }},
      async execute(_id: string, p: any) {
        try {
          const unresolved = await getUnresolvedPredictions(agentId, db, p.market_id);
          return jsonResult({
            count: unresolved.length,
            predictions: unresolved.map((u: any) => ({
              id: u.id,
              market: u.market_question,
              predicted: u.predicted_outcome,
              your_probability: `${(u.predicted_probability * 100).toFixed(1)}%`,
              market_price_then: `${(u.market_price_at_prediction * 100).toFixed(1)}%`,
              confidence: `${(u.confidence * 100).toFixed(0)}%`,
              created: u.created_at,
            })),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

  ];

  return tools;
}
