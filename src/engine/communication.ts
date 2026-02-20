/**
 * Agent Communication Observer, Tracker & Topology Graph
 *
 * AgenticMail agents communicate via email inboxes (agenticmail_message_agent,
 * agenticmail_call_agent, agenticmail_send, etc.). This module provides enterprise-level
 * visibility into ALL agent communication traffic by:
 *
 * 1. Maintaining an Agent Email Registry (email → agentId) for each org
 * 2. Observing real tool calls in the hook pipeline (observeToolCall)
 * 3. Classifying traffic: internal (agent→agent), external (agent→customer), escalation
 * 4. Tracking communication channels: direct tools, email, task delegation
 * 5. Building a topology graph of agent communication patterns
 * 6. Persisting records for audit/compliance/dashboard
 *
 * Primary data flow:
 *   Agent calls agenticmail_send(to: "research@agenticmail.io") → hook afterToolCall fires →
 *   hook calls /messages/observe → observeToolCall() resolves email via registry →
 *   classifies as internal/external → creates AgentMessage record → dashboard displays
 *
 * Agent Email Registry:
 *   Built from AgentLifecycleManager.getAgentsByOrg() → maps email → agentId
 *   Auto-refreshes on agent create/update/delete lifecycle events
 */

import type { EngineDatabase } from './db-adapter.js';
import type { AgentLifecycleManager } from './lifecycle.js';

// ─── Types ──────────────────────────────────────────────

export type MessageType = 'message' | 'task' | 'handoff' | 'broadcast';
export type MessageStatus = 'pending' | 'delivered' | 'read' | 'completed' | 'failed';
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';
export type CommunicationDirection = 'internal' | 'external_outbound' | 'external_inbound' | 'escalation';
export type CommunicationChannel = 'direct' | 'email' | 'task';

export interface AgentMessage {
  id: string;
  orgId: string;
  fromAgentId: string;
  toAgentId: string;
  type: MessageType;
  subject: string;
  content: string;
  metadata: Record<string, any>;
  status: MessageStatus;
  parentId?: string;
  priority: MessagePriority;
  direction?: CommunicationDirection;
  channel?: CommunicationChannel;
  deadline?: string;
  claimedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Topology Types ─────────────────────────────────────

export interface TopologyNode {
  id: string;
  type: 'agent' | 'external';
  name: string;
  email?: string;
  state?: string;
}

export interface TopologyEdge {
  from: string;
  to: string;
  messageCount: number;
  channels: Record<string, number>;
  direction: CommunicationDirection;
  lastActivity: string;
}

export interface CommunicationTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  stats: {
    totalMessages: number;
    internalMessages: number;
    externalOutbound: number;
    externalInbound: number;
    activeAgents: number;
    externalParties: number;
    channelBreakdown: Record<string, number>;
  };
}

// ─── Agent Email Registry Entry ─────────────────────────

interface RegistryEntry {
  agentId: string;
  orgId: string;
  name: string;
  displayName: string;
}

// ─── Communication Bus ──────────────────────────────────

export class AgentCommunicationBus {
  private messages: AgentMessage[] = [];
  private engineDb?: EngineDatabase;
  private listeners = new Map<string, ((msg: AgentMessage) => void)[]>();

  // Agent Email Registry — maps lowercase email → agent info
  private emailToAgent = new Map<string, RegistryEntry>();
  private orgAgentEmails = new Map<string, Set<string>>();
  private lifecycle?: AgentLifecycleManager;

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  /**
   * Connect to the lifecycle manager for agent email resolution.
   * Subscribes to lifecycle events to auto-refresh the registry.
   */
  setLifecycle(lm: AgentLifecycleManager): void {
    this.lifecycle = lm;

    // Subscribe to lifecycle events for auto-refresh
    lm.onEvent((event) => {
      if (['created', 'configured', 'updated', 'destroyed', 'started', 'stopped'].includes(event.type)) {
        this.refreshAgentRegistry(event.orgId);
      }
    });

    // Initial registry build from all agents currently in memory
    this.buildInitialRegistry();
  }

  /**
   * Build the registry from all agents the lifecycle manager currently knows about.
   */
  private buildInitialRegistry(): void {
    if (!this.lifecycle) return;
    // The lifecycle manager stores agents in a Map — we need all unique orgIds
    // Iterate known orgs from existing messages + try common defaults
    const orgIds = new Set<string>();
    for (const msg of this.messages) orgIds.add(msg.orgId);
    orgIds.add('default'); // common default org
    for (const orgId of orgIds) {
      this.refreshAgentRegistry(orgId);
    }
  }

  /**
   * Refresh the email registry for a specific org.
   * Pulls all agents from lifecycle, clears old entries, rebuilds.
   */
  refreshAgentRegistry(orgId: string): void {
    if (!this.lifecycle) return;
    const agents = this.lifecycle.getAgentsByOrg(orgId);

    // Clear old entries for this org
    const oldEmails = this.orgAgentEmails.get(orgId);
    if (oldEmails) {
      for (const email of oldEmails) this.emailToAgent.delete(email);
    }

    // Rebuild
    const newEmails = new Set<string>();
    for (const agent of agents) {
      const email = agent.config?.email?.address;
      if (email) {
        const normalized = email.toLowerCase().trim();
        this.emailToAgent.set(normalized, {
          agentId: agent.id,
          orgId,
          name: agent.config.name,
          displayName: agent.config.displayName,
        });
        newEmails.add(normalized);
      }
    }
    this.orgAgentEmails.set(orgId, newEmails);
  }

  /**
   * Resolve an email address to an agent in the registry.
   * Returns null if the email doesn't belong to any registered agent.
   */
  resolveEmail(email: string, _orgId: string): RegistryEntry | null {
    return this.emailToAgent.get(email.toLowerCase().trim()) || null;
  }

  /**
   * Partition a list of email recipients into internal (agents) and external addresses.
   */
  resolveRecipients(recipients: string[], orgId: string): {
    internal: Array<{ email: string; agentId: string; name: string }>;
    external: string[];
  } {
    const internal: Array<{ email: string; agentId: string; name: string }> = [];
    const external: string[] = [];
    for (const raw of recipients) {
      const email = raw.toLowerCase().trim();
      if (!email) continue;
      const entry = this.emailToAgent.get(email);
      if (entry && entry.orgId === orgId) {
        internal.push({ email, agentId: entry.agentId, name: entry.displayName });
      } else {
        external.push(email);
      }
    }
    return { internal, external };
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>(
        "SELECT * FROM agent_messages ORDER BY created_at DESC LIMIT 500"
      );
      this.messages = rows.map((r: any) => ({
        id: r.id, orgId: r.org_id, fromAgentId: r.from_agent_id, toAgentId: r.to_agent_id,
        type: r.type, subject: r.subject, content: r.content,
        metadata: r.metadata ? JSON.parse(r.metadata) : {},
        status: r.status, parentId: r.parent_id, priority: r.priority || 'normal',
        direction: r.direction || 'internal', channel: r.channel || 'direct',
        deadline: r.deadline, claimedAt: r.claimed_at, completedAt: r.completed_at,
        createdAt: r.created_at, updatedAt: r.updated_at || r.created_at,
      }));
    } catch { /* table may not exist yet */ }
  }

  // ─── Tool Call Observation ───────────────────────────
  // Captures real AgenticMail traffic from the hook pipeline
  // and classifies it using the agent email registry

  /** Dedicated inter-agent tools (always internal) */
  private static INTER_AGENT_TOOLS = new Set([
    'agenticmail_message_agent', 'agenticmail_call_agent',
    'agenticmail_check_tasks', 'agenticmail_claim_task',
    'agenticmail_complete_task', 'agenticmail_submit_result',
  ]);

  /** Email tools (may be internal OR external depending on recipient) */
  private static EMAIL_TOOLS = new Set([
    'agenticmail_send', 'agenticmail_reply', 'agenticmail_forward',
  ]);

  /** All communication tools */
  isCommunicationTool(toolId: string): boolean {
    return AgentCommunicationBus.INTER_AGENT_TOOLS.has(toolId) ||
           AgentCommunicationBus.EMAIL_TOOLS.has(toolId);
  }

  /**
   * Observe a tool call from the hook pipeline.
   * Resolves recipients via the agent email registry to classify traffic.
   * Returns array of created/updated messages (one email can have multiple recipients).
   */
  async observeToolCall(opts: {
    orgId: string;
    agentId: string;
    toolId: string;
    toolName: string;
    parameters?: Record<string, any>;
    result?: any;
  }): Promise<AgentMessage[]> {
    const { orgId, agentId, toolId, parameters, result } = opts;
    const params = parameters || {};
    const res = typeof result === 'string' ? { output: result } : (result || {});
    const now = new Date().toISOString();

    // agenticmail_message_agent → direct message (always internal)
    if (toolId === 'agenticmail_message_agent') {
      const msg = await this.persistMessage({
        id: crypto.randomUUID(),
        orgId, fromAgentId: agentId,
        toAgentId: params.agent || params.to || 'unknown',
        type: 'message',
        subject: params.subject || '(direct message)',
        content: params.text || params.content || '',
        metadata: { source: 'observed', toolId, messageId: res.messageId },
        status: 'delivered',
        priority: params.priority || 'normal',
        direction: 'internal',
        channel: 'direct',
        createdAt: now, updatedAt: now,
      });
      return [msg];
    }

    // agenticmail_call_agent → task delegation (always internal)
    if (toolId === 'agenticmail_call_agent') {
      const msg = await this.persistMessage({
        id: crypto.randomUUID(),
        orgId, fromAgentId: agentId,
        toAgentId: params.agent || params.name || 'unknown',
        type: 'task',
        subject: params.task ? params.task.substring(0, 100) : '(task)',
        content: params.task || params.message || '',
        metadata: { source: 'observed', toolId, async: params.async, mode: res.mode, taskId: res.taskId },
        status: res.status === 'completed' ? 'completed' : 'pending',
        priority: 'normal',
        direction: 'internal',
        channel: 'task',
        completedAt: res.status === 'completed' ? now : undefined,
        createdAt: now, updatedAt: now,
      });
      return [msg];
    }

    // agenticmail_claim_task → update existing task
    if (toolId === 'agenticmail_claim_task') {
      const taskId = params.taskId || params.id;
      if (taskId) {
        const existing = this.messages.find(m => m.metadata?.taskId === taskId && m.type === 'task');
        if (existing) {
          existing.status = 'read';
          existing.claimedAt = now;
          existing.updatedAt = now;
          this.updateInDb(existing);
          return [existing];
        }
      }
      return [];
    }

    // agenticmail_complete_task / agenticmail_submit_result → complete task
    if (toolId === 'agenticmail_complete_task' || toolId === 'agenticmail_submit_result') {
      const taskId = params.taskId || params.id;
      if (taskId) {
        const existing = this.messages.find(m => m.metadata?.taskId === taskId && m.type === 'task');
        if (existing) {
          existing.status = 'completed';
          existing.completedAt = now;
          existing.updatedAt = now;
          if (params.result) existing.metadata = { ...existing.metadata, result: params.result };
          this.updateInDb(existing);
          this.notifyListeners(existing.fromAgentId, existing);
          return [existing];
        }
      }
      return [];
    }

    // agenticmail_send/reply/forward → resolve recipients via registry
    if (AgentCommunicationBus.EMAIL_TOOLS.has(toolId)) {
      // Parse all recipients (to, cc, bcc — may be string or array)
      const allRecipients: string[] = [];
      for (const field of ['to', 'cc', 'bcc']) {
        const val = params[field];
        if (val) {
          if (Array.isArray(val)) allRecipients.push(...val);
          else allRecipients.push(...String(val).split(',').map(s => s.trim()));
        }
      }

      if (allRecipients.length === 0) return [];

      // Resolve against agent email registry
      const resolved = this.resolveRecipients(allRecipients, orgId);
      const messages: AgentMessage[] = [];

      // Internal recipients → agent-to-agent email
      for (const recipient of resolved.internal) {
        const msg = await this.persistMessage({
          id: crypto.randomUUID(),
          orgId, fromAgentId: agentId, toAgentId: recipient.agentId,
          type: 'message',
          subject: params.subject || '(email)',
          content: params.text || params.body || params.html || '',
          metadata: { source: 'observed', toolId, messageId: res.messageId || res.id, recipientEmail: recipient.email },
          status: 'delivered',
          priority: 'normal',
          direction: 'internal',
          channel: 'email',
          createdAt: now, updatedAt: now,
        });
        messages.push(msg);
      }

      // External recipients → outbound email
      for (const email of resolved.external) {
        const msg = await this.persistMessage({
          id: crypto.randomUUID(),
          orgId, fromAgentId: agentId, toAgentId: `ext:${email}`,
          type: 'message',
          subject: params.subject || '(email)',
          content: params.text || params.body || params.html || '',
          metadata: { source: 'observed', toolId, messageId: res.messageId || res.id, recipientEmail: email },
          status: 'delivered',
          priority: 'normal',
          direction: 'external_outbound',
          channel: 'email',
          createdAt: now, updatedAt: now,
        });
        messages.push(msg);
      }

      return messages;
    }

    return [];
  }

  // ─── Topology / Communication Graph ─────────────────

  /**
   * Build a communication topology graph from message records.
   * Nodes are agents and external parties; edges are communication relationships.
   */
  getTopology(opts?: {
    orgId?: string;
    since?: string;
    agentId?: string;
  }): CommunicationTopology {
    // Filter messages
    let list = [...this.messages];
    if (opts?.orgId) list = list.filter(m => m.orgId === opts.orgId);
    if (opts?.since) list = list.filter(m => m.createdAt >= opts.since!);
    if (opts?.agentId) list = list.filter(m => m.fromAgentId === opts.agentId || m.toAgentId === opts.agentId);

    // Build node map
    const nodeMap = new Map<string, TopologyNode>();
    const edgeKey = (from: string, to: string) => `${from}→${to}`;
    const edgeMap = new Map<string, { from: string; to: string; count: number; channels: Record<string, number>; direction: CommunicationDirection; lastActivity: string }>();

    for (const msg of list) {
      // Add from node
      if (!nodeMap.has(msg.fromAgentId)) {
        const isExternal = msg.fromAgentId.startsWith('ext:');
        nodeMap.set(msg.fromAgentId, {
          id: msg.fromAgentId,
          type: isExternal ? 'external' : 'agent',
          name: isExternal ? msg.fromAgentId.slice(4) : this.getAgentDisplayName(msg.fromAgentId, msg.orgId),
          email: isExternal ? msg.fromAgentId.slice(4) : this.getAgentEmail(msg.fromAgentId, msg.orgId),
          state: isExternal ? undefined : this.getAgentState(msg.fromAgentId, msg.orgId),
        });
      }

      // Add to node
      if (!nodeMap.has(msg.toAgentId)) {
        const isExternal = msg.toAgentId.startsWith('ext:');
        nodeMap.set(msg.toAgentId, {
          id: msg.toAgentId,
          type: isExternal ? 'external' : 'agent',
          name: isExternal ? msg.toAgentId.slice(4) : this.getAgentDisplayName(msg.toAgentId, msg.orgId),
          email: isExternal ? msg.toAgentId.slice(4) : this.getAgentEmail(msg.toAgentId, msg.orgId),
          state: isExternal ? undefined : this.getAgentState(msg.toAgentId, msg.orgId),
        });
      }

      // Aggregate edge
      const ek = edgeKey(msg.fromAgentId, msg.toAgentId);
      const existing = edgeMap.get(ek);
      const ch = msg.channel || 'direct';
      const dir = msg.direction || 'internal';
      if (existing) {
        existing.count++;
        existing.channels[ch] = (existing.channels[ch] || 0) + 1;
        if (msg.createdAt > existing.lastActivity) existing.lastActivity = msg.createdAt;
      } else {
        edgeMap.set(ek, {
          from: msg.fromAgentId, to: msg.toAgentId,
          count: 1, channels: { [ch]: 1 }, direction: dir,
          lastActivity: msg.createdAt,
        });
      }
    }

    // Compute stats
    const stats = {
      totalMessages: list.length,
      internalMessages: list.filter(m => m.direction === 'internal').length,
      externalOutbound: list.filter(m => m.direction === 'external_outbound').length,
      externalInbound: list.filter(m => m.direction === 'external_inbound').length,
      activeAgents: Array.from(nodeMap.values()).filter(n => n.type === 'agent').length,
      externalParties: Array.from(nodeMap.values()).filter(n => n.type === 'external').length,
      channelBreakdown: {} as Record<string, number>,
    };
    for (const msg of list) {
      const ch = msg.channel || 'direct';
      stats.channelBreakdown[ch] = (stats.channelBreakdown[ch] || 0) + 1;
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()).map(e => ({
        from: e.from, to: e.to, messageCount: e.count,
        channels: e.channels, direction: e.direction, lastActivity: e.lastActivity,
      })),
      stats,
    };
  }

  // ─── Registry Helpers for Topology ──────────────────

  private getAgentDisplayName(agentId: string, orgId: string): string {
    if (!this.lifecycle) return agentId;
    const agent = this.lifecycle.getAgent(agentId);
    if (agent) return agent.config.displayName || agent.config.name;
    // Also check by name (some tools pass agent name, not ID)
    const agents = this.lifecycle.getAgentsByOrg(orgId);
    const byName = agents.find(a => a.config.name === agentId);
    return byName ? byName.config.displayName : agentId;
  }

  private getAgentEmail(agentId: string, orgId: string): string | undefined {
    if (!this.lifecycle) return undefined;
    const agent = this.lifecycle.getAgent(agentId);
    if (agent) return agent.config?.email?.address;
    const agents = this.lifecycle.getAgentsByOrg(orgId);
    const byName = agents.find(a => a.config.name === agentId);
    return byName?.config?.email?.address;
  }

  private getAgentState(agentId: string, orgId: string): string | undefined {
    if (!this.lifecycle) return undefined;
    const agent = this.lifecycle.getAgent(agentId);
    if (agent) return agent.state;
    const agents = this.lifecycle.getAgentsByOrg(orgId);
    const byName = agents.find(a => a.config.name === agentId);
    return byName?.state;
  }

  // ─── Admin-Initiated Messages ─────────────────────
  // These methods are for admin dashboard use — sending messages
  // directly to agents outside the normal AgenticMail email flow.

  /** Send an admin-initiated message (not via AgenticMail email) */
  async sendMessage(opts: {
    orgId: string;
    fromAgentId: string;
    toAgentId: string;
    subject: string;
    content: string;
    priority?: MessagePriority;
    parentId?: string;
    metadata?: Record<string, any>;
  }): Promise<AgentMessage> {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      orgId: opts.orgId,
      fromAgentId: opts.fromAgentId,
      toAgentId: opts.toAgentId,
      type: 'message',
      subject: opts.subject,
      content: opts.content,
      metadata: opts.metadata || {},
      status: 'pending',
      parentId: opts.parentId,
      priority: opts.priority || 'normal',
      direction: 'internal',
      channel: 'direct',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.persistMessage(msg);
  }

  async broadcast(opts: {
    orgId: string;
    fromAgentId: string;
    subject: string;
    content: string;
    agentIds: string[];
    priority?: MessagePriority;
  }): Promise<AgentMessage[]> {
    const results: AgentMessage[] = [];
    for (const toId of opts.agentIds) {
      if (toId === opts.fromAgentId) continue;
      const msg: AgentMessage = {
        id: crypto.randomUUID(),
        orgId: opts.orgId,
        fromAgentId: opts.fromAgentId,
        toAgentId: toId,
        type: 'broadcast',
        subject: opts.subject,
        content: opts.content,
        metadata: {},
        status: 'pending',
        priority: opts.priority || 'normal',
        direction: 'internal',
        channel: 'direct',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      results.push(await this.persistMessage(msg));
    }
    return results;
  }

  // ─── Task Delegation ───────────────────────────────

  async delegateTask(opts: {
    orgId: string;
    fromAgentId: string;
    toAgentId: string;
    subject: string;
    content: string;
    deadline?: string;
    priority?: MessagePriority;
    metadata?: Record<string, any>;
  }): Promise<AgentMessage> {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      orgId: opts.orgId,
      fromAgentId: opts.fromAgentId,
      toAgentId: opts.toAgentId,
      type: 'task',
      subject: opts.subject,
      content: opts.content,
      metadata: opts.metadata || {},
      status: 'pending',
      priority: opts.priority || 'normal',
      direction: 'internal',
      channel: 'task',
      deadline: opts.deadline,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.persistMessage(msg);
  }

  async claimTask(messageId: string, agentId: string): Promise<AgentMessage | null> {
    const msg = this.messages.find(m => m.id === messageId && m.type === 'task');
    if (!msg || msg.toAgentId !== agentId) return null;
    msg.status = 'read';
    msg.claimedAt = new Date().toISOString();
    msg.updatedAt = new Date().toISOString();
    this.updateInDb(msg);
    return msg;
  }

  async completeTask(messageId: string, agentId: string, result?: Record<string, any>): Promise<AgentMessage | null> {
    const msg = this.messages.find(m => m.id === messageId && m.type === 'task');
    if (!msg || msg.toAgentId !== agentId) return null;
    msg.status = 'completed';
    msg.completedAt = new Date().toISOString();
    msg.updatedAt = new Date().toISOString();
    if (result) msg.metadata = { ...msg.metadata, result };
    this.updateInDb(msg);
    this.notifyListeners(msg.fromAgentId, msg);
    return msg;
  }

  // ─── Handoff ──────────────────────────────────────

  async handoff(opts: {
    orgId: string;
    fromAgentId: string;
    toAgentId: string;
    subject: string;
    conversationContext: string;
    metadata?: Record<string, any>;
  }): Promise<AgentMessage> {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      orgId: opts.orgId,
      fromAgentId: opts.fromAgentId,
      toAgentId: opts.toAgentId,
      type: 'handoff',
      subject: opts.subject,
      content: opts.conversationContext || '',
      metadata: opts.metadata || {},
      status: 'pending',
      priority: 'high',
      direction: 'internal',
      channel: 'direct',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.persistMessage(msg);
  }

  // ─── Read & Query ─────────────────────────────────

  async markRead(messageId: string): Promise<void> {
    const msg = this.messages.find(m => m.id === messageId);
    if (!msg || msg.status !== 'pending') return;
    msg.status = 'read';
    msg.updatedAt = new Date().toISOString();
    this.updateInDb(msg);
  }

  getMessages(opts?: {
    orgId?: string;
    agentId?: string;
    type?: MessageType;
    status?: MessageStatus;
    direction?: CommunicationDirection;
    channel?: CommunicationChannel;
    limit?: number;
    offset?: number;
  }): { messages: AgentMessage[]; total: number } {
    let list = [...this.messages];
    if (opts?.orgId) list = list.filter(m => m.orgId === opts.orgId);
    if (opts?.agentId) list = list.filter(m => m.toAgentId === opts.agentId || m.fromAgentId === opts.agentId);
    if (opts?.type) list = list.filter(m => m.type === opts.type);
    if (opts?.status) list = list.filter(m => m.status === opts.status);
    if (opts?.direction) list = list.filter(m => m.direction === opts.direction);
    if (opts?.channel) list = list.filter(m => m.channel === opts.channel);
    const total = list.length;
    const offset = opts?.offset || 0;
    return { messages: list.slice(offset, offset + (opts?.limit || 50)), total };
  }

  getMessage(id: string): AgentMessage | undefined {
    return this.messages.find(m => m.id === id);
  }

  getInbox(agentId: string, orgId?: string): AgentMessage[] {
    let list = this.messages.filter(m => m.toAgentId === agentId && m.status !== 'completed');
    if (orgId) list = list.filter(m => m.orgId === orgId);
    return list.slice(0, 100);
  }

  // ─── Listeners ────────────────────────────────────

  onMessage(agentId: string, callback: (msg: AgentMessage) => void): () => void {
    const existing = this.listeners.get(agentId) || [];
    existing.push(callback);
    this.listeners.set(agentId, existing);
    return () => {
      const cbs = this.listeners.get(agentId) || [];
      this.listeners.set(agentId, cbs.filter(c => c !== callback));
    };
  }

  private notifyListeners(agentId: string, msg: AgentMessage): void {
    const cbs = this.listeners.get(agentId) || [];
    for (const cb of cbs) {
      try { cb(msg); } catch { /* listener error */ }
    }
  }

  // ─── Persistence ──────────────────────────────────

  private async persistMessage(msg: AgentMessage): Promise<AgentMessage> {
    this.messages.unshift(msg);
    if (this.messages.length > 2000) this.messages = this.messages.slice(0, 2000);

    this.notifyListeners(msg.toAgentId, msg);

    this.engineDb?.execute(
      `INSERT INTO agent_messages (id, org_id, from_agent_id, to_agent_id, type, subject, content, metadata, status, parent_id, priority, direction, channel, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [msg.id, msg.orgId, msg.fromAgentId, msg.toAgentId, msg.type, msg.subject, msg.content,
       JSON.stringify(msg.metadata), msg.status, msg.parentId || null, msg.priority,
       msg.direction || 'internal', msg.channel || 'direct', msg.deadline || null,
       msg.createdAt, msg.updatedAt]
    ).catch((err) => { console.error('[comm] Failed to persist message:', err); });

    return msg;
  }

  private updateInDb(msg: AgentMessage): void {
    this.engineDb?.execute(
      'UPDATE agent_messages SET status = ?, claimed_at = ?, completed_at = ?, metadata = ?, updated_at = ? WHERE id = ?',
      [msg.status, msg.claimedAt || null, msg.completedAt || null, JSON.stringify(msg.metadata), msg.updatedAt, msg.id]
    ).catch((err) => { console.error('[comm] Failed to update message:', err); });
  }
}
