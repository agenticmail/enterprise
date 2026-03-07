import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-analytics',
  name: 'Polymarket Advanced Analytics',
  description: 'Cross-market analytical tools: Pearson correlation detection, YES/NO and multi-outcome arbitrage scanning, regime detection (Hurst exponent), smart money composite index, and market microstructure analysis (slippage simulation, fill probability).',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.barChart,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_market_correlation', name: 'Market Correlation',
    description: 'Find correlated markets via Pearson correlation on price histories. Strongly correlated markets priced differently = free money.',
    category: 'read', risk: 'low', skillId: 'polymarket-analytics', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      token_ids: { type: 'string', description: 'Comma-separated token IDs (2-10)' },
      min_correlation: { type: 'number', default: 0.5 },
    }, required: ['token_ids'] },
  },
  {
    id: 'poly_arbitrage_scanner', name: 'Arbitrage Scanner',
    description: 'Scan for arbitrage: YES+NO != $1.00, same event priced differently, multi-outcome sums != 1. Free money detection.',
    category: 'read', risk: 'low', skillId: 'polymarket-analytics', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      market_slugs: { type: 'string' },
      scan_type: { type: 'string', enum: ['yes_no', 'cross_market', 'multi_outcome', 'all'], default: 'all' },
      min_profit_pct: { type: 'number', default: 0.5 },
    } },
  },
  {
    id: 'poly_regime_detector', name: 'Regime Detector',
    description: 'Determine market regime: trending (H>0.55), mean-reverting (H<0.45), or random walk (H~0.5). Uses Hurst exponent + volatility. Different regimes need different strategies.',
    category: 'read', risk: 'low', skillId: 'polymarket-analytics', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' },
      lookback: { type: 'number', default: 72 },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_smart_money_index', name: 'Smart Money Index',
    description: 'Composite score combining whale flow + orderbook imbalance + momentum + news sentiment. One number: "smart money is moving."',
    category: 'read', risk: 'low', skillId: 'polymarket-analytics', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' },
      market_question: { type: 'string', description: 'For news/social lookup' },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_market_microstructure', name: 'Market Microstructure',
    description: 'Spread dynamics, fill probability, estimated slippage for various order sizes, execution quality metrics. Essential for optimizing order placement.',
    category: 'read', risk: 'low', skillId: 'polymarket-analytics', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' },
      order_sizes: { type: 'string', description: 'Comma-separated sizes in USDC (default: "100,500,1000,5000")' },
    }, required: ['token_id'] },
  },
];
