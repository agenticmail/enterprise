/**
 * Data Loss Prevention (DLP) Engine
 *
 * Scans tool call parameters and results for sensitive data:
 * PII, secrets, API keys, credentials. Can block, redact, warn, or log.
 *
 * Integrates into the runtime hook pipeline:
 * - beforeToolCall: scan parameters → block/redact before execution
 * - afterToolCall: scan results → redact before returning to agent
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export interface DLPRule {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  patternType: 'regex' | 'keyword' | 'pii_type';
  pattern: string;
  action: 'block' | 'redact' | 'warn' | 'log';
  appliesTo: 'parameters' | 'results' | 'both';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DLPViolation {
  id: string;
  orgId: string;
  agentId: string;
  ruleId: string;
  toolId: string;
  actionTaken: 'blocked' | 'redacted' | 'warned' | 'logged';
  matchContext?: string;
  direction: 'outbound' | 'inbound';
  createdAt: string;
}

export interface DLPScanResult {
  allowed: boolean;
  violations: DLPViolation[];
  modifiedContent?: Record<string, any>;
  reason?: string;
}

// ─── Built-in PII Patterns ─────────────────────────────

const PII_PATTERNS: Record<string, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  api_key: /(?:sk|pk|api|key|token|secret|password)[_-]?[a-zA-Z0-9]{20,}/gi,
  aws_key: /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
};

// ─── DLP Engine ────────────────────────────────────────

export class DLPEngine {
  private rules = new Map<string, DLPRule>();
  private violations: DLPViolation[] = [];
  private engineDb?: EngineDatabase;

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM dlp_rules WHERE enabled = 1');
      for (const r of rows) {
        this.rules.set(r.id, {
          id: r.id, orgId: r.org_id, name: r.name, description: r.description,
          patternType: r.pattern_type, pattern: r.pattern, action: r.action,
          appliesTo: r.applies_to, severity: r.severity, enabled: !!r.enabled,
          createdAt: r.created_at, updatedAt: r.updated_at,
        });
      }
    } catch { /* table may not exist yet */ }
  }

  // ─── Rule CRUD ──────────────────────────────────────

  async addRule(rule: DLPRule): Promise<void> {
    this.rules.set(rule.id, rule);
    this.engineDb?.execute(
      `INSERT INTO dlp_rules (id, org_id, name, description, pattern_type, pattern, action, applies_to, severity, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, pattern_type=excluded.pattern_type, pattern=excluded.pattern, action=excluded.action, applies_to=excluded.applies_to, severity=excluded.severity, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [rule.id, rule.orgId, rule.name, rule.description || null, rule.patternType, rule.pattern, rule.action, rule.appliesTo, rule.severity, rule.enabled ? 1 : 0, rule.createdAt, rule.updatedAt]
    ).catch((err) => { console.error('[dlp] Failed to persist rule:', err); });
  }

  removeRule(id: string): void {
    this.rules.delete(id);
    this.engineDb?.execute('DELETE FROM dlp_rules WHERE id = ?', [id])
      .catch((err) => { console.error('[dlp] Failed to delete rule:', err); });
  }

  getRules(orgId?: string): DLPRule[] {
    const all = Array.from(this.rules.values());
    return orgId ? all.filter(r => r.orgId === orgId) : all;
  }

  getRule(id: string): DLPRule | undefined {
    return this.rules.get(id);
  }

  // ─── Scanning ──────────────────────────────────────

  scanParameters(orgId: string, agentId: string, toolId: string, params: Record<string, any>): DLPScanResult {
    const rules = this.getApplicableRules(orgId, 'parameters');
    return this.scan(orgId, agentId, toolId, params, rules, 'outbound');
  }

  scanResults(orgId: string, agentId: string, toolId: string, result: any): DLPScanResult {
    const rules = this.getApplicableRules(orgId, 'results');
    return this.scan(orgId, agentId, toolId, typeof result === 'object' ? result : { _value: result }, rules, 'inbound');
  }

  testScan(orgId: string, content: string): { matches: { ruleName: string; ruleId: string; matchCount: number }[] } {
    const rules = Array.from(this.rules.values()).filter(r => r.orgId === orgId && r.enabled);
    const matches: { ruleName: string; ruleId: string; matchCount: number }[] = [];
    for (const rule of rules) {
      const pattern = this.compilePattern(rule);
      if (!pattern) continue;
      const m = content.match(pattern);
      if (m && m.length > 0) {
        matches.push({ ruleName: rule.name, ruleId: rule.id, matchCount: m.length });
      }
    }
    return { matches };
  }

  getViolations(opts?: { orgId?: string; agentId?: string; limit?: number }): DLPViolation[] {
    let v = [...this.violations];
    if (opts?.orgId) v = v.filter(x => x.orgId === opts.orgId);
    if (opts?.agentId) v = v.filter(x => x.agentId === opts.agentId);
    return v.slice(0, opts?.limit || 100);
  }

  // ─── Private ──────────────────────────────────────

  private getApplicableRules(orgId: string, direction: 'parameters' | 'results'): DLPRule[] {
    return Array.from(this.rules.values()).filter(r =>
      r.orgId === orgId && r.enabled && (r.appliesTo === 'both' || r.appliesTo === direction)
    );
  }

  private scan(orgId: string, agentId: string, toolId: string, data: Record<string, any>, rules: DLPRule[], direction: 'outbound' | 'inbound'): DLPScanResult {
    const content = JSON.stringify(data);
    const violations: DLPViolation[] = [];
    let blocked = false;
    let modified = false;
    let modifiedContent: Record<string, any> | undefined;

    for (const rule of rules) {
      const pattern = this.compilePattern(rule);
      if (!pattern) continue;

      const matches = content.match(pattern);
      if (!matches || matches.length === 0) continue;

      const violation: DLPViolation = {
        id: crypto.randomUUID(),
        orgId, agentId, ruleId: rule.id, toolId,
        actionTaken: rule.action as any,
        matchContext: this.sanitizeMatchContext(matches[0]),
        direction,
        createdAt: new Date().toISOString(),
      };
      violations.push(violation);
      this.recordViolation(violation);

      switch (rule.action) {
        case 'block':
          blocked = true;
          break;
        case 'redact':
          if (!modifiedContent) modifiedContent = JSON.parse(JSON.stringify(data));
          modifiedContent = JSON.parse(JSON.stringify(modifiedContent).replace(pattern, '[REDACTED]'));
          modified = true;
          break;
        case 'warn':
        case 'log':
          break;
      }
    }

    return {
      allowed: !blocked,
      violations,
      modifiedContent: modified ? modifiedContent : undefined,
      reason: blocked ? `DLP policy violation: ${violations.map(v => v.ruleId).join(', ')}` : undefined,
    };
  }

  private compilePattern(rule: DLPRule): RegExp | null {
    try {
      if (rule.patternType === 'pii_type') {
        return PII_PATTERNS[rule.pattern] || null;
      }
      if (rule.patternType === 'keyword') {
        return new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      }
      return new RegExp(rule.pattern, 'gi');
    } catch {
      return null;
    }
  }

  private sanitizeMatchContext(match: string): string {
    if (match.length <= 4) return '***';
    return match.substring(0, 2) + '***' + match.substring(match.length - 2);
  }

  private recordViolation(violation: DLPViolation): void {
    this.violations.push(violation);
    if (this.violations.length > 1000) this.violations = this.violations.slice(-1000);
    this.engineDb?.execute(
      'INSERT INTO dlp_violations (id, org_id, agent_id, rule_id, tool_id, action_taken, match_context, direction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [violation.id, violation.orgId, violation.agentId, violation.ruleId, violation.toolId, violation.actionTaken, violation.matchContext || null, violation.direction, violation.createdAt]
    ).catch((err) => { console.error('[dlp] Failed to persist violation:', err); });
  }
}
