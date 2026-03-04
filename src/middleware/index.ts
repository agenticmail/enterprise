/**
 * Enterprise Middleware Stack
 * 
 * Rate limiting, request logging, error handling, validation,
 * CORS, request IDs, and security headers.
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import { KeyedRateLimiter, requestId } from '../lib/resilience.js';
import type { DatabaseAdapter } from '../db/adapter.js';

// ─── Request ID ──────────────────────────────────────────

export function requestIdMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const id = c.req.header('X-Request-Id') || requestId();
    c.set('requestId' as any, id);
    c.header('X-Request-Id', id);
    await next();
  };
}

// ─── Request Logging ─────────────────────────────────────

export function requestLogger(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    await next();

    const elapsed = Date.now() - start;
    const status = c.res.status;
    const reqId = c.get('requestId' as any) || '-';

    // Structured log line
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    console.log(
      `[${new Date().toISOString()}] ${level} ${method} ${path} ${status} ${elapsed}ms req=${reqId}`,
    );
  };
}

// ─── HTTPS Enforcement ──────────────────────────────────

/**
 * Require HTTPS for all requests (DB-backed).
 * Reads enabled flag + exclude paths from firewallConfig.network.httpsEnforcement.
 * Falls back to NODE_ENV check if DB config not set.
 */
export function requireHttps(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const netConfig = await getNetworkConfig();
    const https = netConfig.network?.httpsEnforcement;

    // If DB config exists, respect it; otherwise fall back to NODE_ENV
    const enforcing = https?.enabled ?? (process.env.NODE_ENV === 'production');
    if (!enforcing) return next();

    // Check exclude paths from DB
    const excludePaths = https?.excludePaths || [];
    if (excludePaths.some((p: string) => c.req.path.startsWith(p))) {
      return next();
    }

    // Allow localhost/loopback connections (internal service-to-service)
    const host = c.req.header('host') || '';
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
      return next();
    }

    const isSecure =
      c.req.url.startsWith('https://') ||
      c.req.header('x-forwarded-proto') === 'https' ||
      c.req.header('x-forwarded-ssl') === 'on';
    if (!isSecure) {
      return c.json({ error: 'HTTPS required by security policy', code: 'HTTPS_REQUIRED' }, 403);
    }
    await next();
  };
}

// ─── Rate Limiting ───────────────────────────────────────

interface RateLimitConfig {
  /** Requests per window */
  limit: number;
  /** Window in seconds */
  windowSec: number;
  /** Key extractor (default: IP) */
  keyFn?: (c: Context) => string;
  /** Skip rate limiting for these paths */
  skipPaths?: string[];
}

export function rateLimiter(config: RateLimitConfig): MiddlewareHandler {
  let limiter = new KeyedRateLimiter({
    maxTokens: config.limit,
    refillRate: config.limit / config.windowSec,
  });
  let _currentLimit = config.limit;
  let _currentSkipPaths = config.skipPaths || [];

  return async (c: Context, next: Next) => {
    // Read DB config for dynamic overrides
    const netConfig = await getNetworkConfig();
    const dbRl = netConfig.network?.rateLimit;

    // If DB says disabled, pass through
    if (dbRl?.enabled === false) return next();

    // Hot-reload: if DB limit changed, rebuild the limiter
    const effectiveLimit = dbRl?.requestsPerMinute || config.limit;
    if (effectiveLimit !== _currentLimit) {
      _currentLimit = effectiveLimit;
      limiter = new KeyedRateLimiter({
        maxTokens: _currentLimit,
        refillRate: _currentLimit / config.windowSec,
      });
    }

    // Merge skip paths: startup defaults + DB overrides
    const skipPaths = [...(config.skipPaths || []), ...(dbRl?.skipPaths || [])];

    // Skip configured paths
    if (skipPaths.some(p => c.req.path.startsWith(p))) {
      return next();
    }

    const key = config.keyFn?.(c) ||
      (c as any).get?.('clientIp') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    if (!limiter.tryConsume(key)) {
      const retryAfter = Math.ceil(limiter.getRetryAfterMs(key) / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(_currentLimit));
      c.header('X-RateLimit-Remaining', '0');
      return c.json(
        { error: 'Too many requests', retryAfter },
        429,
      );
    }

    await next();
  };
}

// ─── Security Headers (DB-backed) ────────────────────────

import { getNetworkConfig } from './network-config.js';

export function securityHeaders(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    await next();

    // Read security header config from DB (cached 15s)
    const netConfig = await getNetworkConfig();
    const sh = netConfig.network?.securityHeaders;

    // X-Content-Type-Options
    if (sh?.xContentTypeOptions !== false) {
      c.header('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    const xfo = sh?.xFrameOptions || 'DENY';
    if (xfo !== 'ALLOW') {
      c.header('X-Frame-Options', xfo);
    }

    // XSS Protection (legacy — CSP is better, but configurable)
    c.header('X-XSS-Protection', '0');

    // Referrer-Policy
    c.header('Referrer-Policy', sh?.referrerPolicy || 'strict-origin-when-cross-origin');

    // Permissions-Policy
    c.header('Permissions-Policy', sh?.permissionsPolicy || 'camera=(), microphone=(), geolocation=()');

    // HSTS — only behind TLS, respects DB toggle + max-age
    const isTls = c.req.url.startsWith('https://') || c.req.header('x-forwarded-proto') === 'https';
    if (isTls && sh?.hsts !== false) {
      const maxAge = sh?.hstsMaxAge || 31536000;
      c.header('Strict-Transport-Security', `max-age=${maxAge}; includeSubDomains`);
    }
  };
}

// ─── Error Handler ───────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

export function errorHandler(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (err: any) {
      const reqId = c.get('requestId' as any);
      const status = err.status || err.statusCode || 500;
      const message = status >= 500 ? 'Internal server error' : err.message;

      // Log full error for 5xx
      if (status >= 500) {
        console.error(`[${new Date().toISOString()}] ERROR req=${reqId}`, err);
      }

      const body: ApiError = {
        error: message,
        code: err.code,
        requestId: reqId,
      };

      // Include validation details for 400s
      if (status === 400 && err.details) {
        body.details = err.details;
      }

      return c.json(body, status);
    }
  };
}

// ─── Input Validation ────────────────────────────────────

export class ValidationError extends Error {
  status = 400;
  code = 'VALIDATION_ERROR';
  details: Record<string, string>;

  constructor(details: Record<string, string>) {
    const fields = Object.keys(details).join(', ');
    super(`Validation failed: ${fields}`);
    this.details = details;
  }
}

type Validator = {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'uuid' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
};

export function validate(body: Record<string, any>, validators: Validator[]): void {
  const errors: Record<string, string> = {};

  for (const v of validators) {
    const value = body[v.field];

    if (value === undefined || value === null || value === '') {
      if (v.required) errors[v.field] = 'Required';
      continue;
    }

    switch (v.type) {
      case 'string':
        if (typeof value !== 'string') { errors[v.field] = 'Must be a string'; break; }
        if (v.minLength && value.length < v.minLength) errors[v.field] = `Min length: ${v.minLength}`;
        if (v.maxLength && value.length > v.maxLength) errors[v.field] = `Max length: ${v.maxLength}`;
        if (v.pattern && !v.pattern.test(value)) errors[v.field] = 'Invalid format';
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) { errors[v.field] = 'Must be a number'; break; }
        if (v.min !== undefined && value < v.min) errors[v.field] = `Min: ${v.min}`;
        if (v.max !== undefined && value > v.max) errors[v.field] = `Max: ${v.max}`;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors[v.field] = 'Must be a boolean';
        break;
      case 'email':
        if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          errors[v.field] = 'Invalid email';
        break;
      case 'url':
        try { new URL(value); } catch { errors[v.field] = 'Invalid URL'; }
        break;
      case 'uuid':
        if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
          errors[v.field] = 'Invalid UUID';
        break;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }
}

// ─── Audit Logger Middleware ─────────────────────────────

export function auditLogger(db: DatabaseAdapter): MiddlewareHandler {
  // Only audit mutating operations
  const AUDIT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return async (c: Context, next: Next) => {
    await next();

    if (!AUDIT_METHODS.has(c.req.method)) return;
    if (c.res.status >= 400) return; // Don't audit failed requests

    try {
      const userId = c.get('userId' as any) || 'anonymous';
      const path = c.req.path;
      const method = c.req.method;

      // Derive action from path + method
      const segments = path.split('/').filter(Boolean);
      const resource = segments[segments.length - 2] || segments[segments.length - 1] || 'unknown';
      const actionMap: Record<string, string> = {
        POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete',
      };
      const action = `${resource}.${actionMap[method] || method.toLowerCase()}`;

      const userEmail = c.get('userEmail' as any) || undefined;
      const userRole = c.get('userRole' as any) || undefined;

      await db.logEvent({
        actor: userId,
        actorType: 'user',
        action,
        resource: path,
        details: {
          ...(userEmail ? { email: userEmail } : {}),
          ...(userRole ? { role: userRole } : {}),
          method,
        },
        ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip'),
      });
    } catch {
      // Never let audit logging break the request
    }
  };
}

// ─── RBAC Middleware ─────────────────────────────────────

type Role = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function requireRole(minRole: Role): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const userRole = c.get('userRole' as any) as Role | undefined;

    // API keys bypass role check (scopes handle auth)
    if (c.get('authType' as any) === 'api-key') {
      return next();
    }

    if (!userRole || ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minRole]) {
      return c.json({
        error: 'Insufficient permissions',
        required: minRole,
        current: userRole || 'none',
      }, 403);
    }

    return next();
  };
}

// ─── Re-exports ──────────────────────────────────────────

export { ipAccessControl, invalidateFirewallCache } from './firewall.js';
export { createEgressFilter, validateEgress, type EgressFilter } from './egress-filter.js';
export { setNetworkDb, invalidateNetworkConfig, getNetworkConfig, getNetworkConfigSync, onNetworkConfigChange } from './network-config.js';
export { dnsRebindingProtection } from './dns-rebinding.js';
export { requestBodyLimit, requestTimeout } from './request-limits.js';
export { geoIpRestriction } from './geo-ip.js';
export { initProxyConfig } from './proxy-config.js';
export { transportEncryptionMiddleware, setTransportEncryptionConfig, getConfig as getTransportEncryptionConfig, encryptPayload as encryptTransportPayload, decryptPayload as decryptTransportPayload, resetKeys as resetTransportKeys, loadConfig as loadTransportEncryptionConfig, setSettingsDb as setTransportEncryptionSettingsDb } from './transport-encryption.js';
