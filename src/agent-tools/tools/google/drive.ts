/**
 * Google Drive Tools
 *
 * File management, search, sharing, and content access via Google Drive API v3.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

class DriveAccessError extends Error {
  status: number;
  fileId?: string;
  constructor(message: string, status: number, fileId?: string) {
    super(message);
    this.name = 'DriveAccessError';
    this.status = status;
    this.fileId = fileId;
  }
}

async function gapi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string>; base?: string; rawBody?: BodyInit; headers?: Record<string, string> }): Promise<any> {
  const method = opts?.method || 'GET';
  const base = opts?.base || BASE;
  const url = new URL(base + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...opts?.headers };
  if (!opts?.rawBody) headers['Content-Type'] = 'application/json';
  const res = await fetch(url.toString(), {
    method, headers,
    body: opts?.rawBody || (opts?.body ? JSON.stringify(opts.body) : undefined),
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 403 || res.status === 404) {
      // Extract fileId from path if available
      const fileIdMatch = path.match(/\/files\/([^/]+)/);
      throw new DriveAccessError(`Google Drive API ${res.status}: ${err}`, res.status, fileIdMatch?.[1]);
    }
    throw new Error(`Google Drive API ${res.status}: ${err}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

export function createGoogleDriveTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  return [
    {
      name: 'google_drive_list',
      description: 'List files and folders in Google Drive. Supports search queries, folder filtering, and MIME type filtering.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (Drive query syntax, e.g. "name contains \'report\'" or free text)' },
          folderId: { type: 'string', description: 'List files in a specific folder' },
          mimeType: { type: 'string', description: 'Filter by MIME type (e.g. "application/vnd.google-apps.spreadsheet")' },
          maxResults: { type: 'number', description: 'Max results (default: 25, max: 100)' },
          orderBy: { type: 'string', description: 'Sort order (e.g. "modifiedTime desc", "name")' },
          sharedWithMe: { type: 'string', description: 'If "true", show only files shared with agent' },
          trashed: { type: 'string', description: 'If "true", show trashed files' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const parts: string[] = [];
          if (params.folderId) parts.push(`'${params.folderId}' in parents`);
          if (params.mimeType) parts.push(`mimeType = '${params.mimeType}'`);
          if (params.sharedWithMe === 'true') parts.push('sharedWithMe = true');
          if (params.trashed !== 'true') parts.push('trashed = false');
          if (params.query) {
            // If it looks like Drive query syntax, use as-is; otherwise wrap in fullText
            if (params.query.includes('=') || params.query.includes('in parents') || params.query.includes('contains')) {
              parts.push(params.query);
            } else {
              parts.push(`fullText contains '${params.query.replace(/'/g, "\\'")}'`);
            }
          }
          const q: Record<string, string> = {
            fields: 'files(id,name,mimeType,size,modifiedTime,createdTime,owners,shared,webViewLink,parents)',
            pageSize: String(Math.min(params.maxResults || 25, 100)),
          };
          if (parts.length) q.q = parts.join(' and ');
          if (params.orderBy) q.orderBy = params.orderBy;
          const data = await gapi(token, '/files', { query: q });
          const files = (data.files || []).map((f: any) => ({
            id: f.id, name: f.name, mimeType: f.mimeType,
            size: f.size ? Number(f.size) : undefined,
            modifiedTime: f.modifiedTime, createdTime: f.createdTime,
            owner: f.owners?.[0]?.emailAddress, shared: f.shared,
            webViewLink: f.webViewLink, parentId: f.parents?.[0],
            isFolder: f.mimeType === 'application/vnd.google-apps.folder',
          }));
          return jsonResult({ files, count: files.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_drive_get',
      description: 'Get metadata and content of a file. For Google Docs/Sheets/Slides, exports as text. For other files, returns metadata only. If you get ACCESS_DENIED, use google_drive_request_access to ask the file owner for access.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          fileId: { type: 'string', description: 'File ID (required)' },
          exportFormat: { type: 'string', description: 'Export format for Google Docs types: "text", "html", "pdf", "csv" (for Sheets)' },
        },
        required: ['fileId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const meta = await gapi(token, `/files/${params.fileId}`, {
            query: { fields: 'id,name,mimeType,size,modifiedTime,createdTime,description,webViewLink,owners,shared' },
          });
          const result: any = {
            id: meta.id, name: meta.name, mimeType: meta.mimeType,
            size: meta.size ? Number(meta.size) : undefined,
            modifiedTime: meta.modifiedTime, description: meta.description,
            webViewLink: meta.webViewLink, owner: meta.owners?.[0]?.emailAddress,
          };
          // Export Google Docs content
          const exportMap: Record<string, Record<string, string>> = {
            'application/vnd.google-apps.document': { text: 'text/plain', html: 'text/html', pdf: 'application/pdf' },
            'application/vnd.google-apps.spreadsheet': { csv: 'text/csv', text: 'text/csv', html: 'text/html' },
            'application/vnd.google-apps.presentation': { text: 'text/plain', html: 'text/html', pdf: 'application/pdf' },
          };
          const formats = exportMap[meta.mimeType];
          if (formats) {
            const fmt = params.exportFormat || 'text';
            const exportMime = formats[fmt] || formats['text'];
            if (exportMime && (fmt === 'text' || fmt === 'csv' || fmt === 'html')) {
              const exportRes = await fetch(`${BASE}/files/${params.fileId}/export?mimeType=${encodeURIComponent(exportMime)}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (exportRes.ok) {
                const text = await exportRes.text();
                result.content = text.slice(0, 50000); // Truncate large files
                result.truncated = text.length > 50000;
                result.exportFormat = fmt;
              }
            }
          }
          return jsonResult(result);
        } catch (e: any) {
          if (e instanceof DriveAccessError && (e.status === 403 || e.status === 404)) {
            return jsonResult({
              error: 'ACCESS_DENIED',
              fileId: params.fileId,
              message: `You do not have access to this file (${e.status}). Use google_drive_request_access to request access from the file owner or your manager.`,
              suggestion: `Call google_drive_request_access with fileId="${params.fileId}" and a reason for needing access.`,
            });
          }
          return errorResult(e.message);
        }
      },
    },
    {
      name: 'google_drive_request_access',
      description: 'Request access to a file you cannot read. Sends an email to your manager (or file owner) asking for access. Use this when google_drive_get returns ACCESS_DENIED.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          fileId: { type: 'string', description: 'File ID to request access to (required)' },
          reason: { type: 'string', description: 'Why you need access to this file (required)' },
          requesterContext: { type: 'string', description: 'Who asked you to look at this file / what question you are trying to answer' },
        },
        required: ['fileId', 'reason'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Try to get basic file metadata (may fail for 404 but works for some 403)
          let fileName = params.fileId;
          let fileOwner = '';
          let fileLink = `https://drive.google.com/file/d/${params.fileId}/view`;
          try {
            const meta = await gapi(token, `/files/${params.fileId}`, { query: { fields: 'id,name,owners,webViewLink', supportsAllDrives: 'true' } });
            if (meta.name) fileName = meta.name;
            if (meta.owners?.[0]?.emailAddress) fileOwner = meta.owners[0].emailAddress;
            if (meta.webViewLink) fileLink = meta.webViewLink;
          } catch { /* may not have metadata access either */ }

          // Store the access request in memory for tracking
          return jsonResult({
            accessRequested: true,
            fileId: params.fileId,
            fileName,
            fileOwner: fileOwner || 'unknown',
            fileLink,
            reason: params.reason,
            requesterContext: params.requesterContext || '',
            instruction: `Access request recorded. Email your manager to request access to "${fileName}" (${fileLink}). Include why you need it: ${params.reason}. Wait for the manager to grant access before trying to read the file again. Store this in memory so you can follow up.`,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_drive_create',
      description: 'Create a new file or folder in Google Drive. For text files, provide content directly.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'File/folder name (required)' },
          mimeType: { type: 'string', description: 'MIME type. Use "application/vnd.google-apps.folder" for folders, "application/vnd.google-apps.document" for Docs, "application/vnd.google-apps.spreadsheet" for Sheets' },
          parentId: { type: 'string', description: 'Parent folder ID' },
          content: { type: 'string', description: 'Text content for the file' },
          description: { type: 'string', description: 'File description' },
        },
        required: ['name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const metadata: any = { name: params.name };
          if (params.mimeType) metadata.mimeType = params.mimeType;
          if (params.parentId) metadata.parents = [params.parentId];
          if (params.description) metadata.description = params.description;

          if (params.content && !params.mimeType?.startsWith('application/vnd.google-apps.')) {
            // Multipart upload for files with content
            const boundary = '===agenticmail_boundary===';
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${params.content}\r\n--${boundary}--`;
            const result = await gapi(token, '/files?uploadType=multipart', {
              method: 'POST', base: UPLOAD_BASE,
              rawBody: body,
              headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
              query: { fields: 'id,name,mimeType,webViewLink' },
            });
            return jsonResult({ created: true, fileId: result.id, name: result.name, webViewLink: result.webViewLink });
          } else {
            // Metadata-only (folders, Google Docs types)
            const result = await gapi(token, '/files', {
              method: 'POST', body: metadata,
              query: { fields: 'id,name,mimeType,webViewLink' },
            });
            return jsonResult({ created: true, fileId: result.id, name: result.name, mimeType: result.mimeType, webViewLink: result.webViewLink });
          }
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_drive_delete',
      description: 'Move a file to trash (or permanently delete).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          fileId: { type: 'string', description: 'File ID (required)' },
          permanent: { type: 'string', description: 'If "true", permanently delete instead of trashing' },
        },
        required: ['fileId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          if (params.permanent === 'true') {
            await gapi(token, `/files/${params.fileId}`, { method: 'DELETE' });
            return jsonResult({ deleted: true, permanent: true, fileId: params.fileId });
          } else {
            await gapi(token, `/files/${params.fileId}`, { method: 'PATCH', body: { trashed: true } });
            return jsonResult({ trashed: true, fileId: params.fileId });
          }
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_drive_share',
      description: 'Share a file with a user, group, or make it accessible via link.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          fileId: { type: 'string', description: 'File ID (required)' },
          email: { type: 'string', description: 'Email to share with' },
          role: { type: 'string', description: 'Permission role: "reader", "writer", "commenter" (default: "reader")' },
          type: { type: 'string', description: 'Permission type: "user", "group", "domain", "anyone" (default: "user")' },
          sendNotification: { type: 'string', description: 'Send email notification? "true" or "false" (default: "true")' },
        },
        required: ['fileId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const permission: any = {
            role: params.role || 'reader',
            type: params.type || (params.email ? 'user' : 'anyone'),
          };
          if (params.email) permission.emailAddress = params.email;
          const query: Record<string, string> = {};
          if (params.sendNotification === 'false') query.sendNotificationEmail = 'false';
          const result = await gapi(token, `/files/${params.fileId}/permissions`, { method: 'POST', body: permission, query });
          return jsonResult({ shared: true, permissionId: result.id, role: result.role, type: result.type });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_drive_move',
      description: 'Move a file to a different folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          fileId: { type: 'string', description: 'File ID to move (required)' },
          destinationFolderId: { type: 'string', description: 'Target folder ID (required)' },
        },
        required: ['fileId', 'destinationFolderId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Get current parents
          const file = await gapi(token, `/files/${params.fileId}`, { query: { fields: 'parents' } });
          const removeParents = (file.parents || []).join(',');
          const result = await gapi(token, `/files/${params.fileId}`, {
            method: 'PATCH', body: {},
            query: { addParents: params.destinationFolderId, removeParents, fields: 'id,name,parents' },
          });
          return jsonResult({ moved: true, fileId: result.id, name: result.name, newParent: params.destinationFolderId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
