/**
 * Polymarket Social Intelligence Tools — Thin wrappers around polymarket-engines/social
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { analyzeTwitterSentiment, analyzePolymarketComments, monitorRedditPulse, monitorTelegram, measureSocialVelocity } from '../../polymarket-engines/social.js';

export function createPolymarketSocialTools(_opts?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'poly_twitter_sentiment',
      description: 'Analyze Twitter/X sentiment for a topic via Google News RSS proxy. Returns overall sentiment, mention count, and topics detected.',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Search query' },
          include_polymarket: { type: 'boolean', description: 'Also search with "polymarket" appended', default: true },
        }, required: ['query'],
      },
      async execute(_id: string, p: any) {
        try {
          const raw = await analyzeTwitterSentiment(p.query, p.include_polymarket);
          // Trim to reduce token usage — full results can be 15K+ chars
          return jsonResult({
            query: raw.query,
            overall_sentiment: raw.overall_sentiment,
            sentiment_label: raw.sentiment_label,
            total_mentions: raw.total_mentions,
            signal: raw.signal,
            topics_detected: raw.topics_detected,
            // Only top 5 items per query, title+sentiment only
            results: (raw.results || []).map((r: any) => ({
              query: r.query,
              avg_sentiment: r.avg_sentiment,
              volume: r.volume,
              items: (r.items || []).slice(0, 5).map((i: any) => ({
                title: i.title, sentiment: i.sentiment, source: i.source,
              })),
            })),
          });
        }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_polymarket_comments',
      description: 'Analyze sentiment in Polymarket market comments section. Returns bullish/bearish breakdown and top comments.',
      parameters: {
        type: 'object', properties: {
          market_slug: { type: 'string', description: 'Market slug' },
        }, required: ['market_slug'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzePolymarketComments(p.market_slug)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_reddit_pulse',
      description: 'Monitor Reddit discussion on a topic across subreddits. Returns sentiment, trending posts, and engagement metrics.',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Search query' },
          subreddits: { type: 'array', items: { type: 'string' }, description: 'Subreddits (default: polymarket, politics, sports, worldnews)' },
          timeframe: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
        }, required: ['query'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await monitorRedditPulse(p.query, p.subreddits, p.timeframe)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_telegram_monitor',
      description: 'Monitor public Telegram channels for discussion on a topic. Scrapes recent messages and scores sentiment.',
      parameters: {
        type: 'object', properties: {
          channels: { type: 'array', items: { type: 'string' }, description: 'Channel handles (e.g. @polymarket_alerts)' },
          query: { type: 'string', description: 'Optional filter query' },
          limit: { type: 'number', default: 20 },
        }, required: ['channels'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await monitorTelegram(p.channels, p.query, p.limit)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_social_velocity',
      description: 'Measure social discussion velocity (spike detection). Compares recent vs baseline mention rates to detect surges in attention.',
      parameters: {
        type: 'object', properties: {
          topic: { type: 'string', description: 'Topic to measure' },
          compare_topic: { type: 'string', description: 'Optional comparison topic' },
        }, required: ['topic'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await measureSocialVelocity(p.topic, p.compare_topic)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
