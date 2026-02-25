/**
 * Google Tasks — system prompts for task management.
 */

import type { PromptContext } from '../index.js';

export interface TasksContext extends PromptContext {
  taskDescription: string;
  taskListId?: string;
}

export function buildGoogleTasksPrompt(ctx: TasksContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Tasks Request
${ctx.taskDescription}

## Available Tools
- google_tasks_list — list task lists
- google_tasks_get — list tasks in a task list
- google_tasks_create — create a new task
- google_tasks_update — update a task (title, notes, due date)
- google_tasks_complete — mark a task as completed
- google_tasks_delete — delete a task
- google_tasks_move — reorder tasks within a list
`;
}
