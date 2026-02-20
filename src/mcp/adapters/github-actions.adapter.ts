/**
 * MCP Skill Adapter — GitHub Actions
 *
 * Maps GitHub Actions REST API endpoints to MCP tool handlers.
 * All endpoints are scoped under /repos/{owner}/{repo}/actions/...
 * and use the same GitHub API authentication and headers.
 *
 * GitHub Actions REST API docs: https://docs.github.com/en/rest/actions
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function actionsError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const parts = [data.message || err.message];
      if (Array.isArray(data.errors)) {
        for (const e of data.errors) {
          parts.push(`  - ${e.field || e.resource}: ${e.message || e.code}`);
        }
      }
      return { content: `GitHub Actions API error: ${parts.join('\n')}`, isError: true };
    }
    return { content: `GitHub Actions API error: ${err.message}`, isError: true };
  }
  return { content: `GitHub Actions API error: ${String(err)}`, isError: true };
}

// ─── Tool: actions_list_workflows ───────────────────────

const listWorkflows: ToolHandler = {
  description:
    'List all workflows in a GitHub repository. Returns workflow names, IDs, states, and file paths.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 30, max 100)',
      },
    },
    required: ['owner', 'repo'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 30),
      };

      const result = await ctx.apiExecutor.get(
        `/repos/${params.owner}/${params.repo}/actions/workflows`,
        query,
      );

      const workflows: any[] = Array.isArray(result.workflows) ? result.workflows : [];
      if (workflows.length === 0) {
        return {
          content: `No workflows found in ${params.owner}/${params.repo}.`,
        };
      }

      const lines = workflows.map((w: any) => {
        return `${w.name} (ID: ${w.id}) -- state: ${w.state}, path: ${w.path}`;
      });

      return {
        content: `Found ${workflows.length} workflows in ${params.owner}/${params.repo}:\n${lines.join('\n')}`,
        metadata: {
          count: workflows.length,
          total_count: result.total_count,
          owner: params.owner,
          repo: params.repo,
        },
      };
    } catch (err) {
      return actionsError(err);
    }
  },
};

// ─── Tool: actions_trigger_workflow ─────────────────────

const triggerWorkflow: ToolHandler = {
  description:
    'Trigger a workflow dispatch event to run a GitHub Actions workflow. The workflow must have a workflow_dispatch trigger.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      workflow_id: {
        type: 'string',
        description: 'Workflow ID (number) or workflow file name (e.g. "deploy.yml")',
      },
      ref: {
        type: 'string',
        description: 'Branch or tag to run the workflow on (e.g. "main")',
      },
      inputs: {
        type: 'object',
        description: 'Workflow input parameters as key/value pairs (optional)',
      },
    },
    required: ['owner', 'repo', 'workflow_id', 'ref'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        ref: params.ref,
      };
      if (params.inputs && Object.keys(params.inputs).length > 0) {
        body.inputs = params.inputs;
      }

      await ctx.apiExecutor.post(
        `/repos/${params.owner}/${params.repo}/actions/workflows/${params.workflow_id}/dispatches`,
        body,
      );

      // GitHub returns 204 No Content on success — no response body
      return {
        content: `Workflow "${params.workflow_id}" dispatch triggered on ref "${params.ref}" in ${params.owner}/${params.repo}.`,
        metadata: {
          workflow_id: params.workflow_id,
          ref: params.ref,
          owner: params.owner,
          repo: params.repo,
        },
      };
    } catch (err) {
      return actionsError(err);
    }
  },
};

// ─── Tool: actions_list_runs ────────────────────────────

const listRuns: ToolHandler = {
  description:
    'List workflow runs for a repository. Optionally filter by workflow ID, branch, status, or event.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      workflow_id: {
        type: 'string',
        description: 'Filter by workflow ID or file name (optional)',
      },
      branch: {
        type: 'string',
        description: 'Filter by branch name (optional)',
      },
      status: {
        type: 'string',
        enum: ['completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 'requested', 'waiting', 'pending'],
        description: 'Filter by run status (optional)',
      },
      event: {
        type: 'string',
        description: 'Filter by event type (e.g. "push", "pull_request", "workflow_dispatch")',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
    },
    required: ['owner', 'repo'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
      };
      if (params.branch) query.branch = params.branch;
      if (params.status) query.status = params.status;
      if (params.event) query.event = params.event;

      // Use workflow-scoped endpoint if workflow_id is given, otherwise repo-level
      const path = params.workflow_id
        ? `/repos/${params.owner}/${params.repo}/actions/workflows/${params.workflow_id}/runs`
        : `/repos/${params.owner}/${params.repo}/actions/runs`;

      const result = await ctx.apiExecutor.get(path, query);

      const runs: any[] = Array.isArray(result.workflow_runs) ? result.workflow_runs : [];
      if (runs.length === 0) {
        return {
          content: `No workflow runs found in ${params.owner}/${params.repo}.`,
        };
      }

      const lines = runs.map((r: any) => {
        const conclusion = r.conclusion || r.status || 'unknown';
        const branch = r.head_branch || 'unknown';
        const created = r.created_at ? new Date(r.created_at).toISOString().slice(0, 16) : '';
        return `Run #${r.run_number} "${r.name}" (${conclusion}) -- branch: ${branch}, ${created}`;
      });

      return {
        content: `Found ${runs.length} workflow runs (total: ${result.total_count}) in ${params.owner}/${params.repo}:\n${lines.join('\n')}`,
        metadata: {
          count: runs.length,
          total_count: result.total_count,
          owner: params.owner,
          repo: params.repo,
        },
      };
    } catch (err) {
      return actionsError(err);
    }
  },
};

// ─── Tool: actions_get_run ──────────────────────────────

const getRun: ToolHandler = {
  description:
    'Get detailed information about a specific workflow run by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (user or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      run_id: {
        type: 'number',
        description: 'Workflow run ID',
      },
    },
    required: ['owner', 'repo', 'run_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/repos/${params.owner}/${params.repo}/actions/runs/${params.run_id}`,
      );

      const created = result.created_at ? new Date(result.created_at).toISOString().slice(0, 16) : '';
      const updated = result.updated_at ? new Date(result.updated_at).toISOString().slice(0, 16) : '';

      return {
        content: [
          `Workflow Run #${result.run_number}: ${result.name}`,
          `Status: ${result.status}`,
          `Conclusion: ${result.conclusion || 'N/A'}`,
          `Branch: ${result.head_branch || 'unknown'}`,
          `Event: ${result.event}`,
          `Commit: ${result.head_sha?.slice(0, 8) || 'unknown'}`,
          `Actor: ${result.actor?.login || 'unknown'}`,
          `Created: ${created}`,
          `Updated: ${updated}`,
          `URL: ${result.html_url}`,
        ].join('\n'),
        metadata: {
          run_id: result.id,
          run_number: result.run_number,
          status: result.status,
          conclusion: result.conclusion,
          url: result.html_url,
          owner: params.owner,
          repo: params.repo,
        },
      };
    } catch (err) {
      return actionsError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const githubActionsAdapter: SkillAdapter = {
  skillId: 'github-actions',
  name: 'GitHub Actions',
  baseUrl: 'https://api.github.com',
  auth: {
    type: 'oauth2',
    provider: 'github',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  tools: {
    actions_list_workflows: listWorkflows,
    actions_trigger_workflow: triggerWorkflow,
    actions_list_runs: listRuns,
    actions_get_run: getRun,
  },
  rateLimits: {
    requestsPerSecond: 1,
    requestsPerMinute: 80,
    burstLimit: 10,
  },
};
