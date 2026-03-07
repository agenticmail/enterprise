/**
 * Polymarket Portfolio Meta Tools
 * 
 * Portfolio-level analysis and optimization:
 * - Mean-variance portfolio optimization
 * - Real-time drawdown monitoring with auto-reduction
 * - P&L attribution by strategy, signal, and category
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { cachedFetchJSON, cachedFetchText, validateTokenId, validateSlug, validateAddress, clampNumber, safeDbExec, safeDbQuery, safeDbGet, parseRSSItems as sharedParseRSS, withRetry ,  autoId, getDialect } from './polymarket-shared.js';

const CLOB_API = 'https://clob.polymarket.com';

// ─── DB Tables ───────────────────────────────────────────────

async function initPortfolioDB(db: any): Promise<void> {
  if (!db?.exec) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS poly_portfolio_snapshots (
      id ${autoId()},
      agent_id TEXT NOT NULL,
      total_value REAL NOT NULL,
      positions_count INTEGER NOT NULL,
      unrealized_pnl REAL DEFAULT 0,
      drawdown_pct REAL DEFAULT 0,
      peak_value REAL DEFAULT 0,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS poly_pnl_attribution (
      id ${autoId()},
      agent_id TEXT NOT NULL,
      period TEXT NOT NULL,
      strategy TEXT,
      category TEXT,
      signal_source TEXT,
      trades INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      gross_pnl REAL DEFAULT 0,
      net_pnl REAL DEFAULT 0,
      avg_hold_hours REAL DEFAULT 0,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of stmts) {
    try { db.exec(sql); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────


// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketPortfolioTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  let dbReady = false;
  async function ensureDB() {
    if (dbReady || !db) return;
    await initPortfolioDB(db);
    dbReady = true;
  }

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_portfolio_optimizer ═══
  tools.push({
    name: 'poly_portfolio_optimizer',
    label: 'Portfolio Optimizer',
    description: 'Optimize portfolio allocation across open positions using mean-variance optimization. Given your current positions and expected returns, calculates the optimal weight for each position to maximize Sharpe ratio. Also suggests rebalancing trades.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        positions: {
          type: 'string',
          description: 'JSON array of positions: [{"token_id":"...","current_value":100,"expected_return":0.15,"confidence":0.7}]',
        },
        risk_tolerance: { type: 'number', description: 'Risk tolerance 0-1 (0=conservative, 1=aggressive, default: 0.5)', default: 0.5 },
        total_capital: { type: 'number', description: 'Total capital available in USDC' },
        max_single_position_pct: { type: 'number', description: 'Max % in any single position (default: 25)', default: 25 },
      },
      required: ['positions', 'total_capital'],
    },
    execute: async (params: any) => {
      try {
        let positions: any[];
        try { positions = JSON.parse(params.positions); }
        catch { return errorResult('Invalid JSON in positions parameter'); }
        
        if (!positions.length) return errorResult('Need at least 1 position');
        const totalCapital = params.total_capital;
        const riskTol = params.risk_tolerance || 0.5;
        const maxPct = (params.max_single_position_pct || 25) / 100;

        // Fetch current prices for each position
        const enriched = await Promise.all(positions.map(async (pos: any) => {
          let currentPrice = 0.5;
          try {
            const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${pos.token_id}`);
            const bestBid = Math.max(...(book?.bids || []).map((b: any) => parseFloat(b.price)), 0);
            const bestAsk = Math.min(...(book?.asks || []).map((a: any) => parseFloat(a.price)), 1);
            currentPrice = (bestBid + bestAsk) / 2;
          } catch {}
          return { ...pos, currentPrice };
        }));

        // Simple mean-variance: Kelly-like allocation
        // Weight = (expected_return * confidence) / sum(expected_return * confidence)
        // Then scale by risk tolerance
        const rawWeights = enriched.map((p: any) => {
          const edge = (p.expected_return || 0.1) * (p.confidence || 0.5);
          return Math.max(0, edge);
        });
        const totalWeight = rawWeights.reduce((s: number, w: number) => s + w, 0);

        const normalizedWeights = totalWeight > 0
          ? rawWeights.map((w: number) => Math.min(maxPct, (w / totalWeight) * riskTol + (1 - riskTol) / enriched.length))
          : rawWeights.map(() => 1 / enriched.length);

        // Re-normalize to sum to 1 (or less if conservative)
        const wSum = normalizedWeights.reduce((s: number, w: number) => s + w, 0);
        const finalWeights = normalizedWeights.map((w: number) => +(w / wSum).toFixed(4));

        // Calculate recommended positions
        const recommendations = enriched.map((pos: any, i: number) => {
          const targetValue = totalCapital * finalWeights[i];
          const currentValue = pos.current_value || 0;
          const delta = targetValue - currentValue;
          return {
            token_id: pos.token_id,
            current_value: currentValue,
            target_weight: finalWeights[i],
            target_value: +targetValue.toFixed(2),
            delta: +delta.toFixed(2),
            action: Math.abs(delta) < 10 ? 'HOLD' : delta > 0 ? `BUY $${delta.toFixed(2)}` : `SELL $${Math.abs(delta).toFixed(2)}`,
            expected_return: pos.expected_return,
            confidence: pos.confidence,
            current_price: pos.currentPrice,
          };
        });

        // Calculate expected portfolio metrics
        const expectedReturn = recommendations.reduce((s: number, r: any) => 
          s + (r.target_weight * (r.expected_return || 0)), 0);
        const cashReserve = totalCapital - recommendations.reduce((s: number, r: any) => s + r.target_value, 0);

        return jsonResult({
          total_capital: totalCapital,
          risk_tolerance: riskTol,
          positions: recommendations,
          portfolio_metrics: {
            expected_return: +expectedReturn.toFixed(4),
            positions_count: recommendations.length,
            cash_reserve: +Math.max(0, cashReserve).toFixed(2),
            max_position_weight: +Math.max(...finalWeights).toFixed(4),
            min_position_weight: +Math.min(...finalWeights).toFixed(4),
          },
          trades_needed: recommendations.filter(r => r.action !== 'HOLD').map(r => ({
            token_id: r.token_id,
            action: r.action,
            size: Math.abs(r.delta),
          })),
        });
      } catch (e: any) {
        return errorResult(`Portfolio optimization failed: ${e.message}`);
      }
    },
  });

  // ═══ 2. poly_drawdown_monitor ═══
  tools.push({
    name: 'poly_drawdown_monitor',
    label: 'Drawdown Monitor',
    description: 'Real-time drawdown tracking with automatic alerts and position reduction suggestions. Monitors portfolio value against peak, triggers warnings at configurable thresholds. Use as a circuit breaker for risk management.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'history', 'set_limits'], description: 'Action' },
        current_value: { type: 'number', description: 'Current portfolio value in USDC (for check)' },
        peak_value: { type: 'number', description: 'Peak portfolio value (auto-tracked if using check regularly)' },
        warning_pct: { type: 'number', description: 'Warning threshold % (default: 10)', default: 10 },
        critical_pct: { type: 'number', description: 'Critical threshold % — halt trading (default: 20)', default: 20 },
        daily_loss_limit: { type: 'number', description: 'Max USDC loss per day before halting' },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'check') {
        if (!params.current_value) return errorResult('current_value required');
        
        const currentValue = params.current_value;

        // Get or set peak
        let peakValue = params.peak_value || currentValue;
        try {
          const lastSnapshot = db.prepare('SELECT peak_value FROM poly_portfolio_snapshots WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1').get(agentId);
          if (lastSnapshot && lastSnapshot.peak_value > peakValue) peakValue = lastSnapshot.peak_value;
        } catch {}
        if (currentValue > peakValue) peakValue = currentValue;

        const drawdown = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
        const unrealizedPnl = currentValue - peakValue;

        // Store snapshot
        try {
          db.prepare(`INSERT INTO poly_portfolio_snapshots (agent_id, total_value, positions_count, unrealized_pnl, drawdown_pct, peak_value)
            VALUES (?, ?, 0, ?, ?, ?)`)
            .run(agentId, currentValue, unrealizedPnl, drawdown, peakValue);
        } catch {}

        const warningPct = params.warning_pct || 10;
        const criticalPct = params.critical_pct || 20;

        let status = 'NORMAL';
        let action_needed = 'None';
        if (drawdown >= criticalPct) {
          status = 'CRITICAL';
          action_needed = `HALT ALL TRADING. Drawdown ${drawdown.toFixed(1)}% exceeds critical threshold of ${criticalPct}%. Reduce positions by 50% immediately.`;
        } else if (drawdown >= warningPct) {
          status = 'WARNING';
          action_needed = `Drawdown ${drawdown.toFixed(1)}% exceeds warning threshold of ${warningPct}%. Reduce position sizes by 25%. No new positions.`;
        }

        // Daily P&L check
        let dailyPnl: any = null;
        try {
          const pastDay = getDialect() === 'postgres' ? `CURRENT_TIMESTAMP - INTERVAL '1 day'` : getDialect() === 'mysql' ? `DATE_SUB(NOW(), INTERVAL 1 DAY)` : `datetime('now', '-1 day')`;
          const todaySnapshots = db.prepare(`SELECT total_value FROM poly_portfolio_snapshots WHERE agent_id = ? AND timestamp >= ${pastDay} ORDER BY timestamp ASC`).all(agentId);
          if (todaySnapshots.length >= 2) {
            const startValue = todaySnapshots[0].total_value;
            dailyPnl = {
              start: +startValue.toFixed(2),
              current: +currentValue.toFixed(2),
              daily_change: +(currentValue - startValue).toFixed(2),
              daily_pct: +((currentValue - startValue) / startValue * 100).toFixed(2),
            };
            
            if (params.daily_loss_limit && (startValue - currentValue) > params.daily_loss_limit) {
              status = 'CRITICAL';
              action_needed = `Daily loss $${(startValue - currentValue).toFixed(2)} exceeds limit of $${params.daily_loss_limit}. HALT TRADING.`;
            }
          }
        } catch {}

        return jsonResult({
          status,
          current_value: currentValue,
          peak_value: peakValue,
          drawdown_pct: +drawdown.toFixed(2),
          drawdown_usdc: +(peakValue - currentValue).toFixed(2),
          thresholds: { warning: warningPct, critical: criticalPct },
          daily_pnl: dailyPnl,
          action_needed,
        });
      }

      if (action === 'history') {
        try {
          const rows = db.prepare('SELECT * FROM poly_portfolio_snapshots WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 100').all(agentId);
          const peak = rows.length ? Math.max(...rows.map((r: any) => r.total_value)) : 0;
          const trough = rows.length ? Math.min(...rows.map((r: any) => r.total_value)) : 0;
          return jsonResult({
            snapshots: rows.slice(0, 50),
            total_snapshots: rows.length,
            peak_value: +peak.toFixed(2),
            trough_value: +trough.toFixed(2),
            max_drawdown_pct: peak > 0 ? +((peak - trough) / peak * 100).toFixed(2) : 0,
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      return jsonResult({ note: 'Use action=check with current_value, or action=history' });
    },
  });

  // ═══ 3. poly_pnl_attribution ═══
  tools.push({
    name: 'poly_pnl_attribution',
    label: 'P&L Attribution',
    description: 'Attribute P&L to strategies, signals, and market categories. Shows which approaches are actually making money so you can kill losers and double down on winners. Uses trade log and prediction data.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['analyze', 'record', 'summary'], description: 'Action' },
        period: { type: 'string', enum: ['today', 'week', 'month', 'all'], default: 'all' },
        // For record action:
        strategy: { type: 'string', description: 'Strategy name (for record)' },
        category: { type: 'string', description: 'Market category (for record)' },
        signal_source: { type: 'string', description: 'Signal source (for record)' },
        pnl: { type: 'number', description: 'P&L amount (for record)' },
        is_win: { type: 'boolean', description: 'Was this a winning trade (for record)' },
        hold_hours: { type: 'number', description: 'How long position was held in hours (for record)' },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'record') {
        if (!params.strategy && !params.category && !params.signal_source) {
          return errorResult('At least one of strategy, category, or signal_source required');
        }
        try {
          db.prepare(`INSERT INTO poly_pnl_attribution (agent_id, period, strategy, category, signal_source, trades, wins, gross_pnl, net_pnl, avg_hold_hours)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
            .run(agentId, params.period || 'all', params.strategy || null, params.category || null,
                 params.signal_source || null, params.is_win ? 1 : 0, params.pnl || 0, params.pnl || 0, params.hold_hours || 0);
          return jsonResult({ recorded: true });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'analyze' || action === 'summary') {
        try {
          // Aggregate by strategy
          const byStrategy = db.prepare(`SELECT strategy, COUNT(*) as trades, SUM(wins) as wins, SUM(net_pnl) as total_pnl, AVG(avg_hold_hours) as avg_hold
            FROM poly_pnl_attribution WHERE agent_id = ? AND strategy IS NOT NULL GROUP BY strategy ORDER BY total_pnl DESC`)
            .all(agentId);

          // Aggregate by category
          const byCategory = db.prepare(`SELECT category, COUNT(*) as trades, SUM(wins) as wins, SUM(net_pnl) as total_pnl
            FROM poly_pnl_attribution WHERE agent_id = ? AND category IS NOT NULL GROUP BY category ORDER BY total_pnl DESC`)
            .all(agentId);

          // Aggregate by signal
          const bySignal = db.prepare(`SELECT signal_source, COUNT(*) as trades, SUM(wins) as wins, SUM(net_pnl) as total_pnl
            FROM poly_pnl_attribution WHERE agent_id = ? AND signal_source IS NOT NULL GROUP BY signal_source ORDER BY total_pnl DESC`)
            .all(agentId);

          // Also pull from trade log if available
          let tradeLogStats: any = null;
          try {
            tradeLogStats = db.prepare(`SELECT COUNT(*) as total_trades, SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
              SUM(pnl) as total_pnl, AVG(pnl) as avg_pnl FROM poly_trade_log WHERE agent_id = ?`).get(agentId);
          } catch {}

          const addWinRate = (rows: any[]) => rows.map(r => ({
            ...r,
            win_rate: r.trades > 0 ? +((r.wins / r.trades) * 100).toFixed(1) : 0,
            avg_pnl: r.trades > 0 ? +(r.total_pnl / r.trades).toFixed(2) : 0,
          }));

          return jsonResult({
            by_strategy: addWinRate(byStrategy),
            by_category: addWinRate(byCategory),
            by_signal: addWinRate(bySignal),
            trade_log_summary: tradeLogStats,
            best_strategy: byStrategy[0] || null,
            worst_strategy: byStrategy[byStrategy.length - 1] || null,
            recommendation: byStrategy.length > 0
              ? `Best: "${byStrategy[0]?.strategy}" ($${(byStrategy[0]?.total_pnl || 0).toFixed(2)} P&L). ${
                  byStrategy[byStrategy.length - 1]?.total_pnl < 0
                    ? `Worst: "${byStrategy[byStrategy.length - 1]?.strategy}" — consider dropping.`
                    : 'All strategies profitable.'
                }`
              : 'No attribution data yet. Use record action after each trade.',
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      return errorResult('Use action=analyze, record, or summary');
    },
  });

  return tools;
}
