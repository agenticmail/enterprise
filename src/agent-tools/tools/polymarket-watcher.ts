/**
 * Polymarket Watcher Engine — AI-Powered Market Intelligence System
 * 
 * NOT a basic RSS scraper. This is a real-time market surveillance engine with:
 * - LLM-powered news analysis (geopolitical pattern detection, sentiment analysis)
 * - Configurable AI model (Grok for real-time X/Twitter, GPT-4o-mini for cheap, etc.)
 * - Cross-signal correlation (connects news → markets → prices → social)
 * - Predictive intelligence (pattern detection, cascade analysis)
 * - Agent wake system (spawns/messages agent sessions on critical signals)
 * 
 * Watcher types:
 *   price_level       — Alert when token price crosses threshold
 *   price_change      — Alert on % change in time window
 *   market_scan       — Discover new markets matching criteria
 *   news_intelligence — AI-analyzed news with market impact assessment
 *   crypto_price      — BTC/ETH price movement tracker
 *   resolution_watch  — Markets approaching resolution
 *   portfolio_drift   — Position P&L exceeds threshold
 *   volume_surge      — Unusual volume on watched markets
 *   geopolitical      — AI scans geopolitical developments + predicts market impact
 *   cross_signal      — Correlates multiple signals to detect emerging patterns
 *   arbitrage_scan    — Cross-market mispricing detection
 *   sentiment_shift   — Tracks sentiment changes over time with AI analysis
 */

// ─── Types ─────────────────────────────────────────────────────

interface WatcherEvent {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  summary?: string;
  data?: Record<string, any>;
}

interface AIAnalysis {
  impact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  sentiment: number; // -1 to 1
  confidence: number; // 0 to 1
  reasoning: string;
  affected_markets?: string[];
  recommended_action?: string;
  predicted_outcome?: string;
  time_horizon?: string;
}

// ─── DB Schema ─────────────────────────────────────────────────

const WATCHER_TABLES = [
  `CREATE TABLE IF NOT EXISTS poly_watchers (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT,
    config TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    interval_ms INTEGER NOT NULL DEFAULT 60000,
    last_run TEXT,
    last_alert TEXT,
    alert_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS poly_watcher_events (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    watcher_id TEXT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    summary TEXT,
    data TEXT DEFAULT '{}',
    acknowledged INTEGER DEFAULT 0,
    routed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS poly_price_cache (
    token_id TEXT PRIMARY KEY,
    price REAL,
    prev_price REAL,
    volume_24h REAL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS poly_crypto_cache (
    symbol TEXT PRIMARY KEY,
    price REAL,
    change_24h REAL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  // AI analysis cache — avoid re-analyzing the same content
  `CREATE TABLE IF NOT EXISTS poly_analysis_cache (
    content_hash TEXT PRIMARY KEY,
    analysis TEXT NOT NULL,
    model TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  // Watcher engine config — per-agent model settings
  `CREATE TABLE IF NOT EXISTS poly_watcher_config (
    agent_id TEXT PRIMARY KEY,
    ai_model TEXT DEFAULT 'grok-3-mini',
    ai_provider TEXT DEFAULT 'xai',
    ai_api_key TEXT,
    use_org_key INTEGER DEFAULT 1,
    analysis_budget_daily INTEGER DEFAULT 100,
    analysis_count_today INTEGER DEFAULT 0,
    analysis_date TEXT,
    max_spawn_per_hour INTEGER DEFAULT 6,
    enabled INTEGER DEFAULT 1,
    config TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  // Sentiment history — tracks sentiment trends over time
  `CREATE TABLE IF NOT EXISTS poly_sentiment_history (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    sentiment REAL NOT NULL,
    confidence REAL,
    source TEXT,
    analysis TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  // Signal correlation buffer — stores recent signals for cross-correlation
  `CREATE TABLE IF NOT EXISTS poly_signal_buffer (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    topic TEXT NOT NULL,
    data TEXT DEFAULT '{}',
    sentiment REAL,
    impact TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
];

export async function initWatcherTables(edb: any) {
  if (!edb) return;
  for (const sql of WATCHER_TABLES) {
    try { await edb.run(sql); } catch {}
  }
  // Migration: add use_org_key column if missing
  try { await edb.run(`ALTER TABLE poly_watcher_config ADD COLUMN use_org_key INTEGER DEFAULT 1`); } catch {}
}

// ─── Cross-DB Date Helpers ─────────────────────────────────────
// SQLite and PostgreSQL use different date arithmetic syntax.
// These helpers produce ISO date strings in JS to work with both.

/** Returns ISO string for "now minus N hours" — use in WHERE clauses */
function dateAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

/** Returns ISO string for "now minus N minutes" */
function dateAgoMin(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Returns ISO string for "now plus N hours" */
function dateAhead(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** Returns ISO date string for "today + N days" */
function datePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── AI Analysis Engine ────────────────────────────────────────

/**
 * Lightweight LLM call for background analysis.
 * Uses OpenAI-compatible API format (works with Grok/xAI, OpenAI, Groq, Cerebras, etc.)
 * Designed for cheap, fast analysis — NOT full agent conversation.
 */
async function callAnalysisLLM(
  prompt: string,
  config: { provider: string; model: string; apiKey: string },
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<string> {
  const baseUrls: Record<string, string> = {
    xai: 'https://api.x.ai/v1',
    openai: 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    cerebras: 'https://api.cerebras.ai/v1',
    together: 'https://api.together.xyz/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    deepseek: 'https://api.deepseek.com/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1',
    anthropic: 'https://api.anthropic.com',
  };

  const isAnthropic = config.provider === 'anthropic';
  const baseUrl = baseUrls[config.provider] || baseUrls.openai;

  let res: Response;

  if (isAnthropic) {
    // Anthropic Messages API (different format from OpenAI)
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: opts?.maxTokens || 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs || 15000),
    });
  } else {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts?.maxTokens || 500,
        temperature: opts?.temperature || 0.3,
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs || 15000),
    });
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  // Anthropic returns content[0].text, OpenAI-compatible returns choices[0].message.content
  if (isAnthropic) {
    return data.content?.[0]?.text || '';
  }
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Get AI config for an agent — model, API key, budget
 */
export async function getAIConfig(agentId: string, edb: any): Promise<{
  provider: string; model: string; apiKey: string; budgetRemaining: number;
} | null> {
  try {
    const cfg = await edb.get(`SELECT * FROM poly_watcher_config WHERE agent_id = ?`, [agentId]);
    if (!cfg) return null;

    const apiKey = cfg.ai_api_key || '';
    if (!apiKey) return null;

    // Check daily budget
    const today = new Date().toISOString().slice(0, 10);
    if (cfg.analysis_date !== today) {
      await edb.run(`UPDATE poly_watcher_config SET analysis_count_today = 0, analysis_date = ? WHERE agent_id = ?`, [today, agentId]);
      return { provider: cfg.ai_provider, model: cfg.ai_model, apiKey, budgetRemaining: cfg.analysis_budget_daily || 100 };
    }

    const remaining = (cfg.analysis_budget_daily || 100) - (cfg.analysis_count_today || 0);
    if (remaining <= 0) return null;

    return { provider: cfg.ai_provider, model: cfg.ai_model, apiKey, budgetRemaining: remaining };
  } catch { return null; }
}

/**
 * Increment the AI analysis counter for budget tracking
 */
async function incrementAnalysisCount(agentId: string, edb: any) {
  try {
    await edb.run(`UPDATE poly_watcher_config SET analysis_count_today = analysis_count_today + 1, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`, [agentId]);
  } catch {}
}

/**
 * Check analysis cache to avoid re-analyzing identical content
 */
async function getCachedAnalysis(contentHash: string, edb: any): Promise<AIAnalysis | null> {
  try {
    const row = await edb.get(`SELECT analysis FROM poly_analysis_cache WHERE content_hash = ? AND created_at > ?`, [contentHash, dateAgo(1)]);
    if (row) return JSON.parse(row.analysis);
  } catch {}
  return null;
}

async function cacheAnalysis(contentHash: string, analysis: AIAnalysis, model: string, edb: any) {
  try {
    await edb.run(
      `INSERT OR REPLACE INTO poly_analysis_cache (content_hash, analysis, model, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [contentHash, JSON.stringify(analysis), model]
    );
  } catch {}
}

function hashContent(content: string): string {
  // Simple hash for cache keys
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

/**
 * AI-powered news/event analysis.
 * Asks the LLM to assess market impact, predict outcomes, and recommend actions.
 */
export async function analyzeWithAI(
  content: string,
  context: { watchedMarkets?: string[]; positions?: string[]; topic?: string },
  agentId: string,
  edb: any
): Promise<AIAnalysis | null> {
  const aiConfig = await getAIConfig(agentId, edb);
  if (!aiConfig) return null;

  // Check cache first
  const hash = hashContent(content + JSON.stringify(context));
  const cached = await getCachedAnalysis(hash, edb);
  if (cached) return cached;

  const marketContext = context.watchedMarkets?.length
    ? `\nAgent is currently watching/trading these Polymarket markets:\n${context.watchedMarkets.map(m => `- ${m}`).join('\n')}`
    : '';
  const positionContext = context.positions?.length
    ? `\nAgent has open positions in:\n${context.positions.map(p => `- ${p}`).join('\n')}`
    : '';

  const prompt = `You are a quantitative market intelligence analyst for a prediction market trading system (Polymarket).

Analyze the following content and assess its potential impact on prediction markets.
${marketContext}${positionContext}

CONTENT TO ANALYZE:
${content}

Respond in EXACT JSON format (no markdown, no code blocks):
{
  "impact": "none|low|medium|high|critical",
  "sentiment": <float -1.0 to 1.0, negative=bearish, positive=bullish>,
  "confidence": <float 0.0 to 1.0, how confident in this assessment>,
  "reasoning": "<1-2 sentence explanation of WHY this matters for prediction markets>",
  "affected_markets": ["<list of market topics/questions this could affect>"],
  "recommended_action": "<what should the trader do: buy/sell/hedge/monitor/ignore>",
  "predicted_outcome": "<what you think will happen based on this signal>",
  "time_horizon": "<how soon: immediate/hours/days/weeks>"
}`;

  try {
    const response = await callAnalysisLLM(prompt, {
      provider: aiConfig.provider,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
    }, { maxTokens: 400, temperature: 0.2 });

    await incrementAnalysisCount(agentId, edb);

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const analysis: AIAnalysis = JSON.parse(jsonStr);

    // Cache it
    await cacheAnalysis(hash, analysis, aiConfig.model, edb);

    return analysis;
  } catch (e: any) {
    return null;
  }
}

/**
 * Geopolitical analysis — connects dots between world events and prediction markets.
 * This is the "president threatening a country → predict attack" type of intelligence.
 */
async function analyzeGeopolitical(
  headlines: { title: string; source?: string; url?: string; date?: string }[],
  watchedTopics: string[],
  agentId: string,
  edb: any
): Promise<AIAnalysis | null> {
  const aiConfig = await getAIConfig(agentId, edb);
  if (!aiConfig) return null;

  const hash = hashContent(headlines.map(h => h.title).join('|') + watchedTopics.join(','));
  const cached = await getCachedAnalysis(hash, edb);
  if (cached) return cached;

  const prompt = `You are a geopolitical intelligence analyst working for a prediction market hedge fund.

Your job: Identify patterns in current events that predict future outcomes relevant to prediction markets (Polymarket).

CURRENT HEADLINES:
${headlines.map((h, i) => `${i + 1}. ${h.title}${h.source ? ` (${h.source})` : ''}${h.date ? ` [${h.date}]` : ''}`).join('\n')}

TOPICS THE TRADER IS WATCHING:
${watchedTopics.map(t => `- ${t}`).join('\n')}

ANALYSIS REQUIRED:
1. Connect dots between these headlines — what patterns emerge?
2. What events do these patterns predict could happen soon?
3. Which prediction markets would be most affected?
4. What's the confidence level and time horizon?

Think like a CIA analyst briefing a trader. Focus on ACTIONABLE intelligence.

Respond in EXACT JSON format (no markdown, no code blocks):
{
  "impact": "none|low|medium|high|critical",
  "sentiment": <float -1.0 to 1.0>,
  "confidence": <float 0.0 to 1.0>,
  "reasoning": "<2-3 sentence analysis connecting the dots between events and predicting what happens next>",
  "affected_markets": ["<specific prediction market topics this affects>"],
  "recommended_action": "<specific trading recommendation>",
  "predicted_outcome": "<what the analyst predicts will happen based on patterns>",
  "time_horizon": "<immediate/hours/days/weeks>"
}`;

  try {
    const response = await callAnalysisLLM(prompt, {
      provider: aiConfig.provider,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
    }, { maxTokens: 500, temperature: 0.3 });

    await incrementAnalysisCount(agentId, edb);

    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const analysis: AIAnalysis = JSON.parse(jsonStr);
    await cacheAnalysis(hash, analysis, aiConfig.model, edb);
    return analysis;
  } catch { return null; }
}

/**
 * Cross-signal correlation — finds patterns across multiple signal types.
 * Detects when price moves + news + social sentiment all point the same direction.
 */
async function analyzeSignalCorrelation(
  signals: { type: string; topic: string; sentiment?: number; impact?: string; summary: string }[],
  agentId: string,
  edb: any
): Promise<AIAnalysis | null> {
  const aiConfig = await getAIConfig(agentId, edb);
  if (!aiConfig || signals.length < 2) return null;

  const hash = hashContent(signals.map(s => s.type + s.topic + s.summary).join('|'));
  const cached = await getCachedAnalysis(hash, edb);
  if (cached) return cached;

  const prompt = `You are a quantitative signal correlation analyst for a prediction market fund.

Multiple independent signals have fired within a short timeframe. Your job: determine if they're connected and what they predict together.

RECENT SIGNALS:
${signals.map((s, i) => `${i + 1}. [${s.type.toUpperCase()}] ${s.topic}: ${s.summary}${s.sentiment != null ? ` (sentiment: ${s.sentiment.toFixed(2)})` : ''}${s.impact ? ` (impact: ${s.impact})` : ''}`).join('\n')}

ANALYSIS:
1. Are these signals correlated? What's the common thread?
2. Does the convergence increase confidence in any direction?
3. Is this a cascade pattern (one event causing the others)?
4. What's the combined signal saying that individual signals miss?

Respond in EXACT JSON format (no markdown, no code blocks):
{
  "impact": "none|low|medium|high|critical",
  "sentiment": <float -1.0 to 1.0, combined signal direction>,
  "confidence": <float 0.0 to 1.0, how confident the signals are correlated>,
  "reasoning": "<2-3 sentences explaining the correlation pattern and prediction>",
  "affected_markets": ["<markets where the combined signal is actionable>"],
  "recommended_action": "<trading action based on signal convergence>",
  "predicted_outcome": "<what the combined signal predicts>",
  "time_horizon": "<immediate/hours/days/weeks>"
}`;

  try {
    const response = await callAnalysisLLM(prompt, {
      provider: aiConfig.provider,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
    }, { maxTokens: 400, temperature: 0.2 });

    await incrementAnalysisCount(agentId, edb);

    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const analysis: AIAnalysis = JSON.parse(jsonStr);
    await cacheAnalysis(hash, analysis, aiConfig.model, edb);
    return analysis;
  } catch { return null; }
}

// ─── Watcher Engine ────────────────────────────────────────────

const TICK_MS = 15_000;
const IDLE_CHECK_MS = 60_000;
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

let engineInterval: any = null;
let idleInterval: any = null;
let lastCryptoFetch = 0;
let cryptoCache: Record<string, { price: number; change_24h: number }> = {};
let _engineDb: any = null;
let _engineOpts: WatcherEngineOpts | null = null;
let _engineStartedAt: number | null = null;
let _engineTickCount = 0;
let _engineEventCount = 0;
let _engineAnalysisCount = 0;
let _spawnCount = 0;
let _lastAlertCheckMs = 0;
let _lastExitCheckMs = 0;
let _lastProactiveCheckMs = 0;

const _lastSpawnByAgent: Record<string, number> = {};
const SPAWN_COOLDOWN_MS = 5 * 60_000;
const MAX_BATCH_EVENTS = 10;

interface WatcherEngineOpts {
  onEvent?: (agentId: string, event: WatcherEvent) => void;
  log?: (...args: any[]) => void;
  getRuntime?: () => any | null;
  getAgentConfig?: (agentId: string) => any | null;
}

export function getWatcherEngineStatus() {
  return {
    running: !!engineInterval,
    idle: !!idleInterval && !engineInterval,
    startedAt: _engineStartedAt,
    tickCount: _engineTickCount,
    eventCount: _engineEventCount,
    analysisCount: _engineAnalysisCount,
    spawnCount: _spawnCount,
    tickMs: TICK_MS,
    idleCheckMs: IDLE_CHECK_MS,
    spawnCooldownMs: SPAWN_COOLDOWN_MS,
  };
}

export function startWatcherEngine(db: any, opts?: WatcherEngineOpts) {
  _engineDb = db;
  _engineOpts = opts || {};
  const log = opts?.log || console.log;

  if (idleInterval || engineInterval) return;

  log('[poly-watcher] AI-powered engine registered — will activate when watchers exist');

  const checkAndToggle = async () => {
    const edb = db.getEngineDB?.();
    if (!edb) return;
    try {
      const row = await edb.get(`SELECT COUNT(*) as cnt FROM poly_watchers WHERE status = 'active'`);
      const count = row?.cnt || 0;
      if (count > 0 && !engineInterval) {
        _startFastLoop(db, _engineOpts!);
      } else if (count === 0 && engineInterval) {
        _stopFastLoop(log);
      }
    } catch {}
  };

  checkAndToggle();
  idleInterval = setInterval(checkAndToggle, IDLE_CHECK_MS);
}

export function setWatcherRuntime(getRuntime: () => any | null, getAgentConfig?: (agentId: string) => any | null) {
  if (_engineOpts) {
    _engineOpts.getRuntime = getRuntime;
    if (getAgentConfig) _engineOpts.getAgentConfig = getAgentConfig;
    const log = _engineOpts.log || console.log;
    log('[poly-watcher] Runtime reference injected — agent wake enabled');
  }
}

function _startFastLoop(db: any, opts: WatcherEngineOpts) {
  if (engineInterval) return;
  const log = opts.log || console.log;
  log('[poly-watcher] Active watchers found — starting 15s tick loop');
  _engineStartedAt = Date.now();

  engineInterval = setInterval(async () => {
    const edb = db.getEngineDB?.();
    if (!edb) return;
    _engineTickCount++;

    try {
      const now = Date.now();
      const watchers: any[] = await edb.all(
        `SELECT * FROM poly_watchers WHERE status = 'active'`
      ) || [];

      if (watchers.length === 0) {
        _stopFastLoop(log);
        return;
      }

      const eventsByAgent: Record<string, { events: WatcherEvent[]; maxSeverity: string }> = {};
      const priceCache: Record<string, number> = {}; // shared across alert + exit rule checks

      for (const w of watchers) {
        const lastRun = w.last_run ? new Date(w.last_run).getTime() : 0;
        if (now - lastRun < (w.interval_ms || 60000)) continue;

        try {
          const config = JSON.parse(w.config || '{}');
          const events = await runWatcher(w.type, config, w.agent_id, edb);

          for (const evt of events) {
            const id = crypto.randomUUID();

            // Auto-trade execution: if watcher config has auto_action, execute trade on event
            if (config.auto_action && evt.severity !== 'info') {
              try {
                const aa = config.auto_action;
                const tokenId = aa.token_id || evt.data?.token_id;
                if (tokenId && (aa.side || aa.action)) {
                  const { executeOrder } = await import('./polymarket.js');
                  const tradeId = `watcher_${w.id}_${Date.now()}`;
                  // Resolve price: use configured price, event price, or fetch live midpoint
                  let tradePrice = aa.price || evt.data?.current_price || 0;
                  if (!tradePrice || tradePrice <= 0) {
                    try {
                      const mid = await fetch(`${CLOB_API}/midpoint?token_id=${tokenId}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
                      tradePrice = parseFloat(mid?.mid || '0');
                    } catch {}
                  }
                  if (!tradePrice || tradePrice <= 0) {
                    log(`[watcher] Auto-trade skipped for ${w.name}: could not resolve price for token ${tokenId}`);
                    continue;
                  }
                  // Check if market is resolved before executing SELL
                  if (tradePrice >= 0.99 || tradePrice <= 0.01) {
                    const sellSide = (aa.side || String(aa.action).toUpperCase()) === 'SELL';
                    if (sellSide) {
                      log(`[watcher] Auto-trade skipped for ${w.name}: market appears resolved (price=${tradePrice})`);
                      evt.data = evt.data || {};
                      evt.data.skipped = `Market resolved (price=${tradePrice}), SELL not executed`;
                      continue;
                    }
                  }
                  const tradeParams = {
                    token_id: tokenId,
                    side: aa.side || (String(aa.action).toUpperCase() === 'SELL' ? 'SELL' : 'BUY'),
                    size: aa.size || aa.shares || 0,
                    price: tradePrice,
                    market_question: aa.market_question || evt.title || 'Auto-trade from watcher',
                    order_type: 'GTC',
                  };
                  // Wrap edb for executeOrder compatibility (needs .query/.execute for Postgres)
                  const dbCompat = edb.query ? edb : { query: edb.all?.bind(edb), execute: edb.run?.bind(edb), run: edb.run?.bind(edb), get: edb.get?.bind(edb), all: edb.all?.bind(edb) };
                  log(`[watcher] Auto-executing trade for watcher ${w.name}: ${tradeParams.side} ${tradeParams.size} @ ${tradeParams.price}`);
                  const result = await executeOrder(w.agent_id, dbCompat, tradeId, tradeParams, 'auto_watcher');
                  evt.data = evt.data || {};
                  evt.data.auto_trade_result = result;
                  evt.summary = (evt.summary || '') + ` | Auto-trade: ${tradeParams.side} ${tradeParams.size} shares`;
                  log(`[watcher] Auto-trade result for watcher ${w.name}: ${JSON.stringify(result).slice(0, 200)}`);
                }
              } catch (atErr: any) {
                log(`[watcher] Auto-trade failed for watcher ${w.name}: ${atErr.message}`);
                evt.data = evt.data || {};
                evt.data.auto_trade_error = atErr.message;
              }
            }

            await edb.run(
              `INSERT INTO poly_watcher_events (id, agent_id, watcher_id, type, severity, title, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, w.agent_id, w.id, evt.type, evt.severity, evt.title, evt.summary || '', JSON.stringify(evt.data || {})]
            );
            _engineEventCount++;

            if (!eventsByAgent[w.agent_id]) {
              eventsByAgent[w.agent_id] = { events: [], maxSeverity: 'info' };
            }
            const batch = eventsByAgent[w.agent_id];
            batch.events.push(evt);
            if (evt.severity === 'critical') batch.maxSeverity = 'critical';
            else if (evt.severity === 'warning' && batch.maxSeverity !== 'critical') batch.maxSeverity = 'warning';

            if (opts.onEvent) {
              try { opts.onEvent(w.agent_id, evt); } catch {}
            }
          }

          await edb.run(
            `UPDATE poly_watchers SET last_run = CURRENT_TIMESTAMP, alert_count = alert_count + ? WHERE id = ?`,
            [events.length, w.id]
          );
          if (events.length > 0) {
            await edb.run(`UPDATE poly_watchers SET last_alert = CURRENT_TIMESTAMP WHERE id = ?`, [w.id]);
          }
        } catch (e: any) {
          // Don't crash the engine for one watcher failure
        }
      }

      // ── Check poly_price_alerts (created by poly_set_alert) ──
      // Alerts are simple price triggers agents create with poly_set_alert.
      // The watcher engine monitors them 24/7 so agents don't need to be awake.
      // Triggered alerts auto-wake the agent (critical severity).
      //
      // Edge cases handled:
      // 1. Dedup: We check `triggered = 0` — once marked triggered, it's done.
      //    For repeat alerts, base_price is updated so same condition won't re-fire until price resets.
      // 2. Dedup vs watchers: If a watcher price_level AND an alert cover the same token,
      //    both may fire — but the agent gets ONE spawn (cooldown prevents double-spawn).
      //    The events are distinct types (price_level vs price_alert) so the agent sees both.
      // 3. Dedup vs heartbeat: The heartbeat's checkAlerts() also checks these alerts.
      //    But since we mark triggered=1 here, heartbeat won't re-fire them.
      //    If the agent IS already awake and runs heartbeat first, it marks triggered=1,
      //    and this loop skips it. No conflict either way.
      // 4. Race condition: Multiple ticks can't double-fire because we mark triggered=1
      //    atomically before the next tick runs (single-threaded JS event loop).
      // 5. Repeat alerts: For repeat_alert=1, we update base_price on fire so the alert
      //    won't re-fire until price moves away and comes back. 60s throttle prevents spam.
      // 6. API errors: Individual alert failures are caught and skipped.
      // 7. Missing table: Entire block wrapped in try/catch for fresh installs.
      //
      // Throttled to once per 60s to avoid Polymarket API rate limits.
      if (now - _lastAlertCheckMs < 60_000) { /* skip this tick */ }
      else try {
        _lastAlertCheckMs = now;
        const activeAlerts: any[] = await edb.all(
          `SELECT * FROM poly_price_alerts WHERE triggered = 0`
        ).catch(() => []) || [];

        for (const alert of activeAlerts) {
          try {
            // Reuse cached price if we already fetched this token this tick
            let currentPrice = priceCache[alert.token_id];
            if (currentPrice === undefined) {
              const mid = await fetch(`${CLOB_API}/midpoint?token_id=${alert.token_id}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
              currentPrice = parseFloat(mid?.mid || '0');
              priceCache[alert.token_id] = currentPrice;
            }

            // ── Market resolution/closure detection ──
            // If price is 0 or 1 (resolved) or API returns nothing, the market is likely dead.
            // Price exactly 0: API error or delisted. Price exactly 1 or 0 after resolution.
            // We check the market via CLOB /market endpoint to confirm.
            if (!currentPrice || currentPrice <= 0) {
              // Price unavailable — market may be resolved, cancelled, or delisted
              // Mark alert as triggered with resolution reason and cancel bracket siblings
              try {
                const marketInfo = await fetch(`${GAMMA_API}/markets?clob_token_ids=${alert.token_id}&limit=1`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).then(arr => Array.isArray(arr) ? arr[0] : arr).catch(() => null);
                const isClosed = marketInfo?.closed || marketInfo?.resolved || marketInfo?.active === false;
                if (isClosed || !marketInfo) {
                  const reason = marketInfo?.resolved ? 'resolved' : marketInfo?.closed ? 'closed' : 'unavailable';
                  log(`[alerts] Market ${reason} for alert ${alert.id} (${alert.market_question || alert.token_id.slice(0,16)}). Auto-cancelling.`);
                  await edb.run(`UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`, [alert.id]);

                  // Cancel bracket siblings if this is part of a bracket
                  if (alert.bracket_group) {
                    await edb.run(
                      `UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE bracket_group = ? AND id != ? AND triggered = 0`,
                      [alert.bracket_group, alert.id]
                    );
                    log(`[bracket] Market ${reason} — cancelled entire bracket group ${alert.bracket_group}`);
                  }

                  // Create an info event so the agent knows
                  const evtId = crypto.randomUUID();
                  await edb.run(
                    `INSERT INTO poly_watcher_events (id, agent_id, watcher_id, type, severity, title, summary, data) VALUES (?,?,?,?,?,?,?,?)`,
                    [evtId, alert.agent_id, 'alert_' + alert.id, 'market_resolved', 'warning',
                     `Market ${reason}: ${alert.market_question || alert.token_id.slice(0,16)}`,
                     `Alert auto-cancelled because market is ${reason}. ${alert.bracket_group ? 'Bracket group also cancelled.' : ''}`,
                     JSON.stringify({ alert_id: alert.id, token_id: alert.token_id, reason, bracket_group: alert.bracket_group || null })]
                  );
                  _engineEventCount++;

                  if (!eventsByAgent[alert.agent_id]) eventsByAgent[alert.agent_id] = { events: [], maxSeverity: 'info' };
                  eventsByAgent[alert.agent_id].events.push({
                    type: 'market_resolved', severity: 'warning',
                    title: `Market ${reason}: ${alert.market_question || alert.token_id.slice(0,16)}`,
                    summary: `Alert auto-cancelled. Market is ${reason}.`,
                    data: { alert_id: alert.id, reason },
                  });
                  if (eventsByAgent[alert.agent_id].maxSeverity === 'info') eventsByAgent[alert.agent_id].maxSeverity = 'warning';
                }
              } catch {}
              continue;
            }

            // ── Resolved market detection: price stuck at exactly 1.00 or 0.00 ──
            // On Polymarket, resolved markets snap to 1.00 (winning) or 0.00 (losing).
            if (currentPrice >= 0.99 || currentPrice <= 0.01) {
              try {
                const marketInfo = await fetch(`${GAMMA_API}/markets?clob_token_ids=${alert.token_id}&limit=1`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).then(arr => Array.isArray(arr) ? arr[0] : arr).catch(() => null);
                if (marketInfo?.resolved || marketInfo?.closed) {
                  const reason = marketInfo.resolved ? 'resolved' : 'closed';
                  const winning = currentPrice >= 0.99;
                  log(`[alerts] Market ${reason} (${winning ? 'YES won' : 'NO won'}) for alert ${alert.id}. Auto-cancelling.`);
                  await edb.run(`UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`, [alert.id]);

                  // Cancel bracket siblings
                  if (alert.bracket_group) {
                    await edb.run(
                      `UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE bracket_group = ? AND id != ? AND triggered = 0`,
                      [alert.bracket_group, alert.id]
                    );
                  }

                  const evtId = crypto.randomUUID();
                  await edb.run(
                    `INSERT INTO poly_watcher_events (id, agent_id, watcher_id, type, severity, title, summary, data) VALUES (?,?,?,?,?,?,?,?)`,
                    [evtId, alert.agent_id, 'alert_' + alert.id, 'market_resolved', 'critical',
                     `Market ${reason}: ${alert.market_question || alert.token_id.slice(0,16)}`,
                     `Market ${reason} at ${(currentPrice * 100).toFixed(1)}¢. ${winning ? 'Position WON' : 'Position LOST'}. All alerts cancelled.`,
                     JSON.stringify({ alert_id: alert.id, token_id: alert.token_id, reason, final_price: currentPrice, bracket_group: alert.bracket_group || null })]
                  );
                  _engineEventCount++;

                  if (!eventsByAgent[alert.agent_id]) eventsByAgent[alert.agent_id] = { events: [], maxSeverity: 'info' };
                  eventsByAgent[alert.agent_id].events.push({
                    type: 'market_resolved', severity: 'critical',
                    title: `Market ${reason}: ${alert.market_question || alert.token_id.slice(0,16)}`,
                    summary: `Resolved at ${(currentPrice * 100).toFixed(1)}¢. ${winning ? 'WON' : 'LOST'}.`,
                    data: { alert_id: alert.id, reason, final_price: currentPrice },
                  });
                  eventsByAgent[alert.agent_id].maxSeverity = 'critical';
                  continue;
                }
              } catch {}
            }

            let fire = false;
            let reason = '';

            if (alert.condition === 'above' && alert.target_price && currentPrice >= alert.target_price) {
              fire = true;
              reason = `Price ${(currentPrice * 100).toFixed(1)}¢ crossed above target ${(alert.target_price * 100).toFixed(1)}¢`;
            } else if (alert.condition === 'below' && alert.target_price && currentPrice <= alert.target_price) {
              fire = true;
              reason = `Price ${(currentPrice * 100).toFixed(1)}¢ dropped below target ${(alert.target_price * 100).toFixed(1)}¢`;
            } else if (alert.condition === 'pct_change' && alert.pct_change && alert.base_price) {
              const change = Math.abs(currentPrice - alert.base_price) / alert.base_price * 100;
              if (change >= alert.pct_change) {
                fire = true;
                const dir = currentPrice > alert.base_price ? 'up' : 'down';
                reason = `Price moved ${dir} ${change.toFixed(1)}% (threshold: ${alert.pct_change}%)`;
              }
            }

            if (fire) {
              // Dedup: check if we already fired an event for this exact alert recently
              const recentDup = await edb.all(
                `SELECT id FROM poly_watcher_events WHERE watcher_id = ? AND created_at > ?`,
                ['alert_' + alert.id, dateAgoMin(5)]
              ).catch(() => []);
              if (recentDup && recentDup.length > 0) continue; // Already fired recently

              const label = alert.market_question || alert.token_id.slice(0, 16) + '…';
              const evt: WatcherEvent = {
                type: 'price_alert',
                severity: 'critical', // Alerts always wake the agent — they are explicit user-set triggers
                title: `[ALERT] ${label}`,
                summary: reason,
                data: { alert_id: alert.id, token_id: alert.token_id, current_price: currentPrice, condition: alert.condition, target_price: alert.target_price, source: 'poly_set_alert' },
              };

              // Store as watcher event so it shows in the dashboard Signals tab
              const evtId = crypto.randomUUID();
              await edb.run(
                `INSERT INTO poly_watcher_events (id, agent_id, watcher_id, type, severity, title, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [evtId, alert.agent_id, 'alert_' + alert.id, evt.type, evt.severity, evt.title, evt.summary, JSON.stringify(evt.data)]
              );
              _engineEventCount++;

              // Add to agent wake batch — critical severity guarantees agent spawn
              if (!eventsByAgent[alert.agent_id]) {
                eventsByAgent[alert.agent_id] = { events: [], maxSeverity: 'info' };
              }
              eventsByAgent[alert.agent_id].events.push(evt);
              eventsByAgent[alert.agent_id].maxSeverity = 'critical';

              // Auto-trade execution: if alert has auto_trade_config, execute the trade immediately
              if (alert.auto_trade_config) {
                try {
                  const atc = typeof alert.auto_trade_config === 'string' ? JSON.parse(alert.auto_trade_config) : alert.auto_trade_config;
                  if (atc && (atc.side || atc.action)) {
                    const tokenId = atc.token_id || alert.token_id;

                    // Check if market is resolved/ended before executing
                    let marketResolved = false;
                    if (currentPrice >= 0.99 || currentPrice <= 0.01) {
                      // Price at extreme = likely resolved
                      marketResolved = true;
                    }
                    // Also check via position — if no position exists for SELL, skip
                    if (marketResolved && (atc.side || atc.action)?.toUpperCase() === 'SELL') {
                      log(`[watcher] Skipping auto-trade for alert ${alert.id}: market appears resolved (price=${currentPrice}). Cancelling alert.`);
                      await edb.run(`UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`, [alert.id]);
                      evt.data = evt.data || {};
                      evt.data.skipped = `Market resolved (price=${currentPrice}), trade not executed`;
                      evt.summary += ` | Skipped: market resolved`;
                      continue;
                    }

                    const { executeOrder } = await import('./polymarket.js');
                    const tradeId = `auto_${alert.id}_${Date.now()}`;
                    const tradeParams = {
                      token_id: tokenId,
                      side: atc.side || (String(atc.action).toUpperCase() === 'SELL' ? 'SELL' : 'BUY'),
                      size: atc.size || atc.shares || 0,
                      price: atc.price || currentPrice,
                      market_question: alert.market_question || 'Auto-trade from alert',
                      order_type: 'GTC',
                    };
                    // Wrap edb for executeOrder compatibility (needs .query/.execute for Postgres)
                    const dbCompat = edb.query ? edb : { query: edb.all?.bind(edb), execute: edb.run?.bind(edb), run: edb.run?.bind(edb), get: edb.get?.bind(edb), all: edb.all?.bind(edb) };
                    console.log(`[watcher] Auto-executing trade for alert ${alert.id}: ${tradeParams.side} ${tradeParams.size} @ ${tradeParams.price}`);
                    const result = await executeOrder(alert.agent_id, dbCompat, tradeId, tradeParams, 'auto_alert');
                    evt.data = evt.data || {};
                    evt.data.auto_trade_result = result;
                    evt.summary += ` | Auto-trade: ${tradeParams.side} ${tradeParams.size} shares`;
                    console.log(`[watcher] Auto-trade result for alert ${alert.id}:`, JSON.stringify(result).slice(0, 200));
                  }
                } catch (atErr: any) {
                  console.error(`[watcher] Auto-trade failed for alert ${alert.id}:`, atErr.message);
                  evt.data = evt.data || {};
                  evt.data.auto_trade_error = atErr.message;
                }
              }

              // Update stored event with auto-trade result
              if (evt.data?.auto_trade_result || evt.data?.auto_trade_error) {
                await edb.run(
                  `UPDATE poly_watcher_events SET summary = ?, data = ? WHERE id = ?`,
                  [evt.summary, JSON.stringify(evt.data), evtId]
                ).catch(() => {});
              }

              // Mark alert as triggered BEFORE next tick can see it
              if (alert.repeat_alert) {
                await edb.run(`UPDATE poly_price_alerts SET base_price = ? WHERE id = ?`, [currentPrice, alert.id]);
              } else {
                await edb.run(`UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`, [alert.id]);
              }

              // Bracket order: cancel sibling (OCO — one-cancels-other)
              if (alert.bracket_group) {
                try {
                  const { cancelBracketSibling } = await import('./polymarket-runtime.js');
                  const dbCompat2 = edb.query ? edb : { query: edb.all?.bind(edb), execute: edb.run?.bind(edb), run: edb.run?.bind(edb), get: edb.get?.bind(edb), all: edb.all?.bind(edb) };
                  const cancelledId = await cancelBracketSibling(dbCompat2, alert.id, alert.bracket_group);
                  if (cancelledId) {
                    const role = alert.bracket_role === 'take_profit' ? 'Take-Profit' : 'Stop-Loss';
                    const siblingRole = alert.bracket_role === 'take_profit' ? 'Stop-Loss' : 'Take-Profit';
                    evt.summary += ` | ${role} hit → cancelled ${siblingRole} (${cancelledId})`;
                    log(`[bracket] ${role} fired (${alert.id}), cancelled ${siblingRole} (${cancelledId}) in group ${alert.bracket_group}`);
                  }
                } catch (bracketErr: any) {
                  log(`[bracket] Failed to cancel sibling for ${alert.id}: ${bracketErr.message}`);
                }

                // Cross-sync: deactivate exit rules for this token since bracket handled the exit
                try {
                  await edb.run(
                    `UPDATE poly_exit_rules SET status = 'bracket_exited' WHERE agent_id = ? AND token_id = ? AND status = 'active'`,
                    [alert.agent_id, alert.token_id]
                  );
                  log(`[bracket→exit] Deactivated exit rules for token ${alert.token_id} (bracket fired)`);
                } catch {}
              }

              // Cross-sync: even for non-bracket alerts that auto-sell, deactivate exit rules
              if (!alert.bracket_group && alert.auto_trade_config) {
                try {
                  const atc = typeof alert.auto_trade_config === 'string' ? JSON.parse(alert.auto_trade_config) : alert.auto_trade_config;
                  if (atc?.side === 'SELL' || atc?.action === 'SELL') {
                    await edb.run(
                      `UPDATE poly_exit_rules SET status = 'alert_exited' WHERE agent_id = ? AND token_id = ? AND status = 'active'`,
                      [alert.agent_id, alert.token_id]
                    );
                    log(`[alert→exit] Deactivated exit rules for token ${alert.token_id} (alert auto-sell fired)`);
                  }
                } catch {}
              }

              if (opts.onEvent) {
                try { opts.onEvent(alert.agent_id, evt); } catch {}
              }
            }
          } catch { /* skip individual alert failures */ }
        }
      } catch { /* alerts table may not exist yet */ }

      // Agent wake
      for (const [agentId, batch] of Object.entries(eventsByAgent)) {
        if (batch.maxSeverity === 'critical') {
          await _maybeSpawnAgent(agentId, batch.events, edb, opts, log);
        } else if (batch.maxSeverity === 'warning') {
          // Any warning signal wakes the agent — warnings only fire for position-relevant events
          await _maybeSpawnAgent(agentId, batch.events, edb, opts, log);
        }
      }

      // ── Check poly_exit_rules (trailing stops + time exits) ──
      // Exit rules complement bracket alerts: brackets handle fixed TP/SL,
      // exit rules handle trailing stops and time-based exits.
      // All systems cross-update each other when a trade fires.
      if (now - (_lastExitCheckMs || 0) < 60_000) { /* skip */ }
      else try {
        _lastExitCheckMs = now;
        const exitRules: any[] = await edb.all(
          `SELECT * FROM poly_exit_rules WHERE status = 'active'`
        ).catch(() => []) || [];

        for (const rule of exitRules) {
          try {
            // Fetch current price (reuse from alert cache if same tick)
            let currentPrice = priceCache?.[rule.token_id];
            if (currentPrice === undefined) {
              const mid = await fetch(`${CLOB_API}/midpoint?token_id=${rule.token_id}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
              currentPrice = parseFloat(mid?.mid || '0');
            }
            if (!currentPrice) {
              // Market may be resolved — check and clean up
              try {
                const marketInfo = await fetch(`${GAMMA_API}/markets?clob_token_ids=${rule.token_id}&limit=1`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).then(arr => Array.isArray(arr) ? arr[0] : arr).catch(() => null);
                if (marketInfo?.resolved || marketInfo?.closed || !marketInfo) {
                  await edb.run(`UPDATE poly_exit_rules SET status = 'market_resolved' WHERE id = ?`, [rule.id]);
                  log(`[exit-rules] Market resolved/closed — deactivated exit rule ${rule.id}`);
                }
              } catch {}
              continue;
            }

            // Update highest price for trailing stop
            if (currentPrice > (rule.highest_price || 0)) {
              await edb.run(`UPDATE poly_exit_rules SET highest_price = ? WHERE id = ?`, [currentPrice, rule.id]).catch(() => {});
            }

            let fireType = '';
            let fireReason = '';
            let sellPrice = currentPrice;

            // Check trailing stop
            if (rule.trailing_stop_pct && rule.highest_price) {
              const highestForTrail = Math.max(rule.highest_price, currentPrice);
              const trailPrice = highestForTrail * (1 - rule.trailing_stop_pct / 100);
              if (currentPrice <= trailPrice) {
                fireType = 'TRAILING_STOP';
                fireReason = `Price ${(currentPrice * 100).toFixed(1)}¢ dropped ${rule.trailing_stop_pct}% from high of ${(highestForTrail * 100).toFixed(1)}¢ (trail trigger: ${(trailPrice * 100).toFixed(1)}¢)`;
                sellPrice = currentPrice;
              }
            }

            // Check time exit
            if (!fireType && rule.time_exit) {
              const exitTime = new Date(rule.time_exit).getTime();
              if (Date.now() >= exitTime) {
                fireType = 'TIME_EXIT';
                fireReason = `Time-based exit triggered (deadline: ${rule.time_exit}). Current price: ${(currentPrice * 100).toFixed(1)}¢`;
                sellPrice = currentPrice;
              }
            }

            // Check TP/SL on exit rules too (legacy rules created before bracket system)
            if (!fireType && rule.take_profit && currentPrice >= rule.take_profit) {
              fireType = 'TAKE_PROFIT';
              fireReason = `Take-profit hit: ${(currentPrice * 100).toFixed(1)}¢ >= ${(rule.take_profit * 100).toFixed(1)}¢`;
              sellPrice = currentPrice;
            }
            if (!fireType && rule.stop_loss && currentPrice <= rule.stop_loss) {
              fireType = 'STOP_LOSS';
              fireReason = `Stop-loss hit: ${(currentPrice * 100).toFixed(1)}¢ <= ${(rule.stop_loss * 100).toFixed(1)}¢`;
              sellPrice = currentPrice;
            }

            if (fireType) {
              // Dedup check
              const recentDup = await edb.all(
                `SELECT id FROM poly_watcher_events WHERE watcher_id = ? AND created_at > ?`,
                ['exit_' + rule.id, dateAgoMin(5)]
              ).catch(() => []);
              if (recentDup && recentDup.length > 0) continue;

              log(`[exit-rules] ${fireType} fired for ${rule.token_id}: ${fireReason}`);

              // Auto-execute the sell
              let autoTradeResult: any = null;
              let autoTradeError: string | null = null;
              const sellSize = rule.position_size || 0;
              // Skip if market is resolved (price at extreme)
              if (sellSize > 0 && (currentPrice >= 0.99 || currentPrice <= 0.01)) {
                log(`[exit-rules] Skipping auto-sell for ${rule.id}: market resolved (price=${currentPrice}). Deactivating rule.`);
                await edb.run(`UPDATE poly_exit_rules SET status = 'cancelled' WHERE id = ?`, [rule.id]);
                continue;
              }
              if (sellSize > 0) {
                try {
                  const { executeOrder } = await import('./polymarket.js');
                  const tradeId = `exit_${rule.id}_${Date.now()}`;
                  const tradeParams = {
                    token_id: rule.token_id,
                    side: 'SELL',
                    size: sellSize,
                    price: sellPrice,
                    market_question: `Auto-exit (${fireType}) — ${fireReason}`,
                    order_type: 'GTC',
                  };
                  const dbCompat = edb.query ? edb : { query: edb.all?.bind(edb), execute: edb.run?.bind(edb), run: edb.run?.bind(edb), get: edb.get?.bind(edb), all: edb.all?.bind(edb) };
                  log(`[exit-rules] Auto-selling: ${sellSize} shares @ ${sellPrice}`);
                  autoTradeResult = await executeOrder(rule.agent_id, dbCompat, tradeId, tradeParams, 'auto_exit_' + fireType.toLowerCase());
                  log(`[exit-rules] Auto-sell result: ${JSON.stringify(autoTradeResult).slice(0, 200)}`);
                } catch (e: any) {
                  autoTradeError = e.message;
                  log(`[exit-rules] Auto-sell FAILED: ${e.message}`);
                }
              }

              // Mark exit rule as triggered
              await edb.run(`UPDATE poly_exit_rules SET status = 'triggered' WHERE id = ?`, [rule.id]);

              // ── Cross-system sync: cancel related bracket alerts for this token ──
              try {
                const relatedBrackets = await edb.all(
                  `SELECT id, bracket_group FROM poly_price_alerts WHERE agent_id = ? AND token_id = ? AND bracket_group IS NOT NULL AND triggered = 0`,
                  [rule.agent_id, rule.token_id]
                ).catch(() => []);
                if (relatedBrackets && relatedBrackets.length > 0) {
                  await edb.run(
                    `UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE agent_id = ? AND token_id = ? AND bracket_group IS NOT NULL AND triggered = 0`,
                    [rule.agent_id, rule.token_id]
                  );
                  log(`[exit-rules] Cross-cancelled ${relatedBrackets.length} bracket alert(s) for token ${rule.token_id}`);
                }
              } catch {}

              // ── Cross-system sync: cancel manual alerts for this token (non-bracket) ──
              try {
                await edb.run(
                  `UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE agent_id = ? AND token_id = ? AND bracket_group IS NULL AND triggered = 0 AND (condition = 'above' OR condition = 'below')`,
                  [rule.agent_id, rule.token_id]
                );
              } catch {}

              // Create event
              const evtId = crypto.randomUUID();
              const evt: WatcherEvent = {
                type: 'exit_triggered',
                severity: 'critical',
                title: `[EXIT ${fireType}] ${rule.token_id.slice(0, 16)}…`,
                summary: `${fireReason}${autoTradeResult ? ` | Auto-SELL: ${sellSize} shares` : ''}${autoTradeError ? ` | SELL FAILED: ${autoTradeError}` : ''}`,
                data: { exit_rule_id: rule.id, token_id: rule.token_id, fire_type: fireType, current_price: currentPrice, entry_price: rule.entry_price, auto_trade_result: autoTradeResult, auto_trade_error: autoTradeError },
              };
              await edb.run(
                `INSERT INTO poly_watcher_events (id, agent_id, watcher_id, type, severity, title, summary, data) VALUES (?,?,?,?,?,?,?,?)`,
                [evtId, rule.agent_id, 'exit_' + rule.id, evt.type, evt.severity, evt.title, evt.summary, JSON.stringify(evt.data)]
              );
              _engineEventCount++;

              if (!eventsByAgent[rule.agent_id]) eventsByAgent[rule.agent_id] = { events: [], maxSeverity: 'info' };
              eventsByAgent[rule.agent_id].events.push(evt);
              eventsByAgent[rule.agent_id].maxSeverity = 'critical';
            }
          } catch {} // skip individual rule failures
        }
      } catch {} // exit_rules table may not exist yet

      // Second agent wake pass — catches exit rule signals added after the first wake loop
      for (const [agentId, batch] of Object.entries(eventsByAgent)) {
        if (batch.maxSeverity === 'critical' || batch.maxSeverity === 'warning') {
          await _maybeSpawnAgent(agentId, batch.events, edb, opts, log);
        }
      }

      // ── Proactive trading loop — wake agent to find trades if goals unmet ──
      // Runs every 15 minutes. Checks daily trade count vs goal. If behind, wakes agent to trade.
      const PROACTIVE_INTERVAL_MS = 15 * 60_000;
      const proactiveElapsed = now - (_lastProactiveCheckMs || 0);
      if (proactiveElapsed >= PROACTIVE_INTERVAL_MS) {
        _lastProactiveCheckMs = now;
        try {
          // Get all agents with active watchers (they are traders)
          const traderAgents = [...new Set(watchers.map((w: any) => w.agent_id))];
          for (const agentId of traderAgents) {
            // Check today's trade count
            const todayTrades = await edb.get(
              `SELECT COUNT(*) as cnt FROM poly_trade_log WHERE agent_id = ? AND created_at > ?`,
              [agentId, dateAgo(24)]
            ).catch(() => ({ cnt: 0 }));
            const tradeCount = parseInt(todayTrades?.cnt || '0');

            // Check min daily trades goal
            const goal = await edb.get(
              `SELECT target_value FROM poly_goals WHERE type = 'min_trades_daily' AND enabled = 1`,
              []
            ).catch(() => null);
            const targetTrades = goal?.target_value || 15;

            // Check if user explicitly paused proactive wakes (said stop/abort)
            const pauseRow = await edb.get(
              `SELECT paused_at FROM poly_proactive_pause WHERE agent_id = ?`, [agentId]
            ).catch(() => null);
            if (pauseRow?.paused_at) {
              log(`[poly-watcher] Proactive: skipped agent ${agentId.slice(0,8)} — user paused at ${pauseRow.paused_at}`);
              continue;
            }

            // Check if agent is stopped via lifecycle
            const agentStateRow = await edb.get(
              `SELECT state FROM managed_agents WHERE id = ?`, [agentId]
            ).catch(() => null);
            if (agentStateRow?.state === 'stopped') {
              log(`[poly-watcher] Proactive: skipped agent ${agentId.slice(0,8)} — agent state is stopped`);
              continue;
            }

            // Wake agent via HTTP API if behind on trades
            if (tradeCount < targetTrades) {
              // ── Balance gate — don't wake if wallet can't afford minimum trade ──
              try {
                const walletRow = await edb.get(`SELECT address FROM poly_wallets WHERE agent_id = ?`, [agentId]).catch(() => null);
                if (walletRow?.address) {
                  const balRes = await fetch(`https://rpc.ankr.com/polygon`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', data: '0x70a08231000000000000000000000000' + walletRow.address.slice(2).toLowerCase() }, 'latest'] }),
                    signal: AbortSignal.timeout(5000),
                  });
                  const balData = await balRes.json();
                  const balUSDC = parseInt(balData?.result || '0', 16) / 1e6;
                  if (balUSDC < 5) {
                    log(`[poly-watcher] Proactive: skipped agent ${agentId.slice(0,8)} — balance $${balUSDC.toFixed(2)} < $5 minimum`);
                    continue; // Skip this agent — not enough to trade
                  }
                }
              } catch { /* balance check failed, proceed with wake anyway */ }
              const lastSpawn = _lastSpawnByAgent[agentId] || 0;
              if (now - lastSpawn >= SPAWN_COOLDOWN_MS) {
                // Look up agent's runtime port from managed_agents config.deployment.port
                const agentRow = await edb.get(
                  `SELECT config FROM managed_agents WHERE id = ?`, [agentId]
                ).catch(() => null);
                const agentConfig = typeof agentRow?.config === 'string' ? JSON.parse(agentRow.config) : agentRow?.config;
                const dep = agentConfig?.deployment;
                const port = dep?.port || dep?.config?.local?.port || 3101;
                const secret = process.env.AGENT_RUNTIME_SECRET || '';
                const wakeMsg = `[PROACTIVE TRADING CHECK] You have ${tradeCount}/${targetTrades} trades today — ${targetTrades - tradeCount} more needed.

MANDATORY SEQUENCE (do ALL of these IN ORDER before placing any new trades):

1. poly_watcher_events action=check — Check for unread signals first
2. poly_goals action=check — Review your performance targets
3. poly_drawdown_monitor action=check — Check portfolio-level risk. HALT if drawdown > 15%
4. poly_calibration — Review your prediction accuracy. Are you over/under-confident?
5. poly_pnl_attribution — Which strategies and categories are making/losing money?
6. poly_strategy_performance — Which strategies are actually profitable? Double down on winners.
7. poly_get_positions — Review all open positions, check P&L drift
8. poly_exit_strategy action=check — Check if any exit conditions triggered

ONLY AFTER completing the above analysis:
9. poly_screen_markets with strategies: high_volume, momentum, contested, closing_soon
10. poly_search_markets for sports: NBA, MLB, Premier League, Champions League, UFC
11. For EACH candidate: run poly_quick_analysis + poly_resolution_risk + poly_manipulation_detector
12. Use poly_kelly_criterion for position sizing — do NOT just buy random $5 positions
13. For orders > $50: use poly_scale_in (TWAP/VWAP), NOT market orders
14. For time-sensitive opportunities: use poly_sniper with trailing limits
15. Consider poly_hedge for correlated positions

QUALITY > QUANTITY. Each trade must have analysis backing it. No blind trades.`;


                // Determine the manager's preferred communication channel
                // Priority: telegram > whatsapp > google_chat > email
                // For email: agent will need to use its email tools (google workspace, microsoft, smtp)
                const messaging = agentConfig?.messagingChannels || {};
                const managerName = agentConfig?.manager?.name || agentConfig?.managerName || 'Manager';
                const managerEmail = agentConfig?.manager?.email || agentConfig?.managerEmail || '';
                let wakeSource = 'system'; // internal wake (no response channel needed)
                let wakeSenderId = 'watcher@system';
                let wakeSpaceId = 'watcher_proactive';
                const telegramChatId = messaging.telegram?.chatId
                  || messaging.telegram?.trustedChatIds?.[0]
                  || messaging.managerIdentity?.telegramId;
                if (telegramChatId) {
                  wakeSource = 'telegram';
                  wakeSenderId = telegramChatId;
                  wakeSpaceId = telegramChatId;
                } else if (messaging.whatsapp?.phoneNumber) {
                  wakeSource = 'whatsapp';
                  wakeSenderId = messaging.whatsapp.phoneNumber;
                  wakeSpaceId = messaging.whatsapp.phoneNumber;
                } else if (messaging.google_chat?.spaceId) {
                  wakeSource = 'google_chat';
                  wakeSenderId = managerEmail || 'watcher@system';
                  wakeSpaceId = messaging.google_chat.spaceId;
                } else if (managerEmail) {
                  // Email: wake with source='email' so agent knows to respond via email tools
                  wakeSource = 'email';
                  wakeSenderId = managerEmail;
                  wakeSpaceId = managerEmail;
                }

                try {
                  const resp = await fetch(`http://127.0.0.1:${port}/api/runtime/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
                    body: JSON.stringify({
                      source: wakeSource,
                      senderName: managerName,
                      senderEmail: wakeSenderId,
                      spaceName: 'DM',
                      spaceId: wakeSpaceId,
                      threadId: '',
                      isDM: true,
                      messageText: wakeMsg,
                      isManager: true,
                    }),
                    signal: AbortSignal.timeout(10000),
                  });
                  if (resp.ok) {
                    log(`[poly-watcher] Proactive trading: woke agent ${agentId.slice(0,8)} (${tradeCount}/${targetTrades} trades today)`);
                    _lastSpawnByAgent[agentId] = now;
                    // Sync state to 'running' so UI reflects actual status
                    await edb.run(
                      `UPDATE managed_agents SET state = 'running' WHERE id = ? AND state IN ('stopped', 'ready', 'error')`,
                      [agentId]
                    ).catch(() => {});
                  } else {
                    const body = await resp.text().catch(() => '');
                    log(`[poly-watcher] Proactive: wake failed (${resp.status}): ${body.slice(0, 200)}`);
                  }
                } catch (e: any) {
                  log(`[poly-watcher] Proactive: wake error: ${e.message}`);
                }
              }
            }
          }
        } catch {}
      }

      // Cleanup old acknowledged events (>7 days) and stale analysis cache (>24h)
      await edb.run(`DELETE FROM poly_watcher_events WHERE acknowledged = 1 AND created_at < ?`, [dateAgo(168)]).catch(() => {});
      await edb.run(`DELETE FROM poly_analysis_cache WHERE created_at < ?`, [dateAgo(24)]).catch(() => {});
      await edb.run(`DELETE FROM poly_signal_buffer WHERE expires_at < ?`, [new Date().toISOString()]).catch(() => {});
      // Cleanup triggered alerts older than 30 days
      await edb.run(`DELETE FROM poly_price_alerts WHERE triggered = 1 AND triggered_at < ?`, [dateAgo(720)]).catch(() => {});
    } catch (e: any) {
      // Engine tick error
    }
  }, TICK_MS);
}

async function _maybeSpawnAgent(agentId: string, events: WatcherEvent[], edb: any, opts: WatcherEngineOpts, log: any) {
  const getRuntime = opts.getRuntime;
  if (!getRuntime) return;

  const runtime = getRuntime();
  if (!runtime) return;

  // Respect user stop — don't spawn if proactive paused
  try {
    const pauseRow = await edb.get(`SELECT paused_at FROM poly_proactive_pause WHERE agent_id = ?`, [agentId]).catch(() => null);
    if (pauseRow?.paused_at) {
      log(`[poly-watcher] Spawn skipped for ${agentId.slice(0,8)} — user paused proactive at ${pauseRow.paused_at}`);
      return;
    }
  } catch {}

  const lastSpawn = _lastSpawnByAgent[agentId] || 0;
  const now = Date.now();
  if (now - lastSpawn < SPAWN_COOLDOWN_MS) {
    log(`[poly-watcher] Spawn cooldown for ${agentId} (${Math.ceil((SPAWN_COOLDOWN_MS - (now - lastSpawn)) / 1000)}s)`);
    return;
  }

  // Check active sessions
  try {
    const activeSessions = await runtime.listSessions?.(agentId, { status: 'active', limit: 1 });
    if (activeSessions && activeSessions.length > 0) {
      const sessionId = activeSessions[0].id;
      const msg = _buildWakeMessage(events);
      try {
        await runtime.sendMessage(sessionId, msg);
        log(`[poly-watcher] Sent ${events.length} signals to active session ${sessionId}`);
        _lastSpawnByAgent[agentId] = now;
        _spawnCount++;
      } catch (e: any) {
        log(`[poly-watcher] Failed to send to session: ${e.message}`);
      }
      return;
    }
  } catch {}

  // Spawn new session
  try {
    let orgId = 'default';
    if (opts.getAgentConfig) {
      const cfg = opts.getAgentConfig(agentId);
      if (cfg?.org_id) orgId = cfg.org_id;
    }

    const msg = _buildWakeMessage(events);
    const session = await runtime.spawnSession({ agentId, orgId, message: msg });

    _lastSpawnByAgent[agentId] = now;
    _spawnCount++;
    log(`[poly-watcher] [ALERT] Spawned session ${session.id} for ${agentId} — ${events.length} signals`);
    // Sync state to 'running' so UI reflects actual status
    await edb.run(
      `UPDATE managed_agents SET state = 'running' WHERE id = ? AND state IN ('stopped', 'ready', 'error')`,
      [agentId]
    ).catch(() => {});

    await edb.run(
      `INSERT INTO poly_watcher_events (id, agent_id, watcher_id, type, severity, title, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), agentId, null, 'agent_spawn', 'info',
        `Agent session spawned with ${events.length} signals`,
        `Session ${session.id}`,
        JSON.stringify({ sessionId: session.id, eventCount: events.length, events: events.slice(0, 5).map(e => e.title) })]
    ).catch(() => {});
  } catch (e: any) {
    log(`[poly-watcher] Spawn failed for ${agentId}: ${e.message}`);
  }
}

function _buildWakeMessage(events: WatcherEvent[]): string {
  const critical = events.filter(e => e.severity === 'critical');
  const warning = events.filter(e => e.severity === 'warning');
  const info = events.filter(e => e.severity === 'info');

  let msg = `[ALERT] WATCHER ALERT — ${events.length} signal${events.length > 1 ? 's' : ''} detected:\n\n`;

  // Check if any auto-trades were executed
  const autoTrades = events.filter(e => e.data?.auto_trade_result || e.data?.auto_trade_error);
  if (autoTrades.length > 0) {
    msg += `⚡ AUTO-TRADES EXECUTED (${autoTrades.length}):\n`;
    for (const e of autoTrades) {
      if (e.data?.auto_trade_result) {
        msg += `  ✅ ${e.title} — Trade placed. REVIEW THIS IMMEDIATELY.\n`;
      } else if (e.data?.auto_trade_error) {
        msg += `  ❌ ${e.title} — Trade FAILED: ${e.data.auto_trade_error}. Manual action needed.\n`;
      }
    }
    msg += `\nYou were woken because trades were auto-executed. IMPORTANT ACTIONS:\n`;
    msg += `1. Check positions with poly_get_positions and verify the trades are correct.\n`;
    msg += `2. Check your USDC balance — if you have idle cash from sells, REINVEST IT. Find new opportunities with poly_search_markets and deploy capital.\n`;
    msg += `3. Set up new bracket orders (TP/SL) for any new positions.\n\n`;
  }

  if (critical.length > 0) {
    msg += `CRITICAL (${critical.length}):\n`;
    for (const e of critical.slice(0, MAX_BATCH_EVENTS)) {
      msg += `  • ${e.title}${e.summary ? ' — ' + e.summary : ''}\n`;
      if (e.data?.reasoning) msg += `    AI Analysis: ${e.data.reasoning}\n`;
      if (e.data?.recommended_action) msg += `    Recommended: ${e.data.recommended_action}\n`;
    }
    msg += '\n';
  }
  if (warning.length > 0) {
    msg += `WARNING (${warning.length}):\n`;
    for (const e of warning.slice(0, MAX_BATCH_EVENTS)) {
      msg += `  • ${e.title}${e.summary ? ' — ' + e.summary : ''}\n`;
    }
    msg += '\n';
  }
  if (info.length > 0) {
    msg += `INFO (${info.length}):\n`;
    for (const e of info.slice(0, 3)) msg += `  • ${e.title}\n`;
    if (info.length > 3) msg += `  ... and ${info.length - 3} more\n`;
    msg += '\n';
  }

  // For news intelligence signals, add explicit market discovery instructions
  const hasNews = events.some(e => e.type === 'news_intelligence' || e.type === 'geopolitical');
  if (hasNews && !autoTrades.length) {
    msg += `\n📰 NEWS INTELLIGENCE DETECTED — ACTION REQUIRED:\n`;
    msg += `1. Read the headlines above carefully. Extract key topics, names, events.\n`;
    msg += `2. Use poly_search_markets to find Polymarket markets related to these headlines.\n`;
    msg += `3. For each relevant market: check the odds, assess if the news shifts probability, and evaluate if there's an edge.\n`;
    msg += `4. If you find a market with a clear edge (news makes an outcome more/less likely than current odds suggest), place a trade.\n`;
    msg += `5. Check your USDC balance with poly_get_balance — deploy idle cash into high-conviction opportunities.\n`;
    msg += `6. Information is power in prediction markets. Headlines that move real-world probabilities before the market prices them in = alpha.\n`;
    msg += `\nDo NOT just acknowledge this. RESEARCH and ACT on the intelligence.\n`;
  } else {
    msg += `\nRun poly_watcher_events action=check for full details. Assess and act.\n`;
    msg += `ALWAYS check your USDC balance — idle cash should be deployed into new positions. Money sitting is money wasted.\n`;
  }
  return msg;
}

function _stopFastLoop(log: any) {
  if (engineInterval) {
    clearInterval(engineInterval);
    engineInterval = null;
    log('[poly-watcher] No active watchers — paused (idle polling continues)');
  }
}

export function controlWatcherEngine(action: 'start' | 'stop') {
  const log = _engineOpts?.log || console.log;
  if (action === 'stop') {
    _stopFastLoop(log);
    if (idleInterval) { clearInterval(idleInterval); idleInterval = null; }
    log('[poly-watcher] Engine fully stopped');
  } else if (action === 'start' && _engineDb) {
    startWatcherEngine(_engineDb, _engineOpts || undefined);
  }
}

export function stopWatcherEngine() {
  if (engineInterval) { clearInterval(engineInterval); engineInterval = null; }
  if (idleInterval) { clearInterval(idleInterval); idleInterval = null; }
  _engineStartedAt = null;
}

// ─── Watcher Dispatchers ───────────────────────────────────────

async function runWatcher(type: string, config: any, agentId: string, edb: any): Promise<WatcherEvent[]> {
  switch (type) {
    case 'price_level': return checkPriceLevel(config);
    case 'price_change': return checkPriceChange(config, edb);
    case 'market_scan': return checkMarketScan(config, edb);
    case 'news_intelligence': return checkNewsIntelligence(config, agentId, edb);
    case 'news_monitor': return checkNewsIntelligence(config, agentId, edb); // Alias for backward compat
    case 'crypto_price': return checkCryptoPrice(config);
    case 'resolution_watch': return checkResolution(config);
    case 'portfolio_drift': return checkPortfolioDrift(config, agentId, edb);
    case 'volume_surge': return checkVolumeSurge(config, edb);
    case 'geopolitical': return checkGeopolitical(config, agentId, edb);
    case 'cross_signal': return checkCrossSignal(config, agentId, edb);
    case 'arbitrage_scan': return checkArbitrageScan(config);
    case 'sentiment_shift': return checkSentimentShift(config, agentId, edb);
    default: return [];
  }
}

// ─── Individual Watcher Implementations ────────────────────────

// ── PRICE LEVEL ──
async function checkPriceLevel(config: any): Promise<WatcherEvent[]> {
  const { token_id, direction, threshold, market_question } = config;
  if (!token_id || !threshold) return [];
  try {
    const res = await fetch(`${CLOB_API}/midpoint?token_id=${token_id}`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const price = parseFloat(data.mid || data.price || '0');
    if (!price) return [];

    const label = market_question || token_id.slice(0, 12) + '…';
    if (direction === 'above' && price >= threshold) {
      return [{ type: 'price_level', severity: 'warning', title: `[UP] ${label} crossed ${threshold}`,
        summary: `Current: ${price.toFixed(4)} (threshold: ${threshold})`,
        data: { token_id, price, threshold, direction } }];
    }
    if (direction === 'below' && price <= threshold) {
      return [{ type: 'price_level', severity: 'warning', title: `[DOWN] ${label} dropped below ${threshold}`,
        summary: `Current: ${price.toFixed(4)} (threshold: ${threshold})`,
        data: { token_id, price, threshold, direction } }];
    }
  } catch {}
  return [];
}

// ── PRICE CHANGE ──
async function checkPriceChange(config: any, edb: any): Promise<WatcherEvent[]> {
  const { token_id, pct_threshold, market_question } = config;
  if (!token_id || !pct_threshold) return [];
  try {
    const res = await fetch(`${CLOB_API}/midpoint?token_id=${token_id}`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const price = parseFloat(data.mid || data.price || '0');
    if (!price) return [];

    const cached = await edb.get(`SELECT * FROM poly_price_cache WHERE token_id = ?`, [token_id]);
    await edb.run(
      `INSERT INTO poly_price_cache (token_id, price, prev_price, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(token_id) DO UPDATE SET prev_price = price, price = ?, updated_at = CURRENT_TIMESTAMP`,
      [token_id, price, cached?.price || price, price]
    );

    if (cached?.price && cached.price > 0) {
      const changePct = ((price - cached.price) / cached.price) * 100;
      if (Math.abs(changePct) >= pct_threshold) {
        const label = market_question || token_id.slice(0, 12) + '…';
        return [{ type: 'price_change', severity: Math.abs(changePct) >= pct_threshold * 2 ? 'critical' : 'warning',
          title: `${changePct > 0 ? '[UP]' : '[DOWN]'} ${label} moved ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%`,
          summary: `${cached.price.toFixed(4)} → ${price.toFixed(4)}`,
          data: { token_id, price, prev_price: cached.price, change_pct: changePct } }];
      }
    }
  } catch {}
  return [];
}

// ── MARKET SCAN ──
async function checkMarketScan(config: any, edb: any): Promise<WatcherEvent[]> {
  const { keywords, min_volume, min_liquidity } = config;
  if (!keywords || !keywords.length) return [];
  try {
    const q = encodeURIComponent(keywords.join(' '));
    const res = await fetch(`${GAMMA_API}/markets?closed=false&limit=10&order=volume24hr&ascending=false&search=${q}`, { signal: AbortSignal.timeout(8000) });
    const markets: any[] = await res.json();
    const events: WatcherEvent[] = [];

    for (const m of markets.slice(0, 5)) {
      if (min_volume && (m.volume24hr || 0) < min_volume) continue;
      if (min_liquidity && (m.liquidityClob || 0) < min_liquidity) continue;

      const existing = await edb.get(
        `SELECT id FROM poly_watcher_events WHERE type = 'market_scan' AND data LIKE ? AND created_at > ?`,
        ['%' + m.conditionId + '%', dateAgo(24)]
      ).catch(() => null);
      if (existing) continue;

      events.push({ type: 'market_scan', severity: 'info',
        title: `[SCAN] New market: ${m.question?.slice(0, 80)}`,
        summary: `Volume: $${(m.volume24hr || 0).toFixed(0)} | Liquidity: $${(m.liquidityClob || 0).toFixed(0)}`,
        data: { condition_id: m.conditionId, question: m.question, volume: m.volume24hr, liquidity: m.liquidityClob }
      });
    }
    return events;
  } catch {}
  return [];
}

// ── NEWS INTELLIGENCE (AI-powered) ──
async function checkNewsIntelligence(config: any, agentId: string, edb: any): Promise<WatcherEvent[]> {
  const { keywords, sources, watched_markets } = config;
  if (!keywords || !keywords.length) return [];

  try {
    // Fetch news from multiple sources in parallel
    const newsPromises: Promise<{ title: string; source: string; url: string; date?: string }[]>[] = [];

    // Google News RSS
    const q = encodeURIComponent(keywords.join(' OR '));
    newsPromises.push(
      fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.text())
        .then(xml => {
          const items = xml.split('<item>').slice(1, 8);
          return items.map(item => {
            const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            const pubMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
            return {
              title: titleMatch?.[1] || titleMatch?.[2] || '',
              source: 'Google News',
              url: linkMatch?.[1] || '',
              date: pubMatch?.[1] || '',
            };
          }).filter(n => n.title);
        })
        .catch(() => [])
    );

    // AP News RSS
    newsPromises.push(
      fetch('https://rsshub.app/apnews/topics/world-news', { signal: AbortSignal.timeout(8000) })
        .then(r => r.text())
        .then(xml => {
          const items = xml.split('<item>').slice(1, 6);
          return items.map(item => {
            const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            return { title: titleMatch?.[1] || titleMatch?.[2] || '', source: 'AP News', url: linkMatch?.[1] || '' };
          }).filter(n => n.title);
        })
        .catch(() => [])
    );

    // Reuters RSS
    newsPromises.push(
      fetch('https://rsshub.app/reuters/world', { signal: AbortSignal.timeout(8000) })
        .then(r => r.text())
        .then(xml => {
          const items = xml.split('<item>').slice(1, 6);
          return items.map(item => {
            const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            return { title: titleMatch?.[1] || titleMatch?.[2] || '', source: 'Reuters', url: linkMatch?.[1] || '' };
          }).filter(n => n.title);
        })
        .catch(() => [])
    );

    const allNews = (await Promise.all(newsPromises)).flat();
    if (allNews.length === 0) return [];

    // Filter by age (6h) and keyword relevance
    const now = Date.now();
    const relevant = allNews.filter(n => {
      if (n.date) {
        const age = now - new Date(n.date).getTime();
        if (age > 6 * 60 * 60 * 1000) return false;
      }
      const lower = n.title.toLowerCase();
      return keywords.some((k: string) => lower.includes(k.toLowerCase()));
    });

    if (relevant.length === 0) return [];

    // Deduplicate by checking if headline title already appeared in recent events
    const fresh: typeof relevant = [];
    for (const n of relevant) {
      // Use first 50 chars of title as dedup key — escape LIKE wildcards but preserve apostrophes/quotes
      // (parameterized queries handle SQL injection; we only need to escape LIKE special chars)
      const titleKey = n.title.slice(0, 50).replace(/[%_\\]/g, '\\$&');
      const existing = await edb.get(
        `SELECT id FROM poly_watcher_events WHERE agent_id = ? AND title LIKE ? AND created_at > ?`,
        [agentId, '%' + titleKey + '%', dateAgo(6)]
      ).catch(() => null);
      if (!existing) fresh.push(n);
    }

    if (fresh.length === 0) return [];

    // AI Analysis — this is where intelligence happens
    const analysis = await analyzeWithAI(
      `Recent headlines relevant to prediction markets:\n${fresh.map(n => `- ${n.title} (${n.source})`).join('\n')}`,
      { watchedMarkets: watched_markets },
      agentId, edb
    );

    if (analysis) _engineAnalysisCount++;

    const events: WatcherEvent[] = [];
    const impactToSeverity: Record<string, 'info' | 'warning' | 'critical'> = {
      none: 'info', low: 'info', medium: 'warning', high: 'warning', critical: 'critical'
    };

    let severity: 'info' | 'warning' | 'critical' = analysis ? impactToSeverity[analysis.impact] || 'info' : 'info';

    // If AI says impact is none, only emit as info
    if (analysis && analysis.impact === 'none') {
      return []; // Skip non-impactful news
    }

    // Position-aware escalation: if headlines mention terms from watched_markets, escalate to warning minimum
    if (severity === 'info' && watched_markets?.length) {
      const headlineText = fresh.map(n => n.title.toLowerCase()).join(' ');
      const positionKeywords = ['iran', 'invade', 'invasion', 'military', 'troops', 'nfl', 'bills', 'saints', 'eu', 'withdraw', 'gta', 'milan', 'inter'];
      const matches = positionKeywords.filter(k => headlineText.includes(k));
      if (matches.length > 0) {
        severity = 'warning';
      }
    }

    events.push({
      type: 'news_intelligence',
      severity,
      title: `[NEWS] ${fresh[0].title.slice(0, 80)}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''}`,
      summary: analysis
        ? `AI Impact: ${analysis.impact.toUpperCase()} | Sentiment: ${analysis.sentiment > 0 ? '+' : ''}${analysis.sentiment.toFixed(2)} | ${analysis.reasoning}`
        : `${fresh.length} relevant headlines found. Keywords: ${keywords.join(', ')}`,
      data: {
        headlines: fresh.slice(0, 5).map(n => ({ title: n.title, source: n.source, url: n.url })),
        content_hash: hashContent(fresh.map(n => n.title).join('|')),
        ...(analysis || {}),
      }
    });

    // Buffer signal for cross-correlation
    if (analysis && analysis.impact !== 'none') {
      await edb.run(
        `INSERT INTO poly_signal_buffer (id, agent_id, signal_type, topic, data, sentiment, impact, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), agentId, 'news', keywords.join(','), JSON.stringify({ headlines: fresh.slice(0, 3).map(n => n.title), analysis }), analysis.sentiment, analysis.impact, dateAhead(2)]
      ).catch(() => {});
    }

    return events;
  } catch {}
  return [];
}

// ── GEOPOLITICAL SCANNER (AI-powered) ──
async function checkGeopolitical(config: any, agentId: string, edb: any): Promise<WatcherEvent[]> {
  const { regions, topics, watched_markets } = config;
  const searchTerms = [
    ...(regions || ['us', 'china', 'russia', 'ukraine', 'iran', 'israel', 'north korea']),
    ...(topics || ['sanctions', 'military', 'trade war', 'election', 'tariff', 'nato', 'diplomacy']),
  ];

  try {
    // Fetch geopolitical news from multiple angles
    const queries = [
      searchTerms.slice(0, 4).join(' OR '),
      'geopolitics ' + (regions || ['world']).join(' '),
      'breaking international ' + (topics || ['conflict']).join(' '),
    ];

    const allHeadlines: { title: string; source?: string; url?: string; date?: string }[] = [];

    for (const query of queries) {
      try {
        const q = encodeURIComponent(query);
        const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        const items = xml.split('<item>').slice(1, 6);
        for (const item of items) {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
          const pubMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          const headline = titleMatch?.[1] || titleMatch?.[2] || '';
          if (!headline) continue;
          // Skip old news
          if (pubMatch?.[1]) {
            const age = Date.now() - new Date(pubMatch[1]).getTime();
            if (age > 12 * 60 * 60 * 1000) continue;
          }
          allHeadlines.push({ title: headline, source: 'Google News', date: pubMatch?.[1] });
        }
      } catch {}
    }

    if (allHeadlines.length === 0) return [];

    // Deduplicate
    const seen = new Set<string>();
    const unique = allHeadlines.filter(h => {
      const key = h.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Get watched market topics for context
    const watcherTopics = watched_markets || [];
    const positions = await edb.all(
      `SELECT DISTINCT market_question FROM poly_paper_positions WHERE agent_id = ? AND closed = 0`, [agentId]
    ).catch(() => []) || [];
    const positionTopics = positions.map((p: any) => p.market_question).filter(Boolean);

    // AI geopolitical analysis
    const analysis = await analyzeGeopolitical(
      unique.slice(0, 10),
      [...watcherTopics, ...positionTopics],
      agentId, edb
    );

    if (!analysis || analysis.impact === 'none' || analysis.impact === 'low') return [];
    _engineAnalysisCount++;

    const impactToSeverity: Record<string, 'info' | 'warning' | 'critical'> = {
      medium: 'warning', high: 'warning', critical: 'critical'
    };

    // Buffer for cross-correlation
    await edb.run(
      `INSERT INTO poly_signal_buffer (id, agent_id, signal_type, topic, data, sentiment, impact, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), agentId, 'geopolitical', (regions || ['world']).join(','),
        JSON.stringify({ headlines: unique.slice(0, 5).map(h => h.title), analysis }),
        analysis.sentiment, analysis.impact, dateAhead(4)]
    ).catch(() => {});

    return [{
      type: 'geopolitical',
      severity: impactToSeverity[analysis.impact] || 'warning',
      title: `[GEO] Geopolitical: ${analysis.predicted_outcome?.slice(0, 80) || 'Significant development detected'}`,
      summary: `Impact: ${analysis.impact.toUpperCase()} | ${analysis.reasoning}`,
      data: {
        headlines: unique.slice(0, 5).map(h => h.title),
        ...analysis,
      }
    }];
  } catch {}
  return [];
}

// ── CROSS-SIGNAL CORRELATION (AI-powered) ──
async function checkCrossSignal(config: any, agentId: string, edb: any): Promise<WatcherEvent[]> {
  const { min_signals, correlation_window_hours } = config;
  const minSignals = min_signals || 3;
  const windowHours = correlation_window_hours || 2;

  try {
    // Get recent signals from buffer
    const signals = await edb.all(
      `SELECT * FROM poly_signal_buffer WHERE agent_id = ? AND created_at > ? ORDER BY created_at DESC`,
      [agentId, dateAgo(windowHours)]
    ) || [];

    if (signals.length < minSignals) return [];

    // Check if we already correlated these signals recently
    const signalIds = signals.map((s: any) => s.id).sort().join(',');
    const hash = hashContent(signalIds);
    const existing = await edb.get(
      `SELECT id FROM poly_watcher_events WHERE agent_id = ? AND type = 'cross_signal' AND data LIKE ? AND created_at > ?`,
      [agentId, '%' + hash + '%', dateAgo(1)]
    ).catch(() => null);
    if (existing) return [];

    // AI correlation analysis
    const signalSummaries = signals.map((s: any) => {
      const data = JSON.parse(s.data || '{}');
      return {
        type: s.signal_type,
        topic: s.topic,
        sentiment: s.sentiment,
        impact: s.impact,
        summary: data.analysis?.reasoning || data.headlines?.join('; ') || s.topic,
      };
    });

    const analysis = await analyzeSignalCorrelation(signalSummaries, agentId, edb);
    if (!analysis || analysis.impact === 'none' || analysis.impact === 'low') return [];
    _engineAnalysisCount++;

    const impactToSeverity: Record<string, 'info' | 'warning' | 'critical'> = {
      medium: 'warning', high: 'critical', critical: 'critical'
    };

    return [{
      type: 'cross_signal',
      severity: impactToSeverity[analysis.impact] || 'warning',
      title: `[CORR] Signal convergence: ${signals.length} correlated signals`,
      summary: `Impact: ${analysis.impact.toUpperCase()} | ${analysis.reasoning}`,
      data: {
        signal_count: signals.length,
        signal_types: [...new Set(signals.map((s: any) => s.signal_type))],
        correlation_hash: hash,
        ...analysis,
      }
    }];
  } catch {}
  return [];
}

// ── SENTIMENT SHIFT (AI-powered) ──
async function checkSentimentShift(config: any, agentId: string, edb: any): Promise<WatcherEvent[]> {
  const { topic, keywords, shift_threshold } = config;
  if (!topic && (!keywords || !keywords.length)) return [];
  const threshold = shift_threshold || 0.3;
  const searchTopic = topic || keywords.join(' ');

  try {
    // Fetch recent headlines for sentiment
    const q = encodeURIComponent(searchTopic);
    const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const items = xml.split('<item>').slice(1, 8);
    const headlines: string[] = [];

    for (const item of items) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const pubMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const headline = titleMatch?.[1] || titleMatch?.[2] || '';
      if (!headline) continue;
      if (pubMatch?.[1]) {
        const age = Date.now() - new Date(pubMatch[1]).getTime();
        if (age > 12 * 60 * 60 * 1000) continue;
      }
      headlines.push(headline);
    }

    if (headlines.length === 0) return [];

    // AI sentiment analysis
    const analysis = await analyzeWithAI(
      `Analyze overall sentiment for "${searchTopic}" based on these headlines:\n${headlines.map(h => `- ${h}`).join('\n')}\n\nFocus on: Is sentiment shifting? Which direction? How fast?`,
      { topic: searchTopic },
      agentId, edb
    );

    if (!analysis) return [];
    _engineAnalysisCount++;

    // Compare with previous sentiment
    const prevSentiment = await edb.get(
      `SELECT sentiment, created_at FROM poly_sentiment_history WHERE agent_id = ? AND topic = ? ORDER BY created_at DESC LIMIT 1`,
      [agentId, searchTopic]
    ).catch(() => null);

    // Store current sentiment
    await edb.run(
      `INSERT INTO poly_sentiment_history (id, agent_id, topic, sentiment, confidence, source, analysis) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), agentId, searchTopic, analysis.sentiment, analysis.confidence, 'news', analysis.reasoning]
    ).catch(() => {});

    if (!prevSentiment) return []; // Need baseline first

    const shift = Math.abs(analysis.sentiment - prevSentiment.sentiment);
    if (shift < threshold) return [];

    const direction = analysis.sentiment > prevSentiment.sentiment ? 'positive' : 'negative';

    // Buffer for cross-correlation
    await edb.run(
      `INSERT INTO poly_signal_buffer (id, agent_id, signal_type, topic, data, sentiment, impact, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), agentId, 'sentiment_shift', searchTopic,
        JSON.stringify({ prev: prevSentiment.sentiment, current: analysis.sentiment, shift, direction, analysis }),
        analysis.sentiment, shift >= threshold * 2 ? 'high' : 'medium', dateAhead(2)]
    ).catch(() => {});

    return [{
      type: 'sentiment_shift',
      severity: shift >= threshold * 2 ? 'critical' : 'warning',
      title: `${direction === 'positive' ? '[UP]' : '[DOWN]'} Sentiment shift on "${searchTopic}": ${direction} (${shift > 0 ? '+' : ''}${shift.toFixed(2)})`,
      summary: `${prevSentiment.sentiment.toFixed(2)} → ${analysis.sentiment.toFixed(2)} | ${analysis.reasoning}`,
      data: {
        topic: searchTopic,
        prev_sentiment: prevSentiment.sentiment,
        current_sentiment: analysis.sentiment,
        shift,
        direction,
        ...analysis,
      }
    }];
  } catch {}
  return [];
}

// ── CRYPTO PRICE ──
async function checkCryptoPrice(config: any): Promise<WatcherEvent[]> {
  const { symbols, pct_threshold } = config;
  const coins = symbols || ['bitcoin', 'ethereum'];
  const threshold = pct_threshold || 3;

  try {
    if (Date.now() - lastCryptoFetch < 120_000 && Object.keys(cryptoCache).length > 0) return [];

    const ids = coins.join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    lastCryptoFetch = Date.now();

    const events: WatcherEvent[] = [];
    for (const coin of coins) {
      const info = data[coin];
      if (!info) continue;
      const price = info.usd;
      const change = info.usd_24h_change || 0;
      const prev = cryptoCache[coin];
      cryptoCache[coin] = { price, change_24h: change };

      if (prev && Math.abs(change) >= threshold) {
        events.push({ type: 'crypto_price', severity: Math.abs(change) >= threshold * 2 ? 'critical' : 'warning',
          title: `${change > 0 ? '[UP]' : '[DOWN]'} ${coin.toUpperCase()} ${change > 0 ? '+' : ''}${change.toFixed(1)}% (24h)`,
          summary: `$${price.toLocaleString()} | Threshold: ±${threshold}%`,
          data: { coin, price, change_24h: change }
        });
      }
    }
    return events;
  } catch {}
  return [];
}

// ── RESOLUTION WATCH ──
async function checkResolution(config: any): Promise<WatcherEvent[]> {
  const { hours_before, categories } = config;
  const hoursThreshold = hours_before || 48;
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000).toISOString();
    let url = `${GAMMA_API}/markets?closed=false&end_date_max=${cutoff}&limit=10&order=endDate&ascending=true`;
    if (categories?.length) url += '&tag=' + categories[0];

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const markets: any[] = await res.json();
    const events: WatcherEvent[] = [];

    for (const m of markets.slice(0, 5)) {
      if (!m.endDate) continue;
      const hoursLeft = (new Date(m.endDate).getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hoursLeft < 0 || hoursLeft > hoursThreshold) continue;

      events.push({ type: 'resolution_watch', severity: hoursLeft < 6 ? 'critical' : hoursLeft < 24 ? 'warning' : 'info',
        title: `[TIME] Resolving in ${hoursLeft < 1 ? Math.round(hoursLeft * 60) + 'm' : Math.round(hoursLeft) + 'h'}: ${m.question?.slice(0, 80)}`,
        summary: `End: ${new Date(m.endDate).toLocaleString()}`,
        data: { condition_id: m.conditionId, question: m.question, end_date: m.endDate, hours_left: hoursLeft }
      });
    }
    return events;
  } catch {}
  return [];
}

// ── PORTFOLIO DRIFT ──
async function checkPortfolioDrift(config: any, agentId: string, edb: any): Promise<WatcherEvent[]> {
  const { pnl_threshold_pct, pnl_threshold_usd } = config;
  if (!pnl_threshold_pct && !pnl_threshold_usd) return [];
  try {
    const positions: any[] = await edb.all(
      `SELECT * FROM poly_paper_positions WHERE agent_id = ? AND closed = 0`, [agentId]
    ) || [];
    if (positions.length === 0) return [];

    let totalInvested = 0, totalPnl = 0;
    for (const p of positions) {
      totalInvested += (p.entry_price || 0) * (p.size || 0);
      totalPnl += p.pnl || 0;
    }

    const driftPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    if (pnl_threshold_pct && Math.abs(driftPct) >= pnl_threshold_pct) {
      return [{ type: 'portfolio_drift', severity: driftPct < 0 ? 'critical' : 'warning',
        title: `${driftPct < 0 ? '[LOSS]' : '[GAIN]'} Portfolio ${driftPct > 0 ? '+' : ''}${driftPct.toFixed(1)}% drift`,
        summary: `P&L: $${totalPnl.toFixed(2)} across ${positions.length} positions`,
        data: { total_pnl: totalPnl, drift_pct: driftPct, position_count: positions.length } }];
    }
    if (pnl_threshold_usd && Math.abs(totalPnl) >= pnl_threshold_usd) {
      return [{ type: 'portfolio_drift', severity: totalPnl < 0 ? 'critical' : 'warning',
        title: `${totalPnl < 0 ? '[LOSS]' : '[GAIN]'} Portfolio P&L hit $${Math.abs(totalPnl).toFixed(2)}`,
        summary: `Threshold: $${pnl_threshold_usd} | Positions: ${positions.length}`,
        data: { total_pnl: totalPnl, threshold: pnl_threshold_usd } }];
    }
  } catch {}
  return [];
}

// ── VOLUME SURGE ──
async function checkVolumeSurge(config: any, edb: any): Promise<WatcherEvent[]> {
  const { token_id, surge_multiplier, market_question } = config;
  if (!token_id) return [];
  const multiplier = surge_multiplier || 3;
  try {
    const res = await fetch(`${GAMMA_API}/markets?condition_id=${token_id}&limit=1`, { signal: AbortSignal.timeout(5000) });
    const markets: any[] = await res.json();
    const m = markets?.[0];
    if (!m) return [];

    const vol = m.volume24hr || 0;
    const cached = await edb.get(`SELECT * FROM poly_price_cache WHERE token_id = ?`, [token_id]);
    const prevVol = cached?.volume_24h || 0;

    await edb.run(
      `INSERT INTO poly_price_cache (token_id, price, volume_24h, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(token_id) DO UPDATE SET volume_24h = ?, updated_at = CURRENT_TIMESTAMP`,
      [token_id, m.outcomePrices ? JSON.parse(m.outcomePrices)[0] : 0, vol, vol]
    );

    if (prevVol > 0 && vol >= prevVol * multiplier) {
      const label = market_question || m.question?.slice(0, 60) || token_id.slice(0, 12);
      return [{ type: 'volume_surge', severity: 'warning',
        title: `[VOL] Volume surge on ${label}: ${(vol / prevVol).toFixed(1)}x`,
        summary: `$${prevVol.toFixed(0)} → $${vol.toFixed(0)} (${multiplier}x threshold)`,
        data: { token_id, volume: vol, prev_volume: prevVol, multiplier: vol / prevVol } }];
    }
  } catch {}
  return [];
}

// ── ARBITRAGE SCAN ──
async function checkArbitrageScan(config: any): Promise<WatcherEvent[]> {
  const { min_edge_pct, categories } = config;
  const minEdge = min_edge_pct || 2;
  try {
    let url = `${GAMMA_API}/markets?closed=false&limit=20&order=volume24hr&ascending=false`;
    if (categories?.length) url += '&tag=' + categories[0];
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const markets: any[] = await res.json();
    const events: WatcherEvent[] = [];

    for (const m of markets) {
      if (!m.outcomePrices) continue;
      try {
        const prices = JSON.parse(m.outcomePrices);
        const sum = prices.reduce((s: number, p: number) => s + p, 0);
        const edge = Math.abs(1 - sum) * 100;
        if (edge >= minEdge) {
          events.push({ type: 'arbitrage_scan', severity: edge >= minEdge * 2 ? 'warning' : 'info',
            title: `[ARB] Arbitrage: ${edge.toFixed(1)}% edge on ${m.question?.slice(0, 60)}`,
            summary: `Outcome prices sum: ${sum.toFixed(4)} (ideal: 1.0000)`,
            data: { condition_id: m.conditionId, question: m.question, prices, edge_pct: edge }
          });
        }
      } catch {}
    }
    return events.slice(0, 3);
  } catch {}
  return [];
}

// ─── Agent Tools ───────────────────────────────────────────────

export function createWatcherTools(deps: { db: any; agentId: string }) {
  return [
    {
      name: 'poly_watcher',
      description: 'Manage automated market monitors with AI-powered analysis. Create watchers that run 24/7, analyze news with LLM intelligence, detect geopolitical patterns, and generate actionable signals.\n\nActions:\n- create: Set up a new watcher\n- list: View all watchers\n- delete: Remove a watcher\n- pause/resume: Toggle watcher\n\nTypes:\n- price_level: Alert when token price crosses threshold\n- price_change: Alert on % price movement\n- market_scan: Discover new markets matching keywords\n- news_intelligence: AI-analyzed news with market impact assessment\n- crypto_price: BTC/ETH price tracker\n- resolution_watch: Markets approaching resolution\n- portfolio_drift: P&L exceeds threshold\n- volume_surge: Unusual volume detection\n- geopolitical: AI scans geopolitical developments, predicts market impact\n- cross_signal: AI correlates multiple signals to detect emerging patterns\n- arbitrage_scan: Cross-market mispricing\n- sentiment_shift: Tracks sentiment changes over time with AI',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'delete', 'pause', 'resume'], description: 'Action to perform' },
          id: { type: 'string', description: 'Watcher ID (for delete/pause/resume)' },
          watcher_type: { type: 'string', enum: ['price_level', 'price_change', 'market_scan', 'news_intelligence', 'crypto_price', 'resolution_watch', 'portfolio_drift', 'volume_surge', 'geopolitical', 'cross_signal', 'arbitrage_scan', 'sentiment_shift'], description: 'Type of watcher' },
          name: { type: 'string', description: 'Friendly name for the watcher' },
          config: { type: 'object', description: 'Watcher configuration (varies by type)' },
          interval_minutes: { type: 'number', description: 'Check interval in minutes' },
        },
        required: ['action'],
      },
      handler: async (args: any) => {
        const edb = deps.db.getEngineDB?.();
        if (!edb) return { error: 'Database not available' };

        if (args.action === 'list') {
          const rows = await edb.all(`SELECT * FROM poly_watchers WHERE agent_id = ? ORDER BY created_at DESC`, [deps.agentId]) || [];
          return { watchers: rows.map((r: any) => ({ ...r, config: JSON.parse(r.config || '{}') })) };
        }

        if (args.action === 'create') {
          if (!args.watcher_type) return { error: 'watcher_type required' };
          const defaultIntervals: Record<string, number> = {
            price_level: 30000, price_change: 60000, market_scan: 300000,
            news_intelligence: 300000, crypto_price: 120000, resolution_watch: 900000,
            portfolio_drift: 60000, volume_surge: 300000, geopolitical: 600000,
            cross_signal: 300000, arbitrage_scan: 600000, sentiment_shift: 900000,
          };
          const intervalMs = args.interval_minutes ? args.interval_minutes * 60000 : (defaultIntervals[args.watcher_type] || 60000);
          const id = crypto.randomUUID();
          await edb.run(
            `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, deps.agentId, args.watcher_type, args.name || args.watcher_type, JSON.stringify(args.config || {}), intervalMs]
          );

          const needsAI = ['news_intelligence', 'geopolitical', 'cross_signal', 'sentiment_shift'].includes(args.watcher_type);
          let aiNote = '';
          if (needsAI) {
            const aiCfg = await getAIConfig(deps.agentId, edb);
            if (!aiCfg) {
              aiNote = '\n⚠️ AI analysis NOT configured. This watcher requires an AI model. Run poly_watcher_config to set up a model (e.g., Grok for real-time X/Twitter intelligence, GPT-4o-mini for cheap analysis).';
            }
          }

          return { success: true, id, interval_seconds: intervalMs / 1000, requires_ai: needsAI, message: `Watcher '${args.name || args.watcher_type}' created.${aiNote}` };
        }

        if (args.action === 'delete') {
          if (!args.id) return { error: 'id required' };
          await edb.run(`DELETE FROM poly_watchers WHERE id = ? AND agent_id = ?`, [args.id, deps.agentId]);
          return { success: true };
        }

        if (args.action === 'pause' || args.action === 'resume') {
          if (!args.id) return { error: 'id required' };
          await edb.run(`UPDATE poly_watchers SET status = ? WHERE id = ? AND agent_id = ?`,
            [args.action === 'pause' ? 'paused' : 'active', args.id, deps.agentId]);
          return { success: true, status: args.action === 'pause' ? 'paused' : 'active' };
        }

        return { error: 'Unknown action: ' + args.action };
      },
    },
    {
      name: 'poly_watcher_config',
      description: 'Configure the AI model used for background market analysis. The watcher engine uses a separate, cheap model for continuous intelligence gathering.\n\nRecommended models:\n- xai/grok-3-mini: Best for real-time analysis (has X/Twitter access)\n- openai/gpt-4o-mini: Cheap, fast, good general analysis\n- groq/llama-3.3-70b-versatile: Free tier available, fast\n- deepseek/deepseek-chat: Very cheap, good reasoning\n\nActions:\n- get: View current config\n- set: Update config\n- stats: View analysis budget usage',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'stats'], description: 'Action to perform' },
          ai_provider: { type: 'string', enum: ['xai', 'openai', 'groq', 'cerebras', 'together', 'openrouter', 'deepseek', 'fireworks'], description: 'AI provider' },
          ai_model: { type: 'string', description: 'Model ID (e.g., grok-3-mini, gpt-4o-mini, llama-3.3-70b-versatile)' },
          ai_api_key: { type: 'string', description: 'API key for the AI provider' },
          analysis_budget_daily: { type: 'number', description: 'Max AI analysis calls per day (default: 100)' },
          max_spawn_per_hour: { type: 'number', description: 'Max agent session spawns per hour (default: 6)' },
        },
        required: ['action'],
      },
      handler: async (args: any) => {
        const edb = deps.db.getEngineDB?.();
        if (!edb) return { error: 'Database not available' };

        if (args.action === 'get') {
          const cfg = await edb.get(`SELECT * FROM poly_watcher_config WHERE agent_id = ?`, [deps.agentId]);
          if (!cfg) return { configured: false, message: 'No AI config set. Run poly_watcher_config action=set to configure a model for background analysis.' };
          return {
            configured: true,
            provider: cfg.ai_provider,
            model: cfg.ai_model,
            has_api_key: !!cfg.ai_api_key,
            budget_daily: cfg.analysis_budget_daily,
            used_today: cfg.analysis_count_today,
            remaining_today: (cfg.analysis_budget_daily || 100) - (cfg.analysis_count_today || 0),
            max_spawn_per_hour: cfg.max_spawn_per_hour,
          };
        }

        if (args.action === 'set') {
          const existing = await edb.get(`SELECT * FROM poly_watcher_config WHERE agent_id = ?`, [deps.agentId]);
          if (existing) {
            const updates: string[] = [];
            const vals: any[] = [];
            if (args.ai_provider) { updates.push('ai_provider = ?'); vals.push(args.ai_provider); }
            if (args.ai_model) { updates.push('ai_model = ?'); vals.push(args.ai_model); }
            if (args.ai_api_key) { updates.push('ai_api_key = ?'); vals.push(args.ai_api_key); }
            if (args.analysis_budget_daily) { updates.push('analysis_budget_daily = ?'); vals.push(args.analysis_budget_daily); }
            if (args.max_spawn_per_hour) { updates.push('max_spawn_per_hour = ?'); vals.push(args.max_spawn_per_hour); }
            updates.push('updated_at = CURRENT_TIMESTAMP');
            vals.push(deps.agentId);
            await edb.run(`UPDATE poly_watcher_config SET ${updates.join(', ')} WHERE agent_id = ?`, vals);
          } else {
            await edb.run(
              `INSERT INTO poly_watcher_config (agent_id, ai_provider, ai_model, ai_api_key, analysis_budget_daily, max_spawn_per_hour) VALUES (?, ?, ?, ?, ?, ?)`,
              [deps.agentId, args.ai_provider || 'xai', args.ai_model || 'grok-3-mini', args.ai_api_key || '', args.analysis_budget_daily || 100, args.max_spawn_per_hour || 6]
            );
          }
          return { success: true, message: `AI config updated. Provider: ${args.ai_provider || 'xai'}, Model: ${args.ai_model || 'grok-3-mini'}. Background analysis is now enabled.` };
        }

        if (args.action === 'stats') {
          const cfg = await edb.get(`SELECT * FROM poly_watcher_config WHERE agent_id = ?`, [deps.agentId]);
          const totalAnalyses = await edb.get(`SELECT COUNT(*) as cnt FROM poly_analysis_cache`).catch(() => ({ cnt: 0 }));
          const sentimentRecords = await edb.get(`SELECT COUNT(*) as cnt FROM poly_sentiment_history WHERE agent_id = ?`, [deps.agentId]).catch(() => ({ cnt: 0 }));
          const signalBuffer = await edb.get(`SELECT COUNT(*) as cnt FROM poly_signal_buffer WHERE agent_id = ?`, [deps.agentId]).catch(() => ({ cnt: 0 }));
          return {
            provider: cfg?.ai_provider || 'not configured',
            model: cfg?.ai_model || 'not configured',
            budget_daily: cfg?.analysis_budget_daily || 0,
            used_today: cfg?.analysis_count_today || 0,
            cached_analyses: totalAnalyses?.cnt || 0,
            sentiment_records: sentimentRecords?.cnt || 0,
            active_signals: signalBuffer?.cnt || 0,
            engine_total_analyses: _engineAnalysisCount,
          };
        }

        return { error: 'Unknown action' };
      },
    },
    {
      name: 'poly_watcher_events',
      description: 'Check automation signals generated by your watchers. ALWAYS check this at the start of every session.\n\nActions:\n- check: Get unacknowledged signals (most important)\n- list: Get all recent signals\n- acknowledge: Mark a signal as read\n- acknowledge_all: Mark all as read',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['check', 'list', 'acknowledge', 'acknowledge_all'] },
          id: { type: 'string', description: 'Event ID (for acknowledge)' },
          severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
          limit: { type: 'number', description: 'Max events (default: 50)' },
        },
        required: ['action'],
      },
      handler: async (args: any) => {
        const edb = deps.db.getEngineDB?.();
        if (!edb) return { error: 'Database not available' };

        if (args.action === 'check') {
          const events = await edb.all(
            `SELECT * FROM poly_watcher_events WHERE agent_id = ? AND acknowledged = 0 ORDER BY severity DESC, created_at DESC LIMIT ?`,
            [deps.agentId, args.limit || 50]
          ) || [];
          const critical = events.filter((e: any) => e.severity === 'critical').length;
          const warning = events.filter((e: any) => e.severity === 'warning').length;
          return {
            total_unread: events.length, critical, warning,
            events: events.map((e: any) => ({ ...e, data: JSON.parse(e.data || '{}') })),
            summary: events.length === 0 ? 'No new signals. All clear.' :
              `${events.length} unread (${critical} critical, ${warning} warning). Review critical signals immediately.`
          };
        }

        if (args.action === 'list') {
          let sql = `SELECT * FROM poly_watcher_events WHERE agent_id = ?`;
          const params: any[] = [deps.agentId];
          if (args.severity) { sql += ` AND severity = ?`; params.push(args.severity); }
          sql += ` ORDER BY created_at DESC LIMIT ?`;
          params.push(args.limit || 50);
          const events = await edb.all(sql, params) || [];
          return { events: events.map((e: any) => ({ ...e, data: JSON.parse(e.data || '{}') })) };
        }

        if (args.action === 'acknowledge') {
          if (!args.id) return { error: 'id required' };
          await edb.run(`UPDATE poly_watcher_events SET acknowledged = 1 WHERE id = ? AND agent_id = ?`, [args.id, deps.agentId]);
          return { success: true };
        }

        if (args.action === 'acknowledge_all') {
          await edb.run(`UPDATE poly_watcher_events SET acknowledged = 1 WHERE agent_id = ? AND acknowledged = 0`, [deps.agentId]);
          return { success: true };
        }

        return { error: 'Unknown action' };
      },
    },
    {
      name: 'poly_setup_monitors',
      description: 'Quick setup: Create a comprehensive monitoring suite for your trading operation. Sets up price alerts, AI news intelligence, geopolitical scanner, cross-signal correlation, and more.\n\nRequires: AI config (run poly_watcher_config first to set up a model).',
      parameters: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to monitor (e.g. ["bitcoin", "trump", "fed", "ukraine"])' },
          regions: { type: 'array', items: { type: 'string' }, description: 'Geopolitical regions to watch (default: major powers)' },
          crypto_threshold_pct: { type: 'number', description: 'Crypto change % to alert (default: 3)' },
          portfolio_drift_pct: { type: 'number', description: 'Portfolio P&L % to alert (default: 5)' },
          sentiment_topics: { type: 'array', items: { type: 'string' }, description: 'Topics to track sentiment shifts (e.g. ["bitcoin", "fed policy"])' },
        },
        required: [],
      },
      handler: async (args: any) => {
        const edb = deps.db.getEngineDB?.();
        if (!edb) return { error: 'Database not available' };

        const created: string[] = [];
        const mkId = () => crypto.randomUUID();
        const aiCfg = await getAIConfig(deps.agentId, edb);

        // 1. Crypto price tracker
        await edb.run(
          `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
          [mkId(), deps.agentId, 'crypto_price', 'BTC/ETH Tracker', JSON.stringify({
            symbols: ['bitcoin', 'ethereum'], pct_threshold: args.crypto_threshold_pct || 3
          }), 120000]
        );
        created.push('BTC/ETH price tracker (2m interval, ±' + (args.crypto_threshold_pct || 3) + '%)');

        // 2. Resolution watcher
        await edb.run(
          `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
          [mkId(), deps.agentId, 'resolution_watch', 'Expiring Markets', JSON.stringify({ hours_before: 48 }), 900000]
        );
        created.push('Resolution watcher (15m interval, 48h horizon)');

        // 3. Portfolio drift
        await edb.run(
          `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
          [mkId(), deps.agentId, 'portfolio_drift', 'Portfolio P&L Alert', JSON.stringify({
            pnl_threshold_pct: args.portfolio_drift_pct || 5
          }), 60000]
        );
        created.push('Portfolio drift alert (1m interval, ±' + (args.portfolio_drift_pct || 5) + '%)');

        // 4. Arbitrage scanner
        await edb.run(
          `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
          [mkId(), deps.agentId, 'arbitrage_scan', 'Arbitrage Scanner', JSON.stringify({ min_edge_pct: 2 }), 600000]
        );
        created.push('Arbitrage scanner (10m interval, ≥2% edge)');

        // 5. AI News Intelligence (if keywords + AI configured)
        if (args.keywords?.length) {
          await edb.run(
            `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
            [mkId(), deps.agentId, 'news_intelligence', 'AI News Scanner', JSON.stringify({
              keywords: args.keywords, watched_markets: args.keywords
            }), 300000]
          );
          created.push('AI news intelligence (5m interval, keywords: ' + args.keywords.join(', ') + ')' + (!aiCfg ? ' ⚠️ AI not configured' : ''));
        }

        // 6. Geopolitical scanner (AI-powered)
        await edb.run(
          `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
          [mkId(), deps.agentId, 'geopolitical', 'Geopolitical Scanner', JSON.stringify({
            regions: args.regions || ['us', 'china', 'russia', 'ukraine', 'iran', 'israel', 'north korea'],
            topics: ['sanctions', 'military', 'trade war', 'election', 'tariff', 'nato', 'diplomacy', 'war', 'attack'],
            watched_markets: args.keywords || []
          }), 600000]
        );
        created.push('Geopolitical scanner (10m interval)' + (!aiCfg ? ' ⚠️ AI not configured' : ''));

        // 7. Cross-signal correlator (AI-powered)
        await edb.run(
          `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
          [mkId(), deps.agentId, 'cross_signal', 'Signal Correlator', JSON.stringify({
            min_signals: 3, correlation_window_hours: 2
          }), 300000]
        );
        created.push('Cross-signal correlator (5m interval, min 3 signals)' + (!aiCfg ? ' ⚠️ AI not configured' : ''));

        // 8. Sentiment shift trackers
        const sentimentTopics = args.sentiment_topics || (args.keywords?.slice(0, 3)) || [];
        for (const topic of sentimentTopics) {
          await edb.run(
            `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
            [mkId(), deps.agentId, 'sentiment_shift', 'Sentiment: ' + topic, JSON.stringify({
              topic, keywords: [topic], shift_threshold: 0.3
            }), 900000]
          );
          created.push('Sentiment tracker: "' + topic + '" (15m interval)' + (!aiCfg ? ' ⚠️ AI not configured' : ''));
        }

        // 9. Price alerts for open positions
        const positions: any[] = await edb.all(
          `SELECT * FROM poly_paper_positions WHERE agent_id = ? AND closed = 0`, [deps.agentId]
        ).catch(() => []) || [];

        for (const p of positions) {
          const entry = p.entry_price || 0;
          if (!entry || !p.token_id) continue;
          await edb.run(
            `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
            [mkId(), deps.agentId, 'price_level', 'SL: ' + (p.market_question || p.token_id).slice(0, 30), JSON.stringify({
              token_id: p.token_id, direction: p.side === 'BUY' ? 'below' : 'above',
              threshold: p.side === 'BUY' ? entry * 0.85 : entry * 1.15, market_question: p.market_question
            }), 30000]
          );
          await edb.run(
            `INSERT INTO poly_watchers (id, agent_id, type, name, config, interval_ms) VALUES (?, ?, ?, ?, ?, ?)`,
            [mkId(), deps.agentId, 'price_level', 'TP: ' + (p.market_question || p.token_id).slice(0, 30), JSON.stringify({
              token_id: p.token_id, direction: p.side === 'BUY' ? 'above' : 'below',
              threshold: p.side === 'BUY' ? entry * 1.25 : entry * 0.75, market_question: p.market_question
            }), 30000]
          );
          created.push('SL/TP: ' + (p.market_question || p.token_id).slice(0, 40));
        }

        return {
          success: true,
          monitors_created: created.length,
          ai_configured: !!aiCfg,
          details: created,
          message: `✅ ${created.length} monitors active.${!aiCfg ? '\n\n⚠️ AI analysis not configured. AI-powered watchers (news, geopolitical, correlation, sentiment) will run WITHOUT intelligence. Run poly_watcher_config action=set to enable AI analysis.' : ' AI intelligence enabled (' + aiCfg.provider + '/' + aiCfg.model + ').'}`,
        };
      },
    },
  ];
}
