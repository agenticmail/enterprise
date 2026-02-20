/**
 * MCP Skill Adapter — Loom
 *
 * Maps Loom Developer API v1 endpoints to MCP tool handlers.
 * Supports video listing, retrieval, deletion, and transcript access.
 *
 * Loom API docs: https://developer.loom.com/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function loomError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.error || err.message;
      return { content: `Loom API error: ${detail}`, isError: true };
    }
    return { content: `Loom API error: ${err.message}`, isError: true };
  }
  return { content: `Loom API error: ${String(err)}`, isError: true };
}

/** Format duration in seconds to human-readable mm:ss */
function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Tool: loom_list_videos ─────────────────────────────

const listVideos: ToolHandler = {
  description:
    'List Loom videos owned by the authenticated user. Returns video names, durations, and share links.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of videos to return (default 25)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor for fetching the next page (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.get('/videos', query);

      const videos: any[] = result.videos || result.data || [];
      if (videos.length === 0) {
        return { content: 'No videos found.' };
      }

      const lines = videos.map((v: any) => {
        const duration = formatDuration(v.duration);
        const created = v.created_at ? v.created_at.slice(0, 10) : 'N/A';
        const views = v.view_count ?? 0;
        return `${v.name || 'Untitled'} (${duration}) — ${views} views — Created: ${created} — ID: ${v.id}`;
      });

      const nextCursor = result.next_cursor || result.pagination?.next_cursor;
      const paginationNote = nextCursor ? `\n(Next cursor: ${nextCursor})` : '';

      return {
        content: `Found ${videos.length} videos:\n${lines.join('\n')}${paginationNote}`,
        metadata: { count: videos.length, nextCursor },
      };
    } catch (err) {
      return loomError(err);
    }
  },
};

// ─── Tool: loom_get_video ───────────────────────────────

const getVideo: ToolHandler = {
  description:
    'Get detailed information about a specific Loom video including its share link, duration, and view count.',
  inputSchema: {
    type: 'object',
    properties: {
      video_id: {
        type: 'string',
        description: 'The ID of the Loom video to retrieve',
      },
    },
    required: ['video_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/videos/${params.video_id}`);

      const video = result.video || result;
      const duration = formatDuration(video.duration);

      return {
        content: [
          `Title: ${video.name || 'Untitled'}`,
          `Duration: ${duration}`,
          `Views: ${video.view_count ?? 0}`,
          `Status: ${video.status || 'unknown'}`,
          `Share Link: ${video.share_url || video.sharedUrl || 'N/A'}`,
          `Embed Link: ${video.embed_url || 'N/A'}`,
          `Created: ${video.created_at || 'N/A'}`,
          `Owner: ${video.owner_name || video.owner?.name || 'unknown'}`,
        ].join('\n'),
        metadata: {
          videoId: params.video_id,
          name: video.name,
          duration: video.duration,
          shareUrl: video.share_url || video.sharedUrl,
        },
      };
    } catch (err) {
      return loomError(err);
    }
  },
};

// ─── Tool: loom_delete_video ────────────────────────────

const deleteVideo: ToolHandler = {
  description:
    'Delete a Loom video by its ID. This action is permanent and cannot be undone.',
  inputSchema: {
    type: 'object',
    properties: {
      video_id: {
        type: 'string',
        description: 'The ID of the Loom video to delete',
      },
    },
    required: ['video_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      await ctx.apiExecutor.delete(`/videos/${params.video_id}`);

      return {
        content: `Video ${params.video_id} has been permanently deleted.`,
        metadata: { videoId: params.video_id, deleted: true },
      };
    } catch (err) {
      return loomError(err);
    }
  },
};

// ─── Tool: loom_get_transcript ──────────────────────────

const getTranscript: ToolHandler = {
  description:
    'Get the transcript of a Loom video. Returns the full text transcript with timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      video_id: {
        type: 'string',
        description: 'The ID of the Loom video to get the transcript for',
      },
    },
    required: ['video_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/videos/${params.video_id}/transcript`);

      const segments: any[] = result.segments || result.transcript || [];
      if (segments.length === 0) {
        return { content: `No transcript available for video ${params.video_id}. The video may still be processing.` };
      }

      // If segments are structured with timestamps
      if (segments[0] && typeof segments[0] === 'object' && segments[0].text) {
        const lines = segments.map((seg: any) => {
          const start = formatDuration(seg.start_time || seg.start);
          return `[${start}] ${seg.text}`;
        });
        return {
          content: `Transcript for video ${params.video_id}:\n${lines.join('\n')}`,
          metadata: { videoId: params.video_id, segmentCount: segments.length },
        };
      }

      // If transcript is a flat string or simple array
      const text = Array.isArray(segments) ? segments.join(' ') : String(result.text || result);
      return {
        content: `Transcript for video ${params.video_id}:\n${text}`,
        metadata: { videoId: params.video_id },
      };
    } catch (err) {
      return loomError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const loomAdapter: SkillAdapter = {
  skillId: 'loom-video',
  name: 'Loom',
  baseUrl: 'https://developer.loom.com/v1',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    loom_list_videos: listVideos,
    loom_get_video: getVideo,
    loom_delete_video: deleteVideo,
    loom_get_transcript: getTranscript,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
