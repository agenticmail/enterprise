/**
 * MCP Skill Adapter — Wrike
 *
 * Maps Wrike API v4 endpoints to MCP tool handlers.
 * Covers task listing, creation, updating, and folder/project browsing.
 *
 * Wrike API docs: https://developers.wrike.com/api/v4
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function wrikeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.errorDescription || data.error || err.message;
      return { content: `Wrike API error: ${detail}`, isError: true };
    }
    return { content: `Wrike API error: ${err.message}`, isError: true };
  }
  return { content: `Wrike API error: ${String(err)}`, isError: true };
}

// ─── Tool: wrike_list_tasks ─────────────────────────────

const listTasks: ToolHandler = {
  description:
    'List tasks in Wrike. Optionally filter by folder, status, or custom fields.',
  inputSchema: {
    type: 'object',
    properties: {
      folderId: {
        type: 'string',
        description: 'Folder or project ID to list tasks from (optional — omit for all tasks)',
      },
      status: {
        type: 'string',
        enum: ['Active', 'Completed', 'Deferred', 'Cancelled'],
        description: 'Filter by task status (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return (default 100)',
      },
      sortField: {
        type: 'string',
        enum: ['CreatedDate', 'UpdatedDate', 'CompletedDate', 'DueDate', 'Status'],
        description: 'Field to sort by (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        pageSize: String(params.limit ?? 100),
      };
      if (params.status) query.status = params.status;
      if (params.sortField) query.sortField = params.sortField;

      const path = params.folderId
        ? `/folders/${params.folderId}/tasks`
        : '/tasks';

      const result = await ctx.apiExecutor.get(path, query);

      const tasks: any[] = result.data || [];
      if (tasks.length === 0) {
        return { content: 'No tasks found.' };
      }

      const lines = tasks.map((t: any) => {
        const assignees = (t.responsibleIds || []).length;
        const status = t.status || 'unknown';
        const due = t.dates?.due || 'no due date';
        return `${t.id}: ${t.title} [${status}] — ${assignees} assignee(s) — due: ${due}`;
      });

      return {
        content: `Found ${tasks.length} tasks:\n${lines.join('\n')}`,
        metadata: { count: tasks.length },
      };
    } catch (err) {
      return wrikeError(err);
    }
  },
};

// ─── Tool: wrike_create_task ────────────────────────────

const createTask: ToolHandler = {
  description:
    'Create a new task in a Wrike folder or project. Specify title, description, assignees, and dates.',
  inputSchema: {
    type: 'object',
    properties: {
      folderId: {
        type: 'string',
        description: 'Folder or project ID to create the task in',
      },
      title: {
        type: 'string',
        description: 'Task title',
      },
      description: {
        type: 'string',
        description: 'Task description (optional)',
      },
      status: {
        type: 'string',
        enum: ['Active', 'Completed', 'Deferred', 'Cancelled'],
        description: 'Initial task status (default "Active")',
      },
      responsibles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of user IDs to assign (optional)',
      },
      dates: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          due: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        },
        description: 'Task dates (optional)',
      },
      priority: {
        type: 'string',
        enum: ['High', 'Normal', 'Low'],
        description: 'Task priority (optional)',
      },
    },
    required: ['folderId', 'title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { title: params.title };
      if (params.description) body.description = params.description;
      if (params.status) body.status = params.status;
      if (params.responsibles?.length) body.responsibles = params.responsibles;
      if (params.dates) body.dates = params.dates;
      if (params.priority) body.priority = params.priority;

      const result = await ctx.apiExecutor.post(`/folders/${params.folderId}/tasks`, body);

      const task = result.data?.[0] || result;

      return {
        content: `Task created: ${task.title} (ID: ${task.id})\nPermalink: ${task.permalink || 'N/A'}`,
        metadata: { id: task.id, title: task.title, permalink: task.permalink },
      };
    } catch (err) {
      return wrikeError(err);
    }
  },
};

// ─── Tool: wrike_list_folders ───────────────────────────

const listFolders: ToolHandler = {
  description:
    'List folders and projects in Wrike. Optionally filter within a specific parent folder.',
  inputSchema: {
    type: 'object',
    properties: {
      folderId: {
        type: 'string',
        description: 'Parent folder ID to list children of (optional — omit for root folders)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const path = params.folderId
        ? `/folders/${params.folderId}/folders`
        : '/folders';

      const result = await ctx.apiExecutor.get(path);

      const folders: any[] = result.data || [];
      if (folders.length === 0) {
        return { content: 'No folders found.' };
      }

      const lines = folders.map((f: any) => {
        const scope = f.scope || '';
        const childCount = f.childIds?.length ?? 0;
        return `${f.id}: ${f.title}${scope ? ` [${scope}]` : ''} — ${childCount} children`;
      });

      return {
        content: `Found ${folders.length} folders:\n${lines.join('\n')}`,
        metadata: { count: folders.length },
      };
    } catch (err) {
      return wrikeError(err);
    }
  },
};

// ─── Tool: wrike_list_projects ──────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects in Wrike. Returns project names, statuses, and owner info.',
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'Space ID to filter projects (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const path = params.spaceId
        ? `/spaces/${params.spaceId}/folders`
        : '/folders';

      const query: Record<string, string> = { project: 'true' };

      const result = await ctx.apiExecutor.get(path, query);

      const projects: any[] = (result.data || []).filter((f: any) => f.project);
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const status = p.project?.status || 'unknown';
        const owner = p.project?.ownerIds?.length ? `${p.project.ownerIds.length} owner(s)` : 'no owner';
        return `${p.id}: ${p.title} [${status}] — ${owner}`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return wrikeError(err);
    }
  },
};

// ─── Tool: wrike_update_task ────────────────────────────

const updateTask: ToolHandler = {
  description:
    'Update an existing Wrike task. Change title, description, status, assignees, or dates.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The Wrike task ID to update',
      },
      title: {
        type: 'string',
        description: 'New task title',
      },
      description: {
        type: 'string',
        description: 'New task description',
      },
      status: {
        type: 'string',
        enum: ['Active', 'Completed', 'Deferred', 'Cancelled'],
        description: 'New task status',
      },
      addResponsibles: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs to add as assignees',
      },
      removeResponsibles: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs to remove from assignees',
      },
      dates: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          due: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        },
        description: 'Updated task dates',
      },
      priority: {
        type: 'string',
        enum: ['High', 'Normal', 'Low'],
        description: 'New task priority',
      },
    },
    required: ['taskId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.title !== undefined) body.title = params.title;
      if (params.description !== undefined) body.description = params.description;
      if (params.status !== undefined) body.status = params.status;
      if (params.addResponsibles?.length) body.addResponsibles = params.addResponsibles;
      if (params.removeResponsibles?.length) body.removeResponsibles = params.removeResponsibles;
      if (params.dates) body.dates = params.dates;
      if (params.priority !== undefined) body.priority = params.priority;

      const result = await ctx.apiExecutor.put(`/tasks/${params.taskId}`, body);

      const task = result.data?.[0] || result;

      return {
        content: `Task ${task.id} updated: ${task.title} [${task.status || 'unknown'}]`,
        metadata: { id: task.id, title: task.title, status: task.status },
      };
    } catch (err) {
      return wrikeError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const wrikeAdapter: SkillAdapter = {
  skillId: 'wrike',
  name: 'Wrike',
  baseUrl: 'https://www.wrike.com/api/v4',
  auth: {
    type: 'oauth2',
    provider: 'wrike',
  },
  tools: {
    wrike_list_tasks: listTasks,
    wrike_create_task: createTask,
    wrike_list_folders: listFolders,
    wrike_list_projects: listProjects,
    wrike_update_task: updateTask,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
