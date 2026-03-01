/**
 * Security Configuration Management
 * 
 * Default security config and merging logic for agent overrides.
 */

import type { SecurityConfig } from '../db/adapter.js';

/**
 * Default security configuration with sensible defaults
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  promptInjection: {
    enabled: true,
    mode: 'sanitize',
    sensitivity: 'medium',
    customPatterns: [],
    allowedOverrideAgents: [],
    logDetections: true,
    blockResponse: 'This content appears to contain potentially harmful instructions and has been blocked for security reasons.'
  },
  sqlInjection: {
    enabled: true,
    mode: 'block',
    scanToolInputs: true,
    scanApiInputs: true,
    logDetections: true
  },
  inputValidation: {
    enabled: true,
    maxInputLength: 100000,
    maxJsonDepth: 20,
    stripHtml: false,
    blockScripts: true,
    sanitizeUnicode: true
  },
  outputFiltering: {
    enabled: true,
    scanForSecrets: true,
    scanForPii: true,
    mode: 'redact',
    customRedactPatterns: [],
    logDetections: true
  },
  portSecurity: {
    enabled: false,
    monitorOpenPorts: false,
    allowedPorts: [22, 80, 443, 3000, 8080],
    scanIntervalMinutes: 60,
    alertOnNewPort: true
  },
  bruteForce: {
    enabled: true,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    maxApiKeyAttempts: 10,
    trackFailedAttempts: true
  },
  contentSecurity: {
    enabled: true,
    cspPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';",
    frameAncestors: ['self'],
    scriptSrc: ['self', 'unsafe-inline'],
    connectSrc: ['self']
  },
  secretScanning: {
    enabled: true,
    scanAgentOutputs: true,
    scanToolResults: true,
    patterns: 'default',
    customPatterns: [],
    alertOnDetection: true
  },
  auditSecurity: {
    enabled: true,
    logAllToolCalls: false,
    logPromptInjectionAttempts: true,
    logApiAccess: false,
    retentionDays: 90
  }
};

/**
 * Merge global security config with agent-specific overrides
 */
export function mergeSecurityConfig(
  globalConfig: Partial<SecurityConfig> = {},
  agentOverrides: Partial<SecurityConfig> = {}
): SecurityConfig {
  const base = { ...DEFAULT_SECURITY_CONFIG };
  
  // Deep merge global config
  for (const [section, sectionConfig] of Object.entries(globalConfig)) {
    if (sectionConfig && typeof sectionConfig === 'object') {
      base[section as keyof SecurityConfig] = {
        ...base[section as keyof SecurityConfig],
        ...sectionConfig
      } as any;
    }
  }

  // Deep merge agent overrides
  for (const [section, sectionConfig] of Object.entries(agentOverrides)) {
    if (sectionConfig && typeof sectionConfig === 'object') {
      base[section as keyof SecurityConfig] = {
        ...base[section as keyof SecurityConfig],
        ...sectionConfig
      } as any;
    }
  }

  return base;
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(config: Partial<SecurityConfig>): string[] {
  const errors: string[] = [];

  if (config.inputValidation) {
    const iv = config.inputValidation;
    if (iv.maxInputLength !== undefined && (iv.maxInputLength < 1000 || iv.maxInputLength > 1000000)) {
      errors.push('inputValidation.maxInputLength must be between 1000 and 1000000');
    }
    if (iv.maxJsonDepth !== undefined && (iv.maxJsonDepth < 5 || iv.maxJsonDepth > 100)) {
      errors.push('inputValidation.maxJsonDepth must be between 5 and 100');
    }
  }

  if (config.bruteForce) {
    const bf = config.bruteForce;
    if (bf.maxLoginAttempts !== undefined && (bf.maxLoginAttempts < 1 || bf.maxLoginAttempts > 100)) {
      errors.push('bruteForce.maxLoginAttempts must be between 1 and 100');
    }
    if (bf.lockoutDurationMinutes !== undefined && (bf.lockoutDurationMinutes < 1 || bf.lockoutDurationMinutes > 1440)) {
      errors.push('bruteForce.lockoutDurationMinutes must be between 1 and 1440 (24 hours)');
    }
  }

  if (config.portSecurity) {
    const ps = config.portSecurity;
    if (ps.scanIntervalMinutes !== undefined && (ps.scanIntervalMinutes < 5 || ps.scanIntervalMinutes > 1440)) {
      errors.push('portSecurity.scanIntervalMinutes must be between 5 and 1440');
    }
    if (ps.allowedPorts !== undefined && ps.allowedPorts.some(port => port < 1 || port > 65535)) {
      errors.push('portSecurity.allowedPorts must contain valid port numbers (1-65535)');
    }
  }

  if (config.auditSecurity) {
    const as = config.auditSecurity;
    if (as.retentionDays !== undefined && (as.retentionDays < 1 || as.retentionDays > 365)) {
      errors.push('auditSecurity.retentionDays must be between 1 and 365');
    }
  }

  return errors;
}