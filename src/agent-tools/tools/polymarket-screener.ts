/**
 * Polymarket Market Screener Tool — Thin wrapper around polymarket-engines/screener
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { screenMarkets } from '../../polymarket-engines/screener.js';

// ─── Market Freshness Tracker (shared with polymarket.ts via import) ────
// Tracks recently-screened markets to encourage diversity
const screenedMarkets = new Map<string, Map<string, { ts: number; count: number }>>();
const SCREEN_FRESH_TTL = 20 * 60_000; // 20 min

function trackScreened(agentId: string, marketId: string) {
  if (!screenedMarkets.has(agentId)) screenedMarkets.set(agentId, new Map());
  const agent = screenedMarkets.get(agentId)!;
  const existing = agent.get(marketId);
  agent.set(marketId, { ts: Date.now(), count: (existing?.count || 0) + 1 });
}

function filterScreenedMarkets(agentId: string, markets: any[]): { filtered: any[]; removed: number } {
  const agent = screenedMarkets.get(agentId);
  if (!agent) return { filtered: markets, removed: 0 };
  // Cleanup stale entries
  for (const [id, entry] of agent) {
    if (Date.now() - entry.ts > SCREEN_FRESH_TTL) agent.delete(id);
  }
  let removed = 0;
  const filtered = markets.filter(m => {
    const mkt = m.market || {};
    const id = mkt.id || mkt.slug;
    if (!id) return true;
    const entry = agent.get(id);
    if (entry && entry.count >= 2 && Date.now() - entry.ts < SCREEN_FRESH_TTL) {
      removed++;
      return false;
    }
    return true;
  });
  return { filtered, removed };
}

export function createPolymarketScreenerTools(opts?: ToolCreationOptions): AnyAgentTool[] {
  const agentId = opts?.agentId || 'default';

  return [
    {
      name: 'poly_screen_markets',
      description: 'Screen and rank prediction markets using a 6-dimension scoring system: liquidity, volume, spread, edge potential, timing, and momentum. Returns ranked list with recommendations. Supports strategy modes: momentum, contested, best_opportunities, high_volume, closing_soon, mispriced, safe_bets, new_markets.',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Search query to filter markets' },
          strategy: {
            type: 'string', description: 'Screening strategy',
            enum: ['momentum', 'contested', 'best_opportunities', 'high_volume', 'closing_soon', 'mispriced', 'safe_bets', 'new_markets'],
          },
          limit: { type: 'number', description: 'Max markets to return', default: 10 },
          min_volume: { type: 'number', description: 'Minimum 24h volume filter' },
          min_liquidity: { type: 'number', description: 'Minimum liquidity filter' },
          active_only: { type: 'boolean', description: 'Only active markets', default: true },
        },
      },
      async execute(_id: string, p: any) {
        try {
          const raw = await screenMarkets(p);
          // Trim market objects to reduce token usage (raw can be 20-38K chars)
          if (raw?.markets && Array.isArray(raw.markets)) {
            raw.markets = raw.markets.slice(0, 10).map((m: any) => {
              const mkt = m.market || {};
              return {
                market: {
                  id: mkt.id,
                  question: mkt.question,
                  slug: mkt.slug,
                  outcomes: mkt.outcomes,
                  outcomePrices: mkt.outcomePrices || mkt.outcome_prices,
                  volume24hr: mkt.volume24hr,
                  liquidity: mkt.liquidity,
                  endDate: mkt.end_date_iso || mkt.endDate,
                },
                scores: m.scores,
                analysis: m.analysis ? {
                  overround: m.analysis.overround,
                  hoursToClose: m.analysis.hoursToClose,
                  volumePerHour: m.analysis.volumePerHour,
                  priceLevel: m.analysis.priceLevel,
                  edgeType: m.analysis.edgeType,
                } : undefined,
                recommendation: m.recommendation ? { action: m.recommendation.action, confidence: m.recommendation.confidence } : undefined,
                pipeline: m.pipeline ? { action: m.pipeline.action, score: m.pipeline.score, kelly: m.pipeline.kelly } : undefined,
              };
            }) as any;

            // Filter out dead markets (all prices 0 or 1)
            raw.markets = raw.markets.filter((m: any) => {
              const prices = m.market?.outcomePrices;
              if (!prices) return true;
              try {
                const parsed = typeof prices === 'string' ? JSON.parse(prices) : prices;
                if (Array.isArray(parsed)) {
                  return !parsed.every((pr: any) => parseFloat(pr) <= 0.01 || parseFloat(pr) >= 0.99);
                }
              } catch {}
              return true;
            });

            // Filter recently-screened markets for diversity
            const { filtered, removed } = filterScreenedMarkets(agentId, raw.markets);
            raw.markets = filtered;
            if (removed > 0) {
              (raw as any).freshness_note = `${removed} recently-screened markets filtered out for diversity.`;
            }

            // Track returned markets
            for (const m of raw.markets) {
              const mid = m.market?.id || m.market?.slug;
              if (mid) trackScreened(agentId, mid);
            }
          }
          return jsonResult(raw);
        }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
