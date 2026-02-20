/**
 * MCP Skill Adapter — ClickUp
 *
 * Maps ClickUp API v2 endpoints to MCP tool handlers.
 * Covers task listing, creation, updating, and space/list browsing.
 *
 * ClickUp API docs: https://clickup.com/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function clickupError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.err || data.error || data.ECODE || err.message;
      return { content: `ClickUp API error: ${detail}`, isError: true };
    }
    return { content: `ClickUp API error: ${err.message}`, isError: true };
  }
  return { content: `ClickUp API error: ${String(err)}`, isError: true };
}

// ─── Tool: clickup_list_tasks ───────────────────────────

const listTasks: ToolHandler = {
  description:
    'List tasks in a ClickUp list. Filter by status, assignees, and due dates.',
  inputSchema: {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'The ClickUp list ID to fetch tasks from',
      },
      statuses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by task statuses (e.g. ["Open", "In Progress"])',
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by assignee user IDs',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 0)',
      },
      include_closed: {
        type: 'boolean',
        description: 'Whether to include closed tasks (default false)',
      },
    },
    required: ['listId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 0),
      };
      if (params.include_closed) query.include_closed = 'true';
      if (params.statuses?.length) {
        params.statuses.forEach((s: string, i: number) => {
          query[`statuses[]`] = s; // ClickUp expects repeated params
        });
      }

      const result = await ctx.apiExecutor.get(`/list/${params.listId}/task`, query);

      const tasks: any[] = result.tasks || [];
      if (tasks.length === 0) {
        return { content: `No tasks found in list ${params.listId}.` };
      }

      const lines = tasks.map((t: any) => {
        const assignees = (t.assignees || []).map((a: any) => a.username || a.email).join(', ') || 'unassigned';
        const dueDate = t.due_date ? new Date(parseInt(t.due_date)).toISOString().slice(0, 10) : 'no due date';
        return `${t.id}: ${t.name} [${t.status?.status || 'unknown'}] — ${assignees} — ${dueDate}`;
      });

      return {
        content: `Found ${tasks.length} tasks:\n${lines.join('\n')}`,
        metadata: { count: tasks.length, listId: params.listId },
      };
    } catch (err) {
      return clickupError(err);
    }
  },
};

// ─── Tool: clickup_create_task ──────────────────────────

const createTask: ToolHandler = {
  description:
    'Create a new task in a ClickUp list. Specify name, description, assignees, priority, and due date.',
  inputSchema: {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'The ClickUp list ID to create the task in',
      },
      name: {
        type: 'string',
        description: 'Task name',
      },
      description: {
        type: 'string',
        description: 'Task description (supports markdown)',
      },
      assignees: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of user IDs to assign',
      },
      priority: {
        type: 'number',
        description: 'Priority: 1=urgent, 2=high, 3=normal, 4=low (optional)',
      },
      due_date: {
        type: 'number',
        description: 'Due date as Unix timestamp in milliseconds (optional)',
      },
      status: {
        type: 'string',
        description: 'Initial task status (optional)',
      },
    },
    required: ['listId', 'name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { name: params.name };
      if (params.description) body.description = params.description;
      if (params.assignees?.length) body.assignees = params.assignees;
      if (params.priority !== undefined) body.priority = params.priority;
      if (params.due_date) body.due_date = params.due_date;
      if (params.status) body.status = params.status;

      const result = await ctx.apiExecutor.post(`/list/${params.listId}/task`, body);

      return {
        content: `Task created: ${result.name} (ID: ${result.id})\nURL: ${result.url}`,
        metadata: { id: result.id, name: result.name, url: result.url, listId: params.listId },
      };
    } catch (err) {
      return clickupError(err);
    }
  },
};

// ─── Tool: clickup_update_task ──────────────────────────

const updateTask: ToolHandler = {
  description:
    'Update an existing ClickUp task. Change name, status, priority, description, assignees, or due date.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ClickUp task ID to update',
      },
      name: {
        type: 'string',
        description: 'New task name',
      },
      description: {
        type: 'string',
        description: 'New task description',
      },
      status: {
        type: 'string',
        description: 'New task status (e.g. "In Progress", "Closed")',
      },
      priority: {
        type: 'number',
        description: 'New priority: 1=urgent, 2=high, 3=normal, 4=low',
      },
      due_date: {
        type: 'number',
        description: 'New due date as Unix timestamp in milliseconds',
      },
    },
    required: ['taskId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.name !== undefined) body.name = params.name;
      if (params.description !== undefined) body.description = params.description;
      if (params.status !== undefined) body.status = params.status;
      if (params.priority !== undefined) body.priority = params.priority;
      if (params.due_date !== undefined) body.due_date = params.due_date;

      const result = await ctx.apiExecutor.put(`/task/${params.taskId}`, body);

      return {
        content: `Task ${result.id} updated: ${result.name} [${result.status?.status || 'unknown'}]`,
        metadata: { id: result.id, name: result.name, status: result.status?.status },
      };
    } catch (err) {
      return clickupError(err);
    }
  },
};

// ─── Tool: clickup_list_spaces ──────────────────────────

const listSpaces: ToolHandler = {
  description:
    'List all spaces in a ClickUp team/workspace. Returns space names, IDs, and feature settings.',
  inputSchema: {
    type: 'object',
    properties: {
      teamId: {
        type: 'string',
        description: 'The ClickUp team (workspace) ID',
      },
    },
    required: ['teamId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/team/${params.teamId}/space`);

      const spaces: any[] = result.spaces || [];
      if (spaces.length === 0) {
        return { content: `No spaces found in team ${params.teamId}.` };
      }

      const lines = spaces.map((s: any) => {
        const features: string[] = [];
        if (s.features?.due_dates?.enabled) features.push('due dates');
        if (s.features?.time_tracking?.enabled) features.push('time tracking');
        if (s.features?.tags?.enabled) features.push('tags');
        const featureStr = features.length > 0 ? ` (${features.join(', ')})` : '';
        return `${s.id}: ${s.name}${featureStr}`;
      });

      return {
        content: `Found ${spaces.length} spaces:\n${lines.join('\n')}`,
        metadata: { count: spaces.length, teamId: params.teamId },
      };
    } catch (err) {
      return clickupError(err);
    }
  },
};

// ─── Tool: clickup_list_lists ───────────────────────────

const listLists: ToolHandler = {
  description:
    'List all lists within a ClickUp folder or space. Returns list names, IDs, and task counts.',
  inputSchema: {
    type: 'object',
    properties: {
      folderId: {
        type: 'string',
        description: 'The ClickUp folder ID (use this to list folder lists)',
      },
      spaceId: {
        type: 'string',
        description: 'The ClickUp space ID (use this to list folderless lists)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      let path: string;
      let contextLabel: string;

      if (params.folderId) {
        path = `/folder/${params.folderId}/list`;
        contextLabel = `folder ${params.folderId}`;
      } else if (params.spaceId) {
        path = `/space/${params.spaceId}/list`;
        contextLabel = `space ${params.spaceId}`;
      } else {
        return { content: 'Either folderId or spaceId is required.', isError: true };
      }

      const result = await ctx.apiExecutor.get(path);

      const lists: any[] = result.lists || [];
      if (lists.length === 0) {
        return { content: `No lists found in ${contextLabel}.` };
      }

      const lines = lists.map((l: any) => {
        const taskCount = l.task_count ?? '?';
        return `${l.id}: ${l.name} — ${taskCount} tasks`;
      });

      return {
        content: `Found ${lists.length} lists in ${contextLabel}:\n${lines.join('\n')}`,
        metadata: { count: lists.length },
      };
    } catch (err) {
      return clickupError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const clickupAdapter: SkillAdapter = {
  skillId: 'clickup',
  name: 'ClickUp',
  baseUrl: 'https://api.clickup.com/api/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    clickup_list_tasks: listTasks,
    clickup_create_task: createTask,
    clickup_update_task: updateTask,
    clickup_list_spaces: listSpaces,
    clickup_list_lists: listLists,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
