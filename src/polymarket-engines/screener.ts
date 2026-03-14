/**
 * Polymarket Market Screener Engine
 * 
 * Quant-level market discovery with multi-signal scoring.
 * Extracted from polymarket-screener.ts tool wrapper.
 * 
 * Capabilities:
 * - Multi-signal scoring: liquidity, volume, spread, edge, timing, momentum
 * - Orderbook analysis with depth/imbalance detection
 * - Edge detection: overround anomalies, mispricing, smart money flow
 * - Strategy-based screening: best_opportunities, high_volume, closing_soon, mispriced, contested, safe_bets, new_markets, momentum
 * - Recommendation engine with side, entry/exit, and sizing
 */

import {
  CLOB_API, GAMMA_API,
  MarketData, OrderbookSnapshot, ScoredMarket,
  apiFetch, parallelFetch,
  parseMarket,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

export function scoreLiquidity(m: MarketData): number {
  if (m.liquidity >= 100000) return 20;
  if (m.liquidity >= 50000) return 18;
  if (m.liquidity >= 20000) return 15;
  if (m.liquidity >= 10000) return 12;
  if (m.liquidity >= 5000) return 8;
  if (m.liquidity >= 1000) return 4;
  return 1;
}

export function scoreVolume(m: MarketData): number {
  if (m.volume >= 1000000) return 20;
  if (m.volume >= 500000) return 18;
  if (m.volume >= 100000) return 15;
  if (m.volume >= 50000) return 12;
  if (m.volume >= 10000) return 8;
  if (m.volume >= 1000) return 4;
  return 1;
}

export function scoreSpread(ob: OrderbookSnapshot | null): number {
  if (!ob) return 5;
  if (ob.spreadPct <= 1) return 15;
  if (ob.spreadPct <= 2) return 13;
  if (ob.spreadPct <= 3) return 11;
  if (ob.spreadPct <= 5) return 8;
  if (ob.spreadPct <= 10) return 4;
  return 1;
}

export function scoreEdge(m: MarketData, ob: OrderbookSnapshot | null): { score: number; type: string | null } {
  const prices = m.outcomePrices;
  if (prices.length < 2) return { score: 0, type: null };

  const yesP = prices[0];
  const noP = prices[1];
  const overround = (yesP + noP - 1) * 100;
  let score = 0;
  let type: string | null = null;

  if (Math.abs(overround) > 3) {
    score += Math.min(10, Math.abs(overround));
    type = overround > 0 ? 'negative_ev_market' : 'positive_ev_market';
  }

  if (yesP > 0.92 || yesP < 0.08) {
    score += 5;
    type = type || 'extreme_price';
  }

  if (ob && Math.abs(ob.imbalance) > 0.4) {
    score += Math.min(8, Math.abs(ob.imbalance) * 10);
    type = type || (ob.imbalance > 0 ? 'bid_pressure' : 'ask_pressure');
  }

  if (yesP >= 0.35 && yesP <= 0.65) {
    score += 5;
    type = type || 'contested';
  }

  return { score: Math.min(25, score), type };
}

export function scoreTiming(m: MarketData): number {
  if (!m.endDate) return 3;
  const hoursToClose = (new Date(m.endDate).getTime() - Date.now()) / 3600000;
  if (hoursToClose <= 0) return 0;
  if (hoursToClose <= 6) return 10;
  if (hoursToClose <= 24) return 8;
  if (hoursToClose <= 72) return 6;
  if (hoursToClose <= 168) return 4;
  return 2;
}

export function scoreMomentum(m: MarketData): number {
  if (m.liquidity === 0) return 0;
  const turnover = m.volume / m.liquidity;
  if (turnover >= 10) return 10;
  if (turnover >= 5) return 8;
  if (turnover >= 2) return 6;
  if (turnover >= 1) return 4;
  return 2;
}

export function getPriceLevel(yesPrice: number): string {
  if (yesPrice >= 0.90) return 'extreme_yes';
  if (yesPrice <= 0.10) return 'extreme_no';
  if (yesPrice >= 0.65) return 'leaning_yes';
  if (yesPrice <= 0.35) return 'leaning_no';
  return 'contested';
}

// ═══════════════════════════════════════════════════════════════════
//  ORDERBOOK ANALYSIS
// ═══════════════════════════════════════════════════════════════════

export async function analyzeOrderbook(tokenId: string): Promise<OrderbookSnapshot | null> {
  try {
    const book = await apiFetch(`${CLOB_API}/book?token_id=${tokenId}`, 8000);
    if (!book?.bids?.length && !book?.asks?.length) return null;

    const bids = (book.bids || []).slice(0, 10);
    const asks = (book.asks || []).slice(0, 10);

    const bestBid = parseFloat(bids[0]?.price || '0');
    const bestAsk = parseFloat(asks[0]?.price || '1');
    const spread = bestAsk - bestBid;
    const midpoint = (bestAsk + bestBid) / 2;

    const bidDepth = bids.slice(0, 5).reduce((s: number, l: any) => s + parseFloat(l.price || '0') * parseFloat(l.size || '0'), 0);
    const askDepth = asks.slice(0, 5).reduce((s: number, l: any) => s + parseFloat(l.price || '0') * parseFloat(l.size || '0'), 0);
    const totalDepth = bidDepth + askDepth;
    const imbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

    return {
      bestBid, bestAsk, spread,
      spreadPct: midpoint > 0 ? (spread / midpoint) * 100 : 100,
      midpoint,
      bidDepth: Math.round(bidDepth),
      askDepth: Math.round(askDepth),
      imbalance: parseFloat(imbalance.toFixed(3)),
      topBidSize: parseFloat(bids[0]?.size || '0'),
      topAskSize: parseFloat(asks[0]?.size || '0'),
      levels: Math.max(bids.length, asks.length),
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════════

export function generateRecommendation(m: MarketData, scores: ScoredMarket['scores'], analysis: ScoredMarket['analysis']): ScoredMarket['recommendation'] {
  const yesP = m.outcomePrices[0] || 0.5;
  const noP = m.outcomePrices[1] || 0.5;

  let action = 'watch';
  let side = yesP <= 0.5 ? 'YES' : 'NO';
  let confidence = Math.min(95, scores.total);
  let reasoning = '';
  let suggestedSize: 'small' | 'medium' | 'large' = 'small';
  let entryPrice = yesP <= 0.5 ? yesP : noP;
  let targetExit = 0;

  if (scores.total >= 70) {
    if (analysis.priceLevel === 'contested') {
      if (analysis.orderbook && analysis.orderbook.imbalance > 0.2) {
        action = 'buy_yes'; side = 'YES';
        reasoning = 'Contested market with strong bid-side pressure. Orderbook imbalance suggests upward price movement.';
      } else if (analysis.orderbook && analysis.orderbook.imbalance < -0.2) {
        action = 'buy_no'; side = 'NO';
        reasoning = 'Contested market with strong ask-side pressure. Orderbook suggests downward movement.';
      } else {
        action = 'watch';
        reasoning = 'High-quality contested market but no clear directional signal from orderbook.';
      }
      suggestedSize = 'medium';
    } else if (analysis.priceLevel === 'extreme_yes') {
      action = 'buy_yes'; side = 'YES';
      reasoning = `Market at ${(yesP * 100).toFixed(0)}% — strong consensus. Buying YES for likely resolution. ${analysis.hoursToClose && analysis.hoursToClose < 48 ? 'Closing soon adds urgency.' : ''}`;
      suggestedSize = scores.total >= 80 ? 'large' : 'medium';
      targetExit = 0.99;
    } else if (analysis.priceLevel === 'extreme_no') {
      action = 'buy_no'; side = 'NO';
      reasoning = `Market at ${(yesP * 100).toFixed(0)}% YES — strong NO consensus. Buying NO for likely resolution.`;
      suggestedSize = scores.total >= 80 ? 'large' : 'medium';
      targetExit = 0.99;
    }
  } else if (scores.total >= 50) {
    if (scores.edge >= 10) {
      action = analysis.overround < 0 ? 'buy_yes' : 'buy_no';
      side = analysis.overround < 0 ? 'YES' : 'NO';
      reasoning = `Edge detected: ${analysis.edgeType}. Overround ${analysis.overround.toFixed(1)}%.`;
      suggestedSize = 'small';
    } else if (analysis.hoursToClose && analysis.hoursToClose < 24 && scores.volume >= 10) {
      action = yesP > 0.7 ? 'buy_yes' : yesP < 0.3 ? 'buy_no' : 'watch';
      side = yesP > 0.5 ? 'YES' : 'NO';
      reasoning = `Closing in ${analysis.hoursToClose.toFixed(0)}h with high volume. Price likely to converge to outcome.`;
      suggestedSize = 'small';
    }
  }

  if (action === 'watch') {
    reasoning = reasoning || `Scores: liquidity=${scores.liquidity}, volume=${scores.volume}, spread=${scores.spread}, edge=${scores.edge}. No strong signal yet.`;
  }

  entryPrice = side === 'YES' ? yesP : noP;
  if (!targetExit) {
    targetExit = side === 'YES' ? Math.min(0.99, yesP + 0.10) : Math.min(0.99, noP + 0.10);
  }

  return { action, side, confidence, reasoning, suggestedSize, entryPrice, targetExit };
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN SCREENER
// ═══════════════════════════════════════════════════════════════════

export interface ScreenerOptions {
  strategy?: 'best_opportunities' | 'high_volume' | 'closing_soon' | 'mispriced' | 'contested' | 'safe_bets' | 'new_markets' | 'momentum';
  categories?: string[];
  query?: string;
  minVolume?: number;
  minLiquidity?: number;
  maxSpreadPct?: number;
  minEdgeScore?: number;
  hoursToClose?: number;
  limit?: number;
  includeOrderbook?: boolean;
  includeDescription?: boolean;
  maxPrice?: number;
  portfolioSize?: number;
  extraMarkets?: any[];
}

export interface ScreenerResult {
  strategy: string;
  scanned: number;
  qualified: number;
  markets: ScoredMarket[];
  summary: string;
}

export async function screenMarkets(opts: ScreenerOptions = {}): Promise<ScreenerResult> {
  const strategy = opts.strategy || 'best_opportunities';
  const limit = opts.limit || 15;

  const fetchParams: Record<string, string> = {
    active: 'true',
    closed: 'false',
    limit: '100',
  };

  switch (strategy) {
    case 'high_volume': fetchParams.order = 'volume'; fetchParams.ascending = 'false'; break;
    case 'closing_soon': {
      fetchParams.order = 'end_date';
      fetchParams.ascending = 'true';
      // Only fetch markets ending in the future — prevents API returning expired markets
      fetchParams.end_date_min = new Date().toISOString();
      fetchParams.limit = '200'; // more candidates since many may be filtered out
      // Default hoursToClose to 168 (7 days) if not specified
      if (!opts.hoursToClose) opts.hoursToClose = 168;
      break;
    }
    case 'new_markets': fetchParams.order = 'startDate'; fetchParams.ascending = 'false'; break;
    default: fetchParams.order = 'volume'; fetchParams.ascending = 'false'; break;
  }

  if (opts.categories?.length) fetchParams.tag = opts.categories[0];
  if (opts.query) fetchParams.search = opts.query;

  let allMarkets: any[] = [];
  const fetches: Promise<void>[] = [];

  // Markets endpoint — skip when query is set because /markets ignores the search param
  // (returns default top-volume markets regardless). Only /events respects search.
  if (!opts.query) {
    fetches.push((async () => {
      try {
        const raw = await apiFetch(`${GAMMA_API}/markets?${new URLSearchParams(fetchParams)}`);
        if (Array.isArray(raw)) allMarkets.push(...raw);
      } catch {}
    })());
  }

  // Events endpoint — ALWAYS fetch events (they contain the real high-volume markets)
  fetches.push((async () => {
    try {
      const evParams: Record<string, string> = { active: 'true', closed: 'false', limit: '100' };
      // When searching, omit order to let API rank by relevance instead of volume
      // (volume ordering biases toward political markets regardless of query)
      if (!opts.query) { evParams.order = fetchParams.order || 'volume'; evParams.ascending = fetchParams.ascending || 'false'; }
      if (opts.query) evParams.search = opts.query;
      if (opts.categories?.length) evParams.tag_id = opts.categories[0];
      const events = await apiFetch(`${GAMMA_API}/events?${new URLSearchParams(evParams)}`);
      if (Array.isArray(events)) {
        for (const ev of events) {
          if (ev.markets && Array.isArray(ev.markets)) {
            for (const m of ev.markets) {
              if (m.active && !m.closed) allMarkets.push(m);
            }
          }
        }
      }
    } catch {}
  })());

  // Diversity batch — fetch by liquidity for broader coverage
  if (!opts.query && (strategy === 'best_opportunities' || strategy === 'high_volume')) {
    fetches.push((async () => {
      try {
        const divEvParams: Record<string, string> = { active: 'true', closed: 'false', limit: '50', order: 'liquidity', ascending: 'false' };
        const events2 = await apiFetch(`${GAMMA_API}/events?${new URLSearchParams(divEvParams)}`);
        if (Array.isArray(events2)) {
          for (const ev of events2) {
            if (ev.markets && Array.isArray(ev.markets)) {
              for (const m of ev.markets) {
                if (m.active && !m.closed) allMarkets.push(m);
              }
            }
          }
        }
      } catch {}
    })());
    fetches.push((async () => {
      try {
        const diverseParams = { ...fetchParams, order: 'liquidity', limit: '50' };
        const raw2 = await apiFetch(`${GAMMA_API}/markets?${new URLSearchParams(diverseParams)}`);
        if (Array.isArray(raw2)) allMarkets.push(...raw2);
      } catch {}
    })());
  }

  await Promise.all(fetches);

  if (allMarkets.length === 0) {
    return { strategy, scanned: 0, qualified: 0, markets: [], summary: 'No markets found' };
  }

  // Deduplicate
  const seen = new Set<string>();
  allMarkets = allMarkets.filter(m => {
    const key = m.conditionId || m.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Merge extra markets
  if (opts.extraMarkets?.length) {
    const existingIds = new Set(allMarkets.map((m: any) => m.conditionId || m.id));
    for (const m of opts.extraMarkets) {
      if (!existingIds.has(m.conditionId || m.id)) {
        allMarkets.push(m);
        existingIds.add(m.conditionId || m.id);
      }
    }
  }

  // Client-side relevance filtering when searching — remove sub-markets from events
  // that don't match the query (prevents irrelevant markets from matched events)
  if (opts.query) {
    const qWords = opts.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (qWords.length > 0) {
      const relevant = allMarkets.filter(m => {
        const q = (m.question || '').toLowerCase();
        const slug = (m.slug || '').toLowerCase();
        return qWords.some(w => q.includes(w) || slug.includes(w));
      });
      if (relevant.length > 0) allMarkets = relevant;
    }
  }

  // Parse and pre-filter
  let parsed = allMarkets.map(parseMarket).filter(m => {
    if (!m.active || m.clobTokenIds.length === 0) return false;
    if (m.endDate && new Date(m.endDate).getTime() < Date.now()) return false;
    if (m.liquidity < 1) return false;
    return true;
  });

  if (opts.minVolume) parsed = parsed.filter(m => m.volume >= opts.minVolume!);
  if (opts.minLiquidity) parsed = parsed.filter(m => m.liquidity >= opts.minLiquidity!);
  if (opts.hoursToClose) {
    parsed = parsed.filter(m => {
      if (!m.endDate) return false;
      const h = (new Date(m.endDate).getTime() - Date.now()) / 3600000;
      return h > 0 && h <= opts.hoursToClose!;
    });
  }

  if (strategy === 'contested') parsed = parsed.filter(m => m.outcomePrices[0] >= 0.30 && m.outcomePrices[0] <= 0.70);
  else if (strategy === 'safe_bets') parsed = parsed.filter(m => m.outcomePrices[0] >= 0.85 || m.outcomePrices[0] <= 0.15);
  else if (strategy === 'mispriced') parsed = parsed.filter(m => Math.abs(m.outcomePrices.reduce((a, b) => a + b, 0) - 1) > 0.02);

  // Preliminary sort + orderbook fetch
  parsed.sort((a, b) => (b.volume * b.liquidity) - (a.volume * a.liquidity));
  const topCandidates = parsed.slice(0, opts.includeOrderbook ? Math.min(30, parsed.length) : 0);

  const orderbookMap = new Map<string, OrderbookSnapshot | null>();
  if (opts.includeOrderbook !== false && topCandidates.length > 0) {
    const obResults = await parallelFetch(
      topCandidates,
      async (m: MarketData) => {
        const tokenId = m.clobTokenIds[0];
        if (!tokenId) return { id: m.id, ob: null };
        const ob = await analyzeOrderbook(tokenId);
        return { id: m.id, ob };
      },
      5
    );
    for (const r of obResults) orderbookMap.set(r.id, r.ob);
  }

  // Score everything
  const scored: ScoredMarket[] = parsed.map(m => {
    const ob = orderbookMap.get(m.id) || null;
    const liquidityScore = scoreLiquidity(m);
    const volumeScore = scoreVolume(m);
    const spreadScore = scoreSpread(ob);
    const { score: edgeScore, type: edgeType } = scoreEdge(m, ob);
    const timingScore = scoreTiming(m);
    const momentumScore = scoreMomentum(m);
    const total = liquidityScore + volumeScore + spreadScore + edgeScore + timingScore + momentumScore;

    const yesP = m.outcomePrices[0] || 0.5;
    const noP = m.outcomePrices[1] || 0.5;
    const overround = (yesP + noP - 1) * 100;
    const hoursToClose = m.endDate ? (new Date(m.endDate).getTime() - Date.now()) / 3600000 : null;

    const scores = { total, liquidity: liquidityScore, volume: volumeScore, spread: spreadScore, edge: edgeScore, timing: timingScore, momentum: momentumScore };
    const analysis = {
      overround,
      hoursToClose,
      volumePerHour: m.startDate ? m.volume / Math.max(1, (Date.now() - new Date(m.startDate).getTime()) / 3600000) : 0,
      priceLevel: getPriceLevel(yesP),
      edgeType,
      orderbook: ob || undefined,
    };

    const recommendation = generateRecommendation(m, scores, analysis);
    return { market: m, scores, analysis, recommendation };
  });

  // Sort by strategy
  switch (strategy) {
    case 'high_volume': scored.sort((a, b) => b.market.volume - a.market.volume); break;
    case 'closing_soon': scored.sort((a, b) => (a.analysis.hoursToClose || 9999) - (b.analysis.hoursToClose || 9999)); break;
    case 'mispriced': scored.sort((a, b) => b.scores.edge - a.scores.edge); break;
    case 'safe_bets':
      scored.sort((a, b) => {
        const aConf = Math.max(a.market.outcomePrices[0], a.market.outcomePrices[1] || 0);
        const bConf = Math.max(b.market.outcomePrices[0], b.market.outcomePrices[1] || 0);
        return bConf - aConf;
      }); break;
    case 'momentum': scored.sort((a, b) => b.scores.momentum - a.scores.momentum); break;
    default: scored.sort((a, b) => b.scores.total - a.scores.total);
  }

  // Apply final filters
  let filtered = scored;
  if (opts.maxPrice) filtered = filtered.filter(s => s.recommendation.entryPrice <= opts.maxPrice!);
  if (opts.minEdgeScore) filtered = filtered.filter(s => s.scores.edge >= opts.minEdgeScore!);
  if (opts.maxSpreadPct) filtered = filtered.filter(s => !s.analysis.orderbook || s.analysis.orderbook.spreadPct <= opts.maxSpreadPct!);

  const final = filtered.slice(0, limit);

  const actionable = final.filter(s => s.recommendation.action !== 'watch' && s.recommendation.action !== 'avoid');
  const summary = [
    `Screened ${parsed.length} markets using "${strategy}" strategy.`,
    `${final.length} passed filters.`,
    actionable.length > 0
      ? `${actionable.length} actionable: ${actionable.map(s => `${s.recommendation.action} "${s.market.question.substring(0, 50)}" @ ${(s.recommendation.entryPrice * 100).toFixed(0)}¢`).join('; ')}`
      : 'No strong signals right now — market conditions may be quiet.',
  ].join(' ');

  return { strategy, scanned: parsed.length, qualified: final.length, markets: final, summary };
}
