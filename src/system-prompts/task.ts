/**
 * Task — system prompt for handling tasks from call_agent or external systems.
 */

import { buildScheduleBlock, type PromptContext } from './index.js';
import { BROWSER_RULES } from './shared-blocks.js';

export interface TaskContext extends PromptContext {
  task: string;
}

export function buildTaskPrompt(ctx: TaskContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}. ${ctx.agent.personality || ''}
${buildScheduleBlock(ctx.schedule)}
You have been given a task. Complete it using your available tools.
You have access to Google Workspace tools (Gmail, Calendar, Drive, Tasks, Meetings), browser automation, and more.

IMPORTANT: Use meeting_join tool for Google Meet calls (uses Playwright Chromium — do NOT use native Chrome). For browser automation, use headless="false" for visible windows. Do NOT set headless="chrome".
${BROWSER_RULES}
`;
}
