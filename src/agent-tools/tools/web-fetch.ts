/**
 * AgenticMail Agent Tools — Web Fetch
 *
 * Fetches and extracts readable content from URLs.
 * Supports HTML → markdown/text extraction, Firecrawl fallback, caching.
 */

import type { AnyAgentTool, AgenticMailToolConfig, ToolCreationOptions } from '../types.js';
import { jsonResult, readNumberParam, readStringParam, wrapWebContent, wrapExternalContent, errorResult } from '../common.js';
import type { SsrfGuard } from '../security.js';
import {
  extractReadableContent,
  htmlToMarkdown,
  markdownToText,
  truncateText,
  type ExtractMode,
} from './web-fetch-utils.js';
import {
  LRUCache,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  withTimeout,
  writeCache,
} from './web-shared.js';

export { extractReadableContent } from './web-fetch-utils.js';

const DEFAULT_FETCH_MAX_CHARS = 50_000;
const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 2_000_000;
const FETCH_MAX_RESPONSE_BYTES_MIN = 32_000;
const FETCH_MAX_RESPONSE_BYTES_MAX = 10_000_000;
const DEFAULT_FETCH_MAX_REDIRECTS = 3;
const DEFAULT_ERROR_MAX_CHARS = 4_000;
const DEFAULT_ERROR_MAX_BYTES = 64_000;
const DEFAULT_FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev';
const DEFAULT_FIRECRAWL_MAX_AGE_MS = 172_800_000;
const DEFAULT_FETCH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

var FETCH_CACHE = new LRUCache<Record<string, unknown>>({ maxEntries: 200 });

type WebFetchConfig = NonNullable<AgenticMailToolConfig['web']>['fetch'];

function resolveFetchMaxCharsCap(fetch?: WebFetchConfig): number {
  var raw = fetch?.maxCharsCap;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_FETCH_MAX_CHARS;
  return Math.max(100, Math.floor(raw));
}

function resolveFetchMaxResponseBytes(fetch?: WebFetchConfig): number {
  var raw = fetch?.maxResponseBytes;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return DEFAULT_FETCH_MAX_RESPONSE_BYTES;
  var value = Math.floor(raw);
  return Math.min(FETCH_MAX_RESPONSE_BYTES_MAX, Math.max(FETCH_MAX_RESPONSE_BYTES_MIN, value));
}

function resolveMaxChars(value: unknown, fallback: number, cap: number): number {
  var parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  var clamped = Math.max(100, Math.floor(parsed));
  return Math.min(clamped, cap);
}

function resolveMaxRedirects(value: unknown, fallback: number): number {
  var parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.floor(parsed));
}

function looksLikeHtml(value: string): boolean {
  var trimmed = value.trimStart();
  if (!trimmed) return false;
  var head = trimmed.slice(0, 256).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function formatWebFetchErrorDetail(params: {
  detail: string;
  contentType?: string | null;
  maxChars: number;
}): string {
  var { detail, contentType, maxChars } = params;
  if (!detail) return '';
  var text = detail;
  var contentTypeLower = contentType?.toLowerCase();
  if (contentTypeLower?.includes('text/html') || looksLikeHtml(detail)) {
    var rendered = htmlToMarkdown(detail);
    var withTitle = rendered.title ? rendered.title + '\n' + rendered.text : rendered.text;
    text = markdownToText(withTitle);
  }
  var truncated = truncateText(text.trim(), maxChars);
  return truncated.text;
}

function wrapWebFetchContent(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean; rawLength: number; wrappedLength: number } {
  if (maxChars <= 0) return { text: '', truncated: true, rawLength: 0, wrappedLength: 0 };
  var wrapperOverhead = wrapWebContent('', 'web_fetch').length;
  var maxInner = Math.max(0, maxChars - wrapperOverhead);
  var truncated = truncateText(value, maxInner);
  var wrappedText = wrapWebContent(truncated.text, 'web_fetch');
  if (wrappedText.length > maxChars) {
    var excess = wrappedText.length - maxChars;
    var adjustedMaxInner = Math.max(0, maxInner - excess);
    truncated = truncateText(value, adjustedMaxInner);
    wrappedText = wrapWebContent(truncated.text, 'web_fetch');
  }
  return {
    text: wrappedText,
    truncated: truncated.truncated,
    rawLength: truncated.text.length,
    wrappedLength: wrappedText.length,
  };
}

function normalizeContentType(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  var raw = value.split(';')[0];
  var trimmed = raw?.trim();
  return trimmed || undefined;
}

/** Fetch content from Firecrawl API as fallback */
export async function fetchFirecrawlContent(params: {
  url: string;
  extractMode: ExtractMode;
  apiKey: string;
  baseUrl: string;
  onlyMainContent: boolean;
  maxAgeMs: number;
  timeoutSeconds: number;
}): Promise<{ text: string; title?: string; finalUrl?: string; status?: number; warning?: string }> {
  var baseUrl = params.baseUrl.trim();
  var endpoint: string;
  try {
    var url = new URL(baseUrl);
    if (url.pathname && url.pathname !== '/') endpoint = url.toString();
    else { url.pathname = '/v2/scrape'; endpoint = url.toString(); }
  } catch {
    endpoint = DEFAULT_FIRECRAWL_BASE_URL + '/v2/scrape';
  }

  var res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + params.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: params.url,
      formats: ['markdown'],
      onlyMainContent: params.onlyMainContent,
      timeout: params.timeoutSeconds * 1000,
      maxAge: params.maxAgeMs,
    }),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  var payload = await res.json() as any;
  if (!res.ok || payload?.success === false) {
    throw new Error('Firecrawl fetch failed (' + res.status + '): ' + (payload?.error || res.statusText));
  }

  var data = payload?.data ?? {};
  var rawText = typeof data.markdown === 'string' ? data.markdown
    : typeof data.content === 'string' ? data.content : '';
  var text = params.extractMode === 'text' ? markdownToText(rawText) : rawText;
  return {
    text,
    title: data.metadata?.title,
    finalUrl: data.metadata?.sourceURL,
    status: data.metadata?.statusCode,
    warning: payload?.warning,
  };
}

type WebFetchRuntimeParams = {
  url: string;
  extractMode: ExtractMode;
  maxChars: number;
  maxResponseBytes: number;
  maxRedirects: number;
  timeoutSeconds: number;
  cacheTtlMs: number;
  userAgent: string;
  readabilityEnabled: boolean;
  firecrawlEnabled: boolean;
  firecrawlApiKey?: string;
  firecrawlBaseUrl: string;
  firecrawlOnlyMainContent: boolean;
  firecrawlMaxAgeMs: number;
  firecrawlTimeoutSeconds: number;
  ssrfGuard?: SsrfGuard;
};

async function tryFirecrawlFallback(
  params: WebFetchRuntimeParams,
): Promise<{ text: string; title?: string } | null> {
  if (!params.firecrawlEnabled || !params.firecrawlApiKey) return null;
  try {
    var result = await fetchFirecrawlContent({
      url: params.url,
      extractMode: params.extractMode,
      apiKey: params.firecrawlApiKey,
      baseUrl: params.firecrawlBaseUrl,
      onlyMainContent: params.firecrawlOnlyMainContent,
      maxAgeMs: params.firecrawlMaxAgeMs,
      timeoutSeconds: params.firecrawlTimeoutSeconds,
    });
    return { text: result.text, title: result.title };
  } catch {
    return null;
  }
}

async function followRedirects(
  url: string,
  maxRedirects: number,
  init: RequestInit,
  ssrfGuard?: SsrfGuard,
): Promise<{ response: Response; finalUrl: string }> {
  var currentUrl = url;
  for (var i = 0; i <= maxRedirects; i++) {
    // SSRF check on every redirect URL
    if (ssrfGuard) await ssrfGuard.validateUrl(currentUrl);
    var res = await fetch(currentUrl, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      var location = res.headers.get('location');
      if (!location) return { response: res, finalUrl: currentUrl };
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return { response: res, finalUrl: currentUrl };
  }
  throw new Error('Too many redirects (max: ' + maxRedirects + ')');
}

async function runWebFetch(params: WebFetchRuntimeParams): Promise<Record<string, unknown>> {
  var cacheKey = normalizeCacheKey('fetch:' + params.url + ':' + params.extractMode + ':' + params.maxChars);
  var cached = readCache(FETCH_CACHE, cacheKey);
  if (cached) return { ...cached.value, cached: true };

  var parsedUrl: URL;
  try { parsedUrl = new URL(params.url); } catch {
    throw new Error('Invalid URL: must be http or https');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Invalid URL: must be http or https');
  }

  // SSRF guard on initial URL
  if (params.ssrfGuard) await params.ssrfGuard.validateUrl(params.url);

  var start = Date.now();
  var fetchResult: { response: Response; finalUrl: string };
  try {
    fetchResult = await followRedirects(params.url, params.maxRedirects, {
      headers: {
        Accept: 'text/markdown, text/html;q=0.9, */*;q=0.1',
        'User-Agent': params.userAgent,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: withTimeout(undefined, params.timeoutSeconds * 1000),
    }, params.ssrfGuard);
  } catch (error) {
    // Try Firecrawl as fallback
    if (params.firecrawlEnabled && params.firecrawlApiKey) {
      var firecrawl = await tryFirecrawlFallback(params);
      if (firecrawl) {
        var wrapped = wrapWebFetchContent(firecrawl.text, params.maxChars);
        var payload: Record<string, unknown> = {
          url: params.url,
          finalUrl: params.url,
          status: 200,
          contentType: 'text/markdown',
          title: firecrawl.title,
          extractMode: params.extractMode,
          extractor: 'firecrawl',
          truncated: wrapped.truncated,
          length: wrapped.wrappedLength,
          fetchedAt: new Date().toISOString(),
          tookMs: Date.now() - start,
          text: wrapped.text,
        };
        writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs);
        return payload;
      }
    }
    throw error;
  }

  var res = fetchResult.response;
  var finalUrl = fetchResult.finalUrl;

  if (!res.ok) {
    var rawDetailResult = await readResponseText(res, { maxBytes: DEFAULT_ERROR_MAX_BYTES });
    var detail = formatWebFetchErrorDetail({
      detail: rawDetailResult.text,
      contentType: res.headers.get('content-type'),
      maxChars: DEFAULT_ERROR_MAX_CHARS,
    });
    throw new Error('Web fetch failed (' + res.status + '): ' + (detail || res.statusText));
  }

  var contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  var normalizedContentType = normalizeContentType(contentType) ?? 'application/octet-stream';
  var bodyResult = await readResponseText(res, { maxBytes: params.maxResponseBytes });
  var body = bodyResult.text;

  var title: string | undefined;
  var extractor = 'raw';
  var text = body;

  if (contentType.includes('text/markdown')) {
    extractor = 'cf-markdown';
    if (params.extractMode === 'text') text = markdownToText(body);
  } else if (contentType.includes('text/html')) {
    if (params.readabilityEnabled) {
      var readable = await extractReadableContent({
        html: body,
        url: finalUrl,
        extractMode: params.extractMode,
      });
      if (readable?.text) {
        text = readable.text;
        title = readable.title;
        extractor = 'readability';
      } else {
        var firecrawlResult = await tryFirecrawlFallback(params);
        if (firecrawlResult) {
          text = firecrawlResult.text;
          title = firecrawlResult.title;
          extractor = 'firecrawl';
        } else {
          // Last resort: simple HTML to markdown
          var simple = htmlToMarkdown(body);
          text = simple.text;
          title = simple.title;
          extractor = 'html-strip';
        }
      }
    } else {
      var simple = htmlToMarkdown(body);
      text = simple.text;
      title = simple.title;
      extractor = 'html-strip';
    }
  } else if (contentType.includes('application/json')) {
    try { text = JSON.stringify(JSON.parse(body), null, 2); extractor = 'json'; }
    catch { extractor = 'raw'; }
  }

  var wrappedResult = wrapWebFetchContent(text, params.maxChars);
  var resultPayload: Record<string, unknown> = {
    url: params.url,
    finalUrl,
    status: res.status,
    contentType: normalizedContentType,
    title: title ? wrapExternalContent(title, 'web_fetch') : undefined,
    extractMode: params.extractMode,
    extractor,
    truncated: wrappedResult.truncated,
    length: wrappedResult.wrappedLength,
    rawLength: wrappedResult.rawLength,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - start,
    text: wrappedResult.text,
  };
  writeCache(FETCH_CACHE, cacheKey, resultPayload, params.cacheTtlMs);
  return resultPayload;
}

export function createWebFetchTool(options?: ToolCreationOptions & {
  ssrfGuard?: SsrfGuard;
}): AnyAgentTool | null {
  var fetchConfig = options?.config?.web?.fetch;
  if (fetchConfig?.enabled === false) return null;

  var readabilityEnabled = fetchConfig?.readability !== false;
  var firecrawlConfig = fetchConfig?.firecrawl;
  var firecrawlApiKey = firecrawlConfig?.apiKey?.trim()
    || process.env.FIRECRAWL_API_KEY?.trim() || undefined;
  var firecrawlEnabled = firecrawlConfig?.enabled !== false && Boolean(firecrawlApiKey);
  var firecrawlBaseUrl = firecrawlConfig?.baseUrl?.trim() || DEFAULT_FIRECRAWL_BASE_URL;
  var firecrawlOnlyMainContent = firecrawlConfig?.onlyMainContent !== false;
  var firecrawlMaxAgeMs = firecrawlConfig?.maxAgeMs ?? DEFAULT_FIRECRAWL_MAX_AGE_MS;
  var firecrawlTimeoutSeconds = resolveTimeoutSeconds(
    firecrawlConfig?.timeoutSeconds ?? fetchConfig?.timeoutSeconds,
    DEFAULT_TIMEOUT_SECONDS,
  );
  var userAgent = fetchConfig?.userAgent || DEFAULT_FETCH_USER_AGENT;
  var maxResponseBytes = resolveFetchMaxResponseBytes(fetchConfig);

  return {
    label: 'Web Fetch',
    name: 'web_fetch',
    description: 'Fetch and extract readable content from a URL (HTML → markdown/text). Use for lightweight page access without browser automation.',
    category: 'web',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTP or HTTPS URL to fetch.' },
        extractMode: {
          type: 'string',
          description: 'Extraction mode ("markdown" or "text").',
          enum: ['markdown', 'text'],
        },
        maxChars: {
          type: 'number',
          description: 'Maximum characters to return (truncates when exceeded).',
          minimum: 100,
        },
      },
      required: ['url'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var url = readStringParam(params, 'url', { required: true });
      var extractMode: ExtractMode = readStringParam(params, 'extractMode') === 'text' ? 'text' : 'markdown';
      var maxChars = readNumberParam(params, 'maxChars', { integer: true });
      var maxCharsCap = resolveFetchMaxCharsCap(fetchConfig);
      try {
        var result = await runWebFetch({
          url,
          extractMode,
          maxChars: resolveMaxChars(maxChars ?? fetchConfig?.maxChars, DEFAULT_FETCH_MAX_CHARS, maxCharsCap),
          maxResponseBytes,
          maxRedirects: resolveMaxRedirects(fetchConfig?.maxRedirects, DEFAULT_FETCH_MAX_REDIRECTS),
          timeoutSeconds: resolveTimeoutSeconds(fetchConfig?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
          cacheTtlMs: resolveCacheTtlMs(fetchConfig?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
          userAgent,
          readabilityEnabled,
          firecrawlEnabled,
          firecrawlApiKey,
          firecrawlBaseUrl,
          firecrawlOnlyMainContent,
          firecrawlMaxAgeMs,
          firecrawlTimeoutSeconds,
          ssrfGuard: options?.ssrfGuard,
        });
        return jsonResult(result);
      } catch (err: any) {
        if (err.name === 'SecurityError') {
          return errorResult('SSRF blocked: ' + err.message);
        }
        throw err;
      }
    },
  };
}
