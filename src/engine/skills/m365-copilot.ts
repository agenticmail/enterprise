import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-copilot',
  name: 'Microsoft Copilot',
  description: 'AI-powered assistant integration for M365 apps — summaries, drafting, analysis.',
  category: 'productivity',
  risk: 'medium',
  icon: '🤖',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_copilot_summarize', name: 'Copilot Summarize', description: 'AI summarization across M365', category: 'read', risk: 'low', skillId: 'm365-copilot', sideEffects: [] },
  { id: 'm365_copilot_draft', name: 'Copilot Draft', description: 'AI-assisted content drafting', category: 'write', risk: 'medium', skillId: 'm365-copilot', sideEffects: [] },
];
