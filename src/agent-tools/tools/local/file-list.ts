/**
 * file_list — List files/directories at a path.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

export function createFileListTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_list',
    description: 'List files and directories at a path.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    execute: async (_id: any, input: any) => {
      var dirPath = resolvePath(input.path, sandbox);
      var entries = await readdir(dirPath, { withFileTypes: true });
      var results: any[] = [];

      for (var entry of entries) {
        var info: any = { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
        try {
          var s = await stat(join(dirPath, entry.name));
          info.size = s.size;
          info.modified = s.mtime.toISOString();
        } catch {}
        results.push(info);
        if (results.length >= 500) break;
      }

      return { path: dirPath, entries: results, count: results.length };
    },
  };
}
