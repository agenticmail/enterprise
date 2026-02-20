/**
 * AgenticMail Agent Tools — Security Sandbox
 *
 * Provides path sandboxing, SSRF protection, and command sanitization
 * for enterprise agent tool execution.
 */

import path from 'node:path';
import dns from 'node:dns/promises';

// ---------------------------------------------------------------------------
// SecurityError
// ---------------------------------------------------------------------------

export class SecurityError extends Error {
  readonly status = 403;
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// PathSandbox
// ---------------------------------------------------------------------------

export interface PathSandboxOptions {
  allowedDirs?: string[];
  blockedPatterns?: string[];
}

export interface PathSandbox {
  resolve(filePath: string): string;
  validate(filePath: string): void;
}

var BLOCKED_BASENAMES = [
  '.env',
  '.env.local',
  '.env.production',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  '.npmrc',
];

var BLOCKED_EXTENSIONS = ['.pem', '.key'];

var BLOCKED_GIT_PATHS = ['/.git/config', '/.git/credentials'];

export function createPathSandbox(workspaceDir: string, opts?: PathSandboxOptions): PathSandbox {
  var resolvedWorkspace = path.resolve(workspaceDir);
  var allowedDirs = [resolvedWorkspace];
  if (opts?.allowedDirs) {
    opts.allowedDirs.forEach(function(dir) {
      allowedDirs.push(path.resolve(dir));
    });
  }

  var extraBlockedPatterns = (opts?.blockedPatterns || []).map(function(p) {
    return new RegExp(p);
  });

  function validate(filePath: string): void {
    // Reject null bytes
    if (filePath.indexOf('\0') !== -1) {
      throw new SecurityError('Path contains null byte', 'PATH_TRAVERSAL');
    }

    var normalized = path.resolve(resolvedWorkspace, filePath);

    // Check path is within at least one allowed directory
    var allowed = false;
    for (var i = 0; i < allowedDirs.length; i++) {
      if (normalized === allowedDirs[i] || normalized.startsWith(allowedDirs[i] + path.sep)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      throw new SecurityError(
        'Path outside allowed directories: ' + filePath,
        'PATH_TRAVERSAL',
      );
    }

    // Check blocked basenames
    var basename = path.basename(normalized);
    if (BLOCKED_BASENAMES.indexOf(basename) !== -1) {
      throw new SecurityError(
        'Access to sensitive file blocked: ' + basename,
        'PATH_BLOCKED',
      );
    }

    // Check blocked extensions
    var ext = path.extname(normalized).toLowerCase();
    if (BLOCKED_EXTENSIONS.indexOf(ext) !== -1) {
      throw new SecurityError(
        'Access to sensitive file type blocked: ' + ext,
        'PATH_BLOCKED',
      );
    }

    // Check .docker/config.json
    if (basename === 'config.json' && normalized.indexOf('.docker' + path.sep) !== -1) {
      throw new SecurityError(
        'Access to .docker/config.json blocked',
        'PATH_BLOCKED',
      );
    }

    // Check .git/config and .git/credentials
    for (var j = 0; j < BLOCKED_GIT_PATHS.length; j++) {
      var gitSuffix = BLOCKED_GIT_PATHS[j].replace(/\//g, path.sep);
      if (normalized.endsWith(gitSuffix) || normalized.indexOf(gitSuffix + path.sep) !== -1) {
        throw new SecurityError(
          'Access to sensitive git file blocked: ' + BLOCKED_GIT_PATHS[j],
          'PATH_BLOCKED',
        );
      }
    }

    // Check extra blocked patterns against full path
    for (var k = 0; k < extraBlockedPatterns.length; k++) {
      if (extraBlockedPatterns[k].test(normalized)) {
        throw new SecurityError(
          'Path matched blocked pattern: ' + normalized,
          'PATH_BLOCKED',
        );
      }
    }
  }

  function resolve(filePath: string): string {
    var normalized = path.resolve(resolvedWorkspace, filePath);
    validate(filePath);
    return normalized;
  }

  return { resolve: resolve, validate: validate };
}

// ---------------------------------------------------------------------------
// SSRF Guard
// ---------------------------------------------------------------------------

export interface SsrfGuardOptions {
  allowedHosts?: string[];
  blockedCidrs?: string[];
}

export interface SsrfGuard {
  validateUrl(url: string): Promise<void>;
}

var METADATA_HOSTS = [
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google.com',
];

/**
 * Check whether an IPv4 address falls within a private / reserved range.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv6 checks
  if (ip.indexOf(':') !== -1) {
    var lower = ip.toLowerCase();
    if (lower === '::1') return true;
    // fc00::/7 — unique-local  (fc or fd prefix)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // fe80::/10 — link-local
    if (lower.startsWith('fe80')) return true;
    // ::ffff:x.x.x.x  mapped IPv4 — extract and check below
    var v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped) {
      return isPrivateIp(v4mapped[1]);
    }
    return false;
  }

  // IPv4 checks
  var parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(function(n) { return isNaN(n) || n < 0 || n > 255; })) {
    return false;
  }

  var a = parts[0], b = parts[1];

  // 0.0.0.0/8
  if (a === 0) return true;
  // 127.0.0.0/8  loopback
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16  link-local / AWS metadata
  if (a === 169 && b === 254) return true;

  return false;
}

export function createSsrfGuard(opts?: SsrfGuardOptions): SsrfGuard {
  var allowedHosts = new Set(opts?.allowedHosts || []);

  async function validateUrl(url: string): Promise<void> {
    var parsed: URL;
    try {
      parsed = new URL(url);
    } catch (_e) {
      throw new SecurityError('Invalid URL: ' + url, 'SSRF_BLOCKED');
    }

    // Scheme check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new SecurityError(
        'URL scheme not allowed: ' + parsed.protocol,
        'SSRF_BLOCKED',
      );
    }

    var hostname = parsed.hostname;

    // Block known metadata endpoints regardless of allow list
    if (METADATA_HOSTS.indexOf(hostname) !== -1) {
      throw new SecurityError(
        'Cloud metadata endpoint blocked: ' + hostname,
        'SSRF_BLOCKED',
      );
    }

    // If host is explicitly allowed, skip IP resolution checks
    if (allowedHosts.has(hostname)) {
      return;
    }

    // Check if hostname is already an IP literal
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.indexOf(':') !== -1) {
      if (isPrivateIp(hostname)) {
        throw new SecurityError(
          'Request to private/internal IP blocked: ' + hostname,
          'SSRF_BLOCKED',
        );
      }
    }

    // Resolve hostname to IP and verify
    var result: { address: string; family: number };
    try {
      result = await dns.lookup(hostname);
    } catch (_e) {
      throw new SecurityError(
        'DNS resolution failed for: ' + hostname,
        'SSRF_BLOCKED',
      );
    }

    if (isPrivateIp(result.address)) {
      throw new SecurityError(
        'Hostname ' + hostname + ' resolved to private IP ' + result.address,
        'SSRF_BLOCKED',
      );
    }
  }

  return { validateUrl: validateUrl };
}

// ---------------------------------------------------------------------------
// Command Sanitizer
// ---------------------------------------------------------------------------

export interface CommandSanitizerOptions {
  mode?: 'blocklist' | 'allowlist';
  allowedCommands?: string[];
  blockedPatterns?: string[];
}

export interface CommandSanitizer {
  validate(command: string): void;
}

var DEFAULT_BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\s*\{.*\|.*&\s*\}/,
  /shutdown|reboot|halt|poweroff/,
  /kill\s+-9\s+1\b/,
  />\s*\/dev\/sd[a-z]/,
  /curl\s+.*\|\s*(ba)?sh/,
  /wget\s+.*\|\s*(ba)?sh/,
  /eval\s*\(/,
  />\s*\/etc\//,
];

export function createCommandSanitizer(opts?: CommandSanitizerOptions): CommandSanitizer {
  var mode = opts?.mode || 'blocklist';
  var allowedCommands = new Set(opts?.allowedCommands || []);

  var extraPatterns = (opts?.blockedPatterns || []).map(function(p) {
    return new RegExp(p);
  });

  var allBlockedPatterns = DEFAULT_BLOCKED_PATTERNS.concat(extraPatterns);

  function validate(command: string): void {
    if (mode === 'allowlist') {
      // Extract base command — first word before space, pipe, or semicolon
      var match = command.trim().match(/^([^\s|;&]+)/);
      var baseCommand = match ? match[1] : command.trim();
      // Strip leading path (e.g. /usr/bin/ls → ls)
      var baseName = path.basename(baseCommand);
      if (!allowedCommands.has(baseName) && !allowedCommands.has(baseCommand)) {
        throw new SecurityError(
          'Command blocked: "' + baseName + '" is not in the allow list',
          'COMMAND_BLOCKED',
        );
      }
    }

    // Always check blocked patterns (even in allowlist mode, as a safety net)
    for (var i = 0; i < allBlockedPatterns.length; i++) {
      if (allBlockedPatterns[i].test(command)) {
        throw new SecurityError(
          'Command blocked: matches dangerous pattern',
          'COMMAND_BLOCKED',
        );
      }
    }
  }

  return { validate: validate };
}

// ---------------------------------------------------------------------------
// Shell Escape
// ---------------------------------------------------------------------------

/**
 * Wrap a value in single quotes for safe shell interpolation.
 * Embedded single quotes are escaped as `'\''`.
 */
export function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
