/**
 * Polymarket Counter-Intelligence Tools — Thin wrappers around polymarket-engines/counterintel
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { detectManipulation, assessResolutionRisk, analyzeCounterparties } from '../../polymarket-engines/counterintel.js';

export function createPolymarketCounterintelTools(_opts?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'poly_manipulation_detector',
      description: 'Detect market manipulation: wash trading, volume concentration, rapid-fire trading, price manipulation (pump/dump), and orderbook layering.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to scan' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await detectManipulation(p.token_id)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_resolution_risk',
      description: 'Assess resolution risk: ambiguous language, subjective criteria, missing sources, low liquidity, complex conditions. Scores overall risk.',
      parameters: {
        type: 'object', properties: {
          market_slug: { type: 'string', description: 'Market slug' },
          condition_id: { type: 'string', description: 'Or condition ID' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await assessResolutionRisk(p.market_slug, p.condition_id)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_counterparty_analysis',
      description: 'Analyze who is trading on the other side of your position. Breaks down traders into whales/mid/retail and assesses risk.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID' },
          side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Your intended side (to analyze counterparties on opposite side)' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeCounterparties(p.token_id, p.side)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
