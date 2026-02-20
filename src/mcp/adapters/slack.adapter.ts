/**
 * MCP Skill Adapter — Slack
 *
 * Maps Slack Web API endpoints to MCP tool handlers.
 * Handles the Slack-specific quirk of returning HTTP 200 on errors
 * with `{ ok: false, error: "..." }` in the response body.
 *
 * Slack Web API docs: https://api.slack.com/methods
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/**
 * Slack returns HTTP 200 even on API errors. This helper checks the
 * `ok` field and converts Slack errors into a consistent ToolResult.
 */
function assertSlackOk(result: any): asserts result is { ok: true; [key: string]: any } {
  if (result.ok === false) {
    const detail = result.error || 'unknown_error';
    const err = new Error(`Slack API error: ${detail}`);
    (err as any).slackError = detail;
    (err as any).responseMetadata = result.response_metadata;
    throw err;
  }
}

function slackError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: message, isError: true };
}

// ─── Tool: slack_send_message ───────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a message to a Slack channel or thread. Provide channel ID or name and the message text.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Channel ID or name (e.g. "C01234ABCDE" or "#general")',
      },
      text: {
        type: 'string',
        description: 'Message text (supports Slack mrkdwn formatting)',
      },
      thread_ts: {
        type: 'string',
        description: 'Thread timestamp to reply in a thread (optional)',
      },
      unfurl_links: {
        type: 'boolean',
        description: 'Whether to unfurl URL previews (optional)',
      },
    },
    required: ['channel', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        channel: params.channel,
        text: params.text,
      };
      if (params.thread_ts) body.thread_ts = params.thread_ts;
      if (params.unfurl_links !== undefined) body.unfurl_links = params.unfurl_links;

      const result = await ctx.apiExecutor.post('/chat.postMessage', body);
      assertSlackOk(result);

      const threadInfo = params.thread_ts ? ` (thread reply)` : '';
      return {
        content: `Message sent to #${result.channel}${threadInfo} (ts: ${result.ts})`,
        metadata: { channel: result.channel, ts: result.ts, threadTs: params.thread_ts },
      };
    } catch (err) {
      return slackError(err);
    }
  },
};

// ─── Tool: slack_list_channels ──────────────────────────

const listChannels: ToolHandler = {
  description:
    'List Slack channels the bot has access to. Returns channel names, IDs, member counts, and purposes.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of channels to return (default 100)',
      },
      types: {
        type: 'string',
        description:
          'Comma-separated channel types: "public_channel", "private_channel" (default: "public_channel,private_channel")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 100),
      };
      if (params.types) query.types = params.types;

      const result = await ctx.apiExecutor.get('/conversations.list', query);
      assertSlackOk(result);

      const channels: any[] = result.channels || [];
      if (channels.length === 0) {
        return { content: 'No channels found.' };
      }

      const lines = channels.map((ch: any) => {
        const purpose = ch.purpose?.value ? ` -- ${ch.purpose.value}` : '';
        const memberCount = ch.num_members ?? '?';
        return `#${ch.name} (${ch.id}) -- ${memberCount} members${purpose}`;
      });

      return {
        content: `Found ${channels.length} channels:\n${lines.join('\n')}`,
        metadata: { count: channels.length },
      };
    } catch (err) {
      return slackError(err);
    }
  },
};

// ─── Tool: slack_create_channel ─────────────────────────

const createChannel: ToolHandler = {
  description: 'Create a new Slack channel (public or private).',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Channel name (lowercase, no spaces, max 80 chars)',
      },
      is_private: {
        type: 'boolean',
        description: 'Whether the channel is private (default: false)',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
        is_private: params.is_private ?? false,
      };

      const result = await ctx.apiExecutor.post('/conversations.create', body);
      assertSlackOk(result);

      const ch = result.channel;
      const visibility = ch.is_private ? 'private' : 'public';
      return {
        content: `Channel #${ch.name} created (ID: ${ch.id}, ${visibility})`,
        metadata: { channelId: ch.id, name: ch.name, isPrivate: ch.is_private },
      };
    } catch (err) {
      return slackError(err);
    }
  },
};

// ─── Tool: slack_search_messages ────────────────────────

const searchMessages: ToolHandler = {
  description:
    'Search for messages across the Slack workspace. Requires a query string and returns matching messages with context.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (supports Slack search modifiers like "from:@user" or "in:#channel")',
      },
      count: {
        type: 'number',
        description: 'Number of results to return (default 20, max 100)',
      },
      sort: {
        type: 'string',
        enum: ['score', 'timestamp'],
        description: 'Sort order: "score" (relevance) or "timestamp" (newest first)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        query: params.query,
        count: String(params.count ?? 20),
      };
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get('/search.messages', query);
      assertSlackOk(result);

      const messages = result.messages?.matches || [];
      const total = result.messages?.total ?? 0;

      if (messages.length === 0) {
        return { content: `No messages found for query: "${params.query}"` };
      }

      const lines = messages.map((m: any) => {
        const channel = m.channel?.name ? `#${m.channel.name}` : 'unknown';
        const user = m.username || m.user || 'unknown';
        const ts = m.ts ? new Date(parseFloat(m.ts) * 1000).toISOString().slice(0, 16) : '';
        const text = (m.text || '').slice(0, 150).replace(/\n/g, ' ');
        return `[${channel}] ${user} (${ts}): ${text}`;
      });

      return {
        content: `Found ${total} results (showing ${messages.length}):\n${lines.join('\n')}`,
        metadata: { total, shown: messages.length, query: params.query },
      };
    } catch (err) {
      return slackError(err);
    }
  },
};

// ─── Tool: slack_add_reaction ───────────────────────────

const addReaction: ToolHandler = {
  description:
    'Add an emoji reaction to a message. Provide the channel, message timestamp, and emoji name (without colons).',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Channel ID containing the message',
      },
      timestamp: {
        type: 'string',
        description: 'Timestamp (ts) of the message to react to',
      },
      name: {
        type: 'string',
        description: 'Emoji name without colons (e.g. "thumbsup", "white_check_mark")',
      },
    },
    required: ['channel', 'timestamp', 'name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        channel: params.channel,
        timestamp: params.timestamp,
        name: params.name,
      };

      const result = await ctx.apiExecutor.post('/reactions.add', body);
      assertSlackOk(result);

      return {
        content: `Added :${params.name}: to message in ${params.channel} (ts: ${params.timestamp})`,
        metadata: { channel: params.channel, timestamp: params.timestamp, emoji: params.name },
      };
    } catch (err) {
      return slackError(err);
    }
  },
};

// ─── Tool: slack_upload_file ────────────────────────────

const uploadFile: ToolHandler = {
  description:
    'Upload a file (from text content) to one or more Slack channels. Provide the content as a string.',
  inputSchema: {
    type: 'object',
    properties: {
      channels: {
        type: 'string',
        description: 'Comma-separated list of channel IDs to share the file in',
      },
      content: {
        type: 'string',
        description: 'Text content of the file',
      },
      filename: {
        type: 'string',
        description: 'Filename with extension (e.g. "report.csv", optional)',
      },
      title: {
        type: 'string',
        description: 'Display title for the file (optional)',
      },
    },
    required: ['channels', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const content = params.content || '';
      const filename = params.filename || 'upload.txt';
      const title = params.title || filename;
      const channels = params.channels || '';

      // Step 1: Get upload URL from Slack
      const uploadInfo = await ctx.apiExecutor.get('/files.getUploadURLExternal', {
        filename,
        length: String(new TextEncoder().encode(content).length),
      });
      if (!uploadInfo.ok) {
        return { content: `Slack error: ${uploadInfo.error || 'Failed to get upload URL'}`, isError: true };
      }

      // Step 2: Upload file content to the provided URL
      await ctx.apiExecutor.request({
        method: 'POST',
        url: uploadInfo.upload_url,
        rawBody: new TextEncoder().encode(content),
        rawContentType: 'application/octet-stream',
      });

      // Step 3: Complete the upload and share to channel(s)
      const channelId = channels.split(',')[0].trim();
      const complete = await ctx.apiExecutor.post('/files.completeUploadExternal', {
        files: [{ id: uploadInfo.file_id, title }],
        channel_id: channelId,
      });
      if (!complete.ok) {
        return { content: `Slack error: ${complete.error || 'Failed to complete upload'}`, isError: true };
      }

      return {
        content: `File uploaded: ${title} (id: ${uploadInfo.file_id}) to ${channelId}`,
        metadata: { fileId: uploadInfo.file_id, channels },
      };
    } catch (err) {
      if (err instanceof Error) {
        const data = (err as any).data;
        if (data?.error) return { content: `Slack API error: ${data.error}`, isError: true };
        return { content: err.message, isError: true };
      }
      return { content: String(err), isError: true };
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const slackAdapter: SkillAdapter = {
  skillId: 'slack',
  name: 'Slack',
  baseUrl: 'https://slack.com/api',
  auth: {
    type: 'oauth2',
    provider: 'slack',
    headerPrefix: 'Bearer',
  },
  tools: {
    slack_send_message: sendMessage,
    slack_list_channels: listChannels,
    slack_create_channel: createChannel,
    slack_search_messages: searchMessages,
    slack_add_reaction: addReaction,
    slack_upload_file: uploadFile,
  },
  rateLimits: { requestsPerSecond: 1, burstLimit: 20 },
};
