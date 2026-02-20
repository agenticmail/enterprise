/**
 * MCP Skill Adapter — Rippling HR
 *
 * Maps Rippling API endpoints to MCP tool handlers.
 * Covers employees, departments, teams, and company information.
 *
 * Rippling API docs: https://developer.rippling.com/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function ripplingError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error_message || data.message || data.error || err.message;
      const code = data.error_code ? ` [${data.error_code}]` : '';
      return { content: `Rippling API error${code}: ${msg}`, isError: true };
    }
    return { content: `Rippling API error: ${err.message}`, isError: true };
  }
  return { content: `Rippling API error: ${String(err)}`, isError: true };
}

/** Format a Rippling employee for display */
function formatEmployee(emp: any): string {
  const name = emp.name || [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = emp.workEmail || emp.email || '(no email)';
  const dept = emp.department?.name || emp.department || '';
  const deptPart = dept ? ` -- ${dept}` : '';
  const title = emp.title || emp.jobTitle || '';
  const titlePart = title ? ` (${title})` : '';
  return `${name} <${email}>${titlePart}${deptPart} (ID: ${emp.id})`;
}

// ─── Tool: rippling_list_employees ──────────────────────

const listEmployees: ToolHandler = {
  description:
    'List employees from Rippling. Returns names, emails, titles, and department information.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of employees to return (default 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      status: {
        type: 'string',
        enum: ['active', 'terminated', 'on_leave'],
        description: 'Filter by employment status (default: active)',
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

      const result = await ctx.apiExecutor.get('/employees', query);

      const employees: any[] = result.data || (Array.isArray(result) ? result : []);
      if (employees.length === 0) {
        return { content: 'No employees found.' };
      }

      const lines = employees.map((emp: any) => formatEmployee(emp));

      return {
        content: `Found ${employees.length} employees:\n${lines.join('\n')}`,
        metadata: { count: employees.length },
      };
    } catch (err) {
      return ripplingError(err);
    }
  },
};

// ─── Tool: rippling_get_employee ────────────────────────

const getEmployee: ToolHandler = {
  description:
    'Get detailed information about a specific Rippling employee by their ID.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'string',
        description: 'The Rippling employee ID',
      },
    },
    required: ['employee_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/employees/${params.employee_id}`);

      const name = result.name || [result.firstName, result.lastName].filter(Boolean).join(' ') || '(no name)';

      const details = [
        `Name: ${name}`,
        `Email: ${result.workEmail || result.email || 'N/A'}`,
        `Title: ${result.title || result.jobTitle || 'N/A'}`,
        `Department: ${result.department?.name || result.department || 'N/A'}`,
        `Team: ${result.team?.name || result.team || 'N/A'}`,
        `Manager: ${result.manager?.name || result.manager || 'N/A'}`,
        `Location: ${result.workLocation || result.location || 'N/A'}`,
        `Start Date: ${result.startDate || 'N/A'}`,
        `Status: ${result.employmentStatus || result.status || 'N/A'}`,
        `Employment Type: ${result.employmentType || 'N/A'}`,
      ].join('\n');

      return {
        content: `Employee Details:\n${details}`,
        metadata: {
          employeeId: params.employee_id,
          name,
          email: result.workEmail || result.email,
        },
      };
    } catch (err) {
      return ripplingError(err);
    }
  },
};

// ─── Tool: rippling_list_departments ────────────────────

const listDepartments: ToolHandler = {
  description:
    'List all departments in Rippling. Returns department names, head counts, and leadership info.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of departments to return (default 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 100),
      };

      const result = await ctx.apiExecutor.get('/departments', query);

      const departments: any[] = result.data || (Array.isArray(result) ? result : []);
      if (departments.length === 0) {
        return { content: 'No departments found.' };
      }

      const lines = departments.map((dept: any) => {
        const name = dept.name || '(unnamed)';
        const head = dept.head?.name || dept.headName || 'N/A';
        const count = dept.employeeCount ?? dept.headcount ?? 'N/A';
        return `${name} -- Head: ${head} -- Employees: ${count} (ID: ${dept.id})`;
      });

      return {
        content: `Found ${departments.length} departments:\n${lines.join('\n')}`,
        metadata: { count: departments.length },
      };
    } catch (err) {
      return ripplingError(err);
    }
  },
};

// ─── Tool: rippling_list_teams ──────────────────────────

const listTeams: ToolHandler = {
  description:
    'List all teams in Rippling. Returns team names, members count, and team leads.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of teams to return (default 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 100),
      };

      const result = await ctx.apiExecutor.get('/teams', query);

      const teams: any[] = result.data || (Array.isArray(result) ? result : []);
      if (teams.length === 0) {
        return { content: 'No teams found.' };
      }

      const lines = teams.map((team: any) => {
        const name = team.name || '(unnamed)';
        const lead = team.lead?.name || team.leadName || 'N/A';
        const count = team.memberCount ?? team.members?.length ?? 'N/A';
        return `${name} -- Lead: ${lead} -- Members: ${count} (ID: ${team.id})`;
      });

      return {
        content: `Found ${teams.length} teams:\n${lines.join('\n')}`,
        metadata: { count: teams.length },
      };
    } catch (err) {
      return ripplingError(err);
    }
  },
};

// ─── Tool: rippling_get_company ─────────────────────────

const getCompany: ToolHandler = {
  description:
    'Get company information from Rippling. Returns company name, address, employee count, and configuration.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/company');

      const details = [
        `Company: ${result.name || result.legalName || 'N/A'}`,
        `Legal Name: ${result.legalName || 'N/A'}`,
        `EIN: ${result.ein || 'N/A'}`,
        `Industry: ${result.industry || 'N/A'}`,
        `Employee Count: ${result.employeeCount ?? 'N/A'}`,
        `Address: ${result.address ? `${result.address.street1 || ''}, ${result.address.city || ''}, ${result.address.state || ''} ${result.address.zip || ''}`.trim() : 'N/A'}`,
        `Founded: ${result.foundedDate || result.founded || 'N/A'}`,
        `Website: ${result.website || 'N/A'}`,
      ].join('\n');

      return {
        content: `Company Details:\n${details}`,
        metadata: {
          name: result.name || result.legalName,
          employeeCount: result.employeeCount,
        },
      };
    } catch (err) {
      return ripplingError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const ripplingAdapter: SkillAdapter = {
  skillId: 'rippling',
  name: 'Rippling HR',
  baseUrl: 'https://api.rippling.com',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    rippling_list_employees: listEmployees,
    rippling_get_employee: getEmployee,
    rippling_list_departments: listDepartments,
    rippling_list_teams: listTeams,
    rippling_get_company: getCompany,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
