/**
 * AgenticMail Enterprise — Outbound Egress Filter
 *
 * Controls which external hosts and ports agent tool HTTP calls
 * are allowed to reach. Supports allowlist and blocklist modes
 * with wildcard host patterns (e.g., "*.example.com").
 */

import type { FirewallConfig } from '../db/adapter.js';
import { hostMatchesPattern } from '../lib/cidr.js';

export interface EgressFilter {
  /** Throws if the outbound URL is blocked by policy. */
  validateOutbound(url: string): void;
}

/**
 * Create an egress filter from the firewall egress config.
 * If not enabled or config is null/undefined, all requests pass.
 */
export function createEgressFilter(
  config?: FirewallConfig['egress'],
): EgressFilter {
  return {
    validateOutbound(url: string): void {
      // ── Disabled or missing config — pass through ─────
      if (!config?.enabled) return;

      // ── Parse URL ─────────────────────────────────────
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`Outbound request blocked by egress policy: invalid URL "${url}"`);
      }

      const host = parsed.hostname;
      const port = parsed.port
        ? parseInt(parsed.port, 10)
        : parsed.protocol === 'https:' ? 443 : 80;

      // ── Host filtering ────────────────────────────────
      if (config.mode === 'allowlist') {
        const allowed = (config.allowedHosts || []).some((pattern) =>
          hostMatchesPattern(host, pattern),
        );
        if (!allowed) {
          throw new Error(
            `Outbound request to ${host}:${port} blocked by egress policy`,
          );
        }
      } else if (config.mode === 'blocklist') {
        const blocked = (config.blockedHosts || []).some((pattern) =>
          hostMatchesPattern(host, pattern),
        );
        if (blocked) {
          throw new Error(
            `Outbound request to ${host}:${port} blocked by egress policy`,
          );
        }
      }

      // ── Port filtering ────────────────────────────────
      if (config.allowedPorts && config.allowedPorts.length > 0) {
        if (!config.allowedPorts.includes(port)) {
          throw new Error(
            `Outbound request to ${host}:${port} blocked by egress policy`,
          );
        }
      }

      if (config.blockedPorts && config.blockedPorts.length > 0) {
        if (config.blockedPorts.includes(port)) {
          throw new Error(
            `Outbound request to ${host}:${port} blocked by egress policy`,
          );
        }
      }
    },
  };
}
