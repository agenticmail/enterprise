/**
 * `npx @agenticmail/enterprise serve`
 *
 * Starts the enterprise server headlessly (no interactive wizard).
 * Reads configuration from environment variables:
 *   DATABASE_URL  — Postgres/SQLite connection string (required)
 *   JWT_SECRET    — JWT signing secret (required)
 *   PORT          — HTTP port (default: 8080)
 */

export async function runServe(_args: string[]) {
  const DATABASE_URL = process.env.DATABASE_URL;
  const JWT_SECRET = process.env.JWT_SECRET;
  const PORT = parseInt(process.env.PORT || '8080', 10);

  if (!DATABASE_URL) { console.error('ERROR: DATABASE_URL environment variable is required'); process.exit(1); }
  if (!JWT_SECRET) { console.error('ERROR: JWT_SECRET environment variable is required'); process.exit(1); }

  const { createAdapter } = await import('./db/factory.js');
  const { createServer } = await import('./server.js');

  const db = await createAdapter({
    type: DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite',
    connectionString: DATABASE_URL,
  });

  await db.migrate();

  const server = createServer({
    port: PORT,
    db,
    jwtSecret: JWT_SECRET,
    corsOrigins: ['*'],
  });

  await server.start();
  console.log(`AgenticMail Enterprise server running on :${PORT}`);
}
