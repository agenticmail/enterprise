/**
 * MCP Skill Adapter — BambooHR
 *
 * Maps BambooHR API endpoints to MCP tool handlers.
 * Covers employee management, directory lookup, and time-off requests.
 *
 * The company subdomain is read from ctx.skillConfig.companyDomain
 * and used to build the dynamic base URL.
 *
 * BambooHR API docs: https://documentation.bamboohr.com/reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the BambooHR base URL from skill config */
function bhrUrl(ctx: ToolExecutionContext): string {
  const companyDomain = ctx.skillConfig.companyDomain;
  if (!companyDomain) {
    throw new Error('BambooHR companyDomain is required in skillConfig (e.g. { companyDomain: "mycompany" })');
  }
  return `https://api.bamboohr.com/api/gateway.php/${companyDomain}/v1`;
}

function bamboohrError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      return { content: `BambooHR API error: ${msg}`, isError: true };
    }
    return { content: `BambooHR API error: ${err.message}`, isError: true };
  }
  return { content: `BambooHR API error: ${String(err)}`, isError: true };
}

/** Format a BambooHR employee for display */
function formatEmployee(emp: any): string {
  const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = emp.workEmail || emp.email || '(no email)';
  const dept = emp.department ? ` -- ${emp.department}` : '';
  const title = emp.jobTitle ? ` (${emp.jobTitle})` : '';
  return `${name} <${email}>${title}${dept} (ID: ${emp.id})`;
}

// ─── Tool: bamboohr_list_employees ──────────────────────

const listEmployees: ToolHandler = {
  description:
    'List employees from BambooHR. Returns a directory of all active employees with their basic information.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'inactive', 'all'],
        description: 'Filter by employment status (default: "active")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bhrUrl(ctx);

      const query: Record<string, string> = {};
      if (params.status && params.status !== 'all') {
        query.status = params.status;
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/employees/directory`,
        query,
        headers: { 'Accept': 'application/json' },
      });

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
      return bamboohrError(err);
    }
  },
};

// ─── Tool: bamboohr_get_employee ────────────────────────

const getEmployee: ToolHandler = {
  description:
    'Get detailed information about a specific BambooHR employee by their ID. Returns fields like name, email, department, job title, hire date, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'string',
        description: 'The BambooHR employee ID',
      },
      fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific fields to retrieve (e.g. ["firstName", "lastName", "workEmail", "department"]). Defaults to common fields.',
      },
    },
    required: ['employee_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bhrUrl(ctx);

      const fields = params.fields?.length
        ? params.fields.join(',')
        : 'firstName,lastName,workEmail,department,jobTitle,hireDate,status,location,supervisor';

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/employees/${params.employee_id}`,
        query: { fields },
        headers: { 'Accept': 'application/json' },
      });

      const name = [result.firstName, result.lastName].filter(Boolean).join(' ') || '(no name)';
      const details = [
        `Name: ${name}`,
        `Email: ${result.workEmail || 'N/A'}`,
        `Department: ${result.department || 'N/A'}`,
        `Job Title: ${result.jobTitle || 'N/A'}`,
        `Hire Date: ${result.hireDate || 'N/A'}`,
        `Status: ${result.status || 'N/A'}`,
        `Location: ${result.location || 'N/A'}`,
        `Supervisor: ${result.supervisor || 'N/A'}`,
      ].join('\n');

      return {
        content: `Employee #${params.employee_id}:\n${details}`,
        metadata: {
          employeeId: params.employee_id,
          name,
          email: result.workEmail,
        },
      };
    } catch (err) {
      return bamboohrError(err);
    }
  },
};

// ─── Tool: bamboohr_get_directory ───────────────────────

const getDirectory: ToolHandler = {
  description:
    'Get the full employee directory from BambooHR. Returns a structured list of all employees with department and contact info.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bhrUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/employees/directory`,
        headers: { 'Accept': 'application/json' },
      });

      const employees: any[] = result.employees || [];
      if (employees.length === 0) {
        return { content: 'Employee directory is empty.' };
      }

      const byDept: Record<string, string[]> = {};
      for (const emp of employees) {
        const dept = emp.department || 'No Department';
        if (!byDept[dept]) byDept[dept] = [];
        const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '(no name)';
        byDept[dept].push(`  ${name} -- ${emp.jobTitle || 'N/A'} <${emp.workEmail || 'N/A'}>`);
      }

      const sections = Object.entries(byDept)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dept, members]) => `${dept}:\n${members.join('\n')}`);

      return {
        content: `Employee Directory (${employees.length} people):\n\n${sections.join('\n\n')}`,
        metadata: {
          totalEmployees: employees.length,
          departments: Object.keys(byDept).length,
        },
      };
    } catch (err) {
      return bamboohrError(err);
    }
  },
};

// ─── Tool: bamboohr_request_time_off ────────────────────

const requestTimeOff: ToolHandler = {
  description:
    'Submit a time-off request in BambooHR for a specific employee. Specify the date range and time-off type.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'string',
        description: 'The BambooHR employee ID',
      },
      start: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      end: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      time_off_type_id: {
        type: 'number',
        description: 'The time-off type ID (e.g. vacation, sick leave). Get available types from the company settings.',
      },
      note: {
        type: 'string',
        description: 'Optional note for the time-off request',
      },
    },
    required: ['employee_id', 'start', 'end', 'time_off_type_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bhrUrl(ctx);

      const body: Record<string, any> = {
        start: params.start,
        end: params.end,
        timeOffTypeId: params.time_off_type_id,
        status: 'requested',
      };
      if (params.note) body.notes = [{ note: params.note }];

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/employees/${params.employee_id}/time_off/request`,
        body,
        headers: { 'Accept': 'application/json' },
      });

      return {
        content: `Time-off request submitted for employee #${params.employee_id}: ${params.start} to ${params.end}`,
        metadata: {
          employeeId: params.employee_id,
          start: params.start,
          end: params.end,
          timeOffTypeId: params.time_off_type_id,
          requestId: result?.id,
        },
      };
    } catch (err) {
      return bamboohrError(err);
    }
  },
};

// ─── Tool: bamboohr_list_time_off ───────────────────────

const listTimeOff: ToolHandler = {
  description:
    'List time-off requests from BambooHR. Filter by employee, date range, or status.',
  inputSchema: {
    type: 'object',
    properties: {
      start: {
        type: 'string',
        description: 'Start date for the range in YYYY-MM-DD format',
      },
      end: {
        type: 'string',
        description: 'End date for the range in YYYY-MM-DD format',
      },
      employee_id: {
        type: 'string',
        description: 'Filter by a specific employee ID (optional)',
      },
      status: {
        type: 'string',
        enum: ['approved', 'pending', 'denied', 'canceled'],
        description: 'Filter by request status (optional)',
      },
    },
    required: ['start', 'end'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bhrUrl(ctx);

      const query: Record<string, string> = {
        start: params.start,
        end: params.end,
      };
      if (params.employee_id) query.employeeId = params.employee_id;
      if (params.status) query.status = params.status;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/time_off/requests`,
        query,
        headers: { 'Accept': 'application/json' },
      });

      const requests: any[] = Array.isArray(result) ? result : [];
      if (requests.length === 0) {
        return { content: `No time-off requests found between ${params.start} and ${params.end}.` };
      }

      const lines = requests.map((r: any) => {
        const name = r.name || `Employee #${r.employeeId}`;
        const type = r.type?.name || 'Unknown type';
        const status = r.status?.status || 'unknown';
        return `${name} -- ${type} -- ${r.start} to ${r.end} (${status})`;
      });

      return {
        content: `Found ${requests.length} time-off requests:\n${lines.join('\n')}`,
        metadata: { count: requests.length, start: params.start, end: params.end },
      };
    } catch (err) {
      return bamboohrError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const bamboohrAdapter: SkillAdapter = {
  skillId: 'bamboohr',
  name: 'BambooHR',
  // Base URL is dynamic based on companyDomain; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://api.bamboohr.com/api/gateway.php/COMPANY/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    bamboohr_list_employees: listEmployees,
    bamboohr_get_employee: getEmployee,
    bamboohr_get_directory: getDirectory,
    bamboohr_request_time_off: requestTimeOff,
    bamboohr_list_time_off: listTimeOff,
  },
  configSchema: {
    companyDomain: {
      type: 'string' as const,
      label: 'Company Subdomain',
      description: 'Your BambooHR company subdomain (e.g. "mycompany" for mycompany.bamboohr.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
