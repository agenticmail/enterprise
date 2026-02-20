/**
 * AgenticMail Enterprise — IP Access Control Middleware
 *
 * Hono middleware that enforces firewall rules (allowlist / blocklist)
 * using the CIDR utilities from lib/cidr.ts.
 * Config is read from the database with a 30-second in-memory cache.
 */

import type { MiddlewareHandler } from 'hono';
import type { DatabaseAdapter, FirewallConfig } from '../db/adapter.js';
import { compileIpMatcher } from '../lib/cidr.js';

// ─── Cache ────────────────────────────────────────────────

interface FirewallCache {
  config: FirewallConfig['ipAccess'] | null;
  compiledAllowlist: ((ip: string) => boolean) | null;
  compiledBlocklist: ((ip: string) => boolean) | null;
  loadedAt: number;
}

const CACHE_TTL_MS = 30_000;

let _cache: FirewallCache = {
  config: null,
  compiledAllowlist: null,
  compiledBlocklist: null,
  loadedAt: 0,
};

/**
 * Force an immediate cache refresh on the next request.
 * Called by the PUT /settings/firewall endpoint after config changes.
 */
export function invalidateFirewallCache(): void {
  _cache.loadedAt = 0;
}

// ─── Default Bypass Paths ─────────────────────────────────

const DEFAULT_BYPASS_PATHS = ['/health', '/ready'];

// ─── Middleware ───────────────────────────────────────────

/**
 * IP access control middleware.
 * Reads firewall config from the database (cached 30s) and enforces
 * allowlist or blocklist rules on every inbound request.
 */
export function ipAccessControl(getDb: () => DatabaseAdapter | null): MiddlewareHandler {
  return async (c, next) => {
    const db = getDb();

    // ── Refresh cache if stale ──────────────────────────
    const now = Date.now();
    if (db && now - _cache.loadedAt > CACHE_TTL_MS) {
      try {
        const settings = await db.getSettings();
        const ipAccess = settings?.firewallConfig?.ipAccess || null;
        _cache = {
          config: ipAccess,
          compiledAllowlist: ipAccess?.allowlist?.length
            ? compileIpMatcher(ipAccess.allowlist)
            : null,
          compiledBlocklist: ipAccess?.blocklist?.length
            ? compileIpMatcher(ipAccess.blocklist)
            : null,
          loadedAt: Date.now(),
        };
      } catch {
        // If we can't load config, keep using whatever we have
        // (or null — which means pass-through)
      }
    }

    // ── Check if firewall is enabled ────────────────────
    if (!_cache.config?.enabled) {
      return next();
    }

    // ── Extract client IP ───────────────────────────────
    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    // ── Bypass paths ────────────────────────────────────
    const bypassPaths = [
      ...DEFAULT_BYPASS_PATHS,
      ...(_cache.config.bypassPaths || []),
    ];
    if (bypassPaths.some((p) => c.req.path.startsWith(p))) {
      return next();
    }

    // ── Allowlist mode ──────────────────────────────────
    if (_cache.config.mode === 'allowlist') {
      if (_cache.compiledAllowlist && !_cache.compiledAllowlist(clientIp)) {
        return c.json(
          { error: 'Access denied by firewall policy', code: 'IP_BLOCKED' },
          403,
        );
      }
      return next();
    }

    // ── Blocklist mode ──────────────────────────────────
    if (_cache.config.mode === 'blocklist') {
      if (_cache.compiledBlocklist && _cache.compiledBlocklist(clientIp)) {
        return c.json(
          { error: 'Access denied by firewall policy', code: 'IP_BLOCKED' },
          403,
        );
      }
      return next();
    }

    // ── Unknown mode or no mode set — pass through ──────
    return next();
  };
}
