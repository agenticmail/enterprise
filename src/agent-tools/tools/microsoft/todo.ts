/**
 * Microsoft To Do Tools
 *
 * Task management via Microsoft Graph API — lists, tasks, CRUD.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createTodoTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'todo_list_lists',
      description: 'List all To Do task lists.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/todo/lists');
          const lists = (data.value || []).map((l: any) => ({
            id: l.id, name: l.displayName, isOwner: l.isOwner,
            wellknownName: l.wellknownListName,
          }));
          return jsonResult({ lists, count: lists.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'todo_list_tasks',
      description: 'List tasks in a To Do list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          listId: { type: 'string', description: 'Task list ID' },
          includeCompleted: { type: 'boolean', description: 'Include completed tasks (default: false)' },
          maxResults: { type: 'number', description: 'Max tasks (default: 50)' },
        },
        required: ['listId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {
            '$top': String(params.maxResults || 50),
            '$orderby': 'importance desc,createdDateTime desc',
            '$select': 'id,title,body,status,importance,createdDateTime,lastModifiedDateTime,dueDateTime,completedDateTime,isReminderOn,reminderDateTime',
          };
          if (!params.includeCompleted) query['$filter'] = "status ne 'completed'";
          const data = await graph(token, `/me/todo/lists/${params.listId}/tasks`, { query });
          const tasks = (data.value || []).map((t: any) => ({
            id: t.id, title: t.title,
            body: t.body?.content, bodyType: t.body?.contentType,
            status: t.status, importance: t.importance,
            created: t.createdDateTime, modified: t.lastModifiedDateTime,
            dueDate: t.dueDateTime?.dateTime, dueTimeZone: t.dueDateTime?.timeZone,
            completedDate: t.completedDateTime?.dateTime,
            hasReminder: t.isReminderOn,
          }));
          return jsonResult({ tasks, count: tasks.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'todo_create_task',
      description: 'Create a new task in a To Do list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          listId: { type: 'string', description: 'Task list ID' },
          title: { type: 'string', description: 'Task title' },
          body: { type: 'string', description: 'Task notes/description' },
          dueDate: { type: 'string', description: 'Due date (ISO 8601 date, e.g., "2026-03-15")' },
          importance: { type: 'string', description: 'low, normal, or high (default: normal)' },
          reminderDateTime: { type: 'string', description: 'Reminder date/time (ISO 8601)' },
        },
        required: ['listId', 'title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const task: any = { title: params.title };
          if (params.body) task.body = { contentType: 'text', content: params.body };
          if (params.dueDate) task.dueDateTime = { dateTime: params.dueDate + 'T00:00:00', timeZone: 'UTC' };
          if (params.importance) task.importance = params.importance;
          if (params.reminderDateTime) {
            task.isReminderOn = true;
            task.reminderDateTime = { dateTime: params.reminderDateTime, timeZone: 'UTC' };
          }
          const created = await graph(token, `/me/todo/lists/${params.listId}/tasks`, { method: 'POST', body: task });
          return jsonResult({ id: created.id, title: created.title, status: created.status });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'todo_update_task',
      description: 'Update an existing To Do task (title, status, due date, importance).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          listId: { type: 'string', description: 'Task list ID' },
          taskId: { type: 'string', description: 'Task ID' },
          title: { type: 'string', description: 'New title' },
          status: { type: 'string', description: 'notStarted, inProgress, completed, waitingOnOthers, deferred' },
          importance: { type: 'string', description: 'low, normal, or high' },
          dueDate: { type: 'string', description: 'New due date (ISO 8601 date)' },
          body: { type: 'string', description: 'New task notes' },
        },
        required: ['listId', 'taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const update: any = {};
          if (params.title) update.title = params.title;
          if (params.status) update.status = params.status;
          if (params.importance) update.importance = params.importance;
          if (params.dueDate) update.dueDateTime = { dateTime: params.dueDate + 'T00:00:00', timeZone: 'UTC' };
          if (params.body) update.body = { contentType: 'text', content: params.body };
          const updated = await graph(token, `/me/todo/lists/${params.listId}/tasks/${params.taskId}`, {
            method: 'PATCH', body: update
          });
          return jsonResult({ id: updated.id, title: updated.title, status: updated.status, updated: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'todo_delete_task',
      description: 'Delete a To Do task.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          listId: { type: 'string', description: 'Task list ID' },
          taskId: { type: 'string', description: 'Task ID to delete' },
        },
        required: ['listId', 'taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/todo/lists/${params.listId}/tasks/${params.taskId}`, { method: 'DELETE' });
          return jsonResult({ deleted: true, taskId: params.taskId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'todo_create_list',
      description: 'Create a new To Do task list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'List name' },
        },
        required: ['name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const list = await graph(token, '/me/todo/lists', {
            method: 'POST', body: { displayName: params.name },
          });
          return jsonResult({ id: list.id, name: list.displayName });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
