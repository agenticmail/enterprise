/**
 * Google Contacts — system prompts for contact management.
 */

import type { PromptContext } from '../index.js';

export interface ContactsContext extends PromptContext {
  taskDescription: string;
}

export function buildContactsPrompt(ctx: ContactsContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Contacts Request
${ctx.taskDescription}

## Available Tools
- google_contacts_list — list contacts
- google_contacts_search — search contacts by name or email
- google_contacts_get — get contact details
- google_contacts_create — create a new contact
- google_contacts_update — update contact info
- google_contacts_delete — delete a contact
`;
}
