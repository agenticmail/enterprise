/**
 * Polymarket Data Feed Tools — Thin wrappers around polymarket-engines/feeds
 * 
 * Note: poly_calendar_events uses DB for persistence, so its logic stays here.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { safeDbExec, safeDbQuery, safeDbDDL } from './polymarket-shared.js';
import { fetchOfficialSource, compareOdds, trackResolution, fetchBreakingNews } from '../../polymarket-engines/feeds.js';

export function createPolymarketFeedsTools(opts?: ToolCreationOptions): AnyAgentTool[] {
  const getDb = () => opts?.engineDb;

  return [
    {
      name: 'poly_calendar_events',
      description: 'Manage an event calendar for tracking market-moving dates: add/remove/list events that could affect your positions.',
      parameters: {
        type: 'object', properties: {
          action: { type: 'string', enum: ['add', 'remove', 'list', 'upcoming'], description: 'Calendar action' },
          title: { type: 'string', description: 'Event title (for add)' },
          date: { type: 'string', description: 'Event date ISO (for add)' },
          category: { type: 'string', description: 'Category: politics, sports, crypto, economics, legal, other' },
          market_slugs: { type: 'array', items: { type: 'string' }, description: 'Related market slugs' },
          notes: { type: 'string', description: 'Additional notes' },
          event_id: { type: 'string', description: 'Event ID (for remove)' },
          days_ahead: { type: 'number', description: 'Days ahead to look (for upcoming)', default: 7 },
        }, required: ['action'],
      },
      async execute(_id: string, p: any) {
        try {
          const db = getDb();
          if (!db) return errorResult('No database available');

          await safeDbDDL(db, `CREATE TABLE IF NOT EXISTS poly_calendar_events (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, event_date TEXT NOT NULL,
            category TEXT DEFAULT 'other', market_slugs TEXT, notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`);

          if (p.action === 'add') {
            if (!p.title || !p.date) return errorResult('Need title and date');
            const id = `evt_${Date.now()}`;
            await safeDbExec(db, `INSERT INTO poly_calendar_events (id, title, event_date, category, market_slugs, notes) VALUES (?, ?, ?, ?, ?, ?)`,
              [id, p.title, p.date, p.category || 'other', JSON.stringify(p.market_slugs || []), p.notes || '']);
            return jsonResult({ id, title: p.title, date: p.date, status: 'added' });
          }
          if (p.action === 'remove') {
            if (!p.event_id) return errorResult('Need event_id');
            await safeDbExec(db, `DELETE FROM poly_calendar_events WHERE id = ?`, [p.event_id]);
            return jsonResult({ id: p.event_id, status: 'removed' });
          }
          if (p.action === 'upcoming') {
            const days = p.days_ahead || 7;
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days);
            const today = new Date().toISOString().slice(0, 10);
            const rows = await safeDbQuery(db, `SELECT * FROM poly_calendar_events WHERE event_date >= ? AND event_date <= ? ORDER BY event_date`, [today, cutoff.toISOString().slice(0, 10)]);
            return jsonResult({ upcoming: rows, days_ahead: days });
          }
          // list
          const rows = await safeDbQuery(db, `SELECT * FROM poly_calendar_events ORDER BY event_date DESC LIMIT 50`);
          return jsonResult({ events: rows, total: rows.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_official_sources',
      description: 'Fetch data from official sources: whitehouse, scotus, sec, fed, espn, noaa, congress, or any custom RSS/Atom URL.',
      parameters: {
        type: 'object', properties: {
          source: { type: 'string', description: 'Source name or "custom"', enum: ['whitehouse', 'scotus', 'sec', 'fed', 'espn', 'noaa', 'congress', 'custom'] },
          query: { type: 'string', description: 'Filter results by keyword' },
          custom_url: { type: 'string', description: 'Custom RSS/Atom URL (when source=custom)' },
        }, required: ['source'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await fetchOfficialSource(p.source, p.query, p.custom_url)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_odds_aggregator',
      description: 'Compare Polymarket odds against external sources. Finds divergences between Polymarket pricing and other platforms.',
      parameters: {
        type: 'object', properties: {
          market_question: { type: 'string', description: 'Market question to search for' },
          polymarket_price: { type: 'number', description: 'Current Polymarket YES price' },
        }, required: ['market_question'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await compareOdds(p.market_question, p.polymarket_price)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_resolution_tracker',
      description: 'Track resolution details for a market: source URLs, resolution type, criteria clarity, and risk factors.',
      parameters: {
        type: 'object', properties: {
          market_slug: { type: 'string', description: 'Market slug' },
          condition_id: { type: 'string', description: 'Or condition ID' },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await trackResolution(p.market_slug, p.condition_id)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_breaking_news',
      description: 'Fetch breaking news from AP, Reuters, BBC, CNN. Filter by topics and time window. Scores market relevance.',
      parameters: {
        type: 'object', properties: {
          topics: { type: 'array', items: { type: 'string' }, description: 'Topic keywords to filter' },
          sources: { type: 'array', items: { type: 'string' }, description: 'Sources: ap, reuters, bbc, cnn' },
          since_minutes: { type: 'number', description: 'Look back N minutes', default: 60 },
        },
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await fetchBreakingNews(p)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
