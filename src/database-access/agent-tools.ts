/**
 * Database Access — Agent Tool Bridge
 * 
 * Creates tools that agents can use to query databases they have access to.
 * Each agent only sees connections they've been granted access to.
 * 
 * IMPORTANT: execute() must match AgentTool signature: (toolCallId: string, params: any) => Promise<ToolResult>
 * ToolResult = { content: [{ type: 'text', text: string }] }
 */

import type { DatabaseConnectionManager } from './connection-manager.js';
import { DATABASE_LABELS } from './types.js';

function jsonResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(msg: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
}

export function createDatabaseTools(manager: DatabaseConnectionManager, agentId: string): any[] {
  const tools: any[] = [];

  // Tool 1: List available databases
  tools.push({
    name: 'db_list_connections',
    description: 'List EXTERNAL database connections (Postgres, MySQL, Supabase, etc.) granted to you by your admin. Use this when asked about any named database like "DateGPT", "production", etc.',
    category: 'database',
    risk: 'low',
    parameters: { type: 'object', properties: {}, required: [] },
    async execute(_toolCallId: string, _params: any) {
      const accessList = manager.getAgentAccess(agentId);
      const connections = accessList.filter(a => a.enabled).map(a => {
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
          description: (conn as any).config?.description || conn.description,
        };
      }).filter(Boolean);

      if (connections.length === 0) {
        return jsonResult({ connections: [], message: 'No external database connections granted. Ask your admin to grant access from the Database Access page.' });
      }
      return jsonResult({ connections });
    },
  });

  // Tool 2: Execute SQL query
  tools.push({
    name: 'db_query',
    description: 'Execute a SQL query on an EXTERNAL database connection granted by your admin. Use db_list_connections first to see available databases and get the connectionId.',
    category: 'database',
    risk: 'medium',
    sideEffects: ['database_write'],
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID (from db_list_connections)' },
        sql: { type: 'string', description: 'SQL query to execute' },
        params: { type: 'array', items: { type: 'string' }, description: 'Query parameters (for parameterized queries)' },
      },
      required: ['connectionId', 'sql'],
    },
    async execute(_toolCallId: string, input: { connectionId: string; sql: string; params?: any[] }) {
      if (!input?.connectionId || !input?.sql) return errorResult('connectionId and sql are required');
      
      try {
        const result = await manager.executeQuery({
          connectionId: input.connectionId,
          agentId,
          operation: 'read',
          sql: input.sql,
          params: input.params,
        });

        if (!result.success) {
          return errorResult(result.error || 'Query failed');
        }

        return jsonResult({
          rows: result.rows,
          rowCount: result.rowCount,
          affectedRows: result.affectedRows,
          fields: result.fields,
          executionTimeMs: result.executionTimeMs,
          truncated: result.truncated,
        });
      } catch (e: any) {
        return errorResult(e.message || 'Query execution failed');
      }
    },
  });

  // Tool 3: Describe table schema
  tools.push({
    name: 'db_describe_table',
    description: 'Get the schema (columns, types, constraints) of a table in an external database.',
    category: 'database',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
        table: { type: 'string', description: 'Table name' },
      },
      required: ['connectionId', 'table'],
    },
    async execute(_toolCallId: string, input: { connectionId: string; table: string }) {
      if (!input?.connectionId || !input?.table) return errorResult('connectionId and table are required');

      const conn = manager.getConnection(input.connectionId);
      if (!conn) return errorResult('Connection not found');

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
          return errorResult(`Schema inspection not supported for ${conn.type}`);
      }

      try {
        const result = await manager.executeQuery({ connectionId: input.connectionId, agentId, operation: 'read', sql, _trusted: true });
        if (!result.success) return errorResult(result.error || 'Query failed');
        return jsonResult({ columns: result.rows, table: input.table });
      } catch (e: any) {
        return errorResult(e.message);
      }
    },
  });

  // Tool 4: List tables
  tools.push({
    name: 'db_list_tables',
    description: 'List all tables in an external database connection.',
    category: 'database',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
      },
      required: ['connectionId'],
    },
    async execute(_toolCallId: string, input: { connectionId: string }) {
      if (!input?.connectionId) return errorResult('connectionId is required');

      const conn = manager.getConnection(input.connectionId);
      if (!conn) return errorResult('Connection not found');

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
        default:
          return errorResult(`Table listing not supported for ${conn.type}`);
      }

      try {
        const result = await manager.executeQuery({ connectionId: input.connectionId, agentId, operation: 'read', sql, _trusted: true });
        if (!result.success) return errorResult(result.error || 'Query failed');
        return jsonResult({ tables: result.rows });
      } catch (e: any) {
        return errorResult(e.message);
      }
    },
  });

  return tools;
}
