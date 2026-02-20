/**
 * Approval Workflow Engine
 *
 * Human-in-the-loop for sensitive agent operations.
 * When a tool requires approval (based on risk level or side effects),
 * the engine queues the request and notifies approvers.
 */

// ─── Types ──────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  toolId: string;
  toolName: string;
  reason: string;                    // Why approval is needed
  riskLevel: string;
  sideEffects: string[];
  parameters?: Record<string, any>; // What the agent wants to do (sanitized)
  context?: string;                  // Brief description of what the agent is working on
  status: 'pending' | 'approved' | 'denied' | 'expired';
  decision?: ApprovalDecision;
  createdAt: string;
  expiresAt: string;                 // Auto-deny after this
}

export interface ApprovalDecision {
  by: string;                        // User ID of approver
  action: 'approve' | 'deny';
  reason?: string;                   // Optional reason for deny
  timestamp: string;
  conditions?: string;               // "Approved with conditions: ..."
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  description?: string;

  // What triggers this policy
  triggers: {
    riskLevels?: string[];
    sideEffects?: string[];
    toolIds?: string[];              // Specific tools
    allExternalActions?: boolean;    // Any action with side effects
  };

  // Who can approve
  approvers: {
    userIds: string[];               // Specific users
    roles: string[];                 // Any user with these roles
    requireMultiple?: number;        // Require N approvals (default: 1)
  };

  // Timing
  timeout: {
    minutes: number;
    defaultAction: 'deny' | 'allow'; // What happens on timeout
  };

  // Notification
  notify: {
    channels: ('email' | 'slack' | 'webhook')[];
    webhookUrl?: string;
    slackChannel?: string;
  };

  enabled: boolean;
}

// ─── Escalation Chains ────────────────────────────────

export interface EscalationLevel {
  order: number;
  approvers: {
    userIds: string[];
    roles: string[];
  };
  timeoutMinutes: number;
  notifyChannels: ('email' | 'slack' | 'webhook')[];
}

export interface EscalationChain {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  levels: EscalationLevel[];
  fallbackAction: 'deny' | 'allow' | 'escalate_admin';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EscalationState {
  chainId: string;
  currentLevel: number;
  history: { level: number; notifiedAt: string; escalatedAt?: string }[];
}

// ─── Engine ─────────────────────────────────────────────

import type { EngineDatabase } from './db-adapter.js';

export class ApprovalEngine {
  private requests = new Map<string, ApprovalRequest>();
  private policies: ApprovalPolicy[] = [];
  private escalationChains = new Map<string, EscalationChain>();
  private escalationTimers = new Map<string, NodeJS.Timeout>();
  private listeners: ((req: ApprovalRequest) => void)[] = [];
  private engineDb?: EngineDatabase;

  /**
   * Set the database adapter and load existing data from DB
   */
  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  /**
   * Load pending requests and policies from DB
   */
  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      // Load pending approval requests and recreate expiry timers
      const pending = await this.engineDb.getApprovalRequests({ status: 'pending' });
      for (const req of pending) {
        this.requests.set(req.id, req);
        this.recreateExpiryTimer(req);
      }

      // Load all approval policies
      const policies = await this.engineDb.getAllApprovalPolicies();
      for (const policy of policies) {
        if (!this.policies.find(p => p.id === policy.id)) {
          this.policies.push(policy);
        }
      }

      // Load escalation chains
      try {
        const chains = await this.engineDb.query<any>('SELECT * FROM escalation_chains WHERE enabled = 1');
        for (const r of chains) {
          this.escalationChains.set(r.id, {
            id: r.id, orgId: r.org_id, name: r.name, description: r.description,
            levels: JSON.parse(r.levels), fallbackAction: r.fallback_action,
            enabled: !!r.enabled, createdAt: r.created_at, updatedAt: r.updated_at,
          });
        }
      } catch { /* escalation_chains table may not exist yet */ }
    } catch {
      // Table may not exist yet
    }
  }

  private recreateExpiryTimer(req: ApprovalRequest): void {
    const expiresAt = new Date(req.expiresAt).getTime();
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      // Already expired — expire it now
      const policy = this.findMatchingPolicy(req.toolId, req.riskLevel, req.sideEffects);
      if (policy?.timeout.defaultAction === 'allow') {
        req.status = 'approved';
        req.decision = {
          by: 'system',
          action: 'approve',
          reason: 'Auto-approved: approval timeout expired',
          timestamp: new Date().toISOString(),
        };
      } else {
        req.status = 'expired';
      }
      this.engineDb?.updateApprovalRequest(req.id, req.status, req.decision).catch((err) => {
        console.error(`[approvals] Failed to expire request ${req.id}:`, err);
      });
      this.notifyListeners(req);
      return;
    }

    // Set timer for remaining time
    const policy = this.findMatchingPolicy(req.toolId, req.riskLevel, req.sideEffects);
    setTimeout(() => {
      const current = this.requests.get(req.id);
      if (current && current.status === 'pending') {
        if (policy?.timeout.defaultAction === 'allow') {
          current.status = 'approved';
          current.decision = {
            by: 'system',
            action: 'approve',
            reason: 'Auto-approved: approval timeout expired',
            timestamp: new Date().toISOString(),
          };
        } else {
          current.status = 'expired';
        }
        this.engineDb?.updateApprovalRequest(current.id, current.status, current.decision).catch((err) => {
          console.error(`[approvals] Failed to update expired request ${current.id}:`, err);
        });
        this.notifyListeners(current);
      }
    }, remaining);
  }

  async addPolicy(policy: ApprovalPolicy, orgId?: string): Promise<void> {
    this.policies.push(policy);
    if (this.engineDb && orgId) {
      try {
        await this.engineDb.upsertApprovalPolicy(orgId, policy);
      } catch (err) {
        console.error(`[approvals] Failed to persist policy ${policy.id}:`, err);
      }
    }
  }

  removePolicy(id: string) {
    this.policies = this.policies.filter(p => p.id !== id);
    this.engineDb?.deleteApprovalPolicy(id).catch((err) => {
      console.error(`[approvals] Failed to delete policy ${id}:`, err);
    });
  }

  getPolicies(): ApprovalPolicy[] {
    return [...this.policies];
  }

  /**
   * Check if a tool call needs approval and create a request if so
   */
  async requestApproval(opts: {
    agentId: string;
    agentName: string;
    toolId: string;
    toolName: string;
    riskLevel: string;
    sideEffects: string[];
    parameters?: Record<string, any>;
    context?: string;
    orgId?: string;
  }): Promise<ApprovalRequest | null> {
    // Find matching policy
    const policy = this.findMatchingPolicy(opts.toolId, opts.riskLevel, opts.sideEffects);
    if (!policy) return null; // No approval needed

    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      agentId: opts.agentId,
      agentName: opts.agentName,
      toolId: opts.toolId,
      toolName: opts.toolName,
      reason: `Policy "${policy.name}" requires approval`,
      riskLevel: opts.riskLevel,
      sideEffects: opts.sideEffects,
      parameters: this.sanitizeParams(opts.parameters),
      context: opts.context,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + policy.timeout.minutes * 60_000).toISOString(),
    };

    this.requests.set(request.id, request);

    // Persist to DB
    try {
      await this.engineDb?.insertApprovalRequest(request, opts.orgId || '');
    } catch (err) {
      console.error(`[approvals] Failed to persist approval request ${request.id}:`, err);
    }

    // Notify approvers
    await this.notifyApprovers(request, policy);

    // Set expiry timer
    setTimeout(() => {
      const req = this.requests.get(request.id);
      if (req && req.status === 'pending') {
        req.status = 'expired';
        if (policy.timeout.defaultAction === 'allow') {
          req.status = 'approved';
          req.decision = {
            by: 'system',
            action: 'approve',
            reason: 'Auto-approved: approval timeout expired',
            timestamp: new Date().toISOString(),
          };
        }
        this.notifyListeners(req);
      }
    }, policy.timeout.minutes * 60_000);

    // Notify listeners
    this.notifyListeners(request);

    return request;
  }

  /**
   * Approve or deny a pending request
   */
  async decide(requestId: string, decision: Omit<ApprovalDecision, 'timestamp'>): Promise<ApprovalRequest | null> {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    request.status = decision.action === 'approve' ? 'approved' : 'denied';
    request.decision = { ...decision, timestamp: new Date().toISOString() };

    // Persist to DB
    try {
      await this.engineDb?.updateApprovalRequest(request.id, request.status, request.decision);
    } catch (err) {
      console.error(`[approvals] Failed to persist decision for ${request.id}:`, err);
    }

    this.notifyListeners(request);
    return request;
  }

  /**
   * Get all pending requests (for the dashboard)
   */
  getPendingRequests(agentId?: string): ApprovalRequest[] {
    const all = Array.from(this.requests.values()).filter(r => r.status === 'pending');
    return agentId ? all.filter(r => r.agentId === agentId) : all;
  }

  /**
   * Get request by ID
   */
  getRequest(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Get history of all requests
   */
  getHistory(opts?: { agentId?: string; limit?: number; offset?: number }): { requests: ApprovalRequest[]; total: number } {
    let all = Array.from(this.requests.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (opts?.agentId) all = all.filter(r => r.agentId === opts.agentId);
    const total = all.length;
    const offset = opts?.offset || 0;
    const limit = opts?.limit || 25;
    return { requests: all.slice(offset, offset + limit), total };
  }

  /**
   * Wait for a specific request to be decided (for sync approval flows)
   */
  async waitForDecision(requestId: string, timeoutMs: number = 300_000): Promise<ApprovalRequest> {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const req = this.requests.get(requestId);
        if (req && req.status !== 'pending') {
          clearInterval(check);
          clearTimeout(timeout);
          resolve(req);
        }
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(check);
        const req = this.requests.get(requestId);
        if (req) {
          req.status = 'expired';
          resolve(req);
        } else {
          reject(new Error('Request not found'));
        }
      }, timeoutMs);
    });
  }

  /**
   * Subscribe to approval request changes
   */
  onRequest(listener: (req: ApprovalRequest) => void) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  // ─── Escalation Chains ──────────────────────────────────

  async addEscalationChain(chain: EscalationChain): Promise<void> {
    this.escalationChains.set(chain.id, chain);
    this.engineDb?.execute(
      `INSERT INTO escalation_chains (id, org_id, name, description, levels, fallback_action, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, levels=excluded.levels, fallback_action=excluded.fallback_action, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [chain.id, chain.orgId, chain.name, chain.description || null, JSON.stringify(chain.levels), chain.fallbackAction, chain.enabled ? 1 : 0, chain.createdAt, chain.updatedAt]
    ).catch((err) => { console.error(`[approvals] Failed to persist escalation chain ${chain.id}:`, err); });
  }

  removeEscalationChain(id: string): void {
    this.escalationChains.delete(id);
    this.engineDb?.execute('DELETE FROM escalation_chains WHERE id = ?', [id])
      .catch((err) => { console.error(`[approvals] Failed to delete escalation chain ${id}:`, err); });
  }

  getEscalationChains(orgId?: string): EscalationChain[] {
    const all = Array.from(this.escalationChains.values());
    return orgId ? all.filter(c => c.orgId === orgId) : all;
  }

  getEscalationChain(id: string): EscalationChain | undefined {
    return this.escalationChains.get(id);
  }

  /**
   * Manually escalate a pending approval request to the next level
   */
  async escalateRequest(requestId: string): Promise<ApprovalRequest | null> {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    const escalation = (request as any)._escalation as EscalationState | undefined;
    if (!escalation) return null;

    const chain = this.escalationChains.get(escalation.chainId);
    if (!chain) return null;

    const nextLevel = escalation.currentLevel + 1;
    const nextLevelDef = chain.levels.find(l => l.order === nextLevel);

    if (!nextLevelDef) {
      // No more levels — apply fallback
      if (chain.fallbackAction === 'allow') {
        request.status = 'approved';
        request.decision = { by: 'system', action: 'approve', reason: 'Escalation chain exhausted — auto-approved', timestamp: new Date().toISOString() };
      } else {
        request.status = 'expired';
      }
      this.engineDb?.updateApprovalRequest(request.id, request.status, request.decision).catch(() => {});
      this.notifyListeners(request);
      return request;
    }

    // Move to next level
    escalation.history.push({ level: escalation.currentLevel, notifiedAt: new Date().toISOString(), escalatedAt: new Date().toISOString() });
    escalation.currentLevel = nextLevel;

    // Update expiry based on new level's timeout
    request.expiresAt = new Date(Date.now() + nextLevelDef.timeoutMinutes * 60_000).toISOString();

    // Set new escalation timer
    this.clearEscalationTimer(requestId);
    this.setEscalationTimer(request, chain, nextLevel);

    // Persist escalation state
    this.engineDb?.execute(
      'UPDATE approval_requests SET escalation_level = ?, escalation_history = ?, expires_at = ? WHERE id = ?',
      [nextLevel, JSON.stringify(escalation.history), request.expiresAt, requestId]
    ).catch(() => {});

    this.notifyListeners(request);
    return request;
  }

  /**
   * Create an approval request with escalation chain support
   */
  async requestApprovalWithEscalation(opts: {
    agentId: string; agentName: string; toolId: string; toolName: string;
    riskLevel: string; sideEffects: string[]; parameters?: Record<string, any>;
    context?: string; orgId?: string; escalationChainId: string;
  }): Promise<ApprovalRequest | null> {
    const chain = this.escalationChains.get(opts.escalationChainId);
    if (!chain || !chain.enabled || chain.levels.length === 0) {
      return this.requestApproval(opts); // Fallback to standard approval
    }

    const firstLevel = chain.levels.find(l => l.order === 1) || chain.levels[0];

    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      agentId: opts.agentId, agentName: opts.agentName,
      toolId: opts.toolId, toolName: opts.toolName,
      reason: `Escalation chain "${chain.name}" — Level 1`,
      riskLevel: opts.riskLevel, sideEffects: opts.sideEffects,
      parameters: this.sanitizeParams(opts.parameters),
      context: opts.context, status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + firstLevel.timeoutMinutes * 60_000).toISOString(),
    };

    // Store escalation state as a hidden property
    const escalation: EscalationState = {
      chainId: chain.id, currentLevel: 1,
      history: [{ level: 1, notifiedAt: new Date().toISOString() }],
    };
    (request as any)._escalation = escalation;

    this.requests.set(request.id, request);

    // Persist with escalation columns
    try {
      await this.engineDb?.insertApprovalRequest(request, opts.orgId || '');
      await this.engineDb?.execute(
        'UPDATE approval_requests SET escalation_chain_id = ?, escalation_level = ?, escalation_history = ? WHERE id = ?',
        [chain.id, 1, JSON.stringify(escalation.history), request.id]
      );
    } catch (err) {
      console.error(`[approvals] Failed to persist escalated approval:`, err);
    }

    // Set escalation timer
    this.setEscalationTimer(request, chain, 1);

    this.notifyListeners(request);
    return request;
  }

  private setEscalationTimer(request: ApprovalRequest, chain: EscalationChain, currentLevel: number): void {
    const levelDef = chain.levels.find(l => l.order === currentLevel);
    if (!levelDef) return;

    const timer = setTimeout(() => {
      const req = this.requests.get(request.id);
      if (req && req.status === 'pending') {
        this.escalateRequest(request.id).catch(() => {});
      }
    }, levelDef.timeoutMinutes * 60_000);

    this.escalationTimers.set(request.id, timer);
  }

  private clearEscalationTimer(requestId: string): void {
    const timer = this.escalationTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(requestId);
    }
  }

  // ─── Private ──────────────────────────────────────────

  private findMatchingPolicy(toolId: string, riskLevel: string, sideEffects: string[]): ApprovalPolicy | undefined {
    return this.policies.find(p => {
      if (!p.enabled) return false;
      if (p.triggers.toolIds?.includes(toolId)) return true;
      if (p.triggers.riskLevels?.includes(riskLevel)) return true;
      if (p.triggers.sideEffects?.some(e => sideEffects.includes(e))) return true;
      if (p.triggers.allExternalActions && sideEffects.length > 0) return true;
      return false;
    });
  }

  private sanitizeParams(params?: Record<string, any>): Record<string, any> | undefined {
    if (!params) return undefined;
    // Remove sensitive fields
    const sanitized = { ...params };
    for (const key of ['password', 'token', 'secret', 'key', 'apiKey', 'credential']) {
      if (key in sanitized) sanitized[key] = '***';
    }
    return sanitized;
  }

  private async notifyApprovers(request: ApprovalRequest, policy: ApprovalPolicy) {
    for (const channel of policy.notify.channels) {
      switch (channel) {
        case 'webhook':
          if (policy.notify.webhookUrl) {
            try {
              await fetch(policy.notify.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'approval_request', request }),
              });
            } catch { /* fail silently */ }
          }
          break;
        // Email and Slack notifications would integrate with the existing AgenticMail system
      }
    }
  }

  private notifyListeners(request: ApprovalRequest) {
    for (const listener of this.listeners) {
      try { listener(request); } catch { /* ignore */ }
    }
  }
}
