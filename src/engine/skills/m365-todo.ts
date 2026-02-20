import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-todo',
  name: 'Microsoft To Do',
  description: 'Personal task management with lists, due dates, reminders, and My Day.',
  category: 'productivity',
  risk: 'low',
  icon: '✅',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_todo_list', name: 'List To Do', description: 'List To Do tasks', category: 'read', risk: 'low', skillId: 'm365-todo', sideEffects: [] },
  { id: 'm365_todo_create', name: 'Create To Do', description: 'Create To Do task', category: 'write', risk: 'low', skillId: 'm365-todo', sideEffects: [] },
];
