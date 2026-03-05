/**
 * Setup Wizard — Provisioning
 *
 * Connects to the database, runs migrations, creates the admin account,
 * and deploys to the selected target. This is the "do the work" step
 * after all prompts are collected.
 */

import { randomUUID, randomBytes } from 'crypto';
import type { DatabaseAdapter } from '../db/adapter.js';

/** Generate a unique 10-char org ID like "BKSID30HKS" */
function generateOrgId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[bytes[i] % chars.length];
  return id;
}
import type { CompanyInfo } from './company.js';
import type { DatabaseSelection } from './database.js';
import type { DeployTarget } from './deployment.js';
import type { DomainSelection } from './domain.js';
import type { RegistrationSelection } from './registration.js';

export interface ProvisionConfig {
  company: CompanyInfo;
  database: DatabaseSelection;
  deployTarget: DeployTarget;
  domain: DomainSelection;
  registration?: RegistrationSelection;
  tunnel?: {
    tunnelId: string;
    domain: string;
    port: number;
    tunnelName: string;
  };
  cloud?: {
    subdomain: string;
    fqdn: string;
    tunnelId: string;
    tunnelToken: string;
    port: number;
  };
}

export interface ProvisionResult {
  success: boolean;
  url?: string;
  error?: string;
  jwtSecret: string;
  db: DatabaseAdapter;
  serverClose?: () => void;
}

export async function provision(
  config: ProvisionConfig,
  ora: any,
  chalk: any,
): Promise<ProvisionResult> {
  const spinner = ora('Connecting to database...').start();
  const jwtSecret = randomUUID() + randomUUID();
  const vaultKey = randomUUID() + randomUUID();

  try {
    // ─── Database ──────────────────────────────────
    const { createAdapter } = await import('../db/factory.js');
    const db = await createAdapter({
      type: config.database.type,
      connectionString: config.database.connectionString,
      region: config.database.region,
      accessKeyId: config.database.accessKeyId,
      secretAccessKey: config.database.secretAccessKey,
      authToken: config.database.authToken,
    });
    spinner.text = 'Running migrations...';
    await db.migrate();
    spinner.succeed('Database ready');

    // ─── Engine (SQL backends only) ────────────────
    const engineDbInterface = db.getEngineDB();
    if (engineDbInterface) {
      spinner.start('Initializing engine...');
      const { EngineDatabase } = await import('../engine/db-adapter.js');
      const dialectMap: Record<string, string> = {
        sqlite: 'sqlite', postgres: 'postgres', supabase: 'postgres',
        neon: 'postgres', cockroachdb: 'postgres', mysql: 'mysql',
        planetscale: 'mysql', turso: 'turso',
      };
      const engineDialect = (dialectMap[db.getDialect()] || db.getDialect()) as any;
      const engineDb = new EngineDatabase(engineDbInterface, engineDialect);
      const migResult = await engineDb.migrate();
      spinner.succeed(`Engine ready (${migResult.applied} migrations applied)`);
    }

    // ─── Company Settings ──────────────────────────
    spinner.start('Creating company...');
    const orgId = generateOrgId();

    // Build CORS origins from deployment domain
    const corsOrigins: string[] = [];
    if (config.domain.customDomain) {
      corsOrigins.push(`https://${config.domain.customDomain}`);
    }
    if (config.company.subdomain) {
      corsOrigins.push(`https://${config.company.subdomain}.agenticmail.io`);
    }
    if (config.deployTarget === 'local') {
      corsOrigins.push('http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:8080');
    }

    await db.updateSettings({
      name: config.company.companyName,
      subdomain: config.company.subdomain,
      domain: config.domain.customDomain,
      orgId,
      ...(corsOrigins.length > 0 ? {
        firewallConfig: {
          network: { corsOrigins },
        },
      } : {}),
    } as any);
    spinner.succeed(`Company created (org: ${orgId})`);

    // ─── Domain Registration ─────────────────────────
    if (config.registration?.registered) {
      spinner.start('Saving domain registration...');
      await db.updateSettings({
        deploymentKeyHash: config.registration.deploymentKeyHash,
        domainRegistrationId: config.registration.registrationId,
        domainDnsChallenge: config.registration.dnsChallenge,
        domainRegisteredAt: new Date().toISOString(),
        domainStatus: config.registration.verificationStatus === 'verified' ? 'verified' : 'pending_dns',
        ...(config.registration.verificationStatus === 'verified'
          ? { domainVerifiedAt: new Date().toISOString() }
          : {}),
      } as any);
      spinner.succeed('Domain registration saved');
    }

    // ─── Admin Account ─────────────────────────────
    spinner.start('Creating admin account...');
    let admin: any;
    try {
      admin = await db.createUser({
        email: config.company.adminEmail,
        name: 'Admin',
        role: 'owner',
        password: config.company.adminPassword,
      });
    } catch (err: any) {
      // If the user already exists (re-install), look them up instead
      if (err.message?.includes('duplicate key') || err.message?.includes('UNIQUE constraint') || err.code === '23505') {
        admin = await db.getUserByEmail(config.company.adminEmail);
        if (!admin) throw err; // genuinely broken
        spinner.text = 'Admin account already exists, reusing...';
      } else {
        throw err;
      }
    }
    await db.logEvent({
      actor: admin.id,
      actorType: 'system',
      action: 'setup.complete',
      resource: `company:${config.company.subdomain}`,
      details: {
        dbType: config.database.type,
        deployTarget: config.deployTarget,
        companyName: config.company.companyName,
      },
    });
    spinner.succeed('Admin account created');

    // ─── Save .env for restart ─────────────────────
    try {
      const { writeFileSync, existsSync, mkdirSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');
      const envDir = join(homedir(), '.agenticmail');
      if (!existsSync(envDir)) mkdirSync(envDir, { recursive: true });
      const port = config.tunnel?.port
        || (config.deployTarget === 'local' ? 3000 : undefined)
        || (config.deployTarget === 'docker' ? 3000 : undefined)
        || 3200;
      // Read existing .env to preserve cloud/tunnel values
      let existingEnv = '';
      const envFilePath = join(envDir, '.env');
      if (existsSync(envFilePath)) {
        try { existingEnv = (await import('fs')).readFileSync(envFilePath, 'utf8'); } catch {}
      }

      // Build key=value map preserving existing keys we don't set here
      const envMap = new Map<string, string>();
      for (const line of existingEnv.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq > 0) envMap.set(t.slice(0, eq).trim(), t.slice(eq + 1).trim());
      }

      // Set/overwrite the keys from this setup step
      envMap.set('DATABASE_URL', config.database.connectionString || '');
      envMap.set('JWT_SECRET', jwtSecret);
      envMap.set('AGENTICMAIL_VAULT_KEY', vaultKey);
      envMap.set('PORT', String(port));

      // Cloud deployment values (from deployment.ts step)
      if (config.cloud?.tunnelToken) envMap.set('CLOUDFLARED_TOKEN', config.cloud.tunnelToken);
      if (config.cloud?.subdomain) envMap.set('AGENTICMAIL_SUBDOMAIN', config.cloud.subdomain);
      if (config.cloud?.fqdn) envMap.set('AGENTICMAIL_DOMAIN', config.cloud.fqdn);

      const envContent = [
        '# AgenticMail Enterprise — auto-generated by setup wizard',
        '# BACK UP THIS FILE! You need it to recover on a new machine.',
        ...Array.from(envMap.entries()).map(([k, v]) => `${k}=${v}`),
      ].join('\n') + '\n';
      writeFileSync(join(envDir, '.env'), envContent, { mode: 0o600 });
      spinner.succeed(`Config saved to ~/.agenticmail/.env`);
    } catch { /* non-critical */ }

    // ─── Deploy ────────────────────────────────────
    const result = await deploy(config, db, jwtSecret, vaultKey, spinner, chalk);

    return {
      success: true,
      url: result.url,
      jwtSecret,
      db,
      serverClose: result.close,
    };
  } catch (err: any) {
    spinner.fail(`Setup failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      jwtSecret,
      db: null as any,
    };
  }
}

// ─── Deploy to selected target ──────────────────────

interface DeployResult {
  url?: string;
  close?: () => void;
}

async function deploy(
  config: ProvisionConfig,
  db: DatabaseAdapter,
  jwtSecret: string,
  vaultKey: string,
  spinner: any,
  chalk: any,
): Promise<DeployResult> {
  const { deployTarget, company, database, domain, tunnel, cloud } = config;

  // ── Cloudflare Tunnel ─────────────────────────────
  if (deployTarget === 'cloudflare-tunnel' && tunnel) {
    spinner.start(`Starting local server on port ${tunnel.port}...`);
    const { createServer } = await import('../server.js');
    const server = createServer({ port: tunnel.port, db, jwtSecret });
    const handle = await server.start();
    spinner.succeed('Server running');

    console.log('');
    console.log(chalk.green.bold('  AgenticMail Enterprise is live!'));
    console.log('');
    console.log(`  ${chalk.bold('Public URL:')}  ${chalk.cyan('https://' + tunnel.domain)}`);
    console.log(`  ${chalk.bold('Local:')}       ${chalk.cyan('http://localhost:' + tunnel.port)}`);
    console.log(`  ${chalk.bold('Tunnel:')}      ${tunnel.tunnelName} (${tunnel.tunnelId})`);
    console.log(`  ${chalk.bold('Admin:')}       ${company.adminEmail}`);
    console.log('');
    console.log(chalk.dim('  Tunnel is managed by PM2 — auto-restarts on crash.'));
    console.log(chalk.dim('  Manage: pm2 status | pm2 logs cloudflared | pm2 restart cloudflared'));
    console.log(chalk.dim('  Press Ctrl+C to stop the server'));

    return { url: 'https://' + tunnel.domain, close: handle.close };
  }

  // ── Cloud (agenticmail.io subdomain) ───────────────
  if (deployTarget === 'cloud' && cloud) {
    spinner.start('Configuring agenticmail.io deployment...');

    // Ensure cloudflared is installed
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      execSync(`${whichCmd} cloudflared`, { stdio: 'pipe', timeout: 5000 });
    } catch {
      spinner.text = 'Installing cloudflared...';
      try {
        if (process.platform === 'win32') {
          try {
            execSync('winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements', { stdio: 'pipe', timeout: 120000 });
          } catch {
            const archStr = process.arch === 'arm64' ? 'arm64' : 'amd64';
            execSync(`powershell -Command "New-Item -ItemType Directory -Force -Path '$env:LOCALAPPDATA\\\\cloudflared' | Out-Null; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${archStr}.exe' -OutFile '$env:LOCALAPPDATA\\\\cloudflared\\\\cloudflared.exe'"`, { stdio: 'pipe', timeout: 120000 });
            process.env.PATH = `${process.env.LOCALAPPDATA}\\cloudflared;${process.env.PATH}`;
          }
        } else if (process.platform === 'darwin') {
          execSync('brew install cloudflared', { stdio: 'pipe', timeout: 120000 });
        } else {
          const archStr = process.arch === 'arm64' ? 'arm64' : 'amd64';
          execSync(`curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${archStr} && chmod +x /usr/local/bin/cloudflared`, { stdio: 'pipe', timeout: 120000 });
        }
      } catch { /* will show manual instructions later */ }
    }

    // Ensure PM2 is installed
    try {
      execSync('npm ls -g pm2 --depth=0', { stdio: 'pipe', timeout: 10000 });
    } catch {
      spinner.text = 'Installing PM2 process manager...';
      try {
        execSync('npm install -g pm2', { stdio: 'pipe', timeout: 60000 });
      } catch { /* will fall back to manual start */ }
    }

    // Start cloudflared + enterprise via PM2 CLI
    try {
      // Delete old processes if they exist
      try { execSync('pm2 delete cloudflared 2>&1', { stdio: 'pipe', timeout: 10000 }); } catch {}
      try { execSync('pm2 delete enterprise 2>&1', { stdio: 'pipe', timeout: 10000 }); } catch {}

      // Start cloudflared tunnel
      execSync(`pm2 start cloudflared --name cloudflared --interpreter none -- tunnel --no-autoupdate run --token ${cloud.tunnelToken}`, { stdio: 'pipe', timeout: 15000 });

      // Start enterprise server
      const envVars = [
        `PORT=${cloud.port || 8080}`,
        `DATABASE_URL=${database.connectionString || ''}`,
        `JWT_SECRET=${jwtSecret}`,
        `AGENTICMAIL_VAULT_KEY=${vaultKey}`,
        `AGENTICMAIL_DOMAIN=${cloud.fqdn}`,
      ].join(' ');
      const pm2Env = process.platform === 'win32'
        ? `--env PORT=${cloud.port || 8080}`
        : '';
      execSync(`pm2 start npx --name enterprise -- @agenticmail/enterprise start`, {
        stdio: 'pipe', timeout: 15000,
        env: {
          ...process.env,
          PORT: String(cloud.port || 8080),
          DATABASE_URL: database.connectionString || '',
          JWT_SECRET: jwtSecret,
          AGENTICMAIL_VAULT_KEY: vaultKey,
          AGENTICMAIL_DOMAIN: cloud.fqdn,
        },
      });

      // Save + startup
      try { execSync('pm2 save', { timeout: 10000, stdio: 'pipe' }); } catch {}
      try {
        const startupOut = execSync('pm2 startup 2>&1', { encoding: 'utf8', timeout: 15000 });
        const sudoMatch = startupOut.match(/sudo .+$/m);
        if (sudoMatch) try { execSync(sudoMatch[0], { timeout: 15000, stdio: 'pipe' }); } catch {}
      } catch {}

      spinner.succeed(`Live at https://${cloud.fqdn}`);
      console.log(chalk.dim('  PM2 will auto-restart on crash and survive reboots.'));
    } catch (e: any) {
      spinner.warn(`PM2 setup failed: ${e.message}`);
      console.log(`  Start manually:`);
      console.log(`    cloudflared tunnel --no-autoupdate run --token ${cloud.tunnelToken}`);
      console.log(`    npx @agenticmail/enterprise start`);
    }

    console.log('');
    console.log(chalk.bold.green('  ────────────────────────────────────'));
    console.log(chalk.bold.green('  Your dashboard is ready!'));
    console.log(chalk.bold.green('  ────────────────────────────────────'));
    console.log('');
    console.log(`  ${chalk.bold('URL:')}       ${chalk.cyan('https://' + cloud.fqdn)}`);
    console.log(`  ${chalk.bold('Email:')}     ${chalk.white(config.company.adminEmail)}`);
    console.log(`  ${chalk.bold('Password:')}  ${chalk.white(config.company.adminPassword)}`);
    console.log('');
    console.log(chalk.dim('  Open the URL above and sign in with these credentials.'));
    console.log(chalk.dim('  To recover on a new machine, keep your AGENTICMAIL_VAULT_KEY safe.'));
    console.log('');
    return { url: `https://${cloud.fqdn}` };
  }

  // ── Docker ────────────────────────────────────────
  if (deployTarget === 'docker') {
    const { generateDockerCompose, generateEnvFile } = await import('../deploy/managed.js');
    const compose = generateDockerCompose({ port: 3000 });
    const envFile = generateEnvFile({
      dbType: database.type,
      dbConnectionString: database.connectionString || '',
      jwtSecret,
      vaultKey,
    });
    const { writeFileSync, existsSync, appendFileSync } = await import('fs');
    writeFileSync('docker-compose.yml', compose);
    writeFileSync('.env', envFile);
    // Ensure .env is gitignored
    if (existsSync('.gitignore')) {
      const content = await import('fs').then(f => f.readFileSync('.gitignore', 'utf-8'));
      if (!content.includes('.env')) {
        appendFileSync('.gitignore', '\n# Secrets\n.env\n');
      }
    } else {
      writeFileSync('.gitignore', '# Secrets\n.env\nnode_modules/\n');
    }
    spinner.succeed('docker-compose.yml + .env generated');

    console.log('');
    console.log(chalk.green.bold('  Docker deployment ready!'));
    console.log('');
    console.log(`  Run:       ${chalk.cyan('docker compose up -d')}`);
    console.log(`  Dashboard: ${chalk.cyan('http://localhost:3000')}`);
    console.log('');
    console.log(`  ${chalk.bold('Login email:')}     ${chalk.white(config.company.adminEmail)}`);
    console.log(`  ${chalk.bold('Login password:')}  ${chalk.white(config.company.adminPassword)}`);
    console.log('');
    console.log(chalk.dim('  Secrets stored in .env — do not commit to git'));
    if (domain.customDomain) {
      printCustomDomainInstructions(chalk, domain.customDomain, 'docker');
    }
    return { url: 'http://localhost:3000' };
  }

  // ── Fly.io ────────────────────────────────────────
  if (deployTarget === 'fly') {
    const { generateFlyToml } = await import('../deploy/managed.js');
    const flyToml = generateFlyToml(`am-${company.subdomain}`, 'iad');
    const { writeFileSync } = await import('fs');
    writeFileSync('fly.toml', flyToml);
    spinner.succeed('fly.toml generated');

    console.log('');
    console.log(chalk.green.bold('  Fly.io deployment ready!'));
    console.log('');
    console.log(`  1. ${chalk.cyan('fly launch --copy-config')}`);
    console.log(`  2. ${chalk.cyan(`fly secrets set DATABASE_URL="${database.connectionString}" JWT_SECRET="${jwtSecret}" AGENTICMAIL_VAULT_KEY="${vaultKey}"`)}`);
    console.log(`  3. ${chalk.cyan('fly deploy')}`);
    if (domain.customDomain) {
      console.log(`  4. ${chalk.cyan(`fly certs add ${domain.customDomain}`)}`);
      printCustomDomainInstructions(chalk, domain.customDomain, 'fly', `am-${company.subdomain}.fly.dev`);
    }
    return {};
  }

  // ── Railway ───────────────────────────────────────
  if (deployTarget === 'railway') {
    const { generateRailwayConfig } = await import('../deploy/managed.js');
    const railwayConfig = generateRailwayConfig();
    const { writeFileSync } = await import('fs');
    writeFileSync('railway.toml', railwayConfig);
    spinner.succeed('railway.toml generated');

    console.log('');
    console.log(chalk.green.bold('  Railway deployment ready!'));
    console.log('');
    console.log(`  1. ${chalk.cyan('railway init')}`);
    console.log(`  2. ${chalk.cyan('railway link')}`);
    console.log(`  3. ${chalk.cyan('railway up')}`);
    if (domain.customDomain) {
      printCustomDomainInstructions(chalk, domain.customDomain, 'railway');
    }
    return {};
  }

  // ── Local ─────────────────────────────────────────
  spinner.start('Starting local server...');
  const { createServer } = await import('../server.js');
  const server = createServer({ port: 3000, db, jwtSecret });
  const handle = await server.start();
  spinner.succeed('Server running');

  console.log('');
  console.log(chalk.green.bold('  AgenticMail Enterprise is running!'));
  console.log('');
  console.log(`  ${chalk.bold('Dashboard:')}  ${chalk.cyan('http://localhost:3000')}`);
  console.log(`  ${chalk.bold('Email:')}      ${chalk.white(company.adminEmail)}`);
  console.log(`  ${chalk.bold('Password:')}   ${chalk.white(company.adminPassword)}`);
  console.log('');
  console.log(chalk.dim('  Press Ctrl+C to stop'));

  return { url: 'http://localhost:3000', close: handle.close };
}

// ─── Success Messages ───────────────────────────────

function _printCloudSuccess(
  chalk: any,
  url: string,
  adminEmail: string,
  customDomain?: string,
  subdomain?: string,
) {
  console.log('');
  console.log(chalk.green.bold('  Your dashboard is live!'));
  console.log('');
  console.log(`  ${chalk.bold('URL:')}      ${chalk.cyan(url)}`);
  console.log(`  ${chalk.bold('Admin:')}    ${adminEmail}`);
  console.log(`  ${chalk.bold('Password:')} (the one you just set)`);
  if (customDomain) {
    printCustomDomainInstructions(chalk, customDomain, 'cloud', `${subdomain}.agenticmail.io`);
  }
}

// ─── Custom Domain DNS Instructions ─────────────────

function printCustomDomainInstructions(
  chalk: any,
  domain: string,
  target: string,
  cnameTarget?: string,
) {
  console.log('');
  console.log(chalk.bold('  Custom Domain DNS Setup'));
  console.log(chalk.dim(`  Route ${chalk.white(domain)} to your deployment.\n`));

  if (target === 'cloud' && cnameTarget) {
    console.log(chalk.bold('  Add this DNS record at your domain registrar:'));
    console.log('');
    console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('CNAME')}`);
    console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(domain)}`);
    console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(cnameTarget)}`);
  } else if (target === 'fly' && cnameTarget) {
    console.log(chalk.bold('  Add this DNS record at your domain registrar:'));
    console.log('');
    console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('CNAME')}`);
    console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(domain)}`);
    console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(cnameTarget)}`);
    console.log('');
    console.log(chalk.dim('  Fly.io will automatically provision a TLS certificate.'));
  } else if (target === 'railway') {
    console.log(chalk.bold('  After deploying:'));
    console.log('');
    console.log(`  1. Open your Railway project dashboard`);
    console.log(`  2. Go to ${chalk.bold('Settings')} → ${chalk.bold('Domains')}`);
    console.log(`  3. Add ${chalk.cyan(domain)} as a custom domain`);
    console.log(`  4. Railway will show you a ${chalk.bold('CNAME')} target — add it at your DNS provider`);
  } else if (target === 'docker') {
    console.log(chalk.bold('  Configure your reverse proxy to route traffic:'));
    console.log('');
    console.log(`  ${chalk.bold('Domain:')}  ${chalk.cyan(domain)}`);
    console.log(`  ${chalk.bold('Target:')}  ${chalk.cyan('localhost:3000')}  ${chalk.dim('(or your Docker host IP)')}`);
    console.log('');
    console.log(chalk.dim('  Example with nginx:'));
    console.log(chalk.dim(''));
    console.log(chalk.dim('    server {'));
    console.log(chalk.dim(`      server_name ${domain};`));
    console.log(chalk.dim('      location / {'));
    console.log(chalk.dim('        proxy_pass http://localhost:3000;'));
    console.log(chalk.dim('        proxy_set_header Host $host;'));
    console.log(chalk.dim('        proxy_set_header X-Real-IP $remote_addr;'));
    console.log(chalk.dim('      }'));
    console.log(chalk.dim('    }'));
    console.log('');
    console.log(chalk.dim('  Then add a DNS A record pointing to your server IP,'));
    console.log(chalk.dim('  or a CNAME if you have an existing hostname.'));
  }

  console.log('');
  console.log(chalk.dim('  Note: This CNAME/A record routes traffic. A separate TXT record'));
  console.log(chalk.dim('  for domain verification was (or will be) configured in Step 5.'));
  console.log('');
}
