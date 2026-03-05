/**
 * Microsoft Teams Tools
 *
 * Comprehensive team/channel messaging, chat, presence, and collaboration
 * via Microsoft Graph API. 15 tools covering teams, channels, chats, messages,
 * replies, reactions, members, file sharing, and presence.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

function mapMessage(m: any): any {
  return {
    id: m.id,
    from: m.from?.user?.displayName || m.from?.application?.displayName,
    fromEmail: m.from?.user?.email,
    fromUserId: m.from?.user?.id,
    body: m.body?.content,
    bodyType: m.body?.contentType,
    date: m.createdDateTime,
    lastModified: m.lastModifiedDateTime,
    importance: m.importance,
    subject: m.subject,
    attachments: m.attachments?.map((a: any) => ({
      id: a.id, name: a.name, contentType: a.contentType, contentUrl: a.contentUrl,
    })),
    mentions: m.mentions?.map((mt: any) => ({ id: mt.id, text: mt.mentionText, userId: mt.mentioned?.user?.id })),
    reactions: m.reactions?.map((r: any) => ({ type: r.reactionType, user: r.user?.user?.displayName })),
    replyCount: m.replies?.length,
  };
}

export function createTeamsTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'teams_list_teams',
      description: 'List all Teams the agent is a member of, with descriptions and visibility.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/joinedTeams', {
            query: { '$select': 'id,displayName,description,visibility,isArchived' }
          });
          const teams = (data.value || []).map((t: any) => ({
            id: t.id, name: t.displayName, description: t.description,
            visibility: t.visibility, isArchived: t.isArchived,
          }));
          return jsonResult({ teams, count: teams.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_list_channels',
      description: 'List channels in a Team with membership type and description.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          includePrivate: { type: 'boolean', description: 'Include private/shared channels (default: true)' },
        },
        required: ['teamId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/teams/${params.teamId}/channels`, {
            query: { '$select': 'id,displayName,description,membershipType,webUrl,createdDateTime' }
          });
          const channels = (data.value || []).map((c: any) => ({
            id: c.id, name: c.displayName, description: c.description,
            membershipType: c.membershipType, webUrl: c.webUrl, created: c.createdDateTime,
          }));
          return jsonResult({ channels, count: channels.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_create_channel',
      description: 'Create a new channel in a Team.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          name: { type: 'string', description: 'Channel display name' },
          description: { type: 'string', description: 'Channel description' },
          membershipType: { type: 'string', description: 'standard or private (default: standard)' },
        },
        required: ['teamId', 'name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const channel = await graph(token, `/teams/${params.teamId}/channels`, {
            method: 'POST',
            body: {
              displayName: params.name,
              description: params.description || '',
              membershipType: params.membershipType || 'standard',
            },
          });
          return jsonResult({ id: channel.id, name: channel.displayName, created: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_send_channel_message',
      description: 'Send a message to a Teams channel. Supports HTML, @mentions, and importance.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          message: { type: 'string', description: 'Message content (supports HTML)' },
          isHtml: { type: 'boolean', description: 'Whether message is HTML (default: false)' },
          importance: { type: 'string', description: 'normal, high, or urgent' },
          subject: { type: 'string', description: 'Message subject (creates a thread header)' },
        },
        required: ['teamId', 'channelId', 'message'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {
            body: { contentType: params.isHtml ? 'html' : 'text', content: params.message },
          };
          if (params.importance) body.importance = params.importance;
          if (params.subject) body.subject = params.subject;
          const msg = await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/messages`, {
            method: 'POST', body,
          });
          return jsonResult({ id: msg.id, sent: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_reply_to_message',
      description: 'Reply to a specific message in a Teams channel (threaded conversation).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          messageId: { type: 'string', description: 'Parent message ID to reply to' },
          message: { type: 'string', description: 'Reply content' },
          isHtml: { type: 'boolean', description: 'Whether reply is HTML' },
        },
        required: ['teamId', 'channelId', 'messageId', 'message'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const reply = await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/messages/${params.messageId}/replies`, {
            method: 'POST',
            body: { body: { contentType: params.isHtml ? 'html' : 'text', content: params.message } },
          });
          return jsonResult({ id: reply.id, sent: true, parentId: params.messageId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_read_channel_messages',
      description: 'Read recent messages from a Teams channel, including replies and reactions.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          maxResults: { type: 'number', description: 'Max messages (default: 20)' },
          includeReplies: { type: 'boolean', description: 'Include thread replies (default: false — heavier API call)' },
        },
        required: ['teamId', 'channelId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {
            '$top': String(params.maxResults || 20),
          };
          if (params.includeReplies) query['$expand'] = 'replies';
          const data = await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/messages`, { query });
          const messages = (data.value || []).map((m: any) => {
            const msg = mapMessage(m);
            if (params.includeReplies && m.replies?.length) {
              msg.replies = m.replies.map((r: any) => mapMessage(r));
            }
            return msg;
          });
          return jsonResult({ messages, count: messages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_list_chats',
      description: 'List the agent\'s 1:1 and group chats in Teams.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          maxResults: { type: 'number', description: 'Max chats to return (default: 20)' },
          filter: { type: 'string', description: 'Filter: "oneOnOne", "group", or "meeting" (default: all)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {
            '$top': String(params.maxResults || 20),
            '$select': 'id,topic,chatType,createdDateTime,lastUpdatedDateTime',
            '$orderby': 'lastUpdatedDateTime desc',
          };
          if (params.filter) query['$filter'] = `chatType eq '${params.filter}'`;
          const data = await graph(token, '/me/chats', { query });
          const chats = (data.value || []).map((c: any) => ({
            id: c.id, topic: c.topic, type: c.chatType,
            created: c.createdDateTime, lastUpdated: c.lastUpdatedDateTime,
          }));
          return jsonResult({ chats, count: chats.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_send_chat_message',
      description: 'Send a message in a Teams 1:1 or group chat.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          chatId: { type: 'string', description: 'Chat ID' },
          message: { type: 'string', description: 'Message content' },
          isHtml: { type: 'boolean', description: 'Whether message is HTML (default: false)' },
        },
        required: ['chatId', 'message'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const msg = await graph(token, `/chats/${params.chatId}/messages`, {
            method: 'POST',
            body: { body: { contentType: params.isHtml ? 'html' : 'text', content: params.message } },
          });
          return jsonResult({ id: msg.id, sent: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_read_chat_messages',
      description: 'Read recent messages from a Teams chat.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          chatId: { type: 'string', description: 'Chat ID' },
          maxResults: { type: 'number', description: 'Max messages (default: 20)' },
        },
        required: ['chatId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/chats/${params.chatId}/messages`, {
            query: { '$top': String(params.maxResults || 20), '$orderby': 'createdDateTime desc' }
          });
          const messages = (data.value || []).map((m: any) => mapMessage(m));
          return jsonResult({ messages, count: messages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_list_members',
      description: 'List members of a team or channel.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID (omit for team members)' },
        },
        required: ['teamId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.channelId
            ? `/teams/${params.teamId}/channels/${params.channelId}/members`
            : `/teams/${params.teamId}/members`;
          const data = await graph(token, path);
          const members = (data.value || []).map((m: any) => ({
            id: m.id, userId: m.userId,
            name: m.displayName, email: m.email,
            roles: m.roles, // ['owner'] or []
          }));
          return jsonResult({ members, count: members.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_add_member',
      description: 'Add a member to a team.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          userId: { type: 'string', description: 'User ID or email to add' },
          role: { type: 'string', description: 'member or owner (default: member)' },
        },
        required: ['teamId', 'userId'],
      },
      
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${params.userId}')`,
            roles: params.role === 'owner' ? ['owner'] : [],
          };
          await graph(token, `/teams/${params.teamId}/members`, { method: 'POST', body });
          return jsonResult({ added: true, userId: params.userId, teamId: params.teamId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_share_file',
      description: 'Share a file in a Teams channel by uploading it to the channel\'s SharePoint folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          fileName: { type: 'string', description: 'File name (e.g., "report.pdf")' },
          content: { type: 'string', description: 'File content (text or base64 for binary)' },
          message: { type: 'string', description: 'Optional message to post with the file' },
        },
        required: ['teamId', 'channelId', 'fileName', 'content'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Get the channel's files folder (SharePoint drive)
          const folder = await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/filesFolder`);
          const driveId = folder.parentReference?.driveId;
          const folderId = folder.id;
          if (!driveId) throw new Error('Could not resolve channel files folder');
          // Upload file
          const uploadRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodeURIComponent(params.fileName)}:/content`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
            body: params.content,
          });
          if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
          const file = await uploadRes.json();
          // Optionally post a message linking the file
          if (params.message) {
            await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/messages`, {
              method: 'POST',
              body: {
                body: { contentType: 'html', content: `${params.message}<br/><a href="${file.webUrl}">${params.fileName}</a>` },
              },
            });
          }
          return jsonResult({ fileId: file.id, name: file.name, webUrl: file.webUrl, uploaded: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_presence',
      description: 'Get presence/availability status for users (Available, Busy, DoNotDisturb, Away, Offline).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          userIds: { type: 'string', description: 'User IDs, comma-separated (use "me" for self)' },
        },
        required: ['userIds'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          if (params.userIds === 'me') {
            const p = await graph(token, '/me/presence');
            return jsonResult({ presence: [{ availability: p.availability, activity: p.activity, statusMessage: p.statusMessage?.message?.content }] });
          }
          const ids = params.userIds.split(',').map((s: string) => s.trim());
          const data = await graph(token, '/communications/getPresencesByUserId', {
            method: 'POST', body: { ids },
          });
          const presence = (data.value || []).map((p: any) => ({
            userId: p.id, availability: p.availability, activity: p.activity,
          }));
          return jsonResult({ presence });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_set_status',
      description: 'Set the agent\'s presence status message in Teams.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          message: { type: 'string', description: 'Status message text' },
          expiry: { type: 'string', description: 'Expiry duration (ISO 8601 duration, e.g., "PT1H" for 1 hour, "P1D" for 1 day)' },
        },
        required: ['message'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {
            statusMessage: {
              message: { content: params.message, contentType: 'text' },
            },
          };
          if (params.expiry) {
            body.statusMessage.expiryDateTime = {
              dateTime: new Date(Date.now() + parseDuration(params.expiry)).toISOString(),
              timeZone: 'UTC',
            };
          }
          await graph(token, '/me/presence/setStatusMessage', { method: 'POST', body }, );
          return jsonResult({ statusSet: true, message: params.message });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}

function parseDuration(iso: string): number {
  // Simple ISO 8601 duration parser for common cases
  const match = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 3600000;
  const days = parseInt(match[1] || '0') * 86400000;
  const hours = parseInt(match[2] || '0') * 3600000;
  const mins = parseInt(match[3] || '0') * 60000;
  return days + hours + mins;
}
