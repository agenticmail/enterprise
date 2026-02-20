/**
 * MCP Skill Adapter — Confluence
 *
 * Maps Confluence Cloud REST API v2 endpoints to MCP tool handlers.
 * Like Jira, the base URL is dynamic per-tenant (e.g. https://acme.atlassian.net).
 * Each tool resolves the host from `ctx.skillConfig.host` and uses
 * `ctx.apiExecutor.request()` with a full URL override.
 *
 * Confluence Cloud REST API v2 docs: https://developer.atlassian.com/cloud/confluence/rest/v2/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

const DEFAULT_HOST = 'https://your-domain.atlassian.net';

/**
 * Resolve the Confluence instance base URL from skill config.
 */
function getConfluenceHost(ctx: ToolExecutionContext): string {
  const host = ctx.skillConfig.host || DEFAULT_HOST;
  return host.replace(/\/$/, '');
}

function confluenceError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const messages: string[] = [];
      if (data.message) messages.push(data.message);
      if (Array.isArray(data.errors)) {
        for (const e of data.errors) {
          messages.push(e.message || String(e));
        }
      }
      if (messages.length > 0) {
        return { content: `Confluence API error: ${messages.join('; ')}`, isError: true };
      }
    }
    return { content: `Confluence API error: ${err.message}`, isError: true };
  }
  return { content: `Confluence API error: ${String(err)}`, isError: true };
}

// ─── Tool: confluence_search ────────────────────────────

const search: ToolHandler = {
  description:
    'Search Confluence content using CQL (Confluence Query Language). Returns matching pages and blog posts with titles, space keys, and excerpts.',
  inputSchema: {
    type: 'object',
    properties: {
      cql: {
        type: 'string',
        description: 'CQL query (e.g. "text ~ \\"project plan\\"", "space = DEV AND type = page", "label = important")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 25)',
      },
    },
    required: ['cql'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getConfluenceHost(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${host}/wiki/api/v2/search`,
        query: {
          cql: params.cql,
          limit: String(params.limit ?? 25),
        },
      });

      const results: any[] = result.results || [];
      const totalSize = result.totalSize ?? results.length;

      if (results.length === 0) {
        return { content: `No results found for CQL: ${params.cql}` };
      }

      const lines = results.map((r: any) => {
        const content = r.content || r;
        const title = content.title || 'Untitled';
        const id = content.id || 'unknown';
        const type = content.type || 'page';
        const space = content.space?.key || content._expandable?.space || '';
        const excerpt = r.excerpt
          ? ` -- ${r.excerpt.replace(/<[^>]+>/g, '').slice(0, 120)}`
          : '';
        return `[${type}] ${title} (${id}) space: ${space}${excerpt}`;
      });

      return {
        content: `Found ${totalSize} results (showing ${results.length}):\n${lines.join('\n')}`,
        metadata: { total: totalSize, shown: results.length, cql: params.cql },
      };
    } catch (err) {
      return confluenceError(err);
    }
  },
};

// ─── Tool: confluence_get_page ──────────────────────────

const getPage: ToolHandler = {
  description:
    'Get a Confluence page by its ID. Returns the title, space, status, and body content.',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: {
        type: 'string',
        description: 'The page ID',
      },
      body_format: {
        type: 'string',
        enum: ['storage', 'atlas_doc_format', 'view'],
        description: 'Format of the body to return (default: "storage")',
      },
    },
    required: ['page_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getConfluenceHost(ctx);
      const bodyFormat = params.body_format || 'storage';

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${host}/wiki/api/v2/pages/${params.page_id}`,
        query: {
          'body-format': bodyFormat,
        },
      });

      const title = result.title || 'Untitled';
      const status = result.status || 'unknown';
      const spaceId = result.spaceId || 'unknown';
      const version = result.version?.number ?? 'unknown';
      const createdAt = result.createdAt ? new Date(result.createdAt).toISOString().slice(0, 16) : 'unknown';

      // Extract body content
      let bodyContent = 'No content';
      if (result.body) {
        const bodyObj = result.body[bodyFormat] || result.body.storage || {};
        if (bodyObj.value) {
          // Strip HTML tags for a readable summary
          bodyContent = bodyObj.value.replace(/<[^>]+>/g, '').trim();
          if (bodyContent.length > 2000) {
            bodyContent = bodyContent.slice(0, 2000) + '... (truncated)';
          }
        }
      }

      const pageUrl = `${host}/wiki/spaces/${spaceId}/pages/${params.page_id}`;

      const output = [
        `${title}`,
        `URL: ${pageUrl}`,
        `Status: ${status}`,
        `Space ID: ${spaceId}`,
        `Version: ${version}`,
        `Created: ${createdAt}`,
        ``,
        `Content:`,
        bodyContent,
      ].join('\n');

      return {
        content: output,
        metadata: {
          id: params.page_id,
          title,
          spaceId,
          status,
          url: pageUrl,
        },
      };
    } catch (err) {
      return confluenceError(err);
    }
  },
};

// ─── Tool: confluence_create_page ───────────────────────

const createPage: ToolHandler = {
  description:
    'Create a new Confluence page. Specify the space ID, title, and body content in Confluence storage format (XHTML).',
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'Space ID to create the page in',
      },
      title: {
        type: 'string',
        description: 'Page title',
      },
      body: {
        type: 'string',
        description: 'Page body content in Confluence storage format (XHTML). Simple text will be wrapped in <p> tags.',
      },
      parentId: {
        type: 'string',
        description: 'Parent page ID (optional, creates as child page)',
      },
      status: {
        type: 'string',
        enum: ['current', 'draft'],
        description: 'Page status (default: "current")',
      },
    },
    required: ['spaceId', 'title', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const host = getConfluenceHost(ctx);

      // Wrap plain text in a paragraph if it doesn't look like storage format
      let bodyValue = params.body;
      if (!bodyValue.includes('<')) {
        bodyValue = `<p>${bodyValue}</p>`;
      }

      const requestBody: Record<string, any> = {
        spaceId: params.spaceId,
        status: params.status || 'current',
        title: params.title,
        body: {
          representation: 'storage',
          value: bodyValue,
        },
      };

      if (params.parentId) {
        requestBody.parentId = params.parentId;
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${host}/wiki/api/v2/pages`,
        body: requestBody,
      });

      const pageUrl = `${host}/wiki/spaces/${params.spaceId}/pages/${result.id}`;

      return {
        content: `Page created: "${result.title}" (ID: ${result.id}) in space ${params.spaceId}\nURL: ${pageUrl}`,
        metadata: {
          id: result.id,
          title: result.title,
          spaceId: params.spaceId,
          url: pageUrl,
          version: result.version?.number,
        },
      };
    } catch (err) {
      return confluenceError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const confluenceAdapter: SkillAdapter = {
  skillId: 'confluence-wiki',
  name: 'Confluence',
  baseUrl: DEFAULT_HOST,
  auth: {
    type: 'oauth2',
    provider: 'atlassian',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Accept': 'application/json',
  },
  tools: {
    confluence_search: search,
    confluence_get_page: getPage,
    confluence_create_page: createPage,
  },
  configSchema: {
    host: {
      type: 'string' as const,
      label: 'Confluence Instance URL',
      description: 'Your Atlassian Cloud URL (e.g. https://yourcompany.atlassian.net)',
      required: true,
      placeholder: 'https://yourcompany.atlassian.net',
    },
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
