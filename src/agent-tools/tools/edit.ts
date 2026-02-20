/**
 * AgenticMail Agent Tools — Edit
 *
 * Perform exact string replacements in files with path sandbox enforcement.
 * Supports single match replacement and replace-all mode.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readBooleanParam, textResult, errorResult, ToolInputError } from '../common.js';
import type { PathSandbox } from '../security.js';

export function createEditTool(options?: ToolCreationOptions & { pathSandbox?: PathSandbox }): AnyAgentTool {
  var sandbox = options?.pathSandbox;

  return {
    name: 'edit',
    label: 'Edit File',
    description: 'Perform exact string replacement in a file. The old_string must be unique in the file unless replace_all is true. The new_string must be different from old_string.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit.' },
        old_string: { type: 'string', description: 'The exact text to find and replace.' },
        new_string: { type: 'string', description: 'The replacement text.' },
        replace_all: { type: 'string', description: 'Set to "true" to replace all occurrences.' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var oldString = readStringParam(params, 'old_string', { required: true, trim: false, allowEmpty: false });
      var newString = readStringParam(params, 'new_string', { required: true, trim: false, allowEmpty: true });
      var replaceAll = readBooleanParam(params, 'replace_all', false);

      if (oldString === newString) {
        throw new ToolInputError('old_string and new_string must be different');
      }

      if (!path.isAbsolute(filePath) && options?.workspaceDir) {
        filePath = path.resolve(options.workspaceDir, filePath);
      }

      // Path sandbox enforcement
      if (sandbox) {
        try {
          sandbox.validate(filePath);
        } catch (err: any) {
          return errorResult('Access denied: ' + (err.message || 'path blocked by security policy'));
        }
      }

      var content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch (err: any) {
        return errorResult('File not found: ' + filePath);
      }

      if (!content.includes(oldString)) {
        return errorResult('old_string not found in ' + filePath + '. Make sure the string matches exactly, including whitespace and indentation.');
      }

      if (replaceAll) {
        var count = 0;
        var newContent = content;
        while (newContent.includes(oldString)) {
          newContent = newContent.replace(oldString, newString);
          count++;
          if (count > 10000) break; // Safety limit
        }
        await fs.writeFile(filePath, newContent, 'utf-8');
        return textResult('Replaced ' + count + ' occurrence(s) in ' + filePath);
      }

      // Check uniqueness
      var firstIdx = content.indexOf(oldString);
      var secondIdx = content.indexOf(oldString, firstIdx + 1);
      if (secondIdx !== -1) {
        return errorResult(
          'old_string is not unique in ' + filePath + ' (found at least 2 occurrences). ' +
          'Provide more surrounding context to make it unique, or use replace_all: true.'
        );
      }

      var newContent = content.replace(oldString, newString);
      await fs.writeFile(filePath, newContent, 'utf-8');

      // Show context around the edit
      var editStart = firstIdx;
      var linesBefore = content.slice(0, editStart).split('\n');
      var editLine = linesBefore.length;
      return textResult('Edited ' + filePath + ' (line ' + editLine + ')');
    },
  };
}
