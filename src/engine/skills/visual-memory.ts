import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'visual-memory',
  name: 'Visual Memory',
  description: 'Enterprise visual memory system — persistent, DB-backed visual recall with BM25F search integration. Emulates human visual memory: selective capture, semantic consolidation, confidence decay, fast pattern recognition.',
  category: 'memory',
  risk: 'low',
  icon: Emoji.eye,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'vision_capture', name: 'Capture', description: 'Screenshot browser page and store in visual memory with BM25F-searchable semantic link', category: 'memory' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: ['storage'] },
  { id: 'vision_query', name: 'Query', description: 'Search visual memory by time, session, or description', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_compare', name: 'Compare', description: 'Side-by-side comparison of two observations with similarity metrics', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_diff', name: 'Visual Diff', description: 'Pixel-level diff between two captures showing changed regions', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_similar', name: 'Find Similar', description: 'Find visually similar observations using perceptual hashing', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_track', name: 'Track Changes', description: 'Track visual changes to a page over time against a baseline', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: ['storage'] },
  { id: 'vision_ocr', name: 'OCR', description: 'Extract text from a visual observation via accessibility tree', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_health', name: 'Health', description: 'Visual memory statistics, health metrics, and recommendations', category: 'read' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
  { id: 'vision_session_start', name: 'Start Session', description: 'Begin a named observation session for grouping related captures', category: 'memory' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: ['storage'] },
  { id: 'vision_session_end', name: 'End Session', description: 'End observation session with summary', category: 'memory' as const, risk: 'low' as const, skillId: 'visual-memory', sideEffects: [] },
];
