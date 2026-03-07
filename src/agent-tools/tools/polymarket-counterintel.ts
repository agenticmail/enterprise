/**
 * Polymarket Counter-Intelligence Tools
 * 
 * Detect manipulation, assess resolution risk, and analyze counterparties:
 * - Wash trading and spoofing detection
 * - Resolution ambiguity risk scoring
 * - Counterparty analysis (retail vs whale)
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { cachedFetchJSON, cachedFetchText, validateTokenId, validateSlug, validateAddress, clampNumber, safeDbExec, safeDbQuery, safeDbGet, parseRSSItems as sharedParseRSS, withRetry } from './polymarket-shared.js';

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// ─── Helpers ─────────────────────────────────────────────────


// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketCounterintelTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_manipulation_detector ═══
  tools.push({
    name: 'poly_manipulation_detector',
    label: 'Manipulation Detector',
    description: 'Detect wash trading, spoofing, and layering in a Polymarket token. Analyzes trade patterns for self-dealing (same wallet on both sides), rapid order placement/cancellation, and price painting. Run this before entering any large position.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to analyze' },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      try {
        // Fetch recent trades
        const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${params.token_id}&limit=500`);
        if (!trades?.length) return jsonResult({ token_id: params.token_id, alerts: [], risk: 'LOW', note: 'No trades to analyze' });

        const alerts: any[] = [];
        let riskScore = 0;

        // 1. Wash trading: same maker and taker
        const selfDeals = trades.filter((t: any) =>
          t.maker_address && t.taker_address &&
          t.maker_address.toLowerCase() === t.taker_address.toLowerCase()
        );
        if (selfDeals.length > 0) {
          const pct = (selfDeals.length / trades.length) * 100;
          alerts.push({
            type: 'WASH_TRADING',
            severity: pct > 10 ? 'HIGH' : 'MEDIUM',
            detail: `${selfDeals.length} self-deals (${pct.toFixed(1)}% of trades). Same wallet on both sides.`,
            wallets: [...new Set(selfDeals.map((t: any) => t.maker_address))].slice(0, 5),
          });
          riskScore += pct > 10 ? 3 : 1;
        }

        // 2. Concentration: single wallet dominating volume
        const walletVolume = new Map<string, number>();
        for (const t of trades) {
          for (const addr of [t.maker_address, t.taker_address].filter(Boolean)) {
            const key = addr.toLowerCase();
            const val = parseFloat(t.size || '0') * parseFloat(t.price || '0');
            walletVolume.set(key, (walletVolume.get(key) || 0) + val);
          }
        }
        const totalVolume = [...walletVolume.values()].reduce((s, v) => s + v, 0);
        const topWallets = [...walletVolume.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topPct = totalVolume > 0 ? (topWallets[0]?.[1] || 0) / totalVolume * 100 : 0;
        
        if (topPct > 50) {
          alerts.push({
            type: 'VOLUME_CONCENTRATION',
            severity: 'HIGH',
            detail: `Top wallet controls ${topPct.toFixed(1)}% of volume — market may be easily manipulated.`,
            top_wallet: topWallets[0]?.[0],
          });
          riskScore += 3;
        } else if (topPct > 30) {
          alerts.push({
            type: 'VOLUME_CONCENTRATION',
            severity: 'MEDIUM',
            detail: `Top wallet controls ${topPct.toFixed(1)}% of volume.`,
          });
          riskScore += 1;
        }

        // 3. Rapid-fire trading (potential spoofing)
        const tradesByTime = trades
          .map((t: any) => ({ ...t, ts: new Date(t.match_time || t.created_at).getTime() }))
          .sort((a: any, b: any) => a.ts - b.ts);
        
        let rapidBursts = 0;
        for (let i = 1; i < tradesByTime.length; i++) {
          if (tradesByTime[i].ts - tradesByTime[i-1].ts < 1000) { // <1 second apart
            rapidBursts++;
          }
        }
        const rapidPct = trades.length > 0 ? (rapidBursts / trades.length) * 100 : 0;
        if (rapidPct > 20) {
          alerts.push({
            type: 'RAPID_FIRE_TRADING',
            severity: 'MEDIUM',
            detail: `${rapidPct.toFixed(1)}% of trades are <1 second apart — possible bot activity or spoofing.`,
          });
          riskScore += 2;
        }

        // 4. Price impact — large swings in short periods
        const priceSeries = tradesByTime.map((t: any) => parseFloat(t.price || '0')).filter((p: number) => p > 0);
        let maxSwing = 0;
        for (let i = 10; i < priceSeries.length; i++) {
          const window = priceSeries.slice(i - 10, i);
          const swing = (Math.max(...window) - Math.min(...window)) / Math.min(...window) * 100;
          if (swing > maxSwing) maxSwing = swing;
        }
        if (maxSwing > 20) {
          alerts.push({
            type: 'PRICE_MANIPULATION',
            severity: 'HIGH',
            detail: `${maxSwing.toFixed(1)}% price swing in 10-trade window — possible pump/dump.`,
          });
          riskScore += 3;
        }

        // 5. Orderbook layering (check current book for suspicious patterns)
        try {
          const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${params.token_id}`);
          const bids = (book?.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
          const asks = (book?.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));
          
          // Check for layering: many same-sized orders at consecutive prices
          const bidSizes = bids.map((b: any) => Math.round(b.size));
          const sameSizeBids = bidSizes.filter((s: number, i: number) => i > 0 && s === bidSizes[i-1]).length;
          if (sameSizeBids > 5) {
            alerts.push({
              type: 'ORDERBOOK_LAYERING',
              severity: 'MEDIUM',
              detail: `${sameSizeBids} consecutive same-sized bid orders — possible layering to create fake support.`,
            });
            riskScore += 2;
          }
        } catch {}

        const risk = riskScore >= 6 ? 'HIGH' : riskScore >= 3 ? 'MEDIUM' : 'LOW';

        return jsonResult({
          token_id: params.token_id,
          trades_analyzed: trades.length,
          risk_level: risk,
          risk_score: riskScore,
          alerts,
          top_wallets: topWallets.slice(0, 5).map(([addr, vol]) => ({
            address: addr,
            volume: +vol.toFixed(2),
            pct: +(vol / totalVolume * 100).toFixed(1),
          })),
          recommendation: risk === 'HIGH'
            ? 'DANGER: Multiple manipulation indicators detected. Do NOT place large orders. Consider avoiding this market entirely.'
            : risk === 'MEDIUM'
            ? 'CAUTION: Some suspicious patterns detected. Use limit orders only, keep positions small.'
            : 'No significant manipulation detected. Normal trading activity.',
        });
      } catch (e: any) {
        return errorResult(`Manipulation detection failed: ${e.message}`);
      }
    },
  });

  // ═══ 2. poly_resolution_risk ═══
  tools.push({
    name: 'poly_resolution_risk',
    label: 'Resolution Risk',
    description: 'Assess the probability that a market resolves ambiguously, gets voided, or has unclear resolution criteria. Some markets are traps with vague wording — this tool catches them before you trade.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        market_slug: { type: 'string', description: 'Market slug' },
        condition_id: { type: 'string', description: 'Or condition ID' },
      },
    },
    execute: async (params: any) => {
      try {
        let market: any = null;
        if (params.market_slug) {
          const data = await cachedFetchJSON(`${GAMMA_API}/markets?slug=${params.market_slug}`);
          market = data?.[0];
        } else if (params.condition_id) {
          const data = await cachedFetchJSON(`${GAMMA_API}/markets?condition_id=${params.condition_id}`);
          market = data?.[0];
        }
        if (!market) return errorResult('Market not found');

        const question = (market.question || '').toLowerCase();
        const description = (market.description || '').toLowerCase();
        const combined = question + ' ' + description;

        const risks: any[] = [];
        let riskScore = 0;

        // Ambiguous language
        const ambiguousTerms = ['might', 'could', 'may', 'approximately', 'around', 'roughly', 'about',
          'substantially', 'significantly', 'effectively', 'practically', 'essentially'];
        const foundAmbiguous = ambiguousTerms.filter(t => combined.includes(t));
        if (foundAmbiguous.length > 0) {
          risks.push({ type: 'AMBIGUOUS_LANGUAGE', terms: foundAmbiguous, severity: 'MEDIUM',
            detail: `Resolution criteria contain vague terms: ${foundAmbiguous.join(', ')}` });
          riskScore += foundAmbiguous.length;
        }

        // Subjective judgment
        const subjectiveTerms = ['in the opinion', 'at discretion', 'reasonably', 'judgment', 'interpret',
          'determine', 'decide', 'deem'];
        const foundSubjective = subjectiveTerms.filter(t => combined.includes(t));
        if (foundSubjective.length > 0) {
          risks.push({ type: 'SUBJECTIVE_RESOLUTION', terms: foundSubjective, severity: 'HIGH',
            detail: `Resolution may depend on subjective judgment: ${foundSubjective.join(', ')}` });
          riskScore += foundSubjective.length * 2;
        }

        // No clear resolution source
        const hasUrl = /https?:\/\//.test(description);
        const hasSource = /resolution source|resolv.*based on|determined by|according to/.test(combined);
        if (!hasUrl && !hasSource) {
          risks.push({ type: 'NO_RESOLUTION_SOURCE', severity: 'HIGH',
            detail: 'No explicit resolution source or URL found in market description' });
          riskScore += 3;
        }

        // Time-dependent (deadline ambiguity)
        const hasDeadline = market.end_date_iso || market.endDate;
        if (!hasDeadline) {
          risks.push({ type: 'NO_END_DATE', severity: 'MEDIUM',
            detail: 'No clear end date — market could remain open indefinitely' });
          riskScore += 2;
        }

        // Low volume / liquidity
        const volume = parseFloat(market.volume || '0');
        const liquidity = parseFloat(market.liquidity || '0');
        if (volume < 10000) {
          risks.push({ type: 'LOW_VOLUME', severity: 'MEDIUM',
            detail: `Volume only $${volume.toFixed(0)} — thin market, hard to exit` });
          riskScore += 1;
        }
        if (liquidity < 5000) {
          risks.push({ type: 'LOW_LIQUIDITY', severity: 'MEDIUM',
            detail: `Liquidity only $${liquidity.toFixed(0)} — high slippage risk` });
          riskScore += 1;
        }

        // Multi-clause complexity
        const andCount = (question.match(/\band\b/g) || []).length;
        const orCount = (question.match(/\bor\b/g) || []).length;
        if (andCount + orCount >= 3) {
          risks.push({ type: 'COMPLEX_CONDITIONS', severity: 'MEDIUM',
            detail: `Question has ${andCount} AND + ${orCount} OR clauses — complex resolution criteria` });
          riskScore += 2;
        }

        const risk = riskScore >= 8 ? 'HIGH' : riskScore >= 4 ? 'MEDIUM' : 'LOW';

        return jsonResult({
          market: market.question,
          slug: market.slug,
          risk_level: risk,
          risk_score: riskScore,
          risks,
          end_date: hasDeadline || 'not specified',
          volume: volume,
          liquidity: liquidity,
          recommendation: risk === 'HIGH'
            ? 'AVOID this market — high probability of resolution disputes, ambiguity, or void. Not worth the risk.'
            : risk === 'MEDIUM'
            ? 'Proceed with caution. Review resolution criteria carefully. Keep position small.'
            : 'Resolution criteria appear clear and well-defined. Proceed normally.',
        });
      } catch (e: any) {
        return errorResult(`Resolution risk assessment failed: ${e.message}`);
      }
    },
  });

  // ═══ 3. poly_counterparty_analysis ═══
  tools.push({
    name: 'poly_counterparty_analysis',
    label: 'Counterparty Analysis',
    description: 'Analyze who is on the other side of trades for a token. Are you trading against retail (good) or whales/smart money (risky)? Shows the distribution of counterparty sophistication.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to analyze' },
        side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Your intended side — shows who is on the opposite side' },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      try {
        const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${params.token_id}&limit=500`);
        if (!trades?.length) return jsonResult({ token_id: params.token_id, note: 'No trades to analyze' });

        // Categorize counterparties by volume
        const walletStats = new Map<string, { volume: number; tradeCount: number; sides: Set<string> }>();
        
        for (const t of trades) {
          const value = parseFloat(t.size || '0') * parseFloat(t.price || '0');
          for (const [addr, role] of [[t.maker_address, 'maker'], [t.taker_address, 'taker']] as [string, string][]) {
            if (!addr) continue;
            const key = addr.toLowerCase();
            if (!walletStats.has(key)) walletStats.set(key, { volume: 0, tradeCount: 0, sides: new Set() });
            const stats = walletStats.get(key)!;
            stats.volume += value;
            stats.tradeCount++;
            stats.sides.add(t.side);
          }
        }

        // Classify wallets
        const wallets = [...walletStats.entries()].map(([addr, stats]) => ({
          address: addr,
          ...stats,
          sides: [...stats.sides],
          category: stats.volume > 10000 ? 'WHALE' :
                    stats.volume > 1000 ? 'MID' : 'RETAIL',
        }));

        const whales = wallets.filter(w => w.category === 'WHALE');
        const mids = wallets.filter(w => w.category === 'MID');
        const retail = wallets.filter(w => w.category === 'RETAIL');

        const whaleVolume = whales.reduce((s, w) => s + w.volume, 0);
        const totalVolume = wallets.reduce((s, w) => s + w.volume, 0);
        const whalePct = totalVolume > 0 ? (whaleVolume / totalVolume) * 100 : 0;

        // If user specified a side, show who is opposite
        let oppositeAnalysis: any = null;
        if (params.side) {
          const oppositeSide = params.side === 'BUY' ? 'SELL' : 'BUY';
          const oppTrades = trades.filter((t: any) => t.side === oppositeSide);
          const oppWallets = new Map<string, number>();
          for (const t of oppTrades) {
            const addr = (t.maker_address || t.taker_address || '').toLowerCase();
            const val = parseFloat(t.size || '0') * parseFloat(t.price || '0');
            oppWallets.set(addr, (oppWallets.get(addr) || 0) + val);
          }
          const oppBySize = [...oppWallets.entries()].sort((a, b) => b[1] - a[1]);
          const topOpp = oppBySize[0];
          
          oppositeAnalysis = {
            your_side: params.side,
            opposite_side: oppositeSide,
            unique_counterparties: oppWallets.size,
            top_counterparty_volume: topOpp ? +topOpp[1].toFixed(2) : 0,
            concentration: oppWallets.size > 0 && topOpp
              ? +((topOpp[1] / [...oppWallets.values()].reduce((s, v) => s + v, 0)) * 100).toFixed(1)
              : 0,
          };
        }

        return jsonResult({
          token_id: params.token_id,
          total_traders: wallets.length,
          breakdown: {
            whales: { count: whales.length, volume: +whaleVolume.toFixed(2), pct: +whalePct.toFixed(1) },
            mid_size: { count: mids.length, volume: +mids.reduce((s, w) => s + w.volume, 0).toFixed(2) },
            retail: { count: retail.length, volume: +retail.reduce((s, w) => s + w.volume, 0).toFixed(2) },
          },
          top_whales: whales.sort((a, b) => b.volume - a.volume).slice(0, 5).map(w => ({
            address: w.address,
            volume: +w.volume.toFixed(2),
            trades: w.tradeCount,
            sides: w.sides,
          })),
          opposite_side_analysis: oppositeAnalysis,
          risk_assessment: whalePct > 70
            ? 'HIGH RISK: Whales dominate this market. They likely have better information. Proceed with extreme caution.'
            : whalePct > 40
            ? 'MODERATE: Mix of whale and retail activity. Whales are present but not dominant.'
            : 'FAVORABLE: Mostly retail counterparties. Your informational edge is likely stronger.',
        });
      } catch (e: any) {
        return errorResult(`Counterparty analysis failed: ${e.message}`);
      }
    },
  });

  return tools;
}
