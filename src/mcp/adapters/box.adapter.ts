/**
 * MCP Skill Adapter — Box
 *
 * Maps Box Content API v2.0 endpoints to MCP tool handlers.
 * Handles file listing, file retrieval, upload, search, and folder creation.
 *
 * Box API docs: https://developer.box.com/reference/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function boxError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Box returns { type: 'error', status, code, message, context_info }
      const msg = data.message || data.error_description || err.message;
      const code = data.code || data.status || '';
      const codePart = code ? `[${code}] ` : '';
      return { content: `Box API error: ${codePart}${msg}`, isError: true };
    }
    return { content: `Box API error: ${err.message}`, isError: true };
  }
  return { content: `Box API error: ${String(err)}`, isError: true };
}

/** Format file size in human-readable format */
function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${size} ${units[i]}`;
}

/** Format a Box item (file or folder) for display */
function formatItem(item: any): string {
  const type = item.type === 'folder' ? '[Folder]' : '[File]';
  const name = item.name || '(unnamed)';
  const size = item.type === 'file' ? ` (${formatSize(item.size)})` : '';
  const modified = item.modified_at ? ` -- Modified: ${new Date(item.modified_at).toLocaleDateString()}` : '';
  const owner = item.owned_by?.login ? ` -- Owner: ${item.owned_by.login}` : '';
  return `${type} ${name}${size}${modified}${owner} (ID: ${item.id})`;
}

// ─── Tool: box_list_files ───────────────────────────────

const listFiles: ToolHandler = {
  description:
    'List files and folders in a Box folder. Defaults to the root folder (ID "0"). Returns names, sizes, and modification dates.',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Box folder ID to list contents of (default "0" for root)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of items to return (default 100, max 1000)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      sort: {
        type: 'string',
        enum: ['id', 'name', 'date', 'size'],
        description: 'Sort field (default: "name")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const folderId = params.folder_id || '0';
      const query: Record<string, string> = {
        limit: String(params.limit ?? 100),
        offset: String(params.offset ?? 0),
        fields: 'id,type,name,size,modified_at,owned_by',
      };
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get(`/folders/${folderId}/items`, query);

      const items: any[] = result.entries || [];
      const totalCount = result.total_count ?? items.length;

      if (items.length === 0) {
        return { content: `Folder ${folderId} is empty.`, metadata: { folderId, count: 0 } };
      }

      const lines = items.map((item: any) => formatItem(item));

      return {
        content: `${totalCount} items in folder ${folderId} (showing ${items.length}):\n${lines.join('\n')}`,
        metadata: { folderId, count: items.length, totalCount },
      };
    } catch (err) {
      return boxError(err);
    }
  },
};

// ─── Tool: box_get_file ─────────────────────────────────

const getFile: ToolHandler = {
  description:
    'Get detailed information about a specific Box file by its ID. Returns name, size, version, shared link, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'The Box file ID',
      },
    },
    required: ['file_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/files/${params.file_id}`, {
        fields: 'id,type,name,size,modified_at,created_at,owned_by,parent,shared_link,file_version,description,path_collection',
      });

      const path = (result.path_collection?.entries || [])
        .map((e: any) => e.name)
        .join('/');

      const details = [
        `File: ${result.name || '(unnamed)'}`,
        `ID: ${result.id || params.file_id}`,
        `Size: ${formatSize(result.size)}`,
        `Path: /${path}/${result.name || ''}`,
        `Created: ${result.created_at ? new Date(result.created_at).toLocaleDateString() : 'N/A'}`,
        `Modified: ${result.modified_at ? new Date(result.modified_at).toLocaleDateString() : 'N/A'}`,
        `Owner: ${result.owned_by?.login || 'N/A'}`,
        `Version: ${result.file_version?.id || 'N/A'}`,
        `Shared Link: ${result.shared_link?.url || 'None'}`,
        `Description: ${result.description || 'N/A'}`,
      ].join('\n');

      return {
        content: `Box File Details:\n${details}`,
        metadata: {
          fileId: params.file_id,
          name: result.name,
          size: result.size,
        },
      };
    } catch (err) {
      return boxError(err);
    }
  },
};

// ─── Tool: box_upload_file ──────────────────────────────

const uploadFile: ToolHandler = {
  description:
    'Upload a file to Box. Provide the file content as base64 and specify the target folder. Returns the new file ID and details.',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'Box folder ID to upload into (default "0" for root)',
      },
      file_name: {
        type: 'string',
        description: 'Name for the uploaded file (e.g. "report.pdf")',
      },
      content_base64: {
        type: 'string',
        description: 'Base64-encoded file content',
      },
    },
    required: ['file_name', 'content_base64'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const folderId = params.folder_id || '0';

      // Box upload API uses a different endpoint and multipart form data
      const attributes = JSON.stringify({
        name: params.file_name,
        parent: { id: folderId },
      });

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: 'https://upload.box.com/api/2.0/files/content',
        body: {
          attributes,
          file: params.content_base64,
        },
        multipart: true,
      });

      const file = result.entries?.[0] || result;
      const fileId = file.id || 'unknown';
      const fileName = file.name || params.file_name;

      return {
        content: `File uploaded: ${fileName} (ID: ${fileId}, Size: ${formatSize(file.size)})`,
        metadata: {
          fileId,
          fileName,
          folderId,
          size: file.size,
        },
      };
    } catch (err) {
      return boxError(err);
    }
  },
};

// ─── Tool: box_search ───────────────────────────────────

const boxSearch: ToolHandler = {
  description:
    'Search for files and folders in Box by name, content, or metadata. Returns matching items with relevance scores.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      type: {
        type: 'string',
        enum: ['file', 'folder', 'web_link'],
        description: 'Limit results to a specific item type (optional)',
      },
      file_extensions: {
        type: 'string',
        description: 'Comma-separated file extensions to filter by (e.g. "pdf,docx")',
      },
      ancestor_folder_ids: {
        type: 'string',
        description: 'Comma-separated folder IDs to scope the search within (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 30, max 200)',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        query: params.query,
        limit: String(params.limit ?? 30),
        fields: 'id,type,name,size,modified_at,owned_by,parent',
      };
      if (params.type) query.type = params.type;
      if (params.file_extensions) query.file_extensions = params.file_extensions;
      if (params.ancestor_folder_ids) query.ancestor_folder_ids = params.ancestor_folder_ids;

      const result = await ctx.apiExecutor.get('/search', query);

      const items: any[] = result.entries || [];
      const totalCount = result.total_count ?? items.length;

      if (items.length === 0) {
        return { content: `No results found for "${params.query}".` };
      }

      const lines = items.map((item: any) => formatItem(item));

      return {
        content: `Found ${totalCount} results for "${params.query}" (showing ${items.length}):\n${lines.join('\n')}`,
        metadata: { count: items.length, totalCount, query: params.query },
      };
    } catch (err) {
      return boxError(err);
    }
  },
};

// ─── Tool: box_create_folder ────────────────────────────

const createFolder: ToolHandler = {
  description:
    'Create a new folder in Box. Specify the parent folder and the new folder name.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new folder',
      },
      parent_id: {
        type: 'string',
        description: 'Parent folder ID (default "0" for root)',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        name: params.name,
        parent: { id: params.parent_id || '0' },
      };

      const result = await ctx.apiExecutor.post('/folders', body);

      return {
        content: `Folder created: "${result.name || params.name}" (ID: ${result.id})`,
        metadata: {
          folderId: result.id,
          name: result.name || params.name,
          parentId: params.parent_id || '0',
        },
      };
    } catch (err) {
      return boxError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const boxAdapter: SkillAdapter = {
  skillId: 'box',
  name: 'Box',
  baseUrl: 'https://api.box.com/2.0',
  auth: {
    type: 'oauth2',
    provider: 'box',
  },
  tools: {
    box_list_files: listFiles,
    box_get_file: getFile,
    box_upload_file: uploadFile,
    box_search: boxSearch,
    box_create_folder: createFolder,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
