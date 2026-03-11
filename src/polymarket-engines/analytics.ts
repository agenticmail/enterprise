/**
 * Polymarket Advanced Analytics Engine
 * 
 * Cross-market and meta-analytical capabilities:
 * - Market correlation detection
 * - Arbitrage scanner (YES+NO != 1, multi-outcome, cross-market)
 * - Regime detection (trending vs mean-reverting vs random walk)
 * - Smart money composite index
 * - Market microstructure analysis (slippage simulation, execution quality)
 */

import {
  CLOB_API, GAMMA_API,
  cachedFetchJSON,
  fetchPriceHistory,
  pearsonCorrelation, calculateHurst, calculateVolatility,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  MARKET CORRELATION
// ═══════════════════════════════════════════════════════════════════

export interface CorrelationResult {
  tokens_analyzed: number;
  pairs_checked: number;
  significant_correlations: number;
  correlations: Array<{
    token_a: string;
    token_b: string;
    correlation: number;
    strength: string;
    direction: string;
    data_points: number;
  }>;
  arbitrage_candidates: any[];
}

export async function findCorrelations(tokenIds: string[], minCorrelation = 0.5): Promise<CorrelationResult> {
  const tokens = tokenIds.slice(0, 10);
  if (tokens.length < 2) throw new Error('Need at least 2 token IDs');

  const histories = await Promise.all(tokens.map(async tid => ({
    token_id: tid,
    prices: await fetchPriceHistory(tid),
  })));

  const correlations: CorrelationResult['correlations'] = [];
  for (let i = 0; i < histories.length; i++) {
    for (let j = i + 1; j < histories.length; j++) {
      const corr = pearsonCorrelation(histories[i].prices, histories[j].prices);
      if (Math.abs(corr) >= minCorrelation) {
        correlations.push({
          token_a: tokens[i],
          token_b: tokens[j],
          correlation: corr,
          strength: Math.abs(corr) > 0.8 ? 'STRONG' : Math.abs(corr) > 0.6 ? 'MODERATE' : 'WEAK',
          direction: corr > 0 ? 'POSITIVE' : 'NEGATIVE',
          data_points: Math.min(histories[i].prices.length, histories[j].prices.length),
        });
      }
    }
  }
  correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
    tokens_analyzed: tokens.length,
    pairs_checked: (tokens.length * (tokens.length - 1)) / 2,
    significant_correlations: correlations.length,
    correlations,
    arbitrage_candidates: correlations
      .filter(c => Math.abs(c.correlation) > 0.8)
      .map(c => ({
        ...c,
        note: c.direction === 'NEGATIVE'
          ? 'Negatively correlated — if one goes up, the other goes down. Check if pricing is consistent.'
          : 'Strongly correlated — prices should move together. Divergence = opportunity.',
      })),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  ARBITRAGE SCANNER
// ═══════════════════════════════════════════════════════════════════

export interface ArbitrageResult {
  markets_scanned: number;
  opportunities_found: number;
  opportunities: any[];
  total_potential_profit: string;
}

export async function scanArbitrage(params: {
  market_slugs?: string[];
  scan_type?: 'yes_no' | 'cross_market' | 'multi_outcome' | 'all';
  min_profit_pct?: number;
}): Promise<ArbitrageResult> {
  const opportunities: any[] = [];
  let markets: any[] = [];

  if (params.market_slugs?.length) {
    const fetches = await Promise.all(params.market_slugs.map(s =>
      cachedFetchJSON(`${GAMMA_API}/markets?slug=${s}`).catch(() => [])
    ));
    markets = fetches.flat();
  } else {
    markets = await cachedFetchJSON(`${GAMMA_API}/markets?active=true&closed=false&limit=50&order=volume24hr&ascending=false`).catch(() => []);
  }

  const scanType = params.scan_type || 'all';
  const minProfit = params.min_profit_pct || 0.5;

  // YES + NO != $1.00
  if (scanType === 'yes_no' || scanType === 'all') {
    for (const m of markets) {
      try {
        const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
        if (prices.length === 2) {
          const yes = parseFloat(prices[0]);
          const no = parseFloat(prices[1]);
          const sum = yes + no;
          const deviation = Math.abs(sum - 1) * 100;
          if (deviation >= minProfit) {
            opportunities.push({
              type: 'yes_no_mispricing', market: m.question, slug: m.slug,
              yes_price: yes, no_price: no, sum: +sum.toFixed(4), profit_pct: +deviation.toFixed(2),
              action: sum > 1 ? 'SELL both YES and NO (overpriced)' : 'BUY both YES and NO (underpriced)',
            });
          }
        }
      } catch {}
    }
  }

  // Multi-outcome sum check
  if (scanType === 'multi_outcome' || scanType === 'all') {
    for (const m of markets) {
      try {
        const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
        if (prices.length > 2) {
          const sum = prices.reduce((s: number, p: string) => s + parseFloat(p), 0);
          const deviation = Math.abs(sum - 1) * 100;
          if (deviation >= minProfit) {
            opportunities.push({
              type: 'multi_outcome_mispricing', market: m.question, slug: m.slug,
              outcomes: prices.length, prices: prices.map(Number), sum: +sum.toFixed(4), profit_pct: +deviation.toFixed(2),
              action: sum > 1 ? 'SELL all outcomes (combined price exceeds 100%)' : 'BUY all outcomes (combined price below 100%)',
            });
          }
        }
      } catch {}
    }
  }

  // Cross-market divergence
  if (scanType === 'cross_market' || scanType === 'all') {
    const groups = new Map<string, any[]>();
    for (const m of markets) {
      const key = (m.question || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    for (const [key, group] of Array.from(groups.entries())) {
      if (group.length < 2) continue;
      const prices = group.map(m2 => {
        const p = m2.outcomePrices ? JSON.parse(m2.outcomePrices) : [];
        return { slug: m2.slug, question: m2.question, yes: parseFloat(p[0] || '0') };
      });
      const maxPrice = Math.max(...prices.map(p => p.yes));
      const minPrice = Math.min(...prices.map(p => p.yes));
      const diff = (maxPrice - minPrice) * 100;
      if (diff >= minProfit) {
        opportunities.push({
          type: 'cross_market_divergence', topic: key, markets: prices, price_spread: +diff.toFixed(2),
          action: `Buy cheapest (${minPrice.toFixed(3)}), sell most expensive (${maxPrice.toFixed(3)})`,
        });
      }
    }
  }

  opportunities.sort((a, b) => (b.profit_pct || b.price_spread || 0) - (a.profit_pct || a.price_spread || 0));

  return {
    markets_scanned: markets.length,
    opportunities_found: opportunities.length,
    opportunities: opportunities.slice(0, 20),
    total_potential_profit: opportunities.reduce((s, o) => s + (o.profit_pct || o.price_spread || 0), 0).toFixed(2) + '%',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  REGIME DETECTION
// ═══════════════════════════════════════════════════════════════════

export interface RegimeResult {
  token_id: string;
  regime: string;
  confidence: number;
  hurst_exponent: number;
  volatility_annualized: number;
  trend_direction: string;
  slope: number;
  data_points: number;
  current_price: number;
  price_range: { min: number; max: number };
  strategies: string[];
}

export async function detectRegime(tokenId: string, lookback = 72): Promise<RegimeResult> {
  const prices = await fetchPriceHistory(tokenId);
  if (prices.length < 20) throw new Error('Insufficient price history (need 20+ data points)');

  const lb = Math.min(lookback, prices.length);
  const recentPrices = prices.slice(-lb);
  const hurst = calculateHurst(recentPrices);
  const vol = calculateVolatility(recentPrices);

  const n = recentPrices.length;
  const xMean = (n - 1) / 2;
  const yMean = recentPrices.reduce((s, p) => s + p, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recentPrices[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;

  let regime: string;
  let confidence: number;
  if (hurst > 0.6) { regime = 'TRENDING'; confidence = Math.min(1, (hurst - 0.5) * 5); }
  else if (hurst < 0.4) { regime = 'MEAN_REVERTING'; confidence = Math.min(1, (0.5 - hurst) * 5); }
  else { regime = 'RANDOM_WALK'; confidence = 1 - Math.abs(hurst - 0.5) * 5; }

  const strategies: Record<string, string[]> = {
    TRENDING: [
      'Follow the trend — buy on dips in an uptrend, sell rallies in a downtrend',
      'Use momentum indicators (moving averages, breakout levels)',
      'Set trailing stops to ride the trend',
      'DO NOT mean-revert — the trend is your friend',
    ],
    MEAN_REVERTING: [
      'Buy when price dips below recent mean, sell when it rises above',
      'Use Bollinger Bands or standard deviation channels',
      'Set target at mean price — profits come from reversion',
      'DO NOT chase breakouts — they will likely reverse',
    ],
    RANDOM_WALK: [
      'No persistent pattern — fundamentals-only trading',
      'Only trade if you have informational edge (news, insider knowledge)',
      'Keep positions small — no statistical edge from technicals',
      'Focus on event catalysts, not price patterns',
    ],
  };

  return {
    token_id: tokenId,
    regime,
    confidence: +confidence.toFixed(3),
    hurst_exponent: hurst,
    volatility_annualized: vol,
    trend_direction: slope > 0 ? 'UP' : slope < 0 ? 'DOWN' : 'FLAT',
    slope: +slope.toFixed(6),
    data_points: recentPrices.length,
    current_price: recentPrices[recentPrices.length - 1],
    price_range: { min: +Math.min(...recentPrices).toFixed(4), max: +Math.max(...recentPrices).toFixed(4) },
    strategies: strategies[regime] || [],
  };
}

// ═══════════════════════════════════════════════════════════════════
//  SMART MONEY INDEX
// ═══════════════════════════════════════════════════════════════════

export interface SmartMoneyResult {
  token_id: string;
  smart_money_index: number;
  action: string;
  signals: Record<string, number>;
  weights: Record<string, number>;
  interpretation: Record<string, string>;
}

export async function calculateSmartMoneyIndex(tokenId: string, marketQuestion?: string): Promise<SmartMoneyResult> {
  const signals: Record<string, number> = {};

  // 1. Orderbook imbalance
  try {
    const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
    const bids = (book?.bids || []).reduce((s: number, b: any) => s + parseFloat(b.size) * parseFloat(b.price), 0);
    const asks = (book?.asks || []).reduce((s: number, a: any) => s + parseFloat(a.size) * parseFloat(a.price), 0);
    const total = bids + asks;
    signals.orderbook_imbalance = total > 0 ? +((bids / total - 0.5) * 2).toFixed(3) : 0;
  } catch { signals.orderbook_imbalance = 0; }

  // 2. Trade flow
  try {
    const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tokenId}&limit=100`);
    let buyVol = 0, sellVol = 0;
    for (const t of (trades || [])) {
      const val = parseFloat(t.size || '0') * parseFloat(t.price || '0');
      if (t.side === 'BUY') buyVol += val; else sellVol += val;
    }
    const total = buyVol + sellVol;
    signals.trade_flow = total > 0 ? +((buyVol / total - 0.5) * 2).toFixed(3) : 0;
  } catch { signals.trade_flow = 0; }

  // 3. Price momentum
  try {
    const prices = await fetchPriceHistory(tokenId);
    if (prices.length >= 10) {
      const recent = prices.slice(-5).reduce((s, p) => s + p, 0) / 5;
      const older = prices.slice(-10, -5).reduce((s, p) => s + p, 0) / 5;
      signals.momentum = older > 0 ? +((recent - older) / older).toFixed(4) : 0;
    } else { signals.momentum = 0; }
  } catch { signals.momentum = 0; }

  // 4. News sentiment
  signals.news_sentiment = 0;
  if (marketQuestion) {
    try {
      const xml = await (await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(marketQuestion)}&hl=en-US&gl=US&ceid=US:en`, { signal: AbortSignal.timeout(8000) })).text();
      const titles = (xml.match(/<title>([\s\S]*?)<\/title>/g) || []).map(t => t.replace(/<\/?title>/g, '').replace(/<!\[CDATA\[|\]\]>/g, ''));
      const positive = ['yes', 'win', 'likely', 'confirmed', 'ahead', 'surge', 'up'];
      const negative = ['no', 'lose', 'unlikely', 'denied', 'behind', 'drop', 'down'];
      let sentScore = 0;
      for (const t of titles) {
        const lower = t.toLowerCase();
        for (const p of positive) if (lower.includes(p)) sentScore += 0.1;
        for (const nn of negative) if (lower.includes(nn)) sentScore -= 0.1;
      }
      signals.news_sentiment = +Math.max(-1, Math.min(1, sentScore)).toFixed(3);
    } catch {}
  }

  const weights = { orderbook_imbalance: 0.30, trade_flow: 0.30, momentum: 0.20, news_sentiment: 0.20 };
  const composite = +(
    signals.orderbook_imbalance * weights.orderbook_imbalance +
    signals.trade_flow * weights.trade_flow +
    signals.momentum * weights.momentum +
    signals.news_sentiment * weights.news_sentiment
  ).toFixed(4);

  const action = composite > 0.3 ? 'STRONG_BUY' : composite > 0.1 ? 'BUY' :
    composite < -0.3 ? 'STRONG_SELL' : composite < -0.1 ? 'SELL' : 'HOLD';

  return {
    token_id: tokenId,
    smart_money_index: composite,
    action,
    signals,
    weights,
    interpretation: {
      '-1 to -0.3': 'Smart money selling aggressively',
      '-0.3 to -0.1': 'Slight sell pressure from informed traders',
      '-0.1 to 0.1': 'No clear smart money direction',
      '0.1 to 0.3': 'Slight buy pressure from informed traders',
      '0.3 to 1': 'Smart money buying aggressively',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  MARKET MICROSTRUCTURE
// ═══════════════════════════════════════════════════════════════════

export interface MicrostructureResult {
  token_id: string;
  mid_price: number;
  spread: number;
  spread_bps: number;
  bid_levels: number;
  ask_levels: number;
  total_bid_liquidity: number;
  total_ask_liquidity: number;
  avg_recent_trade_size: number;
  buy_simulations: any[];
  sell_simulations: any[];
  optimal_order_type: string;
  market_quality: string;
}

export async function analyzeMicrostructure(tokenId: string, orderSizes?: number[]): Promise<MicrostructureResult> {
  const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
  const bids = (book?.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
  const asks = (book?.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

  const bestBid = bids.length ? Math.max(...bids.map((b: any) => b.price)) : 0;
  const bestAsk = asks.length ? Math.min(...asks.map((a: any) => a.price)) : 1;
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  const sizes = orderSizes || [100, 500, 1000, 5000];
  const buySimulations: any[] = [];
  const sellSimulations: any[] = [];

  for (const size of sizes) {
    // Buy simulation
    let remaining = size;
    let totalCost = 0;
    let levelsUsed = 0;
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
    for (const ask of sortedAsks) {
      if (remaining <= 0) break;
      const fillSize = Math.min(remaining / ask.price, ask.size);
      totalCost += fillSize * ask.price;
      remaining -= fillSize * ask.price;
      levelsUsed++;
    }
    const filled = size - Math.max(0, remaining);
    const avgPrice = filled > 0 ? totalCost / (totalCost / midPrice) : midPrice;
    const slippage = midPrice > 0 ? ((avgPrice - midPrice) / midPrice) * 100 : 0;

    buySimulations.push({
      order_size_usdc: size, estimated_fill_pct: +((filled / size) * 100).toFixed(1),
      avg_fill_price: +avgPrice.toFixed(4), slippage_pct: +slippage.toFixed(3), levels_consumed: levelsUsed,
      recommendation: slippage > 2 ? 'USE LIMIT ORDER — high slippage' : slippage > 0.5 ? 'Consider limit order' : 'Market order acceptable',
    });

    // Sell simulation
    remaining = size;
    let totalProceeds = 0;
    levelsUsed = 0;
    const sortedBids = [...bids].sort((a, b) => b.price - a.price);
    for (const bid of sortedBids) {
      if (remaining <= 0) break;
      const fillSize = Math.min(remaining / bid.price, bid.size);
      totalProceeds += fillSize * bid.price;
      remaining -= fillSize * bid.price;
      levelsUsed++;
    }
    const filledSell = size - Math.max(0, remaining);
    const avgSellPrice = filledSell > 0 ? totalProceeds / (totalProceeds / midPrice) : midPrice;
    const sellSlippage = midPrice > 0 ? ((midPrice - avgSellPrice) / midPrice) * 100 : 0;

    sellSimulations.push({
      order_size_usdc: size, estimated_fill_pct: +((filledSell / size) * 100).toFixed(1),
      avg_fill_price: +avgSellPrice.toFixed(4), slippage_pct: +sellSlippage.toFixed(3), levels_consumed: levelsUsed,
    });
  }

  let recentTrades: any[] = [];
  try {
    const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tokenId}&limit=50`);
    recentTrades = (trades || []).map((t: any) => ({ size: parseFloat(t.size || '0'), price: parseFloat(t.price || '0'), side: t.side }));
  } catch {}

  const avgTradeSize = recentTrades.length
    ? +(recentTrades.reduce((s: number, t: any) => s + t.size * t.price, 0) / recentTrades.length).toFixed(2)
    : 0;

  return {
    token_id: tokenId,
    mid_price: +midPrice.toFixed(4),
    spread: +spread.toFixed(4),
    spread_bps: +(spread / midPrice * 10000).toFixed(1),
    bid_levels: bids.length,
    ask_levels: asks.length,
    total_bid_liquidity: +bids.reduce((s: number, b: any) => s + b.size * b.price, 0).toFixed(2),
    total_ask_liquidity: +asks.reduce((s: number, a: any) => s + a.size * a.price, 0).toFixed(2),
    avg_recent_trade_size: avgTradeSize,
    buy_simulations: buySimulations,
    sell_simulations: sellSimulations,
    optimal_order_type: spread > 0.02 ? 'LIMIT' : 'MARKET',
    market_quality: spread < 0.01 ? 'EXCELLENT' : spread < 0.03 ? 'GOOD' : spread < 0.05 ? 'FAIR' : 'POOR',
  };
}
