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

  const { createAdapter, smartDbConfig } = await import('./db/factory.js');
  const { createServer } = await import('./server.js');

  const db = await createAdapter(smartDbConfig(DATABASE_URL));

  await db.migrate();

  const server = createServer({
    port: PORT,
    db,
    jwtSecret: JWT_SECRET,
    corsOrigins: ['*'],
  });

  await server.start();
  console.log(`AgenticMail Enterprise server running on :${PORT}`);

  // Start prevent-sleep if configured
  try {
    const { startPreventSleep } = await import('./engine/screen-unlock.js');
    const adminDb = (server as any).getAdminDb?.() || (server as any).adminDb;
    if (adminDb) {
      const settings = await adminDb.getSettings?.().catch(() => null);
      const screenAccess = settings?.securityConfig?.screenAccess;
      if (screenAccess?.enabled && screenAccess?.preventSleep) {
        startPreventSleep();
        console.log('[startup] Prevent-sleep enabled — system will stay awake while agents are active');
      }
    }
  } catch {}

  // ─── Auto-configure system persistence ──────────────────
  // Ensures the server auto-starts on reboot, crash-recovers with backoff,
  // and log rotation is in place. Runs once — idempotent.
  try {
    await setupSystemPersistence();
  } catch (e: any) {
    console.warn('[startup] System persistence setup skipped: ' + e.message);
  }

  // Auto-start cloudflared if tunnel token is present
  const tunnelToken = process.env.CLOUDFLARED_TOKEN;
  if (tunnelToken) {
    try {
      const { execSync, spawn } = await import('child_process');
      try {
        execSync('which cloudflared', { timeout: 3000 });
      } catch {
        console.log('[startup] cloudflared not found — skipping tunnel auto-start');
        console.log('[startup] Install cloudflared to enable tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
        return;
      }

      // Check if already running
      try {
        execSync('pgrep -f "cloudflared.*tunnel.*run"', { timeout: 3000 });
        console.log('[startup] cloudflared tunnel already running');
        return;
      } catch { /* not running, start it */ }

      const subdomain = process.env.AGENTICMAIL_SUBDOMAIN || process.env.AGENTICMAIL_DOMAIN || '';
      console.log(`[startup] Starting cloudflared tunnel${subdomain ? ` for ${subdomain}.agenticmail.io` : ''}...`);

      const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', 'run', '--token', tunnelToken], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log('[startup] cloudflared tunnel started (pid ' + child.pid + ')');
    } catch (e: any) {
      console.warn('[startup] Could not auto-start cloudflared: ' + e.message);
    }
  }
}

// ─── System Persistence ─────────────────────────────────
// Automatically sets up PM2 startup, log rotation, and process saving.
// Idempotent — safe to run on every boot.

async function setupSystemPersistence(): Promise<void> {
  const { execSync, spawnSync } = await import('child_process');
  const { existsSync: exists, writeFileSync, mkdirSync } = await import('fs');
  const { join: pathJoin } = await import('path');
  const platform = process.platform;

  // Only works if running under PM2
  if (!process.env.PM2_HOME && !process.env.pm_id) {
    // Not running under PM2 — skip (user is running directly via node/npx)
    return;
  }

  const markerDir = pathJoin(homedir(), '.agenticmail');
  const markerFile = pathJoin(markerDir, '.persistence-configured');

  // Check if already configured (avoid running pm2 commands every boot)
  if (exists(markerFile)) {
    // Already configured — just save current process list silently
    try { execSync('pm2 save --silent', { timeout: 10000, stdio: 'ignore' }); } catch {}
    return;
  }

  console.log('[startup] Configuring system persistence (one-time setup)...');

  // 1. Set up PM2 startup — auto-start on boot
  // pm2 startup outputs the command needed (may require sudo on Linux)
  try {
    if (platform === 'darwin') {
      // macOS: launchd — pm2 startup creates plist and loads it
      const result = spawnSync('pm2', ['startup', 'launchd', '--silent'], {
        timeout: 15000, stdio: 'pipe', encoding: 'utf-8',
      });
      // If it outputs a sudo command, try running it
      const output = (result.stdout || '') + (result.stderr || '');
      const sudoMatch = output.match(/sudo\s+env\s+.*pm2\s+startup.*/);
      if (sudoMatch) {
        // Can't run sudo without password — log the command for the user
        console.log('[startup] PM2 startup requires sudo. Run this once:');
        console.log('  ' + sudoMatch[0]);
      } else {
        console.log('[startup] PM2 startup configured (launchd)');
      }
      // Try loading the plist if it exists
      const plistPath = pathJoin(homedir(), 'Library', 'LaunchAgents', `pm2.${process.env.USER || 'user'}.plist`);
      if (exists(plistPath)) {
        try { execSync(`launchctl load -w "${plistPath}"`, { timeout: 5000, stdio: 'ignore' }); } catch {}
      }
    } else if (platform === 'linux') {
      // Linux: systemd (Debian/Ubuntu/RHEL/Pi)
      const result = spawnSync('pm2', ['startup', 'systemd', '--silent'], {
        timeout: 15000, stdio: 'pipe', encoding: 'utf-8',
      });
      const output = (result.stdout || '') + (result.stderr || '');
      const sudoMatch = output.match(/sudo\s+env\s+.*pm2\s+startup.*/);
      if (sudoMatch) {
        // Try running it — if we have sudo access
        try {
          execSync(sudoMatch[0], { timeout: 15000, stdio: 'ignore' });
          console.log('[startup] PM2 startup configured (systemd)');
        } catch {
          console.log('[startup] PM2 startup requires root. Run this once:');
          console.log('  ' + sudoMatch[0]);
        }
      } else {
        console.log('[startup] PM2 startup configured (systemd)');
      }
    } else if (platform === 'win32') {
      // Windows: use pm2-windows-startup
      try {
        execSync('npm list -g pm2-windows-startup', { timeout: 10000, stdio: 'ignore' });
      } catch {
        console.log('[startup] Installing pm2-windows-startup...');
        try {
          execSync('npm install -g pm2-windows-startup', { timeout: 60000, stdio: 'ignore' });
          execSync('pm2-startup install', { timeout: 15000, stdio: 'ignore' });
          console.log('[startup] PM2 startup configured (Windows Service)');
        } catch (e: any) {
          console.warn('[startup] Could not install pm2-windows-startup: ' + e.message);
        }
      }
    }
  } catch (e: any) {
    console.warn('[startup] PM2 startup setup: ' + e.message);
  }

  // 2. Install log rotation (if not already present)
  try {
    const moduleList = execSync('pm2 ls --silent 2>/dev/null || true', { timeout: 10000, encoding: 'utf-8' });
    if (!moduleList.includes('pm2-logrotate')) {
      console.log('[startup] Installing pm2-logrotate...');
      execSync('pm2 install pm2-logrotate --silent', { timeout: 60000, stdio: 'ignore' });
      // Configure: 10MB max, keep 5 rotated files, compress
      execSync('pm2 set pm2-logrotate:max_size 10M --silent', { timeout: 5000, stdio: 'ignore' });
      execSync('pm2 set pm2-logrotate:retain 5 --silent', { timeout: 5000, stdio: 'ignore' });
      execSync('pm2 set pm2-logrotate:compress true --silent', { timeout: 5000, stdio: 'ignore' });
      console.log('[startup] Log rotation configured (10MB, 5 files)');
    }
  } catch {}

  // 3. Save current process list for resurrection on reboot
  try {
    execSync('pm2 save --silent', { timeout: 10000, stdio: 'ignore' });
    console.log('[startup] Process list saved');
  } catch {}

  // 4. Write marker file so we don't repeat this setup
  try {
    if (!exists(markerDir)) mkdirSync(markerDir, { recursive: true });
    writeFileSync(markerFile, new Date().toISOString() + '\n' + `platform=${platform}\n`, { mode: 0o600 });
    console.log('[startup] System persistence configured successfully');
  } catch {}
}
