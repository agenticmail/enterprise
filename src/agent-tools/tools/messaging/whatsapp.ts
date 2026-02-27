/**
 * WhatsApp Tools — QR code link via Baileys (WhatsApp Web multi-device).
 * 
 * Scan QR → agent links as device → sends/receives as that phone number.
 * Auth state persists to disk. Supports text, images, video, documents.
 * Incoming messages dispatched to agent via event emitter (no polling needed).
 */

import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
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
}

interface WhatsAppConfig {
  agentId: string;
  dataDir: string;
}

export async function getOrCreateConnection(config: WhatsAppConfig): Promise<WhatsAppConnection> {
  var existing = connections.get(config.agentId);
  if (existing?.connected) return existing;

  var baileys = await import('@whiskeysockets/baileys');
  var makeWASocket = baileys.default;
  var { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

  var authDir = join(config.dataDir, 'auth');
  await mkdir(authDir, { recursive: true });

  var { state, saveCreds } = await useMultiFileAuthState(authDir);
  var { version } = await fetchLatestBaileysVersion();

  var conn: WhatsAppConnection = { sock: null as any, qr: null, connected: false, saveCreds, events: new EventEmitter() };

  var sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['AgenticMail', 'Desktop', '1.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update: any) => {
    if (update.qr) { conn.qr = update.qr; conn.connected = false; }
    if (update.connection === 'open') {
      conn.connected = true; conn.qr = null;
      conn.user = { id: sock.user?.id?.split(':')[0] || '', name: sock.user?.name || '' };
      console.log(`[wa:${config.agentId}] Connected as ${conn.user.id}`);
    }
    if (update.connection === 'close') {
      conn.connected = false;
      var code = update.lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => getOrCreateConnection(config), 3000);
      } else {
        connections.delete(config.agentId);
      }
    }
  });

  // Incoming message event → emit for poller/dispatcher
  sock.ev.on('messages.upsert', (m: any) => {
    if (m.type !== 'notify') return;
    for (var msg of m.messages) {
      if (msg.key.fromMe) continue;
      conn.events.emit('message', {
        from: msg.key.remoteJid,
        pushName: msg.pushName,
        text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
        timestamp: msg.messageTimestamp,
        hasMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage || msg.message?.audioMessage),
        messageId: msg.key.id,
        isGroup: msg.key.remoteJid?.endsWith('@g.us'),
      });
    }
  });

  conn.sock = sock;
  connections.set(config.agentId, conn);
  return conn;
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
      execute: async () => {
        var conn = await getOrCreateConnection(config);
        if (conn.connected) return { status: 'connected', phone: conn.user?.id, name: conn.user?.name };
        if (conn.qr) return { status: 'awaiting_scan', qr: conn.qr };
        return { status: 'connecting' };
      },
    },
    {
      name: 'whatsapp_status',
      description: 'Check connection status.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async () => {
        var conn = connections.get(config.agentId);
        if (!conn) return { connected: false };
        return { connected: conn.connected, phone: conn.user?.id, name: conn.user?.name, hasQr: !!conn.qr };
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
      execute: async (input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected. Call whatsapp_connect.' };
        var r = await conn.sock.sendMessage(toJid(input.to), { text: input.text });
        return { ok: true, id: r?.key?.id };
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
      execute: async (input: any) => {
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
      execute: async () => {
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
      execute: async (input: any) => {
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
      execute: async (input: any) => {
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
      execute: async (input: any) => {
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
      execute: async (input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        var r = await conn.sock.sendMessage(toJid(input.chatId), { react: { text: input.emoji, key: { remoteJid: toJid(input.chatId), id: input.messageId } } });
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
      execute: async (input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        await conn.sock.sendPresenceUpdate('composing', toJid(input.chatId));
        setTimeout(async () => { try { await conn.sock.sendPresenceUpdate('paused', toJid(input.chatId)); } catch {} }, (input.duration || 3) * 1000);
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
      execute: async (input: any) => {
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
          value: { type: 'string', description: 'New name/status text, or file path for picture' },
          of: { type: 'string', description: 'Phone/JID to get profile of (default: self)' },
        },
        required: ['action'],
      },
      execute: async (input: any) => {
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
      description: 'Manage WhatsApp groups (create, add/remove members, update info).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'create|add|remove|info|set_name|set_description|leave' },
          groupId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          members: { type: 'array', items: { type: 'string' }, description: 'Phone numbers' },
        },
        required: ['action'],
      },
      execute: async (input: any) => {
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
      description: 'Delete a sent message (for everyone).',
      input_schema: {
        type: 'object' as const,
        properties: { chatId: { type: 'string' }, messageId: { type: 'string' } },
        required: ['chatId', 'messageId'],
      },
      execute: async (input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        await conn.sock.sendMessage(toJid(input.chatId), { delete: { remoteJid: toJid(input.chatId), id: input.messageId, fromMe: true } });
        return { ok: true };
      },
    },
    {
      name: 'whatsapp_forward',
      description: 'Forward a message to another chat.',
      input_schema: {
        type: 'object' as const,
        properties: { from: { type: 'string' }, to: { type: 'string' }, messageId: { type: 'string' } },
        required: ['from', 'to', 'messageId'],
      },
      execute: async (input: any) => {
        var conn = connections.get(config.agentId);
        if (!conn?.connected) return { error: 'Not connected.' };
        // Baileys forward via relayMessage or quote — simplified version sends as new
        return { error: 'Forward requires message content. Use whatsapp_send to re-send the text.' };
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
      execute: async (input: any) => {
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
export function getWhatsAppQR(agentId: string): string | null {
  return connections.get(agentId)?.qr || null;
}

/** Connection status check */
export function isWhatsAppConnected(agentId: string): boolean {
  return connections.get(agentId)?.connected || false;
}

/** Subscribe to incoming messages for agent dispatch */
export function onWhatsAppMessage(agentId: string, handler: (msg: any) => void): () => void {
  var conn = connections.get(agentId);
  if (!conn) return () => {};
  conn.events.on('message', handler);
  return () => conn.events.off('message', handler);
}

/** Get all active WhatsApp agent IDs */
export function getActiveWhatsAppAgents(): string[] {
  return Array.from(connections.entries()).filter(([_, c]) => c.connected).map(([id]) => id);
}
