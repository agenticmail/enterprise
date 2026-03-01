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

// ─── Block Page ──────────────────────────────────────────

const FIREWALL_BLOCK_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Access Denied</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e1e4e8}
  .container{text-align:center;max-width:480px;padding:40px 24px}
  .icon{width:64px;height:64px;margin:0 auto 24px;border-radius:16px;background:rgba(255,107,107,0.1);display:flex;align-items:center;justify-content:center}
  .icon svg{width:32px;height:32px;stroke:#ff6b6b;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:24px;font-weight:700;margin-bottom:12px;color:#fff}
  p{font-size:15px;line-height:1.6;color:#8b949e;margin-bottom:8px}
  .subtle{font-size:13px;color:#484f58;margin-top:24px}
</style>
</head>
<body>
<div class="container">
  <div class="icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg></div>
  <h1>Access Denied</h1>
  <p>Your request has been blocked by the firewall. Access to this service is restricted by the administrator.</p>
  <p>If you believe this is an error, please contact the site owner.</p>
  <div class="subtle">Error 403</div>
</div>
</body>
</html>`;

function firewallBlock(c: any): Response {
  const accept = c.req.header('accept') || '';
  if (accept.includes('application/json') || c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Access denied by firewall policy', code: 'IP_BLOCKED' }, 403);
  }
  return c.html(FIREWALL_BLOCK_PAGE, 403);
}

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
    // Ensure config is fresh (getNetworkConfig auto-notifies listeners on change)
    await getNetworkConfig();

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
        return firewallBlock(c);
      }
      return next();
    }

    // Blocklist mode
    if (_compiled.mode === 'blocklist') {
      if (_compiled.blocklistMatcher && _compiled.blocklistMatcher(clientIp)) {
        return firewallBlock(c);
      }
      return next();
    }

    return next();
  };
}
