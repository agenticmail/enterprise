/**
 * AgenticMail Agent Tools — Enterprise Spreadsheet
 *
 * CSV/TSV spreadsheet tools for AI agents.
 * Read, write, filter, aggregate, transform, merge, pivot,
 * and convert tabular data using built-in Node.js APIs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';

// --- CSV Parsing / Formatting Helpers ---

function parseCSV(content: string, delimiter?: string): { headers: string[]; rows: Record<string, string>[] } {
  var sep = delimiter || ',';
  var lines = content.split(/\r?\n/).filter(function(line) { return line.trim() !== ''; });
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line: string): string[] {
    var fields: string[] = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === sep) {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }

  var headers = parseLine(lines[0]).map(function(h) { return h.trim(); });
  var rows: Record<string, string>[] = [];
  for (var i = 1; i < lines.length; i++) {
    var fields = parseLine(lines[i]);
    var row: Record<string, string> = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = j < fields.length ? fields[j] : '';
    }
    rows.push(row);
  }
  return { headers: headers, rows: rows };
}

function formatCSV(rows: Record<string, string>[], headers: string[], delimiter?: string): string {
  var sep = delimiter || ',';

  function escapeField(value: string): string {
    if (value.indexOf(sep) >= 0 || value.indexOf('"') >= 0 || value.indexOf('\n') >= 0) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  var lines = [headers.map(escapeField).join(sep)];
  for (var row of rows) {
    var fields = headers.map(function(h) { return escapeField(row[h] ?? ''); });
    lines.push(fields.join(sep));
  }
  return lines.join('\n') + '\n';
}

function detectDelimiter(filePath: string): string {
  var ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsv' || ext === '.tab') return '\t';
  return ',';
}

async function readSpreadsheet(filePath: string, workspaceDir?: string): Promise<{ headers: string[]; rows: Record<string, string>[]; resolvedPath: string }> {
  var resolvedPath = filePath;
  if (!path.isAbsolute(resolvedPath) && workspaceDir) {
    resolvedPath = path.resolve(workspaceDir, resolvedPath);
  }
  var content = await fs.readFile(resolvedPath, 'utf-8');
  var delimiter = detectDelimiter(resolvedPath);
  var result = parseCSV(content, delimiter);
  return { headers: result.headers, rows: result.rows, resolvedPath: resolvedPath };
}

export function createSpreadsheetTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entSheetRead: AnyAgentTool = {
    name: 'ent_sheet_read',
    label: 'Read Spreadsheet',
    description: 'Read a CSV or TSV file and return its contents as a JSON table with headers and rows. Supports offset and limit for large files.',
    category: 'file',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the CSV/TSV file.' },
        offset: { type: 'number', description: 'Row offset to start from (0-based, default 0).' },
        limit: { type: 'number', description: 'Maximum number of rows to return (default 100).' },
      },
      required: ['file_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var offset = readNumberParam(params, 'offset', { integer: true }) ?? 0;
      var limit = readNumberParam(params, 'limit', { integer: true }) ?? 100;

      try {
        var data = await readSpreadsheet(filePath, options?.workspaceDir);
        var sliced = data.rows.slice(offset, offset + limit);
        return jsonResult({
          file: data.resolvedPath,
          headers: data.headers,
          rows: sliced,
          totalRows: data.rows.length,
          showing: sliced.length,
          offset: offset,
        });
      } catch (err: any) {
        return errorResult('Failed to read spreadsheet: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetWrite: AnyAgentTool = {
    name: 'ent_sheet_write',
    label: 'Write Spreadsheet',
    description: 'Write rows to a CSV or TSV file. Creates or overwrites the file. Accepts an array of row objects and optional headers.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to write the CSV/TSV file.' },
        rows: { type: 'string', description: 'JSON array of row objects to write.' },
        headers: { type: 'string', description: 'Comma-separated list of column headers (optional, inferred from first row if omitted).' },
      },
      required: ['file_path', 'rows'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var rowsRaw = readStringParam(params, 'rows', { required: true, trim: false });
      var headersStr = readStringParam(params, 'headers');

      if (!path.isAbsolute(filePath) && options?.workspaceDir) {
        filePath = path.resolve(options.workspaceDir, filePath);
      }

      try {
        var rows: Record<string, string>[];
        try {
          rows = JSON.parse(rowsRaw);
        } catch {
          return errorResult('Invalid JSON for rows parameter. Expected an array of objects.');
        }

        if (!Array.isArray(rows) || rows.length === 0) {
          return errorResult('Rows must be a non-empty JSON array of objects.');
        }

        var headers: string[];
        if (headersStr) {
          headers = headersStr.split(',').map(function(h) { return h.trim(); });
        } else {
          headers = Object.keys(rows[0]);
        }

        var delimiter = detectDelimiter(filePath);
        var content = formatCSV(rows, headers, delimiter);
        var dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
        return textResult('Wrote ' + rows.length + ' rows (' + headers.length + ' columns) to ' + filePath);
      } catch (err: any) {
        return errorResult('Failed to write spreadsheet: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetFilter: AnyAgentTool = {
    name: 'ent_sheet_filter',
    label: 'Filter Spreadsheet',
    description: 'Filter rows in a CSV/TSV file by a column condition. Supports operators: equals, contains, gt, lt, gte, lte, regex, not_equals.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the CSV/TSV file.' },
        column: { type: 'string', description: 'Column name to filter on.' },
        operator: { type: 'string', description: 'Comparison operator.', enum: ['equals', 'not_equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'regex'] },
        value: { type: 'string', description: 'Value to compare against.' },
        limit: { type: 'number', description: 'Maximum matching rows to return (default 100).' },
      },
      required: ['file_path', 'column', 'operator', 'value'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var column = readStringParam(params, 'column', { required: true });
      var operator = readStringParam(params, 'operator', { required: true });
      var value = readStringParam(params, 'value', { required: true, allowEmpty: true });
      var limit = readNumberParam(params, 'limit', { integer: true }) ?? 100;

      try {
        var data = await readSpreadsheet(filePath, options?.workspaceDir);
        if (data.headers.indexOf(column) === -1) {
          return errorResult('Column not found: ' + column + '. Available: ' + data.headers.join(', '));
        }

        var matched = data.rows.filter(function(row) {
          var cellValue = row[column] ?? '';
          var numCell = parseFloat(cellValue);
          var numValue = parseFloat(value);

          switch (operator) {
            case 'equals': return cellValue === value;
            case 'not_equals': return cellValue !== value;
            case 'contains': return cellValue.toLowerCase().indexOf(value.toLowerCase()) >= 0;
            case 'gt': return !isNaN(numCell) && !isNaN(numValue) && numCell > numValue;
            case 'lt': return !isNaN(numCell) && !isNaN(numValue) && numCell < numValue;
            case 'gte': return !isNaN(numCell) && !isNaN(numValue) && numCell >= numValue;
            case 'lte': return !isNaN(numCell) && !isNaN(numValue) && numCell <= numValue;
            case 'regex': {
              try { return new RegExp(value, 'i').test(cellValue); } catch { return false; }
            }
            default: return false;
          }
        });

        var limited = matched.slice(0, limit);
        return jsonResult({
          headers: data.headers,
          rows: limited,
          matchedCount: matched.length,
          showing: limited.length,
          totalRows: data.rows.length,
        });
      } catch (err: any) {
        return errorResult('Filter failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetAggregate: AnyAgentTool = {
    name: 'ent_sheet_aggregate',
    label: 'Aggregate Spreadsheet',
    description: 'Compute aggregations on a CSV/TSV column: sum, avg, min, max, count, count_distinct. Optionally group by another column.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the CSV/TSV file.' },
        column: { type: 'string', description: 'Column to aggregate.' },
        operation: { type: 'string', description: 'Aggregation operation.', enum: ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'] },
        group_by: { type: 'string', description: 'Optional column to group by.' },
      },
      required: ['file_path', 'column', 'operation'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var column = readStringParam(params, 'column', { required: true });
      var operation = readStringParam(params, 'operation', { required: true });
      var groupBy = readStringParam(params, 'group_by');

      try {
        var data = await readSpreadsheet(filePath, options?.workspaceDir);
        if (data.headers.indexOf(column) === -1) {
          return errorResult('Column not found: ' + column + '. Available: ' + data.headers.join(', '));
        }
        if (groupBy && data.headers.indexOf(groupBy) === -1) {
          return errorResult('Group-by column not found: ' + groupBy + '. Available: ' + data.headers.join(', '));
        }

        function aggregate(rows: Record<string, string>[], col: string, op: string): number | string {
          var values = rows.map(function(r) { return r[col] ?? ''; });
          var numericValues = values.map(parseFloat).filter(function(n) { return !isNaN(n); });

          switch (op) {
            case 'sum': return numericValues.reduce(function(a, b) { return a + b; }, 0);
            case 'avg': return numericValues.length > 0
              ? Math.round((numericValues.reduce(function(a, b) { return a + b; }, 0) / numericValues.length) * 10000) / 10000
              : 0;
            case 'min': return numericValues.length > 0 ? Math.min.apply(null, numericValues) : 0;
            case 'max': return numericValues.length > 0 ? Math.max.apply(null, numericValues) : 0;
            case 'count': return values.length;
            case 'count_distinct': {
              var unique = new Set(values);
              return unique.size;
            }
            default: return 0;
          }
        }

        if (!groupBy) {
          var result = aggregate(data.rows, column, operation);
          return jsonResult({ column: column, operation: operation, result: result, rowCount: data.rows.length });
        }

        // Group by
        var groups: Record<string, Record<string, string>[]> = {};
        for (var row of data.rows) {
          var key = row[groupBy] ?? '(empty)';
          if (!groups[key]) groups[key] = [];
          groups[key].push(row);
        }

        var groupResults: Array<{ group: string; result: number | string; count: number }> = [];
        for (var groupKey of Object.keys(groups)) {
          groupResults.push({
            group: groupKey,
            result: aggregate(groups[groupKey], column, operation),
            count: groups[groupKey].length,
          });
        }

        return jsonResult({ column: column, operation: operation, groupBy: groupBy, groups: groupResults });
      } catch (err: any) {
        return errorResult('Aggregation failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetTransform: AnyAgentTool = {
    name: 'ent_sheet_transform',
    label: 'Transform Spreadsheet',
    description: 'Transform a CSV/TSV file: sort by column, rename columns, or add a computed column. Returns the transformed data.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the CSV/TSV file.' },
        action: { type: 'string', description: 'Transform action.', enum: ['sort', 'rename', 'add_column'] },
        sort_column: { type: 'string', description: 'Column to sort by (for sort action).' },
        sort_order: { type: 'string', description: 'Sort order: asc or desc (default asc).', enum: ['asc', 'desc'] },
        rename_from: { type: 'string', description: 'Original column name (for rename action).' },
        rename_to: { type: 'string', description: 'New column name (for rename action).' },
        new_column: { type: 'string', description: 'New column name (for add_column action).' },
        expression: { type: 'string', description: 'Expression for computed column: "concat:col1,col2,separator" or "math:col1+col2" or "upper:col" or "lower:col".' },
        output_path: { type: 'string', description: 'Optional file path to write the transformed result.' },
      },
      required: ['file_path', 'action'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var action = readStringParam(params, 'action', { required: true });
      var outputPath = readStringParam(params, 'output_path');

      try {
        var data = await readSpreadsheet(filePath, options?.workspaceDir);
        var headers = data.headers.slice();
        var rows = data.rows.map(function(r) { return Object.assign({}, r); });

        switch (action) {
          case 'sort': {
            var sortColumn = readStringParam(params, 'sort_column', { required: true });
            var sortOrder = readStringParam(params, 'sort_order') || 'asc';
            if (headers.indexOf(sortColumn) === -1) {
              return errorResult('Sort column not found: ' + sortColumn);
            }
            rows.sort(function(a, b) {
              var va = a[sortColumn] ?? '';
              var vb = b[sortColumn] ?? '';
              var na = parseFloat(va);
              var nb = parseFloat(vb);
              var cmp: number;
              if (!isNaN(na) && !isNaN(nb)) {
                cmp = na - nb;
              } else {
                cmp = va.localeCompare(vb);
              }
              return sortOrder === 'desc' ? -cmp : cmp;
            });
            break;
          }
          case 'rename': {
            var renameFrom = readStringParam(params, 'rename_from', { required: true });
            var renameTo = readStringParam(params, 'rename_to', { required: true });
            var idx = headers.indexOf(renameFrom);
            if (idx === -1) return errorResult('Column not found: ' + renameFrom);
            headers[idx] = renameTo;
            for (var row of rows) {
              row[renameTo] = row[renameFrom];
              if (renameFrom !== renameTo) delete row[renameFrom];
            }
            break;
          }
          case 'add_column': {
            var newColumn = readStringParam(params, 'new_column', { required: true });
            var expression = readStringParam(params, 'expression', { required: true });
            headers.push(newColumn);

            for (var row of rows) {
              if (expression.startsWith('concat:')) {
                var parts = expression.slice(7).split(',');
                var sep = parts.length > 2 ? parts[parts.length - 1] : ' ';
                var cols = parts.length > 2 ? parts.slice(0, -1) : parts;
                row[newColumn] = cols.map(function(c) { return row[c.trim()] ?? ''; }).join(sep);
              } else if (expression.startsWith('math:')) {
                var expr = expression.slice(5);
                // Simple two-operand math: col1+col2, col1-col2, col1*col2, col1/col2
                var mathMatch = expr.match(/^(\w+)\s*([+\-*/])\s*(\w+)$/);
                if (mathMatch) {
                  var va = parseFloat(row[mathMatch[1]] ?? '0');
                  var vb = parseFloat(row[mathMatch[3]] ?? '0');
                  var result: number;
                  switch (mathMatch[2]) {
                    case '+': result = va + vb; break;
                    case '-': result = va - vb; break;
                    case '*': result = va * vb; break;
                    case '/': result = vb !== 0 ? va / vb : 0; break;
                    default: result = 0;
                  }
                  row[newColumn] = String(result);
                } else {
                  row[newColumn] = '';
                }
              } else if (expression.startsWith('upper:')) {
                var col = expression.slice(6).trim();
                row[newColumn] = (row[col] ?? '').toUpperCase();
              } else if (expression.startsWith('lower:')) {
                var col = expression.slice(6).trim();
                row[newColumn] = (row[col] ?? '').toLowerCase();
              } else {
                row[newColumn] = expression; // literal value
              }
            }
            break;
          }
          default:
            return errorResult('Unknown transform action: ' + action);
        }

        // Write output if requested
        if (outputPath) {
          var outPath = outputPath;
          if (!path.isAbsolute(outPath) && options?.workspaceDir) {
            outPath = path.resolve(options.workspaceDir, outPath);
          }
          var delimiter = detectDelimiter(outPath);
          var content = formatCSV(rows, headers, delimiter);
          var dir = path.dirname(outPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(outPath, content, 'utf-8');
          return textResult('Transformed ' + rows.length + ' rows, wrote to ' + outPath);
        }

        return jsonResult({ headers: headers, rows: rows.slice(0, 100), totalRows: rows.length });
      } catch (err: any) {
        return errorResult('Transform failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetMerge: AnyAgentTool = {
    name: 'ent_sheet_merge',
    label: 'Merge Spreadsheets',
    description: 'Join two CSV/TSV files on a shared column. Supports inner, left, right, and full joins.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        left_file: { type: 'string', description: 'Path to the left CSV/TSV file.' },
        right_file: { type: 'string', description: 'Path to the right CSV/TSV file.' },
        join_column: { type: 'string', description: 'Column name to join on (must exist in both files).' },
        join_type: { type: 'string', description: 'Join type.', enum: ['inner', 'left', 'right', 'full'] },
        output_path: { type: 'string', description: 'Optional file path to write the merged result.' },
      },
      required: ['left_file', 'right_file', 'join_column'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var leftFile = readStringParam(params, 'left_file', { required: true });
      var rightFile = readStringParam(params, 'right_file', { required: true });
      var joinColumn = readStringParam(params, 'join_column', { required: true });
      var joinType = readStringParam(params, 'join_type') || 'inner';
      var outputPath = readStringParam(params, 'output_path');

      try {
        var leftData = await readSpreadsheet(leftFile, options?.workspaceDir);
        var rightData = await readSpreadsheet(rightFile, options?.workspaceDir);

        if (leftData.headers.indexOf(joinColumn) === -1) {
          return errorResult('Join column "' + joinColumn + '" not found in left file. Available: ' + leftData.headers.join(', '));
        }
        if (rightData.headers.indexOf(joinColumn) === -1) {
          return errorResult('Join column "' + joinColumn + '" not found in right file. Available: ' + rightData.headers.join(', '));
        }

        // Build right index
        var rightIndex: Record<string, Record<string, string>[]> = {};
        for (var rRow of rightData.rows) {
          var key = rRow[joinColumn] ?? '';
          if (!rightIndex[key]) rightIndex[key] = [];
          rightIndex[key].push(rRow);
        }

        // Compute merged headers (prefix duplicates with file indicator)
        var rightOnlyHeaders = rightData.headers.filter(function(h) { return h !== joinColumn; });
        var mergedHeaders = leftData.headers.slice();
        for (var rh of rightOnlyHeaders) {
          if (mergedHeaders.indexOf(rh) >= 0) {
            mergedHeaders.push(rh + '_right');
          } else {
            mergedHeaders.push(rh);
          }
        }

        var resultRows: Record<string, string>[] = [];
        var rightMatched = new Set<string>();

        // Process left rows
        for (var lRow of leftData.rows) {
          var lKey = lRow[joinColumn] ?? '';
          var rightMatches = rightIndex[lKey];

          if (rightMatches && rightMatches.length > 0) {
            rightMatched.add(lKey);
            for (var rMatch of rightMatches) {
              var merged: Record<string, string> = Object.assign({}, lRow);
              for (var ri = 0; ri < rightOnlyHeaders.length; ri++) {
                var rHeader = rightOnlyHeaders[ri];
                var mergedKey = mergedHeaders[leftData.headers.length + ri];
                merged[mergedKey] = rMatch[rHeader] ?? '';
              }
              resultRows.push(merged);
            }
          } else if (joinType === 'left' || joinType === 'full') {
            var merged: Record<string, string> = Object.assign({}, lRow);
            for (var ri = 0; ri < rightOnlyHeaders.length; ri++) {
              var mergedKey = mergedHeaders[leftData.headers.length + ri];
              merged[mergedKey] = '';
            }
            resultRows.push(merged);
          }
        }

        // Process unmatched right rows for right/full joins
        if (joinType === 'right' || joinType === 'full') {
          for (var rRow of rightData.rows) {
            var rKey = rRow[joinColumn] ?? '';
            if (!rightMatched.has(rKey)) {
              var merged: Record<string, string> = {};
              for (var lh of leftData.headers) {
                merged[lh] = lh === joinColumn ? rKey : '';
              }
              for (var ri = 0; ri < rightOnlyHeaders.length; ri++) {
                var rHeader = rightOnlyHeaders[ri];
                var mergedKey = mergedHeaders[leftData.headers.length + ri];
                merged[mergedKey] = rRow[rHeader] ?? '';
              }
              resultRows.push(merged);
            }
          }
        }

        if (outputPath) {
          var outPath = outputPath;
          if (!path.isAbsolute(outPath) && options?.workspaceDir) {
            outPath = path.resolve(options.workspaceDir, outPath);
          }
          var delimiter = detectDelimiter(outPath);
          var content = formatCSV(resultRows, mergedHeaders, delimiter);
          var dir = path.dirname(outPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(outPath, content, 'utf-8');
          return textResult('Merged ' + resultRows.length + ' rows (' + joinType + ' join), wrote to ' + outPath);
        }

        return jsonResult({
          headers: mergedHeaders,
          rows: resultRows.slice(0, 100),
          totalRows: resultRows.length,
          joinType: joinType,
        });
      } catch (err: any) {
        return errorResult('Merge failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetPivot: AnyAgentTool = {
    name: 'ent_sheet_pivot',
    label: 'Pivot Table',
    description: 'Create a pivot table from a CSV/TSV file. Group by one column, aggregate values from another column, and optionally spread by a third column.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the CSV/TSV file.' },
        row_column: { type: 'string', description: 'Column to use as row grouping.' },
        value_column: { type: 'string', description: 'Column to aggregate values from.' },
        operation: { type: 'string', description: 'Aggregation operation.', enum: ['sum', 'avg', 'count', 'min', 'max'] },
        spread_column: { type: 'string', description: 'Optional column to spread values across (creates one output column per unique value).' },
      },
      required: ['file_path', 'row_column', 'value_column', 'operation'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var rowColumn = readStringParam(params, 'row_column', { required: true });
      var valueColumn = readStringParam(params, 'value_column', { required: true });
      var operation = readStringParam(params, 'operation', { required: true });
      var spreadColumn = readStringParam(params, 'spread_column');

      try {
        var data = await readSpreadsheet(filePath, options?.workspaceDir);
        for (var requiredCol of [rowColumn, valueColumn]) {
          if (data.headers.indexOf(requiredCol) === -1) {
            return errorResult('Column not found: ' + requiredCol + '. Available: ' + data.headers.join(', '));
          }
        }
        if (spreadColumn && data.headers.indexOf(spreadColumn) === -1) {
          return errorResult('Spread column not found: ' + spreadColumn);
        }

        function computeAgg(values: number[], op: string): number {
          if (values.length === 0) return 0;
          switch (op) {
            case 'sum': return values.reduce(function(a, b) { return a + b; }, 0);
            case 'avg': return Math.round((values.reduce(function(a, b) { return a + b; }, 0) / values.length) * 10000) / 10000;
            case 'count': return values.length;
            case 'min': return Math.min.apply(null, values);
            case 'max': return Math.max.apply(null, values);
            default: return 0;
          }
        }

        if (!spreadColumn) {
          // Simple pivot: group by row_column, aggregate value_column
          var groups: Record<string, number[]> = {};
          for (var row of data.rows) {
            var groupKey = row[rowColumn] ?? '(empty)';
            if (!groups[groupKey]) groups[groupKey] = [];
            var num = parseFloat(row[valueColumn] ?? '');
            if (!isNaN(num)) groups[groupKey].push(num);
            else if (operation === 'count') groups[groupKey].push(1);
          }

          var pivotRows: Record<string, string>[] = [];
          for (var gk of Object.keys(groups)) {
            var obj: Record<string, string> = {};
            obj[rowColumn] = gk;
            obj[operation + '_' + valueColumn] = String(computeAgg(groups[gk], operation));
            pivotRows.push(obj);
          }
          var pivotHeaders = [rowColumn, operation + '_' + valueColumn];
          return jsonResult({ headers: pivotHeaders, rows: pivotRows, count: pivotRows.length });
        }

        // Spread pivot: group by row_column, spread by spread_column
        var spreadValues = new Set<string>();
        var matrix: Record<string, Record<string, number[]>> = {};

        for (var row of data.rows) {
          var rKey = row[rowColumn] ?? '(empty)';
          var sKey = row[spreadColumn] ?? '(empty)';
          spreadValues.add(sKey);
          if (!matrix[rKey]) matrix[rKey] = {};
          if (!matrix[rKey][sKey]) matrix[rKey][sKey] = [];
          var num = parseFloat(row[valueColumn] ?? '');
          if (!isNaN(num)) matrix[rKey][sKey].push(num);
          else if (operation === 'count') matrix[rKey][sKey].push(1);
        }

        var spreadCols = Array.from(spreadValues).sort();
        var pivotHeaders = [rowColumn].concat(spreadCols);
        var pivotRows: Record<string, string>[] = [];

        for (var rKey of Object.keys(matrix)) {
          var obj: Record<string, string> = {};
          obj[rowColumn] = rKey;
          for (var sc of spreadCols) {
            obj[sc] = String(computeAgg(matrix[rKey][sc] || [], operation));
          }
          pivotRows.push(obj);
        }

        return jsonResult({ headers: pivotHeaders, rows: pivotRows, count: pivotRows.length });
      } catch (err: any) {
        return errorResult('Pivot failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSheetConvert: AnyAgentTool = {
    name: 'ent_sheet_convert',
    label: 'Convert Spreadsheet Format',
    description: 'Convert between tabular data formats: CSV, TSV, JSON, and NDJSON (newline-delimited JSON).',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        input_path: { type: 'string', description: 'Path to the input file.' },
        output_path: { type: 'string', description: 'Path to write the output file.' },
        input_format: { type: 'string', description: 'Input format.', enum: ['csv', 'tsv', 'json', 'ndjson'] },
        output_format: { type: 'string', description: 'Output format.', enum: ['csv', 'tsv', 'json', 'ndjson'] },
      },
      required: ['input_path', 'output_path', 'output_format'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var inputPath = readStringParam(params, 'input_path', { required: true });
      var outputPath = readStringParam(params, 'output_path', { required: true });
      var inputFormat = readStringParam(params, 'input_format');
      var outputFormat = readStringParam(params, 'output_format', { required: true });

      if (!path.isAbsolute(inputPath) && options?.workspaceDir) {
        inputPath = path.resolve(options.workspaceDir, inputPath);
      }
      if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      try {
        var content = await fs.readFile(inputPath, 'utf-8');
        var headers: string[];
        var rows: Record<string, string>[];

        // Detect input format
        var format = inputFormat;
        if (!format) {
          var ext = path.extname(inputPath).toLowerCase();
          if (ext === '.tsv' || ext === '.tab') format = 'tsv';
          else if (ext === '.json') format = 'json';
          else if (ext === '.ndjson' || ext === '.jsonl') format = 'ndjson';
          else format = 'csv';
        }

        // Parse input
        if (format === 'csv') {
          var parsed = parseCSV(content, ',');
          headers = parsed.headers;
          rows = parsed.rows;
        } else if (format === 'tsv') {
          var parsed = parseCSV(content, '\t');
          headers = parsed.headers;
          rows = parsed.rows;
        } else if (format === 'json') {
          var jsonData = JSON.parse(content);
          if (!Array.isArray(jsonData)) {
            return errorResult('JSON input must be an array of objects.');
          }
          headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
          rows = jsonData.map(function(item: any) {
            var row: Record<string, string> = {};
            for (var h of headers) {
              row[h] = item[h] != null ? String(item[h]) : '';
            }
            return row;
          });
        } else if (format === 'ndjson') {
          var lines = content.split(/\r?\n/).filter(function(l) { return l.trim() !== ''; });
          var jsonRows = lines.map(function(l) { return JSON.parse(l); });
          headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
          rows = jsonRows.map(function(item: any) {
            var row: Record<string, string> = {};
            for (var h of headers) {
              row[h] = item[h] != null ? String(item[h]) : '';
            }
            return row;
          });
        } else {
          return errorResult('Unsupported input format: ' + format);
        }

        // Format output
        var output: string;
        if (outputFormat === 'csv') {
          output = formatCSV(rows, headers, ',');
        } else if (outputFormat === 'tsv') {
          output = formatCSV(rows, headers, '\t');
        } else if (outputFormat === 'json') {
          var jsonOutput = rows.map(function(row) {
            var obj: Record<string, string> = {};
            for (var h of headers) { obj[h] = row[h] ?? ''; }
            return obj;
          });
          output = JSON.stringify(jsonOutput, null, 2) + '\n';
        } else if (outputFormat === 'ndjson') {
          output = rows.map(function(row) {
            var obj: Record<string, string> = {};
            for (var h of headers) { obj[h] = row[h] ?? ''; }
            return JSON.stringify(obj);
          }).join('\n') + '\n';
        } else {
          return errorResult('Unsupported output format: ' + outputFormat);
        }

        var dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(outputPath, output, 'utf-8');
        return textResult('Converted ' + rows.length + ' rows from ' + format + ' to ' + outputFormat + '. Wrote to ' + outputPath);
      } catch (err: any) {
        return errorResult('Conversion failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entSheetRead, entSheetWrite, entSheetFilter, entSheetAggregate, entSheetTransform, entSheetMerge, entSheetPivot, entSheetConvert];
}
