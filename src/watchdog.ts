/**
 * AgenticMail Agent Watchdog — PM2-managed stuck/crashed-agent recovery.
 *
 * Runs as its own PM2 process (`agent-watchdog`). Every tick it inspects
 * every `*-agent` process PM2 knows about and recovers the two failure
 * modes PM2 cannot handle on its own:
 *
 *   1. CRASH LOOP ABANDONED — PM2 stops auto-restarting a process once it
 *      exceeds `max_restarts` within `min_uptime` and parks it in the
 *      `errored`/`stopped` state forever (this is what happened to
 *      halo-agent: 116 restarts → errored → dead). The watchdog issues a
 *      fresh `pm2 restart`, which resets the restart counter and brings
 *      it back online.
 *
 *   2. HUNG AGENT LOOP — the process is `online` and its HTTP /health
 *      still answers (event loop not fully blocked), but the agent loop
 *      is wedged inside a session (e.g. a tool call with no timeout).
 *      PM2 sees "online" and does nothing. The watchdog detects this two
 *      ways: (a) /health unreachable for N consecutive checks, or (b)
 *      /health reports `oldestSessionAgeMs` beyond a stuck threshold
 *      (a session open far longer than any normal agent turn).
 *
 * Deliberately depends on NOTHING but Node built-ins + the `pm2` CLI, so
 * it keeps working even when the enterprise package itself is broken.
 *
 * Config (env vars, all optional):
 *   WATCHDOG_INTERVAL_MS        check cadence            (default 60000)
 *   WATCHDOG_HEALTH_TIMEOUT_MS  per /health request      (default 5000)
 *   WATCHDOG_HEALTH_FAILS       consecutive fails→restart (default 3)
 *   WATCHDOG_STUCK_SESSION_MS   oldest-session age→restart(default 1200000 = 20m)
 *   WATCHDOG_NAME_PATTERN       regex of process names   (default "-agent$")
 *   WATCHDOG_MIN_RESTART_GAP_MS cooldown between restarts (default 120000)
 */

import { exec } from 'node:child_process';
import { request as httpRequest } from 'node:http';

const INTERVAL_MS = intEnv('WATCHDOG_INTERVAL_MS', 60_000);
const HEALTH_TIMEOUT_MS = intEnv('WATCHDOG_HEALTH_TIMEOUT_MS', 5_000);
const HEALTH_FAILS = intEnv('WATCHDOG_HEALTH_FAILS', 3);
const STUCK_SESSION_MS = intEnv('WATCHDOG_STUCK_SESSION_MS', 20 * 60_000);
const NAME_PATTERN = new RegExp(process.env.WATCHDOG_NAME_PATTERN || '-agent$');
const MIN_RESTART_GAP_MS = intEnv('WATCHDOG_MIN_RESTART_GAP_MS', 120_000);

function intEnv(name: string, def: number): number {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[watchdog ${new Date().toISOString()}] ${msg}`);
}

interface Pm2Proc {
  name: string;
  pm2_env: { status?: string; PORT?: string | number; env?: Record<string, string>; restart_time?: number };
}

function sh(cmd: string, timeoutMs = 30_000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), code: err ? ((err as any).code ?? 1) : 0 });
    });
  });
}

async function pm2List(): Promise<Pm2Proc[]> {
  const { stdout } = await sh('pm2 jlist');
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // pm2 sometimes prefixes jlist with a log line — grab the JSON array.
    const start = stdout.indexOf('[');
    if (start >= 0) {
      try { return JSON.parse(stdout.slice(start)); } catch { /* fall through */ }
    }
    return [];
  }
}

function portFor(proc: Pm2Proc): number | null {
  const raw = proc.pm2_env?.PORT ?? proc.pm2_env?.env?.PORT;
  const n = parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Health { ok: boolean; oldestSessionAgeMs?: number; activeSessions?: number }

function checkHealth(port: number): Promise<Health> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: '/health', method: 'GET', timeout: HEALTH_TIMEOUT_MS },
      (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          if (res.statusCode !== 200) { resolve({ ok: false }); return; }
          try {
            const j = JSON.parse(body);
            resolve({ ok: true, oldestSessionAgeMs: Number(j.oldestSessionAgeMs) || 0, activeSessions: Number(j.activeSessions) || 0 });
          } catch {
            resolve({ ok: true }); // answered 200 but unparseable — process is alive
          }
        });
      },
    );
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

const healthFailStreak = new Map<string, number>();
const lastRestartAt = new Map<string, number>();

async function restart(name: string, reason: string): Promise<void> {
  const now = Date.now();
  const last = lastRestartAt.get(name) || 0;
  if (now - last < MIN_RESTART_GAP_MS) {
    log(`SKIP restart ${name} (${reason}) — within cooldown (${Math.round((now - last) / 1000)}s ago)`);
    return;
  }
  lastRestartAt.set(name, now);
  healthFailStreak.set(name, 0);
  log(`RESTARTING ${name} — ${reason}`);
  const { code, stderr } = await sh(`pm2 restart ${name} --update-env`);
  if (code === 0) log(`✓ restarted ${name}`);
  else log(`✗ restart ${name} failed (code ${code}): ${stderr.split('\n')[0]}`);
}

async function tick(): Promise<void> {
  let procs: Pm2Proc[];
  try { procs = await pm2List(); } catch (e: any) { log(`pm2 jlist failed: ${e?.message || e}`); return; }

  const agents = procs.filter((p) => p?.name && NAME_PATTERN.test(p.name));
  if (agents.length === 0) { log('no matching agent processes found'); return; }

  for (const proc of agents) {
    const name = proc.name;
    const status = proc.pm2_env?.status || 'unknown';

    // (1) PM2 gave up on a crash loop → bring it back.
    if (status === 'errored' || status === 'stopped') {
      await restart(name, `pm2 status=${status} (crash loop abandoned)`);
      continue;
    }
    if (status !== 'online') {
      log(`${name}: status=${status} (waiting)`);
      continue;
    }

    // (2) online — probe the agent loop via /health.
    const port = portFor(proc);
    if (!port) { log(`${name}: online but no PORT in pm2 env — cannot health-check`); continue; }

    const health = await checkHealth(port);
    if (!health.ok) {
      const streak = (healthFailStreak.get(name) || 0) + 1;
      healthFailStreak.set(name, streak);
      log(`${name}: /health unreachable (${streak}/${HEALTH_FAILS})`);
      if (streak >= HEALTH_FAILS) await restart(name, `/health unreachable ${streak}x (process wedged)`);
      continue;
    }
    healthFailStreak.set(name, 0);

    // (2b) responsive, but a session open far longer than any normal turn = hung loop.
    if ((health.oldestSessionAgeMs || 0) > STUCK_SESSION_MS) {
      await restart(name, `session stuck ${Math.round((health.oldestSessionAgeMs || 0) / 60000)}min (> ${Math.round(STUCK_SESSION_MS / 60000)}min)`);
      continue;
    }
  }
}

async function main(): Promise<void> {
  log(`started — interval=${INTERVAL_MS}ms healthTimeout=${HEALTH_TIMEOUT_MS}ms healthFails=${HEALTH_FAILS} stuckSession=${STUCK_SESSION_MS}ms pattern=${NAME_PATTERN}`);
  // First tick after a short delay so a fresh boot settles.
  await new Promise((r) => setTimeout(r, 5_000));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await tick(); } catch (e: any) { log(`tick error: ${e?.message || e}`); }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => { log(`fatal: ${e?.message || e}`); process.exit(1); });
