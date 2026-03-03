/**
 * Database Access System — Types
 * 
 * Enterprise-grade database connectivity for AI agents.
 * Supports: PostgreSQL, MySQL/MariaDB, SQLite, MongoDB, Redis,
 * Microsoft SQL Server, Oracle, CockroachDB, PlanetScale, Turso/LibSQL,
 * DynamoDB, Supabase, Neon, and any ODBC-compatible database.
 */

// ─── Database Types ──────────────────────────────────────────────────────────

export type DatabaseType =
  | 'postgresql'
  | 'mysql'
  | 'mariadb'
  | 'sqlite'
  | 'mongodb'
  | 'redis'
  | 'mssql'
  | 'oracle'
  | 'cockroachdb'
  | 'planetscale'
  | 'turso'
  | 'dynamodb'
  | 'supabase'
  | 'neon'
  | 'upstash';

export const DATABASE_LABELS: Record<DatabaseType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  mongodb: 'MongoDB',
  redis: 'Redis',
  mssql: 'Microsoft SQL Server',
  oracle: 'Oracle',
  cockroachdb: 'CockroachDB',
  planetscale: 'PlanetScale',
  turso: 'Turso / LibSQL',
  dynamodb: 'AWS DynamoDB',
  supabase: 'Supabase',
  neon: 'Neon',
  upstash: 'Upstash Redis',
};

export const DATABASE_CATEGORIES: Record<string, DatabaseType[]> = {
  'Relational (SQL)': ['postgresql', 'mysql', 'mariadb', 'mssql', 'oracle', 'sqlite'],
  'Cloud-Native SQL': ['supabase', 'neon', 'planetscale', 'cockroachdb', 'turso'],
  'NoSQL / Key-Value': ['mongodb', 'redis', 'upstash', 'dynamodb'],
};

// ─── Connection Configuration ────────────────────────────────────────────────

export interface DatabaseConnectionConfig {
  id: string;
  orgId: string;
  name: string;                    // Human-friendly name: "Production DB", "Analytics Warehouse"
  type: DatabaseType;
  
  // Connection details (stored encrypted in vault)
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  // password stored in vault, never in this config
  
  // Alternative: connection string (stored encrypted in vault)
  // connectionString stored in vault
  
  // SSL/TLS
  ssl?: boolean;
  sslCaCert?: string;             // Vault reference
  sslClientCert?: string;         // Vault reference
  sslClientKey?: string;          // Vault reference
  sslRejectUnauthorized?: boolean;
  
  // SSH Tunnel
  sshTunnel?: {
    enabled: boolean;
    host: string;
    port?: number;
    username: string;
    // privateKey stored in vault
    localPort?: number;
  };
  
  // Connection Pool
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMs?: number;
    acquireTimeoutMs?: number;
  };
  
  // Query Safety
  queryLimits?: {
    maxRowsRead?: number;          // Default: 10000
    maxRowsWrite?: number;         // Default: 1000
    maxRowsDelete?: number;        // Default: 100
    queryTimeoutMs?: number;       // Default: 30000
    maxConcurrentQueries?: number; // Default: 5
  };
  
  // Schema restrictions
  schemaAccess?: {
    allowedSchemas?: string[];     // Empty = all schemas
    allowedTables?: string[];      // Empty = all tables
    blockedTables?: string[];      // Takes precedence over allowed
    blockedColumns?: string[];     // Sensitive columns: "ssn", "password", etc.
  };
  
  // Metadata
  description?: string;
  tags?: string[];
  status: 'active' | 'inactive' | 'error';
  lastTestedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Agent Access Control ────────────────────────────────────────────────────

export type DatabasePermission = 'read' | 'write' | 'delete' | 'schema' | 'execute';

export interface AgentDatabaseAccess {
  id: string;
  orgId: string;
  agentId: string;
  connectionId: string;
  
  // Granular permissions
  permissions: DatabasePermission[];
  
  // Per-agent overrides (stricter than connection defaults)
  queryLimits?: {
    maxRowsRead?: number;
    maxRowsWrite?: number;
    maxRowsDelete?: number;
    queryTimeoutMs?: number;
    maxConcurrentQueries?: number;
    maxQueriesPerMinute?: number;  // Rate limiting
  };
  
  // Per-agent schema restrictions (further restricts connection-level)
  schemaAccess?: {
    allowedTables?: string[];
    blockedTables?: string[];
    blockedColumns?: string[];
  };
  
  // Audit settings
  logAllQueries?: boolean;         // Default: true for write/delete, false for read
  requireApproval?: boolean;       // Require human approval before write/delete
  
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Query Types ─────────────────────────────────────────────────────────────

export interface DatabaseQuery {
  connectionId: string;
  agentId: string;
  operation: 'read' | 'write' | 'delete' | 'schema' | 'execute';
  sql?: string;
  params?: any[];
  
  // For NoSQL
  collection?: string;
  filter?: Record<string, any>;
  update?: Record<string, any>;
  document?: Record<string, any>;
  
  // For Redis
  command?: string;
  args?: string[];
}

export interface QueryResult {
  success: boolean;
  rows?: any[];
  rowCount?: number;
  affectedRows?: number;
  fields?: { name: string; type: string }[];
  error?: string;
  executionTimeMs: number;
  truncated?: boolean;              // True if rows were limited
  queryId: string;                  // For audit trail
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface DatabaseAuditEntry {
  id: string;
  orgId: string;
  agentId: string;
  agentName?: string;
  connectionId: string;
  connectionName?: string;
  operation: DatabasePermission;
  query: string;                    // Sanitized query (no values)
  paramCount: number;
  rowsAffected: number;
  executionTimeMs: number;
  success: boolean;
  error?: string;
  ipAddress?: string;
  timestamp: string;
}

// ─── Connection Pool Stats ───────────────────────────────────────────────────

export interface ConnectionPoolStats {
  connectionId: string;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  queriesExecuted: number;
  averageQueryTimeMs: number;
  errorCount: number;
  lastActivityAt: string;
}
