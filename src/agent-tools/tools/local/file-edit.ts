/**
 * file_edit — Edit a file by replacing exact text.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

export function createFileEditTool(sandbox?: string): ToolDefinition {
  return {
    name: 'file_edit',
    description: 'Edit a file by replacing exact text match.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string', description: 'Exact text to find' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
    execute: async (input: any) => {
      var filePath = resolvePath(input.path, sandbox);
      var content = await readFile(filePath, 'utf-8');
      if (!content.includes(input.old_text)) {
        return { error: 'old_text not found in file. Must match exactly including whitespace.' };
      }
      await writeFile(filePath, content.replace(input.old_text, input.new_text), 'utf-8');
      return { ok: true, path: filePath };
    },
  };
}
