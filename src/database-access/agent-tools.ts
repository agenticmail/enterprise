/**
 * Database Access — Agent Tool Bridge
 * 
 * Creates tools that agents can use to query databases they have access to.
 * Each agent only sees connections they've been granted access to.
 */

import type { DatabaseConnectionManager } from './connection-manager.js';
import { DATABASE_LABELS } from './types.js';

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (input: any) => Promise<any>;
  category?: string;
  sideEffects?: string[];
}

export function createDatabaseTools(manager: DatabaseConnectionManager, agentId: string): ToolDefinition[] {
  const accessList = manager.getAgentAccess(agentId);
  if (accessList.length === 0) return [];

  const tools: ToolDefinition[] = [];

  // Tool 1: List available databases
  tools.push({
    name: 'db_list_connections',
    description: 'List database connections this agent has access to.',
    category: 'database',
    parameters: { type: 'object', properties: {}, required: [] },
    async execute() {
      const connections = accessList.map(a => {
        const conn = manager.getConnection(a.connectionId);
        if (!conn) return null;
        return {
          connectionId: conn.id,
          name: conn.name,
          type: conn.type,
          typeLabel: DATABASE_LABELS[conn.type] || conn.type,
          database: conn.database,
          host: conn.host,
          status: conn.status,
          permissions: a.permissions,
          description: conn.description,
        };
      }).filter(Boolean);
      return { connections };
    },
  });

  // Tool 2: Execute SQL query
  tools.push({
    name: 'db_query',
    description: 'Execute a SQL query on a connected database. Use db_list_connections first to see available databases.',
    category: 'database',
    sideEffects: ['database_write'],
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
        sql: { type: 'string', description: 'SQL query to execute' },
        params: { type: 'array', items: { type: 'string' }, description: 'Query parameters (for parameterized queries)' },
      },
      required: ['connectionId', 'sql'],
    },
    async execute(input: { connectionId: string; sql: string; params?: any[] }) {
      const result = await manager.executeQuery({
        connectionId: input.connectionId,
        agentId,
        operation: 'read',
        sql: input.sql,
        params: input.params,
      });

      if (!result.success) {
        return { error: result.error, queryId: result.queryId };
      }

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        affectedRows: result.affectedRows,
        fields: result.fields,
        executionTimeMs: result.executionTimeMs,
        truncated: result.truncated,
        queryId: result.queryId,
      };
    },
  });

  // Tool 3: Describe table schema
  tools.push({
    name: 'db_describe_table',
    description: 'Get the schema (columns, types, constraints) of a database table.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
        table: { type: 'string', description: 'Table name' },
      },
      required: ['connectionId', 'table'],
    },
    async execute(input: { connectionId: string; table: string }) {
      const conn = manager.getConnection(input.connectionId);
      if (!conn) return { error: 'Connection not found' };

      // Build describe query based on database type
      let sql: string;
      switch (conn.type) {
        case 'postgresql': case 'cockroachdb': case 'supabase': case 'neon':
          sql = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${input.table.replace(/'/g, "''")}' ORDER BY ordinal_position`;
          break;
        case 'mysql': case 'mariadb': case 'planetscale':
          sql = `DESCRIBE \`${input.table.replace(/`/g, '``')}\``;
          break;
        case 'sqlite': case 'turso':
          sql = `PRAGMA table_info('${input.table.replace(/'/g, "''")}')`;
          break;
        default:
          return { error: `Schema inspection not supported for ${conn.type}` };
      }

      return manager.executeQuery({
        connectionId: input.connectionId,
        agentId,
        operation: 'read',
        sql,
      });
    },
  });

  // Tool 4: List tables
  tools.push({
    name: 'db_list_tables',
    description: 'List all tables in the connected database.',
    category: 'database',
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
      },
      required: ['connectionId'],
    },
    async execute(input: { connectionId: string }) {
      const conn = manager.getConnection(input.connectionId);
      if (!conn) return { error: 'Connection not found' };

      let sql: string;
      switch (conn.type) {
        case 'postgresql': case 'cockroachdb': case 'supabase': case 'neon':
          sql = `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
          break;
        case 'mysql': case 'mariadb': case 'planetscale':
          sql = 'SHOW TABLES';
          break;
        case 'sqlite': case 'turso':
          sql = `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`;
          break;
        case 'mongodb':
          sql = JSON.stringify({ collection: 'system.namespaces', operation: 'find', filter: {} });
          break;
        default:
          return { error: `Table listing not supported for ${conn.type}` };
      }

      return manager.executeQuery({
        connectionId: input.connectionId,
        agentId,
        operation: 'read',
        sql,
      });
    },
  });

  return tools;
}
