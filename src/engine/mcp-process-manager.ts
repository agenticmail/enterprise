/**
 * MCP Process Manager
 *
 * Manages the lifecycle of external MCP servers registered via the dashboard.
 * Handles stdio process spawning, HTTP/SSE connections, tool discovery,
 * health monitoring, and automatic restarts.
 *
 * Architecture:
 *   Dashboard registers MCP server → stored in mcp_servers table
 *   → McpProcessManager.start() loads enabled servers
 *   → Spawns stdio processes / connects to HTTP endpoints
 *   → Discovers tools via JSON-RPC initialize + tools/list
 *   → Tools available via getToolsForAgent(agentId)
 *   → Agent loop calls tool → proxied to MCP process via callTool()
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ─── Types ───────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  type: 'stdio' | 'sse' | 'http';
  enabled: boolean;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http / sse
  url?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  // common
  autoRestart?: boolean;
  timeout?: number; // seconds
  description?: string;
  /** Agent IDs that can use this server. Empty/undefined = all agents */
  assignedAgents?: string[];
}

export interface McpDiscoveredTool {
  name: string;
  description?: string;
  inputSchema: { type: string; properties?: Record<string, any>; required?: string[] };
}

interface McpServerState {
  config: McpServerConfig;
  status: 'starting' | 'connected' | 'error' | 'stopped';
  process?: ChildProcess;
  tools: McpDiscoveredTool[];
  error?: string;
  restartCount: number;
  lastStarted?: Date;
  /** JSON-RPC request ID counter */
  rpcId: number;
  /** Pending RPC responses */
  pendingRpc: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  /** Buffered stdout data for line-based parsing */
  stdoutBuffer: string;
}

export interface McpProcessManagerConfig {
  engineDb: any;
  orgId?: string;
  /** Max restart attempts before giving up */
  maxRestarts?: number;
  /** Delay between restarts (ms) */
  restartDelayMs?: number;
  /** Tool discovery timeout (ms) */
  discoveryTimeoutMs?: number;
}

// ─── Manager ─────────────────────────────────────────────

export class McpProcessManager extends EventEmitter {
  private db: any;
  private orgId: string;
  private servers = new Map<string, McpServerState>();
  private maxRestarts: number;
  private restartDelayMs: number;
  private discoveryTimeoutMs: number;
  private started = false;
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(config: McpProcessManagerConfig) {
    super();
    this.db = config.engineDb;
    this.orgId = config.orgId || 'default';
    this.maxRestarts = config.maxRestarts ?? 5;
    this.restartDelayMs = config.restartDelayMs ?? 3000;
    this.discoveryTimeoutMs = config.discoveryTimeoutMs ?? 30000;
  }

  /** Start the manager — load all enabled MCP servers from DB and connect */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      const rows = await this.db.query(
        `SELECT * FROM mcp_servers WHERE org_id = $1`,
        [this.orgId]
      );
      const servers = (rows || []).map((r: any) => {
        const config = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {});
        return { ...config, id: r.id } as McpServerConfig;
      });

      const enabled = servers.filter((s: McpServerConfig) => s.enabled !== false);
      if (enabled.length === 0) {
        console.log('[mcp-manager] No enabled MCP servers found');
        return;
      }

      console.log(`[mcp-manager] Starting ${enabled.length} MCP server(s)...`);

      // Connect all in parallel
      await Promise.allSettled(enabled.map((s: McpServerConfig) => this.connectServer(s)));

      // Start health check timer (every 60s)
      this.healthTimer = setInterval(() => this.healthCheck(), 60000);
    } catch (e: any) {
      if (e.message?.includes('does not exist') || e.message?.includes('no such table')) {
        console.log('[mcp-manager] mcp_servers table does not exist yet — skipping');
        return;
      }
      console.error(`[mcp-manager] Start failed: ${e.message}`);
    }
  }

  /** Stop all servers and clean up */
  async stop(): Promise<void> {
    this.started = false;
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }

    for (const [id, state] of Array.from(this.servers)) {
      this.killProcess(state);
      console.log(`[mcp-manager] Stopped server: ${state.config.name} (${id})`);
    }
    this.servers.clear();
  }

  /** Connect a single MCP server (stdio spawn or HTTP/SSE connect) */
  async connectServer(config: McpServerConfig): Promise<void> {
    // Clean up existing if reconnecting
    const existing = this.servers.get(config.id);
    if (existing) this.killProcess(existing);

    const state: McpServerState = {
      config,
      status: 'starting',
      tools: [],
      restartCount: 0,
      rpcId: 0,
      pendingRpc: new Map(),
      stdoutBuffer: '',
    };
    this.servers.set(config.id, state);

    try {
      if (config.type === 'stdio') {
        await this.connectStdio(state);
      } else {
        await this.connectHttp(state);
      }
    } catch (e: any) {
      state.status = 'error';
      state.error = e.message;
      console.error(`[mcp-manager] Failed to connect ${config.name}: ${e.message}`);
      this.updateDbStatus(config.id, 'error', 0, []);
    }
  }

  /** Disconnect and remove a server */
  async disconnectServer(serverId: string): Promise<void> {
    const state = this.servers.get(serverId);
    if (state) {
      this.killProcess(state);
      this.servers.delete(serverId);
    }
  }

  /** Hot-reload: add or update a server config without restarting the whole manager */
  async reloadServer(serverId: string): Promise<void> {
    try {
      const rows = await this.db.query(`SELECT * FROM mcp_servers WHERE id = $1`, [serverId]);
      if (!rows?.length) {
        await this.disconnectServer(serverId);
        return;
      }
      const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : (rows[0].config || {});
      const serverConfig: McpServerConfig = { ...config, id: rows[0].id };

      if (serverConfig.enabled === false) {
        await this.disconnectServer(serverId);
        return;
      }
      await this.connectServer(serverConfig);
    } catch (e: any) {
      console.error(`[mcp-manager] Reload failed for ${serverId}: ${e.message}`);
    }
  }

  // ─── Tool Access ───────────────────────────────────────

  /** Get all discovered tools across all connected servers, optionally filtered by agent */
  getToolsForAgent(agentId?: string): Array<McpDiscoveredTool & { serverId: string; serverName: string }> {
    const tools: Array<McpDiscoveredTool & { serverId: string; serverName: string }> = [];

    for (const [id, state] of Array.from(this.servers)) {
      if (state.status !== 'connected') continue;

      // Check agent assignment — empty/missing means NO agents have access
      if (!state.config.assignedAgents?.length) continue;
      if (agentId && !state.config.assignedAgents.includes(agentId)) continue;
      if (!agentId) continue; // anonymous callers get nothing

      for (const tool of state.tools) {
        tools.push({ ...tool, serverId: id, serverName: state.config.name });
      }
    }
    return tools;
  }

  /** Get all connected server statuses */
  getServerStatuses(): Array<{ id: string; name: string; status: string; toolCount: number; error?: string }> {
    return Array.from(this.servers.values()).map(s => ({
      id: s.config.id,
      name: s.config.name,
      status: s.status,
      toolCount: s.tools.length,
      error: s.error,
    }));
  }

  /** Call a tool on its MCP server */
  async callTool(toolName: string, args: any, agentId?: string): Promise<{ content: string; isError?: boolean }> {
    // Find which server owns this tool
    for (const [_id, state] of Array.from(this.servers)) {
      if (state.status !== 'connected') continue;
      if (!state.config.assignedAgents?.length) continue;
      if (!agentId || !state.config.assignedAgents.includes(agentId)) continue;

      const tool = state.tools.find(t => t.name === toolName);
      if (!tool) continue;

      // Route to correct transport
      if (state.config.type === 'stdio') {
        return this.callToolStdio(state, toolName, args);
      } else {
        return this.callToolHttp(state, toolName, args);
      }
    }
    return { content: `Tool "${toolName}" not found on any connected MCP server`, isError: true };
  }

  // ─── Stdio Transport ──────────────────────────────────

  private async connectStdio(state: McpServerState): Promise<void> {
    const { config } = state;
    if (!config.command) throw new Error('No command specified for stdio MCP server');

    const env = { ...process.env, ...(config.env || {}) };
    const child = spawn(config.command, config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    state.process = child;
    state.lastStarted = new Date();
    state.stdoutBuffer = '';

    // Handle stdout — line-based JSON-RPC message parsing
    child.stdout!.on('data', (chunk: Buffer) => {
      state.stdoutBuffer += chunk.toString();
      this.processStdoutBuffer(state);
    });

    // Log stderr
    child.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.log(`[mcp:${config.name}:stderr] ${msg.slice(0, 200)}`);
    });

    // Handle process exit
    child.on('exit', (code) => {
      if (state.status === 'connected' && config.autoRestart !== false && this.started) {
        console.warn(`[mcp-manager] ${config.name} exited with code ${code} — restarting...`);
        this.scheduleRestart(state);
      }
    });

    child.on('error', (err) => {
      state.status = 'error';
      state.error = err.message;
      console.error(`[mcp-manager] ${config.name} process error: ${err.message}`);
    });

    // Initialize via JSON-RPC
    const initResult = await this.sendRpc(state, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'AgenticMail-Enterprise', version: '1.0' },
    });

    if (!initResult?.result) {
      throw new Error(`Initialize failed: ${JSON.stringify(initResult?.error || 'no response')}`);
    }

    // Send initialized notification
    this.sendNotification(state, 'notifications/initialized', {});

    // Discover tools
    const toolsResult = await this.sendRpc(state, 'tools/list', {});
    state.tools = (toolsResult?.result?.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));

    state.status = 'connected';
    state.error = undefined;

    console.log(`[mcp-manager] ${config.name} connected (stdio) — ${state.tools.length} tools discovered`);
    this.updateDbStatus(config.id, 'connected', state.tools.length, state.tools);
    this.emit('server:connected', { serverId: config.id, tools: state.tools });
  }

  private async callToolStdio(state: McpServerState, toolName: string, args: any): Promise<{ content: string; isError?: boolean }> {
    try {
      const result = await this.sendRpc(state, 'tools/call', { name: toolName, arguments: args });
      if (result?.error) {
        return { content: result.error.message || JSON.stringify(result.error), isError: true };
      }
      // MCP tool results are in result.result.content array
      const contents = result?.result?.content || [];
      const textParts = contents.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
      return { content: textParts || 'OK', isError: result?.result?.isError };
    } catch (e: any) {
      return { content: `MCP call failed: ${e.message}`, isError: true };
    }
  }

  // ─── HTTP/SSE Transport ────────────────────────────────

  private async connectHttp(state: McpServerState): Promise<void> {
    const { config } = state;
    if (!config.url) throw new Error('No URL specified for HTTP/SSE MCP server');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const timeout = (config.timeout || 30) * 1000;

    // Initialize
    const initResp = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'AgenticMail-Enterprise', version: '1.0' } },
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!initResp.ok) throw new Error(`HTTP ${initResp.status}: ${await initResp.text().catch(() => '')}`);
    const initData = await initResp.json() as any;
    if (initData.error) throw new Error(initData.error.message || 'Initialize error');

    // Discover tools
    const toolResp = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(15000),
    });

    let tools: McpDiscoveredTool[] = [];
    if (toolResp.ok) {
      const td = await toolResp.json() as any;
      tools = (td.result?.tools || []).map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      }));
    }

    state.tools = tools;
    state.status = 'connected';
    state.error = undefined;
    state.lastStarted = new Date();

    console.log(`[mcp-manager] ${config.name} connected (${config.type}) — ${tools.length} tools discovered`);
    this.updateDbStatus(config.id, 'connected', tools.length, tools);
    this.emit('server:connected', { serverId: config.id, tools });
  }

  private async callToolHttp(state: McpServerState, toolName: string, args: any): Promise<{ content: string; isError?: boolean }> {
    const { config } = state;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    try {
      const resp = await fetch(config.url!, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
        signal: AbortSignal.timeout((config.timeout || 30) * 1000),
      });

      if (!resp.ok) return { content: `HTTP ${resp.status}`, isError: true };
      const data = await resp.json() as any;
      if (data.error) return { content: data.error.message || JSON.stringify(data.error), isError: true };

      const contents = data.result?.content || [];
      const textParts = contents.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
      return { content: textParts || 'OK', isError: data.result?.isError };
    } catch (e: any) {
      return { content: `MCP HTTP call failed: ${e.message}`, isError: true };
    }
  }

  // ─── JSON-RPC Helpers (stdio) ──────────────────────────

  private sendRpc(state: McpServerState, method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!state.process?.stdin?.writable) {
        return reject(new Error('Process stdin not writable'));
      }

      const id = ++state.rpcId;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });

      const timer = setTimeout(() => {
        state.pendingRpc.delete(id);
        reject(new Error(`RPC timeout for ${method} after ${this.discoveryTimeoutMs}ms`));
      }, this.discoveryTimeoutMs);

      state.pendingRpc.set(id, { resolve, reject, timer });

      try {
        state.process!.stdin!.write(msg + '\n');
      } catch (e: any) {
        state.pendingRpc.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  private sendNotification(state: McpServerState, method: string, params: any): void {
    if (!state.process?.stdin?.writable) return;
    try {
      const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
      state.process!.stdin!.write(msg + '\n');
    } catch { /* best effort */ }
  }

  private processStdoutBuffer(state: McpServerState): void {
    const lines = state.stdoutBuffer.split('\n');
    // Keep the last incomplete line in the buffer
    state.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        // It's a response if it has an id
        if (parsed.id !== undefined && state.pendingRpc.has(parsed.id)) {
          const pending = state.pendingRpc.get(parsed.id)!;
          state.pendingRpc.delete(parsed.id);
          clearTimeout(pending.timer);
          pending.resolve(parsed);
        }
        // Could also be a notification from the server (no id) — emit event
        else if (!parsed.id && parsed.method) {
          this.emit('server:notification', {
            serverId: state.config.id,
            method: parsed.method,
            params: parsed.params,
          });
        }
      } catch {
        // Not valid JSON — might be server log output, ignore
      }
    }
  }

  // ─── Restart / Health ──────────────────────────────────

  private scheduleRestart(state: McpServerState): void {
    if (state.restartCount >= this.maxRestarts) {
      state.status = 'error';
      state.error = `Max restarts (${this.maxRestarts}) exceeded`;
      console.error(`[mcp-manager] ${state.config.name} exceeded max restarts`);
      this.updateDbStatus(state.config.id, 'error', 0, []);
      return;
    }

    state.restartCount++;
    const delay = this.restartDelayMs * state.restartCount; // exponential-ish backoff

    setTimeout(async () => {
      if (!this.started) return;
      console.log(`[mcp-manager] Restarting ${state.config.name} (attempt ${state.restartCount})...`);
      try {
        await this.connectServer(state.config);
      } catch (e: any) {
        console.error(`[mcp-manager] Restart failed: ${e.message}`);
      }
    }, delay);
  }

  private healthCheck(): void {
    for (const [_id, state] of Array.from(this.servers)) {
      if (state.status === 'connected' && state.config.type === 'stdio') {
        // Check if stdio process is still alive
        if (state.process && state.process.exitCode !== null) {
          console.warn(`[mcp-manager] ${state.config.name} process died (exit ${state.process.exitCode})`);
          if (state.config.autoRestart !== false) {
            this.scheduleRestart(state);
          } else {
            state.status = 'error';
            state.error = 'Process exited';
          }
        }
      }
      // For HTTP servers, could do a periodic ping here
    }
  }

  private killProcess(state: McpServerState): void {
    state.status = 'stopped';
    // Clear all pending RPCs
    for (const [_id, pending] of Array.from(state.pendingRpc)) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server stopped'));
    }
    state.pendingRpc.clear();

    if (state.process) {
      try { state.process.kill('SIGTERM'); } catch {}
      // Force kill after 3s
      setTimeout(() => {
        try { state.process?.kill('SIGKILL'); } catch {}
      }, 3000);
      state.process = undefined;
    }
  }

  private async updateDbStatus(serverId: string, status: string, toolCount: number, tools: McpDiscoveredTool[]): Promise<void> {
    try {
      await this.db.exec(
        `UPDATE mcp_servers SET status = $1, tool_count = $2, tools = $3, updated_at = NOW() WHERE id = $4`,
        [status, toolCount, JSON.stringify(tools.map(t => ({ name: t.name, description: t.description }))), serverId]
      );
    } catch { /* non-fatal */ }
  }
}
