/**
 * Transport Encryption Middleware
 *
 * Encrypts sensitive API responses and decrypts encrypted requests
 * to protect data in transit (API keys, credentials, database URLs, etc.)
 * against network sniffing and MITM attacks.
 *
 * Uses AES-256-CBC with:
 * - Random IV per message
 * - SHA-256 checksum for integrity verification
 * - Timestamp for replay protection (5 min window)
 * - HMAC signature for authentication
 *
 * Togglable from Settings > Security System in the dashboard.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────

export interface TransportEncryptionConfig {
  enabled: boolean;
  /** Encrypt ALL API calls (overrides per-group selection) */
  encryptAll?: boolean;
  /** Per-group toggles: { models: true, database: true, ... } */
  enabledGroups?: Record<string, boolean>;
  /** Custom endpoint patterns added by user */
  customEndpoints?: string[];
  /** Encryption key (derived from env or generated) */
  key?: string;
  /** Max age for encrypted payloads in ms (default: 5 min) */
  maxAgeMs?: number;
  /** Legacy: specific endpoints list (now derived from groups) */
  sensitiveEndpoints?: string[];
  /** Log decrypted data for debugging (NEVER in production) */
  debugLog?: boolean;
}

interface EncryptedPayload {
  v: 1;                 // Version
  iv: string;           // Hex-encoded IV
  d: string;            // Base64-encoded ciphertext
  ts: number;           // Timestamp
  cs: string;           // Checksum (first 16 chars of SHA-256)
  sig: string;          // HMAC signature
}

// ─── Endpoint groups (must match dashboard settings.js ENDPOINT_GROUPS) ──

const ENDPOINT_GROUPS: Record<string, string[]> = {
  settings:      ['/api/settings', '/api/settings/*'],
  models:        ['/api/settings/models', '/api/llm-keys', '/api/llm-keys/*'],
  auth:          ['/api/auth/*', '/api/login', '/api/users', '/api/users/*'],
  agents:        ['/bridge/agents/*'],
  email:         ['/bridge/agents/*/email-config', '/api/settings/email', '/api/email/*'],
  database:      ['/api/database-access', '/api/database-access/*', '/api/database/connections', '/api/database/connections/*'],
  vault:         ['/api/vault', '/api/vault/*'],
  integrations:  ['/api/org-integrations', '/api/org-integrations/*', '/api/organizations/*/integrations'],
  skills:        ['/api/skills/*', '/community/*'],
  organizations: ['/api/organizations', '/api/organizations/*'],
  knowledge:     ['/api/knowledge-bases', '/api/knowledge-bases/*', '/knowledge/*'],
  tasks:         ['/api/tasks', '/api/tasks/*', '/task-pipeline/*'],
  workforce:     ['/api/workforce', '/api/workforce/*'],
  messages:      ['/api/messages', '/api/messages/*', '/bridge/agents/*/whatsapp', '/bridge/agents/*/telegram'],
  guardrails:    ['/guardrails/*', '/dlp/*'],
  journal:       ['/activity/*', '/api/journal/*'],
  approvals:     ['/approvals/*'],
  compliance:    ['/api/compliance/*', '/api/audit/*', '/api/events/*'],
  domain:        ['/api/domain/*'],
  roles:         ['/api/roles', '/api/roles/*', '/profiles/*'],
  memory:        ['/api/memory/*', '/api/memory-transfer/*'],
  dashboard:     ['/api/dashboard/*', '/api/overview/*'],
};

/** Build effective endpoint patterns from config */
function buildActivePatterns(config: TransportEncryptionConfig): string[] {
  // Legacy: if sensitiveEndpoints is set directly, use those
  if (config.sensitiveEndpoints?.length) return config.sensitiveEndpoints;

  // encryptAll: ALL API endpoints, not just listed groups
  if (config.encryptAll) {
    const all: string[] = ['/api/*', '/auth/*'];
    if (config.customEndpoints?.length) all.push(...config.customEndpoints);
    return all;
  }

  // Selective: only enabled groups + custom
  const patterns: string[] = [];
  const groups = config.enabledGroups || {};
  for (const [id, paths] of Object.entries(ENDPOINT_GROUPS)) {
    if (groups[id]) patterns.push(...paths);
  }
  if (config.customEndpoints?.length) patterns.push(...config.customEndpoints);
  return patterns;
}

// Backwards-compat export
const DEFAULT_SENSITIVE_ENDPOINTS = Object.values(ENDPOINT_GROUPS).flat();

// ─── Key derivation ───────────────────────────────────────

let _derivedKey: Buffer | null = null;
let _hmacKey: Buffer | null = null;

function deriveKeys(configKey?: string): { encKey: Buffer; hmacKey: Buffer } {
  if (_derivedKey && _hmacKey) return { encKey: _derivedKey, hmacKey: _hmacKey };

  const baseKey = configKey || process.env.TRANSPORT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'agenticmail-transport-default-key';
  const salt = 'agenticmail-transport-v1';

  // First compute keyToken (same as /client-key endpoint sends to the browser)
  const keyToken = createHash('sha256').update(`${baseKey}:${salt}`).digest('hex');
  // Then derive enc/hmac keys from keyToken (matches client-side derivation)
  _derivedKey = createHash('sha256').update(`${keyToken}:${salt}:enc`).digest();
  _hmacKey = createHash('sha256').update(`${keyToken}:${salt}:hmac`).digest();

  return { encKey: _derivedKey, hmacKey: _hmacKey };
}

/** Reset cached keys (call when config changes) */
export function resetKeys(): void {
  _derivedKey = null;
  _hmacKey = null;
}

// ─── Encrypt / Decrypt ────────────────────────────────────

export function encryptPayload(data: any, configKey?: string): string {
  const { encKey, hmacKey } = deriveKeys(configKey);
  const iv = randomBytes(16);
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

  const cipher = createCipheriv('aes-256-cbc', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const checksum = createHash('sha256').update(plaintext).digest('hex').slice(0, 16);
  const ts = Date.now();

  // Build payload without sig for signing
  const payloadForSig = `${iv.toString('hex')}:${encrypted.toString('base64')}:${ts}:${checksum}`;
  const sig = createHmac('sha256', hmacKey).update(payloadForSig).digest('hex').slice(0, 32);

  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString('hex'),
    d: encrypted.toString('base64'),
    ts,
    cs: checksum,
    sig,
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decryptPayload(encoded: string, configKey?: string, maxAgeMs = 300_000): any {
  const { encKey, hmacKey } = deriveKeys(configKey);

  // Decode base64 wrapper
  const json = Buffer.from(encoded, 'base64').toString('utf8');
  const payload: EncryptedPayload = JSON.parse(json);

  if (payload.v !== 1) throw new Error('Unsupported encryption version');

  // Verify timestamp (replay protection)
  if (maxAgeMs > 0 && Math.abs(Date.now() - payload.ts) > maxAgeMs) {
    throw new Error('Encrypted payload expired or clock skew too large');
  }

  // Verify HMAC signature
  const payloadForSig = `${payload.iv}:${payload.d}:${payload.ts}:${payload.cs}`;
  const expectedSig = createHmac('sha256', hmacKey).update(payloadForSig).digest('hex').slice(0, 32);
  if (payload.sig !== expectedSig) {
    throw new Error('Invalid signature — payload tampered');
  }

  // Decrypt
  const iv = Buffer.from(payload.iv, 'hex');
  const ciphertext = Buffer.from(payload.d, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', encKey, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

  // Verify checksum
  const checksum = createHash('sha256').update(decrypted).digest('hex').slice(0, 16);
  if (checksum !== payload.cs) {
    throw new Error('Data integrity check failed');
  }

  try { return JSON.parse(decrypted); } catch { return decrypted; }
}

// ─── Endpoint matching ────────────────────────────────────

function matchesEndpoint(path: string, patterns: string[]): boolean {
  const normalized = path.split('?')[0]; // Strip query string
  for (const pattern of patterns) {
    // Convert glob pattern to regex: * matches one path segment
    const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]+') + '(/.*)?$');
    if (regex.test(normalized)) return true;
    // Also match engine-prefixed paths: /api/engine/bridge/* should match /bridge/*
    if (normalized.startsWith('/api/engine') && regex.test(normalized.replace('/api/engine', ''))) return true;
    // Also match /api prefix: /api/settings should match /api/settings
    if (!normalized.startsWith('/api') && regex.test('/api' + normalized)) return true;
  }
  return false;
}

// ─── Hono Middleware ──────────────────────────────────────

let _config: TransportEncryptionConfig = { enabled: false };
let _settingsDb: any = null;

/** Update config at runtime (called from settings save) */
export function setTransportEncryptionConfig(config: Partial<TransportEncryptionConfig>): void {
  _config = { ..._config, ...config };
  if (config.key) resetKeys();
}

/** Set the settings DB for loading config on startup */
export function setSettingsDb(db: any): void {
  _settingsDb = db;
}

/** Load config from settings DB */
export async function loadConfig(): Promise<void> {
  if (!_settingsDb) return;
  try {
    const settings = await _settingsDb.getSettings();
    const tc = settings?.securityConfig?.transportEncryption || settings?.transportEncryption;
    if (tc) {
      _config = {
        enabled: tc.enabled ?? false,
        encryptAll: tc.encryptAll ?? false,
        enabledGroups: tc.enabledGroups || {},
        customEndpoints: tc.customEndpoints || [],
        key: tc.key || undefined,
        maxAgeMs: tc.maxAgeMs || 300_000,
        sensitiveEndpoints: tc.sensitiveEndpoints,
        debugLog: tc.debugLog || false,
      };
      if (tc.key) resetKeys();
    }
  } catch { /* settings table may not exist yet */ }
}

/** Get current config (for settings page) */
export function getConfig(): TransportEncryptionConfig & { sensitiveEndpoints: string[]; availableGroups: string[] } {
  return {
    ..._config,
    key: _config.key ? '********' : undefined, // Never expose the key
    sensitiveEndpoints: buildActivePatterns(_config),
    availableGroups: Object.keys(ENDPOINT_GROUPS),
  };
}

/**
 * Hono middleware: encrypts responses and decrypts requests for sensitive endpoints.
 *
 * Request flow:
 *   Client sends { _enc: "<base64>" } → middleware decrypts → handler sees plain JSON
 *
 * Response flow:
 *   Handler returns JSON → middleware encrypts → client receives { _enc: "<base64>" }
 */
export function transportEncryptionMiddleware() {
  return async (c: any, next: () => Promise<void>) => {
    if (!_config.enabled) {
      await next();
      return;
    }

    // Use full URL path for matching — c.req.path may be relative on sub-routers
    const fullUrl = c.req.url || '';
    const path = fullUrl.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || c.req.path;
    const endpoints = buildActivePatterns(_config);

    if (endpoints.length === 0 || !matchesEndpoint(path, endpoints)) {
      await next();
      return;
    }

    // Skip internal server-to-server calls (no encryption header = not from dashboard)
    const hasEncHeader = c.req.header('x-transport-encryption') === '1';
    if (!hasEncHeader) {
      await next();
      return;
    }

    // ─── Decrypt incoming request body ───
    const method = c.req.method;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        const contentType = c.req.header('content-type') || '';
        if (contentType.includes('application/json')) {
          const body = await c.req.json();
          // Always store the parsed body first (json() consumes the stream)
          (c as any)._decryptedBody = body;
          if (body && body._enc && typeof body._enc === 'string') {
            try {
              const decrypted = decryptPayload(body._enc, _config.key, _config.maxAgeMs || 300_000);
              (c as any)._decryptedBody = decrypted;
            } catch (decErr: any) {
              if (_config.debugLog) console.warn('[transport-encryption] Decrypt failed:', decErr.message);
              // Keep the raw body as fallback (graceful degradation)
            }
          }
          // Override c.req.json() so downstream handlers can read the body
          c.req.json = async () => (c as any)._decryptedBody;
        }
      } catch (e: any) {
        if (_config.debugLog) console.warn('[transport-encryption] Body parse failed:', e.message);
        // Don't fail — body might not be JSON
      }
    }

    // Mark that this response should be encrypted
    (c as any)._shouldEncryptResponse = true;

    await next();

    // ─── Encrypt outgoing response ───
    if ((c as any)._shouldEncryptResponse) {
      // Only encrypt if client explicitly supports it
      const clientSupports = c.req.header('x-transport-encryption') === '1';
      if (!clientSupports) return;

      try {
        const response = c.res;
        // Skip if already encrypted (prevent double encryption)
        if (response.headers.get('x-transport-encrypted') === '1') return;
        const resContentType = response.headers.get('content-type') || '';

        // Only encrypt JSON responses (skip SSE, streams, etc.)
        if (!resContentType.includes('application/json')) return;
        if (!response.body || response.bodyUsed) return;

        // Read body text safely
        let originalBody: string;
        try {
          originalBody = await response.text();
        } catch {
          return; // Body not readable — skip
        }

        let jsonData: any;
        try { jsonData = JSON.parse(originalBody); } catch { 
          // Not valid JSON — send original as plaintext
          c.res = new Response(originalBody, {
            status: response.status,
            headers: response.headers,
          });
          return; 
        }

        const encrypted = encryptPayload(jsonData, _config.key);

        // Preserve original headers and add encryption marker
        const newHeaders = new Headers(response.headers);
        newHeaders.set('content-type', 'application/json');
        newHeaders.set('x-transport-encrypted', '1');

        c.res = new Response(JSON.stringify({ _enc: encrypted }), {
          status: response.status,
          headers: newHeaders,
        });
      } catch (e: any) {
        // Encryption failed — reconstruct plaintext response from parsed data
        if (originalBody) {
          c.res = new Response(originalBody, { status: response.status, headers: response.headers });
        }
      }
    }
  };
}

export { DEFAULT_SENSITIVE_ENDPOINTS };
