import type { SkillDefinition, ToolDefinition } from '../skills.js';

const FS_SKILL_DEF: SkillDefinition = {
  id: 'local-filesystem',
  name: 'Filesystem',
  description: 'Read, write, edit, move, delete, search, and list files on the host.',
  category: 'local',
};

const FS_TOOLS: ToolDefinition[] = [
  { id: 'file_read', name: 'Read File', description: 'Read file contents', category: 'read', risk: 'low', skillId: 'local-filesystem', sideEffects: [] },
  { id: 'file_write', name: 'Write File', description: 'Write content to a file', category: 'write', risk: 'medium', skillId: 'local-filesystem', sideEffects: ['modifies-files'] },
  { id: 'file_edit', name: 'Edit File', description: 'Edit a file with find/replace', category: 'write', risk: 'medium', skillId: 'local-filesystem', sideEffects: ['modifies-files'] },
  { id: 'file_list', name: 'List Files', description: 'List directory contents', category: 'read', risk: 'low', skillId: 'local-filesystem', sideEffects: [] },
  { id: 'file_search', name: 'Search Files', description: 'Search files by name or content', category: 'read', risk: 'low', skillId: 'local-filesystem', sideEffects: [] },
  { id: 'file_move', name: 'Move File', description: 'Move or rename a file', category: 'write', risk: 'medium', skillId: 'local-filesystem', sideEffects: ['modifies-files'] },
  { id: 'file_delete', name: 'Delete File', description: 'Delete a file', category: 'write', risk: 'high', skillId: 'local-filesystem', sideEffects: ['modifies-files'] },
];

const SHELL_SKILL_DEF: SkillDefinition = {
  id: 'local-shell',
  name: 'Shell & System',
  description: 'Execute commands, interactive PTY, sudo, package install, system info.',
  category: 'local',
};

const SHELL_TOOLS: ToolDefinition[] = [
  { id: 'shell_exec', name: 'Shell Exec', description: 'Execute a shell command', category: 'write', risk: 'high', skillId: 'local-shell', sideEffects: ['executes-code'] },
  { id: 'shell_interactive', name: 'Interactive Shell', description: 'PTY session with follow-up input', category: 'write', risk: 'high', skillId: 'local-shell', sideEffects: ['executes-code'] },
  { id: 'shell_sudo', name: 'Sudo Command', description: 'Execute with root privileges', category: 'write', risk: 'critical', skillId: 'local-shell', sideEffects: ['executes-code'] },
  { id: 'shell_install', name: 'Install Package', description: 'Install packages via system package manager', category: 'write', risk: 'high', skillId: 'local-shell', sideEffects: ['executes-code', 'modifies-files'] },
  { id: 'shell_session_list', name: 'List Sessions', description: 'List active PTY sessions', category: 'read', risk: 'low', skillId: 'local-shell', sideEffects: [] },
  { id: 'shell_session_kill', name: 'Kill Session', description: 'Kill a PTY session', category: 'write', risk: 'medium', skillId: 'local-shell', sideEffects: [] },
  { id: 'system_info', name: 'System Info', description: 'Get OS, CPU, memory info', category: 'read', risk: 'low', skillId: 'local-shell', sideEffects: [] },
];

export const LOCAL_SYSTEM_SKILLS: SkillDefinition[] = [
  { ...FS_SKILL_DEF, tools: FS_TOOLS },
  { ...SHELL_SKILL_DEF, tools: SHELL_TOOLS },
];
