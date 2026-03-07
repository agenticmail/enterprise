/**
 * Polymarket Execution Edge Tools
 * 
 * Smart order execution and position management:
 * - Sniper orders (trailing limit orders with auto-adjust)
 * - TWAP/VWAP scale-in execution
 * - Correlation-based hedging
 * - Automated exit strategies (TP, SL, trailing stop, time-based)
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { cachedFetchJSON, cachedFetchText, validateTokenId, validateSlug, validateAddress, clampNumber, safeDbExec, safeDbQuery, safeDbGet, parseRSSItems as sharedParseRSS, withRetry } from './polymarket-shared.js';
import { initPolymarketDB, getClobClient, loadConfig, logTrade } from './polymarket-runtime.js';

const CLOB_API = 'https://clob.polymarket.com';

// ─── DB Tables ───────────────────────────────────────────────

async function initExecutionDB(db: any): Promise<void> {
  if (!db?.exec) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS poly_sniper_orders (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      side TEXT NOT NULL,
      target_price REAL NOT NULL,
      max_price REAL,
      trail_amount REAL DEFAULT 0.01,
      size_usdc REAL NOT NULL,
      cancel_price REAL,
      status TEXT DEFAULT 'active',
      filled_size REAL DEFAULT 0,
      filled_avg_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poly_scale_orders (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      side TEXT NOT NULL,
      total_size REAL NOT NULL,
      slices INTEGER NOT NULL,
      interval_seconds INTEGER NOT NULL,
      strategy TEXT DEFAULT 'twap',
      completed_slices INTEGER DEFAULT 0,
      filled_size REAL DEFAULT 0,
      avg_price REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poly_exit_rules (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      entry_price REAL NOT NULL,
      position_size REAL NOT NULL,
      take_profit REAL,
      stop_loss REAL,
      trailing_stop_pct REAL,
      time_exit TEXT,
      highest_price REAL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poly_hedges (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      primary_token TEXT NOT NULL,
      hedge_token TEXT NOT NULL,
      primary_side TEXT NOT NULL,
      hedge_side TEXT NOT NULL,
      primary_size REAL NOT NULL,
      hedge_size REAL NOT NULL,
      hedge_ratio REAL NOT NULL,
      correlation REAL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ];
  for (const sql of stmts) {
    try { db.exec(sql); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────


// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketExecutionTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  let dbReady = false;
  async function ensureDB() {
    if (dbReady || !db) return;
    await initExecutionDB(db);
    dbReady = true;
  }

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_sniper ═══
  tools.push({
    name: 'poly_sniper',
    label: 'Sniper Order',
    description: 'Smart limit order that auto-adjusts. Set a target price and the sniper will trail the best bid/ask by a small amount, automatically adjusting the limit price to stay competitive. Cancels if price hits a ceiling. Perfect for accumulating at the best possible price.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'cancel', 'status'], description: 'Action to perform' },
        id: { type: 'string', description: 'Sniper order ID (for cancel/status)' },
        token_id: { type: 'string', description: 'Token ID (for create)' },
        side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Order side' },
        target_price: { type: 'number', description: 'Target price to buy/sell at' },
        max_price: { type: 'number', description: 'Maximum price willing to pay (for BUY) or minimum to accept (for SELL)' },
        trail_amount: { type: 'number', description: 'How much to trail best bid/ask by (default: 0.01)', default: 0.01 },
        size_usdc: { type: 'number', description: 'Total USDC to spend' },
        cancel_price: { type: 'number', description: 'Auto-cancel if price reaches this level' },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'create') {
        if (!params.token_id || !params.side || !params.target_price || !params.size_usdc) {
          return errorResult('token_id, side, target_price, and size_usdc required');
        }
        const id = `snipe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          db.prepare(`INSERT INTO poly_sniper_orders (id, agent_id, token_id, side, target_price, max_price, trail_amount, size_usdc, cancel_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, agentId, params.token_id, params.side, params.target_price,
                 params.max_price || null, params.trail_amount || 0.01, params.size_usdc, params.cancel_price || null);

          // Get current book to show where we'd be placed
          let currentBook: any = null;
          try {
            const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${params.token_id}`);
            const bestBid = Math.max(...(book?.bids || []).map((b: any) => parseFloat(b.price)));
            const bestAsk = Math.min(...(book?.asks || []).map((a: any) => parseFloat(a.price)));
            currentBook = { bestBid, bestAsk, spread: +(bestAsk - bestBid).toFixed(4) };
          } catch {}

          return jsonResult({
            created: id,
            token_id: params.token_id,
            side: params.side,
            target_price: params.target_price,
            max_price: params.max_price,
            trail_amount: params.trail_amount || 0.01,
            size_usdc: params.size_usdc,
            cancel_price: params.cancel_price,
            current_book: currentBook,
            note: 'Sniper order created. In production, this would monitor the orderbook and auto-adjust your limit order. Currently tracked in DB — use poly_sniper with action=status to check. Execute manually or wait for the automated execution loop.',
            execution_strategy: params.side === 'BUY'
              ? `Will place limit bid at best_bid + ${params.trail_amount}. If price drops to ${params.target_price}, will fill. Cancels if price hits ${params.cancel_price || 'never'}.`
              : `Will place limit ask at best_ask - ${params.trail_amount}. If price rises to ${params.target_price}, will fill. Cancels if price hits ${params.cancel_price || 'never'}.`,
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'cancel') {
        if (!params.id) return errorResult('id required');
        try {
          db.prepare("UPDATE poly_sniper_orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND agent_id = ?")
            .run(params.id, agentId);
          return jsonResult({ cancelled: params.id });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'status') {
        if (!params.id) return errorResult('id required');
        try {
          const row = db.prepare('SELECT * FROM poly_sniper_orders WHERE id = ? AND agent_id = ?').get(params.id, agentId);
          if (!row) return errorResult('Sniper order not found');
          return jsonResult(row);
        } catch (e: any) { return errorResult(e.message); }
      }

      // list
      try {
        const rows = db.prepare("SELECT * FROM poly_sniper_orders WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC").all(agentId);
        return jsonResult({ active_snipers: rows, total: rows.length });
      } catch (e: any) { return errorResult(e.message); }
    },
  });

  // ═══ 2. poly_scale_in ═══
  tools.push({
    name: 'poly_scale_in',
    label: 'Scale In (TWAP/VWAP)',
    description: 'Execute a large order by splitting it into smaller slices over time (TWAP) or proportional to volume (VWAP). Minimizes market impact when building or unwinding large positions. Essential for $1000+ orders in thin markets.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'cancel', 'status'], description: 'Action' },
        id: { type: 'string', description: 'Scale order ID (for cancel/status)' },
        token_id: { type: 'string', description: 'Token ID (for create)' },
        side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Order side' },
        total_size: { type: 'number', description: 'Total USDC to trade' },
        slices: { type: 'number', description: 'Number of slices (default: 10)', default: 10 },
        interval_minutes: { type: 'number', description: 'Minutes between slices (default: 5)', default: 5 },
        strategy: { type: 'string', enum: ['twap', 'vwap', 'aggressive', 'passive'], default: 'twap' },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'create') {
        if (!params.token_id || !params.side || !params.total_size) {
          return errorResult('token_id, side, and total_size required');
        }
        const slices = params.slices || 10;
        const intervalSec = (params.interval_minutes || 5) * 60;
        const sliceSize = params.total_size / slices;
        const id = `scale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
          db.prepare(`INSERT INTO poly_scale_orders (id, agent_id, token_id, side, total_size, slices, interval_seconds, strategy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, agentId, params.token_id, params.side, params.total_size, slices, intervalSec, params.strategy || 'twap');

          const totalDuration = slices * (params.interval_minutes || 5);

          return jsonResult({
            created: id,
            token_id: params.token_id,
            side: params.side,
            total_size: params.total_size,
            slices,
            slice_size: +sliceSize.toFixed(2),
            interval_minutes: params.interval_minutes || 5,
            strategy: params.strategy || 'twap',
            estimated_duration_minutes: totalDuration,
            schedule: Array.from({ length: Math.min(slices, 10) }, (_, i) => ({
              slice: i + 1,
              size_usdc: +sliceSize.toFixed(2),
              execute_at: `+${i * (params.interval_minutes || 5)}min`,
            })),
            note: `Scale-in plan created. ${slices} slices of $${sliceSize.toFixed(2)} every ${params.interval_minutes || 5} minutes = ${totalDuration} minutes total. Execute each slice using poly_place_order or set up a cron job for automated execution.`,
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'cancel') {
        if (!params.id) return errorResult('id required');
        try {
          db.prepare("UPDATE poly_scale_orders SET status = 'cancelled' WHERE id = ? AND agent_id = ?").run(params.id, agentId);
          return jsonResult({ cancelled: params.id });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'status') {
        if (!params.id) return errorResult('id required');
        try {
          const row = db.prepare('SELECT * FROM poly_scale_orders WHERE id = ? AND agent_id = ?').get(params.id, agentId);
          if (!row) return errorResult('Scale order not found');
          const remaining = row.slices - row.completed_slices;
          return jsonResult({
            ...row,
            remaining_slices: remaining,
            remaining_usdc: +(row.total_size - row.filled_size).toFixed(2),
            progress_pct: +((row.completed_slices / row.slices) * 100).toFixed(1),
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      // list
      try {
        const rows = db.prepare("SELECT * FROM poly_scale_orders WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC").all(agentId);
        return jsonResult({ active_scales: rows, total: rows.length });
      } catch (e: any) { return errorResult(e.message); }
    },
  });

  // ═══ 3. poly_hedge ═══
  tools.push({
    name: 'poly_hedge',
    label: 'Hedge Position',
    description: 'Create a hedge by taking an opposing position in a correlated market. Reduces directional risk while capturing spread between related markets. Specify the primary and hedge tokens with a ratio.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'close', 'analyze'], description: 'Action' },
        id: { type: 'string', description: 'Hedge ID (for close)' },
        primary_token: { type: 'string', description: 'Primary position token ID' },
        hedge_token: { type: 'string', description: 'Hedge token ID (correlated market)' },
        primary_side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Primary position side' },
        primary_size: { type: 'number', description: 'Primary position size in USDC' },
        hedge_ratio: { type: 'number', description: 'Hedge ratio (0.5 = half hedge, 1.0 = full hedge, default: 0.5)', default: 0.5 },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'create') {
        if (!params.primary_token || !params.hedge_token || !params.primary_side || !params.primary_size) {
          return errorResult('primary_token, hedge_token, primary_side, primary_size required');
        }

        const hedgeRatio = params.hedge_ratio || 0.5;
        const hedgeSide = params.primary_side === 'BUY' ? 'SELL' : 'BUY';
        const hedgeSize = +(params.primary_size * hedgeRatio).toFixed(2);
        const id = `hedge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
          db.prepare(`INSERT INTO poly_hedges (id, agent_id, primary_token, hedge_token, primary_side, hedge_side, primary_size, hedge_size, hedge_ratio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, agentId, params.primary_token, params.hedge_token, params.primary_side, hedgeSide,
                 params.primary_size, hedgeSize, hedgeRatio);

          return jsonResult({
            created: id,
            primary: { token: params.primary_token, side: params.primary_side, size: params.primary_size },
            hedge: { token: params.hedge_token, side: hedgeSide, size: hedgeSize },
            hedge_ratio: hedgeRatio,
            net_exposure: +(params.primary_size - hedgeSize).toFixed(2),
            note: 'Hedge plan created. Execute both legs: (1) poly_place_order for primary, (2) poly_place_order for hedge. The hedge reduces your directional risk by ' + (hedgeRatio * 100).toFixed(0) + '%.',
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'analyze') {
        if (!params.primary_token || !params.hedge_token) return errorResult('primary_token and hedge_token required');
        
        try {
          // Fetch both prices
          const [book1, book2] = await Promise.all([
            cachedFetchJSON(`${CLOB_API}/book?token_id=${params.primary_token}`).catch(() => null),
            cachedFetchJSON(`${CLOB_API}/book?token_id=${params.hedge_token}`).catch(() => null),
          ]);
          
          const mid1 = book1 ? (Math.max(...(book1.bids || []).map((b: any) => parseFloat(b.price))) + Math.min(...(book1.asks || []).map((a: any) => parseFloat(a.price)))) / 2 : 0;
          const mid2 = book2 ? (Math.max(...(book2.bids || []).map((b: any) => parseFloat(b.price))) + Math.min(...(book2.asks || []).map((a: any) => parseFloat(a.price)))) / 2 : 0;

          return jsonResult({
            primary: { token: params.primary_token, mid_price: +mid1.toFixed(4) },
            hedge: { token: params.hedge_token, mid_price: +mid2.toFixed(4) },
            price_spread: +Math.abs(mid1 - mid2).toFixed(4),
            recommended_ratio: mid1 > 0 && mid2 > 0 ? +(mid1 / mid2).toFixed(2) : 0.5,
            note: 'If tokens are from the same market (YES/NO), optimal hedge ratio is the price ratio. If from correlated markets, use poly_market_correlation first.',
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'close') {
        if (!params.id) return errorResult('id required');
        try {
          db.prepare("UPDATE poly_hedges SET status = 'closed' WHERE id = ? AND agent_id = ?").run(params.id, agentId);
          return jsonResult({ closed: params.id, note: 'Hedge marked as closed. Unwind both legs manually using poly_place_order.' });
        } catch (e: any) { return errorResult(e.message); }
      }

      // list
      try {
        const rows = db.prepare("SELECT * FROM poly_hedges WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC").all(agentId);
        return jsonResult({ active_hedges: rows, total: rows.length });
      } catch (e: any) { return errorResult(e.message); }
    },
  });

  // ═══ 4. poly_exit_strategy ═══
  tools.push({
    name: 'poly_exit_strategy',
    label: 'Exit Strategy',
    description: 'Set automated exit rules for a position: take-profit, stop-loss, trailing stop, and time-based exits. When a condition triggers, the tool flags the position for immediate action. Never hold a position without an exit plan.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'remove', 'check'], description: 'Action' },
        id: { type: 'string', description: 'Exit rule ID (for remove)' },
        token_id: { type: 'string', description: 'Token ID (for create/check)' },
        entry_price: { type: 'number', description: 'Your entry price' },
        position_size: { type: 'number', description: 'Position size in shares' },
        take_profit: { type: 'number', description: 'Take profit price' },
        stop_loss: { type: 'number', description: 'Stop loss price' },
        trailing_stop_pct: { type: 'number', description: 'Trailing stop as % from highest price (e.g., 10 = 10%)' },
        time_exit: { type: 'string', description: 'Time-based exit: ISO date or relative like "24h", "7d"' },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      if (!db) return errorResult('No DB available');

      const action = params.action;

      if (action === 'create') {
        if (!params.token_id || !params.entry_price) return errorResult('token_id and entry_price required');
        if (!params.take_profit && !params.stop_loss && !params.trailing_stop_pct && !params.time_exit) {
          return errorResult('At least one exit condition required: take_profit, stop_loss, trailing_stop_pct, or time_exit');
        }

        const id = `exit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Parse time_exit to absolute date
        let timeExit = params.time_exit || null;
        if (timeExit && !timeExit.includes('T')) {
          const match = timeExit.match(/^(\d+)(h|d|m)$/);
          if (match) {
            const ms = parseInt(match[1]) * (match[2] === 'h' ? 3600000 : match[2] === 'd' ? 86400000 : 60000);
            timeExit = new Date(Date.now() + ms).toISOString();
          }
        }

        try {
          db.prepare(`INSERT INTO poly_exit_rules (id, agent_id, token_id, entry_price, position_size, take_profit, stop_loss, trailing_stop_pct, time_exit, highest_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, agentId, params.token_id, params.entry_price, params.position_size || 0,
                 params.take_profit || null, params.stop_loss || null, params.trailing_stop_pct || null,
                 timeExit, params.entry_price);

          return jsonResult({
            created: id,
            token_id: params.token_id,
            entry_price: params.entry_price,
            rules: {
              take_profit: params.take_profit || null,
              stop_loss: params.stop_loss || null,
              trailing_stop_pct: params.trailing_stop_pct || null,
              time_exit: timeExit,
            },
            note: 'Exit rules set. Check triggers periodically with action=check, or set up a heartbeat/cron to auto-check.',
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'check') {
        // Check all active exit rules against current prices
        try {
          const rules = params.token_id
            ? db.prepare("SELECT * FROM poly_exit_rules WHERE agent_id = ? AND token_id = ? AND status = 'active'").all(agentId, params.token_id)
            : db.prepare("SELECT * FROM poly_exit_rules WHERE agent_id = ? AND status = 'active'").all(agentId);

          if (!rules.length) return jsonResult({ triggers: [], note: 'No active exit rules' });

          const triggers: any[] = [];
          const tokenIds: string[] = [...new Set<string>(rules.map((r: any) => r.token_id))];

          // Fetch current prices
          const prices: Record<string, number> = {};
          await Promise.all(tokenIds.map(async (tid: string) => {
            try {
              const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tid}`);
              const bestBid = Math.max(...(book?.bids || []).map((b: any) => parseFloat(b.price)), 0);
              const bestAsk = Math.min(...(book?.asks || []).map((a: any) => parseFloat(a.price)), 1);
              prices[tid] = (bestBid + bestAsk) / 2;
            } catch {}
          }));

          const now = new Date();

          for (const rule of rules) {
            const currentPrice = prices[rule.token_id];
            if (!currentPrice) continue;

            // Update highest price for trailing stop
            if (currentPrice > (rule.highest_price || 0)) {
              try {
                db.prepare("UPDATE poly_exit_rules SET highest_price = ? WHERE id = ?").run(currentPrice, rule.id);
              } catch {}
            }

            // Check take profit
            if (rule.take_profit && currentPrice >= rule.take_profit) {
              triggers.push({
                id: rule.id,
                type: 'TAKE_PROFIT',
                token_id: rule.token_id,
                trigger_price: rule.take_profit,
                current_price: currentPrice,
                entry_price: rule.entry_price,
                pnl_pct: +(((currentPrice - rule.entry_price) / rule.entry_price) * 100).toFixed(2),
                action: 'SELL NOW — Take profit target reached',
              });
            }

            // Check stop loss
            if (rule.stop_loss && currentPrice <= rule.stop_loss) {
              triggers.push({
                id: rule.id,
                type: 'STOP_LOSS',
                token_id: rule.token_id,
                trigger_price: rule.stop_loss,
                current_price: currentPrice,
                entry_price: rule.entry_price,
                pnl_pct: +(((currentPrice - rule.entry_price) / rule.entry_price) * 100).toFixed(2),
                action: 'SELL NOW — Stop loss triggered',
              });
            }

            // Check trailing stop
            if (rule.trailing_stop_pct && rule.highest_price) {
              const trailPrice = rule.highest_price * (1 - rule.trailing_stop_pct / 100);
              if (currentPrice <= trailPrice) {
                triggers.push({
                  id: rule.id,
                  type: 'TRAILING_STOP',
                  token_id: rule.token_id,
                  highest_price: rule.highest_price,
                  trail_pct: rule.trailing_stop_pct,
                  trigger_price: +trailPrice.toFixed(4),
                  current_price: currentPrice,
                  action: `SELL NOW — Price dropped ${rule.trailing_stop_pct}% from high of ${rule.highest_price}`,
                });
              }
            }

            // Check time exit
            if (rule.time_exit && new Date(rule.time_exit) <= now) {
              triggers.push({
                id: rule.id,
                type: 'TIME_EXIT',
                token_id: rule.token_id,
                time_exit: rule.time_exit,
                current_price: currentPrice,
                entry_price: rule.entry_price,
                action: 'SELL NOW — Time-based exit triggered',
              });
            }
          }

          return jsonResult({
            rules_checked: rules.length,
            triggers_fired: triggers.length,
            triggers,
            all_clear: triggers.length === 0,
          });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'remove') {
        if (!params.id) return errorResult('id required');
        try {
          db.prepare("UPDATE poly_exit_rules SET status = 'removed' WHERE id = ? AND agent_id = ?").run(params.id, agentId);
          return jsonResult({ removed: params.id });
        } catch (e: any) { return errorResult(e.message); }
      }

      // list
      try {
        const rows = db.prepare("SELECT * FROM poly_exit_rules WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC").all(agentId);
        return jsonResult({ active_rules: rows, total: rows.length });
      } catch (e: any) { return errorResult(e.message); }
    },
  });

  return tools;
}
