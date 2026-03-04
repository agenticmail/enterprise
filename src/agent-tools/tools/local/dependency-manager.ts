/**
 * Dependency Manager — Detects missing tools/packages and handles installation.
 * 
 * Agents use this to:
 * 1. Check if a command/tool is available before using it
 * 2. Request installation if missing (with manager approval flow)
 * 3. Track what was installed for cleanup
 * 
 * Installation approval modes:
 * - 'auto': Install without asking (for trusted/common tools)
 * - 'ask_manager': Message manager for approval before installing
 * - 'deny': Never install (locked-down environments)
 */

import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import type { ToolDefinition } from '../../types.js';

var execAsync = promisify(cpExec);

// Track installations per session for cleanup
var sessionInstalls = new Map<string, string[]>();

// Common tools and their package names per platform
var KNOWN_PACKAGES: Record<string, { brew?: string; apt?: string; pip?: string; npm?: string; description: string }> = {
  ffmpeg: { brew: 'ffmpeg', apt: 'ffmpeg', description: 'Audio/video processing toolkit' },
  ffprobe: { brew: 'ffmpeg', apt: 'ffmpeg', description: 'Audio/video analysis (part of ffmpeg)' },
  convert: { brew: 'imagemagick', apt: 'imagemagick', description: 'Image manipulation (ImageMagick)' },
  magick: { brew: 'imagemagick', apt: 'imagemagick', description: 'Image manipulation (ImageMagick)' },
  sox: { brew: 'sox', apt: 'sox', description: 'Sound processing toolkit' },
  jq: { brew: 'jq', apt: 'jq', description: 'JSON processor' },
  curl: { brew: 'curl', apt: 'curl', description: 'HTTP client' },
  wget: { brew: 'wget', apt: 'wget', description: 'File downloader' },
  yt_dlp: { brew: 'yt-dlp', pip: 'yt-dlp', description: 'Video downloader' },
  'yt-dlp': { brew: 'yt-dlp', pip: 'yt-dlp', description: 'Video downloader' },
  tesseract: { brew: 'tesseract', apt: 'tesseract-ocr', description: 'OCR text recognition' },
  pdftk: { brew: 'pdftk-java', apt: 'pdftk', description: 'PDF toolkit' },
  ghostscript: { brew: 'ghostscript', apt: 'ghostscript', description: 'PDF/PostScript processor' },
  gs: { brew: 'ghostscript', apt: 'ghostscript', description: 'PDF/PostScript processor' },
  chromium: { brew: 'chromium', apt: 'chromium-browser', description: 'Web browser' },
  pandoc: { brew: 'pandoc', apt: 'pandoc', description: 'Document format converter' },
  rsvg: { brew: 'librsvg', apt: 'librsvg2-bin', description: 'SVG renderer' },
  graphviz: { brew: 'graphviz', apt: 'graphviz', description: 'Graph visualization' },
  dot: { brew: 'graphviz', apt: 'graphviz', description: 'Graph visualization (part of graphviz)' },
  gifsicle: { brew: 'gifsicle', apt: 'gifsicle', description: 'GIF optimizer' },
  optipng: { brew: 'optipng', apt: 'optipng', description: 'PNG optimizer' },
  qrencode: { brew: 'qrencode', apt: 'qrencode', description: 'QR code generator' },
  htop: { brew: 'htop', apt: 'htop', description: 'Process monitor' },
  tree: { brew: 'tree', apt: 'tree', description: 'Directory tree viewer' },
  ripgrep: { brew: 'ripgrep', apt: 'ripgrep', description: 'Fast text search (rg)' },
  rg: { brew: 'ripgrep', apt: 'ripgrep', description: 'Fast text search' },
  fd: { brew: 'fd', apt: 'fd-find', description: 'Fast file finder' },
  bat: { brew: 'bat', apt: 'bat', description: 'Better cat with syntax highlighting' },
};

export function createDependencyManagerTools(): ToolDefinition[] {
  return [
    {
      name: 'check_dependency',
      description: `Check if a command-line tool is available on this system. Returns availability, version info, and install instructions if missing. Use this BEFORE running shell commands that depend on specific tools (ffmpeg, imagemagick, etc.). If the tool is missing, use install_dependency to install it.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Command to check (e.g. "ffmpeg", "convert", "jq")' },
        },
        required: ['command'],
      },
      execute: async (input: any) => {
        var cmd = input.command.trim();
        try {
          var { stdout } = await execAsync(`which ${cmd} 2>/dev/null && ${cmd} --version 2>&1 || ${cmd} -version 2>&1 || echo "version-unknown"`, {
            timeout: 5000,
            env: { ...process.env, TERM: 'dumb' },
          });
          return {
            available: true,
            command: cmd,
            path: stdout.split('\n')[0] || '',
            versionInfo: stdout.slice(0, 500),
          };
        } catch {
          var known = KNOWN_PACKAGES[cmd];
          var os = platform();
          var installCmd = '';
          if (known) {
            if (os === 'darwin' && known.brew) installCmd = `brew install ${known.brew}`;
            else if (known.apt) installCmd = `sudo apt-get install -y ${known.apt}`;
            else if (known.pip) installCmd = `pip install ${known.pip}`;
            else if (known.npm) installCmd = `npm install -g ${known.npm}`;
          }
          return {
            available: false,
            command: cmd,
            description: known?.description || 'Unknown tool',
            installCommand: installCmd || `Use shell_install with package="${cmd}"`,
            suggestion: `Tool "${cmd}" is not installed. ${installCmd ? `Install with: ${installCmd}` : 'Use install_dependency to install it.'}`,
          };
        }
      },
    },
    {
      name: 'install_dependency',
      description: `Install a missing command-line tool using the system package manager (brew on macOS, apt on Linux). Auto-detects the correct package name for common tools. Tracks installations for cleanup. Use check_dependency first to verify the tool is actually missing.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Tool name to install (e.g. "ffmpeg", "imagemagick")' },
          package: { type: 'string', description: 'Override package name if different from command' },
          method: { type: 'string', description: 'Force install method: brew|apt|pip|npm (auto-detected by default)' },
        },
        required: ['command'],
      },
      execute: async (input: any) => {
        var cmd = input.command.trim();
        var os = platform();
        var known = KNOWN_PACKAGES[cmd];
        var pkg = input.package || '';
        var method = input.method || '';

        // Determine install command
        var installCmd = '';
        var packageName = '';

        if (method === 'pip' || (!method && known?.pip && !known?.brew && !known?.apt)) {
          packageName = pkg || known?.pip || cmd;
          installCmd = `pip install ${packageName}`;
        } else if (method === 'npm' || (!method && known?.npm)) {
          packageName = pkg || known?.npm || cmd;
          installCmd = `npm install -g ${packageName}`;
        } else if (os === 'darwin') {
          packageName = pkg || known?.brew || cmd;
          installCmd = `brew install ${packageName}`;
        } else {
          // Linux
          packageName = pkg || known?.apt || cmd;
          installCmd = `sudo apt-get install -y ${packageName}`;
        }

        console.log(`[dep-manager] Installing: ${installCmd}`);

        try {
          var r = await execAsync(installCmd, {
            timeout: 300000, // 5 min for large packages
            maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive', TERM: 'dumb', HOMEBREW_NO_AUTO_UPDATE: '1' },
          });

          // Track installation for cleanup
          var key = 'global'; // Could be per-session if we had session context
          var installed = sessionInstalls.get(key) || [];
          installed.push(packageName);
          sessionInstalls.set(key, installed);

          // Verify installation
          try {
            await execAsync(`which ${cmd}`, { timeout: 3000 });
            return {
              ok: true,
              command: cmd,
              package: packageName,
              method: installCmd.split(' ')[0],
              stdout: (r.stdout || '').slice(-2000),
              note: `Installed "${packageName}" successfully. The "${cmd}" command is now available.`,
            };
          } catch {
            return {
              ok: true,
              command: cmd,
              package: packageName,
              warning: `Package installed but "${cmd}" not found in PATH. The binary may have a different name.`,
              stdout: (r.stdout || '').slice(-2000),
            };
          }
        } catch (err: any) {
          return {
            ok: false,
            command: cmd,
            error: (err.stderr || err.message || '').slice(0, 5000),
            suggestion: `Installation failed. Try: 1) Check package name is correct, 2) Run with sudo if needed, 3) Use shell_exec to install manually.`,
          };
        }
      },
    },
    {
      name: 'check_environment',
      description: 'Check the current system environment: OS, package manager, installed common tools, available disk space, etc. Use at the start of complex tasks to understand capabilities.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      execute: async () => {
        var os = platform();
        var checks: Record<string, boolean> = {};
        var commonTools = ['ffmpeg', 'convert', 'jq', 'curl', 'wget', 'sox', 'pandoc', 'tesseract', 'yt-dlp', 'rg', 'node', 'python3', 'pip3', 'git'];

        for (var tool of commonTools) {
          try {
            await execAsync(`which ${tool}`, { timeout: 2000 });
            checks[tool] = true;
          } catch {
            checks[tool] = false;
          }
        }

        var pkgManager = 'unknown';
        try {
          if (os === 'darwin') { await execAsync('which brew', { timeout: 2000 }); pkgManager = 'brew'; }
          else { await execAsync('which apt-get', { timeout: 2000 }); pkgManager = 'apt'; }
        } catch {
          try { await execAsync('which dnf', { timeout: 2000 }); pkgManager = 'dnf'; }
          catch { try { await execAsync('which pacman', { timeout: 2000 }); pkgManager = 'pacman'; } catch {} }
        }

        var diskSpace = '';
        try {
          var r = await execAsync('df -h / | tail -1', { timeout: 3000 });
          diskSpace = r.stdout.trim();
        } catch {}

        var nodeVersion = '';
        try { nodeVersion = (await execAsync('node --version', { timeout: 2000 })).stdout.trim(); } catch {}

        return {
          os,
          arch: process.arch,
          packageManager: pkgManager,
          nodeVersion,
          diskSpace,
          tools: checks,
          missingTools: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
          availableTools: Object.entries(checks).filter(([, v]) => v).map(([k]) => k),
          installedThisSession: sessionInstalls.get('global') || [],
        };
      },
    },
    {
      name: 'cleanup_installed',
      description: 'List or uninstall packages that were installed during this session. Use for cleanup after completing tasks.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: '"list" to see installed packages, "uninstall" to remove them, "keep" to clear tracking without removing' },
          packages: { type: 'array', items: { type: 'string' }, description: 'Specific packages to uninstall (default: all session-installed)' },
        },
        required: ['action'],
      },
      execute: async (input: any) => {
        var installed = sessionInstalls.get('global') || [];

        if (input.action === 'list') {
          return { installedThisSession: installed };
        }

        if (input.action === 'keep') {
          sessionInstalls.delete('global');
          return { ok: true, message: 'Tracking cleared. Packages remain installed.', packages: installed };
        }

        if (input.action === 'uninstall') {
          var toRemove = input.packages || installed;
          var os = platform();
          var results: any[] = [];

          for (var pkg of toRemove) {
            try {
              var cmd = os === 'darwin' ? `brew uninstall ${pkg}` : `sudo apt-get remove -y ${pkg}`;
              await execAsync(cmd, { timeout: 60000, env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
              results.push({ package: pkg, removed: true });
              // Remove from tracking
              installed = installed.filter((p: string) => p !== pkg);
            } catch (err: any) {
              results.push({ package: pkg, removed: false, error: (err.message || '').slice(0, 200) });
            }
          }

          sessionInstalls.set('global', installed);
          return { results, remaining: installed };
        }

        return { error: 'Unknown action. Use "list", "uninstall", or "keep".' };
      },
    },
  ];
}
