/**
 * Microsoft SharePoint Tools
 *
 * Site, list, document library, and page operations via Microsoft Graph API.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createSharePointTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'sharepoint_list_sites',
      description: 'Search or list SharePoint sites the agent has access to.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          search: { type: 'string', description: 'Search query for site name/description' },
          maxResults: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          let path = '/sites';
          const query: Record<string, string> = { '$top': String(params.maxResults || 20) };
          if (params.search) {
            query['$search'] = `"${params.search}"`;
          }
          const data = await graph(token, path, { query });
          const sites = (data.value || []).map((s: any) => ({
            id: s.id, name: s.displayName, description: s.description,
            webUrl: s.webUrl, created: s.createdDateTime,
          }));
          return jsonResult({ sites, count: sites.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_get_site',
      description: 'Get details about a SharePoint site by hostname and path, or by site ID.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'Site ID' },
          hostname: { type: 'string', description: 'Site hostname (e.g., "contoso.sharepoint.com")' },
          path: { type: 'string', description: 'Site path (e.g., "/sites/engineering")' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          let sitePath: string;
          if (params.siteId) {
            sitePath = `/sites/${params.siteId}`;
          } else if (params.hostname) {
            sitePath = `/sites/${params.hostname}:${params.path || '/'}`;
          } else {
            throw new Error('Provide siteId or hostname');
          }
          const site = await graph(token, sitePath);
          return jsonResult({
            id: site.id, name: site.displayName, description: site.description,
            webUrl: site.webUrl, created: site.createdDateTime,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_list_drives',
      description: 'List document libraries (drives) on a SharePoint site.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'SharePoint site ID' },
        },
        required: ['siteId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/sites/${params.siteId}/drives`);
          const drives = (data.value || []).map((d: any) => ({
            id: d.id, name: d.name, description: d.description,
            driveType: d.driveType, webUrl: d.webUrl,
            totalSize: d.quota?.total, usedSize: d.quota?.used,
          }));
          return jsonResult({ drives, count: drives.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_list_files',
      description: 'List files and folders in a SharePoint document library.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'SharePoint site ID' },
          driveId: { type: 'string', description: 'Drive (document library) ID' },
          path: { type: 'string', description: 'Folder path within the drive (default: root)' },
          maxResults: { type: 'number', description: 'Max items (default: 50)' },
        },
        required: ['siteId', 'driveId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const basePath = params.path
            ? `/drives/${params.driveId}/root:${params.path}:/children`
            : `/drives/${params.driveId}/root/children`;
          const data = await graph(token, basePath, {
            query: {
              '$top': String(params.maxResults || 50),
              '$select': 'id,name,size,createdDateTime,lastModifiedDateTime,webUrl,folder,file',
            }
          });
          const items = (data.value || []).map((i: any) => ({
            id: i.id, name: i.name, size: i.size,
            type: i.folder ? 'folder' : 'file',
            mimeType: i.file?.mimeType,
            childCount: i.folder?.childCount,
            created: i.createdDateTime,
            modified: i.lastModifiedDateTime,
            webUrl: i.webUrl,
          }));
          return jsonResult({ items, count: items.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_upload_file',
      description: 'Upload a text file to a SharePoint document library.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          driveId: { type: 'string', description: 'Drive (document library) ID' },
          path: { type: 'string', description: 'Destination path (e.g., "/General/report.md")' },
          content: { type: 'string', description: 'File content (text)' },
        },
        required: ['driveId', 'path', 'content'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${params.driveId}/root:${params.path}:/content`, {
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
      name: 'sharepoint_list_lists',
      description: 'List SharePoint lists on a site.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'SharePoint site ID' },
        },
        required: ['siteId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/sites/${params.siteId}/lists`, {
            query: { '$select': 'id,displayName,description,webUrl,list', '$top': '50' }
          });
          const lists = (data.value || []).map((l: any) => ({
            id: l.id, name: l.displayName, description: l.description,
            webUrl: l.webUrl, template: l.list?.template,
            hidden: l.list?.hidden,
          }));
          return jsonResult({ lists: lists.filter((l: any) => !l.hidden), count: lists.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_list_items',
      description: 'Read items from a SharePoint list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'SharePoint site ID' },
          listId: { type: 'string', description: 'List ID or name' },
          maxResults: { type: 'number', description: 'Max items (default: 50)' },
          filter: { type: 'string', description: 'OData $filter expression' },
          expand: { type: 'boolean', description: 'Expand field values (default: true)' },
        },
        required: ['siteId', 'listId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {
            '$top': String(params.maxResults || 50),
          };
          if (params.expand !== false) query['$expand'] = 'fields';
          if (params.filter) query['$filter'] = params.filter;
          const data = await graph(token, `/sites/${params.siteId}/lists/${params.listId}/items`, { query });
          const items = (data.value || []).map((i: any) => ({
            id: i.id,
            created: i.createdDateTime,
            modified: i.lastModifiedDateTime,
            webUrl: i.webUrl,
            fields: i.fields,
          }));
          return jsonResult({ items, count: items.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_create_list_item',
      description: 'Create a new item in a SharePoint list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'SharePoint site ID' },
          listId: { type: 'string', description: 'List ID or name' },
          fields: { type: 'object', description: 'Field values as key-value pairs (e.g., {"Title": "My Item", "Status": "Active"})' },
        },
        required: ['siteId', 'listId', 'fields'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const item = await graph(token, `/sites/${params.siteId}/lists/${params.listId}/items`, {
            method: 'POST',
            body: { fields: params.fields },
          });
          return jsonResult({ id: item.id, created: true, fields: item.fields });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_update_list_item',
      description: 'Update an existing item in a SharePoint list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          siteId: { type: 'string', description: 'SharePoint site ID' },
          listId: { type: 'string', description: 'List ID or name' },
          itemId: { type: 'string', description: 'Item ID to update' },
          fields: { type: 'object', description: 'Updated field values' },
        },
        required: ['siteId', 'listId', 'itemId', 'fields'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/sites/${params.siteId}/lists/${params.listId}/items/${params.itemId}/fields`, {
            method: 'PATCH',
            body: params.fields,
          });
          return jsonResult({ updated: true, itemId: params.itemId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'sharepoint_search',
      description: 'Search across SharePoint for sites, files, list items, and pages.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          entityTypes: { type: 'string', description: 'Comma-separated: site, drive, driveItem, list, listItem, message (default: driveItem)' },
          maxResults: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const types = (params.entityTypes || 'driveItem').split(',').map((t: string) => t.trim());
          const data = await graph(token, '/search/query', {
            method: 'POST',
            body: {
              requests: [{
                entityTypes: types,
                query: { queryString: params.query },
                from: 0,
                size: params.maxResults || 10,
              }],
            },
          });
          const hits = data.value?.[0]?.hitsContainers?.[0]?.hits || [];
          const results = hits.map((h: any) => ({
            id: h.resource?.id,
            name: h.resource?.name || h.resource?.displayName,
            summary: h.summary,
            webUrl: h.resource?.webUrl,
            type: h.resource?.['@odata.type'],
            lastModified: h.resource?.lastModifiedDateTime,
          }));
          return jsonResult({ results, count: results.length, query: params.query });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
