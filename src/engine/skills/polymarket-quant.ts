import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-quant',
  name: 'Polymarket Quantitative Engine',
  description: 'Institutional-grade quantitative analysis for prediction markets. Kelly Criterion sizing, Black-Scholes binary pricing, Bayesian updating, Monte Carlo simulation, technical indicators (RSI/MACD/Bollinger), volatility modeling (EWMA/Hurst), statistical arbitrage, VaR/CVaR risk metrics, entropy analysis, news aggregation, sentiment scoring, correlation matrices, market efficiency tests, and composite signal generation.',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.chartUp,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_kelly_criterion',
    name: 'Kelly Criterion',
    description: 'Optimal position sizing using Kelly Criterion. f* = (p·b - q) / b. Returns full, half, and quarter Kelly with bankroll-specific sizing.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      true_probability: { type: 'number', description: 'Your estimated true probability (0-1)' },
      market_price: { type: 'number' }, token_id: { type: 'string' },
      bankroll: { type: 'number' }, max_fraction: { type: 'number', default: 0.25 },
    }, required: ['true_probability'] },
  },
  {
    id: 'poly_binary_pricing',
    name: 'Binary Option Pricing',
    description: 'Black-Scholes analog for prediction markets. Returns theoretical fair value and Greeks (delta, gamma, theta, vega).',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      current_price: { type: 'number' }, token_id: { type: 'string' },
      time_to_expiry_hours: { type: 'number' }, end_date: { type: 'string' },
      volatility: { type: 'number' }, true_probability: { type: 'number' },
    }},
  },
  {
    id: 'poly_bayesian_update',
    name: 'Bayesian Probability Update',
    description: 'Update probability estimates with new evidence using Bayes theorem. Sequential updates with likelihood ratios.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      prior: { type: 'number' }, token_id: { type: 'string' },
      evidence: { type: 'array', items: { type: 'object' } },
    }, required: ['evidence'] },
  },
  {
    id: 'poly_monte_carlo',
    name: 'Monte Carlo Simulation',
    description: 'Simulate thousands of portfolio outcomes using mean-reverting GBM. Returns P&L distribution, VaR, probability of profit, Sharpe ratio.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      positions: { type: 'array', items: { type: 'object' } },
      simulations: { type: 'number', default: 10000 },
      time_horizon_hours: { type: 'number', default: 24 },
      volatility: { type: 'number' }, correlation: { type: 'number', default: 0 },
    }, required: ['positions'] },
  },
  {
    id: 'poly_technical_indicators',
    name: 'Technical Indicators',
    description: 'RSI, MACD, Bollinger Bands, EMA crossovers, momentum. Adapted for prediction market 0-1 pricing. Composite signal with confidence.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' }, prices: { type: 'array', items: { type: 'number' } },
      indicators: { type: 'array', items: { type: 'string' } },
      rsi_period: { type: 'number', default: 14 },
      bollinger_period: { type: 'number', default: 20 },
    }},
  },
  {
    id: 'poly_volatility',
    name: 'Volatility Analysis',
    description: 'Realized vol, EWMA vol, Hurst exponent (trending vs mean-reverting), and volatility regime detection.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' }, prices: { type: 'array', items: { type: 'number' } },
      windows: { type: 'array', items: { type: 'number' } },
    }},
  },
  {
    id: 'poly_stat_arb',
    name: 'Statistical Arbitrage',
    description: 'Pairs trading: cointegration test, spread z-score, hedge ratio, and mean-reversion signals between two markets.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id_1: { type: 'string' }, token_id_2: { type: 'string' },
      lookback: { type: 'number', default: 50 },
      entry_zscore: { type: 'number', default: 2 }, exit_zscore: { type: 'number', default: 0.5 },
    }, required: ['token_id_1', 'token_id_2'] },
  },
  {
    id: 'poly_value_at_risk',
    name: 'Value at Risk (VaR)',
    description: 'Parametric, historical, and Cornish-Fisher VaR with Expected Shortfall (CVaR). Adjusts for skewness and kurtosis.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      positions: { type: 'array', items: { type: 'object' } },
      confidence: { type: 'number', default: 0.95 },
      horizon_hours: { type: 'number', default: 24 },
      method: { type: 'string', enum: ['parametric', 'historical', 'cornish_fisher', 'all'], default: 'all' },
    }, required: ['positions'] },
  },
  {
    id: 'poly_entropy',
    name: 'Information Entropy',
    description: 'Shannon entropy, KL divergence between your estimates and market, information decay rate. Measures market uncertainty and your edge in bits.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      market_prices: { type: 'array', items: { type: 'number' } },
      token_id: { type: 'string' },
      your_estimates: { type: 'array', items: { type: 'number' } },
    }},
  },
  {
    id: 'poly_news_feed',
    name: 'News Feed Aggregator',
    description: 'Real-time news from Reuters, AP, BBC, NYT, WSJ, Bloomberg, Politico via Google News RSS. Impact scoring and market relevance ranking.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      query: { type: 'string' }, market_id: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' } },
      hours: { type: 'number', default: 24 }, limit: { type: 'number', default: 20 },
    }},
  },
  {
    id: 'poly_sentiment_analysis',
    name: 'Sentiment Analysis',
    description: 'Lexicon-based sentiment scoring with financial/political domain weighting. Analyzes headlines, comments, or any text. Returns aggregate BULLISH/BEARISH/MIXED signal.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      texts: { type: 'array', items: { type: 'string' } },
      market_id: { type: 'string' },
      domain: { type: 'string', enum: ['general', 'political', 'financial', 'crypto', 'sports'], default: 'general' },
    }},
  },
  {
    id: 'poly_generate_signal',
    name: 'Generate Trading Signal',
    description: 'Master signal: combines order book imbalance, RSI, momentum, mean reversion, fundamental edge, volume-price, and Kelly sizing into a single BUY/SELL/HOLD recommendation with confidence score.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' }, market_id: { type: 'string' },
      true_probability: { type: 'number' }, bankroll: { type: 'number' },
      risk_tolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'], default: 'moderate' },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_correlation_matrix',
    name: 'Correlation Matrix',
    description: 'Pairwise correlation matrix for portfolio construction. Identifies most/least correlated pairs and diversification score.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_ids: { type: 'array', items: { type: 'string' } },
      labels: { type: 'array', items: { type: 'string' } },
      lookback: { type: 'number', default: 50 },
    }, required: ['token_ids'] },
  },
  {
    id: 'poly_efficiency_test',
    name: 'Market Efficiency Test',
    description: 'Tests market efficiency: autocorrelation, runs test, variance ratio (Lo-MacKinlay), Ljung-Box. Identifies if market is trending, mean-reverting, or random walk.',
    category: 'read', risk: 'low', skillId: 'polymarket-quant', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' }, prices: { type: 'array', items: { type: 'number' } },
      significance: { type: 'number', default: 0.05 },
    }},
  },
];
