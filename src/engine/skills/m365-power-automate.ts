import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'm365-power-automate',
  name: 'Power Automate',
  description: 'Workflow automation, triggers, connectors, and flow management.',
  category: 'automation',
  risk: 'high',
  icon: '⚡',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'm365_pa_flows', name: 'List Flows', description: 'List Power Automate flows', category: 'read', risk: 'low', skillId: 'm365-power-automate', sideEffects: [] },
  { id: 'm365_pa_trigger', name: 'Trigger Flow', description: 'Trigger a Power Automate flow', category: 'execute', risk: 'high', skillId: 'm365-power-automate', sideEffects: ['runs-code'] },
  { id: 'm365_pa_create', name: 'Create Flow', description: 'Create Power Automate flow', category: 'write', risk: 'high', skillId: 'm365-power-automate', sideEffects: [] },
];
