/**
 * AgenticMail Agent Tools — Read
 *
 * Read file contents with line numbering, offset/limit support,
 * image detection, binary file handling, and path sandbox enforcement.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, textResult, errorResult } from '../common.js';
import type { PathSandbox } from '../security.js';

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_LINE_LENGTH = 2000;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function numberLines(content: string, startLine: number): string {
  var lines = content.split('\n');
  var width = String(startLine + lines.length - 1).length;
  return lines
    .map(function(line, i) {
      var num = String(startLine + i).padStart(width, ' ');
      var truncated = line.length > DEFAULT_MAX_LINE_LENGTH
        ? line.slice(0, DEFAULT_MAX_LINE_LENGTH) + '... (truncated)'
        : line;
      return num + '\t' + truncated;
    })
    .join('\n');
}

async function detectBinary(filePath: string): Promise<boolean> {
  try {
    var fd = await fs.open(filePath, 'r');
    try {
      var buf = Buffer.alloc(512);
      var result = await fd.read(buf, 0, 512, 0);
      for (var i = 0; i < result.bytesRead; i++) {
        if (buf[i] === 0) return true;
      }
      return false;
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
}

function isImagePath(filePath: string): boolean {
  var ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'].includes(ext);
}

export function createReadTool(options?: ToolCreationOptions & { pathSandbox?: PathSandbox }): AnyAgentTool {
  var sandbox = options?.pathSandbox;

  return {
    name: 'read',
    label: 'Read File',
    description: 'Read a file from the filesystem. Returns content with line numbers. Supports offset and limit for large files. Can read images and detect binary files.',
    category: 'file',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read.' },
        offset: { type: 'number', description: 'Line number to start reading from (1-based).' },
        limit: { type: 'number', description: 'Number of lines to read.' },
      },
      required: ['file_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var offset = readNumberParam(params, 'offset', { integer: true });
      var limit = readNumberParam(params, 'limit', { integer: true });

      // Resolve path relative to workspace
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

      try {
        var stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          return errorResult(filePath + ' is a directory. Use the bash tool with ls to list directory contents.');
        }

        // File size limit to prevent memory exhaustion
        if (stat.size > DEFAULT_MAX_FILE_SIZE) {
          return errorResult('File too large: ' + filePath + ' (' + Math.round(stat.size / 1024 / 1024) + 'MB). Maximum is 10MB.');
        }
      } catch (err: any) {
        return errorResult('File not found: ' + filePath);
      }

      // Image files
      if (isImagePath(filePath)) {
        try {
          var buf = await fs.readFile(filePath);
          var ext = path.extname(filePath).toLowerCase();
          var mimeMap: Record<string, string> = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
            '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
          };
          return {
            content: [
              { type: 'text', text: 'Image: ' + filePath },
              { type: 'image', data: buf.toString('base64'), mimeType: mimeMap[ext] || 'image/png' },
            ],
          };
        } catch {
          return errorResult('Failed to read image: ' + filePath);
        }
      }

      // Binary detection
      if (await detectBinary(filePath)) {
        var size = stat.size;
        return textResult('Binary file: ' + filePath + ' (' + size + ' bytes). Cannot display binary content.');
      }

      // Text files
      try {
        var content = await fs.readFile(filePath, 'utf-8');
        var lines = content.split('\n');
        var totalLines = lines.length;

        var startLine = offset && offset > 0 ? offset : 1;
        var maxLines = limit && limit > 0 ? limit : DEFAULT_MAX_LINES;

        var startIdx = startLine - 1;
        var endIdx = Math.min(startIdx + maxLines, totalLines);
        var selectedLines = lines.slice(startIdx, endIdx);
        var selected = selectedLines.join('\n');

        var numbered = numberLines(selected, startLine);
        var header = '';
        if (startIdx > 0 || endIdx < totalLines) {
          header = '(Showing lines ' + startLine + '-' + (startLine + selectedLines.length - 1) + ' of ' + totalLines + ')\n';
        }

        return textResult(header + numbered);
      } catch (err: any) {
        return errorResult('Failed to read file: ' + (err.message || filePath));
      }
    },
  };
}
