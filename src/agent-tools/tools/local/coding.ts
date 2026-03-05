/**
 * Coding Tools — Advanced development tools for AI agents.
 *
 * These go beyond basic file read/write/shell to provide the kind of
 * workflow a senior developer uses: plan before coding, search intelligently,
 * understand project structure, run builds with error parsing, manage git, etc.
 *
 * Designed to make agents BETTER at coding than raw shell + file tools alone.
 */

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import { join, relative, extname, dirname } from 'node:path';
import { resolvePath } from './resolve-path.js';
import type { ToolDefinition } from '../../types.js';

var execAsync = promisify(cpExec);

// ─── Helpers ────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function detectProjectRoot(startDir: string): Promise<string> {
  var dir = startDir;
  for (var i = 0; i < 10; i++) {
    for (var marker of ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', '.git']) {
      if (await exists(join(dir, marker))) return dir;
    }
    var parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

async function getProjectType(root: string): Promise<{ type: string; buildCmd?: string; testCmd?: string; lintCmd?: string }> {
  if (await exists(join(root, 'package.json'))) {
    try {
      var pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'));
      return {
        type: 'node',
        buildCmd: pkg.scripts?.build ? 'npm run build' : undefined,
        testCmd: pkg.scripts?.test ? 'npm test' : undefined,
        lintCmd: pkg.scripts?.lint ? 'npm run lint' : undefined,
      };
    } catch {}
  }
  if (await exists(join(root, 'Cargo.toml'))) return { type: 'rust', buildCmd: 'cargo build', testCmd: 'cargo test' };
  if (await exists(join(root, 'go.mod'))) return { type: 'go', buildCmd: 'go build ./...', testCmd: 'go test ./...' };
  if (await exists(join(root, 'pyproject.toml'))) return { type: 'python', testCmd: 'pytest' };
  return { type: 'unknown' };
}

function parseBuildErrors(output: string): { file?: string; line?: number; message: string }[] {
  var errors: { file?: string; line?: number; message: string }[] = [];
  // TypeScript / esbuild errors: src/foo.ts(10,5): error TS2345: ...
  // or src/foo.ts:10:5 - error TS2345: ...
  var tsPattern = /([^\s]+\.[tj]sx?)[:(](\d+)[,:](\d+)[):]?\s*[-–]?\s*(error\s+\w+:\s*.+)/gi;
  var m: RegExpExecArray | null;
  while ((m = tsPattern.exec(output))) {
    errors.push({ file: m[1], line: parseInt(m[2]), message: m[4] });
  }
  // Generic: ERROR in ./src/foo.ts
  var genericPattern = /(?:error|Error)[:\s]+(.+)/g;
  if (errors.length === 0) {
    while ((m = genericPattern.exec(output))) {
      if (!m[1].includes('node_modules')) errors.push({ message: m[1].trim() });
    }
  }
  // Rust: error[E0308]: mismatched types
  var rustPattern = /error\[(\w+)\]:\s*(.+)\n\s*-->\s*([^:]+):(\d+)/g;
  while ((m = rustPattern.exec(output))) {
    errors.push({ file: m[3], line: parseInt(m[4]), message: `${m[1]}: ${m[2]}` });
  }
  return errors.slice(0, 20); // Cap at 20 errors
}

// ─── Tools ──────────────────────────────────────────────

export function createCodingTools(opts?: { cwd?: string; sandbox?: string }): ToolDefinition[] {
  var defaultCwd = opts?.cwd || process.cwd();
  var sandbox = opts?.sandbox;

  return [

    // ─── 1. Code Plan ─────────────────────────────────

    {
      name: 'code_plan',
      description: 'Create a structured implementation plan before writing code. Analyzes the codebase, identifies files to change, and outputs a step-by-step plan. ALWAYS use this before multi-file changes.',
      input_schema: {
        type: 'object' as const,
        properties: {
          task: { type: 'string', description: 'What you need to implement' },
          cwd: { type: 'string', description: 'Project root directory' },
          context_files: {
            type: 'array', items: { type: 'string' },
            description: 'Key files to read for context before planning',
          },
        },
        required: ['task'],
      },
      execute: async (input: any) => {
        var cwd = input.cwd || defaultCwd;
        var root = await detectProjectRoot(cwd);
        var project = await getProjectType(root);

        // Read context files
        var contexts: { path: string; snippet: string }[] = [];
        if (input.context_files) {
          for (var f of input.context_files.slice(0, 10)) {
            try {
              var fp = resolvePath(f, sandbox);
              var content = await readFile(fp, 'utf-8');
              // Show first 200 lines
              var lines = content.split('\n');
              contexts.push({
                path: relative(root, fp),
                snippet: lines.slice(0, 200).join('\n') + (lines.length > 200 ? `\n[...${lines.length - 200} more lines]` : ''),
              });
            } catch {}
          }
        }

        // Get project structure (2 levels deep, skip node_modules etc.)
        var tree: string[] = [];
        async function walk(dir: string, depth: number, prefix: string) {
          if (depth > 2) return;
          try {
            var entries = await readdir(dir, { withFileTypes: true });
            var filtered = entries.filter(e =>
              !['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', '.cache', 'coverage'].includes(e.name)
              && !e.name.startsWith('.')
            ).sort((a, b) => {
              if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
            for (var e of filtered.slice(0, 50)) {
              tree.push(`${prefix}${e.isDirectory() ? '📁 ' : '  '}${e.name}`);
              if (e.isDirectory()) await walk(join(dir, e.name), depth + 1, prefix + '  ');
            }
          } catch {}
        }
        await walk(root, 0, '');

        return {
          projectRoot: root,
          projectType: project.type,
          buildCommand: project.buildCmd || 'unknown',
          testCommand: project.testCmd || 'unknown',
          structure: tree.join('\n'),
          contextFiles: contexts,
          instructions: [
            'Based on the project info above, create your plan:',
            '1. List ALL files you need to create or modify',
            '2. For each file, describe the specific changes',
            '3. Identify the order of changes (dependencies first)',
            '4. Note any imports/exports that need updating',
            '5. Plan your build + test verification step',
            `6. Build command: ${project.buildCmd || 'determine from project'}`,
          ].join('\n'),
        };
      },
    },

    // ─── 2. Code Search (ripgrep-powered) ─────────────

    {
      name: 'code_search',
      description: 'Search codebase for pattern matches. Uses ripgrep if available, falls back to grep. Returns matches with file, line number, and context.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex supported)' },
          path: { type: 'string', description: 'Directory or file to search (default: project root)' },
          file_pattern: { type: 'string', description: 'File glob filter (e.g. "*.ts", "*.py")' },
          context_lines: { type: 'number', description: 'Lines of context around matches (default 2)' },
          max_results: { type: 'number', description: 'Max matches (default 30)' },
          case_sensitive: { type: 'boolean', description: 'Case sensitive (default false)' },
          whole_word: { type: 'boolean', description: 'Match whole words only' },
          fixed_string: { type: 'boolean', description: 'Treat pattern as literal string, not regex' },
        },
        required: ['pattern'],
      },
      execute: async (input: any) => {
        var searchPath = resolvePath(input.path || defaultCwd, sandbox);
        var ctx = input.context_lines ?? 2;
        var max = input.max_results || 30;
        var flags: string[] = [];

        if (!input.case_sensitive) flags.push('-i');
        if (input.whole_word) flags.push('-w');
        if (input.fixed_string) flags.push('-F');

        // Try ripgrep first, fall back to grep
        var useRg = false;
        try { await execAsync('which rg'); useRg = true; } catch {}

        var cmd: string;
        if (useRg) {
          cmd = `rg --json -C ${ctx} -m ${max} ${flags.join(' ')}`;
          if (input.file_pattern) cmd += ` -g '${input.file_pattern}'`;
          cmd += ` -- '${input.pattern.replace(/'/g, "'\\''")}' '${searchPath}'`;
        } else {
          cmd = `grep -rn ${flags.join(' ')} -C ${ctx}`;
          if (input.file_pattern) cmd += ` --include='${input.file_pattern}'`;
          cmd += ` -- '${input.pattern.replace(/'/g, "'\\''")}' '${searchPath}'`;
          cmd += ` | head -${max * (ctx * 2 + 3)}`;
        }

        try {
          var { stdout, stderr } = await execAsync(cmd, {
            timeout: 15000, maxBuffer: 512 * 1024,
            cwd: searchPath,
          });

          if (useRg && stdout) {
            // Parse ripgrep JSON output
            var matches: { file: string; line: number; text: string; context?: string[] }[] = [];
            var _currentFile = '';
            var _contextBuf: string[] = [];
            for (var line of stdout.split('\n').filter(Boolean)) {
              try {
                var j = JSON.parse(line);
                if (j.type === 'match') {
                  matches.push({
                    file: relative(searchPath, j.data.path.text),
                    line: j.data.line_number,
                    text: j.data.lines.text.trimEnd(),
                  });
                }
              } catch {}
            }
            return { matches: matches.slice(0, max), total: matches.length, engine: 'ripgrep' };
          }

          return { output: stdout.slice(0, 50000), engine: 'grep' };
        } catch (err: any) {
          if (err.code === 1) return { matches: [], message: 'No matches found' };
          return { error: (err.stderr || err.message).slice(0, 5000) };
        }
      },
    },

    // ─── 3. Code Read (with line numbers + ranges) ────

    {
      name: 'code_read',
      description: 'Read a file with line numbers. Supports reading specific line ranges. Better than file_read for code — always shows line numbers.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' },
          from_line: { type: 'number', description: 'Start line (1-indexed, default 1)' },
          to_line: { type: 'number', description: 'End line (default: from_line + 200 or EOF)' },
          symbols: { type: 'boolean', description: 'Show only function/class/type definitions (outline mode)' },
        },
        required: ['path'],
      },
      execute: async (input: any) => {
        var fp = resolvePath(input.path, sandbox);
        var content = await readFile(fp, 'utf-8');
        var lines = content.split('\n');
        var totalLines = lines.length;

        if (input.symbols) {
          // Extract function/class/type definitions
          var ext = extname(fp).toLowerCase();
          var symbolPattern: RegExp;
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            symbolPattern = /^(?:export\s+)?(?:async\s+)?(?:function|class|type|interface|enum|const|var|let)\s+\w+|^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\w+\s*\(/;
          } else if (['.py'].includes(ext)) {
            symbolPattern = /^(?:class|def|async def)\s+\w+/;
          } else if (['.rs'].includes(ext)) {
            symbolPattern = /^(?:pub\s+)?(?:fn|struct|enum|trait|impl|type|const|static)\s+/;
          } else if (['.go'].includes(ext)) {
            symbolPattern = /^(?:func|type|var|const)\s+/;
          } else {
            symbolPattern = /^(?:function|class|def|fn|type|interface|struct|enum)\s+/;
          }

          var symbols: string[] = [];
          for (var i = 0; i < lines.length; i++) {
            if (symbolPattern.test(lines[i])) {
              symbols.push(`${String(i + 1).padStart(4)}│ ${lines[i]}`);
            }
          }
          return { path: fp, totalLines, symbols: symbols.join('\n') || 'No symbols found' };
        }

        var from = Math.max(1, input.from_line || 1);
        var to = Math.min(totalLines, input.to_line || from + 199);
        var slice = lines.slice(from - 1, to);
        var numbered = slice.map((l, i) => `${String(from + i).padStart(4)}│ ${l}`).join('\n');

        return {
          path: fp,
          totalLines,
          range: `${from}-${to}`,
          content: numbered,
          hasMore: to < totalLines,
        };
      },
    },

    // ─── 4. Code Multi-Edit (batch edits in one call) ─

    {
      name: 'code_multi_edit',
      description: 'Apply multiple edits to one or more files in a single call. More efficient than repeated file_edit calls. Edits are applied in order.',
      input_schema: {
        type: 'object' as const,
        properties: {
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                old_text: { type: 'string' },
                new_text: { type: 'string' },
              },
              required: ['path', 'old_text', 'new_text'],
            },
            description: 'Array of {path, old_text, new_text} edits',
          },
        },
        required: ['edits'],
      },
      execute: async (input: any) => {
        var results: { path: string; ok: boolean; error?: string }[] = [];
        // Group edits by file to avoid re-reading
        var byFile = new Map<string, { old_text: string; new_text: string }[]>();
        for (var edit of input.edits) {
          var fp = resolvePath(edit.path, sandbox);
          if (!byFile.has(fp)) byFile.set(fp, []);
          byFile.get(fp)!.push({ old_text: edit.old_text, new_text: edit.new_text });
        }

        for (var [filePath, edits] of byFile) {
          try {
            var content = await readFile(filePath, 'utf-8');
            for (var e of edits) {
              if (!content.includes(e.old_text)) {
                results.push({ path: filePath, ok: false, error: `old_text not found: "${e.old_text.slice(0, 60)}..."` });
                continue;
              }
              content = content.replace(e.old_text, e.new_text);
              results.push({ path: filePath, ok: true });
            }
            await writeFile(filePath, content, 'utf-8');
          } catch (err: any) {
            results.push({ path: filePath, ok: false, error: err.message });
          }
        }

        var success = results.filter(r => r.ok).length;
        var failed = results.filter(r => !r.ok);
        return { total: results.length, success, failed: failed.length > 0 ? failed : undefined };
      },
    },

    // ─── 5. Code Build (with error parsing) ───────────

    {
      name: 'code_build',
      description: 'Build the project and parse errors. Auto-detects build command from package.json/Cargo.toml/etc. Returns structured error list with file + line.',
      input_schema: {
        type: 'object' as const,
        properties: {
          cwd: { type: 'string', description: 'Project root (auto-detected if omitted)' },
          command: { type: 'string', description: 'Custom build command (overrides auto-detect)' },
          clean: { type: 'boolean', description: 'Clean dist/build before building' },
        },
        required: [],
      },
      execute: async (input: any) => {
        var cwd = input.cwd || defaultCwd;
        var root = await detectProjectRoot(cwd);
        var project = await getProjectType(root);
        var buildCmd = input.command || project.buildCmd;

        if (!buildCmd) return { error: `Cannot auto-detect build command for ${project.type} project. Specify command manually.` };

        // Optional clean step
        if (input.clean) {
          try {
            if (project.type === 'node') await execAsync('rm -rf dist build .next', { cwd: root });
            else if (project.type === 'rust') await execAsync('cargo clean', { cwd: root });
          } catch {}
        }

        var startTime = Date.now();
        try {
          var { stdout, stderr } = await execAsync(buildCmd, {
            cwd: root, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
          });
          var duration = Date.now() - startTime;
          return {
            ok: true,
            duration: `${duration}ms`,
            output: (stdout + '\n' + stderr).trim().slice(-5000),
          };
        } catch (err: any) {
          var duration = Date.now() - startTime;
          var output = ((err.stdout || '') + '\n' + (err.stderr || '')).trim();
          var errors = parseBuildErrors(output);
          return {
            ok: false,
            duration: `${duration}ms`,
            exitCode: err.code,
            errors: errors.length > 0 ? errors : undefined,
            output: output.slice(-10000),
          };
        }
      },
    },

    // ─── 6. Code Test ─────────────────────────────────

    {
      name: 'code_test',
      description: 'Run project tests and parse results. Auto-detects test framework.',
      input_schema: {
        type: 'object' as const,
        properties: {
          cwd: { type: 'string' },
          command: { type: 'string', description: 'Custom test command' },
          filter: { type: 'string', description: 'Test name/file filter pattern' },
          coverage: { type: 'boolean', description: 'Run with coverage' },
        },
        required: [],
      },
      execute: async (input: any) => {
        var cwd = input.cwd || defaultCwd;
        var root = await detectProjectRoot(cwd);
        var project = await getProjectType(root);
        var testCmd = input.command || project.testCmd;

        if (!testCmd) return { error: 'No test command found. Specify one manually.' };

        if (input.filter) {
          if (project.type === 'node') testCmd += ` -- --grep "${input.filter}"`;
          else if (project.type === 'rust') testCmd += ` ${input.filter}`;
          else if (project.type === 'python') testCmd += ` -k "${input.filter}"`;
        }
        if (input.coverage && project.type === 'node') testCmd += ' -- --coverage';

        try {
          var { stdout, stderr } = await execAsync(testCmd, {
            cwd: root, timeout: 300000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' },
          });
          return { ok: true, output: (stdout + '\n' + stderr).trim().slice(-10000) };
        } catch (err: any) {
          return {
            ok: false,
            exitCode: err.code,
            output: ((err.stdout || '') + '\n' + (err.stderr || '')).trim().slice(-10000),
          };
        }
      },
    },

    // ─── 7. Code Git ──────────────────────────────────

    {
      name: 'code_git',
      description: 'Git operations: status, diff, log, commit, push, branch, stash, blame.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'status|diff|log|commit|push|pull|branch|checkout|stash|blame|add' },
          args: { type: 'string', description: 'Additional arguments (e.g. file path for diff/blame, message for commit)' },
          cwd: { type: 'string' },
        },
        required: ['action'],
      },
      execute: async (input: any) => {
        var cwd = input.cwd || defaultCwd;
        var root = await detectProjectRoot(cwd);
        var args = input.args || '';

        var cmdMap: Record<string, string> = {
          status: 'git status --short',
          diff: `git diff ${args}`,
          log: `git log --oneline -20 ${args}`,
          commit: `git commit ${args.startsWith('-') ? args : `-m "${args.replace(/"/g, '\\"')}"`}`,
          push: `git push ${args}`,
          pull: `git pull ${args}`,
          branch: args ? `git checkout -b ${args}` : 'git branch -a',
          checkout: `git checkout ${args}`,
          stash: `git stash ${args || 'push'}`,
          blame: `git blame ${args}`,
          add: `git add ${args || '.'}`,
        };

        var cmd = cmdMap[input.action];
        if (!cmd) return { error: `Unknown action: ${input.action}. Use: ${Object.keys(cmdMap).join(', ')}` };

        try {
          var { stdout, stderr } = await execAsync(cmd, { cwd: root, timeout: 30000 });
          return { output: (stdout || stderr || '').trim().slice(0, 50000) };
        } catch (err: any) {
          return { error: (err.stderr || err.message).slice(0, 5000), exitCode: err.code };
        }
      },
    },

    // ─── 8. Code Create File (with directory creation) ─

    {
      name: 'code_create',
      description: 'Create a new file with content. Automatically creates parent directories. Better for new files than file_write.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          overwrite: { type: 'boolean', description: 'Overwrite if exists (default false)' },
        },
        required: ['path', 'content'],
      },
      execute: async (input: any) => {
        var fp = resolvePath(input.path, sandbox);
        if (!input.overwrite && await exists(fp)) {
          return { error: `File already exists: ${fp}. Set overwrite: true to replace.` };
        }
        var { mkdir } = await import('node:fs/promises');
        await mkdir(dirname(fp), { recursive: true });
        await writeFile(fp, input.content, 'utf-8');
        var lines = input.content.split('\n').length;
        return { ok: true, path: fp, lines };
      },
    },

    // ─── 9. Code Diff Preview ─────────────────────────

    {
      name: 'code_diff',
      description: 'Preview what a file edit would look like as a unified diff, without applying it. Use to verify changes before committing.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' },
          old_text: { type: 'string' },
          new_text: { type: 'string' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
      execute: async (input: any) => {
        var fp = resolvePath(input.path, sandbox);
        var content = await readFile(fp, 'utf-8');
        if (!content.includes(input.old_text)) {
          return { error: 'old_text not found in file' };
        }
        var newContent = content.replace(input.old_text, input.new_text);
        // Generate simple diff
        var oldLines = content.split('\n');
        var newLines = newContent.split('\n');
        var diff: string[] = [`--- ${input.path}`, `+++ ${input.path}`];
        // Find changed region
        var start = 0;
        while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
        var endOld = oldLines.length - 1;
        var endNew = newLines.length - 1;
        while (endOld > start && endNew > start && oldLines[endOld] === newLines[endNew]) { endOld--; endNew--; }
        diff.push(`@@ -${start + 1},${endOld - start + 1} +${start + 1},${endNew - start + 1} @@`);
        for (var i = start; i <= endOld; i++) diff.push(`-${oldLines[i]}`);
        for (var i = start; i <= endNew; i++) diff.push(`+${newLines[i]}`);
        return { diff: diff.join('\n') };
      },
    },

    // ─── 10. Process Manager ──────────────────────────

    {
      name: 'code_pm2',
      description: 'Manage pm2 processes: list, restart, logs, stop, start.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'list|restart|logs|stop|start|status' },
          name: { type: 'string', description: 'Process name (for restart/logs/stop)' },
          lines: { type: 'number', description: 'Number of log lines (default 30)' },
        },
        required: ['action'],
      },
      execute: async (input: any) => {
        var cmdMap: Record<string, string> = {
          list: 'pm2 jlist',
          restart: `pm2 restart ${input.name || 'all'}`,
          logs: `pm2 logs ${input.name || ''} --nostream --lines ${input.lines || 30}`,
          stop: `pm2 stop ${input.name}`,
          start: `pm2 start ${input.name}`,
          status: 'pm2 jlist',
        };
        var cmd = cmdMap[input.action];
        if (!cmd) return { error: `Unknown action. Use: ${Object.keys(cmdMap).join(', ')}` };

        try {
          var { stdout, stderr } = await execAsync(cmd, { timeout: 15000 });
          if (input.action === 'list' || input.action === 'status') {
            try {
              var procs = JSON.parse(stdout);
              return {
                processes: procs.map((p: any) => ({
                  name: p.name, id: p.pm_id, status: p.pm2_env?.status,
                  cpu: p.monit?.cpu, memory: Math.round((p.monit?.memory || 0) / 1024 / 1024) + 'MB',
                  restarts: p.pm2_env?.restart_time, uptime: p.pm2_env?.pm_uptime,
                })),
              };
            } catch {}
          }
          return { output: (stdout + '\n' + stderr).trim().slice(-10000) };
        } catch (err: any) {
          return { error: (err.stderr || err.message).slice(0, 5000) };
        }
      },
    },
  ];
}
