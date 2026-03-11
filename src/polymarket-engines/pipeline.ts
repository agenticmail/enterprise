/**
 * Polymarket Unified Analysis Pipeline
 * 
 * Chains ALL engines in sequence for comprehensive market analysis:
 * screen → quant → analytics → social → feeds → onchain → counterintel → portfolio
 * 
 * Entry points:
 * - fullAnalysis(): Complete pipeline for a single market
 * - quickAnalysis(): Fast subset (screen + quant + orderbook) for dashboard
 * - batchScreen(): Screen multiple markets with scoring
 * - portfolioReview(): Full portfolio-level analysis
 */

import { CLOB_API, GAMMA_API, cachedFetchJSON, fetchPriceHistory } from './shared.js';
import { screenMarkets } from './screener.js';
import {
  calculateKelly, runMonteCarlo,
  calculateTechnicalIndicators, analyzeVolatility,
  calculateVaR, generateCompositeSignal,
} from './quant.js';
import { detectRegime, calculateSmartMoneyIndex, analyzeMicrostructure } from './analytics.js';
import { analyzeOrderbookDepth, scanWhaleTrades, analyzeFlow } from './onchain.js';
import { analyzeTwitterSentiment, monitorRedditPulse, measureSocialVelocity } from './social.js';
import { compareOdds, trackResolution } from './feeds.js';
import { detectManipulation, assessResolutionRisk, analyzeCounterparties } from './counterintel.js';
import { analyzePortfolio, buildCorrelationMatrix, calculatePortfolioKelly, attributePnL } from './portfolio.js';

// ═══════════════════════════════════════════════════════════════════
//  FULL ANALYSIS PIPELINE
// ═══════════════════════════════════════════════════════════════════

export interface FullAnalysisResult {
  market: { question: string; slug: string; token_id: string; condition_id: string };
  timestamp: string;
  // Stage results
  screener: any | null;
  quant: {
    kelly: any | null;
    technicals: any | null;
    volatility: any | null;
    monteCarlo: any | null;
    var: any | null;
    compositeSignal: any | null;
  };
  analytics: {
    regime: any | null;
    smartMoney: any | null;
    microstructure: any | null;
  };
  onchain: {
    orderbook: any | null;
    whales: any | null;
    flow: any | null;
  };
  social: {
    twitter: any | null;
    reddit: any | null;
    velocity: any | null;
  };
  feeds: {
    odds: any | null;
    resolution: any | null;
  };
  counterintel: {
    manipulation: any | null;
    resolutionRisk: any | null;
    counterparties: any | null;
  };
  // Synthesized
  synthesis: {
    overall_score: number;
    confidence: number;
    action: string;
    recommended_size: number;
    entry_price: number;
    target_price: number;
    stop_loss: number;
    risk_reward: number;
    key_factors: string[];
    warnings: string[];
    thesis: string;
  };
}

export async function fullAnalysis(params: {
  tokenId: string;
  marketSlug?: string;
  conditionId?: string;
  marketQuestion?: string;
  currentPrice?: number;
  bankroll?: number;
  estimatedTrueProb?: number;
  side?: 'BUY' | 'SELL';
  skipSlow?: boolean; // skip social/feeds for speed
}): Promise<FullAnalysisResult> {
  const { tokenId, marketSlug, conditionId, marketQuestion, bankroll = 100, side } = params;

  // Resolve market info
  let market: any = { question: marketQuestion || '', slug: marketSlug || '', token_id: tokenId, condition_id: conditionId || '' };
  if (marketSlug) {
    try {
      const data = await cachedFetchJSON(`${GAMMA_API}/markets?slug=${marketSlug}`);
      if (data?.[0]) {
        market = { question: data[0].question, slug: data[0].slug, token_id: tokenId, condition_id: data[0].condition_id || data[0].conditionId || conditionId || '' };
      }
    } catch {}
  }

  // Get current price — try CLOB book first, fall back to Gamma market data
  let currentPrice = params.currentPrice || 0.5;
  let bestBid = 0, bestAsk = 1;
  let clobAvailable = true;
  try {
    const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
    bestBid = Math.max(...(book?.bids || []).map((b: any) => parseFloat(b.price)), 0);
    bestAsk = Math.min(...(book?.asks || []).map((a: any) => parseFloat(a.price)), 1);
    currentPrice = (bestBid + bestAsk) / 2;
  } catch {
    clobAvailable = false;
    // Fallback: get price from Gamma API
    try {
      const gammaData = await cachedFetchJSON(`${GAMMA_API}/markets?clob_token_ids=${tokenId}&limit=1`);
      if (gammaData?.[0]?.outcomePrices) {
        const prices = JSON.parse(gammaData[0].outcomePrices);
        currentPrice = parseFloat(prices[0]) || 0.5;
      }
    } catch {}
  }

  const estimatedProb = params.estimatedTrueProb || currentPrice;
  const priceHistory = await fetchPriceHistory(tokenId).catch(() => [] as number[]);

  // ── Run all stages in parallel where possible ──

  const [
    regimeResult, smartMoneyResult, microResult,
    orderbookResult, whaleResult, flowResult,
    manipulationResult,
  ] = await Promise.all([
    detectRegime(tokenId).catch(() => null),
    calculateSmartMoneyIndex(tokenId, market.question).catch(() => null),
    analyzeMicrostructure(tokenId).catch(() => null),
    analyzeOrderbookDepth(tokenId).catch(() => null),
    scanWhaleTrades(tokenId, 500).catch(() => null),
    analyzeFlow(tokenId).catch(() => null),
    detectManipulation(tokenId).catch(() => null),
  ]);

  // Quant (uses price history)
  let kellyResult: any = null, technicals: any = null, volatilityResult: any = null;
  let monteCarloResult: any = null, varResult: any = null, compositeSignal: any = null;

  if (priceHistory.length >= 10) {
    [kellyResult, technicals, volatilityResult, monteCarloResult, varResult, compositeSignal] = await Promise.all([
      Promise.resolve(calculateKelly({ true_probability: estimatedProb, market_price: currentPrice, bankroll })),
      calculateTechnicalIndicators({ token_id: tokenId, prices: priceHistory }).catch(() => null),
      analyzeVolatility({ token_id: tokenId, prices: priceHistory }).catch(() => null),
      runMonteCarlo({ positions: [{ token_id: tokenId, current_price: currentPrice, entry_price: currentPrice, size: bankroll }], volatility: priceHistory.length >= 20 ? calculateVolFromPrices(priceHistory) : 0.5, time_horizon_hours: 24 }).catch(() => null),
      calculateVaR({ positions: [{ token_id: tokenId, size: bankroll, entry_price: currentPrice }] }).catch(() => null),
      generateCompositeSignal({ token_id: tokenId }).catch(() => null),
    ]);
  } else {
    kellyResult = calculateKelly({ true_probability: estimatedProb, market_price: currentPrice, bankroll });
  }

  // Slower stages (social, feeds, counterintel resolution)
  let twitterResult: any = null, redditResult: any = null, velocityResult: any = null;
  let oddsResult: any = null, resolutionResult: any = null;
  let resRiskResult: any = null, counterpartyResult: any = null;

  if (!params.skipSlow) {
    const slowResults = await Promise.all([
      market.question ? analyzeTwitterSentiment(market.question).catch(() => null) : null,
      market.question ? monitorRedditPulse(market.question).catch(() => null) : null,
      market.question ? measureSocialVelocity(market.question).catch(() => null) : null,
      market.question ? compareOdds(market.question, currentPrice).catch(() => null) : null,
      marketSlug ? trackResolution(marketSlug).catch(() => null) : null,
      marketSlug ? assessResolutionRisk(marketSlug).catch(() => null) : null,
      analyzeCounterparties(tokenId, side).catch(() => null),
    ]);
    [twitterResult, redditResult, velocityResult, oddsResult, resolutionResult, resRiskResult, counterpartyResult] = slowResults;
  }

  // ── SYNTHESIS ──
  const synthesis = synthesize({
    currentPrice, estimatedProb, bankroll,
    kelly: kellyResult, technicals, regime: regimeResult, smartMoney: smartMoneyResult,
    manipulation: manipulationResult, resRisk: resRiskResult, microstructure: microResult,
    twitter: twitterResult, reddit: redditResult, compositeSignal, flow: flowResult,
    whales: whaleResult, orderbook: orderbookResult,
  });

  return {
    market, timestamp: new Date().toISOString(),
    screener: null, // screener works on market lists, not single tokens
    quant: { kelly: kellyResult, technicals, volatility: volatilityResult, monteCarlo: monteCarloResult, var: varResult, compositeSignal },
    analytics: { regime: regimeResult, smartMoney: smartMoneyResult, microstructure: microResult },
    onchain: { orderbook: orderbookResult, whales: whaleResult, flow: flowResult },
    social: { twitter: twitterResult, reddit: redditResult, velocity: velocityResult },
    feeds: { odds: oddsResult, resolution: resolutionResult },
    counterintel: { manipulation: manipulationResult, resolutionRisk: resRiskResult, counterparties: counterpartyResult },
    synthesis,
  };
}

function calculateVolFromPrices(prices: number[]): number {
  if (prices.length < 2) return 0.5;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (returns.length < 2) return 0.5;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 365);
}

function synthesize(data: any): FullAnalysisResult['synthesis'] {
  const { currentPrice, estimatedProb, bankroll, kelly, technicals, regime, smartMoney, manipulation, resRisk, microstructure, twitter, reddit, compositeSignal, flow, whales, orderbook } = data;

  let score = 50; // neutral
  const factors: string[] = [];
  const warnings: string[] = [];

  // Kelly edge
  if (kelly?.edge) {
    const edge = kelly.edge;
    if (edge > 10) { score += 15; factors.push(`Strong edge: ${edge.toFixed(1)}%`); }
    else if (edge > 5) { score += 8; factors.push(`Moderate edge: ${edge.toFixed(1)}%`); }
    else if (edge < -5) { score -= 10; warnings.push(`Negative edge: ${edge.toFixed(1)}%`); }
  }

  // Regime
  if (regime) {
    if (regime.regime === 'TRENDING' && regime.trend_direction === 'UP') { score += 8; factors.push('Uptrend detected'); }
    else if (regime.regime === 'TRENDING' && regime.trend_direction === 'DOWN') { score -= 8; warnings.push('Downtrend detected'); }
    else if (regime.regime === 'MEAN_REVERTING') { factors.push('Mean-reverting regime — trade contrarian'); }
  }

  // Smart money
  if (smartMoney) {
    if (smartMoney.smart_money_index > 0.2) { score += 10; factors.push(`Smart money buying (${smartMoney.smart_money_index.toFixed(2)})`); }
    else if (smartMoney.smart_money_index < -0.2) { score -= 10; warnings.push(`Smart money selling (${smartMoney.smart_money_index.toFixed(2)})`); }
  }

  // Manipulation
  if (manipulation?.risk_level === 'HIGH') { score -= 20; warnings.push('HIGH manipulation risk detected'); }
  else if (manipulation?.risk_level === 'MEDIUM') { score -= 8; warnings.push('Moderate manipulation risk'); }

  // Resolution risk
  if (resRisk?.risk_level === 'HIGH') { score -= 15; warnings.push('HIGH resolution risk — potential disputes'); }

  // Social sentiment
  if (twitter?.overall_sentiment > 0.3) { score += 5; factors.push('Positive social sentiment'); }
  else if (twitter?.overall_sentiment < -0.3) { score -= 5; warnings.push('Negative social sentiment'); }

  // Composite signal
  if (compositeSignal?.signal === 'BUY') { score += 8; factors.push('Composite signal: BUY'); }
  else if (compositeSignal?.signal === 'SELL') { score -= 8; warnings.push('Composite signal: SELL'); }

  // Flow
  if (flow?.flows?.['1h']?.signal === 'bullish') { score += 5; factors.push('Bullish order flow (1h)'); }
  else if (flow?.flows?.['1h']?.signal === 'bearish') { score -= 5; warnings.push('Bearish order flow (1h)'); }

  // Microstructure
  if (microstructure?.market_quality === 'POOR') { score -= 10; warnings.push('Poor market quality (wide spread)'); }

  score = Math.max(0, Math.min(100, score));

  const action = score >= 70 ? 'STRONG_BUY' : score >= 58 ? 'BUY' : score <= 30 ? 'STRONG_SELL' : score <= 42 ? 'SELL' : 'HOLD';
  const recommended = kelly?.half_kelly_size || 0;
  const target = Math.min(0.99, currentPrice * 1.15);
  const stopLoss = Math.max(0.01, currentPrice * 0.80);
  const riskReward = (target - currentPrice) / (currentPrice - stopLoss) || 0;

  return {
    overall_score: score,
    confidence: factors.length > 3 ? 0.8 : factors.length > 1 ? 0.6 : 0.4,
    action,
    recommended_size: +recommended.toFixed(2),
    entry_price: +currentPrice.toFixed(4),
    target_price: +target.toFixed(4),
    stop_loss: +stopLoss.toFixed(4),
    risk_reward: +riskReward.toFixed(2),
    key_factors: factors,
    warnings,
    thesis: `${action} at ${currentPrice.toFixed(3)} (score ${score}/100). ${factors.slice(0, 3).join('. ')}. ${warnings.length ? 'Risks: ' + warnings.slice(0, 2).join(', ') : 'No major risks.'}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  QUICK ANALYSIS (for dashboard buy modal)
// ═══════════════════════════════════════════════════════════════════

export interface QuickAnalysisResult {
  token_id: string;
  market: string;
  current_price: number;
  score: number;
  action: string;
  kelly: any;
  orderbook: any;
  regime: string | null;
  smart_money: number | null;
  manipulation_risk: string | null;
  thesis: string;
}

export async function quickAnalysis(tokenId: string, marketQuestion?: string, bankroll = 100): Promise<QuickAnalysisResult> {
  const result = await fullAnalysis({
    tokenId,
    marketQuestion,
    bankroll,
    skipSlow: true,
  });

  // Graceful degradation: provide fallback values when CLOB is rate-limited
  const orderbook = result.onchain.orderbook ? {
    spread: result.onchain.orderbook.spread,
    imbalance: result.onchain.orderbook.imbalance,
    quality: (result.analytics.microstructure as any)?.market_quality || 'UNKNOWN',
  } : { spread: null, imbalance: null, quality: 'UNAVAILABLE — CLOB rate limited, use poly_orderbook_depth later' };

  return {
    token_id: tokenId,
    market: result.market.question,
    current_price: result.synthesis.entry_price,
    score: result.synthesis.overall_score,
    action: result.synthesis.action,
    kelly: result.quant.kelly || { note: 'Insufficient price history for Kelly calculation', recommendation: 'Use poly_kelly_criterion directly with your estimated probability' },
    orderbook,
    regime: result.analytics.regime?.regime || 'UNAVAILABLE',
    smart_money: result.analytics.smartMoney?.smart_money_index ?? null,
    manipulation_risk: result.counterintel.manipulation?.risk_level || 'UNCHECKED',
    thesis: result.synthesis.thesis,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  BATCH SCREEN (for market discovery)
// ═══════════════════════════════════════════════════════════════════

export async function batchScreen(params?: {
  query?: string;
  limit?: number;
  strategy?: 'momentum' | 'contested' | 'best_opportunities' | 'high_volume' | 'closing_soon' | 'mispriced' | 'safe_bets' | 'new_markets';
  minScore?: number;
}): Promise<any> {
  return screenMarkets(params);
}

// ═══════════════════════════════════════════════════════════════════
//  PORTFOLIO REVIEW
// ═══════════════════════════════════════════════════════════════════

export async function portfolioReview(params: {
  positions: Array<{ token_id: string; market: string; outcome: string; size: number; avg_price: number }>;
  bankroll: number;
  closedTrades?: Array<{ market: string; pnl: number }>;
}): Promise<{
  overview: any;
  correlations: any;
  kellySizing: any;
  pnlAttribution: any | null;
  recommendations: string[];
}> {
  const overview = await analyzePortfolio(params.positions);
  const tokenIds = params.positions.map(p => p.token_id).slice(0, 10);
  const correlations = tokenIds.length >= 2 ? await buildCorrelationMatrix(tokenIds).catch(() => null) : null;

  const kellySizing = calculatePortfolioKelly(
    params.positions.map(p => {
      const pos = overview.positions.find((op: any) => op.token_id === p.token_id);
      return { token_id: p.token_id, market: p.market, current_price: pos?.current_price || p.avg_price, estimated_true_prob: pos?.current_price || p.avg_price };
    }),
    params.bankroll,
  );

  const pnlAttribution = params.closedTrades?.length ? attributePnL(params.closedTrades) : null;

  const recommendations: string[] = [];
  if (!overview.concentration.diversified) recommendations.push('Portfolio is concentrated — consider diversifying across more markets');
  if (correlations && correlations.diversification_score < 50) recommendations.push('High correlation between positions — diversification is poor');
  if (overview.total_pnl_pct < -15) recommendations.push('Portfolio down >15% — review thesis for each position');
  for (const pos of overview.positions) {
    if (pos.pnl_pct < -25) recommendations.push(`${pos.market}: Down ${Math.abs(pos.pnl_pct)}% — consider cutting losses`);
    if (pos.pnl_pct > 50) recommendations.push(`${pos.market}: Up ${pos.pnl_pct}% — consider taking partial profits`);
  }

  return { overview, correlations, kellySizing, pnlAttribution, recommendations };
}
