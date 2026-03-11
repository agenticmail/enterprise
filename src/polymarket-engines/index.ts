/**
 * Polymarket Engines — Barrel Export
 * 
 * All standalone analysis engines, extracted from agent tool files.
 * Import from here for clean access to any engine function.
 */

// Shared utilities & types
export * from './shared.js';

// Quantitative analysis
export * from './quant.js';

// Market screener & scoring
export * from './screener.js';

// Advanced analytics (correlation, arbitrage, regime, smart money, microstructure)
export * from './analytics.js';

// On-chain intelligence (orderbook depth, whales, flow, wallet profiler, liquidity map, tx decoder)
export * from './onchain.js';

// Social intelligence (Twitter, Reddit, Telegram, Polymarket comments, velocity)
export * from './social.js';

// Data feeds (official sources, odds aggregator, resolution tracker, breaking news)
export * from './feeds.js';

// Counter-intelligence (manipulation, resolution risk, counterparty analysis)
export * from './counterintel.js';

// Portfolio intelligence (overview, correlation matrix, Kelly sizing, rebalancing, P&L attribution)
export * from './portfolio.js';

// Unified pipeline (full analysis, quick analysis, batch screen, portfolio review)
export * from './pipeline.js';
