/**
 * Compliance Reporting Engine
 *
 * Generates compliance reports by aggregating data from all engine modules:
 * - SOC2 Summary: risk analysis, approval rates, DLP incidents, interventions
 * - GDPR Export: all data associated with an agent (right to access)
 * - Audit Summary: timeline of events across all tables
 *
 * Reports are stored in DB for later retrieval/download.
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export interface ComplianceReport {
  id: string;
  orgId: string;
  type: 'soc2' | 'gdpr' | 'audit';
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
        'SELECT * FROM compliance_reports ORDER BY created_at DESC LIMIT 100'
      );
      this.reports = rows.map((r: any) => ({
        id: r.id, orgId: r.org_id, type: r.type, title: r.title,
        parameters: r.parameters ? JSON.parse(r.parameters) : {},
        status: r.status, data: r.data ? JSON.parse(r.data) : undefined,
        format: r.format || 'json', generatedBy: r.generated_by,
        error: r.error, createdAt: r.created_at, completedAt: r.completed_at,
      }));
    } catch { /* table may not exist yet */ }
  }

  // ─── Report Generation ────────────────────────────

  async generateSOC2(orgId: string, dateRange: { from: string; to: string }, generatedBy: string): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'soc2', `SOC2 Summary ${dateRange.from} to ${dateRange.to}`, { dateRange }, generatedBy);

    try {
      const data: Record<string, any> = {};

      if (this.engineDb) {
        // Tool call volume & risk breakdown
        const toolCalls = await this.engineDb.query<any>(
          'SELECT COUNT(*) as cnt FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ?',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => [{ cnt: 0 }]);
        data.toolCalls = { total: toolCalls[0]?.cnt || 0 };

        // Approval stats
        const approvals = await this.engineDb.query<any>(
          'SELECT status, COUNT(*) as cnt FROM approval_requests WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY status',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        data.approvals = {};
        for (const r of approvals) { data.approvals[r.status] = r.cnt; }

        // DLP violations
        const dlpViolations = await this.engineDb.query<any>(
          'SELECT action_taken, COUNT(*) as cnt FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY action_taken',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        data.dlpViolations = {};
        for (const r of dlpViolations) { data.dlpViolations[r.action_taken] = r.cnt; }

        // Interventions
        const interventions = await this.engineDb.query<any>(
          'SELECT type, COUNT(*) as cnt FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY type',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        data.interventions = {};
        for (const r of interventions) { data.interventions[r.type] = r.cnt; }

        // Budget compliance
        const budgetAlerts = await this.engineDb.query<any>(
          'SELECT alert_type, COUNT(*) as cnt FROM budget_alerts WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY alert_type',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        data.budgetAlerts = {};
        for (const r of budgetAlerts) { data.budgetAlerts[r.alert_type] = r.cnt; }

        // Journal actions
        const journalActions = await this.engineDb.query<any>(
          'SELECT action_type, COUNT(*) as cnt, SUM(reversed) as reversed_cnt FROM action_journal WHERE org_id = ? AND created_at BETWEEN ? AND ? GROUP BY action_type',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        data.journalActions = {};
        for (const r of journalActions) { data.journalActions[r.action_type] = { total: r.cnt, reversed: r.reversed_cnt || 0 }; }
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

  async generateGDPR(orgId: string, agentId: string, generatedBy: string): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'gdpr', `GDPR Export — Agent ${agentId}`, { agentId }, generatedBy);

    try {
      const data: Record<string, any> = { agentId };

      if (this.engineDb) {
        // All tool calls
        data.toolCalls = await this.engineDb.query<any>(
          'SELECT * FROM tool_calls WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC',
          [orgId, agentId]
        ).catch(() => []);

        // Activity events
        data.activityEvents = await this.engineDb.query<any>(
          'SELECT * FROM activity_events WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC',
          [orgId, agentId]
        ).catch(() => []);

        // Conversations
        data.conversations = await this.engineDb.query<any>(
          'SELECT * FROM conversations WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC',
          [orgId, agentId]
        ).catch(() => []);

        // Messages
        data.messages = await this.engineDb.query<any>(
          'SELECT * FROM agent_messages WHERE org_id = ? AND (from_agent_id = ? OR to_agent_id = ?) ORDER BY created_at DESC',
          [orgId, agentId, agentId]
        ).catch(() => []);

        // Journal entries
        data.journalEntries = await this.engineDb.query<any>(
          'SELECT * FROM action_journal WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC',
          [orgId, agentId]
        ).catch(() => []);

        // Interventions
        data.interventions = await this.engineDb.query<any>(
          'SELECT * FROM interventions WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC',
          [orgId, agentId]
        ).catch(() => []);

        // Approval requests
        data.approvalRequests = await this.engineDb.query<any>(
          'SELECT * FROM approval_requests WHERE org_id = ? AND agent_id = ? ORDER BY created_at DESC',
          [orgId, agentId]
        ).catch(() => []);
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

  async generateAudit(orgId: string, dateRange: { from: string; to: string }, generatedBy: string, agentIds?: string[]): Promise<ComplianceReport> {
    const report = this.createReport(orgId, 'audit', `Audit Summary ${dateRange.from} to ${dateRange.to}`, { dateRange, agentIds }, generatedBy);

    try {
      const data: Record<string, any> = {};
      const agentFilter = agentIds && agentIds.length > 0;

      if (this.engineDb) {
        // Unified timeline from multiple tables
        const timeline: { timestamp: string; source: string; type: string; agentId: string; detail: string }[] = [];

        // Tool calls
        const tools = await this.engineDb.query<any>(
          'SELECT * FROM tool_calls WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        for (const t of tools) {
          if (agentFilter && !agentIds!.includes(t.agent_id)) continue;
          timeline.push({ timestamp: t.created_at, source: 'tool_call', type: t.tool_id, agentId: t.agent_id, detail: `Tool: ${t.tool_name || t.tool_id}` });
        }

        // Interventions
        const ints = await this.engineDb.query<any>(
          'SELECT * FROM interventions WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        for (const i of ints) {
          if (agentFilter && !agentIds!.includes(i.agent_id)) continue;
          timeline.push({ timestamp: i.created_at, source: 'intervention', type: i.type, agentId: i.agent_id, detail: i.reason });
        }

        // DLP violations
        const dlps = await this.engineDb.query<any>(
          'SELECT * FROM dlp_violations WHERE org_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at',
          [orgId, dateRange.from, dateRange.to]
        ).catch(() => []);
        for (const d of dlps) {
          if (agentFilter && !agentIds!.includes(d.agent_id)) continue;
          timeline.push({ timestamp: d.created_at, source: 'dlp_violation', type: d.action_taken, agentId: d.agent_id, detail: `Rule ${d.rule_id}: ${d.action_taken}` });
        }

        // Sort timeline chronologically
        timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        data.timeline = timeline;
        data.summary = {
          totalEvents: timeline.length,
          bySource: {} as Record<string, number>,
          byAgent: {} as Record<string, number>,
        };
        for (const e of timeline) {
          data.summary.bySource[e.source] = (data.summary.bySource[e.source] || 0) + 1;
          data.summary.byAgent[e.agentId] = (data.summary.byAgent[e.agentId] || 0) + 1;
        }
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

  // ─── CSV Export ───────────────────────────────────

  toCSV(report: ComplianceReport): string {
    if (!report.data) return '';

    if (report.type === 'audit' && report.data.timeline) {
      const rows = report.data.timeline as any[];
      if (rows.length === 0) return 'timestamp,source,type,agentId,detail\n';
      return 'timestamp,source,type,agentId,detail\n' +
        rows.map((r: any) => `${r.timestamp},${r.source},${r.type},${r.agentId},"${(r.detail || '').replace(/"/g, '""')}"`).join('\n');
    }

    // Generic flat JSON-to-CSV
    const flat = this.flattenObject(report.data);
    return 'key,value\n' + Object.entries(flat).map(([k, v]) => `${k},"${String(v).replace(/"/g, '""')}"`).join('\n');
  }

  // ─── Private ──────────────────────────────────────

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
