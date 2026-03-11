/**
 * Polymarket Runtime — SDK Management, DB Persistence, Account Creation
 * 
 * Handles:
 * - Auto-installing @polymarket/clob-client + ethers on first use
 * - Persisting all config, trades, alerts, positions to enterprise DB
 * - Wallet credential storage in DB (encrypted by vault)
 * - Browser-based Polymarket account creation
 * - CLOB client lifecycle management
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SecureVault } from '../../engine/vault.js';

let _vaultInstance: SecureVault | null = null;
function getVaultInstance(): SecureVault | null {
  if (_vaultInstance) return _vaultInstance;
  try { _vaultInstance = new SecureVault(); return _vaultInstance; }
  catch { return null; } // No VAULT_KEY configured
}

// ─── CLOB Proxy — SSH SOCKS Tunnel ───────────────────────────

import { spawn, ChildProcess } from 'child_process';

const CLOB_URL = 'https://clob.polymarket.com';

interface ProxyConfig {
  enabled: boolean;
  proxyMode: 'http' | 'ssh';
  // HTTP proxy mode
  proxyUrl?: string;
  proxyToken?: string;
  // SSH tunnel mode
  vpsHost: string;
  vpsUser: string;
  vpsPort: number;
  socksPort: number;
  authMethod: 'key' | 'password';
  sshKeyPath?: string;
  sshKeyContent?: string;  // pasted key content (stored encrypted)
  password?: string;
}

interface ProxyState {
  connected: boolean;
  pid: number | null;
  socksPort: number;
  startedAt: string | null;
  error: string | null;
  mode?: string;
  proxyUrl?: string;
}

let _sshProcess: ChildProcess | null = null;
let _proxyState: ProxyState = { connected: false, pid: null, socksPort: 0, startedAt: null, error: null };
let _proxyConfig: ProxyConfig | null = null;

/** Load proxy config from DB */
export async function loadProxyConfig(db: any): Promise<ProxyConfig | null> {
  if (_proxyConfig) return _proxyConfig;
  try {
    const row = await db?.get?.(`SELECT * FROM poly_proxy_config WHERE id = 1`);
    if (!row || !row.enabled) return null;
    const vault = getVaultInstance();
    _proxyConfig = {
      enabled: !!row.enabled,
      proxyMode: row.proxy_mode || 'ssh',
      proxyUrl: row.proxy_url || undefined,
      proxyToken: row.encrypted_proxy_token && vault ? vault.decrypt(row.encrypted_proxy_token) : undefined,
      vpsHost: row.vps_host || '',
      vpsUser: row.vps_user || 'root',
      vpsPort: row.vps_port || 22,
      socksPort: row.socks_port || 1080,
      authMethod: row.auth_method || 'password',
      sshKeyPath: row.ssh_key_path || undefined,
      sshKeyContent: row.encrypted_ssh_key && vault ? vault.decrypt(row.encrypted_ssh_key) : undefined,
      password: row.encrypted_password && vault ? vault.decrypt(row.encrypted_password) : undefined,
    };
    return _proxyConfig;
  } catch { return null; }
}

/** Save proxy config to DB */
export async function saveProxyConfig(db: any, config: Partial<ProxyConfig> & { enabled: boolean }): Promise<void> {
  const vault = getVaultInstance();
  const encPassword = config.password && vault ? vault.encrypt(config.password) : null;
  const encProxyToken = config.proxyToken && vault ? vault.encrypt(config.proxyToken) : null;
  const encSshKey = config.sshKeyContent && vault ? vault.encrypt(config.sshKeyContent) : null;
  await db?.run?.(`
    INSERT INTO poly_proxy_config (id, enabled, proxy_mode, proxy_url, encrypted_proxy_token, vps_host, vps_user, vps_port, socks_port, auth_method, ssh_key_path, encrypted_ssh_key, encrypted_password, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON CONFLICT (id) DO UPDATE SET
      enabled = EXCLUDED.enabled, proxy_mode = EXCLUDED.proxy_mode, proxy_url = EXCLUDED.proxy_url,
      encrypted_proxy_token = EXCLUDED.encrypted_proxy_token, vps_host = EXCLUDED.vps_host,
      vps_user = EXCLUDED.vps_user, vps_port = EXCLUDED.vps_port, socks_port = EXCLUDED.socks_port,
      auth_method = EXCLUDED.auth_method, ssh_key_path = EXCLUDED.ssh_key_path,
      encrypted_ssh_key = EXCLUDED.encrypted_ssh_key, encrypted_password = EXCLUDED.encrypted_password,
      updated_at = NOW()
  `, [
    config.enabled ? 1 : 0, config.proxyMode || 'http',
    config.proxyUrl || null, encProxyToken,
    config.vpsHost || null, config.vpsUser || 'root',
    config.vpsPort || 22, config.socksPort || 1080,
    config.authMethod || 'password', config.sshKeyPath || null,
    encSshKey, encPassword,
  ]);
  _proxyConfig = null; // bust cache
}

/** Start proxy connection */
export async function startProxy(db: any): Promise<ProxyState> {
  if (_sshProcess && _proxyState.connected) return _proxyState;
  if (_proxyState.connected && _proxyConfig?.proxyMode === 'http') return _proxyState;

  const config = await loadProxyConfig(db);
  if (!config || !config.enabled) {
    return { connected: false, pid: null, socksPort: 0, startedAt: null, error: 'Proxy not configured or disabled' };
  }

  // Kill existing if any
  await stopProxy();

  // HTTP proxy mode — just verify it's reachable
  if (config.proxyMode === 'http' && config.proxyUrl) {
    try {
      const headers: Record<string, string> = {};
      if (config.proxyToken) headers['x-proxy-token'] = config.proxyToken;
      const res = await fetch(config.proxyUrl.replace(/\/$/, '') + '/_health', { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Health check returned ${res.status}`);
      _proxyState = { connected: true, pid: null, socksPort: 0, startedAt: new Date().toISOString(), error: null, mode: 'http', proxyUrl: config.proxyUrl };
      // Clear cached CLOB clients so they reconnect through proxy
      clientInstances.clear();
      // Hook proxy into shared apiFetch so all CLOB API calls (counterintel, etc.) route through proxy
      try {
        const { setProxyFetchHook } = await import('../../polymarket-engines/shared.js');
        const proxyHeaders: Record<string, string> = { Accept: 'application/json' };
        if (config.proxyToken) proxyHeaders['x-proxy-token'] = config.proxyToken;
        const proxyBase = config.proxyUrl.replace(/\/$/, '');
        setProxyFetchHook(async (url: string, opts?: any) => {
          // Rewrite clob.polymarket.com URLs to go through proxy
          const rewritten = url.replace('https://clob.polymarket.com', proxyBase);
          return fetch(rewritten, { ...opts, headers: { ...opts?.headers, ...proxyHeaders } });
        });
        console.log(`[polymarket-proxy] Proxy fetch hook installed — CLOB reads also routed through proxy`);
      } catch {}
      console.log(`[polymarket-proxy] HTTP proxy connected: ${config.proxyUrl} — CLOB orders will route through proxy`);
      return _proxyState;
    } catch (err: any) {
      _proxyState = { connected: false, pid: null, socksPort: 0, startedAt: null, error: `Cannot reach proxy: ${err.message}` };
      return _proxyState;
    }
  }

  // SSH tunnel mode
  const args = [
    '-D', String(config.socksPort),
    '-N',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ConnectTimeout=10',
    '-p', String(config.vpsPort),
  ];

  // Handle SSH key: content (pasted) or path
  let tmpKeyFile: string | null = null;
  if (config.authMethod === 'key') {
    if (config.sshKeyContent) {
      // Write pasted key to temp file
      const { writeFileSync, chmodSync } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      tmpKeyFile = join(tmpdir(), `.poly_ssh_key_${Date.now()}`);
      writeFileSync(tmpKeyFile, config.sshKeyContent + '\n', { mode: 0o600 });
      chmodSync(tmpKeyFile, 0o600);
      args.push('-i', tmpKeyFile);
    } else if (config.sshKeyPath) {
      args.push('-i', config.sshKeyPath);
    }
  }

  args.push(`${config.vpsUser}@${config.vpsHost}`);

  try {
    const sshEnv: Record<string, string> = { ...process.env as any };
    if (config.authMethod === 'password' && config.password) {
      const proc = spawn('sshpass', ['-p', config.password, 'ssh', ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: sshEnv,
        detached: true,
      });
      _sshProcess = proc;
    } else {
      const proc = spawn('ssh', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: sshEnv,
        detached: true,
      });
      _sshProcess = proc;
    }

    // Wait a moment to check if it connected
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (_sshProcess.exitCode !== null) {
      const err = `SSH tunnel exited immediately with code ${_sshProcess.exitCode}`;
      _proxyState = { connected: false, pid: null, socksPort: config.socksPort, startedAt: null, error: err };
      _sshProcess = null;
      return _proxyState;
    }

    _sshProcess.on('exit', (code) => {
      console.log(`[polymarket-proxy] SSH tunnel exited with code ${code}`);
      _proxyState = { connected: false, pid: null, socksPort: config.socksPort, startedAt: null, error: `Tunnel exited (code ${code})` };
      _sshProcess = null;
    });

    _sshProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[polymarket-proxy] SSH: ${msg}`);
    });

    _proxyState = {
      connected: true,
      pid: _sshProcess.pid || null,
      socksPort: config.socksPort,
      startedAt: new Date().toISOString(),
      error: null,
    };

    console.log(`[polymarket-proxy] SSH SOCKS tunnel started on localhost:${config.socksPort} via ${config.vpsUser}@${config.vpsHost} (pid: ${_sshProcess.pid})`);
    return _proxyState;
  } catch (err: any) {
    _proxyState = { connected: false, pid: null, socksPort: config.socksPort, startedAt: null, error: err.message };
    return _proxyState;
  }
}

/** Stop SSH tunnel */
export async function stopProxy(): Promise<void> {
  if (_sshProcess) {
    try { _sshProcess.kill('SIGTERM'); } catch {}
    _sshProcess = null;
  }
  _proxyState = { connected: false, pid: null, socksPort: 0, startedAt: null, error: null };
}

/** Get proxy state */
export function getProxyState(): ProxyState {
  // Verify process is still alive
  if (_proxyState.connected && _sshProcess) {
    try { process.kill(_sshProcess.pid!, 0); } catch {
      _proxyState = { connected: false, pid: null, socksPort: _proxyState.socksPort, startedAt: null, error: 'Tunnel process died' };
      _sshProcess = null;
    }
  }
  return { ..._proxyState };
}

/** Check if proxy is enabled and connected */
export function isProxyEnabled(): boolean {
  return _proxyState.connected;
}

/** Auto-reconnect HTTP proxy on startup / after restart */
let _autoConnectAttempted = false;
export async function autoConnectProxy(db: any): Promise<void> {
  if (_autoConnectAttempted || _proxyState.connected) return;
  _autoConnectAttempted = true;
  try {
    const config = await loadProxyConfig(db);
    if (!config?.enabled || config.proxyMode !== 'http' || !config.proxyUrl) return;
    const headers: Record<string, string> = {};
    if (config.proxyToken) headers['x-proxy-token'] = config.proxyToken;
    const res = await fetch(config.proxyUrl.replace(/\/$/, '') + '/_health', { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      _proxyState = { connected: true, pid: null, socksPort: 0, startedAt: new Date().toISOString(), error: null, mode: 'http', proxyUrl: config.proxyUrl };
      _proxyConfig = null; // bust cache so loadProxyConfig re-reads
      clientInstances.clear(); // clear any cached clients so they use proxy URL
      console.log(`[polymarket-proxy] Auto-connected HTTP proxy: ${config.proxyUrl} — getClobUrl() will now return proxy URL`);
    }
  } catch {}
}

// ── Embedded proxy server script ──
const PROXY_SERVER_SCRIPT = `
const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 8787;
const TARGET = "https://clob.polymarket.com";
const AUTH_TOKEN = process.env.PROXY_TOKEN || "";
const ALLOWED_IPS = (process.env.ALLOWED_IPS || "").split(",").map(s => s.trim()).filter(Boolean);

console.log("[proxy] Polymarket CLOB Proxy");
console.log("[proxy] Target: " + TARGET);

function getClientIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress?.replace("::ffff:", "") || "";
}

const server = http.createServer((req, res) => {
  const clientIP = getClientIP(req);
  const token = req.headers["x-proxy-token"];
  const ipAllowed = ALLOWED_IPS.length === 0 || ALLOWED_IPS.includes(clientIP);
  const tokenValid = AUTH_TOKEN && token === AUTH_TOKEN;
  if (!ipAllowed && !tokenValid) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }
  if (req.url === "/_health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", target: TARGET, ts: Date.now() }));
    return;
  }
  const targetUrl = new URL(req.url, TARGET);
  const headers = { ...req.headers };
  delete headers["x-proxy-token"];
  delete headers["host"];
  headers["host"] = "clob.polymarket.com";
  const options = { hostname: targetUrl.hostname, port: 443, path: targetUrl.pathname + targetUrl.search, method: req.method, headers };
  const proxyReq = https.request(options, (proxyRes) => { res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res); });
  proxyReq.on("error", (err) => { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); });
  req.pipe(proxyReq);
});
server.listen(PORT, "0.0.0.0", () => console.log("[proxy] Listening on 0.0.0.0:" + PORT));
`.trim();

/** Auto-deploy proxy to a VPS via SSH (cross-platform: uses ssh2 Node.js library) */
export async function deployProxyToVPS(opts: {
  host: string;
  user?: string;
  password?: string;
  sshKeyPath?: string;
  sshKeyContent?: string;
  port?: number;
}): Promise<{ success: boolean; proxyUrl: string; proxyToken: string; error?: string; logs: string[] }> {
  const { randomBytes } = await import('crypto');
  const { readFileSync } = await import('fs');

  const logs: string[] = [];
  const user = opts.user || 'root';
  const sshPort = opts.port || 22;
  const token = randomBytes(16).toString('hex');
  const proxyUrl = `http://${opts.host}:8787`;

  // Build SSH connection config
  let sshConfig: any = {
    host: opts.host,
    port: sshPort,
    username: user,
    readyTimeout: 20000,
    // Accept any host key (like StrictHostKeyChecking=accept-new)
    algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'] },
  };

  if (opts.password) {
    sshConfig.password = opts.password;
  } else if (opts.sshKeyContent) {
    sshConfig.privateKey = opts.sshKeyContent;
  } else if (opts.sshKeyPath) {
    try {
      const keyPath = opts.sshKeyPath.replace(/^~/, process.env.HOME || '/root');
      sshConfig.privateKey = readFileSync(keyPath, 'utf-8');
    } catch (e: any) {
      return { success: false, proxyUrl: '', proxyToken: '', error: 'Cannot read SSH key file: ' + opts.sshKeyPath, logs };
    }
  }

  // Helper: run command over SSH and return stdout
  function runSSH(conn: any, cmd: string, timeoutMs = 120000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Command timed out')), timeoutMs);
      conn.exec(cmd, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); return reject(err); }
        let stdout = '';
        let stderr = '';
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number) => {
          clearTimeout(timer);
          if (code !== 0 && code !== null) {
            const e: any = new Error(stderr.trim() || `Command failed with code ${code}`);
            e.stderr = stderr;
            e.code = code;
            reject(e);
          } else {
            resolve(stdout.trim());
          }
        });
      });
    });
  }

  let conn: any;
  try {
    const { Client } = await import('ssh2');

    // 1. Connect
    logs.push('Connecting to server...');
    conn = new Client();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out — check the IP address')), 20000);
      conn.on('ready', () => { clearTimeout(timer); resolve(); });
      conn.on('error', (err: any) => {
        clearTimeout(timer);
        if (err.level === 'client-authentication') {
          reject(new Error('Login failed — check your password or key'));
        } else if (err.code === 'ECONNREFUSED') {
          reject(new Error('Connection refused — check the IP address and make sure SSH is enabled'));
        } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
          reject(new Error('Cannot reach server — check the IP address'));
        } else {
          reject(new Error(err.message || 'Connection failed'));
        }
      });
      conn.connect(sshConfig);
    });
    logs.push('Connected successfully');

    // 2. Detect OS
    logs.push('Detecting server type...');
    let osType = 'linux';
    try {
      const uname = await runSSH(conn, 'uname -s');
      osType = uname.toLowerCase().includes('linux') ? 'linux' : uname.toLowerCase();
      const osInfo = await runSSH(conn, 'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'  || uname -a');
      logs.push('Server: ' + osInfo);
    } catch { logs.push('Server: Linux'); }

    // Detect architecture (for ARM like Raspberry Pi)
    let arch = 'x64';
    try {
      const archStr = await runSSH(conn, 'uname -m');
      if (archStr.includes('arm') || archStr.includes('aarch64')) arch = 'arm';
      if (arch === 'arm') logs.push('ARM architecture detected (Raspberry Pi or similar)');
    } catch {}

    // 3. Check/install Node.js
    logs.push('Checking for Node.js...');
    let hasNode = false;
    try {
      const ver = await runSSH(conn, 'node --version 2>/dev/null || echo "none"');
      hasNode = ver.startsWith('v');
      if (hasNode) logs.push('Node.js ' + ver + ' found');
    } catch { hasNode = false; }

    if (!hasNode) {
      logs.push('Installing Node.js (this may take 1-2 minutes)...');
      try {
        // Try multiple install methods for different distros
        const installCmd = [
          // Try nodesource (Ubuntu/Debian)
          '(curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs) 2>/dev/null',
          // Fallback: try dnf/yum (RHEL/Fedora/Amazon Linux)
          '|| (curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && (dnf install -y nodejs || yum install -y nodejs)) 2>/dev/null',
          // Fallback: try apk (Alpine)
          '|| (apk add --no-cache nodejs npm) 2>/dev/null',
          // Last resort: download binary
          '|| (curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-' + (arch === 'arm' ? 'arm64' : 'x64') + '.tar.xz | tar -xJ -C /usr/local --strip-components=1) 2>/dev/null',
        ].join(' ');
        await runSSH(conn, installCmd, 180000);

        // Verify
        const ver = await runSSH(conn, 'node --version');
        logs.push('Node.js ' + ver + ' installed');
      } catch (e: any) {
        return { success: false, proxyUrl: '', proxyToken: '', error: 'Failed to install Node.js. You may need to install it manually on this server.', logs };
      }
    }

    // 4. Install PM2
    logs.push('Setting up process manager...');
    try {
      await runSSH(conn, 'which pm2 >/dev/null 2>&1 || npm install -g pm2', 60000);
      logs.push('Process manager ready');
    } catch {
      return { success: false, proxyUrl: '', proxyToken: '', error: 'Failed to install process manager (PM2)', logs };
    }

    // 5. Deploy proxy script
    logs.push('Deploying proxy...');
    try {
      await runSSH(conn, 'mkdir -p /opt/polymarket-proxy');
      // Write script via heredoc
      await runSSH(conn, `cat > /opt/polymarket-proxy/server.js << 'PROXYEOF'\n${PROXY_SERVER_SCRIPT}\nPROXYEOF`);
      logs.push('Proxy deployed');
    } catch {
      return { success: false, proxyUrl: '', proxyToken: '', error: 'Failed to deploy proxy to server', logs };
    }

    // 6. Configure firewall
    logs.push('Configuring firewall...');
    try {
      await runSSH(conn, '(which ufw >/dev/null 2>&1 && ufw allow 22/tcp >/dev/null 2>&1 && ufw allow 8787/tcp >/dev/null 2>&1 && echo "y" | ufw enable >/dev/null 2>&1) || (which firewall-cmd >/dev/null 2>&1 && firewall-cmd --permanent --add-port=8787/tcp && firewall-cmd --reload) || true');
      logs.push('Firewall configured');
    } catch { logs.push('Firewall: skipped (not available)'); }

    // 7. Start with PM2
    logs.push('Starting proxy...');
    try {
      await runSSH(conn, `cd /opt/polymarket-proxy && pm2 delete polymarket-proxy >/dev/null 2>&1; PORT=8787 PROXY_TOKEN=${token} pm2 start server.js --name polymarket-proxy && pm2 save && (pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true)`);
      logs.push('Proxy running on port 8787');
    } catch {
      return { success: false, proxyUrl: '', proxyToken: '', error: 'Failed to start proxy on server', logs };
    }

    // Done with SSH
    conn.end();
    conn = null;

    // 8. Verify health from this machine
    logs.push('Verifying proxy is reachable...');
    await new Promise(r => setTimeout(r, 2500));
    try {
      const res = await fetch(proxyUrl + '/_health', {
        headers: { 'x-proxy-token': token },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('Status ' + res.status);
      logs.push('Proxy verified and working!');
    } catch {
      logs.push('Warning: Could not verify proxy yet (it may still be starting). Try connecting in a moment.');
    }

    return { success: true, proxyUrl, proxyToken: token, logs };
  } catch (e: any) {
    return { success: false, proxyUrl: '', proxyToken: '', error: e.message || 'Unknown error', logs };
  } finally {
    if (conn) try { conn.end(); } catch {}
  }
}

/** Get the CLOB URL (always direct — proxy is at transport layer) */
export function getClobUrl(): string {
  // Use proxy URL for order routing if HTTP proxy is connected
  if (_proxyState.connected && _proxyState.mode === 'http' && _proxyState.proxyUrl) {
    return _proxyState.proxyUrl.replace(/\/$/, '');
  }
  return CLOB_URL;
}

/** Get SOCKS agent for axios/fetch if proxy is active */
export async function getSocksAgent(): Promise<any | null> {
  if (!_proxyState.connected) return null;
  try {
    // Dynamic import to avoid hard dependency
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    return new SocksProxyAgent(`socks5://127.0.0.1:${_proxyState.socksPort}`);
  } catch {
    return null;
  }
}

// ─── SDK Auto-Install ────────────────────────────────────────

let sdkAvailable: boolean | null = null;
let sdkInstalling = false;

/**
 * Check if the Polymarket SDK is installed, auto-install if not.
 * Returns true if SDK is ready to use.
 */
export async function ensureSDK(): Promise<{ ready: boolean; message?: string }> {
  // Fast path: already checked
  if (sdkAvailable === true) return { ready: true };
  if (sdkInstalling) return { ready: false, message: 'SDK installation in progress, please retry in ~30 seconds' };

  const installDir = getSDKInstallDir();

  // Check if already installed
  if (canResolveSDK(installDir)) {
    sdkAvailable = true;
    return { ready: true };
  }

  sdkInstalling = true;
  try {
    console.log('[polymarket] Auto-installing @polymarket/clob-client and ethers to ' + installDir + '...');

    // Ensure install directory exists with a package.json
    fs.mkdirSync(installDir, { recursive: true });
    const pkgPath = path.join(installDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'polymarket-sdk-deps', private: true }, null, 2));
    }

    execSync('npm install --save @polymarket/clob-client @ethersproject/wallet ethers@5 2>&1', {
      cwd: installDir,
      timeout: 120_000,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    if (canResolveSDK(installDir)) {
      sdkAvailable = true;
      sdkInstalling = false;
      console.log('[polymarket] SDK installed successfully at ' + installDir);
      return { ready: true };
    } else {
      sdkInstalling = false;
      return { ready: false, message: 'SDK installed but cannot be resolved at ' + installDir };
    }
  } catch (err: any) {
    sdkInstalling = false;
    console.error('[polymarket] SDK installation failed:', err.message);
    return { ready: false, message: `SDK auto-install failed: ${err.message}. Manual install: cd ${installDir} && npm install @polymarket/clob-client @ethersproject/wallet ethers@5` };
  }
}

/** Stable SDK install location — survives restarts, works on all platforms */
function getSDKInstallDir(): string {
  // Prefer a stable location under the user's home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, '.agenticmail', 'polymarket-sdk');
}

/** Check if SDK packages can be resolved from the install dir */
function canResolveSDK(installDir: string): boolean {
  try {
    const nmDir = path.join(installDir, 'node_modules');
    return fs.existsSync(path.join(nmDir, '@polymarket', 'clob-client')) &&
           fs.existsSync(path.join(nmDir, '@ethersproject', 'wallet'));
  } catch { return false; }
}

/** Dynamic import from the SDK install directory */
export async function importSDK(pkg: string): Promise<any> {
  const installDir = getSDKInstallDir();
  try {
    // Use createRequire to resolve CJS packages from the SDK install directory
    const { createRequire } = await import('module');
    const sdkRequire = createRequire(path.join(installDir, 'node_modules', '.package.json'));
    return sdkRequire(pkg);
  } catch {
    // Fallback: try normal resolution
    try { return await import(pkg); } catch { return null; }
  }
}

// ─── CLOB Client Manager ────────────────────────────────────

interface ClobClientInstance {
  client: any;
  address: string;
  funderAddress: string;
  signatureType: number;
  createdAt: number;
  apiKey?: string;
}

const clientInstances = new Map<string, ClobClientInstance>();

/**
 * Get or create a CLOB client for an agent.
 * Credentials are loaded from the DB.
 */
export async function getClobClient(agentId: string, db: any): Promise<ClobClientInstance | null> {
  // Ensure proxy is connected (critical for agent processes that don't run autoConnectProxy on startup)
  if (!_proxyState.connected) {
    try { await autoConnectProxy(db); } catch {}
  }

  // Check cache
  const cached = clientInstances.get(agentId);
  if (cached && Date.now() - cached.createdAt < 3600_000) return cached; // 1hr cache

  // Load credentials from DB
  const creds = await loadWalletCredentials(agentId, db);
  if (!creds) return null;

  // Ensure SDK
  const sdk = await ensureSDK();
  if (!sdk.ready) return null;

  try {
    const { ClobClient } = await importSDK('@polymarket/clob-client');
    const { Wallet } = await importSDK('@ethersproject/wallet');

    const signer = new Wallet(creds.privateKey);
    const funder = creds.funderAddress || signer.address;

    // Create client with stored API creds or derive new ones
    let apiCreds = creds.apiCreds;
    if (!apiCreds) {
      // Note: createOrDeriveApiKey() tries createApiKey first (which logs an error for new wallets),
      // then falls back to deriveApiKey. The "[CLOB Client] request error" log is expected and harmless.
      const origWarn = console.error;
      console.error = (...args: any[]) => {
        const msg = String(args[0] || '');
        if (msg.includes('[CLOB Client] request error')) return; // suppress expected SDK noise
        origWarn.apply(console, args);
      };
      try {
        const tempClient = new ClobClient(getClobUrl(), 137, signer);
        apiCreds = await tempClient.createOrDeriveApiKey();
      } finally {
        console.error = origWarn;
      }
      // Store derived creds
      await saveWalletCredentials(agentId, db, {
        ...creds,
        apiCreds,
      });
      console.log(`[polymarket] API credentials derived for agent ${agentId}`);
    }

    const client = new ClobClient(
      getClobUrl(),
      137,
      signer,
      apiCreds,
      creds.signatureType || 0,
      funder,
    );

    // Inject HTTP proxy auth token if HTTP proxy is active
    if (_proxyState.connected && _proxyState.mode === 'http' && _proxyConfig?.proxyToken) {
      try {
        const axiosInstance = (client as any).http || (client as any).client || (client as any).axios;
        if (axiosInstance?.defaults?.headers) {
          axiosInstance.defaults.headers.common = axiosInstance.defaults.headers.common || {};
          axiosInstance.defaults.headers.common['x-proxy-token'] = _proxyConfig.proxyToken;
          console.log(`[polymarket-proxy] Proxy auth token injected into ClobClient for agent ${agentId}`);
        }
      } catch (e: any) {
        console.warn(`[polymarket-proxy] Could not inject proxy token: ${e.message}`);
      }
    }

    // Inject SOCKS proxy agent if tunnel is active
    const socksAgent = await getSocksAgent();
    if (socksAgent) {
      // Patch the underlying axios instance used by ClobClient
      try {
        const axiosInstance = (client as any).http || (client as any).client || (client as any).axios;
        if (axiosInstance?.defaults) {
          axiosInstance.defaults.httpAgent = socksAgent;
          axiosInstance.defaults.httpsAgent = socksAgent;
          console.log(`[polymarket-proxy] SOCKS agent injected into ClobClient for agent ${agentId}`);
        } else {
          // Try to set on the client directly if it exposes config
          (client as any)._socksAgent = socksAgent;
          console.log(`[polymarket-proxy] SOCKS agent stored on ClobClient for agent ${agentId} (will be applied at request time)`);
        }
      } catch (e: any) {
        console.log(`[polymarket-proxy] Could not inject SOCKS agent: ${e.message}`);
      }
    }

    const instance: ClobClientInstance = {
      client,
      address: signer.address,
      funderAddress: funder,
      signatureType: creds.signatureType || 0,
      createdAt: Date.now(),
    };

    clientInstances.set(agentId, instance);
    return instance;
  } catch (err: any) {
    console.error(`[polymarket] Failed to create CLOB client for ${agentId}:`, err.message);
    return null;
  }
}

// ─── DB Schema & Persistence ─────────────────────────────────

let dbInitialized = false;
let _dbInitPromise: Promise<void> | null = null;
let _isPostgres = false;
export function isPostgresDB() { return _isPostgres; }

/** Ensure DB tables exist. Safe to call multiple times — deduplicates via shared promise. */
export async function initPolymarketDB(db: any): Promise<void> {
  if (dbInitialized || !db) return;
  if (_dbInitPromise) return _dbInitPromise;
  _dbInitPromise = _doInitPolymarketDB(db);
  return _dbInitPromise;
}

async function _doInitPolymarketDB(db: any): Promise<void> {
  if (dbInitialized) return;

  try {
    // Detect dialect (Postgres, MySQL, or SQLite)
    const { detectDialect, setDialect, autoId: getAutoId } = await import('./polymarket-shared.js');
    const dialect = await detectDialect(db);
    setDialect(dialect);
    _isPostgres = dialect === 'postgres';
    const autoId = getAutoId();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_wallet_credentials (
        agent_id TEXT PRIMARY KEY,
        private_key_encrypted TEXT NOT NULL,
        funder_address TEXT,
        signature_type INTEGER DEFAULT 0,
        api_key TEXT,
        api_secret TEXT,
        api_passphrase TEXT,
        rpc_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_trading_config (
        agent_id TEXT PRIMARY KEY,
        mode TEXT DEFAULT 'approval',
        max_position_size REAL DEFAULT 100,
        max_order_size REAL DEFAULT 50,
        max_total_exposure REAL DEFAULT 500,
        max_daily_trades INTEGER DEFAULT 10,
        max_daily_loss REAL DEFAULT 50,
        max_drawdown_pct REAL DEFAULT 20,
        allowed_categories TEXT DEFAULT '[]',
        blocked_categories TEXT DEFAULT '[]',
        blocked_markets TEXT DEFAULT '[]',
        min_liquidity REAL DEFAULT 0,
        min_volume REAL DEFAULT 0,
        max_spread_pct REAL DEFAULT 100,
        stop_loss_pct REAL DEFAULT 0,
        take_profit_pct REAL DEFAULT 0,
        trailing_stop_pct REAL DEFAULT 0,
        rebalance_interval TEXT DEFAULT 'never',
        notification_channel TEXT DEFAULT '',
        notify_on TEXT DEFAULT '["trade_filled","stop_loss","circuit_breaker","market_resolved"]',
        cash_reserve_pct REAL DEFAULT 20,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_pending_trades (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL,
        size REAL NOT NULL,
        order_type TEXT DEFAULT 'GTC',
        tick_size TEXT DEFAULT '0.01',
        neg_risk INTEGER DEFAULT 0,
        market_question TEXT,
        outcome TEXT,
        rationale TEXT,
        urgency TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        resolved_by TEXT
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_pending_agent ON poly_pending_trades(agent_id, status)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_trade_log (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        market_id TEXT,
        market_question TEXT,
        outcome TEXT,
        side TEXT NOT NULL,
        price REAL,
        size REAL NOT NULL,
        fill_price REAL,
        fill_size REAL,
        fee REAL DEFAULT 0,
        order_type TEXT,
        status TEXT DEFAULT 'placed',
        rationale TEXT,
        pnl REAL,
        clob_order_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_trades_agent ON poly_trade_log(agent_id, created_at DESC)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_price_alerts (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        market_question TEXT,
        condition TEXT NOT NULL,
        target_price REAL,
        pct_change REAL,
        base_price REAL,
        repeat_alert INTEGER DEFAULT 0,
        auto_trade_config TEXT,
        bracket_group TEXT,
        bracket_role TEXT,
        triggered INTEGER DEFAULT 0,
        triggered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_alerts_agent ON poly_price_alerts(agent_id, triggered)`);
    // Add bracket columns if they don't exist (migration for existing DBs)
    try { await db.execute(`ALTER TABLE poly_price_alerts ADD COLUMN bracket_group TEXT`); } catch {}
    try { await db.execute(`ALTER TABLE poly_price_alerts ADD COLUMN bracket_role TEXT`); } catch {}

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_paper_positions (
        id ${autoId},
        agent_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL,
        entry_price REAL NOT NULL,
        size REAL NOT NULL,
        market_question TEXT,
        rationale TEXT,
        closed INTEGER DEFAULT 0,
        exit_price REAL,
        pnl REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_paper_agent ON poly_paper_positions(agent_id, closed)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_daily_counters (
        agent_id TEXT NOT NULL,
        date TEXT NOT NULL,
        trade_count INTEGER DEFAULT 0,
        daily_loss REAL DEFAULT 0,
        paused INTEGER DEFAULT 0,
        pause_reason TEXT,
        PRIMARY KEY (agent_id, date)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_auto_approve_rules (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        max_size REAL DEFAULT 10,
        categories TEXT DEFAULT '[]',
        sides TEXT DEFAULT '["BUY","SELL"]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_auto_rules_agent ON poly_auto_approve_rules(agent_id)`);

    // ── Whitelisted withdrawal addresses ──
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_whitelisted_addresses (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        label TEXT NOT NULL,
        address TEXT NOT NULL,
        added_by TEXT NOT NULL,
        per_tx_limit REAL DEFAULT 100,
        daily_limit REAL DEFAULT 500,
        cooling_until TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_whitelist_agent ON poly_whitelisted_addresses(agent_id, is_active)`);

    // ── Transfer requests (always approval-gated) ──
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_transfer_requests (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        whitelist_id TEXT NOT NULL,
        to_address TEXT NOT NULL,
        to_label TEXT NOT NULL,
        amount REAL NOT NULL,
        token TEXT DEFAULT 'USDC',
        reason TEXT,
        status TEXT DEFAULT 'pending',
        requested_by TEXT DEFAULT 'agent',
        approved_by TEXT,
        tx_hash TEXT,
        error TEXT,
        expires_at TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_transfers_agent ON poly_transfer_requests(agent_id, status)`);

    // ── Daily transfer tracking ──
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_transfer_daily (
        agent_id TEXT NOT NULL,
        address TEXT NOT NULL,
        date TEXT NOT NULL,
        total_transferred REAL DEFAULT 0,
        tx_count INTEGER DEFAULT 0,
        PRIMARY KEY (agent_id, address, date)
      )
    `);

    // Proxy config table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_proxy_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        enabled INTEGER DEFAULT 0,
        proxy_mode TEXT DEFAULT 'http',
        proxy_url TEXT,
        encrypted_proxy_token TEXT,
        vps_host TEXT,
        vps_user TEXT DEFAULT 'root',
        vps_port INTEGER DEFAULT 22,
        socks_port INTEGER DEFAULT 1080,
        auth_method TEXT DEFAULT 'password',
        ssh_key_path TEXT,
        encrypted_ssh_key TEXT,
        encrypted_password TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CHECK (id = 1)
      )
    `);

    // Migrate existing tables
    const migrateCols = [
      ['proxy_mode', "TEXT DEFAULT 'http'"],
      ['proxy_url', 'TEXT'],
      ['encrypted_proxy_token', 'TEXT'],
      ['encrypted_ssh_key', 'TEXT'],
    ];
    for (const [col, def] of migrateCols) {
      try { await db.execute(`ALTER TABLE poly_proxy_config ADD COLUMN ${col} ${def}`); } catch {}
    }

    // Watcher tables
    const { initWatcherTables } = await import('./polymarket-watcher.js');
    await initWatcherTables(db.getEngineDB?.() || db);

    dbInitialized = true;
  } catch (err: any) {
    console.error('[polymarket] DB init failed:', err.message);
  }
}

// ─── Wallet Credentials (DB-backed) ─────────────────────────

interface WalletCredentials {
  privateKey: string;
  funderAddress?: string;
  signatureType: number;
  rpcUrl?: string;
  apiCreds?: { apiKey: string; secret: string; passphrase: string };
}

export async function loadWalletCredentials(agentId: string, db: any): Promise<WalletCredentials | null> {
  if (!db) return null;
  await initPolymarketDB(db);
  try {
    const qFn = db.query || db.execute;
    const rows = await qFn.call(db, `SELECT * FROM poly_wallet_credentials WHERE agent_id = $1`, [agentId]);
    const row = rows?.rows?.[0] || (Array.isArray(rows) ? rows[0] : null);
    if (!row) return null;
    // Decrypt sensitive fields via vault
    const vault = getVaultInstance();
    const decryptField = (val: string | null) => {
      if (!val) return val;
      try { return vault ? vault.decrypt(val) : val; } catch { return val; } // fallback to raw if not encrypted
    };
    return {
      privateKey: decryptField(row.private_key_encrypted) as string,
      funderAddress: row.funder_address,
      signatureType: row.signature_type || 0,
      rpcUrl: row.rpc_url,
      apiCreds: row.api_key ? {
        apiKey: decryptField(row.api_key) as string,
        secret: decryptField(row.api_secret) as string,
        passphrase: decryptField(row.api_passphrase) as string
      } : undefined,
    };
  } catch { return null; }
}

export async function saveWalletCredentials(agentId: string, db: any, creds: WalletCredentials): Promise<void> {
  if (!db) return;
  await initPolymarketDB(db);
  // Encrypt sensitive fields via vault
  const vault = getVaultInstance();
  const encryptField = (val: string | null | undefined) => {
    if (!val) return val || null;
    try { return vault ? vault.encrypt(val) : val; } catch { return val; }
  };
  await db.execute(`
    INSERT INTO poly_wallet_credentials (agent_id, private_key_encrypted, funder_address, signature_type, api_key, api_secret, api_passphrase, rpc_url, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    ON CONFLICT (agent_id) DO UPDATE SET
      private_key_encrypted = $2, funder_address = $3, signature_type = $4,
      api_key = $5, api_secret = $6, api_passphrase = $7, rpc_url = $8,
      updated_at = CURRENT_TIMESTAMP
  `, [
    agentId,
    encryptField(creds.privateKey),
    creds.funderAddress || null,
    creds.signatureType || 0,
    encryptField(creds.apiCreds?.apiKey),
    encryptField(creds.apiCreds?.secret),
    encryptField(creds.apiCreds?.passphrase),
    creds.rpcUrl || null,
  ]);
}

// ─── Trading Config (DB-backed) ─────────────────────────────

export interface TradingConfig {
  mode: 'approval' | 'autonomous' | 'paper';
  maxPositionSize: number;
  maxOrderSize: number;
  maxTotalExposure: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  maxDrawdownPct: number;
  allowedCategories: string[];
  blockedCategories: string[];
  blockedMarkets: string[];
  minLiquidity: number;
  minVolume: number;
  maxSpreadPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  rebalanceInterval: string;
  notificationChannel: string;
  notifyOn: string[];
  cashReservePct: number;
  bracket?: { enabled?: boolean; take_profit_pct?: number; stop_loss_pct?: number };
}

const DEFAULT_CONFIG: TradingConfig = {
  mode: 'approval',
  maxPositionSize: 100,
  maxOrderSize: 50,
  maxTotalExposure: 500,
  maxDailyTrades: 10,
  maxDailyLoss: 50,
  maxDrawdownPct: 20,
  allowedCategories: [],
  blockedCategories: [],
  blockedMarkets: [],
  minLiquidity: 0,
  minVolume: 0,
  maxSpreadPct: 100,
  stopLossPct: 0,
  takeProfitPct: 0,
  trailingStopPct: 0,
  rebalanceInterval: 'never',
  notificationChannel: '',
  notifyOn: ['trade_filled', 'stop_loss', 'circuit_breaker', 'market_resolved'],
  cashReservePct: 20,
};

export async function loadConfig(agentId: string, db: any): Promise<TradingConfig> {
  if (!db) return { ...DEFAULT_CONFIG };
  try {
    // db.execute returns void on Postgres; use db.query instead
    const qFn = db.query || db.execute;
    let rows = await qFn.call(db, `SELECT * FROM poly_trading_config WHERE agent_id = $1`, [agentId]);
    const row = rows?.rows?.[0] || rows?.[0];
    if (!row) {
      console.log('[polymarket] loadConfig: no row for', agentId, 'method:', db.query ? 'query' : 'execute');
      return { ...DEFAULT_CONFIG };
    }
    return {
      mode: row.mode || 'approval',
      maxPositionSize: row.max_position_size ?? 100,
      maxOrderSize: row.max_order_size ?? 50,
      maxTotalExposure: row.max_total_exposure ?? 500,
      maxDailyTrades: row.max_daily_trades ?? 10,
      maxDailyLoss: row.max_daily_loss ?? 50,
      maxDrawdownPct: row.max_drawdown_pct ?? 20,
      allowedCategories: JSON.parse(row.allowed_categories || '[]'),
      blockedCategories: JSON.parse(row.blocked_categories || '[]'),
      blockedMarkets: JSON.parse(row.blocked_markets || '[]'),
      minLiquidity: row.min_liquidity ?? 0,
      minVolume: row.min_volume ?? 0,
      maxSpreadPct: row.max_spread_pct ?? 100,
      stopLossPct: row.stop_loss_pct ?? 0,
      takeProfitPct: row.take_profit_pct ?? 0,
      trailingStopPct: row.trailing_stop_pct ?? 0,
      rebalanceInterval: row.rebalance_interval || 'never',
      notificationChannel: row.notification_channel || '',
      notifyOn: JSON.parse(row.notify_on || '[]'),
      cashReservePct: row.cash_reserve_pct ?? 20,
    };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export async function saveConfig(agentId: string, db: any, config: TradingConfig): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_trading_config (agent_id, mode, max_position_size, max_order_size, max_total_exposure,
      max_daily_trades, max_daily_loss, max_drawdown_pct, allowed_categories, blocked_categories, blocked_markets,
      min_liquidity, min_volume, max_spread_pct, stop_loss_pct, take_profit_pct, trailing_stop_pct,
      rebalance_interval, notification_channel, notify_on, cash_reserve_pct, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)
    ON CONFLICT (agent_id) DO UPDATE SET
      mode=$2, max_position_size=$3, max_order_size=$4, max_total_exposure=$5,
      max_daily_trades=$6, max_daily_loss=$7, max_drawdown_pct=$8,
      allowed_categories=$9, blocked_categories=$10, blocked_markets=$11,
      min_liquidity=$12, min_volume=$13, max_spread_pct=$14,
      stop_loss_pct=$15, take_profit_pct=$16, trailing_stop_pct=$17,
      rebalance_interval=$18, notification_channel=$19, notify_on=$20, cash_reserve_pct=$21,
      updated_at=CURRENT_TIMESTAMP
  `, [
    agentId, config.mode, config.maxPositionSize, config.maxOrderSize, config.maxTotalExposure,
    config.maxDailyTrades, config.maxDailyLoss, config.maxDrawdownPct,
    JSON.stringify(config.allowedCategories), JSON.stringify(config.blockedCategories), JSON.stringify(config.blockedMarkets),
    config.minLiquidity, config.minVolume, config.maxSpreadPct,
    config.stopLossPct, config.takeProfitPct, config.trailingStopPct,
    config.rebalanceInterval, config.notificationChannel, JSON.stringify(config.notifyOn), config.cashReservePct,
  ]);
}

// ─── Daily Counters (DB-backed) ──────────────────────────────

export async function getDailyCounter(agentId: string, db: any): Promise<{ count: number; loss: number; paused: boolean; reason: string }> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return { count: 0, loss: 0, paused: false, reason: '' };
  try {
    const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_daily_counters WHERE agent_id = $1 AND date = $2`, [agentId, today]);
    const row = rows?.rows?.[0] || rows?.[0];
    if (!row) return { count: 0, loss: 0, paused: false, reason: '' };
    return { count: row.trade_count || 0, loss: row.daily_loss || 0, paused: !!row.paused, reason: row.pause_reason || '' };
  } catch { return { count: 0, loss: 0, paused: false, reason: '' }; }
}

export async function incrementDailyCounter(agentId: string, db: any, loss = 0): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_daily_counters (agent_id, date, trade_count, daily_loss) VALUES ($1, $2, 1, $3)
    ON CONFLICT (agent_id, date) DO UPDATE SET trade_count = poly_daily_counters.trade_count + 1, daily_loss = poly_daily_counters.daily_loss + $3
  `, [agentId, today, loss]);
}

export async function pauseTrading(agentId: string, db: any, reason: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_daily_counters (agent_id, date, paused, pause_reason) VALUES ($1, $2, 1, $3)
    ON CONFLICT (agent_id, date) DO UPDATE SET paused = 1, pause_reason = $3
  `, [agentId, today, reason]);
}

export async function resumeTrading(agentId: string, db: any): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  if (!db) return;
  await db.execute(`
    UPDATE poly_daily_counters SET paused = 0, pause_reason = '' WHERE agent_id = $1 AND date = $2
  `, [agentId, today]);
}

// ─── Pending Trades (DB-backed) ──────────────────────────────

export async function savePendingTrade(db: any, trade: {
  id: string; agentId: string; tokenId: string; side: string; price: number | null;
  size: number; orderType: string; tickSize: string; negRisk: boolean;
  marketQuestion: string; outcome: string; rationale: string; urgency: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_pending_trades (id, agent_id, token_id, side, price, size, order_type, tick_size, neg_risk, market_question, outcome, rationale, urgency)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [trade.id, trade.agentId, trade.tokenId, trade.side, trade.price, trade.size,
      trade.orderType, trade.tickSize, trade.negRisk ? 1 : 0, trade.marketQuestion,
      trade.outcome, trade.rationale, trade.urgency]);
}

export async function getPendingTrades(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_pending_trades WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at DESC`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

export async function resolvePendingTrade(db: any, tradeId: string, status: string, resolvedBy: string): Promise<void> {
  if (!db) return;
  await db.execute(`UPDATE poly_pending_trades SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2 WHERE id = $3`, [status, resolvedBy, tradeId]);
}

// ─── Trade Log (DB-backed) ───────────────────────────────────

export async function logTrade(db: any, trade: {
  id: string; agentId: string; tokenId: string; marketId?: string; marketQuestion?: string;
  outcome?: string; side: string; price?: number; size: number; fillPrice?: number;
  fillSize?: number; fee?: number; orderType?: string; status: string; rationale?: string;
  pnl?: number; clobOrderId?: string;
}): Promise<void> {
  if (!db) { console.warn('[logTrade] No db provided, skipping'); return; }
  try {
    await db.execute(`
      INSERT INTO poly_trade_log (id, agent_id, token_id, market_id, market_question, outcome, side, price, size, fill_price, fill_size, fee, order_type, status, rationale, pnl, clob_order_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, [trade.id, trade.agentId, trade.tokenId, trade.marketId || null, trade.marketQuestion || null,
        trade.outcome || null, trade.side, trade.price || null, trade.size, trade.fillPrice || null,
        trade.fillSize || null, trade.fee || 0, trade.orderType || null, trade.status,
        trade.rationale || null, trade.pnl || null, trade.clobOrderId || null]);
  } catch (err: any) {
    console.error(`[logTrade] FAILED to log trade ${trade.id}: ${err.message}`);
    // Don't throw — trade execution should not fail because of logging
  }
}

// ─── Price Alerts (DB-backed) ────────────────────────────────

export async function saveAlert(db: any, alert: {
  id: string; agentId: string; tokenId: string; marketQuestion: string;
  condition: string; targetPrice?: number; pctChange?: number; basePrice: number;
  repeat: boolean; autoTrade?: any;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_price_alerts (id, agent_id, token_id, market_question, condition, target_price, pct_change, base_price, repeat_alert, auto_trade_config)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [alert.id, alert.agentId, alert.tokenId, alert.marketQuestion, alert.condition,
      alert.targetPrice || null, alert.pctChange || null, alert.basePrice,
      alert.repeat ? 1 : 0, alert.autoTrade ? JSON.stringify(alert.autoTrade) : null]);
}

export async function getAlerts(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_price_alerts WHERE agent_id = $1 AND triggered = 0 ORDER BY created_at DESC`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

export async function deleteAlert(db: any, alertId: string): Promise<void> {
  if (!db) return;
  await db.execute(`DELETE FROM poly_price_alerts WHERE id = $1`, [alertId]);
}

export async function deleteAllAlerts(agentId: string, db: any): Promise<void> {
  if (!db) return;
  await db.execute(`DELETE FROM poly_price_alerts WHERE agent_id = $1`, [agentId]);
}

// ─── Bracket Orders (Take-Profit + Stop-Loss) ───────────────

/** Default bracket percentages */
const DEFAULT_TAKE_PROFIT_PCT = 15; // +15% profit target
const DEFAULT_STOP_LOSS_PCT = 10;   // -10% stop loss

/**
 * Create bracket alerts (take-profit + stop-loss) for a completed BUY order.
 * Both alerts are linked by a bracket_group ID — when one fires, the other is cancelled.
 */
export async function createBracketAlerts(db: any, opts: {
  agentId: string;
  tokenId: string;
  marketQuestion: string;
  buyPrice: number;
  size: number;
  takeProfitPct?: number;  // e.g. 15 for +15%
  stopLossPct?: number;    // e.g. 10 for -10%
  sourceTradeId?: string;
}): Promise<{ bracketGroup: string; takeProfitAlertId: string; stopLossAlertId: string; takeProfitPrice: number; stopLossPrice: number }> {
  const tpPct = opts.takeProfitPct ?? DEFAULT_TAKE_PROFIT_PCT;
  const slPct = opts.stopLossPct ?? DEFAULT_STOP_LOSS_PCT;

  const bracketGroup = `bracket_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tpAlertId = `tp_${bracketGroup}`;
  const slAlertId = `sl_${bracketGroup}`;

  const takeProfitPrice = Math.round((opts.buyPrice * (1 + tpPct / 100)) * 100) / 100;
  const stopLossPrice = Math.round((opts.buyPrice * (1 - slPct / 100)) * 100) / 100;

  // Take-profit alert: sell when price >= target
  await db.execute(`
    INSERT INTO poly_price_alerts (id, agent_id, token_id, market_question, condition, target_price, base_price, repeat_alert, auto_trade_config, bracket_group, bracket_role)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    tpAlertId, opts.agentId, opts.tokenId, opts.marketQuestion,
    'above', takeProfitPrice, opts.buyPrice, 0,
    JSON.stringify({ side: 'SELL', size: opts.size, token_id: opts.tokenId, source_trade: opts.sourceTradeId }),
    bracketGroup, 'take_profit',
  ]);

  // Stop-loss alert: sell when price <= target
  await db.execute(`
    INSERT INTO poly_price_alerts (id, agent_id, token_id, market_question, condition, target_price, base_price, repeat_alert, auto_trade_config, bracket_group, bracket_role)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    slAlertId, opts.agentId, opts.tokenId, opts.marketQuestion,
    'below', stopLossPrice, opts.buyPrice, 0,
    JSON.stringify({ side: 'SELL', size: opts.size, token_id: opts.tokenId, source_trade: opts.sourceTradeId }),
    bracketGroup, 'stop_loss',
  ]);

  console.log(`[bracket] Created bracket for ${opts.marketQuestion}: TP@${takeProfitPrice} (+${tpPct}%), SL@${stopLossPrice} (-${slPct}%) | group=${bracketGroup}`);

  return { bracketGroup, takeProfitAlertId: tpAlertId, stopLossAlertId: slAlertId, takeProfitPrice, stopLossPrice };
}

/**
 * When a bracket alert fires, cancel its sibling (the other side of the bracket).
 * Returns the cancelled sibling's ID if found.
 */
export async function cancelBracketSibling(db: any, firedAlertId: string, bracketGroup: string): Promise<string | null> {
  if (!db || !bracketGroup) return null;
  try {
    // Mark the sibling as triggered (cancelled) so it won't fire
    const result = await db.execute(
      `UPDATE poly_price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE bracket_group = $1 AND id != $2 AND triggered = 0`,
      [bracketGroup, firedAlertId]
    );
    const affected = result?.rowCount || result?.changes || 0;
    if (affected > 0) {
      console.log(`[bracket] Cancelled sibling of ${firedAlertId} in bracket group ${bracketGroup}`);
      // Get the sibling ID for logging
      try {
        const sibling = await (db.query || db.execute).call(db,
          `SELECT id, bracket_role FROM poly_price_alerts WHERE bracket_group = $1 AND id != $2`,
          [bracketGroup, firedAlertId]
        );
        const row = sibling?.rows?.[0] || sibling?.[0];
        return row?.id || null;
      } catch { return null; }
    }
    return null;
  } catch (e: any) {
    console.error(`[bracket] Failed to cancel sibling: ${e.message}`);
    return null;
  }
}

/**
 * Get bracket config from agent's trading config.
 * Uses the CENTRAL TradingConfig (stop_loss_pct, take_profit_pct, trailing_stop_pct)
 * with bracket-specific overrides if set.
 */
export async function getBracketConfig(agentId: string, db: any): Promise<{ enabled: boolean; takeProfitPct: number; stopLossPct: number; trailingStopPct: number }> {
  try {
    const config = await loadConfig(agentId, db);
    const bracket = config?.bracket || {};
    return {
      enabled: bracket.enabled !== false, // enabled by default
      takeProfitPct: bracket.take_profit_pct ?? config.takeProfitPct ?? DEFAULT_TAKE_PROFIT_PCT,
      stopLossPct: bracket.stop_loss_pct ?? config.stopLossPct ?? DEFAULT_STOP_LOSS_PCT,
      trailingStopPct: config.trailingStopPct ?? 12,
    };
  } catch {
    return { enabled: true, takeProfitPct: DEFAULT_TAKE_PROFIT_PCT, stopLossPct: DEFAULT_STOP_LOSS_PCT, trailingStopPct: 12 };
  }
}

/** Check all active alerts against current prices, return triggered ones */
export async function checkAlerts(agentId: string, db: any): Promise<any[]> {
  const alerts = await getAlerts(agentId, db);
  if (alerts.length === 0) return [];
  const triggered: any[] = [];
  const CLOB = 'https://clob.polymarket.com';

  for (const alert of alerts) {
    try {
      const mid = await (await fetch(`${CLOB}/midpoint?token_id=${alert.token_id}`)).json();
      const currentPrice = parseFloat(mid?.mid || '0');
      if (!currentPrice) continue;

      let fire = false;
      let reason = '';

      if (alert.condition === 'above' && alert.target_price && currentPrice >= alert.target_price) {
        fire = true;
        reason = `Price ${(currentPrice * 100).toFixed(1)}% crossed above target ${(alert.target_price * 100).toFixed(1)}%`;
      } else if (alert.condition === 'below' && alert.target_price && currentPrice <= alert.target_price) {
        fire = true;
        reason = `Price ${(currentPrice * 100).toFixed(1)}% dropped below target ${(alert.target_price * 100).toFixed(1)}%`;
      } else if (alert.condition === 'pct_change' && alert.pct_change && alert.base_price) {
        const change = Math.abs(currentPrice - alert.base_price) / alert.base_price * 100;
        if (change >= alert.pct_change) {
          fire = true;
          const dir = currentPrice > alert.base_price ? 'up' : 'down';
          reason = `Price moved ${dir} ${change.toFixed(1)}% (threshold: ${alert.pct_change}%). Was ${(alert.base_price * 100).toFixed(1)}%, now ${(currentPrice * 100).toFixed(1)}%`;
        }
      }

      if (fire) {
        triggered.push({
          alert_id: alert.id,
          token_id: alert.token_id,
          market: alert.market_question,
          condition: alert.condition,
          current_price: currentPrice,
          reason,
          auto_trade: alert.auto_trade_config ? JSON.parse(alert.auto_trade_config) : null,
        });
        // Mark as triggered (or delete if not repeating)
        if (alert.repeat_alert) {
          await db.execute(`UPDATE poly_price_alerts SET base_price = $1 WHERE id = $2`, [currentPrice, alert.id]);
        } else {
          await db.execute(`UPDATE poly_price_alerts SET triggered = 1 WHERE id = $1`, [alert.id]);
        }
      }
    } catch { /* skip failed price checks */ }
  }
  return triggered;
}

// ─── Paper Positions (DB-backed) ─────────────────────────────

export async function savePaperPosition(db: any, pos: {
  agentId: string; tokenId: string; side: string; entryPrice: number; size: number;
  marketQuestion: string; rationale: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_paper_positions (agent_id, token_id, side, entry_price, size, market_question, rationale)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [pos.agentId, pos.tokenId, pos.side, pos.entryPrice, pos.size, pos.marketQuestion, pos.rationale]);
}

export async function getPaperPositions(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_paper_positions WHERE agent_id = $1 AND closed = 0 ORDER BY created_at DESC`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

// ─── Auto-Approve Rules (DB-backed) ─────────────────────────

export async function getAutoApproveRules(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_auto_approve_rules WHERE agent_id = $1`, [agentId]);
    return (rows?.rows || rows || []).map((r: any) => ({
      id: r.id, maxSize: r.max_size, categories: JSON.parse(r.categories || '[]'), sides: JSON.parse(r.sides || '[]'),
    }));
  } catch { return []; }
}

export async function saveAutoApproveRule(db: any, rule: { id: string; agentId: string; maxSize: number; categories: string[]; sides: string[] }): Promise<void> {
  if (!db) return;
  await db.execute(`INSERT INTO poly_auto_approve_rules (id, agent_id, max_size, categories, sides) VALUES ($1,$2,$3,$4,$5)`,
    [rule.id, rule.agentId, rule.maxSize, JSON.stringify(rule.categories), JSON.stringify(rule.sides)]);
}

export async function deleteAutoApproveRule(db: any, ruleId: string): Promise<void> {
  if (!db) return;
  await db.execute(`DELETE FROM poly_auto_approve_rules WHERE id = $1`, [ruleId]);
}

// ─── Wallet Generation ──────────────────────────────────────

/**
 * Generate a fresh Ethereum wallet (no Polymarket account yet).
 * The agent can then use the browser to create a Polymarket account with this wallet.
 */
export async function generateWallet(): Promise<{ address: string; privateKey: string } | null> {
  const sdk = await ensureSDK();
  if (!sdk.ready) {
    // Fallback: use Node.js crypto to generate a key
    const crypto = await import('crypto');
    const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
    // Derive address manually (simplified — needs ethers for proper derivation)
    return { address: '(install ethers to derive address)', privateKey };
  }

  try {
    const ethWallet = await importSDK('@ethersproject/wallet');
    if (!ethWallet) throw new Error('importSDK returned null for @ethersproject/wallet');
    const Wallet = ethWallet.Wallet || ethWallet.default?.Wallet;
    if (!Wallet) throw new Error('Wallet class not found in module. Keys: ' + Object.keys(ethWallet).join(','));
    const wallet = Wallet.createRandom();
    return { address: wallet.address, privateKey: wallet.privateKey };
  } catch (err: any) {
    console.error('[polymarket] generateWallet failed:', err.message);
    return null;
  }
}

// ─── Trading Journal & Learning System ──────────────────────

export async function initLearningDB(db: any): Promise<void> {
  if (!db) return;
  try {
    // Prediction tracking — logs every prediction the agent makes with its reasoning
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_predictions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        market_id TEXT,
        token_id TEXT NOT NULL,
        market_question TEXT,
        predicted_outcome TEXT NOT NULL,
        predicted_probability REAL NOT NULL,
        market_price_at_prediction REAL NOT NULL,
        confidence REAL NOT NULL,
        reasoning TEXT,
        signals_used TEXT,
        category TEXT,
        resolved INTEGER DEFAULT 0,
        actual_outcome TEXT,
        was_correct INTEGER,
        pnl REAL,
        lesson_extracted INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_pred_agent ON poly_predictions(agent_id, resolved)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_pred_category ON poly_predictions(agent_id, category)`);

    // Strategy performance — tracks how each signal/strategy performs over time
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_strategy_stats (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        strategy_name TEXT NOT NULL,
        total_predictions INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        avg_confidence REAL DEFAULT 0,
        brier_score REAL DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, strategy_name)
      )
    `);

    // Lessons learned — distilled insights from trade reviews
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_lessons (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        lesson TEXT NOT NULL,
        category TEXT NOT NULL,
        source_prediction_ids TEXT,
        importance TEXT DEFAULT 'normal',
        times_applied INTEGER DEFAULT 0,
        last_applied TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_poly_lessons_agent ON poly_lessons(agent_id, category)`);

    // Calibration tracking — is the agent overconfident or underconfident?
    await db.execute(`
      CREATE TABLE IF NOT EXISTS poly_calibration (
        agent_id TEXT NOT NULL,
        bucket TEXT NOT NULL,
        predictions INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY (agent_id, bucket)
      )
    `);
  } catch (err: any) {
    console.error('[polymarket] Learning DB init failed:', err.message);
  }
}

/**
 * Record a prediction the agent is making (BEFORE the trade).
 * This is the "pre-trade journal entry."
 */
export async function recordPrediction(db: any, pred: {
  id: string; agentId: string; marketId?: string; tokenId: string;
  marketQuestion?: string; predictedOutcome: string; predictedProbability: number;
  marketPrice: number; confidence: number; reasoning?: string;
  signalsUsed?: string[]; category?: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_predictions (id, agent_id, market_id, token_id, market_question, predicted_outcome,
      predicted_probability, market_price_at_prediction, confidence, reasoning, signals_used, category)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [
    pred.id, pred.agentId, pred.marketId || null, pred.tokenId,
    pred.marketQuestion || null, pred.predictedOutcome, pred.predictedProbability,
    pred.marketPrice, pred.confidence, pred.reasoning || null,
    pred.signalsUsed ? JSON.stringify(pred.signalsUsed) : null, pred.category || null,
  ]);
}

/**
 * Resolve a prediction after market resolves.
 * This is the "post-trade journal entry" — the feedback loop.
 */
export async function resolvePrediction(db: any, predId: string, actualOutcome: string, pnl: number): Promise<void> {
  if (!db) return;
  // Get the original prediction
  const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_predictions WHERE id = $1`, [predId]);
  const pred = rows?.rows?.[0] || rows?.[0];
  if (!pred) return;

  const wasCorrect = pred.predicted_outcome.toLowerCase() === actualOutcome.toLowerCase() ? 1 : 0;

  await db.execute(`
    UPDATE poly_predictions SET resolved = 1, actual_outcome = $1, was_correct = $2, pnl = $3, resolved_at = CURRENT_TIMESTAMP
    WHERE id = $4
  `, [actualOutcome, wasCorrect, pnl, predId]);

  // Update calibration buckets (0-10%, 10-20%, ..., 90-100%)
  const bucket = Math.floor(pred.confidence * 10) * 10 + '%';
  await db.execute(`
    INSERT INTO poly_calibration (agent_id, bucket, predictions, correct) VALUES ($1, $2, 1, $3)
    ON CONFLICT (agent_id, bucket) DO UPDATE SET predictions = predictions + 1, correct = correct + $3
  `, [pred.agent_id, bucket, wasCorrect]);

  // Update strategy stats if signals were used
  if (pred.signals_used) {
    try {
      const signals = JSON.parse(pred.signals_used);
      for (const signal of signals) {
        await db.execute(`
          INSERT INTO poly_strategy_stats (id, agent_id, strategy_name, total_predictions, correct_predictions, total_pnl, avg_confidence, last_updated)
          VALUES ($1, $2, $3, 1, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (agent_id, strategy_name) DO UPDATE SET
            total_predictions = poly_strategy_stats.total_predictions + 1,
            correct_predictions = poly_strategy_stats.correct_predictions + $4,
            total_pnl = poly_strategy_stats.total_pnl + $5,
            avg_confidence = (poly_strategy_stats.avg_confidence * poly_strategy_stats.total_predictions + $6) / (poly_strategy_stats.total_predictions + 1),
            last_updated = CURRENT_TIMESTAMP
        `, [
          `stat_${pred.agent_id}_${signal}`, pred.agent_id, signal,
          wasCorrect, pnl, pred.confidence,
        ]);
      }
    } catch {}
  }
}

/**
 * Store a lesson the agent learned from reviewing trades.
 */
export async function storeLesson(db: any, lesson: {
  id: string; agentId: string; lesson: string; category: string;
  sourcePredictionIds?: string[]; importance?: string;
}): Promise<void> {
  if (!db) return;
  await db.execute(`
    INSERT INTO poly_lessons (id, agent_id, lesson, category, source_prediction_ids, importance)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [lesson.id, lesson.agentId, lesson.lesson, lesson.category,
      lesson.sourcePredictionIds ? JSON.stringify(lesson.sourcePredictionIds) : null,
      lesson.importance || 'normal']);
}

/**
 * Get lessons relevant to a market/category for pre-trade review.
 */
export async function recallLessons(agentId: string, db: any, category?: string): Promise<any[]> {
  if (!db) return [];
  try {
    const query = category
      ? `SELECT * FROM poly_lessons WHERE agent_id = $1 AND category = $2 ORDER BY importance DESC, created_at DESC LIMIT 20`
      : `SELECT * FROM poly_lessons WHERE agent_id = $1 ORDER BY importance DESC, created_at DESC LIMIT 20`;
    const params = category ? [agentId, category] : [agentId];
    const rows = await (db.query || db.execute).call(db, query, params);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get calibration data — is the agent overconfident or underconfident?
 */
export async function getCalibration(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `SELECT * FROM poly_calibration WHERE agent_id = $1 ORDER BY bucket`, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get strategy performance rankings.
 */
export async function getStrategyPerformance(agentId: string, db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `
      SELECT *, CASE WHEN total_predictions > 0 THEN ROUND(CAST(correct_predictions AS REAL) / total_predictions * 100, 1) ELSE 0 END as win_rate
      FROM poly_strategy_stats WHERE agent_id = $1 ORDER BY total_pnl DESC
    `, [agentId]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get unresolved predictions for a market (to check when it resolves).
 */
export async function getUnresolvedPredictions(agentId: string, db: any, marketId?: string): Promise<any[]> {
  if (!db) return [];
  try {
    const query = marketId
      ? `SELECT * FROM poly_predictions WHERE agent_id = $1 AND resolved = 0 AND market_id = $2 ORDER BY created_at DESC`
      : `SELECT * FROM poly_predictions WHERE agent_id = $1 AND resolved = 0 ORDER BY created_at DESC LIMIT 50`;
    const params = marketId ? [agentId, marketId] : [agentId];
    const rows = await (db.query || db.execute).call(db, query, params);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Get recent predictions with outcomes for trade review.
 */
export async function getResolvedPredictions(agentId: string, db: any, limit = 20): Promise<any[]> {
  if (!db) return [];
  try {
    const rows = await (db.query || db.execute).call(db, `
      SELECT * FROM poly_predictions WHERE agent_id = $1 AND resolved = 1 AND lesson_extracted = 0
      ORDER BY resolved_at DESC LIMIT $2
    `, [agentId, limit]);
    return rows?.rows || rows || [];
  } catch { return []; }
}

/**
 * Mark predictions as having had lessons extracted.
 */
export async function markLessonsExtracted(db: any, predictionIds: string[]): Promise<void> {
  if (!db || predictionIds.length === 0) return;
  const placeholders = predictionIds.map((_: string, i: number) => `$${i + 1}`).join(',');
  await db.execute(`UPDATE poly_predictions SET lesson_extracted = 1 WHERE id IN (${placeholders})`, predictionIds);
}
