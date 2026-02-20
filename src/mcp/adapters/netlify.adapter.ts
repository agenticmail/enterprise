/**
 * MCP Skill Adapter — Netlify
 *
 * Maps Netlify REST API endpoints to MCP tool handlers.
 * Provides access to site management, deploy listing, deploy creation,
 * and form submissions.
 *
 * Netlify API docs: https://docs.netlify.com/api/get-started/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function netlifyError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      const code = data.code || data.error_code || '';
      const detail = code ? `${msg} (code: ${code})` : msg;
      return { content: `Netlify API error: ${detail}`, isError: true };
    }
    return { content: `Netlify API error: ${err.message}`, isError: true };
  }
  return { content: `Netlify API error: ${String(err)}`, isError: true };
}

// ─── Tool: netlify_list_sites ───────────────────────────

const listSites: ToolHandler = {
  description:
    'List all Netlify sites accessible to the authenticated user. Returns site names, URLs, and deploy statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Number of sites per page (default 20, max 100)',
      },
      filter: {
        type: 'string',
        enum: ['all', 'owner', 'guest'],
        description: 'Filter by access level (default: "all")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 20),
      };
      if (params.filter) query.filter = params.filter;

      const result = await ctx.apiExecutor.get('/sites', query);

      const sites: any[] = Array.isArray(result) ? result : [];
      if (sites.length === 0) {
        return { content: 'No Netlify sites found.' };
      }

      const lines = sites.map((s: any) => {
        const name = s.name || 'unknown';
        const url = s.ssl_url || s.url || 'N/A';
        const published = s.published_deploy?.published_at
          ? new Date(s.published_deploy.published_at).toISOString().slice(0, 16)
          : 'never';
        const repo = s.build_settings?.repo_url || 'no repo';
        return `${name} — ${url}\n  last published: ${published}, repo: ${repo}`;
      });

      return {
        content: `Found ${sites.length} site(s):\n${lines.join('\n')}`,
        metadata: { count: sites.length },
      };
    } catch (err) {
      return netlifyError(err);
    }
  },
};

// ─── Tool: netlify_get_site ─────────────────────────────

const getSite: ToolHandler = {
  description:
    'Get detailed information about a specific Netlify site by ID or custom domain.',
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'string',
        description: 'Netlify site ID or custom domain (e.g. "my-site.netlify.app")',
      },
    },
    required: ['siteId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/sites/${params.siteId}`);

      const customDomains = (result.domain_aliases || []).join(', ') || 'none';
      const buildCmd = result.build_settings?.cmd || 'N/A';
      const publishDir = result.build_settings?.dir || 'N/A';
      const repo = result.build_settings?.repo_url || 'N/A';
      const branch = result.build_settings?.repo_branch || 'N/A';

      return {
        content: [
          `Site: ${result.name || 'unknown'}`,
          `ID: ${result.id || params.siteId}`,
          `URL: ${result.ssl_url || result.url || 'N/A'}`,
          `Admin URL: ${result.admin_url || 'N/A'}`,
          `Custom Domains: ${customDomains}`,
          `State: ${result.state || 'unknown'}`,
          `Deploy ID: ${result.published_deploy?.id || 'N/A'}`,
          `Published: ${result.published_deploy?.published_at || 'never'}`,
          `Build Command: ${buildCmd}`,
          `Publish Directory: ${publishDir}`,
          `Repository: ${repo} (branch: ${branch})`,
          `Created: ${result.created_at || 'unknown'}`,
          `Updated: ${result.updated_at || 'unknown'}`,
        ].join('\n'),
        metadata: {
          siteId: result.id || params.siteId,
          name: result.name,
          url: result.ssl_url || result.url,
        },
      };
    } catch (err) {
      return netlifyError(err);
    }
  },
};

// ─── Tool: netlify_list_deploys ─────────────────────────

const listDeploys: ToolHandler = {
  description:
    'List recent deploys for a Netlify site. Returns deploy IDs, states, commit messages, and timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'string',
        description: 'Netlify site ID',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Deploys per page (default 20, max 100)',
      },
    },
    required: ['siteId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 20),
      };

      const result = await ctx.apiExecutor.get(`/sites/${params.siteId}/deploys`, query);

      const deploys: any[] = Array.isArray(result) ? result : [];
      if (deploys.length === 0) {
        return { content: `No deploys found for site "${params.siteId}".` };
      }

      const lines = deploys.map((d: any) => {
        const id = d.id || 'unknown';
        const state = d.state || 'unknown';
        const created = d.created_at
          ? new Date(d.created_at).toISOString().slice(0, 16)
          : 'unknown';
        const title = d.title || d.commit_ref || 'no message';
        const branch = d.branch || 'unknown';
        const deployTime = d.deploy_time ? `${d.deploy_time}s` : 'N/A';
        return `${id} — ${state} (${branch}) ${title}, created: ${created}, build: ${deployTime}`;
      });

      return {
        content: `Found ${deploys.length} deploy(s) for site "${params.siteId}":\n${lines.join('\n')}`,
        metadata: { count: deploys.length, siteId: params.siteId },
      };
    } catch (err) {
      return netlifyError(err);
    }
  },
};

// ─── Tool: netlify_create_deploy ────────────────────────

const createDeploy: ToolHandler = {
  description:
    'Trigger a new deploy for a Netlify site. Can clear cache and set a custom title for the deploy.',
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'string',
        description: 'Netlify site ID',
      },
      title: {
        type: 'string',
        description: 'Deploy title / message',
      },
      clearCache: {
        type: 'boolean',
        description: 'Clear build cache before deploying (default false)',
      },
      branch: {
        type: 'string',
        description: 'Branch to deploy from (default: production branch)',
      },
    },
    required: ['siteId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.title) body.title = params.title;
      if (params.clearCache) body.clear_cache = true;
      if (params.branch) body.branch = params.branch;

      const result = await ctx.apiExecutor.post(`/sites/${params.siteId}/builds`, body);

      const deployId = result.deploy_id || result.id || 'unknown';
      const state = result.state || result.deploy?.state || 'enqueued';

      return {
        content: `Deploy triggered for site "${params.siteId}"\nDeploy ID: ${deployId}\nState: ${state}`,
        metadata: {
          siteId: params.siteId,
          deployId,
          state,
        },
      };
    } catch (err) {
      return netlifyError(err);
    }
  },
};

// ─── Tool: netlify_list_forms ───────────────────────────

const listForms: ToolHandler = {
  description:
    'List forms and their submission counts for a Netlify site.',
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'string',
        description: 'Netlify site ID',
      },
    },
    required: ['siteId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/sites/${params.siteId}/forms`);

      const forms: any[] = Array.isArray(result) ? result : [];
      if (forms.length === 0) {
        return { content: `No forms found for site "${params.siteId}".` };
      }

      const lines = forms.map((f: any) => {
        const name = f.name || 'unknown';
        const id = f.id || 'unknown';
        const submissions = f.submission_count ?? 0;
        const created = f.created_at
          ? new Date(f.created_at).toISOString().slice(0, 10)
          : 'unknown';
        return `${name} (ID: ${id}) — ${submissions} submission(s), created: ${created}`;
      });

      return {
        content: `Found ${forms.length} form(s) for site "${params.siteId}":\n${lines.join('\n')}`,
        metadata: { count: forms.length, siteId: params.siteId },
      };
    } catch (err) {
      return netlifyError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const netlifyAdapter: SkillAdapter = {
  skillId: 'netlify',
  name: 'Netlify',
  baseUrl: 'https://api.netlify.com/api/v1',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    netlify_list_sites: listSites,
    netlify_get_site: getSite,
    netlify_list_deploys: listDeploys,
    netlify_create_deploy: createDeploy,
    netlify_list_forms: listForms,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
