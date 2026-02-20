/**
 * MCP Skill Adapter — SalesLoft
 *
 * Maps SalesLoft API v2 endpoints to MCP tool handlers.
 * Covers people, cadences, and activities for sales engagement.
 *
 * SalesLoft API docs: https://developers.salesloft.com/docs/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function salesloftError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
        return { content: `SalesLoft API error: ${details}`, isError: true };
      }
      const msg = data.error?.message || data.message || err.message;
      return { content: `SalesLoft API error: ${msg}`, isError: true };
    }
    return { content: `SalesLoft API error: ${err.message}`, isError: true };
  }
  return { content: `SalesLoft API error: ${String(err)}`, isError: true };
}

/** Format a SalesLoft person for display */
function formatPerson(person: any): string {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = person.email_address || '(no email)';
  const title = person.title || '';
  const company = person.company_name || '';
  const phone = person.phone || '';
  const titlePart = title ? `, ${title}` : '';
  const companyPart = company ? ` @ ${company}` : '';
  const phonePart = phone ? ` -- ${phone}` : '';
  return `${name} <${email}>${titlePart}${companyPart}${phonePart} (ID: ${person.id})`;
}

/** Format a SalesLoft cadence for display */
function formatCadence(cadence: any): string {
  const name = cadence.name || '(unnamed)';
  const teamCadence = cadence.team_cadence ? 'team' : 'personal';
  const draft = cadence.draft ? ' [draft]' : '';
  const counts = cadence.counts || {};
  const totalPeople = counts.people_count || 0;
  const cadenceState = cadence.cadence_framework_id ? `framework: ${cadence.cadence_framework_id}` : '';
  return `${name} -- ${teamCadence}${draft} -- ${totalPeople} people${cadenceState ? ` -- ${cadenceState}` : ''} (ID: ${cadence.id})`;
}

/** Format a SalesLoft activity for display */
function formatActivity(activity: any): string {
  const type = activity.action_type || activity.type || 'unknown';
  const subject = activity.subject || activity.body?.substring(0, 50) || '(no subject)';
  const to = activity.to || activity.recipient?.email_address || '';
  const created = activity.created_at ? activity.created_at.slice(0, 16) : '';
  const toPart = to ? ` -> ${to}` : '';
  return `[${type}] ${subject}${toPart} -- ${created} (ID: ${activity.id})`;
}

// ─── Tool: salesloft_list_people ────────────────────────

const listPeople: ToolHandler = {
  description:
    'List people (contacts) from SalesLoft with optional filtering by email, updated date, or cadence membership.',
  inputSchema: {
    type: 'object',
    properties: {
      email_addresses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by email addresses',
      },
      cadence_id: {
        type: 'number',
        description: 'Filter by cadence ID',
      },
      updated_at: {
        type: 'string',
        description: 'Filter by updated date (ISO format, e.g. "2025-01-01T00:00:00Z")',
      },
      sort_by: {
        type: 'string',
        description: 'Sort field (e.g. "created_at", "updated_at")',
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "desc")',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.email_addresses?.length) query['email_addresses[]'] = params.email_addresses.join(',');
      if (params.cadence_id) query.cadence_id = String(params.cadence_id);
      if (params.updated_at) query['updated_at[gt]'] = params.updated_at;
      if (params.sort_by) query.sort_by = params.sort_by;
      if (params.sort_direction) query.sort_direction = params.sort_direction;

      const result = await ctx.apiExecutor.get('/people.json', query);

      const people: any[] = result.data || [];
      if (people.length === 0) {
        return { content: 'No people found.' };
      }

      const lines = people.map((p: any) => formatPerson(p));
      const meta = result.metadata || {};

      return {
        content: `Found ${meta.filtering?.total || people.length} people (showing ${people.length}):\n${lines.join('\n')}`,
        metadata: { count: people.length, total: meta.filtering?.total },
      };
    } catch (err) {
      return salesloftError(err);
    }
  },
};

// ─── Tool: salesloft_create_person ──────────────────────

const createPerson: ToolHandler = {
  description:
    'Create a new person in SalesLoft. Provide at least an email address.',
  inputSchema: {
    type: 'object',
    properties: {
      email_address: {
        type: 'string',
        description: 'Email address',
      },
      first_name: {
        type: 'string',
        description: 'First name',
      },
      last_name: {
        type: 'string',
        description: 'Last name',
      },
      title: {
        type: 'string',
        description: 'Job title',
      },
      company_name: {
        type: 'string',
        description: 'Company name',
      },
      phone: {
        type: 'string',
        description: 'Phone number',
      },
      city: {
        type: 'string',
        description: 'City',
      },
      state: {
        type: 'string',
        description: 'State or region',
      },
      country: {
        type: 'string',
        description: 'Country',
      },
    },
    required: ['email_address'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        email_address: params.email_address,
      };
      if (params.first_name) body.first_name = params.first_name;
      if (params.last_name) body.last_name = params.last_name;
      if (params.title) body.title = params.title;
      if (params.company_name) body.company_name = params.company_name;
      if (params.phone) body.phone = params.phone;
      if (params.city) body.city = params.city;
      if (params.state) body.state = params.state;
      if (params.country) body.country = params.country;

      const result = await ctx.apiExecutor.post('/people.json', body);

      const person = result.data || result;
      return {
        content: `Person created: ${formatPerson(person)}`,
        metadata: {
          personId: person.id,
          email: person.email_address,
        },
      };
    } catch (err) {
      return salesloftError(err);
    }
  },
};

// ─── Tool: salesloft_list_cadences ──────────────────────

const listCadences: ToolHandler = {
  description:
    'List cadences from SalesLoft. Returns cadence names, types, and people counts.',
  inputSchema: {
    type: 'object',
    properties: {
      team_cadence: {
        type: 'boolean',
        description: 'Filter to team cadences only (true) or personal only (false)',
      },
      sort_by: {
        type: 'string',
        description: 'Sort field (e.g. "created_at", "updated_at")',
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: "desc")',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.team_cadence !== undefined) query.team_cadence = String(params.team_cadence);
      if (params.sort_by) query.sort_by = params.sort_by;
      if (params.sort_direction) query.sort_direction = params.sort_direction;

      const result = await ctx.apiExecutor.get('/cadences.json', query);

      const cadences: any[] = result.data || [];
      if (cadences.length === 0) {
        return { content: 'No cadences found.' };
      }

      const lines = cadences.map((c: any) => formatCadence(c));

      return {
        content: `Found ${cadences.length} cadences:\n${lines.join('\n')}`,
        metadata: { count: cadences.length },
      };
    } catch (err) {
      return salesloftError(err);
    }
  },
};

// ─── Tool: salesloft_add_to_cadence ─────────────────────

const addToCadence: ToolHandler = {
  description:
    'Add a person to a SalesLoft cadence. Creates a cadence membership linking the person to the cadence.',
  inputSchema: {
    type: 'object',
    properties: {
      person_id: {
        type: 'number',
        description: 'The person ID to add to the cadence',
      },
      cadence_id: {
        type: 'number',
        description: 'The cadence ID to add the person to',
      },
      user_id: {
        type: 'number',
        description: 'The user ID who will own this cadence membership (optional)',
      },
    },
    required: ['person_id', 'cadence_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        person_id: params.person_id,
        cadence_id: params.cadence_id,
      };
      if (params.user_id) body.user_id = params.user_id;

      const result = await ctx.apiExecutor.post('/cadence_memberships.json', body);

      const membership = result.data || result;
      return {
        content: `Person ${params.person_id} added to cadence ${params.cadence_id} (membership ID: ${membership.id})`,
        metadata: {
          membershipId: membership.id,
          personId: params.person_id,
          cadenceId: params.cadence_id,
        },
      };
    } catch (err) {
      return salesloftError(err);
    }
  },
};

// ─── Tool: salesloft_list_activities ────────────────────

const listActivities: ToolHandler = {
  description:
    'List activities (emails, calls, etc.) from SalesLoft. Filter by type, person, or date range.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['emails', 'calls'],
        description: 'Activity type to list (default: "emails")',
      },
      person_id: {
        type: 'number',
        description: 'Filter activities by person ID',
      },
      cadence_id: {
        type: 'number',
        description: 'Filter activities by cadence ID',
      },
      updated_at: {
        type: 'string',
        description: 'Filter activities updated after this date (ISO format)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const activityType = params.type || 'emails';
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.person_id) query.person_id = String(params.person_id);
      if (params.cadence_id) query.cadence_id = String(params.cadence_id);
      if (params.updated_at) query['updated_at[gt]'] = params.updated_at;

      const result = await ctx.apiExecutor.get(`/${activityType}.json`, query);

      const activities: any[] = result.data || [];
      if (activities.length === 0) {
        return { content: `No ${activityType} activities found.` };
      }

      const lines = activities.map((a: any) => formatActivity(a));
      const meta = result.metadata || {};

      return {
        content: `Found ${meta.filtering?.total || activities.length} ${activityType} (showing ${activities.length}):\n${lines.join('\n')}`,
        metadata: { count: activities.length, total: meta.filtering?.total, type: activityType },
      };
    } catch (err) {
      return salesloftError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const salesloftAdapter: SkillAdapter = {
  skillId: 'salesloft',
  name: 'SalesLoft',
  baseUrl: 'https://api.salesloft.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'salesloft',
  },
  tools: {
    salesloft_list_people: listPeople,
    salesloft_create_person: createPerson,
    salesloft_list_cadences: listCadences,
    salesloft_add_to_cadence: addToCadence,
    salesloft_list_activities: listActivities,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
