/**
 * Google Forms — system prompts for form operations.
 */

import type { PromptContext } from '../index.js';

export interface FormsContext extends PromptContext {
  taskDescription: string;
  formId?: string;
}

export function buildFormsPrompt(ctx: FormsContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Forms Request
${ctx.taskDescription}
${ctx.formId ? `- **Form ID**: ${ctx.formId}` : ''}

## Available Tools
- google_forms_create — create a new form
- google_forms_get — get form structure and questions
- google_forms_responses — list form responses
- google_forms_update — update form title or description
`;
}
