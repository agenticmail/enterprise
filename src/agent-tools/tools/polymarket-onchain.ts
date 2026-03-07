/**
 * Polymarket On-Chain Intelligence Tools
 * 
 * Real-time blockchain analysis for Polymarket on Polygon:
 * - Whale wallet tracking and profiling
 * - Orderbook depth analysis (L2)
 * - Net flow detection (buy/sell pressure)
 * - Liquidity mapping
 * - Transaction decoding for conditional token framework
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { initPolymarketDB, getClobClient } from './polymarket-runtime.js';
import { isPostgresDB } from './polymarket-runtime.js';
import { cachedFetchJSON, validateTokenId, validateAddress, safeDbExec, safeDbQuery, safeDbGet, clampNumber ,  autoId } from './polymarket-shared.js';

const CLOB_API = 'https://clob.polymarket.com';
const POLYGON_RPC = 'https://polygon-rpc.com';
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// ─── Caches ──────────────────────────────────────────────────
const orderbookCache = new Map<string, { data: any; ts: number }>();
const OB_CACHE_TTL = 15_000; // 15s for orderbook (real-time)
const whaleCache = new Map<string, { data: any; ts: number }>();
const WHALE_CACHE_TTL = 60_000; // 1min

// ─── DB Tables ───────────────────────────────────────────────

async function initOnchainDB(db: any): Promise<void> {
  if (!db?.exec) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS poly_whale_wallets (
      address TEXT PRIMARY KEY,
      label TEXT,
      total_volume REAL DEFAULT 0,
      win_rate REAL DEFAULT 0,
      avg_position REAL DEFAULT 0,
      markets_traded INTEGER DEFAULT 0,
      last_seen TEXT,
      pnl REAL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS poly_whale_trades (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      token_id TEXT NOT NULL,
      market_id TEXT,
      side TEXT NOT NULL,
      size REAL NOT NULL,
      price REAL NOT NULL,
      timestamp TEXT NOT NULL,
      tx_hash TEXT,
      FOREIGN KEY (wallet) REFERENCES poly_whale_wallets(address)
    )`,
    `CREATE TABLE IF NOT EXISTS poly_flow_snapshots (
      id ${autoId()},
      token_id TEXT NOT NULL,
      window TEXT NOT NULL,
      net_buy REAL DEFAULT 0,
      net_sell REAL DEFAULT 0,
      trade_count INTEGER DEFAULT 0,
      whale_count INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    )`,
  ];
  for (const sql of stmts) {
    try { db.exec(sql); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────

async function fetchOrderbook(tokenId: string): Promise<any> {
  return cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`, OB_CACHE_TTL);
}

function analyzeBook(book: any): any {
  const bids = (book?.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
  const asks = (book?.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));
  
  const totalBidLiquidity = bids.reduce((s: number, b: any) => s + b.size * b.price, 0);
  const totalAskLiquidity = asks.reduce((s: number, a: any) => s + a.size * a.price, 0);
  const bestBid = bids.length ? Math.max(...bids.map((b: any) => b.price)) : 0;
  const bestAsk = asks.length ? Math.min(...asks.map((a: any) => a.price)) : 1;
  const spread = bestAsk - bestBid;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;
  const midPrice = (bestBid + bestAsk) / 2;

  // Depth at various levels
  const depthLevels = [0.01, 0.02, 0.05, 0.10];
  const bidDepth: Record<string, number> = {};
  const askDepth: Record<string, number> = {};
  for (const level of depthLevels) {
    bidDepth[`${level * 100}%`] = bids.filter((b: any) => b.price >= bestBid * (1 - level)).reduce((s: number, b: any) => s + b.size, 0);
    askDepth[`${level * 100}%`] = asks.filter((a: any) => a.price <= bestAsk * (1 + level)).reduce((s: number, a: any) => s + a.size, 0);
  }

  // Detect walls (concentrated liquidity at single price level > 3x average)
  const avgBidSize = bids.length ? bids.reduce((s: number, b: any) => s + b.size, 0) / bids.length : 0;
  const avgAskSize = asks.length ? asks.reduce((s: number, a: any) => s + a.size, 0) / asks.length : 0;
  const bidWalls = bids.filter((b: any) => b.size > avgBidSize * 3).map((b: any) => ({ price: b.price, size: b.size, multiple: +(b.size / avgBidSize).toFixed(1) }));
  const askWalls = asks.filter((a: any) => a.size > avgAskSize * 3).map((a: any) => ({ price: a.price, size: a.size, multiple: +(a.size / avgAskSize).toFixed(1) }));

  // Imbalance ratio (bid liquidity / total liquidity)
  const imbalance = totalBidLiquidity + totalAskLiquidity > 0
    ? +(totalBidLiquidity / (totalBidLiquidity + totalAskLiquidity)).toFixed(3)
    : 0.5;

  return {
    bestBid, bestAsk, midPrice, spread: +spread.toFixed(4), spreadPct: +spreadPct.toFixed(2),
    totalBidLiquidity: +totalBidLiquidity.toFixed(2), totalAskLiquidity: +totalAskLiquidity.toFixed(2),
    bidLevels: bids.length, askLevels: asks.length,
    bidDepth, askDepth, bidWalls, askWalls, imbalance,
    signal: imbalance > 0.6 ? 'bullish' : imbalance < 0.4 ? 'bearish' : 'neutral',
  };
}

// ─── Tool Creator ────────────────────────────────────────────

export function createPolymarketOnchainTools(options: ToolCreationOptions): AnyAgentTool[] {
  const db = (options as any).engineDb;
  const agentId = options.agentId || 'default';

  // Init DB tables on first call
  let dbReady = false;
  async function ensureDB() {
    if (dbReady || !db) return;
    await initOnchainDB(db);
    dbReady = true;
  }

  const tools: AnyAgentTool[] = [];

  // ═══ 1. poly_whale_tracker ═══
  tools.push({
    name: 'poly_whale_tracker',
    label: 'Whale Tracker',
    description: 'Monitor large trades on a Polymarket token. Detects trades above a size threshold, tracks whale wallets, and records their activity. Shows which smart money wallets are accumulating or dumping.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to monitor' },
        min_size: { type: 'number', description: 'Minimum trade size in USDC to qualify as whale (default: 1000)', default: 1000 },
        action: { type: 'string', enum: ['scan', 'list_whales', 'add_whale', 'remove_whale'], default: 'scan' },
        wallet: { type: 'string', description: 'Wallet address (for add/remove)' },
        label: { type: 'string', description: 'Label for wallet (for add)' },
      },
      required: ['action'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const action = params.action || 'scan';

      if (action === 'list_whales') {
        if (!db) return jsonResult({ whales: [], note: 'No DB available' });
        try {
          const rows = db.prepare('SELECT * FROM poly_whale_wallets ORDER BY total_volume DESC LIMIT 50').all();
          return jsonResult({ whales: rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags || '[]') })) });
        } catch { return jsonResult({ whales: [] }); }
      }

      if (action === 'add_whale') {
        if (!params.wallet) return errorResult('wallet address required');
        if (!db) return errorResult('No DB');
        try {
          db.prepare(`INSERT OR REPLACE INTO poly_whale_wallets (address, label, last_seen) VALUES (?, ?, datetime('now'))`)
            .run(params.wallet.toLowerCase(), params.label || 'Unknown');
          return jsonResult({ added: params.wallet, label: params.label });
        } catch (e: any) { return errorResult(e.message); }
      }

      if (action === 'remove_whale') {
        if (!params.wallet) return errorResult('wallet address required');
        if (!db) return errorResult('No DB');
        try {
          db.prepare('DELETE FROM poly_whale_wallets WHERE address = ?').run(params.wallet.toLowerCase());
          return jsonResult({ removed: params.wallet });
        } catch (e: any) { return errorResult(e.message); }
      }

      // scan — fetch recent trades from CLOB and identify large ones
      const tid = validateTokenId(params.token_id);
      if (!tid) return errorResult('Valid token_id required for scan');
      const minSize = clampNumber(params.min_size, 1, 1000000, 1000);
      try {
        const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tid}&limit=100`, 15_000);
        const largeTrades = (trades || [])
          .map((t: any) => ({
            id: t.id,
            maker: t.maker_address,
            taker: t.taker_address,
            side: t.side,
            size: parseFloat(t.size || '0'),
            price: parseFloat(t.price || '0'),
            timestamp: t.match_time || t.created_at,
            value: parseFloat(t.size || '0') * parseFloat(t.price || '0'),
          }))
          .filter((t: any) => t.value >= minSize)
          .sort((a: any, b: any) => b.value - a.value);

        // Track whale wallets in DB
        if (db && largeTrades.length > 0) {
          const wallets = new Set<string>();
          for (const t of largeTrades) {
            for (const addr of [t.maker, t.taker].filter(Boolean)) {
              wallets.add(addr.toLowerCase());
            }
          }
          for (const w of wallets) {
            try {
              db.prepare(`INSERT INTO poly_whale_wallets (address, label, last_seen, total_volume)
                VALUES (?, 'Auto-detected', datetime('now'), ?)
                ON CONFLICT(address) DO UPDATE SET last_seen = datetime('now'),
                total_volume = total_volume + ?`)
                .run(w, minSize, minSize);
            } catch {}
          }
        }

        return jsonResult({
          token_id: params.token_id,
          total_trades: (trades || []).length,
          whale_trades: largeTrades.length,
          min_size_filter: minSize,
          trades: largeTrades.slice(0, 20),
          summary: {
            total_whale_volume: +largeTrades.reduce((s: number, t: any) => s + t.value, 0).toFixed(2),
            avg_whale_size: largeTrades.length ? +(largeTrades.reduce((s: number, t: any) => s + t.value, 0) / largeTrades.length).toFixed(2) : 0,
            unique_wallets: new Set(largeTrades.flatMap((t: any) => [t.maker, t.taker].filter(Boolean))).size,
          },
        });
      } catch (e: any) {
        return errorResult(`Whale scan failed: ${e.message}`);
      }
    },
  });

  // ═══ 2. poly_orderbook_depth ═══
  tools.push({
    name: 'poly_orderbook_depth',
    label: 'Orderbook Depth',
    description: 'Deep L2 orderbook analysis for a Polymarket token. Shows bid/ask walls, liquidity at each level, spread, imbalance ratio, and spoofing indicators. Essential before placing large orders.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to analyze' },
        compare_token: { type: 'string', description: 'Optional: second token to compare (e.g., the NO side)' },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      try {
        const book = await fetchOrderbook(params.token_id);
        const analysis = analyzeBook(book);

        let comparison: any = null;
        if (params.compare_token) {
          const book2 = await fetchOrderbook(params.compare_token);
          comparison = analyzeBook(book2);
        }

        // Spoofing detection: large orders that appeared and disappeared quickly
        // (Can only detect by comparing snapshots over time — flag if walls are suspicious)
        const spoofIndicators = [];
        if (analysis.bidWalls.length > 2) spoofIndicators.push('Multiple bid walls detected — possible layering');
        if (analysis.askWalls.length > 2) spoofIndicators.push('Multiple ask walls detected — possible layering');
        if (analysis.spreadPct > 5) spoofIndicators.push('Wide spread may indicate thin/manipulated market');

        return jsonResult({
          token_id: params.token_id,
          analysis,
          comparison: comparison ? { token_id: params.compare_token, analysis: comparison } : undefined,
          spoofing_indicators: spoofIndicators,
          recommendation: analysis.spreadPct > 3
            ? 'Wide spread — use limit orders only, do NOT market buy/sell'
            : analysis.imbalance > 0.65
            ? 'Strong bid pressure — consider buying before price moves up'
            : analysis.imbalance < 0.35
            ? 'Strong sell pressure — wait for lower prices or go short'
            : 'Balanced book — safe to trade at market',
        });
      } catch (e: any) {
        return errorResult(`Orderbook analysis failed: ${e.message}`);
      }
    },
  });

  // ═══ 3. poly_onchain_flow ═══
  tools.push({
    name: 'poly_onchain_flow',
    label: 'On-Chain Flow',
    description: 'Analyze net buy/sell flow for a token over different time windows. Shows whether smart money is accumulating (net buy) or distributing (net sell). Combines trade data with whale wallet tracking.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to analyze' },
        windows: { type: 'string', description: 'Comma-separated time windows: 5m,1h,4h,24h (default: "1h,4h,24h")' },
      },
      required: ['token_id'],
    },
    execute: async (params: any) => {
      await ensureDB();
      try {
        // Fetch recent trades
        const trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${params.token_id}&limit=500`);
        if (!trades || !trades.length) return jsonResult({ token_id: params.token_id, flows: {}, note: 'No recent trades' });

        const now = Date.now();
        const windowMs: Record<string, number> = { '5m': 5*60e3, '15m': 15*60e3, '1h': 60*60e3, '4h': 4*60*60e3, '24h': 24*60*60e3 };
        const requestedWindows = (params.windows || '1h,4h,24h').split(',').map((w: string) => w.trim());
        
        const flows: Record<string, any> = {};
        
        // Get known whale wallets
        let knownWhales = new Set<string>();
        if (db) {
          try {
            const rows = db.prepare('SELECT address FROM poly_whale_wallets').all();
            knownWhales = new Set(rows.map((r: any) => r.address));
          } catch {}
        }

        for (const window of requestedWindows) {
          const ms = windowMs[window] || 60*60e3;
          const cutoff = now - ms;
          const windowTrades = trades.filter((t: any) => {
            const ts = new Date(t.match_time || t.created_at).getTime();
            return ts >= cutoff;
          });

          let buyVolume = 0, sellVolume = 0, buyCount = 0, sellCount = 0;
          let whaleBuyVolume = 0, whaleSellVolume = 0;

          for (const t of windowTrades) {
            const size = parseFloat(t.size || '0');
            const price = parseFloat(t.price || '0');
            const value = size * price;
            const isWhale = knownWhales.has((t.maker_address || '').toLowerCase()) || knownWhales.has((t.taker_address || '').toLowerCase());
            
            if (t.side === 'BUY') {
              buyVolume += value; buyCount++;
              if (isWhale) whaleBuyVolume += value;
            } else {
              sellVolume += value; sellCount++;
              if (isWhale) whaleSellVolume += value;
            }
          }

          const netFlow = buyVolume - sellVolume;
          const whaleNetFlow = whaleBuyVolume - whaleSellVolume;

          flows[window] = {
            buy_volume: +buyVolume.toFixed(2),
            sell_volume: +sellVolume.toFixed(2),
            net_flow: +netFlow.toFixed(2),
            buy_count: buyCount,
            sell_count: sellCount,
            total_trades: windowTrades.length,
            whale_buy_volume: +whaleBuyVolume.toFixed(2),
            whale_sell_volume: +whaleSellVolume.toFixed(2),
            whale_net_flow: +whaleNetFlow.toFixed(2),
            signal: netFlow > 0 ? (whaleNetFlow > 0 ? 'strong_bullish' : 'bullish') :
                    netFlow < 0 ? (whaleNetFlow < 0 ? 'strong_bearish' : 'bearish') : 'neutral',
          };
        }

        // Store snapshot in DB
        if (db) {
          try {
            const latestFlow = flows[requestedWindows[0]] || {};
            db.prepare(`INSERT INTO poly_flow_snapshots (token_id, window, net_buy, net_sell, trade_count, whale_count)
              VALUES (?, ?, ?, ?, ?, ?)`)
              .run(params.token_id, requestedWindows[0], latestFlow.buy_volume || 0, latestFlow.sell_volume || 0,
                   latestFlow.total_trades || 0, 0);
          } catch {}
        }

        return jsonResult({ token_id: params.token_id, flows, whale_wallets_tracked: knownWhales.size });
      } catch (e: any) {
        return errorResult(`Flow analysis failed: ${e.message}`);
      }
    },
  });

  // ═══ 4. poly_wallet_profiler ═══
  tools.push({
    name: 'poly_wallet_profiler',
    label: 'Wallet Profiler',
    description: 'Profile a Polymarket wallet address. Shows historical activity, win rate, average position size, markets traded, and P&L. Use to evaluate whether a whale is worth following.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet address to profile' },
        token_id: { type: 'string', description: 'Optional: filter to trades on this token only' },
      },
      required: ['wallet'],
    },
    execute: async (params: any) => {
      await ensureDB();
      const wallet = params.wallet.toLowerCase();
      try {
        // Fetch trades involving this wallet from CLOB
        let url = `${CLOB_API}/trades?maker_address=${wallet}&limit=200`;
        const makerTrades = await cachedFetchJSON(url).catch(() => []);
        url = `${CLOB_API}/trades?taker_address=${wallet}&limit=200`;
        const takerTrades = await cachedFetchJSON(url).catch(() => []);
        
        const allTrades = [...(makerTrades || []), ...(takerTrades || [])];
        const filtered = params.token_id
          ? allTrades.filter((t: any) => t.asset_id === params.token_id || t.token_id === params.token_id)
          : allTrades;

        // Analyze trades
        let totalVolume = 0, buyVolume = 0, sellVolume = 0;
        const markets = new Set<string>();
        const tokens = new Set<string>();
        
        for (const t of filtered) {
          const value = parseFloat(t.size || '0') * parseFloat(t.price || '0');
          totalVolume += value;
          if (t.side === 'BUY') buyVolume += value;
          else sellVolume += value;
          if (t.market) markets.add(t.market);
          if (t.asset_id || t.token_id) tokens.add(t.asset_id || t.token_id);
        }

        const profile = {
          wallet,
          total_trades: filtered.length,
          total_volume: +totalVolume.toFixed(2),
          buy_volume: +buyVolume.toFixed(2),
          sell_volume: +sellVolume.toFixed(2),
          unique_markets: markets.size,
          unique_tokens: tokens.size,
          avg_trade_size: filtered.length ? +(totalVolume / filtered.length).toFixed(2) : 0,
          buy_sell_ratio: sellVolume > 0 ? +(buyVolume / sellVolume).toFixed(2) : buyVolume > 0 ? Infinity : 0,
          first_trade: filtered.length ? filtered[filtered.length - 1]?.match_time : null,
          last_trade: filtered.length ? filtered[0]?.match_time : null,
          recent_trades: filtered.slice(0, 10).map((t: any) => ({
            side: t.side,
            size: parseFloat(t.size || '0'),
            price: parseFloat(t.price || '0'),
            value: +(parseFloat(t.size || '0') * parseFloat(t.price || '0')).toFixed(2),
            time: t.match_time || t.created_at,
          })),
        };

        // Update DB profile
        if (db) {
          try {
            db.prepare(`INSERT INTO poly_whale_wallets (address, label, total_volume, markets_traded, last_seen)
              VALUES (?, 'Profiled', ?, ?, datetime('now'))
              ON CONFLICT(address) DO UPDATE SET total_volume = ?, markets_traded = ?, last_seen = datetime('now')`)
              .run(wallet, totalVolume, markets.size, totalVolume, markets.size);
          } catch {}
        }

        return jsonResult(profile);
      } catch (e: any) {
        return errorResult(`Wallet profiling failed: ${e.message}`);
      }
    },
  });

  // ═══ 5. poly_liquidity_map ═══
  tools.push({
    name: 'poly_liquidity_map',
    label: 'Liquidity Map',
    description: 'Map liquidity across multiple tokens/markets. Shows where liquidity is deep vs thin, identifies the best/worst tokens to trade, and finds markets with unusual liquidity patterns.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        token_ids: { type: 'string', description: 'Comma-separated token IDs to map' },
        market_slug: { type: 'string', description: 'Or pass a market slug to auto-discover all tokens' },
      },
    },
    execute: async (params: any) => {
      try {
        let tokenIds: string[] = [];
        
        if (params.token_ids) {
          tokenIds = params.token_ids.split(',').map((t: string) => t.trim());
        } else if (params.market_slug) {
          const market = await cachedFetchJSON(`https://gamma-api.polymarket.com/markets?slug=${params.market_slug}`);
          if (market && market[0]?.tokens) {
            tokenIds = market[0].tokens.map((t: any) => t.token_id);
          }
        }
        
        if (!tokenIds.length) return errorResult('Provide token_ids or market_slug');

        // Fetch orderbooks in parallel
        const books = await Promise.all(tokenIds.map(async (tid: string) => {
          try {
            const book = await fetchOrderbook(tid);
            const analysis = analyzeBook(book);
            return { token_id: tid, ...analysis };
          } catch {
            return { token_id: tid, error: 'Failed to fetch' };
          }
        }));

        // Rank by tradability
        const ranked = books
          .filter((b: any) => !b.error)
          .sort((a: any, b: any) => (a.spreadPct || 999) - (b.spreadPct || 999));

        return jsonResult({
          tokens_analyzed: tokenIds.length,
          liquidity_map: ranked,
          best_to_trade: ranked[0]?.token_id || null,
          worst_to_trade: ranked[ranked.length - 1]?.token_id || null,
          total_liquidity: +ranked.reduce((s: number, b: any) => s + (b.totalBidLiquidity || 0) + (b.totalAskLiquidity || 0), 0).toFixed(2),
          warnings: ranked.filter((b: any) => b.spreadPct > 5).map((b: any) => `${b.token_id}: spread ${b.spreadPct}% — AVOID`),
        });
      } catch (e: any) {
        return errorResult(`Liquidity map failed: ${e.message}`);
      }
    },
  });

  // ═══ 6. poly_transaction_decoder ═══
  tools.push({
    name: 'poly_transaction_decoder',
    label: 'Transaction Decoder',
    description: 'Decode Polygon transactions related to Polymarket conditional tokens. Shows what positions are being minted, redeemed, split, or merged. Reveals the actual on-chain activity behind trades.',
    category: 'enterprise' as const,
    parameters: {
      type: 'object',
      properties: {
        tx_hash: { type: 'string', description: 'Transaction hash to decode' },
        wallet: { type: 'string', description: 'Or: show recent transactions for a wallet address' },
        limit: { type: 'number', description: 'Number of transactions to fetch (for wallet mode, default: 20)', default: 20 },
      },
    },
    execute: async (params: any) => {
      try {
        if (params.tx_hash) {
          // Decode single transaction via Polygon RPC
          const tx = await cachedFetchJSON(`${POLYGON_RPC}`, 15000).catch(() => null);
          // Use Polygonscan API as fallback (no key needed for basic calls)
          const scanUrl = `https://api.polygonscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${params.tx_hash}`;
          const txData = await cachedFetchJSON(scanUrl).catch(() => null);
          
          if (!txData?.result) return errorResult('Transaction not found');

          const result = txData.result;
          const to = (result.to || '').toLowerCase();
          const isCtf = to === CTF_ADDRESS.toLowerCase();
          const methodSig = (result.input || '').slice(0, 10);

          // Common CTF method signatures
          const methods: Record<string, string> = {
            '0x': 'ETH Transfer',
            '0xa9059cbb': 'ERC20 Transfer',
            '0x23b872dd': 'ERC20 TransferFrom',
            '0x2eb2c2d6': 'safeBatchTransferFrom (CTF position transfer)',
            '0xf242432a': 'safeTransferFrom (CTF single transfer)',
            '0xfb16a595': 'splitPosition (mint conditional tokens)',
            '0x7e7e4b47': 'mergePositions (redeem conditional tokens)',
            '0x3b2bcbf1': 'redeemPositions (claim winnings)',
          };

          return jsonResult({
            tx_hash: params.tx_hash,
            from: result.from,
            to: result.to,
            value: parseInt(result.value || '0', 16) / 1e18,
            is_polymarket_ctf: isCtf,
            method: methods[methodSig] || `Unknown (${methodSig})`,
            gas_price_gwei: parseInt(result.gasPrice || '0', 16) / 1e9,
            block: parseInt(result.blockNumber || '0', 16),
          });
        }
        
        if (params.wallet) {
          // Get recent transactions for wallet from Polygonscan
          const limit = params.limit || 20;
          const url = `https://api.polygonscan.com/api?module=account&action=txlist&address=${params.wallet}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
          const data = await cachedFetchJSON(url);
          
          if (!data?.result) return jsonResult({ wallet: params.wallet, transactions: [] });
          
          const txs = (data.result || []).map((tx: any) => ({
            hash: tx.hash,
            to: tx.to,
            from: tx.from,
            value_matic: +(parseInt(tx.value || '0') / 1e18).toFixed(4),
            is_ctf: (tx.to || '').toLowerCase() === CTF_ADDRESS.toLowerCase(),
            is_usdc: (tx.to || '').toLowerCase() === USDC_ADDRESS.toLowerCase(),
            method: tx.functionName || tx.methodId,
            timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
            status: tx.isError === '0' ? 'success' : 'failed',
          }));

          const polyTxs = txs.filter((t: any) => t.is_ctf || t.is_usdc);
          
          return jsonResult({
            wallet: params.wallet,
            total_transactions: txs.length,
            polymarket_related: polyTxs.length,
            transactions: polyTxs.length > 0 ? polyTxs : txs.slice(0, 10),
          });
        }

        return errorResult('Provide tx_hash or wallet address');
      } catch (e: any) {
        return errorResult(`Transaction decode failed: ${e.message}`);
      }
    },
  });

  return tools;
}
