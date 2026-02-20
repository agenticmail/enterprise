/**
 * MCP Skill Adapter — Contentful
 *
 * Maps Contentful Content Management API endpoints to MCP tool handlers.
 * Covers entries, content types, and publishing operations.
 *
 * Contentful CMA docs: https://www.contentful.com/developers/docs/references/content-management-api/
 *
 * API paths include spaceId and environmentId from skillConfig.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Build the Contentful space/environment path prefix */
function cfPrefix(ctx: ToolExecutionContext): string {
  const spaceId = ctx.skillConfig.spaceId;
  if (!spaceId) {
    throw new Error('Contentful spaceId is required in skillConfig');
  }
  const envId = ctx.skillConfig.environmentId || 'master';
  return `/spaces/${spaceId}/environments/${envId}`;
}

function contentfulError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const sysType = data.sys?.id || '';
      const message = data.message || err.message;
      const details = data.details?.errors
        ? ` -- ${data.details.errors.map((e: any) => e.details || e.name).join('; ')}`
        : '';
      return { content: `Contentful API error [${sysType}]: ${message}${details}`, isError: true };
    }
    return { content: `Contentful API error: ${err.message}`, isError: true };
  }
  return { content: `Contentful API error: ${String(err)}`, isError: true };
}

/** Format a Contentful entry for display */
function formatEntry(entry: any): string {
  const contentType = entry.sys?.contentType?.sys?.id || 'unknown';
  const id = entry.sys?.id || 'unknown';
  const version = entry.sys?.version ?? '?';
  const published = entry.sys?.publishedVersion ? 'published' : 'draft';
  const updatedAt = entry.sys?.updatedAt ? entry.sys.updatedAt.slice(0, 16) : '';

  // Try to extract a display name from fields
  const fields = entry.fields || {};
  const nameField = fields.title || fields.name || fields.heading;
  const name = nameField
    ? (typeof nameField === 'object' ? Object.values(nameField)[0] : nameField)
    : '(no title)';

  return `${name} [${contentType}] -- ${published} (v${version}) -- ${updatedAt} (ID: ${id})`;
}

// ─── Tool: contentful_list_entries ──────────────────────

const listEntries: ToolHandler = {
  description:
    'List content entries from Contentful. Optionally filter by content type, search query, or field values.',
  inputSchema: {
    type: 'object',
    properties: {
      content_type: {
        type: 'string',
        description: 'Filter by content type ID',
      },
      query: {
        type: 'string',
        description: 'Full-text search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum entries to return (default 20, max 1000)',
      },
      skip: {
        type: 'number',
        description: 'Number of entries to skip for pagination (default 0)',
      },
      order: {
        type: 'string',
        description: 'Sort order (e.g. "-sys.updatedAt" for newest first)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const prefix = cfPrefix(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        skip: String(params.skip ?? 0),
      };
      if (params.content_type) query.content_type = params.content_type;
      if (params.query) query.query = params.query;
      if (params.order) query.order = params.order;

      const result = await ctx.apiExecutor.get(`${prefix}/entries`, query);

      const entries: any[] = result.items || [];
      const total = result.total ?? entries.length;

      if (entries.length === 0) {
        return { content: 'No entries found.', metadata: { count: 0, total: 0 } };
      }

      const lines = entries.map((e: any) => formatEntry(e));

      return {
        content: `Found ${total} entries (showing ${entries.length}):\n${lines.join('\n')}`,
        metadata: { count: entries.length, total },
      };
    } catch (err) {
      return contentfulError(err);
    }
  },
};

// ─── Tool: contentful_get_entry ─────────────────────────

const getEntry: ToolHandler = {
  description:
    'Get a single content entry from Contentful by ID. Returns all fields and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      entry_id: {
        type: 'string',
        description: 'The entry ID to retrieve',
      },
    },
    required: ['entry_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const prefix = cfPrefix(ctx);

      const result = await ctx.apiExecutor.get(`${prefix}/entries/${params.entry_id}`);

      const contentType = result.sys?.contentType?.sys?.id || 'unknown';
      const version = result.sys?.version ?? '?';
      const published = result.sys?.publishedVersion ? 'published' : 'draft';

      // Format fields for display
      const fields = result.fields || {};
      const fieldLines = Object.entries(fields).map(([key, value]) => {
        const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const truncated = displayVal.length > 120 ? displayVal.slice(0, 120) + '...' : displayVal;
        return `  ${key}: ${truncated}`;
      });

      return {
        content: `Entry ${params.entry_id} [${contentType}] -- ${published} (v${version}):\n${fieldLines.join('\n')}`,
        metadata: {
          entryId: params.entry_id,
          contentType,
          version,
          published: !!result.sys?.publishedVersion,
        },
      };
    } catch (err) {
      return contentfulError(err);
    }
  },
};

// ─── Tool: contentful_create_entry ──────────────────────

const createEntry: ToolHandler = {
  description:
    'Create a new content entry in Contentful. Provide the content type and field values.',
  inputSchema: {
    type: 'object',
    properties: {
      content_type_id: {
        type: 'string',
        description: 'The content type ID for the new entry',
      },
      fields: {
        type: 'object',
        description: 'Field values keyed by field ID. Each value should be locale-keyed, e.g. { "title": { "en-US": "Hello" } }',
      },
    },
    required: ['content_type_id', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const prefix = cfPrefix(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `${prefix}/entries`,
        headers: {
          'X-Contentful-Content-Type': params.content_type_id,
        },
        body: { fields: params.fields },
      });

      return {
        content: `Entry created: ${formatEntry(result)}`,
        metadata: {
          entryId: result.sys?.id,
          contentType: params.content_type_id,
          version: result.sys?.version,
        },
      };
    } catch (err) {
      return contentfulError(err);
    }
  },
};

// ─── Tool: contentful_list_content_types ────────────────

const listContentTypes: ToolHandler = {
  description:
    'List content types defined in the Contentful space. Returns type names, IDs, and field definitions.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of content types to return (default 25, max 1000)',
      },
      skip: {
        type: 'number',
        description: 'Number of content types to skip for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const prefix = cfPrefix(ctx);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        skip: String(params.skip ?? 0),
      };

      const result = await ctx.apiExecutor.get(`${prefix}/content_types`, query);

      const types: any[] = result.items || [];
      const total = result.total ?? types.length;

      if (types.length === 0) {
        return { content: 'No content types found.', metadata: { count: 0 } };
      }

      const lines = types.map((ct: any) => {
        const name = ct.name || '(unnamed)';
        const id = ct.sys?.id || 'unknown';
        const fieldCount = ct.fields?.length ?? 0;
        const displayField = ct.displayField || 'N/A';
        return `${name} (${id}) -- ${fieldCount} fields -- display: ${displayField}`;
      });

      return {
        content: `Found ${total} content types (showing ${types.length}):\n${lines.join('\n')}`,
        metadata: { count: types.length, total },
      };
    } catch (err) {
      return contentfulError(err);
    }
  },
};

// ─── Tool: contentful_publish_entry ─────────────────────

const publishEntry: ToolHandler = {
  description:
    'Publish a content entry in Contentful. The entry must have been saved first. Requires the current version number for optimistic locking.',
  inputSchema: {
    type: 'object',
    properties: {
      entry_id: {
        type: 'string',
        description: 'The entry ID to publish',
      },
      version: {
        type: 'number',
        description: 'Current version of the entry (for optimistic locking)',
      },
    },
    required: ['entry_id', 'version'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const prefix = cfPrefix(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        path: `${prefix}/entries/${params.entry_id}/published`,
        headers: {
          'X-Contentful-Version': String(params.version),
        },
      });

      return {
        content: `Entry published: ${formatEntry(result)}`,
        metadata: {
          entryId: params.entry_id,
          publishedVersion: result.sys?.publishedVersion,
        },
      };
    } catch (err) {
      return contentfulError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const contentfulAdapter: SkillAdapter = {
  skillId: 'contentful',
  name: 'Contentful CMS',
  baseUrl: 'https://api.contentful.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    contentful_list_entries: listEntries,
    contentful_get_entry: getEntry,
    contentful_create_entry: createEntry,
    contentful_list_content_types: listContentTypes,
    contentful_publish_entry: publishEntry,
  },
  configSchema: {
    spaceId: {
      type: 'string' as const,
      label: 'Space ID',
      description: 'Your Contentful space ID',
      required: true,
    },
    environmentId: {
      type: 'string' as const,
      label: 'Environment',
      description: 'Contentful environment (defaults to "master")',
      default: 'master',
    },
  },
  rateLimits: {
    requestsPerSecond: 7,
    burstLimit: 15,
  },
};
