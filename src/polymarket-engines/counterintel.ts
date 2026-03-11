/**
 * Polymarket Counter-Intelligence Engine
 * 
 * Detect manipulation, assess resolution risk, analyze counterparties:
 * - Wash trading detection (self-deals, repeated patterns)
 * - Volume concentration analysis
 * - Rapid-fire / spoofing detection
 * - Price manipulation (pump/dump)
 * - Orderbook layering detection
 * - Resolution ambiguity risk scoring
 * - Counterparty sophistication analysis (retail vs whale)
 */

import {
  CLOB_API, GAMMA_API,
  cachedFetchJSON,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  MANIPULATION DETECTION
// ═══════════════════════════════════════════════════════════════════

export interface ManipulationResult {
  token_id: string;
  trades_analyzed: number;
  risk_level: string;
  risk_score: number;
  alerts: Array<{ type: string; severity: string; detail: string; wallets?: string[] }>;
  top_wallets: Array<{ address: string; volume: number; pct: number }>;
  recommendation: string;
}

export async function detectManipulation(tokenId: string): Promise<ManipulationResult> {
  const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tokenId}&limit=500`);
  if (!trades?.length) return { token_id: tokenId, trades_analyzed: 0, risk_level: 'LOW', risk_score: 0, alerts: [], top_wallets: [], recommendation: 'No trades to analyze' };

  const alerts: ManipulationResult['alerts'] = [];
  let riskScore = 0;

  // 1. Wash trading: same maker and taker
  const selfDeals = trades.filter((t: any) => t.maker_address && t.taker_address && t.maker_address.toLowerCase() === t.taker_address.toLowerCase());
  if (selfDeals.length > 0) {
    const pct = (selfDeals.length / trades.length) * 100;
    alerts.push({
      type: 'WASH_TRADING', severity: pct > 10 ? 'HIGH' : 'MEDIUM',
      detail: `${selfDeals.length} self-deals (${pct.toFixed(1)}% of trades). Same wallet on both sides.`,
      wallets: Array.from(new Set(selfDeals.map((t: any) => t.maker_address))).slice(0, 5) as string[],
    });
    riskScore += pct > 10 ? 3 : 1;
  }

  // 2. Volume concentration
  const walletVolume = new Map<string, number>();
  for (const t of trades) {
    for (const addr of [t.maker_address, t.taker_address].filter(Boolean)) {
      const key = addr.toLowerCase();
      const val = parseFloat(t.size || '0') * parseFloat(t.price || '0');
      walletVolume.set(key, (walletVolume.get(key) || 0) + val);
    }
  }
  const totalVolume = Array.from(walletVolume.values()).reduce((s, v) => s + v, 0);
  const topWallets = Array.from(walletVolume.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topPct = totalVolume > 0 ? (topWallets[0]?.[1] || 0) / totalVolume * 100 : 0;

  if (topPct > 50) {
    alerts.push({ type: 'VOLUME_CONCENTRATION', severity: 'HIGH', detail: `Top wallet controls ${topPct.toFixed(1)}% of volume — market may be easily manipulated.` });
    riskScore += 3;
  } else if (topPct > 30) {
    alerts.push({ type: 'VOLUME_CONCENTRATION', severity: 'MEDIUM', detail: `Top wallet controls ${topPct.toFixed(1)}% of volume.` });
    riskScore += 1;
  }

  // 3. Rapid-fire trading
  const tradesByTime = trades.map((t: any) => ({ ...t, ts: new Date(t.match_time || t.created_at).getTime() })).sort((a: any, b: any) => a.ts - b.ts);
  let rapidBursts = 0;
  for (let i = 1; i < tradesByTime.length; i++) {
    if (tradesByTime[i].ts - tradesByTime[i-1].ts < 1000) rapidBursts++;
  }
  const rapidPct = trades.length > 0 ? (rapidBursts / trades.length) * 100 : 0;
  if (rapidPct > 20) {
    alerts.push({ type: 'RAPID_FIRE_TRADING', severity: 'MEDIUM', detail: `${rapidPct.toFixed(1)}% of trades are <1 second apart — possible bot activity or spoofing.` });
    riskScore += 2;
  }

  // 4. Price manipulation
  const priceSeries = tradesByTime.map((t: any) => parseFloat(t.price || '0')).filter((p: number) => p > 0);
  let maxSwing = 0;
  for (let i = 10; i < priceSeries.length; i++) {
    const window = priceSeries.slice(i - 10, i);
    const swing = (Math.max(...window) - Math.min(...window)) / Math.min(...window) * 100;
    if (swing > maxSwing) maxSwing = swing;
  }
  if (maxSwing > 20) {
    alerts.push({ type: 'PRICE_MANIPULATION', severity: 'HIGH', detail: `${maxSwing.toFixed(1)}% price swing in 10-trade window — possible pump/dump.` });
    riskScore += 3;
  }

  // 5. Orderbook layering
  try {
    const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
    const bidSizes = (book?.bids || []).map((b: any) => Math.round(parseFloat(b.size)));
    const sameSizeBids = bidSizes.filter((s: number, i: number) => i > 0 && s === bidSizes[i-1]).length;
    if (sameSizeBids > 5) {
      alerts.push({ type: 'ORDERBOOK_LAYERING', severity: 'MEDIUM', detail: `${sameSizeBids} consecutive same-sized bid orders — possible layering to create fake support.` });
      riskScore += 2;
    }
  } catch {}

  const risk = riskScore >= 6 ? 'HIGH' : riskScore >= 3 ? 'MEDIUM' : 'LOW';

  return {
    token_id: tokenId,
    trades_analyzed: trades.length,
    risk_level: risk,
    risk_score: riskScore,
    alerts,
    top_wallets: topWallets.slice(0, 5).map(([addr, vol]) => ({ address: addr, volume: +vol.toFixed(2), pct: +(vol / totalVolume * 100).toFixed(1) })),
    recommendation: risk === 'HIGH'
      ? 'DANGER: Multiple manipulation indicators detected. Do NOT place large orders. Consider avoiding this market entirely.'
      : risk === 'MEDIUM'
      ? 'CAUTION: Some suspicious patterns detected. Use limit orders only, keep positions small.'
      : 'No significant manipulation detected. Normal trading activity.',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  RESOLUTION RISK ASSESSMENT
// ═══════════════════════════════════════════════════════════════════

export interface ResolutionRiskResult {
  market: string;
  slug: string;
  risk_level: string;
  risk_score: number;
  risks: Array<{ type: string; severity: string; detail: string; terms?: string[] }>;
  end_date: string;
  volume: number;
  liquidity: number;
  recommendation: string;
}

export async function assessResolutionRisk(marketSlug?: string, conditionId?: string): Promise<ResolutionRiskResult> {
  let market: any = null;
  // Auto-detect: if marketSlug looks like a condition ID (0x...), treat it as one
  if (marketSlug?.startsWith('0x')) {
    conditionId = marketSlug;
    marketSlug = undefined;
  }
  if (marketSlug) {
    // Try slug first
    let data = await cachedFetchJSON(`${GAMMA_API}/markets?slug=${marketSlug}`).catch(() => null);
    market = data?.[0];
    // Fallback: try as search query (agent may pass question text)
    if (!market) {
      data = await cachedFetchJSON(`${GAMMA_API}/markets?search=${encodeURIComponent(marketSlug)}&limit=1`).catch(() => null);
      market = data?.[0];
    }
  }
  if (!market && conditionId) {
    const data = await cachedFetchJSON(`${GAMMA_API}/markets?condition_id=${conditionId}`).catch(() => null);
    market = data?.[0];
  }
  if (!market) throw new Error('Market not found — try passing a valid slug or condition_id (0x...)');

  const question = (market.question || '').toLowerCase();
  const description = (market.description || '').toLowerCase();
  const combined = question + ' ' + description;

  const risks: ResolutionRiskResult['risks'] = [];
  let riskScore = 0;

  // Ambiguous language
  const ambiguousTerms = ['might', 'could', 'may', 'approximately', 'around', 'roughly', 'about', 'substantially', 'significantly', 'effectively', 'practically', 'essentially'];
  const foundAmbiguous = ambiguousTerms.filter(t => combined.includes(t));
  if (foundAmbiguous.length > 0) {
    risks.push({ type: 'AMBIGUOUS_LANGUAGE', terms: foundAmbiguous, severity: 'MEDIUM', detail: `Resolution criteria contain vague terms: ${foundAmbiguous.join(', ')}` });
    riskScore += foundAmbiguous.length;
  }

  // Subjective judgment
  const subjectiveTerms = ['in the opinion', 'at discretion', 'reasonably', 'judgment', 'interpret', 'determine', 'decide', 'deem'];
  const foundSubjective = subjectiveTerms.filter(t => combined.includes(t));
  if (foundSubjective.length > 0) {
    risks.push({ type: 'SUBJECTIVE_RESOLUTION', terms: foundSubjective, severity: 'HIGH', detail: `Resolution may depend on subjective judgment: ${foundSubjective.join(', ')}` });
    riskScore += foundSubjective.length * 2;
  }

  // No clear resolution source
  const hasUrl = /https?:\/\//.test(description);
  const hasSource = /resolution source|resolv.*based on|determined by|according to/.test(combined);
  if (!hasUrl && !hasSource) {
    risks.push({ type: 'NO_RESOLUTION_SOURCE', severity: 'HIGH', detail: 'No explicit resolution source or URL found in market description' });
    riskScore += 3;
  }

  // No end date
  const hasDeadline = market.end_date_iso || market.endDate;
  if (!hasDeadline) {
    risks.push({ type: 'NO_END_DATE', severity: 'MEDIUM', detail: 'No clear end date — market could remain open indefinitely' });
    riskScore += 2;
  }

  // Low volume/liquidity
  const volume = parseFloat(market.volume || '0');
  const liquidity = parseFloat(market.liquidity || '0');
  if (volume < 10000) { risks.push({ type: 'LOW_VOLUME', severity: 'MEDIUM', detail: `Volume only $${volume.toFixed(0)} — thin market, hard to exit` }); riskScore += 1; }
  if (liquidity < 5000) { risks.push({ type: 'LOW_LIQUIDITY', severity: 'MEDIUM', detail: `Liquidity only $${liquidity.toFixed(0)} — high slippage risk` }); riskScore += 1; }

  // Multi-clause complexity
  const andCount = (question.match(/\band\b/g) || []).length;
  const orCount = (question.match(/\bor\b/g) || []).length;
  if (andCount + orCount >= 3) {
    risks.push({ type: 'COMPLEX_CONDITIONS', severity: 'MEDIUM', detail: `Question has ${andCount} AND + ${orCount} OR clauses — complex resolution criteria` });
    riskScore += 2;
  }

  const risk = riskScore >= 8 ? 'HIGH' : riskScore >= 4 ? 'MEDIUM' : 'LOW';

  return {
    market: market.question, slug: market.slug,
    risk_level: risk, risk_score: riskScore, risks,
    end_date: hasDeadline || 'not specified',
    volume, liquidity,
    recommendation: risk === 'HIGH'
      ? 'AVOID this market — high probability of resolution disputes, ambiguity, or void.'
      : risk === 'MEDIUM'
      ? 'Proceed with caution. Review resolution criteria carefully. Keep position small.'
      : 'Resolution criteria appear clear and well-defined. Proceed normally.',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  COUNTERPARTY ANALYSIS
// ═══════════════════════════════════════════════════════════════════

export interface CounterpartyResult {
  token_id: string;
  total_traders: number;
  breakdown: {
    whales: { count: number; volume: number; pct: number };
    mid_size: { count: number; volume: number };
    retail: { count: number; volume: number };
  };
  top_whales: Array<{ address: string; volume: number; trades: number; sides: string[] }>;
  opposite_side_analysis: any | null;
  risk_assessment: string;
}

export async function analyzeCounterparties(tokenId: string, side?: 'BUY' | 'SELL'): Promise<CounterpartyResult> {
  const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tokenId}&limit=500`);
  if (!trades?.length) return { token_id: tokenId, total_traders: 0, breakdown: { whales: { count: 0, volume: 0, pct: 0 }, mid_size: { count: 0, volume: 0 }, retail: { count: 0, volume: 0 } }, top_whales: [], opposite_side_analysis: null, risk_assessment: 'No trades to analyze' };

  const walletStats = new Map<string, { volume: number; tradeCount: number; sides: Set<string> }>();
  for (const t of trades) {
    const value = parseFloat(t.size || '0') * parseFloat(t.price || '0');
    for (const [addr] of ([[t.maker_address, 'maker'], [t.taker_address, 'taker']] as [string, string][])) {
      if (!addr) continue;
      const key = addr.toLowerCase();
      if (!walletStats.has(key)) walletStats.set(key, { volume: 0, tradeCount: 0, sides: new Set() });
      const stats = walletStats.get(key)!;
      stats.volume += value;
      stats.tradeCount++;
      stats.sides.add(t.side);
    }
  }

  const wallets = Array.from(walletStats.entries()).map(([addr, stats]) => ({
    address: addr, ...stats, sides: Array.from(stats.sides),
    category: stats.volume > 10000 ? 'WHALE' : stats.volume > 1000 ? 'MID' : 'RETAIL' as string,
  }));

  const whales = wallets.filter(w => w.category === 'WHALE');
  const mids = wallets.filter(w => w.category === 'MID');
  const retail = wallets.filter(w => w.category === 'RETAIL');
  const whaleVolume = whales.reduce((s, w) => s + w.volume, 0);
  const totalVolume = wallets.reduce((s, w) => s + w.volume, 0);
  const whalePct = totalVolume > 0 ? (whaleVolume / totalVolume) * 100 : 0;

  let oppositeAnalysis: any = null;
  if (side) {
    const oppositeSide = side === 'BUY' ? 'SELL' : 'BUY';
    const oppTrades = trades.filter((t: any) => t.side === oppositeSide);
    const oppWallets = new Map<string, number>();
    for (const t of oppTrades) {
      const addr = (t.maker_address || t.taker_address || '').toLowerCase();
      const val = parseFloat(t.size || '0') * parseFloat(t.price || '0');
      oppWallets.set(addr, (oppWallets.get(addr) || 0) + val);
    }
    const oppBySize = Array.from(oppWallets.entries()).sort((a, b) => b[1] - a[1]);
    const topOpp = oppBySize[0];
    oppositeAnalysis = {
      your_side: side, opposite_side: oppositeSide,
      unique_counterparties: oppWallets.size,
      top_counterparty_volume: topOpp ? +topOpp[1].toFixed(2) : 0,
      concentration: oppWallets.size > 0 && topOpp
        ? +((topOpp[1] / Array.from(oppWallets.values()).reduce((s, v) => s + v, 0)) * 100).toFixed(1) : 0,
    };
  }

  return {
    token_id: tokenId,
    total_traders: wallets.length,
    breakdown: {
      whales: { count: whales.length, volume: +whaleVolume.toFixed(2), pct: +whalePct.toFixed(1) },
      mid_size: { count: mids.length, volume: +mids.reduce((s, w) => s + w.volume, 0).toFixed(2) },
      retail: { count: retail.length, volume: +retail.reduce((s, w) => s + w.volume, 0).toFixed(2) },
    },
    top_whales: whales.sort((a, b) => b.volume - a.volume).slice(0, 5).map(w => ({ address: w.address, volume: +w.volume.toFixed(2), trades: w.tradeCount, sides: w.sides })),
    opposite_side_analysis: oppositeAnalysis,
    risk_assessment: whalePct > 70
      ? 'HIGH RISK: Whales dominate this market. They likely have better information.'
      : whalePct > 40
      ? 'MODERATE: Mix of whale and retail activity.'
      : 'FAVORABLE: Mostly retail counterparties. Your informational edge is likely stronger.',
  };
}
