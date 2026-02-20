/**
 * MCP Skill Adapter — LaunchDarkly
 *
 * Maps LaunchDarkly API v2 endpoints to MCP tool handlers.
 * Covers feature flag management, project listing, and environment listing.
 *
 * LaunchDarkly API docs: https://apidocs.launchdarkly.com/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function ldError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code || '';
      const message = data.message || err.message;
      return { content: `LaunchDarkly API error (${code}): ${message}`, isError: true };
    }
    return { content: `LaunchDarkly API error: ${err.message}`, isError: true };
  }
  return { content: `LaunchDarkly API error: ${String(err)}`, isError: true };
}

// ─── Tool: ld_list_flags ────────────────────────────────

const listFlags: ToolHandler = {
  description:
    'List feature flags in a LaunchDarkly project. Returns flag names, keys, statuses, and variation counts.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'The project key (e.g. "default")',
      },
      env: {
        type: 'string',
        description: 'Environment key to show flag status for (e.g. "production")',
      },
      tag: {
        type: 'string',
        description: 'Filter flags by tag',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of flags to return (default 20)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    required: ['project_key'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.env) query.env = params.env;
      if (params.tag) query.tag = params.tag;

      const result = await ctx.apiExecutor.get(
        `/flags/${params.project_key}`,
        query,
      );

      const flags: any[] = result.items || [];
      const totalCount = result.totalCount || flags.length;

      if (flags.length === 0) {
        return {
          content: `No feature flags found in project "${params.project_key}".`,
          metadata: { flagCount: 0 },
        };
      }

      const lines = flags.map((f: any) => {
        const variations = (f.variations || []).length;
        const tags = (f.tags || []).join(', ') || 'no tags';
        const archived = f.archived ? ' [ARCHIVED]' : '';
        return `• ${f.name} (key: ${f.key}) — ${variations} variations, tags: ${tags}${archived}`;
      });

      return {
        content: `Found ${flags.length} of ${totalCount} flag(s) in "${params.project_key}":\n\n${lines.join('\n')}`,
        metadata: { flagCount: flags.length, totalCount, projectKey: params.project_key },
      };
    } catch (err) {
      return ldError(err);
    }
  },
};

// ─── Tool: ld_get_flag ──────────────────────────────────

const getFlag: ToolHandler = {
  description:
    'Retrieve details of a specific feature flag by key. Returns the flag configuration, variations, targets, and environment states.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'The project key',
      },
      flag_key: {
        type: 'string',
        description: 'The feature flag key',
      },
      env: {
        type: 'string',
        description: 'Environment key to include status for',
      },
    },
    required: ['project_key', 'flag_key'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.env) query.env = params.env;

      const flag = await ctx.apiExecutor.get(
        `/flags/${params.project_key}/${params.flag_key}`,
        query,
      );

      const variations = (flag.variations || []).map((v: any, idx: number) => {
        return `  ${idx}: ${JSON.stringify(v.value)} (${v.name || 'unnamed'})`;
      });

      const envKeys = Object.keys(flag.environments || {});
      const envLines = envKeys.map((envKey: string) => {
        const env = flag.environments[envKey];
        const on = env.on ? 'ON' : 'OFF';
        return `  ${envKey}: ${on}`;
      });

      const content = [
        `Flag: ${flag.name} (key: ${flag.key})`,
        `Description: ${flag.description || '(none)'}`,
        `Kind: ${flag.kind || 'unknown'}`,
        `Temporary: ${flag.temporary ? 'Yes' : 'No'}`,
        `Archived: ${flag.archived ? 'Yes' : 'No'}`,
        `Tags: ${(flag.tags || []).join(', ') || 'none'}`,
        `Created: ${flag.creationDate ? new Date(flag.creationDate).toLocaleString() : 'unknown'}`,
        `Variations (${variations.length}):`,
        ...variations,
        `Environments (${envLines.length}):`,
        ...envLines,
      ].join('\n');

      return {
        content,
        metadata: {
          flagKey: flag.key,
          name: flag.name,
          kind: flag.kind,
        },
      };
    } catch (err) {
      return ldError(err);
    }
  },
};

// ─── Tool: ld_toggle_flag ───────────────────────────────

const toggleFlag: ToolHandler = {
  description:
    'Toggle a feature flag on or off in a specific environment. Uses a JSON Patch operation to update the flag state.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'The project key',
      },
      flag_key: {
        type: 'string',
        description: 'The feature flag key',
      },
      environment_key: {
        type: 'string',
        description: 'The environment key (e.g. "production", "staging")',
      },
      on: {
        type: 'boolean',
        description: 'Set to true to enable the flag, false to disable',
      },
      comment: {
        type: 'string',
        description: 'Optional comment explaining the change',
      },
    },
    required: ['project_key', 'flag_key', 'environment_key', 'on'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        comment: params.comment || '',
        patch: [
          {
            op: 'replace',
            path: `/environments/${params.environment_key}/on`,
            value: params.on,
          },
        ],
      };

      const result = await ctx.apiExecutor.patch(
        `/flags/${params.project_key}/${params.flag_key}`,
        body,
      );

      const envState = result.environments?.[params.environment_key];
      const isOn = envState?.on ? 'ON' : 'OFF';

      return {
        content: `Flag "${params.flag_key}" is now ${isOn} in environment "${params.environment_key}".`,
        metadata: {
          flagKey: params.flag_key,
          environment: params.environment_key,
          on: params.on,
        },
      };
    } catch (err) {
      return ldError(err);
    }
  },
};

// ─── Tool: ld_list_projects ─────────────────────────────

const listProjects: ToolHandler = {
  description:
    'List LaunchDarkly projects. Returns project names, keys, and environment counts.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of projects to return (default 20)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };

      const result = await ctx.apiExecutor.get('/projects', query);
      const projects: any[] = result.items || [];
      const totalCount = result.totalCount || projects.length;

      if (projects.length === 0) {
        return {
          content: 'No projects found.',
          metadata: { projectCount: 0 },
        };
      }

      const lines = projects.map((p: any) => {
        const envCount = (p.environments?.items || []).length;
        const tags = (p.tags || []).join(', ') || 'no tags';
        return `• ${p.name} (key: ${p.key}) — ${envCount} environment(s), tags: ${tags}`;
      });

      return {
        content: `Found ${projects.length} of ${totalCount} project(s):\n\n${lines.join('\n')}`,
        metadata: { projectCount: projects.length, totalCount },
      };
    } catch (err) {
      return ldError(err);
    }
  },
};

// ─── Tool: ld_list_environments ─────────────────────────

const listEnvironments: ToolHandler = {
  description:
    'List environments within a LaunchDarkly project. Returns environment names, keys, colors, and SDK keys.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'The project key',
      },
    },
    required: ['project_key'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/projects/${params.project_key}/environments`,
      );

      const environments: any[] = result.items || [];

      if (environments.length === 0) {
        return {
          content: `No environments found in project "${params.project_key}".`,
          metadata: { envCount: 0 },
        };
      }

      const lines = environments.map((e: any) => {
        const color = e.color || 'none';
        const critical = e.critical ? ' [CRITICAL]' : '';
        return `• ${e.name} (key: ${e.key}) — color: #${color}${critical}`;
      });

      return {
        content: `Found ${environments.length} environment(s) in "${params.project_key}":\n\n${lines.join('\n')}`,
        metadata: { envCount: environments.length, projectKey: params.project_key },
      };
    } catch (err) {
      return ldError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const launchdarklyAdapter: SkillAdapter = {
  skillId: 'launchdarkly',
  name: 'LaunchDarkly',
  baseUrl: 'https://app.launchdarkly.com/api/v2',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
  },
  tools: {
    ld_list_flags: listFlags,
    ld_get_flag: getFlag,
    ld_toggle_flag: toggleFlag,
    ld_list_projects: listProjects,
    ld_list_environments: listEnvironments,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
