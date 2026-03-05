/**
 * PM2 Ecosystem Config — Production-grade process management
 *
 * Features:
 * - Exponential backoff on crash (prevents rapid restart loops)
 * - Max memory restart (prevents memory leaks)
 * - Graceful shutdown with kill timeout
 * - Log rotation via pm2-logrotate module
 * - Auto-start on boot via launchd (macOS) / systemd (Linux)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save   # persist for auto-start on reboot
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

const BASE_DIR = __dirname;

// Parse .env file into object
function loadEnv(filename) {
  const filepath = resolve(BASE_DIR, filename);
  try {
    const content = readFileSync(filepath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const envBase = loadEnv('.env');
const envFola = { ...envBase, ...loadEnv('.env.fola'), NODE_ENV: 'production', LOG_LEVEL: 'warn' };
const envJohn = { ...envBase, ...loadEnv('.env.john'), NODE_ENV: 'production', LOG_LEVEL: 'warn' };
const envEnterprise = { ...envBase, NODE_ENV: 'production', LOG_LEVEL: 'warn' };

// Shared restart policy
const RESTART_POLICY = {
  autorestart: true,
  max_restarts: 50,
  min_uptime: '10s',
  exp_backoff_restart_delay: 1500,
  kill_timeout: 10000,
  watch: false,
};

// Shared log config
function logConfig(name) {
  return {
    error_file: resolve(BASE_DIR, `logs/${name}-error.log`),
    out_file: resolve(BASE_DIR, `logs/${name}-out.log`),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  };
}

module.exports = {
  apps: [
    {
      name: 'enterprise',
      script: 'dist/cli.js',
      args: 'serve',
      cwd: BASE_DIR,
      node_args: '--max-old-space-size=512',
      env: envEnterprise,
      max_memory_restart: '512M',
      listen_timeout: 15000,
      ...RESTART_POLICY,
      ...logConfig('enterprise'),
    },
    {
      name: 'fola-agent',
      script: 'dist/cli.js',
      args: 'agent',
      cwd: BASE_DIR,
      node_args: '--max-old-space-size=384',
      env: envFola,
      max_memory_restart: '384M',
      ...RESTART_POLICY,
      ...logConfig('fola'),
    },
    {
      name: 'john-agent',
      script: 'dist/cli.js',
      args: 'agent',
      cwd: BASE_DIR,
      node_args: '--max-old-space-size=384',
      env: envJohn,
      max_memory_restart: '384M',
      ...RESTART_POLICY,
      ...logConfig('john'),
    },
    {
      name: 'cloudflared',
      script: 'cloudflared',
      args: 'tunnel run agenticmail',
      cwd: BASE_DIR,
      interpreter: 'none',
      max_memory_restart: '128M',
      ...RESTART_POLICY,
      max_restarts: 100,
      exp_backoff_restart_delay: 3000,
      ...logConfig('cloudflared'),
    },
  ],
};
