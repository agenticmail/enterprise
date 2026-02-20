/**
 * MCP Skill Adapter — Monday.com
 *
 * Maps Monday.com GraphQL API to MCP tool handlers.
 * Monday uses a single POST /v2 endpoint for all operations — all requests
 * send a GraphQL query in the request body.
 *
 * Monday API docs: https://developer.monday.com/api-reference/reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function mondayError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: any[] = data.errors || [];
      if (errors.length > 0) {
        const messages = errors.map((e: any) => e.message || String(e));
        return { content: `Monday API error: ${messages.join('; ')}`, isError: true };
      }
      if (data.error_message) {
        return { content: `Monday API error: ${data.error_message}`, isError: true };
      }
    }
    return { content: `Monday API error: ${err.message}`, isError: true };
  }
  return { content: `Monday API error: ${String(err)}`, isError: true };
}

/**
 * Check GraphQL-level errors in the Monday response and throw if present.
 */
function assertMondayOk(result: any): void {
  if (result.errors && result.errors.length > 0) {
    const messages = result.errors.map((e: any) => e.message || String(e));
    const err = new Error(`Monday GraphQL error: ${messages.join('; ')}`);
    throw err;
  }
}

// ─── Tool: monday_list_boards ───────────────────────────

const listBoards: ToolHandler = {
  description:
    'List boards from the Monday.com account. Returns board names, IDs, and item counts.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of boards to return (default 25)',
      },
      board_kind: {
        type: 'string',
        enum: ['public', 'private', 'share'],
        description: 'Filter by board kind (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const limit = params.limit ?? 25;
      const kindFilter = params.board_kind ? `, board_kind: ${params.board_kind}` : '';

      const query = `query {
        boards(limit: ${limit}${kindFilter}) {
          id
          name
          state
          board_kind
          items_count
          workspace {
            name
          }
        }
      }`;

      const result = await ctx.apiExecutor.post('', { query });
      assertMondayOk(result);

      const boards: any[] = result.data?.boards || [];

      if (boards.length === 0) {
        return { content: 'No boards found.' };
      }

      const lines = boards.map((b: any) => {
        const workspace = b.workspace?.name ? ` [${b.workspace.name}]` : '';
        const items = b.items_count != null ? ` -- ${b.items_count} items` : '';
        return `${b.name} (${b.id}) ${b.board_kind}${workspace}${items}`;
      });

      return {
        content: `Found ${boards.length} boards:\n${lines.join('\n')}`,
        metadata: { count: boards.length },
      };
    } catch (err) {
      return mondayError(err);
    }
  },
};

// ─── Tool: monday_list_items ────────────────────────────

const listItems: ToolHandler = {
  description:
    'List items (rows) from a Monday.com board. Returns item names, IDs, and column values.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'Board ID to list items from',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of items to return (default 25)',
      },
      group_id: {
        type: 'string',
        description: 'Filter by group ID within the board (optional)',
      },
    },
    required: ['board_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const limit = params.limit ?? 25;

      let query: string;
      if (params.group_id) {
        query = `query {
          boards(ids: [${params.board_id}]) {
            groups(ids: ["${params.group_id}"]) {
              title
              items_page(limit: ${limit}) {
                items {
                  id
                  name
                  state
                  group { title }
                  column_values {
                    id
                    text
                    type
                  }
                }
              }
            }
          }
        }`;
      } else {
        query = `query {
          boards(ids: [${params.board_id}]) {
            items_page(limit: ${limit}) {
              items {
                id
                name
                state
                group { title }
                column_values {
                  id
                  text
                  type
                }
              }
            }
          }
        }`;
      }

      const result = await ctx.apiExecutor.post('', { query });
      assertMondayOk(result);

      let items: any[];
      if (params.group_id) {
        const groups = result.data?.boards?.[0]?.groups || [];
        items = groups.flatMap((g: any) => g.items_page?.items || []);
      } else {
        items = result.data?.boards?.[0]?.items_page?.items || [];
      }

      if (items.length === 0) {
        return { content: `No items found on board ${params.board_id}.` };
      }

      const lines = items.map((item: any) => {
        const group = item.group?.title ? ` [${item.group.title}]` : '';
        const cols = (item.column_values || [])
          .filter((c: any) => c.text)
          .map((c: any) => `${c.id}: ${c.text}`)
          .join(', ');
        const colInfo = cols ? ` -- ${cols}` : '';
        return `${item.name} (${item.id})${group}${colInfo}`;
      });

      return {
        content: `Found ${items.length} items:\n${lines.join('\n')}`,
        metadata: { count: items.length, board_id: params.board_id },
      };
    } catch (err) {
      return mondayError(err);
    }
  },
};

// ─── Tool: monday_create_item ───────────────────────────

const createItem: ToolHandler = {
  description:
    'Create a new item (row) on a Monday.com board. Optionally specify a group and column values as JSON.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'Board ID to create the item on',
      },
      item_name: {
        type: 'string',
        description: 'Name of the new item',
      },
      group_id: {
        type: 'string',
        description: 'Group ID to place the item in (optional, uses default group if omitted)',
      },
      column_values: {
        type: 'string',
        description: 'JSON string of column values (e.g. \'{"status": {"label": "Working on it"}, "date4": {"date": "2024-01-15"}}\')',
      },
    },
    required: ['board_id', 'item_name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const groupArg = params.group_id ? `, group_id: "${params.group_id}"` : '';
      const colArg = params.column_values
        ? `, column_values: ${JSON.stringify(params.column_values)}`
        : '';

      const query = `mutation {
        create_item(
          board_id: ${params.board_id},
          item_name: ${JSON.stringify(params.item_name)}${groupArg}${colArg}
        ) {
          id
          name
          board {
            name
          }
          group {
            title
          }
        }
      }`;

      const result = await ctx.apiExecutor.post('', { query });
      assertMondayOk(result);

      const item = result.data?.create_item;
      if (!item) {
        return { content: 'Item creation returned no data.', isError: true };
      }

      const boardName = item.board?.name ? ` on "${item.board.name}"` : '';
      const groupName = item.group?.title ? ` in group "${item.group.title}"` : '';

      return {
        content: `Item created: "${item.name}" (ID: ${item.id})${boardName}${groupName}`,
        metadata: {
          id: item.id,
          name: item.name,
          board_id: params.board_id,
        },
      };
    } catch (err) {
      return mondayError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const mondayAdapter: SkillAdapter = {
  skillId: 'monday-boards',
  name: 'Monday.com',
  baseUrl: 'https://api.monday.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'monday',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  tools: {
    monday_list_boards: listBoards,
    monday_list_items: listItems,
    monday_create_item: createItem,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 15 },
};
