/**
 * Polymarket Trading Optimizer Tools
 *
 * High-frequency trading optimization tools for maximizing daily profit:
 * - Daily scorecard: real-time P&L vs daily target
 * - Momentum scanner: find markets moving RIGHT NOW
 * - Quick edge: one-call GO/NO-GO trade decision
 * - Position heatmap: urgency-ranked position overview
 * - Profit lock: auto-conservative mode after hitting target
 * - Capital recycler: redeploy freed capital to best opportunities
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { safeDbQuery } from './polymarket-shared.js';
import {
  dailyScorecard,
  momentumScan,
  quickEdge,
  positionHeatmap,
  profitLockCheck,
  recycleCapital,
} from '../../polymarket-engines/trading-optimizer.js';

export function createPolymarketOptimizerTools(opts?: ToolCreationOptions): AnyAgentTool[] {
  const getDb = () => opts?.engineDb;
  const agentId = opts?.agentId || 'default';

  return [
    // ── DAILY SCORECARD ──────────────────────────────────
    {
      name: 'poly_daily_scorecard',
      description: 'Your daily trading dashboard. Shows real-time P&L vs daily target, win rate, capital utilization, and whether to keep trading or stop. Call this EVERY session and after every trade.',
      parameters: {
        type: 'object', properties: {
          daily_target: { type: 'number', description: 'Daily profit target in USD (default: from goals or $10)' },
          max_daily_loss: { type: 'number', description: 'Max daily loss before stopping (default: $50)' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          const db = getDb();
          // Get wallet address
          let addr = '';
          if (db) {
            const creds = await safeDbQuery(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]);
            addr = (creds[0] as any)?.funder_address || '';
          }
          if (!addr) return errorResult('No wallet found. Run poly_setup_wallet first.');

          // Get daily target from goals if not provided
          let dailyTarget = p.daily_target;
          if (!dailyTarget && db) {
            const goals = await safeDbQuery(db, `SELECT target_value FROM poly_goals WHERE agent_id = ? AND type = 'daily_pnl' AND enabled = 1`, [agentId]);
            dailyTarget = (goals[0] as any)?.target_value;
          }

          // Get trades today count
          let tradesToday = 0;
          if (db) {
            const counter = await safeDbQuery(db, `SELECT count FROM poly_daily_counters WHERE agent_id = ? AND counter_key = 'trades' AND date = ?`, [agentId, new Date().toISOString().slice(0, 10)]);
            tradesToday = (counter[0] as any)?.count || 0;
          }

          const result = await dailyScorecard({
            walletAddress: addr,
            dailyTarget: dailyTarget || 10,
            maxDailyLoss: p.max_daily_loss || 50,
            tradesToday,
          });

          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ── MOMENTUM SCANNER ─────────────────────────────────
    {
      name: 'poly_momentum_scanner',
      description: 'Find markets with significant price movement in the last few hours. These are where the action is — highest edge opportunities because something is HAPPENING. Use instead of poly_search_markets when you want to find moving markets, not static ones.',
      parameters: {
        type: 'object', properties: {
          min_change_pct: { type: 'number', description: 'Minimum price change % to include (default: 3)' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
          direction: { type: 'string', enum: ['UP', 'DOWN', 'BOTH'], description: 'Filter by direction (default: BOTH)' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          return jsonResult(await momentumScan({
            minChangePct: p.min_change_pct,
            limit: p.limit,
            direction: p.direction,
          }));
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ── QUICK EDGE CALCULATOR ────────────────────────────
    {
      name: 'poly_quick_edge',
      description: 'One-call GO/NO-GO trade decision. Give it a token_id and your estimated probability, get back: edge %, Kelly size, decision (STRONG_BUY/BUY/MARGINAL/NO_TRADE/SELL), warnings. Replaces running 6 separate tools before every trade.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to evaluate' },
          estimated_prob: { type: 'number', description: 'Your estimated true probability (0-1)' },
          bankroll: { type: 'number', description: 'Your available bankroll' },
          max_position_size: { type: 'number', description: 'Max position size for this trade' },
          side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Which side (auto-detected from edge if omitted)' },
        }, required: ['token_id', 'estimated_prob', 'bankroll'],
      },
      async execute(_id: string, p: any) {
        try {
          return jsonResult(await quickEdge({
            tokenId: p.token_id,
            estimatedProb: p.estimated_prob,
            bankroll: p.bankroll,
            maxPositionSize: p.max_position_size,
            side: p.side,
          }));
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ── POSITION HEATMAP ─────────────────────────────────
    {
      name: 'poly_position_heatmap',
      description: 'See ALL your positions ranked by urgency: CRITICAL (hit stop loss, needs immediate action), HIGH (approaching limits), MEDIUM, LOW. Shows exactly which positions need attention NOW vs later. Call every session.',
      parameters: {
        type: 'object', properties: {
          stop_loss_pct: { type: 'number', description: 'Stop loss threshold % (default: 10)' },
          take_profit_pct: { type: 'number', description: 'Take profit threshold % (default: 15)' },
        },
      },
      async execute(_id: string, p: any) {
        try {
          const db = getDb();
          let addr = '';
          if (db) {
            const creds = await safeDbQuery(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]);
            addr = (creds[0] as any)?.funder_address || '';
          }
          if (!addr) return errorResult('No wallet found. Run poly_setup_wallet first.');

          return jsonResult(await positionHeatmap({
            walletAddress: addr,
            stopLossPct: p.stop_loss_pct,
            takeProfitPct: p.take_profit_pct,
          }));
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ── PROFIT LOCK ──────────────────────────────────────
    {
      name: 'poly_profit_lock',
      description: 'Check if you should reduce risk after hitting daily target or approaching loss limit. Returns your current trading mode (AGGRESSIVE/NORMAL/CONSERVATIVE/LOCKED) and adjusted max position size. Call before every trade to enforce discipline.',
      parameters: {
        type: 'object', properties: {
          current_pnl: { type: 'number', description: 'Your current daily P&L' },
          daily_target: { type: 'number', description: 'Daily profit target' },
          max_daily_loss: { type: 'number', description: 'Max daily loss limit' },
          trades_today: { type: 'number', description: 'Number of trades executed today' },
          max_daily_trades: { type: 'number', description: 'Max trades per day' },
          normal_max_size: { type: 'number', description: 'Normal max position size (before adjustment)' },
        }, required: ['current_pnl', 'daily_target'],
      },
      async execute(_id: string, p: any) {
        try {
          // Get config defaults if not provided
          let maxDailyLoss = p.max_daily_loss || 50;
          let maxDailyTrades = p.max_daily_trades || 50;
          let normalMaxSize = p.normal_max_size || 50;
          let tradesToday = p.trades_today || 0;

          const db = getDb();
          if (db) {
            try {
              const config = await safeDbQuery(db, `SELECT max_daily_loss, max_daily_trades, max_order_size FROM poly_trading_config WHERE agent_id = ?`, [agentId]);
              const cfg = config[0] as any;
              if (cfg) {
                maxDailyLoss = p.max_daily_loss || cfg.max_daily_loss || maxDailyLoss;
                maxDailyTrades = p.max_daily_trades || cfg.max_daily_trades || maxDailyTrades;
                normalMaxSize = p.normal_max_size || cfg.max_order_size || normalMaxSize;
              }
            } catch {}
            try {
              const counter = await safeDbQuery(db, `SELECT count FROM poly_daily_counters WHERE agent_id = ? AND counter_key = 'trades' AND date = ?`, [agentId, new Date().toISOString().slice(0, 10)]);
              tradesToday = p.trades_today || (counter[0] as any)?.count || 0;
            } catch {}
          }

          return jsonResult(profitLockCheck({
            currentPnl: p.current_pnl,
            dailyTarget: p.daily_target,
            maxDailyLoss: maxDailyLoss,
            tradesToday: tradesToday,
            maxDailyTrades: maxDailyTrades,
            normalMaxSize: normalMaxSize,
          }));
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ── CAPITAL RECYCLER ─────────────────────────────────
    {
      name: 'poly_capital_recycler',
      description: 'When a position closes (resolved, stopped out, or sold), this finds the best opportunities to redeploy that freed capital. Returns top opportunities with suggested sizes. Keeps your capital working, not idle.',
      parameters: {
        type: 'object', properties: {
          freed_capital: { type: 'number', description: 'Amount of capital freed from closed position(s)' },
          bankroll: { type: 'number', description: 'Total bankroll for sizing' },
          risk_mode: { type: 'string', enum: ['aggressive', 'normal', 'conservative'], description: 'Risk mode affects position sizing (default: normal)' },
        }, required: ['freed_capital', 'bankroll'],
      },
      async execute(_id: string, p: any) {
        try {
          // Get current position slugs to avoid doubling up
          const db = getDb();
          let currentSlugs: string[] = [];
          if (db) {
            try {
              const creds = await safeDbQuery(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]);
              const addr = (creds[0] as any)?.funder_address;
              if (addr) {
                const { apiFetch: fetch } = await import('../../polymarket-engines/shared.js');
                const positions = await fetch(`https://data-api.polymarket.com/positions?user=${addr}`).catch(() => []);
                if (Array.isArray(positions)) {
                  currentSlugs = positions
                    .filter((pos: any) => !pos.resolved && !pos.closed)
                    .map((pos: any) => pos.market_slug || pos.slug || '')
                    .filter(Boolean);
                }
              }
            } catch {}
          }

          return jsonResult(await recycleCapital({
            freedCapital: p.freed_capital,
            bankroll: p.bankroll,
            currentPositionSlugs: currentSlugs,
            riskMode: p.risk_mode,
          }));
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ] as AnyAgentTool[];
}
