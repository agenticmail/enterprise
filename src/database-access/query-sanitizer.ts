/**
 * Query Sanitizer — Enterprise Security Layer
 * 
 * Validates and sanitizes all database queries before execution.
 * Prevents SQL injection, enforces schema restrictions, blocks dangerous operations.
 */

import type { DatabasePermission, DatabaseConnectionConfig, AgentDatabaseAccess } from './types.js';

// ─── Dangerous Patterns ──────────────────────────────────────────────────────

/** SQL patterns that are ALWAYS blocked regardless of permissions */
const BLOCKED_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*TRUNCATE\s+/i,
  /;\s*ALTER\s+/i,
  /;\s*CREATE\s+/i,
  /;\s*GRANT\s+/i,
  /;\s*REVOKE\s+/i,
  /;\s*SET\s+ROLE/i,
  /LOAD_FILE\s*\(/i,
  /INTO\s+OUTFILE/i,
  /INTO\s+DUMPFILE/i,
  /INFORMATION_SCHEMA/i,
  /pg_catalog\./i,
  /sys\.\w+/i,
  /xp_cmdshell/i,
  /sp_execute/i,
  /EXEC\s*\(/i,
  /EXECUTE\s+IMMEDIATE/i,
  /--\s*$/m,                        // SQL comments at end of line (common injection)
  /\/\*[\s\S]*?\*\//,               // Block comments (hiding malicious code)
  /SLEEP\s*\(/i,
  /BENCHMARK\s*\(/i,
  /WAITFOR\s+DELAY/i,
  /pg_sleep/i,
];

/** Patterns that require 'execute' permission */
const EXECUTE_PATTERNS = [
  /\bCALL\s+/i,
  /\bEXEC\s+/i,
  /\bEXECUTE\s+/i,
];

// ─── Query Classification ────────────────────────────────────────────────────

export type QueryOperation = 'read' | 'write' | 'delete' | 'schema' | 'execute' | 'blocked';

export function classifyQuery(sql: string): QueryOperation {
  const trimmed = sql.trim().toUpperCase();
  
  // Check blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(sql)) return 'blocked';
  }
  
  // Check execute patterns
  for (const pattern of EXECUTE_PATTERNS) {
    if (pattern.test(sql)) return 'execute';
  }
  
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('EXPLAIN')) return 'read';
  if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('UPSERT') || trimmed.startsWith('MERGE')) return 'write';
  if (trimmed.startsWith('DELETE')) return 'delete';
  if (trimmed.startsWith('CREATE') || trimmed.startsWith('ALTER') || trimmed.startsWith('DROP')) return 'schema';
  
  // Default to blocked for unrecognized patterns
  return 'blocked';
}

// ─── Permission Check ────────────────────────────────────────────────────────

export interface SanitizeResult {
  allowed: boolean;
  operation: QueryOperation;
  reason?: string;
  sanitizedQuery?: string;
}

export function sanitizeQuery(
  sql: string,
  permissions: DatabasePermission[],
  connectionConfig: DatabaseConnectionConfig,
  agentAccess: AgentDatabaseAccess,
): SanitizeResult {
  // 1. Classify the query
  const operation = classifyQuery(sql);
  
  if (operation === 'blocked') {
    return { allowed: false, operation, reason: 'Query contains blocked patterns (potential injection or dangerous operations)' };
  }
  
  // 2. Check agent has required permission
  if (!permissions.includes(operation as DatabasePermission)) {
    return { allowed: false, operation, reason: `Agent lacks '${operation}' permission on this database` };
  }
  
  // 3. Check table access
  const tables = extractTableNames(sql);
  const mergedBlocked = mergeBlockedTables(connectionConfig, agentAccess);
  const mergedAllowed = mergeAllowedTables(connectionConfig, agentAccess);
  
  for (const table of tables) {
    if (mergedBlocked.has(table.toLowerCase())) {
      return { allowed: false, operation, reason: `Access to table '${table}' is blocked` };
    }
    if (mergedAllowed.size > 0 && !mergedAllowed.has(table.toLowerCase())) {
      return { allowed: false, operation, reason: `Table '${table}' is not in the allowed tables list` };
    }
  }
  
  // 4. Check column access (for SELECT, INSERT, UPDATE)
  const columns = extractColumnNames(sql);
  const blockedColumns = new Set([
    ...(connectionConfig.schemaAccess?.blockedColumns || []).map(c => c.toLowerCase()),
    ...(agentAccess.schemaAccess?.blockedColumns || []).map(c => c.toLowerCase()),
  ]);
  
  for (const col of columns) {
    if (blockedColumns.has(col.toLowerCase())) {
      return { allowed: false, operation, reason: `Access to column '${col}' is blocked (sensitive data)` };
    }
  }
  
  // 5. Add safety limits for read queries
  let sanitizedQuery = sql.trim();
  if (operation === 'read' && !sanitizedQuery.toUpperCase().includes('LIMIT')) {
    const maxRows = agentAccess.queryLimits?.maxRowsRead 
      ?? connectionConfig.queryLimits?.maxRowsRead 
      ?? 10000;
    sanitizedQuery = `${sanitizedQuery.replace(/;?\s*$/, '')} LIMIT ${maxRows}`;
  }
  
  return { allowed: true, operation, sanitizedQuery };
}

// ─── Table/Column Extraction ─────────────────────────────────────────────────

function extractTableNames(sql: string): string[] {
  const tables = new Set<string>();
  
  // FROM clause
  const fromMatch = sql.match(/\bFROM\s+([`"[\]]?\w+[`"\]]?(?:\s*\.\s*[`"[\]]?\w+[`"\]]?)?)/gi);
  if (fromMatch) {
    for (const m of fromMatch) {
      const name = m.replace(/^FROM\s+/i, '').replace(/[`"[\]]/g, '').trim();
      tables.add(name.split('.').pop() || name);
    }
  }
  
  // JOIN clause
  const joinMatch = sql.match(/\bJOIN\s+([`"[\]]?\w+[`"\]]?(?:\s*\.\s*[`"[\]]?\w+[`"\]]?)?)/gi);
  if (joinMatch) {
    for (const m of joinMatch) {
      const name = m.replace(/^JOIN\s+/i, '').replace(/[`"[\]]/g, '').trim();
      tables.add(name.split('.').pop() || name);
    }
  }
  
  // INSERT INTO
  const insertMatch = sql.match(/\bINSERT\s+INTO\s+([`"[\]]?\w+[`"\]]?)/i);
  if (insertMatch) tables.add(insertMatch[1].replace(/[`"[\]]/g, ''));
  
  // UPDATE
  const updateMatch = sql.match(/\bUPDATE\s+([`"[\]]?\w+[`"\]]?)/i);
  if (updateMatch) tables.add(updateMatch[1].replace(/[`"[\]]/g, ''));
  
  // DELETE FROM
  const deleteMatch = sql.match(/\bDELETE\s+FROM\s+([`"[\]]?\w+[`"\]]?)/i);
  if (deleteMatch) tables.add(deleteMatch[1].replace(/[`"[\]]/g, ''));
  
  return [...tables];
}

function extractColumnNames(sql: string): string[] {
  // Extract column names from SELECT, INSERT, UPDATE SET clauses
  // This is best-effort — complex queries may not parse perfectly
  const columns = new Set<string>();
  
  // SELECT columns (between SELECT and FROM)
  const selectMatch = sql.match(/\bSELECT\s+(.*?)\bFROM\b/is);
  if (selectMatch && !selectMatch[1].includes('*')) {
    const parts = selectMatch[1].split(',');
    for (const p of parts) {
      const col = p.trim().split(/\s+AS\s+/i)[0].trim().split('.').pop();
      if (col && /^\w+$/.test(col)) columns.add(col);
    }
  }
  
  return [...columns];
}

function mergeBlockedTables(config: DatabaseConnectionConfig, access: AgentDatabaseAccess): Set<string> {
  return new Set([
    ...(config.schemaAccess?.blockedTables || []).map(t => t.toLowerCase()),
    ...(access.schemaAccess?.blockedTables || []).map(t => t.toLowerCase()),
  ]);
}

function mergeAllowedTables(config: DatabaseConnectionConfig, access: AgentDatabaseAccess): Set<string> {
  const connAllowed = config.schemaAccess?.allowedTables || [];
  const agentAllowed = access.schemaAccess?.allowedTables || [];
  
  // If agent has specific allowed tables, use those (most restrictive)
  if (agentAllowed.length > 0) return new Set(agentAllowed.map(t => t.toLowerCase()));
  if (connAllowed.length > 0) return new Set(connAllowed.map(t => t.toLowerCase()));
  return new Set(); // Empty = all tables allowed
}

/**
 * Sanitize a query string for safe logging (remove parameter values).
 */
export function sanitizeForLogging(sql: string): string {
  // Replace string literals
  let sanitized = sql.replace(/'[^']*'/g, "'?'");
  // Replace numeric literals after = or IN
  sanitized = sanitized.replace(/=\s*\d+/g, '= ?');
  return sanitized;
}
