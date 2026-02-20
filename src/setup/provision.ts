/**
 * Setup Wizard — Provisioning
 *
 * Connects to the database, runs migrations, creates the admin account,
 * and deploys to the selected target. This is the "do the work" step
 * after all prompts are collected.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/adapter.js';
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
    await db.updateSettings({
      name: config.company.companyName,
      subdomain: config.company.subdomain,
      domain: config.domain.customDomain,
    });
    spinner.succeed('Company created');

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
    const admin = await db.createUser({
      email: config.company.adminEmail,
      name: 'Admin',
      role: 'owner',
      password: config.company.adminPassword,
    });
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

    // ─── Deploy ────────────────────────────────────
    const result = await deploy(config, db, jwtSecret, spinner, chalk);

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
  spinner: any,
  chalk: any,
): Promise<DeployResult> {
  const { deployTarget, company, database, domain } = config;

  // ── Cloud ─────────────────────────────────────────
  if (deployTarget === 'cloud') {
    spinner.start('Deploying to AgenticMail Cloud...');
    const { deployToCloud } = await import('../deploy/managed.js');
    const result = await deployToCloud({
      subdomain: company.subdomain,
      plan: 'free',
      dbType: database.type,
      dbConnectionString: database.connectionString || '',
      jwtSecret,
    });
    spinner.succeed(`Deployed to ${result.url}`);

    printCloudSuccess(chalk, result.url, company.adminEmail, domain.customDomain, company.subdomain);
    return { url: result.url };
  }

  // ── Docker ────────────────────────────────────────
  if (deployTarget === 'docker') {
    const { generateDockerCompose, generateEnvFile } = await import('../deploy/managed.js');
    const compose = generateDockerCompose({ port: 3000 });
    const envFile = generateEnvFile({
      dbType: database.type,
      dbConnectionString: database.connectionString || '',
      jwtSecret,
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
    console.log(`  2. ${chalk.cyan(`fly secrets set DATABASE_URL="${database.connectionString}" JWT_SECRET="${jwtSecret}"`)}`);
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
  console.log(`  ${chalk.bold('API:')}        ${chalk.cyan('http://localhost:3000/api')}`);
  console.log(`  ${chalk.bold('Admin:')}      ${company.adminEmail}`);
  console.log('');
  console.log(chalk.dim('  Press Ctrl+C to stop'));

  return { url: 'http://localhost:3000', close: handle.close };
}

// ─── Success Messages ───────────────────────────────

function printCloudSuccess(
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
