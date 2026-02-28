import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'knowledge-search',
  name: 'Knowledge Search',
  description: 'Search organization knowledge bases and shared knowledge hub across all agents.',
  category: 'utility',
  risk: 'low',
  icon: Emoji.search,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'knowledge_base_search', name: 'Knowledge Base Search', description: 'Search org knowledge bases for docs, FAQs, processes', category: 'read', risk: 'low', skillId: 'knowledge-search', sideEffects: [] },
  { id: 'knowledge_hub_search', name: 'Knowledge Hub Search', description: 'Search shared hub for learnings from all agents', category: 'read', risk: 'low', skillId: 'knowledge-search', sideEffects: [] },
  { id: 'knowledge_search_stats', name: 'Knowledge Search Stats', description: 'View search history and efficiency metrics', category: 'read', risk: 'low', skillId: 'knowledge-search', sideEffects: [] },
];
