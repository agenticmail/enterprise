/**
 * Database Adapter Factory
 * 
 * Creates the right adapter based on config.
 * Adapters are lazy-loaded to avoid bundling unused drivers.
 */

import type { DatabaseAdapter, DatabaseConfig, DatabaseType } from './adapter.js';

const ADAPTER_MAP: Record<DatabaseType, () => Promise<new () => DatabaseAdapter>> = {
  postgres:     () => import('./postgres.js').then(m => m.PostgresAdapter),
  supabase:     () => import('./postgres.js').then(m => m.PostgresAdapter),  // Supabase IS Postgres
  neon:         () => import('./postgres.js').then(m => m.PostgresAdapter),  // Neon IS Postgres
  cockroachdb:  () => import('./postgres.js').then(m => m.PostgresAdapter),  // CockroachDB is PG-compatible
  mysql:        () => import('./mysql.js').then(m => m.MysqlAdapter),
  planetscale:  () => import('./mysql.js').then(m => m.MysqlAdapter),        // PlanetScale IS MySQL
  mongodb:      () => import('./mongodb.js').then(m => m.MongoAdapter),
  sqlite:       () => import('./sqlite.js').then(m => m.SqliteAdapter),
  turso:        () => import('./turso.js').then(m => m.TursoAdapter),
  dynamodb:     () => import('./dynamodb.js').then(m => m.DynamoAdapter),
};

export async function createAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  const loader = ADAPTER_MAP[config.type];
  if (!loader) {
    throw new Error(
      `Unsupported database type: "${config.type}". ` +
      `Supported: ${Object.keys(ADAPTER_MAP).join(', ')}`
    );
  }

  const AdapterClass = await loader();
  const adapter = new AdapterClass();
  await adapter.connect(config);
  return adapter;
}

/**
 * Smart config builder: auto-detects Supabase/Neon pooler URLs,
 * sets optimal connection params, and derives a directUrl for migrations.
 * Call this when building config from a raw DATABASE_URL env var.
 */
export function smartDbConfig(connectionString: string, typeHint?: DatabaseType): DatabaseConfig {
  const type: DatabaseType = typeHint || (connectionString.startsWith('postgres') ? 'postgres' : 'sqlite');
  const config: DatabaseConfig = { type, connectionString };

  if (type === 'sqlite') return config;

  try {
    const u = new URL(connectionString);
    const host = u.hostname || '';
    const port = u.port || '5432';

    // ── Supabase detection ──────────────────────────
    if (host.includes('pooler.supabase.com') || host.includes('.supabase.co')) {
      const projectRef = u.username.replace('postgres.', '');

      if (host.includes('pooler.supabase.com')) {
        // Generate direct URL for migrations
        const directU = new URL(connectionString);
        directU.hostname = 'db.' + projectRef + '.supabase.co';
        directU.port = '5432';
        directU.searchParams.delete('pgbouncer');
        config.directUrl = directU.toString();

        // Auto-switch to transaction mode if on session mode
        if (port === '5432') {
          const fixedU = new URL(connectionString);
          fixedU.port = '6543';
          fixedU.searchParams.set('pgbouncer', 'true');
          config.connectionString = fixedU.toString();
          console.log('[db] Auto-optimized: Supabase session mode (5432) → transaction mode (6543)');
        } else if (!u.searchParams.get('pgbouncer')) {
          const fixedU = new URL(connectionString);
          fixedU.searchParams.set('pgbouncer', 'true');
          config.connectionString = fixedU.toString();
          console.log('[db] Auto-configured: Added ?pgbouncer=true for Supabase transaction mode');
        }
      } else if (host.startsWith('db.')) {
        // Direct connection — save as directUrl, but warn
        config.directUrl = connectionString;
        console.log('[db] Supabase direct connection detected. For production, use the pooler URL (port 6543).');
      }
    }
    // ── Neon detection ──────────────────────────────
    else if (host.includes('.neon.tech')) {
      if (!host.includes('-pooler')) {
        // Direct endpoint — save as directUrl, generate pooler
        config.directUrl = connectionString;
        const poolerU = new URL(connectionString);
        const parts = poolerU.hostname.split('.');
        if (parts[0] && !parts[0].endsWith('-pooler')) {
          parts[0] = parts[0] + '-pooler';
          poolerU.hostname = parts.join('.');
          config.connectionString = poolerU.toString();
          console.log('[db] Auto-optimized: Neon direct → pooler endpoint');
        }
      } else {
        // Pooler endpoint — derive direct URL
        const directU = new URL(connectionString);
        const parts = directU.hostname.split('.');
        if (parts[0]) {
          parts[0] = parts[0].replace(/-pooler$/, '');
          directU.hostname = parts.join('.');
        }
        config.directUrl = directU.toString();
      }
    }
  } catch {
    // Invalid URL — just pass through as-is
  }

  return config;
}

export function getSupportedDatabases(): { type: DatabaseType; label: string; group: string }[] {
  return [
    { type: 'postgres',    label: 'PostgreSQL',                  group: 'SQL' },
    { type: 'mysql',       label: 'MySQL / MariaDB',             group: 'SQL' },
    { type: 'sqlite',      label: 'SQLite (embedded, dev/small)',group: 'SQL' },
    { type: 'mongodb',     label: 'MongoDB',                     group: 'NoSQL' },
    { type: 'turso',       label: 'Turso (LibSQL, edge)',        group: 'Edge' },
    { type: 'dynamodb',    label: 'DynamoDB (AWS)',              group: 'Cloud' },
    { type: 'supabase',    label: 'Supabase (managed Postgres)', group: 'Cloud' },
    { type: 'neon',        label: 'Neon (serverless Postgres)',  group: 'Cloud' },
    { type: 'planetscale', label: 'PlanetScale (managed MySQL)', group: 'Cloud' },
    { type: 'cockroachdb', label: 'CockroachDB',                group: 'Distributed' },
  ];
}
