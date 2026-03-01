/**
 * AgenticMail Enterprise — Geo-IP Restriction Middleware
 *
 * Restricts access by country code. Reads country from headers
 * set by reverse proxies (Cloudflare CF-IPCountry, AWS X-Country-Code, etc.).
 */

import type { MiddlewareHandler } from 'hono';
import { getNetworkConfig } from './network-config.js';

const COUNTRY_HEADERS = [
  'cf-ipcountry',       // Cloudflare
  'x-country-code',     // Generic / custom
  'x-vercel-ip-country', // Vercel
];

/**
 * Geo-IP restriction middleware.
 * Requires a reverse proxy that sets country headers.
 */
export function geoIpRestriction(): MiddlewareHandler {
  return async (c, next) => {
    const config = await getNetworkConfig();
    const geo = config.geoIp;

    if (!geo?.enabled || !geo.countries?.length) return next();

    // Extract country code from known headers
    let country: string | null = null;
    for (const header of COUNTRY_HEADERS) {
      const val = c.req.header(header);
      if (val) {
        country = val.toUpperCase().trim();
        break;
      }
    }

    // If no country header found, pass through (can't enforce without data)
    if (!country) return next();

    const countries = new Set(geo.countries.map(c => c.toUpperCase()));

    if (geo.mode === 'allowlist') {
      if (!countries.has(country)) {
        return c.json(
          { error: 'Access restricted by geographic policy', code: 'GEO_BLOCKED', country },
          403,
        );
      }
    } else if (geo.mode === 'blocklist') {
      if (countries.has(country)) {
        return c.json(
          { error: 'Access restricted by geographic policy', code: 'GEO_BLOCKED', country },
          403,
        );
      }
    }

    return next();
  };
}
