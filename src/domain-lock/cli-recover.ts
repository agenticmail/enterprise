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

  // ─── Detect recovery type ─────────────────────────
  const isCloud = hasFlag(args, '--cloud') || hasFlag(args, '-c');
  if (isCloud || (!getFlag(args, '--domain') && !getFlag(args, '--key'))) {
    // Ask which type
    if (!isCloud && !getFlag(args, '--domain')) {
      const { recoveryType } = await inquirer.prompt([{
        type: 'list',
        name: 'recoveryType',
        message: 'What are you recovering?',
        choices: [
          { name: `AgenticMail Cloud  ${chalk.dim('(yourname.agenticmail.io)')}`, value: 'cloud' },
          { name: `Custom Domain  ${chalk.dim('(your own domain)')}`, value: 'domain' },
        ],
      }]);
      if (recoveryType === 'cloud') {
        return runCloudRecover(args, inquirer, chalk, ora);
      }
    } else if (isCloud) {
      return runCloudRecover(args, inquirer, chalk, ora);
    }
  }

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

// ─── AgenticMail Cloud Recovery ─────────────────────

const REGISTRY_URL = process.env.AGENTICMAIL_SUBDOMAIN_REGISTRY_URL
  || 'https://registry.agenticmail.io';

async function runCloudRecover(args: string[], inquirer: any, chalk: any, ora: any): Promise<void> {
  console.log('');
  console.log(chalk.bold('  AgenticMail Cloud — Recovery'));
  console.log(chalk.dim('  Recover your agenticmail.io subdomain on a new machine.'));
  console.log('');
  console.log(chalk.dim('  You will need your AGENTICMAIL_VAULT_KEY — the key from your'));
  console.log(chalk.dim('  original installation\'s ~/.agenticmail/.env file.'));
  console.log('');

  // Step 1: Get vault key
  let vaultKey = getFlag(args, '--vault-key') || process.env.AGENTICMAIL_VAULT_KEY;
  if (!vaultKey) {
    const answer = await inquirer.prompt([{
      type: 'password',
      name: 'vaultKey',
      message: 'Your AGENTICMAIL_VAULT_KEY:',
      mask: '*',
      validate: (v: string) => v.trim().length >= 16 ? true : 'Key seems too short — check your backup',
    }]);
    vaultKey = answer.vaultKey.trim();
  }

  // Step 2: Optionally get subdomain name (speeds up recovery)
  let subdomain = getFlag(args, '--name') || getFlag(args, '--subdomain');
  if (!subdomain) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'subdomain',
      message: 'Your subdomain (optional — press Enter to auto-detect):',
      suffix: chalk.dim('.agenticmail.io'),
    }]);
    subdomain = answer.subdomain?.trim() || undefined;
  }

  // Step 3: Recover from registry
  const { createHash } = await import('crypto');
  const vaultKeyHash = createHash('sha256').update(vaultKey!).digest('hex');

  const spinner = ora('Recovering subdomain credentials...').start();
  try {
    const body: any = { vaultKeyHash };
    if (subdomain) body.name = subdomain;

    const resp = await fetch(`${REGISTRY_URL}/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json() as any;

    if (!data.success) {
      spinner.fail(data.error || 'Recovery failed');
      console.log('');
      console.log(chalk.dim('  Make sure you are using the exact AGENTICMAIL_VAULT_KEY from'));
      console.log(chalk.dim('  your original installation (~/.agenticmail/.env).'));
      return;
    }

    spinner.succeed(`Recovered: ${chalk.bold(data.fqdn)}`);

    // Step 4: Save to .env
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');

    const amDir = join(homedir(), '.agenticmail');
    mkdirSync(amDir, { recursive: true });
    const envPath = join(amDir, '.env');

    let envContent = '';
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, 'utf8');
    }

    // Update or add each key
    const updates: Record<string, string> = {
      AGENTICMAIL_VAULT_KEY: vaultKey!,
      AGENTICMAIL_SUBDOMAIN: data.subdomain,
      AGENTICMAIL_DOMAIN: data.fqdn,
      CLOUDFLARED_TOKEN: data.tunnelToken,
    };

    for (const [key, val] of Object.entries(updates)) {
      if (!val) continue;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `${envContent.endsWith('\n') ? '' : '\n'}${key}=${val}\n`;
      }
    }

    writeFileSync(envPath, envContent, { mode: 0o600 });

    console.log('');
    console.log(chalk.green.bold('  Recovery complete!'));
    console.log('');
    console.log(`  Subdomain:    ${chalk.bold(data.fqdn)}`);
    console.log(`  Tunnel Token: ${chalk.dim('saved to ~/.agenticmail/.env')}`);
    console.log(`  Vault Key:    ${chalk.dim('saved to ~/.agenticmail/.env')}`);
    console.log('');
    console.log(chalk.bold('  Next steps:'));
    console.log('');

    // Ask for DATABASE_URL right now
    const envFilePath = join(amDir, '.env');
    let currentEnv = '';
    try { currentEnv = readFileSync(envFilePath, 'utf8'); } catch {}
    const hasDbUrl = currentEnv.includes('DATABASE_URL=') && !currentEnv.includes('DATABASE_URL=\n');

    if (!hasDbUrl) {
      console.log(chalk.yellow('  Your database connection string is needed to restore your data.'));
      console.log(chalk.dim('  This is the same DATABASE_URL from your original installation.'));
      console.log(chalk.dim('  Example: postgresql://user:pass@host:5432/dbname\n'));

      const { dbUrl } = await inquirer.prompt([{
        type: 'input',
        name: 'dbUrl',
        message: 'DATABASE_URL:',
        validate: (v: string) => v.trim().length > 5 ? true : 'Enter your database connection string',
      }]);

      const regex = /^DATABASE_URL=.*$/m;
      if (regex.test(currentEnv)) {
        currentEnv = currentEnv.replace(regex, `DATABASE_URL=${dbUrl.trim()}`);
      } else {
        currentEnv += `${currentEnv.endsWith('\n') ? '' : '\n'}DATABASE_URL=${dbUrl.trim()}\n`;
      }
      writeFileSync(envFilePath, currentEnv, { mode: 0o600 });
      console.log(chalk.green('  DATABASE_URL saved'));
    }

    // Check if JWT_SECRET is present — if not, warn them
    if (!currentEnv.includes('JWT_SECRET=') || currentEnv.includes('JWT_SECRET=\n')) {
      console.log('');
      console.log(chalk.yellow('  Note: JWT_SECRET is missing — a new one will be generated on start.'));
      console.log(chalk.dim('  This means existing login sessions from the old machine won\'t work.'));
      console.log(chalk.dim('  Users will need to log in again. This is normal for recovery.'));
    }

    // Offer to reset admin password
    const { wantsReset } = await inquirer.prompt([{
      type: 'confirm',
      name: 'wantsReset',
      message: 'Reset your admin password?',
      default: false,
    }]);

    if (wantsReset) {
      // Read DATABASE_URL from current env
      let dbUrl = '';
      for (const line of currentEnv.split('\n')) {
        const t = line.trim();
        if (t.startsWith('DATABASE_URL=')) dbUrl = t.slice('DATABASE_URL='.length);
      }

      if (!dbUrl) {
        console.log(chalk.yellow('  Cannot reset password without DATABASE_URL.'));
      } else {
        const { newPassword } = await inquirer.prompt([{
          type: 'password',
          name: 'newPassword',
          message: 'New admin password:',
          mask: '*',
          validate: (v: string) => v.length >= 8 ? true : 'Password must be at least 8 characters',
        }]);
        const { confirmPassword } = await inquirer.prompt([{
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
          mask: '*',
          validate: (v: string) => v === newPassword ? true : 'Passwords do not match',
        }]);

        if (newPassword === confirmPassword) {
          const resetSpinner = ora('Resetting admin password...').start();
          try {
            const bcryptMod = await import('bcryptjs');
            const bcrypt = bcryptMod.default || bcryptMod;
            const hash = await bcrypt.hash(newPassword, 12);

            if (dbUrl.startsWith('postgres')) {
              const pgMod = await import('postgres' as string);
              const sql = (pgMod.default || pgMod)(dbUrl);
              await sql`UPDATE users SET password_hash = ${hash} WHERE role = 'admin' OR role = 'owner' ORDER BY created_at ASC LIMIT 1`;
              await sql.end();
            } else {
              // SQLite
              const sqliteMod = await import('better-sqlite3' as string);
              const Database = sqliteMod.default || sqliteMod;
              const db = new Database(dbUrl.replace('file:', '').replace('sqlite:', ''));
              db.prepare('UPDATE users SET password_hash = ? WHERE rowid = (SELECT rowid FROM users WHERE role IN (?, ?) ORDER BY created_at ASC LIMIT 1)').run(hash, 'admin', 'owner');
              db.close();
            }
            resetSpinner.succeed('Admin password reset successfully');
          } catch (e: any) {
            resetSpinner.fail('Could not reset password: ' + e.message);
            console.log(chalk.dim('  You can reset it later from the dashboard or by re-running recovery.'));
          }
        }
      }
    }

    console.log('');
    console.log(`  Start your instance:`);
    console.log(`     ${chalk.cyan('npx @agenticmail/enterprise start')}`);
    console.log('');
    console.log(chalk.dim('  The server will auto-start cloudflared with your tunnel token.'));
    console.log(chalk.dim('  Your dashboard will be live again at https://' + data.fqdn));
    console.log('');

    // Step 5: Offer to install cloudflared now
    const { doInstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'doInstall',
      message: 'Install cloudflared and start the tunnel now?',
      default: true,
    }]);

    if (doInstall) {
      const { execSync } = await import('child_process');
      const { platform, arch } = await import('os');

      // Install cloudflared if needed
      try {
        execSync(process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared', { timeout: 3000 });
        console.log(chalk.green('  cloudflared already installed'));
      } catch {
        const spinner2 = ora('Installing cloudflared...').start();
        try {
          const os = platform();
          if (os === 'darwin') {
            try {
              execSync('brew install cloudflared', { stdio: 'pipe', timeout: 120000 });
            } catch {
              const cfArch = arch() === 'arm64' ? 'arm64' : 'amd64';
              execSync(`curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${cfArch} && chmod +x /usr/local/bin/cloudflared`, { timeout: 60000 });
            }
          } else {
            const cfArch = arch() === 'arm64' ? 'arm64' : 'amd64';
            execSync(`curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch} && chmod +x /usr/local/bin/cloudflared`, { timeout: 60000 });
          }
          spinner2.succeed('cloudflared installed');
        } catch (e: any) {
          spinner2.fail('Could not install cloudflared: ' + e.message);
          console.log(chalk.dim('  Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
        }
      }

      // Start via PM2
      try {
        const { execSync: ex } = await import('child_process');
        ex('which pm2', { timeout: 3000 });
        try { ex('pm2 delete cloudflared 2>/dev/null', { timeout: 5000 }); } catch {}
        const safeToken = String(data.tunnelToken).replace(/[^a-zA-Z0-9_-]/g, '');
        ex(`pm2 start cloudflared --name cloudflared -- tunnel --no-autoupdate run --token ${safeToken}`, { timeout: 15000 });
        try { ex('pm2 save 2>/dev/null', { timeout: 5000 }); } catch {}
        // Setup PM2 to survive reboots
        try {
          const startupOut = ex('pm2 startup 2>&1', { encoding: 'utf8', timeout: 15000 });
          const sudoMatch = startupOut.match(/sudo .+$/m);
          if (sudoMatch) try { ex(sudoMatch[0], { timeout: 15000, stdio: 'pipe' }); } catch {}
        } catch {}
        console.log(chalk.green('  Tunnel running via PM2 (survives reboots)'));
      } catch {
        console.log(chalk.dim('  Start the tunnel manually:'));
        console.log(chalk.cyan(`  cloudflared tunnel --no-autoupdate run --token ${data.tunnelToken}`));
      }
    }

  } catch (err: any) {
    spinner.fail('Recovery failed: ' + err.message);
    console.log(chalk.dim('  Check your internet connection and try again.'));
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
