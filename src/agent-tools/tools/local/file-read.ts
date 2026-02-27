/**
 * file_read — Read file contents with optional offset/limit.
 */
import { readFile } from 'node:fs/promises';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

export function createFileReadTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_read',
    description: 'Read file contents. Use offset/limit for large files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        offset: { type: 'number', description: 'Start line (1-indexed)' },
        limit: { type: 'number', description: 'Max lines' },
      },
      required: ['path'],
    },
    execute: async (input: any) => {
      var filePath = resolvePath(input.path, sandbox);
      var content = await readFile(filePath, 'utf-8');

      if (input.offset || input.limit) {
        var lines = content.split('\n');
        var start = Math.max(0, (input.offset || 1) - 1);
        var end = input.limit ? start + input.limit : lines.length;
        content = lines.slice(start, end).join('\n');
      }

      if (content.length > 50000) {
        content = content.slice(0, 50000) + '\n\n[...truncated at 50KB]';
      }

      return { content, path: filePath, size: content.length };
    },
  };
}
