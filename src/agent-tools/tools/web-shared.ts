/**
 * AgenticMail Agent Tools — Web Shared Utilities
 *
 * LRU caching, timeouts, and response reading utilities for web tools.
 */

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  insertedAt: number;
};

export const DEFAULT_TIMEOUT_SECONDS = 30;
export const DEFAULT_CACHE_TTL_MINUTES = 15;

// ─── LRU Cache ─────────────────────────────────────────

export interface LRUCacheOptions {
  maxEntries?: number;
  sweepIntervalMs?: number;
}

var DEFAULT_LRU_MAX_ENTRIES = 200;
var DEFAULT_SWEEP_INTERVAL_MS = 60_000;

export class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: LRUCacheOptions) {
    this.maxEntries = opts?.maxEntries ?? DEFAULT_LRU_MAX_ENTRIES;
    var sweepMs = opts?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(this.sweep.bind(this), sweepMs);
      if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
        (this.sweepTimer as any).unref();
      }
    }
  }

  get(key: string): T | undefined {
    var entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    // Delete first to reset insertion order
    this.map.delete(key);
    // Evict oldest entries if at capacity
    while (this.map.size >= this.maxEntries) {
      var oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
      else break;
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      insertedAt: Date.now(),
    });
  }

  has(key: string): boolean {
    var entry = this.map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  sweep(): void {
    var now = Date.now();
    for (var [key, entry] of this.map) {
      if (now > entry.expiresAt) this.map.delete(key);
    }
  }

  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.map.clear();
  }
}

// ─── Legacy cache helpers (thin wrappers over LRU) ────

export function resolveTimeoutSeconds(value: unknown, fallback: number): number {
  var parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.floor(parsed));
}

export function resolveCacheTtlMs(value: unknown, fallbackMinutes: number): number {
  var minutes =
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallbackMinutes;
  return Math.round(minutes * 60_000);
}

export function normalizeCacheKey(value: string): string {
  return value.trim().toLowerCase();
}

export function readCache<T>(
  cache: LRUCache<T>,
  key: string,
): { value: T; cached: boolean } | null {
  var value = cache.get(key);
  if (value === undefined) return null;
  return { value, cached: true };
}

export function writeCache<T>(
  cache: LRUCache<T>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  cache.set(key, value, ttlMs);
}

// ─── Timeout ──────────────────────────────────────────

export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (timeoutMs <= 0) return signal ?? new AbortController().signal;
  var controller = new AbortController();
  var timer = setTimeout(controller.abort.bind(controller), timeoutMs);
  if (signal) {
    signal.addEventListener('abort', function() {
      clearTimeout(timer);
      controller.abort();
    }, { once: true });
  }
  controller.signal.addEventListener('abort', function() {
    clearTimeout(timer);
  }, { once: true });
  return controller.signal;
}

// ─── Response Reading ─────────────────────────────────

export type ReadResponseTextResult = {
  text: string;
  truncated: boolean;
  bytesRead: number;
};

export async function readResponseText(
  res: Response,
  options?: { maxBytes?: number },
): Promise<ReadResponseTextResult> {
  var maxBytesRaw = options?.maxBytes;
  var maxBytes =
    typeof maxBytesRaw === 'number' && Number.isFinite(maxBytesRaw) && maxBytesRaw > 0
      ? Math.floor(maxBytesRaw)
      : undefined;

  var body = (res as unknown as { body?: unknown }).body;
  if (
    maxBytes &&
    body &&
    typeof body === 'object' &&
    'getReader' in body &&
    typeof (body as { getReader: () => unknown }).getReader === 'function'
  ) {
    var reader = (body as ReadableStream<Uint8Array>).getReader();
    var decoder = new TextDecoder();
    var bytesRead = 0;
    var truncated = false;
    var parts: string[] = [];

    try {
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        if (!result.value || result.value.byteLength === 0) continue;

        var chunk = result.value;
        if (bytesRead + chunk.byteLength > maxBytes) {
          var remaining = Math.max(0, maxBytes - bytesRead);
          if (remaining <= 0) { truncated = true; break; }
          chunk = chunk.subarray(0, remaining);
          truncated = true;
        }

        bytesRead += chunk.byteLength;
        parts.push(decoder.decode(chunk, { stream: true }));

        if (truncated || bytesRead >= maxBytes) { truncated = true; break; }
      }
    } catch {
      // Best-effort: return whatever we decoded so far.
    } finally {
      if (truncated) {
        try { await reader.cancel(); } catch { /* ignore */ }
      }
    }

    parts.push(decoder.decode());
    return { text: parts.join(''), truncated, bytesRead };
  }

  try {
    var text = await res.text();
    return { text, truncated: false, bytesRead: text.length };
  } catch {
    return { text: '', truncated: false, bytesRead: 0 };
  }
}
