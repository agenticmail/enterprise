/**
 * MCP Skill Adapter — Docker Hub
 *
 * Maps Docker Hub REST API v2 endpoints to MCP tool handlers.
 * Provides access to image search, repository listing, and tag listing.
 *
 * Docker Hub API docs: https://docs.docker.com/docker-hub/api/latest/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function dockerError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.detail || data.errinfo?.message || err.message;
      return { content: `Docker Hub API error: ${msg}`, isError: true };
    }
    return { content: `Docker Hub API error: ${err.message}`, isError: true };
  }
  return { content: `Docker Hub API error: ${String(err)}`, isError: true };
}

// ─── Tool: docker_search_images ─────────────────────────

const searchImages: ToolHandler = {
  description:
    'Search for Docker images on Docker Hub by keyword. Returns image names, descriptions, and star counts.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search term (e.g. "nginx", "node", "postgres")',
      },
      page_size: {
        type: 'number',
        description: 'Number of results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        query: params.query,
        page_size: String(params.page_size ?? 25),
        page: String(params.page ?? 1),
      };

      const result = await ctx.apiExecutor.get('/search/repositories', query);

      const images: any[] = Array.isArray(result.results) ? result.results : [];
      if (images.length === 0) {
        return { content: `No images found for query: "${params.query}"` };
      }

      const lines = images.map((img: any) => {
        const desc = img.short_description ? ` -- ${img.short_description}` : '';
        const stars = img.star_count ?? 0;
        const official = img.is_official ? ' [official]' : '';
        return `${img.repo_name || img.name}${official}${desc} (${stars} stars)`;
      });

      return {
        content: `Found ${result.count || images.length} images for "${params.query}" (showing ${images.length}):\n${lines.join('\n')}`,
        metadata: {
          total: result.count,
          shown: images.length,
          query: params.query,
        },
      };
    } catch (err) {
      return dockerError(err);
    }
  },
};

// ─── Tool: docker_list_repos ────────────────────────────

const listRepos: ToolHandler = {
  description:
    'List Docker Hub repositories for a specific user or organization namespace.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Docker Hub username or organization name',
      },
      page_size: {
        type: 'number',
        description: 'Number of results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    required: ['namespace'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page_size: String(params.page_size ?? 25),
        page: String(params.page ?? 1),
      };

      const result = await ctx.apiExecutor.get(
        `/repositories/${params.namespace}`,
        query,
      );

      const repos: any[] = Array.isArray(result.results) ? result.results : [];
      if (repos.length === 0) {
        return { content: `No repositories found for namespace "${params.namespace}".` };
      }

      const lines = repos.map((r: any) => {
        const desc = r.description ? ` -- ${r.description}` : '';
        const stars = r.star_count ?? 0;
        const pulls = r.pull_count ?? 0;
        const visibility = r.is_private ? 'private' : 'public';
        return `${r.namespace}/${r.name}${desc} (${visibility}, ${stars} stars, ${pulls} pulls)`;
      });

      return {
        content: `Found ${result.count || repos.length} repositories for "${params.namespace}" (showing ${repos.length}):\n${lines.join('\n')}`,
        metadata: {
          total: result.count,
          shown: repos.length,
          namespace: params.namespace,
        },
      };
    } catch (err) {
      return dockerError(err);
    }
  },
};

// ─── Tool: docker_list_tags ─────────────────────────────

const listTags: ToolHandler = {
  description:
    'List available tags for a Docker Hub repository. Returns tag names, image sizes, and last-updated timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Docker Hub username or organization (use "library" for official images)',
      },
      repository: {
        type: 'string',
        description: 'Repository name (e.g. "nginx", "node")',
      },
      page_size: {
        type: 'number',
        description: 'Number of results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
    required: ['namespace', 'repository'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page_size: String(params.page_size ?? 25),
        page: String(params.page ?? 1),
      };

      const result = await ctx.apiExecutor.get(
        `/repositories/${params.namespace}/${params.repository}/tags`,
        query,
      );

      const tags: any[] = Array.isArray(result.results) ? result.results : [];
      if (tags.length === 0) {
        return {
          content: `No tags found for ${params.namespace}/${params.repository}.`,
        };
      }

      const lines = tags.map((t: any) => {
        const updated = t.last_updated ? new Date(t.last_updated).toISOString().slice(0, 10) : '';
        const size = t.full_size
          ? `${(t.full_size / (1024 * 1024)).toFixed(1)} MB`
          : 'unknown size';
        return `${t.name} (${size}) -- updated: ${updated}`;
      });

      return {
        content: `Found ${result.count || tags.length} tags for ${params.namespace}/${params.repository} (showing ${tags.length}):\n${lines.join('\n')}`,
        metadata: {
          total: result.count,
          shown: tags.length,
          namespace: params.namespace,
          repository: params.repository,
        },
      };
    } catch (err) {
      return dockerError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const dockerAdapter: SkillAdapter = {
  skillId: 'docker-containers',
  name: 'Docker Hub',
  baseUrl: 'https://hub.docker.com/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    docker_search_images: searchImages,
    docker_list_repos: listRepos,
    docker_list_tags: listTags,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 25,
  },
};
