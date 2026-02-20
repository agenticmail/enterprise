/**
 * MCP Skill Adapter — WordPress
 *
 * Maps WordPress REST API (v2) endpoints to MCP tool handlers.
 * Covers posts, pages, and comments management.
 *
 * WordPress REST API docs: https://developer.wordpress.org/rest-api/
 *
 * Base URL is dynamic based on the customer's site URL:
 * https://{siteUrl}/wp-json/wp/v2
 *
 * The site URL is read from ctx.skillConfig.siteUrl.
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the WordPress base URL from skill config */
function wpUrl(ctx: ToolExecutionContext): string {
  const siteUrl = ctx.skillConfig.siteUrl;
  if (!siteUrl) {
    throw new Error('WordPress site URL is required in skillConfig (e.g. { siteUrl: "https://mysite.com" })');
  }
  // Strip trailing slash from siteUrl
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}/wp-json/wp/v2`;
}

function wordpressError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code ? `[${data.code}] ` : '';
      const message = data.message || err.message;
      return { content: `WordPress API error: ${code}${message}`, isError: true };
    }
    return { content: `WordPress API error: ${err.message}`, isError: true };
  }
  return { content: `WordPress API error: ${String(err)}`, isError: true };
}

/** Format a WordPress post for display */
function formatPost(post: any): string {
  const title = post.title?.rendered || '(untitled)';
  const status = post.status || 'unknown';
  const date = post.date ? post.date.slice(0, 10) : 'unknown';
  const slug = post.slug || '';
  return `"${title}" -- ${status} -- ${date} -- /${slug} (ID: ${post.id})`;
}

/** Format a WordPress page for display */
function formatPage(page: any): string {
  const title = page.title?.rendered || '(untitled)';
  const status = page.status || 'unknown';
  const date = page.date ? page.date.slice(0, 10) : 'unknown';
  const slug = page.slug || '';
  return `"${title}" -- ${status} -- ${date} -- /${slug} (ID: ${page.id})`;
}

/** Format a WordPress comment for display */
function formatComment(comment: any): string {
  const author = comment.author_name || 'Anonymous';
  const content = comment.content?.rendered
    ? comment.content.rendered.replace(/<[^>]+>/g, '').slice(0, 80)
    : '(no content)';
  const status = comment.status || 'unknown';
  const date = comment.date ? comment.date.slice(0, 10) : '';
  return `${author}: "${content}" -- ${status} -- ${date} (ID: ${comment.id})`;
}

// ─── Tool: wp_list_posts ────────────────────────────────

const listPosts: ToolHandler = {
  description:
    'List posts from a WordPress site. Optionally filter by status, category, search, or author.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['publish', 'draft', 'pending', 'private', 'future', 'any'],
        description: 'Filter by post status (default: "publish")',
      },
      search: {
        type: 'string',
        description: 'Search posts by keyword',
      },
      per_page: {
        type: 'number',
        description: 'Number of posts to return (default 10, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      categories: {
        type: 'string',
        description: 'Comma-separated list of category IDs to filter by',
      },
      orderby: {
        type: 'string',
        enum: ['date', 'relevance', 'id', 'title', 'slug'],
        description: 'Sort field (default: "date")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wpUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 10),
        page: String(params.page ?? 1),
      };
      if (params.status) query.status = params.status;
      if (params.search) query.search = params.search;
      if (params.categories) query.categories = params.categories;
      if (params.orderby) query.orderby = params.orderby;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/posts`,
        query,
      });

      const posts: any[] = Array.isArray(result) ? result : [];
      if (posts.length === 0) {
        return { content: 'No posts found.', metadata: { count: 0 } };
      }

      const lines = posts.map((p: any) => formatPost(p));

      return {
        content: `Found ${posts.length} posts:\n${lines.join('\n')}`,
        metadata: { count: posts.length },
      };
    } catch (err) {
      return wordpressError(err);
    }
  },
};

// ─── Tool: wp_create_post ───────────────────────────────

const createPost: ToolHandler = {
  description:
    'Create a new post on a WordPress site. Provide a title, content, and optional status and categories.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Post title',
      },
      content: {
        type: 'string',
        description: 'Post content (HTML supported)',
      },
      status: {
        type: 'string',
        enum: ['publish', 'draft', 'pending', 'private', 'future'],
        description: 'Post status (default: "draft")',
      },
      excerpt: {
        type: 'string',
        description: 'Post excerpt / summary',
      },
      categories: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of category IDs',
      },
      tags: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of tag IDs',
      },
      slug: {
        type: 'string',
        description: 'Custom URL slug',
      },
    },
    required: ['title', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wpUrl(ctx);

      const body: Record<string, any> = {
        title: params.title,
        content: params.content,
        status: params.status || 'draft',
      };
      if (params.excerpt) body.excerpt = params.excerpt;
      if (params.categories) body.categories = params.categories;
      if (params.tags) body.tags = params.tags;
      if (params.slug) body.slug = params.slug;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/posts`,
        body,
      });

      return {
        content: `Post created: ${formatPost(result)}`,
        metadata: { postId: result.id, title: params.title, status: result.status },
      };
    } catch (err) {
      return wordpressError(err);
    }
  },
};

// ─── Tool: wp_update_post ───────────────────────────────

const updatePost: ToolHandler = {
  description:
    'Update an existing post on a WordPress site. Can change title, content, status, and other fields.',
  inputSchema: {
    type: 'object',
    properties: {
      post_id: {
        type: 'number',
        description: 'The post ID to update',
      },
      title: {
        type: 'string',
        description: 'New post title',
      },
      content: {
        type: 'string',
        description: 'New post content (HTML supported)',
      },
      status: {
        type: 'string',
        enum: ['publish', 'draft', 'pending', 'private', 'future'],
        description: 'New post status',
      },
      excerpt: {
        type: 'string',
        description: 'New post excerpt',
      },
      categories: {
        type: 'array',
        items: { type: 'number' },
        description: 'New array of category IDs',
      },
      tags: {
        type: 'array',
        items: { type: 'number' },
        description: 'New array of tag IDs',
      },
    },
    required: ['post_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wpUrl(ctx);

      const body: Record<string, any> = {};
      if (params.title) body.title = params.title;
      if (params.content) body.content = params.content;
      if (params.status) body.status = params.status;
      if (params.excerpt) body.excerpt = params.excerpt;
      if (params.categories) body.categories = params.categories;
      if (params.tags) body.tags = params.tags;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/posts/${params.post_id}`,
        body,
      });

      return {
        content: `Post updated: ${formatPost(result)}`,
        metadata: { postId: result.id, status: result.status },
      };
    } catch (err) {
      return wordpressError(err);
    }
  },
};

// ─── Tool: wp_list_pages ────────────────────────────────

const listPages: ToolHandler = {
  description:
    'List pages from a WordPress site. Returns page titles, statuses, and slugs.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['publish', 'draft', 'pending', 'private', 'any'],
        description: 'Filter by page status (default: "publish")',
      },
      search: {
        type: 'string',
        description: 'Search pages by keyword',
      },
      per_page: {
        type: 'number',
        description: 'Number of pages to return (default 10, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      orderby: {
        type: 'string',
        enum: ['date', 'relevance', 'id', 'title', 'slug', 'menu_order'],
        description: 'Sort field (default: "date")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wpUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 10),
        page: String(params.page ?? 1),
      };
      if (params.status) query.status = params.status;
      if (params.search) query.search = params.search;
      if (params.orderby) query.orderby = params.orderby;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/pages`,
        query,
      });

      const pages: any[] = Array.isArray(result) ? result : [];
      if (pages.length === 0) {
        return { content: 'No pages found.', metadata: { count: 0 } };
      }

      const lines = pages.map((p: any) => formatPage(p));

      return {
        content: `Found ${pages.length} pages:\n${lines.join('\n')}`,
        metadata: { count: pages.length },
      };
    } catch (err) {
      return wordpressError(err);
    }
  },
};

// ─── Tool: wp_list_comments ─────────────────────────────

const listComments: ToolHandler = {
  description:
    'List comments from a WordPress site. Optionally filter by post, status, or author.',
  inputSchema: {
    type: 'object',
    properties: {
      post: {
        type: 'number',
        description: 'Filter by post ID',
      },
      status: {
        type: 'string',
        enum: ['approve', 'hold', 'spam', 'trash'],
        description: 'Filter by comment status',
      },
      per_page: {
        type: 'number',
        description: 'Number of comments to return (default 10, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      search: {
        type: 'string',
        description: 'Search comments by keyword',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wpUrl(ctx);

      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 10),
        page: String(params.page ?? 1),
      };
      if (params.post) query.post = String(params.post);
      if (params.status) query.status = params.status;
      if (params.search) query.search = params.search;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/comments`,
        query,
      });

      const comments: any[] = Array.isArray(result) ? result : [];
      if (comments.length === 0) {
        return { content: 'No comments found.', metadata: { count: 0 } };
      }

      const lines = comments.map((c: any) => formatComment(c));

      return {
        content: `Found ${comments.length} comments:\n${lines.join('\n')}`,
        metadata: { count: comments.length },
      };
    } catch (err) {
      return wordpressError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const wordpressAdapter: SkillAdapter = {
  skillId: 'wordpress',
  name: 'WordPress',
  // Base URL is dynamic based on site URL; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://SITE/wp-json/wp/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    wp_list_posts: listPosts,
    wp_create_post: createPost,
    wp_update_post: updatePost,
    wp_list_pages: listPages,
    wp_list_comments: listComments,
  },
  configSchema: {
    siteUrl: {
      type: 'string' as const,
      label: 'WordPress Site URL',
      description: 'The full URL of your WordPress site',
      required: true,
      placeholder: 'https://mysite.com',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
