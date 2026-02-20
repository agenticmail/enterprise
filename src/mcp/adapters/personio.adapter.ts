/**
 * MCP Skill Adapter — Personio
 *
 * Maps Personio API v1 endpoints to MCP tool handlers.
 * Covers employee management, absences, and attendance tracking.
 *
 * Personio API docs: https://developer.personio.de/reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function personioError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Personio returns { success: false, error: { message, code, ... } }
      const errorObj = data.error || data;
      const msg = errorObj.message || err.message;
      const code = errorObj.code ? ` [${errorObj.code}]` : '';
      return { content: `Personio API error${code}: ${msg}`, isError: true };
    }
    return { content: `Personio API error: ${err.message}`, isError: true };
  }
  return { content: `Personio API error: ${String(err)}`, isError: true };
}

/** Extract the value from a Personio attribute object */
function attrValue(attr: any): string {
  if (!attr) return 'N/A';
  if (typeof attr === 'string' || typeof attr === 'number') return String(attr);
  if (attr.value !== undefined) {
    if (typeof attr.value === 'object' && attr.value !== null) {
      return attr.value.attributes?.name || attr.value.name || JSON.stringify(attr.value);
    }
    return String(attr.value);
  }
  return 'N/A';
}

/** Format a Personio employee for display */
function formatEmployee(emp: any): string {
  const attrs = emp.attributes || emp;
  const name = [attrValue(attrs.first_name), attrValue(attrs.last_name)].filter(v => v !== 'N/A').join(' ') || '(no name)';
  const email = attrValue(attrs.email);
  const dept = attrValue(attrs.department);
  const deptPart = dept !== 'N/A' ? ` -- ${dept}` : '';
  const title = attrValue(attrs.position);
  const titlePart = title !== 'N/A' ? ` (${title})` : '';
  const id = attrValue(attrs.id) || emp.id || 'N/A';
  return `${name} <${email}>${titlePart}${deptPart} (ID: ${id})`;
}

// ─── Tool: personio_list_employees ──────────────────────

const listEmployees: ToolHandler = {
  description:
    'List employees from Personio. Returns names, emails, departments, and positions.',
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
      attributes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific employee attributes to include (e.g. ["first_name", "last_name", "email", "department"])',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 50),
        offset: String(params.offset ?? 0),
      };
      if (params.attributes?.length) {
        query.attributes = params.attributes.join(',');
      }

      const result = await ctx.apiExecutor.get('/company/employees', query);

      const employees: any[] = result.data || [];
      if (employees.length === 0) {
        return { content: 'No employees found.' };
      }

      const lines = employees.map((emp: any) => formatEmployee(emp));

      return {
        content: `Found ${employees.length} employees:\n${lines.join('\n')}`,
        metadata: { count: employees.length },
      };
    } catch (err) {
      return personioError(err);
    }
  },
};

// ─── Tool: personio_get_employee ────────────────────────

const getEmployee: ToolHandler = {
  description:
    'Get detailed information about a specific Personio employee by their ID.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'number',
        description: 'The Personio employee ID',
      },
    },
    required: ['employee_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/company/employees/${params.employee_id}`);

      const emp = result.data || result;
      const attrs = emp.attributes || emp;

      const details = [
        `Name: ${attrValue(attrs.first_name)} ${attrValue(attrs.last_name)}`,
        `Email: ${attrValue(attrs.email)}`,
        `Position: ${attrValue(attrs.position)}`,
        `Department: ${attrValue(attrs.department)}`,
        `Office: ${attrValue(attrs.office)}`,
        `Supervisor: ${attrValue(attrs.supervisor)}`,
        `Hire Date: ${attrValue(attrs.hire_date)}`,
        `Employment Type: ${attrValue(attrs.employment_type)}`,
        `Status: ${attrValue(attrs.status)}`,
        `Weekly Hours: ${attrValue(attrs.weekly_working_hours)}`,
        `Vacation Days: ${attrValue(attrs.vacation_day_balance)}`,
      ].join('\n');

      return {
        content: `Employee Details:\n${details}`,
        metadata: {
          employeeId: params.employee_id,
          name: `${attrValue(attrs.first_name)} ${attrValue(attrs.last_name)}`,
          email: attrValue(attrs.email),
        },
      };
    } catch (err) {
      return personioError(err);
    }
  },
};

// ─── Tool: personio_list_absences ───────────────────────

const listAbsences: ToolHandler = {
  description:
    'List absence (time-off) records from Personio. Filter by employee, date range, or type.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date for filtering absences (YYYY-MM-DD)',
      },
      end_date: {
        type: 'string',
        description: 'End date for filtering absences (YYYY-MM-DD)',
      },
      employee_id: {
        type: 'number',
        description: 'Filter by employee ID (optional)',
      },
      absence_type_id: {
        type: 'number',
        description: 'Filter by absence type ID (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 50),
        offset: String(params.offset ?? 0),
      };
      if (params.start_date) query.start_date = params.start_date;
      if (params.end_date) query.end_date = params.end_date;
      if (params.employee_id) query.employees = String(params.employee_id);
      if (params.absence_type_id) query.absence_types = String(params.absence_type_id);

      const result = await ctx.apiExecutor.get('/company/time-offs', query);

      const absences: any[] = result.data || [];
      if (absences.length === 0) {
        return { content: 'No absences found.' };
      }

      const lines = absences.map((a: any) => {
        const attrs = a.attributes || a;
        const empName = attrValue(attrs.employee?.attributes?.first_name || attrs.employee_first_name)
          + ' ' + attrValue(attrs.employee?.attributes?.last_name || attrs.employee_last_name);
        const type = attrValue(attrs.time_off_type || attrs.type);
        const start = attrValue(attrs.start_date);
        const end = attrValue(attrs.end_date);
        const status = attrValue(attrs.status);
        const days = attrValue(attrs.days_count || attrs.effective_duration);
        return `${empName.trim() || 'Unknown'} -- ${type} -- ${start} to ${end} -- ${days} days (${status}) (ID: ${a.id || attrValue(attrs.id)})`;
      });

      return {
        content: `Found ${absences.length} absences:\n${lines.join('\n')}`,
        metadata: { count: absences.length },
      };
    } catch (err) {
      return personioError(err);
    }
  },
};

// ─── Tool: personio_create_absence ──────────────────────

const createAbsence: ToolHandler = {
  description:
    'Create an absence (time-off) request in Personio for a specific employee.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'number',
        description: 'The Personio employee ID',
      },
      time_off_type_id: {
        type: 'number',
        description: 'The absence type ID (e.g. vacation, sick leave)',
      },
      start_date: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format',
      },
      end_date: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format',
      },
      half_day_start: {
        type: 'boolean',
        description: 'Whether the start date is a half day (default: false)',
      },
      half_day_end: {
        type: 'boolean',
        description: 'Whether the end date is a half day (default: false)',
      },
      comment: {
        type: 'string',
        description: 'Optional comment for the absence request',
      },
    },
    required: ['employee_id', 'time_off_type_id', 'start_date', 'end_date'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        employee_id: params.employee_id,
        time_off_type_id: params.time_off_type_id,
        start_date: params.start_date,
        end_date: params.end_date,
        half_day_start: params.half_day_start ?? false,
        half_day_end: params.half_day_end ?? false,
      };
      if (params.comment) body.comment = params.comment;

      const result = await ctx.apiExecutor.post('/company/time-offs', body);

      const absence = result.data || result;
      const id = absence.id || absence.attributes?.id || 'N/A';

      return {
        content: `Absence created for employee #${params.employee_id}: ${params.start_date} to ${params.end_date} (ID: ${id})`,
        metadata: {
          absenceId: id,
          employeeId: params.employee_id,
          startDate: params.start_date,
          endDate: params.end_date,
        },
      };
    } catch (err) {
      return personioError(err);
    }
  },
};

// ─── Tool: personio_list_attendances ────────────────────

const listAttendances: ToolHandler = {
  description:
    'List attendance records from Personio. Filter by employee and date range to see clock-in/clock-out data.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date for filtering attendances (YYYY-MM-DD, required)',
      },
      end_date: {
        type: 'string',
        description: 'End date for filtering attendances (YYYY-MM-DD, required)',
      },
      employee_id: {
        type: 'number',
        description: 'Filter by employee ID (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    required: ['start_date', 'end_date'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        start_date: params.start_date,
        end_date: params.end_date,
        limit: String(params.limit ?? 50),
        offset: String(params.offset ?? 0),
      };
      if (params.employee_id) query.employees = String(params.employee_id);

      const result = await ctx.apiExecutor.get('/company/attendances', query);

      const attendances: any[] = result.data || [];
      if (attendances.length === 0) {
        return { content: `No attendance records found between ${params.start_date} and ${params.end_date}.` };
      }

      const lines = attendances.map((a: any) => {
        const attrs = a.attributes || a;
        const empId = attrValue(attrs.employee_id || attrs.employee);
        const date = attrValue(attrs.date);
        const start = attrValue(attrs.start_time);
        const end = attrValue(attrs.end_time);
        const breakMin = attrValue(attrs.break_duration || attrs.break);
        const comment = attrs.comment ? ` -- "${attrValue(attrs.comment)}"` : '';
        return `Employee #${empId} -- ${date} -- ${start} to ${end} -- Break: ${breakMin} min${comment} (ID: ${a.id || attrValue(attrs.id)})`;
      });

      return {
        content: `Found ${attendances.length} attendance records:\n${lines.join('\n')}`,
        metadata: {
          count: attendances.length,
          startDate: params.start_date,
          endDate: params.end_date,
        },
      };
    } catch (err) {
      return personioError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const personioAdapter: SkillAdapter = {
  skillId: 'personio',
  name: 'Personio',
  baseUrl: 'https://api.personio.de/v1',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    personio_list_employees: listEmployees,
    personio_get_employee: getEmployee,
    personio_list_absences: listAbsences,
    personio_create_absence: createAbsence,
    personio_list_attendances: listAttendances,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
