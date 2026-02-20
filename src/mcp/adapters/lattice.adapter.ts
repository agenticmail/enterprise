/**
 * MCP Skill Adapter — Lattice Performance
 *
 * Maps Lattice API v1 endpoints to MCP tool handlers.
 * Covers users, goals, reviews, and feedback management.
 *
 * Lattice API docs: https://developer.lattice.com/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function latticeError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      const errors = Array.isArray(data.errors)
        ? ` -- ${data.errors.map((e: any) => e.message || String(e)).join('; ')}`
        : '';
      return { content: `Lattice API error: ${msg}${errors}`, isError: true };
    }
    return { content: `Lattice API error: ${err.message}`, isError: true };
  }
  return { content: `Lattice API error: ${String(err)}`, isError: true };
}

/** Format a Lattice user for display */
function formatUser(user: any): string {
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = user.email || '(no email)';
  const title = user.jobTitle || '';
  const titlePart = title ? ` (${title})` : '';
  const dept = user.department || '';
  const deptPart = dept ? ` -- ${dept}` : '';
  return `${name} <${email}>${titlePart}${deptPart} (ID: ${user.id})`;
}

/** Format a Lattice goal for display */
function formatGoal(goal: any): string {
  const title = goal.title || goal.name || '(untitled)';
  const status = goal.status || 'N/A';
  const progress = goal.progress !== undefined ? `${Math.round(goal.progress * 100)}%` : 'N/A';
  const owner = goal.owner?.name || 'N/A';
  const dueDate = goal.dueDate ? goal.dueDate.slice(0, 10) : 'N/A';
  return `${title} -- Status: ${status} -- Progress: ${progress} -- Owner: ${owner} -- Due: ${dueDate} (ID: ${goal.id})`;
}

// ─── Tool: lattice_list_users ───────────────────────────

const listUsers: ToolHandler = {
  description:
    'List users from Lattice. Returns names, emails, titles, and department information.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of users to return (default 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      status: {
        type: 'string',
        enum: ['active', 'deactivated'],
        description: 'Filter by user status (default: active)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 50),
        offset: String(params.offset ?? 0),
      };
      if (params.status) query.status = params.status;

      const result = await ctx.apiExecutor.get('/users', query);

      const users: any[] = result.data || (Array.isArray(result) ? result : []);
      if (users.length === 0) {
        return { content: 'No users found.' };
      }

      const lines = users.map((u: any) => formatUser(u));

      return {
        content: `Found ${users.length} users:\n${lines.join('\n')}`,
        metadata: { count: users.length },
      };
    } catch (err) {
      return latticeError(err);
    }
  },
};

// ─── Tool: lattice_get_user ─────────────────────────────

const getUser: ToolHandler = {
  description:
    'Get detailed information about a specific Lattice user by their ID.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'The Lattice user ID',
      },
    },
    required: ['user_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/users/${params.user_id}`);

      const user = result.data || result;
      const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || '(no name)';

      const details = [
        `Name: ${name}`,
        `Email: ${user.email || 'N/A'}`,
        `Job Title: ${user.jobTitle || 'N/A'}`,
        `Department: ${user.department || 'N/A'}`,
        `Manager: ${user.manager?.name || 'N/A'}`,
        `Start Date: ${user.startDate || 'N/A'}`,
        `Status: ${user.status || 'N/A'}`,
        `Location: ${user.location || 'N/A'}`,
        `Bio: ${user.bio || 'N/A'}`,
      ].join('\n');

      return {
        content: `User Details:\n${details}`,
        metadata: {
          userId: params.user_id,
          name,
          email: user.email,
        },
      };
    } catch (err) {
      return latticeError(err);
    }
  },
};

// ─── Tool: lattice_list_goals ───────────────────────────

const listGoals: ToolHandler = {
  description:
    'List goals from Lattice. Optionally filter by owner, status, or time period.',
  inputSchema: {
    type: 'object',
    properties: {
      owner_id: {
        type: 'string',
        description: 'Filter goals by owner user ID',
      },
      status: {
        type: 'string',
        enum: ['on_track', 'behind', 'at_risk', 'completed', 'not_started'],
        description: 'Filter by goal status',
      },
      time_period_id: {
        type: 'string',
        description: 'Filter by time period ID (e.g. a specific quarter)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of goals to return (default 25)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.owner_id) query.owner_id = params.owner_id;
      if (params.status) query.status = params.status;
      if (params.time_period_id) query.time_period_id = params.time_period_id;

      const result = await ctx.apiExecutor.get('/goals', query);

      const goals: any[] = result.data || (Array.isArray(result) ? result : []);
      if (goals.length === 0) {
        return { content: 'No goals found.' };
      }

      const lines = goals.map((g: any) => formatGoal(g));

      return {
        content: `Found ${goals.length} goals:\n${lines.join('\n')}`,
        metadata: { count: goals.length },
      };
    } catch (err) {
      return latticeError(err);
    }
  },
};

// ─── Tool: lattice_list_reviews ─────────────────────────

const listReviews: ToolHandler = {
  description:
    'List performance review cycles from Lattice. Returns review cycle names, statuses, and date ranges.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'completed', 'draft', 'upcoming'],
        description: 'Filter by review cycle status',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of review cycles to return (default 20)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.status) query.status = params.status;

      const result = await ctx.apiExecutor.get('/reviews', query);

      const reviews: any[] = result.data || (Array.isArray(result) ? result : []);
      if (reviews.length === 0) {
        return { content: 'No review cycles found.' };
      }

      const lines = reviews.map((r: any) => {
        const name = r.name || r.title || '(unnamed)';
        const status = r.status || 'N/A';
        const start = r.startDate ? r.startDate.slice(0, 10) : 'N/A';
        const end = r.endDate ? r.endDate.slice(0, 10) : 'N/A';
        const participants = r.participantCount ?? r.participants?.length ?? 'N/A';
        return `${name} -- ${status} -- ${start} to ${end} -- Participants: ${participants} (ID: ${r.id})`;
      });

      return {
        content: `Found ${reviews.length} review cycles:\n${lines.join('\n')}`,
        metadata: { count: reviews.length },
      };
    } catch (err) {
      return latticeError(err);
    }
  },
};

// ─── Tool: lattice_get_feedback ─────────────────────────

const getFeedback: ToolHandler = {
  description:
    'Get feedback entries from Lattice. Optionally filter by recipient or giver.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'Filter feedback received by this user ID',
      },
      giver_id: {
        type: 'string',
        description: 'Filter feedback given by this user ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of feedback entries to return (default 20)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.user_id) query.recipient_id = params.user_id;
      if (params.giver_id) query.giver_id = params.giver_id;

      const result = await ctx.apiExecutor.get('/feedback', query);

      const feedbackList: any[] = result.data || (Array.isArray(result) ? result : []);
      if (feedbackList.length === 0) {
        return { content: 'No feedback entries found.' };
      }

      const lines = feedbackList.map((fb: any) => {
        const from = fb.giver?.name || fb.giverName || 'Anonymous';
        const to = fb.recipient?.name || fb.recipientName || 'N/A';
        const date = fb.createdAt ? fb.createdAt.slice(0, 10) : 'N/A';
        const preview = fb.body
          ? fb.body.length > 80 ? fb.body.slice(0, 80) + '...' : fb.body
          : '(no content)';
        return `${from} -> ${to} (${date}): ${preview}`;
      });

      return {
        content: `Found ${feedbackList.length} feedback entries:\n${lines.join('\n')}`,
        metadata: { count: feedbackList.length },
      };
    } catch (err) {
      return latticeError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const latticeAdapter: SkillAdapter = {
  skillId: 'lattice',
  name: 'Lattice Performance',
  baseUrl: 'https://api.latticehq.com/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    lattice_list_users: listUsers,
    lattice_get_user: getUser,
    lattice_list_goals: listGoals,
    lattice_list_reviews: listReviews,
    lattice_get_feedback: getFeedback,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
