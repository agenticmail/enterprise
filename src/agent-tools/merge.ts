/**
 * AgenticMail Agent Tools — Config Merge Utility
 *
 * Deep-merges org-level tool security defaults with per-agent overrides.
 * Agent values override org defaults at the leaf level.
 * Arrays are replaced entirely (not concatenated).
 */

export interface ToolSecurityConfig {
  security?: {
    pathSandbox?: { enabled?: boolean; allowedDirs?: string[]; blockedPatterns?: string[] };
    ssrf?: { enabled?: boolean; allowedHosts?: string[]; blockedCidrs?: string[] };
    commandSanitizer?: { enabled?: boolean; mode?: 'blocklist' | 'allowlist'; allowedCommands?: string[]; blockedPatterns?: string[] };
  };
  middleware?: {
    audit?: { enabled?: boolean; redactKeys?: string[] };
    rateLimit?: { enabled?: boolean; overrides?: Record<string, { maxTokens: number; refillRate: number }> };
    circuitBreaker?: { enabled?: boolean };
    telemetry?: { enabled?: boolean };
  };
}

/**
 * Deep merge two plain objects. `overrides` values take precedence.
 * Arrays are replaced (not concatenated). null/undefined in overrides is skipped.
 */
function deepMerge(base: any, overrides: any): any {
  if (!overrides || typeof overrides !== 'object') return base;
  if (!base || typeof base !== 'object') return overrides;
  if (Array.isArray(overrides)) return overrides;

  var result: Record<string, any> = {};
  // Copy all base keys
  for (var key of Object.keys(base)) {
    result[key] = base[key];
  }
  // Apply overrides
  for (var key of Object.keys(overrides)) {
    var val = overrides[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Merge org-level tool security defaults with per-agent overrides.
 * Returns the effective config to pass to `createAllTools()`.
 */
export function mergeToolSecurity(
  orgDefaults?: ToolSecurityConfig,
  agentOverrides?: ToolSecurityConfig,
): ToolSecurityConfig {
  if (!orgDefaults && !agentOverrides) return {};
  if (!orgDefaults) return agentOverrides || {};
  if (!agentOverrides) return orgDefaults;
  return deepMerge(orgDefaults, agentOverrides) as ToolSecurityConfig;
}
