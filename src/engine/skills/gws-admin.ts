import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-admin',
  name: 'Google Admin',
  description: 'User management, security, device management, and organization settings.',
  category: 'platform',
  risk: 'critical',
  icon: '⚙️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'gws_admin_users', name: 'Manage Users', description: 'List/create/update Workspace users', category: 'write', risk: 'critical', skillId: 'gws-admin', sideEffects: [] },
  { id: 'gws_admin_groups', name: 'Manage Groups', description: 'Create/manage Google groups', category: 'write', risk: 'high', skillId: 'gws-admin', sideEffects: [] },
  { id: 'gws_admin_orgunits', name: 'Manage Org Units', description: 'Manage organizational units', category: 'write', risk: 'high', skillId: 'gws-admin', sideEffects: [] },
];
