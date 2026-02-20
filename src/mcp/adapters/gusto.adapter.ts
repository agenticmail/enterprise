/**
 * MCP Skill Adapter — Gusto Payroll
 *
 * Maps Gusto API v1 endpoints to MCP tool handlers.
 * Covers employee management, payroll runs, company info, and benefits.
 *
 * Gusto API docs: https://docs.gusto.com/app-integrations/api-reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function gustoError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Gusto returns errors as { base: ["message"] } or { error: "message" }
      if (data.base && Array.isArray(data.base)) {
        return { content: `Gusto API error: ${data.base.join('; ')}`, isError: true };
      }
      const msg = data.error || data.message || err.message;
      return { content: `Gusto API error: ${msg}`, isError: true };
    }
    return { content: `Gusto API error: ${err.message}`, isError: true };
  }
  return { content: `Gusto API error: ${String(err)}`, isError: true };
}

/** Format a Gusto employee for display */
function formatEmployee(emp: any): string {
  const name = [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = emp.email || '(no email)';
  const dept = emp.department || '';
  const deptPart = dept ? ` -- ${dept}` : '';
  const status = emp.terminated ? 'Terminated' : 'Active';
  return `${name} <${email}>${deptPart} (${status}) (ID: ${emp.uuid})`;
}

// ─── Tool: gusto_list_employees ─────────────────────────

const listEmployees: ToolHandler = {
  description:
    'List employees from a Gusto company. Returns names, emails, departments, and employment status.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'The Gusto company UUID',
      },
      terminated: {
        type: 'boolean',
        description: 'Include terminated employees (default: false)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
    },
    required: ['company_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per: String(params.per_page ?? 25),
      };
      if (params.terminated !== undefined) {
        query.terminated = String(params.terminated);
      }

      const result = await ctx.apiExecutor.get(
        `/companies/${params.company_id}/employees`,
        query,
      );

      const employees: any[] = Array.isArray(result) ? result : [];
      if (employees.length === 0) {
        return { content: 'No employees found.' };
      }

      const lines = employees.map((emp: any) => formatEmployee(emp));

      return {
        content: `Found ${employees.length} employees:\n${lines.join('\n')}`,
        metadata: { count: employees.length, companyId: params.company_id },
      };
    } catch (err) {
      return gustoError(err);
    }
  },
};

// ─── Tool: gusto_get_employee ───────────────────────────

const getEmployee: ToolHandler = {
  description:
    'Get detailed information about a specific Gusto employee by their UUID. Returns personal info, compensation, and employment details.',
  inputSchema: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'string',
        description: 'The Gusto employee UUID',
      },
    },
    required: ['employee_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/employees/${params.employee_id}`);

      const name = [result.first_name, result.last_name].filter(Boolean).join(' ') || '(no name)';
      const status = result.terminated ? 'Terminated' : 'Active';

      const details = [
        `Name: ${name}`,
        `Email: ${result.email || 'N/A'}`,
        `Department: ${result.department || 'N/A'}`,
        `Job Title: ${result.jobs?.[0]?.title || 'N/A'}`,
        `Status: ${status}`,
        `Hire Date: ${result.date_of_birth ? 'On file' : 'N/A'}`,
        `Payment Method: ${result.payment_method || 'N/A'}`,
        `SSN Last Four: ${result.ssn ? '****' : 'N/A'}`,
      ].join('\n');

      return {
        content: `Employee Details:\n${details}`,
        metadata: {
          employeeId: params.employee_id,
          name,
          email: result.email,
        },
      };
    } catch (err) {
      return gustoError(err);
    }
  },
};

// ─── Tool: gusto_list_payrolls ──────────────────────────

const listPayrolls: ToolHandler = {
  description:
    'List payroll runs for a Gusto company. Returns payroll dates, status, and totals.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'The Gusto company UUID',
      },
      processed: {
        type: 'boolean',
        description: 'Filter to only processed payrolls (default: true)',
      },
      start_date: {
        type: 'string',
        description: 'Filter payrolls starting after this date (YYYY-MM-DD)',
      },
      end_date: {
        type: 'string',
        description: 'Filter payrolls ending before this date (YYYY-MM-DD)',
      },
    },
    required: ['company_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.processed !== undefined) query.processed = String(params.processed);
      if (params.start_date) query.start_date = params.start_date;
      if (params.end_date) query.end_date = params.end_date;

      const result = await ctx.apiExecutor.get(
        `/companies/${params.company_id}/payrolls`,
        query,
      );

      const payrolls: any[] = Array.isArray(result) ? result : [];
      if (payrolls.length === 0) {
        return { content: 'No payrolls found.' };
      }

      const lines = payrolls.map((p: any) => {
        const period = `${p.pay_period?.start_date || 'N/A'} to ${p.pay_period?.end_date || 'N/A'}`;
        const checkDate = p.check_date || 'N/A';
        const processed = p.processed ? 'Processed' : 'Unprocessed';
        const total = p.totals?.gross_pay ? `$${Number(p.totals.gross_pay).toLocaleString()}` : 'N/A';
        return `${period} -- Check: ${checkDate} -- ${processed} -- Gross: ${total} (ID: ${p.payroll_uuid || 'N/A'})`;
      });

      return {
        content: `Found ${payrolls.length} payrolls:\n${lines.join('\n')}`,
        metadata: { count: payrolls.length, companyId: params.company_id },
      };
    } catch (err) {
      return gustoError(err);
    }
  },
};

// ─── Tool: gusto_get_company ────────────────────────────

const getCompany: ToolHandler = {
  description:
    'Get company information from Gusto. Returns company name, EIN, addresses, and configuration details.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'The Gusto company UUID',
      },
    },
    required: ['company_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/companies/${params.company_id}`);

      const details = [
        `Company: ${result.name || 'N/A'}`,
        `Trade Name: ${result.trade_name || 'N/A'}`,
        `EIN: ${result.ein || 'N/A'}`,
        `Entity Type: ${result.entity_type || 'N/A'}`,
        `Tier: ${result.tier || 'N/A'}`,
        `Is Suspended: ${result.is_suspended ?? 'N/A'}`,
        `Primary Signatory: ${result.primary_signatory?.full_name || 'N/A'}`,
        `Primary Payroll Admin: ${result.primary_payroll_admin?.full_name || 'N/A'}`,
      ].join('\n');

      const locations = result.locations || [];
      const locLines = locations.map((l: any) => {
        return `  ${l.street_1 || ''}, ${l.city || ''}, ${l.state || ''} ${l.zip || ''}`;
      });

      const locSection = locLines.length > 0
        ? `\n\nLocations:\n${locLines.join('\n')}`
        : '';

      return {
        content: `Company Details:\n${details}${locSection}`,
        metadata: {
          companyId: params.company_id,
          name: result.name,
          ein: result.ein,
        },
      };
    } catch (err) {
      return gustoError(err);
    }
  },
};

// ─── Tool: gusto_list_benefits ──────────────────────────

const listBenefits: ToolHandler = {
  description:
    'List company-level benefits from Gusto. Returns benefit types, descriptions, and whether they are active.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'The Gusto company UUID',
      },
    },
    required: ['company_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/companies/${params.company_id}/company_benefits`);

      const benefits: any[] = Array.isArray(result) ? result : [];
      if (benefits.length === 0) {
        return { content: 'No company benefits found.' };
      }

      const lines = benefits.map((b: any) => {
        const name = b.description || b.name || 'Unnamed Benefit';
        const type = b.benefit_type ? ` (${b.benefit_type})` : '';
        const active = b.active ? 'Active' : 'Inactive';
        return `${name}${type} -- ${active} (ID: ${b.id || 'N/A'})`;
      });

      return {
        content: `Found ${benefits.length} company benefits:\n${lines.join('\n')}`,
        metadata: { count: benefits.length, companyId: params.company_id },
      };
    } catch (err) {
      return gustoError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const gustoAdapter: SkillAdapter = {
  skillId: 'gusto',
  name: 'Gusto Payroll',
  baseUrl: 'https://api.gusto.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'gusto',
    headerPrefix: 'Bearer',
  },
  tools: {
    gusto_list_employees: listEmployees,
    gusto_get_employee: getEmployee,
    gusto_list_payrolls: listPayrolls,
    gusto_get_company: getCompany,
    gusto_list_benefits: listBenefits,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
