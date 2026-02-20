import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';

export function CompliancePage() {
  const { toast } = useApp();
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState('reports');
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ type: 'soc2', orgId: 'default', agentId: '', from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });

  const [agents, setAgents] = useState([]);

  const load = () => {
    engineCall('/compliance/reports?orgId=default').then(d => setReports(d.reports || [])).catch(() => {});
    engineCall('/agents?orgId=default').then(d => setAgents(d.agents || [])).catch(() => {});
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

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', null, 'Compliance Reporting')),
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      ['reports', 'generate'].map(t => h('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, t.charAt(0).toUpperCase() + t.slice(1)))
    ),
    tab === 'generate' && h('div', { className: 'card' },
      h('div', { className: 'card-body' },
        h('h3', { style: { marginBottom: 16 } }, 'Generate Report'),
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
