/**
 * MCP Skill Adapter — Weaviate
 *
 * Maps Weaviate Vector Database REST API v1 endpoints to MCP tool handlers.
 * Covers object creation, schema inspection, querying, and searching.
 *
 * Weaviate uses cluster-specific URLs (e.g. https://CLUSTER.weaviate.network/v1).
 * The actual cluster URL is resolved from skillConfig at runtime.
 *
 * Weaviate REST API docs: https://weaviate.io/developers/weaviate/api/rest
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Weaviate cluster URL from skill config */
function clusterUrl(ctx: ToolExecutionContext): string {
  const url =
    ctx.skillConfig.clusterUrl ||
    ctx.credentials.fields?.clusterUrl ||
    '';
  if (!url) {
    throw new Error('Weaviate cluster URL is required. Set it in skillConfig.clusterUrl.');
  }
  return url.replace(/\/$/, '');
}

function weaviateError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.error?.[0]?.message || data.message || err.message;
      return { content: `Weaviate API error: ${detail}`, isError: true };
    }
    return { content: `Weaviate API error: ${err.message}`, isError: true };
  }
  return { content: `Weaviate API error: ${String(err)}`, isError: true };
}

// ─── Tool: weaviate_query ───────────────────────────────

const queryObjects: ToolHandler = {
  description:
    'Query objects from a Weaviate class using GraphQL. Supports nearVector, nearText, and BM25 search strategies.',
  inputSchema: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'The Weaviate class name to query (e.g. "Article", "Document")',
      },
      fields: {
        type: 'string',
        description: 'Space-separated list of fields to return (e.g. "title content")',
      },
      nearText: {
        type: 'object',
        properties: {
          concepts: { type: 'array', items: { type: 'string' }, description: 'Concepts for semantic search' },
        },
        description: 'Semantic search by text concepts (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 10)',
      },
    },
    required: ['className'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = clusterUrl(ctx);
      const fields = params.fields || '_additional { id }';
      const limit = params.limit ?? 10;

      let nearClause = '';
      if (params.nearText?.concepts?.length) {
        nearClause = `, nearText: { concepts: ${JSON.stringify(params.nearText.concepts)} }`;
      }

      const query = `{
        Get {
          ${params.className}(limit: ${limit}${nearClause}) {
            ${fields}
            _additional { id distance }
          }
        }
      }`;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/v1/graphql`,
        body: { query },
      });

      const objects: any[] = result.data?.Get?.[params.className] || [];
      if (objects.length === 0) {
        return { content: `No objects found in class "${params.className}".` };
      }

      const lines = objects.map((obj: any) => {
        const id = obj._additional?.id || 'unknown';
        const dist = obj._additional?.distance != null ? ` (distance: ${obj._additional.distance})` : '';
        const fieldValues = Object.entries(obj)
          .filter(([k]) => k !== '_additional')
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v)}`)
          .join(', ');
        return `[${id}]${dist} ${fieldValues}`;
      });

      return {
        content: `Found ${objects.length} objects in "${params.className}":\n${lines.join('\n')}`,
        metadata: { count: objects.length, className: params.className },
      };
    } catch (err) {
      return weaviateError(err);
    }
  },
};

// ─── Tool: weaviate_create_object ───────────────────────

const createObject: ToolHandler = {
  description:
    'Create a new object in a Weaviate class. Provide the class name and property values.',
  inputSchema: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'The Weaviate class to create the object in',
      },
      properties: {
        type: 'object',
        description: 'Property values for the new object (e.g. { "title": "Hello", "content": "World" })',
      },
      id: {
        type: 'string',
        description: 'Optional UUID for the object (auto-generated if omitted)',
      },
      vector: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional custom vector (bypass vectorizer)',
      },
    },
    required: ['className', 'properties'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = clusterUrl(ctx);

      const body: Record<string, any> = {
        class: params.className,
        properties: params.properties,
      };
      if (params.id) body.id = params.id;
      if (params.vector) body.vector = params.vector;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/v1/objects`,
        body,
      });

      return {
        content: `Object created in "${params.className}" with ID: ${result.id}`,
        metadata: { id: result.id, className: params.className },
      };
    } catch (err) {
      return weaviateError(err);
    }
  },
};

// ─── Tool: weaviate_get_schema ──────────────────────────

const getSchema: ToolHandler = {
  description:
    'Retrieve the full Weaviate schema including all classes, their properties, vectorizer config, and module settings.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = clusterUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/v1/schema`,
      });

      const classes: any[] = result.classes || [];
      if (classes.length === 0) {
        return { content: 'Schema is empty — no classes defined.' };
      }

      const lines = classes.map((cls: any) => {
        const props = (cls.properties || []).map((p: any) => `  - ${p.name}: ${p.dataType?.join(', ') || 'unknown'}`);
        return `${cls.class} (vectorizer: ${cls.vectorizer || 'none'}):\n${props.join('\n')}`;
      });

      return {
        content: `Schema has ${classes.length} class(es):\n\n${lines.join('\n\n')}`,
        metadata: { classCount: classes.length },
      };
    } catch (err) {
      return weaviateError(err);
    }
  },
};

// ─── Tool: weaviate_list_classes ────────────────────────

const listClasses: ToolHandler = {
  description:
    'List all classes in the Weaviate schema with summary info (name, property count, vectorizer).',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = clusterUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/v1/schema`,
      });

      const classes: any[] = result.classes || [];
      if (classes.length === 0) {
        return { content: 'No classes found in the schema.' };
      }

      const lines = classes.map((cls: any) => {
        const propCount = cls.properties?.length ?? 0;
        return `${cls.class} — ${propCount} properties, vectorizer: ${cls.vectorizer || 'none'}`;
      });

      return {
        content: `Found ${classes.length} classes:\n${lines.join('\n')}`,
        metadata: { count: classes.length },
      };
    } catch (err) {
      return weaviateError(err);
    }
  },
};

// ─── Tool: weaviate_search ──────────────────────────────

const searchObjects: ToolHandler = {
  description:
    'Perform a hybrid (BM25 + vector) search across a Weaviate class. Combines keyword and semantic matching.',
  inputSchema: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'The Weaviate class to search',
      },
      query: {
        type: 'string',
        description: 'Search query text',
      },
      fields: {
        type: 'string',
        description: 'Space-separated list of fields to return',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 10)',
      },
      alpha: {
        type: 'number',
        description: 'Hybrid search alpha — 0 = pure BM25, 1 = pure vector (default 0.5)',
      },
    },
    required: ['className', 'query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = clusterUrl(ctx);
      const fields = params.fields || '_additional { id score }';
      const limit = params.limit ?? 10;
      const alpha = params.alpha ?? 0.5;

      const query = `{
        Get {
          ${params.className}(
            limit: ${limit},
            hybrid: { query: ${JSON.stringify(params.query)}, alpha: ${alpha} }
          ) {
            ${fields}
            _additional { id score }
          }
        }
      }`;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/v1/graphql`,
        body: { query },
      });

      const objects: any[] = result.data?.Get?.[params.className] || [];
      if (objects.length === 0) {
        return { content: `No results found for "${params.query}" in class "${params.className}".` };
      }

      const lines = objects.map((obj: any) => {
        const id = obj._additional?.id || 'unknown';
        const score = obj._additional?.score != null ? ` (score: ${obj._additional.score})` : '';
        const fieldValues = Object.entries(obj)
          .filter(([k]) => k !== '_additional')
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v)}`)
          .join(', ');
        return `[${id}]${score} ${fieldValues}`;
      });

      return {
        content: `Found ${objects.length} results for "${params.query}":\n${lines.join('\n')}`,
        metadata: { count: objects.length, className: params.className, query: params.query },
      };
    } catch (err) {
      return weaviateError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const weaviateAdapter: SkillAdapter = {
  skillId: 'weaviate',
  name: 'Weaviate',
  // Base URL is dynamic per cluster; individual tools use full URLs from skillConfig
  baseUrl: 'https://CLUSTER.weaviate.network/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    weaviate_query: queryObjects,
    weaviate_create_object: createObject,
    weaviate_get_schema: getSchema,
    weaviate_list_classes: listClasses,
    weaviate_search: searchObjects,
  },
  configSchema: {
    clusterUrl: {
      type: 'string' as const,
      label: 'Cluster URL',
      description: 'Your Weaviate cluster URL (e.g. https://my-cluster.weaviate.network)',
      required: true,
      placeholder: 'https://my-cluster.weaviate.network',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
