import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-admin',
  name: 'Microsoft 365 Admin',
  description: 'User management, licensing, security settings, and compliance controls.',
  category: 'platform',
  risk: 'critical',
  icon: '⚙️',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_admin_users', name: 'Manage Users', description: 'List/create/update M365 users', category: 'write', risk: 'critical', skillId: 'm365-admin', sideEffects: [] },
  { id: 'm365_admin_licenses', name: 'Manage Licenses', description: 'Assign/remove M365 licenses', category: 'write', risk: 'critical', skillId: 'm365-admin', sideEffects: ['financial'] },
  { id: 'm365_admin_groups', name: 'Manage Groups', description: 'Create/manage M365 groups', category: 'write', risk: 'high', skillId: 'm365-admin', sideEffects: [] },
];
