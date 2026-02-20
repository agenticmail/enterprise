/**
 * AgenticMail Agent Tools — Enterprise Web Research
 *
 * Web search, scraping, data extraction, monitoring, and screenshots.
 * Uses Node.js fetch with SSRF protection for private IP ranges.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readBooleanParam, jsonResult, textResult, errorResult } from '../common.js';

var BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
var DEFAULT_NUM_RESULTS = 5;
var DEFAULT_MAX_CHARS = 10000;
var DEFAULT_TIMEOUT_MS = 5000;
var DEFAULT_EXPECTED_STATUS = 200;

// --- SSRF Protection ---

var PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^localhost$/i,
];

function isPrivateHost(hostname: string): boolean {
  for (var pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) return true;
  }
  return false;
}

function validateUrl(rawUrl: string): URL {
  var url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL: ' + rawUrl);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS URLs are supported.');
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error('Access to private/internal networks is blocked for security (SSRF protection).');
  }
  return url;
}

// --- HTML to text conversion ---

function htmlToText(html: string): string {
  var text = html;
  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#(\d+);/g, function(_m, code) {
    return String.fromCharCode(Number.parseInt(code, 10));
  });
  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// --- Regex-based data extraction ---

function extractBySelector(html: string, selector: string): string[] {
  var results: string[] = [];

  // Support simple patterns: tag, tag.class, tag#id, .class, #id
  var tagMatch = selector.match(/^(\w+)?(?:\.(\w[\w-]*))?(?:#(\w[\w-]*))?$/);
  if (!tagMatch) return results;

  var tag = tagMatch[1] || '\\w+';
  var cls = tagMatch[2];
  var id = tagMatch[3];

  var patternStr = '<' + tag;
  if (cls) patternStr += '[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"';
  if (id) patternStr += '[^>]*id="' + id + '"';
  patternStr += '[^>]*>([\\s\\S]*?)<\\/' + (tagMatch[1] || '\\w+') + '>';

  try {
    var regex = new RegExp(patternStr, 'gi');
    var match;
    while ((match = regex.exec(html)) !== null) {
      var content = htmlToText(match[1]);
      if (content) results.push(content);
    }
  } catch { /* invalid regex, return empty */ }

  return results;
}

export function createEnterpriseWebResearchTools(options?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'ent_web_search',
      label: 'Enterprise Web Search',
      description: 'Perform a web search using the Brave Search API. Returns title, URL, and snippet for each result. Requires BRAVE_API_KEY environment variable.',
      category: 'web',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string.' },
          num_results: { type: 'number', description: 'Number of results to return (default 5, max 20).' },
        },
        required: ['query'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var query = readStringParam(params, 'query', { required: true });
        var numResults = readNumberParam(params, 'num_results', { integer: true }) ?? DEFAULT_NUM_RESULTS;
        numResults = Math.max(1, Math.min(20, numResults));

        var apiKey = (process.env.BRAVE_API_KEY || '').trim();
        if (!apiKey) {
          return errorResult('BRAVE_API_KEY environment variable is not set. Configure it to enable web search.');
        }

        try {
          var url = new URL(BRAVE_SEARCH_ENDPOINT);
          url.searchParams.set('q', query);
          url.searchParams.set('count', String(numResults));

          var res = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
            signal: AbortSignal.timeout(10000),
          });

          if (!res.ok) {
            var errText = await res.text().catch(function() { return res.statusText; });
            return errorResult('Brave Search API error (' + res.status + '): ' + errText);
          }

          var data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
          var results = (data.web?.results || []).map(function(r) {
            return { title: r.title || '', url: r.url || '', snippet: r.description || '' };
          });

          return jsonResult({ query: query, count: results.length, results: results });
        } catch (err: any) {
          return errorResult('Web search failed: ' + (err.message || 'unknown error'));
        }
      },
    },

    {
      name: 'ent_web_scrape',
      label: 'Scrape Web Page',
      description: 'Fetch a URL and extract readable text content by stripping HTML tags. Includes SSRF protection against private IP ranges.',
      category: 'web',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape.' },
          max_chars: { type: 'number', description: 'Maximum characters to return (default 10000).' },
        },
        required: ['url'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var rawUrl = readStringParam(params, 'url', { required: true });
        var maxChars = readNumberParam(params, 'max_chars', { integer: true }) ?? DEFAULT_MAX_CHARS;

        try {
          var url = validateUrl(rawUrl);
        } catch (err: any) {
          return errorResult(err.message);
        }

        try {
          var res = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'User-Agent': 'AgenticMail-Bot/1.0', 'Accept': 'text/html,application/xhtml+xml,*/*' },
            signal: AbortSignal.timeout(15000),
            redirect: 'follow',
          });

          if (!res.ok) {
            return errorResult('HTTP ' + res.status + ': ' + res.statusText);
          }

          var html = await res.text();
          var text = htmlToText(html);
          var truncated = false;

          if (text.length > maxChars) {
            text = text.slice(0, maxChars);
            truncated = true;
          }

          return jsonResult({
            url: url.toString(),
            contentLength: text.length,
            truncated: truncated,
            text: text,
          });
        } catch (err: any) {
          return errorResult('Failed to scrape URL: ' + (err.message || 'unknown error'));
        }
      },
    },

    {
      name: 'ent_web_extract_data',
      label: 'Extract Web Data',
      description: 'Fetch a URL and extract structured data using CSS-selector-like patterns. Supports tag, tag.class, tag#id selectors via regex matching.',
      category: 'web',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to extract data from.' },
          selectors: { type: 'string', description: 'JSON object mapping field names to CSS-selector-like patterns (e.g. {"titles": "h2.title", "prices": "span.price"}).' },
        },
        required: ['url', 'selectors'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var rawUrl = readStringParam(params, 'url', { required: true });
        var selectorsRaw = readStringParam(params, 'selectors', { required: true });

        try {
          var url = validateUrl(rawUrl);
        } catch (err: any) {
          return errorResult(err.message);
        }

        var selectors: Record<string, string>;
        try {
          selectors = JSON.parse(selectorsRaw);
          if (typeof selectors !== 'object' || selectors === null || Array.isArray(selectors)) {
            return errorResult('selectors must be a JSON object mapping field names to CSS-like selectors.');
          }
        } catch {
          return errorResult('Invalid JSON in selectors parameter.');
        }

        try {
          var res = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'User-Agent': 'AgenticMail-Bot/1.0', 'Accept': 'text/html,*/*' },
            signal: AbortSignal.timeout(15000),
            redirect: 'follow',
          });

          if (!res.ok) {
            return errorResult('HTTP ' + res.status + ': ' + res.statusText);
          }

          var html = await res.text();
          var extracted: Record<string, string[]> = {};

          for (var field of Object.keys(selectors)) {
            var selector = selectors[field];
            extracted[field] = extractBySelector(html, selector);
          }

          return jsonResult({ url: url.toString(), data: extracted });
        } catch (err: any) {
          return errorResult('Failed to extract data: ' + (err.message || 'unknown error'));
        }
      },
    },

    {
      name: 'ent_web_monitor',
      label: 'Monitor URL',
      description: 'Check if a URL is reachable, measure response time, and verify the HTTP status code. Includes SSRF protection.',
      category: 'web',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to monitor.' },
          expected_status: { type: 'number', description: 'Expected HTTP status code (default 200).' },
          timeout_ms: { type: 'number', description: 'Request timeout in milliseconds (default 5000).' },
        },
        required: ['url'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var rawUrl = readStringParam(params, 'url', { required: true });
        var expectedStatus = readNumberParam(params, 'expected_status', { integer: true }) ?? DEFAULT_EXPECTED_STATUS;
        var timeoutMs = readNumberParam(params, 'timeout_ms', { integer: true }) ?? DEFAULT_TIMEOUT_MS;

        try {
          var url = validateUrl(rawUrl);
        } catch (err: any) {
          return errorResult(err.message);
        }

        var start = Date.now();
        try {
          var res = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'User-Agent': 'AgenticMail-Monitor/1.0' },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'follow',
          });

          var elapsed = Date.now() - start;
          var headers: Record<string, string> = {};
          res.headers.forEach(function(value, key) {
            headers[key] = value;
          });

          var statusMatch = res.status === expectedStatus;

          return jsonResult({
            url: url.toString(),
            status: res.status,
            statusText: res.statusText,
            expectedStatus: expectedStatus,
            statusMatch: statusMatch,
            responseTimeMs: elapsed,
            headers: headers,
            reachable: true,
          });
        } catch (err: any) {
          var elapsed = Date.now() - start;
          return jsonResult({
            url: url.toString(),
            status: null,
            expectedStatus: expectedStatus,
            statusMatch: false,
            responseTimeMs: elapsed,
            reachable: false,
            error: err.message || 'Connection failed',
          });
        }
      },
    },

    {
      name: 'ent_web_screenshot',
      label: 'Screenshot Web Page',
      description: 'Take a screenshot of a web page using Playwright. Returns an error with guidance if Playwright is not available.',
      category: 'web',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to screenshot.' },
          width: { type: 'number', description: 'Viewport width in pixels (default 1280).' },
          height: { type: 'number', description: 'Viewport height in pixels (default 720).' },
          full_page: { type: 'string', description: 'Set to "true" to capture full page (default false).' },
        },
        required: ['url'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var rawUrl = readStringParam(params, 'url', { required: true });
        var width = readNumberParam(params, 'width', { integer: true }) ?? 1280;
        var height = readNumberParam(params, 'height', { integer: true }) ?? 720;
        var fullPage = readBooleanParam(params, 'full_page', false);

        try {
          var url = validateUrl(rawUrl);
        } catch (err: any) {
          return errorResult(err.message);
        }

        // Try to load Playwright dynamically
        try {
          var pw = await import(/* webpackIgnore: true */ 'playwright' as string) as any;
          var browser = await pw.chromium.launch({ headless: true });
          try {
            var context = await browser.newContext({ viewport: { width: width, height: height } });
            var page = await context.newPage();
            await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 });
            var buffer = await page.screenshot({ fullPage: fullPage, type: 'png' });
            var base64 = buffer.toString('base64');

            return {
              content: [
                { type: 'text', text: 'Screenshot of ' + url.toString() + ' (' + width + 'x' + height + ')' },
                { type: 'image', data: base64, mimeType: 'image/png' },
              ],
            };
          } finally {
            await browser.close();
          }
        } catch (err: any) {
          var message = err.message || '';
          if (message.indexOf('Cannot find module') !== -1 || message.indexOf('MODULE_NOT_FOUND') !== -1) {
            return errorResult(
              'Playwright is not installed. To enable screenshots, install it:\n' +
              '  npm install playwright\n' +
              '  npx playwright install chromium\n\n' +
              'Alternatively, use the ent_web_scrape tool to fetch page content as text.'
            );
          }
          return errorResult('Screenshot failed: ' + message);
        }
      },
    },
  ];
}
