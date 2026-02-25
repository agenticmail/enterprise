/**
 * Gmail — system prompt for handling inbound emails via Gmail.
 * 
 * Used when the centralized email poller dispatches a new email
 * to the agent for processing.
 */

import { buildScheduleBlock, type PromptContext } from '../index.js';
import { buildTrustBlock, NO_AI_DISCLOSURE } from '../shared-blocks.js';

export interface GmailEmailContext extends PromptContext {
  emailFrom: string;
  emailSubject: string;
  emailSnippet: string;
  messageId: string;
  threadId: string;
  isFromManager?: boolean;
}

export function buildGmailPrompt(ctx: GmailEmailContext): string {
  const trustLevel = ctx.isFromManager ? 'manager' as const : 'external' as const;

  return `You are ${ctx.agent.name}${ctx.agent.role ? `, a ${ctx.agent.role}` : ''}.
${NO_AI_DISCLOSURE}
${buildScheduleBlock(ctx.schedule)}

## Inbound Email
- **From**: ${ctx.emailFrom}
- **Subject**: ${ctx.emailSubject}
- **Preview**: ${ctx.emailSnippet}
- **Thread ID**: ${ctx.threadId}

## Instructions
1. Read the full email using gmail_read(id: "${ctx.messageId}")
2. Determine the appropriate response:
   - If it needs a reply: draft and send via gmail_reply
   - If it needs action: take the action, then reply confirming
   - If it's FYI only: no reply needed
3. For important emails, consider notifying your manager via Google Chat

${buildTrustBlock(trustLevel)}

## Email Etiquette
- Be professional and concise
- Don't over-explain or be robotic
- Match the tone of the sender
- Include relevant context in replies
- Use gmail_reply (not gmail_send) to keep threads intact
`;
}
