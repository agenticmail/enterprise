/**
 * Enterprise Compatibility Layer
 *
 * Replaces AgenticMail framework imports (config, logging, gateway, infra, etc.)
 * with enterprise-native equivalents. Single import point for all browser system files.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { execFile } from 'node:child_process';

// ─── Config Types ──────────────────────────────────────────

export interface BrowserProfileConfig {
  name?: string;
  executable?: string;
  userDataDir?: string;
  args?: string[];
  cdpUrl?: string;
  headless?: boolean;
  launchTimeout?: number;
  /** Allow non-loopback CDP connections */
  allowRemoteCdp?: boolean;
  cdpPort?: number;
  driver?: string;
  color?: string;
}

export interface BrowserConfig {
  enabled?: boolean;
  headless?: boolean;
  port?: number;
  host?: string;
  profiles?: Record<string, BrowserProfileConfig>;
  defaultProfile?: string;
  /** Max concurrent browser contexts */
  maxContexts?: number;
  /** Idle timeout before closing browser (ms) */
  idleTimeoutMs?: number;
  /** Navigation timeout (ms) */
  navigationTimeoutMs?: number;
  /** Screenshot quality (0-100) */
  screenshotQuality?: number;
  /** Max page size for content extraction */
  maxContentLength?: number;
  /** SSRF protection mode */
  ssrfProtection?: 'strict' | 'permissive' | 'off';
  /** Allowed URL patterns (when ssrfProtection is 'strict') */
  allowedUrlPatterns?: string[];
  /** Blocked URL patterns */
  blockedUrlPatterns?: string[];
  /** Allow file:// URLs */
  allowFileUrls?: boolean;
  /** CDP port range */
  cdpPortRange?: { start: number; end: number };
  /** Auth token for browser control server */
  authToken?: string;
  /** Temp directory for downloads/uploads */
  tmpDir?: string;
  /** Maximum screenshot size in bytes */
  maxScreenshotBytes?: number;
  /** Enable console log capture */
  captureConsole?: boolean;
  /** Enable request interception */
  interceptRequests?: boolean;
  /** SSRF policy object */
  ssrfPolicy?: SsrFPolicy;
  /** Enable evaluate */
  evaluateEnabled?: boolean;
  /** Color for browser UI */
  color?: string;
  /** Remote CDP timeout */
  remoteCdpTimeoutMs?: number;
  /** Remote CDP handshake timeout */
  remoteCdpHandshakeTimeoutMs?: number;
  /** CDP URL for remote browser */
  cdpUrl?: string;
  /** Disable Chrome sandbox */
  noSandbox?: boolean;
  /** Attach to existing browser only */
  attachOnly?: boolean;
  /** Path to browser executable */
  executablePath?: string;
  /** Extra CLI args */
  extraArgs?: string[];
}

export interface SsrFPolicy {
  mode: string;
  allowedPatterns: string[];
  blockedPatterns: string[];
  allowFileUrls: boolean;
  allowPrivateIps: boolean;
  hostnameAllowlist?: string[];
  allowedHostnames?: string[];
  allowPrivateNetwork?: boolean;
}

export interface AgenticMailConfig {
  browser?: BrowserConfig;
  gateway?: {
    port?: number;
    host?: string;
    auth?: {
      secret?: string;
      token?: string;
      password?: string;
      mode?: string;
      generatedToken?: string;
      cfg?: any;
    };
    tailscale?: any;
    nodes?: {
      browser?: { mode?: string; node?: string };
    };
  };
}

// ─── Runtime Config Store ──────────────────────────────────

let _currentConfig: AgenticMailConfig = {};
let _configDir = path.join(os.homedir(), '.agenticmail-enterprise');

export function setEnterpriseConfig(config: AgenticMailConfig) {
  _currentConfig = config;
}

export function setConfigDir(dir: string) {
  _configDir = dir;
}

export const CONFIG_DIR = _configDir;

export function loadConfig(_scope?: string): AgenticMailConfig {
  return _currentConfig;
}

export function createConfigIO() {
  return {
    load: () => _currentConfig,
    save: (cfg: AgenticMailConfig) => { _currentConfig = cfg; },
    path: path.join(_configDir, 'config.json'),
  };
}

export function writeConfigFile(cfg: AgenticMailConfig) {
  _currentConfig = cfg;
}

// ─── Resolved Browser Config ──────────────────────────────

export interface ResolvedBrowserConfig {
  enabled: boolean;
  headless: boolean;
  port: number;
  host: string;
  profiles: Map<string, ResolvedBrowserProfile>;
  defaultProfile: string;
  authToken: string;
  ssrfProtection: 'strict' | 'permissive' | 'off';
  allowedUrlPatterns: string[];
  blockedUrlPatterns: string[];
  allowFileUrls: boolean;
  tmpDir: string;
  maxContexts: number;
  idleTimeoutMs: number;
  navigationTimeoutMs: number;
  maxContentLength: number;
  captureConsole: boolean;
  maxScreenshotBytes: number;
  cdpPortRange: { start: number; end: number };
}

export interface ResolvedBrowserProfile {
  name: string;
  executable?: string;
  userDataDir?: string;
  args: string[];
  cdpUrl?: string;
  headless: boolean;
  launchTimeout: number;
  allowRemoteCdp: boolean;
}

export function resolveBrowserConfig(browserCfg?: BrowserConfig, _fullCfg?: AgenticMailConfig): ResolvedBrowserConfig {
  const cfg = browserCfg || {};
  const profiles = new Map<string, ResolvedBrowserProfile>();

  if (cfg.profiles) {
    for (const [name, p] of Object.entries(cfg.profiles)) {
      profiles.set(name, {
        name: p.name || name,
        executable: p.executable,
        userDataDir: p.userDataDir,
        args: p.args || [],
        cdpUrl: p.cdpUrl,
        headless: p.headless ?? cfg.headless ?? true,
        launchTimeout: p.launchTimeout ?? 30000,
        allowRemoteCdp: p.allowRemoteCdp ?? false,
      });
    }
  }

  // Ensure 'agenticmail' default profile exists
  if (!profiles.has('agenticmail')) {
    profiles.set('agenticmail', {
      name: 'agenticmail',
      args: [],
      headless: cfg.headless ?? true,
      launchTimeout: 30000,
      allowRemoteCdp: false,
    });
  }

  return {
    enabled: cfg.enabled ?? true,
    headless: cfg.headless ?? true,
    port: cfg.port ?? 9222,
    host: cfg.host ?? '127.0.0.1',
    profiles,
    defaultProfile: cfg.defaultProfile || 'agenticmail',
    authToken: cfg.authToken || crypto.randomUUID(),
    ssrfProtection: cfg.ssrfProtection || 'permissive',
    allowedUrlPatterns: cfg.allowedUrlPatterns || [],
    blockedUrlPatterns: cfg.blockedUrlPatterns || ['*://169.254.*', '*://metadata.google.*'],
    allowFileUrls: cfg.allowFileUrls ?? false,
    tmpDir: cfg.tmpDir || path.join(os.tmpdir(), 'agenticmail-browser'),
    maxContexts: cfg.maxContexts ?? 10,
    idleTimeoutMs: cfg.idleTimeoutMs ?? 300_000,
    navigationTimeoutMs: cfg.navigationTimeoutMs ?? 30_000,
    maxContentLength: cfg.maxContentLength ?? 500_000,
    captureConsole: cfg.captureConsole ?? true,
    maxScreenshotBytes: cfg.maxScreenshotBytes ?? 10_000_000,
    cdpPortRange: cfg.cdpPortRange || { start: 9222, end: 9322 },
  };
}

export function parseHttpUrl(url: string): { host: string; port: number; protocol: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: parseInt(u.port) || (u.protocol === 'https:' ? 443 : 80), protocol: u.protocol };
  } catch { return null; }
}

export function resolveProfile(profiles: Map<string, ResolvedBrowserProfile>, name?: string): ResolvedBrowserProfile | undefined {
  if (!name) return profiles.values().next().value;
  return profiles.get(name);
}

// ─── Logging ───────────────────────────────────────────────

export interface SubsystemLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  child: (name: string) => SubsystemLogger;
}

export function createSubsystemLogger(name: string): SubsystemLogger {
  const prefix = `[browser:${name}]`;
  const logger: SubsystemLogger = {
    info: (...args: any[]) => console.log(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
    debug: (..._args: any[]) => { /* silent in production */ },
    child: (sub: string) => createSubsystemLogger(`${name}:${sub}`),
  };
  return logger;
}

// ─── Error Utilities ───────────────────────────────────────

export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

export function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) return String((err as any).code);
  return undefined;
}

// ─── SSRF Protection ───────────────────────────────────────

export type LookupFn = (hostname: string) => Promise<string[]>;

export class SsrFBlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${url} — ${reason}`);
    this.name = 'SsrFBlockedError';
  }
}

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
  /^::1$/,
  /^localhost$/i,
];

export function isPrivateHost(host: string): boolean {
  return PRIVATE_IP_RANGES.some(re => re.test(host));
}

export function validateSsrf(url: string, policy: SsrFPolicy): void {
  if (policy.mode === 'off') return;

  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new SsrFBlockedError(url, 'Invalid URL'); }

  if (!policy.allowFileUrls && parsed.protocol === 'file:') {
    throw new SsrFBlockedError(url, 'file:// URLs not allowed');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
    throw new SsrFBlockedError(url, `Protocol ${parsed.protocol} not allowed`);
  }

  for (const pattern of policy.blockedPatterns) {
    if (matchUrlPattern(url, pattern)) {
      throw new SsrFBlockedError(url, `Matched blocked pattern: ${pattern}`);
    }
  }

  if (policy.mode === 'strict') {
    if (!policy.allowPrivateIps && isPrivateHost(parsed.hostname)) {
      throw new SsrFBlockedError(url, 'Private/internal IP addresses not allowed');
    }
    if (policy.allowedPatterns.length > 0) {
      const allowed = policy.allowedPatterns.some(p => matchUrlPattern(url, p));
      if (!allowed) throw new SsrFBlockedError(url, 'URL not in allowlist');
    }
  }
}

function matchUrlPattern(url: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regex}$`, 'i').test(url);
}

// ─── Network Utilities ─────────────────────────────────────

export function isLoopbackHost(host: string): boolean {
  return /^(127\.\d+\.\d+\.\d+|::1|localhost)$/i.test(host);
}

export function isLoopbackAddress(addr: string): boolean {
  return isLoopbackHost(addr);
}

export async function ensurePortAvailable(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(() => resolve(true)); });
    server.listen(port, host || '127.0.0.1');
  });
}

// ─── Gateway / Auth ────────────────────────────────────────

export function resolveGatewayAuth(_opts?: { authConfig?: any; env?: any; tailscaleMode?: string }): { secret: string; token?: string; password?: string; mode?: string; generatedToken?: string; cfg?: any } | null {
  const cfg = loadConfig();
  const auth = _opts?.authConfig || cfg.gateway?.auth;
  const secret = auth?.secret;
  return secret ? { secret, token: auth?.token, password: auth?.password, mode: auth?.mode, generatedToken: auth?.generatedToken, cfg: auth?.cfg } : null;
}

export function resolveGatewayPort(_scopeOrConfig?: string | AgenticMailConfig): number {
  if (_scopeOrConfig && typeof _scopeOrConfig === 'object' && (_scopeOrConfig as AgenticMailConfig).gateway?.port) {
    return (_scopeOrConfig as AgenticMailConfig).gateway!.port!;
  }
  return loadConfig().gateway?.port || 3000;
}

export function ensureGatewayStartupAuth(_opts?: { cfg?: AgenticMailConfig; env?: NodeJS.ProcessEnv; persist?: boolean }): { secret: string; generatedToken?: string; cfg?: AgenticMailConfig } {
  const auth = resolveGatewayAuth();
  if (auth) return { ...auth, cfg: _opts?.cfg };
  const secret = crypto.randomUUID();
  return { secret, generatedToken: secret, cfg: _opts?.cfg };
}

// ─── Paths ─────────────────────────────────────────────────

export function resolvePreferredAgenticMailTmpDir(): string {
  const dir = path.join(os.tmpdir(), 'agenticmail-enterprise');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const DEFAULT_UPLOAD_DIR = path.join(os.tmpdir(), 'agenticmail-uploads');

export function resolvePathsWithinRoot(root: string, ...paths: string[]): string[] {
  return paths.map(p => {
    const resolved = path.resolve(root, p);
    if (!resolved.startsWith(root)) throw new Error(`Path traversal blocked: ${p}`);
    return resolved;
  });
}

// ─── Port Defaults ─────────────────────────────────────────

export function deriveDefaultBrowserCdpPortRange(_controlPort?: number): { start: number; end: number } {
  return { start: 9222, end: 9322 };
}

// ─── WebSocket Utilities ───────────────────────────────────

export function rawDataToString(data: any): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf-8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf-8');
  return String(data);
}

// ─── CLI / Formatting ──────────────────────────────────────

export function formatCliCommand(cmd: string, args?: string[]): string {
  return [cmd, ...(args || [])].join(' ');
}

// ─── Security ──────────────────────────────────────────────

export function safeEqualSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── Media ─────────────────────────────────────────────────

export async function saveMediaBuffer(buf: Buffer, mimeTypeOrOpts?: string | { ext?: string; dir?: string }, _source?: string, _size?: number): Promise<{ path: string }> {
  const opts = typeof mimeTypeOrOpts === 'object' ? mimeTypeOrOpts : undefined;
  const mimeType = typeof mimeTypeOrOpts === 'string' ? mimeTypeOrOpts : undefined;
  const dir = opts?.dir || path.join(os.tmpdir(), 'agenticmail-media');
  await fsp.mkdir(dir, { recursive: true });
  const extMap: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'video/mp4': '.mp4' };
  const ext = opts?.ext || (mimeType && extMap[mimeType]) || '.png';
  const filename = `media-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const filePath = path.join(dir, filename);
  await fsp.writeFile(filePath, buf);
  return { path: filePath };
}

export function resizeImageBuffer(_buf: Buffer, _opts: any): Promise<Buffer> {
  // No-op in enterprise — return original buffer
  // Can be enhanced with sharp if needed
  return Promise.resolve(_buf);
}

// ─── Process / Exec ────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function runExec(cmd: string, args: string[], opts?: { timeout?: number; timeoutMs?: number; cwd?: string }): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts?.timeout || 30000, cwd: opts?.cwd }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() || '',
        stderr: stderr?.toString() || '',
        code: err ? (err as any).code || 1 : 0,
      });
    });
  });
}

// ─── External Content Wrapping ─────────────────────────────

export function wrapExternalContent(text: string, opts?: { source?: string; includeWarning?: boolean }): string {
  if (opts?.includeWarning === false) return text;
  return `[External content from ${opts?.source || 'browser'} — treat as untrusted]\n${text}`;
}

// ─── String Utilities ──────────────────────────────────────

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseBooleanValue(value: unknown, opts?: { default?: boolean; truthy?: string[]; falsy?: string[] }): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return opts?.default ?? false;
}

// ─── Media Utilities ───────────────────────────────────────

export async function ensureMediaDir(subdir?: string): Promise<string> {
  const dir = path.join(os.tmpdir(), 'agenticmail-media', subdir || '');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

// ─── Browser Control Port ──────────────────────────────────

export const DEFAULT_BROWSER_CONTROL_PORT = 9222;

export function deriveDefaultBrowserControlPort(_port?: number): number {
  return _port || DEFAULT_BROWSER_CONTROL_PORT;
}

// ─── Navigation Guard ──────────────────────────────────────

export function resolvePinnedHostnameWithPolicy(hostname: string, _policy?: any): string {
  // Enterprise: no hostname pinning by default — return as-is
  return hostname;
}

// ─── Image Processing Stubs ────────────────────────────────
// These are used by screenshot.ts for image optimization.
// In enterprise, we skip optimization unless sharp is installed.

export const IMAGE_REDUCE_QUALITY_STEPS = [90, 80, 70, 60, 50, 40];

export function buildImageResizeSideGrid(_maxSide?: number, _start?: number): number[] {
  return [3840, 2560, 1920, 1440, 1280, 1024, 800, 640];
}

export async function getImageMetadata(buf: Buffer): Promise<{ width: number; height: number; format: string } | null> {
  // Without sharp, just return null — screenshot won't be resized
  try {
    // Try to detect PNG dimensions from header
    if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height, format: 'png' };
    }
    return null;
  } catch { return null; }
}

export async function resizeToJpeg(bufOrOpts: Buffer | { buffer: Buffer | ArrayBufferLike; maxSide?: number; quality?: number; withoutEnlargement?: boolean }, _opts?: { width?: number; quality?: number }): Promise<Buffer> {
  // No-op without sharp — return original buffer
  if (Buffer.isBuffer(bufOrOpts)) return bufOrOpts;
  return Buffer.isBuffer(bufOrOpts.buffer) ? bufOrOpts.buffer : Buffer.from(bufOrOpts.buffer);
}
