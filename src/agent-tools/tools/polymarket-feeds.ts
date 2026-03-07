/**
 * Polymarket Event & Data Feed Tools
 * 
 * First-party data sources and event tracking:
 * - Structured event calendar (elections, court rulings, earnings, etc.)
 * - Official source monitoring (government, courts, sports APIs)
 * - Cross-platform odds aggregation and arbitrage detection
 * - Resolution source tracking
 * - Breaking news via AP/Reuters RSS
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { cachedFetchJSON, cachedFetchText, validateTokenId, validateSlug, validateAddress, clampNumber, safeDbExec, safeDbQuery, safeDbGet, parseRSSItems as sharedParseRSS, withRetry ,  autoId, getDialect } from './polymarket-shared.js';

// ─── DB Tables ───────────────────────────────────────────────

async function initFeedsDB(db: any): Promise<void> {
  if (!db?.exec) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS poly_event_calendar (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      event_date TEXT NOT NULL,
      description TEXT,
      source_url TEXT,
      related_markets TEXT DEFAULT '[]',
      impact TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'upcoming',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS poly_odds_snapshots (
      id ${autoId()},
      market_id TEXT NOT NULL,
      source TEXT NOT NULL,
      odds_yes REAL,
      odds_no REAL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS poly_news_alerts (
      id ${autoId()},
      agent_id TEXT NOT NULL,
      headline TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      relevance REAL DEFAULT 0,
      processed INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of stmts) {
    try { db.exec(sql); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────




// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketFeedTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  let dbReady = false;
  async function ensureDB() {
    if (dbReady || !db) return;
    await initFeedsDB(db);
    dbReady = true;
  }

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_calendar_events ═══
  tools.push({
    name: 'poly_calendar_events',
    label: 'Event Calendar',
    description: 'Manage a structured calendar of market-moving events: elections, court rulings, earnings, fed meetings, sports events, rocket launches. Know what is about to happen and which markets it affects.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove', 'upcoming', 'auto_discover'], description: 'Action to perform' },
        id: { type: 'string', description: 'Event ID (for remove)' },
        title: { type: 'string', description: 'Event title (for add)' },
        category: { type: 'string', enum: ['election', 'court', 'earnings', 'fed', 'sports', 'crypto', 'geopolitics', 'science', 'tech', 'other'], description: 'Event category' },
        event_date: { type: 'string', description: 'Event date ISO (for add)' },
        description: { type: 'string', description: 'Event description' },
        source_url: { type: 'string', description: 'Source URL' },
        related_markets: { type: 'string', description: 'Comma-separated market condition IDs' },
        impact: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
        days_ahead: { type: 'number', description: 'For upcoming: show events within N days (default: 7)', default: 7 },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'add') {
        if (!params.title || !params.event_date) return errorResult('title and event_date required');
        const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          db.prepare(`INSERT INTO poly_event_calendar (id, agent_id, title, category, event_date, description, source_url, related_markets, impact)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, agentId, params.title, params.category || 'other', params.event_date,
                 params.description || '', params.source_url || '',
                 JSON.stringify((params.related_markets || '').split(',').filter(Boolean)),
                 params.impact || 'medium');
          return jsonResult({ added: id, title: params.title, date: params.event_date });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'remove') {
        if (!params.id) return errorResult('id required');
        try {
          db.prepare('DELETE FROM poly_event_calendar WHERE id = ? AND agent_id = ?').run(params.id, agentId);
          return jsonResult({ removed: params.id });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'upcoming') {
        const days = params.days_ahead || 7;
        try {
          const futureDate = getDialect() === 'postgres' ? `CURRENT_TIMESTAMP + INTERVAL '${days} days'` : getDialect() === 'mysql' ? `DATE_ADD(NOW(), INTERVAL ${days} DAY)` : `datetime('now', '+${days} days')`;
          const rows = db.prepare(`SELECT * FROM poly_event_calendar WHERE agent_id = ? AND event_date >= CURRENT_TIMESTAMP AND event_date <= ${futureDate} AND status = 'upcoming' ORDER BY event_date ASC`)
            .all(agentId);
          return jsonResult({
            upcoming_events: rows.map((r: any) => ({ ...r, related_markets: JSON.parse(r.related_markets || '[]') })),
            total: rows.length,
            next_event: rows[0] || null,
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'auto_discover') {
        // Discover upcoming events from news
        try {
          const categories = ['election', 'federal reserve', 'court ruling', 'earnings report', 'sports championship'];
          const events: any[] = [];
          
          for (const cat of categories) {
            try {
              const xml = await cachedFetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(cat + ' upcoming')}&hl=en-US&gl=US&ceid=US:en`);
              const items = sharedParseRSS(xml);
              for (const item of items.slice(0, 3)) {
                events.push({
                  title: item.title,
                  category: cat,
                  source: item.source || 'Google News',
                  link: item.link,
                  date: item.pubDate,
                });
              }
            } catch {}
          }

          return jsonResult({
            discovered: events.length,
            events,
            note: 'Review these and use "add" action to save relevant events to your calendar',
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      // list
      try {
        const rows = db.prepare('SELECT * FROM poly_event_calendar WHERE agent_id = ? ORDER BY event_date ASC').all(agentId);
        return jsonResult({
          events: rows.map((r: any) => ({ ...r, related_markets: JSON.parse(r.related_markets || '[]') })),
          total: rows.length,
        });
      } catch (e: any) { return errorResult(e.message); }
    },
  });

  // ═══ 2. poly_official_sources ═══
  tools.push({
    name: 'poly_official_sources',
    label: 'Official Sources',
    description: 'Fetch data directly from authoritative first-party sources: government feeds, court dockets, sports scores, weather data. First-party data beats news aggregation — get the signal before media filters it.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['whitehouse', 'scotus', 'sec', 'fed', 'espn', 'noaa', 'congress', 'custom'], description: 'Source to query' },
        query: { type: 'string', description: 'Search query within the source' },
        custom_url: { type: 'string', description: 'Custom RSS/JSON URL (for source=custom)' },
      },
      required: ['source'],
    },
    execute: async (params: any) => {
      const sourceUrls: Record<string, string> = {
        whitehouse: 'https://www.whitehouse.gov/feed/',
        scotus: 'https://www.supremecourt.gov/rss/cases/opinions.xml',
        sec: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K&dateb=&owner=include&count=20&search_text=&action=getcompany&output=atom',
        fed: 'https://www.federalreserve.gov/feeds/press_all.xml',
        espn: 'https://www.espn.com/espn/rss/news',
        noaa: 'https://alerts.weather.gov/cap/us.php?x=0',
        congress: 'https://www.congress.gov/rss/most-viewed-bills.xml',
      };

      const url = params.source === 'custom' ? params.custom_url : sourceUrls[params.source];
      if (!url) return errorResult(`Unknown source: ${params.source}`);

      try {
        const text = await cachedFetchText(url, 15000);
        
        // Try RSS/Atom parsing
        const items = sharedParseRSS(text);
        
        // If Atom format, try alternative parse
        let atomItems: any[] = [];
        if (items.length === 0) {
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
          let match;
          while ((match = entryRegex.exec(text)) !== null) {
            const get = (tag: string) => {
              const m = match![1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
              return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
            };
            const linkMatch = match[1].match(/<link[^>]*href="([^"]+)"/);
            atomItems.push({
              title: get('title'),
              link: linkMatch?.[1] || '',
              pubDate: get('updated') || get('published'),
              description: get('summary').replace(/<[^>]+>/g, '').slice(0, 300),
            });
          }
        }

        const allItems = items.length > 0 ? items : atomItems;
        
        // Filter by query if provided
        const filtered = params.query
          ? allItems.filter((i: any) => 
              (i.title + ' ' + i.description).toLowerCase().includes(params.query.toLowerCase()))
          : allItems;

        // Store breaking items in DB
        if (db && filtered.length > 0) {
          try {
            for (const item of filtered.slice(0, 5)) {
              db.prepare(`INSERT INTO poly_news_alerts (agent_id, headline, source, url) VALUES (?, ?, ?, ?)`)
                .run(agentId, item.title, params.source, item.link);
            }
          } catch {}
        }

        return jsonResult({
          source: params.source,
          url,
          total_items: allItems.length,
          filtered: filtered.length,
          items: filtered.slice(0, 25),
          latest: filtered[0] || null,
        });
      } catch (e: any) {
        return errorResult(`Source fetch failed: ${e.message}`);
      }
    },
  });

  // ═══ 3. poly_odds_aggregator ═══
  tools.push({
    name: 'poly_odds_aggregator',
    label: 'Odds Aggregator',
    description: 'Compare Polymarket prices against betting odds from other platforms. When prediction markets and sports books diverge, it signals mispricing and potential arbitrage opportunities.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        market_question: { type: 'string', description: 'Market question to search for odds' },
        polymarket_price: { type: 'number', description: 'Current Polymarket YES price (0-1)' },
        category: { type: 'string', enum: ['politics', 'sports', 'crypto', 'entertainment', 'science', 'general'], default: 'general' },
      },
      required: ['market_question'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const question = params.market_question;
      
      // Search for odds references via Google News
      try {
        const searches = [
          `${question} odds betting`,
          `${question} prediction probability`,
        ];
        
        const references: any[] = [];
        
        for (const q of searches) {
          try {
            const xml = await cachedFetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
            const items = sharedParseRSS(xml);
            for (const item of items.slice(0, 5)) {
              // Try to extract odds from headlines
              const oddsMatch = item.title.match(/(\d+)%/);
              const ratioMatch = item.title.match(/(\d+)[/-](\d+)/);
              
              references.push({
                source: item.source || 'News',
                headline: item.title,
                link: item.link,
                extracted_probability: oddsMatch ? parseInt(oddsMatch[1]) / 100 : null,
                extracted_odds: ratioMatch ? `${ratioMatch[1]}/${ratioMatch[2]}` : null,
                date: item.pubDate,
              });
            }
          } catch {}
        }

        // Known odds comparison sites
        const oddsSites = [
          { name: 'PredictIt', note: 'Shut down in 2023, but historical data available' },
          { name: 'Betfair', note: 'UK-based exchange — check betfair.com for odds' },
          { name: 'Pinnacle', note: 'Sharp book — their odds are considered most efficient' },
          { name: 'Metaculus', note: 'Forecasting platform — check metaculus.com' },
          { name: 'Manifold Markets', note: 'Play-money market — check manifold.markets' },
        ];

        const polyPrice = params.polymarket_price;
        const externalOdds = references.filter(r => r.extracted_probability).map(r => r.extracted_probability);
        
        let divergence = null;
        if (polyPrice && externalOdds.length > 0) {
          const avgExternal = externalOdds.reduce((s: number, o: number) => s + o, 0) / externalOdds.length;
          divergence = {
            polymarket: polyPrice,
            external_avg: +avgExternal.toFixed(3),
            difference: +(polyPrice - avgExternal).toFixed(3),
            pct_difference: +(((polyPrice - avgExternal) / avgExternal) * 100).toFixed(1),
            signal: Math.abs(polyPrice - avgExternal) > 0.05
              ? polyPrice > avgExternal ? 'POLYMARKET_OVERPRICED' : 'POLYMARKET_UNDERPRICED'
              : 'ALIGNED',
          };
        }

        // Store snapshot
        if (db && polyPrice) {
          try {
            db.prepare(`INSERT INTO poly_odds_snapshots (market_id, source, odds_yes) VALUES (?, ?, ?)`)
              .run(question, 'polymarket', polyPrice);
            for (const ref of references.filter(r => r.extracted_probability)) {
              db.prepare(`INSERT INTO poly_odds_snapshots (market_id, source, odds_yes) VALUES (?, ?, ?)`)
                .run(question, ref.source, ref.extracted_probability);
            }
          } catch {}
        }

        return jsonResult({
          market_question: question,
          polymarket_price: polyPrice || 'not provided',
          external_references: references,
          odds_comparison_sites: oddsSites,
          divergence,
          recommendation: divergence?.signal === 'POLYMARKET_UNDERPRICED'
            ? 'Polymarket is cheaper than external odds — potential BUY opportunity'
            : divergence?.signal === 'POLYMARKET_OVERPRICED'
            ? 'Polymarket is more expensive than external odds — consider SELL/SHORT'
            : 'Prices roughly aligned across platforms',
        });
      } catch (e: any) {
        return errorResult(`Odds aggregation failed: ${e.message}`);
      }
    },
  });

  // ═══ 4. poly_resolution_tracker ═══
  tools.push({
    name: 'poly_resolution_tracker',
    label: 'Resolution Tracker',
    description: 'Track how Polymarket resolves specific markets and monitor the resolution sources directly. Some markets use specific websites, APIs, or government reports — monitoring those sources gives you the answer before the market resolves.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        market_slug: { type: 'string', description: 'Market slug to check resolution criteria' },
        condition_id: { type: 'string', description: 'Or condition ID' },
      },
    },
    execute: async (params: any) => {
      try {
        let market: any = null;
        if (params.market_slug) {
          const data = await cachedFetchJSON(`https://gamma-api.polymarket.com/markets?slug=${params.market_slug}`);
          market = data?.[0];
        } else if (params.condition_id) {
          const data = await cachedFetchJSON(`https://gamma-api.polymarket.com/markets?condition_id=${params.condition_id}`);
          market = data?.[0];
        }
        
        if (!market) return errorResult('Market not found — provide market_slug or condition_id');

        const description = market.description || '';
        const resolutionSource = market.resolution_source || market.resolutionSource || '';
        
        // Extract URLs from description
        const urlRegex = /https?:\/\/[^\s<>"']+/g;
        const urls = (description.match(urlRegex) || []).concat(resolutionSource.match(urlRegex) || []);
        
        // Determine resolution type
        let resolutionType = 'unknown';
        const descLower = description.toLowerCase();
        if (descLower.includes('associated press') || descLower.includes(' ap ')) resolutionType = 'AP call';
        else if (descLower.includes('espn') || descLower.includes('sports')) resolutionType = 'sports result';
        else if (descLower.includes('government') || descLower.includes('official')) resolutionType = 'government source';
        else if (descLower.includes('court') || descLower.includes('ruling')) resolutionType = 'court decision';
        else if (descLower.includes('sec') || descLower.includes('filing')) resolutionType = 'regulatory filing';
        else if (descLower.includes('price') || descLower.includes('close')) resolutionType = 'market price';
        else if (urls.length > 0) resolutionType = 'external source';

        return jsonResult({
          market: market.question,
          slug: market.slug,
          condition_id: market.condition_id || market.conditionId,
          end_date: market.end_date_iso || market.endDate,
          resolution_source: resolutionSource,
          resolution_type: resolutionType,
          resolution_description: description.slice(0, 1000),
          source_urls: [...new Set(urls)],
          current_price: market.outcomePrices ? JSON.parse(market.outcomePrices) : null,
          recommendation: `Monitor these sources directly: ${[...new Set(urls)].join(', ') || 'Check market description for resolution criteria'}`,
          risk_factors: [
            market.active === false ? 'MARKET INACTIVE' : null,
            descLower.includes('discretion') ? 'Resolution may involve discretionary judgment' : null,
            descLower.includes('ambiguous') ? 'Resolution criteria may be ambiguous' : null,
            !resolutionSource ? 'No explicit resolution source specified' : null,
          ].filter(Boolean),
        });
      } catch (e: any) {
        return errorResult(`Resolution tracking failed: ${e.message}`);
      }
    },
  });

  // ═══ 5. poly_breaking_news ═══
  tools.push({
    name: 'poly_breaking_news',
    label: 'Breaking News',
    description: 'Monitor breaking news from AP, Reuters, and major wire services via RSS. Seconds matter in prediction markets — this tool fetches the latest headlines and flags those most likely to impact active markets.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        topics: { type: 'string', description: 'Comma-separated topics to monitor (default: all breaking news)' },
        sources: { type: 'string', description: 'Comma-separated: ap,reuters,bbc,cnn (default: all)' },
        since_minutes: { type: 'number', description: 'Only show news from the last N minutes (default: 60)', default: 60 },
      },
    },
    execute: async (params: any) => {
      await ensureDB();
      const rssFeeds: Record<string, string> = {
        ap: 'https://rsshub.app/apnews/topics/apf-topnews',
        reuters: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
        bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
        cnn: 'https://rss.cnn.com/rss/cnn_topstories.rss',
      };

      const requestedSources = params.sources
        ? params.sources.split(',').map((s: string) => s.trim().toLowerCase())
        : Object.keys(rssFeeds);

      const topics = params.topics ? params.topics.split(',').map((t: string) => t.trim().toLowerCase()) : null;
      const sinceMs = (params.since_minutes || 60) * 60 * 1000;
      const cutoff = new Date(Date.now() - sinceMs);

      const allItems: any[] = [];

      await Promise.all(requestedSources.map(async (source: string) => {
        const url = rssFeeds[source];
        if (!url) return;
        try {
          const xml = await cachedFetchText(url, 15000);
          const items = sharedParseRSS(xml);
          
          for (const item of items) {
            const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
            if (pubDate < cutoff) continue;
            
            // Filter by topics if specified
            if (topics) {
              const lower = (item.title + ' ' + item.description).toLowerCase();
              if (!topics.some((t: string) => lower.includes(t))) continue;
            }

            // Estimate market relevance
            const title = item.title.toLowerCase();
            let relevance = 0;
            const marketKeywords = ['election', 'trump', 'biden', 'fed', 'rate', 'court', 'ruling',
              'war', 'peace', 'crypto', 'bitcoin', 'ai', 'congress', 'bill', 'vote', 'poll',
              'indictment', 'verdict', 'championship', 'spacex', 'launch', 'earthquake', 'hurricane'];
            for (const kw of marketKeywords) {
              if (title.includes(kw)) relevance += 0.2;
            }
            relevance = Math.min(1, relevance);

            allItems.push({
              ...item,
              source,
              relevance: +relevance.toFixed(2),
              minutes_ago: Math.round((Date.now() - pubDate.getTime()) / 60000),
            });
          }
        } catch {}
      }));

      // Sort by recency
      allItems.sort((a, b) => (a.minutes_ago || 999) - (b.minutes_ago || 999));

      // Store high-relevance items
      if (db) {
        for (const item of allItems.filter(i => i.relevance >= 0.4)) {
          try {
            db.prepare(`INSERT INTO poly_news_alerts (agent_id, headline, source, url, relevance) VALUES (?, ?, ?, ?, ?)`)
              .run(agentId, item.title, item.source, item.link, item.relevance);
          } catch {}
        }
      }

      const highRelevance = allItems.filter(i => i.relevance >= 0.4);

      return jsonResult({
        sources_checked: requestedSources,
        total_items: allItems.length,
        high_relevance: highRelevance.length,
        items: allItems.slice(0, 30),
        market_moving: highRelevance.slice(0, 10),
        alert: highRelevance.length > 0
          ? `${highRelevance.length} potentially market-moving headlines detected — review immediately`
          : 'No high-relevance breaking news in the last ' + (params.since_minutes || 60) + ' minutes',
      });
    },
  });

  return tools;
}
