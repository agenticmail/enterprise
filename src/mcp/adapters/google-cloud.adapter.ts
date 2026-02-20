/**
 * MCP Skill Adapter — Google Cloud Platform
 *
 * Maps GCP REST API endpoints to MCP tool handlers.
 * Covers Cloud Resource Manager (projects), Compute Engine (instances),
 * and Cloud Functions.
 *
 * GCP uses different base URLs for each service API, so all tools call
 * ctx.apiExecutor.request() with full URLs.
 *
 * GCP API docs:
 *   - Resource Manager: https://cloud.google.com/resource-manager/reference/rest
 *   - Compute Engine:   https://cloud.google.com/compute/docs/reference/rest/v1
 *   - Cloud Functions:  https://cloud.google.com/functions/docs/reference/rest
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

const RESOURCE_MANAGER_URL = 'https://cloudresourcemanager.googleapis.com/v1';
const COMPUTE_URL = 'https://compute.googleapis.com/compute/v1';
const FUNCTIONS_URL = 'https://cloudfunctions.googleapis.com/v2';

function gcloudError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const gErr = data.error;
      if (gErr && typeof gErr === 'object') {
        const code = gErr.code || '';
        const message = gErr.message || '';
        const status = gErr.status || '';
        return {
          content: `GCP API error (${code} ${status}): ${message}`,
          isError: true,
        };
      }
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

// ─── Tool: gcloud_list_projects ─────────────────────────

const listProjects: ToolHandler = {
  description:
    'List all GCP projects accessible to the authenticated user. Returns project IDs, names, and lifecycle states.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Maximum number of projects to return (default 50)',
      },
      page_token: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
      filter: {
        type: 'string',
        description: 'Optional filter expression (e.g. "name:my-project")',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.page_size) query.pageSize = String(params.page_size);
      if (params.page_token) query.pageToken = params.page_token;
      if (params.filter) query.filter = params.filter;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${RESOURCE_MANAGER_URL}/projects`,
        query,
      });

      const projects: any[] = result.projects || [];

      if (projects.length === 0) {
        return { content: 'No GCP projects found.' };
      }

      const lines = projects.map((p: any) => {
        const name = p.name || 'unnamed';
        const projectId = p.projectId || 'unknown';
        const state = p.lifecycleState || 'unknown';
        const number = p.projectNumber || '';
        return `• ${name} (ID: ${projectId}, #${number}) — ${state}`;
      });

      return {
        content: `${projects.length} GCP project(s):\n\n${lines.join('\n')}`,
        metadata: {
          projectCount: projects.length,
          nextPageToken: result.nextPageToken || null,
        },
      };
    } catch (err) {
      return gcloudError(err);
    }
  },
};

// ─── Tool: gcloud_list_instances ────────────────────────

const listInstances: ToolHandler = {
  description:
    'List Compute Engine VM instances in a GCP project and zone. Returns instance names, statuses, machine types, and IPs.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'GCP project ID',
      },
      zone: {
        type: 'string',
        description: 'Compute Engine zone (e.g. "us-central1-a"). Use "-" to list across all zones.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of instances to return (default 50)',
      },
      page_token: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
    },
    required: ['project', 'zone'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.max_results) query.maxResults = String(params.max_results);
      if (params.page_token) query.pageToken = params.page_token;

      const zone = params.zone || 'us-central1-a';

      // If zone is "-", use aggregatedList; otherwise list for specific zone
      let url: string;
      if (zone === '-') {
        url = `${COMPUTE_URL}/projects/${params.project}/aggregated/instances`;
      } else {
        url = `${COMPUTE_URL}/projects/${params.project}/zones/${zone}/instances`;
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url,
        query,
      });

      // Aggregated list nests instances under items.zones/*/instances
      let instances: any[] = [];
      if (result.items && !Array.isArray(result.items)) {
        // Aggregated response
        for (const scopeData of Object.values(result.items) as any[]) {
          if (scopeData.instances) {
            instances.push(...scopeData.instances);
          }
        }
      } else {
        instances = result.items || [];
      }

      if (instances.length === 0) {
        return {
          content: `No Compute Engine instances found in project "${params.project}" zone "${zone}".`,
          metadata: { instanceCount: 0, project: params.project, zone },
        };
      }

      const lines = instances.map((vm: any) => {
        const name = vm.name || 'unknown';
        const status = vm.status || 'unknown';
        const machineType = vm.machineType?.split('/').pop() || 'unknown';
        const natIp = vm.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || 'no external IP';
        const vmZone = vm.zone?.split('/').pop() || zone;
        return `• ${name} — ${status}, type: ${machineType}, zone: ${vmZone}, IP: ${natIp}`;
      });

      return {
        content: `${instances.length} instance(s) in project "${params.project}":\n\n${lines.join('\n')}`,
        metadata: {
          instanceCount: instances.length,
          project: params.project,
          zone,
          nextPageToken: result.nextPageToken || null,
        },
      };
    } catch (err) {
      return gcloudError(err);
    }
  },
};

// ─── Tool: gcloud_list_functions ────────────────────────

const listFunctions: ToolHandler = {
  description:
    'List Cloud Functions in a GCP project and location. Returns function names, runtimes, and states.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'GCP project ID',
      },
      location: {
        type: 'string',
        description: 'Cloud Functions location (e.g. "us-central1"). Use "-" for all locations.',
      },
      page_size: {
        type: 'number',
        description: 'Maximum number of functions to return (default 50)',
      },
      page_token: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
    },
    required: ['project'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const location = params.location || '-';
      const query: Record<string, string> = {};
      if (params.page_size) query.pageSize = String(params.page_size);
      if (params.page_token) query.pageToken = params.page_token;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${FUNCTIONS_URL}/projects/${params.project}/locations/${location}/functions`,
        query,
      });

      const functions: any[] = result.functions || [];

      if (functions.length === 0) {
        return {
          content: `No Cloud Functions found in project "${params.project}" location "${location}".`,
          metadata: { functionCount: 0, project: params.project, location },
        };
      }

      const lines = functions.map((fn: any) => {
        const name = fn.name?.split('/').pop() || 'unknown';
        const state = fn.state || 'unknown';
        const runtime = fn.buildConfig?.runtime || 'unknown';
        const entryPoint = fn.buildConfig?.entryPoint || '';
        const url = fn.serviceConfig?.uri || '';
        const entryPart = entryPoint ? `, entry: ${entryPoint}` : '';
        const urlPart = url ? `\n    URL: ${url}` : '';
        return `• ${name} — ${state}, runtime: ${runtime}${entryPart}${urlPart}`;
      });

      return {
        content: `${functions.length} Cloud Function(s) in project "${params.project}":\n\n${lines.join('\n')}`,
        metadata: {
          functionCount: functions.length,
          project: params.project,
          location,
          nextPageToken: result.nextPageToken || null,
        },
      };
    } catch (err) {
      return gcloudError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const googleCloudAdapter: SkillAdapter = {
  skillId: 'google-cloud',
  name: 'Google Cloud Platform',
  // Base URL is for Resource Manager; other tools use full URLs for their respective APIs
  baseUrl: 'https://cloudresourcemanager.googleapis.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'google',
  },
  tools: {
    gcloud_list_projects: listProjects,
    gcloud_list_instances: listInstances,
    gcloud_list_functions: listFunctions,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
  configSchema: {
    projectId: {
      type: 'string' as const,
      label: 'Google Cloud Project ID',
      description: 'Your GCP project ID',
      required: true,
      placeholder: 'my-project-123',
    },
  },
};
