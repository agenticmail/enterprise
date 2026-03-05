/**
 * Cluster Manager — Multi-Instance Agent Coordination
 *
 * Enables a single enterprise dashboard to manage agents running across
 * multiple machines (Mac Minis, VPS, cloud instances).
 *
 * Architecture:
 *   - Enterprise server = "Control Plane" (single dashboard, DB, SSE hub)
 *   - Agent instances = "Worker Nodes" (run on any machine, phone home to control plane)
 *
 * Worker nodes register via POST /cluster/register with their capabilities.
 * Control plane tracks health via heartbeats (every 30s, stale after 90s).
 * Agents deployed to remote workers communicate via ENTERPRISE_URL.
 *
 * Flow:
 *   1. Worker starts, calls POST /cluster/register { nodeId, host, port, capabilities }
 *   2. Control plane stores worker in memory + DB
 *   3. Dashboard shows all workers and their agents
 *   4. When user deploys an agent, they can pick a target worker
 *   5. Worker receives deploy command via its API
 *   6. Agent process starts on worker, reports status back to control plane
 */

export interface WorkerNode {
  nodeId: string;
  name: string;
  host: string;          // IP or hostname reachable from control plane
  port: number;          // Worker API port
  url: string;           // Full base URL (e.g., http://192.168.1.50:3101)
  platform: string;      // darwin, linux, win32
  arch: string;          // arm64, x64
  cpuCount: number;
  memoryMb: number;
  version: string;       // @agenticmail/enterprise version
  agents: string[];      // Agent IDs running on this worker
  capabilities: string[];// e.g., ['gpu', 'browser', 'voice', 'docker']
  status: 'online' | 'degraded' | 'offline';
  registeredAt: string;
  lastHeartbeat: string;
  metadata?: Record<string, any>;
}

export interface ClusterStats {
  totalNodes: number;
  onlineNodes: number;
  totalAgents: number;
  totalCpus: number;
  totalMemoryMb: number;
}

type NodeListener = (nodeId: string, node: WorkerNode, event: 'register' | 'heartbeat' | 'offline' | 'update') => void;

export class ClusterManager {
  private nodes = new Map<string, WorkerNode>();
  private listeners = new Set<NodeListener>();
  private staleTimer: NodeJS.Timeout | null = null;
  private staleThresholdMs = 90_000; // 90s without heartbeat = offline
  private db: any = null;

  constructor() {
    this.staleTimer = setInterval(() => this.checkStale(), 30_000);
    if (this.staleTimer.unref) this.staleTimer.unref();
  }

  setDb(db: any) { this.db = db; }

  /** Load persisted workers from DB on startup */
  async loadFromDb(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.execute(`CREATE TABLE IF NOT EXISTS cluster_nodes (
        node_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        url TEXT NOT NULL,
        platform TEXT,
        arch TEXT,
        cpu_count INTEGER DEFAULT 0,
        memory_mb INTEGER DEFAULT 0,
        version TEXT,
        agents TEXT DEFAULT '[]',
        capabilities TEXT DEFAULT '[]',
        status TEXT DEFAULT 'offline',
        registered_at TEXT,
        last_heartbeat TEXT,
        metadata TEXT
      )`);
      const rows = await this.db.query('SELECT * FROM cluster_nodes');
      for (const row of rows) {
        const node: WorkerNode = {
          nodeId: row.node_id,
          name: row.name || row.node_id,
          host: row.host,
          port: row.port,
          url: row.url,
          platform: row.platform || 'unknown',
          arch: row.arch || 'unknown',
          cpuCount: row.cpu_count || 0,
          memoryMb: row.memory_mb || 0,
          version: row.version || 'unknown',
          agents: safeParse(row.agents, []),
          capabilities: safeParse(row.capabilities, []),
          status: 'offline', // Start as offline; heartbeat will set online
          registeredAt: row.registered_at || new Date().toISOString(),
          lastHeartbeat: row.last_heartbeat || '',
          metadata: safeParse(row.metadata, {}),
        };
        this.nodes.set(node.nodeId, node);
      }
    } catch (e: any) {
      console.warn('[cluster] Failed to load nodes from DB:', e.message);
    }
  }

  /** Register or re-register a worker node */
  async register(data: {
    nodeId: string;
    name?: string;
    host: string;
    port: number;
    platform?: string;
    arch?: string;
    cpuCount?: number;
    memoryMb?: number;
    version?: string;
    agents?: string[];
    capabilities?: string[];
    metadata?: Record<string, any>;
  }): Promise<WorkerNode> {
    const now = new Date().toISOString();
    const existing = this.nodes.get(data.nodeId);
    const node: WorkerNode = {
      nodeId: data.nodeId,
      name: data.name || data.nodeId,
      host: data.host,
      port: data.port,
      url: `http://${data.host}:${data.port}`,
      platform: data.platform || 'unknown',
      arch: data.arch || 'unknown',
      cpuCount: data.cpuCount || 0,
      memoryMb: data.memoryMb || 0,
      version: data.version || 'unknown',
      agents: data.agents || existing?.agents || [],
      capabilities: data.capabilities || [],
      status: 'online',
      registeredAt: existing?.registeredAt || now,
      lastHeartbeat: now,
      metadata: data.metadata || existing?.metadata || {},
    };
    this.nodes.set(node.nodeId, node);
    this.emit(node.nodeId, node, 'register');

    // Persist
    if (this.db) {
      try {
        await this.db.execute(
          `INSERT INTO cluster_nodes (node_id, name, host, port, url, platform, arch, cpu_count, memory_mb, version, agents, capabilities, status, registered_at, last_heartbeat, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (node_id) DO UPDATE SET
             name=$2, host=$3, port=$4, url=$5, platform=$6, arch=$7, cpu_count=$8, memory_mb=$9, version=$10,
             agents=$11, capabilities=$12, status=$13, last_heartbeat=$15, metadata=$16`,
          [node.nodeId, node.name, node.host, node.port, node.url, node.platform, node.arch,
           node.cpuCount, node.memoryMb, node.version, JSON.stringify(node.agents),
           JSON.stringify(node.capabilities), node.status, node.registeredAt, node.lastHeartbeat,
           JSON.stringify(node.metadata)]
        );
      } catch (e: any) { console.warn('[cluster] DB persist error:', e.message); }
    }

    return node;
  }

  /** Worker sends heartbeat (every 30s) */
  heartbeat(nodeId: string, data?: { agents?: string[]; cpuUsage?: number; memoryUsage?: number }): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.lastHeartbeat = new Date().toISOString();
    node.status = 'online';
    if (data?.agents) node.agents = data.agents;
    if (data?.cpuUsage != null && node.metadata) node.metadata.cpuUsage = data.cpuUsage;
    if (data?.memoryUsage != null && node.metadata) node.metadata.memoryUsage = data.memoryUsage;
    this.emit(nodeId, node, 'heartbeat');
  }

  /** Remove a worker node */
  async remove(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    this.nodes.delete(nodeId);
    if (node) this.emit(nodeId, { ...node, status: 'offline' }, 'offline');
    if (this.db) {
      try { await this.db.execute('DELETE FROM cluster_nodes WHERE node_id = $1', [nodeId]); } catch {}
    }
  }

  /** Get a specific node */
  getNode(nodeId: string): WorkerNode | undefined { return this.nodes.get(nodeId); }

  /** Get all nodes */
  getAllNodes(): WorkerNode[] { return Array.from(this.nodes.values()); }

  /** Get online nodes */
  getOnlineNodes(): WorkerNode[] { return this.getAllNodes().filter(n => n.status === 'online'); }

  /** Get cluster-wide stats */
  getStats(): ClusterStats {
    const nodes = this.getAllNodes();
    const online = nodes.filter(n => n.status === 'online');
    return {
      totalNodes: nodes.length,
      onlineNodes: online.length,
      totalAgents: nodes.reduce((s, n) => s + n.agents.length, 0),
      totalCpus: online.reduce((s, n) => s + n.cpuCount, 0),
      totalMemoryMb: online.reduce((s, n) => s + n.memoryMb, 0),
    };
  }

  /** Find best node for a new agent (simple: least agents on online node) */
  findBestNode(capabilities?: string[]): WorkerNode | null {
    let candidates = this.getOnlineNodes();
    if (capabilities?.length) {
      candidates = candidates.filter(n => capabilities.every(c => n.capabilities.includes(c)));
    }
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a.agents.length - b.agents.length)[0];
  }

  /** Subscribe to cluster events (for SSE) */
  subscribe(listener: NodeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(nodeId: string, node: WorkerNode, event: 'register' | 'heartbeat' | 'offline' | 'update'): void {
    for (const listener of this.listeners) {
      try { listener(nodeId, node, event); } catch {}
    }
  }

  private checkStale(): void {
    const now = Date.now();
    for (const [nodeId, node] of this.nodes) {
      if (node.status === 'offline') continue;
      if (node.lastHeartbeat) {
        const elapsed = now - new Date(node.lastHeartbeat).getTime();
        if (elapsed > this.staleThresholdMs) {
          node.status = 'offline';
          node.agents = [];
          this.emit(nodeId, node, 'offline');
        }
      }
    }
  }

  destroy(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.listeners.clear();
  }
}

function safeParse(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
