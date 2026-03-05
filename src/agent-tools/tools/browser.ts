/**
 * AgenticMail Agent Tools — Browser
 *
 * Browser automation using Playwright with per-agent isolation,
 * SSRF protection, and configurable security controls.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';
import type { SsrfGuard } from '../security.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs, existsSync } from 'node:fs';

const BROWSER_ACTIONS = ['navigate', 'screenshot', 'click', 'type', 'scroll', 'evaluate', 'content', 'close'] as const;
type BrowserAction = (typeof BROWSER_ACTIONS)[number];

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONTEXTS = 5;
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000; // 5 minutes

/** Per-agent browser context tracking */
type AgentBrowserContext = {
  context: any;
  page: any;
  lastUsed: number;
};

/**
 * Three browser pools:
 * - "headless": Playwright Chromium, no UI — fast background scraping
 * - "headed": Playwright Chromium, visible window — debugging/interactive
 * - "chrome": Native Google Chrome via Playwright channel — for Google Meet, OAuth, etc.
 *             Google services block Playwright's bundled Chromium. Native Chrome works.
 */
type BrowserMode = 'headless' | 'headed' | 'chrome';
var browsers: Record<string, any> = { headless: null, headed: null, chrome: null };
/** Context key: "agentId:mode" */
var agentContexts = new Map<string, AgentBrowserContext>();
var idleCleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Detect native Chrome installation path */
function findChromePath(): string | null {
  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    // Windows (common paths)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    try { if (existsSync(p)) return p; } catch { /* skip */ }
  }
  return null;
}

/** Check if native Chrome is available */
export function isChromeAvailable(): boolean {
  return findChromePath() !== null;
}

function startIdleCleanup() {
  if (idleCleanupTimer) return;
  idleCleanupTimer = setInterval(function() {
    var now = Date.now();
    for (var [key, ctx] of agentContexts) {
      // Chrome/headed contexts get longer timeouts (meetings, Google services)
      var timeout = (key.endsWith(':chrome') || key.endsWith(':headed')) ? 2 * 60 * 60_000 : DEFAULT_IDLE_TIMEOUT_MS;
      if (now - ctx.lastUsed > timeout) {
        try { ctx.context.close(); } catch { /* ignore */ }
        agentContexts.delete(key);
      }
    }
    // Close browser instances with no active contexts
    for (var mode of ['headless', 'headed', 'chrome'] as const) {
      var prefix = `:${mode}`;
      var hasContexts = false;
      for (var [key] of agentContexts) {
        if (key.endsWith(prefix)) { hasContexts = true; break; }
      }
      if (!hasContexts && browsers[mode]) {
        try { browsers[mode].close(); } catch { /* ignore */ }
        browsers[mode] = null;
      }
    }
    if (!browsers.headless && !browsers.headed && !browsers.chrome && idleCleanupTimer) {
      clearInterval(idleCleanupTimer);
      idleCleanupTimer = null;
    }
  }, 60_000);
  if (idleCleanupTimer && typeof idleCleanupTimer === 'object' && 'unref' in idleCleanupTimer) {
    (idleCleanupTimer as any).unref();
  }
}

/**
 * Ensure a browser page is available.
 * @param headless - true for headless Chromium, false for headed Chromium
 * @param agentId - agent identifier for context isolation
 * @param useChrome - true to use native Chrome (optional — Playwright Chromium works for Google Meet)
 */
export async function ensureBrowser(headless: boolean, agentId: string, useChrome?: boolean): Promise<{ page: any }> {
  var mode: BrowserMode = useChrome ? 'chrome' : (headless ? 'headless' : 'headed');
  var contextKey = `${agentId}:${mode}`;

  // Return existing context for this agent+mode
  var existing = agentContexts.get(contextKey);
  if (existing) {
    existing.lastUsed = Date.now();
    return { page: existing.page };
  }

  // Check context limit — evict oldest if needed
  if (agentContexts.size >= DEFAULT_MAX_CONTEXTS) {
    var oldestId: string | null = null;
    var oldestTime = Infinity;
    for (var [id, ctx] of agentContexts) {
      if (ctx.lastUsed < oldestTime) {
        oldestTime = ctx.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId) {
      var evicted = agentContexts.get(oldestId);
      if (evicted) {
        try { evicted.context.close(); } catch { /* ignore */ }
        agentContexts.delete(oldestId);
      }
    }
  }

  try {
    var pw = await import('playwright');

    // ── Headless mode: plain Chromium, no persistence needed ──
    if (mode === 'headless') {
      if (!browsers[mode]) {
        browsers[mode] = await pw.chromium.launch({ headless: true });
        console.log(`[browser] Launched headless Chromium`);
        startIdleCleanup();
      }
      var context = await browsers[mode].newContext({
        viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
        userAgent: 'AgenticMail-Agent/1.0',
      });
      var page = await context.newPage();
      agentContexts.set(contextKey, { context, page, lastUsed: Date.now() });
      return { page };
    }

    // ── Headed / Chrome mode: persistent context (preserves login, cookies, etc.) ──
    // This is critical for Google services — they detect and block fresh/bot contexts.
    // launchPersistentContext creates a real browser profile on disk.
    
    const { mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const userDataDir = join('/tmp', 'agenticmail-browser', agentId, mode);
    mkdirSync(userDataDir, { recursive: true });

    var launchArgs = [
      '--disable-blink-features=AutomationControlled',
      // NOTE: do NOT use --use-fake-device-for-media-stream — it overrides real audio devices
      // We need Chrome to use the system's real audio input (BlackHole/VB-CABLE) for meeting voice
      '--use-fake-ui-for-media-stream',         // Auto-accept mic/camera permission prompts
      '--auto-select-desktop-capture-source=Entire screen',
      '--enable-usermedia-screen-capturing',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
    ];

    var launchOpts: any = {
      headless: false,
      args: launchArgs,
      viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      permissions: ['microphone', 'camera', 'notifications'],
    };

    // For native Chrome, use the real executable
    if (mode === 'chrome') {
      const chromePath = findChromePath();
      if (!chromePath) {
        throw new Error('Native Google Chrome not found. Install: brew install --cask google-chrome');
      }
      launchOpts.executablePath = chromePath;
    }

    var persistentContext = await pw.chromium.launchPersistentContext(userDataDir, launchOpts);
    
    // Remove webdriver flag
    await persistentContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    var page = persistentContext.pages()[0] || await persistentContext.newPage();
    console.log(`[browser] Launched ${mode} persistent browser for ${agentId} (profile: ${userDataDir})`);

    agentContexts.set(contextKey, { context: persistentContext, page, lastUsed: Date.now() });
    startIdleCleanup();

    return { page };
  } catch (error: any) {
    throw new Error(
      'Browser launch failed. ' +
      (mode === 'chrome' ? 'Ensure Google Chrome is installed.' : 'Install Playwright: npm install playwright') +
      '\nError: ' + (error.message || 'unknown')
    );
  }
}

// ═══════════════════════════════════════════════════════════
// Cloud/Remote Browser Provider Integration
// ═══════════════════════════════════════════════════════════

/** Browser config from managed agent settings */
export interface BrowserProviderConfig {
  provider?: 'local' | 'remote-cdp' | 'browserless' | 'browserbase' | 'steel' | 'scrapingbee';
  enabled?: boolean;
  headless?: boolean;
  // Remote CDP
  cdpUrl?: string;
  cdpAuthToken?: string;
  cdpTimeout?: number;
  sshTunnel?: string;
  // Browserless
  browserlessToken?: string;
  browserlessEndpoint?: string;
  browserlessConcurrency?: number;
  browserlessStealth?: boolean;
  browserlessProxy?: string;
  // Browserbase
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  browserbaseRecording?: boolean;
  browserbaseKeepAlive?: boolean;
  // Steel
  steelApiKey?: string;
  steelEndpoint?: string;
  steelSessionDuration?: number;
  // ScrapingBee
  scrapingbeeApiKey?: string;
  scrapingbeeJsRendering?: boolean;
  scrapingbeePremiumProxy?: boolean;
  scrapingbeeCountry?: string;
  // Local overrides
  executablePath?: string;
  userDataDir?: string;
  extraArgs?: string[];
  // Security
  timeoutMs?: number;
  maxPages?: number;
  blockedDomains?: string[];
  allowedDomains?: string[];
}

/** Active SSH tunnel process tracking */
var activeSshTunnels = new Map<string, any>();

/**
 * Establish SSH tunnel if configured. Runs ssh in background and waits
 * for the port to become available. Kills stale tunnels automatically.
 */
async function ensureSshTunnel(tunnelCmd: string, agentId: string): Promise<void> {
  var tunnelKey = `ssh-tunnel:${agentId}`;
  var existing = activeSshTunnels.get(tunnelKey);
  if (existing && !existing.killed) {
    // Tunnel already running — verify it's alive
    try {
      existing.kill(0); // Signal 0 just checks process existence
      return;
    } catch {
      activeSshTunnels.delete(tunnelKey);
    }
  }

  console.log(`[browser] Establishing SSH tunnel for ${agentId}: ${tunnelCmd}`);
  const { spawn } = await import('node:child_process');
  
  // Parse tunnel command — extract just the SSH args, ignore "ssh" prefix
  var args = tunnelCmd.replace(/^ssh\s+/, '').split(/\s+/).filter(Boolean);
  // Add -N (no remote command) and -f would daemonize but we manage it ourselves
  if (!args.includes('-N')) args.push('-N');
  // Add StrictHostKeyChecking=accept-new for first-time connections
  if (!args.some(a => a.includes('StrictHostKeyChecking'))) {
    args.push('-o', 'StrictHostKeyChecking=accept-new');
  }
  // Add ServerAliveInterval to keep tunnel alive
  if (!args.some(a => a.includes('ServerAliveInterval'))) {
    args.push('-o', 'ServerAliveInterval=30');
  }

  var proc = spawn('ssh', args, { stdio: 'pipe', detached: false });
  activeSshTunnels.set(tunnelKey, proc);

  proc.on('exit', () => { activeSshTunnels.delete(tunnelKey); });
  proc.on('error', (err: any) => {
    console.error(`[browser] SSH tunnel error for ${agentId}:`, err.message);
    activeSshTunnels.delete(tunnelKey);
  });

  // Wait for tunnel to be ready (port becomes connectable)
  // Extract local port from -L flag: -L localPort:host:remotePort
  var localPortMatch = tunnelCmd.match(/-L\s*(\d+):/);
  if (localPortMatch) {
    var port = parseInt(localPortMatch[1]);
    var maxWait = 15000;
    var start = Date.now();
    const net = await import('node:net');
    while (Date.now() - start < maxWait) {
      var connected = await new Promise<boolean>((resolve) => {
        var sock = net.connect({ port, host: '127.0.0.1' }, () => { sock.destroy(); resolve(true); });
        sock.on('error', () => resolve(false));
        sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
      });
      if (connected) {
        console.log(`[browser] SSH tunnel ready on port ${port} for ${agentId}`);
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    console.warn(`[browser] SSH tunnel port ${port} not ready after ${maxWait}ms — proceeding anyway`);
  } else {
    // No -L flag found, just wait a bit for the tunnel to establish
    await new Promise(r => setTimeout(r, 3000));
  }
}

/**
 * Connect to a remote browser via Chrome DevTools Protocol.
 * Supports direct WebSocket connections and SSH tunneling.
 */
async function connectRemoteCDP(cfg: BrowserProviderConfig, agentId: string): Promise<{ page: any }> {
  var contextKey = `${agentId}:remote-cdp`;
  var existing = agentContexts.get(contextKey);
  if (existing) { existing.lastUsed = Date.now(); return { page: existing.page }; }

  // Establish SSH tunnel if configured
  if (cfg.sshTunnel) {
    await ensureSshTunnel(cfg.sshTunnel, agentId);
  }

  var pw = await import('playwright');
  var cdpUrl = cfg.cdpUrl;
  if (!cdpUrl) throw new Error('CDP WebSocket URL not configured. Go to Settings → Browser → Remote CDP and enter the WebSocket URL.');

  // If user provided a bare host:port, auto-discover the WebSocket URL
  if (!cdpUrl.startsWith('ws://') && !cdpUrl.startsWith('wss://')) {
    // Treat as http endpoint — query /json/version for the real WS URL
    var httpUrl = cdpUrl.startsWith('http') ? cdpUrl : `http://${cdpUrl}`;
    if (!httpUrl.includes('/json/version')) httpUrl = httpUrl.replace(/\/$/, '') + '/json/version';
    try {
      var resp = await fetch(httpUrl, {
        signal: AbortSignal.timeout(cfg.cdpTimeout || 10000),
        headers: cfg.cdpAuthToken ? { 'Authorization': `Bearer ${cfg.cdpAuthToken}` } : {},
      });
      var versionData = await resp.json() as any;
      cdpUrl = versionData.webSocketDebuggerUrl;
      if (!cdpUrl) throw new Error('No webSocketDebuggerUrl in /json/version response');
      console.log(`[browser] Auto-discovered CDP WebSocket: ${cdpUrl}`);
    } catch (e: any) {
      throw new Error(`Cannot discover CDP endpoint from ${httpUrl}: ${e.message}. Provide a full ws:// URL instead.`);
    }
  }

  var timeout = cfg.cdpTimeout || 30000;
  var headers: Record<string, string> = {};
  if (cfg.cdpAuthToken) headers['Authorization'] = `Bearer ${cfg.cdpAuthToken}`;

  console.log(`[browser] Connecting to remote CDP: ${cdpUrl} (agent: ${agentId})`);
  var browser = await pw.chromium.connectOverCDP(cdpUrl, { timeout, headers });
  var contexts = browser.contexts();
  var context = contexts[0] || await browser.newContext({
    viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
  });
  var page = context.pages()[0] || await context.newPage();

  agentContexts.set(contextKey, { context: browser, page, lastUsed: Date.now() });
  startIdleCleanup();
  console.log(`[browser] Connected to remote CDP for ${agentId}`);
  return { page };
}

/**
 * Connect to Browserless.io cloud browser service.
 * Creates a new session via WebSocket using the API token.
 */
async function connectBrowserless(cfg: BrowserProviderConfig, agentId: string): Promise<{ page: any }> {
  var contextKey = `${agentId}:browserless`;
  var existing = agentContexts.get(contextKey);
  if (existing) { existing.lastUsed = Date.now(); return { page: existing.page }; }

  if (!cfg.browserlessToken) throw new Error('Browserless API token not configured. Go to Settings → Browser and enter your token.');

  var pw = await import('playwright');
  var endpoint = cfg.browserlessEndpoint || 'wss://chrome.browserless.io';
  // Normalize endpoint — ensure it's a WebSocket URL
  if (endpoint.startsWith('http://')) endpoint = endpoint.replace('http://', 'ws://');
  if (endpoint.startsWith('https://')) endpoint = endpoint.replace('https://', 'wss://');
  if (!endpoint.startsWith('ws://') && !endpoint.startsWith('wss://')) endpoint = 'wss://' + endpoint;

  // Build connection URL with token and options
  var connectUrl = `${endpoint}?token=${encodeURIComponent(cfg.browserlessToken)}`;
  if (cfg.browserlessStealth) connectUrl += '&stealth';
  if (cfg.browserlessProxy) connectUrl += `&--proxy-server=${encodeURIComponent(cfg.browserlessProxy)}`;

  console.log(`[browser] Connecting to Browserless for ${agentId}`);
  var browser = await pw.chromium.connectOverCDP(connectUrl, { timeout: 30000 });
  var context = await browser.newContext({
    viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
  });
  var page = await context.newPage();

  agentContexts.set(contextKey, { context: browser, page, lastUsed: Date.now() });
  startIdleCleanup();
  console.log(`[browser] Connected to Browserless for ${agentId}`);
  return { page };
}

/**
 * Connect to Browserbase cloud browser.
 * Creates a session via REST API, then connects via CDP WebSocket.
 */
async function connectBrowserbase(cfg: BrowserProviderConfig, agentId: string): Promise<{ page: any }> {
  var contextKey = `${agentId}:browserbase`;
  var existing = agentContexts.get(contextKey);
  if (existing) { existing.lastUsed = Date.now(); return { page: existing.page }; }

  if (!cfg.browserbaseApiKey) throw new Error('Browserbase API key not configured. Go to Settings → Browser and enter your API key.');
  if (!cfg.browserbaseProjectId) throw new Error('Browserbase Project ID not configured. Go to Settings → Browser and enter your project ID.');

  // Step 1: Create a session via REST
  console.log(`[browser] Creating Browserbase session for ${agentId}`);
  var sessionResp = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: { 'x-bb-api-key': cfg.browserbaseApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: cfg.browserbaseProjectId,
      browserSettings: {
        recordSession: cfg.browserbaseRecording !== false,
      },
      keepAlive: cfg.browserbaseKeepAlive || false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!sessionResp.ok) {
    var errBody = await sessionResp.text().catch(() => '');
    throw new Error(`Browserbase session creation failed (${sessionResp.status}): ${errBody}`);
  }
  var sessionData = await sessionResp.json() as any;
  var connectUrl = sessionData.connectUrl || `wss://connect.browserbase.com?apiKey=${cfg.browserbaseApiKey}&sessionId=${sessionData.id}`;

  // Step 2: Connect via CDP
  var pw = await import('playwright');
  var browser = await pw.chromium.connectOverCDP(connectUrl, { timeout: 30000 });
  var context = browser.contexts()[0] || await browser.newContext({
    viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
  });
  var page = context.pages()[0] || await context.newPage();

  agentContexts.set(contextKey, { context: browser, page, lastUsed: Date.now() });
  startIdleCleanup();
  console.log(`[browser] Connected to Browserbase session ${sessionData.id} for ${agentId}`);
  return { page };
}

/**
 * Connect to Steel.dev browser API.
 * Creates a session, then connects via CDP WebSocket.
 */
async function connectSteel(cfg: BrowserProviderConfig, agentId: string): Promise<{ page: any }> {
  var contextKey = `${agentId}:steel`;
  var existing = agentContexts.get(contextKey);
  if (existing) { existing.lastUsed = Date.now(); return { page: existing.page }; }

  if (!cfg.steelApiKey) throw new Error('Steel API key not configured. Go to Settings → Browser and enter your API key.');

  var endpoint = cfg.steelEndpoint || 'https://api.steel.dev';
  var duration = (cfg.steelSessionDuration || 15) * 60; // convert min to seconds

  // Step 1: Create session
  console.log(`[browser] Creating Steel session for ${agentId}`);
  var sessionResp = await fetch(`${endpoint}/v1/sessions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.steelApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeout: duration, useProxy: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (!sessionResp.ok) {
    var errBody = await sessionResp.text().catch(() => '');
    throw new Error(`Steel session creation failed (${sessionResp.status}): ${errBody}`);
  }
  var sessionData = await sessionResp.json() as any;
  var connectUrl = sessionData.connectUrl || sessionData.websocketUrl || sessionData.cdpUrl;
  if (!connectUrl) throw new Error('Steel session created but no connection URL returned');

  // Step 2: Connect via CDP
  var pw = await import('playwright');
  var browser = await pw.chromium.connectOverCDP(connectUrl, { timeout: 30000 });
  var context = browser.contexts()[0] || await browser.newContext({
    viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
  });
  var page = context.pages()[0] || await context.newPage();

  agentContexts.set(contextKey, { context: browser, page, lastUsed: Date.now() });
  startIdleCleanup();
  console.log(`[browser] Connected to Steel session ${sessionData.id} for ${agentId}`);
  return { page };
}

/**
 * ScrapingBee proxy-based browser. Uses ScrapingBee's rendering API
 * as a fetch proxy rather than a CDP connection (ScrapingBee doesn't expose CDP).
 * For browser tool compatibility, we launch a local Chromium and route
 * requests through ScrapingBee's proxy endpoint.
 */
async function connectScrapingBee(cfg: BrowserProviderConfig, agentId: string): Promise<{ page: any }> {
  var contextKey = `${agentId}:scrapingbee`;
  var existing = agentContexts.get(contextKey);
  if (existing) { existing.lastUsed = Date.now(); return { page: existing.page }; }

  if (!cfg.scrapingbeeApiKey) throw new Error('ScrapingBee API key not configured. Go to Settings → Browser and enter your API key.');

  // ScrapingBee uses a proxy approach: we route the local browser through their proxy
  // This gives us full Playwright control while ScrapingBee handles anti-detection + proxies
  var pw = await import('playwright');
  var proxyUrl = `http://${cfg.scrapingbeeApiKey}:${cfg.scrapingbeeJsRendering !== false ? 'render_js' : 'norender'}${cfg.scrapingbeePremiumProxy ? '&premium_proxy=true' : ''}${cfg.scrapingbeeCountry ? `&country_code=${cfg.scrapingbeeCountry}` : ''}@proxy.scrapingbee.com:8886`;

  console.log(`[browser] Launching browser with ScrapingBee proxy for ${agentId}`);
  var browser = await pw.chromium.launch({
    headless: true,
    proxy: { server: proxyUrl },
  });
  var context = await browser.newContext({
    viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
    ignoreHTTPSErrors: true, // ScrapingBee proxy uses self-signed certs
  });
  var page = await context.newPage();

  agentContexts.set(contextKey, { context: browser, page, lastUsed: Date.now() });
  startIdleCleanup();
  console.log(`[browser] ScrapingBee proxy browser ready for ${agentId}`);
  return { page };
}

/**
 * Unified browser provider router. Reads config and dispatches to the correct
 * connection method. Falls back to local Chromium if provider is unset or 'local'.
 */
export async function ensureBrowserFromConfig(
  cfg: BrowserProviderConfig | undefined,
  agentId: string,
  modeOverride?: BrowserMode
): Promise<{ page: any }> {
  var provider = cfg?.provider || 'local';

  // Mode override (e.g., agent explicitly requested chrome mode) takes precedence
  if (modeOverride === 'chrome' || modeOverride === 'headed') {
    return ensureBrowser(false, agentId, modeOverride === 'chrome');
  }

  switch (provider) {
    case 'remote-cdp':
      return connectRemoteCDP(cfg!, agentId);
    case 'browserless':
      return connectBrowserless(cfg!, agentId);
    case 'browserbase':
      return connectBrowserbase(cfg!, agentId);
    case 'steel':
      return connectSteel(cfg!, agentId);
    case 'scrapingbee':
      return connectScrapingBee(cfg!, agentId);
    case 'local':
    default:
      return ensureBrowser(cfg?.headless !== false, agentId, false);
  }
}

export function createBrowserTool(options?: ToolCreationOptions & {
  ssrfGuard?: SsrfGuard;
}): AnyAgentTool | null {
  var browserConfig = options?.config?.browser;
  if (browserConfig?.enabled === false) return null;

  var headless = browserConfig?.headless !== false;
  var timeoutMs = browserConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  var agentId = options?.agentId || 'default';
  var sandboxed = options?.sandboxed ?? false;
  var ssrfGuard = options?.ssrfGuard;
  // Full browser provider config (from managed agent settings)
  var providerConfig = browserConfig as BrowserProviderConfig | undefined;

  return {
    name: 'browser',
    label: 'Browser',
    description: 'Automate a browser for web interaction. Supports navigation, screenshots, clicking, typing, scrolling, and JavaScript evaluation. Requires Playwright.',
    category: 'browser',
    risk: 'critical',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform: navigate, screenshot, click, type, scroll, evaluate, content, close.',
          enum: BROWSER_ACTIONS as unknown as string[],
        },
        url: { type: 'string', description: 'URL to navigate to (for navigate action).' },
        selector: { type: 'string', description: 'CSS selector for click/type actions.' },
        text: { type: 'string', description: 'Text to type (for type action).' },
        script: { type: 'string', description: 'JavaScript to evaluate in page context.' },
        direction: { type: 'string', description: 'Scroll direction: up or down.' },
        pixels: { type: 'number', description: 'Pixels to scroll (default 500).' },
        headless: { type: 'string', description: 'Browser mode: "true" (default) = headless Chromium. "false" = visible Chromium window (use for Google Meet, Google services, and anything that needs to persist login). Do NOT use "chrome" unless explicitly told to.' },
      },
      required: ['action'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var action = readStringParam(params, 'action', { required: true }) as BrowserAction;

      // Allow per-call mode override: "chrome" for native Chrome, "false" for headed, default headless
      // Note: Google Meet works fine with Playwright Chromium (tested live Feb 24, 2026)
      var useChrome = params.headless === 'chrome';
      var useHeadless = useChrome ? false : (params.headless === 'false' || params.headless === false ? false : headless);

      if (action === 'close') {
        // Close both headless and headed contexts for this agent
        for (var mode of ['headless', 'headed']) {
          var key = `${agentId}:${mode}`;
          var ctx = agentContexts.get(key);
          if (ctx) {
            try { ctx.context.close(); } catch { /* ignore */ }
            agentContexts.delete(key);
          }
        }
        return textResult('Browser closed.');
      }

      try {
        // If no URL in params, check if agent already has a Chrome session (meeting in progress)
        if (!useChrome && (action as string) !== 'close') {
          var chromeKey = `${agentId}:chrome`;
          if (agentContexts.has(chromeKey) && browsers['chrome']) {
            // Agent has an active Chrome session — use it (likely in a meeting)
            useChrome = true;
            useHeadless = false;
          }
        }

        // Use provider-aware connection if a cloud/remote provider is configured
        var modeOverride: BrowserMode | undefined = useChrome ? 'chrome' : (!useHeadless ? 'headed' : undefined);
        var hasCloudProvider = providerConfig?.provider && providerConfig.provider !== 'local';
        var { page } = hasCloudProvider && !modeOverride
          ? await ensureBrowserFromConfig(providerConfig, agentId)
          : await ensureBrowser(useHeadless, agentId, useChrome);

        switch (action) {
          case 'navigate': {
            var url = readStringParam(params, 'url', { required: true });
            // SSRF guard on navigation URL (skip for file:// — browser can open local files)
            if (ssrfGuard && !url.startsWith('file://') && !url.startsWith('file:///')) {
              try {
                await ssrfGuard.validateUrl(url);
              } catch (err: any) {
                return errorResult('Navigation blocked: ' + err.message);
              }
            }
            // Intercept Meet URLs — redirect to meeting_join tool automatically
            if (/meet\.google\.com\/[a-z]/.test(url)) {
              // Find meeting_join in the current tool set and call it directly
              const tools = (globalThis as any).__currentSessionTools as any[] | undefined;
              const meetJoin = tools?.find((t: any) => t.name === 'meeting_join');
              if (meetJoin?.execute) {
                console.log(`[browser] Intercepted Meet URL — redirecting to meeting_join: ${url}`);
                return await meetJoin.execute('meeting_join', { url });
              }
              return errorResult(
                'Cannot navigate to Google Meet URLs. Use meeting_join(url: "' + url + '") instead. ' +
                'Call request_tools(sets: ["meeting_lifecycle", "meeting_voice"]) first if meeting_join is not available.'
              );
            }
            await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
            var title = await page.title();
            return jsonResult({ action: 'navigate', url, title, status: 'loaded' });
          }

          case 'screenshot': {
            var buf = await page.screenshot({ type: 'png', fullPage: false });
            // Save to temp file so agent can attach it to emails
            var screenshotDir = path.join(os.tmpdir(), 'agenticmail-screenshots');
            await fs.mkdir(screenshotDir, { recursive: true });
            var screenshotFile = `screenshot-${Date.now()}.png`;
            var screenshotPath = path.join(screenshotDir, screenshotFile);
            await fs.writeFile(screenshotPath, buf);
            return {
              content: [
                { type: 'text', text: `Screenshot of: ${page.url()}\nSaved to: ${screenshotPath}\nFilename: ${screenshotFile}\nSize: ${buf.length} bytes\n\nTo attach this screenshot to an email, use gmail_reply or gmail_send with:\nattachment_paths: ["${screenshotPath}"]` },
                { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' },
              ],
            };
          }

          case 'click': {
            var selector = readStringParam(params, 'selector', { required: true });
            await page.click(selector, { timeout: timeoutMs });
            return textResult('Clicked: ' + selector);
          }

          case 'type': {
            var selector = readStringParam(params, 'selector', { required: true });
            var text = readStringParam(params, 'text', { required: true });
            await page.fill(selector, text, { timeout: timeoutMs });
            return textResult('Typed into: ' + selector);
          }

          case 'scroll': {
            var direction = readStringParam(params, 'direction') || 'down';
            var pixels = readNumberParam(params, 'pixels', { integer: true }) ?? 500;
            var delta = direction === 'up' ? -pixels : pixels;
            await page.evaluate(function(d: number) { window.scrollBy(0, d); }, delta);
            return textResult('Scrolled ' + direction + ' ' + pixels + 'px');
          }

          case 'evaluate': {
            // Block arbitrary JS execution in sandboxed mode
            if (sandboxed) {
              return errorResult('JavaScript evaluation is disabled in sandboxed mode.');
            }
            var script = readStringParam(params, 'script', { required: true });
            var result = await page.evaluate(script);
            return jsonResult({ action: 'evaluate', result });
          }

          case 'content': {
            var html = await page.content();
            var title = await page.title();
            // Return text content, stripping tags
            var textContent = html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (textContent.length > 50000) textContent = textContent.slice(0, 50000) + '... (truncated)';
            return jsonResult({ action: 'content', title, url: page.url(), text: textContent });
          }

          default:
            return errorResult('Unknown browser action: ' + action);
        }
      } catch (err: any) {
        return errorResult('Browser error: ' + (err.message || 'unknown'));
      }
    },
  };
}
