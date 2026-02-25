/**
 * Google Tasks API Tools
 *
 * Lets agents create, list, complete, and manage tasks.
 * Uses Google Tasks API v1.
 */

import type { AnyAgentTool } from '../../types.js';
import type { TokenProvider } from './index.js';
import { jsonResult, errorResult } from '../../common.js';

// ─── Helper ─────────────────────────────────────────────

async function tasks(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const url = new URL(`https://tasks.googleapis.com/tasks/v1${path}`);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Tasks API ${res.status}: ${errText}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ─── Tool Definitions ───────────────────────────────────

export function createGoogleTasksTools(tp: TokenProvider): AnyAgentTool[] {
  return [
    {
      name: 'google_tasks_list_tasklists',
      description: 'List all task lists (like "My Tasks", custom lists). Returns task list IDs needed for other operations.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute() {
        try {
          const token = await tp.getAccessToken();
          const result = await tasks(token, '/users/@me/lists');
          const lists = (result.items || []).map((l: any) => ({ id: l.id, title: l.title, updated: l.updated }));
          return jsonResult({ taskLists: lists });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_tasks_list',
      description: 'List tasks in a task list. Shows pending tasks by default. Use showCompleted=true to include completed tasks.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          taskListId: { type: 'string', description: 'Task list ID (default: "@default" for primary list)' },
          showCompleted: { type: 'string', description: '"true" to include completed tasks' },
          maxResults: { type: 'string', description: 'Max results (default: 20)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const listId = params.taskListId || '@default';
          const query: Record<string, string> = { maxResults: params.maxResults || '20' };
          if (params.showCompleted === 'true') query.showCompleted = 'true';
          else query.showCompleted = 'false';
          const result = await tasks(token, `/lists/${encodeURIComponent(listId)}/tasks`, { query });
          const items = (result.items || []).map((t: any) => ({
            id: t.id, title: t.title, notes: t.notes, status: t.status,
            due: t.due, completed: t.completed, updated: t.updated, parent: t.parent,
          }));
          return jsonResult({ tasks: items, count: items.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_tasks_create',
      description: 'Create a new task. Use this to track work items, reminders, and follow-ups.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Task title (required)' },
          notes: { type: 'string', description: 'Task notes/details' },
          due: { type: 'string', description: 'Due date in RFC 3339 format (e.g. "2026-02-24T00:00:00.000Z")' },
          taskListId: { type: 'string', description: 'Task list ID (default: "@default")' },
        },
        required: ['title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const listId = params.taskListId || '@default';
          const body: any = { title: params.title };
          if (params.notes) body.notes = params.notes;
          if (params.due) body.due = params.due;
          const result = await tasks(token, `/lists/${encodeURIComponent(listId)}/tasks`, { method: 'POST', body });
          return jsonResult({ created: true, id: result.id, title: result.title, due: result.due });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_tasks_complete',
      description: 'Mark a task as completed.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'Task ID (required)' },
          taskListId: { type: 'string', description: 'Task list ID (default: "@default")' },
        },
        required: ['taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const listId = params.taskListId || '@default';
          const result = await tasks(token, `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(params.taskId)}`, {
            method: 'PATCH', body: { status: 'completed' },
          });
          return jsonResult({ completed: true, id: result.id, title: result.title });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_tasks_update',
      description: 'Update a task (title, notes, due date).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'Task ID (required)' },
          title: { type: 'string', description: 'New title' },
          notes: { type: 'string', description: 'New notes' },
          due: { type: 'string', description: 'New due date (RFC 3339)' },
          taskListId: { type: 'string', description: 'Task list ID (default: "@default")' },
        },
        required: ['taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const listId = params.taskListId || '@default';
          const body: any = {};
          if (params.title) body.title = params.title;
          if (params.notes) body.notes = params.notes;
          if (params.due) body.due = params.due;
          const result = await tasks(token, `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(params.taskId)}`, {
            method: 'PATCH', body,
          });
          return jsonResult({ updated: true, id: result.id, title: result.title, due: result.due });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_tasks_delete',
      description: 'Delete a task.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'Task ID (required)' },
          taskListId: { type: 'string', description: 'Task list ID (default: "@default")' },
        },
        required: ['taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const listId = params.taskListId || '@default';
          await tasks(token, `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(params.taskId)}`, { method: 'DELETE' });
          return jsonResult({ deleted: true, taskId: params.taskId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_tasks_create_list',
      description: 'Create a new task list (e.g. "Follow-ups", "Customer Issues").',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Task list title (required)' },
        },
        required: ['title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await tasks(token, '/users/@me/lists', { method: 'POST', body: { title: params.title } });
          return jsonResult({ created: true, id: result.id, title: result.title });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
