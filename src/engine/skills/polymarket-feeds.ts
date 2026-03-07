import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-feeds',
  name: 'Polymarket Event & Data Feeds',
  description: 'First-party data sources and event tracking for prediction markets. Event calendar, official source monitoring (government, courts, sports), odds aggregation, resolution source tracking, and breaking news from AP/Reuters/BBC.',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.globe,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_calendar_events', name: 'Event Calendar',
    description: 'Manage a structured calendar of market-moving events: elections, court rulings, earnings, fed meetings, sports events. Know what is about to happen.',
    category: 'write', risk: 'low', skillId: 'polymarket-feeds', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['list', 'add', 'remove', 'upcoming', 'auto_discover'] },
      id: { type: 'string' }, title: { type: 'string' },
      category: { type: 'string', enum: ['election', 'court', 'earnings', 'fed', 'sports', 'crypto', 'geopolitics', 'science', 'tech', 'other'] },
      event_date: { type: 'string' }, description: { type: 'string' }, source_url: { type: 'string' },
      related_markets: { type: 'string' }, impact: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      days_ahead: { type: 'number', default: 7 },
    }, required: ['action'] },
  },
  {
    id: 'poly_official_sources', name: 'Official Sources',
    description: 'Fetch data from authoritative first-party sources: White House, SCOTUS, SEC, Fed, ESPN, NOAA, Congress. First-party data beats news aggregation.',
    category: 'read', risk: 'low', skillId: 'polymarket-feeds', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      source: { type: 'string', enum: ['whitehouse', 'scotus', 'sec', 'fed', 'espn', 'noaa', 'congress', 'custom'] },
      query: { type: 'string' }, custom_url: { type: 'string' },
    }, required: ['source'] },
  },
  {
    id: 'poly_odds_aggregator', name: 'Odds Aggregator',
    description: 'Compare Polymarket prices against betting odds from other platforms. Divergence between prediction markets and sports books signals mispricing.',
    category: 'read', risk: 'low', skillId: 'polymarket-feeds', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      market_question: { type: 'string' }, polymarket_price: { type: 'number' },
      category: { type: 'string', enum: ['politics', 'sports', 'crypto', 'entertainment', 'science', 'general'] },
    }, required: ['market_question'] },
  },
  {
    id: 'poly_resolution_tracker', name: 'Resolution Tracker',
    description: 'Track how Polymarket resolves markets and monitor resolution sources directly. Get the answer before the market resolves.',
    category: 'read', risk: 'low', skillId: 'polymarket-feeds', sideEffects: [],
    parameters: { type: 'object', properties: {
      market_slug: { type: 'string' }, condition_id: { type: 'string' },
    } },
  },
  {
    id: 'poly_breaking_news', name: 'Breaking News',
    description: 'Monitor breaking news from AP, Reuters, BBC, CNN via RSS. Flags headlines most likely to impact active prediction markets. Seconds matter.',
    category: 'read', risk: 'low', skillId: 'polymarket-feeds', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      topics: { type: 'string' }, sources: { type: 'string' },
      since_minutes: { type: 'number', default: 60 },
    } },
  },
];
