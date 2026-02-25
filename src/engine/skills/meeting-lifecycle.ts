import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'meeting-lifecycle',
  name: 'Meeting Lifecycle',
  description: 'Meeting preparation, recording, saving notes, and capability checks.',
  category: 'collaboration',
  risk: 'medium',
  icon: Emoji.clipboard,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'system_capabilities', name: 'System Capabilities', description: 'Check system capabilities and available features', category: 'read', risk: 'low', skillId: 'meeting-lifecycle', sideEffects: [] },
  { id: 'meeting_prepare', name: 'Prepare Meeting', description: 'Prepare briefing materials for an upcoming meeting', category: 'read', risk: 'low', skillId: 'meeting-lifecycle', sideEffects: [] },
  { id: 'meeting_save', name: 'Save Meeting Notes', description: 'Save meeting notes and summary', category: 'write', risk: 'low', skillId: 'meeting-lifecycle', sideEffects: ['sends-email'] },
  { id: 'meeting_record', name: 'Record Meeting', description: 'Start/stop meeting recording', category: 'write', risk: 'medium', skillId: 'meeting-lifecycle', sideEffects: [] },
  { id: 'meeting_can_join', name: 'Can Join Meeting', description: 'Check if agent can join a specific meeting', category: 'read', risk: 'low', skillId: 'meeting-lifecycle', sideEffects: [] },
];
