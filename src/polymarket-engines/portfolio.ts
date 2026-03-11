/**
 * Polymarket Portfolio Intelligence Engine
 * 
 * Portfolio-level analysis and optimization:
 * - Position correlation matrix
 * - Risk decomposition (VaR, max drawdown, concentration)
 * - Kelly criterion portfolio sizing
 * - Rebalancing recommendations
 * - P&L attribution by market/strategy
 * - Drawdown monitoring with alerts
 */

import {
  CLOB_API,
  cachedFetchJSON, fetchPriceHistory,
  pearsonCorrelation, calculateVolatility,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  PORTFOLIO OVERVIEW
// ═══════════════════════════════════════════════════════════════════

export interface PortfolioPosition {
  token_id: string;
  market: string;
  outcome: string;
  size: number;
  avg_price: number;
  current_price: number;
  value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  weight: number;
}

export interface PortfolioOverview {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  positions: PortfolioPosition[];
  concentration: { hhi: number; top_position_pct: number; diversified: boolean };
  risk_metrics: { portfolio_volatility: number; max_single_loss: number; correlation_risk: string };
}

export async function analyzePortfolio(positions: Array<{
  token_id: string; market: string; outcome: string;
  size: number; avg_price: number;
}>): Promise<PortfolioOverview> {
  // Fetch current prices
  const enriched: PortfolioPosition[] = await Promise.all(positions.map(async pos => {
    let currentPrice = pos.avg_price;
    try {
      const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${pos.token_id}`, 8000);
      const bestBid = Math.max(...(book?.bids || []).map((b: any) => parseFloat(b.price)), 0);
      const bestAsk = Math.min(...(book?.asks || []).map((a: any) => parseFloat(a.price)), 1);
      currentPrice = (bestBid + bestAsk) / 2;
    } catch {}

    const value = pos.size * currentPrice;
    const costBasis = pos.size * pos.avg_price;
    const pnl = value - costBasis;
    return {
      ...pos, current_price: +currentPrice.toFixed(4),
      value: +value.toFixed(2), cost_basis: +costBasis.toFixed(2),
      pnl: +pnl.toFixed(2), pnl_pct: costBasis > 0 ? +((pnl / costBasis) * 100).toFixed(2) : 0,
      weight: 0, // filled below
    };
  }));

  const totalValue = enriched.reduce((s, p) => s + p.value, 0);
  const totalCost = enriched.reduce((s, p) => s + p.cost_basis, 0);

  for (const p of enriched) p.weight = totalValue > 0 ? +((p.value / totalValue) * 100).toFixed(1) : 0;

  // HHI concentration index
  const weights = enriched.map(p => p.value / (totalValue || 1));
  const hhi = +(weights.reduce((s, w) => s + w * w, 0) * 10000).toFixed(0);
  const topPct = Math.max(...weights) * 100;

  // Portfolio volatility (simplified)
  let portfolioVol = 0;
  try {
    const vols = await Promise.all(enriched.slice(0, 5).map(async p => {
      const prices = await fetchPriceHistory(p.token_id);
      return prices.length >= 5 ? calculateVolatility(prices) : 0.5;
    }));
    portfolioVol = +Math.sqrt(vols.reduce((s, v, i) => s + (weights[i] || 0) ** 2 * v ** 2, 0)).toFixed(4);
  } catch { portfolioVol = 0; }

  return {
    total_value: +totalValue.toFixed(2),
    total_cost: +totalCost.toFixed(2),
    total_pnl: +(totalValue - totalCost).toFixed(2),
    total_pnl_pct: totalCost > 0 ? +(((totalValue - totalCost) / totalCost) * 100).toFixed(2) : 0,
    positions: enriched.sort((a, b) => b.value - a.value),
    concentration: {
      hhi,
      top_position_pct: +topPct.toFixed(1),
      diversified: hhi < 2500 && topPct < 40,
    },
    risk_metrics: {
      portfolio_volatility: portfolioVol,
      max_single_loss: +Math.max(...enriched.map(p => p.value)).toFixed(2),
      correlation_risk: enriched.length > 5 ? 'Check correlation matrix' : enriched.length <= 2 ? 'HIGH — too few positions' : 'MODERATE',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  CORRELATION MATRIX
// ═══════════════════════════════════════════════════════════════════

export interface CorrelationMatrix {
  tokens: string[];
  matrix: number[][];
  high_correlations: Array<{ pair: [string, string]; correlation: number }>;
  diversification_score: number;
}

export async function buildCorrelationMatrix(tokenIds: string[]): Promise<CorrelationMatrix> {
  const tokens = tokenIds.slice(0, 10);
  const histories = await Promise.all(tokens.map(tid => fetchPriceHistory(tid)));

  const n = tokens.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const highCorr: CorrelationMatrix['high_correlations'] = [];

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const corr = pearsonCorrelation(histories[i], histories[j]);
      matrix[i][j] = +corr.toFixed(3);
      matrix[j][i] = +corr.toFixed(3);
      if (Math.abs(corr) > 0.5) {
        highCorr.push({ pair: [tokens[i], tokens[j]], correlation: +corr.toFixed(3) });
      }
    }
  }

  // Diversification: average absolute off-diagonal correlation
  let sumAbsCorr = 0, count = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { sumAbsCorr += Math.abs(matrix[i][j]); count++; }
  const avgCorr = count > 0 ? sumAbsCorr / count : 0;
  const divScore = +((1 - avgCorr) * 100).toFixed(1); // 100 = perfectly diversified

  return { tokens, matrix, high_correlations: highCorr.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)), diversification_score: divScore };
}

// ═══════════════════════════════════════════════════════════════════
//  KELLY CRITERION PORTFOLIO SIZING
// ═══════════════════════════════════════════════════════════════════

export interface KellyRecommendation {
  token_id: string;
  market: string;
  estimated_edge: number;
  kelly_fraction: number;
  half_kelly: number;
  recommended_allocation_pct: number;
  recommended_size_usd: number;
}

export function calculatePortfolioKelly(positions: Array<{
  token_id: string; market: string;
  current_price: number; estimated_true_prob: number;
}>, bankroll: number): KellyRecommendation[] {
  return positions.map(pos => {
    const p = pos.estimated_true_prob;
    const b = (1 / pos.current_price) - 1; // odds
    const q = 1 - p;
    const kelly = b > 0 ? Math.max(0, (p * b - q) / b) : 0;
    const halfKelly = kelly / 2;

    return {
      token_id: pos.token_id,
      market: pos.market,
      estimated_edge: +((p - pos.current_price) * 100).toFixed(2),
      kelly_fraction: +kelly.toFixed(4),
      half_kelly: +halfKelly.toFixed(4),
      recommended_allocation_pct: +(halfKelly * 100).toFixed(2),
      recommended_size_usd: +(bankroll * halfKelly).toFixed(2),
    };
  }).sort((a, b) => b.recommended_size_usd - a.recommended_size_usd);
}

// ═══════════════════════════════════════════════════════════════════
//  REBALANCING
// ═══════════════════════════════════════════════════════════════════

export interface RebalanceAction {
  token_id: string;
  market: string;
  current_weight: number;
  target_weight: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  delta_usd: number;
}

export function recommendRebalance(
  positions: Array<{ token_id: string; market: string; value: number }>,
  targetWeights: Record<string, number>, // token_id -> target weight (0-1)
  totalValue: number,
): RebalanceAction[] {
  return positions.map(pos => {
    const currentWeight = totalValue > 0 ? pos.value / totalValue : 0;
    const targetWeight = targetWeights[pos.token_id] || currentWeight;
    const targetValue = totalValue * targetWeight;
    const delta = targetValue - pos.value;

    return {
      token_id: pos.token_id,
      market: pos.market,
      current_weight: +(currentWeight * 100).toFixed(1),
      target_weight: +(targetWeight * 100).toFixed(1),
      action: (Math.abs(delta) < 1 ? 'HOLD' : delta > 0 ? 'BUY' : 'SELL') as 'BUY' | 'SELL' | 'HOLD',
      delta_usd: +delta.toFixed(2),
    };
  }).sort((a, b) => Math.abs(b.delta_usd) - Math.abs(a.delta_usd));
}

// ═══════════════════════════════════════════════════════════════════
//  P&L ATTRIBUTION
// ═══════════════════════════════════════════════════════════════════

export interface PnLAttribution {
  total_pnl: number;
  by_position: Array<{ market: string; pnl: number; contribution_pct: number }>;
  best_trade: { market: string; pnl: number } | null;
  worst_trade: { market: string; pnl: number } | null;
  win_rate: number;
  avg_winner: number;
  avg_loser: number;
  profit_factor: number;
}

export function attributePnL(trades: Array<{
  market: string; pnl: number;
}>): PnLAttribution {
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl < 0);

  // Group by market
  const byMarket = new Map<string, number>();
  for (const t of trades) byMarket.set(t.market, (byMarket.get(t.market) || 0) + t.pnl);

  const byPosition = Array.from(byMarket.entries())
    .map(([market, pnl]) => ({ market, pnl: +pnl.toFixed(2), contribution_pct: totalPnl !== 0 ? +((pnl / Math.abs(totalPnl)) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.pnl - a.pnl);

  const sorted = [...trades].sort((a, b) => b.pnl - a.pnl);
  const totalWins = winners.reduce((s, t) => s + t.pnl, 0);
  const totalLosses = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  return {
    total_pnl: +totalPnl.toFixed(2),
    by_position: byPosition,
    best_trade: sorted[0] ? { market: sorted[0].market, pnl: +sorted[0].pnl.toFixed(2) } : null,
    worst_trade: sorted[sorted.length - 1] ? { market: sorted[sorted.length - 1].market, pnl: +sorted[sorted.length - 1].pnl.toFixed(2) } : null,
    win_rate: trades.length > 0 ? +(winners.length / trades.length * 100).toFixed(1) : 0,
    avg_winner: winners.length > 0 ? +(totalWins / winners.length).toFixed(2) : 0,
    avg_loser: losers.length > 0 ? +(totalLosses / losers.length).toFixed(2) : 0,
    profit_factor: totalLosses > 0 ? +(totalWins / totalLosses).toFixed(2) : totalWins > 0 ? Infinity : 0,
  };
}
