/**
 * MCP Skill Adapter — Miro
 *
 * Maps Miro REST API v2 endpoints to MCP tool handlers.
 * Supports board management, sticky notes, and item listing.
 *
 * Miro API docs: https://developers.miro.com/reference/api-reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function miroError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.message || data.type || err.message;
      const code = data.code ? ` (code ${data.code})` : '';
      return { content: `Miro API error: ${detail}${code}`, isError: true };
    }
    return { content: `Miro API error: ${err.message}`, isError: true };
  }
  return { content: `Miro API error: ${String(err)}`, isError: true };
}

// ─── Tool: miro_list_boards ─────────────────────────────

const listBoards: ToolHandler = {
  description:
    'List Miro boards accessible to the authenticated user. Returns board names, IDs, and last modification dates.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to filter boards by name (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of boards to return (default 20)',
      },
      sort: {
        type: 'string',
        enum: ['default', 'last_modified', 'last_opened', 'last_created', 'alphabetically'],
        description: 'Sort order for boards (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.query) query.query = params.query;
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get('/boards', query);

      const boards: any[] = result.data || [];
      if (boards.length === 0) {
        return { content: 'No boards found.' };
      }

      const lines = boards.map((b: any) => {
        const modified = b.modifiedAt ? b.modifiedAt.slice(0, 16) : 'N/A';
        const owner = b.owner?.name || 'unknown';
        return `${b.name} — ID: ${b.id} — Owner: ${owner} — Modified: ${modified}`;
      });

      return {
        content: `Found ${boards.length} boards:\n${lines.join('\n')}`,
        metadata: { count: boards.length },
      };
    } catch (err) {
      return miroError(err);
    }
  },
};

// ─── Tool: miro_create_board ────────────────────────────

const createBoard: ToolHandler = {
  description:
    'Create a new Miro board. Provide a name and optional description.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the new board',
      },
      description: {
        type: 'string',
        description: 'Board description (optional)',
      },
      policy: {
        type: 'string',
        enum: ['private', 'view', 'comment', 'edit'],
        description: 'Default sharing policy for the board (optional)',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
      };
      if (params.description) body.description = params.description;
      if (params.policy) {
        body.policy = {
          sharingPolicy: { access: params.policy },
        };
      }

      const result = await ctx.apiExecutor.post('/boards', body);

      return {
        content: `Board "${result.name}" created (ID: ${result.id})\nView link: ${result.viewLink || 'N/A'}`,
        metadata: { boardId: result.id, name: result.name, viewLink: result.viewLink },
      };
    } catch (err) {
      return miroError(err);
    }
  },
};

// ─── Tool: miro_create_sticky_note ──────────────────────

const createStickyNote: ToolHandler = {
  description:
    'Create a sticky note on a Miro board. Specify the board ID, note content, and optional position and color.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'The ID of the board to create the sticky note on',
      },
      content: {
        type: 'string',
        description: 'Text content of the sticky note (supports basic HTML)',
      },
      color: {
        type: 'string',
        enum: ['gray', 'light_yellow', 'yellow', 'orange', 'light_green', 'green', 'dark_green', 'cyan', 'light_pink', 'pink', 'violet', 'red', 'light_blue', 'blue', 'dark_blue', 'black'],
        description: 'Sticky note color (optional, default: "light_yellow")',
      },
      x: {
        type: 'number',
        description: 'X position on the board (optional)',
      },
      y: {
        type: 'number',
        description: 'Y position on the board (optional)',
      },
    },
    required: ['board_id', 'content'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        data: {
          content: params.content,
          shape: 'square',
        },
      };

      if (params.color) {
        body.style = { fillColor: params.color };
      }

      if (params.x !== undefined || params.y !== undefined) {
        body.position = {
          x: params.x ?? 0,
          y: params.y ?? 0,
        };
      }

      const result = await ctx.apiExecutor.post(
        `/boards/${params.board_id}/sticky_notes`,
        body,
      );

      return {
        content: `Sticky note created on board ${params.board_id} (item ID: ${result.id})`,
        metadata: { itemId: result.id, boardId: params.board_id },
      };
    } catch (err) {
      return miroError(err);
    }
  },
};

// ─── Tool: miro_list_items ──────────────────────────────

const listItems: ToolHandler = {
  description:
    'List items on a Miro board. Returns sticky notes, shapes, text, and other board items.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'The ID of the board to list items from',
      },
      type: {
        type: 'string',
        description: 'Filter by item type (e.g. "sticky_note", "shape", "text", "card")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of items to return (default 25)',
      },
    },
    required: ['board_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.type) query.type = params.type;

      const result = await ctx.apiExecutor.get(
        `/boards/${params.board_id}/items`,
        query,
      );

      const items: any[] = result.data || [];
      if (items.length === 0) {
        return { content: `No items found on board ${params.board_id}.` };
      }

      const lines = items.map((item: any) => {
        const type = item.type || 'unknown';
        const content = item.data?.content?.slice(0, 80) || item.data?.title?.slice(0, 80) || 'N/A';
        const modified = item.modifiedAt ? item.modifiedAt.slice(0, 16) : '';
        return `[${type}] ${content} — ID: ${item.id} (${modified})`;
      });

      return {
        content: `Found ${items.length} items on board ${params.board_id}:\n${lines.join('\n')}`,
        metadata: { count: items.length, boardId: params.board_id },
      };
    } catch (err) {
      return miroError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const miroAdapter: SkillAdapter = {
  skillId: 'miro-boards',
  name: 'Miro',
  baseUrl: 'https://api.miro.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'miro',
  },
  tools: {
    miro_list_boards: listBoards,
    miro_create_board: createBoard,
    miro_create_sticky_note: createStickyNote,
    miro_list_items: listItems,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 15 },
};
