/**
 * Telegram Tools — Bot API. Webhook preferred, long-polling fallback.
 * 
 * Setup: Create bot via @BotFather, paste token in Dashboard > Settings > Integrations.
 * If a public URL is available (fly.io, VPS, tunnel), webhook is auto-configured.
 * Otherwise falls back to getUpdates long-polling.
 */

import type { ToolDefinition } from '../../types.js';

interface TelegramConfig {
  botToken: string;
  onOutbound?: (chatId: string, text: string) => void;
}

async function tgApi(token: string, method: string, body?: any): Promise<any> {
  // Long-polling getUpdates needs a longer timeout than the Telegram server-side wait
  var timeoutMs = (method === 'getUpdates' && body?.timeout) ? (body.timeout + 15) * 1000 : 30000;
  var opts: any = { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs) };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(`https://api.telegram.org/bot${token}/${method}`, opts);
  var json = await r.json() as any;
  if (!json.ok) throw new Error(json.description || 'Telegram API error');
  return json.result;
}

async function tgUpload(token: string, method: string, chatId: string | number, fieldName: string, filePath: string, extra?: Record<string, string>): Promise<any> {
  var { readFile } = await import('node:fs/promises');
  var { basename } = await import('node:path');
  var buf = await readFile(filePath);
  var form = new FormData();
  form.append('chat_id', String(chatId));
  form.append(fieldName, new Blob([buf]), basename(filePath));
  if (extra) for (var [k, v] of Object.entries(extra)) form.append(k, v);
  var r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  var json = await r.json() as any;
  if (!json.ok) throw new Error(json.description || 'Upload failed');
  return json.result;
}

export function createTelegramTools(config: TelegramConfig): ToolDefinition[] {
  var { botToken, onOutbound } = config;
  return [
    {
      name: 'telegram_send',
      description: 'Send/reply a Telegram message to a chat.',
      input_schema: {
        type: 'object' as const,
        properties: {
          chatId: { type: 'string' },
          text: { type: 'string' },
          replyTo: { type: 'number' },
        },
        required: ['chatId', 'text'],
      },
      execute: async (_id: string, input: any) => {
        var r = await tgApi(botToken, 'sendMessage', {
          chat_id: input.chatId, text: input.text, parse_mode: 'HTML',
          ...(input.replyTo ? { reply_parameters: { message_id: input.replyTo } } : {}),
        });
        if (onOutbound) try { onOutbound(input.chatId, input.text); } catch {}
        return { ok: true, messageId: r.message_id };
      },
    },
    {
      name: 'telegram_send_media',
      description: 'Send image, video, or document from local file.',
      input_schema: {
        type: 'object' as const,
        properties: {
          chatId: { type: 'string' },
          filePath: { type: 'string' },
          caption: { type: 'string' },
          type: { type: 'string', description: 'photo|video|document (auto-detected)' },
        },
        required: ['chatId', 'filePath'],
      },
      execute: async (_id: string, input: any) => {
        var ext = input.filePath.split('.').pop()?.toLowerCase() || '';
        var type = input.type || (['mp4', 'mov', 'webm'].includes(ext) ? 'video' : ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'photo' : 'document');
        var method = type === 'photo' ? 'sendPhoto' : type === 'video' ? 'sendVideo' : 'sendDocument';
        var field = type === 'photo' ? 'photo' : type === 'video' ? 'video' : 'document';
        var r = await tgUpload(botToken, method, input.chatId, field, input.filePath, input.caption ? { caption: input.caption } : undefined);
        return { ok: true, type, messageId: r.message_id };
      },
    },
    {
      name: 'telegram_get_me',
      description: 'Get bot info.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async (_id: string) => tgApi(botToken, 'getMe'),
    },
    {
      name: 'telegram_get_chat',
      description: 'Get chat/group details.',
      input_schema: {
        type: 'object' as const,
        properties: { chatId: { type: 'string' } },
        required: ['chatId'],
      },
      execute: async (_id: string, input: any) => tgApi(botToken, 'getChat', { chat_id: input.chatId }),
    },
  ];
}

// ─── Webhook Setup ──────────────────────────────────

/** Set Telegram webhook. Call once when public URL is available. */
export async function setTelegramWebhook(botToken: string, webhookUrl: string, secret?: string): Promise<any> {
  return tgApi(botToken, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
}

/** Remove webhook (switches back to getUpdates mode). */
export async function deleteTelegramWebhook(botToken: string): Promise<any> {
  return tgApi(botToken, 'deleteWebhook', {});
}

/** Check current webhook status. */
export async function getTelegramWebhookInfo(botToken: string): Promise<any> {
  return tgApi(botToken, 'getWebhookInfo');
}

// ─── Polling Fallback ───────────────────────────────

/** Long-poll for updates (fallback when no public URL). */
export async function pollTelegramUpdates(botToken: string, offset: number, timeoutSec = 25): Promise<{ updates: any[]; nextOffset: number }> {
  var updates = await tgApi(botToken, 'getUpdates', {
    offset, timeout: timeoutSec, allowed_updates: ['message'],
  });
  var nextOffset = offset;
  for (var u of updates) { if (u.update_id >= nextOffset) nextOffset = u.update_id + 1; }
  return { updates, nextOffset };
}
