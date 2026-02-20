/**
 * AgenticMail Agent Tools — Enterprise Code Sandbox
 *
 * Sandboxed code execution tools for JavaScript (Node.js vm module),
 * Python (child_process), shell scripts, JSON transformation, and regex.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { execFile, exec } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';

function promiseExecFile(cmd: string, args: string[], opts: Record<string, unknown>): Promise<{ stdout: string; stderr: string }> {
  return new Promise(function(resolve, reject) {
    execFile(cmd, args, opts as any, function(err, stdout, stderr) {
      if (err) {
        var result = { stdout: String(stdout || ''), stderr: String(stderr || '') };
        if ((err as any).killed) {
          reject(new Error('Process timed out'));
        } else {
          resolve(result);
        }
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function promiseExec(cmd: string, opts: Record<string, unknown>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(function(resolve) {
    exec(cmd, opts as any, function(err, stdout, stderr) {
      var exitCode = err ? (err as any).code || 1 : 0;
      resolve({
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        exitCode: exitCode,
      });
    });
  });
}

export function createCodeSandboxTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entCodeRunJs: AnyAgentTool = {
    name: 'ent_code_run_js',
    label: 'Run JavaScript',
    description: 'Run JavaScript code in a sandboxed Node.js VM context. No file system, network, or process access. console.log output is captured. Returns stdout and the expression result.',
    category: 'command',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute.' },
        timeout_ms: { type: 'number', description: 'Execution timeout in milliseconds (default 5000, max 30000).', default: 5000 },
      },
      required: ['code'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var code = readStringParam(params, 'code', { required: true, trim: false });
      var timeoutMs = readNumberParam(params, 'timeout_ms', { integer: true }) ?? 5000;
      if (timeoutMs > 30000) timeoutMs = 30000;
      if (timeoutMs < 100) timeoutMs = 100;

      try {
        var logs: string[] = [];
        var sandboxConsole = {
          log: function() {
            var parts: string[] = [];
            for (var i = 0; i < arguments.length; i++) {
              var arg = arguments[i];
              parts.push(typeof arg === 'string' ? arg : JSON.stringify(arg));
            }
            logs.push(parts.join(' '));
          },
          warn: function() {
            var parts: string[] = [];
            for (var i = 0; i < arguments.length; i++) {
              var arg = arguments[i];
              parts.push(typeof arg === 'string' ? arg : JSON.stringify(arg));
            }
            logs.push('[warn] ' + parts.join(' '));
          },
          error: function() {
            var parts: string[] = [];
            for (var i = 0; i < arguments.length; i++) {
              var arg = arguments[i];
              parts.push(typeof arg === 'string' ? arg : JSON.stringify(arg));
            }
            logs.push('[error] ' + parts.join(' '));
          },
        };

        var sandbox = {
          console: sandboxConsole,
          JSON: JSON,
          Math: Math,
          Date: Date,
          Array: Array,
          Object: Object,
          String: String,
          Number: Number,
          RegExp: RegExp,
          Map: Map,
          Set: Set,
          parseInt: parseInt,
          parseFloat: parseFloat,
          isNaN: isNaN,
          isFinite: isFinite,
          encodeURIComponent: encodeURIComponent,
          decodeURIComponent: decodeURIComponent,
          setTimeout: undefined,
          setInterval: undefined,
          require: undefined,
          process: undefined,
          global: undefined,
        };

        var context = vm.createContext(sandbox);
        var result = vm.runInContext(code, context, { timeout: timeoutMs, filename: 'sandbox.js' });

        var output: Record<string, unknown> = {};
        if (logs.length > 0) {
          output.stdout = logs.join('\n');
        }
        if (result !== undefined) {
          try {
            output.result = typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : result;
          } catch {
            output.result = String(result);
          }
        }

        return jsonResult(output);
      } catch (err: any) {
        var message = err.message || String(err);
        if (message.includes('Script execution timed out')) {
          return errorResult('Execution timed out after ' + timeoutMs + 'ms.');
        }
        return errorResult('JavaScript execution failed: ' + message);
      }
    },
  };

  var entCodeRunPython: AnyAgentTool = {
    name: 'ent_code_run_python',
    label: 'Run Python',
    description: 'Run Python code via the system python3 interpreter. Code is written to a temp file and executed. Returns stdout and stderr.',
    category: 'command',
    risk: 'high',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute.' },
        timeout_ms: { type: 'number', description: 'Execution timeout in milliseconds (default 10000, max 60000).', default: 10000 },
      },
      required: ['code'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var code = readStringParam(params, 'code', { required: true, trim: false });
      var timeoutMs = readNumberParam(params, 'timeout_ms', { integer: true }) ?? 10000;
      if (timeoutMs > 60000) timeoutMs = 60000;
      if (timeoutMs < 500) timeoutMs = 500;

      var tmpFile = path.join(os.tmpdir(), 'agenticmail-py-' + crypto.randomBytes(6).toString('hex') + '.py');

      try {
        await fs.writeFile(tmpFile, code, 'utf-8');

        var result = await promiseExecFile('python3', [tmpFile], {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          cwd: options?.workspaceDir || os.tmpdir(),
        });

        var output: Record<string, unknown> = {};
        if (result.stdout) output.stdout = result.stdout;
        if (result.stderr) output.stderr = result.stderr;

        return jsonResult(output);
      } catch (err: any) {
        return errorResult('Python execution failed: ' + (err.message || String(err)));
      } finally {
        try { await fs.unlink(tmpFile); } catch { /* ignore cleanup errors */ }
      }
    },
  };

  var entCodeRunShell: AnyAgentTool = {
    name: 'ent_code_run_shell',
    label: 'Run Shell Script',
    description: 'Run a multi-line shell (bash) script via child_process. Returns stdout, stderr, and exit code.',
    category: 'command',
    risk: 'critical',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Shell script to execute.' },
        timeout_ms: { type: 'number', description: 'Execution timeout in milliseconds (default 10000, max 60000).', default: 10000 },
      },
      required: ['script'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var script = readStringParam(params, 'script', { required: true, trim: false });
      var timeoutMs = readNumberParam(params, 'timeout_ms', { integer: true }) ?? 10000;
      if (timeoutMs > 60000) timeoutMs = 60000;
      if (timeoutMs < 500) timeoutMs = 500;

      try {
        var result = await promiseExec(script, {
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
          shell: '/bin/bash',
          cwd: options?.workspaceDir || os.tmpdir(),
        });

        return jsonResult({
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode,
        });
      } catch (err: any) {
        return errorResult('Shell execution failed: ' + (err.message || String(err)));
      }
    },
  };

  var entCodeTransformJson: AnyAgentTool = {
    name: 'ent_code_transform_json',
    label: 'Transform JSON',
    description: 'Transform JSON data using a JavaScript expression evaluated in a sandboxed VM. The input JSON is available as the `data` variable. Example expressions: data.filter(x => x.age > 18), Object.keys(data), data.map(x => x.name).',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'JSON string or file path (prefixed with "file:") containing the input data.' },
        expression: { type: 'string', description: 'JavaScript expression to evaluate. The input is available as `data`.' },
        output_path: { type: 'string', description: 'Optional file path to write the result as JSON.' },
      },
      required: ['input', 'expression'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var input = readStringParam(params, 'input', { required: true, trim: false });
      var expression = readStringParam(params, 'expression', { required: true });
      var outputPath = readStringParam(params, 'output_path');

      try {
        var jsonStr: string;
        if (input.startsWith('file:')) {
          var filePath = input.slice(5).trim();
          if (!path.isAbsolute(filePath) && options?.workspaceDir) {
            filePath = path.resolve(options.workspaceDir, filePath);
          }
          jsonStr = await fs.readFile(filePath, 'utf-8');
        } else {
          jsonStr = input;
        }

        var data = JSON.parse(jsonStr);
        var sandbox = {
          data: data,
          JSON: JSON,
          Math: Math,
          Object: Object,
          Array: Array,
          String: String,
          Number: Number,
          parseInt: parseInt,
          parseFloat: parseFloat,
          isNaN: isNaN,
        };

        var context = vm.createContext(sandbox);
        var result = vm.runInContext(expression, context, { timeout: 5000, filename: 'transform.js' });

        if (outputPath) {
          if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
            outputPath = path.resolve(options.workspaceDir, outputPath);
          }
          await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
          return jsonResult({ result: result, writtenTo: outputPath });
        }

        return jsonResult({ result: result });
      } catch (err: any) {
        return errorResult('JSON transform failed: ' + (err.message || String(err)));
      }
    },
  };

  var entCodeRegex: AnyAgentTool = {
    name: 'ent_code_regex',
    label: 'Regex Operations',
    description: 'Test and apply regular expressions. Supports test, match, replace, and split operations. Returns matches with captured groups, or the transformed text.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression pattern (without delimiters).' },
        input: { type: 'string', description: 'Input string to apply the regex on.' },
        flags: { type: 'string', description: 'Regex flags (default "g"). Common: g (global), i (case-insensitive), m (multiline).' },
        operation: { type: 'string', description: 'Operation: test, match, replace, split (default match).', enum: ['test', 'match', 'replace', 'split'] },
        replacement: { type: 'string', description: 'Replacement string for the "replace" operation. Supports $1, $2 group references.' },
      },
      required: ['pattern', 'input'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var pattern = readStringParam(params, 'pattern', { required: true });
      var input = readStringParam(params, 'input', { required: true, trim: false });
      var flags = readStringParam(params, 'flags') || 'g';
      var operation = readStringParam(params, 'operation') || 'match';
      var replacement = readStringParam(params, 'replacement', { trim: false });

      try {
        var regex = new RegExp(pattern, flags);

        if (operation === 'test') {
          var testResult = regex.test(input);
          return jsonResult({ pattern: pattern, flags: flags, result: testResult });
        }

        if (operation === 'match') {
          var matches: Array<{ match: string; index: number; groups: Record<string, string> | null }> = [];
          var execMatch: RegExpExecArray | null;

          if (flags.indexOf('g') !== -1) {
            while ((execMatch = regex.exec(input)) !== null) {
              matches.push({
                match: execMatch[0],
                index: execMatch.index,
                groups: execMatch.groups || null,
              });
            }
          } else {
            execMatch = regex.exec(input);
            if (execMatch) {
              matches.push({
                match: execMatch[0],
                index: execMatch.index,
                groups: execMatch.groups || null,
              });
            }
          }

          return jsonResult({
            pattern: pattern,
            flags: flags,
            matchCount: matches.length,
            matches: matches,
          });
        }

        if (operation === 'replace') {
          if (replacement === undefined) {
            return errorResult('Replacement string is required for the "replace" operation.');
          }
          var replaced = input.replace(regex, replacement);
          return jsonResult({
            pattern: pattern,
            flags: flags,
            original: input,
            result: replaced,
          });
        }

        if (operation === 'split') {
          var parts = input.split(regex);
          return jsonResult({
            pattern: pattern,
            flags: flags,
            parts: parts,
            count: parts.length,
          });
        }

        return errorResult('Unknown operation: ' + operation + '. Use test, match, replace, or split.');
      } catch (err: any) {
        return errorResult('Regex operation failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entCodeRunJs, entCodeRunPython, entCodeRunShell, entCodeTransformJson, entCodeRegex];
}
