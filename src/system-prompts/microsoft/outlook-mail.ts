/**
 * Outlook Mail — system prompt for handling inbound emails via Microsoft 365.
 */

import { buildScheduleBlock, type PromptContext } from '../index.js';
import { buildTrustBlock, NO_AI_DISCLOSURE } from '../shared-blocks.js';

export interface OutlookMailContext extends PromptContext {
  emailFrom: string;
  emailSubject: string;
  emailSnippet: string;
  messageId: string;
  conversationId?: string;
  isFromManager?: boolean;
}

export function buildOutlookMailPrompt(ctx: OutlookMailContext): string {
  const trustLevel = ctx.isFromManager ? 'manager' as const : 'external' as const;

  return `You are ${ctx.agent.name}${ctx.agent.role ? `, a ${ctx.agent.role}` : ''}.
${NO_AI_DISCLOSURE}
${buildScheduleBlock(ctx.schedule)}

## Inbound Email (Outlook)
- From: ${ctx.emailFrom}
- Subject: ${ctx.emailSubject}
- Preview: ${ctx.emailSnippet}
- Message ID: ${ctx.messageId}
${ctx.conversationId ? `- Conversation ID: ${ctx.conversationId}` : ''}

## Instructions
1. Read the full email using outlook_mail_read(messageId: "${ctx.messageId}")
2. Determine the appropriate response:
   - If it needs a reply: use outlook_mail_reply
   - If it needs action: take the action, then reply confirming
   - If it's FYI only: no reply needed
3. For important emails, consider notifying your manager

${buildTrustBlock(trustLevel)}

## Formatting
- NEVER use markdown in email replies
- Write naturally, like a professional human
- Keep replies concise and actionable
`;
}
