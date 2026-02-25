/**
 * Google Drive — system prompts for file management tasks.
 */

import type { PromptContext } from '../index.js';

export interface DriveTaskContext extends PromptContext {
  taskDescription: string;
  fileId?: string;
  fileName?: string;
  folderId?: string;
}

export function buildDriveTaskPrompt(ctx: DriveTaskContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Drive Task
${ctx.taskDescription}
${ctx.fileId ? `- **File ID**: ${ctx.fileId}` : ''}
${ctx.fileName ? `- **File Name**: ${ctx.fileName}` : ''}
${ctx.folderId ? `- **Folder ID**: ${ctx.folderId}` : ''}

## Available Tools
- google_drive_list — list files and folders
- google_drive_search — search by name or content
- google_drive_get — get file metadata
- google_drive_download — download file content
- google_drive_upload — upload a new file
- google_drive_create_folder — create folders
- google_drive_move — move files between folders
- google_drive_share — manage sharing permissions
- google_drive_delete — trash files
`;
}
