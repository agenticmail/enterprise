/**
 * MCP Skill Adapter — Todoist
 *
 * Maps Todoist REST API v2 endpoints to MCP tool handlers.
 * Provides task and project management capabilities.
 *
 * Todoist API docs: https://developer.todoist.com/rest/v2/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function todoistError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'string') {
      return { content: `Todoist API error: ${data}`, isError: true };
    }
    if (data && typeof data === 'object' && data.message) {
      return { content: `Todoist API error: ${data.message}`, isError: true };
    }
    return { content: `Todoist API error: ${err.message}`, isError: true };
  }
  return { content: `Todoist API error: ${String(err)}`, isError: true };
}

// ─── Tool: todoist_create_task ──────────────────────────

const createTask: ToolHandler = {
  description:
    'Create a new task in Todoist. Specify the content (title), and optionally a project, due date, priority, labels, and description.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Task title / content',
      },
      description: {
        type: 'string',
        description: 'Task description (supports Markdown)',
      },
      project_id: {
        type: 'string',
        description: 'Project ID to add the task to',
      },
      due_string: {
        type: 'string',
        description: 'Natural language due date (e.g. "tomorrow", "every friday", "Jan 25")',
      },
      due_date: {
        type: 'string',
        description: 'Specific due date in YYYY-MM-DD format',
      },
      priority: {
        type: 'number',
        enum: [1, 2, 3, 4],
        description: 'Task priority: 1 (normal) to 4 (urgent)',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label names to apply to the task',
      },
    },
    required: ['content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        content: params.content,
      };

      if (params.description) body.description = params.description;
      if (params.project_id) body.project_id = params.project_id;
      if (params.due_string) body.due_string = params.due_string;
      if (params.due_date) body.due_date = params.due_date;
      if (params.priority) body.priority = params.priority;
      if (params.labels?.length) body.labels = params.labels;

      const result = await ctx.apiExecutor.post('/tasks', body);

      const dueInfo = result.due?.date ? ` due ${result.due.date}` : '';
      const priorityInfo = result.priority > 1 ? ` [P${result.priority}]` : '';

      return {
        content: `Task created: "${result.content}" (ID: ${result.id})${priorityInfo}${dueInfo}`,
        metadata: {
          id: result.id,
          content: result.content,
          url: result.url,
          project_id: result.project_id,
        },
      };
    } catch (err) {
      return todoistError(err);
    }
  },
};

// ─── Tool: todoist_list_tasks ───────────────────────────

const listTasks: ToolHandler = {
  description:
    'List active tasks from Todoist. Filter by project, label, or a custom filter string.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Filter tasks by project ID',
      },
      label: {
        type: 'string',
        description: 'Filter tasks by label name',
      },
      filter: {
        type: 'string',
        description: 'Todoist filter query (e.g. "today", "overdue", "p1 & #Work")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};

      if (params.project_id) query.project_id = params.project_id;
      if (params.label) query.label = params.label;
      if (params.filter) query.filter = params.filter;

      const tasks: any[] = await ctx.apiExecutor.get('/tasks', query);

      if (tasks.length === 0) {
        return { content: 'No active tasks found matching the criteria.' };
      }

      const lines = tasks.map((t: any) => {
        const due = t.due?.date ? ` due ${t.due.date}` : '';
        const priority = t.priority > 1 ? ` [P${t.priority}]` : '';
        const labels = t.labels?.length ? ` {${t.labels.join(', ')}}` : '';
        return `${t.content} (${t.id})${priority}${due}${labels}`;
      });

      return {
        content: `Found ${tasks.length} tasks:\n${lines.join('\n')}`,
        metadata: { count: tasks.length },
      };
    } catch (err) {
      return todoistError(err);
    }
  },
};

// ─── Tool: todoist_close_task ───────────────────────────

const closeTask: ToolHandler = {
  description:
    'Close (complete) a Todoist task by its ID. The task will be marked as done.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to close',
      },
    },
    required: ['task_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      await ctx.apiExecutor.post(`/tasks/${params.task_id}/close`);

      return {
        content: `Task ${params.task_id} closed successfully.`,
        metadata: { task_id: params.task_id, completed: true },
      };
    } catch (err) {
      return todoistError(err);
    }
  },
};

// ─── Tool: todoist_list_projects ────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects in the Todoist account. Returns project names, IDs, and colors.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const projects: any[] = await ctx.apiExecutor.get('/projects');

      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const favorite = p.is_favorite ? ' [fav]' : '';
        const shared = p.is_shared ? ' [shared]' : '';
        return `${p.name} (${p.id})${favorite}${shared}`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return todoistError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const todoistAdapter: SkillAdapter = {
  skillId: 'todoist-tasks',
  name: 'Todoist',
  baseUrl: 'https://api.todoist.com/rest/v2',
  auth: {
    type: 'oauth2',
    provider: 'todoist',
    headerPrefix: 'Bearer',
  },
  tools: {
    todoist_create_task: createTask,
    todoist_list_tasks: listTasks,
    todoist_close_task: closeTask,
    todoist_list_projects: listProjects,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
