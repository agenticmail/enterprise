/**
 * Polymarket Unified Pipeline Tool — Thin wrapper around polymarket-engines/pipeline
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { fullAnalysis, quickAnalysis, batchScreen, portfolioReview } from '../../polymarket-engines/pipeline.js';

export function createPolymarketPipelineTools(_opts?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'poly_full_analysis',
      description: 'Run the COMPLETE analysis pipeline on a market: screener → quant (Kelly, technicals, volatility, Monte Carlo, VaR) → analytics (regime, smart money, microstructure) → on-chain (orderbook, whales, flow) → social (Twitter, Reddit, velocity) → feeds (odds comparison, resolution) → counter-intel (manipulation, risk, counterparties). Returns a synthesized score (0-100), action recommendation, and detailed results from every stage.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          market_slug: { type: 'string', description: 'Market slug (for resolution/risk data)' },
          condition_id: { type: 'string', description: 'Condition ID' },
          market_question: { type: 'string', description: 'Market question (for social/news analysis)' },
          current_price: { type: 'number', description: 'Current price (auto-fetched if omitted)' },
          bankroll: { type: 'number', description: 'Available capital for Kelly sizing', default: 100 },
          estimated_true_prob: { type: 'number', description: 'Your estimated true probability' },
          side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Intended trading side' },
          skip_slow: { type: 'boolean', description: 'Skip social/feeds stages for speed', default: false },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try {
          return jsonResult(await fullAnalysis({
            tokenId: p.token_id, marketSlug: p.market_slug, conditionId: p.condition_id,
            marketQuestion: p.market_question, currentPrice: p.current_price,
            bankroll: p.bankroll, estimatedTrueProb: p.estimated_true_prob,
            side: p.side, skipSlow: p.skip_slow,
          }));
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_quick_analysis',
      description: 'Fast analysis subset: quant + orderbook + regime + smart money + manipulation check. Returns score, action, Kelly sizing, and thesis. Use for dashboard buy modal or quick decisions.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID' },
          market_question: { type: 'string', description: 'Market question' },
          bankroll: { type: 'number', description: 'Available capital', default: 100 },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await quickAnalysis(p.token_id, p.market_question, p.bankroll)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_batch_screen',
      description: 'Screen and rank multiple markets. Alias for poly_screen_markets with pipeline integration.',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', default: 10 },
          strategy: {
            type: 'string',
            enum: ['momentum', 'contested', 'best_opportunities', 'high_volume', 'closing_soon', 'mispriced', 'safe_bets', 'new_markets'],
          },
          min_score: { type: 'number', description: 'Minimum score to include' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await batchScreen(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_portfolio_review',
      description: 'Complete portfolio review: overview + correlation matrix + Kelly sizing + P&L attribution + actionable recommendations.',
      parameters: {
        type: 'object', properties: {
          positions: {
            type: 'array', description: 'Array: { token_id, market, outcome, size, avg_price }',
            items: { type: 'object' },
          },
          bankroll: { type: 'number', description: 'Total capital' },
          closed_trades: {
            type: 'array', description: 'Array: { market, pnl } for P&L attribution',
            items: { type: 'object' },
          },
        }, required: ['positions', 'bankroll'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await portfolioReview({ positions: p.positions, bankroll: p.bankroll, closedTrades: p.closed_trades })); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
