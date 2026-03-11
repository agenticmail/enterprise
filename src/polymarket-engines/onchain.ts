/**
 * Polymarket On-Chain Intelligence Engine
 * 
 * Real-time blockchain analysis for Polymarket on Polygon:
 * - Whale wallet tracking and profiling
 * - Orderbook depth analysis (L2) with wall detection
 * - Net flow detection (buy/sell pressure)
 * - Liquidity mapping across tokens
 * - Transaction decoding for conditional token framework
 */

import {
  CLOB_API, GAMMA_API, CTF_ADDRESS, USDC_ADDRESS,
  OrderbookSnapshot,
  cachedFetchJSON,
} from './shared.js';

// ═══════════════════════════════════════════════════════════════════
//  ORDERBOOK DEPTH ANALYSIS
// ═══════════════════════════════════════════════════════════════════

export interface DetailedOrderbook extends OrderbookSnapshot {
  bidDepthByLevel: Record<string, number>;
  askDepthByLevel: Record<string, number>;
  spoofIndicators: string[];
  recommendation: string;
}

export async function analyzeOrderbookDepth(tokenId: string): Promise<DetailedOrderbook> {
  let book: any = null;
  try {
    book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tokenId}`, 15_000);
  } catch {
    // CLOB rate limited — construct minimal data from Gamma API
    try {
      const gammaData = await cachedFetchJSON(`${GAMMA_API}/markets?clob_token_ids=${tokenId}&limit=1`);
      if (gammaData?.[0]?.outcomePrices) {
        const prices = JSON.parse(gammaData[0].outcomePrices);
        const yesPrice = parseFloat(prices[0]) || 0.5;
        return {
          bestBid: +(yesPrice - 0.01).toFixed(4), bestAsk: +(yesPrice + 0.01).toFixed(4),
          spread: 0.02, spreadPct: +((0.02 / yesPrice) * 100).toFixed(2), midpoint: yesPrice,
          bidDepth: 0, askDepth: 0, imbalance: 0, topBidSize: 0, topAskSize: 0, levels: 0,
          totalBidLiquidity: 0, totalAskLiquidity: 0,
          bidWalls: [], askWalls: [], bidDepthByLevel: {}, askDepthByLevel: {},
          spoofIndicators: [], recommendation: 'CLOB rate limited — orderbook data estimated from Gamma. Re-check with poly_orderbook_depth before trading.',
        };
      }
    } catch {}
    throw new Error('CLOB rate limited and no Gamma fallback available');
  }
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
  const bidDepthByLevel: Record<string, number> = {};
  const askDepthByLevel: Record<string, number> = {};
  for (const level of depthLevels) {
    bidDepthByLevel[`${level * 100}%`] = bids.filter((b: any) => b.price >= bestBid * (1 - level)).reduce((s: number, b: any) => s + b.size, 0);
    askDepthByLevel[`${level * 100}%`] = asks.filter((a: any) => a.price <= bestAsk * (1 + level)).reduce((s: number, a: any) => s + a.size, 0);
  }

  // Wall detection
  const avgBidSize = bids.length ? bids.reduce((s: number, b: any) => s + b.size, 0) / bids.length : 0;
  const avgAskSize = asks.length ? asks.reduce((s: number, a: any) => s + a.size, 0) / asks.length : 0;
  const bidWalls = bids.filter((b: any) => b.size > avgBidSize * 3).map((b: any) => ({ price: b.price, size: b.size, multiple: +(b.size / avgBidSize).toFixed(1) }));
  const askWalls = asks.filter((a: any) => a.size > avgAskSize * 3).map((a: any) => ({ price: a.price, size: a.size, multiple: +(a.size / avgAskSize).toFixed(1) }));

  const totalDepth = totalBidLiquidity + totalAskLiquidity;
  const imbalance = totalDepth > 0 ? +((totalBidLiquidity - totalAskLiquidity) / totalDepth).toFixed(3) : 0;

  // Spoofing indicators
  const spoofIndicators: string[] = [];
  if (bidWalls.length > 2) spoofIndicators.push('Multiple bid walls detected — possible layering');
  if (askWalls.length > 2) spoofIndicators.push('Multiple ask walls detected — possible layering');
  if (spreadPct > 5) spoofIndicators.push('Wide spread may indicate thin/manipulated market');

  const recommendation = spreadPct > 3
    ? 'Wide spread — use limit orders only, do NOT market buy/sell'
    : imbalance > 0.65
    ? 'Strong bid pressure — consider buying before price moves up'
    : imbalance < 0.35 ? 'Strong sell pressure — wait for lower prices or go short'
    : 'Balanced book — safe to trade at market';

  return {
    bestBid, bestAsk, spread: +spread.toFixed(4), spreadPct: +spreadPct.toFixed(2), midpoint: midPrice,
    bidDepth: +totalBidLiquidity.toFixed(2), askDepth: +totalAskLiquidity.toFixed(2),
    imbalance, topBidSize: bids[0]?.size || 0, topAskSize: asks[0]?.size || 0, levels: Math.max(bids.length, asks.length),
    totalBidLiquidity: +totalBidLiquidity.toFixed(2), totalAskLiquidity: +totalAskLiquidity.toFixed(2),
    bidWalls, askWalls, bidDepthByLevel, askDepthByLevel, spoofIndicators, recommendation,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  WHALE TRACKER
// ═══════════════════════════════════════════════════════════════════

export interface WhaleTradeResult {
  token_id: string;
  total_trades: number;
  whale_trades: number;
  min_size_filter: number;
  trades: Array<{ id: string; maker: string; taker: string; side: string; size: number; price: number; timestamp: string; value: number }>;
  summary: { total_whale_volume: number; avg_whale_size: number; unique_wallets: number };
}

export async function scanWhaleTrades(tokenId: string, minSize = 1000): Promise<WhaleTradeResult> {
  let trades: any[] | null = null;
  try {
    trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tokenId}&limit=100`, 15_000);
  } catch {
    // CLOB rate limited — return empty result with note instead of throwing
    return {
      token_id: tokenId, total_trades: 0, whale_trades: 0, min_size_filter: minSize,
      trades: [], summary: { total_whale_volume: 0, avg_whale_size: 0, unique_wallets: 0 },
    };
  }
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

  const wallets = new Set<string>();
  for (const t of largeTrades) {
    if (t.maker) wallets.add(t.maker.toLowerCase());
    if (t.taker) wallets.add(t.taker.toLowerCase());
  }

  return {
    token_id: tokenId,
    total_trades: (trades || []).length,
    whale_trades: largeTrades.length,
    min_size_filter: minSize,
    trades: largeTrades.slice(0, 20),
    summary: {
      total_whale_volume: +largeTrades.reduce((s: number, t: any) => s + t.value, 0).toFixed(2),
      avg_whale_size: largeTrades.length ? +(largeTrades.reduce((s: number, t: any) => s + t.value, 0) / largeTrades.length).toFixed(2) : 0,
      unique_wallets: wallets.size,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  ON-CHAIN FLOW
// ═══════════════════════════════════════════════════════════════════

export interface FlowResult {
  token_id: string;
  flows: Record<string, {
    buy_volume: number; sell_volume: number; net_flow: number;
    buy_count: number; sell_count: number; total_trades: number;
    signal: string;
  }>;
}

export async function analyzeFlow(tokenId: string, windows?: string[]): Promise<FlowResult> {
  let trades: any[] | null = null;
  try {
    trades = await cachedFetchJSON(`${CLOB_API}/trades?token_id=${tokenId}&limit=500`);
  } catch {
    return { token_id: tokenId, flows: {} };
  }
  if (!trades?.length) return { token_id: tokenId, flows: {} };

  const now = Date.now();
  const windowMs: Record<string, number> = { '5m': 5*60e3, '15m': 15*60e3, '1h': 60*60e3, '4h': 4*60*60e3, '24h': 24*60*60e3 };
  const requestedWindows = windows || ['1h', '4h', '24h'];
  const flows: FlowResult['flows'] = {};

  for (const window of requestedWindows) {
    const ms = windowMs[window] || 60*60e3;
    const cutoff = now - ms;
    const windowTrades = trades.filter((t: any) => {
      const ts = new Date(t.match_time || t.created_at).getTime();
      return ts >= cutoff;
    });

    let buyVolume = 0, sellVolume = 0, buyCount = 0, sellCount = 0;
    for (const t of windowTrades) {
      const value = parseFloat(t.size || '0') * parseFloat(t.price || '0');
      if (t.side === 'BUY') { buyVolume += value; buyCount++; }
      else { sellVolume += value; sellCount++; }
    }

    const netFlow = buyVolume - sellVolume;
    flows[window] = {
      buy_volume: +buyVolume.toFixed(2), sell_volume: +sellVolume.toFixed(2), net_flow: +netFlow.toFixed(2),
      buy_count: buyCount, sell_count: sellCount, total_trades: windowTrades.length,
      signal: netFlow > 0 ? 'bullish' : netFlow < 0 ? 'bearish' : 'neutral',
    };
  }

  return { token_id: tokenId, flows };
}

// ═══════════════════════════════════════════════════════════════════
//  WALLET PROFILER
// ═══════════════════════════════════════════════════════════════════

export interface WalletProfile {
  wallet: string;
  total_trades: number;
  total_volume: number;
  buy_volume: number;
  sell_volume: number;
  unique_markets: number;
  unique_tokens: number;
  avg_trade_size: number;
  buy_sell_ratio: number;
  first_trade: string | null;
  last_trade: string | null;
  recent_trades: Array<{ side: string; size: number; price: number; value: number; time: string }>;
}

export async function profileWallet(wallet: string, tokenId?: string): Promise<WalletProfile> {
  const addr = wallet.toLowerCase();
  const [makerTrades, takerTrades] = await Promise.all([
    cachedFetchJSON(`${CLOB_API}/trades?maker_address=${addr}&limit=200`).catch(() => []),
    cachedFetchJSON(`${CLOB_API}/trades?taker_address=${addr}&limit=200`).catch(() => []),
  ]);

  const allTrades = [...(makerTrades || []), ...(takerTrades || [])];
  const filtered = tokenId
    ? allTrades.filter((t: any) => t.asset_id === tokenId || t.token_id === tokenId)
    : allTrades;

  let totalVolume = 0, buyVolume = 0, sellVolume = 0;
  const markets = new Set<string>();
  const tokens = new Set<string>();

  for (const t of filtered) {
    const value = parseFloat(t.size || '0') * parseFloat(t.price || '0');
    totalVolume += value;
    if (t.side === 'BUY') buyVolume += value; else sellVolume += value;
    if (t.market) markets.add(t.market);
    if (t.asset_id || t.token_id) tokens.add(t.asset_id || t.token_id);
  }

  return {
    wallet: addr,
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
}

// ═══════════════════════════════════════════════════════════════════
//  LIQUIDITY MAP
// ═══════════════════════════════════════════════════════════════════

export interface LiquidityMapResult {
  tokens_analyzed: number;
  liquidity_map: any[];
  best_to_trade: string | null;
  worst_to_trade: string | null;
  total_liquidity: number;
  warnings: string[];
}

export async function mapLiquidity(tokenIds: string[]): Promise<LiquidityMapResult> {
  if (!tokenIds.length) throw new Error('Provide token_ids');

  const books = await Promise.all(tokenIds.map(async tid => {
    try {
      const book = await cachedFetchJSON(`${CLOB_API}/book?token_id=${tid}`, 8000);
      const bids = (book?.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
      const asks = (book?.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));
      const totalBid = bids.reduce((s: number, b: any) => s + b.size * b.price, 0);
      const totalAsk = asks.reduce((s: number, a: any) => s + a.size * a.price, 0);
      const bestBid = bids.length ? Math.max(...bids.map((b: any) => b.price)) : 0;
      const bestAsk = asks.length ? Math.min(...asks.map((a: any) => a.price)) : 1;
      const spread = bestAsk - bestBid;
      const midPrice = (bestBid + bestAsk) / 2;
      const spreadPct = midPrice > 0 ? +(spread / midPrice * 100).toFixed(2) : 999;
      const totalDepth = totalBid + totalAsk;
      const imbalance = totalDepth > 0 ? +((totalBid - totalAsk) / totalDepth).toFixed(3) : 0;

      return { token_id: tid, bestBid, bestAsk, midPrice: +midPrice.toFixed(4), spreadPct, totalBidLiquidity: +totalBid.toFixed(2), totalAskLiquidity: +totalAsk.toFixed(2), imbalance, bidLevels: bids.length, askLevels: asks.length, signal: imbalance > 0.3 ? 'bullish' : imbalance < -0.3 ? 'bearish' : 'neutral' };
    } catch {
      return { token_id: tid, error: 'Failed to fetch' };
    }
  }));

  const ranked = books.filter((b: any) => !b.error).sort((a: any, b: any) => (a.spreadPct || 999) - (b.spreadPct || 999));

  return {
    tokens_analyzed: tokenIds.length,
    liquidity_map: ranked,
    best_to_trade: ranked[0]?.token_id || null,
    worst_to_trade: ranked[ranked.length - 1]?.token_id || null,
    total_liquidity: +ranked.reduce((s: number, b: any) => s + (b.totalBidLiquidity || 0) + (b.totalAskLiquidity || 0), 0).toFixed(2),
    warnings: ranked.filter((b: any) => b.spreadPct > 5).map((b: any) => `${b.token_id}: spread ${b.spreadPct}% — AVOID`),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  TRANSACTION DECODER
// ═══════════════════════════════════════════════════════════════════

export interface DecodedTransaction {
  tx_hash?: string;
  from?: string;
  to?: string;
  value?: number;
  is_polymarket_ctf?: boolean;
  method?: string;
  gas_price_gwei?: number;
  block?: number;
}

export interface WalletTransactions {
  wallet: string;
  total_transactions: number;
  polymarket_related: number;
  transactions: any[];
}

export async function decodeTransaction(txHash: string): Promise<DecodedTransaction> {
  const scanUrl = `https://api.polygonscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}`;
  const txData = await cachedFetchJSON(scanUrl).catch(() => null);
  if (!txData?.result) throw new Error('Transaction not found');

  const result = txData.result;
  const to = (result.to || '').toLowerCase();
  const isCtf = to === CTF_ADDRESS.toLowerCase();
  const methodSig = (result.input || '').slice(0, 10);

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

  return {
    tx_hash: txHash,
    from: result.from,
    to: result.to,
    value: parseInt(result.value || '0', 16) / 1e18,
    is_polymarket_ctf: isCtf,
    method: methods[methodSig] || `Unknown (${methodSig})`,
    gas_price_gwei: parseInt(result.gasPrice || '0', 16) / 1e9,
    block: parseInt(result.blockNumber || '0', 16),
  };
}

export async function getWalletTransactions(wallet: string, limit = 20): Promise<WalletTransactions> {
  const url = `https://api.polygonscan.com/api?module=account&action=txlist&address=${wallet}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
  const data = await cachedFetchJSON(url);
  if (!data?.result) return { wallet, total_transactions: 0, polymarket_related: 0, transactions: [] };

  const txs = (data.result || []).map((tx: any) => ({
    hash: tx.hash, to: tx.to, from: tx.from,
    value_matic: +(parseInt(tx.value || '0') / 1e18).toFixed(4),
    is_ctf: (tx.to || '').toLowerCase() === CTF_ADDRESS.toLowerCase(),
    is_usdc: (tx.to || '').toLowerCase() === USDC_ADDRESS.toLowerCase(),
    method: tx.functionName || tx.methodId,
    timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
    status: tx.isError === '0' ? 'success' : 'failed',
  }));

  const polyTxs = txs.filter((t: any) => t.is_ctf || t.is_usdc);

  return {
    wallet,
    total_transactions: txs.length,
    polymarket_related: polyTxs.length,
    transactions: polyTxs.length > 0 ? polyTxs : txs.slice(0, 10),
  };
}
