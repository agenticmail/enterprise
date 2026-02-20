/**
 * MCP Skill Adapter — Pinecone
 *
 * Maps Pinecone Vector Database API endpoints to MCP tool handlers.
 * Covers index management, vector upsert, query, and deletion.
 *
 * Pinecone API docs: https://docs.pinecone.io/reference/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function pineconeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.error || err.message;
      return { content: `Pinecone API error: ${detail}`, isError: true };
    }
    return { content: `Pinecone API error: ${err.message}`, isError: true };
  }
  return { content: `Pinecone API error: ${String(err)}`, isError: true };
}

/**
 * Pinecone data-plane operations (query, upsert, delete) go to the
 * index-specific host. This helper resolves the host URL from skillConfig.
 */
function indexHost(ctx: ToolExecutionContext, indexName?: string): string {
  // If a per-index host is stored in skillConfig, use it directly
  const host = ctx.skillConfig.indexHost;
  if (host) return host.replace(/\/$/, '');

  // Otherwise, fall back to the standard pattern
  const name = indexName || ctx.skillConfig.indexName || '';
  const environment = ctx.skillConfig.environment || '';
  if (name && environment) {
    return `https://${name}-${environment}.svc.pinecone.io`;
  }

  // Final fallback — the control plane base URL (won't work for data-plane calls)
  return 'https://api.pinecone.io';
}

// ─── Tool: pinecone_list_indexes ────────────────────────

const listIndexes: ToolHandler = {
  description:
    'List all Pinecone indexes in the account. Returns index names, dimensions, and status.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/indexes');

      const indexes: any[] = result.indexes || [];
      if (indexes.length === 0) {
        return { content: 'No indexes found.' };
      }

      const lines = indexes.map((idx: any) => {
        const status = idx.status?.ready ? 'ready' : idx.status?.state || 'unknown';
        return `${idx.name} — dimension: ${idx.dimension}, metric: ${idx.metric}, status: ${status}`;
      });

      return {
        content: `Found ${indexes.length} indexes:\n${lines.join('\n')}`,
        metadata: { count: indexes.length },
      };
    } catch (err) {
      return pineconeError(err);
    }
  },
};

// ─── Tool: pinecone_query ───────────────────────────────

const queryVectors: ToolHandler = {
  description:
    'Query a Pinecone index for the nearest vectors to a given query vector. Returns IDs, scores, and optional metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      indexName: {
        type: 'string',
        description: 'Name of the Pinecone index to query',
      },
      vector: {
        type: 'array',
        items: { type: 'number' },
        description: 'Query vector (array of floats matching the index dimension)',
      },
      topK: {
        type: 'number',
        description: 'Number of nearest results to return (default 10)',
      },
      namespace: {
        type: 'string',
        description: 'Namespace to query within (optional)',
      },
      includeMetadata: {
        type: 'boolean',
        description: 'Whether to include metadata in the response (default true)',
      },
    },
    required: ['vector'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = indexHost(ctx, params.indexName);

      const body: Record<string, any> = {
        vector: params.vector,
        topK: params.topK ?? 10,
        includeMetadata: params.includeMetadata ?? true,
      };
      if (params.namespace) body.namespace = params.namespace;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/query`,
        body,
      });

      const matches: any[] = result.matches || [];
      if (matches.length === 0) {
        return { content: 'No matching vectors found.' };
      }

      const lines = matches.map((m: any) => {
        const meta = m.metadata ? ` — ${JSON.stringify(m.metadata)}` : '';
        return `${m.id} (score: ${m.score?.toFixed(4) ?? '?'})${meta}`;
      });

      return {
        content: `Found ${matches.length} matches:\n${lines.join('\n')}`,
        metadata: { count: matches.length, namespace: params.namespace },
      };
    } catch (err) {
      return pineconeError(err);
    }
  },
};

// ─── Tool: pinecone_upsert ──────────────────────────────

const upsertVectors: ToolHandler = {
  description:
    'Upsert vectors into a Pinecone index. Insert new vectors or update existing ones by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      indexName: {
        type: 'string',
        description: 'Name of the Pinecone index',
      },
      vectors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique vector ID' },
            values: { type: 'array', items: { type: 'number' }, description: 'Vector values' },
            metadata: { type: 'object', description: 'Optional metadata key-value pairs' },
          },
          required: ['id', 'values'],
        },
        description: 'Array of vectors to upsert',
      },
      namespace: {
        type: 'string',
        description: 'Namespace to upsert into (optional)',
      },
    },
    required: ['vectors'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = indexHost(ctx, params.indexName);

      const body: Record<string, any> = {
        vectors: params.vectors,
      };
      if (params.namespace) body.namespace = params.namespace;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/vectors/upsert`,
        body,
      });

      const count = result.upsertedCount ?? params.vectors.length;

      return {
        content: `Upserted ${count} vector(s) into index${params.namespace ? ` (namespace: ${params.namespace})` : ''}.`,
        metadata: { upsertedCount: count, namespace: params.namespace },
      };
    } catch (err) {
      return pineconeError(err);
    }
  },
};

// ─── Tool: pinecone_describe_index ──────────────────────

const describeIndex: ToolHandler = {
  description:
    'Get detailed information about a specific Pinecone index including its configuration, status, and stats.',
  inputSchema: {
    type: 'object',
    properties: {
      indexName: {
        type: 'string',
        description: 'Name of the Pinecone index to describe',
      },
    },
    required: ['indexName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/indexes/${params.indexName}`);

      const lines = [
        `Name: ${result.name}`,
        `Dimension: ${result.dimension}`,
        `Metric: ${result.metric}`,
        `Host: ${result.host || 'unknown'}`,
        `Status: ${result.status?.ready ? 'ready' : result.status?.state || 'unknown'}`,
      ];

      if (result.spec?.pod) {
        lines.push(`Type: pod (${result.spec.pod.podType})`);
        lines.push(`Replicas: ${result.spec.pod.replicas}`);
      } else if (result.spec?.serverless) {
        lines.push(`Type: serverless (${result.spec.serverless.cloud} / ${result.spec.serverless.region})`);
      }

      return {
        content: lines.join('\n'),
        metadata: { indexName: result.name, dimension: result.dimension, metric: result.metric },
      };
    } catch (err) {
      return pineconeError(err);
    }
  },
};

// ─── Tool: pinecone_delete_vectors ──────────────────────

const deleteVectors: ToolHandler = {
  description:
    'Delete vectors from a Pinecone index by ID list, by metadata filter, or delete all vectors in a namespace.',
  inputSchema: {
    type: 'object',
    properties: {
      indexName: {
        type: 'string',
        description: 'Name of the Pinecone index',
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of vector IDs to delete',
      },
      namespace: {
        type: 'string',
        description: 'Namespace to delete from (optional)',
      },
      deleteAll: {
        type: 'boolean',
        description: 'Delete all vectors in the namespace (default false)',
      },
      filter: {
        type: 'object',
        description: 'Metadata filter to select vectors for deletion (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = indexHost(ctx, params.indexName);

      const body: Record<string, any> = {};
      if (params.ids?.length) body.ids = params.ids;
      if (params.namespace) body.namespace = params.namespace;
      if (params.deleteAll) body.deleteAll = true;
      if (params.filter) body.filter = params.filter;

      await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/vectors/delete`,
        body,
      });

      const target = params.deleteAll
        ? 'all vectors'
        : params.ids?.length
          ? `${params.ids.length} vector(s)`
          : 'matching vectors';

      return {
        content: `Deleted ${target}${params.namespace ? ` from namespace "${params.namespace}"` : ''}.`,
        metadata: { ids: params.ids, namespace: params.namespace, deleteAll: params.deleteAll },
      };
    } catch (err) {
      return pineconeError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const pineconeAdapter: SkillAdapter = {
  skillId: 'pinecone',
  name: 'Pinecone',
  baseUrl: 'https://api.pinecone.io',
  auth: {
    type: 'api_key',
    headerName: 'Api-Key',
  },
  tools: {
    pinecone_list_indexes: listIndexes,
    pinecone_query: queryVectors,
    pinecone_upsert: upsertVectors,
    pinecone_describe_index: describeIndex,
    pinecone_delete_vectors: deleteVectors,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
