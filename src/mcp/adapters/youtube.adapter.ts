/**
 * MCP Skill Adapter — YouTube Data API
 *
 * Maps YouTube Data API v3 endpoints to MCP tool handlers.
 * Handles video search, video listing, channel info, playlists, and analytics.
 *
 * YouTube Data API docs: https://developers.google.com/youtube/v3
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function youtubeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // YouTube returns { error: { code, message, errors: [{ domain, reason, message }] } }
      const errorObj = data.error || data;
      if (errorObj.message) {
        const code = errorObj.code ? `[${errorObj.code}] ` : '';
        return { content: `YouTube API error: ${code}${errorObj.message}`, isError: true };
      }
    }
    return { content: `YouTube API error: ${err.message}`, isError: true };
  }
  return { content: `YouTube API error: ${String(err)}`, isError: true };
}

/** Format duration from ISO 8601 (PT1H2M3S) to readable format */
function formatDuration(iso: string | undefined): string {
  if (!iso) return 'N/A';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}h ` : '';
  const m = match[2] ? `${match[2]}m ` : '';
  const s = match[3] ? `${match[3]}s` : '';
  return `${h}${m}${s}`.trim() || '0s';
}

/** Format large numbers with K/M suffix */
function formatCount(count: string | number | undefined): string {
  if (count === undefined || count === null) return 'N/A';
  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (isNaN(num)) return String(count);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

// ─── Tool: youtube_search ───────────────────────────────

const youtubeSearch: ToolHandler = {
  description:
    'Search for videos, channels, or playlists on YouTube. Returns titles, channel names, and view counts.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      type: {
        type: 'string',
        enum: ['video', 'channel', 'playlist'],
        description: 'Type of resource to search for (default: "video")',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results (1-50, default 10)',
      },
      order: {
        type: 'string',
        enum: ['relevance', 'date', 'rating', 'viewCount', 'title'],
        description: 'Sort order for results (default: "relevance")',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        part: 'snippet',
        q: params.query,
        type: params.type || 'video',
        maxResults: String(params.max_results ?? 10),
        order: params.order || 'relevance',
      };

      const result = await ctx.apiExecutor.get('/search', query);

      const items: any[] = result.items || [];
      if (items.length === 0) {
        return { content: `No results found for "${params.query}".` };
      }

      const lines = items.map((item: any) => {
        const snippet = item.snippet || {};
        const title = snippet.title || '(untitled)';
        const channel = snippet.channelTitle || 'Unknown';
        const published = snippet.publishedAt
          ? new Date(snippet.publishedAt).toLocaleDateString()
          : '';
        const id = item.id?.videoId || item.id?.channelId || item.id?.playlistId || 'N/A';
        const kind = item.id?.kind?.replace('youtube#', '') || 'unknown';
        return `[${kind}] ${title} -- by ${channel} (${published}) (ID: ${id})`;
      });

      return {
        content: `Found ${items.length} results for "${params.query}":\n${lines.join('\n')}`,
        metadata: {
          count: items.length,
          query: params.query,
          totalResults: result.pageInfo?.totalResults,
        },
      };
    } catch (err) {
      return youtubeError(err);
    }
  },
};

// ─── Tool: youtube_list_videos ──────────────────────────

const listVideos: ToolHandler = {
  description:
    'Get detailed information about one or more YouTube videos by their IDs. Returns title, description, duration, view count, and engagement metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      video_ids: {
        type: 'string',
        description: 'Comma-separated list of YouTube video IDs (e.g. "dQw4w9WgXcQ,jNQXAC9IVRw")',
      },
    },
    required: ['video_ids'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        part: 'snippet,contentDetails,statistics',
        id: params.video_ids,
      };

      const result = await ctx.apiExecutor.get('/videos', query);

      const videos: any[] = result.items || [];
      if (videos.length === 0) {
        return { content: `No videos found for IDs: ${params.video_ids}` };
      }

      const lines = videos.map((v: any) => {
        const snippet = v.snippet || {};
        const stats = v.statistics || {};
        const duration = formatDuration(v.contentDetails?.duration);
        return [
          `Title: ${snippet.title || '(untitled)'}`,
          `Channel: ${snippet.channelTitle || 'Unknown'}`,
          `Published: ${snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString() : 'N/A'}`,
          `Duration: ${duration}`,
          `Views: ${formatCount(stats.viewCount)} | Likes: ${formatCount(stats.likeCount)} | Comments: ${formatCount(stats.commentCount)}`,
          `ID: ${v.id}`,
        ].join('\n');
      });

      return {
        content: `${videos.length} video(s):\n\n${lines.join('\n\n')}`,
        metadata: { count: videos.length },
      };
    } catch (err) {
      return youtubeError(err);
    }
  },
};

// ─── Tool: youtube_get_channel ──────────────────────────

const getChannel: ToolHandler = {
  description:
    'Get detailed information about a YouTube channel by its ID or custom URL. Returns subscriber count, video count, and description.',
  inputSchema: {
    type: 'object',
    properties: {
      channel_id: {
        type: 'string',
        description: 'YouTube channel ID (e.g. "UC_x5XG1OV2P6uZZ5FSM9Ttw")',
      },
      for_username: {
        type: 'string',
        description: 'YouTube channel username (alternative to channel_id)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        part: 'snippet,statistics,brandingSettings',
      };
      if (params.channel_id) {
        query.id = params.channel_id;
      } else if (params.for_username) {
        query.forUsername = params.for_username;
      } else {
        return { content: 'Either channel_id or for_username is required.', isError: true };
      }

      const result = await ctx.apiExecutor.get('/channels', query);

      const channels: any[] = result.items || [];
      if (channels.length === 0) {
        return { content: 'Channel not found.', isError: true };
      }

      const ch = channels[0];
      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};

      const details = [
        `Channel: ${snippet.title || '(unnamed)'}`,
        `Description: ${(snippet.description || 'N/A').substring(0, 200)}${(snippet.description || '').length > 200 ? '...' : ''}`,
        `Country: ${snippet.country || 'N/A'}`,
        `Created: ${snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString() : 'N/A'}`,
        `Subscribers: ${formatCount(stats.subscriberCount)}`,
        `Videos: ${formatCount(stats.videoCount)}`,
        `Total Views: ${formatCount(stats.viewCount)}`,
        `ID: ${ch.id}`,
      ].join('\n');

      return {
        content: `YouTube Channel:\n${details}`,
        metadata: {
          channelId: ch.id,
          title: snippet.title,
          subscriberCount: stats.subscriberCount,
        },
      };
    } catch (err) {
      return youtubeError(err);
    }
  },
};

// ─── Tool: youtube_list_playlists ───────────────────────

const listPlaylists: ToolHandler = {
  description:
    'List playlists for a YouTube channel. Returns playlist titles, descriptions, and video counts.',
  inputSchema: {
    type: 'object',
    properties: {
      channel_id: {
        type: 'string',
        description: 'YouTube channel ID to list playlists for',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of playlists to return (1-50, default 25)',
      },
      page_token: {
        type: 'string',
        description: 'Page token for pagination (optional)',
      },
    },
    required: ['channel_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        part: 'snippet,contentDetails',
        channelId: params.channel_id,
        maxResults: String(params.max_results ?? 25),
      };
      if (params.page_token) query.pageToken = params.page_token;

      const result = await ctx.apiExecutor.get('/playlists', query);

      const playlists: any[] = result.items || [];
      if (playlists.length === 0) {
        return { content: `No playlists found for channel ${params.channel_id}.` };
      }

      const lines = playlists.map((pl: any) => {
        const snippet = pl.snippet || {};
        const videoCount = pl.contentDetails?.itemCount ?? 'N/A';
        return `${snippet.title || '(untitled)'} -- ${videoCount} videos (ID: ${pl.id})`;
      });

      const nextPage = result.nextPageToken;
      const pageNote = nextPage ? `\n\nNext page token: ${nextPage}` : '';

      return {
        content: `${playlists.length} playlists for channel ${params.channel_id}:\n${lines.join('\n')}${pageNote}`,
        metadata: {
          count: playlists.length,
          channelId: params.channel_id,
          nextPageToken: nextPage || null,
        },
      };
    } catch (err) {
      return youtubeError(err);
    }
  },
};

// ─── Tool: youtube_get_analytics ────────────────────────

const getAnalytics: ToolHandler = {
  description:
    'Get YouTube Analytics data for the authenticated channel. Returns views, watch time, subscribers gained, and engagement metrics for a date range.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      end_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      metrics: {
        type: 'string',
        description: 'Comma-separated metrics (default: "views,estimatedMinutesWatched,subscribersGained,likes,comments")',
      },
      dimensions: {
        type: 'string',
        description: 'Comma-separated dimensions for grouping (e.g. "day", "video", "country")',
      },
    },
    required: ['start_date', 'end_date'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const defaultMetrics = 'views,estimatedMinutesWatched,subscribersGained,likes,comments';

      const query: Record<string, string> = {
        ids: 'channel==MINE',
        startDate: params.start_date,
        endDate: params.end_date,
        metrics: params.metrics || defaultMetrics,
      };
      if (params.dimensions) query.dimensions = params.dimensions;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: 'https://youtubeanalytics.googleapis.com/v2/reports',
        query,
      });

      const headers: any[] = result.columnHeaders || [];
      const rows: any[][] = result.rows || [];

      if (rows.length === 0) {
        return { content: `No analytics data found for ${params.start_date} to ${params.end_date}.` };
      }

      const colNames = headers.map((h: any) => h.name || 'unknown');
      const lines = rows.map((row: any[]) => {
        return row.map((val: any, i: number) => `${colNames[i]}: ${val}`).join(' | ');
      });

      return {
        content: `YouTube Analytics (${params.start_date} to ${params.end_date}):\n\n${lines.join('\n')}`,
        metadata: {
          rowCount: rows.length,
          startDate: params.start_date,
          endDate: params.end_date,
          metrics: params.metrics || defaultMetrics,
        },
      };
    } catch (err) {
      return youtubeError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const youtubeAdapter: SkillAdapter = {
  skillId: 'youtube',
  name: 'YouTube',
  baseUrl: 'https://www.googleapis.com/youtube/v3',
  auth: {
    type: 'oauth2',
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
  },
  tools: {
    youtube_search: youtubeSearch,
    youtube_list_videos: listVideos,
    youtube_get_channel: getChannel,
    youtube_list_playlists: listPlaylists,
    youtube_get_analytics: getAnalytics,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
