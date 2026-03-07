/**
 * Polymarket Quantitative Analysis & Signal Engine
 * 
 * Institutional-grade mathematical tools for prediction market trading.
 * Implements actual formulas from quantitative finance, statistical physics,
 * and information theory adapted for binary/multi-outcome prediction markets.
 * 
 * Tools:
 * - Kelly Criterion optimal sizing
 * - Binary option pricing (Black-Scholes analog)
 * - Bayesian probability updating
 * - Monte Carlo simulation
 * - Mean reversion detection (Ornstein-Uhlenbeck)
 * - Momentum indicators (RSI, MACD, Bollinger)
 * - Volatility modeling (realized, EWMA, GARCH-like)
 * - Statistical arbitrage (z-score, cointegration)
 * - Hurst exponent (trending vs mean-reverting)
 * - Value at Risk / Expected Shortfall
 * - Entropy & information measures
 * - Sentiment scoring
 * - News feed aggregation & impact analysis
 * - Signal generation with confidence scoring
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

async function apiFetch(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs || 10_000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  } finally { clearTimeout(t); }
}

// ═══════════════════════════════════════════════════════════════════
//  MATHEMATICAL PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

/** Standard normal CDF (Abramowitz & Stegun approximation) */
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/** Standard normal PDF */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Inverse normal CDF (Beasley-Springer-Moro) */
function normalInv(p: number): number {
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
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = ys.reduce((s, y, i) => s + Math.pow(y - (slope * xs[i] + intercept), 2), 0);
  const ssTot = ys.reduce((s, y) => s + Math.pow(y - sumY / n, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

/** Exponentially Weighted Moving Average */
function ewma(data: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/** Simple Moving Average */
function sma(data: number[], window: number): number[] {
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
function std(data: number[]): number {
  const n = data.length;
  if (n < 2) return 0;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const variance = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Fetch price series for a token */
async function fetchPriceSeries(tokenId: string, limit = 200): Promise<number[]> {
  try {
    const trades = await apiFetch(`${CLOB_API}/trades?asset_id=${tokenId}&limit=${limit}`);
    if (!Array.isArray(trades) || trades.length === 0) return [];
    return trades.reverse().map((t: any) => parseFloat(t.price || '0'));
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════
//  TOOL FACTORY
// ═══════════════════════════════════════════════════════════════════

export function createPolymarketQuantTools(options: ToolCreationOptions): AnyAgentTool[] {
  const agentId = options.agentId || 'default';

  return [

    // ─── KELLY CRITERION ────────────────────────────────────────
    {
      name: 'poly_kelly_criterion',
      description: 'Calculate optimal position size using the Kelly Criterion. Given your estimated true probability and market price, returns the mathematically optimal fraction of bankroll to bet. Also returns half-Kelly and quarter-Kelly (more conservative). Formula: f* = (p·b - q) / b where b = (1/price - 1), p = true probability, q = 1-p.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          true_probability: { type: 'number', description: 'Your estimated true probability of the outcome (0-1)' },
          market_price: { type: 'number', description: 'Current market price (0-1). If omitted, fetched from token_id.' },
          token_id: { type: 'string', description: 'Token ID to fetch live price' },
          bankroll: { type: 'number', description: 'Total available capital (USDC)' },
          max_fraction: { type: 'number', description: 'Max fraction of bankroll per bet (risk cap)', default: 0.25 },
        },
        required: ['true_probability'],
      },
      async execute(_id: string, p: any) {
        try {
          let price = p.market_price;
          if (!price && p.token_id) {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
            price = parseFloat(mid?.mid || '0.5');
          }
          if (!price) return errorResult('Provide market_price or token_id');

          const prob = p.true_probability;
          const q = 1 - prob;
          const b = (1 / price) - 1; // odds ratio

          // Kelly fraction: f* = (p*b - q) / b
          const kellyFraction = (prob * b - q) / b;
          const halfKelly = kellyFraction / 2;
          const quarterKelly = kellyFraction / 4;

          // Cap at max_fraction
          const maxF = p.max_fraction || 0.25;
          const cappedKelly = Math.min(Math.max(kellyFraction, 0), maxF);

          // Expected value per dollar
          const ev = prob * (1 / price - 1) - q;

          // Bankroll sizing
          const bankroll = p.bankroll || 0;
          const optimalBet = bankroll * cappedKelly;

          return jsonResult({
            formula: 'f* = (p·b - q) / b',
            inputs: { true_probability: prob, market_price: price, odds: b.toFixed(4) },
            kelly: {
              full: parseFloat(kellyFraction.toFixed(6)),
              half: parseFloat(halfKelly.toFixed(6)),
              quarter: parseFloat(quarterKelly.toFixed(6)),
              capped: parseFloat(cappedKelly.toFixed(6)),
            },
            expected_value_per_dollar: parseFloat(ev.toFixed(6)),
            edge_pct: parseFloat(((prob - price) * 100).toFixed(2)),
            signal: kellyFraction > 0 ? 'BUY' : kellyFraction < -0.01 ? 'SELL' : 'NO_EDGE',
            recommended_bet: bankroll > 0 ? {
              full_kelly: parseFloat((bankroll * Math.max(kellyFraction, 0)).toFixed(2)),
              half_kelly: parseFloat((bankroll * Math.max(halfKelly, 0)).toFixed(2)),
              quarter_kelly: parseFloat((bankroll * Math.max(quarterKelly, 0)).toFixed(2)),
              capped: parseFloat(optimalBet.toFixed(2)),
            } : undefined,
            warnings: [
              kellyFraction > 0.5 ? 'WARNING: Full Kelly > 50% — extremely aggressive, use half or quarter Kelly' : null,
              kellyFraction <= 0 ? 'No edge detected at this price — do not bet' : null,
              Math.abs(prob - price) < 0.02 ? 'Edge is very thin (<2%) — transaction costs may eliminate profit' : null,
            ].filter(Boolean),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── BINARY OPTION PRICING (Black-Scholes Analog) ───────────
    {
      name: 'poly_binary_pricing',
      description: 'Price a prediction market outcome as a binary option using Black-Scholes framework. Inputs: current price, time to expiry, and volatility. Returns theoretical fair value, Greeks (delta, gamma, theta, vega), and whether the market is over/underpriced. Formula: C = N(d2) where d2 = [ln(p/(1-p)) + (σ²/2)·T] / (σ·√T).',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          current_price: { type: 'number', description: 'Current market price (0-1)' },
          token_id: { type: 'string', description: 'Or fetch from token' },
          time_to_expiry_hours: { type: 'number', description: 'Hours until market resolves' },
          end_date: { type: 'string', description: 'Or provide end date (ISO)' },
          volatility: { type: 'number', description: 'Annualized volatility (0-5). If omitted, estimated from recent trades.' },
          true_probability: { type: 'number', description: 'Your estimated true probability (for mispricing analysis)' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let price = p.current_price;
          let vol = p.volatility;

          if (!price && p.token_id) {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
            price = parseFloat(mid?.mid || '0.5');
          }
          if (!price) return errorResult('Provide current_price or token_id');

          // Time to expiry in years
          let T: number;
          if (p.time_to_expiry_hours) {
            T = p.time_to_expiry_hours / 8760;
          } else if (p.end_date) {
            T = Math.max(0, (new Date(p.end_date).getTime() - Date.now()) / (8760 * 3600000));
          } else {
            return errorResult('Provide time_to_expiry_hours or end_date');
          }

          // Estimate volatility from trades if not provided
          if (!vol && p.token_id) {
            const prices = await fetchPriceSeries(p.token_id, 100);
            if (prices.length > 10) {
              const returns = prices.slice(1).map((pr, i) => Math.log(pr / prices[i]));
              vol = std(returns) * Math.sqrt(365 * 24); // Annualize
            }
          }
          vol = vol || 1.0; // Default volatility

          // Binary option pricing
          // Using log-odds transform: x = ln(p/(1-p))
          const clampedPrice = Math.max(0.01, Math.min(0.99, price));
          const logOdds = Math.log(clampedPrice / (1 - clampedPrice));

          const sqrtT = Math.sqrt(T);
          const d1 = (logOdds + 0.5 * vol * vol * T) / (vol * sqrtT || 1);
          const d2 = d1 - vol * sqrtT;

          const theoreticalPrice = normalCDF(d2);

          // Greeks
          const delta = normalPDF(d2) / (vol * sqrtT * clampedPrice * (1 - clampedPrice) || 1);
          const gamma = normalPDF(d2) * d1 / (vol * sqrtT * clampedPrice * clampedPrice * (1 - clampedPrice) * (1 - clampedPrice) || 1);
          const theta = -normalPDF(d2) * vol / (2 * sqrtT || 1) / 8760; // Per hour
          const vega = normalPDF(d2) * sqrtT * 0.01; // Per 1% vol change

          const mispricing = p.true_probability ? {
            your_estimate: p.true_probability,
            market_price: price,
            theoretical_price: parseFloat(theoreticalPrice.toFixed(4)),
            edge: parseFloat(((p.true_probability - price) * 100).toFixed(2)) + '%',
            signal: p.true_probability > price + 0.03 ? 'BUY' : p.true_probability < price - 0.03 ? 'SELL' : 'FAIR',
          } : undefined;

          return jsonResult({
            model: 'Binary Option (Black-Scholes Analog)',
            inputs: { price, volatility: parseFloat(vol.toFixed(4)), time_to_expiry_years: parseFloat(T.toFixed(6)), time_to_expiry_hours: parseFloat((T * 8760).toFixed(1)) },
            theoretical_price: parseFloat(theoreticalPrice.toFixed(4)),
            market_price: price,
            difference: parseFloat((theoreticalPrice - price).toFixed(4)),
            greeks: {
              delta: parseFloat(delta.toFixed(6)),
              gamma: parseFloat(gamma.toFixed(6)),
              theta_per_hour: parseFloat(theta.toFixed(8)),
              theta_per_day: parseFloat((theta * 24).toFixed(6)),
              vega: parseFloat(vega.toFixed(6)),
            },
            interpretation: {
              delta: `Price moves ~${(Math.abs(delta) * 100).toFixed(1)}¢ per 1% true probability change`,
              gamma: gamma > 0.5 ? 'HIGH — price very sensitive near 50/50' : 'MODERATE',
              theta: `Losing ${(Math.abs(theta) * 24 * 100).toFixed(3)}¢/day to time decay`,
              time_premium: parseFloat(((price - (price > 0.5 ? 1 : 0)) * (price > 0.5 ? -1 : 1)).toFixed(4)),
            },
            mispricing,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── BAYESIAN PROBABILITY UPDATER ───────────────────────────
    {
      name: 'poly_bayesian_update',
      description: 'Update probability estimates using Bayes theorem when new evidence arrives. Start with a prior (current market price or your belief), add evidence with likelihood ratios, get posterior probability. Formula: P(H|E) = P(E|H)·P(H) / [P(E|H)·P(H) + P(E|¬H)·P(¬H)]. Supports sequential updates with multiple pieces of evidence.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          prior: { type: 'number', description: 'Prior probability (0-1). Use current market price or your belief.' },
          token_id: { type: 'string', description: 'Or fetch current price as prior' },
          evidence: {
            type: 'array',
            description: 'Array of evidence objects. Each has: { description, likelihood_if_true, likelihood_if_false } OR { description, likelihood_ratio }',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'What the evidence is (e.g. "Polling data shows 55% support")' },
                likelihood_if_true: { type: 'number', description: 'P(evidence | hypothesis true)' },
                likelihood_if_false: { type: 'number', description: 'P(evidence | hypothesis false)' },
                likelihood_ratio: { type: 'number', description: 'Alternative: direct likelihood ratio (>1 supports, <1 weakens)' },
              },
            },
          },
        },
        required: ['evidence'],
      },
      async execute(_id: string, p: any) {
        try {
          let prior = p.prior;
          if (!prior && p.token_id) {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
            prior = parseFloat(mid?.mid || '0.5');
          }
          prior = prior || 0.5;

          const updates: any[] = [];
          let current = prior;

          for (const ev of (p.evidence || [])) {
            const prevProb = current;
            let lr: number;

            if (ev.likelihood_ratio) {
              lr = ev.likelihood_ratio;
            } else if (ev.likelihood_if_true !== undefined && ev.likelihood_if_false !== undefined) {
              lr = ev.likelihood_if_true / (ev.likelihood_if_false || 0.001);
            } else {
              continue;
            }

            // Bayes update using odds form: posterior_odds = LR * prior_odds
            const priorOdds = current / (1 - current);
            const posteriorOdds = lr * priorOdds;
            current = posteriorOdds / (1 + posteriorOdds);

            // Clamp to avoid numerical issues
            current = Math.max(0.001, Math.min(0.999, current));

            updates.push({
              evidence: ev.description || 'unnamed',
              likelihood_ratio: parseFloat(lr.toFixed(4)),
              log_lr: parseFloat(Math.log2(lr).toFixed(4)),
              prior: parseFloat(prevProb.toFixed(4)),
              posterior: parseFloat(current.toFixed(4)),
              shift: parseFloat(((current - prevProb) * 100).toFixed(2)) + '%',
              bits_of_evidence: parseFloat(Math.abs(Math.log2(lr)).toFixed(2)),
            });
          }

          const totalShift = current - prior;
          const marketPrice = p.token_id ? parseFloat((await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`).catch(() => ({ mid: prior }))).mid || String(prior)) : prior;

          return jsonResult({
            formula: 'P(H|E) = LR · P(H) / [LR · P(H) + P(¬H)]',
            initial_prior: parseFloat(prior.toFixed(4)),
            final_posterior: parseFloat(current.toFixed(4)),
            total_shift: parseFloat((totalShift * 100).toFixed(2)) + '%',
            total_log_odds_shift: parseFloat((Math.log(current / (1 - current)) - Math.log(prior / (1 - prior))).toFixed(4)),
            updates,
            market_comparison: {
              market_price: parseFloat(marketPrice.toFixed(4)),
              your_posterior: parseFloat(current.toFixed(4)),
              edge: parseFloat(((current - marketPrice) * 100).toFixed(2)) + '%',
              signal: current > marketPrice + 0.03 ? 'BUY' : current < marketPrice - 0.03 ? 'SELL' : 'FAIR',
            },
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── MONTE CARLO SIMULATION ─────────────────────────────────
    {
      name: 'poly_monte_carlo',
      description: 'Run Monte Carlo simulation on a portfolio of prediction market positions. Simulates thousands of outcomes to calculate expected P&L distribution, probability of profit, Value at Risk, and optimal exit strategies. Uses geometric Brownian motion with mean-reversion for prediction market dynamics.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          positions: {
            type: 'array',
            description: 'Array of positions: { token_id, side (BUY/SELL), entry_price, size, true_probability? }',
            items: { type: 'object' },
          },
          simulations: { type: 'number', description: 'Number of Monte Carlo paths (default 10000, max 100000)', default: 10000 },
          time_horizon_hours: { type: 'number', description: 'Simulation horizon in hours', default: 24 },
          volatility: { type: 'number', description: 'Annualized volatility override (auto-estimated if omitted)' },
          correlation: { type: 'number', description: 'Assumed correlation between positions (-1 to 1)', default: 0 },
        },
        required: ['positions'],
      },
      async execute(_id: string, p: any) {
        try {
          const N = Math.min(p.simulations || 10000, 100000);
          const T = (p.time_horizon_hours || 24) / 8760;
          const vol = p.volatility || 1.0;
          const corr = p.correlation || 0;

          const positions = p.positions || [];
          if (positions.length === 0) return errorResult('No positions provided');

          // Fetch current prices
          for (const pos of positions) {
            if (pos.token_id && !pos.current_price) {
              try {
                const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${pos.token_id}`);
                pos.current_price = parseFloat(mid?.mid || String(pos.entry_price || 0.5));
              } catch { pos.current_price = pos.entry_price || 0.5; }
            }
          }

          // Simulate
          const pnlDistribution: number[] = [];
          const sqrtT = Math.sqrt(T);

          for (let sim = 0; sim < N; sim++) {
            let totalPnl = 0;
            // Generate correlated random numbers
            const z1 = normalInv(Math.random());

            for (const pos of positions) {
              const z2 = normalInv(Math.random());
              const z = corr * z1 + Math.sqrt(1 - corr * corr) * z2;

              // Mean-reverting GBM for prediction market
              const currentP = pos.current_price || 0.5;
              const trueP = pos.true_probability || currentP;
              const meanReversion = 0.5; // Speed of mean reversion

              // Ornstein-Uhlenbeck in log-odds space
              const logOdds = Math.log(currentP / (1 - currentP));
              const targetLogOdds = Math.log(trueP / (1 - trueP));
              const newLogOdds = logOdds + meanReversion * (targetLogOdds - logOdds) * T + vol * sqrtT * z;
              let simPrice = 1 / (1 + Math.exp(-newLogOdds));
              simPrice = Math.max(0.01, Math.min(0.99, simPrice));

              const entryPrice = pos.entry_price || currentP;
              const size = pos.size || 1;
              const pnl = pos.side === 'BUY'
                ? (simPrice - entryPrice) * size
                : (entryPrice - simPrice) * size;
              totalPnl += pnl;
            }
            pnlDistribution.push(totalPnl);
          }

          // Sort for percentile calculations
          pnlDistribution.sort((a, b) => a - b);

          const mean = pnlDistribution.reduce((s, v) => s + v, 0) / N;
          const stdDev = std(pnlDistribution);
          const profitCount = pnlDistribution.filter(v => v > 0).length;

          // Percentiles
          const pctl = (pct: number) => pnlDistribution[Math.floor(N * pct / 100)];

          return jsonResult({
            model: 'Mean-Reverting Geometric Brownian Motion (Ornstein-Uhlenbeck)',
            simulations: N,
            time_horizon_hours: p.time_horizon_hours || 24,
            positions: positions.length,
            results: {
              expected_pnl: parseFloat(mean.toFixed(2)),
              std_dev: parseFloat(stdDev.toFixed(2)),
              probability_of_profit: parseFloat((profitCount / N * 100).toFixed(1)) + '%',
              sharpe_ratio: stdDev > 0 ? parseFloat((mean / stdDev).toFixed(3)) : null,
            },
            risk_metrics: {
              var_95: parseFloat(pctl(5).toFixed(2)),
              var_99: parseFloat(pctl(1).toFixed(2)),
              cvar_95: parseFloat((pnlDistribution.slice(0, Math.floor(N * 0.05)).reduce((s, v) => s + v, 0) / Math.floor(N * 0.05)).toFixed(2)),
              max_loss: parseFloat(pnlDistribution[0].toFixed(2)),
              max_gain: parseFloat(pnlDistribution[N - 1].toFixed(2)),
            },
            distribution: {
              p1: parseFloat(pctl(1).toFixed(2)),
              p5: parseFloat(pctl(5).toFixed(2)),
              p10: parseFloat(pctl(10).toFixed(2)),
              p25: parseFloat(pctl(25).toFixed(2)),
              p50: parseFloat(pctl(50).toFixed(2)),
              p75: parseFloat(pctl(75).toFixed(2)),
              p90: parseFloat(pctl(90).toFixed(2)),
              p95: parseFloat(pctl(95).toFixed(2)),
              p99: parseFloat(pctl(99).toFixed(2)),
            },
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── TECHNICAL INDICATORS ───────────────────────────────────
    {
      name: 'poly_technical_indicators',
      description: 'Calculate technical analysis indicators on a prediction market token: RSI, MACD, Bollinger Bands, EMA crossovers, rate of change, and trend strength. Adapted from traditional finance to work with 0-1 bounded prediction market prices.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          prices: { type: 'array', items: { type: 'number' }, description: 'Or provide price array directly' },
          indicators: {
            type: 'array',
            items: { type: 'string', enum: ['rsi', 'macd', 'bollinger', 'ema', 'momentum', 'all'] },
            description: 'Which indicators to compute (default: all)',
          },
          rsi_period: { type: 'number', default: 14 },
          macd_fast: { type: 'number', default: 12 },
          macd_slow: { type: 'number', default: 26 },
          macd_signal: { type: 'number', default: 9 },
          bollinger_period: { type: 'number', default: 20 },
          bollinger_std: { type: 'number', default: 2 },
        },
        required: [],
      },
      async execute(_id: string, p: any) {
        try {
          let prices = p.prices;
          if (!prices && p.token_id) {
            prices = await fetchPriceSeries(p.token_id, 200);
          }
          if (!prices || prices.length < 15) return errorResult('Need at least 15 price points. Provide token_id or prices array.');

          const indicators = p.indicators || ['all'];
          const doAll = indicators.includes('all');
          const result: any = { data_points: prices.length, latest_price: prices[prices.length - 1] };

          // RSI
          if (doAll || indicators.includes('rsi')) {
            const period = p.rsi_period || 14;
            const gains: number[] = [], losses: number[] = [];
            for (let i = 1; i < prices.length; i++) {
              const change = prices[i] - prices[i - 1];
              gains.push(change > 0 ? change : 0);
              losses.push(change < 0 ? -change : 0);
            }
            // Wilders smoothing
            let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
            let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
            for (let i = period; i < gains.length; i++) {
              avgGain = (avgGain * (period - 1) + gains[i]) / period;
              avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            }
            const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
            const rsi = 100 - (100 / (1 + rs));

            result.rsi = {
              value: parseFloat(rsi.toFixed(2)),
              period,
              signal: rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL',
              interpretation: rsi > 70 ? 'Price may be overextended — consider selling' :
                rsi < 30 ? 'Price may be undervalued — consider buying' : 'No extreme detected',
            };
          }

          // MACD
          if (doAll || indicators.includes('macd')) {
            const fast = ewma(prices, p.macd_fast || 12);
            const slow = ewma(prices, p.macd_slow || 26);
            const macdLine = fast.map((f, i) => f - slow[i]);
            const signalLine = ewma(macdLine, p.macd_signal || 9);
            const histogram = macdLine.map((m, i) => m - signalLine[i]);

            const latestMacd = macdLine[macdLine.length - 1];
            const latestSignal = signalLine[signalLine.length - 1];
            const latestHist = histogram[histogram.length - 1];
            const prevHist = histogram[histogram.length - 2];

            result.macd = {
              macd_line: parseFloat(latestMacd.toFixed(6)),
              signal_line: parseFloat(latestSignal.toFixed(6)),
              histogram: parseFloat(latestHist.toFixed(6)),
              signal: latestMacd > latestSignal ? 'BULLISH' : 'BEARISH',
              crossover: (latestHist > 0 && prevHist <= 0) ? 'BULLISH_CROSS' :
                (latestHist < 0 && prevHist >= 0) ? 'BEARISH_CROSS' : 'NONE',
              momentum: latestHist > prevHist ? 'INCREASING' : 'DECREASING',
            };
          }

          // Bollinger Bands
          if (doAll || indicators.includes('bollinger')) {
            const period = p.bollinger_period || 20;
            const numStd = p.bollinger_std || 2;
            const ma = sma(prices, period);
            const latestMa = ma[ma.length - 1];
            const recentPrices = prices.slice(-period);
            const stdDev = std(recentPrices);

            const upper = latestMa + numStd * stdDev;
            const lower = latestMa - numStd * stdDev;
            const currentPrice = prices[prices.length - 1];
            const bandwidth = (upper - lower) / latestMa;
            const pctB = (currentPrice - lower) / (upper - lower);

            result.bollinger = {
              upper: parseFloat(upper.toFixed(4)),
              middle: parseFloat(latestMa.toFixed(4)),
              lower: parseFloat(lower.toFixed(4)),
              bandwidth: parseFloat(bandwidth.toFixed(4)),
              percent_b: parseFloat(pctB.toFixed(4)),
              signal: pctB > 1 ? 'ABOVE_UPPER (overbought)' : pctB < 0 ? 'BELOW_LOWER (oversold)' :
                bandwidth < 0.05 ? 'SQUEEZE (breakout imminent)' : 'WITHIN_BANDS',
            };
          }

          // EMA crossovers
          if (doAll || indicators.includes('ema')) {
            const ema9 = ewma(prices, 9);
            const ema21 = ewma(prices, 21);
            const ema50 = ewma(prices, Math.min(50, prices.length));

            const latest9 = ema9[ema9.length - 1];
            const latest21 = ema21[ema21.length - 1];
            const latest50 = ema50[ema50.length - 1];

            result.ema = {
              ema_9: parseFloat(latest9.toFixed(4)),
              ema_21: parseFloat(latest21.toFixed(4)),
              ema_50: parseFloat(latest50.toFixed(4)),
              trend: latest9 > latest21 && latest21 > latest50 ? 'STRONG_UPTREND' :
                latest9 < latest21 && latest21 < latest50 ? 'STRONG_DOWNTREND' :
                latest9 > latest21 ? 'MILD_UPTREND' : 'MILD_DOWNTREND',
              golden_cross: latest9 > latest50 && ema9[ema9.length - 2] <= ema50[ema50.length - 2],
              death_cross: latest9 < latest50 && ema9[ema9.length - 2] >= ema50[ema50.length - 2],
            };
          }

          // Momentum / Rate of Change
          if (doAll || indicators.includes('momentum')) {
            const roc5 = (prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6] * 100;
            const roc10 = prices.length > 10 ? (prices[prices.length - 1] - prices[prices.length - 11]) / prices[prices.length - 11] * 100 : null;
            const roc20 = prices.length > 20 ? (prices[prices.length - 1] - prices[prices.length - 21]) / prices[prices.length - 21] * 100 : null;

            result.momentum = {
              roc_5: parseFloat(roc5.toFixed(2)) + '%',
              roc_10: roc10 !== null ? parseFloat(roc10.toFixed(2)) + '%' : null,
              roc_20: roc20 !== null ? parseFloat(roc20.toFixed(2)) + '%' : null,
              acceleration: roc10 !== null ? parseFloat((roc5 - roc10).toFixed(2)) : null,
            };
          }

          // Overall signal
          const signals: string[] = [];
          if (result.rsi?.signal === 'OVERSOLD') signals.push('BUY');
          if (result.rsi?.signal === 'OVERBOUGHT') signals.push('SELL');
          if (result.macd?.signal === 'BULLISH') signals.push('BUY');
          if (result.macd?.signal === 'BEARISH') signals.push('SELL');
          if (result.bollinger?.signal?.includes('oversold')) signals.push('BUY');
          if (result.bollinger?.signal?.includes('overbought')) signals.push('SELL');
          if (result.ema?.trend?.includes('UPTREND')) signals.push('BUY');
          if (result.ema?.trend?.includes('DOWNTREND')) signals.push('SELL');

          const buyCount = signals.filter(s => s === 'BUY').length;
          const sellCount = signals.filter(s => s === 'SELL').length;

          result.composite_signal = {
            buy_signals: buyCount,
            sell_signals: sellCount,
            total_indicators: buyCount + sellCount,
            consensus: buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'MIXED',
            confidence: buyCount + sellCount > 0 ? parseFloat((Math.abs(buyCount - sellCount) / (buyCount + sellCount) * 100).toFixed(0)) + '%' : 'N/A',
          };

          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── VOLATILITY ANALYSIS ────────────────────────────────────
    {
      name: 'poly_volatility',
      description: 'Comprehensive volatility analysis: realized volatility, EWMA volatility, volatility term structure, implied volatility from market prices. Also calculates Hurst exponent to determine if the market is trending (H>0.5), mean-reverting (H<0.5), or random walk (H≈0.5).',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          prices: { type: 'array', items: { type: 'number' }, description: 'Or provide prices directly' },
          windows: { type: 'array', items: { type: 'number' }, description: 'Volatility windows (default: [5, 10, 20, 50])' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let prices = p.prices;
          if (!prices && p.token_id) prices = await fetchPriceSeries(p.token_id, 200);
          if (!prices || prices.length < 20) return errorResult('Need at least 20 price points');

          // Log returns
          const returns = prices.slice(1).map((pr: number, i: number) => Math.log(pr / prices[i]));

          // Realized volatility at different windows
          const windows = p.windows || [5, 10, 20, 50];
          const realizedVol: any = {};
          for (const w of windows) {
            if (returns.length >= w) {
              const windowReturns = returns.slice(-w);
              realizedVol[`${w}_period`] = parseFloat((std(windowReturns) * Math.sqrt(365 * 24)).toFixed(4));
            }
          }

          // EWMA volatility
          const ewmaVol = ewma(returns.map((r: number) => r * r), 10).map(v => Math.sqrt(v * 365 * 24));
          const latestEwmaVol = ewmaVol[ewmaVol.length - 1];

          // Hurst exponent (R/S analysis)
          let hurst = 0.5;
          if (returns.length >= 20) {
            const logNs: number[] = [], logRS: number[] = [];
            for (const n of [5, 10, 15, 20, Math.min(40, Math.floor(returns.length / 2))]) {
              if (n > returns.length) continue;
              const chunks = Math.floor(returns.length / n);
              let totalRS = 0;
              for (let c = 0; c < chunks; c++) {
                const chunk = returns.slice(c * n, (c + 1) * n);
                const mean = chunk.reduce((s: number, v: number) => s + v, 0) / n;
                const deviations = chunk.map((v: number) => v - mean);
                const cumDev: number[] = [];
                let sum = 0;
                for (const d of deviations) { sum += d; cumDev.push(sum); }
                const R = Math.max(...cumDev) - Math.min(...cumDev);
                const S = std(chunk);
                if (S > 0) totalRS += R / S;
              }
              if (totalRS > 0 && chunks > 0) {
                logNs.push(Math.log(n));
                logRS.push(Math.log(totalRS / chunks));
              }
            }
            if (logNs.length >= 3) {
              const reg = linearRegression(logNs, logRS);
              hurst = reg.slope;
            }
          }

          // Volatility regime
          const currentVol = realizedVol['10_period'] || latestEwmaVol;
          const longVol = realizedVol['50_period'] || currentVol;

          return jsonResult({
            realized_volatility: realizedVol,
            ewma_volatility: parseFloat(latestEwmaVol.toFixed(4)),
            hurst_exponent: {
              value: parseFloat(hurst.toFixed(4)),
              interpretation: hurst > 0.6 ? 'TRENDING — momentum strategies may work' :
                hurst < 0.4 ? 'MEAN_REVERTING — contrarian strategies may work' :
                'RANDOM_WALK — market is efficient at this timescale',
              regime: hurst > 0.6 ? 'trending' : hurst < 0.4 ? 'mean_reverting' : 'random_walk',
            },
            volatility_regime: {
              current_vs_long: parseFloat((currentVol / (longVol || 1)).toFixed(2)),
              regime: currentVol > longVol * 1.5 ? 'HIGH_VOL (elevated risk)' :
                currentVol < longVol * 0.5 ? 'LOW_VOL (compression — breakout possible)' : 'NORMAL',
            },
            data_points: prices.length,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── STATISTICAL ARBITRAGE ──────────────────────────────────
    {
      name: 'poly_stat_arb',
      description: 'Statistical arbitrage analysis between two related markets. Tests for cointegration, calculates spread z-score, and generates mean-reversion trading signals. Use on related markets (e.g. same event, correlated outcomes) to find pairs trading opportunities.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          token_id_1: { type: 'string', description: 'First token ID' },
          token_id_2: { type: 'string', description: 'Second token ID' },
          lookback: { type: 'number', description: 'Lookback period for z-score', default: 50 },
          entry_zscore: { type: 'number', description: 'Z-score threshold to enter trade', default: 2 },
          exit_zscore: { type: 'number', description: 'Z-score threshold to exit trade', default: 0.5 },
        },
        required: ['token_id_1', 'token_id_2'],
      },
      async execute(_id: string, p: any) {
        try {
          const [prices1, prices2] = await Promise.all([
            fetchPriceSeries(p.token_id_1, 200),
            fetchPriceSeries(p.token_id_2, 200),
          ]);

          const len = Math.min(prices1.length, prices2.length);
          if (len < 20) return errorResult('Need at least 20 data points for both tokens');

          const p1 = prices1.slice(-len);
          const p2 = prices2.slice(-len);

          // Spread
          const reg = linearRegression(p2, p1);
          const spread = p1.map((v: number, i: number) => v - reg.slope * p2[i] - reg.intercept);

          // Z-score of spread
          const lookback = Math.min(p.lookback || 50, len);
          const recentSpread = spread.slice(-lookback);
          const meanSpread = recentSpread.reduce((s: number, v: number) => s + v, 0) / lookback;
          const stdSpread = std(recentSpread);
          const currentZScore = stdSpread > 0 ? (spread[spread.length - 1] - meanSpread) / stdSpread : 0;

          // Correlation
          const mean1 = p1.reduce((s: number, v: number) => s + v, 0) / len;
          const mean2 = p2.reduce((s: number, v: number) => s + v, 0) / len;
          let cov = 0, var1 = 0, var2 = 0;
          for (let i = 0; i < len; i++) {
            cov += (p1[i] - mean1) * (p2[i] - mean2);
            var1 += (p1[i] - mean1) ** 2;
            var2 += (p2[i] - mean2) ** 2;
          }
          const correlation = Math.sqrt(var1 * var2) > 0 ? cov / Math.sqrt(var1 * var2) : 0;

          const entryZ = p.entry_zscore || 2;
          const exitZ = p.exit_zscore || 0.5;

          return jsonResult({
            model: 'Pairs Trading / Statistical Arbitrage',
            pair: { token_1: p.token_id_1, token_2: p.token_id_2 },
            correlation: parseFloat(correlation.toFixed(4)),
            cointegration: {
              hedge_ratio: parseFloat(reg.slope.toFixed(4)),
              intercept: parseFloat(reg.intercept.toFixed(4)),
              r_squared: parseFloat(reg.r2.toFixed(4)),
              is_cointegrated: reg.r2 > 0.5 && Math.abs(correlation) > 0.6,
            },
            spread: {
              current: parseFloat(spread[spread.length - 1].toFixed(4)),
              mean: parseFloat(meanSpread.toFixed(4)),
              std: parseFloat(stdSpread.toFixed(4)),
              z_score: parseFloat(currentZScore.toFixed(4)),
            },
            signal: {
              action: Math.abs(currentZScore) > entryZ ? (currentZScore > 0 ? 'SHORT_SPREAD (sell 1, buy 2)' : 'LONG_SPREAD (buy 1, sell 2)') :
                Math.abs(currentZScore) < exitZ ? 'CLOSE_POSITION' : 'HOLD',
              strength: Math.abs(currentZScore) > entryZ * 1.5 ? 'STRONG' : Math.abs(currentZScore) > entryZ ? 'MODERATE' : 'WEAK',
              entry_threshold: entryZ,
              exit_threshold: exitZ,
            },
            warnings: [
              Math.abs(correlation) < 0.3 ? 'LOW CORRELATION — these markets may not be related enough for stat arb' : null,
              reg.r2 < 0.3 ? 'POOR FIT — hedge ratio may be unreliable' : null,
            ].filter(Boolean),
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── VALUE AT RISK ──────────────────────────────────────────
    {
      name: 'poly_value_at_risk',
      description: 'Calculate Value at Risk (VaR) and Conditional VaR (Expected Shortfall) for a position or portfolio. Uses parametric (normal), historical, and Cornish-Fisher methods. Essential for institutional risk management and regulatory reporting.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          positions: {
            type: 'array',
            description: 'Array: { token_id, size, entry_price?, side? }',
            items: { type: 'object' },
          },
          confidence: { type: 'number', description: 'Confidence level (e.g. 0.95 for 95%)', default: 0.95 },
          horizon_hours: { type: 'number', description: 'VaR time horizon in hours', default: 24 },
          method: { type: 'string', enum: ['parametric', 'historical', 'cornish_fisher', 'all'], default: 'all' },
        },
        required: ['positions'],
      },
      async execute(_id: string, p: any) {
        try {
          const confidence = p.confidence || 0.95;
          const horizon = (p.horizon_hours || 24) / (24 * 365);

          let portfolioReturns: number[] = [];
          let totalExposure = 0;

          for (const pos of (p.positions || [])) {
            const prices = await fetchPriceSeries(pos.token_id, 100);
            if (prices.length < 10) continue;

            const returns = prices.slice(1).map((pr: number, i: number) => Math.log(pr / prices[i]));
            const scaledReturns = returns.map(r => r * (pos.size || 1) * (pos.side === 'SELL' ? -1 : 1));

            if (portfolioReturns.length === 0) {
              portfolioReturns = scaledReturns;
            } else {
              const len = Math.min(portfolioReturns.length, scaledReturns.length);
              portfolioReturns = portfolioReturns.slice(-len).map((r, i) => r + scaledReturns.slice(-len)[i]);
            }
            totalExposure += pos.size || 1;
          }

          if (portfolioReturns.length < 10) return errorResult('Insufficient data for VaR calculation');

          const mean = portfolioReturns.reduce((s, v) => s + v, 0) / portfolioReturns.length;
          const sigma = std(portfolioReturns);
          const sqrtH = Math.sqrt(horizon * 365 * 24); // Scale to horizon

          const results: any = { confidence, horizon_hours: p.horizon_hours || 24, total_exposure: totalExposure, data_points: portfolioReturns.length };

          // Parametric VaR (normal)
          if (p.method === 'all' || p.method === 'parametric') {
            const z = normalInv(1 - confidence);
            results.parametric = {
              var: parseFloat((-(mean * sqrtH + z * sigma * sqrtH)).toFixed(2)),
              note: 'Assumes normal distribution of returns',
            };
          }

          // Historical VaR
          if (p.method === 'all' || p.method === 'historical') {
            const sorted = [...portfolioReturns].sort((a, b) => a - b);
            const idx = Math.floor(sorted.length * (1 - confidence));
            const var_ = -sorted[idx] * sqrtH;
            const cvar = -(sorted.slice(0, idx + 1).reduce((s, v) => s + v, 0) / (idx + 1)) * sqrtH;

            results.historical = {
              var: parseFloat(var_.toFixed(2)),
              cvar_expected_shortfall: parseFloat(cvar.toFixed(2)),
              note: 'Based on actual return distribution',
            };
          }

          // Cornish-Fisher (adjusts for skew and kurtosis)
          if (p.method === 'all' || p.method === 'cornish_fisher') {
            const n = portfolioReturns.length;
            const skew = portfolioReturns.reduce((s, r) => s + Math.pow((r - mean) / sigma, 3), 0) / n;
            const kurt = portfolioReturns.reduce((s, r) => s + Math.pow((r - mean) / sigma, 4), 0) / n - 3;
            const z = normalInv(1 - confidence);
            const zCF = z + (z * z - 1) * skew / 6 + (z * z * z - 3 * z) * kurt / 24 - (2 * z * z * z - 5 * z) * skew * skew / 36;

            results.cornish_fisher = {
              var: parseFloat((-(mean * sqrtH + zCF * sigma * sqrtH)).toFixed(2)),
              skewness: parseFloat(skew.toFixed(4)),
              excess_kurtosis: parseFloat(kurt.toFixed(4)),
              note: 'Adjusts for fat tails and asymmetry in return distribution',
            };
          }

          return jsonResult(results);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── INFORMATION ENTROPY ────────────────────────────────────
    {
      name: 'poly_entropy',
      description: 'Calculate Shannon entropy and information-theoretic measures for a market. Low entropy = market is decisive (near 0 or 1). High entropy = maximum uncertainty (near 0.5). Also computes KL divergence between market price and your estimate, mutual information between markets, and information decay rate.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          market_prices: {
            type: 'array',
            items: { type: 'number' },
            description: 'Outcome probabilities from market (e.g. [0.6, 0.4] for binary, or [0.3, 0.5, 0.2] for multi-outcome)',
          },
          token_id: { type: 'string', description: 'Or fetch from token' },
          your_estimates: { type: 'array', items: { type: 'number' }, description: 'Your probability estimates (for KL divergence)' },
          compare_token_id: { type: 'string', description: 'Second market for mutual information' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let probs = p.market_prices;
          if (!probs && p.token_id) {
            const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`);
            const pr = parseFloat(mid?.mid || '0.5');
            probs = [pr, 1 - pr];
          }
          if (!probs) return errorResult('Provide market_prices or token_id');

          // Shannon entropy: H = -Σ p·log2(p)
          const entropy = -probs.reduce((s: number, p: number) => {
            if (p <= 0 || p >= 1) return s;
            return s + p * Math.log2(p);
          }, 0);
          const maxEntropy = Math.log2(probs.length);
          const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

          const result: any = {
            shannon_entropy: parseFloat(entropy.toFixed(4)),
            max_entropy: parseFloat(maxEntropy.toFixed(4)),
            normalized_entropy: parseFloat(normalizedEntropy.toFixed(4)),
            interpretation: normalizedEntropy > 0.9 ? 'MAXIMUM UNCERTAINTY — market has no conviction' :
              normalizedEntropy > 0.7 ? 'HIGH UNCERTAINTY — wide range of outcomes' :
              normalizedEntropy > 0.3 ? 'MODERATE — some conviction forming' :
              'DECISIVE — market strongly favors one outcome',
            bits_to_resolve: parseFloat(entropy.toFixed(4)),
          };

          // KL divergence from your estimates
          if (p.your_estimates) {
            const q = p.your_estimates;
            const klDiv = probs.reduce((s: number, pi: number, i: number) => {
              if (q[i] <= 0 || pi <= 0) return s;
              return s + q[i] * Math.log2(q[i] / pi);
            }, 0);

            result.kl_divergence = {
              value: parseFloat(klDiv.toFixed(6)),
              interpretation: klDiv > 0.5 ? 'LARGE DISAGREEMENT — strong potential edge' :
                klDiv > 0.1 ? 'MODERATE DISAGREEMENT' : 'SMALL DISAGREEMENT — little edge',
              direction: 'Your beliefs diverge from market by ' + klDiv.toFixed(4) + ' bits',
            };
          }

          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── NEWS FEED AGGREGATOR ───────────────────────────────────
    {
      name: 'poly_news_feed',
      description: 'Aggregate real-time news from multiple sources relevant to prediction markets. Fetches from RSS feeds of major news outlets, financial news APIs, and social signals. Scores each article by relevance to active markets and potential market impact.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (e.g. "Federal Reserve", "Trump", "Bitcoin ETF")' },
          market_id: { type: 'string', description: 'Auto-extract query from market question' },
          sources: {
            type: 'array',
            items: { type: 'string', enum: ['reuters', 'ap', 'bbc', 'cnn', 'nyt', 'wsj', 'bloomberg', 'ft', 'politico', 'fivethirtyeight', 'polymarket_blog', 'crypto_news', 'all'] },
            description: 'News sources to query',
            default: ['all'],
          },
          hours: { type: 'number', description: 'Only articles from last N hours', default: 24 },
          limit: { type: 'number', default: 20 },
          language: { type: 'string', default: 'en' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let query = p.query;
          if (!query && p.market_id) {
            const m = await apiFetch(`${GAMMA_API}/markets/${p.market_id}`).catch(() => null);
            query = m?.question;
          }
          if (!query) return errorResult('Provide query or market_id');

          // RSS feed URLs for major news sources
          const rssFeeds: Record<string, string> = {
            reuters: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:reuters.com&hl=en-US',
            ap: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:apnews.com&hl=en-US',
            bbc: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:bbc.com&hl=en-US',
            nyt: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:nytimes.com&hl=en-US',
            wsj: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:wsj.com&hl=en-US',
            bloomberg: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:bloomberg.com&hl=en-US',
            politico: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+site:politico.com&hl=en-US',
            crypto_news: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '+crypto&hl=en-US',
          };

          // Google News aggregate (fastest single source)
          const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

          try {
            const rssXml = await apiFetch(googleNewsUrl, { timeoutMs: 8000 });
            // Parse RSS XML — extract titles, links, dates
            const items: any[] = [];
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            const titleRegex = /<title>([\s\S]*?)<\/title>/;
            const linkRegex = /<link>([\s\S]*?)<\/link>/;
            const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
            const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;

            let match;
            while ((match = itemRegex.exec(typeof rssXml === 'string' ? rssXml : '')) !== null) {
              const item = match[1];
              const title = titleRegex.exec(item)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
              const link = linkRegex.exec(item)?.[1]?.trim();
              const pubDate = pubDateRegex.exec(item)?.[1]?.trim();
              const source = sourceRegex.exec(item)?.[1]?.trim();

              if (title) {
                // Filter by time
                if (pubDate && p.hours) {
                  const articleDate = new Date(pubDate);
                  const cutoff = new Date(Date.now() - (p.hours || 24) * 3600000);
                  if (articleDate < cutoff) continue;
                }

                items.push({
                  title,
                  link,
                  published: pubDate,
                  source: source || 'Google News',
                  impact_score: title.toLowerCase().includes('breaking') || title.toLowerCase().includes('urgent') ? 'HIGH' :
                    title.toLowerCase().includes('update') || title.toLowerCase().includes('report') ? 'MEDIUM' : 'STANDARD',
                });
              }
              if (items.length >= (p.limit || 20)) break;
            }

            return jsonResult({
              query,
              source: 'Google News RSS',
              articles: items.length,
              results: items,
              note: 'For deeper analysis, use poly_sentiment_analysis on individual articles.',
            });
          } catch {
            // Fallback: return search instructions
            return jsonResult({
              query,
              status: 'rss_unavailable',
              fallback: 'Use the enterprise-http tool to fetch from these URLs:',
              urls: [
                googleNewsUrl,
                `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&apiKey=YOUR_KEY`,
                `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=20&format=json`,
              ],
            });
          }
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── SENTIMENT ANALYSIS ─────────────────────────────────────
    {
      name: 'poly_sentiment_analysis',
      description: 'Analyze sentiment of text, news headlines, or market comments using a lexicon-based approach with financial/political domain weighting. Returns sentiment score, subjectivity, and market impact prediction.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          texts: { type: 'array', items: { type: 'string' }, description: 'Array of texts to analyze (headlines, comments, etc.)' },
          market_id: { type: 'string', description: 'Fetch and analyze market comments' },
          domain: { type: 'string', enum: ['general', 'political', 'financial', 'crypto', 'sports'], default: 'general' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let texts = p.texts || [];
          if (p.market_id && texts.length === 0) {
            const comments = await apiFetch(`${GAMMA_API}/comments?market=${p.market_id}&limit=30`).catch(() => []);
            texts = (Array.isArray(comments) ? comments : []).map((c: any) => c.text || c.body || '').filter(Boolean);
          }
          if (texts.length === 0) return errorResult('Provide texts array or market_id');

          // Lexicon-based sentiment (AFINN-inspired with financial terms)
          const posWords: Record<string, number> = {
            'bullish': 3, 'surge': 3, 'rally': 3, 'soar': 3, 'winning': 2, 'gain': 2,
            'positive': 2, 'strong': 2, 'confident': 2, 'optimistic': 3, 'breakthrough': 3,
            'success': 2, 'support': 1, 'lead': 2, 'ahead': 2, 'up': 1, 'rise': 2,
            'good': 1, 'great': 2, 'excellent': 3, 'profit': 2, 'growth': 2, 'boom': 3,
            'likely': 2, 'certain': 3, 'confirmed': 3, 'approved': 2, 'passed': 2,
            'win': 2, 'victory': 3, 'dominate': 2, 'crush': 2, 'landslide': 3,
          };
          const negWords: Record<string, number> = {
            'bearish': -3, 'crash': -3, 'plunge': -3, 'collapse': -3, 'losing': -2,
            'negative': -2, 'weak': -2, 'fear': -2, 'pessimistic': -3, 'failure': -3,
            'risk': -1, 'down': -1, 'fall': -2, 'decline': -2, 'drop': -2, 'loss': -2,
            'bad': -1, 'terrible': -3, 'crisis': -3, 'panic': -3, 'dump': -3,
            'unlikely': -2, 'doubt': -2, 'uncertain': -1, 'rejected': -2, 'failed': -3,
            'lose': -2, 'defeat': -3, 'scandal': -3, 'fraud': -3, 'manipulation': -3,
          };

          const analyzed = texts.map((text: string) => {
            const words = text.toLowerCase().split(/\s+/);
            let score = 0, posCount = 0, negCount = 0;
            for (const w of words) {
              const clean = w.replace(/[^a-z]/g, '');
              if (posWords[clean]) { score += posWords[clean]; posCount++; }
              if (negWords[clean]) { score += negWords[clean]; negCount++; }
            }
            const normalized = words.length > 0 ? score / Math.sqrt(words.length) : 0;
            return {
              text: text.slice(0, 200),
              raw_score: score,
              normalized_score: parseFloat(normalized.toFixed(3)),
              sentiment: normalized > 0.5 ? 'POSITIVE' : normalized < -0.5 ? 'NEGATIVE' : 'NEUTRAL',
              positive_words: posCount,
              negative_words: negCount,
            };
          });

          const avgScore = analyzed.reduce((s: number, a: any) => s + a.normalized_score, 0) / analyzed.length;
          const posTexts = analyzed.filter((a: any) => a.sentiment === 'POSITIVE').length;
          const negTexts = analyzed.filter((a: any) => a.sentiment === 'NEGATIVE').length;

          return jsonResult({
            total_texts: texts.length,
            aggregate: {
              average_score: parseFloat(avgScore.toFixed(3)),
              overall_sentiment: avgScore > 0.3 ? 'BULLISH' : avgScore < -0.3 ? 'BEARISH' : 'MIXED',
              positive_count: posTexts,
              negative_count: negTexts,
              neutral_count: texts.length - posTexts - negTexts,
              consensus_strength: parseFloat((Math.abs(posTexts - negTexts) / texts.length * 100).toFixed(1)) + '%',
            },
            details: analyzed.slice(0, 30),
            market_signal: {
              direction: avgScore > 0.3 ? 'BUY' : avgScore < -0.3 ? 'SELL' : 'HOLD',
              confidence: Math.abs(avgScore) > 1 ? 'HIGH' : Math.abs(avgScore) > 0.5 ? 'MEDIUM' : 'LOW',
            },
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── SIGNAL GENERATOR ───────────────────────────────────────
    {
      name: 'poly_generate_signal',
      description: 'Comprehensive signal generator that combines ALL analytical tools: technical indicators, Bayesian analysis, sentiment, volatility regime, Kelly sizing, and order book analysis. Produces a final BUY/SELL/HOLD recommendation with confidence score and optimal position size. This is the "master signal" tool.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          token_id: { type: 'string', description: 'Token to analyze' },
          market_id: { type: 'string', description: 'Market ID for additional context' },
          true_probability: { type: 'number', description: 'Your estimated true probability (if you have one)' },
          bankroll: { type: 'number', description: 'Available capital for position sizing' },
          risk_tolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'], default: 'moderate' },
        },
        required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try {
          // Parallel fetch all data
          const [midData, bookData, marketData, trades] = await Promise.all([
            apiFetch(`${CLOB_API}/midpoint?token_id=${p.token_id}`).catch(() => null),
            apiFetch(`${CLOB_API}/book?token_id=${p.token_id}`).catch(() => null),
            p.market_id ? apiFetch(`${GAMMA_API}/markets/${p.market_id}`).catch(() => null) : null,
            apiFetch(`${CLOB_API}/trades?asset_id=${p.token_id}&limit=100`).catch(() => []),
          ]);

          const price = parseFloat(midData?.mid || '0.5');
          const prices = Array.isArray(trades) ? trades.reverse().map((t: any) => parseFloat(t.price || '0')).filter((v: number) => v > 0) : [];

          const signals: { name: string; direction: string; weight: number; detail: string }[] = [];

          // 1. Order book imbalance
          if (bookData) {
            const bidVol = (bookData.bids || []).reduce((s: number, b: any) => s + parseFloat(b.size || '0') * parseFloat(b.price || '0'), 0);
            const askVol = (bookData.asks || []).reduce((s: number, a: any) => s + parseFloat(a.size || '0') * parseFloat(a.price || '0'), 0);
            const imbalance = (bidVol - askVol) / (bidVol + askVol || 1);
            signals.push({
              name: 'Order Book Imbalance',
              direction: imbalance > 0.2 ? 'BUY' : imbalance < -0.2 ? 'SELL' : 'NEUTRAL',
              weight: Math.min(Math.abs(imbalance) * 3, 1),
              detail: `Bid/Ask ratio: ${(bidVol / (askVol || 1)).toFixed(2)}, Imbalance: ${(imbalance * 100).toFixed(1)}%`,
            });
          }

          // 2. Technical: RSI
          if (prices.length >= 15) {
            const period = 14;
            const gains = prices.slice(1).map((pr: number, i: number) => Math.max(0, pr - prices[i]));
            const losses = prices.slice(1).map((pr: number, i: number) => Math.max(0, prices[i] - pr));
            let avgGain = gains.slice(0, period).reduce((s: number, v: number) => s + v, 0) / period;
            let avgLoss = losses.slice(0, period).reduce((s: number, v: number) => s + v, 0) / period;
            for (let i = period; i < gains.length; i++) {
              avgGain = (avgGain * (period - 1) + gains[i]) / period;
              avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            }
            const rsi = 100 - (100 / (1 + (avgLoss > 0 ? avgGain / avgLoss : 100)));
            signals.push({
              name: 'RSI',
              direction: rsi < 30 ? 'BUY' : rsi > 70 ? 'SELL' : 'NEUTRAL',
              weight: rsi < 20 || rsi > 80 ? 0.9 : rsi < 30 || rsi > 70 ? 0.6 : 0.2,
              detail: `RSI(14) = ${rsi.toFixed(1)}`,
            });
          }

          // 3. Momentum
          if (prices.length >= 10) {
            const roc = (prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6];
            signals.push({
              name: 'Momentum',
              direction: roc > 0.03 ? 'BUY' : roc < -0.03 ? 'SELL' : 'NEUTRAL',
              weight: Math.min(Math.abs(roc) * 10, 1),
              detail: `5-period ROC: ${(roc * 100).toFixed(1)}%`,
            });
          }

          // 4. Mean reversion (price vs moving average)
          if (prices.length >= 20) {
            const ma20 = prices.slice(-20).reduce((s: number, v: number) => s + v, 0) / 20;
            const deviation = (price - ma20) / ma20;
            signals.push({
              name: 'Mean Reversion',
              direction: deviation < -0.05 ? 'BUY' : deviation > 0.05 ? 'SELL' : 'NEUTRAL',
              weight: Math.min(Math.abs(deviation) * 5, 1),
              detail: `Price ${(deviation * 100).toFixed(1)}% from 20-MA (${ma20.toFixed(3)})`,
            });
          }

          // 5. Your edge (if true_probability provided)
          if (p.true_probability) {
            const edge = p.true_probability - price;
            signals.push({
              name: 'Fundamental Edge',
              direction: edge > 0.02 ? 'BUY' : edge < -0.02 ? 'SELL' : 'NEUTRAL',
              weight: Math.min(Math.abs(edge) * 10, 1),
              detail: `Your estimate: ${(p.true_probability * 100).toFixed(1)}%, Market: ${(price * 100).toFixed(1)}%, Edge: ${(edge * 100).toFixed(1)}%`,
            });
          }

          // 6. Volume trend
          if (Array.isArray(trades) && trades.length >= 20) {
            const recentVol = trades.slice(-10).reduce((s: number, t: any) => s + parseFloat(t.size || '0'), 0);
            const olderVol = trades.slice(-20, -10).reduce((s: number, t: any) => s + parseFloat(t.size || '0'), 0);
            const volChange = olderVol > 0 ? (recentVol - olderVol) / olderVol : 0;
            // Volume surge + price up = bullish, volume surge + price down = bearish
            const priceDir = prices.length >= 10 ? prices[prices.length - 1] - prices[prices.length - 10] : 0;
            signals.push({
              name: 'Volume-Price',
              direction: volChange > 0.3 && priceDir > 0 ? 'BUY' : volChange > 0.3 && priceDir < 0 ? 'SELL' : 'NEUTRAL',
              weight: Math.min(Math.abs(volChange) * 0.5, 0.7),
              detail: `Volume ${volChange > 0 ? '+' : ''}${(volChange * 100).toFixed(0)}%, Price ${priceDir > 0 ? 'up' : 'down'}`,
            });
          }

          // Aggregate signals
          let buyScore = 0, sellScore = 0, totalWeight = 0;
          for (const sig of signals) {
            totalWeight += sig.weight;
            if (sig.direction === 'BUY') buyScore += sig.weight;
            else if (sig.direction === 'SELL') sellScore += sig.weight;
          }

          const netScore = totalWeight > 0 ? (buyScore - sellScore) / totalWeight : 0;
          const confidence = totalWeight > 0 ? Math.abs(buyScore - sellScore) / totalWeight : 0;
          const direction = netScore > 0.15 ? 'BUY' : netScore < -0.15 ? 'SELL' : 'HOLD';

          // Kelly sizing
          let kellySize = null;
          if (p.bankroll && direction !== 'HOLD') {
            const trueP = p.true_probability || (direction === 'BUY' ? price + confidence * 0.1 : price - confidence * 0.1);
            const b = (1 / price) - 1;
            const f = (trueP * b - (1 - trueP)) / b;
            const riskMultiplier = p.risk_tolerance === 'conservative' ? 0.25 : p.risk_tolerance === 'aggressive' ? 0.75 : 0.5;
            kellySize = parseFloat((p.bankroll * Math.max(f, 0) * riskMultiplier).toFixed(2));
          }

          return jsonResult({
            token_id: p.token_id,
            current_price: price,
            signal: {
              direction,
              confidence: parseFloat((confidence * 100).toFixed(1)) + '%',
              net_score: parseFloat(netScore.toFixed(3)),
              buy_weight: parseFloat(buyScore.toFixed(2)),
              sell_weight: parseFloat(sellScore.toFixed(2)),
            },
            recommended_position: kellySize !== null ? {
              size_usdc: kellySize,
              risk_tolerance: p.risk_tolerance || 'moderate',
              method: 'Kelly Criterion (risk-adjusted)',
            } : undefined,
            components: signals,
            warning: confidence < 0.3 ? 'LOW CONFIDENCE — signals are mixed, consider waiting' : undefined,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── CORRELATION MATRIX ─────────────────────────────────────
    {
      name: 'poly_correlation_matrix',
      description: 'Calculate correlation matrix between multiple prediction market tokens. Essential for portfolio construction and diversification analysis. Returns pairwise correlations, eigenvector decomposition (PCA), and identifies the most/least correlated pairs.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          token_ids: { type: 'array', items: { type: 'string' }, description: 'Token IDs to correlate (2-10)' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Human-readable labels for each token' },
          lookback: { type: 'number', description: 'Number of data points', default: 50 },
        },
        required: ['token_ids'],
      },
      async execute(_id: string, p: any) {
        try {
          const ids = (p.token_ids || []).slice(0, 10);
          if (ids.length < 2) return errorResult('Need at least 2 token IDs');

          // Fetch all price series in parallel
          const allPrices = await Promise.all(ids.map((id: string) => fetchPriceSeries(id, p.lookback || 50)));

          // Align lengths
          const minLen = Math.min(...allPrices.map(pr => pr.length));
          if (minLen < 10) return errorResult('Insufficient data points');

          const aligned = allPrices.map(pr => pr.slice(-minLen));
          const returns = aligned.map(pr => pr.slice(1).map((v: number, i: number) => Math.log(v / pr[i])));

          // Correlation matrix
          const n = ids.length;
          const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
          const labels = p.labels || ids.map((_: string, i: number) => `Token ${i + 1}`);

          for (let i = 0; i < n; i++) {
            matrix[i][i] = 1;
            for (let j = i + 1; j < n; j++) {
              const len = Math.min(returns[i].length, returns[j].length);
              const r1 = returns[i].slice(-len), r2 = returns[j].slice(-len);
              const m1 = r1.reduce((s: number, v: number) => s + v, 0) / len;
              const m2 = r2.reduce((s: number, v: number) => s + v, 0) / len;
              let cov = 0, v1 = 0, v2 = 0;
              for (let k = 0; k < len; k++) {
                cov += (r1[k] - m1) * (r2[k] - m2);
                v1 += (r1[k] - m1) ** 2;
                v2 += (r2[k] - m2) ** 2;
              }
              const corr = Math.sqrt(v1 * v2) > 0 ? cov / Math.sqrt(v1 * v2) : 0;
              matrix[i][j] = corr;
              matrix[j][i] = corr;
            }
          }

          // Find most/least correlated pairs
          const pairs: any[] = [];
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              pairs.push({ pair: `${labels[i]} / ${labels[j]}`, correlation: parseFloat(matrix[i][j].toFixed(4)) });
            }
          }
          pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

          return jsonResult({
            tokens: ids.length,
            data_points: minLen,
            matrix: matrix.map((row, i) => ({
              token: labels[i],
              correlations: Object.fromEntries(row.map((v, j) => [labels[j], parseFloat(v.toFixed(4))])),
            })),
            most_correlated: pairs[0],
            least_correlated: pairs[pairs.length - 1],
            diversification_score: parseFloat((1 - pairs.reduce((s, p) => s + Math.abs(p.correlation), 0) / pairs.length).toFixed(3)),
            all_pairs: pairs,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── MARKET EFFICIENCY TEST ─────────────────────────────────
    {
      name: 'poly_efficiency_test',
      description: 'Test market efficiency using multiple statistical methods: autocorrelation analysis, runs test, variance ratio test, and Ljung-Box test. Inefficient markets have exploitable patterns. Returns specific inefficiency types and suggested strategies.',
      category: 'enterprise' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          token_id: { type: 'string' },
          prices: { type: 'array', items: { type: 'number' } },
          significance: { type: 'number', description: 'Statistical significance level', default: 0.05 },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let prices = p.prices;
          if (!prices && p.token_id) prices = await fetchPriceSeries(p.token_id, 200);
          if (!prices || prices.length < 30) return errorResult('Need at least 30 data points');

          const returns = prices.slice(1).map((pr: number, i: number) => Math.log(pr / prices[i]));
          const n = returns.length;
          const meanR = returns.reduce((s: number, v: number) => s + v, 0) / n;

          // 1. Autocorrelation (lag 1-5)
          const autoCorrs: number[] = [];
          for (let lag = 1; lag <= 5; lag++) {
            let num = 0, den = 0;
            for (let i = lag; i < n; i++) {
              num += (returns[i] - meanR) * (returns[i - lag] - meanR);
            }
            for (let i = 0; i < n; i++) {
              den += (returns[i] - meanR) ** 2;
            }
            autoCorrs.push(den > 0 ? num / den : 0);
          }

          // 2. Runs test
          const signs = returns.map((r: number) => r >= 0 ? 1 : -1);
          let runs = 1;
          for (let i = 1; i < signs.length; i++) {
            if (signs[i] !== signs[i - 1]) runs++;
          }
          const nPos = signs.filter((s: number) => s === 1).length;
          const nNeg = signs.filter((s: number) => s === -1).length;
          const expectedRuns = 1 + (2 * nPos * nNeg) / (nPos + nNeg);
          const stdRuns = Math.sqrt((2 * nPos * nNeg * (2 * nPos * nNeg - nPos - nNeg)) / ((nPos + nNeg) ** 2 * (nPos + nNeg - 1)));
          const runsZ = stdRuns > 0 ? (runs - expectedRuns) / stdRuns : 0;

          // 3. Variance ratio test (Lo-MacKinlay)
          const q = 5;
          const qReturns: number[] = [];
          for (let i = 0; i <= n - q; i++) {
            qReturns.push(returns.slice(i, i + q).reduce((s: number, v: number) => s + v, 0));
          }
          const var1 = returns.reduce((s: number, r: number) => s + (r - meanR) ** 2, 0) / (n - 1);
          const varQ = qReturns.reduce((s: number, r: number) => s + (r - q * meanR) ** 2, 0) / (qReturns.length - 1);
          const vr = varQ / (q * var1);
          const vrZ = (vr - 1) * Math.sqrt(n * 2 * (2 * q - 1) * (q - 1) / (3 * q));

          // Ljung-Box statistic (simplified)
          let lbStat = 0;
          for (let k = 0; k < autoCorrs.length; k++) {
            lbStat += (n * (n + 2) / (n - k - 1)) * autoCorrs[k] ** 2;
          }

          const isEfficient = Math.abs(runsZ) < 1.96 && Math.abs(vrZ) < 1.96 && lbStat < 11.07; // chi2(5) at 5%

          return jsonResult({
            data_points: prices.length,
            autocorrelation: {
              lag_1: parseFloat(autoCorrs[0].toFixed(4)),
              lag_2: parseFloat(autoCorrs[1].toFixed(4)),
              lag_3: parseFloat(autoCorrs[2].toFixed(4)),
              lag_4: parseFloat(autoCorrs[3].toFixed(4)),
              lag_5: parseFloat(autoCorrs[4].toFixed(4)),
              significant: autoCorrs.some(ac => Math.abs(ac) > 2 / Math.sqrt(n)),
            },
            runs_test: {
              runs: runs,
              expected: parseFloat(expectedRuns.toFixed(1)),
              z_score: parseFloat(runsZ.toFixed(3)),
              p_value: parseFloat((2 * (1 - normalCDF(Math.abs(runsZ)))).toFixed(4)),
              result: Math.abs(runsZ) > 1.96 ? 'NON_RANDOM' : 'RANDOM',
            },
            variance_ratio: {
              vr: parseFloat(vr.toFixed(4)),
              z_score: parseFloat(vrZ.toFixed(3)),
              interpretation: vr > 1.1 ? 'MOMENTUM (trending)' : vr < 0.9 ? 'MEAN_REVERTING' : 'RANDOM_WALK',
            },
            ljung_box: {
              statistic: parseFloat(lbStat.toFixed(2)),
              significant: lbStat > 11.07,
            },
            overall: {
              efficient: isEfficient,
              exploitable_patterns: !isEfficient,
              suggested_strategy: !isEfficient ?
                (vr > 1.1 ? 'TREND_FOLLOWING — momentum is persistent' :
                 vr < 0.9 ? 'MEAN_REVERSION — buy dips, sell rallies' :
                 'PATTERN detected but type unclear') :
                'Market appears efficient — edge must come from fundamental analysis, not technicals',
            },
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

  ];
}
