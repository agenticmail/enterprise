/**
 * MCP Skill Adapter — Salesforce
 *
 * Maps Salesforce REST API endpoints to MCP tool handlers.
 * Salesforce uses dynamic instance URLs (e.g. https://na1.salesforce.com),
 * so all calls use `ctx.apiExecutor.request()` with a full URL built from
 * the configured instance URL.
 *
 * Salesforce REST API docs: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

const API_VERSION = 'v59.0';

/** Resolve the Salesforce instance URL from skill config or credentials */
function sfUrl(ctx: ToolExecutionContext): string {
  return (
    ctx.skillConfig.instanceUrl ||
    ctx.credentials.fields?.instanceUrl ||
    'https://login.salesforce.com'
  ).replace(/\/$/, '');
}

function sfError(err: unknown): ToolResult {
  if (err instanceof Error) {
    // Salesforce error responses are typically an array: [{ errorCode, message, fields }]
    const data = (err as any).data;
    if (Array.isArray(data) && data.length > 0) {
      const details = data.map((e: any) => `${e.errorCode}: ${e.message}`).join('; ');
      return { content: `Salesforce API error: ${details}`, isError: true };
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

/** Format a Salesforce record as human-readable key-value pairs */
function formatRecord(record: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    // Skip Salesforce metadata fields
    if (key === 'attributes') continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'object' && value.attributes) {
      // Related object — show its Name or Id
      lines.push(`${key}: ${value.Name || value.Id || JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

/** Format a record summary (for list/search results) */
function formatRecordSummary(record: Record<string, any>): string {
  const type = record.attributes?.type || 'Record';
  const id = record.Id || 'unknown';
  const name = record.Name || record.Subject || record.Title || '';
  const extra: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (['attributes', 'Id', 'Name', 'Subject', 'Title'].includes(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    extra.push(`${key}: ${value}`);
  }

  const namePart = name ? ` — ${name}` : '';
  const extraPart = extra.length > 0 ? ` (${extra.slice(0, 4).join(', ')})` : '';
  return `[${type}] ${id}${namePart}${extraPart}`;
}

// ─── Tool: salesforce_query ─────────────────────────────

const query: ToolHandler = {
  description:
    'Execute a SOQL query against Salesforce. Returns matching records with their fields.',
  inputSchema: {
    type: 'object',
    properties: {
      soql: {
        type: 'string',
        description: 'SOQL query string (e.g. "SELECT Id, Name FROM Account WHERE Industry = \'Technology\' LIMIT 10")',
      },
    },
    required: ['soql'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfUrl(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/services/data/${API_VERSION}/query`,
        query: { q: params.soql },
      });

      const records: any[] = result.records || [];
      const totalSize = result.totalSize ?? records.length;

      if (records.length === 0) {
        return { content: `Found 0 records for query: ${params.soql}` };
      }

      const lines = records.map((r: any) => formatRecordSummary(r));

      return {
        content: `Found ${totalSize} records:\n${lines.join('\n')}`,
        metadata: { totalSize, shown: records.length, soql: params.soql },
      };
    } catch (err) {
      return sfError(err);
    }
  },
};

// ─── Tool: salesforce_get_record ────────────────────────

const getRecord: ToolHandler = {
  description:
    'Retrieve a single Salesforce record by its object type and ID. Returns all accessible fields.',
  inputSchema: {
    type: 'object',
    properties: {
      sobject: {
        type: 'string',
        description: 'Salesforce object type (e.g. "Account", "Contact", "Opportunity")',
      },
      id: {
        type: 'string',
        description: 'The Salesforce record ID (15 or 18 character)',
      },
    },
    required: ['sobject', 'id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfUrl(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/services/data/${API_VERSION}/sobjects/${params.sobject}/${params.id}`,
      });

      return {
        content: formatRecord(result),
        metadata: { sobject: params.sobject, id: params.id },
      };
    } catch (err) {
      return sfError(err);
    }
  },
};

// ─── Tool: salesforce_create_record ─────────────────────

const createRecord: ToolHandler = {
  description:
    'Create a new Salesforce record. Specify the object type and field values.',
  inputSchema: {
    type: 'object',
    properties: {
      sobject: {
        type: 'string',
        description: 'Salesforce object type (e.g. "Account", "Contact", "Lead")',
      },
      fields: {
        type: 'object',
        description: 'Field values for the new record (e.g. { "Name": "Acme Corp", "Industry": "Technology" })',
      },
    },
    required: ['sobject', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfUrl(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/services/data/${API_VERSION}/sobjects/${params.sobject}`,
        body: params.fields,
      });

      return {
        content: `Created ${params.sobject} record: ${result.id}`,
        metadata: { sobject: params.sobject, id: result.id, success: result.success },
      };
    } catch (err) {
      return sfError(err);
    }
  },
};

// ─── Tool: salesforce_update_record ─────────────────────

const updateRecord: ToolHandler = {
  description:
    'Update an existing Salesforce record. Specify the object type, record ID, and fields to update.',
  inputSchema: {
    type: 'object',
    properties: {
      sobject: {
        type: 'string',
        description: 'Salesforce object type (e.g. "Account", "Contact", "Opportunity")',
      },
      id: {
        type: 'string',
        description: 'The Salesforce record ID to update',
      },
      fields: {
        type: 'object',
        description: 'Field values to update (e.g. { "Industry": "Finance", "Rating": "Hot" })',
      },
    },
    required: ['sobject', 'id', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfUrl(ctx);
      // Salesforce PATCH returns 204 No Content on success
      await ctx.apiExecutor.request({
        method: 'PATCH',
        url: `${baseUrl}/services/data/${API_VERSION}/sobjects/${params.sobject}/${params.id}`,
        body: params.fields,
      });

      return {
        content: `Updated ${params.sobject} ${params.id}`,
        metadata: { sobject: params.sobject, id: params.id },
      };
    } catch (err) {
      return sfError(err);
    }
  },
};

// ─── Tool: salesforce_search ────────────────────────────

const search: ToolHandler = {
  description:
    'Execute a SOSL search across Salesforce objects. Returns matching records across multiple object types.',
  inputSchema: {
    type: 'object',
    properties: {
      sosl: {
        type: 'string',
        description: 'SOSL query string (e.g. "FIND {Acme} IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Name, Email)")',
      },
    },
    required: ['sosl'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sfUrl(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/services/data/${API_VERSION}/search`,
        query: { q: params.sosl },
      });

      const searchRecords: any[] = result.searchRecords || result || [];

      if (!Array.isArray(searchRecords) || searchRecords.length === 0) {
        return { content: `No results found for search: ${params.sosl}` };
      }

      const lines = searchRecords.map((r: any) => {
        const type = r.attributes?.type || 'Record';
        const name = r.Name || r.Subject || r.Title || r.Id || 'unknown';
        return `[${type}] ${name} (${r.Id})`;
      });

      return {
        content: `Found ${searchRecords.length} results:\n${lines.join('\n')}`,
        metadata: { count: searchRecords.length, sosl: params.sosl },
      };
    } catch (err) {
      return sfError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const salesforceAdapter: SkillAdapter = {
  skillId: 'salesforce',
  name: 'Salesforce',
  // Base URL is dynamic; individual tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://login.salesforce.com',
  auth: {
    type: 'oauth2',
    provider: 'salesforce',
    headerPrefix: 'Bearer',
  },
  tools: {
    salesforce_query: query,
    salesforce_get_record: getRecord,
    salesforce_create_record: createRecord,
    salesforce_update_record: updateRecord,
    salesforce_search: search,
  },
  configSchema: {
    instanceUrl: {
      type: 'string' as const,
      label: 'Salesforce Instance URL',
      description: 'Your Salesforce instance URL',
      required: true,
      placeholder: 'https://yourorg.my.salesforce.com',
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
