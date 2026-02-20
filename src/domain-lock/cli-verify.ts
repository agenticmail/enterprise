/**
 * CLI Command: verify-domain
 *
 * Check DNS verification status for a registered domain.
 * Asks the central registry to resolve the TXT record.
 *
 * Usage:
 *   agenticmail-enterprise verify-domain
 *   agenticmail-enterprise verify-domain --domain agents.agenticmail.io
 *   agenticmail-enterprise verify-domain --db ./data.db
 */

import { DomainLock } from './index.js';

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

export async function runVerifyDomain(args: string[]): Promise<void> {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  console.log('');
  console.log(chalk.bold('  AgenticMail Enterprise — Domain Verification'));
  console.log('');

  // ── Determine domain ───────────────────────────────

  let domain = getFlag(args, '--domain');
  let dnsChallenge: string | undefined;
  let dbConnected = false;
  let db: any = null;

  // Try to read from local DB if domain not specified
  if (!domain) {
    const dbPath = getFlag(args, '--db');
    const dbType = getFlag(args, '--db-type') || 'sqlite';

    if (dbPath) {
      try {
        const { createAdapter } = await import('../db/factory.js');
        db = await createAdapter({ type: dbType as any, connectionString: dbPath });
        await db.migrate();
        const settings = await db.getSettings();
        domain = settings?.domain;
        dnsChallenge = settings?.domainDnsChallenge;
        dbConnected = true;
      } catch {
        // Can't read DB, will ask for domain
      }
    }
  }

  if (!domain) {
    const { default: inquirer } = await import('inquirer');
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'domain',
      message: 'Domain to verify:',
      suffix: chalk.dim('  (e.g. agents.agenticmail.io)'),
      validate: (v: string) => v.includes('.') || 'Enter a valid domain',
    }]);
    domain = answer.domain;
  }

  // ── Check verification ─────────────────────────────

  const spinner = ora('Checking DNS verification...').start();

  const lock = new DomainLock();
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

    // Update local DB if connected
    if (dbConnected && db) {
      try {
        await db.updateSettings({
          domainStatus: 'verified',
          domainVerifiedAt: new Date().toISOString(),
        } as any);
      } catch { /* non-critical */ }
    }

    console.log('');
    console.log(chalk.green.bold(`  ${domain} is verified and protected.`));
    console.log(chalk.dim('  Your deployment domain is locked. No other instance can claim it.'));
    console.log('');
  } else {
    spinner.info('DNS record not found yet');
    console.log('');
    console.log(chalk.yellow('  The DNS TXT record has not been detected.'));
    console.log('');
    console.log(chalk.bold('  Make sure this record exists:'));
    console.log('');
    console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(`_agenticmail-verify.${domain}`)}`);
    console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('TXT')}`);
    if (dnsChallenge) {
      console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(dnsChallenge)}`);
    } else {
      console.log(`  ${chalk.bold('Value:')}  ${chalk.dim('(check your setup records or dashboard)')}`);
    }
    console.log('');
    console.log(chalk.dim('  DNS changes can take up to 48 hours to propagate.'));
    console.log(chalk.dim('  Run this command again after adding the record.'));
    console.log('');
  }

  if (db) await db.disconnect();
}
