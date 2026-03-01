/**
 * Security Threat Logger
 * 
 * Logs security events to database for monitoring and analysis
 */

export interface SecurityEvent {
  id?: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  agentId?: string;
  details: Record<string, any>;
  sourceIp?: string;
  timestamp?: string;
}

export type SecurityEventType =
  | 'prompt_injection'
  | 'sql_injection' 
  | 'xss_attempt'
  | 'brute_force'
  | 'port_alert'
  | 'secret_leak'
  | 'input_violation'
  | 'command_injection'
  | 'path_traversal'
  | 'auth_failure'
  | 'permission_denied'
  | 'suspicious_activity'
  | 'policy_violation'
  | 'rate_limit_exceeded'
  | 'csp_violation'
  | 'file_access_violation'
  | 'network_anomaly'
  | 'data_exfiltration'
  | 'privilege_escalation';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEventFilter {
  eventType?: SecurityEventType[];
  severity?: SecuritySeverity[];
  agentId?: string;
  sourceIp?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface SecurityEventStats {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<SecuritySeverity, number>;
  topSourceIps: Array<{ ip: string; count: number }>;
  recentTrends: Array<{ date: string; count: number }>;
}

/**
 * Database interface for security events
 */
export interface SecurityEventDatabase {
  logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void>;
  getEvents(filter: SecurityEventFilter): Promise<SecurityEvent[]>;
  getEventStats(fromDate?: string, toDate?: string): Promise<SecurityEventStats>;
  cleanupOldEvents(retentionDays: number): Promise<number>;
}

/**
 * Main threat logger class
 */
export class ThreatLogger {
  private eventQueue: SecurityEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private readonly maxQueueSize = 100;
  private readonly flushIntervalMs = 5000; // 5 seconds
  
  constructor(private db: SecurityEventDatabase) {
    this.startPeriodicFlush();
  }
  
  /**
   * Log a security event
   */
  async logThreat(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const enrichedEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };
    
    // Add to queue for batch processing
    this.eventQueue.push(enrichedEvent);
    
    // Flush immediately for critical events
    if (event.severity === 'critical') {
      await this.flush();
    } else if (this.eventQueue.length >= this.maxQueueSize) {
      // Flush if queue is full
      await this.flush();
    }
  }
  
  /**
   * Start periodic flushing of queued events
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush().catch(error => {
          console.error('Failed to flush security events:', error);
        });
      }
    }, this.flushIntervalMs);
  }
  
  /**
   * Flush queued events to database
   */
  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    
    const events = [...this.eventQueue];
    this.eventQueue = [];
    
    try {
      // Process events in batches
      for (const event of events) {
        await this.db.logEvent(event);
      }
    } catch (error) {
      // Re-queue failed events (up to max queue size)
      const remainingSpace = this.maxQueueSize - this.eventQueue.length;
      if (remainingSpace > 0) {
        this.eventQueue.unshift(...events.slice(0, remainingSpace));
      }
      throw error;
    }
  }
  
  /**
   * Get security events with filtering
   */
  async getEvents(filter: SecurityEventFilter = {}): Promise<SecurityEvent[]> {
    return this.db.getEvents(filter);
  }
  
  /**
   * Get security event statistics
   */
  async getStats(fromDate?: string, toDate?: string): Promise<SecurityEventStats> {
    return this.db.getEventStats(fromDate, toDate);
  }
  
  /**
   * Clean up old events based on retention policy
   */
  async cleanup(retentionDays: number): Promise<number> {
    return this.db.cleanupOldEvents(retentionDays);
  }
  
  /**
   * Stop the threat logger
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Final flush
    await this.flush();
  }
}

/**
 * Helper functions for creating common security events
 */
export class SecurityEventHelpers {
  static promptInjection(
    content: string,
    threats: string[],
    score: number,
    agentId?: string,
    sourceIp?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    return {
      eventType: 'prompt_injection',
      severity: score > 80 ? 'critical' : score > 60 ? 'high' : score > 40 ? 'medium' : 'low',
      agentId,
      sourceIp,
      details: {
        content: content.substring(0, 500), // Truncate for storage
        threats,
        score,
        contentLength: content.length
      }
    };
  }
  
  static sqlInjection(
    query: string,
    threats: string[],
    score: number,
    context: string,
    agentId?: string,
    sourceIp?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    return {
      eventType: 'sql_injection',
      severity: score > 80 ? 'critical' : score > 60 ? 'high' : 'medium',
      agentId,
      sourceIp,
      details: {
        query: query.substring(0, 500),
        threats,
        score,
        context
      }
    };
  }
  
  static bruteForce(
    ip: string,
    attemptType: 'login' | 'api_key',
    attempts: number,
    identifier?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    return {
      eventType: 'brute_force',
      severity: attempts > 20 ? 'critical' : attempts > 10 ? 'high' : 'medium',
      sourceIp: ip,
      details: {
        attemptType,
        attempts,
        identifier
      }
    };
  }
  
  static portAlert(
    port: number,
    service: string,
    alertType: 'new_port' | 'unexpected_service'
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    return {
      eventType: 'port_alert',
      severity: alertType === 'unexpected_service' ? 'high' : 'medium',
      details: {
        port,
        service,
        alertType
      }
    };
  }
  
  static secretLeak(
    secretType: string,
    location: string,
    confidence: number,
    agentId?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    return {
      eventType: 'secret_leak',
      severity: confidence > 0.9 ? 'critical' : confidence > 0.7 ? 'high' : 'medium',
      agentId,
      details: {
        secretType,
        location,
        confidence
      }
    };
  }
  
  static inputViolation(
    violations: string[],
    input: string,
    blocked: boolean,
    agentId?: string,
    sourceIp?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    const severity = violations.some(v => 
      v.includes('script') || v.includes('command') || v.includes('path_traversal')
    ) ? 'high' : 'medium';
    
    return {
      eventType: 'input_violation',
      severity,
      agentId,
      sourceIp,
      details: {
        violations,
        inputLength: input.length,
        blocked,
        inputSample: input.substring(0, 200)
      }
    };
  }
  
  static authFailure(
    reason: string,
    username?: string,
    sourceIp?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    return {
      eventType: 'auth_failure',
      severity: 'medium',
      sourceIp,
      details: {
        reason,
        username
      }
    };
  }
  
  static cspViolation(
    violation: any,
    sourceIp?: string
  ): Omit<SecurityEvent, 'id' | 'timestamp'> {
    const isScript = violation.violatedDirective?.includes('script');
    
    return {
      eventType: 'csp_violation',
      severity: isScript ? 'high' : 'medium',
      sourceIp,
      details: {
        blockedUri: violation.blockedUri,
        violatedDirective: violation.violatedDirective,
        documentUri: violation.documentUri,
        sourceFile: violation.sourceFile,
        lineNumber: violation.lineNumber
      }
    };
  }
}

/**
 * Event aggregation helpers
 */
export class SecurityEventAggregator {
  /**
   * Aggregate events by time window
   */
  static aggregateByTimeWindow(
    events: SecurityEvent[],
    windowMinutes: number = 60
  ): Array<{ timestamp: string; count: number; severity: Record<SecuritySeverity, number> }> {
    const windowMs = windowMinutes * 60 * 1000;
    const buckets = new Map<number, { count: number; severity: Record<SecuritySeverity, number> }>();
    
    for (const event of events) {
      const eventTime = new Date(event.timestamp!).getTime();
      const bucketTime = Math.floor(eventTime / windowMs) * windowMs;
      
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, {
          count: 0,
          severity: { low: 0, medium: 0, high: 0, critical: 0 }
        });
      }
      
      const bucket = buckets.get(bucketTime)!;
      bucket.count++;
      bucket.severity[event.severity]++;
    }
    
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, data]) => ({
        timestamp: new Date(timestamp).toISOString(),
        count: data.count,
        severity: data.severity
      }));
  }
  
  /**
   * Find security patterns and anomalies
   */
  static findPatterns(events: SecurityEvent[]): {
    suspiciousIps: string[];
    repeatedThreats: Array<{ type: SecurityEventType; count: number }>;
    timePatterns: Array<{ hour: number; count: number }>;
  } {
    const ipCounts = new Map<string, number>();
    const threatCounts = new Map<SecurityEventType, number>();
    const hourCounts = new Map<number, number>();
    
    for (const event of events) {
      // Count by IP
      if (event.sourceIp) {
        ipCounts.set(event.sourceIp, (ipCounts.get(event.sourceIp) || 0) + 1);
      }
      
      // Count by threat type
      threatCounts.set(event.eventType, (threatCounts.get(event.eventType) || 0) + 1);
      
      // Count by hour
      const hour = new Date(event.timestamp!).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
    
    // Find suspicious IPs (more than 10 events)
    const suspiciousIps = Array.from(ipCounts.entries())
      .filter(([_, count]) => count > 10)
      .map(([ip, _]) => ip);
    
    // Find repeated threats (more than 5 occurrences)
    const repeatedThreats = Array.from(threatCounts.entries())
      .filter(([_, count]) => count > 5)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    
    // Time patterns
    const timePatterns = Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count);
    
    return {
      suspiciousIps,
      repeatedThreats,
      timePatterns
    };
  }
  
  /**
   * Generate security report
   */
  static generateReport(
    events: SecurityEvent[],
    fromDate?: string,
    toDate?: string
  ): {
    summary: {
      totalEvents: number;
      criticalEvents: number;
      topThreats: Array<{ type: SecurityEventType; count: number }>;
      affectedAgents: number;
    };
    patterns: ReturnType<typeof SecurityEventAggregator.findPatterns>;
    timeline: ReturnType<typeof SecurityEventAggregator.aggregateByTimeWindow>;
  } {
    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    const threatCounts = new Map<SecurityEventType, number>();
    const agentIds = new Set<string>();
    
    for (const event of events) {
      threatCounts.set(event.eventType, (threatCounts.get(event.eventType) || 0) + 1);
      if (event.agentId) {
        agentIds.add(event.agentId);
      }
    }
    
    const topThreats = Array.from(threatCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      summary: {
        totalEvents: events.length,
        criticalEvents,
        topThreats,
        affectedAgents: agentIds.size
      },
      patterns: SecurityEventAggregator.findPatterns(events),
      timeline: SecurityEventAggregator.aggregateByTimeWindow(events)
    };
  }
}

/**
 * Create a singleton threat logger instance
 */
let globalThreatLogger: ThreatLogger | null = null;

export function initThreatLogger(db: SecurityEventDatabase): void {
  if (globalThreatLogger) {
    globalThreatLogger.stop();
  }
  globalThreatLogger = new ThreatLogger(db);
}

export function getThreatLogger(): ThreatLogger | null {
  return globalThreatLogger;
}