/**
 * AgenticMail Agent Tools — Enterprise Log Analysis
 *
 * File-based log search, aggregation, tailing, correlation, and error extraction.
 * Uses fs.createReadStream + readline for efficient large file handling.
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';

var DEFAULT_SEARCH_LIMIT = 100;
var DEFAULT_TAIL_LINES = 50;
var DEFAULT_ERROR_LIMIT = 50;
var DEFAULT_CORRELATE_LIMIT = 50;
var ERROR_PATTERNS = /\b(ERROR|FATAL|CRITICAL|Exception|Traceback|panic|PANIC)\b/i;
var TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

// --- File collection ---

async function collectLogFiles(targetPath: string): Promise<string[]> {
  var results: string[] = [];

  try {
    var stat = await fsPromises.stat(targetPath);
    if (stat.isFile()) return [targetPath];
  } catch {
    return [];
  }

  async function walk(dir: string) {
    try {
      var entries = await fsPromises.readdir(dir, { withFileTypes: true });
      for (var entry of entries) {
        if (entry.name.startsWith('.')) continue;
        var full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          var ext = path.extname(entry.name).toLowerCase();
          if (ext === '.log' || ext === '.txt' || ext === '' || ext === '.json' || ext === '.out' || ext === '.err') {
            results.push(full);
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  await walk(targetPath);
  return results.sort();
}

// --- Line-by-line reader ---

async function readLines(
  filePath: string,
  callback: (line: string, lineNum: number, file: string) => boolean | void
): Promise<void> {
  return new Promise(function(resolve, reject) {
    var stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    var rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    var lineNum = 0;
    var stopped = false;

    rl.on('line', function(line) {
      lineNum++;
      if (stopped) return;
      var result = callback(line, lineNum, filePath);
      if (result === false) {
        stopped = true;
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', function() { resolve(); });
    rl.on('error', function(err) { reject(err); });
    stream.on('error', function(err) { reject(err); });
  });
}

// --- Timestamp parsing ---

function extractTimestamp(line: string): string | null {
  var match = line.match(TIMESTAMP_PATTERN);
  return match ? match[0] : null;
}

function isWithinTimeRange(timestamp: string | null, since?: string, until?: string): boolean {
  if (!timestamp) return true; // Include lines without timestamps
  if (since && timestamp < since) return false;
  if (until && timestamp > until) return false;
  return true;
}

// --- Resolve path ---

function resolvePath(targetPath: string, options?: ToolCreationOptions): string {
  if (path.isAbsolute(targetPath)) return targetPath;
  var workDir = options?.workspaceDir || process.cwd();
  return path.resolve(workDir, targetPath);
}

export function createEnterpriseLogTools(options?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'ent_log_search',
      label: 'Search Logs',
      description: 'Search log files for a pattern (string or regex). Supports time range filtering. Returns matching lines with file path and line number.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Log file or directory path.' },
          pattern: { type: 'string', description: 'Search pattern (string or regex).' },
          since: { type: 'string', description: 'Start time filter (ISO date, e.g. "2024-01-15T10:00:00").' },
          until: { type: 'string', description: 'End time filter (ISO date).' },
          limit: { type: 'number', description: 'Maximum matching lines to return (default 100).' },
        },
        required: ['path', 'pattern'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var targetPath = resolvePath(readStringParam(params, 'path', { required: true }), options);
        var pattern = readStringParam(params, 'pattern', { required: true });
        var since = readStringParam(params, 'since');
        var until = readStringParam(params, 'until');
        var limit = readNumberParam(params, 'limit', { integer: true }) ?? DEFAULT_SEARCH_LIMIT;

        var regex: RegExp;
        try {
          regex = new RegExp(pattern, 'i');
        } catch {
          // Treat as literal string if invalid regex
          regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }

        var files = await collectLogFiles(targetPath);
        if (files.length === 0) {
          return errorResult('No log files found at: ' + targetPath);
        }

        var matches: Array<{ file: string; line: number; text: string; timestamp: string | null }> = [];

        for (var file of files) {
          if (matches.length >= limit) break;
          try {
            await readLines(file, function(line, lineNum, filePath) {
              if (matches.length >= limit) return false;
              var timestamp = extractTimestamp(line);
              if (!isWithinTimeRange(timestamp, since, until)) return;
              if (regex.test(line)) {
                matches.push({
                  file: path.relative(resolvePath('.', options), filePath),
                  line: lineNum,
                  text: line.length > 500 ? line.slice(0, 500) + '...' : line,
                  timestamp: timestamp,
                });
              }
            });
          } catch { /* skip unreadable files */ }
        }

        if (matches.length === 0) {
          return textResult('No matches found for "' + pattern + '" in ' + files.length + ' file(s).');
        }

        return jsonResult({
          pattern: pattern,
          filesSearched: files.length,
          matchCount: matches.length,
          truncated: matches.length >= limit,
          matches: matches,
        });
      },
    },

    {
      name: 'ent_log_aggregate',
      label: 'Aggregate Logs',
      description: 'Count log entries grouped by a field (e.g. "level", "status_code", or a regex capture group). Returns sorted counts.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Log file or directory path.' },
          group_by: { type: 'string', description: 'Grouping field: "level", "status_code", or a regex with a capture group.' },
          since: { type: 'string', description: 'Start time filter (ISO date).' },
          until: { type: 'string', description: 'End time filter (ISO date).' },
        },
        required: ['path', 'group_by'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var targetPath = resolvePath(readStringParam(params, 'path', { required: true }), options);
        var groupBy = readStringParam(params, 'group_by', { required: true });
        var since = readStringParam(params, 'since');
        var until = readStringParam(params, 'until');

        var files = await collectLogFiles(targetPath);
        if (files.length === 0) {
          return errorResult('No log files found at: ' + targetPath);
        }

        // Build extraction function based on group_by
        var extractGroup: (line: string) => string | null;

        if (groupBy === 'level') {
          extractGroup = function(line) {
            var match = line.match(/\b(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRITICAL|TRACE)\b/i);
            return match ? match[1].toUpperCase() : null;
          };
        } else if (groupBy === 'status_code') {
          extractGroup = function(line) {
            var match = line.match(/\b(status|code|HTTP\/\d\.\d"?\s+)(\d{3})\b/i);
            return match ? match[2] : null;
          };
        } else {
          // Try as regex with capture group
          var customRegex: RegExp;
          try {
            customRegex = new RegExp(groupBy, 'i');
          } catch {
            return errorResult('Invalid regex for group_by: ' + groupBy);
          }
          extractGroup = function(line) {
            var match = line.match(customRegex);
            if (!match) return null;
            return match[1] || match[0]; // Prefer capture group, fall back to full match
          };
        }

        var counts: Record<string, number> = {};
        var totalLines = 0;

        for (var file of files) {
          try {
            await readLines(file, function(line, _lineNum, _filePath) {
              totalLines++;
              var timestamp = extractTimestamp(line);
              if (!isWithinTimeRange(timestamp, since, until)) return;
              var group = extractGroup(line);
              if (group) {
                counts[group] = (counts[group] || 0) + 1;
              }
            });
          } catch { /* skip */ }
        }

        // Sort by count descending
        var sorted = Object.entries(counts)
          .sort(function(a, b) { return b[1] - a[1]; })
          .map(function(entry) { return { group: entry[0], count: entry[1] }; });

        if (sorted.length === 0) {
          return textResult('No groups found for "' + groupBy + '" in ' + totalLines + ' lines.');
        }

        return jsonResult({
          groupBy: groupBy,
          filesSearched: files.length,
          totalLines: totalLines,
          groups: sorted,
        });
      },
    },

    {
      name: 'ent_log_tail',
      label: 'Tail Log File',
      description: 'Read the last N lines of a log file. Efficient for checking recent log entries.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the log file.' },
          lines: { type: 'number', description: 'Number of lines to read from the end (default 50).' },
        },
        required: ['path'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var targetPath = resolvePath(readStringParam(params, 'path', { required: true }), options);
        var numLines = readNumberParam(params, 'lines', { integer: true }) ?? DEFAULT_TAIL_LINES;

        try {
          var stat = await fsPromises.stat(targetPath);
          if (stat.isDirectory()) {
            return errorResult(targetPath + ' is a directory. Provide a specific log file path.');
          }
        } catch {
          return errorResult('File not found: ' + targetPath);
        }

        try {
          var content = await fsPromises.readFile(targetPath, 'utf-8');
          var allLines = content.split('\n');
          // Remove trailing empty line if present
          if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
            allLines.pop();
          }
          var startIdx = Math.max(0, allLines.length - numLines);
          var tailLines = allLines.slice(startIdx);

          var output = tailLines.map(function(line, i) {
            var lineNum = startIdx + i + 1;
            return lineNum + '\t' + line;
          }).join('\n');

          return textResult(
            'Last ' + tailLines.length + ' lines of ' + targetPath +
            ' (total: ' + allLines.length + ' lines)\n\n' + output
          );
        } catch (err: any) {
          return errorResult('Failed to read file: ' + (err.message || targetPath));
        }
      },
    },

    {
      name: 'ent_log_correlate',
      label: 'Correlate Log Entries',
      description: 'Find related log entries by correlation ID, request ID, or trace ID. Searches across all log files in a directory.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Log file or directory path.' },
          correlation_id: { type: 'string', description: 'Correlation ID, request ID, or trace ID to search for.' },
          limit: { type: 'number', description: 'Maximum entries to return (default 50).' },
        },
        required: ['path', 'correlation_id'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var targetPath = resolvePath(readStringParam(params, 'path', { required: true }), options);
        var correlationId = readStringParam(params, 'correlation_id', { required: true });
        var limit = readNumberParam(params, 'limit', { integer: true }) ?? DEFAULT_CORRELATE_LIMIT;

        var files = await collectLogFiles(targetPath);
        if (files.length === 0) {
          return errorResult('No log files found at: ' + targetPath);
        }

        // Escape special regex characters in the correlation ID
        var escapedId = correlationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp(escapedId, 'i');

        var entries: Array<{ file: string; line: number; text: string; timestamp: string | null }> = [];

        for (var file of files) {
          if (entries.length >= limit) break;
          try {
            await readLines(file, function(line, lineNum, filePath) {
              if (entries.length >= limit) return false;
              if (regex.test(line)) {
                entries.push({
                  file: path.relative(resolvePath('.', options), filePath),
                  line: lineNum,
                  text: line.length > 500 ? line.slice(0, 500) + '...' : line,
                  timestamp: extractTimestamp(line),
                });
              }
            });
          } catch { /* skip unreadable */ }
        }

        if (entries.length === 0) {
          return textResult('No log entries found for correlation ID: ' + correlationId);
        }

        // Sort by timestamp if available
        entries.sort(function(a, b) {
          if (a.timestamp && b.timestamp) return a.timestamp.localeCompare(b.timestamp);
          if (a.timestamp) return -1;
          if (b.timestamp) return 1;
          return 0;
        });

        return jsonResult({
          correlationId: correlationId,
          filesSearched: files.length,
          entryCount: entries.length,
          truncated: entries.length >= limit,
          entries: entries,
        });
      },
    },

    {
      name: 'ent_log_errors',
      label: 'Extract Log Errors',
      description: 'Extract error-level entries (ERROR, FATAL, CRITICAL, Exception, Traceback, panic) from logs with surrounding context lines.',
      category: 'search',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Log file or directory path.' },
          since: { type: 'string', description: 'Start time filter (ISO date, optional).' },
          limit: { type: 'number', description: 'Maximum error entries to return (default 50).' },
        },
        required: ['path'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var targetPath = resolvePath(readStringParam(params, 'path', { required: true }), options);
        var since = readStringParam(params, 'since');
        var limit = readNumberParam(params, 'limit', { integer: true }) ?? DEFAULT_ERROR_LIMIT;

        var files = await collectLogFiles(targetPath);
        if (files.length === 0) {
          return errorResult('No log files found at: ' + targetPath);
        }

        var errors: Array<{
          file: string;
          line: number;
          text: string;
          context: string[];
          timestamp: string | null;
        }> = [];

        for (var file of files) {
          if (errors.length >= limit) break;
          try {
            // Read file into line buffer for context extraction
            var content = await fsPromises.readFile(file, 'utf-8');
            var allLines = content.split('\n');

            for (var i = 0; i < allLines.length; i++) {
              if (errors.length >= limit) break;
              var line = allLines[i];
              if (!ERROR_PATTERNS.test(line)) continue;

              var timestamp = extractTimestamp(line);
              if (since && timestamp && timestamp < since) continue;

              // Gather context: 1 line before, 2 lines after
              var contextLines: string[] = [];
              if (i > 0) contextLines.push('[' + i + '] ' + allLines[i - 1]);
              contextLines.push('[' + (i + 1) + '] ' + line);
              if (i + 1 < allLines.length) contextLines.push('[' + (i + 2) + '] ' + allLines[i + 1]);
              if (i + 2 < allLines.length) contextLines.push('[' + (i + 3) + '] ' + allLines[i + 2]);

              errors.push({
                file: path.relative(resolvePath('.', options), file),
                line: i + 1,
                text: line.length > 500 ? line.slice(0, 500) + '...' : line,
                context: contextLines,
                timestamp: timestamp,
              });
            }
          } catch { /* skip unreadable */ }
        }

        if (errors.length === 0) {
          var msg = 'No error entries found in ' + files.length + ' file(s)';
          if (since) msg += ' since ' + since;
          return textResult(msg + '.');
        }

        return jsonResult({
          filesSearched: files.length,
          errorCount: errors.length,
          truncated: errors.length >= limit,
          errors: errors,
        });
      },
    },
  ];
}
