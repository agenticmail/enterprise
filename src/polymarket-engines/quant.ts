/**
 * Polymarket Quantitative Analysis Engine
 * 
 * Institutional-grade mathematical tools for prediction market trading.
 * Extracted from polymarket-quant.ts tool wrappers into standalone callable functions.
 * 
 * Capabilities:
 * - Kelly Criterion optimal sizing
 * - Binary option pricing (Black-Scholes analog)
 * - Bayesian probability updating
 * - Monte Carlo simulation
 * - Technical indicators (RSI, MACD, Bollinger, EMA, momentum)
 * - Volatility analysis (realized, EWMA, Hurst exponent)
 * - Statistical arbitrage (z-score, cointegration, pairs trading)
 * - Value at Risk / Conditional VaR / Cornish-Fisher
 * - Information entropy & KL divergence
 * - Sentiment scoring (lexicon-based)
 * - News feed aggregation
 * - Composite signal generation
 * - Correlation matrix
 * - Market efficiency testing (autocorrelation, runs, variance ratio, Ljung-Box)
 */

import {
  CLOB_API, GAMMA_API,
  apiFetch, cachedFetchText,
  normalCDF, normalPDF, normalInv,
  linearRegression, ewma, sma, std,
  fetchPriceSeries,
  POSITIVE_WORDS, NEGATIVE_WORDS,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  KELLY CRITERION
// ═══════════════════════════════════════════════════════════════════

export interface KellyResult {
  formula: string;
  inputs: { true_probability: number; market_price: number; odds: string };
  kelly: { full: number; half: number; quarter: number; capped: number };
  expected_value_per_dollar: number;
  edge_pct: number;
  signal: 'BUY' | 'SELL' | 'NO_EDGE';
  recommended_bet?: { full_kelly: number; half_kelly: number; quarter_kelly: number; capped: number };
  warnings: string[];
}

export async function calculateKelly(params: {
  true_probability: number;
  market_price?: number;
  token_id?: string;
  bankroll?: number;
  max_fraction?: number;
}): Promise<KellyResult> {
  let price = params.market_price;
  if (!price && params.token_id) {
    const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${params.token_id}`);
    price = parseFloat(mid?.mid || '0.5');
  }
  if (!price) throw new Error('Provide market_price or token_id');

  const prob = params.true_probability;
  const q = 1 - prob;
  const b = (1 / price) - 1;
  const kellyFraction = (prob * b - q) / b;
  const halfKelly = kellyFraction / 2;
  const quarterKelly = kellyFraction / 4;
  const maxF = params.max_fraction || 0.25;
  const cappedKelly = Math.min(Math.max(kellyFraction, 0), maxF);
  const ev = prob * (1 / price - 1) - q;
  const bankroll = params.bankroll || 0;
  const optimalBet = bankroll * cappedKelly;

  return {
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
      kellyFraction > 0.5 ? 'WARNING: Full Kelly > 50% — extremely aggressive, use half or quarter Kelly' : '',
      kellyFraction <= 0 ? 'No edge detected at this price — do not bet' : '',
      Math.abs(prob - price) < 0.02 ? 'Edge is very thin (<2%) — transaction costs may eliminate profit' : '',
    ].filter(Boolean),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  BINARY OPTION PRICING (Black-Scholes Analog)
// ═══════════════════════════════════════════════════════════════════

export interface BinaryPricingResult {
  model: string;
  inputs: { price: number; volatility: number; time_to_expiry_years: number; time_to_expiry_hours: number };
  theoretical_price: number;
  market_price: number;
  difference: number;
  greeks: { delta: number; gamma: number; theta_per_hour: number; theta_per_day: number; vega: number };
  interpretation: { delta: string; gamma: string; theta: string; time_premium: number };
  mispricing?: { your_estimate: number; market_price: number; theoretical_price: number; edge: string; signal: string };
}

export async function priceBinaryOption(params: {
  current_price?: number;
  token_id?: string;
  time_to_expiry_hours?: number;
  end_date?: string;
  volatility?: number;
  true_probability?: number;
}): Promise<BinaryPricingResult> {
  let price = params.current_price;
  let vol = params.volatility;

  if (!price && params.token_id) {
    const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${params.token_id}`);
    price = parseFloat(mid?.mid || '0.5');
  }
  if (!price) throw new Error('Provide current_price or token_id');

  let T: number;
  if (params.time_to_expiry_hours) {
    T = params.time_to_expiry_hours / 8760;
  } else if (params.end_date) {
    T = Math.max(0, (new Date(params.end_date).getTime() - Date.now()) / (8760 * 3600000));
  } else {
    throw new Error('Provide time_to_expiry_hours or end_date');
  }

  if (!vol && params.token_id) {
    const prices = await fetchPriceSeries(params.token_id, 100);
    if (prices.length > 10) {
      const returns = prices.slice(1).map((pr, i) => Math.log(pr / prices[i]));
      vol = std(returns) * Math.sqrt(365 * 24);
    }
  }
  vol = vol || 1.0;

  const clampedPrice = Math.max(0.01, Math.min(0.99, price));
  const logOdds = Math.log(clampedPrice / (1 - clampedPrice));
  const sqrtT = Math.sqrt(T);
  const d1 = (logOdds + 0.5 * vol * vol * T) / (vol * sqrtT || 1);
  const d2 = d1 - vol * sqrtT;
  const theoreticalPrice = normalCDF(d2);

  const delta = normalPDF(d2) / (vol * sqrtT * clampedPrice * (1 - clampedPrice) || 1);
  const gamma = normalPDF(d2) * d1 / (vol * sqrtT * clampedPrice * clampedPrice * (1 - clampedPrice) * (1 - clampedPrice) || 1);
  const theta = -normalPDF(d2) * vol / (2 * sqrtT || 1) / 8760;
  const vega = normalPDF(d2) * sqrtT * 0.01;

  const mispricing = params.true_probability ? {
    your_estimate: params.true_probability,
    market_price: price,
    theoretical_price: parseFloat(theoreticalPrice.toFixed(4)),
    edge: parseFloat(((params.true_probability - price) * 100).toFixed(2)) + '%',
    signal: params.true_probability > price + 0.03 ? 'BUY' : params.true_probability < price - 0.03 ? 'SELL' : 'FAIR',
  } : undefined;

  return {
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
  };
}

// ═══════════════════════════════════════════════════════════════════
//  BAYESIAN PROBABILITY UPDATER
// ═══════════════════════════════════════════════════════════════════

export interface BayesianUpdateResult {
  formula: string;
  initial_prior: number;
  final_posterior: number;
  total_shift: string;
  total_log_odds_shift: number;
  updates: Array<{
    evidence: string;
    likelihood_ratio: number;
    log_lr: number;
    prior: number;
    posterior: number;
    shift: string;
    bits_of_evidence: number;
  }>;
  market_comparison: { market_price: number; your_posterior: number; edge: string; signal: string };
}

export async function bayesianUpdate(params: {
  prior?: number;
  token_id?: string;
  evidence: Array<{
    description?: string;
    likelihood_if_true?: number;
    likelihood_if_false?: number;
    likelihood_ratio?: number;
  }>;
}): Promise<BayesianUpdateResult> {
  let prior = params.prior;
  if (!prior && params.token_id) {
    const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${params.token_id}`);
    prior = parseFloat(mid?.mid || '0.5');
  }
  prior = prior || 0.5;

  const updates: BayesianUpdateResult['updates'] = [];
  let current = prior;

  for (const ev of (params.evidence || [])) {
    const prevProb = current;
    let lr: number;

    if (ev.likelihood_ratio) {
      lr = ev.likelihood_ratio;
    } else if (ev.likelihood_if_true !== undefined && ev.likelihood_if_false !== undefined) {
      lr = ev.likelihood_if_true / (ev.likelihood_if_false || 0.001);
    } else {
      continue;
    }

    const priorOdds = current / (1 - current);
    const posteriorOdds = lr * priorOdds;
    current = posteriorOdds / (1 + posteriorOdds);
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
  const marketPrice = params.token_id
    ? parseFloat((await apiFetch(`${CLOB_API}/midpoint?token_id=${params.token_id}`).catch(() => ({ mid: prior }))).mid || String(prior))
    : prior;

  return {
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
  };
}

// ═══════════════════════════════════════════════════════════════════
//  MONTE CARLO SIMULATION
// ═══════════════════════════════════════════════════════════════════

export interface MonteCarloResult {
  model: string;
  simulations: number;
  time_horizon_hours: number;
  positions: number;
  results: { expected_pnl: number; std_dev: number; probability_of_profit: string; sharpe_ratio: number | null };
  risk_metrics: { var_95: number; var_99: number; cvar_95: number; max_loss: number; max_gain: number };
  distribution: Record<string, number>;
}

export async function runMonteCarlo(params: {
  positions: Array<{ token_id?: string; side?: string; entry_price?: number; size?: number; true_probability?: number; current_price?: number }>;
  simulations?: number;
  time_horizon_hours?: number;
  volatility?: number;
  correlation?: number;
}): Promise<MonteCarloResult> {
  const N = Math.min(params.simulations || 10000, 100000);
  const T = (params.time_horizon_hours || 24) / 8760;
  const vol = params.volatility || 1.0;
  const corr = params.correlation || 0;
  const positions = params.positions || [];
  if (positions.length === 0) throw new Error('No positions provided');

  for (const pos of positions) {
    if (pos.token_id && !pos.current_price) {
      try {
        const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${pos.token_id}`);
        pos.current_price = parseFloat(mid?.mid || String(pos.entry_price || 0.5));
      } catch { pos.current_price = pos.entry_price || 0.5; }
    }
  }

  const pnlDistribution: number[] = [];
  const sqrtT = Math.sqrt(T);

  for (let sim = 0; sim < N; sim++) {
    let totalPnl = 0;
    const z1 = normalInv(Math.random());

    for (const pos of positions) {
      const z2 = normalInv(Math.random());
      const z = corr * z1 + Math.sqrt(1 - corr * corr) * z2;
      const currentP = pos.current_price || 0.5;
      const trueP = pos.true_probability || currentP;
      const meanReversion = 0.5;
      const logOdds = Math.log(currentP / (1 - currentP));
      const targetLogOdds = Math.log(trueP / (1 - trueP));
      const newLogOdds = logOdds + meanReversion * (targetLogOdds - logOdds) * T + vol * sqrtT * z;
      let simPrice = 1 / (1 + Math.exp(-newLogOdds));
      simPrice = Math.max(0.01, Math.min(0.99, simPrice));
      const entryPrice = pos.entry_price || currentP;
      const size = pos.size || 1;
      const pnl = pos.side === 'BUY' ? (simPrice - entryPrice) * size : (entryPrice - simPrice) * size;
      totalPnl += pnl;
    }
    pnlDistribution.push(totalPnl);
  }

  pnlDistribution.sort((a, b) => a - b);
  const mean = pnlDistribution.reduce((s, v) => s + v, 0) / N;
  const stdDev = std(pnlDistribution);
  const profitCount = pnlDistribution.filter(v => v > 0).length;
  const pctl = (pct: number) => pnlDistribution[Math.floor(N * pct / 100)];

  return {
    model: 'Mean-Reverting Geometric Brownian Motion (Ornstein-Uhlenbeck)',
    simulations: N,
    time_horizon_hours: params.time_horizon_hours || 24,
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
  };
}

// ═══════════════════════════════════════════════════════════════════
//  TECHNICAL INDICATORS
// ═══════════════════════════════════════════════════════════════════

export interface TechnicalIndicatorsResult {
  data_points: number;
  latest_price: number;
  rsi?: { value: number; period: number; signal: string; interpretation: string };
  macd?: { macd_line: number; signal_line: number; histogram: number; signal: string; crossover: string; momentum: string };
  bollinger?: { upper: number; middle: number; lower: number; bandwidth: number; percent_b: number; signal: string };
  ema?: { ema_9: number; ema_21: number; ema_50: number; trend: string; golden_cross: boolean; death_cross: boolean };
  momentum?: { roc_5: string; roc_10: string | null; roc_20: string | null; acceleration: number | null };
  composite_signal: { buy_signals: number; sell_signals: number; total_indicators: number; consensus: string; confidence: string };
}

export async function calculateTechnicalIndicators(params: {
  token_id?: string;
  prices?: number[];
  indicators?: string[];
  rsi_period?: number;
  macd_fast?: number;
  macd_slow?: number;
  macd_signal?: number;
  bollinger_period?: number;
  bollinger_std?: number;
}): Promise<TechnicalIndicatorsResult> {
  let prices = params.prices;
  if (!prices && params.token_id) {
    prices = await fetchPriceSeries(params.token_id, 200);
  }
  if (!prices || prices.length < 15) throw new Error('Need at least 15 price points');

  const indicators = params.indicators || ['all'];
  const doAll = indicators.includes('all');
  const result: any = { data_points: prices.length, latest_price: prices[prices.length - 1] };

  // RSI
  if (doAll || indicators.includes('rsi')) {
    const period = params.rsi_period || 14;
    const gains: number[] = [], losses: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }
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
    const fast = ewma(prices, params.macd_fast || 12);
    const slow = ewma(prices, params.macd_slow || 26);
    const macdLine = fast.map((f, i) => f - slow[i]);
    const signalLine = ewma(macdLine, params.macd_signal || 9);
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
    const period = params.bollinger_period || 20;
    const numStd = params.bollinger_std || 2;
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

  // Composite signal
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

  return result as TechnicalIndicatorsResult;
}

// ═══════════════════════════════════════════════════════════════════
//  VOLATILITY ANALYSIS
// ═══════════════════════════════════════════════════════════════════

export interface VolatilityResult {
  realized_volatility: Record<string, number>;
  ewma_volatility: number;
  hurst_exponent: { value: number; interpretation: string; regime: string };
  volatility_regime: { current_vs_long: number; regime: string };
  data_points: number;
}

export async function analyzeVolatility(params: {
  token_id?: string;
  prices?: number[];
  windows?: number[];
}): Promise<VolatilityResult> {
  let prices = params.prices;
  if (!prices && params.token_id) prices = await fetchPriceSeries(params.token_id, 200);
  if (!prices || prices.length < 20) throw new Error('Need at least 20 price points');

  const returns = prices.slice(1).map((pr, i) => Math.log(pr / prices![i]));
  const windows = params.windows || [5, 10, 20, 50];
  const realizedVol: Record<string, number> = {};
  for (const w of windows) {
    if (returns.length >= w) {
      const windowReturns = returns.slice(-w);
      realizedVol[`${w}_period`] = parseFloat((std(windowReturns) * Math.sqrt(365 * 24)).toFixed(4));
    }
  }

  const ewmaVol = ewma(returns.map(r => r * r), 10).map(v => Math.sqrt(v * 365 * 24));
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
        const mean = chunk.reduce((s, v) => s + v, 0) / n;
        const deviations = chunk.map(v => v - mean);
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

  const currentVol = realizedVol['10_period'] || latestEwmaVol;
  const longVol = realizedVol['50_period'] || currentVol;

  return {
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
  };
}

// ═══════════════════════════════════════════════════════════════════
//  STATISTICAL ARBITRAGE
// ═══════════════════════════════════════════════════════════════════

export interface StatArbResult {
  model: string;
  pair: { token_1: string; token_2: string };
  correlation: number;
  cointegration: { hedge_ratio: number; intercept: number; r_squared: number; is_cointegrated: boolean };
  spread: { current: number; mean: number; std: number; z_score: number };
  signal: { action: string; strength: string; entry_threshold: number; exit_threshold: number };
  warnings: string[];
}

export async function analyzeStatArb(params: {
  token_id_1: string;
  token_id_2: string;
  lookback?: number;
  entry_zscore?: number;
  exit_zscore?: number;
}): Promise<StatArbResult> {
  const [prices1, prices2] = await Promise.all([
    fetchPriceSeries(params.token_id_1, 200),
    fetchPriceSeries(params.token_id_2, 200),
  ]);

  const len = Math.min(prices1.length, prices2.length);
  if (len < 20) throw new Error('Need at least 20 data points for both tokens');

  const p1 = prices1.slice(-len);
  const p2 = prices2.slice(-len);

  const reg = linearRegression(p2, p1);
  const spread = p1.map((v, i) => v - reg.slope * p2[i] - reg.intercept);

  const lookback = Math.min(params.lookback || 50, len);
  const recentSpread = spread.slice(-lookback);
  const meanSpread = recentSpread.reduce((s, v) => s + v, 0) / lookback;
  const stdSpread = std(recentSpread);
  const currentZScore = stdSpread > 0 ? (spread[spread.length - 1] - meanSpread) / stdSpread : 0;

  const mean1 = p1.reduce((s, v) => s + v, 0) / len;
  const mean2 = p2.reduce((s, v) => s + v, 0) / len;
  let cov = 0, var1 = 0, var2 = 0;
  for (let i = 0; i < len; i++) {
    cov += (p1[i] - mean1) * (p2[i] - mean2);
    var1 += (p1[i] - mean1) ** 2;
    var2 += (p2[i] - mean2) ** 2;
  }
  const correlation = Math.sqrt(var1 * var2) > 0 ? cov / Math.sqrt(var1 * var2) : 0;

  const entryZ = params.entry_zscore || 2;
  const exitZ = params.exit_zscore || 0.5;

  return {
    model: 'Pairs Trading / Statistical Arbitrage',
    pair: { token_1: params.token_id_1, token_2: params.token_id_2 },
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
      Math.abs(correlation) < 0.3 ? 'LOW CORRELATION — these markets may not be related enough for stat arb' : '',
      reg.r2 < 0.3 ? 'POOR FIT — hedge ratio may be unreliable' : '',
    ].filter(Boolean),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  VALUE AT RISK
// ═══════════════════════════════════════════════════════════════════

export interface VaRResult {
  confidence: number;
  horizon_hours: number;
  total_exposure: number;
  data_points: number;
  parametric?: { var: number; note: string };
  historical?: { var: number; cvar_expected_shortfall: number; note: string };
  cornish_fisher?: { var: number; skewness: number; excess_kurtosis: number; note: string };
}

export async function calculateVaR(params: {
  positions: Array<{ token_id: string; size?: number; entry_price?: number; side?: string }>;
  confidence?: number;
  horizon_hours?: number;
  method?: 'parametric' | 'historical' | 'cornish_fisher' | 'all';
}): Promise<VaRResult> {
  const confidence = params.confidence || 0.95;
  const horizon = (params.horizon_hours || 24) / (24 * 365);
  let portfolioReturns: number[] = [];
  let totalExposure = 0;

  for (const pos of (params.positions || [])) {
    const prices = await fetchPriceSeries(pos.token_id, 100);
    if (prices.length < 10) continue;
    const returns = prices.slice(1).map((pr, i) => Math.log(pr / prices[i]));
    const scaledReturns = returns.map(r => r * (pos.size || 1) * (pos.side === 'SELL' ? -1 : 1));
    if (portfolioReturns.length === 0) {
      portfolioReturns = scaledReturns;
    } else {
      const len = Math.min(portfolioReturns.length, scaledReturns.length);
      portfolioReturns = portfolioReturns.slice(-len).map((r, i) => r + scaledReturns.slice(-len)[i]);
    }
    totalExposure += pos.size || 1;
  }

  if (portfolioReturns.length < 10) throw new Error('Insufficient data for VaR calculation');

  const mean = portfolioReturns.reduce((s, v) => s + v, 0) / portfolioReturns.length;
  const sigma = std(portfolioReturns);
  const sqrtH = Math.sqrt(horizon * 365 * 24);

  const results: VaRResult = { confidence, horizon_hours: params.horizon_hours || 24, total_exposure: totalExposure, data_points: portfolioReturns.length };
  const method = params.method || 'all';

  if (method === 'all' || method === 'parametric') {
    const z = normalInv(1 - confidence);
    results.parametric = {
      var: parseFloat((-(mean * sqrtH + z * sigma * sqrtH)).toFixed(2)),
      note: 'Assumes normal distribution of returns',
    };
  }

  if (method === 'all' || method === 'historical') {
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

  if (method === 'all' || method === 'cornish_fisher') {
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

  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  INFORMATION ENTROPY
// ═══════════════════════════════════════════════════════════════════

export interface EntropyResult {
  shannon_entropy: number;
  max_entropy: number;
  normalized_entropy: number;
  interpretation: string;
  bits_to_resolve: number;
  kl_divergence?: { value: number; interpretation: string; direction: string };
}

export async function calculateEntropy(params: {
  market_prices?: number[];
  token_id?: string;
  your_estimates?: number[];
}): Promise<EntropyResult> {
  let probs = params.market_prices;
  if (!probs && params.token_id) {
    const mid = await apiFetch(`${CLOB_API}/midpoint?token_id=${params.token_id}`);
    const pr = parseFloat(mid?.mid || '0.5');
    probs = [pr, 1 - pr];
  }
  if (!probs) throw new Error('Provide market_prices or token_id');

  const entropy = -probs.reduce((s, p) => {
    if (p <= 0 || p >= 1) return s;
    return s + p * Math.log2(p);
  }, 0);
  const maxEntropy = Math.log2(probs.length);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  const result: EntropyResult = {
    shannon_entropy: parseFloat(entropy.toFixed(4)),
    max_entropy: parseFloat(maxEntropy.toFixed(4)),
    normalized_entropy: parseFloat(normalizedEntropy.toFixed(4)),
    interpretation: normalizedEntropy > 0.9 ? 'MAXIMUM UNCERTAINTY — market has no conviction' :
      normalizedEntropy > 0.7 ? 'HIGH UNCERTAINTY — wide range of outcomes' :
      normalizedEntropy > 0.3 ? 'MODERATE — some conviction forming' :
      'DECISIVE — market strongly favors one outcome',
    bits_to_resolve: parseFloat(entropy.toFixed(4)),
  };

  if (params.your_estimates) {
    const q = params.your_estimates;
    const klDiv = probs.reduce((s, pi, i) => {
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

  return result;
}

// ═══════════════════════════════════════════════════════════════════
//  SENTIMENT ANALYSIS (LEXICON-BASED)
// ═══════════════════════════════════════════════════════════════════

export interface SentimentResult {
  total_texts: number;
  aggregate: {
    average_score: number;
    overall_sentiment: string;
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    consensus_strength: string;
  };
  details: Array<{ text: string; raw_score: number; normalized_score: number; sentiment: string; positive_words: number; negative_words: number }>;
  market_signal: { direction: string; confidence: string };
}

export function analyzeSentiment(texts: string[]): SentimentResult {
  if (texts.length === 0) throw new Error('No texts provided');

  const analyzed = texts.map(text => {
    const words = text.toLowerCase().split(/\s+/);
    let score = 0, posCount = 0, negCount = 0;
    for (const w of words) {
      const clean = w.replace(/[^a-z]/g, '');
      if (POSITIVE_WORDS[clean]) { score += POSITIVE_WORDS[clean]; posCount++; }
      if (NEGATIVE_WORDS[clean]) { score += NEGATIVE_WORDS[clean]; negCount++; }
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

  const avgScore = analyzed.reduce((s, a) => s + a.normalized_score, 0) / analyzed.length;
  const posTexts = analyzed.filter(a => a.sentiment === 'POSITIVE').length;
  const negTexts = analyzed.filter(a => a.sentiment === 'NEGATIVE').length;

  return {
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
  };
}

// ═══════════════════════════════════════════════════════════════════
//  NEWS FEED AGGREGATION
// ═══════════════════════════════════════════════════════════════════

export interface NewsFeedResult {
  query: string;
  source: string;
  articles: number;
  results: Array<{ title: string; link?: string; published?: string; source: string; impact_score: string }>;
  note: string;
}

export async function fetchNewsFeed(params: {
  query?: string;
  market_id?: string;
  hours?: number;
  limit?: number;
}): Promise<NewsFeedResult> {
  let query = params.query;
  if (!query && params.market_id) {
    const m = await apiFetch(`${GAMMA_API}/markets/${params.market_id}`).catch(() => null);
    query = m?.question;
  }
  if (!query) throw new Error('Provide query or market_id');

  const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const rssXml = await cachedFetchText(googleNewsUrl, 15000);
    const items: NewsFeedResult['results'] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(typeof rssXml === 'string' ? rssXml : '')) !== null) {
      const get = (tag: string) => {
        const m2 = match![1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m2 ? m2[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      };
      const title = get('title');
      const link = get('link');
      const pubDate = get('pubDate');
      const source = get('source');

      if (title) {
        if (pubDate && params.hours) {
          const articleDate = new Date(pubDate);
          const cutoff = new Date(Date.now() - (params.hours || 24) * 3600000);
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
      if (items.length >= (params.limit || 20)) break;
    }

    return { query, source: 'Google News RSS', articles: items.length, results: items, note: 'For deeper analysis, use analyzeSentiment on individual articles.' };
  } catch {
    return { query, source: 'Google News RSS', articles: 0, results: [], note: 'RSS unavailable — use web_search as fallback' };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  COMPOSITE SIGNAL GENERATOR
// ═══════════════════════════════════════════════════════════════════

export interface CompositeSignalResult {
  token_id: string;
  current_price: number;
  signal: { direction: string; confidence: string; net_score: number; buy_weight: number; sell_weight: number };
  recommended_position?: { size_usdc: number; risk_tolerance: string; method: string };
  components: Array<{ name: string; direction: string; weight: number; detail: string }>;
  warning?: string;
}

export async function generateCompositeSignal(params: {
  token_id: string;
  market_id?: string;
  true_probability?: number;
  bankroll?: number;
  risk_tolerance?: 'conservative' | 'moderate' | 'aggressive';
}): Promise<CompositeSignalResult> {
  const [midData, bookData, marketData, trades] = await Promise.all([
    apiFetch(`${CLOB_API}/midpoint?token_id=${params.token_id}`).catch(() => null),
    apiFetch(`${CLOB_API}/book?token_id=${params.token_id}`).catch(() => null),
    params.market_id ? apiFetch(`${GAMMA_API}/markets/${params.market_id}`).catch(() => null) : null,
    apiFetch(`${CLOB_API}/trades?asset_id=${params.token_id}&limit=100`).catch(() => []),
  ]);

  const price = parseFloat(midData?.mid || '0.5');
  const prices = Array.isArray(trades) ? trades.reverse().map((t: any) => parseFloat(t.price || '0')).filter((v: number) => v > 0) : [];
  const signals: Array<{ name: string; direction: string; weight: number; detail: string }> = [];

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

  // 2. RSI
  if (prices.length >= 15) {
    const period = 14;
    const gains = prices.slice(1).map((pr, i) => Math.max(0, pr - prices[i]));
    const losses = prices.slice(1).map((pr, i) => Math.max(0, prices[i] - pr));
    let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
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

  // 4. Mean reversion
  if (prices.length >= 20) {
    const ma20 = prices.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const deviation = (price - ma20) / ma20;
    signals.push({
      name: 'Mean Reversion',
      direction: deviation < -0.05 ? 'BUY' : deviation > 0.05 ? 'SELL' : 'NEUTRAL',
      weight: Math.min(Math.abs(deviation) * 5, 1),
      detail: `Price ${(deviation * 100).toFixed(1)}% from 20-MA (${ma20.toFixed(3)})`,
    });
  }

  // 5. Fundamental edge
  if (params.true_probability) {
    const edge = params.true_probability - price;
    signals.push({
      name: 'Fundamental Edge',
      direction: edge > 0.02 ? 'BUY' : edge < -0.02 ? 'SELL' : 'NEUTRAL',
      weight: Math.min(Math.abs(edge) * 10, 1),
      detail: `Your estimate: ${(params.true_probability * 100).toFixed(1)}%, Market: ${(price * 100).toFixed(1)}%, Edge: ${(edge * 100).toFixed(1)}%`,
    });
  }

  // 6. Volume-price
  if (Array.isArray(trades) && trades.length >= 20) {
    const recentVol = trades.slice(-10).reduce((s: number, t: any) => s + parseFloat(t.size || '0'), 0);
    const olderVol = trades.slice(-20, -10).reduce((s: number, t: any) => s + parseFloat(t.size || '0'), 0);
    const volChange = olderVol > 0 ? (recentVol - olderVol) / olderVol : 0;
    const priceDir = prices.length >= 10 ? prices[prices.length - 1] - prices[prices.length - 10] : 0;
    signals.push({
      name: 'Volume-Price',
      direction: volChange > 0.3 && priceDir > 0 ? 'BUY' : volChange > 0.3 && priceDir < 0 ? 'SELL' : 'NEUTRAL',
      weight: Math.min(Math.abs(volChange) * 0.5, 0.7),
      detail: `Volume ${volChange > 0 ? '+' : ''}${(volChange * 100).toFixed(0)}%, Price ${priceDir > 0 ? 'up' : 'down'}`,
    });
  }

  // Aggregate
  let buyScore = 0, sellScore = 0, totalWeight = 0;
  for (const sig of signals) {
    totalWeight += sig.weight;
    if (sig.direction === 'BUY') buyScore += sig.weight;
    else if (sig.direction === 'SELL') sellScore += sig.weight;
  }

  const netScore = totalWeight > 0 ? (buyScore - sellScore) / totalWeight : 0;
  const confidence = totalWeight > 0 ? Math.abs(buyScore - sellScore) / totalWeight : 0;
  const direction = netScore > 0.15 ? 'BUY' : netScore < -0.15 ? 'SELL' : 'HOLD';

  let kellySize: number | null = null;
  if (params.bankroll && direction !== 'HOLD') {
    const trueP = params.true_probability || (direction === 'BUY' ? price + confidence * 0.1 : price - confidence * 0.1);
    const b = (1 / price) - 1;
    const f = (trueP * b - (1 - trueP)) / b;
    const riskMultiplier = params.risk_tolerance === 'conservative' ? 0.25 : params.risk_tolerance === 'aggressive' ? 0.75 : 0.5;
    kellySize = parseFloat((params.bankroll * Math.max(f, 0) * riskMultiplier).toFixed(2));
  }

  return {
    token_id: params.token_id,
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
      risk_tolerance: params.risk_tolerance || 'moderate',
      method: 'Kelly Criterion (risk-adjusted)',
    } : undefined,
    components: signals,
    warning: confidence < 0.3 ? 'LOW CONFIDENCE — signals are mixed, consider waiting' : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  CORRELATION MATRIX
// ═══════════════════════════════════════════════════════════════════

export interface CorrelationMatrixResult {
  tokens: number;
  data_points: number;
  matrix: Array<{ token: string; correlations: Record<string, number> }>;
  most_correlated: { pair: string; correlation: number };
  least_correlated: { pair: string; correlation: number };
  diversification_score: number;
  all_pairs: Array<{ pair: string; correlation: number }>;
}

export async function calculateCorrelationMatrix(params: {
  token_ids: string[];
  labels?: string[];
  lookback?: number;
}): Promise<CorrelationMatrixResult> {
  const ids = (params.token_ids || []).slice(0, 10);
  if (ids.length < 2) throw new Error('Need at least 2 token IDs');

  const allPrices = await Promise.all(ids.map(id => fetchPriceSeries(id, params.lookback || 50)));
  const minLen = Math.min(...allPrices.map(pr => pr.length));
  if (minLen < 10) throw new Error('Insufficient data points');

  const aligned = allPrices.map(pr => pr.slice(-minLen));
  const returns = aligned.map(pr => pr.slice(1).map((v, i) => Math.log(v / pr[i])));

  const n = ids.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const labels = params.labels || ids.map((_, i) => `Token ${i + 1}`);

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const len = Math.min(returns[i].length, returns[j].length);
      const r1 = returns[i].slice(-len), r2 = returns[j].slice(-len);
      const m1 = r1.reduce((s, v) => s + v, 0) / len;
      const m2 = r2.reduce((s, v) => s + v, 0) / len;
      let cv = 0, v1 = 0, v2 = 0;
      for (let k = 0; k < len; k++) {
        cv += (r1[k] - m1) * (r2[k] - m2);
        v1 += (r1[k] - m1) ** 2;
        v2 += (r2[k] - m2) ** 2;
      }
      const corr = Math.sqrt(v1 * v2) > 0 ? cv / Math.sqrt(v1 * v2) : 0;
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  const pairs: Array<{ pair: string; correlation: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ pair: `${labels[i]} / ${labels[j]}`, correlation: parseFloat(matrix[i][j].toFixed(4)) });
    }
  }
  pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
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
  };
}

// ═══════════════════════════════════════════════════════════════════
//  MARKET EFFICIENCY TEST
// ═══════════════════════════════════════════════════════════════════

export interface EfficiencyTestResult {
  data_points: number;
  autocorrelation: { lag_1: number; lag_2: number; lag_3: number; lag_4: number; lag_5: number; significant: boolean };
  runs_test: { runs: number; expected: number; z_score: number; p_value: number; result: string };
  variance_ratio: { vr: number; z_score: number; interpretation: string };
  ljung_box: { statistic: number; significant: boolean };
  overall: { efficient: boolean; exploitable_patterns: boolean; suggested_strategy: string };
}

export async function testMarketEfficiency(params: {
  token_id?: string;
  prices?: number[];
  significance?: number;
}): Promise<EfficiencyTestResult> {
  let prices = params.prices;
  if (!prices && params.token_id) prices = await fetchPriceSeries(params.token_id, 200);
  if (!prices || prices.length < 30) throw new Error('Need at least 30 data points');

  const returns = prices.slice(1).map((pr, i) => Math.log(pr / prices![i]));
  const n = returns.length;
  const meanR = returns.reduce((s, v) => s + v, 0) / n;

  // 1. Autocorrelation (lag 1-5)
  const autoCorrs: number[] = [];
  for (let lag = 1; lag <= 5; lag++) {
    let num = 0, den = 0;
    for (let i = lag; i < n; i++) num += (returns[i] - meanR) * (returns[i - lag] - meanR);
    for (let i = 0; i < n; i++) den += (returns[i] - meanR) ** 2;
    autoCorrs.push(den > 0 ? num / den : 0);
  }

  // 2. Runs test
  const signs = returns.map(r => r >= 0 ? 1 : -1);
  let runs = 1;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) runs++;
  }
  const nPos = signs.filter(s => s === 1).length;
  const nNeg = signs.filter(s => s === -1).length;
  const expectedRuns = 1 + (2 * nPos * nNeg) / (nPos + nNeg);
  const stdRuns = Math.sqrt((2 * nPos * nNeg * (2 * nPos * nNeg - nPos - nNeg)) / ((nPos + nNeg) ** 2 * (nPos + nNeg - 1)));
  const runsZ = stdRuns > 0 ? (runs - expectedRuns) / stdRuns : 0;

  // 3. Variance ratio test
  const q = 5;
  const qReturns: number[] = [];
  for (let i = 0; i <= n - q; i++) {
    qReturns.push(returns.slice(i, i + q).reduce((s, v) => s + v, 0));
  }
  const var1 = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (n - 1);
  const varQ = qReturns.reduce((s, r) => s + (r - q * meanR) ** 2, 0) / (qReturns.length - 1);
  const vr = varQ / (q * var1);
  const vrZ = (vr - 1) * Math.sqrt(n * 2 * (2 * q - 1) * (q - 1) / (3 * q));

  // 4. Ljung-Box
  let lbStat = 0;
  for (let k = 0; k < autoCorrs.length; k++) {
    lbStat += (n * (n + 2) / (n - k - 1)) * autoCorrs[k] ** 2;
  }

  const isEfficient = Math.abs(runsZ) < 1.96 && Math.abs(vrZ) < 1.96 && lbStat < 11.07;

  return {
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
      runs,
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
  };
}
