/**
 * AgenticMail Agent Tools — Browser
 *
 * Browser automation using Playwright with per-agent isolation,
 * SSRF protection, and configurable security controls.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readBooleanParam, jsonResult, textResult, errorResult } from '../common.js';
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

        var { page } = await ensureBrowser(useHeadless, agentId, useChrome);

        switch (action) {
          case 'navigate': {
            var url = readStringParam(params, 'url', { required: true });
            // SSRF guard on navigation URL
            if (ssrfGuard) {
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
