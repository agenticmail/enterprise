#!/usr/bin/env node

/**
 * AgenticMail Domain Registry — CLI
 *
 * Start the central domain registry server.
 *
 * Usage:
 *   node dist/registry/cli.js [options]
 *
 * Options:
 *   --port <number>         Port to listen on (default: 8080)
 *   --db <path>             SQLite database path (default: ./registry.db)
 *   --database-url <url>    Postgres connection URL (overrides --db)
 *   --rate-limit <n>        Requests per minute per IP (default: 20)
 *
 * Environment Variables:
 *   REGISTRY_DATABASE_URL   Postgres connection URL (fallback for --database-url)
 */

import { createRegistryServer } from './server.js';

const args = process.argv.slice(2);

function getFlag(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const port = parseInt(getFlag('--port', '8080'), 10);
const dbPath = getFlag('--db', './registry.db');
const rateLimitPerMinute = parseInt(getFlag('--rate-limit', '20'), 10);

// Postgres: --database-url flag > REGISTRY_DATABASE_URL env var > undefined (falls back to SQLite)
const databaseUrlFlag = getFlag('--database-url', '');
const databaseUrl = databaseUrlFlag || process.env.REGISTRY_DATABASE_URL || undefined;

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AgenticMail Domain Registry Server

Usage:
  node dist/registry/cli.js [options]

Options:
  --port <number>         Port to listen on (default: 8080)
  --db <path>             SQLite database path (default: ./registry.db)
  --database-url <url>    Postgres connection URL (overrides --db)
  --rate-limit <number>   Requests per minute per IP (default: 20)
  --help, -h              Show this help message

Environment Variables:
  REGISTRY_DATABASE_URL   Postgres connection URL (fallback for --database-url)
`);
  process.exit(0);
}

const server = createRegistryServer({ port, dbPath, databaseUrl, rateLimitPerMinute });
server.start().catch((err) => {
  console.error('Failed to start registry:', err);
  process.exit(1);
});
