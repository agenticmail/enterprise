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
import { createPolymarketScreenerTools as createScreenerTools } from './polymarket-screener.js';
import { createWatcherTools } from './polymarket-watcher.js';
import { createPolymarketExecutionTools } from './polymarket-execution.js';
import { createPolymarketSocialTools } from './polymarket-social.js';
import { createPolymarketFeedsTools as createPolymarketFeedTools } from './polymarket-feeds.js';
import { createPolymarketOnchainTools } from './polymarket-onchain.js';
import { createPolymarketAnalyticsTools } from './polymarket-analytics.js';
import { createPolymarketPortfolioTools } from './polymarket-portfolio.js';
import { createPolymarketQuantTools } from './polymarket-quant.js';
import { createPolymarketCounterintelTools } from './polymarket-counterintel.js';
import { createPolymarketOptimizerTools } from './polymarket-optimizer.js';
import {
  ensureSDK, getClobClient, importSDK, initPolymarketDB, loadWalletCredentials,
  loadConfig, saveConfig, getDailyCounter, incrementDailyCounter, pauseTrading, resumeTrading,
  savePendingTrade, getPendingTrades, resolvePendingTrade, logTrade,
  saveAlert, getAlerts, deleteAlert, deleteAllAlerts, checkAlerts,
  createBracketAlerts, getBracketConfig,
  savePaperPosition, getPaperPositions,
  getAutoApproveRules, saveAutoApproveRule, deleteAutoApproveRule,
  initLearningDB, recordPrediction, resolvePrediction, storeLesson,
  recallLessons, getCalibration, getStrategyPerformance,
  getUnresolvedPredictions, getResolvedPredictions, markLessonsExtracted,
  type TradingConfig,
} from './polymarket-runtime.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
import { CLOB_API, CTF_ADDRESS, USDC_ADDRESS } from '../../polymarket-engines/shared.js';
const USDC_E = USDC_ADDRESS; // alias for readability

// ─── Caches ──────────────────────────────────────────────────
const marketCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60_000;

// ─── Market Freshness Tracker ────────────────────────────────
// Tracks recently-analyzed markets per agent to prevent repeating the same markets
// Key: agentId, Value: Map<marketId, { ts, count, lastAction }>
const recentlyAnalyzed = new Map<string, Map<string, { ts: number; count: number; lastAction: string }>>();
const FRESHNESS_TTL = 30 * 60_000; // 30 min — markets analyzed in last 30min are "fresh"
const MAX_REPEAT_COUNT = 2; // Allow re-analysis up to 2x, then suppress unless critical

function trackMarketAnalysis(agentId: string, marketId: string, action: string = 'view') {
  if (!recentlyAnalyzed.has(agentId)) recentlyAnalyzed.set(agentId, new Map());
  const agent = recentlyAnalyzed.get(agentId)!;
  const existing = agent.get(marketId);
  agent.set(marketId, {
    ts: Date.now(),
    count: (existing?.count || 0) + 1,
    lastAction: action,
  });
  // Cleanup entries older than TTL
  for (const [id, entry] of agent) {
    if (Date.now() - entry.ts > FRESHNESS_TTL) agent.delete(id);
  }
}

function isMarketFresh(agentId: string, marketId: string): boolean {
  const agent = recentlyAnalyzed.get(agentId);
  if (!agent) return false;
  const entry = agent.get(marketId);
  if (!entry) return false;
  if (Date.now() - entry.ts > FRESHNESS_TTL) return false;
  return entry.count >= MAX_REPEAT_COUNT;
}

function filterFreshMarkets(agentId: string, markets: any[]): any[] {
  return markets.filter(m => {
    const id = m.conditionId || m.id || m.slug;
    if (!id) return true;
    return !isMarketFresh(agentId, id);
  });
}

/** Check if a market is dead/resolved (prices all 0 or 1) */
function isDeadMarket(m: any): boolean {
  try {
    const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return prices.every((p: any) => parseFloat(p) <= 0.01 || parseFloat(p) >= 0.99);
    }
  } catch {}
  // Also check explicit flags
  if (m.resolved === true || m.resolved === 'true') return true;
  if (m.closed === true || m.closed === 'true') return true;
  if (m.active === false || m.active === 'false') return true;
  return false;
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

interface DailyCounter {
  count: number;
  loss: number;
  date: string;
}

const agentConfigs = new Map<string, TradingConfig>();
const pendingTrades = new Map<string, PendingTrade>();
const dailyCounters = new Map<string, DailyCounter>();
const circuitBreakerState = new Map<string, { paused: boolean; reason: string; pausedAt?: string }>();

import { createPolymarketPipelineTools } from './polymarket-pipeline.js';
let _pipelineTools: AnyAgentTool[] = [];
try { _pipelineTools = createPolymarketPipelineTools() as AnyAgentTool[]; } catch (e: any) { console.warn('[polymarket] Pipeline init:', e.message); }


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

/**
 * Execute an order via CLOB SDK. Auto-installs SDK if needed.
 * Logs the trade to DB regardless of outcome.
 */
export async function executeOrder(agentId: string, db: any, tradeId: string, p: any, source: string): Promise<any> {
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

  // ── Enforce TradingConfig limits ──
  try {
    const tradingConfig = await loadConfig(agentId, db);

    // Check mode: if approval mode and source is not auto_*, require approval
    if (tradingConfig.mode === 'approval' && !source.startsWith('auto_') && source !== 'approved') {
      await savePendingTrade(db, {
        id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question || '',
        outcome: p.outcome || '', side: p.side, price: p.price, size: p.size,
        rationale: p.rationale || '', source: source as any,
      } as any);
      return jsonResult({
        status: 'pending_approval',
        trade_id: tradeId,
        message: `Trading mode is "approval". Order queued for review. Use poly_approve_trade to execute.`,
        persisted: true,
      });
    }

    // Check max order size
    if (p.size > tradingConfig.maxOrderSize && tradingConfig.maxOrderSize > 0) {
      return errorResult(`Order size ${p.size} exceeds max_order_size limit of ${tradingConfig.maxOrderSize}. Update config with poly_set_config.`);
    }

    // Check max position size (total shares in one market)
    if (p.size > tradingConfig.maxPositionSize && tradingConfig.maxPositionSize > 0) {
      return errorResult(`Position size ${p.size} exceeds max_position_size limit of ${tradingConfig.maxPositionSize}.`);
    }

    // Check daily trade count
    const dailyCounter = await getDailyCounter(agentId, db);
    const dailyCount = typeof dailyCounter === 'number' ? dailyCounter : (dailyCounter as any)?.count || 0;
    if (dailyCount >= tradingConfig.maxDailyTrades && tradingConfig.maxDailyTrades > 0 && !source.startsWith('auto_')) {
      return errorResult(`Daily trade limit reached (${dailyCount}/${tradingConfig.maxDailyTrades}). Wait until tomorrow or adjust max_daily_trades.`);
    }

    // Check blocked markets
    if (tradingConfig.blockedMarkets?.length && p.market_question) {
      const blocked = tradingConfig.blockedMarkets.some((m: string) =>
        p.market_question.toLowerCase().includes(m.toLowerCase())
      );
      if (blocked) return errorResult(`This market is blocked by your trading config.`);
    }
  } catch (configErr: any) {
    console.warn(`[executeOrder] Config check failed (proceeding): ${configErr.message}`);
  }

  // ── Pre-flight: verify position exists for SELL orders ──
  if (p.side === 'SELL') {
    try {
      const addr = client.funderAddress || client.address;
      const positions = await fetch(`https://data-api.polymarket.com/positions?user=${addr}`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.json()).catch(() => []);
      const pos = (Array.isArray(positions) ? positions : []).find((pos: any) => pos.asset === p.token_id);
      if (!pos || parseFloat(pos.size) <= 0) {
        await logTrade(db, {
          id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
          outcome: p.outcome, side: p.side, price: p.price, size: p.size,
          status: 'no_position', rationale: `${p.rationale || ''} [No position found to sell]`,
        });
        return errorResult(`Cannot SELL: no position found for this token. You may have already sold or the position was closed.`);
      }
      const availableShares = parseFloat(pos.size);
      if (p.size > availableShares) {
        console.warn(`[executeOrder] Reducing sell size from ${p.size} to ${availableShares} (available shares)`);
        p.size = availableShares;
      }
    } catch (posErr: any) {
      console.warn(`[executeOrder] Position pre-check failed (proceeding): ${posErr.message}`);
    }
  }

  // Polymarket minimum order size is 5. Round up small sizes or reject if too small.
  const POLY_MIN_SIZE = 5;
  if (p.size > 0 && p.size < POLY_MIN_SIZE) {
    if (p.size >= POLY_MIN_SIZE - 0.1) {
      // Close enough (e.g. 4.9999) — round up to minimum
      console.warn(`[executeOrder] Rounding size ${p.size} up to minimum ${POLY_MIN_SIZE}`);
      p.size = POLY_MIN_SIZE;
    } else {
      await logTrade(db, {
        id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
        outcome: p.outcome, side: p.side, price: p.price, size: p.size,
        status: 'rejected', rationale: `${p.rationale || ''} [Size ${p.size} below Polymarket minimum of ${POLY_MIN_SIZE}]`,
      });
      return errorResult(`Order size ${p.size} is below Polymarket minimum of ${POLY_MIN_SIZE} shares. Cannot execute.`);
    }
  }

  try {
    // Build the order using CLOB SDK (resolved from SDK install dir)
    const clobModule = await importSDK('@polymarket/clob-client');
    if (!clobModule) throw new Error('CLOB SDK not available. Run poly_check_sdk to verify installation.');
    const { Side } = clobModule;
    const side = p.side === 'BUY' ? Side.BUY : Side.SELL;

    // ── Price validation: Polymarket requires 0.01-0.99 ──
    let orderPrice = typeof p.price === 'number' && Number.isFinite(p.price) ? p.price : undefined;
    if (orderPrice !== undefined) {
      // Clamp to valid range
      orderPrice = Math.max(0.01, Math.min(0.99, orderPrice));
      // Round to tick size (default 0.01)
      const tick = parseFloat(p.tick_size || '0.01');
      orderPrice = Math.round(orderPrice / tick) * tick;
      orderPrice = +orderPrice.toFixed(4);
    } else {
      // No price specified — use midpoint for a market-like order
      try {
        const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
        const midPrice = parseFloat(mid?.mid || '0.5');
        orderPrice = Math.max(0.01, Math.min(0.99, midPrice));
        orderPrice = +orderPrice.toFixed(4);
      } catch { orderPrice = undefined; }
    }

    const orderArgs: any = {
      tokenID: p.token_id,
      side,
      size: p.size,
    };
    if (orderPrice !== undefined) orderArgs.price = orderPrice;
    if (p.tick_size) orderArgs.feeRateBps = undefined; // SDK handles fees
    if (p.neg_risk !== undefined) orderArgs.negRisk = p.neg_risk;

    // Create and submit order
    const signedOrder = await client.client.createOrder(orderArgs);
    const response = await client.client.postOrder(signedOrder, p.order_type || 'GTC');

    const clobOrderId = response?.orderID || response?.id;
    const orderStatus = clobOrderId ? 'placed' : 'rejected';

    await logTrade(db, {
      id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
      outcome: p.outcome, side: p.side, price: p.price, size: p.size,
      status: orderStatus, rationale: p.rationale, clobOrderId: clobOrderId || null,
    });

    if (!clobOrderId) {
      return jsonResult({
        status: 'rejected',
        trade_id: tradeId,
        message: `Order submitted but no order ID returned — likely rejected by exchange.`,
        response,
        persisted: true,
      });
    }

    // ── Bracket Orders: auto-create take-profit + stop-loss on BUY ──
    let bracket: any = null;
    let bracketConfig: any = null;
    if (p.side === 'BUY') {
      try {
        bracketConfig = await getBracketConfig(agentId, db);
        if (bracketConfig.enabled) {
          const buyPrice = p.price || 0.5; // fallback to 50c if no price
          bracket = await createBracketAlerts(db, {
            agentId,
            tokenId: p.token_id,
            marketQuestion: p.market_question || '',
            buyPrice,
            size: p.size,
            takeProfitPct: bracketConfig.takeProfitPct,
            stopLossPct: bracketConfig.stopLossPct,
            sourceTradeId: tradeId,
          });
        }
      } catch (bracketErr: any) {
        console.error(`[bracket] Failed to create bracket alerts: ${bracketErr.message}`);
      }

      // ── Exit Rule: auto-create trailing stop on BUY (uses TradingConfig) ──
      try {
        const exitId = `exit_auto_${tradeId}`;
        const buyPrice = p.price || 0.5;
        const trailingPct = bracketConfig.trailingStopPct || 12;
        if (trailingPct > 0) {
          await db.execute(`
            INSERT INTO poly_exit_rules (id, agent_id, token_id, entry_price, position_size, trailing_stop_pct, highest_price, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
          `, [exitId, agentId, p.token_id, buyPrice, p.size, trailingPct, buyPrice]);
          console.log(`[exit-rule] Auto-created trailing stop (${trailingPct}%) for BUY ${tradeId}`);
        }
      } catch (exitErr: any) {
        console.error(`[exit-rule] Failed to create exit rule: ${exitErr.message}`);
      }
    }

    // ── SELL cleanup: cancel all alerts, exit rules, and watchers for this token ──
    let sellCleanup: any = null;
    if (p.side === 'SELL') {
      try {
        const tokenId = p.token_id;
        // Cancel all untriggered price alerts for this token
        const alertResult = await db.execute(
          `UPDATE poly_price_alerts SET triggered = 1, triggered_at = NOW() WHERE agent_id = $1 AND token_id = $2 AND triggered = 0`,
          [agentId, tokenId]
        );
        // Deactivate all exit rules for this token
        const exitResult = await db.execute(
          `UPDATE poly_exit_rules SET status = 'cancelled' WHERE agent_id = $1 AND token_id = $2 AND status = 'active'`,
          [agentId, tokenId]
        );
        // Pause token-specific watchers (price_level type with this token in config)
        const watcherResult = await db.execute(
          `UPDATE poly_watchers SET status = 'paused' WHERE agent_id = $1 AND status = 'active' AND config::text LIKE $2`,
          [agentId, `%${tokenId}%`]
        );
        const alertsCancelled = (alertResult as any)?.rowCount || (alertResult as any)?.changes || 0;
        const exitsCancelled = (exitResult as any)?.rowCount || (exitResult as any)?.changes || 0;
        const watchersPaused = (watcherResult as any)?.rowCount || (watcherResult as any)?.changes || 0;
        if (alertsCancelled || exitsCancelled || watchersPaused) {
          console.log(`[sell-cleanup] Token ${tokenId.slice(0,16)}: cancelled ${alertsCancelled} alerts, ${exitsCancelled} exit rules, paused ${watchersPaused} watchers`);
          sellCleanup = { alerts_cancelled: alertsCancelled, exit_rules_cancelled: exitsCancelled, watchers_paused: watchersPaused };
        }
      } catch (cleanupErr: any) {
        console.warn(`[sell-cleanup] Failed: ${cleanupErr.message}`);
      }
    }

    return jsonResult({
      status: 'placed',
      trade_id: tradeId,
      clob_order_id: clobOrderId,
      source,
      message: `Order placed: ${p.side} ${p.size} shares at ${p.price || 'market'}`,
      response,
      persisted: true,
      ...(bracket ? {
        bracket_orders: {
          group: bracket.bracketGroup,
          take_profit: { alert_id: bracket.takeProfitAlertId, price: bracket.takeProfitPrice },
          stop_loss: { alert_id: bracket.stopLossAlertId, price: bracket.stopLossPrice },
          message: `Auto-created bracket: TP@${bracket.takeProfitPrice} / SL@${bracket.stopLossPrice}`,
        },
      } : {}),
      ...(p.side === 'BUY' && bracket ? {
        exit_rules: {
          trailing_stop: `${bracket ? (bracketConfig?.trailingStopPct || 12) : 12}%`,
          message: `Auto-created trailing stop. Tracks highest price and auto-sells if price drops from peak.`,
        },
      } : {}),
      ...(sellCleanup ? { cleanup: sellCleanup } : {}),
    });
  } catch (e: any) {
    // Log failure
    await logTrade(db, {
      id: tradeId, agentId, tokenId: p.token_id, marketQuestion: p.market_question,
      outcome: p.outcome, side: p.side, price: p.price, size: p.size,
      status: 'failed', rationale: `${p.rationale || ''} [ERROR: ${e.message}]`,
    });

    // Auto-fix allowance issues: if error is about balance/allowance, try setting allowances and hint retry
    if (e.message?.includes('not enough balance') || e.message?.includes('allowance')) {
      return errorResult(`Order failed: insufficient balance or token allowance. Run poly_set_allowances to approve exchange contracts, then retry. Error: ${e.message}`);
    }

    return errorResult(`Order execution failed: ${e.message}`);
  }
}

function slimMarket(m: any) {
  return {
    id: m.slug || m.conditionId || m.id,
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
          // Default to active markets only (exclude resolved/closed) unless explicitly overridden
          qs.set('active', String(p.active !== undefined ? p.active : true));
          if (p.closed !== undefined) qs.set('closed', String(p.closed));
          qs.set('limit', String(p.limit || 20));
          if (p.offset) qs.set('offset', String(p.offset));
          if (p.order) qs.set('order', p.order);
          if (p.ascending !== undefined) qs.set('ascending', String(p.ascending));
          if (p.end_date_before) qs.set('end_date_max', p.end_date_before);
          if (p.end_date_after) qs.set('end_date_min', p.end_date_after);

          // Default order: use volume when browsing, but let API handle relevance when searching
          if (!p.order && !p.query) { qs.set('order', 'volume'); qs.set('ascending', 'false'); }

          // Search both /markets and /events endpoints for maximum coverage
          const evQs: Record<string, string> = { active: String(p.active !== undefined ? p.active : true), closed: String(p.closed || false), limit: String(Math.min((p.limit || 20) * 3, 100)) };
          // When searching, omit order to let API rank by relevance; otherwise default to volume
          if (!p.query) { evQs.order = p.order || 'volume'; evQs.ascending = String(p.ascending ?? false); }
          if (p.query) evQs.search = p.query;
          if (p.category) evQs.tag_id = p.category;

          // Skip /markets when searching — the Polymarket /markets endpoint ignores the
          // search param and returns default top-volume markets. Only /events respects search.
          const [marketsRaw, eventsRaw] = await Promise.all([
            p.query ? Promise.resolve([]) : apiFetch(`${GAMMA_API}/markets?${qs}`).catch(() => []),
            apiFetch(`${GAMMA_API}/events?${new URLSearchParams(evQs)}`).catch(() => []),
          ]);
          let allRaw = Array.isArray(marketsRaw) ? [...marketsRaw] : [];
          // Extract markets from events
          if (Array.isArray(eventsRaw)) {
            for (const ev of eventsRaw) {
              if (ev.markets && Array.isArray(ev.markets)) {
                for (const m of ev.markets) {
                  if (m.active && !m.closed) allRaw.push(m);
                }
              }
            }
          }
          // Deduplicate
          const seen = new Set<string>();
          allRaw = allRaw.filter(m => { const k = m.conditionId || m.id; if (seen.has(k)) return false; seen.add(k); return true; });

          // Hard filter: remove resolved/closed/stale markets unless explicitly requested
          if (p.active !== false && !p.closed) {
            const now = new Date().toISOString();
            allRaw = allRaw.filter(m => {
              // Skip if explicitly marked as closed or resolved
              if (m.closed === true || m.closed === 'true') return false;
              if (m.resolved === true || m.resolved === 'true') return false;
              if (m.active === false || m.active === 'false') return false;
              // Skip if end date is in the past
              if (m.endDate && m.endDate < now) return false;
              if (m.end_date_iso && m.end_date_iso < now) return false;
              // Skip if all outcome prices are 0 or 1 (fully resolved)
              try {
                const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
                if (Array.isArray(prices) && prices.length > 0) {
                  const allResolved = prices.every((pr: any) => parseFloat(pr) <= 0.01 || parseFloat(pr) >= 0.99);
                  if (allResolved) return false;
                  // Skip if all prices are exactly 0 (dead/untraded market)
                  const allZero = prices.every((pr: any) => parseFloat(pr) === 0);
                  if (allZero) return false;
                }
              } catch {}
              // Skip markets with no liquidity (ghost markets)
              const liq = parseFloat(m.liquidity || '0');
              if (liq <= 0) return false;
              return true;
            });
          }

          let markets = allRaw.map(slimMarket);

          // Client-side relevance scoring when searching — the Gamma API returns
          // events that match the query, but sub-markets within those events may be
          // completely unrelated (e.g., searching "NBA" returns "Celebrity News" event
          // which has both sports AND gossip sub-markets). Score each market by how
          // many query words appear in its question and sort by relevance.
          if (p.query && markets.length > 0) {
            const qWords = p.query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
            if (qWords.length > 0) {
              const scored = markets.map((m: any) => {
                const q = (m.question || '').toLowerCase();
                const slug = (m.slug || '').toLowerCase();
                let hits = 0;
                for (const w of qWords) { if (q.includes(w) || slug.includes(w)) hits++; }
                return { market: m, relevance: hits / qWords.length };
              });
              // Keep only markets with at least 1 query word match, or all if none match
              const relevant = scored.filter((s: any) => s.relevance > 0);
              if (relevant.length > 0) {
                relevant.sort((a: any, b: any) => b.relevance - a.relevance);
                markets = relevant.map((s: any) => s.market);
              }
            }
          }

          // Post-filter by volume/liquidity
          if (p.min_volume) markets = markets.filter((m: any) => parseFloat(m.volume || '0') >= p.min_volume);
          if (p.min_liquidity) markets = markets.filter((m: any) => parseFloat(m.liquidity || '0') >= p.min_liquidity);

          // Run unified pipeline on top 5 results for enrichment
          if (p.enrich !== false && markets.length > 0) {
            try {
              const { quickAnalysis } = await import('../../polymarket-engines/pipeline.js');
              const top5 = markets.slice(0, 5).filter((m: any) => m.clobTokenIds?.[0]);
              const pipeResults = await Promise.all(top5.map((m: any) =>
                quickAnalysis(m.clobTokenIds[0], m.question, p.bankroll || 100).catch(() => null)
              ));
              for (let i = 0; i < top5.length; i++) {
                const pr = pipeResults[i];
                if (pr) {
                  (top5[i] as any).analysis = {
                    score: pr.score,
                    action: pr.action,
                    thesis: pr.thesis,
                    kelly: pr.kelly,
                    regime: pr.regime,
                    smart_money: pr.smart_money,
                    manipulation_risk: pr.manipulation_risk,
                  };
                }
              }
            } catch {}
          }

          // Filter out recently-analyzed markets to encourage diversity
          const beforeFresh = markets.length;
          markets = filterFreshMarkets(agentId, markets);
          const freshFiltered = beforeFresh - markets.length;

          // Cap results to reduce token usage (each market is ~800 chars in JSON)
          const maxResults = Math.min(p.limit || 8, 15);
          const capped = markets.slice(0, maxResults);
          // Track each returned market
          for (const m of capped) {
            const mid = m.id || m.slug;
            if (mid) trackMarketAnalysis(agentId, mid, 'search');
          }
          // Strip clobTokenIds from results to save tokens (long hex strings, agent can get them via poly_get_market)
          const trimmed = capped.map((m: any) => { const { clobTokenIds: _c, ...rest } = m; return rest; });
          const result: any = { count: markets.length, showing: trimmed.length, markets: trimmed };
          if (freshFiltered > 0) result.freshness_note = `${freshFiltered} recently-analyzed markets were filtered out. Showing new markets only.`;
          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_market',
      description: 'Get market details. market_id can be a numeric ID, condition ID (0x...), or slug.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' } }, required: ['market_id'] },
      async execute(_id: string, p: any) {
        try {
          const c = cached(`market:${p.market_id}`);
          if (c) return jsonResult(c);

          let m;
          // Try slug first (most reliable — used as primary ID in search results)
          if (!p.market_id.startsWith('0x') && !/^\d+$/.test(p.market_id)) {
            try {
              const arr = await apiFetch(`${GAMMA_API}/markets?slug=${encodeURIComponent(p.market_id)}&limit=1`);
              m = Array.isArray(arr) && arr[0];
            } catch {}
          }
          // Try numeric/direct ID
          if (!m) {
            try { m = await apiFetch(`${GAMMA_API}/markets/${p.market_id}`); } catch {}
          }
          // If condition ID (0x...), search by condition_id param (try both naming conventions)
          if (!m && p.market_id.startsWith('0x')) {
            try {
              let arr = await apiFetch(`${GAMMA_API}/markets?condition_id=${p.market_id}&limit=1`).catch(() => []);
              if (!Array.isArray(arr) || !arr[0]) {
                arr = await apiFetch(`${GAMMA_API}/markets?conditionId=${p.market_id}&limit=1`).catch(() => []);
              }
              m = Array.isArray(arr) && arr[0];
            } catch {}
          }
          // Final fallback: slug lookup (in case it looks numeric but is actually a slug)
          if (!m && (p.market_id.startsWith('0x') || /^\d+$/.test(p.market_id))) {
            try {
              const arr = await apiFetch(`${GAMMA_API}/markets?slug=${encodeURIComponent(p.market_id)}&limit=1`);
              m = Array.isArray(arr) && arr[0];
            } catch {}
          }
          if (!m) return errorResult('Market not found');

          const result: any = {
            ...slimMarket(m),
            description: m.description,
            startDate: m.startDate,
            resolutionSource: m.resolutionSource,
            resolutionDetails: m.resolutionDetails,
            creator: m.creator,
            eventId: m.eventId,
          };

          // Warn if market is dead/resolved
          if (isDeadMarket(m)) {
            result._warning = 'RESOLVED/DEAD MARKET — prices are 0 or 1. Do not trade this market.';
          }

          // Track freshness and warn if repeatedly analyzed
          const mid = m.conditionId || m.id || p.market_id;
          trackMarketAnalysis(agentId, mid, 'get_market');
          if (isMarketFresh(agentId, mid)) {
            result._freshness = `You've analyzed this market ${recentlyAnalyzed.get(agentId)?.get(mid)?.count || 0}x recently. Consider exploring NEW markets instead.`;
          }

          setCache(`market:${p.market_id}`, result);
          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_get_event',
      description: 'Get event with all sub-markets. event_id can be a numeric ID or slug.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { event_id: { type: 'string' } }, required: ['event_id'] },
      async execute(_id: string, p: any) {
        try {
          let event: any = null;
          // Try numeric ID first, then slug lookup
          try { event = await apiFetch(`${GAMMA_API}/events/${p.event_id}`); } catch {}
          if (!event || event.error) {
            // Try as slug
            const arr = await apiFetch(`${GAMMA_API}/events?slug=${encodeURIComponent(p.event_id)}&limit=1`);
            event = Array.isArray(arr) && arr[0];
          }
          if (!event || event.error) {
            // Try searching by title
            const arr = await apiFetch(`${GAMMA_API}/events?title=${encodeURIComponent(p.event_id)}&limit=1`);
            event = Array.isArray(arr) && arr[0];
          }
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
          // CLOB /trades requires authentication — use ClobClient
          const client = await getClobClient(_id, db);
          if (client) {
            try {
              const params: any = {};
              if (p.token_id) params.asset_id = p.token_id;
              if (p.market_id) params.market = p.market_id;
              if (p.before) params.before = p.before;
              let trades = await client.client.getTrades(params);
              if (Array.isArray(trades)) {
                trades = trades.slice(0, p.limit || 50);
                if (p.min_size) trades = trades.filter((t: any) => parseFloat(t.size || '0') >= p.min_size);
              }
              return jsonResult(trades);
            } catch (clientErr: any) {
              // Fall through to Gamma API fallback
              console.log(`[poly_get_trades] ClobClient failed (${clientErr.message}), trying Gamma fallback`);
            }
          }
          // Fallback: use Data API (public, no auth needed — Gamma /trades is 404)
          const qs = new URLSearchParams();
          if (p.token_id) qs.set('asset', p.token_id);
          if (p.market_id) qs.set('conditionId', p.market_id);
          qs.set('limit', String(p.limit || 50));
          let trades = await apiFetch(`https://data-api.polymarket.com/trades?${qs}`);
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
          if (p.sort_by === 'closing_soon') { qs.set('order', 'endDate'); qs.set('ascending', 'true'); }
          if (p.sort_by === 'new') { qs.set('order', 'createdAt'); qs.set('ascending', 'false'); }

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
      description: 'Approve Polymarket exchange contracts to use your USDC for trading. This sends on-chain transactions (requires POL/MATIC for gas).',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected. Run poly_create_account first.');
        try {
          const creds = await loadWalletCredentials(agentId, db);
          if (!creds) return errorResult('No wallet credentials');

          const { ethers } = await import('ethers');
          const rpcs = ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com'];
          let provider;
          for (const rpc of rpcs) {
            try { provider = new ethers.JsonRpcProvider(rpc); await provider.getNetwork(); break; }
            catch { provider = null; }
          }
          if (!provider) return errorResult('Cannot connect to Polygon network');

          const wallet = new ethers.Wallet(creds.privateKey, provider);
          const MAX_ALLOWANCE = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // type(uint256).max

          // USDC contracts on Polygon
          const usdcAddresses = [
            USDC_E, // USDC.e (bridged)
            '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC (native)
          ];

          // Polymarket exchange contracts that need approval
          const spenders = [
            '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // CTF Exchange
            '0xC5d563A36AE78145C45a50134d48A1215220f80a', // Neg Risk CTF Exchange
            '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296', // Neg Risk Adapter
          ];

          const erc20Abi = ['function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'];
          const ctfAbi = ['function setApprovalForAll(address operator, bool approved)', 'function isApprovedForAll(address owner, address operator) view returns (bool)'];
          const txHashes: string[] = [];

          // 1. Approve USDC spending (for BUY orders)
          for (const usdc of usdcAddresses) {
            const contract = new ethers.Contract(usdc, erc20Abi, wallet);
            for (const spender of spenders) {
              try {
                const current = await contract.allowance(wallet.address, spender);
                if (current > BigInt(0)) continue;
                const tx = await contract.approve(spender, MAX_ALLOWANCE);
                await tx.wait();
                txHashes.push(tx.hash);
              } catch (e: any) {
                if (e.message?.includes('CALL_EXCEPTION')) continue;
                throw e;
              }
            }
          }

          // 2. Approve CTF token spending (for SELL orders — conditional tokens)
          const ctfAddress = CTF_ADDRESS; // Polymarket CTF contract
          const ctfContract = new ethers.Contract(ctfAddress, ctfAbi, wallet);
          for (const spender of spenders) {
            try {
              const approved = await ctfContract.isApprovedForAll(wallet.address, spender);
              if (approved) continue;
              const tx = await ctfContract.setApprovalForAll(spender, true);
              await tx.wait();
              txHashes.push(tx.hash);
            } catch (e: any) {
              if (e.message?.includes('CALL_EXCEPTION')) continue;
              // Don't throw — CTF approval is best-effort
              console.warn(`[allowance] CTF approval failed for ${spender}: ${e.message}`);
            }
          }

          return jsonResult({
            status: 'allowances_set',
            transactions: txHashes,
            message: txHashes.length > 0
              ? `Approved ${txHashes.length} contracts. You can now trade.`
              : 'All contracts already approved.',
          });
        } catch (e: any) {
          return jsonResult({ status: 'failed', message: `Set allowances failed: ${e.message}. Ensure wallet has POL/MATIC for gas fees.` });
        }
      },
    },

    // ═══ BALANCE & FUNDS ════════════════════════════════════════

    {
      name: 'poly_get_balance',
      description: 'Get wallet USDC balance and exchange allowances. IMPORTANT: Polymarket requires USDC.e (bridged), NOT native USDC. If you have native USDC but no USDC.e, run poly_swap_to_usdce first.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        try {
          // Get exchange balance/allowances
          const exchangeBalance = await client.client.getBalanceAllowance({ asset_type: 'COLLATERAL' });

          // Check on-chain USDC balances separately (bridged vs native)
          let usdceBal = '0';
          let usdcNativeBal = '0';
          let polBal = '0';
          try {
            const { ethers } = await import('ethers');
            let provider;
            const rpcs = ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com'];
            for (const rpc of rpcs) {
              try { provider = new ethers.JsonRpcProvider(rpc); await provider.getNetwork(); break; }
              catch { provider = null; }
            }
            if (!provider) throw new Error('All Polygon RPCs failed');
            const balAbi = ['function balanceOf(address) view returns (uint256)'];
            // USDC.e (bridged) — THIS is what Polymarket uses
            try {
              const ce = new ethers.Contract(USDC_E, balAbi, provider);
              usdceBal = (Number(await ce.balanceOf(client.address)) / 1e6).toFixed(2);
            } catch {}
            // Native USDC — NOT usable on Polymarket directly
            try {
              const cn = new ethers.Contract('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', balAbi, provider);
              usdcNativeBal = (Number(await cn.balanceOf(client.address)) / 1e6).toFixed(2);
            } catch {}
            // POL for gas
            try {
              polBal = ethers.formatEther(await provider.getBalance(client.address));
              polBal = parseFloat(polBal).toFixed(4);
            } catch {}
          } catch {}

          const walletUSDC = (parseFloat(usdceBal) + parseFloat(usdcNativeBal)).toFixed(2);

          // Check if allowances need to be set
          const walletBal = parseFloat(walletUSDC);
          const allAllowancesZero = Object.values(exchangeBalance?.allowances || {}).every((v: any) => v === '0' || v === 0);
          const needsAllowances = walletBal > 0 && allAllowancesZero;

          // Auto-set allowances if wallet has funds but exchange doesn't
          if (needsAllowances) {
            try {
              const creds2 = await loadWalletCredentials(agentId, db);
              if (!creds2) throw new Error('No wallet credentials');
              const { ethers: ethers2 } = await import('ethers');
              let provider2;
              for (const rpc of ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com']) {
                try { provider2 = new ethers2.JsonRpcProvider(rpc); await provider2.getNetwork(); break; } catch { provider2 = null; }
              }
              if (!provider2) throw new Error('Cannot connect to Polygon');
              const wallet2 = new ethers2.Wallet(creds2.privateKey, provider2);
              const MAX_ALLOWANCE = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
              const usdcs = [USDC_E, '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'];
              const spenders = ['0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', '0xC5d563A36AE78145C45a50134d48A1215220f80a', '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296'];
              const abi = ['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)'];
              for (const u of usdcs) {
                const c = new ethers2.Contract(u, abi, wallet2);
                for (const s of spenders) {
                  try {
                    const cur = await c.allowance(wallet2.address, s);
                    if (cur > BigInt(0)) continue;
                    const tx = await c.approve(s, MAX_ALLOWANCE);
                    await tx.wait();
                  } catch {}
                }
              }
              const updated = await client.client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
              const allApproved = Object.values(updated?.allowances || {}).every((v: any) => v !== '0' && v !== 0);
              const updatedExchBal = (Number(updated.balance || 0) / 1e6).toFixed(2);
              return jsonResult({
                address: client.address,
                usdc_e_bridged: usdceBal,
                usdc_native: usdcNativeBal,
                pol_gas: polBal,
                wallet_usdc_total: walletUSDC,
                exchange_balance: updatedExchBal,
                available_to_trade: (parseFloat(usdceBal) + parseFloat(updatedExchBal)).toFixed(2),
                trading_approved: allApproved,
                status: 'allowances_auto_set',
                needs_swap: parseFloat(usdceBal) === 0 && parseFloat(usdcNativeBal) > 0,
                message: parseFloat(usdceBal) === 0 && parseFloat(usdcNativeBal) > 0
                  ? `⚠️ Wallet has $${usdcNativeBal} native USDC but $0 USDC.e. Polymarket ONLY accepts USDC.e! Run poly_swap_to_usdce to convert.`
                  : `Wallet has $${usdceBal} USDC.e + $${updatedExchBal} on exchange. Contracts approved — you can now trade.`,
              });
            } catch (e: any) {
              const errExchBal = (Number(exchangeBalance.balance || 0) / 1e6).toFixed(2);
              return jsonResult({
                address: client.address,
                usdc_e_bridged: usdceBal,
                usdc_native: usdcNativeBal,
                pol_gas: polBal,
                exchange_balance: errExchBal,
                available_to_trade: (parseFloat(usdceBal) + parseFloat(errExchBal)).toFixed(2),
                trading_approved: false,
                status: 'needs_allowances',
                message: `Approval failed: ${e.message}`,
              });
            }
          }

          const allApproved = Object.values(exchangeBalance?.allowances || {}).every((v: any) => v !== '0' && v !== 0);
          const needsSwap = parseFloat(usdceBal) === 0 && parseFloat(usdcNativeBal) > 0;
          const exchBalHuman = (Number(exchangeBalance.balance || 0) / 1e6).toFixed(2);
          const totalAvailable = (parseFloat(usdceBal) + parseFloat(exchBalHuman)).toFixed(2);

          return jsonResult({
            address: client.address,
            usdc_e_bridged: usdceBal,
            usdc_native: usdcNativeBal,
            pol_gas: polBal,
            wallet_usdc_total: walletUSDC,
            exchange_balance: exchBalHuman,
            trading_approved: allApproved,
            available_to_trade: totalAvailable,
            needs_swap: needsSwap,
            status: needsSwap ? 'needs_swap' : (parseFloat(totalAvailable) > 0 ? 'funded' : 'no_funds'),
            message: needsSwap
              ? `⚠️ You have $${usdcNativeBal} native USDC but Polymarket requires USDC.e (bridged). Run poly_swap_to_usdce to convert.`
              : undefined,
          });
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
          token: `USDC (${USDC_E})`,
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
      name: 'poly_swap_to_usdce',
      description: 'Swap native USDC to USDC.e (bridged) on Polygon. Polymarket ONLY accepts USDC.e for trading. Uses Uniswap V3 swap router. Run this if poly_get_balance shows native USDC but no USDC.e.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        amount: { type: 'number', description: 'Amount in USD to swap. Leave empty to swap entire native USDC balance.' },
      }},
      async execute(_id: string, p: any) {
        const creds = await loadWalletCredentials(agentId, db);
        if (!creds) return errorResult('Wallet not connected');
        try {
          const { ethers } = await import('ethers');
          let provider;
          for (const rpc of ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com']) {
            try { provider = new ethers.JsonRpcProvider(rpc); await provider.getNetwork(); break; } catch { provider = null; }
          }
          if (!provider) return errorResult('Cannot connect to Polygon RPC');

          const wallet = new ethers.Wallet(creds.privateKey, provider);
          const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
          // USDC_E imported from shared.ts
          // Uniswap V3 SwapRouter02 on Polygon
          const SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';

          const erc20Abi = [
            'function balanceOf(address) view returns (uint256)',
            'function approve(address,uint256) returns (bool)',
            'function allowance(address,address) view returns (uint256)',
          ];

          const nativeContract = new ethers.Contract(USDC_NATIVE, erc20Abi, wallet);
          const nativeBal = await nativeContract.balanceOf(wallet.address);

          if (nativeBal === BigInt(0)) {
            return jsonResult({ status: 'no_native_usdc', message: 'No native USDC to swap. Balance is 0.' });
          }

          // Determine swap amount
          let swapAmount = nativeBal;
          if (p.amount && p.amount > 0) {
            swapAmount = BigInt(Math.floor(p.amount * 1e6));
            if (swapAmount > nativeBal) swapAmount = nativeBal;
          }

          const swapUSD = (Number(swapAmount) / 1e6).toFixed(2);

          // Approve SwapRouter to spend native USDC
          const currentAllowance = await nativeContract.allowance(wallet.address, SWAP_ROUTER);
          if (currentAllowance < swapAmount) {
            const approveTx = await nativeContract.approve(SWAP_ROUTER, '115792089237316195423570985008687907853269984665640564039457584007913129639935');
            await approveTx.wait();
          }

          // Uniswap V3 exactInputSingle swap
          const swapRouterAbi = [
            'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
          ];
          const router = new ethers.Contract(SWAP_ROUTER, swapRouterAbi, wallet);

          // USDC/USDC.e is a stablecoin pair — use 0.01% fee tier (100), accept 0.5% slippage
          const minOut = swapAmount * BigInt(995) / BigInt(1000);

          const tx = await router.exactInputSingle({
            tokenIn: USDC_NATIVE,
            tokenOut: USDC_E,
            fee: 100, // 0.01% fee tier for stablecoin pairs
            recipient: wallet.address,
            amountIn: swapAmount,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          });

          const receipt = await tx.wait();

          // Check new USDC.e balance
          const usdceContract = new ethers.Contract(USDC_E, ['function balanceOf(address) view returns (uint256)'], provider);
          const newBal = await usdceContract.balanceOf(wallet.address);

          return jsonResult({
            status: 'swapped',
            swapped_amount: swapUSD,
            tx_hash: receipt.hash,
            new_usdce_balance: (Number(newBal) / 1e6).toFixed(2),
            message: `Successfully swapped $${swapUSD} native USDC → USDC.e. You can now trade on Polymarket.`,
          });
        } catch (e: any) {
          // If Uniswap V3 0.01% pool doesn't exist, try 0.05% fee tier
          if (e.message?.includes('revert') || e.message?.includes('STF') || e.message?.includes('Too little received')) {
            try {
              const { ethers } = await import('ethers');
              let provider;
              for (const rpc of ['https://polygon.llamarpc.com', 'https://polygon-bor-rpc.publicnode.com']) {
                try { provider = new ethers.JsonRpcProvider(rpc); await provider.getNetwork(); break; } catch { provider = null; }
              }
              if (!provider) return errorResult('RPC failed on retry');
              const wallet = new ethers.Wallet(creds.privateKey, provider);
              const nativeContract = new ethers.Contract('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', ['function balanceOf(address) view returns (uint256)'], provider);
              const nativeBal = await nativeContract.balanceOf(wallet.address);
              let swapAmount = nativeBal;
              if (p.amount && p.amount > 0) {
                swapAmount = BigInt(Math.floor(p.amount * 1e6));
                if (swapAmount > nativeBal) swapAmount = nativeBal;
              }
              const router = new ethers.Contract('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', [
                'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
              ], wallet);
              const minOut = swapAmount * BigInt(990) / BigInt(1000);
              const tx = await router.exactInputSingle({
                tokenIn: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
                tokenOut: USDC_E,
                fee: 500, // 0.05% fee tier
                recipient: wallet.address,
                amountIn: swapAmount,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: BigInt(0),
              });
              const receipt = await tx.wait();
              const usdceContract = new ethers.Contract(USDC_E, ['function balanceOf(address) view returns (uint256)'], provider);
              const newBal = await usdceContract.balanceOf(wallet.address);
              return jsonResult({
                status: 'swapped',
                fee_tier: '0.05%',
                swapped_amount: (Number(swapAmount) / 1e6).toFixed(2),
                tx_hash: receipt.hash,
                new_usdce_balance: (Number(newBal) / 1e6).toFixed(2),
                message: `Swapped via 0.05% pool. You can now trade on Polymarket.`,
              });
            } catch (e2: any) {
              return errorResult(`Swap failed on both fee tiers. Error: ${e2.message}`);
            }
          }
          return errorResult(`Swap failed: ${e.message}`);
        }
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
      async execute(_id: string, _p: any) {
        const client = await getClobClient(agentId, db);
        if (!client) return errorResult('Wallet not connected');
        try {
          const addr = client.funderAddress || client.address;
          // Try Data API first (Gamma /positions is deprecated/404)
          let positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${addr}`).catch(() => null);
          if (!positions) {
            // Fallback to Gamma
            positions = await apiFetch(`${GAMMA_API}/positions?user=${addr}&limit=100`).catch(() => null);
          }
          if (!positions || (Array.isArray(positions) && positions.length === 0)) return jsonResult({ address: addr, status: 'no_positions' });
          // Trim to essential fields to reduce token usage (raw response can be 20K+ chars)
          const trimmed = (positions as any[]).map((pos: any) => ({
            asset: pos.asset,
            conditionId: pos.conditionId,
            size: pos.size,
            avgPrice: pos.avgPrice,
            currentPrice: pos.curPrice || pos.currentPrice,
            title: pos.title,
            outcome: pos.outcome,
            market_slug: pos.market_slug || pos.slug,
            pnl: pos.cashPnl ?? pos.pnl,
            percentPnl: pos.percentPnl,
            redeemable: pos.redeemable,
            resolved: pos.resolved,
            negRisk: pos.negRisk,
          }));
          return jsonResult(trimmed);
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
          const addr = client.funderAddress || client.address;
          const qs = new URLSearchParams({ user: addr, limit: String(p.limit || 50) });
          if (p.offset) qs.set('offset', String(p.offset));
          // Try Data API first
          let positions = await apiFetch(`https://data-api.polymarket.com/positions/closed?${qs}`).catch(() => null);
          if (!positions) {
            positions = await apiFetch(`${GAMMA_API}/positions/closed?${qs}`).catch(() => null);
          }
          return jsonResult(positions || { address: addr, status: 'no_closed_positions' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_redeem',
      description: 'Redeem winning tokens from resolved markets. Checks Data API for redeemable positions and calls CTF contract redeemPositions(). Use redeem_all=true to claim ALL redeemable positions, or pass a specific condition_id.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        condition_id: { type: 'string', description: 'Specific conditionId to redeem' },
        redeem_all: { type: 'boolean', description: 'Redeem all redeemable positions' },
      }},
      async execute(_id: string, p: any) {
        try {
          const creds = await loadWalletCredentials(agentId, db);
          if (!creds?.privateKey) return errorResult('No wallet credentials. Set up wallet first.');

          const wallet = creds.funderAddress;
          if (!wallet) return errorResult('No wallet address found.');

          // 1. Fetch redeemable positions from Data API
          const posRes = await fetch(`https://data-api.polymarket.com/positions?user=${wallet}&sizeThreshold=0`);
          const positions = await posRes.json();
          const redeemable = (positions as any[]).filter((pos: any) => pos.redeemable === true);

          if (!redeemable.length) return jsonResult({ status: 'nothing_to_redeem', message: 'No redeemable positions found.' });

          // Filter by condition_id if specified
          const toRedeem = p?.condition_id
            ? redeemable.filter((pos: any) => pos.conditionId === p.condition_id)
            : p?.redeem_all ? redeemable : redeemable.slice(0, 1);

          if (!toRedeem.length) return jsonResult({ status: 'not_found', message: `No redeemable position found for condition ${p.condition_id}`, available: redeemable.map((r: any) => ({ title: r.title, conditionId: r.conditionId, value: r.currentValue })) });

          // 2. Redeem each position via CTF contract
          const { ethers } = await import('ethers');
          // CTF_ADDRESS and USDC_E imported from shared.ts
          const CTF_ABI = [
            'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external'
          ];

          const rpcs = ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'];
          let provider: any;
          for (const rpc of rpcs) {
            try { provider = new ethers.JsonRpcProvider(rpc); await provider.getBlockNumber(); break; } catch { continue; }
          }
          if (!provider) return errorResult('All RPCs failed');

          const signer = new ethers.Wallet(creds.privateKey, provider);
          const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, signer);

          const results: any[] = [];
          for (const pos of toRedeem) {
            try {
              // For binary markets, indexSets = [1, 2] (both outcomes)
              // parentCollectionId = 0x0 for top-level conditions
              const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
              const indexSets = pos.negativeRisk ? [1] : [1, 2];

              const tx = await ctf.redeemPositions(
                USDC_E,
                parentCollectionId,
                pos.conditionId,
                indexSets,
                { gasLimit: 300000 }
              );
              const receipt = await tx.wait();

              // Update trade log
              try {
                const { safeDbExec } = await import('./polymarket-shared.js');
                await safeDbExec(db, `UPDATE poly_trade_log SET status = 'redeemed', pnl = $1 WHERE token_id = $2 AND agent_id = $3 AND status != 'redeemed'`,
                  [pos.cashPnl || 0, pos.asset, agentId]);
              } catch { /* best effort */ }

              results.push({
                title: pos.title,
                outcome: pos.outcome,
                conditionId: pos.conditionId,
                shares: pos.size,
                value: pos.currentValue,
                profit: pos.cashPnl,
                txHash: receipt.hash,
                status: 'redeemed'
              });
            } catch (e: any) {
              results.push({
                title: pos.title,
                conditionId: pos.conditionId,
                status: 'failed',
                error: e.message
              });
            }
          }

          return jsonResult({
            status: 'complete',
            redeemed: results.filter((r: any) => r.status === 'redeemed').length,
            failed: results.filter((r: any) => r.status === 'failed').length,
            total_value: results.filter((r: any) => r.status === 'redeemed').reduce((s: number, r: any) => s + (r.value || 0), 0),
            total_profit: results.filter((r: any) => r.status === 'redeemed').reduce((s: number, r: any) => s + (r.profit || 0), 0),
            details: results
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'poly_portfolio_summary',
      description: 'Portfolio analytics',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { period: { type: 'string' }, include_closed: { type: 'boolean' }, include_charts: { type: 'boolean' } }},
      async execute(_id: string, _p: any) {
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
      description: 'Place an order. IMPORTANT: price must be between 0.01 and 0.99 (Polymarket range). Size minimum is 5 shares. If you omit price, the current midpoint is used automatically.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        token_id: { type: 'string' }, side: { type: 'string', description: 'BUY or SELL' },
        price: { type: 'number', description: 'Limit price between 0.01 and 0.99. Omit for market order at midpoint.' },
        size: { type: 'number', description: 'Number of shares (minimum 5)' },
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

        // Pipeline enforcement: require a prediction to be recorded before trading
        try {
          const unresolved = await getUnresolvedPredictions(agentId, db, undefined);
          const hasPrediction = unresolved.some((u: any) =>
            u.token_id === p.token_id ||
            (p.market_id && u.market_id === p.market_id) ||
            (p.market_question && u.market_question && u.market_question.toLowerCase().includes(p.market_question.toLowerCase().slice(0, 30)))
          );
          if (!hasPrediction && unresolved.length === 0) {
            // Only block if there are NO predictions at all — first-time enforcement
            return errorResult(
              'PIPELINE: No predictions recorded yet. Before placing orders, call poly_record_prediction with your analysis (token_id, predicted_outcome, predicted_probability, confidence, reasoning). This journals your trade thesis for the learning loop.'
            );
          }
        } catch { /* If prediction check fails, allow trade to proceed */ }

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

          const tradeId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          order.rationale = order.rationale || p.rationale || '';

          if (config.mode === 'paper') {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${order.token_id}`).catch(() => ({ mid: order.price || 0.5 }));
            const fillPrice = order.price || parseFloat(mid?.mid || '0.5');
            await savePaperPosition(db, {
              agentId, tokenId: order.token_id, side: order.side, entryPrice: fillPrice,
              size: order.size, marketQuestion: order.market_question || '', rationale: order.rationale,
            });
            results.push({ trade_id: tradeId, status: 'paper_filled', ...order });
          } else if (config.mode === 'approval') {
            await savePendingTrade(db, {
              id: tradeId, agentId, tokenId: order.token_id, side: order.side,
              price: order.price || null, size: order.size,
              orderType: order.order_type || 'GTC', tickSize: order.tick_size || '0.01',
              negRisk: order.neg_risk || false, marketQuestion: order.market_question || '',
              outcome: order.outcome || '', rationale: order.rationale, urgency: order.urgency || 'normal',
            });
            results.push({ trade_id: tradeId, status: 'pending_approval', ...order });
          } else {
            // Autonomous — execute directly
            await incrementDailyCounter(agentId, db);
            const execResult = await executeOrder(agentId, db, tradeId, order, 'autonomous');
            results.push({ trade_id: tradeId, status: 'executed', result: execResult });
          }
        }

        return jsonResult({
          total: (p.orders || []).length,
          accepted: results.length,
          rejected: errors.length,
          orders: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      },
    },

    {
      name: 'poly_get_open_orders',
      description: 'Get open orders',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { market_id: { type: 'string' }, token_id: { type: 'string' } }},
      async execute() {
        // Check both in-memory and DB for pending trades
        const memPending = Array.from(pendingTrades.values()).filter(t => t.agentId === agentId);
        const dbPending = await getPendingTrades(agentId, db);
        // Merge and deduplicate
        const seen = new Set(memPending.map(t => t.id));
        const merged = [...memPending];
        for (const t of dbPending) { if (!seen.has(t.id)) merged.push(t); }
        return jsonResult({ count: merged.length, pending_approvals: merged });
      },
    },

    {
      name: 'poly_get_order',
      description: 'Get order details',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: { order_id: { type: 'string' } }, required: ['order_id'] },
      async execute(_id: string, p: any) {
        // Check in-memory first, then DB
        const memPending = pendingTrades.get(p.order_id);
        if (memPending) return jsonResult({ status: 'pending_approval', trade: memPending });
        const dbPending = await getPendingTrades(agentId, db);
        const dbTrade = dbPending.find((t: any) => t.id === p.order_id);
        if (dbTrade) return jsonResult({ status: dbTrade.status || 'pending_approval', trade: dbTrade });
        return jsonResult({ status: 'not_found', message: 'Order not found in pending trades. May have been executed or expired.' });
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
          // Parallel fetch everything we need — try conditionId, then slug, then search
          let marketData = await apiFetch(`${GAMMA_API}/markets/${p.market_id}`).catch(() => null);
          if (!marketData) {
            // Try as slug
            const arr = await apiFetch(`${GAMMA_API}/markets?slug=${p.market_id}&limit=1`).catch(() => null);
            if (Array.isArray(arr) && arr[0]) marketData = arr[0];
          }
          if (!marketData && p.market_id?.startsWith('0x')) {
            // Try as condition_id
            const arr = await apiFetch(`${GAMMA_API}/markets?condition_id=${p.market_id}&limit=1`).catch(() => null);
            if (Array.isArray(arr) && arr[0]) marketData = arr[0];
          }
          if (!marketData) return errorResult('Market not found — try using the slug (e.g. "will-trump-win") or condition_id');

          const timeseries = await apiFetch(`${GAMMA_API}/markets/${marketData.conditionId || p.market_id}/timeseries?fidelity=50`).catch(() => null);

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
        proactive_interval_mins: { type: 'number', description: 'Minutes between proactive trading checks (default 30, min 10)' },
        proactive_max_daily: { type: 'number', description: 'Max proactive checks per day (default 20, 0 = disabled)' },
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
        // Persist proactive schedule fields (not part of TradingConfig type)
        if (db && (p.proactive_interval_mins !== undefined || p.proactive_max_daily !== undefined)) {
          const sets: string[] = [];
          const vals: any[] = [];
          if (p.proactive_interval_mins !== undefined) { sets.push('proactive_interval_mins = ?'); vals.push(Math.max(10, p.proactive_interval_mins)); }
          if (p.proactive_max_daily !== undefined) { sets.push('proactive_max_daily = ?'); vals.push(Math.max(0, p.proactive_max_daily)); }
          if (sets.length) await db.run(`UPDATE poly_trading_config SET ${sets.join(', ')} WHERE agent_id = ?`, [...vals, agentId]).catch(() => {});
        }
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
        // ENFORCE: Check if agent has watchers set up. Block alert creation if no watchers exist.
        try {
          const { safeDbGet } = await import('./polymarket-shared.js');
          const watcherCount = await safeDbGet(db, `SELECT COUNT(*) as cnt FROM poly_watchers WHERE agent_id = ? AND status = 'active'`, [agentId]);
          if (!watcherCount || (watcherCount as any).cnt === 0 || (watcherCount as any).cnt === '0') {
            return jsonResult({
              status: 'BLOCKED',
              error: 'You have ZERO active watchers. You MUST set up watchers BEFORE creating alerts.',
              required_action: 'Run poly_watcher_config action=set provider=xai model=grok-3-mini FIRST, then run poly_setup_monitors to create your monitoring suite. After watchers are active, you can create alerts.',
              help: 'Alerts are simple price triggers. Watchers are AI-powered monitors that appear on the Monitors tab. Your manager requires BOTH.',
            });
          }
        } catch {} // If check fails, allow alert creation anyway

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

    // ═══ BRACKET ORDERS (Take-Profit + Stop-Loss) ═════════════

    {
      name: 'poly_bracket_config',
      description: 'Configure automatic bracket orders (take-profit + stop-loss) that are created on every BUY. When a BUY executes, two sell alerts are auto-created: one at +X% (take profit) and one at -Y% (stop loss). When either fires, the other is cancelled (OCO).',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        enabled: { type: 'boolean', description: 'Enable/disable bracket orders (default: true)' },
        take_profit_pct: { type: 'number', description: 'Take-profit percentage above buy price (default: 15)' },
        stop_loss_pct: { type: 'number', description: 'Stop-loss percentage below buy price (default: 10)' },
      }},
      async execute(_id: string, p: any) {
        const config = await loadConfig(agentId, db) || {} as any;
        const bracket = config.bracket || {};
        if (p.enabled !== undefined) bracket.enabled = p.enabled;
        if (p.take_profit_pct !== undefined) {
          bracket.take_profit_pct = p.take_profit_pct;
          config.takeProfitPct = p.take_profit_pct; // sync to central config
        }
        if (p.stop_loss_pct !== undefined) {
          bracket.stop_loss_pct = p.stop_loss_pct;
          config.stopLossPct = p.stop_loss_pct; // sync to central config
        }
        config.bracket = bracket;
        await saveConfig(agentId, db, config);
        return jsonResult({
          status: 'updated',
          bracket: {
            enabled: bracket.enabled !== false,
            take_profit_pct: bracket.take_profit_pct ?? config.takeProfitPct ?? 15,
            stop_loss_pct: bracket.stop_loss_pct ?? config.stopLossPct ?? 10,
          },
          note: 'Also synced to central Trading Configuration (poly_set_config).',
          message: bracket.enabled === false
            ? 'Bracket orders DISABLED. BUY orders will NOT auto-create TP/SL alerts.'
            : `Bracket orders ENABLED. Every BUY will auto-create: TP at +${bracket.take_profit_pct ?? config.takeProfitPct ?? 15}%, SL at -${bracket.stop_loss_pct ?? config.stopLossPct ?? 10}%`,
        });
      },
    },

    {
      name: 'poly_list_brackets',
      description: 'List active bracket order pairs (take-profit + stop-loss groups)',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {} },
      async execute() {
        try {
          const rows = await (db.query || db.execute).call(db,
            `SELECT * FROM poly_price_alerts WHERE agent_id = $1 AND bracket_group IS NOT NULL AND triggered = 0 ORDER BY bracket_group, bracket_role`,
            [agentId]
          );
          const alerts = rows?.rows || rows || [];
          // Group by bracket_group
          const groups: Record<string, any> = {};
          for (const a of alerts) {
            if (!groups[a.bracket_group]) groups[a.bracket_group] = { group: a.bracket_group, alerts: [] };
            groups[a.bracket_group].alerts.push({
              id: a.id, role: a.bracket_role, condition: a.condition,
              target_price: a.target_price, base_price: a.base_price,
              token_id: a.token_id, market: a.market_question,
            });
          }
          const bracketList = Object.values(groups);
          return jsonResult({ count: bracketList.length, brackets: bracketList });
        } catch {
          return jsonResult({ count: 0, brackets: [] });
        }
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
        // Fetch trade details BEFORE resolving (resolve changes status, hiding it from getPendingTrades)
        const pending = await getPendingTrades(agentId, db);
        const trade = pending.find((t: any) => t.id === p.trade_id);

        await resolvePendingTrade(db, p.trade_id, 'approved', 'agent');
        await incrementDailyCounter(agentId, db);

        // Execute the approved trade
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

        return jsonResult({ status: 'approved', trade_id: p.trade_id, message: 'Trade approved but details not found — may need manual execution' });
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
          // Try data-api leaderboard first, fall back to gamma
          let data;
          try { data = await apiFetch(`https://data-api.polymarket.com/leaderboard?limit=${p.limit || 20}&period=${p.period || 'all'}`); } catch {}
          if (!data) data = await apiFetch(`${GAMMA_API}/leaderboard?limit=${p.limit || 20}`).catch(() => null);
          if (!data) return errorResult('Leaderboard endpoint unavailable');
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
          // Gamma API doesn't have /holders, use data-api
          let data;
          try { data = await apiFetch(`https://data-api.polymarket.com/positions?market=${p.market_id}&limit=${p.limit || 20}`); } catch {}
          if (!data) return errorResult('Holders endpoint unavailable');
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
            p.include_positions !== false ? apiFetch(`https://data-api.polymarket.com/positions?user=${p.address}`).catch(() => apiFetch(`${GAMMA_API}/positions?user=${p.address}&limit=${p.limit || 20}`).catch(() => null)) : null,
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
      description: 'COMPREHENSIVE MARKET WATCHER — Run this periodically (every 15-30 min via cron or heartbeat). Checks: (1) all active price alerts and fires triggered ones, (2) open positions for P&L changes, (3) unresolved predictions that may have settled, (4) portfolio health and balance, (5) CLOB API status. Returns a full status report with any actions needed.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        check_alerts: { type: 'boolean', description: 'Check price alerts (default: true)' },
        check_positions: { type: 'boolean', description: 'Check open positions (default: true)' },
        check_predictions: { type: 'boolean', description: 'Check unresolved predictions (default: true)' },
        check_balance: { type: 'boolean', description: 'Check wallet/exchange balance (default: true)' },
        run_screener: { type: 'boolean', description: 'Run quick screener for new opportunities (default: false — set true for active scanning)' },
      }},
      async execute(_id: string, p: any) {
        const report: any = { timestamp: new Date().toISOString(), actions_needed: [] };

        // 1. API Health
        try {
          const time = await apiFetch(`${CLOB_API}/time`);
          report.api_status = 'online';
          report.server_time = time;
        } catch (e: any) {
          report.api_status = 'DOWN';
          report.api_error = e.message;
          report.actions_needed.push({ type: 'critical', message: 'CLOB API is DOWN — cannot trade' });
        }

        // 2. Price Alerts
        if (p.check_alerts !== false) {
          try {
            const triggered = await checkAlerts(agentId, db);
            report.alerts = {
              triggered: triggered.length,
              details: triggered,
            };
            for (const t of triggered) {
              report.actions_needed.push({
                type: 'alert_triggered',
                message: `ALERT: ${t.market} — ${t.reason}`,
                token_id: t.token_id,
                auto_trade: t.auto_trade,
              });
            }
            // Also count remaining active alerts
            const remaining = await getAlerts(agentId, db);
            report.alerts.active_count = remaining.length;
          } catch (e: any) {
            report.alerts = { error: e.message };
          }
        }

        // 3. Open Positions
        if (p.check_positions !== false) {
          try {
            const client = await getClobClient(agentId, db);
            if (client) {
              // Check open orders
              const openOrders = await apiFetch(`${CLOB_API}/orders?status=live`, {
                headers: { Authorization: `Bearer ${client.apiKey}` },
              }).catch(() => []);

              // Check positions via Data API (Gamma /positions is deprecated)
              const addr = client.funderAddress || client.address;
              let positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${addr}`).catch(() => null);
              if (!positions) positions = await apiFetch(`${GAMMA_API}/positions?user=${addr}&limit=20`).catch(() => []);
              const activePositions = (Array.isArray(positions) ? positions : []).filter((pos: any) =>
                parseFloat(pos.size || '0') > 0
              );

              report.positions = {
                open_orders: Array.isArray(openOrders) ? openOrders.length : 0,
                active_positions: activePositions.length,
              };

              // Check each position's current price vs entry for P&L
              for (const pos of activePositions.slice(0, 10)) {
                try {
                  const tokenId = pos.asset || pos.token_id;
                  if (!tokenId) continue;
                  const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${tokenId}`);
                  const currentPrice = parseFloat(mid?.mid || '0');
                  const entryPrice = parseFloat(pos.avgPrice || pos.entry_price || '0');
                  const size = parseFloat(pos.size || '0');
                  if (currentPrice && entryPrice && size) {
                    const pnl = (currentPrice - entryPrice) * size;
                    const pnlPct = ((currentPrice - entryPrice) / entryPrice * 100);
                    if (Math.abs(pnlPct) > 10) {
                      report.actions_needed.push({
                        type: pnl > 0 ? 'take_profit' : 'stop_loss',
                        message: `Position ${pos.title || tokenId}: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}% (${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)})`,
                        token_id: tokenId,
                        current_price: currentPrice,
                        entry_price: entryPrice,
                        pnl: parseFloat(pnl.toFixed(2)),
                      });
                    }
                  }
                } catch { /* skip individual position check failures */ }
              }
            }
          } catch (e: any) {
            report.positions = { error: e.message };
          }
        }

        // 4. Unresolved Predictions — check if any markets have settled
        if (p.check_predictions !== false) {
          try {
            const unresolved = await getUnresolvedPredictions(agentId, db, undefined);
            report.predictions = { unresolved: unresolved.length };

            for (const pred of unresolved.slice(0, 10)) {
              try {
                if (!pred.market_id) continue;
                const market = await apiFetch(`${GAMMA_API}/markets/${pred.market_id}`).catch(() => null);
                if (market?.resolved) {
                  report.actions_needed.push({
                    type: 'resolve_prediction',
                    message: `Market SETTLED: "${pred.market_question}" — resolve prediction ${pred.id}`,
                    prediction_id: pred.id,
                    market_id: pred.market_id,
                    outcome: market.outcome,
                  });
                }
              } catch { /* skip */ }
            }
          } catch (e: any) {
            report.predictions = { error: e.message };
          }
        }

        // 5. Balance Check
        if (p.check_balance !== false) {
          try {
            const client = await getClobClient(agentId, db);
            if (client) {
              const bal = await client.client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
              report.balance = {
                exchange: bal?.balance || '0',
                allowances_ok: Object.values(bal?.allowances || {}).every((v: any) => v !== '0' && v !== 0),
              };
            }
          } catch (e: any) {
            report.balance = { error: e.message };
          }
        }

        // 6. Quick opportunity scan (optional)
        if (p.run_screener) {
          try {
            const { screenMarkets } = await import('../../polymarket-engines/screener.js');
            const scan = await screenMarkets({ strategy: 'best_opportunities', limit: 5 });
            report.opportunities = {
              scanned: scan.scanned,
              top_picks: scan.markets.slice(0, 3).map((s: any) => ({
                question: s.market.question,
                score: s.scores.total,
                recommendation: s.recommendation,
              })),
            };
          } catch (e: any) {
            report.opportunities = { error: e.message };
          }
        }

        // Summary
        report.summary = {
          actions_count: report.actions_needed.length,
          status: report.actions_needed.length > 0
            ? report.actions_needed.some((a: any) => a.type === 'critical') ? 'CRITICAL' : 'NEEDS_ATTENTION'
            : 'ALL_CLEAR',
        };

        return jsonResult(report);
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
          if (strategies.length > 0) {
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
          }

          // Fallback: compute from live positions when strategy_stats table is empty
          let fallbackData: any[] = [];
          if (db) {
            try {
              const creds = await (db.query || db.execute).call(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = $1`, [agentId]);
              const addr = (creds?.rows || creds)?.[0]?.funder_address;
              if (addr) {
                const positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${addr}`).catch(() => null);
                if (Array.isArray(positions) && positions.length > 0) {
                  // Group by market category/slug to get per-strategy breakdown
                  const byCategory: Record<string, { trades: number; wins: number; totalPnl: number }> = {};
                  for (const pos of positions) {
                    const cat = pos.market_slug?.split('-').slice(0, 2).join('-') || pos.title?.split(' ').slice(0, 2).join('-') || 'unknown';
                    const pnl = parseFloat(pos.cashPnl ?? pos.pnl ?? 0);
                    if (isNaN(pnl)) continue;
                    if (!byCategory[cat]) byCategory[cat] = { trades: 0, wins: 0, totalPnl: 0 };
                    byCategory[cat].trades++;
                    if (pnl > 0) byCategory[cat].wins++;
                    byCategory[cat].totalPnl += pnl;
                  }
                  fallbackData = Object.entries(byCategory).map(([name, d]) => ({
                    name,
                    trades: d.trades,
                    wins: d.wins,
                    win_rate: d.trades > 0 ? `${((d.wins / d.trades) * 100).toFixed(1)}%` : '0%',
                    total_pnl: `$${d.totalPnl.toFixed(2)}`,
                    verdict: d.trades > 0 && (d.wins / d.trades) > 0.6 ? 'WINNING' :
                             d.trades > 0 && (d.wins / d.trades) > 0.45 ? 'NEUTRAL' : 'LOSING',
                  })).sort((a, b) => parseFloat(b.total_pnl.slice(1)) - parseFloat(a.total_pnl.slice(1)));
                }
              }
            } catch {}
          }

          if (fallbackData.length > 0) {
            return jsonResult({
              source: 'live_positions',
              note: 'Computed from live positions. Record predictions with signals_used for more accurate tracking.',
              strategies: fallbackData,
            });
          }

          return jsonResult({ message: 'No strategy data yet. Make some trades first, then this tool will show performance by market category.' });
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

    // ═══ OPPORTUNITY SCANNER ══════════════════════════════════

    {
      name: 'poly_scan_opportunities',
      description: 'Automated opportunity scanner: finds markets with unusual volume spikes, price dislocations, closing-soon with wide spreads, new markets with thin books, or mean reversion setups.',
      category: 'enterprise' as const,
      parameters: { type: 'object' as const, properties: {
        strategies: { type: 'array', items: { type: 'string' }, description: 'Opportunity types: volume_spike, price_dislocation, closing_soon, new_market, thin_book, mean_reversion' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Limit to these categories' },
        min_edge: { type: 'number', description: 'Min perceived edge % to report (default: 5)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      }},
      async execute(_id: string, p: any) {
        try {
          const strategies = p.strategies || ['volume_spike', 'price_dislocation', 'closing_soon', 'new_market', 'thin_book', 'mean_reversion'];
          const minEdge = p.min_edge || 5;
          const limit = p.limit || 20;
          const opportunities: any[] = [];

          // Fetch from BOTH /markets and /events for maximum coverage (same pattern as poly_search_markets)
          const mktQs = new URLSearchParams({ active: 'true', closed: 'false', order: 'volume', ascending: 'false', limit: '100' });
          if (p.categories?.length === 1) mktQs.set('tag', p.categories[0]);
          const evQs: Record<string, string> = { active: 'true', closed: 'false', order: 'volume', ascending: 'false', limit: '200' };
          if (p.categories?.length === 1) evQs.tag_id = p.categories[0];

          // For new_market strategy, also fetch by creation date
          const needsNew = strategies.includes('new_market');
          const newMktQs = needsNew ? new URLSearchParams({ active: 'true', closed: 'false', order: 'createdAt', ascending: 'false', limit: '50' }) : null;

          const [marketsRaw, eventsRaw, newMarketsRaw] = await Promise.all([
            apiFetch(`${GAMMA_API}/markets?${mktQs}`).catch(() => []),
            apiFetch(`${GAMMA_API}/events?${new URLSearchParams(evQs)}`).catch(() => []),
            newMktQs ? apiFetch(`${GAMMA_API}/markets?${newMktQs}`).catch(() => []) : Promise.resolve([]),
          ]);

          // Merge and deduplicate
          let allRaw = Array.isArray(marketsRaw) ? [...marketsRaw] : [];
          if (Array.isArray(eventsRaw)) {
            for (const ev of eventsRaw) {
              if (ev.markets && Array.isArray(ev.markets)) {
                for (const em of ev.markets) {
                  if (em.active && !em.closed) allRaw.push(em);
                }
              }
            }
          }
          if (Array.isArray(newMarketsRaw)) {
            for (const nm of newMarketsRaw) {
              if (nm.active && !nm.closed) allRaw.push(nm);
            }
          }
          const seen = new Set<string>();
          allRaw = allRaw.filter(m => {
            const k = m.conditionId || m.id;
            if (seen.has(k)) return false;
            seen.add(k);
            // Filter out resolved/closed/dead markets
            if (m.closed === true || m.closed === 'true') return false;
            if (m.resolved === true || m.resolved === 'true') return false;
            if (parseFloat(m.liquidity || '0') <= 0) return false;
            return true;
          });

          if (allRaw.length === 0) return jsonResult({ opportunities: [], message: 'No active markets found' });

          const now = Date.now();

          for (const m of allRaw) {
            if (p.categories?.length && !p.categories.some((c: string) => (m.tags || []).includes(c) || m.slug?.includes(c.toLowerCase()))) continue;

            const volume = parseFloat(m.volume || '0');
            const liquidity = parseFloat(m.liquidity || '0');
            const endDate = m.endDate ? new Date(m.endDate).getTime() : 0;
            let prices: number[] = [];
            try {
              const raw = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
              if (Array.isArray(raw)) prices = raw.map((pr: any) => parseFloat(pr));
            } catch {}

            // Strategy: volume_spike — high volume relative to liquidity
            if (strategies.includes('volume_spike') && volume > 0 && liquidity > 0) {
              const volToLiq = volume / liquidity;
              if (volToLiq > 10) {
                opportunities.push({
                  strategy: 'volume_spike',
                  market: slimMarket(m),
                  signal: `Volume/Liquidity ratio: ${volToLiq.toFixed(1)}x — significant activity relative to book depth`,
                  edge_estimate: Math.min(volToLiq * 2, 30),
                  urgency: volToLiq > 50 ? 'high' : 'medium',
                });
              }
            }

            // Strategy: price_dislocation — prices that don't sum to ~1.0 (multi-outcome)
            if (strategies.includes('price_dislocation') && prices.length >= 2) {
              const sum = prices.reduce((a, b) => a + b, 0);
              const dislocation = Math.abs(sum - 1.0) * 100;
              if (dislocation >= minEdge) {
                opportunities.push({
                  strategy: 'price_dislocation',
                  market: slimMarket(m),
                  signal: `Price sum: ${sum.toFixed(4)} (${sum > 1 ? 'overpriced' : 'underpriced'} by ${dislocation.toFixed(1)}%)`,
                  edge_estimate: dislocation,
                  urgency: dislocation > 10 ? 'high' : 'medium',
                });
              }
            }

            // Strategy: closing_soon — markets ending within 48h with wide spreads
            if (strategies.includes('closing_soon') && endDate > 0) {
              const hoursLeft = (endDate - now) / 3600_000;
              if (hoursLeft > 0 && hoursLeft <= 48 && prices.length >= 2) {
                // Check for wide spread (price far from 0 or 1 means uncertainty)
                const maxPrice = Math.max(...prices);
                const uncertainty = Math.min(maxPrice, 1 - maxPrice) * 100;
                if (uncertainty >= minEdge) {
                  opportunities.push({
                    strategy: 'closing_soon',
                    market: slimMarket(m),
                    signal: `Closes in ${hoursLeft.toFixed(1)}h — leading outcome at ${(maxPrice * 100).toFixed(1)}% (${uncertainty.toFixed(1)}% uncertainty)`,
                    edge_estimate: uncertainty,
                    urgency: hoursLeft < 12 ? 'high' : 'medium',
                  });
                }
              }
            }

            // Strategy: new_market — created within last 24h with thin liquidity
            if (strategies.includes('new_market')) {
              const createdAt = m.createdAt ? new Date(m.createdAt).getTime() : 0;
              const hoursOld = (now - createdAt) / 3600_000;
              if (hoursOld > 0 && hoursOld <= 24 && liquidity < 50_000) {
                opportunities.push({
                  strategy: 'new_market',
                  market: slimMarket(m),
                  signal: `${hoursOld.toFixed(1)}h old, $${liquidity.toFixed(0)} liquidity — early-mover opportunity`,
                  edge_estimate: Math.min(20, (50_000 - liquidity) / 2500),
                  urgency: hoursOld < 6 ? 'high' : 'medium',
                });
              }
            }

            // Strategy: thin_book — very low liquidity relative to volume
            if (strategies.includes('thin_book') && liquidity > 0 && liquidity < 10_000 && volume > 5_000) {
              opportunities.push({
                strategy: 'thin_book',
                market: slimMarket(m),
                signal: `Only $${liquidity.toFixed(0)} liquidity but $${volume.toFixed(0)} volume — thin book, potential for price impact`,
                edge_estimate: Math.min(25, (10_000 - liquidity) / 400),
                urgency: liquidity < 2000 ? 'high' : 'medium',
              });
            }

            // Strategy: mean_reversion — price far from 50% on binary markets
            if (strategies.includes('mean_reversion') && prices.length === 2) {
              const yesPrice = prices[0];
              if (yesPrice >= 0.15 && yesPrice <= 0.85) {
                // Look for markets where price moved sharply (volume spike + non-extreme price)
                const volToLiq = volume / Math.max(liquidity, 1);
                if (volToLiq > 5 && yesPrice >= 0.25 && yesPrice <= 0.75) {
                  opportunities.push({
                    strategy: 'mean_reversion',
                    market: slimMarket(m),
                    signal: `Yes at ${(yesPrice * 100).toFixed(1)}% with ${volToLiq.toFixed(1)}x volume/liquidity — potential overreaction`,
                    edge_estimate: Math.abs(yesPrice - 0.5) * 20 + volToLiq,
                    urgency: 'low',
                  });
                }
              }
            }
          }

          // Sort by edge estimate descending, limit results
          opportunities.sort((a, b) => (b.edge_estimate || 0) - (a.edge_estimate || 0));
          const results = opportunities.slice(0, limit);

          // Filter by min_edge
          const filtered = results.filter(o => (o.edge_estimate || 0) >= minEdge);

          return jsonResult({
            scanned: allRaw.length,
            strategies_used: strategies,
            count: filtered.length,
            opportunities: filtered,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

  ];

  // Add screener tools (pass options for freshness tracking)
  try {
    const screenerTools = createScreenerTools(options) as AnyAgentTool[];
    tools.push(...screenerTools);
    tools.push(..._pipelineTools);
  } catch (e: any) {
    console.warn('[polymarket] Screener tools not loaded:', e.message);
  }

  // Add watcher tools (convert handler → execute format)
  try {
    const watcherTools = createWatcherTools({ db: { getEngineDB: () => db }, agentId });
    for (const wt of watcherTools) {
      tools.push({
        name: wt.name,
        description: wt.description,
        category: 'enterprise' as const,
        parameters: wt.parameters,
        async execute(_id: string, p: any) {
          try {
            const result = await wt.handler(p);
            return jsonResult(result);
          } catch (e: any) {
            return errorResult(e.message);
          }
        },
      } as any);
    }
  } catch (e: any) {
    console.warn('[polymarket] Watcher tools not loaded:', e.message);
  }

  // Add all extension tool modules
  const extensions = [
    { name: 'Execution', fn: createPolymarketExecutionTools },
    { name: 'Social', fn: createPolymarketSocialTools },
    { name: 'Feeds', fn: createPolymarketFeedTools },
    { name: 'OnChain', fn: createPolymarketOnchainTools },
    { name: 'Analytics', fn: createPolymarketAnalyticsTools },
    { name: 'Portfolio', fn: createPolymarketPortfolioTools },
    { name: 'Quant', fn: createPolymarketQuantTools },
    { name: 'Counterintel', fn: createPolymarketCounterintelTools },
    { name: 'Optimizer', fn: createPolymarketOptimizerTools },
  ];
  for (const ext of extensions) {
    try {
      const extTools = ext.fn(options);
      tools.push(...extTools);
    } catch (e: any) {
      console.warn(`[polymarket] ${ext.name} tools not loaded:`, e.message);
    }
  }

  // Deduplicate tools by name (last one wins)
  const seen = new Set<string>();
  const deduped: typeof tools = [];
  for (let i = tools.length - 1; i >= 0; i--) {
    const name = (tools[i] as any).name;
    if (!seen.has(name)) {
      seen.add(name);
      deduped.unshift(tools[i]);
    }
  }

  return deduped;
}
