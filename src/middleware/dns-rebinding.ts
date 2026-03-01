/**
 * AgenticMail Enterprise — DNS Rebinding Protection
 *
 * Validates the Host header against a configured allowlist to prevent
 * DNS rebinding attacks. Reads config from centralized network config.
 */

import type { MiddlewareHandler } from 'hono';
import { getNetworkConfig } from './network-config.js';

/**
 * DNS rebinding protection middleware.
 * Rejects requests whose Host header doesn't match configured allowed hosts.
 */
export function dnsRebindingProtection(): MiddlewareHandler {
  return async (c, next) => {
    const config = await getNetworkConfig();
    const dns = config.dnsRebinding;

    if (!dns?.enabled || !dns.allowedHosts?.length) return next();

    const host = c.req.header('host')?.split(':')[0]?.toLowerCase();
    if (!host) return next(); // No host header — likely internal

    const allowed = dns.allowedHosts.some(h => {
      const pattern = h.toLowerCase();
      if (pattern === host) return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        return host.endsWith(suffix) || host === pattern.slice(2);
      }
      return false;
    });

    if (!allowed) {
      return c.json(
        { error: 'Invalid Host header', code: 'DNS_REBINDING_BLOCKED' },
        403,
      );
    }

    return next();
  };
}
