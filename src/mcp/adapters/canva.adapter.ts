/**
 * MCP Skill Adapter — Canva
 *
 * Maps Canva Connect REST API v1 endpoints to MCP tool handlers.
 * API reference: https://www.canva.dev/docs/connect/
 *
 * Tools:
 *   - canva_list_designs  List designs owned by the authenticated user
 *   - canva_get_design    Get detailed metadata for a specific design
 *   - canva_create_design Create a new Canva design
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

/** Build a human-readable error result from a Canva API error. */
function canvaError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.error?.message || data.code;
      if (message) {
        return { content: `Canva API error: ${message}`, isError: true };
      }
    }
    return { content: `Canva API error: ${err.message}`, isError: true };
  }
  return { content: String(err), isError: true };
}

// ─── Tool: canva_list_designs ───────────────────────────

const canvaListDesigns: ToolHandler = {
  description:
    'List Canva designs owned by the authenticated user. Supports pagination and optional search query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to filter designs by title (optional)',
      },
      continuation: {
        type: 'string',
        description: 'Continuation token for pagination (from a previous response)',
      },
      ownership: {
        type: 'string',
        enum: ['owned', 'shared', 'any'],
        description: 'Filter by ownership type (default: owned)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.query) query.query = params.query;
      if (params.continuation) query.continuation = params.continuation;
      if (params.ownership) query.ownership = params.ownership;

      const data = await ctx.apiExecutor.get('/designs', query);

      const designs: any[] = data.items ?? [];
      if (designs.length === 0) {
        return {
          content: 'No designs found.',
          metadata: { designCount: 0 },
        };
      }

      const lines = designs.map((d: any) => {
        const title = d.title || '(Untitled)';
        const modified = shortDate(d.updated_at);
        const url = d.urls?.edit_url ?? d.urls?.view_url ?? '';
        const urlPart = url ? ` -- ${url}` : '';
        return `  - ${title} (ID: ${d.id}) -- modified ${modified}${urlPart}`;
      });

      const content = `Found ${designs.length} design(s):\n\n${lines.join('\n')}`;

      return {
        content,
        metadata: {
          designCount: designs.length,
          continuation: data.continuation ?? null,
        },
      };
    } catch (err) {
      return canvaError(err);
    }
  },
};

// ─── Tool: canva_get_design ─────────────────────────────

const canvaGetDesign: ToolHandler = {
  description:
    'Get detailed metadata for a specific Canva design, including title, URLs, page count, and timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      design_id: {
        type: 'string',
        description: 'The Canva design ID',
      },
    },
    required: ['design_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const design = await ctx.apiExecutor.get(`/designs/${params.design_id}`);

      const d = design.design ?? design;
      const title = d.title || '(Untitled)';
      const created = shortDate(d.created_at);
      const modified = shortDate(d.updated_at);
      const editUrl = d.urls?.edit_url ?? 'N/A';
      const viewUrl = d.urls?.view_url ?? 'N/A';
      const thumbnailUrl = d.thumbnail?.url ?? 'N/A';
      const pageCount = d.page_count ?? 'unknown';

      const content = [
        `Design: ${title}`,
        `ID: ${d.id}`,
        `Created: ${created}`,
        `Last modified: ${modified}`,
        `Pages: ${pageCount}`,
        `Edit URL: ${editUrl}`,
        `View URL: ${viewUrl}`,
        `Thumbnail: ${thumbnailUrl}`,
      ].join('\n');

      return {
        content,
        metadata: {
          designId: d.id,
          title,
          editUrl,
          viewUrl,
          pageCount,
        },
      };
    } catch (err) {
      return canvaError(err);
    }
  },
};

// ─── Tool: canva_create_design ──────────────────────────

const canvaCreateDesign: ToolHandler = {
  description:
    'Create a new Canva design. Specify a title and design type. Returns the new design ID and edit URL.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title for the new design',
      },
      design_type: {
        type: 'string',
        description:
          'Preset design type (e.g. "Presentation", "Poster", "InstagramPost", "A4Document", "Logo"). If omitted, creates a custom-size design.',
      },
      width: {
        type: 'number',
        description: 'Width in pixels (only used if design_type is omitted)',
      },
      height: {
        type: 'number',
        description: 'Height in pixels (only used if design_type is omitted)',
      },
    },
    required: ['title'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        title: params.title,
      };

      if (params.design_type) {
        body.design_type = { type: params.design_type };
      } else if (params.width && params.height) {
        body.design_type = {
          type: 'custom',
          width: params.width,
          height: params.height,
        };
      }

      const result = await ctx.apiExecutor.post('/designs', body);

      const d = result.design ?? result;
      const editUrl = d.urls?.edit_url ?? 'N/A';

      return {
        content: `Design created: ${params.title} (ID: ${d.id})\nEdit URL: ${editUrl}`,
        metadata: {
          designId: d.id,
          title: params.title,
          editUrl,
        },
      };
    } catch (err) {
      return canvaError(err);
    }
  },
};

// ─── Adapter ────────────────────────────────────────────

export const canvaAdapter: SkillAdapter = {
  skillId: 'canva-design',
  name: 'Canva',
  baseUrl: 'https://api.canva.com/rest/v1',
  auth: {
    type: 'oauth2',
    provider: 'canva',
    headerPrefix: 'Bearer',
  },
  tools: {
    canva_list_designs: canvaListDesigns,
    canva_get_design: canvaGetDesign,
    canva_create_design: canvaCreateDesign,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
