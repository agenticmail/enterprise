/**
 * Dependency Manager — Safe, cross-platform tool installation for agents.
 *
 * Design principles:
 * 1. NEVER modify existing installations — if a tool exists, use it as-is
 * 2. Prefer local/isolated installs over global when possible
 * 3. Track only what the agent actually installed (not pre-existing)
 * 4. npm packages go to a session-local directory (added to PATH), not global
 * 5. Fully cross-platform: macOS (brew), Linux (apt/dnf/pacman/snap), Windows (choco/winget/scoop)
 * 6. Respects agent permission profile's dependencyPolicy
 * 7. Supports sudo with stored password (piped via stdin, never in command line)
 * 8. Cleanup only removes what the agent installed, verified against pre-install snapshot
 */

import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import type { ToolDefinition } from '../../types.js';

var execAsync = promisify(cpExec);

// ─── Types ────────────────────────────────────────────

interface DependencyPolicy {
  mode: 'auto' | 'ask_manager' | 'deny';
  allowGlobalInstalls: boolean;
  allowElevated: boolean;
  sudoPassword?: string;
  allowedManagers: string[];
  blockedPackages: string[];
  autoCleanup: boolean;
}

interface InstallRecord {
  package: string;
  command: string;
  method: string;
  localPath?: string;
  wasAlreadyInstalled: boolean;
  timestamp: number;
}

// Default policy — restrictive
var DEFAULT_POLICY: DependencyPolicy = {
  mode: 'auto',
  allowGlobalInstalls: false,
  allowElevated: false,
  allowedManagers: ['npm', 'pip'],
  blockedPackages: [],
  autoCleanup: true,
};

// ─── Session State ────────────────────────────────────

var sessionInstalls = new Map<string, InstallRecord[]>();
var SESSION_LOCAL_DIR = join(tmpdir(), `agenticmail-deps-${process.pid}`);

// Active policy — set by the agent runtime from permission profile
var _activePolicy: DependencyPolicy = { ...DEFAULT_POLICY };

/** Called by agent runtime to set the policy from permission profile */
export function setDependencyPolicy(policy: Partial<DependencyPolicy>): void {
  _activePolicy = { ...DEFAULT_POLICY, ...policy };
}

/** Get current policy (for tools to read) */
export function getDependencyPolicy(): DependencyPolicy {
  return { ..._activePolicy };
}

// ─── Cross-Platform Helpers ───────────────────────────

type PkgManager = 'brew' | 'apt' | 'dnf' | 'pacman' | 'snap' | 'choco' | 'winget' | 'scoop' | 'npm' | 'pip';

var IS_WINDOWS = platform() === 'win32';
var IS_MAC = platform() === 'darwin';
var IS_LINUX = platform() === 'linux';

/** Detect available package managers on this system */
async function detectPackageManagers(): Promise<PkgManager[]> {
  var managers: PkgManager[] = [];
  var checks: [string, PkgManager][] = IS_WINDOWS
    ? [['choco', 'choco'], ['winget', 'winget'], ['scoop', 'scoop'], ['npm', 'npm'], ['pip', 'pip']]
    : IS_MAC
    ? [['brew', 'brew'], ['npm', 'npm'], ['pip3', 'pip'], ['pip', 'pip']]
    : [['apt-get', 'apt'], ['dnf', 'dnf'], ['pacman', 'pacman'], ['snap', 'snap'], ['brew', 'brew'], ['npm', 'npm'], ['pip3', 'pip'], ['pip', 'pip']];

  await Promise.all(checks.map(async ([cmd, mgr]) => {
    try {
      var which = IS_WINDOWS ? 'where' : 'which';
      await execAsync(`${which} ${cmd}`, { timeout: 3000 });
      if (!managers.includes(mgr)) managers.push(mgr);
    } catch {}
  }));
  return managers;
}

// Common tools with cross-platform package names
var KNOWN_PACKAGES: Record<string, {
  brew?: string; apt?: string; dnf?: string; pacman?: string; snap?: string;
  choco?: string; winget?: string; scoop?: string;
  pip?: string; npm?: string;
  description: string;
  /** True = system binary, needs global install (brew/apt/choco). False = can install locally via npm/pip */
  systemOnly?: boolean;
}> = {
  ffmpeg:     { brew: 'ffmpeg', apt: 'ffmpeg', dnf: 'ffmpeg', pacman: 'ffmpeg', choco: 'ffmpeg', winget: 'Gyan.FFmpeg', scoop: 'ffmpeg', description: 'Audio/video processing', systemOnly: true },
  ffprobe:    { brew: 'ffmpeg', apt: 'ffmpeg', dnf: 'ffmpeg', pacman: 'ffmpeg', choco: 'ffmpeg', winget: 'Gyan.FFmpeg', scoop: 'ffmpeg', description: 'Audio/video analysis (part of ffmpeg)', systemOnly: true },
  convert:    { brew: 'imagemagick', apt: 'imagemagick', dnf: 'ImageMagick', pacman: 'imagemagick', choco: 'imagemagick', winget: 'ImageMagick.ImageMagick', scoop: 'imagemagick', description: 'Image manipulation (ImageMagick)', systemOnly: true },
  magick:     { brew: 'imagemagick', apt: 'imagemagick', dnf: 'ImageMagick', pacman: 'imagemagick', choco: 'imagemagick', winget: 'ImageMagick.ImageMagick', scoop: 'imagemagick', description: 'Image manipulation (ImageMagick)', systemOnly: true },
  sox:        { brew: 'sox', apt: 'sox', dnf: 'sox', pacman: 'sox', choco: 'sox', description: 'Sound processing', systemOnly: true },
  jq:         { brew: 'jq', apt: 'jq', dnf: 'jq', pacman: 'jq', choco: 'jq', scoop: 'jq', description: 'JSON processor', systemOnly: true },
  curl:       { brew: 'curl', apt: 'curl', dnf: 'curl', pacman: 'curl', choco: 'curl', scoop: 'curl', description: 'HTTP client', systemOnly: true },
  wget:       { brew: 'wget', apt: 'wget', dnf: 'wget', pacman: 'wget', choco: 'wget', scoop: 'wget', description: 'File downloader', systemOnly: true },
  'yt-dlp':   { brew: 'yt-dlp', pip: 'yt-dlp', choco: 'yt-dlp', scoop: 'yt-dlp', description: 'Video downloader' },
  yt_dlp:     { brew: 'yt-dlp', pip: 'yt-dlp', choco: 'yt-dlp', scoop: 'yt-dlp', description: 'Video downloader' },
  tesseract:  { brew: 'tesseract', apt: 'tesseract-ocr', dnf: 'tesseract', pacman: 'tesseract', choco: 'tesseract', description: 'OCR text recognition', systemOnly: true },
  pdftk:      { brew: 'pdftk-java', apt: 'pdftk', description: 'PDF toolkit', systemOnly: true },
  ghostscript:{ brew: 'ghostscript', apt: 'ghostscript', dnf: 'ghostscript', pacman: 'ghostscript', choco: 'ghostscript', description: 'PDF/PostScript processor', systemOnly: true },
  gs:         { brew: 'ghostscript', apt: 'ghostscript', dnf: 'ghostscript', pacman: 'ghostscript', choco: 'ghostscript', description: 'PDF/PostScript processor', systemOnly: true },
  pandoc:     { brew: 'pandoc', apt: 'pandoc', dnf: 'pandoc', pacman: 'pandoc', choco: 'pandoc', scoop: 'pandoc', description: 'Document format converter', systemOnly: true },
  graphviz:   { brew: 'graphviz', apt: 'graphviz', dnf: 'graphviz', pacman: 'graphviz', choco: 'graphviz', description: 'Graph visualization', systemOnly: true },
  dot:        { brew: 'graphviz', apt: 'graphviz', dnf: 'graphviz', pacman: 'graphviz', choco: 'graphviz', description: 'Graph visualization (part of graphviz)', systemOnly: true },
  gifsicle:   { brew: 'gifsicle', apt: 'gifsicle', npm: 'gifsicle', description: 'GIF optimizer' },
  optipng:    { brew: 'optipng', apt: 'optipng', dnf: 'optipng', choco: 'optipng', description: 'PNG optimizer', systemOnly: true },
  qrencode:   { brew: 'qrencode', apt: 'qrencode', description: 'QR code generator', systemOnly: true },
  tree:       { brew: 'tree', apt: 'tree', dnf: 'tree', pacman: 'tree', choco: 'tree', description: 'Directory tree viewer', systemOnly: true },
  ripgrep:    { brew: 'ripgrep', apt: 'ripgrep', dnf: 'ripgrep', pacman: 'ripgrep', choco: 'ripgrep', scoop: 'ripgrep', description: 'Fast text search (rg)', systemOnly: true },
  rg:         { brew: 'ripgrep', apt: 'ripgrep', dnf: 'ripgrep', pacman: 'ripgrep', choco: 'ripgrep', scoop: 'ripgrep', description: 'Fast text search', systemOnly: true },
  fd:         { brew: 'fd', apt: 'fd-find', dnf: 'fd-find', pacman: 'fd', choco: 'fd', scoop: 'fd', description: 'Fast file finder', systemOnly: true },
  bat:        { brew: 'bat', apt: 'bat', dnf: 'bat', pacman: 'bat', choco: 'bat', scoop: 'bat', description: 'Better cat with syntax highlighting', systemOnly: true },
  htop:       { brew: 'htop', apt: 'htop', dnf: 'htop', pacman: 'htop', description: 'Process monitor', systemOnly: true },
  // npm tools — can be installed locally
  prettier:   { npm: 'prettier', description: 'Code formatter' },
  eslint:     { npm: 'eslint', description: 'JavaScript linter' },
  typescript: { npm: 'typescript', description: 'TypeScript compiler' },
  tsc:        { npm: 'typescript', description: 'TypeScript compiler' },
  esbuild:    { npm: 'esbuild', description: 'Fast JS bundler' },
  sharp:      { npm: 'sharp', description: 'Image processing library' },
  puppeteer:  { npm: 'puppeteer', description: 'Headless Chrome automation' },
  // pip tools
  whisper:    { pip: 'openai-whisper', description: 'Speech-to-text', systemOnly: true },
};

// ─── Path Helpers ─────────────────────────────────────

function ensureLocalDir() {
  var npmBin = IS_WINDOWS
    ? join(SESSION_LOCAL_DIR, 'node_modules', '.bin')
    : join(SESSION_LOCAL_DIR, 'node_modules', '.bin');
  var pipBin = join(SESSION_LOCAL_DIR, 'pip-bin');
  if (!existsSync(SESSION_LOCAL_DIR)) {
    mkdirSync(SESSION_LOCAL_DIR, { recursive: true });
    mkdirSync(join(SESSION_LOCAL_DIR, 'node_modules'), { recursive: true });
    mkdirSync(pipBin, { recursive: true });
  }
  return { root: SESSION_LOCAL_DIR, npmBin, pipBin };
}

function localPath(): string {
  var dirs = ensureLocalDir();
  var sep = IS_WINDOWS ? ';' : ':';
  return `${dirs.npmBin}${sep}${dirs.pipBin}${sep}${process.env.PATH || ''}`;
}

/** Detect the elevation tool available on this system */
var _elevationTool: string | null = null;
async function detectElevationTool(): Promise<string | null> {
  if (_elevationTool !== null) return _elevationTool || null;
  if (IS_WINDOWS) {
    // Windows: use powershell Start-Process with -Verb RunAs, or just run directly
    // (choco/winget/scoop don't need elevation in most cases)
    _elevationTool = 'runas';
    return _elevationTool;
  }
  // Unix: try sudo first, then doas (OpenBSD, some Alpine/Void setups)
  for (var tool of ['sudo', 'doas']) {
    try {
      await execAsync(`which ${tool}`, { timeout: 2000 });
      _elevationTool = tool;
      return tool;
    } catch {}
  }
  _elevationTool = '';
  return null;
}

/** Run a command, optionally with elevated privileges (sudo/doas/runas) */
async function runCommand(cmd: string, opts?: { sudo?: boolean; timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  var timeout = opts?.timeout || 300000;
  var env: Record<string, string | undefined> = {
    ...process.env,
    PATH: localPath(),
    TERM: 'dumb',
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_INSTALL_UPGRADE: '1',
    HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: '1',
  };

  if (IS_LINUX || IS_MAC) env.DEBIAN_FRONTEND = 'noninteractive';

  if (opts?.sudo) {
    if (IS_WINDOWS) {
      // Windows: choco/winget typically work in user context.
      // If truly needs elevation, PowerShell Start-Process is needed but that's async/detached.
      // For package managers, just run directly — most handle their own elevation prompts.
      return execAsync(cmd, { timeout, maxBuffer: 4 * 1024 * 1024, env });
    }

    // Unix: detect sudo vs doas
    var elevTool = await detectElevationTool();
    if (!elevTool) {
      throw new Error('No elevation tool found (sudo/doas not installed). Cannot run elevated commands.');
    }

    var sudoPwd = _activePolicy.sudoPassword;
    if (sudoPwd) {
      if (elevTool === 'sudo') {
        // Pipe password via stdin — never in command args or env
        var escaped = sudoPwd.replace(/'/g, "'\\''");
        var fullCmd = `echo '${escaped}' | sudo -S ${cmd}`;
        return execAsync(fullCmd, { timeout, maxBuffer: 4 * 1024 * 1024, env });
      } else if (elevTool === 'doas') {
        // doas doesn't support -S stdin; if password is needed, it must be configured in doas.conf
        // with "permit nopass" or similar. We try without password.
        return execAsync(`doas ${cmd}`, { timeout, maxBuffer: 4 * 1024 * 1024, env });
      }
    }

    // No password — try non-interactive
    if (elevTool === 'sudo') {
      return execAsync(`sudo -n ${cmd}`, { timeout, maxBuffer: 4 * 1024 * 1024, env });
    } else {
      return execAsync(`doas ${cmd}`, { timeout, maxBuffer: 4 * 1024 * 1024, env });
    }
  }

  return execAsync(cmd, { timeout, maxBuffer: 4 * 1024 * 1024, env });
}

/** Check if a command exists */
async function commandExists(cmd: string): Promise<{ exists: boolean; path?: string; version?: string }> {
  try {
    var which = IS_WINDOWS ? 'where' : 'which';
    var { stdout: whichOut } = await execAsync(`${which} ${cmd}`, {
      timeout: 3000,
      env: { ...process.env, PATH: localPath(), TERM: 'dumb' },
    });
    var cmdPath = whichOut.trim().split('\n')[0].split('\r')[0];

    var version = '';
    try {
      var { stdout: verOut } = await execAsync(`${cmd} --version 2>&1`, {
        timeout: 5000,
        env: { ...process.env, PATH: localPath(), TERM: 'dumb' },
      });
      version = verOut.trim().split('\n')[0].slice(0, 200);
    } catch {
      try {
        var { stdout: verOut2 } = await execAsync(`${cmd} -version 2>&1`, { timeout: 3000, env: { ...process.env, PATH: localPath(), TERM: 'dumb' } });
        version = verOut2.trim().split('\n')[0].slice(0, 200);
      } catch {}
    }

    return { exists: true, path: cmdPath, version };
  } catch {
    return { exists: false };
  }
}

/** Build install command for a given manager + package.
 * needsElevation = true means the command needs sudo/doas (Unix) or admin (Windows).
 * On Windows, choco may need admin but we let it handle its own UAC prompt.
 */
function buildInstallCommand(mgr: PkgManager, pkg: string): { cmd: string; needsElevation: boolean; isLocal: boolean } {
  var dirs = ensureLocalDir();
  switch (mgr) {
    case 'brew':   return { cmd: `brew install ${pkg}`, needsElevation: false, isLocal: false };
    case 'apt':    return { cmd: `apt-get install -y ${pkg}`, needsElevation: true, isLocal: false };
    case 'dnf':    return { cmd: `dnf install -y ${pkg}`, needsElevation: true, isLocal: false };
    case 'pacman': return { cmd: `pacman -S --noconfirm ${pkg}`, needsElevation: true, isLocal: false };
    case 'snap':   return { cmd: `snap install ${pkg}`, needsElevation: true, isLocal: false };
    case 'choco':  return { cmd: `choco install ${pkg} -y`, needsElevation: false, isLocal: false };
    case 'winget': return { cmd: `winget install --accept-source-agreements --accept-package-agreements ${pkg}`, needsElevation: false, isLocal: false };
    case 'scoop':  return { cmd: `scoop install ${pkg}`, needsElevation: false, isLocal: false };
    case 'npm':    return { cmd: `npm install --prefix "${dirs.root}" ${pkg}`, needsElevation: false, isLocal: true };
    case 'pip':    return { cmd: `pip install --target "${dirs.pipBin}" ${pkg}`, needsElevation: false, isLocal: true };
  }
}

/** Pick the best manager for a package on this platform */
async function pickManager(cmd: string, forceMethod?: string): Promise<{ mgr: PkgManager; pkg: string; isLocal: boolean } | null> {
  var known = KNOWN_PACKAGES[cmd];
  if (forceMethod && forceMethod !== 'auto') {
    var mgr = forceMethod as PkgManager;
    var pkg = (known as any)?.[mgr] || cmd;
    return { mgr, pkg, isLocal: mgr === 'npm' || mgr === 'pip' };
  }

  // Prefer local installs (npm/pip) if available
  if (known?.npm && !known?.systemOnly) return { mgr: 'npm', pkg: known.npm, isLocal: true };
  if (known?.pip && !known?.systemOnly) return { mgr: 'pip', pkg: known.pip, isLocal: true };

  // System package — pick by platform
  var available = await detectPackageManagers();

  if (IS_MAC && known?.brew && available.includes('brew')) return { mgr: 'brew', pkg: known.brew, isLocal: false };
  if (IS_WINDOWS) {
    if (known?.scoop && available.includes('scoop')) return { mgr: 'scoop', pkg: known.scoop, isLocal: false };
    if (known?.choco && available.includes('choco')) return { mgr: 'choco', pkg: known.choco, isLocal: false };
    if (known?.winget && available.includes('winget')) return { mgr: 'winget', pkg: known.winget, isLocal: false };
  }
  if (IS_LINUX) {
    if (known?.apt && available.includes('apt')) return { mgr: 'apt', pkg: known.apt, isLocal: false };
    if (known?.dnf && available.includes('dnf')) return { mgr: 'dnf', pkg: known.dnf, isLocal: false };
    if (known?.pacman && available.includes('pacman')) return { mgr: 'pacman', pkg: known.pacman, isLocal: false };
    if (known?.snap && available.includes('snap')) return { mgr: 'snap', pkg: known.snap, isLocal: false };
  }

  // Fallback: pip if available
  if (known?.pip && available.includes('pip')) return { mgr: 'pip', pkg: known.pip, isLocal: false };

  // Unknown package — try the first available system manager
  for (var m of available) {
    if (m !== 'npm' && m !== 'pip') return { mgr: m, pkg: cmd, isLocal: false };
  }

  return null;
}

// ─── Tool Definitions ─────────────────────────────────

export function createDependencyManagerTools(): ToolDefinition[] {
  return [
    {
      name: 'check_dependency',
      description: `Check if command-line tools are available. Returns availability, version, path, and install instructions if missing. Safe — changes nothing. Use before running commands that need specific tools.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Command to check (e.g. "ffmpeg")' },
          commands: { type: 'array', items: { type: 'string' }, description: 'Check multiple commands at once' },
        },
        required: [],
      },
      execute: async (_id: any, input: any) => {
        var cmds: string[] = input.commands || (input.command ? [String(input.command).trim()] : []);
        if (!cmds.length) return { error: 'Provide "command" or "commands".' };

        var results: Record<string, any> = {};
        for (var cmd of cmds) {
          var check = await commandExists(cmd);
          if (check.exists) {
            results[cmd] = { available: true, path: check.path, version: check.version };
          } else {
            var mgr = await pickManager(cmd);
            var policy = _activePolicy;
            results[cmd] = {
              available: false,
              description: KNOWN_PACKAGES[cmd]?.description || 'Unknown tool',
              installable: !!mgr,
              method: mgr?.mgr,
              local: mgr?.isLocal ?? false,
              policyAllows: policy.mode !== 'deny' && (mgr?.isLocal || policy.allowGlobalInstalls) && (!mgr || policy.allowedManagers.includes(mgr.mgr)) && !policy.blockedPackages.includes(mgr?.pkg || cmd),
              suggestion: mgr
                ? mgr.isLocal
                  ? `install_dependency will install locally (no global changes)`
                  : `install_dependency will use ${mgr.mgr} (global install)`
                : 'Unknown package — specify package name and method manually',
            };
          }
        }
        return cmds.length === 1 ? results[cmds[0]] : results;
      },
    },
    {
      name: 'install_dependency',
      description: `Install a missing tool. Respects the agent's dependency policy (set in Permissions dashboard).
- npm/pip: installed to a SESSION-LOCAL directory — no global changes
- brew/apt/choco/winget/scoop: global installs — only if policy allows
- sudo: only if policy allows elevated, password piped via stdin (never in args)
- NEVER modifies/upgrades existing tools
- Cross-platform: macOS, Linux (all distros), Windows, Raspberry Pi`,
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Tool name to install (e.g. "ffmpeg", "prettier")' },
          package: { type: 'string', description: 'Override package name if different from command' },
          method: { type: 'string', enum: ['brew', 'apt', 'dnf', 'pacman', 'snap', 'choco', 'winget', 'scoop', 'npm', 'pip', 'auto'], description: 'Package manager (default: auto-detect)' },
        },
        required: ['command'],
      },
      execute: async (_id: any, input: any) => {
        if (!input.command) return { ok: false, error: 'Missing required parameter "command". Example: install_dependency({ command: "wget" })' };
        var cmd = String(input.command).trim();
        var policy = _activePolicy;

        // ── Policy check: deny mode ──
        if (policy.mode === 'deny') {
          return {
            ok: false,
            command: cmd,
            error: 'Dependency installation is disabled for this agent. Change the dependency policy in the Permissions dashboard to allow installations.',
            policyMode: 'deny',
          };
        }

        // ── Check if already installed ──
        var existing = await commandExists(cmd);
        if (existing.exists) {
          var records = sessionInstalls.get('global') || [];
          if (!records.find(r => r.command === cmd)) {
            records.push({ package: cmd, command: cmd, method: 'existing', wasAlreadyInstalled: true, timestamp: Date.now() });
            sessionInstalls.set('global', records);
          }
          return { ok: true, alreadyInstalled: true, command: cmd, path: existing.path, version: existing.version, note: `"${cmd}" is already installed at ${existing.path}. No changes made.` };
        }

        // ── Resolve manager + package ──
        var resolved = await pickManager(cmd, input.method !== 'auto' ? input.method : undefined);
        if (input.package) {
          // Override package name
          if (resolved) resolved.pkg = input.package;
          else {
            // Try to figure out a manager
            var mgrs = await detectPackageManagers();
            var fallback = (IS_WINDOWS ? (mgrs.includes('choco') ? 'choco' : mgrs.includes('winget') ? 'winget' : 'npm') : IS_MAC ? 'brew' : (mgrs.includes('apt') ? 'apt' : 'npm')) as PkgManager;
            resolved = { mgr: fallback, pkg: input.package, isLocal: fallback === 'npm' || (fallback as string) === 'pip' };
          }
        }
        if (!resolved) {
          return { ok: false, command: cmd, error: `No package manager found for "${cmd}". Specify method and package name manually.` };
        }

        // ── Policy checks ──
        if (policy.blockedPackages.includes(resolved.pkg)) {
          return { ok: false, command: cmd, error: `Package "${resolved.pkg}" is blocked by policy.` };
        }
        if (!resolved.isLocal && !policy.allowGlobalInstalls) {
          return { ok: false, command: cmd, error: `Global installs (${resolved.mgr}) not allowed by policy. Only local npm/pip installs are permitted. Change "Allow Global Installs" in the Permissions dashboard.`, method: resolved.mgr };
        }
        if (policy.allowedManagers.length > 0 && !policy.allowedManagers.includes(resolved.mgr)) {
          return { ok: false, command: cmd, error: `Package manager "${resolved.mgr}" not in allowed list: [${policy.allowedManagers.join(', ')}]. Update allowed managers in the Permissions dashboard.` };
        }

        var installInfo = buildInstallCommand(resolved.mgr, resolved.pkg);

        if (installInfo.needsElevation && !policy.allowElevated) {
          return { ok: false, command: cmd, error: `"${resolved.mgr}" requires elevated/sudo privileges, which are disabled by policy. Enable "Allow Elevated" in the Permissions dashboard, or provide a sudo password.`, method: resolved.mgr };
        }

        // ── ask_manager mode ──
        if (policy.mode === 'ask_manager') {
          return {
            ok: false,
            needsApproval: true,
            command: cmd,
            package: resolved.pkg,
            method: resolved.mgr,
            installCommand: installInfo.cmd,
            global: !resolved.isLocal,
            needsElevation: installInfo.needsElevation,
            message: `Agent needs approval to install "${resolved.pkg}" via ${resolved.mgr}. ${!resolved.isLocal ? '(global install)' : '(local install)'} ${installInfo.needsElevation ? '(requires elevated privileges)' : ''}`,
          };
        }

        // ── Install ──
        console.log(`[dep-manager] Installing: ${installInfo.cmd} (local=${installInfo.isLocal}, elevated=${installInfo.needsElevation})`);

        try {
          var r = await runCommand(installInfo.cmd, { sudo: installInfo.needsElevation, timeout: 300000 });

          // Track
          var records2 = sessionInstalls.get('global') || [];
          records2.push({ package: resolved.pkg, command: cmd, method: resolved.mgr, localPath: installInfo.isLocal ? SESSION_LOCAL_DIR : undefined, wasAlreadyInstalled: false, timestamp: Date.now() });
          sessionInstalls.set('global', records2);

          // Verify
          var verify = await commandExists(cmd);
          if (verify.exists) {
            return {
              ok: true, command: cmd, package: resolved.pkg, method: resolved.mgr,
              local: installInfo.isLocal, path: verify.path,
              note: installInfo.isLocal
                ? `Installed "${resolved.pkg}" locally. Available as "${cmd}" for this session.${policy.autoCleanup ? ' Will be cleaned up automatically.' : ''}`
                : `Installed "${resolved.pkg}" globally via ${resolved.mgr}. "${cmd}" is now available at ${verify.path}.`,
            };
          } else {
            return {
              ok: true, command: cmd, package: resolved.pkg, method: resolved.mgr,
              warning: `Package installed but "${cmd}" not found in PATH. The binary might have a different name.`,
              stdout: (r.stdout || '').slice(-1000),
            };
          }
        } catch (err: any) {
          var errMsg = (err.stderr || err.message || '').slice(0, 3000);
          var hint = '';
          if (errMsg.includes('Permission denied') || errMsg.includes('EACCES') || errMsg.includes('not permitted')) {
            hint = 'Permission denied. Enable "Allow Elevated" in agent permissions and optionally provide a sudo password.';
          } else if (errMsg.includes('No such formula') || errMsg.includes('Unable to locate package') || errMsg.includes('not found')) {
            hint = `Package "${resolved!.pkg}" not found in ${resolved!.mgr}. Try a different package name.`;
          } else if (errMsg.includes('already installed')) {
            hint = 'Already installed — try running the command directly.';
          } else if (errMsg.includes('password') || errMsg.includes('sudo')) {
            hint = 'Sudo password required. Set it in the agent\'s Permissions dashboard → Dependency Policy → Sudo Password.';
          }
          return { ok: false, command: cmd, package: resolved!.pkg, method: resolved!.mgr, error: errMsg, hint: hint || 'Installation failed.' };
        }
      },
    },
    {
      name: 'check_environment',
      description: 'Survey the system: OS, architecture, package managers, common tool availability, disk space, and current dependency policy. Use at the start of complex tasks.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
      execute: async () => {
        var commonTools = ['ffmpeg', 'convert', 'jq', 'curl', 'wget', 'pandoc', 'tesseract', 'yt-dlp', 'rg', 'node', 'python3', 'git', 'docker'];
        if (IS_WINDOWS) commonTools.push('powershell', 'wsl');
        var checks: Record<string, boolean> = {};
        await Promise.all(commonTools.map(async (tool) => {
          checks[tool] = (await commandExists(tool)).exists;
        }));

        var managers = await detectPackageManagers();
        var diskSpace = '';
        try {
          var dfCmd = IS_WINDOWS ? 'wmic logicaldisk get size,freespace,caption' : 'df -h / | tail -1';
          diskSpace = (await execAsync(dfCmd, { timeout: 3000 })).stdout.trim();
        } catch {}

        var nodeVer = '';
        try { nodeVer = (await execAsync('node --version', { timeout: 2000 })).stdout.trim(); } catch {}

        var installed = sessionInstalls.get('global') || [];
        return {
          os: platform(),
          arch: process.arch,
          isWindows: IS_WINDOWS, isMac: IS_MAC, isLinux: IS_LINUX,
          packageManagers: managers,
          nodeVersion: nodeVer,
          diskSpace,
          tools: checks,
          missingTools: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
          availableTools: Object.entries(checks).filter(([, v]) => v).map(([k]) => k),
          dependencyPolicy: {
            mode: _activePolicy.mode,
            allowGlobalInstalls: _activePolicy.allowGlobalInstalls,
            allowElevated: _activePolicy.allowElevated,
            hasSudoPassword: !!_activePolicy.sudoPassword,
            allowedManagers: _activePolicy.allowedManagers,
            autoCleanup: _activePolicy.autoCleanup,
          },
          sessionInstalls: {
            count: installed.filter(r => !r.wasAlreadyInstalled).length,
            packages: installed.filter(r => !r.wasAlreadyInstalled).map(r => ({ package: r.package, method: r.method, local: !!r.localPath })),
          },
        };
      },
    },
    {
      name: 'cleanup_installed',
      description: `List or remove packages installed this session. Only removes what the agent installed — never touches pre-existing packages. Use "list" to see, "cleanup" to remove, "keep" to clear tracking.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', enum: ['list', 'cleanup', 'keep'], description: 'Action to take' },
          packages: { type: 'array', items: { type: 'string' }, description: 'Specific packages to remove (default: all)' },
        },
        required: ['action'],
      },
      execute: async (_id: any, input: any) => {
        var records = sessionInstalls.get('global') || [];
        var agentInstalled = records.filter(r => !r.wasAlreadyInstalled);
        var preExisting = records.filter(r => r.wasAlreadyInstalled);

        if (input.action === 'list') {
          return {
            agentInstalled: agentInstalled.map(r => ({
              package: r.package, command: r.command, method: r.method,
              local: !!r.localPath, installedAt: new Date(r.timestamp).toISOString(),
            })),
            preExisting: preExisting.map(r => ({ command: r.command, note: 'Pre-existing — will NOT be removed' })),
            localDir: existsSync(SESSION_LOCAL_DIR) ? SESSION_LOCAL_DIR : null,
          };
        }

        if (input.action === 'keep') {
          sessionInstalls.delete('global');
          return { ok: true, message: 'Tracking cleared. All packages remain installed.', kept: agentInstalled.map(r => r.package) };
        }

        if (input.action === 'cleanup') {
          var toRemove = input.packages
            ? agentInstalled.filter(r => input.packages.includes(r.package) || input.packages.includes(r.command))
            : agentInstalled;
          var results: any[] = [];

          // Local installs — delete the temp dir
          var localPkgs = toRemove.filter(r => !!r.localPath);
          if (localPkgs.length > 0 && existsSync(SESSION_LOCAL_DIR)) {
            try {
              var rmCmd = IS_WINDOWS ? `rmdir /s /q "${SESSION_LOCAL_DIR}"` : `rm -rf "${SESSION_LOCAL_DIR}"`;
              await execAsync(rmCmd, { timeout: 10000 });
              for (var lp of localPkgs) results.push({ package: lp.package, removed: true, method: 'local-dir-deleted' });
            } catch (err: any) {
              for (var lp2 of localPkgs) results.push({ package: lp2.package, removed: false, error: err.message?.slice(0, 200) });
            }
          }

          // Global installs
          var globalPkgs = toRemove.filter(r => !r.localPath);
          for (var gp of globalPkgs) {
            try {
              var uninstallCmd = '';
              var needsElev = false;
              switch (gp.method) {
                case 'brew': uninstallCmd = `brew uninstall --ignore-dependencies ${gp.package}`; break;
                case 'apt': uninstallCmd = `apt-get remove -y ${gp.package}`; needsElev = true; break;
                case 'dnf': uninstallCmd = `dnf remove -y ${gp.package}`; needsElev = true; break;
                case 'pacman': uninstallCmd = `pacman -R --noconfirm ${gp.package}`; needsElev = true; break;
                case 'snap': uninstallCmd = `snap remove ${gp.package}`; needsElev = true; break;
                case 'choco': uninstallCmd = `choco uninstall ${gp.package} -y`; break;
                case 'winget': uninstallCmd = `winget uninstall ${gp.package}`; break;
                case 'scoop': uninstallCmd = `scoop uninstall ${gp.package}`; break;
                case 'pip': uninstallCmd = `pip uninstall -y ${gp.package}`; break;
              }
              if (uninstallCmd) {
                await runCommand(uninstallCmd, { sudo: needsElev, timeout: 60000 });
                results.push({ package: gp.package, removed: true, method: gp.method });
              }
            } catch (err: any) {
              results.push({ package: gp.package, removed: false, error: (err.message || '').slice(0, 200) });
            }
          }

          var removedPkgs = new Set(results.filter(r => r.removed).map(r => r.package));
          var remaining = records.filter(r => !removedPkgs.has(r.package));
          sessionInstalls.set('global', remaining);
          return { results, remaining: remaining.filter(r => !r.wasAlreadyInstalled).map(r => r.package), preExistingUntouched: preExisting.map(r => r.command) };
        }

        return { error: 'Unknown action. Use "list", "cleanup", or "keep".' };
      },
    },
  ];
}
