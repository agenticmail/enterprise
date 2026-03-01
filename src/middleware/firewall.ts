/**
 * AgenticMail Enterprise — IP Access Control Middleware
 *
 * Hono middleware that enforces firewall rules (allowlist / blocklist)
 * using the CIDR utilities from lib/cidr.ts.
 * Config is read from the centralized network config manager.
 */

import type { MiddlewareHandler } from 'hono';
import { compileIpMatcher } from '../lib/cidr.js';
import { getNetworkConfig, onNetworkConfigChange } from './network-config.js';
import type { FirewallConfig } from '../db/adapter.js';

// ─── Compiled Matchers Cache ─────────────────────────────

interface CompiledFirewall {
  enabled: boolean;
  mode: 'allowlist' | 'blocklist';
  allowlistMatcher: ((ip: string) => boolean) | null;
  blocklistMatcher: ((ip: string) => boolean) | null;
  bypassPaths: string[];
  trustedProxyMatcher: ((ip: string) => boolean) | null;
  trustedProxyEnabled: boolean;
}

let _compiled: CompiledFirewall = {
  enabled: false,
  mode: 'blocklist',
  allowlistMatcher: null,
  blocklistMatcher: null,
  bypassPaths: [],
  trustedProxyMatcher: null,
  trustedProxyEnabled: false,
};

function recompile(config: FirewallConfig): void {
  const ipAccess = config.ipAccess;
  const tp = config.trustedProxies;
  _compiled = {
    enabled: ipAccess?.enabled === true,
    mode: ipAccess?.mode || 'blocklist',
    allowlistMatcher: ipAccess?.allowlist?.length
      ? compileIpMatcher(ipAccess.allowlist)
      : null,
    blocklistMatcher: ipAccess?.blocklist?.length
      ? compileIpMatcher(ipAccess.blocklist)
      : null,
    bypassPaths: ['/health', '/ready', ...(ipAccess?.bypassPaths || [])],
    trustedProxyMatcher: tp?.ips?.length
      ? compileIpMatcher(tp.ips)
      : null,
    trustedProxyEnabled: tp?.enabled === true,
  };
}

// Subscribe to config changes for hot-reload
onNetworkConfigChange(recompile);

/**
 * Force an immediate cache refresh on the next request.
 * Called by the PUT /settings/firewall endpoint after config changes.
 * @deprecated Use invalidateNetworkConfig() from network-config.ts instead.
 */
export function invalidateFirewallCache(): void {
  // Now handled by centralized invalidateNetworkConfig()
}

// ─── Trusted Proxy Extraction ────────────────────────────

/**
 * Extract the real client IP, validating X-Forwarded-For against
 * the trusted proxy list. If trusted proxies are configured, only
 * trust the header when the direct connection comes from a trusted IP.
 */
function extractClientIp(c: any, connectingIp: string): string {
  const xff = c.req.header('x-forwarded-for');
  const xri = c.req.header('x-real-ip');

  // If trusted proxies are enabled, only trust forwarded headers
  // when the connecting IP is in the trusted list
  if (_compiled.trustedProxyEnabled && _compiled.trustedProxyMatcher) {
    if (!_compiled.trustedProxyMatcher(connectingIp)) {
      // Connecting IP is NOT trusted — ignore forwarded headers, use connecting IP
      return connectingIp;
    }
    // Connecting IP IS trusted — use the leftmost non-trusted IP from XFF
    if (xff) {
      const parts = xff.split(',').map((s: string) => s.trim()).filter(Boolean);
      // Walk right-to-left, find the first IP NOT in trusted list
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!_compiled.trustedProxyMatcher(parts[i])) {
          return parts[i];
        }
      }
      // All IPs in chain are trusted (edge case) — use leftmost
      return parts[0] || connectingIp;
    }
    return xri || connectingIp;
  }

  // No trusted proxy config — use standard header extraction (backward compat)
  return xff?.split(',')[0]?.trim() || xri || connectingIp;
}

// ─── Middleware ───────────────────────────────────────────

/**
 * IP access control middleware.
 * Reads firewall config from the centralized network config (cached 15s)
 * and enforces allowlist or blocklist rules on every inbound request.
 */
export function ipAccessControl(_getDb?: () => any): MiddlewareHandler {
  return async (c, next) => {
    // Ensure config is fresh
    const config = await getNetworkConfig();
    if (_compiled.enabled === false && config.ipAccess?.enabled) {
      recompile(config);
    } else if (!_compiled.enabled && !config.ipAccess?.enabled) {
      return next();
    }

    if (!_compiled.enabled) return next();

    // Extract connecting IP (from socket, not headers)
    const connectingIp =
      (c.env as any)?.remoteAddress ||
      c.req.raw?.socket?.remoteAddress ||
      'unknown';

    // Extract real client IP (validated against trusted proxies)
    const clientIp = extractClientIp(c, connectingIp || 'unknown');

    // Store the validated client IP for downstream use
    c.set('clientIp' as any, clientIp);

    // Bypass paths
    if (_compiled.bypassPaths.some((p) => c.req.path.startsWith(p))) {
      return next();
    }

    // Allowlist mode
    if (_compiled.mode === 'allowlist') {
      if (_compiled.allowlistMatcher && !_compiled.allowlistMatcher(clientIp)) {
        return c.json(
          { error: 'Access denied by firewall policy', code: 'IP_BLOCKED' },
          403,
        );
      }
      return next();
    }

    // Blocklist mode
    if (_compiled.mode === 'blocklist') {
      if (_compiled.blocklistMatcher && _compiled.blocklistMatcher(clientIp)) {
        return c.json(
          { error: 'Access denied by firewall policy', code: 'IP_BLOCKED' },
          403,
        );
      }
      return next();
    }

    return next();
  };
}
