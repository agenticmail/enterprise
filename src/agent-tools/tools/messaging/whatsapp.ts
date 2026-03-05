/**
 * WhatsApp Tools — QR code link via Baileys (WhatsApp Web multi-device).
 * 
 * Architecture (modeled after OpenClaw):
 * - Auth state persists to disk → auto-reconnects on restart without QR
 * - Reconnect loop with exponential backoff
 * - Self-chat mode: owner can message themselves to talk to agent
 * - Pending handler pattern: message handlers registered before connection exists
 * - Gateway auto-starts connections for all agents with saved auth on boot
 */

import { join } from 'node:path';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import type { ToolDefinition } from '../../types.js';

var connections = new Map<string, WhatsAppConnection>();

interface WhatsAppConnection {
  sock: any;
  qr: string | null;
  connected: boolean;
  saveCreds: () => Promise<void>;
  events: EventEmitter;
  user?: { id: string; name: string };
  selfE164?: string;
  selfLid?: string;
  reconnecting: boolean;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  lastMessageAt: number | null;
}

interface WhatsAppConfig {
  agentId: string;
  dataDir: string;
  onOutbound?: (contactId: string, text: string) => void;
}

// Pending message handlers for agents that haven't connected yet
var pendingHandlers = new Map<string, Set<(msg: any) => void>>();

/** Check if auth state exists on disk for an agent */
export async function hasAuthState(config: WhatsAppConfig): Promise<boolean> {
  try {
    var authDir = join(config.dataDir, 'auth');
    await stat(join(authDir, 'creds.json'));
    return true;
  } catch { return false; }
}

export async function getOrCreateConnection(config: WhatsAppConfig): Promise<WhatsAppConnection> {
  var existing = connections.get(config.agentId);
  if (existing?.connected) return existing;
  // If already reconnecting, return the existing connection object
  if (existing?.reconnecting) return existing;

  var baileys = await import('@whiskeysockets/baileys');
  var makeWASocket = baileys.default;
  var { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

  var authDir = join(config.dataDir, 'auth');
  await mkdir(authDir, { recursive: true });

  var { version } = await fetchLatestBaileysVersion();

  var conn: WhatsAppConnection = {
    sock: null as any, qr: null, connected: false, saveCreds: async () => {},
    events: new EventEmitter(), reconnecting: false, reconnectAttempts: 0,
    lastConnectedAt: null, lastMessageAt: null,
  };

  var createSocket = async () => {
    conn.reconnecting = true;
    try {
      // Reload auth state for reconnects
      var authState = await useMultiFileAuthState(authDir);
      var { makeCacheableSignalKeyStore } = baileys;

      // Suppress noisy Baileys logs
      var silentLogger = { level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => silentLogger } as any;

      var sock = makeWASocket({
        version,
        auth: {
          creds: authState.state.creds,
          keys: makeCacheableSignalKeyStore(authState.state.keys, silentLogger),
        },
        logger: silentLogger,
        printQRInTerminal: false,
        browser: ['AgenticMail', 'Desktop', '1.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      });

      sock.ev.on('creds.update', authState.saveCreds);
      conn.saveCreds = authState.saveCreds;

      sock.ev.on('connection.update', (update: any) => {
        if (update.qr) { conn.qr = update.qr; conn.connected = false; }
        if (update.connection === 'open') {
          conn.connected = true; conn.qr = null; conn.reconnecting = false;
          conn.reconnectAttempts = 0;
          conn.lastConnectedAt = Date.now();
          var rawId = sock.user?.id || '';
          conn.user = { id: rawId.split(':')[0] || '', name: sock.user?.name || '' };
          conn.selfE164 = conn.user.id;
          // Store LID for self-chat detection (WhatsApp uses LIDs for linked devices)
          conn.selfLid = sock.user?.lid?.split(':')[0] || '';
          console.log(`[wa:${config.agentId.slice(0,8)}] Connected as ${conn.user.id}`);
        }
        if (update.connection === 'close') {
          conn.connected = false;
          conn.reconnecting = false;
          var code = update.lastDisconnect?.error?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            console.log(`[wa:${config.agentId.slice(0,8)}] Logged out — clearing auth & need re-link`);
            connections.delete(config.agentId);
            // Clear stale auth files so next connect gets a fresh QR
            import('node:fs/promises').then(fs => fs.rm(authDir, { recursive: true, force: true })).catch(() => {});
          } else {
            // Reconnect with backoff
            conn.reconnectAttempts++;
            var delay = Math.min(3000 * Math.pow(1.5, conn.reconnectAttempts - 1), 60000);
            console.log(`[wa:${config.agentId.slice(0,8)}] Disconnected (code=${code}), reconnect #${conn.reconnectAttempts} in ${Math.round(delay/1000)}s`);
            setTimeout(() => createSocket(), delay);
          }
        }
      });

      // Incoming message handler
      sock.ev.on('messages.upsert', async (m: any) => {
        console.log(`[wa:${config.agentId.slice(0,8)}] messages.upsert type=${m.type} count=${m.messages?.length} listeners=${conn.events.listenerCount('message')}`);
        if (m.type !== 'notify' && m.type !== 'append') return;
        for (var msg of m.messages) {
          var remoteJid = msg.key?.remoteJid;
          var fromMe = msg.key?.fromMe;
          var text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
          if (!remoteJid) continue;
          // Skip status broadcasts
          if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')) continue;

          // fromMe handling (OpenClaw pattern):
          var isGroup = remoteJid.endsWith('@g.us');
          // Self-chat: match against both phone JID and LID (linked device ID)
          var isSelfChat = !isGroup && (
            (conn.selfE164 && remoteJid.includes(conn.selfE164)) ||
            (conn.selfLid && remoteJid.includes(conn.selfLid)) ||
            remoteJid.endsWith('@lid') // LID JIDs are always self/linked device
          );

          if (fromMe) {
            if (isGroup) continue;
            if (!isSelfChat) continue;
          }

          // Detect media
          var mediaMessage = msg.message?.imageMessage || msg.message?.videoMessage ||
            msg.message?.documentMessage || msg.message?.audioMessage ||
            msg.message?.stickerMessage || null;
          var hasMedia = !!mediaMessage;

          // For media messages, caption may be the text
          if (!text && mediaMessage) {
            text = mediaMessage.caption || '';
          }

          // Skip if no text AND no media
          if (!text && !hasMedia) continue;

          var senderJid = isGroup ? msg.key.participant : remoteJid;
          console.log(`[wa:${config.agentId.slice(0,8)}] Incoming from=${senderJid} group=${isGroup} selfChat=${!!isSelfChat} hasMedia=${hasMedia} text="${(text||'').slice(0,50)}"`);

          // Show typing indicator while agent processes
          try { await sock.sendPresenceUpdate('composing', remoteJid); } catch {}

          // Download media if present
          var mediaPath: string | undefined;
          var mediaType: string | undefined;
          if (hasMedia && mediaMessage) {
            try {
              var { downloadMediaMessage } = await import('@whiskeysockets/baileys');
              var buffer = await downloadMediaMessage(msg, 'buffer', {});
              if (buffer && buffer.length > 0) {
                var { join } = await import('path');
                var { mkdirSync, writeFileSync } = await import('fs');
                var mediaDir = join(config.dataDir || `/tmp/agents/${config.agentId}`, 'media');
                try { mkdirSync(mediaDir, { recursive: true }); } catch {}

                mediaType = msg.message?.imageMessage ? 'photo'
                  : msg.message?.videoMessage ? 'video'
                  : msg.message?.audioMessage ? 'audio'
                  : msg.message?.documentMessage ? 'document'
                  : msg.message?.stickerMessage ? 'sticker' : 'file';

                var ext = mediaType === 'photo' ? 'jpg' : mediaType === 'video' ? 'mp4'
                  : mediaType === 'audio' ? 'ogg' : mediaType === 'sticker' ? 'webp'
                  : (mediaMessage.fileName?.split('.').pop() || 'bin');
                var localName = mediaMessage.fileName || `${mediaType}-${Date.now()}.${ext}`;
                mediaPath = join(mediaDir, localName);
                writeFileSync(mediaPath, buffer);
                console.log(`[wa:${config.agentId.slice(0,8)}] Media downloaded: ${mediaPath} (${buffer.length} bytes)`);
              }
            } catch (dlErr: any) {
              console.error(`[wa:${config.agentId.slice(0,8)}] Media download failed: ${dlErr.message}`);
            }
          }

          // Build text with media info
          var finalText = text || '';
          if (mediaPath) {
            var desc = `[${mediaType}${mediaMessage?.fileName ? ': ' + mediaMessage.fileName : ''}] saved to: ${mediaPath}`;
            finalText = text ? `${text}\n\n${desc}` : desc;
          } else if (hasMedia && !text) {
            finalText = `[${mediaType || 'media'} received but download failed]`;
          }

          conn.lastMessageAt = Date.now();
          conn.events.emit('message', {
            from: remoteJid,
            senderJid,
            pushName: msg.pushName,
            text: finalText,
            timestamp: msg.messageTimestamp,
            hasMedia,
            mediaPath,
            mediaType,
            messageId: msg.key.id,
            isGroup,
            isSelfChat: !!isSelfChat,
          });
        }
      });

      conn.sock = sock;

      // Listen for ALL Baileys events for debugging
    } catch (err: any) {
      conn.reconnecting = false;
      console.error(`[wa:${config.agentId.slice(0,8)}] Socket creation failed: ${err.message}`);
      // Retry
      conn.reconnectAttempts++;
      var delay = Math.min(5000 * Math.pow(1.5, conn.reconnectAttempts - 1), 60000);
      setTimeout(() => createSocket(), delay);
    }
  };

  connections.set(config.agentId, conn);

  // Bind any pending message handlers registered before connection existed
  var handlers = pendingHandlers.get(config.agentId);
  if (handlers && handlers.size > 0) {
    console.log(`[wa:${config.agentId.slice(0,8)}] Binding ${handlers.size} pending handler(s)`);
    for (var h of handlers) conn.events.on('message', h);
  }

  await createSocket();
  return conn;
}

/**
 * Auto-start connections for all agents with saved auth state.
 * Called once on server startup by the messaging poller.
 */
export async function autoStartConnections(agents: { id: string; dataDir: string }[]): Promise<void> {
  for (var agent of agents) {
    try {
      var config = { agentId: agent.id, dataDir: agent.dataDir };
      if (await hasAuthState(config)) {
        console.log(`[wa:${agent.id.slice(0,8)}] Auth state found — auto-connecting`);
        await getOrCreateConnection(config);
      }
    } catch (err: any) {
      console.error(`[wa:${agent.id.slice(0,8)}] Auto-start failed: ${err.message}`);
    }
  }
}

async function proxySend(agentId: string, body: any): Promise<any> {
  var baseUrl = process.env.ENTERPRISE_URL || `http://localhost:${process.env.ENTERPRISE_PORT || process.env.PORT || '8080'}`;
  var payload = JSON.stringify(body);
  try {
    var resp = await fetch(`${baseUrl}/api/engine/bridge/agents/${agentId}/whatsapp/proxy-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    var result = await resp.json();
    return result;
  } catch (err: any) {
    return { error: `Proxy send failed: ${err.message}` };
  }
}

export function toJid(to: string): string {
  return to.includes('@') ? to : to.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}

export function createWhatsAppTools(config: WhatsAppConfig): ToolDefinition[] {
  return [
    {
      name: 'whatsapp_connect',
      description: 'Start WhatsApp connection. Returns QR code to scan.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async (_id: string) => {
        var conn = await getOrCreateConnection(config);
        if (conn.connected) return { status: 'connected', phone: conn.user?.id, name: conn.user?.name };
        if (conn.qr) return { status: 'awaiting_scan', qr: conn.qr };
        // QR arrives asynchronously — wait up to 10s for it
        for (var _i = 0; _i < 20; _i++) {
          await new Promise(r => setTimeout(r, 500));
          if (conn.connected) return { status: 'connected', phone: conn.user?.id, name: conn.user?.name };
          if (conn.qr) return { status: 'awaiting_scan', qr: conn.qr };
        }
        return { status: 'connecting', message: 'Connection started but QR not yet available. Poll /whatsapp/status.' };
      },
    },
    {
      name: 'whatsapp_status',
      description: 'Check connection status.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async (_id: string) => {
        var conn = connections.get(config.agentId);
        if (!conn) return { connected: false };
        return {
          connected: conn.connected, phone: conn.user?.id, name: conn.user?.name,
          hasQr: !!conn.qr, reconnecting: conn.reconnecting,
          reconnectAttempts: conn.reconnectAttempts,
          lastConnectedAt: conn.lastConnectedAt,
          lastMessageAt: conn.lastMessageAt,
        };
      },
    },
    {
      name: 'whatsapp_send',
      description: 'Send a text message.',
      input_schema: {
        type: 'object' as const,
        properties: { to: { type: 'string' }, text: { type: 'string' } },
        required: ['to', 'text'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (conn?.connected) {
          var jid = toJid(input.to);
          try { await conn?.sock?.sendPresenceUpdate('composing', jid); } catch {}
          var r = await conn.sock.sendMessage(jid, { text: input.text });
          try { await conn?.sock?.sendPresenceUpdate('paused', jid); } catch {}
          if (config.onOutbound) try { config.onOutbound(input.to, input.text); } catch {}
          return { ok: true, id: r?.key?.id };
        }
        // Proxy through enterprise server if no local connection
        return proxySend(config.agentId, { to: input.to, text: input.text });
      },
    },
    {
      name: 'whatsapp_send_media',
      description: 'Send image, video, or document from a local file path.',
      input_schema: {
        type: 'object' as const,
        properties: {
          to: { type: 'string' },
          filePath: { type: 'string' },
          caption: { type: 'string' },
          type: { type: 'string', description: 'image|video|document (auto-detected from extension if omitted)' },
        },
        required: ['to', 'filePath'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var buf = await readFile(input.filePath);
        var ext = input.filePath.split('.').pop()?.toLowerCase() || '';
        var type = input.type || (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) ? 'video' : ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt', 'csv'].includes(ext) ? 'document' : 'image');
        var msg: any = { caption: input.caption };
        if (type === 'video') { msg.video = buf; msg.mimetype = 'video/mp4'; }
        else if (type === 'document') { msg.document = buf; msg.fileName = input.filePath.split('/').pop(); }
        else { msg.image = buf; }
        var r = await conn.sock.sendMessage(toJid(input.to), msg);
        return { ok: true, type, id: r?.key?.id };
      },
    },
    {
      name: 'whatsapp_get_groups',
      description: 'List WhatsApp groups.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async (_id: string) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var groups = await conn.sock.groupFetchAllParticipating();
        return { groups: Object.values(groups).slice(0, 50).map((g: any) => ({ id: g.id, name: g.subject, size: g.participants?.length })) };
      },
    },
    {
      name: 'whatsapp_send_voice',
      description: 'Send a voice note from an audio file.',
      input_schema: {
        type: 'object' as const,
        properties: { to: { type: 'string' }, filePath: { type: 'string' } },
        required: ['to', 'filePath'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var buf = await readFile(input.filePath);
        var r = await conn.sock.sendMessage(toJid(input.to), { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true });
        return { ok: true, id: r?.key?.id };
      },
    },
    {
      name: 'whatsapp_send_location',
      description: 'Send a GPS location.',
      input_schema: {
        type: 'object' as const,
        properties: { to: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' }, name: { type: 'string' }, address: { type: 'string' } },
        required: ['to', 'lat', 'lng'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var r = await conn.sock.sendMessage(toJid(input.to), { location: { degreesLatitude: input.lat, degreesLongitude: input.lng, name: input.name, address: input.address } });
        return { ok: true, id: r?.key?.id };
      },
    },
    {
      name: 'whatsapp_send_contact',
      description: 'Send a contact card.',
      input_schema: {
        type: 'object' as const,
        properties: { to: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' } },
        required: ['to', 'name', 'phone'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${input.name}\nTEL;type=CELL:${input.phone}\nEND:VCARD`;
        var r = await conn.sock.sendMessage(toJid(input.to), { contacts: { displayName: input.name, contacts: [{ vcard }] } });
        return { ok: true, id: r?.key?.id };
      },
    },
    {
      name: 'whatsapp_react',
      description: 'React to a message with an emoji.',
      input_schema: {
        type: 'object' as const,
        properties: { chatId: { type: 'string' }, messageId: { type: 'string' }, emoji: { type: 'string' } },
        required: ['chatId', 'messageId', 'emoji'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        await conn.sock.sendMessage(toJid(input.chatId), { react: { text: input.emoji, key: { remoteJid: toJid(input.chatId), id: input.messageId } } });
        return { ok: true };
      },
    },
    {
      name: 'whatsapp_typing',
      description: 'Show typing indicator in a chat.',
      input_schema: {
        type: 'object' as const,
        properties: { chatId: { type: 'string' }, duration: { type: 'number', description: 'Seconds (default 3)' } },
        required: ['chatId'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        await conn?.sock?.sendPresenceUpdate('composing', toJid(input.chatId));
        setTimeout(async () => { try { await conn?.sock?.sendPresenceUpdate('paused', toJid(input.chatId)); } catch {} }, (input.duration || 3) * 1000);
        return { ok: true };
      },
    },
    {
      name: 'whatsapp_read_receipts',
      description: 'Mark messages as read in a chat.',
      input_schema: {
        type: 'object' as const,
        properties: { chatId: { type: 'string' }, messageIds: { type: 'array', items: { type: 'string' } } },
        required: ['chatId'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var jid = toJid(input.chatId);
        if (input.messageIds?.length) {
          await conn.sock.readMessages(input.messageIds.map((id: string) => ({ remoteJid: jid, id })));
        }
        return { ok: true };
      },
    },
    {
      name: 'whatsapp_profile',
      description: 'Get or set profile info (name, status, picture).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'get|set_name|set_status|set_picture' },
          value: { type: 'string' },
          of: { type: 'string' },
        },
        required: ['action'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        if (input.action === 'get') {
          var jid = input.of ? toJid(input.of) : conn.sock.user?.id;
          var status = await conn.sock.fetchStatus(jid).catch(() => null);
          var pic = await conn.sock.profilePictureUrl(jid, 'image').catch(() => null);
          return { status: status?.status, setAt: status?.setAt, pictureUrl: pic };
        }
        if (input.action === 'set_name') { await conn.sock.updateProfileName(input.value); return { ok: true }; }
        if (input.action === 'set_status') { await conn.sock.updateProfileStatus(input.value); return { ok: true }; }
        if (input.action === 'set_picture') { var buf = await readFile(input.value); await conn.sock.updateProfilePicture(conn.sock.user?.id, buf); return { ok: true }; }
        return { error: 'Unknown action' };
      },
    },
    {
      name: 'whatsapp_group_manage',
      description: 'Manage WhatsApp groups.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'create|add|remove|info|set_name|set_description|leave' },
          groupId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          members: { type: 'array', items: { type: 'string' } },
        },
        required: ['action'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        if (input.action === 'create') {
          var r = await conn.sock.groupCreate(input.name || 'New Group', (input.members || []).map(toJid));
          return { ok: true, groupId: r.id, name: r.subject };
        }
        if (input.action === 'info') {
          var meta = await conn.sock.groupMetadata(input.groupId);
          return { id: meta.id, name: meta.subject, description: meta.desc, size: meta.participants?.length, participants: meta.participants?.slice(0, 50).map((p: any) => ({ id: p.id, admin: p.admin })) };
        }
        if (input.action === 'add') { await conn.sock.groupParticipantsUpdate(input.groupId, (input.members || []).map(toJid), 'add'); return { ok: true }; }
        if (input.action === 'remove') { await conn.sock.groupParticipantsUpdate(input.groupId, (input.members || []).map(toJid), 'remove'); return { ok: true }; }
        if (input.action === 'set_name') { await conn.sock.groupUpdateSubject(input.groupId, input.name); return { ok: true }; }
        if (input.action === 'set_description') { await conn.sock.groupUpdateDescription(input.groupId, input.description); return { ok: true }; }
        if (input.action === 'leave') { await conn.sock.groupLeave(input.groupId); return { ok: true }; }
        return { error: 'Unknown action' };
      },
    },
    {
      name: 'whatsapp_delete_message',
      description: 'Delete a sent message.',
      input_schema: {
        type: 'object' as const,
        properties: { chatId: { type: 'string' }, messageId: { type: 'string' } },
        required: ['chatId', 'messageId'],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        await conn.sock.sendMessage(toJid(input.chatId), { delete: { remoteJid: toJid(input.chatId), id: input.messageId, fromMe: true } });
        return { ok: true };
      },
    },
    {
      name: 'whatsapp_disconnect',
      description: 'Disconnect. Set logout=true to unlink device.',
      input_schema: {
        type: 'object' as const,
        properties: { logout: { type: 'boolean' } },
        required: [],
      },
      execute: async (_id: string, input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.sock) return { ok: true };
        if (input?.logout) await conn.sock.logout();
        else conn.sock.end(undefined);
        connections.delete(config.agentId);
        return { ok: true, loggedOut: !!input?.logout };
      },
    },
  ];
}

/** Get QR for dashboard rendering */
export function getConnection(agentId: string, mode?: string): WhatsAppConnection | undefined {
  var key = mode === 'business' ? 'biz-' + agentId : agentId;
  return connections.get(key);
}

export function getWhatsAppQR(agentId: string): string | null {
  return connections.get(agentId)?.qr || null;
}

/** Connection status check */
export function isWhatsAppConnected(agentId: string): boolean {
  return connections.get(agentId)?.connected || false;
}

/** Subscribe to incoming messages for agent dispatch (supports late-binding) */
export function onWhatsAppMessage(agentId: string, handler: (msg: any) => void): () => void {
  // Register on existing connection if available
  var conn = connections.get(agentId);
  if (conn) {
    conn.events.on('message', handler);
  }
  // Also store as pending so new/reconnected connections pick it up
  if (!pendingHandlers.has(agentId)) pendingHandlers.set(agentId, new Set());
  pendingHandlers.get(agentId)!.add(handler);
  return () => {
    var c = connections.get(agentId);
    if (c) c.events.off('message', handler);
    pendingHandlers.get(agentId)?.delete(handler);
  };
}

/** Send a test message to verify the connection works */
export async function sendTestMessage(agentId: string, to: string): Promise<{ ok: boolean; error?: string }> {
  var conn = connections.get(agentId);
  if (!conn?.connected) return { ok: false, error: 'Not connected' };
  try {
    await conn.sock.sendMessage(toJid(to), { text: '✅ Test message from AgenticMail — WhatsApp connection is working!' });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** Get all active WhatsApp agent IDs */
export function getActiveWhatsAppAgents(): string[] {
  return Array.from(connections.entries()).filter(([_, c]) => c.connected).map(([id]) => id);
}

/** Get full connection status for dashboard */
export function getConnectionStatus(agentId: string): any {
  var conn = connections.get(agentId);
  if (!conn) return { connected: false, hasAuth: false };
  return {
    connected: conn.connected,
    phone: conn.user?.id,
    name: conn.user?.name,
    hasQr: !!conn.qr,
    qr: conn.qr,
    reconnecting: conn.reconnecting,
    reconnectAttempts: conn.reconnectAttempts,
    lastConnectedAt: conn.lastConnectedAt,
    lastMessageAt: conn.lastMessageAt,
  };
}
