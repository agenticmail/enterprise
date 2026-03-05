/**
 * Setup Wizard — Orchestrator
 *
 * Runs the 5-step interactive setup wizard by composing
 * the individual step modules. Each step is in its own file
 * so the wizard logic stays manageable.
 *
 * Steps:
 *   1. Company Info       (setup/company.ts)
 *   2. Database           (setup/database.ts)
 *   3. Deployment         (setup/deployment.ts)
 *   4. Custom Domain      (setup/domain.ts)
 *   5. Domain Registration (setup/registration.ts)
 *   → Provision           (setup/provision.ts)
 */

import { execSync } from 'child_process';
import { createRequire } from 'module';
import { join } from 'path';
import { promptCompanyInfo } from './company.js';
import { promptDatabase } from './database.js';
import { promptDeployment } from './deployment.js';
import { promptDomain } from './domain.js';
import { promptRegistration } from './registration.js';
import { provision } from './provision.js';

export { promptCompanyInfo } from './company.js';
export { promptDatabase } from './database.js';
export { promptDeployment } from './deployment.js';
export { promptDomain } from './domain.js';
export { promptRegistration } from './registration.js';
export { provision } from './provision.js';
export type { CompanyInfo } from './company.js';
export type { DatabaseSelection } from './database.js';
export type { DeployTarget, DeploymentSelection } from './deployment.js';
export type { DomainSelection } from './domain.js';
export type { RegistrationSelection } from './registration.js';
export type { ProvisionConfig, ProvisionResult } from './provision.js';

// ─── DB Driver Requirements ──────────────────────

const DB_DRIVER_MAP: Record<string, string[]> = {
  postgres:    ['pg'],
  supabase:    ['pg'],
  neon:        ['pg'],
  cockroachdb: ['pg'],
  mysql:       ['mysql2'],
  planetscale: ['mysql2'],
  mongodb:     ['mongodb'],
  sqlite:      ['better-sqlite3'],
  turso:       ['@libsql/client'],
  dynamodb:    ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
};

async function ensureDbDriver(dbType: string, ora: any, chalk: any): Promise<void> {
  const packages = DB_DRIVER_MAP[dbType];
  if (!packages?.length) return;

  // Check if any packages are missing
  const missing: string[] = [];
  for (const pkg of packages) {
    let found = false;
    // Try ESM import
    try { await import(pkg); found = true; } catch {}
    // Try CJS require from cwd
    if (!found) {
      try {
        const req = createRequire(join(process.cwd(), 'index.js'));
        req.resolve(pkg);
        found = true;
      } catch {}
    }
    // Try CJS require from global
    if (!found) {
      try {
        const globalPrefix = execSync('npm prefix -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        const req = createRequire(join(globalPrefix, 'lib', 'node_modules', '.package-lock.json'));
        req.resolve(pkg);
        found = true;
      } catch {}
    }
    if (!found) missing.push(pkg);
  }
  if (!missing.length) return;

  const spinner = ora(`Installing database driver: ${missing.join(', ')}...`).start();
  try {
    // Install in cwd so createRequire(cwd) can find it
    execSync(`npm install --no-save ${missing.join(' ')}`, {
      stdio: 'pipe',
      timeout: 120_000,
      cwd: process.cwd(),
    });
    spinner.succeed(`Database driver installed: ${missing.join(', ')}`);
  } catch (err: any) {
    spinner.fail(`Failed to install ${missing.join(', ')}`);
    console.error(chalk.red(`\n  Run manually: npm install ${missing.join(' ')}\n`));
    process.exit(1);
  }
}

/**
 * Run the full interactive setup wizard.
 * Returns when provisioning is complete (or the local server is running).
 */
export async function runSetupWizard(): Promise<void> {
  // Dynamic imports — these are optional CLI deps
  const { default: inquirer } = await import('inquirer');
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  // ─── Banner ──────────────────────────────────────
  console.log('');
  console.log(chalk.cyan('       ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('       ║') + chalk.bold.white('   🎀  AgenticMail Enterprise  🎀          ') + chalk.cyan('║'));
  console.log(chalk.cyan('       ╚══════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.bold.white('  The AI Agent Operating System for Organizations'));
  console.log('');
  console.log(chalk.dim('  You are about to set up a complete enterprise platform for'));
  console.log(chalk.dim('  deploying, managing, and securing AI agents at scale.'));
  console.log('');
  console.log(`  ${chalk.cyan('●')} ${chalk.white('AI agents with real email identities & inboxes')}`);
  console.log(`  ${chalk.cyan('●')} ${chalk.white('Full dashboard — workforce, security, compliance')}`);
  console.log(`  ${chalk.cyan('●')} ${chalk.white('Google & Microsoft 365 integration')}`);
  console.log(`  ${chalk.cyan('●')} ${chalk.white('Telegram, WhatsApp, Slack & Discord channels')}`);
  console.log(`  ${chalk.cyan('●')} ${chalk.white('DLP, guardrails, vault & audit logging')}`);
  console.log(`  ${chalk.cyan('●')} ${chalk.white('Voice agents — join Google Meet calls')}`);
  console.log(`  ${chalk.cyan('●')} ${chalk.white('Multi-tenant with client org isolation')}`);
  console.log('');
  console.log(chalk.dim('  ──────────────────────────────────────────────'));
  console.log('');

  // ─── Step 1: Company ─────────────────────────────
  const company = await promptCompanyInfo(inquirer, chalk);

  // ─── Step 2: Database ────────────────────────────
  const database = await promptDatabase(inquirer, chalk);

  // ─── Step 3: Deployment ──────────────────────────
  const deploymentResult = await promptDeployment(inquirer, chalk, company.subdomain);
  const deployTarget = deploymentResult.target;

  // ─── Step 4: Custom Domain ───────────────────────
  // Skip if Cloudflare Tunnel or Cloud — domain was already configured
  const domain = deploymentResult.tunnel
    ? { customDomain: deploymentResult.tunnel.domain }
    : deploymentResult.cloud
    ? { customDomain: deploymentResult.cloud.fqdn }
    : await promptDomain(inquirer, chalk, deployTarget);

  // ─── Step 5: Domain Registration ─────────────────
  // Skip for tunnel or cloud — DNS is already configured
  const registration = (deploymentResult.tunnel || deploymentResult.cloud)
    ? { registered: true, verificationStatus: 'verified' as const } as any
    : await promptRegistration(
        inquirer, chalk, ora,
        domain.customDomain,
        company.companyName,
        company.adminEmail,
      );

  // ─── Install DB driver if needed ───────────────
  await ensureDbDriver(database.type, ora, chalk);

  // ─── Provision ───────────────────────────────────
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');

  const result = await provision(
    { company, database, deployTarget, domain, registration, tunnel: deploymentResult.tunnel, cloud: deploymentResult.cloud },
    ora,
    chalk,
  );

  if (!result.success) {
    console.error('');
    console.error(chalk.red(`  Setup failed: ${result.error}`));
    console.error(chalk.dim('  Check your database connection and try again.'));
    process.exit(1);
  }

  console.log('');
}
