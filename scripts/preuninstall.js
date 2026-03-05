#!/usr/bin/env node
/**
 * Pre-uninstall cleanup for @agenticmail/enterprise
 * Stops PM2 processes and removes LaunchAgent if present.
 * Does NOT delete user data (database, config files) — that's the user's responsibility.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 10000, ...opts }).toString().trim();
  } catch { return ''; }
}

function log(msg) { console.log(`[agenticmail-uninstall] ${msg}`); }

try {
  // 1. Stop PM2 processes
  const pm2List = run('pm2 jlist');
  if (pm2List) {
    try {
      const procs = JSON.parse(pm2List);
      const ours = procs.filter(p =>
        p.name === 'enterprise' ||
        (p.pm2_env && p.pm2_env.pm_exec_path && p.pm2_env.pm_exec_path.includes('agenticmail'))
      );
      for (const proc of ours) {
        log(`Stopping PM2 process: ${proc.name} (pid ${proc.pid})`);
        run(`pm2 delete ${proc.pm_id}`);
      }
      if (ours.length > 0) {
        run('pm2 save');
        log(`Stopped and removed ${ours.length} PM2 process(es)`);
      }
    } catch { /* pm2 not available or parse error */ }
  }

  // 2. Remove LaunchAgent (macOS auto-start)
  if (process.platform === 'darwin') {
    const plistDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistFiles = ['com.PM2.plist', 'com.agenticmail.plist', 'pm2.' + os.userInfo().username + '.plist'];
    for (const pf of plistFiles) {
      const plistPath = path.join(plistDir, pf);
      if (fs.existsSync(plistPath)) {
        run(`launchctl unload "${plistPath}"`);
        log(`Unloaded LaunchAgent: ${pf}`);
      }
    }
  }

  // 3. Remove systemd service (Linux auto-start)
  if (process.platform === 'linux') {
    const serviceFiles = [
      path.join(os.homedir(), '.config', 'systemd', 'user', 'agenticmail.service'),
      '/etc/systemd/system/agenticmail.service',
    ];
    for (const sf of serviceFiles) {
      if (fs.existsSync(sf)) {
        const name = path.basename(sf);
        run(`systemctl --user disable ${name} 2>/dev/null || systemctl disable ${name} 2>/dev/null`);
        run(`systemctl --user stop ${name} 2>/dev/null || systemctl stop ${name} 2>/dev/null`);
        log(`Disabled systemd service: ${name}`);
      }
    }
  }

  log('Cleanup complete. Your database and config files have been preserved.');
  log('To fully remove all data, delete your ~/.agenticmail/ directory and drop your database.');

} catch (e) {
  // Never block uninstall
  console.error('[agenticmail-uninstall] Warning: cleanup had errors:', e.message);
}
