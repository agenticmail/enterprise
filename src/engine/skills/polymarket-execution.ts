import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-execution',
  name: 'Polymarket Execution Edge',
  description: 'Smart order execution and position management: trailing sniper orders, TWAP/VWAP scale-in, correlation-based hedging, and automated exit strategies (take-profit, stop-loss, trailing stop, time-based exits).',
  category: 'finance',
  risk: 'critical',
  icon: Emoji.rocket,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_sniper', name: 'Sniper Order',
    description: 'Smart limit order that auto-adjusts to trail best bid/ask. Accumulates at the best possible price. Cancels if price hits ceiling.',
    category: 'write', risk: 'critical', skillId: 'polymarket-execution', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['create', 'list', 'cancel', 'status'] },
      id: { type: 'string' }, token_id: { type: 'string' },
      side: { type: 'string', enum: ['BUY', 'SELL'] }, target_price: { type: 'number' },
      max_price: { type: 'number' }, trail_amount: { type: 'number', default: 0.01 },
      size_usdc: { type: 'number' }, cancel_price: { type: 'number' },
    }, required: ['action'] },
  },
  {
    id: 'poly_scale_in', name: 'Scale In (TWAP/VWAP)',
    description: 'Split large orders into smaller time-weighted slices. Minimizes market impact on $1000+ orders in thin markets.',
    category: 'write', risk: 'high', skillId: 'polymarket-execution', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['create', 'list', 'cancel', 'status'] },
      id: { type: 'string' }, token_id: { type: 'string' },
      side: { type: 'string', enum: ['BUY', 'SELL'] }, total_size: { type: 'number' },
      slices: { type: 'number', default: 10 }, interval_minutes: { type: 'number', default: 5 },
      strategy: { type: 'string', enum: ['twap', 'vwap', 'aggressive', 'passive'], default: 'twap' },
    }, required: ['action'] },
  },
  {
    id: 'poly_hedge', name: 'Hedge Position',
    description: 'Create a hedge via opposing position in a correlated market. Reduces directional risk while capturing spread.',
    category: 'write', risk: 'high', skillId: 'polymarket-execution', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['create', 'list', 'close', 'analyze'] },
      id: { type: 'string' }, primary_token: { type: 'string' }, hedge_token: { type: 'string' },
      primary_side: { type: 'string', enum: ['BUY', 'SELL'] }, primary_size: { type: 'number' },
      hedge_ratio: { type: 'number', default: 0.5 },
    }, required: ['action'] },
  },
  {
    id: 'poly_exit_strategy', name: 'Exit Strategy',
    description: 'Automated exit rules: take-profit, stop-loss, trailing stop, time-based exits. Never hold a position without an exit plan.',
    category: 'write', risk: 'high', skillId: 'polymarket-execution', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['create', 'list', 'remove', 'check'] },
      id: { type: 'string' }, token_id: { type: 'string' }, entry_price: { type: 'number' },
      position_size: { type: 'number' }, take_profit: { type: 'number' }, stop_loss: { type: 'number' },
      trailing_stop_pct: { type: 'number' }, time_exit: { type: 'string' },
    }, required: ['action'] },
  },
];
