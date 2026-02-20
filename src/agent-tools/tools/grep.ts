/**
 * AgenticMail Agent Tools — Grep
 *
 * Search file contents using regular expressions with path sandbox enforcement,
 * shell-safe ripgrep execution, and timeout protection.
 * Powered by ripgrep when available, with a Node.js fallback.
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readBooleanParam, textResult } from '../common.js';
import type { PathSandbox } from '../security.js';
import { shellEscape } from '../security.js';

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_CONTEXT_LINES = 0;
const DEFAULT_TIMEOUT_MS = 30_000;
const NODE_SEARCH_DEADLINE_MS = 15_000;

async function hasRipgrep(): Promise<boolean> {
  return new Promise(function(resolve) {
    exec('rg --version', { timeout: 3000 }, function(error) { resolve(!error); });
  });
}

async function ripgrepSearch(params: {
  pattern: string;
  searchPath: string;
  glob?: string;
  maxResults: number;
  contextLines: number;
  caseInsensitive: boolean;
  filesOnly: boolean;
}): Promise<string> {
  var args = ['rg'];
  if (params.caseInsensitive) args.push('-i');
  if (params.filesOnly) {
    args.push('-l');
  } else {
    args.push('-n');
    if (params.contextLines > 0) args.push('-C', String(params.contextLines));
  }
  if (params.glob) args.push('--glob', shellEscape(params.glob));
  args.push('-m', String(params.maxResults));
  // Use -- to separate pattern from paths, and shell-escape the pattern
  args.push('--', shellEscape(params.pattern), shellEscape(params.searchPath));

  return new Promise(function(resolve) {
    exec(args.join(' '), { maxBuffer: 1_000_000, timeout: DEFAULT_TIMEOUT_MS }, function(error, stdout) {
      resolve(stdout || '');
    });
  });
}

async function nodeSearch(params: {
  pattern: string;
  searchPath: string;
  glob?: string;
  maxResults: number;
  contextLines: number;
  caseInsensitive: boolean;
  filesOnly: boolean;
}): Promise<string> {
  var flags = params.caseInsensitive ? 'gi' : 'g';
  var regex: RegExp;
  try { regex = new RegExp(params.pattern, flags); }
  catch { return 'Invalid regex pattern: ' + params.pattern; }

  var results: string[] = [];
  var matchCount = 0;
  var deadline = Date.now() + NODE_SEARCH_DEADLINE_MS;

  async function searchDir(dir: string) {
    if (matchCount >= params.maxResults) return;
    if (Date.now() > deadline) return;
    try {
      var entries = await fs.readdir(dir, { withFileTypes: true });
      for (var entry of entries) {
        if (matchCount >= params.maxResults || Date.now() > deadline) return;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        var fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else {
          // Simple glob check
          if (params.glob) {
            var ext = '*' + path.extname(entry.name);
            if (!params.glob.includes(ext) && !params.glob.includes('*.*')) continue;
          }
          try {
            var content = await fs.readFile(fullPath, 'utf-8');
            var lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
              if (matchCount >= params.maxResults) break;
              if (regex.test(lines[i])) {
                regex.lastIndex = 0;
                if (params.filesOnly) {
                  results.push(fullPath);
                  break;
                }
                results.push(fullPath + ':' + (i + 1) + ':' + lines[i]);
                matchCount++;
              }
            }
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip */ }
  }

  await searchDir(params.searchPath);
  if (Date.now() > deadline) {
    results.push('\n(search timed out, results may be incomplete)');
  }
  return results.join('\n');
}

export function createGrepTool(options?: ToolCreationOptions & { pathSandbox?: PathSandbox }): AnyAgentTool {
  var sandbox = options?.pathSandbox;

  return {
    name: 'grep',
    label: 'Search Content',
    description: 'Search file contents using regular expressions. Uses ripgrep when available for speed. Returns matching lines with file paths and line numbers.',
    category: 'search',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression pattern to search for.' },
        path: { type: 'string', description: 'File or directory to search in.' },
        glob: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.ts").' },
        max_results: { type: 'number', description: 'Maximum results to return.' },
        context: { type: 'number', description: 'Lines of context around matches.' },
        case_insensitive: { type: 'string', description: 'Set to "true" for case-insensitive search.' },
        files_only: { type: 'string', description: 'Set to "true" to return only file paths.' },
      },
      required: ['pattern'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var pattern = readStringParam(params, 'pattern', { required: true });
      var searchPath = readStringParam(params, 'path') || options?.workspaceDir || process.cwd();
      var glob = readStringParam(params, 'glob');
      var maxResults = readNumberParam(params, 'max_results', { integer: true }) ?? DEFAULT_MAX_RESULTS;
      var contextLines = readNumberParam(params, 'context', { integer: true }) ?? DEFAULT_CONTEXT_LINES;
      var caseInsensitive = readBooleanParam(params, 'case_insensitive', false);
      var filesOnly = readBooleanParam(params, 'files_only', false);

      if (!path.isAbsolute(searchPath) && options?.workspaceDir) {
        searchPath = path.resolve(options.workspaceDir, searchPath);
      }

      // Path sandbox enforcement
      if (sandbox) {
        try {
          sandbox.validate(searchPath);
        } catch (err: any) {
          return textResult('Access denied: ' + (err.message || 'path blocked by security policy'));
        }
      }

      var searchParams = { pattern, searchPath, glob, maxResults, contextLines, caseInsensitive, filesOnly };

      var useRg = await hasRipgrep();
      var output = useRg
        ? await ripgrepSearch(searchParams)
        : await nodeSearch(searchParams);

      if (!output.trim()) {
        return textResult('No matches found for "' + pattern + '" in ' + searchPath);
      }
      return textResult(output);
    },
  };
}
