import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-social',
  name: 'Polymarket Social Intelligence',
  description: 'Real-time social media and community sentiment analysis for prediction markets. Twitter/X sentiment, Polymarket comment scraping, Reddit pulse monitoring, Telegram channel tracking, and cross-platform mention velocity detection.',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.chat,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_twitter_sentiment', name: 'Twitter Sentiment',
    description: 'Analyze Twitter/X sentiment for prediction market topics via Google News proxy. Detects sentiment spikes preceding market moves.',
    category: 'read', risk: 'low', skillId: 'polymarket-social', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query' },
      include_polymarket: { type: 'boolean', default: true },
    }, required: ['query'] },
  },
  {
    id: 'poly_polymarket_comments', name: 'Polymarket Comments',
    description: 'Scrape and analyze Polymarket market comments. Comment sections often contain insider-tier information before price moves.',
    category: 'read', risk: 'low', skillId: 'polymarket-social', sideEffects: [],
    parameters: { type: 'object', properties: {
      market_slug: { type: 'string', description: 'Market slug or condition ID' },
      sort: { type: 'string', enum: ['recent', 'top', 'controversial'], default: 'recent' },
    }, required: ['market_slug'] },
  },
  {
    id: 'poly_reddit_pulse', name: 'Reddit Pulse',
    description: 'Monitor Reddit discussions across r/polymarket, r/politics, r/sports, and custom subreddits. Reddit surfaces info 6-12 hours before mainstream media.',
    category: 'read', risk: 'low', skillId: 'polymarket-social', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query' },
      subreddits: { type: 'string', description: 'Comma-separated subreddits' },
      timeframe: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
    }, required: ['query'] },
  },
  {
    id: 'poly_telegram_monitor', name: 'Telegram Monitor',
    description: 'Monitor public Telegram channels for prediction market alpha. Scrapes public channels via web preview.',
    category: 'read', risk: 'low', skillId: 'polymarket-social', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      channels: { type: 'string', description: 'Comma-separated channel usernames' },
      query: { type: 'string', description: 'Optional keyword filter' },
      limit: { type: 'number', default: 20 },
    }, required: ['channels'] },
  },
  {
    id: 'poly_social_velocity', name: 'Social Velocity',
    description: 'Track cross-platform mention velocity. Measures discussion acceleration across Twitter, Reddit, news. Sudden spikes are leading indicators of market moves.',
    category: 'read', risk: 'low', skillId: 'polymarket-social', sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      topic: { type: 'string', description: 'Topic to track' },
      compare_topic: { type: 'string', description: 'Optional comparison topic' },
    }, required: ['topic'] },
  },
];
