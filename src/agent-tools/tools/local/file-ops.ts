/**
 * file_move + file_delete — File management operations.
 */
import { rename, unlink, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

export function createFileMoveTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_move',
    description: 'Move or rename a file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['from', 'to'],
    },
    execute: async (input: any) => {
      var fromPath = resolvePath(input.from, sandbox);
      var toPath = resolvePath(input.to, sandbox);
      await mkdir(dirname(toPath), { recursive: true });
      await rename(fromPath, toPath);
      return { ok: true, from: fromPath, to: toPath };
    },
  };
}

export function createFileDeleteTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_delete',
    description: 'Delete a file. Use with caution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    execute: async (input: any) => {
      var filePath = resolvePath(input.path, sandbox);
      await unlink(filePath);
      return { ok: true, deleted: filePath };
    },
  };
}
