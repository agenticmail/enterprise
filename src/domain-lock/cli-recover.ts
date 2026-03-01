/**
 * CLI Command: recover
 *
 * Recover a domain registration on a new machine.
 * Requires the original deployment key to prove ownership.
 *
 * Recovery flow:
 *   1. Collect domain + deployment key
 *   2. Contact AgenticMail registry to verify ownership
 *   3. Connect to database (auto-detect from env or prompt)
 *   4. Update database with new DNS challenge
 *   5. Show DNS instructions
 *
 * Usage:
 *   npx @agenticmail/enterprise recover
 *   npx @agenticmail/enterprise recover --domain agents.acme.com
 *   npx @agenticmail/enterprise recover --domain agents.acme.com --key <hex>
 *
 * Environment:
 *   DATABASE_URL    — Auto-detected if set (e.g. postgres://...)
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

export async function runRecover(args: string[]): Promise<void> {
  const { default: inquirer } = await import('inquirer');
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  console.log('');
  console.log(chalk.bold('  AgenticMail Enterprise — Domain Recovery'));
  console.log(chalk.dim('  Recover your domain registration on a new machine.'));
  console.log('');
  console.log(chalk.dim('  You will need:'));
  console.log(chalk.dim('    1. Your domain name'));
  console.log(chalk.dim('    2. Your 64-character deployment key (shown once during setup)'));
  console.log(chalk.dim('    3. Your database connection string'));
  console.log('');

  // ═══════════════════════════════════════════════════
  // Step 1: Collect domain
  // ═══════════════════════════════════════════════════

  let domain = getFlag(args, '--domain');
  if (!domain) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'domain',
      message: 'Domain to recover:',
      suffix: chalk.dim('  (the domain you registered during setup)'),
      validate: (v: string) => {
        const d = v.trim().toLowerCase();
        if (!d.includes('.')) return 'Enter a valid domain (e.g. agents.yourcompany.com)';
        if (d.startsWith('http')) return 'Enter just the domain, not a URL';
        return true;
      },
      filter: (v: string) => v.trim().toLowerCase(),
    }]);
    domain = answer.domain;
  }

  // ═══════════════════════════════════════════════════
  // Step 2: Collect deployment key
  // ═══════════════════════════════════════════════════

  let key = getFlag(args, '--key');
  if (!key) {
    console.log('');
    console.log(chalk.dim('  Your deployment key was shown once during initial setup.'));
    console.log(chalk.dim('  It is a 64-character hexadecimal string.'));
    console.log('');

    const answer = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'Deployment key:',
      mask: '*',
      validate: (v: string) => {
        if (!v.trim()) return 'Deployment key is required';
        if (v.length !== 64) return `Expected 64 characters, got ${v.length}. Check that you copied the full key.`;
        if (!/^[0-9a-fA-F]+$/.test(v)) return 'Deployment key should be hexadecimal (0-9, a-f)';
        return true;
      },
    }]);
    key = answer.key;
  }

  // ═══════════════════════════════════════════════════
  // Step 3: Contact registry
  // ═══════════════════════════════════════════════════

  console.log('');
  const spinner = ora('Contacting AgenticMail registry...').start();

  const lock = new DomainLock();
  const result = await lock.recover(domain!, key!);

  if (!result.success) {
    spinner.fail('Recovery failed');
    console.log('');
    console.error(chalk.red(`  ${result.error}`));
    console.log('');

    if (result.error?.includes('Invalid deployment key')) {
      console.log(chalk.yellow('  The deployment key does not match this domain.'));
      console.log(chalk.dim('  Make sure you are using the key that was shown during the original setup.'));
      console.log(chalk.dim('  If you lost your key, contact support@agenticmail.io for manual verification.'));
    } else if (result.error?.includes('not registered')) {
      console.log(chalk.yellow('  This domain was never registered with AgenticMail.'));
      console.log(chalk.dim('  Run the setup wizard instead: npx @agenticmail/enterprise setup'));
    }

    console.log('');
    process.exit(1);
  }

  spinner.succeed('Registry accepted recovery — new DNS challenge issued');

  // ═══════════════════════════════════════════════════
  // Step 4: Connect to database
  // ═══════════════════════════════════════════════════

  console.log('');
  console.log(chalk.bold.cyan('  Database Connection'));
  console.log(chalk.dim('  We need to update your database with the new registration.\n'));

  let db: any = null;
  let dbConnected = false;

  // Try auto-detect from DATABASE_URL env var
  const envDbUrl = process.env.DATABASE_URL;
  if (envDbUrl && !hasFlag(args, '--no-db')) {
    const dbType = detectDbType(envDbUrl);
    spinner.start(`Connecting to database (${dbType}, from DATABASE_URL)...`);
    try {
      const { createAdapter } = await import('../db/factory.js');
      db = await createAdapter({ type: dbType as any, connectionString: envDbUrl });
      await db.migrate();
      dbConnected = true;
      spinner.succeed(`Connected to ${dbType} database`);
    } catch (err: any) {
      spinner.warn(`Could not connect via DATABASE_URL: ${err.message}`);
      db = null;
    }
  }

  // If not auto-detected, prompt
  if (!dbConnected && !hasFlag(args, '--no-db')) {
    const { connectDb } = await inquirer.prompt([{
      type: 'confirm',
      name: 'connectDb',
      message: 'Connect to your database now?',
      default: true,
    }]);

    if (connectDb) {
      const dbTypes = [
        { name: `PostgreSQL / Supabase / Neon  ${chalk.dim('(recommended)')}`, value: 'postgres' },
        { name: 'MySQL / PlanetScale', value: 'mysql' },
        { name: 'SQLite (local file)', value: 'sqlite' },
        { name: 'Turso (LibSQL)', value: 'turso' },
        { name: 'MongoDB', value: 'mongodb' },
      ];

      const { dbType } = await inquirer.prompt([{
        type: 'list',
        name: 'dbType',
        message: 'Database type:',
        choices: dbTypes,
      }]);

      const placeholders: Record<string, string> = {
        postgres: 'postgresql://user:pass@host:5432/dbname?sslmode=require',
        mysql: 'mysql://user:pass@host:3306/dbname',
        sqlite: './data/agenticmail.db',
        turso: 'libsql://your-db-name-org.turso.io',
        mongodb: 'mongodb+srv://user:pass@cluster.mongodb.net/dbname',
      };

      const { connString } = await inquirer.prompt([{
        type: 'input',
        name: 'connString',
        message: 'Connection string:',
        suffix: chalk.dim(`\n  e.g. ${placeholders[dbType]}\n  >`),
        validate: (v: string) => v.trim() ? true : 'Connection string is required',
      }]);

      spinner.start(`Connecting to ${dbType} database...`);
      try {
        const { createAdapter } = await import('../db/factory.js');
        db = await createAdapter({ type: dbType as any, connectionString: connString.trim() });
        await db.migrate();
        dbConnected = true;
        spinner.succeed(`Connected to ${dbType} database`);
      } catch (err: any) {
        spinner.fail(`Database connection failed: ${err.message}`);
        console.log(chalk.yellow('\n  Could not connect. You can update settings manually from the dashboard.'));
        console.log(chalk.dim('  Or set DATABASE_URL and run this command again.\n'));
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // Step 5: Update database
  // ═══════════════════════════════════════════════════

  if (dbConnected && db) {
    spinner.start('Updating domain registration in database...');
    try {
      const { createHash } = await import('crypto');
      const keyHash = createHash('sha256').update(key!).digest('hex');

      await db.updateSettings({
        domain: domain!,
        deploymentKeyHash: keyHash,
        domainRegistrationId: result.registrationId,
        domainDnsChallenge: result.dnsChallenge,
        domainRegisteredAt: new Date().toISOString(),
        domainStatus: 'pending_dns',
        domainVerifiedAt: undefined,
      } as any);

      spinner.succeed('Database updated with new registration');
    } catch (err: any) {
      spinner.warn(`Could not update database: ${err.message}`);
      console.log(chalk.dim('  You can update manually from the dashboard after DNS verification.'));
    }

    try { await db.disconnect(); } catch {}
  }

  // ═══════════════════════════════════════════════════
  // Step 6: Show DNS instructions
  // ═══════════════════════════════════════════════════

  console.log('');
  console.log(chalk.green.bold('  ✓ Domain recovery successful!'));
  console.log('');
  console.log(chalk.bold('  Next: Add this DNS TXT record to verify ownership'));
  console.log('');
  console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(`_agenticmail-verify.${domain}`)}`);
  console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('TXT')}`);
  console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(result.dnsChallenge)}`);
  console.log('');

  if (dbConnected) {
    console.log(chalk.dim('  After adding the DNS record, verify from the dashboard'));
    console.log(chalk.dim('  or run:'));
  } else {
    console.log(chalk.dim('  After adding the DNS record, connect to your database'));
    console.log(chalk.dim('  and verify:'));
  }
  console.log('');
  console.log(chalk.dim(`    npx @agenticmail/enterprise verify-domain --domain ${domain}`));
  console.log('');

  if (!dbConnected) {
    console.log(chalk.yellow.bold('  ⚠  Database was not updated'));
    console.log(chalk.dim('  The registry accepted your recovery, but your local database'));
    console.log(chalk.dim('  does not have the new DNS challenge yet. Options:'));
    console.log('');
    console.log(chalk.dim('    1. Set DATABASE_URL and run this command again'));
    console.log(chalk.dim('    2. Start your server — the dashboard will show the DNS challenge'));
    console.log(chalk.dim('    3. Run verify-domain with --db after adding DNS records'));
    console.log('');
  }
}

/** Detect DB type from connection string */
function detectDbType(url: string): string {
  const u = url.toLowerCase().trim();
  if (u.startsWith('postgres') || u.startsWith('pg:')) return 'postgres';
  if (u.startsWith('mysql')) return 'mysql';
  if (u.startsWith('mongodb')) return 'mongodb';
  if (u.startsWith('libsql') || u.includes('.turso.io')) return 'turso';
  if (u.endsWith('.db') || u.endsWith('.sqlite') || u.endsWith('.sqlite3') || u.startsWith('file:')) return 'sqlite';
  // Default to postgres (most common)
  return 'postgres';
}
