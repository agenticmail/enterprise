/**
 * MCP Skill Adapter — Notion
 *
 * Maps Notion REST API endpoints to MCP tool handlers.
 * API reference: https://developers.notion.com/reference
 *
 * Tools:
 *   - notion_search       Search pages and databases
 *   - notion_get_page     Retrieve a page with its content blocks
 *   - notion_create_page  Create a new page in a database
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Extract a plain-text title from a Notion page object. */
function extractTitle(page: any): string {
  const props = page.properties ?? {};
  for (const prop of Object.values(props) as any[]) {
    if (prop?.type === 'title' && Array.isArray(prop.title)) {
      return prop.title.map((t: any) => t.plain_text ?? '').join('');
    }
  }
  return '(Untitled)';
}

/** Get an icon string from a Notion page/database object. */
function extractIcon(obj: any): string {
  if (obj.icon?.type === 'emoji') return obj.icon.emoji;
  return '\u{1F4C4}'; // default: page emoji
}

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

/** Render a Notion block into a single line of readable text. */
function blockToText(block: any): string {
  const richTextTypes = [
    'paragraph',
    'heading_1',
    'heading_2',
    'heading_3',
    'bulleted_list_item',
    'numbered_list_item',
    'to_do',
    'toggle',
    'callout',
    'quote',
  ];

  const type: string = block.type;

  if (richTextTypes.includes(type)) {
    const richText: any[] = block[type]?.rich_text ?? [];
    const text = richText.map((rt: any) => rt.plain_text ?? '').join('');
    const prefix =
      type === 'heading_1' ? '# ' :
      type === 'heading_2' ? '## ' :
      type === 'heading_3' ? '### ' :
      type === 'bulleted_list_item' ? '- ' :
      type === 'numbered_list_item' ? '1. ' :
      type === 'to_do' ? (block.to_do?.checked ? '[x] ' : '[ ] ') :
      type === 'quote' ? '> ' :
      '';
    return `${prefix}${text}`;
  }

  if (type === 'code') {
    const lang = block.code?.language ?? '';
    const code = (block.code?.rich_text ?? []).map((rt: any) => rt.plain_text ?? '').join('');
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }

  if (type === 'divider') return '---';
  if (type === 'image') return `[Image: ${block.image?.external?.url ?? block.image?.file?.url ?? '(embedded)'}]`;

  return `[${type} block]`;
}

/** Format page properties into readable lines. */
function formatProperties(properties: Record<string, any>): string {
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    const val = formatPropertyValue(prop);
    if (val) lines.push(`  ${name}: ${val}`);
  }
  return lines.join('\n');
}

function formatPropertyValue(prop: any): string {
  switch (prop?.type) {
    case 'title':
      return (prop.title ?? []).map((t: any) => t.plain_text ?? '').join('');
    case 'rich_text':
      return (prop.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('');
    case 'number':
      return prop.number != null ? String(prop.number) : '';
    case 'select':
      return prop.select?.name ?? '';
    case 'multi_select':
      return (prop.multi_select ?? []).map((s: any) => s.name).join(', ');
    case 'date':
      return prop.date?.start ?? '';
    case 'checkbox':
      return prop.checkbox ? 'Yes' : 'No';
    case 'url':
      return prop.url ?? '';
    case 'email':
      return prop.email ?? '';
    case 'phone_number':
      return prop.phone_number ?? '';
    case 'status':
      return prop.status?.name ?? '';
    case 'people':
      return (prop.people ?? []).map((p: any) => p.name ?? p.id).join(', ');
    case 'relation':
      return (prop.relation ?? []).map((r: any) => r.id).join(', ');
    default:
      return '';
  }
}

// ─── Tool Handlers ──────────────────────────────────────

const notionSearch: ToolHandler = {
  description:
    'Search Notion for pages and databases by keyword. Returns titles, types, and last-edited dates.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search keywords (optional — omit for recent items)',
      },
      filter: {
        type: 'object',
        description:
          'Optional filter, e.g. { "property": "object", "value": "page" } to restrict to pages or databases',
        properties: {
          property: { type: 'string', enum: ['object'] },
          value: { type: 'string', enum: ['page', 'database'] },
        },
      },
      page_size: {
        type: 'number',
        description: 'Number of results to return (default 20, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const body: Record<string, any> = {
      page_size: params.page_size ?? 20,
    };
    if (params.query) body.query = params.query;
    if (params.filter) body.filter = params.filter;

    const data = await ctx.apiExecutor.post('/search', body);

    if (!data.results || data.results.length === 0) {
      return {
        content: 'No results found.',
        metadata: { resultCount: 0 },
      };
    }

    const lines = data.results.map((item: any) => {
      const icon = extractIcon(item);
      const title =
        item.object === 'database'
          ? (item.title ?? []).map((t: any) => t.plain_text ?? '').join('') || '(Untitled database)'
          : extractTitle(item);
      const type = item.object === 'database' ? 'database' : 'page';
      const edited = shortDate(item.last_edited_time);
      return `${icon} ${title} (${type}, last edited: ${edited})`;
    });

    return {
      content: `Found ${data.results.length} result(s):\n\n${lines.join('\n')}`,
      metadata: {
        resultCount: data.results.length,
        hasMore: data.has_more ?? false,
      },
    };
  },
};

const notionGetPage: ToolHandler = {
  description:
    'Retrieve a Notion page by ID, including its properties and the first content blocks.',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: {
        type: 'string',
        description: 'The Notion page ID (UUID with or without dashes)',
      },
    },
    required: ['page_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const { page_id } = params;

    // Fetch page metadata and content blocks in parallel
    const [page, blocksResponse] = await Promise.all([
      ctx.apiExecutor.get(`/pages/${page_id}`),
      ctx.apiExecutor.get(`/blocks/${page_id}/children`, { page_size: '50' }),
    ]);

    const title = extractTitle(page);
    const icon = extractIcon(page);
    const edited = shortDate(page.last_edited_time);
    const created = shortDate(page.created_time);
    const url = page.url ?? '';

    // Format properties
    const propsText = formatProperties(page.properties ?? {});

    // Format content blocks
    const blocks: any[] = blocksResponse.results ?? [];
    const contentLines = blocks
      .slice(0, 30) // Limit to first 30 blocks to avoid overly long responses
      .map(blockToText)
      .filter(Boolean);

    const truncationNote =
      blocks.length > 30 ? `\n\n(Showing first 30 of ${blocks.length} blocks)` : '';

    const content = [
      `${icon} ${title}`,
      `URL: ${url}`,
      `Created: ${created}`,
      `Last edited: ${edited}`,
      '',
      'Properties:',
      propsText || '  (none)',
      '',
      'Content:',
      contentLines.length > 0 ? contentLines.join('\n') : '  (empty page)',
      truncationNote,
    ].join('\n');

    return {
      content,
      metadata: { pageId: page.id, title, blockCount: blocks.length },
    };
  },
};

const notionCreatePage: ToolHandler = {
  description:
    'Create a new page in a Notion database. Provide the database ID, a title, and optional additional properties.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_database_id: {
        type: 'string',
        description: 'The ID of the parent database to create the page in',
      },
      title: {
        type: 'string',
        description: 'The page title (sets the Name / Title property)',
      },
      properties: {
        type: 'object',
        description:
          'Additional property values in Notion API format (merged with the title property)',
      },
    },
    required: ['parent_database_id', 'title'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const { parent_database_id, title, properties } = params;

    const body: Record<string, any> = {
      parent: { database_id: parent_database_id },
      properties: {
        Name: {
          title: [{ text: { content: title } }],
        },
        ...(properties ?? {}),
      },
    };

    const page = await ctx.apiExecutor.post('/pages', body);

    return {
      content: `Page created: ${title} (ID: ${page.id})`,
      metadata: {
        pageId: page.id,
        title,
        url: page.url,
        parentDatabaseId: parent_database_id,
      },
    };
  },
};

// ─── Adapter ────────────────────────────────────────────

export const notionAdapter: SkillAdapter = {
  skillId: 'notion',
  name: 'Notion',
  baseUrl: 'https://api.notion.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'notion',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Notion-Version': '2022-06-28',
  },
  tools: {
    notion_search: notionSearch,
    notion_get_page: notionGetPage,
    notion_create_page: notionCreatePage,
  },
  rateLimits: { requestsPerSecond: 3, burstLimit: 5 },
};
