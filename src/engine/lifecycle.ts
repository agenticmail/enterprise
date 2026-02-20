/**
 * Agent Lifecycle Manager
 *
 * Manages the full lifecycle of an autonomous AI agent employee:
 * create → configure → deploy → running → monitor → update → stop
 *
 * This is the core state machine. Every agent goes through these states
 * and the manager handles transitions, health checks, auto-recovery,
 * and status tracking.
 */

import type { AgentConfig, DeploymentStatus } from './agent-config.js';
import { AgentConfigGenerator } from './agent-config.js';
import { DeploymentEngine } from './deployer.js';
import { PermissionEngine } from './skills.js';
import type { EngineDatabase } from './db-adapter.js';
import { withRetry } from '../lib/resilience.js';

// ─── Types ──────────────────────────────────────────────

export type AgentState =
  | 'draft'           // Created but not configured
  | 'configuring'     // Skills/permissions/identity being set up
  | 'ready'           // Fully configured, waiting for deploy
  | 'provisioning'    // Infrastructure being created
  | 'deploying'       // Code/config being pushed
  | 'starting'        // Container/process starting up
  | 'running'         // Active and healthy
  | 'degraded'        // Running but with issues
  | 'stopped'         // Intentionally stopped
  | 'error'           // Failed — needs attention
  | 'updating'        // Config/code update in progress
  | 'destroying';     // Being torn down

export interface ManagedAgent {
  id: string;
  orgId: string;                     // Which company owns this agent
  config: AgentConfig;
  state: AgentState;
  stateHistory: StateTransition[];
  health: AgentHealth;
  usage: AgentUsage;
  budgetConfig?: AgentBudgetConfig;  // Per-agent budget controls
  createdAt: string;
  updatedAt: string;
  lastDeployedAt?: string;
  lastHealthCheckAt?: string;
  version: number;                   // Config version for optimistic locking
}

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  reason: string;
  triggeredBy: string;               // User ID or 'system'
  timestamp: string;
  error?: string;
}

export interface AgentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: string;
  uptime: number;                    // Seconds since last start
  consecutiveFailures: number;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  timestamp: string;
  durationMs: number;
}

export interface AgentUsage {
  // Token usage
  tokensToday: number;
  tokensThisWeek: number;
  tokensThisMonth: number;
  tokensThisYear: number;
  tokenBudgetMonthly: number;        // 0 = unlimited

  // Tool calls
  toolCallsToday: number;
  toolCallsThisMonth: number;

  // External actions (emails sent, messages, etc.)
  externalActionsToday: number;
  externalActionsThisMonth: number;

  // Cost estimate (USD)
  costToday: number;
  costThisWeek: number;
  costThisMonth: number;
  costThisYear: number;
  costBudgetMonthly: number;         // 0 = unlimited

  // Sessions
  activeSessionCount: number;
  totalSessionsToday: number;

  // Errors
  errorsToday: number;
  errorRate1h: number;               // Errors per hour in last hour

  lastUpdated: string;
}

// ─── Per-Agent Budget Controls ──────────────────────────

export interface AgentBudgetConfig {
  dailyCostCap: number;              // 0 = unlimited
  monthlyCostCap: number;            // 0 = unlimited (overrides costBudgetMonthly)
  dailyTokenCap: number;             // 0 = unlimited
  monthlyTokenCap: number;           // 0 = unlimited (overrides tokenBudgetMonthly)
  weeklyCostCap: number;             // 0 = unlimited
  weeklyTokenCap: number;            // 0 = unlimited
  annualCostCap: number;             // 0 = unlimited
  annualTokenCap: number;            // 0 = unlimited
  warningThresholds: number[];       // e.g. [50, 80, 95] — emit alerts at these %
  poolDelegation?: {
    orgPoolPercent: number;           // Max % of org budget this agent can use
    maxDailyFromPool: number;         // Daily cap from org pool
  };
}

export interface BudgetAlert {
  id: string;
  orgId: string;
  agentId: string;
  alertType: string;                  // 'warning_50' | 'warning_80' | 'warning_95' | 'exceeded' | 'daily_exceeded'
  budgetType: 'cost' | 'tokens';
  currentValue: number;
  limitValue: number;
  acknowledged: boolean;
  createdAt: string;
}

export interface LifecycleEvent {
  id: string;
  agentId: string;
  orgId: string;
  type: LifecycleEventType;
  data: Record<string, any>;
  timestamp: string;
}

export type LifecycleEventType =
  | 'created'
  | 'configured'
  | 'deployed'
  | 'started'
  | 'stopped'
  | 'restarted'
  | 'updated'
  | 'error'
  | 'health_check'
  | 'auto_recovered'
  | 'budget_warning'
  | 'budget_exceeded'
  | 'tool_call'
  | 'approval_requested'
  | 'approval_decided'
  | 'destroyed'
  | 'birthday';

// ─── Lifecycle Manager ──────────────────────────────────

export class AgentLifecycleManager {
  private agents = new Map<string, ManagedAgent>();
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>();
  private deployer = new DeploymentEngine();
  private configGen = new AgentConfigGenerator();
  private permissions: PermissionEngine;
  private engineDb?: EngineDatabase;
  private eventListeners: ((event: LifecycleEvent) => void)[] = [];
  private dirtyAgents = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  /** Track which budget alert thresholds have already fired per agent per day to avoid duplicates */
  private firedAlerts = new Map<string, Set<string>>();
  private budgetAlerts: BudgetAlert[] = [];
  private birthdayTimer: NodeJS.Timeout | null = null;
  private lastBirthdayCheck: string = '';
  /** External callback for sending birthday messages (set via setBirthdaySender) */
  private birthdaySender: ((agent: ManagedAgent) => Promise<void>) | null = null;

  constructor(opts?: { db?: EngineDatabase; permissions?: PermissionEngine }) {
    this.engineDb = opts?.db;
    this.permissions = opts?.permissions || new PermissionEngine();
  }

  /**
   * Set the database adapter and load existing agents from DB
   */
  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  /**
   * Load all agents from DB into memory
   */
  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const agents = await this.engineDb.getAllManagedAgents();
      for (const agent of agents) {
        this.agents.set(agent.id, agent);
        // Restart health check loops for running agents
        if (agent.state === 'running' || agent.state === 'degraded') {
          this.startHealthCheckLoop(agent);
        }
      }
    } catch {
      // Table may not exist yet if migrations haven't run
    }
  }

  // ─── Agent CRUD ─────────────────────────────────────

  /**
   * Create a new managed agent (starts in 'draft' state)
   */
  async createAgent(orgId: string, config: AgentConfig, createdBy: string): Promise<ManagedAgent> {
    const agent: ManagedAgent = {
      id: config.id || crypto.randomUUID(),
      orgId,
      config,
      state: 'draft',
      stateHistory: [],
      health: {
        status: 'unknown',
        lastCheck: new Date().toISOString(),
        uptime: 0,
        consecutiveFailures: 0,
        checks: [],
      },
      usage: this.emptyUsage(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    this.agents.set(agent.id, agent);
    await this.persistAgent(agent);
    this.emitEvent(agent, 'created', { createdBy });

    return agent;
  }

  /**
   * Update agent configuration (must be in draft, ready, stopped, or error state)
   */
  async updateConfig(agentId: string, updates: Partial<AgentConfig>, updatedBy: string): Promise<ManagedAgent> {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const mutableStates: AgentState[] = ['draft', 'ready', 'stopped', 'error'];
    if (!mutableStates.includes(agent.state)) {
      throw new Error(`Cannot update config in state "${agent.state}". Stop the agent first.`);
    }

    // Deep-merge nested objects (identity, model, deployment) to prevent field loss
    const merged: any = { ...agent.config, ...updates, updatedAt: new Date().toISOString() };
    if (updates.identity && agent.config.identity) {
      merged.identity = { ...agent.config.identity, ...updates.identity };
    }
    if (updates.model && agent.config.model) {
      merged.model = { ...agent.config.model, ...updates.model };
    }
    if (updates.deployment && agent.config.deployment) {
      merged.deployment = { ...agent.config.deployment, ...updates.deployment };
    }
    agent.config = merged;
    agent.updatedAt = new Date().toISOString();
    agent.version++;

    // If all required fields are set, transition to 'ready'
    if (agent.state === 'draft' && this.isConfigComplete(agent.config)) {
      this.transition(agent, 'ready', 'Configuration complete', updatedBy);
    } else if (agent.state !== 'draft') {
      this.transition(agent, 'ready', 'Configuration updated', updatedBy);
    }

    await this.persistAgent(agent);
    this.emitEvent(agent, 'configured', { updatedBy, changes: Object.keys(updates) });

    return agent;
  }

  /**
   * Deploy an agent to its target environment
   */
  async deploy(agentId: string, deployedBy: string): Promise<ManagedAgent> {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    if (!['ready', 'stopped', 'error'].includes(agent.state)) {
      throw new Error(`Cannot deploy from state "${agent.state}"`);
    }

    if (!this.isConfigComplete(agent.config)) {
      throw new Error('Agent configuration is incomplete');
    }

    // Transition: provisioning
    this.transition(agent, 'provisioning', 'Deployment initiated', deployedBy);
    await this.persistAgent(agent);

    try {
      // Run deployment
      this.transition(agent, 'deploying', 'Pushing configuration', 'system');

      const result = await this.deployer.deploy(agent.config, (event) => {
        this.emitEvent(agent, 'deployed', { phase: event.phase, status: event.status, message: event.message });
      });

      if (result.success) {
        this.transition(agent, 'starting', 'Deployment successful, agent starting', 'system');
        agent.lastDeployedAt = new Date().toISOString();

        // Wait for agent to be healthy
        const healthy = await this.waitForHealthy(agent, 60_000);
        if (healthy) {
          this.transition(agent, 'running', 'Agent is healthy and running', 'system');
          this.emitEvent(agent, 'started', { deployedBy });
          this.startHealthCheckLoop(agent);
        } else {
          this.transition(agent, 'degraded', 'Agent started but health check failed', 'system');
          this.startHealthCheckLoop(agent);
        }
      } else {
        this.transition(agent, 'error', `Deployment failed: ${result.error}`, 'system');
      }

      await this.persistAgent(agent);
      return agent;

    } catch (error: any) {
      this.transition(agent, 'error', `Deployment error: ${error.message}`, 'system');
      await this.persistAgent(agent);
      throw error;
    }
  }

  /**
   * Stop a running agent
   */
  async stop(agentId: string, stoppedBy: string, reason?: string): Promise<ManagedAgent> {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    if (!['running', 'degraded', 'starting', 'error'].includes(agent.state)) {
      throw new Error(`Cannot stop from state "${agent.state}"`);
    }

    this.stopHealthCheckLoop(agentId);

    try {
      await this.deployer.stop(agent.config);
      this.transition(agent, 'stopped', reason || 'Stopped by user', stoppedBy);
    } catch (error: any) {
      this.transition(agent, 'stopped', `Stopped with error: ${error.message}`, stoppedBy);
    }

    await this.persistAgent(agent);
    this.emitEvent(agent, 'stopped', { stoppedBy, reason });
    return agent;
  }

  /**
   * Restart a running agent
   */
  async restart(agentId: string, restartedBy: string): Promise<ManagedAgent> {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.transition(agent, 'updating', 'Restarting', restartedBy);

    try {
      await this.deployer.restart(agent.config);
      const healthy = await this.waitForHealthy(agent, 30_000);
      this.transition(agent, healthy ? 'running' : 'degraded', 'Restarted', 'system');
    } catch (error: any) {
      this.transition(agent, 'error', `Restart failed: ${error.message}`, 'system');
    }

    await this.persistAgent(agent);
    this.emitEvent(agent, 'restarted', { restartedBy });
    return agent;
  }

  /**
   * Hot-update config on a running agent (no full redeploy)
   */
  async hotUpdate(agentId: string, updates: Partial<AgentConfig>, updatedBy: string): Promise<ManagedAgent> {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    if (agent.state !== 'running' && agent.state !== 'degraded') {
      throw new Error(`Hot update only works on running agents (current: "${agent.state}")`);
    }

    const prevState = agent.state;
    this.transition(agent, 'updating', 'Hot config update', updatedBy);

    // Deep-merge nested objects (identity, model, deployment) to prevent field loss
    const merged: any = { ...agent.config, ...updates, updatedAt: new Date().toISOString() };
    if (updates.identity && agent.config.identity) {
      merged.identity = { ...agent.config.identity, ...updates.identity };
    }
    if (updates.model && agent.config.model) {
      merged.model = { ...agent.config.model, ...updates.model };
    }
    if (updates.deployment && agent.config.deployment) {
      merged.deployment = { ...agent.config.deployment, ...updates.deployment };
    }
    agent.config = merged;
    agent.version++;

    try {
      await this.deployer.updateConfig(agent.config);
      this.transition(agent, prevState, 'Config updated successfully', 'system');
    } catch (error: any) {
      this.transition(agent, 'degraded', `Config update failed: ${error.message}`, 'system');
    }

    await this.persistAgent(agent);
    this.emitEvent(agent, 'updated', { updatedBy, hotUpdate: true });
    return agent;
  }

  /**
   * Destroy an agent completely (stop + delete all resources)
   */
  async destroy(agentId: string, destroyedBy: string): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.transition(agent, 'destroying', 'Agent being destroyed', destroyedBy);
    this.stopHealthCheckLoop(agentId);

    // Stop if running
    if (['running', 'degraded', 'starting'].includes(agent.state)) {
      try { await this.deployer.stop(agent.config); } catch { /* best effort */ }
    }

    this.emitEvent(agent, 'destroyed', { destroyedBy });
    this.agents.delete(agentId);
    try {
      await this.engineDb?.deleteManagedAgent(agentId);
    } catch (err) {
      console.error(`[lifecycle] Failed to delete agent ${agentId} from DB:`, err);
    }
  }

  // ─── Monitoring ─────────────────────────────────────

  /**
   * Record a tool call for usage tracking with per-agent budget controls
   */
  recordToolCall(agentId: string, toolId: string, opts?: {
    tokensUsed?: number;
    costUsd?: number;
    isExternalAction?: boolean;
    error?: boolean;
  }) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const usage = agent.usage;
    usage.toolCallsToday++;
    usage.toolCallsThisMonth++;
    if (opts?.tokensUsed) {
      usage.tokensToday += opts.tokensUsed;
      usage.tokensThisWeek += opts.tokensUsed;
      usage.tokensThisMonth += opts.tokensUsed;
      usage.tokensThisYear += opts.tokensUsed;
    }
    if (opts?.costUsd) {
      usage.costToday += opts.costUsd;
      usage.costThisWeek += opts.costUsd;
      usage.costThisMonth += opts.costUsd;
      usage.costThisYear += opts.costUsd;
    }
    if (opts?.isExternalAction) {
      usage.externalActionsToday++;
      usage.externalActionsThisMonth++;
    }
    if (opts?.error) {
      usage.errorsToday++;
    }
    usage.lastUpdated = new Date().toISOString();

    // ─── Per-Agent Budget Controls ─────────────────────
    const budget = agent.budgetConfig;
    if (budget) {
      // Daily cost cap
      if (budget.dailyCostCap > 0 && usage.costToday >= budget.dailyCostCap) {
        this.fireBudgetAlert(agent, 'daily_exceeded', 'cost', usage.costToday, budget.dailyCostCap);
        this.stop(agentId, 'system', 'Daily cost budget exceeded').catch(() => {});
      }
      // Monthly cost cap
      if (budget.monthlyCostCap > 0 && usage.costThisMonth >= budget.monthlyCostCap) {
        this.fireBudgetAlert(agent, 'exceeded', 'cost', usage.costThisMonth, budget.monthlyCostCap);
        this.stop(agentId, 'system', 'Monthly cost budget exceeded').catch(() => {});
      }
      // Daily token cap
      if (budget.dailyTokenCap > 0 && usage.tokensToday >= budget.dailyTokenCap) {
        this.fireBudgetAlert(agent, 'daily_exceeded', 'tokens', usage.tokensToday, budget.dailyTokenCap);
        this.stop(agentId, 'system', 'Daily token budget exceeded').catch(() => {});
      }
      // Monthly token cap
      if (budget.monthlyTokenCap > 0 && usage.tokensThisMonth >= budget.monthlyTokenCap) {
        this.fireBudgetAlert(agent, 'exceeded', 'tokens', usage.tokensThisMonth, budget.monthlyTokenCap);
        this.stop(agentId, 'system', 'Monthly token budget exceeded').catch(() => {});
      }
      // Weekly cost cap
      if (budget.weeklyCostCap > 0 && usage.costThisWeek >= budget.weeklyCostCap) {
        this.fireBudgetAlert(agent, 'weekly_exceeded', 'cost', usage.costThisWeek, budget.weeklyCostCap);
        this.stop(agentId, 'system', 'Weekly cost budget exceeded').catch(() => {});
      }
      // Weekly token cap
      if (budget.weeklyTokenCap > 0 && usage.tokensThisWeek >= budget.weeklyTokenCap) {
        this.fireBudgetAlert(agent, 'weekly_exceeded', 'tokens', usage.tokensThisWeek, budget.weeklyTokenCap);
        this.stop(agentId, 'system', 'Weekly token budget exceeded').catch(() => {});
      }
      // Annual cost cap
      if (budget.annualCostCap > 0 && usage.costThisYear >= budget.annualCostCap) {
        this.fireBudgetAlert(agent, 'annual_exceeded', 'cost', usage.costThisYear, budget.annualCostCap);
        this.stop(agentId, 'system', 'Annual cost budget exceeded').catch(() => {});
      }
      // Annual token cap
      if (budget.annualTokenCap > 0 && usage.tokensThisYear >= budget.annualTokenCap) {
        this.fireBudgetAlert(agent, 'annual_exceeded', 'tokens', usage.tokensThisYear, budget.annualTokenCap);
        this.stop(agentId, 'system', 'Annual token budget exceeded').catch(() => {});
      }
      // Warning thresholds
      const thresholds = budget.warningThresholds || [50, 80, 95];
      for (const pct of thresholds) {
        if (budget.monthlyCostCap > 0) {
          const ratio = usage.costThisMonth / budget.monthlyCostCap * 100;
          if (ratio >= pct) {
            this.fireBudgetAlert(agent, `warning_${pct}`, 'cost', usage.costThisMonth, budget.monthlyCostCap);
          }
        }
        if (budget.monthlyTokenCap > 0) {
          const ratio = usage.tokensThisMonth / budget.monthlyTokenCap * 100;
          if (ratio >= pct) {
            this.fireBudgetAlert(agent, `warning_${pct}`, 'tokens', usage.tokensThisMonth, budget.monthlyTokenCap);
          }
        }
        if (budget.weeklyCostCap > 0) {
          const ratio = usage.costThisWeek / budget.weeklyCostCap * 100;
          if (ratio >= pct) {
            this.fireBudgetAlert(agent, `weekly_warning_${pct}`, 'cost', usage.costThisWeek, budget.weeklyCostCap);
          }
        }
        if (budget.weeklyTokenCap > 0) {
          const ratio = usage.tokensThisWeek / budget.weeklyTokenCap * 100;
          if (ratio >= pct) {
            this.fireBudgetAlert(agent, `weekly_warning_${pct}`, 'tokens', usage.tokensThisWeek, budget.weeklyTokenCap);
          }
        }
        if (budget.annualCostCap > 0) {
          const ratio = usage.costThisYear / budget.annualCostCap * 100;
          if (ratio >= pct) {
            this.fireBudgetAlert(agent, `annual_warning_${pct}`, 'cost', usage.costThisYear, budget.annualCostCap);
          }
        }
        if (budget.annualTokenCap > 0) {
          const ratio = usage.tokensThisYear / budget.annualTokenCap * 100;
          if (ratio >= pct) {
            this.fireBudgetAlert(agent, `annual_warning_${pct}`, 'tokens', usage.tokensThisYear, budget.annualTokenCap);
          }
        }
      }
    } else {
      // Legacy budget checks (from AgentUsage fields)
      if (usage.tokenBudgetMonthly > 0 && usage.tokensThisMonth >= usage.tokenBudgetMonthly) {
        this.emitEvent(agent, 'budget_exceeded', { type: 'tokens', used: usage.tokensThisMonth, budget: usage.tokenBudgetMonthly });
        this.stop(agentId, 'system', 'Monthly token budget exceeded').catch(() => {});
      } else if (usage.tokenBudgetMonthly > 0 && usage.tokensThisMonth >= usage.tokenBudgetMonthly * 0.8) {
        this.emitEvent(agent, 'budget_warning', { type: 'tokens', used: usage.tokensThisMonth, budget: usage.tokenBudgetMonthly, percent: 80 });
      }
      if (usage.costBudgetMonthly > 0 && usage.costThisMonth >= usage.costBudgetMonthly) {
        this.emitEvent(agent, 'budget_exceeded', { type: 'cost', used: usage.costThisMonth, budget: usage.costBudgetMonthly });
        this.stop(agentId, 'system', 'Monthly cost budget exceeded').catch(() => {});
      }
    }

    this.emitEvent(agent, 'tool_call', { toolId, ...opts });

    // Mark agent dirty for debounced usage flush
    this.dirtyAgents.add(agentId);
    this.scheduleUsageFlush();
  }

  /**
   * Get all agents for an org
   */
  getAgentsByOrg(orgId: string): ManagedAgent[] {
    return Array.from(this.agents.values()).filter(a => a.orgId === orgId);
  }

  /**
   * Get a single agent
   */
  getAgent(agentId: string): ManagedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get org-wide usage summary
   */
  getOrgUsage(orgId: string): {
    totalAgents: number;
    runningAgents: number;
    totalTokensToday: number;
    totalCostToday: number;
    totalToolCallsToday: number;
    totalErrorsToday: number;
    agents: { id: string; name: string; state: AgentState; usage: AgentUsage }[];
  } {
    const agents = this.getAgentsByOrg(orgId);
    return {
      totalAgents: agents.length,
      runningAgents: agents.filter(a => a.state === 'running').length,
      totalTokensToday: agents.reduce((sum, a) => sum + a.usage.tokensToday, 0),
      totalCostToday: agents.reduce((sum, a) => sum + a.usage.costToday, 0),
      totalToolCallsToday: agents.reduce((sum, a) => sum + a.usage.toolCallsToday, 0),
      totalErrorsToday: agents.reduce((sum, a) => sum + a.usage.errorsToday, 0),
      agents: agents.map(a => ({ id: a.id, name: a.config.displayName, state: a.state, usage: a.usage })),
    };
  }

  /**
   * Subscribe to lifecycle events (for dashboard real-time updates)
   */
  onEvent(listener: (event: LifecycleEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => { this.eventListeners = this.eventListeners.filter(l => l !== listener); };
  }

  /**
   * Reset daily counters (call at midnight via cron)
   */
  resetDailyCounters() {
    for (const agent of this.agents.values()) {
      agent.usage.tokensToday = 0;
      agent.usage.toolCallsToday = 0;
      agent.usage.externalActionsToday = 0;
      agent.usage.costToday = 0;
      agent.usage.errorsToday = 0;
      agent.usage.totalSessionsToday = 0;
      this.dirtyAgents.add(agent.id);
    }
    // Reset daily alert tracking
    this.firedAlerts.clear();
    this.scheduleUsageFlush();
  }

  /**
   * Reset monthly counters (call on 1st of month)
   */
  resetMonthlyCounters() {
    for (const agent of this.agents.values()) {
      agent.usage.tokensThisMonth = 0;
      agent.usage.toolCallsThisMonth = 0;
      agent.usage.externalActionsThisMonth = 0;
      agent.usage.costThisMonth = 0;
      this.dirtyAgents.add(agent.id);
    }
    this.scheduleUsageFlush();
  }

  /**
   * Reset weekly counters (call on Monday via workforce scheduler)
   */
  resetWeeklyCounters() {
    for (const agent of this.agents.values()) {
      agent.usage.tokensThisWeek = 0;
      agent.usage.costThisWeek = 0;
      this.dirtyAgents.add(agent.id);
    }
    this.scheduleUsageFlush();
  }

  /**
   * Reset annual counters (call on Jan 1 via workforce scheduler)
   */
  resetAnnualCounters() {
    for (const agent of this.agents.values()) {
      agent.usage.tokensThisYear = 0;
      agent.usage.costThisYear = 0;
      this.dirtyAgents.add(agent.id);
    }
    this.scheduleUsageFlush();
  }

  // ─── Budget Management ─────────────────────────────────

  /**
   * Set per-agent budget configuration
   */
  async setBudgetConfig(agentId: string, config: AgentBudgetConfig): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    agent.budgetConfig = config;
    agent.updatedAt = new Date().toISOString();
    await this.persistAgent(agent);
  }

  /**
   * Get per-agent budget configuration
   */
  getBudgetConfig(agentId: string): AgentBudgetConfig | undefined {
    return this.agents.get(agentId)?.budgetConfig;
  }

  /**
   * Get budget alerts (optionally filtered)
   */
  getBudgetAlerts(opts?: { orgId?: string; agentId?: string; acknowledged?: boolean; limit?: number }): BudgetAlert[] {
    let alerts = [...this.budgetAlerts];
    if (opts?.orgId) alerts = alerts.filter(a => a.orgId === opts.orgId);
    if (opts?.agentId) alerts = alerts.filter(a => a.agentId === opts.agentId);
    if (opts?.acknowledged !== undefined) alerts = alerts.filter(a => a.acknowledged === opts.acknowledged);
    return alerts.slice(0, opts?.limit || 100);
  }

  /**
   * Acknowledge a budget alert
   */
  async acknowledgeBudgetAlert(alertId: string): Promise<void> {
    const alert = this.budgetAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.engineDb?.execute(
        'UPDATE budget_alerts SET acknowledged = 1 WHERE id = ?', [alertId]
      ).catch((err) => { console.error(`[lifecycle] Failed to acknowledge alert ${alertId}:`, err); });
    }
  }

  /**
   * Get org-wide budget summary
   */
  getBudgetSummary(orgId: string): {
    totalDailyCost: number;
    totalWeeklyCost: number;
    totalMonthlyCost: number;
    totalAnnualCost: number;
    totalDailyTokens: number;
    totalWeeklyTokens: number;
    totalMonthlyTokens: number;
    totalAnnualTokens: number;
    agentBudgets: { id: string; name: string; budget?: AgentBudgetConfig; usage: { costToday: number; costThisWeek: number; costThisMonth: number; costThisYear: number; tokensToday: number; tokensThisWeek: number; tokensThisMonth: number; tokensThisYear: number } }[];
    recentAlerts: BudgetAlert[];
  } {
    const agents = this.getAgentsByOrg(orgId);
    return {
      totalDailyCost: agents.reduce((s, a) => s + a.usage.costToday, 0),
      totalWeeklyCost: agents.reduce((s, a) => s + a.usage.costThisWeek, 0),
      totalMonthlyCost: agents.reduce((s, a) => s + a.usage.costThisMonth, 0),
      totalAnnualCost: agents.reduce((s, a) => s + a.usage.costThisYear, 0),
      totalDailyTokens: agents.reduce((s, a) => s + a.usage.tokensToday, 0),
      totalWeeklyTokens: agents.reduce((s, a) => s + a.usage.tokensThisWeek, 0),
      totalMonthlyTokens: agents.reduce((s, a) => s + a.usage.tokensThisMonth, 0),
      totalAnnualTokens: agents.reduce((s, a) => s + a.usage.tokensThisYear, 0),
      agentBudgets: agents.map(a => ({
        id: a.id, name: a.config.displayName, budget: a.budgetConfig,
        usage: {
          costToday: a.usage.costToday, costThisWeek: a.usage.costThisWeek, costThisMonth: a.usage.costThisMonth, costThisYear: a.usage.costThisYear,
          tokensToday: a.usage.tokensToday, tokensThisWeek: a.usage.tokensThisWeek, tokensThisMonth: a.usage.tokensThisMonth, tokensThisYear: a.usage.tokensThisYear,
        },
      })),
      recentAlerts: this.budgetAlerts.filter(a => a.orgId === orgId).slice(0, 20),
    };
  }

  private fireBudgetAlert(agent: ManagedAgent, alertType: string, budgetType: 'cost' | 'tokens', currentValue: number, limitValue: number) {
    const key = `${agent.id}:${alertType}:${budgetType}`;
    if (!this.firedAlerts.has(agent.id)) this.firedAlerts.set(agent.id, new Set());
    const fired = this.firedAlerts.get(agent.id)!;
    if (fired.has(key)) return; // Already fired this alert today
    fired.add(key);

    const alert: BudgetAlert = {
      id: crypto.randomUUID(),
      orgId: agent.orgId,
      agentId: agent.id,
      alertType,
      budgetType,
      currentValue,
      limitValue,
      acknowledged: false,
      createdAt: new Date().toISOString(),
    };
    this.budgetAlerts.push(alert);
    // Keep only last 500 alerts in memory
    if (this.budgetAlerts.length > 500) this.budgetAlerts = this.budgetAlerts.slice(-500);

    // Persist
    this.engineDb?.execute(
      'INSERT INTO budget_alerts (id, org_id, agent_id, alert_type, budget_type, current_value, limit_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [alert.id, alert.orgId, alert.agentId, alert.alertType, alert.budgetType, alert.currentValue, alert.limitValue, alert.createdAt]
    ).catch((err) => { console.error(`[lifecycle] Failed to persist budget alert:`, err); });

    // Emit lifecycle event
    const eventType = alertType.startsWith('warning') ? 'budget_warning' : 'budget_exceeded';
    this.emitEvent(agent, eventType, { alertType, budgetType, currentValue, limitValue, percent: Math.round(currentValue / limitValue * 100) });
  }

  // ─── Health Check Loop ────────────────────────────────

  private startHealthCheckLoop(agent: ManagedAgent) {
    this.stopHealthCheckLoop(agent.id);

    const interval = setInterval(async () => {
      try {
        const status = await this.deployer.getStatus(agent.config);
        agent.lastHealthCheckAt = new Date().toISOString();

        const check: HealthCheck = {
          name: 'deployment_status',
          status: status.status === 'running' ? 'pass' : 'fail',
          message: `Status: ${status.status}, Health: ${status.healthStatus}`,
          timestamp: new Date().toISOString(),
          durationMs: 0,
        };

        // Keep last 10 checks
        agent.health.checks = [check, ...agent.health.checks].slice(0, 10);

        if (status.status === 'running' && status.healthStatus === 'healthy') {
          agent.health.status = 'healthy';
          agent.health.consecutiveFailures = 0;
          if (status.uptime) agent.health.uptime = status.uptime;
          if (status.metrics) {
            agent.usage.activeSessionCount = status.metrics.activeSessionCount;
          }
          // Recover from degraded
          if (agent.state === 'degraded') {
            this.transition(agent, 'running', 'Health restored', 'system');
            this.emitEvent(agent, 'auto_recovered', {});
          }
        } else {
          agent.health.consecutiveFailures++;
          agent.health.status = agent.health.consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';

          if (agent.state === 'running' && agent.health.consecutiveFailures >= 2) {
            this.transition(agent, 'degraded', `Health degraded: ${agent.health.consecutiveFailures} consecutive failures`, 'system');
          }

          // Auto-restart after 5 consecutive failures
          if (agent.health.consecutiveFailures >= 5 && agent.state !== 'error') {
            this.emitEvent(agent, 'auto_recovered', { action: 'restart', failures: agent.health.consecutiveFailures });
            agent.health.consecutiveFailures = 0;
            try {
              await this.deployer.restart(agent.config);
              this.transition(agent, 'starting', 'Auto-restarted after health failures', 'system');
            } catch {
              this.transition(agent, 'error', 'Auto-restart failed', 'system');
            }
          }
        }

        agent.health.lastCheck = new Date().toISOString();
        await this.persistAgent(agent);

      } catch (error: any) {
        agent.health.consecutiveFailures++;
        agent.health.status = 'unhealthy';
      }
    }, 30_000); // Every 30 seconds

    this.healthCheckIntervals.set(agent.id, interval);
  }

  private stopHealthCheckLoop(agentId: string) {
    const interval = this.healthCheckIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(agentId);
    }
  }

  // ─── Private Helpers ──────────────────────────────────

  private transition(agent: ManagedAgent, to: AgentState, reason: string, triggeredBy: string) {
    const from = agent.state;
    const transition: StateTransition = {
      from, to, reason, triggeredBy,
      timestamp: new Date().toISOString(),
    };
    agent.stateHistory.push(transition);
    // Keep last 50 transitions
    if (agent.stateHistory.length > 50) agent.stateHistory = agent.stateHistory.slice(-50);
    agent.state = to;
    agent.updatedAt = new Date().toISOString();

    // Persist state transition to DB
    this.engineDb?.addStateTransition(agent.id, transition).catch((err) => {
      console.error(`[lifecycle] Failed to persist state transition for ${agent.id}:`, err);
    });
  }

  private isConfigComplete(config: AgentConfig): boolean {
    return !!(
      config.name &&
      config.displayName &&
      config.identity?.role &&
      config.model?.modelId &&
      config.deployment?.target &&
      config.permissionProfileId
    );
  }

  private async waitForHealthy(agent: ManagedAgent, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await this.deployer.getStatus(agent.config);
        if (status.status === 'running') return true;
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 3000));
    }
    return false;
  }

  private async persistAgent(agent: ManagedAgent) {
    this.agents.set(agent.id, agent);
    if (!this.engineDb) return;
    try {
      await withRetry(
        () => this.engineDb!.upsertManagedAgent(agent),
        { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000 }
      );
    } catch (err) {
      console.error(`[lifecycle] Failed to persist agent ${agent.id}:`, err);
    }
  }

  private scheduleUsageFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      const agentIds = [...this.dirtyAgents];
      this.dirtyAgents.clear();
      for (const id of agentIds) {
        const agent = this.agents.get(id);
        if (agent) {
          await this.persistAgent(agent);
        }
      }
    }, 5_000);
  }

  private emitEvent(agent: ManagedAgent, type: LifecycleEventType, data: Record<string, any>) {
    const event: LifecycleEvent = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      orgId: agent.orgId,
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  private emptyUsage(): AgentUsage {
    return {
      tokensToday: 0, tokensThisWeek: 0, tokensThisMonth: 0, tokensThisYear: 0, tokenBudgetMonthly: 0,
      toolCallsToday: 0, toolCallsThisMonth: 0,
      externalActionsToday: 0, externalActionsThisMonth: 0,
      costToday: 0, costThisWeek: 0, costThisMonth: 0, costThisYear: 0, costBudgetMonthly: 0,
      activeSessionCount: 0, totalSessionsToday: 0,
      errorsToday: 0, errorRate1h: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ─── Birthday Automation ────────────────────────────

  /**
   * Register a callback to send birthday messages to agents.
   * Called once during server startup with access to the communication bus.
   */
  setBirthdaySender(sender: (agent: ManagedAgent) => Promise<void>) {
    this.birthdaySender = sender;
  }

  /**
   * Start the daily birthday check loop.
   * Runs every hour, but only triggers once per calendar day.
   */
  startBirthdayScheduler() {
    this.checkBirthdays(); // Run immediately on startup
    this.birthdayTimer = setInterval(() => this.checkBirthdays(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Check all agents for birthdays and send greetings.
   * Only fires once per calendar day.
   */
  private async checkBirthdays() {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (this.lastBirthdayCheck === dateKey) return; // Already checked today
    this.lastBirthdayCheck = dateKey;

    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    for (const agent of this.agents.values()) {
      const dob = agent.config?.identity?.dateOfBirth;
      if (!dob) continue;

      const dobDate = new Date(dob);
      if (dobDate.getMonth() + 1 === todayMonth && dobDate.getDate() === todayDay) {
        const age = AgentConfigGenerator.deriveAge(dob);
        this.emitEvent(agent, 'birthday', { dateOfBirth: dob, age, name: agent.config.displayName });

        if (this.birthdaySender) {
          try {
            await this.birthdaySender(agent);
          } catch (err) {
            console.error(`[lifecycle] Failed to send birthday message to ${agent.config.displayName}:`, err);
          }
        }
      }
    }
  }

  /** Get agents with upcoming birthdays (next N days) */
  getUpcomingBirthdays(days: number = 30): { agent: ManagedAgent; dateOfBirth: string; age: number; daysUntil: number }[] {
    const today = new Date();
    const results: { agent: ManagedAgent; dateOfBirth: string; age: number; daysUntil: number }[] = [];

    for (const agent of this.agents.values()) {
      const dob = agent.config?.identity?.dateOfBirth;
      if (!dob) continue;

      const dobDate = new Date(dob);
      // Calculate next birthday this year or next
      const thisYearBday = new Date(today.getFullYear(), dobDate.getMonth(), dobDate.getDate());
      if (thisYearBday < today) {
        thisYearBday.setFullYear(today.getFullYear() + 1);
      }
      const diffMs = thisYearBday.getTime() - today.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysUntil <= days) {
        results.push({
          agent,
          dateOfBirth: dob,
          age: AgentConfigGenerator.deriveAge(dob) + (daysUntil > 0 ? 1 : 0),
          daysUntil,
        });
      }
    }

    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * Cleanup: stop all health check loops
   */
  shutdown() {
    // Clear debounced flush timer
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    // Clear birthday scheduler
    if (this.birthdayTimer) { clearInterval(this.birthdayTimer); this.birthdayTimer = null; }

    // Best-effort flush of dirty agents before stopping
    for (const id of this.dirtyAgents) {
      const agent = this.agents.get(id);
      if (agent) {
        this.engineDb?.upsertManagedAgent(agent).catch(() => {});
      }
    }
    this.dirtyAgents.clear();

    for (const [id] of this.healthCheckIntervals) {
      this.stopHealthCheckLoop(id);
    }
  }
}
