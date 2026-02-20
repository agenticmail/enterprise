/**
 * MCP Skill Adapter — Snowflake
 *
 * Maps Snowflake SQL REST API endpoints to MCP tool handlers.
 * Covers query execution, database listing, and table listing.
 *
 * Snowflake uses a dynamic base URL derived from the account identifier:
 *   https://{account}.snowflakecomputing.com/api/v2
 *
 * Snowflake SQL API docs: https://docs.snowflake.com/en/developer-guide/sql-api
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Snowflake account URL from skill config or credentials */
function sfBaseUrl(ctx: ToolExecutionContext): string {
  const account =
    ctx.skillConfig.account ||
    ctx.credentials.fields?.account ||
    '';
  if (!account) {
    throw new Error('Snowflake account identifier is required. Set it in skillConfig.account or credentials.fields.account.');
  }
  return `https://${account}.snowflakecomputing.com/api/v2`;
}

function snowflakeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code || '';
      const message = data.message || '';
      const sqlState = data.data?.sqlState || '';
      if (message) {
        const sqlPart = sqlState ? ` (SQL state: ${sqlState})` : '';
        return {
          content: `Snowflake API error [${code}]${sqlPart}: ${message}`,
          isError: true,
        };
      }
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

/** Format a Snowflake result set into a human-readable table */
function formatResultSet(resultSet: any): string {
  const rowType: any[] = resultSet.resultSetMetaData?.rowType || [];
  const data: any[][] = resultSet.data || [];

  if (data.length === 0) {
    return 'Query returned 0 rows.';
  }

  const columns = rowType.map((col: any) => col.name || 'unknown');
  const header = columns.join(' | ');
  const separator = columns.map((c: string) => '-'.repeat(Math.max(c.length, 3))).join('-+-');

  const rows = data.map((row: any[]) =>
    row.map((cell: any) => (cell === null || cell === undefined) ? 'NULL' : String(cell)).join(' | ')
  );

  const maxRows = 50;
  const displayRows = rows.slice(0, maxRows);
  const truncNote = rows.length > maxRows ? `\n... and ${rows.length - maxRows} more row(s)` : '';

  return `${header}\n${separator}\n${displayRows.join('\n')}${truncNote}`;
}

// ─── Tool: snowflake_execute_query ──────────────────────

const executeQuery: ToolHandler = {
  description:
    'Execute a SQL query against Snowflake. Returns the result set as a formatted table with column names.',
  inputSchema: {
    type: 'object',
    properties: {
      statement: {
        type: 'string',
        description: 'SQL statement to execute (e.g. "SELECT * FROM my_table LIMIT 10")',
      },
      database: {
        type: 'string',
        description: 'Database context for the query (optional if set at session level)',
      },
      schema: {
        type: 'string',
        description: 'Schema context for the query (optional)',
      },
      warehouse: {
        type: 'string',
        description: 'Warehouse to use for the query (optional if default is set)',
      },
      role: {
        type: 'string',
        description: 'Role to use for the query (optional)',
      },
      timeout: {
        type: 'number',
        description: 'Query timeout in seconds (default 60)',
      },
    },
    required: ['statement'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfBaseUrl(ctx);

      const body: Record<string, any> = {
        statement: params.statement,
        timeout: params.timeout ?? 60,
      };
      if (params.database) body.database = params.database;
      if (params.schema) body.schema = params.schema;
      if (params.warehouse) body.warehouse = params.warehouse;
      if (params.role) body.role = params.role;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/statements`,
        body,
      });

      const statementHandle = result.statementHandle || '';
      const status = result.statementStatusUrl || '';
      const rowCount = result.resultSetMetaData?.numRows ?? result.data?.length ?? 0;

      const formatted = formatResultSet(result);

      return {
        content: `Query executed successfully (${rowCount} row(s)):\n\n${formatted}`,
        metadata: {
          statementHandle,
          rowCount,
          statement: params.statement,
          database: params.database || null,
          schema: params.schema || null,
        },
      };
    } catch (err) {
      return snowflakeError(err);
    }
  },
};

// ─── Tool: snowflake_list_databases ─────────────────────

const listDatabases: ToolHandler = {
  description:
    'List all databases in the Snowflake account. Returns database names, owners, and creation dates.',
  inputSchema: {
    type: 'object',
    properties: {
      warehouse: {
        type: 'string',
        description: 'Warehouse to use for the query (optional if default is set)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfBaseUrl(ctx);

      const body: Record<string, any> = {
        statement: 'SHOW DATABASES',
        timeout: 30,
      };
      if (params.warehouse) body.warehouse = params.warehouse;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/statements`,
        body,
      });

      const data: any[][] = result.data || [];
      const rowType: any[] = result.resultSetMetaData?.rowType || [];

      if (data.length === 0) {
        return { content: 'No databases found in this Snowflake account.' };
      }

      // Find column indices by name
      const colIndex = (name: string) => rowType.findIndex((c: any) =>
        c.name?.toLowerCase() === name.toLowerCase()
      );
      const nameIdx = colIndex('name');
      const ownerIdx = colIndex('owner');
      const createdIdx = colIndex('created_on');
      const commentIdx = colIndex('comment');

      const lines = data.map((row: any[]) => {
        const name = nameIdx >= 0 ? row[nameIdx] : 'unknown';
        const owner = ownerIdx >= 0 ? row[ownerIdx] : 'unknown';
        const created = createdIdx >= 0 ? row[createdIdx] : 'unknown';
        const comment = commentIdx >= 0 && row[commentIdx] ? ` — ${row[commentIdx]}` : '';
        return `• ${name} (owner: ${owner}, created: ${created})${comment}`;
      });

      return {
        content: `${data.length} database(s):\n\n${lines.join('\n')}`,
        metadata: { databaseCount: data.length },
      };
    } catch (err) {
      return snowflakeError(err);
    }
  },
};

// ─── Tool: snowflake_list_tables ────────────────────────

const listTables: ToolHandler = {
  description:
    'List tables in a Snowflake database and schema. Returns table names, row counts, and sizes.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Database name',
      },
      schema: {
        type: 'string',
        description: 'Schema name (default: "PUBLIC")',
      },
      warehouse: {
        type: 'string',
        description: 'Warehouse to use for the query (optional if default is set)',
      },
    },
    required: ['database'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfBaseUrl(ctx);
      const schema = params.schema || 'PUBLIC';

      const body: Record<string, any> = {
        statement: `SHOW TABLES IN "${params.database}"."${schema}"`,
        database: params.database,
        schema,
        timeout: 30,
      };
      if (params.warehouse) body.warehouse = params.warehouse;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/statements`,
        body,
      });

      const data: any[][] = result.data || [];
      const rowType: any[] = result.resultSetMetaData?.rowType || [];

      if (data.length === 0) {
        return {
          content: `No tables found in "${params.database}"."${schema}".`,
          metadata: { tableCount: 0, database: params.database, schema },
        };
      }

      const colIndex = (name: string) => rowType.findIndex((c: any) =>
        c.name?.toLowerCase() === name.toLowerCase()
      );
      const nameIdx = colIndex('name');
      const rowsIdx = colIndex('rows');
      const bytesIdx = colIndex('bytes');
      const ownerIdx = colIndex('owner');
      const kindIdx = colIndex('kind');

      const lines = data.map((row: any[]) => {
        const name = nameIdx >= 0 ? row[nameIdx] : 'unknown';
        const rows = rowsIdx >= 0 ? row[rowsIdx] : '?';
        const bytes = bytesIdx >= 0 ? row[bytesIdx] : null;
        const owner = ownerIdx >= 0 ? row[ownerIdx] : '';
        const kind = kindIdx >= 0 ? row[kindIdx] : '';

        const sizePart = bytes ? `, size: ${formatBytes(Number(bytes))}` : '';
        const kindPart = kind ? ` [${kind}]` : '';
        const ownerPart = owner ? `, owner: ${owner}` : '';
        return `• ${name}${kindPart} — rows: ${rows}${sizePart}${ownerPart}`;
      });

      return {
        content: `${data.length} table(s) in "${params.database}"."${schema}":\n\n${lines.join('\n')}`,
        metadata: {
          tableCount: data.length,
          database: params.database,
          schema,
        },
      };
    } catch (err) {
      return snowflakeError(err);
    }
  },
};

/** Format byte count into human-readable size */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${size} ${units[i]}`;
}

// ─── Adapter Export ─────────────────────────────────────

export const snowflakeAdapter: SkillAdapter = {
  skillId: 'snowflake-warehouse',
  name: 'Snowflake',
  // Base URL is dynamic from ctx.skillConfig.account; tools use full URLs
  baseUrl: 'https://account.snowflakecomputing.com/api/v2',
  auth: {
    type: 'credentials',
    fields: ['account', 'username', 'password'],
  },
  tools: {
    snowflake_execute_query: executeQuery,
    snowflake_list_databases: listDatabases,
    snowflake_list_tables: listTables,
  },
  configSchema: {
    account: {
      type: 'string' as const,
      label: 'Snowflake Account',
      description: 'Your Snowflake account identifier (e.g. xy12345.us-east-1)',
      required: true,
      placeholder: 'xy12345.us-east-1',
    },
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
