/**
 * AgenticMail Enterprise Manager
 *
 * Central orchestrator that connects agents to their org email.
 * Manages email provider instances per agent and provides the
 * tool handler interface for the enterprise agent system.
 *
 * Architecture:
 *   Agent (from org directory via OAuth)
 *     → AgenticMailManager.getProvider(agentId)
 *       → IEmailProvider (Microsoft Graph / Gmail API)
 *         → Org's email system
 *
 * No separate AgenticMail server. No API keys. No relay setup.
 * The agent IS the org identity.
 */

import type { EngineDatabase } from '../engine/db-adapter.js';
import type {
  IEmailProvider, AgentEmailIdentity, EmailProvider,
  AgentMessage, AgentTask,
} from './types.js';
import { createEmailProvider } from './providers/index.js';

export interface AgenticMailManagerOptions {
  db?: EngineDatabase;
}

export class AgenticMailManager {
  private providers = new Map<string, IEmailProvider>();
  private identities = new Map<string, AgentEmailIdentity>();
  private db?: EngineDatabase;

  constructor(opts?: AgenticMailManagerOptions) {
    this.db = opts?.db;
  }

  setDb(db: EngineDatabase): void {
    this.db = db;
  }

  // ─── Agent Registration ─────────────────────────────

  /**
   * Register an agent's email identity from the org's OAuth/SSO.
   * Called when an agent is created or when its OAuth token is refreshed.
   */
  async registerAgent(identity: AgentEmailIdentity): Promise<void> {
    this.identities.set(identity.agentId, identity);

    // Create and connect the email provider
    const provider = createEmailProvider(identity.provider);
    await provider.connect(identity);
    this.providers.set(identity.agentId, provider);
  }

  /**
   * Unregister an agent (on deletion or token revocation).
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const provider = this.providers.get(agentId);
    if (provider) {
      await provider.disconnect().catch(() => {});
      this.providers.delete(agentId);
    }
    this.identities.delete(agentId);
  }

  /**
   * Get the email provider for an agent.
   * Throws if agent is not registered.
   */
  getProvider(agentId: string): IEmailProvider {
    const provider = this.providers.get(agentId);
    if (!provider) throw new Error(`Agent ${agentId} has no email provider registered. Ensure the agent has been connected via org OAuth.`);
    return provider;
  }

  /**
   * Get the email identity for an agent.
   */
  getIdentity(agentId: string): AgentEmailIdentity | undefined {
    return this.identities.get(agentId);
  }

  /**
   * Check if an agent has email access.
   */
  hasEmail(agentId: string): boolean {
    return this.providers.has(agentId);
  }

  // ─── Inter-Agent Messaging ──────────────────────────
  // These use the enterprise DB directly, not email.
  // Agents in the same org can message each other without email.

  /**
   * Send a message from one agent to another (internal, no email).
   */
  async sendAgentMessage(from: string, to: string, subject: string, body: string, priority: 'normal' | 'high' | 'urgent' = 'normal'): Promise<AgentMessage> {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      from,
      to,
      subject,
      body,
      priority,
      createdAt: new Date().toISOString(),
      read: false,
    };

    if (this.db) {
      await this.db.execute(
        `INSERT INTO agent_messages (id, from_agent, to_agent, subject, body, priority, created_at, read)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [msg.id, msg.from, msg.to, msg.subject, msg.body, msg.priority, msg.createdAt]
      ).catch(() => {});
    }

    return msg;
  }

  /**
   * Get unread messages for an agent.
   */
  async getAgentMessages(agentId: string, opts?: { unreadOnly?: boolean; limit?: number }): Promise<AgentMessage[]> {
    if (!this.db) return [];
    try {
      let sql = 'SELECT * FROM agent_messages WHERE to_agent = ?';
      const params: any[] = [agentId];
      if (opts?.unreadOnly) {
        sql += ' AND read = 0';
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(opts?.limit || 20);

      const rows = await this.db.query<any>(sql, params);
      return rows.map((r: any) => ({
        id: r.id,
        from: r.from_agent,
        to: r.to_agent,
        subject: r.subject,
        body: r.body,
        priority: r.priority,
        createdAt: r.created_at,
        read: !!r.read,
      }));
    } catch {
      return [];
    }
  }

  // ─── Task Management ────────────────────────────────
  // Tasks also use the enterprise DB directly.

  /**
   * Create a task assigned to an agent.
   */
  async createTask(assigner: string, assignee: string, title: string, description?: string, priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'): Promise<AgentTask> {
    const now = new Date().toISOString();
    const task: AgentTask = {
      id: crypto.randomUUID(),
      assigner,
      assignee,
      title,
      description,
      status: 'pending',
      priority,
      createdAt: now,
      updatedAt: now,
    };

    if (this.db) {
      await this.db.execute(
        `INSERT INTO agent_tasks (id, assigner, assignee, title, description, status, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [task.id, task.assigner, task.assignee, task.title, task.description || null, task.status, task.priority, task.createdAt, task.updatedAt]
      ).catch(() => {});
    }

    return task;
  }

  /**
   * Get tasks for an agent.
   */
  async getAgentTasks(agentId: string, direction: 'incoming' | 'outgoing' = 'incoming', status?: string): Promise<AgentTask[]> {
    if (!this.db) return [];
    try {
      const col = direction === 'incoming' ? 'assignee' : 'assigner';
      let sql = `SELECT * FROM agent_tasks WHERE ${col} = ?`;
      const params: any[] = [agentId];
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY created_at DESC LIMIT 50';

      const rows = await this.db.query<any>(sql, params);
      return rows.map((r: any) => ({
        id: r.id,
        assigner: r.assigner,
        assignee: r.assignee,
        title: r.title,
        description: r.description,
        status: r.status,
        priority: r.priority,
        result: r.result ? JSON.parse(r.result) : undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Update task status.
   */
  async updateTask(taskId: string, updates: { status?: string; result?: any }): Promise<void> {
    if (!this.db) return;
    const sets: string[] = ['updated_at = ?'];
    const params: any[] = [new Date().toISOString()];
    if (updates.status) { sets.push('status = ?'); params.push(updates.status); }
    if (updates.result !== undefined) { sets.push('result = ?'); params.push(JSON.stringify(updates.result)); }
    params.push(taskId);
    await this.db.execute(`UPDATE agent_tasks SET ${sets.join(', ')} WHERE id = ?`, params).catch(() => {});
  }

  // ─── Lifecycle ──────────────────────────────────────

  /**
   * Get all registered agents and their email status.
   */
  getRegisteredAgents(): { agentId: string; email: string; provider: EmailProvider }[] {
    const agents: { agentId: string; email: string; provider: EmailProvider }[] = [];
    for (const [agentId, identity] of this.identities) {
      agents.push({ agentId, email: identity.email, provider: identity.provider });
    }
    return agents;
  }

  /**
   * Shutdown — disconnect all providers.
   */
  async shutdown(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.disconnect().catch(() => {});
    }
    this.providers.clear();
    this.identities.clear();
  }
}
