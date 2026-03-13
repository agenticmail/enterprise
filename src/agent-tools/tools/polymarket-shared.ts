/**
 * Polymarket Shared Utilities
 * 
 * Common helpers used across all Polymarket tool modules:
 * - Cached fetch with TTL
 * - Rate limiter
 * - Input validation
 * - Retry logic
 */

// ─── Dialect Detection ───────────────────────────────────────

export type DbDialect = 'sqlite' | 'postgres' | 'mysql';
let _dialect: DbDialect = 'sqlite';
export function setDialect(d: DbDialect) { _dialect = d; }
export function getDialect() { return _dialect; }
/** @deprecated use setDialect */ export function setPostgresFlag(v: boolean) { _dialect = v ? 'postgres' : 'sqlite'; }

export function autoId(): string {
  switch (_dialect) {
    case 'postgres': return 'SERIAL PRIMARY KEY';
    case 'mysql': return 'INTEGER PRIMARY KEY AUTO_INCREMENT';
    default: return 'INTEGER PRIMARY KEY';
  }
}

export function timestampDefault(): string {
  switch (_dialect) {
    case 'postgres': return 'TIMESTAMP DEFAULT NOW()';
    case 'mysql': return 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP';
    default: return 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP';
  }
}

export function jsonType(): string {
  return _dialect === 'postgres' ? 'JSONB' : 'TEXT';
}

export function boolVal(v: boolean): string {
  if (_dialect === 'postgres') return v ? 'TRUE' : 'FALSE';
  return v ? '1' : '0';
}

/**
 * Cross-dialect UPSERT helper. Returns the appropriate INSERT statement.
 * - SQLite: INSERT OR REPLACE / INSERT OR IGNORE
 * - Postgres: INSERT ... ON CONFLICT (col) DO UPDATE SET ... / DO NOTHING
 * - MySQL: INSERT IGNORE / REPLACE INTO
 */
export function insertOrReplace(table: string, cols: string[], conflictCol: string, updateCols?: string[]): string {
  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.join(', ');
  if (_dialect === 'mysql') {
    // MySQL: REPLACE INTO does a delete+insert on duplicate key
    return `REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`;
  }
  // SQLite and Postgres both support ON CONFLICT
  const updates = (updateCols || cols.filter(c => c !== conflictCol)).map(c => `${c} = EXCLUDED.${c}`).join(', ');
  return `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT(${conflictCol}) DO UPDATE SET ${updates}`;
}

export function insertOrIgnore(table: string, cols: string[]): string {
  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.join(', ');
  if (_dialect === 'mysql') return `INSERT IGNORE INTO ${table} (${colList}) VALUES (${placeholders})`;
  if (_dialect === 'postgres') return `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  return `INSERT OR IGNORE INTO ${table} (${colList}) VALUES (${placeholders})`;
}

export async function detectDialect(db: any): Promise<DbDialect> {
  try { await db.execute(`SELECT NOW()`); return 'postgres'; } catch {}
  try {
    const r = await db.execute(`SELECT VERSION() as v`);
    const ver = r?.rows?.[0]?.v || r?.[0]?.v || '';
    if (/mysql|maria/i.test(String(ver))) return 'mysql';
  } catch {}
  return 'sqlite';
}

// ─── Response Cache ──────────────────────────────────────────

const responseCache = new Map<string, { data: any; ts: number }>();
const MAX_CACHE_ENTRIES = 500;

export function getCached(key: string, ttlMs: number): any | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  if (entry) responseCache.delete(key);
  return null;
}

export function setCache(key: string, data: any): void {
  // Evict oldest if too many entries
  if (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { data, ts: Date.now() });
}

// ─── Rate Limiter ────────────────────────────────────────────

const rateLimits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 30;

export function checkRateLimit(domain: string): boolean {
  const now = Date.now();
  const times = rateLimits.get(domain) || [];
  // Remove old entries
  const recent = times.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) return false;
  recent.push(now);
  rateLimits.set(domain, recent);
  return true;
}

// ─── Fetch with Cache + Rate Limit ───────────────────────────

export async function cachedFetchJSON(url: string, cacheTtlMs = 30_000, timeout = 10_000): Promise<any> {
  // Check cache first
  const cached = getCached(url, cacheTtlMs);
  if (cached !== null) return cached;

  // Rate limit check
  const domain = new URL(url).hostname;
  if (!checkRateLimit(domain)) {
    throw new Error(`Rate limited: too many requests to ${domain}. Wait a moment.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    setCache(url, data);
    return data;
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error(`Request to ${domain} timed out after ${timeout}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function cachedFetchText(url: string, cacheTtlMs = 60_000, timeout = 10_000): Promise<string> {
  const cached = getCached('txt:' + url, cacheTtlMs);
  if (cached !== null) return cached;

  const domain = new URL(url).hostname;
  if (!checkRateLimit(domain)) {
    throw new Error(`Rate limited: too many requests to ${domain}. Wait a moment.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'PolymarketBot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    setCache('txt:' + url, text);
    return text;
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error(`Request to ${domain} timed out after ${timeout}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Input Validation ────────────────────────────────────────

export function validateTokenId(tokenId: any): string | null {
  if (!tokenId || typeof tokenId !== 'string') return null;
  const trimmed = tokenId.trim();
  if (trimmed.length < 5) return null;
  return trimmed;
}

export function validateAddress(addr: any): string | null {
  if (!addr || typeof addr !== 'string') return null;
  const trimmed = addr.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/i.test(trimmed) && trimmed.length < 10) return null;
  return trimmed;
}

export function validateSlug(slug: any): string | null {
  if (!slug || typeof slug !== 'string') return null;
  return slug.trim();
}

export function clampNumber(val: any, min: number, max: number, defaultVal: number): number {
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return defaultVal;
  return Math.max(min, Math.min(max, n));
}

// ─── Safe DB Exec ────────────────────────────────────────────

/**
 * Convert `?` placeholders to `$1, $2, ...` for Postgres.
 * SQLite uses `?`, Postgres uses `$1`.
 */
function pgParams(sql: string): string {
  if (_dialect !== 'postgres') return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Unwrap nested array args — callers often pass safeDbQuery(db, sql, [a, b])
 * which with ...args becomes [[a, b]]. Flatten one level for Postgres.
 */
function flatArgs(args: any[]): any[] {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

/**
 * Execute a write query (INSERT/UPDATE/DELETE) — works on SQLite + Postgres.
 */
export async function safeDbExec(db: any, sql: string, ...args: any[]): Promise<any> {
  if (!db) return null;
  const params = flatArgs(args);
  try {
    // SQLite path (better-sqlite3): db.prepare().run()
    if (db.prepare) {
      if (params.length > 0) return db.prepare(sql).run(...params);
      return db.exec(sql);
    }
    // Postgres/async path: db.execute() or db.query()
    const qFn = db.query || db.execute;
    if (qFn) return await qFn.call(db, pgParams(sql), params.length > 0 ? params : undefined);
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Query multiple rows — works on SQLite + Postgres.
 */
export async function safeDbQuery(db: any, sql: string, ...args: any[]): Promise<any[]> {
  if (!db) return [];
  const params = flatArgs(args);
  try {
    if (db.prepare) return db.prepare(sql).all(...params) || [];
    const qFn = db.query || db.execute;
    if (qFn) {
      const res = await qFn.call(db, pgParams(sql), params.length > 0 ? params : undefined);
      return res?.rows || (Array.isArray(res) ? res : []);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Query single row — works on SQLite + Postgres.
 */
export async function safeDbGet(db: any, sql: string, ...args: any[]): Promise<any | null> {
  if (!db) return null;
  const params = flatArgs(args);
  try {
    if (db.prepare) return db.prepare(sql).get(...params) || null;
    const qFn = db.query || db.execute;
    if (qFn) {
      const res = await qFn.call(db, pgParams(sql), params.length > 0 ? params : undefined);
      const rows = res?.rows || (Array.isArray(res) ? res : []);
      return rows[0] || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Execute DDL (CREATE TABLE, etc.) — works on SQLite + Postgres.
 */
export async function safeDbDDL(db: any, sql: string): Promise<void> {
  if (!db) return;
  try {
    if (db.exec) { db.exec(sql); return; }
    if (db.execute) { await db.execute(sql); return; }
  } catch {}
}

// ─── RSS Parser ──────────────────────────────────────────────

export function parseRSSItems(xml: string): any[] {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const get = (tag: string) => {
      const m = match![1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    items.push({
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      description: get('description').replace(/<[^>]+>/g, '').slice(0, 300),
      source: get('source'),
    });
  }
  return items;
}

// ─── Retry Wrapper ───────────────────────────────────────────

export async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < retries) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastError;
}
