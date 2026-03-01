/**
 * Brute Force Protection
 * 
 * In-memory tracking of failed login attempts with sliding window
 * and automatic cleanup to prevent memory leaks.
 */

export interface BruteForceAttempt {
  ip: string;
  type: 'login' | 'api_key';
  timestamp: number;
  identifier?: string; // username, email, or api key prefix
}

export interface BruteForceStatus {
  locked: boolean;
  attempts: number;
  lockoutUntil?: number;
  remainingTime?: number;
}

export interface BruteForceConfig {
  maxLoginAttempts: number;
  maxApiKeyAttempts: number;
  lockoutDurationMinutes: number;
  trackFailedAttempts: boolean;
  windowSizeMinutes?: number; // Sliding window size (default: lockout duration)
  cleanupIntervalMinutes?: number; // How often to clean old entries (default: 60)
}

/**
 * In-memory store for tracking attempts
 */
class AttemptStore {
  private attempts = new Map<string, BruteForceAttempt[]>();
  private lockouts = new Map<string, number>(); // IP -> lockout expiry time
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(private config: BruteForceConfig) {
    this.startCleanup();
  }
  
  /**
   * Start automatic cleanup of old entries
   */
  private startCleanup(): void {
    const intervalMs = (this.config.cleanupIntervalMinutes || 60) * 60 * 1000;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
  
  /**
   * Clean up old attempts and expired lockouts
   */
  private cleanup(): void {
    const now = Date.now();
    const windowMs = (this.config.windowSizeMinutes || this.config.lockoutDurationMinutes) * 60 * 1000;
    const cutoff = now - windowMs;
    
    // Clean old attempts
    for (const [ip, attempts] of this.attempts.entries()) {
      const recentAttempts = attempts.filter(attempt => attempt.timestamp > cutoff);
      
      if (recentAttempts.length === 0) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, recentAttempts);
      }
    }
    
    // Clean expired lockouts
    for (const [ip, expiry] of this.lockouts.entries()) {
      if (now > expiry) {
        this.lockouts.delete(ip);
      }
    }
  }
  
  /**
   * Record a failed attempt
   */
  recordAttempt(attempt: BruteForceAttempt): void {
    if (!this.config.trackFailedAttempts) return;
    
    const existing = this.attempts.get(attempt.ip) || [];
    existing.push(attempt);
    this.attempts.set(attempt.ip, existing);
    
    // Check if we need to lock out this IP
    this.checkLockout(attempt.ip, attempt.type);
  }
  
  /**
   * Check if an IP should be locked out
   */
  private checkLockout(ip: string, type: 'login' | 'api_key'): void {
    const attempts = this.getRecentAttempts(ip, type);
    const maxAttempts = type === 'login' ? this.config.maxLoginAttempts : this.config.maxApiKeyAttempts;
    
    if (attempts.length >= maxAttempts) {
      const lockoutMs = this.config.lockoutDurationMinutes * 60 * 1000;
      this.lockouts.set(ip, Date.now() + lockoutMs);
    }
  }
  
  /**
   * Get recent attempts for an IP and type within the sliding window
   */
  private getRecentAttempts(ip: string, type: 'login' | 'api_key'): BruteForceAttempt[] {
    const attempts = this.attempts.get(ip) || [];
    const windowMs = (this.config.windowSizeMinutes || this.config.lockoutDurationMinutes) * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    
    return attempts.filter(attempt => 
      attempt.type === type && attempt.timestamp > cutoff
    );
  }
  
  /**
   * Check if an IP is currently locked out
   */
  isLockedOut(ip: string): BruteForceStatus {
    const lockoutExpiry = this.lockouts.get(ip);
    const now = Date.now();
    
    if (lockoutExpiry && now < lockoutExpiry) {
      return {
        locked: true,
        attempts: 0, // Not relevant during lockout
        lockoutUntil: lockoutExpiry,
        remainingTime: Math.ceil((lockoutExpiry - now) / 1000 / 60) // minutes
      };
    }
    
    // If lockout expired, remove it
    if (lockoutExpiry) {
      this.lockouts.delete(ip);
    }
    
    // Count recent attempts for both types
    const loginAttempts = this.getRecentAttempts(ip, 'login');
    const apiAttempts = this.getRecentAttempts(ip, 'api_key');
    
    return {
      locked: false,
      attempts: Math.max(loginAttempts.length, apiAttempts.length)
    };
  }
  
  /**
   * Clear attempts for an IP (on successful login)
   */
  clearAttempts(ip: string): void {
    this.attempts.delete(ip);
    this.lockouts.delete(ip);
  }
  
  /**
   * Get stats for monitoring
   */
  getStats(): {
    totalIpsTracked: number;
    activeIpsLocked: number;
    totalAttempts: number;
    topOffenders: Array<{ ip: string; attempts: number }>;
  } {
    const totalIpsTracked = this.attempts.size;
    const activeIpsLocked = this.lockouts.size;
    
    let totalAttempts = 0;
    const ipAttemptCounts = new Map<string, number>();
    
    for (const [ip, attempts] of this.attempts.entries()) {
      const recentAttempts = this.getRecentAttempts(ip, 'login').length + 
                           this.getRecentAttempts(ip, 'api_key').length;
      totalAttempts += recentAttempts;
      ipAttemptCounts.set(ip, recentAttempts);
    }
    
    const topOffenders = Array.from(ipAttemptCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, attempts]) => ({ ip, attempts }));
    
    return {
      totalIpsTracked,
      activeIpsLocked,
      totalAttempts,
      topOffenders
    };
  }
  
  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

/**
 * Main brute force protection class
 */
export class BruteForceProtection {
  private store: AttemptStore;
  
  constructor(private config: BruteForceConfig) {
    this.store = new AttemptStore(config);
  }
  
  /**
   * Check if an IP is allowed to make a request
   */
  isAllowed(ip: string): BruteForceStatus {
    return this.store.isLockedOut(ip);
  }
  
  /**
   * Record a failed login attempt
   */
  recordFailedLogin(ip: string, username?: string): void {
    this.store.recordAttempt({
      ip,
      type: 'login',
      timestamp: Date.now(),
      identifier: username
    });
  }
  
  /**
   * Record a failed API key attempt
   */
  recordFailedApiKey(ip: string, keyPrefix?: string): void {
    this.store.recordAttempt({
      ip,
      type: 'api_key',
      timestamp: Date.now(),
      identifier: keyPrefix
    });
  }
  
  /**
   * Clear attempts for an IP (call on successful authentication)
   */
  recordSuccess(ip: string): void {
    this.store.clearAttempts(ip);
  }
  
  /**
   * Get protection statistics
   */
  getStats() {
    return this.store.getStats();
  }
  
  /**
   * Manually block an IP
   */
  blockIp(ip: string, durationMinutes?: number): void {
    const lockoutMs = (durationMinutes || this.config.lockoutDurationMinutes) * 60 * 1000;
    this.store['lockouts'].set(ip, Date.now() + lockoutMs);
  }
  
  /**
   * Manually unblock an IP
   */
  unblockIp(ip: string): void {
    this.store.clearAttempts(ip);
  }
  
  /**
   * Stop the protection system
   */
  stop(): void {
    this.store.stop();
  }
}

/**
 * Singleton instance for global use
 */
let globalProtection: BruteForceProtection | null = null;

/**
 * Initialize global brute force protection
 */
export function initBruteForceProtection(config: BruteForceConfig): void {
  if (globalProtection) {
    globalProtection.stop();
  }
  
  globalProtection = new BruteForceProtection(config);
}

/**
 * Get the global brute force protection instance
 */
export function getBruteForceProtection(): BruteForceProtection | null {
  return globalProtection;
}

/**
 * Express/Hono middleware factory
 */
export function createBruteForceMiddleware(
  protection: BruteForceProtection,
  options: {
    getClientIp?: (req: any) => string;
    onBlocked?: (ip: string, status: BruteForceStatus) => any;
  } = {}
) {
  const getIp = options.getClientIp || ((req: any) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           '127.0.0.1';
  });
  
  return async (req: any, res: any, next: any) => {
    const ip = getIp(req);
    const status = protection.isAllowed(ip);
    
    if (status.locked) {
      if (options.onBlocked) {
        return options.onBlocked(ip, status);
      }
      
      // Default response
      res.status(429);
      return res.json({
        error: 'Too many failed attempts',
        lockoutUntil: status.lockoutUntil,
        remainingMinutes: status.remainingTime
      });
    }
    
    // Add protection instance to request for use in auth handlers
    req.bruteForceProtection = protection;
    req.clientIp = ip;
    
    if (next) {
      return next();
    }
  };
}

/**
 * Utility to extract real client IP from various headers
 */
export function extractClientIp(req: any): string {
  // Check various headers for the real IP
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  const cfConnectingIp = req.headers['cf-connecting-ip']; // Cloudflare
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  // Fallback to connection info
  return req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.ip || 
         '127.0.0.1';
}

/**
 * Rate limiting helper (lighter than full brute force protection)
 */
export class SimpleRateLimit {
  private requests = new Map<string, number[]>();
  
  constructor(
    private windowMs: number = 15 * 60 * 1000, // 15 minutes
    private maxRequests: number = 100
  ) {}
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const existing = this.requests.get(identifier) || [];
    const recentRequests = existing.filter(time => time > windowStart);
    
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    
    return true;
  }
  
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(time => time > windowStart);
      
      if (recentRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, recentRequests);
      }
    }
  }
}