import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';
import { useOrgContext } from '../components/org-switcher.js';

export function DLPPage() {
  const { toast } = useApp();
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();

  const [rules, setRules] = useState([]);
  const [violations, setViolations] = useState([]);
  const [tab, setTab] = useState('rules');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [viewRule, setViewRule] = useState(null);
  const defaultForm = { name: '', orgId: effectiveOrgId, patternType: 'regex', pattern: '', action: 'block', appliesTo: 'both', severity: 'high', enabled: true };
  const [form, setForm] = useState(defaultForm);
  const [testContent, setTestContent] = useState('');
  const [testResults, setTestResults] = useState(null);
  const [agents, setAgents] = useState([]);
  const [packs, setPacks] = useState({});
  const [selectedPacks, setSelectedPacks] = useState({});
  const [applyingPacks, setApplyingPacks] = useState(false);
  const [packOverwrite, setPackOverwrite] = useState(false);
  const [expandedPack, setExpandedPack] = useState(null);
  const [packDetails, setPackDetails] = useState({});

  const load = () => {
    engineCall('/dlp/rules?orgId=' + effectiveOrgId).then(d => setRules(d.rules || [])).catch(() => {});
    engineCall('/dlp/violations?orgId=' + effectiveOrgId + '&limit=100').then(d => setViolations(d.violations || [])).catch(() => {});
    engineCall('/agents?orgId=' + effectiveOrgId).then(d => setAgents(d.agents || [])).catch(() => {});
    engineCall('/dlp/rule-packs').then(d => setPacks(d.packs || {})).catch(() => {});
  };
  useEffect(load, [effectiveOrgId]);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  const openCreate = () => { setEditingRule(null); setForm({ ...defaultForm, orgId: effectiveOrgId }); setShowModal(true); };
  const openEdit = (r) => { setEditingRule(r); setForm({ name: r.name, orgId: r.orgId || effectiveOrgId, patternType: r.patternType, pattern: r.pattern, action: r.action, appliesTo: r.appliesTo || 'both', severity: r.severity, enabled: r.enabled !== false }); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingRule(null); };

  const saveRule = async () => {
    try {
      if (editingRule) {
        await engineCall('/dlp/rules/' + editingRule.id, { method: 'PUT', body: JSON.stringify(form) });
        toast('DLP rule updated', 'success');
      } else {
        await engineCall('/dlp/rules', { method: 'POST', body: JSON.stringify(form) });
        toast('DLP rule created', 'success');
      }
      closeModal(); load();
    } catch (e) { toast(e.message, 'error'); }
  };
  const deleteRule = async (id) => {
    try { await engineCall('/dlp/rules/' + id, { method: 'DELETE' }); toast('Rule deleted', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const toggleRule = async (r) => {
    try {
      await engineCall('/dlp/rules/' + r.id, { method: 'PUT', body: JSON.stringify({ enabled: !r.enabled }) });
      toast(r.enabled ? 'Rule disabled' : 'Rule enabled', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };
  const togglePack = (id) => setSelectedPacks(p => ({ ...p, [id]: !p[id] }));
  const selectAllPacks = () => { const all = {}; Object.keys(packs).forEach(k => all[k] = true); setSelectedPacks(all); };
  const selectNonePacks = () => setSelectedPacks({});
  const applySelectedPacks = async () => {
    const ids = Object.entries(selectedPacks).filter(([,v]) => v).map(([k]) => k);
    if (ids.length === 0) return toast('Select at least one rule pack', 'error');
    setApplyingPacks(true);
    try {
      const r = await engineCall('/dlp/rule-packs/apply', { method: 'POST', body: JSON.stringify({ orgId: effectiveOrgId, packIds: ids, overwrite: packOverwrite }) });
      toast(r.created + ' rules created' + (r.skipped ? ', ' + r.skipped + ' skipped (already exist)' : ''), 'success');
      load();
      setSelectedPacks({});
    } catch (e) { toast(e.message, 'error'); }
    setApplyingPacks(false);
  };
  const loadPackDetail = async (id) => {
    if (expandedPack === id) { setExpandedPack(null); return; }
    if (!packDetails[id]) {
      try { const d = await engineCall('/dlp/rule-packs/' + id); setPackDetails(p => ({ ...p, [id]: d })); } catch {}
    }
    setExpandedPack(id);
  };
  const testScan = async () => {
    if (!testContent) return;
    try { const r = await engineCall('/dlp/scan', { method: 'POST', body: JSON.stringify({ orgId: effectiveOrgId, content: testContent }) }); setTestResults(r); } catch (e) { toast(e.message, 'error'); }
  };

  const severityColor = (s) => s === 'critical' ? 'var(--danger)' : s === 'high' ? 'var(--warning)' : s === 'medium' ? 'var(--info)' : 'var(--text-muted)';

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Data Loss Prevention', h(KnowledgeLink, { page: 'dlp' }), h(HelpButton, { label: 'Data Loss Prevention' },
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
    )),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h(orgCtx.Switcher),
        h('button', { className: 'btn btn-primary', onClick: openCreate }, I.plus(), ' Add Rule')
      )
    ),
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [['rules','Rules'], ['rule-packs','Rule Packs'], ['violations','Violations'], ['test','Test']].map(([t,label]) => h('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, label))
    ),
    tab === 'rules' && h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Type'), h('th', null, 'Pattern'), h('th', null, 'Action'), h('th', null, 'Severity'), h('th', null, 'Enabled'), h('th', null, 'Actions'))),
        h('tbody', null, rules.length === 0
          ? h('tr', null, h('td', { colSpan: 7, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No DLP rules configured'))
          : rules.map(r => h('tr', { key: r.id, style: { cursor: 'pointer' }, onClick: () => setViewRule(r) },
            h('td', null, h('strong', null, r.name)),
            h('td', null, h('span', { className: 'badge-tag' }, r.patternType)),
            h('td', null, h('code', { style: { fontSize: 11 } }, r.pattern.substring(0, 40) + (r.pattern.length > 40 ? '...' : ''))),
            h('td', null, h('span', { className: 'status-badge status-' + (r.action === 'block' ? 'error' : r.action === 'redact' ? 'warning' : 'info') }, r.action)),
            h('td', null, h('span', { style: { color: severityColor(r.severity), fontWeight: 600 } }, r.severity)),
            h('td', { onClick: e => e.stopPropagation() }, h('button', { className: 'btn btn-ghost btn-sm', onClick: () => toggleRule(r), title: r.enabled !== false ? 'Disable' : 'Enable' },
              h('span', { className: 'status-badge ' + (r.enabled !== false ? 'status-success' : 'status-neutral') }, r.enabled !== false ? 'On' : 'Off')
            )),
            h('td', { onClick: e => e.stopPropagation() },
              h('div', { style: { display: 'flex', gap: 4 } },
                h('button', { className: 'btn btn-ghost btn-sm', onClick: () => openEdit(r), title: 'Edit' }, I.edit()),
                h('button', { className: 'btn btn-ghost btn-sm', onClick: () => deleteRule(r.id), title: 'Delete' }, I.trash())
              )
            )
          ))
        )
      )
    ),
    tab === 'rule-packs' && h('div', null,
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { padding: 20 } },
          h('h3', { style: { margin: '0 0 4px', fontSize: 15, fontWeight: 600 } }, 'Enterprise Rule Packs'),
          h('p', { style: { margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' } }, 'Select rule packs to apply as default rules for this organization. Rules are applied instantly to all running agents.'),
          h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' } },
            h('button', { className: 'btn btn-ghost btn-sm', onClick: selectAllPacks }, 'Select All'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: selectNonePacks }, 'Clear'),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto', cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: packOverwrite, onChange: e => setPackOverwrite(e.target.checked) }),
              'Overwrite existing rules with same name'
            ),
            h('button', { className: 'btn btn-primary', onClick: applySelectedPacks, disabled: applyingPacks }, applyingPacks ? 'Applying...' : 'Apply Selected Packs')
          ),
          h('div', { style: { display: 'grid', gap: 12 } },
            Object.entries(packs).map(([id, pack]) => h('div', { key: id, style: { border: '1px solid ' + (selectedPacks[id] ? 'var(--accent)' : 'var(--border)'), borderRadius: 'var(--radius, 8px)', padding: 16, background: selectedPacks[id] ? 'var(--accent-soft, rgba(59,130,246,0.08))' : 'var(--bg-secondary)', transition: 'all 0.15s ease', cursor: 'pointer' }, onClick: () => togglePack(id) },
              h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 12 } },
                h('input', { type: 'checkbox', checked: !!selectedPacks[id], onChange: () => togglePack(id), onClick: e => e.stopPropagation(), style: { marginTop: 3, flexShrink: 0 } }),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                    h('strong', { style: { fontSize: 14 } }, pack.label),
                    h('span', { className: 'badge-tag', style: { fontSize: 11 } }, pack.ruleCount + ' rules'),
                    (pack.categories || []).map(c => h('span', { key: c, className: 'badge badge-neutral', style: { fontSize: 10, padding: '1px 6px' } }, c))
                  ),
                  h('p', { style: { margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 } }, pack.description)
                ),
                h('button', { className: 'btn btn-ghost btn-sm', onClick: e => { e.stopPropagation(); loadPackDetail(id); }, title: 'Preview rules' }, expandedPack === id ? '\u25B2' : I.chevronDown())
              ),
              expandedPack === id && packDetails[id] && h('div', { style: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' } },
                h('table', { className: 'data-table', style: { fontSize: 12 } },
                  h('thead', null, h('tr', null, h('th', null, 'Rule'), h('th', null, 'Type'), h('th', null, 'Action'), h('th', null, 'Severity'), h('th', null, 'Description'))),
                  h('tbody', null, (packDetails[id].rules || []).map((r, i) => h('tr', { key: i },
                    h('td', null, h('strong', null, r.name)),
                    h('td', null, h('span', { className: 'badge-tag' }, r.patternType)),
                    h('td', null, h('span', { className: 'status-badge status-' + (r.action === 'block' ? 'error' : r.action === 'redact' ? 'warning' : 'info') }, r.action)),
                    h('td', null, h('span', { style: { color: severityColor(r.severity), fontWeight: 600 } }, r.severity)),
                    h('td', { style: { color: 'var(--text-muted)' } }, r.description || '-')
                  )))
                )
              )
            ))
          )
        )
      ),
      rules.length > 0 && h('div', { className: 'card', style: { padding: 16 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
          h('h4', { style: { margin: 0, fontSize: 14 } }, 'Currently Active: ' + rules.length + ' rules for this org'),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } },
            'Critical: ' + rules.filter(r => r.severity === 'critical').length +
            ' \u2022 High: ' + rules.filter(r => r.severity === 'high').length +
            ' \u2022 Medium: ' + rules.filter(r => r.severity === 'medium').length +
            ' \u2022 Low: ' + rules.filter(r => r.severity === 'low').length
          )
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
    showModal && h('div', { className: 'modal-overlay', onClick: closeModal },
      h('div', { className: 'modal', onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' }, h('h2', null, editingRule ? 'Edit DLP Rule' : 'Create DLP Rule'), h('button', { className: 'btn btn-ghost btn-icon', onClick: closeModal }, I.x())),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) }),
          h('label', { className: 'field-label' }, 'Pattern Type'),
          h('select', { className: 'input', value: form.patternType, onChange: e => setForm({ ...form, patternType: e.target.value }) }, h('option', { value: 'regex' }, 'Regex'), h('option', { value: 'keyword' }, 'Keyword'), h('option', { value: 'pii_type' }, 'PII Type')),
          h('label', { className: 'field-label' }, form.patternType === 'pii_type' ? 'PII Type (email, ssn, credit_card, phone, api_key, aws_key)' : 'Pattern'),
          h('input', { className: 'input', value: form.pattern, onChange: e => setForm({ ...form, pattern: e.target.value }) }),
          h('label', { className: 'field-label' }, 'Action'),
          h('select', { className: 'input', value: form.action, onChange: e => setForm({ ...form, action: e.target.value }) }, h('option', { value: 'block' }, 'Block'), h('option', { value: 'redact' }, 'Redact'), h('option', { value: 'warn' }, 'Warn'), h('option', { value: 'log' }, 'Log')),
          h('label', { className: 'field-label' }, 'Severity'),
          h('select', { className: 'input', value: form.severity, onChange: e => setForm({ ...form, severity: e.target.value }) }, h('option', { value: 'critical' }, 'Critical'), h('option', { value: 'high' }, 'High'), h('option', { value: 'medium' }, 'Medium'), h('option', { value: 'low' }, 'Low')),
          h('label', { className: 'field-label' }, 'Applies To'),
          h('select', { className: 'input', value: form.appliesTo, onChange: e => setForm({ ...form, appliesTo: e.target.value }) }, h('option', { value: 'both' }, 'Both'), h('option', { value: 'inbound' }, 'Inbound'), h('option', { value: 'outbound' }, 'Outbound')),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: form.enabled, onChange: e => setForm({ ...form, enabled: e.target.checked }) }),
            'Enabled'
          )
        ),
        h('div', { className: 'modal-footer' }, h('button', { className: 'btn btn-ghost', onClick: closeModal }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: saveRule }, editingRule ? 'Save Changes' : 'Create Rule'))
      )
    ),
    viewRule && h('div', { className: 'modal-overlay', onClick: () => setViewRule(null) },
      h('div', { className: 'modal', style: { maxWidth: 600 }, onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Rule Details'),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { className: 'btn btn-ghost btn-sm', onClick: () => { setViewRule(null); openEdit(viewRule); } }, I.edit(), ' Edit'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setViewRule(null) }, I.x())
          )
        ),
        h('div', { className: 'modal-body' },
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13, marginBottom: 16 } },
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Name'), h('div', { style: { fontWeight: 600, fontSize: 15 } }, viewRule.name)),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'ID'), h('code', { style: { fontSize: 11 } }, viewRule.id)),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Pattern Type'), h('span', { className: 'badge-tag' }, viewRule.patternType)),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Action'), h('span', { className: 'status-badge status-' + (viewRule.action === 'block' ? 'error' : viewRule.action === 'redact' ? 'warning' : 'info') }, viewRule.action)),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Severity'), h('span', { style: { color: severityColor(viewRule.severity), fontWeight: 600 } }, viewRule.severity)),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Applies To'), viewRule.appliesTo || 'both'),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Status'), h('span', { className: 'status-badge ' + (viewRule.enabled !== false ? 'status-success' : 'status-neutral') }, viewRule.enabled !== false ? 'Enabled' : 'Disabled')),
            h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Organization'), h('code', { style: { fontSize: 11 } }, viewRule.orgId || '-'))
          ),
          h('div', { style: { marginBottom: 16 } },
            h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 } }, 'Pattern'),
            h('pre', { style: { background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, viewRule.pattern)
          ),
          viewRule.description && h('div', { style: { marginBottom: 16 } },
            h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 } }, 'Description'),
            h('div', { style: { fontSize: 13 } }, viewRule.description)
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 12, color: 'var(--text-muted)' } },
            h('div', null, 'Created: ', viewRule.createdAt ? new Date(viewRule.createdAt).toLocaleString() : '-'),
            h('div', null, 'Updated: ', viewRule.updatedAt ? new Date(viewRule.updatedAt).toLocaleString() : '-')
          )
        )
      )
    )
  );
}
