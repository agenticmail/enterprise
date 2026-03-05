import type { SkillDefinition, ToolDefinition } from '../skills.js';

const FS_SKILL_DEF: SkillDefinition = {
  id: 'local-filesystem',
  name: 'Filesystem',
  description: 'Read, write, edit, move, delete, search, and list files on the host.',
  category: 'local', risk: 'medium' as any, tools: [],
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
  category: 'local', risk: 'medium' as any, tools: [],
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

const CODING_SKILL_DEF: SkillDefinition = {
  id: 'local-coding',
  name: 'Coding & Development',
  description: 'Advanced coding tools: plan, search, build, test, git, multi-edit, pm2.',
  category: 'local', risk: 'medium' as any, tools: [],
};

const CODING_TOOLS: ToolDefinition[] = [
  { id: 'code_plan', name: 'Plan Code Changes', description: 'Analyze codebase and create implementation plan', category: 'read', risk: 'low', skillId: 'local-coding', sideEffects: [] },
  { id: 'code_search', name: 'Search Code', description: 'Search codebase with ripgrep/grep', category: 'read', risk: 'low', skillId: 'local-coding', sideEffects: [] },
  { id: 'code_read', name: 'Read Code', description: 'Read file with line numbers, ranges, symbol outline', category: 'read', risk: 'low', skillId: 'local-coding', sideEffects: [] },
  { id: 'code_multi_edit', name: 'Multi-Edit', description: 'Apply multiple edits to one or more files in one call', category: 'write', risk: 'medium', skillId: 'local-coding', sideEffects: ['modifies-files'] },
  { id: 'code_build', name: 'Build Project', description: 'Build project with error parsing', category: 'write', risk: 'medium', skillId: 'local-coding', sideEffects: ['executes-code'] },
  { id: 'code_test', name: 'Run Tests', description: 'Run tests with result parsing', category: 'write', risk: 'medium', skillId: 'local-coding', sideEffects: ['executes-code'] },
  { id: 'code_git', name: 'Git Operations', description: 'Git status, diff, log, commit, push, branch', category: 'write', risk: 'medium', skillId: 'local-coding', sideEffects: ['modifies-files'] },
  { id: 'code_create', name: 'Create File', description: 'Create new file with auto-directory creation', category: 'write', risk: 'medium', skillId: 'local-coding', sideEffects: ['modifies-files'] },
  { id: 'code_diff', name: 'Diff Preview', description: 'Preview edit as unified diff without applying', category: 'read', risk: 'low', skillId: 'local-coding', sideEffects: [] },
  { id: 'code_pm2', name: 'PM2 Manager', description: 'Manage pm2 processes: list, restart, logs, stop', category: 'write', risk: 'medium', skillId: 'local-coding', sideEffects: ['executes-code'] },
  { id: 'agent_stop', name: 'Stop Agent', description: 'Stop this agent process when user requests shutdown', category: 'write', risk: 'high', skillId: 'local-shell', sideEffects: ['terminates-process'] },
  { id: 'check_dependency', name: 'Check Dependency', description: 'Check if a system dependency is installed', category: 'read', risk: 'low', skillId: 'local-shell', sideEffects: [] },
  { id: 'install_dependency', name: 'Install Dependency', description: 'Install a system dependency', category: 'write', risk: 'high', skillId: 'local-shell', sideEffects: ['installs-software'] },
  { id: 'batch_check_dependencies', name: 'Batch Check Dependencies', description: 'Check multiple dependencies at once', category: 'read', risk: 'low', skillId: 'local-shell', sideEffects: [] },
  { id: 'uninstall_dependency', name: 'Uninstall Dependency', description: 'Uninstall agent-installed dependency', category: 'write', risk: 'high', skillId: 'local-shell', sideEffects: ['uninstalls-software'] },
];

export const LOCAL_SYSTEM_SKILLS: SkillDefinition[] = [
  { ...FS_SKILL_DEF, tools: FS_TOOLS },
  { ...SHELL_SKILL_DEF, tools: SHELL_TOOLS },
  { ...CODING_SKILL_DEF, tools: CODING_TOOLS },
];
