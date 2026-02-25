import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-tasks',
  name: 'Google Tasks',
  description: 'Task lists, create/complete/update tasks, due dates.',
  category: 'productivity',
  risk: 'medium',
  icon: '✅',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_tasks_list_tasklists', name: 'List Task Lists', description: 'List all task lists', category: 'read', risk: 'low', skillId: 'gws-tasks', sideEffects: [] },
  { id: 'google_tasks_list', name: 'List Tasks', description: 'List tasks in a list', category: 'read', risk: 'low', skillId: 'gws-tasks', sideEffects: [] },
  { id: 'google_tasks_create', name: 'Create Task', description: 'Create a new task', category: 'write', risk: 'low', skillId: 'gws-tasks', sideEffects: [] },
  { id: 'google_tasks_complete', name: 'Complete Task', description: 'Mark task as complete', category: 'write', risk: 'low', skillId: 'gws-tasks', sideEffects: [] },
  { id: 'google_tasks_update', name: 'Update Task', description: 'Update task details', category: 'write', risk: 'low', skillId: 'gws-tasks', sideEffects: [] },
  { id: 'google_tasks_delete', name: 'Delete Task', description: 'Delete a task', category: 'destroy', risk: 'medium', skillId: 'gws-tasks', sideEffects: ['deletes-data'] },
  { id: 'google_tasks_create_list', name: 'Create Task List', description: 'Create a new task list', category: 'write', risk: 'low', skillId: 'gws-tasks', sideEffects: [] },
];
