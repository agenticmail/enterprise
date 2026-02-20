/**
 * MCP Skill Adapter — Telegram Bot API
 *
 * Maps Telegram Bot API endpoints to MCP tool handlers.
 * Telegram Bot API uses a unique URL pattern: /bot{token}/methodName
 * All requests return { ok: true/false, result: ... }.
 *
 * Telegram Bot API docs: https://core.telegram.org/bots/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/**
 * Telegram always returns { ok, result, description }.
 * Check the `ok` field to detect errors.
 */
function assertTelegramOk(result: any): asserts result is { ok: true; result: any } {
  if (result.ok === false) {
    const detail = result.description || 'unknown_error';
    const code = result.error_code ? ` (code ${result.error_code})` : '';
    const err = new Error(`Telegram API error: ${detail}${code}`);
    (err as any).telegramError = detail;
    throw err;
  }
}

function telegramError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: message, isError: true };
}

/** Build the bot-specific API path */
function botPath(ctx: ToolExecutionContext, method: string): string {
  const token = ctx.skillConfig.botToken;
  return `/bot${token}/${method}`;
}

// ─── Tool: telegram_send_message ────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a text message via Telegram Bot API. Supports Markdown and HTML formatting.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: 'Unique identifier for the target chat or username of the target channel (e.g. "@channelusername")',
      },
      text: {
        type: 'string',
        description: 'Text of the message to send (1-4096 characters)',
      },
      parse_mode: {
        type: 'string',
        enum: ['MarkdownV2', 'HTML', 'Markdown'],
        description: 'Formatting mode for the message (optional)',
      },
      disable_notification: {
        type: 'boolean',
        description: 'Send the message silently without notification (optional)',
      },
      reply_to_message_id: {
        type: 'number',
        description: 'ID of the message to reply to (optional)',
      },
    },
    required: ['chat_id', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!ctx.skillConfig.botToken) {
        return { content: 'Missing botToken in skill configuration.', isError: true };
      }

      const body: Record<string, any> = {
        chat_id: params.chat_id,
        text: params.text,
      };
      if (params.parse_mode) body.parse_mode = params.parse_mode;
      if (params.disable_notification !== undefined) body.disable_notification = params.disable_notification;
      if (params.reply_to_message_id) body.reply_to_message_id = params.reply_to_message_id;

      const result = await ctx.apiExecutor.post(botPath(ctx, 'sendMessage'), body);
      assertTelegramOk(result);

      const msg = result.result;
      return {
        content: `Message sent to chat ${params.chat_id} (message ID: ${msg.message_id})`,
        metadata: { messageId: msg.message_id, chatId: params.chat_id },
      };
    } catch (err) {
      return telegramError(err);
    }
  },
};

// ─── Tool: telegram_send_photo ──────────────────────────

const sendPhoto: ToolHandler = {
  description:
    'Send a photo to a Telegram chat. Provide the chat ID and a URL to the photo.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: 'Unique identifier for the target chat',
      },
      photo: {
        type: 'string',
        description: 'URL of the photo to send, or a file_id of a photo already on Telegram servers',
      },
      caption: {
        type: 'string',
        description: 'Photo caption (0-1024 characters, optional)',
      },
      parse_mode: {
        type: 'string',
        enum: ['MarkdownV2', 'HTML', 'Markdown'],
        description: 'Formatting mode for the caption (optional)',
      },
    },
    required: ['chat_id', 'photo'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!ctx.skillConfig.botToken) {
        return { content: 'Missing botToken in skill configuration.', isError: true };
      }

      const body: Record<string, any> = {
        chat_id: params.chat_id,
        photo: params.photo,
      };
      if (params.caption) body.caption = params.caption;
      if (params.parse_mode) body.parse_mode = params.parse_mode;

      const result = await ctx.apiExecutor.post(botPath(ctx, 'sendPhoto'), body);
      assertTelegramOk(result);

      const msg = result.result;
      return {
        content: `Photo sent to chat ${params.chat_id} (message ID: ${msg.message_id})`,
        metadata: { messageId: msg.message_id, chatId: params.chat_id },
      };
    } catch (err) {
      return telegramError(err);
    }
  },
};

// ─── Tool: telegram_get_updates ─────────────────────────

const getUpdates: ToolHandler = {
  description:
    'Get incoming updates (messages, callbacks, etc.) for the Telegram bot. Use offset to acknowledge previous updates.',
  inputSchema: {
    type: 'object',
    properties: {
      offset: {
        type: 'number',
        description: 'Identifier of the first update to return. Set to last update_id + 1 to acknowledge previous updates.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of updates to retrieve (1-100, default 20)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds for long polling (0 for short polling, default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!ctx.skillConfig.botToken) {
        return { content: 'Missing botToken in skill configuration.', isError: true };
      }

      const body: Record<string, any> = {
        limit: params.limit ?? 20,
        timeout: params.timeout ?? 0,
      };
      if (params.offset !== undefined) body.offset = params.offset;

      const result = await ctx.apiExecutor.post(botPath(ctx, 'getUpdates'), body);
      assertTelegramOk(result);

      const updates: any[] = result.result || [];
      if (updates.length === 0) {
        return { content: 'No new updates.' };
      }

      const lines = updates.map((u: any) => {
        const msg = u.message || u.edited_message || u.channel_post;
        if (msg) {
          const from = msg.from?.username || msg.from?.first_name || 'unknown';
          const text = (msg.text || msg.caption || '[non-text message]').slice(0, 120);
          const chat = msg.chat?.title || msg.chat?.username || msg.chat?.id || 'unknown';
          return `[${u.update_id}] ${from} in ${chat}: ${text}`;
        }
        return `[${u.update_id}] ${Object.keys(u).filter(k => k !== 'update_id').join(', ')}`;
      });

      return {
        content: `${updates.length} updates:\n${lines.join('\n')}`,
        metadata: { count: updates.length, lastUpdateId: updates[updates.length - 1]?.update_id },
      };
    } catch (err) {
      return telegramError(err);
    }
  },
};

// ─── Tool: telegram_get_chat ────────────────────────────

const getChat: ToolHandler = {
  description:
    'Get information about a Telegram chat (private, group, supergroup, or channel).',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: 'Unique identifier for the target chat or username (e.g. "@channelusername")',
      },
    },
    required: ['chat_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!ctx.skillConfig.botToken) {
        return { content: 'Missing botToken in skill configuration.', isError: true };
      }

      const body = { chat_id: params.chat_id };
      const result = await ctx.apiExecutor.post(botPath(ctx, 'getChat'), body);
      assertTelegramOk(result);

      const chat = result.result;
      const type = chat.type || 'unknown';
      const title = chat.title || chat.first_name || chat.username || 'N/A';
      const memberCount = chat.member_count ?? 'N/A';
      const description = chat.description || 'No description';

      return {
        content: [
          `Chat: ${title} (${type})`,
          `ID: ${chat.id}`,
          `Username: ${chat.username ? '@' + chat.username : 'N/A'}`,
          `Members: ${memberCount}`,
          `Description: ${description}`,
        ].join('\n'),
        metadata: {
          chatId: chat.id,
          type: chat.type,
          title: chat.title,
          username: chat.username,
        },
      };
    } catch (err) {
      return telegramError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const telegramAdapter: SkillAdapter = {
  skillId: 'telegram-bot',
  name: 'Telegram Bot',
  baseUrl: 'https://api.telegram.org',
  auth: {
    type: 'api_key',
    envVar: 'TELEGRAM_BOT_TOKEN',
  },
  tools: {
    telegram_send_message: sendMessage,
    telegram_send_photo: sendPhoto,
    telegram_get_updates: getUpdates,
    telegram_get_chat: getChat,
  },
  configSchema: {
    botToken: {
      type: 'secret',
      label: 'Bot Token',
      description: 'Telegram Bot API token from @BotFather',
      required: true,
    },
  },
  rateLimits: { requestsPerSecond: 30, burstLimit: 60 },
};
