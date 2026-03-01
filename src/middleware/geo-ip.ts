/**
 * AgenticMail Enterprise — Geo-IP Restriction Middleware
 *
 * Restricts access by country code. Tries reverse proxy headers first,
 * then falls back to built-in IP geolocation lookup with LRU cache.
 */

import type { MiddlewareHandler } from 'hono';
import { getNetworkConfig } from './network-config.js';

const COUNTRY_HEADERS = [
  'cf-ipcountry',         // Cloudflare (proxy mode)
  'x-country-code',       // Generic / custom
  'x-vercel-ip-country',  // Vercel
];

// ─── Built-in IP → Country Lookup (LRU Cache) ───────────

interface GeoCache {
  country: string;
  ts: number;
}

const GEO_CACHE = new Map<string, GeoCache>();
const GEO_CACHE_TTL = 3600_000; // 1 hour
const GEO_CACHE_MAX = 10_000;
const GEO_LOOKUP_TIMEOUT = 3_000; // 3s — don't block requests for slow lookups

async function lookupCountry(ip: string): Promise<string | null> {
  // Check cache
  const cached = GEO_CACHE.get(ip);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
    return cached.country;
  }

  // Skip private/local IPs
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === 'localhost') {
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT);
    // ip-api.com — free for non-commercial, 45 req/min. Returns JSON with countryCode.
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return null;
    const data = await resp.json() as { status: string; countryCode?: string };
    if (data.status !== 'success' || !data.countryCode) return null;

    const country = data.countryCode.toUpperCase();

    // Evict oldest if cache full
    if (GEO_CACHE.size >= GEO_CACHE_MAX) {
      const oldest = GEO_CACHE.keys().next().value;
      if (oldest) GEO_CACHE.delete(oldest);
    }
    GEO_CACHE.set(ip, { country, ts: Date.now() });

    return country;
  } catch {
    return null; // Network error — fail open (don't block)
  }
}

// ─── Block Page HTML ─────────────────────────────────────

const GEO_BLOCK_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Access Restricted</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e1e4e8}
  .container{text-align:center;max-width:480px;padding:40px 24px}
  .icon{width:64px;height:64px;margin:0 auto 24px;border-radius:16px;background:rgba(255,107,107,0.1);display:flex;align-items:center;justify-content:center}
  .icon svg{width:32px;height:32px;stroke:#ff6b6b;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:24px;font-weight:700;margin-bottom:12px;color:#fff}
  p{font-size:15px;line-height:1.6;color:#8b949e;margin-bottom:8px}
  .subtle{font-size:13px;color:#484f58;margin-top:24px}
</style>
</head>
<body>
<div class="container">
  <div class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>
  <h1>Access Restricted</h1>
  <p>This service is not available in your region. Access has been restricted by the administrator.</p>
  <p>If you believe this is an error, please contact the site owner.</p>
  <div class="subtle">Error 403</div>
</div>
</body>
</html>`;

/**
 * Geo-IP restriction middleware.
 * Checks reverse proxy headers first, falls back to IP lookup.
 */
export function geoIpRestriction(): MiddlewareHandler {
  return async (c, next) => {
    const config = await getNetworkConfig();
    const geo = config.geoIp;

    if (!geo?.enabled || !geo.countries?.length) return next();

    // 1. Try reverse proxy headers
    let country: string | null = null;
    for (const header of COUNTRY_HEADERS) {
      const val = c.req.header(header);
      if (val) {
        country = val.toUpperCase().trim();
        break;
      }
    }

    // 2. Fallback: IP geolocation lookup
    if (!country) {
      const clientIp =
        c.req.header('cf-connecting-ip') ||
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        (c as any).get?.('clientIp') ||
        null;
      if (clientIp) {
        country = await lookupCountry(clientIp);
      }
    }

    // If still no country, pass through (fail open)
    if (!country) return next();

    const countries = new Set(geo.countries.map((c: string) => c.toUpperCase()));
    const mode = geo.mode || 'blocklist'; // Default to blocklist if not set

    let blocked = false;
    if (mode === 'allowlist' && !countries.has(country)) blocked = true;
    if (mode === 'blocklist' && countries.has(country)) blocked = true;

    if (blocked) {
      // Check if this is an API call (wants JSON) or browser (wants HTML)
      const accept = c.req.header('accept') || '';
      if (accept.includes('application/json') || c.req.path.startsWith('/api/')) {
        return c.json({ error: 'Access restricted', code: 'GEO_BLOCKED' }, 403);
      }

      // Serve a proper HTML block page for browsers
      return c.html(GEO_BLOCK_PAGE, 403);
    }

    return next();
  };
}
