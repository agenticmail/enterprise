/**
 * MCP Skill Adapter — Azure DevOps
 *
 * Maps Azure DevOps REST API endpoints to MCP tool handlers.
 * Provides access to projects, work items, repositories, and pipelines.
 *
 * Azure DevOps API docs: https://learn.microsoft.com/en-us/rest/api/azure/devops/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function azdoError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.errorCode || err.message;
      const typeKey = data.typeKey || data.$type || '';
      const detail = typeKey ? `${msg} (type: ${typeKey})` : msg;
      return { content: `Azure DevOps API error: ${detail}`, isError: true };
    }
    return { content: `Azure DevOps API error: ${err.message}`, isError: true };
  }
  return { content: `Azure DevOps API error: ${String(err)}`, isError: true };
}

// ─── Tool: azdo_list_projects ───────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects in the Azure DevOps organization. Returns project names, IDs, states, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      stateFilter: {
        type: 'string',
        enum: ['all', 'createPending', 'deleted', 'deleting', 'new', 'unchanged', 'wellFormed'],
        description: 'Filter by project state (default: "wellFormed")',
      },
      top: {
        type: 'number',
        description: 'Maximum number of projects to return (default 100)',
      },
      skip: {
        type: 'number',
        description: 'Number of projects to skip for pagination',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'api-version': '7.1',
      };
      if (params.stateFilter) query.stateFilter = params.stateFilter;
      if (params.top) query['$top'] = String(params.top);
      if (params.skip) query['$skip'] = String(params.skip);

      const result = await ctx.apiExecutor.get('/_apis/projects', query);

      const projects: any[] = result.value || [];
      if (projects.length === 0) {
        return { content: 'No projects found in the organization.' };
      }

      const lines = projects.map((p: any) => {
        const name = p.name || 'unknown';
        const id = p.id || 'unknown';
        const state = p.state || 'unknown';
        const desc = p.description ? ` -- ${p.description.slice(0, 80)}` : '';
        const lastUpdate = p.lastUpdateTime
          ? new Date(p.lastUpdateTime).toISOString().slice(0, 10)
          : 'unknown';
        return `${name} (ID: ${id}) — ${state}, updated: ${lastUpdate}${desc}`;
      });

      return {
        content: `Found ${projects.length} project(s):\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return azdoError(err);
    }
  },
};

// ─── Tool: azdo_list_work_items ─────────────────────────

const listWorkItems: ToolHandler = {
  description:
    'Query work items in an Azure DevOps project using WIQL (Work Item Query Language). Returns IDs, titles, states, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project name',
      },
      wiql: {
        type: 'string',
        description: 'WIQL query string (e.g. "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = \'Active\'")',
      },
      top: {
        type: 'number',
        description: 'Maximum number of results (default 50)',
      },
    },
    required: ['project', 'wiql'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'api-version': '7.1',
      };
      if (params.top) query['$top'] = String(params.top);

      // First, run the WIQL query to get work item IDs
      const wiqlResult = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/${params.project}/_apis/wit/wiql`,
        query,
        body: { query: params.wiql },
      });

      const workItemRefs: any[] = wiqlResult.workItems || [];
      if (workItemRefs.length === 0) {
        return { content: `No work items matched the query in project "${params.project}".` };
      }

      // Get details for the first batch of work items
      const ids = workItemRefs.slice(0, params.top ?? 50).map((wi: any) => wi.id);
      const detailResult = await ctx.apiExecutor.get(
        `/${params.project}/_apis/wit/workitems`,
        {
          'api-version': '7.1',
          ids: ids.join(','),
          fields: 'System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo',
        },
      );

      const items: any[] = detailResult.value || [];
      const lines = items.map((wi: any) => {
        const fields = wi.fields || {};
        const id = fields['System.Id'] || wi.id || 'unknown';
        const title = fields['System.Title'] || 'untitled';
        const state = fields['System.State'] || 'unknown';
        const type = fields['System.WorkItemType'] || 'unknown';
        const assignedTo = fields['System.AssignedTo']?.displayName || 'unassigned';
        return `#${id} [${type}] ${title} — ${state} (${assignedTo})`;
      });

      return {
        content: `Found ${items.length} work item(s) in "${params.project}":\n${lines.join('\n')}`,
        metadata: { count: items.length, project: params.project, totalMatched: workItemRefs.length },
      };
    } catch (err) {
      return azdoError(err);
    }
  },
};

// ─── Tool: azdo_create_work_item ────────────────────────

const createWorkItem: ToolHandler = {
  description:
    'Create a new work item in an Azure DevOps project. Specify the type (Bug, Task, User Story, etc.) and fields.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project name',
      },
      type: {
        type: 'string',
        description: 'Work item type (e.g. "Bug", "Task", "User Story", "Epic", "Feature")',
      },
      title: {
        type: 'string',
        description: 'Work item title',
      },
      description: {
        type: 'string',
        description: 'Work item description (HTML supported)',
      },
      assignedTo: {
        type: 'string',
        description: 'User to assign the work item to (email or display name)',
      },
      state: {
        type: 'string',
        description: 'Initial state (e.g. "New", "Active")',
      },
      priority: {
        type: 'number',
        description: 'Priority (1-4, where 1 is highest)',
      },
    },
    required: ['project', 'type', 'title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      // Azure DevOps uses JSON Patch format for work item creation
      const patchDoc: any[] = [
        { op: 'add', path: '/fields/System.Title', value: params.title },
      ];
      if (params.description) {
        patchDoc.push({ op: 'add', path: '/fields/System.Description', value: params.description });
      }
      if (params.assignedTo) {
        patchDoc.push({ op: 'add', path: '/fields/System.AssignedTo', value: params.assignedTo });
      }
      if (params.state) {
        patchDoc.push({ op: 'add', path: '/fields/System.State', value: params.state });
      }
      if (params.priority) {
        patchDoc.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: params.priority });
      }

      const encodedType = encodeURIComponent(params.type);
      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/${params.project}/_apis/wit/workitems/$${encodedType}`,
        query: { 'api-version': '7.1' },
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: patchDoc,
      });

      const id = result.id || 'unknown';
      const url = result._links?.html?.href || result.url || 'N/A';

      return {
        content: `Work item #${id} created (${params.type}): ${params.title}\nURL: ${url}`,
        metadata: {
          id,
          type: params.type,
          project: params.project,
          url,
        },
      };
    } catch (err) {
      return azdoError(err);
    }
  },
};

// ─── Tool: azdo_list_repos ──────────────────────────────

const listRepos: ToolHandler = {
  description:
    'List Git repositories in an Azure DevOps project. Returns repo names, IDs, default branches, and sizes.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project name',
      },
    },
    required: ['project'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/${params.project}/_apis/git/repositories`,
        { 'api-version': '7.1' },
      );

      const repos: any[] = result.value || [];
      if (repos.length === 0) {
        return { content: `No repositories found in project "${params.project}".` };
      }

      const lines = repos.map((r: any) => {
        const name = r.name || 'unknown';
        const id = r.id || 'unknown';
        const defaultBranch = r.defaultBranch?.replace('refs/heads/', '') || 'none';
        const size = r.size ? `${(r.size / 1024).toFixed(1)} KB` : 'N/A';
        return `${name} (ID: ${id}) — branch: ${defaultBranch}, size: ${size}`;
      });

      return {
        content: `Found ${repos.length} repository(ies) in "${params.project}":\n${lines.join('\n')}`,
        metadata: { count: repos.length, project: params.project },
      };
    } catch (err) {
      return azdoError(err);
    }
  },
};

// ─── Tool: azdo_list_pipelines ──────────────────────────

const listPipelines: ToolHandler = {
  description:
    'List build/release pipelines in an Azure DevOps project. Returns pipeline names, IDs, and folders.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project name',
      },
      top: {
        type: 'number',
        description: 'Maximum number of pipelines to return (default 50)',
      },
      orderBy: {
        type: 'string',
        description: 'Order by field (e.g. "name asc")',
      },
    },
    required: ['project'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'api-version': '7.1',
      };
      if (params.top) query['$top'] = String(params.top);
      if (params.orderBy) query.orderBy = params.orderBy;

      const result = await ctx.apiExecutor.get(
        `/${params.project}/_apis/pipelines`,
        query,
      );

      const pipelines: any[] = result.value || [];
      if (pipelines.length === 0) {
        return { content: `No pipelines found in project "${params.project}".` };
      }

      const lines = pipelines.map((p: any) => {
        const name = p.name || 'unknown';
        const id = p.id || 'unknown';
        const folder = p.folder || '/';
        const revision = p.revision || 'N/A';
        return `${name} (ID: ${id}) — folder: ${folder}, revision: ${revision}`;
      });

      return {
        content: `Found ${pipelines.length} pipeline(s) in "${params.project}":\n${lines.join('\n')}`,
        metadata: { count: pipelines.length, project: params.project },
      };
    } catch (err) {
      return azdoError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const azureDevopsAdapter: SkillAdapter = {
  skillId: 'azure-devops',
  name: 'Azure DevOps',
  baseUrl: 'https://dev.azure.com/ORG',
  auth: {
    type: 'token',
    headerPrefix: 'Basic',
  },
  tools: {
    azdo_list_projects: listProjects,
    azdo_list_work_items: listWorkItems,
    azdo_create_work_item: createWorkItem,
    azdo_list_repos: listRepos,
    azdo_list_pipelines: listPipelines,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    organization: {
      type: 'string' as const,
      label: 'Azure DevOps Organization',
      description: 'Your Azure DevOps organization name (from dev.azure.com/{org})',
      required: true,
      placeholder: 'my-organization',
    },
  },
};
