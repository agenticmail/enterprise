/**
 * Agent Provisioner
 *
 * Creates all files needed to run a standalone agent process:
 *   1. ~/.agenticmail/.env.{slug}  — agent-specific env vars
 *   2. ~/.agenticmail/agent-{slug}.cjs — PM2-compatible wrapper script
 *
 * Validates everything before returning. Deployment only proceeds
 * after provisioning succeeds.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import type { AgentConfig } from './agent-config.js';

// ─── Types ──────────────────────────────────────────────

export interface ProvisionResult {
  success: boolean;
  error?: string;
  envFile: string;        // Path to .env.{slug}
  wrapperScript: string;  // Path to agent-{slug}.cjs
  cliScript?: string;     // Path to dist/cli.js (if found)
  slug: string;
  pm2Name: string;
  port: number;
}

// ─── Helpers ────────────────────────────────────────────

function slugify(name: string): string {
  return name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function getPm2Name(config: AgentConfig): string {
  const local = (config.deployment?.config as any)?.local;
  if (local?.pm2Name) return local.pm2Name;
  return `${slugify(config.name)}-agent`;
}

/** Find the dist/cli.js from the running package */
function findCliScript(): string | null {
  try {
    // import.meta.url → file:///path/to/dist/chunk-XXX.js or src/engine/agent-provisioner.ts
    const thisFile = fileURLToPath(import.meta.url);
    // Walk up to find dist/cli.js
    let dir = dirname(thisFile);
    for (let i = 0; i < 5; i++) {
      const candidate = resolve(dir, 'dist', 'cli.js');
      if (existsSync(candidate)) return candidate;
      const candidate2 = resolve(dir, 'cli.js');
      if (existsSync(candidate2) && dir.endsWith('dist')) return candidate2;
      dir = dirname(dir);
    }
  } catch {}

  // Try common npx cache locations
  try {
    const result = execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
    const candidate = resolve(result, '@agenticmail', 'enterprise', 'dist', 'cli.js');
    if (existsSync(candidate)) return candidate;
  } catch {}

  return null;
}

// ─── Main Provisioner ───────────────────────────────────

export function provisionAgent(config: AgentConfig): ProvisionResult {
  const slug = slugify(config.name);
  const pm2Name = getPm2Name(config);
  const amDir = resolve(homedir(), '.agenticmail');
  const envFile = resolve(amDir, `.env.${slug}`);
  const wrapperScript = resolve(amDir, `agent-${slug}.cjs`);
  const port = (config.deployment?.config as any)?.local?.port || 3101;

  // ── Step 1: Ensure directory exists ──
  try {
    mkdirSync(amDir, { recursive: true });
  } catch (e: any) {
    return { success: false, error: `Cannot create ${amDir}: ${e.message}`, envFile, wrapperScript, slug, pm2Name, port };
  }

  // ── Step 2: Build agent env vars ──
  const envLines: string[] = [
    `# Auto-generated for agent: ${config.displayName || config.name}`,
    `# Created: ${new Date().toISOString()}`,
    `AGENTICMAIL_AGENT_ID=${config.id}`,
    `AGENTICMAIL_AGENT_NAME=${config.displayName || config.name}`,
    `AGENTICMAIL_MODEL=${config.model?.provider || 'anthropic'}/${config.model?.modelId || 'claude-sonnet-4-20250514'}`,
    `PORT=${port}`,
  ];

  if (config.model?.thinkingLevel) {
    envLines.push(`AGENTICMAIL_THINKING=${config.model.thinkingLevel}`);
  }

  // Inherit critical vars from enterprise .env
  const mainEnvFile = resolve(amDir, '.env');
  const REQUIRED_INHERIT = ['DATABASE_URL', 'JWT_SECRET'];
  const OPTIONAL_INHERIT = ['AGENTICMAIL_VAULT_KEY', 'ORG_ID', 'ENTERPRISE_URL', 'AGENTICMAIL_DOMAIN'];

  if (!existsSync(mainEnvFile)) {
    return { success: false, error: `Enterprise .env not found at ${mainEnvFile}. Run setup first.`, envFile, wrapperScript, slug, pm2Name, port };
  }

  const mainEnvContent = readFileSync(mainEnvFile, 'utf8');
  const missingKeys: string[] = [];

  for (const key of REQUIRED_INHERIT) {
    const m = mainEnvContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (m) {
      envLines.push(`${key}=${m[1]}`);
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    return { success: false, error: `Missing required keys in ${mainEnvFile}: ${missingKeys.join(', ')}`, envFile, wrapperScript, slug, pm2Name, port };
  }

  for (const key of OPTIONAL_INHERIT) {
    const m = mainEnvContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (m) envLines.push(`${key}=${m[1]}`);
  }

  // Ensure ENTERPRISE_URL is always set — derive from PORT if missing
  if (!envLines.some(l => l.startsWith('ENTERPRISE_URL='))) {
    const portMatch = mainEnvContent.match(/^PORT=(\d+)$/m);
    const serverPort = portMatch ? portMatch[1] : (process.env.PORT || '8080');
    envLines.push(`ENTERPRISE_URL=http://localhost:${serverPort}`);
  }

  // ── Step 3: Write .env file ──
  try {
    writeFileSync(envFile, envLines.join('\n') + '\n');
  } catch (e: any) {
    return { success: false, error: `Cannot write ${envFile}: ${e.message}`, envFile, wrapperScript, slug, pm2Name, port };
  }

  // ── Step 4: Validate .env was written correctly ──
  try {
    const written = readFileSync(envFile, 'utf8');
    if (!written.includes(`AGENTICMAIL_AGENT_ID=${config.id}`)) {
      return { success: false, error: `Env file validation failed: AGENTICMAIL_AGENT_ID not found in ${envFile}`, envFile, wrapperScript, slug, pm2Name, port };
    }
    if (!written.includes('DATABASE_URL=')) {
      return { success: false, error: `Env file validation failed: DATABASE_URL not found in ${envFile}`, envFile, wrapperScript, slug, pm2Name, port };
    }
  } catch (e: any) {
    return { success: false, error: `Cannot read back ${envFile}: ${e.message}`, envFile, wrapperScript, slug, pm2Name, port };
  }

  // ── Step 5: Find CLI script ──
  const cliScript = findCliScript();

  // ── Step 6: Write wrapper script ──
  // The wrapper loads the env file, then either runs dist/cli.js directly
  // or falls back to npx. Direct execution is faster and more reliable.
  const wrapperLines: string[] = [
    `#!/usr/bin/env node`,
    `// Auto-generated agent wrapper for: ${config.displayName || config.name}`,
    `// Agent ID: ${config.id}`,
    `// Created: ${new Date().toISOString()}`,
    `'use strict';`,
    ``,
    `const { readFileSync } = require('fs');`,
    ``,
    `// ── Load agent env file ──`,
    `const envFile = ${JSON.stringify(envFile)};`,
    `try {`,
    `  const lines = readFileSync(envFile, 'utf8').split('\\n');`,
    `  for (const line of lines) {`,
    `    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);`,
    `    if (m) process.env[m[1]] = m[2];`,
    `  }`,
    `} catch (e) {`,
    `  console.error('[agent-wrapper] FATAL: Cannot load env file:', envFile, e.message);`,
    `  process.exit(1);`,
    `}`,
    ``,
    `// ── Validate required env vars ──`,
    `const required = ['AGENTICMAIL_AGENT_ID', 'DATABASE_URL', 'JWT_SECRET'];`,
    `for (const key of required) {`,
    `  if (!process.env[key]) {`,
    `    console.error('[agent-wrapper] FATAL: Missing required env var:', key);`,
    `    process.exit(1);`,
    `  }`,
    `}`,
    `console.log('[agent-wrapper] Agent:', process.env.AGENTICMAIL_AGENT_NAME, '(' + process.env.AGENTICMAIL_AGENT_ID.slice(0, 8) + '...)');`,
    ``,
  ];

  if (cliScript) {
    // Direct execution — fast and reliable
    wrapperLines.push(
      `// ── Direct execution (found cli.js at build time) ──`,
      `// Set argv so cli.js routes to 'agent' command`,
      `process.argv = [process.execPath, __filename, 'agent'];`,
      `try {`,
      `  require(${JSON.stringify(cliScript)});`,
      `} catch (e) {`,
      `  // Fallback to npx if direct path is stale (e.g. npx cache cleared)`,
      `  console.warn('[agent-wrapper] Direct execution failed, falling back to npx:', e.message);`,
      `  const { spawnSync } = require('child_process');`,
      `  const r = spawnSync('npx', ['@agenticmail/enterprise', 'agent'], {`,
      `    stdio: 'inherit', env: process.env, shell: process.platform === 'win32'`,
      `  });`,
      `  process.exit(r.status || 0);`,
      `}`,
    );
  } else {
    // npx fallback — slower but always works
    wrapperLines.push(
      `// ── npx execution (cli.js not found at provision time) ──`,
      `const { spawnSync } = require('child_process');`,
      `const r = spawnSync('npx', ['@agenticmail/enterprise', 'agent'], {`,
      `  stdio: 'inherit', env: process.env, shell: process.platform === 'win32'`,
      `});`,
      `process.exit(r.status || 0);`,
    );
  }

  try {
    writeFileSync(wrapperScript, wrapperLines.join('\n') + '\n');
  } catch (e: any) {
    return { success: false, error: `Cannot write ${wrapperScript}: ${e.message}`, envFile, wrapperScript, slug, pm2Name, port };
  }

  // ── Step 7: Validate wrapper was written ──
  try {
    const stat = statSync(wrapperScript);
    if (stat.size < 100) {
      return { success: false, error: `Wrapper script too small (${stat.size} bytes): ${wrapperScript}`, envFile, wrapperScript, slug, pm2Name, port };
    }
  } catch (e: any) {
    return { success: false, error: `Cannot stat wrapper: ${e.message}`, envFile, wrapperScript, slug, pm2Name, port };
  }

  // ── Done ──
  return {
    success: true,
    envFile,
    wrapperScript,
    cliScript: cliScript || undefined,
    slug,
    pm2Name,
    port,
  };
}
