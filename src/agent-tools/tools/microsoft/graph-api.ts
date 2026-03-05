/**
 * Microsoft Graph API Helper
 *
 * Enhanced shared fetch wrapper for all Microsoft 365 tools.
 * Supports pagination, batch requests, retry with backoff, and rate limiting.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

export interface GraphOptions {
  method?: string;
  body?: any;
  query?: Record<string, string>;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  beta?: boolean;
  /** Max retries on 429/5xx (default: 3) */
  retries?: number;
  /** Return raw Response instead of parsed JSON */
  raw?: boolean;
}

/**
 * Core Graph API fetch — handles auth, JSON, retries, rate-limit backoff.
 */
export async function graph(token: string, path: string, opts?: GraphOptions): Promise<any> {
  const method = opts?.method || 'GET';
  const base = opts?.beta ? GRAPH_BETA : GRAPH_BASE;
  const url = new URL(base + path);
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...opts?.headers,
  };
  if (!opts?.rawBody && !opts?.headers?.['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const maxRetries = opts?.retries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: opts?.rawBody || (opts?.body ? JSON.stringify(opts.body) : undefined),
      });

      // Rate limited — back off using Retry-After header
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        await sleep(retryAfter * 1000);
        continue;
      }

      // Server error — exponential backoff
      if (res.status >= 500 && attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      if (opts?.raw) return res;

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Graph ${method} ${path} ${res.status}: ${err}`);
      }
      if (res.status === 204 || res.status === 202) return {};
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
      return { content: await res.text() };
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries && e.message?.includes('fetch failed')) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error('Graph request failed after retries');
}

/**
 * Auto-paginate a Graph API collection. Follows @odata.nextLink up to maxPages.
 * Returns all items concatenated.
 */
export async function graphPaginate(
  token: string,
  path: string,
  opts?: GraphOptions & { maxPages?: number; maxItems?: number }
): Promise<any[]> {
  const maxPages = opts?.maxPages ?? 10;
  const maxItems = opts?.maxItems ?? 500;
  const items: any[] = [];
  let nextUrl: string | null = null;
  let page = 0;

  // First request
  const first = await graph(token, path, opts);
  items.push(...(first.value || []));
  nextUrl = first['@odata.nextLink'] || null;

  // Follow pagination
  while (nextUrl && ++page < maxPages && items.length < maxItems) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    items.push(...(data.value || []));
    nextUrl = data['@odata.nextLink'] || null;
  }

  return items.slice(0, maxItems);
}

/**
 * Execute a JSON batch request (up to 20 requests per batch).
 * https://learn.microsoft.com/en-us/graph/json-batching
 */
export async function graphBatch(
  token: string,
  requests: Array<{
    id: string;
    method: string;
    url: string;
    body?: any;
    headers?: Record<string, string>;
  }>,
  opts?: { beta?: boolean }
): Promise<Map<string, { status: number; body: any }>> {
  const base = opts?.beta ? GRAPH_BETA : GRAPH_BASE;
  const res = await fetch(`${base}/$batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    throw new Error(`Graph batch ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const results = new Map<string, { status: number; body: any }>();
  for (const r of data.responses || []) {
    results.set(r.id, { status: r.status, body: r.body });
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
