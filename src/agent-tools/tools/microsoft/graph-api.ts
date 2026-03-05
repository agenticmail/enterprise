/**
 * Microsoft Graph API helper
 *
 * Shared fetch wrapper for all Microsoft 365 tools.
 * Uses Microsoft Graph API v1.0.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export async function graph(
  token: string,
  path: string,
  opts?: {
    method?: string;
    body?: any;
    query?: Record<string, string>;
    rawBody?: BodyInit;
    headers?: Record<string, string>;
    beta?: boolean;
  }
): Promise<any> {
  const method = opts?.method || 'GET';
  const base = opts?.beta ? 'https://graph.microsoft.com/beta' : GRAPH_BASE;
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
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts?.rawBody || (opts?.body ? JSON.stringify(opts.body) : undefined),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph ${res.status}: ${err}`);
  }
  if (res.status === 204) return {};
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return { content: await res.text() };
}
