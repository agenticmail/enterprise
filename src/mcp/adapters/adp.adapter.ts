/**
 * MCP Skill Adapter — ADP Workforce
 *
 * Maps ADP API endpoints to MCP tool handlers.
 * Covers workers, payroll, organizational units, and benefits.
 *
 * ADP API docs: https://developers.adp.com/articles/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function adpError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // ADP returns { confirmMessage: { ... }, error: { ... } }
      const errorObj = data.error || data;
      const msg = errorObj.message || errorObj.userMessage || err.message;
      const code = errorObj.code ? ` [${errorObj.code}]` : '';
      return { content: `ADP API error${code}: ${msg}`, isError: true };
    }
    return { content: `ADP API error: ${err.message}`, isError: true };
  }
  return { content: `ADP API error: ${String(err)}`, isError: true };
}

/** Format an ADP worker for display */
function formatWorker(worker: any): string {
  const person = worker.person || {};
  const name = person.legalName
    ? [person.legalName.givenName, person.legalName.familyName1].filter(Boolean).join(' ')
    : '(no name)';
  const email = person.communication?.emails?.[0]?.emailUri || '(no email)';
  const assignment = worker.workerDates ? '' : '';
  const status = worker.workerStatus?.statusCode?.codeValue || 'N/A';
  const id = worker.workerID?.idValue || worker.associateOID || 'N/A';
  return `${name} <${email}> -- Status: ${status} (ID: ${id})`;
}

// ─── Tool: adp_list_workers ─────────────────────────────

const listWorkers: ToolHandler = {
  description:
    'List workers from ADP Workforce. Returns a paginated list of all workers with basic information.',
  inputSchema: {
    type: 'object',
    properties: {
      top: {
        type: 'number',
        description: 'Maximum number of workers to return (default 25, max 100)',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (default 0)',
      },
      filter: {
        type: 'string',
        description: 'OData filter expression (e.g. "workers/workerStatus/statusCode/codeValue eq \'Active\'")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        '$top': String(params.top ?? 25),
        '$skip': String(params.skip ?? 0),
      };
      if (params.filter) query['$filter'] = params.filter;

      const result = await ctx.apiExecutor.get('/hr/v2/workers', query);

      const workers: any[] = result.workers || [];
      if (workers.length === 0) {
        return { content: 'No workers found.' };
      }

      const lines = workers.map((w: any) => formatWorker(w));

      return {
        content: `Found ${workers.length} workers:\n${lines.join('\n')}`,
        metadata: { count: workers.length },
      };
    } catch (err) {
      return adpError(err);
    }
  },
};

// ─── Tool: adp_get_worker ───────────────────────────────

const getWorker: ToolHandler = {
  description:
    'Get detailed information about a specific ADP worker by their associate OID.',
  inputSchema: {
    type: 'object',
    properties: {
      associate_oid: {
        type: 'string',
        description: 'The ADP associate OID (unique worker identifier)',
      },
    },
    required: ['associate_oid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/hr/v2/workers/${params.associate_oid}`);

      const worker = result.workers?.[0] || result;
      const person = worker.person || {};
      const legalName = person.legalName || {};
      const name = [legalName.givenName, legalName.familyName1].filter(Boolean).join(' ') || '(no name)';
      const email = person.communication?.emails?.[0]?.emailUri || 'N/A';
      const phone = person.communication?.phones?.[0]?.dialNumber || 'N/A';

      const assignment = worker.workerAssignments?.[0] || {};
      const details = [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        `Job Title: ${assignment.jobTitle || 'N/A'}`,
        `Department: ${assignment.homeOrganizationalUnit?.nameLong || 'N/A'}`,
        `Location: ${assignment.homeWorkLocation?.nameCode?.longName || 'N/A'}`,
        `Manager: ${assignment.reportsTo?.[0]?.reportsToWorkerName?.formattedName || 'N/A'}`,
        `Hire Date: ${worker.workerDates?.originalHireDate || 'N/A'}`,
        `Status: ${worker.workerStatus?.statusCode?.codeValue || 'N/A'}`,
        `Worker Type: ${assignment.workerTypeCode?.longName || 'N/A'}`,
      ].join('\n');

      return {
        content: `Worker Details:\n${details}`,
        metadata: {
          associateOid: params.associate_oid,
          name,
          email,
        },
      };
    } catch (err) {
      return adpError(err);
    }
  },
};

// ─── Tool: adp_get_payroll ──────────────────────────────

const getPayroll: ToolHandler = {
  description:
    'Get payroll information from ADP. Returns pay statements for a specific worker or a summary of recent payroll runs.',
  inputSchema: {
    type: 'object',
    properties: {
      associate_oid: {
        type: 'string',
        description: 'The ADP associate OID to get pay statements for',
      },
      start_date: {
        type: 'string',
        description: 'Filter pay statements starting after this date (YYYY-MM-DD)',
      },
      end_date: {
        type: 'string',
        description: 'Filter pay statements ending before this date (YYYY-MM-DD)',
      },
      top: {
        type: 'number',
        description: 'Maximum number of statements to return (default 10)',
      },
    },
    required: ['associate_oid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        '$top': String(params.top ?? 10),
      };
      if (params.start_date) query['$filter'] = `payDate ge '${params.start_date}'`;
      if (params.end_date) {
        const existing = query['$filter'] || '';
        query['$filter'] = existing
          ? `${existing} and payDate le '${params.end_date}'`
          : `payDate le '${params.end_date}'`;
      }

      const result = await ctx.apiExecutor.get(
        `/payroll/v1/workers/${params.associate_oid}/pay-distributions`,
        query,
      );

      const statements: any[] = result.payDistributions || result.payStatements || [];
      if (statements.length === 0) {
        return { content: `No payroll data found for worker ${params.associate_oid}.` };
      }

      const lines = statements.map((s: any) => {
        const payDate = s.payDate || 'N/A';
        const grossPay = s.grossPayAmount?.amountValue ? `$${Number(s.grossPayAmount.amountValue).toLocaleString()}` : 'N/A';
        const netPay = s.netPayAmount?.amountValue ? `$${Number(s.netPayAmount.amountValue).toLocaleString()}` : 'N/A';
        const period = s.payPeriod
          ? `${s.payPeriod.startDate || 'N/A'} to ${s.payPeriod.endDate || 'N/A'}`
          : 'N/A';
        return `Pay Date: ${payDate} -- Period: ${period} -- Gross: ${grossPay} -- Net: ${netPay}`;
      });

      return {
        content: `Payroll for worker ${params.associate_oid}:\n${lines.join('\n')}`,
        metadata: {
          associateOid: params.associate_oid,
          statementCount: statements.length,
        },
      };
    } catch (err) {
      return adpError(err);
    }
  },
};

// ─── Tool: adp_list_org_units ───────────────────────────

const listOrgUnits: ToolHandler = {
  description:
    'List organizational units from ADP. Returns departments, divisions, cost centers, and other org structures.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['department', 'division', 'cost_center', 'location'],
        description: 'Type of organizational unit to list',
      },
      top: {
        type: 'number',
        description: 'Maximum number of results (default 50)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        '$top': String(params.top ?? 50),
      };
      if (params.type) query.typeCode = params.type;

      const result = await ctx.apiExecutor.get('/core/v1/organization-departments', query);

      const units: any[] = result.organizationDepartments || result.data || [];
      if (units.length === 0) {
        return { content: 'No organizational units found.' };
      }

      const lines = units.map((unit: any) => {
        const name = unit.nameLong || unit.nameShort || unit.name || '(unnamed)';
        const code = unit.departmentCode?.codeValue || unit.code || 'N/A';
        const type = unit.typeCode?.longName || unit.type || 'N/A';
        const head = unit.headWorker?.formattedName || 'N/A';
        return `${name} (${code}) -- Type: ${type} -- Head: ${head}`;
      });

      return {
        content: `Found ${units.length} organizational units:\n${lines.join('\n')}`,
        metadata: { count: units.length },
      };
    } catch (err) {
      return adpError(err);
    }
  },
};

// ─── Tool: adp_get_benefits ─────────────────────────────

const getBenefits: ToolHandler = {
  description:
    'Get benefit enrollment information for a specific ADP worker. Returns active benefits, coverage, and plan details.',
  inputSchema: {
    type: 'object',
    properties: {
      associate_oid: {
        type: 'string',
        description: 'The ADP associate OID',
      },
    },
    required: ['associate_oid'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/benefits/v1/workers/${params.associate_oid}/benefit-enrollments`,
      );

      const enrollments: any[] = result.benefitEnrollments || [];
      if (enrollments.length === 0) {
        return {
          content: `No benefit enrollments found for worker ${params.associate_oid}.`,
          metadata: { associateOid: params.associate_oid },
        };
      }

      const lines = enrollments.map((e: any) => {
        const planName = e.benefitPlanName || e.planName || 'Unknown Plan';
        const type = e.benefitType?.longName || e.type || 'N/A';
        const status = e.enrollmentStatus?.codeValue || 'N/A';
        const coverage = e.coverageLevelCode?.longName || 'N/A';
        const cost = e.employeeCost?.amountValue ? `$${Number(e.employeeCost.amountValue).toLocaleString()}/period` : 'N/A';
        return `${planName} (${type}) -- Status: ${status} -- Coverage: ${coverage} -- Cost: ${cost}`;
      });

      return {
        content: `Benefits for worker ${params.associate_oid}:\n${lines.join('\n')}`,
        metadata: {
          associateOid: params.associate_oid,
          enrollmentCount: enrollments.length,
        },
      };
    } catch (err) {
      return adpError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const adpAdapter: SkillAdapter = {
  skillId: 'adp',
  name: 'ADP Workforce',
  baseUrl: 'https://api.adp.com',
  auth: {
    type: 'oauth2',
    provider: 'adp',
    headerPrefix: 'Bearer',
  },
  tools: {
    adp_list_workers: listWorkers,
    adp_get_worker: getWorker,
    adp_get_payroll: getPayroll,
    adp_list_org_units: listOrgUnits,
    adp_get_benefits: getBenefits,
  },
  configSchema: {
    environment: {
      type: 'select' as const,
      label: 'Environment',
      description: 'Select the ADP environment to connect to',
      options: [
        { label: 'Production', value: 'prod' },
        { label: 'Sandbox', value: 'sandbox' },
      ],
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
