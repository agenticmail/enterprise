/**
 * CLI Command: verify-domain
 *
 * Check DNS verification status for a registered domain.
 * Asks the central registry to resolve the TXT record.
 *
 * Usage:
 *   npx @agenticmail/enterprise verify-domain
 *   npx @agenticmail/enterprise verify-domain --domain agents.acme.com
 *   npx @agenticmail/enterprise verify-domain --poll     (retry every 10s for 5 attempts)
 *
 * Environment:
 *   DATABASE_URL    — Auto-detected if set
 */

import { DomainLock } from './index.js';

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function detectDbType(url: string): string {
  const u = url.toLowerCase().trim();
  if (u.startsWith('postgres') || u.startsWith('pg:')) return 'postgres';
  if (u.startsWith('mysql')) return 'mysql';
  if (u.startsWith('mongodb')) return 'mongodb';
  if (u.startsWith('libsql') || u.includes('.turso.io')) return 'turso';
  if (u.endsWith('.db') || u.endsWith('.sqlite') || u.endsWith('.sqlite3') || u.startsWith('file:')) return 'sqlite';
  return 'postgres';
}

export async function runVerifyDomain(args: string[]): Promise<void> {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  console.log('');
  console.log(chalk.bold('  AgenticMail Enterprise — Domain Verification'));
  console.log('');

  // ═══════════════════════════════════════════════════
  // Connect to database (for reading domain + updating status)
  // ═══════════════════════════════════════════════════

  let domain = getFlag(args, '--domain');
  let dnsChallenge: string | undefined;
  let db: any = null;
  let dbConnected = false;

  // Auto-detect from DATABASE_URL
  const envDbUrl = process.env.DATABASE_URL;
  if (envDbUrl) {
    const dbType = detectDbType(envDbUrl);
    const spinner = ora(`Connecting to database (${dbType})...`).start();
    try {
      const { createAdapter } = await import('../db/factory.js');
      db = await createAdapter({ type: dbType as any, connectionString: envDbUrl });
      await db.migrate();
      const settings = await db.getSettings();
      if (!domain && settings?.domain) domain = settings.domain;
      if (settings?.domainDnsChallenge) dnsChallenge = settings.domainDnsChallenge;
      dbConnected = true;
      spinner.succeed(`Connected to ${dbType} database` + (domain ? ` (domain: ${domain})` : ''));
    } catch (err: any) {
      spinner.warn(`Could not connect via DATABASE_URL: ${err.message}`);
      db = null;
    }
  }

  // Try --db flag fallback
  if (!dbConnected) {
    const dbPath = getFlag(args, '--db');
    const dbType = getFlag(args, '--db-type') || 'sqlite';
    if (dbPath) {
      const spinner = ora(`Connecting to ${dbType} database...`).start();
      try {
        const { createAdapter } = await import('../db/factory.js');
        db = await createAdapter({ type: dbType as any, connectionString: dbPath });
        await db.migrate();
        const settings = await db.getSettings();
        if (!domain && settings?.domain) domain = settings.domain;
        if (settings?.domainDnsChallenge) dnsChallenge = settings.domainDnsChallenge;
        dbConnected = true;
        spinner.succeed(`Connected to ${dbType} database`);
      } catch {
        spinner.warn('Could not read local database');
      }
    }
  }

  // If still no domain, prompt
  if (!domain) {
    const { default: inquirer } = await import('inquirer');
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'domain',
      message: 'Domain to verify:',
      suffix: chalk.dim('  (e.g. agents.yourcompany.com)'),
      validate: (v: string) => v.includes('.') || 'Enter a valid domain',
      filter: (v: string) => v.trim().toLowerCase(),
    }]);
    domain = answer.domain;
  }

  // ═══════════════════════════════════════════════════
  // Check verification (with optional polling)
  // ═══════════════════════════════════════════════════

  const lock = new DomainLock();
  const maxAttempts = hasFlag(args, '--poll') ? 5 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const spinner = ora(
      maxAttempts > 1
        ? `Checking DNS verification (attempt ${attempt}/${maxAttempts})...`
        : 'Checking DNS verification...'
    ).start();

    try {
      const result = await lock.checkVerification(domain!);

      if (!result.success) {
        spinner.fail('Verification check failed');
        console.log('');
        console.error(chalk.red(`  ${result.error}`));
        console.log('');
        if (db) await db.disconnect();
        process.exit(1);
      }

      if (result.verified) {
        spinner.succeed('Domain verified!');

        // Update database
        if (dbConnected && db) {
          try {
            await db.updateSettings({
              domainStatus: 'verified',
              domainVerifiedAt: new Date().toISOString(),
            } as any);
            console.log(chalk.dim('  Database updated with verified status.'));
          } catch { /* non-critical */ }
        }

        console.log('');
        console.log(chalk.green.bold(`  ✓ ${domain} is verified and protected.`));
        console.log(chalk.dim('  Your deployment domain is locked. No other instance can claim it.'));
        console.log(chalk.dim('  The system now operates 100% offline — no outbound calls are made.'));
        console.log('');

        if (db) await db.disconnect();
        return;
      }
    } catch (err: any) {
      spinner.warn(`Check failed: ${err.message}`);
    }

    if (attempt < maxAttempts) {
      const waitSpinner = ora(`DNS record not found yet. Retrying in 10 seconds...`).start();
      await new Promise(r => setTimeout(r, 10_000));
      waitSpinner.stop();
    }
  }

  // Not verified
  console.log('');
  console.log(chalk.yellow('  DNS record not detected yet.'));
  console.log('');
  console.log(chalk.bold('  Make sure this TXT record exists at your DNS provider:'));
  console.log('');
  console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(`_agenticmail-verify.${domain}`)}`);
  console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('TXT')}`);
  if (dnsChallenge) {
    console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(dnsChallenge)}`);
  } else {
    console.log(`  ${chalk.bold('Value:')}  ${chalk.dim('(check your dashboard or setup output)')}`);
  }
  console.log('');
  console.log(chalk.dim('  DNS propagation can take up to 48 hours.'));
  console.log(chalk.dim('  Run with --poll to retry automatically:'));
  console.log(chalk.dim(`    npx @agenticmail/enterprise verify-domain --domain ${domain} --poll`));
  console.log('');

  if (db) await db.disconnect();
}
