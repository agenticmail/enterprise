/**
 * Microsoft OneDrive Tools
 *
 * File management via Microsoft Graph API — upload, download, search, share, folders.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createOneDriveTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'onedrive_list',
      description: 'List files and folders in OneDrive. Defaults to root folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Folder path (e.g., "/Documents/Reports") or item ID. Default: root' },
          maxResults: { type: 'number', description: 'Max items to return (default: 50)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const top = params.maxResults || 50;
          const basePath = params.path
            ? `/me/drive/root:${params.path}:/children`
            : '/me/drive/root/children';
          const data = await graph(token, basePath, {
            query: { '$top': String(top), '$select': 'id,name,size,createdDateTime,lastModifiedDateTime,webUrl,folder,file,parentReference' }
          });
          const items = (data.value || []).map((i: any) => ({
            id: i.id, name: i.name, size: i.size,
            type: i.folder ? 'folder' : 'file',
            mimeType: i.file?.mimeType,
            childCount: i.folder?.childCount,
            created: i.createdDateTime,
            modified: i.lastModifiedDateTime,
            webUrl: i.webUrl,
            path: i.parentReference?.path,
          }));
          return jsonResult({ items, count: items.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_search',
      description: 'Search for files in OneDrive by name or content.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const top = params.maxResults || 20;
          const data = await graph(token, `/me/drive/root/search(q='${encodeURIComponent(params.query)}')`, {
            query: { '$top': String(top), '$select': 'id,name,size,webUrl,file,folder,lastModifiedDateTime,parentReference' }
          });
          const items = (data.value || []).map((i: any) => ({
            id: i.id, name: i.name, size: i.size,
            type: i.folder ? 'folder' : 'file',
            mimeType: i.file?.mimeType,
            modified: i.lastModifiedDateTime,
            webUrl: i.webUrl,
            path: i.parentReference?.path,
          }));
          return jsonResult({ items, count: items.length, query: params.query });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_read',
      description: 'Read/download a file from OneDrive. For text files returns content; for binary returns download URL.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'File item ID' },
          path: { type: 'string', description: 'File path (alternative to itemId, e.g., "/Documents/report.txt")' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const itemPath = params.itemId
            ? `/me/drive/items/${params.itemId}`
            : `/me/drive/root:${params.path}:`;
          // Get metadata
          const meta = await graph(token, itemPath, {
            query: { '$select': 'id,name,size,file,webUrl,@microsoft.graph.downloadUrl' }
          });
          const isText = meta.file?.mimeType?.startsWith('text/') ||
            /\.(txt|md|csv|json|xml|html|css|js|ts|py|rb|go|rs|yaml|yml|toml|ini|cfg|log|sh|bat|ps1|sql)$/i.test(meta.name || '');

          if (isText && meta.size < 1048576) { // < 1MB text files: return content
            const contentRes = await fetch(meta['@microsoft.graph.downloadUrl'] || `https://graph.microsoft.com/v1.0${itemPath}/content`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const content = await contentRes.text();
            return jsonResult({ id: meta.id, name: meta.name, size: meta.size, content });
          }
          return jsonResult({
            id: meta.id, name: meta.name, size: meta.size,
            mimeType: meta.file?.mimeType,
            downloadUrl: meta['@microsoft.graph.downloadUrl'],
            webUrl: meta.webUrl,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_upload',
      description: 'Upload a text file to OneDrive. For small files (< 4MB).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Destination path (e.g., "/Documents/report.md")' },
          content: { type: 'string', description: 'File content (text)' },
          conflictBehavior: { type: 'string', description: 'rename, replace, or fail (default: replace)' },
        },
        required: ['path', 'content'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const conflict = params.conflictBehavior || 'replace';
          const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:${params.path}:/content?@microsoft.graph.conflictBehavior=${conflict}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
            body: params.content,
          });
          if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
          const data = await res.json();
          return jsonResult({ id: data.id, name: data.name, size: data.size, webUrl: data.webUrl });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_create_folder',
      description: 'Create a new folder in OneDrive.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Folder name' },
          parentPath: { type: 'string', description: 'Parent folder path (default: root)' },
        },
        required: ['name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const parentPath = params.parentPath
            ? `/me/drive/root:${params.parentPath}:/children`
            : '/me/drive/root/children';
          const folder = await graph(token, parentPath, {
            method: 'POST',
            body: { name: params.name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' },
          });
          return jsonResult({ id: folder.id, name: folder.name, webUrl: folder.webUrl });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_delete',
      description: 'Delete a file or folder from OneDrive.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'Item ID to delete' },
        },
        required: ['itemId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/drive/items/${params.itemId}`, { method: 'DELETE' });
          return jsonResult({ deleted: true, itemId: params.itemId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_share',
      description: 'Create a sharing link for a file or folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'Item ID to share' },
          type: { type: 'string', description: 'view or edit (default: view)' },
          scope: { type: 'string', description: 'anonymous (anyone) or organization (default: organization)' },
        },
        required: ['itemId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const link = await graph(token, `/me/drive/items/${params.itemId}/createLink`, {
            method: 'POST',
            body: { type: params.type || 'view', scope: params.scope || 'organization' },
          });
          return jsonResult({ url: link.link?.webUrl, type: link.link?.type, scope: link.link?.scope });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
