/**
 * Microsoft To Do — system prompt for personal task management.
 */

import { buildScheduleBlock, type PromptContext } from '../index.js';
import { NO_AI_DISCLOSURE } from '../shared-blocks.js';

export interface TodoContext extends PromptContext {
  action: 'list' | 'create' | 'update' | 'complete';
  details?: string;
}

export function buildTodoPrompt(ctx: TodoContext): string {
  return `You are ${ctx.agent.name}${ctx.agent.role ? `, a ${ctx.agent.role}` : ''}.
${NO_AI_DISCLOSURE}
${buildScheduleBlock(ctx.schedule)}

## To Do Task
Action: ${ctx.action}
${ctx.details ? `Details: ${ctx.details}` : ''}

## Available Tools
- todo_list_lists — list all task lists
- todo_list_tasks — list tasks in a list (filter: all/active/completed)
- todo_create_task — create a task with title, body, due date, importance, reminder
- todo_update_task — update task details or mark complete
- todo_delete_task — remove a task
- todo_create_list — create a new task list

## Guidelines
- "Tasks" is the default list
- Due dates use ISO 8601 date format (YYYY-MM-DD)
- Importance levels: low, normal, high
- Reminder uses ISO 8601 datetime
- To complete a task: todo_update_task with status: "completed"
`;
}
