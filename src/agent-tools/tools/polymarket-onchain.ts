/**
 * Polymarket On-Chain Intelligence Tools — Thin wrappers around polymarket-engines/onchain
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import { scanWhaleTrades, analyzeOrderbookDepth, analyzeFlow, profileWallet, mapLiquidity, decodeTransaction, getWalletTransactions } from '../../polymarket-engines/onchain.js';

export function createPolymarketOnchainTools(_opts?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'poly_whale_tracker',
      description: 'Track large trades (whale activity) on a specific token. Identifies significant buy/sell orders and unique whale wallets.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to track' },
          min_size: { type: 'number', description: 'Minimum trade value in USDC to classify as whale', default: 1000 },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await scanWhaleTrades(p.token_id, p.min_size)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_orderbook_depth',
      description: 'Deep orderbook analysis: bid/ask depth at multiple levels, wall detection, spoofing indicators, and imbalance signals.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeOrderbookDepth(p.token_id)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_onchain_flow',
      description: 'Analyze buy/sell flow over multiple time windows (5m, 15m, 1h, 4h, 24h). Detects net buying or selling pressure.',
      parameters: {
        type: 'object', properties: {
          token_id: { type: 'string', description: 'Token ID to analyze' },
          windows: { type: 'array', items: { type: 'string' }, description: 'Time windows (default: 1h, 4h, 24h)' },
        }, required: ['token_id'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await analyzeFlow(p.token_id, p.windows)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_wallet_profiler',
      description: 'Profile a wallet address: total trades, volume, buy/sell ratio, unique markets, and recent activity.',
      parameters: {
        type: 'object', properties: {
          wallet: { type: 'string', description: 'Wallet address to profile' },
          token_id: { type: 'string', description: 'Optional: filter to specific token' },
        }, required: ['wallet'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await profileWallet(p.wallet, p.token_id)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_liquidity_map',
      description: 'Map liquidity across multiple tokens. Ranks by spread tightness and depth. Identifies best and worst markets to trade.',
      parameters: {
        type: 'object', properties: {
          token_ids: { type: 'array', items: { type: 'string' }, description: 'Token IDs to compare' },
        }, required: ['token_ids'],
      },
      async execute(_id: string, p: any) {
        try { return jsonResult(await mapLiquidity(p.token_ids)); }
        catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'poly_transaction_decoder',
      description: 'Decode a Polygon transaction or list wallet transactions. Identifies Polymarket CTF interactions (position transfers, minting, redemption).',
      parameters: {
        type: 'object', properties: {
          tx_hash: { type: 'string', description: 'Transaction hash to decode' },
          wallet: { type: 'string', description: 'Or list wallet transactions' },
          limit: { type: 'number', description: 'Max transactions (for wallet mode)', default: 20 },
        },
      },
      async execute(_id: string, p: any) {
        try {
          if (p.tx_hash) return jsonResult(await decodeTransaction(p.tx_hash));
          if (p.wallet) return jsonResult(await getWalletTransactions(p.wallet, p.limit));
          return errorResult('Provide tx_hash or wallet');
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
