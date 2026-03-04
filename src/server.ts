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
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

// Resolve version at module load time
let ENTERPRISE_VERSION = 'unknown';
try {
  const _require = createRequire(import.meta.url);
  ENTERPRISE_VERSION = _require('../package.json').version;
} catch {
  try { ENTERPRISE_VERSION = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', '@agenticmail', 'enterprise', 'package.json'), 'utf-8')).version; } catch { /* noop */ }
}
import type { DatabaseAdapter } from './db/adapter.js';
import { createDbProxy, type DbProxy } from './db/proxy.js';
import { createAdminRoutes } from './admin/routes.js';
import { createAuthRoutes } from './auth/routes.js';
import {
  requestIdMiddleware,
  requestLogger,
  rateLimiter,
  securityHeaders,
  requireHttps,
  errorHandler,
  auditLogger,
  requireRole,
} from './middleware/index.js';
import { ipAccessControl } from './middleware/firewall.js';
import { setNetworkDb, invalidateNetworkConfig } from './middleware/network-config.js';
import { initProxyConfig } from './middleware/proxy-config.js';
import { dnsRebindingProtection } from './middleware/dns-rebinding.js';
import { requestBodyLimit } from './middleware/request-limits.js';
import { geoIpRestriction } from './middleware/geo-ip.js';
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

  // ─── Centralized Network Config ─────────────────────
  // Must be initialized before any middleware that reads network config
  setNetworkDb(config.db);
  // Load initial config + apply proxy env vars
  invalidateNetworkConfig().catch(() => {});
  initProxyConfig();

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

  // Security headers (DB-backed)
  app.use('*', securityHeaders());

  // HTTPS enforcement (DB-backed)
  app.use('*', requireHttps());

  // DNS rebinding protection (DB-backed)
  app.use('*', dnsRebindingProtection());

  // Request body size limits (DB-backed)
  app.use('*', requestBodyLimit());

  // Geo-IP restrictions (DB-backed, requires reverse proxy country headers)
  app.use('*', geoIpRestriction());

  // IP access control (firewall, DB-backed with trusted proxy validation)
  app.use('*', ipAccessControl());

  // CORS — reads from centralized network config (auto-refreshed)
  async function getCorsOrigins(): Promise<string[]> {
    // If config provides explicit origins, use those
    if (config.corsOrigins && config.corsOrigins.length && config.corsOrigins[0] !== '*') {
      return config.corsOrigins;
    }
    // Read from centralized network config (cached 15s, invalidated on save)
    const { getNetworkConfig } = await import('./middleware/network-config.js');
    const netConfig = await getNetworkConfig();
    const origins = netConfig.network?.corsOrigins;
    if (origins && Array.isArray(origins) && origins.length > 0) return origins;
    return []; // empty = allow all
  }
  app.use('*', cors({
    origin: async (origin, c) => {
      const allowed = await getCorsOrigins();
      // If no CORS configured, allow all (open)
      if (!allowed.length) return origin || '*';
      // If origin matches any allowed origin, permit
      if (origin && allowed.includes(origin)) return origin;
      // Also allow requests with no origin (same-origin, curl, server-to-server)
      if (!origin) return allowed[0];
      // Not allowed — return empty string to deny
      return '';
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id', 'X-CSRF-Token'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After', 'X-Transport-Encrypted'],
  }));

  // Rate limiting
  app.use('*', rateLimiter({
    limit: config.rateLimit ?? 300,
    windowSec: 60,
    skipPaths: ['/health', '/ready', '/dashboard', '/api/engine/agent-status'],
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
    // Skip auth for OAuth callback (browser redirect from Google/Microsoft)
    if (c.req.path.endsWith('/oauth/callback') && c.req.method === 'GET') {
      return next();
    }

    // Skip auth for Google Chat webhook (Google sends POST with its own auth)
    if (c.req.path.includes('/chat-webhook') && c.req.method === 'POST') {
      return next();
    }

    // Skip auth for agent status (internal communication + dashboard SSE)
    // Skip auth for internal service-to-service calls (localhost only)
    if (c.req.path.includes('/engine/agent-status') || (c.req.path.includes('/whatsapp/proxy-send') && (c.req.header('host') || '').startsWith('localhost'))) {
      return next();
    }

    // Skip auth for runtime/chat and runtime/hooks — internal dispatch from enterprise to agent process
    if (c.req.path.includes('/runtime/chat') && c.req.method === 'POST') {
      return next();
    }
    if (c.req.path.includes('/runtime/hooks/') && c.req.method === 'POST') {
      return next();
    }

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

  // Transport encryption middleware — encrypts/decrypts sensitive API calls
  api.use('*', async (c, next) => {
    try {
      const { transportEncryptionMiddleware } = await import('./middleware/transport-encryption.js');
      const mw = transportEncryptionMiddleware();
      return mw(c, next);
    } catch {
      return next();
    }
  });

  // Load transport encryption config from DB early
  import('./middleware/transport-encryption.js').then(({ setSettingsDb, loadConfig }) => {
    setSettingsDb(config.db);
    loadConfig().catch(() => {});
  }).catch(() => {});

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
        engineInitialized = true; // Prevent repeated init attempts on failure
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
            const { mountRuntimeApp, setRuntime } = await import('./engine/routes.js');
            // Import lifecycle for email config access
            let getEmailConfig: ((agentId: string) => any) | undefined;
            let onTokenRefresh: ((agentId: string, tokens: any) => void) | undefined;
            let agentMemoryMgr: any;
            try {
              const { lifecycle: lc, memoryManager: mm } = await import('./engine/routes.js');
              agentMemoryMgr = mm;
              if (lc) {
                getEmailConfig = (agentId: string) => {
                  const managed = lc.getAgent(agentId);
                  const agentEmailCfg = managed?.config?.emailConfig || null;
                  // If agent has its own config, use it
                  if (agentEmailCfg?.oauthAccessToken || agentEmailCfg?.smtpHost) return agentEmailCfg;
                  // Async resolve from org integrations (cache on agent)
                  try {
                    const { orgIntegrations: oi } = require('./engine/routes.js');
                    if (oi && managed) {
                      const orgId = (managed as any).client_org_id || (managed as any).clientOrgId || null;
                      oi.resolveEmailConfig(orgId, agentEmailCfg).then((resolved: any) => {
                        if (resolved && (resolved.oauthAccessToken || resolved.smtpHost)) {
                          if (!managed.config) managed.config = {} as any;
                          (managed.config as any).emailConfig = resolved;
                          (managed.config as any).emailConfig._fromOrgIntegration = true;
                        }
                      }).catch(() => {});
                    }
                  } catch {}
                  return agentEmailCfg;
                };
                onTokenRefresh = (agentId: string, tokens: any) => {
                  const managed = lc.getAgent(agentId);
                  if (managed?.config?.emailConfig) {
                    if (tokens.accessToken) managed.config.emailConfig.oauthAccessToken = tokens.accessToken;
                    if (tokens.refreshToken) managed.config.emailConfig.oauthRefreshToken = tokens.refreshToken;
                    if (tokens.expiresAt) managed.config.emailConfig.oauthTokenExpiry = tokens.expiresAt;
                    if (!(managed.config.emailConfig as any)?._fromOrgIntegration) {
                      lc.saveAgent(agentId).catch(() => {});
                    }
                  }
                };
              }
            } catch {}
            const { vault: vaultRef, permissionEngine: permRef, databaseManager: dbMgr } = await import('./engine/routes.js');
            const runtime = createAgentRuntime({
              engineDb,
              adminDb: config.db,
              defaultModel: config.runtime.defaultModel as any,
              apiKeys: config.runtime.apiKeys,
              gatewayEnabled: true,
              getEmailConfig,
              onTokenRefresh,
              agentMemoryManager: agentMemoryMgr,
              vault: vaultRef,
              permissionEngine: permRef,
              databaseManager: dbMgr,
            } as any);
            await runtime.start();
            const runtimeApp = runtime.getApp();
            if (runtimeApp) {
              mountRuntimeApp(runtimeApp);
            }
            setRuntime(runtime);
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
    // Inject version
    html = html.replace('</head>', `<script>window.__ENTERPRISE_VERSION__="${ENTERPRISE_VERSION}";</script></head>`);

    if (!_setupComplete) {
      const injection = `<script>window.__EM_SETUP_STATE__=${JSON.stringify({ needsBootstrap: true })};</script>`;
      html = html.replace('</head>', injection + '</head>');
    }

    // Inject branding config
    try {
      const settings0 = await config.db.getSettings();
      const branding = settings0?.branding || {};
      if (settings0?.name && !branding.companyName) branding.companyName = settings0.name;
      if (Object.keys(branding).length > 0) {
        const brandScript = `<script>window.__EM_BRANDING__=${JSON.stringify(branding)};</script>`;
        html = html.replace('</head>', brandScript + '</head>');
      }
    } catch { /* non-blocking */ }

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

  // Serve branding assets from ~/.agenticmail/branding/
  app.get('/branding/*', (c) => {
    const reqPath = c.req.path.replace('/branding/', '').split('?')[0];
    if (reqPath.includes('..')) return c.json({ error: 'Forbidden' }, 403);
    const ext = reqPath.substring(reqPath.lastIndexOf('.'));
    const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimeMap[ext];
    if (!mime) return c.json({ error: 'Not found' }, 404);
    const brandDir = join(homedir(), '.agenticmail', 'branding');
    const filePath = join(brandDir, reqPath);
    if (!filePath.startsWith(brandDir) || !existsSync(filePath)) return c.json({ error: 'Not found' }, 404);
    const content = readFileSync(filePath);
    return new Response(content, { status: 200, headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  });

  app.get('/', (c) => c.redirect('/dashboard'));
  app.get('/dashboard', serveDashboard);

  // Serve documentation pages and assets
  app.get('/docs/:file', (c) => {
    const file = c.req.param('file').replace(/[^a-z0-9.-]/gi, '');
    const dir = dirname(fileURLToPath(import.meta.url));
    // Try exact file first, then append .html
    let filePath = join(dir, 'dashboard', 'docs', file);
    if (!existsSync(filePath)) filePath = join(dir, 'dashboard', 'docs', file + '.html');
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const ct = file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
      return new Response(content, { status: 200, headers: { 'Content-Type': ct } });
    }
    return c.json({ error: 'Documentation page not found' }, 404);
  });

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
        return new Response(content, { status: 200, headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
      }
      // Static asset not found — return 404, NOT the SPA HTML
      // (returning HTML for missing .js causes browser MIME type errors)
      return c.json({ error: 'Not found', path: c.req.path }, 404);
    }
    // Non-asset path — fall through to SPA handler
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
            console.log(`\n🏢 AgenticMail Enterprise v${ENTERPRISE_VERSION}`);
            console.log(`   API:    http://localhost:${info.port}/api`);
            console.log(`   Auth:   http://localhost:${info.port}/auth`);
            console.log(`   Health: http://localhost:${info.port}/health`);
            console.log('');

            // Start health monitoring
            healthMonitor.start();

            // Load saved provider API keys from DB (decrypt via vault, pass via runtime config)
            config.db.getSettings().then(async (settings: any) => {
              const { SecureVault } = await import('./engine/vault.js');
              const vaultInst = new SecureVault();
              const keys = settings?.modelPricingConfig?.providerApiKeys;
              if (keys && typeof keys === 'object') {
                for (const [providerId, apiKey] of Object.entries(keys)) {
                  if (apiKey && typeof apiKey === 'string') {
                    let decrypted: string;
                    try {
                      decrypted = vaultInst.decrypt(apiKey);
                    } catch {
                      decrypted = apiKey; // legacy plaintext fallback
                    }
                    if (config.runtime?.apiKeys) {
                      (config.runtime.apiKeys as Record<string, string>)[providerId] = decrypted;
                    }
                    console.log(`   🔑 Loaded API key for ${providerId} from DB`);
                  }
                }
              }
            }).catch(() => {});

            // Eagerly initialize engine (loads lifecycle, starts chat poller, etc.)
            // Without this, engine only initializes on first dashboard request
            (async () => {
              try {
                const { engineRoutes, setEngineDb } = await import('./engine/routes.js');
                const { EngineDatabase } = await import('./engine/db-adapter.js');
                if (!engineInitialized) {
                  engineInitialized = true;
                  const engineDbInterface = config.db.getEngineDB();
                  if (engineDbInterface) {
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

                    // Start agent runtime if configured
                    if (config.runtime?.enabled) {
                      try {
                        const { createAgentRuntime } = await import('./runtime/index.js');
                        const { mountRuntimeApp, setRuntime } = await import('./engine/routes.js');
                        let getEmailConfig: ((agentId: string) => any) | undefined;
                        let onTokenRefresh: ((agentId: string, tokens: any) => void) | undefined;
                        let agentMemoryMgr: any;
                        try {
                          const { lifecycle: lc, memoryManager: mm } = await import('./engine/routes.js');
                          agentMemoryMgr = mm;
                          if (lc) {
                            getEmailConfig = (agentId: string) => {
                              const managed = lc.getAgent(agentId);
                              const agentEmailCfg = managed?.config?.emailConfig || null;
                              if (agentEmailCfg?.oauthAccessToken || agentEmailCfg?.smtpHost) return agentEmailCfg;
                              try {
                                const { orgIntegrations: oi } = require('./engine/routes.js');
                                if (oi && managed) {
                                  const orgId = (managed as any).client_org_id || (managed as any).clientOrgId || null;
                                  oi.resolveEmailConfig(orgId, agentEmailCfg).then((resolved: any) => {
                                    if (resolved && (resolved.oauthAccessToken || resolved.smtpHost)) {
                                      if (!managed.config) managed.config = {} as any;
                                      (managed.config as any).emailConfig = resolved;
                                      (managed.config as any).emailConfig._fromOrgIntegration = true;
                                    }
                                  }).catch(() => {});
                                }
                              } catch {}
                              return agentEmailCfg;
                            };
                            onTokenRefresh = (agentId: string, tokens: any) => {
                              const managed = lc.getAgent(agentId);
                              if (managed?.config?.emailConfig) {
                                if (tokens.accessToken) managed.config.emailConfig.oauthAccessToken = tokens.accessToken;
                                if (tokens.refreshToken) managed.config.emailConfig.oauthRefreshToken = tokens.refreshToken;
                                if (tokens.expiresAt) managed.config.emailConfig.oauthTokenExpiry = tokens.expiresAt;
                                if (!(managed.config.emailConfig as any)?._fromOrgIntegration) {
                                  lc.saveAgent(agentId).catch(() => {});
                                }
                              }
                            };
                          }
                        } catch {}
                        const { vault: vaultRef2, permissionEngine: permRef2, databaseManager: dbMgr2 } = await import('./engine/routes.js');
                        const runtime = createAgentRuntime({
                          engineDb,
                          adminDb: config.db,
                          defaultModel: config.runtime.defaultModel as any,
                          apiKeys: config.runtime.apiKeys,
                          gatewayEnabled: true,
                          getEmailConfig,
                          onTokenRefresh,
                          agentMemoryManager: agentMemoryMgr,
                          vault: vaultRef2,
                          permissionEngine: permRef2,
                          hierarchyManager: (await import('./engine/routes.js')).hierarchyManager ?? undefined,
                          databaseManager: dbMgr2,
                        } as any);
                        await runtime.start();
                        const runtimeApp = runtime.getApp();
                        if (runtimeApp) mountRuntimeApp(runtimeApp);
                        setRuntime(runtime);
                        console.log('[runtime] Agent runtime started');
                      } catch (runtimeErr: any) {
                        console.warn(`[runtime] Failed to start: ${runtimeErr.message}`);
                      }
                    }
                    console.log('[engine] Eagerly initialized');

                    // Auto-check PM2 if any agents use local deployment
                    try {
                      const { lifecycle: lcRef } = await import('./engine/routes.js');
                      if (lcRef) {
                        const agents = Array.from((lcRef as any).agents?.values?.() || []);
                        const hasLocalPm2 = agents.some((a: any) => {
                          const target = a?.config?.deployment?.target;
                          const pm = a?.config?.deployment?.config?.local?.processManager;
                          return target === 'local' && (!pm || pm === 'pm2');
                        });
                        if (hasLocalPm2) {
                          const { ensurePm2 } = await import('./engine/deployer.js');
                          const pm2 = await ensurePm2();
                          if (pm2.installed) {
                            console.log(`[startup] PM2 v${pm2.version} available for local deployments`);
                          } else {
                            console.warn(`[startup] PM2 auto-install failed: ${pm2.error}`);
                          }
                        }
                      }
                    } catch {}
                  }
                }
              } catch (e: any) {
                console.warn(`[engine] Eager init failed: ${e.message}`);
              }
            })();

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
