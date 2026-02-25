import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'agent-memory',
  name: 'Agent Memory',
  description: 'Persistent memory for storing and recalling information across sessions.',
  category: 'utility',
  risk: 'low',
  icon: '🧠',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'memory', name: 'Memory', description: 'Store or recall a memory', category: 'write', risk: 'low', skillId: 'agent-memory', sideEffects: [] },
  { id: 'memory_reflect', name: 'Memory Reflect', description: 'Reflect on and consolidate memories', category: 'write', risk: 'low', skillId: 'agent-memory', sideEffects: [] },
  { id: 'memory_context', name: 'Memory Context', description: 'Get relevant memory context for a topic', category: 'read', risk: 'low', skillId: 'agent-memory', sideEffects: [] },
  { id: 'memory_stats', name: 'Memory Stats', description: 'Get memory usage statistics', category: 'read', risk: 'low', skillId: 'agent-memory', sideEffects: [] },
];
