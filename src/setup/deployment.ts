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

const SUBDOMAIN_REGISTRY_URL = process.env.AGENTICMAIL_SUBDOMAIN_REGISTRY_URL
  || 'https://subdomain-registry.agenticmail.io';

export interface DeploymentSelection {
  target: DeployTarget;
  /** Populated when target is 'cloudflare-tunnel' */
  tunnel?: {
    tunnelId: string;
    domain: string;
    port: number;
    tunnelName: string;
  };
  /** Populated when target is 'cloud' (agenticmail.io subdomain) */
  cloud?: {
    subdomain: string;
    fqdn: string;
    tunnelId: string;
    tunnelToken: string;
    port: number;
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

  if (deployTarget === 'cloud') {
    const cloud = await runCloudSetup(inquirer, chalk);
    return { target: deployTarget, cloud };
  }

  if (deployTarget === 'cloudflare-tunnel') {
    const tunnel = await runTunnelSetup(inquirer, chalk);
    return { target: deployTarget, tunnel };
  }

  return { target: deployTarget };
}

// ─── AgenticMail Cloud (Subdomain) Setup ────────────

async function runCloudSetup(
  inquirer: any,
  chalk: any,
): Promise<DeploymentSelection['cloud']> {
  console.log('');
  console.log(chalk.bold('  AgenticMail Cloud Setup'));
  console.log(chalk.dim('  Get a free subdomain on agenticmail.io — no Cloudflare account needed.'));
  console.log(chalk.dim('  Your instance will be live at https://yourname.agenticmail.io\n'));

  // ── Step 1: Choose subdomain ─────────

  let subdomain = '';
  let claimResult: any = null;

  while (!subdomain) {
    const { name } = await inquirer.prompt([{
      type: 'input',
      name: 'name',
      message: 'Choose your subdomain:',
      suffix: chalk.dim('.agenticmail.io'),
      validate: (input: string) => {
        const cleaned = input.toLowerCase().trim();
        if (cleaned.length < 3) return 'Must be at least 3 characters';
        if (cleaned.length > 32) return 'Must be 32 characters or fewer';
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(cleaned)) return 'Only lowercase letters, numbers, and hyphens allowed';
        return true;
      },
    }]);

    const cleaned = name.toLowerCase().trim();

    // Check availability
    process.stdout.write(chalk.dim(`  Checking ${cleaned}.agenticmail.io... `));
    try {
      const checkResp = await fetch(`${SUBDOMAIN_REGISTRY_URL}/check?name=${encodeURIComponent(cleaned)}`);
      const checkData = await checkResp.json() as any;

      if (!checkData.available) {
        console.log(chalk.red('✗ ' + (checkData.reason || 'Not available')));
        continue;
      }
      console.log(chalk.green('✓ Available!'));
    } catch (err: any) {
      console.log(chalk.yellow('⚠ Could not check availability: ' + err.message));
      console.log(chalk.dim('  Proceeding anyway — the claim step will verify.\n'));
    }

    // Confirm
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: `Claim ${chalk.bold(cleaned + '.agenticmail.io')}?`,
      default: true,
    }]);

    if (!confirmed) continue;

    // ── Step 2: Claim subdomain ─────────

    // Get or generate vault key hash for recovery
    const { createHash, randomUUID } = await import('crypto');
    let vaultKey = process.env.AGENTICMAIL_VAULT_KEY;
    if (!vaultKey) {
      vaultKey = randomUUID() + randomUUID();
      process.env.AGENTICMAIL_VAULT_KEY = vaultKey;
    }
    const vaultKeyHash = createHash('sha256').update(vaultKey).digest('hex');

    process.stdout.write(chalk.dim('  Provisioning subdomain... '));
    try {
      const claimResp = await fetch(`${SUBDOMAIN_REGISTRY_URL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleaned, vaultKeyHash }),
      });
      claimResult = await claimResp.json() as any;

      if (claimResult.error) {
        console.log(chalk.red('✗ ' + claimResult.error));

        // If they already have a subdomain, offer recovery
        if (claimResult.error.includes('already has subdomain')) {
          const { wantsRecover } = await inquirer.prompt([{
            type: 'confirm',
            name: 'wantsRecover',
            message: 'Recover your existing subdomain instead?',
            default: true,
          }]);
          if (wantsRecover) {
            const recoverResp = await fetch(`${SUBDOMAIN_REGISTRY_URL}/recover`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vaultKeyHash }),
            });
            claimResult = await recoverResp.json() as any;
            if (claimResult.success) {
              subdomain = claimResult.subdomain;
              console.log(chalk.green(`✓ Recovered: ${claimResult.fqdn}`));
            } else {
              console.log(chalk.red('✗ Recovery failed: ' + (claimResult.error || 'Unknown error')));
            }
          }
        }
        continue;
      }

      if (claimResult.success) {
        subdomain = claimResult.subdomain || cleaned;
        if (claimResult.recovered) {
          console.log(chalk.green('✓ Recovered existing subdomain'));
        } else {
          console.log(chalk.green('✓ Subdomain claimed!'));
        }
      }
    } catch (err: any) {
      console.log(chalk.red('✗ Failed: ' + err.message));
      console.log(chalk.dim('  Check your internet connection and try again.\n'));
    }
  }

  // ── Step 3: Install cloudflared ─────────

  console.log('');
  console.log(chalk.bold('  Installing cloudflared connector...'));

  let cloudflaredPath = '';
  try {
    cloudflaredPath = execSync('which cloudflared', { encoding: 'utf8' }).trim();
    console.log(chalk.green(`  ✓ cloudflared found at ${cloudflaredPath}`));
  } catch {
    console.log(chalk.dim('  cloudflared not found — installing...'));
    try {
      const os = platform();
      if (os === 'darwin') {
        execSync('brew install cloudflared', { stdio: 'pipe' });
      } else if (os === 'linux') {
        const archStr = arch() === 'arm64' ? 'arm64' : 'amd64';
        execSync(`curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${archStr} -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared`, { stdio: 'pipe' });
      } else {
        console.log(chalk.yellow('  Please install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'));
      }
      cloudflaredPath = execSync('which cloudflared', { encoding: 'utf8' }).trim();
      console.log(chalk.green(`  ✓ cloudflared installed at ${cloudflaredPath}`));
    } catch (e: any) {
      console.log(chalk.yellow('  ⚠ Could not auto-install cloudflared.'));
      console.log(chalk.dim('    Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'));
    }
  }

  // ── Step 4: Configure PM2 ─────────

  const port = 3100;
  const fqdn = claimResult?.fqdn || `${subdomain}.agenticmail.io`;
  const tunnelToken = claimResult?.tunnelToken;
  const tunnelId = claimResult?.tunnelId;

  console.log('');
  console.log(chalk.bold.green('  ✓ Setup Complete!'));
  console.log('');
  console.log(`  Your dashboard: ${chalk.bold.cyan('https://' + fqdn)}`);
  console.log('');
  console.log(chalk.dim('  To start your instance, run these two processes:'));
  console.log('');
  console.log(`    ${chalk.cyan('cloudflared tunnel --no-autoupdate run --token ' + (tunnelToken || '<your-tunnel-token>'))}`);
  console.log(`    ${chalk.cyan('npx @agenticmail/enterprise start')}`);
  console.log('');
  console.log(chalk.dim('  Or let the setup wizard start them with PM2 (next step).\n'));

  // Save tunnel token to .env
  const envPath = join(homedir(), '.agenticmail', '.env');
  try {
    let envContent = '';
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, 'utf8');
    }
    if (tunnelToken && !envContent.includes('CLOUDFLARED_TOKEN=')) {
      envContent += `\nCLOUDFLARED_TOKEN=${tunnelToken}\n`;
    }
    if (!envContent.includes('AGENTICMAIL_SUBDOMAIN=')) {
      envContent += `AGENTICMAIL_SUBDOMAIN=${subdomain}\n`;
    }
    if (!envContent.includes('AGENTICMAIL_DOMAIN=')) {
      envContent += `AGENTICMAIL_DOMAIN=${fqdn}\n`;
    }
    const { mkdirSync } = await import('fs');
    mkdirSync(join(homedir(), '.agenticmail'), { recursive: true });
    writeFileSync(envPath, envContent, { mode: 0o600 });
  } catch {}

  return {
    subdomain,
    fqdn,
    tunnelId: tunnelId || '',
    tunnelToken: tunnelToken || '',
    port,
  };
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
