/**
 * Google Docs — system prompts for document operations.
 */

import type { PromptContext } from '../index.js';

export interface DocsTaskContext extends PromptContext {
  taskDescription: string;
  documentId?: string;
  documentTitle?: string;
}

export function buildDocsTaskPrompt(ctx: DocsTaskContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Docs Task
${ctx.taskDescription}
${ctx.documentId ? `- **Document ID**: ${ctx.documentId}` : ''}
${ctx.documentTitle ? `- **Title**: ${ctx.documentTitle}` : ''}

## Available Tools
- google_docs_create — create a new document
- google_docs_get — read document content
- google_docs_append — append text to a document
- google_docs_replace — find and replace text
- google_docs_insert — insert text at a specific position
- google_docs_list — list recent documents
`;
}
