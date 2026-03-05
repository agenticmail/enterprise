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
          expirationDateTime: { type: 'string', description: 'Link expiry (ISO 8601). Only for anonymous links.' },
          password: { type: 'string', description: 'Password-protect the link (only for anonymous links).' },
        },
        required: ['itemId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = { type: params.type || 'view', scope: params.scope || 'organization' };
          if (params.expirationDateTime) body.expirationDateTime = params.expirationDateTime;
          if (params.password) body.password = params.password;
          const link = await graph(token, `/me/drive/items/${params.itemId}/createLink`, {
            method: 'POST', body,
          });
          return jsonResult({ url: link.link?.webUrl, type: link.link?.type, scope: link.link?.scope, expiration: link.link?.expirationDateTime });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_move',
      description: 'Move or rename a file/folder in OneDrive.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'Item ID to move/rename' },
          newName: { type: 'string', description: 'New name (optional, for rename)' },
          destinationFolderId: { type: 'string', description: 'Destination folder ID (optional, for move)' },
          destinationPath: { type: 'string', description: 'Destination folder path (alternative to ID, e.g., "/Documents/Archive")' },
        },
        required: ['itemId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {};
          if (params.newName) body.name = params.newName;
          if (params.destinationFolderId) {
            body.parentReference = { id: params.destinationFolderId };
          } else if (params.destinationPath) {
            // Resolve destination folder ID first
            const dest = await graph(token, `/me/drive/root:${params.destinationPath}`, {
              query: { '$select': 'id' },
            });
            body.parentReference = { id: dest.id };
          }
          if (!body.name && !body.parentReference) {
            return errorResult('Provide newName (rename), destinationFolderId or destinationPath (move), or both.');
          }
          const updated = await graph(token, `/me/drive/items/${params.itemId}`, {
            method: 'PATCH', body,
          });
          return jsonResult({ id: updated.id, name: updated.name, webUrl: updated.webUrl, path: updated.parentReference?.path });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_copy',
      description: 'Copy a file or folder to a new location in OneDrive. Returns a monitor URL for large copies.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'Item ID to copy' },
          destinationFolderId: { type: 'string', description: 'Destination folder ID' },
          destinationPath: { type: 'string', description: 'Destination folder path (alternative to ID)' },
          newName: { type: 'string', description: 'New name for the copy (optional)' },
        },
        required: ['itemId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {};
          if (params.newName) body.name = params.newName;
          if (params.destinationFolderId) {
            body.parentReference = { driveId: 'me', id: params.destinationFolderId };
          } else if (params.destinationPath) {
            const dest = await graph(token, `/me/drive/root:${params.destinationPath}`, { query: { '$select': 'id,parentReference' } });
            body.parentReference = { driveId: dest.parentReference?.driveId || 'me', id: dest.id };
          } else {
            return errorResult('Provide destinationFolderId or destinationPath.');
          }
          // Copy returns 202 with Location header (async operation)
          const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${params.itemId}/copy`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (res.status === 202) {
            return jsonResult({ status: 'copying', monitorUrl: res.headers.get('Location'), message: 'Copy started. Large files may take time.' });
          }
          if (!res.ok) throw new Error(`Copy failed: ${res.status} ${await res.text()}`);
          const data = await res.json();
          return jsonResult({ id: data.id, name: data.name, webUrl: data.webUrl });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_versions',
      description: 'List version history of a file in OneDrive.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'File item ID' },
          path: { type: 'string', description: 'File path (alternative to itemId)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = params.itemId ? `/me/drive/items/${params.itemId}` : `/me/drive/root:${params.path}:`;
          const data = await graph(token, `${base}/versions`);
          const versions = (data.value || []).map((v: any) => ({
            id: v.id,
            size: v.size,
            modified: v.lastModifiedDateTime,
            modifiedBy: v.lastModifiedBy?.user?.displayName || v.lastModifiedBy?.user?.email,
          }));
          return jsonResult({ versions, count: versions.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_recent',
      description: 'List recently accessed files in OneDrive.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          maxResults: { type: 'number', description: 'Max items (default: 20)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/drive/recent', {
            query: { '$top': String(params.maxResults || 20), '$select': 'id,name,size,webUrl,lastModifiedDateTime,file,remoteItem' },
          });
          const items = (data.value || []).map((i: any) => {
            const item = i.remoteItem || i;
            return {
              id: item.id, name: item.name || i.name, size: item.size,
              mimeType: item.file?.mimeType,
              modified: item.lastModifiedDateTime || i.lastModifiedDateTime,
              webUrl: item.webUrl || i.webUrl,
            };
          });
          return jsonResult({ items, count: items.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onedrive_permissions',
      description: 'List or manage sharing permissions on a file/folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'Item ID' },
          action: { type: 'string', description: 'list (default), revoke, or invite' },
          permissionId: { type: 'string', description: 'Permission ID to revoke (for action=revoke)' },
          email: { type: 'string', description: 'Email to invite (for action=invite)' },
          role: { type: 'string', description: 'read or write (for action=invite, default: read)' },
          message: { type: 'string', description: 'Optional message for invite' },
        },
        required: ['itemId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const action = params.action || 'list';

          if (action === 'revoke') {
            if (!params.permissionId) return errorResult('permissionId required for revoke');
            await graph(token, `/me/drive/items/${params.itemId}/permissions/${params.permissionId}`, { method: 'DELETE' });
            return jsonResult({ revoked: true, permissionId: params.permissionId });
          }

          if (action === 'invite') {
            if (!params.email) return errorResult('email required for invite');
            const invite = await graph(token, `/me/drive/items/${params.itemId}/invite`, {
              method: 'POST',
              body: {
                recipients: [{ email: params.email }],
                roles: [params.role || 'read'],
                requireSignIn: true,
                sendInvitation: true,
                message: params.message || '',
              },
            });
            return jsonResult({ invited: true, email: params.email, permissions: invite.value });
          }

          // Default: list
          const data = await graph(token, `/me/drive/items/${params.itemId}/permissions`);
          const perms = (data.value || []).map((p: any) => ({
            id: p.id,
            roles: p.roles,
            grantedTo: p.grantedToV2?.user?.displayName || p.grantedTo?.user?.displayName,
            email: p.grantedToV2?.user?.email || p.invitation?.email,
            link: p.link ? { type: p.link.type, scope: p.link.scope, webUrl: p.link.webUrl } : undefined,
          }));
          return jsonResult({ permissions: perms, count: perms.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
