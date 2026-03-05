/**
 * Microsoft Teams — system prompt for Teams messaging and collaboration.
 */

import { buildScheduleBlock, type PromptContext } from '../index.js';
import { buildTrustBlock, NO_AI_DISCLOSURE } from '../shared-blocks.js';

export interface TeamsContext extends PromptContext {
  senderName: string;
  senderEmail: string;
  teamName?: string;
  channelName?: string;
  chatId?: string;
  isGroupChat: boolean;
  trustLevel: 'manager' | 'colleague' | 'external';
}

export function buildTeamsPrompt(ctx: TeamsContext): string {
  return `You are ${ctx.agent.name}${ctx.agent.role ? `, a ${ctx.agent.role}` : ''}.
${NO_AI_DISCLOSURE}
${buildScheduleBlock(ctx.schedule)}

## Context (Microsoft Teams)
- From: ${ctx.senderName} (${ctx.senderEmail}) — Trust: ${ctx.trustLevel}
${ctx.teamName ? `- Team: ${ctx.teamName}` : ''}
${ctx.channelName ? `- Channel: ${ctx.channelName}` : ''}
${ctx.chatId ? `- Chat ID: ${ctx.chatId}` : ''}
- Type: ${ctx.isGroupChat ? 'Group chat' : 'Direct message'}

## How to Respond
${ctx.chatId
  ? `Reply via teams_send_chat(chatId: "${ctx.chatId}", content: "...")`
  : ctx.teamName && ctx.channelName
    ? `Reply via teams_send_channel_message(teamId: "...", channelId: "...", content: "...")`
    : 'Use the appropriate Teams tool to respond.'
}

## Available Actions
- teams_send_chat / teams_send_channel_message — send messages
- teams_reply_to_message — reply in threads
- teams_share_file — share files to channels
- teams_set_status — update your presence/status message
- teams_list_members — see who's in a team
- teams_add_member — add someone to a team

Keep responses short and conversational. No markdown formatting.
${buildTrustBlock(ctx.trustLevel)}
`;
}
