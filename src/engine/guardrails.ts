/**
 * Guardrail Engine — Real-time Intervention & Anomaly Detection
 *
 * Provides emergency controls for autonomous agents:
 * - Pause/Resume/Kill: Immediate admin intervention
 * - Anomaly Detection: Rule-based detection with auto-actions
 *
 * Integrates into the runtime hook pipeline:
 * - beforeToolCall: check isAgentPaused() → deny if paused
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export type GuardrailRuleCategory = 'anomaly' | 'policy_compliance' | 'communication' | 'memory' | 'onboarding' | 'security';

export const GUARDRAIL_RULE_CATEGORIES: Record<GuardrailRuleCategory, { label: string; description: string; ruleTypes: string[] }> = {
  anomaly: { label: 'Anomaly Detection', description: 'Detect unusual patterns in agent behavior', ruleTypes: ['error_rate', 'cost_velocity', 'volume_spike', 'off_hours', 'session_anomaly'] },
  policy_compliance: { label: 'Policy Compliance', description: 'Ensure agents follow organization policies', ruleTypes: ['policy_violation', 'escalation_failure'] },
  communication: { label: 'Communication', description: 'Monitor agent communication quality', ruleTypes: ['tone_violation', 'keyword_detection'] },
  memory: { label: 'Memory', description: 'Control agent memory write behavior', ruleTypes: ['memory_flood'] },
  onboarding: { label: 'Onboarding', description: 'Enforce agent onboarding requirements', ruleTypes: ['onboarding_bypass'] },
  security: { label: 'Security', description: 'Detect security threats and suspicious patterns', ruleTypes: ['data_leak_attempt', 'repeated_error', 'prompt_injection'] },
};

export interface GuardrailRule {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  category: GuardrailRuleCategory;
  ruleType: string;
  conditions: {
    threshold?: number;
    windowMinutes?: number;
    maxPerHour?: number;
    maxPerDay?: number;
    patterns?: string[];
    keywords?: string[];
    agentIds?: string[];
    toolIds?: string[];
    comparator?: 'gt' | 'lt' | 'eq' | 'contains' | 'matches';
    value?: string | number;
  };
  action: 'alert' | 'pause' | 'kill' | 'notify' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldownMinutes: number;
  lastTriggeredAt?: string;
  triggerCount: number;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterventionRecord {
  id: string;
  orgId: string;
  agentId: string;
  type: 'pause' | 'resume' | 'kill' | 'anomaly_detected';
  reason: string;
  triggeredBy: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface AnomalyRule {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  ruleType: 'volume_spike' | 'unusual_tool' | 'off_hours' | 'error_rate' | 'cost_velocity';
  config: {
    threshold?: number;
    windowMinutes?: number;
    baselineMultiplier?: number;
    allowedHours?: { start: number; end: number; timezone: string };
    toolIds?: string[];
    maxErrorsPerHour?: number;
    maxCostPerHour?: number;
  };
  action: 'alert' | 'pause' | 'kill';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Guardrail Engine ──────────────────────────────────

export class GuardrailEngine {
  private anomalyRules = new Map<string, AnomalyRule>();
  private guardrailRules = new Map<string, GuardrailRule>();
  private pausedAgents = new Set<string>();
  private interventions: InterventionRecord[] = [];
  private engineDb?: EngineDatabase;
  private checkInterval?: NodeJS.Timeout;
  private onboardingManager?: { isOnboarded(agentId: string): boolean };

  /** External references for intervention actions */
  private stopAgent?: (agentId: string, by: string, reason: string) => Promise<any>;

  constructor(opts?: {
    stopAgent?: (agentId: string, by: string, reason: string) => Promise<any>;
  }) {
    if (opts?.stopAgent) this.stopAgent = opts.stopAgent;
  }

  setOnboardingManager(om: { isOnboarded(agentId: string): boolean }): void {
    this.onboardingManager = om;
  }

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rules = await this.engineDb.query<any>('SELECT * FROM anomaly_rules WHERE enabled = 1');
      for (const r of rules) {
        this.anomalyRules.set(r.id, {
          id: r.id, orgId: r.org_id, name: r.name, description: r.description,
          ruleType: r.rule_type, config: JSON.parse(r.config),
          action: r.action, enabled: !!r.enabled,
          createdAt: r.created_at, updatedAt: r.updated_at,
        });
      }

      // Rebuild paused set from most recent intervention per agent
      const recent = await this.engineDb.query<any>(
        "SELECT * FROM interventions ORDER BY created_at DESC LIMIT 200"
      );
      const lastAction = new Map<string, string>();
      for (const r of recent) {
        if (!lastAction.has(r.agent_id)) lastAction.set(r.agent_id, r.type);
      }
      for (const [agentId, type] of lastAction) {
        if (type === 'pause') this.pausedAgents.add(agentId);
      }
    } catch { /* table may not exist yet */ }

    // Load extended guardrail rules
    try {
      const gRules = await this.engineDb.query<any>('SELECT * FROM guardrail_rules WHERE enabled = 1');
      for (const r of gRules) {
        this.guardrailRules.set(r.id, {
          id: r.id, orgId: r.org_id, name: r.name, description: r.description,
          category: r.category, ruleType: r.rule_type,
          conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : (r.conditions || {}),
          action: r.action, severity: r.severity || 'medium',
          cooldownMinutes: r.cooldown_minutes || 0,
          lastTriggeredAt: r.last_triggered_at || undefined,
          triggerCount: r.trigger_count || 0,
          enabled: !!r.enabled, createdBy: r.created_by || 'system',
          createdAt: r.created_at, updatedAt: r.updated_at,
        });
      }
    } catch { /* table may not exist yet */ }
  }

  // ─── Intervention Actions ──────────────────────────

  async pauseAgent(agentId: string, reason: string, triggeredBy: string, orgId?: string): Promise<InterventionRecord> {
    this.pausedAgents.add(agentId);
    return this.recordIntervention(agentId, 'pause', reason, triggeredBy, {}, orgId);
  }

  async resumeAgent(agentId: string, reason: string, triggeredBy: string, orgId?: string): Promise<InterventionRecord> {
    this.pausedAgents.delete(agentId);
    return this.recordIntervention(agentId, 'resume', reason, triggeredBy, {}, orgId);
  }

  async killAgent(agentId: string, reason: string, triggeredBy: string, orgId?: string): Promise<InterventionRecord> {
    this.pausedAgents.delete(agentId);
    const record = await this.recordIntervention(agentId, 'kill', reason, triggeredBy, {}, orgId);
    if (this.stopAgent) {
      try { await this.stopAgent(agentId, triggeredBy, `Emergency kill: ${reason}`); } catch { /* best effort */ }
    }
    return record;
  }

  isAgentPaused(agentId: string): boolean {
    return this.pausedAgents.has(agentId);
  }

  getAgentStatus(agentId: string): { paused: boolean; recentInterventions: InterventionRecord[] } {
    return {
      paused: this.pausedAgents.has(agentId),
      recentInterventions: this.interventions.filter(i => i.agentId === agentId).slice(0, 10),
    };
  }

  // ─── Anomaly Rule CRUD ─────────────────────────────

  async addAnomalyRule(rule: AnomalyRule): Promise<void> {
    this.anomalyRules.set(rule.id, rule);
    this.engineDb?.execute(
      `INSERT INTO anomaly_rules (id, org_id, name, description, rule_type, config, action, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, rule_type=excluded.rule_type, config=excluded.config, action=excluded.action, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [rule.id, rule.orgId, rule.name, rule.description || null, rule.ruleType, JSON.stringify(rule.config), rule.action, rule.enabled ? 1 : 0, rule.createdAt, rule.updatedAt]
    ).catch((err) => { console.error('[guardrails] Failed to persist anomaly rule:', err); });
  }

  removeAnomalyRule(id: string): void {
    this.anomalyRules.delete(id);
    this.engineDb?.execute('DELETE FROM anomaly_rules WHERE id = ?', [id])
      .catch((err) => { console.error('[guardrails] Failed to delete anomaly rule:', err); });
  }

  getAnomalyRules(orgId?: string): AnomalyRule[] {
    const all = Array.from(this.anomalyRules.values());
    return orgId ? all.filter(r => r.orgId === orgId) : all;
  }

  // ─── Anomaly Detection Loop ────────────────────────

  startAnomalyDetection(): void {
    this.stopAnomalyDetection();
    this.checkInterval = setInterval(() => this.detectAnomalies(), 60_000);
  }

  stopAnomalyDetection(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private async detectAnomalies(): Promise<void> {
    if (!this.engineDb) return;
    for (const rule of this.anomalyRules.values()) {
      if (!rule.enabled) continue;
      try {
        const triggered = await this.evaluateRule(rule);
        if (triggered) {
          await this.handleAnomalyAction(rule, triggered);
        }
      } catch { /* skip failed rules */ }
    }
  }

  private async evaluateRule(rule: AnomalyRule): Promise<{ agentId: string; detail: string } | null> {
    const window = rule.config.windowMinutes || 60;
    const since = new Date(Date.now() - window * 60_000).toISOString();

    switch (rule.ruleType) {
      case 'error_rate': {
        const maxErrors = rule.config.maxErrorsPerHour || 50;
        const rows = await this.engineDb!.query<any>(
          "SELECT agent_id, COUNT(*) as cnt FROM activity_events WHERE org_id = ? AND type = 'tool_call_error' AND created_at >= ? GROUP BY agent_id HAVING cnt > ?",
          [rule.orgId, since, maxErrors]
        );
        if (rows.length > 0) return { agentId: rows[0].agent_id, detail: `${rows[0].cnt} errors in ${window}min (max: ${maxErrors})` };
        break;
      }
      case 'cost_velocity': {
        const maxCost = rule.config.maxCostPerHour || 10;
        const rows = await this.engineDb!.query<any>(
          "SELECT agent_id, SUM(json_extract(cost, '$.estimatedCostUsd')) as total_cost FROM tool_calls WHERE org_id = ? AND created_at >= ? AND cost IS NOT NULL GROUP BY agent_id HAVING total_cost > ?",
          [rule.orgId, since, maxCost]
        );
        if (rows.length > 0) return { agentId: rows[0].agent_id, detail: `$${Number(rows[0].total_cost).toFixed(2)} in ${window}min (max: $${maxCost})` };
        break;
      }
      case 'volume_spike': {
        const threshold = rule.config.threshold || 500;
        const rows = await this.engineDb!.query<any>(
          "SELECT agent_id, COUNT(*) as cnt FROM tool_calls WHERE org_id = ? AND created_at >= ? GROUP BY agent_id HAVING cnt > ?",
          [rule.orgId, since, threshold]
        );
        if (rows.length > 0) return { agentId: rows[0].agent_id, detail: `${rows[0].cnt} tool calls in ${window}min (max: ${threshold})` };
        break;
      }
      case 'off_hours': {
        if (!rule.config.allowedHours) break;
        const now = new Date();
        const hour = now.getUTCHours();
        const { start, end } = rule.config.allowedHours;
        const isAllowed = start < end ? (hour >= start && hour < end) : (hour >= start || hour < end);
        if (!isAllowed) {
          const activeRows = await this.engineDb!.query<any>(
            "SELECT DISTINCT agent_id FROM tool_calls WHERE org_id = ? AND created_at >= ?",
            [rule.orgId, since]
          );
          if (activeRows.length > 0) return { agentId: activeRows[0].agent_id, detail: `Activity outside allowed hours (${start}:00-${end}:00 UTC)` };
        }
        break;
      }
    }
    return null;
  }

  private async handleAnomalyAction(rule: AnomalyRule, triggered: { agentId: string; detail: string }): Promise<void> {
    await this.recordIntervention(
      triggered.agentId, 'anomaly_detected',
      `Rule "${rule.name}" triggered: ${triggered.detail}`,
      'system', { ruleId: rule.id, ruleType: rule.ruleType }, rule.orgId
    );

    switch (rule.action) {
      case 'pause':
        this.pausedAgents.add(triggered.agentId);
        break;
      case 'kill':
        if (this.stopAgent) {
          try { await this.stopAgent(triggered.agentId, 'system', `Anomaly: ${triggered.detail}`); } catch { /* best effort */ }
        }
        break;
    }
  }

  // ─── Intervention History ──────────────────────────

  getInterventions(opts?: { orgId?: string; agentId?: string; limit?: number }): InterventionRecord[] {
    let list = [...this.interventions];
    if (opts?.orgId) list = list.filter(i => i.orgId === opts.orgId);
    if (opts?.agentId) list = list.filter(i => i.agentId === opts.agentId);
    return list.slice(0, opts?.limit || 50);
  }

  private async recordIntervention(agentId: string, type: InterventionRecord['type'], reason: string, triggeredBy: string, metadata: Record<string, any> = {}, orgId?: string): Promise<InterventionRecord> {
    const resolvedOrgId = orgId || this.interventions.find(i => i.agentId === agentId)?.orgId || 'default';
    const record: InterventionRecord = {
      id: crypto.randomUUID(), orgId: resolvedOrgId, agentId, type, reason, triggeredBy, metadata,
      createdAt: new Date().toISOString(),
    };
    this.interventions.push(record);
    if (this.interventions.length > 500) this.interventions = this.interventions.slice(-500);

    this.engineDb?.execute(
      'INSERT INTO interventions (id, org_id, agent_id, type, reason, triggered_by, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [record.id, record.orgId, record.agentId, record.type, record.reason, record.triggeredBy, JSON.stringify(record.metadata), record.createdAt]
    ).catch((err) => { console.error('[guardrails] Failed to persist intervention:', err); });

    return record;
  }

  // ─── Extended Guardrail Rule CRUD ────────────────────

  async addGuardrailRule(rule: GuardrailRule): Promise<void> {
    this.guardrailRules.set(rule.id, rule);
    this.engineDb?.execute(
      `INSERT INTO guardrail_rules (id, org_id, name, description, category, rule_type, conditions, action, severity, cooldown_minutes, trigger_count, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category, rule_type=excluded.rule_type, conditions=excluded.conditions, action=excluded.action, severity=excluded.severity, cooldown_minutes=excluded.cooldown_minutes, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [rule.id, rule.orgId, rule.name, rule.description || null, rule.category, rule.ruleType,
       JSON.stringify(rule.conditions), rule.action, rule.severity, rule.cooldownMinutes,
       rule.triggerCount || 0, rule.enabled ? 1 : 0, rule.createdBy, rule.createdAt, rule.updatedAt]
    ).catch(err => console.error('[guardrails] Failed to persist guardrail rule:', err));
  }

  async updateGuardrailRule(id: string, updates: Partial<GuardrailRule>): Promise<GuardrailRule | null> {
    const existing = this.guardrailRules.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.guardrailRules.set(id, updated);
    await this.addGuardrailRule(updated);
    return updated;
  }

  removeGuardrailRule(id: string): void {
    this.guardrailRules.delete(id);
    this.engineDb?.execute('DELETE FROM guardrail_rules WHERE id = ?', [id])
      .catch(err => console.error('[guardrails] Failed to delete guardrail rule:', err));
  }

  getGuardrailRules(orgId?: string, category?: string): GuardrailRule[] {
    let all = Array.from(this.guardrailRules.values());
    if (orgId) all = all.filter(r => r.orgId === orgId);
    if (category) all = all.filter(r => r.category === category);
    return all;
  }

  // ─── Onboarding Gate ─────────────────────────────────

  isAgentOnboarded(agentId: string): boolean {
    if (!this.onboardingManager) return true; // No onboarding system = all onboarded
    return this.onboardingManager.isOnboarded(agentId);
  }

  // ─── Enhanced Status ─────────────────────────────────

  getAgentFullStatus(agentId: string): {
    paused: boolean;
    onboarded: boolean;
    recentInterventions: InterventionRecord[];
    activeRuleViolations: { ruleId: string; ruleName: string; lastTriggered: string }[];
  } {
    const violations = Array.from(this.guardrailRules.values())
      .filter(r => r.lastTriggeredAt && r.lastTriggeredAt > new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .map(r => ({ ruleId: r.id, ruleName: r.name, lastTriggered: r.lastTriggeredAt! }));

    return {
      paused: this.pausedAgents.has(agentId),
      onboarded: this.isAgentOnboarded(agentId),
      recentInterventions: this.interventions.filter(i => i.agentId === agentId).slice(0, 10),
      activeRuleViolations: violations,
    };
  }
}
