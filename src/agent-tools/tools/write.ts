/**
 * AgenticMail Agent Tools — Write
 *
 * Write content to a file with directory creation, path sandbox enforcement,
 * and file size limits.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, textResult, errorResult } from '../common.js';
import type { PathSandbox } from '../security.js';

const DEFAULT_MAX_WRITE_SIZE = 5 * 1024 * 1024; // 5MB

export function createWriteTool(options?: ToolCreationOptions & { pathSandbox?: PathSandbox }): AnyAgentTool {
  var sandbox = options?.pathSandbox;

  return {
    name: 'write',
    label: 'Write File',
    description: 'Write content to a file. Creates the file if it does not exist. Creates parent directories as needed. Overwrites existing content.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write.' },
        content: { type: 'string', description: 'Content to write to the file.' },
      },
      required: ['file_path', 'content'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var content = readStringParam(params, 'content', { required: true, allowEmpty: true, trim: false });

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

      // File size limit
      var contentBytes = Buffer.byteLength(content, 'utf-8');
      if (contentBytes > DEFAULT_MAX_WRITE_SIZE) {
        return errorResult('Content too large: ' + Math.round(contentBytes / 1024 / 1024) + 'MB. Maximum write size is 5MB.');
      }

      try {
        var dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
        var lines = content.split('\n').length;
        return textResult('Wrote ' + lines + ' lines to ' + filePath);
      } catch (err: any) {
        return errorResult('Failed to write file: ' + (err.message || filePath));
      }
    },
  };
}
