/**
 * Polymarket Portfolio Tools — Thin wrappers around polymarket-engines/portfolio
 * 
 * Note: poly_drawdown_monitor uses DB for persistent tracking, so some logic stays here.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { safeDbExec, safeDbQuery, safeDbDDL } from './polymarket-shared.js';
import { analyzePortfolio, calculatePortfolioKelly, attributePnL } from '../../polymarket-engines/portfolio.js';
import { apiFetch, GAMMA_API } from '../../polymarket-engines/shared.js';

export function createPolymarketPortfolioTools(opts?: ToolCreationOptions): AnyAgentTool[] {
  const getDb = () => opts?.engineDb;

  return [
    {
      name: 'poly_portfolio_optimizer',
      description: 'Analyze portfolio: current values, P&L, concentration (HHI), risk metrics. Uses Kelly criterion for optimal position sizing.',
      parameters: {
        type: 'object', properties: {
          positions: {
            type: 'array', description: 'Array: { token_id, market, outcome, size, avg_price }',
            items: { type: 'object' },
          },
          bankroll: { type: 'number', description: 'Total available capital' },
          estimated_true_probs: {
            type: 'object', description: 'Map of token_id -> your estimated true probability',
          },
        }, required: ['positions'],
      },
      async execute(_id: string, p: any) {
        try {
          const overview = await analyzePortfolio(p.positions);
          let kellySizing: any = null;
          if (p.bankroll && p.estimated_true_probs) {
            const kellyInput = p.positions.map((pos: any) => {
              const enriched = overview.positions.find((ep: any) => ep.token_id === pos.token_id);
              return {
                token_id: pos.token_id, market: pos.market,
                current_price: enriched?.current_price || pos.avg_price,
                estimated_true_prob: p.estimated_true_probs[pos.token_id] || enriched?.current_price || pos.avg_price,
              };
            });
            kellySizing = calculatePortfolioKelly(kellyInput, p.bankroll);
          }
          return jsonResult({ overview, kelly_sizing: kellySizing });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_drawdown_monitor',
      description: 'Monitor portfolio drawdown over time. Records snapshots and alerts when drawdown exceeds thresholds.',
      parameters: {
        type: 'object', properties: {
          action: { type: 'string', enum: ['record', 'status', 'history'], description: 'Action to take' },
          current_value: { type: 'number', description: 'Current portfolio value (for record)' },
          alert_threshold: { type: 'number', description: 'Alert if drawdown exceeds this %', default: 10 },
        }, required: ['action'],
      },
      async execute(_id: string, p: any) {
        try {
          const db = getDb();
          if (!db) return errorResult('No database available');

          await safeDbDDL(db, `CREATE TABLE IF NOT EXISTS poly_drawdown_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT, value REAL NOT NULL, peak REAL NOT NULL,
            drawdown_pct REAL NOT NULL, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`);

          if (p.action === 'record') {
            if (!p.current_value) return errorResult('Need current_value');
            const rows = await safeDbQuery(db, `SELECT MAX(peak) as max_peak FROM poly_drawdown_log`);
            const prevPeak = (rows[0] as any)?.max_peak || p.current_value;
            const peak = Math.max(prevPeak, p.current_value);
            const drawdown = peak > 0 ? ((peak - p.current_value) / peak) * 100 : 0;
            await safeDbExec(db, `INSERT INTO poly_drawdown_log (value, peak, drawdown_pct) VALUES (?, ?, ?)`,
              [p.current_value, peak, drawdown]);
            const alert = drawdown > (p.alert_threshold || 10);
            return jsonResult({ value: p.current_value, peak, drawdown_pct: +drawdown.toFixed(2), alert, threshold: p.alert_threshold || 10 });
          }
          if (p.action === 'history') {
            const rows = await safeDbQuery(db, `SELECT * FROM poly_drawdown_log ORDER BY recorded_at DESC LIMIT 100`);
            return jsonResult({ history: rows });
          }
          // status
          const rows = await safeDbQuery(db, `SELECT * FROM poly_drawdown_log ORDER BY recorded_at DESC LIMIT 1`);
          return jsonResult({ latest: rows[0] || null });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_pnl_attribution',
      description: 'Attribute P&L across trades and markets. Auto-fetches from live positions if no trades passed. Shows win rate, profit factor, best/worst trades, and per-market contribution.',
      parameters: {
        type: 'object', properties: {
          trades: {
            type: 'array', description: 'Optional: Array: { market, pnl }. If omitted, auto-fetches from live positions.',
            items: { type: 'object', properties: { market: { type: 'string' }, pnl: { type: 'number' } } },
          },
        },
      },
      async execute(_id: string, p: any) {
        try {
          let trades = p.trades;
          // Auto-fetch from live positions if no trades passed
          if (!trades || !Array.isArray(trades) || trades.length === 0) {
            const db = getDb();
            const creds = db ? await safeDbQuery(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [_id]) : [];
            const addr = creds[0]?.funder_address;
            if (addr) {
              const positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${addr}`).catch(() => null);
              if (Array.isArray(positions) && positions.length > 0) {
                trades = positions.map((pos: any) => ({
                  market: pos.title || pos.market_slug || pos.conditionId || 'Unknown',
                  pnl: parseFloat(pos.cashPnl ?? pos.pnl ?? 0),
                })).filter((t: any) => !isNaN(t.pnl));
              }
            }
          }
          if (!trades || trades.length === 0) return jsonResult({ total_pnl: 0, by_position: [], best_trade: null, worst_trade: null, win_rate: 0, avg_winner: 0, avg_loser: 0, profit_factor: 0, note: 'No positions found. Make some trades first.' });
          return jsonResult(attributePnL(trades));
        }
        catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
