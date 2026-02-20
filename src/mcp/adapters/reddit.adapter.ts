/**
 * MCP Skill Adapter — Reddit
 *
 * Maps Reddit OAuth API endpoints to MCP tool handlers.
 * Handles search, subreddit info, post submission, comments, and user data.
 *
 * Reddit API docs: https://www.reddit.com/dev/api/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function redditError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error_description || data.reason || err.message;
      const code = data.error || '';
      const codePart = code ? `[${code}] ` : '';
      return { content: `Reddit API error: ${codePart}${msg}`, isError: true };
    }
    return { content: `Reddit API error: ${err.message}`, isError: true };
  }
  return { content: `Reddit API error: ${String(err)}`, isError: true };
}

/** Format a Reddit post for display */
function formatPost(post: any): string {
  const data = post.data || post;
  const title = data.title || '(no title)';
  const author = data.author || 'unknown';
  const subreddit = data.subreddit_name_prefixed || `r/${data.subreddit || 'unknown'}`;
  const score = data.score ?? 0;
  const comments = data.num_comments ?? 0;
  const url = data.permalink ? `https://reddit.com${data.permalink}` : '';
  return `[${subreddit}] ${title} -- by u/${author} (${score} pts, ${comments} comments)${url ? ` ${url}` : ''}`;
}

/** Format Reddit timestamp */
function formatRedditDate(utc: number | undefined): string {
  if (!utc) return 'N/A';
  return new Date(utc * 1000).toLocaleString();
}

// ─── Tool: reddit_search ────────────────────────────────

const redditSearch: ToolHandler = {
  description:
    'Search for posts across Reddit or within a specific subreddit. Returns titles, scores, and comment counts.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      subreddit: {
        type: 'string',
        description: 'Limit search to a specific subreddit (optional, without r/ prefix)',
      },
      sort: {
        type: 'string',
        enum: ['relevance', 'hot', 'top', 'new', 'comments'],
        description: 'Sort order for results (default: "relevance")',
      },
      time: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
        description: 'Time filter (default: "all")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-100, default 25)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const path = params.subreddit
        ? `/r/${params.subreddit}/search`
        : '/search';

      const query: Record<string, string> = {
        q: params.query,
        sort: params.sort || 'relevance',
        t: params.time || 'all',
        limit: String(params.limit ?? 25),
        restrict_sr: params.subreddit ? 'true' : 'false',
      };

      const result = await ctx.apiExecutor.get(path, query);

      const posts: any[] = result.data?.children || [];
      if (posts.length === 0) {
        return { content: `No posts found for "${params.query}".` };
      }

      const lines = posts.map((p: any) => formatPost(p));

      return {
        content: `Found ${posts.length} posts for "${params.query}":\n${lines.join('\n')}`,
        metadata: {
          count: posts.length,
          query: params.query,
          subreddit: params.subreddit || null,
        },
      };
    } catch (err) {
      return redditError(err);
    }
  },
};

// ─── Tool: reddit_get_subreddit ─────────────────────────

const getSubreddit: ToolHandler = {
  description:
    'Get information about a subreddit. Returns description, subscriber count, rules, and active users.',
  inputSchema: {
    type: 'object',
    properties: {
      subreddit: {
        type: 'string',
        description: 'Subreddit name without the r/ prefix (e.g. "programming")',
      },
    },
    required: ['subreddit'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/r/${params.subreddit}/about`);

      const data = result.data || result;
      const details = [
        `Subreddit: r/${data.display_name || params.subreddit}`,
        `Title: ${data.title || 'N/A'}`,
        `Description: ${(data.public_description || data.description || 'N/A').substring(0, 300)}`,
        `Subscribers: ${data.subscribers?.toLocaleString() ?? 'N/A'}`,
        `Active Users: ${data.accounts_active?.toLocaleString() ?? 'N/A'}`,
        `Created: ${formatRedditDate(data.created_utc)}`,
        `NSFW: ${data.over18 ? 'Yes' : 'No'}`,
        `Type: ${data.subreddit_type || 'public'}`,
      ].join('\n');

      return {
        content: `Subreddit Info:\n${details}`,
        metadata: {
          subreddit: data.display_name || params.subreddit,
          subscribers: data.subscribers,
          activeUsers: data.accounts_active,
        },
      };
    } catch (err) {
      return redditError(err);
    }
  },
};

// ─── Tool: reddit_submit_post ───────────────────────────

const submitPost: ToolHandler = {
  description:
    'Submit a new post to a subreddit. Supports text (self) posts and link posts.',
  inputSchema: {
    type: 'object',
    properties: {
      subreddit: {
        type: 'string',
        description: 'Subreddit name without the r/ prefix',
      },
      title: {
        type: 'string',
        description: 'Post title',
      },
      text: {
        type: 'string',
        description: 'Post body text for self posts (Markdown supported)',
      },
      url: {
        type: 'string',
        description: 'URL for link posts (mutually exclusive with text)',
      },
      flair_id: {
        type: 'string',
        description: 'Flair template ID to apply (optional)',
      },
    },
    required: ['subreddit', 'title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        sr: params.subreddit,
        title: params.title,
        kind: params.url ? 'link' : 'self',
        api_type: 'json',
      };
      if (params.text) body.text = params.text;
      if (params.url) body.url = params.url;
      if (params.flair_id) body.flair_id = params.flair_id;

      const result = await ctx.apiExecutor.post('/api/submit', body);

      const postData = result.json?.data || result.data || result;
      const postUrl = postData.url || postData.permalink || '';
      const postId = postData.id || postData.name || 'unknown';

      return {
        content: `Post submitted to r/${params.subreddit}: "${params.title}" (ID: ${postId})${postUrl ? `\nURL: ${postUrl}` : ''}`,
        metadata: {
          postId,
          subreddit: params.subreddit,
          title: params.title,
          url: postUrl,
        },
      };
    } catch (err) {
      return redditError(err);
    }
  },
};

// ─── Tool: reddit_get_comments ──────────────────────────

const getComments: ToolHandler = {
  description:
    'Get comments for a Reddit post. Returns the comment tree with authors, scores, and replies.',
  inputSchema: {
    type: 'object',
    properties: {
      subreddit: {
        type: 'string',
        description: 'Subreddit name without the r/ prefix',
      },
      post_id: {
        type: 'string',
        description: 'Reddit post ID (the part after t3_ in the fullname)',
      },
      sort: {
        type: 'string',
        enum: ['confidence', 'top', 'new', 'controversial', 'old', 'qa'],
        description: 'Comment sort order (default: "confidence")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of top-level comments (default 25)',
      },
    },
    required: ['subreddit', 'post_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        sort: params.sort || 'confidence',
        limit: String(params.limit ?? 25),
      };

      const result = await ctx.apiExecutor.get(
        `/r/${params.subreddit}/comments/${params.post_id}`,
        query,
      );

      // Reddit returns an array: [post listing, comments listing]
      const commentListing = Array.isArray(result) && result.length > 1
        ? result[1]
        : result;
      const comments: any[] = commentListing?.data?.children || [];

      if (comments.length === 0) {
        return { content: `No comments found for post ${params.post_id} in r/${params.subreddit}.` };
      }

      const lines = comments
        .filter((c: any) => c.kind === 't1')
        .map((c: any) => {
          const d = c.data || {};
          const author = d.author || 'unknown';
          const score = d.score ?? 0;
          const body = (d.body || '').substring(0, 200);
          const truncated = (d.body || '').length > 200 ? '...' : '';
          return `u/${author} (${score} pts): ${body}${truncated}`;
        });

      return {
        content: `${lines.length} comments on post ${params.post_id} in r/${params.subreddit}:\n${lines.join('\n')}`,
        metadata: {
          commentCount: lines.length,
          postId: params.post_id,
          subreddit: params.subreddit,
        },
      };
    } catch (err) {
      return redditError(err);
    }
  },
};

// ─── Tool: reddit_get_user ──────────────────────────────

const getUser: ToolHandler = {
  description:
    'Get information about a Reddit user. Returns karma, account age, and recent activity summary.',
  inputSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'Reddit username without the u/ prefix',
      },
    },
    required: ['username'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/user/${params.username}/about`);

      const data = result.data || result;
      const details = [
        `User: u/${data.name || params.username}`,
        `Link Karma: ${data.link_karma?.toLocaleString() ?? 'N/A'}`,
        `Comment Karma: ${data.comment_karma?.toLocaleString() ?? 'N/A'}`,
        `Total Karma: ${data.total_karma?.toLocaleString() ?? 'N/A'}`,
        `Account Created: ${formatRedditDate(data.created_utc)}`,
        `Verified Email: ${data.has_verified_email ? 'Yes' : 'No'}`,
        `Gold: ${data.is_gold ? 'Yes' : 'No'}`,
        `Moderator: ${data.is_mod ? 'Yes' : 'No'}`,
      ].join('\n');

      return {
        content: `Reddit User:\n${details}`,
        metadata: {
          username: data.name || params.username,
          totalKarma: data.total_karma,
          created: data.created_utc,
        },
      };
    } catch (err) {
      return redditError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const redditAdapter: SkillAdapter = {
  skillId: 'reddit',
  name: 'Reddit',
  baseUrl: 'https://oauth.reddit.com',
  auth: {
    type: 'oauth2',
    provider: 'reddit',
  },
  defaultHeaders: {
    'User-Agent': 'AgenticMail/1.0',
  },
  tools: {
    reddit_search: redditSearch,
    reddit_get_subreddit: getSubreddit,
    reddit_submit_post: submitPost,
    reddit_get_comments: getComments,
    reddit_get_user: getUser,
  },
  rateLimits: { requestsPerSecond: 1, burstLimit: 5 },
};
