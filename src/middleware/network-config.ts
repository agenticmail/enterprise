/**
 * AgenticMail Enterprise — Centralized Network Configuration Manager
 *
 * Single source of truth for ALL network/firewall settings.
 * Reads from database, caches in memory, invalidated on dashboard save.
 * All middleware reads from here — no hardcoded values.
 */

import type { DatabaseAdapter, FirewallConfig } from '../db/adapter.js';

// ─── Types ───────────────────────────────────────────────

export interface NetworkState {
  config: FirewallConfig;
  loadedAt: number;
}

// ─── Cache ───────────────────────────────────────────────

const CACHE_TTL_MS = 15_000; // 15s — fast enough for hot-reload, low enough for perf

let _state: NetworkState = {
  config: {},
  loadedAt: 0,
};

let _db: DatabaseAdapter | null = null;
let _listeners: Array<(config: FirewallConfig) => void> = [];

// ─── Public API ──────────────────────────────────────────

/** Set the DB adapter (called once at server startup). */
export function setNetworkDb(db: DatabaseAdapter): void {
  _db = db;
}

/** Force immediate reload from DB. Called by PUT /settings/firewall. */
export async function invalidateNetworkConfig(): Promise<void> {
  _state.loadedAt = 0;
  if (_db) {
    await _loadConfig();
    // Notify all listeners
    for (const fn of _listeners) {
      try { fn(_state.config); } catch {}
    }
  }
}

/** Subscribe to config changes (for middleware that needs to rebuild state). */
export function onNetworkConfigChange(fn: (config: FirewallConfig) => void): void {
  _listeners.push(fn);
}

/** Get the current network config (loads from DB if stale). */
export async function getNetworkConfig(): Promise<FirewallConfig> {
  if (!_db) return _state.config;
  const now = Date.now();
  if (now - _state.loadedAt > CACHE_TTL_MS) {
    await _loadConfig();
  }
  return _state.config;
}

/** Synchronous access to cached config (may be stale up to CACHE_TTL_MS). */
export function getNetworkConfigSync(): FirewallConfig {
  return _state.config;
}

// ─── Internal ────────────────────────────────────────────

async function _loadConfig(): Promise<void> {
  if (!_db) return;
  try {
    const settings = await _db.getSettings();
    _state = {
      config: settings?.firewallConfig || {},
      loadedAt: Date.now(),
    };
  } catch {
    // Keep using whatever we have (graceful degradation)
  }
}
