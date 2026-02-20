import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-planner',
  name: 'Planner',
  description: 'Task management with boards, buckets, assignments, and progress tracking.',
  category: 'project-management',
  risk: 'low',
  icon: '📋',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_planner_tasks', name: 'List Tasks', description: 'List Planner tasks', category: 'read', risk: 'low', skillId: 'm365-planner', sideEffects: [] },
  { id: 'm365_planner_create', name: 'Create Task', description: 'Create Planner task', category: 'write', risk: 'low', skillId: 'm365-planner', sideEffects: [] },
  { id: 'm365_planner_update', name: 'Update Task', description: 'Update Planner task', category: 'write', risk: 'low', skillId: 'm365-planner', sideEffects: [] },
];
