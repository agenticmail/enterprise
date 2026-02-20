/**
 * MCP Skill Adapter — Dropbox
 *
 * Maps Dropbox API v2 endpoints to MCP tool handlers.
 * Dropbox uses POST for all endpoints, including listing and search.
 *
 * Dropbox API docs: https://www.dropbox.com/developers/documentation/http/documentation
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function dropboxError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Dropbox errors use error_summary and error fields
      if (data.error_summary) {
        return { content: `Dropbox API error: ${data.error_summary}`, isError: true };
      }
      if (data.error && typeof data.error === 'object' && data.error['.tag']) {
        return { content: `Dropbox API error: ${data.error['.tag']}`, isError: true };
      }
    }
    return { content: `Dropbox API error: ${err.message}`, isError: true };
  }
  return { content: `Dropbox API error: ${String(err)}`, isError: true };
}

/**
 * Format a file/folder entry from Dropbox metadata.
 */
function formatEntry(entry: any): string {
  const tag = entry['.tag'] || 'unknown';
  const name = entry.name || 'Untitled';
  const path = entry.path_display || entry.path_lower || '';

  if (tag === 'file') {
    const size = entry.size != null ? ` (${formatSize(entry.size)})` : '';
    const modified = entry.client_modified
      ? ` modified ${entry.client_modified.slice(0, 16)}`
      : '';
    return `[file] ${name}${size}${modified} -- ${path}`;
  }

  return `[${tag}] ${name} -- ${path}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ─── Tool: dropbox_list_folder ──────────────────────────

const listFolder: ToolHandler = {
  description:
    'List files and folders in a Dropbox directory. Provide the folder path (use "" for root).',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Folder path (e.g. "/Documents", "/Photos/2024" or "" for root)',
      },
      recursive: {
        type: 'boolean',
        description: 'If true, list all contents recursively (default false)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of entries to return (default 100)',
      },
    },
    required: ['path'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        path: params.path,
        recursive: params.recursive ?? false,
        limit: params.limit ?? 100,
        include_media_info: false,
        include_mounted_folders: true,
      };

      const result = await ctx.apiExecutor.post('/files/list_folder', body);
      const entries: any[] = result.entries || [];
      const hasMore = result.has_more ?? false;

      if (entries.length === 0) {
        return { content: `Folder "${params.path || '/'}" is empty.` };
      }

      const lines = entries.map(formatEntry);
      const moreNote = hasMore ? '\n(more entries available -- use cursor for pagination)' : '';

      return {
        content: `Found ${entries.length} entries in "${params.path || '/'}":\n${lines.join('\n')}${moreNote}`,
        metadata: {
          count: entries.length,
          has_more: hasMore,
          cursor: result.cursor,
          path: params.path,
        },
      };
    } catch (err) {
      return dropboxError(err);
    }
  },
};

// ─── Tool: dropbox_search ───────────────────────────────

const searchFiles: ToolHandler = {
  description:
    'Search for files and folders in Dropbox by name or content. Returns matching entries with paths and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      path: {
        type: 'string',
        description: 'Restrict search to this folder path (optional)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results (default 25, max 100)',
      },
      file_extensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by file extensions (e.g. ["pdf", "docx"])',
      },
    },
    required: ['query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        query: params.query,
        options: {
          max_results: params.max_results ?? 25,
          file_status: { '.tag': 'active' },
        },
      };

      if (params.path) {
        body.options.path = params.path;
      }
      if (params.file_extensions?.length) {
        body.options.file_extensions = params.file_extensions;
      }

      const result = await ctx.apiExecutor.post('/files/search_v2', body);
      const matches: any[] = result.matches || [];
      const hasMore = result.has_more ?? false;

      if (matches.length === 0) {
        return { content: `No results found for: "${params.query}"` };
      }

      const lines = matches.map((m: any) => {
        const metadata = m.metadata?.metadata || m.metadata || {};
        return formatEntry(metadata);
      });

      const moreNote = hasMore ? '\n(more results available)' : '';

      return {
        content: `Found ${matches.length} results for "${params.query}":\n${lines.join('\n')}${moreNote}`,
        metadata: {
          count: matches.length,
          has_more: hasMore,
          query: params.query,
        },
      };
    } catch (err) {
      return dropboxError(err);
    }
  },
};

// ─── Tool: dropbox_create_folder ────────────────────────

const createFolder: ToolHandler = {
  description:
    'Create a new folder in Dropbox. Provide the full path for the new folder.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Full path for the new folder (e.g. "/Projects/New Project")',
      },
      autorename: {
        type: 'boolean',
        description: 'If true, automatically rename if a folder with the same name exists (default false)',
      },
    },
    required: ['path'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        path: params.path,
        autorename: params.autorename ?? false,
      };

      const result = await ctx.apiExecutor.post('/files/create_folder_v2', body);
      const metadata = result.metadata || {};

      return {
        content: `Folder created: "${metadata.name}" at ${metadata.path_display || params.path}`,
        metadata: {
          id: metadata.id,
          name: metadata.name,
          path_display: metadata.path_display,
        },
      };
    } catch (err) {
      return dropboxError(err);
    }
  },
};

// ─── Tool: dropbox_upload_file ──────────────────────────

const dropboxUploadFile: ToolHandler = {
  description: 'Upload a text file to Dropbox. Specify the destination path and file content.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Destination path including filename (e.g. "/Documents/report.txt")',
      },
      content: {
        type: 'string',
        description: 'Text content of the file',
      },
      mode: {
        type: 'string',
        enum: ['add', 'overwrite'],
        description: 'Write mode: "add" (default, fail if exists) or "overwrite"',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const apiArg = JSON.stringify({
        path: params.path,
        mode: params.mode || 'add',
        autorename: true,
        mute: false,
      });

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: 'https://content.dropboxapi.com/2/files/upload',
        headers: {
          'Dropbox-API-Arg': apiArg,
        },
        rawBody: new TextEncoder().encode(params.content),
        rawContentType: 'application/octet-stream',
      });

      const name = result.name || params.path;
      const size = result.size || 0;
      const displayPath = result.path_display || params.path;

      return {
        content: `Uploaded: ${name} (${formatSize(size)}) at ${displayPath}`,
        metadata: { id: result.id, path: displayPath, size },
      };
    } catch (err) {
      return dropboxError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const dropboxAdapter: SkillAdapter = {
  skillId: 'dropbox-storage',
  name: 'Dropbox',
  baseUrl: 'https://api.dropboxapi.com/2',
  auth: {
    type: 'oauth2',
    provider: 'dropbox',
    headerPrefix: 'Bearer',
  },
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  tools: {
    dropbox_list_folder: listFolder,
    dropbox_search: searchFiles,
    dropbox_create_folder: createFolder,
    dropbox_upload_file: dropboxUploadFile,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
};
