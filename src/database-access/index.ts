/**
 * Database Access System — Public API
 * 
 * Enterprise-grade database connectivity for AI agents.
 */

export { DatabaseConnectionManager } from './connection-manager.js';
export { createDatabaseAccessRoutes } from './routes.js';
export { createDatabaseTools } from './agent-tools.js';
export { sanitizeQuery, classifyQuery, sanitizeForLogging } from './query-sanitizer.js';
export type {
  DatabaseType,
  DatabaseConnectionConfig,
  AgentDatabaseAccess,
  DatabasePermission,
  DatabaseQuery,
  QueryResult,
  DatabaseAuditEntry,
  ConnectionPoolStats,
} from './types.js';
export { DATABASE_LABELS, DATABASE_CATEGORIES } from './types.js';
