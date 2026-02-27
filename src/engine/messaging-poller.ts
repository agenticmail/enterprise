/**
 * Messaging Poller — Unified incoming message handler for WhatsApp, Telegram.
 * 
 * STRATEGY (webhook-first, polling fallback):
 * 
 * - WhatsApp: Always event-driven (Baileys WebSocket — acts like a persistent webhook)
 * - Telegram: Webhook if public URL available → long-polling fallback (25s blocks)
 * 
 * Webhook routes are mounted on the engine Hono app at /api/webhooks/telegram.
 * For fly.io/VPS/Docker with public URL: auto-registers webhook with Telegram API.
 * For local/personal systems without public URL: falls back to getUpdates polling.
 * 
 * All incoming messages dispatch to agent /api/runtime/chat — same as ChatPoller.
 */

import type { Hono } from 'hono';
import type { ManagedAgent } from './db-adapter.js';

interface MessagingPollerConfig {
  agents: ManagedAgent[];
  getVaultKey: (name: string) => string | null;
  getCapability: (key: string) => boolean;
  getAgentChannelConfig: (agentId: string) => any; // Per-agent messaging channel config
  dataDir: string;
  publicUrl?: string; // e.g. https://enterprise.example.com — enables webhooks
  app?: Hono; // Engine Hono app to mount webhook routes on
  engineDb?: any; // Postgres pool — for persisting cursors + message logs
}

interface AgentEndpoint {
  id: string;
  displayName: string;
  host: string;
  port: number;
}

export class MessagingPoller {
  private running = false;
  private cleanups: (() => void)[] = [];
  private config: MessagingPollerConfig;
  private telegramMode: 'webhook' | 'polling' | 'off' = 'off';

  constructor(config: MessagingPollerConfig) {
    this.config = config;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('[messaging] Starting channels...');

    var agents = this.config.agents.filter(a => a.status === 'active');
    if (agents.length === 0) { console.log('[messaging] No active agents'); return; }

    var defaultAgent: AgentEndpoint = {
      id: agents[0].id,
      displayName: agents[0].displayName || agents[0].name,
      host: 'localhost',
      port: agents[0].port || 3102,
    };

    // WhatsApp — always event-driven (Baileys WebSocket)
    if (this.config.getCapability('whatsapp')) {
      await this.startWhatsApp(defaultAgent);
    }

    // Telegram — webhook preferred, polling fallback
    if (this.config.getCapability('telegram')) {
      var tgToken = this.config.getVaultKey('skill:telegram:access_token');
      if (tgToken) {
        await this.startTelegram(tgToken, defaultAgent);
      } else {
        console.log('[messaging] Telegram enabled but no bot token in vault');
      }
    }

    console.log(`[messaging] Ready (telegram=${this.telegramMode})`);
  }

  stop() {
    this.running = false;
    for (var fn of this.cleanups) fn();
    this.cleanups = [];
    console.log('[messaging] Stopped');
  }

  getStatus() {
    return {
      running: this.running,
      telegram: this.telegramMode,
      whatsapp: this.config.getCapability('whatsapp') ? 'event-driven' : 'off',
    };
  }

  // ─── WhatsApp (event-driven — Baileys WebSocket) ──

  private async startWhatsApp(agent: AgentEndpoint) {
    try {
      var { onWhatsAppMessage } = await import('../agent-tools/tools/messaging/whatsapp.js');
      var unsub = onWhatsAppMessage(agent.id, (msg) => {
        this.dispatch(agent, {
          source: 'whatsapp',
          senderName: msg.pushName || msg.from,
          senderId: msg.from,
          messageText: msg.text,
          isGroup: msg.isGroup,
          messageId: msg.messageId,
        });
      });
      this.cleanups.push(unsub);
      console.log('[messaging] WhatsApp: event-driven (Baileys WebSocket)');
    } catch (err: any) {
      console.error('[messaging] WhatsApp setup failed:', err.message);
    }
  }

  // ─── Telegram (webhook preferred, polling fallback) ─

  private async startTelegram(botToken: string, agent: AgentEndpoint) {
    var { setTelegramWebhook, deleteTelegramWebhook, getTelegramWebhookInfo } = await import('../agent-tools/tools/messaging/telegram.js');

    // Generate a secret for webhook verification
    var { randomBytes } = await import('node:crypto');
    var webhookSecret = randomBytes(32).toString('hex');

    // Try webhook first if we have a public URL and Hono app
    if (this.config.publicUrl && this.config.app) {
      try {
        var webhookUrl = `${this.config.publicUrl}/api/webhooks/telegram`;

        // Mount webhook route
        this.config.app.post('/api/webhooks/telegram', async (c) => {
          // Verify secret
          var secretHeader = c.req.header('x-telegram-bot-api-secret-token');
          if (secretHeader !== webhookSecret) {
            return c.json({ error: 'Unauthorized' }, 401);
          }
          var update = await c.req.json();
          this.handleTelegramUpdate(update, agent);
          return c.json({ ok: true });
        });

        // Register with Telegram
        await setTelegramWebhook(botToken, webhookUrl, webhookSecret);
        var info = await getTelegramWebhookInfo(botToken);

        if (info.url === webhookUrl) {
          this.telegramMode = 'webhook';
          var cleanupWebhook = async () => {
            try { await deleteTelegramWebhook(botToken); } catch {}
          };
          this.cleanups.push(() => { cleanupWebhook(); });
          console.log(`[messaging] Telegram: webhook at ${webhookUrl}`);
          return;
        }
      } catch (err: any) {
        console.log(`[messaging] Telegram webhook setup failed (${err.message}), falling back to polling`);
      }
    }

    // Fallback: long-polling
    await deleteTelegramWebhook(botToken).catch(() => {}); // Clear any stale webhook
    this.startTelegramPolling(botToken, agent);
  }

  private startTelegramPolling(botToken: string, agent: AgentEndpoint) {
    var offset = 0;
    var running = true;
    var db = this.config.engineDb;
    this.cleanups.push(() => { running = false; });
    this.telegramMode = 'polling';

    var loadOffset = async (): Promise<number> => {
      if (!db?.pool) return 0;
      try {
        var r = await db.pool.query(`SELECT value FROM engine_settings WHERE key = 'telegram_offset' LIMIT 1`);
        return parseInt(r.rows?.[0]?.value || '0', 10);
      } catch { return 0; }
    };

    var saveOffset = async (off: number) => {
      if (!db?.pool) return;
      try {
        await db.pool.query(
          `INSERT INTO engine_settings (key, value, updated_at) VALUES ('telegram_offset', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
          [String(off)]
        );
      } catch {}
    };

    var poll = async () => {
      offset = await loadOffset();
      while (running && this.running) {
        try {
          var { pollTelegramUpdates } = await import('../agent-tools/tools/messaging/telegram.js');
          var { updates, nextOffset } = await pollTelegramUpdates(botToken, offset, 25);
          if (nextOffset > offset) {
            offset = nextOffset;
            await saveOffset(offset); // Persist to Postgres
          }
          for (var update of updates) this.handleTelegramUpdate(update, agent);
        } catch (err: any) {
          if (!running) break;
          console.error('[messaging] Telegram poll error:', err.message);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    };
    poll();
    console.log('[messaging] Telegram: long-polling, offset in Postgres');
  }

  private handleTelegramUpdate(update: any, agent: AgentEndpoint) {
    var msg = update.message;
    if (!msg?.text) return;
    this.dispatch(agent, {
      source: 'telegram',
      senderName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown',
      senderId: String(msg.from?.id || ''),
      messageText: msg.text,
      isGroup: msg.chat?.type === 'group' || msg.chat?.type === 'supergroup',
      chatId: String(msg.chat?.id),
      messageId: String(msg.message_id),
    });
  }

  // ─── Trust / Authorization ─────────────────────────

  private isTrustedSender(agentId: string, source: string, senderId: string): { trusted: boolean; isManager: boolean } {
    var channelConfig = this.config.getAgentChannelConfig(agentId);
    if (!channelConfig) return { trusted: true, isManager: false }; // No config = allow all (backward compat)

    var managerIdentity = channelConfig.managerIdentity || {};
    var channelCfg = channelConfig[source] || {};
    var accessMode = channelCfg.accessMode || 'trusted_only';

    // Check if sender is the manager
    var isManager = false;
    if (source === 'whatsapp') isManager = !!(managerIdentity.whatsappNumber && senderId.includes(managerIdentity.whatsappNumber.replace(/[^0-9]/g, '')));
    else if (source === 'telegram') isManager = String(managerIdentity.telegramId) === String(senderId);

    if (isManager) return { trusted: true, isManager: true };

    // Access mode checks
    if (accessMode === 'open') return { trusted: true, isManager: false };
    if (accessMode === 'manager_only') return { trusted: false, isManager: false };

    // trusted_only — check allowlist
    var trustedList = channelCfg.trustedContacts || channelCfg.trustedChatIds || [];
    if (trustedList.length === 0) return { trusted: true, isManager: false }; // No list = allow all
    var normalized = senderId.replace(/[^0-9a-zA-Z@.]/g, '').toLowerCase();
    var found = trustedList.some((t: string) => normalized.includes(t.replace(/[^0-9a-zA-Z@.]/g, '').toLowerCase()));
    return { trusted: found, isManager: false };
  }

  // ─── Dispatch to agent ────────────────────────────

  private async dispatch(agent: AgentEndpoint, ctx: {
    source: string; senderName: string; senderId: string;
    messageText: string; isGroup?: boolean; chatId?: string; messageId?: string;
  }) {
    // Trust check
    var trust = this.isTrustedSender(agent.id, ctx.source, ctx.senderId);
    if (!trust.trusted) {
      console.log(`[messaging] Blocked untrusted ${ctx.source} sender: ${ctx.senderId}`);
      return;
    }

    try {
      var resp = await fetch(`http://${agent.host}:${agent.port}/api/runtime/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: ctx.source,
          senderName: ctx.senderName,
          senderEmail: ctx.senderId,
          spaceName: ctx.source,
          spaceId: ctx.chatId || ctx.senderId,
          isDM: !ctx.isGroup,
          messageText: ctx.messageText,
          messageId: ctx.messageId,
          isManager: trust.isManager,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) console.error(`[messaging] Dispatch to ${agent.displayName} failed: ${resp.status}`);
    } catch (err: any) {
      console.error(`[messaging] Dispatch error (${ctx.source}): ${err.message}`);
    }
  }
}
