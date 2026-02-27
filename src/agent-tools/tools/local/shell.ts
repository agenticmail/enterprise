/**
 * Shell tools — Execute commands on the host with full PTY support.
 * 
 * Supports:
 * - Regular commands (non-interactive, fast)
 * - Interactive commands via PTY (sudo, apt-get, installers, etc.)
 * - Password input for sudo/elevated permissions
 * - Long-running processes with background mode
 * - Cross-platform: macOS, Linux (all distros), Windows (PowerShell)
 * 
 * MUST be gated by platform capabilities in settings.
 */

import { exec as cpExec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import type { ToolDefinition } from '../../types.js';

var execAsync = promisify(cpExec);

// Active PTY sessions for interactive/long-running commands
var activeSessions = new Map<string, {
  proc: any;
  output: string;
  exitCode: number | null;
  startedAt: number;
}>();

// Auto-cleanup sessions older than 30 minutes
setInterval(() => {
  var now = Date.now();
  for (var [id, s] of activeSessions) {
    if (now - s.startedAt > 30 * 60 * 1000) {
      try { s.proc?.kill(); } catch {}
      activeSessions.delete(id);
    }
  }
}, 60000);

export function createShellTools(opts?: { cwd?: string; timeout?: number }): ToolDefinition[] {
  return [
    {
      name: 'shell_exec',
      description: 'Execute a shell command. For interactive commands (sudo, installers), use shell_interactive instead.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeout: { type: 'number', description: 'Seconds (default 30)' },
        },
        required: ['command'],
      },
      execute: async (input: any) => {
        var timeoutMs = (input.timeout || opts?.timeout || 30) * 1000;
        var cwd = input.cwd || opts?.cwd || process.cwd();
        try {
          var r = await execAsync(input.command, {
            cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024,
            env: { ...process.env, TERM: 'dumb', DEBIAN_FRONTEND: 'noninteractive' },
          });
          var stdout = r.stdout || '';
          var stderr = r.stderr || '';
          if (stdout.length > 50000) stdout = stdout.slice(0, 50000) + '\n[...truncated]';
          if (stderr.length > 10000) stderr = stderr.slice(0, 10000) + '\n[...truncated]';
          return { stdout, stderr, exitCode: 0 };
        } catch (err: any) {
          return { stdout: (err.stdout || '').slice(0, 50000), stderr: (err.stderr || err.message || '').slice(0, 10000), exitCode: err.code || 1 };
        }
      },
    },
    {
      name: 'shell_interactive',
      description: 'Run an interactive command with PTY (sudo, apt install, ssh, etc.). Can send input like passwords. Returns session ID for follow-up.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Command to run (e.g. "sudo apt install nginx")' },
          input: { type: 'string', description: 'Text to send to stdin (e.g. password). Sent after command starts.' },
          inputDelay: { type: 'number', description: 'ms to wait before sending input (default 500)' },
          cwd: { type: 'string' },
          timeout: { type: 'number', description: 'Seconds to wait for output (default 30)' },
          sessionId: { type: 'string', description: 'Resume existing session instead of starting new command' },
        },
        required: [],
      },
      execute: async (input: any) => {
        // Resume existing session
        if (input.sessionId) {
          var session = activeSessions.get(input.sessionId);
          if (!session) return { error: 'Session not found or expired' };

          // Send input if provided
          if (input.input) {
            try { session.proc.stdin.write(input.input + '\n'); } catch {}
          }

          // Wait a bit for output
          await new Promise(r => setTimeout(r, (input.timeout || 3) * 1000));

          var output = session.output;
          session.output = ''; // Clear buffer
          if (output.length > 50000) output = output.slice(-50000);
          return { sessionId: input.sessionId, output, exitCode: session.exitCode, done: session.exitCode !== null };
        }

        // Start new interactive session
        var sessionId = 'sh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var shell = platform() === 'win32' ? 'powershell.exe' : '/bin/bash';
        var args = platform() === 'win32' ? ['-Command', input.command || 'echo ready'] : ['-c', input.command || 'echo ready'];
        var cwd = input.cwd || opts?.cwd || process.cwd();

        var proc = spawn(shell, args, {
          cwd,
          env: { ...process.env, TERM: 'xterm-256color' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        var entry = { proc, output: '', exitCode: null as number | null, startedAt: Date.now() };
        activeSessions.set(sessionId, entry);

        proc.stdout?.on('data', (d: Buffer) => { entry.output += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { entry.output += d.toString(); });
        proc.on('close', (code: number) => { entry.exitCode = code ?? 0; });
        proc.on('error', (err: Error) => { entry.output += '\n[ERROR] ' + err.message; entry.exitCode = 1; });

        // Send input after delay (for password prompts etc.)
        if (input.input) {
          var delay = input.inputDelay || 500;
          setTimeout(() => {
            try { proc.stdin.write(input.input + '\n'); } catch {}
          }, delay);
        }

        // Wait for initial output
        var waitMs = Math.min((input.timeout || 30) * 1000, 60000);
        await new Promise<void>((resolve) => {
          var timer = setTimeout(resolve, waitMs);
          proc.on('close', () => { clearTimeout(timer); setTimeout(resolve, 200); });
        });

        var output = entry.output;
        entry.output = '';
        if (output.length > 50000) output = output.slice(-50000);
        return { sessionId, output, exitCode: entry.exitCode, done: entry.exitCode !== null };
      },
    },
    {
      name: 'shell_sudo',
      description: 'Run a command with sudo. Handles password prompt automatically.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Command to run (without sudo prefix)' },
          password: { type: 'string', description: 'User password for sudo' },
          cwd: { type: 'string' },
          timeout: { type: 'number', description: 'Seconds (default 60)' },
        },
        required: ['command', 'password'],
      },
      execute: async (input: any) => {
        if (platform() === 'win32') {
          // Windows: Use RunAs or PowerShell elevation
          return { error: 'Use shell_interactive with "Start-Process ... -Verb RunAs" for Windows elevation' };
        }
        var timeoutMs = (input.timeout || 60) * 1000;
        var cwd = input.cwd || opts?.cwd || process.cwd();
        var cmd = `echo '${input.password.replace(/'/g, "'\\''")}' | sudo -S ${input.command}`;
        try {
          var r = await execAsync(cmd, {
            cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, TERM: 'dumb', DEBIAN_FRONTEND: 'noninteractive' },
          });
          var stdout = r.stdout || '';
          var stderr = (r.stderr || '').replace(/\[sudo\].*\n?/g, ''); // Strip sudo prompt
          if (stdout.length > 50000) stdout = stdout.slice(0, 50000) + '\n[...truncated]';
          return { stdout, stderr, exitCode: 0 };
        } catch (err: any) {
          var stderr = (err.stderr || err.message || '').replace(/\[sudo\].*\n?/g, '');
          return { stdout: (err.stdout || '').slice(0, 50000), stderr: stderr.slice(0, 10000), exitCode: err.code || 1 };
        }
      },
    },
    {
      name: 'shell_install',
      description: 'Install a package using the system package manager. Auto-detects apt/yum/dnf/pacman/brew/choco/winget.',
      input_schema: {
        type: 'object' as const,
        properties: {
          package: { type: 'string', description: 'Package name(s) to install' },
          password: { type: 'string', description: 'Sudo password (not needed for brew/choco/winget)' },
        },
        required: ['package'],
      },
      execute: async (input: any) => {
        var os = platform();
        var pkg = input.package;
        var cmd: string;
        var needsSudo = true;

        if (os === 'darwin') {
          cmd = `brew install ${pkg}`; needsSudo = false;
        } else if (os === 'win32') {
          cmd = `winget install ${pkg}`; needsSudo = false;
        } else {
          // Linux — detect package manager
          try { await execAsync('which apt-get'); cmd = `apt-get install -y ${pkg}`; }
          catch { try { await execAsync('which dnf'); cmd = `dnf install -y ${pkg}`; }
          catch { try { await execAsync('which yum'); cmd = `yum install -y ${pkg}`; }
          catch { try { await execAsync('which pacman'); cmd = `pacman -S --noconfirm ${pkg}`; }
          catch { try { await execAsync('which apk'); cmd = `apk add ${pkg}`; }
          catch { return { error: 'No supported package manager found (apt/dnf/yum/pacman/apk)' }; }}}}}
        }

        if (needsSudo && input.password) {
          cmd = `echo '${input.password.replace(/'/g, "'\\''")}' | sudo -S ${cmd}`;
        } else if (needsSudo) {
          cmd = `sudo ${cmd}`; // Try passwordless sudo (Docker, root user)
        }

        try {
          var r = await execAsync(cmd, {
            timeout: 300000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive', TERM: 'dumb' },
          });
          return { ok: true, stdout: (r.stdout || '').slice(-5000), stderr: (r.stderr || '').slice(-2000) };
        } catch (err: any) {
          return { error: (err.stderr || err.message || '').slice(0, 10000), exitCode: err.code || 1 };
        }
      },
    },
    {
      name: 'shell_session_list',
      description: 'List active interactive shell sessions.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async () => ({
        sessions: Array.from(activeSessions.entries()).map(([id, s]) => ({
          id, done: s.exitCode !== null, exitCode: s.exitCode,
          age: Math.round((Date.now() - s.startedAt) / 1000) + 's',
          buffered: s.output.length + ' chars',
        })),
      }),
    },
    {
      name: 'shell_session_kill',
      description: 'Kill an interactive shell session.',
      input_schema: {
        type: 'object' as const,
        properties: { sessionId: { type: 'string' } },
        required: ['sessionId'],
      },
      execute: async (input: any) => {
        var s = activeSessions.get(input.sessionId);
        if (!s) return { error: 'Not found' };
        try { s.proc.kill('SIGKILL'); } catch {}
        activeSessions.delete(input.sessionId);
        return { ok: true };
      },
    },
  ];
}

// Backward compat
export function createShellExecTool(opts?: { cwd?: string; timeout?: number }): ToolDefinition {
  return createShellTools(opts)[0];
}
