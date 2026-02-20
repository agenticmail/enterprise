/**
 * MCP Skill Adapter — Asana
 *
 * Maps Asana REST API endpoints to MCP tool handlers.
 * Provides task and project management capabilities.
 *
 * Asana API docs: https://developers.asana.com/reference/rest-api-reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function asanaError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: any[] = data.errors || [];
      if (errors.length > 0) {
        const messages = errors.map((e: any) => e.message || String(e));
        return { content: `Asana API error: ${messages.join('; ')}`, isError: true };
      }
    }
    return { content: `Asana API error: ${err.message}`, isError: true };
  }
  return { content: `Asana API error: ${String(err)}`, isError: true };
}

// ─── Tool: asana_create_task ────────────────────────────

const createTask: ToolHandler = {
  description:
    'Create a new task in Asana. Specify the workspace or project, task name, and optional details like assignee, due date, and notes.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Task name / title',
      },
      projects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of project GIDs to add this task to',
      },
      workspace: {
        type: 'string',
        description: 'Workspace GID (required if projects is not provided)',
      },
      assignee: {
        type: 'string',
        description: 'Assignee GID or email address',
      },
      due_on: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format',
      },
      notes: {
        type: 'string',
        description: 'Plain-text task description / notes',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const taskData: Record<string, any> = {
        name: params.name,
      };

      if (params.projects?.length) taskData.projects = params.projects;
      if (params.workspace) taskData.workspace = params.workspace;
      if (params.assignee) taskData.assignee = params.assignee;
      if (params.due_on) taskData.due_on = params.due_on;
      if (params.notes) taskData.notes = params.notes;

      const result = await ctx.apiExecutor.post('/tasks', { data: taskData });
      const task = result.data;

      const assigneeInfo = task.assignee ? ` (assigned to ${task.assignee.name || task.assignee.gid})` : '';
      const dueInfo = task.due_on ? ` due ${task.due_on}` : '';

      return {
        content: `Task created: "${task.name}" (GID: ${task.gid})${assigneeInfo}${dueInfo}`,
        metadata: {
          gid: task.gid,
          name: task.name,
          permalink_url: task.permalink_url,
        },
      };
    } catch (err) {
      return asanaError(err);
    }
  },
};

// ─── Tool: asana_list_tasks ─────────────────────────────

const listTasks: ToolHandler = {
  description:
    'List tasks from an Asana project or assigned to a user. Provide either a project GID or an assignee with a workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project GID to list tasks from',
      },
      assignee: {
        type: 'string',
        description: 'Assignee GID or "me" (requires workspace to be set)',
      },
      workspace: {
        type: 'string',
        description: 'Workspace GID (required when filtering by assignee)',
      },
      completed_since: {
        type: 'string',
        description: 'Only return tasks completed after this date (ISO 8601) or "now" for incomplete tasks only',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return (default 50)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 50),
        opt_fields: 'name,assignee.name,due_on,completed,permalink_url',
      };

      if (params.project) query.project = params.project;
      if (params.assignee) query.assignee = params.assignee;
      if (params.workspace) query.workspace = params.workspace;
      if (params.completed_since) query.completed_since = params.completed_since;

      const result = await ctx.apiExecutor.get('/tasks', query);
      const tasks: any[] = result.data || [];

      if (tasks.length === 0) {
        return { content: 'No tasks found matching the criteria.' };
      }

      const lines = tasks.map((t: any) => {
        const status = t.completed ? '[done]' : '[open]';
        const assignee = t.assignee?.name || 'Unassigned';
        const due = t.due_on ? ` due ${t.due_on}` : '';
        return `${status} ${t.name} (${t.gid}) -- ${assignee}${due}`;
      });

      return {
        content: `Found ${tasks.length} tasks:\n${lines.join('\n')}`,
        metadata: { count: tasks.length },
      };
    } catch (err) {
      return asanaError(err);
    }
  },
};

// ─── Tool: asana_update_task ────────────────────────────

const updateTask: ToolHandler = {
  description:
    'Update an existing Asana task. You can change the name, assignee, due date, completion status, or notes.',
  inputSchema: {
    type: 'object',
    properties: {
      task_gid: {
        type: 'string',
        description: 'GID of the task to update',
      },
      name: {
        type: 'string',
        description: 'New task name',
      },
      assignee: {
        type: 'string',
        description: 'New assignee GID or email',
      },
      due_on: {
        type: 'string',
        description: 'New due date (YYYY-MM-DD) or null to clear',
      },
      completed: {
        type: 'boolean',
        description: 'Mark task as complete (true) or incomplete (false)',
      },
      notes: {
        type: 'string',
        description: 'New plain-text description / notes',
      },
    },
    required: ['task_gid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const taskData: Record<string, any> = {};

      if (params.name !== undefined) taskData.name = params.name;
      if (params.assignee !== undefined) taskData.assignee = params.assignee;
      if (params.due_on !== undefined) taskData.due_on = params.due_on;
      if (params.completed !== undefined) taskData.completed = params.completed;
      if (params.notes !== undefined) taskData.notes = params.notes;

      const result = await ctx.apiExecutor.put(`/tasks/${params.task_gid}`, { data: taskData });
      const task = result.data;

      const changes: string[] = [];
      if (params.name !== undefined) changes.push(`name -> "${params.name}"`);
      if (params.assignee !== undefined) changes.push(`assignee -> ${params.assignee}`);
      if (params.due_on !== undefined) changes.push(`due -> ${params.due_on}`);
      if (params.completed !== undefined) changes.push(params.completed ? 'marked complete' : 'marked incomplete');
      if (params.notes !== undefined) changes.push('notes updated');

      return {
        content: `Task ${task.gid} updated: ${changes.join(', ')}`,
        metadata: {
          gid: task.gid,
          name: task.name,
          completed: task.completed,
        },
      };
    } catch (err) {
      return asanaError(err);
    }
  },
};

// ─── Tool: asana_list_projects ──────────────────────────

const listProjects: ToolHandler = {
  description:
    'List projects in an Asana workspace or team. Returns project names, GIDs, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Workspace GID to list projects from',
      },
      team: {
        type: 'string',
        description: 'Team GID to filter projects by team',
      },
      archived: {
        type: 'boolean',
        description: 'Include archived projects (default false)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of projects to return (default 50)',
      },
    },
    required: ['workspace'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        workspace: params.workspace,
        limit: String(params.limit ?? 50),
        opt_fields: 'name,archived,color,current_status.title,current_status.color',
      };

      if (params.team) query.team = params.team;
      if (params.archived !== undefined) query.archived = String(params.archived);

      const result = await ctx.apiExecutor.get('/projects', query);
      const projects: any[] = result.data || [];

      if (projects.length === 0) {
        return { content: 'No projects found in this workspace.' };
      }

      const lines = projects.map((p: any) => {
        const archived = p.archived ? ' [archived]' : '';
        const status = p.current_status?.title ? ` -- ${p.current_status.title}` : '';
        return `${p.name} (${p.gid})${archived}${status}`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return asanaError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const asanaAdapter: SkillAdapter = {
  skillId: 'asana-tasks',
  name: 'Asana',
  baseUrl: 'https://app.asana.com/api/1.0',
  auth: {
    type: 'oauth2',
    provider: 'asana',
    headerPrefix: 'Bearer',
  },
  tools: {
    asana_create_task: createTask,
    asana_list_tasks: listTasks,
    asana_update_task: updateTask,
    asana_list_projects: listProjects,
  },
  rateLimits: { requestsPerSecond: 1, burstLimit: 10 },
};
