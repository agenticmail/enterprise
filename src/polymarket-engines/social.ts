/**
 * Polymarket Social Intelligence Engine
 * 
 * Cross-platform social sentiment and velocity tracking:
 * - Twitter/X sentiment (via Google News RSS proxy)
 * - Polymarket comment section analysis
 * - Reddit pulse monitoring
 * - Telegram channel scraping
 * - Cross-platform mention velocity (spike detection)
 */

import {
  GAMMA_API,
  cachedFetchJSON, cachedFetchText,
  scoreSentiment, extractTopics,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  TWITTER SENTIMENT (via Google News proxy)
// ═══════════════════════════════════════════════════════════════════

export interface TwitterSentimentResult {
  query: string;
  overall_sentiment: number;
  sentiment_label: string;
  total_mentions: number;
  results: Array<{ query: string; items: any[]; avg_sentiment: number; volume: number }>;
  topics_detected: string[];
  signal: string;
}

export async function analyzeTwitterSentiment(query: string, includePolymarket = true): Promise<TwitterSentimentResult> {
  const searches = [query];
  if (includePolymarket) searches.push(`${query} polymarket`);

  const results: any[] = [];
  for (const q of searches) {
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const xml = await cachedFetchText(rssUrl);
      const items: any[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const get = (tag: string) => {
          const m2 = match![1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
          return m2 ? m2[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
        };
        const title = get('title');
        if (title) {
          items.push({ title, link: get('link'), date: get('pubDate'), source: get('source') || 'Google News', sentiment: scoreSentiment(title) });
        }
      }
      results.push({ query: q, items: items.slice(0, 15), avg_sentiment: items.length ? +(items.reduce((s, i) => s + i.sentiment, 0) / items.length).toFixed(3) : 0, volume: items.length });
    } catch (e: any) {
      results.push({ query: q, error: e.message, items: [], avg_sentiment: 0, volume: 0 });
    }
  }

  const allItems = results.flatMap(r => r.items || []);
  const avgSentiment = allItems.length ? +(allItems.reduce((s, i) => s + i.sentiment, 0) / allItems.length).toFixed(3) : 0;

  return {
    query,
    overall_sentiment: avgSentiment,
    sentiment_label: avgSentiment > 0.2 ? 'BULLISH' : avgSentiment < -0.2 ? 'BEARISH' : 'NEUTRAL',
    total_mentions: allItems.length,
    results,
    topics_detected: extractTopics(allItems.map(i => i.title).join(' ')),
    signal: avgSentiment > 0.3 ? 'BUY_SIGNAL' : avgSentiment < -0.3 ? 'SELL_SIGNAL' : 'NO_SIGNAL',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  POLYMARKET COMMENTS
// ═══════════════════════════════════════════════════════════════════

export interface CommentsResult {
  market: string;
  slug: string;
  total_comments: number;
  avg_sentiment: number;
  sentiment_label: string;
  top_comments: Array<{ author: string; text: string; likes: number; timestamp: string; sentiment: number }>;
  bullish_comments: number;
  bearish_comments: number;
  browser_url?: string;
}

export async function analyzePolymarketComments(marketSlug: string): Promise<CommentsResult> {
  const marketData = await cachedFetchJSON(`${GAMMA_API}/markets?slug=${marketSlug}`).catch(() => null);
  const market = marketData?.[0];
  if (!market) throw new Error('Market not found — provide valid slug');

  const conditionId = market.condition_id || market.conditionId;
  let comments: any[] = [];

  try {
    const commentsUrl = `${GAMMA_API}/comments?market=${conditionId}&limit=50&sort=recent`;
    const commentsData = await cachedFetchJSON(commentsUrl);
    comments = (commentsData || []).map((c: any) => ({
      author: c.author || c.user_id || 'anon',
      text: c.text || c.body || c.content || '',
      likes: c.likes || c.upvotes || 0,
      timestamp: c.created_at || c.timestamp,
      sentiment: scoreSentiment(c.text || c.body || c.content || ''),
    }));
  } catch {}

  if (comments.length === 0) {
    return {
      market: market.question, slug: marketSlug, total_comments: 0,
      avg_sentiment: 0, sentiment_label: 'NO_DATA', top_comments: [],
      bullish_comments: 0, bearish_comments: 0,
      browser_url: `https://polymarket.com/event/${marketSlug}`,
    };
  }

  const avgSentiment = +(comments.reduce((s: number, c: any) => s + c.sentiment, 0) / comments.length).toFixed(3);

  return {
    market: market.question, slug: marketSlug,
    total_comments: comments.length,
    avg_sentiment: avgSentiment,
    sentiment_label: avgSentiment > 0.15 ? 'BULLISH' : avgSentiment < -0.15 ? 'BEARISH' : 'MIXED',
    top_comments: comments.slice(0, 20),
    bullish_comments: comments.filter((c: any) => c.sentiment > 0.2).length,
    bearish_comments: comments.filter((c: any) => c.sentiment < -0.2).length,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  REDDIT PULSE
// ═══════════════════════════════════════════════════════════════════

export interface RedditPulseResult {
  query: string;
  subreddits_searched: string[];
  total_posts: number;
  overall_sentiment: number;
  sentiment_label: string;
  results: any[];
  trending: Array<{ title: string; score: number; subreddit: string }>;
}

export async function monitorRedditPulse(query: string, subreddits?: string[], timeframe = 'day'): Promise<RedditPulseResult> {
  const subs = subreddits || ['polymarket', 'politics', 'sports', 'worldnews'];
  const results: any[] = [];

  for (const sub of subs) {
    try {
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&t=${timeframe}&limit=25`;
      const data = await cachedFetchJSON(url, 30000, 15000);
      const posts = (data?.data?.children || []).map((child: any) => {
        const p = child.data;
        return {
          title: p.title, subreddit: p.subreddit, score: p.score, num_comments: p.num_comments,
          url: `https://reddit.com${p.permalink}`,
          created: new Date(p.created_utc * 1000).toISOString(),
          selftext_preview: (p.selftext || '').slice(0, 200),
          sentiment: scoreSentiment(p.title + ' ' + (p.selftext || '')),
          upvote_ratio: p.upvote_ratio,
        };
      });
      results.push({
        subreddit: sub, posts,
        avg_sentiment: posts.length ? +(posts.reduce((s: number, p: any) => s + p.sentiment, 0) / posts.length).toFixed(3) : 0,
        total_engagement: posts.reduce((s: number, p: any) => s + p.score + p.num_comments, 0),
      });
    } catch (e: any) {
      results.push({ subreddit: sub, error: e.message, posts: [] });
    }
  }

  const allPosts = results.flatMap(r => r.posts || []);
  const avgSentiment = allPosts.length ? +(allPosts.reduce((s, p) => s + p.sentiment, 0) / allPosts.length).toFixed(3) : 0;

  return {
    query,
    subreddits_searched: subs,
    total_posts: allPosts.length,
    overall_sentiment: avgSentiment,
    sentiment_label: avgSentiment > 0.15 ? 'BULLISH' : avgSentiment < -0.15 ? 'BEARISH' : 'NEUTRAL',
    results,
    trending: allPosts.sort((a, b) => b.score - a.score).slice(0, 5).map(p => ({ title: p.title, score: p.score, subreddit: p.subreddit })),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  TELEGRAM MONITOR
// ═══════════════════════════════════════════════════════════════════

export interface TelegramResult {
  channels_monitored: number;
  total_messages: number;
  overall_sentiment: number;
  results: Array<{ channel: string; messages: any[]; total: number; avg_sentiment: number }>;
}

export async function monitorTelegram(channels: string[], query?: string, limit = 20): Promise<TelegramResult> {
  const results: any[] = [];
  for (const channel of channels) {
    try {
      const url = `https://t.me/s/${channel.replace('@', '')}`;
      const html = await cachedFetchText(url, 15000);
      const messageRegex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
      const messages: any[] = [];
      let match;
      while ((match = messageRegex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
        if (text.length > 10) {
          messages.push({ text: text.slice(0, 500), sentiment: scoreSentiment(text) });
        }
      }
      const filtered = query ? messages.filter((m: any) => m.text.toLowerCase().includes(query.toLowerCase())) : messages;
      results.push({
        channel: channel.replace('@', ''),
        messages: filtered.slice(0, limit),
        total: filtered.length,
        avg_sentiment: filtered.length ? +(filtered.reduce((s: number, m: any) => s + m.sentiment, 0) / filtered.length).toFixed(3) : 0,
      });
    } catch (e: any) {
      results.push({ channel: channel.replace('@', ''), error: e.message, messages: [], total: 0, avg_sentiment: 0 });
    }
  }

  const allMessages = results.flatMap(r => r.messages || []);
  return {
    channels_monitored: channels.length,
    total_messages: allMessages.length,
    overall_sentiment: allMessages.length ? +(allMessages.reduce((s, m) => s + m.sentiment, 0) / allMessages.length).toFixed(3) : 0,
    results,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  SOCIAL VELOCITY (SPIKE DETECTION)
// ═══════════════════════════════════════════════════════════════════

export interface VelocityResult {
  topic: string;
  sources: Array<{ source: string; last_hour: number; last_24h: number; hourly_rate: number; acceleration: number; status: string }>;
  composite_acceleration: number;
  alert_level: string;
  comparison?: VelocityResult;
  recommendation: string;
}

export async function measureSocialVelocity(topic: string, compareTopic?: string): Promise<VelocityResult> {
  async function measure(t: string): Promise<Omit<VelocityResult, 'comparison' | 'recommendation'>> {
    const sources: VelocityResult['sources'] = [];

    // Google News velocity
    try {
      const encoded = encodeURIComponent(t);
      const [recent, older] = await Promise.all([
        cachedFetchText(`https://news.google.com/rss/search?q=${encoded}+when:1h&hl=en-US&gl=US&ceid=US:en`).catch(() => ''),
        cachedFetchText(`https://news.google.com/rss/search?q=${encoded}+when:24h&hl=en-US&gl=US&ceid=US:en`).catch(() => ''),
      ]);
      const recentCount = (recent.match(/<item>/g) || []).length;
      const olderCount = (older.match(/<item>/g) || []).length;
      const hourlyRate = olderCount > 0 ? olderCount / 24 : 0;
      const acceleration = hourlyRate > 0 ? recentCount / hourlyRate : recentCount;
      sources.push({
        source: 'google_news', last_hour: recentCount, last_24h: olderCount,
        hourly_rate: +hourlyRate.toFixed(1), acceleration: +acceleration.toFixed(2),
        status: acceleration > 3 ? 'SPIKE' : acceleration > 1.5 ? 'RISING' : 'NORMAL',
      });
    } catch {}

    // Reddit velocity
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(t)}&sort=new&t=day&limit=100`;
      const data = await cachedFetchJSON(url, 30000, 15000);
      const posts = data?.data?.children || [];
      const now = Date.now() / 1000;
      const lastHour = posts.filter((p: any) => now - p.data.created_utc < 3600).length;
      const last24h = posts.length;
      const hourlyRate = last24h / 24;
      const acceleration = hourlyRate > 0 ? lastHour / hourlyRate : lastHour;
      sources.push({
        source: 'reddit', last_hour: lastHour, last_24h: last24h,
        hourly_rate: +hourlyRate.toFixed(1), acceleration: +acceleration.toFixed(2),
        status: acceleration > 3 ? 'SPIKE' : acceleration > 1.5 ? 'RISING' : 'NORMAL',
      });
    } catch {}

    const totalAcceleration = sources.length
      ? +(sources.reduce((s: number, src) => s + (src.acceleration || 0), 0) / sources.length).toFixed(2)
      : 0;

    return {
      topic: t, sources, composite_acceleration: +totalAcceleration,
      alert_level: +totalAcceleration > 5 ? 'CRITICAL' : +totalAcceleration > 3 ? 'HIGH' : +totalAcceleration > 1.5 ? 'ELEVATED' : 'NORMAL',
    };
  }

  const primary = await measure(topic);
  const comparison = compareTopic ? await measure(compareTopic) : undefined;

  return {
    ...primary,
    comparison: comparison as VelocityResult | undefined,
    recommendation: primary.alert_level === 'CRITICAL'
      ? 'URGENT: Massive discussion spike detected — check news immediately and consider trading before the market reprices'
      : primary.alert_level === 'HIGH'
      ? 'Discussion accelerating rapidly — monitor closely and prepare to trade'
      : 'Normal discussion levels — no urgency',
  };
}
