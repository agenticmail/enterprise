import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-sharepoint',
  name: 'SharePoint',
  description: 'Document libraries, sites, lists, pages, and content management. Full SharePoint Online API access.',
  category: 'storage',
  risk: 'medium',
  icon: '📚',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_sp_sites', name: 'List Sites', description: 'List SharePoint sites', category: 'read', risk: 'low', skillId: 'm365-sharepoint', sideEffects: [] },
  { id: 'm365_sp_pages', name: 'Manage Pages', description: 'Create and edit SharePoint pages', category: 'write', risk: 'medium', skillId: 'm365-sharepoint', sideEffects: [] },
  { id: 'm365_sp_lists', name: 'Manage Lists', description: 'CRUD operations on SharePoint lists', category: 'write', risk: 'medium', skillId: 'm365-sharepoint', sideEffects: [] },
  { id: 'm365_sp_files', name: 'Manage Files', description: 'Upload, download, manage SharePoint documents', category: 'write', risk: 'medium', skillId: 'm365-sharepoint', sideEffects: ['modifies-files'] },
  { id: 'm365_sp_search', name: 'Search SharePoint', description: 'Search across SharePoint content', category: 'read', risk: 'low', skillId: 'm365-sharepoint', sideEffects: [] },
];
