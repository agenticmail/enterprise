/**
 * Google Docs Tools
 *
 * Read and write Google Docs via Google Docs API v1.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';

const DOCS_BASE = 'https://docs.googleapis.com/v1/documents';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

async function dapi(token: string, path: string, opts?: { method?: string; body?: any; base?: string }): Promise<any> {
  const base = opts?.base || DOCS_BASE;
  const res = await fetch(base + path, {
    method: opts?.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Google Docs API ${res.status}: ${err}`); }
  return res.json();
}

function extractText(doc: any): string {
  const parts: string[] = [];
  for (const el of doc.body?.content || []) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements || []) {
        if (pe.textRun?.content) parts.push(pe.textRun.content);
      }
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        const cells: string[] = [];
        for (const cell of row.tableCells || []) {
          const cellText: string[] = [];
          for (const cp of cell.content || []) {
            if (cp.paragraph) {
              for (const pe of cp.paragraph.elements || []) {
                if (pe.textRun?.content) cellText.push(pe.textRun.content.trim());
              }
            }
          }
          cells.push(cellText.join(''));
        }
        parts.push(cells.join('\t'));
      }
    }
  }
  return parts.join('');
}

export function createGoogleDocsTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  return [
    {
      name: 'google_docs_read',
      description: 'Read the full text content of a Google Doc.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          documentId: { type: 'string', description: 'Document ID (required)' },
        },
        required: ['documentId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const doc = await dapi(token, `/${params.documentId}`);
          const text = extractText(doc);
          return jsonResult({
            documentId: doc.documentId, title: doc.title,
            content: text.slice(0, 80000),
            truncated: text.length > 80000,
            characterCount: text.length,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_docs_create',
      description: 'Create a Google Doc.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Document title (required)' },
          content: { type: 'string', description: 'Initial text content to insert' },
          folderId: { type: 'string', description: 'Parent folder ID in Drive' },
        },
        required: ['title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const doc = await dapi(token, '', { method: 'POST', body: { title: params.title } });
          // Insert content if provided
          if (params.content) {
            await dapi(token, `/${doc.documentId}:batchUpdate`, {
              method: 'POST',
              body: { requests: [{ insertText: { location: { index: 1 }, text: params.content } }] },
            });
          }
          // Move to folder if specified
          if (params.folderId) {
            const file = await fetch(`${DRIVE_BASE}/files/${doc.documentId}?fields=parents`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json()) as any;
            await fetch(`${DRIVE_BASE}/files/${doc.documentId}?addParents=${params.folderId}&removeParents=${(file.parents || []).join(',')}&fields=id`, {
              method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
          }
          return jsonResult({ created: true, documentId: doc.documentId, title: doc.title, url: `https://docs.google.com/document/d/${doc.documentId}/edit` });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_docs_write',
      description: 'Insert, replace, or append text in a Google Doc.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          documentId: { type: 'string', description: 'Document ID (required)' },
          action: { type: 'string', description: '"append" (add to end), "insert" (at index), or "replace" (find & replace) (required)' },
          text: { type: 'string', description: 'Text to insert/append (required for append/insert)' },
          index: { type: 'number', description: 'Character index for insert (1-based, required for insert action)' },
          find: { type: 'string', description: 'Text to find (required for replace action)' },
          replaceWith: { type: 'string', description: 'Replacement text (required for replace action)' },
          matchCase: { type: 'string', description: '"true" for case-sensitive replace (default: "false")' },
        },
        required: ['documentId', 'action'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const requests: any[] = [];
          if (params.action === 'append') {
            const doc = await dapi(token, `/${params.documentId}`);
            const endIndex = doc.body?.content?.slice(-1)?.[0]?.endIndex || 1;
            requests.push({ insertText: { location: { index: Math.max(endIndex - 1, 1) }, text: params.text } });
          } else if (params.action === 'insert') {
            requests.push({ insertText: { location: { index: params.index || 1 }, text: params.text } });
          } else if (params.action === 'replace') {
            requests.push({
              replaceAllText: {
                containsText: { text: params.find, matchCase: params.matchCase === 'true' },
                replaceText: params.replaceWith || '',
              },
            });
          } else {
            return errorResult('action must be "append", "insert", or "replace"');
          }
          const result = await dapi(token, `/${params.documentId}:batchUpdate`, { method: 'POST', body: { requests } });
          const replaceCount = result.replies?.[0]?.replaceAllText?.occurrencesChanged;
          return jsonResult({ success: true, action: params.action, ...(replaceCount !== undefined && { replacements: replaceCount }) });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
