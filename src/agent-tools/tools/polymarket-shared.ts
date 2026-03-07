/**
 * Polymarket Shared Utilities
 * 
 * Common helpers used across all Polymarket tool modules:
 * - Cached fetch with TTL
 * - Rate limiter
 * - Input validation
 * - Retry logic
 */

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

export function safeDbExec(db: any, sql: string, ...args: any[]): any {
  if (!db) return null;
  try {
    if (args.length > 0) {
      return db.prepare?.(sql)?.run(...args);
    }
    return db.exec?.(sql);
  } catch {
    return null;
  }
}

export function safeDbQuery(db: any, sql: string, ...args: any[]): any[] {
  if (!db) return [];
  try {
    return db.prepare?.(sql)?.all(...args) || [];
  } catch {
    return [];
  }
}

export function safeDbGet(db: any, sql: string, ...args: any[]): any | null {
  if (!db) return null;
  try {
    return db.prepare?.(sql)?.get(...args) || null;
  } catch {
    return null;
  }
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
