#!/usr/bin/env node

// Node.js version check — must be >=20. Auto-install if possible.
const _nodeMajor = parseInt(process.versions.node.split('.')[0]);
if (_nodeMajor < 20) {
  const { execSync, spawnSync } = require('child_process');
  const os = require('os');

  function _tryExec(cmd: string): string {
    try { return execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString().trim(); } catch { return ''; }
  }

  function _findNode20(): string | null {
    for (const p of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
      const ver = _tryExec(`${p} --version 2>/dev/null`);
      if (ver && parseInt(ver.replace('v', '')) >= 20) return p;
    }
    const nvmDir = `${os.homedir()}/.nvm/versions/node`;
    const dirs = _tryExec(`ls -d ${nvmDir}/v2[0-9]* ${nvmDir}/v3[0-9]* 2>/dev/null`);
    if (dirs) { const last = dirs.split('\n').pop(); if (last) return `${last}/bin/node`; }
    return null;
  }

  console.log(`\n  AgenticMail Enterprise requires Node.js 20+. You have ${process.version}.`);

  // Check if newer Node already exists somewhere
  const _existingNode = _findNode20();
  if (_existingNode) {
    console.log(`  Found Node 20+ at ${_existingNode}. Re-launching...\n`);
    const r = spawnSync(_existingNode, process.argv.slice(1), { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }

  // Try auto-install
  let _installed = false;
  if (os.platform() === 'darwin' && _tryExec('which brew')) {
    console.log('  Installing Node.js 22 via Homebrew (this may take a minute)...\n');
    try {
      execSync('brew install node@22', { stdio: 'inherit', timeout: 300000 });
      try { execSync('brew link --overwrite node@22', { stdio: 'pipe', timeout: 30000 }); } catch {}
      _installed = true;
    } catch {}
  } else if (os.platform() === 'linux' && _tryExec('which apt-get')) {
    console.log('  Installing Node.js 22 via apt (this may take a minute)...\n');
    try {
      execSync('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs', { stdio: 'inherit', timeout: 300000 });
      _installed = true;
    } catch {}
  } else if (os.platform() === 'linux' && _tryExec('which dnf')) {
    console.log('  Installing Node.js 22 via dnf (this may take a minute)...\n');
    try {
      execSync('curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs', { stdio: 'inherit', timeout: 300000 });
      _installed = true;
    } catch {}
  }

  if (_installed) {
    const newNode = _findNode20() || _tryExec('which node');
    const newVer = _tryExec(`${newNode} --version`);
    if (newNode && parseInt((newVer || '').replace('v', '')) >= 20) {
      console.log(`\n  Node.js ${newVer} installed! Re-launching...\n`);
      const r = spawnSync(newNode, process.argv.slice(1), { stdio: 'inherit' });
      process.exit(r.status ?? 1);
    }
  }

  console.error(`\n  Could not auto-install Node.js 20+. Please install manually:`);
  console.error(`    brew install node@22     # macOS (Homebrew)`);
  console.error(`    nvm install 22           # using nvm`);
  console.error(`    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -  # Linux\n`);
  process.exit(1);
}

/**
 * AgenticMail Enterprise CLI
 *
 * Commands:
 *   (none) / setup     Interactive setup wizard
 *   validate <path>    Validate a community skill manifest
 *   build-skill        AI-assisted skill scaffolding
 *   submit-skill       Submit a skill as a PR to agenticmail/enterprise
 *   recover            Recover a domain registration on a new machine
 *   verify-domain      Check DNS verification status for your domain
 *
 * Usage:
 *   npx @agenticmail/enterprise
 *   npx @agenticmail/enterprise validate ./community-skills/my-skill/
 *   npx @agenticmail/enterprise validate --all
 *   npx @agenticmail/enterprise build-skill
 *   npx @agenticmail/enterprise submit-skill ./community-skills/my-skill/
 *   npx @agenticmail/enterprise recover --domain agents.agenticmail.io
 *   npx @agenticmail/enterprise verify-domain
 */

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'validate':
    import('./engine/cli-validate.js').then(m => m.runValidate(args.slice(1))).catch(fatal);
    break;

  case 'build-skill':
    import('./engine/cli-build-skill.js').then(m => m.runBuildSkill(args.slice(1))).catch(fatal);
    break;

  case 'submit-skill':
    import('./engine/cli-submit-skill.js').then(m => m.runSubmitSkill(args.slice(1))).catch(fatal);
    break;

  case 'recover':
    import('./domain-lock/cli-recover.js').then(m => m.runRecover(args.slice(1))).catch(fatal);
    break;

  case 'verify-domain':
    import('./domain-lock/cli-verify.js').then(m => m.runVerifyDomain(args.slice(1))).catch(fatal);
    break;

  case 'reset-password':
    import('./cli-reset-password.js').then(m => m.runResetPassword(args.slice(1))).catch(fatal);
    break;

  case '--help':
  case '-h':
    console.log(`
AgenticMail Enterprise CLI

Commands:
  setup                   Interactive setup wizard (default)
  start / serve           Start the server (uses DATABASE_URL env)
  validate <path>         Validate a community skill manifest
    --all                 Validate all skills in community-skills/
    --json                Machine-readable output
  build-skill             AI-assisted skill scaffolding
  submit-skill <path>     Submit a skill as a PR
  recover                 Recover a domain/subdomain on a new machine
  reset-password          Reset admin password directly in the database
  verify-domain           Check DNS verification for your domain

Domain Recovery & Verification:
  npx @agenticmail/enterprise recover
  npx @agenticmail/enterprise recover --domain agents.acme.com --key <hex>
  npx @agenticmail/enterprise verify-domain
  npx @agenticmail/enterprise verify-domain --domain agents.acme.com --poll

  Set DATABASE_URL to auto-connect to your database during recovery.
  Both commands support interactive prompts when flags are omitted.

Skill Development:
  npx @agenticmail/enterprise validate ./community-skills/github-issues/
  npx @agenticmail/enterprise validate --all
  npx @agenticmail/enterprise build-skill
  npx @agenticmail/enterprise submit-skill ./community-skills/my-skill/
`);
    break;

  case 'serve':
  case 'start':
    import('./cli-serve.js').then(m => m.runServe(args.slice(1))).catch(fatal);
    break;

  case 'agent':
    import('./cli-agent.js').then(m => m.runAgent(args.slice(1))).catch(fatal);
    break;

  case 'setup':
  default:
    import('./setup/index.js').then(m => m.runSetupWizard()).catch(fatal);
    break;
}

function fatal(err: Error) {
  console.error('Fatal error:', err.message);
  process.exit(1);
}
