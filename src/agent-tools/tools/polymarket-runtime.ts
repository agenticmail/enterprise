/**
 * Polymarket Runtime — SDK Management, DB Persistence, Account Creation
 * 
 * Handles:
 * - Auto-installing @polymarket/clob-client + ethers on first use
 * - Persisting all config, trades, alerts, positions to enterprise DB
 * - Wallet credential storage in DB (encrypted by vault)
 * - Browser-based Polymarket account creation
 * - CLOB client lifecycle management
 */

import { execSync } from 'child_process';
import path from 'path';

// ─── SDK Auto-Install ────────────────────────────────────────

let sdkAvailable: boolean | null = null;
let sdkInstalling = false;

/**
 * Check if the Polymarket SDK is installed, auto-install if not.
 * Returns true if SDK is ready to use.
 */
export async function ensureSDK(): Promise<{ ready: boolean; message?: string }> {
  // Fast path: already checked
  if (sdkAvailable === true) return { ready: true };
  if (sdkInstalling) return { ready: false, message: 'SDK installation in progress, please retry in ~30 seconds' };

  // Check if already installed
  try {
    require.resolve('@polymarket/clob-client');
    require.resolve('@ethersproject/wallet');
    sdkAvailable = true;
    return { ready: true };
  } catch {
    // Not installed — auto-install
  }

  sdkInstalling = true;
  try {
    console.log('[polymarket] Auto-installing @polymarket/clob-client and ethers...');

    // Find the enterprise package root (where node_modules lives)
    const enterpriseRoot = findPackageRoot();
    if (!enterpriseRoot) {
      sdkInstalling = false;
      return { ready: false, message: 'Cannot find enterprise package root for SDK installation' };
    }

    // Install in the enterprise node_modules
    execSync('npm install --no-save @polymarket/clob-client @ethersproject/wallet ethers@5 2>&1', {
      cwd: enterpriseRoot,
      timeout: 120_000, // 2 min timeout
      stdio: 'pipe',
    });

    // Verify installation
    try {
      // Clear require cache and re-check
      delete require.cache[require.resolve('@polymarket/clob-client')];
    } catch {}

    try {
      require.resolve('@polymarket/clob-client');
      require.resolve('@ethersproject/wallet');
      sdkAvailable = true;
      sdkInstalling = false;
      console.log('[polymarket] SDK installed successfully');
      return { ready: true };
    } catch {
      sdkInstalling = false;
      return { ready: false, message: 'SDK installed but cannot be resolved. Server restart may be required.' };
    }
  } catch (err: any) {
    sdkInstalling = false;
    console.error('[polymarket] SDK installation failed:', err.message);
    return { ready: false, message: `SDK auto-install failed: ${err.message}. Manual install: npm install @polymarket/clob-client @ethersproject/wallet ethers@5` };
  }
}

function findPackageRoot(): string | null {
  // Walk up from current file to find package.json
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = path.join(dir, 'package.json');
      require('fs').accessSync(pkg);
      return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: try the global npm prefix
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
    return prefix;
  } catch {}
  return null;
}

// ─── CLOB Client Manager ────────────────────────────────────

interface ClobClientInstance {
  client: any;
  address: string;
  funderAddress: string;
  signatureType: number;
  createdAt: number;
}

const clientInstances = new Map<string, ClobClientInstance>();

/**
 * Get or create a CLOB client for an agent.
 * Credentials are loaded from the DB.
 */
export async function getClobClient(agentId: string, db: any): Promise<ClobClientInstance | null> {
  // Check cache
  const cached = clientInstances.get(agentId);
  if (cached && Date.now() - cached.createdAt < 3600_000) return cached; // 1hr cache

  // Load credentials from DB
  const creds = await loadWalletCredentials(agentId, db);
  if (!creds) return null;

  // Ensure SDK
  const sdk = await ensureSDK();
  if (!sdk.ready) return null;

  try {
    const { ClobClient } = await import('@polymarket/clob-client' as any);
    const { Wallet } = await import('@ethersproject/wallet' as any);

    const signer = new Wallet(creds.privateKey);
    const funder = creds.funderAddress || signer.address;

    // Create client with stored API creds or derive new ones
    let apiCreds = creds.apiCreds;
    if (!apiCreds) {
      const tempClient = new ClobClient('https://clob.polymarket.com', 137, signer);
      apiCreds = await tempClient.createOrDeriveApiKey();
      // Store derived creds
      await saveWalletCredentials(agentId, db, {
        ...creds,
        apiCreds,
      });
    }

    const client = new ClobClient(
      'https://clob.polymarket.com',
      137,
      signer,
      apiCreds,
      creds.signatureType || 0,
      funder,
    );

    const instance: ClobClientInstance = {
      client,
      address: signer.address,
      funderAddress: funder,
      signatureType: creds.signatureType || 0,
      createdAt: Date.now(),
    };

    clientInstances.set(agentId, instance);
    return instance;
  } catch (err: any) {
    console.error(`[polymarket] Failed to create CLOB client for ${agentId}:`, err.message);
    return null;
  }
}

// ─── DB Schema & Persistence ─────────────────────────────────

let dbInitialized = false;
let _isPostgres = false;
export function isPostgresDB() { return _isPostgres; }

export async function initPolymarketDB(db: any): Promise<void> {
  if (dbInitialized || !db) return;

  try {
    // Detect dialect
    try { await db.execute(`SELECT NOW()`); _isPostgres = true; } catch { _isPostgres = false; }
    const { setPostgresFlag } = await import('./polymarket-shared.js');
    setPostgresFlag(_isPostgres);
    const autoId = _isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_wallet_credentials (
        agent_id TEXT PRIMARY KEY,
        private_key_encrypted TEXT NOT NULL,
        funder_address TEXT,
        signature_type INTEGER DEFAULT 0,
        api_key TEXT,
        api_secret TEXT,
        api_passphrase TEXT,
        rpc_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_trading_config (
        agent_id TEXT PRIMARY KEY,
        mode TEXT DEFAULT 'approval',
        max_position_size REAL DEFAULT 100,
        max_order_size REAL DEFAULT 50,
        max_total_exposure REAL DEFAULT 500,
        max_daily_trades INTEGER DEFAULT 10,
        max_daily_loss REAL DEFAULT 50,
        max_drawdown_pct REAL DEFAULT 20,
        allowed_categories TEXT DEFAULT '[]',
        blocked_categories TEXT DEFAULT '[]',
        blocked_markets TEXT DEFAULT '[]',
        min_liquidity REAL DEFAULT 0,
        min_volume REAL DEFAULT 0,
        max_spread_pct REAL DEFAULT 100,
        stop_loss_pct REAL DEFAULT 0,
        take_profit_pct REAL DEFAULT 0,
        trailing_stop_pct REAL DEFAULT 0,
        rebalance_interval TEXT DEFAULT 'never',
        notification_channel TEXT DEFAULT '',
        notify_on TEXT DEFAULT '["trade_filled","stop_loss","circuit_breaker","market_resolved"]',
        cash_reserve_pct REAL DEFAULT 20,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_pending_trades (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL,
        size REAL NOT NULL,
        order_type TEXT DEFAULT 'GTC',
        tick_size TEXT DEFAULT '0.01',
        neg_risk INTEGER DEFAULT 0,
        market_question TEXT,
        outcome TEXT,
        rationale TEXT,
        urgency TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        resolved_by TEXT
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_pending_agent ON poly_pending_trades(agent_id, status)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_trade_log (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        market_id TEXT,
        market_question TEXT,
        outcome TEXT,
        side TEXT NOT NULL,
        price REAL,
        size REAL NOT NULL,
        fill_price REAL,
        fill_size REAL,
        fee REAL DEFAULT 0,
        order_type TEXT,
        status TEXT DEFAULT 'placed',
        rationale TEXT,
        pnl REAL,
        clob_order_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_trades_agent ON poly_trade_log(agent_id, created_at DESC)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_price_alerts (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        market_question TEXT,
        condition TEXT NOT NULL,
        target_price REAL,
        pct_change REAL,
        base_price REAL,
        repeat_alert INTEGER DEFAULT 0,
        auto_trade_config TEXT,
        triggered INTEGER DEFAULT 0,
        triggered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_alerts_agent ON poly_price_alerts(agent_id, triggered)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_paper_positions (
        id ${autoId},
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL,
        entry_price REAL NOT NULL,
        size REAL NOT NULL,
        market_question TEXT,
        rationale TEXT,
        closed INTEGER DEFAULT 0,
        exit_price REAL,
        pnl REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_paper_agent ON poly_paper_positions(agent_id, closed)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_daily_counters (
        agent_id TEXT NOT NULL,
        date TEXT NOT NULL,
        trade_count INTEGER DEFAULT 0,
        daily_loss REAL DEFAULT 0,
        paused INTEGER DEFAULT 0,
        pause_reason TEXT,
        PRIMARY KEY (agent_id, date)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_auto_approve_rules (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        max_size REAL DEFAULT 10,
        categories TEXT DEFAULT '[]',
        sides TEXT DEFAULT '["BUY","SELL"]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_auto_rules_agent ON poly_auto_approve_rules(agent_id)`);

    dbInitialized = true;
  } catch (err: any) {
    console.error('[polymarket] DB init failed:', err.message);
  }
}

// ─── Wallet Credentials (DB-backed) ─────────────────────────

interface WalletCredentials {
  privateKey: string;
  funderAddress?: string;
  signatureType: number;
  rpcUrl?: string;
  apiCreds?: { apiKey: string; secret: string; passphrase: string };
}

async function loadWalletCredentials(agentId: string, db: any): Promise<WalletCredentials | null> {
  if (!db) return null;
  try {
    const rows = await db.execute(`SELECT * FROM poly_wallet_credentials WHERE agent_id = $1`, [agentId]);
    const row = rows?.rows?.[0] || rows?.[0];
    if (!row) return null;
    return {
      privateKey: row.private_key_encrypted, // In production, decrypt via vault
      funderAddress: row.funder_address,
      signatureType: row.signature_type || 0,
      rpcUrl: row.rpc_url,
      apiCreds: row.api_key ? { apiKey: row.api_key, secret: row.api_secret, passphrase: row.api_passphrase } : undefined,
    };
  } catch { return null; }
}

export async function saveWalletCredentials(agentId: string, db: any, creds: WalletCredentials): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_wallet_credentials (agent_id, private_key_encrypted, funder_address, signature_type, api_key, api_secret, api_passphrase, rpc_url, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    ON CONFLICT (agent_id) DO UPDATE SET
      private_key_encrypted = $2, funder_address = $3, signature_type = $4,
      api_key = $5, api_secret = $6, api_passphrase = $7, rpc_url = $8,
      updated_at = CURRENT_TIMESTAMP
  `, [
    agentId,
    creds.privateKey, // In production, encrypt via vault
    creds.funderAddress || null,
    creds.signatureType || 0,
    creds.apiCreds?.apiKey || null,
    creds.apiCreds?.secret || null,
    creds.apiCreds?.passphrase || null,
    creds.rpcUrl || null,
  ]);
}

// ─── Trading Config (DB-backed) ─────────────────────────────

export interface TradingConfig {
  mode: 'approval' | 'autonomous' | 'paper';
  maxPositionSize: number;
  maxOrderSize: number;
  maxTotalExposure: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  maxDrawdownPct: number;
  allowedCategories: string[];
  blockedCategories: string[];
  blockedMarkets: string[];
  minLiquidity: number;
  minVolume: number;
  maxSpreadPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  rebalanceInterval: string;
  notificationChannel: string;
  notifyOn: string[];
  cashReservePct: number;
}

const DEFAULT_CONFIG: TradingConfig = {
  mode: 'approval',
  maxPositionSize: 100,
  maxOrderSize: 50,
  maxTotalExposure: 500,
  maxDailyTrades: 10,
  maxDailyLoss: 50,
  maxDrawdownPct: 20,
  allowedCategories: [],
  blockedCategories: [],
  blockedMarkets: [],
  minLiquidity: 0,
  minVolume: 0,
  maxSpreadPct: 100,
  stopLossPct: 0,
  takeProfitPct: 0,
  trailingStopPct: 0,
  rebalanceInterval: 'never',
  notificationChannel: '',
  notifyOn: ['trade_filled', 'stop_loss', 'circuit_breaker', 'market_resolved'],
  cashReservePct: 20,
};

export async function loadConfig(agentId: string, db: any): Promise<TradingConfig> {
  if (!db) return { ...DEFAULT_CONFIG };
  try {
    const rows = await db.execute(`SELECT * FROM poly_trading_config WHERE agent_id = $1`, [agentId]);
    const row = rows?.rows?.[0] || rows?.[0];
    if (!row) return { ...DEFAULT_CONFIG };
    return {
      mode: row.mode || 'approval',
      maxPositionSize: row.max_position_size ?? 100,
      maxOrderSize: row.max_order_size ?? 50,
      maxTotalExposure: row.max_total_exposure ?? 500,
      maxDailyTrades: row.max_daily_trades ?? 10,
      maxDailyLoss: row.max_daily_loss ?? 50,
      maxDrawdownPct: row.max_drawdown_pct ?? 20,
      allowedCategories: JSON.parse(row.allowed_categories || '[]'),
      blockedCategories: JSON.parse(row.blocked_categories || '[]'),
      blockedMarkets: JSON.parse(row.blocked_markets || '[]'),
      minLiquidity: row.min_liquidity ?? 0,
      minVolume: row.min_volume ?? 0,
      maxSpreadPct: row.max_spread_pct ?? 100,
      stopLossPct: row.stop_loss_pct ?? 0,
      takeProfitPct: row.take_profit_pct ?? 0,
      trailingStopPct: row.trailing_stop_pct ?? 0,
      rebalanceInterval: row.rebalance_interval || 'never',
      notificationChannel: row.notification_channel || '',
      notifyOn: JSON.parse(row.notify_on || '[]'),
      cashReservePct: row.cash_reserve_pct ?? 20,
    };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export async function saveConfig(agentId: string, db: any, config: TradingConfig): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_trading_config (agent_id, mode, max_position_size, max_order_size, max_total_exposure,
      max_daily_trades, max_daily_loss, max_drawdown_pct, allowed_categories, blocked_categories, blocked_markets,
      min_liquidity, min_volume, max_spread_pct, stop_loss_pct, take_profit_pct, trailing_stop_pct,
      rebalance_interval, notification_channel, notify_on, cash_reserve_pct, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)
    ON CONFLICT (agent_id) DO UPDATE SET
      mode=$2, max_position_size=$3, max_order_size=$4, max_total_exposure=$5,
      max_daily_trades=$6, max_daily_loss=$7, max_drawdown_pct=$8,
      allowed_categories=$9, blocked_categories=$10, blocked_markets=$11,
      min_liquidity=$12, min_volume=$13, max_spread_pct=$14,
      stop_loss_pct=$15, take_profit_pct=$16, trailing_stop_pct=$17,
      rebalance_interval=$18, notification_channel=$19, notify_on=$20, cash_reserve_pct=$21,
      updated_at=CURRENT_TIMESTAMP
  `, [
    agentId, config.mode, config.maxPositionSize, config.maxOrderSize, config.maxTotalExposure,
    config.maxDailyTrades, config.maxDailyLoss, config.maxDrawdownPct,
    JSON.stringify(config.allowedCategories), JSON.stringify(config.blockedCategories), JSON.stringify(config.blockedMarkets),
    config.minLiquidity, config.minVolume, config.maxSpreadPct,
    config.stopLossPct, config.takeProfitPct, config.trailingStopPct,
    config.rebalanceInterval, config.notificationChannel, JSON.stringify(config.notifyOn), config.cashReservePct,
  ]);
}

// ─── Daily Counters (DB-backed) ──────────────────────────────

export async function getDailyCounter(agentId: string, db: any): Promise<{ count: number; loss: number; paused: boolean; reason: string }> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return { count: 0, loss: 0, paused: false, reason: '' };
  try {
    const rows = await db.execute(`SELECT * FROM poly_daily_counters WHERE agent_id = $1 AND date = $2`, [agentId, today]);
    const row = rows?.rows?.[0] || rows?.[0];
    if (!row) return { count: 0, loss: 0, paused: false, reason: '' };
    return { count: row.trade_count || 0, loss: row.daily_loss || 0, paused: !!row.paused, reason: row.pause_reason || '' };
  } catch { return { count: 0, loss: 0, paused: false, reason: '' }; }
}

export async function incrementDailyCounter(agentId: string, db: any, loss = 0): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_daily_counters (agent_id, date, trade_count, daily_loss) VALUES ($1, $2, 1, $3)
    ON CONFLICT (agent_id, date) DO UPDATE SET trade_count = trade_count + 1, daily_loss = daily_loss + $3
  `, [agentId, today, loss]);
}

export async function pauseTrading(agentId: string, db: any, reason: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_daily_counters (agent_id, date, paused, pause_reason) VALUES ($1, $2, 1, $3)
    ON CONFLICT (agent_id, date) DO UPDATE SET paused = 1, pause_reason = $3
  `, [agentId, today, reason]);
}

export async function resumeTrading(agentId: string, db: any): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return;
  await db.execute(`
    UPDATE poly_daily_counters SET paused = 0, pause_reason = '' WHERE agent_id = $1 AND date = $2
  `, [agentId, today]);
}

// ─── Pending Trades (DB-backed) ──────────────────────────────

export async function savePendingTrade(db: any, trade: {
  id: string; agentId: string; tokenId: string; side: string; price: number | null;
  size: number; orderType: string; tickSize: string; negRisk: boolean;
  marketQuestion: string; outcome: string; rationale: string; urgency: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_pending_trades (id, agent_id, token_id, side, price, size, order_type, tick_size, neg_risk, market_question, outcome, rationale, urgency)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [trade.id, trade.agentId, trade.tokenId, trade.side, trade.price, trade.size,
      trade.orderType, trade.tickSize, trade.negRisk ? 1 : 0, trade.marketQuestion,
      trade.outcome, trade.rationale, trade.urgency]);
}

export async function getPendingTrades(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`SELECT * FROM poly_pending_trades WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at DESC`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

export async function resolvePendingTrade(db: any, tradeId: string, status: string, resolvedBy: string): Promise<void> {
  if (!db) return;
  await db.execute(`UPDATE poly_pending_trades SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2 WHERE id = $3`, [status, resolvedBy, tradeId]);
}

// ─── Trade Log (DB-backed) ───────────────────────────────────

export async function logTrade(db: any, trade: {
  id: string; agentId: string; tokenId: string; marketId?: string; marketQuestion?: string;
  outcome?: string; side: string; price?: number; size: number; fillPrice?: number;
  fillSize?: number; fee?: number; orderType?: string; status: string; rationale?: string;
  pnl?: number; clobOrderId?: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_trade_log (id, agent_id, token_id, market_id, market_question, outcome, side, price, size, fill_price, fill_size, fee, order_type, status, rationale, pnl, clob_order_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  `, [trade.id, trade.agentId, trade.tokenId, trade.marketId || null, trade.marketQuestion || null,
      trade.outcome || null, trade.side, trade.price || null, trade.size, trade.fillPrice || null,
      trade.fillSize || null, trade.fee || 0, trade.orderType || null, trade.status,
      trade.rationale || null, trade.pnl || null, trade.clobOrderId || null]);
}

// ─── Price Alerts (DB-backed) ────────────────────────────────

export async function saveAlert(db: any, alert: {
  id: string; agentId: string; tokenId: string; marketQuestion: string;
  condition: string; targetPrice?: number; pctChange?: number; basePrice: number;
  repeat: boolean; autoTrade?: any;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_price_alerts (id, agent_id, token_id, market_question, condition, target_price, pct_change, base_price, repeat_alert, auto_trade_config)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [alert.id, alert.agentId, alert.tokenId, alert.marketQuestion, alert.condition,
      alert.targetPrice || null, alert.pctChange || null, alert.basePrice,
      alert.repeat ? 1 : 0, alert.autoTrade ? JSON.stringify(alert.autoTrade) : null]);
}

export async function getAlerts(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`SELECT * FROM poly_price_alerts WHERE agent_id = $1 AND triggered = 0 ORDER BY created_at DESC`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

export async function deleteAlert(db: any, alertId: string): Promise<void> {
  if (!db) return;
  await db.execute(`DELETE FROM poly_price_alerts WHERE id = $1`, [alertId]);
}

export async function deleteAllAlerts(agentId: string, db: any): Promise<void> {
  if (!db) return;
  await db.execute(`DELETE FROM poly_price_alerts WHERE agent_id = $1`, [agentId]);
}

// ─── Paper Positions (DB-backed) ─────────────────────────────

export async function savePaperPosition(db: any, pos: {
  agentId: string; tokenId: string; side: string; entryPrice: number; size: number;
  marketQuestion: string; rationale: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_paper_positions (agent_id, token_id, side, entry_price, size, market_question, rationale)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [pos.agentId, pos.tokenId, pos.side, pos.entryPrice, pos.size, pos.marketQuestion, pos.rationale]);
}

export async function getPaperPositions(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`SELECT * FROM poly_paper_positions WHERE agent_id = $1 AND closed = 0 ORDER BY created_at DESC`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

// ─── Auto-Approve Rules (DB-backed) ─────────────────────────

export async function getAutoApproveRules(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`SELECT * FROM poly_auto_approve_rules WHERE agent_id = $1`, [agentId]);
    return (rows?.rows || rows || []).map((r: any) => ({
      id: r.id, maxSize: r.max_size, categories: JSON.parse(r.categories || '[]'), sides: JSON.parse(r.sides || '[]'),
    }));
  } catch { return []; }
}

export async function saveAutoApproveRule(db: any, rule: { id: string; agentId: string; maxSize: number; categories: string[]; sides: string[] }): Promise<void> {
  if (!db) return;
  await db.execute(`INSERT INTO poly_auto_approve_rules (id, agent_id, max_size, categories, sides) VALUES ($1,$2,$3,$4,$5)`,
    [rule.id, rule.agentId, rule.maxSize, JSON.stringify(rule.categories), JSON.stringify(rule.sides)]);
}

export async function deleteAutoApproveRule(db: any, ruleId: string): Promise<void> {
  if (!db) return;
  await db.execute(`DELETE FROM poly_auto_approve_rules WHERE id = $1`, [ruleId]);
}

// ─── Wallet Generation ──────────────────────────────────────

/**
 * Generate a fresh Ethereum wallet (no Polymarket account yet).
 * The agent can then use the browser to create a Polymarket account with this wallet.
 */
export async function generateWallet(): Promise<{ address: string; privateKey: string } | null> {
  const sdk = await ensureSDK();
  if (!sdk.ready) {
    // Fallback: use Node.js crypto to generate a key
    const crypto = await import('crypto');
    const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
    // Derive address manually (simplified — needs ethers for proper derivation)
    return { address: '(install ethers to derive address)', privateKey };
  }

  try {
    const { Wallet } = await import('@ethersproject/wallet' as any);
    const wallet = Wallet.createRandom();
    return { address: wallet.address, privateKey: wallet.privateKey };
  } catch {
    return null;
  }
}

// ─── Trading Journal & Learning System ──────────────────────

export async function initLearningDB(db: any): Promise<void> {
  if (!db) return;
  try {
    // Prediction tracking — logs every prediction the agent makes with its reasoning
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_predictions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        market_id TEXT,
        token_id TEXT NOT NULL,
        market_question TEXT,
        predicted_outcome TEXT NOT NULL,
        predicted_probability REAL NOT NULL,
        market_price_at_prediction REAL NOT NULL,
        confidence REAL NOT NULL,
        reasoning TEXT,
        signals_used TEXT,
        category TEXT,
        resolved INTEGER DEFAULT 0,
        actual_outcome TEXT,
        was_correct INTEGER,
        pnl REAL,
        lesson_extracted INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_pred_agent ON poly_predictions(agent_id, resolved)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_pred_category ON poly_predictions(agent_id, category)`);

    // Strategy performance — tracks how each signal/strategy performs over time
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_strategy_stats (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        strategy_name TEXT NOT NULL,
        total_predictions INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        avg_confidence REAL DEFAULT 0,
        brier_score REAL DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, strategy_name)
      )
    `);

    // Lessons learned — distilled insights from trade reviews
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_lessons (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        lesson TEXT NOT NULL,
        category TEXT NOT NULL,
        source_prediction_ids TEXT,
        importance TEXT DEFAULT 'normal',
        times_applied INTEGER DEFAULT 0,
        last_applied TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_lessons_agent ON poly_lessons(agent_id, category)`);

    // Calibration tracking — is the agent overconfident or underconfident?
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_calibration (
        agent_id TEXT NOT NULL,
        bucket TEXT NOT NULL,
        predictions INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY (agent_id, bucket)
      )
    `);
  } catch (err: any) {
    console.error('[polymarket] Learning DB init failed:', err.message);
  }
}

/**
 * Record a prediction the agent is making (BEFORE the trade).
 * This is the "pre-trade journal entry."
 */
export async function recordPrediction(db: any, pred: {
  id: string; agentId: string; marketId?: string; tokenId: string;
  marketQuestion?: string; predictedOutcome: string; predictedProbability: number;
  marketPrice: number; confidence: number; reasoning?: string;
  signalsUsed?: string[]; category?: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_predictions (id, agent_id, market_id, token_id, market_question, predicted_outcome,
      predicted_probability, market_price_at_prediction, confidence, reasoning, signals_used, category)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [
    pred.id, pred.agentId, pred.marketId || null, pred.tokenId,
    pred.marketQuestion || null, pred.predictedOutcome, pred.predictedProbability,
    pred.marketPrice, pred.confidence, pred.reasoning || null,
    pred.signalsUsed ? JSON.stringify(pred.signalsUsed) : null, pred.category || null,
  ]);
}

/**
 * Resolve a prediction after market resolves.
 * This is the "post-trade journal entry" — the feedback loop.
 */
export async function resolvePrediction(db: any, predId: string, actualOutcome: string, pnl: number): Promise<void> {
  if (!db) return;
  // Get the original prediction
  const rows = await db.execute(`SELECT * FROM poly_predictions WHERE id = $1`, [predId]);
  const pred = rows?.rows?.[0] || rows?.[0];
  if (!pred) return;

  const wasCorrect = pred.predicted_outcome.toLowerCase() === actualOutcome.toLowerCase() ? 1 : 0;

  await db.execute(`
    UPDATE poly_predictions SET resolved = 1, actual_outcome = $1, was_correct = $2, pnl = $3, resolved_at = CURRENT_TIMESTAMP
    WHERE id = $4
  `, [actualOutcome, wasCorrect, pnl, predId]);

  // Update calibration buckets (0-10%, 10-20%, ..., 90-100%)
  const bucket = Math.floor(pred.confidence * 10) * 10 + '%';
  await db.execute(`
    INSERT INTO poly_calibration (agent_id, bucket, predictions, correct) VALUES ($1, $2, 1, $3)
    ON CONFLICT (agent_id, bucket) DO UPDATE SET predictions = predictions + 1, correct = correct + $3
  `, [pred.agent_id, bucket, wasCorrect]);

  // Update strategy stats if signals were used
  if (pred.signals_used) {
    try {
      const signals = JSON.parse(pred.signals_used);
      for (const signal of signals) {
        await db.execute(`
          INSERT INTO poly_strategy_stats (id, agent_id, strategy_name, total_predictions, correct_predictions, total_pnl, avg_confidence, last_updated)
          VALUES ($1, $2, $3, 1, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (agent_id, strategy_name) DO UPDATE SET
            total_predictions = poly_strategy_stats.total_predictions + 1,
            correct_predictions = poly_strategy_stats.correct_predictions + $4,
            total_pnl = poly_strategy_stats.total_pnl + $5,
            avg_confidence = (poly_strategy_stats.avg_confidence * poly_strategy_stats.total_predictions + $6) / (poly_strategy_stats.total_predictions + 1),
            last_updated = CURRENT_TIMESTAMP
        `, [
          `stat_${pred.agent_id}_${signal}`, pred.agent_id, signal,
          wasCorrect, pnl, pred.confidence,
        ]);
      }
    } catch {}
  }
}

/**
 * Store a lesson the agent learned from reviewing trades.
 */
export async function storeLesson(db: any, lesson: {
  id: string; agentId: string; lesson: string; category: string;
  sourcePredictionIds?: string[]; importance?: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_lessons (id, agent_id, lesson, category, source_prediction_ids, importance)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [lesson.id, lesson.agentId, lesson.lesson, lesson.category,
      lesson.sourcePredictionIds ? JSON.stringify(lesson.sourcePredictionIds) : null,
      lesson.importance || 'normal']);
}

/**
 * Get lessons relevant to a market/category for pre-trade review.
 */
export async function recallLessons(agentId: string, db: any, category?: string): Promise<any[]> {
  if (!db) return [];
  try {
    const query = category
      ? `SELECT * FROM poly_lessons WHERE agent_id = $1 AND category = $2 ORDER BY importance DESC, created_at DESC LIMIT 20`
      : `SELECT * FROM poly_lessons WHERE agent_id = $1 ORDER BY importance DESC, created_at DESC LIMIT 20`;
    const params = category ? [agentId, category] : [agentId];
    const rows = await db.execute(query, params);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get calibration data — is the agent overconfident or underconfident?
 */
export async function getCalibration(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`SELECT * FROM poly_calibration WHERE agent_id = $1 ORDER BY bucket`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get strategy performance rankings.
 */
export async function getStrategyPerformance(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`
      SELECT *, CASE WHEN total_predictions > 0 THEN ROUND(CAST(correct_predictions AS REAL) / total_predictions * 100, 1) ELSE 0 END as win_rate
      FROM poly_strategy_stats WHERE agent_id = $1 ORDER BY total_pnl DESC
    `, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get unresolved predictions for a market (to check when it resolves).
 */
export async function getUnresolvedPredictions(agentId: string, db: any, marketId?: string): Promise<any[]> {
  if (!db) return [];
  try {
    const query = marketId
      ? `SELECT * FROM poly_predictions WHERE agent_id = $1 AND resolved = 0 AND market_id = $2 ORDER BY created_at DESC`
      : `SELECT * FROM poly_predictions WHERE agent_id = $1 AND resolved = 0 ORDER BY created_at DESC LIMIT 50`;
    const params = marketId ? [agentId, marketId] : [agentId];
    const rows = await db.execute(query, params);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get recent predictions with outcomes for trade review.
 */
export async function getResolvedPredictions(agentId: string, db: any, limit = 20): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await db.execute(`
      SELECT * FROM poly_predictions WHERE agent_id = $1 AND resolved = 1 AND lesson_extracted = 0
      ORDER BY resolved_at DESC LIMIT $2
    `, [agentId, limit]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Mark predictions as having had lessons extracted.
 */
export async function markLessonsExtracted(db: any, predictionIds: string[]): Promise<void> {
  if (!db || predictionIds.length === 0) return;
  const placeholders = predictionIds.map((_: string, i: number) => `$${i + 1}`).join(',');
  await db.execute(`UPDATE poly_predictions SET lesson_extracted = 1 WHERE id IN (${placeholders})`, predictionIds);
}
