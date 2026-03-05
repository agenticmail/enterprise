/**
 * Microsoft Teams Tools
 *
 * Team/channel messaging, chat, and presence via Microsoft Graph API.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createTeamsTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'teams_list_teams',
      description: 'List all Teams the agent is a member of.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/joinedTeams', {
            query: { '$select': 'id,displayName,description' }
          });
          const teams = (data.value || []).map((t: any) => ({
            id: t.id, name: t.displayName, description: t.description,
          }));
          return jsonResult({ teams, count: teams.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_list_channels',
      description: 'List channels in a Team.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
        },
        required: ['teamId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/teams/${params.teamId}/channels`, {
            query: { '$select': 'id,displayName,description,membershipType' }
          });
          const channels = (data.value || []).map((c: any) => ({
            id: c.id, name: c.displayName, description: c.description,
            membershipType: c.membershipType,
          }));
          return jsonResult({ channels, count: channels.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_send_channel_message',
      description: 'Send a message to a Teams channel.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          message: { type: 'string', description: 'Message content (supports HTML)' },
          isHtml: { type: 'boolean', description: 'Whether message is HTML (default: false)' },
        },
        required: ['teamId', 'channelId', 'message'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const msg = await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/messages`, {
            method: 'POST',
            body: {
              body: {
                contentType: params.isHtml ? 'html' : 'text',
                content: params.message,
              },
            },
          });
          return jsonResult({ id: msg.id, sent: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_read_channel_messages',
      description: 'Read recent messages from a Teams channel.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: 'Team ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          maxResults: { type: 'number', description: 'Max messages (default: 20)' },
        },
        required: ['teamId', 'channelId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/teams/${params.teamId}/channels/${params.channelId}/messages`, {
            query: { '$top': String(params.maxResults || 20) }
          });
          const messages = (data.value || []).map((m: any) => ({
            id: m.id,
            from: m.from?.user?.displayName || m.from?.application?.displayName,
            fromEmail: m.from?.user?.email,
            body: m.body?.content,
            bodyType: m.body?.contentType,
            date: m.createdDateTime,
            importance: m.importance,
            replyCount: m.replies?.length,
          }));
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
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/chats', {
            query: {
              '$top': String(params.maxResults || 20),
              '$select': 'id,topic,chatType,createdDateTime,lastUpdatedDateTime',
              '$orderby': 'lastUpdatedDateTime desc',
            }
          });
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
            body: {
              body: { contentType: params.isHtml ? 'html' : 'text', content: params.message },
            },
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
          const messages = (data.value || []).map((m: any) => ({
            id: m.id,
            from: m.from?.user?.displayName,
            body: m.body?.content,
            bodyType: m.body?.contentType,
            date: m.createdDateTime,
          }));
          return jsonResult({ messages, count: messages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'teams_presence',
      description: 'Get presence/availability status for users.',
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
            return jsonResult({ presence: [{ availability: p.availability, activity: p.activity }] });
          }
          const ids = params.userIds.split(',').map((s: string) => s.trim());
          const data = await graph(token, '/communications/getPresencesByUserId', {
            method: 'POST',
            body: { ids },
          });
          const presence = (data.value || []).map((p: any) => ({
            userId: p.id, availability: p.availability, activity: p.activity,
          }));
          return jsonResult({ presence });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
