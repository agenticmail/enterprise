/**
 * MCP Skill Adapter — Figma
 *
 * Maps Figma REST API endpoints to MCP tool handlers.
 * API reference: https://www.figma.com/developers/api
 *
 * Tools:
 *   - figma_get_file       Retrieve a Figma file's metadata and structure
 *   - figma_list_projects  List projects within a team
 *   - figma_get_comments   Get comments on a file
 *   - figma_post_comment   Post a comment on a file
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Format an ISO date string into a short readable form. */
function shortDate(iso: string | undefined): string {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build a human-readable error result from a Figma API error. */
function figmaError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.err || data.status;
      if (message) {
        return { content: `Figma API error: ${message}`, isError: true };
      }
    }
    return { content: `Figma API error: ${err.message}`, isError: true };
  }
  return { content: String(err), isError: true };
}

/** Recursively count the number of nodes in a Figma document tree. */
function countNodes(node: any): number {
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/** Summarise top-level pages/frames from a Figma document. */
function summarisePages(document: any): string[] {
  const pages: any[] = document?.children ?? [];
  return pages.map((page: any) => {
    const childCount = (page.children ?? []).length;
    return `  - ${page.name} (${page.type}, ${childCount} direct children)`;
  });
}

// ─── Tool: figma_get_file ───────────────────────────────

const figmaGetFile: ToolHandler = {
  description:
    'Retrieve a Figma file by key. Returns the file name, last modified date, version, and a summary of its page structure.',
  inputSchema: {
    type: 'object',
    properties: {
      file_key: {
        type: 'string',
        description: 'The Figma file key (from the file URL, e.g. "abc123XYZ")',
      },
      depth: {
        type: 'number',
        description: 'How deep to traverse the document tree (default 1, max 4). Lower values return faster.',
      },
    },
    required: ['file_key'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.depth != null) query.depth = String(params.depth);

      const file = await ctx.apiExecutor.get(`/files/${params.file_key}`, query);

      const name = file.name ?? '(Untitled)';
      const lastModified = shortDate(file.lastModified);
      const version = file.version ?? 'unknown';
      const totalNodes = countNodes(file.document ?? {});
      const pageLines = summarisePages(file.document);

      const content = [
        `File: ${name}`,
        `Key: ${params.file_key}`,
        `Last modified: ${lastModified}`,
        `Version: ${version}`,
        `Total nodes: ${totalNodes}`,
        '',
        'Pages:',
        pageLines.length > 0 ? pageLines.join('\n') : '  (no pages)',
      ].join('\n');

      return {
        content,
        metadata: {
          fileKey: params.file_key,
          name,
          version,
          lastModified: file.lastModified,
          pageCount: (file.document?.children ?? []).length,
        },
      };
    } catch (err) {
      return figmaError(err);
    }
  },
};

// ─── Tool: figma_list_projects ──────────────────────────

const figmaListProjects: ToolHandler = {
  description:
    'List all projects within a Figma team. Returns project names and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      team_id: {
        type: 'string',
        description: 'The Figma team ID',
      },
    },
    required: ['team_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const data = await ctx.apiExecutor.get(`/teams/${params.team_id}/projects`);

      const projects: any[] = data.projects ?? [];
      if (projects.length === 0) {
        return {
          content: 'No projects found for this team.',
          metadata: { projectCount: 0 },
        };
      }

      const lines = projects.map((p: any) => {
        return `  - ${p.name} (ID: ${p.id})`;
      });

      return {
        content: `Found ${projects.length} project(s):\n\n${lines.join('\n')}`,
        metadata: {
          teamId: params.team_id,
          projectCount: projects.length,
          projectIds: projects.map((p: any) => p.id),
        },
      };
    } catch (err) {
      return figmaError(err);
    }
  },
};

// ─── Tool: figma_get_comments ───────────────────────────

const figmaGetComments: ToolHandler = {
  description:
    'Get all comments on a Figma file. Returns comment text, author, and timestamp.',
  inputSchema: {
    type: 'object',
    properties: {
      file_key: {
        type: 'string',
        description: 'The Figma file key',
      },
    },
    required: ['file_key'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const data = await ctx.apiExecutor.get(`/files/${params.file_key}/comments`);

      const comments: any[] = data.comments ?? [];
      if (comments.length === 0) {
        return {
          content: 'No comments on this file.',
          metadata: { commentCount: 0 },
        };
      }

      const lines = comments.map((c: any) => {
        const author = c.user?.handle ?? 'Unknown';
        const date = shortDate(c.created_at);
        const resolved = c.resolved_at ? ' [resolved]' : '';
        const message = c.message ?? '(empty)';
        return `  - ${author} (${date})${resolved}: ${message}`;
      });

      return {
        content: `${comments.length} comment(s) on file ${params.file_key}:\n\n${lines.join('\n')}`,
        metadata: {
          fileKey: params.file_key,
          commentCount: comments.length,
        },
      };
    } catch (err) {
      return figmaError(err);
    }
  },
};

// ─── Tool: figma_post_comment ───────────────────────────

const figmaPostComment: ToolHandler = {
  description:
    'Post a comment on a Figma file. Optionally attach it to a specific node or reply to an existing comment.',
  inputSchema: {
    type: 'object',
    properties: {
      file_key: {
        type: 'string',
        description: 'The Figma file key',
      },
      message: {
        type: 'string',
        description: 'The comment text',
      },
      comment_id: {
        type: 'string',
        description: 'ID of the parent comment to reply to (optional)',
      },
      client_meta: {
        type: 'object',
        description: 'Position metadata — e.g. { "node_id": "1:2", "node_offset": { "x": 0, "y": 0 } }',
      },
    },
    required: ['file_key', 'message'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        message: params.message,
      };
      if (params.comment_id) body.comment_id = params.comment_id;
      if (params.client_meta) body.client_meta = params.client_meta;

      const result = await ctx.apiExecutor.post(`/files/${params.file_key}/comments`, body);

      return {
        content: `Comment posted on file ${params.file_key} (comment ID: ${result.id})`,
        metadata: {
          fileKey: params.file_key,
          commentId: result.id,
          author: result.user?.handle,
        },
      };
    } catch (err) {
      return figmaError(err);
    }
  },
};

// ─── Adapter ────────────────────────────────────────────

export const figmaAdapter: SkillAdapter = {
  skillId: 'figma-design',
  name: 'Figma',
  baseUrl: 'https://api.figma.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'figma',
    headerPrefix: 'Bearer',
  },
  tools: {
    figma_get_file: figmaGetFile,
    figma_list_projects: figmaListProjects,
    figma_get_comments: figmaGetComments,
    figma_post_comment: figmaPostComment,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
