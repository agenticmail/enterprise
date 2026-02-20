/**
 * MCP Skill Adapter — Google Drive
 *
 * Maps Google Drive REST API v3 endpoints to MCP tool handlers.
 * API reference: https://developers.google.com/drive/api/reference/rest/v3
 *
 * Tools:
 *   - gdrive_list_files    List and search files
 *   - gdrive_get_file      Get detailed file metadata
 *   - gdrive_create_folder Create a new folder
 *   - gdrive_share_file    Share a file with a user via email
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

/** Format file size in bytes into a human-readable string. */
function formatSize(bytes: string | number | undefined): string {
  if (bytes === undefined || bytes === null) return 'unknown size';
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(b)) return 'unknown size';
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  const value = b / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Map a MIME type to a short human-readable label. */
function mimeLabel(mimeType: string | undefined): string {
  if (!mimeType) return 'unknown';
  const googleTypes: Record<string, string> = {
    'application/vnd.google-apps.folder': 'Folder',
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Form',
    'application/vnd.google-apps.drawing': 'Google Drawing',
    'application/vnd.google-apps.site': 'Google Site',
  };
  return googleTypes[mimeType] ?? mimeType;
}

/** Get an icon for a file based on its MIME type. */
function fileIcon(mimeType: string | undefined): string {
  if (!mimeType) return '\u{1F4C4}';
  if (mimeType === 'application/vnd.google-apps.folder') return '\u{1F4C1}';
  if (mimeType.startsWith('image/')) return '\u{1F5BC}';
  if (mimeType.startsWith('video/')) return '\u{1F3AC}';
  if (mimeType.startsWith('audio/')) return '\u{1F3B5}';
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return '\u{1F4CA}';
  if (mimeType.includes('presentation') || mimeType.includes('slides')) return '\u{1F4CA}';
  if (mimeType.includes('pdf')) return '\u{1F4D1}';
  return '\u{1F4C4}';
}

// ─── Tool Handlers ──────────────────────────────────────

const gdriveListFiles: ToolHandler = {
  description:
    'List or search files in Google Drive. Supports Drive query syntax and folder filtering.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          "Drive search query string, e.g. \"name contains 'report'\" or \"mimeType = 'application/pdf'\"",
      },
      pageSize: {
        type: 'number',
        description: 'Number of results to return (default 20, max 1000)',
      },
      orderBy: {
        type: 'string',
        description: 'Sort order, e.g. "modifiedTime desc" (default) or "name"',
      },
      folderId: {
        type: 'string',
        description: 'List files within a specific folder ID',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    // Build the query string
    const qParts: string[] = [];
    if (params.folderId) {
      qParts.push(`'${params.folderId}' in parents`);
    }
    if (params.query) {
      qParts.push(params.query);
    }
    // Always exclude trashed files
    qParts.push('trashed = false');

    const queryParams: Record<string, string> = {
      q: qParts.join(' and '),
      pageSize: String(params.pageSize ?? 20),
      orderBy: params.orderBy ?? 'modifiedTime desc',
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,owners)',
    };

    const data = await ctx.apiExecutor.get('/files', queryParams);

    const files: any[] = data.files ?? [];
    if (files.length === 0) {
      return {
        content: 'No files found matching the query.',
        metadata: { fileCount: 0 },
      };
    }

    const lines = files.map((f: any) => {
      const icon = fileIcon(f.mimeType);
      const name = f.name ?? '(Untitled)';
      const type = mimeLabel(f.mimeType);
      const modified = shortDate(f.modifiedTime);
      const link = f.webViewLink ?? '';
      return `${icon} ${name} (${type}) \u2014 modified ${modified} \u2014 ${link}`;
    });

    return {
      content: `Found ${files.length} file(s):\n\n${lines.join('\n')}`,
      metadata: { fileCount: files.length },
    };
  },
};

const gdriveGetFile: ToolHandler = {
  description:
    'Get detailed metadata for a Google Drive file, including sharing status, owners, and direct link.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'The Google Drive file ID',
      },
    },
    required: ['fileId'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const { fileId } = params;

    const file = await ctx.apiExecutor.get(`/files/${fileId}`, {
      fields:
        'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners,shared,permissions',
    });

    const icon = fileIcon(file.mimeType);
    const owners = (file.owners ?? [])
      .map((o: any) => o.displayName ?? o.emailAddress ?? 'unknown')
      .join(', ');

    const permissionLines = (file.permissions ?? []).map((p: any) => {
      const identity = p.emailAddress ?? p.displayName ?? p.id;
      return `    - ${identity} (${p.role})`;
    });

    const content = [
      `${icon} ${file.name ?? '(Untitled)'}`,
      `ID: ${file.id}`,
      `Type: ${mimeLabel(file.mimeType)}`,
      `Size: ${formatSize(file.size)}`,
      `Created: ${shortDate(file.createdTime)}`,
      `Modified: ${shortDate(file.modifiedTime)}`,
      `Owner(s): ${owners || 'unknown'}`,
      `Shared: ${file.shared ? 'Yes' : 'No'}`,
      `Link: ${file.webViewLink ?? 'N/A'}`,
      '',
      permissionLines.length > 0
        ? `Permissions:\n${permissionLines.join('\n')}`
        : 'Permissions: none visible',
    ].join('\n');

    return {
      content,
      metadata: {
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        shared: file.shared,
      },
    };
  },
};

const gdriveCreateFolder: ToolHandler = {
  description: 'Create a new folder in Google Drive, optionally inside a parent folder.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Folder name',
      },
      parentId: {
        type: 'string',
        description: 'Parent folder ID (optional \u2014 creates in root if omitted)',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const { name, parentId } = params;

    const body: Record<string, any> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
      body.parents = [parentId];
    }

    const folder = await ctx.apiExecutor.post('/files', body);

    return {
      content: `Folder created: ${name} (ID: ${folder.id})`,
      metadata: {
        folderId: folder.id,
        name,
        parentId: parentId ?? 'root',
      },
    };
  },
};

const gdriveShareFile: ToolHandler = {
  description:
    'Share a Google Drive file with a user by email. Supports reader, writer, and commenter roles.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'The file ID to share',
      },
      email: {
        type: 'string',
        description: 'Email address of the person to share with',
      },
      role: {
        type: 'string',
        enum: ['reader', 'writer', 'commenter'],
        description: 'Permission role (default: reader)',
      },
      type: {
        type: 'string',
        description: 'Permission type (default: "user"). Other values: "group", "domain", "anyone"',
      },
    },
    required: ['fileId', 'email'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const { fileId, email, role = 'reader', type = 'user' } = params;

    const body = {
      role,
      type,
      emailAddress: email,
    };

    await ctx.apiExecutor.request({
      method: 'POST',
      path: `/files/${fileId}/permissions`,
      body,
      query: { sendNotificationEmail: 'true' },
    });

    // Fetch file name for a friendlier response
    let fileName = fileId;
    try {
      const file = await ctx.apiExecutor.get(`/files/${fileId}`, { fields: 'name' });
      fileName = file.name ?? fileId;
    } catch {
      // Ignore — we'll just use the file ID
    }

    return {
      content: `Shared ${fileName} with ${email} as ${role}`,
      metadata: { fileId, email, role, type },
    };
  },
};

const gdriveUploadFile: ToolHandler = {
  description: 'Upload a text file to Google Drive. Creates a new file with the given name and content.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'File name (e.g. "report.txt")',
      },
      content: {
        type: 'string',
        description: 'Text content of the file',
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the file (default: text/plain)',
      },
      parentId: {
        type: 'string',
        description: 'Parent folder ID (optional — uploads to root if omitted)',
      },
    },
    required: ['name', 'content'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    const mime = params.mimeType || 'text/plain';
    const metadata: Record<string, any> = { name: params.name, mimeType: mime };
    if (params.parentId) metadata.parents = [params.parentId];

    // Build multipart/related body (metadata JSON + file content)
    const boundary = '---AgenticMailUpload' + Date.now();
    const bodyStr =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mime}\r\n\r\n` +
      params.content + `\r\n` +
      `--${boundary}--`;

    const file = await ctx.apiExecutor.request({
      method: 'POST',
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      rawBody: new TextEncoder().encode(bodyStr),
      rawContentType: `multipart/related; boundary=${boundary}`,
    });

    return {
      content: `File uploaded: ${params.name} (ID: ${file.id})`,
      metadata: { fileId: file.id, name: params.name, mimeType: mime },
    };
  },
};

// ─── Adapter ────────────────────────────────────────────

export const googleDriveAdapter: SkillAdapter = {
  skillId: 'google-drive',
  name: 'Google Drive',
  baseUrl: 'https://www.googleapis.com/drive/v3',
  auth: {
    type: 'oauth2',
    provider: 'google',
    headerPrefix: 'Bearer',
  },
  tools: {
    gdrive_list_files: gdriveListFiles,
    gdrive_get_file: gdriveGetFile,
    gdrive_create_folder: gdriveCreateFolder,
    gdrive_share_file: gdriveShareFile,
    gdrive_upload_file: gdriveUploadFile,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
};
