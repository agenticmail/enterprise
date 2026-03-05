/**
 * Microsoft OneNote Tools
 *
 * Notebooks, sections, and pages via Microsoft Graph API.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createOneNoteTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'onenote_list_notebooks',
      description: 'List all OneNote notebooks.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/onenote/notebooks', {
            query: { '$select': 'id,displayName,createdDateTime,lastModifiedDateTime,isShared,links', '$orderby': 'lastModifiedDateTime desc' }
          });
          const notebooks = (data.value || []).map((n: any) => ({
            id: n.id, name: n.displayName, created: n.createdDateTime,
            modified: n.lastModifiedDateTime, isShared: n.isShared,
            webUrl: n.links?.oneNoteWebUrl?.href,
          }));
          return jsonResult({ notebooks, count: notebooks.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onenote_list_sections',
      description: 'List sections in a OneNote notebook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          notebookId: { type: 'string', description: 'Notebook ID' },
        },
        required: ['notebookId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/me/onenote/notebooks/${params.notebookId}/sections`, {
            query: { '$select': 'id,displayName,createdDateTime,lastModifiedDateTime' }
          });
          const sections = (data.value || []).map((s: any) => ({
            id: s.id, name: s.displayName,
            created: s.createdDateTime, modified: s.lastModifiedDateTime,
          }));
          return jsonResult({ sections, count: sections.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onenote_list_pages',
      description: 'List pages in a OneNote section.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          sectionId: { type: 'string', description: 'Section ID' },
          maxResults: { type: 'number', description: 'Max pages (default: 20)' },
        },
        required: ['sectionId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/me/onenote/sections/${params.sectionId}/pages`, {
            query: {
              '$top': String(params.maxResults || 20),
              '$select': 'id,title,createdDateTime,lastModifiedDateTime,links,level,order',
              '$orderby': 'lastModifiedDateTime desc',
            }
          });
          const pages = (data.value || []).map((p: any) => ({
            id: p.id, title: p.title,
            created: p.createdDateTime, modified: p.lastModifiedDateTime,
            webUrl: p.links?.oneNoteWebUrl?.href,
          }));
          return jsonResult({ pages, count: pages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onenote_read_page',
      description: 'Read the HTML content of a OneNote page.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          pageId: { type: 'string', description: 'Page ID' },
        },
        required: ['pageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const res = await fetch(`https://graph.microsoft.com/v1.0/me/onenote/pages/${params.pageId}/content`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`OneNote API ${res.status}: ${await res.text()}`);
          const html = await res.text();
          // Strip HTML tags for a cleaner text view
          const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          return jsonResult({ pageId: params.pageId, html, text: text.substring(0, 10000) });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onenote_create_page',
      description: 'Create a new page in a OneNote section. Content is HTML.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          sectionId: { type: 'string', description: 'Section ID to create the page in' },
          title: { type: 'string', description: 'Page title' },
          content: { type: 'string', description: 'Page content (HTML or plain text)' },
        },
        required: ['sectionId', 'title', 'content'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const html = `<!DOCTYPE html><html><head><title>${params.title}</title></head><body>${params.content}</body></html>`;
          const res = await fetch(`https://graph.microsoft.com/v1.0/me/onenote/sections/${params.sectionId}/pages`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/xhtml+xml',
            },
            body: html,
          });
          if (!res.ok) throw new Error(`OneNote API ${res.status}: ${await res.text()}`);
          const page = await res.json();
          return jsonResult({
            id: page.id, title: page.title,
            webUrl: page.links?.oneNoteWebUrl?.href,
            created: true,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'onenote_update_page',
      description: 'Append content to an existing OneNote page.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          pageId: { type: 'string', description: 'Page ID' },
          content: { type: 'string', description: 'HTML content to append' },
          position: { type: 'string', description: 'Where to add: after (end of body) or before (start of body). Default: after' },
        },
        required: ['pageId', 'content'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/onenote/pages/${params.pageId}/content`, {
            method: 'PATCH',
            body: [{
              target: 'body',
              action: params.position === 'before' ? 'prepend' : 'append',
              content: params.content,
            }],
          });
          return jsonResult({ updated: true, pageId: params.pageId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
