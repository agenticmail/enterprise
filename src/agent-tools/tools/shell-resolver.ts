/**
 * Cross-platform shell resolution for agent command-execution tools.
 *
 * Shared by the `bash` tool and the code-sandbox so both behave
 * identically across platforms.
 *
 * The bug this fixes: tools used to hardcode `shell: '/bin/bash'`. On
 * Windows there is no `/bin/bash` — Node resolves it to `C:\bin\bash`,
 * which doesn't exist, so every command failed with ENOENT, was
 * coerced to exit-code 1, and returned empty output ("\n\nExit code:
 * 1"). The agent appeared to "run nothing".
 *
 * Resolution:
 *   - POSIX: honour $SHELL, else /bin/bash.
 *   - Windows: locate the git-for-windows bash. We prefer
 *     `usr\bin\bash.exe` (full MSYS environment — coreutils, proper
 *     mounts) over the `bin\bash.exe` launcher. An explicit override
 *     is available via AGENTICMAIL_BASH_PATH. Last resort is `bash`
 *     on PATH (WSL or git-on-PATH).
 *
 * On Windows we also align git-bash's `/tmp` (its `usertemp` mount,
 * which normally points at %TEMP%) with where Node resolves `/tmp`
 * (drive-relative, e.g. C:\tmp). Without this, a file the agent
 * writes via the Node-backed `write`/`read` tools at `/tmp/x` is
 * invisible to a subsequent `bash` tool reading `/tmp/x`, breaking
 * the common write-script-then-run-it workflow.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

let _cached: { shell: string; env: Record<string, string | undefined> } | null = null;

export function resolveShell(): { shell: string; env: Record<string, string | undefined> } {
  if (_cached) return _cached;

  if (process.platform !== 'win32') {
    _cached = { shell: process.env.SHELL || '/bin/bash', env: {} };
    return _cached;
  }

  const candidates = [
    process.env.AGENTICMAIL_BASH_PATH,
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ].filter(Boolean) as string[];
  const shell = candidates.find((p) => existsSync(p)) || 'bash';

  const nodeTmp = resolvePath('/tmp');
  try { mkdirSync(nodeTmp, { recursive: true }); } catch { /* best-effort */ }

  _cached = { shell, env: { TMP: nodeTmp, TEMP: nodeTmp } };
  return _cached;
}

/** True when git-for-windows bash was found (or we're on POSIX). */
export function hasWorkingShell(): boolean {
  const { shell } = resolveShell();
  return process.platform !== 'win32' || shell !== 'bash' || existsSync(shell);
}
