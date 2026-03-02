/**
 * Config Change Bus — Real-time config propagation across all running services.
 * 
 * PROBLEM: Dashboard saves config to DB/memory, but running services (messaging poller,
 * agent loops, meeting monitors, email pollers) keep stale references. Changes don't
 * take effect until restart.
 * 
 * SOLUTION: Central EventEmitter-based bus. When any config changes:
 * 1. The save endpoint emits an event on the bus
 * 2. All subscribers (poller, agent loop, etc.) receive and react immediately
 * 
 * USAGE:
 *   // Emit (in route handler after saving):
 *   configBus.emit('agent:config', { agentId, key: 'messagingChannels', config })
 * 
 *   // Subscribe (in service startup):
 *   configBus.on('agent:config', ({ agentId, key }) => { ... })
 */

import { EventEmitter } from 'node:events';

export interface ConfigChangeEvent {
  agentId: string;
  key: string;         // Which part changed: 'messagingChannels', 'budgetConfig', 'voiceConfig', etc.
  config?: any;        // The new config value (optional — listener can re-fetch if needed)
  source?: string;     // Where the change came from: 'dashboard', 'api', 'cli'
  timestamp: number;
}

export interface CapabilityChangeEvent {
  capability: string;  // 'whatsapp', 'telegram', 'filesystem', etc.
  enabled: boolean;
  source?: string;
  timestamp: number;
}

export interface VaultChangeEvent {
  key: string;         // e.g. 'skill:telegram:access_token'
  action: 'set' | 'delete';
  source?: string;
  timestamp: number;
}

class ConfigBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Many services may subscribe
  }

  /** Emit agent config change */
  emitAgentConfig(agentId: string, key: string, config?: any, source?: string) {
    this.emit('agent:config', { agentId, key, config, source: source || 'dashboard', timestamp: Date.now() } satisfies ConfigChangeEvent);
  }

  /** Emit capability toggle */
  emitCapability(capability: string, enabled: boolean, source?: string) {
    this.emit('capability', { capability, enabled, source: source || 'dashboard', timestamp: Date.now() } satisfies CapabilityChangeEvent);
  }

  /** Emit vault/credential change */
  emitVault(key: string, action: 'set' | 'delete', source?: string) {
    this.emit('vault', { key, action, source: source || 'dashboard', timestamp: Date.now() } satisfies VaultChangeEvent);
  }

  /** Convenience: subscribe to specific agent's config changes */
  onAgentConfig(agentId: string, handler: (event: ConfigChangeEvent) => void): () => void {
    const filtered = (event: ConfigChangeEvent) => {
      if (event.agentId === agentId) handler(event);
    };
    this.on('agent:config', filtered);
    return () => this.off('agent:config', filtered);
  }

  /** Convenience: subscribe to any agent config change for a specific key */
  onConfigKey(key: string, handler: (event: ConfigChangeEvent) => void): () => void {
    const filtered = (event: ConfigChangeEvent) => {
      if (event.key === key) handler(event);
    };
    this.on('agent:config', filtered);
    return () => this.off('agent:config', filtered);
  }
}

export interface SettingsChangeEvent {
  keys: string[];       // Which settings keys changed: 'firewallConfig', 'securityConfig', etc.
  source?: string;
  timestamp: number;
}

class _ConfigBus extends ConfigBus {
  /** Emit org-level settings change (firewall, security, SSO, pricing, etc.) */
  emitSettings(keys: string[], source?: string) {
    this.emit('settings', { keys, source: source || 'dashboard', timestamp: Date.now() } satisfies SettingsChangeEvent);
  }

  /** Emit agent profile update (name, role, status, schedule, identity, etc.) */
  emitAgentUpdate(agentId: string, fields: string[], source?: string) {
    this.emit('agent:update', { agentId, fields, source: source || 'dashboard', timestamp: Date.now() });
  }
}

/** Singleton — shared across entire process */
export const configBus = new _ConfigBus();
