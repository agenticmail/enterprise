/**
 * file_search — Search for files by name pattern.
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

export function createFileSearchTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_search',
    description: 'Search for files by name pattern (* wildcard supported).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        pattern: { type: 'string', description: 'Filename pattern (e.g. *.ts)' },
        maxResults: { type: 'number' },
      },
      required: ['path', 'pattern'],
    },
    execute: async (_id: any, input: any) => {
      var dirPath = resolvePath(input.path, sandbox);
      var max = input.maxResults || 50;
      var regex = new RegExp('^' + input.pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      var results: string[] = [];

      async function walk(dir: string, depth: number) {
        if (depth > 10 || results.length >= max) return;
        try {
          var entries = await readdir(dir, { withFileTypes: true });
          for (var entry of entries) {
            if (results.length >= max) break;
            if (regex.test(entry.name)) results.push(relative(dirPath, join(dir, entry.name)));
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await walk(join(dir, entry.name), depth + 1);
            }
          }
        } catch {}
      }

      await walk(dirPath, 0);
      return { path: dirPath, matches: results, count: results.length };
    },
  };
}
