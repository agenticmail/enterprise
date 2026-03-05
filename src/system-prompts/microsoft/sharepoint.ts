/**
 * SharePoint — system prompt for site and document management via Microsoft 365.
 */

import { buildScheduleBlock, type PromptContext } from '../index.js';
import { NO_AI_DISCLOSURE } from '../shared-blocks.js';

export interface SharePointContext extends PromptContext {
  action: 'browse' | 'upload' | 'search' | 'list_management';
  siteId?: string;
  details?: string;
}

export function buildSharePointPrompt(ctx: SharePointContext): string {
  return `You are ${ctx.agent.name}${ctx.agent.role ? `, a ${ctx.agent.role}` : ''}.
${NO_AI_DISCLOSURE}
${buildScheduleBlock(ctx.schedule)}

## SharePoint Task
Action: ${ctx.action}
${ctx.siteId ? `Site: ${ctx.siteId}` : ''}
${ctx.details ? `Details: ${ctx.details}` : ''}

## Available Tools
Sites & Files:
- sharepoint_list_sites — discover SharePoint sites
- sharepoint_get_site — get site details
- sharepoint_list_drives — list document libraries on a site
- sharepoint_list_files — browse files in a document library
- sharepoint_upload_file — upload files to SharePoint
- sharepoint_search — search across all SharePoint content

Lists:
- sharepoint_list_lists — list SharePoint lists on a site
- sharepoint_list_items — read items from a list
- sharepoint_create_list_item — add items to a list
- sharepoint_update_list_item — update existing list items

## Guidelines
- Use sharepoint_search for cross-site content discovery
- SharePoint document libraries are OneDrive-compatible (use driveId with OneDrive/Excel tools)
- List items support custom columns — check list schema first
`;
}
