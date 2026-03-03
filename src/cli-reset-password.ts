/**
 * CLI Command: reset-password
 *
 * Reset the admin password directly in the database.
 * Useful for recovery or when locked out.
 *
 * Usage:
 *   npx @agenticmail/enterprise reset-password
 *   DATABASE_URL=postgres://... npx @agenticmail/enterprise reset-password
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export async function runResetPassword(_args: string[]): Promise<void> {
  const { default: inquirer } = await import('inquirer');
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  console.log('');
  console.log(chalk.bold('  AgenticMail Enterprise — Password Reset'));
  console.log(chalk.dim('  Reset your admin login password.\n'));

  // Find DATABASE_URL
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // Try loading from .env
    const envPaths = [
      join(process.cwd(), '.env'),
      join(homedir(), '.agenticmail', '.env'),
    ];
    for (const p of envPaths) {
      if (!existsSync(p)) continue;
      try {
        for (const line of readFileSync(p, 'utf8').split('\n')) {
          const t = line.trim();
          if (t.startsWith('DATABASE_URL=')) {
            dbUrl = t.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
            console.log(chalk.dim(`  Found DATABASE_URL in ${p}`));
            break;
          }
        }
        if (dbUrl) break;
      } catch {}
    }
  }

  if (!dbUrl) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'dbUrl',
      message: 'DATABASE_URL:',
      validate: (v: string) => v.trim().length > 5 ? true : 'Enter your database connection string',
    }]);
    dbUrl = answer.dbUrl.trim();
  }

  // Get new password
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

  if (newPassword !== confirmPassword) {
    console.log(chalk.red('  Passwords do not match.'));
    process.exit(1);
  }

  const spinner = ora('Resetting admin password...').start();

  try {
    const bcryptMod = await import('bcryptjs');
    const bcrypt = bcryptMod.default || bcryptMod;
    const hash = await bcrypt.hash(newPassword, 12);

    if (dbUrl!.startsWith('postgres')) {
      const pgMod = await import('postgres' as string);
      const sql = (pgMod.default || pgMod)(dbUrl!);
      // Update the first admin/owner user
      const result = await sql`
        UPDATE users SET password_hash = ${hash}, updated_at = NOW()
        WHERE id = (
          SELECT id FROM users
          WHERE role IN ('admin', 'owner')
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING email, role
      `;
      await sql.end();

      if (result.length > 0) {
        spinner.succeed(`Password reset for ${result[0].email} (${result[0].role})`);
      } else {
        spinner.warn('No admin user found in database. Run setup first.');
      }
    } else {
      // SQLite
      const sqliteMod = await import('better-sqlite3' as string);
      const Database = sqliteMod.default || sqliteMod;
      const dbPath = dbUrl!.replace('file:', '').replace('sqlite:', '');
      const db = new Database(dbPath);

      const user = db.prepare(
        "SELECT id, email, role FROM users WHERE role IN ('admin', 'owner') ORDER BY created_at ASC LIMIT 1"
      ).get() as any;

      if (user) {
        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, user.id);
        db.close();
        spinner.succeed(`Password reset for ${user.email} (${user.role})`);
      } else {
        db.close();
        spinner.warn('No admin user found in database. Run setup first.');
      }
    }

    console.log('');
    console.log(chalk.green('  You can now log in with your new password.'));
    console.log('');
  } catch (e: any) {
    spinner.fail('Failed: ' + e.message);
    console.log(chalk.dim('  Make sure DATABASE_URL is correct and the database is accessible.'));
    process.exit(1);
  }
}
