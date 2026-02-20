/**
 * MCP Skill Framework — API Executor
 *
 * Generic HTTP client that every skill adapter uses.
 * Wraps fetch with auth headers, retry, circuit breaking, and timeouts.
 * Reuses CircuitBreaker and withRetry from the enterprise resilience lib.
 */

import { withRetry, CircuitBreaker, RateLimiter } from '../../lib/resilience.js';
import type { ApiExecutor, ApiRequestOptions } from './types.js';

export interface SkillApiExecutorOptions {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  formEncoded?: boolean;
  rateLimiter?: RateLimiter;
  skillId?: string;
}

export class SkillApiExecutor implements ApiExecutor {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;
  private defaultFormEncoded: boolean;
  private circuit: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  private skillId?: string;

  constructor(opts: SkillApiExecutorOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.defaultTimeout = opts.timeoutMs ?? 30_000;
    this.defaultFormEncoded = opts.formEncoded ?? false;
    this.defaultHeaders = { ...opts.headers };
    if (!this.defaultFormEncoded) {
      this.defaultHeaders['Content-Type'] ??= 'application/json';
    }
    this.rateLimiter = opts.rateLimiter;
    this.skillId = opts.skillId;
    this.circuit = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeMs: 15_000,
      successThreshold: 2,
    });
  }

  async request(opts: ApiRequestOptions): Promise<any> {
    // Proactive rate limiting
    if (this.rateLimiter) {
      if (!this.rateLimiter.tryConsume()) {
        const retryAfterMs = this.rateLimiter.getRetryAfterMs();
        if (retryAfterMs > 5000) {
          const err = new Error(`Rate limited (${this.skillId ?? 'unknown'}). Retry in ${Math.ceil(retryAfterMs / 1000)}s`);
          (err as any).status = 429;
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, retryAfterMs));
        this.rateLimiter.tryConsume();
      }
    }

    return this.circuit.execute(() =>
      withRetry(
        async () => {
          const fullUrl = opts.url
            ? opts.url
            : `${this.baseUrl}${opts.path?.startsWith('/') ? '' : '/'}${opts.path || ''}`;

          const url = new URL(fullUrl);
          if (opts.query) {
            for (const [k, v] of Object.entries(opts.query)) {
              if (v !== undefined && v !== null) url.searchParams.set(k, v);
            }
          }

          const isForm = opts.formEncoded ?? this.defaultFormEncoded;
          const headers: Record<string, string> = { ...this.defaultHeaders, ...opts.headers };

          let body: string | FormData | Buffer | Uint8Array | undefined;
          if (opts.rawBody !== undefined) {
            // Case 1: Pre-built raw body — bypass all serialization
            body = opts.rawBody;
            if (opts.rawContentType) {
              headers['Content-Type'] = opts.rawContentType;
            }
          } else if (opts.body !== undefined && opts.body !== null) {
            if (opts.multipart) {
              // Case 2: Multipart form-data
              const form = new FormData();
              for (const [key, val] of Object.entries(opts.body)) {
                if (val instanceof Blob) {
                  form.append(key, val);
                } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                  form.append(key, String(val));
                } else if (val !== null && val !== undefined) {
                  form.append(key, JSON.stringify(val));
                }
              }
              body = form;
              // Let fetch auto-set Content-Type with boundary
              delete headers['Content-Type'];
            } else if (isForm) {
              // Case 3: URL-encoded form
              headers['Content-Type'] = 'application/x-www-form-urlencoded';
              body = new URLSearchParams(flattenForForm(opts.body)).toString();
            } else {
              // Case 4: JSON (default)
              body = JSON.stringify(opts.body);
            }
          }

          const response = await fetch(url.toString(), {
            method: opts.method,
            headers,
            body: body as BodyInit | undefined,
            signal: AbortSignal.timeout(opts.timeoutMs ?? this.defaultTimeout),
          });

          // Read response
          const contentType = response.headers.get('content-type') || '';
          let data: any;
          if (contentType.includes('application/json')) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          // Throw on HTTP errors (but not for APIs like Slack that return 200 with ok: false)
          if (!response.ok) {
            const msg = typeof data === 'string' ? data : JSON.stringify(data);
            const err = new Error(`HTTP ${response.status}: ${msg}`);
            (err as any).status = response.status;
            (err as any).data = data;
            throw err;
          }

          return data;
        },
        {
          maxAttempts: 2,
          baseDelayMs: 500,
          retryableErrors: (err: Error) => {
            const status = (err as any).status;
            // Retry on 429 (rate limit) and 5xx
            return status === 429 || (status >= 500 && status < 600);
          },
        },
      ),
    );
  }

  async get(path: string, query?: Record<string, string>): Promise<any> {
    return this.request({ method: 'GET', path, query });
  }

  async post(path: string, body?: any): Promise<any> {
    return this.request({ method: 'POST', path, body });
  }

  async put(path: string, body?: any): Promise<any> {
    return this.request({ method: 'PUT', path, body });
  }

  async patch(path: string, body?: any): Promise<any> {
    return this.request({ method: 'PATCH', path, body });
  }

  async delete(path: string, query?: Record<string, string>): Promise<any> {
    return this.request({ method: 'DELETE', path, query });
  }

  get limiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }
}

/** Flatten nested objects for form encoding (Stripe-style: { card: { number: '...' } } → card[number]=...) */
function flattenForForm(obj: any, prefix = ''): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      pairs.push(...flattenForForm(val, fullKey));
    } else if (Array.isArray(val)) {
      val.forEach((v, i) => pairs.push([`${fullKey}[${i}]`, String(v)]));
    } else {
      pairs.push([fullKey, String(val)]);
    }
  }
  return pairs;
}
