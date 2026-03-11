import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-pipeline',
  name: 'Polymarket Unified Analysis Pipeline',
  description: 'Unified analysis pipeline chaining ALL engines: screener → quant (Kelly/Black-Scholes/Monte Carlo) → analytics (regime/smart money) → on-chain (orderbook/whales/flow) → social (Twitter/Reddit) → feeds (news/odds) → counter-intel (manipulation/risk) → portfolio. Run full or quick analysis on any market.',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.barChart,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_full_analysis', name: 'Full Market Analysis',
    description: 'Run the COMPLETE analysis pipeline on a market. Chains screener → quant → analytics → onchain → social → feeds → counterintel. Returns synthesized score (0-100), action, Kelly sizing, and detailed results from every stage. Use this before making trading decisions.',
    category: 'read', risk: 'low', skillId: 'polymarket-pipeline', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string', description: 'Token ID to analyze' },
      market_slug: { type: 'string', description: 'Market slug (for resolution/risk data)' },
      market_question: { type: 'string', description: 'Market question (for social/news analysis)' },
      bankroll: { type: 'number', description: 'Available capital for Kelly sizing', default: 100 },
      estimated_true_prob: { type: 'number', description: 'Your estimated true probability' },
      side: { type: 'string', enum: ['BUY', 'SELL'] },
      skip_slow: { type: 'boolean', description: 'Skip social/feeds for speed', default: false },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_quick_analysis', name: 'Quick Market Analysis',
    description: 'Fast analysis: quant + orderbook + regime + smart money + manipulation check. Returns score, action, Kelly sizing, thesis. Use for rapid decisions or screening.',
    category: 'read', risk: 'low', skillId: 'polymarket-pipeline', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string', description: 'Token ID' },
      market_question: { type: 'string', description: 'Market question' },
      bankroll: { type: 'number', default: 100 },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_batch_screen', name: 'Batch Market Screen',
    description: 'Screen and rank multiple markets using 6-dimension scoring. Strategy modes: momentum, contested, best_opportunities, high_volume, closing_soon, mispriced, safe_bets, new_markets.',
    category: 'read', risk: 'low', skillId: 'polymarket-pipeline', sideEffects: [],
    parameters: { type: 'object', properties: {
      query: { type: 'string' },
      limit: { type: 'number', default: 10 },
      strategy: { type: 'string', enum: ['momentum', 'contested', 'best_opportunities', 'high_volume', 'closing_soon', 'mispriced', 'safe_bets', 'new_markets'] },
      min_score: { type: 'number' },
    } },
  },
  {
    id: 'poly_portfolio_review', name: 'Portfolio Review',
    description: 'Complete portfolio review: position overview + correlation matrix + Kelly optimal sizing + P&L attribution + actionable recommendations.',
    category: 'read', risk: 'low', skillId: 'polymarket-pipeline', sideEffects: [],
    parameters: { type: 'object', properties: {
      positions: { type: 'string', description: 'JSON array: [{ token_id, market, outcome, size, avg_price }]' },
      bankroll: { type: 'number', description: 'Total capital' },
      closed_trades: { type: 'string', description: 'JSON array: [{ market, pnl }] for attribution' },
    }, required: ['positions', 'bankroll'] },
  },
];
