/**
 * Security Engine - Main Entry Point
 * 
 * Centralized security system that coordinates all security modules
 */

import type { SecurityConfig } from '../db/adapter.js';
import { mergeSecurityConfig, DEFAULT_SECURITY_CONFIG } from './config.js';
import { detectPromptInjection, type PromptThreat } from './prompt-guard.js';
import { detectSqlInjection, normalizeSqlInput, type SqlThreat } from './sql-guard.js';
import { sanitizeInput, type SanitizationResult } from './input-sanitizer.js';
import { filterOutput, type FilterResult } from './output-filter.js';
import { BruteForceProtection, type BruteForceConfig } from './brute-force.js';
import { PortMonitor, scanPorts, type PortScanResult } from './port-scanner.js';
import { buildCspPolicy, applyCspHeader, type CspConfig } from './csp.js';
import { 
  ThreatLogger, 
  SecurityEventHelpers,
  type SecurityEvent,
  type SecurityEventDatabase,
  type SecurityEventFilter 
} from './threat-logger.js';

export interface SecurityContext {
  agentId?: string;
  sourceIp?: string;
  userAgent?: string;
  sessionId?: string;
  requestPath?: string;
}

export interface SecurityScanResult {
  blocked: boolean;
  threats: string[];
  sanitized?: string;
  confidence: number;
  details: Record<string, any>;
}

export interface SecurityEngineConfig {
  securityConfig: SecurityConfig;
  database?: SecurityEventDatabase;
  onThreatDetected?: (threat: SecurityEvent) => void;
}

/**
 * Main Security Engine Class
 */
export class SecurityEngine {
  private threatLogger?: ThreatLogger;
  private bruteForceProtection?: BruteForceProtection;
  private portMonitor?: PortMonitor;
  
  constructor(private config: SecurityEngineConfig) {
    this.initializeModules();
  }
  
  /**
   * Initialize security modules
   */
  private initializeModules(): void {
    // Initialize threat logger if database is provided
    if (this.config.database) {
      this.threatLogger = new ThreatLogger(this.config.database);
    }
    
    // Initialize brute force protection
    if (this.config.securityConfig.bruteForce.enabled) {
      const bfConfig: BruteForceConfig = {
        maxLoginAttempts: this.config.securityConfig.bruteForce.maxLoginAttempts,
        maxApiKeyAttempts: this.config.securityConfig.bruteForce.maxApiKeyAttempts,
        lockoutDurationMinutes: this.config.securityConfig.bruteForce.lockoutDurationMinutes,
        trackFailedAttempts: this.config.securityConfig.bruteForce.trackFailedAttempts
      };
      this.bruteForceProtection = new BruteForceProtection(bfConfig);
    }
    
    // Initialize port monitoring
    if (this.config.securityConfig.portSecurity.enabled && 
        this.config.securityConfig.portSecurity.monitorOpenPorts) {
      this.portMonitor = new PortMonitor({
        allowedPorts: this.config.securityConfig.portSecurity.allowedPorts,
        intervalMinutes: this.config.securityConfig.portSecurity.scanIntervalMinutes
      });
      
      this.portMonitor.setAlertCallback((alerts) => {
        for (const alert of alerts) {
          this.logThreat(SecurityEventHelpers.portAlert(
            alert.port || 0,
            alert.service || 'unknown',
            alert.type as any
          ));
        }
      });
      
      this.portMonitor.start().catch(console.error);
    }
  }
  
  /**
   * Scan input for security threats
   */
  async scanInput(
    text: string, 
    context: SecurityContext = {}
  ): Promise<SecurityScanResult> {
    const threats: string[] = [];
    let blocked = false;
    let sanitized = text;
    let maxConfidence = 0;
    const details: Record<string, any> = {};
    
    // Prompt injection detection
    if (this.config.securityConfig.promptInjection.enabled) {
      const promptThreat = detectPromptInjection(
        text,
        this.config.securityConfig.promptInjection.sensitivity,
        this.config.securityConfig.promptInjection.customPatterns
      );
      
      if (promptThreat.threats.length > 0) {
        threats.push(...promptThreat.threats);
        maxConfidence = Math.max(maxConfidence, promptThreat.confidence);
        details.promptInjection = promptThreat;
        
        if (promptThreat.blocked) {
          if (this.config.securityConfig.promptInjection.mode === 'block') {
            blocked = true;
          } else if (this.config.securityConfig.promptInjection.mode === 'sanitize' && 
                     promptThreat.sanitized) {
            sanitized = promptThreat.sanitized;
          }
        }
        
        // Log threat
        if (this.config.securityConfig.promptInjection.logDetections) {
          this.logThreat(SecurityEventHelpers.promptInjection(
            text,
            promptThreat.threats,
            promptThreat.score,
            context.agentId,
            context.sourceIp
          ));
        }
      }
    }
    
    // SQL injection detection
    if (this.config.securityConfig.sqlInjection.enabled) {
      const normalizedText = normalizeSqlInput(text);
      const sqlThreat = detectSqlInjection(normalizedText, 'tool_args');
      
      if (sqlThreat.threats.length > 0) {
        threats.push(...sqlThreat.threats);
        maxConfidence = Math.max(maxConfidence, sqlThreat.confidence);
        details.sqlInjection = sqlThreat;
        
        if (sqlThreat.blocked && this.config.securityConfig.sqlInjection.mode === 'block') {
          blocked = true;
        }
        
        // Log threat
        if (this.config.securityConfig.sqlInjection.logDetections) {
          this.logThreat(SecurityEventHelpers.sqlInjection(
            text,
            sqlThreat.threats,
            sqlThreat.score,
            'input_scan',
            context.agentId,
            context.sourceIp
          ));
        }
      }
    }
    
    // Input validation/sanitization
    if (this.config.securityConfig.inputValidation.enabled) {
      const sanitizationResult = sanitizeInput(sanitized, {
        maxLength: this.config.securityConfig.inputValidation.maxInputLength,
        maxJsonDepth: this.config.securityConfig.inputValidation.maxJsonDepth,
        stripHtml: this.config.securityConfig.inputValidation.stripHtml,
        blockScripts: this.config.securityConfig.inputValidation.blockScripts,
        sanitizeUnicode: this.config.securityConfig.inputValidation.sanitizeUnicode
      });
      
      if (sanitizationResult.violations.length > 0) {
        threats.push(...sanitizationResult.violations);
        details.inputValidation = sanitizationResult;
        
        if (sanitizationResult.blocked) {
          blocked = true;
        } else {
          sanitized = sanitizationResult.sanitized;
        }
        
        // Log violations
        this.logThreat(SecurityEventHelpers.inputViolation(
          sanitizationResult.violations,
          text,
          sanitizationResult.blocked,
          context.agentId,
          context.sourceIp
        ));
      }
    }
    
    return {
      blocked,
      threats: [...new Set(threats)], // Remove duplicates
      sanitized: sanitized !== text ? sanitized : undefined,
      confidence: maxConfidence,
      details
    };
  }
  
  /**
   * Scan output for secrets and PII
   */
  async scanOutput(
    text: string,
    context: SecurityContext = {}
  ): Promise<FilterResult> {
    if (!this.config.securityConfig.outputFiltering.enabled) {
      return {
        filtered: text,
        detections: [],
        blocked: false,
        redactionCount: 0
      };
    }
    
    const result = filterOutput(
      text,
      this.config.securityConfig.outputFiltering.scanForSecrets,
      this.config.securityConfig.outputFiltering.scanForPii,
      this.config.securityConfig.outputFiltering.mode,
      this.config.securityConfig.outputFiltering.customRedactPatterns
    );
    
    // Log significant detections
    if (result.detections.length > 0 && this.config.securityConfig.outputFiltering.logDetections) {
      for (const detection of result.detections) {
        if (detection.confidence > 0.7) {
          this.logThreat(SecurityEventHelpers.secretLeak(
            detection.type,
            'agent_output',
            detection.confidence,
            context.agentId
          ));
        }
      }
    }
    
    return result;
  }
  
  /**
   * Check brute force protection status
   */
  checkBruteForce(ip: string) {
    return this.bruteForceProtection?.isAllowed(ip) || { locked: false, attempts: 0 };
  }
  
  /**
   * Record failed authentication attempt
   */
  recordFailedAuth(ip: string, type: 'login' | 'api_key', identifier?: string): void {
    if (this.bruteForceProtection) {
      if (type === 'login') {
        this.bruteForceProtection.recordFailedLogin(ip, identifier);
      } else {
        this.bruteForceProtection.recordFailedApiKey(ip, identifier);
      }
    }
  }
  
  /**
   * Record successful authentication
   */
  recordSuccessfulAuth(ip: string): void {
    this.bruteForceProtection?.recordSuccess(ip);
  }
  
  /**
   * Perform port scan
   */
  async performPortScan(): Promise<PortScanResult> {
    const previousResult = this.portMonitor?.getLastScanResult();
    
    return scanPorts(
      'localhost',
      undefined,
      previousResult
    );
  }
  
  /**
   * Get CSP policy for request
   */
  getCspPolicy(request?: any): string {
    if (!this.config.securityConfig.contentSecurity.enabled) {
      return '';
    }
    
    const cspConfig: CspConfig = {
      enabled: true,
      cspPolicy: this.config.securityConfig.contentSecurity.cspPolicy,
      frameAncestors: this.config.securityConfig.contentSecurity.frameAncestors,
      scriptSrc: this.config.securityConfig.contentSecurity.scriptSrc,
      connectSrc: this.config.securityConfig.contentSecurity.connectSrc
    };
    
    return buildCspPolicy(cspConfig);
  }
  
  /**
   * Apply CSP headers to response
   */
  applyCspHeaders(response: any, request?: any): void {
    if (!this.config.securityConfig.contentSecurity.enabled) {
      return;
    }
    
    const cspConfig: CspConfig = {
      enabled: true,
      cspPolicy: this.config.securityConfig.contentSecurity.cspPolicy,
      frameAncestors: this.config.securityConfig.contentSecurity.frameAncestors,
      scriptSrc: this.config.securityConfig.contentSecurity.scriptSrc,
      connectSrc: this.config.securityConfig.contentSecurity.connectSrc
    };
    
    applyCspHeader(response, cspConfig);
  }
  
  /**
   * Get merged configuration for agent
   */
  getConfig(agentId?: string, agentOverrides?: Partial<SecurityConfig>): SecurityConfig {
    return mergeSecurityConfig(
      this.config.securityConfig,
      agentOverrides || {}
    );
  }
  
  /**
   * Log security threat
   */
  private async logThreat(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    if (this.threatLogger) {
      await this.threatLogger.logThreat(event);
    }
    
    if (this.config.onThreatDetected) {
      this.config.onThreatDetected(event as SecurityEvent);
    }
  }
  
  /**
   * Get security events
   */
  async getSecurityEvents(filter: SecurityEventFilter = {}) {
    return this.threatLogger?.getEvents(filter) || [];
  }
  
  /**
   * Get security statistics
   */
  async getSecurityStats(fromDate?: string, toDate?: string) {
    return this.threatLogger?.getStats(fromDate, toDate);
  }
  
  /**
   * Clean up old security events
   */
  async cleanupEvents(): Promise<number> {
    if (this.threatLogger && this.config.securityConfig.auditSecurity.enabled) {
      return this.threatLogger.cleanup(this.config.securityConfig.auditSecurity.retentionDays);
    }
    return 0;
  }
  
  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config.securityConfig = mergeSecurityConfig(
      this.config.securityConfig,
      newConfig
    );
    
    // Reinitialize modules if needed
    this.initializeModules();
  }
  
  /**
   * Stop all security modules
   */
  async stop(): Promise<void> {
    if (this.threatLogger) {
      await this.threatLogger.stop();
    }
    
    if (this.bruteForceProtection) {
      this.bruteForceProtection.stop();
    }
    
    if (this.portMonitor) {
      this.portMonitor.stop();
    }
  }
  
  /**
   * Health check for security engine
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, { status: boolean; message?: string }>;
  }> {
    const checks: Record<string, { status: boolean; message?: string }> = {};
    
    // Check threat logger
    checks.threatLogger = {
      status: !!this.threatLogger,
      message: this.threatLogger ? 'Active' : 'Not configured'
    };
    
    // Check brute force protection
    checks.bruteForceProtection = {
      status: this.config.securityConfig.bruteForce.enabled ? !!this.bruteForceProtection : true,
      message: this.bruteForceProtection ? 'Active' : 'Disabled'
    };
    
    // Check port monitoring
    checks.portMonitoring = {
      status: this.config.securityConfig.portSecurity.enabled ? !!this.portMonitor : true,
      message: this.portMonitor ? 'Active' : 'Disabled'
    };
    
    const healthyCount = Object.values(checks).filter(c => c.status).length;
    const totalCount = Object.keys(checks).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalCount) {
      status = 'healthy';
    } else if (healthyCount > totalCount / 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }
    
    return { status, checks };
  }
}

/**
 * Singleton security engine instance
 */
let globalSecurityEngine: SecurityEngine | null = null;

/**
 * Initialize global security engine
 */
export function initSecurityEngine(config: SecurityEngineConfig): void {
  if (globalSecurityEngine) {
    globalSecurityEngine.stop();
  }
  
  globalSecurityEngine = new SecurityEngine(config);
}

/**
 * Get global security engine instance
 */
export function getSecurityEngine(): SecurityEngine | null {
  return globalSecurityEngine;
}

/**
 * Middleware factory for web frameworks
 */
export function createSecurityMiddleware(
  securityEngine: SecurityEngine,
  options: {
    scanInput?: boolean;
    scanOutput?: boolean;
    applyCsp?: boolean;
    checkBruteForce?: boolean;
    extractIp?: (req: any) => string;
  } = {}
) {
  const {
    scanInput = true,
    applyCsp = true,
    checkBruteForce = true,
    extractIp = (req: any) => req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '127.0.0.1'
  } = options;
  
  return async (req: any, res: any, next: any) => {
    const ip = extractIp(req);
    const context: SecurityContext = {
      sourceIp: ip,
      userAgent: req.headers['user-agent'],
      requestPath: req.path || req.url
    };
    
    // Check brute force protection
    if (checkBruteForce) {
      const bfStatus = securityEngine.checkBruteForce(ip);
      if (bfStatus.locked) {
        res.status(429);
        return res.json({
          error: 'Too many failed attempts',
          remainingMinutes: bfStatus.remainingTime
        });
      }
    }
    
    // Apply CSP headers
    if (applyCsp) {
      securityEngine.applyCspHeaders(res, req);
    }
    
    // Add security context to request
    req.securityContext = context;
    req.securityEngine = securityEngine;
    
    if (next) {
      next();
    }
  };
}

// Export all types and classes
export type { 
  SecurityConfig,
  SecurityContext,
  SecurityScanResult,
  SecurityEvent,
  PromptThreat,
  SqlThreat,
  SanitizationResult,
  FilterResult,
  PortScanResult,
  CspConfig
};

export {
  SecurityEventHelpers,
  mergeSecurityConfig,
  DEFAULT_SECURITY_CONFIG,
  detectPromptInjection,
  detectSqlInjection,
  sanitizeInput,
  filterOutput,
  BruteForceProtection,
  PortMonitor,
  buildCspPolicy,
  ThreatLogger
};