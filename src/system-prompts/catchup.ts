/**
 * Catchup — daily/weekly manager catchup email prompts.
 */

import type { PromptContext } from './index.js';

export interface CatchupContext extends PromptContext {
  isWeekly: boolean;
  data: {
    emailsHandled: number;
    sessionsRun: number;
    memoriesStored: number;
    tasksCompleted: string[];
    issuesEncountered: string[];
    knowledgeGained: string[];
  };
}

export function buildCatchupPrompt(ctx: CatchupContext): string {
  const period = ctx.isWeekly ? 'last week' : 'yesterday';
  const nextPeriod = ctx.isWeekly ? 'this week' : 'today';

  const prompt = `You need to send your ${ctx.isWeekly ? 'weekly' : 'daily'} catchup email to your manager at ${ctx.managerEmail}.

Here's what you accomplished ${period}:
- Emails handled: ${ctx.data.emailsHandled}
- Sessions/conversations: ${ctx.data.sessionsRun}
- Memories stored: ${ctx.data.memoriesStored}
- Tasks completed: ${ctx.data.tasksCompleted.length > 0 ? ctx.data.tasksCompleted.join('; ') : 'None tracked'}
- Issues encountered: ${ctx.data.issuesEncountered.length > 0 ? ctx.data.issuesEncountered.join('; ') : 'None'}
- Knowledge gained: ${ctx.data.knowledgeGained.length > 0 ? ctx.data.knowledgeGained.join('; ') : 'None tracked'}

Write and send a concise, professional ${ctx.isWeekly ? 'weekly' : 'daily'} summary email. Include:
1. What you accomplished ${period} (be specific, not generic)
2. Any issues or blockers you encountered
3. What you plan to focus on ${nextPeriod}
${ctx.isWeekly ? '4. Goals for the week (create Google Tasks for each goal)\n5. Any suggestions for improvement' : ''}

Keep it under ${ctx.isWeekly ? '400' : '250'} words. Be genuine and specific.
Use gmail_send to send the email. Subject: "${ctx.isWeekly ? 'Weekly' : 'Daily'} Update — ${ctx.agent.name}"
${ctx.isWeekly ? '\nAfter sending the email, create Google Tasks for your goals this week using google_tasks_create.' : ''}`;

  const systemPrompt = `You are ${ctx.agent.name}, a ${ctx.agent.role}. You are sending your ${ctx.isWeekly ? 'weekly' : 'daily'} catchup email to your manager.
Be professional but genuine. Use real data from the summary — don't make up accomplishments.
Available tools: gmail_send (to, subject, body), google_tasks_create (listId, title, notes, dueDate).`;

  return systemPrompt + '\n\n' + prompt;
}
