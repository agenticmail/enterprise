/**
 * AgenticMail Agent Tools — Web Search
 *
 * Multi-provider web search supporting Brave, Perplexity, and Grok (xAI).
 */

import type { AnyAgentTool, AgenticMailToolConfig } from '../types.js';
import { jsonResult, readNumberParam, readStringParam, normalizeSecretInput, wrapWebContent } from '../common.js';
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

const SEARCH_PROVIDERS = ['brave', 'perplexity', 'grok'] as const;
type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_PERPLEXITY_BASE_URL = 'https://openrouter.ai/api/v1';
const PERPLEXITY_DIRECT_BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_PERPLEXITY_MODEL = 'perplexity/sonar-pro';
const PERPLEXITY_KEY_PREFIXES = ['pplx-'];
const OPENROUTER_KEY_PREFIXES = ['sk-or-'];

const XAI_API_ENDPOINT = 'https://api.x.ai/v1/responses';
const DEFAULT_GROK_MODEL = 'grok-4-1-fast';

var SEARCH_CACHE = new LRUCache<Record<string, unknown>>({ maxEntries: 200 });
var BRAVE_FRESHNESS_SHORTCUTS = new Set(['pd', 'pw', 'pm', 'py']);
var BRAVE_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

type WebSearchConfig = NonNullable<AgenticMailToolConfig['web']>['search'];

type BraveSearchResult = { title?: string; url?: string; description?: string; age?: string };
type BraveSearchResponse = { web?: { results?: BraveSearchResult[] } };

type PerplexitySearchResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
};

type GrokSearchResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string }>;
    }>;
  }>;
  output_text?: string;
  citations?: string[];
};

// --- Provider resolution ---

function resolveSearchProvider(search?: WebSearchConfig): SearchProvider {
  var raw = search?.provider?.trim().toLowerCase() ?? '';
  if (raw === 'perplexity') return 'perplexity';
  if (raw === 'grok') return 'grok';
  return 'brave';
}

function resolveSearchApiKey(search?: WebSearchConfig): string | undefined {
  var fromConfig = normalizeSecretInput(search?.apiKey);
  var fromEnv = normalizeSecretInput(process.env.BRAVE_API_KEY);
  return fromConfig || fromEnv || undefined;
}

function resolvePerplexityApiKey(search?: WebSearchConfig): { apiKey?: string; source: string } {
  var perplexity = search?.perplexity;
  var fromConfig = normalizeSecretInput(perplexity?.apiKey);
  if (fromConfig) return { apiKey: fromConfig, source: 'config' };
  var fromEnvPerplexity = normalizeSecretInput(process.env.PERPLEXITY_API_KEY);
  if (fromEnvPerplexity) return { apiKey: fromEnvPerplexity, source: 'perplexity_env' };
  var fromEnvOpenRouter = normalizeSecretInput(process.env.OPENROUTER_API_KEY);
  if (fromEnvOpenRouter) return { apiKey: fromEnvOpenRouter, source: 'openrouter_env' };
  return { apiKey: undefined, source: 'none' };
}

function resolvePerplexityBaseUrl(search?: WebSearchConfig, source = 'none', apiKey?: string): string {
  var perplexity = search?.perplexity;
  var fromConfig = perplexity?.baseUrl?.trim() ?? '';
  if (fromConfig) return fromConfig;
  if (source === 'perplexity_env') return PERPLEXITY_DIRECT_BASE_URL;
  if (source === 'openrouter_env') return DEFAULT_PERPLEXITY_BASE_URL;
  if (source === 'config' && apiKey) {
    var lower = apiKey.toLowerCase();
    if (PERPLEXITY_KEY_PREFIXES.some(function(p) { return lower.startsWith(p); })) return PERPLEXITY_DIRECT_BASE_URL;
    if (OPENROUTER_KEY_PREFIXES.some(function(p) { return lower.startsWith(p); })) return DEFAULT_PERPLEXITY_BASE_URL;
  }
  return DEFAULT_PERPLEXITY_BASE_URL;
}

function resolvePerplexityModel(search?: WebSearchConfig): string {
  return search?.perplexity?.model?.trim() || DEFAULT_PERPLEXITY_MODEL;
}

function isDirectPerplexityBaseUrl(baseUrl: string): boolean {
  try { return new URL(baseUrl.trim()).hostname.toLowerCase() === 'api.perplexity.ai'; }
  catch { return false; }
}

function resolvePerplexityRequestModel(baseUrl: string, model: string): string {
  if (!isDirectPerplexityBaseUrl(baseUrl)) return model;
  return model.startsWith('perplexity/') ? model.slice('perplexity/'.length) : model;
}

function resolveGrokApiKey(search?: WebSearchConfig): string | undefined {
  var grok = search?.grok;
  var fromConfig = normalizeSecretInput(grok?.apiKey);
  if (fromConfig) return fromConfig;
  var fromEnv = normalizeSecretInput(process.env.XAI_API_KEY);
  return fromEnv || undefined;
}

function resolveGrokModel(search?: WebSearchConfig): string {
  return search?.grok?.model?.trim() || DEFAULT_GROK_MODEL;
}

function resolveGrokInlineCitations(search?: WebSearchConfig): boolean {
  return search?.grok?.inlineCitations === true;
}

function resolveSearchCount(value: unknown, fallback: number): number {
  var parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}

// --- Freshness ---

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) return undefined;
  var trimmed = value.trim();
  if (!trimmed) return undefined;
  var lower = trimmed.toLowerCase();
  if (BRAVE_FRESHNESS_SHORTCUTS.has(lower)) return lower;
  var match = trimmed.match(BRAVE_FRESHNESS_RANGE);
  if (!match) return undefined;
  var start = match[1];
  var end = match[2];
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return undefined;
  if (start > end) return undefined;
  return start + 'to' + end;
}

function freshnessToPerplexityRecency(freshness: string | undefined): string | undefined {
  if (!freshness) return undefined;
  var map: Record<string, string> = { pd: 'day', pw: 'week', pm: 'month', py: 'year' };
  return map[freshness] ?? undefined;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var parts = value.split('-').map(function(p) { return Number.parseInt(p, 10); });
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname; }
  catch { return undefined; }
}

function extractGrokContent(data: GrokSearchResponse): { text: string | undefined; annotationCitations: string[] } {
  for (var output of data.output ?? []) {
    if (output.type !== 'message') continue;
    for (var block of output.content ?? []) {
      if (block.type === 'output_text' && typeof block.text === 'string' && block.text) {
        var urls = (block.annotations ?? [])
          .filter(function(a) { return a.type === 'url_citation' && typeof a.url === 'string'; })
          .map(function(a) { return a.url as string; });
        return { text: block.text, annotationCitations: [...new Set(urls)] };
      }
    }
  }
  var text = typeof data.output_text === 'string' ? data.output_text : undefined;
  return { text, annotationCitations: [] };
}

// --- Provider runners ---

async function runBraveSearch(params: {
  query: string;
  count: number;
  apiKey: string;
  timeoutSeconds: number;
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: string;
}): Promise<Record<string, unknown>> {
  var url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set('q', params.query);
  url.searchParams.set('count', String(params.count));
  if (params.country) url.searchParams.set('country', params.country);
  if (params.search_lang) url.searchParams.set('search_lang', params.search_lang);
  if (params.ui_lang) url.searchParams.set('ui_lang', params.ui_lang);
  if (params.freshness) url.searchParams.set('freshness', params.freshness);

  var res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Subscription-Token': params.apiKey },
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    var detailResult = await readResponseText(res, { maxBytes: 64_000 });
    throw new Error('Brave Search API error (' + res.status + '): ' + (detailResult.text || res.statusText));
  }

  var data = await res.json() as BraveSearchResponse;
  var results = Array.isArray(data.web?.results) ? data.web!.results : [];
  return {
    query: params.query,
    provider: 'brave',
    count: results.length,
    results: results.map(function(entry) {
      return {
        title: entry.title ? wrapWebContent(entry.title, 'web_search') : '',
        url: entry.url ?? '',
        description: entry.description ? wrapWebContent(entry.description, 'web_search') : '',
        published: entry.age || undefined,
        siteName: resolveSiteName(entry.url) || undefined,
      };
    }),
  };
}

async function runPerplexitySearch(params: {
  query: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  freshness?: string;
}): Promise<Record<string, unknown>> {
  var baseUrl = params.baseUrl.trim().replace(/\/$/, '');
  var endpoint = baseUrl + '/chat/completions';
  var model = resolvePerplexityRequestModel(baseUrl, params.model);

  var body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: params.query }],
  };
  var recencyFilter = freshnessToPerplexityRecency(params.freshness);
  if (recencyFilter) body.search_recency_filter = recencyFilter;

  var res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + params.apiKey,
      'HTTP-Referer': 'https://agenticmail.io',
      'X-Title': 'AgenticMail Web Search',
    },
    body: JSON.stringify(body),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    var detailResult = await readResponseText(res, { maxBytes: 64_000 });
    throw new Error('Perplexity API error (' + res.status + '): ' + (detailResult.text || res.statusText));
  }

  var data = await res.json() as PerplexitySearchResponse;
  return {
    query: params.query,
    provider: 'perplexity',
    model: params.model,
    content: wrapWebContent(data.choices?.[0]?.message?.content ?? 'No response'),
    citations: data.citations ?? [],
  };
}

async function runGrokSearch(params: {
  query: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
  inlineCitations: boolean;
}): Promise<Record<string, unknown>> {
  var res = await fetch(XAI_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + params.apiKey,
    },
    body: JSON.stringify({
      model: params.model,
      input: [{ role: 'user', content: params.query }],
      tools: [{ type: 'web_search' }],
    }),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    var detailResult = await readResponseText(res, { maxBytes: 64_000 });
    throw new Error('xAI API error (' + res.status + '): ' + (detailResult.text || res.statusText));
  }

  var data = await res.json() as GrokSearchResponse;
  var extracted = extractGrokContent(data);
  return {
    query: params.query,
    provider: 'grok',
    model: params.model,
    content: wrapWebContent(extracted.text ?? 'No response'),
    citations: (data.citations ?? []).length > 0 ? data.citations! : extracted.annotationCitations,
  };
}

// --- Main runner ---

async function runWebSearch(params: {
  query: string;
  count: number;
  apiKey: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
  provider: SearchProvider;
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: string;
  perplexityBaseUrl?: string;
  perplexityModel?: string;
  grokModel?: string;
  grokInlineCitations?: boolean;
}): Promise<Record<string, unknown>> {
  var cacheKey = normalizeCacheKey(params.provider + ':' + params.query + ':' + params.count);
  var cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) return { ...cached.value, cached: true };

  var start = Date.now();
  var result: Record<string, unknown>;

  if (params.provider === 'perplexity') {
    result = await runPerplexitySearch({
      query: params.query,
      apiKey: params.apiKey,
      baseUrl: params.perplexityBaseUrl ?? DEFAULT_PERPLEXITY_BASE_URL,
      model: params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL,
      timeoutSeconds: params.timeoutSeconds,
      freshness: params.freshness,
    });
  } else if (params.provider === 'grok') {
    result = await runGrokSearch({
      query: params.query,
      apiKey: params.apiKey,
      model: params.grokModel ?? DEFAULT_GROK_MODEL,
      timeoutSeconds: params.timeoutSeconds,
      inlineCitations: params.grokInlineCitations ?? false,
    });
  } else {
    result = await runBraveSearch({
      query: params.query,
      count: params.count,
      apiKey: params.apiKey,
      timeoutSeconds: params.timeoutSeconds,
      country: params.country,
      search_lang: params.search_lang,
      ui_lang: params.ui_lang,
      freshness: params.freshness,
    });
  }

  result.tookMs = Date.now() - start;
  result.externalContent = { untrusted: true, source: 'web_search', provider: params.provider, wrapped: true };
  writeCache(SEARCH_CACHE, cacheKey, result, params.cacheTtlMs);
  return result;
}

// --- Tool creation ---

function missingSearchKeyPayload(provider: SearchProvider) {
  if (provider === 'perplexity') return {
    error: 'missing_perplexity_api_key',
    message: 'web_search (perplexity) needs an API key. Set PERPLEXITY_API_KEY or OPENROUTER_API_KEY, or configure tools.web.search.perplexity.apiKey.',
  };
  if (provider === 'grok') return {
    error: 'missing_xai_api_key',
    message: 'web_search (grok) needs an xAI API key. Set XAI_API_KEY or configure tools.web.search.grok.apiKey.',
  };
  return {
    error: 'missing_brave_api_key',
    message: 'web_search needs a Brave Search API key. Set BRAVE_API_KEY or configure tools.web.search.apiKey.',
  };
}

export function createWebSearchTool(options?: {
  config?: AgenticMailToolConfig;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  var search = options?.config?.web?.search;
  if (search?.enabled === false) return null;

  var provider = resolveSearchProvider(search);

  var description = provider === 'perplexity'
    ? 'Search the web using Perplexity Sonar. Returns AI-synthesized answers with citations from real-time web search.'
    : provider === 'grok'
      ? 'Search the web using xAI Grok. Returns AI-synthesized answers with citations from real-time web search.'
      : 'Search the web using Brave Search API. Returns titles, URLs, and snippets for fast research.';

  return {
    label: 'Web Search',
    name: 'web_search',
    description,
    category: 'web',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string.' },
        count: { type: 'number', description: 'Number of results to return (1-10).', minimum: 1, maximum: MAX_SEARCH_COUNT },
        country: { type: 'string', description: '2-letter country code for region-specific results.' },
        search_lang: { type: 'string', description: 'ISO language code for search results.' },
        ui_lang: { type: 'string', description: 'ISO language code for UI elements.' },
        freshness: { type: 'string', description: 'Filter by time: pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD.' },
      },
      required: ['query'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var perplexityAuth = provider === 'perplexity' ? resolvePerplexityApiKey(search) : undefined;
      var apiKey = provider === 'perplexity'
        ? perplexityAuth?.apiKey
        : provider === 'grok'
          ? resolveGrokApiKey(search)
          : resolveSearchApiKey(search);

      if (!apiKey) return jsonResult(missingSearchKeyPayload(provider));

      var query = readStringParam(params, 'query', { required: true });
      var count = readNumberParam(params, 'count', { integer: true }) ?? search?.maxResults;
      var country = readStringParam(params, 'country');
      var search_lang = readStringParam(params, 'search_lang');
      var ui_lang = readStringParam(params, 'ui_lang');
      var rawFreshness = readStringParam(params, 'freshness');
      var freshness = rawFreshness ? normalizeFreshness(rawFreshness) : undefined;

      if (rawFreshness && !freshness) {
        return jsonResult({
          error: 'invalid_freshness',
          message: 'freshness must be one of pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD.',
        });
      }

      var result = await runWebSearch({
        query,
        count: resolveSearchCount(count, DEFAULT_SEARCH_COUNT),
        apiKey,
        timeoutSeconds: resolveTimeoutSeconds(search?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
        cacheTtlMs: resolveCacheTtlMs(search?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
        provider,
        country,
        search_lang,
        ui_lang,
        freshness,
        perplexityBaseUrl: resolvePerplexityBaseUrl(search, perplexityAuth?.source, perplexityAuth?.apiKey),
        perplexityModel: resolvePerplexityModel(search),
        grokModel: resolveGrokModel(search),
        grokInlineCitations: resolveGrokInlineCitations(search),
      });
      return jsonResult(result);
    },
  };
}
