/**
 * MCP Skill Adapter — Shortcut (formerly Clubhouse)
 *
 * Maps Shortcut REST API v3 endpoints to MCP tool handlers.
 * Covers story listing, creation, search, and project/epic browsing.
 *
 * Shortcut API docs: https://developer.shortcut.com/api/rest/v3
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function shortcutError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.description || err.message;
      return { content: `Shortcut API error: ${detail}`, isError: true };
    }
    return { content: `Shortcut API error: ${err.message}`, isError: true };
  }
  return { content: `Shortcut API error: ${String(err)}`, isError: true };
}

// ─── Tool: shortcut_list_stories ────────────────────────

const listStories: ToolHandler = {
  description:
    'List stories in a Shortcut project. Returns story names, types, states, and assignees.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'number',
        description: 'Project ID to list stories from',
      },
    },
    required: ['projectId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/projects/${params.projectId}/stories`);

      const stories: any[] = Array.isArray(result) ? result : [];
      if (stories.length === 0) {
        return { content: `No stories found in project ${params.projectId}.` };
      }

      const lines = stories.map((s: any) => {
        const type = s.story_type || 'unknown';
        const state = s.workflow_state_id ? `state:${s.workflow_state_id}` : '';
        const owners = (s.owner_ids || []).length;
        return `#${s.id}: ${s.name} [${type}] ${state} — ${owners} owner(s)`;
      });

      return {
        content: `Found ${stories.length} stories:\n${lines.join('\n')}`,
        metadata: { count: stories.length, projectId: params.projectId },
      };
    } catch (err) {
      return shortcutError(err);
    }
  },
};

// ─── Tool: shortcut_create_story ────────────────────────

const createStory: ToolHandler = {
  description:
    'Create a new story in Shortcut. Specify name, project, story type, description, and optional fields.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Story name/title',
      },
      project_id: {
        type: 'number',
        description: 'Project ID to create the story in',
      },
      story_type: {
        type: 'string',
        enum: ['feature', 'bug', 'chore'],
        description: 'Story type (default "feature")',
      },
      description: {
        type: 'string',
        description: 'Story description (Markdown supported)',
      },
      owner_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'UUIDs of members to assign as owners',
      },
      epic_id: {
        type: 'number',
        description: 'Epic ID to associate the story with (optional)',
      },
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Label name' },
          },
        },
        description: 'Labels to apply (optional)',
      },
      estimate: {
        type: 'number',
        description: 'Story point estimate (optional)',
      },
    },
    required: ['name', 'project_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
        project_id: params.project_id,
        story_type: params.story_type || 'feature',
      };
      if (params.description) body.description = params.description;
      if (params.owner_ids?.length) body.owner_ids = params.owner_ids;
      if (params.epic_id) body.epic_id = params.epic_id;
      if (params.labels?.length) body.labels = params.labels;
      if (params.estimate !== undefined) body.estimate = params.estimate;

      const result = await ctx.apiExecutor.post('/stories', body);

      return {
        content: `Story created: #${result.id} — ${result.name} [${result.story_type}]\nURL: ${result.app_url}`,
        metadata: { id: result.id, name: result.name, url: result.app_url },
      };
    } catch (err) {
      return shortcutError(err);
    }
  },
};

// ─── Tool: shortcut_search_stories ──────────────────────

const searchStories: ToolHandler = {
  description:
    'Search for stories across Shortcut using a text query. Returns matching stories with IDs, names, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      page_size: {
        type: 'number',
        description: 'Number of results per page (default 25)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        query: params.query,
        page_size: params.page_size ?? 25,
      };

      const result = await ctx.apiExecutor.get('/search/stories', {
        query: params.query,
        page_size: String(params.page_size ?? 25),
      });

      const stories: any[] = result.data || [];
      const total = result.total ?? stories.length;

      if (stories.length === 0) {
        return { content: `No stories found for: "${params.query}"` };
      }

      const lines = stories.map((s: any) => {
        const type = s.story_type || 'unknown';
        return `#${s.id}: ${s.name} [${type}] — ${s.app_url}`;
      });

      return {
        content: `Found ${total} stories (showing ${stories.length}):\n${lines.join('\n')}`,
        metadata: { total, shown: stories.length, query: params.query },
      };
    } catch (err) {
      return shortcutError(err);
    }
  },
};

// ─── Tool: shortcut_list_projects ───────────────────────

const listProjects: ToolHandler = {
  description:
    'List all projects in Shortcut. Returns project names, IDs, and story counts.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/projects');

      const projects: any[] = Array.isArray(result) ? result : [];
      if (projects.length === 0) {
        return { content: 'No projects found.' };
      }

      const lines = projects.map((p: any) => {
        const desc = p.description ? ` — ${p.description.slice(0, 60)}` : '';
        const stories = p.num_stories ?? '?';
        return `${p.id}: ${p.name}${desc} (${stories} stories)`;
      });

      return {
        content: `Found ${projects.length} projects:\n${lines.join('\n')}`,
        metadata: { count: projects.length },
      };
    } catch (err) {
      return shortcutError(err);
    }
  },
};

// ─── Tool: shortcut_list_epics ──────────────────────────

const listEpics: ToolHandler = {
  description:
    'List all epics in Shortcut. Returns epic names, states, and story counts.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/epics');

      const epics: any[] = Array.isArray(result) ? result : [];
      if (epics.length === 0) {
        return { content: 'No epics found.' };
      }

      const lines = epics.map((e: any) => {
        const state = e.state || 'unknown';
        const stories = e.stats?.num_stories_total ?? '?';
        return `${e.id}: ${e.name} [${state}] — ${stories} stories`;
      });

      return {
        content: `Found ${epics.length} epics:\n${lines.join('\n')}`,
        metadata: { count: epics.length },
      };
    } catch (err) {
      return shortcutError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const shortcutAdapter: SkillAdapter = {
  skillId: 'shortcut',
  name: 'Shortcut',
  baseUrl: 'https://api.app.shortcut.com/api/v3',
  auth: {
    type: 'api_key',
    headerName: 'Shortcut-Token',
  },
  tools: {
    shortcut_list_stories: listStories,
    shortcut_create_story: createStory,
    shortcut_search_stories: searchStories,
    shortcut_list_projects: listProjects,
    shortcut_list_epics: listEpics,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
