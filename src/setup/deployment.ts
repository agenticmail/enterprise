/**
 * Setup Wizard — Step 3: Deployment Target
 *
 * Choose where the enterprise server will run.
 * Includes Cloudflare Tunnel as recommended self-hosted option —
 * handles install, login, tunnel creation, DNS, and PM2 in one flow.
 */

import { execSync, exec as execCb } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir, platform, arch } from 'os';

const execP = promisify(execCb);

export type DeployTarget = 'cloud' | 'cloudflare-tunnel' | 'fly' | 'railway' | 'docker' | 'local';

export interface DeploymentSelection {
  target: DeployTarget;
  /** Populated when target is 'cloudflare-tunnel' */
  tunnel?: {
    tunnelId: string;
    domain: string;
    port: number;
    tunnelName: string;
  };
}

export async function promptDeployment(
  inquirer: any,
  chalk: any,
): Promise<DeploymentSelection> {
  console.log('');
  console.log(chalk.bold.cyan('  Step 3 of 4: Deployment'));
  console.log(chalk.dim('  Where should your dashboard run?\n'));

  const { deployTarget } = await inquirer.prompt([{
    type: 'list',
    name: 'deployTarget',
    message: 'Deploy to:',
    choices: [
      {
        name: `AgenticMail Cloud  ${chalk.dim('(managed, instant URL)')}`,
        value: 'cloud',
      },
      {
        name: `Cloudflare Tunnel  ${chalk.green('← recommended')}  ${chalk.dim('(self-hosted, free, no ports)')}`,
        value: 'cloudflare-tunnel',
      },
      {
        name: `Fly.io  ${chalk.dim('(your account)')}`,
        value: 'fly',
      },
      {
        name: `Railway  ${chalk.dim('(your account)')}`,
        value: 'railway',
      },
      {
        name: `Docker  ${chalk.dim('(self-hosted)')}`,
        value: 'docker',
      },
      {
        name: `Local  ${chalk.dim('(dev/testing, runs here)')}`,
        value: 'local',
      },
    ],
  }]);

  if (deployTarget === 'cloudflare-tunnel') {
    const tunnel = await runTunnelSetup(inquirer, chalk);
    return { target: deployTarget, tunnel };
  }

  return { target: deployTarget };
}

// ─── Cloudflare Tunnel Interactive Setup ────────────

async function runTunnelSetup(
  inquirer: any,
  chalk: any,
): Promise<DeploymentSelection['tunnel']> {
  console.log('');
  console.log(chalk.bold('  Cloudflare Tunnel Setup'));
  console.log(chalk.dim('  Exposes your local server to the internet via Cloudflare.'));
  console.log(chalk.dim('  No open ports, free TLS, auto-DNS.\n'));

  // ── Step 1: Check / Install cloudflared ─────────
  console.log(chalk.bold('  1. Cloudflared CLI'));

  let installed = false;
  let version = '';
  try {
    version = execSync('cloudflared --version 2>&1', { encoding: 'utf8', timeout: 5000 }).trim();
    installed = true;
  } catch { /* not installed */ }

  if (installed) {
    console.log(chalk.green(`     ✓ Installed (${version})\n`));
  } else {
    console.log(chalk.yellow('     Not installed.'));
    const { doInstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'doInstall',
      message: 'Install cloudflared now?',
      default: true,
    }]);

    if (!doInstall) {
      console.log(chalk.red('\n  cloudflared is required for tunnel deployment.'));
      console.log(chalk.dim('  Install it manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n'));
      process.exit(1);
    }

    console.log(chalk.dim('     Installing...'));
    try {
      await installCloudflared();
      version = execSync('cloudflared --version 2>&1', { encoding: 'utf8', timeout: 5000 }).trim();
      console.log(chalk.green(`     ✓ Installed (${version})\n`));
    } catch (err: any) {
      console.log(chalk.red(`     ✗ Installation failed: ${err.message}`));
      console.log(chalk.dim('     Install manually and re-run setup.\n'));
      process.exit(1);
    }
  }

  // ── Step 2: Login to Cloudflare ─────────────────
  console.log(chalk.bold('  2. Cloudflare Authentication'));

  const cfDir = join(homedir(), '.cloudflared');
  const certPath = join(cfDir, 'cert.pem');
  const loggedIn = existsSync(certPath);

  if (loggedIn) {
    console.log(chalk.green('     ✓ Already authenticated\n'));
  } else {
    console.log(chalk.dim('     This will open your browser to authorize Cloudflare.\n'));
    const { doLogin } = await inquirer.prompt([{
      type: 'confirm',
      name: 'doLogin',
      message: 'Open browser to login to Cloudflare?',
      default: true,
    }]);

    if (!doLogin) {
      console.log(chalk.red('\n  Cloudflare auth is required. Run `cloudflared tunnel login` manually.\n'));
      process.exit(1);
    }

    console.log(chalk.dim('     Waiting for browser authorization...'));
    try {
      await execP('cloudflared tunnel login', { timeout: 120000 });
      console.log(chalk.green('     ✓ Authenticated\n'));
    } catch (err: any) {
      console.log(chalk.red(`     ✗ Login failed or timed out: ${err.message}`));
      console.log(chalk.dim('     Complete the browser authorization and try again.\n'));
      process.exit(1);
    }
  }

  // ── Step 3: Domain + Port ───────────────────────
  console.log(chalk.bold('  3. Tunnel Configuration'));

  const { domain, port, tunnelName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Domain (e.g. dashboard.yourcompany.com):',
      validate: (v: string) => v.includes('.') ? true : 'Enter a valid domain',
    },
    {
      type: 'number',
      name: 'port',
      message: 'Local port:',
      default: 3200,
    },
    {
      type: 'input',
      name: 'tunnelName',
      message: 'Tunnel name:',
      default: 'agenticmail-enterprise',
    },
  ]);

  // ── Step 4: Create tunnel + DNS + Start ─────────
  console.log('');
  console.log(chalk.bold('  4. Deploying'));

  // Create tunnel
  let tunnelId = '';
  try {
    console.log(chalk.dim('     Creating tunnel...'));
    const out = execSync(`cloudflared tunnel create ${tunnelName} 2>&1`, { encoding: 'utf8', timeout: 30000 });
    const match = out.match(/Created tunnel .+ with id ([a-f0-9-]+)/);
    tunnelId = match?.[1] || '';
    console.log(chalk.green(`     ✓ Tunnel created: ${tunnelName} (${tunnelId})`));
  } catch (e: any) {
    if (e.message?.includes('already exists') || e.stderr?.includes('already exists')) {
      try {
        const listOut = execSync('cloudflared tunnel list --output json 2>&1', { encoding: 'utf8', timeout: 15000 });
        const tunnels = JSON.parse(listOut);
        const existing = tunnels.find((t: any) => t.name === tunnelName);
        if (existing) {
          tunnelId = existing.id;
          console.log(chalk.green(`     ✓ Using existing tunnel: ${tunnelName} (${tunnelId})`));
        }
      } catch {
        console.log(chalk.red(`     ✗ Tunnel "${tunnelName}" exists but couldn't read its ID`));
        process.exit(1);
      }
    } else {
      console.log(chalk.red(`     ✗ Failed to create tunnel: ${e.message}`));
      process.exit(1);
    }
  }

  if (!tunnelId) {
    console.log(chalk.red('     ✗ Could not determine tunnel ID'));
    process.exit(1);
  }

  // Write config
  const config = [
    `tunnel: ${tunnelId}`,
    `credentials-file: ${join(cfDir, tunnelId + '.json')}`,
    '',
    'ingress:',
    `  - hostname: ${domain}`,
    `    service: http://localhost:${port}`,
    '  - service: http_status:404',
  ].join('\n');

  writeFileSync(join(cfDir, 'config.yml'), config);
  console.log(chalk.green(`     ✓ Config written: ${domain} → localhost:${port}`));

  // Route DNS
  try {
    execSync(`cloudflared tunnel route dns ${tunnelId} ${domain} 2>&1`, { encoding: 'utf8', timeout: 30000 });
    console.log(chalk.green(`     ✓ DNS CNAME created: ${domain}`));
  } catch (e: any) {
    if (e.message?.includes('already exists') || e.stderr?.includes('already exists')) {
      console.log(chalk.green(`     ✓ DNS CNAME already exists for ${domain}`));
    } else {
      console.log(chalk.yellow(`     ⚠ DNS routing failed — add CNAME manually: ${domain} → ${tunnelId}.cfargotunnel.com`));
    }
  }

  // Start with PM2
  let started = false;
  try {
    execSync('which pm2', { timeout: 3000 });
    try { execSync('pm2 delete cloudflared 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
    execSync(`pm2 start cloudflared --name cloudflared -- tunnel run`, { encoding: 'utf8', timeout: 15000 });
    try { execSync('pm2 save 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
    console.log(chalk.green('     ✓ Tunnel running via PM2 (auto-restarts on crash)'));
    started = true;
  } catch { /* PM2 not available */ }

  if (!started) {
    // Try npm install pm2 globally, then retry
    try {
      console.log(chalk.dim('     Installing PM2 for process management...'));
      execSync('npm install -g pm2', { timeout: 60000, stdio: 'pipe' });
      try { execSync('pm2 delete cloudflared 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
      execSync(`pm2 start cloudflared --name cloudflared -- tunnel run`, { encoding: 'utf8', timeout: 15000 });
      try { execSync('pm2 save 2>/dev/null', { timeout: 5000 }); } catch { /* ok */ }
      console.log(chalk.green('     ✓ PM2 installed + tunnel running (auto-restarts on crash)'));
      started = true;
    } catch {
      console.log(chalk.yellow('     ⚠ PM2 not available — tunnel started in background'));
      console.log(chalk.dim('       Install PM2 for auto-restart: npm install -g pm2'));
      try {
        const { spawn } = await import('child_process');
        const child = spawn('cloudflared', ['tunnel', 'run'], { detached: true, stdio: 'ignore' });
        child.unref();
        started = true;
      } catch { /* best effort */ }
    }
  }

  console.log('');
  console.log(chalk.green.bold(`  ✓ Tunnel deployed! Your dashboard will be at https://${domain}`));
  console.log('');

  return { tunnelId, domain, port, tunnelName };
}

// ─── Install cloudflared binary ─────────────────────

async function installCloudflared(): Promise<void> {
  const plat = platform();
  const a = arch();

  if (plat === 'darwin') {
    try {
      execSync('which brew', { timeout: 3000 });
      execSync('brew install cloudflared 2>&1', { encoding: 'utf8', timeout: 120000 });
      return;
    } catch { /* no brew, direct download */ }
    const cfArch = a === 'arm64' ? 'arm64' : 'amd64';
    execSync(
      `curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${cfArch} && chmod +x /usr/local/bin/cloudflared`,
      { timeout: 60000 },
    );
  } else if (plat === 'linux') {
    const cfArch = a === 'arm64' ? 'arm64' : 'amd64';
    execSync(
      `curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch} && chmod +x /usr/local/bin/cloudflared`,
      { timeout: 60000 },
    );
  } else {
    throw new Error('Unsupported platform: ' + plat);
  }
}
