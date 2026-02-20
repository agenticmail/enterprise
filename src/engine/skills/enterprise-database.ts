import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-database',
  name: 'Database Query',
  description: 'Execute read-only SQL queries against approved databases. Supports PostgreSQL, MySQL, SQLite, and MSSQL. Includes schema introspection, parameterized queries, result formatting, and query plan analysis. All queries run in read-only transactions with timeout limits.',
  category: 'database',
  risk: 'medium',
  icon: '🗄️',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_db_query',
    name: 'Execute SQL Query',
    description: 'Run a read-only SQL SELECT query against a configured database. Automatically wraps in a read-only transaction with a 30-second timeout. Returns results as a JSON array of rows. Supports parameterized queries to prevent SQL injection.',
    category: 'read',
    risk: 'medium',
    skillId: 'enterprise-database',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Named database connection from vault (e.g., "production-db", "analytics-replica")' },
        query: { type: 'string', description: 'SQL SELECT query to execute. INSERT/UPDATE/DELETE/DROP are blocked.' },
        params: { type: 'array', items: { type: 'string' }, description: 'Parameterized values for $1, $2, etc. placeholders' },
        limit: { type: 'number', description: 'Maximum rows to return (default: 1000, max: 10000)', default: 1000 },
        format: { type: 'string', enum: ['json', 'csv', 'markdown'], description: 'Output format', default: 'json' },
        timeout: { type: 'number', description: 'Query timeout in seconds (default: 30, max: 120)', default: 30 },
      },
      required: ['connection', 'query'],
    },
  },
  {
    id: 'ent_db_schema',
    name: 'Inspect Database Schema',
    description: 'List tables, columns, types, indexes, and foreign keys for a database. Useful for understanding data structure before writing queries.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-database',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Named database connection' },
        table: { type: 'string', description: 'Specific table to inspect (omit for full schema)' },
        includeIndexes: { type: 'boolean', description: 'Include index definitions', default: false },
        includeForeignKeys: { type: 'boolean', description: 'Include foreign key relationships', default: true },
      },
      required: ['connection'],
    },
  },
  {
    id: 'ent_db_explain',
    name: 'Explain Query Plan',
    description: 'Run EXPLAIN ANALYZE on a query to understand execution plan, index usage, and performance characteristics without modifying data.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-database',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Named database connection' },
        query: { type: 'string', description: 'SQL query to analyze' },
        params: { type: 'array', items: { type: 'string' }, description: 'Parameterized values' },
      },
      required: ['connection', 'query'],
    },
  },
  {
    id: 'ent_db_connections',
    name: 'List Database Connections',
    description: 'List all configured database connections available to this agent, including connection type, host, and database name. Credentials are never exposed.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-database',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    id: 'ent_db_tables',
    name: 'List Tables',
    description: 'Quick list of all tables and views in a database with row counts and approximate sizes.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-database',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Named database connection' },
        schema: { type: 'string', description: 'Schema to list (default: public)', default: 'public' },
      },
      required: ['connection'],
    },
  },
  {
    id: 'ent_db_sample',
    name: 'Sample Table Data',
    description: 'Return a sample of rows from a table to understand data format and content. Returns 10 rows by default.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-database',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Named database connection' },
        table: { type: 'string', description: 'Table name to sample' },
        limit: { type: 'number', description: 'Number of sample rows', default: 10 },
      },
      required: ['connection', 'table'],
    },
  },
];
