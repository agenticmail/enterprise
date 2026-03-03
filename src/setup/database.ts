/**
 * Setup Wizard — Step 2: Database Selection
 *
 * Lets the user pick from 10 database backends and
 * collects the connection details specific to each one.
 */

import type { DatabaseType } from '../db/adapter.js';
import { getSupportedDatabases } from '../db/factory.js';

export interface DatabaseSelection {
  type: DatabaseType;
  connectionString?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  authToken?: string;
}

const CONNECTION_HINTS: Record<string, string> = {
  postgres: 'postgresql://user:pass@host:5432/dbname',
  mysql: 'mysql://user:pass@host:3306/dbname',
  mongodb: 'mongodb+srv://user:pass@cluster.mongodb.net/dbname',
  supabase: 'postgresql://postgres:pass@db.xxxx.supabase.co:5432/postgres',
  neon: 'postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require',
  planetscale: 'mysql://user:pass@aws.connect.psdb.cloud/dbname?ssl={"rejectUnauthorized":true}',
  cockroachdb: 'postgresql://user:pass@cluster.cockroachlabs.cloud:26257/dbname?sslmode=verify-full',
};

export async function promptDatabase(
  inquirer: any,
  chalk: any,
): Promise<DatabaseSelection> {
  console.log('');
  console.log(chalk.bold.cyan('  Step 2 of 4: Database'));
  console.log(chalk.dim('  Where should your data live?\n'));

  const databases = getSupportedDatabases();

  // Put Supabase first and mark as recommended
  const supabaseIdx = databases.findIndex((d: any) => d.type === 'supabase');
  const choices = databases.map((d: any, i: number) => ({
    name: d.type === 'supabase'
      ? `${d.label}  ${chalk.green('← recommended (free tier)')}  ${chalk.dim('(cloud)')}`
      : `${d.label}  ${chalk.dim(`(${d.group})`)}`,
    value: d.type,
  }));

  // Move Supabase to top if not already
  if (supabaseIdx > 0) {
    const [sb] = choices.splice(supabaseIdx, 1);
    choices.unshift(sb);
  }

  const { dbType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dbType',
      message: 'Database backend:',
      choices,
    },
  ]);

  // Show Supabase signup instructions if selected
  if (dbType === 'supabase') {
    console.log('');
    console.log(chalk.bold('  Supabase — Free PostgreSQL Database'));
    console.log('');
    console.log(chalk.dim('  If you don\'t have a Supabase account yet:'));
    console.log('');
    console.log(`  1. Go to ${chalk.cyan.underline('https://supabase.com/dashboard')}`);
    console.log(`  2. Click ${chalk.bold('"Start your project"')} — sign up with GitHub or email`);
    console.log(`  3. Create a new project (any name, choose a strong password)`);
    console.log(`  4. Go to ${chalk.bold('Settings → Database → Connection string')}`);
    console.log(`  5. Select ${chalk.bold('"URI"')} and copy the connection string`);
    console.log(`  6. Replace ${chalk.yellow('[YOUR-PASSWORD]')} with your project password`);
    console.log('');
    console.log(chalk.dim('  Free tier includes: 500MB storage, unlimited API requests, 2 projects'));
    console.log(chalk.dim('  The connection string looks like:'));
    console.log(chalk.dim('  postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'));
    console.log('');
  }

  // ─── SQLite ────────────────────────────────────────
  if (dbType === 'sqlite') {
    const { dbPath } = await inquirer.prompt([{
      type: 'input',
      name: 'dbPath',
      message: 'Database file path:',
      default: './agenticmail-enterprise.db',
    }]);
    return { type: dbType, connectionString: dbPath };
  }

  // ─── DynamoDB ──────────────────────────────────────
  if (dbType === 'dynamodb') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'region',
        message: 'AWS Region:',
        default: 'us-east-1',
      },
      {
        type: 'input',
        name: 'accessKeyId',
        message: 'AWS Access Key ID:',
        validate: (v: string) => v.length > 0 || 'Required',
      },
      {
        type: 'password',
        name: 'secretAccessKey',
        message: 'AWS Secret Access Key:',
        mask: '*',
        validate: (v: string) => v.length > 0 || 'Required',
      },
    ]);
    return { type: dbType, ...answers };
  }

  // ─── Turso / LibSQL ────────────────────────────────
  if (dbType === 'turso') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'connectionString',
        message: 'Turso database URL:',
        suffix: chalk.dim('  (e.g. libsql://db-org.turso.io)'),
        validate: (v: string) => v.length > 0 || 'Required',
      },
      {
        type: 'password',
        name: 'authToken',
        message: 'Turso auth token:',
        mask: '*',
        validate: (v: string) => v.length > 0 || 'Required',
      },
    ]);
    return { type: dbType, connectionString: answers.connectionString, authToken: answers.authToken };
  }

  // ─── All others (connection string) ────────────────
  const hint = CONNECTION_HINTS[dbType] || '';
  const { connectionString } = await inquirer.prompt([{
    type: 'input',
    name: 'connectionString',
    message: 'Connection string:',
    suffix: hint ? chalk.dim(`  (e.g. ${hint})`) : '',
    validate: (v: string) => v.length > 0 || 'Connection string is required',
  }]);

  return { type: dbType, connectionString };
}
