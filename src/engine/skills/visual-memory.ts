import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'visual-memory',
  name: 'Visual Memory',
  description: 'Persistent visual memory for agents. Capture, compare, and track visual changes over time using perceptual hashing.',
  category: 'memory',
  risk: 'low',
  icon: Emoji.eye,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'vision_capture', name: 'Capture Visual', description: 'Screenshot current browser page and store in visual memory', category: 'memory', risk: 'low', skillId: 'visual-memory', sideEffects: ['storage'] },
  { id: 'vision_query', name: 'Query Memory', description: 'Search visual memory by time, session, or description', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_similar', name: 'Find Similar', description: 'Find visually similar past captures using perceptual hashing', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_diff', name: 'Visual Diff', description: 'Pixel-level diff showing changed regions between two captures', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_recall', name: 'Recall Capture', description: 'Retrieve a specific capture by ID with full metadata', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_stats', name: 'Memory Stats', description: 'Visual memory statistics — total captures, sessions, time range', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_page_map', name: 'Page Action Map', description: 'Extract all interactable elements (buttons, links, inputs) from current page — faster than screenshot', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_page_meta', name: 'Page Meta', description: 'Instant page metadata — title, URL, form count, login detection. Fastest page awareness.', category: 'read', risk: 'low', skillId: 'visual-memory', sideEffects: [] },
];
