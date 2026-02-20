/**
 * MCP Skill Adapter — Terraform Cloud / Enterprise
 *
 * Maps Terraform Cloud API v2 endpoints to MCP tool handlers.
 * Covers workspace listing, workspace detail retrieval, and run triggering.
 *
 * Terraform Cloud API docs: https://developer.hashicorp.com/terraform/cloud-docs/api-docs
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function tfError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: any[] = data.errors || [];
      if (errors.length > 0) {
        const details = errors.map((e: any) => {
          const title = e.title || '';
          const detail = e.detail || '';
          const status = e.status || '';
          return `[${status}] ${title}: ${detail}`;
        }).join('; ');
        return { content: `Terraform API error: ${details}`, isError: true };
      }
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

// ─── Tool: terraform_list_workspaces ────────────────────

const listWorkspaces: ToolHandler = {
  description:
    'List Terraform Cloud workspaces in an organization. Returns workspace names, IDs, current run statuses, and VCS info.',
  inputSchema: {
    type: 'object',
    properties: {
      organization: {
        type: 'string',
        description: 'Terraform Cloud organization name',
      },
      search: {
        type: 'string',
        description: 'Search workspaces by name (partial match)',
      },
      page_number: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      page_size: {
        type: 'number',
        description: 'Results per page (default 20, max 100)',
      },
    },
    required: ['organization'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.search) query['search[name]'] = params.search;
      if (params.page_number) query['page[number]'] = String(params.page_number);
      if (params.page_size) query['page[size]'] = String(params.page_size);

      const result = await ctx.apiExecutor.get(
        `/organizations/${params.organization}/workspaces`,
        query,
      );

      const workspaces: any[] = result.data || [];

      if (workspaces.length === 0) {
        return {
          content: `No workspaces found in organization "${params.organization}".`,
          metadata: { workspaceCount: 0, organization: params.organization },
        };
      }

      const lines = workspaces.map((ws: any) => {
        const name = ws.attributes?.name || 'unknown';
        const id = ws.id || 'unknown';
        const tfVersion = ws.attributes?.['terraform-version'] || 'unknown';
        const vcsRepo = ws.attributes?.['vcs-repo']?.identifier || 'none';
        const updatedAt = ws.attributes?.['updated-at'] || 'unknown';
        const locked = ws.attributes?.locked ? 'locked' : 'unlocked';
        return `• ${name} (ID: ${id}) — TF ${tfVersion}, VCS: ${vcsRepo}, ${locked}, updated: ${updatedAt}`;
      });

      const totalCount = result.meta?.pagination?.['total-count'] || workspaces.length;

      return {
        content: `${workspaces.length} of ${totalCount} workspace(s) in "${params.organization}":\n\n${lines.join('\n')}`,
        metadata: {
          workspaceCount: workspaces.length,
          totalCount,
          organization: params.organization,
        },
      };
    } catch (err) {
      return tfError(err);
    }
  },
};

// ─── Tool: terraform_get_workspace ──────────────────────

const getWorkspace: ToolHandler = {
  description:
    'Get detailed information about a specific Terraform Cloud workspace, including its current state, VCS configuration, and recent run status.',
  inputSchema: {
    type: 'object',
    properties: {
      organization: {
        type: 'string',
        description: 'Terraform Cloud organization name',
      },
      workspace_name: {
        type: 'string',
        description: 'Workspace name',
      },
    },
    required: ['organization', 'workspace_name'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/organizations/${params.organization}/workspaces/${params.workspace_name}`,
      );

      const ws = result.data;
      if (!ws) {
        return {
          content: `Workspace "${params.workspace_name}" not found in organization "${params.organization}".`,
          isError: true,
        };
      }

      const attrs = ws.attributes || {};
      const info: string[] = [
        `Name: ${attrs.name || 'unknown'}`,
        `ID: ${ws.id || 'unknown'}`,
        `Terraform Version: ${attrs['terraform-version'] || 'unknown'}`,
        `Execution Mode: ${attrs['execution-mode'] || 'unknown'}`,
        `Auto Apply: ${attrs['auto-apply'] ?? false}`,
        `Locked: ${attrs.locked ?? false}`,
        `Resource Count: ${attrs['resource-count'] ?? 'unknown'}`,
        `Created: ${attrs['created-at'] || 'unknown'}`,
        `Updated: ${attrs['updated-at'] || 'unknown'}`,
      ];

      const vcsRepo = attrs['vcs-repo'];
      if (vcsRepo) {
        info.push(`VCS Repo: ${vcsRepo.identifier || 'unknown'}`);
        info.push(`VCS Branch: ${vcsRepo.branch || 'default'}`);
      }

      const workingDir = attrs['working-directory'];
      if (workingDir) {
        info.push(`Working Directory: ${workingDir}`);
      }

      return {
        content: `Workspace details:\n\n${info.join('\n')}`,
        metadata: {
          workspaceId: ws.id,
          workspaceName: attrs.name,
          organization: params.organization,
          terraformVersion: attrs['terraform-version'],
          locked: attrs.locked,
          resourceCount: attrs['resource-count'],
        },
      };
    } catch (err) {
      return tfError(err);
    }
  },
};

// ─── Tool: terraform_trigger_run ────────────────────────

const triggerRun: ToolHandler = {
  description:
    'Trigger a new Terraform run (plan + optional apply) on a workspace. Returns the run ID and status.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: {
        type: 'string',
        description: 'Terraform workspace ID (e.g. "ws-xxxxxxxx")',
      },
      message: {
        type: 'string',
        description: 'Description for this run (shown in Terraform Cloud UI)',
      },
      is_destroy: {
        type: 'boolean',
        description: 'Whether this is a destroy plan (default false)',
      },
      auto_apply: {
        type: 'boolean',
        description: 'Override workspace auto-apply setting for this run',
      },
    },
    required: ['workspace_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const attributes: Record<string, any> = {
        message: params.message || 'Triggered via MCP skill adapter',
      };
      if (params.is_destroy !== undefined) attributes['is-destroy'] = params.is_destroy;
      if (params.auto_apply !== undefined) attributes['auto-apply'] = params.auto_apply;

      const body = {
        data: {
          type: 'runs',
          attributes,
          relationships: {
            workspace: {
              data: {
                type: 'workspaces',
                id: params.workspace_id,
              },
            },
          },
        },
      };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/runs',
        headers: {
          'Content-Type': 'application/vnd.api+json',
        },
        body,
      });

      const run = result.data;
      const runId = run?.id || 'unknown';
      const status = run?.attributes?.status || 'unknown';
      const isDestroy = run?.attributes?.['is-destroy'] || false;

      const destroyNote = isDestroy ? ' (DESTROY)' : '';

      return {
        content: `Terraform run triggered${destroyNote}: ${runId} — status: ${status}\nMessage: ${attributes.message}`,
        metadata: {
          runId,
          workspaceId: params.workspace_id,
          status,
          isDestroy,
          message: attributes.message,
        },
      };
    } catch (err) {
      return tfError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const terraformAdapter: SkillAdapter = {
  skillId: 'terraform-iac',
  name: 'Terraform Cloud',
  baseUrl: 'https://app.terraform.io/api/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    terraform_list_workspaces: listWorkspaces,
    terraform_get_workspace: getWorkspace,
    terraform_trigger_run: triggerRun,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    organization: {
      type: 'string' as const,
      label: 'Terraform Cloud Organization',
      description: 'Your Terraform Cloud organization name',
      required: true,
      placeholder: 'my-org',
    },
  },
};
