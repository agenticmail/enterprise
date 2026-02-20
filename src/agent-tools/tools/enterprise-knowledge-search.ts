/**
 * AgenticMail Agent Tools — Enterprise Knowledge Search
 *
 * Searches a local knowledge base directory ({workspaceDir}/.agenticmail/knowledge/).
 * Each "space" is a subdirectory. Documents are markdown/text files.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';

var KNOWLEDGE_SUBDIR = '.agenticmail/knowledge';
var DEFAULT_SEARCH_LIMIT = 10;
var DEFAULT_RECENT_DAYS = 7;
var DEFAULT_RECENT_LIMIT = 20;
var SNIPPET_CONTEXT_CHARS = 120;
var SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.text', '.markdown', '.rst', '.json', '.yaml', '.yml', '.csv']);

function resolveKnowledgeDir(options?: ToolCreationOptions): string {
  var base = options?.workspaceDir || process.cwd();
  return path.join(base, KNOWLEDGE_SUBDIR);
}

async function ensureKnowledgeDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function collectFiles(dir: string, relativeTo: string): Promise<Array<{ abs: string; rel: string }>> {
  var results: Array<{ abs: string; rel: string }> = [];

  async function walk(current: string) {
    try {
      var entries = await fs.readdir(current, { withFileTypes: true });
      for (var entry of entries) {
        if (entry.name.startsWith('.')) continue;
        var full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          var ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            results.push({ abs: full, rel: path.relative(relativeTo, full) });
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  await walk(dir);
  return results;
}

function extractSnippets(content: string, query: string, maxSnippets: number): string[] {
  var lower = content.toLowerCase();
  var queryLower = query.toLowerCase();
  var snippets: string[] = [];
  var startPos = 0;

  while (snippets.length < maxSnippets) {
    var idx = lower.indexOf(queryLower, startPos);
    if (idx === -1) break;
    var snippetStart = Math.max(0, idx - SNIPPET_CONTEXT_CHARS);
    var snippetEnd = Math.min(content.length, idx + query.length + SNIPPET_CONTEXT_CHARS);
    var snippet = content.slice(snippetStart, snippetEnd).replace(/\n/g, ' ');
    if (snippetStart > 0) snippet = '...' + snippet;
    if (snippetEnd < content.length) snippet = snippet + '...';
    snippets.push(snippet);
    startPos = idx + query.length;
  }

  return snippets;
}

export function createEnterpriseKnowledgeSearchTools(options?: ToolCreationOptions): AnyAgentTool[] {
  var knowledgeDir = resolveKnowledgeDir(options);

  return [
    {
      name: 'ent_kb_search',
      label: 'Search Knowledge Base',
      description: 'Recursively search all files in the knowledge base for a query string (case-insensitive). Returns matching files with context snippets around matches.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string.' },
          space: { type: 'string', description: 'Optional space (subdirectory) to limit search to.' },
          limit: { type: 'number', description: 'Maximum number of matching files to return (default 10).' },
        },
        required: ['query'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var query = readStringParam(params, 'query', { required: true });
        var space = readStringParam(params, 'space');
        var limit = readNumberParam(params, 'limit', { integer: true }) ?? DEFAULT_SEARCH_LIMIT;

        await ensureKnowledgeDir(knowledgeDir);
        var searchDir = space ? path.join(knowledgeDir, space) : knowledgeDir;

        try {
          await fs.access(searchDir);
        } catch {
          return errorResult('Knowledge directory not found: ' + (space || knowledgeDir));
        }

        var files = await collectFiles(searchDir, knowledgeDir);
        var matches: Array<{ path: string; snippets: string[]; matchCount: number }> = [];

        for (var file of files) {
          if (matches.length >= limit) break;
          try {
            var content = await fs.readFile(file.abs, 'utf-8');
            var queryLower = query.toLowerCase();
            var contentLower = content.toLowerCase();
            var count = 0;
            var pos = 0;
            while ((pos = contentLower.indexOf(queryLower, pos)) !== -1) {
              count++;
              pos += queryLower.length;
            }
            if (count > 0) {
              var snippets = extractSnippets(content, query, 3);
              matches.push({ path: file.rel, snippets: snippets, matchCount: count });
            }
          } catch { /* skip unreadable files */ }
        }

        matches.sort(function(a, b) { return b.matchCount - a.matchCount; });

        if (matches.length === 0) {
          return textResult('No matches found for "' + query + '" in knowledge base.');
        }

        return jsonResult({ query: query, totalMatches: matches.length, results: matches });
      },
    },

    {
      name: 'ent_kb_get_document',
      label: 'Get Knowledge Document',
      description: 'Read a specific document from the knowledge base by path (relative to the knowledge directory). Returns full content with metadata.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Document path relative to the knowledge directory.' },
        },
        required: ['path'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var docPath = readStringParam(params, 'path', { required: true });

        await ensureKnowledgeDir(knowledgeDir);
        var fullPath = path.resolve(knowledgeDir, docPath);

        // Prevent path traversal
        if (!fullPath.startsWith(knowledgeDir)) {
          return errorResult('Access denied: path is outside the knowledge directory.');
        }

        try {
          var stat = await fs.stat(fullPath);
          var content = await fs.readFile(fullPath, 'utf-8');
          return jsonResult({
            path: docPath,
            content: content,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            created: stat.birthtime.toISOString(),
            lines: content.split('\n').length,
          });
        } catch {
          return errorResult('Document not found: ' + docPath);
        }
      },
    },

    {
      name: 'ent_kb_list_spaces',
      label: 'List Knowledge Spaces',
      description: 'List all spaces (subdirectories) in the knowledge base. Returns name, file count, and total size for each.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async function(_toolCallId, _args) {
        await ensureKnowledgeDir(knowledgeDir);

        try {
          var entries = await fs.readdir(knowledgeDir, { withFileTypes: true });
          var spaces: Array<{ name: string; fileCount: number; totalSize: number }> = [];

          for (var entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
            var spaceDir = path.join(knowledgeDir, entry.name);
            var files = await collectFiles(spaceDir, spaceDir);
            var totalSize = 0;
            for (var file of files) {
              try {
                var stat = await fs.stat(file.abs);
                totalSize += stat.size;
              } catch { /* skip */ }
            }
            spaces.push({ name: entry.name, fileCount: files.length, totalSize: totalSize });
          }

          if (spaces.length === 0) {
            return textResult('No knowledge spaces found. Create subdirectories in ' + knowledgeDir + ' to add spaces.');
          }

          return jsonResult({ knowledgeDir: knowledgeDir, spaces: spaces });
        } catch (err: any) {
          return errorResult('Failed to list spaces: ' + (err.message || 'unknown error'));
        }
      },
    },

    {
      name: 'ent_kb_recent_updates',
      label: 'Recent Knowledge Updates',
      description: 'List recently modified files across all knowledge spaces, sorted by modification time (newest first).',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look back (default 7).' },
          limit: { type: 'number', description: 'Maximum number of files to return (default 20).' },
        },
        required: [],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var days = readNumberParam(params, 'days', { integer: true }) ?? DEFAULT_RECENT_DAYS;
        var limit = readNumberParam(params, 'limit', { integer: true }) ?? DEFAULT_RECENT_LIMIT;

        await ensureKnowledgeDir(knowledgeDir);
        var cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        var files = await collectFiles(knowledgeDir, knowledgeDir);
        var recent: Array<{ path: string; modified: string; size: number }> = [];

        for (var file of files) {
          try {
            var stat = await fs.stat(file.abs);
            if (stat.mtimeMs >= cutoff) {
              recent.push({ path: file.rel, modified: stat.mtime.toISOString(), size: stat.size });
            }
          } catch { /* skip */ }
        }

        recent.sort(function(a, b) { return new Date(b.modified).getTime() - new Date(a.modified).getTime(); });
        var limited = recent.slice(0, limit);

        if (limited.length === 0) {
          return textResult('No files updated in the last ' + days + ' day(s).');
        }

        return jsonResult({ days: days, total: recent.length, showing: limited.length, files: limited });
      },
    },

    {
      name: 'ent_kb_ask',
      label: 'Ask Knowledge Base',
      description: 'Search the knowledge base for a question, then return the top matching snippets formatted as context for answering. Combines results into a single context block.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Question or search query.' },
          space: { type: 'string', description: 'Optional space to limit search to.' },
          limit: { type: 'number', description: 'Maximum number of source documents (default 5).' },
        },
        required: ['query'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var query = readStringParam(params, 'query', { required: true });
        var space = readStringParam(params, 'space');
        var limit = readNumberParam(params, 'limit', { integer: true }) ?? 5;

        await ensureKnowledgeDir(knowledgeDir);
        var searchDir = space ? path.join(knowledgeDir, space) : knowledgeDir;

        try {
          await fs.access(searchDir);
        } catch {
          return errorResult('Knowledge directory not found: ' + (space || knowledgeDir));
        }

        var files = await collectFiles(searchDir, knowledgeDir);
        var scored: Array<{ path: string; score: number; snippets: string[] }> = [];

        for (var file of files) {
          try {
            var content = await fs.readFile(file.abs, 'utf-8');
            var queryLower = query.toLowerCase();
            var contentLower = content.toLowerCase();
            var words = queryLower.split(/\s+/).filter(function(w) { return w.length > 2; });
            var score = 0;

            // Exact phrase match scores highest
            if (contentLower.indexOf(queryLower) !== -1) {
              score += 20;
            }

            // Individual word matches
            for (var word of words) {
              var wordPos = 0;
              while ((wordPos = contentLower.indexOf(word, wordPos)) !== -1) {
                score += 1;
                wordPos += word.length;
              }
            }

            // Title/filename match bonus
            var fileName = path.basename(file.rel).toLowerCase();
            if (fileName.indexOf(queryLower) !== -1) score += 15;
            for (var word of words) {
              if (fileName.indexOf(word) !== -1) score += 5;
            }

            if (score > 0) {
              var snippets = extractSnippets(content, query, 3);
              if (snippets.length === 0 && words.length > 0) {
                // Try individual word snippets if exact phrase not found
                for (var word of words) {
                  if (snippets.length >= 3) break;
                  var wordSnippets = extractSnippets(content, word, 1);
                  snippets = snippets.concat(wordSnippets);
                }
              }
              scored.push({ path: file.rel, score: score, snippets: snippets });
            }
          } catch { /* skip */ }
        }

        scored.sort(function(a, b) { return b.score - a.score; });
        var topResults = scored.slice(0, limit);

        if (topResults.length === 0) {
          return textResult('No relevant documents found for: "' + query + '"');
        }

        var contextParts: string[] = [];
        contextParts.push('Knowledge base context for: "' + query + '"\n');
        for (var i = 0; i < topResults.length; i++) {
          var result = topResults[i];
          contextParts.push('--- Source: ' + result.path + ' (relevance: ' + result.score + ') ---');
          for (var snippet of result.snippets) {
            contextParts.push(snippet);
          }
          contextParts.push('');
        }

        return textResult(contextParts.join('\n'));
      },
    },
  ];
}
