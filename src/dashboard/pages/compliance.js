import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentDataMap, renderAgentBadge, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';
import { useOrgContext } from '../components/org-switcher.js';

export function CompliancePage() {
  const { toast } = useApp();
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();

  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState('reports');
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ type: 'soc2', orgId: effectiveOrgId, agentId: '', from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });
  const [agents, setAgents] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('summary');

  const load = () => {
    engineCall('/compliance/reports?orgId=' + effectiveOrgId).then(d => setReports(d.reports || [])).catch(() => {});
    engineCall('/agents?orgId=' + effectiveOrgId).then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(() => { load(); setForm(f => ({ ...f, orgId: effectiveOrgId })); }, [effectiveOrgId]);

  const agentData = buildAgentDataMap(agents);

  const agentName = (id) => {
    if (!id || id === '-') return '-';
    const name = agentData[id]?.name || (selected?.data?._agentNameMap || {})[id];
    if (name && name !== id) return name + ' (' + id.substring(0, 8) + ')';
    return id.substring(0, 12) + (id.length > 12 ? '...' : '');
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const endpoint = '/compliance/reports/' + form.type;
      var body;
      if (form.type === 'gdpr') body = { orgId: effectiveOrgId, agentId: form.agentId };
      else if (form.type === 'access-review') body = { orgId: effectiveOrgId };
      else body = { orgId: effectiveOrgId, dateRange: { from: form.from, to: form.to }, agentIds: form.agentId ? [form.agentId] : undefined };
      await engineCall(endpoint, { method: 'POST', body: JSON.stringify(body) });
      toast('Report generated', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    setGenerating(false);
  };

  const openDetail = async (r) => {
    if (r.data) { setDetail(r); setDetailTab('summary'); return; }
    setDetailLoading(true);
    try {
      const d = await engineCall('/compliance/reports/' + r.id);
      setDetail(d.report || r);
      setDetailTab('summary');
    } catch { setDetail(r); }
    setDetailLoading(false);
  };

  const download = (id, format) => {
    window.open('/api/engine/compliance/reports/' + id + '/download?format=' + format, '_blank');
  };

  const deleteReport = async (id) => {
    try { await engineCall('/compliance/reports/' + id, { method: 'DELETE' }); toast('Report deleted', 'success'); load(); setDetail(null); } catch (e) { toast(e.message, 'error'); }
  };

  const typeLabel = (t) => ({ soc2: 'SOC 2 Type II', gdpr: 'GDPR DSAR', audit: 'Audit Trail', incident: 'Incident Report', 'access-review': 'Access Review' }[t] || t.toUpperCase());
  const typeBadge = (t) => ({ soc2: 'badge-info', gdpr: 'badge-success', audit: 'badge-neutral', incident: 'badge-danger', 'access-review': 'badge-warning' }[t] || 'badge-neutral');

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };
  var _metricCard = { padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius, 8px)', textAlign: 'center' };
  var _metricValue = { fontSize: 28, fontWeight: 700, lineHeight: 1.2 };
  var _metricLabel = { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 };
  var _sectionTitle = { fontSize: 14, fontWeight: 600, margin: '20px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' };

  // ─── Report Detail Sections ───────────────────────

  function renderSOC2Detail(data) {
    if (!data) return h('p', { style: { color: 'var(--text-muted)' } }, 'No data available');

    const km = data.executiveSummary?.keyMetrics || {};
    const risk = data.cc3_riskAssessment?.riskScore || {};
    const findings = data.executiveSummary?.findings || [];

    const sections = [
      { key: 'summary', label: 'Executive Summary' },
      { key: 'cc1', label: 'CC1: Control Environment' },
      { key: 'cc2', label: 'CC2: Communication' },
      { key: 'cc3', label: 'CC3: Risk Assessment' },
      { key: 'cc4', label: 'CC4: Monitoring' },
      { key: 'cc5', label: 'CC5: Control Activities' },
      { key: 'cc6', label: 'CC6: Access Controls' },
      { key: 'cc7', label: 'CC7: Operations' },
      { key: 'cc8', label: 'CC8: Change Mgmt' },
      { key: 'cc9', label: 'CC9: Risk Mitigation' },
      { key: 'findings', label: 'Findings' },
    ];

    return h(Fragment, null,
      h('div', { className: 'tabs', style: { marginBottom: 16, flexWrap: 'wrap' } },
        sections.map(s => h('button', { key: s.key, className: 'tab' + (detailTab === s.key ? ' active' : ''), onClick: () => setDetailTab(s.key), style: { fontSize: 12, padding: '6px 10px' } }, s.label))
      ),

      detailTab === 'summary' && h(Fragment, null,
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 } },
          metricCard(km.totalAgents, 'Agents'),
          metricCard(km.totalToolExecutions, 'Tool Executions'),
          metricCard(km.totalInterventions, 'Interventions'),
          metricCard(km.totalDLPViolations, 'DLP Violations'),
          metricCard(km.totalApprovalRequests, 'Approvals'),
          metricCard(km.approvalRate, 'Approval Rate'),
          metricCard(km.totalJournalActions, 'Journal Actions'),
          metricCard(km.journalReversalRate, 'Reversal Rate'),
          metricCard(km.totalBudgetAlerts, 'Budget Alerts'),
          metricCard(km.activeDLPRules, 'DLP Rules'),
          metricCard(km.activeGuardrailRules, 'Guardrails'),
          metricCard(km.activePolicies, 'Policies'),
        ),
        h('div', { style: { display: 'flex', gap: 16, marginBottom: 16 } },
          h('div', { style: { ...(_metricCard), flex: 1, display: 'flex', alignItems: 'center', gap: 16 } },
            h('div', { style: { fontSize: 48, fontWeight: 800, color: risk.grade === 'A' ? 'var(--success)' : risk.grade === 'B' ? 'var(--info)' : risk.grade === 'C' ? 'var(--warning)' : 'var(--danger)' } }, risk.grade || '-'),
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, 'Risk Score: ' + (risk.score ?? '-') + '/100'),
              (risk.deductions || []).map((d, i) => h('div', { key: i, style: { fontSize: 12, color: 'var(--text-muted)' } }, '-' + d.points + ' ' + d.reason))
            )
          )
        )
      ),

      detailTab === 'cc1' && renderSection(data.cc1_controlEnvironment, [
        { key: 'agentInventory.agents', label: 'Agent Inventory', columns: ['name', 'status', 'role', 'model', 'permissionProfile', 'hasBudgetConfig'] },
        { key: 'governancePolicies.policies', label: 'Policies', columns: ['name', 'category', 'enforcement', 'enabled', 'priority'] },
        { key: 'permissionProfiles.profiles', label: 'Permission Profiles', columns: ['name', 'preset', 'description'] },
      ]),

      detailTab === 'cc2' && renderSection(data.cc2_communicationInformation, [
        { key: 'auditTrail.toolCalls.topTools', label: 'Top Tools by Usage', columns: ['toolName', 'executions', 'failures'] },
        { key: 'auditTrail.toolCalls.dailyVolume', label: 'Daily Volume', columns: ['date', 'count'] },
      ]),

      detailTab === 'cc3' && renderSection(data.cc3_riskAssessment, [
        { key: 'dlpControls.rules', label: 'DLP Rules', columns: ['name', 'patternType', 'action', 'severity', 'enabled'] },
        { key: 'dlpViolations.recentViolations', label: 'Recent DLP Violations', columns: ['agentId', 'ruleId', 'actionTaken', 'direction', 'matchContext', 'timestamp'] },
      ]),

      detailTab === 'cc4' && renderSection(data.cc4_monitoringActivities, [
        { key: 'guardrailRules.rules', label: 'Guardrail Rules', columns: ['name', 'type', 'action', 'severity', 'enabled'] },
        { key: 'interventions.recentInterventions', label: 'Recent Interventions', columns: ['agentId', 'type', 'reason', 'action', 'timestamp'] },
      ]),

      detailTab === 'cc5' && renderSection(data.cc5_controlActivities, [
        { key: 'approvalWorkflows.recentRequests', label: 'Approval Requests', columns: ['agentId', 'toolId', 'status', 'requestedAt', 'resolvedBy', 'reason'] },
        { key: 'escalations.escalations', label: 'Escalations', columns: ['agentId', 'type', 'priority', 'status', 'reason', 'timestamp'] },
      ]),

      detailTab === 'cc6' && renderSection(data.cc6_logicalAccess, [
        { key: 'vaultManagement.secrets', label: 'Vault Secrets', columns: ['key', 'agentId', 'expired', 'expiresAt', 'createdAt'] },
        { key: 'vaultManagement.auditLog.recentAccesses', label: 'Vault Access Log', columns: ['action', 'key', 'agentId', 'timestamp'] },
        { key: 'sessionManagement.agentSessions', label: 'Session Summary', columns: ['agentId', 'sessionCount', 'lastSession'] },
      ]),

      detailTab === 'cc7' && h(Fragment, null,
        h('h4', { style: _sectionTitle }, 'Task Pipeline Status'),
        renderKVTable(data.cc7_systemOperations?.taskPipeline?.byStatus || {}),
        h('h4', { style: _sectionTitle }, 'Task Queue Status'),
        renderKVTable(data.cc7_systemOperations?.taskQueue?.byStatus || {}),
        renderTableFromData(data.cc7_systemOperations, 'conversationMetrics.byAgent', 'Conversation Metrics', ['agentId', 'total', 'completed', 'completionRate']),
      ),

      detailTab === 'cc8' && renderSection(data.cc8_changeManagement, [
        { key: 'actionJournal.byType', label: 'Actions by Type', columns: ['actionType', 'total', 'reversed', 'rollbackRate'], isArray: true },
        { key: 'actionJournal.recentActions', label: 'Recent Journal Actions', columns: ['agentId', 'toolName', 'actionType', 'reversible', 'reversed', 'timestamp'] },
        { key: 'configurationChanges.recentChanges', label: 'Configuration Changes', columns: ['agentId', 'fromState', 'toState', 'changedBy', 'reason', 'timestamp'] },
      ]),

      detailTab === 'cc9' && renderSection(data.cc9_riskMitigation, [
        { key: 'budgetControls.recentAlerts', label: 'Budget Alerts', columns: ['agentId', 'alertType', 'threshold', 'currentValue', 'message', 'timestamp'] },
      ]),

      detailTab === 'findings' && h(Fragment, null,
        h('div', { style: { display: 'flex', gap: 12, marginBottom: 16, fontSize: 13 } },
          h('span', null, 'Pass: ', h('strong', null, findings.filter(f => f.severity === 'pass').length)),
          h('span', null, 'High: ', h('strong', { style: { color: 'var(--danger)' } }, findings.filter(f => f.severity === 'high').length)),
          h('span', null, 'Medium: ', h('strong', { style: { color: 'var(--warning)' } }, findings.filter(f => f.severity === 'medium').length)),
          h('span', null, 'Low: ', h('strong', null, findings.filter(f => f.severity === 'low').length)),
        ),
        findings.filter(f => f.severity === 'pass').length > 0 && h('h4', { style: { fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: 'var(--success)' } }, 'Controls In Place'),
        findings.filter(f => f.severity === 'pass').map((f, i) => h('div', { key: 'p' + i, style: { padding: 12, marginBottom: 8, borderRadius: 'var(--radius, 8px)', background: 'rgba(34,197,94,0.08)', borderLeft: '3px solid var(--success)' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
            h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, 'PASS'),
            f.category && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, f.category)
          ),
          h('span', { style: { fontSize: 13 } }, f.message)
        )),
        findings.filter(f => f.severity !== 'pass' && f.severity !== 'info').length > 0 && h('h4', { style: { fontSize: 13, fontWeight: 600, margin: '16px 0 8px', color: 'var(--warning)' } }, 'Findings & Recommendations'),
        findings.filter(f => f.severity !== 'pass' && f.severity !== 'info').map((f, i) => h('div', { key: 'f' + i, style: { padding: 12, marginBottom: 8, borderRadius: 'var(--radius, 8px)', background: f.severity === 'high' ? 'rgba(239,68,68,0.1)' : f.severity === 'medium' ? 'rgba(234,179,8,0.1)' : 'var(--bg-secondary)', borderLeft: '3px solid ' + (f.severity === 'high' ? 'var(--danger)' : f.severity === 'medium' ? 'var(--warning)' : 'var(--text-muted)') } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
            h('span', { className: 'badge badge-' + (f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'), style: { fontSize: 10 } }, f.severity.toUpperCase()),
            f.category && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, f.category)
          ),
          h('span', { style: { fontSize: 13 } }, f.message)
        )),
        findings.filter(f => f.severity === 'info').map((f, i) => h('div', { key: 'i' + i, style: { padding: 12, marginBottom: 8, borderRadius: 'var(--radius, 8px)', background: 'rgba(59,130,246,0.08)', borderLeft: '3px solid var(--info)' } },
          h('span', { className: 'badge badge-info', style: { fontSize: 10, marginRight: 8 } }, 'INFO'),
          h('span', { style: { fontSize: 13 } }, f.message)
        ))
      )
    );
  }

  function metricCard(value, label) {
    return h('div', { style: _metricCard }, h('div', { style: _metricValue }, value ?? '-'), h('div', { style: _metricLabel }, label));
  }

  function renderKVTable(obj) {
    const entries = Object.entries(obj || {});
    if (entries.length === 0) return h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'No data');
    return h('table', { className: 'data-table', style: { fontSize: 12, marginBottom: 16 } },
      h('thead', null, h('tr', null, h('th', null, 'Key'), h('th', null, 'Value'))),
      h('tbody', null, entries.map(([k, v]) => h('tr', { key: k }, h('td', null, k), h('td', null, String(v)))))
    );
  }

  function resolve(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : null), obj);
  }

  function renderSection(sectionData, tables) {
    if (!sectionData) return h('p', { style: { color: 'var(--text-muted)' } }, 'No data');
    return h(Fragment, null, tables.map(t => renderTableFromData(sectionData, t.key, t.label, t.columns, t.isArray)));
  }

  function renderTableFromData(obj, path, label, columns, isObjArray) {
    var items = resolve(obj, path);
    if (!items) return null;
    if (isObjArray && !Array.isArray(items)) items = Object.entries(items).map(([k, v]) => typeof v === 'object' ? { [columns[0]]: k, ...v } : { [columns[0]]: k, [columns[1]]: v });
    if (!Array.isArray(items) || items.length === 0) return null;
    return h(Fragment, null,
      h('h4', { style: _sectionTitle }, label + ' (' + items.length + ')'),
      h('div', { style: { overflowX: 'auto' } },
        h('table', { className: 'data-table', style: { fontSize: 12 } },
          h('thead', null, h('tr', null, columns.map(c => h('th', { key: c }, c)))),
          h('tbody', null, items.slice(0, 200).map((item, i) => h('tr', { key: i },
            columns.map(c => h('td', { key: c, style: { maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              c === 'agentId' ? agentName(item[c]) : typeof item[c] === 'boolean' ? (item[c] ? 'Yes' : 'No') : String(item[c] ?? '-')
            ))
          )))
        )
      )
    );
  }

  // ─── Main Render ──────────────────────────────────

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' },
      h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Compliance Reporting', h(KnowledgeLink, { page: 'compliance' }), h(HelpButton, { label: 'Compliance Reporting' },
        h('p', null, 'Generate enterprise-grade compliance reports for SOC 2 audits, GDPR data subject access requests, incident response, and access reviews.'),
        h('h4', { style: _h4 }, 'Report Types'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'SOC 2 Type II'), ' — Full Trust Service Criteria report: CC1-CC9 covering control environment, risk assessment, monitoring, access controls, change management, and more.'),
          h('li', null, h('strong', null, 'GDPR DSAR'), ' — Article 15 data subject access report: all personal data processed by a specific agent.'),
          h('li', null, h('strong', null, 'Audit Trail'), ' — SOX-ready unified timeline from tool calls, interventions, DLP violations, approvals, journal actions, and vault accesses.'),
          h('li', null, h('strong', null, 'Incident Report'), ' — Security incident summary: DLP blocks, denied approvals, escalations, reversed actions.'),
          h('li', null, h('strong', null, 'Access Review'), ' — Periodic access review: agent permissions, vault secrets, expired credentials, recommendations.')
        ),
        h('div', { style: _tip }, h('strong', null, 'SOC 2 Tip: '), 'Generate monthly SOC 2 reports and keep the JSON exports. Auditors will want to see continuous monitoring evidence across the audit period.')
      )),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h(orgCtx.Switcher)
      )
    ),
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [['reports', 'Reports'], ['generate', 'Generate']].map(([t, label]) => h('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, label))
    ),
    tab === 'generate' && h('div', { className: 'card' },
      h('div', { className: 'card-body' },
        h('h3', { style: { marginBottom: 16 } }, 'Generate Compliance Report'),
        h('label', { className: 'field-label' }, 'Report Type'),
        h('select', { className: 'input', value: form.type, onChange: e => setForm({ ...form, type: e.target.value }) },
          h('option', { value: 'soc2' }, 'SOC 2 Type II — Full Trust Service Criteria'),
          h('option', { value: 'audit' }, 'Audit Trail — SOX-Ready Timeline'),
          h('option', { value: 'gdpr' }, 'GDPR DSAR — Data Subject Access Report'),
          h('option', { value: 'incident' }, 'Incident Report — Security Events Summary'),
          h('option', { value: 'access-review' }, 'Access Review — Permissions & Secrets Audit')
        ),
        h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' } },
          form.type === 'soc2' && 'Comprehensive SOC 2 Type II report covering all 9 Common Criteria (CC1-CC9). Includes agent inventory, policies, tool usage, DLP violations, interventions, approval workflows, vault access, change management, budget controls, risk scoring, and automated findings.',
          form.type === 'audit' && 'Unified chronological timeline of all auditable events: tool executions, guardrail interventions, DLP violations, approval requests, journal actions, budget alerts, and vault accesses.',
          form.type === 'gdpr' && 'Article 15 Data Subject Access Report for a specific agent. Exports all personal data: tool calls, conversations, messages, memories, sessions, vault accesses, and more.',
          form.type === 'incident' && 'Security incident report: DLP blocks, denied approvals, escalations, budget breaches, reversed actions, and security events.',
          form.type === 'access-review' && 'Periodic access review: agent permissions, vault secrets, expired credentials, SSO status, and actionable recommendations.'
        ),
        !['gdpr', 'access-review'].includes(form.type) && h('div', { style: { display: 'flex', gap: 12, marginTop: 12 } },
          h('div', { style: { flex: 1 } }, h('label', { className: 'field-label' }, 'From'), h('input', { className: 'input', type: 'date', value: form.from, onChange: e => setForm({ ...form, from: e.target.value }) })),
          h('div', { style: { flex: 1 } }, h('label', { className: 'field-label' }, 'To'), h('input', { className: 'input', type: 'date', value: form.to, onChange: e => setForm({ ...form, to: e.target.value }) }))
        ),
        form.type !== 'access-review' && h('div', { style: { marginTop: 8 } },
          h('label', { className: 'field-label' }, form.type === 'gdpr' ? 'Agent (required)' : 'Agent (optional — scope to specific agent)'),
          h('select', { className: 'input', value: form.agentId, onChange: e => setForm({ ...form, agentId: e.target.value }) },
            h('option', { value: '' }, form.type === 'gdpr' ? '-- Select Agent --' : '-- All Agents --'),
            agents.map(a => h('option', { key: a.id, value: a.id }, (a.config?.displayName || a.config?.name || a.name || 'Agent') + (a.config?.identity?.email ? ' (' + a.config.identity.email + ')' : '')))
          )
        ),
        h('button', { className: 'btn btn-primary', style: { marginTop: 16 }, onClick: generate, disabled: generating || (form.type === 'gdpr' && !form.agentId) }, generating ? 'Generating...' : 'Generate Report')
      )
    ),
    tab === 'reports' && h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Title'), h('th', null, 'Type'), h('th', null, 'Status'), h('th', null, 'Generated'), h('th', null, 'By'), h('th', null, 'Actions'))),
        h('tbody', null, reports.length === 0
          ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No reports generated yet. Go to Generate tab to create one.'))
          : reports.map(r => h('tr', { key: r.id, style: { cursor: 'pointer' }, onClick: () => r.status === 'completed' && openDetail(r) },
            h('td', null, h('strong', null, r.title)),
            h('td', null, h('span', { className: typeBadge(r.type), style: { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 } }, typeLabel(r.type))),
            h('td', null, h('span', { className: 'status-badge status-' + (r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'warning') }, r.status)),
            h('td', null, new Date(r.createdAt).toLocaleString()),
            h('td', null, r.data?._generatedByName || r.generatedBy),
            h('td', null, h('div', { style: { display: 'flex', gap: 4 }, onClick: e => e.stopPropagation() },
              r.status === 'completed' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(r.id, 'json'), title: 'Download JSON' }, I.download(), ' JSON'),
              r.status === 'completed' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(r.id, 'csv'), title: 'Download CSV' }, I.download(), ' CSV'),
              r.status === 'completed' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(r.id, 'html'), title: 'Download HTML (full printable report)' }, I.download(), ' HTML'),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: () => deleteReport(r.id), title: 'Delete' }, I.trash())
            ))
          ))
        )
      )
    ),

    // ─── Report Detail Modal ────────────────────────
    detail && h('div', { className: 'modal-overlay', onClick: () => setDetail(null) },
      h('div', { className: 'modal', style: { maxWidth: 1000, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }, onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' },
          h('div', null,
            h('h2', { style: { margin: 0 } }, detail.title),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } },
              typeLabel(detail.type), detail.data?._orgName ? ' \u2022 ' + detail.data._orgName : '', ' \u2022 ', new Date(detail.createdAt).toLocaleString(), ' \u2022 by ', detail.data?._generatedByName || detail.generatedBy
            )
          ),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(detail.id, 'json') }, I.download(), ' JSON'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(detail.id, 'csv') }, I.download(), ' CSV'),
            h('button', { className: 'btn btn-primary btn-sm', onClick: () => download(detail.id, 'html') }, I.download(), ' Full Report (HTML)'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setDetail(null) }, I.x())
          )
        ),
        h('div', { className: 'modal-body', style: { overflow: 'auto', flex: 1 } },
          detail.type === 'soc2' ? renderSOC2Detail(detail.data)
          : detail.type === 'audit' ? renderAuditDetail(detail.data)
          : detail.type === 'incident' ? renderIncidentDetail(detail.data)
          : detail.type === 'access-review' ? renderAccessReviewDetail(detail.data)
          : detail.type === 'gdpr' ? renderGDPRDetail(detail.data)
          : h('pre', { style: { fontSize: 12, overflow: 'auto' } }, JSON.stringify(detail.data, null, 2))
        )
      )
    )
  );

  // ─── Audit Detail ─────────────────────────────────

  function renderAuditDetail(data) {
    if (!data) return null;
    var summary = data.summary || {};
    return h(Fragment, null,
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 } },
        metricCard(summary.totalEvents, 'Total Events'),
        ...Object.entries(summary.bySource || {}).map(([k, v]) => metricCard(v, k))
      ),
      h('h4', { style: _sectionTitle }, 'Events by Category'),
      renderKVTable(summary.byCategory),
      h('h4', { style: _sectionTitle }, 'Events by Agent'),
      renderKVTable(Object.fromEntries(Object.entries(summary.byAgent || {}).map(([k, v]) => [agentName(k), v]))),
      h('h4', { style: _sectionTitle }, 'Timeline (' + (data.timeline?.length || 0) + ' events)'),
      h('div', { style: { overflowX: 'auto' } },
        h('table', { className: 'data-table', style: { fontSize: 12 } },
          h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Source'), h('th', null, 'Category'), h('th', null, 'Agent'), h('th', null, 'Detail'))),
          h('tbody', null, (data.timeline || []).slice(0, 500).map((e, i) => h('tr', { key: i },
            h('td', { style: { whiteSpace: 'nowrap' } }, e.timestamp ? new Date(e.timestamp).toLocaleString() : '-'),
            h('td', null, h('span', { className: 'badge-tag' }, e.source)),
            h('td', null, e.category),
            h('td', null, agentName(e.agentId)),
            h('td', { style: { maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' } }, e.detail)
          )))
        )
      )
    );
  }

  // ─── Incident Detail ──────────────────────────────

  function renderIncidentDetail(data) {
    if (!data) return null;
    var s = data.incidentSummary || {};
    return h(Fragment, null,
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 } },
        metricCard(s.totalIncidents, 'Total Incidents'),
        metricCard(s.dlpViolations, 'DLP Violations'),
        metricCard(s.interventions, 'Interventions'),
        metricCard(s.deniedApprovals, 'Denied Approvals'),
        metricCard(s.escalations, 'Escalations'),
        metricCard(s.budgetBreaches, 'Budget Breaches'),
        metricCard(s.reversedActions, 'Reversed Actions'),
      ),
      renderSimpleTable(data.dlpViolations, 'DLP Violations', ['agent_id', 'rule_id', 'action_taken', 'direction', 'match_context', 'created_at']),
      renderSimpleTable(data.interventions, 'Interventions', ['agent_id', 'type', 'reason', 'action', 'created_at']),
      renderSimpleTable(data.escalations, 'Escalations', ['agent_id', 'type', 'priority', 'status', 'reason', 'created_at']),
      renderSimpleTable(data.reversedActions, 'Reversed Actions', ['agent_id', 'tool_name', 'action_type', 'reversed_by', 'reversed_at', 'created_at']),
    );
  }

  // ─── Access Review Detail ─────────────────────────

  function renderAccessReviewDetail(data) {
    if (!data) return null;
    return h(Fragment, null,
      h('h4', { style: _sectionTitle }, 'Agent Access (' + (data.agentAccess?.length || 0) + ')'),
      h('div', { style: { overflowX: 'auto' } },
        h('table', { className: 'data-table', style: { fontSize: 12 } },
          h('thead', null, h('tr', null, h('th', null, 'Agent'), h('th', null, 'Status'), h('th', null, 'Role'), h('th', null, 'Permissions'), h('th', null, 'Budget'), h('th', null, 'Vault Secrets'), h('th', null, 'Expired'))),
          h('tbody', null, (data.agentAccess || []).map((a, i) => h('tr', { key: i },
            h('td', null, h('strong', null, a.name)), h('td', null, h('span', { className: 'status-badge status-' + (a.status === 'active' ? 'success' : 'neutral') }, a.status)),
            h('td', null, a.role), h('td', null, a.permissionProfile), h('td', null, a.hasBudget ? 'Yes' : 'No'),
            h('td', null, a.vaultSecrets), h('td', null, a.expiredSecrets > 0 ? h('span', { style: { color: 'var(--danger)', fontWeight: 600 } }, a.expiredSecrets) : '0')
          )))
        )
      ),
      h('h4', { style: _sectionTitle }, 'Vault Review'),
      renderKVTable(data.vaultReview),
      (data.recommendations || []).length > 0 && h(Fragment, null,
        h('h4', { style: _sectionTitle }, 'Recommendations (' + data.recommendations.length + ')'),
        data.recommendations.map((r, i) => h('div', { key: i, style: { padding: 10, marginBottom: 8, borderRadius: 6, background: r.severity === 'high' ? 'rgba(239,68,68,0.1)' : r.severity === 'medium' ? 'rgba(234,179,8,0.1)' : 'var(--bg-secondary)', borderLeft: '3px solid ' + (r.severity === 'high' ? 'var(--danger)' : r.severity === 'medium' ? 'var(--warning)' : 'var(--info)'), fontSize: 13 } },
          h('span', { className: 'badge badge-' + (r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warning' : 'info'), style: { marginRight: 8 } }, r.severity.toUpperCase()),
          r.message
        ))
      )
    );
  }

  // ─── GDPR Detail ──────────────────────────────────

  function renderGDPRDetail(data) {
    if (!data) return null;
    return h(Fragment, null,
      h('h4', { style: _sectionTitle }, 'Data Summary'),
      renderKVTable(data.dataSummary),
      renderSimpleTable(data.toolCalls, 'Tool Calls (' + (data.toolCalls?.length || 0) + ')', ['tool_id', 'tool_name', 'agent_id', 'created_at']),
      renderSimpleTable(data.journalEntries, 'Journal Entries (' + (data.journalEntries?.length || 0) + ')', ['tool_id', 'action_type', 'reversible', 'reversed', 'created_at']),
      renderSimpleTable(data.interventions, 'Interventions (' + (data.interventions?.length || 0) + ')', ['type', 'reason', 'action', 'created_at']),
      renderSimpleTable(data.dlpViolations, 'DLP Violations (' + (data.dlpViolations?.length || 0) + ')', ['rule_id', 'action_taken', 'direction', 'created_at']),
      renderSimpleTable(data.memories, 'Memories (' + (data.memories?.length || 0) + ')', ['key', 'category', 'created_at', 'updated_at']),
    );
  }

  function renderSimpleTable(items, label, columns) {
    if (!items || items.length === 0) return null;
    return h(Fragment, null,
      h('h4', { style: _sectionTitle }, label),
      h('div', { style: { overflowX: 'auto' } },
        h('table', { className: 'data-table', style: { fontSize: 12 } },
          h('thead', null, h('tr', null, columns.map(c => h('th', { key: c }, c)))),
          h('tbody', null, items.slice(0, 200).map((item, i) => h('tr', { key: i },
            columns.map(c => h('td', { key: c, style: { maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              c === 'agent_id' || c === 'agentId' ? agentName(item[c]) : String(item[c] ?? '-')
            ))
          )))
        )
      )
    );
  }
}
