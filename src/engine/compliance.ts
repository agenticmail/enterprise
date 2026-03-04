/**
 * Compliance Reporting Engine — Enterprise SOC 2 Grade
 *
 * Generates comprehensive compliance reports mapping to SOC 2 Trust Service Criteria:
 *   CC1: Control Environment (org structure, policies, agent governance)
 *   CC2: Communication & Information (logging, monitoring, audit trails)
 *   CC3: Risk Assessment (DLP, anomaly detection, threat analysis)
 *   CC4: Monitoring Activities (interventions, guardrails, real-time controls)
 *   CC5: Control Activities (approvals, permissions, tool restrictions)
 *   CC6: Logical & Physical Access (auth, SSO, vault, session management)
 *   CC7: System Operations (uptime, task pipeline, agent health, incidents)
 *   CC8: Change Management (config changes, deployments, journal rollbacks)
 *   CC9: Risk Mitigation (escalations, budget controls, compliance posture)
 *
 * Also: GDPR data export (Art. 15 DSAR), SOX-ready audit trails, full CSV/JSON export.
 */

import type { EngineDatabase } from './db-adapter.js';

function sj(v: string|null|undefined, fb: any = {}): any { if(!v) return fb; try { return JSON.parse(v); } catch { return fb; } }

// ─── Types ──────────────────────────────────────────────

export interface ComplianceReport {
  id: string;
  orgId: string;
  type: 'soc2' | 'gdpr' | 'audit' | 'incident' | 'access-review';
  title: string;
  parameters: Record<string, any>;
  status: 'generating' | 'completed' | 'failed';
  data?: Record<string, any>;
  format: 'json' | 'csv';
  generatedBy: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface DateRange { from: string; to: string; }
type Rows = any[];

// ─── Compliance Reporter ────────────────────────────────

export class ComplianceReporter {
  private reports: ComplianceReport[] = [];
  private engineDb?: EngineDatabase;

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>(
        'SELECT * FROM compliance_reports ORDER BY created_at DESC LIMIT 200'
      );
      this.reports = rows.map((r: any) => ({
        id: r.id, orgId: r.org_id, type: r.type, title: r.title,
        parameters: r.parameters ? sj(r.parameters) : {},
        status: r.status, data: r.data ? sj(r.data) : undefined,
        format: r.format || 'json', generatedBy: r.generated_by,
        error: r.error, createdAt: r.created_at, completedAt: r.completed_at,
      }));
    } catch { /* table may not exist yet */ }
  }

  // ─── Helper: safe query ───────────────────────────

  private async q(sql: string, params: any[]): Promise<Rows> {
    if (!this.engineDb) return [];
    try { return await this.engineDb.query<any>(sql, params); } catch { return []; }
  }

  private cnt(rows: Rows): number { return rows[0]?.cnt || rows[0]?.count || 0; }

  // ─── SOC 2 Report ─────────────────────────────────

  async generateSOC2(orgId: string, dateRange: DateRange, generatedBy: string, agentIds?: string[]): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'soc2', `SOC 2 Type II Report — ${dateRange.from} to ${dateRange.to}`, { dateRange, agentIds }, generatedBy);
    const { from, to } = dateRange;

    try {
      const data: Record<string, any> = {
        reportMetadata: {
          framework: 'SOC 2 Type II',
          trustServiceCriteria: ['Security', 'Availability', 'Processing Integrity', 'Confidentiality', 'Privacy'],
          reportingPeriod: dateRange,
          generatedAt: new Date().toISOString(),
          generatedBy,
          orgId,
          agentScope: agentIds?.length ? agentIds : 'all',
        }
      };

      // ═══════════════════════════════════════════════
      // CC1: CONTROL ENVIRONMENT
      // ═══════════════════════════════════════════════

      const agents = await this.q('SELECT * FROM managed_agents WHERE org_id = ?', [orgId]);
      const policies = await this.q('SELECT * FROM org_policies WHERE org_id = ?', [orgId]);
      const permProfiles = await this.q('SELECT * FROM permission_profiles WHERE org_id = ?', [orgId]);
      const guardrailRules = await this.q('SELECT * FROM guardrail_rules WHERE org_id = ?', [orgId]);
      const dlpRules = await this.q('SELECT * FROM dlp_rules WHERE org_id = ?', [orgId]);
      const escalationChains = await this.q('SELECT * FROM escalation_chains WHERE org_id = ?', [orgId]);
      const org = await this.q('SELECT * FROM organizations WHERE id = ?', [orgId]);
      const orgName = org[0]?.name || orgId;
      data.reportMetadata.organization = orgName;
      data._orgName = orgName;

      data.cc1_controlEnvironment = {
        title: 'CC1: Control Environment',
        description: 'Organization structure, governance policies, and agent management framework.',
        organization: org[0] ? { id: org[0].id, name: org[0].name, createdAt: org[0].created_at, settings: sj(org[0].settings) } : null,
        agentInventory: {
          totalAgents: agents.length,
          agents: agents.map((a: any) => ({
            id: a.id, name: sj(a.config)?.displayName || sj(a.config)?.name || a.id,
            status: a.status, role: sj(a.config)?.identity?.role || 'agent',
            model: sj(a.config)?.model, createdAt: a.created_at,
            hasPermissionProfile: !!sj(a.config)?.permissionProfile,
            permissionProfile: sj(a.config)?.permissionProfile || 'default',
            hasBudgetConfig: !!a.budget_config,
            budgetConfig: a.budget_config ? sj(a.budget_config) : null,
          })),
        },
        governancePolicies: {
          totalPolicies: policies.length,
          policies: policies.map((p: any) => ({
            id: p.id, name: p.name, category: p.category, enforcement: p.enforcement,
            enabled: !!p.enabled, priority: p.priority, createdAt: p.created_at,
            description: p.description,
          })),
          byCategory: this.groupCount(policies, 'category'),
          byEnforcement: this.groupCount(policies, 'enforcement'),
        },
        permissionProfiles: {
          totalProfiles: permProfiles.length,
          profiles: permProfiles.map((p: any) => ({
            id: p.id, name: p.name, preset: p.preset, description: p.description,
            createdAt: p.created_at,
          })),
        },
        escalationChains: {
          total: escalationChains.length,
          chains: escalationChains.map((c: any) => ({
            id: c.id, name: c.name, enabled: !!c.enabled,
            steps: sj(c.steps, []).length,
          })),
        },
      };

      // Build agent name map for display resolution
      const agentNameMap: Record<string, string> = {};
      for (const a of agents) {
        const cfg = sj(a.config);
        agentNameMap[a.id] = cfg?.displayName || cfg?.name || a.id;
      }
      data._agentNameMap = agentNameMap;

      // Resolve generatedBy to user name
      try {
        const users = await this.q('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [generatedBy]);
        if (users[0]) {
          data._generatedByName = users[0].name || users[0].email || generatedBy;
        }
      } catch {}

      // Also count approval policies with escalation/notification as escalation mechanisms
      const approvalPoliciesWithNotify = await this.q(
        "SELECT * FROM approval_policies WHERE org_id = ? AND notify IS NOT NULL AND notify::text != '{}'", [orgId]);
      data._escalationViaApprovalPolicies = approvalPoliciesWithNotify.length;

      // ═══════════════════════════════════════════════
      // CC2: COMMUNICATION & INFORMATION
      // ═══════════════════════════════════════════════

      const totalToolCalls = this.cnt(await this.q(
        'SELECT COUNT(*) as cnt FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ?', [orgId, from, to]));
      const toolCallsByAgent = await this.q(
        'SELECT agent_id, COUNT(*) as cnt FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id', [orgId, from, to]);
      const toolCallsByTool = await this.q(
        'SELECT tool_id, tool_name, COUNT(*) as cnt, SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failures FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY tool_id, tool_name ORDER BY cnt DESC LIMIT 50', [orgId, from, to]);
      const toolCallsByDay = await this.q(
        "SELECT DATE(created_at) as day, COUNT(*) as cnt FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY day", [orgId, from, to]);

      const totalEvents = this.cnt(await this.q(
        'SELECT COUNT(*) as cnt FROM activity_events WHERE org_id = ? AND created_at BETWEEN ? AND ?', [orgId, from, to]));
      const eventsByType = await this.q(
        'SELECT type, COUNT(*) as cnt FROM activity_events WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY type ORDER BY cnt DESC', [orgId, from, to]);

      const totalMessages = this.cnt(await this.q(
        'SELECT COUNT(*) as cnt FROM agent_messages WHERE org_id = ? AND created_at BETWEEN ? AND ?', [orgId, from, to]));
      const messagesByAgent = await this.q(
        'SELECT from_agent_id as agent_id, COUNT(*) as cnt FROM agent_messages WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY from_agent_id', [orgId, from, to]);

      data.cc2_communicationInformation = {
        title: 'CC2: Communication & Information',
        description: 'Audit trail completeness, logging coverage, and information flow monitoring.',
        auditTrail: {
          toolCalls: {
            totalExecutions: totalToolCalls,
            byAgent: this.rowsToMap(toolCallsByAgent, 'agent_id', 'cnt'),
            topTools: toolCallsByTool.map((r: any) => ({ toolId: r.tool_id, toolName: r.tool_name, executions: r.cnt, failures: r.failures || 0 })),
            dailyVolume: toolCallsByDay.map((r: any) => ({ date: r.day, count: r.cnt })),
          },
          activityEvents: {
            totalEvents,
            byType: this.rowsToMap(eventsByType, 'type', 'cnt'),
          },
          agentCommunications: {
            totalMessages,
            byAgent: this.rowsToMap(messagesByAgent, 'agent_id', 'cnt'),
          },
        },
        loggingCoverage: {
          toolCallLogging: 'ENABLED — All tool executions logged with parameters, results, timing',
          activityEventLogging: 'ENABLED — All agent lifecycle events captured',
          interventionLogging: 'ENABLED — All guardrail interventions recorded',
          dlpScanning: `ENABLED — ${dlpRules.length} active DLP rules`,
          journalTracking: 'ENABLED — Reversible action journal with rollback support',
        },
      };

      // ═══════════════════════════════════════════════
      // CC3: RISK ASSESSMENT
      // ═══════════════════════════════════════════════

      const dlpViolations = await this.q(
        'SELECT * FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const dlpByAction = await this.q(
        'SELECT action_taken, COUNT(*) as cnt FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY action_taken', [orgId, from, to]);
      const dlpByAgent = await this.q(
        'SELECT agent_id, COUNT(*) as cnt FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id ORDER BY cnt DESC', [orgId, from, to]);
      const dlpByRule = await this.q(
        'SELECT rule_id, COUNT(*) as cnt FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY rule_id ORDER BY cnt DESC', [orgId, from, to]);

      const securityEvents = await this.q(
        'SELECT * FROM security_events WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);

      data.cc3_riskAssessment = {
        title: 'CC3: Risk Assessment',
        description: 'Data loss prevention, threat detection, and risk scoring.',
        dlpControls: {
          activeRules: dlpRules.length,
          rulesByAction: this.groupCount(dlpRules, 'action'),
          rulesBySeverity: this.groupCount(dlpRules, 'severity'),
          rules: dlpRules.map((r: any) => ({
            id: r.id, name: r.name, patternType: r.pattern_type, action: r.action,
            severity: r.severity, enabled: !!r.enabled, appliesTo: r.applies_to,
          })),
        },
        dlpViolations: {
          totalViolations: dlpViolations.length,
          byAction: this.rowsToMap(dlpByAction, 'action_taken', 'cnt'),
          byAgent: this.rowsToMap(dlpByAgent, 'agent_id', 'cnt'),
          byRule: this.rowsToMap(dlpByRule, 'rule_id', 'cnt'),
          recentViolations: dlpViolations.slice(0, 50).map((v: any) => ({
            id: v.id, agentId: v.agent_id, ruleId: v.rule_id, toolId: v.tool_id,
            actionTaken: v.action_taken, direction: v.direction,
            matchContext: v.match_context, timestamp: v.created_at,
          })),
        },
        securityEvents: {
          total: securityEvents.length,
          events: securityEvents.map((e: any) => ({
            id: e.id, type: e.type, severity: e.severity, agentId: e.agent_id,
            description: e.description, timestamp: e.created_at,
          })),
        },
        riskScore: this.calculateRiskScore(dlpViolations, securityEvents, guardrailRules, dlpRules),
      };

      // ═══════════════════════════════════════════════
      // CC4: MONITORING ACTIVITIES
      // ═══════════════════════════════════════════════

      const interventions = await this.q(
        'SELECT * FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const interventionsByType = await this.q(
        'SELECT type, COUNT(*) as cnt FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY type', [orgId, from, to]);
      const interventionsByAgent = await this.q(
        'SELECT agent_id, COUNT(*) as cnt FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id ORDER BY cnt DESC', [orgId, from, to]);

      data.cc4_monitoringActivities = {
        title: 'CC4: Monitoring Activities',
        description: 'Guardrail interventions, real-time monitoring, and anomaly detection.',
        guardrailRules: {
          totalRules: guardrailRules.length,
          rules: guardrailRules.map((r: any) => ({
            id: r.id, name: r.name, type: r.type, action: r.action,
            enabled: !!r.enabled, severity: r.severity, createdAt: r.created_at,
          })),
        },
        interventions: {
          totalInterventions: interventions.length,
          byType: this.rowsToMap(interventionsByType, 'type', 'cnt'),
          byAgent: this.rowsToMap(interventionsByAgent, 'agent_id', 'cnt'),
          recentInterventions: interventions.slice(0, 100).map((i: any) => ({
            id: i.id, agentId: i.agent_id, type: i.type, reason: i.reason,
            action: i.action, ruleId: i.rule_id, toolId: i.tool_id,
            timestamp: i.created_at,
          })),
        },
      };

      // ═══════════════════════════════════════════════
      // CC5: CONTROL ACTIVITIES
      // ═══════════════════════════════════════════════

      const approvals = await this.q(
        'SELECT * FROM approval_requests WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const approvalsByStatus = await this.q(
        'SELECT status, COUNT(*) as cnt FROM approval_requests WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY status', [orgId, from, to]);
      const approvalsByAgent = await this.q(
        'SELECT agent_id, COUNT(*) as cnt FROM approval_requests WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id', [orgId, from, to]);
      const approvalPolicies = await this.q('SELECT * FROM approval_policies WHERE org_id = ?', [orgId]);

      const escalations = await this.q(
        'SELECT * FROM agent_escalations WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);

      data.cc5_controlActivities = {
        title: 'CC5: Control Activities',
        description: 'Approval workflows, permission enforcement, and operational controls.',
        approvalWorkflows: {
          totalRequests: approvals.length,
          byStatus: this.rowsToMap(approvalsByStatus, 'status', 'cnt'),
          byAgent: this.rowsToMap(approvalsByAgent, 'agent_id', 'cnt'),
          policies: approvalPolicies.map((p: any) => ({
            id: p.id, name: p.name, toolPattern: p.tool_pattern,
            requireApproval: !!p.require_approval, autoApprove: !!p.auto_approve,
          })),
          recentRequests: approvals.slice(0, 50).map((a: any) => ({
            id: a.id, agentId: a.agent_id, toolId: a.tool_id, status: a.status,
            requestedAt: a.created_at, resolvedAt: a.resolved_at,
            resolvedBy: a.resolved_by, reason: a.reason,
          })),
          approvalRate: approvals.length > 0 ? ((approvals.filter((a: any) => a.status === 'approved').length / approvals.length) * 100).toFixed(1) + '%' : 'N/A',
          avgResponseTime: this.calcAvgResponseTime(approvals),
        },
        escalations: {
          total: escalations.length,
          escalations: escalations.slice(0, 50).map((e: any) => ({
            id: e.id, agentId: e.agent_id, type: e.type, priority: e.priority,
            status: e.status, reason: e.reason, timestamp: e.created_at,
          })),
        },
        permissionEnforcement: {
          profiles: permProfiles.length,
          summary: 'All agent tool access governed by permission profiles with allow/deny/approval controls.',
        },
      };

      // ═══════════════════════════════════════════════
      // CC6: LOGICAL & PHYSICAL ACCESS
      // ═══════════════════════════════════════════════

      const vaultAudit = await this.q(
        'SELECT * FROM vault_audit_log WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const vaultByAction = await this.q(
        'SELECT action, COUNT(*) as cnt FROM vault_audit_log WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY action', [orgId, from, to]);
      const vaultEntries = await this.q(
        'SELECT id, key, agent_id, created_at, updated_at, expires_at FROM vault_entries WHERE org_id = ?', [orgId]);

      const ssoIntegrations = await this.q('SELECT * FROM sso_integrations WHERE org_id = ?', [orgId]);

      const sessions = await this.q(
        'SELECT agent_id, COUNT(*) as cnt, MAX(created_at) as last_session FROM agent_sessions WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id', [orgId, from, to]);

      data.cc6_logicalAccess = {
        title: 'CC6: Logical & Physical Access Controls',
        description: 'Authentication, secrets management, session tracking, and SSO controls.',
        vaultManagement: {
          totalSecrets: vaultEntries.length,
          secrets: vaultEntries.map((v: any) => ({
            id: v.id, key: v.key, agentId: v.agent_id,
            createdAt: v.created_at, updatedAt: v.updated_at,
            expiresAt: v.expires_at, expired: v.expires_at ? new Date(v.expires_at) < new Date() : false,
          })),
          auditLog: {
            totalAccesses: vaultAudit.length,
            byAction: this.rowsToMap(vaultByAction, 'action', 'cnt'),
            recentAccesses: vaultAudit.slice(0, 50).map((v: any) => ({
              id: v.id, action: v.action, key: v.key, agentId: v.agent_id,
              timestamp: v.created_at, ip: v.ip_address,
            })),
          },
        },
        ssoIntegrations: {
          total: ssoIntegrations.length,
          integrations: ssoIntegrations.map((s: any) => ({
            id: s.id, provider: s.provider, enabled: !!s.enabled,
            createdAt: s.created_at,
          })),
        },
        sessionManagement: {
          agentSessions: sessions.map((s: any) => ({
            agentId: s.agent_id, sessionCount: s.cnt, lastSession: s.last_session,
          })),
        },
      };

      // ═══════════════════════════════════════════════
      // CC7: SYSTEM OPERATIONS
      // ═══════════════════════════════════════════════

      const taskPipeline = await this.q(
        'SELECT status, COUNT(*) as cnt FROM task_pipeline WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY status', [orgId, from, to]);
      const taskQueue = await this.q(
        'SELECT status, COUNT(*) as cnt FROM task_queue WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY status', [orgId, from, to]);

      const clockRecords = await this.q(
        'SELECT * FROM clock_records WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const workSchedules = await this.q('SELECT * FROM work_schedules WHERE org_id = ?', [orgId]);

      const conversations = await this.q(
        'SELECT agent_id, COUNT(*) as cnt, SUM(CASE WHEN status = \'completed\' THEN 1 ELSE 0 END) as completed FROM conversations WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id', [orgId, from, to]);

      data.cc7_systemOperations = {
        title: 'CC7: System Operations',
        description: 'Agent availability, task processing, workforce management, and operational health.',
        taskPipeline: {
          byStatus: this.rowsToMap(taskPipeline, 'status', 'cnt'),
        },
        taskQueue: {
          byStatus: this.rowsToMap(taskQueue, 'status', 'cnt'),
        },
        workforceManagement: {
          schedules: workSchedules.map((w: any) => ({
            id: w.id, agentId: w.agent_id, schedule: sj(w.schedule),
            timezone: w.timezone, enabled: !!w.enabled,
          })),
          clockRecords: {
            total: clockRecords.length,
            records: clockRecords.slice(0, 100).map((r: any) => ({
              agentId: r.agent_id, type: r.type, timestamp: r.created_at,
              source: r.source, duration: r.duration_minutes,
            })),
          },
        },
        conversationMetrics: {
          byAgent: conversations.map((c: any) => ({
            agentId: c.agent_id, total: c.cnt, completed: c.completed,
            completionRate: c.cnt > 0 ? ((c.completed / c.cnt) * 100).toFixed(1) + '%' : 'N/A',
          })),
        },
      };

      // ═══════════════════════════════════════════════
      // CC8: CHANGE MANAGEMENT
      // ═══════════════════════════════════════════════

      const journalActions = await this.q(
        'SELECT * FROM action_journal WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const journalByType = await this.q(
        'SELECT action_type, COUNT(*) as cnt, SUM(CASE WHEN reversed = true OR reversed = 1 THEN 1 ELSE 0 END) as reversed_cnt FROM action_journal WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY action_type', [orgId, from, to]);
      const journalByAgent = await this.q(
        'SELECT agent_id, COUNT(*) as cnt FROM action_journal WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY agent_id', [orgId, from, to]);

      const stateHistory = await this.q(
        'SELECT * FROM agent_state_history WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 200', [orgId, from, to]);

      data.cc8_changeManagement = {
        title: 'CC8: Change Management',
        description: 'Configuration changes, action journal with rollback tracking, and deployment history.',
        actionJournal: {
          totalActions: journalActions.length,
          byType: journalByType.map((r: any) => ({
            actionType: r.action_type, total: r.cnt, reversed: r.reversed_cnt || 0,
            rollbackRate: r.cnt > 0 ? (((r.reversed_cnt || 0) / r.cnt) * 100).toFixed(1) + '%' : '0%',
          })),
          byAgent: this.rowsToMap(journalByAgent, 'agent_id', 'cnt'),
          recentActions: journalActions.slice(0, 100).map((j: any) => ({
            id: j.id, agentId: j.agent_id, toolName: j.tool_name || j.tool_id,
            actionType: j.action_type, reversible: !!j.reversible,
            reversed: !!j.reversed, reversedAt: j.reversed_at, reversedBy: j.reversed_by,
            sessionId: j.session_id, timestamp: j.created_at,
          })),
          totalReversed: journalActions.filter((j: any) => j.reversed).length,
          reversalRate: journalActions.length > 0
            ? ((journalActions.filter((j: any) => j.reversed).length / journalActions.length) * 100).toFixed(1) + '%' : '0%',
        },
        configurationChanges: {
          totalStateChanges: stateHistory.length,
          recentChanges: stateHistory.slice(0, 50).map((s: any) => ({
            agentId: s.agent_id, fromState: s.from_state, toState: s.to_state,
            changedBy: s.changed_by, reason: s.reason, timestamp: s.created_at,
          })),
        },
      };

      // ═══════════════════════════════════════════════
      // CC9: RISK MITIGATION
      // ═══════════════════════════════════════════════

      const budgetAlerts = await this.q(
        'SELECT * FROM budget_alerts WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      const budgetByType = await this.q(
        'SELECT alert_type, COUNT(*) as cnt FROM budget_alerts WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY alert_type', [orgId, from, to]);

      data.cc9_riskMitigation = {
        title: 'CC9: Risk Mitigation',
        description: 'Budget controls, cost management, and financial risk mitigation.',
        budgetControls: {
          totalAlerts: budgetAlerts.length,
          byType: this.rowsToMap(budgetByType, 'alert_type', 'cnt'),
          recentAlerts: budgetAlerts.slice(0, 50).map((b: any) => ({
            id: b.id, agentId: b.agent_id, alertType: b.alert_type,
            threshold: b.threshold, currentValue: b.current_value,
            message: b.message, timestamp: b.created_at,
          })),
        },
      };

      // ═══════════════════════════════════════════════
      // EXECUTIVE SUMMARY
      // ═══════════════════════════════════════════════

      data.executiveSummary = {
        title: 'Executive Summary',
        reportingPeriod: dateRange,
        overallRiskScore: data.cc3_riskAssessment.riskScore,
        keyMetrics: {
          totalAgents: agents.length,
          totalToolExecutions: totalToolCalls,
          totalInterventions: interventions.length,
          totalDLPViolations: dlpViolations.length,
          totalApprovalRequests: approvals.length,
          approvalRate: data.cc5_controlActivities.approvalWorkflows.approvalRate,
          totalJournalActions: journalActions.length,
          journalReversalRate: data.cc8_changeManagement.actionJournal.reversalRate,
          totalBudgetAlerts: budgetAlerts.length,
          activeDLPRules: dlpRules.filter((r: any) => r.enabled).length,
          activeGuardrailRules: guardrailRules.filter((r: any) => r.enabled).length,
          activePolicies: policies.filter((p: any) => p.enabled).length,
        },
        controlEffectiveness: {
          dlpBlockRate: dlpViolations.length > 0 ? ((dlpViolations.filter((v: any) => v.action_taken === 'blocked').length / dlpViolations.length) * 100).toFixed(1) + '%' : 'N/A',
          guardrailCoverage: `${guardrailRules.length} rules active`,
          permissionCoverage: `${permProfiles.length} profiles configured`,
          vaultSecrets: `${vaultEntries.length} secrets managed`,
        },
        findings: this.generateFindings(data),
      };

      report.data = data;
      report.status = 'completed';
      report.completedAt = new Date().toISOString();
    } catch (err: any) {
      report.status = 'failed';
      report.error = err.message;
    }

    this.persistReport(report);
    return report;
  }

  // ─── GDPR Report (Art. 15 DSAR) ──────────────────

  async generateGDPR(orgId: string, agentId: string, generatedBy: string): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'gdpr', `GDPR Data Subject Access Report — Agent ${agentId}`, { agentId }, generatedBy);

    try {
      const data: Record<string, any> = {
        reportMetadata: {
          framework: 'GDPR Article 15 — Right of Access',
          dataSubject: agentId,
          generatedAt: new Date().toISOString(),
          generatedBy,
          orgId,
          organization: await this.resolveOrgName(orgId),
        },
        _orgName: await this.resolveOrgName(orgId),
      };

      if (this.engineDb) {
        // Agent config (data controller records)
        const agent = await this.q('SELECT * FROM managed_agents WHERE id = ? AND org_id = ?', [agentId, orgId]);
        data.agentProfile = agent[0] ? { id: agent[0].id, config: sj(agent[0].config), status: agent[0].status, createdAt: agent[0].created_at } : null;

        // All tool calls (processing records)
        data.toolCalls = await this.q('SELECT * FROM tool_calls WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);
        data.toolCallCount = data.toolCalls.length;

        // Activity events
        data.activityEvents = await this.q('SELECT * FROM activity_events WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Conversations
        data.conversations = await this.q('SELECT * FROM conversations WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Messages sent/received
        data.messages = await this.q('SELECT * FROM agent_messages WHERE org_id = ? AND (from_agent_id = ? OR to_agent_id = ?) ORDER BY created_at DESC', [orgId, agentId, agentId]);

        // Journal entries (actions taken)
        data.journalEntries = await this.q('SELECT * FROM action_journal WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Interventions (restrictions applied)
        data.interventions = await this.q('SELECT * FROM interventions WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Approval requests
        data.approvalRequests = await this.q('SELECT * FROM approval_requests WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // DLP violations
        data.dlpViolations = await this.q('SELECT * FROM dlp_violations WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Memory (stored knowledge)
        data.memories = await this.q('SELECT * FROM agent_memory WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Sessions
        data.sessions = await this.q('SELECT * FROM agent_sessions WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 200', [orgId, agentId]);

        // Vault accesses
        data.vaultAccesses = await this.q('SELECT * FROM vault_audit_log WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Escalations
        data.escalations = await this.q('SELECT * FROM agent_escalations WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        // Budget alerts
        data.budgetAlerts = await this.q('SELECT * FROM budget_alerts WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC', [orgId, agentId]);

        data.dataSummary = {
          toolCalls: data.toolCalls.length,
          activityEvents: data.activityEvents.length,
          conversations: data.conversations.length,
          messages: data.messages.length,
          journalEntries: data.journalEntries.length,
          interventions: data.interventions.length,
          approvalRequests: data.approvalRequests.length,
          dlpViolations: data.dlpViolations.length,
          memories: data.memories.length,
          sessions: data.sessions.length,
          vaultAccesses: data.vaultAccesses.length,
          escalations: data.escalations.length,
          budgetAlerts: data.budgetAlerts.length,
        };
      }

      report.data = data;
      report.status = 'completed';
      report.completedAt = new Date().toISOString();
    } catch (err: any) {
      report.status = 'failed';
      report.error = err.message;
    }

    this.persistReport(report);
    return report;
  }

  // ─── Audit Report ─────────────────────────────────

  async generateAudit(orgId: string, dateRange: DateRange, generatedBy: string, agentIds?: string[]): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'audit', `Comprehensive Audit Trail — ${dateRange.from} to ${dateRange.to}`, { dateRange, agentIds }, generatedBy);
    const { from, to } = dateRange;

    try {
      const data: Record<string, any> = {
        reportMetadata: { framework: 'SOX-Ready Audit Trail', reportingPeriod: dateRange, generatedAt: new Date().toISOString(), generatedBy, orgId },
        _orgName: await this.resolveOrgName(orgId),
      };
      data.reportMetadata.organization = data._orgName;

      // Build unified timeline from ALL auditable tables
      const timeline: any[] = [];

      const tools = await this.q('SELECT * FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const t of tools) {
        if (agentIds?.length && !agentIds.includes(t.agent_id)) continue;
        timeline.push({ timestamp: t.created_at, source: 'tool_call', category: 'execution', agentId: t.agent_id, detail: `Tool: ${t.tool_name || t.tool_id}`, success: t.success !== false, data: { toolId: t.tool_id, toolName: t.tool_name, parameters: sj(t.parameters), sessionId: t.session_id } });
      }

      const ints = await this.q('SELECT * FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const i of ints) {
        if (agentIds?.length && !agentIds.includes(i.agent_id)) continue;
        timeline.push({ timestamp: i.created_at, source: 'intervention', category: 'control', agentId: i.agent_id, detail: i.reason, data: { type: i.type, action: i.action, ruleId: i.rule_id, toolId: i.tool_id } });
      }

      const dlps = await this.q('SELECT * FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const d of dlps) {
        if (agentIds?.length && !agentIds.includes(d.agent_id)) continue;
        timeline.push({ timestamp: d.created_at, source: 'dlp_violation', category: 'security', agentId: d.agent_id, detail: `DLP ${d.action_taken}: Rule ${d.rule_id}`, data: { ruleId: d.rule_id, actionTaken: d.action_taken, direction: d.direction, matchContext: d.match_context } });
      }

      const approvals = await this.q('SELECT * FROM approval_requests WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const a of approvals) {
        if (agentIds?.length && !agentIds.includes(a.agent_id)) continue;
        timeline.push({ timestamp: a.created_at, source: 'approval_request', category: 'control', agentId: a.agent_id, detail: `Approval ${a.status}: ${a.tool_id}`, data: { status: a.status, toolId: a.tool_id, resolvedBy: a.resolved_by, resolvedAt: a.resolved_at } });
      }

      const journal = await this.q('SELECT * FROM action_journal WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const j of journal) {
        if (agentIds?.length && !agentIds.includes(j.agent_id)) continue;
        timeline.push({ timestamp: j.created_at, source: 'journal_action', category: 'change', agentId: j.agent_id, detail: `${j.action_type}: ${j.tool_name || j.tool_id}${j.reversed ? ' [REVERSED]' : ''}`, data: { actionType: j.action_type, toolId: j.tool_id, reversible: !!j.reversible, reversed: !!j.reversed, reversedAt: j.reversed_at, reversedBy: j.reversed_by } });
      }

      const budgets = await this.q('SELECT * FROM budget_alerts WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const b of budgets) {
        if (agentIds?.length && !agentIds.includes(b.agent_id)) continue;
        timeline.push({ timestamp: b.created_at, source: 'budget_alert', category: 'financial', agentId: b.agent_id, detail: `${b.alert_type}: ${b.message}`, data: { alertType: b.alert_type, threshold: b.threshold, currentValue: b.current_value } });
      }

      const vaultLogs = await this.q('SELECT * FROM vault_audit_log WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at', [orgId, from, to]);
      for (const v of vaultLogs) {
        timeline.push({ timestamp: v.created_at, source: 'vault_access', category: 'access', agentId: v.agent_id, detail: `Vault ${v.action}: ${v.key}`, data: { action: v.action, key: v.key } });
      }

      timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      data.timeline = timeline;

      // Summary statistics
      data.summary = {
        totalEvents: timeline.length,
        bySource: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
        byAgent: {} as Record<string, number>,
        byDay: {} as Record<string, number>,
      };
      for (const e of timeline) {
        data.summary.bySource[e.source] = (data.summary.bySource[e.source] || 0) + 1;
        data.summary.byCategory[e.category] = (data.summary.byCategory[e.category] || 0) + 1;
        data.summary.byAgent[e.agentId] = (data.summary.byAgent[e.agentId] || 0) + 1;
        const day = e.timestamp?.substring(0, 10);
        if (day) data.summary.byDay[day] = (data.summary.byDay[day] || 0) + 1;
      }

      report.data = data;
      report.status = 'completed';
      report.completedAt = new Date().toISOString();
    } catch (err: any) {
      report.status = 'failed';
      report.error = err.message;
    }

    this.persistReport(report);
    return report;
  }

  // ─── Incident Report ──────────────────────────────

  async generateIncident(orgId: string, dateRange: DateRange, generatedBy: string): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'incident', `Security Incident Report — ${dateRange.from} to ${dateRange.to}`, { dateRange }, generatedBy);
    const { from, to } = dateRange;

    try {
      const data: Record<string, any> = {
        reportMetadata: { framework: 'Incident Response Report', reportingPeriod: dateRange, generatedAt: new Date().toISOString(), generatedBy, orgId },
        _orgName: await this.resolveOrgName(orgId),
      };
      data.reportMetadata.organization = data._orgName;

      // All security-relevant events
      data.dlpViolations = await this.q('SELECT * FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      data.interventions = await this.q('SELECT * FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      data.securityEvents = await this.q('SELECT * FROM security_events WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      data.blockedApprovals = await this.q("SELECT * FROM approval_requests WHERE org_id = ? AND status = 'denied' AND created_at BETWEEN ? AND ? ORDER BY created_at DESC", [orgId, from, to]);
      data.escalations = await this.q('SELECT * FROM agent_escalations WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC', [orgId, from, to]);
      data.budgetBreaches = await this.q("SELECT * FROM budget_alerts WHERE org_id = ? AND alert_type IN ('budget_exceeded', 'rate_limit') AND created_at BETWEEN ? AND ? ORDER BY created_at DESC", [orgId, from, to]);
      data.reversedActions = await this.q("SELECT * FROM action_journal WHERE org_id = ? AND (reversed = true OR reversed = 1) AND created_at BETWEEN ? AND ? ORDER BY created_at DESC", [orgId, from, to]);

      data.incidentSummary = {
        totalIncidents: (data.dlpViolations?.length || 0) + (data.securityEvents?.length || 0) + (data.blockedApprovals?.length || 0),
        dlpViolations: data.dlpViolations?.length || 0,
        interventions: data.interventions?.length || 0,
        securityEvents: data.securityEvents?.length || 0,
        deniedApprovals: data.blockedApprovals?.length || 0,
        escalations: data.escalations?.length || 0,
        budgetBreaches: data.budgetBreaches?.length || 0,
        reversedActions: data.reversedActions?.length || 0,
      };

      report.data = data;
      report.status = 'completed';
      report.completedAt = new Date().toISOString();
    } catch (err: any) {
      report.status = 'failed';
      report.error = err.message;
    }

    this.persistReport(report);
    return report;
  }

  // ─── Access Review Report ─────────────────────────

  async generateAccessReview(orgId: string, generatedBy: string): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'access-review', `Access Review Report — ${new Date().toISOString().split('T')[0]}`, {}, generatedBy);

    try {
      const data: Record<string, any> = {
        reportMetadata: { framework: 'Periodic Access Review', generatedAt: new Date().toISOString(), generatedBy, orgId },
        _orgName: await this.resolveOrgName(orgId),
      };
      data.reportMetadata.organization = data._orgName;

      const agents = await this.q('SELECT * FROM managed_agents WHERE org_id = ?', [orgId]);
      const permProfiles = await this.q('SELECT * FROM permission_profiles WHERE org_id = ?', [orgId]);
      const vaultEntries = await this.q('SELECT id, key, agent_id, created_at, updated_at, expires_at FROM vault_entries WHERE org_id = ?', [orgId]);
      const approvalPolicies = await this.q('SELECT * FROM approval_policies WHERE org_id = ?', [orgId]);

      data.agentAccess = agents.map((a: any) => {
        const config = sj(a.config);
        const vaultSecrets = vaultEntries.filter((v: any) => v.agent_id === a.id);
        return {
          agentId: a.id,
          name: config?.displayName || config?.name || a.id,
          status: a.status,
          role: config?.identity?.role || 'agent',
          permissionProfile: config?.permissionProfile || 'default',
          model: config?.model,
          hasBudget: !!a.budget_config,
          vaultSecrets: vaultSecrets.length,
          expiredSecrets: vaultSecrets.filter((v: any) => v.expires_at && new Date(v.expires_at) < new Date()).length,
          channels: Object.keys(config?.messagingChannels || config?.channels || {}).length,
          tools: config?.deployment?.tools ? Object.keys(config.deployment.tools).length : 'default',
          createdAt: a.created_at,
          lastActivity: a.updated_at,
        };
      });

      data.permissionProfiles = permProfiles.map((p: any) => ({
        id: p.id, name: p.name, preset: p.preset, description: p.description,
        assignedAgents: agents.filter((a: any) => sj(a.config)?.permissionProfile === p.name).length,
      }));

      data.vaultReview = {
        totalSecrets: vaultEntries.length,
        expiredSecrets: vaultEntries.filter((v: any) => v.expires_at && new Date(v.expires_at) < new Date()).length,
        secretsWithoutExpiry: vaultEntries.filter((v: any) => !v.expires_at).length,
      };

      data.approvalPolicies = approvalPolicies.map((p: any) => ({
        id: p.id, name: p.name, toolPattern: p.tool_pattern,
        requireApproval: !!p.require_approval, autoApprove: !!p.auto_approve,
      }));

      data.recommendations = [];
      if (data.vaultReview.expiredSecrets > 0) data.recommendations.push({ severity: 'high', message: `${data.vaultReview.expiredSecrets} vault secrets have expired and should be rotated.` });
      if (data.vaultReview.secretsWithoutExpiry > 0) data.recommendations.push({ severity: 'medium', message: `${data.vaultReview.secretsWithoutExpiry} vault secrets have no expiration set.` });
      for (const a of data.agentAccess) {
        if (a.status !== 'active' && a.vaultSecrets > 0) data.recommendations.push({ severity: 'high', message: `Non-active agent "${a.name}" still has ${a.vaultSecrets} vault secrets.` });
        if (a.permissionProfile === 'default') data.recommendations.push({ severity: 'low', message: `Agent "${a.name}" uses default permission profile — consider assigning a specific profile.` });
      }

      report.data = data;
      report.status = 'completed';
      report.completedAt = new Date().toISOString();
    } catch (err: any) {
      report.status = 'failed';
      report.error = err.message;
    }

    this.persistReport(report);
    return report;
  }

  // ─── Query ────────────────────────────────────────

  getReports(opts?: { orgId?: string; type?: string; limit?: number }): ComplianceReport[] {
    let list = [...this.reports];
    if (opts?.orgId) list = list.filter(r => r.orgId === opts.orgId);
    if (opts?.type) list = list.filter(r => r.type === opts.type);
    return list.slice(0, opts?.limit || 50);
  }

  getReport(id: string): ComplianceReport | undefined {
    return this.reports.find(r => r.id === id);
  }

  deleteReport(id: string): boolean {
    const idx = this.reports.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.reports.splice(idx, 1);
    this.engineDb?.execute('DELETE FROM compliance_reports WHERE id = ?', [id]).catch(() => {});
    return true;
  }

  // ─── CSV Export (SOC 2 Grade) ─────────────────────

  toCSV(report: ComplianceReport): string {
    if (!report.data) return '';

    if (report.type === 'soc2') return this.soc2ToCSV(report.data);
    if (report.type === 'audit') return this.auditToCSV(report.data);
    if (report.type === 'gdpr') return this.gdprToCSV(report.data);
    if (report.type === 'incident') return this.incidentToCSV(report.data);
    if (report.type === 'access-review') return this.accessReviewToCSV(report.data);

    // Fallback: flatten
    const flat = this.flattenObject(report.data);
    return 'key,value\n' + Object.entries(flat).map(([k, v]) => `${k},"${String(v).replace(/"/g, '""')}"`).join('\n');
  }

  private soc2ToCSV(data: any): string {
    const sheets: string[] = [];

    // Sheet 1: Executive Summary
    sheets.push('=== EXECUTIVE SUMMARY ===');
    sheets.push('Metric,Value');
    const km = data.executiveSummary?.keyMetrics || {};
    for (const [k, v] of Object.entries(km)) sheets.push(`${k},"${v}"`);
    sheets.push('');

    // Sheet 2: Agent Inventory
    sheets.push('=== AGENT INVENTORY (CC1) ===');
    sheets.push('Agent ID,Name,Status,Role,Model,Permission Profile,Has Budget,Created At');
    for (const a of data.cc1_controlEnvironment?.agentInventory?.agents || []) {
      sheets.push(`${a.id},"${a.name}",${a.status},"${a.role}","${a.model || ''}","${a.permissionProfile}",${a.hasBudgetConfig},${a.createdAt}`);
    }
    sheets.push('');

    // Sheet 3: Policies
    sheets.push('=== GOVERNANCE POLICIES (CC1) ===');
    sheets.push('Policy ID,Name,Category,Enforcement,Enabled,Priority,Created At');
    for (const p of data.cc1_controlEnvironment?.governancePolicies?.policies || []) {
      sheets.push(`${p.id},"${p.name}",${p.category},${p.enforcement},${p.enabled},${p.priority},${p.createdAt}`);
    }
    sheets.push('');

    // Sheet 4: Tool Calls
    sheets.push('=== TOOL CALL VOLUME (CC2) ===');
    sheets.push('Date,Count');
    for (const d of data.cc2_communicationInformation?.auditTrail?.toolCalls?.dailyVolume || []) {
      sheets.push(`${d.date},${d.count}`);
    }
    sheets.push('');

    // Sheet 5: Top Tools
    sheets.push('=== TOP TOOLS BY USAGE (CC2) ===');
    sheets.push('Tool ID,Tool Name,Executions,Failures');
    for (const t of data.cc2_communicationInformation?.auditTrail?.toolCalls?.topTools || []) {
      sheets.push(`"${t.toolId}","${t.toolName || ''}",${t.executions},${t.failures}`);
    }
    sheets.push('');

    // Sheet 6: DLP Rules
    sheets.push('=== DLP RULES (CC3) ===');
    sheets.push('Rule ID,Name,Pattern Type,Action,Severity,Enabled,Applies To');
    for (const r of data.cc3_riskAssessment?.dlpControls?.rules || []) {
      sheets.push(`${r.id},"${r.name}",${r.patternType},${r.action},${r.severity},${r.enabled},${r.appliesTo}`);
    }
    sheets.push('');

    // Sheet 7: DLP Violations
    sheets.push('=== DLP VIOLATIONS (CC3) ===');
    sheets.push('Violation ID,Agent ID,Rule ID,Tool ID,Action Taken,Direction,Match Context,Timestamp');
    for (const v of data.cc3_riskAssessment?.dlpViolations?.recentViolations || []) {
      sheets.push(`${v.id},${v.agentId},${v.ruleId},"${v.toolId || ''}",${v.actionTaken},${v.direction},"${(v.matchContext || '').replace(/"/g, '""')}",${v.timestamp}`);
    }
    sheets.push('');

    // Sheet 8: Interventions
    sheets.push('=== GUARDRAIL INTERVENTIONS (CC4) ===');
    sheets.push('Intervention ID,Agent ID,Type,Reason,Action,Rule ID,Tool ID,Timestamp');
    for (const i of data.cc4_monitoringActivities?.interventions?.recentInterventions || []) {
      sheets.push(`${i.id},${i.agentId},"${i.type}","${(i.reason || '').replace(/"/g, '""')}","${i.action || ''}","${i.ruleId || ''}","${i.toolId || ''}",${i.timestamp}`);
    }
    sheets.push('');

    // Sheet 9: Approval Requests
    sheets.push('=== APPROVAL REQUESTS (CC5) ===');
    sheets.push('Request ID,Agent ID,Tool ID,Status,Requested At,Resolved At,Resolved By,Reason');
    for (const a of data.cc5_controlActivities?.approvalWorkflows?.recentRequests || []) {
      sheets.push(`${a.id},${a.agentId},"${a.toolId || ''}",${a.status},${a.requestedAt},${a.resolvedAt || ''},"${a.resolvedBy || ''}","${(a.reason || '').replace(/"/g, '""')}"`);
    }
    sheets.push('');

    // Sheet 10: Vault Audit
    sheets.push('=== VAULT ACCESS LOG (CC6) ===');
    sheets.push('ID,Action,Key,Agent ID,IP Address,Timestamp');
    for (const v of data.cc6_logicalAccess?.vaultManagement?.auditLog?.recentAccesses || []) {
      sheets.push(`${v.id},${v.action},"${v.key}",${v.agentId},"${v.ip || ''}",${v.timestamp}`);
    }
    sheets.push('');

    // Sheet 11: Action Journal
    sheets.push('=== ACTION JOURNAL (CC8) ===');
    sheets.push('Journal ID,Agent ID,Tool Name,Action Type,Reversible,Reversed,Reversed At,Reversed By,Session ID,Timestamp');
    for (const j of data.cc8_changeManagement?.actionJournal?.recentActions || []) {
      sheets.push(`${j.id},${j.agentId},"${j.toolName || ''}","${j.actionType}",${j.reversible},${j.reversed},${j.reversedAt || ''},${j.reversedBy || ''},${j.sessionId || ''},${j.timestamp}`);
    }
    sheets.push('');

    // Sheet 12: Budget Alerts
    sheets.push('=== BUDGET ALERTS (CC9) ===');
    sheets.push('ID,Agent ID,Alert Type,Threshold,Current Value,Message,Timestamp');
    for (const b of data.cc9_riskMitigation?.budgetControls?.recentAlerts || []) {
      sheets.push(`${b.id},${b.agentId},"${b.alertType}",${b.threshold || ''},${b.currentValue || ''},"${(b.message || '').replace(/"/g, '""')}",${b.timestamp}`);
    }
    sheets.push('');

    // Sheet 13: Risk Score & Findings
    sheets.push('=== RISK ASSESSMENT ===');
    sheets.push('Category,Score');
    const rs = data.cc3_riskAssessment?.riskScore || {};
    for (const [k, v] of Object.entries(rs)) sheets.push(`"${k}","${v}"`);
    sheets.push('');
    sheets.push('=== FINDINGS ===');
    sheets.push('Severity,Category,Finding');
    for (const f of data.executiveSummary?.findings || []) sheets.push(`${f.severity},"${f.category || ''}","${(f.message || '').replace(/"/g, '""')}"`);

    return sheets.join('\n');
  }

  private auditToCSV(data: any): string {
    const rows = data.timeline || [];
    const header = 'Timestamp,Source,Category,Agent ID,Detail,Success,Data';
    const lines = rows.map((r: any) =>
      `${r.timestamp},${r.source},${r.category},${r.agentId},"${(r.detail || '').replace(/"/g, '""')}",${r.success ?? ''},"${JSON.stringify(r.data || {}).replace(/"/g, '""')}"`
    );
    return header + '\n' + lines.join('\n');
  }

  private gdprToCSV(data: any): string {
    const sheets: string[] = [];
    sheets.push('=== GDPR DATA SUBJECT ACCESS REPORT ===');
    sheets.push('Data Category,Record Count');
    for (const [k, v] of Object.entries(data.dataSummary || {})) sheets.push(`${k},${v}`);
    sheets.push('');

    // Export each data category
    for (const key of ['toolCalls', 'activityEvents', 'journalEntries', 'interventions', 'approvalRequests', 'dlpViolations', 'memories']) {
      const items = data[key] || [];
      if (items.length === 0) continue;
      sheets.push(`=== ${key.toUpperCase()} ===`);
      if (items.length > 0) {
        const cols = Object.keys(items[0]).filter(k => typeof items[0][k] !== 'object');
        sheets.push(cols.join(','));
        for (const item of items) {
          sheets.push(cols.map(c => `"${String(item[c] ?? '').replace(/"/g, '""')}"`).join(','));
        }
      }
      sheets.push('');
    }
    return sheets.join('\n');
  }

  private incidentToCSV(data: any): string {
    const sheets: string[] = [];
    sheets.push('=== INCIDENT SUMMARY ===');
    sheets.push('Category,Count');
    for (const [k, v] of Object.entries(data.incidentSummary || {})) sheets.push(`${k},${v}`);
    sheets.push('');

    for (const key of ['dlpViolations', 'interventions', 'securityEvents', 'blockedApprovals', 'escalations', 'reversedActions']) {
      const items = data[key] || [];
      if (items.length === 0) continue;
      sheets.push(`=== ${key.toUpperCase()} ===`);
      const cols = Object.keys(items[0]).filter(k => typeof items[0][k] !== 'object');
      sheets.push(cols.join(','));
      for (const item of items) sheets.push(cols.map(c => `"${String(item[c] ?? '').replace(/"/g, '""')}"`).join(','));
      sheets.push('');
    }
    return sheets.join('\n');
  }

  private accessReviewToCSV(data: any): string {
    const sheets: string[] = [];
    sheets.push('=== AGENT ACCESS REVIEW ===');
    sheets.push('Agent ID,Name,Status,Role,Permission Profile,Model,Has Budget,Vault Secrets,Expired Secrets,Channels,Tools,Created At,Last Activity');
    for (const a of data.agentAccess || []) {
      sheets.push(`${a.agentId},"${a.name}",${a.status},"${a.role}","${a.permissionProfile}","${a.model || ''}",${a.hasBudget},${a.vaultSecrets},${a.expiredSecrets},${a.channels},${a.tools},${a.createdAt},${a.lastActivity || ''}`);
    }
    sheets.push('');

    sheets.push('=== VAULT REVIEW ===');
    sheets.push('Metric,Value');
    for (const [k, v] of Object.entries(data.vaultReview || {})) sheets.push(`${k},${v}`);
    sheets.push('');

    sheets.push('=== RECOMMENDATIONS ===');
    sheets.push('Severity,Recommendation');
    for (const r of data.recommendations || []) sheets.push(`${r.severity},"${r.message.replace(/"/g, '""')}"`);
    return sheets.join('\n');
  }

  // ─── HTML Export (Full Printable Report) ───────────

  toHTML(report: ComplianceReport): string {
    if (!report.data) return '<html><body><h1>No data</h1></body></html>';
    const d = report.data;
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const css = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #2c2410; background: #d0c5a0; padding: 40px; max-width: 1100px; margin: 0 auto; font-size: 13px; line-height: 1.6; }
      h1 { font-size: 24px; margin-bottom: 4px; color: #2c2410; }
      h2 { font-size: 18px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #b0a47a; color: #2c2410; page-break-after: avoid; }
      h3 { font-size: 14px; margin: 20px 0 8px; color: #4a3f28; }
      .subtitle { color: #7a6e50; font-size: 13px; margin-bottom: 24px; }
      .meta { display: flex; gap: 24px; margin-bottom: 24px; padding: 16px; background: #ddd3b2; border-radius: 8px; border: 1px solid #b0a47a; flex-wrap: wrap; }
      .meta-item { font-size: 12px; }
      .meta-item strong { display: block; color: #4a3f28; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
      .metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
      .metric { text-align: center; padding: 16px; background: #ddd3b2; border-radius: 8px; border: 1px solid #b0a47a; }
      .metric .value { font-size: 28px; font-weight: 700; color: #2c2410; }
      .metric .label { font-size: 11px; color: #7a6e50; margin-top: 4px; }
      .grade { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; font-size: 32px; font-weight: 800; color: #fff; }
      .grade-A { background: #22c55e; } .grade-B { background: #3b82f6; } .grade-C { background: #eab308; } .grade-D { background: #f97316; } .grade-F { background: #ef4444; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
      th { text-align: left; padding: 8px 12px; background: #c8bc94; border-bottom: 2px solid #b0a47a; font-weight: 600; color: #4a3f28; font-size: 11px; text-transform: uppercase; }
      td { padding: 8px 12px; border-bottom: 1px solid #c4b890; vertical-align: top; }
      tr:hover { background: #ddd3b2; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
      .badge-pass { background: #dcfce7; color: #166534; } .badge-high { background: #fef2f2; color: #991b1b; }
      .badge-medium { background: #fefce8; color: #854d0e; } .badge-low { background: #ddd3b2; color: #4a3f28; }
      .badge-info { background: #eff6ff; color: #1e40af; } .badge-critical { background: #fef2f2; color: #7f1d1d; }
      .finding { padding: 12px 16px; margin-bottom: 8px; border-radius: 8px; border-left: 4px solid; }
      .finding-pass { background: #f0fdf4; border-color: #22c55e; }
      .finding-high { background: #fef2f2; border-color: #ef4444; }
      .finding-medium { background: #fefce8; border-color: #eab308; }
      .finding-low { background: #ddd3b2; border-color: #7a6e50; }
      .finding-info { background: #eff6ff; border-color: #8B6914; }
      .finding .cat { font-size: 11px; color: #7a6e50; margin-bottom: 2px; }
      .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
      .kv dt { font-size: 11px; color: #7a6e50; } .kv dd { font-weight: 500; margin: 0; }
      code { background: #c8bc94; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
      .page-break { page-break-before: always; }
      @media print { body { padding: 20px; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
      .toc { margin: 16px 0 32px; padding: 16px; background: #ddd3b2; border-radius: 8px; }
      .toc a { color: #8B6914; text-decoration: none; } .toc a:hover { text-decoration: underline; }
      .toc li { margin: 4px 0; }
    `;

    const agentMap: Record<string, string> = d._agentNameMap || {};
    const resolveAgent = (id: any) => {
      if (!id || id === '-') return String(id ?? '-');
      const name = agentMap[id];
      if (name && name !== id) return `${name} (${String(id).slice(0, 8)})`;
      return String(id).slice(0, 12) + (String(id).length > 12 ? '...' : '');
    };
    const generatedByDisplay = d._generatedByName || report.generatedBy;

    const parts: string[] = [];
    parts.push(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title><style>${css}</style></head><body>`);

    // Header
    const orgDisplay = d._orgName || report.orgId || '';
    parts.push(`<h1>${esc(report.title)}</h1>`);
    parts.push(`<div class="subtitle">${esc(this.typeLabel(report.type))}${orgDisplay ? ' &bull; ' + esc(orgDisplay) : ''} &bull; Generated ${new Date(report.createdAt).toLocaleString()} &bull; by ${esc(generatedByDisplay)}</div>`);

    // Metadata
    const meta = d.reportMetadata || {};
    parts.push(`<div class="meta">`);
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === 'object') continue;
      parts.push(`<div class="meta-item"><strong>${esc(k)}</strong>${esc(v)}</div>`);
    }
    parts.push(`</div>`);

    if (report.type === 'soc2') {
      parts.push(this.soc2ToHTML(d, esc, resolveAgent));
    } else if (report.type === 'audit') {
      parts.push(this.auditToHTML(d, esc, resolveAgent));
    } else if (report.type === 'gdpr') {
      parts.push(this.gdprToHTML(d, esc, resolveAgent));
    } else if (report.type === 'incident') {
      parts.push(this.incidentToHTML(d, esc, resolveAgent));
    } else if (report.type === 'access-review') {
      parts.push(this.accessReviewToHTML(d, esc, resolveAgent));
    } else {
      parts.push(`<pre>${esc(JSON.stringify(d, null, 2))}</pre>`);
    }

    parts.push(`<div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #b0a47a; color: #7a6e50; font-size: 11px; text-align: center;">Generated by AgenticMail Enterprise Compliance Engine &bull; Report ID: ${esc(report.id)} &bull; ${new Date().toISOString()}</div>`);
    parts.push(`</body></html>`);
    return parts.join('\n');
  }

  private async resolveOrgName(orgId: string): Promise<string> {
    try {
      const org = await this.q('SELECT name FROM organizations WHERE id = ?', [orgId]);
      return org[0]?.name || orgId;
    } catch { return orgId; }
  }

  private typeLabel(type: string): string {
    return ({ soc2: 'SOC 2 Type II Report', gdpr: 'GDPR Data Subject Access Report (Article 15)', audit: 'SOX-Ready Audit Trail', incident: 'Security Incident Report', 'access-review': 'Periodic Access Review Report' } as any)[type] || type;
  }

  private htmlTable(rows: any[], columns: { key: string; label: string }[], esc: (s: any) => string, resolveAgent?: (id: any) => string): string {
    if (!rows?.length) return '<p style="color:#94a3b8">No records.</p>';
    const agentKeys = new Set(['agentId', 'agent_id', 'resolvedBy', 'changedBy', 'reversed_by', 'reversedBy']);
    let html = '<table><thead><tr>';
    for (const c of columns) html += `<th>${esc(c.label)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of rows.slice(0, 500)) {
      html += '<tr>';
      for (const c of columns) {
        let v = row[c.key];
        if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
        if (resolveAgent && agentKeys.has(c.key) && v && v !== '-') v = resolveAgent(v);
        html += `<td>${esc(v)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > 500) html += `<p style="color:#94a3b8;font-size:11px">${rows.length - 500} more rows not shown.</p>`;
    return html;
  }

  private htmlKV(obj: Record<string, any>, esc: (s: any) => string): string {
    const entries = Object.entries(obj || {});
    if (!entries.length) return '';
    let html = '<dl class="kv">';
    for (const [k, v] of entries) html += `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
    html += '</dl>';
    return html;
  }

  private htmlMetrics(obj: Record<string, any>, esc: (s: any) => string): string {
    let html = '<div class="metrics">';
    for (const [k, v] of Object.entries(obj || {})) {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      html += `<div class="metric"><div class="value">${esc(v)}</div><div class="label">${esc(label)}</div></div>`;
    }
    html += '</div>';
    return html;
  }

  private soc2ToHTML(d: any, esc: (s: any) => string, resolveAgent?: (id: any) => string): string {
    const p: string[] = [];
    const km = d.executiveSummary?.keyMetrics || {};
    const risk = d.cc3_riskAssessment?.riskScore || {};
    const findings = d.executiveSummary?.findings || [];

    // TOC
    p.push(`<div class="toc"><strong>Table of Contents</strong><ol>`);
    p.push(`<li><a href="#exec">Executive Summary</a></li>`);
    for (let i = 1; i <= 9; i++) p.push(`<li><a href="#cc${i}">CC${i}: ${this.ccTitle(i)}</a></li>`);
    p.push(`<li><a href="#findings">Findings & Recommendations</a></li>`);
    p.push(`</ol></div>`);

    // Executive Summary
    p.push(`<h2 id="exec">Executive Summary</h2>`);
    p.push(this.htmlMetrics(km, esc));
    p.push(`<div style="display:flex;align-items:center;gap:16px;margin:16px 0"><div class="grade grade-${risk.grade || 'F'}">${risk.grade || '-'}</div><div><strong>Risk Score: ${risk.score ?? '-'}/100</strong>`);
    for (const dd of risk.deductions || []) p.push(`<br><span style="font-size:12px;color:#64748b">-${dd.points} ${esc(dd.reason)}</span>`);
    p.push(`</div></div>`);

    // CC1-CC9
    const sections = [
      { key: 'cc1_controlEnvironment', tables: [
        { path: 'agentInventory.agents', label: 'Agent Inventory', cols: [{ key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }, { key: 'role', label: 'Role' }, { key: 'model', label: 'Model' }, { key: 'permissionProfile', label: 'Permission Profile' }, { key: 'hasBudgetConfig', label: 'Budget' }] },
        { path: 'governancePolicies.policies', label: 'Governance Policies', cols: [{ key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'enforcement', label: 'Enforcement' }, { key: 'enabled', label: 'Enabled' }] },
        { path: 'permissionProfiles.profiles', label: 'Permission Profiles', cols: [{ key: 'name', label: 'Name' }, { key: 'preset', label: 'Preset' }, { key: 'description', label: 'Description' }] },
      ]},
      { key: 'cc2_communicationInformation', tables: [
        { path: 'auditTrail.toolCalls.topTools', label: 'Top Tools by Usage', cols: [{ key: 'toolName', label: 'Tool' }, { key: 'executions', label: 'Executions' }, { key: 'failures', label: 'Failures' }] },
        { path: 'auditTrail.toolCalls.dailyVolume', label: 'Daily Tool Call Volume', cols: [{ key: 'date', label: 'Date' }, { key: 'count', label: 'Count' }] },
      ]},
      { key: 'cc3_riskAssessment', tables: [
        { path: 'dlpControls.rules', label: 'DLP Rules', cols: [{ key: 'name', label: 'Name' }, { key: 'patternType', label: 'Type' }, { key: 'action', label: 'Action' }, { key: 'severity', label: 'Severity' }, { key: 'enabled', label: 'Enabled' }] },
        { path: 'dlpViolations.recentViolations', label: 'DLP Violations', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'ruleId', label: 'Rule' }, { key: 'actionTaken', label: 'Action' }, { key: 'direction', label: 'Direction' }, { key: 'timestamp', label: 'Time' }] },
      ]},
      { key: 'cc4_monitoringActivities', tables: [
        { path: 'guardrailRules.rules', label: 'Guardrail Rules', cols: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'action', label: 'Action' }, { key: 'severity', label: 'Severity' }] },
        { path: 'interventions.recentInterventions', label: 'Interventions', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }, { key: 'timestamp', label: 'Time' }] },
      ]},
      { key: 'cc5_controlActivities', tables: [
        { path: 'approvalWorkflows.recentRequests', label: 'Approval Requests', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'toolId', label: 'Tool' }, { key: 'status', label: 'Status' }, { key: 'requestedAt', label: 'Requested' }, { key: 'resolvedBy', label: 'Resolved By' }] },
        { path: 'escalations.escalations', label: 'Escalations', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }] },
      ]},
      { key: 'cc6_logicalAccess', tables: [
        { path: 'vaultManagement.secrets', label: 'Vault Secrets', cols: [{ key: 'key', label: 'Key' }, { key: 'agentId', label: 'Agent' }, { key: 'expired', label: 'Expired' }, { key: 'expiresAt', label: 'Expires' }] },
        { path: 'vaultManagement.auditLog.recentAccesses', label: 'Vault Access Log', cols: [{ key: 'action', label: 'Action' }, { key: 'key', label: 'Key' }, { key: 'agentId', label: 'Agent' }, { key: 'timestamp', label: 'Time' }] },
      ]},
      { key: 'cc7_systemOperations', tables: [
        { path: 'conversationMetrics.byAgent', label: 'Conversation Metrics', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'total', label: 'Total' }, { key: 'completed', label: 'Completed' }, { key: 'completionRate', label: 'Rate' }] },
      ]},
      { key: 'cc8_changeManagement', tables: [
        { path: 'actionJournal.recentActions', label: 'Action Journal', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'toolName', label: 'Tool' }, { key: 'actionType', label: 'Type' }, { key: 'reversed', label: 'Reversed' }, { key: 'timestamp', label: 'Time' }] },
        { path: 'configurationChanges.recentChanges', label: 'Config Changes', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'fromState', label: 'From' }, { key: 'toState', label: 'To' }, { key: 'changedBy', label: 'Changed By' }, { key: 'timestamp', label: 'Time' }] },
      ]},
      { key: 'cc9_riskMitigation', tables: [
        { path: 'budgetControls.recentAlerts', label: 'Budget Alerts', cols: [{ key: 'agentId', label: 'Agent' }, { key: 'alertType', label: 'Type' }, { key: 'message', label: 'Message' }, { key: 'timestamp', label: 'Time' }] },
      ]},
    ];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const secData = d[sec.key];
      if (!secData) continue;
      const ccNum = i + 1;
      p.push(`<h2 id="cc${ccNum}" class="page-break">CC${ccNum}: ${this.ccTitle(ccNum)}</h2>`);
      if (secData.description) p.push(`<p style="color:#64748b;margin-bottom:16px">${esc(secData.description)}</p>`);

      // Add summary KVs if present
      for (const [k, v] of Object.entries(secData)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && k !== 'title' && k !== 'description') {
          const resolved = this.resolvePath(secData, k);
          if (typeof resolved === 'object' && !Array.isArray(resolved)) {
            // Check if it's a table-target; skip if covered by tables below
            const isTableTarget = sec.tables.some(t => t.path.startsWith(k + '.') || t.path === k);
            if (!isTableTarget && Object.values(resolved).every(v => typeof v !== 'object')) {
              p.push(`<h3>${esc(k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()))}</h3>`);
              p.push(this.htmlKV(resolved, esc));
            }
          }
        }
      }

      for (const t of sec.tables) {
        const items = this.resolvePath(secData, t.path);
        if (!items || (Array.isArray(items) && items.length === 0)) continue;
        const arr = Array.isArray(items) ? items : [];
        p.push(`<h3>${esc(t.label)} (${arr.length})</h3>`);
        p.push(this.htmlTable(arr, t.cols, esc, resolveAgent));
      }
    }

    // Findings
    p.push(`<h2 id="findings" class="page-break">Findings & Recommendations</h2>`);
    const passes = findings.filter((f: any) => f.severity === 'pass');
    const issues = findings.filter((f: any) => f.severity !== 'pass' && f.severity !== 'info');
    if (passes.length) {
      p.push(`<h3>Controls In Place (${passes.length})</h3>`);
      for (const f of passes) p.push(`<div class="finding finding-pass"><div class="cat">${esc(f.category)}</div><span class="badge badge-pass">PASS</span> ${esc(f.message)}</div>`);
    }
    if (issues.length) {
      p.push(`<h3>Gaps & Recommendations (${issues.length})</h3>`);
      for (const f of issues) p.push(`<div class="finding finding-${f.severity}"><div class="cat">${esc(f.category)}</div><span class="badge badge-${f.severity}">${esc(f.severity.toUpperCase())}</span> ${esc(f.message)}</div>`);
    }

    return p.join('\n');
  }

  private auditToHTML(d: any, esc: (s: any) => string, resolveAgent?: (id: any) => string): string {
    const p: string[] = [];
    const summary = d.summary || {};
    p.push(`<h2>Summary</h2>`);
    p.push(this.htmlMetrics({ 'Total Events': summary.totalEvents, ...summary.bySource }, esc));
    p.push(`<h3>By Category</h3>`);
    p.push(this.htmlKV(summary.byCategory || {}, esc));
    p.push(`<h3>By Agent</h3>`);
    const byAgentResolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(summary.byAgent || {})) {
      byAgentResolved[resolveAgent ? resolveAgent(k) : k] = v;
    }
    p.push(this.htmlKV(byAgentResolved, esc));
    p.push(`<h2 class="page-break">Audit Timeline (${(d.timeline || []).length} events)</h2>`);
    p.push(this.htmlTable(d.timeline || [], [
      { key: 'timestamp', label: 'Time' }, { key: 'source', label: 'Source' }, { key: 'category', label: 'Category' },
      { key: 'agentId', label: 'Agent' }, { key: 'detail', label: 'Detail' }
    ], esc, resolveAgent));
    return p.join('\n');
  }

  private gdprToHTML(d: any, esc: (s: any) => string, resolveAgent?: (id: any) => string): string {
    const p: string[] = [];
    p.push(`<h2>Data Summary</h2>`);
    p.push(this.htmlKV(d.dataSummary || {}, esc));
    const tables: [string, string, { key: string; label: string }[]][] = [
      ['toolCalls', 'Tool Calls', [{ key: 'tool_id', label: 'Tool' }, { key: 'tool_name', label: 'Name' }, { key: 'created_at', label: 'Time' }]],
      ['journalEntries', 'Journal Entries', [{ key: 'tool_id', label: 'Tool' }, { key: 'action_type', label: 'Action' }, { key: 'reversed', label: 'Reversed' }, { key: 'created_at', label: 'Time' }]],
      ['interventions', 'Interventions', [{ key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }, { key: 'created_at', label: 'Time' }]],
      ['memories', 'Memories', [{ key: 'key', label: 'Key' }, { key: 'category', label: 'Category' }, { key: 'created_at', label: 'Created' }]],
    ];
    for (const [key, label, cols] of tables) {
      const items = d[key] || [];
      if (items.length === 0) continue;
      p.push(`<h2 class="page-break">${esc(label)} (${items.length})</h2>`);
      p.push(this.htmlTable(items, cols, esc, resolveAgent));
    }
    return p.join('\n');
  }

  private incidentToHTML(d: any, esc: (s: any) => string, resolveAgent?: (id: any) => string): string {
    const p: string[] = [];
    p.push(`<h2>Incident Summary</h2>`);
    p.push(this.htmlMetrics(d.incidentSummary || {}, esc));
    const tables: [string, string, { key: string; label: string }[]][] = [
      ['dlpViolations', 'DLP Violations', [{ key: 'agent_id', label: 'Agent' }, { key: 'rule_id', label: 'Rule' }, { key: 'action_taken', label: 'Action' }, { key: 'direction', label: 'Dir' }, { key: 'created_at', label: 'Time' }]],
      ['interventions', 'Interventions', [{ key: 'agent_id', label: 'Agent' }, { key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }, { key: 'created_at', label: 'Time' }]],
      ['escalations', 'Escalations', [{ key: 'agent_id', label: 'Agent' }, { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'created_at', label: 'Time' }]],
      ['reversedActions', 'Reversed Actions', [{ key: 'agent_id', label: 'Agent' }, { key: 'tool_name', label: 'Tool' }, { key: 'action_type', label: 'Type' }, { key: 'reversed_by', label: 'By' }, { key: 'created_at', label: 'Time' }]],
    ];
    for (const [key, label, cols] of tables) {
      const items = d[key] || [];
      if (items.length === 0) continue;
      p.push(`<h2 class="page-break">${esc(label)} (${items.length})</h2>`);
      p.push(this.htmlTable(items, cols, esc, resolveAgent));
    }
    return p.join('\n');
  }

  private accessReviewToHTML(d: any, esc: (s: any) => string, resolveAgent?: (id: any) => string): string {
    const p: string[] = [];
    p.push(`<h2>Agent Access Review</h2>`);
    p.push(this.htmlTable(d.agentAccess || [], [
      { key: 'name', label: 'Agent' }, { key: 'status', label: 'Status' }, { key: 'role', label: 'Role' },
      { key: 'permissionProfile', label: 'Permissions' }, { key: 'hasBudget', label: 'Budget' },
      { key: 'vaultSecrets', label: 'Vault Secrets' }, { key: 'expiredSecrets', label: 'Expired' }
    ], esc, resolveAgent));
    p.push(`<h2>Vault Review</h2>`);
    p.push(this.htmlKV(d.vaultReview || {}, esc));
    if ((d.recommendations || []).length) {
      p.push(`<h2>Recommendations</h2>`);
      for (const r of d.recommendations) p.push(`<div class="finding finding-${r.severity}"><span class="badge badge-${r.severity}">${esc(r.severity.toUpperCase())}</span> ${esc(r.message)}</div>`);
    }
    return p.join('\n');
  }

  private ccTitle(num: number): string {
    return ['', 'Control Environment', 'Communication & Information', 'Risk Assessment', 'Monitoring Activities', 'Control Activities', 'Logical & Physical Access', 'System Operations', 'Change Management', 'Risk Mitigation'][num] || '';
  }

  private resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  // ─── Risk Score Calculator ────────────────────────

  private calculateRiskScore(dlpViolations: Rows, securityEvents: Rows, guardrailRules: Rows, dlpRules: Rows): Record<string, any> {
    let score = 100; // Start at 100 (best)
    const deductions: { category: string; points: number; reason: string }[] = [];

    // DLP violations reduce score
    if (dlpViolations.length > 0) {
      const blocked = dlpViolations.filter((v: any) => v.action_taken === 'blocked').length;
      const pts = Math.min(blocked * 2, 20);
      score -= pts;
      deductions.push({ category: 'DLP', points: pts, reason: `${blocked} blocked DLP violations` });
    }

    // Lack of DLP rules
    if (dlpRules.length < 5) {
      score -= 10;
      deductions.push({ category: 'DLP Controls', points: 10, reason: `Only ${dlpRules.length} DLP rules (recommend 5+)` });
    }

    // Lack of guardrails
    if (guardrailRules.length < 3) {
      score -= 10;
      deductions.push({ category: 'Guardrails', points: 10, reason: `Only ${guardrailRules.length} guardrail rules (recommend 3+)` });
    }

    // Security events
    if (securityEvents.length > 0) {
      const criticals = securityEvents.filter((e: any) => e.severity === 'critical').length;
      const pts = Math.min(criticals * 5 + securityEvents.length, 30);
      score -= pts;
      deductions.push({ category: 'Security', points: pts, reason: `${securityEvents.length} security events (${criticals} critical)` });
    }

    return {
      score: Math.max(0, score),
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
      deductions,
    };
  }

  // ─── Findings Generator ───────────────────────────

  private generateFindings(data: any): { severity: string; message: string; category: string }[] {
    const findings: { severity: string; message: string; category: string }[] = [];
    const km = data.executiveSummary?.keyMetrics || {};
    const cc1 = data.cc1_controlEnvironment || {};
    const cc5 = data.cc5_controlActivities || {};
    const cc6 = data.cc6_logicalAccess || {};

    // ─── Positive findings (controls in place) ────────────

    // Approval system
    const approvalPolicies = cc5.approvalWorkflows?.policies || [];
    const totalApprovals = km.totalApprovalRequests || 0;
    if (approvalPolicies.length > 0) {
      findings.push({ severity: 'pass', category: 'CC5: Control Activities', message: `Human-in-the-loop approval system active with ${approvalPolicies.length} approval ${approvalPolicies.length === 1 ? 'policy' : 'policies'}. ${totalApprovals} approval requests processed during the reporting period (approval rate: ${km.approvalRate || 'N/A'}).` });
    }

    // Escalation chains + approval policies with notification
    const escalationChains = cc1.escalationChains?.total || 0;
    const escalationViaApproval = data._escalationViaApprovalPolicies || 0;
    const totalEscalation = escalationChains + escalationViaApproval;
    if (totalEscalation > 0) {
      const parts: string[] = [];
      if (escalationChains > 0) parts.push(`${escalationChains} dedicated escalation ${escalationChains === 1 ? 'chain' : 'chains'}`);
      if (escalationViaApproval > 0) parts.push(`${escalationViaApproval} approval ${escalationViaApproval === 1 ? 'policy' : 'policies'} with notification/escalation routing`);
      findings.push({ severity: 'pass', category: 'CC4: Monitoring', message: `Escalation procedures in place: ${parts.join(', ')}. Critical incidents are routed to managers via configured notification channels.` });
    }

    // Guardrails
    if (km.activeGuardrailRules > 0) {
      findings.push({ severity: 'pass', category: 'CC4: Monitoring', message: `${km.activeGuardrailRules} active guardrail rules enforcing real-time agent behavior monitoring. ${km.totalInterventions} interventions triggered during the reporting period.` });
    }

    // DLP
    if (km.activeDLPRules >= 5) {
      findings.push({ severity: 'pass', category: 'CC3: Risk Assessment', message: `${km.activeDLPRules} active DLP rules providing data loss prevention coverage across PII, credentials, and compliance categories.` });
    }

    // Policies
    if (km.activePolicies > 0) {
      findings.push({ severity: 'pass', category: 'CC1: Control Environment', message: `${km.activePolicies} governance policies active, covering ${Object.keys(cc1.governancePolicies?.byCategory || {}).join(', ') || 'multiple categories'}.` });
    }

    // Permission profiles
    const permProfiles = cc1.permissionProfiles?.totalProfiles || 0;
    if (permProfiles > 0) {
      findings.push({ severity: 'pass', category: 'CC6: Access Controls', message: `${permProfiles} permission profiles configured, enforcing least-privilege tool access for agents.` });
    }

    // Vault management
    const vaultSecrets = (cc6.vaultManagement?.totalSecrets ?? cc6.vaultManagement?.secrets?.length) || 0;
    if (vaultSecrets > 0) {
      findings.push({ severity: 'pass', category: 'CC6: Access Controls', message: `Vault secrets management active with ${vaultSecrets} secrets under management. ${cc6.vaultManagement?.auditLog?.totalAccesses || 0} audited accesses during the reporting period.` });
    }

    // SSO
    const ssoCount = cc6.ssoIntegrations?.total || 0;
    if (ssoCount > 0) {
      findings.push({ severity: 'pass', category: 'CC6: Access Controls', message: `${ssoCount} SSO integration(s) configured for centralized authentication.` });
    }

    // Budget controls
    const agentsWithBudgets = (cc1.agentInventory?.agents || []).filter((a: any) => a.hasBudgetConfig).length;
    if (agentsWithBudgets > 0) {
      findings.push({ severity: 'pass', category: 'CC9: Risk Mitigation', message: `Budget controls configured for ${agentsWithBudgets} of ${km.totalAgents} agents. ${km.totalBudgetAlerts} budget alerts triggered during the reporting period.` });
    }

    // Journal / reversibility
    const journalActions = km.totalJournalActions || 0;
    if (journalActions > 0) {
      findings.push({ severity: 'pass', category: 'CC8: Change Management', message: `Action journal tracking ${journalActions} reversible actions with rollback support. Reversal rate: ${km.journalReversalRate || '0%'}.` });
    }

    // ─── Negative findings (gaps to address) ──────────────

    // Missing approval system
    if (approvalPolicies.length === 0) {
      findings.push({ severity: 'high', category: 'CC5: Control Activities', message: 'No approval policies configured. Implement human-in-the-loop approval workflows for sensitive tool executions (email sends, file deletions, external API calls).' });
    }

    // Missing escalation chains
    if (totalEscalation === 0) {
      findings.push({ severity: 'medium', category: 'CC4: Monitoring', message: 'No escalation chains configured. Set up escalation procedures to route critical agent incidents to managers via email/notification.' });
    }

    // Insufficient DLP
    if (km.activeDLPRules < 5) {
      findings.push({ severity: 'high', category: 'CC3: Risk Assessment', message: `Only ${km.activeDLPRules} active DLP rules. Enterprise environments should have comprehensive DLP coverage (recommend 15+ rules across PII, credentials, and compliance categories). Use the DLP Rule Packs to quickly apply enterprise-grade defaults.` });
    }

    // No guardrails
    if (km.activeGuardrailRules === 0) {
      findings.push({ severity: 'high', category: 'CC4: Monitoring', message: 'No guardrail rules configured. Implement rate limits, content filters, and tool restrictions for real-time agent behavior control.' });
    } else if (km.activeGuardrailRules < 3) {
      findings.push({ severity: 'medium', category: 'CC4: Monitoring', message: `Only ${km.activeGuardrailRules} guardrail rules active. Consider adding additional rules for rate limits, content filters, and tool restrictions.` });
    }

    // DLP violations detected
    if (km.totalDLPViolations > 0) {
      const blocked = data.cc3_riskAssessment?.dlpViolations?.byAction?.blocked || 0;
      findings.push({ severity: blocked > 0 ? 'medium' : 'low', category: 'CC3: Risk Assessment', message: `${km.totalDLPViolations} DLP violations detected (${blocked} blocked). Review violation details in CC3 section to assess data exposure risk.` });
    }

    // High reversal rate
    const reversalRate = parseFloat(data.cc8_changeManagement?.actionJournal?.reversalRate || '0');
    if (reversalRate > 5) {
      findings.push({ severity: 'medium', category: 'CC8: Change Management', message: `${reversalRate}% action reversal rate detected. High reversal rates may indicate agent reliability issues or overly aggressive actions.` });
    }

    // Expired vault secrets
    const expiredSecrets = (cc6.vaultManagement?.secrets || []).filter((s: any) => s.expired).length;
    if (expiredSecrets > 0) {
      findings.push({ severity: 'high', category: 'CC6: Access Controls', message: `${expiredSecrets} vault secrets have expired. Rotate or remove expired credentials immediately.` });
    }

    // Secrets without expiry
    const noExpiry = (cc6.vaultManagement?.secrets || []).filter((s: any) => !s.expiresAt).length;
    if (noExpiry > 0) {
      findings.push({ severity: 'low', category: 'CC6: Access Controls', message: `${noExpiry} vault secrets have no expiration set. Consider setting expiry dates to enforce credential rotation.` });
    }

    // Agents without budget controls
    const agentsNoBudget = km.totalAgents - agentsWithBudgets;
    if (agentsNoBudget > 0 && km.totalAgents > 0) {
      findings.push({ severity: 'low', category: 'CC9: Risk Mitigation', message: `${agentsNoBudget} of ${km.totalAgents} agents have no budget controls configured. Consider setting spending limits to prevent cost overruns.` });
    }

    // Agents on default permission profile
    const defaultPermAgents = (cc1.agentInventory?.agents || []).filter((a: any) => a.permissionProfile === 'default').length;
    if (defaultPermAgents > 0) {
      findings.push({ severity: 'low', category: 'CC6: Access Controls', message: `${defaultPermAgents} agents using the default permission profile. Assign specific permission profiles to enforce least-privilege access.` });
    }

    // No policies
    if (km.activePolicies === 0) {
      findings.push({ severity: 'medium', category: 'CC1: Control Environment', message: 'No governance policies configured. Define organizational policies for agent behavior, data handling, and compliance requirements.' });
    }

    // Budget alerts fired
    if (km.totalBudgetAlerts > 5) {
      findings.push({ severity: 'medium', category: 'CC9: Risk Mitigation', message: `${km.totalBudgetAlerts} budget alerts triggered during the reporting period. Review budget configurations and agent spending patterns.` });
    } else if (km.totalBudgetAlerts > 0) {
      findings.push({ severity: 'low', category: 'CC9: Risk Mitigation', message: `${km.totalBudgetAlerts} budget alerts triggered. Review cost management controls in CC9 section.` });
    }

    // Denied approvals (may indicate agents attempting unauthorized actions)
    const deniedApprovals = cc5.approvalWorkflows?.byStatus?.denied || cc5.approvalWorkflows?.byStatus?.rejected || 0;
    if (deniedApprovals > 0) {
      findings.push({ severity: 'medium', category: 'CC5: Control Activities', message: `${deniedApprovals} approval requests were denied/rejected. Investigate whether agents are attempting unauthorized operations.` });
    }

    // Sort: pass first, then by severity
    const order: Record<string, number> = { pass: 0, info: 1, low: 2, medium: 3, high: 4, critical: 5 };
    findings.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    if (findings.length === 0) {
      findings.push({ severity: 'info', category: 'General', message: 'No significant findings. All controls operating effectively within the reporting period.' });
    }

    return findings;
  }

  // ─── Helpers ──────────────────────────────────────

  private groupCount(rows: Rows, field: string): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of rows) { const k = r[field] || 'unknown'; map[k] = (map[k] || 0) + 1; }
    return map;
  }

  private rowsToMap(rows: Rows, keyField: string, valField: string): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of rows) map[r[keyField]] = r[valField];
    return map;
  }

  private calcAvgResponseTime(approvals: Rows): string {
    const resolved = approvals.filter((a: any) => a.resolved_at && a.created_at);
    if (resolved.length === 0) return 'N/A';
    const total = resolved.reduce((sum: number, a: any) => {
      return sum + (new Date(a.resolved_at).getTime() - new Date(a.created_at).getTime());
    }, 0);
    const avgMs = total / resolved.length;
    if (avgMs < 60000) return `${(avgMs / 1000).toFixed(0)}s`;
    if (avgMs < 3600000) return `${(avgMs / 60000).toFixed(0)}m`;
    return `${(avgMs / 3600000).toFixed(1)}h`;
  }

  private createReport(orgId: string, type: ComplianceReport['type'], title: string, parameters: Record<string, any>, generatedBy: string): ComplianceReport {
    const report: ComplianceReport = {
      id: crypto.randomUUID(),
      orgId, type, title, parameters,
      status: 'generating',
      format: 'json',
      generatedBy,
      createdAt: new Date().toISOString(),
    };
    this.reports.unshift(report);
    if (this.reports.length > 200) this.reports = this.reports.slice(0, 200);
    return report;
  }

  private persistReport(report: ComplianceReport): void {
    this.engineDb?.execute(
      `INSERT INTO compliance_reports (id, org_id, type, title, parameters, status, data, format, generated_by, error, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data, error=excluded.error, completed_at=excluded.completed_at`,
      [report.id, report.orgId, report.type, report.title, JSON.stringify(report.parameters),
       report.status, report.data ? JSON.stringify(report.data) : null, report.format,
       report.generatedBy, report.error || null, report.createdAt, report.completedAt || null]
    ).catch((err) => { console.error('[compliance] Failed to persist report:', err); });
  }

  private flattenObject(obj: Record<string, any>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, path));
      } else {
        result[path] = Array.isArray(value) ? `[${value.length} items]` : String(value);
      }
    }
    return result;
  }
}
