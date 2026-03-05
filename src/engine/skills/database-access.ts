import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'database-access',
  name: 'External Database Access',
  description: 'Query external databases (Postgres, MySQL, MongoDB, Redis, Supabase, etc.) that have been granted to this agent by an admin. Supports read/write operations based on granted permissions.',
  category: 'database',
  risk: 'medium',
  icon: Emoji.database,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'db_list_connections',
    name: 'List Database Connections',
    description: 'List all external database connections this agent has been granted access to.',
    category: 'read',
    risk: 'low',
    skillId: 'database-access',
    sideEffects: [],
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'db_query',
    name: 'Query External Database',
    description: 'Execute a SQL query on a granted external database connection.',
    category: 'read',
    risk: 'medium',
    skillId: 'database-access',
    sideEffects: ['database_write'],
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
        sql: { type: 'string', description: 'SQL query to execute' },
        params: { type: 'array', items: { type: 'string' }, description: 'Query parameters' },
      },
      required: ['connectionId', 'sql'],
    },
  },
  {
    id: 'db_describe_table',
    name: 'Describe Table Schema',
    description: 'Get the schema (columns, types, constraints) of a table in an external database.',
    category: 'read',
    risk: 'low',
    skillId: 'database-access',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
        table: { type: 'string', description: 'Table name' },
      },
      required: ['connectionId', 'table'],
    },
  },
  {
    id: 'db_list_tables',
    name: 'List Tables',
    description: 'List all tables in an external database connection.',
    category: 'read',
    risk: 'low',
    skillId: 'database-access',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Database connection ID' },
      },
      required: ['connectionId'],
    },
  },
];
