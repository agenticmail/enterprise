/**
 * Microsoft 365 Tools — Index
 *
 * All Microsoft Graph API tools for enterprise agents.
 * Requires agent to have Microsoft OAuth configured with appropriate scopes.
 *
 * Services covered:
 * - Outlook Mail (send, read, search, drafts, folders, attachments)
 * - Outlook Calendar (events, free/busy, scheduling)
 * - OneDrive (files, folders, search, sharing)
 * - Teams (messages, channels, chats)
 * - To Do (tasks, lists)
 * - Contacts (people, address book)
 */

export { createOutlookMailTools } from './outlook-mail.js';
export { createOutlookCalendarTools } from './outlook-calendar.js';
export { createOneDriveTools } from './onedrive.js';
export { createTeamsTools } from './teams.js';
export { createTodoTools } from './todo.js';
export { createOutlookContactsTools } from './contacts.js';

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import type { TokenProvider } from '../oauth-token-provider.js';
export type { TokenProvider };

import { createOutlookMailTools } from './outlook-mail.js';
import { createOutlookCalendarTools } from './outlook-calendar.js';
import { createOneDriveTools } from './onedrive.js';
import { createTeamsTools } from './teams.js';
import { createTodoTools } from './todo.js';
import { createOutlookContactsTools } from './contacts.js';

export interface MicrosoftToolsConfig {
  tokenProvider: TokenProvider;
}

/**
 * Create all Microsoft 365 tools for an agent.
 * Returns tools covering Outlook Mail, Calendar, OneDrive, Teams, To Do, and Contacts.
 */
export function createAllMicrosoftTools(config: MicrosoftToolsConfig, options?: ToolCreationOptions): AnyAgentTool[] {
  const enabled = (options as any)?.enabledMicrosoftServices as string[] | undefined;
  const has = (s: string) => enabled ? enabled.includes(s) : false;
  const core = !enabled; // default: load core services

  const tools: AnyAgentTool[] = [];
  if (core || has('mail'))     tools.push(...createOutlookMailTools(config, options));
  if (core || has('calendar')) tools.push(...createOutlookCalendarTools(config, options));
  if (core || has('onedrive')) tools.push(...createOneDriveTools(config, options));
  if (core || has('tasks'))    tools.push(...createTodoTools(config, options));
  if (has('teams'))            tools.push(...createTeamsTools(config, options));
  if (has('contacts'))         tools.push(...createOutlookContactsTools(config, options));
  return tools;
}
