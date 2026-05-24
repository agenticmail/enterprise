/**
 * AgenticMail Agent Tools — Local Tasks (DB-backed)
 *
 * A per-agent to-do tracker (Google Tasks-style) the agent owns and
 * updates as it works. Use it for any multi-step / batch job where you
 * need to remember what's done and what's left — e.g. "120 cities, send
 * an email to each, mark DONE as you go". Survives restarts.
 *
 * This is NOT the inter-agent task queue (delegating work to OTHER
 * agents). It's your own checklist.
 *
 * Single `tasks` tool with an `action`:
 *   add      — create a task
 *   list     — show tasks (filter by list/status/tag)
 *   get      — one task's full detail
 *   start    — mark in_progress
 *   complete — mark done (alias: done)
 *   reopen   — back to needs_action
 *   block    — mark blocked (with a reason)
 *   update   — edit title/notes/priority/due/list/tags
 *   delete   — remove a task (and its subtasks)
 *   clear_completed — bulk-remove finished tasks
 *   stats    — counts by status + lists
 *   lists    — enumerate your task lists
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';
import type {
  AgentTaskManager, AgentTask, TaskStatus, TaskPriority,
} from '../../engine/agent-tasks.js';

const ACTIONS = [
  'add', 'list', 'get', 'start', 'complete', 'done', 'reopen', 'block',
  'update', 'delete', 'clear_completed', 'stats', 'lists',
] as const;
type Action = (typeof ACTIONS)[number];

const STATUSES = ['needs_action', 'in_progress', 'completed', 'blocked'];
const PRIORITIES = ['low', 'normal', 'high'];

export interface TaskToolOptions extends ToolCreationOptions {
  agentTaskManager?: AgentTaskManager;
  agentId?: string;
  orgId?: string;
}

// ── File-based fallback (local/dev with no DB) ──
interface FileTask extends Partial<AgentTask> { id: string; title: string; }
async function loadFile(p: string): Promise<{ tasks: FileTask[] }> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return { tasks: [] }; }
}
async function saveFile(p: string, store: { tasks: FileTask[] }): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(store, null, 2), 'utf-8');
}

function compactTask(t: AgentTask) {
  return {
    id: t.id, list: t.list, title: t.title, status: t.status, priority: t.priority,
    due: t.due || undefined, tags: t.tags.length ? t.tags : undefined,
    parentId: t.parentId || undefined,
    notes: t.notes ? (t.notes.length > 200 ? t.notes.slice(0, 200) + '…' : t.notes) : undefined,
  };
}

export function createTaskTools(options?: TaskToolOptions): AnyAgentTool[] {
  const mgr = options?.agentTaskManager;
  const agentId = options?.agentId || 'default';
  const orgId = options?.orgId || 'default';
  const useDb = !!(mgr && mgr.ready);
  const filePath = path.join(options?.workspaceDir || process.cwd(), '.agenticmail', 'agent-tasks.json');

  const tool: AnyAgentTool = {
    name: 'tasks',
    label: 'Tasks',
    description:
      "Your personal to-do tracker — like Google Tasks, but local and always available. Use it for any multi-step or batch job so you never lose your place across restarts (e.g. \"email 120 cities, mark each done as you send\"). This is YOUR checklist, not the queue for delegating work to other agents.\n\n" +
      "Actions:\n" +
      "- add: create a task (title required; optional notes, list, due, priority, tags, parent)\n" +
      "- list: show tasks (filter by list/status/tag; hides completed unless includeCompleted=true)\n" +
      "- get: full detail of one task by id\n" +
      "- start: mark a task in_progress\n" +
      "- complete (alias done): mark a task completed\n" +
      "- reopen: set a task back to needs_action\n" +
      "- block: mark blocked (pass notes as the reason)\n" +
      "- update: edit title/notes/priority/due/list/tags/status\n" +
      "- delete: remove a task (and its subtasks)\n" +
      "- clear_completed: bulk-remove finished tasks (optionally in one list)\n" +
      "- stats: counts by status and list\n" +
      "- lists: enumerate your task lists\n\n" +
      "Lists are created automatically by name — just pass list:\"NC Cities\". Statuses: needs_action, in_progress, completed, blocked.",
    category: 'productivity',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'What to do.', enum: ACTIONS as unknown as string[] },
        id: { type: 'string', description: 'Task id (for get/start/complete/reopen/block/update/delete).' },
        title: { type: 'string', description: 'Task title (for add; or to rename via update).' },
        notes: { type: 'string', description: 'Longer description / details. For block, use this as the reason.' },
        list: { type: 'string', description: 'Task list name (default "Tasks"). Auto-created. Filters list/stats; sets list on add/update.' },
        status: { type: 'string', description: 'Filter (list) or set (add/update).', enum: STATUSES },
        priority: { type: 'string', description: 'low | normal | high.', enum: PRIORITIES },
        due: { type: 'string', description: 'Due date/time (ISO 8601 or YYYY-MM-DD).' },
        tags: { type: 'string', description: 'Comma-separated tags.' },
        parent: { type: 'string', description: 'Parent task id — makes this a subtask.' },
        includeCompleted: { type: 'boolean', description: 'For list: include completed tasks (default false).' },
        tag: { type: 'string', description: 'For list: only tasks with this tag.' },
        limit: { type: 'number', description: 'For list: max results (default 200).' },
      },
      required: ['action'],
    },
    execute: async function (_id, args) {
      const p = args as Record<string, unknown>;
      const action = (readStringParam(p, 'action', { required: true }) as Action);
      const parseTags = () => (readStringParam(p, 'tags') || '').split(',').map((t) => t.trim()).filter(Boolean);

      try {
        // ── DB-backed path ──
        if (useDb) {
          switch (action) {
            case 'add': {
              const title = readStringParam(p, 'title', { required: true });
              const t = await mgr!.createTask({
                agentId, orgId, title,
                notes: readStringParam(p, 'notes') || undefined,
                list: readStringParam(p, 'list') || undefined,
                status: (readStringParam(p, 'status') as TaskStatus) || undefined,
                priority: (readStringParam(p, 'priority') as TaskPriority) || undefined,
                due: readStringParam(p, 'due') || undefined,
                parentId: readStringParam(p, 'parent') || undefined,
                tags: parseTags(),
              });
              return jsonResult({ created: compactTask(t), id: t.id });
            }
            case 'list': {
              const statusFilter = readStringParam(p, 'status') as TaskStatus | undefined;
              const tasks = await mgr!.listTasks({
                agentId,
                list: readStringParam(p, 'list') || undefined,
                status: statusFilter || undefined,
                tag: readStringParam(p, 'tag') || undefined,
                includeCompleted: p.includeCompleted === true || !!statusFilter,
                limit: readNumberParam(p, 'limit', { integer: true }) ?? 200,
              });
              return jsonResult({ count: tasks.length, tasks: tasks.map(compactTask) });
            }
            case 'get': {
              const id = readStringParam(p, 'id', { required: true });
              const t = await mgr!.getTask(agentId, id);
              return t ? jsonResult(t) : textResult('Task not found: ' + id);
            }
            case 'start':
            case 'complete':
            case 'done':
            case 'reopen':
            case 'block': {
              const id = readStringParam(p, 'id', { required: true });
              const statusMap: Record<string, TaskStatus> = {
                start: 'in_progress', complete: 'completed', done: 'completed',
                reopen: 'needs_action', block: 'blocked',
              };
              const updates: any = { status: statusMap[action] };
              if (action === 'block') {
                const reason = readStringParam(p, 'notes');
                if (reason) updates.notes = reason;
              }
              const t = await mgr!.updateTask(agentId, id, updates);
              return t ? jsonResult({ updated: compactTask(t) }) : textResult('Task not found: ' + id);
            }
            case 'update': {
              const id = readStringParam(p, 'id', { required: true });
              const updates: any = {};
              const title = readStringParam(p, 'title'); if (title) updates.title = title;
              const notes = readStringParam(p, 'notes'); if (notes !== undefined && notes !== '') updates.notes = notes;
              const status = readStringParam(p, 'status'); if (status) updates.status = status;
              const priority = readStringParam(p, 'priority'); if (priority) updates.priority = priority;
              const due = readStringParam(p, 'due'); if (due) updates.due = due;
              const list = readStringParam(p, 'list'); if (list) updates.list = list;
              if (p.tags !== undefined) updates.tags = parseTags();
              const t = await mgr!.updateTask(agentId, id, updates);
              return t ? jsonResult({ updated: compactTask(t) }) : textResult('Task not found: ' + id);
            }
            case 'delete': {
              const id = readStringParam(p, 'id', { required: true });
              await mgr!.deleteTask(agentId, id);
              return textResult('Deleted task ' + id);
            }
            case 'clear_completed': {
              const n = await mgr!.clearCompleted(agentId, readStringParam(p, 'list') || undefined);
              return textResult('Cleared ' + n + ' completed task(s).');
            }
            case 'stats': {
              return jsonResult(await mgr!.getStats(agentId));
            }
            case 'lists': {
              return jsonResult({ lists: await mgr!.listLists(agentId) });
            }
            default:
              return errorResult('Unknown action: ' + action);
          }
        }

        // ── File-based fallback ──
        const store = await loadFile(filePath);
        const now = new Date().toISOString();
        const find = (id: string) => store.tasks.find((t) => t.id === id);
        switch (action) {
          case 'add': {
            const title = readStringParam(p, 'title', { required: true });
            const t: FileTask = {
              id: crypto.randomUUID(), title,
              list: readStringParam(p, 'list') || 'Tasks',
              notes: readStringParam(p, 'notes') || '',
              status: (readStringParam(p, 'status') as TaskStatus) || 'needs_action',
              priority: (readStringParam(p, 'priority') as TaskPriority) || 'normal',
              due: readStringParam(p, 'due') || null,
              parentId: readStringParam(p, 'parent') || null,
              tags: parseTags(), createdAt: now, updatedAt: now, completedAt: null,
            };
            store.tasks.push(t);
            await saveFile(filePath, store);
            return jsonResult({ created: t, id: t.id });
          }
          case 'list': {
            const listFilter = readStringParam(p, 'list');
            const statusFilter = readStringParam(p, 'status');
            const tagFilter = readStringParam(p, 'tag');
            let tasks = store.tasks.filter((t) => {
              if (listFilter && t.list !== listFilter) return false;
              if (statusFilter && t.status !== statusFilter) return false;
              if (!statusFilter && p.includeCompleted !== true && t.status === 'completed') return false;
              if (tagFilter && !(t.tags || []).includes(tagFilter)) return false;
              return true;
            });
            return jsonResult({ count: tasks.length, tasks });
          }
          case 'get': { const t = find(readStringParam(p, 'id', { required: true })); return t ? jsonResult(t) : textResult('Task not found'); }
          case 'start': case 'complete': case 'done': case 'reopen': case 'block': {
            const t = find(readStringParam(p, 'id', { required: true }));
            if (!t) return textResult('Task not found');
            const sm: Record<string, TaskStatus> = { start: 'in_progress', complete: 'completed', done: 'completed', reopen: 'needs_action', block: 'blocked' };
            t.status = sm[action]; t.updatedAt = now;
            if (action === 'block') { const r = readStringParam(p, 'notes'); if (r) t.notes = r; }
            t.completedAt = t.status === 'completed' ? now : null;
            await saveFile(filePath, store);
            return jsonResult({ updated: t });
          }
          case 'update': {
            const t = find(readStringParam(p, 'id', { required: true }));
            if (!t) return textResult('Task not found');
            const title = readStringParam(p, 'title'); if (title) t.title = title;
            const notes = readStringParam(p, 'notes'); if (notes) t.notes = notes;
            const status = readStringParam(p, 'status'); if (status) t.status = status as TaskStatus;
            const priority = readStringParam(p, 'priority'); if (priority) t.priority = priority as TaskPriority;
            const due = readStringParam(p, 'due'); if (due) t.due = due;
            const list = readStringParam(p, 'list'); if (list) t.list = list;
            if (p.tags !== undefined) t.tags = parseTags();
            t.updatedAt = now;
            await saveFile(filePath, store);
            return jsonResult({ updated: t });
          }
          case 'delete': {
            const id = readStringParam(p, 'id', { required: true });
            store.tasks = store.tasks.filter((t) => t.id !== id && t.parentId !== id);
            await saveFile(filePath, store);
            return textResult('Deleted task ' + id);
          }
          case 'clear_completed': {
            const listFilter = readStringParam(p, 'list');
            const before = store.tasks.length;
            store.tasks = store.tasks.filter((t) => !(t.status === 'completed' && (!listFilter || t.list === listFilter)));
            await saveFile(filePath, store);
            return textResult('Cleared ' + (before - store.tasks.length) + ' completed task(s).');
          }
          case 'stats': {
            const byStatus: Record<string, number> = {}; const byList: Record<string, number> = {};
            for (const t of store.tasks) { byStatus[t.status!] = (byStatus[t.status!] || 0) + 1; byList[t.list!] = (byList[t.list!] || 0) + 1; }
            return jsonResult({ total: store.tasks.length, byStatus, byList });
          }
          case 'lists': {
            return jsonResult({ lists: [...new Set(store.tasks.map((t) => t.list || 'Tasks'))] });
          }
          default:
            return errorResult('Unknown action: ' + action);
        }
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  };

  return [tool];
}
