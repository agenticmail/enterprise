/**
 * Polymarket Trading Optimizer Engine
 *
 * High-frequency trading optimization functions:
 * - Daily scorecard: real-time P&L vs daily target
 * - Momentum scanner: find markets moving RIGHT NOW
 * - Quick edge calculator: one-call GO/NO-GO trade decision
 * - Position heatmap: urgency-ranked position overview
 * - Profit lock: auto-conservative mode after hitting target
 * - Capital recycler: redeploy freed capital to best opportunities
 */

import {
  GAMMA_API, CLOB_API,
  cachedFetchJSON, apiFetch,
  fetchPriceHistory,
} from './shared.js';
import { calculateKelly } from './quant.js';
import { screenMarkets } from './screener.js';

// ═══════════════════════════════════════════════════════════════════
//  DAILY SCORECARD
// ═══════════════════════════════════════════════════════════════════

export interface DailyScorecardResult {
  date: string;
  // P&L
  total_pnl: number;
  realized_pnl: number;
  unrealized_pnl: number;
  // Target tracking
  daily_target: number;
  target_progress_pct: number;
  on_track: boolean;
  // Positions
  open_positions: number;
  trades_today: number;
  wins_today: number;
  losses_today: number;
  win_rate_today: number;
  // Capital
  available_capital: number;
  deployed_capital: number;
  capital_utilization_pct: number;
  // Risk
  max_drawdown_today: number;
  largest_loss_today: number;
  // Guidance
  status: 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'TARGET_HIT' | 'STOP_TRADING';
  recommendation: string;
}

export async function dailyScorecard(params: {
  walletAddress: string;
  dailyTarget?: number;
  maxDailyLoss?: number;
  tradesToday?: number;
  maxDailyTrades?: number;
}): Promise<DailyScorecardResult> {
  const { walletAddress, dailyTarget = 10, maxDailyLoss = 50, tradesToday = 0 } = params;

  // Fetch live positions
  let positions: any[] = [];
  try {
    positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${walletAddress}`) || [];
    if (!Array.isArray(positions)) positions = [];
  } catch { positions = []; }

  // Calculate P&L
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  let deployedCapital = 0;
  let winsToday = 0;
  let lossesToday = 0;
  let largestLoss = 0;

  for (const pos of positions) {
    const pnl = parseFloat(pos.cashPnl ?? pos.pnl ?? '0');
    const size = parseFloat(pos.size ?? pos.currentValue ?? '0');
    const entryPrice = parseFloat(pos.avgPrice ?? pos.avg_price ?? '0');
    const currentPrice = parseFloat(pos.curPrice ?? pos.current_price ?? '0');

    if (isNaN(pnl)) continue;

    if (pos.resolved || pos.closed) {
      realizedPnl += pnl;
      if (pnl > 0) winsToday++;
      else if (pnl < 0) { lossesToday++; largestLoss = Math.min(largestLoss, pnl); }
    } else {
      const unrealPnl = currentPrice > 0 && entryPrice > 0
        ? (currentPrice - entryPrice) * size
        : pnl;
      unrealizedPnl += unrealPnl;
      deployedCapital += size * entryPrice;
    }
  }

  const totalPnl = realizedPnl + unrealizedPnl;
  const targetProgressPct = dailyTarget > 0 ? (totalPnl / dailyTarget) * 100 : 0;
  const openPositions = positions.filter(p => !p.resolved && !p.closed).length;

  // Determine status
  let status: DailyScorecardResult['status'];
  let recommendation: string;

  if (totalPnl <= -maxDailyLoss) {
    status = 'STOP_TRADING';
    recommendation = `Daily loss limit hit ($${Math.abs(totalPnl).toFixed(2)}/$${maxDailyLoss}). STOP TRADING. Close risky positions and wait until tomorrow.`;
  } else if (totalPnl >= dailyTarget) {
    status = 'TARGET_HIT';
    recommendation = `Daily target achieved! $${totalPnl.toFixed(2)}/$${dailyTarget}. Switch to conservative mode: only take A+ setups, reduce position sizes by 50%.`;
  } else if (targetProgressPct >= 70) {
    status = 'AHEAD';
    recommendation = `Strong day — ${targetProgressPct.toFixed(0)}% to target. Stay disciplined, don't force trades. 1-2 more good trades to hit target.`;
  } else if (targetProgressPct >= 30) {
    status = 'ON_TRACK';
    recommendation = `Progressing well. Focus on highest-conviction opportunities. Use poly_momentum_scanner to find moving markets.`;
  } else {
    status = 'BEHIND';
    recommendation = `Behind target. Don't chase — review poly_screen_markets for best opportunities. Consider increasing position sizes on A+ setups within risk limits.`;
  }

  const totalTrades = winsToday + lossesToday + tradesToday;
  const winRate = totalTrades > 0 ? (winsToday / totalTrades) * 100 : 0;

  // Estimate available capital (basic — full version would check wallet balance)
  const availableCapital = Math.max(0, 500 - deployedCapital); // placeholder

  return {
    date: new Date().toISOString().slice(0, 10),
    total_pnl: +totalPnl.toFixed(2),
    realized_pnl: +realizedPnl.toFixed(2),
    unrealized_pnl: +unrealizedPnl.toFixed(2),
    daily_target: dailyTarget,
    target_progress_pct: +targetProgressPct.toFixed(1),
    on_track: targetProgressPct >= 30,
    open_positions: openPositions,
    trades_today: totalTrades,
    wins_today: winsToday,
    losses_today: lossesToday,
    win_rate_today: +winRate.toFixed(1),
    available_capital: +availableCapital.toFixed(2),
    deployed_capital: +deployedCapital.toFixed(2),
    capital_utilization_pct: deployedCapital > 0 ? +((deployedCapital / (deployedCapital + availableCapital)) * 100).toFixed(1) : 0,
    max_drawdown_today: +largestLoss.toFixed(2),
    largest_loss_today: +largestLoss.toFixed(2),
    status,
    recommendation,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  MOMENTUM SCANNER — find markets moving RIGHT NOW
// ═══════════════════════════════════════════════════════════════════

export interface MomentumMarket {
  slug: string;
  question: string;
  token_id: string;
  current_price: number;
  price_1h_ago: number;
  price_change_pct: number;
  volume_24h: number;
  liquidity: number;
  direction: 'UP' | 'DOWN';
  momentum_score: number;
  trade_suggestion: string;
}

export async function momentumScan(params?: {
  minChangePct?: number;
  limit?: number;
  direction?: 'UP' | 'DOWN' | 'BOTH';
}): Promise<{ markets: MomentumMarket[]; scanned: number; movers_found: number }> {
  const minChange = params?.minChangePct ?? 2;
  const limit = params?.limit ?? 10;
  const dirFilter = params?.direction ?? 'BOTH';

  // Fetch active high-volume markets
  const markets = await cachedFetchJSON(
    `${GAMMA_API}/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false`,
    60_000,
  ).catch(() => []);

  if (!Array.isArray(markets) || markets.length === 0) {
    return { markets: [], scanned: 0, movers_found: 0 };
  }

  const movers: MomentumMarket[] = [];

  // Check price movement for each market
  const checks = markets.slice(0, 100).map(async (m: any) => {
    try {
      const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
      const currentPrice = parseFloat(prices[0]) || 0;
      if (currentPrice <= 0.01 || currentPrice >= 0.99) return; // Skip resolved

      const tokens = m.clobTokenIds ? JSON.parse(m.clobTokenIds) : [];
      const tokenId = tokens[0];
      if (!tokenId) return;

      // Skip markets whose end date has passed (expired game markets show fake "momentum")
      const endDate = m.endDate || m.end_date_iso;
      if (endDate && new Date(endDate).getTime() < Date.now()) return;

      const volume = parseFloat(m.volume24hr || m.volume || '0');
      const liquidity = parseFloat(m.liquidity || '0');
      if (liquidity < 200) return; // Skip very illiquid (lowered from $1000)

      // Get 24h price history (~20 data points at 1d/fidelity=60)
      const history = await fetchPriceHistory(tokenId, '1d').catch(() => []);
      if (history.length < 2) return;

      // Compare current price vs recent history points
      // With ~20 data points over 24h, each point is ~1.2h apart
      const priceRecent = history[history.length - 2]; // ~1-2h ago
      const priceMid = history.length >= 5 ? history[history.length - 5] : history[0]; // ~5-6h ago
      const priceOld = history[0]; // ~24h ago
      const changeRecent = priceRecent > 0 ? ((currentPrice - priceRecent) / priceRecent) * 100 : 0;
      const changeMid = priceMid > 0 ? ((currentPrice - priceMid) / priceMid) * 100 : 0;
      const change24h = priceOld > 0 ? ((currentPrice - priceOld) / priceOld) * 100 : 0;
      // Use the largest absolute change to catch momentum at any timeframe
      const changes = [{ pct: changeRecent, ref: priceRecent }, { pct: changeMid, ref: priceMid }, { pct: change24h, ref: priceOld }];
      changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      const changePct = changes[0].pct;
      const hoursAgo = changes[0].ref;

      if (Math.abs(changePct) < minChange) return;
      const direction = changePct > 0 ? 'UP' : 'DOWN';
      if (dirFilter !== 'BOTH' && direction !== dirFilter) return;

      // Momentum score: combines magnitude + volume + recency
      const momentumScore = Math.min(100, Math.abs(changePct) * 3 + Math.log10(volume + 1) * 5);

      let suggestion: string;
      if (Math.abs(changePct) > 15) {
        suggestion = `${direction === 'UP' ? 'CAUTION' : 'CAUTION'}: ${Math.abs(changePct).toFixed(1)}% move — likely overextended. Wait for pullback before entering.`;
      } else if (Math.abs(changePct) > 8) {
        suggestion = `Strong ${direction.toLowerCase()} momentum. Check if driven by news (poly_breaking_news). If fundamentally justified, trade with the trend.`;
      } else {
        suggestion = `Moderate ${direction.toLowerCase()} move. Good entry opportunity if your analysis confirms the direction. Check poly_smart_money_index.`;
      }

      movers.push({
        slug: m.slug,
        question: m.question,
        token_id: tokenId,
        current_price: +currentPrice.toFixed(4),
        price_1h_ago: +hoursAgo.toFixed(4),
        price_change_pct: +changePct.toFixed(2),
        volume_24h: +volume.toFixed(0),
        liquidity: +liquidity.toFixed(0),
        direction,
        momentum_score: +momentumScore.toFixed(1),
        trade_suggestion: suggestion,
      });
    } catch {}
  });

  await Promise.all(checks);

  // Sort by absolute change, take top N
  movers.sort((a, b) => Math.abs(b.price_change_pct) - Math.abs(a.price_change_pct));

  return {
    markets: movers.slice(0, limit),
    scanned: markets.length,
    movers_found: movers.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  QUICK EDGE CALCULATOR — one-call GO/NO-GO
// ═══════════════════════════════════════════════════════════════════

export interface QuickEdgeResult {
  token_id: string;
  market_price: number;
  your_estimate: number;
  edge_pct: number;
  kelly_fraction: number;
  recommended_size: number;
  max_size: number;
  expected_value: number;
  decision: 'STRONG_BUY' | 'BUY' | 'MARGINAL' | 'NO_TRADE' | 'SELL' | 'STRONG_SELL';
  reasons: string[];
  warnings: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export async function quickEdge(params: {
  tokenId: string;
  estimatedProb: number;
  bankroll: number;
  maxPositionSize?: number;
  side?: 'BUY' | 'SELL';
}): Promise<QuickEdgeResult> {
  const { tokenId, estimatedProb, bankroll, maxPositionSize, side } = params;

  // Get current price
  let marketPrice = 0.5;
  let spread = 0;
  let liquidity = 0;
  try {
    const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`, 15_000);
    const bestBid = Math.max(...(book?.bids || []).map((b: any) => parseFloat(b.price)), 0);
    const bestAsk = Math.min(...(book?.asks || []).map((a: any) => parseFloat(a.price)), 1);
    marketPrice = (bestBid + bestAsk) / 2;
    spread = bestAsk - bestBid;
    liquidity = (book?.bids || []).reduce((s: number, b: any) => s + parseFloat(b.size) * parseFloat(b.price), 0)
              + (book?.asks || []).reduce((s: number, a: any) => s + parseFloat(a.size) * parseFloat(a.price), 0);
  } catch {
    // CLOB unavailable — try Gamma
    try {
      const g = await cachedFetchJSON(`${GAMMA_API}/markets?clob_token_ids=${tokenId}&limit=1`);
      if (g?.[0]?.outcomePrices) {
        const prices = JSON.parse(g[0].outcomePrices);
        marketPrice = parseFloat(prices[0]) || 0.5;
        liquidity = parseFloat(g[0].liquidity || '0');
      }
    } catch {}
  }

  // Kelly calculation
  const kelly = await calculateKelly({
    true_probability: estimatedProb,
    market_price: side === 'SELL' ? 1 - marketPrice : marketPrice,
    bankroll,
  });

  const edge = (estimatedProb - marketPrice) * 100;
  const absEdge = Math.abs(edge);
  const effectiveSide = side || (edge > 0 ? 'BUY' : edge < 0 ? 'SELL' : 'BUY');

  // Determine max size
  const maxSize = maxPositionSize || bankroll * 0.05; // 5% of bankroll default
  const kellySize = Math.min(kelly.recommended_bet?.half_kelly || 0, maxSize);

  // Decision logic
  const reasons: string[] = [];
  const warnings: string[] = [];
  let decision: QuickEdgeResult['decision'];

  // Edge assessment
  if (absEdge >= 15) { reasons.push(`Exceptional edge: ${absEdge.toFixed(1)}%`); }
  else if (absEdge >= 8) { reasons.push(`Strong edge: ${absEdge.toFixed(1)}%`); }
  else if (absEdge >= 4) { reasons.push(`Moderate edge: ${absEdge.toFixed(1)}%`); }
  else { warnings.push(`Thin edge: ${absEdge.toFixed(1)}% — may not cover spread/fees`); }

  // Spread check
  if (spread > 0.05) warnings.push(`Wide spread: ${(spread * 100).toFixed(1)}% — use limit orders`);
  if (spread > 0.10) warnings.push('Very wide spread — consider skipping');

  // Liquidity check
  if (liquidity < 5000) warnings.push(`Low liquidity: $${liquidity.toFixed(0)} — small size only`);
  if (liquidity < 1000) warnings.push('Dangerously low liquidity — avoid');

  // Kelly negative = no edge
  if (kelly.edge_pct < 0) warnings.push('Kelly shows negative edge — market may be more efficient than your estimate');

  // EV calculation
  const ev = (estimatedProb * (1 - marketPrice) - (1 - estimatedProb) * marketPrice) * kellySize;

  // Final decision
  if (kelly.edge_pct < 0 || absEdge < 2) {
    decision = 'NO_TRADE';
  } else if (absEdge >= 12 && liquidity >= 5000 && spread < 0.05) {
    decision = effectiveSide === 'BUY' ? 'STRONG_BUY' : 'STRONG_SELL';
  } else if (absEdge >= 5 && liquidity >= 2000) {
    decision = effectiveSide === 'BUY' ? 'BUY' : 'SELL';
  } else if (absEdge >= 3) {
    decision = 'MARGINAL';
  } else {
    decision = 'NO_TRADE';
  }

  // Confidence
  const confidence = absEdge >= 10 && liquidity >= 10000 ? 'HIGH'
    : absEdge >= 5 && liquidity >= 3000 ? 'MEDIUM' : 'LOW';

  // Get price trend for extra context
  try {
    const history = await fetchPriceHistory(tokenId).catch(() => []);
    if (history.length >= 10) {
      const recent5 = history.slice(-5).reduce((s, p) => s + p, 0) / 5;
      const older5 = history.slice(-10, -5).reduce((s, p) => s + p, 0) / 5;
      const trend = older5 > 0 ? ((recent5 - older5) / older5) * 100 : 0;
      if (trend > 3) reasons.push(`Upward trend: +${trend.toFixed(1)}%`);
      else if (trend < -3) reasons.push(`Downward trend: ${trend.toFixed(1)}%`);
    }
  } catch {}

  return {
    token_id: tokenId,
    market_price: +marketPrice.toFixed(4),
    your_estimate: estimatedProb,
    edge_pct: +edge.toFixed(2),
    kelly_fraction: kelly.kelly?.capped || 0,
    recommended_size: +kellySize.toFixed(2),
    max_size: +maxSize.toFixed(2),
    expected_value: +ev.toFixed(2),
    decision,
    reasons,
    warnings,
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  POSITION HEATMAP — urgency-ranked view of all positions
// ═══════════════════════════════════════════════════════════════════

export interface PositionHeat {
  market: string;
  token_id: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number;
  pnl: number;
  pnl_pct: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  urgency_score: number;
  action_needed: string;
}

export async function positionHeatmap(params: {
  walletAddress: string;
  stopLossPct?: number;
  takeProfitPct?: number;
}): Promise<{ positions: PositionHeat[]; summary: any }> {
  const { walletAddress, stopLossPct = 10, takeProfitPct = 15 } = params;

  let positions: any[] = [];
  try {
    positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${walletAddress}`) || [];
    if (!Array.isArray(positions)) positions = [];
  } catch { positions = []; }

  // Filter to open positions only
  const openPositions = positions.filter(p => !p.resolved && !p.closed && parseFloat(p.size || '0') > 0);

  const heatPositions: PositionHeat[] = [];

  for (const pos of openPositions) {
    const size = parseFloat(pos.size || '0');
    const entryPrice = parseFloat(pos.avgPrice ?? pos.avg_price ?? '0');
    const currentPrice = parseFloat(pos.curPrice ?? pos.current_price ?? '0');
    const pnl = parseFloat(pos.cashPnl ?? pos.pnl ?? '0');
    const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

    // Calculate urgency
    let urgencyScore = 0;
    let actionNeeded = '';

    // Approaching stop loss
    if (pnlPct <= -stopLossPct) {
      urgencyScore += 40;
      actionNeeded = `HIT STOP LOSS at -${stopLossPct}%! SELL IMMEDIATELY.`;
    } else if (pnlPct <= -(stopLossPct * 0.7)) {
      urgencyScore += 25;
      actionNeeded = `Approaching stop loss (${pnlPct.toFixed(1)}%). Review thesis — sell if conviction dropped.`;
    }

    // Hit take profit
    if (pnlPct >= takeProfitPct) {
      urgencyScore += 30;
      actionNeeded = actionNeeded || `Take profit target hit (+${pnlPct.toFixed(1)}%). Consider selling or trailing stop.`;
    }

    // Large unrealized loss
    if (pnl < -20) { urgencyScore += 20; }
    else if (pnl < -10) { urgencyScore += 10; }

    // Price near extremes (likely resolving soon)
    if (currentPrice >= 0.92 || currentPrice <= 0.08) {
      urgencyScore += 15;
      actionNeeded = actionNeeded || `Price at extreme (${currentPrice.toFixed(3)}) — likely resolving soon. Review if you should exit or hold.`;
    }

    // Large position (concentration risk)
    if (size * entryPrice > 50) { urgencyScore += 10; }

    if (!actionNeeded) {
      if (pnlPct > 0) actionNeeded = 'Profitable — monitor. Consider tightening trailing stop.';
      else actionNeeded = 'Underwater — review thesis. Hold if conviction unchanged.';
    }

    const urgency: PositionHeat['urgency'] =
      urgencyScore >= 35 ? 'CRITICAL' :
      urgencyScore >= 20 ? 'HIGH' :
      urgencyScore >= 10 ? 'MEDIUM' : 'LOW';

    heatPositions.push({
      market: pos.title || pos.market_slug || pos.conditionId || 'Unknown',
      token_id: pos.asset || pos.token_id || '',
      side: pos.outcome || 'YES',
      size: +size.toFixed(2),
      entry_price: +entryPrice.toFixed(4),
      current_price: +currentPrice.toFixed(4),
      pnl: +pnl.toFixed(2),
      pnl_pct: +pnlPct.toFixed(2),
      urgency,
      urgency_score: urgencyScore,
      action_needed: actionNeeded,
    });
  }

  // Sort by urgency (highest first)
  heatPositions.sort((a, b) => b.urgency_score - a.urgency_score);

  const criticalCount = heatPositions.filter(p => p.urgency === 'CRITICAL').length;
  const highCount = heatPositions.filter(p => p.urgency === 'HIGH').length;
  const totalPnl = heatPositions.reduce((s, p) => s + p.pnl, 0);

  return {
    positions: heatPositions,
    summary: {
      total_positions: heatPositions.length,
      critical: criticalCount,
      high: highCount,
      total_unrealized_pnl: +totalPnl.toFixed(2),
      action: criticalCount > 0
        ? `${criticalCount} CRITICAL position(s) need immediate attention!`
        : highCount > 0
        ? `${highCount} position(s) need review soon.`
        : 'All positions stable.',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  PROFIT LOCK — switch to conservative mode after hitting target
// ═══════════════════════════════════════════════════════════════════

export interface ProfitLockResult {
  should_lock: boolean;
  current_pnl: number;
  daily_target: number;
  progress_pct: number;
  mode: 'AGGRESSIVE' | 'NORMAL' | 'CONSERVATIVE' | 'LOCKED';
  max_position_size: number;
  max_trades_remaining: number;
  guidance: string;
}

export function profitLockCheck(params: {
  currentPnl: number;
  dailyTarget: number;
  maxDailyLoss: number;
  tradesToday: number;
  maxDailyTrades: number;
  normalMaxSize: number;
}): ProfitLockResult {
  const { currentPnl, dailyTarget, maxDailyLoss, tradesToday, maxDailyTrades, normalMaxSize } = params;

  const progressPct = dailyTarget > 0 ? (currentPnl / dailyTarget) * 100 : 0;
  const tradesRemaining = Math.max(0, maxDailyTrades - tradesToday);

  let mode: ProfitLockResult['mode'];
  let maxSize: number;
  let guidance: string;

  if (currentPnl <= -maxDailyLoss) {
    mode = 'LOCKED';
    maxSize = 0;
    guidance = 'STOP. Daily loss limit hit. No more trades until tomorrow. Focus on reviewing what went wrong.';
  } else if (currentPnl >= dailyTarget * 1.5) {
    mode = 'LOCKED';
    maxSize = normalMaxSize * 0.25;
    guidance = `Exceptional day (+${progressPct.toFixed(0)}% of target). Only take can't-miss opportunities at quarter size. Protect your gains.`;
  } else if (currentPnl >= dailyTarget) {
    mode = 'CONSERVATIVE';
    maxSize = normalMaxSize * 0.5;
    guidance = `Target hit! Reduce to half position sizes. Only A+ setups with ≥10% edge. Don't give back today's profit.`;
  } else if (currentPnl >= dailyTarget * 0.7) {
    mode = 'NORMAL';
    maxSize = normalMaxSize;
    guidance = `Almost there (${progressPct.toFixed(0)}%). Stay disciplined. 1-2 good trades to finish strong.`;
  } else if (currentPnl < 0 && Math.abs(currentPnl) > maxDailyLoss * 0.5) {
    mode = 'CONSERVATIVE';
    maxSize = normalMaxSize * 0.5;
    guidance = `Down ${Math.abs(currentPnl).toFixed(2)} — halfway to daily loss limit. Reduce size, focus on highest-conviction only.`;
  } else {
    mode = 'AGGRESSIVE';
    maxSize = normalMaxSize;
    guidance = `${progressPct.toFixed(0)}% to target. Full speed ahead. Find and execute on best opportunities.`;
  }

  return {
    should_lock: mode === 'LOCKED',
    current_pnl: +currentPnl.toFixed(2),
    daily_target: dailyTarget,
    progress_pct: +progressPct.toFixed(1),
    mode,
    max_position_size: +maxSize.toFixed(2),
    max_trades_remaining: tradesRemaining,
    guidance,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  CAPITAL RECYCLER — redeploy freed capital to best opportunities
// ═══════════════════════════════════════════════════════════════════

export interface RecycleResult {
  freed_capital: number;
  opportunities: Array<{
    slug: string;
    question: string;
    token_id: string;
    price: number;
    edge_estimate: number;
    suggested_size: number;
    reason: string;
  }>;
  allocation_plan: string;
}

export async function recycleCapital(params: {
  freedCapital: number;
  bankroll: number;
  currentPositionSlugs?: string[];
  riskMode?: 'aggressive' | 'normal' | 'conservative';
}): Promise<RecycleResult> {
  const { freedCapital, currentPositionSlugs = [], riskMode = 'normal' } = params;

  if (freedCapital < 1) {
    return { freed_capital: 0, opportunities: [], allocation_plan: 'No freed capital to deploy.' };
  }

  // Screen for best opportunities
  const screened = await screenMarkets({ strategy: 'best_opportunities', limit: 15 }).catch(() => ({ results: [] }));
  const results = (screened as any).results || [];

  // Filter out markets we already have positions in
  const currentSlugsSet = new Set(currentPositionSlugs.map(s => s.toLowerCase()));
  const candidates = results.filter((m: any) => !currentSlugsSet.has((m.slug || '').toLowerCase()));

  // Size allocation based on risk mode
  const maxPerTrade = riskMode === 'aggressive' ? freedCapital * 0.5
    : riskMode === 'conservative' ? freedCapital * 0.2
    : freedCapital * 0.33;

  const opportunities = candidates.slice(0, 5).map((m: any) => {
    const price = parseFloat(m.current_price || m.yes_price || '0.5');
    const score = m.score || m.total_score || 50;
    const edgeEstimate = Math.max(0, (score - 50) * 0.3); // rough estimate from screener score
    const suggestedSize = Math.min(maxPerTrade, freedCapital * (score / 300));

    return {
      slug: m.slug || m.market_slug || '',
      question: m.question || m.market || '',
      token_id: m.token_id || '',
      price: +price.toFixed(4),
      edge_estimate: +edgeEstimate.toFixed(1),
      suggested_size: +suggestedSize.toFixed(2),
      reason: m.recommendation || `Score: ${score}/100. ${m.edge_reason || ''}`,
    };
  });

  const totalAllocated = opportunities.reduce((s: number, o: any) => s + o.suggested_size, 0);

  return {
    freed_capital: +freedCapital.toFixed(2),
    opportunities,
    allocation_plan: opportunities.length > 0
      ? `Deploy $${totalAllocated.toFixed(2)} of $${freedCapital.toFixed(2)} freed capital across ${opportunities.length} opportunities. Run poly_quick_edge on each before trading.`
      : 'No compelling opportunities found. Keep capital in reserve for better setups.',
  };
}
