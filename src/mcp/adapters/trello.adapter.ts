/**
 * MCP Skill Adapter — Trello
 *
 * Maps Trello REST API endpoints to MCP tool handlers.
 * Trello uses API key + token authentication passed as query parameters
 * on every request.
 *
 * Trello API docs: https://developer.atlassian.com/cloud/trello/rest/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/**
 * Build auth query params from credentials. Trello expects key= and token= on every request.
 */
function getTrelloAuth(ctx: ToolExecutionContext): Record<string, string> {
  const fields = ctx.credentials.fields || {};
  return {
    key: fields.apiKey || '',
    token: fields.token || '',
  };
}

function trelloError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (typeof data === 'string') {
      return { content: `Trello API error: ${data}`, isError: true };
    }
    if (data && typeof data === 'object' && data.message) {
      return { content: `Trello API error: ${data.message}`, isError: true };
    }
    return { content: `Trello API error: ${err.message}`, isError: true };
  }
  return { content: `Trello API error: ${String(err)}`, isError: true };
}

// ─── Tool: trello_create_card ───────────────────────────

const createCard: ToolHandler = {
  description:
    'Create a new card on a Trello board. Specify the list ID, card name, and optional description, due date, and labels.',
  inputSchema: {
    type: 'object',
    properties: {
      idList: {
        type: 'string',
        description: 'ID of the list to add the card to',
      },
      name: {
        type: 'string',
        description: 'Card name / title',
      },
      desc: {
        type: 'string',
        description: 'Card description (supports Markdown)',
      },
      due: {
        type: 'string',
        description: 'Due date (ISO 8601 format, e.g. "2024-03-15T12:00:00.000Z")',
      },
      idLabels: {
        type: 'string',
        description: 'Comma-separated label IDs to apply',
      },
      pos: {
        type: 'string',
        enum: ['top', 'bottom'],
        description: 'Position of the card in the list (default: "bottom")',
      },
    },
    required: ['idList', 'name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const auth = getTrelloAuth(ctx);
      const query: Record<string, string> = {
        ...auth,
        idList: params.idList,
        name: params.name,
      };

      if (params.desc) query.desc = params.desc;
      if (params.due) query.due = params.due;
      if (params.idLabels) query.idLabels = params.idLabels;
      if (params.pos) query.pos = params.pos;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/cards',
        query,
      });

      const dueInfo = result.due ? ` due ${result.due}` : '';
      return {
        content: `Card created: "${result.name}" (ID: ${result.id}) on list ${result.idList}${dueInfo}`,
        metadata: {
          id: result.id,
          name: result.name,
          shortUrl: result.shortUrl,
          idList: result.idList,
          idBoard: result.idBoard,
        },
      };
    } catch (err) {
      return trelloError(err);
    }
  },
};

// ─── Tool: trello_list_cards ────────────────────────────

const listCards: ToolHandler = {
  description:
    'List cards on a Trello board or in a specific list. Returns card names, IDs, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'Board ID to list cards from (use this OR list_id)',
      },
      list_id: {
        type: 'string',
        description: 'List ID to list cards from (use this OR board_id)',
      },
      filter: {
        type: 'string',
        enum: ['all', 'closed', 'none', 'open', 'visible'],
        description: 'Card filter (default: "open")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const auth = getTrelloAuth(ctx);
      const query: Record<string, string> = {
        ...auth,
        fields: 'name,idList,due,labels,shortUrl,closed',
      };

      if (params.filter) query.filter = params.filter;

      let path: string;
      if (params.list_id) {
        path = `/lists/${params.list_id}/cards`;
      } else if (params.board_id) {
        path = `/boards/${params.board_id}/cards`;
      } else {
        return { content: 'Please provide either board_id or list_id.', isError: true };
      }

      const cards: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        path,
        query,
      });

      if (cards.length === 0) {
        return { content: 'No cards found.' };
      }

      const lines = cards.map((c: any) => {
        const due = c.due ? ` due ${c.due.slice(0, 10)}` : '';
        const labels = c.labels?.length
          ? ` [${c.labels.map((l: any) => l.name || l.color).join(', ')}]`
          : '';
        const closed = c.closed ? ' (archived)' : '';
        return `${c.name} (${c.id})${labels}${due}${closed}`;
      });

      return {
        content: `Found ${cards.length} cards:\n${lines.join('\n')}`,
        metadata: { count: cards.length },
      };
    } catch (err) {
      return trelloError(err);
    }
  },
};

// ─── Tool: trello_list_boards ───────────────────────────

const listBoards: ToolHandler = {
  description:
    'List Trello boards accessible to the authenticated member. Returns board names, IDs, and URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['all', 'closed', 'members', 'open', 'public', 'starred'],
        description: 'Board filter (default: "open")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const auth = getTrelloAuth(ctx);
      const query: Record<string, string> = {
        ...auth,
        fields: 'name,closed,url,shortUrl,idOrganization',
      };

      if (params.filter) query.filter = params.filter;

      const boards: any[] = await ctx.apiExecutor.request({
        method: 'GET',
        path: '/members/me/boards',
        query,
      });

      if (boards.length === 0) {
        return { content: 'No boards found.' };
      }

      const lines = boards.map((b: any) => {
        const closed = b.closed ? ' [closed]' : '';
        return `${b.name} (${b.id})${closed} -- ${b.shortUrl}`;
      });

      return {
        content: `Found ${boards.length} boards:\n${lines.join('\n')}`,
        metadata: { count: boards.length },
      };
    } catch (err) {
      return trelloError(err);
    }
  },
};

// ─── Tool: trello_move_card ─────────────────────────────

const moveCard: ToolHandler = {
  description:
    'Move a Trello card to a different list or board. Provide the card ID and the target list ID.',
  inputSchema: {
    type: 'object',
    properties: {
      card_id: {
        type: 'string',
        description: 'ID of the card to move',
      },
      idList: {
        type: 'string',
        description: 'ID of the destination list',
      },
      idBoard: {
        type: 'string',
        description: 'ID of the destination board (optional, only needed when moving across boards)',
      },
      pos: {
        type: 'string',
        enum: ['top', 'bottom'],
        description: 'Position in the destination list (default: "bottom")',
      },
    },
    required: ['card_id', 'idList'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const auth = getTrelloAuth(ctx);
      const query: Record<string, string> = {
        ...auth,
        idList: params.idList,
      };

      if (params.idBoard) query.idBoard = params.idBoard;
      if (params.pos) query.pos = params.pos;

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        path: `/cards/${params.card_id}`,
        query,
      });

      return {
        content: `Card "${result.name}" (${result.id}) moved to list ${result.idList}`,
        metadata: {
          id: result.id,
          name: result.name,
          idList: result.idList,
          idBoard: result.idBoard,
          shortUrl: result.shortUrl,
        },
      };
    } catch (err) {
      return trelloError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const trelloAdapter: SkillAdapter = {
  skillId: 'trello-cards',
  name: 'Trello',
  baseUrl: 'https://api.trello.com/1',
  auth: {
    type: 'credentials',
    fields: ['apiKey', 'token'],
  },
  tools: {
    trello_create_card: createCard,
    trello_list_cards: listCards,
    trello_list_boards: listBoards,
    trello_move_card: moveCard,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
