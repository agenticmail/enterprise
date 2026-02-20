/**
 * AgenticMail Domain Registry Server
 *
 * Central registry that ensures enterprise domain uniqueness.
 * Hosted by AgenticMail at registry.agenticmail.com.
 *
 * This is a standalone server, separate from the enterprise package.
 * It has its own database storing only: domain, key_hash, dns_challenge, status.
 * No usage data, no telemetry.
 *
 * Supports two backends:
 *   - SQLite (default, for dev/small deployments)
 *   - Postgres (for production, via databaseUrl config)
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { randomBytes, randomUUID } from 'crypto';
import { resolve as dnsResolve } from 'dns/promises';

// ─── Types ──────────────────────────────────────────────

export interface RegistryConfig {
  port: number;
  dbPath: string;
  /** Postgres connection URL. If set, Postgres is used instead of SQLite. */
  databaseUrl?: string;
  rateLimitPerMinute?: number;
}

interface DomainRecord {
  domain: string;
  key_hash: string;
  dns_challenge: string;
  registration_id: string;
  org_name: string | null;
  contact_email: string | null;
  status: string;
  verified_at: string | null;
  registered_at: string;
  last_verify_attempt: string | null;
  verify_attempts: number;
}

// ─── Registry DB Interface ──────────────────────────────

interface RegistryDb {
  getDomain(domain: string): Promise<DomainRecord | null>;
  getDomainStatus(domain: string): Promise<{ status: string; verified_at: string | null } | null>;
  insertDomain(record: { domain: string; keyHash: string; dnsChallenge: string; registrationId: string; orgName: string | null; contactEmail: string | null }): Promise<void>;
  updateDomainPending(record: { domain: string; keyHash: string; dnsChallenge: string; registrationId: string; orgName: string | null; contactEmail: string | null }): Promise<void>;
  setVerified(domain: string): Promise<void>;
  updateVerifyAttempt(domain: string): Promise<void>;
  updateRecovery(domain: string, dnsChallenge: string, registrationId: string): Promise<void>;
  close(): Promise<void>;
}

// ─── SQLite Backend ─────────────────────────────────────

function createSqliteDb(dbPath: string): RegistryDb {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS domain_registrations (
      domain TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      dns_challenge TEXT NOT NULL,
      registration_id TEXT NOT NULL UNIQUE,
      org_name TEXT,
      contact_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending_dns',
      verified_at TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_verify_attempt TEXT,
      verify_attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_dr_status ON domain_registrations(status);
    CREATE INDEX IF NOT EXISTS idx_dr_reg_id ON domain_registrations(registration_id);
  `);

  return {
    async getDomain(domain) {
      return db.prepare('SELECT * FROM domain_registrations WHERE domain = ?').get(domain) as DomainRecord | null;
    },
    async getDomainStatus(domain) {
      const row = db.prepare('SELECT status, verified_at FROM domain_registrations WHERE domain = ?').get(domain) as any;
      return row || null;
    },
    async insertDomain(r) {
      db.prepare(`
        INSERT INTO domain_registrations (domain, key_hash, dns_challenge, registration_id, org_name, contact_email)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(r.domain, r.keyHash, r.dnsChallenge, r.registrationId, r.orgName, r.contactEmail);
    },
    async updateDomainPending(r) {
      db.prepare(`
        UPDATE domain_registrations
        SET key_hash = ?, dns_challenge = ?, registration_id = ?,
            org_name = ?, contact_email = ?, status = 'pending_dns',
            registered_at = datetime('now'), verified_at = NULL,
            verify_attempts = 0
        WHERE domain = ?
      `).run(r.keyHash, r.dnsChallenge, r.registrationId, r.orgName, r.contactEmail, r.domain);
    },
    async setVerified(domain) {
      db.prepare(`
        UPDATE domain_registrations
        SET status = 'verified', verified_at = datetime('now')
        WHERE domain = ?
      `).run(domain);
    },
    async updateVerifyAttempt(domain) {
      db.prepare(`
        UPDATE domain_registrations
        SET last_verify_attempt = datetime('now'), verify_attempts = verify_attempts + 1
        WHERE domain = ?
      `).run(domain);
    },
    async updateRecovery(domain, dnsChallenge, registrationId) {
      db.prepare(`
        UPDATE domain_registrations
        SET dns_challenge = ?, registration_id = ?, status = 'pending_dns',
            verified_at = NULL, verify_attempts = 0
        WHERE domain = ?
      `).run(dnsChallenge, registrationId, domain);
    },
    async close() {
      db.close();
    },
  };
}

// ─── Postgres Backend ───────────────────────────────────

function createPostgresDb(databaseUrl: string): RegistryDb {
  const postgres = require('postgres');
  const sql = postgres(databaseUrl, { max: 10 });

  // Run migrations synchronously on first use
  let migrated = false;
  async function ensureMigrated() {
    if (migrated) return;
    await sql`
      CREATE TABLE IF NOT EXISTS domain_registrations (
        domain TEXT PRIMARY KEY,
        key_hash TEXT NOT NULL,
        dns_challenge TEXT NOT NULL,
        registration_id TEXT NOT NULL UNIQUE,
        org_name TEXT,
        contact_email TEXT,
        status TEXT NOT NULL DEFAULT 'pending_dns',
        verified_at TIMESTAMPTZ,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_verify_attempt TIMESTAMPTZ,
        verify_attempts INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_dr_status ON domain_registrations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dr_reg_id ON domain_registrations(registration_id)`;
    migrated = true;
  }

  function mapRow(row: any): DomainRecord | null {
    if (!row) return null;
    return {
      domain: row.domain,
      key_hash: row.key_hash,
      dns_challenge: row.dns_challenge,
      registration_id: row.registration_id,
      org_name: row.org_name,
      contact_email: row.contact_email,
      status: row.status,
      verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      registered_at: row.registered_at ? new Date(row.registered_at).toISOString() : '',
      last_verify_attempt: row.last_verify_attempt ? new Date(row.last_verify_attempt).toISOString() : null,
      verify_attempts: row.verify_attempts,
    };
  }

  return {
    async getDomain(domain) {
      await ensureMigrated();
      const rows = await sql`SELECT * FROM domain_registrations WHERE domain = ${domain}`;
      return mapRow(rows[0]);
    },
    async getDomainStatus(domain) {
      await ensureMigrated();
      const rows = await sql`SELECT status, verified_at FROM domain_registrations WHERE domain = ${domain}`;
      if (!rows[0]) return null;
      return { status: rows[0].status, verified_at: rows[0].verified_at ? new Date(rows[0].verified_at).toISOString() : null };
    },
    async insertDomain(r) {
      await ensureMigrated();
      await sql`
        INSERT INTO domain_registrations (domain, key_hash, dns_challenge, registration_id, org_name, contact_email)
        VALUES (${r.domain}, ${r.keyHash}, ${r.dnsChallenge}, ${r.registrationId}, ${r.orgName}, ${r.contactEmail})
      `;
    },
    async updateDomainPending(r) {
      await ensureMigrated();
      await sql`
        UPDATE domain_registrations
        SET key_hash = ${r.keyHash}, dns_challenge = ${r.dnsChallenge}, registration_id = ${r.registrationId},
            org_name = ${r.orgName}, contact_email = ${r.contactEmail}, status = 'pending_dns',
            registered_at = NOW(), verified_at = NULL,
            verify_attempts = 0
        WHERE domain = ${r.domain}
      `;
    },
    async setVerified(domain) {
      await ensureMigrated();
      await sql`
        UPDATE domain_registrations
        SET status = 'verified', verified_at = NOW()
        WHERE domain = ${domain}
      `;
    },
    async updateVerifyAttempt(domain) {
      await ensureMigrated();
      await sql`
        UPDATE domain_registrations
        SET last_verify_attempt = NOW(), verify_attempts = verify_attempts + 1
        WHERE domain = ${domain}
      `;
    },
    async updateRecovery(domain, dnsChallenge, registrationId) {
      await ensureMigrated();
      await sql`
        UPDATE domain_registrations
        SET dns_challenge = ${dnsChallenge}, registration_id = ${registrationId}, status = 'pending_dns',
            verified_at = NULL, verify_attempts = 0
        WHERE domain = ${domain}
      `;
    },
    async close() {
      await sql.end();
    },
  };
}

// ─── In-Memory Rate Limiter ─────────────────────────────

class RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  private limit: number;

  constructor(limitPerMinute: number) {
    this.limit = limitPerMinute;
  }

  check(ip: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: this.limit - 1, lastRefill: now };
      this.buckets.set(ip, bucket);
      return true;
    }
    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 60_000; // minutes
    bucket.tokens = Math.min(this.limit, bucket.tokens + elapsed * this.limit);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}

// ─── DNS Verification ───────────────────────────────────

async function verifyDnsTxt(domain: string, expectedChallenge: string): Promise<boolean> {
  const hostname = `_agenticmail-verify.${domain}`;
  try {
    const records = await dnsResolve(hostname, 'TXT');
    for (const record of records) {
      const value = record.join(''); // TXT records can be chunked
      if (value === expectedChallenge) return true;
    }
    return false;
  } catch {
    return false; // NXDOMAIN, timeout, etc.
  }
}

// ─── Create Registry Server ─────────────────────────────

export function createRegistryServer(config: RegistryConfig) {
  const app = new Hono();
  const limiter = new RateLimiter(config.rateLimitPerMinute ?? 20);

  // Lazy DB initialization — Postgres if databaseUrl is set, otherwise SQLite
  let registryDb: RegistryDb | null = null;

  function getDb(): RegistryDb {
    if (!registryDb) {
      registryDb = config.databaseUrl
        ? createPostgresDb(config.databaseUrl)
        : createSqliteDb(config.dbPath);
    }
    return registryDb;
  }

  // ─── Rate Limit Middleware ──────────────────────────

  app.use('*', async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';
    if (!limiter.check(ip)) {
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }
    return next();
  });

  // ─── Health ────────────────────────────────────────

  app.get('/health', (c) => c.json({
    status: 'ok',
    service: 'agenticmail-registry',
    backend: config.databaseUrl ? 'postgres' : 'sqlite',
  }));

  // ─── Register Domain ──────────────────────────────

  app.post('/v1/domains/register', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.domain || !body?.keyHash) {
      return c.json({ error: 'Missing required fields: domain, keyHash' }, 400);
    }

    const domain = String(body.domain).toLowerCase().trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    const d = getDb();
    const existing = await d.getDomain(domain);

    // If domain is already verified, reject
    if (existing?.status === 'verified') {
      return c.json({
        error: 'Domain is already registered and verified. Use the /recover endpoint if this is your domain.',
      }, 409);
    }

    // Generate challenge
    const dnsChallenge = `am-verify=${randomBytes(24).toString('hex')}`;
    const registrationId = randomUUID();

    const record = {
      domain,
      keyHash: body.keyHash,
      dnsChallenge,
      registrationId,
      orgName: body.orgName || null,
      contactEmail: body.contactEmail || null,
    };

    if (existing) {
      await d.updateDomainPending(record);
    } else {
      await d.insertDomain(record);
    }

    return c.json({ registrationId, dnsChallenge }, 201);
  });

  // ─── Verify DNS ───────────────────────────────────

  app.post('/v1/domains/verify', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.domain) {
      return c.json({ error: 'Missing required field: domain' }, 400);
    }

    const domain = String(body.domain).toLowerCase().trim();
    const d = getDb();
    const record = await d.getDomain(domain);

    if (!record) {
      return c.json({ error: 'Domain is not registered' }, 404);
    }

    if (record.status === 'verified') {
      return c.json({ verified: true, verifiedAt: record.verified_at });
    }

    // Update attempt tracking
    await d.updateVerifyAttempt(domain);

    // Check DNS
    const verified = await verifyDnsTxt(domain, record.dns_challenge);

    if (verified) {
      await d.setVerified(domain);
      return c.json({ verified: true });
    }

    return c.json({
      verified: false,
      error: `DNS TXT record not found. Add: _agenticmail-verify.${domain} TXT "${record.dns_challenge}"`,
      attempts: record.verify_attempts + 1,
    });
  });

  // ─── Recover Domain ───────────────────────────────

  app.post('/v1/domains/recover', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.domain || !body?.deploymentKey) {
      return c.json({ error: 'Missing required fields: domain, deploymentKey' }, 400);
    }

    const domain = String(body.domain).toLowerCase().trim();
    const d = getDb();
    const record = await d.getDomain(domain);

    if (!record) {
      return c.json({ error: 'Domain is not registered' }, 404);
    }

    // Verify the deployment key against stored hash
    const { default: bcrypt } = await import('bcryptjs');
    const keyMatch = await bcrypt.compare(body.deploymentKey, record.key_hash);

    if (!keyMatch) {
      return c.json({ error: 'Invalid deployment key' }, 403);
    }

    // Issue new DNS challenge (old one becomes invalid)
    const newChallenge = `am-verify=${randomBytes(24).toString('hex')}`;
    const newRegId = randomUUID();

    await d.updateRecovery(domain, newChallenge, newRegId);

    return c.json({
      success: true,
      registrationId: newRegId,
      dnsChallenge: newChallenge,
    });
  });

  // ─── Domain Status (public) ───────────────────────

  app.get('/v1/domains/:domain/status', async (c) => {
    const domain = c.req.param('domain').toLowerCase().trim();
    const d = getDb();
    const record = await d.getDomainStatus(domain);

    if (!record) {
      return c.json({ registered: false, verified: false });
    }

    return c.json({
      registered: true,
      verified: record.status === 'verified',
    });
  });

  // ─── 404 ──────────────────────────────────────────

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  return {
    app,
    start: () => {
      return new Promise<{ close: () => void }>((resolve) => {
        const server = serve(
          { fetch: app.fetch, port: config.port },
          (info) => {
            const backend = config.databaseUrl ? 'postgres' : `sqlite (${config.dbPath})`;
            console.log(`\n🔒 AgenticMail Domain Registry`);
            console.log(`   API:     http://localhost:${info.port}/v1`);
            console.log(`   Health:  http://localhost:${info.port}/health`);
            console.log(`   Backend: ${backend}`);
            console.log('');

            process.on('SIGINT', async () => {
              console.log('\n⏳ Shutting down registry...');
              if (registryDb) await registryDb.close();
              server.close(() => {
                console.log('✅ Registry shutdown complete');
                process.exit(0);
              });
              setTimeout(() => process.exit(1), 5_000).unref();
            });
            process.on('SIGTERM', () => process.emit('SIGINT' as any));

            resolve({
              close: async () => {
                if (registryDb) await registryDb.close();
                server.close();
              },
            });
          },
        );
      });
    },
  };
}
