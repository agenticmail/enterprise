import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

export function CompliancePage() {
  const { toast } = useApp();
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState('reports');
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ type: 'soc2', orgId: getOrgId(), agentId: '', from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });

  const [agents, setAgents] = useState([]);

  const load = () => {
    engineCall('/compliance/reports?orgId=' + getOrgId()).then(d => setReports(d.reports || [])).catch(() => {});
    engineCall('/agents?orgId=' + getOrgId()).then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(load, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const endpoint = '/compliance/reports/' + form.type;
      const body = form.type === 'gdpr'
        ? { orgId: form.orgId, agentId: form.agentId }
        : { orgId: form.orgId, dateRange: { from: form.from, to: form.to }, agentIds: form.agentId ? [form.agentId] : undefined };
      await engineCall(endpoint, { method: 'POST', body: JSON.stringify(body) });
      toast('Report generated', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    setGenerating(false);
  };

  const download = (id, format) => {
    window.open('/api/engine/compliance/reports/' + id + '/download?format=' + format, '_blank');
  };

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Compliance Reporting', h(KnowledgeLink, { page: 'compliance' }), h(HelpButton, { label: 'Compliance Reporting' },
      h('p', null, 'Generate and manage compliance reports for regulatory frameworks. Supports SOC2 summaries, GDPR data exports, and audit summaries.'),
      h('h4', { style: _h4 }, 'Report types'),
      h('ul', { style: _ul },
        h('li', null, h('strong', null, 'SOC2 Summary'), ' — Documents security controls, access patterns, and policy enforcement for SOC2 auditors.'),
        h('li', null, h('strong', null, 'GDPR Export'), ' — Generates a data subject access report for a specific agent, showing all personal data processed.'),
        h('li', null, h('strong', null, 'Audit Summary'), ' — Aggregated view of all administrative actions over a date range.')
      ),
      h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Generate reports before compliance audits. Download in JSON for programmatic processing or CSV for spreadsheet review.')
    ))),
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      ['reports', 'generate'].map(t => h('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, t.charAt(0).toUpperCase() + t.slice(1)))
    ),
    tab === 'generate' && h('div', { className: 'card' },
      h('div', { className: 'card-body' },
        h('h3', { style: { marginBottom: 16, display: 'flex', alignItems: 'center' } }, 'Generate Report', h(HelpButton, { label: 'Generate Report' },
          h('p', null, 'Create a new compliance report. Select the report type, date range, and optionally scope to a specific agent.'),
          h('ul', { style: _ul },
            h('li', null, 'SOC2 and Audit reports use a date range to scope the data.'),
            h('li', null, 'GDPR exports require selecting a specific agent.'),
            h('li', null, 'Reports are generated asynchronously and appear in the Reports tab when complete.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'For SOC2 audits, generate monthly reports to maintain a continuous compliance record.')
        )),
        h('label', { className: 'field-label' }, 'Report Type'),
        h('select', { className: 'input', value: form.type, onChange: e => setForm({ ...form, type: e.target.value }) }, h('option', { value: 'soc2' }, 'SOC2 Summary'), h('option', { value: 'gdpr' }, 'GDPR Export'), h('option', { value: 'audit' }, 'Audit Summary')),
        form.type !== 'gdpr' && h('div', { style: { display: 'flex', gap: 12, marginTop: 8 } },
          h('div', { style: { flex: 1 } }, h('label', { className: 'field-label' }, 'From'), h('input', { className: 'input', type: 'date', value: form.from, onChange: e => setForm({ ...form, from: e.target.value }) })),
          h('div', { style: { flex: 1 } }, h('label', { className: 'field-label' }, 'To'), h('input', { className: 'input', type: 'date', value: form.to, onChange: e => setForm({ ...form, to: e.target.value }) }))
        ),
        (form.type === 'gdpr' || form.type === 'audit') && h('div', { style: { marginTop: 8 } },
          h('label', { className: 'field-label' }, form.type === 'gdpr' ? 'Agent (required)' : 'Agent (optional)'),
          h('select', { className: 'input', value: form.agentId, onChange: e => setForm({ ...form, agentId: e.target.value }) },
            h('option', { value: '' }, form.type === 'gdpr' ? '-- Select Agent --' : '-- All Agents --'),
            agents.map(a => h('option', { key: a.id, value: a.id }, (a.config?.displayName || a.config?.name || a.name || 'Agent') + (a.config?.email?.address ? ' (' + a.config.email.address + ')' : '')))
          )
        ),
        h('button', { className: 'btn btn-primary', style: { marginTop: 16 }, onClick: generate, disabled: generating }, generating ? 'Generating...' : 'Generate Report')
      )
    ),
    tab === 'reports' && h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Title'), h('th', null, 'Type'), h('th', null, 'Status'), h('th', null, 'Generated'), h('th', null, 'By'), h('th', null, 'Actions'))),
        h('tbody', null, reports.length === 0
          ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No reports generated yet. Go to Generate tab to create one.'))
          : reports.map(r => h('tr', { key: r.id },
            h('td', null, h('strong', null, r.title)),
            h('td', null, h('span', { className: 'badge-tag' }, r.type.toUpperCase())),
            h('td', null, h('span', { className: 'status-badge status-' + (r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'warning') }, r.status)),
            h('td', null, new Date(r.createdAt).toLocaleString()),
            h('td', null, r.generatedBy),
            h('td', null, r.status === 'completed' && h('div', { style: { display: 'flex', gap: 4 } },
              h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(r.id, 'json') }, I.download(), ' JSON'),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: () => download(r.id, 'csv') }, I.download(), ' CSV')
            ))
          ))
        )
      )
    )
  );
}
