/**
 * Google Chat API Tools
 *
 * Lets agents communicate via Google Chat — create DMs with users, send/read
 * messages in spaces, manage memberships.
 *
 * Uses Google Chat API v1 with user authentication (OAuth).
 * Endpoint: POST /v1/spaces:setup (creates spaces + adds members in one call)
 *
 * PREREQUISITE: Google Chat API must be enabled in Google Cloud Console AND
 * a Chat app must be configured (APIs & Services > Google Chat API > Configuration).
 * Without this, all calls return 401/404.
 *
 * Required OAuth scopes:
 *   - https://www.googleapis.com/auth/chat.spaces
 *   - https://www.googleapis.com/auth/chat.spaces.create
 *   - https://www.googleapis.com/auth/chat.messages
 *   - https://www.googleapis.com/auth/chat.messages.create
 *   - https://www.googleapis.com/auth/chat.memberships
 *
 * Docs: https://developers.google.com/workspace/chat/api/reference/rest/v1
 */

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
      description: `Create a Google Chat space or DM and add members in one step.
Use this to:
- Create a named space: set spaceType="SPACE" and displayName
- Create a group chat: set spaceType="GROUP_CHAT" with 2+ member emails
- Create/find a DM with a user: set spaceType="DIRECT_MESSAGE" with exactly 1 member email
If a DM already exists with that user, returns the existing one.
The calling user is automatically added — do NOT include them in members.`,
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceType: {
            type: 'string',
            description: 'SPACE (named room), GROUP_CHAT (unnamed group), or DIRECT_MESSAGE (1:1 DM)',
          },
          displayName: {
            type: 'string',
            description: 'Space display name (required for SPACE, ignored for GROUP_CHAT and DIRECT_MESSAGE)',
          },
          description: {
            type: 'string',
            description: 'Space description (only for SPACE type)',
          },
          members: {
            type: 'string',
            description: 'Comma-separated email addresses of users to add (e.g. "user@example.com,other@example.com")',
          },
          externalUserAllowed: {
            type: 'string',
            description: '"true" to allow users outside the organization',
          },
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
      description: 'Find an existing DM space with a specific user by their email. Returns the space if it exists, or an error if no DM exists yet (use google_chat_setup_space to create one).',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          email: { type: 'string', description: 'Email address of the other user' },
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
      description: 'List Google Chat spaces (rooms, DMs, group chats) the user has access to.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          pageSize: { type: 'string', description: 'Max results (default: 20, max: 1000)' },
          filter: { type: 'string', description: 'Filter, e.g. "spaceType = SPACE" for named rooms, "spaceType = DIRECT_MESSAGE" for DMs' },
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
      description: 'Get details about a specific Google Chat space by its resource name (e.g. "spaces/AAAA...").',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'Space resource name (e.g. "spaces/AAAAxyz...")' },
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
      description: 'List recent messages in a Google Chat space. Returns sender, text, and timestamps.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'Space resource name (e.g. "spaces/AAAAxyz...")' },
          pageSize: { type: 'string', description: 'Max messages (default: 25, max: 1000)' },
          orderBy: { type: 'string', description: '"createTime asc" or "createTime desc" (default: desc)' },
          filter: { type: 'string', description: 'Filter, e.g. \'createTime > "2024-01-01T00:00:00Z"\'' },
          showDeleted: { type: 'string', description: '"true" to include deleted messages' },
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
      description: 'Send a message to a Google Chat space or DM. Supports plain text and threading.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'Space resource name (e.g. "spaces/AAAAxyz...")' },
          text: { type: 'string', description: 'Message text (supports Chat formatting: *bold*, _italic_, ~strikethrough~, `code`)' },
          threadKey: { type: 'string', description: 'Thread key to reply in a specific thread' },
          threadName: { type: 'string', description: 'Thread resource name to reply to an existing thread' },
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
      description: 'Edit an existing message in Google Chat.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageName: { type: 'string', description: 'Message resource name (e.g. "spaces/AAAA.../messages/BBBB...")' },
          text: { type: 'string', description: 'New message text' },
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
      description: 'Delete a message in Google Chat.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageName: { type: 'string', description: 'Message resource name to delete' },
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
      description: 'List members of a Google Chat space.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'Space resource name' },
          pageSize: { type: 'string', description: 'Max results (default: 100)' },
          filter: { type: 'string', description: 'Filter, e.g. \'role = "ROLE_MANAGER"\'' },
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
      description: 'Add a user to an existing Google Chat space by email. For creating a new space with members, use google_chat_setup_space instead.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          spaceName: { type: 'string', description: 'Space resource name' },
          email: { type: 'string', description: 'Email address of user to add' },
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

    // ─── React to Message ───────────────────────────────
    {
      name: 'google_chat_react',
      description: 'Add an emoji reaction to a message.',
      category: 'communication' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageName: { type: 'string', description: 'Message resource name' },
          emoji: { type: 'string', description: 'Unicode emoji (e.g. "👍", "❤️", "✅")' },
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
