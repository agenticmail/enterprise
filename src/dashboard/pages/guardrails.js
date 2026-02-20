import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, buildAgentEmailMap, resolveAgentEmail, buildAgentDataMap, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';

// ─── Constants ──────────────────────────────────────────

var POLICY_CATEGORIES = [
  { value: 'code_of_conduct', label: 'Code of Conduct', color: '#6366f1' },
  { value: 'communication', label: 'Communication', color: '#0ea5e9' },
  { value: 'data_handling', label: 'Data Handling', color: '#f59e0b' },
  { value: 'brand_voice', label: 'Brand Voice', color: '#ec4899' },
  { value: 'security', label: 'Security', color: '#ef4444' },
  { value: 'escalation', label: 'Escalation', color: '#8b5cf6' },
  { value: 'custom', label: 'Custom', color: '#64748b' },
];

var ENFORCEMENT_TYPES = [
  { value: 'mandatory', label: 'Mandatory', color: '#ef4444' },
  { value: 'recommended', label: 'Recommended', color: '#f59e0b' },
  { value: 'informational', label: 'Informational', color: '#0ea5e9' },
];

var MEMORY_CATEGORIES = [
  { value: 'org_knowledge', label: 'Org Knowledge', color: '#6366f1' },
  { value: 'interaction_pattern', label: 'Interaction Pattern', color: '#0ea5e9' },
  { value: 'preference', label: 'Preference', color: '#10b981' },
  { value: 'correction', label: 'Correction', color: '#f59e0b' },
  { value: 'skill', label: 'Skill', color: '#8b5cf6' },
  { value: 'context', label: 'Context', color: '#64748b' },
  { value: 'reflection', label: 'Reflection', color: '#ec4899' },
];

var RULE_CATEGORIES = [
  { value: 'anomaly', label: 'Anomaly Detection' },
  { value: 'policy_compliance', label: 'Policy Compliance' },
  { value: 'communication', label: 'Communication' },
  { value: 'memory', label: 'Memory' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'security', label: 'Security' },
];

var RULE_ACTIONS = [
  { value: 'alert', label: 'Alert', color: '#0ea5e9' },
  { value: 'pause', label: 'Pause Agent', color: '#f59e0b' },
  { value: 'kill', label: 'Kill Agent', color: '#ef4444' },
  { value: 'notify', label: 'Notify Admin', color: '#8b5cf6' },
  { value: 'log', label: 'Log Only', color: '#64748b' },
];

var SEVERITIES = [
  { value: 'low', label: 'Low', color: '#64748b' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'critical', label: 'Critical', color: '#ef4444' },
];

// ─── Helpers ────────────────────────────────────────────

function catColor(cat, list) { var f = list.find(function(c) { return c.value === cat; }); return f ? f.color : '#64748b'; }
function catLabel(cat, list) { var f = list.find(function(c) { return c.value === cat; }); return f ? f.label : cat; }

function Badge(props) {
  return h('span', {
    style: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#fff', background: props.color || '#64748b', whiteSpace: 'nowrap' }
  }, props.children);
}

function StatCard(props) {
  return h('div', { style: { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', minWidth: 120, flex: 1 } },
    h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, props.label),
    h('div', { style: { fontSize: 28, fontWeight: 700, color: props.color || 'var(--text)' } }, props.value),
    props.sub && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, props.sub)
  );
}

function ProgressBar(props) {
  var pct = props.total > 0 ? Math.round((props.value / props.total) * 100) : 0;
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' } },
    h('div', { style: { flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' } },
      h('div', { style: { width: pct + '%', height: '100%', background: props.color || 'var(--brand-color)', borderRadius: 4, transition: 'width 0.3s' } })
    ),
    h('span', { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 40 } }, pct + '%')
  );
}

function EmptyState(props) {
  return h('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
    h('div', { style: { fontSize: 14, marginBottom: 8 } }, props.message || 'No data'),
    props.action && h('button', { className: 'btn btn-primary', onClick: props.action.onClick }, props.action.label)
  );
}

// ─── Main Page ──────────────────────────────────────────

export function GuardrailsPage() {
  var app = useApp();
  var toast = app.toast;
  var tab = useState('overview');
  var activeTab = tab[0];
  var setTab = tab[1];
  var _ag = useState([]);
  var agents = _ag[0]; var setAgents = _ag[1];
  useEffect(function() {
    engineCall('/agents?orgId=default').then(function(d) { setAgents(d.agents || []); }).catch(function() {});
  }, []);

  var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'policies', label: 'Policies' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'memory', label: 'Agent Memory' },
    { id: 'rules', label: 'Rules & Interventions' },
  ];

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', null, 'Guardrails & Intervention')),
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      TABS.map(function(t) { return h('button', { key: t.id, className: 'tab' + (activeTab === t.id ? ' active' : ''), onClick: function() { setTab(t.id); } }, t.label); })
    ),
    activeTab === 'overview' && h(OverviewTab, { agents: agents }),
    activeTab === 'policies' && h(PoliciesTab, null),
    activeTab === 'onboarding' && h(OnboardingTab, { agents: agents }),
    activeTab === 'memory' && h(MemoryTab, { agents: agents }),
    activeTab === 'rules' && h(RulesTab, { agents: agents })
  );
}

// ─── Tab 1: Overview ────────────────────────────────────

function OverviewTab(props) {
  var agents = props.agents || [];
  var emailMap = buildAgentEmailMap(agents);
  var agentData = buildAgentDataMap(agents);
  var app = useApp();
  var toast = app.toast;
  var _int = useState([]);
  var interventions = _int[0]; var setInterventions = _int[1];
  var _stat = useState(null);
  var stats = _stat[0]; var setStats = _stat[1];
  var _pol = useState([]);
  var policies = _pol[0]; var setPolicies = _pol[1];
  var _onb = useState([]);
  var onboardingData = _onb[0]; var setOnboardingData = _onb[1];
  var _aid = useState('');
  var agentIdInput = _aid[0]; var setAgentIdInput = _aid[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];

  var load = function() {
    setLoading(true);
    Promise.all([
      engineCall('/guardrails/interventions?orgId=default&limit=10').catch(function() { return { interventions: [] }; }),
      engineCall('/policies?orgId=default').catch(function() { return { policies: [] }; }),
      engineCall('/onboarding/org/default').catch(function() { return { progress: [] }; }),
    ]).then(function(res) {
      setInterventions(res[0].interventions || []);
      setPolicies(res[1].policies || []);
      setOnboardingData(res[2].progress || []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  var totalAgents = onboardingData.length;
  var onboarded = onboardingData.filter(function(p) { return p.overallStatus === 'completed'; }).length;
  var inProgress = onboardingData.filter(function(p) { return p.overallStatus === 'in_progress'; }).length;
  var policyCount = policies.length;
  var mandatoryCount = policies.filter(function(p) { return p.enforcement === 'mandatory'; }).length;
  var recentInterventions = interventions.length;

  var pauseAgent = function() {
    if (!agentIdInput) { toast('Enter agent ID', 'error'); return; }
    engineCall('/guardrails/pause/' + agentIdInput, { method: 'POST', body: JSON.stringify({ reason: 'Manual pause from dashboard' }) })
      .then(function() { toast('Agent paused', 'success'); setAgentIdInput(''); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var resumeAgent = function(id) {
    engineCall('/guardrails/resume/' + (id || agentIdInput), { method: 'POST', body: JSON.stringify({ reason: 'Manual resume from dashboard' }) })
      .then(function() { toast('Agent resumed', 'success'); setAgentIdInput(''); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var killAgent = function(id) {
    engineCall('/guardrails/kill/' + (id || agentIdInput), { method: 'POST', body: JSON.stringify({ reason: 'Emergency kill from dashboard' }) })
      .then(function() { toast('Agent killed', 'warning'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var typeColor = function(t) { return t === 'kill' ? '#ef4444' : t === 'pause' ? '#f59e0b' : t === 'resume' ? '#10b981' : '#0ea5e9'; };

  return h(Fragment, null,
    // Quick action bar
    h('div', { className: 'card', style: { marginBottom: 16 } },
      h('div', { className: 'card-body', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
        h('select', { className: 'input', style: { flex: 1, maxWidth: 300 }, value: agentIdInput, onChange: function(e) { setAgentIdInput(e.target.value); } },
          h('option', { value: '' }, '-- Select Agent --'),
          agents.map(function(a) { var name = (a.config && a.config.displayName) || (a.config && a.config.name) || a.name || 'Agent'; var email = a.config && a.config.email && a.config.email.address; return h('option', { key: a.id, value: a.id }, name + (email ? ' (' + email + ')' : '')); })
        ),
        h('button', { className: 'btn btn-warning', onClick: pauseAgent }, I.pause(), ' Pause'),
        h('button', { className: 'btn btn-primary', onClick: function() { if (agentIdInput) resumeAgent(agentIdInput); } }, I.play(), ' Resume'),
        h('button', { className: 'btn btn-danger', onClick: function() { if (agentIdInput) killAgent(agentIdInput); } }, I.stop(), ' Kill')
      )
    ),
    // Stat cards
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 } },
      h(StatCard, { label: 'Org Policies', value: policyCount, sub: mandatoryCount + ' mandatory', color: '#6366f1' }),
      h(StatCard, { label: 'Agents Onboarded', value: onboarded + '/' + totalAgents, color: '#10b981' }),
      h(StatCard, { label: 'In Onboarding', value: inProgress, color: '#f59e0b' }),
      h(StatCard, { label: 'Recent Interventions', value: recentInterventions, color: '#ef4444' })
    ),
    // Onboarding progress summary
    onboardingData.length > 0 && h('div', { className: 'card', style: { marginBottom: 16 } },
      h('div', { className: 'card-header' }, h('h3', null, 'Agent Onboarding Status')),
      h('div', { className: 'card-body' },
        onboardingData.slice(0, 8).map(function(ag) {
          var statusColor = ag.overallStatus === 'completed' ? '#10b981' : ag.overallStatus === 'in_progress' ? '#f59e0b' : ag.overallStatus === 'needs_renewal' ? '#ef4444' : '#64748b';
          return h('div', { key: ag.agentId, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' } },
            h('div', { style: { minWidth: 120, fontWeight: 500, fontSize: 13 } }, renderAgentBadge(ag.agentId, agentData)),
            h('div', { style: { flex: 1 } }, h(ProgressBar, { value: ag.acknowledgedPolicies || 0, total: ag.totalPolicies || 1, color: statusColor })),
            h(Badge, { color: statusColor }, ag.overallStatus || 'unknown'),
            h('span', { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 60 } }, (ag.acknowledgedPolicies || 0) + '/' + (ag.totalPolicies || 0))
          );
        })
      )
    ),
    // Recent interventions
    h('div', { className: 'card' },
      h('div', { className: 'card-header' }, h('h3', null, 'Recent Interventions')),
      interventions.length === 0
        ? h(EmptyState, { message: 'No interventions recorded' })
        : h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Agent'), h('th', null, 'Type'), h('th', null, 'Reason'), h('th', null, 'By'), h('th', null, 'Actions'))),
            h('tbody', null, interventions.map(function(r) {
              return h('tr', { key: r.id },
                h('td', null, new Date(r.createdAt).toLocaleString()),
                h('td', null, renderAgentBadge(r.agentId, agentData)),
                h('td', null, h(Badge, { color: typeColor(r.type) }, r.type)),
                h('td', { style: { maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.reason || '-'),
                h('td', null, r.triggeredBy || '-'),
                h('td', null, r.type === 'pause' && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { resumeAgent(r.agentId); } }, 'Resume'))
              );
            }))
          )
    )
  );
}

// ─── Tab 2: Policies ────────────────────────────────────

function PoliciesTab() {
  var app = useApp();
  var toast = app.toast;
  var _pol = useState([]);
  var policies = _pol[0]; var setPolicies = _pol[1];
  var _show = useState(false);
  var showModal = _show[0]; var setShowModal = _show[1];
  var _edit = useState(null);
  var editPolicy = _edit[0]; var setEditPolicy = _edit[1];
  var _exp = useState(null);
  var expanded = _exp[0]; var setExpanded = _exp[1];
  var _form = useState({ orgId: 'default', name: '', category: 'code_of_conduct', description: '', content: '', priority: 0, enforcement: 'mandatory', appliesTo: ['*'], tags: [], enabled: true });
  var form = _form[0]; var setForm = _form[1];

  var load = function() {
    engineCall('/policies?orgId=default').then(function(d) { setPolicies(d.policies || []); }).catch(function() {});
  };
  useEffect(load, []);

  var openCreate = function() {
    setEditPolicy(null);
    setForm({ orgId: 'default', name: '', category: 'code_of_conduct', description: '', content: '', priority: 0, enforcement: 'mandatory', appliesTo: ['*'], tags: [], enabled: true });
    setShowModal(true);
  };
  var openEdit = function(p) {
    setEditPolicy(p);
    setForm({ orgId: p.orgId || 'default', name: p.name, category: p.category, description: p.description || '', content: p.content, priority: p.priority || 0, enforcement: p.enforcement, appliesTo: p.appliesTo || ['*'], tags: p.tags || [], enabled: p.enabled !== false });
    setShowModal(true);
  };
  var save = function() {
    if (!form.name || !form.content) { toast('Name and content are required', 'error'); return; }
    var method = editPolicy ? 'PUT' : 'POST';
    var url = editPolicy ? '/policies/' + editPolicy.id : '/policies';
    engineCall(url, { method: method, body: JSON.stringify(form) })
      .then(function() { toast(editPolicy ? 'Policy updated' : 'Policy created', 'success'); setShowModal(false); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var deletePolicy = function(id) {
    engineCall('/policies/' + id, { method: 'DELETE' })
      .then(function() { toast('Policy deleted', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var applyDefaults = function() {
    engineCall('/policies/templates/apply', { method: 'POST', body: JSON.stringify({ orgId: 'default', createdBy: 'admin' }) })
      .then(function(d) { toast('Applied ' + (d.policies ? d.policies.length : 0) + ' default templates', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var grouped = {};
  policies.forEach(function(p) { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); });

  return h(Fragment, null,
    // Actions
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
      h('button', { className: 'btn btn-primary', onClick: openCreate }, I.plus(), ' Create Policy'),
      h('button', { className: 'btn btn-ghost', onClick: applyDefaults }, I.shield(), ' Apply Default Templates'),
      h('button', { className: 'btn btn-ghost', onClick: load }, I.refresh(), ' Refresh')
    ),
    // Stats
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 16 } },
      h(StatCard, { label: 'Total Policies', value: policies.length }),
      h(StatCard, { label: 'Mandatory', value: policies.filter(function(p) { return p.enforcement === 'mandatory'; }).length, color: '#ef4444' }),
      h(StatCard, { label: 'Recommended', value: policies.filter(function(p) { return p.enforcement === 'recommended'; }).length, color: '#f59e0b' }),
      h(StatCard, { label: 'Categories', value: Object.keys(grouped).length, color: '#6366f1' })
    ),
    // Policy cards grouped by category
    policies.length === 0
      ? h(EmptyState, { message: 'No policies defined yet', action: { label: 'Apply Default Templates', onClick: applyDefaults } })
      : Object.keys(grouped).map(function(cat) {
          return h('div', { key: cat, style: { marginBottom: 20 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
              h(Badge, { color: catColor(cat, POLICY_CATEGORIES) }, catLabel(cat, POLICY_CATEGORIES)),
              h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, grouped[cat].length + ' policies')
            ),
            h('div', { style: { display: 'grid', gap: 8 } },
              grouped[cat].map(function(p) {
                var isExpanded = expanded === p.id;
                return h('div', { key: p.id, className: 'card', style: { cursor: 'pointer' }, onClick: function() { setExpanded(isExpanded ? null : p.id); } },
                  h('div', { className: 'card-body', style: { padding: '12px 16px' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: isExpanded ? 8 : 0 } },
                      h('strong', { style: { flex: 1 } }, p.name),
                      h(Badge, { color: catColor(p.enforcement, ENFORCEMENT_TYPES) }, p.enforcement),
                      p.version > 1 && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'v' + p.version),
                      !p.enabled && h(Badge, { color: '#64748b' }, 'disabled'),
                      h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { e.stopPropagation(); openEdit(p); } }, I.settings()),
                      h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { e.stopPropagation(); deletePolicy(p.id); } }, I.trash())
                    ),
                    p.description && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: isExpanded ? 8 : 0 } }, p.description),
                    isExpanded && h('div', { style: { fontSize: 13, padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)' } }, p.content),
                    isExpanded && h('div', { style: { display: 'flex', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' } },
                      h('span', null, 'Applies to: ' + (p.appliesTo && p.appliesTo[0] === '*' ? 'All agents' : (p.appliesTo || []).join(', '))),
                      h('span', null, 'Priority: ' + (p.priority || 0)),
                      h('span', null, 'Created: ' + new Date(p.createdAt).toLocaleDateString())
                    )
                  )
                );
              })
            )
          );
        }),
    // Create/Edit modal
    showModal && h('div', { className: 'modal-overlay', onClick: function() { setShowModal(false); } },
      h('div', { className: 'modal', style: { maxWidth: 640 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, editPolicy ? 'Edit Policy' : 'Create Policy'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowModal(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'Name'),
          h('input', { className: 'input', value: form.name, onChange: function(e) { setForm(Object.assign({}, form, { name: e.target.value })); } }),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', null,
              h('label', { className: 'field-label' }, 'Category'),
              h('select', { className: 'input', value: form.category, onChange: function(e) { setForm(Object.assign({}, form, { category: e.target.value })); } },
                POLICY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', null,
              h('label', { className: 'field-label' }, 'Enforcement'),
              h('select', { className: 'input', value: form.enforcement, onChange: function(e) { setForm(Object.assign({}, form, { enforcement: e.target.value })); } },
                ENFORCEMENT_TYPES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            )
          ),
          h('label', { className: 'field-label' }, 'Description'),
          h('input', { className: 'input', value: form.description, onChange: function(e) { setForm(Object.assign({}, form, { description: e.target.value })); } }),
          h('label', { className: 'field-label' }, 'Policy Content (Markdown)'),
          h('textarea', { className: 'input', style: { minHeight: 180, fontFamily: 'monospace', fontSize: 13 }, value: form.content, onChange: function(e) { setForm(Object.assign({}, form, { content: e.target.value })); } }),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', null,
              h('label', { className: 'field-label' }, 'Priority (0=highest)'),
              h('input', { className: 'input', type: 'number', value: form.priority, onChange: function(e) { setForm(Object.assign({}, form, { priority: parseInt(e.target.value) || 0 })); } })
            ),
            h('div', null,
              h('label', { className: 'field-label' }, 'Applies To'),
              h('input', { className: 'input', value: (form.appliesTo || []).join(', '), placeholder: '* for all agents, or agent IDs', onChange: function(e) { setForm(Object.assign({}, form, { appliesTo: e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean) })); } })
            )
          ),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
            h('input', { type: 'checkbox', checked: form.enabled, onChange: function(e) { setForm(Object.assign({}, form, { enabled: e.target.checked })); } }),
            'Enabled'
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowModal(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: save }, editPolicy ? 'Update Policy' : 'Create Policy')
        )
      )
    )
  );
}

// ─── Tab 3: Onboarding ─────────────────────────────────

function OnboardingTab(props) {
  var agents = props.agents || [];
  var emailMap = buildAgentEmailMap(agents);
  var agentData = buildAgentDataMap(agents);
  var app = useApp();
  var toast = app.toast;
  var _prog = useState([]);
  var progress = _prog[0]; var setProgress = _prog[1];
  var _sel = useState(null);
  var selected = _sel[0]; var setSelected = _sel[1];
  var _initId = useState('');
  var initAgentId = _initId[0]; var setInitAgentId = _initId[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];

  var load = function() {
    setLoading(true);
    engineCall('/onboarding/org/default').then(function(d) {
      setProgress(d.progress || []);
      setLoading(false);
    }).catch(function() { setLoading(false); });
  };
  useEffect(load, []);

  var initiate = function() {
    if (!initAgentId) { toast('Enter an agent ID', 'error'); return; }
    engineCall('/onboarding/initiate/' + initAgentId, { method: 'POST', body: JSON.stringify({ orgId: 'default' }) })
      .then(function() { toast('Onboarding initiated', 'success'); setInitAgentId(''); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var forceComplete = function(agentId) {
    engineCall('/onboarding/force-complete/' + agentId, { method: 'POST', body: JSON.stringify({ adminId: 'admin' }) })
      .then(function() { toast('Onboarding force-completed', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var checkChanges = function() {
    engineCall('/onboarding/check-changes', { method: 'POST', body: JSON.stringify({ orgId: 'default' }) })
      .then(function(d) {
        var stale = d.staleAgents || [];
        if (stale.length === 0) { toast('All agents up to date', 'success'); }
        else { toast(stale.length + ' agents need re-onboarding', 'warning'); load(); }
      })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var completed = progress.filter(function(p) { return p.overallStatus === 'completed'; }).length;
  var inProg = progress.filter(function(p) { return p.overallStatus === 'in_progress'; }).length;
  var needsRenewal = progress.filter(function(p) { return p.overallStatus === 'needs_renewal'; }).length;
  var notStarted = progress.filter(function(p) { return p.overallStatus === 'not_started'; }).length;

  var statusColor = function(s) { return s === 'completed' ? '#10b981' : s === 'in_progress' ? '#f59e0b' : s === 'needs_renewal' ? '#ef4444' : '#64748b'; };

  return h(Fragment, null,
    // Actions bar
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      h('select', { className: 'input', style: { maxWidth: 250 }, value: initAgentId, onChange: function(e) { setInitAgentId(e.target.value); } },
        h('option', { value: '' }, '-- Select Agent --'),
        agents.map(function(a) { var name = (a.config && a.config.displayName) || (a.config && a.config.name) || a.name || 'Agent'; var email = a.config && a.config.email && a.config.email.address; return h('option', { key: a.id, value: a.id }, name + (email ? ' (' + email + ')' : '')); })
      ),
      h('button', { className: 'btn btn-primary', onClick: initiate }, I.plus(), ' Initiate Onboarding'),
      h('button', { className: 'btn btn-ghost', onClick: checkChanges }, I.shield(), ' Check Policy Changes'),
      h('button', { className: 'btn btn-ghost', onClick: load }, I.refresh(), ' Refresh')
    ),
    // Stats
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 } },
      h(StatCard, { label: 'Completed', value: completed, color: '#10b981' }),
      h(StatCard, { label: 'In Progress', value: inProg, color: '#f59e0b' }),
      h(StatCard, { label: 'Needs Renewal', value: needsRenewal, color: '#ef4444' }),
      h(StatCard, { label: 'Not Started', value: notStarted, color: '#64748b' })
    ),
    // Agent progress cards
    progress.length === 0
      ? h(EmptyState, { message: 'No agents in onboarding' })
      : h('div', { style: { display: 'grid', gap: 12 } },
          progress.map(function(ag) {
            var isSelected = selected === ag.agentId;
            return h('div', { key: ag.agentId, className: 'card', style: { cursor: 'pointer' }, onClick: function() { setSelected(isSelected ? null : ag.agentId); } },
              h('div', { className: 'card-body', style: { padding: '12px 16px' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 } },
                  h('strong', { style: { flex: 1, fontSize: 13 } }, renderAgentBadge(ag.agentId, agentData)),
                  h(Badge, { color: statusColor(ag.overallStatus) }, ag.overallStatus || 'unknown'),
                  h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, (ag.acknowledgedPolicies || 0) + ' / ' + (ag.totalPolicies || 0) + ' policies'),
                  ag.overallStatus !== 'completed' && h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { e.stopPropagation(); forceComplete(ag.agentId); } }, I.check(), ' Force Complete')
                ),
                h(ProgressBar, { value: ag.acknowledgedPolicies || 0, total: ag.totalPolicies || 1, color: statusColor(ag.overallStatus) }),
                // Expanded details
                isSelected && ag.records && ag.records.length > 0 && h('div', { style: { marginTop: 12 } },
                  h('table', { className: 'data-table', style: { fontSize: 12 } },
                    h('thead', null, h('tr', null, h('th', null, 'Policy'), h('th', null, 'Status'), h('th', null, 'Acknowledged'), h('th', null, 'Memory ID'))),
                    h('tbody', null, ag.records.map(function(r) {
                      var rColor = r.status === 'acknowledged' ? '#10b981' : r.status === 'failed' ? '#ef4444' : '#f59e0b';
                      return h('tr', { key: r.id },
                        h('td', null, r.policyId ? r.policyId.substring(0, 16) : '-'),
                        h('td', null, h(Badge, { color: rColor }, r.status)),
                        h('td', null, r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleString() : '-'),
                        h('td', { style: { fontFamily: 'monospace', fontSize: 11 } }, r.memoryEntryId ? r.memoryEntryId.substring(0, 12) : '-')
                      );
                    }))
                  )
                ),
                ag.completedAt && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Completed: ' + new Date(ag.completedAt).toLocaleString())
              )
            );
          })
        )
  );
}

// ─── Tab 4: Agent Memory ────────────────────────────────

function MemoryTab(props) {
  var agents = props.agents || [];
  var emailMap = buildAgentEmailMap(agents);
  var agentData = buildAgentDataMap(agents);
  var app = useApp();
  var toast = app.toast;
  var _mem = useState([]);
  var memories = _mem[0]; var setMemories = _mem[1];
  var _agent = useState('');
  var agentId = _agent[0]; var setAgentId = _agent[1];
  var _cat = useState('');
  var filterCat = _cat[0]; var setFilterCat = _cat[1];
  var _imp = useState('');
  var filterImp = _imp[0]; var setFilterImp = _imp[1];
  var _stats = useState(null);
  var stats = _stats[0]; var setStats = _stats[1];
  var _show = useState(false);
  var showCreate = _show[0]; var setShowCreate = _show[1];
  var _exp = useState(null);
  var expanded = _exp[0]; var setExpanded = _exp[1];
  var _form = useState({ agentId: '', orgId: 'default', category: 'org_knowledge', title: '', content: '', source: 'admin', importance: 'normal', tags: [] });
  var form = _form[0]; var setForm = _form[1];

  var loadMemories = function(aid) {
    if (!aid) { setMemories([]); setStats(null); return; }
    var params = '?limit=100';
    if (filterCat) params += '&category=' + filterCat;
    if (filterImp) params += '&importance=' + filterImp;
    Promise.all([
      engineCall('/memory/agent/' + aid + params),
      engineCall('/memory/agent/' + aid + '/stats'),
    ]).then(function(res) {
      setMemories(res[0].memories || []);
      setStats(res[1]);
    }).catch(function() {});
  };

  var searchAgent = function() { loadMemories(agentId); };
  useEffect(function() { if (agentId) loadMemories(agentId); }, [filterCat, filterImp]);

  var createMemory = function() {
    if (!form.title || !form.content || !form.agentId) { toast('Agent ID, title and content are required', 'error'); return; }
    engineCall('/memory', { method: 'POST', body: JSON.stringify(form) })
      .then(function() { toast('Memory created', 'success'); setShowCreate(false); loadMemories(form.agentId || agentId); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var deleteMemory = function(id) {
    engineCall('/memory/' + id, { method: 'DELETE' })
      .then(function() { toast('Memory deleted', 'success'); loadMemories(agentId); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var pruneExpired = function() {
    if (!agentId) { toast('Select an agent first', 'error'); return; }
    engineCall('/memory/agent/' + agentId + '/prune', { method: 'POST' })
      .then(function(d) { toast('Pruned ' + (d.pruned || 0) + ' entries', 'success'); loadMemories(agentId); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var decayConfidence = function() {
    if (!agentId) { toast('Select an agent first', 'error'); return; }
    engineCall('/memory/agent/' + agentId + '/decay', { method: 'POST' })
      .then(function(d) { toast('Decayed ' + (d.affected || 0) + ' entries', 'success'); loadMemories(agentId); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var importanceColor = function(imp) { return imp === 'critical' ? '#ef4444' : imp === 'high' ? '#f97316' : imp === 'normal' ? '#0ea5e9' : '#64748b'; };

  return h(Fragment, null,
    // Search bar
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      h('select', { className: 'input', style: { maxWidth: 250 }, value: agentId, onChange: function(e) { setAgentId(e.target.value); } },
        h('option', { value: '' }, '-- Select Agent --'),
        agents.map(function(a) { var name = (a.config && a.config.displayName) || (a.config && a.config.name) || a.name || 'Agent'; var email = a.config && a.config.email && a.config.email.address; return h('option', { key: a.id, value: a.id }, name + (email ? ' (' + email + ')' : '')); })
      ),
      h('button', { className: 'btn btn-primary', onClick: searchAgent }, I.search(), ' Load Memories'),
      h('select', { className: 'input', style: { maxWidth: 160 }, value: filterCat, onChange: function(e) { setFilterCat(e.target.value); } },
        h('option', { value: '' }, 'All Categories'),
        MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
      ),
      h('select', { className: 'input', style: { maxWidth: 140 }, value: filterImp, onChange: function(e) { setFilterImp(e.target.value); } },
        h('option', { value: '' }, 'All Importance'),
        h('option', { value: 'critical' }, 'Critical'),
        h('option', { value: 'high' }, 'High'),
        h('option', { value: 'normal' }, 'Normal'),
        h('option', { value: 'low' }, 'Low')
      ),
      h('div', { style: { flex: 1 } }),
      h('button', { className: 'btn btn-ghost', onClick: function() { setShowCreate(true); setForm(Object.assign({}, form, { agentId: agentId })); } }, I.plus(), ' Add Memory'),
      h('button', { className: 'btn btn-ghost', onClick: pruneExpired }, I.trash(), ' Prune'),
      h('button', { className: 'btn btn-ghost', onClick: decayConfidence }, I.clock(), ' Decay')
    ),
    // Stats sidebar + memory list
    h('div', { style: { display: 'grid', gridTemplateColumns: stats ? '1fr 220px' : '1fr', gap: 16 } },
      // Memory list
      h('div', null,
        memories.length === 0
          ? h(EmptyState, { message: agentId ? 'No memories found for this agent' : 'Enter an agent ID to view memories' })
          : memories.map(function(m) {
              var isExpanded = expanded === m.id;
              return h('div', { key: m.id, className: 'card', style: { marginBottom: 8, cursor: 'pointer' }, onClick: function() { setExpanded(isExpanded ? null : m.id); } },
                h('div', { className: 'card-body', style: { padding: '10px 14px' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                    h(Badge, { color: catColor(m.category, MEMORY_CATEGORIES) }, m.category),
                    h(Badge, { color: importanceColor(m.importance) }, m.importance),
                    h('strong', { style: { flex: 1, fontSize: 13 } }, m.title),
                    h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'conf: ' + ((m.confidence || 0) * 100).toFixed(0) + '%'),
                    h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, (m.accessCount || 0) + ' reads'),
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { e.stopPropagation(); deleteMemory(m.id); } }, I.trash())
                  ),
                  // Confidence bar
                  h('div', { style: { height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: isExpanded ? 8 : 0 } },
                    h('div', { style: { width: ((m.confidence || 0) * 100) + '%', height: '100%', background: m.confidence > 0.7 ? '#10b981' : m.confidence > 0.3 ? '#f59e0b' : '#ef4444', borderRadius: 2 } })
                  ),
                  isExpanded && h(Fragment, null,
                    h('div', { style: { fontSize: 13, padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', marginBottom: 8 } }, m.content),
                    h('div', { style: { display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' } },
                      h('span', null, 'Source: ' + (m.source || '-')),
                      h('span', null, 'Created: ' + new Date(m.createdAt).toLocaleString()),
                      m.lastAccessedAt && h('span', null, 'Last accessed: ' + new Date(m.lastAccessedAt).toLocaleString()),
                      m.expiresAt && h('span', null, 'Expires: ' + new Date(m.expiresAt).toLocaleString()),
                      m.tags && m.tags.length > 0 && h('span', null, 'Tags: ' + m.tags.join(', '))
                    )
                  )
                )
              );
            })
      ),
      // Stats sidebar
      stats && h('div', null,
        h('div', { className: 'card', style: { position: 'sticky', top: 16 } },
          h('div', { className: 'card-body', style: { padding: '12px 16px' } },
            h('h4', { style: { marginBottom: 12, fontSize: 14 } }, 'Memory Stats'),
            h('div', { style: { fontSize: 13, lineHeight: 1.8 } },
              h('div', null, h('strong', null, 'Total: '), stats.totalEntries || 0),
              h('div', null, h('strong', null, 'Avg Confidence: '), ((stats.avgConfidence || 0) * 100).toFixed(0) + '%'),
              stats.byCategory && h(Fragment, null,
                h('div', { style: { marginTop: 8, fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' } }, 'BY CATEGORY'),
                Object.keys(stats.byCategory).map(function(k) {
                  return h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', null, catLabel(k, MEMORY_CATEGORIES)), h('span', { style: { fontWeight: 600 } }, stats.byCategory[k])
                  );
                })
              ),
              stats.byImportance && h(Fragment, null,
                h('div', { style: { marginTop: 8, fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' } }, 'BY IMPORTANCE'),
                Object.keys(stats.byImportance).map(function(k) {
                  return h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', null, k), h('span', { style: { fontWeight: 600, color: importanceColor(k) } }, stats.byImportance[k])
                  );
                })
              ),
              stats.bySource && h(Fragment, null,
                h('div', { style: { marginTop: 8, fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' } }, 'BY SOURCE'),
                Object.keys(stats.bySource).map(function(k) {
                  return h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', null, k), h('span', { style: { fontWeight: 600 } }, stats.bySource[k])
                  );
                })
              )
            )
          )
        )
      )
    ),
    // Create memory modal
    showCreate && h('div', { className: 'modal-overlay', onClick: function() { setShowCreate(false); } },
      h('div', { className: 'modal', style: { maxWidth: 540 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' }, h('h2', null, 'Add Memory Entry'), h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowCreate(false); } }, I.x())),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'Agent'),
          h('select', { className: 'input', value: form.agentId, onChange: function(e) { setForm(Object.assign({}, form, { agentId: e.target.value })); } },
            h('option', { value: '' }, '-- Select Agent --'),
            agents.map(function(a) { var name = (a.config && a.config.displayName) || (a.config && a.config.name) || a.name || 'Agent'; var email = a.config && a.config.email && a.config.email.address; return h('option', { key: a.id, value: a.id }, name + (email ? ' (' + email + ')' : '')); })
          ),
          h('label', { className: 'field-label' }, 'Title'),
          h('input', { className: 'input', value: form.title, onChange: function(e) { setForm(Object.assign({}, form, { title: e.target.value })); } }),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', null,
              h('label', { className: 'field-label' }, 'Category'),
              h('select', { className: 'input', value: form.category, onChange: function(e) { setForm(Object.assign({}, form, { category: e.target.value })); } },
                MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', null,
              h('label', { className: 'field-label' }, 'Importance'),
              h('select', { className: 'input', value: form.importance, onChange: function(e) { setForm(Object.assign({}, form, { importance: e.target.value })); } },
                h('option', { value: 'critical' }, 'Critical'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'normal' }, 'Normal'),
                h('option', { value: 'low' }, 'Low')
              )
            )
          ),
          h('label', { className: 'field-label' }, 'Content'),
          h('textarea', { className: 'input', style: { minHeight: 120 }, value: form.content, onChange: function(e) { setForm(Object.assign({}, form, { content: e.target.value })); } }),
          h('label', { className: 'field-label' }, 'Tags (comma-separated)'),
          h('input', { className: 'input', value: (form.tags || []).join(', '), onChange: function(e) { setForm(Object.assign({}, form, { tags: e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean) })); } })
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowCreate(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: createMemory }, 'Create Memory')
        )
      )
    )
  );
}

// ─── Tab 5: Rules & Interventions ───────────────────────

function RulesTab(props) {
  var agents = props.agents || [];
  var emailMap = buildAgentEmailMap(agents);
  var agentData = buildAgentDataMap(agents);
  var app = useApp();
  var toast = app.toast;
  var _rules = useState([]);
  var rules = _rules[0]; var setRules = _rules[1];
  var _anomaly = useState([]);
  var anomalyRules = _anomaly[0]; var setAnomalyRules = _anomaly[1];
  var _int = useState([]);
  var interventions = _int[0]; var setInterventions = _int[1];
  var _sub = useState('rules');
  var subTab = _sub[0]; var setSubTab = _sub[1];
  var _show = useState(false);
  var showModal = _show[0]; var setShowModal = _show[1];
  var _showAnomaly = useState(false);
  var showAnomalyModal = _showAnomaly[0]; var setShowAnomalyModal = _showAnomaly[1];
  var _form = useState({
    orgId: 'default', name: '', description: '', category: 'anomaly', ruleType: 'threshold',
    conditions: { threshold: 10, windowMinutes: 60 },
    action: 'alert', severity: 'medium', cooldownMinutes: 15, enabled: true
  });
  var form = _form[0]; var setForm = _form[1];
  var _anomalyForm = useState({
    orgId: 'default', name: '', ruleType: 'error_rate',
    config: { maxErrorsPerHour: 50, windowMinutes: 60 }, action: 'pause', enabled: true
  });
  var anomalyForm = _anomalyForm[0]; var setAnomalyForm = _anomalyForm[1];
  var _edit = useState(null);
  var editRule = _edit[0]; var setEditRule = _edit[1];

  var load = function() {
    Promise.all([
      engineCall('/guardrails/rules?orgId=default').catch(function() { return { rules: [] }; }),
      engineCall('/anomaly-rules?orgId=default').catch(function() { return { rules: [] }; }),
      engineCall('/guardrails/interventions?orgId=default&limit=50').catch(function() { return { interventions: [] }; }),
    ]).then(function(res) {
      setRules(res[0].rules || []);
      setAnomalyRules(res[1].rules || []);
      setInterventions(res[2].interventions || []);
    });
  };
  useEffect(load, []);

  // Guardrail rules CRUD
  var openCreateRule = function() {
    setEditRule(null);
    setForm({ orgId: 'default', name: '', description: '', category: 'anomaly', ruleType: 'threshold', conditions: { threshold: 10, windowMinutes: 60 }, action: 'alert', severity: 'medium', cooldownMinutes: 15, enabled: true });
    setShowModal(true);
  };
  var openEditRule = function(r) {
    setEditRule(r);
    setForm({ orgId: r.orgId || 'default', name: r.name, description: r.description || '', category: r.category, ruleType: r.ruleType || 'threshold', conditions: r.conditions || {}, action: r.action, severity: r.severity || 'medium', cooldownMinutes: r.cooldownMinutes || 0, enabled: r.enabled !== false });
    setShowModal(true);
  };
  var saveRule = function() {
    if (!form.name) { toast('Name is required', 'error'); return; }
    var method = editRule ? 'PUT' : 'POST';
    var url = editRule ? '/guardrails/rules/' + editRule.id : '/guardrails/rules';
    engineCall(url, { method: method, body: JSON.stringify(form) })
      .then(function() { toast(editRule ? 'Rule updated' : 'Rule created', 'success'); setShowModal(false); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var deleteRule = function(id) {
    engineCall('/guardrails/rules/' + id, { method: 'DELETE' })
      .then(function() { toast('Rule deleted', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  // Anomaly rules CRUD
  var createAnomalyRule = function() {
    engineCall('/anomaly-rules', { method: 'POST', body: JSON.stringify(anomalyForm) })
      .then(function() { toast('Anomaly rule created', 'success'); setShowAnomalyModal(false); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };
  var deleteAnomalyRule = function(id) {
    engineCall('/anomaly-rules/' + id, { method: 'DELETE' })
      .then(function() { toast('Rule deleted', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var sevColor = function(s) { var f = SEVERITIES.find(function(x) { return x.value === s; }); return f ? f.color : '#64748b'; };
  var actColor = function(a) { var f = RULE_ACTIONS.find(function(x) { return x.value === a; }); return f ? f.color : '#64748b'; };
  var typeColor = function(t) { return t === 'kill' ? '#ef4444' : t === 'pause' ? '#f59e0b' : t === 'resume' ? '#10b981' : '#0ea5e9'; };

  return h(Fragment, null,
    // Sub-tabs
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
      ['rules', 'anomaly', 'interventions'].map(function(t) {
        var labels = { rules: 'Guardrail Rules (' + rules.length + ')', anomaly: 'Anomaly Rules (' + anomalyRules.length + ')', interventions: 'Interventions (' + interventions.length + ')' };
        return h('button', { key: t, className: 'btn ' + (subTab === t ? 'btn-primary' : 'btn-ghost'), onClick: function() { setSubTab(t); } }, labels[t]);
      }),
      h('div', { style: { flex: 1 } }),
      h('button', { className: 'btn btn-ghost', onClick: load }, I.refresh())
    ),

    // ── Guardrail Rules sub-tab ──
    subTab === 'rules' && h(Fragment, null,
      h('div', { style: { marginBottom: 12 } },
        h('button', { className: 'btn btn-primary', onClick: openCreateRule }, I.plus(), ' Create Rule')
      ),
      rules.length === 0
        ? h(EmptyState, { message: 'No guardrail rules configured' })
        : h('div', { className: 'card' },
            h('table', { className: 'data-table' },
              h('thead', null, h('tr', null,
                h('th', null, 'Name'), h('th', null, 'Category'), h('th', null, 'Severity'),
                h('th', null, 'Action'), h('th', null, 'Triggers'), h('th', null, 'Enabled'), h('th', null, 'Actions')
              )),
              h('tbody', null, rules.map(function(r) {
                return h('tr', { key: r.id },
                  h('td', null, h('div', null, h('strong', null, r.name)), r.description && h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, r.description)),
                  h('td', null, h(Badge, { color: catColor(r.category, RULE_CATEGORIES.map(function(c) { return { value: c.value, color: '#6366f1' }; })) }, r.category)),
                  h('td', null, h(Badge, { color: sevColor(r.severity) }, r.severity)),
                  h('td', null, h(Badge, { color: actColor(r.action) }, r.action)),
                  h('td', { style: { textAlign: 'center' } }, r.triggerCount || 0),
                  h('td', null, r.enabled !== false ? h('span', { style: { color: '#10b981' } }, 'Yes') : h('span', { style: { color: '#ef4444' } }, 'No')),
                  h('td', { style: { whiteSpace: 'nowrap' } },
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { openEditRule(r); } }, I.settings()),
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { deleteRule(r.id); } }, I.trash())
                  )
                );
              }))
            )
          )
    ),

    // ── Anomaly Rules sub-tab ──
    subTab === 'anomaly' && h(Fragment, null,
      h('div', { style: { marginBottom: 12 } },
        h('button', { className: 'btn btn-primary', onClick: function() { setShowAnomalyModal(true); } }, I.plus(), ' Add Anomaly Rule')
      ),
      anomalyRules.length === 0
        ? h(EmptyState, { message: 'No anomaly rules configured' })
        : h('div', { className: 'card' },
            h('table', { className: 'data-table' },
              h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Type'), h('th', null, 'Action'), h('th', null, 'Enabled'), h('th', null, 'Actions'))),
              h('tbody', null, anomalyRules.map(function(r) {
                return h('tr', { key: r.id },
                  h('td', null, h('strong', null, r.name)),
                  h('td', null, h('span', { className: 'badge-tag' }, r.ruleType)),
                  h('td', null, h(Badge, { color: r.action === 'kill' ? '#ef4444' : r.action === 'pause' ? '#f59e0b' : '#0ea5e9' }, r.action)),
                  h('td', null, r.enabled ? 'Yes' : 'No'),
                  h('td', null, h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { deleteAnomalyRule(r.id); } }, I.trash()))
                );
              }))
            )
          )
    ),

    // ── Interventions sub-tab ──
    subTab === 'interventions' && h(Fragment, null,
      interventions.length === 0
        ? h(EmptyState, { message: 'No interventions recorded' })
        : h('div', { className: 'card' },
            h('table', { className: 'data-table' },
              h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Agent'), h('th', null, 'Type'), h('th', null, 'Reason'), h('th', null, 'By'))),
              h('tbody', null, interventions.map(function(r) {
                return h('tr', { key: r.id },
                  h('td', { style: { whiteSpace: 'nowrap', fontSize: 12 } }, new Date(r.createdAt).toLocaleString()),
                  h('td', null, renderAgentBadge(r.agentId, agentData)),
                  h('td', null, h(Badge, { color: typeColor(r.type) }, r.type)),
                  h('td', { style: { maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.reason || '-'),
                  h('td', null, r.triggeredBy || '-')
                );
              }))
            )
          )
    ),

    // ── Create/Edit Guardrail Rule modal ──
    showModal && h('div', { className: 'modal-overlay', onClick: function() { setShowModal(false); } },
      h('div', { className: 'modal', style: { maxWidth: 580 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, editRule ? 'Edit Guardrail Rule' : 'Create Guardrail Rule'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowModal(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'Name'),
          h('input', { className: 'input', value: form.name, onChange: function(e) { setForm(Object.assign({}, form, { name: e.target.value })); } }),
          h('label', { className: 'field-label' }, 'Description'),
          h('input', { className: 'input', value: form.description, onChange: function(e) { setForm(Object.assign({}, form, { description: e.target.value })); } }),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', null,
              h('label', { className: 'field-label' }, 'Category'),
              h('select', { className: 'input', value: form.category, onChange: function(e) { setForm(Object.assign({}, form, { category: e.target.value })); } },
                RULE_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', null,
              h('label', { className: 'field-label' }, 'Severity'),
              h('select', { className: 'input', value: form.severity, onChange: function(e) { setForm(Object.assign({}, form, { severity: e.target.value })); } },
                SEVERITIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', null,
              h('label', { className: 'field-label' }, 'Action on Trigger'),
              h('select', { className: 'input', value: form.action, onChange: function(e) { setForm(Object.assign({}, form, { action: e.target.value })); } },
                RULE_ACTIONS.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', null,
              h('label', { className: 'field-label' }, 'Cooldown (minutes)'),
              h('input', { className: 'input', type: 'number', value: form.cooldownMinutes, onChange: function(e) { setForm(Object.assign({}, form, { cooldownMinutes: parseInt(e.target.value) || 0 })); } })
            )
          ),
          // Conditions
          h('div', { style: { marginTop: 8, padding: 12, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' } },
            h('div', { style: { fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' } }, 'CONDITIONS'),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
              h('div', null,
                h('label', { className: 'field-label', style: { fontSize: 11 } }, 'Threshold'),
                h('input', { className: 'input', type: 'number', value: (form.conditions || {}).threshold || '', placeholder: 'e.g. 10', onChange: function(e) { setForm(Object.assign({}, form, { conditions: Object.assign({}, form.conditions, { threshold: parseFloat(e.target.value) || 0 }) })); } })
              ),
              h('div', null,
                h('label', { className: 'field-label', style: { fontSize: 11 } }, 'Window (minutes)'),
                h('input', { className: 'input', type: 'number', value: (form.conditions || {}).windowMinutes || '', placeholder: 'e.g. 60', onChange: function(e) { setForm(Object.assign({}, form, { conditions: Object.assign({}, form.conditions, { windowMinutes: parseInt(e.target.value) || 0 }) })); } })
              ),
              h('div', null,
                h('label', { className: 'field-label', style: { fontSize: 11 } }, 'Max Per Hour'),
                h('input', { className: 'input', type: 'number', value: (form.conditions || {}).maxPerHour || '', placeholder: 'optional', onChange: function(e) { setForm(Object.assign({}, form, { conditions: Object.assign({}, form.conditions, { maxPerHour: parseInt(e.target.value) || undefined }) })); } })
              ),
              h('div', null,
                h('label', { className: 'field-label', style: { fontSize: 11 } }, 'Max Per Day'),
                h('input', { className: 'input', type: 'number', value: (form.conditions || {}).maxPerDay || '', placeholder: 'optional', onChange: function(e) { setForm(Object.assign({}, form, { conditions: Object.assign({}, form.conditions, { maxPerDay: parseInt(e.target.value) || undefined }) })); } })
              )
            ),
            h('div', { style: { marginTop: 8 } },
              h('label', { className: 'field-label', style: { fontSize: 11 } }, 'Keywords (comma-separated)'),
              h('input', { className: 'input', value: ((form.conditions || {}).keywords || []).join(', '), placeholder: 'optional keyword triggers', onChange: function(e) { setForm(Object.assign({}, form, { conditions: Object.assign({}, form.conditions, { keywords: e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean) }) })); } })
            )
          ),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
            h('input', { type: 'checkbox', checked: form.enabled, onChange: function(e) { setForm(Object.assign({}, form, { enabled: e.target.checked })); } }),
            'Enabled'
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowModal(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: saveRule }, editRule ? 'Update Rule' : 'Create Rule')
        )
      )
    ),

    // ── Create Anomaly Rule modal ──
    showAnomalyModal && h('div', { className: 'modal-overlay', onClick: function() { setShowAnomalyModal(false); } },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' }, h('h2', null, 'Create Anomaly Rule'), h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowAnomalyModal(false); } }, I.x())),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'Name'),
          h('input', { className: 'input', value: anomalyForm.name, onChange: function(e) { setAnomalyForm(Object.assign({}, anomalyForm, { name: e.target.value })); } }),
          h('label', { className: 'field-label' }, 'Rule Type'),
          h('select', { className: 'input', value: anomalyForm.ruleType, onChange: function(e) { setAnomalyForm(Object.assign({}, anomalyForm, { ruleType: e.target.value })); } },
            h('option', { value: 'error_rate' }, 'Error Rate'),
            h('option', { value: 'cost_velocity' }, 'Cost Velocity'),
            h('option', { value: 'volume_spike' }, 'Volume Spike'),
            h('option', { value: 'off_hours' }, 'Off Hours')
          ),
          h('label', { className: 'field-label' }, 'Action on Trigger'),
          h('select', { className: 'input', value: anomalyForm.action, onChange: function(e) { setAnomalyForm(Object.assign({}, anomalyForm, { action: e.target.value })); } },
            h('option', { value: 'alert' }, 'Alert'),
            h('option', { value: 'pause' }, 'Auto-Pause Agent'),
            h('option', { value: 'kill' }, 'Emergency Kill')
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowAnomalyModal(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: createAnomalyRule }, 'Create Rule')
        )
      )
    )
  );
}
