import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-drive',
  name: 'Google Drive',
  description: 'Cloud storage, file sharing, permissions, and team drives.',
  category: 'storage',
  risk: 'medium',
  icon: '💾',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_drive_list', name: 'List Files', description: 'List Google Drive files', category: 'read', risk: 'low', skillId: 'gws-drive', sideEffects: [] },
  { id: 'gws_drive_upload', name: 'Upload File', description: 'Upload file to Drive', category: 'write', risk: 'medium', skillId: 'gws-drive', sideEffects: ['modifies-files'] },
  { id: 'gws_drive_download', name: 'Download File', description: 'Download file from Drive', category: 'read', risk: 'low', skillId: 'gws-drive', sideEffects: [] },
  { id: 'gws_drive_share', name: 'Share File', description: 'Share Drive file/folder', category: 'write', risk: 'medium', skillId: 'gws-drive', sideEffects: [] },
  { id: 'gws_drive_delete', name: 'Delete File', description: 'Delete Drive file', category: 'destroy', risk: 'medium', skillId: 'gws-drive', sideEffects: ['deletes-data'] },
  { id: 'gws_drive_search', name: 'Search Drive', description: 'Search files in Drive', category: 'read', risk: 'low', skillId: 'gws-drive', sideEffects: [] },
];
