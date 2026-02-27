import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'core-tools',
  name: 'Core Tools',
  description: 'File operations, shell, search, and browser automation.',
  category: 'development',
  risk: 'high',
  icon: Emoji.wrench,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'read', name: 'Read File', description: 'Read file contents', category: 'read', risk: 'low', skillId: 'core-tools', sideEffects: [] },
  { id: 'write', name: 'Write File', description: 'Write content to a file', category: 'write', risk: 'medium', skillId: 'core-tools', sideEffects: ['modifies-files'] },
  { id: 'edit', name: 'Edit File', description: 'Edit a file with find/replace', category: 'write', risk: 'medium', skillId: 'core-tools', sideEffects: ['modifies-files'] },
  { id: 'bash', name: 'Shell Command', description: 'Execute shell commands', category: 'write', risk: 'high', skillId: 'core-tools', sideEffects: ['executes-code'] },
  { id: 'glob', name: 'Glob', description: 'Find files matching a pattern', category: 'read', risk: 'low', skillId: 'core-tools', sideEffects: [] },
  { id: 'grep', name: 'Grep', description: 'Search file contents with regex', category: 'read', risk: 'low', skillId: 'core-tools', sideEffects: [] },
  { id: 'browser', name: 'Browser', description: 'Control a web browser for automation', category: 'write', risk: 'high', skillId: 'core-tools', sideEffects: ['network-request'] },
  { id: 'web_search', name: 'Web Search', description: 'Search the web', category: 'read', risk: 'low', skillId: 'core-tools', sideEffects: ['network-request'] },
  { id: 'web_fetch', name: 'Web Fetch', description: 'Fetch and extract content from a URL', category: 'read', risk: 'low', skillId: 'core-tools', sideEffects: ['network-request'] },
  { id: 'request_tools', name: 'Request Tools', description: 'Dynamically load additional tool sets', category: 'read', risk: 'low', skillId: 'core-tools', sideEffects: [] },
];
