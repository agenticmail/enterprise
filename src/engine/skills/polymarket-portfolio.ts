import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-portfolio',
  name: 'Polymarket Portfolio Management',
  description: 'Portfolio-level analysis and optimization: mean-variance portfolio optimization, real-time drawdown monitoring with circuit breakers, and P&L attribution by strategy, signal source, and market category.',
  category: 'finance',
  risk: 'high',
  icon: Emoji.chartUp,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_portfolio_optimizer', name: 'Portfolio Optimizer',
    description: 'Mean-variance optimization across open positions. Calculates optimal weights to maximize Sharpe ratio and suggests rebalancing trades.',
    category: 'read', risk: 'low', skillId: 'polymarket-portfolio', sideEffects: [],
    parameters: { type: 'object', properties: {
      positions: { type: 'string', description: 'JSON array of positions with expected_return and confidence' },
      risk_tolerance: { type: 'number', default: 0.5 },
      total_capital: { type: 'number' },
      max_single_position_pct: { type: 'number', default: 25 },
    }, required: ['positions', 'total_capital'] },
  },
  {
    id: 'poly_drawdown_monitor', name: 'Drawdown Monitor',
    description: 'Real-time drawdown tracking with automatic alerts and position reduction. Circuit breaker for risk management. Tracks daily P&L.',
    category: 'read', risk: 'low', skillId: 'polymarket-portfolio', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['check', 'history', 'set_limits'] },
      current_value: { type: 'number' }, peak_value: { type: 'number' },
      warning_pct: { type: 'number', default: 10 }, critical_pct: { type: 'number', default: 20 },
      daily_loss_limit: { type: 'number' },
    }, required: ['action'] },
  },
  {
    id: 'poly_pnl_attribution', name: 'P&L Attribution',
    description: 'Attribute P&L to strategies, signals, and market categories. Kill losers, double down on winners. Uses trade log and prediction data.',
    category: 'read', risk: 'low', skillId: 'polymarket-portfolio', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['analyze', 'record', 'summary'] },
      period: { type: 'string', enum: ['today', 'week', 'month', 'all'], default: 'all' },
      strategy: { type: 'string' }, category: { type: 'string' },
      signal_source: { type: 'string' }, pnl: { type: 'number' },
      is_win: { type: 'boolean' }, hold_hours: { type: 'number' },
    }, required: ['action'] },
  },
];
