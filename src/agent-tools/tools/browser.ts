/**
 * AgenticMail Agent Tools — Browser
 *
 * Browser automation using Playwright with per-agent isolation,
 * SSRF protection, and configurable security controls.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readBooleanParam, jsonResult, textResult, errorResult } from '../common.js';
import type { SsrfGuard } from '../security.js';

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

var browserInstance: any = null;
var agentContexts = new Map<string, AgentBrowserContext>();
var idleCleanupTimer: ReturnType<typeof setInterval> | null = null;

function startIdleCleanup() {
  if (idleCleanupTimer) return;
  idleCleanupTimer = setInterval(function() {
    var now = Date.now();
    for (var [agentId, ctx] of agentContexts) {
      if (now - ctx.lastUsed > DEFAULT_IDLE_TIMEOUT_MS) {
        try { ctx.context.close(); } catch { /* ignore */ }
        agentContexts.delete(agentId);
      }
    }
    // If no contexts remain, close the browser
    if (agentContexts.size === 0 && browserInstance) {
      try { browserInstance.close(); } catch { /* ignore */ }
      browserInstance = null;
      if (idleCleanupTimer) { clearInterval(idleCleanupTimer); idleCleanupTimer = null; }
    }
  }, 60_000);
  if (idleCleanupTimer && typeof idleCleanupTimer === 'object' && 'unref' in idleCleanupTimer) {
    (idleCleanupTimer as any).unref();
  }
}

async function ensureBrowser(headless: boolean, agentId: string): Promise<{ page: any }> {
  // Return existing context for this agent
  var existing = agentContexts.get(agentId);
  if (existing && browserInstance) {
    existing.lastUsed = Date.now();
    return { page: existing.page };
  }

  // Check context limit
  if (agentContexts.size >= DEFAULT_MAX_CONTEXTS) {
    // Evict oldest context
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
    // Launch browser if needed
    if (!browserInstance) {
      var pw = await import('playwright');
      browserInstance = await pw.chromium.launch({ headless });
      startIdleCleanup();
    }

    // Create isolated context for this agent
    var context = await browserInstance.newContext({
      viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
      userAgent: 'AgenticMail-Agent/1.0',
    });
    var page = await context.newPage();
    agentContexts.set(agentId, { context, page, lastUsed: Date.now() });
    return { page };
  } catch (error: any) {
    throw new Error(
      'Browser automation requires Playwright. Install with: npm install playwright\n' +
      'Error: ' + (error.message || 'unknown')
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
      },
      required: ['action'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var action = readStringParam(params, 'action', { required: true }) as BrowserAction;

      if (action === 'close') {
        var ctx = agentContexts.get(agentId);
        if (ctx) {
          try { ctx.context.close(); } catch { /* ignore */ }
          agentContexts.delete(agentId);
        }
        return textResult('Browser closed.');
      }

      try {
        var { page } = await ensureBrowser(headless, agentId);

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
            await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
            var title = await page.title();
            return jsonResult({ action: 'navigate', url, title, status: 'loaded' });
          }

          case 'screenshot': {
            var buf = await page.screenshot({ type: 'png', fullPage: false });
            return {
              content: [
                { type: 'text', text: 'Screenshot of: ' + page.url() },
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
