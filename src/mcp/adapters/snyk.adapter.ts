/**
 * MCP Skill Adapter — Snyk
 *
 * Maps Snyk REST API endpoints to MCP tool handlers.
 * Covers organization listing, project management, vulnerability scanning,
 * and package testing.
 *
 * Snyk API docs: https://docs.snyk.io/snyk-api
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function snykError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: any[] = data.errors || [];
      if (errors.length > 0) {
        const details = errors.map((e: any) => `[${e.status || ''}] ${e.detail || e.title || ''}`).join('; ');
        return { content: `Snyk API error: ${details}`, isError: true };
      }
      const message = data.message || data.error || err.message;
      return { content: `Snyk API error: ${message}`, isError: true };
    }
    return { content: `Snyk API error: ${err.message}`, isError: true };
  }
  return { content: `Snyk API error: ${String(err)}`, isError: true };
}

/** Map Snyk severity to a readable label. */
function severityLabel(severity: string | undefined): string {
  switch (severity) {
    case 'critical': return 'CRITICAL';
    case 'high': return 'HIGH';
    case 'medium': return 'MEDIUM';
    case 'low': return 'LOW';
    default: return (severity || 'unknown').toUpperCase();
  }
}

// ─── Tool: snyk_list_orgs ───────────────────────────────

const listOrgs: ToolHandler = {
  description:
    'List Snyk organizations that the authenticated user belongs to. Returns org names, slugs, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of organizations to return (default 10)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 10),
        version: '2024-04-22',
      };

      const result = await ctx.apiExecutor.get('/orgs', query);
      const orgs: any[] = result.data || [];

      if (orgs.length === 0) {
        return {
          content: 'No organizations found.',
          metadata: { orgCount: 0 },
        };
      }

      const lines = orgs.map((o: any) => {
        const attrs = o.attributes || {};
        const name = attrs.name || 'unnamed';
        const slug = attrs.slug || 'N/A';
        return `• ${name} (slug: ${slug}, ID: ${o.id})`;
      });

      return {
        content: `Found ${orgs.length} organization(s):\n\n${lines.join('\n')}`,
        metadata: { orgCount: orgs.length },
      };
    } catch (err) {
      return snykError(err);
    }
  },
};

// ─── Tool: snyk_list_projects ───────────────────────────

const listProjects: ToolHandler = {
  description:
    'List Snyk projects within an organization. Returns project names, types, and last test dates.',
  inputSchema: {
    type: 'object',
    properties: {
      org_id: {
        type: 'string',
        description: 'Snyk organization ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of projects to return (default 20)',
      },
      target_id: {
        type: 'string',
        description: 'Filter by target ID',
      },
    },
    required: ['org_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        version: '2024-04-22',
      };
      if (params.target_id) query.target_id = params.target_id;

      const result = await ctx.apiExecutor.get(
        `/orgs/${params.org_id}/projects`,
        query,
      );

      const projects: any[] = result.data || [];

      if (projects.length === 0) {
        return {
          content: `No projects found in organization ${params.org_id}.`,
          metadata: { projectCount: 0 },
        };
      }

      const lines = projects.map((p: any) => {
        const attrs = p.attributes || {};
        const name = attrs.name || 'unnamed';
        const type = attrs.type || 'unknown';
        const status = attrs.status || 'unknown';
        const lastTested = attrs.last_tested_date
          ? new Date(attrs.last_tested_date).toLocaleString()
          : 'never';
        return `• ${name} (ID: ${p.id}) — type: ${type}, status: ${status}, last tested: ${lastTested}`;
      });

      return {
        content: `Found ${projects.length} project(s):\n\n${lines.join('\n')}`,
        metadata: { projectCount: projects.length, orgId: params.org_id },
      };
    } catch (err) {
      return snykError(err);
    }
  },
};

// ─── Tool: snyk_list_issues ─────────────────────────────

const listIssues: ToolHandler = {
  description:
    'List Snyk issues (vulnerabilities) for a project within an organization. Returns issue titles, severities, and remediation info.',
  inputSchema: {
    type: 'object',
    properties: {
      org_id: {
        type: 'string',
        description: 'Snyk organization ID',
      },
      project_id: {
        type: 'string',
        description: 'Snyk project ID',
      },
      severity: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'Filter by severity level',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of issues to return (default 20)',
      },
    },
    required: ['org_id', 'project_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        version: '2024-04-22',
      };
      if (params.severity) query.severity = params.severity;

      const result = await ctx.apiExecutor.get(
        `/orgs/${params.org_id}/issues`,
        query,
      );

      const issues: any[] = result.data || [];

      if (issues.length === 0) {
        return {
          content: 'No issues found.',
          metadata: { issueCount: 0 },
        };
      }

      const lines = issues.map((i: any) => {
        const attrs = i.attributes || {};
        const title = attrs.title || 'Untitled';
        const severity = severityLabel(attrs.effective_severity_level);
        const status = attrs.status || 'unknown';
        return `[${severity}] ${title} — status: ${status} (ID: ${i.id})`;
      });

      return {
        content: `Found ${issues.length} issue(s):\n\n${lines.join('\n')}`,
        metadata: { issueCount: issues.length, orgId: params.org_id, projectId: params.project_id },
      };
    } catch (err) {
      return snykError(err);
    }
  },
};

// ─── Tool: snyk_get_project ─────────────────────────────

const getProject: ToolHandler = {
  description:
    'Retrieve details of a specific Snyk project. Returns project name, type, origin, issue counts, and last test date.',
  inputSchema: {
    type: 'object',
    properties: {
      org_id: {
        type: 'string',
        description: 'Snyk organization ID',
      },
      project_id: {
        type: 'string',
        description: 'Snyk project ID',
      },
    },
    required: ['org_id', 'project_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        version: '2024-04-22',
      };

      const result = await ctx.apiExecutor.get(
        `/orgs/${params.org_id}/projects/${params.project_id}`,
        query,
      );

      const project = result.data || {};
      const attrs = project.attributes || {};

      const content = [
        `Project: ${attrs.name || 'Untitled'} (ID: ${project.id})`,
        `Type: ${attrs.type || 'unknown'}`,
        `Origin: ${attrs.origin || 'unknown'}`,
        `Status: ${attrs.status || 'unknown'}`,
        `Created: ${attrs.created ? new Date(attrs.created).toLocaleString() : 'unknown'}`,
        `Last tested: ${attrs.last_tested_date ? new Date(attrs.last_tested_date).toLocaleString() : 'never'}`,
        `Business criticality: ${(attrs.business_criticality || []).join(', ') || 'none'}`,
        `Tags: ${(attrs.tags || []).map((t: any) => `${t.key}=${t.value}`).join(', ') || 'none'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          projectId: project.id,
          name: attrs.name,
          type: attrs.type,
          orgId: params.org_id,
        },
      };
    } catch (err) {
      return snykError(err);
    }
  },
};

// ─── Tool: snyk_test_package ────────────────────────────

const testPackage: ToolHandler = {
  description:
    'Test a package for known vulnerabilities using Snyk. Provide the ecosystem, package name, and version.',
  inputSchema: {
    type: 'object',
    properties: {
      org_id: {
        type: 'string',
        description: 'Snyk organization ID',
      },
      ecosystem: {
        type: 'string',
        enum: ['npm', 'pip', 'maven', 'rubygems', 'nuget', 'golang', 'composer'],
        description: 'Package ecosystem / registry',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g. "lodash", "requests")',
      },
      version: {
        type: 'string',
        description: 'Package version to test (e.g. "4.17.20")',
      },
    },
    required: ['org_id', 'ecosystem', 'package_name', 'version'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        version: '2024-04-22',
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        path: `/orgs/${params.org_id}/packages/${params.ecosystem}/${encodeURIComponent(params.package_name)}/${params.version}/issues`,
        query,
      });

      const issues: any[] = result.data || [];

      if (issues.length === 0) {
        return {
          content: `No known vulnerabilities found for ${params.package_name}@${params.version} (${params.ecosystem}).`,
          metadata: {
            package: params.package_name,
            version: params.version,
            ecosystem: params.ecosystem,
            issueCount: 0,
          },
        };
      }

      const lines = issues.map((i: any) => {
        const attrs = i.attributes || {};
        const title = attrs.title || 'Untitled';
        const severity = severityLabel(attrs.effective_severity_level);
        return `[${severity}] ${title} (ID: ${i.id})`;
      });

      return {
        content: `Found ${issues.length} vulnerability(ies) in ${params.package_name}@${params.version} (${params.ecosystem}):\n\n${lines.join('\n')}`,
        metadata: {
          package: params.package_name,
          version: params.version,
          ecosystem: params.ecosystem,
          issueCount: issues.length,
        },
      };
    } catch (err) {
      return snykError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const snykAdapter: SkillAdapter = {
  skillId: 'snyk',
  name: 'Snyk Security',
  baseUrl: 'https://api.snyk.io/rest',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'token',
  },
  tools: {
    snyk_list_orgs: listOrgs,
    snyk_list_projects: listProjects,
    snyk_list_issues: listIssues,
    snyk_get_project: getProject,
    snyk_test_package: testPackage,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
