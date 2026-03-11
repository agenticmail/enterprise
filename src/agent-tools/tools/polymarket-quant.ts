/**
 * Polymarket Quantitative Analysis Tools — Thin wrappers around polymarket-engines/quant
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import {
  calculateKelly, priceBinaryOption, bayesianUpdate, runMonteCarlo,
  calculateTechnicalIndicators, analyzeVolatility, analyzeStatArb,
  calculateVaR, calculateEntropy, analyzeSentiment, fetchNewsFeed,
  generateCompositeSignal, calculateCorrelationMatrix, testMarketEfficiency,
} from '../../polymarket-engines/quant.js';

export function createPolymarketQuantTools(_opts?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'poly_kelly_criterion',
      description: 'Calculate optimal position size using the Kelly Criterion. Given your estimated true probability and market price, returns the mathematically optimal fraction of bankroll to bet. Also returns half-Kelly and quarter-Kelly (more conservative). Formula: f* = (p·b - q) / b where b = (1/price - 1), p = true probability, q = 1-p.',
      parameters: {
        type: 'object', properties: {
          true_probability: { type: 'number', description: 'Your estimated true probability of the outcome (0-1)' },
          market_price: { type: 'number', description: 'Current market price (0-1). If omitted, fetched from token_id.' },
          token_id: { type: 'string', description: 'Token ID to fetch live price' },
          bankroll: { type: 'number', description: 'Total available capital (USDC)' },
          max_fraction: { type: 'number', description: 'Max fraction of bankroll per bet (risk cap)', default: 0.25 },
        }, required: ['true_probability'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await calculateKelly(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_binary_pricing',
      description: 'Price a prediction market outcome as a binary option using Black-Scholes framework. Returns theoretical fair value, Greeks (delta, gamma, theta, vega), and mispricing analysis.',
      parameters: {
        type: 'object', properties: {
          current_price: { type: 'number', description: 'Current market price (0-1)' },
          token_id: { type: 'string', description: 'Or fetch from token' },
          time_to_expiry_hours: { type: 'number', description: 'Hours until market resolves' },
          end_date: { type: 'string', description: 'Or provide end date (ISO)' },
          volatility: { type: 'number', description: 'Annualized volatility (0-5). If omitted, estimated.' },
          true_probability: { type: 'number', description: 'Your estimated true probability (for mispricing analysis)' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await priceBinaryOption(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_bayesian_update',
      description: 'Update probability estimates using Bayes theorem when new evidence arrives. Start with a prior, add evidence with likelihood ratios, get posterior probability.',
      parameters: {
        type: 'object', properties: {
          prior: { type: 'number', description: 'Prior probability (0-1). Use current market price or your belief.' },
          token_id: { type: 'string', description: 'Or fetch current price as prior' },
          evidence: {
            type: 'array', description: 'Array of evidence objects: { description, likelihood_if_true, likelihood_if_false } OR { description, likelihood_ratio }',
            items: {
              type: 'object', properties: {
                description: { type: 'string' }, likelihood_if_true: { type: 'number' },
                likelihood_if_false: { type: 'number' }, likelihood_ratio: { type: 'number' },
              },
            },
          },
        }, required: ['evidence'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await bayesianUpdate(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_monte_carlo',
      description: 'Run Monte Carlo simulation on prediction market positions. Simulates thousands of outcomes for expected P&L distribution, probability of profit, VaR, and optimal exits.',
      parameters: {
        type: 'object', properties: {
          positions: {
            type: 'array', description: 'Array of positions: { token_id, side, entry_price, size, true_probability? }',
            items: { type: 'object' },
          },
          simulations: { type: 'number', description: 'Number of paths (default 10000)', default: 10000 },
          time_horizon_hours: { type: 'number', description: 'Simulation horizon in hours', default: 24 },
          volatility: { type: 'number', description: 'Annualized volatility override' },
          correlation: { type: 'number', description: 'Assumed correlation between positions', default: 0 },
        }, required: ['positions'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await runMonteCarlo(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_technical_indicators',
      description: 'Calculate technical analysis indicators: RSI, MACD, Bollinger Bands, EMA crossovers, rate of change, and trend strength. Adapted for 0-1 bounded prediction market prices.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          prices: { type: 'array', items: { type: 'number' }, description: 'Or provide price array' },
          indicators: { type: 'array', items: { type: 'string' }, description: 'Which indicators (default: all)' },
          rsi_period: { type: 'number', default: 14 },
          macd_fast: { type: 'number', default: 12 },
          macd_slow: { type: 'number', default: 26 },
          macd_signal: { type: 'number', default: 9 },
          bollinger_period: { type: 'number', default: 20 },
          bollinger_std: { type: 'number', default: 2 },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await calculateTechnicalIndicators(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_volatility',
      description: 'Comprehensive volatility analysis: realized volatility, EWMA, volatility term structure, Hurst exponent to determine if market is trending (H>0.5), mean-reverting (H<0.5), or random walk (H≈0.5).',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          prices: { type: 'array', items: { type: 'number' }, description: 'Or provide prices directly' },
          windows: { type: 'array', items: { type: 'number' }, description: 'Volatility windows (default: [5, 10, 20, 50])' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeVolatility(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_stat_arb',
      description: 'Statistical arbitrage analysis between two related markets. Tests cointegration, calculates spread z-score, generates mean-reversion trading signals.',
      parameters: {
        type: 'object', properties: {
          token_id_1: { type: 'string', description: 'First token ID' },
          token_id_2: { type: 'string', description: 'Second token ID' },
          lookback: { type: 'number', default: 50 },
          entry_zscore: { type: 'number', default: 2 },
          exit_zscore: { type: 'number', default: 0.5 },
        }, required: ['token_id_1', 'token_id_2'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeStatArb(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_value_at_risk',
      description: 'Calculate VaR and CVaR (Expected Shortfall) for positions. Uses parametric, historical, and Cornish-Fisher methods.',
      parameters: {
        type: 'object', properties: {
          positions: { type: 'array', description: 'Array: { token_id, size, entry_price?, side? }', items: { type: 'object' } },
          confidence: { type: 'number', default: 0.95 },
          horizon_hours: { type: 'number', default: 24 },
          method: { type: 'string', enum: ['parametric', 'historical', 'cornish_fisher', 'all'], default: 'all' },
        }, required: ['positions'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await calculateVaR(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_entropy',
      description: 'Calculate Shannon entropy and information-theoretic measures for market probability distributions. Higher entropy = more uncertainty = potentially more trading opportunity.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          probabilities: { type: 'array', items: { type: 'number' }, description: 'Or provide probabilities directly' },
          market_slug: { type: 'string', description: 'Or fetch from market slug' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await calculateEntropy(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_news_feed',
      description: 'Fetch and analyze news articles related to a market topic. Scores sentiment, extracts key entities, and assesses potential market impact.',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Search query (market question or topic)' },
          sources: { type: 'array', items: { type: 'string' }, description: 'News sources to check' },
          max_results: { type: 'number', default: 20 },
        }, required: ['query'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await fetchNewsFeed(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_sentiment_analysis',
      description: 'Analyze sentiment of text, headlines, or market comments. Returns sentiment score (-1 to 1), confidence, and key phrases detected.',
      parameters: {
        type: 'object', properties: {
          texts: { type: 'array', items: { type: 'string' }, description: 'Array of texts to analyze' },
          text: { type: 'string', description: 'Or single text' },
          context: { type: 'string', description: 'Market context for better scoring' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeSentiment(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_generate_signal',
      description: 'Generate a composite trading signal combining orderbook, technicals, momentum, mean-reversion, fundamental edge, and volume analysis. Returns overall signal with confidence.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          market_id: { type: 'string', description: 'Market/condition ID' },
          true_probability: { type: 'number', description: 'Your estimated true probability' },
          bankroll: { type: 'number', description: 'Available capital' },
          risk_tolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'], default: 'moderate' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await generateCompositeSignal(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_correlation_matrix',
      description: 'Calculate correlation matrix between multiple prediction market tokens. Identifies diversification opportunities and correlated risks.',
      parameters: {
        type: 'object', properties: {
          token_ids: { type: 'array', items: { type: 'string' }, description: 'Array of token IDs (2-10)' },
          lookback: { type: 'number', description: 'Data points to use', default: 100 },
        }, required: ['token_ids'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await calculateCorrelationMatrix(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_efficiency_test',
      description: 'Test if a prediction market is informationally efficient. Uses runs test, autocorrelation, variance ratio, and entropy analysis.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to test' },
          prices: { type: 'array', items: { type: 'number' }, description: 'Or provide prices' },
          lookback: { type: 'number', default: 100 },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await testMarketEfficiency(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
