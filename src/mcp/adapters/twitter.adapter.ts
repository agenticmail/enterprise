/**
 * MCP Skill Adapter — Twitter/X
 *
 * Maps Twitter API v2 endpoints to MCP tool handlers.
 * Handles tweet posting, search, user lookup, followers, and timeline.
 *
 * Twitter API docs: https://developer.twitter.com/en/docs/twitter-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function twitterError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Twitter v2 returns { errors: [{ message, title, type }], detail }
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => e.message || e.title || 'unknown error').join('; ');
        return { content: `Twitter API error: ${details}`, isError: true };
      }
      if (data.detail) {
        return { content: `Twitter API error: ${data.detail}`, isError: true };
      }
    }
    return { content: `Twitter API error: ${err.message}`, isError: true };
  }
  return { content: `Twitter API error: ${String(err)}`, isError: true };
}

/** Format a tweet for display */
function formatTweet(tweet: any, includes?: any): string {
  const author = includes?.users?.find((u: any) => u.id === tweet.author_id);
  const authorName = author ? `@${author.username}` : tweet.author_id || 'unknown';
  const date = tweet.created_at ? new Date(tweet.created_at).toLocaleString() : '';
  const metrics = tweet.public_metrics;
  const metricsPart = metrics
    ? ` | ${metrics.like_count ?? 0} likes, ${metrics.retweet_count ?? 0} RTs, ${metrics.reply_count ?? 0} replies`
    : '';
  return `[${authorName}] ${tweet.text}${date ? ` (${date})` : ''}${metricsPart} (ID: ${tweet.id})`;
}

// ─── Tool: twitter_post_tweet ───────────────────────────

const postTweet: ToolHandler = {
  description:
    'Post a new tweet to Twitter/X. Supports text content, reply threading, and quote tweets.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text content of the tweet (max 280 characters)',
      },
      reply_to: {
        type: 'string',
        description: 'Tweet ID to reply to (optional, creates a reply thread)',
      },
      quote_tweet_id: {
        type: 'string',
        description: 'Tweet ID to quote (optional, creates a quote tweet)',
      },
    },
    required: ['text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { text: params.text };
      if (params.reply_to) {
        body.reply = { in_reply_to_tweet_id: params.reply_to };
      }
      if (params.quote_tweet_id) {
        body.quote_tweet_id = params.quote_tweet_id;
      }

      const result = await ctx.apiExecutor.post('/tweets', body);

      const tweet = result.data;
      return {
        content: `Tweet posted successfully (ID: ${tweet.id})\nText: ${tweet.text}`,
        metadata: {
          tweetId: tweet.id,
          text: tweet.text,
        },
      };
    } catch (err) {
      return twitterError(err);
    }
  },
};

// ─── Tool: twitter_search_tweets ────────────────────────

const searchTweets: ToolHandler = {
  description:
    'Search for recent tweets on Twitter/X using the v2 search endpoint. Supports advanced query syntax including hashtags, mentions, and boolean operators.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g. "from:elonmusk", "#AI", "machine learning -spam")',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of tweets to return (10-100, default 10)',
      },
      sort_order: {
        type: 'string',
        enum: ['recency', 'relevancy'],
        description: 'Sort order for results (default: "recency")',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        query: params.query,
        max_results: String(params.max_results ?? 10),
        'tweet.fields': 'created_at,author_id,public_metrics',
        expansions: 'author_id',
        'user.fields': 'username,name',
      };
      if (params.sort_order) query.sort_order = params.sort_order;

      const result = await ctx.apiExecutor.get('/tweets/search/recent', query);

      const tweets: any[] = result.data || [];
      if (tweets.length === 0) {
        return { content: `No tweets found for query: "${params.query}"` };
      }

      const lines = tweets.map((t: any) => formatTweet(t, result.includes));

      return {
        content: `Found ${tweets.length} tweets for "${params.query}":\n${lines.join('\n')}`,
        metadata: { count: tweets.length, query: params.query },
      };
    } catch (err) {
      return twitterError(err);
    }
  },
};

// ─── Tool: twitter_get_user ─────────────────────────────

const getUser: ToolHandler = {
  description:
    'Get a Twitter/X user profile by username. Returns name, bio, follower/following counts, and verification status.',
  inputSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'Twitter username without the @ symbol (e.g. "elonmusk")',
      },
    },
    required: ['username'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'user.fields': 'description,public_metrics,verified,created_at,location,url,profile_image_url',
      };

      const result = await ctx.apiExecutor.get(
        `/users/by/username/${params.username}`,
        query,
      );

      const user = result.data;
      if (!user) {
        return { content: `User @${params.username} not found.`, isError: true };
      }

      const metrics = user.public_metrics || {};
      const details = [
        `Name: ${user.name}`,
        `Username: @${user.username}`,
        `Bio: ${user.description || '(no bio)'}`,
        `Location: ${user.location || 'N/A'}`,
        `Followers: ${metrics.followers_count ?? 0}`,
        `Following: ${metrics.following_count ?? 0}`,
        `Tweets: ${metrics.tweet_count ?? 0}`,
        `Verified: ${user.verified ? 'Yes' : 'No'}`,
        `Joined: ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}`,
      ].join('\n');

      return {
        content: `Twitter Profile:\n${details}`,
        metadata: {
          userId: user.id,
          username: user.username,
          followersCount: metrics.followers_count,
        },
      };
    } catch (err) {
      return twitterError(err);
    }
  },
};

// ─── Tool: twitter_list_followers ───────────────────────

const listFollowers: ToolHandler = {
  description:
    'List followers of a Twitter/X user by their user ID. Returns usernames, names, and bios.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'The Twitter user ID to list followers for',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of followers to return (1-1000, default 100)',
      },
      pagination_token: {
        type: 'string',
        description: 'Pagination token for the next page of results (optional)',
      },
    },
    required: ['user_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        max_results: String(params.max_results ?? 100),
        'user.fields': 'description,public_metrics,verified',
      };
      if (params.pagination_token) query.pagination_token = params.pagination_token;

      const result = await ctx.apiExecutor.get(
        `/users/${params.user_id}/followers`,
        query,
      );

      const followers: any[] = result.data || [];
      if (followers.length === 0) {
        return { content: `No followers found for user ID ${params.user_id}.` };
      }

      const lines = followers.map((u: any) => {
        const metrics = u.public_metrics || {};
        const verified = u.verified ? ' [verified]' : '';
        return `@${u.username} (${u.name})${verified} -- ${metrics.followers_count ?? 0} followers`;
      });

      const nextToken = result.meta?.next_token;
      const paginationNote = nextToken ? `\n\nNext page token: ${nextToken}` : '';

      return {
        content: `${followers.length} followers for user ID ${params.user_id}:\n${lines.join('\n')}${paginationNote}`,
        metadata: {
          count: followers.length,
          userId: params.user_id,
          nextToken: nextToken || null,
        },
      };
    } catch (err) {
      return twitterError(err);
    }
  },
};

// ─── Tool: twitter_get_timeline ─────────────────────────

const getTimeline: ToolHandler = {
  description:
    'Get the recent tweets timeline for a Twitter/X user by their user ID. Returns their most recent tweets with engagement metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'The Twitter user ID to get the timeline for',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of tweets to return (5-100, default 10)',
      },
      exclude: {
        type: 'string',
        enum: ['retweets', 'replies', 'retweets,replies'],
        description: 'Comma-separated list of tweet types to exclude (optional)',
      },
    },
    required: ['user_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        max_results: String(params.max_results ?? 10),
        'tweet.fields': 'created_at,public_metrics,author_id',
        expansions: 'author_id',
        'user.fields': 'username,name',
      };
      if (params.exclude) query.exclude = params.exclude;

      const result = await ctx.apiExecutor.get(
        `/users/${params.user_id}/tweets`,
        query,
      );

      const tweets: any[] = result.data || [];
      if (tweets.length === 0) {
        return { content: `No tweets found in timeline for user ID ${params.user_id}.` };
      }

      const lines = tweets.map((t: any) => formatTweet(t, result.includes));

      return {
        content: `${tweets.length} tweets from user ID ${params.user_id}:\n${lines.join('\n')}`,
        metadata: { count: tweets.length, userId: params.user_id },
      };
    } catch (err) {
      return twitterError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const twitterAdapter: SkillAdapter = {
  skillId: 'twitter',
  name: 'Twitter/X',
  baseUrl: 'https://api.twitter.com/2',
  auth: {
    type: 'oauth2',
    provider: 'twitter',
  },
  tools: {
    twitter_post_tweet: postTweet,
    twitter_search_tweets: searchTweets,
    twitter_get_user: getUser,
    twitter_list_followers: listFollowers,
    twitter_get_timeline: getTimeline,
  },
  rateLimits: { requestsPerSecond: 1, burstLimit: 5 },
};
