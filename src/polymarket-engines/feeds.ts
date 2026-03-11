/**
 * Polymarket Event & Data Feed Engine
 * 
 * First-party data sources and event tracking:
 * - Official source monitoring (government, courts, sports, weather)
 * - Cross-platform odds aggregation
 * - Resolution source tracking
 * - Breaking news via AP/Reuters/BBC/CNN RSS
 * 
 * Note: Event calendar (add/remove/list) requires DB and stays in the tool file.
 * This engine provides the data fetching and analysis functions.
 */

import {
  GAMMA_API,
  cachedFetchJSON, cachedFetchText,
  parseRSSItems,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  OFFICIAL SOURCES
// ═══════════════════════════════════════════════════════════════════

const SOURCE_URLS: Record<string, string> = {
  whitehouse: 'https://www.whitehouse.gov/feed/',
  scotus: 'https://www.supremecourt.gov/rss/cases/opinions.xml',
  sec: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K&dateb=&owner=include&count=20&search_text=&action=getcompany&output=atom',
  fed: 'https://www.federalreserve.gov/feeds/press_all.xml',
  espn: 'https://www.espn.com/espn/rss/news',
  noaa: 'https://alerts.weather.gov/cap/us.php?x=0',
  congress: 'https://www.congress.gov/rss/most-viewed-bills.xml',
};

export interface OfficialSourceResult {
  source: string;
  url: string;
  total_items: number;
  filtered: number;
  items: any[];
  latest: any | null;
}

export async function fetchOfficialSource(source: string, query?: string, customUrl?: string): Promise<OfficialSourceResult> {
  const url = source === 'custom' ? customUrl : SOURCE_URLS[source];
  if (!url) throw new Error(`Unknown source: ${source}`);

  const text = await cachedFetchText(url, 15000);

  // Try RSS parsing
  let items = parseRSSItems(text);

  // Atom fallback
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(text)) !== null) {
      const get = (tag: string) => {
        const m2 = match![1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m2 ? m2[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      };
      const linkMatch = match[1].match(/<link[^>]*href="([^"]+)"/);
      items.push({
        title: get('title'),
        link: linkMatch?.[1] || '',
        pubDate: get('updated') || get('published'),
        description: get('summary').replace(/<[^>]+>/g, '').slice(0, 300),
      });
    }
  }

  const filtered = query
    ? items.filter(i => (i.title + ' ' + i.description).toLowerCase().includes(query.toLowerCase()))
    : items;

  return {
    source, url,
    total_items: items.length,
    filtered: filtered.length,
    items: filtered.slice(0, 25),
    latest: filtered[0] || null,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  ODDS AGGREGATOR
// ═══════════════════════════════════════════════════════════════════

export interface OddsComparisonResult {
  market_question: string;
  polymarket_price: number | string;
  external_references: any[];
  odds_comparison_sites: Array<{ name: string; note: string }>;
  divergence: any | null;
  recommendation: string;
}

export async function compareOdds(marketQuestion: string, polymarketPrice?: number): Promise<OddsComparisonResult> {
  const searches = [`${marketQuestion} odds betting`, `${marketQuestion} prediction probability`];
  const references: any[] = [];

  for (const q of searches) {
    try {
      const xml = await cachedFetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
      const items = parseRSSItems(xml);
      for (const item of items.slice(0, 5)) {
        const oddsMatch = item.title.match(/(\d+)%/);
        const ratioMatch = item.title.match(/(\d+)[/-](\d+)/);
        references.push({
          source: item.source || 'News', headline: item.title, link: item.link,
          extracted_probability: oddsMatch ? parseInt(oddsMatch[1]) / 100 : null,
          extracted_odds: ratioMatch ? `${ratioMatch[1]}/${ratioMatch[2]}` : null,
          date: item.pubDate,
        });
      }
    } catch {}
  }

  const oddsSites = [
    { name: 'Betfair', note: 'UK-based exchange — check betfair.com for odds' },
    { name: 'Pinnacle', note: 'Sharp book — their odds are considered most efficient' },
    { name: 'Metaculus', note: 'Forecasting platform — check metaculus.com' },
    { name: 'Manifold Markets', note: 'Play-money market — check manifold.markets' },
  ];

  let divergence = null;
  if (polymarketPrice) {
    const externalOdds = references.filter(r => r.extracted_probability).map(r => r.extracted_probability);
    if (externalOdds.length > 0) {
      const avgExternal = externalOdds.reduce((s: number, o: number) => s + o, 0) / externalOdds.length;
      divergence = {
        polymarket: polymarketPrice, external_avg: +avgExternal.toFixed(3),
        difference: +(polymarketPrice - avgExternal).toFixed(3),
        pct_difference: +(((polymarketPrice - avgExternal) / avgExternal) * 100).toFixed(1),
        signal: Math.abs(polymarketPrice - avgExternal) > 0.05
          ? polymarketPrice > avgExternal ? 'POLYMARKET_OVERPRICED' : 'POLYMARKET_UNDERPRICED'
          : 'ALIGNED',
      };
    }
  }

  return {
    market_question: marketQuestion,
    polymarket_price: polymarketPrice || 'not provided',
    external_references: references,
    odds_comparison_sites: oddsSites,
    divergence,
    recommendation: divergence?.signal === 'POLYMARKET_UNDERPRICED'
      ? 'Polymarket is cheaper than external odds — potential BUY opportunity'
      : divergence?.signal === 'POLYMARKET_OVERPRICED'
      ? 'Polymarket is more expensive than external odds — consider SELL/SHORT'
      : 'Prices roughly aligned across platforms',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  RESOLUTION TRACKER
// ═══════════════════════════════════════════════════════════════════

export interface ResolutionInfo {
  market: string;
  slug: string;
  condition_id: string;
  end_date: string | null;
  resolution_source: string;
  resolution_type: string;
  resolution_description: string;
  source_urls: string[];
  current_price: number[] | null;
  recommendation: string;
  risk_factors: string[];
}

export async function trackResolution(marketSlug?: string, conditionId?: string): Promise<ResolutionInfo> {
  let market: any = null;
  if (marketSlug) {
    const data = await cachedFetchJSON(`${GAMMA_API}/markets?slug=${marketSlug}`);
    market = data?.[0];
  } else if (conditionId) {
    const data = await cachedFetchJSON(`${GAMMA_API}/markets?condition_id=${conditionId}`);
    market = data?.[0];
  }
  if (!market) throw new Error('Market not found');

  const description = market.description || '';
  const resolutionSource = market.resolution_source || market.resolutionSource || '';
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  const urls = Array.from(new Set([...(description.match(urlRegex) || []), ...(resolutionSource.match(urlRegex) || [])]));
  const descLower = description.toLowerCase();

  let resolutionType = 'unknown';
  if (descLower.includes('associated press') || descLower.includes(' ap ')) resolutionType = 'AP call';
  else if (descLower.includes('espn') || descLower.includes('sports')) resolutionType = 'sports result';
  else if (descLower.includes('government') || descLower.includes('official')) resolutionType = 'government source';
  else if (descLower.includes('court') || descLower.includes('ruling')) resolutionType = 'court decision';
  else if (descLower.includes('sec') || descLower.includes('filing')) resolutionType = 'regulatory filing';
  else if (descLower.includes('price') || descLower.includes('close')) resolutionType = 'market price';
  else if (urls.length > 0) resolutionType = 'external source';

  return {
    market: market.question,
    slug: market.slug,
    condition_id: market.condition_id || market.conditionId,
    end_date: market.end_date_iso || market.endDate,
    resolution_source: resolutionSource,
    resolution_type: resolutionType,
    resolution_description: description.slice(0, 1000),
    source_urls: urls,
    current_price: market.outcomePrices ? JSON.parse(market.outcomePrices) : null,
    recommendation: `Monitor these sources directly: ${urls.join(', ') || 'Check market description for resolution criteria'}`,
    risk_factors: [
      market.active === false ? 'MARKET INACTIVE' : '',
      descLower.includes('discretion') ? 'Resolution may involve discretionary judgment' : '',
      descLower.includes('ambiguous') ? 'Resolution criteria may be ambiguous' : '',
      !resolutionSource ? 'No explicit resolution source specified' : '',
    ].filter(Boolean),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  BREAKING NEWS
// ═══════════════════════════════════════════════════════════════════

export interface BreakingNewsResult {
  sources_checked: string[];
  total_items: number;
  high_relevance: number;
  items: any[];
  market_moving: any[];
  alert: string;
}

export async function fetchBreakingNews(params?: {
  topics?: string[];
  sources?: string[];
  since_minutes?: number;
}): Promise<BreakingNewsResult> {
  const rssFeeds: Record<string, string> = {
    ap: 'https://rsshub.app/apnews/topics/apf-topnews',
    reuters: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
    bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
    cnn: 'https://rss.cnn.com/rss/cnn_topstories.rss',
  };

  const requestedSources = params?.sources || Object.keys(rssFeeds);
  const topics = params?.topics || null;
  const sinceMs = (params?.since_minutes || 60) * 60 * 1000;
  const cutoff = new Date(Date.now() - sinceMs);

  const allItems: any[] = [];

  await Promise.all(requestedSources.map(async (source: string) => {
    const url = rssFeeds[source];
    if (!url) return;
    try {
      const xml = await cachedFetchText(url, 15000);
      const items = parseRSSItems(xml);
      for (const item of items) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        if (pubDate < cutoff) continue;
        if (topics) {
          const lower = (item.title + ' ' + item.description).toLowerCase();
          if (!topics.some(t => lower.includes(t.toLowerCase()))) continue;
        }

        const title = item.title.toLowerCase();
        let relevance = 0;
        const marketKeywords = ['election', 'trump', 'biden', 'fed', 'rate', 'court', 'ruling',
          'war', 'peace', 'crypto', 'bitcoin', 'ai', 'congress', 'bill', 'vote', 'poll',
          'indictment', 'verdict', 'championship', 'spacex', 'launch', 'earthquake', 'hurricane'];
        for (const kw of marketKeywords) {
          if (title.includes(kw)) relevance += 0.2;
        }
        relevance = Math.min(1, relevance);

        allItems.push({ ...item, source, relevance: +relevance.toFixed(2), minutes_ago: Math.round((Date.now() - pubDate.getTime()) / 60000) });
      }
    } catch {}
  }));

  allItems.sort((a, b) => (a.minutes_ago || 999) - (b.minutes_ago || 999));
  const highRelevance = allItems.filter(i => i.relevance >= 0.4);

  return {
    sources_checked: requestedSources,
    total_items: allItems.length,
    high_relevance: highRelevance.length,
    items: allItems.slice(0, 30),
    market_moving: highRelevance.slice(0, 10),
    alert: highRelevance.length > 0
      ? `${highRelevance.length} potentially market-moving headlines detected — review immediately`
      : 'No high-relevance breaking news in the last ' + (params?.since_minutes || 60) + ' minutes',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  AUTO-DISCOVER EVENTS
// ═══════════════════════════════════════════════════════════════════

export interface DiscoveredEvent {
  title: string;
  category: string;
  source: string;
  link: string;
  date: string;
}

export async function discoverEvents(): Promise<DiscoveredEvent[]> {
  const categories = ['election', 'federal reserve', 'court ruling', 'earnings report', 'sports championship'];
  const events: DiscoveredEvent[] = [];

  for (const cat of categories) {
    try {
      const xml = await cachedFetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(cat + ' upcoming')}&hl=en-US&gl=US&ceid=US:en`);
      const items = parseRSSItems(xml);
      for (const item of items.slice(0, 3)) {
        events.push({
          title: item.title, category: cat, source: item.source || 'Google News',
          link: item.link, date: item.pubDate,
        });
      }
    } catch {}
  }

  return events;
}
