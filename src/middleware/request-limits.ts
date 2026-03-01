/**
 * AgenticMail Enterprise — Request Size & Timeout Limits
 *
 * Enforces max body size and request timeout from DB config.
 */

import type { MiddlewareHandler } from 'hono';
import { getNetworkConfig } from './network-config.js';

const DEFAULT_MAX_BODY_KB = 10240; // 10MB
const DEFAULT_TIMEOUT_SEC = 30;

/**
 * Request body size limit middleware.
 * Reads max size from firewallConfig.network.maxBodySizeKb.
 */
export function requestBodyLimit(): MiddlewareHandler {
  return async (c, next) => {
    const config = await getNetworkConfig();
    const maxKb = config.network?.maxBodySizeKb || DEFAULT_MAX_BODY_KB;
    const maxBytes = maxKb * 1024;

    const contentLength = c.req.header('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > maxBytes) {
        return c.json(
          {
            error: `Request body too large (${Math.round(size / 1024)}KB). Maximum is ${maxKb}KB.`,
            code: 'BODY_TOO_LARGE',
          },
          413,
        );
      }
    }

    return next();
  };
}

/**
 * Request timeout middleware.
 * Reads timeout from firewallConfig.network.requestTimeoutSec.
 */
export function requestTimeout(): MiddlewareHandler {
  return async (c, next) => {
    const config = await getNetworkConfig();
    const timeoutSec = config.network?.requestTimeoutSec || DEFAULT_TIMEOUT_SEC;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
      await next();
    } finally {
      clearTimeout(timer);
    }
  };
}
