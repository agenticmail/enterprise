/**
 * Google Slides — system prompts for presentation operations.
 */

import type { PromptContext } from '../index.js';

export interface SlidesContext extends PromptContext {
  taskDescription: string;
  presentationId?: string;
}

export function buildSlidesPrompt(ctx: SlidesContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Slides Request
${ctx.taskDescription}
${ctx.presentationId ? `- **Presentation ID**: ${ctx.presentationId}` : ''}

## Available Tools
- google_slides_create — create a new presentation
- google_slides_get — get presentation structure
- google_slides_add_slide — add a new slide
- google_slides_update — update slide content
- google_slides_list — list recent presentations
`;
}
