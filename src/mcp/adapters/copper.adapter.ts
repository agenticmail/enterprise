/**
 * MCP Skill Adapter — Copper CRM
 *
 * Maps Copper CRM (formerly ProsperWorks) API v1 endpoints to MCP tool handlers.
 * Copper requires both an API key (X-PW-AccessToken) and the user email
 * (X-PW-UserEmail) in headers on every request.
 *
 * Copper API docs: https://developer.copper.com/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Build extra headers Copper requires (user email) */
function copperHeaders(ctx: ToolExecutionContext): Record<string, string> {
  const userEmail = ctx.skillConfig.userEmail;
  if (!userEmail) {
    throw new Error('Copper user email is required in skillConfig (e.g. { userEmail: "user@company.com" })');
  }
  return {
    'X-PW-UserEmail': userEmail,
    'X-PW-Application': 'developer_api',
    'Content-Type': 'application/json',
  };
}

function copperError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      return { content: `Copper API error: ${msg}`, isError: true };
    }
    return { content: `Copper API error: ${err.message}`, isError: true };
  }
  return { content: `Copper API error: ${String(err)}`, isError: true };
}

/** Format a Copper person for display */
function formatPerson(person: any): string {
  const name = person.name || '(no name)';
  const emails = person.emails?.map((e: any) => e.email).join(', ') || '(no email)';
  const phones = person.phone_numbers?.map((p: any) => p.number).join(', ') || '';
  const company = person.company_name || '';
  const phonePart = phones ? ` -- ${phones}` : '';
  const companyPart = company ? ` @ ${company}` : '';
  return `${name} <${emails}>${phonePart}${companyPart} (ID: ${person.id})`;
}

/** Format a Copper opportunity for display */
function formatOpportunity(opp: any): string {
  const name = opp.name || '(unnamed)';
  const status = opp.status || 'unknown';
  const value = opp.monetary_value != null ? `$${opp.monetary_value}` : 'N/A';
  const pipeline = opp.pipeline_id ? `pipeline: ${opp.pipeline_id}` : '';
  const stage = opp.pipeline_stage_id ? `stage: ${opp.pipeline_stage_id}` : '';
  return `${name} -- ${status} -- ${value} -- ${pipeline} ${stage} (ID: ${opp.id})`.trim();
}

/** Format a Copper lead for display */
function formatLead(lead: any): string {
  const name = lead.name || '(unnamed)';
  const email = lead.email?.email || '(no email)';
  const company = lead.company_name || '';
  const status = lead.status || 'unknown';
  return `${name} <${email}>${company ? ` @ ${company}` : ''} -- ${status} (ID: ${lead.id})`;
}

// ─── Tool: copper_list_people ───────────────────────────

const listPeople: ToolHandler = {
  description:
    'List people (contacts) from Copper CRM. Copper uses POST for list/search endpoints.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 200)',
      },
      page_number: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      sort_by: {
        type: 'string',
        description: 'Sort field (e.g. "name", "date_created")',
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "asc")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers = copperHeaders(ctx);

      const body: Record<string, any> = {
        page_size: params.page_size ?? 20,
        page_number: params.page_number ?? 1,
      };
      if (params.sort_by) body.sort_by = params.sort_by;
      if (params.sort_direction) body.sort_direction = params.sort_direction;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/people/search',
        headers,
        body,
      });

      const people: any[] = Array.isArray(result) ? result : result.data || [];
      if (people.length === 0) {
        return { content: 'No people found.' };
      }

      const lines = people.map((p: any) => formatPerson(p));
      return {
        content: `Found ${people.length} people:\n${lines.join('\n')}`,
        metadata: { count: people.length },
      };
    } catch (err) {
      return copperError(err);
    }
  },
};

// ─── Tool: copper_create_person ─────────────────────────

const createPerson: ToolHandler = {
  description:
    'Create a new person (contact) in Copper CRM. Provide at least a name.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Person full name',
      },
      emails: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            category: { type: 'string', enum: ['work', 'personal', 'other'] },
          },
          required: ['email'],
        },
        description: 'Email addresses',
      },
      phone_numbers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'string' },
            category: { type: 'string', enum: ['work', 'mobile', 'home', 'other'] },
          },
          required: ['number'],
        },
        description: 'Phone numbers',
      },
      company_name: {
        type: 'string',
        description: 'Company name for this person',
      },
      title: {
        type: 'string',
        description: 'Job title',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers = copperHeaders(ctx);

      const body: Record<string, any> = { name: params.name };
      if (params.emails?.length) body.emails = params.emails;
      if (params.phone_numbers?.length) body.phone_numbers = params.phone_numbers;
      if (params.company_name) body.company_name = params.company_name;
      if (params.title) body.title = params.title;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/people',
        headers,
        body,
      });

      return {
        content: `Person created: ${formatPerson(result)}`,
        metadata: {
          personId: result.id,
          name: result.name,
        },
      };
    } catch (err) {
      return copperError(err);
    }
  },
};

// ─── Tool: copper_search_leads ──────────────────────────

const searchLeads: ToolHandler = {
  description:
    'Search leads in Copper CRM. Copper uses POST for search endpoints.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 200)',
      },
      page_number: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      sort_by: {
        type: 'string',
        description: 'Sort field (e.g. "name", "date_created")',
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "asc")',
      },
      assignee_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Filter by assignee user IDs',
      },
      status_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Filter by lead status IDs',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers = copperHeaders(ctx);

      const body: Record<string, any> = {
        page_size: params.page_size ?? 20,
        page_number: params.page_number ?? 1,
      };
      if (params.sort_by) body.sort_by = params.sort_by;
      if (params.sort_direction) body.sort_direction = params.sort_direction;
      if (params.assignee_ids?.length) body.assignee_ids = params.assignee_ids;
      if (params.status_ids?.length) body.status_ids = params.status_ids;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/leads/search',
        headers,
        body,
      });

      const leads: any[] = Array.isArray(result) ? result : result.data || [];
      if (leads.length === 0) {
        return { content: 'No leads found.' };
      }

      const lines = leads.map((l: any) => formatLead(l));
      return {
        content: `Found ${leads.length} leads:\n${lines.join('\n')}`,
        metadata: { count: leads.length },
      };
    } catch (err) {
      return copperError(err);
    }
  },
};

// ─── Tool: copper_list_opportunities ────────────────────

const listOpportunities: ToolHandler = {
  description:
    'List opportunities from Copper CRM. Copper uses POST for list/search endpoints.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 200)',
      },
      page_number: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      sort_by: {
        type: 'string',
        description: 'Sort field (e.g. "name", "monetary_value", "date_created")',
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "asc")',
      },
      pipeline_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Filter by pipeline IDs',
      },
      status_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Filter by status IDs',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers = copperHeaders(ctx);

      const body: Record<string, any> = {
        page_size: params.page_size ?? 20,
        page_number: params.page_number ?? 1,
      };
      if (params.sort_by) body.sort_by = params.sort_by;
      if (params.sort_direction) body.sort_direction = params.sort_direction;
      if (params.pipeline_ids?.length) body.pipeline_ids = params.pipeline_ids;
      if (params.status_ids?.length) body.status_ids = params.status_ids;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/opportunities/search',
        headers,
        body,
      });

      const opportunities: any[] = Array.isArray(result) ? result : result.data || [];
      if (opportunities.length === 0) {
        return { content: 'No opportunities found.' };
      }

      const lines = opportunities.map((o: any) => formatOpportunity(o));
      return {
        content: `Found ${opportunities.length} opportunities:\n${lines.join('\n')}`,
        metadata: { count: opportunities.length },
      };
    } catch (err) {
      return copperError(err);
    }
  },
};

// ─── Tool: copper_create_task ───────────────────────────

const createTask: ToolHandler = {
  description:
    'Create a new task in Copper CRM. Tasks can be associated with people, leads, or opportunities.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Task name',
      },
      related_resource: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'ID of the related record' },
          type: { type: 'string', enum: ['person', 'lead', 'opportunity', 'company', 'project'], description: 'Type of the related record' },
        },
        required: ['id', 'type'],
        description: 'Related record to attach the task to',
      },
      due_date: {
        type: 'number',
        description: 'Due date as Unix timestamp',
      },
      reminder_date: {
        type: 'number',
        description: 'Reminder date as Unix timestamp',
      },
      priority: {
        type: 'string',
        enum: ['None', 'High'],
        description: 'Task priority',
      },
      details: {
        type: 'string',
        description: 'Task details or description',
      },
      assignee_id: {
        type: 'number',
        description: 'User ID to assign the task to',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const headers = copperHeaders(ctx);

      const body: Record<string, any> = { name: params.name };
      if (params.related_resource) body.related_resource = params.related_resource;
      if (params.due_date) body.due_date = params.due_date;
      if (params.reminder_date) body.reminder_date = params.reminder_date;
      if (params.priority) body.priority = params.priority;
      if (params.details) body.details = params.details;
      if (params.assignee_id) body.assignee_id = params.assignee_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/tasks',
        headers,
        body,
      });

      const related = result.related_resource
        ? ` (related to ${result.related_resource.type} ${result.related_resource.id})`
        : '';
      return {
        content: `Task created: "${result.name}"${related} (ID: ${result.id})`,
        metadata: {
          taskId: result.id,
          name: result.name,
        },
      };
    } catch (err) {
      return copperError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const copperAdapter: SkillAdapter = {
  skillId: 'copper-crm',
  name: 'Copper CRM',
  baseUrl: 'https://api.copper.com/developer_api/v1',
  auth: {
    type: 'api_key',
    headerName: 'X-PW-AccessToken',
  },
  tools: {
    copper_list_people: listPeople,
    copper_create_person: createPerson,
    copper_search_leads: searchLeads,
    copper_list_opportunities: listOpportunities,
    copper_create_task: createTask,
  },
  configSchema: {
    userEmail: {
      type: 'string' as const,
      label: 'User Email',
      description: 'Your Copper account email (required for X-PW-UserEmail header)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
