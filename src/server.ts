/**
 * AgenticMail Enterprise Server
 * 
 * Hono-based API server with full middleware stack.
 * Production-ready: rate limiting, audit logging, RBAC,
 * health checks, graceful shutdown.
 */

import { Hono } from 'hono';
import type { AppEnv } from './types/hono-env.js';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { DatabaseAdapter } from './db/adapter.js';
import { createDbProxy, type DbProxy } from './db/proxy.js';
import { createAdminRoutes } from './admin/routes.js';
import { createAuthRoutes } from './auth/routes.js';
import {
  requestIdMiddleware,
  requestLogger,
  rateLimiter,
  securityHeaders,
  errorHandler,
  auditLogger,
  requireRole,
} from './middleware/index.js';
import { ipAccessControl } from './middleware/firewall.js';
import { HealthMonitor, CircuitBreaker } from './lib/resilience.js';

export interface ServerConfig {
  port: number;
  db: DatabaseAdapter;
  jwtSecret: string;
  corsOrigins?: string[];
  /** Requests per minute per IP (default: 120) */
  rateLimit?: number;
  /** Trusted proxy IPs for X-Forwarded-For */
  trustedProxies?: string[];
  /** Enable verbose request logging (default: true) */
  logging?: boolean;
  /** Agent runtime configuration (enables standalone agent execution) */
  runtime?: {
    enabled?: boolean;
    defaultModel?: { provider: 'anthropic' | 'openai'; modelId: string; thinkingLevel?: string };
    apiKeys?: { anthropic?: string; openai?: string };
  };
}

export interface ServerInstance {
  app: Hono<AppEnv>;
  start: () => Promise<{ close: () => void }>;
  healthMonitor: HealthMonitor;
}

export function createServer(config: ServerConfig): ServerInstance {
  const app = new Hono<AppEnv>();

  // Wrap DB in a transparent proxy for hot-swap support during onboarding
  const dbProxy = createDbProxy(config.db) as DbProxy;
  config.db = dbProxy;

  // ─── DB Circuit Breaker ──────────────────────────────

  const dbBreaker = new CircuitBreaker({
    failureThreshold: 5,
    recoveryTimeMs: 30_000,
    timeout: 10_000,
  });

  // ─── Health Monitor ──────────────────────────────────

  const healthMonitor = new HealthMonitor(
    async () => {
      // Simple connectivity check
      await config.db.getStats();
    },
    { intervalMs: 30_000, timeoutMs: 5_000, unhealthyThreshold: 3 },
  );

  healthMonitor.onStatusChange((healthy) => {
    console.log(
      `[${new Date().toISOString()}] ${healthy ? '✅' : '❌'} Database health: ${healthy ? 'healthy' : 'unhealthy'}`,
    );
  });

  // ─── Global Middleware ───────────────────────────────

  // Request ID (first — everything references it)
  app.use('*', requestIdMiddleware());

  // Error handler (wraps everything below)
  app.use('*', errorHandler());

  // Security headers
  app.use('*', securityHeaders());

  // IP access control (firewall)
  app.use('*', ipAccessControl(() => config.db));

  // CORS
  app.use('*', cors({
    origin: config.corsOrigins || '*',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id', 'X-CSRF-Token'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  }));

  // Rate limiting
  app.use('*', rateLimiter({
    limit: config.rateLimit ?? 120,
    windowSec: 60,
    skipPaths: ['/health', '/ready'],
  }));

  // Request logging
  if (config.logging !== false) {
    app.use('*', requestLogger());
  }

  // ─── Health Endpoints ────────────────────────────────

  app.get('/health', (c) => c.json({
    status: 'ok',
    version: '0.4.0',
    uptime: process.uptime(),
  }));

  app.get('/ready', async (c) => {
    const dbHealthy = healthMonitor.isHealthy();
    const status = dbHealthy ? 200 : 503;
    return c.json({
      ready: dbHealthy,
      checks: {
        database: dbHealthy ? 'ok' : 'unhealthy',
        circuitBreaker: dbBreaker.getState(),
      },
    }, status);
  });

  // One-way latch: once setup is complete, skip the bootstrap injection.
  // Checked once at startup; also flipped by the bootstrap callback.
  let _setupComplete = false;
  (async () => {
    try {
      const stats = await config.db.getStats();
      if (stats.totalUsers > 0) _setupComplete = true;
    } catch { /* not ready yet — will be flipped on first bootstrap */ }
  })();

  // ─── Auth Routes (public) ───────────────────────────

  const authRoutes = createAuthRoutes(config.db, config.jwtSecret, {
    onBootstrap: () => { _setupComplete = true; },
    onDbConfigure: (newAdapter) => {
      const old = dbProxy.__swap(newAdapter);
      engineInitialized = false;
      return old;
    },
  });
  app.route('/auth', authRoutes);

  // ─── Protected API Routes ───────────────────────────

  const api = new Hono<AppEnv>();

  // Authentication middleware
  api.use('*', async (c, next) => {
    // Check API key first
    const apiKeyHeader = c.req.header('X-API-Key');
    if (apiKeyHeader) {
      const key = await dbBreaker.execute(() => config.db.validateApiKey(apiKeyHeader));
      if (!key) return c.json({ error: 'Invalid API key' }, 401);
      c.set('userId', key.createdBy);
      c.set('authType', 'api-key');
      c.set('apiKeyScopes', key.scopes);
      return next();
    }

    // JWT auth — check httpOnly cookie first, then Authorization header
    const { getCookie } = await import('hono/cookie');
    const cookieToken = getCookie(c, 'em_session');
    const authHeader = c.req.header('Authorization');
    const jwt = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!jwt) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    try {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jwtVerify(jwt, secret);
      c.set('userId', payload.sub as string);
      c.set('userRole', (payload.role as string) || '');
      c.set('userEmail', (payload.email as string) || '');
      c.set('authType', cookieToken ? 'cookie' : 'jwt');
      return next();
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
  });

  // Audit logging on all API mutations
  api.use('*', auditLogger(config.db));

  // Admin routes
  const adminRoutes = createAdminRoutes(config.db);
  api.route('/', adminRoutes);

  // Engine routes (skills, permissions, deployment, approvals, lifecycle, KB, etc.)
  // Loaded lazily on first request to avoid top-level await.
  // On first hit, also initializes the EngineDatabase and runs engine migrations.
  let engineInitialized = false;
  api.all('/engine/*', async (c, next) => {
    try {
      const { engineRoutes, setEngineDb } = await import('./engine/routes.js');
      const { EngineDatabase } = await import('./engine/db-adapter.js');

      // Initialize engine DB on first request
      if (!engineInitialized) {
        // Use the adapter's built-in engine DB interface (SQL adapters expose raw query methods)
        const engineDbInterface = config.db.getEngineDB();
        if (!engineDbInterface) {
          return c.json({
            error: 'Engine not available',
            detail: `Engine requires a SQL-compatible database. "${config.db.type}" does not support raw SQL queries. Use postgres, mysql, sqlite, or turso.`,
          }, 501);
        }

        // Map adapter dialect to engine dialect
        const adapterDialect = config.db.getDialect();
        const dialectMap: Record<string, string> = {
          sqlite: 'sqlite', postgres: 'postgres', supabase: 'postgres',
          neon: 'postgres', cockroachdb: 'postgres', mysql: 'mysql',
          planetscale: 'mysql', turso: 'turso',
        };
        const engineDialect = (dialectMap[adapterDialect] || adapterDialect) as any;

        const engineDb = new EngineDatabase(engineDbInterface, engineDialect);
        const migrationResult = await engineDb.migrate();
        console.log(`[engine] Migrations: ${migrationResult.applied} applied, ${migrationResult.total} total`);
        await setEngineDb(engineDb, config.db);
        engineInitialized = true;

        // Start agent runtime if configured
        if (config.runtime?.enabled) {
          try {
            const { createAgentRuntime } = await import('./runtime/index.js');
            const { mountRuntimeApp } = await import('./engine/routes.js');
            const runtime = createAgentRuntime({
              engineDb,
              adminDb: config.db,
              defaultModel: config.runtime.defaultModel as any,
              apiKeys: config.runtime.apiKeys,
              gatewayEnabled: true,
            });
            await runtime.start();
            const runtimeApp = runtime.getApp();
            if (runtimeApp) {
              mountRuntimeApp(runtimeApp);
            }
            console.log('[runtime] Agent runtime started and mounted at /api/engine/runtime/*');
          } catch (runtimeErr: any) {
            console.warn(`[runtime] Failed to start agent runtime: ${runtimeErr.message}`);
          }
        }
      }

      // Forward to engine routes — inject auth context as headers
      const originalUrl = new URL(c.req.url);
      const subPath = (c.req.path.replace(/^\/api\/engine/, '') || '/') + originalUrl.search;
      const headers = new Headers(c.req.raw.headers);
      const userId = c.get('userId');
      const userRole = c.get('userRole');
      const userEmail = c.get('userEmail');
      const authType = c.get('authType');
      const requestId = c.get('requestId');
      if (userId) headers.set('X-User-Id', String(userId));
      if (userRole) headers.set('X-User-Role', String(userRole));
      if (userEmail) headers.set('X-User-Email', String(userEmail));
      if (authType) headers.set('X-Auth-Type', String(authType));
      if (requestId) headers.set('X-Request-Id', String(requestId));
      const subReq = new Request(new URL(subPath, 'http://localhost'), {
        method: c.req.method,
        headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
      });
      return engineRoutes.fetch(subReq);
    } catch (e: any) {
      console.error('[engine] Error:', e.message);
      return c.json({ error: 'Engine module not available', detail: e.message }, 501);
    }
  });

  app.route('/api', api);

  // ─── Dashboard (Admin UI) ─────────────────────────────

  let dashboardHtml: string | null = null;
  function getDashboardHtml(): string {
    if (!dashboardHtml) {
      try {
        const dir = dirname(fileURLToPath(import.meta.url));
        dashboardHtml = readFileSync(join(dir, 'dashboard', 'index.html'), 'utf-8');
      } catch {
        // Fallback: try relative to cwd
        try {
          dashboardHtml = readFileSync(join(process.cwd(), 'node_modules', '@agenticmail', 'enterprise', 'dist', 'dashboard', 'index.html'), 'utf-8');
        } catch {
          dashboardHtml = '<html><body><h1>Dashboard not found</h1><p>The dashboard HTML file could not be located.</p></body></html>';
        }
      }
    }
    return dashboardHtml;
  }

  async function serveDashboard(c: any) {
    let html = getDashboardHtml();
    if (!_setupComplete) {
      const injection = `<script>window.__EM_SETUP_STATE__=${JSON.stringify({ needsBootstrap: true })};</script>`;
      html = html.replace('</head>', injection + '</head>');
    }

    // Inject domain verification status (informational, does not block)
    try {
      const settings = await config.db.getSettings();
      if (settings.domain && settings.domainStatus) {
        const domainState = {
          domain: settings.domain,
          status: settings.domainStatus,
          verifiedAt: settings.domainVerifiedAt,
          dnsChallenge: settings.domainDnsChallenge,
        };
        const domainScript = `<script>window.__EM_DOMAIN_STATE__=${JSON.stringify(domainState)};</script>`;
        html = html.replace('</head>', domainScript + '</head>');
      }
    } catch { /* non-blocking */ }

    return c.html(html);
  }

  app.get('/', (c) => c.redirect('/dashboard'));
  app.get('/dashboard', serveDashboard);

  // Serve dashboard JS modules and static assets (components/*.js, pages/*.js, app.js, assets/*)
  const STATIC_MIME: Record<string, string> = { '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif', '.webp': 'image/webp', '.css': 'text/css; charset=utf-8' };
  app.get('/dashboard/*', (c) => {
    const reqPath = c.req.path.replace('/dashboard/', '');
    const ext = reqPath.substring(reqPath.lastIndexOf('.'));
    const mime = STATIC_MIME[ext];
    if (mime) {
      const dir = dirname(fileURLToPath(import.meta.url));
      const filePath = join(dir, 'dashboard', reqPath);
      // Prevent path traversal
      if (!filePath.startsWith(join(dir, 'dashboard'))) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      if (existsSync(filePath)) {
        const content = readFileSync(filePath);
        return new Response(content, { status: 200, headers: { 'Content-Type': mime, 'Cache-Control': ext === '.js' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400' } });
      }
    }
    // Fall through to SPA handler for non-asset requests
    return serveDashboard(c);
  });

  // ─── 404 Handler ─────────────────────────────────────

  app.notFound((c) => {
    return c.json({ error: 'Not found', path: c.req.path }, 404);
  });

  // ─── Server Start ────────────────────────────────────

  return {
    app,
    healthMonitor,
    start: () => {
      return new Promise((resolve) => {
        const server = serve(
          { fetch: app.fetch, port: config.port },
          (info) => {
            console.log(`\n🏢 AgenticMail Enterprise`);
            console.log(`   API:    http://localhost:${info.port}/api`);
            console.log(`   Auth:   http://localhost:${info.port}/auth`);
            console.log(`   Health: http://localhost:${info.port}/health`);
            console.log('');

            // Start health monitoring
            healthMonitor.start();

            // Graceful shutdown
            const shutdown = () => {
              console.log('\n⏳ Shutting down gracefully...');
              healthMonitor.stop();
              server.close(() => {
                config.db.disconnect().then(() => {
                  console.log('✅ Shutdown complete');
                  process.exit(0);
                });
              });
              // Force exit after 10s
              setTimeout(() => { process.exit(1); }, 10_000).unref();
            };

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);

            resolve({
              close: () => {
                healthMonitor.stop();
                server.close();
              },
            });
          },
        );
      });
    },
  };
}
