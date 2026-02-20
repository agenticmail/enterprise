/**
 * MCP Skill Adapter — Discord
 *
 * Maps Discord API v10 endpoints to MCP tool handlers.
 * Handles Discord-specific error patterns where error responses include
 * `{ code, message }` with standard HTTP error codes.
 *
 * Discord API docs: https://discord.com/developers/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Map Discord channel type integers to human-readable names */
const CHANNEL_TYPE_NAMES: Record<number, string> = {
  0: 'text',
  2: 'voice',
  4: 'category',
  5: 'announcement',
  13: 'stage',
  15: 'forum',
};

function channelTypeName(type: number): string {
  return CHANNEL_TYPE_NAMES[type] ?? `unknown(${type})`;
}

function discordError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: message, isError: true };
}

// ─── Tool: discord_send_message ─────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a message to a Discord channel. Provide the channel ID and message content.',
  inputSchema: {
    type: 'object',
    properties: {
      channel_id: {
        type: 'string',
        description: 'The ID of the channel to send the message to',
      },
      content: {
        type: 'string',
        description: 'Message content (supports Discord markdown)',
      },
      tts: {
        type: 'boolean',
        description: 'Whether the message should be sent as text-to-speech (optional)',
      },
    },
    required: ['channel_id', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        content: params.content,
      };
      if (params.tts !== undefined) body.tts = params.tts;

      const result = await ctx.apiExecutor.post(
        `/channels/${params.channel_id}/messages`,
        body,
      );

      return {
        content: `Message sent (ID: ${result.id}) in channel ${params.channel_id}`,
        metadata: { messageId: result.id, channelId: params.channel_id },
      };
    } catch (err) {
      return discordError(err);
    }
  },
};

// ─── Tool: discord_list_channels ────────────────────────

const listChannels: ToolHandler = {
  description:
    'List all channels in a Discord server (guild). Returns channel names, types, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      guild_id: {
        type: 'string',
        description: 'The ID of the guild (server) to list channels for',
      },
    },
    required: ['guild_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const channels: any[] = await ctx.apiExecutor.get(
        `/guilds/${params.guild_id}/channels`,
      );

      if (!channels || channels.length === 0) {
        return { content: 'No channels found in this server.' };
      }

      const lines = channels.map((ch: any) => {
        const typeName = channelTypeName(ch.type);
        return `#${ch.name} (${typeName}) — ${ch.id}`;
      });

      return {
        content: `Found ${channels.length} channels:\n${lines.join('\n')}`,
        metadata: { count: channels.length, guildId: params.guild_id },
      };
    } catch (err) {
      return discordError(err);
    }
  },
};

// ─── Tool: discord_create_channel ───────────────────────

const createChannel: ToolHandler = {
  description:
    'Create a new channel in a Discord server (guild). Specify name and optional type, topic, and parent category.',
  inputSchema: {
    type: 'object',
    properties: {
      guild_id: {
        type: 'string',
        description: 'The ID of the guild (server) to create the channel in',
      },
      name: {
        type: 'string',
        description: 'Channel name (lowercase, hyphens for spaces)',
      },
      type: {
        type: 'number',
        description: 'Channel type: 0=text (default), 2=voice, 4=category, 5=announcement, 13=stage, 15=forum',
      },
      topic: {
        type: 'string',
        description: 'Channel topic / description (optional)',
      },
      parent_id: {
        type: 'string',
        description: 'ID of the parent category channel (optional)',
      },
    },
    required: ['guild_id', 'name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
        type: params.type ?? 0,
      };
      if (params.topic) body.topic = params.topic;
      if (params.parent_id) body.parent_id = params.parent_id;

      const result = await ctx.apiExecutor.post(
        `/guilds/${params.guild_id}/channels`,
        body,
      );

      return {
        content: `Channel #${result.name} created (ID: ${result.id})`,
        metadata: { channelId: result.id, name: result.name, guildId: params.guild_id },
      };
    } catch (err) {
      return discordError(err);
    }
  },
};

// ─── Tool: discord_get_guild ────────────────────────────

const getGuild: ToolHandler = {
  description:
    'Get information about a Discord server (guild), including member count, owner, and features.',
  inputSchema: {
    type: 'object',
    properties: {
      guild_id: {
        type: 'string',
        description: 'The ID of the guild (server) to retrieve info for',
      },
    },
    required: ['guild_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const guild = await ctx.apiExecutor.get(
        `/guilds/${params.guild_id}`,
        { with_counts: 'true' },
      );

      const createdDate = guild.id
        ? new Date(Number(BigInt(guild.id) >> 22n) + 1420070400000).toISOString().slice(0, 10)
        : 'unknown';

      const features = guild.features?.length > 0
        ? guild.features.join(', ')
        : 'none';

      return {
        content: [
          `Server: ${guild.name}`,
          `Members: ${guild.approximate_member_count ?? 'unknown'}`,
          `Owner: ${guild.owner_id}`,
          `Created: ${createdDate}`,
          `Features: ${features}`,
        ].join('\n'),
        metadata: {
          guildId: guild.id,
          name: guild.name,
          memberCount: guild.approximate_member_count,
        },
      };
    } catch (err) {
      return discordError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const discordAdapter: SkillAdapter = {
  skillId: 'discord',
  name: 'Discord',
  baseUrl: 'https://discord.com/api/v10',
  auth: {
    type: 'token',
    headerPrefix: 'Bot',
  },
  tools: {
    discord_send_message: sendMessage,
    discord_list_channels: listChannels,
    discord_create_channel: createChannel,
    discord_get_guild: getGuild,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
