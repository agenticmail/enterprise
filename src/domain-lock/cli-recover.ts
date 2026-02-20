/**
 * CLI Command: recover
 *
 * Recover a domain registration on a new machine.
 * Requires the original deployment key to prove ownership.
 *
 * Usage:
 *   agenticmail-enterprise recover
 *   agenticmail-enterprise recover --domain agents.agenticmail.io --key <hex>
 *   agenticmail-enterprise recover --db ./data.db --db-type sqlite
 */

import { DomainLock } from './index.js';

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

export async function runRecover(args: string[]): Promise<void> {
  const { default: inquirer } = await import('inquirer');
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  console.log('');
  console.log(chalk.bold('  AgenticMail Enterprise — Domain Recovery'));
  console.log(chalk.dim('  Recover your domain registration on a new machine.'));
  console.log('');

  // ── Collect domain ─────────────────────────────────

  let domain = getFlag(args, '--domain');
  if (!domain) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'domain',
      message: 'Domain to recover:',
      suffix: chalk.dim('  (e.g. agents.agenticmail.io)'),
      validate: (v: string) => v.includes('.') || 'Enter a valid domain',
    }]);
    domain = answer.domain;
  }

  // ── Collect deployment key ─────────────────────────

  let key = getFlag(args, '--key');
  if (!key) {
    const answer = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'Deployment key:',
      mask: '*',
      validate: (v: string) => {
        if (v.length !== 64) return 'Deployment key should be 64 hex characters';
        if (!/^[0-9a-fA-F]+$/.test(v)) return 'Deployment key should be hexadecimal';
        return true;
      },
    }]);
    key = answer.key;
  }

  // ── Contact registry ───────────────────────────────

  const spinner = ora('Contacting AgenticMail registry...').start();

  const lock = new DomainLock();
  const result = await lock.recover(domain!, key!);

  if (!result.success) {
    spinner.fail('Recovery failed');
    console.log('');
    console.error(chalk.red(`  ${result.error}`));
    console.log('');
    process.exit(1);
  }

  spinner.succeed('Domain recovery initiated');

  // ── Store locally ──────────────────────────────────
  // Hash the key for local storage
  const { default: bcrypt } = await import('bcryptjs');
  const keyHash = await bcrypt.hash(key!, 12);

  // Try to connect to local DB and store
  const dbPath = getFlag(args, '--db');
  const dbType = getFlag(args, '--db-type') || 'sqlite';

  if (dbPath) {
    try {
      const spinnerDb = ora('Saving to local database...').start();
      const { createAdapter } = await import('../db/factory.js');
      const db = await createAdapter({ type: dbType as any, connectionString: dbPath });
      await db.migrate();
      await db.updateSettings({
        domain: domain!,
        deploymentKeyHash: keyHash,
        domainRegistrationId: result.registrationId,
        domainDnsChallenge: result.dnsChallenge,
        domainRegisteredAt: new Date().toISOString(),
        domainStatus: 'pending_dns',
      } as any);
      spinnerDb.succeed('Local database updated');
      await db.disconnect();
    } catch (err: any) {
      console.log(chalk.yellow(`\n  Could not update local DB: ${err.message}`));
      console.log(chalk.dim('  You can manually update settings after setup.'));
    }
  }

  // ── Display instructions ───────────────────────────

  console.log('');
  console.log(chalk.green.bold('  Domain recovery successful!'));
  console.log('');
  console.log(chalk.bold('  Update your DNS TXT record:'));
  console.log('');
  console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(`_agenticmail-verify.${domain}`)}`);
  console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('TXT')}`);
  console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(result.dnsChallenge)}`);
  console.log('');
  console.log(chalk.dim('  Then run: agenticmail-enterprise verify-domain'));
  console.log('');
}
