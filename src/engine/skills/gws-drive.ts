import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-drive',
  name: 'Google Drive',
  description: 'File management, search, sharing, and access requests.',
  category: 'productivity',
  risk: 'medium',
  icon: Emoji.folder,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_drive_list', name: 'List Files', description: 'List Google Drive files', category: 'read', risk: 'low', skillId: 'gws-drive', sideEffects: [] },
  { id: 'google_drive_get', name: 'Get File', description: 'Get file metadata/content', category: 'read', risk: 'low', skillId: 'gws-drive', sideEffects: [] },
  { id: 'google_drive_request_access', name: 'Request Access', description: 'Request access to a file', category: 'write', risk: 'low', skillId: 'gws-drive', sideEffects: [] },
  { id: 'google_drive_create', name: 'Create File', description: 'Create file/folder in Drive', category: 'write', risk: 'medium', skillId: 'gws-drive', sideEffects: ['modifies-files'] },
  { id: 'google_drive_download', name: 'Download File', description: 'Download Drive file to local disk for sending via messaging', category: 'read', risk: 'low', skillId: 'gws-drive', sideEffects: ['modifies-files'] },
  { id: 'google_drive_delete', name: 'Delete File', description: 'Delete Drive file', category: 'destroy', risk: 'medium', skillId: 'gws-drive', sideEffects: ['deletes-data'] },
  { id: 'google_drive_share', name: 'Share File', description: 'Share Drive file/folder', category: 'write', risk: 'medium', skillId: 'gws-drive', sideEffects: [] },
  { id: 'google_drive_move', name: 'Move File', description: 'Move file between folders', category: 'write', risk: 'low', skillId: 'gws-drive', sideEffects: ['modifies-files'] },
];
