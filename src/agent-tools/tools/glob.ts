/**
 * AgenticMail Agent Tools — Glob
 *
 * Find files matching glob patterns with path sandbox enforcement,
 * depth limiting, and timeout protection.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, textResult } from '../common.js';
import type { PathSandbox } from '../security.js';

const DEFAULT_MAX_RESULTS = 200;
const DEFAULT_MAX_DEPTH = 20;
const DEFAULT_TIMEOUT_MS = 10_000;

// Fallback glob implementation using recursive readdir
async function simpleGlob(
  pattern: string,
  cwd: string,
  opts: { maxDepth: number; deadline: number },
): Promise<string[]> {
  var results: string[] = [];

  // Convert simple glob pattern to regex
  var regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  var regex = new RegExp('^' + regexStr + '$');

  async function walk(dir: string, prefix: string, depth: number) {
    // Depth limit
    if (depth > opts.maxDepth) return;
    // Timeout check
    if (Date.now() > opts.deadline) return;

    try {
      var entries = await fs.readdir(dir, { withFileTypes: true });
      for (var entry of entries) {
        if (Date.now() > opts.deadline) return;
        if (entry.name.startsWith('.') && !pattern.startsWith('.')) continue;
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        var relPath = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), relPath, depth + 1);
        } else if (regex.test(relPath)) {
          results.push(relPath);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  await walk(cwd, '', 0);
  return results.sort();
}

export function createGlobTool(options?: ToolCreationOptions & { pathSandbox?: PathSandbox }): AnyAgentTool {
  var sandbox = options?.pathSandbox;

  return {
    name: 'glob',
    label: 'Find Files',
    description: 'Find files matching a glob pattern. Supports ** for recursive matching, * for single directory wildcards. Returns matching file paths.',
    category: 'search',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.js").' },
        path: { type: 'string', description: 'Directory to search in. Defaults to workspace root.' },
        max_results: { type: 'number', description: 'Maximum results to return (default 200).' },
      },
      required: ['pattern'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var pattern = readStringParam(params, 'pattern', { required: true });
      var searchPath = readStringParam(params, 'path');
      var maxResults = readNumberParam(params, 'max_results', { integer: true }) ?? DEFAULT_MAX_RESULTS;

      var cwd = searchPath || options?.workspaceDir || process.cwd();
      if (!path.isAbsolute(cwd) && options?.workspaceDir) {
        cwd = path.resolve(options.workspaceDir, cwd);
      }

      // Path sandbox enforcement — validate the search directory
      if (sandbox) {
        try {
          sandbox.validate(cwd);
        } catch (err: any) {
          return textResult('Access denied: ' + (err.message || 'path blocked by security policy'));
        }
      }

      try {
        var deadline = Date.now() + DEFAULT_TIMEOUT_MS;
        var results = await simpleGlob(pattern, cwd, {
          maxDepth: DEFAULT_MAX_DEPTH,
          deadline,
        });
        var limited = results.slice(0, maxResults);
        var truncated = results.length > maxResults;
        var timedOut = Date.now() > deadline;

        if (limited.length === 0) {
          var msg = 'No files matching "' + pattern + '" found in ' + cwd;
          if (timedOut) msg += ' (search timed out)';
          return textResult(msg);
        }

        var fullPaths = limited.map(function(r) { return path.join(cwd, r); });
        var output = fullPaths.join('\n');
        if (truncated) {
          output += '\n\n(' + results.length + ' total matches, showing first ' + maxResults + ')';
        }
        if (timedOut) {
          output += '\n(search timed out, results may be incomplete)';
        }
        return textResult(output);
      } catch (err: any) {
        return textResult('Glob error: ' + (err.message || 'unknown error'));
      }
    },
  };
}
