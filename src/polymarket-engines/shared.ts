/**
 * Polymarket Engines — Shared Types, Interfaces, and Utilities
 * 
 * Common infrastructure used by all engine modules:
 * - TypeScript interfaces for market data, analysis results
 * - API fetch helpers with caching and rate limiting
 * - Mathematical primitives (normal distribution, regression, statistics)
 * - DB abstraction for engine state storage
 */

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

export const CLOB_API = 'https://clob.polymarket.com';
export const GAMMA_API = 'https://gamma-api.polymarket.com';
export const DATA_API = 'https://data-api.polymarket.com';
export const POLYGON_RPC = 'https://polygon-bor-rpc.publicnode.com';
export const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
export const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// ═══════════════════════════════════════════════════════════════════
//  DATA TYPES
// ═══════════════════════════════════════════════════════════════════

export interface MarketData {
  id: string;
  question: string;
  slug: string;
  category: string;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  volume: number;
  liquidity: number;
  endDate: string | null;
  active: boolean;
  negRisk: boolean;
  tickSize: string;
  description?: string;
  startDate?: string;
}

export interface OrderbookSnapshot {
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPct: number;
  midpoint: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;   // (bidDepth - askDepth) / (bidDepth + askDepth), -1 to 1
  topBidSize: number;
  topAskSize: number;
  levels: number;
  bidWalls?: Array<{ price: number; size: number; multiple: number }>;
  askWalls?: Array<{ price: number; size: number; multiple: number }>;
  totalBidLiquidity?: number;
  totalAskLiquidity?: number;
}

export interface ScoredMarket {
  market: MarketData;
  scores: {
    total: number;
    liquidity: number;
    volume: number;
    spread: number;
    edge: number;
    timing: number;
    momentum: number;
  };
  analysis: {
    overround: number;
    hoursToClose: number | null;
    volumePerHour: number;
    priceLevel: string;
    edgeType: string | null;
    orderbook?: OrderbookSnapshot;
  };
  recommendation: {
    action: string;
    side: string;
    confidence: number;
    reasoning: string;
    suggestedSize: string;
    entryPrice: number;
    targetExit: number;
  };
}

export interface QuantAnalysis {
  kelly: { fraction: number; signal: 'BUY' | 'SELL' | 'NO_EDGE'; halfKelly: number; quarterKelly: number; edgePct: number };
  pricing: { theoreticalPrice: number; mispricing: number; delta: number; theta: number } | null;
  volatility: { realized: number; ewma: number; regime: 'low' | 'medium' | 'high' | 'extreme' } | null;
  momentum: { rsi: number; trend: 'bullish' | 'bearish' | 'neutral'; meanReversion: number } | null;
}

export interface OnChainAnalysis {
  orderbook: OrderbookSnapshot | null;
  whaleActivity: { recentLargeTrades: number; netDirection: 'buying' | 'selling' | 'neutral'; largestTrade: number } | null;
  flowPressure: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

export interface SocialAnalysis {
  sentiment: number;
  volume: number;
  velocity: number;
  sources: Array<{ platform: string; sentiment: number; count: number }>;
  summary: string;
}

export interface CounterIntelAnalysis {
  manipulationRisk: 'low' | 'medium' | 'high';
  signals: string[];
  washTradingScore: number;
  spoofingDetected: boolean;
  resolutionRisk: 'low' | 'medium' | 'high';
}

export interface MarketAnalysis {
  tokenId: string;
  question: string;
  slug?: string;
  price: number;
  endDate?: string;
  screener: {
    totalScore: number;
    scores: Record<string, number>;
    recommendation: {
      action: string;
      side: string;
      confidence: number;
      reasoning: string;
      entryPrice?: number;
      targetExit?: number;
      suggestedSize?: string;
    };
  };
  quant?: QuantAnalysis;
  onchain?: OnChainAnalysis;
  social?: SocialAnalysis;
  counterIntel?: CounterIntelAnalysis;
  composite: {
    signal: 'STRONG_BUY' | 'BUY' | 'LEAN_BUY' | 'NEUTRAL' | 'LEAN_SELL' | 'SELL' | 'STRONG_SELL' | 'AVOID';
    confidence: number;
    reasons: string[];
    warnings: string[];
    suggestedSize: number;
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  };
}

export type PipelineDepth = 'minimal' | 'quick' | 'full';

export interface PipelineOptions {
  depth?: PipelineDepth;
  bankroll?: number;
  maxPositionSize?: number;
}

// ═══════════════════════════════════════════════════════════════════
//  FETCH HELPERS
// ═══════════════════════════════════════════════════════════════════

const responseCache = new Map<string, { data: any; ts: number }>();
const MAX_CACHE_ENTRIES = 500;

export function getCached(key: string, ttlMs: number): any | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  if (entry) responseCache.delete(key);
  return null;
}

export function setCache(key: string, data: any): void {
  if (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { data, ts: Date.now() });
}

const rateLimits = new Map<string, number[]>();

// Per-domain rate limits — CLOB gets higher limit since many tools hit it per session
const DOMAIN_LIMITS: Record<string, number> = {
  'clob.polymarket.com': 80,
  'gamma-api.polymarket.com': 60,
  'data-api.polymarket.com': 60,
};

export function checkRateLimit(domain: string, maxPerMinute = 30): boolean {
  const now = Date.now();
  const limit = DOMAIN_LIMITS[domain] || maxPerMinute;
  const times = rateLimits.get(domain) || [];
  const recent = times.filter(t => now - t < 60_000);
  if (recent.length >= limit) return false;
  recent.push(now);
  rateLimits.set(domain, recent);
  return true;
}

// Optional proxy hook — set by polymarket-runtime when proxy connects
let _proxyFetchHook: ((url: string, opts?: any) => Promise<Response>) | null = null;
export function setProxyFetchHook(hook: ((url: string, opts?: any) => Promise<Response>) | null) { _proxyFetchHook = hook; }

export async function apiFetch(url: string, timeoutMs = 10_000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const fetchOpts: any = { signal: ctrl.signal, headers: { Accept: 'application/json' } };
    // Use proxy for CLOB API if proxy hook is available
    const isClobApi = url.includes('clob.polymarket.com');
    const res = (isClobApi && _proxyFetchHook)
      ? await _proxyFetchHook(url, fetchOpts)
      : await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  } finally { clearTimeout(t); }
}

export async function cachedFetchJSON(url: string, ttlMs = 30_000, timeoutMs = 10_000): Promise<any> {
  const cached = getCached(url, ttlMs);
  if (cached !== null) return cached;
  const domain = new URL(url).hostname;
  if (!checkRateLimit(domain)) throw new Error(`Rate limited: ${domain}`);
  const data = await apiFetch(url, timeoutMs);
  setCache(url, data);
  return data;
}

export async function cachedFetchText(url: string, ttlMs = 60_000, timeoutMs = 10_000): Promise<string> {
  const cacheKey = 'txt:' + url;
  const cached = getCached(cacheKey, ttlMs);
  if (cached !== null) return cached;
  const domain = new URL(url).hostname;
  if (!checkRateLimit(domain)) throw new Error(`Rate limited: ${domain}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'PolymarketBot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    setCache(cacheKey, text);
    return text;
  } finally { clearTimeout(t); }
}

/** Parallel fetch with concurrency limit */
export async function parallelFetch<T>(items: any[], fn: (item: any) => Promise<T>, concurrency = 5): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  MATHEMATICAL PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

/** Standard normal CDF (Abramowitz & Stegun approximation) */
export function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/** Standard normal PDF */
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Inverse normal CDF (Beasley-Springer-Moro) */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/** Linear regression: returns { slope, intercept, r2 } */
export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = ys.reduce((s, y, i) => s + Math.pow(y - (slope * xs[i] + intercept), 2), 0);
  const ssTot = ys.reduce((s, y) => s + Math.pow(y - sumY / n, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

/** Exponentially Weighted Moving Average */
export function ewma(data: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/** Simple Moving Average */
export function sma(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += data[j];
    result.push(sum / window);
  }
  return result;
}

/** Standard deviation */
export function std(data: number[]): number {
  const n = data.length;
  if (n < 2) return 0;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const variance = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Pearson correlation coefficient */
export function pearsonCorrelation(x: number[], y: number[]): number {
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
  return denom > 0 ? parseFloat((num / denom).toFixed(4)) : 0;
}

/** Hurst exponent via R/S analysis */
export function calculateHurst(prices: number[]): number {
  if (prices.length < 20) return 0.5;
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const deviations = returns.map(r => r - mean);
  const cumDev: number[] = [];
  let sum = 0;
  for (const d of deviations) { sum += d; cumDev.push(sum); }
  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = Math.sqrt(deviations.reduce((s, d) => s + d * d, 0) / n);
  if (S === 0) return 0.5;
  const RS = R / S;
  const H = Math.log(RS) / Math.log(n);
  return parseFloat(Math.max(0, Math.min(1, H)).toFixed(4));
}

/** Annualized volatility from price series */
export function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return parseFloat((Math.sqrt(variance * 252)).toFixed(4));
}

// ═══════════════════════════════════════════════════════════════════
//  MARKET DATA PARSING
// ═══════════════════════════════════════════════════════════════════

/** Parse raw Gamma API market object into typed MarketData */
export function parseMarket(m: any): MarketData {
  const prices = (() => {
    try { return JSON.parse(m.outcomePrices || '[]').map(Number); }
    catch { return [0.5, 0.5]; }
  })();
  const outcomes = (() => {
    try { return JSON.parse(m.outcomes || '[]'); }
    catch { return ['Yes', 'No']; }
  })();
  const tokens = (() => {
    try { return JSON.parse(m.clobTokenIds || '[]'); }
    catch { return []; }
  })();

  return {
    id: m.conditionId || m.id,
    question: m.question || '',
    slug: m.slug || '',
    category: m.tags?.[0] || m.category || 'unknown',
    outcomes,
    outcomePrices: prices,
    clobTokenIds: tokens,
    volume: parseFloat(m.volume || '0'),
    liquidity: parseFloat(m.liquidity || '0'),
    endDate: m.endDate || null,
    active: m.active !== false,
    negRisk: !!m.negRisk,
    tickSize: m.minimumTickSize || '0.01',
    description: m.description,
    startDate: m.startDate,
  };
}

/** Fetch price series from CLOB trades */
export async function fetchPriceSeries(tokenId: string, limit = 200): Promise<number[]> {
  try {
    const trades = await apiFetch(`${CLOB_API}/trades?asset_id=${tokenId}&limit=${limit}`);
    if (!Array.isArray(trades) || trades.length === 0) return [];
    return trades.reverse().map((t: any) => parseFloat(t.price || '0')).filter(p => p > 0);
  } catch { return []; }
}

/** Fetch price history (hourly) from CLOB */
const priceHistoryCache = new Map<string, { data: number[]; ts: number }>();
export async function fetchPriceHistory(tokenId: string): Promise<number[]> {
  const cached = priceHistoryCache.get(tokenId);
  if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.data;
  try {
    const data = await cachedFetchJSON(`${CLOB_API}/prices-history?market=${tokenId}&interval=1h&fidelity=60`);
    const prices = (data?.history || []).map((p: any) => parseFloat(p.p || p.price || '0')).filter((p: number) => p > 0);
    priceHistoryCache.set(tokenId, { data: prices, ts: Date.now() });
    return prices;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════
//  RSS PARSING
// ═══════════════════════════════════════════════════════════════════

export function parseRSSItems(xml: string): any[] {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const get = (tag: string) => {
      const m = match![1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    items.push({
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      description: get('description').replace(/<[^>]+>/g, '').slice(0, 300),
      source: get('source'),
    });
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════
//  SENTIMENT HELPERS
// ═══════════════════════════════════════════════════════════════════

export const POSITIVE_WORDS: Record<string, number> = {
  'bullish': 3, 'surge': 3, 'rally': 3, 'soar': 3, 'winning': 2, 'gain': 2,
  'positive': 2, 'strong': 2, 'confident': 2, 'optimistic': 3, 'breakthrough': 3,
  'success': 2, 'support': 1, 'lead': 2, 'ahead': 2, 'up': 1, 'rise': 2,
  'good': 1, 'great': 2, 'excellent': 3, 'profit': 2, 'growth': 2, 'boom': 3,
  'likely': 2, 'certain': 3, 'confirmed': 3, 'approved': 2, 'passed': 2,
  'win': 2, 'victory': 3, 'dominate': 2, 'crush': 2, 'landslide': 3,
  'definitely': 2, 'absolutely': 2, 'obvious': 2, 'clearly': 2, 'guaranteed': 3,
  'huge': 2, 'massive': 2, 'pump': 2, 'lock': 2, 'locked': 2, 'moon': 3,
  'yes': 1, 'agree': 1, 'amazing': 2, 'love': 2,
};

export const NEGATIVE_WORDS: Record<string, number> = {
  'bearish': -3, 'crash': -3, 'plunge': -3, 'collapse': -3, 'losing': -2,
  'negative': -2, 'weak': -2, 'fear': -2, 'pessimistic': -3, 'failure': -3,
  'risk': -1, 'down': -1, 'fall': -2, 'decline': -2, 'drop': -2, 'loss': -2,
  'bad': -1, 'terrible': -3, 'crisis': -3, 'panic': -3, 'dump': -3,
  'unlikely': -2, 'doubt': -2, 'uncertain': -1, 'rejected': -2, 'failed': -3,
  'lose': -2, 'defeat': -3, 'scandal': -3, 'fraud': -3, 'manipulation': -3,
  'no': -1, 'impossible': -3, 'never': -3, 'scam': -3, 'rug': -3, 'fake': -3,
  'wrong': -2, 'fail': -3, 'short': -1, 'hate': -2, 'disagree': -2,
  'risky': -2, 'behind': -1,
};

/** Score sentiment of a text string. Returns -1 to 1 */
export function scoreSentiment(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (POSITIVE_WORDS[clean]) score += POSITIVE_WORDS[clean];
    if (NEGATIVE_WORDS[clean]) score += NEGATIVE_WORDS[clean];
  }
  return Math.max(-1, Math.min(1, score / Math.max(words.length * 0.1, 1)));
}

/** Extract market-relevant topics from text — comprehensive for Polymarket categories */
export function extractTopics(text: string): string[] {
  const patterns = [
    // US Politics
    /\b(trump|desantis|vance|newsom|rfk|kennedy|obama|pence|haley|ramaswamy|whitmer|shapiro)\b/gi,
    /\b(election|vote|poll|primary|caucus|electoral|congress|senate|house|midterm|inauguration|impeach|indictment|scotus|supreme\s*court)\b/gi,
    /\b(republican|democrat|gop|dnc|rnc|maga|progressive|conservative|liberal)\b/gi,
    // Global Politics & Geopolitics
    /\b(putin|zelensky|xi\s*jinping|modi|macron|starmer|trudeau|netanyahu|erdogan|lula|milei|bukele|maduro)\b/gi,
    /\b(nato|eu|un|brics|g7|g20|opec|who|imf|world\s*bank)\b/gi,
    /\b(war|conflict|peace|treaty|sanctions|ceasefire|invasion|annexation|coup|regime|refugee|nuclear|missile|drone)\b/gi,
    /\b(ukraine|russia|china|taiwan|israel|palestine|gaza|iran|north\s*korea|syria|yemen|sudan|venezuela)\b/gi,
    // Economics & Finance
    /\b(fed|federal\s*reserve|rate\s*cut|rate\s*hike|inflation|cpi|ppi|gdp|jobs|unemployment|payroll|nonfarm|recession|stagflation|deficit|debt\s*ceiling)\b/gi,
    /\b(stock|s&p|nasdaq|dow|russell|vix|bond|yield|treasury|commodity|oil|gold|silver|copper)\b/gi,
    /\b(tariff|trade\s*war|sanctions|embargo|subsidy|stimulus|bailout|default)\b/gi,
    // Crypto & Web3
    /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|ripple|cardano|ada|polygon|matic|avalanche|avax|chainlink|link)\b/gi,
    /\b(crypto|defi|nft|web3|blockchain|stablecoin|usdc|usdt|tether|binance|coinbase|sec\s*crypto|etf|halving|altcoin|memecoin|doge|shib|pepe)\b/gi,
    // Tech & AI
    /\b(ai|artificial\s*intelligence|openai|chatgpt|gpt|claude|anthropic|gemini|llama|meta\s*ai|deepseek|mistral|copilot)\b/gi,
    /\b(google|microsoft|apple|nvidia|amazon|meta|tesla|spacex|neuralink|twitter|tiktok|bytedance|samsung|tsmc|intel|amd)\b/gi,
    /\b(agi|superintelligence|robotics|autonomous|self-driving|quantum|fusion|biotech|crispr|mrna)\b/gi,
    // Sports
    /\b(nfl|nba|mlb|nhl|mls|premier\s*league|champions\s*league|world\s*cup|olympics|super\s*bowl|march\s*madness|wimbledon|us\s*open)\b/gi,
    /\b(lebron|curry|mahomes|messi|ronaldo|haaland|ohtani|djokovic|verstappen|hamilton)\b/gi,
    /\b(ufc|mma|boxing|f1|formula\s*1|pga|golf|tennis|soccer|football|basketball|baseball|hockey)\b/gi,
    // Entertainment & Culture
    /\b(oscars|grammys|emmys|golden\s*globe|box\s*office|netflix|disney|spotify|youtube|twitch|podcast)\b/gi,
    /\b(taylor\s*swift|drake|kanye|beyonce|rihanna|elon\s*musk|zuckerberg|bezos|mrbeast)\b/gi,
    // Science, Health & Climate
    /\b(covid|pandemic|vaccine|fda|who|bird\s*flu|mpox|outbreak|epidemic)\b/gi,
    /\b(climate|hurricane|earthquake|wildfire|flood|drought|tornado|emissions|carbon|renewable|solar|wind\s*energy)\b/gi,
    /\b(nasa|spacex|mars|moon|asteroid|satellite|rocket|launch|starship|artemis)\b/gi,
    // Polymarket-specific
    /\b(polymarket|prediction\s*market|odds|probability|resolve|resolution|outcome)\b/gi,
    // Regulation & Legal
    /\b(regulation|legislation|ban|legalize|antitrust|monopoly|privacy|surveillance|whistleblower|classified|espionage)\b/gi,
  ];
  const topics = new Set<string>();
  for (const p of patterns) {
    const matches = text.match(p) || [];
    for (const m of matches) topics.add(m.toLowerCase().trim());
  }
  return Array.from(topics);
}
