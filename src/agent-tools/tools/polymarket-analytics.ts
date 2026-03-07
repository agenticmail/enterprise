/**
 * Polymarket Advanced Analytics Tools
 * 
 * Cross-market and meta-analytical tools:
 * - Market correlation detection
 * - Arbitrage scanner
 * - Regime detection (trending, mean-reverting, random walk)
 * - Smart money composite index
 * - Market microstructure analysis
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { cachedFetchJSON, cachedFetchText, validateTokenId, validateSlug, validateAddress, clampNumber, safeDbExec, safeDbQuery, safeDbGet, parseRSSItems as sharedParseRSS, withRetry ,  autoId } from './polymarket-shared.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// ─── Caches ──────────────────────────────────────────────────
const priceHistoryCache = new Map<string, { data: any; ts: number }>();
const HISTORY_CACHE_TTL = 5 * 60_000;

// ─── DB Tables ───────────────────────────────────────────────

async function initAnalyticsDB(db: any): Promise<void> {
  if (!db?.exec) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS poly_correlations (
      id ${autoId()},
      agent_id TEXT NOT NULL,
      market_a TEXT NOT NULL,
      market_b TEXT NOT NULL,
      correlation REAL NOT NULL,
      period TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS poly_arb_opportunities (
      id ${autoId()},
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      markets TEXT NOT NULL,
      expected_profit REAL NOT NULL,
      confidence REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS poly_regime_signals (
      id ${autoId()},
      token_id TEXT NOT NULL,
      regime TEXT NOT NULL,
      confidence REAL NOT NULL,
      hurst REAL,
      volatility REAL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of stmts) {
    try { db.exec(sql); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────


async function getPriceHistory(tokenId: string): Promise<number[]> {
  const cached = priceHistoryCache.get(tokenId);
  if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL) return cached.data;
  
  try {
    const data = await cachedFetchJSON(`${CLOB_API}/prices-history?market=${tokenId}&interval=1h&fidelity=60`);
    const prices = (data?.history || []).map((p: any) => parseFloat(p.p || p.price || '0')).filter((p: number) => p > 0);
    priceHistoryCache.set(tokenId, { data: prices, ts: Date.now() });
    return prices;
  } catch {
    return [];
  }
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;
  const xs = x.slice(-n), ys = y.slice(-n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 0 ? +(num / denom).toFixed(4) : 0;
}

function calculateHurst(prices: number[]): number {
  // R/S analysis for Hurst exponent
  if (prices.length < 20) return 0.5;
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const deviations = returns.map(r => r - mean);
  
  // Cumulative deviations
  const cumDev: number[] = [];
  let sum = 0;
  for (const d of deviations) { sum += d; cumDev.push(sum); }
  
  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = Math.sqrt(deviations.reduce((s, d) => s + d * d, 0) / n);
  
  if (S === 0) return 0.5;
  const RS = R / S;
  const H = Math.log(RS) / Math.log(n);
  return +Math.max(0, Math.min(1, H)).toFixed(4);
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return +Math.sqrt(variance * 252).toFixed(4); // Annualized
}

// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketAnalyticsTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  let dbReady = false;
  async function ensureDB() {
    if (dbReady || !db) return;
    await initAnalyticsDB(db);
    dbReady = true;
  }

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_market_correlation ═══
  tools.push({
    name: 'poly_market_correlation',
    label: 'Market Correlation',
    description: 'Find correlated markets. If "Will X happen?" and "Will Y happen?" are 90% correlated but priced differently, that is free money. Calculates Pearson correlation between token price histories.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_ids: { type: 'string', description: 'Comma-separated token IDs to cross-correlate (2-10 tokens)' },
        min_correlation: { type: 'number', description: 'Minimum absolute correlation to report (default: 0.5)', default: 0.5 },
      },
      required: ['token_ids'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const tokens = params.token_ids.split(',').map((t: string) => t.trim()).slice(0, 10);
      if (tokens.length < 2) return errorResult('Need at least 2 token IDs');

      try {
        // Fetch all price histories in parallel
        const histories = await Promise.all(tokens.map(async (tid: string) => ({
          token_id: tid,
          prices: await getPriceHistory(tid),
        })));

        // Calculate pairwise correlations
        const correlations: any[] = [];
        for (let i = 0; i < histories.length; i++) {
          for (let j = i + 1; j < histories.length; j++) {
            const corr = pearsonCorrelation(histories[i].prices, histories[j].prices);
            if (Math.abs(corr) >= (params.min_correlation || 0.5)) {
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

        // Store top correlations
        if (db) {
          for (const c of correlations.slice(0, 5)) {
            try {
              db.prepare(`INSERT INTO poly_correlations (agent_id, market_a, market_b, correlation, period) VALUES (?, ?, ?, ?, ?)`)
                .run(agentId, c.token_a, c.token_b, c.correlation, '1h');
            } catch {}
          }
        }

        return jsonResult({
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
        });
      } catch (e: any) {
        return errorResult(`Correlation analysis failed: ${e.message}`);
      }
    },
  });

  // ═══ 2. poly_arbitrage_scanner ═══
  tools.push({
    name: 'poly_arbitrage_scanner',
    label: 'Arbitrage Scanner',
    description: 'Scan for arbitrage opportunities across Polymarket. Checks: (1) YES+NO not summing to $1.00, (2) Same event priced differently in related markets, (3) Multi-outcome markets with prices summing to != 1. Free money detection.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        market_slugs: { type: 'string', description: 'Comma-separated market slugs to scan' },
        scan_type: { type: 'string', enum: ['yes_no', 'cross_market', 'multi_outcome', 'all'], default: 'all' },
        min_profit_pct: { type: 'number', description: 'Minimum profit % to flag (default: 0.5)', default: 0.5 },
      },
    },
    execute: async (params: any) => {
      await ensureDB();
      const opportunities: any[] = [];
      
      try {
        // Fetch active markets
        let markets: any[] = [];
        if (params.market_slugs) {
          const slugs = params.market_slugs.split(',').map((s: string) => s.trim());
          const fetches = await Promise.all(slugs.map((s: string) => 
            cachedFetchJSON(`${GAMMA_API}/markets?slug=${s}`).catch(() => [])
          ));
          markets = fetches.flat();
        } else {
          // Scan top active markets
          markets = await cachedFetchJSON(`${GAMMA_API}/markets?active=true&closed=false&limit=50&order=volume24hr&ascending=false`).catch(() => []);
        }

        const scanType = params.scan_type || 'all';
        const minProfit = params.min_profit_pct || 0.5;

        // Type 1: YES + NO != $1.00
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
                    type: 'yes_no_mispricing',
                    market: m.question,
                    slug: m.slug,
                    yes_price: yes,
                    no_price: no,
                    sum: +sum.toFixed(4),
                    profit_pct: +deviation.toFixed(2),
                    action: sum > 1 ? 'SELL both YES and NO (overpriced)' : 'BUY both YES and NO (underpriced)',
                  });
                }
              }
            } catch {}
          }
        }

        // Type 2: Multi-outcome sum check
        if (scanType === 'multi_outcome' || scanType === 'all') {
          for (const m of markets) {
            try {
              const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
              if (prices.length > 2) {
                const sum = prices.reduce((s: number, p: string) => s + parseFloat(p), 0);
                const deviation = Math.abs(sum - 1) * 100;
                
                if (deviation >= minProfit) {
                  opportunities.push({
                    type: 'multi_outcome_mispricing',
                    market: m.question,
                    slug: m.slug,
                    outcomes: prices.length,
                    prices: prices.map(Number),
                    sum: +sum.toFixed(4),
                    profit_pct: +deviation.toFixed(2),
                    action: sum > 1
                      ? 'SELL all outcomes (combined price exceeds 100%)'
                      : 'BUY all outcomes (combined price below 100%)',
                  });
                }
              }
            } catch {}
          }
        }

        // Type 3: Cross-market (same event, different slugs)
        if (scanType === 'cross_market' || scanType === 'all') {
          // Group markets by similar questions
          const groups = new Map<string, any[]>();
          for (const m of markets) {
            const key = (m.question || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(m);
          }
          
          for (const [key, group] of groups) {
            if (group.length < 2) continue;
            const prices = group.map(m => {
              const p = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
              return { slug: m.slug, question: m.question, yes: parseFloat(p[0] || '0') };
            });
            
            const maxPrice = Math.max(...prices.map(p => p.yes));
            const minPrice = Math.min(...prices.map(p => p.yes));
            const diff = (maxPrice - minPrice) * 100;
            
            if (diff >= minProfit) {
              opportunities.push({
                type: 'cross_market_divergence',
                topic: key,
                markets: prices,
                price_spread: +diff.toFixed(2),
                action: `Buy cheapest (${minPrice.toFixed(3)}), sell most expensive (${maxPrice.toFixed(3)})`,
              });
            }
          }
        }

        opportunities.sort((a, b) => (b.profit_pct || b.price_spread || 0) - (a.profit_pct || a.price_spread || 0));

        // Store opportunities
        if (db) {
          for (const opp of opportunities.slice(0, 10)) {
            try {
              db.prepare(`INSERT INTO poly_arb_opportunities (agent_id, type, markets, expected_profit) VALUES (?, ?, ?, ?)`)
                .run(agentId, opp.type, JSON.stringify(opp), opp.profit_pct || opp.price_spread || 0);
            } catch {}
          }
        }

        return jsonResult({
          markets_scanned: markets.length,
          opportunities_found: opportunities.length,
          opportunities: opportunities.slice(0, 20),
          total_potential_profit: opportunities.reduce((s, o) => s + (o.profit_pct || o.price_spread || 0), 0).toFixed(2) + '%',
        });
      } catch (e: any) {
        return errorResult(`Arbitrage scan failed: ${e.message}`);
      }
    },
  });

  // ═══ 3. poly_regime_detector ═══
  tools.push({
    name: 'poly_regime_detector',
    label: 'Regime Detector',
    description: 'Determine the current market regime for a token: trending (H>0.55), mean-reverting (H<0.45), or random walk (H≈0.5). Different regimes require different strategies. Uses Hurst exponent + volatility analysis.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to analyze' },
        lookback: { type: 'number', description: 'Hours of data to analyze (default: 72)', default: 72 },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      await ensureDB();
      try {
        const prices = await getPriceHistory(params.token_id);
        if (prices.length < 20) return errorResult('Insufficient price history (need 20+ data points)');

        const lookback = Math.min(params.lookback || 72, prices.length);
        const recentPrices = prices.slice(-lookback);

        const hurst = calculateHurst(recentPrices);
        const vol = calculateVolatility(recentPrices);
        
        // Calculate momentum (slope of linear regression)
        const n = recentPrices.length;
        const xMean = (n - 1) / 2;
        const yMean = recentPrices.reduce((s, p) => s + p, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (i - xMean) * (recentPrices[i] - yMean);
          den += (i - xMean) ** 2;
        }
        const slope = den > 0 ? num / den : 0;
        const trend = slope > 0 ? 'UP' : slope < 0 ? 'DOWN' : 'FLAT';

        // Determine regime
        let regime: string;
        let confidence: number;
        if (hurst > 0.6) { regime = 'TRENDING'; confidence = Math.min(1, (hurst - 0.5) * 5); }
        else if (hurst < 0.4) { regime = 'MEAN_REVERTING'; confidence = Math.min(1, (0.5 - hurst) * 5); }
        else { regime = 'RANDOM_WALK'; confidence = 1 - Math.abs(hurst - 0.5) * 5; }

        // Strategy recommendations per regime
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

        // Store signal
        if (db) {
          try {
            db.prepare(`INSERT INTO poly_regime_signals (token_id, regime, confidence, hurst, volatility) VALUES (?, ?, ?, ?, ?)`)
              .run(params.token_id, regime, confidence, hurst, vol);
          } catch {}
        }

        return jsonResult({
          token_id: params.token_id,
          regime,
          confidence: +confidence.toFixed(3),
          hurst_exponent: hurst,
          volatility_annualized: vol,
          trend_direction: trend,
          slope: +slope.toFixed(6),
          data_points: recentPrices.length,
          current_price: recentPrices[recentPrices.length - 1],
          price_range: { min: +Math.min(...recentPrices).toFixed(4), max: +Math.max(...recentPrices).toFixed(4) },
          strategies: strategies[regime] || [],
        });
      } catch (e: any) {
        return errorResult(`Regime detection failed: ${e.message}`);
      }
    },
  });

  // ═══ 4. poly_smart_money_index ═══
  tools.push({
    name: 'poly_smart_money_index',
    label: 'Smart Money Index',
    description: 'Composite smart money index combining: whale flow, orderbook imbalance, social velocity, and news sentiment into one actionable score. One number that says "smart money is moving."',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to score' },
        market_question: { type: 'string', description: 'Market question (for news/social lookup)' },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const tokenId = params.token_id;
      const signals: any = {};

      try {
        // 1. Orderbook imbalance
        try {
          const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
          const bids = (book?.bids || []).reduce((s: number, b: any) => s + parseFloat(b.size) * parseFloat(b.price), 0);
          const asks = (book?.asks || []).reduce((s: number, a: any) => s + parseFloat(a.size) * parseFloat(a.price), 0);
          const total = bids + asks;
          signals.orderbook_imbalance = total > 0 ? +((bids / total - 0.5) * 2).toFixed(3) : 0; // -1 to 1
        } catch { signals.orderbook_imbalance = 0; }

        // 2. Trade flow (recent trades)
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
          const prices = await getPriceHistory(tokenId);
          if (prices.length >= 10) {
            const recent = prices.slice(-5).reduce((s, p) => s + p, 0) / 5;
            const older = prices.slice(-10, -5).reduce((s, p) => s + p, 0) / 5;
            signals.momentum = older > 0 ? +((recent - older) / older).toFixed(4) : 0;
          } else {
            signals.momentum = 0;
          }
        } catch { signals.momentum = 0; }

        // 4. News sentiment (if question provided)
        if (params.market_question) {
          try {
            const xml = await (await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(params.market_question)}&hl=en-US&gl=US&ceid=US:en`)).text();
            const titles = (xml.match(/<title>([\s\S]*?)<\/title>/g) || []).map((t: string) => t.replace(/<\/?title>/g, '').replace(/<!\[CDATA\[|\]\]>/g, ''));
            const positive = ['yes', 'win', 'likely', 'confirmed', 'ahead', 'surge', 'up'];
            const negative = ['no', 'lose', 'unlikely', 'denied', 'behind', 'drop', 'down'];
            let sentScore = 0;
            for (const t of titles) {
              const lower = t.toLowerCase();
              for (const p of positive) if (lower.includes(p)) sentScore += 0.1;
              for (const n of negative) if (lower.includes(n)) sentScore -= 0.1;
            }
            signals.news_sentiment = +Math.max(-1, Math.min(1, sentScore)).toFixed(3);
          } catch { signals.news_sentiment = 0; }
        } else {
          signals.news_sentiment = 0;
        }

        // Composite score: weighted average
        const weights = { orderbook_imbalance: 0.30, trade_flow: 0.30, momentum: 0.20, news_sentiment: 0.20 };
        const composite = +(
          signals.orderbook_imbalance * weights.orderbook_imbalance +
          signals.trade_flow * weights.trade_flow +
          signals.momentum * weights.momentum +
          signals.news_sentiment * weights.news_sentiment
        ).toFixed(4);

        const action = composite > 0.3 ? 'STRONG_BUY' :
                        composite > 0.1 ? 'BUY' :
                        composite < -0.3 ? 'STRONG_SELL' :
                        composite < -0.1 ? 'SELL' : 'HOLD';

        return jsonResult({
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
        });
      } catch (e: any) {
        return errorResult(`Smart money index failed: ${e.message}`);
      }
    },
  });

  // ═══ 5. poly_market_microstructure ═══
  tools.push({
    name: 'poly_market_microstructure',
    label: 'Market Microstructure',
    description: 'Analyze market microstructure: spread dynamics, fill probability at different price levels, estimated slippage for various order sizes, and execution quality metrics. Essential for optimizing order placement.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to analyze' },
        order_sizes: { type: 'string', description: 'Comma-separated order sizes in USDC to simulate (default: "100,500,1000,5000")' },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      try {
        const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${params.token_id}`);
        const bids = (book?.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
        const asks = (book?.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

        const bestBid = bids.length ? Math.max(...bids.map((b: any) => b.price)) : 0;
        const bestAsk = asks.length ? Math.min(...asks.map((a: any) => a.price)) : 1;
        const midPrice = (bestBid + bestAsk) / 2;
        const spread = bestAsk - bestBid;

        // Simulate fills at different sizes
        const orderSizes = (params.order_sizes || '100,500,1000,5000').split(',').map((s: string) => parseFloat(s.trim()));
        
        const buySimulations: any[] = [];
        const sellSimulations: any[] = [];

        for (const size of orderSizes) {
          // Simulate market buy (eating into asks)
          let remaining = size;
          let totalCost = 0;
          let levelsUsed = 0;
          const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
          
          for (const ask of sortedAsks) {
            if (remaining <= 0) break;
            const fillSize = Math.min(remaining / ask.price, ask.size);
            const fillCost = fillSize * ask.price;
            totalCost += fillCost;
            remaining -= fillCost;
            levelsUsed++;
          }

          const filled = size - Math.max(0, remaining);
          const avgPrice = filled > 0 ? totalCost / (totalCost / midPrice) : midPrice;
          const slippage = midPrice > 0 ? ((avgPrice - midPrice) / midPrice) * 100 : 0;

          buySimulations.push({
            order_size_usdc: size,
            estimated_fill_pct: +((filled / size) * 100).toFixed(1),
            avg_fill_price: +avgPrice.toFixed(4),
            slippage_pct: +slippage.toFixed(3),
            levels_consumed: levelsUsed,
            recommendation: slippage > 2 ? 'USE LIMIT ORDER — high slippage' :
                           slippage > 0.5 ? 'Consider limit order' : 'Market order acceptable',
          });

          // Simulate market sell (eating into bids)
          remaining = size;
          let totalProceeds = 0;
          levelsUsed = 0;
          const sortedBids = [...bids].sort((a, b) => b.price - a.price);
          
          for (const bid of sortedBids) {
            if (remaining <= 0) break;
            const fillSize = Math.min(remaining / bid.price, bid.size);
            const fillProceeds = fillSize * bid.price;
            totalProceeds += fillProceeds;
            remaining -= fillProceeds;
            levelsUsed++;
          }

          const filledSell = size - Math.max(0, remaining);
          const avgSellPrice = filledSell > 0 ? totalProceeds / (totalProceeds / midPrice) : midPrice;
          const sellSlippage = midPrice > 0 ? ((midPrice - avgSellPrice) / midPrice) * 100 : 0;

          sellSimulations.push({
            order_size_usdc: size,
            estimated_fill_pct: +((filledSell / size) * 100).toFixed(1),
            avg_fill_price: +avgSellPrice.toFixed(4),
            slippage_pct: +sellSlippage.toFixed(3),
            levels_consumed: levelsUsed,
          });
        }

        // Recent trade analysis
        let recentTrades: any[] = [];
        try {
          const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${params.token_id}&limit=50`);
          recentTrades = (trades || []).map((t: any) => ({
            size: parseFloat(t.size || '0'),
            price: parseFloat(t.price || '0'),
            side: t.side,
          }));
        } catch {}

        const avgTradeSize = recentTrades.length
          ? +(recentTrades.reduce((s: number, t: any) => s + t.size * t.price, 0) / recentTrades.length).toFixed(2)
          : 0;

        return jsonResult({
          token_id: params.token_id,
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
        });
      } catch (e: any) {
        return errorResult(`Microstructure analysis failed: ${e.message}`);
      }
    },
  });

  return tools;
}
