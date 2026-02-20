/**
 * MCP Skill Adapter — Teamwork
 *
 * Maps Teamwork API v3 endpoints to MCP tool handlers.
 * Covers project listing, task management, milestones, and time logging.
 *
 * Teamwork uses site-specific URLs (e.g. https://SITE.teamwork.com/projects/api/v3).
 * The actual site name is resolved from skillConfig at runtime.
 *
 * Teamwork API docs: https://apidocs.teamwork.com/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Teamwork site base URL from skill config */
function teamworkUrl(ctx: ToolExecutionContext): string {
  const siteName =
    ctx.skillConfig.siteName ||
    ctx.credentials.fields?.siteName ||
    '';
  if (!siteName) {
    throw new Error('Teamwork site name is required. Set it in skillConfig.siteName.');
  }
  return `https://${siteName}.teamwork.com/projects/api/v3`;
}

function teamworkError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.MESSAGE || data.message || data.error || err.message;
      return { content: `Teamwork API error: ${detail}`, isError: true };
    }
    return { content: `Teamwork API error: ${err.message}`, isError: true };
  }
  return { content: `Teamwork API error: ${String(err)}`, isError: true };
}

// ─── Tool: teamwork_list_projects ───────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects in the Teamwork account. Returns project names, statuses, and company info.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'completed', 'cancelled', 'late', 'all'],
        description: 'Filter by project status (default "active")',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      pageSize: {
        type: 'number',
        description: 'Results per page (default 50)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = teamworkUrl(ctx);
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        pageSize: String(params.pageSize ?? 50),
      };
      if (params.status) query['projectStatuses'] = params.status;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/projects.json`,
        query,
      });

      const projects: any[] = result.projects || [];
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const company = p.company?.name || 'no company';
        const status = p.status || 'active';
        return `${p.id}: ${p.name} [${status}] — ${company}`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return teamworkError(err);
    }
  },
};

// ─── Tool: teamwork_list_tasks ──────────────────────────

const listTasks: ToolHandler = {
  description:
    'List tasks in a Teamwork project or tasklist. Returns task names, assignees, and due dates.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'Project ID to list tasks from (optional — omit for all tasks)',
      },
      tasklistId: {
        type: 'number',
        description: 'Tasklist ID to list tasks from (optional)',
      },
      includeCompletedTasks: {
        type: 'boolean',
        description: 'Whether to include completed tasks (default false)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      pageSize: {
        type: 'number',
        description: 'Results per page (default 50)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = teamworkUrl(ctx);

      let path: string;
      if (params.tasklistId) {
        path = `${baseUrl}/tasklists/${params.tasklistId}/tasks.json`;
      } else if (params.projectId) {
        path = `${baseUrl}/projects/${params.projectId}/tasks.json`;
      } else {
        path = `${baseUrl}/tasks.json`;
      }

      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        pageSize: String(params.pageSize ?? 50),
      };
      if (params.includeCompletedTasks) query.includeCompletedTasks = 'true';

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: path,
        query,
      });

      const tasks: any[] = result.tasks || result['todo-items'] || [];
      if (tasks.length === 0) {
        return { content: 'No tasks found.' };
      }

      const lines = tasks.map((t: any) => {
        const assignees = (t['responsible-party-names'] || t.assignees?.map((a: any) => a.name).join(', ') || 'unassigned');
        const due = t['due-date'] || t.dueDate || 'no due date';
        const completed = t.completed ? ' [done]' : '';
        return `${t.id}: ${t.name || t.content}${completed} — ${assignees} — due: ${due}`;
      });

      return {
        content: `Found ${tasks.length} tasks:\n${lines.join('\n')}`,
        metadata: { count: tasks.length },
      };
    } catch (err) {
      return teamworkError(err);
    }
  },
};

// ─── Tool: teamwork_create_task ─────────────────────────

const createTask: ToolHandler = {
  description:
    'Create a new task in a Teamwork tasklist. Specify name, description, assignees, and due date.',
  inputSchema: {
    type: 'object',
    properties: {
      tasklistId: {
        type: 'number',
        description: 'Tasklist ID to create the task in',
      },
      name: {
        type: 'string',
        description: 'Task name/content',
      },
      description: {
        type: 'string',
        description: 'Task description (optional)',
      },
      responsiblePartyIds: {
        type: 'string',
        description: 'Comma-separated user IDs to assign (optional)',
      },
      dueDate: {
        type: 'string',
        description: 'Due date in YYYYMMDD format (optional)',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Task priority (optional)',
      },
      startDate: {
        type: 'string',
        description: 'Start date in YYYYMMDD format (optional)',
      },
    },
    required: ['tasklistId', 'name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = teamworkUrl(ctx);

      const todoItem: Record<string, any> = {
        content: params.name,
      };
      if (params.description) todoItem.description = params.description;
      if (params.responsiblePartyIds) todoItem['responsible-party-ids'] = params.responsiblePartyIds;
      if (params.dueDate) todoItem['due-date'] = params.dueDate;
      if (params.priority) todoItem.priority = params.priority;
      if (params.startDate) todoItem['start-date'] = params.startDate;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/tasklists/${params.tasklistId}/tasks.json`,
        body: { 'todo-item': todoItem },
      });

      const taskId = result.id || result.taskId || 'unknown';

      return {
        content: `Task created: "${params.name}" (ID: ${taskId}) in tasklist ${params.tasklistId}`,
        metadata: { id: taskId, tasklistId: params.tasklistId },
      };
    } catch (err) {
      return teamworkError(err);
    }
  },
};

// ─── Tool: teamwork_list_milestones ─────────────────────

const listMilestones: ToolHandler = {
  description:
    'List milestones in a Teamwork project. Returns milestone names, deadlines, and completion status.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'Project ID to list milestones from',
      },
      status: {
        type: 'string',
        enum: ['active', 'completed', 'late', 'all'],
        description: 'Filter by milestone status (default "all")',
      },
    },
    required: ['projectId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = teamworkUrl(ctx);
      const query: Record<string, string> = {};
      if (params.status && params.status !== 'all') query.status = params.status;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/projects/${params.projectId}/milestones.json`,
        query,
      });

      const milestones: any[] = result.milestones || [];
      if (milestones.length === 0) {
        return { content: `No milestones found in project ${params.projectId}.` };
      }

      const lines = milestones.map((m: any) => {
        const completed = m.completed ? ' [completed]' : '';
        const deadline = m.deadline || 'no deadline';
        const responsible = m['responsible-party-names'] || 'unassigned';
        return `${m.id}: ${m.title}${completed} — deadline: ${deadline} — ${responsible}`;
      });

      return {
        content: `Found ${milestones.length} milestones:\n${lines.join('\n')}`,
        metadata: { count: milestones.length, projectId: params.projectId },
      };
    } catch (err) {
      return teamworkError(err);
    }
  },
};

// ─── Tool: teamwork_log_time ────────────────────────────

const logTime: ToolHandler = {
  description:
    'Log time against a Teamwork task. Specify hours, minutes, date, and an optional description.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'number',
        description: 'Task ID to log time against',
      },
      hours: {
        type: 'number',
        description: 'Number of hours logged',
      },
      minutes: {
        type: 'number',
        description: 'Number of minutes logged (0-59)',
      },
      date: {
        type: 'string',
        description: 'Date of the time entry in YYYYMMDD format',
      },
      description: {
        type: 'string',
        description: 'Description of work performed (optional)',
      },
      isBillable: {
        type: 'boolean',
        description: 'Whether the time is billable (default false)',
      },
    },
    required: ['taskId', 'hours', 'date'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = teamworkUrl(ctx);

      const timeEntry: Record<string, any> = {
        hours: String(params.hours),
        minutes: String(params.minutes ?? 0),
        date: params.date,
      };
      if (params.description) timeEntry.description = params.description;
      if (params.isBillable !== undefined) timeEntry.isBillable = params.isBillable ? '1' : '0';

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/tasks/${params.taskId}/time_entries.json`,
        body: { 'time-entry': timeEntry },
      });

      const entryId = result.timeLogId || result.id || 'unknown';
      const totalTime = `${params.hours}h ${params.minutes ?? 0}m`;

      return {
        content: `Time logged: ${totalTime} on task ${params.taskId} (entry ID: ${entryId})`,
        metadata: { entryId, taskId: params.taskId, hours: params.hours, minutes: params.minutes ?? 0 },
      };
    } catch (err) {
      return teamworkError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const teamworkAdapter: SkillAdapter = {
  skillId: 'teamwork',
  name: 'Teamwork',
  // Base URL is dynamic per site; individual tools use full URLs from skillConfig
  baseUrl: 'https://SITE.teamwork.com/projects/api/v3',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    teamwork_list_projects: listProjects,
    teamwork_list_tasks: listTasks,
    teamwork_create_task: createTask,
    teamwork_list_milestones: listMilestones,
    teamwork_log_time: logTime,
  },
  configSchema: {
    siteName: {
      type: 'string' as const,
      label: 'Teamwork Site',
      description: 'Your Teamwork site name (the subdomain in your Teamwork URL)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
