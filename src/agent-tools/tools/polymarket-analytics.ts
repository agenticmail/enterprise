/**
 * Polymarket Advanced Analytics Tools — Thin wrappers around polymarket-engines/analytics
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { findCorrelations, scanArbitrage, detectRegime, calculateSmartMoneyIndex, analyzeMicrostructure } from '../../polymarket-engines/analytics.js';

export function createPolymarketAnalyticsTools(_opts?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'poly_market_correlation',
      description: 'Find price correlations between prediction market tokens. Identifies hedging opportunities and correlated risks.',
      parameters: {
        type: 'object', properties: {
          token_ids: { type: 'array', items: { type: 'string' }, description: 'Array of token IDs (2-10)' },
          min_correlation: { type: 'number', description: 'Minimum abs correlation to report', default: 0.5 },
        }, required: ['token_ids'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await findCorrelations(p.token_ids, p.min_correlation)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_arbitrage_scanner',
      description: 'Scan for arbitrage opportunities: YES+NO != $1, multi-outcome mispricings, cross-market divergence.',
      parameters: {
        type: 'object', properties: {
          market_slugs: { type: 'array', items: { type: 'string' }, description: 'Specific markets to scan (or omit for top markets)' },
          scan_type: { type: 'string', enum: ['yes_no', 'cross_market', 'multi_outcome', 'all'], default: 'all' },
          min_profit_pct: { type: 'number', description: 'Minimum profit % to flag', default: 0.5 },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await scanArbitrage(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_regime_detector',
      description: 'Detect market regime: TRENDING, MEAN_REVERTING, or RANDOM_WALK using Hurst exponent and trend analysis. Returns regime-specific trading strategies.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          lookback: { type: 'number', description: 'Data points to analyze', default: 72 },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await detectRegime(p.token_id, p.lookback)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_smart_money_index',
      description: 'Calculate a composite Smart Money Index combining orderbook imbalance, trade flow direction, price momentum, and news sentiment.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          market_question: { type: 'string', description: 'Market question (for news sentiment component)' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await calculateSmartMoneyIndex(p.token_id, p.market_question)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_market_microstructure',
      description: 'Analyze market microstructure: spread, depth, slippage simulation for various order sizes, and optimal order type recommendation.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          order_sizes: { type: 'array', items: { type: 'number' }, description: 'USDC sizes to simulate (default: [100, 500, 1000, 5000])' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeMicrostructure(p.token_id, p.order_sizes)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
