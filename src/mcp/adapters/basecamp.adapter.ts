/**
 * MCP Skill Adapter — Basecamp
 *
 * Maps Basecamp 3 API endpoints to MCP tool handlers.
 * Covers project listing, to-do management, and message operations.
 *
 * Basecamp uses account-specific URLs (e.g. https://3.basecampapi.com/ACCOUNT_ID).
 * The actual account ID is resolved from skillConfig at runtime.
 *
 * Basecamp 3 API docs: https://github.com/basecamp/bc3-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Basecamp account base URL from skill config */
function basecampUrl(ctx: ToolExecutionContext): string {
  const accountId =
    ctx.skillConfig.accountId ||
    ctx.credentials.fields?.accountId ||
    '';
  if (!accountId) {
    throw new Error('Basecamp account ID is required. Set it in skillConfig.accountId.');
  }
  return `https://3.basecampapi.com/${accountId}`;
}

function basecampError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.error || data.message || err.message;
      return { content: `Basecamp API error: ${detail}`, isError: true };
    }
    return { content: `Basecamp API error: ${err.message}`, isError: true };
  }
  return { content: `Basecamp API error: ${String(err)}`, isError: true };
}

// ─── Tool: basecamp_list_projects ───────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects in the Basecamp account. Returns project names, descriptions, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'archived', 'trashed'],
        description: 'Filter by project status (default "active")',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = basecampUrl(ctx);
      const query: Record<string, string> = {};
      if (params.status) query.status = params.status;
      if (params.page) query.page = String(params.page);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/projects.json`,
        query,
      });

      const projects: any[] = Array.isArray(result) ? result : [];
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const desc = p.description ? ` — ${p.description.slice(0, 80)}` : '';
        return `${p.id}: ${p.name}${desc} (${p.status || 'active'})`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return basecampError(err);
    }
  },
};

// ─── Tool: basecamp_list_todos ──────────────────────────

const listTodos: ToolHandler = {
  description:
    'List to-dos in a Basecamp to-do list. Returns to-do titles, assignees, and completion status.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'The Basecamp project ID',
      },
      todolistId: {
        type: 'number',
        description: 'The to-do list ID within the project',
      },
      completed: {
        type: 'boolean',
        description: 'Filter by completion status (optional)',
      },
    },
    required: ['projectId', 'todolistId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = basecampUrl(ctx);
      const query: Record<string, string> = {};
      if (params.completed !== undefined) query.completed = String(params.completed);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/buckets/${params.projectId}/todolists/${params.todolistId}/todos.json`,
        query,
      });

      const todos: any[] = Array.isArray(result) ? result : [];
      if (todos.length === 0) {
        return { content: 'No to-dos found.' };
      }

      const lines = todos.map((t: any) => {
        const status = t.completed ? '[x]' : '[ ]';
        const assignees = (t.assignees || []).map((a: any) => a.name).join(', ') || 'unassigned';
        const due = t.due_on ? ` — due ${t.due_on}` : '';
        return `${status} ${t.title} (${assignees})${due}`;
      });

      return {
        content: `Found ${todos.length} to-dos:\n${lines.join('\n')}`,
        metadata: { count: todos.length, projectId: params.projectId, todolistId: params.todolistId },
      };
    } catch (err) {
      return basecampError(err);
    }
  },
};

// ─── Tool: basecamp_create_todo ─────────────────────────

const createTodo: ToolHandler = {
  description:
    'Create a new to-do in a Basecamp to-do list. Specify content, assignees, and optional due date.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'The Basecamp project ID',
      },
      todolistId: {
        type: 'number',
        description: 'The to-do list ID within the project',
      },
      content: {
        type: 'string',
        description: 'The to-do text content',
      },
      description: {
        type: 'string',
        description: 'Rich text description (HTML supported, optional)',
      },
      assignee_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of person IDs to assign (optional)',
      },
      due_on: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format (optional)',
      },
      notify: {
        type: 'boolean',
        description: 'Whether to notify assignees (default true)',
      },
    },
    required: ['projectId', 'todolistId', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = basecampUrl(ctx);

      const body: Record<string, any> = { content: params.content };
      if (params.description) body.description = params.description;
      if (params.assignee_ids?.length) body.assignee_ids = params.assignee_ids;
      if (params.due_on) body.due_on = params.due_on;
      if (params.notify !== undefined) body.notify = params.notify;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/buckets/${params.projectId}/todolists/${params.todolistId}/todos.json`,
        body,
      });

      return {
        content: `To-do created: "${result.title || result.content}" (ID: ${result.id})`,
        metadata: { id: result.id, projectId: params.projectId, todolistId: params.todolistId },
      };
    } catch (err) {
      return basecampError(err);
    }
  },
};

// ─── Tool: basecamp_list_messages ───────────────────────

const listMessages: ToolHandler = {
  description:
    'List messages (posts) in a Basecamp project message board. Returns titles, authors, and dates.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'The Basecamp project ID',
      },
      messageBoardId: {
        type: 'number',
        description: 'The message board ID within the project',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    required: ['projectId', 'messageBoardId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = basecampUrl(ctx);
      const query: Record<string, string> = {};
      if (params.page) query.page = String(params.page);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/buckets/${params.projectId}/message_boards/${params.messageBoardId}/messages.json`,
        query,
      });

      const messages: any[] = Array.isArray(result) ? result : [];
      if (messages.length === 0) {
        return { content: 'No messages found.' };
      }

      const lines = messages.map((m: any) => {
        const author = m.creator?.name || 'unknown';
        const date = m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : '';
        return `${m.id}: ${m.subject || m.title} — by ${author} (${date})`;
      });

      return {
        content: `Found ${messages.length} messages:\n${lines.join('\n')}`,
        metadata: { count: messages.length, projectId: params.projectId },
      };
    } catch (err) {
      return basecampError(err);
    }
  },
};

// ─── Tool: basecamp_create_message ──────────────────────

const createMessage: ToolHandler = {
  description:
    'Create a new message (post) on a Basecamp project message board.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'The Basecamp project ID',
      },
      messageBoardId: {
        type: 'number',
        description: 'The message board ID within the project',
      },
      subject: {
        type: 'string',
        description: 'Message subject/title',
      },
      content: {
        type: 'string',
        description: 'Message body (HTML supported)',
      },
      category_id: {
        type: 'number',
        description: 'Message category ID (optional)',
      },
    },
    required: ['projectId', 'messageBoardId', 'subject', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = basecampUrl(ctx);

      const body: Record<string, any> = {
        subject: params.subject,
        content: params.content,
        status: 'active',
      };
      if (params.category_id) body.category_id = params.category_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/buckets/${params.projectId}/message_boards/${params.messageBoardId}/messages.json`,
        body,
      });

      return {
        content: `Message created: "${result.subject || result.title}" (ID: ${result.id})`,
        metadata: { id: result.id, projectId: params.projectId },
      };
    } catch (err) {
      return basecampError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const basecampAdapter: SkillAdapter = {
  skillId: 'basecamp',
  name: 'Basecamp',
  // Base URL is dynamic per account; individual tools use full URLs from skillConfig
  baseUrl: 'https://3.basecampapi.com/ACCOUNT_ID',
  auth: {
    type: 'oauth2',
    provider: 'basecamp',
  },
  tools: {
    basecamp_list_projects: listProjects,
    basecamp_list_todos: listTodos,
    basecamp_create_todo: createTodo,
    basecamp_list_messages: listMessages,
    basecamp_create_message: createMessage,
  },
  configSchema: {
    accountId: {
      type: 'string' as const,
      label: 'Account ID',
      description: 'Your Basecamp account ID (found in your Basecamp URL)',
      required: true,
      placeholder: '1234567',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
