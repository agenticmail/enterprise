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
  const agentId = opts?.agentId || 'default';

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
          action: { type: 'string', enum: ['record', 'check', 'status', 'history'], description: 'Action to take (check = auto-record from wallet + status)' },
          current_value: { type: 'number', description: 'Current portfolio value (for record). If omitted with action=record or check, auto-computes from wallet balance + positions.' },
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

          // Auto-compute current_value from wallet when not provided
          let currentValue = p.current_value;
          if (currentValue == null && (p.action === 'record' || p.action === 'check')) {
            try {
              const creds = await safeDbQuery(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]);
              const addr = (creds[0] as any)?.funder_address;
              if (addr) {
                // Get wallet USDC.e balance via RPC (multi-RPC fallback)
                let walletBal = 0;
                const RPCS = ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'];
                const addrHex = addr.slice(2).toLowerCase();
                const callData = '0x70a08231000000000000000000000000' + addrHex;
                for (const rpc of RPCS) {
                  try {
                    const r = await fetch(rpc, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', data: callData }, 'latest'] }),
                      signal: AbortSignal.timeout(4000),
                    }).then(r => r.json());
                    if (r?.result && !r.error) { walletBal = Number(BigInt(r.result)) / 1e6; break; }
                  } catch {}
                }
                // Get position values from Data API
                let posValue = 0;
                try {
                  const positions = await apiFetch(`https://data-api.polymarket.com/positions?user=${addr}`);
                  if (Array.isArray(positions)) {
                    for (const pos of positions) {
                      if (!pos.resolved && !pos.closed) {
                        const size = Number(pos.size || 0);
                        const price = Number(pos.curPrice ?? pos.current_price ?? pos.price ?? 0);
                        posValue += size * price;
                      }
                    }
                  }
                } catch {}
                currentValue = walletBal + posValue;
              }
            } catch {}
          }

          if (p.action === 'record' || p.action === 'check') {
            if (currentValue == null) return jsonResult({ latest: null, note: 'No portfolio value available yet. Make a trade first, then drawdown tracking begins automatically.' });
            const rows = await safeDbQuery(db, `SELECT MAX(peak) as max_peak FROM poly_drawdown_log`);
            const prevPeak = (rows[0] as any)?.max_peak || currentValue;
            const peak = Math.max(prevPeak, currentValue);
            const drawdown = peak > 0 ? ((peak - currentValue) / peak) * 100 : 0;
            await safeDbExec(db, `INSERT INTO poly_drawdown_log (value, peak, drawdown_pct) VALUES (?, ?, ?)`,
              [currentValue, peak, drawdown]);
            const alert = drawdown > (p.alert_threshold || 10);
            return jsonResult({ value: currentValue, peak, drawdown_pct: +drawdown.toFixed(2), alert, threshold: p.alert_threshold || 10 });
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
            const creds = db ? await safeDbQuery(db, `SELECT funder_address FROM poly_wallet_credentials WHERE agent_id = ?`, [agentId]) : [];
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

    // ═══ FUND TRANSFER (APPROVAL-GATED) ══════════════════════

    {
      name: 'poly_transfer_funds',
      description: 'Transfer USDC to a whitelisted withdrawal address. ALWAYS requires human approval. Destination must be pre-registered in poly_whitelisted_addresses with a 24h cooling period.',
      parameters: {
        type: 'object', properties: {
          to_label: { type: 'string', description: 'Label of the whitelisted address' },
          amount: { type: 'number', description: 'Amount in USD to transfer' },
          token: { type: 'string', description: 'Token to transfer (default: USDC)' },
          reason: { type: 'string', description: 'Reason for the transfer' },
        }, required: ['to_label', 'amount'],
      },
      async execute(_id: string, p: any) {
        try {
          const db = getDb();
          if (!db) return errorResult('No database available');

          const token = (p.token || 'USDC').toUpperCase();
          const amount = parseFloat(p.amount);
          if (!amount || amount <= 0) return errorResult('Amount must be a positive number');
          if (!p.to_label) return errorResult('to_label is required — specify the label of the whitelisted address');

          // 1. Look up whitelisted address by label
          const whitelist = await safeDbQuery(db, `SELECT * FROM poly_whitelisted_addresses WHERE agent_id = ? AND label = ? AND is_active = 1`, [agentId, p.to_label]);
          if (!whitelist || whitelist.length === 0) {
            // List available addresses to help the agent
            const available = await safeDbQuery(db, `SELECT label, address, per_tx_limit, daily_limit FROM poly_whitelisted_addresses WHERE agent_id = ? AND is_active = 1`, [agentId]);
            return jsonResult({
              status: 'error',
              message: `No whitelisted address found with label "${p.to_label}".`,
              available_addresses: available?.length ? available : [],
              hint: available?.length ? 'Use one of the available address labels.' : 'No whitelisted addresses configured. An admin must add withdrawal addresses with a 24h cooling period before transfers can be made.',
            });
          }

          const dest = whitelist[0] as any;

          // 2. Check cooling period (24h after creation)
          const coolingUntil = new Date(dest.cooling_until).getTime();
          if (Date.now() < coolingUntil) {
            const hoursLeft = ((coolingUntil - Date.now()) / 3600_000).toFixed(1);
            return jsonResult({
              status: 'cooling_period',
              message: `Address "${p.to_label}" is still in 24h cooling period. ${hoursLeft}h remaining.`,
              cooling_until: dest.cooling_until,
            });
          }

          // 3. Check per-transaction limit
          const perTxLimit = parseFloat(dest.per_tx_limit || '100');
          if (amount > perTxLimit) {
            return jsonResult({
              status: 'over_limit',
              message: `Amount $${amount} exceeds per-transaction limit of $${perTxLimit} for address "${p.to_label}".`,
              per_tx_limit: perTxLimit,
            });
          }

          // 4. Check daily limit
          const dailyLimit = parseFloat(dest.daily_limit || '500');
          const today = new Date().toISOString().slice(0, 10);
          const dailyRows = await safeDbQuery(db, `SELECT total_transferred FROM poly_transfer_daily WHERE agent_id = ? AND address = ? AND date = ?`, [agentId, dest.address, today]);
          const dailyUsed = parseFloat((dailyRows?.[0] as any)?.total_transferred || '0');
          if (dailyUsed + amount > dailyLimit) {
            return jsonResult({
              status: 'daily_limit_exceeded',
              message: `Transfer would exceed daily limit. Used: $${dailyUsed.toFixed(2)}, Requesting: $${amount}, Limit: $${dailyLimit}`,
              daily_used: dailyUsed,
              daily_limit: dailyLimit,
              remaining: Math.max(0, dailyLimit - dailyUsed),
            });
          }

          // 5. Create a PENDING transfer request (always requires human approval)
          const requestId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString(); // 24h expiry

          await safeDbExec(db, `INSERT INTO poly_transfer_requests (id, agent_id, whitelist_id, to_address, to_label, amount, token, reason, status, requested_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'agent', ?)`,
            [requestId, agentId, dest.id, dest.address, p.to_label, amount, token, p.reason || '', expiresAt]);

          return jsonResult({
            status: 'pending_approval',
            request_id: requestId,
            to_label: p.to_label,
            to_address: dest.address,
            amount,
            token,
            reason: p.reason || '',
            expires_at: expiresAt,
            message: `Transfer request created and AWAITING HUMAN APPROVAL. Request ID: ${requestId}. An admin must approve this transfer before it executes. The request expires in 24 hours.`,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
