import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-onedrive',
  name: 'OneDrive',
  description: 'Cloud file storage, sharing, syncing, and collaboration. Manage files and folders in OneDrive for Business.',
  category: 'storage',
  risk: 'medium',
  icon: '☁️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'm365_od_list',
    name: 'List Files',
    description: 'List OneDrive files and folders',
    category: 'read',
    risk: 'low',
    skillId: 'm365-onedrive',
    sideEffects: [],
  },
  {
    id: 'm365_od_upload',
    name: 'Upload File',
    description: 'Upload file to OneDrive',
    category: 'write',
    risk: 'medium',
    skillId: 'm365-onedrive',
    sideEffects: ['modifies-files'],
  },
  {
    id: 'm365_od_download',
    name: 'Download File',
    description: 'Download file from OneDrive',
    category: 'read',
    risk: 'low',
    skillId: 'm365-onedrive',
    sideEffects: [],
  },
  {
    id: 'm365_od_share',
    name: 'Share File',
    description: 'Create sharing link',
    category: 'write',
    risk: 'medium',
    skillId: 'm365-onedrive',
    sideEffects: [],
  },
  {
    id: 'm365_od_delete',
    name: 'Delete File',
    description: 'Delete OneDrive file',
    category: 'destroy',
    risk: 'medium',
    skillId: 'm365-onedrive',
    sideEffects: ['deletes-data'],
  },
];
