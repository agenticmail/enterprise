/**
 * Agent Hierarchy & Management System
 *
 * Enterprise-grade organizational management for AI agent teams.
 * Models real human organizations with all edge cases:
 *
 * HIERARCHY:
 * - Org chart resolution (who reports to whom, depth levels)
 * - Escalation chains (subordinate → manager → manager's manager)
 * - External manager support (human managers via email/messaging)
 *
 * COMMUNICATION:
 * - Channel priority: Google Chat DM > Gmail > AgenticMail internal
 * - Automatic channel resolution per agent pair
 * - External manager notification via configured channel
 *
 * DELEGATION:
 * - Pre-delegation checks: agent online? clocked in? has capacity? has right tools?
 * - SLA tracking with urgency-based deadlines
 * - Auto-check-in cadence (manager monitors subordinate progress)
 * - Crash/timeout detection with auto-escalation
 * - Workload balancing (prevent overloading agents)
 * - Auto-reassignment when agent is offline/overloaded
 *
 * PROMPT INJECTION:
 * - Dynamic — only injected when relevant to the current session context
 * - Agents with no manager and no reports get ZERO management prompt
 * - Managers only get team status when session involves management actions
 * - Subordinates only get task list when they have pending tasks
 *
 * MONITORING:
 * - Periodic task health checks (is assignee still alive?)
 * - Overdue task alerts to manager
 * - Stale task cleanup
 * - Agent crash → auto-notify manager + attempt reassignment
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export type CommChannel = 'google_chat' | 'gmail' | 'agenticmail' | 'whatsapp' | 'telegram';

export interface AgentCommConfig {
  email?: string;
  enabledGoogleServices?: string[];
  hasGoogleChat: boolean;
  hasGmail: boolean;
  whatsappEnabled: boolean;
  telegramEnabled: boolean;
  agenticmailEnabled: boolean;
  /** All enabled skills/tools for capability checking */
  enabledSkills?: string[];
  /** Tool access map from agent config */
  toolAccess?: Record<string, boolean>;
}

export interface AgentHierarchyNode {
  agentId: string;
  name: string;
  role: string;
  state: string;            // running, stopped, error, etc.
  managerId: string | null;
  managerType: 'internal' | 'external' | 'none';
  managerName?: string;
  managerEmail?: string;
  subordinateIds: string[];
  subordinateCount: number;
  isManager: boolean;
  level: number;
  comm: AgentCommConfig;
  // Live state (populated from usage/config)
  clockedIn: boolean;
  activeTasks: number;       // currently assigned tasks (pending + in_progress)
  errorsToday: number;
  lastActivityAt?: string;
  workHours?: { enabled: boolean; start: string; end: string; days?: number[]; timezone?: string };
}

export interface DelegatedTask {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'accepted' | 'in_progress' | 'blocked' | 'completed' | 'rejected' | 'reassigned' | 'expired';
  dueDate?: string;
  slaHours?: number;         // Expected completion time in hours
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: string;
  blockerReason?: string;
  feedback?: string;
  /** Required tools/skills for this task */
  requiredTools?: string[];
  /** Check-in cadence in minutes (manager checks on progress) */
  checkInIntervalMin?: number;
  lastCheckInAt?: string;
  /** Number of times manager has checked in */
  checkInCount: number;
  /** If reassigned, original assignee */
  originalAgentId?: string;
  /** Reason for reassignment */
  reassignReason?: string;
}

export interface EscalationRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  subject: string;
  context: string;
  status: 'pending' | 'resolved' | 'forwarded';
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface TeamStatus {
  managerId: string;
  managerName: string;
  directReports: {
    agentId: string;
    name: string;
    role: string;
    state: string;
    clockedIn: boolean;
    available: boolean;       // running + clocked in + not overloaded
    pendingTasks: number;
    inProgressTasks: number;
    completedTasksToday: number;
    blockedTasks: number;
    overdueTasks: number;
    lastActivity?: string;
    tokenUsageToday: number;
    errorsToday: number;
    capacityPercent: number;  // 0-100, 100 = fully loaded
  }[];
  teamSize: number;
  activeCount: number;
  availableCount: number;     // agents that can take new work
  totalPendingTasks: number;
  totalOverdueTasks: number;
  totalCompletedToday: number;
}

/** Pre-delegation check result */
export interface DelegationCheck {
  canDelegate: boolean;
  warnings: string[];
  blockers: string[];
  /** Suggested alternative agent if primary can't take it */
  alternativeAgentId?: string;
  alternativeReason?: string;
}

/** Max concurrent tasks before agent is considered overloaded */
const MAX_CONCURRENT_TASKS = 5;
/** Default SLA hours by priority */
const DEFAULT_SLA_HOURS: Record<string, number> = { urgent: 1, high: 4, medium: 24, low: 72 };
/** Default check-in interval by priority (minutes) */
const DEFAULT_CHECKIN_INTERVAL: Record<string, number> = { urgent: 15, high: 30, medium: 120, low: 480 };

// ─── Hierarchy Manager ──────────────────────────────────

export class AgentHierarchyManager {
  private db: EngineDatabase;
  private hierarchyCache: Map<string, AgentHierarchyNode> = new Map();
  private cacheExpiry = 0;
  private CACHE_TTL = 30_000; // 30s
  /** Background monitor interval */
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(db: EngineDatabase) {
    this.db = db;
  }

  // ─── Lifecycle ────────────────────────────────────────

  /**
   * Start the background task monitor.
   * Checks for overdue tasks, stale assignments, crashed agents.
   * Runs every 5 minutes.
   */
  startMonitor(): void {
    if (this.monitorInterval) return;
    this.monitorInterval = setInterval(() => this.runMonitorCycle().catch(e =>
      console.error(`[hierarchy] Monitor error: ${e.message}`)
    ), 5 * 60_000);
    console.log('[hierarchy] Task monitor started (5min interval)');
  }

  stopMonitor(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Background monitor cycle:
   * 1. Find overdue tasks → mark as expired, notify manager
   * 2. Find tasks assigned to crashed/stopped agents → auto-reassign or alert
   * 3. Find stale pending tasks (not accepted in 30min) → alert manager
   */
  private async runMonitorCycle(): Promise<void> {
    const now = new Date().toISOString();
    const hierarchy = await this.buildHierarchy();

    // 1. Overdue tasks (past SLA)
    try {
      const overdue = await this.db.query<any>(
        `SELECT * FROM agent_delegated_tasks 
         WHERE status IN ('pending', 'accepted', 'in_progress') 
         AND due_date IS NOT NULL AND due_date < $1`,
        [now]
      );
      for (const task of (overdue || [])) {
        // Mark as expired
        await this.db.query(
          `UPDATE agent_delegated_tasks SET status = 'expired', updated_at = $1 WHERE id = $2 AND status NOT IN ('completed', 'expired', 'reassigned')`,
          [now, task.id]
        );
        console.log(`[hierarchy] Task expired: "${task.title}" (${task.id}) — was assigned to ${task.to_agent_id}`);
        // Manager will see this in their next team_tasks() call or system prompt
      }
    } catch {}

    // 2. Tasks assigned to offline/stopped agents
    try {
      const activeTasks = await this.db.query<any>(
        `SELECT * FROM agent_delegated_tasks WHERE status IN ('pending', 'accepted', 'in_progress')`
      );
      for (const task of (activeTasks || [])) {
        const assignee = hierarchy.get(task.to_agent_id);
        if (!assignee) continue;

        // Agent is stopped/error — task can't be worked on
        if (assignee.state === 'stopped' || assignee.state === 'error') {
          // Find an alternative from same manager's team
          const manager = hierarchy.get(task.from_agent_id);
          if (manager) {
            const available = manager.subordinateIds
              .map(id => hierarchy.get(id))
              .filter((n): n is AgentHierarchyNode => 
                !!n && n.agentId !== task.to_agent_id && n.state === 'running' && n.clockedIn && n.activeTasks < MAX_CONCURRENT_TASKS
              );

            if (available.length > 0) {
              // Auto-reassign to least loaded available agent
              const best = available.sort((a, b) => a.activeTasks - b.activeTasks)[0];
              await this.reassignTask(task.id, best.agentId, `Original assignee ${assignee.name} is ${assignee.state}`);
              console.log(`[hierarchy] Auto-reassigned task "${task.title}" from ${assignee.name} (${assignee.state}) → ${best.name}`);
            }
          }
        }

        // Stale pending (not accepted in 30 min)
        const createdAt = new Date(task.created_at).getTime();
        const staleMins = (Date.now() - createdAt) / 60_000;
        if (task.status === 'pending' && staleMins > 30) {
          console.log(`[hierarchy] Stale task: "${task.title}" pending for ${Math.round(staleMins)}min — assignee: ${assignee.name}`);
          // Will show as warning in manager's team status
        }
      }
    } catch {}
  }

  // ─── Hierarchy Resolution ─────────────────────────────

  async buildHierarchy(): Promise<Map<string, AgentHierarchyNode>> {
    if (Date.now() < this.cacheExpiry && this.hierarchyCache.size > 0) {
      return this.hierarchyCache;
    }

    const rows = await this.db.query<any>(
      `SELECT id, config, state, usage FROM managed_agents WHERE state != 'destroying'`
    );

    // Pre-fetch active task counts per agent
    const taskCounts = new Map<string, { pending: number; inProgress: number }>();
    try {
      const tc = await this.db.query<any>(
        `SELECT to_agent_id, status, COUNT(*) as cnt FROM agent_delegated_tasks 
         WHERE status IN ('pending', 'accepted', 'in_progress') GROUP BY to_agent_id, status`
      );
      for (const r of (tc || [])) {
        const existing = taskCounts.get(r.to_agent_id) || { pending: 0, inProgress: 0 };
        if (r.status === 'in_progress') existing.inProgress = parseInt(r.cnt) || 0;
        else existing.pending += parseInt(r.cnt) || 0;
        taskCounts.set(r.to_agent_id, existing);
      }
    } catch {}

    const nodes = new Map<string, AgentHierarchyNode>();

    for (const row of (rows || [])) {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
      const usage = typeof row.usage === 'string' ? JSON.parse(row.usage) : (row.usage || {});
      const manager = config.manager || {};
      const identity = config.identity || {};
      const gws = config.enabledGoogleServices || [];
      const messaging = config.messagingChannels || {};
      const emailConfig = config.emailConfig || {};

      const comm: AgentCommConfig = {
        email: emailConfig.email,
        enabledGoogleServices: gws,
        hasGoogleChat: gws.includes('chat'),
        hasGmail: gws.includes('gmail'),
        whatsappEnabled: !!messaging.whatsapp?.enabled,
        telegramEnabled: !!messaging.telegram?.enabled || !!messaging.telegram?.botToken,
        agenticmailEnabled: true,
        enabledSkills: config.skills || [],
        toolAccess: config.toolAccess || {},
      };

      const tc = taskCounts.get(row.id) || { pending: 0, inProgress: 0 };

      const node: AgentHierarchyNode = {
        agentId: row.id,
        name: identity.name || config.displayName || config.name || row.id,
        role: identity.role || config.role || 'Agent',
        state: row.state || 'unknown',
        managerId: null,
        managerType: 'none',
        subordinateIds: [],
        subordinateCount: 0,
        isManager: false,
        level: 0,
        comm,
        clockedIn: config.workforce?.clockedIn === true,
        activeTasks: tc.pending + tc.inProgress,
        errorsToday: usage.errorsToday || 0,
        lastActivityAt: usage.lastActivityAt,
        workHours: config.workHours,
      };

      // Resolve manager
      if (manager.type === 'internal' && manager.agentId) {
        node.managerId = manager.agentId;
        node.managerType = 'internal';
      } else if (manager.type === 'external') {
        node.managerType = 'external';
        node.managerName = manager.name;
        node.managerEmail = manager.email;
      } else if (config.managerId) {
        node.managerId = config.managerId;
        node.managerType = 'internal';
      }

      nodes.set(row.id, node);
    }

    // Populate subordinates
    for (const [id, node] of nodes) {
      if (node.managerId && nodes.has(node.managerId)) {
        const mgr = nodes.get(node.managerId)!;
        mgr.subordinateIds.push(id);
        mgr.subordinateCount++;
        mgr.isManager = true;
      }
    }

    // Calculate levels (BFS from roots)
    const visited = new Set<string>();
    const queue: { id: string; level: number }[] = [];
    for (const [id, node] of nodes) {
      if (!node.managerId || !nodes.has(node.managerId)) {
        node.level = 0;
        visited.add(id);
        queue.push({ id, level: 0 });
      }
    }
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      const node = nodes.get(id)!;
      for (const subId of node.subordinateIds) {
        if (!visited.has(subId)) {
          nodes.get(subId)!.level = level + 1;
          visited.add(subId);
          queue.push({ id: subId, level: level + 1 });
        }
      }
    }

    this.hierarchyCache = nodes;
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
    return nodes;
  }

  // ─── Communication Channel Resolution ─────────────────

  async resolveCommChannel(fromAgentId: string, toAgentId: string): Promise<{
    channel: CommChannel;
    instructions: string;
    fromEmail?: string;
    toEmail?: string;
  }> {
    const hierarchy = await this.buildHierarchy();
    const from = hierarchy.get(fromAgentId);
    const to = hierarchy.get(toAgentId);

    if (!from || !to) {
      return { channel: 'agenticmail', instructions: `Use agenticmail_message_agent to send a message.` };
    }

    // Priority 1: Google Chat DM
    if (from.comm.hasGoogleChat && to.comm.hasGoogleChat && to.comm.email) {
      return {
        channel: 'google_chat',
        instructions: `Send via Google Chat DM. First call google_chat_find_dm(email: "${to.comm.email}") to get the DM space, then google_chat_send_message(spaceId, text).`,
        fromEmail: from.comm.email,
        toEmail: to.comm.email,
      };
    }

    // Priority 2: Gmail
    if (from.comm.hasGmail && to.comm.email) {
      return {
        channel: 'gmail',
        instructions: `Send via email to ${to.comm.email} using gmail_send(to: "${to.comm.email}", subject, body).`,
        fromEmail: from.comm.email,
        toEmail: to.comm.email,
      };
    }

    // Priority 3: AgenticMail internal
    return {
      channel: 'agenticmail',
      instructions: `Use agenticmail_message_agent(agent: "${to.name}", subject, text) to send a message internally.`,
    };
  }

  // ─── Hierarchy Queries ────────────────────────────────

  async getDirectReports(managerId: string): Promise<AgentHierarchyNode[]> {
    const hierarchy = await this.buildHierarchy();
    const manager = hierarchy.get(managerId);
    if (!manager) return [];
    return manager.subordinateIds
      .map(id => hierarchy.get(id))
      .filter((n): n is AgentHierarchyNode => !!n);
  }

  async getAllSubordinates(managerId: string): Promise<AgentHierarchyNode[]> {
    const hierarchy = await this.buildHierarchy();
    const result: AgentHierarchyNode[] = [];
    const queue = [managerId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const node = hierarchy.get(current);
      if (!node) continue;
      for (const subId of node.subordinateIds) {
        const sub = hierarchy.get(subId);
        if (sub) { result.push(sub); queue.push(subId); }
      }
    }
    return result;
  }

  async getEscalationChain(agentId: string): Promise<AgentHierarchyNode[]> {
    const hierarchy = await this.buildHierarchy();
    const chain: AgentHierarchyNode[] = [];
    const visited = new Set<string>();
    let current = hierarchy.get(agentId);
    while (current?.managerId && !visited.has(current.managerId)) {
      visited.add(current.managerId);
      const manager = hierarchy.get(current.managerId);
      if (manager) { chain.push(manager); current = manager; } else break;
    }
    return chain;
  }

  async isManagerOf(managerId: string, subordinateId: string): Promise<boolean> {
    const chain = await this.getEscalationChain(subordinateId);
    return chain.some(n => n.agentId === managerId);
  }

  // ─── Pre-Delegation Checks ────────────────────────────

  /**
   * Run comprehensive checks BEFORE delegating a task.
   * Returns blockers (hard stops) and warnings (proceed with caution).
   */
  async checkDelegation(fromAgentId: string, toAgentId: string, task: {
    requiredTools?: string[];
    priority?: string;
  }): Promise<DelegationCheck> {
    const hierarchy = await this.buildHierarchy();
    const from = hierarchy.get(fromAgentId);
    const to = hierarchy.get(toAgentId);
    const warnings: string[] = [];
    const blockers: string[] = [];

    if (!from) { blockers.push('Delegating agent not found.'); return { canDelegate: false, warnings, blockers }; }
    if (!to) { blockers.push(`Target agent not found.`); return { canDelegate: false, warnings, blockers }; }

    // Check hierarchy relationship
    const isManager = await this.isManagerOf(fromAgentId, toAgentId);
    if (!isManager) {
      blockers.push(`${from.name} is not a manager of ${to.name}. Cannot delegate.`);
      return { canDelegate: false, warnings, blockers };
    }

    // Check agent state
    if (to.state === 'stopped' || to.state === 'error' || to.state === 'destroying') {
      blockers.push(`${to.name} is ${to.state}. Cannot accept tasks.`);
      // Find alternative
      const alt = await this.findAvailableAlternative(fromAgentId, toAgentId);
      return {
        canDelegate: false, warnings, blockers,
        alternativeAgentId: alt?.agentId,
        alternativeReason: alt ? `${alt.name} is available (${alt.activeTasks} active tasks)` : undefined,
      };
    }

    // Check if clocked in / within work hours
    if (to.workHours?.enabled && !to.clockedIn) {
      warnings.push(`${to.name} is outside work hours. Task will queue until they clock in.`);
    }
    if (!to.clockedIn && to.state === 'running') {
      warnings.push(`${to.name} is not clocked in. They may not process this immediately.`);
    }

    // Check workload
    if (to.activeTasks >= MAX_CONCURRENT_TASKS) {
      warnings.push(`${to.name} has ${to.activeTasks} active tasks (max recommended: ${MAX_CONCURRENT_TASKS}). Consider another agent.`);
      const alt = await this.findAvailableAlternative(fromAgentId, toAgentId);
      if (alt) {
        return {
          canDelegate: true, warnings, blockers,
          alternativeAgentId: alt.agentId,
          alternativeReason: `${alt.name} has fewer tasks (${alt.activeTasks}) and is available`,
        };
      }
    }

    // Check error rate
    if (to.errorsToday > 10) {
      warnings.push(`${to.name} has ${to.errorsToday} errors today. Agent may be degraded.`);
    }

    // Check required tools/capabilities
    if (task.requiredTools?.length) {
      const missingTools: string[] = [];
      for (const tool of task.requiredTools) {
        // Check skill enabled
        const hasSkill = to.comm.enabledSkills?.some(s => s.includes(tool) || tool.includes(s));
        // Check tool access not explicitly disabled
        const toolDisabled = to.comm.toolAccess?.[tool] === false;
        if (!hasSkill && !toolDisabled) {
          // Could be a built-in tool, don't block — just warn
        } else if (toolDisabled) {
          missingTools.push(tool);
        }
      }
      if (missingTools.length > 0) {
        blockers.push(`${to.name} has these tools DISABLED: ${missingTools.join(', ')}. Enable them in the dashboard before delegating.`);
      }
    }

    return { canDelegate: blockers.length === 0, warnings, blockers };
  }

  /**
   * Find the best available agent from the same team to handle a task.
   */
  private async findAvailableAlternative(managerId: string, excludeId: string): Promise<AgentHierarchyNode | null> {
    const hierarchy = await this.buildHierarchy();
    const manager = hierarchy.get(managerId);
    if (!manager) return null;

    const candidates = manager.subordinateIds
      .map(id => hierarchy.get(id))
      .filter((n): n is AgentHierarchyNode =>
        !!n && n.agentId !== excludeId && n.state === 'running' && n.activeTasks < MAX_CONCURRENT_TASKS
      )
      .sort((a, b) => a.activeTasks - b.activeTasks); // Least loaded first

    return candidates[0] || null;
  }

  // ─── Task Delegation ──────────────────────────────────

  async delegateTask(fromAgentId: string, toAgentId: string, task: {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: string;
    requiredTools?: string[];
    slaHours?: number;
  }): Promise<DelegatedTask> {
    const priority = task.priority || 'medium';
    const slaHours = task.slaHours || DEFAULT_SLA_HOURS[priority];
    const checkInInterval = DEFAULT_CHECKIN_INTERVAL[priority];

    // Auto-calculate due date from SLA if not provided
    const dueDate = task.dueDate || new Date(Date.now() + slaHours * 3600_000).toISOString();

    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const delegatedTask: DelegatedTask = {
      id, fromAgentId, toAgentId,
      title: task.title,
      description: task.description,
      priority,
      status: 'pending',
      dueDate,
      slaHours,
      createdAt: now, updatedAt: now,
      requiredTools: task.requiredTools,
      checkInIntervalMin: checkInInterval,
      checkInCount: 0,
    };

    await this.db.query(
      `INSERT INTO agent_delegated_tasks (id, from_agent_id, to_agent_id, title, description, priority, status, due_date, sla_hours, check_in_interval_min, check_in_count, required_tools, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, fromAgentId, toAgentId, task.title, task.description, priority, 'pending', dueDate, slaHours, checkInInterval, 0, JSON.stringify(task.requiredTools || []), now, now]
    );

    // Invalidate cache so next hierarchy build picks up new task count
    this.cacheExpiry = 0;

    const hierarchy = await this.buildHierarchy();
    const fromNode = hierarchy.get(fromAgentId);
    const toNode = hierarchy.get(toAgentId);
    console.log(`[hierarchy] Task delegated: "${task.title}" [${priority}] from ${fromNode?.name} → ${toNode?.name} (SLA: ${slaHours}h, due: ${dueDate})`);

    return delegatedTask;
  }

  async updateTaskStatus(taskId: string, agentId: string, update: {
    status?: DelegatedTask['status'];
    result?: string;
    blockerReason?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = $1'];
    const params: any[] = [now];
    let idx = 2;

    if (update.status) {
      sets.push(`status = $${idx++}`);
      params.push(update.status);
      if (update.status === 'completed') {
        sets.push(`completed_at = $${idx++}`);
        params.push(now);
      }
    }
    if (update.result !== undefined) { sets.push(`result = $${idx++}`); params.push(update.result); }
    if (update.blockerReason !== undefined) { sets.push(`blocker_reason = $${idx++}`); params.push(update.blockerReason); }

    params.push(taskId);
    params.push(agentId);
    await this.db.query(
      `UPDATE agent_delegated_tasks SET ${sets.join(', ')} WHERE id = $${idx++} AND to_agent_id = $${idx}`,
      params
    );
    this.cacheExpiry = 0; // Invalidate
  }

  async provideFeedback(taskId: string, managerId: string, feedback: string): Promise<void> {
    await this.db.query(
      `UPDATE agent_delegated_tasks SET feedback = $1, updated_at = $2 WHERE id = $3 AND from_agent_id = $4`,
      [feedback, new Date().toISOString(), taskId, managerId]
    );
  }

  async reassignTask(taskId: string, newAgentId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();
    // Get original task
    const rows = await this.db.query<any>(`SELECT * FROM agent_delegated_tasks WHERE id = $1`, [taskId]);
    if (!rows?.[0]) throw new Error('Task not found');
    const task = rows[0];

    // Mark original as reassigned
    await this.db.query(
      `UPDATE agent_delegated_tasks SET status = 'reassigned', updated_at = $1 WHERE id = $2`,
      [now, taskId]
    );

    // Create new task for new agent
    const newId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db.query(
      `INSERT INTO agent_delegated_tasks (id, from_agent_id, to_agent_id, title, description, priority, status, due_date, sla_hours, check_in_interval_min, check_in_count, required_tools, original_agent_id, reassign_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, 0, $10, $11, $12, $13, $14)`,
      [newId, task.from_agent_id, newAgentId, task.title, task.description, task.priority, task.due_date, task.sla_hours, task.check_in_interval_min, task.required_tools, task.to_agent_id, reason, now, now]
    );

    this.cacheExpiry = 0;
    console.log(`[hierarchy] Task reassigned: "${task.title}" → ${newAgentId} (reason: ${reason})`);
  }

  async getTasksForAgent(agentId: string, status?: string): Promise<DelegatedTask[]> {
    const where = status ? ` AND status = $2` : '';
    const params: any[] = [agentId];
    if (status) params.push(status);
    const rows = await this.db.query<any>(
      `SELECT * FROM agent_delegated_tasks WHERE to_agent_id = $1${where} ORDER BY 
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC LIMIT 50`,
      params
    );
    return (rows || []).map(this.rowToTask);
  }

  async getTasksByManager(managerId: string, status?: string): Promise<DelegatedTask[]> {
    const where = status ? ` AND status = $2` : '';
    const params: any[] = [managerId];
    if (status) params.push(status);
    const rows = await this.db.query<any>(
      `SELECT * FROM agent_delegated_tasks WHERE from_agent_id = $1${where} ORDER BY created_at DESC LIMIT 50`,
      params
    );
    return (rows || []).map(this.rowToTask);
  }

  private rowToTask(row: any): DelegatedTask {
    return {
      id: row.id, fromAgentId: row.from_agent_id, toAgentId: row.to_agent_id,
      title: row.title, description: row.description, priority: row.priority,
      status: row.status, dueDate: row.due_date, slaHours: row.sla_hours,
      createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
      result: row.result, blockerReason: row.blocker_reason, feedback: row.feedback,
      requiredTools: row.required_tools ? (typeof row.required_tools === 'string' ? JSON.parse(row.required_tools) : row.required_tools) : [],
      checkInIntervalMin: row.check_in_interval_min, lastCheckInAt: row.last_check_in_at,
      checkInCount: row.check_in_count || 0,
      originalAgentId: row.original_agent_id, reassignReason: row.reassign_reason,
    };
  }

  // ─── Escalation ───────────────────────────────────────

  async escalate(fromAgentId: string, subject: string, context: string): Promise<{
    escalatedTo: AgentHierarchyNode | null;
    externalManager?: { name: string; email: string };
    escalationId: string;
  }> {
    const hierarchy = await this.buildHierarchy();
    const fromNode = hierarchy.get(fromAgentId);
    if (!fromNode) throw new Error('Agent not found');

    const id = `esc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    let escalatedTo: AgentHierarchyNode | null = null;
    let externalManager: { name: string; email: string } | undefined;

    if (fromNode.managerId && hierarchy.has(fromNode.managerId)) {
      escalatedTo = hierarchy.get(fromNode.managerId)!;
    } else if (fromNode.managerType === 'external' && fromNode.managerEmail) {
      externalManager = { name: fromNode.managerName || 'Manager', email: fromNode.managerEmail };
    }

    await this.db.query(
      `INSERT INTO agent_escalations (id, from_agent_id, to_agent_id, subject, context, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, fromAgentId, escalatedTo?.agentId || null, subject, context, 'pending', now]
    );

    console.log(`[hierarchy] Escalation: ${fromNode.name} → ${escalatedTo?.name || externalManager?.name || 'none'}: "${subject}"`);
    return { escalatedTo, externalManager, escalationId: id };
  }

  async resolveEscalation(escalationId: string, resolution: string): Promise<void> {
    await this.db.query(
      `UPDATE agent_escalations SET status = 'resolved', resolution = $1, resolved_at = $2 WHERE id = $3`,
      [resolution, new Date().toISOString(), escalationId]
    );
  }

  async forwardEscalation(escalationId: string, fromAgentId: string): Promise<{
    escalatedTo: AgentHierarchyNode | null;
    externalManager?: { name: string; email: string };
    newEscalationId: string;
  }> {
    await this.db.query(
      `UPDATE agent_escalations SET status = 'forwarded', updated_at = $1 WHERE id = $2`,
      [new Date().toISOString(), escalationId]
    );
    const rows = await this.db.query<any>(`SELECT subject, context FROM agent_escalations WHERE id = $1`, [escalationId]);
    const original = rows?.[0];
    if (!original) throw new Error('Escalation not found');
    const result = await this.escalate(fromAgentId, original.subject, `[Forwarded] ${original.context}`);
    return { ...result, newEscalationId: result.escalationId };
  }

  async getPendingEscalations(managerId: string): Promise<EscalationRecord[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM agent_escalations WHERE to_agent_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
      [managerId]
    );
    return (rows || []).map((r: any) => ({
      id: r.id, fromAgentId: r.from_agent_id, toAgentId: r.to_agent_id,
      subject: r.subject, context: r.context, status: r.status,
      createdAt: r.created_at, resolvedAt: r.resolved_at, resolution: r.resolution,
    }));
  }

  // ─── Team Status ──────────────────────────────────────

  async getTeamStatus(managerId: string): Promise<TeamStatus> {
    const hierarchy = await this.buildHierarchy();
    const manager = hierarchy.get(managerId);
    if (!manager) throw new Error('Manager not found');

    const directReports: TeamStatus['directReports'] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const subId of manager.subordinateIds) {
      const sub = hierarchy.get(subId);
      if (!sub) continue;

      // Task counts by status
      let pendingTasks = 0, inProgressTasks = 0, completedTasksToday = 0, blockedTasks = 0, overdueTasks = 0;
      try {
        const counts = await this.db.query<any>(
          `SELECT status, COUNT(*) as cnt FROM agent_delegated_tasks WHERE to_agent_id = $1 AND status IN ('pending', 'accepted', 'in_progress', 'blocked') GROUP BY status`,
          [subId]
        );
        for (const r of (counts || [])) {
          const c = parseInt(r.cnt) || 0;
          if (r.status === 'pending' || r.status === 'accepted') pendingTasks += c;
          else if (r.status === 'in_progress') inProgressTasks = c;
          else if (r.status === 'blocked') blockedTasks = c;
        }
        const done = await this.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_delegated_tasks WHERE to_agent_id = $1 AND status = 'completed' AND completed_at >= $2`,
          [subId, today + 'T00:00:00Z']
        );
        completedTasksToday = parseInt(done?.[0]?.cnt) || 0;
        const od = await this.db.query<any>(
          `SELECT COUNT(*) as cnt FROM agent_delegated_tasks WHERE to_agent_id = $1 AND status IN ('pending', 'accepted', 'in_progress') AND due_date IS NOT NULL AND due_date < $2`,
          [subId, new Date().toISOString()]
        );
        overdueTasks = parseInt(od?.[0]?.cnt) || 0;
      } catch {}

      const totalActive = pendingTasks + inProgressTasks;
      const capacity = Math.min(100, Math.round((totalActive / MAX_CONCURRENT_TASKS) * 100));
      const available = sub.state === 'running' && sub.clockedIn && totalActive < MAX_CONCURRENT_TASKS;

      directReports.push({
        agentId: subId,
        name: sub.name,
        role: sub.role,
        state: sub.state,
        clockedIn: sub.clockedIn,
        available,
        pendingTasks,
        inProgressTasks,
        completedTasksToday,
        blockedTasks,
        overdueTasks,
        lastActivity: sub.lastActivityAt,
        tokenUsageToday: 0, // from usage obj
        errorsToday: sub.errorsToday,
        capacityPercent: capacity,
      });
    }

    return {
      managerId, managerName: manager.name,
      directReports,
      teamSize: directReports.length,
      activeCount: directReports.filter(r => r.state === 'running').length,
      availableCount: directReports.filter(r => r.available).length,
      totalPendingTasks: directReports.reduce((s, r) => s + r.pendingTasks + r.inProgressTasks, 0),
      totalOverdueTasks: directReports.reduce((s, r) => s + r.overdueTasks, 0),
      totalCompletedToday: directReports.reduce((s, r) => s + r.completedTasksToday, 0),
    };
  }

  // ─── Dynamic System Prompt Builder ────────────────────

  /**
   * Build management context for an agent's system prompt.
   * DYNAMIC — only returns content when it's actually needed:
   *
   * - Agent with NO manager and NO reports → returns null (zero overhead)
   * - Manager → gets team roster + any urgent items (overdue, blocked, escalations)
   * - Subordinate → gets pending tasks + manager contact info
   * - Only includes urgent items (not full history)
   *
   * @param sessionContext Optional hint about what this session is for.
   *   If 'email' or 'meeting', management context is minimal.
   *   If 'task' or 'management', full context is included.
   */
  async buildManagerPrompt(agentId: string, sessionContext?: string): Promise<string | null> {
    const hierarchy = await this.buildHierarchy();
    const node = hierarchy.get(agentId);
    if (!node) return null;

    // Agent with no manager and no reports → nothing to inject
    if (!node.isManager && node.managerType === 'none') return null;

    const parts: string[] = [];

    // ─── Manager Context (only if agent has direct reports) ─────
    if (node.isManager) {
      const pendingEscalations = await this.getPendingEscalations(agentId);
      const blockedTasks = await this.getTasksByManager(agentId, 'blocked');
      const overdueTasks = (await this.getTasksByManager(agentId))
        .filter(t => t.dueDate && new Date(t.dueDate) < new Date() && !['completed', 'expired', 'reassigned'].includes(t.status));

      // Only inject URGENT items, not full team roster (that's what team_status tool is for)
      const urgentItems: string[] = [];

      if (pendingEscalations.length > 0) {
        urgentItems.push(`${pendingEscalations.length} ESCALATION(S) need your attention`);
        for (const esc of pendingEscalations.slice(0, 3)) {
          const fromNode = hierarchy.get(esc.fromAgentId);
          urgentItems.push(`  - From ${fromNode?.name || '?'}: "${esc.subject}"`);
        }
      }

      if (blockedTasks.length > 0) {
        urgentItems.push(`${blockedTasks.length} task(s) BLOCKED by your reports`);
        for (const t of blockedTasks.slice(0, 3)) {
          const sub = hierarchy.get(t.toAgentId);
          urgentItems.push(`  - ${sub?.name || '?'}: "${t.title}" — ${t.blockerReason || 'no reason given'}`);
        }
      }

      if (overdueTasks.length > 0) {
        urgentItems.push(`${overdueTasks.length} task(s) OVERDUE`);
      }

      // Offline agents with active tasks
      const offlineWithTasks = node.subordinateIds
        .map(id => hierarchy.get(id))
        .filter((n): n is AgentHierarchyNode => !!n && (n.state === 'stopped' || n.state === 'error') && n.activeTasks > 0);

      if (offlineWithTasks.length > 0) {
        urgentItems.push(`${offlineWithTasks.length} agent(s) OFFLINE with active tasks`);
        for (const a of offlineWithTasks) {
          urgentItems.push(`  - ${a.name} [${a.state}] has ${a.activeTasks} task(s)`);
        }
      }

      if (urgentItems.length > 0) {
        parts.push(`\n== MANAGER ALERTS (${node.subordinateCount} direct reports) ==`);
        parts.push(urgentItems.join('\n'));
        parts.push(`Use team_status() for full team overview. Use team_tasks() to review task details.`);
      } else {
        // No urgent items — just a light reminder they're a manager
        parts.push(`\n== TEAM: You manage ${node.subordinateCount} agent(s). Use team_status() to check on them. ==`);
      }
    }

    // ─── Subordinate Context (only if has pending tasks) ────
    if (node.managerType !== 'none') {
      const myTasks = await this.getTasksForAgent(agentId);
      const pending = myTasks.filter(t => ['pending', 'accepted', 'in_progress'].includes(t.status));
      const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate) < new Date());

      if (pending.length > 0) {
        parts.push(`\n== YOUR TASKS (${pending.length} active) ==`);
        for (const task of pending.slice(0, 5)) {
          const dueStr = task.dueDate ? ` [due: ${new Date(task.dueDate).toLocaleString()}]` : '';
          const overdueTag = task.dueDate && new Date(task.dueDate) < new Date() ? ' OVERDUE' : '';
          parts.push(`- [${task.priority.toUpperCase()}${overdueTag}] "${task.title}" — ${task.status}${dueStr}`);
        }
        if (overdue.length > 0) {
          parts.push(`WARNING: ${overdue.length} task(s) are OVERDUE. Update them or inform your manager.`);
        }
        parts.push(`Update tasks: task_update(taskId, status, result). Escalate: escalate(subject, context).`);
      }

      // Manager contact (only if they have one)
      if (node.managerId && hierarchy.has(node.managerId)) {
        const mgr = hierarchy.get(node.managerId)!;
        const comm = await this.resolveCommChannel(agentId, node.managerId);
        parts.push(`\nManager: ${mgr.name} (${mgr.role}) — reach via ${comm.channel}: ${comm.instructions}`);
      } else if (node.managerType === 'external' && node.managerEmail) {
        parts.push(`\nManager: ${node.managerName} (external) — ${node.managerEmail}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  // ─── Org Chart ────────────────────────────────────────

  async buildOrgChart(): Promise<string> {
    const hierarchy = await this.buildHierarchy();
    const roots: AgentHierarchyNode[] = [];
    for (const node of hierarchy.values()) {
      if (!node.managerId || !hierarchy.has(node.managerId)) roots.push(node);
    }

    const lines: string[] = ['Organization Chart:'];
    const renderTree = (node: AgentHierarchyNode, indent: string, isLast: boolean) => {
      const connector = indent === '' ? '' : isLast ? '└── ' : '├── ';
      const stateTag = node.state === 'running' ? (node.clockedIn ? '' : ' [not clocked in]') : ` [${node.state}]`;
      const taskTag = node.activeTasks > 0 ? ` (${node.activeTasks} tasks)` : '';
      const mgrTag = node.isManager ? ` — manages ${node.subordinateCount}` : '';
      const extTag = node.managerType === 'external' ? ` → reports to: ${node.managerName} (external)` : '';
      lines.push(`${indent}${connector}${node.name} — ${node.role}${stateTag}${taskTag}${mgrTag}${extTag}`);

      const children = node.subordinateIds.map(id => hierarchy.get(id)).filter((n): n is AgentHierarchyNode => !!n);
      children.forEach((child, i) => {
        const childIndent = indent + (indent === '' ? '' : isLast ? '    ' : '│   ');
        renderTree(child, childIndent, i === children.length - 1);
      });
    };

    roots.forEach((root, i) => renderTree(root, '', i === roots.length - 1));
    return lines.join('\n');
  }

  // ─── Migration SQL ────────────────────────────────────

  static getMigrationSQL(): string[] {
    return [
      `CREATE TABLE IF NOT EXISTS agent_delegated_tasks (
        id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        due_date TEXT,
        sla_hours REAL,
        check_in_interval_min INTEGER,
        check_in_count INTEGER DEFAULT 0,
        last_check_in_at TEXT,
        required_tools TEXT,
        original_agent_id TEXT,
        reassign_reason TEXT,
        result TEXT,
        blocker_reason TEXT,
        feedback TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_dt_to ON agent_delegated_tasks(to_agent_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_dt_from ON agent_delegated_tasks(from_agent_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_dt_due ON agent_delegated_tasks(due_date) WHERE status IN ('pending','accepted','in_progress')`,
      `CREATE TABLE IF NOT EXISTS agent_escalations (
        id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT,
        subject TEXT NOT NULL,
        context TEXT,
        status TEXT DEFAULT 'pending',
        resolution TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        updated_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_esc_to ON agent_escalations(to_agent_id, status)`,
    ];
  }
}
