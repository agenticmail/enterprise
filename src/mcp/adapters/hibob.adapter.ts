/**
 * MCP Skill Adapter — HiBob
 *
 * Maps HiBob API v1 endpoints to MCP tool handlers.
 * Covers employee management, search, time-off, and company info.
 *
 * HiBob API docs: https://apidocs.hibob.com/reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function hibobError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      const details = data.errors ? ` -- ${JSON.stringify(data.errors)}` : '';
      return { content: `HiBob API error: ${msg}${details}`, isError: true };
    }
    return { content: `HiBob API error: ${err.message}`, isError: true };
  }
  return { content: `HiBob API error: ${String(err)}`, isError: true };
}

/** Format a HiBob employee for display */
function formatEmployee(emp: any): string {
  const name = emp.displayName || [emp.firstName, emp.surname].filter(Boolean).join(' ') || '(no name)';
  const email = emp.email || '(no email)';
  const dept = emp.work?.department || '';
  const deptPart = dept ? ` -- ${dept}` : '';
  const title = emp.work?.title || '';
  const titlePart = title ? ` (${title})` : '';
  return `${name} <${email}>${titlePart}${deptPart} (ID: ${emp.id})`;
}

// ─── Tool: hibob_list_employees ─────────────────────────

const listEmployees: ToolHandler = {
  description:
    'List employees from HiBob. Returns names, emails, departments, and work information.',
  inputSchema: {
    type: 'object',
    properties: {
      showInactive: {
        type: 'boolean',
        description: 'Include inactive employees (default: false)',
      },
      humanReadable: {
        type: 'string',
        enum: ['APPEND', 'REPLACE'],
        description: 'How to display field values -- APPEND shows both ID and name, REPLACE shows only name',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.showInactive) query.showInactive = 'true';
      if (params.humanReadable) query.humanReadable = params.humanReadable;

      const result = await ctx.apiExecutor.get('/people', query);

      const employees: any[] = result.employees || [];
      if (employees.length === 0) {
        return { content: 'No employees found.' };
      }

      const lines = employees.map((emp: any) => formatEmployee(emp));

      return {
        content: `Found ${employees.length} employees:\n${lines.join('\n')}`,
        metadata: { count: employees.length },
      };
    } catch (err) {
      return hibobError(err);
    }
  },
};

// ─── Tool: hibob_get_employee ───────────────────────────

const getEmployee: ToolHandler = {
  description:
    'Get detailed information about a specific HiBob employee by their ID or email.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The HiBob employee ID or email address',
      },
      humanReadable: {
        type: 'string',
        enum: ['APPEND', 'REPLACE'],
        description: 'How to display field values',
      },
    },
    required: ['identifier'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.humanReadable) query.humanReadable = params.humanReadable;

      const result = await ctx.apiExecutor.get(`/people/${params.identifier}`, query);

      const name = result.displayName || [result.firstName, result.surname].filter(Boolean).join(' ') || '(no name)';
      const work = result.work || {};

      const details = [
        `Name: ${name}`,
        `Email: ${result.email || 'N/A'}`,
        `Title: ${work.title || 'N/A'}`,
        `Department: ${work.department || 'N/A'}`,
        `Site: ${work.site || 'N/A'}`,
        `Manager: ${work.reportsTo?.displayName || work.reportsTo || 'N/A'}`,
        `Start Date: ${work.startDate || 'N/A'}`,
        `Status: ${result.internal?.status || 'N/A'}`,
        `Tenure: ${work.tenureDuration || 'N/A'}`,
        `About: ${result.about?.about || 'N/A'}`,
      ].join('\n');

      return {
        content: `Employee Details:\n${details}`,
        metadata: {
          id: result.id,
          name,
          email: result.email,
        },
      };
    } catch (err) {
      return hibobError(err);
    }
  },
};

// ─── Tool: hibob_search_employees ───────────────────────

const searchEmployees: ToolHandler = {
  description:
    'Search for employees in HiBob using field filters. Supports searching by name, department, title, and custom fields.',
  inputSchema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fields to include in results (e.g. ["displayName", "email", "work.title", "work.department"])',
      },
      filters: {
        type: 'array',
        description: 'Array of filter objects: [{ fieldPath, operator, values }]',
        items: {
          type: 'object',
          properties: {
            fieldPath: { type: 'string', description: 'Field path to filter on (e.g. "work.department")' },
            operator: { type: 'string', description: 'Filter operator (e.g. "equals", "contains")' },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'Values to match',
            },
          },
          required: ['fieldPath', 'operator', 'values'],
        },
      },
      humanReadable: {
        type: 'string',
        enum: ['APPEND', 'REPLACE'],
        description: 'How to display field values',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.fields?.length) body.fields = params.fields;
      if (params.filters?.length) body.filters = params.filters;
      if (params.humanReadable) body.humanReadable = params.humanReadable;

      const result = await ctx.apiExecutor.post('/people/search', body);

      const employees: any[] = result.employees || [];
      if (employees.length === 0) {
        return { content: 'No employees matched the search criteria.' };
      }

      const lines = employees.map((emp: any) => formatEmployee(emp));

      return {
        content: `Found ${employees.length} employees:\n${lines.join('\n')}`,
        metadata: { count: employees.length },
      };
    } catch (err) {
      return hibobError(err);
    }
  },
};

// ─── Tool: hibob_list_time_off ──────────────────────────

const listTimeOff: ToolHandler = {
  description:
    'List time-off requests from HiBob. Filter by employee, date range, or status.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'string',
        description: 'Filter by employee ID (optional)',
      },
      from: {
        type: 'string',
        description: 'Start date filter in YYYY-MM-DD format',
      },
      to: {
        type: 'string',
        description: 'End date filter in YYYY-MM-DD format',
      },
      status: {
        type: 'string',
        enum: ['approved', 'pending', 'declined', 'canceled'],
        description: 'Filter by request status',
      },
    },
    required: ['from', 'to'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        from: params.from,
        to: params.to,
      };
      if (params.status) query.status = params.status;

      let path = '/timeoff/requests';
      if (params.employee_id) {
        path = `/timeoff/employees/${params.employee_id}/requests`;
      }

      const result = await ctx.apiExecutor.get(path, query);

      const requests: any[] = result.outs || result.requests || (Array.isArray(result) ? result : []);
      if (requests.length === 0) {
        return { content: `No time-off requests found between ${params.from} and ${params.to}.` };
      }

      const lines = requests.map((r: any) => {
        const name = r.employeeDisplayName || r.employeeName || `Employee #${r.employeeId || 'N/A'}`;
        const type = r.policyTypeDisplayName || r.policyType || 'N/A';
        const status = r.status || 'N/A';
        const start = r.startDate || 'N/A';
        const end = r.endDate || 'N/A';
        return `${name} -- ${type} -- ${start} to ${end} (${status})`;
      });

      return {
        content: `Found ${requests.length} time-off requests:\n${lines.join('\n')}`,
        metadata: { count: requests.length, from: params.from, to: params.to },
      };
    } catch (err) {
      return hibobError(err);
    }
  },
};

// ─── Tool: hibob_get_company_info ───────────────────────

const getCompanyInfo: ToolHandler = {
  description:
    'Get company information from HiBob. Returns company name, sites, departments, and other organizational data.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/company/named-lists');

      const lists: any[] = result.lists || (Array.isArray(result) ? result : []);

      if (lists.length === 0) {
        return { content: 'No company information available.' };
      }

      const sections = lists.map((list: any) => {
        const name = list.name || '(unnamed)';
        const items: any[] = list.values || [];
        const itemLines = items.slice(0, 10).map((item: any) => {
          return `  ${item.name || item.value || String(item)}`;
        });
        const more = items.length > 10 ? `\n  ... and ${items.length - 10} more` : '';
        return `${name} (${items.length} items):\n${itemLines.join('\n')}${more}`;
      });

      return {
        content: `Company Information:\n\n${sections.join('\n\n')}`,
        metadata: { listCount: lists.length },
      };
    } catch (err) {
      return hibobError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const hibobAdapter: SkillAdapter = {
  skillId: 'hibob',
  name: 'HiBob',
  baseUrl: 'https://api.hibob.com/v1',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    hibob_list_employees: listEmployees,
    hibob_get_employee: getEmployee,
    hibob_search_employees: searchEmployees,
    hibob_list_time_off: listTimeOff,
    hibob_get_company_info: getCompanyInfo,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
