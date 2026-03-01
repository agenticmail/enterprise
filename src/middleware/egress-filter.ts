/**
 * AgenticMail Enterprise — Outbound Egress Filter
 *
 * Controls which external hosts and ports agent tool HTTP calls
 * are allowed to reach. Supports allowlist and blocklist modes
 * with wildcard host patterns (e.g., "*.example.com").
 *
 * Now supports hot-reload via centralized network config.
 */

import type { FirewallConfig } from '../db/adapter.js';
import { hostMatchesPattern } from '../lib/cidr.js';
import { onNetworkConfigChange, getNetworkConfigSync } from './network-config.js';

export interface EgressFilter {
  /** Throws if the outbound URL is blocked by policy. */
  validateOutbound(url: string): void;
}

// ─── Singleton Egress Filter (hot-reloaded) ─────────────

let _currentConfig: FirewallConfig['egress'] | undefined;

onNetworkConfigChange((config) => {
  _currentConfig = config.egress;
});

function _validate(url: string, config?: FirewallConfig['egress']): void {
  if (!config?.enabled) return;

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

  const mode = config.mode || 'blocklist';

  // Host filtering
  if (mode === 'allowlist') {
    const allowed = (config.allowedHosts || []).some((pattern) =>
      hostMatchesPattern(host, pattern),
    );
    if (!allowed) {
      throw new Error(
        `Outbound request to ${host}:${port} blocked by egress policy (host not in allowlist)`,
      );
    }
  } else if (mode === 'blocklist') {
    const blocked = (config.blockedHosts || []).some((pattern) =>
      hostMatchesPattern(host, pattern),
    );
    if (blocked) {
      throw new Error(
        `Outbound request to ${host}:${port} blocked by egress policy (host in blocklist)`,
      );
    }
  }

  // Port filtering
  if (config.allowedPorts && config.allowedPorts.length > 0) {
    if (!config.allowedPorts.includes(port)) {
      throw new Error(
        `Outbound request to ${host}:${port} blocked by egress policy (port ${port} not in allowed ports)`,
      );
    }
  }

  if (config.blockedPorts && config.blockedPorts.length > 0) {
    if (config.blockedPorts.includes(port)) {
      throw new Error(
        `Outbound request to ${host}:${port} blocked by egress policy (port ${port} blocked)`,
      );
    }
  }
}

/**
 * Create an egress filter from explicit config (for backward compat).
 */
export function createEgressFilter(
  config?: FirewallConfig['egress'],
): EgressFilter {
  return {
    validateOutbound(url: string): void {
      _validate(url, config);
    },
  };
}

/**
 * Global egress filter that reads from the centralized network config.
 * Use this in agent tools — always up to date with dashboard settings.
 */
export function validateEgress(url: string): void {
  const config = _currentConfig || getNetworkConfigSync().egress;
  _validate(url, config);
}
