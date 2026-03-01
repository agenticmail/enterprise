/**
 * AgenticMail Enterprise — Proxy Configuration Applicator
 *
 * Applies HTTP/HTTPS proxy settings from DB to process environment.
 * Hot-reloaded when network config changes via dashboard.
 */

import { onNetworkConfigChange, getNetworkConfigSync } from './network-config.js';
import type { FirewallConfig } from '../db/adapter.js';

let _applied = false;

function applyProxy(config: FirewallConfig): void {
  const proxy = config.proxy;

  if (!proxy) {
    // Clear proxy env vars if previously set by us
    if (_applied) {
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      delete process.env.NO_PROXY;
      delete process.env.http_proxy;
      delete process.env.https_proxy;
      delete process.env.no_proxy;
      _applied = false;
    }
    return;
  }

  if (proxy.httpProxy) {
    process.env.HTTP_PROXY = proxy.httpProxy;
    process.env.http_proxy = proxy.httpProxy;
    _applied = true;
  } else {
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
  }

  if (proxy.httpsProxy) {
    process.env.HTTPS_PROXY = proxy.httpsProxy;
    process.env.https_proxy = proxy.httpsProxy;
    _applied = true;
  } else {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
  }

  if (proxy.noProxy && proxy.noProxy.length > 0) {
    const noProxyStr = proxy.noProxy.join(',');
    process.env.NO_PROXY = noProxyStr;
    process.env.no_proxy = noProxyStr;
    _applied = true;
  } else {
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  }

  if (_applied) {
    console.log(`[${new Date().toISOString()}] Proxy config applied: HTTP=${proxy.httpProxy || 'none'} HTTPS=${proxy.httpsProxy || 'none'} NO_PROXY=${proxy.noProxy?.join(',') || 'none'}`);
  }
}

/** Initialize proxy config from current DB state and subscribe to changes. */
export function initProxyConfig(): void {
  // Apply current config
  const config = getNetworkConfigSync();
  applyProxy(config);

  // Subscribe to hot-reload
  onNetworkConfigChange(applyProxy);
}
