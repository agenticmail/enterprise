/**
 * PostgreSQL Database Adapter
 * 
 * Also works with Supabase, Neon, CockroachDB (all PG-compatible).
 * Uses 'pg' driver — user must install: npm install pg
 */

import { randomUUID, createHash } from 'crypto';
import {
  DatabaseAdapter, DatabaseConfig,
  Agent, AgentInput, User, UserInput,
  AuditEvent, AuditFilters, ApiKey, ApiKeyInput,
  EmailRule, RetentionPolicy, CompanySettings,
} from './adapter.js';
import { getAllCreateStatements } from './sql-schema.js';

let pg: any;

async function getPg() {
  if (!pg) {
    const { resolveDriver } = await import('./resolve-driver.js');
    pg = await resolveDriver('pg',
      'PostgreSQL driver not found. Install it: npm install pg\n' +
      'For Supabase/Neon/CockroachDB, the same pg driver works.'
    );
  }
  return pg;
}

export class PostgresAdapter extends DatabaseAdapter {
  readonly type = 'postgres' as const;
  private pool: any = null;
  private ended = false;

  async connect(config: DatabaseConfig): Promise<void> {
    this.ended = false;
    const { Pool } = await getPg();

    // ── Smart pool sizing ──────────────────────────────
    // Detect if using PgBouncer/Supabase pooler (port 6543) vs direct (5432)
    // and auto-configure pool size accordingly.
    const port = config.port || (config.connectionString ? new URL(config.connectionString).port : '5432');
    const isPgBouncer = String(port) === '6543' || String(port) === '5433';

    // Pool size logic:
    // - PgBouncer (Supabase pooler): conservative — shared across processes
    //   Supabase pooler limits: Free=15, Pro=15-50 per-role pool_size
    //   With N agent processes + 1 server, use max = floor(15 / (N+1)) minimum 3
    // - Direct connection: more generous
    // - Override via DB_POOL_MAX env var
    const envMax = process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 0;
    const defaultMax = isPgBouncer ? 4 : 10;
    const poolMax = envMax || defaultMax;

    // PgBouncer transaction mode: short idle timeout to release connections fast
    const idleTimeout = isPgBouncer ? 5000 : 30000;

    this.pool = new Pool({
      connectionString: config.connectionString,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: poolMax,
      idleTimeoutMillis: idleTimeout,
      connectionTimeoutMillis: 15000,
      // PgBouncer doesn't support prepared statements in transaction mode
      ...(isPgBouncer ? { allowExitOnIdle: true } : {}),
    });

    // Handle pool errors gracefully (don't crash on transient connection issues)
    this.pool.on('error', (err: any) => {
      if (this.ended) return;
      // XX000 = Supabase connection limit — log but don't crash
      if (err.code === 'XX000' || err.code === '53300' || err.code === '57P01') {
        console.warn(`[postgres] Pool connection error (${err.code}): ${err.message?.slice(0, 100) || 'unknown'} — will retry`);
      } else {
        console.error(`[postgres] Unexpected pool error:`, err.message?.slice(0, 200));
      }
    });

    // Test connection
    const client = await this.pool.connect();
    client.release();

    console.log(`[postgres] Connected (pool: max=${poolMax}, idle=${idleTimeout}ms, pgbouncer=${isPgBouncer})`);
  }

  async disconnect(): Promise<void> {
    this.ended = true;
    if (this.pool) {
      try { await this.pool.end(); } catch {}
    }
  }

  isConnected(): boolean {
    return this.pool !== null && !this.ended;
  }

  /**
   * Execute a query with automatic retry on transient connection errors.
   * Retries once after a 500ms delay for: connection limit exceeded (XX000, 53300),
   * admin shutdown (57P01), connection refused, client already released.
   */
  private async _query(sql: string, params?: any[]): Promise<any> {
    const RETRYABLE = new Set(['XX000', '53300', '57P01', 'ECONNREFUSED', 'ECONNRESET', '57P03']);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.pool.query(sql, params);
      } catch (err: any) {
        const code = err.code || '';
        const msg = err.message || '';
        const isRetryable = RETRYABLE.has(code) || msg.includes('remaining connection') || msg.includes('terminating connection') || msg.includes('Connection terminated');
        if (isRetryable && attempt === 0) {
          await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
          continue;
        }
        throw err;
      }
    }
  }

  // ─── Engine Integration ──────────────────────────────────

  getEngineDB() {
    if (!this.pool || this.ended) return null;
    const pool = this.pool;
    const self = this;
    // Convert ? placeholders to $1, $2, ... for pg driver
    const pgSql = (sql: string) => {
      let i = 0;
      return sql.replace(/\?/g, () => `$${++i}`);
    };
    return {
      run: async (sql: string, params?: any[]) => { if (self.ended) return; await self._query(pgSql(sql), params); },
      get: async <T = any>(sql: string, params?: any[]): Promise<T | undefined> => {
        if (self.ended) return undefined;
        const result = await self._query(pgSql(sql), params);
        return result.rows[0] as T | undefined;
      },
      all: async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
        if (self.ended) return [];
        const result = await self._query(pgSql(sql), params);
        return result.rows as T[];
      },
    };
  }

  getDialect(): string {
    return 'postgres';
  }

  async migrate(): Promise<void> {
    const stmts = getAllCreateStatements();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of stmts) {
        await client.query(stmt);
      }
      // Seed retention policy
      await client.query(`
        INSERT INTO retention_policy (id) VALUES ('default')
        ON CONFLICT (id) DO NOTHING
      `);
      // Add org_id column if missing
      await client.query(`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS org_id TEXT
      `).catch(() => {});
      await client.query(`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS cf_api_token TEXT;
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS cf_account_id TEXT;
      `).catch(() => {});
      await client.query(`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS org_email_config JSONB;
      `).catch(() => {});
      // Platform capabilities column
      await client.query(`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS platform_capabilities JSONB;
      `).catch(() => {});
      // Branding assets config
      await client.query(`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS branding JSONB;
      `).catch(() => {});
      // 2FA / TOTP columns on users
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '"*"';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS client_org_id TEXT;
        ALTER TABLE agents ADD COLUMN IF NOT EXISTS billing_rate NUMERIC(10,2) DEFAULT 0;
      `).catch(() => {});
      // ─── Client Organizations ────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS client_organizations (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          contact_name TEXT,
          contact_email TEXT,
          description TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query(`
        ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS billing_rate_per_agent NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
        ALTER TABLE agents ADD COLUMN IF NOT EXISTS client_org_id TEXT REFERENCES client_organizations(id);

        CREATE TABLE IF NOT EXISTS org_billing_records (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id TEXT NOT NULL REFERENCES client_organizations(id) ON DELETE CASCADE,
          agent_id TEXT,
          month TEXT NOT NULL,
          revenue NUMERIC(10,2) DEFAULT 0,
          token_cost NUMERIC(10,4) DEFAULT 0,
          input_tokens BIGINT DEFAULT 0,
          output_tokens BIGINT DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(org_id, agent_id, month)
        );
      `).catch(() => {});
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_knowledge_access (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id TEXT NOT NULL,
          knowledge_base_id TEXT NOT NULL,
          access_type TEXT NOT NULL DEFAULT 'read',
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(agent_id, knowledge_base_id)
        );
      `);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Company ─────────────────────────────────────────────

  async getSettings(): Promise<CompanySettings> {
    const { rows } = await this._query(
      'SELECT * FROM company_settings WHERE id = $1', ['default']
    );
    return rows[0] ? this.mapSettings(rows[0]) : null!;
  }

  async updateSettings(updates: Partial<CompanySettings>): Promise<CompanySettings> {
    // Ensure default row exists first
    await this.pool.query(
      `INSERT INTO company_settings (id, name, subdomain) VALUES ('default', '', '')
       ON CONFLICT (id) DO NOTHING`
    );

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    const map: Record<string, string> = {
      name: 'name', orgId: 'org_id', domain: 'domain', subdomain: 'subdomain',
      smtpHost: 'smtp_host', smtpPort: 'smtp_port', smtpUser: 'smtp_user',
      smtpPass: 'smtp_pass', dkimPrivateKey: 'dkim_private_key',
      logoUrl: 'logo_url', primaryColor: 'primary_color', plan: 'plan',
      deploymentKeyHash: 'deployment_key_hash',
      domainRegistrationId: 'domain_registration_id',
      domainDnsChallenge: 'domain_dns_challenge',
      domainVerifiedAt: 'domain_verified_at',
      domainRegisteredAt: 'domain_registered_at',
      domainStatus: 'domain_status',
      useRootDomain: 'use_root_domain',
      cfApiToken: 'cf_api_token',
      cfAccountId: 'cf_account_id',
      signatureTemplate: 'signature_template',
    };
    for (const [key, col] of Object.entries(map)) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${col} = $${i}`);
        values.push((updates as any)[key]);
        i++;
      }
    }
    if (updates.ssoConfig !== undefined) {
      fields.push(`sso_config = $${i}`);
      values.push(JSON.stringify(updates.ssoConfig));
      i++;
    }
    if (updates.toolSecurityConfig !== undefined) {
      fields.push(`tool_security_config = $${i}`);
      values.push(JSON.stringify(updates.toolSecurityConfig));
      i++;
    }
    if (updates.firewallConfig !== undefined) {
      fields.push(`firewall_config = $${i}`);
      values.push(JSON.stringify(updates.firewallConfig));
      i++;
    }
    if (updates.modelPricingConfig !== undefined) {
      fields.push(`model_pricing_config = $${i}`);
      values.push(JSON.stringify(updates.modelPricingConfig));
      i++;
    }
    if (updates.securityConfig !== undefined) {
      fields.push(`security_config = $${i}`);
      values.push(JSON.stringify(updates.securityConfig));
      i++;
    }
    if (updates.orgEmailConfig !== undefined) {
      fields.push(`org_email_config = $${i}`);
      values.push(JSON.stringify(updates.orgEmailConfig));
      i++;
    }
    if ((updates as any).platformCapabilities !== undefined) {
      fields.push(`platform_capabilities = $${i}`);
      values.push(JSON.stringify((updates as any).platformCapabilities));
      i++;
    }
    if ((updates as any).branding !== undefined) {
      fields.push(`branding = $${i}`);
      values.push(JSON.stringify((updates as any).branding));
      i++;
    }
    fields.push(`updated_at = NOW()`);
    values.push('default');
    const { rows } = await this.pool.query(
      `UPDATE company_settings SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return this.mapSettings(rows[0]);
  }

  // ─── Agents ──────────────────────────────────────────────

  async createAgent(input: AgentInput): Promise<Agent> {
    const id = input.id || randomUUID();
    const email = input.email || `${input.name.toLowerCase().replace(/\s+/g, '-')}@localhost`;
    const { rows } = await this.pool.query(
      `INSERT INTO agents (id, name, email, role, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, input.name, email, input.role || 'assistant', JSON.stringify(input.metadata || {}), input.createdBy]
    );
    return this.mapAgent(rows[0]);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const { rows } = await this.pool.query('SELECT * FROM agents WHERE id = $1', [id]);
    return rows[0] ? this.mapAgent(rows[0]) : null;
  }

  async getAgentByName(name: string): Promise<Agent | null> {
    const { rows } = await this.pool.query('SELECT * FROM agents WHERE name = $1', [name]);
    return rows[0] ? this.mapAgent(rows[0]) : null;
  }

  async listAgents(opts?: { status?: string; limit?: number; offset?: number }): Promise<Agent[]> {
    let q = 'SELECT * FROM agents';
    const params: any[] = [];
    if (opts?.status) { q += ' WHERE status = $1'; params.push(opts.status); }
    q += ' ORDER BY created_at DESC';
    if (opts?.limit) { q += ` LIMIT ${opts.limit}`; }
    if (opts?.offset) { q += ` OFFSET ${opts.offset}`; }
    const { rows } = await this.pool.query(q, params);
    return rows.map((r: any) => this.mapAgent(r));
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [key, col] of Object.entries({ name: 'name', email: 'email', role: 'role', status: 'status' })) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${col} = $${i}`);
        values.push((updates as any)[key]);
        i++;
      }
    }
    if (updates.metadata) {
      fields.push(`metadata = $${i}`);
      values.push(JSON.stringify(updates.metadata));
      i++;
    }
    if (updates.securityOverrides !== undefined) {
      fields.push(`security_overrides = $${i}`);
      values.push(JSON.stringify(updates.securityOverrides));
      i++;
    }
    fields.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return this.mapAgent(rows[0]);
  }

  async archiveAgent(id: string): Promise<void> {
    await this.pool.query("UPDATE agents SET status = 'archived', updated_at = NOW() WHERE id = $1", [id]);
  }

  async deleteAgent(id: string): Promise<void> {
    await this.pool.query('DELETE FROM agents WHERE id = $1', [id]);
  }

  async countAgents(status?: string): Promise<number> {
    const q = status
      ? await this.pool.query('SELECT COUNT(*) FROM agents WHERE status = $1', [status])
      : await this.pool.query('SELECT COUNT(*) FROM agents');
    return parseInt(q.rows[0].count, 10);
  }

  // ─── Users ───────────────────────────────────────────────

  async createUser(input: UserInput): Promise<User> {
    const id = randomUUID();
    let passwordHash: string | null = null;
    if (input.password) {
      const { default: bcrypt } = await import('bcryptjs');
      passwordHash = await bcrypt.hash(input.password, 12);
    }
    const { rows } = await this.pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, sso_provider, sso_subject)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, input.email, input.name, input.role, passwordHash, input.ssoProvider || null, input.ssoSubject || null]
    );
    return this.mapUser(rows[0]);
  }

  async getUser(id: string): Promise<User | null> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async getUserBySso(provider: string, subject: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE sso_provider = $1 AND sso_subject = $2',
      [provider, subject]
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]> {
    let q = 'SELECT * FROM users ORDER BY created_at DESC';
    if (opts?.limit) q += ` LIMIT ${opts.limit}`;
    if (opts?.offset) q += ` OFFSET ${opts.offset}`;
    const { rows } = await this.pool.query(q);
    return rows.map((r: any) => this.mapUser(r));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const key of ['email', 'name', 'role', 'sso_provider', 'sso_subject', 'totp_secret', 'totp_enabled', 'totp_backup_codes', 'last_login_at'] as const) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if ((updates as any)[camelKey] !== undefined) {
        fields.push(`${key} = $${i}`);
        values.push((updates as any)[camelKey]);
        i++;
      }
    }
    fields.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return this.mapUser(rows[0]);
  }

  async deleteUser(id: string): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  // ─── Audit ───────────────────────────────────────────────

  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log (id, actor, actor_type, action, resource, details, ip, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), event.actor, event.actorType, event.action, event.resource,
       JSON.stringify(event.details || {}), event.ip || null, event.orgId || null]
    );
  }

  async queryAudit(filters: AuditFilters): Promise<{ events: AuditEvent[]; total: number }> {
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (filters.actor) { where.push(`actor = $${i++}`); params.push(filters.actor); }
    if (filters.action) { where.push(`action = $${i++}`); params.push(filters.action); }
    if (filters.resource) { where.push(`resource LIKE $${i++}`); params.push(`%${filters.resource}%`); }
    if (filters.orgId) { where.push(`org_id = $${i++}`); params.push(filters.orgId); }
    if (filters.from) { where.push(`timestamp >= $${i++}`); params.push(filters.from); }
    if (filters.to) { where.push(`timestamp <= $${i++}`); params.push(filters.to); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await this.pool.query(`SELECT COUNT(*) FROM audit_log ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    let q = `SELECT * FROM audit_log ${whereClause} ORDER BY timestamp DESC`;
    if (filters.limit) q += ` LIMIT ${filters.limit}`;
    if (filters.offset) q += ` OFFSET ${filters.offset}`;
    const { rows } = await this.pool.query(q, params);

    return {
      events: rows.map((r: any) => ({
        id: r.id, timestamp: r.timestamp, actor: r.actor, actorType: r.actor_type,
        action: r.action, resource: r.resource, details: typeof r.details === 'string' ? JSON.parse(r.details || '{}') : (r.details || {}), ip: r.ip,
      })),
      total,
    };
  }

  // ─── API Keys ────────────────────────────────────────────

  async createApiKey(input: ApiKeyInput): Promise<{ key: ApiKey; plaintext: string }> {
    const id = randomUUID();
    const plaintext = `ek_${randomUUID().replace(/-/g, '')}`;
    const keyHash = createHash('sha256').update(plaintext).digest('hex');
    const keyPrefix = plaintext.substring(0, 11); // "ek_" + 8 chars
    const { rows } = await this.pool.query(
      `INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, input.name, keyHash, keyPrefix, JSON.stringify(input.scopes), input.createdBy, input.expiresAt || null]
    );
    return { key: this.mapApiKey(rows[0]), plaintext };
  }

  async getApiKey(id: string): Promise<ApiKey | null> {
    const { rows } = await this.pool.query('SELECT * FROM api_keys WHERE id = $1', [id]);
    return rows[0] ? this.mapApiKey(rows[0]) : null;
  }

  async validateApiKey(plaintext: string): Promise<ApiKey | null> {
    const keyHash = createHash('sha256').update(plaintext).digest('hex');
    const { rows } = await this.pool.query(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND (revoked IS NULL OR revoked = 0)',
      [keyHash]
    );
    if (!rows[0]) return null;
    const key = this.mapApiKey(rows[0]);
    if (key.expiresAt && new Date() > key.expiresAt) return null;
    // Update last used
    await this.pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]);
    return key;
  }

  async listApiKeys(opts?: { createdBy?: string }): Promise<ApiKey[]> {
    let q = 'SELECT * FROM api_keys WHERE (revoked IS NULL OR revoked = 0)';
    const params: any[] = [];
    if (opts?.createdBy) { q += ' AND created_by = $' + (params.length + 1); params.push(opts.createdBy); }
    q += ' ORDER BY created_at DESC';
    const { rows } = await this.pool.query(q, params);
    return rows.map((r: any) => this.mapApiKey(r));
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.pool.query('UPDATE api_keys SET revoked = 1 WHERE id = $1', [id]);
  }

  // ─── Rules ───────────────────────────────────────────────

  async createRule(rule: Omit<EmailRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<EmailRule> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO email_rules (id, name, agent_id, conditions, actions, priority, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, rule.name, rule.agentId || null, JSON.stringify(rule.conditions), JSON.stringify(rule.actions),
       rule.priority, rule.enabled ? 1 : 0]
    );
    return this.mapRule(rows[0]);
  }

  async getRules(agentId?: string): Promise<EmailRule[]> {
    let q = 'SELECT * FROM email_rules';
    const params: any[] = [];
    if (agentId) { q += ' WHERE agent_id = $1 OR agent_id IS NULL'; params.push(agentId); }
    q += ' ORDER BY priority DESC';
    const { rows } = await this.pool.query(q, params);
    return rows.map((r: any) => this.mapRule(r));
  }

  async updateRule(id: string, updates: Partial<EmailRule>): Promise<EmailRule> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (updates.name !== undefined) { fields.push(`name = $${i++}`); values.push(updates.name); }
    if (updates.conditions) { fields.push(`conditions = $${i++}`); values.push(JSON.stringify(updates.conditions)); }
    if (updates.actions) { fields.push(`actions = $${i++}`); values.push(JSON.stringify(updates.actions)); }
    if (updates.priority !== undefined) { fields.push(`priority = $${i++}`); values.push(updates.priority); }
    if (updates.enabled !== undefined) { fields.push(`enabled = $${i++}`); values.push(updates.enabled ? 1 : 0); }
    fields.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE email_rules SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return this.mapRule(rows[0]);
  }

  async deleteRule(id: string): Promise<void> {
    await this.pool.query('DELETE FROM email_rules WHERE id = $1', [id]);
  }

  // ─── Retention ───────────────────────────────────────────

  async getRetentionPolicy(): Promise<RetentionPolicy> {
    const { rows } = await this.pool.query('SELECT * FROM retention_policy WHERE id = $1', ['default']);
    if (!rows[0]) return { enabled: false, retainDays: 365, archiveFirst: true };
    return {
      enabled: !!rows[0].enabled,
      retainDays: rows[0].retain_days,
      excludeTags: typeof rows[0].exclude_tags === 'string' ? JSON.parse(rows[0].exclude_tags || '[]') : (rows[0].exclude_tags || []),
      archiveFirst: !!rows[0].archive_first,
    };
  }

  async setRetentionPolicy(policy: RetentionPolicy): Promise<void> {
    await this.pool.query(
      `UPDATE retention_policy SET enabled = $1, retain_days = $2, exclude_tags = $3, archive_first = $4
       WHERE id = 'default'`,
      [policy.enabled ? 1 : 0, policy.retainDays, JSON.stringify(policy.excludeTags || []), policy.archiveFirst ? 1 : 0]
    );
  }

  // ─── Stats ───────────────────────────────────────────────

  async getStats() {
    const [agents, active, users, audit] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM agents'),
      this.pool.query("SELECT COUNT(*) FROM agents WHERE status = 'active'"),
      this.pool.query('SELECT COUNT(*) FROM users'),
      this.pool.query('SELECT COUNT(*) FROM audit_log'),
    ]);
    return {
      totalAgents: parseInt(agents.rows[0].count, 10),
      activeAgents: parseInt(active.rows[0].count, 10),
      totalUsers: parseInt(users.rows[0].count, 10),
      totalEmails: 0, // TODO: wire to email storage
      totalAuditEvents: parseInt(audit.rows[0].count, 10),
    };
  }

  // ─── Security Events ─────────────────────────────────────

  async logSecurityEvent(event: { 
    eventType: string; 
    severity: string; 
    agentId?: string; 
    details: Record<string, any>; 
    sourceIp?: string; 
  }): Promise<void> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO security_events (id, event_type, severity, agent_id, details, source_ip) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, event.eventType, event.severity, event.agentId, JSON.stringify(event.details), event.sourceIp]
    );
  }

  async getSecurityEvents(filter: {
    eventType?: string[];
    severity?: string[];
    agentId?: string;
    sourceIp?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    let query = 'SELECT * FROM security_events WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.eventType && filter.eventType.length > 0) {
      query += ` AND event_type = ANY($${paramIndex++})`;
      params.push(filter.eventType);
    }

    if (filter.severity && filter.severity.length > 0) {
      query += ` AND severity = ANY($${paramIndex++})`;
      params.push(filter.severity);
    }

    if (filter.agentId) {
      query += ` AND agent_id = $${paramIndex++}`;
      params.push(filter.agentId);
    }

    if (filter.sourceIp) {
      query += ` AND source_ip = $${paramIndex++}`;
      params.push(filter.sourceIp);
    }

    if (filter.fromDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filter.fromDate);
    }

    if (filter.toDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filter.toDate);
    }

    query += ' ORDER BY created_at DESC';

    if (filter.limit) {
      query += ` LIMIT ${filter.limit}`;
    }

    if (filter.offset) {
      query += ` OFFSET ${filter.offset}`;
    }

    const { rows } = await this.pool.query(query, params);
    return rows.map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      severity: row.severity,
      agentId: row.agent_id,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      sourceIp: row.source_ip,
      timestamp: row.created_at
    }));
  }

  // ─── Mappers ─────────────────────────────────────────────

  private mapAgent(r: any): Agent {
    return {
      id: r.id, name: r.name, email: r.email, role: r.role, status: r.status,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      securityOverrides: r.security_overrides ? (typeof r.security_overrides === 'string' ? JSON.parse(r.security_overrides) : r.security_overrides) : undefined,
      createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at), createdBy: r.created_by,
      client_org_id: r.client_org_id || null,
    };
  }

  private mapUser(r: any): User {
    return {
      id: r.id, email: r.email, name: r.name, role: r.role,
      passwordHash: r.password_hash, ssoProvider: r.sso_provider, ssoSubject: r.sso_subject,
      totpSecret: r.totp_secret, totpEnabled: !!r.totp_enabled, totpBackupCodes: r.totp_backup_codes,
      permissions: r.permissions != null ? (typeof r.permissions === 'string' ? (() => { try { return JSON.parse(r.permissions); } catch { return '*'; } })() : r.permissions) : '*',
      mustResetPassword: !!r.must_reset_password,
      isActive: r.is_active !== false && r.is_active !== 0, // default true
      clientOrgId: r.client_org_id || null,
      createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : undefined,
    };
  }

  private mapApiKey(r: any): ApiKey {
    return {
      id: r.id, name: r.name, keyHash: r.key_hash, keyPrefix: r.key_prefix,
      scopes: typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes,
      createdBy: r.created_by, createdAt: new Date(r.created_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : undefined,
      expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
      revoked: !!r.revoked,
    };
  }

  private mapRule(r: any): EmailRule {
    return {
      id: r.id, name: r.name, agentId: r.agent_id,
      conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
      actions: typeof r.actions === 'string' ? JSON.parse(r.actions) : r.actions,
      priority: r.priority, enabled: !!r.enabled,
      createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
    };
  }

  private mapSettings(r: any): CompanySettings {
    return {
      id: r.id, orgId: r.org_id || undefined, name: r.name, domain: r.domain, subdomain: r.subdomain,
      smtpHost: r.smtp_host, smtpPort: r.smtp_port, smtpUser: r.smtp_user, smtpPass: r.smtp_pass,
      dkimPrivateKey: r.dkim_private_key, logoUrl: r.logo_url, primaryColor: r.primary_color,
      ssoConfig: r.sso_config ? (typeof r.sso_config === 'string' ? JSON.parse(r.sso_config) : r.sso_config) : undefined,
      toolSecurityConfig: r.tool_security_config ? (typeof r.tool_security_config === 'string' ? JSON.parse(r.tool_security_config) : r.tool_security_config) : {},
      firewallConfig: r.firewall_config ? (typeof r.firewall_config === 'string' ? JSON.parse(r.firewall_config) : r.firewall_config) : {},
      securityConfig: r.security_config ? (typeof r.security_config === 'string' ? JSON.parse(r.security_config) : r.security_config) : {},
      modelPricingConfig: r.model_pricing_config ? (typeof r.model_pricing_config === 'string' ? JSON.parse(r.model_pricing_config) : r.model_pricing_config) : {},
      plan: r.plan, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
      deploymentKeyHash: r.deployment_key_hash,
      domainRegistrationId: r.domain_registration_id,
      domainDnsChallenge: r.domain_dns_challenge,
      domainVerifiedAt: r.domain_verified_at || undefined,
      domainRegisteredAt: r.domain_registered_at || undefined,
      domainStatus: r.domain_status || 'unregistered',
      useRootDomain: r.use_root_domain || false,
      cfApiToken: r.cf_api_token || undefined,
      cfAccountId: r.cf_account_id || undefined,
      orgEmailConfig: r.org_email_config ? (typeof r.org_email_config === 'string' ? JSON.parse(r.org_email_config) : r.org_email_config) : undefined,
      platformCapabilities: r.platform_capabilities ? (typeof r.platform_capabilities === 'string' ? JSON.parse(r.platform_capabilities) : r.platform_capabilities) : undefined,
      signatureTemplate: r.signature_template || undefined,
      branding: r.branding ? (typeof r.branding === 'string' ? JSON.parse(r.branding) : r.branding) : undefined,
    } as any;
  }
}
