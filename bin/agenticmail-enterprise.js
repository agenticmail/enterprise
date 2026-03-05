#!/usr/bin/env node
'use strict';

// Pure CJS — runs on ANY Node version, even ancient ones
var major = parseInt(process.versions.node.split('.')[0]);

if (major >= 20) {
  // Good — load the real CLI
  require('../dist/cli.js');
} else {
  // Need to upgrade Node first
  var execSync = require('child_process').execSync;
  var spawnSync = require('child_process').spawnSync;
  var os = require('os');
  var path = require('path');

  function tryExec(cmd) {
    try { return execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString().trim(); } catch(e) { return ''; }
  }

  function findNode20() {
    var paths = ['/opt/homebrew/bin/node', '/usr/local/bin/node'];
    for (var i = 0; i < paths.length; i++) {
      var ver = tryExec(paths[i] + ' --version 2>/dev/null');
      if (ver && parseInt(ver.replace('v', '')) >= 20) return paths[i];
    }
    // Check nvm
    var nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
    var dirs = tryExec('ls -d ' + nvmDir + '/v2[0-9]* ' + nvmDir + '/v3[0-9]* 2>/dev/null');
    if (dirs) { var last = dirs.split('\n').pop(); if (last) return path.join(last, 'bin', 'node'); }
    return null;
  }

  console.log('\n  AgenticMail Enterprise requires Node.js 20+. You have ' + process.version + '.');

  // Check if newer Node already exists
  var existing = findNode20();
  if (existing) {
    console.log('  Found Node 20+ at ' + existing + '. Re-launching...\n');
    var r = spawnSync(existing, [path.join(__dirname, '..', 'dist', 'cli.js')].concat(process.argv.slice(2)), { stdio: 'inherit' });
    process.exit(r.status || 0);
  }

  // Try auto-install
  var installed = false;
  var platform = os.platform();

  if (platform === 'darwin' && tryExec('which brew')) {
    console.log('  Installing Node.js 22 via Homebrew (this may take a minute)...\n');
    try {
      execSync('brew install node@22', { stdio: 'inherit', timeout: 300000 });
      try { execSync('brew link --overwrite node@22 2>&1', { stdio: 'pipe', timeout: 30000 }); } catch(e) {}
      installed = true;
    } catch(e) {}
  } else if (platform === 'linux' && tryExec('which apt-get')) {
    console.log('  Installing Node.js 22 via apt (this may take a minute)...\n');
    try {
      execSync('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs', { stdio: 'inherit', timeout: 300000 });
      installed = true;
    } catch(e) {}
  } else if (platform === 'linux' && tryExec('which dnf')) {
    console.log('  Installing Node.js 22 via dnf (this may take a minute)...\n');
    try {
      execSync('curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs', { stdio: 'inherit', timeout: 300000 });
      installed = true;
    } catch(e) {}
  }

  if (installed) {
    var newNode = findNode20() || tryExec('which node');
    var newVer = tryExec((newNode || 'node') + ' --version');
    if (newNode && parseInt((newVer || '').replace('v', '')) >= 20) {
      console.log('\n  Node.js ' + newVer + ' installed! Re-launching...\n');
      var r2 = spawnSync(newNode, [path.join(__dirname, '..', 'dist', 'cli.js')].concat(process.argv.slice(2)), { stdio: 'inherit' });
      process.exit(r2.status || 0);
    }
  }

  console.error('\n  Could not auto-install Node.js 20+. Please install manually:');
  console.error('    brew install node@22     # macOS (Homebrew)');
  console.error('    nvm install 22           # using nvm');
  console.error('    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -  # Linux\n');
  process.exit(1);
}
