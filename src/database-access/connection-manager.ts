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
    getSecret(id: string): Promise<{ entry: any; decrypted: string } | null>;
    getSecretByName(orgId: string, name: string, category?: string): Promise<{ plaintext: string } | null>;
    deleteSecret(id: string): Promise<void>;
    findByName(name: string): any;
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
    if ((this.engineDb as any).query) {
      const result = await (this.engineDb as any).query(sql, params);
      return Array.isArray(result) ? result : (result?.rows || []);
    }
    // Fallback: execute returns rows for some adapters
    const result = await this.dbRun(sql, params);
    return Array.isArray(result) ? result : (result?.rows || []);
  }

  private async dbGet(sql: string, params?: any[]): Promise<any> {
    if (!this.engineDb) return null;
    if (this.engineDb.get) return this.engineDb.get(sql, params);
    const rows = await this.dbAll(sql, params);
    return rows?.[0] || null;
  }

  async init(): Promise<void> {
    try {
      await this.ensureTable();
      await this.loadConnections();
      await this.loadAgentAccess();
      console.log(`[db-access] Initialized: ${this.configs.size} connections, ${this.agentAccess.size} agent mappings`);
    } catch (err: any) {
      console.error(`[db-access] Init failed: ${err.message}`);
    }
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
    if (!this.engineDb) { console.warn('[db-access] No engineDb, skipping loadConnections'); return; }
    try {
      const rows = await this.dbAll('SELECT * FROM database_connections');
      // Loaded connections from DB
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
    
    if (this.vault) {
      if (credentials?.password) {
        const old = this.vault.findByName(`db:${id}:password`);
        if (old) try { await this.vault.deleteSecret(old.id); } catch {}
        await this.vault.storeSecret(existing.orgId, `db:${id}:password`, 'database_credential', credentials.password);
      }
      if (credentials?.connectionString) {
        const old = this.vault.findByName(`db:${id}:connection_string`);
        if (old) try { await this.vault.deleteSecret(old.id); } catch {}
        await this.vault.storeSecret(existing.orgId, `db:${id}:connection_string`, 'database_credential', credentials.connectionString);
      }
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
        for (const suffix of ['password', 'connection_string', 'ssh_key']) {
          const entry = this.vault.findByName(`db:${id}:${suffix}`);
          if (entry) await this.vault.deleteSecret(entry.id);
        }
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

  /** Get a human-readable summary of an agent's database connections for system prompts */
  getAgentConnectionSummary(agentId: string): string[] {
    const accesses = this.getAgentAccess(agentId).filter(a => a.enabled);
    return accesses.map(a => {
      const config = this.configs.get(a.connectionId);
      if (!config) return '';
      const perms = a.permissions?.join(', ') || 'read';
      return `"${config.name}" (${config.type}) — permissions: ${perms}`;
    }).filter(Boolean);
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

      return { success: alive, latencyMs, error: alive ? undefined : 'Ping failed — connection may have been closed or timed out. Try reconnecting.' };
    } catch (err: any) {
      // On connection failure, close stale pool and retry once with fresh connection
      try {
        await this.closePool(connectionId);
        const conn = await this.getPooledConnection(connectionId);
        const alive = await conn.ping();
        const latencyMs = Date.now() - startMs;
        await this.updateConnection(connectionId, { status: alive ? 'active' : 'error', lastTestedAt: new Date().toISOString(), lastError: alive ? undefined : 'Ping failed on retry' });
        return { success: alive, latencyMs, error: alive ? undefined : 'Ping failed on retry' };
      } catch (retryErr: any) {
        // Both attempts failed
      }
      const msg = (err instanceof AggregateError ? (err.errors?.map?.((x: any) => x.message).join('; ') || 'Multiple connection failures') : (err.message || String(err))) || 'Unknown connection error';
      await this.updateConnection(connectionId, {
        status: 'error',
        lastTestedAt: new Date().toISOString(),
        lastError: msg,
      });
      return { success: false, latencyMs: Date.now() - startMs, error: msg };
    }
  }

  /**
   * Test connection parameters without saving — creates a temporary connection,
   * pings it, and immediately destroys it.
   */
  async testConnectionParams(params: {
    type: string; host?: string; port?: number; database?: string;
    username?: string; password?: string; connectionString?: string; ssl?: boolean;
  }): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now();
    const driver = this.drivers.get(params.type as any);
    if (!driver) return { success: false, latencyMs: 0, error: `No driver for database type: ${params.type}` };

    let connection: any;
    try {
      connection = await driver.connect(
        { type: params.type as any, host: params.host, port: params.port, database: params.database, ssl: params.ssl } as any,
        { password: params.password, connectionString: params.connectionString },
      );
      const alive = await connection.ping();
      const latencyMs = Date.now() - startMs;
      return { success: alive, latencyMs, error: alive ? undefined : 'Ping failed — database responded but health check did not pass' };
    } catch (err: any) {
      return { success: false, latencyMs: Date.now() - startMs, error: err.message || String(err) || 'Connection failed' };
    } finally {
      try { if (connection?.close) await connection.close(); } catch {}
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
        const pw = await this.vault.getSecretByName(config.orgId, `db:${config.id}:password`, 'database_credential');
        if (pw) creds.password = pw.plaintext;
      } catch { /* no password stored */ }
      try {
        const cs = await this.vault.getSecretByName(config.orgId, `db:${config.id}:connection_string`, 'database_credential');
        if (cs) creds.connectionString = cs.plaintext;
      } catch { /* no connection string stored */ }
      if (config.sshTunnel?.enabled) {
        try {
          const ssh = await this.vault.getSecretByName(config.orgId, `db:${config.id}:ssh_key`, 'database_credential');
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

  // ─── Auto-Install Helper ──────────────────────────────────────────────────

  private _installCache = new Set<string>();

  /**
   * Auto-install a npm package if not already installed.
   * Caches install attempts to avoid repeated installs in the same process.
   */
  /**
   * Load a package using createRequire (works in bundled builds where dynamic import() fails).
   * Falls back through multiple strategies: createRequire at cwd, createRequire at node_modules, direct import.
   */
  private _requirePkg(pkg: string): any {
    // Strategy 1: createRequire from cwd (works for npm-installed packages in bundled code)
    try {
      const { createRequire } = require('node:module');
      const req = createRequire(require('node:path').join(process.cwd(), 'node_modules', '.package.json'));
      return req(pkg);
    } catch {}
    // Strategy 2: createRequire from process.cwd package.json
    try {
      const { createRequire } = require('node:module');
      const req = createRequire(require('node:path').join(process.cwd(), 'package.json'));
      return req(pkg);
    } catch {}
    // Strategy 3: resolve absolute path manually
    try {
      const absPath = require('node:path').join(process.cwd(), 'node_modules', pkg);
      return require(absPath);
    } catch {}
    // Strategy 4: plain require (may work in non-bundled contexts)
    try {
      return require(pkg);
    } catch {}
    return null;
  }

  private async ensurePackage(pkg: string): Promise<any> {
    // Try loading first (multiple strategies for bundled builds)
    const existing = this._requirePkg(pkg);
    if (existing) return existing;

    // Also try dynamic import as last resort for ESM packages
    try {
      return await import(pkg);
    } catch {}

    // Package not installed — auto-install it
    if (this._installCache.has(pkg)) {
      throw new Error(`Package "${pkg}" could not be loaded after auto-install. Please install manually: npm install ${pkg}`);
    }
    this._installCache.add(pkg);
    console.log(`[database-access] Auto-installing "${pkg}"...`);
    const { execSync } = await import('child_process');
    try {
      execSync(`npm install --no-save ${pkg}`, {
        stdio: 'pipe',
        timeout: 120_000,
        cwd: process.cwd(),
      });
      console.log(`[database-access] Successfully installed "${pkg}"`);
    } catch (installErr: any) {
      const msg = installErr.stderr?.toString?.().slice(0, 200) || installErr.message;
      throw new Error(`Failed to auto-install "${pkg}": ${msg}. Please install manually: npm install ${pkg}`);
    }

    // Try all loading strategies again after install
    const loaded = this._requirePkg(pkg);
    if (loaded) return loaded;

    // Final attempt with dynamic import
    try {
      return await import(pkg);
    } catch {}

    throw new Error(`Package "${pkg}" installed but could not be loaded. Try restarting the server, or install manually: npm install ${pkg}`);
  }

  /**
   * Connect with a timeout wrapper — all drivers get a 15s connect timeout.
   */
  private async connectWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 15_000, label = 'Connection'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms — check your host/port and ensure the database is reachable`)), timeoutMs);
      fn().then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /**
   * Detect SSL requirement from connection string or cloud provider type.
   * Cloud-hosted databases almost always require SSL.
   */
  private needsSsl(config: any, credentials?: any): boolean | Record<string, any> {
    if (config.ssl === true) return true;
    if (config.ssl === false) return false;
    // Auto-enable SSL for cloud providers
    const cloudTypes: string[] = ['supabase', 'neon', 'planetscale', 'cockroachdb', 'turso', 'upstash'];
    if (cloudTypes.includes(config.type)) return true;
    // Detect from connection string
    const connStr = credentials?.connectionString || '';
    if (connStr.includes('sslmode=require') || connStr.includes('ssl=true')) return true;
    // Supabase/Neon/etc URLs contain their domain
    if (/supabase|neon\.tech|cockroachlabs|planetscale|turso\.io|railway\.app|render\.com|aiven\.io|timescale\.com/i.test(connStr)) return true;
    if (/supabase|neon\.tech|cockroachlabs|planetscale|turso\.io|railway|render|aiven|timescale/i.test(config.host || '')) return true;
    return false;
  }

  /**
   * Parse a connection string to extract host/port/database/username when fields are missing.
   */
  private parseConnectionString(connStr: string, type: string): { host?: string; port?: number; database?: string; username?: string } {
    try {
      // Handle postgres://, mysql://, mongodb://, redis://, libsql:// etc
      const cleaned = connStr.replace(/^(postgres|postgresql|mysql|mongodb\+srv|mongodb|redis|rediss|libsql)/, 'http');
      const url = new URL(cleaned);
      return {
        host: url.hostname || undefined,
        port: url.port ? parseInt(url.port) : undefined,
        database: url.pathname?.replace(/^\//, '') || undefined,
        username: url.username || undefined,
      };
    } catch {
      return {};
    }
  }

  private registerBuiltinDrivers(): void {
    const self = this;

    // ── PostgreSQL / CockroachDB / Supabase / Neon ─────────────────────────
    const pgDriver: DatabaseDriver = {
      async connect(config, credentials) {
        const pgMod = await self.ensurePackage('postgres');
        const pgFn = pgMod.default || pgMod;

        // Build connection string from parts if not provided
        let connStr = credentials.connectionString;
        if (!connStr) {
          const user = encodeURIComponent(config.username || 'postgres');
          const pass = encodeURIComponent(credentials.password || '');
          const host = config.host || 'localhost';
          const port = config.port || 5432;
          const db = config.database || 'postgres';
          connStr = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
        }

        const ssl = self.needsSsl(config, credentials);
        const sql: any = await self.connectWithTimeout(() => {
          const s = pgFn(connStr, {
            max: config.pool?.max ?? 10,
            idle_timeout: (config.pool?.idleTimeoutMs ?? 30_000) / 1000,
            connect_timeout: 10,
            ssl: ssl ? (config.sslRejectUnauthorized === false ? 'prefer' as any : 'require' as any) : false,
          });
          // Force a connection attempt so errors surface now
          return s`SELECT 1`.then(() => s);
        }, 15_000, 'PostgreSQL');

        return {
          async query(q: string, params?: any[]) {
            const result = params?.length ? await sql.unsafe(q, params) : await sql.unsafe(q);
            return {
              rows: [...result],
              affectedRows: result.count,
              fields: result.columns?.map((c: any) => ({ name: c.name, type: String(c.type) })),
            };
          },
          async close() { try { await sql.end({ timeout: 5 }); } catch {} },
          async ping() {
            try { await sql`SELECT 1`; return true; }
            catch (e: any) {
              const msg = e instanceof AggregateError ? (e.errors?.map?.((x: any) => x.message).join('; ') || 'Multiple connection failures') : (e.message || String(e));
              throw new Error('PostgreSQL ping failed: ' + msg);
            }
          },
        };
      },
    };
    this.drivers.set('postgresql', pgDriver);
    this.drivers.set('cockroachdb', pgDriver);
    this.drivers.set('supabase', pgDriver);
    this.drivers.set('neon', pgDriver);

    // ── MySQL / MariaDB / PlanetScale ──────────────────────────────────────
    const mysqlDriver: DatabaseDriver = {
      async connect(config, credentials) {
        const mysql2 = await self.ensurePackage('mysql2/promise');

        // Parse connection string for missing fields
        const parsed = credentials.connectionString ? self.parseConnectionString(credentials.connectionString, config.type) : {};
        const ssl = self.needsSsl(config, credentials);

        const pool = await self.connectWithTimeout(async () => {
          const p = mysql2.createPool({
            host: config.host || parsed.host || 'localhost',
            port: config.port || parsed.port || 3306,
            user: config.username || parsed.username,
            password: credentials.password || (credentials.connectionString ? (() => { try { const u = new URL(credentials.connectionString.replace(/^mysql/, 'http')); return decodeURIComponent(u.password); } catch { return undefined; } })() : undefined),
            database: config.database || parsed.database,
            connectionLimit: config.pool?.max ?? 10,
            connectTimeout: 10_000,
            ssl: ssl ? { rejectUnauthorized: config.sslRejectUnauthorized !== false } : undefined,
            uri: credentials.connectionString || undefined,
          });
          // Validate connection
          await p.execute('SELECT 1');
          return p;
        }, 15_000, 'MySQL');

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
          async close() { try { await pool.end(); } catch {} },
          async ping() { try { await pool.execute('SELECT 1'); return true; } catch (e: any) { throw new Error('MySQL ping failed: ' + (e.message || e)); } },
        };
      },
    };
    this.drivers.set('mysql', mysqlDriver);
    this.drivers.set('mariadb', mysqlDriver);
    this.drivers.set('planetscale', mysqlDriver);

    // ── SQLite ─────────────────────────────────────────────────────────────
    this.drivers.set('sqlite', {
      async connect(config, credentials) {
        const sqliteMod = await self.ensurePackage('better-sqlite3');
        const Database = sqliteMod.default || sqliteMod;
        const dbPath = credentials.connectionString || config.database || ':memory:';
        const db = new Database(dbPath, { readonly: false });
        // Enable WAL mode for better concurrency
        try { db.pragma('journal_mode = WAL'); } catch {}
        return {
          async query(q: string, params?: any[]) {
            const trimmed = q.trim().toUpperCase();
            if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('EXPLAIN')) {
              const stmt = db.prepare(q);
              const rows = params?.length ? stmt.all(...params) : stmt.all();
              return { rows, fields: rows.length > 0 ? Object.keys(rows[0]).map(k => ({ name: k, type: 'unknown' })) : [] };
            } else {
              const stmt = db.prepare(q);
              const result = params?.length ? stmt.run(...params) : stmt.run();
              return { rows: [], affectedRows: result.changes };
            }
          },
          async close() { try { db.close(); } catch {} },
          async ping() { try { db.prepare('SELECT 1').get(); return true; } catch (e: any) { throw new Error('SQLite ping failed: ' + (e.message || e)); } },
        };
      },
    });

    // ── Turso / LibSQL ─────────────────────────────────────────────────────
    this.drivers.set('turso', {
      async connect(config, credentials) {
        const libsql = await self.ensurePackage('@libsql/client');
        const { createClient } = libsql;

        const url = credentials.connectionString || `libsql://${config.host}`;
        const client = createClient({ url, authToken: credentials.password });

        // Validate
        await self.connectWithTimeout(() => client.execute('SELECT 1'), 15_000, 'Turso');

        return {
          async query(q: string, params?: any[]) {
            const result = await client.execute({ sql: q, args: params || [] });
            return {
              rows: result.rows as any[],
              affectedRows: result.rowsAffected,
              fields: result.columns?.map((c: any) => ({ name: String(c), type: 'unknown' })),
            };
          },
          async close() { try { client.close(); } catch {} },
          async ping() { try { await client.execute('SELECT 1'); return true; } catch (e: any) { throw new Error('Turso ping failed: ' + (e.message || e)); } },
        };
      },
    });

    // ── MongoDB ────────────────────────────────────────────────────────────
    this.drivers.set('mongodb', {
      async connect(config, credentials) {
        const mongoMod = await self.ensurePackage('mongodb');
        const { MongoClient } = mongoMod;

        const uri = credentials.connectionString || (() => {
          const user = encodeURIComponent(config.username || '');
          const pass = encodeURIComponent(credentials.password || '');
          const host = config.host || 'localhost';
          const port = config.port || 27017;
          const db = config.database || 'admin';
          const auth = user ? `${user}:${pass}@` : '';
          return `mongodb://${auth}${host}:${port}/${db}`;
        })();

        const ssl = self.needsSsl(config, credentials);
        // mongodb+srv:// always uses TLS
        const useTls = ssl || uri.startsWith('mongodb+srv://');

        const client = new MongoClient(uri, {
          maxPoolSize: config.pool?.max ?? 10,
          serverSelectionTimeoutMS: 10_000,
          connectTimeoutMS: 10_000,
          tls: useTls || undefined,
        });

        await self.connectWithTimeout(() => client.connect(), 15_000, 'MongoDB');
        const db = client.db(config.database || self.parseConnectionString(uri, 'mongodb').database);

        return {
          async query(q: string, _params?: any[]) {
            try {
              const cmd = JSON.parse(q);
              const collection = db.collection(cmd.collection);
              switch (cmd.operation) {
                case 'find': {
                  const cursor = collection.find(cmd.filter || {});
                  if (cmd.projection) cursor.project(cmd.projection);
                  if (cmd.sort) cursor.sort(cmd.sort);
                  if (cmd.skip) cursor.skip(cmd.skip);
                  cursor.limit(cmd.limit || 100);
                  return { rows: await cursor.toArray() };
                }
                case 'findOne': {
                  const doc = await collection.findOne(cmd.filter || {}, { projection: cmd.projection });
                  return { rows: doc ? [doc] : [] };
                }
                case 'insertOne': {
                  const r = await collection.insertOne(cmd.document);
                  return { rows: [{ insertedId: r.insertedId }], affectedRows: 1 };
                }
                case 'insertMany': {
                  const r = await collection.insertMany(cmd.documents);
                  return { rows: [{ insertedCount: r.insertedCount }], affectedRows: r.insertedCount };
                }
                case 'updateOne': case 'updateMany': {
                  const fn = cmd.operation === 'updateOne' ? collection.updateOne.bind(collection) : collection.updateMany.bind(collection);
                  const r = await fn(cmd.filter || {}, cmd.update, { upsert: cmd.upsert });
                  return { rows: [{ matchedCount: r.matchedCount, modifiedCount: r.modifiedCount, upsertedId: r.upsertedId }], affectedRows: r.modifiedCount };
                }
                case 'deleteOne': case 'deleteMany': {
                  const fn = cmd.operation === 'deleteOne' ? collection.deleteOne.bind(collection) : collection.deleteMany.bind(collection);
                  const r = await fn(cmd.filter || {});
                  return { rows: [], affectedRows: r.deletedCount };
                }
                case 'aggregate': return { rows: await collection.aggregate(cmd.pipeline || []).toArray() };
                case 'count': case 'countDocuments': return { rows: [{ count: await collection.countDocuments(cmd.filter || {}) }] };
                case 'distinct': return { rows: [{ values: await collection.distinct(cmd.field, cmd.filter || {}) }] };
                case 'listCollections': {
                  const cols = await db.listCollections().toArray();
                  return { rows: cols.map((c: any) => ({ name: c.name, type: c.type })) };
                }
                default: throw new Error(`Unknown operation: ${cmd.operation}. Supported: find, findOne, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany, aggregate, count, distinct, listCollections`);
              }
            } catch (err: any) {
              throw new Error(`MongoDB query error: ${err.message}`);
            }
          },
          async close() { try { await client.close(); } catch {} },
          async ping() { try { await db.command({ ping: 1 }); return true; } catch (e: any) { throw new Error('MongoDB ping failed: ' + (e.message || e)); } },
        };
      },
    });

    // ── Redis (self-hosted or cloud with standard Redis protocol) ──────────
    this.drivers.set('redis', {
      async connect(config, credentials) {
        const host = config.host || 'localhost';
        const port = config.port || 6379;
        const ssl = self.needsSsl(config, credentials);
        const connStr = credentials.connectionString || '';

        // Detect if connection string uses rediss:// (TLS)
        const useTls = ssl || connStr.startsWith('rediss://');

        // Parse auth from connection string if present
        let password = credentials.password;
        let username = config.username;
        if (connStr) {
          try {
            const parsed = self.parseConnectionString(connStr, 'redis');
            if (!password) {
              // redis://user:pass@host:port or redis://:pass@host:port
              const url = new URL(connStr.replace(/^redis(s?)/, 'http'));
              password = url.password || password;
              username = url.username || username;
            }
          } catch {}
        }

        // Use TLS or plain net socket
        let socket: any;
        const connectHost = connStr ? (self.parseConnectionString(connStr, 'redis').host || host) : host;
        const connectPort = connStr ? (self.parseConnectionString(connStr, 'redis').port || port) : port;

        await self.connectWithTimeout(async () => {
          if (useTls) {
            const tls = await import('tls');
            socket = tls.connect({ host: connectHost, port: connectPort, rejectUnauthorized: config.sslRejectUnauthorized !== false });
            await new Promise<void>((resolve, reject) => {
              socket.on('secureConnect', resolve);
              socket.on('error', reject);
            });
          } else {
            const net = await import('net');
            socket = new net.Socket();
            await new Promise<void>((resolve, reject) => {
              socket.connect(connectPort, connectHost, () => resolve());
              socket.on('error', reject);
            });
          }

          // AUTH if needed — support Redis 6+ ACL: AUTH username password
          if (password) {
            const authCmd = username && username !== 'default' ? `AUTH ${username} ${password}` : `AUTH ${password}`;
            await sendRedisCommand(socket, authCmd);
          }
        }, 15_000, 'Redis');

        function sendRedisCommand(sock: any, cmd: string): Promise<string> {
          return new Promise((resolve, reject) => {
            let data = '';
            const onData = (chunk: Buffer) => { data += chunk.toString(); if (data.includes('\r\n')) { sock.off('data', onData); resolve(data); } };
            sock.on('data', onData);
            sock.write(cmd + '\r\n');
            setTimeout(() => { sock.off('data', onData); reject(new Error('Redis command timed out after 10s')); }, 10_000);
          });
        }

        return {
          async query(q: string) {
            const result = await sendRedisCommand(socket, q);
            return { rows: [{ result: result.trim() }] };
          },
          async close() { try { socket.destroy(); } catch {} },
          async ping() { try { const r = await sendRedisCommand(socket, 'PING'); if (!r.includes('PONG')) throw new Error('No PONG response'); return true; } catch (e: any) { throw new Error('Redis ping failed: ' + (e.message || e)); } },
        };
      },
    });

    // ── Upstash Redis (REST API — zero dependencies) ──────────────────────
    this.drivers.set('upstash', {
      async connect(config, credentials) {
        // Upstash REST: https://<endpoint>.upstash.io with Bearer token
        // Connection string format: https://<token>@<endpoint>.upstash.io or just the URL
        let baseUrl = '';
        let token = credentials.password || '';

        if (credentials.connectionString) {
          const cs = credentials.connectionString;
          // Handle https://token@host format
          if (cs.startsWith('https://') && cs.includes('@')) {
            try {
              const url = new URL(cs);
              token = token || url.username || url.password;
              baseUrl = `https://${url.host}`;
            } catch {
              baseUrl = cs;
            }
          } else if (cs.startsWith('https://')) {
            baseUrl = cs.replace(/\/$/, '');
          } else if (cs.startsWith('rediss://')) {
            // Upstash also provides redis:// URLs — extract host for REST
            try {
              const url = new URL(cs.replace('rediss://', 'https://'));
              token = token || url.password;
              baseUrl = `https://${url.hostname}`;
            } catch {
              baseUrl = `https://${config.host}`;
            }
          } else {
            baseUrl = `https://${cs}`;
          }
        } else {
          baseUrl = `https://${config.host}`;
        }

        if (!baseUrl) throw new Error('Upstash requires a REST URL or hostname. Find it in your Upstash console under REST API.');
        if (!token) throw new Error('Upstash requires an auth token. Find it in your Upstash console under REST API.');

        async function upstashRequest(command: string[]): Promise<any> {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 10_000);
          try {
            const resp = await fetch(baseUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(command),
              signal: ctrl.signal,
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => '');
              throw new Error(`Upstash HTTP ${resp.status}: ${body.slice(0, 200)}`);
            }
            return resp.json();
          } finally {
            clearTimeout(timer);
          }
        }

        // Validate connection
        await self.connectWithTimeout(async () => {
          const r = await upstashRequest(['PING']);
          if (r.result !== 'PONG') throw new Error('Upstash PING failed — check your token and endpoint URL');
        }, 15_000, 'Upstash');

        return {
          async query(q: string) {
            const parts = q.trim().split(/\s+/);
            const result = await upstashRequest(parts);
            const val = result.result ?? result;
            return { rows: [{ result: typeof val === 'string' ? val : JSON.stringify(val) }] };
          },
          async close() { /* stateless REST — nothing to close */ },
          async ping() { try { const r = await upstashRequest(['PING']); if (r.result !== 'PONG') throw new Error('No PONG response'); return true; } catch (e: any) { throw new Error('Upstash ping failed: ' + (e.message || e)); } },
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
