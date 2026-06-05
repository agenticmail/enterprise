#!/usr/bin/env node
/**
 * ensure-pm2-startup.cjs — make sure PM2 resurrects on reboot.
 *
 * Why this exists
 * ────────────────────────────────────────────────────────────────
 * `pm2 startup` ships a launchd plist on macOS that has
 * historically had two bugs:
 *
 *   1. LaunchOnlyOnce=true — a deprecated key launchd interprets
 *      as "only ever run this ONCE in the lifetime of the plist."
 *      After the first execution, it never fires on subsequent
 *      boots. Reboots stop restoring processes.
 *
 *   2. The agent isn't always re-bootstrapped after a plist
 *      change. The user has the file but launchctl never loaded
 *      it (launchctl list shows nothing).
 *
 * This script writes a correct plist + bootstraps it cleanly +
 * runs `pm2 save` so the dump that resurrect reads is current.
 *
 * Idempotent — safe to run on every install / upgrade / manual
 * invocation. Best-effort — failures log a WARN and exit 0 so
 * npm install never aborts on a launchd hiccup.
 *
 * Platforms
 * ────────────────────────────────────────────────────────────────
 *   macOS  — full support (plist + launchctl)
 *   linux  — currently no-op with a hint to run `pm2 startup`
 *            manually. systemd unit generation is a TODO.
 *   win32  — no-op.
 *
 * CLI
 * ────────────────────────────────────────────────────────────────
 *   node scripts/ensure-pm2-startup.cjs            # apply + save
 *   node scripts/ensure-pm2-startup.cjs --check    # verify only
 *   node scripts/ensure-pm2-startup.cjs --quiet    # no output on OK
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync, spawnSync } = require('child_process');

const QUIET = process.argv.includes('--quiet');
const CHECK_ONLY = process.argv.includes('--check');

function log(msg)  { if (!QUIET) console.log('[pm2-startup] ' + msg); }
function warn(msg) { console.warn('[pm2-startup] ' + msg); }

function which(bin) {
  try {
    return execSync('command -v ' + bin, { encoding: 'utf8' }).trim();
  } catch { return null; }
}

function findPm2() {
  // Prefer the global homebrew install path because the launchd
  // plist needs an absolute path (no $PATH lookup at boot).
  const candidates = [
    '/opt/homebrew/lib/node_modules/pm2/bin/pm2',
    '/usr/local/lib/node_modules/pm2/bin/pm2',
    which('pm2'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Build the plist string. The PATH and PM2_HOME we capture from
 *  the current process so the agent's resurrect run sees the same
 *  toolchain the user does in their interactive shell. */
function buildPlist(user, pm2Bin) {
  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
  const pathEnv = process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
  const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.PM2</string>
    <key>UserName</key>
    <string>${xml(user)}</string>
    <!-- Fire once at boot/login. KeepAlive=false because pm2
         resurrect is a one-shot — PM2 itself manages the children
         after that. NO LaunchOnlyOnce (deprecated, breaks reboots). -->
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/sh</string>
      <string>-c</string>
      <string>${xml(pm2Bin)} resurrect</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${xml(pathEnv)}</string>
      <key>PM2_HOME</key>
      <string>${xml(pm2Home)}</string>
    </dict>
    <key>StandardErrorPath</key>
    <string>/tmp/com.PM2.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/com.PM2.out</string>
  </dict>
</plist>
`;
}

/** Return true if the plist on disk matches what we'd write today.
 *  Used by --check to bail without rewriting when nothing changed. */
function plistIsCurrent(plistPath, expected) {
  try {
    const actual = fs.readFileSync(plistPath, 'utf8');
    if (actual === expected) return true;
    // Tolerate trivial whitespace differences.
    return actual.replace(/\s+/g, '') === expected.replace(/\s+/g, '');
  } catch { return false; }
}

/** True when launchctl reports the com.PM2 agent loaded under
 *  this user's GUI session. */
function pm2AgentLoaded() {
  try {
    const out = execSync('launchctl list', { encoding: 'utf8' });
    return /\bcom\.PM2\b/.test(out);
  } catch { return false; }
}

function ensureMac() {
  const user = process.env.USER || os.userInfo().username;
  if (!user) {
    warn('Could not determine $USER — skipping launchd setup.');
    return;
  }
  const pm2Bin = findPm2();
  if (!pm2Bin) {
    warn('pm2 not found. Install with: npm i -g pm2');
    return;
  }
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `pm2.${user}.plist`);
  const desired = buildPlist(user, pm2Bin);

  const upToDate = plistIsCurrent(plistPath, desired);
  const loaded = pm2AgentLoaded();

  if (CHECK_ONLY) {
    if (upToDate && loaded) {
      log('OK — plist current, launchd agent loaded.');
      process.exit(0);
    }
    warn(`Needs fixup — plist current=${upToDate}, agent loaded=${loaded}.`);
    process.exit(2);
  }

  if (!upToDate) {
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, desired, 'utf8');
    log(`Wrote ${plistPath}`);
  } else {
    log(`Plist already current at ${plistPath}`);
  }

  // Re-bootstrap regardless — covers the case where the file is
  // right but launchd never loaded it. bootout is allowed to fail
  // (agent may not currently be loaded) — that's fine.
  const uid = os.userInfo().uid;
  const tryBootout = spawnSync('launchctl',
    ['bootout', `gui/${uid}`, plistPath],
    { stdio: 'ignore' });
  const tryBootstrap = spawnSync('launchctl',
    ['bootstrap', `gui/${uid}`, plistPath],
    { stdio: 'inherit' });
  if (tryBootstrap.status !== 0) {
    warn('launchctl bootstrap returned non-zero — agent may already '
      + 'be loaded under a different session. Verify with `launchctl list | grep PM2`.');
  }

  // Save current process list so resurrect has a fresh dump.
  try {
    execFileSync(pm2Bin, ['save'], { stdio: 'inherit' });
  } catch (ex) {
    warn(`pm2 save failed: ${ex.message}`);
  }

  log('Done. Verify: `launchctl list | grep PM2` should show com.PM2');
}

function ensureLinux() {
  if (CHECK_ONLY) return process.exit(0);
  warn('Linux: this script only knows macOS. Run `pm2 startup` and '
    + 'follow its instructions, then `pm2 save`.');
}

function main() {
  switch (process.platform) {
    case 'darwin':  return ensureMac();
    case 'linux':   return ensureLinux();
    default:
      if (CHECK_ONLY) return process.exit(0);
      warn(`Platform ${process.platform} not supported by this helper.`);
  }
}

try { main(); }
catch (ex) {
  warn(`Unexpected error: ${ex.message}`);
  // Postinstall context: never fail the install.
  process.exit(0);
}
