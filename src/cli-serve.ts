/**
 * `npx @agenticmail/enterprise serve` / `start`
 *
 * Starts the enterprise server headlessly (no interactive wizard).
 * Auto-loads .env file from cwd or ~/.agenticmail/.env if present.
 * Reads configuration from environment variables:
 *   DATABASE_URL  — Postgres/SQLite connection string (required)
 *   JWT_SECRET    — JWT signing secret (required)
 *   PORT          — HTTP port (default: 8080)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function loadEnvFile(): void {
  // Try cwd first, then ~/.agenticmail/
  const candidates = [
    join(process.cwd(), '.env'),
    join(homedir(), '.agenticmail', '.env'),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        // Strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      console.log(`Loaded config from ${envPath}`);
      return;
    } catch { /* ignore */ }
  }
}

/**
 * If JWT_SECRET or AGENTICMAIL_VAULT_KEY are missing, generate them
 * and append to ~/.agenticmail/.env so they persist across restarts.
 */
async function ensureSecrets(): Promise<void> {
  const { randomUUID } = await import('crypto');
  const envDir = join(homedir(), '.agenticmail');
  const envPath = join(envDir, '.env');
  let dirty = false;

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    dirty = true;
    console.log('[startup] Generated new JWT_SECRET (existing sessions will need to re-login)');
  }

  if (!process.env.AGENTICMAIL_VAULT_KEY) {
    process.env.AGENTICMAIL_VAULT_KEY = randomUUID() + randomUUID();
    dirty = true;
    console.log('[startup] Generated new AGENTICMAIL_VAULT_KEY');
    console.log('[startup] ⚠️  Previously encrypted credentials will need to be re-entered in the dashboard');
  }

  if (dirty) {
    try {
      if (!existsSync(envDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(envDir, { recursive: true });
      }
      // Append new secrets to .env (don't overwrite existing)
      const { appendFileSync } = await import('fs');
      const lines: string[] = [];
      // Read existing to avoid duplicates
      let existing = '';
      if (existsSync(envPath)) {
        existing = readFileSync(envPath, 'utf8');
      }
      if (!existing.includes('JWT_SECRET=')) {
        lines.push(`JWT_SECRET=${process.env.JWT_SECRET}`);
      }
      if (!existing.includes('AGENTICMAIL_VAULT_KEY=')) {
        lines.push(`AGENTICMAIL_VAULT_KEY=${process.env.AGENTICMAIL_VAULT_KEY}`);
      }
      if (lines.length) {
        appendFileSync(envPath, '\n' + lines.join('\n') + '\n', { mode: 0o600 });
        console.log(`[startup] Saved secrets to ${envPath}`);
      }
    } catch (e: any) {
      console.warn(`[startup] Could not save secrets to ${envPath}: ${e.message}`);
    }
  }
}

export async function runServe(_args: string[]) {
  loadEnvFile();

  const DATABASE_URL = process.env.DATABASE_URL;
  const PORT = parseInt(process.env.PORT || '8080', 10);

  // Auto-generate and persist secrets if missing
  await ensureSecrets();

  const JWT_SECRET = process.env.JWT_SECRET!;
  const VAULT_KEY = process.env.AGENTICMAIL_VAULT_KEY!;

  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is required.');
    console.error('');
    console.error('Set it via environment variable or .env file:');
    console.error('  DATABASE_URL=postgresql://user:pass@host:5432/db npx @agenticmail/enterprise start');
    console.error('');
    console.error('Or create a .env file (in cwd or ~/.agenticmail/.env):');
    console.error('  DATABASE_URL=postgresql://user:pass@host:5432/db');
    console.error('  JWT_SECRET=your-secret-here');
    console.error('  PORT=3200');
    process.exit(1);
  }

  const { createAdapter } = await import('./db/factory.js');
  const { createServer } = await import('./server.js');

  const db = await createAdapter({
    type: DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite',
    connectionString: DATABASE_URL,
  });

  await db.migrate();

  const server = createServer({
    port: PORT,
    db,
    jwtSecret: JWT_SECRET,
    corsOrigins: ['*'],
  });

  await server.start();
  console.log(`AgenticMail Enterprise server running on :${PORT}`);
}
