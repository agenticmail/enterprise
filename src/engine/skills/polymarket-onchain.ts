import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-onchain',
  name: 'Polymarket On-Chain Intelligence',
  description: 'Real-time blockchain analysis for Polymarket on Polygon. Whale wallet tracking, L2 orderbook depth analysis, net buy/sell flow detection, liquidity mapping, wallet profiling, and transaction decoding for conditional token framework.',
  category: 'finance',
  risk: 'high',
  icon: Emoji.link,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_whale_tracker',
    name: 'Whale Tracker',
    description: 'Monitor large trades on a Polymarket token. Detects trades above a size threshold, tracks whale wallets, and records their activity in DB.',
    category: 'read',
    risk: 'medium',
    skillId: 'polymarket-onchain',
    sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string', description: 'Token ID to monitor' },
      min_size: { type: 'number', description: 'Minimum trade size in USDC (default: 1000)', default: 1000 },
      action: { type: 'string', enum: ['scan', 'list_whales', 'add_whale', 'remove_whale'], default: 'scan' },
      wallet: { type: 'string', description: 'Wallet address (for add/remove)' },
      label: { type: 'string', description: 'Label for wallet (for add)' },
    }, required: ['action'] },
  },
  {
    id: 'poly_orderbook_depth',
    name: 'Orderbook Depth',
    description: 'Deep L2 orderbook analysis. Shows bid/ask walls, liquidity levels, spread, imbalance ratio, and spoofing indicators. Essential before placing large orders.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket-onchain',
    sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string', description: 'Token ID to analyze' },
      compare_token: { type: 'string', description: 'Optional second token to compare' },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_onchain_flow',
    name: 'On-Chain Flow',
    description: 'Analyze net buy/sell flow over time windows (5m, 1h, 4h, 24h). Shows whether smart money is accumulating or distributing.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket-onchain',
    sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string', description: 'Token ID to analyze' },
      windows: { type: 'string', description: 'Time windows: "1h,4h,24h"' },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_wallet_profiler',
    name: 'Wallet Profiler',
    description: 'Profile a Polymarket wallet — trade history, win rate, average position size, P&L. Evaluate whether a whale is worth following.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket-onchain',
    sideEffects: ['storage'],
    parameters: { type: 'object', properties: {
      wallet: { type: 'string', description: 'Wallet address to profile' },
      token_id: { type: 'string', description: 'Optional: filter to specific token' },
    }, required: ['wallet'] },
  },
  {
    id: 'poly_liquidity_map',
    name: 'Liquidity Map',
    description: 'Map liquidity across multiple tokens. Shows deep vs thin markets, ranks tradability, identifies unusual liquidity patterns.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket-onchain',
    sideEffects: [],
    parameters: { type: 'object', properties: {
      token_ids: { type: 'string', description: 'Comma-separated token IDs' },
      market_slug: { type: 'string', description: 'Or market slug to auto-discover tokens' },
    } },
  },
  {
    id: 'poly_transaction_decoder',
    name: 'Transaction Decoder',
    description: 'Decode Polygon transactions related to Polymarket conditional tokens. Shows minting, redeeming, splitting, merging of positions.',
    category: 'read',
    risk: 'low',
    skillId: 'polymarket-onchain',
    sideEffects: [],
    parameters: { type: 'object', properties: {
      tx_hash: { type: 'string', description: 'Transaction hash to decode' },
      wallet: { type: 'string', description: 'Or show recent transactions for wallet' },
      limit: { type: 'number', description: 'Number of transactions (default: 20)', default: 20 },
    } },
  },
];
