/**
 * Transport Encryption — Dashboard Client
 *
 * Encrypts outgoing requests and decrypts incoming responses
 * for sensitive API endpoints. Uses Web Crypto API (AES-256-CBC).
 *
 * Must use the same key derivation as the server middleware.
 */

// ─── State ────────────────────────────────────────────────

var _enabled = false;
var _encKey = null;   // CryptoKey for AES
var _hmacKey = null;  // CryptoKey for HMAC
var _keyReady = false;
var _keyReadyPromise = null;  // Resolves when keys are derived
var _keyReadyResolve = null;

// ─── Key derivation (must match server) ───────────────────

async function sha256(input) {
  var data = new TextEncoder().encode(input);
  var hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

async function deriveKeys() {
  if (_keyReady) return;

  // Fetch the encryption config from server — use XMLHttpRequest to bypass
  // the fetch interceptor (we can't encrypt/decrypt without keys yet)
  var resp = await new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/engine/transport-encryption/client-key');
    xhr.withCredentials = true;
    xhr.onload = function() { resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: function() { return Promise.resolve(JSON.parse(xhr.responseText)); } }); };
    xhr.onerror = function() { reject(new Error('XHR failed')); };
    xhr.send();
  });
  if (!resp.ok) { _enabled = false; return; }
  var cfg = await resp.json();
  if (!cfg.keyToken) { _enabled = false; return; }

  var salt = 'agenticmail-transport-v1';
  var encRaw = await sha256(cfg.keyToken + ':' + salt + ':enc');
  var hmacRaw = await sha256(cfg.keyToken + ':' + salt + ':hmac');

  _encKey = await crypto.subtle.importKey('raw', encRaw, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  _hmacKey = await crypto.subtle.importKey('raw', hmacRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  _keyReady = true;
}

// ─── Helpers ──────────────────────────────────────────────

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function hexToBuf(hex) {
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

function bufToBase64(buf) {
  var bytes = new Uint8Array(buf);
  var str = '';
  for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function base64ToBuf(b64) {
  var str = atob(b64);
  var bytes = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function sha256Hex(input) {
  var hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bufToHex(hash);
}

async function hmacSign(data) {
  var sig = await crypto.subtle.sign('HMAC', _hmacKey, new TextEncoder().encode(data));
  return bufToHex(sig).slice(0, 32);
}

// ─── Encrypt / Decrypt ────────────────────────────────────

export async function encryptPayload(data) {
  if (!_keyReady) await deriveKeys();
  if (!_keyReady) return null; // Encryption not available

  var plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  var iv = crypto.getRandomValues(new Uint8Array(16));
  var encoded = new TextEncoder().encode(plaintext);

  var ciphertext = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv }, _encKey, encoded);
  var cs = (await sha256Hex(plaintext)).slice(0, 16);
  var ts = Date.now();
  var ivHex = bufToHex(iv);
  var dataB64 = bufToBase64(ciphertext);

  var sigInput = ivHex + ':' + dataB64 + ':' + ts + ':' + cs;
  var sig = await hmacSign(sigInput);

  var payload = { v: 1, iv: ivHex, d: dataB64, ts: ts, cs: cs, sig: sig };
  return btoa(JSON.stringify(payload));
}

export async function decryptPayload(encoded) {
  if (!_keyReady) await deriveKeys();
  if (!_keyReady) throw new Error('Encryption keys not available');

  var json = atob(encoded);
  var payload = JSON.parse(json);
  if (payload.v !== 1) throw new Error('Unsupported encryption version');

  // Verify HMAC
  var sigInput = payload.iv + ':' + payload.d + ':' + payload.ts + ':' + payload.cs;
  var expectedSig = await hmacSign(sigInput);
  if (payload.sig !== expectedSig) throw new Error('Invalid signature');

  // Decrypt
  var iv = hexToBuf(payload.iv);
  var ciphertext = base64ToBuf(payload.d);
  var decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, _encKey, ciphertext);
  var plaintext = new TextDecoder().decode(decrypted);

  // Verify checksum
  var cs = (await sha256Hex(plaintext)).slice(0, 16);
  if (cs !== payload.cs) throw new Error('Data integrity check failed');

  try { return JSON.parse(plaintext); } catch(e) { return plaintext; }
}

// ─── Fetch interceptor ────────────────────────────────────

var _sensitivePatterns = [];

// Endpoint groups (must match server ENDPOINT_GROUPS)
var ENDPOINT_GROUPS = {
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

function buildPatterns(config) {
  if (config.encryptAll) {
    // Encrypt all API/auth calls (server NEVER_ENCRYPT list handles exclusions)
    var all = ['/api/*', '/auth/*'];
    if (config.customEndpoints) all = all.concat(config.customEndpoints);
    return all;
  }
  var patterns = [];
  var groups = config.enabledGroups || {};
  Object.keys(ENDPOINT_GROUPS).forEach(function(k) {
    if (groups[k]) patterns = patterns.concat(ENDPOINT_GROUPS[k]);
  });
  if (config.customEndpoints) patterns = patterns.concat(config.customEndpoints);
  return patterns;
}

export function setConfig(config) {
  _enabled = config.enabled || false;
  var patterns = buildPatterns(config);
  _sensitivePatterns = patterns.map(function(p) {
    return new RegExp('^' + p.replace(/\*/g, '[^/]+') + '(/.*)?$');
  });
  if (_enabled && !_keyReady) {
    // Create a promise that apiCall can await
    _keyReadyPromise = new Promise(function(resolve) { _keyReadyResolve = resolve; });
    deriveKeys().then(function() {
      if (_keyReadyResolve) _keyReadyResolve();
    }).catch(function() { _enabled = false; if (_keyReadyResolve) _keyReadyResolve(); });
  }
}

function isSensitive(url) {
  var path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  for (var i = 0; i < _sensitivePatterns.length; i++) {
    if (_sensitivePatterns[i].test(path)) return true;
  }
  return false;
}

/**
 * Wrap fetch calls to auto-encrypt/decrypt sensitive endpoints.
 * Call this once at app startup.
 */
export function installFetchInterceptor() {
  // No-op — encryption is now handled directly in apiCall
}

export function isEnabled() { return _enabled; }
export function isReady() { return _keyReady; }

// Expose for apiCall integration (avoids fetch interceptor timing issues)
window.__transportEncryption = {
  isEnabled: function() { return _enabled; },
  isReady: function() { return _enabled && _keyReady; },
  isSensitive: isSensitive,
  encryptPayload: encryptPayload,
  decryptPayload: decryptPayload,
  waitForReady: function() { return _keyReadyPromise || Promise.resolve(); },
};
