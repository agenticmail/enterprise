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
export { createExcelTools } from './excel.js';
export { createSharePointTools } from './sharepoint.js';
export { createOneNoteTools } from './onenote.js';

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import type { TokenProvider } from '../oauth-token-provider.js';
export type { TokenProvider };

import { createOutlookMailTools } from './outlook-mail.js';
import { createOutlookCalendarTools } from './outlook-calendar.js';
import { createOneDriveTools } from './onedrive.js';
import { createTeamsTools } from './teams.js';
import { createTodoTools } from './todo.js';
import { createOutlookContactsTools } from './contacts.js';
import { createExcelTools } from './excel.js';
import { createSharePointTools } from './sharepoint.js';
import { createOneNoteTools } from './onenote.js';

export interface MicrosoftToolsConfig {
  tokenProvider: TokenProvider;
}

/**
 * Create all Microsoft 365 tools for an agent.
 *
 * 9 services, 70+ tools:
 * - Outlook Mail (13 tools) — inbox, send, reply, forward, search, drafts, attachments
 * - Outlook Calendar (7 tools) — events, create, free/busy, respond to invites
 * - OneDrive (7 tools) — files, folders, search, upload, share
 * - Teams (8 tools) — channels, chats, messages, presence
 * - To Do (6 tools) — task lists, tasks CRUD
 * - Contacts (5 tools) — address book, people search
 * - Excel (7 tools) — read/write cells, ranges, tables, worksheets
 * - SharePoint (10 tools) — sites, document libraries, lists, search
 * - OneNote (6 tools) — notebooks, sections, pages, read/write
 *
 * Core services (mail, calendar, onedrive, tasks) load by default.
 * Enable additional services via enabledMicrosoftServices option.
 */
export function createAllMicrosoftTools(config: MicrosoftToolsConfig, options?: ToolCreationOptions): AnyAgentTool[] {
  const enabled = (options as any)?.enabledMicrosoftServices as string[] | undefined;
  const has = (s: string) => enabled ? enabled.includes(s) : false;
  const core = !enabled; // default: load core services

  const tools: AnyAgentTool[] = [];
  // Core services (always loaded unless explicitly selecting)
  if (core || has('mail'))       tools.push(...createOutlookMailTools(config, options));
  if (core || has('calendar'))   tools.push(...createOutlookCalendarTools(config, options));
  if (core || has('onedrive'))   tools.push(...createOneDriveTools(config, options));
  if (core || has('tasks'))      tools.push(...createTodoTools(config, options));
  // Extended services (opt-in)
  if (has('teams'))              tools.push(...createTeamsTools(config, options));
  if (has('contacts'))           tools.push(...createOutlookContactsTools(config, options));
  if (has('excel'))              tools.push(...createExcelTools(config, options));
  if (has('sharepoint'))         tools.push(...createSharePointTools(config, options));
  if (has('onenote'))            tools.push(...createOneNoteTools(config, options));
  return tools;
}
