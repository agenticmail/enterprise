import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { TagInput } from '../../components/tag-input.js';
import { HelpButton } from '../../components/help-button.js';
import { Badge, EmptyState } from './shared.js?v=4';

// ════════════════════════════════════════════════════════════
// GUARDRAILS SECTION
// ════════════════════════════════════════════════════════════

export function GuardrailsSection(props) {
  var agentId = props.agentId;
  var agents = props.agents || [];
  var app = useApp();
  var toast = app.toast;
  var agentData = buildAgentDataMap(agents);

  var _subTab = useState('rules');
  var subTab = _subTab[0]; var setSubTab = _subTab[1];
  var _guardrailStatus = useState(null);
  var guardrailStatus = _guardrailStatus[0]; var setGuardrailStatus = _guardrailStatus[1];
  var _rules = useState([]);
  var rules = _rules[0]; var setRules = _rules[1];
  var _interventions = useState([]);
  var interventions = _interventions[0]; var setInterventions = _interventions[1];
  var _dlpViolations = useState([]);
  var dlpViolations = _dlpViolations[0]; var setDlpViolations = _dlpViolations[1];
  var _onboardingStatus = useState(null);
  var onboardingStatus = _onboardingStatus[0]; var setOnboardingStatus = _onboardingStatus[1];
  var _onboardingProgress = useState([]);
  var onboardingProgress = _onboardingProgress[0]; var setOnboardingProgress = _onboardingProgress[1];
  var _pendingApprovals = useState([]);
  var pendingApprovals = _pendingApprovals[0]; var setPendingApprovals = _pendingApprovals[1];
  var _approvalHistory = useState([]);
  var approvalHistory = _approvalHistory[0]; var setApprovalHistory = _approvalHistory[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _showCreate = useState(false);
  var showCreate = _showCreate[0]; var setShowCreate = _showCreate[1];
  var _editRule = useState(null);
  var editRule = _editRule[0]; var setEditRule = _editRule[1];
  var _ruleForm = useState({ name: '', category: 'anomaly', ruleType: 'error_rate', action: 'alert', severity: 'medium', enabled: true, threshold: 10, windowMinutes: 60, cooldownMinutes: 30, keywords: '', patterns: '', description: '' });
  var ruleForm = _ruleForm[0]; var setRuleForm = _ruleForm[1];

  var CATEGORIES = [
    { value: 'anomaly', label: 'Anomaly Detection', desc: 'Unusual patterns in agent behavior', types: ['error_rate', 'cost_velocity', 'volume_spike', 'off_hours', 'session_anomaly'] },
    { value: 'policy_compliance', label: 'Policy Compliance', desc: 'Ensure agents follow org policies', types: ['policy_violation', 'escalation_failure'] },
    { value: 'communication', label: 'Communication', desc: 'Monitor communication quality', types: ['tone_violation', 'keyword_detection'] },
    { value: 'memory', label: 'Memory', desc: 'Control memory write behavior', types: ['memory_flood'] },
    { value: 'onboarding', label: 'Onboarding', desc: 'Enforce onboarding requirements', types: ['onboarding_bypass'] },
    { value: 'security', label: 'Security', desc: 'Detect threats and suspicious patterns', types: ['data_leak_attempt', 'repeated_error', 'prompt_injection'] }
  ];

  var TYPE_LABELS = {
    error_rate: 'Error Rate', cost_velocity: 'Cost Velocity', volume_spike: 'Volume Spike',
    off_hours: 'Off-Hours Activity', session_anomaly: 'Session Anomaly',
    policy_violation: 'Policy Violation', escalation_failure: 'Escalation Failure',
    tone_violation: 'Tone Violation', keyword_detection: 'Keyword Detection',
    memory_flood: 'Memory Flood', onboarding_bypass: 'Onboarding Bypass',
    data_leak_attempt: 'Data Leak Attempt', repeated_error: 'Repeated Error', prompt_injection: 'Prompt Injection'
  };

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/guardrails/status/' + agentId).catch(function() { return null; }),
      engineCall('/guardrails/rules?orgId=' + getOrgId()).catch(function() { return { rules: [] }; }),
      engineCall('/guardrails/interventions?agentId=' + agentId).catch(function() { return { interventions: [] }; }),
      engineCall('/dlp/violations?agentId=' + agentId).catch(function() { return { violations: [] }; }),
      engineCall('/onboarding/status/' + agentId).catch(function() { return null; }),
      engineCall('/onboarding/progress/' + agentId).catch(function() { return { progress: [] }; }),
      engineCall('/approvals/pending?agentId=' + agentId).catch(function() { return { approvals: [] }; }),
      engineCall('/approvals/history?agentId=' + agentId).catch(function() { return { approvals: [] }; })
    ]).then(function(results) {
      setGuardrailStatus(results[0]);
      setRules(results[1]?.rules || []);
      setInterventions(results[2]?.interventions || results[2] || []);
      setDlpViolations(results[3]?.violations || results[3] || []);
      setOnboardingStatus(results[4]);
      setOnboardingProgress(results[5]?.progress || results[5] || []);
      setPendingApprovals(results[6]?.approvals || results[6] || []);
      setApprovalHistory(results[7]?.approvals || results[7] || []);
      setLoading(false);
    });
  };

  useEffect(function() { loadAll(); }, [agentId]);

  // Agent-relevant rules: either targets this agent specifically, or applies globally (no agentIds filter)
  var agentRules = rules.filter(function(r) {
    if (!r.conditions?.agentIds || r.conditions.agentIds.length === 0) return true;
    return r.conditions.agentIds.includes(agentId);
  });

  var pauseAgent = function() {
    engineCall('/guardrails/pause/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual pause from dashboard' }) })
      .then(function() { toast('Agent paused', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };
  var resumeAgent = function() {
    engineCall('/guardrails/resume/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual resume from dashboard' }) })
      .then(function() { toast('Agent resumed', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };
  var killAgent = function() {
    showConfirm({ title: 'Kill Agent', message: 'Immediately terminate all running processes?', danger: true, confirmText: 'Kill Agent' }).then(function(ok) {
      if (!ok) return;
      engineCall('/guardrails/kill/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual kill from dashboard' }) })
        .then(function() { toast('Agent killed', 'success'); loadAll(); })
        .catch(function(err) { toast(err.message, 'error'); });
    });
  };

  var toggleRule = function(rule) {
    engineCall('/guardrails/rules/' + rule.id, { method: 'PUT', body: JSON.stringify({ enabled: !rule.enabled }) })
      .then(function() { toast(rule.enabled ? 'Rule disabled' : 'Rule enabled', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var deleteRule = function(rule) {
    showConfirm({ title: 'Delete Rule', message: 'Delete "' + rule.name + '"? This cannot be undone.', warning: true, confirmText: 'Delete' }).then(function(ok) {
      if (!ok) return;
      engineCall('/guardrails/rules/' + rule.id, { method: 'DELETE' })
        .then(function() { toast('Rule deleted', 'success'); loadAll(); })
        .catch(function(err) { toast(err.message, 'error'); });
    });
  };

  var openCreateRule = function() {
    setRuleForm({ name: '', category: 'anomaly', ruleType: 'error_rate', action: 'alert', severity: 'medium', enabled: true, threshold: 10, windowMinutes: 60, cooldownMinutes: 30, keywords: '', patterns: '', description: '' });
    setEditRule(null);
    setShowCreate(true);
  };

  var openEditRule = function(rule) {
    setRuleForm({
      name: rule.name || '',
      category: rule.category || 'anomaly',
      ruleType: rule.ruleType || 'error_rate',
      action: rule.action || 'alert',
      severity: rule.severity || 'medium',
      enabled: rule.enabled !== false,
      threshold: rule.conditions?.threshold || 10,
      windowMinutes: rule.conditions?.windowMinutes || 60,
      cooldownMinutes: rule.cooldownMinutes || 30,
      keywords: (rule.conditions?.keywords || []).join(', '),
      patterns: (rule.conditions?.patterns || []).join(', '),
      description: rule.description || ''
    });
    setEditRule(rule);
    setShowCreate(true);
  };

  var saveRule = function() {
    var body = {
      orgId: getOrgId(),
      name: ruleForm.name,
      description: ruleForm.description,
      category: ruleForm.category,
      ruleType: ruleForm.ruleType,
      action: ruleForm.action,
      severity: ruleForm.severity,
      enabled: ruleForm.enabled,
      cooldownMinutes: parseInt(ruleForm.cooldownMinutes) || 30,
      conditions: {
        agentIds: [agentId],
        threshold: parseFloat(ruleForm.threshold) || undefined,
        windowMinutes: parseInt(ruleForm.windowMinutes) || undefined,
        keywords: ruleForm.keywords ? ruleForm.keywords.split(',').map(function(k) { return k.trim(); }).filter(Boolean) : undefined,
        patterns: ruleForm.patterns ? ruleForm.patterns.split(',').map(function(p) { return p.trim(); }).filter(Boolean) : undefined
      }
    };
    var method = editRule ? 'PUT' : 'POST';
    var url = editRule ? '/guardrails/rules/' + editRule.id : '/guardrails/rules';
    engineCall(url, { method: method, body: JSON.stringify(body) })
      .then(function() { toast(editRule ? 'Rule updated' : 'Rule created', 'success'); setShowCreate(false); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var initiateOnboarding = function() {
    engineCall('/onboarding/initiate/' + agentId, { method: 'POST', body: JSON.stringify({ orgId: getOrgId() }) })
      .then(function() { toast('Onboarding initiated', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };
  var forceComplete = function() {
    engineCall('/onboarding/force-complete/' + agentId, { method: 'POST' })
      .then(function() { toast('Onboarding force completed', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };
  var approveRequest = function(id) {
    engineCall('/approvals/' + id + '/approve', { method: 'POST', body: JSON.stringify({ decidedBy: 'dashboard-admin' }) })
      .then(function() { toast('Approved', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };
  var rejectRequest = function(id) {
    engineCall('/approvals/' + id + '/reject', { method: 'POST', body: JSON.stringify({ decidedBy: 'dashboard-admin' }) })
      .then(function() { toast('Rejected', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var actionColor = function(a) { return a === 'kill' ? 'var(--danger)' : a === 'pause' ? 'var(--warning)' : a === 'notify' ? 'var(--info)' : 'var(--text-muted)'; };
  var sevColor = function(s) { return s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : s === 'medium' ? '#eab308' : '#64748b'; };
  var catIcon = function(c) { return c === 'anomaly' ? E.bolt(16) : c === 'security' ? E.shield(16) : c === 'communication' ? E.chat(16) : c === 'memory' ? E.brain(16) : c === 'onboarding' ? E.clipboard(16) : c === 'policy_compliance' ? E.scroll(16) : E.gear(16); };

  if (loading) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading guardrails...');

  return h(Fragment, null,

    // Status bar
    h('div', { className: 'card', style: { marginBottom: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' } },
        guardrailStatus && guardrailStatus.paused
          ? h('span', { className: 'badge badge-warning' }, I.pause(), ' Paused')
          : h('span', { className: 'badge badge-success' }, I.shield(), ' Active'),
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, (guardrailStatus?.interventionCount || 0) + ' interventions'),
        agentRules.length > 0 && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, agentRules.filter(function(r) { return r.enabled; }).length + '/' + agentRules.length + ' rules active'),
        h('div', { style: { flex: 1 } }),
        guardrailStatus && !guardrailStatus.paused && h('button', { className: 'btn btn-secondary btn-sm', onClick: pauseAgent }, I.pause(), ' Pause'),
        guardrailStatus && guardrailStatus.paused && h('button', { className: 'btn btn-primary btn-sm', onClick: resumeAgent }, I.play(), ' Resume'),
        h('button', { className: 'btn btn-danger btn-sm', onClick: killAgent }, I.stop(), ' Kill'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: loadAll }, I.refresh())
      )
    ),

    // Sub-tabs
    h('div', { style: { borderBottom: '1px solid var(--border)', marginBottom: 16 } },
      h('div', { className: 'tabs' },
        h('div', { className: 'tab' + (subTab === 'rules' ? ' active' : ''), onClick: function() { setSubTab('rules'); } }, 'Rules (' + agentRules.length + ')'),
        h('div', { className: 'tab' + (subTab === 'interventions' ? ' active' : ''), onClick: function() { setSubTab('interventions'); } }, 'Interventions'),
        h('div', { className: 'tab' + (subTab === 'dlp' ? ' active' : ''), onClick: function() { setSubTab('dlp'); } }, 'DLP'),
        h('div', { className: 'tab' + (subTab === 'onboarding' ? ' active' : ''), onClick: function() { setSubTab('onboarding'); } }, 'Onboarding'),
        h('div', { className: 'tab' + (subTab === 'approvals' ? ' active' : ''), onClick: function() { setSubTab('approvals'); } }, 'Approvals')
      )
    ),

    // ─── Rules Tab ──────────────────────────────────────
    subTab === 'rules' && h('div', null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Guardrail rules that apply to this agent (agent-specific + global)'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: openCreateRule }, I.plus(), ' Add Rule')
      ),

      // Category groups
      CATEGORIES.map(function(cat) {
        var catRules = agentRules.filter(function(r) { return r.category === cat.value; });
        if (catRules.length === 0) {
          // Show empty category with "Add" button
          return h('div', { key: cat.value, className: 'card', style: { marginBottom: 8 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' } },
              h('span', { style: { fontSize: 14 } }, catIcon(cat.value)),
              h('span', { style: { fontWeight: 600, fontSize: 13 } }, cat.label),
              h('span', { style: { fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 } }, cat.desc),
              h('div', { style: { flex: 1 } }),
              h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'No rules'),
              h('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 11 }, onClick: function() { setRuleForm(Object.assign({}, ruleForm, { category: cat.value, ruleType: cat.types[0] })); setEditRule(null); setShowCreate(true); } }, I.plus(), ' Add')
            )
          );
        }
        return h('div', { key: cat.value, className: 'card', style: { marginBottom: 8 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)' } },
            h('span', { style: { fontSize: 14 } }, catIcon(cat.value)),
            h('span', { style: { fontWeight: 600, fontSize: 13 } }, cat.label),
            h('span', { style: { fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 } }, catRules.length + ' rule' + (catRules.length !== 1 ? 's' : '')),
            h('div', { style: { flex: 1 } }),
            h('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 11 }, onClick: function() { setRuleForm(Object.assign({}, ruleForm, { category: cat.value, ruleType: cat.types[0] })); setEditRule(null); setShowCreate(true); } }, I.plus())
          ),
          catRules.map(function(rule) {
            var isGlobal = !rule.conditions?.agentIds || rule.conditions.agentIds.length === 0;
            return h('div', { key: rule.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 } },
              // Toggle switch
              h('div', {
                style: { width: 36, height: 20, borderRadius: 10, background: rule.enabled ? 'var(--success)' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' },
                onClick: function() { toggleRule(rule); }
              },
                h('div', { style: { width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: rule.enabled ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } })
              ),
              // Name + type
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, rule.name || TYPE_LABELS[rule.ruleType] || rule.ruleType),
                  isGlobal && h('span', { style: { fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' } }, 'Global')
                ),
                rule.description && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, rule.description)
              ),
              // Type badge
              h('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' } }, TYPE_LABELS[rule.ruleType] || rule.ruleType),
              // Severity
              h('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 3, color: '#fff', background: sevColor(rule.severity), whiteSpace: 'nowrap' } }, rule.severity),
              // Action
              h('span', { style: { fontSize: 11, color: actionColor(rule.action), fontWeight: 500 } }, rule.action),
              // Trigger count
              h('span', { style: { fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' } }, (rule.triggerCount || 0) + 'x'),
              // Edit + Delete
              h('button', { className: 'btn btn-ghost btn-sm', style: { height: 24, fontSize: 11 }, onClick: function() { openEditRule(rule); } }, I.edit()),
              h('button', { className: 'btn btn-ghost btn-sm', style: { height: 24, fontSize: 11, color: 'var(--danger)' }, onClick: function() { deleteRule(rule); } }, I.trash())
            );
          })
        );
      })
    ),

    // ─── Interventions Tab ──────────────────────────────
    subTab === 'interventions' && h('div', { className: 'card' },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Interventions',
        h(HelpButton, { label: 'Guardrail Interventions' },
          h('p', null, 'A log of every time a guardrail rule was triggered for this agent. Each entry shows what happened and what action was taken.'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Log'), ' — The event was recorded but no action was taken.'),
            h('li', null, h('strong', null, 'Warn'), ' — The agent was warned about the violation and continued.'),
            h('li', null, h('strong', null, 'Pause'), ' — The agent was automatically paused and needs manual resume.'),
            h('li', null, h('strong', null, 'Block'), ' — The specific action was blocked but the agent continued.')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Frequent interventions from the same rule may mean the agent\'s instructions conflict with the guardrail — review and adjust either one.')
        )
      )),
      interventions.length > 0
        ? h('div', { style: { padding: 0 } },
            interventions.map(function(inv, i) {
              var time = inv.timestamp || inv.createdAt;
              var invType = inv.type || inv.interventionType || 'unknown';
              var severity = inv.severity || 'medium';
              return h('div', { key: inv.id || i, style: { display: 'flex', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' } },
                h('span', { style: { color: 'var(--text-muted)', minWidth: 130, whiteSpace: 'nowrap' } }, time ? new Date(time).toLocaleString() : '-'),
                h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: invType === 'block' ? '#ef4444' : invType === 'warn' ? '#eab308' : '#3b82f6' } }, invType),
                h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: sevColor(severity) } }, severity),
                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' } }, inv.description || inv.message || inv.reason || '-'),
                h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, inv.resolution || inv.action || '')
              );
            })
          )
        : h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No interventions recorded')
    ),

    // ─── DLP Tab ────────────────────────────────────────
    subTab === 'dlp' && h('div', { className: 'card' },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'DLP Violations',
        h(HelpButton, { label: 'DLP Violations' },
          h('p', null, 'Data Loss Prevention (DLP) violations occur when the agent attempts to share sensitive data (PII, credentials, proprietary info) in a way that violates your DLP policies.'),
          h('p', null, 'Each entry shows what data was detected, the severity level, and what action was taken (redacted, blocked, or logged).'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Configure DLP rules at the organization level in the DLP page. Agent-specific overrides can be set here.')
        )
      )),
      dlpViolations.length > 0
        ? h('div', { style: { padding: 0 } },
            dlpViolations.map(function(v, i) {
              var time = v.timestamp || v.createdAt || v.detectedAt;
              var severity = v.severity || 'medium';
              return h('div', { key: v.id || i, style: { display: 'flex', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' } },
                h('span', { style: { color: 'var(--text-muted)', minWidth: 130, whiteSpace: 'nowrap' } }, time ? new Date(time).toLocaleString() : '-'),
                h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: '#3b82f6' } }, v.rule || v.ruleName || 'Unknown'),
                h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: sevColor(severity) } }, severity),
                h('span', { style: { flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' } }, (v.content || v.matchedContent || v.snippet || '-').substring(0, 100)),
                h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, v.status || v.action || 'detected')
              );
            })
          )
        : h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No DLP violations detected')
    ),

    // ─── Onboarding Tab ─────────────────────────────────
    subTab === 'onboarding' && h('div', null,
      h('div', { className: 'card', style: { marginBottom: 12 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' } },
          onboardingStatus?.onboarded
            ? h('span', { className: 'badge badge-success' }, I.check(), ' Onboarded')
            : h('span', { className: 'badge badge-warning' }, 'Not Onboarded'),
          onboardingStatus?.completedAt && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Completed: ' + new Date(onboardingStatus.completedAt).toLocaleString()),
          h('div', { style: { flex: 1 } }),
          !onboardingStatus?.onboarded && h('button', { className: 'btn btn-primary btn-sm', onClick: initiateOnboarding }, 'Start'),
          onboardingStatus?.status === 'in_progress' && h('button', { className: 'btn btn-secondary btn-sm', onClick: forceComplete }, 'Force Complete')
        )
      ),
      onboardingProgress.length > 0 && h('div', { className: 'card' },
        h('div', { style: { padding: 0 } },
          onboardingProgress.map(function(p, i) {
            return h('div', { key: i, style: { display: 'flex', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' } },
              p.acknowledged
                ? h('span', { style: { display: 'inline-flex', alignItems: 'center' } }, E.checkCircle(16))
                : h('span', { style: { display: 'inline-flex', width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)' } }),
              h('span', { style: { fontWeight: 500, flex: 1 } }, p.policyName || p.name || 'Policy ' + (i + 1)),
              p.acknowledgedAt && h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, new Date(p.acknowledgedAt).toLocaleDateString())
            );
          })
        )
      )
    ),

    // ─── Approvals Tab ──────────────────────────────────
    subTab === 'approvals' && h('div', null,
      pendingApprovals.length > 0 && h('div', { className: 'card', style: { marginBottom: 12 } },
        h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Pending Approvals (' + pendingApprovals.length + ')',
          h(HelpButton, { label: 'Pending Approvals' },
            h('p', null, 'Actions the agent wants to take that require human approval before proceeding. This is part of the human-in-the-loop safety system.'),
            h('p', null, 'Review each request and approve or reject it. The agent will be notified and continue or find an alternative approach.'),
            h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'If you find yourself always approving the same type of request, consider updating the guardrail rule to auto-approve that action.')
          )
        )),
        h('div', { style: { padding: 0 } },
          pendingApprovals.map(function(a) {
            return h('div', { key: a.id, style: { display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' } },
              h('span', { style: { flex: 1 } },
                h('div', { style: { fontWeight: 500, marginBottom: 2 } }, a.action || a.description || 'Pending approval'),
                h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, a.requestedAt ? new Date(a.requestedAt).toLocaleString() : '')
              ),
              h('button', { className: 'btn btn-primary btn-sm', style: { height: 26 }, onClick: function() { approveRequest(a.id); } }, 'Approve'),
              h('button', { className: 'btn btn-secondary btn-sm', style: { height: 26 }, onClick: function() { rejectRequest(a.id); } }, 'Reject')
            );
          })
        )
      ),
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('span', null, 'Approval History')),
        approvalHistory.length > 0
          ? h('div', { style: { padding: 0 } },
              approvalHistory.map(function(a, i) {
                var status = a.status || a.decision || 'unknown';
                return h('div', { key: a.id || i, style: { display: 'flex', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' } },
                  h('span', { style: { color: 'var(--text-muted)', minWidth: 130 } }, a.decidedAt ? new Date(a.decidedAt).toLocaleString() : '-'),
                  h('span', { className: 'badge ' + (status === 'approved' ? 'badge-success' : status === 'rejected' ? 'badge-danger' : 'badge-neutral') }, status),
                  h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.action || a.description || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, a.decidedBy || '')
                );
              })
            )
          : h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No approval history')
      )
    ),

    // ─── Create/Edit Rule Modal ─────────────────────────
    showCreate && h('div', { className: 'modal-overlay', onClick: function() { setShowCreate(false); } },
      h('div', { className: 'modal', style: { maxWidth: 520 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, editRule ? 'Edit Rule' : 'Create Guardrail Rule'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowCreate(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Name *'),
            h('input', { className: 'input', placeholder: 'e.g. High Error Rate Alert', value: ruleForm.name, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { name: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Description'),
            h('input', { className: 'input', placeholder: 'What this rule monitors...', value: ruleForm.description, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { description: e.target.value })); } })
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Category'),
              h('select', { className: 'input', value: ruleForm.category, onChange: function(e) {
                var cat = CATEGORIES.find(function(c) { return c.value === e.target.value; });
                setRuleForm(Object.assign({}, ruleForm, { category: e.target.value, ruleType: cat ? cat.types[0] : ruleForm.ruleType }));
              } },
                CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Rule Type'),
              h('select', { className: 'input', value: ruleForm.ruleType, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { ruleType: e.target.value })); } },
                (CATEGORIES.find(function(c) { return c.value === ruleForm.category; })?.types || []).map(function(t) { return h('option', { key: t, value: t }, TYPE_LABELS[t] || t); })
              )
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Action'),
              h('select', { className: 'input', value: ruleForm.action, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { action: e.target.value })); } },
                h('option', { value: 'alert' }, 'Alert'),
                h('option', { value: 'notify' }, 'Notify'),
                h('option', { value: 'log' }, 'Log'),
                h('option', { value: 'pause' }, 'Pause Agent'),
                h('option', { value: 'kill' }, 'Kill Agent')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Severity'),
              h('select', { className: 'input', value: ruleForm.severity, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { severity: e.target.value })); } },
                h('option', { value: 'low' }, 'Low'),
                h('option', { value: 'medium' }, 'Medium'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'critical' }, 'Critical')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Cooldown (min)'),
              h('input', { className: 'input', type: 'number', value: ruleForm.cooldownMinutes, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { cooldownMinutes: e.target.value })); } })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Threshold'),
              h('input', { className: 'input', type: 'number', placeholder: 'e.g. 10', value: ruleForm.threshold, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { threshold: e.target.value })); } })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Window (min)'),
              h('input', { className: 'input', type: 'number', placeholder: 'e.g. 60', value: ruleForm.windowMinutes, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { windowMinutes: e.target.value })); } })
            )
          ),
          (ruleForm.category === 'communication' || ruleForm.category === 'security') && h(Fragment, null,
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Keywords (comma-separated)'),
              h('input', { className: 'input', placeholder: 'confidential, secret, password', value: ruleForm.keywords, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { keywords: e.target.value })); } })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Patterns (comma-separated regex)'),
              h('input', { className: 'input', placeholder: '\\d{4}-\\d{4}-\\d{4}-\\d{4}', value: ruleForm.patterns, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { patterns: e.target.value })); } })
            )
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
            h('input', { type: 'checkbox', checked: ruleForm.enabled, onChange: function(e) { setRuleForm(Object.assign({}, ruleForm, { enabled: e.target.checked })); } }),
            h('label', { style: { fontSize: 13 } }, 'Enabled')
          ),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 8 } }, 'This rule will be scoped to this agent only. To create org-wide rules, use the Guardrails page in the sidebar.')
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowCreate(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: saveRule }, editRule ? 'Update Rule' : 'Create Rule')
        )
      )
    )
  );
}
