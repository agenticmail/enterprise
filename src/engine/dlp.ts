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

// ─── Enterprise Default Rule Templates ─────────────────

export interface DLPRuleTemplate {
  name: string;
  description: string;
  patternType: 'regex' | 'keyword' | 'pii_type';
  pattern: string;
  action: 'block' | 'redact' | 'warn' | 'log';
  appliesTo: 'parameters' | 'results' | 'both';
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

export const DLP_RULE_PACKS: Record<string, { label: string; description: string; rules: DLPRuleTemplate[] }> = {
  pii_protection: {
    label: 'PII Protection',
    description: 'Detect and block personal identifiable information: emails, SSNs, credit cards, phone numbers, passport numbers, national IDs.',
    rules: [
      { name: 'Email Address Detection', description: 'Detects email addresses in agent communications', patternType: 'pii_type', pattern: 'email', action: 'redact', appliesTo: 'both', severity: 'medium', category: 'pii' },
      { name: 'SSN Detection', description: 'Detects US Social Security Numbers (XXX-XX-XXXX)', patternType: 'pii_type', pattern: 'ssn', action: 'block', appliesTo: 'both', severity: 'critical', category: 'pii' },
      { name: 'Credit Card Detection', description: 'Detects credit/debit card numbers', patternType: 'pii_type', pattern: 'credit_card', action: 'block', appliesTo: 'both', severity: 'critical', category: 'pii' },
      { name: 'Phone Number Detection', description: 'Detects phone numbers in various formats', patternType: 'pii_type', pattern: 'phone', action: 'redact', appliesTo: 'both', severity: 'medium', category: 'pii' },
      { name: 'Passport Number Detection', description: 'Detects passport numbers (US, UK, EU formats)', patternType: 'regex', pattern: '\\b[A-Z]{1,2}\\d{6,9}\\b', action: 'block', appliesTo: 'both', severity: 'critical', category: 'pii' },
      { name: 'Date of Birth Detection', description: 'Detects dates of birth in common formats', patternType: 'regex', pattern: '\\b(?:DOB|date\\s*of\\s*birth|born\\s*on)[:\\s]*\\d{1,2}[/\\-.]\\d{1,2}[/\\-.]\\d{2,4}\\b', action: 'redact', appliesTo: 'both', severity: 'high', category: 'pii' },
      { name: 'Driver License Number', description: 'Detects US driver license number patterns', patternType: 'regex', pattern: '\\b(?:DL|driver[\\s\']*s?\\s*license)[:#\\s]*[A-Z]?\\d{4,12}\\b', action: 'block', appliesTo: 'both', severity: 'critical', category: 'pii' },
      { name: 'National Insurance / Tax ID', description: 'Detects UK NI numbers, EINs, TINs, ITINs', patternType: 'regex', pattern: '\\b(?:[A-Z]{2}\\d{6}[A-Z]|\\d{2}-\\d{7}|9\\d{2}-[7-9]\\d-\\d{4})\\b', action: 'block', appliesTo: 'both', severity: 'critical', category: 'pii' },
      { name: 'IBAN Detection', description: 'Detects international bank account numbers', patternType: 'regex', pattern: '\\b[A-Z]{2}\\d{2}\\s?[A-Z0-9]{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{0,4}\\s?\\d{0,2}\\b', action: 'block', appliesTo: 'both', severity: 'critical', category: 'pii' },
      { name: 'IP Address Detection', description: 'Detects private and public IPv4 addresses', patternType: 'regex', pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\b', action: 'warn', appliesTo: 'both', severity: 'low', category: 'pii' },
    ]
  },
  credentials_secrets: {
    label: 'Credentials & Secrets',
    description: 'Block API keys, passwords, tokens, private keys, and cloud credentials from leaking through agent tools.',
    rules: [
      { name: 'Generic API Key', description: 'Detects API keys, tokens, and secrets in common formats', patternType: 'pii_type', pattern: 'api_key', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'AWS Access Key', description: 'Detects AWS access key IDs (AKIA/ASIA prefix)', patternType: 'pii_type', pattern: 'aws_key', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'AWS Secret Key', description: 'Detects AWS secret access keys (40-char base64)', patternType: 'regex', pattern: '(?:aws_secret_access_key|aws_secret)[\\s=:]+[A-Za-z0-9/+=]{40}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'Private Key Block', description: 'Detects PEM-encoded private keys', patternType: 'regex', pattern: '-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'GitHub Token', description: 'Detects GitHub personal access tokens and fine-grained tokens', patternType: 'regex', pattern: '(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'Slack Token', description: 'Detects Slack bot, user, and webhook tokens', patternType: 'regex', pattern: 'xox[bporas]-[A-Za-z0-9-]{10,}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'Stripe Key', description: 'Detects Stripe publishable and secret keys', patternType: 'regex', pattern: '(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'Google API Key', description: 'Detects Google API keys', patternType: 'regex', pattern: 'AIza[A-Za-z0-9_\\-]{35}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'JWT Token', description: 'Detects JSON Web Tokens', patternType: 'regex', pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}', action: 'warn', appliesTo: 'both', severity: 'high', category: 'secrets' },
      { name: 'Password in Plaintext', description: 'Detects plaintext passwords in key-value pairs', patternType: 'regex', pattern: '(?:password|passwd|pwd|pass)[\\s]*[=:][\\s]*[^\\s,;]{6,}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'Connection String', description: 'Detects database connection strings with credentials', patternType: 'regex', pattern: '(?:mysql|postgres(?:ql)?|mongodb(?:\\+srv)?|redis|amqp)://[^\\s]+:[^\\s]+@[^\\s]+', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'OpenAI / Anthropic Key', description: 'Detects OpenAI and Anthropic API keys', patternType: 'regex', pattern: '(?:sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,})', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'SendGrid Key', description: 'Detects SendGrid API keys', patternType: 'regex', pattern: 'SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
      { name: 'Twilio Credentials', description: 'Detects Twilio account SID and auth tokens', patternType: 'regex', pattern: '(?:AC[a-f0-9]{32}|SK[a-f0-9]{32})', action: 'block', appliesTo: 'both', severity: 'critical', category: 'secrets' },
    ]
  },
  financial_data: {
    label: 'Financial Data Protection',
    description: 'Protect financial information: bank accounts, routing numbers, tax returns, salary data, financial statements.',
    rules: [
      { name: 'Bank Account Number', description: 'Detects bank account numbers (8-17 digits with context)', patternType: 'regex', pattern: '(?:account|acct)[\\s#:]*\\d{8,17}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'financial' },
      { name: 'Routing Number', description: 'Detects US ABA routing numbers', patternType: 'regex', pattern: '(?:routing|ABA)[\\s#:]*\\d{9}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'financial' },
      { name: 'SWIFT / BIC Code', description: 'Detects SWIFT/BIC bank codes', patternType: 'regex', pattern: '\\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b', action: 'warn', appliesTo: 'both', severity: 'high', category: 'financial' },
      { name: 'Salary / Compensation Data', description: 'Detects salary, compensation, and pay rate information', patternType: 'regex', pattern: '(?:salary|compensation|pay\\s*rate|annual\\s*income|base\\s*pay)[\\s:$]*\\d{2,3}[,.]?\\d{3}', action: 'redact', appliesTo: 'both', severity: 'high', category: 'financial' },
      { name: 'Tax Return Data', description: 'Detects tax form references with amounts', patternType: 'regex', pattern: '(?:W-?2|1099|W-?9|1040)[\\s]*(?:form)?[\\s:]*.*\\$[\\d,]+', action: 'block', appliesTo: 'both', severity: 'critical', category: 'financial' },
    ]
  },
  healthcare_hipaa: {
    label: 'Healthcare / HIPAA',
    description: 'HIPAA-compliant rules for protected health information: medical record numbers, diagnoses, prescriptions, insurance IDs.',
    rules: [
      { name: 'Medical Record Number', description: 'Detects medical record / patient ID numbers', patternType: 'regex', pattern: '(?:MRN|medical\\s*record|patient\\s*(?:id|number))[\\s#:]*[A-Z0-9]{6,15}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'healthcare' },
      { name: 'Health Insurance ID', description: 'Detects health insurance policy and member IDs', patternType: 'regex', pattern: '(?:member\\s*id|policy\\s*(?:number|id)|insurance\\s*id|group\\s*(?:number|id))[\\s#:]*[A-Z0-9]{6,20}', action: 'block', appliesTo: 'both', severity: 'critical', category: 'healthcare' },
      { name: 'ICD/CPT Code with Context', description: 'Detects medical diagnosis/procedure codes with patient context', patternType: 'regex', pattern: '(?:diagnosis|ICD-?10|CPT)[\\s:]*[A-Z]\\d{2}\\.?\\d{0,4}', action: 'warn', appliesTo: 'both', severity: 'high', category: 'healthcare' },
      { name: 'Prescription Information', description: 'Detects prescription drug names with dosage', patternType: 'regex', pattern: '(?:prescribed|prescription|Rx)[\\s:]+\\w+\\s+\\d+\\s*(?:mg|ml|mcg|units)', action: 'redact', appliesTo: 'both', severity: 'high', category: 'healthcare' },
      { name: 'DEA Number', description: 'Detects DEA registration numbers', patternType: 'regex', pattern: '\\b[ABCDEFGHJKLMNPRSTUX][A-Z9]\\d{7}\\b', action: 'block', appliesTo: 'both', severity: 'critical', category: 'healthcare' },
    ]
  },
  compliance_gdpr: {
    label: 'GDPR / EU Compliance',
    description: 'EU data protection rules: consent tracking, data subject references, cross-border transfer markers, right-to-erasure compliance.',
    rules: [
      { name: 'EU National ID', description: 'Detects EU national identity numbers (Germany, France, etc.)', patternType: 'regex', pattern: '\\b(?:\\d{2}[\\s.]?\\d{2}[\\s.]?\\d{2}[\\s.]?\\d{3}[\\s.]?\\d{3}[\\s.]?\\d{2}|\\d{11})\\b', action: 'block', appliesTo: 'both', severity: 'critical', category: 'gdpr' },
      { name: 'Data Subject Request Keywords', description: 'Detects GDPR data subject request language', patternType: 'keyword', pattern: 'right to erasure|right to be forgotten|data subject access request|DSAR|data portability request', action: 'warn', appliesTo: 'both', severity: 'high', category: 'gdpr' },
      { name: 'Consent Withdrawal', description: 'Detects consent withdrawal language requiring action', patternType: 'keyword', pattern: 'withdraw consent|revoke consent|opt out of processing|withdraw my consent', action: 'warn', appliesTo: 'both', severity: 'high', category: 'gdpr' },
      { name: 'Cross-Border Transfer Marker', description: 'Detects references to international data transfers', patternType: 'keyword', pattern: 'transfer to third country|adequacy decision|standard contractual clauses|binding corporate rules', action: 'log', appliesTo: 'both', severity: 'medium', category: 'gdpr' },
    ]
  },
  intellectual_property: {
    label: 'Intellectual Property',
    description: 'Prevent leaking trade secrets, proprietary code, confidential documents, and internal-only information.',
    rules: [
      { name: 'Confidentiality Markers', description: 'Detects documents marked as confidential or restricted', patternType: 'regex', pattern: '(?:CONFIDENTIAL|TOP SECRET|INTERNAL ONLY|RESTRICTED|PROPRIETARY|DO NOT DISTRIBUTE|NDA PROTECTED)', action: 'block', appliesTo: 'both', severity: 'critical', category: 'ip' },
      { name: 'Source Code Patterns', description: 'Detects large blocks of source code being transmitted', patternType: 'regex', pattern: '(?:function|class|import|export|const|let|var|def|public|private)\\s+\\w+.*[{(]\\s*(?:\\n.*){10,}', action: 'warn', appliesTo: 'both', severity: 'high', category: 'ip' },
      { name: 'Patent / Filing References', description: 'Detects patent application and filing references', patternType: 'regex', pattern: '(?:patent|filing|application)[\\s#:]*(?:US|EP|WO|PCT)[/\\s]?\\d{4,}', action: 'warn', appliesTo: 'both', severity: 'high', category: 'ip' },
      { name: 'Internal URL / Hostname', description: 'Detects internal network URLs and hostnames', patternType: 'regex', pattern: 'https?://(?:[a-z0-9-]+\\.)*(?:internal|corp|intranet|private|staging|dev)\\.[a-z]+', action: 'warn', appliesTo: 'both', severity: 'medium', category: 'ip' },
    ]
  },
  agent_safety: {
    label: 'Agent Safety & Prompt Injection',
    description: 'Prevent prompt injection, jailbreak attempts, and unsafe agent behaviors in tool inputs.',
    rules: [
      { name: 'Prompt Injection - Ignore Instructions', description: 'Detects prompt injection attempts telling agent to ignore instructions', patternType: 'regex', pattern: '(?:ignore|disregard|forget)\\s+(?:all\\s+)?(?:previous|above|prior|your)\\s+(?:instructions|rules|guidelines|system\\s*prompt)', action: 'block', appliesTo: 'both', severity: 'critical', category: 'safety' },
      { name: 'Prompt Injection - Role Override', description: 'Detects attempts to override agent role or persona', patternType: 'regex', pattern: '(?:you\\s+are\\s+now|act\\s+as|pretend\\s+(?:to\\s+be|you\\s+are)|your\\s+new\\s+(?:role|instructions)|from\\s+now\\s+on\\s+you)', action: 'block', appliesTo: 'both', severity: 'critical', category: 'safety' },
      { name: 'Prompt Injection - System Prompt Extraction', description: 'Detects attempts to extract system prompts', patternType: 'regex', pattern: '(?:show|reveal|print|output|display|repeat|echo)\\s+(?:your\\s+)?(?:system\\s*prompt|instructions|rules|initial\\s*prompt|SOUL|AGENTS)', action: 'block', appliesTo: 'both', severity: 'critical', category: 'safety' },
      { name: 'Base64 Encoded Payload', description: 'Detects suspiciously large base64 payloads that might hide malicious content', patternType: 'regex', pattern: '(?:eval|exec|system|import)\\s*\\(\\s*(?:atob|Buffer\\.from|base64\\.decode)', action: 'block', appliesTo: 'both', severity: 'critical', category: 'safety' },
      { name: 'Shell Injection Attempt', description: 'Detects command injection patterns in tool parameters', patternType: 'regex', pattern: '(?:;|&&|\\|\\||`)[\\s]*(?:rm|curl|wget|nc|bash|sh|python|node|eval|exec)\\s', action: 'block', appliesTo: 'parameters', severity: 'critical', category: 'safety' },
    ]
  },
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
      const rows = await this.engineDb.query<any>('SELECT * FROM dlp_rules WHERE enabled = TRUE');
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

  /** Hot-reload all rules from DB (called after bulk operations or by other server instances) */
  async reloadRules(): Promise<void> {
    this.rules.clear();
    await this.loadFromDb();
  }

  /** Apply a default rule pack to an organization, returns created rule count */
  async applyRulePack(orgId: string, packId: string, options?: { overwrite?: boolean }): Promise<{ created: number; skipped: number; rules: DLPRule[] }> {
    const pack = DLP_RULE_PACKS[packId];
    if (!pack) throw new Error(`Unknown rule pack: ${packId}`);

    const existing = this.getRules(orgId);
    const existingNames = new Set(existing.map(r => r.name));
    const now = new Date().toISOString();
    let created = 0, skipped = 0;
    const createdRules: DLPRule[] = [];

    for (const tpl of pack.rules) {
      if (!options?.overwrite && existingNames.has(tpl.name)) { skipped++; continue; }

      // If overwrite, find and remove existing rule with same name
      if (options?.overwrite) {
        const dup = existing.find(r => r.name === tpl.name);
        if (dup) this.removeRule(dup.id);
      }

      const rule: DLPRule = {
        id: crypto.randomUUID(),
        orgId,
        name: tpl.name,
        description: tpl.description,
        patternType: tpl.patternType,
        pattern: tpl.pattern,
        action: tpl.action,
        appliesTo: tpl.appliesTo,
        severity: tpl.severity,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.addRule(rule);
      createdRules.push(rule);
      created++;
    }

    return { created, skipped, rules: createdRules };
  }

  /** Apply multiple rule packs at once */
  async applyRulePacks(orgId: string, packIds: string[], options?: { overwrite?: boolean }): Promise<{ created: number; skipped: number; packs: string[] }> {
    let totalCreated = 0, totalSkipped = 0;
    for (const packId of packIds) {
      const result = await this.applyRulePack(orgId, packId, options);
      totalCreated += result.created;
      totalSkipped += result.skipped;
    }
    return { created: totalCreated, skipped: totalSkipped, packs: packIds };
  }

  /** Get available rule packs */
  static getRulePacks(): Record<string, { label: string; description: string; ruleCount: number; categories: string[] }> {
    const result: Record<string, any> = {};
    for (const [id, pack] of Object.entries(DLP_RULE_PACKS)) {
      const cats = [...new Set(pack.rules.map(r => r.category))];
      result[id] = { label: pack.label, description: pack.description, ruleCount: pack.rules.length, categories: cats };
    }
    return result;
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

  scanParameters(optsOrOrgId: string | { orgId: string; agentId: string; toolId: string; parameters?: Record<string, any> }, agentId?: string, toolId?: string, params?: Record<string, any>): DLPScanResult {
    if (typeof optsOrOrgId === 'object') {
      const o = optsOrOrgId;
      return this.scanParameters(o.orgId, o.agentId, o.toolId, o.parameters || {});
    }
    const orgId = optsOrOrgId;
    const rules = this.getApplicableRules(orgId, 'parameters');
    return this.scan(orgId, agentId!, toolId!, params || {}, rules, 'outbound');
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
