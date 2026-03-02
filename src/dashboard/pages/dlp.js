import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';

export function DLPPage() {
  const { toast } = useApp();
  const [rules, setRules] = useState([]);
  const [violations, setViolations] = useState([]);
  const [tab, setTab] = useState('rules');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', orgId: getOrgId(), patternType: 'regex', pattern: '', action: 'block', appliesTo: 'both', severity: 'high', enabled: true });
  const [testContent, setTestContent] = useState('');
  const [testResults, setTestResults] = useState(null);

  const [agents, setAgents] = useState([]);

  const load = () => {
    engineCall('/dlp/rules?orgId=' + getOrgId()).then(d => setRules(d.rules || [])).catch(() => {});
    engineCall('/dlp/violations?orgId=' + getOrgId() + '&limit=100').then(d => setViolations(d.violations || [])).catch(() => {});
    engineCall('/agents?orgId=' + getOrgId()).then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(load, []);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  const createRule = async () => {
    try { await engineCall('/dlp/rules', { method: 'POST', body: JSON.stringify(form) }); toast('DLP rule created', 'success'); setShowModal(false); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const deleteRule = async (id) => {
    try { await engineCall('/dlp/rules/' + id, { method: 'DELETE' }); toast('Rule deleted', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const testScan = async () => {
    if (!testContent) return;
    try { const r = await engineCall('/dlp/scan', { method: 'POST', body: JSON.stringify({ orgId: getOrgId(), content: testContent }) }); setTestResults(r); } catch (e) { toast(e.message, 'error'); }
  };

  const severityColor = (s) => s === 'critical' ? 'var(--danger)' : s === 'high' ? 'var(--warning)' : s === 'medium' ? 'var(--info)' : 'var(--text-muted)';

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Data Loss Prevention', h(HelpButton, { label: 'Data Loss Prevention' },
      h('p', null, 'DLP prevents agents from accidentally leaking sensitive data like API keys, passwords, credit card numbers, or personal information in emails and tool outputs.'),
      h('h4', { style: _h4 }, 'How it works'),
      h('ul', { style: _ul },
        h('li', null, h('strong', null, 'Rules'), ' — Define patterns (regex, keywords, or PII types) to detect sensitive data.'),
        h('li', null, h('strong', null, 'Actions'), ' — Block, redact, warn, or log when a match is found.'),
        h('li', null, h('strong', null, 'Violations'), ' — Every detection is logged for audit and investigation.')
      ),
      h('h4', { style: _h4 }, 'Built-in PII types'),
      h('ul', { style: _ul },
        h('li', null, 'email, ssn, credit_card, phone, api_key, aws_key')
      ),
      h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use the Test tab to validate your rules against sample content before deploying them.')
    )), h('button', { className: 'btn btn-primary', onClick: () => setShowModal(true) }, I.plus(), ' Add Rule')),
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      ['rules', 'violations', 'test'].map(t => h('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, t.charAt(0).toUpperCase() + t.slice(1)))
    ),
    tab === 'rules' && h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Type'), h('th', null, 'Pattern'), h('th', null, 'Action'), h('th', null, 'Severity'), h('th', null, 'Actions'))),
        h('tbody', null, rules.length === 0
          ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No DLP rules configured'))
          : rules.map(r => h('tr', { key: r.id },
            h('td', null, h('strong', null, r.name)),
            h('td', null, h('span', { className: 'badge-tag' }, r.patternType)),
            h('td', null, h('code', { style: { fontSize: 11 } }, r.pattern.substring(0, 40) + (r.pattern.length > 40 ? '...' : ''))),
            h('td', null, h('span', { className: 'status-badge status-' + (r.action === 'block' ? 'error' : r.action === 'redact' ? 'warning' : 'info') }, r.action)),
            h('td', null, h('span', { style: { color: severityColor(r.severity), fontWeight: 600 } }, r.severity)),
            h('td', null, h('button', { className: 'btn btn-ghost btn-sm', onClick: () => deleteRule(r.id) }, I.trash()))
          ))
        )
      )
    ),
    tab === 'violations' && h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Agent'), h('th', null, 'Tool'), h('th', null, 'Action'), h('th', null, 'Direction'), h('th', null, 'Match'))),
        h('tbody', null, violations.length === 0
          ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No violations recorded'))
          : violations.map(v => h('tr', { key: v.id },
            h('td', null, new Date(v.createdAt).toLocaleString()),
            h('td', null, renderAgentBadge(v.agentId, agentData)),
            h('td', null, v.toolId),
            h('td', null, h('span', { className: 'status-badge status-' + (v.actionTaken === 'blocked' ? 'error' : v.actionTaken === 'redacted' ? 'warning' : 'info') }, v.actionTaken)),
            h('td', null, v.direction),
            h('td', null, h('code', { style: { fontSize: 11 } }, v.matchContext || '-'))
          ))
        )
      )
    ),
    tab === 'test' && h('div', { className: 'card' },
      h('div', { className: 'card-body' },
        h('h3', { style: { marginBottom: 12, display: 'flex', alignItems: 'center' } }, 'Test DLP Scan', h(HelpButton, { label: 'Test DLP Scan' },
          h('p', null, 'Paste any content here to test it against all active DLP rules. Shows which rules match and how many times.'),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Test with realistic data samples before deploying new rules to avoid false positives.')
        )),
        h('textarea', { className: 'input', style: { minHeight: 100, marginBottom: 12 }, placeholder: 'Paste content to test against DLP rules...', value: testContent, onChange: (e) => setTestContent(e.target.value) }),
        h('button', { className: 'btn btn-primary', onClick: testScan }, 'Run Scan'),
        testResults && h('div', { style: { marginTop: 16 } },
          h('h4', null, 'Results: ' + (testResults.matches?.length || 0) + ' matches'),
          (testResults.matches || []).map((m, i) => h('div', { key: i, style: { padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, marginTop: 8 } },
            h('strong', null, m.ruleName), ' \u2014 ', m.matchCount, ' matches'
          ))
        )
      )
    ),
    showModal && h('div', { className: 'modal-overlay', onClick: () => setShowModal(false) },
      h('div', { className: 'modal', onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' }, h('h2', null, 'Create DLP Rule'), h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setShowModal(false) }, I.x())),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) }),
          h('label', { className: 'field-label' }, 'Pattern Type'),
          h('select', { className: 'input', value: form.patternType, onChange: e => setForm({ ...form, patternType: e.target.value }) }, h('option', { value: 'regex' }, 'Regex'), h('option', { value: 'keyword' }, 'Keyword'), h('option', { value: 'pii_type' }, 'PII Type')),
          h('label', { className: 'field-label' }, form.patternType === 'pii_type' ? 'PII Type (email, ssn, credit_card, phone, api_key, aws_key)' : 'Pattern'),
          h('input', { className: 'input', value: form.pattern, onChange: e => setForm({ ...form, pattern: e.target.value }) }),
          h('label', { className: 'field-label' }, 'Action'),
          h('select', { className: 'input', value: form.action, onChange: e => setForm({ ...form, action: e.target.value }) }, h('option', { value: 'block' }, 'Block'), h('option', { value: 'redact' }, 'Redact'), h('option', { value: 'warn' }, 'Warn'), h('option', { value: 'log' }, 'Log')),
          h('label', { className: 'field-label' }, 'Severity'),
          h('select', { className: 'input', value: form.severity, onChange: e => setForm({ ...form, severity: e.target.value }) }, h('option', { value: 'critical' }, 'Critical'), h('option', { value: 'high' }, 'High'), h('option', { value: 'medium' }, 'Medium'), h('option', { value: 'low' }, 'Low'))
        ),
        h('div', { className: 'modal-footer' }, h('button', { className: 'btn btn-ghost', onClick: () => setShowModal(false) }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: createRule }, 'Create Rule'))
      )
    )
  );
}
