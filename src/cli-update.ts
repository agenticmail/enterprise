/**
 * AgenticMail Enterprise — Self-Update System
 * 
 * Features:
 *   1. CLI: `agenticmail-enterprise update` — manual update
 *   2. Auto-check on server startup (background, non-blocking)
 *   3. API endpoint for dashboard one-click update
 *   4. Cron setup helper: `agenticmail-enterprise update --cron`
 */

import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const PKG_NAME = '@agenticmail/enterprise';

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  checkedAt: string;
  releaseNotes?: string;
  releaseUrl?: string;
}

// ─── Version Check ──────────────────────────────────────

export function getCurrentVersion(): string {
  try {
    // Try to read from our own package.json
    const pkgPath = join(import.meta.dirname || __dirname, '..', 'package.json');
    if (existsSync(pkgPath)) {
      return JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
    }
  } catch {}
  try {
    // Fallback: npm ls
    const out = execSync(`npm ls -g ${PKG_NAME} --json 2>/dev/null`, { encoding: 'utf-8', timeout: 10_000 });
    const data = JSON.parse(out);
    return data.dependencies?.[PKG_NAME]?.version || 'unknown';
  } catch {}
  return 'unknown';
}

export async function getLatestVersion(): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    return data.version;
  } catch {
    // Fallback to npm view
    try {
      return execSync(`npm view ${PKG_NAME} version 2>/dev/null`, { encoding: 'utf-8', timeout: 10_000 }).trim();
    } catch {}
  }
  return 'unknown';
}

export async function checkForUpdate(): Promise<VersionInfo> {
  const current = getCurrentVersion();
  const latest = await getLatestVersion();
  const updateAvailable = latest !== 'unknown' && current !== 'unknown' && latest !== current;
  
  // Fetch release notes from GitHub if update available
  let releaseNotes: string | undefined;
  let releaseUrl: string | undefined;
  if (updateAvailable) {
    try {
      const ghRes = await fetch(`https://api.github.com/repos/agenticmail/enterprise/releases/tags/v${latest}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgenticMail-Enterprise' },
        signal: AbortSignal.timeout(5_000),
      });
      if (ghRes.ok) {
        const gh = await ghRes.json() as any;
        releaseNotes = gh.body || undefined;
        releaseUrl = gh.html_url || undefined;
      }
    } catch {}
  }

  const info: VersionInfo = {
    current,
    latest,
    updateAvailable,
    checkedAt: new Date().toISOString(),
    releaseNotes,
    releaseUrl,
  };

  // Cache the check result
  try {
    const cacheDir = join(homedir(), '.agenticmail');
    const cachePath = join(cacheDir, 'update-check.json');
    writeFileSync(cachePath, JSON.stringify(info, null, 2));
  } catch {}

  return info;
}

export function getCachedUpdateCheck(): VersionInfo | null {
  try {
    const cachePath = join(homedir(), '.agenticmail', 'update-check.json');
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'));
    }
  } catch {}
  return null;
}

// ─── Perform Update ─────────────────────────────────────

export async function performUpdate(options?: { restart?: boolean }): Promise<{ success: boolean; from: string; to: string; message: string }> {
  const current = getCurrentVersion();
  
  console.log(`\n  🎀 AgenticMail Enterprise Update\n`);
  console.log(`  Current version: ${current}`);
  
  const latest = await getLatestVersion();
  console.log(`  Latest version:  ${latest}`);
  
  if (latest === current) {
    console.log(`\n  ✅ Already up to date!\n`);
    return { success: true, from: current, to: current, message: 'Already up to date' };
  }

  if (latest === 'unknown') {
    console.log(`\n  ❌ Could not determine latest version\n`);
    return { success: false, from: current, to: 'unknown', message: 'Could not determine latest version' };
  }

  console.log(`\n  📦 Installing ${PKG_NAME}@${latest}...`);
  
  try {
    execSync(`npm install -g ${PKG_NAME}@${latest}`, { 
      stdio: 'inherit', 
      timeout: 120_000,
    });
  } catch (err: any) {
    console.error(`\n  ❌ Update failed: ${err.message}\n`);
    return { success: false, from: current, to: latest, message: `npm install failed: ${err.message}` };
  }

  const newVersion = getCurrentVersion();
  console.log(`\n  ✅ Updated to v${newVersion}`);

  // Restart PM2 processes if requested
  if (options?.restart !== false) {
    console.log(`  🔄 Restarting services...`);
    try {
      // Find all agenticmail PM2 processes
      const jlist = execSync('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf-8', timeout: 10_000 });
      const procs = JSON.parse(jlist);
      const amProcs = procs.filter((p: any) => {
        const script = p.pm2_env?.pm_exec_path || '';
        return script.includes('agenticmail') || script.includes('enterprise');
      });

      if (amProcs.length > 0) {
        // Restart agents first, enterprise last (since restarting enterprise kills this process)
        const sorted = amProcs.sort((a: any, b: any) => {
          const aIsServer = a.name === 'enterprise' || a.name === 'agenticmail';
          const bIsServer = b.name === 'enterprise' || b.name === 'agenticmail';
          return aIsServer ? 1 : bIsServer ? -1 : 0;
        });
        for (const proc of sorted) {
          console.log(`  Restarting: ${proc.name}`);
          try { execSync(`pm2 restart ${proc.name}`, { stdio: 'inherit', timeout: 15_000 }); } catch {}
        }
        try { execSync('pm2 save', { stdio: 'ignore', timeout: 10_000 }); } catch {}
        console.log(`  ✅ All services restarted`);
      } else {
        console.log(`  ⚠️  No PM2 processes found — restart manually if needed`);
      }
    } catch (err: any) {
      console.log(`  ⚠️  Could not restart PM2: ${err.message}`);
      console.log(`  Run manually: pm2 restart enterprise && pm2 save`);
    }
  }

  console.log('');
  return { success: true, from: current, to: newVersion, message: `Updated from ${current} to ${newVersion}` };
}

// ─── Auto-Update Cron Setup ────────────────────────────

export function setupAutoUpdateCron(): void {
  console.log(`\n  🎀 Auto-Update Cron Setup\n`);

  const isWindows = platform() === 'win32';

  if (isWindows) {
    // Windows Task Scheduler
    const taskName = 'AgenticMailEnterprise-AutoUpdate';
    const cmd = `npm install -g ${PKG_NAME}@latest && pm2 restart enterprise && pm2 save`;
    
    console.log(`  Creating Windows Task Scheduler entry...`);
    console.log(`  Task: ${taskName}`);
    console.log(`  Schedule: Every 6 hours\n`);
    
    try {
      execSync(
        `schtasks /create /tn "${taskName}" /tr "cmd /c ${cmd}" /sc HOURLY /mo 6 /f`,
        { stdio: 'inherit' }
      );
      console.log(`  ✅ Auto-update scheduled!`);
      console.log(`  To remove: schtasks /delete /tn "${taskName}" /f\n`);
    } catch (err: any) {
      console.error(`  ❌ Failed: ${err.message}`);
      console.log(`  Manual alternative:`);
      console.log(`  schtasks /create /tn "${taskName}" /tr "cmd /c ${cmd}" /sc HOURLY /mo 6\n`);
    }
  } else {
    // Unix cron
    const npmPath = execSync('which npm', { encoding: 'utf-8' }).trim();
    const pm2Path = execSync('which pm2 2>/dev/null || echo pm2', { encoding: 'utf-8' }).trim();
    const cronLine = `0 */6 * * * ${npmPath} install -g ${PKG_NAME}@latest && ${pm2Path} restart enterprise && ${pm2Path} save 2>/dev/null`;
    const cronTag = '# agenticmail-auto-update';
    
    console.log(`  Adding cron job (every 6 hours):\n`);
    console.log(`  ${cronLine}\n`);

    try {
      // Check if already installed
      const existing = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
      if (existing.includes(cronTag)) {
        console.log(`  ⚠️  Auto-update cron already installed. Replacing...`);
        const filtered = existing.split('\n').filter(l => !l.includes(cronTag) && !l.includes('agenticmail')).join('\n');
        const newCron = `${filtered.trimEnd()}\n${cronLine} ${cronTag}\n`;
        execSync(`echo "${newCron}" | crontab -`, { timeout: 5000 });
      } else {
        const newCron = `${existing.trimEnd()}\n${cronLine} ${cronTag}\n`;
        execSync(`echo "${newCron}" | crontab -`, { timeout: 5000 });
      }
      console.log(`  ✅ Auto-update cron installed!`);
      console.log(`  To remove: crontab -e and delete the agenticmail line\n`);
    } catch (err: any) {
      console.error(`  ❌ Failed to install cron: ${err.message}`);
      console.log(`  Manual alternative:`);
      console.log(`  crontab -e`);
      console.log(`  Add: ${cronLine}\n`);
    }
  }
}

// ─── Background Startup Check ──────────────────────────

export function startBackgroundUpdateCheck(): void {
  // Non-blocking background check — runs 30s after startup
  setTimeout(async () => {
    try {
      const info = await checkForUpdate();
      if (info.updateAvailable) {
        console.log(`[update] 🎀 New version available: v${info.latest} (current: v${info.current})`);
        console.log(`[update] Run: agenticmail-enterprise update`);
      }
    } catch {}
  }, 30_000);

  // Then check every 6 hours
  setInterval(async () => {
    try {
      const info = await checkForUpdate();
      if (info.updateAvailable) {
        console.log(`[update] 🎀 New version available: v${info.latest} (current: v${info.current})`);
      }
    } catch {}
  }, 6 * 60 * 60_000);
}

// ─── CLI Entry ──────────────────────────────────────────

export async function runUpdate(args: string[]): Promise<void> {
  if (args.includes('--cron')) {
    setupAutoUpdateCron();
    return;
  }

  if (args.includes('--check')) {
    const info = await checkForUpdate();
    if (info.updateAvailable) {
      console.log(`\n  🎀 Update available: v${info.current} → v${info.latest}`);
      console.log(`  Run: agenticmail-enterprise update\n`);
    } else {
      console.log(`\n  ✅ Up to date (v${info.current})\n`);
    }
    return;
  }

  const noRestart = args.includes('--no-restart');
  await performUpdate({ restart: !noRestart });
}
