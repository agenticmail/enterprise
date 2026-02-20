/**
 * MCP Skill Adapter — Webflow
 *
 * Maps Webflow API v2 endpoints to MCP tool handlers.
 * Covers sites, collections, items, and publishing.
 *
 * Webflow API docs: https://developers.webflow.com/reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function webflowError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code ? `[${data.code}] ` : '';
      const message = data.message || data.err || err.message;
      const details = data.problems ? ` -- ${data.problems.join('; ')}` : '';
      return { content: `Webflow API error: ${code}${message}${details}`, isError: true };
    }
    return { content: `Webflow API error: ${err.message}`, isError: true };
  }
  return { content: `Webflow API error: ${String(err)}`, isError: true };
}

// ─── Tool: webflow_list_sites ───────────────────────────

const listSites: ToolHandler = {
  description:
    'List all Webflow sites accessible with the current authorization. Returns site names, IDs, and custom domains.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/sites');

      const sites: any[] = result.sites || [];
      if (sites.length === 0) {
        return { content: 'No sites found.', metadata: { count: 0 } };
      }

      const lines = sites.map((s: any) => {
        const name = s.displayName || s.shortName || '(unnamed)';
        const domain = s.customDomains?.length ? s.customDomains[0].url : s.previewUrl || 'N/A';
        const lastPublished = s.lastPublished ? s.lastPublished.slice(0, 16) : 'never';
        return `${name} -- ${domain} -- last published: ${lastPublished} (ID: ${s.id})`;
      });

      return {
        content: `Found ${sites.length} sites:\n${lines.join('\n')}`,
        metadata: { count: sites.length },
      };
    } catch (err) {
      return webflowError(err);
    }
  },
};

// ─── Tool: webflow_list_collections ─────────────────────

const listCollections: ToolHandler = {
  description:
    'List CMS collections for a Webflow site. Returns collection names, slugs, and item counts.',
  inputSchema: {
    type: 'object',
    properties: {
      site_id: {
        type: 'string',
        description: 'The Webflow site ID',
      },
    },
    required: ['site_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/sites/${params.site_id}/collections`);

      const collections: any[] = result.collections || [];
      if (collections.length === 0) {
        return { content: 'No collections found for this site.', metadata: { count: 0 } };
      }

      const lines = collections.map((c: any) => {
        const name = c.displayName || c.slug || '(unnamed)';
        const slug = c.slug || '';
        const lastUpdated = c.lastUpdated ? c.lastUpdated.slice(0, 16) : '';
        return `${name} -- /${slug} -- updated: ${lastUpdated} (ID: ${c.id})`;
      });

      return {
        content: `Found ${collections.length} collections:\n${lines.join('\n')}`,
        metadata: { count: collections.length, siteId: params.site_id },
      };
    } catch (err) {
      return webflowError(err);
    }
  },
};

// ─── Tool: webflow_list_items ───────────────────────────

const listItems: ToolHandler = {
  description:
    'List items in a Webflow CMS collection. Returns item names, slugs, and field data.',
  inputSchema: {
    type: 'object',
    properties: {
      collection_id: {
        type: 'string',
        description: 'The Webflow collection ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of items to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    required: ['collection_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };

      const result = await ctx.apiExecutor.get(
        `/collections/${params.collection_id}/items`,
        query,
      );

      const items: any[] = result.items || [];
      const total = result.pagination?.total ?? items.length;

      if (items.length === 0) {
        return { content: 'No items found in this collection.', metadata: { count: 0 } };
      }

      const lines = items.map((item: any) => {
        const name = item.fieldData?.name || item.fieldData?.title || item.fieldData?.slug || '(unnamed)';
        const slug = item.fieldData?.slug || '';
        const draft = item.isDraft ? ' [draft]' : '';
        const archived = item.isArchived ? ' [archived]' : '';
        const lastUpdated = item.lastUpdated ? item.lastUpdated.slice(0, 16) : '';
        return `${name}${draft}${archived} -- /${slug} -- ${lastUpdated} (ID: ${item.id})`;
      });

      return {
        content: `Found ${total} items (showing ${items.length}):\n${lines.join('\n')}`,
        metadata: { count: items.length, total, collectionId: params.collection_id },
      };
    } catch (err) {
      return webflowError(err);
    }
  },
};

// ─── Tool: webflow_create_item ──────────────────────────

const createItem: ToolHandler = {
  description:
    'Create a new item in a Webflow CMS collection. Provide field data matching the collection schema.',
  inputSchema: {
    type: 'object',
    properties: {
      collection_id: {
        type: 'string',
        description: 'The Webflow collection ID to create the item in',
      },
      fieldData: {
        type: 'object',
        description: 'Field values for the item. Must include at minimum a "name" or "slug" field, plus any required fields for the collection.',
      },
      isDraft: {
        type: 'boolean',
        description: 'Whether to create the item as a draft (default: false)',
      },
      isArchived: {
        type: 'boolean',
        description: 'Whether to create the item as archived (default: false)',
      },
    },
    required: ['collection_id', 'fieldData'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        fieldData: params.fieldData,
      };
      if (params.isDraft != null) body.isDraft = params.isDraft;
      if (params.isArchived != null) body.isArchived = params.isArchived;

      const result = await ctx.apiExecutor.post(
        `/collections/${params.collection_id}/items`,
        body,
      );

      const name = result.fieldData?.name || result.fieldData?.title || result.fieldData?.slug || '(unnamed)';
      const draft = result.isDraft ? ' [draft]' : '';

      return {
        content: `Item created: ${name}${draft} (ID: ${result.id})`,
        metadata: {
          itemId: result.id,
          collectionId: params.collection_id,
          isDraft: result.isDraft,
        },
      };
    } catch (err) {
      return webflowError(err);
    }
  },
};

// ─── Tool: webflow_publish_site ─────────────────────────

const publishSite: ToolHandler = {
  description:
    'Publish a Webflow site to make all staged changes live. Optionally publish to specific custom domains.',
  inputSchema: {
    type: 'object',
    properties: {
      site_id: {
        type: 'string',
        description: 'The Webflow site ID to publish',
      },
      customDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of custom domain IDs to publish to (optional — omit to publish to all)',
      },
    },
    required: ['site_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.customDomains?.length) {
        body.customDomains = params.customDomains;
      }

      await ctx.apiExecutor.post(`/sites/${params.site_id}/publish`, body);

      return {
        content: `Site ${params.site_id} published successfully.`,
        metadata: { siteId: params.site_id },
      };
    } catch (err) {
      return webflowError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const webflowAdapter: SkillAdapter = {
  skillId: 'webflow',
  name: 'Webflow',
  baseUrl: 'https://api.webflow.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'webflow',
  },
  tools: {
    webflow_list_sites: listSites,
    webflow_list_collections: listCollections,
    webflow_list_items: listItems,
    webflow_create_item: createItem,
    webflow_publish_site: publishSite,
  },
  rateLimits: {
    requestsPerSecond: 2,
    burstLimit: 5,
  },
};
