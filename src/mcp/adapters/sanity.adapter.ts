/**
 * MCP Skill Adapter — Sanity CMS
 *
 * Maps Sanity.io API endpoints to MCP tool handlers.
 * Covers GROQ queries, document CRUD, and dataset management.
 *
 * Sanity API docs: https://www.sanity.io/docs/http-api
 *
 * Base URL is dynamic based on the project ID:
 * https://{projectId}.api.sanity.io/v2024-01-01
 *
 * The project ID and dataset are read from ctx.skillConfig.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Sanity base URL from skill config */
function sanityUrl(ctx: ToolExecutionContext): string {
  const projectId = ctx.skillConfig.projectId;
  if (!projectId) {
    throw new Error('Sanity projectId is required in skillConfig');
  }
  return `https://${projectId}.api.sanity.io/v2024-01-01`;
}

/** Get the dataset from skill config, defaulting to 'production' */
function sanityDataset(ctx: ToolExecutionContext): string {
  return ctx.skillConfig.dataset || 'production';
}

function sanityError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.error?.description || err.message;
      const statusCode = data.statusCode ? ` [${data.statusCode}]` : '';
      return { content: `Sanity API error${statusCode}: ${message}`, isError: true };
    }
    return { content: `Sanity API error: ${err.message}`, isError: true };
  }
  return { content: `Sanity API error: ${String(err)}`, isError: true };
}

/** Format a Sanity document for display */
function formatDocument(doc: any): string {
  const type = doc._type || 'unknown';
  const id = doc._id || 'unknown';
  const title = doc.title || doc.name || doc.slug?.current || '(untitled)';
  const updatedAt = doc._updatedAt ? doc._updatedAt.slice(0, 16) : '';
  return `${title} [${type}] -- ${updatedAt} (ID: ${id})`;
}

// ─── Tool: sanity_query ─────────────────────────────────

const query: ToolHandler = {
  description:
    'Execute a GROQ query against a Sanity dataset. Returns matching documents. GROQ is Sanity\'s query language (e.g. *[_type == "post"]{title, slug}).',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'GROQ query string (e.g. \'*[_type == "post"]{title, slug, _id}\')',
      },
      params: {
        type: 'object',
        description: 'Query parameters for parameterized GROQ queries (e.g. { "$type": "post" })',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sanityUrl(ctx);
      const dataset = sanityDataset(ctx);

      const queryParams: Record<string, string> = {
        query: params.query,
      };
      // Pass GROQ parameters as $-prefixed query parameters
      if (params.params && typeof params.params === 'object') {
        for (const [key, value] of Object.entries(params.params)) {
          queryParams[key] = JSON.stringify(value);
        }
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/data/query/${dataset}`,
        query: queryParams,
      });

      const docs: any[] = result.result || [];
      if (docs.length === 0) {
        return { content: 'Query returned no results.', metadata: { count: 0 } };
      }

      const lines = docs.map((doc: any) => {
        if (typeof doc === 'string' || typeof doc === 'number') return String(doc);
        return formatDocument(doc);
      });

      return {
        content: `Query returned ${docs.length} results:\n${lines.join('\n')}`,
        metadata: { count: docs.length, query: params.query },
      };
    } catch (err) {
      return sanityError(err);
    }
  },
};

// ─── Tool: sanity_create_document ───────────────────────

const createDocument: ToolHandler = {
  description:
    'Create a new document in a Sanity dataset. Provide the document type and fields.',
  inputSchema: {
    type: 'object',
    properties: {
      _type: {
        type: 'string',
        description: 'Document type (e.g. "post", "author", "category")',
      },
      _id: {
        type: 'string',
        description: 'Optional custom document ID (auto-generated if not provided)',
      },
      document: {
        type: 'object',
        description: 'Document fields (e.g. { "title": "My Post", "body": [...] })',
      },
    },
    required: ['_type', 'document'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sanityUrl(ctx);
      const dataset = sanityDataset(ctx);

      const doc: Record<string, any> = {
        _type: params._type,
        ...params.document,
      };
      if (params._id) doc._id = params._id;

      const mutations = [{ create: doc }];

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/data/mutate/${dataset}`,
        body: { mutations },
      });

      const created = result.results?.[0];
      const docId = created?.id || params._id || 'unknown';

      return {
        content: `Document created: ${params._type} (ID: ${docId})`,
        metadata: { documentId: docId, type: params._type },
      };
    } catch (err) {
      return sanityError(err);
    }
  },
};

// ─── Tool: sanity_patch_document ────────────────────────

const patchDocument: ToolHandler = {
  description:
    'Patch (update) an existing document in a Sanity dataset. Supports set, unset, and inc operations.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The document ID to patch',
      },
      set: {
        type: 'object',
        description: 'Fields to set (e.g. { "title": "New Title" })',
      },
      unset: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field paths to unset/remove (e.g. ["tempField", "oldField"])',
      },
      inc: {
        type: 'object',
        description: 'Fields to increment (e.g. { "viewCount": 1 })',
      },
      ifRevisionId: {
        type: 'string',
        description: 'Revision ID for optimistic locking (optional)',
      },
    },
    required: ['document_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sanityUrl(ctx);
      const dataset = sanityDataset(ctx);

      const patch: Record<string, any> = {
        id: params.document_id,
      };
      if (params.set) patch.set = params.set;
      if (params.unset) patch.unset = params.unset;
      if (params.inc) patch.inc = params.inc;
      if (params.ifRevisionId) patch.ifRevisionID = params.ifRevisionId;

      const mutations = [{ patch }];

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/data/mutate/${dataset}`,
        body: { mutations },
      });

      const patched = result.results?.[0];

      return {
        content: `Document ${params.document_id} patched successfully.`,
        metadata: {
          documentId: params.document_id,
          transactionId: result.transactionId,
          revision: patched?.document?._rev,
        },
      };
    } catch (err) {
      return sanityError(err);
    }
  },
};

// ─── Tool: sanity_delete_document ───────────────────────

const deleteDocument: ToolHandler = {
  description:
    'Delete a document from a Sanity dataset by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The document ID to delete',
      },
    },
    required: ['document_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sanityUrl(ctx);
      const dataset = sanityDataset(ctx);

      const mutations = [{ delete: { id: params.document_id } }];

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/data/mutate/${dataset}`,
        body: { mutations },
      });

      return {
        content: `Document ${params.document_id} deleted.`,
        metadata: {
          documentId: params.document_id,
          transactionId: result.transactionId,
        },
      };
    } catch (err) {
      return sanityError(err);
    }
  },
};

// ─── Tool: sanity_list_datasets ─────────────────────────

const listDatasets: ToolHandler = {
  description:
    'List all datasets in the Sanity project. Returns dataset names and visibility settings.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const projectId = ctx.skillConfig.projectId;
      if (!projectId) {
        return { content: 'Sanity projectId is required in skillConfig.', isError: true };
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `https://api.sanity.io/v2024-01-01/projects/${projectId}/datasets`,
      });

      const datasets: any[] = Array.isArray(result) ? result : [];
      if (datasets.length === 0) {
        return { content: 'No datasets found.', metadata: { count: 0 } };
      }

      const lines = datasets.map((ds: any) => {
        const name = ds.name || '(unnamed)';
        const acl = ds.aclMode || 'unknown';
        return `${name} -- visibility: ${acl}`;
      });

      return {
        content: `Found ${datasets.length} datasets:\n${lines.join('\n')}`,
        metadata: { count: datasets.length, projectId },
      };
    } catch (err) {
      return sanityError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const sanityAdapter: SkillAdapter = {
  skillId: 'sanity',
  name: 'Sanity CMS',
  // Base URL is dynamic based on project ID; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://PROJECT_ID.api.sanity.io/v2024-01-01',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    sanity_query: query,
    sanity_create_document: createDocument,
    sanity_patch_document: patchDocument,
    sanity_delete_document: deleteDocument,
    sanity_list_datasets: listDatasets,
  },
  configSchema: {
    projectId: {
      type: 'string' as const,
      label: 'Project ID',
      description: 'Your Sanity project ID',
      required: true,
    },
    dataset: {
      type: 'string' as const,
      label: 'Dataset',
      description: 'Sanity dataset name (defaults to "production")',
      default: 'production',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
