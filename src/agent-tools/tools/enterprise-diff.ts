/**
 * AgenticMail Agent Tools — Enterprise Diff
 *
 * Pure Node.js diff algorithms for comparing text, JSON, and CSV data.
 * Implements LCS-based line diff, deep JSON comparison, CSV row matching,
 * and human-readable diff summaries.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readStringArrayParam, jsonResult, textResult, errorResult } from '../common.js';

type DiffHunk = { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] };
type JsonDiffEntry = { path: string; type: 'added' | 'removed' | 'changed'; oldValue?: unknown; newValue?: unknown };

/** Compute longest common subsequence table */
function lcsTable(a: string[], b: string[]): number[][] {
  var m = a.length;
  var n = b.length;
  var dp: number[][] = [];
  for (var i = 0; i <= m; i++) {
    dp[i] = [];
    for (var j = 0; j <= n; j++) {
      dp[i][j] = 0;
    }
  }
  for (var i = 1; i <= m; i++) {
    for (var j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/** Backtrack LCS table to produce edit operations */
function computeEditOps(a: string[], b: string[], dp: number[][]): Array<{ type: 'equal' | 'add' | 'remove'; oldIdx: number; newIdx: number; line: string }> {
  var ops: Array<{ type: 'equal' | 'add' | 'remove'; oldIdx: number; newIdx: number; line: string }> = [];
  var i = a.length;
  var j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', oldIdx: i - 1, newIdx: j - 1, line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', oldIdx: -1, newIdx: j - 1, line: b[j - 1] });
      j--;
    } else {
      ops.push({ type: 'remove', oldIdx: i - 1, newIdx: -1, line: a[i - 1] });
      i--;
    }
  }

  ops.reverse();
  return ops;
}

/** Group edit operations into diff hunks with context */
function buildHunks(ops: Array<{ type: 'equal' | 'add' | 'remove'; oldIdx: number; newIdx: number; line: string }>, contextLines: number): DiffHunk[] {
  var hunks: DiffHunk[] = [];
  var changeIndices: number[] = [];

  for (var idx = 0; idx < ops.length; idx++) {
    if (ops[idx].type !== 'equal') {
      changeIndices.push(idx);
    }
  }

  if (changeIndices.length === 0) return [];

  // Group adjacent changes
  var groups: Array<{ start: number; end: number }> = [];
  var gStart = changeIndices[0];
  var gEnd = changeIndices[0];

  for (var ci = 1; ci < changeIndices.length; ci++) {
    if (changeIndices[ci] - gEnd <= contextLines * 2 + 1) {
      gEnd = changeIndices[ci];
    } else {
      groups.push({ start: gStart, end: gEnd });
      gStart = changeIndices[ci];
      gEnd = changeIndices[ci];
    }
  }
  groups.push({ start: gStart, end: gEnd });

  for (var g of groups) {
    var hunkStart = Math.max(0, g.start - contextLines);
    var hunkEnd = Math.min(ops.length - 1, g.end + contextLines);

    var lines: string[] = [];
    var oldStart = -1;
    var newStart = -1;
    var oldCount = 0;
    var newCount = 0;

    for (var hi = hunkStart; hi <= hunkEnd; hi++) {
      var op = ops[hi];
      if (op.type === 'equal') {
        lines.push(' ' + op.line);
        if (oldStart === -1) oldStart = op.oldIdx;
        if (newStart === -1) newStart = op.newIdx;
        oldCount++;
        newCount++;
      } else if (op.type === 'remove') {
        lines.push('-' + op.line);
        if (oldStart === -1) oldStart = op.oldIdx;
        if (newStart === -1) {
          // Find next equal or add op for newStart
          for (var look = hi + 1; look <= hunkEnd; look++) {
            if (ops[look].newIdx >= 0) { newStart = ops[look].newIdx; break; }
          }
          if (newStart === -1) newStart = 0;
        }
        oldCount++;
      } else {
        lines.push('+' + op.line);
        if (newStart === -1) newStart = op.newIdx;
        if (oldStart === -1) {
          for (var look = hi + 1; look <= hunkEnd; look++) {
            if (ops[look].oldIdx >= 0) { oldStart = ops[look].oldIdx; break; }
          }
          if (oldStart === -1) oldStart = 0;
        }
        newCount++;
      }
    }

    hunks.push({
      oldStart: (oldStart >= 0 ? oldStart : 0) + 1,
      oldCount: oldCount,
      newStart: (newStart >= 0 ? newStart : 0) + 1,
      newCount: newCount,
      lines: lines,
    });
  }

  return hunks;
}

function formatUnifiedDiff(hunks: DiffHunk[]): string {
  var output: string[] = [];
  for (var hunk of hunks) {
    output.push('@@ -' + hunk.oldStart + ',' + hunk.oldCount + ' +' + hunk.newStart + ',' + hunk.newCount + ' @@');
    for (var line of hunk.lines) {
      output.push(line);
    }
  }
  return output.join('\n');
}

/** Deep diff two JSON values, returning path-based change entries */
function deepDiff(a: unknown, b: unknown, currentPath: string, ignoreKeys: Set<string>): JsonDiffEntry[] {
  var entries: JsonDiffEntry[] = [];

  if (a === b) return entries;
  if (a === null || b === null || typeof a !== typeof b) {
    entries.push({ path: currentPath || '(root)', type: 'changed', oldValue: a, newValue: b });
    return entries;
  }
  if (typeof a !== 'object') {
    entries.push({ path: currentPath || '(root)', type: 'changed', oldValue: a, newValue: b });
    return entries;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    var maxLen = Math.max(a.length, b.length);
    for (var i = 0; i < maxLen; i++) {
      var itemPath = currentPath ? currentPath + '[' + i + ']' : '[' + i + ']';
      if (i >= a.length) {
        entries.push({ path: itemPath, type: 'added', newValue: b[i] });
      } else if (i >= b.length) {
        entries.push({ path: itemPath, type: 'removed', oldValue: a[i] });
      } else {
        entries = entries.concat(deepDiff(a[i], b[i], itemPath, ignoreKeys));
      }
    }
    return entries;
  }

  var aObj = a as Record<string, unknown>;
  var bObj = b as Record<string, unknown>;
  var allKeys = new Set(Object.keys(aObj).concat(Object.keys(bObj)));

  for (var key of allKeys) {
    if (ignoreKeys.has(key)) continue;
    var keyPath = currentPath ? currentPath + '.' + key : key;
    if (!(key in aObj)) {
      entries.push({ path: keyPath, type: 'added', newValue: bObj[key] });
    } else if (!(key in bObj)) {
      entries.push({ path: keyPath, type: 'removed', oldValue: aObj[key] });
    } else {
      entries = entries.concat(deepDiff(aObj[key], bObj[key], keyPath, ignoreKeys));
    }
  }

  return entries;
}

function parseCSV(text: string): string[][] {
  var rows: string[][] = [];
  var lines = text.split('\n');
  for (var line of lines) {
    var trimmed = line.trim();
    if (!trimmed) continue;
    // Simple CSV parse — handles quoted fields with commas
    var fields: string[] = [];
    var current = '';
    var inQuote = false;
    for (var ch = 0; ch < trimmed.length; ch++) {
      var c = trimmed[ch];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        fields.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

async function resolveTextInput(value: string | undefined, fileValue: string | undefined, workspaceDir?: string): Promise<string | null> {
  if (value) return value;
  if (fileValue) {
    var filePath = fileValue;
    if (!path.isAbsolute(filePath) && workspaceDir) {
      filePath = path.resolve(workspaceDir, filePath);
    }
    return await fs.readFile(filePath, 'utf-8');
  }
  return null;
}

export function createDiffTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entDiffText: AnyAgentTool = {
    name: 'ent_diff_text',
    label: 'Text Diff',
    description: 'Compute a line-by-line diff between two texts or files using an LCS-based algorithm. Output in unified diff format with +/- prefixes and @@ hunk headers. Returns diff string with stats.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        old_text: { type: 'string', description: 'Original text content.' },
        new_text: { type: 'string', description: 'New text content.' },
        old_file: { type: 'string', description: 'Path to original file (alternative to old_text).' },
        new_file: { type: 'string', description: 'Path to new file (alternative to new_text).' },
        context_lines: { type: 'number', description: 'Number of context lines around changes (default 3).' },
      },
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var oldText = readStringParam(params, 'old_text', { trim: false });
      var newText = readStringParam(params, 'new_text', { trim: false });
      var oldFile = readStringParam(params, 'old_file');
      var newFile = readStringParam(params, 'new_file');
      var contextLines = readNumberParam(params, 'context_lines', { integer: true }) ?? 3;

      try {
        var oldContent = await resolveTextInput(oldText, oldFile, options?.workspaceDir);
        var newContent = await resolveTextInput(newText, newFile, options?.workspaceDir);

        if (oldContent === null || newContent === null) {
          return errorResult('Provide either old_text/new_text or old_file/new_file pairs.');
        }

        var oldLines = oldContent.split('\n');
        var newLines = newContent.split('\n');

        var dp = lcsTable(oldLines, newLines);
        var editOps = computeEditOps(oldLines, newLines, dp);
        var hunks = buildHunks(editOps, contextLines);

        var added = editOps.filter(function(op) { return op.type === 'add'; }).length;
        var removed = editOps.filter(function(op) { return op.type === 'remove'; }).length;

        if (hunks.length === 0) {
          return textResult('No differences found.');
        }

        var diffStr = formatUnifiedDiff(hunks);

        return jsonResult({
          linesAdded: added,
          linesRemoved: removed,
          hunks: hunks.length,
          diff: diffStr,
        });
      } catch (err: any) {
        return errorResult('Diff failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDiffJson: AnyAgentTool = {
    name: 'ent_diff_json',
    label: 'JSON Diff',
    description: 'Deep diff two JSON objects. Recursively compares and reports added keys, removed keys, and changed values with their full paths. Supports ignoring specific keys.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        old_json: { type: 'string', description: 'Original JSON string or file path (prefix with "file:").' },
        new_json: { type: 'string', description: 'New JSON string or file path (prefix with "file:").' },
        ignore_keys: { type: 'string', description: 'Comma-separated list of keys to ignore during comparison.' },
      },
      required: ['old_json', 'new_json'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var oldJsonRaw = readStringParam(params, 'old_json', { required: true, trim: false });
      var newJsonRaw = readStringParam(params, 'new_json', { required: true, trim: false });
      var ignoreKeysRaw = readStringParam(params, 'ignore_keys');

      var ignoreKeys = new Set<string>();
      if (ignoreKeysRaw) {
        ignoreKeysRaw.split(',').forEach(function(k) { ignoreKeys.add(k.trim()); });
      }

      try {
        var oldStr = oldJsonRaw;
        if (oldStr.startsWith('file:')) {
          var fp = oldStr.slice(5).trim();
          if (!path.isAbsolute(fp) && options?.workspaceDir) fp = path.resolve(options.workspaceDir, fp);
          oldStr = await fs.readFile(fp, 'utf-8');
        }

        var newStr = newJsonRaw;
        if (newStr.startsWith('file:')) {
          var fp2 = newStr.slice(5).trim();
          if (!path.isAbsolute(fp2) && options?.workspaceDir) fp2 = path.resolve(options.workspaceDir, fp2);
          newStr = await fs.readFile(fp2, 'utf-8');
        }

        var oldObj = JSON.parse(oldStr);
        var newObj = JSON.parse(newStr);
        var diffs = deepDiff(oldObj, newObj, '', ignoreKeys);

        if (diffs.length === 0) {
          return textResult('No differences found between the two JSON objects.');
        }

        var added = diffs.filter(function(d) { return d.type === 'added'; }).length;
        var removed = diffs.filter(function(d) { return d.type === 'removed'; }).length;
        var changed = diffs.filter(function(d) { return d.type === 'changed'; }).length;

        return jsonResult({
          totalChanges: diffs.length,
          added: added,
          removed: removed,
          changed: changed,
          differences: diffs,
        });
      } catch (err: any) {
        return errorResult('JSON diff failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDiffSpreadsheet: AnyAgentTool = {
    name: 'ent_diff_spreadsheet',
    label: 'Spreadsheet Diff',
    description: 'Compare two CSV files by matching rows via a key column. Reports added rows, removed rows, and changed cells with row key, column name, and old/new values.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        old_file: { type: 'string', description: 'Path to the original CSV file.' },
        new_file: { type: 'string', description: 'Path to the new CSV file.' },
        key_column: { type: 'string', description: 'Column name (from header row) to use as the row identifier.' },
      },
      required: ['old_file', 'new_file', 'key_column'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var oldFile = readStringParam(params, 'old_file', { required: true });
      var newFile = readStringParam(params, 'new_file', { required: true });
      var keyColumn = readStringParam(params, 'key_column', { required: true });

      if (!path.isAbsolute(oldFile) && options?.workspaceDir) oldFile = path.resolve(options.workspaceDir, oldFile);
      if (!path.isAbsolute(newFile) && options?.workspaceDir) newFile = path.resolve(options.workspaceDir, newFile);

      try {
        var oldContent = await fs.readFile(oldFile, 'utf-8');
        var newContent = await fs.readFile(newFile, 'utf-8');

        var oldRows = parseCSV(oldContent);
        var newRows = parseCSV(newContent);

        if (oldRows.length < 1 || newRows.length < 1) {
          return errorResult('CSV files must have at least a header row.');
        }

        var oldHeaders = oldRows[0];
        var newHeaders = newRows[0];
        var keyIdx = oldHeaders.indexOf(keyColumn);
        var newKeyIdx = newHeaders.indexOf(keyColumn);

        if (keyIdx === -1) return errorResult('Key column "' + keyColumn + '" not found in old file headers.');
        if (newKeyIdx === -1) return errorResult('Key column "' + keyColumn + '" not found in new file headers.');

        // Build maps keyed by the key column value
        var oldMap: Map<string, Record<string, string>> = new Map();
        for (var oi = 1; oi < oldRows.length; oi++) {
          var row = oldRows[oi];
          var key = row[keyIdx] || '';
          var record: Record<string, string> = {};
          for (var ci = 0; ci < oldHeaders.length; ci++) {
            record[oldHeaders[ci]] = row[ci] || '';
          }
          oldMap.set(key, record);
        }

        var newMap: Map<string, Record<string, string>> = new Map();
        for (var ni = 1; ni < newRows.length; ni++) {
          var nrow = newRows[ni];
          var nkey = nrow[newKeyIdx] || '';
          var nrecord: Record<string, string> = {};
          for (var nci = 0; nci < newHeaders.length; nci++) {
            nrecord[newHeaders[nci]] = nrow[nci] || '';
          }
          newMap.set(nkey, nrecord);
        }

        var addedRows: string[] = [];
        var removedRows: string[] = [];
        var changedCells: Array<{ rowKey: string; column: string; oldValue: string; newValue: string }> = [];

        // Find removed rows and changed cells
        oldMap.forEach(function(oldRecord, key) {
          var newRecord = newMap.get(key);
          if (!newRecord) {
            removedRows.push(key);
            return;
          }
          for (var col of oldHeaders) {
            if (col === keyColumn) continue;
            var oldVal = oldRecord[col] || '';
            var newVal = newRecord[col] || '';
            if (oldVal !== newVal) {
              changedCells.push({ rowKey: key, column: col, oldValue: oldVal, newValue: newVal });
            }
          }
        });

        // Find added rows
        newMap.forEach(function(_newRecord, key) {
          if (!oldMap.has(key)) {
            addedRows.push(key);
          }
        });

        return jsonResult({
          keyColumn: keyColumn,
          addedRows: addedRows,
          removedRows: removedRows,
          changedCells: changedCells,
          summary: {
            rowsAdded: addedRows.length,
            rowsRemoved: removedRows.length,
            cellsChanged: changedCells.length,
          },
        });
      } catch (err: any) {
        return errorResult('Spreadsheet diff failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDiffSummary: AnyAgentTool = {
    name: 'ent_diff_summary',
    label: 'Diff Summary',
    description: 'Generate a human-readable summary of differences between two texts or files. Computes a line diff and produces a narrative overview with statistics.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        old_text: { type: 'string', description: 'Original text content.' },
        new_text: { type: 'string', description: 'New text content.' },
        old_file: { type: 'string', description: 'Path to original file (alternative to old_text).' },
        new_file: { type: 'string', description: 'Path to new file (alternative to new_text).' },
        format: { type: 'string', description: 'Output format: text, json, or csv (default text).', enum: ['text', 'json', 'csv'] },
      },
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var oldText = readStringParam(params, 'old_text', { trim: false });
      var newText = readStringParam(params, 'new_text', { trim: false });
      var oldFile = readStringParam(params, 'old_file');
      var newFile = readStringParam(params, 'new_file');
      var format = readStringParam(params, 'format') || 'text';

      try {
        var oldContent = await resolveTextInput(oldText, oldFile, options?.workspaceDir);
        var newContent = await resolveTextInput(newText, newFile, options?.workspaceDir);

        if (oldContent === null || newContent === null) {
          return errorResult('Provide either old_text/new_text or old_file/new_file pairs.');
        }

        var oldLines = oldContent.split('\n');
        var newLines = newContent.split('\n');

        var dp = lcsTable(oldLines, newLines);
        var editOps = computeEditOps(oldLines, newLines, dp);

        var added = editOps.filter(function(op) { return op.type === 'add'; }).length;
        var removed = editOps.filter(function(op) { return op.type === 'remove'; }).length;
        var unchanged = editOps.filter(function(op) { return op.type === 'equal'; }).length;
        var totalOld = oldLines.length;
        var totalNew = newLines.length;
        var changePercent = totalOld > 0 ? Math.round(((added + removed) / (totalOld + totalNew)) * 100) : 0;

        var summary = {
          linesAdded: added,
          linesRemoved: removed,
          linesUnchanged: unchanged,
          oldLineCount: totalOld,
          newLineCount: totalNew,
          changePercent: changePercent,
        };

        if (format === 'json') {
          return jsonResult(summary);
        }

        if (format === 'csv') {
          var csv = 'metric,value\n';
          csv += 'lines_added,' + added + '\n';
          csv += 'lines_removed,' + removed + '\n';
          csv += 'lines_unchanged,' + unchanged + '\n';
          csv += 'old_line_count,' + totalOld + '\n';
          csv += 'new_line_count,' + totalNew + '\n';
          csv += 'change_percent,' + changePercent + '\n';
          return textResult(csv);
        }

        // Default: text narrative
        var narrative = 'Diff Summary\n';
        narrative += '============\n\n';

        if (added === 0 && removed === 0) {
          narrative += 'No differences found. The two inputs are identical.\n';
        } else {
          narrative += added + ' line(s) added, ' + removed + ' line(s) removed, ' + unchanged + ' line(s) unchanged.\n';
          narrative += 'Old file: ' + totalOld + ' lines. New file: ' + totalNew + ' lines.\n';
          narrative += 'Approximately ' + changePercent + '% of content changed.\n';

          if (added > removed * 2) {
            narrative += '\nThe new version is significantly larger with substantial additions.';
          } else if (removed > added * 2) {
            narrative += '\nThe new version is significantly smaller with substantial removals.';
          } else if (added > 0 && removed > 0) {
            narrative += '\nBoth additions and removals were made, suggesting refactoring or rewriting.';
          }
        }

        return textResult(narrative);
      } catch (err: any) {
        return errorResult('Diff summary failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entDiffText, entDiffJson, entDiffSpreadsheet, entDiffSummary];
}
