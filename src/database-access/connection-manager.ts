/**
 * Database Connection Manager
 * 
 * Manages connection pools for all supported database types.
 * Handles: connection lifecycle, pooling, health checks, SSH tunnels.
 * 
 * All credentials are loaded from the SecureVault — never stored in memory
 * longer than needed for connection establishment.
 */

import type {
  DatabaseType,
  DatabaseConnectionConfig,
  AgentDatabaseAccess,
  DatabaseQuery,
  QueryResult,
  ConnectionPoolStats,
  DatabasePermission,
} from './types.js';
import { sanitizeQuery, classifyQuery, sanitizeForLogging, type SanitizeResult } from './query-sanitizer.js';
import crypto from 'crypto';

// ─── Driver Interfaces ───────────────────────────────────────────────────────

interface DatabaseDriver {
  connect(config: DatabaseConnectionConfig, credentials: ConnectionCredentials): Promise<DatabaseConnection>;
}

interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<{ rows: any[]; fields?: { name: string; type: string }[]; affectedRows?: number }>;
  close(): Promise<void>;
  ping(): Promise<boolean>;
}

interface ConnectionCredentials {
  password?: string;
  connectionString?: string;
  sshPrivateKey?: string;
}

// ─── Connection Pool Entry ───────────────────────────────────────────────────

interface PoolEntry {
  connection: DatabaseConnection;
  connectionId: string;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
  queryCount: number;
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  check(key: string, maxPerMinute: number): boolean {
    const now = Date.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (window.count >= maxPerMinute) return false;
    window.count++;
    return true;
  }
}

// ─── Audit Logger ────────────────────────────────────────────────────────────

interface AuditLogDeps {
  engineDb?: { execute(sql: string, params?: any[]): Promise<any> };
}

// ─── Connection Manager ──────────────────────────────────────────────────────

export class DatabaseConnectionManager {
  private pools = new Map<string, PoolEntry[]>();
  private configs = new Map<string, DatabaseConnectionConfig>();
  private agentAccess = new Map<string, AgentDatabaseAccess[]>(); // agentId → accesses
  private drivers = new Map<DatabaseType, DatabaseDriver>();
  private rateLimiter = new RateLimiter();
  private stats = new Map<string, { queries: number; errors: number; totalTimeMs: number; lastActivity: number }>();
  private engineDb?: { run?(sql: string, params?: any[]): Promise<any>; execute?(sql: string, params?: any[]): Promise<any>; all?(sql: string, params?: any[]): Promise<any[]>; get?(sql: string, params?: any[]): Promise<any> };
  private vault?: {
    storeSecret(orgId: string, name: string, category: string, plaintext: string, metadata?: Record<string, any>): Promise<any>;
    getSecret(orgId: string, name: string, category: string): Promise<{ plaintext: string } | null>;
    deleteSecret(id: string): Promise<void>;
  };

  constructor(deps?: { engineDb?: any; vault?: any }) {
    this.engineDb = deps?.engineDb;
    this.vault = deps?.vault;
    this.registerBuiltinDrivers();
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async setDb(db: any): Promise<void> {
    this.engineDb = db;
    await this.init();
  }

  /** Normalize DB execute — adapters may have run() or execute() */
  private async dbRun(sql: string, params?: any[]): Promise<any> {
    if (!this.engineDb) throw new Error('No database');
    const fn = this.engineDb.run || this.engineDb.execute;
    if (!fn) throw new Error('DB adapter has no run/execute method');
    return fn.call(this.engineDb, sql, params);
  }

  private async dbAll(sql: string, params?: any[]): Promise<any[]> {
    if (!this.engineDb) return [];
    if (this.engineDb.all) return this.engineDb.all(sql, params) as Promise<any[]>;
    // Fallback: execute returns rows for some adapters
    const result = await this.dbRun(sql, params);
    return Array.isArray(result) ? result : [];
  }

  private async dbGet(sql: string, params?: any[]): Promise<any> {
    if (!this.engineDb) return null;
    if (this.engineDb.get) return this.engineDb.get(sql, params);
    const rows = await this.dbAll(sql, params);
    return rows?.[0] || null;
  }

  async init(): Promise<void> {
    await this.ensureTable();
    await this.loadConnections();
    await this.loadAgentAccess();
    console.log(`[db-access] Initialized: ${this.configs.size} connections, ${this.agentAccess.size} agent mappings`);
  }

  private async ensureTable(): Promise<void> {
    if (!this.engineDb) return;
    // Detect dialect: try Postgres-style NOW() first, fall back to SQLite datetime('now')
    let isPostgres = false;
    try {
      await this.dbRun(`SELECT NOW()`);
      isPostgres = true;
    } catch {
      isPostgres = false;
    }
    const now = isPostgres ? 'NOW()' : "(datetime('now'))";
    const jsonType = isPostgres ? 'JSONB' : 'TEXT';
    const boolType = isPostgres ? 'BOOLEAN' : 'INTEGER';
    const boolFalse = isPostgres ? 'FALSE' : '0';
    const boolTrue = isPostgres ? 'TRUE' : '1';
    try {
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS database_connections (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          config ${jsonType} NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'inactive',
          last_tested_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT ${now},
          updated_at TEXT NOT NULL DEFAULT ${now}
        )
      `);
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS agent_database_access (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          connection_id TEXT NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
          permissions TEXT NOT NULL DEFAULT '["read"]',
          query_limits ${jsonType},
          schema_access ${jsonType},
          log_all_queries ${boolType} NOT NULL DEFAULT ${boolFalse},
          require_approval ${boolType} NOT NULL DEFAULT ${boolFalse},
          enabled ${boolType} NOT NULL DEFAULT ${boolTrue},
          created_at TEXT NOT NULL DEFAULT ${now},
          updated_at TEXT NOT NULL DEFAULT ${now},
          UNIQUE(agent_id, connection_id)
        )
      `);
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS database_audit_log (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          agent_name TEXT,
          connection_id TEXT NOT NULL,
          connection_name TEXT,
          operation TEXT NOT NULL,
          query TEXT NOT NULL,
          param_count INTEGER NOT NULL DEFAULT 0,
          rows_affected INTEGER NOT NULL DEFAULT 0,
          execution_time_ms INTEGER NOT NULL DEFAULT 0,
          success ${boolType} NOT NULL DEFAULT ${boolTrue},
          error TEXT,
          timestamp TEXT NOT NULL DEFAULT ${now}
        )
      `);
      // Index for audit log queries
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_db_audit_agent ON database_audit_log(agent_id, timestamp)`).catch(() => {});
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_db_audit_conn ON database_audit_log(connection_id, timestamp)`).catch(() => {});
    } catch (err: any) {
      console.error(`[db-access] Table creation failed:`, err.message);
    }
  }

  private async loadConnections(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.dbAll('SELECT * FROM database_connections');
      for (const row of (rows || [])) {
        const config = this.rowToConfig(row);
        this.configs.set(config.id, config);
      }
    } catch (err: any) {
      console.warn(`[db-access] Failed to load connections: ${err.message}`);
    }
  }

  private async loadAgentAccess(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.dbAll('SELECT * FROM agent_database_access WHERE enabled IS NOT FALSE');
      for (const row of (rows || [])) {
        const access = this.rowToAccess(row);
        const list = this.agentAccess.get(access.agentId) || [];
        list.push(access);
        this.agentAccess.set(access.agentId, list);
      }
    } catch (err: any) {
      console.warn(`[db-access] Failed to load agent access: ${err.message}`);
    }
  }

  // ─── CRUD: Connections ─────────────────────────────────────────────────────

  async createConnection(config: Omit<DatabaseConnectionConfig, 'id' | 'createdAt' | 'updatedAt'>, credentials?: { password?: string; connectionString?: string }): Promise<DatabaseConnectionConfig> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const full: DatabaseConnectionConfig = { ...config, id, createdAt: now, updatedAt: now };

    // Store credentials in vault
    if (credentials?.password && this.vault) {
      await this.vault.storeSecret(config.orgId, `db:${id}:password`, 'database_credential', credentials.password);
    }
    if (credentials?.connectionString && this.vault) {
      await this.vault.storeSecret(config.orgId, `db:${id}:connection_string`, 'database_credential', credentials.connectionString);
    }

    // Store config (without credentials) in DB
    if (this.engineDb) {
      await this.dbRun(
        `INSERT INTO database_connections (id, org_id, name, type, config, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, full.orgId, full.name, full.type, JSON.stringify(this.configToStorable(full)), full.status, now, now]
      );
    }

    this.configs.set(id, full);
    console.log(`[db-access] Connection created: ${full.name} (${full.type})`);
    return full;
  }

  async updateConnection(id: string, updates: Partial<DatabaseConnectionConfig>, credentials?: { password?: string; connectionString?: string }): Promise<DatabaseConnectionConfig | null> {
    const existing = this.configs.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    
    if (credentials?.password && this.vault) {
      await this.vault.storeSecret(existing.orgId, `db:${id}:password`, 'database_credential', credentials.password);
    }
    if (credentials?.connectionString && this.vault) {
      await this.vault.storeSecret(existing.orgId, `db:${id}:connection_string`, 'database_credential', credentials.connectionString);
    }

    if (this.engineDb) {
      await this.dbRun(
        `UPDATE database_connections SET name = ?, type = ?, config = ?, status = ?, updated_at = ? WHERE id = ?`,
        [updated.name, updated.type, JSON.stringify(this.configToStorable(updated)), updated.status, updated.updatedAt, id]
      );
    }

    this.configs.set(id, updated);
    
    // Close existing pool connections on config change
    await this.closePool(id);
    
    return updated;
  }

  async deleteConnection(id: string): Promise<boolean> {
    const config = this.configs.get(id);
    if (!config) return false;

    await this.closePool(id);

    // Remove vault secrets
    if (this.vault) {
      try {
        const pwSecret = await this.vault.getSecret(config.orgId, `db:${id}:password`, 'database_credential');
        if (pwSecret) await this.vault.deleteSecret((pwSecret as any).id);
        const csSecret = await this.vault.getSecret(config.orgId, `db:${id}:connection_string`, 'database_credential');
        if (csSecret) await this.vault.deleteSecret((csSecret as any).id);
      } catch { /* non-fatal */ }
    }

    if (this.engineDb) {
      await this.dbRun('DELETE FROM agent_database_access WHERE connection_id = ?', [id]);
      await this.dbRun('DELETE FROM database_connections WHERE id = ?', [id]);
    }

    this.configs.delete(id);
    // Remove from all agent access lists
    for (const [agentId, list] of this.agentAccess) {
      const filtered = list.filter(a => a.connectionId !== id);
      if (filtered.length === 0) this.agentAccess.delete(agentId);
      else this.agentAccess.set(agentId, filtered);
    }

    console.log(`[db-access] Connection deleted: ${config.name}`);
    return true;
  }

  getConnection(id: string): DatabaseConnectionConfig | undefined {
    return this.configs.get(id);
  }

  listConnections(orgId: string): DatabaseConnectionConfig[] {
    return [...this.configs.values()].filter(c => c.orgId === orgId);
  }

  // ─── CRUD: Agent Access ────────────────────────────────────────────────────

  async grantAccess(access: Omit<AgentDatabaseAccess, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentDatabaseAccess> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const full: AgentDatabaseAccess = { ...access, id, createdAt: now, updatedAt: now };

    if (this.engineDb) {
      await this.dbRun(
        `INSERT INTO agent_database_access (id, org_id, agent_id, connection_id, permissions, query_limits, schema_access, log_all_queries, require_approval, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, full.orgId, full.agentId, full.connectionId,
          JSON.stringify(full.permissions), JSON.stringify(full.queryLimits || null),
          JSON.stringify(full.schemaAccess || null), full.logAllQueries,
          full.requireApproval, full.enabled, now, now,
        ]
      );
    }

    const list = this.agentAccess.get(full.agentId) || [];
    list.push(full);
    this.agentAccess.set(full.agentId, list);

    return full;
  }

  async revokeAccess(agentId: string, connectionId: string): Promise<boolean> {
    if (this.engineDb) {
      await this.dbRun(
        'DELETE FROM agent_database_access WHERE agent_id = ? AND connection_id = ?',
        [agentId, connectionId]
      );
    }

    const list = this.agentAccess.get(agentId) || [];
    const filtered = list.filter(a => a.connectionId !== connectionId);
    if (filtered.length === 0) this.agentAccess.delete(agentId);
    else this.agentAccess.set(agentId, filtered);

    return true;
  }

  async updateAccess(agentId: string, connectionId: string, updates: Partial<AgentDatabaseAccess>): Promise<AgentDatabaseAccess | null> {
    const list = this.agentAccess.get(agentId) || [];
    const idx = list.findIndex(a => a.connectionId === connectionId);
    if (idx === -1) return null;

    const updated = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    list[idx] = updated;
    this.agentAccess.set(agentId, list);

    if (this.engineDb) {
      await this.dbRun(
        `UPDATE agent_database_access SET permissions = ?, query_limits = ?, schema_access = ?, log_all_queries = ?, require_approval = ?, enabled = ?, updated_at = ? WHERE agent_id = ? AND connection_id = ?`,
        [
          JSON.stringify(updated.permissions), JSON.stringify(updated.queryLimits || null),
          JSON.stringify(updated.schemaAccess || null), updated.logAllQueries,
          updated.requireApproval, updated.enabled, updated.updatedAt,
          agentId, connectionId,
        ]
      );
    }

    return updated;
  }

  getAgentAccess(agentId: string): AgentDatabaseAccess[] {
    return this.agentAccess.get(agentId) || [];
  }

  getConnectionAgents(connectionId: string): AgentDatabaseAccess[] {
    const result: AgentDatabaseAccess[] = [];
    for (const list of this.agentAccess.values()) {
      for (const a of list) {
        if (a.connectionId === connectionId) result.push(a);
      }
    }
    return result;
  }

  // ─── Query Execution ──────────────────────────────────────────────────────

  async executeQuery(query: DatabaseQuery): Promise<QueryResult> {
    const startMs = Date.now();
    const queryId = crypto.randomUUID();

    // 1. Validate agent has access to this connection
    const access = this.getAgentAccess(query.agentId).find(a => a.connectionId === query.connectionId && a.enabled);
    if (!access) {
      return { success: false, error: 'Agent does not have access to this database', executionTimeMs: 0, queryId };
    }

    const config = this.configs.get(query.connectionId);
    if (!config || config.status !== 'active') {
      return { success: false, error: 'Database connection is not active', executionTimeMs: 0, queryId };
    }

    // 2. Rate limit check
    const rateLimit = access.queryLimits?.maxQueriesPerMinute ?? 60;
    const rateKey = `${query.agentId}:${query.connectionId}`;
    if (!this.rateLimiter.check(rateKey, rateLimit)) {
      return { success: false, error: `Rate limit exceeded (${rateLimit}/min)`, executionTimeMs: 0, queryId };
    }

    // 3. Sanitize SQL query
    if (!query.sql) {
      return { success: false, error: 'No SQL query provided', executionTimeMs: 0, queryId };
    }

    const sanitizeResult = sanitizeQuery(query.sql, access.permissions, config, access);
    if (!sanitizeResult.allowed) {
      await this.logAudit(query, config, access, 'read', 0, false, sanitizeResult.reason || 'Query blocked', startMs, queryId);
      return { success: false, error: sanitizeResult.reason, executionTimeMs: Date.now() - startMs, queryId };
    }

    const finalSql = sanitizeResult.sanitizedQuery || query.sql;

    // 4. Check concurrent query limit
    const maxConcurrent = access.queryLimits?.maxConcurrentQueries ?? config.queryLimits?.maxConcurrentQueries ?? 5;
    // (In production, track active queries per connection — simplified here)

    // 5. Execute with timeout
    const timeout = access.queryLimits?.queryTimeoutMs ?? config.queryLimits?.queryTimeoutMs ?? 30_000;

    try {
      const conn = await this.getPooledConnection(query.connectionId);
      
      const result = await Promise.race([
        conn.query(finalSql, query.params),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Query timeout')), timeout)),
      ]);

      const execMs = Date.now() - startMs;
      const rows = result.rows || [];
      const affectedRows = result.affectedRows ?? rows.length;

      // Check row limits
      const maxRows = sanitizeResult.operation === 'read'
        ? (access.queryLimits?.maxRowsRead ?? config.queryLimits?.maxRowsRead ?? 10000)
        : sanitizeResult.operation === 'write'
          ? (access.queryLimits?.maxRowsWrite ?? config.queryLimits?.maxRowsWrite ?? 1000)
          : (access.queryLimits?.maxRowsDelete ?? config.queryLimits?.maxRowsDelete ?? 100);

      const truncated = rows.length > maxRows;
      const limitedRows = truncated ? rows.slice(0, maxRows) : rows;

      // Update stats
      this.updateStats(query.connectionId, execMs, false);

      // Audit log
      const shouldLog = access.logAllQueries || sanitizeResult.operation !== 'read';
      if (shouldLog) {
        await this.logAudit(query, config, access, sanitizeResult.operation, affectedRows, true, undefined, startMs, queryId);
      }

      return {
        success: true,
        rows: limitedRows,
        rowCount: limitedRows.length,
        affectedRows,
        fields: result.fields,
        executionTimeMs: execMs,
        truncated,
        queryId,
      };
    } catch (err: any) {
      const execMs = Date.now() - startMs;
      this.updateStats(query.connectionId, execMs, true);
      await this.logAudit(query, config, access, sanitizeResult.operation, 0, false, err.message, startMs, queryId);
      return { success: false, error: err.message, executionTimeMs: execMs, queryId };
    }
  }

  // ─── Connection Testing ────────────────────────────────────────────────────

  async testConnection(connectionId: string): Promise<{ success: boolean; latencyMs: number; error?: string; version?: string }> {
    const config = this.configs.get(connectionId);
    if (!config) return { success: false, latencyMs: 0, error: 'Connection not found' };

    const startMs = Date.now();
    try {
      const conn = await this.getPooledConnection(connectionId);
      const alive = await conn.ping();
      const latencyMs = Date.now() - startMs;

      // Update status
      await this.updateConnection(connectionId, {
        status: alive ? 'active' : 'error',
        lastTestedAt: new Date().toISOString(),
        lastError: alive ? undefined : 'Ping failed',
      });

      return { success: alive, latencyMs };
    } catch (err: any) {
      await this.updateConnection(connectionId, {
        status: 'error',
        lastTestedAt: new Date().toISOString(),
        lastError: err.message,
      });
      return { success: false, latencyMs: Date.now() - startMs, error: err.message };
    }
  }

  // ─── Pool Management ───────────────────────────────────────────────────────

  private async getPooledConnection(connectionId: string): Promise<DatabaseConnection> {
    const pool = this.pools.get(connectionId) || [];
    
    // Find idle connection
    const idle = pool.find(p => !p.inUse);
    if (idle) {
      idle.inUse = true;
      idle.lastUsedAt = Date.now();
      return this.wrapPooledConnection(idle);
    }

    // Create new connection
    const config = this.configs.get(connectionId);
    if (!config) throw new Error('Connection not found');

    const maxPool = config.pool?.max ?? 10;
    if (pool.length >= maxPool) throw new Error('Connection pool exhausted');

    const driver = this.drivers.get(config.type);
    if (!driver) throw new Error(`No driver for database type: ${config.type}`);

    // Load credentials from vault
    const credentials = await this.loadCredentials(config);
    const connection = await driver.connect(config, credentials);

    const entry: PoolEntry = {
      connection,
      connectionId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      inUse: true,
      queryCount: 0,
    };

    pool.push(entry);
    this.pools.set(connectionId, pool);

    return this.wrapPooledConnection(entry);
  }

  private wrapPooledConnection(entry: PoolEntry): DatabaseConnection {
    return {
      query: async (sql, params) => {
        entry.queryCount++;
        return entry.connection.query(sql, params);
      },
      close: async () => { entry.inUse = false; }, // Return to pool, don't actually close
      ping: () => entry.connection.ping(),
    };
  }

  private async closePool(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId) || [];
    for (const entry of pool) {
      try { await entry.connection.close(); } catch { /* ignore */ }
    }
    this.pools.delete(connectionId);
  }

  private async loadCredentials(config: DatabaseConnectionConfig): Promise<ConnectionCredentials> {
    const creds: ConnectionCredentials = {};
    if (this.vault) {
      try {
        const pw = await this.vault.getSecret(config.orgId, `db:${config.id}:password`, 'database_credential');
        if (pw) creds.password = pw.plaintext;
      } catch { /* no password stored */ }
      try {
        const cs = await this.vault.getSecret(config.orgId, `db:${config.id}:connection_string`, 'database_credential');
        if (cs) creds.connectionString = cs.plaintext;
      } catch { /* no connection string stored */ }
      if (config.sshTunnel?.enabled) {
        try {
          const ssh = await this.vault.getSecret(config.orgId, `db:${config.id}:ssh_key`, 'database_credential');
          if (ssh) creds.sshPrivateKey = ssh.plaintext;
        } catch { /* no SSH key stored */ }
      }
    }
    return creds;
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  getPoolStats(connectionId: string): ConnectionPoolStats {
    const pool = this.pools.get(connectionId) || [];
    const s = this.stats.get(connectionId) || { queries: 0, errors: 0, totalTimeMs: 0, lastActivity: 0 };

    return {
      connectionId,
      totalConnections: pool.length,
      activeConnections: pool.filter(p => p.inUse).length,
      idleConnections: pool.filter(p => !p.inUse).length,
      waitingRequests: 0,
      queriesExecuted: s.queries,
      averageQueryTimeMs: s.queries > 0 ? Math.round(s.totalTimeMs / s.queries) : 0,
      errorCount: s.errors,
      lastActivityAt: s.lastActivity ? new Date(s.lastActivity).toISOString() : '',
    };
  }

  private updateStats(connectionId: string, timeMs: number, isError: boolean): void {
    const s = this.stats.get(connectionId) || { queries: 0, errors: 0, totalTimeMs: 0, lastActivity: 0 };
    s.queries++;
    s.totalTimeMs += timeMs;
    if (isError) s.errors++;
    s.lastActivity = Date.now();
    this.stats.set(connectionId, s);
  }

  // ─── Audit Logging ─────────────────────────────────────────────────────────

  private async logAudit(
    query: DatabaseQuery,
    config: DatabaseConnectionConfig,
    access: AgentDatabaseAccess,
    operation: string,
    rowsAffected: number,
    success: boolean,
    error: string | undefined,
    startMs: number,
    queryId: string,
  ): Promise<void> {
    if (!this.engineDb) return;
    try {
      await this.dbRun(
        `INSERT INTO database_audit_log (id, org_id, agent_id, connection_id, connection_name, operation, query, param_count, rows_affected, execution_time_ms, success, error, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queryId, config.orgId, query.agentId, query.connectionId, config.name,
          operation, sanitizeForLogging(query.sql || ''), (query.params || []).length,
          rowsAffected, Date.now() - startMs, success, error || null,
          new Date().toISOString(),
        ]
      );
    } catch (err: any) {
      console.warn(`[db-access] Audit log failed: ${err.message}`);
    }
  }

  async getAuditLog(opts: { orgId: string; agentId?: string; connectionId?: string; limit?: number; offset?: number }): Promise<any[]> {
    if (!this.engineDb) return [];
    const conditions = ['org_id = ?'];
    const params: any[] = [opts.orgId];
    if (opts.agentId) { conditions.push('agent_id = ?'); params.push(opts.agentId); }
    if (opts.connectionId) { conditions.push('connection_id = ?'); params.push(opts.connectionId); }
    params.push(opts.limit ?? 100, opts.offset ?? 0);

    return this.dbAll(
      `SELECT * FROM database_audit_log WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      params
    );
  }

  // ─── Driver Registration ───────────────────────────────────────────────────

  registerDriver(type: DatabaseType, driver: DatabaseDriver): void {
    this.drivers.set(type, driver);
  }

  private registerBuiltinDrivers(): void {
    // PostgreSQL / CockroachDB / Supabase / Neon
    const pgDriver: DatabaseDriver = {
      async connect(config, credentials) {
        if (credentials.connectionString) {
          const pgMod = await import('postgres' as string);
          const pgFn = pgMod.default || pgMod;
          const sql = pgFn(credentials.connectionString, {
            max: config.pool?.max ?? 10,
            idle_timeout: (config.pool?.idleTimeoutMs ?? 30000) / 1000,
            connect_timeout: (config.pool?.acquireTimeoutMs ?? 10000) / 1000,
            ssl: config.ssl ? (config.sslRejectUnauthorized === false ? 'prefer' as any : 'require' as any) : false,
          });
          return {
            async query(q: string, params?: any[]) {
              const result = params?.length
                ? await sql.unsafe(q, params)
                : await sql.unsafe(q);
              return {
                rows: [...result],
                affectedRows: result.count,
                fields: result.columns?.map((c: any) => ({ name: c.name, type: String(c.type) })),
              };
            },
            async close() { await sql.end(); },
            async ping() { try { await sql`SELECT 1`; return true; } catch { return false; } },
          };
        }
        // Fallback: construct connection from parts
        const connStr = `postgresql://${encodeURIComponent(config.username || '')}:${encodeURIComponent(credentials.password || '')}@${config.host || 'localhost'}:${config.port || 5432}/${config.database || 'postgres'}`;
        const pgMod2 = await import('postgres' as string);
        const postgres = pgMod2.default || pgMod2;
        const sql = postgres(connStr, {
          max: config.pool?.max ?? 10,
          ssl: config.ssl ? {} : false,
        });
        return {
          async query(q: string, params?: any[]) {
            const result = params?.length ? await sql.unsafe(q, params) : await sql.unsafe(q);
            return { rows: [...result], affectedRows: result.count };
          },
          async close() { await sql.end(); },
          async ping() { try { await sql`SELECT 1`; return true; } catch { return false; } },
        };
      },
    };

    this.drivers.set('postgresql', pgDriver);
    this.drivers.set('cockroachdb', pgDriver);
    this.drivers.set('supabase', pgDriver);
    this.drivers.set('neon', pgDriver);

    // MySQL / MariaDB / PlanetScale
    const mysqlDriver: DatabaseDriver = {
      async connect(config, credentials) {
        const mysql2 = await import('mysql2/promise' as string);
        const pool = mysql2.createPool({
          host: config.host || 'localhost',
          port: config.port || 3306,
          user: config.username,
          password: credentials.password,
          database: config.database,
          connectionLimit: config.pool?.max ?? 10,
          ssl: config.ssl ? {} : undefined,
          uri: credentials.connectionString || undefined,
        });
        return {
          async query(q: string, params?: any[]) {
            const [rows, fields] = await pool.execute(q, params);
            const resultRows = Array.isArray(rows) ? rows : [];
            return {
              rows: resultRows as any[],
              affectedRows: (rows as any).affectedRows,
              fields: (fields as any[])?.map((f: any) => ({ name: f.name, type: String(f.type) })),
            };
          },
          async close() { await pool.end(); },
          async ping() { try { await pool.execute('SELECT 1'); return true; } catch { return false; } },
        };
      },
    };

    this.drivers.set('mysql', mysqlDriver);
    this.drivers.set('mariadb', mysqlDriver);
    this.drivers.set('planetscale', mysqlDriver);

    // SQLite
    this.drivers.set('sqlite', {
      async connect(config, _credentials) {
        const { default: Database } = await import('better-sqlite3' as string);
        const db = new Database(config.database || ':memory:', { readonly: !config.host });
        return {
          async query(q: string, params?: any[]) {
            try {
              if (q.trim().toUpperCase().startsWith('SELECT') || q.trim().toUpperCase().startsWith('WITH') || q.trim().toUpperCase().startsWith('PRAGMA')) {
                const stmt = db.prepare(q);
                const rows = params?.length ? stmt.all(...params) : stmt.all();
                return { rows, fields: rows.length > 0 ? Object.keys(rows[0]).map(k => ({ name: k, type: 'unknown' })) : [] };
              } else {
                const stmt = db.prepare(q);
                const result = params?.length ? stmt.run(...params) : stmt.run();
                return { rows: [], affectedRows: result.changes };
              }
            } catch (err: any) {
              throw err;
            }
          },
          async close() { db.close(); },
          async ping() { try { db.prepare('SELECT 1').get(); return true; } catch { return false; } },
        };
      },
    });

    // Turso / LibSQL
    this.drivers.set('turso', {
      async connect(config, credentials) {
        const { createClient } = await import('@libsql/client' as string);
        const client = createClient({
          url: credentials.connectionString || `libsql://${config.host}`,
          authToken: credentials.password,
        });
        return {
          async query(q: string, params?: any[]) {
            const result = await client.execute({ sql: q, args: params || [] });
            return {
              rows: result.rows as any[],
              affectedRows: result.rowsAffected,
              fields: result.columns?.map((c: any) => ({ name: String(c), type: 'unknown' })),
            };
          },
          async close() { client.close(); },
          async ping() { try { await client.execute('SELECT 1'); return true; } catch { return false; } },
        };
      },
    });

    // MongoDB
    this.drivers.set('mongodb', {
      async connect(config, credentials) {
        const { MongoClient } = await import('mongodb' as string);
        const uri = credentials.connectionString || `mongodb://${config.username}:${encodeURIComponent(credentials.password || '')}@${config.host || 'localhost'}:${config.port || 27017}/${config.database || 'admin'}`;
        const client = new MongoClient(uri, {
          maxPoolSize: config.pool?.max ?? 10,
          tls: config.ssl || false,
        });
        await client.connect();
        const db = client.db(config.database);
        return {
          async query(q: string, _params?: any[]) {
            // MongoDB queries come as JSON strings: { collection: "users", operation: "find", filter: {...} }
            try {
              const cmd = JSON.parse(q);
              const collection = db.collection(cmd.collection);
              if (cmd.operation === 'find') {
                const cursor = collection.find(cmd.filter || {});
                if (cmd.limit) cursor.limit(cmd.limit);
                if (cmd.sort) cursor.sort(cmd.sort);
                const rows = await cursor.toArray();
                return { rows };
              } else if (cmd.operation === 'insertOne') {
                const result = await collection.insertOne(cmd.document);
                return { rows: [{ insertedId: result.insertedId }], affectedRows: 1 };
              } else if (cmd.operation === 'insertMany') {
                const result = await collection.insertMany(cmd.documents);
                return { rows: [{ insertedCount: result.insertedCount }], affectedRows: result.insertedCount };
              } else if (cmd.operation === 'updateOne' || cmd.operation === 'updateMany') {
                const fn = cmd.operation === 'updateOne' ? collection.updateOne.bind(collection) : collection.updateMany.bind(collection);
                const result = await fn(cmd.filter || {}, cmd.update);
                return { rows: [], affectedRows: result.modifiedCount };
              } else if (cmd.operation === 'deleteOne' || cmd.operation === 'deleteMany') {
                const fn = cmd.operation === 'deleteOne' ? collection.deleteOne.bind(collection) : collection.deleteMany.bind(collection);
                const result = await fn(cmd.filter || {});
                return { rows: [], affectedRows: result.deletedCount };
              } else if (cmd.operation === 'aggregate') {
                const rows = await collection.aggregate(cmd.pipeline || []).toArray();
                return { rows };
              } else if (cmd.operation === 'count') {
                const count = await collection.countDocuments(cmd.filter || {});
                return { rows: [{ count }] };
              }
              throw new Error(`Unknown MongoDB operation: ${cmd.operation}`);
            } catch (err: any) {
              if (err.message.startsWith('Unknown MongoDB')) throw err;
              throw new Error(`MongoDB query error: ${err.message}`);
            }
          },
          async close() { await client.close(); },
          async ping() { try { await db.command({ ping: 1 }); return true; } catch { return false; } },
        };
      },
    });

    // Redis
    this.drivers.set('redis', {
      async connect(config, credentials) {
        // Dynamic import — redis is optional
        const redisUrl = credentials.connectionString || `redis://${config.username ? config.username + ':' : ''}${credentials.password ? credentials.password + '@' : ''}${config.host || 'localhost'}:${config.port || 6379}`;
        // Use a minimal Redis interface via net socket to avoid hard dependency
        const net = await import('net');
        const socket = new net.Socket();
        await new Promise<void>((resolve, reject) => {
          socket.connect(config.port || 6379, config.host || 'localhost', () => resolve());
          socket.on('error', reject);
        });
        if (credentials.password) {
          await sendRedisCommand(socket, `AUTH ${credentials.password}`);
        }

        async function sendRedisCommand(sock: any, cmd: string): Promise<string> {
          return new Promise((resolve, reject) => {
            let data = '';
            const onData = (chunk: Buffer) => { data += chunk.toString(); sock.off('data', onData); resolve(data); };
            sock.on('data', onData);
            sock.write(cmd + '\r\n');
            setTimeout(() => { sock.off('data', onData); reject(new Error('Redis timeout')); }, 5000);
          });
        }

        return {
          async query(q: string) {
            const result = await sendRedisCommand(socket, q);
            return { rows: [{ result: result.trim() }] };
          },
          async close() { socket.destroy(); },
          async ping() { try { const r = await sendRedisCommand(socket, 'PING'); return r.includes('PONG'); } catch { return false; } },
        };
      },
    });
  }

  // ─── Row Mapping ───────────────────────────────────────────────────────────

  private rowToConfig(row: any): DatabaseConnectionConfig {
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      type: row.type,
      ...config,
      status: row.status,
      lastTestedAt: row.last_tested_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToAccess(row: any): AgentDatabaseAccess {
    return {
      id: row.id,
      orgId: row.org_id,
      agentId: row.agent_id,
      connectionId: row.connection_id,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions || ['read']),
      queryLimits: typeof row.query_limits === 'string' ? JSON.parse(row.query_limits) : row.query_limits,
      schemaAccess: typeof row.schema_access === 'string' ? JSON.parse(row.schema_access) : row.schema_access,
      logAllQueries: !!row.log_all_queries,
      requireApproval: !!row.require_approval,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private configToStorable(config: DatabaseConnectionConfig): Record<string, any> {
    // Strip fields stored in their own columns
    const { id, orgId, name, type, status, lastTestedAt, lastError, createdAt, updatedAt, ...rest } = config;
    return rest;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    for (const [connId] of this.pools) {
      await this.closePool(connId);
    }
    console.log('[db-access] All connection pools closed');
  }
}
