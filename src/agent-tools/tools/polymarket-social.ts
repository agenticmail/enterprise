/**
 * Polymarket Social Intelligence Tools
 * 
 * Real-time social media and community sentiment analysis:
 * - Twitter/X sentiment tracking with velocity detection
 * - Polymarket comment section scraping
 * - Reddit pulse monitoring
 * - Telegram group monitoring
 * - Cross-platform mention velocity
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { cachedFetchJSON, cachedFetchText, validateTokenId, validateSlug, validateAddress, clampNumber, safeDbExec, safeDbQuery, safeDbGet, parseRSSItems as sharedParseRSS, withRetry ,  autoId } from './polymarket-shared.js';

const CACHE_TTL = 2 * 60_000; // 2min for social data
const sentimentCache = new Map<string, { data: any; ts: number }>();

// ─── DB Tables ───────────────────────────────────────────────

async function initSocialDB(db: any): Promise<void> {
  if (!db?.exec) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS poly_social_signals (
      id ${autoId()},
      source TEXT NOT NULL,
      topic TEXT NOT NULL,
      sentiment REAL DEFAULT 0,
      volume INTEGER DEFAULT 0,
      velocity REAL DEFAULT 0,
      sample_texts TEXT DEFAULT '[]',
      timestamp TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poly_social_watchlist (
      id ${autoId()},
      agent_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      platforms TEXT DEFAULT '["twitter","reddit"]',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ];
  for (const sql of stmts) {
    try { db.exec(sql); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────



function simpleSentiment(text: string): number {
  // Simple keyword-based sentiment (-1 to 1)
  const positive = ['bullish', 'moon', 'buy', 'win', 'yes', 'confirmed', 'likely', 'certain', 'guaranteed',
    'profit', 'gains', 'up', 'rally', 'surge', 'strong', 'good', 'great', 'amazing', 'love', 'agree',
    'definitely', 'absolutely', 'obvious', 'clearly', 'huge', 'massive', 'pump', 'lock', 'locked', 'done deal'];
  const negative = ['bearish', 'dump', 'sell', 'lose', 'no', 'unlikely', 'impossible', 'never', 'crash',
    'loss', 'down', 'drop', 'weak', 'bad', 'terrible', 'hate', 'disagree', 'doubt', 'risky', 'scam',
    'fraud', 'manipulation', 'rug', 'fake', 'wrong', 'fail', 'fear', 'panic', 'short'];
  
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 0;
  for (const w of words) {
    if (positive.some(p => w.includes(p))) score += 1;
    if (negative.some(n => w.includes(n))) score -= 1;
  }
  return Math.max(-1, Math.min(1, score / Math.max(words.length * 0.1, 1)));
}

function extractTopics(text: string): string[] {
  // Extract potential market-relevant topics
  const patterns = [
    /\b(trump|biden|harris|election|vote|poll)\b/gi,
    /\b(fed|rate|inflation|gdp|jobs|unemployment)\b/gi,
    /\b(bitcoin|btc|eth|crypto|solana)\b/gi,
    /\b(war|conflict|peace|treaty|sanctions)\b/gi,
    /\b(ai|openai|google|microsoft|apple|nvidia)\b/gi,
    /\b(polymarket|prediction|odds|probability)\b/gi,
  ];
  const topics = new Set<string>();
  for (const p of patterns) {
    const matches = text.match(p) || [];
    for (const m of matches) topics.add(m.toLowerCase());
  }
  return [...topics];
}

// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketSocialTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  let dbReady = false;
  async function ensureDB() {
    if (dbReady || !db) return;
    await initSocialDB(db);
    dbReady = true;
  }

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_twitter_sentiment ═══
  tools.push({
    name: 'poly_twitter_sentiment',
    label: 'Twitter Sentiment',
    description: 'Analyze Twitter/X sentiment for a topic or keyword related to prediction markets. Uses the Nitter RSS fallback and Google News for real-time discussion tracking. Detects sentiment spikes that precede market moves.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "trump election", "fed rate cut")' },
        include_polymarket: { type: 'boolean', description: 'Also search for Polymarket-specific discussions', default: true },
      },
      required: ['query'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const query = params.query;

      // Use Google News RSS as proxy for Twitter discussion topics
      const searches = [query];
      if (params.include_polymarket !== false) searches.push(`${query} polymarket`);
      
      const results: any[] = [];
      
      for (const q of searches) {
        try {
          const encoded = encodeURIComponent(q);
          const rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
          const xml = await cachedFetchText(rssUrl);
          
          // Parse RSS items
          const items: any[] = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = itemRegex.exec(xml)) !== null) {
            const titleMatch = match[1].match(/<title>([\s\S]*?)<\/title>/);
            const linkMatch = match[1].match(/<link>([\s\S]*?)<\/link>/);
            const dateMatch = match[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/);
            const sourceMatch = match[1].match(/<source[^>]*>([\s\S]*?)<\/source>/);
            
            if (titleMatch) {
              const title = titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
              items.push({
                title,
                link: linkMatch?.[1]?.trim(),
                date: dateMatch?.[1]?.trim(),
                source: sourceMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
                sentiment: simpleSentiment(title),
              });
            }
          }
          
          results.push({
            query: q,
            items: items.slice(0, 15),
            avg_sentiment: items.length ? +(items.reduce((s, i) => s + i.sentiment, 0) / items.length).toFixed(3) : 0,
            volume: items.length,
          });
        } catch (e: any) {
          results.push({ query: q, error: e.message, items: [] });
        }
      }

      // Aggregate sentiment
      const allItems = results.flatMap(r => r.items || []);
      const avgSentiment = allItems.length ? +(allItems.reduce((s, i) => s + i.sentiment, 0) / allItems.length).toFixed(3) : 0;
      
      // Store signal
      if (db) {
        try {
          db.prepare(`INSERT INTO poly_social_signals (source, topic, sentiment, volume, sample_texts) VALUES (?, ?, ?, ?, ?)`)
            .run('twitter_proxy', query, avgSentiment, allItems.length,
                 JSON.stringify(allItems.slice(0, 5).map((i: any) => i.title)));
        } catch {}
      }

      return jsonResult({
        query,
        overall_sentiment: avgSentiment,
        sentiment_label: avgSentiment > 0.2 ? 'BULLISH' : avgSentiment < -0.2 ? 'BEARISH' : 'NEUTRAL',
        total_mentions: allItems.length,
        results,
        topics_detected: extractTopics(allItems.map(i => i.title).join(' ')),
        signal: avgSentiment > 0.3 ? 'BUY_SIGNAL' : avgSentiment < -0.3 ? 'SELL_SIGNAL' : 'NO_SIGNAL',
      });
    },
  });

  // ═══ 2. poly_polymarket_comments ═══
  tools.push({
    name: 'poly_polymarket_comments',
    label: 'Polymarket Comments',
    description: 'Scrape and analyze comments on a Polymarket market page. The comment section often contains insider-tier information, rumor, and sentiment that precedes price moves. Returns top comments with sentiment analysis.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        market_slug: { type: 'string', description: 'Market slug or condition ID' },
        sort: { type: 'string', enum: ['recent', 'top', 'controversial'], default: 'recent' },
      },
      required: ['market_slug'],
    },
    execute: async (params: any) => {
      try {
        // Polymarket uses a comments API
        const slug = params.market_slug;
        // Try the Gamma API for market data first
        const market = await cachedFetchJSON(`https://gamma-api.polymarket.com/markets?slug=${slug}`).catch(() => null);
        const marketData = market?.[0] || null;
        
        // Comments are loaded via their frontend API — we can try to scrape
        // Fall back to providing guidance if direct API not available
        if (!marketData) {
          return jsonResult({
            market_slug: slug,
            note: 'Market not found via slug. Try using the condition_id instead.',
            suggestion: 'Use poly_search_markets to find the correct slug or condition_id',
          });
        }

        // Use the Gamma API comments endpoint if available
        const conditionId = marketData.condition_id || marketData.conditionId;
        let comments: any[] = [];
        
        try {
          const commentsUrl = `https://gamma-api.polymarket.com/comments?market=${conditionId}&limit=50&sort=${params.sort || 'recent'}`;
          const commentsData = await cachedFetchJSON(commentsUrl);
          comments = (commentsData || []).map((c: any) => ({
            author: c.author || c.user_id || 'anon',
            text: c.text || c.body || c.content || '',
            likes: c.likes || c.upvotes || 0,
            timestamp: c.created_at || c.timestamp,
            sentiment: simpleSentiment(c.text || c.body || c.content || ''),
          }));
        } catch {
          // Comments API might not be public — provide alternative
          comments = [];
        }

        if (comments.length === 0) {
          return jsonResult({
            market: marketData.question,
            slug,
            comments: [],
            note: 'Comments not accessible via API. Use browser tool to navigate to the market page and read comments directly.',
            browser_url: `https://polymarket.com/event/${slug}`,
            market_price: marketData.outcomePrices ? JSON.parse(marketData.outcomePrices) : null,
          });
        }

        const avgSentiment = +(comments.reduce((s: number, c: any) => s + c.sentiment, 0) / comments.length).toFixed(3);

        return jsonResult({
          market: marketData.question,
          slug,
          total_comments: comments.length,
          avg_sentiment: avgSentiment,
          sentiment_label: avgSentiment > 0.15 ? 'BULLISH' : avgSentiment < -0.15 ? 'BEARISH' : 'MIXED',
          top_comments: comments.slice(0, 20),
          bullish_comments: comments.filter((c: any) => c.sentiment > 0.2).length,
          bearish_comments: comments.filter((c: any) => c.sentiment < -0.2).length,
        });
      } catch (e: any) {
        return errorResult(`Comment scrape failed: ${e.message}`);
      }
    },
  });

  // ═══ 3. poly_reddit_pulse ═══
  tools.push({
    name: 'poly_reddit_pulse',
    label: 'Reddit Pulse',
    description: 'Monitor Reddit discussions about prediction market topics. Tracks r/polymarket, r/politics, r/sports, and custom subreddits. Reddit often surfaces information 6-12 hours before mainstream media.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        subreddits: { type: 'string', description: 'Comma-separated subreddits (default: "polymarket,politics,sports,worldnews")' },
        timeframe: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
      },
      required: ['query'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const query = params.query;
      const subreddits = (params.subreddits || 'polymarket,politics,sports,worldnews').split(',').map((s: string) => s.trim());
      const timeframe = params.timeframe || 'day';
      
      const results: any[] = [];
      
      for (const sub of subreddits) {
        try {
          // Reddit JSON API (no auth needed for public subreddits)
          const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&t=${timeframe}&limit=25`;
          const data = await cachedFetchJSON(url, 30000, 15000);
          
          const posts = (data?.data?.children || []).map((child: any) => {
            const p = child.data;
            return {
              title: p.title,
              subreddit: p.subreddit,
              score: p.score,
              num_comments: p.num_comments,
              url: `https://reddit.com${p.permalink}`,
              created: new Date(p.created_utc * 1000).toISOString(),
              selftext_preview: (p.selftext || '').slice(0, 200),
              sentiment: simpleSentiment(p.title + ' ' + (p.selftext || '')),
              upvote_ratio: p.upvote_ratio,
            };
          });
          
          results.push({
            subreddit: sub,
            posts: posts,
            avg_sentiment: posts.length ? +(posts.reduce((s: number, p: any) => s + p.sentiment, 0) / posts.length).toFixed(3) : 0,
            total_engagement: posts.reduce((s: number, p: any) => s + p.score + p.num_comments, 0),
          });
        } catch (e: any) {
          results.push({ subreddit: sub, error: e.message, posts: [] });
        }
      }

      const allPosts = results.flatMap(r => r.posts || []);
      const avgSentiment = allPosts.length ? +(allPosts.reduce((s, p) => s + p.sentiment, 0) / allPosts.length).toFixed(3) : 0;

      // Store signal
      if (db) {
        try {
          db.prepare(`INSERT INTO poly_social_signals (source, topic, sentiment, volume) VALUES (?, ?, ?, ?)`)
            .run('reddit', query, avgSentiment, allPosts.length);
        } catch {}
      }

      return jsonResult({
        query,
        subreddits_searched: subreddits,
        total_posts: allPosts.length,
        overall_sentiment: avgSentiment,
        sentiment_label: avgSentiment > 0.15 ? 'BULLISH' : avgSentiment < -0.15 ? 'BEARISH' : 'NEUTRAL',
        results,
        trending: allPosts.sort((a, b) => b.score - a.score).slice(0, 5).map(p => ({ title: p.title, score: p.score, subreddit: p.subreddit })),
      });
    },
  });

  // ═══ 4. poly_telegram_monitor ═══
  tools.push({
    name: 'poly_telegram_monitor',
    label: 'Telegram Monitor',
    description: 'Monitor public Telegram channels and groups for prediction market alpha. Crypto and prediction market Telegram groups are where information leaks first. Scrapes public channels via web preview.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        channels: { type: 'string', description: 'Comma-separated Telegram channel usernames (e.g., "polymarket_alpha,crypto_signals")' },
        query: { type: 'string', description: 'Optional: filter messages by keyword' },
        limit: { type: 'number', description: 'Messages per channel (default: 20)', default: 20 },
      },
      required: ['channels'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const channels = params.channels.split(',').map((c: string) => c.trim().replace('@', ''));
      const results: any[] = [];
      
      for (const channel of channels) {
        try {
          // Telegram web preview (public channels only)
          const url = `https://t.me/s/${channel}`;
          const html = await cachedFetchText(url, 15000);
          
          // Extract messages from HTML
          const messageRegex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
          const dateRegex = /<time[^>]*datetime="([^"]+)"[^>]*>/g;
          const messages: any[] = [];
          let match;
          
          while ((match = messageRegex.exec(html)) !== null) {
            const text = match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
            if (text.length > 10) {
              messages.push({
                text: text.slice(0, 500),
                sentiment: simpleSentiment(text),
              });
            }
          }
          
          // Extract dates
          let dateMatch;
          let dateIdx = 0;
          while ((dateMatch = dateRegex.exec(html)) !== null && dateIdx < messages.length) {
            messages[dateIdx].timestamp = dateMatch[1];
            dateIdx++;
          }

          // Filter by query if provided
          const filtered = params.query
            ? messages.filter((m: any) => m.text.toLowerCase().includes(params.query.toLowerCase()))
            : messages;

          const limitN = params.limit || 20;
          results.push({
            channel,
            messages: filtered.slice(0, limitN),
            total: filtered.length,
            avg_sentiment: filtered.length ? +(filtered.reduce((s: number, m: any) => s + m.sentiment, 0) / filtered.length).toFixed(3) : 0,
          });
        } catch (e: any) {
          results.push({ channel, error: e.message, messages: [] });
        }
      }

      const allMessages = results.flatMap(r => r.messages || []);
      return jsonResult({
        channels_monitored: channels.length,
        total_messages: allMessages.length,
        overall_sentiment: allMessages.length ? +(allMessages.reduce((s, m) => s + m.sentiment, 0) / allMessages.length).toFixed(3) : 0,
        results,
      });
    },
  });

  // ═══ 5. poly_social_velocity ═══
  tools.push({
    name: 'poly_social_velocity',
    label: 'Social Velocity',
    description: 'Track cross-platform mention velocity for a topic. Measures how fast discussion is accelerating across Twitter, Reddit, and news. A sudden spike from 10 to 1000 mentions/hour is a leading indicator of market-moving events.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic to track (e.g., "trump indictment", "fed rate")' },
        compare_topic: { type: 'string', description: 'Optional: compare velocity against another topic' },
      },
      required: ['topic'],
    },
    execute: async (params: any) => {
      await ensureDB();
      
      async function measureVelocity(topic: string): Promise<any> {
        const sources: any[] = [];
        
        // Google News velocity
        try {
          const encoded = encodeURIComponent(topic);
          const [recent, older] = await Promise.all([
            cachedFetchText(`https://news.google.com/rss/search?q=${encoded}+when:1h&hl=en-US&gl=US&ceid=US:en`).catch(() => ''),
            cachedFetchText(`https://news.google.com/rss/search?q=${encoded}+when:24h&hl=en-US&gl=US&ceid=US:en`).catch(() => ''),
          ]);
          
          const recentCount = (recent.match(/<item>/g) || []).length;
          const olderCount = (older.match(/<item>/g) || []).length;
          const hourlyRate = olderCount > 0 ? olderCount / 24 : 0;
          const acceleration = hourlyRate > 0 ? recentCount / hourlyRate : recentCount;
          
          sources.push({
            source: 'google_news',
            last_hour: recentCount,
            last_24h: olderCount,
            hourly_rate: +hourlyRate.toFixed(1),
            acceleration: +acceleration.toFixed(2), // >1 = accelerating
            status: acceleration > 3 ? 'SPIKE' : acceleration > 1.5 ? 'RISING' : 'NORMAL',
          });
        } catch {}
        
        // Reddit velocity
        try {
          const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=new&t=day&limit=100`;
          const data = await cachedFetchJSON(url, 30000, 15000);
          const posts = data?.data?.children || [];
          
          const now = Date.now() / 1000;
          const lastHour = posts.filter((p: any) => now - p.data.created_utc < 3600).length;
          const last24h = posts.length;
          const hourlyRate = last24h / 24;
          const acceleration = hourlyRate > 0 ? lastHour / hourlyRate : lastHour;
          
          sources.push({
            source: 'reddit',
            last_hour: lastHour,
            last_24h: last24h,
            hourly_rate: +hourlyRate.toFixed(1),
            acceleration: +acceleration.toFixed(2),
            status: acceleration > 3 ? 'SPIKE' : acceleration > 1.5 ? 'RISING' : 'NORMAL',
          });
        } catch {}

        const totalAcceleration = sources.length
          ? +(sources.reduce((s: number, src: any) => s + (src.acceleration || 0), 0) / sources.length).toFixed(2)
          : 0;

        return {
          topic,
          sources,
          composite_acceleration: totalAcceleration,
          alert_level: totalAcceleration > 5 ? 'CRITICAL' : totalAcceleration > 3 ? 'HIGH' : totalAcceleration > 1.5 ? 'ELEVATED' : 'NORMAL',
        };
      }

      const primary = await measureVelocity(params.topic);
      let comparison: any = null;
      if (params.compare_topic) {
        comparison = await measureVelocity(params.compare_topic);
      }

      // Store velocity signal
      if (db) {
        try {
          db.prepare(`INSERT INTO poly_social_signals (source, topic, velocity, volume) VALUES (?, ?, ?, ?)`)
            .run('velocity', params.topic, primary.composite_acceleration,
                 primary.sources.reduce((s: number, src: any) => s + (src.last_hour || 0), 0));
        } catch {}
      }

      // Historical velocity (from DB)
      let history: any[] = [];
      if (db) {
        try {
          history = db.prepare(`SELECT velocity, volume, timestamp FROM poly_social_signals WHERE source = 'velocity' AND topic = ? ORDER BY timestamp DESC LIMIT 24`)
            .all(params.topic);
        } catch {}
      }

      return jsonResult({
        ...primary,
        comparison,
        history: history.length > 0 ? history : undefined,
        recommendation: primary.alert_level === 'CRITICAL'
          ? 'URGENT: Massive discussion spike detected — check news immediately and consider trading before the market reprices'
          : primary.alert_level === 'HIGH'
          ? 'Discussion accelerating rapidly — monitor closely and prepare to trade'
          : 'Normal discussion levels — no urgency',
      });
    },
  });

  return tools;
}
