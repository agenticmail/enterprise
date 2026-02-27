/**
 * Google Chat API Tools
 *
 * SCHEMA OPTIMIZATION RULES (apply to ALL tool files):
 *   1. Tool descriptions: ONE short sentence. No examples, no lists, no multi-line.
 *      BAD:  "Search for places using Google Maps. Find restaurants, businesses, landmarks..."
 *      GOOD: "Search for places by text query."
 *   2. Param descriptions: OMIT if name is self-explanatory (e.g. "email", "subject", "body").
 *      Only add description for non-obvious params or format hints.
 *      BAD:  messageId: { description: 'Message ID (required)' }
 *      GOOD: messageId: { type: 'string' }
 *   3. Remove "(required)" from descriptions — the `required` array handles that.
 *   4. Use short enum syntax: 'list|create|delete' not '"list" (default), "create", or "delete"'
 *   5. Every token in a description costs money on EVERY LLM call. Be ruthless.
 *
 * Uses Google Chat API v1 with user authentication (OAuth).
 * Docs: https://developers.google.com/workspace/chat/api/reference/rest/v1
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import type { GoogleToolsConfig } from './index.js';
import { jsonResult, errorResult } from '../../common.js';

// ─── Helper ─────────────────────────────────────────────

const CHAT_BASE = 'https://chat.googleapis.com/v1';

async function chatApi(
  token: string,
  path: string,
  opts?: { method?: string; body?: any; query?: Record<string, string> },
): Promise<any> {
  const url = new URL(`${CHAT_BASE}${path}`);
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat API ${res.status}: ${errText}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ─── Tool Definitions ───────────────────────────────────

export function createGoogleChatTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    // ─── Setup Space (the correct way to create spaces/DMs) ────
    {
      name: 'google_chat_setup_space',
      description: 'Create a Chat space/DM and add members. For DMs, returns existing if found. Caller auto-added.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceType: { type: 'string', description: 'SPACE | GROUP_CHAT | DIRECT_MESSAGE' },
          displayName: { type: 'string', description: 'Name (SPACE only)' },
          description: { type: 'string', description: 'Description (SPACE only)' },
          members: { type: 'string', description: 'Comma-separated emails to add' },
          externalUserAllowed: { type: 'string', description: '"true" for external users' },
        },
        required: ['spaceType'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();

          // Build space object
          const space: any = {
            spaceType: input.spaceType,
          };
          if (input.displayName && input.spaceType === 'SPACE') {
            space.displayName = input.displayName;
          }
          if (input.description && input.spaceType === 'SPACE') {
            space.spaceDetails = { description: input.description };
          }
          if (input.externalUserAllowed === 'true') {
            space.externalUserAllowed = true;
          }

          // Build memberships from email list
          const memberships: any[] = [];
          if (input.members) {
            const emails = input.members.split(',').map((e: string) => e.trim()).filter(Boolean);
            for (const email of emails) {
              memberships.push({
                member: {
                  name: `users/${email}`,
                  type: 'HUMAN',
                },
              });
            }
          }

          // Call spaces:setup (NOT POST /spaces)
          const result = await chatApi(token, '/spaces:setup', {
            method: 'POST',
            body: {
              space,
              memberships,
              requestId: crypto.randomUUID(),
            },
          });

          // Build a usable link
          // Google Chat space URLs: https://chat.google.com/room/<spaceId> or https://mail.google.com/chat/u/0/#chat/space/<spaceId>
          const spaceId = result.name?.replace('spaces/', '') || '';
          const chatUrl = spaceId ? `https://mail.google.com/chat/u/0/#chat/space/${spaceId}` : '';
          const directUrl = spaceId ? `https://chat.google.com/room/${spaceId}` : '';

          return jsonResult({
            spaceName: result.name,
            displayName: result.displayName,
            spaceType: result.spaceType,
            chatUrl,
            directUrl,
            singleUserBotDm: result.singleUserBotDm,
            threaded: result.threaded,
          });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Find Direct Message ────────────────────────────
    {
      name: 'google_chat_find_dm',
      description: 'Find existing DM with a user by email. Use setup_space to create if not found.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          email: { type: 'string' },
        },
        required: ['email'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          // Use spaces:findDirectMessage API
          const result = await chatApi(token, '/spaces:findDirectMessage', {
            query: { name: `users/${input.email}` },
          });
          const spaceId = result.name?.replace('spaces/', '') || '';
          return jsonResult({
            spaceName: result.name,
            displayName: result.displayName,
            spaceType: result.spaceType,
            chatUrl: spaceId ? `https://mail.google.com/chat/u/0/#chat/space/${spaceId}` : '',
          });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── List Spaces ────────────────────────────────────
    {
      name: 'google_chat_list_spaces',
      description: 'List Chat spaces/DMs the user has access to.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          pageSize: { type: 'string', description: 'Max results (default 20)' },
          filter: { type: 'string', description: 'e.g. "spaceType = SPACE" or "spaceType = DIRECT_MESSAGE"' },
        },
        required: [],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {};
          if (input.pageSize) query.pageSize = input.pageSize;
          if (input.filter) query.filter = input.filter;
          const result = await chatApi(token, '/spaces', { query });
          const spaces = (result.spaces || []).map((s: any) => {
            const spaceId = s.name?.replace('spaces/', '') || '';
            return {
              name: s.name,
              displayName: s.displayName,
              type: s.spaceType || s.type,
              threaded: s.threaded,
              singleUserBotDm: s.singleUserBotDm,
              chatUrl: spaceId ? `https://mail.google.com/chat/u/0/#chat/space/${spaceId}` : '',
            };
          });
          return jsonResult({ spaces, count: spaces.length });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Get Space Details ──────────────────────────────
    {
      name: 'google_chat_get_space',
      description: 'Get details of a Chat space.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'e.g. "spaces/AAAAxyz..."' },
        },
        required: ['spaceName'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await chatApi(token, `/${input.spaceName}`);
          return jsonResult(result);
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── List Messages in Space ─────────────────────────
    {
      name: 'google_chat_list_messages',
      description: 'List recent messages in a Chat space.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'e.g. "spaces/AAAAxyz..."' },
          pageSize: { type: 'string', description: 'Max (default 25)' },
          orderBy: { type: 'string', description: '"createTime asc" or "createTime desc"' },
          filter: { type: 'string' },
          showDeleted: { type: 'string', description: '"true" to include deleted' },
        },
        required: ['spaceName'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {};
          if (input.pageSize) query.pageSize = input.pageSize;
          if (input.orderBy) query.orderBy = input.orderBy;
          if (input.filter) query.filter = input.filter;
          if (input.showDeleted === 'true') query.showDeleted = 'true';
          const result = await chatApi(token, `/${input.spaceName}/messages`, { query });
          const messages = (result.messages || []).map((m: any) => ({
            name: m.name,
            sender: m.sender?.displayName || m.sender?.name || 'unknown',
            senderType: m.sender?.type,
            text: m.text || m.formattedText || '',
            createTime: m.createTime,
            threadName: m.thread?.name,
            attachments: (m.attachment || []).length,
          }));
          return jsonResult({ messages, count: messages.length });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Send Message ───────────────────────────────────
    {
      name: 'google_chat_send_message',
      description: 'Send a message to a Chat space/DM. Formatting: *bold* _italic_ ~strike~ `code`.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string' },
          text: { type: 'string' },
          threadKey: { type: 'string', description: 'Reply in thread' },
          threadName: { type: 'string', description: 'Reply to existing thread' },
        },
        required: ['spaceName', 'text'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = { text: input.text };
          if (input.threadName || input.threadKey) {
            body.thread = {};
            if (input.threadName) body.thread.name = input.threadName;
            if (input.threadKey) body.thread.threadKey = input.threadKey;
          }
          const query: Record<string, string> = {};
          if (input.threadKey) query.messageReplyOption = 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
          const result = await chatApi(token, `/${input.spaceName}/messages`, {
            method: 'POST',
            body,
            query,
          });
          return jsonResult({
            sent: true,
            messageName: result.name,
            createTime: result.createTime,
            threadName: result.thread?.name,
          });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Update Message ─────────────────────────────────
    {
      name: 'google_chat_update_message',
      description: 'Edit a Chat message.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageName: { type: 'string' },
          text: { type: 'string', description: 'New text' },
        },
        required: ['messageName', 'text'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await chatApi(token, `/${input.messageName}`, {
            method: 'PATCH',
            body: { text: input.text },
            query: { updateMask: 'text' },
          });
          return jsonResult({ updated: true, messageName: result.name });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Delete Message ─────────────────────────────────
    {
      name: 'google_chat_delete_message',
      description: 'Delete a Chat message.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageName: { type: 'string' },
        },
        required: ['messageName'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          await chatApi(token, `/${input.messageName}`, { method: 'DELETE' });
          return jsonResult({ deleted: true });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── List Members ───────────────────────────────────
    {
      name: 'google_chat_list_members',
      description: 'List members of a Chat space.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string' },
          pageSize: { type: 'string' },
          filter: { type: 'string' },
        },
        required: ['spaceName'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {};
          if (input.pageSize) query.pageSize = input.pageSize;
          if (input.filter) query.filter = input.filter;
          const result = await chatApi(token, `/${input.spaceName}/members`, { query });
          const members = (result.memberships || []).map((m: any) => ({
            name: m.name,
            role: m.role,
            memberType: m.member?.type,
            displayName: m.member?.displayName,
            email: m.member?.domainId || '',
            state: m.state,
          }));
          return jsonResult({ members, count: members.length });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Add Member to Space ────────────────────────────
    {
      name: 'google_chat_add_member',
      description: 'Add a user to a Chat space by email.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['spaceName', 'email'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const body = {
            member: {
              name: `users/${input.email}`,
              type: 'HUMAN',
            },
          };
          const result = await chatApi(token, `/${input.spaceName}/members`, {
            method: 'POST',
            body,
          });
          return jsonResult({ added: true, membershipName: result.name });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Upload & Send Attachment ─────────────────────────
    {
      name: 'google_chat_upload_attachment',
      description: 'Upload a local file to a Chat space as a message attachment. Up to 200MB. Supports images, docs, PDFs, archives.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string' },
          filePath: { type: 'string', description: 'Local file path' },
          text: { type: 'string', description: 'Optional message text' },
          threadKey: { type: 'string' },
          threadName: { type: 'string' },
        },
        required: ['spaceName', 'filePath'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const filePath = input.filePath;

          // Read the file
          let fileBuffer: Buffer;
          try {
            fileBuffer = await fs.readFile(filePath);
          } catch (e: any) {
            return errorResult(`Cannot read file: ${filePath} — ${e.message}`);
          }

          const filename = path.basename(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

          // Step 1: Upload the file to the space using Google's multipart upload protocol
          // Ref: https://developers.google.com/workspace/chat/api/reference/rest/v1/media/upload
          const boundary = 'ChatUpload' + Date.now();
          const metadataJson = JSON.stringify({ filename });

          // Build RFC 2046 multipart/related body using Buffer.concat for reliable binary handling
          const CRLF = '\r\n';
          const preamble = `--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadataJson}${CRLF}--${boundary}${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
          const epilogue = `${CRLF}--${boundary}--`;

          const body = Buffer.concat([
            Buffer.from(preamble, 'utf-8'),
            fileBuffer,
            Buffer.from(epilogue, 'utf-8'),
          ]);

          const uploadUrl = `https://chat.googleapis.com/upload/v1/${input.spaceName}/attachments:upload?uploadType=multipart`;
          const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
              'Content-Length': String(body.length),
            },
            body,
          });

          if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            console.log(`[google-chat] Upload failed (${uploadRes.status}): boundary=${boundary}, bodyLen=${body.length}, file=${filename} (${mimeType}, ${fileBuffer.length}b), url=${uploadUrl}`);
            console.log(`[google-chat] Upload error body: ${errText.substring(0, 500)}`);
            return errorResult(`Upload failed (${uploadRes.status}): ${errText}`);
          }

          const uploadResult = await uploadRes.json();
          console.log(`[google-chat] Upload success:`, JSON.stringify(uploadResult));
          const attachmentDataRef = uploadResult.attachmentDataRef;

          if (!attachmentDataRef) {
            return errorResult('Upload succeeded but no attachmentDataRef returned');
          }

          // Step 2: Send message with the uploaded attachment
          // Pass the full upload result as the attachment (matches Python SDK pattern)
          const msgBody: any = {
            text: input.text || '',
            attachment: [uploadResult],
          };

          if (input.threadName || input.threadKey) {
            msgBody.thread = {};
            if (input.threadName) msgBody.thread.name = input.threadName;
            if (input.threadKey) msgBody.thread.threadKey = input.threadKey;
          }

          const query: Record<string, string> = {};
          if (input.threadKey) query.messageReplyOption = 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';

          const msgResult = await chatApi(token, `/${input.spaceName}/messages`, {
            method: 'POST',
            body: msgBody,
            query,
          });

          return jsonResult({
            sent: true,
            messageName: msgResult.name,
            filename,
            mimeType,
            fileSize: fileBuffer.length,
            createTime: msgResult.createTime,
            threadName: msgResult.thread?.name,
          });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Send Image from URL ────────────────────────────
    {
      name: 'google_chat_send_image',
      description: 'Send an inline image from URL to a Chat space (embedded card, no upload needed).',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string' },
          imageUrl: { type: 'string', description: 'Public image URL' },
          text: { type: 'string' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          linkUrl: { type: 'string', description: 'Click-through URL' },
          threadKey: { type: 'string' },
          threadName: { type: 'string' },
        },
        required: ['spaceName', 'imageUrl'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();

          const body: any = {};
          if (input.text) body.text = input.text;

          // Build Card v2 with image
          const imageWidget: any = {
            image: {
              imageUrl: input.imageUrl,
              altText: input.title || 'Image',
            },
          };
          if (input.linkUrl) {
            imageWidget.image.onClick = {
              openLink: { url: input.linkUrl },
            };
          }

          const card: any = {
            sections: [{ widgets: [imageWidget] }],
          };

          if (input.title || input.subtitle) {
            card.header = {};
            if (input.title) card.header.title = input.title;
            if (input.subtitle) card.header.subtitle = input.subtitle;
          }

          body.cardsV2 = [{ cardId: 'img_' + Date.now(), card }];

          if (input.threadName || input.threadKey) {
            body.thread = {};
            if (input.threadName) body.thread.name = input.threadName;
            if (input.threadKey) body.thread.threadKey = input.threadKey;
          }

          const query: Record<string, string> = {};
          if (input.threadKey) query.messageReplyOption = 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';

          const result = await chatApi(token, `/${input.spaceName}/messages`, {
            method: 'POST',
            body,
            query,
          });

          return jsonResult({
            sent: true,
            messageName: result.name,
            imageUrl: input.imageUrl,
            createTime: result.createTime,
            threadName: result.thread?.name,
          });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── Download Attachment ─────────────────────────────
    {
      name: 'google_chat_download_attachment',
      description: 'Download a Chat message attachment to local file.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          attachmentName: { type: 'string', description: 'e.g. "spaces/.../messages/.../attachments/..."' },
          savePath: { type: 'string', description: 'Local save path' },
        },
        required: ['attachmentName', 'savePath'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();

          // Get attachment metadata to find the download URI
          const attachment = await chatApi(token, `/${input.attachmentName}`);
          const downloadUri = attachment.attachmentDataRef?.resourceName;

          if (!downloadUri) {
            return errorResult('Attachment has no downloadable data reference');
          }

          // Download the media content
          const mediaUrl = `${CHAT_BASE}/media/${downloadUri}?alt=media`;
          const res = await fetch(mediaUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            return errorResult(`Download failed (${res.status}): ${await res.text()}`);
          }

          const buffer = Buffer.from(await res.arrayBuffer());
          const dir = path.dirname(input.savePath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(input.savePath, buffer);

          return jsonResult({
            downloaded: true,
            savePath: input.savePath,
            size: buffer.length,
            contentType: attachment.contentType || res.headers.get('content-type'),
            filename: attachment.contentName || path.basename(input.savePath),
          });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },

    // ─── React to Message ───────────────────────────────
    {
      name: 'google_chat_react',
      description: 'React to a Chat message with emoji.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageName: { type: 'string' },
          emoji: { type: 'string', description: 'Unicode emoji' },
        },
        required: ['messageName', 'emoji'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await chatApi(token, `/${input.messageName}/reactions`, {
            method: 'POST',
            body: { emoji: { unicode: input.emoji } },
          });
          return jsonResult({ reacted: true, reactionName: result.name });
        } catch (e: any) {
          return errorResult(e.message);
        }
      },
    },
  ];
}

// ─── MIME Type Map ──────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv', '.txt': 'text/plain', '.json': 'application/json',
  '.xml': 'application/xml', '.html': 'text/html', '.htm': 'text/html',
  '.zip': 'application/zip', '.gz': 'application/gzip', '.tar': 'application/x-tar',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
