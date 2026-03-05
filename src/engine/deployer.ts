/**
 * Deployment Engine
 *
 * Handles provisioning and deploying agents to any target:
 * Docker containers, VPS via SSH, Fly.io, Railway, etc.
 *
 * The admin clicks "Deploy" in the dashboard → this engine does the rest.
 */

import type { AgentConfig, DeploymentTarget, DeploymentStatus } from './agent-config.js';
import { AgentConfigGenerator } from './agent-config.js';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Derive PM2 process name from agent config.
 * Uses config.deployment.config.local?.pm2Name if set,
 * otherwise derives from agent name: "Fola Olatunji" → "fola-agent"
 */
function getPm2Name(config: AgentConfig): string {
  const local = (config.deployment?.config as any)?.local;
  if (local?.pm2Name) return local.pm2Name;
  // Derive: first word of name, lowercased, + "-agent"
  const slug = config.name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${slug}-agent`;
}

// ─── Types ──────────────────────────────────────────────

export interface DeploymentEvent {
  timestamp: string;
  phase: DeploymentPhase;
  status: 'started' | 'completed' | 'failed';
  message: string;
  details?: any;
}

export type DeploymentPhase =
  | 'validate'
  | 'provision'
  | 'configure'
  | 'upload'
  | 'install'
  | 'start'
  | 'healthcheck'
  | 'complete';

export interface DeploymentResult {
  success: boolean;
  url?: string;               // Agent's accessible URL
  sshCommand?: string;        // For VPS: how to SSH in
  containerId?: string;       // For Docker
  appId?: string;             // For cloud platforms
  events: DeploymentEvent[];
  error?: string;
}

export interface LiveAgentStatus {
  agentId: string;
  name: string;
  status: DeploymentStatus;
  uptime?: number;             // Seconds
  lastHealthCheck?: string;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  metrics?: {
    cpuPercent: number;
    memoryMb: number;
    toolCallsToday: number;
    activeSessionCount: number;
    errorRate: number;          // Last hour
  };
  endpoint?: string;
  version?: string;
}

// ─── Deployment Engine ──────────────────────────────────

/**
 * Ensure PM2 is installed globally. Auto-installs if missing.
 * Returns { installed: boolean, version?: string, error?: string }
 */
export async function ensurePm2(): Promise<{ installed: boolean; version?: string; error?: string }> {
  try {
    const version = execSync('pm2 -v', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    return { installed: true, version };
  } catch {
    // Not installed — try to install
    console.log('[deployer] PM2 not found — auto-installing...');
    try {
      execSync('npm install -g pm2', { stdio: 'pipe', timeout: 120_000 });
      const version = execSync('pm2 -v', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      console.log(`[deployer] PM2 ${version} installed successfully`);
      return { installed: true, version };
    } catch (e: any) {
      console.error(`[deployer] PM2 auto-install failed: ${e.message}`);
      return { installed: false, error: e.message };
    }
  }
}

/**
 * Generate a PM2 ecosystem config for an agent.
 * Writes ecosystem.config.cjs if it doesn't exist or is outdated.
 */
function generateEcosystemConfig(config: AgentConfig): { script: string; args: string; name: string; cwd: string; envFile?: string; useNpx?: boolean } {
  const pm2Name = getPm2Name(config);
  const local = (config.deployment?.config as any)?.local;
  const cwd = local?.workDir || process.cwd();

  // Try to find dist/cli.js from the package install location
  let script = resolve(cwd, 'dist/cli.js');
  let useNpx = false;

  if (!existsSync(script)) {
    // Running via npx — find the actual package location
    try {
      const pkgDir = resolve(import.meta.url.replace('file://', '').replace(/\/dist\/.*$|\/src\/.*$/, ''));
      const candidate = resolve(pkgDir, 'dist/cli.js');
      if (existsSync(candidate)) {
        script = candidate;
      } else {
        useNpx = true; // Fall back to npx wrapper
      }
    } catch {
      useNpx = true;
    }
  }

  // Derive env file: .env.{slug} for agents, .env for enterprise
  const slug = config.name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  const amDir = resolve(homedir(), '.agenticmail');
  const envFile = resolve(amDir, `.env.${slug}`);
  const hasEnvFile = existsSync(envFile);
  // Also check cwd for backward compat
  const cwdEnvFile = resolve(cwd, `.env.${slug}`);
  const hasCwdEnvFile = existsSync(cwdEnvFile);

  return {
    script,
    args: 'agent',
    name: pm2Name,
    cwd,
    envFile: hasEnvFile ? envFile : hasCwdEnvFile ? cwdEnvFile : undefined,
    useNpx,
  };
}

export class DeploymentEngine {
  private configGen = new AgentConfigGenerator();
  private deployments = new Map<string, DeploymentResult>();
  private _liveStatus = new Map<string, LiveAgentStatus>();

  /**
   * Deploy an agent to its configured target
   */
  async deploy(config: AgentConfig, onEvent?: (event: DeploymentEvent) => void): Promise<DeploymentResult> {
    const events: DeploymentEvent[] = [];
    const emit = (phase: DeploymentPhase, status: DeploymentEvent['status'], message: string, details?: any) => {
      const event: DeploymentEvent = { timestamp: new Date().toISOString(), phase, status, message, details };
      events.push(event);
      onEvent?.(event);
    };

    try {
      // 1. Validate
      emit('validate', 'started', 'Validating agent configuration...');
      this.validateConfig(config);
      emit('validate', 'completed', 'Configuration valid');

      // 2. Route to target-specific deployer
      let result: DeploymentResult;
      switch (config.deployment.target) {
        case 'docker':
          result = await this.deployDocker(config, emit);
          break;
        case 'vps':
          result = await this.deployVPS(config, emit);
          break;
        case 'fly':
          result = await this.deployFly(config, emit);
          break;
        case 'railway':
          result = await this.deployRailway(config, emit);
          break;
        case 'local':
          result = await this.deployLocal(config, emit);
          break;
        default:
          throw new Error(`Unsupported deployment target: ${config.deployment.target}`);
      }

      result.events = events;
      this.deployments.set(config.id, result);
      return result;

    } catch (error: any) {
      emit('complete', 'failed', `Deployment failed: ${error.message}`);
      const result: DeploymentResult = { success: false, events, error: error.message };
      this.deployments.set(config.id, result);
      return result;
    }
  }

  /**
   * Stop a running agent
   */
  async stop(config: AgentConfig): Promise<{ success: boolean; message: string }> {
    switch (config.deployment.target) {
      case 'docker':
        return this.execCommand(`docker stop agenticmail-${config.name} && docker rm agenticmail-${config.name}`);
      case 'vps':
        return this.execSSH(config, `sudo systemctl stop agenticmail-${config.name}`);
      case 'fly':
        return this.flyMachineAction(config, 'stop');
      case 'local': {
        const pm2ok = await ensurePm2();
        if (!pm2ok.installed) return { success: false, message: `PM2 not available: ${pm2ok.error}` };
        return this.execCommand(`pm2 stop ${getPm2Name(config)}`);
      }
      default:
        return { success: false, message: `Cannot stop: unsupported target ${config.deployment.target}` };
    }
  }

  /**
   * Restart a running agent
   */
  async restart(config: AgentConfig): Promise<{ success: boolean; message: string }> {
    switch (config.deployment.target) {
      case 'docker':
        return this.execCommand(`docker restart agenticmail-${config.name}`);
      case 'vps':
        return this.execSSH(config, `sudo systemctl restart agenticmail-${config.name}`);
      case 'fly':
        return this.flyMachineAction(config, 'restart');
      case 'local': {
        const pm2ok = await ensurePm2();
        if (!pm2ok.installed) return { success: false, message: `PM2 not available: ${pm2ok.error}` };
        return this.execCommand(`pm2 restart ${getPm2Name(config)}`);
      }
      default:
        return { success: false, message: `Cannot restart: unsupported target ${config.deployment.target}` };
    }
  }

  /**
   * Get live status of a deployed agent
   */
  async getStatus(config: AgentConfig): Promise<LiveAgentStatus> {
    const base: LiveAgentStatus = {
      agentId: config.id,
      name: config.displayName,
      status: 'not-deployed',
      healthStatus: 'unknown',
    };

    try {
      switch (config.deployment.target) {
        case 'docker':
          return await this.getDockerStatus(config, base);
        case 'vps':
          return await this.getVPSStatus(config, base);
        case 'fly':
          return await this.getCloudStatus(config, base);
        case 'local':
          return await this.getPm2Status(config, base);
        default:
          return base;
      }
    } catch {
      return { ...base, status: 'error', healthStatus: 'unhealthy' };
    }
  }

  /**
   * Stream logs from a deployed agent
   */
  async getLogs(config: AgentConfig, lines: number = 100): Promise<string> {
    switch (config.deployment.target) {
      case 'docker':
        return (await this.execCommand(`docker logs --tail ${lines} agenticmail-${config.name}`)).message;
      case 'vps':
        return (await this.execSSH(config, `journalctl -u agenticmail-${config.name} --no-pager -n ${lines}`)).message;
      case 'fly':
        return `Logs available at: https://fly.io/apps/${config.deployment.config.cloud?.appName || 'unknown'}/monitoring`;
      case 'local':
        return (await this.execCommand(`pm2 logs ${getPm2Name(config)} --lines ${lines} --nostream 2>&1`)).message;
      default:
        return 'Log streaming not supported for this target';
    }
  }

  /**
   * Update a deployed agent's configuration without full redeployment
   */
  async updateConfig(config: AgentConfig): Promise<{ success: boolean; message: string }> {
    const workspace = this.configGen.generateWorkspace(config);
    const _gatewayConfig = this.configGen.generateGatewayConfig(config);

    switch (config.deployment.target) {
      case 'docker': {
        // Write config files into the container
        for (const [file, content] of Object.entries(workspace)) {
          const _escaped = content.replace(/'/g, "'\\''");
          await this.execCommand(`docker exec agenticmail-${config.name} sh -c 'echo "${Buffer.from(content).toString('base64')}" | base64 -d > /workspace/${file}'`);
        }
        // Restart gateway inside container
        await this.execCommand(`docker exec agenticmail-${config.name} agenticmail-enterprise restart`);
        return { success: true, message: 'Configuration updated and gateway restarted' };
      }
      case 'vps': {
        const vps = config.deployment.config.vps!;
        for (const [file, content] of Object.entries(workspace)) {
          await this.execSSH(config, `cat > ${vps.installPath}/workspace/${file} << 'EOF'\n${content}\nEOF`);
        }
        await this.execSSH(config, `sudo systemctl restart agenticmail-${config.name}`);
        return { success: true, message: 'Configuration updated and service restarted' };
      }
      default:
        return { success: false, message: 'Hot config update not supported for this target' };
    }
  }

  // ─── Docker Deployment ────────────────────────────────

  private async deployDocker(config: AgentConfig, emit: Function): Promise<DeploymentResult> {
    const dc = config.deployment.config.docker;
    if (!dc) throw new Error('Docker config missing');

    // Generate docker-compose
    emit('provision', 'started', 'Generating Docker configuration...');
    const _compose = this.configGen.generateDockerCompose(config);
    emit('provision', 'completed', 'Docker Compose generated');

    // Generate workspace files
    emit('configure', 'started', 'Generating agent workspace...');
    const workspace = this.configGen.generateWorkspace(config);
    emit('configure', 'completed', `Generated ${Object.keys(workspace).length} workspace files`);

    // Pull image
    emit('install', 'started', `Pulling image ${dc.image}:${dc.tag}...`);
    await this.execCommand(`docker pull ${dc.image}:${dc.tag}`);
    emit('install', 'completed', 'Image pulled');

    // Start container
    emit('start', 'started', 'Starting container...');

    // Build env args
    const envArgs = Object.entries(dc.env).map(([k, v]) => `-e ${k}="${v}"`).join(' ');
    const volumeArgs = dc.volumes.map(v => `-v ${v}`).join(' ');
    const portArgs = dc.ports.map(p => `-p ${p}:${p}`).join(' ');

    const runCmd = `docker run -d --name agenticmail-${config.name} --restart ${dc.restart} ${portArgs} ${volumeArgs} ${envArgs} ${dc.resources ? `--cpus="${dc.resources.cpuLimit}" --memory="${dc.resources.memoryLimit}"` : ''} ${dc.image}:${dc.tag}`;
    const runResult = await this.execCommand(runCmd);

    if (!runResult.success) {
      throw new Error(`Container failed to start: ${runResult.message}`);
    }

    const containerId = runResult.message.trim().substring(0, 12);
    emit('start', 'completed', `Container ${containerId} running`);

    // Write workspace files into container
    emit('upload', 'started', 'Writing workspace files...');
    for (const [file, content] of Object.entries(workspace)) {
      await this.execCommand(`docker exec agenticmail-${config.name} sh -c 'echo "${Buffer.from(content).toString('base64')}" | base64 -d > /workspace/${file}'`);
    }
    emit('upload', 'completed', 'Workspace configured');

    // Health check
    emit('healthcheck', 'started', 'Checking agent health...');
    let healthy = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const check = await this.execCommand(`docker exec agenticmail-${config.name} agenticmail-enterprise status 2>/dev/null || echo "not ready"`);
      if (check.success && !check.message.includes('not ready')) {
        healthy = true;
        break;
      }
    }

    if (healthy) {
      emit('healthcheck', 'completed', 'Agent is healthy');
      emit('complete', 'completed', `Agent "${config.displayName}" deployed successfully`);
    } else {
      emit('healthcheck', 'failed', 'Agent did not become healthy within 30s');
    }

    return {
      success: healthy,
      containerId,
      url: `http://localhost:${dc.ports[0]}`,
      events: [],
    };
  }

  // ─── VPS Deployment ───────────────────────────────────

  private async deployVPS(config: AgentConfig, emit: Function): Promise<DeploymentResult> {
    const vps = config.deployment.config.vps;
    if (!vps) throw new Error('VPS config missing');

    // Generate deploy script
    emit('provision', 'started', `Connecting to ${vps.host}...`);
    const script = this.configGen.generateVPSDeployScript(config);
    emit('provision', 'completed', 'Deploy script generated');

    // Test SSH connection
    emit('configure', 'started', 'Testing SSH connection...');
    const sshTest = await this.execSSH(config, 'echo "ok"');
    if (!sshTest.success) {
      throw new Error(`SSH connection failed: ${sshTest.message}`);
    }
    emit('configure', 'completed', 'SSH connection verified');

    // Upload and run deploy script
    emit('upload', 'started', 'Uploading deployment script...');
    const scriptB64 = Buffer.from(script).toString('base64');
    await this.execSSH(config, `echo "${scriptB64}" | base64 -d > /tmp/deploy-agenticmail.sh && chmod +x /tmp/deploy-agenticmail.sh`);
    emit('upload', 'completed', 'Script uploaded');

    emit('install', 'started', 'Running deployment (this may take a few minutes)...');
    const deployResult = await this.execSSH(config, 'bash /tmp/deploy-agenticmail.sh');
    if (!deployResult.success) {
      throw new Error(`Deployment script failed: ${deployResult.message}`);
    }
    emit('install', 'completed', 'Installation complete');

    // Verify service is running
    emit('healthcheck', 'started', 'Verifying service status...');
    await new Promise(r => setTimeout(r, 5000));
    const statusCheck = await this.execSSH(config, `systemctl is-active agenticmail-${config.name}`);
    const isActive = statusCheck.success && statusCheck.message.trim() === 'active';

    if (isActive) {
      emit('healthcheck', 'completed', 'Service is active');
      emit('complete', 'completed', `Agent deployed to ${vps.host}`);
    } else {
      emit('healthcheck', 'failed', 'Service not active');
    }

    return {
      success: isActive,
      sshCommand: `ssh ${vps.user}@${vps.host}${vps.port !== 22 ? ` -p ${vps.port}` : ''}`,
      events: [],
    };
  }

  // ─── Fly.io Deployment ────────────────────────────────

  /**
   * Local deployment — agent runs as a PM2 process on the same machine.
   * Restarts the PM2 process (or starts it if stopped).
   */
  private async deployLocal(config: AgentConfig, emit: (phase: DeploymentPhase, status: DeploymentEvent['status'], msg: string, details?: any) => void): Promise<DeploymentResult> {
    // ── Step 1: Provision (create env file + wrapper script) ──
    emit('provision', 'started', 'Creating agent configuration files...');
    const { provisionAgent } = await import('./agent-provisioner.js');
    const provision = provisionAgent(config);

    if (!provision.success) {
      emit('provision', 'failed', `Provisioning failed: ${provision.error}`);
      return { success: false, events: [], error: provision.error };
    }
    emit('provision', 'completed', `Agent files created: ${provision.envFile}, ${provision.wrapperScript}${provision.cliScript ? ' (direct mode)' : ' (npx mode)'}`);

    // ── Step 2: Ensure PM2 is installed ──
    emit('install', 'started', 'Checking PM2 installation...');
    const pm2Status = await ensurePm2();
    if (!pm2Status.installed) {
      emit('install', 'failed', `PM2 not available: ${pm2Status.error}. Try: npm install -g pm2`);
      return { success: false, events: [], error: `PM2 not available: ${pm2Status.error}` };
    }
    emit('install', 'completed', `PM2 v${pm2Status.version} ready`);

    const pm2Name = provision.pm2Name;

    // ── Step 3: Stop existing process if any ──
    const list = await this.execCommand('pm2 jlist');
    let processExists = false;
    if (list.success) {
      try {
        const procs = JSON.parse(list.message);
        processExists = procs.some((p: any) => p.name === pm2Name);
      } catch {}
    }
    if (processExists) {
      emit('start', 'started', `Stopping existing "${pm2Name}"...`);
      await this.execCommand(`pm2 delete ${pm2Name}`);
    }

    // ── Step 4: Start agent via PM2 ──
    emit('start', 'started', `Starting "${pm2Name}" via PM2...`);
    const startResult = await this.execCommand(`pm2 start "${provision.wrapperScript}" --name ${pm2Name}`);
    if (!startResult.success) {
      emit('start', 'failed', `PM2 start failed: ${startResult.message}`);
      return { success: false, events: [], error: startResult.message };
    }
    await this.execCommand('pm2 save');
    emit('start', 'completed', `PM2 process "${pm2Name}" started`);

    // ── Step 5: Health check — wait for process to be online ──
    emit('healthcheck', 'started', 'Waiting for agent to come online...');
    let healthy = false;
    // Check up to 3 times over 15 seconds
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      const status = await this.execCommand('pm2 jlist');
      if (status.success) {
        try {
          const procs = JSON.parse(status.message);
          const proc = procs.find((p: any) => p.name === pm2Name);
          if (proc?.pm2_env?.status === 'online') {
            healthy = true;
            break;
          }
          // If errored, get the error reason
          if (proc?.pm2_env?.status === 'errored' || proc?.pm2_env?.status === 'stopped') {
            const logs = await this.execCommand(`pm2 logs ${pm2Name} --nostream --lines 5`);
            emit('healthcheck', 'failed', `Process ${proc.pm2_env.status}: ${logs.message?.slice(0, 200) || 'check pm2 logs'}`);
            return { success: false, events: [], error: `Agent process ${proc.pm2_env.status}. Check: pm2 logs ${pm2Name}` };
          }
        } catch {}
      }
    }

    if (healthy) {
      emit('healthcheck', 'completed', 'Process is online');
      emit('complete', 'completed', `${pm2Name} deployed successfully`);
    } else {
      emit('healthcheck', 'failed', 'Process not online after restart');
    }

    return { success: healthy, events: [] };
  }

  /**
   * Deploy agent to Fly.io using the Machines API (HTTP).
   * No flyctl CLI needed — works from inside containers.
   *
   * Flow:
   * 1. Create app (if it doesn't exist)
   * 2. Create a Machine with the @agenticmail/enterprise Docker image
   * 3. Set secrets (API keys, DB URL, etc.)
   * 4. Wait for machine to start
   */
  private async deployFly(config: AgentConfig, emit: Function): Promise<DeploymentResult> {
    const cloud = config.deployment.config.cloud;
    if (!cloud) throw new Error('Fly.io config missing');

    const apiToken = cloud.apiToken;
    if (!apiToken) throw new Error('Fly.io API token is required');

    // Reuse previously stored app/machine IDs for redeploy
    const appName = cloud.appName || (config.deployment.config as any).flyAppName || `am-agent-${config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)}`;
    const region = cloud.region || 'iad';
    const size = cloud.size || 'shared-cpu-1x';
    const FLY_API = 'https://api.machines.dev/v1';

    // Fly.io tokens: FlyV1 tokens use their own prefix, others use Bearer
    const authHeader = apiToken.startsWith('FlyV1 ') || apiToken.startsWith('fm2_') ? apiToken.startsWith('FlyV1 ') ? apiToken : `FlyV1 ${apiToken}` : `Bearer ${apiToken}`;

    const flyFetch = async (path: string, method: string = 'GET', body?: any): Promise<any> => {
      const res = await fetch(`${FLY_API}${path}`, {
        method,
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) throw new Error(`Fly API ${method} ${path}: ${res.status} — ${data.error || text}`);
      return data;
    };

    // 1. Create app (ignore "already exists" errors)
    emit('provision', 'started', `Creating Fly.io app "${appName}"...`);
    try {
      // Fly.io org_slug must be a Fly org slug (e.g. 'personal', 'ope-olatunji'), not an internal org ID
      // If no valid org slug provided, auto-detect from token by listing apps
      let flyOrg = (cloud.org && cloud.org.length < 40 && /^[a-z0-9-]+$/.test(cloud.org)) ? cloud.org : '';
      if (!flyOrg) {
        try {
          const orgsRes = await flyFetch('/apps?org_slug=personal');
          if (orgsRes?.apps?.length > 0 && orgsRes.apps[0].organization?.slug) {
            flyOrg = orgsRes.apps[0].organization.slug;
          }
        } catch {}
        if (!flyOrg) flyOrg = 'personal';
      }
      await flyFetch('/apps', 'POST', {
        app_name: appName,
        org_slug: flyOrg,
      });
      emit('provision', 'completed', `App "${appName}" created`);
    } catch (e: any) {
      if (e.message.includes('already exists') || e.message.includes('already been taken')) {
        emit('provision', 'completed', `App "${appName}" already exists, reusing`);
      } else {
        throw e;
      }
    }

    // 2. Build environment variables — agent reads config from shared DB
    emit('configure', 'started', 'Preparing agent configuration...');
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      AGENTICMAIL_AGENT_ID: config.id,
      AGENTICMAIL_AGENT_NAME: config.displayName || config.name,
      AGENTICMAIL_MODEL: `${config.model?.provider || 'anthropic'}/${config.model?.modelId || 'claude-sonnet-4-20250514'}`,
      PORT: '3000',
    };
    if (config.model?.thinkingLevel) env.AGENTICMAIL_THINKING = config.model.thinkingLevel;
    // Pass shared DB credentials so agent connects to the same enterprise DB
    if (process.env.DATABASE_URL) env.DATABASE_URL = process.env.DATABASE_URL;
    if (process.env.JWT_SECRET) env.JWT_SECRET = process.env.JWT_SECRET;
    emit('configure', 'completed', 'Configuration ready');

    // 3. Check for existing machines — update if found, create if not
    emit('install', 'started', 'Deploying machine...');
    const existingMachines = await flyFetch(`/apps/${appName}/machines`);
    const machineConfig = {
      image: 'node:22-slim',
      env,
      services: [{
        ports: [
          { port: 443, handlers: ['tls', 'http'] },
          { port: 80, handlers: ['http'], force_https: true },
        ],
        protocol: 'tcp',
        internal_port: 3000,
      }],
      guest: {
        cpu_kind: size.includes('performance') ? 'performance' : 'shared',
        cpus: size.includes('2x') ? 2 : 1,
        memory_mb: size.includes('2x') ? 1024 : 512,
      },
      init: {
        cmd: ['sh', '-c', 'rm -rf /root/.npm && mkdir -p /tmp/agent && cd /tmp/agent && npm init -y > /dev/null 2>&1 && npm install --no-save @agenticmail/enterprise openai pg && npx @agenticmail/enterprise agent'],
      },
      auto_destroy: false,
      restart: { policy: 'always' },
    };

    let machineId: string;
    // Filter to only non-destroyed machines
    const liveMachines = (existingMachines || []).filter((m: any) => m.state !== 'destroyed');
    if (liveMachines.length > 0) {
      // Reuse existing machine — stop it first if running, then update
      const existing = liveMachines[0];
      machineId = existing.id;
      emit('install', 'started', `Reusing existing machine ${machineId} (state: ${existing.state})...`);
      if (existing.state === 'started' || existing.state === 'running') {
        try {
          await flyFetch(`/apps/${appName}/machines/${machineId}/stop`, 'POST');
          await flyFetch(`/apps/${appName}/machines/${machineId}/wait?state=stopped&timeout=30`);
        } catch { /* may already be stopped */ }
      }
      await flyFetch(`/apps/${appName}/machines/${machineId}`, 'POST', {
        config: machineConfig,
        region,
      });
      emit('install', 'completed', `Machine ${machineId} updated and restarting`);
    } else {
      // Create new machine
      const machine = await flyFetch(`/apps/${appName}/machines`, 'POST', {
        name: `agent-${config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 20)}`,
        region,
        config: machineConfig,
      });
      machineId = machine.id;
      emit('install', 'completed', `Machine ${machineId} created in ${region}`);
    }

    // 4. Wait for machine to start
    emit('start', 'started', 'Waiting for machine to start...');
    try {
      await flyFetch(`/apps/${appName}/machines/${machineId}/wait?state=started&timeout=60`);
      emit('start', 'completed', 'Machine is running');
    } catch {
      emit('start', 'completed', 'Machine starting (health check pending)');
    }

    // Store deployment metadata — persists app/machine IDs for redeployment
    config.deployment.config.cloud = {
      ...cloud,
      provider: 'fly',
      appName,
      region,
      size,
    };
    (config.deployment.config as any).flyAppName = appName;
    (config.deployment.config as any).flyMachineId = machineId;
    (config.deployment.config as any).deployedAt = new Date().toISOString();

    const url = cloud.customDomain || `https://${appName}.fly.dev`;
    emit('complete', 'completed', `Agent live at ${url}`);

    return {
      success: true,
      url,
      appId: appName,
      events: [],
    };
  }

  // ─── Railway Deployment ───────────────────────────────

  private async deployRailway(config: AgentConfig, emit: Function): Promise<DeploymentResult> {
    const cloud = config.deployment.config.cloud;
    if (!cloud || cloud.provider !== 'railway') throw new Error('Railway config missing');

    emit('provision', 'started', 'Creating Railway project...');
    // Railway CLI deployment
    const appName = cloud.appName || `agenticmail-${config.name}`;
    const result = await this.execCommand(`railway init --name ${appName}`, { RAILWAY_TOKEN: cloud.apiToken });
    emit('provision', result.success ? 'completed' : 'failed', result.message);

    return {
      success: result.success,
      url: `https://${appName}.up.railway.app`,
      appId: appName,
      events: [],
    };
  }

  // ─── Status Checkers ──────────────────────────────────

  private async getDockerStatus(config: AgentConfig, base: LiveAgentStatus): Promise<LiveAgentStatus> {
    const inspect = await this.execCommand(`docker inspect agenticmail-${config.name} --format '{{.State.Status}} {{.State.StartedAt}}'`);
    if (!inspect.success) return { ...base, status: 'not-deployed' };

    const [status, startedAt] = inspect.message.trim().split(' ');
    const running = status === 'running';
    const uptime = running ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0;

    // Get resource usage
    let metrics: LiveAgentStatus['metrics'] = undefined;
    if (running) {
      const stats = await this.execCommand(`docker stats agenticmail-${config.name} --no-stream --format '{{.CPUPerc}} {{.MemUsage}}'`);
      if (stats.success) {
        const parts = stats.message.trim().split(' ');
        metrics = {
          cpuPercent: parseFloat(parts[0]) || 0,
          memoryMb: parseFloat(parts[1]) || 0,
          toolCallsToday: 0,
          activeSessionCount: 0,
          errorRate: 0,
        };
      }
    }

    return {
      ...base,
      status: running ? 'running' : 'stopped',
      uptime,
      healthStatus: running ? 'healthy' : 'unhealthy',
      lastHealthCheck: new Date().toISOString(),
      metrics,
    };
  }

  private async getVPSStatus(config: AgentConfig, base: LiveAgentStatus): Promise<LiveAgentStatus> {
    const result = await this.execSSH(config, `systemctl is-active agenticmail-${config.name}`);
    const active = result.success && result.message.trim() === 'active';

    let uptime = 0;
    if (active) {
      const uptimeResult = await this.execSSH(config, `systemctl show agenticmail-${config.name} --property=ActiveEnterTimestamp --value`);
      if (uptimeResult.success) {
        uptime = Math.floor((Date.now() - new Date(uptimeResult.message.trim()).getTime()) / 1000);
      }
    }

    return {
      ...base,
      status: active ? 'running' : 'stopped',
      uptime,
      healthStatus: active ? 'healthy' : 'unhealthy',
      lastHealthCheck: new Date().toISOString(),
    };
  }

  private async getCloudStatus(config: AgentConfig, base: LiveAgentStatus): Promise<LiveAgentStatus> {
    const cloud = config.deployment.config.cloud;
    if (!cloud || !cloud.apiToken) return base;

    const appName = cloud.appName || `am-agent-${config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)}`;
    const FLY_API = 'https://api.machines.dev/v1';
    const t = cloud.apiToken;
    const auth = t.startsWith('FlyV1 ') ? t : t.startsWith('fm2_') ? `FlyV1 ${t}` : `Bearer ${t}`;

    try {
      const res = await fetch(`${FLY_API}/apps/${appName}/machines`, {
        headers: { 'Authorization': auth },
      });
      if (!res.ok) return { ...base, status: 'error', healthStatus: 'unhealthy' };

      const machines = await res.json() as any[];
      if (machines.length === 0) return { ...base, status: 'stopped' };

      const machine = machines[0];
      const state = machine.state;
      const isRunning = state === 'started' || state === 'replacing';

      return {
        ...base,
        status: isRunning ? 'running' : state === 'stopped' ? 'stopped' : 'error',
        healthStatus: isRunning ? 'healthy' : 'unhealthy',
        endpoint: `https://${appName}.fly.dev`,
        version: machine.image_ref?.tag,
        uptime: machine.created_at ? Math.floor((Date.now() - new Date(machine.created_at).getTime()) / 1000) : undefined,
      };
    } catch {
      return { ...base, status: 'error', healthStatus: 'unhealthy' };
    }
  }

  private async getPm2Status(config: AgentConfig, base: LiveAgentStatus): Promise<LiveAgentStatus> {
    const pm2Name = getPm2Name(config);
    const result = await this.execCommand(`pm2 jlist`);
    if (!result.success) return { ...base, status: 'error', healthStatus: 'unhealthy' };

    try {
      const procs = JSON.parse(result.message);
      const proc = procs.find((p: any) => p.name === pm2Name);
      if (!proc) return { ...base, status: 'not-deployed', healthStatus: 'unknown' };

      const status = proc.pm2_env?.status;
      const isOnline = status === 'online';
      const uptime = isOnline && proc.pm2_env?.pm_uptime
        ? Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000)
        : 0;

      return {
        ...base,
        status: isOnline ? 'running' : status === 'stopped' ? 'stopped' : 'error',
        healthStatus: isOnline ? 'healthy' : 'unhealthy',
        uptime,
        lastHealthCheck: new Date().toISOString(),
        metrics: {
          cpuPercent: proc.monit?.cpu || 0,
          memoryMb: Math.round((proc.monit?.memory || 0) / 1024 / 1024),
          toolCallsToday: 0,
          activeSessionCount: 0,
          errorRate: 0,
        },
        version: proc.pm2_env?.version || undefined,
      };
    } catch {
      return { ...base, status: 'error', healthStatus: 'unhealthy' };
    }
  }

  // ─── Helpers ──────────────────────────────────────────

  /** Stop or restart a Fly.io machine via the Machines API */
  private async flyMachineAction(config: AgentConfig, action: 'stop' | 'restart'): Promise<{ success: boolean; message: string }> {
    const cloud = config.deployment.config.cloud;
    if (!cloud || !cloud.apiToken) return { success: false, message: 'Fly.io config missing' };

    const appName = cloud.appName || `am-agent-${config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)}`;
    const FLY_API = 'https://api.machines.dev/v1';
    const t = cloud.apiToken;
    const auth = t.startsWith('FlyV1 ') ? t : t.startsWith('fm2_') ? `FlyV1 ${t}` : `Bearer ${t}`;

    try {
      const res = await fetch(`${FLY_API}/apps/${appName}/machines`, {
        headers: { 'Authorization': auth },
      });
      if (!res.ok) return { success: false, message: `Failed to list machines: ${res.status}` };
      const machines = await res.json() as any[];
      if (machines.length === 0) return { success: false, message: 'No machines found' };

      const machineId = machines[0].id;
      const actionRes = await fetch(`${FLY_API}/apps/${appName}/machines/${machineId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': auth },
      });
      if (!actionRes.ok) {
        const err = await actionRes.text();
        return { success: false, message: `${action} failed: ${err}` };
      }
      return { success: true, message: `Machine ${machineId} ${action}ed` };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  private validateConfig(config: AgentConfig) {
    if (!config.name) throw new Error('Agent name is required');
    if (!config.identity.role) throw new Error('Agent role is required');
    if (!config.model.modelId) throw new Error('Model ID is required');
    if (!config.deployment.target) throw new Error('Deployment target is required');

    switch (config.deployment.target) {
      case 'docker':
        if (!config.deployment.config.docker) throw new Error('Docker configuration missing');
        break;
      case 'vps':
        if (!config.deployment.config.vps?.host) throw new Error('VPS host is required');
        break;
      case 'fly':
      case 'railway':
        if (!config.deployment.config.cloud?.apiToken) throw new Error('Cloud API token is required');
        break;
    }
  }

  private _generateDockerfile(config: AgentConfig): string {
    return `FROM node:22-slim

WORKDIR /app

RUN npm install -g @agenticmail/enterprise @agenticmail/core agenticmail

COPY workspace/ /workspace/

ENV NODE_ENV=production
ENV AGENTICMAIL_MODEL=${config.model.provider}/${config.model.modelId}
ENV AGENTICMAIL_THINKING=${config.model.thinkingLevel}

EXPOSE 3000

CMD ["agenticmail-enterprise", "start"]
`;
  }

  private async execCommand(cmd: string, env?: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 300_000, // 5 min max
        env: { ...process.env, ...env },
      });
      return { success: true, message: stdout || stderr };
    } catch (error: any) {
      return { success: false, message: error.stderr || error.message };
    }
  }

  private async execSSH(config: AgentConfig, command: string): Promise<{ success: boolean; message: string }> {
    const vps = config.deployment.config.vps;
    if (!vps) return { success: false, message: 'No VPS config' };

    const sshArgs = [
      '-o StrictHostKeyChecking=no',
      `-p ${vps.port || 22}`,
      vps.sshKeyPath ? `-i ${vps.sshKeyPath}` : '',
      `${vps.user}@${vps.host}`,
      `"${command.replace(/"/g, '\\"')}"`,
    ].filter(Boolean).join(' ');

    return this.execCommand(`ssh ${sshArgs}`);
  }

  private async _writeFile(path: string, content: string): Promise<void> {
    const { writeFile } = await import('fs/promises');
    const { dirname } = await import('path');
    const { mkdir } = await import('fs/promises');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
  }
}
