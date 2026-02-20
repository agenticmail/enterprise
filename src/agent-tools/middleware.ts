/**
 * AgenticMail Agent Tools — Execution Middleware
 *
 * Wraps every tool's execute() with cross-cutting concerns:
 * rate limiting, circuit breaking, audit logging, and telemetry.
 */

import { KeyedRateLimiter, CircuitBreaker, CircuitOpenError, requestId } from '../lib/resilience.js';
import type { AnyAgentTool, ToolResult } from './types.js';
import { errorResult } from './common.js';

// ─── Types ──────────────────────────────────────────────

export interface AuditEntry {
  traceId: string;
  toolName: string;
  toolCallId: string;
  agentId: string;
  timestamp: string;
  params: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
  outputSize?: number;
}

export interface AuditSink {
  log(entry: AuditEntry): void;
}

export interface TelemetryEntry {
  toolName: string;
  agentId: string;
  durationMs: number;
  success: boolean;
  outputSize: number;
  timestamp: string;
}

export interface TelemetrySink {
  record(entry: TelemetryEntry): void;
}

export interface ToolMiddlewareConfig {
  agentId?: string;
  audit?: {
    enabled?: boolean;
    sink?: AuditSink;
    redactKeys?: string[];
  };
  rateLimit?: {
    enabled?: boolean;
    overrides?: Record<string, { maxTokens: number; refillRate: number }>;
  };
  circuitBreaker?: {
    enabled?: boolean;
  };
  telemetry?: {
    enabled?: boolean;
    sink?: TelemetrySink;
  };
}

// ─── Default Audit Sink ─────────────────────────────────

var ConsoleAuditSink: AuditSink = {
  log: function(entry: AuditEntry) {
    console.log(JSON.stringify(entry));
  },
};

// ─── Default Rate Limits by Category ────────────────────

var DEFAULT_RATE_LIMITS: Record<string, { maxTokens: number; refillRate: number }> = {
  command:  { maxTokens: 10, refillRate: 10 / 60 },
  browser:  { maxTokens: 20, refillRate: 20 / 60 },
  web:      { maxTokens: 30, refillRate: 30 / 60 },
  file:     { maxTokens: 60, refillRate: 60 / 60 },
  search:   { maxTokens: 60, refillRate: 60 / 60 },
  memory:   { maxTokens: 60, refillRate: 60 / 60 },
};

// ─── Default Redact Keys ────────────────────────────────

var DEFAULT_REDACT_KEYS = [
  'apikey', 'api_key', 'secret', 'password', 'token', 'credential', 'authorization',
];

// ─── Param Redaction ────────────────────────────────────

export function redactParams(
  params: Record<string, unknown>,
  additionalKeys?: string[],
): Record<string, unknown> {
  var redactList = DEFAULT_REDACT_KEYS.slice();
  if (additionalKeys) {
    additionalKeys.forEach(function(k) {
      redactList.push(k.toLowerCase());
    });
  }
  var result: Record<string, unknown> = {};
  var keys = Object.keys(params);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var keyLower = key.toLowerCase();
    var shouldRedact = redactList.some(function(rk) {
      return keyLower.indexOf(rk) !== -1;
    });
    result[key] = shouldRedact ? '[REDACTED]' : params[key];
  }
  return result;
}

// ─── Module-level Circuit Breaker Map ───────────────────

var circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(toolName: string): CircuitBreaker {
  var cb = circuitBreakers.get(toolName);
  if (!cb) {
    cb = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeMs: 30_000,
      successThreshold: 2,
    });
    circuitBreakers.set(toolName, cb);
  }
  return cb;
}

// ─── Compute Output Size ────────────────────────────────

function computeOutputSize(result: ToolResult<unknown>): number {
  var size = 0;
  if (result.content) {
    result.content.forEach(function(block) {
      if (block.type === 'text') {
        size += block.text.length;
      } else if (block.type === 'image') {
        size += block.data.length;
      }
    });
  }
  return size;
}

// ─── Rate Limiter Resolution ────────────────────────────

function resolveRateLimiterOpts(
  tool: AnyAgentTool,
  overrides?: Record<string, { maxTokens: number; refillRate: number }>,
): { maxTokens: number; refillRate: number } {
  if (overrides && overrides[tool.name]) {
    return overrides[tool.name];
  }
  var category = tool.category || 'utility';
  return DEFAULT_RATE_LIMITS[category] || { maxTokens: 60, refillRate: 60 / 60 };
}

// ─── Module-level Rate Limiters by Category ─────────────

var rateLimiters = new Map<string, KeyedRateLimiter>();

function getRateLimiter(opts: { maxTokens: number; refillRate: number }): KeyedRateLimiter {
  var key = opts.maxTokens + ':' + opts.refillRate;
  var limiter = rateLimiters.get(key);
  if (!limiter) {
    limiter = new KeyedRateLimiter({ maxTokens: opts.maxTokens, refillRate: opts.refillRate });
    rateLimiters.set(key, limiter);
  }
  return limiter;
}

// ─── Main Wrapper ───────────────────────────────────────

export function wrapToolWithMiddleware(
  tool: AnyAgentTool,
  config: ToolMiddlewareConfig,
): AnyAgentTool {
  var agentId = config.agentId || 'unknown';
  var auditSink = config.audit?.sink || ConsoleAuditSink;
  var auditEnabled = config.audit?.enabled !== false;
  var rateLimitEnabled = config.rateLimit?.enabled !== false;
  var cbEnabled = config.circuitBreaker?.enabled !== false;
  var telemetryEnabled = config.telemetry?.enabled !== false && !!config.telemetry?.sink;
  var telemetrySink = config.telemetry?.sink;
  var useCircuitBreaker = cbEnabled && (tool.category === 'web' || tool.category === 'browser');
  var rlOpts = resolveRateLimiterOpts(tool, config.rateLimit?.overrides);

  var wrappedExecute = function(toolCallId: string, params: any): Promise<ToolResult<unknown>> {
    return (async function() {
      // 1. Rate limiting
      if (rateLimitEnabled) {
        var limiter = getRateLimiter(rlOpts);
        var rlKey = agentId + ':' + tool.name;
        if (!limiter.tryConsume(rlKey)) {
          var retryAfterMs = limiter.getRetryAfterMs(rlKey);
          return errorResult('Rate limited: ' + tool.name + '. Retry after ' + retryAfterMs + 'ms.');
        }
      }

      // 2. Setup tracing
      var traceId = requestId();
      var startTime = Date.now();
      var success = true;
      var errorMsg: string | undefined;
      var result: ToolResult<unknown>;

      try {
        // 3. Execute (with or without circuit breaker)
        if (useCircuitBreaker) {
          var cb = getCircuitBreaker(tool.name);
          try {
            result = await cb.execute(function() {
              return tool.execute(toolCallId, params);
            });
          } catch (err: any) {
            if (err instanceof CircuitOpenError) {
              return errorResult('Circuit breaker open for ' + tool.name + '. Service temporarily unavailable.');
            }
            throw err;
          }
        } else {
          result = await tool.execute(toolCallId, params);
        }
      } catch (err: any) {
        success = false;
        errorMsg = err?.message || String(err);
        result = errorResult(errorMsg!);
      }

      // 4. Timing
      var endTime = Date.now();
      var durationMs = endTime - startTime;
      var outputSize = computeOutputSize(result);

      // 5. Audit logging
      if (auditEnabled) {
        var redacted = redactParams(
          params as Record<string, unknown>,
          config.audit?.redactKeys,
        );
        auditSink.log({
          traceId: traceId,
          toolName: tool.name,
          toolCallId: toolCallId,
          agentId: agentId,
          timestamp: new Date(startTime).toISOString(),
          params: redacted,
          durationMs: durationMs,
          success: success,
          error: errorMsg,
          outputSize: outputSize,
        });
      }

      // 6. Telemetry
      if (telemetryEnabled && telemetrySink) {
        telemetrySink.record({
          toolName: tool.name,
          agentId: agentId,
          durationMs: durationMs,
          success: success,
          outputSize: outputSize,
          timestamp: new Date(startTime).toISOString(),
        });
      }

      return result;
    })();
  };

  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    execute: wrappedExecute,
    ownerOnly: tool.ownerOnly,
    category: tool.category,
    risk: tool.risk,
  };
}

// ─── Convenience: createToolMiddleware ───────────────────

export function createToolMiddleware(config: ToolMiddlewareConfig): {
  wrap(tool: AnyAgentTool): AnyAgentTool;
  destroy(): void;
} {
  var localRateLimiters: KeyedRateLimiter[] = [];
  var localCircuitBreakers = new Map<string, CircuitBreaker>();

  function getLocalRateLimiter(opts: { maxTokens: number; refillRate: number }): KeyedRateLimiter {
    var limiter = new KeyedRateLimiter({ maxTokens: opts.maxTokens, refillRate: opts.refillRate });
    localRateLimiters.push(limiter);
    return limiter;
  }

  function getLocalCircuitBreaker(toolName: string): CircuitBreaker {
    var cb = localCircuitBreakers.get(toolName);
    if (!cb) {
      cb = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeMs: 30_000,
        successThreshold: 2,
      });
      localCircuitBreakers.set(toolName, cb);
    }
    return cb;
  }

  var agentId = config.agentId || 'unknown';
  var auditSink = config.audit?.sink || ConsoleAuditSink;
  var auditEnabled = config.audit?.enabled !== false;
  var rateLimitEnabled = config.rateLimit?.enabled !== false;
  var cbEnabled = config.circuitBreaker?.enabled !== false;
  var telemetryEnabled = config.telemetry?.enabled !== false && !!config.telemetry?.sink;
  var telemetrySink = config.telemetry?.sink;

  // Cache rate limiters per opts key
  var rlCache = new Map<string, KeyedRateLimiter>();

  function getCachedRateLimiter(opts: { maxTokens: number; refillRate: number }): KeyedRateLimiter {
    var key = opts.maxTokens + ':' + opts.refillRate;
    var limiter = rlCache.get(key);
    if (!limiter) {
      limiter = getLocalRateLimiter(opts);
      rlCache.set(key, limiter);
    }
    return limiter;
  }

  function wrap(tool: AnyAgentTool): AnyAgentTool {
    var useCircuitBreaker = cbEnabled && (tool.category === 'web' || tool.category === 'browser');
    var rlOpts = resolveRateLimiterOpts(tool, config.rateLimit?.overrides);

    var wrappedExecute = function(toolCallId: string, params: any): Promise<ToolResult<unknown>> {
      return (async function() {
        // 1. Rate limiting
        if (rateLimitEnabled) {
          var limiter = getCachedRateLimiter(rlOpts);
          var rlKey = agentId + ':' + tool.name;
          if (!limiter.tryConsume(rlKey)) {
            var retryAfterMs = limiter.getRetryAfterMs(rlKey);
            return errorResult('Rate limited: ' + tool.name + '. Retry after ' + retryAfterMs + 'ms.');
          }
        }

        var traceId = requestId();
        var startTime = Date.now();
        var success = true;
        var errorMsg: string | undefined;
        var result: ToolResult<unknown>;

        try {
          if (useCircuitBreaker) {
            var cb = getLocalCircuitBreaker(tool.name);
            try {
              result = await cb.execute(function() {
                return tool.execute(toolCallId, params);
              });
            } catch (err: any) {
              if (err instanceof CircuitOpenError) {
                return errorResult('Circuit breaker open for ' + tool.name + '. Service temporarily unavailable.');
              }
              throw err;
            }
          } else {
            result = await tool.execute(toolCallId, params);
          }
        } catch (err: any) {
          success = false;
          errorMsg = err?.message || String(err);
          result = errorResult(errorMsg!);
        }

        var endTime = Date.now();
        var durationMs = endTime - startTime;
        var outputSize = computeOutputSize(result);

        if (auditEnabled) {
          var redacted = redactParams(
            params as Record<string, unknown>,
            config.audit?.redactKeys,
          );
          auditSink.log({
            traceId: traceId,
            toolName: tool.name,
            toolCallId: toolCallId,
            agentId: agentId,
            timestamp: new Date(startTime).toISOString(),
            params: redacted,
            durationMs: durationMs,
            success: success,
            error: errorMsg,
            outputSize: outputSize,
          });
        }

        if (telemetryEnabled && telemetrySink) {
          telemetrySink.record({
            toolName: tool.name,
            agentId: agentId,
            durationMs: durationMs,
            success: success,
            outputSize: outputSize,
            timestamp: new Date(startTime).toISOString(),
          });
        }

        return result;
      })();
    };

    return {
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      execute: wrappedExecute,
      ownerOnly: tool.ownerOnly,
      category: tool.category,
      risk: tool.risk,
    };
  }

  function destroy(): void {
    localRateLimiters.forEach(function(rl) { rl.destroy(); });
    localRateLimiters.length = 0;
    localCircuitBreakers.clear();
    rlCache.clear();
  }

  return { wrap: wrap, destroy: destroy };
}
