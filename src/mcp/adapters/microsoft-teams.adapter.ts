/**
 * MCP Skill Adapter — Microsoft Teams
 *
 * Maps Microsoft Graph API endpoints to MCP tool handlers for Teams operations.
 * Uses the /v1.0 endpoint for stable operations.
 *
 * Microsoft Graph API docs: https://learn.microsoft.com/en-us/graph/api/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function teamsError(err: unknown): ToolResult {
  if (err instanceof Error) {
    // Microsoft Graph errors typically have { error: { code, message } }
    const data = (err as any).data;
    if (data?.error?.message) {
      return {
        content: `Microsoft Graph error (${data.error.code}): ${data.error.message}`,
        isError: true,
      };
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

// ─── Tool: teams_send_message ───────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a message to a Microsoft Teams channel. Provide the team ID, channel ID, and message content.',
  inputSchema: {
    type: 'object',
    properties: {
      team_id: {
        type: 'string',
        description: 'The ID of the team containing the channel',
      },
      channel_id: {
        type: 'string',
        description: 'The ID of the channel to send the message to',
      },
      content: {
        type: 'string',
        description: 'Message content',
      },
      content_type: {
        type: 'string',
        enum: ['text', 'html'],
        description: 'Content type: "text" (default) or "html" for rich formatting',
      },
    },
    required: ['team_id', 'channel_id', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        body: {
          content: params.content,
          contentType: params.content_type || 'text',
        },
      };

      const result = await ctx.apiExecutor.post(
        `/teams/${params.team_id}/channels/${params.channel_id}/messages`,
        body,
      );

      return {
        content: `Message sent to channel (ID: ${result.id})`,
        metadata: {
          messageId: result.id,
          teamId: params.team_id,
          channelId: params.channel_id,
        },
      };
    } catch (err) {
      return teamsError(err);
    }
  },
};

// ─── Tool: teams_list_teams ─────────────────────────────

const listTeams: ToolHandler = {
  description:
    'List all Microsoft Teams that the authenticated user has joined. Returns team names, IDs, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/me/joinedTeams');

      const teams: any[] = result.value || [];

      if (teams.length === 0) {
        return { content: 'No teams found.' };
      }

      const lines = teams.map((team: any) => {
        const desc = team.description ? ` — ${team.description}` : '';
        return `\u2022 ${team.displayName} (${team.id})${desc}`;
      });

      return {
        content: `Found ${teams.length} teams:\n${lines.join('\n')}`,
        metadata: { count: teams.length },
      };
    } catch (err) {
      return teamsError(err);
    }
  },
};

// ─── Tool: teams_list_channels ──────────────────────────

const listChannels: ToolHandler = {
  description:
    'List all channels in a Microsoft Teams team. Returns channel names, IDs, membership types, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      team_id: {
        type: 'string',
        description: 'The ID of the team to list channels for',
      },
    },
    required: ['team_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/teams/${params.team_id}/channels`,
      );

      const channels: any[] = result.value || [];

      if (channels.length === 0) {
        return { content: 'No channels found in this team.' };
      }

      const lines = channels.map((ch: any) => {
        const membership = ch.membershipType || 'standard';
        const desc = ch.description ? ` — ${ch.description}` : '';
        return `#${ch.displayName} (${ch.id}) — ${membership}${desc}`;
      });

      return {
        content: `Found ${channels.length} channels:\n${lines.join('\n')}`,
        metadata: { count: channels.length, teamId: params.team_id },
      };
    } catch (err) {
      return teamsError(err);
    }
  },
};

// ─── Tool: teams_create_channel ─────────────────────────

const createChannel: ToolHandler = {
  description:
    'Create a new channel in a Microsoft Teams team. Specify a display name and optional description and membership type.',
  inputSchema: {
    type: 'object',
    properties: {
      team_id: {
        type: 'string',
        description: 'The ID of the team to create the channel in',
      },
      displayName: {
        type: 'string',
        description: 'Display name for the new channel',
      },
      description: {
        type: 'string',
        description: 'Channel description (optional)',
      },
      membershipType: {
        type: 'string',
        enum: ['standard', 'private', 'shared'],
        description: 'Membership type: "standard" (default), "private", or "shared"',
      },
    },
    required: ['team_id', 'displayName'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        displayName: params.displayName,
        membershipType: params.membershipType || 'standard',
      };
      if (params.description) body.description = params.description;

      const result = await ctx.apiExecutor.post(
        `/teams/${params.team_id}/channels`,
        body,
      );

      return {
        content: `Channel '${result.displayName}' created (ID: ${result.id})`,
        metadata: {
          channelId: result.id,
          displayName: result.displayName,
          teamId: params.team_id,
        },
      };
    } catch (err) {
      return teamsError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const teamsAdapter: SkillAdapter = {
  skillId: 'microsoft-teams',
  name: 'Microsoft Teams',
  baseUrl: 'https://graph.microsoft.com/v1.0',
  auth: {
    type: 'oauth2',
    provider: 'microsoft',
    headerPrefix: 'Bearer',
  },
  tools: {
    teams_send_message: sendMessage,
    teams_list_teams: listTeams,
    teams_list_channels: listChannels,
    teams_create_channel: createChannel,
  },
  rateLimits: {
    requestsPerSecond: 8,
    burstLimit: 20,
  },
  configSchema: {
    tenantId: {
      type: 'string' as const,
      label: 'Microsoft Tenant ID',
      description: 'Your Azure AD / Microsoft 365 tenant ID (GUID or domain)',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
  },
};
