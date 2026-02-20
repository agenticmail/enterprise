/**
 * AgenticMail Agent Tools — Enterprise Database
 *
 * Database inspection and query tools for AI agents.
 * Supports SQLite via better-sqlite3 with read-only enforcement,
 * schema introspection, query explanation, and sampling.
 */

import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';

var _connections: Map<string, { type: string; path: string }> = new Map();

/** Register a named database connection */
export function registerConnection(name: string, info: { type: string; path: string }): void {
  _connections.set(name, info);
}

/** Clear all registered connections */
export function clearConnections(): void {
  _connections.clear();
}

function getConnectionInfo(name: string): { type: string; path: string } | undefined {
  if (_connections.has(name)) return _connections.get(name);
  // If name looks like a file path, treat it as a SQLite DB
  if (name.endsWith('.db') || name.endsWith('.sqlite') || name.endsWith('.sqlite3')) {
    return { type: 'sqlite', path: name };
  }
  return undefined;
}

var WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|ATTACH|DETACH|REINDEX|VACUUM)\b/i;

function isReadOnly(sql: string): boolean {
  var trimmed = sql.trim();
  return !WRITE_PATTERN.test(trimmed);
}

async function getSqliteDb(dbPath: string): Promise<any> {
  try {
    var BetterSqlite3 = (await import('better-sqlite3')).default;
    return new BetterSqlite3(dbPath, { readonly: true });
  } catch (err: any) {
    throw new Error('Failed to open SQLite database at ' + dbPath + ': ' + (err.message || String(err)));
  }
}

export function createDatabaseTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entDbQuery: AnyAgentTool = {
    name: 'ent_db_query',
    label: 'Database Query',
    description: 'Execute a read-only SQL query against a database connection. Only SELECT statements are allowed. Returns results as a JSON table with column headers and rows.',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Database connection name or SQLite file path.' },
        sql: { type: 'string', description: 'SQL SELECT query to execute.' },
        limit: { type: 'number', description: 'Maximum number of rows to return (default 100).', default: 100 },
      },
      required: ['connection', 'sql'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var connection = readStringParam(params, 'connection', { required: true });
      var sql = readStringParam(params, 'sql', { required: true });
      var limit = readNumberParam(params, 'limit', { integer: true }) ?? 100;

      if (!isReadOnly(sql)) {
        return errorResult('Only read-only queries (SELECT, WITH, EXPLAIN) are allowed. Write operations are blocked for safety.');
      }

      var connInfo = getConnectionInfo(connection);
      if (!connInfo) {
        return errorResult('Unknown database connection: ' + connection + '. Use ent_db_connections to list available connections.');
      }

      var dbPath = connInfo.path;
      if (!path.isAbsolute(dbPath) && options?.workspaceDir) {
        dbPath = path.resolve(options.workspaceDir, dbPath);
      }

      try {
        var db = await getSqliteDb(dbPath);
        try {
          var limitedSql = sql.replace(/;\s*$/, '');
          // Add LIMIT if not already present
          if (!/\bLIMIT\b/i.test(limitedSql)) {
            limitedSql = limitedSql + ' LIMIT ' + limit;
          }
          var rows = db.prepare(limitedSql).all();
          var columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          return jsonResult({ columns: columns, rows: rows, count: rows.length });
        } finally {
          db.close();
        }
      } catch (err: any) {
        return errorResult('Query failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDbSchema: AnyAgentTool = {
    name: 'ent_db_schema',
    label: 'Database Schema',
    description: 'Get the schema (columns, types, primary keys) for a specific table in the database.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Database connection name or SQLite file path.' },
        table: { type: 'string', description: 'Table name to inspect.' },
      },
      required: ['connection', 'table'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var connection = readStringParam(params, 'connection', { required: true });
      var table = readStringParam(params, 'table', { required: true });

      var connInfo = getConnectionInfo(connection);
      if (!connInfo) {
        return errorResult('Unknown database connection: ' + connection);
      }

      var dbPath = connInfo.path;
      if (!path.isAbsolute(dbPath) && options?.workspaceDir) {
        dbPath = path.resolve(options.workspaceDir, dbPath);
      }

      try {
        var db = await getSqliteDb(dbPath);
        try {
          var columns = db.prepare('PRAGMA table_info(' + JSON.stringify(table) + ')').all();
          if (!columns || columns.length === 0) {
            return errorResult('Table not found: ' + table);
          }
          var indexInfo = db.prepare('PRAGMA index_list(' + JSON.stringify(table) + ')').all();
          var foreignKeys = db.prepare('PRAGMA foreign_key_list(' + JSON.stringify(table) + ')').all();
          var schema = columns.map(function(col: any) {
            return {
              name: col.name,
              type: col.type,
              nullable: col.notnull === 0,
              defaultValue: col.dflt_value,
              primaryKey: col.pk > 0,
            };
          });
          return jsonResult({
            table: table,
            columns: schema,
            indexes: indexInfo,
            foreignKeys: foreignKeys,
          });
        } finally {
          db.close();
        }
      } catch (err: any) {
        return errorResult('Schema inspection failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDbExplain: AnyAgentTool = {
    name: 'ent_db_explain',
    label: 'Explain Query Plan',
    description: 'Run EXPLAIN QUERY PLAN on a SQL query to understand how the database will execute it. Useful for query optimization.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Database connection name or SQLite file path.' },
        sql: { type: 'string', description: 'SQL query to explain.' },
      },
      required: ['connection', 'sql'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var connection = readStringParam(params, 'connection', { required: true });
      var sql = readStringParam(params, 'sql', { required: true });

      if (!isReadOnly(sql)) {
        return errorResult('Only read-only queries can be explained.');
      }

      var connInfo = getConnectionInfo(connection);
      if (!connInfo) {
        return errorResult('Unknown database connection: ' + connection);
      }

      var dbPath = connInfo.path;
      if (!path.isAbsolute(dbPath) && options?.workspaceDir) {
        dbPath = path.resolve(options.workspaceDir, dbPath);
      }

      try {
        var db = await getSqliteDb(dbPath);
        try {
          var cleanSql = sql.replace(/;\s*$/, '');
          var plan = db.prepare('EXPLAIN QUERY PLAN ' + cleanSql).all();
          var lines = plan.map(function(row: any) {
            var indent = '  '.repeat(row.selectid || 0);
            return indent + row.detail;
          });
          return textResult('Query Plan:\n' + lines.join('\n'));
        } finally {
          db.close();
        }
      } catch (err: any) {
        return errorResult('Explain failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDbConnections: AnyAgentTool = {
    name: 'ent_db_connections',
    label: 'List Database Connections',
    description: 'List all available database connections that can be used with other database tools.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async function(_toolCallId, _args) {
      var connections: Array<{ name: string; type: string; path: string }> = [];
      _connections.forEach(function(info, name) {
        connections.push({ name: name, type: info.type, path: info.path });
      });

      // Also check for common SQLite files in the workspace
      if (options?.workspaceDir) {
        var fs = await import('node:fs/promises');
        try {
          var entries = await fs.readdir(options.workspaceDir);
          for (var entry of entries) {
            if (entry.endsWith('.db') || entry.endsWith('.sqlite') || entry.endsWith('.sqlite3')) {
              var fullPath = path.join(options.workspaceDir, entry);
              var alreadyRegistered = false;
              _connections.forEach(function(info) {
                if (info.path === fullPath || info.path === entry) alreadyRegistered = true;
              });
              if (!alreadyRegistered) {
                connections.push({ name: entry, type: 'sqlite', path: fullPath });
              }
            }
          }
        } catch {
          // workspace dir may not exist
        }
      }

      if (connections.length === 0) {
        return textResult('No database connections available. Register connections or place .db/.sqlite files in the workspace directory.');
      }
      return jsonResult({ connections: connections, count: connections.length });
    },
  };

  var entDbTables: AnyAgentTool = {
    name: 'ent_db_tables',
    label: 'List Tables',
    description: 'List all tables in a database connection.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Database connection name or SQLite file path.' },
      },
      required: ['connection'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var connection = readStringParam(params, 'connection', { required: true });

      var connInfo = getConnectionInfo(connection);
      if (!connInfo) {
        return errorResult('Unknown database connection: ' + connection);
      }

      var dbPath = connInfo.path;
      if (!path.isAbsolute(dbPath) && options?.workspaceDir) {
        dbPath = path.resolve(options.workspaceDir, dbPath);
      }

      try {
        var db = await getSqliteDb(dbPath);
        try {
          var tables = db.prepare(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
          ).all();
          var result = tables.map(function(t: any) {
            var rowCount = 0;
            try {
              var countRow = db.prepare('SELECT COUNT(*) as cnt FROM ' + JSON.stringify(t.name)).get();
              rowCount = countRow?.cnt ?? 0;
            } catch { /* skip count on error */ }
            return { name: t.name, type: t.type, rowCount: rowCount };
          });
          return jsonResult({ tables: result, count: result.length });
        } finally {
          db.close();
        }
      } catch (err: any) {
        return errorResult('Failed to list tables: ' + (err.message || String(err)));
      }
    },
  };

  var entDbSample: AnyAgentTool = {
    name: 'ent_db_sample',
    label: 'Sample Table Rows',
    description: 'Get a random sample of rows from a database table. Useful for understanding table contents and data patterns.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Database connection name or SQLite file path.' },
        table: { type: 'string', description: 'Table name to sample from.' },
        count: { type: 'number', description: 'Number of sample rows to return (default 5).', default: 5 },
      },
      required: ['connection', 'table'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var connection = readStringParam(params, 'connection', { required: true });
      var table = readStringParam(params, 'table', { required: true });
      var count = readNumberParam(params, 'count', { integer: true }) ?? 5;

      if (count < 1) count = 1;
      if (count > 100) count = 100;

      var connInfo = getConnectionInfo(connection);
      if (!connInfo) {
        return errorResult('Unknown database connection: ' + connection);
      }

      var dbPath = connInfo.path;
      if (!path.isAbsolute(dbPath) && options?.workspaceDir) {
        dbPath = path.resolve(options.workspaceDir, dbPath);
      }

      try {
        var db = await getSqliteDb(dbPath);
        try {
          // Verify table exists
          var tableCheck = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
          ).get(table);
          if (!tableCheck) {
            return errorResult('Table not found: ' + table);
          }

          var rows = db.prepare(
            'SELECT * FROM ' + JSON.stringify(table) + ' ORDER BY RANDOM() LIMIT ?'
          ).all(count);
          var columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          return jsonResult({ table: table, columns: columns, rows: rows, count: rows.length });
        } finally {
          db.close();
        }
      } catch (err: any) {
        return errorResult('Sample failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entDbQuery, entDbSchema, entDbExplain, entDbConnections, entDbTables, entDbSample];
}
