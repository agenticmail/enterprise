/**
 * file_write — Write content to a file. Creates dirs automatically.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

export function createFileWriteTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_write',
    description: 'Write content to a file. Creates parent directories. Overwrites if exists.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
    execute: async (_id: any, input: any) => {
      var filePath = resolvePath(input.path, sandbox);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content, 'utf-8');
      return { ok: true, path: filePath, bytesWritten: Buffer.byteLength(input.content, 'utf-8') };
    },
  };
}
