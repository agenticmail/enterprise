import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-watcher',
  name: 'Polymarket Watcher',
  description: 'AI-powered 24/7 market surveillance engine. Uses configurable LLM (Grok, GPT-4o-mini, etc.) for real-time news analysis, geopolitical pattern detection, sentiment tracking, and cross-signal correlation. Auto-wakes agents on critical events.',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.eye,
  source: 'builtin',
  version: '2.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_watcher', name: 'Market Monitor Manager',
    description: 'Manage automated market monitors with AI analysis. Types: price_level, price_change, market_scan, news_intelligence, crypto_price, resolution_watch, portfolio_drift, volume_surge, geopolitical, cross_signal, arbitrage_scan, sentiment_shift.',
    category: 'write', risk: 'low', skillId: 'polymarket-watcher', sideEffects: ['database_write'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['create', 'list', 'delete', 'pause', 'resume'] },
      id: { type: 'string' },
      watcher_type: { type: 'string', enum: ['price_level', 'price_change', 'market_scan', 'news_intelligence', 'crypto_price', 'resolution_watch', 'portfolio_drift', 'volume_surge', 'geopolitical', 'cross_signal', 'arbitrage_scan', 'sentiment_shift'] },
      name: { type: 'string' },
      config: { type: 'object' },
      interval_minutes: { type: 'number' },
    }, required: ['action'] },
  },
  {
    id: 'poly_watcher_config', name: 'Watcher AI Config',
    description: 'Configure the AI model for background market analysis. Set provider (xai/openai/groq/etc.), model, API key, daily analysis budget, and spawn limits.',
    category: 'write', risk: 'low', skillId: 'polymarket-watcher', sideEffects: ['database_write'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['get', 'set', 'stats'] },
      ai_provider: { type: 'string', enum: ['xai', 'openai', 'groq', 'cerebras', 'together', 'openrouter', 'deepseek', 'fireworks'] },
      ai_model: { type: 'string' },
      ai_api_key: { type: 'string' },
      analysis_budget_daily: { type: 'number' },
      max_spawn_per_hour: { type: 'number' },
    }, required: ['action'] },
  },
  {
    id: 'poly_watcher_events', name: 'Watcher Signals',
    description: 'Check AI-analyzed signals from watchers. ALWAYS check at session start. Shows market impact, sentiment, reasoning, recommended actions.',
    category: 'read', risk: 'low', skillId: 'polymarket-watcher', sideEffects: [],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['check', 'list', 'acknowledge', 'acknowledge_all'] },
      id: { type: 'string' },
      severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
      limit: { type: 'number' },
    }, required: ['action'] },
  },
  {
    id: 'poly_setup_monitors', name: 'Full Monitoring Suite',
    description: 'One-call setup: Creates comprehensive monitoring with AI news intelligence, geopolitical scanner, cross-signal correlator, sentiment trackers, price alerts, and more. Requires poly_watcher_config first.',
    category: 'write', risk: 'low', skillId: 'polymarket-watcher', sideEffects: ['database_write'],
    parameters: { type: 'object', properties: {
      keywords: { type: 'array', items: { type: 'string' } },
      regions: { type: 'array', items: { type: 'string' } },
      crypto_threshold_pct: { type: 'number' },
      portfolio_drift_pct: { type: 'number' },
      sentiment_topics: { type: 'array', items: { type: 'string' } },
    }, required: [] },
  },
];
