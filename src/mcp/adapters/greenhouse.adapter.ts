/**
 * MCP Skill Adapter — Greenhouse Recruiting
 *
 * Maps Greenhouse Harvest API v1 endpoints to MCP tool handlers.
 * Covers candidates, jobs, applications, and notes.
 *
 * Greenhouse API docs: https://developers.greenhouse.io/harvest.html
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function greenhouseError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Greenhouse returns { message: "...", errors: [...] }
      const msg = data.message || err.message;
      const errors = Array.isArray(data.errors)
        ? data.errors.map((e: any) => e.message || String(e)).join('; ')
        : '';
      const detail = errors ? ` -- ${errors}` : '';
      return { content: `Greenhouse API error: ${msg}${detail}`, isError: true };
    }
    return { content: `Greenhouse API error: ${err.message}`, isError: true };
  }
  return { content: `Greenhouse API error: ${String(err)}`, isError: true };
}

/** Format a Greenhouse candidate for display */
function formatCandidate(candidate: any): string {
  const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || '(no name)';
  const emails = candidate.email_addresses?.map((e: any) => e.value).join(', ') || '(no email)';
  const company = candidate.company || '';
  const companyPart = company ? ` @ ${company}` : '';
  const created = candidate.created_at ? candidate.created_at.slice(0, 10) : 'N/A';
  return `${name} <${emails}>${companyPart} -- Created: ${created} (ID: ${candidate.id})`;
}

/** Format a Greenhouse job for display */
function formatJob(job: any): string {
  const title = job.name || '(untitled)';
  const status = job.status || 'unknown';
  const dept = job.departments?.map((d: any) => d.name).join(', ') || 'N/A';
  const offices = job.offices?.map((o: any) => o.name).join(', ') || 'N/A';
  const openings = job.openings?.length ?? 0;
  return `${title} -- ${status} -- Dept: ${dept} -- Office: ${offices} -- ${openings} openings (ID: ${job.id})`;
}

// ─── Tool: greenhouse_list_candidates ───────────────────

const listCandidates: ToolHandler = {
  description:
    'List candidates from Greenhouse. Returns candidate names, emails, and application info.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 500)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      created_after: {
        type: 'string',
        description: 'Filter candidates created after this date (ISO 8601 format)',
      },
      updated_after: {
        type: 'string',
        description: 'Filter candidates updated after this date (ISO 8601 format)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 1),
      };
      if (params.created_after) query.created_after = params.created_after;
      if (params.updated_after) query.updated_after = params.updated_after;

      const result = await ctx.apiExecutor.get('/candidates', query);

      const candidates: any[] = Array.isArray(result) ? result : [];
      if (candidates.length === 0) {
        return { content: 'No candidates found.' };
      }

      const lines = candidates.map((c: any) => formatCandidate(c));

      return {
        content: `Found ${candidates.length} candidates:\n${lines.join('\n')}`,
        metadata: { count: candidates.length, page: params.page ?? 1 },
      };
    } catch (err) {
      return greenhouseError(err);
    }
  },
};

// ─── Tool: greenhouse_get_candidate ─────────────────────

const getCandidate: ToolHandler = {
  description:
    'Get detailed information about a specific Greenhouse candidate by their ID.',
  inputSchema: {
    type: 'object',
    properties: {
      candidate_id: {
        type: 'number',
        description: 'The Greenhouse candidate ID',
      },
    },
    required: ['candidate_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/candidates/${params.candidate_id}`);

      const name = [result.first_name, result.last_name].filter(Boolean).join(' ') || '(no name)';
      const emails = result.email_addresses?.map((e: any) => e.value).join(', ') || 'N/A';
      const phones = result.phone_numbers?.map((p: any) => p.value).join(', ') || 'N/A';
      const apps = result.applications?.length ?? 0;

      const details = [
        `Name: ${name}`,
        `Emails: ${emails}`,
        `Phones: ${phones}`,
        `Company: ${result.company || 'N/A'}`,
        `Title: ${result.title || 'N/A'}`,
        `Applications: ${apps}`,
        `Tags: ${result.tags?.join(', ') || 'none'}`,
        `Created: ${result.created_at ? result.created_at.slice(0, 10) : 'N/A'}`,
        `Last Activity: ${result.last_activity ? result.last_activity.slice(0, 10) : 'N/A'}`,
      ].join('\n');

      return {
        content: `Candidate Details:\n${details}`,
        metadata: {
          candidateId: params.candidate_id,
          name,
          emails,
        },
      };
    } catch (err) {
      return greenhouseError(err);
    }
  },
};

// ─── Tool: greenhouse_list_jobs ─────────────────────────

const listJobs: ToolHandler = {
  description:
    'List jobs from Greenhouse. Returns job titles, departments, offices, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 500)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      status: {
        type: 'string',
        enum: ['open', 'closed', 'draft'],
        description: 'Filter by job status',
      },
      department_id: {
        type: 'number',
        description: 'Filter by department ID',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 1),
      };
      if (params.status) query.status = params.status;
      if (params.department_id) query.department_id = String(params.department_id);

      const result = await ctx.apiExecutor.get('/jobs', query);

      const jobs: any[] = Array.isArray(result) ? result : [];
      if (jobs.length === 0) {
        return { content: 'No jobs found.' };
      }

      const lines = jobs.map((j: any) => formatJob(j));

      return {
        content: `Found ${jobs.length} jobs:\n${lines.join('\n')}`,
        metadata: { count: jobs.length, page: params.page ?? 1 },
      };
    } catch (err) {
      return greenhouseError(err);
    }
  },
};

// ─── Tool: greenhouse_list_applications ─────────────────

const listApplications: ToolHandler = {
  description:
    'List applications from Greenhouse. Returns application status, candidate info, and job associations.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 500)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      job_id: {
        type: 'number',
        description: 'Filter by job ID',
      },
      status: {
        type: 'string',
        enum: ['active', 'rejected', 'hired'],
        description: 'Filter by application status',
      },
      created_after: {
        type: 'string',
        description: 'Filter applications created after this date (ISO 8601 format)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 20),
        page: String(params.page ?? 1),
      };
      if (params.job_id) query.job_id = String(params.job_id);
      if (params.status) query.status = params.status;
      if (params.created_after) query.created_after = params.created_after;

      const result = await ctx.apiExecutor.get('/applications', query);

      const applications: any[] = Array.isArray(result) ? result : [];
      if (applications.length === 0) {
        return { content: 'No applications found.' };
      }

      const lines = applications.map((app: any) => {
        const candidate = app.candidate_id || 'N/A';
        const job = app.jobs?.map((j: any) => j.name).join(', ') || 'N/A';
        const status = app.status || 'unknown';
        const stage = app.current_stage?.name || 'N/A';
        const applied = app.applied_at ? app.applied_at.slice(0, 10) : 'N/A';
        return `Candidate #${candidate} -- Job: ${job} -- Status: ${status} -- Stage: ${stage} -- Applied: ${applied} (ID: ${app.id})`;
      });

      return {
        content: `Found ${applications.length} applications:\n${lines.join('\n')}`,
        metadata: { count: applications.length, page: params.page ?? 1 },
      };
    } catch (err) {
      return greenhouseError(err);
    }
  },
};

// ─── Tool: greenhouse_add_note ──────────────────────────

const addNote: ToolHandler = {
  description:
    'Add a note to a candidate in Greenhouse. Notes are visible to the hiring team on the candidate profile.',
  inputSchema: {
    type: 'object',
    properties: {
      candidate_id: {
        type: 'number',
        description: 'The Greenhouse candidate ID',
      },
      body: {
        type: 'string',
        description: 'The note content (supports plain text and HTML)',
      },
      visibility: {
        type: 'string',
        enum: ['admin_only', 'private', 'public'],
        description: 'Note visibility level (default: "admin_only")',
      },
    },
    required: ['candidate_id', 'body'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        body: params.body,
        visibility: params.visibility || 'admin_only',
      };

      const result = await ctx.apiExecutor.post(
        `/candidates/${params.candidate_id}/activity_feed/notes`,
        body,
      );

      return {
        content: `Note added to candidate #${params.candidate_id} (Note ID: ${result.id || 'N/A'})`,
        metadata: {
          candidateId: params.candidate_id,
          noteId: result.id,
          visibility: params.visibility || 'admin_only',
        },
      };
    } catch (err) {
      return greenhouseError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const greenhouseAdapter: SkillAdapter = {
  skillId: 'greenhouse',
  name: 'Greenhouse Recruiting',
  baseUrl: 'https://harvest.greenhouse.io/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Basic',
  },
  tools: {
    greenhouse_list_candidates: listCandidates,
    greenhouse_get_candidate: getCandidate,
    greenhouse_list_jobs: listJobs,
    greenhouse_list_applications: listApplications,
    greenhouse_add_note: addNote,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
