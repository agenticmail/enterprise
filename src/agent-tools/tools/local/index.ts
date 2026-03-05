/**
 * Local System Tools — barrel export.
 * 
 * Provides filesystem, shell, and system info tools.
 * Must be enabled via Settings > Platform Capabilities.
 */
import { createFileReadTool } from './file-read.js';
import { createFileWriteTool } from './file-write.js';
import { createFileEditTool } from './file-edit.js';
import { createFileListTool } from './file-list.js';
import { createFileSearchTool } from './file-search.js';
import { createFileMoveTool, createFileDeleteTool } from './file-ops.js';
import { createShellTools } from './shell.js';
import { createDependencyManagerTools } from './dependency-manager.js';
import { createSystemInfoTool } from './system-info.js';
import { createCodingTools } from './coding.js';
import { createAgentControlTools } from './agent-control.js';
import type { ToolDefinition, ToolCreationOptions } from '../../types.js';

export interface LocalToolsConfig {
  /** If set, filesystem tools are sandboxed to this directory. Null = full access. */
  sandboxRoot?: string;
  /** Working directory for shell commands. */
  shellCwd?: string;
  /** Shell command timeout in seconds (default 30). */
  shellTimeout?: number;
  /** Pass-through ToolCreationOptions for tools that need runtime refs */
  toolOptions?: ToolCreationOptions;
}

export function createLocalSystemTools(config?: LocalToolsConfig): ToolDefinition[] {
  var sandbox = config?.sandboxRoot;

  return [
    createFileReadTool(sandbox),
    createFileWriteTool(sandbox),
    createFileEditTool(sandbox),
    createFileListTool(sandbox),
    createFileSearchTool(sandbox),
    createFileMoveTool(sandbox),
    createFileDeleteTool(sandbox),
    ...createShellTools({ cwd: config?.shellCwd, timeout: config?.shellTimeout }),
    ...createDependencyManagerTools(),
    createSystemInfoTool(),
    ...createCodingTools({ cwd: config?.shellCwd, sandbox }),
    ...createAgentControlTools(config?.toolOptions),
  ];
}

export { createFileReadTool } from './file-read.js';
export { createFileWriteTool } from './file-write.js';
export { createFileEditTool } from './file-edit.js';
export { createFileListTool } from './file-list.js';
export { createFileSearchTool } from './file-search.js';
export { createFileMoveTool, createFileDeleteTool } from './file-ops.js';
export { createShellTools, createShellExecTool } from './shell.js';
export { createSystemInfoTool } from './system-info.js';
export { createCodingTools } from './coding.js';
export { createDependencyManagerTools } from './dependency-manager.js';
export { createAgentControlTools } from './agent-control.js';
