/**
 * Microsoft PowerPoint Tools
 *
 * Presentation operations via Microsoft Graph API — slides, export, create from template.
 * PowerPoint files must be stored in OneDrive or SharePoint.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

function itemPath(p: { itemId?: string; path?: string; driveId?: string }): string {
  if (p.driveId && p.itemId) return `/drives/${p.driveId}/items/${p.itemId}`;
  if (p.itemId) return `/me/drive/items/${p.itemId}`;
  if (p.path) return `/me/drive/root:${p.path}:`;
  throw new Error('Provide itemId or path to the PowerPoint file');
}

export function createPowerPointTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'powerpoint_get_info',
      description: 'Get metadata and slide count of a PowerPoint presentation.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path (e.g., "/Documents/Deck.pptx")' },
          driveId: { type: 'string', description: 'Drive ID (for SharePoint)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const meta = await graph(token, base, {
            query: { '$select': 'id,name,size,webUrl,createdDateTime,lastModifiedDateTime,file' }
          });
          // Get slide count via preview
          let slideCount: number | null = null;
          try {
            const preview = await graph(token, `${base}/preview`, { method: 'POST', body: {} });
            // Preview doesn't directly give count, but we can try thumbnails
            const thumbs = await graph(token, `${base}/thumbnails`);
            if (thumbs.value?.[0]) slideCount = Object.keys(thumbs.value[0]).filter((k: string) => k !== 'id').length;
          } catch {}
          return jsonResult({
            id: meta.id, name: meta.name, size: meta.size,
            webUrl: meta.webUrl, mimeType: meta.file?.mimeType,
            created: meta.createdDateTime, modified: meta.lastModifiedDateTime,
            slideCount,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerpoint_export_pdf',
      description: 'Export/convert a PowerPoint presentation to PDF.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const res = await fetch(`https://graph.microsoft.com/v1.0${base}/content?format=pdf`, {
            headers: { Authorization: `Bearer ${token}` },
            redirect: 'follow',
          });
          if (!res.ok) throw new Error(`Export failed: ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          return jsonResult({
            format: 'pdf',
            sizeBytes: buf.length,
            base64: buf.toString('base64'),
            note: 'PDF content returned as base64. Save to file or send as attachment.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerpoint_get_thumbnails',
      description: 'Get thumbnail images of slides in a presentation.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
          size: { type: 'string', description: 'Thumbnail size: small, medium, large (default: medium)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const data = await graph(token, `${base}/thumbnails`);
          const size = params.size || 'medium';
          const thumbs = (data.value || []).map((set: any, i: number) => {
            const t = set[size] || set.medium || set.large || set.small;
            return { slide: i + 1, url: t?.url, width: t?.width, height: t?.height };
          }).filter((t: any) => t.url);
          return jsonResult({ thumbnails: thumbs, count: thumbs.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerpoint_create_from_template',
      description: 'Create a new PowerPoint by copying a template file. Returns the new file for editing.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          templateItemId: { type: 'string', description: 'Item ID of the template .pptx' },
          templatePath: { type: 'string', description: 'Path of the template (alternative to itemId)' },
          newName: { type: 'string', description: 'Name for the new file (e.g., "Q1 Report.pptx")' },
          destFolder: { type: 'string', description: 'Destination folder path (default: same as template)' },
        },
        required: ['newName'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = params.templateItemId
            ? `/me/drive/items/${params.templateItemId}`
            : `/me/drive/root:${params.templatePath}:`;
          const parentRef: any = {};
          if (params.destFolder) parentRef.path = `/drive/root:${params.destFolder}`;
          const copy = await graph(token, `${base}/copy`, {
            method: 'POST',
            body: { name: params.newName, ...(params.destFolder ? { parentReference: parentRef } : {}) },
          });
          return jsonResult({
            status: 'copy_initiated',
            monitorUrl: copy['@odata.context'] || null,
            name: params.newName,
            note: 'Copy is async. File will appear in OneDrive shortly.',
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'powerpoint_get_embed_url',
      description: 'Get an embeddable preview URL for a PowerPoint presentation.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'OneDrive/SharePoint item ID' },
          path: { type: 'string', description: 'File path' },
          driveId: { type: 'string', description: 'Drive ID' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const base = itemPath(params);
          const preview = await graph(token, `${base}/preview`, { method: 'POST', body: {} });
          return jsonResult({
            embedUrl: preview.getUrl,
            editUrl: preview.postUrl,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
