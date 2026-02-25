import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { TimezoneSelect } from '../components/timezones.js';
import { DetailModal } from '../components/modal.js';
import { CULTURES, LANGUAGES, DEFAULT_TRAITS, computeAge, PersonaForm } from '../components/persona-fields.js';
import { TagInput } from '../components/tag-input.js';

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function Badge(props) {
  return h('span', {
    style: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#fff', background: props.color || '#64748b', whiteSpace: 'nowrap' }
  }, props.children);
}

function StatCard(props) {
  return h('div', { className: 'stat-card' },
    h('div', { className: 'stat-label' }, props.label),
    h('div', { className: 'stat-value', style: props.color ? { color: props.color } : null }, props.value),
    props.sub && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, props.sub)
  );
}

function ProgressBar(props) {
  var pct = props.total > 0 ? Math.round((props.value / props.total) * 100) : 0;
  var barColor = pct < 50 ? 'var(--success)' : pct < 80 ? 'var(--warning)' : 'var(--danger)';
  return h('div', { style: { marginBottom: 12 } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } },
      h('span', { style: { color: 'var(--text-secondary)' } }, props.label),
      h('span', { style: { color: 'var(--text-muted)' } }, props.value + ' / ' + props.total + (props.unit ? ' ' + props.unit : ''))
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' } },
      h('div', { style: { flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' } },
        h('div', { style: { width: Math.min(pct, 100) + '%', height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s' } })
      ),
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 40 } }, pct + '%')
    )
  );
}

function EmptyState(props) {
  return h('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
    props.icon && h('div', { style: { fontSize: 32, marginBottom: 8, opacity: 0.5 } }, props.icon),
    h('div', { style: { fontSize: 14, marginBottom: 8 } }, props.message || 'No data'),
    props.action && h('button', { className: 'btn btn-primary btn-sm', onClick: props.action.onClick }, props.action.label)
  );
}

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n) {
  if (n == null) return '$0.00';
  return '$' + Number(n).toFixed(4);
}

function riskBadgeClass(level) {
  if (!level) return 'badge badge-neutral';
  var l = level.toLowerCase();
  if (l === 'low') return 'badge badge-success';
  if (l === 'medium') return 'badge badge-warning';
  if (l === 'high' || l === 'critical') return 'badge badge-danger';
  return 'badge badge-neutral';
}

// ════════════════════════════════════════════════════════════
// OVERVIEW SECTION
// ════════════════════════════════════════════════════════════

function formatTime(iso) { return iso ? new Date(iso).toLocaleString() : '-'; }

var MEMORY_CATEGORIES = [
  { value: 'org_knowledge', label: 'Org Knowledge', color: '#6366f1' },
  { value: 'interaction_pattern', label: 'Interaction Pattern', color: '#0ea5e9' },
  { value: 'preference', label: 'Preference', color: '#10b981' },
  { value: 'correction', label: 'Correction', color: '#f59e0b' },
  { value: 'skill', label: 'Skill', color: '#8b5cf6' },
  { value: 'context', label: 'Context', color: '#64748b' },
  { value: 'reflection', label: 'Reflection', color: '#ec4899' },
];

function memCatColor(cat) { var f = MEMORY_CATEGORIES.find(function(c) { return c.value === cat; }); return f ? f.color : '#64748b'; }
function memCatLabel(cat) { var f = MEMORY_CATEGORIES.find(function(c) { return c.value === cat; }); return f ? f.label : cat; }
function importanceBadgeColor(imp) { return imp === 'critical' ? '#ef4444' : imp === 'high' ? '#f97316' : imp === 'normal' ? '#0ea5e9' : '#64748b'; }

var CATEGORY_COLORS = {
  code_of_conduct: '#6366f1', communication: '#0ea5e9', data_handling: '#f59e0b',
  brand_voice: '#ec4899', security: '#ef4444', escalation: '#8b5cf6', custom: '#64748b'
};
var ENFORCEMENT_COLORS = { mandatory: '#ef4444', recommended: '#f59e0b', informational: '#0ea5e9' };

// ════════════════════════════════════════════════════════════
// OVERVIEW SECTION
// ════════════════════════════════════════════════════════════

function OverviewSection(props) {
  var agent = props.agent;
  var engineAgent = props.engineAgent;
  var profile = props.profile;
  var agentId = props.agentId;
  var reload = props.reload;
  var agents = props.agents;

  var app = useApp();
  var toast = app.toast;

  var _usage = useState(null);
  var usageData = _usage[0]; var setUsageData = _usage[1];
  var _onb = useState(null);
  var onboardingStatus = _onb[0]; var setOnboardingStatus = _onb[1];
  var _guard = useState(null);
  var guardrailStatus = _guard[0]; var setGuardrailStatus = _guard[1];
  var _work = useState(null);
  var workforceStatus = _work[0]; var setWorkforceStatus = _work[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _acting = useState('');
  var acting = _acting[0]; var setActing = _acting[1];

  useEffect(function() {
    setLoading(true);
    Promise.all([
      engineCall('/agents/' + agentId + '/usage').catch(function() { return null; }),
      engineCall('/onboarding/status/' + agentId).catch(function() { return null; }),
      engineCall('/guardrails/status/' + agentId).catch(function() { return null; }),
      engineCall('/workforce/status/' + agentId).catch(function() { return null; })
    ]).then(function(results) {
      setUsageData(results[0]);
      setOnboardingStatus(results[1]);
      setGuardrailStatus(results[2]);
      setWorkforceStatus(results[3]);
      setLoading(false);
    });
  }, [agentId]);

  // ─── Action Handlers ───────────────────────────────────

  var doAction = function(action) {
    setActing(action);
    engineCall('/agents/' + agentId + '/' + action, { method: 'POST' })
      .then(function() { toast('Agent ' + action + ' successful', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
  };

  var pauseAgent = function() {
    setActing('pause');
    engineCall('/guardrails/pause/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual pause from dashboard' }) })
      .then(function() { toast('Agent paused', 'success'); setGuardrailStatus(function(s) { return Object.assign({}, s, { paused: true }); }); reload(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
  };

  var resumeAgent = function() {
    setActing('resume');
    engineCall('/guardrails/resume/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual resume from dashboard' }) })
      .then(function() { toast('Agent resumed', 'success'); setGuardrailStatus(function(s) { return Object.assign({}, s, { paused: false }); }); reload(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
  };

  var clockIn = function() {
    setActing('clockIn');
    engineCall('/workforce/clock-in/' + agentId, { method: 'POST' })
      .then(function() { toast('Agent clocked in', 'success'); setWorkforceStatus(function(s) { return Object.assign({}, s, { clockedIn: true }); }); reload(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
  };

  var clockOut = function() {
    setActing('clockOut');
    engineCall('/workforce/clock-out/' + agentId, { method: 'POST' })
      .then(function() { toast('Agent clocked out', 'success'); setWorkforceStatus(function(s) { return Object.assign({}, s, { clockedIn: false }); }); reload(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
  };

  var deleteAgent = async function() {
    var ok = await showConfirm({
      title: 'Delete Agent',
      message: 'Are you sure you want to delete agent "' + (engineAgent?.name || agentId) + '"? This will remove all associated data.',
      warning: 'This action cannot be undone.',
      danger: true,
      confirmText: 'Delete Agent'
    });
    if (!ok) return;
    setActing('delete');
    try {
      await apiCall('/bridge/agents/' + agentId, { method: 'DELETE' });
      toast('Agent deleted', 'success');
      if (props.onBack) props.onBack();
    } catch (err) {
      toast(err.message, 'error');
    }
    setActing('');
  };

  var initiateOnboarding = function() {
    setActing('onboard');
    engineCall('/onboarding/initiate/' + agentId, { method: 'POST', body: JSON.stringify({ orgId: getOrgId() }) })
      .then(function() { toast('Onboarding initiated', 'success'); setOnboardingStatus(function(s) { return Object.assign({}, s, { onboarded: true, status: 'in_progress' }); }); reload(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
  };

  // ─── Derived Values ─────────────────────────────────────

  var config = engineAgent?.config || {};
  var identity = config.identity || {};
  var agentName = identity.name || engineAgent?.name || 'Unnamed Agent';
  var agentRole = identity.role || config.role || 'agent';
  var agentModel = typeof config.model === 'string' ? config.model : (config.model ? (config.model.modelId || config.model.provider || 'unknown') : 'unknown');
  var agentDesc = identity.description || config.description || '';
  var createdAt = engineAgent?.createdAt || engineAgent?.created_at || agent?.createdAt;
  var agentState = engineAgent?.state || engineAgent?.status || agent?.status || 'unknown';
  var stateColor = { running: 'success', active: 'success', deploying: 'info', starting: 'info', ready: 'primary', degraded: 'warning', error: 'danger', stopped: 'neutral', draft: 'neutral' }[agentState] || 'neutral';
  var resolvedMgr = resolveManager(config, props.agents);
  var managerName = resolvedMgr ? resolvedMgr.name : null;
  var managerEmail = resolvedMgr && resolvedMgr.type === 'external' ? resolvedMgr.email : null;

  // Personality traits — can be object (keyed) or array
  var rawTraits = identity.personality_traits || identity.traits || config.personality_traits || {};
  var traitList = Array.isArray(rawTraits) ? rawTraits : Object.values(rawTraits);

  var uu = usageData?.usage || usageData || {};
  var tokensToday = uu.tokensToday || uu.today?.tokens || 0;
  var costToday = uu.costToday || uu.today?.cost || 0;
  var uptime = uu.uptime || uu.uptimeSeconds || usageData?.health?.uptime || usageData?.uptime || 0;
  var errorRate = uu.errorRate || uu.today?.errorRate || 0;
  var activeSessions = uu.activeSessionCount || uu.activeSessions || uu.sessions?.active || 0;

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading overview...');
  }

  return h(Fragment, null,

    // ─── Agent Summary Card ─────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 } },
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 } }, 'Status'),
            h('span', { className: 'badge badge-' + stateColor, style: { textTransform: 'capitalize' } }, agentState)
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 } }, 'Role'),
            h('span', { style: { fontSize: 13, fontWeight: 500, textTransform: 'capitalize' } }, agentRole)
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 } }, 'Model'),
            h('span', { style: { fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono, monospace)' } }, agentModel)
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 } }, 'Reports To'),
            managerName
              ? h('span', null,
                  h('span', { style: { fontSize: 13, fontWeight: 500, color: 'var(--primary)', cursor: 'pointer' }, onClick: function() { if (resolvedMgr && resolvedMgr.type === 'internal') { /* navigate */ } } }, managerName),
                  managerEmail && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' } }, managerEmail)
                )
              : h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No manager')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 } }, 'Created'),
            h('span', { style: { fontSize: 13, fontWeight: 500 } }, createdAt ? new Date(createdAt).toLocaleDateString() : '—')
          )
        ),
        agentDesc && h('div', { style: { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 } }, agentDesc),
        traitList.length > 0 && h('div', { style: { marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 } },
          traitList.map(function(trait, i) {
            return h('span', { key: i, className: 'badge badge-neutral', style: { fontSize: 11, textTransform: 'capitalize' } }, String(trait));
          })
        )
      )
    ),

    // ─── Stats Grid ─────────────────────────────────────
    h('div', { className: 'stat-grid', style: { marginBottom: 20 } },
      h(StatCard, { label: 'Tokens Today', value: formatNumber(tokensToday) }),
      h(StatCard, { label: 'Cost Today', value: formatCost(costToday) }),
      h(StatCard, { label: 'Uptime', value: formatUptime(uptime) }),
      h(StatCard, { label: 'Error Rate', value: (errorRate * 100).toFixed(1) + '%', color: errorRate > 0.05 ? 'var(--danger)' : undefined }),
      h(StatCard, { label: 'Active Sessions', value: String(activeSessions) })
    ),

    // ─── Status Indicators ──────────────────────────────
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 } },

      // Onboarding Status
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('span', null, 'Onboarding')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
            onboardingStatus?.onboarded
              ? h('span', { className: 'badge badge-success' }, I.check(), ' Onboarded')
              : onboardingStatus?.totalPolicies > 0
                ? h('span', { className: 'badge badge-info' }, I.clock(), ' In Progress (' + (onboardingStatus.acknowledgedPolicies || 0) + '/' + onboardingStatus.totalPolicies + ')')
                : h('span', { className: 'badge badge-warning' }, 'Not Onboarded')
          ),
          onboardingStatus?.totalPolicies > 0 && !onboardingStatus?.onboarded && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } },
            'Agent will complete onboarding automatically on first run.'
          ),
          !onboardingStatus?.onboarded && h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
            !onboardingStatus?.totalPolicies && h('button', {
              className: 'btn btn-primary btn-sm',
              disabled: acting === 'onboard',
              onClick: initiateOnboarding
            }, acting === 'onboard' ? 'Starting...' : 'Start Onboarding'),
            h('button', {
              className: 'btn btn-ghost btn-sm',
              disabled: acting === 'forceComplete',
              onClick: function() {
                setActing('forceComplete');
                var initFirst = !onboardingStatus?.totalPolicies
                  ? engineCall('/onboarding/initiate/' + agentId, { method: 'POST', body: JSON.stringify({ orgId: getOrgId() }) })
                  : Promise.resolve();
                initFirst.then(function() {
                  return engineCall('/onboarding/force-complete/' + agentId, { method: 'POST', body: JSON.stringify({ adminId: 'admin' }) });
                })
                  .then(function() { toast('Onboarding completed', 'success'); reload(); })
                  .catch(function(err) { toast(err.message, 'error'); })
                  .finally(function() { setActing(null); });
              }
            }, acting === 'forceComplete' ? 'Completing...' : 'Skip — Force Complete')
          )
        )
      ),

      // Guardrails Status
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('span', null, 'Guardrails')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
            guardrailStatus?.paused
              ? h('span', { className: 'badge badge-warning' }, I.pause(), ' Paused')
              : h('span', { className: 'badge badge-success' }, I.shield(), ' Active')
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
            'Interventions: ', h('strong', null, String(guardrailStatus?.interventionCount || guardrailStatus?.interventions || 0))
          )
        )
      ),

      // Workforce Status
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('span', null, 'Workforce')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
            workforceStatus?.clockedIn
              ? h('span', { className: 'badge badge-success' }, I.check(), ' Clocked In')
              : h('span', { className: 'badge badge-neutral' }, I.clock(), ' Clocked Out')
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
            'Active Tasks: ', h('strong', null, String(workforceStatus?.taskCount || workforceStatus?.activeTasks || 0))
          )
        )
      )
    ),

    // ─── Quick Actions Bar ──────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Quick Actions')),
      h('div', { className: 'card-body', style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },

        // Reset state (when in error/degraded)
        (agentState === 'error' || agentState === 'degraded' || agentState === 'draft') && h('button', {
          className: 'btn btn-secondary btn-sm',
          disabled: !!acting,
          onClick: function() {
            setActing('reset');
            engineCall('/agents/' + agentId + '/reset-state', { method: 'POST' })
              .then(function() { toast('Agent state reset to ready', 'success'); reload(); })
              .catch(function(err) { toast(err.message, 'error'); })
              .finally(function() { setActing(''); });
          }
        }, I.refresh(), ' Reset State'),

        // Deploy / Stop / Restart
        (agentState !== 'running' && agentState !== 'active') && h('button', {
          className: 'btn btn-primary btn-sm',
          disabled: !!acting,
          onClick: function() { doAction('deploy'); }
        }, I.play(), ' Deploy'),

        (agentState === 'running' || agentState === 'active') && h('button', {
          className: 'btn btn-danger btn-sm',
          disabled: !!acting,
          onClick: function() { doAction('stop'); }
        }, I.stop(), ' Stop'),

        (agentState === 'running' || agentState === 'active' || agentState === 'stopped') && h('button', {
          className: 'btn btn-secondary btn-sm',
          disabled: !!acting,
          onClick: function() { doAction('restart'); }
        }, I.refresh(), ' Restart'),

        // Pause / Resume
        guardrailStatus && !guardrailStatus.paused && h('button', {
          className: 'btn btn-secondary btn-sm',
          disabled: !!acting,
          onClick: pauseAgent
        }, I.pause(), ' Pause'),

        guardrailStatus && guardrailStatus.paused && h('button', {
          className: 'btn btn-secondary btn-sm',
          disabled: !!acting,
          onClick: resumeAgent
        }, I.play(), ' Resume'),

        // Clock In / Out
        workforceStatus && !workforceStatus.clockedIn && h('button', {
          className: 'btn btn-secondary btn-sm',
          disabled: !!acting,
          onClick: clockIn
        }, I.clock(), ' Clock In'),

        workforceStatus && workforceStatus.clockedIn && h('button', {
          className: 'btn btn-secondary btn-sm',
          disabled: !!acting,
          onClick: clockOut
        }, I.clock(), ' Clock Out'),

        // Spacer
        h('div', { style: { flex: 1 } }),

        // Delete
        h('button', {
          className: 'btn btn-danger btn-sm',
          disabled: acting === 'delete',
          onClick: deleteAgent
        }, I.trash(), ' Delete Agent')
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// PERSONAL DETAILS SECTION
// ════════════════════════════════════════════════════════════

var ROLE_OPTIONS = ['agent', 'assistant', 'manager', 'specialist', 'analyst', 'coordinator', 'advisor', 'support', 'engineer', 'other'];

function PersonalDetailsSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var identity = config.identity || {};

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];

  // Build form state from current config
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];

  // Initialize form when entering edit mode
  var startEdit = function() {
    setForm({
      name: identity.name || config.name || config.displayName || ea.name || '',
      displayName: config.displayName || identity.name || '',
      email: identity.email || config.email || ea.email || '',
      role: identity.role || config.role || 'agent',
      avatar: identity.avatar || null,
      gender: identity.gender || '',
      dateOfBirth: identity.dateOfBirth || '',
      maritalStatus: identity.maritalStatus || '',
      culturalBackground: identity.culturalBackground || '',
      language: identity.language || 'en-us',
      description: identity.description || config.description || '',
      traits: identity.traits && typeof identity.traits === 'object' && !Array.isArray(identity.traits)
        ? Object.assign({}, DEFAULT_TRAITS, identity.traits)
        : Object.assign({}, DEFAULT_TRAITS),
    });
    setEditing(true);
  };

  var set = function(key, value) {
    setForm(function(prev) {
      var next = Object.assign({}, prev);
      next[key] = value;
      return next;
    });
  };

  var saveDetails = function() {
    setSaving(true);
    var updates = {
      name: form.name,
      displayName: form.displayName,
      email: form.email,
      description: form.description,
      identity: Object.assign({}, identity, {
        role: form.role,
        avatar: form.avatar,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        maritalStatus: form.maritalStatus,
        culturalBackground: form.culturalBackground,
        language: form.language,
        description: form.description,
        traits: form.traits,
        name: form.name,
        email: form.email,
      }),
    };

    // Use hot-update if running, else regular config update
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning
      ? '/agents/' + agentId + '/hot-update'
      : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';

    engineCall(endpoint, {
      method: method,
      body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' })
    }).then(function() {
      toast('Personal details saved', 'success');
      setEditing(false);
      setSaving(false);
      reload();
    }).catch(function(err) {
      toast('Failed to save: ' + err.message, 'error');
      setSaving(false);
    });
  };

  // ─── Display helpers ───────────────────────────────────

  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 };
  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var fieldGroupStyle = { marginBottom: 16 };
  var rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
  var selectStyle = Object.assign({}, inputStyle, { cursor: 'pointer' });

  // ─── View Mode ─────────────────────────────────────────

  if (!editing) {
    var displayName = identity.name || config.name || config.displayName || ea.name || '—';
    var displayDisplayName = config.displayName || identity.name || '—';
    var displayEmail = identity.email || config.email || ea.email || '—';
    var displayRole = identity.role || config.role || 'agent';
    var displayAvatar = identity.avatar || '';
    var displayGender = identity.gender || '—';
    var displayDob = identity.dateOfBirth || '—';
    var displayMarital = identity.maritalStatus || '—';
    var displayCulture = identity.culturalBackground || '';
    var displayLang = identity.language || '—';
    var displayDesc = identity.description || config.description || '—';
    var displayTraits = identity.traits && typeof identity.traits === 'object' && !Array.isArray(identity.traits) ? identity.traits : {};
    var age = computeAge(identity.dateOfBirth);

    var cultureName = displayCulture ? (CULTURES.find(function(c) { return c.id === displayCulture; }) || {}).name || displayCulture : '—';
    var langName = displayLang !== '—' ? (LANGUAGES.find(function(l) { return l.id === displayLang; }) || {}).name || displayLang : '—';

    var fieldView = function(label, value) {
      return h('div', { style: fieldGroupStyle },
        h('div', { style: labelStyle }, label),
        h('div', { style: { fontSize: 14, color: 'var(--text-primary)' } }, value)
      );
    };

    return h(Fragment, null,
      // Header with Edit button
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Personal Details'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit Details')
      ),

      // Avatar + Identity Card
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 20, padding: 20 } },
          h('div', { style: {
            width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
            background: displayAvatar && displayAvatar.length > 2 ? 'none' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 700, color: '#fff', overflow: 'hidden',
            border: '3px solid var(--border)'
          } },
            displayAvatar && displayAvatar.length > 2
              ? h('img', { src: displayAvatar, style: { width: '100%', height: '100%', objectFit: 'cover' } })
              : (displayName !== '—' ? displayName.charAt(0).toUpperCase() : '?')
          ),
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 22, fontWeight: 700, marginBottom: 4 } }, displayName),
            displayDisplayName !== '—' && h('div', { style: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 } }, displayDisplayName),
            h('div', { style: { fontSize: 13, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)', marginBottom: 6 } }, displayEmail),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { className: 'badge badge-primary', style: { textTransform: 'capitalize' } }, displayRole),
              age !== null && h('span', { style: { padding: '2px 10px', background: 'var(--accent-soft)', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600, color: 'var(--accent-text)' } }, age + ' years old')
            )
          )
        )
      ),

      // Identity Details Grid
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Identity Details'),
        h('div', { style: rowStyle },
          fieldView('Gender', displayGender),
          fieldView('Date of Birth', displayDob !== '—' ? displayDob + (age !== null ? ' (' + age + ' years old)' : '') : '—')
        ),
        h('div', { style: rowStyle },
          fieldView('Marital Status', displayMarital),
          fieldView('Language', langName)
        ),
        fieldView('Cultural Background', cultureName)
      ),

      // Description
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Description'),
        fieldView('Description', displayDesc)
      ),

      // Personality Traits
      h('div', { className: 'card', style: { padding: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Personality Traits'),
        Object.keys(displayTraits).length > 0
          ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
              Object.entries(displayTraits).map(function(pair) {
                return h('div', { key: pair[0], style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)' } },
                  h('span', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' } }, pair[0] + ':'),
                  h('span', { style: { fontSize: 13, fontWeight: 600, textTransform: 'capitalize' } }, pair[1])
                );
              })
            )
          : h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No traits configured')
      )
    );
  }

  // ─── Edit Mode — uses shared PersonaForm ───────────────

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Personal Details'),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: saveDetails }, saving ? 'Saving...' : 'Save Changes'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel')
      )
    ),

    // Core Identity Fields (name, display name, email, role)
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Core Identity'),

      h('div', { style: rowStyle },
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Name'),
          h('input', { className: 'input', type: 'text', value: form.name, placeholder: 'Agent name', onChange: function(e) { set('name', e.target.value); } })
        ),
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Display Name'),
          h('input', { className: 'input', type: 'text', value: form.displayName, placeholder: 'Display name (optional)', onChange: function(e) { set('displayName', e.target.value); } })
        )
      ),

      h('div', { style: rowStyle },
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Email'),
          h('input', { className: 'input', type: 'email', value: form.email, placeholder: 'agent@company.com', onChange: function(e) { set('email', e.target.value); } })
        ),
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Role'),
          h('select', { className: 'input', style: { cursor: 'pointer' }, value: form.role, onChange: function(e) { set('role', e.target.value); } },
            ROLE_OPTIONS.map(function(r) { return h('option', { key: r, value: r }, r.charAt(0).toUpperCase() + r.slice(1)); })
          )
        )
      ),

      h('div', { style: fieldGroupStyle },
        h('label', { style: labelStyle }, 'Description'),
        h('textarea', { className: 'input', style: { minHeight: 80, resize: 'vertical' }, value: form.description, placeholder: 'Describe what this agent does...', onChange: function(e) { set('description', e.target.value); } })
      )
    ),

    // Persona Form (shared component: avatar, DOB, gender, marital, culture, language, traits)
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Persona & Identity'),
      h(PersonaForm, { form: form, set: set, toast: toast })
    ),

    // Bottom save bar
    h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      h('button', { className: 'btn btn-primary', disabled: saving, onClick: saveDetails }, saving ? 'Saving...' : 'Save All Changes'),
      h('button', { className: 'btn btn-ghost', onClick: function() { setEditing(false); } }, 'Cancel')
    )
  );
}

// ════════════════════════════════════════════════════════════
// PERMISSIONS SECTION
// ════════════════════════════════════════════════════════════

var ALL_SIDE_EFFECTS = ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'runs-code', 'modifies-files', 'deletes-data', 'controls-device', 'financial'];
var ALL_RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

function PermissionsSection(props) {
  var initialProfile = props.profile;
  var agentId = props.agentId;
  var reload = props.reload;

  var app = useApp();
  var toast = app.toast;

  var _policies = useState([]);
  var policies = _policies[0]; var setPolicies = _policies[1];
  var _presets = useState([]);
  var presets = _presets[0]; var setPresets = _presets[1];
  var _soulCategories = useState({});
  var soulCategories = _soulCategories[0]; var setSoulCategories = _soulCategories[1];
  var _soulMeta = useState({});
  var soulMeta = _soulMeta[0]; var setSoulMeta = _soulMeta[1];
  var _soulSearch = useState('');
  var soulSearch = _soulSearch[0]; var setSoulSearch = _soulSearch[1];
  var _soulOpen = useState(false);
  var soulOpen = _soulOpen[0]; var setSoulOpen = _soulOpen[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _profile = useState(initialProfile);
  var profile = _profile[0]; var setProfile = _profile[1];
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];
  var _applyingSoul = useState(null);
  var applyingSoul = _applyingSoul[0]; var setApplyingSoul = _applyingSoul[1];

  // Sync when parent passes new profile
  useEffect(function() { setProfile(initialProfile); }, [initialProfile]);

  // Load policies + presets + soul templates
  useEffect(function() {
    setLoading(true);
    Promise.all([
      engineCall('/policies/agent/' + agentId + '?orgId=' + getOrgId()).catch(function() { return { policies: [] }; }),
      engineCall('/profiles/presets').catch(function() { return { presets: [] }; }),
      engineCall('/souls/by-category').catch(function() { return { categories: {}, categoryMeta: {} }; })
    ]).then(function(results) {
      setPolicies(results[0].policies || results[0] || []);
      setPresets(results[1].presets || results[1] || []);
      setSoulCategories(results[2].categories || {});
      setSoulMeta(results[2].categoryMeta || {});
      setLoading(false);
    });
  }, [agentId]);

  // ─── Apply Preset ──────────────────────────────────────

  var applyPreset = function(presetName) {
    setSaving(true);
    engineCall('/profiles/' + agentId + '/apply-preset', {
      method: 'POST',
      body: JSON.stringify({ presetName: presetName })
    }).then(function(res) {
      toast('Preset "' + presetName + '" applied', 'success');
      setProfile(res.profile || res);
      setSaving(false);
      setEditing(false);
      reload();
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setSaving(false);
    });
  };

  // ─── Apply Soul Template ────────────────────────────────

  var applySoulTemplate = function(tpl) {
    setApplyingSoul(tpl.id);

    // 1. Update agent config with role, personality, description from soul
    var configUpdates = {
      identity: {
        role: tpl.identity && tpl.identity.role || tpl.name || 'agent',
        personality: tpl.personality || '',
        description: tpl.description || '',
      },
      description: tpl.description || '',
    };

    var isRunning = props.engineAgent && (props.engineAgent.state === 'running' || props.engineAgent.state === 'active');
    var configEndpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var configMethod = isRunning ? 'POST' : 'PATCH';

    // 2. Apply permission preset if soul suggests one
    var presetName = tpl.suggestedPreset || null;

    Promise.all([
      engineCall(configEndpoint, {
        method: configMethod,
        body: JSON.stringify({ updates: configUpdates, updatedBy: 'dashboard' })
      }).catch(function(err) { return { error: err.message }; }),
      presetName
        ? engineCall('/profiles/' + agentId + '/apply-preset', {
            method: 'POST',
            body: JSON.stringify({ presetName: presetName })
          }).catch(function(err) { return { error: err.message }; })
        : Promise.resolve(null)
    ]).then(function(results) {
      if (results[1] && results[1].profile) {
        setProfile(results[1].profile);
      }
      toast('Role template "' + tpl.name + '" applied', 'success');
      setApplyingSoul(null);
      reload();
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setApplyingSoul(null);
    });
  };

  // ─── Edit Mode Init ────────────────────────────────────

  var startEdit = function() {
    var p = profile || {};
    var rl = p.rateLimits || p.rate_limits || {};
    var con = p.constraints || {};
    var appr = p.requireApproval || p.approvalSettings || p.approval || {};
    setForm({
      maxRiskLevel: p.maxRiskLevel || p.max_risk_level || 'medium',
      blockedSideEffects: (p.blockedSideEffects || p.blocked_side_effects || []).slice(),
      sandboxMode: p.sandboxMode || p.sandbox_mode || false,
      approvalEnabled: appr.enabled !== undefined ? appr.enabled : false,
      approvalRiskLevels: (appr.forRiskLevels || appr.riskLevels || appr.risk_levels || []).slice(),
      approvalSideEffects: (appr.forSideEffects || appr.sideEffects || appr.side_effects || []).slice(),
      approvalTimeout: appr.timeoutMinutes || appr.timeout || 30,
      callsPerMinute: rl.toolCallsPerMinute || rl.callsPerMinute || rl.calls_per_minute || 30,
      callsPerHour: rl.toolCallsPerHour || rl.callsPerHour || rl.calls_per_hour || 500,
      callsPerDay: rl.toolCallsPerDay || rl.callsPerDay || rl.calls_per_day || 5000,
      externalPerHour: rl.externalActionsPerHour || rl.externalPerHour || rl.external_per_hour || 50,
      maxConcurrentTasks: con.maxConcurrentTasks || con.max_concurrent_tasks || 5,
      maxSessionDuration: con.maxSessionDurationMinutes || con.maxSessionDuration || con.max_session_duration || 480,
    });
    setEditing(true);
  };

  var setField = function(key, value) {
    setForm(function(prev) { var n = Object.assign({}, prev); n[key] = value; return n; });
  };

  var toggleInArray = function(key, item) {
    setForm(function(prev) {
      var arr = (prev[key] || []).slice();
      var idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(item);
      var n = Object.assign({}, prev); n[key] = arr; return n;
    });
  };

  // ─── Save Custom Profile ───────────────────────────────

  var saveProfile = function() {
    setSaving(true);
    var updated = {
      id: agentId,
      name: (profile && profile.name) || 'Custom',
      maxRiskLevel: form.maxRiskLevel,
      blockedSideEffects: form.blockedSideEffects,
      sandboxMode: form.sandboxMode,
      requireApproval: {
        enabled: form.approvalEnabled,
        forRiskLevels: form.approvalRiskLevels,
        forSideEffects: form.approvalSideEffects,
        approvers: [],
        timeoutMinutes: Number(form.approvalTimeout) || 30,
      },
      rateLimits: {
        toolCallsPerMinute: Number(form.callsPerMinute) || 0,
        toolCallsPerHour: Number(form.callsPerHour) || 0,
        toolCallsPerDay: Number(form.callsPerDay) || 0,
        externalActionsPerHour: Number(form.externalPerHour) || 0,
      },
      constraints: {
        maxConcurrentTasks: Number(form.maxConcurrentTasks) || 5,
        maxSessionDurationMinutes: Number(form.maxSessionDuration) || 480,
        sandboxMode: form.sandboxMode,
      },
      createdAt: (profile && profile.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    engineCall('/profiles/' + agentId, {
      method: 'PUT',
      body: JSON.stringify(updated)
    }).then(function(res) {
      toast('Permissions saved', 'success');
      setProfile(res.profile || updated);
      setEditing(false);
      setSaving(false);
      reload();
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setSaving(false);
    });
  };

  // ─── Loading ───────────────────────────────────────────

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading permissions...');
  }

  // ─── Shared styles ─────────────────────────────────────

  var CATEGORY_COLORS = {
    code_of_conduct: '#6366f1', communication: '#0ea5e9', data_handling: '#f59e0b',
    brand_voice: '#ec4899', security: '#ef4444', escalation: '#8b5cf6', custom: '#64748b'
  };
  var ENFORCEMENT_COLORS = { mandatory: '#ef4444', recommended: '#f59e0b', informational: '#0ea5e9' };
  var inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, width: '100%' };
  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

  // ─── Edit Mode ─────────────────────────────────────────

  if (editing) {
    return h(Fragment, null,
      // Header
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Permissions'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: saveProfile }, saving ? 'Saving...' : 'Save'),
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel')
        )
      ),

      // Max Risk Level
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 8px', fontSize: 14, fontWeight: 600 } }, 'Maximum Risk Level'),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'The highest risk level of tools this agent can use.'),
        h('div', { style: { display: 'flex', gap: 8 } },
          ALL_RISK_LEVELS.map(function(level) {
            return h('button', { key: level, className: 'btn btn-sm' + (form.maxRiskLevel === level ? ' btn-primary' : ' btn-secondary'), onClick: function() { setField('maxRiskLevel', level); }, style: { textTransform: 'capitalize' } }, level);
          })
        )
      ),

      // Blocked Side Effects
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 8px', fontSize: 14, fontWeight: 600 } }, 'Blocked Side Effects'),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Actions this agent is never allowed to perform.'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          ALL_SIDE_EFFECTS.map(function(se) {
            var active = form.blockedSideEffects.indexOf(se) >= 0;
            return h('div', { key: se, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--danger)' : 'var(--border)'), background: active ? 'rgba(239,68,68,0.1)' : 'var(--bg-secondary)', fontSize: 12 }, onClick: function() { toggleInArray('blockedSideEffects', se); } },
              h('input', { type: 'checkbox', checked: active, readOnly: true, style: { accentColor: 'var(--danger)' } }),
              se
            );
          })
        )
      ),

      // Approval Settings
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, 'Approval Settings'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
          h('label', { style: { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
            h('input', { type: 'checkbox', checked: form.approvalEnabled, onChange: function() { setField('approvalEnabled', !form.approvalEnabled); } }),
            'Require approval for risky actions'
          )
        ),
        form.approvalEnabled && h(Fragment, null,
          h('div', { style: { marginBottom: 14 } },
            h('div', { style: labelStyle }, 'Risk levels requiring approval:'),
            h('div', { style: { display: 'flex', gap: 8 } },
              ALL_RISK_LEVELS.map(function(level) {
                var active = form.approvalRiskLevels.indexOf(level) >= 0;
                return h('button', { key: level, className: 'btn btn-sm' + (active ? ' btn-primary' : ' btn-secondary'), onClick: function() { toggleInArray('approvalRiskLevels', level); }, style: { textTransform: 'capitalize' } }, level);
              })
            )
          ),
          h('div', { style: { marginBottom: 14 } },
            h('div', { style: labelStyle }, 'Side effects requiring approval:'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              ALL_SIDE_EFFECTS.map(function(se) {
                var active = form.approvalSideEffects.indexOf(se) >= 0;
                return h('button', { key: se, className: 'btn btn-sm' + (active ? ' btn-info' : ' btn-ghost'), onClick: function() { toggleInArray('approvalSideEffects', se); }, style: { fontSize: 11 } }, se);
              })
            )
          ),
          h('div', { style: { maxWidth: 200 } },
            h('div', { style: labelStyle }, 'Timeout (minutes)'),
            h('input', { type: 'number', style: inputStyle, value: form.approvalTimeout, min: 1, onChange: function(e) { setField('approvalTimeout', e.target.value); } })
          )
        )
      ),

      // Rate Limits
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, 'Rate Limits'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', null, h('div', { style: labelStyle }, 'Calls / Minute'), h('input', { type: 'number', style: inputStyle, value: form.callsPerMinute, min: 0, onChange: function(e) { setField('callsPerMinute', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'Calls / Hour'), h('input', { type: 'number', style: inputStyle, value: form.callsPerHour, min: 0, onChange: function(e) { setField('callsPerHour', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'Calls / Day'), h('input', { type: 'number', style: inputStyle, value: form.callsPerDay, min: 0, onChange: function(e) { setField('callsPerDay', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'External Actions / Hour'), h('input', { type: 'number', style: inputStyle, value: form.externalPerHour, min: 0, onChange: function(e) { setField('externalPerHour', e.target.value); } }))
        )
      ),

      // Constraints
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, 'Constraints'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
          h('div', null, h('div', { style: labelStyle }, 'Max Concurrent Tasks'), h('input', { type: 'number', style: inputStyle, value: form.maxConcurrentTasks, min: 1, onChange: function(e) { setField('maxConcurrentTasks', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'Max Session Duration (min)'), h('input', { type: 'number', style: inputStyle, value: form.maxSessionDuration, min: 1, onChange: function(e) { setField('maxSessionDuration', e.target.value); } }))
        ),
        h('label', { style: { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
          h('input', { type: 'checkbox', checked: form.sandboxMode, onChange: function() { setField('sandboxMode', !form.sandboxMode); } }),
          'Sandbox Mode (restrict to safe tools only)'
        )
      ),

      // Bottom save bar
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h('button', { className: 'btn btn-primary', disabled: saving, onClick: saveProfile }, saving ? 'Saving...' : 'Save Permissions'),
        h('button', { className: 'btn btn-ghost', onClick: function() { setEditing(false); } }, 'Cancel')
      )
    );
  }

  // ─── View Mode ─────────────────────────────────────────

  // ─── Soul Template / Role Selector ──────────────────────

  var filteredSoulCategories = {};
  var soulEntries = Object.entries(soulCategories);
  for (var si = 0; si < soulEntries.length; si++) {
    var sCat = soulEntries[si][0];
    var sTemplates = soulEntries[si][1];
    if (!soulSearch) { filteredSoulCategories[sCat] = sTemplates; continue; }
    var sq = soulSearch.toLowerCase();
    var sFiltered = sTemplates.filter(function(t) { return t.name.toLowerCase().indexOf(sq) >= 0 || t.description.toLowerCase().indexOf(sq) >= 0 || (t.tags || []).some(function(tag) { return tag.indexOf(sq) >= 0; }); });
    if (sFiltered.length > 0) filteredSoulCategories[sCat] = sFiltered;
  }

  var soulCard = h('div', { className: 'card', style: { marginBottom: 20 } },
    h('div', { className: 'card-header', style: { cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }, onClick: function() { setSoulOpen(!soulOpen); } },
      h('span', null, 'Role Templates'),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 } },
        h('span', null, Object.values(soulCategories).reduce(function(sum, arr) { return sum + arr.length; }, 0) + ' templates'),
        h('span', { style: { transition: 'transform 0.2s', transform: soulOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', lineHeight: 1 } },
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('polyline', { points: '6 9 12 15 18 9' }))
        )
      )
    ),
    soulOpen && h('div', { className: 'card-body' },
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Apply a role template to configure this agent\'s personality, description, skills, and permissions in one click.'),
      h('div', { style: { marginBottom: 12 } },
        h('input', { className: 'input', type: 'text', placeholder: 'Search role templates...', value: soulSearch, onChange: function(e) { setSoulSearch(e.target.value); }, style: { maxWidth: 300 } })
      ),
      Object.keys(filteredSoulCategories).length > 0
        ? Object.entries(filteredSoulCategories).map(function(entry) {
            var cat = entry[0];
            var templates = entry[1];
            var meta = soulMeta[cat] || {};
            return h('div', { key: cat, style: { marginBottom: 16 } },
              h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } },
                (meta.icon || '') + ' ' + (meta.name || cat)
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 } },
                templates.map(function(tpl) {
                  var isApplying = applyingSoul === tpl.id;
                  return h('div', { key: tpl.id, className: 'preset-card', style: { padding: '10px 14px', cursor: isApplying ? 'wait' : 'pointer', opacity: isApplying ? 0.6 : 1 }, onClick: function() { if (!isApplying && !applyingSoul) applySoulTemplate(tpl); } },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, tpl.name),
                      isApplying && h('span', { style: { fontSize: 11, color: 'var(--accent)' } }, 'Applying...')
                    ),
                    h('p', { style: { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' } }, tpl.description ? (tpl.description.length > 80 ? tpl.description.slice(0, 80) + '...' : tpl.description) : ''),
                    tpl.suggestedPreset && h('span', { className: 'badge badge-info', style: { fontSize: 10, marginTop: 6 } }, tpl.suggestedPreset)
                  );
                })
              )
            );
          })
        : h('div', { style: { fontSize: 13, color: 'var(--text-muted)', padding: 12 } }, 'No role templates found.')
    )
  );

  // Preset selector card (always visible)
  var presetCard = h('div', { className: 'card', style: { marginBottom: 20 } },
    h('div', { className: 'card-header' }, h('span', null, 'Apply a Permission Preset')),
    h('div', { className: 'card-body' },
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Select a preset to quickly configure this agent\'s permissions. This will replace the current profile.'),
      presets.length > 0
        ? h('div', { className: 'preset-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 } },
            presets.map(function(p) {
              var isActive = profile && (profile.name === p.name);
              return h('div', { key: p.name, className: 'preset-card' + (isActive ? ' selected' : ''), style: { padding: '12px 16px', borderRadius: 8, border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'), cursor: 'pointer', background: isActive ? 'var(--accent-soft)' : 'var(--bg-secondary)' }, onClick: function() { if (!isActive) applyPreset(p.name); } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                  h('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, p.name),
                  isActive && h('span', { style: { color: 'var(--accent)' } }, I.check())
                ),
                h('p', { style: { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 6px' } }, p.description || ''),
                p.maxRiskLevel && h('span', { className: riskBadgeClass(p.maxRiskLevel), style: { fontSize: 10 } }, 'Risk: ' + p.maxRiskLevel)
              );
            })
          )
        : h('div', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No presets available.')
    )
  );

  if (!profile) {
    return h(Fragment, null,
      soulCard,
      presetCard,
      h(EmptyState, { icon: I.shield(), message: 'No permission profile assigned to this agent. Select a role template or preset above, or create a custom profile.' }),
      h('div', { style: { textAlign: 'center', marginTop: 12 } },
        h('button', { className: 'btn btn-primary', onClick: startEdit }, 'Create Custom Profile')
      )
    );
  }

  // ─── Derived Values ─────────────────────────────────────

  var maxRisk = profile.maxRiskLevel || profile.max_risk_level || 'medium';
  var blockedSideEffects = profile.blockedSideEffects || profile.blocked_side_effects || [];
  var sandboxMode = profile.sandboxMode || profile.sandbox_mode || false;
  var approval = profile.requireApproval || profile.approvalSettings || profile.approval || {};
  var approvalEnabled = approval.enabled !== undefined ? approval.enabled : false;
  var approvalRiskLevels = approval.forRiskLevels || approval.riskLevels || approval.risk_levels || [];
  var approvalSideEffects = approval.forSideEffects || approval.sideEffects || approval.side_effects || [];
  var approvalTimeout = approval.timeoutMinutes || approval.timeout || 30;
  var rateLimits = profile.rateLimits || profile.rate_limits || {};
  var callsPerMin = rateLimits.toolCallsPerMinute || rateLimits.callsPerMinute || rateLimits.calls_per_minute || 0;
  var callsPerHr = rateLimits.toolCallsPerHour || rateLimits.callsPerHour || rateLimits.calls_per_hour || 0;
  var callsPerDay = rateLimits.toolCallsPerDay || rateLimits.callsPerDay || rateLimits.calls_per_day || 0;
  var externalPerHr = rateLimits.externalActionsPerHour || rateLimits.externalPerHour || rateLimits.external_per_hour || 0;
  var constraints = profile.constraints || {};
  var maxConcurrent = constraints.maxConcurrentTasks || constraints.max_concurrent_tasks || '-';
  var maxSessionDuration = constraints.maxSessionDurationMinutes || constraints.maxSessionDuration || constraints.max_session_duration || '-';
  var allowedIPs = constraints.allowedIPs || constraints.allowed_ips || [];
  var skills = profile.skills || profile.tools || {};
  var blockedTools = skills.blocked || [];
  var allowedTools = skills.allowed || [];

  return h(Fragment, null,

    // Role template selector
    soulCard,

    // Preset selector
    presetCard,

    // ─── Current Profile + Edit Button ──────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Current Permission Profile'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit')
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
          h('h3', { style: { fontSize: 16, fontWeight: 600, margin: 0 } }, profile.name || profile.profileName || 'Custom Profile'),
          h('span', { className: riskBadgeClass(maxRisk) }, 'Max Risk: ' + maxRisk)
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 } },
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)', marginRight: 4 } }, 'Blocked Side Effects:'),
          blockedSideEffects.length > 0
            ? blockedSideEffects.map(function(se, i) {
                return h('span', { key: i, className: 'badge badge-danger', style: { fontSize: 11 } }, se);
              })
            : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'None')
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Sandbox Mode:'),
          h('span', { className: sandboxMode ? 'badge badge-warning' : 'badge badge-neutral' }, sandboxMode ? 'Enabled' : 'Disabled')
        )
      )
    ),

    // ─── Approval Settings Card ─────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Approval Settings')),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
          h('span', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Approval Required:'),
          h('span', { className: approvalEnabled ? 'badge badge-success' : 'badge badge-neutral' }, approvalEnabled ? 'Enabled' : 'Disabled')
        ),
        approvalEnabled && h(Fragment, null,
          h('div', { style: { marginBottom: 12 } },
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 } }, 'Risk Levels Requiring Approval:'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              approvalRiskLevels.length > 0
                ? approvalRiskLevels.map(function(rl, i) { return h('span', { key: i, className: riskBadgeClass(rl) }, rl); })
                : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'None')
            )
          ),
          h('div', { style: { marginBottom: 12 } },
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 } }, 'Side Effects Requiring Approval:'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              approvalSideEffects.length > 0
                ? approvalSideEffects.map(function(se, i) { return h('span', { key: i, className: 'badge badge-info', style: { fontSize: 11 } }, se); })
                : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'None')
            )
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Timeout: ', h('strong', null, approvalTimeout + ' minutes'))
        )
      )
    ),

    // ─── Rate Limits Card ───────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Rate Limits')),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Calls / Minute'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(callsPerMin || 'Unlimited'))),
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Calls / Hour'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(callsPerHr || 'Unlimited'))),
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Calls / Day'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(callsPerDay || 'Unlimited'))),
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'External / Hour'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(externalPerHr || 'Unlimited')))
        )
      )
    ),

    // ─── Constraints Card ───────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Constraints')),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Max Concurrent Tasks'), h('div', { style: { fontSize: 14, fontWeight: 600 } }, String(maxConcurrent))),
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Max Session Duration'), h('div', { style: { fontSize: 14, fontWeight: 600 } }, String(maxSessionDuration))),
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Sandbox Mode'), h('span', { className: sandboxMode ? 'badge badge-warning' : 'badge badge-neutral' }, sandboxMode ? 'Enabled' : 'Disabled')),
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Allowed IPs'), allowedIPs.length > 0 ? h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, allowedIPs.map(function(ip, i) { return h('span', { key: i, className: 'badge badge-neutral', style: { fontSize: 11, fontFamily: 'monospace' } }, ip); })) : h('div', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Any'))
        )
      )
    ),

    // ─── Tools Card ─────────────────────────────────────
    (blockedTools.length > 0 || allowedTools.length > 0) && h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Tool Overrides')),
      h('div', { className: 'card-body' },
        blockedTools.length > 0 && h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
          h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Blocked:'),
          blockedTools.map(function(t, i) { return h('span', { key: i, className: 'badge badge-danger', style: { fontSize: 11 } }, t); })
        ),
        allowedTools.length > 0 && h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Allowed:'),
          allowedTools.map(function(t, i) { return h('span', { key: i, className: 'badge badge-success', style: { fontSize: 11 } }, t); })
        )
      )
    ),

    // ─── Applicable Policies Table ──────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Applicable Policies')),
      policies.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Name'), h('th', null, 'Category'), h('th', null, 'Enforcement'), h('th', null, 'Status'))
              ),
              h('tbody', null,
                policies.map(function(p, i) {
                  var cat = p.category || 'custom';
                  var enf = p.enforcement || p.enforcementType || 'informational';
                  var enabled = p.enabled !== false;
                  return h('tr', { key: p.id || i },
                    h('td', { style: { fontWeight: 500, fontSize: 13 } }, p.name || p.title || 'Untitled'),
                    h('td', null, h(Badge, { color: CATEGORY_COLORS[cat] || '#64748b' }, cat.replace(/_/g, ' '))),
                    h('td', null, h(Badge, { color: ENFORCEMENT_COLORS[enf] || '#64748b' }, enf)),
                    h('td', null, h('span', { className: enabled ? 'badge badge-success' : 'badge badge-neutral' }, enabled ? 'Enabled' : 'Disabled'))
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No policies applied to this agent.')
          )
    )
  );
}

// ════════════════════════════════════════════════════════════
// BUDGET SECTION
// ════════════════════════════════════════════════════════════

function BudgetSection(props) {
  var agentId = props.agentId;

  var app = useApp();
  var toast = app.toast;

  var _usage = useState(null);
  var usageData = _usage[0]; var setUsageData = _usage[1];
  var _budget = useState(null);
  var budgetConfig = _budget[0]; var setBudgetConfig = _budget[1];
  var _alerts = useState([]);
  var budgetAlerts = _alerts[0]; var setBudgetAlerts = _alerts[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({ dailyTokens: 0, dailyCost: 0, monthlyTokens: 0, monthlyCost: 0 });
  var form = _form[0]; var setForm = _form[1];

  var loadData = function() {
    setLoading(true);
    Promise.all([
      engineCall('/agents/' + agentId + '/usage').catch(function() { return null; }),
      engineCall('/agents/' + agentId + '/budget').catch(function() { return null; }),
      engineCall('/budget/alerts?agentId=' + agentId).catch(function() { return { alerts: [] }; })
    ]).then(function(results) {
      setUsageData(results[0]);
      // Unwrap: GET /agents/:id/budget returns { budgetConfig: {...} }
      var bc = results[1]?.budgetConfig || results[1] || null;
      setBudgetConfig(bc);
      setBudgetAlerts(results[2]?.alerts || results[2] || []);
      if (bc) {
        setForm({
          dailyTokens: bc.dailyTokens || bc.daily_tokens || bc.limits?.dailyTokens || 0,
          dailyCost: bc.dailyCost || bc.daily_cost || bc.limits?.dailyCost || 0,
          monthlyTokens: bc.monthlyTokens || bc.monthly_tokens || bc.limits?.monthlyTokens || 0,
          monthlyCost: bc.monthlyCost || bc.monthly_cost || bc.limits?.monthlyCost || 0
        });
      }
      setLoading(false);
    });
  };

  useEffect(function() { loadData(); }, [agentId]);

  // ─── Derived Usage Values ───────────────────────────────

  var bu = usageData?.usage || usageData || {};
  var tokensToday = bu.tokensToday || bu.today?.tokens || 0;
  var tokensMonth = bu.tokensThisMonth || bu.tokensMonth || bu.month?.tokens || 0;
  var costToday = bu.costToday || bu.today?.cost || 0;
  var costMonth = bu.costThisMonth || bu.costMonth || bu.month?.cost || 0;
  var sessionsToday = bu.sessionsToday || bu.today?.sessions || 0;
  var errorsToday = bu.errorsToday || bu.today?.errors || 0;

  // ─── Budget Limits ──────────────────────────────────────

  var limits = budgetConfig?.limits || budgetConfig || null;
  var hasBudget = limits && (limits.dailyTokens || limits.daily_tokens || limits.dailyCost || limits.daily_cost || limits.monthlyTokens || limits.monthly_tokens || limits.monthlyCost || limits.monthly_cost || form.dailyTokens || form.dailyCost || form.monthlyTokens || form.monthlyCost);
  var budgetDailyTokens = limits?.dailyTokens || limits?.daily_tokens || form.dailyTokens || 0;
  var budgetDailyCost = limits?.dailyCost || limits?.daily_cost || form.dailyCost || 0;
  var budgetMonthlyTokens = limits?.monthlyTokens || limits?.monthly_tokens || form.monthlyTokens || 0;
  var budgetMonthlyCost = limits?.monthlyCost || limits?.monthly_cost || form.monthlyCost || 0;

  // ─── Save Budget ────────────────────────────────────────

  var saveBudget = function() {
    setSaving(true);
    engineCall('/agents/' + agentId + '/budget', {
      method: 'PUT',
      body: JSON.stringify({
        dailyTokens: Number(form.dailyTokens) || 0,
        dailyCost: Number(form.dailyCost) || 0,
        monthlyTokens: Number(form.monthlyTokens) || 0,
        monthlyCost: Number(form.monthlyCost) || 0
      })
    })
      .then(function() { toast('Budget updated', 'success'); setEditing(false); loadData(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setSaving(false); });
  };

  // ─── Acknowledge Alert ──────────────────────────────────

  var acknowledgeAlert = function(alertId) {
    engineCall('/budget/alerts/' + alertId + '/acknowledge', { method: 'POST' })
      .then(function() { toast('Alert acknowledged', 'success'); loadData(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading budget data...');
  }

  return h(Fragment, null,

    // ─── Usage Stats Grid ───────────────────────────────
    h('div', { className: 'stat-grid', style: { marginBottom: 20 } },
      h(StatCard, { label: 'Tokens Today', value: formatNumber(tokensToday) }),
      h(StatCard, { label: 'Tokens This Month', value: formatNumber(tokensMonth) }),
      h(StatCard, { label: 'Cost Today', value: formatCost(costToday) }),
      h(StatCard, { label: 'Cost This Month', value: formatCost(costMonth) }),
      h(StatCard, { label: 'Sessions Today', value: String(sessionsToday) }),
      h(StatCard, { label: 'Errors Today', value: String(errorsToday), color: errorsToday > 0 ? 'var(--danger)' : undefined })
    ),

    // ─── Budget Limits Card ─────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Budget Limits'),
        !editing && h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setEditing(true); } }, 'Edit Budget')
      ),
      h('div', { className: 'card-body' },

        // Edit Mode
        editing ? h('div', null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Daily Token Limit'),
              h('input', {
                className: 'input', type: 'number', value: form.dailyTokens,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { dailyTokens: e.target.value }); }); }
              })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Daily Cost Limit ($)'),
              h('input', {
                className: 'input', type: 'number', step: '0.01', value: form.dailyCost,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { dailyCost: e.target.value }); }); }
              })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Monthly Token Limit'),
              h('input', {
                className: 'input', type: 'number', value: form.monthlyTokens,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { monthlyTokens: e.target.value }); }); }
              })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Monthly Cost Limit ($)'),
              h('input', {
                className: 'input', type: 'number', step: '0.01', value: form.monthlyCost,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { monthlyCost: e.target.value }); }); }
              })
            )
          ),
          h('div', { style: { display: 'flex', gap: 10 } },
            h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: saveBudget }, saving ? 'Saving...' : 'Save Budget'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel')
          )
        )

        // Display Mode
        : hasBudget ? h('div', null,
            budgetDailyTokens > 0 && h(ProgressBar, { label: 'Daily Tokens', value: tokensToday, total: budgetDailyTokens, unit: 'tokens' }),
            budgetDailyCost > 0 && h(ProgressBar, { label: 'Daily Cost', value: costToday, total: budgetDailyCost, unit: '$' }),
            budgetMonthlyTokens > 0 && h(ProgressBar, { label: 'Monthly Tokens', value: tokensMonth, total: budgetMonthlyTokens, unit: 'tokens' }),
            budgetMonthlyCost > 0 && h(ProgressBar, { label: 'Monthly Cost', value: costMonth, total: budgetMonthlyCost, unit: '$' }),
            !budgetDailyTokens && !budgetDailyCost && !budgetMonthlyTokens && !budgetMonthlyCost && h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'No budget limits configured.')
          )
        : h('div', { style: { textAlign: 'center', padding: 20 } },
            h('div', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 } }, 'No budget limits configured.'),
            h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setEditing(true); } }, I.plus(), ' Set Budget')
          )
      )
    ),

    // ─── Budget Alerts Table ────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Budget Alerts')),
      budgetAlerts.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Budget Type'),
                  h('th', null, 'Current'),
                  h('th', null, 'Limit'),
                  h('th', null, 'Status'),
                  h('th', null, '')
                )
              ),
              h('tbody', null,
                budgetAlerts.map(function(alert, i) {
                  var alertType = alert.type || alert.alertType || 'warning';
                  var budgetType = alert.budgetType || alert.budget_type || 'tokens';
                  var current = alert.currentValue || alert.current || 0;
                  var limit = alert.limitValue || alert.limit || 0;
                  var acknowledged = alert.acknowledged || alert.acked || false;
                  var time = alert.createdAt || alert.created_at || alert.timestamp;
                  var typeColor = alertType === 'critical' ? 'badge-danger' : alertType === 'warning' ? 'badge-warning' : 'badge-info';

                  return h('tr', { key: alert.id || i },
                    h('td', { style: { fontSize: 12 } }, time ? new Date(time).toLocaleString() : '-'),
                    h('td', null, h('span', { className: 'badge ' + typeColor }, alertType)),
                    h('td', null, h('span', { className: 'badge badge-neutral' }, budgetType)),
                    h('td', { style: { fontFamily: 'monospace', fontSize: 12 } }, budgetType === 'cost' ? formatCost(current) : formatNumber(current)),
                    h('td', { style: { fontFamily: 'monospace', fontSize: 12 } }, budgetType === 'cost' ? formatCost(limit) : formatNumber(limit)),
                    h('td', null, h('span', { className: acknowledged ? 'badge badge-neutral' : 'badge badge-warning' }, acknowledged ? 'Acknowledged' : 'Pending')),
                    h('td', null,
                      !acknowledged && h('button', {
                        className: 'btn btn-ghost btn-sm',
                        onClick: function() { acknowledgeAlert(alert.id); }
                      }, I.check(), ' Ack')
                    )
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No budget alerts.')
          )
    )
  );
}
// --- ActivitySection ------------------------------------------------

function ActivitySection(props) {
  var agentId = props.agentId;
  var app = useApp();
  var toast = app.toast;

  var _tab = useState('events');
  var activeTab = _tab[0]; var setActiveTab = _tab[1];

  var _events = useState([]);
  var events = _events[0]; var setEvents = _events[1];
  var _toolCalls = useState([]);
  var toolCalls = _toolCalls[0]; var setToolCalls = _toolCalls[1];
  var _journal = useState([]);
  var journalEntries = _journal[0]; var setJournalEntries = _journal[1];
  var _loading = useState(false);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _selectedItem = useState(null);
  var selectedItem = _selectedItem[0]; var setSelectedItem = _selectedItem[1];

  // Filtering
  var _typeFilter = useState('');
  var typeFilter = _typeFilter[0]; var setTypeFilter = _typeFilter[1];
  var _searchFilter = useState('');
  var searchFilter = _searchFilter[0]; var setSearchFilter = _searchFilter[1];
  var _dateFrom = useState('');
  var dateFrom = _dateFrom[0]; var setDateFrom = _dateFrom[1];
  var _dateTo = useState('');
  var dateTo = _dateTo[0]; var setDateTo = _dateTo[1];

  // Pagination
  var PAGE_SIZE = 25;
  var _page = useState(1);
  var page = _page[0]; var setPage = _page[1];

  var loadEvents = function() {
    engineCall('/activity/events?agentId=' + agentId + '&limit=200')
      .then(function(d) { setEvents(d.events || []); })
      .catch(function() {});
  };
  var loadToolCalls = function() {
    engineCall('/activity/tool-calls?agentId=' + agentId + '&limit=200')
      .then(function(d) { setToolCalls(d.toolCalls || []); })
      .catch(function() {});
  };
  var loadJournal = function() {
    engineCall('/journal?agentId=' + agentId + '&orgId=' + getOrgId() + '&limit=200')
      .then(function(d) { setJournalEntries(d.entries || []); })
      .catch(function() {});
  };

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/activity/events?agentId=' + agentId + '&limit=200').then(function(d) { setEvents(d.events || []); }).catch(function() {}),
      engineCall('/activity/tool-calls?agentId=' + agentId + '&limit=200').then(function(d) { setToolCalls(d.toolCalls || []); }).catch(function() {}),
      engineCall('/journal?agentId=' + agentId + '&orgId=' + getOrgId() + '&limit=200').then(function(d) { setJournalEntries(d.entries || []); }).catch(function() {}),
    ]).then(function() { setLoading(false); }).catch(function() { setLoading(false); });
  };

  useEffect(loadAll, []);

  // Reset page when filters change
  useEffect(function() { setPage(1); }, [typeFilter, searchFilter, dateFrom, dateTo, activeTab]);

  var rollback = function(id) {
    showConfirm({ title: 'Rollback Action', message: 'Reverse this journal entry?', warning: true, confirmText: 'Rollback' }).then(function(ok) {
      if (!ok) return;
      engineCall('/journal/' + id + '/rollback', { method: 'POST', body: JSON.stringify({}) })
        .then(function(r) { if (r.success) { toast('Rolled back', 'success'); loadJournal(); } else toast('Failed: ' + (r.error || ''), 'error'); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var refreshCurrent = function() {
    if (activeTab === 'events') loadEvents();
    else if (activeTab === 'tools') loadToolCalls();
    else if (activeTab === 'journal') loadJournal();
  };

  // Filter helper
  var filterItems = function(items) {
    var filtered = items;
    if (typeFilter) {
      filtered = filtered.filter(function(item) {
        var t = (item.type || item.eventType || item.tool || item.toolName || item.actionType || '').toLowerCase();
        return t.includes(typeFilter.toLowerCase());
      });
    }
    if (searchFilter) {
      var q = searchFilter.toLowerCase();
      filtered = filtered.filter(function(item) {
        var text = JSON.stringify(item).toLowerCase();
        return text.includes(q);
      });
    }
    if (dateFrom) {
      var fromTs = new Date(dateFrom).getTime();
      filtered = filtered.filter(function(item) {
        var ts = new Date(item.timestamp || item.createdAt).getTime();
        return ts >= fromTs;
      });
    }
    if (dateTo) {
      var toTs = new Date(dateTo + 'T23:59:59').getTime();
      filtered = filtered.filter(function(item) {
        var ts = new Date(item.timestamp || item.createdAt).getTime();
        return ts <= toTs;
      });
    }
    return filtered;
  };

  // Get current data source
  var currentItems = activeTab === 'events' ? events : activeTab === 'tools' ? toolCalls : journalEntries;
  var filtered = filterItems(currentItems);
  var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Extract unique types for filter dropdown
  var uniqueTypes = [];
  var typeSet = {};
  currentItems.forEach(function(item) {
    var t = item.type || item.eventType || item.tool || item.toolName || item.actionType || '';
    if (t && !typeSet[t]) { typeSet[t] = true; uniqueTypes.push(t); }
  });
  uniqueTypes.sort();

  var filterBarStyle = { display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' };
  var filterInputStyle = { padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Activity'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, filtered.length + ' items'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: refreshCurrent }, I.refresh())
      )
    ),
    h('div', { style: { borderBottom: '1px solid var(--border)' } },
      h('div', { className: 'tabs', style: { padding: '0 16px' } },
        h('div', { className: 'tab' + (activeTab === 'events' ? ' active' : ''), onClick: function() { setActiveTab('events'); } }, 'Events (' + events.length + ')'),
        h('div', { className: 'tab' + (activeTab === 'tools' ? ' active' : ''), onClick: function() { setActiveTab('tools'); } }, 'Tool Calls (' + toolCalls.length + ')'),
        h('div', { className: 'tab' + (activeTab === 'journal' ? ' active' : ''), onClick: function() { setActiveTab('journal'); } }, 'Journal (' + journalEntries.length + ')')
      )
    ),

    // Filter bar
    h('div', { style: filterBarStyle },
      h('select', { style: Object.assign({}, filterInputStyle, { width: 140 }), value: typeFilter, onChange: function(e) { setTypeFilter(e.target.value); } },
        h('option', { value: '' }, 'All types'),
        uniqueTypes.map(function(t) { return h('option', { key: t, value: t }, t); })
      ),
      h('input', { style: Object.assign({}, filterInputStyle, { width: 180 }), type: 'text', placeholder: 'Search...', value: searchFilter, onChange: function(e) { setSearchFilter(e.target.value); } }),
      h('input', { style: Object.assign({}, filterInputStyle, { width: 130 }), type: 'date', value: dateFrom, onChange: function(e) { setDateFrom(e.target.value); }, title: 'From date' }),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'to'),
      h('input', { style: Object.assign({}, filterInputStyle, { width: 130 }), type: 'date', value: dateTo, onChange: function(e) { setDateTo(e.target.value); }, title: 'To date' }),
      (typeFilter || searchFilter || dateFrom || dateTo) && h('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 11 }, onClick: function() { setTypeFilter(''); setSearchFilter(''); setDateFrom(''); setDateTo(''); } }, 'Clear')
    ),

    h('div', { className: 'card-body-flush' },

      // Events Tab
      activeTab === 'events' && (
        paged.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, filtered.length === 0 && events.length > 0 ? 'No events match filters' : 'No events recorded')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Time'), h('th', null, 'Type'), h('th', null, 'Details'))
              ),
              h('tbody', null,
                paged.map(function(ev, i) {
                  var details = typeof ev.data === 'object' ? JSON.stringify(ev.data) : (ev.details || ev.data || '-');
                  return h('tr', { key: ev.id || i, onClick: function() { setSelectedItem(ev); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(ev.timestamp || ev.createdAt).toLocaleString()),
                    h('td', null, h('span', { className: 'badge badge-info' }, ev.type || ev.eventType || '-')),
                    h('td', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' } }, details)
                  );
                })
              )
            )
      ),

      // Tool Calls Tab
      activeTab === 'tools' && (
        paged.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, filtered.length === 0 && toolCalls.length > 0 ? 'No tool calls match filters' : 'No tool calls recorded')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Time'), h('th', null, 'Tool'), h('th', null, 'Duration'), h('th', null, 'Status'))
              ),
              h('tbody', null,
                paged.map(function(tc, i) {
                  var statusClass = tc.success === true ? 'badge badge-success' : tc.success === false ? 'badge badge-danger' : 'badge badge-neutral';
                  var statusLabel = tc.success === true ? 'OK' : tc.success === false ? 'Failed' : (tc.status || 'Pending');
                  return h('tr', { key: tc.id || i, onClick: function() { setSelectedItem(tc); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(tc.timestamp || tc.createdAt).toLocaleString()),
                    h('td', null, h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, tc.tool || tc.toolName || '-')),
                    h('td', null, tc.durationMs ? tc.durationMs + 'ms' : '-'),
                    h('td', null, h('span', { className: statusClass }, statusLabel))
                  );
                })
              )
            )
      ),

      // Journal Tab
      activeTab === 'journal' && (
        paged.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, filtered.length === 0 && journalEntries.length > 0 ? 'No journal entries match filters' : 'No journal entries')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Time'), h('th', null, 'Tool'), h('th', null, 'Action Type'), h('th', null, 'Reversible'), h('th', null, 'Status'), h('th', null, 'Actions'))
              ),
              h('tbody', null,
                paged.map(function(e) {
                  return h('tr', { key: e.id, onClick: function(evt) { if (evt.target.tagName === 'BUTTON' || evt.target.closest('button')) return; setSelectedItem(e); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(e.createdAt).toLocaleString()),
                    h('td', null, e.toolName || e.toolId || '-'),
                    h('td', null, h('span', { className: 'badge-tag' }, e.actionType || '-')),
                    h('td', null, e.reversible ? '\u2705' : '\u274C'),
                    h('td', null, e.reversed ? h('span', { className: 'status-badge status-warning' }, 'Rolled Back') : h('span', { className: 'status-badge status-success' }, 'Active')),
                    h('td', null, e.reversible && !e.reversed && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { rollback(e.id); } }, I.undo(), ' Rollback'))
                  );
                })
              )
            )
      ),

      // Pagination
      totalPages > 1 && h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--border)' } },
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(1); }, style: { fontSize: 11 } }, '«'),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(page - 1); }, style: { fontSize: 11 } }, '‹'),
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 80, textAlign: 'center' } }, 'Page ' + page + ' / ' + totalPages),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(page + 1); }, style: { fontSize: 11 } }, '›'),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(totalPages); }, style: { fontSize: 11 } }, '»')
      )
    ),

    // Detail Modal
    selectedItem && (function() {
      var item = selectedItem;
      var typeLabel = item.type || item.eventType || item.tool || item.toolName || item.actionType || 'Detail';
      var typeColor = typeLabel === 'error' ? 'var(--danger)' : typeLabel === 'deployed' || typeLabel === 'started' ? 'var(--success)' : typeLabel === 'stopped' ? 'var(--warning)' : 'var(--accent)';
      return h(DetailModal, {
        title: activeTab === 'events' ? 'Event Detail' : activeTab === 'tools' ? 'Tool Call Detail' : 'Journal Entry Detail',
        onClose: function() { setSelectedItem(null); },
        badge: { label: typeLabel, color: typeColor },
        data: item,
        exclude: ['agentId']
      });
    })()
  );
}

// --- CommunicationSection -------------------------------------------

function CommunicationSection(props) {
  var agentId = props.agentId;
  var agents = props.agents || [];
  var app = useApp();
  var toast = app.toast;

  var agentData = buildAgentDataMap(agents);

  var _tab = useState('all');
  var activeTab = _tab[0]; var setActiveTab = _tab[1];

  var _messages = useState([]);
  var messages = _messages[0]; var setMessages = _messages[1];
  var _inbox = useState([]);
  var inbox = _inbox[0]; var setInbox = _inbox[1];
  var _topology = useState(null);
  var topology = _topology[0]; var setTopology = _topology[1];
  var _showSend = useState(false);
  var showSend = _showSend[0]; var setShowSend = _showSend[1];
  var _form = useState({ toAgentId: '', subject: '', content: '', priority: 'normal' });
  var form = _form[0]; var setForm = _form[1];

  var loadMessages = function() {
    engineCall('/messages?agentId=' + agentId + '&orgId=' + getOrgId() + '&limit=50')
      .then(function(d) { setMessages(d.messages || []); })
      .catch(function() {});
  };
  var loadInbox = function() {
    engineCall('/messages/inbox/' + agentId + '?orgId=' + getOrgId())
      .then(function(d) { setInbox(d.messages || []); })
      .catch(function() {});
  };
  var loadTopology = function() {
    engineCall('/messages/topology?agentId=' + agentId + '&orgId=' + getOrgId())
      .then(function(d) { setTopology(d.topology || d || null); })
      .catch(function() {});
  };

  var loadAll = function() {
    loadMessages();
    loadInbox();
    loadTopology();
  };

  useEffect(loadAll, []);

  var markRead = function(id) {
    engineCall('/messages/' + id + '/read', { method: 'POST', body: JSON.stringify({}) })
      .then(function() { toast('Message marked as read', 'success'); loadInbox(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var sendMessage = function() {
    if (!form.toAgentId || !form.subject) { toast('Recipient and subject are required', 'error'); return; }
    var body = {
      fromAgentId: agentId,
      toAgentId: form.toAgentId,
      orgId: getOrgId(),
      subject: form.subject,
      content: form.content,
      priority: form.priority
    };
    engineCall('/messages', { method: 'POST', body: JSON.stringify(body) })
      .then(function() {
        toast('Message sent', 'success');
        setShowSend(false);
        setForm({ toAgentId: '', subject: '', content: '', priority: 'normal' });
        loadMessages();
        loadInbox();
        loadTopology();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var refreshCurrent = function() {
    if (activeTab === 'all') loadMessages();
    else if (activeTab === 'inbox') loadInbox();
    else if (activeTab === 'topology') loadTopology();
  };

  var directionBadge = function(msg) {
    var dir = msg.direction || (msg.fromAgentId === agentId ? 'sent' : 'received');
    if (dir === 'sent' || dir === 'outbound') return h('span', { className: 'badge badge-primary' }, 'Sent');
    if (dir === 'received' || dir === 'inbound') return h('span', { className: 'badge badge-success' }, 'Received');
    return h('span', { className: 'badge badge-neutral' }, dir);
  };

  var priorityBadge = function(p) {
    if (p === 'urgent') return h('span', { className: 'badge badge-danger' }, 'Urgent');
    if (p === 'high') return h('span', { className: 'badge badge-warning' }, 'High');
    if (p === 'normal') return h('span', { className: 'badge badge-neutral' }, 'Normal');
    return h('span', { className: 'badge badge-neutral' }, p || 'Normal');
  };

  // Derive topology partners list
  var partners = [];
  if (topology) {
    var edges = topology.edges || [];
    var partnerMap = {};
    edges.forEach(function(edge) {
      var partnerId = null;
      var sent = 0;
      var received = 0;
      if (edge.from === agentId) {
        partnerId = edge.to;
        sent = edge.count || edge.messageCount || 1;
      } else if (edge.to === agentId) {
        partnerId = edge.from;
        received = edge.count || edge.messageCount || 1;
      }
      if (partnerId) {
        if (!partnerMap[partnerId]) partnerMap[partnerId] = { id: partnerId, sent: 0, received: 0 };
        partnerMap[partnerId].sent += sent;
        partnerMap[partnerId].received += received;
      }
    });
    partners = Object.keys(partnerMap).map(function(k) { return partnerMap[k]; });
  }

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Communication'),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowSend(true); } }, I.plus(), ' Send Message'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: refreshCurrent }, I.refresh(), ' Refresh')
      )
    ),
    h('div', { style: { borderBottom: '1px solid var(--border)' } },
      h('div', { className: 'tabs', style: { padding: '0 16px' } },
        h('div', { className: 'tab' + (activeTab === 'all' ? ' active' : ''), onClick: function() { setActiveTab('all'); } }, 'All Messages'),
        h('div', { className: 'tab' + (activeTab === 'inbox' ? ' active' : ''), onClick: function() { setActiveTab('inbox'); } }, 'Inbox'),
        h('div', { className: 'tab' + (activeTab === 'topology' ? ' active' : ''), onClick: function() { setActiveTab('topology'); } }, 'Topology')
      )
    ),
    h('div', { className: 'card-body-flush' },

      // All Messages Tab
      activeTab === 'all' && (
        messages.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No messages found for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Direction'),
                  h('th', null, 'From'),
                  h('th', null, 'To'),
                  h('th', null, 'Subject'),
                  h('th', null, 'Type'),
                  h('th', null, 'Priority')
                )
              ),
              h('tbody', null,
                messages.map(function(msg, i) {
                  return h('tr', { key: msg.id || i },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(msg.createdAt || msg.timestamp).toLocaleString()),
                    h('td', null, directionBadge(msg)),
                    h('td', null, renderAgentBadge(msg.fromAgentId, agentData)),
                    h('td', null, renderAgentBadge(msg.toAgentId, agentData)),
                    h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 } }, msg.subject || '-'),
                    h('td', null, msg.type ? h('span', { className: 'badge badge-info' }, msg.type) : '-'),
                    h('td', null, priorityBadge(msg.priority))
                  );
                })
              )
            )
      ),

      // Inbox Tab
      activeTab === 'inbox' && (
        inbox.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No inbox messages for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'From'),
                  h('th', null, 'Subject'),
                  h('th', null, 'Type'),
                  h('th', null, 'Priority'),
                  h('th', null, 'Status'),
                  h('th', null, 'Actions')
                )
              ),
              h('tbody', null,
                inbox.map(function(msg, i) {
                  var isRead = msg.read || msg.status === 'read';
                  return h('tr', { key: msg.id || i, style: !isRead ? { fontWeight: 500 } : {} },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(msg.createdAt || msg.timestamp).toLocaleString()),
                    h('td', null, renderAgentBadge(msg.fromAgentId, agentData)),
                    h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 } }, msg.subject || '-'),
                    h('td', null, msg.type ? h('span', { className: 'badge badge-info' }, msg.type) : '-'),
                    h('td', null, priorityBadge(msg.priority)),
                    h('td', null,
                      isRead
                        ? h('span', { className: 'badge badge-neutral' }, 'Read')
                        : h('span', { className: 'badge badge-warning' }, 'Unread')
                    ),
                    h('td', null,
                      !isRead && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { markRead(msg.id); } }, I.check(), ' Mark Read')
                    )
                  );
                })
              )
            )
      ),

      // Topology Tab
      activeTab === 'topology' && (
        partners.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No communication data yet')
          : h('div', { style: { padding: 16 } },
              h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 } }, 'Communication partners for this agent:'),
              h('div', { style: { display: 'grid', gap: 10 } },
                partners.map(function(p) {
                  return h('div', { key: p.id, style: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' } },
                    h('div', { style: { flex: 1 } }, renderAgentBadge(p.id, agentData)),
                    h('div', { style: { display: 'flex', gap: 16, fontSize: 12 } },
                      h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontWeight: 700, fontSize: 16, color: 'var(--info)' } }, p.sent),
                        h('div', { style: { color: 'var(--text-muted)' } }, 'Sent')
                      ),
                      h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontWeight: 700, fontSize: 16, color: 'var(--success)' } }, p.received),
                        h('div', { style: { color: 'var(--text-muted)' } }, 'Received')
                      )
                    )
                  );
                })
              )
            )
      )
    ),

    // Send Message Modal
    showSend && h('div', { className: 'modal-overlay', onClick: function() { setShowSend(false); } },
      h('div', { className: 'modal', style: { maxWidth: 540 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Send Message'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowSend(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'To Agent'),
            h('select', { className: 'input', value: form.toAgentId, onChange: function(e) { setForm(Object.assign({}, form, { toAgentId: e.target.value })); } },
              h('option', { value: '' }, '-- Select Recipient --'),
              agents.filter(function(a) { return a.id !== agentId; }).map(function(a) {
                var name = (a.config && a.config.displayName) || (a.config && a.config.name) || a.name || 'Agent';
                var email = a.config && a.config.email && a.config.email.address;
                return h('option', { key: a.id, value: a.id }, name + (email ? ' (' + email + ')' : ''));
              })
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Subject'),
            h('input', { className: 'input', placeholder: 'Message subject', value: form.subject, onChange: function(e) { setForm(Object.assign({}, form, { subject: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Content'),
            h('textarea', { className: 'input', style: { minHeight: 120 }, placeholder: 'Message content...', value: form.content, onChange: function(e) { setForm(Object.assign({}, form, { content: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Priority'),
            h('select', { className: 'input', value: form.priority, onChange: function(e) { setForm(Object.assign({}, form, { priority: e.target.value })); } },
              h('option', { value: 'low' }, 'Low'),
              h('option', { value: 'normal' }, 'Normal'),
              h('option', { value: 'high' }, 'High'),
              h('option', { value: 'urgent' }, 'Urgent')
            )
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowSend(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: sendMessage }, 'Send Message')
        )
      )
    )
  );
}

// --- MemorySection --------------------------------------------------

function MemorySection(props) {
  var agentId = props.agentId;
  var app = useApp();
  var toast = app.toast;

  var _memories = useState([]);
  var memories = _memories[0]; var setMemories = _memories[1];
  var _stats = useState(null);
  var memoryStats = _stats[0]; var setMemoryStats = _stats[1];
  var _search = useState('');
  var searchQuery = _search[0]; var setSearchQuery = _search[1];
  var _filterCat = useState('');
  var filterCategory = _filterCat[0]; var setFilterCategory = _filterCat[1];
  var _filterImp = useState('');
  var filterImportance = _filterImp[0]; var setFilterImportance = _filterImp[1];
  var _dateFrom = useState('');
  var dateFrom = _dateFrom[0]; var setDateFrom = _dateFrom[1];
  var _dateTo = useState('');
  var dateTo = _dateTo[0]; var setDateTo = _dateTo[1];
  var _page = useState(1);
  var page = _page[0]; var setPage = _page[1];
  var _expanded = useState(null);
  var expandedId = _expanded[0]; var setExpandedId = _expanded[1];
  var _showCreate = useState(false);
  var showCreateModal = _showCreate[0]; var setShowCreateModal = _showCreate[1];
  var _form = useState({ title: '', content: '', category: 'org_knowledge', importance: 'normal', tags: '' });
  var createForm = _form[0]; var setCreateForm = _form[1];

  var PAGE_SIZE = 10;

  var MEMORY_CATEGORIES = [
    { value: 'org_knowledge', label: 'Org Knowledge' },
    { value: 'preference', label: 'Preference' },
    { value: 'interaction_pattern', label: 'Interaction Pattern' },
    { value: 'context', label: 'Context' },
    { value: 'skill', label: 'Skill' },
    { value: 'processed_email', label: 'Processed Email' },
    { value: 'procedure', label: 'Procedure' },
    { value: 'relationship', label: 'Relationship' },
    { value: 'reflection', label: 'Reflection' },
    { value: 'domain_expertise', label: 'Domain Expertise' },
    { value: 'error_pattern', label: 'Error Pattern' }
  ];

  var buildQueryParams = function() {
    var params = '?limit=200';
    if (searchQuery) params += '&search=' + encodeURIComponent(searchQuery);
    if (filterCategory) params += '&category=' + filterCategory;
    if (filterImportance) params += '&importance=' + filterImportance;
    return params;
  };

  var loadMemories = function() {
    engineCall('/memory/agent/' + agentId + buildQueryParams())
      .then(function(d) { setMemories(d.memories || []); setPage(1); })
      .catch(function() {});
  };

  var loadStats = function() {
    engineCall('/memory/agent/' + agentId + '/stats')
      .then(function(d) { setMemoryStats(d.stats || d); })
      .catch(function() {});
  };

  var loadAll = function() { loadMemories(); loadStats(); };

  useEffect(function() { loadAll(); }, [agentId]);
  useEffect(function() { loadMemories(); }, [filterCategory, filterImportance]);

  var handleSearch = function() { loadMemories(); };

  var createMemory = function() {
    var body = {
      agentId: agentId,
      title: createForm.title,
      content: createForm.content,
      category: createForm.category,
      importance: createForm.importance,
      tags: createForm.tags ? createForm.tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : []
    };
    engineCall('/memory', { method: 'POST', body: JSON.stringify(body) })
      .then(function() { toast('Memory created', 'success'); setShowCreateModal(false); setCreateForm({ title: '', content: '', category: 'org_knowledge', importance: 'normal', tags: '' }); loadAll(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var deleteMemory = function(id) {
    showConfirm({
      title: 'Delete Memory',
      message: 'Are you sure you want to delete this memory entry? This action cannot be undone.',
      warning: true,
      confirmText: 'Delete'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/' + id, { method: 'DELETE' })
        .then(function() { toast('Memory deleted', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var pruneStale = function() {
    showConfirm({
      title: 'Prune Stale Memories',
      message: 'This will remove expired and stale memory entries for this agent.',
      warning: true,
      confirmText: 'Prune'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/agent/' + agentId + '/prune', { method: 'POST' })
        .then(function(d) { toast('Pruned ' + (d.deleted || 0) + ' entries', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var runDecay = function() {
    showConfirm({
      title: 'Run Confidence Decay',
      message: 'This will reduce confidence of memories not accessed recently. Decay rate: 10%.',
      warning: true,
      confirmText: 'Run Decay'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/agent/' + agentId + '/decay', { method: 'POST', body: JSON.stringify({ decayRate: 0.1 }) })
        .then(function(d) { toast('Decayed ' + (d.affected || 0) + ' entries', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  // Date filter client-side
  var filtered = memories;
  if (dateFrom) {
    var fromTs = new Date(dateFrom).getTime();
    filtered = filtered.filter(function(m) { return m.createdAt && new Date(m.createdAt).getTime() >= fromTs; });
  }
  if (dateTo) {
    var toTs = new Date(dateTo + 'T23:59:59').getTime();
    filtered = filtered.filter(function(m) { return m.createdAt && new Date(m.createdAt).getTime() <= toTs; });
  }

  var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  var totalMemories = memoryStats ? (memoryStats.totalEntries || memoryStats.total || 0) : 0;
  var categoriesUsed = memoryStats && memoryStats.byCategory ? Object.keys(memoryStats.byCategory).length : 0;
  var avgConfidence = memoryStats && memoryStats.avgConfidence != null ? ((memoryStats.avgConfidence * 100).toFixed(0) + '%') : '-';
  var sourcesCount = memoryStats && memoryStats.bySource ? Object.keys(memoryStats.bySource).length : 0;

  var catColor = function(c) {
    var m = { preference: '#8b5cf6', interaction_pattern: '#ec4899', context: '#3b82f6', skill: '#10b981', processed_email: '#6366f1', org_knowledge: '#f59e0b', procedure: '#14b8a6', relationship: '#f43f5e', reflection: '#a855f7', domain_expertise: '#0ea5e9', error_pattern: '#ef4444' };
    return m[c] || '#64748b';
  };
  var impColor = function(i) {
    var m = { critical: '#ef4444', high: '#f43f5e', normal: '#3b82f6', low: '#64748b' };
    return m[i] || '#64748b';
  };

  var fmtDate = function(d) { if (!d) return '-'; var dt = new Date(d); return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  var fmtTime = function(d) { if (!d) return ''; var dt = new Date(d); return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Memory'),
      h('div', { style: { display: 'flex', gap: 6 } },
        h('button', { className: 'btn btn-ghost btn-sm', onClick: pruneStale, title: 'Prune stale entries' }, I.trash()),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: runDecay, title: 'Run confidence decay' }, I.clock()),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: loadAll }, I.refresh()),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowCreateModal(true); } }, I.plus(), ' Add')
      )
    ),
    h('div', { className: 'card-body', style: { padding: 0 } },

      // Compact stats bar
      h('div', { style: { display: 'flex', gap: 24, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 } },
        h('span', { style: { color: 'var(--text-muted)' } }, 'Total: ', h('strong', null, totalMemories)),
        h('span', { style: { color: 'var(--text-muted)' } }, 'Categories: ', h('strong', null, categoriesUsed)),
        h('span', { style: { color: 'var(--text-muted)' } }, 'Avg Conf: ', h('strong', null, avgConfidence)),
        h('span', { style: { color: 'var(--text-muted)' } }, 'Sources: ', h('strong', null, sourcesCount)),
        h('div', { style: { flex: 1 } }),
        h('span', { style: { color: 'var(--text-muted)' } }, 'Showing ', h('strong', null, filtered.length), ' of ', totalMemories)
      ),

      // Filter row
      h('div', { style: { display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' } },
        h('input', {
          className: 'input', style: { flex: 1, minWidth: 140, height: 30, fontSize: 12 },
          placeholder: 'Search...', value: searchQuery,
          onChange: function(e) { setSearchQuery(e.target.value); },
          onKeyDown: function(e) { if (e.key === 'Enter') handleSearch(); }
        }),
        h('select', { className: 'input', style: { width: 130, height: 30, fontSize: 12 }, value: filterCategory, onChange: function(e) { setFilterCategory(e.target.value); } },
          h('option', { value: '' }, 'All Categories'),
          MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
        ),
        h('select', { className: 'input', style: { width: 110, height: 30, fontSize: 12 }, value: filterImportance, onChange: function(e) { setFilterImportance(e.target.value); } },
          h('option', { value: '' }, 'All Levels'),
          h('option', { value: 'critical' }, 'Critical'),
          h('option', { value: 'high' }, 'High'),
          h('option', { value: 'normal' }, 'Normal'),
          h('option', { value: 'low' }, 'Low')
        ),
        h('input', { type: 'date', className: 'input', style: { width: 120, height: 30, fontSize: 12 }, value: dateFrom, onChange: function(e) { setDateFrom(e.target.value); setPage(1); }, title: 'From date' }),
        h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, '–'),
        h('input', { type: 'date', className: 'input', style: { width: 120, height: 30, fontSize: 12 }, value: dateTo, onChange: function(e) { setDateTo(e.target.value); setPage(1); }, title: 'To date' }),
        (dateFrom || dateTo) && h('button', { className: 'btn btn-ghost btn-sm', style: { height: 30, fontSize: 11 }, onClick: function() { setDateFrom(''); setDateTo(''); } }, 'Clear')
      ),

      // Table-style compact list
      filtered.length === 0
        ? h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No memories found')
        : h(Fragment, null,
          // Header row
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 100px 70px 60px 70px 36px', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' } },
            h('span', null, 'Memory'),
            h('span', null, 'Category'),
            h('span', null, 'Level'),
            h('span', null, 'Conf'),
            h('span', null, 'Date'),
            h('span', null, '')
          ),
          // Rows
          paged.map(function(m) {
            var isExpanded = expandedId === m.id;
            var conf = m.confidence != null ? Math.round(m.confidence * 100) : 0;
            var confBar = conf >= 80 ? 'var(--success)' : conf >= 50 ? 'var(--warning)' : 'var(--danger)';
            return h('div', { key: m.id },
              // Compact row
              h('div', {
                style: { display: 'grid', gridTemplateColumns: '1fr 100px 70px 60px 70px 36px', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, alignItems: 'center', transition: 'background 0.1s', background: isExpanded ? 'var(--bg-tertiary)' : 'transparent' },
                onClick: function() { setExpandedId(isExpanded ? null : m.id); },
                onMouseEnter: function(e) { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-secondary)'; },
                onMouseLeave: function(e) { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }
              },
                // Title + preview
                h('div', { style: { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } },
                  h('span', { style: { fontWeight: 500 } }, m.title || 'Untitled'),
                  m.content && h('span', { style: { color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 } }, m.content.substring(0, 60) + (m.content.length > 60 ? '...' : ''))
                ),
                // Category badge
                h('span', { style: { display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: catColor(m.category), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, (m.category || '').replace(/_/g, ' ')),
                // Importance
                h('span', { style: { fontSize: 11, color: impColor(m.importance), fontWeight: 500 } }, m.importance || 'normal'),
                // Confidence bar
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                  h('div', { style: { flex: 1, height: 4, borderRadius: 2, background: 'var(--border)' } },
                    h('div', { style: { width: conf + '%', height: '100%', borderRadius: 2, background: confBar } })
                  ),
                  h('span', { style: { fontSize: 10, color: 'var(--text-muted)', minWidth: 24 } }, conf + '%')
                ),
                // Date
                h('span', { style: { fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, fmtDate(m.createdAt)),
                // Expand indicator
                h('span', { style: { fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' } }, isExpanded ? '▲' : '▼')
              ),
              // Expanded detail
              isExpanded && h('div', { style: { padding: '10px 16px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6 } },
                h('div', { style: { color: 'var(--text)', marginBottom: 8, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' } }, m.content || '(empty)'),
                h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' } },
                  h('span', null, 'Source: ', h('strong', null, m.source || '-')),
                  h('span', null, 'Created: ', h('strong', null, fmtDate(m.createdAt)), ' ', fmtTime(m.createdAt)),
                  m.lastAccessedAt && h('span', null, 'Last accessed: ', h('strong', null, fmtDate(m.lastAccessedAt))),
                  m.tags && m.tags.length > 0 && h('span', null, 'Tags: ', m.tags.join(', ')),
                  h('div', { style: { flex: 1 } }),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)', height: 24, fontSize: 11 }, onClick: function(e) { e.stopPropagation(); deleteMemory(m.id); } }, I.trash(), ' Delete')
                )
              )
            );
          }),

          // Pagination
          totalPages > 1 && h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 16px', borderTop: '1px solid var(--border)' } },
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(1); }, style: { fontSize: 11, height: 28 } }, '«'),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(page - 1); }, style: { fontSize: 11, height: 28 } }, '‹'),
            h('span', { style: { fontSize: 12, color: 'var(--text-muted)', padding: '0 8px' } }, 'Page ', h('strong', null, page), ' of ', h('strong', null, totalPages)),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(page + 1); }, style: { fontSize: 11, height: 28 } }, '›'),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(totalPages); }, style: { fontSize: 11, height: 28 } }, '»')
          )
        )
    ),

    // Create Memory Modal
    showCreateModal && h('div', { className: 'modal-overlay', onClick: function() { setShowCreateModal(false); } },
      h('div', { className: 'modal', style: { maxWidth: 500 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Create Memory'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowCreateModal(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Title *'),
            h('input', { className: 'input', placeholder: 'Memory title', value: createForm.title, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { title: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Content *'),
            h('textarea', { className: 'input', style: { minHeight: 100 }, placeholder: 'Memory content...', value: createForm.content, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { content: e.target.value })); } })
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Category'),
              h('select', { className: 'input', value: createForm.category, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { category: e.target.value })); } },
                MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Importance'),
              h('select', { className: 'input', value: createForm.importance, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { importance: e.target.value })); } },
                h('option', { value: 'critical' }, 'Critical'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'normal' }, 'Normal'),
                h('option', { value: 'low' }, 'Low')
              )
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Tags (comma-separated)'),
            h('input', { className: 'input', placeholder: 'tag1, tag2', value: createForm.tags, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { tags: e.target.value })); } })
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowCreateModal(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: createMemory }, 'Create')
        )
      )
    )
  );
}
// ════════════════════════════════════════════════════════════
// WORKFORCE SECTION
// ════════════════════════════════════════════════════════════

function WorkforceSection(props) {
  var agentId = props.agentId;
  var app = useApp();
  var toast = app.toast;

  var _schedule = useState(null);
  var schedule = _schedule[0]; var setSchedule = _schedule[1];
  var _status = useState(null);
  var status = _status[0]; var setStatus = _status[1];
  var _tasks = useState([]);
  var tasks = _tasks[0]; var setTasks = _tasks[1];
  var _clockRecords = useState([]);
  var clockRecords = _clockRecords[0]; var setClockRecords = _clockRecords[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _showAddTask = useState(false);
  var showAddTask = _showAddTask[0]; var setShowAddTask = _showAddTask[1];
  var _taskForm = useState({ title: '', description: '', priority: 'normal', type: 'general' });
  var taskForm = _taskForm[0]; var setTaskForm = _taskForm[1];
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];

  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var defaultSchedForm = {
    agentId: agentId, timezone: 'UTC', scheduleType: 'standard',
    config: { standardHours: { start: '09:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] } },
    enforceClockIn: true, enforceClockOut: true, autoWakeEnabled: true,
    offHoursAction: 'pause', gracePeriodMinutes: 5, enabled: true
  };

  var _schedForm = useState(defaultSchedForm);
  var schedForm = _schedForm[0]; var setSchedForm = _schedForm[1];

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/workforce/schedules/' + agentId).catch(function() { return null; }),
      engineCall('/workforce/status/' + agentId).catch(function() { return null; }),
      engineCall('/workforce/tasks/' + agentId).catch(function() { return []; }),
      engineCall('/workforce/clock-records/' + agentId).catch(function() { return []; })
    ]).then(function(results) {
      var sched = results[0]?.schedule || results[0];
      setSchedule(sched);
      setStatus(results[1]);
      setTasks(results[2]?.tasks || results[2] || []);
      setClockRecords(results[3]?.records || results[3] || []);
      setLoading(false);
    });
  };

  useEffect(function() { loadAll(); }, [agentId]);

  var startEdit = function() {
    if (schedule) {
      setSchedForm({
        agentId: agentId,
        timezone: schedule.timezone || 'UTC',
        scheduleType: schedule.scheduleType || 'standard',
        config: schedule.config || { standardHours: { start: '09:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] } },
        enforceClockIn: schedule.enforceClockIn ?? true,
        enforceClockOut: schedule.enforceClockOut ?? true,
        autoWakeEnabled: schedule.autoWakeEnabled ?? true,
        offHoursAction: schedule.offHoursAction || 'pause',
        gracePeriodMinutes: schedule.gracePeriodMinutes ?? 5,
        enabled: schedule.enabled ?? true
      });
    } else {
      setSchedForm(Object.assign({}, defaultSchedForm, { agentId: agentId }));
    }
    setEditing(true);
  };

  var saveSchedule = function() {
    setSaving(true);
    var isUpdate = schedule && schedule.id;
    var method = isUpdate ? 'PUT' : 'POST';
    var url = isUpdate ? '/workforce/schedules/' + schedule.id : '/workforce/schedules';
    engineCall(url, { method: method, body: JSON.stringify(schedForm) })
      .then(function() { toast('Schedule saved', 'success'); setEditing(false); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setSaving(false); });
  };

  var deleteSchedule = function() {
    if (!schedule) return;
    engineCall('/workforce/schedules/' + agentId, { method: 'DELETE' })
      .then(function() { toast('Schedule removed', 'success'); setEditing(false); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var toggleDay = function(d) {
    var days = (schedForm.config?.standardHours?.daysOfWeek || []).slice();
    var idx = days.indexOf(d);
    if (idx >= 0) days.splice(idx, 1); else days.push(d);
    days.sort();
    setSchedForm(Object.assign({}, schedForm, { config: Object.assign({}, schedForm.config, { standardHours: Object.assign({}, schedForm.config?.standardHours, { daysOfWeek: days }) }) }));
  };

  var addShift = function() {
    var shifts = (schedForm.config?.shifts || []).concat([{ name: '', start: '09:00', end: '17:00' }]);
    setSchedForm(Object.assign({}, schedForm, { config: Object.assign({}, schedForm.config, { shifts: shifts }) }));
  };

  var updateShift = function(idx, key, val) {
    var shifts = (schedForm.config?.shifts || []).slice();
    shifts[idx] = Object.assign({}, shifts[idx], (function() { var o = {}; o[key] = val; return o; })());
    setSchedForm(Object.assign({}, schedForm, { config: Object.assign({}, schedForm.config, { shifts: shifts }) }));
  };

  var removeShift = function(idx) {
    var shifts = (schedForm.config?.shifts || []).slice();
    shifts.splice(idx, 1);
    setSchedForm(Object.assign({}, schedForm, { config: Object.assign({}, schedForm.config, { shifts: shifts }) }));
  };

  var clockIn = function() {
    engineCall('/workforce/clock-in/' + agentId, { method: 'POST' })
      .then(function() { toast('Agent clocked in', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var clockOut = function() {
    engineCall('/workforce/clock-out/' + agentId, { method: 'POST' })
      .then(function() { toast('Agent clocked out', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var addTask = function() {
    if (!taskForm.title) { toast('Task title is required', 'error'); return; }
    engineCall('/workforce/tasks', { method: 'POST', body: JSON.stringify({ agentId: agentId, title: taskForm.title, description: taskForm.description, priority: taskForm.priority, type: taskForm.type }) })
      .then(function() {
        toast('Task created', 'success');
        setShowAddTask(false);
        setTaskForm({ title: '', description: '', priority: 'normal', type: 'general' });
        loadAll();
      })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var completeTask = function(id) {
    engineCall('/workforce/tasks/' + id + '/complete', { method: 'POST' })
      .then(function() { toast('Task completed', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var cancelTask = function(id) {
    engineCall('/workforce/tasks/' + id + '/cancel', { method: 'POST' })
      .then(function() { toast('Task cancelled', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  // Helper: format schedule hours display
  var formatHours = function(s) {
    if (!s) return '-';
    if (s.scheduleType === 'standard' && s.config?.standardHours) {
      return (s.config.standardHours.start || '09:00') + ' - ' + (s.config.standardHours.end || '17:00');
    }
    if (s.scheduleType === 'shift' && s.config?.shifts?.length) {
      return s.config.shifts.map(function(sh) { return (sh.name ? sh.name + ': ' : '') + sh.start + '-' + sh.end; }).join(', ');
    }
    return '-';
  };

  var formatDays = function(days) { return days?.map(function(d) { return dayNames[d]; }).join(', ') || '-'; };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading workforce data...');
  }

  return h(Fragment, null,

    // ─── Status Card ────────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Clock Status'),
        status && status.clockedIn
          ? h('button', { className: 'btn btn-secondary btn-sm', onClick: clockOut }, I.clock(), ' Clock Out')
          : h('button', { className: 'btn btn-primary btn-sm', onClick: clockIn }, I.clock(), ' Clock In')
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          status && status.clockedIn
            ? h('span', { className: 'badge badge-success' }, I.check(), ' Clocked In')
            : h('span', { className: 'badge badge-neutral' }, I.clock(), ' Clocked Out'),
          status && status.lastClockIn && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Since: ' + new Date(status.lastClockIn).toLocaleString()),
          status && status.totalHoursToday != null && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Hours today: ' + Number(status.totalHoursToday).toFixed(1))
        )
      )
    ),

    // ─── Schedule Card ──────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Schedule'),
        !editing && h('button', { className: 'btn btn-ghost btn-sm', onClick: startEdit }, I.edit(), schedule ? ' Edit' : ' Configure')
      ),
      h('div', { className: 'card-body' },
        editing
          ? h(Fragment, null,
              // Schedule Type
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Schedule Type'),
                h('div', { style: { display: 'flex', gap: 16 } },
                  ['standard', 'shift', 'custom'].map(function(t) {
                    return h('label', { key: t, style: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' } },
                      h('input', { type: 'radio', name: 'schedTypeDetail', checked: schedForm.scheduleType === t, onChange: function() { setSchedForm(Object.assign({}, schedForm, { scheduleType: t })); } }),
                      t.charAt(0).toUpperCase() + t.slice(1)
                    );
                  })
                )
              ),
              // Standard fields
              schedForm.scheduleType === 'standard' && h(Fragment, null,
                h('div', { style: { display: 'flex', gap: 12 } },
                  h('div', { className: 'form-group', style: { flex: 1 } },
                    h('label', { className: 'form-label' }, 'Start Time'),
                    h('input', { className: 'input', type: 'time', value: schedForm.config?.standardHours?.start || '09:00', onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { config: Object.assign({}, schedForm.config, { standardHours: Object.assign({}, schedForm.config?.standardHours, { start: e.target.value }) }) })); } })
                  ),
                  h('div', { className: 'form-group', style: { flex: 1 } },
                    h('label', { className: 'form-label' }, 'End Time'),
                    h('input', { className: 'input', type: 'time', value: schedForm.config?.standardHours?.end || '17:00', onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { config: Object.assign({}, schedForm.config, { standardHours: Object.assign({}, schedForm.config?.standardHours, { end: e.target.value }) }) })); } })
                  )
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Days of Week'),
                  h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    [0, 1, 2, 3, 4, 5, 6].map(function(d) {
                      return h('button', {
                        key: d, type: 'button',
                        className: 'btn btn-sm ' + ((schedForm.config?.standardHours?.daysOfWeek || []).includes(d) ? 'btn-primary' : 'btn-ghost'),
                        onClick: function() { toggleDay(d); }
                      }, dayNames[d]);
                    })
                  )
                )
              ),
              // Shift fields
              schedForm.scheduleType === 'shift' && h(Fragment, null,
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Shifts'),
                  (schedForm.config?.shifts || []).map(function(sh, idx) {
                    return h('div', { key: idx, style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6 } },
                      h('input', { className: 'input', style: { flex: 1 }, placeholder: 'Shift name', value: sh.name, onChange: function(e) { updateShift(idx, 'name', e.target.value); } }),
                      h('input', { className: 'input', type: 'time', style: { width: 110 }, value: sh.start, onChange: function(e) { updateShift(idx, 'start', e.target.value); } }),
                      h('input', { className: 'input', type: 'time', style: { width: 110 }, value: sh.end, onChange: function(e) { updateShift(idx, 'end', e.target.value); } }),
                      h('button', { className: 'btn btn-ghost btn-icon btn-sm', onClick: function() { removeShift(idx); } }, I.x())
                    );
                  }),
                  h('button', { className: 'btn btn-ghost btn-sm', onClick: addShift }, I.plus(), ' Add Shift')
                )
              ),
              // Timezone
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Timezone'),
                TimezoneSelect(h, schedForm.timezone, function(e) { setSchedForm(Object.assign({}, schedForm, { timezone: e.target.value })); })
              ),
              // Toggles
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 } },
                h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
                  h('input', { type: 'checkbox', checked: schedForm.enforceClockIn, onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { enforceClockIn: e.target.checked })); } }),
                  'Enforce Clock-In'
                ),
                h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
                  h('input', { type: 'checkbox', checked: schedForm.enforceClockOut, onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { enforceClockOut: e.target.checked })); } }),
                  'Enforce Clock-Out'
                ),
                h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
                  h('input', { type: 'checkbox', checked: schedForm.autoWakeEnabled, onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { autoWakeEnabled: e.target.checked })); } }),
                  'Auto-Wake'
                ),
                h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
                  h('input', { type: 'checkbox', checked: schedForm.enabled, onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { enabled: e.target.checked })); } }),
                  'Enabled'
                )
              ),
              // Off-hours + grace
              h('div', { style: { display: 'flex', gap: 12, marginTop: 12 } },
                h('div', { className: 'form-group', style: { flex: 1 } },
                  h('label', { className: 'form-label' }, 'Off-Hours Action'),
                  h('select', { className: 'input', value: schedForm.offHoursAction, onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { offHoursAction: e.target.value })); } },
                    h('option', { value: 'pause' }, 'Pause'), h('option', { value: 'stop' }, 'Stop'), h('option', { value: 'queue' }, 'Queue'))
                ),
                h('div', { className: 'form-group', style: { flex: 1 } },
                  h('label', { className: 'form-label' }, 'Grace Period (min)'),
                  h('input', { className: 'input', type: 'number', value: schedForm.gracePeriodMinutes, onChange: function(e) { setSchedForm(Object.assign({}, schedForm, { gracePeriodMinutes: parseInt(e.target.value) || 0 })); } })
                )
              ),
              // Actions
              h('div', { style: { display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' } },
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', { className: 'btn btn-primary', disabled: saving, onClick: saveSchedule }, saving ? 'Saving...' : 'Save Schedule'),
                  h('button', { className: 'btn btn-ghost', onClick: function() { setEditing(false); } }, 'Cancel')
                ),
                schedule && h('button', { className: 'btn btn-ghost', style: { color: 'var(--danger)' }, onClick: deleteSchedule }, I.x(), ' Remove Schedule')
              )
            )
          : schedule
            ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Schedule Type'),
                  h('div', { style: { fontSize: 14, fontWeight: 600 } }, (schedule.scheduleType || 'standard').charAt(0).toUpperCase() + (schedule.scheduleType || 'standard').slice(1))
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Hours'),
                  h('div', { style: { fontSize: 14, fontWeight: 600 } }, formatHours(schedule))
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Timezone'),
                  h('div', { style: { fontSize: 14, fontWeight: 600 } }, schedule.timezone || 'UTC')
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Days'),
                  h('div', { style: { fontSize: 14, fontWeight: 600 } }, formatDays(schedule.config?.standardHours?.daysOfWeek))
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Enforcement'),
                  h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    h('span', { className: schedule.enforceClockIn ? 'badge badge-success' : 'badge badge-neutral' }, schedule.enforceClockIn ? 'Clock-In Enforced' : 'Clock-In Flexible'),
                    h('span', { className: schedule.enforceClockOut ? 'badge badge-success' : 'badge badge-neutral' }, schedule.enforceClockOut ? 'Clock-Out Enforced' : 'Clock-Out Flexible')
                  )
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Off-Hours'),
                  h('div', { style: { fontSize: 14, fontWeight: 600 } }, (schedule.offHoursAction || 'pause').charAt(0).toUpperCase() + (schedule.offHoursAction || 'pause').slice(1) + (schedule.gracePeriodMinutes ? ' (' + schedule.gracePeriodMinutes + 'min grace)' : ''))
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Status'),
                  h('div', { style: { display: 'flex', gap: 6 } },
                    h('span', { className: schedule.enabled ? 'badge badge-success' : 'badge badge-neutral' }, schedule.enabled ? 'Enabled' : 'Disabled'),
                    schedule.autoWakeEnabled && h('span', { className: 'badge badge-info' }, 'Auto-Wake')
                  )
                )
              )
            : h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } },
                'No schedule configured. ',
                h('button', { className: 'btn btn-ghost btn-sm', onClick: startEdit }, 'Configure now')
              )
      )
    ),

    // ─── Task Queue ─────────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Task Queue'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowAddTask(true); } }, I.plus(), ' Add Task')
      ),
      tasks.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Title'),
                  h('th', null, 'Priority'),
                  h('th', null, 'Type'),
                  h('th', null, 'Status'),
                  h('th', null, 'Actions')
                )
              ),
              h('tbody', null,
                tasks.map(function(task, i) {
                  var priorityColor = task.priority === 'urgent' ? 'badge-danger' : task.priority === 'high' ? 'badge-warning' : task.priority === 'low' ? 'badge-neutral' : 'badge-info';
                  var typeColor = task.type === 'email' ? 'badge-primary' : task.type === 'research' ? 'badge-info' : task.type === 'communication' ? 'badge-success' : 'badge-neutral';
                  var statusColor = task.status === 'completed' ? 'badge-success' : task.status === 'cancelled' ? 'badge-neutral' : task.status === 'in_progress' ? 'badge-info' : 'badge-warning';

                  return h('tr', { key: task.id || i },
                    h('td', { style: { fontWeight: 500, fontSize: 13 } }, task.title || 'Untitled'),
                    h('td', null, h('span', { className: 'badge ' + priorityColor }, task.priority || 'normal')),
                    h('td', null, h('span', { className: 'badge ' + typeColor }, task.type || 'general')),
                    h('td', null, h('span', { className: 'badge ' + statusColor }, task.status || 'pending')),
                    h('td', null,
                      h('div', { style: { display: 'flex', gap: 4 } },
                        task.status !== 'completed' && task.status !== 'cancelled' && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { completeTask(task.id); } }, I.check(), ' Complete'),
                        task.status !== 'completed' && task.status !== 'cancelled' && h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function() { cancelTask(task.id); } }, I.x(), ' Cancel')
                      )
                    )
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No tasks in queue.')
          )
    ),

    // ─── Clock History ──────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Clock History')),
      clockRecords.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Duration')
                )
              ),
              h('tbody', null,
                clockRecords.map(function(rec, i) {
                  var recTime = rec.timestamp || rec.createdAt || rec.time;
                  var recType = rec.type || rec.action || 'clock-in';
                  var isClockIn = recType === 'clock-in' || recType === 'clockIn';
                  return h('tr', { key: rec.id || i },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, recTime ? new Date(recTime).toLocaleString() : '-'),
                    h('td', null, h('span', { className: isClockIn ? 'badge badge-success' : 'badge badge-neutral' }, isClockIn ? 'Clock In' : 'Clock Out')),
                    h('td', { style: { fontSize: 12 } }, rec.duration || rec.durationMinutes ? (rec.durationMinutes || rec.duration) + ' min' : '-')
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No clock records.')
          )
    ),

    // ─── Add Task Modal ─────────────────────────────────
    showAddTask && h('div', { className: 'modal-overlay', onClick: function() { setShowAddTask(false); } },
      h('div', { className: 'modal', style: { maxWidth: 540 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Add Task'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowAddTask(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Title *'),
            h('input', { className: 'input', placeholder: 'Task title', value: taskForm.title, onChange: function(e) { setTaskForm(Object.assign({}, taskForm, { title: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Description'),
            h('textarea', { className: 'input', style: { minHeight: 100 }, placeholder: 'Task description...', value: taskForm.description, onChange: function(e) { setTaskForm(Object.assign({}, taskForm, { description: e.target.value })); } })
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Priority'),
              h('select', { className: 'input', value: taskForm.priority, onChange: function(e) { setTaskForm(Object.assign({}, taskForm, { priority: e.target.value })); } },
                h('option', { value: 'low' }, 'Low'),
                h('option', { value: 'normal' }, 'Normal'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'urgent' }, 'Urgent')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Type'),
              h('select', { className: 'input', value: taskForm.type, onChange: function(e) { setTaskForm(Object.assign({}, taskForm, { type: e.target.value })); } },
                h('option', { value: 'general' }, 'General'),
                h('option', { value: 'email' }, 'Email'),
                h('option', { value: 'research' }, 'Research'),
                h('option', { value: 'communication' }, 'Communication')
              )
            )
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowAddTask(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: addTask }, 'Create Task')
        )
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// GUARDRAILS SECTION
// ════════════════════════════════════════════════════════════

function GuardrailsSection(props) {
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
  var catIcon = function(c) { return c === 'anomaly' ? '⚡' : c === 'security' ? '🛡' : c === 'communication' ? '💬' : c === 'memory' ? '🧠' : c === 'onboarding' ? '📋' : c === 'policy_compliance' ? '📜' : '⚙'; };

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
      h('div', { className: 'card-header' }, h('span', null, 'Interventions')),
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
      h('div', { className: 'card-header' }, h('span', null, 'DLP Violations')),
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
                ? h('span', { style: { color: 'var(--success)', fontSize: 14 } }, '✓')
                : h('span', { style: { color: 'var(--text-muted)', fontSize: 14 } }, '○'),
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
        h('div', { className: 'card-header' }, h('span', null, 'Pending Approvals (' + pendingApprovals.length + ')')),
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
function ConfigurationSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  var modelObj = typeof config.model === 'object' ? config.model : {};
  var modelStr = typeof config.model === 'string' ? config.model : null;

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];
  var _providers = useState([]);
  var providers = _providers[0]; var setProviders = _providers[1];
  var _providerModels = useState([]);
  var providerModels = _providerModels[0]; var setProviderModels = _providerModels[1];

  useEffect(function() {
    apiCall('/providers').then(function(d) { setProviders(d.providers || []); }).catch(function() {});
  }, []);

  // Load models when provider changes in edit mode
  useEffect(function() {
    if (!editing || !form.provider) return;
    apiCall('/providers/' + form.provider + '/models').then(function(d) {
      setProviderModels(d.models || []);
    }).catch(function() { setProviderModels([]); });
  }, [editing, form.provider]);

  var startEdit = function() {
    setForm({
      provider: modelObj.provider || '',
      modelId: modelStr || modelObj.modelId || '',
      thinkingLevel: modelObj.thinkingLevel || 'medium',
      description: identity.description || config.description || '',
      soulId: config.soulId || '',
    });
    setEditing(true);
    // Trigger model load
    if (modelObj.provider) {
      apiCall('/providers/' + modelObj.provider + '/models').then(function(d) { setProviderModels(d.models || []); }).catch(function() {});
    }
  };

  var set = function(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  var save = function() {
    setSaving(true);
    var updates = {
      model: { provider: form.provider, modelId: form.modelId, thinkingLevel: form.thinkingLevel },
      description: form.description,
      soulId: form.soulId || null,
      identity: Object.assign({}, identity, { description: form.description }),
    };
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Configuration saved', 'success'); setEditing(false); setSaving(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSaving(false); });
  };

  var configuredProviders = providers.filter(function(p) { return p.configured; });

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 };
  var fieldGroupStyle = { marginBottom: 16 };
  var rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

  if (editing) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Configuration'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Changes')
        )
      ),

      // Model Settings
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'LLM Model'),
        h('div', { style: rowStyle },
          h('div', { style: fieldGroupStyle },
            h('label', { style: labelStyle }, 'Provider'),
            h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.provider, onChange: function(e) {
              set('provider', e.target.value);
              // Reset model when provider changes
              set('modelId', '');
            } },
              h('option', { value: '' }, '-- Select provider --'),
              configuredProviders.length > 0
                ? configuredProviders.map(function(p) { return h('option', { key: p.id, value: p.id }, p.name + (p.isLocal ? ' (Local)' : '')); })
                : providers.map(function(p) { return h('option', { key: p.id, value: p.id }, p.name); })
            )
          ),
          h('div', { style: fieldGroupStyle },
            h('label', { style: labelStyle }, 'Model'),
            providerModels.length > 0
              ? h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.modelId, onChange: function(e) { set('modelId', e.target.value); } },
                  h('option', { value: '' }, '-- Select model --'),
                  providerModels.map(function(m) { return h('option', { key: m.id, value: m.id }, m.name || m.id); }),
                  h('option', { value: '_custom' }, 'Custom (enter manually)')
                )
              : h('input', { style: inputStyle, value: form.modelId, onChange: function(e) { set('modelId', e.target.value); }, placeholder: 'Enter model ID' })
          )
        ),
        h('div', { style: rowStyle },
          h('div', { style: fieldGroupStyle },
            h('label', { style: labelStyle }, 'Thinking Level'),
            h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.thinkingLevel, onChange: function(e) { set('thinkingLevel', e.target.value); } },
              h('option', { value: 'off' }, 'Off — No extended thinking'),
              h('option', { value: 'low' }, 'Low — 2K tokens (fast, light reasoning)'),
              h('option', { value: 'medium' }, 'Medium — 8K tokens (balanced)'),
              h('option', { value: 'high' }, 'High — 16K tokens (deep reasoning)')
            ),
            h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Extended thinking lets the model reason step-by-step before responding. Higher = better quality but slower and more expensive. Supported by Anthropic Claude.')
          ),
          form.modelId === '_custom' && h('div', { style: fieldGroupStyle },
            h('label', { style: labelStyle }, 'Custom Model ID'),
            h('input', { style: inputStyle, value: form.customModelId || '', onChange: function(e) { set('customModelId', e.target.value); }, placeholder: 'my-fine-tuned-model-v2' })
          )
        )
      ),

      // Description
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Description'),
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Agent Description'),
          h('textarea', { style: Object.assign({}, inputStyle, { minHeight: 80, resize: 'vertical' }), value: form.description, onChange: function(e) { set('description', e.target.value); }, placeholder: 'What does this agent do? What are its responsibilities?' })
        )
      ),

      // Soul ID
      config.soulId && h('div', { className: 'card', style: { padding: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Role Template'),
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Soul Template ID'),
          h('input', { style: inputStyle, value: form.soulId || '', onChange: function(e) { set('soulId', e.target.value); } })
        )
      )
    );
  }

  // View mode
  var displayProvider = modelObj.provider || 'Not set';
  var displayModel = modelStr || modelObj.modelId || 'Not set';
  var displayThinking = modelObj.thinkingLevel || 'medium';
  var displayDescription = identity.description || config.description || '';
  var displaySoulId = config.soulId || '';

  var fieldView = function(label, value) {
    return h('div', { style: fieldGroupStyle },
      h('div', { style: labelStyle }, label),
      h('div', { style: { fontSize: 14, color: 'var(--text-primary)' } }, value || '\u2014')
    );
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Configuration'),
      h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit Configuration')
    ),

    // Model Card
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'LLM Model'),
      h('div', { style: rowStyle },
        fieldView('Provider', h('span', { style: { textTransform: 'capitalize' } }, displayProvider)),
        fieldView('Model ID', h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 13 } }, displayModel))
      ),
      h('div', { style: rowStyle },
        fieldView('Thinking Level', h('span', { className: 'badge badge-' + (displayThinking === 'high' ? 'primary' : displayThinking === 'medium' ? 'info' : displayThinking === 'low' ? 'neutral' : 'neutral'), style: { textTransform: 'capitalize' } }, displayThinking)),
        h('div')
      )
    ),

    // Description Card
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Description'),
      h('div', { style: { fontSize: 14, color: displayDescription ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.6 } }, displayDescription || 'No description set.')
    ),

    // Soul Template Card
    displaySoulId && h('div', { className: 'card', style: { padding: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Role Template'),
      h('span', { className: 'badge badge-primary' }, displaySoulId.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }))
    )
  );
}

// ════════════════════════════════════════════════════════════
// MANAGER & DAILY CATCH-UP SECTION
// ════════════════════════════════════════════════════════════

var COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Istanbul',
  'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Seoul', 'Asia/Hong_Kong', 'Asia/Bangkok', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland'
];

function resolveManager(config, allAgents) {
  var mgr = config.manager || {};
  // Legacy: managerId at top level
  var legacyId = config.managerId;
  if (mgr.type === 'external') {
    return { type: 'external', name: mgr.name || '', email: mgr.email || '' };
  }
  var internalId = mgr.agentId || legacyId;
  if (internalId) {
    var found = (allAgents || []).find(function(a) { return a.id === internalId; });
    return { type: 'internal', agentId: internalId, name: found ? (found.config?.identity?.name || found.config?.displayName || found.name || internalId) : internalId };
  }
  return null;
}

function ManagerCatchUpSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var allAgents = props.agents || [];
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var catchUp = config.dailyCatchUp || {};

  var resolved = resolveManager(config, allAgents);

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];

  var startEdit = function() {
    setForm({
      managerType: resolved ? resolved.type : 'none',
      managerAgentId: resolved && resolved.type === 'internal' ? resolved.agentId : '',
      managerName: resolved && resolved.type === 'external' ? resolved.name : '',
      managerEmail: resolved && resolved.type === 'external' ? resolved.email : '',
      catchUpEnabled: catchUp.enabled !== false && (catchUp.enabled || catchUp.time),
      catchUpTime: catchUp.time || '09:00',
      catchUpTimezone: catchUp.timezone || 'America/New_York',
    });
    setEditing(true);
  };

  var set = function(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  var save = function() {
    setSaving(true);
    var updates = {};

    // Build manager object
    if (form.managerType === 'external') {
      if (!form.managerName || !form.managerEmail) {
        toast('Manager name and email are required', 'error');
        setSaving(false);
        return;
      }
      updates.manager = { type: 'external', name: form.managerName, email: form.managerEmail };
      updates.managerId = null; // clear legacy
    } else if (form.managerType === 'internal') {
      if (!form.managerAgentId) {
        toast('Select an agent', 'error');
        setSaving(false);
        return;
      }
      updates.manager = { type: 'internal', agentId: form.managerAgentId };
      updates.managerId = form.managerAgentId; // keep legacy compat
    } else {
      updates.manager = null;
      updates.managerId = null;
    }

    // Build dailyCatchUp
    if (form.catchUpEnabled) {
      updates.dailyCatchUp = {
        enabled: true,
        time: form.catchUpTime,
        timezone: form.catchUpTimezone,
      };
    } else {
      updates.dailyCatchUp = { enabled: false };
    }

    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';

    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Manager & catch-up saved', 'success'); setEditing(false); setSaving(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSaving(false); });
  };

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 };
  var fieldGroupStyle = { marginBottom: 16 };
  var rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

  // Other agents this agent could report to (exclude self)
  var otherAgents = allAgents.filter(function(a) { return a.id !== agentId; });

  if (editing) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Manager & Daily Catch-Up'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Changes')
        )
      ),

      // Manager Card
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Manager'),
        h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 } }, 'Assign a manager this agent reports to. Can be another agent in the system or an external person (name + email).'),

        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Manager Type'),
          h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.managerType, onChange: function(e) {
            set('managerType', e.target.value);
            if (e.target.value === 'none') { set('managerAgentId', ''); set('managerName', ''); set('managerEmail', ''); }
          } },
            h('option', { value: 'none' }, 'No manager'),
            h('option', { value: 'internal' }, 'Another agent in this organization'),
            h('option', { value: 'external' }, 'External person (name + email)')
          )
        ),

        form.managerType === 'internal' && h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Select Agent'),
          h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.managerAgentId, onChange: function(e) { set('managerAgentId', e.target.value); } },
            h('option', { value: '' }, '-- Select agent --'),
            otherAgents.map(function(a) {
              var name = a.config?.identity?.name || a.config?.displayName || a.name || a.id;
              var role = a.config?.identity?.role || a.config?.role || '';
              return h('option', { key: a.id, value: a.id }, name + (role ? ' (' + role + ')' : ''));
            })
          )
        ),

        form.managerType === 'external' && h(Fragment, null,
          h('div', { style: rowStyle },
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Manager Name'),
              h('input', { style: inputStyle, type: 'text', value: form.managerName, placeholder: 'e.g. Sarah Johnson', onChange: function(e) { set('managerName', e.target.value); } })
            ),
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Manager Email'),
              h('input', { style: inputStyle, type: 'email', value: form.managerEmail, placeholder: 'e.g. sarah@company.com', onChange: function(e) { set('managerEmail', e.target.value); } })
            )
          ),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 0 } }, 'The agent will email this person for daily catch-ups, status reports, and escalations.')
        )
      ),

      // Daily Catch-Up Card
      h('div', { className: 'card', style: { padding: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Daily Catch-Up'),
        h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 } }, 'When enabled, the agent sends a daily status email to its manager with goals, progress, and blockers.'),

        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 } },
            h('input', { type: 'checkbox', checked: form.catchUpEnabled, onChange: function(e) { set('catchUpEnabled', e.target.checked); } }),
            'Enable daily catch-up'
          )
        ),

        form.catchUpEnabled && h('div', { style: rowStyle },
          h('div', { style: fieldGroupStyle },
            h('label', { style: labelStyle }, 'Time'),
            h('input', { style: inputStyle, type: 'time', value: form.catchUpTime, onChange: function(e) { set('catchUpTime', e.target.value); } })
          ),
          h('div', { style: fieldGroupStyle },
            h('label', { style: labelStyle }, 'Timezone'),
            h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.catchUpTimezone, onChange: function(e) { set('catchUpTimezone', e.target.value); } },
              COMMON_TIMEZONES.map(function(tz) { return h('option', { key: tz, value: tz }, tz.replace(/_/g, ' ')); })
            )
          )
        ),

        form.catchUpEnabled && !form.managerType !== 'none' && form.managerType === 'none' && h('div', {
          style: { padding: '10px 14px', background: 'var(--warning-soft, #fff3cd)', borderRadius: 6, fontSize: 13, color: 'var(--warning-text, #856404)', marginTop: 12 }
        }, 'Note: Catch-up is enabled but no manager is assigned. The agent won\'t have anyone to report to.')
      )
    );
  }

  // View mode
  var catchUpEnabled = catchUp.enabled || catchUp.time;
  var catchUpTime = catchUp.time || '09:00';
  var catchUpTz = catchUp.timezone || 'America/New_York';

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Manager & Daily Catch-Up'),
      h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit')
    ),

    // Manager Card
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Reports To'),
      resolved
        ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
            h('div', { style: {
              width: 40, height: 40, borderRadius: '50%', background: resolved.type === 'external' ? 'var(--accent)' : 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0
            } }, (resolved.name || '?').charAt(0).toUpperCase()),
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, resolved.name),
              resolved.type === 'external'
                ? h('div', { style: { fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' } }, resolved.email)
                : h('span', { className: 'badge badge-neutral', style: { fontSize: 11 } }, 'Internal Agent')
            )
          )
        : h('div', { style: { fontSize: 14, color: 'var(--text-muted)' } }, 'No manager assigned')
    ),

    // Daily Catch-Up Card
    h('div', { className: 'card', style: { padding: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Daily Catch-Up'),
      catchUpEnabled
        ? h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
              h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' } }),
              h('span', { style: { fontSize: 14, fontWeight: 600 } }, 'Active')
            ),
            h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } },
              'Sends daily at ', h('strong', null, catchUpTime), ' ', catchUpTz.replace(/_/g, ' ')
            ),
            !resolved && h('div', { style: { fontSize: 12, color: 'var(--warning-text, #856404)', marginTop: 8 } }, 'Warning: No manager assigned — catch-up emails have no recipient.')
          )
        : h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' } }),
            h('span', { style: { fontSize: 14, color: 'var(--text-muted)' } }, 'Not configured')
          )
    )
  );
}

// ════════════════════════════════════════════════════════════
// SKILLS SECTION — View and manage agent skills
// ════════════════════════════════════════════════════════════

function SkillsSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var currentSkills = Array.isArray(config.skills) ? config.skills : [];

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _selectedSkills = useState(currentSkills);
  var selectedSkills = _selectedSkills[0]; var setSelectedSkills = _selectedSkills[1];
  var _allSkills = useState({});
  var allSkills = _allSkills[0]; var setAllSkills = _allSkills[1];
  var _suites = useState([]);
  var suites = _suites[0]; var setSuites = _suites[1];
  var _skillSearch = useState('');
  var skillSearch = _skillSearch[0]; var setSkillSearch = _skillSearch[1];

  useEffect(function() {
    engineCall('/skills/by-category').then(function(d) { setAllSkills(d.categories || {}); }).catch(function() {});
    engineCall('/skills/suites').then(function(d) { setSuites(d.suites || []); }).catch(function() {});
  }, []);

  // Reset selected skills when entering edit mode
  var startEdit = function() {
    setSelectedSkills(Array.isArray(config.skills) ? config.skills.slice() : []);
    setEditing(true);
  };

  var toggleSkill = function(id) {
    setSelectedSkills(function(prev) {
      return prev.includes(id) ? prev.filter(function(s) { return s !== id; }) : prev.concat([id]);
    });
  };

  var toggleSuite = function(suite) {
    setSelectedSkills(function(prev) {
      var allIn = suite.skills.every(function(id) { return prev.includes(id); });
      if (allIn) return prev.filter(function(id) { return !suite.skills.includes(id); });
      var merged = prev.slice();
      suite.skills.forEach(function(id) { if (!merged.includes(id)) merged.push(id); });
      return merged;
    });
  };

  var save = function() {
    setSaving(true);
    var updates = { skills: selectedSkills };
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Skills updated', 'success'); setEditing(false); setSaving(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSaving(false); });
  };

  if (editing) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Skills'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('span', { className: 'badge badge-primary' }, selectedSkills.length + ' selected'),
          selectedSkills.length > 0 && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setSelectedSkills([]); } }, 'Clear all'),
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Skills')
        )
      ),

      // Suites
      suites.length > 0 && h('div', { style: { marginBottom: 24 } },
        h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } }, 'Suites'),
        h('div', { className: 'suite-grid' }, suites.map(function(s) {
          var allIn = s.skills.every(function(id) { return selectedSkills.includes(id); });
          var someIn = s.skills.some(function(id) { return selectedSkills.includes(id); });
          return h('div', { key: s.id, className: 'suite-card' + (allIn ? ' selected' : someIn ? ' partial' : ''), onClick: function() { toggleSuite(s); }, style: { cursor: 'pointer' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
              h('span', { style: { fontSize: 20 } }, s.icon),
              allIn && h('span', { style: { color: 'var(--accent)' } }, I.check())
            ),
            h('div', { className: 'suite-name' }, s.name),
            h('div', { className: 'suite-desc' }, s.skills.length + ' apps')
          );
        }))
      ),

      // Search
      h('div', { style: { marginBottom: 14 } },
        h('input', { className: 'input', type: 'text', placeholder: 'Search skills...', value: skillSearch, onChange: function(e) { setSkillSearch(e.target.value); }, style: { maxWidth: 300 } })
      ),

      // Skills by category
      Object.entries(allSkills).map(function(entry) {
        var cat = entry[0]; var skills = entry[1];
        var filtered = skillSearch ? skills.filter(function(s) { return s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()); }) : skills;
        if (filtered.length === 0) return null;
        return h('div', { key: cat, style: { marginBottom: 20 } },
          h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } }, cat.replace(/-/g, ' ')),
          h('div', { className: 'skill-grid' }, filtered.map(function(s) {
            var isSelected = selectedSkills.includes(s.id);
            return h('div', { key: s.id, className: 'skill-card' + (isSelected ? ' selected' : ''), onClick: function() { toggleSkill(s.id); }, style: { cursor: 'pointer' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { className: 'skill-name' }, (s.icon || '') + ' ' + s.name),
                isSelected && h('span', { style: { color: 'var(--accent)' } }, I.check())
              ),
              h('div', { className: 'skill-desc' }, s.description)
            );
          }))
        );
      })
    );
  }

  // View mode
  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Skills & Capabilities'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { className: 'badge badge-primary' }, currentSkills.length + ' skills'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit Skills')
      )
    ),

    currentSkills.length > 0
      ? h('div', { className: 'card', style: { padding: 20 } },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
            currentSkills.map(function(skillId) {
              return h('div', { key: skillId, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 13, fontWeight: 500, color: 'var(--accent-text)' } },
                h('span', null, skillId.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }))
              );
            })
          )
        )
      : h('div', { className: 'card', style: { padding: 40, textAlign: 'center' } },
          h('div', { style: { color: 'var(--text-muted)', marginBottom: 12 } }, 'No skills assigned to this agent.'),
          h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, 'Add Skills')
        )
  );
}

// ════════════════════════════════════════════════════════════
// DEPLOYMENT SECTION
// ════════════════════════════════════════════════════════════

function DeploymentSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var agent = props.agent;
  var reload = props.reload;
  var onBack = props.onBack;

  var app = useApp();
  var toast = app.toast;

  var _knowledgeBases = useState([]);
  var knowledgeBases = _knowledgeBases[0]; var setKnowledgeBases = _knowledgeBases[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _showJson = useState(false);
  var showJson = _showJson[0]; var setShowJson = _showJson[1];

  var load = function() {
    setLoading(true);
    engineCall('/knowledge-bases?agentId=' + agentId)
      .then(function(d) { setKnowledgeBases(d.knowledgeBases || d.bases || d || []); })
      .catch(function() { setKnowledgeBases([]); })
      .finally(function() { setLoading(false); });
  };

  useEffect(function() { load(); }, [agentId]);

  // ─── Derived Values ─────────────────────────────────────

  var ea = engineAgent || {};
  var a = agent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  var deployment = config.deployment || {};
  var state = ea.state || a.status || 'unknown';
  var stateColor = { running: 'success', active: 'success', deploying: 'info', starting: 'info', provisioning: 'info', degraded: 'warning', error: 'danger', stopped: 'neutral', draft: 'neutral', ready: 'primary' }[state] || 'neutral';
  var healthStatus = ea.health?.status || 'unknown';
  var healthColor = healthStatus === 'healthy' ? 'success' : healthStatus === 'degraded' ? 'warning' : healthStatus === 'unhealthy' ? 'danger' : 'neutral';
  var deploymentTarget = deployment.target || config.deploymentTarget || '-';
  var modelDisplay = typeof config.model === 'string' ? config.model : (config.model ? (config.model.modelId || config.model.provider || '-') : '-');

  // ─── Deployment Edit State ──────────────────────────────
  var _editingDeploy = useState(false);
  var editingDeploy = _editingDeploy[0]; var setEditingDeploy = _editingDeploy[1];
  var _savingDeploy = useState(false);
  var savingDeploy = _savingDeploy[0]; var setSavingDeploy = _savingDeploy[1];
  var _deployForm = useState({});
  var deployForm = _deployForm[0]; var setDeployForm = _deployForm[1];

  var startDeployEdit = function() {
    var cloud = deployment.config?.cloud || {};
    var docker = deployment.config?.docker || {};
    var vps = deployment.config?.vps || {};
    var aws = deployment.config?.aws || {};
    var gcp = deployment.config?.gcp || {};
    var az = deployment.config?.azure || {};
    var rail = deployment.config?.railway || {};
    setDeployForm({
      target: deployment.target || 'fly',
      region: deployment.region || cloud.region || 'iad',
      // Fly.io
      flyApiToken: cloud.apiToken || '',
      flyAppName: cloud.appName || '',
      flyOrg: cloud.org || 'personal',
      flyVmSize: cloud.vmSize || 'shared-cpu-1x',
      flyVmMemory: cloud.vmMemory || '256',
      // Docker
      dockerImage: docker.image || 'agenticmail/agent',
      dockerTag: docker.tag || 'latest',
      dockerMemory: docker.memory || '512m',
      dockerCpu: docker.cpu || '0.5',
      dockerPorts: (docker.ports || [3000]).join(', '),
      dockerNetwork: docker.network || '',
      dockerRestart: docker.restart || 'unless-stopped',
      // VPS
      vpsHost: vps.host || '',
      vpsPort: vps.port || '22',
      vpsUser: vps.user || 'root',
      vpsKeyPath: vps.keyPath || '~/.ssh/id_rsa',
      vpsWorkDir: vps.workDir || '/opt/agenticmail',
      // AWS
      awsRegion: aws.region || 'us-east-1',
      awsAccessKeyId: aws.accessKeyId || '',
      awsSecretAccessKey: aws.secretAccessKey || '',
      awsInstanceType: aws.instanceType || 't3.micro',
      awsAmi: aws.ami || '',
      awsSubnetId: aws.subnetId || '',
      awsSecurityGroupId: aws.securityGroupId || '',
      awsKeyPairName: aws.keyPairName || '',
      // GCP
      gcpProject: gcp.projectId || '',
      gcpRegion: gcp.region || 'us-central1',
      gcpZone: gcp.zone || 'us-central1-a',
      gcpMachineType: gcp.machineType || 'e2-micro',
      gcpServiceAccountKey: gcp.serviceAccountKey || '',
      // Azure
      azureSubscriptionId: az.subscriptionId || '',
      azureResourceGroup: az.resourceGroup || '',
      azureRegion: az.region || 'eastus',
      azureVmSize: az.vmSize || 'Standard_B1s',
      azureTenantId: az.tenantId || '',
      azureClientId: az.clientId || '',
      azureClientSecret: az.clientSecret || '',
      // Railway
      railwayApiToken: rail.apiToken || '',
      railwayProjectId: rail.projectId || '',
      railwayServiceName: rail.serviceName || '',
    });
    setEditingDeploy(true);
  };

  var saveDeploy = function() {
    setSavingDeploy(true);
    var t = deployForm.target;
    var deployConfig = {};
    if (t === 'fly') {
      deployConfig = { cloud: { provider: 'fly', region: deployForm.region || 'iad', apiToken: deployForm.flyApiToken || undefined, appName: deployForm.flyAppName || undefined, org: deployForm.flyOrg || 'personal', vmSize: deployForm.flyVmSize || 'shared-cpu-1x', vmMemory: deployForm.flyVmMemory || '256' } };
    } else if (t === 'docker') {
      deployConfig = { docker: { image: deployForm.dockerImage || 'agenticmail/agent', tag: deployForm.dockerTag || 'latest', ports: (deployForm.dockerPorts || '3000').split(',').map(function(p) { return parseInt(p.trim()) || 3000; }), memory: deployForm.dockerMemory || '512m', cpu: deployForm.dockerCpu || '0.5', network: deployForm.dockerNetwork || undefined, restart: deployForm.dockerRestart || 'unless-stopped' } };
    } else if (t === 'vps') {
      deployConfig = { vps: { host: deployForm.vpsHost, port: parseInt(deployForm.vpsPort) || 22, user: deployForm.vpsUser || 'root', keyPath: deployForm.vpsKeyPath || '~/.ssh/id_rsa', workDir: deployForm.vpsWorkDir || '/opt/agenticmail' } };
    } else if (t === 'aws') {
      deployConfig = { aws: { region: deployForm.awsRegion || 'us-east-1', accessKeyId: deployForm.awsAccessKeyId || undefined, secretAccessKey: deployForm.awsSecretAccessKey || undefined, instanceType: deployForm.awsInstanceType || 't3.micro', ami: deployForm.awsAmi || undefined, subnetId: deployForm.awsSubnetId || undefined, securityGroupId: deployForm.awsSecurityGroupId || undefined, keyPairName: deployForm.awsKeyPairName || undefined } };
    } else if (t === 'gcp') {
      deployConfig = { gcp: { projectId: deployForm.gcpProject, region: deployForm.gcpRegion || 'us-central1', zone: deployForm.gcpZone || 'us-central1-a', machineType: deployForm.gcpMachineType || 'e2-micro', serviceAccountKey: deployForm.gcpServiceAccountKey || undefined } };
    } else if (t === 'azure') {
      deployConfig = { azure: { subscriptionId: deployForm.azureSubscriptionId, resourceGroup: deployForm.azureResourceGroup, region: deployForm.azureRegion || 'eastus', vmSize: deployForm.azureVmSize || 'Standard_B1s', tenantId: deployForm.azureTenantId || undefined, clientId: deployForm.azureClientId || undefined, clientSecret: deployForm.azureClientSecret || undefined } };
    } else if (t === 'railway') {
      deployConfig = { railway: { apiToken: deployForm.railwayApiToken || undefined, projectId: deployForm.railwayProjectId || undefined, serviceName: deployForm.railwayServiceName || undefined, region: deployForm.region || undefined } };
    }
    var updates = {
      deployment: {
        target: t,
        region: deployForm.region,
        config: deployConfig
      }
    };
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Deployment config saved', 'success'); setEditingDeploy(false); setSavingDeploy(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSavingDeploy(false); });
  };

  var setDf = function(k, v) { setDeployForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  // ─── Actions ────────────────────────────────────────────

  var deploy = function() {
    engineCall('/agents/' + agentId + '/deploy', { method: 'POST', body: JSON.stringify({ deployedBy: 'dashboard' }) })
      .then(function() { toast('Deploy initiated', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var stop = function() {
    engineCall('/agents/' + agentId + '/stop', { method: 'POST', body: JSON.stringify({ stoppedBy: 'dashboard', reason: 'Manual stop' }) })
      .then(function() { toast('Stop initiated', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var restart = function() {
    engineCall('/agents/' + agentId + '/restart', { method: 'POST', body: JSON.stringify({ restartedBy: 'dashboard' }) })
      .then(function() { toast('Restart initiated', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var deleteAgent = function() {
    showConfirm({
      title: 'Delete Agent',
      message: 'Are you sure you want to delete agent "' + (ea.name || identity.name || agentId) + '"? This will remove all associated data.',
      warning: 'This action cannot be undone.',
      danger: true,
      confirmText: 'Delete Agent'
    }).then(function(confirmed) {
      if (!confirmed) return;
      apiCall('/bridge/agents/' + agentId, { method: 'DELETE' })
        .then(function() { toast('Agent deleted', 'success'); if (onBack) onBack(); })
        .catch(function(err) { toast(err.message, 'error'); });
    });
  };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading deployment data...');
  }

  return h(Fragment, null,

    // ─── Deployment Edit Card ─────────────────────────────
    editingDeploy && h('div', { className: 'card', style: { marginBottom: 20, border: '2px solid var(--accent)' } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Edit Deployment Configuration'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditingDeploy(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: savingDeploy, onClick: saveDeploy }, savingDeploy ? 'Saving...' : 'Save')
        )
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Target'),
            h('select', { className: 'input', value: deployForm.target, onChange: function(e) { setDf('target', e.target.value); } },
              h('option', { value: 'fly' }, 'Fly.io'),
              h('option', { value: 'aws' }, 'AWS (EC2)'),
              h('option', { value: 'gcp' }, 'Google Cloud (GCE)'),
              h('option', { value: 'azure' }, 'Microsoft Azure'),
              h('option', { value: 'railway' }, 'Railway'),
              h('option', { value: 'docker' }, 'Docker'),
              h('option', { value: 'vps' }, 'VPS / Bare Metal'),
              h('option', { value: 'local' }, 'Local (In-Process)')
            )
          ),
          // Region selector for cloud providers
          (deployForm.target === 'fly' || deployForm.target === 'railway') && h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
            h('select', { className: 'input', value: deployForm.region, onChange: function(e) { setDf('region', e.target.value); } },
              h('option', { value: 'iad' }, 'Ashburn, VA (iad)'),
              h('option', { value: 'ord' }, 'Chicago, IL (ord)'),
              h('option', { value: 'dfw' }, 'Dallas, TX (dfw)'),
              h('option', { value: 'lax' }, 'Los Angeles, CA (lax)'),
              h('option', { value: 'sea' }, 'Seattle, WA (sea)'),
              h('option', { value: 'sjc' }, 'San Jose, CA (sjc)'),
              h('option', { value: 'yyz' }, 'Toronto (yyz)'),
              h('option', { value: 'lhr' }, 'London (lhr)'),
              h('option', { value: 'ams' }, 'Amsterdam (ams)'),
              h('option', { value: 'fra' }, 'Frankfurt (fra)'),
              h('option', { value: 'cdg' }, 'Paris (cdg)'),
              h('option', { value: 'waw' }, 'Warsaw (waw)'),
              h('option', { value: 'nrt' }, 'Tokyo (nrt)'),
              h('option', { value: 'sin' }, 'Singapore (sin)'),
              h('option', { value: 'hkg' }, 'Hong Kong (hkg)'),
              h('option', { value: 'syd' }, 'Sydney (syd)'),
              h('option', { value: 'gru' }, 'São Paulo (gru)'),
              h('option', { value: 'jnb' }, 'Johannesburg (jnb)')
            )
          )
        ),

        // ── Fly.io ──────────────────────────────────────────
        deployForm.target === 'fly' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'API Token'),
            h('input', { className: 'input', type: 'password', value: deployForm.flyApiToken, onChange: function(e) { setDf('flyApiToken', e.target.value); }, placeholder: 'fo1_...' }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'From fly.io/user/personal_access_tokens')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'App Name'),
            h('input', { className: 'input', value: deployForm.flyAppName, onChange: function(e) { setDf('flyAppName', e.target.value); }, placeholder: 'Auto-generated if empty' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Organization'),
            h('input', { className: 'input', value: deployForm.flyOrg, onChange: function(e) { setDf('flyOrg', e.target.value); }, placeholder: 'personal' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'VM Size'),
            h('select', { className: 'input', value: deployForm.flyVmSize, onChange: function(e) { setDf('flyVmSize', e.target.value); } },
              h('option', { value: 'shared-cpu-1x' }, 'Shared 1x (256MB) — $1.94/mo'),
              h('option', { value: 'shared-cpu-2x' }, 'Shared 2x (512MB) — $3.88/mo'),
              h('option', { value: 'shared-cpu-4x' }, 'Shared 4x (1GB) — $7.76/mo'),
              h('option', { value: 'shared-cpu-8x' }, 'Shared 8x (2GB) — $15.52/mo'),
              h('option', { value: 'performance-1x' }, 'Performance 1x (2GB) — $29.04/mo'),
              h('option', { value: 'performance-2x' }, 'Performance 2x (4GB) — $58.09/mo'),
              h('option', { value: 'performance-4x' }, 'Performance 4x (8GB) — $116.18/mo'),
              h('option', { value: 'performance-8x' }, 'Performance 8x (16GB) — $232.36/mo')
            )
          )
        ),

        // ── AWS EC2 ─────────────────────────────────────────
        deployForm.target === 'aws' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Access Key ID'),
              h('input', { className: 'input', type: 'password', value: deployForm.awsAccessKeyId, onChange: function(e) { setDf('awsAccessKeyId', e.target.value); }, placeholder: 'AKIA...' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Secret Access Key'),
              h('input', { className: 'input', type: 'password', value: deployForm.awsSecretAccessKey, onChange: function(e) { setDf('awsSecretAccessKey', e.target.value); }, placeholder: '••••••••' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
              h('select', { className: 'input', value: deployForm.awsRegion, onChange: function(e) { setDf('awsRegion', e.target.value); } },
                h('option', { value: 'us-east-1' }, 'US East (N. Virginia)'),
                h('option', { value: 'us-east-2' }, 'US East (Ohio)'),
                h('option', { value: 'us-west-1' }, 'US West (N. California)'),
                h('option', { value: 'us-west-2' }, 'US West (Oregon)'),
                h('option', { value: 'eu-west-1' }, 'EU (Ireland)'),
                h('option', { value: 'eu-west-2' }, 'EU (London)'),
                h('option', { value: 'eu-central-1' }, 'EU (Frankfurt)'),
                h('option', { value: 'ap-southeast-1' }, 'Asia Pacific (Singapore)'),
                h('option', { value: 'ap-northeast-1' }, 'Asia Pacific (Tokyo)'),
                h('option', { value: 'ap-south-1' }, 'Asia Pacific (Mumbai)'),
                h('option', { value: 'sa-east-1' }, 'South America (São Paulo)'),
                h('option', { value: 'af-south-1' }, 'Africa (Cape Town)')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Instance Type'),
              h('select', { className: 'input', value: deployForm.awsInstanceType, onChange: function(e) { setDf('awsInstanceType', e.target.value); } },
                h('option', { value: 't3.micro' }, 't3.micro (1 vCPU, 1GB) — ~$7.59/mo'),
                h('option', { value: 't3.small' }, 't3.small (2 vCPU, 2GB) — ~$15.18/mo'),
                h('option', { value: 't3.medium' }, 't3.medium (2 vCPU, 4GB) — ~$30.37/mo'),
                h('option', { value: 't3.large' }, 't3.large (2 vCPU, 8GB) — ~$60.74/mo'),
                h('option', { value: 'm5.large' }, 'm5.large (2 vCPU, 8GB) — ~$69.12/mo'),
                h('option', { value: 'm5.xlarge' }, 'm5.xlarge (4 vCPU, 16GB) — ~$138.24/mo'),
                h('option', { value: 'c5.large' }, 'c5.large (2 vCPU, 4GB) — ~$61.20/mo'),
                h('option', { value: 'c5.xlarge' }, 'c5.xlarge (4 vCPU, 8GB) — ~$122.40/mo')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Key Pair Name'),
              h('input', { className: 'input', value: deployForm.awsKeyPairName, onChange: function(e) { setDf('awsKeyPairName', e.target.value); }, placeholder: 'my-keypair' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'AMI ID (optional)'),
              h('input', { className: 'input', value: deployForm.awsAmi, onChange: function(e) { setDf('awsAmi', e.target.value); }, placeholder: 'ami-... (default: Ubuntu 22.04)' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Subnet ID (optional)'),
              h('input', { className: 'input', value: deployForm.awsSubnetId, onChange: function(e) { setDf('awsSubnetId', e.target.value); }, placeholder: 'subnet-...' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Security Group (optional)'),
              h('input', { className: 'input', value: deployForm.awsSecurityGroupId, onChange: function(e) { setDf('awsSecurityGroupId', e.target.value); }, placeholder: 'sg-...' })
            )
          )
        ),

        // ── Google Cloud GCE ────────────────────────────────
        deployForm.target === 'gcp' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Project ID'),
              h('input', { className: 'input', value: deployForm.gcpProject, onChange: function(e) { setDf('gcpProject', e.target.value); }, placeholder: 'my-project-123' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Service Account Key (JSON)'),
              h('input', { className: 'input', type: 'password', value: deployForm.gcpServiceAccountKey, onChange: function(e) { setDf('gcpServiceAccountKey', e.target.value); }, placeholder: 'Paste JSON key or path' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
              h('select', { className: 'input', value: deployForm.gcpRegion, onChange: function(e) { setDf('gcpRegion', e.target.value); } },
                h('option', { value: 'us-central1' }, 'US Central (Iowa)'),
                h('option', { value: 'us-east1' }, 'US East (S. Carolina)'),
                h('option', { value: 'us-west1' }, 'US West (Oregon)'),
                h('option', { value: 'europe-west1' }, 'EU West (Belgium)'),
                h('option', { value: 'europe-west2' }, 'EU West (London)'),
                h('option', { value: 'europe-west3' }, 'EU West (Frankfurt)'),
                h('option', { value: 'asia-east1' }, 'Asia East (Taiwan)'),
                h('option', { value: 'asia-northeast1' }, 'Asia NE (Tokyo)'),
                h('option', { value: 'asia-southeast1' }, 'Asia SE (Singapore)'),
                h('option', { value: 'australia-southeast1' }, 'Australia (Sydney)'),
                h('option', { value: 'southamerica-east1' }, 'South America (São Paulo)')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Zone'),
              h('input', { className: 'input', value: deployForm.gcpZone, onChange: function(e) { setDf('gcpZone', e.target.value); }, placeholder: 'us-central1-a' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Machine Type'),
              h('select', { className: 'input', value: deployForm.gcpMachineType, onChange: function(e) { setDf('gcpMachineType', e.target.value); } },
                h('option', { value: 'e2-micro' }, 'e2-micro (0.25 vCPU, 1GB) — ~$6.11/mo'),
                h('option', { value: 'e2-small' }, 'e2-small (0.5 vCPU, 2GB) — ~$12.23/mo'),
                h('option', { value: 'e2-medium' }, 'e2-medium (1 vCPU, 4GB) — ~$24.46/mo'),
                h('option', { value: 'e2-standard-2' }, 'e2-standard-2 (2 vCPU, 8GB) — ~$48.92/mo'),
                h('option', { value: 'e2-standard-4' }, 'e2-standard-4 (4 vCPU, 16GB) — ~$97.83/mo'),
                h('option', { value: 'n2-standard-2' }, 'n2-standard-2 (2 vCPU, 8GB) — ~$56.52/mo'),
                h('option', { value: 'c2-standard-4' }, 'c2-standard-4 (4 vCPU, 16GB) — ~$124.49/mo')
              )
            )
          )
        ),

        // ── Microsoft Azure ─────────────────────────────────
        deployForm.target === 'azure' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Subscription ID'),
              h('input', { className: 'input', value: deployForm.azureSubscriptionId, onChange: function(e) { setDf('azureSubscriptionId', e.target.value); }, placeholder: 'xxxxxxxx-xxxx-...' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Resource Group'),
              h('input', { className: 'input', value: deployForm.azureResourceGroup, onChange: function(e) { setDf('azureResourceGroup', e.target.value); }, placeholder: 'my-resource-group' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
              h('select', { className: 'input', value: deployForm.azureRegion, onChange: function(e) { setDf('azureRegion', e.target.value); } },
                h('option', { value: 'eastus' }, 'East US'),
                h('option', { value: 'eastus2' }, 'East US 2'),
                h('option', { value: 'westus2' }, 'West US 2'),
                h('option', { value: 'westus3' }, 'West US 3'),
                h('option', { value: 'centralus' }, 'Central US'),
                h('option', { value: 'northeurope' }, 'North Europe (Ireland)'),
                h('option', { value: 'westeurope' }, 'West Europe (Netherlands)'),
                h('option', { value: 'uksouth' }, 'UK South'),
                h('option', { value: 'germanywestcentral' }, 'Germany West Central'),
                h('option', { value: 'eastasia' }, 'East Asia (Hong Kong)'),
                h('option', { value: 'southeastasia' }, 'Southeast Asia (Singapore)'),
                h('option', { value: 'japaneast' }, 'Japan East'),
                h('option', { value: 'australiaeast' }, 'Australia East'),
                h('option', { value: 'brazilsouth' }, 'Brazil South'),
                h('option', { value: 'southafricanorth' }, 'South Africa North')
              )
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'VM Size'),
              h('select', { className: 'input', value: deployForm.azureVmSize, onChange: function(e) { setDf('azureVmSize', e.target.value); } },
                h('option', { value: 'Standard_B1s' }, 'B1s (1 vCPU, 1GB) — ~$7.59/mo'),
                h('option', { value: 'Standard_B1ms' }, 'B1ms (1 vCPU, 2GB) — ~$15.11/mo'),
                h('option', { value: 'Standard_B2s' }, 'B2s (2 vCPU, 4GB) — ~$30.37/mo'),
                h('option', { value: 'Standard_B2ms' }, 'B2ms (2 vCPU, 8GB) — ~$60.74/mo'),
                h('option', { value: 'Standard_D2s_v5' }, 'D2s v5 (2 vCPU, 8GB) — ~$70.08/mo'),
                h('option', { value: 'Standard_D4s_v5' }, 'D4s v5 (4 vCPU, 16GB) — ~$140.16/mo'),
                h('option', { value: 'Standard_F2s_v2' }, 'F2s v2 (2 vCPU, 4GB) — ~$61.25/mo'),
                h('option', { value: 'Standard_E2s_v5' }, 'E2s v5 (2 vCPU, 16GB) — ~$91.98/mo')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Tenant ID (optional)'),
              h('input', { className: 'input', type: 'password', value: deployForm.azureTenantId, onChange: function(e) { setDf('azureTenantId', e.target.value); }, placeholder: 'For service principal auth' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Client ID (optional)'),
              h('input', { className: 'input', type: 'password', value: deployForm.azureClientId, onChange: function(e) { setDf('azureClientId', e.target.value); }, placeholder: 'App registration client ID' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Client Secret (optional)'),
              h('input', { className: 'input', type: 'password', value: deployForm.azureClientSecret, onChange: function(e) { setDf('azureClientSecret', e.target.value); }, placeholder: '••••••••' })
            )
          )
        ),

        // ── Railway ─────────────────────────────────────────
        deployForm.target === 'railway' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'API Token'),
            h('input', { className: 'input', type: 'password', value: deployForm.railwayApiToken, onChange: function(e) { setDf('railwayApiToken', e.target.value); }, placeholder: 'railway_...' }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'From railway.app/account/tokens')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Project ID (optional)'),
            h('input', { className: 'input', value: deployForm.railwayProjectId, onChange: function(e) { setDf('railwayProjectId', e.target.value); }, placeholder: 'Auto-created if empty' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Service Name'),
            h('input', { className: 'input', value: deployForm.railwayServiceName, onChange: function(e) { setDf('railwayServiceName', e.target.value); }, placeholder: 'agenticmail-agent' })
          )
        ),

        // ── Docker ──────────────────────────────────────────
        deployForm.target === 'docker' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Image'),
              h('input', { className: 'input', value: deployForm.dockerImage, onChange: function(e) { setDf('dockerImage', e.target.value); }, placeholder: 'agenticmail/agent' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Tag'),
              h('input', { className: 'input', value: deployForm.dockerTag, onChange: function(e) { setDf('dockerTag', e.target.value); }, placeholder: 'latest' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Ports'),
              h('input', { className: 'input', value: deployForm.dockerPorts, onChange: function(e) { setDf('dockerPorts', e.target.value); }, placeholder: '3000' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Memory'),
              h('input', { className: 'input', value: deployForm.dockerMemory, onChange: function(e) { setDf('dockerMemory', e.target.value); }, placeholder: '512m' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'CPU'),
              h('input', { className: 'input', value: deployForm.dockerCpu, onChange: function(e) { setDf('dockerCpu', e.target.value); }, placeholder: '0.5' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Network'),
              h('input', { className: 'input', value: deployForm.dockerNetwork, onChange: function(e) { setDf('dockerNetwork', e.target.value); }, placeholder: 'bridge (default)' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Restart Policy'),
              h('select', { className: 'input', value: deployForm.dockerRestart, onChange: function(e) { setDf('dockerRestart', e.target.value); } },
                h('option', { value: 'unless-stopped' }, 'Unless Stopped'),
                h('option', { value: 'always' }, 'Always'),
                h('option', { value: 'on-failure' }, 'On Failure'),
                h('option', { value: 'no' }, 'Never')
              )
            )
          )
        ),

        // ── VPS / Bare Metal ────────────────────────────────
        deployForm.target === 'vps' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Host'),
            h('input', { className: 'input', value: deployForm.vpsHost, onChange: function(e) { setDf('vpsHost', e.target.value); }, placeholder: '192.168.1.100 or hostname' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'SSH Port'),
            h('input', { className: 'input', type: 'number', value: deployForm.vpsPort, onChange: function(e) { setDf('vpsPort', e.target.value); }, placeholder: '22' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'User'),
            h('input', { className: 'input', value: deployForm.vpsUser, onChange: function(e) { setDf('vpsUser', e.target.value); }, placeholder: 'root' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'SSH Key Path'),
            h('input', { className: 'input', value: deployForm.vpsKeyPath, onChange: function(e) { setDf('vpsKeyPath', e.target.value); }, placeholder: '~/.ssh/id_rsa' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Work Directory'),
            h('input', { className: 'input', value: deployForm.vpsWorkDir, onChange: function(e) { setDf('vpsWorkDir', e.target.value); }, placeholder: '/opt/agenticmail' })
          )
        ),

        // ── Local ───────────────────────────────────────────
        deployForm.target === 'local' && h('div', { style: { padding: 16, background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' } },
          'Agent will run in-process on this server. No external deployment required. Best for development and testing.'
        )
      )
    ),

    // ─── Deployment Status Card ─────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Deployment Status'),
        !editingDeploy && h('button', { className: 'btn btn-ghost btn-sm', onClick: startDeployEdit }, I.journal(), ' Edit')
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' } },
          h('span', { className: 'status-dot ' + state }),
          h('span', { className: 'badge badge-' + stateColor, style: { fontSize: 12, textTransform: 'capitalize' } }, state),
          h('span', { className: 'badge badge-' + healthColor }, 'Health: ' + healthStatus),
          ea.health?.uptime && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Uptime: ' + formatUptime(ea.health.uptime))
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 13, marginBottom: 16 } },
          ea.deploymentUrl && h(Fragment, null,
            h('span', { style: { color: 'var(--text-muted)' } }, 'Endpoint'),
            h('a', { href: ea.deploymentUrl, target: '_blank', style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, ea.deploymentUrl)
          ),
          h('span', { style: { color: 'var(--text-muted)' } }, 'Target'),
          h('span', null, deploymentTarget),
          h('span', { style: { color: 'var(--text-muted)' } }, 'Model'),
          h('span', null, modelDisplay),
          deployment.region && h(Fragment, null,
            h('span', { style: { color: 'var(--text-muted)' } }, 'Region'),
            h('span', null, deployment.region)
          )
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          (state !== 'running' && state !== 'active' && state !== 'deploying') && h('button', { className: 'btn btn-primary btn-sm', onClick: deploy }, I.play(), ' Deploy'),
          (state === 'running' || state === 'active' || state === 'degraded') && h('button', { className: 'btn btn-danger btn-sm', onClick: stop }, I.stop(), ' Stop'),
          (state === 'running' || state === 'active' || state === 'degraded' || state === 'stopped') && h('button', { className: 'btn btn-secondary btn-sm', onClick: restart }, I.refresh(), ' Restart')
        )
      )
    ),

    // ─── Knowledge Bases Card ───────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Knowledge Bases')),
      knowledgeBases.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Name'),
                  h('th', null, 'Description'),
                  h('th', null, 'Documents')
                )
              ),
              h('tbody', null,
                knowledgeBases.map(function(kb, i) {
                  return h('tr', { key: kb.id || i },
                    h('td', { style: { fontWeight: 500, fontSize: 13 } }, kb.name || 'Unnamed'),
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, kb.description || '-'),
                    h('td', null, String(kb.documentCount || (Array.isArray(kb.documents) ? kb.documents.length : kb.documents) || kb.docCount || 0))
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h(EmptyState, { icon: I.database ? I.database() : null, message: 'No knowledge bases attached to this agent.' })
          )
    ),

    // ─── Configuration Card ─────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Configuration'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setShowJson(!showJson); } }, showJson ? 'Structured View' : 'Raw JSON')
      ),
      h('div', { className: 'card-body' },
        showJson
          ? h('pre', { style: { fontSize: 11, background: 'var(--bg-tertiary)', padding: 16, borderRadius: 'var(--radius)', overflow: 'auto', maxHeight: 500, margin: 0 } }, JSON.stringify(config, null, 2))
          : h('div', null,

              // Identity Section
              h('div', { style: { marginBottom: 20 } },
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' } }, 'Identity'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Name'),
                  h('span', null, identity.name || ea.name || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Display Name'),
                  h('span', null, identity.displayName || identity.display_name || config.displayName || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Email'),
                  h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, identity.email || ea.email || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Role'),
                  h('span', null, identity.role || config.role || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Avatar'),
                  h('span', null, identity.avatar ? (identity.avatar.length > 2 ? 'Custom image' : identity.avatar) : '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Gender'),
                  h('span', null, identity.gender || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Date of Birth'),
                  h('span', null, identity.dob || identity.dateOfBirth || identity.date_of_birth || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Language'),
                  h('span', null, identity.language || config.language || '-')
                )
              ),

              // Model Section
              h('div', { style: { marginBottom: 20 } },
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' } }, 'Model'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Provider'),
                  h('span', null, (typeof config.model === 'object' ? config.model.provider : config.provider) || config.modelProvider || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Model ID'),
                  h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, typeof config.model === 'string' ? config.model : (config.model ? (config.model.modelId || '-') : '-'))
                )
              ),

              // Deployment Section
              h('div', null,
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' } }, 'Deployment'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Target'),
                  h('span', null, deployment.target || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Region'),
                  h('span', null, deployment.region || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Image Tag'),
                  h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, deployment.imageTag || deployment.image_tag || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Memory'),
                  h('span', null, deployment.memory || deployment.memoryMb ? (deployment.memoryMb || deployment.memory) + ' MB' : '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'CPU'),
                  h('span', null, deployment.cpu || deployment.cpuUnits ? String(deployment.cpuUnits || deployment.cpu) : '-')
                )
              )
            )
      )
    ),

    // ─── Danger Zone ────────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20, border: '1px solid var(--danger)' } },
      h('div', { className: 'card-header', style: { borderBottom: '1px solid var(--danger)' } }, h('span', { style: { color: 'var(--danger)', fontWeight: 600 } }, 'Danger Zone')),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('div', null,
            h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, 'Delete Agent'),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Permanently delete this agent and all associated data. This action cannot be undone.')
          ),
          h('button', { className: 'btn btn-danger btn-sm', onClick: deleteAgent }, I.trash(), ' Delete Agent')
        )
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// TOOL SECURITY SECTION
// ════════════════════════════════════════════════════════════

var _tsCardStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 };
var _tsCardTitle = { fontSize: 15, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 };
var _tsCardDesc = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 };
var _tsToggleRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
var _tsGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
// --- EmailSection -------------------------------------------------------

// ════════════════════════════════════════════════════════════
// TOOLS SECTION — Toggle tool categories per agent
// ════════════════════════════════════════════════════════════

function ToolsSection(props) {
  var agentId = props.agentId;
  var _d = useApp(); var toast = _d.toast;
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _cats = useState([]); var cats = _cats[0]; var setCats = _cats[1];
  var _stats = useState({}); var stats = _stats[0]; var setStats = _stats[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _filter = useState('all'); var filter = _filter[0]; var setFilter = _filter[1];
  var _expanded = useState(null); var expanded = _expanded[0]; var setExpanded = _expanded[1];

  function load() {
    setLoading(true);
    engineCall('/bridge/agents/' + agentId + '/tools')
      .then(function(d) {
        setCats(d.categories || []);
        setStats({ total: d.totalTools, enabled: d.enabledTools });
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }

  useEffect(function() { load(); }, [agentId]);

  function toggle(catId, currentEnabled) {
    setSaving(true);
    var body = {};
    body[catId] = !currentEnabled;
    engineCall('/bridge/agents/' + agentId + '/tools', {
      method: 'PUT',
      body: JSON.stringify(body),
    }).then(function() {
      setCats(function(prev) {
        return prev.map(function(c) {
          return c.id === catId ? Object.assign({}, c, { enabled: !currentEnabled }) : c;
        });
      });
      setStats(function(prev) {
        var cat = cats.find(function(c) { return c.id === catId; });
        var delta = currentEnabled ? -(cat?.toolCount || 0) : (cat?.toolCount || 0);
        return Object.assign({}, prev, { enabled: (prev.enabled || 0) + delta });
      });
      toast((!currentEnabled ? 'Enabled' : 'Disabled') + ' tools', 'success');
      setSaving(false);
    }).catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  function toggleAll(enable) {
    setSaving(true);
    var body = {};
    cats.forEach(function(c) { if (!c.alwaysOn) body[c.id] = enable; });
    engineCall('/bridge/agents/' + agentId + '/tools', {
      method: 'PUT',
      body: JSON.stringify(body),
    }).then(function() {
      load();
      toast(enable ? 'All tools enabled' : 'All optional tools disabled', 'success');
      setSaving(false);
    }).catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  if (loading) return h('div', { className: 'card', style: { padding: 40, textAlign: 'center' } }, 'Loading tools...');

  var filtered = cats.filter(function(c) {
    if (filter === 'enabled') return c.enabled;
    if (filter === 'disabled') return !c.enabled;
    if (filter === 'google') return c.requiresOAuth === 'google' || c.id.startsWith('google_');
    if (filter === 'enterprise') return c.id.startsWith('enterprise_');
    if (filter === 'integrations') return !!c.requiresIntegration;
    return true;
  });

  var googleCats = cats.filter(function(c) { return c.requiresOAuth === 'google' || c.id.startsWith('google_'); });
  var googleAvailable = googleCats.some(function(c) { return c.isAvailable; });

  return h('div', null,
    // Stats bar
    h('div', { style: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      h('div', { className: 'card', style: { padding: '12px 16px', flex: '1 1 auto', minWidth: 150 } },
        h('div', { style: { fontSize: 24, fontWeight: 700, color: 'var(--accent)' } }, stats.enabled || 0),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'of ' + (stats.total || 0) + ' tools enabled')
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-sm', disabled: saving, onClick: function() { toggleAll(true); } }, 'Enable All'),
        h('button', { className: 'btn btn-sm btn-danger', disabled: saving, onClick: function() { toggleAll(false); } }, 'Disable Optional')
      )
    ),

    // Google Workspace notice
    !googleAvailable && googleCats.length > 0 && h('div', { style: { padding: '12px 16px', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12 } },
      h('strong', null, '\u26A0\uFE0F Google Workspace tools require OAuth'), ' — ',
      'Connect a Google account in the ', h('strong', null, 'Email'), ' tab to unlock Gmail, Calendar, Drive, Sheets, Docs, and Contacts tools.'
    ),

    // Filter tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [
        { id: 'all', label: 'All' },
        { id: 'enabled', label: 'Enabled' },
        { id: 'disabled', label: 'Disabled' },
        { id: 'google', label: 'Google Workspace' },
        { id: 'enterprise', label: 'Enterprise' },
        { id: 'integrations', label: 'Integrations' },
      ].map(function(f) {
        return h('div', { key: f.id, className: 'tab' + (filter === f.id ? ' active' : ''), onClick: function() { setFilter(f.id); } }, f.label);
      })
    ),

    // Tool category cards
    h('div', { style: { display: 'grid', gap: 12 } },
      filtered.map(function(cat) {
        var isExpanded = expanded === cat.id;
        return h('div', {
          key: cat.id,
          className: 'card',
          style: { opacity: !cat.isAvailable && cat.requiresOAuth ? 0.6 : 1 }
        },
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' },
            onClick: function() { setExpanded(isExpanded ? null : cat.id); }
          },
            // Icon
            h('div', { style: { fontSize: 22, width: 36, textAlign: 'center', flexShrink: 0 } }, cat.icon),
            // Info
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 } },
                h('span', { style: { fontWeight: 600, fontSize: 14 } }, cat.name),
                h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }, cat.toolCount + ' tools'),
                !cat.isAvailable && cat.requiresOAuth && h('span', { className: 'badge badge-warning', style: { fontSize: 10, padding: '1px 6px' } }, 'OAuth Required'),
                cat.requiresIntegration && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--accent-soft)', color: 'var(--accent-text)' } }, 'Integration'),
                cat.alwaysOn && h('span', { className: 'badge badge-info', style: { fontSize: 10, padding: '1px 6px' } }, 'Always On')
              ),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, cat.description)
            ),
            // Toggle
            !cat.alwaysOn && h('div', {
              onClick: function(e) { e.stopPropagation(); if (!saving && (cat.isAvailable || cat.enabled)) toggle(cat.id, cat.enabled); },
              style: {
                width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: saving ? 'not-allowed' : 'pointer',
                background: cat.enabled ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0,
              },
            },
              h('div', { style: {
                width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2,
                left: cat.enabled ? 22 : 2, transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              } })
            ),
            cat.alwaysOn && h('div', { style: { width: 44, height: 24, flexShrink: 0 } }),
            // Expand arrow
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 } }, isExpanded ? '\u25B2' : '\u25BC')
          ),

          // Expanded tool list
          isExpanded && h('div', { style: { borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg-secondary)' } },
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              cat.tools.map(function(t) {
                return h('span', {
                  key: t,
                  style: {
                    display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 11,
                    fontFamily: 'var(--font-mono)', background: cat.enabled ? 'var(--accent-soft)' : 'var(--bg-tertiary)',
                    color: cat.enabled ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid ' + (cat.enabled ? 'var(--accent)' : 'var(--border)'),
                  }
                }, t);
              })
            )
          )
        );
      })
    ),

    filtered.length === 0 && h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No tools match this filter.'),

    // ─── Browser Configuration ─────────────────────────
    h(BrowserConfigCard, { agentId: agentId }),

    // ─── Tool Restrictions ─────────────────────────────
    h(ToolRestrictionsCard, { agentId: agentId })
  );
}

// ════════════════════════════════════════════════════════════
// BROWSER CONFIG CARD — Configurable browser settings per agent
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// MEETING CAPABILITIES — Simple toggle, everything auto-managed
// ════════════════════════════════════════════════════════════

function MeetingCapabilitiesSection(props) {
  var agentId = props.agentId;
  var cfg = props.cfg;
  var update = props.update;
  var sectionStyle = props.sectionStyle;
  var sectionTitle = props.sectionTitle;
  var labelStyle = props.labelStyle;
  var helpStyle = props.helpStyle;
  var _d = useApp(); var toast = _d.toast;
  var _launching = useState(false); var launching = _launching[0]; var setLaunching = _launching[1];
  var _browserStatus = useState(null); var browserStatus = _browserStatus[0]; var setBrowserStatus = _browserStatus[1];
  var _sysCaps = useState(null); var sysCaps = _sysCaps[0]; var setSysCaps = _sysCaps[1];

  // Fetch system capabilities on mount
  useEffect(function() {
    engineCall('/bridge/system/capabilities')
      .then(function(d) { setSysCaps(d); })
      .catch(function() { setSysCaps(null); });
  }, []);

  function checkMeetingBrowser() {
    engineCall('/bridge/agents/' + agentId + '/browser-config/test', { method: 'POST' })
      .then(function(d) { setBrowserStatus(d); })
      .catch(function() { setBrowserStatus(null); });
  }

  useEffect(function() {
    if (cfg.meetingsEnabled) checkMeetingBrowser();
  }, [cfg.meetingsEnabled]);

  var _stopping = useState(false); var stopping = _stopping[0]; var setStopping = _stopping[1];

  function launchMeetingBrowser() {
    setLaunching(true);
    engineCall('/bridge/agents/' + agentId + '/browser-config/launch-meeting-browser', { method: 'POST' })
      .then(function(d) {
        if (d.error) { toast(d.error, 'error'); }
        else { toast('Meeting browser ready', 'success'); setBrowserStatus(d); }
        setLaunching(false);
      })
      .catch(function(e) { toast(e.message, 'error'); setLaunching(false); });
  }

  function stopMeetingBrowser() {
    setStopping(true);
    engineCall('/bridge/agents/' + agentId + '/browser-config/stop-meeting-browser', { method: 'POST' })
      .then(function(d) {
        if (d.error) { toast(d.error, 'error'); }
        else { toast('Meeting browser stopped', 'success'); setBrowserStatus(null); }
        setStopping(false);
      })
      .catch(function(e) { toast(e.message, 'error'); setStopping(false); });
  }

  var meetingsOn = cfg.meetingsEnabled === true;

  var isContainer = sysCaps && sysCaps.raw && (sysCaps.raw.deployment === 'container');
  var canJoinMeetings = sysCaps && sysCaps.raw && sysCaps.raw.canJoinMeetings;
  var isObserverOnly = sysCaps && sysCaps.raw && sysCaps.raw.isContainerWithFakeMedia;
  var canJoinFullMedia = sysCaps && sysCaps.raw && sysCaps.raw.canJoinMeetingsFullMedia;

  return h('div', { style: sectionStyle },
    sectionTitle('\uD83C\uDFA5', 'Meetings & Video Calls'),

    // Deployment capability warning — show for no-meeting OR observer-only
    sysCaps && (!canJoinMeetings || isObserverOnly) && h('div', { style: {
      background: isObserverOnly ? 'rgba(33,150,243,0.08)' : 'rgba(255,152,0,0.08)',
      border: '1px solid ' + (isObserverOnly ? 'rgba(33,150,243,0.3)' : 'rgba(255,152,0,0.3)'),
      borderRadius: 8, padding: '12px 16px', marginBottom: 16,
    } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
        h('span', { style: { fontSize: 18 } }, isObserverOnly ? '\uD83D\uDC41\uFE0F' : '\u26A0\uFE0F'),
        h('div', null,
          h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 } },
            isObserverOnly
              ? 'Observer Mode — Container Deployment'
              : 'Limited on this deployment' + (isContainer ? ' (container)' : '')
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 } },
            isObserverOnly
              ? 'This container has Chromium + virtual display, but uses fake media devices. The agent can join meetings as an observer — it can see the screen, read chat, and take notes, but cannot send or receive real audio/video.'
              : 'Video meeting joining requires a display server, audio subsystem, and browser — which are not available on container deployments (Fly.io, Railway, etc.).'
          ),
          isObserverOnly && h('div', { style: { fontSize: 12, marginTop: 8, lineHeight: 1.5 } },
            h('strong', null, 'Works in observer mode: '),
            'Join meetings, read chat, see shared screens, take screenshots, capture meeting notes.'
          ),
          isObserverOnly && h('div', { style: { fontSize: 12, marginTop: 4, lineHeight: 1.5 } },
            h('strong', null, 'Does NOT work: '),
            'Speaking, sending audio, showing video/camera, screen sharing.'
          ),
          !isObserverOnly && h('div', { style: { fontSize: 12, marginTop: 8, lineHeight: 1.5 } },
            h('strong', null, 'What works here: '), 'Calendar management, meeting prep, Drive organization, notes, email scanning for invites, RSVP.'
          ),
          h('div', { style: { fontSize: 12, marginTop: 8, lineHeight: 1.5 } },
            h('strong', null, 'For full media (audio + video): '), 'Deploy on a VM (Hetzner, DigitalOcean, GCP) with our ',
            h('code', { style: { fontSize: 11, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 } }, 'vm-setup.sh'),
            ' script, or use a Remote Browser (CDP) provider.'
          )
        )
      )
    ),

    // Main toggle
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: meetingsOn ? 16 : 0 } },
      h('div', {
        onClick: function() { update('meetingsEnabled', !meetingsOn); },
        style: {
          width: 52, height: 28, borderRadius: 14, position: 'relative', cursor: 'pointer',
          background: meetingsOn ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0,
        },
      },
        h('div', { style: {
          width: 24, height: 24, borderRadius: 12, background: '#fff', position: 'absolute', top: 2,
          left: meetingsOn ? 26 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        } })
      ),
      h('div', null,
        h('div', { style: { fontWeight: 600, fontSize: 13 } }, meetingsOn ? 'Meeting participation enabled' : 'Meeting participation disabled'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } },
          meetingsOn
            ? 'Agent can join Google Meet, Microsoft Teams, and Zoom calls automatically'
            : 'Enable to let this agent join video calls and meetings on behalf of your organization'
        )
      )
    ),

    // When enabled, show status + options
    meetingsOn && h('div', null,

      // Status card
      h('div', { style: { display: 'flex', gap: 12, marginBottom: 16 } },
        h('div', { className: 'card', style: { flex: 1, padding: '12px 16px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('div', { style: {
              width: 8, height: 8, borderRadius: 4,
              background: browserStatus?.ok ? 'var(--success)' : 'var(--warning)',
            } }),
            h('span', { style: { fontSize: 13, fontWeight: 600 } }, 'Meeting Browser'),
            browserStatus?.ok && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--success-soft)', color: 'var(--success)' } }, 'Running')
          ),
          browserStatus?.ok
            ? h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                  h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, browserStatus.browserVersion || 'Chromium ready'),
                  isObserverOnly && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'rgba(33,150,243,0.15)', color: 'var(--accent)' } }, 'Observer Only'),
                  browserStatus.port && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Port ' + browserStatus.port)
                ),
                h('button', {
                  className: 'btn btn-sm',
                  disabled: stopping,
                  onClick: stopMeetingBrowser,
                  style: { background: 'var(--danger)', color: '#fff', border: 'none', marginTop: 4 },
                }, stopping ? 'Stopping...' : '\u23F9\uFE0F Stop Meeting Browser'),
                isContainer && !canJoinMeetings && !isObserverOnly && h('div', { style: { fontSize: 11, color: 'var(--warning)', marginTop: 4 } },
                  '\u26A0 Browser is headless-only on this container. It cannot join video calls (no display/audio).'
                )
              )
            : h('div', null,
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } },
                  isContainer && !canJoinMeetings
                    ? 'Meeting browser cannot join video calls on container deployments. Use a VM or Remote Browser (CDP) instead.'
                    : 'A dedicated browser instance will be launched for video calls with virtual display and audio.'
                ),
                h('button', {
                  className: 'btn btn-sm',
                  disabled: launching || (isContainer && !canJoinMeetings),
                  onClick: launchMeetingBrowser,
                  title: isContainer && !canJoinMeetings ? 'Not available on container deployments' : '',
                },
                  isContainer && !canJoinMeetings
                    ? '\u274C Not available on containers'
                    : launching ? 'Launching...' : '\u25B6\uFE0F Launch Meeting Browser'
                )
              )
        )
      ),

      // Supported platforms
      h('div', { style: { display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 } },
        [
          { name: 'Google Meet', icon: '\uD83D\uDFE2', enabled: cfg.meetingGoogleMeet !== false, key: 'meetingGoogleMeet', desc: 'Join via Google Calendar integration' },
          { name: 'Microsoft Teams', icon: '\uD83D\uDFE3', enabled: cfg.meetingTeams !== false, key: 'meetingTeams', desc: 'Join via meeting links' },
          { name: 'Zoom', icon: '\uD83D\uDD35', enabled: cfg.meetingZoom !== false, key: 'meetingZoom', desc: 'Join via meeting links' },
        ].map(function(p) {
          return h('div', { key: p.key, className: 'card', style: { padding: '10px 12px', cursor: 'pointer', border: '1px solid ' + (p.enabled ? 'var(--accent)' : 'var(--border)') },
            onClick: function() { update(p.key, !p.enabled); }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
              h('span', null, p.icon),
              h('span', { style: { fontWeight: 600, fontSize: 12 } }, p.name),
              h('span', { style: { marginLeft: 'auto', fontSize: 11, color: p.enabled ? 'var(--success)' : 'var(--text-muted)' } }, p.enabled ? 'ON' : 'OFF')
            ),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, p.desc)
          );
        })
      ),

      // Meeting behavior
      h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Auto-Join Calendar Meetings'),
          h('select', { className: 'input', value: cfg.meetingAutoJoin || 'ask',
            onChange: function(e) { update('meetingAutoJoin', e.target.value); }
          },
            h('option', { value: 'always' }, 'Always — Join all meetings automatically'),
            h('option', { value: 'invited' }, 'When Invited — Only join meetings the agent is invited to'),
            h('option', { value: 'ask' }, 'Ask First — Request approval before joining'),
            h('option', { value: 'never' }, 'Manual Only — Agent only joins when explicitly told')
          ),
          h('div', { style: helpStyle }, 'How the agent decides when to join meetings.')
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Meeting Role'),
          h('select', { className: 'input', value: cfg.meetingRole || 'observer',
            onChange: function(e) { update('meetingRole', e.target.value); }
          },
            h('option', { value: 'observer' }, 'Observer — Listen and take notes only'),
            h('option', { value: 'participant' }, 'Participant — Can speak and interact'),
            h('option', { value: 'presenter' }, 'Presenter — Can share screen and present')
          ),
          h('div', { style: helpStyle }, 'What the agent is allowed to do in meetings.')
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Join Timing'),
          h('select', { className: 'input', value: cfg.meetingJoinTiming || 'ontime',
            onChange: function(e) { update('meetingJoinTiming', e.target.value); }
          },
            h('option', { value: 'early' }, 'Early — Join 2 minutes before start'),
            h('option', { value: 'ontime' }, 'On Time — Join at scheduled start'),
            h('option', { value: 'late' }, 'Fashionably Late — Join 2 minutes after start')
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'After Meeting'),
          h('select', { className: 'input', value: cfg.meetingAfterAction || 'notes',
            onChange: function(e) { update('meetingAfterAction', e.target.value); }
          },
            h('option', { value: 'notes' }, 'Send meeting notes to organizer'),
            h('option', { value: 'summary' }, 'Post summary to team channel'),
            h('option', { value: 'transcript' }, 'Save full transcript'),
            h('option', { value: 'nothing' }, 'Do nothing')
          ),
          h('div', { style: helpStyle }, 'What happens after the meeting ends.')
        )
      ),

      // Display name in meetings
      h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 12 } },
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Display Name in Meetings'),
          h('input', { className: 'input', placeholder: 'Agent name (e.g. "Fola - AI Assistant")',
            value: cfg.meetingDisplayName || '',
            onChange: function(e) { update('meetingDisplayName', e.target.value || undefined); }
          }),
          h('div', { style: helpStyle }, 'How the agent appears to other participants.')
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Max Meeting Duration (minutes)'),
          h('input', { className: 'input', type: 'number', min: 5, max: 480,
            value: cfg.meetingMaxDuration || 120,
            onChange: function(e) { update('meetingMaxDuration', parseInt(e.target.value) || 120); }
          }),
          h('div', { style: helpStyle }, 'Agent will leave after this duration to prevent runaway sessions.')
        )
      )
    )
  );
}

function BrowserConfigCard(props) {
  var agentId = props.agentId;
  var _d = useApp(); var toast = _d.toast;
  var _cfg = useState(null); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _testing = useState(false); var testing = _testing[0]; var setTesting = _testing[1];
  var _testResult = useState(null); var testResult = _testResult[0]; var setTestResult = _testResult[1];
  var _collapsed = useState(false); var collapsed = _collapsed[0]; var setCollapsed = _collapsed[1];

  function load() {
    engineCall('/bridge/agents/' + agentId + '/browser-config')
      .then(function(d) { setCfg(d.config || { provider: 'local' }); })
      .catch(function() { setCfg({ provider: 'local' }); });
  }

  useEffect(function() { load(); }, [agentId]);

  function save() {
    setSaving(true);
    engineCall('/bridge/agents/' + agentId + '/browser-config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }).then(function() { toast('Browser config saved', 'success'); setSaving(false); })
      .catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  function testConnection() {
    setTesting(true); setTestResult(null);
    engineCall('/bridge/agents/' + agentId + '/browser-config/test', { method: 'POST' })
      .then(function(d) { setTestResult(d); setTesting(false); })
      .catch(function(e) { setTestResult({ error: e.message }); setTesting(false); });
  }

  function update(key, value) {
    setCfg(function(prev) { var n = Object.assign({}, prev); n[key] = value; return n; });
  }

  if (!cfg) return null;

  var provider = cfg.provider || 'local';
  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var helpStyle = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };
  var sectionStyle = { padding: '12px 0', borderBottom: '1px solid var(--border)' };
  var sectionTitle = function(icon, text) {
    return h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 } },
      h('span', null, icon), text);
  };

  // Provider descriptions
  var providers = [
    { id: 'local', name: 'Local Chromium', icon: '\uD83D\uDCBB', desc: 'Built-in headless Chromium on this server. Best for web automation, scraping, screenshots, form filling.' },
    { id: 'remote-cdp', name: 'Remote Browser (CDP)', icon: '\uD83C\uDF10', desc: 'Connect to a Chrome/Chromium instance via Chrome DevTools Protocol. Required for headed mode, video calls, persistent sessions.' },
    { id: 'browserless', name: 'Browserless.io', icon: '\u2601\uFE0F', desc: 'Cloud browser service. Scalable, managed infrastructure. Supports stealth mode, residential proxies, and concurrent sessions.' },
    { id: 'browserbase', name: 'Browserbase', icon: '\uD83D\uDE80', desc: 'AI-native cloud browser. Built for agent automation with session replay, anti-detection, and managed infrastructure.' },
    { id: 'steel', name: 'Steel.dev', icon: '\u26A1', desc: 'Open-source browser API designed for AI agents. Self-hostable, session management, built-in stealth.' },
    { id: 'scrapingbee', name: 'ScrapingBee', icon: '\uD83D\uDC1D', desc: 'Web scraping API with browser rendering, proxy rotation, and CAPTCHA solving.' },
  ];

  return h('div', { className: 'card', style: { marginTop: 16 } },
    h('div', {
      className: 'card-header',
      style: { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      onClick: function() { setCollapsed(!collapsed); }
    },
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        '\uD83C\uDF10 Browser & Web Automation',
        cfg.provider && cfg.provider !== 'local' && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--accent-soft)', color: 'var(--accent)' } },
          providers.find(function(p) { return p.id === cfg.provider; })?.name || cfg.provider
        )
      ),
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, collapsed ? '\u25BC' : '\u25B2')
    ),
    !collapsed && h('div', { style: { padding: 16 } },

      // ─── Section 1: Browser Provider ─────────────────
      h('div', { style: sectionStyle },
        sectionTitle('\uD83D\uDD27', 'Browser Provider'),
        h('div', { style: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } },
          providers.map(function(p) {
            var selected = provider === p.id;
            return h('div', {
              key: p.id,
              onClick: function() { update('provider', p.id); },
              style: {
                padding: '12px 14px', borderRadius: 'var(--radius)', cursor: 'pointer',
                border: '2px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
                background: selected ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                transition: 'all 0.15s',
              }
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                h('span', { style: { fontSize: 18 } }, p.icon),
                h('span', { style: { fontWeight: 600, fontSize: 13 } }, p.name),
                selected && h('span', { style: { marginLeft: 'auto', color: 'var(--accent)', fontSize: 14 } }, '\u2713')
              ),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 } }, p.desc)
            );
          })
        )
      ),

      // ─── Section 2: Provider-Specific Config ─────────
      h('div', { style: sectionStyle },

        // Local Chromium
        provider === 'local' && h(Fragment, null,
          sectionTitle('\uD83D\uDCBB', 'Local Chromium Settings'),
          h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Display Mode'),
              h('select', { className: 'input', value: cfg.headless !== false ? 'true' : 'false',
                onChange: function(e) { update('headless', e.target.value === 'true'); }
              },
                h('option', { value: 'true' }, 'Headless (no window)'),
                h('option', { value: 'false' }, 'Headed (visible window)')
              ),
              h('div', { style: helpStyle }, 'Headed mode requires a display server (X11/Wayland).')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Executable Path'),
              h('input', { className: 'input', placeholder: 'Auto-detect (recommended)',
                value: cfg.executablePath || '',
                onChange: function(e) { update('executablePath', e.target.value || undefined); }
              }),
              h('div', { style: helpStyle }, 'Leave empty to use bundled Chromium.')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'User Data Directory'),
              h('input', { className: 'input', placeholder: 'Temporary (new profile each session)',
                value: cfg.userDataDir || '',
                onChange: function(e) { update('userDataDir', e.target.value || undefined); }
              }),
              h('div', { style: helpStyle }, 'Persist cookies, logins, and extensions across sessions.')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Extra Chrome Args'),
              h('input', { className: 'input', placeholder: '--no-sandbox, --disable-gpu',
                value: (cfg.extraArgs || []).join(', '),
                onChange: function(e) { update('extraArgs', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }
              }),
              h('div', { style: helpStyle }, 'Additional Chromium launch arguments.')
            )
          )
        ),

        // Remote CDP
        provider === 'remote-cdp' && h(Fragment, null,
          sectionTitle('\uD83C\uDF10', 'Remote Browser Connection'),
          h('div', { style: { padding: '10px 14px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 12, lineHeight: 1.5 } },
            h('strong', null, 'How it works: '),
            'The agent connects to a Chrome/Chromium browser running on another machine via the Chrome DevTools Protocol (CDP). ',
            'This is required for video calls (Google Meet, Teams, Zoom) where the browser needs a camera, microphone, and display. ',
            h('br', null), h('br', null),
            h('strong', null, 'Setup options:'), h('br', null),
            '\u2022 Run Chrome with --remote-debugging-port=9222 on a VM/desktop', h('br', null),
            '\u2022 Use a cloud desktop (AWS WorkSpaces, Azure Virtual Desktop, Hetzner)', h('br', null),
            '\u2022 Set up a dedicated browser VM with virtual camera/audio for meetings', h('br', null),
            '\u2022 Use SSH tunneling to expose Chrome DevTools securely'
          ),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'CDP WebSocket URL *'),
              h('input', { className: 'input', placeholder: 'ws://192.168.1.100:9222/devtools/browser/...',
                value: cfg.cdpUrl || '',
                onChange: function(e) { update('cdpUrl', e.target.value); }
              }),
              h('div', { style: helpStyle }, 'WebSocket URL from chrome://inspect or --remote-debugging-port output. Format: ws://host:port/devtools/browser/<id>')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Auth Token'),
                h('input', { className: 'input', type: 'password', placeholder: 'Optional — for authenticated CDP endpoints',
                  value: cfg.cdpAuthToken || '',
                  onChange: function(e) { update('cdpAuthToken', e.target.value || undefined); }
                })
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Connection Timeout (ms)'),
                h('input', { className: 'input', type: 'number', min: 5000, max: 60000,
                  value: cfg.cdpTimeout || 30000,
                  onChange: function(e) { update('cdpTimeout', parseInt(e.target.value) || 30000); }
                })
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'SSH Tunnel (auto-connect)'),
              h('input', { className: 'input', placeholder: 'ssh -L 9222:localhost:9222 user@remote-host (optional)',
                value: cfg.sshTunnel || '',
                onChange: function(e) { update('sshTunnel', e.target.value || undefined); }
              }),
              h('div', { style: helpStyle }, 'SSH command to establish tunnel before connecting. Agent will run this automatically.')
            )
          )
        ),

        // Browserless
        provider === 'browserless' && h(Fragment, null,
          sectionTitle('\u2601\uFE0F', 'Browserless.io Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Token *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your Browserless API token',
                value: cfg.browserlessToken || '',
                onChange: function(e) { update('browserlessToken', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://www.browserless.io/dashboard', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API token'), ' from the Browserless dashboard.')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Endpoint'),
                h('input', { className: 'input', placeholder: 'wss://chrome.browserless.io (default)',
                  value: cfg.browserlessEndpoint || '',
                  onChange: function(e) { update('browserlessEndpoint', e.target.value || undefined); }
                }),
                h('div', { style: helpStyle }, 'Custom endpoint for self-hosted or enterprise plans.')
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Concurrent Sessions'),
                h('input', { className: 'input', type: 'number', min: 1, max: 100,
                  value: cfg.browserlessConcurrency || 5,
                  onChange: function(e) { update('browserlessConcurrency', parseInt(e.target.value) || 5); }
                })
              )
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Stealth Mode'),
                h('select', { className: 'input', value: cfg.browserlessStealth ? 'true' : 'false',
                  onChange: function(e) { update('browserlessStealth', e.target.value === 'true'); }
                },
                  h('option', { value: 'false' }, 'Off'),
                  h('option', { value: 'true' }, 'On — Evade bot detection')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Proxy'),
                h('input', { className: 'input', placeholder: 'Optional proxy URL',
                  value: cfg.browserlessProxy || '',
                  onChange: function(e) { update('browserlessProxy', e.target.value || undefined); }
                })
              )
            )
          )
        ),

        // Browserbase
        provider === 'browserbase' && h(Fragment, null,
          sectionTitle('\uD83D\uDE80', 'Browserbase Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Key *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your Browserbase API key',
                value: cfg.browserbaseApiKey || '',
                onChange: function(e) { update('browserbaseApiKey', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://www.browserbase.com/settings', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API key'), ' from Browserbase settings.')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Project ID *'),
              h('input', { className: 'input', placeholder: 'Your Browserbase project ID',
                value: cfg.browserbaseProjectId || '',
                onChange: function(e) { update('browserbaseProjectId', e.target.value); }
              })
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Session Recording'),
                h('select', { className: 'input', value: cfg.browserbaseRecording !== false ? 'true' : 'false',
                  onChange: function(e) { update('browserbaseRecording', e.target.value === 'true'); }
                },
                  h('option', { value: 'true' }, 'Enabled — Record sessions for replay'),
                  h('option', { value: 'false' }, 'Disabled')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Keep Session Alive'),
                h('select', { className: 'input', value: cfg.browserbaseKeepAlive ? 'true' : 'false',
                  onChange: function(e) { update('browserbaseKeepAlive', e.target.value === 'true'); }
                },
                  h('option', { value: 'false' }, 'Close after task'),
                  h('option', { value: 'true' }, 'Keep alive for reuse')
                )
              )
            )
          )
        ),

        // Steel
        provider === 'steel' && h(Fragment, null,
          sectionTitle('\u26A1', 'Steel.dev Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Key *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your Steel API key',
                value: cfg.steelApiKey || '',
                onChange: function(e) { update('steelApiKey', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://app.steel.dev', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API key'), ' — or self-host Steel for free.')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Endpoint'),
                h('input', { className: 'input', placeholder: 'https://api.steel.dev (default)',
                  value: cfg.steelEndpoint || '',
                  onChange: function(e) { update('steelEndpoint', e.target.value || undefined); }
                })
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Session Duration (min)'),
                h('input', { className: 'input', type: 'number', min: 1, max: 120,
                  value: cfg.steelSessionDuration || 15,
                  onChange: function(e) { update('steelSessionDuration', parseInt(e.target.value) || 15); }
                })
              )
            )
          )
        ),

        // ScrapingBee
        provider === 'scrapingbee' && h(Fragment, null,
          sectionTitle('\uD83D\uDC1D', 'ScrapingBee Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Key *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your ScrapingBee API key',
                value: cfg.scrapingbeeApiKey || '',
                onChange: function(e) { update('scrapingbeeApiKey', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://www.scrapingbee.com/dashboard', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API key'), ' from ScrapingBee dashboard.')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'JavaScript Rendering'),
                h('select', { className: 'input', value: cfg.scrapingbeeJsRendering !== false ? 'true' : 'false',
                  onChange: function(e) { update('scrapingbeeJsRendering', e.target.value === 'true'); }
                },
                  h('option', { value: 'true' }, 'Enabled'),
                  h('option', { value: 'false' }, 'Disabled (faster)')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Premium Proxy'),
                h('select', { className: 'input', value: cfg.scrapingbeePremiumProxy ? 'true' : 'false',
                  onChange: function(e) { update('scrapingbeePremiumProxy', e.target.value === 'true'); }
                },
                  h('option', { value: 'false' }, 'Standard'),
                  h('option', { value: 'true' }, 'Premium (residential IPs)')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Country'),
                h('input', { className: 'input', placeholder: 'us, gb, de...',
                  value: cfg.scrapingbeeCountry || '',
                  onChange: function(e) { update('scrapingbeeCountry', e.target.value || undefined); }
                })
              )
            )
          )
        )
      ),

      // ─── Section 3: Security & Limits ────────────────
      h('div', { style: sectionStyle },
        sectionTitle('\uD83D\uDD12', 'Security & Limits'),
        h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'URL Protection'),
            h('select', { className: 'input', value: cfg.ssrfProtection || 'permissive',
              onChange: function(e) { update('ssrfProtection', e.target.value); }
            },
              h('option', { value: 'off' }, 'Off — No URL restrictions'),
              h('option', { value: 'permissive' }, 'Permissive — Block dangerous URLs'),
              h('option', { value: 'strict' }, 'Strict — Allowlist only')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'JavaScript Evaluation'),
            h('select', { className: 'input', value: cfg.allowEvaluate !== false ? 'true' : 'false',
              onChange: function(e) { update('allowEvaluate', e.target.value === 'true'); }
            },
              h('option', { value: 'true' }, 'Allowed'),
              h('option', { value: 'false' }, 'Blocked')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'File URLs (file://)'),
            h('select', { className: 'input', value: cfg.allowFileUrls ? 'true' : 'false',
              onChange: function(e) { update('allowFileUrls', e.target.value === 'true'); }
            },
              h('option', { value: 'false' }, 'Blocked'),
              h('option', { value: 'true' }, 'Allowed')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Max Concurrent Tabs'),
            h('input', { className: 'input', type: 'number', min: 1, max: 50,
              value: cfg.maxContexts || 10,
              onChange: function(e) { update('maxContexts', parseInt(e.target.value) || 10); }
            })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Navigation Timeout (ms)'),
            h('input', { className: 'input', type: 'number', min: 5000, max: 120000, step: 1000,
              value: cfg.navigationTimeoutMs || 30000,
              onChange: function(e) { update('navigationTimeoutMs', parseInt(e.target.value) || 30000); }
            })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Idle Timeout (min)'),
            h('input', { className: 'input', type: 'number', min: 1, max: 60,
              value: Math.round((cfg.idleTimeoutMs || 300000) / 60000),
              onChange: function(e) { update('idleTimeoutMs', (parseInt(e.target.value) || 5) * 60000); }
            })
          )
        ),
        h('div', { className: 'form-group', style: { marginTop: 12 } },
          h('label', { style: labelStyle }, 'Blocked URL Patterns'),
          h('input', { className: 'input', placeholder: '*://169.254.*, *://metadata.google.*',
            value: (cfg.blockedUrlPatterns || []).join(', '),
            onChange: function(e) { update('blockedUrlPatterns', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }
          })
        ),
        cfg.ssrfProtection === 'strict' && h('div', { className: 'form-group', style: { marginTop: 8 } },
          h('label', { style: labelStyle }, 'Allowed URL Patterns'),
          h('input', { className: 'input', placeholder: '*://example.com/*, *://app.service.com/*',
            value: (cfg.allowedUrlPatterns || []).join(', '),
            onChange: function(e) { update('allowedUrlPatterns', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }
          })
        )
      ),

      // ─── Section 4: Meeting & Video Capabilities ─────
      h(MeetingCapabilitiesSection, { agentId: agentId, cfg: cfg, update: update, labelStyle: labelStyle, helpStyle: helpStyle, sectionStyle: sectionStyle, sectionTitle: sectionTitle }),

      // ─── Section 5: Persistent Sessions ──────────────
      h('div', { style: { paddingTop: 12 } },
        sectionTitle('\uD83D\uDD04', 'Session Persistence'),
        h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Persist Login Sessions'),
            h('select', { className: 'input', value: cfg.persistSessions ? 'true' : 'false',
              onChange: function(e) { update('persistSessions', e.target.value === 'true'); }
            },
              h('option', { value: 'false' }, 'No — Fresh session each time'),
              h('option', { value: 'true' }, 'Yes — Keep cookies, localStorage, logins')
            ),
            h('div', { style: helpStyle }, 'Persistent sessions let agents stay logged into web apps.')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Session Storage Path'),
            h('input', { className: 'input', placeholder: '/data/browser-sessions/' + agentId.slice(0, 8),
              value: cfg.sessionStoragePath || '',
              onChange: function(e) { update('sessionStoragePath', e.target.value || undefined); }
            }),
            h('div', { style: helpStyle }, 'Directory to store persistent browser state.')
          )
        )
      ),

      // ─── Actions Bar ─────────────────────────────────
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 8, borderTop: '1px solid var(--border)' } },
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-sm', disabled: testing, onClick: testConnection },
            testing ? 'Testing...' : '\u{1F50C} Test Connection'
          ),
          testResult && h('span', { style: { fontSize: 12, color: testResult.error ? 'var(--danger)' : 'var(--success)', alignSelf: 'center' } },
            testResult.error ? '\u274C ' + testResult.error : '\u2705 Connected — ' + (testResult.browserVersion || 'OK')
          )
        ),
        h('button', { className: 'btn', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Browser Config')
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// TOOL RESTRICTIONS CARD — Per-agent restrictions
// ════════════════════════════════════════════════════════════

function ToolRestrictionsCard(props) {
  var agentId = props.agentId;
  var _d = useApp(); var toast = _d.toast;
  var _cfg = useState(null); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _collapsed = useState(true); var collapsed = _collapsed[0]; var setCollapsed = _collapsed[1];

  function load() {
    engineCall('/bridge/agents/' + agentId + '/tool-restrictions')
      .then(function(d) { setCfg(d.restrictions || {}); })
      .catch(function() { setCfg({}); });
  }

  useEffect(function() { load(); }, [agentId]);

  function save() {
    setSaving(true);
    engineCall('/bridge/agents/' + agentId + '/tool-restrictions', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }).then(function() { toast('Restrictions saved', 'success'); setSaving(false); })
      .catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  function update(key, value) {
    setCfg(function(prev) { var n = Object.assign({}, prev); n[key] = value; return n; });
  }

  if (!cfg) return null;

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var helpStyle = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };

  return h('div', { className: 'card', style: { marginTop: 16 } },
    h('div', {
      className: 'card-header',
      style: { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      onClick: function() { setCollapsed(!collapsed); }
    },
      h('span', null, '\uD83D\uDD12 Tool Restrictions'),
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, collapsed ? '\u25BC' : '\u25B2')
    ),
    !collapsed && h('div', { style: { padding: 16, display: 'grid', gap: 16 } },
      // Max file size for read/write
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Max File Size (MB)'),
        h('input', {
          className: 'input', type: 'number', min: 1, max: 1000,
          value: cfg.maxFileSizeMb || 50,
          onChange: function(e) { update('maxFileSizeMb', parseInt(e.target.value) || 50); }
        }),
        h('div', { style: helpStyle }, 'Maximum file size the agent can read or write.')
      ),

      // Shell command execution
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Shell Command Execution'),
        h('select', {
          className: 'input', value: cfg.shellExecution || 'allowed',
          onChange: function(e) { update('shellExecution', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Full shell access'),
          h('option', { value: 'sandboxed' }, 'Sandboxed — Limited to safe commands'),
          h('option', { value: 'blocked' }, 'Blocked — No shell execution')
        ),
        h('div', { style: helpStyle }, 'Controls whether the agent can run shell commands.')
      ),

      // Web fetch restrictions
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Web Fetch'),
        h('select', {
          className: 'input', value: cfg.webFetch || 'allowed',
          onChange: function(e) { update('webFetch', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Can fetch any URL'),
          h('option', { value: 'restricted' }, 'Restricted — Only allowed domains'),
          h('option', { value: 'blocked' }, 'Blocked — No web fetching')
        )
      ),

      // Email sending restrictions
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Email Sending'),
        h('select', {
          className: 'input', value: cfg.emailSending || 'allowed',
          onChange: function(e) { update('emailSending', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Can send to anyone'),
          h('option', { value: 'internal' }, 'Internal Only — Same domain only'),
          h('option', { value: 'approval' }, 'Requires Approval — Manager must approve'),
          h('option', { value: 'blocked' }, 'Blocked — No email sending')
        ),
        h('div', { style: helpStyle }, 'Controls who the agent can email.')
      ),

      // Database access
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Database Access'),
        h('select', {
          className: 'input', value: cfg.databaseAccess || 'readwrite',
          onChange: function(e) { update('databaseAccess', e.target.value); }
        },
          h('option', { value: 'readwrite' }, 'Read + Write — Full database access'),
          h('option', { value: 'readonly' }, 'Read Only — SELECT queries only'),
          h('option', { value: 'blocked' }, 'Blocked — No database access')
        )
      ),

      // Drive/file sharing
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'File Sharing (Drive)'),
        h('select', {
          className: 'input', value: cfg.fileSharing || 'allowed',
          onChange: function(e) { update('fileSharing', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Can share files externally'),
          h('option', { value: 'internal' }, 'Internal Only — Share within org only'),
          h('option', { value: 'blocked' }, 'Blocked — No file sharing')
        )
      ),

      // Rate limiting
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Rate Limit (calls per minute)'),
        h('input', {
          className: 'input', type: 'number', min: 0, max: 1000,
          value: cfg.rateLimit || 0,
          onChange: function(e) { update('rateLimit', parseInt(e.target.value) || 0); }
        }),
        h('div', { style: helpStyle }, '0 = no limit. Applies across all tool calls.')
      ),

      // Save button
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', paddingTop: 8 } },
        h('button', { className: 'btn', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Restrictions')
      )
    )
  );
}

function EmailSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent || {};
  var reload = props.reload;

  var app = useApp();
  var toast = app.toast;

  var _config = useState(null);
  var emailConfig = _config[0]; var setEmailConfig = _config[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _testing = useState(false);
  var testing = _testing[0]; var setTesting = _testing[1];
  var _testResult = useState(null);
  var testResult = _testResult[0]; var setTestResult = _testResult[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _showOauthHelp = useState(false);
  var showOauthHelp = _showOauthHelp[0]; var setShowOauthHelp = _showOauthHelp[1];

  // Form state
  var _form = useState({
    provider: 'imap',
    preset: '',
    email: '',
    password: '',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 587,
    oauthClientId: '',
    oauthClientSecret: '',
    oauthTenantId: 'common',
  });
  var form = _form[0]; var setForm = _form[1];

  function set(key, val) {
    setForm(function(prev) { var n = Object.assign({}, prev); n[key] = val; return n; });
  }

  // Load current config
  function loadConfig() {
    setLoading(true);
    engineCall('/bridge/agents/' + agentId + '/email-config')
      .then(function(d) {
        setEmailConfig(d);
        if (d.configured) {
          setForm(function(prev) { return Object.assign({}, prev, {
            provider: d.provider || 'imap',
            email: d.email || '',
            imapHost: d.imapHost || '',
            imapPort: d.imapPort || 993,
            smtpHost: d.smtpHost || '',
            smtpPort: d.smtpPort || 587,
            oauthClientId: d.oauthClientId || '',
            oauthTenantId: d.oauthTenantId || 'common',
          }); });
        } else {
          // Pre-fill email from agent identity
          var identity = (engineAgent.config || {}).identity || {};
          var agentEmail = identity.email || (engineAgent.config || {}).email || '';
          if (agentEmail && agentEmail.indexOf('@agenticmail.local') === -1) {
            set('email', agentEmail);
          }
        }
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }

  useEffect(function() { loadConfig(); }, [agentId]);

  // Listen for OAuth popup completion
  useEffect(function() {
    function onMessage(e) {
      if (e.data && e.data.type === 'oauth-result') {
        if (e.data.status === 'success') {
          toast('Email connected successfully', 'success');
        } else {
          toast('OAuth failed: ' + (e.data.message || 'Unknown error'), 'error');
        }
        loadConfig();
        if (reload) reload();
      }
    }
    window.addEventListener('message', onMessage);
    return function() { window.removeEventListener('message', onMessage); };
  }, []);

  // Preset changed → auto-fill hosts
  var PRESETS = {
    microsoft365: { label: 'Microsoft 365 / Outlook', imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
    gmail: { label: 'Google Workspace / Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
    yahoo: { label: 'Yahoo Mail', imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465 },
    zoho: { label: 'Zoho Mail', imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 587 },
    fastmail: { label: 'Fastmail', imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587 },
    custom: { label: 'Custom IMAP/SMTP', imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587 },
  };

  function applyPreset(key) {
    var p = PRESETS[key];
    if (p) {
      setForm(function(prev) { return Object.assign({}, prev, { preset: key, imapHost: p.imapHost, imapPort: p.imapPort, smtpHost: p.smtpHost, smtpPort: p.smtpPort }); });
    }
  }

  // Save
  async function handleSave() {
    setSaving(true);
    try {
      var body = { provider: form.provider, email: form.email };
      if (form.provider === 'imap') {
        Object.assign(body, {
          password: form.password || undefined,
          preset: form.preset !== 'custom' ? form.preset : undefined,
          imapHost: form.imapHost,
          imapPort: form.imapPort,
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
        });
      } else if (form.provider === 'microsoft') {
        var baseUrl = window.location.origin;
        var hasOrgMs = emailConfig && emailConfig.orgEmailConfig && emailConfig.orgEmailConfig.provider === 'microsoft';
        Object.assign(body, {
          oauthClientId: form.oauthClientId || undefined,
          oauthClientSecret: form.oauthClientSecret || undefined,
          oauthTenantId: form.oauthTenantId,
          oauthRedirectUri: baseUrl + '/api/engine/oauth/callback',
          useOrgConfig: hasOrgMs && !form.oauthClientId ? true : undefined,
        });
      } else if (form.provider === 'google') {
        var gBaseUrl = window.location.origin;
        var hasOrgG = emailConfig && emailConfig.orgEmailConfig && emailConfig.orgEmailConfig.provider === 'google';
        Object.assign(body, {
          oauthClientId: form.oauthClientId || undefined,
          oauthClientSecret: form.oauthClientSecret || undefined,
          oauthRedirectUri: gBaseUrl + '/api/engine/oauth/callback',
          useOrgConfig: hasOrgG && !form.oauthClientId ? true : undefined,
        });
      }

      var result = await engineCall('/bridge/agents/' + agentId + '/email-config', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      if (result.emailConfig && result.emailConfig.oauthAuthUrl) {
        toast('OAuth configured — click "Authorize" to complete setup', 'info');
      } else {
        toast('Email configuration saved', 'success');
      }
      loadConfig();
      if (reload) reload();
    } catch (err) {
      toast(err.message, 'error');
    }
    setSaving(false);
  }

  // Test connection
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      var result = await engineCall('/bridge/agents/' + agentId + '/email-config/test', { method: 'POST' });
      setTestResult(result);
      if (result.success) toast('Connection successful!', 'success');
      else toast('Connection failed: ' + (result.error || 'Unknown error'), 'error');
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      toast('Test failed: ' + err.message, 'error');
    }
    setTesting(false);
  }

  // Disconnect
  async function handleDisconnect() {
    try {
      await engineCall('/bridge/agents/' + agentId + '/email-config', { method: 'DELETE' });
      toast('Email disconnected', 'success');
      setEmailConfig(null);
      setTestResult(null);
      loadConfig();
      if (reload) reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Open OAuth window
  function openOAuth() {
    if (emailConfig && emailConfig.oauthAuthUrl) {
      window.open(emailConfig.oauthAuthUrl, '_blank', 'width=600,height=700');
    }
  }

  if (loading) return h('div', { className: 'card', style: { padding: 40, textAlign: 'center' } }, 'Loading email config...');

  var statusBadge = !emailConfig || !emailConfig.configured
    ? h('span', { className: 'badge badge-neutral' }, 'Not Connected')
    : emailConfig.status === 'connected'
      ? h('span', { className: 'badge badge-success' }, 'Connected')
      : emailConfig.status === 'configured'
        ? h('span', { className: 'badge badge-info' }, 'Configured')
        : emailConfig.status === 'awaiting_oauth'
          ? h('span', { className: 'badge badge-warning' }, 'Awaiting Authorization')
          : emailConfig.status === 'error'
            ? h('span', { className: 'badge badge-danger' }, 'Error')
            : h('span', { className: 'badge badge-neutral' }, emailConfig.status || 'Unknown');

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' };
  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 13, fontFamily: 'inherit' };
  var helpStyle = { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', null,
        h('h3', { className: 'card-title' }, 'Email Connection'),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' } }, 'Connect this agent to an email account so it can send and receive emails.')
      ),
      statusBadge
    ),
    h('div', { className: 'card-body' },

      // ─── Org Email Config Banner ──────────────────────
      emailConfig && emailConfig.orgEmailConfig && h('div', { style: { padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 'var(--radius)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 } },
        h('span', { style: { fontSize: 18 } }, '\u2705'),
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'Your organization has configured ', emailConfig.orgEmailConfig.label || emailConfig.orgEmailConfig.provider),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Select ', emailConfig.orgEmailConfig.provider === 'google' ? 'Google OAuth' : 'Microsoft OAuth', ' below — Client ID and Secret will be inherited automatically.')
        )
      ),

      // ─── Provider Selection ─────────────────────────
      h('div', { style: { marginBottom: 20 } },
        h('label', { style: labelStyle }, 'Connection Method'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 } },
          [
            { id: 'imap', label: 'Email + Password', desc: 'IMAP/SMTP — works with any email provider', icon: '📧' },
            { id: 'microsoft', label: 'Microsoft OAuth', desc: 'Azure AD / Entra ID — for M365 orgs', icon: '🏢' },
            { id: 'google', label: 'Google OAuth', desc: 'Google Workspace — for GWS orgs', icon: '🔵' },
          ].map(function(m) {
            var selected = form.provider === m.id;
            return h('div', {
              key: m.id,
              onClick: function() { set('provider', m.id); },
              style: {
                padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: selected ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                cursor: 'pointer', transition: 'all 0.15s',
              }
            },
              h('div', { style: { fontSize: 20, marginBottom: 4 } }, m.icon),
              h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 2 } }, m.label),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, m.desc)
            );
          })
        )
      ),

      // ─── IMAP/SMTP Config ───────────────────────────
      form.provider === 'imap' && h(Fragment, null,
        h('div', { style: { marginBottom: 16 } },
          h('label', { style: labelStyle }, 'Email Provider'),
          h('select', { style: inputStyle, value: form.preset, onChange: function(e) { applyPreset(e.target.value); } },
            h('option', { value: '' }, '-- Select your email provider --'),
            Object.entries(PRESETS).map(function(entry) {
              return h('option', { key: entry[0], value: entry[0] }, entry[1].label);
            })
          )
        ),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'Email Address *'),
            h('input', { style: inputStyle, type: 'email', value: form.email, placeholder: 'agent@company.com', onChange: function(e) { set('email', e.target.value); } }),
            h('p', { style: helpStyle }, 'The email address created for this agent in your email system')
          ),
          h('div', null,
            h('label', { style: labelStyle }, form.password ? 'App Password *' : 'App Password * (enter to set/update)'),
            h('input', { style: inputStyle, type: 'password', value: form.password, placeholder: emailConfig && emailConfig.configured ? '••••••••  (leave blank to keep current)' : 'Enter app password', onChange: function(e) { set('password', e.target.value); } }),
            h('p', { style: helpStyle }, 'For Microsoft 365: ', h('a', { href: 'https://mysignins.microsoft.com/security-info', target: '_blank', style: { color: 'var(--accent)' } }, 'Create app password'), ' | For Gmail: ', h('a', { href: 'https://myaccount.google.com/apppasswords', target: '_blank', style: { color: 'var(--accent)' } }, 'Create app password'))
          )
        ),

        // Server settings (auto-filled by preset, expandable for custom)
        (form.preset === 'custom' || form.preset === '') && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'IMAP Host *'),
            h('input', { style: inputStyle, value: form.imapHost, placeholder: 'imap.example.com', onChange: function(e) { set('imapHost', e.target.value); } })
          ),
          h('div', { style: { width: 80 } },
            h('label', { style: labelStyle }, 'Port'),
            h('input', { style: inputStyle, type: 'number', value: form.imapPort, onChange: function(e) { set('imapPort', parseInt(e.target.value) || 993); } })
          ),
          h('div', null,
            h('label', { style: labelStyle }, 'SMTP Host *'),
            h('input', { style: inputStyle, value: form.smtpHost, placeholder: 'smtp.example.com', onChange: function(e) { set('smtpHost', e.target.value); } })
          ),
          h('div', { style: { width: 80 } },
            h('label', { style: labelStyle }, 'Port'),
            h('input', { style: inputStyle, type: 'number', value: form.smtpPort, onChange: function(e) { set('smtpPort', parseInt(e.target.value) || 587); } })
          )
        ),

        form.preset && form.preset !== 'custom' && form.preset !== '' && h('div', { style: { padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 } },
          'Server: ', h('strong', null, form.imapHost), ':', form.imapPort, ' (IMAP) / ', h('strong', null, form.smtpHost), ':', form.smtpPort, ' (SMTP)',
          ' — ', h('a', { href: '#', onClick: function(e) { e.preventDefault(); set('preset', 'custom'); }, style: { color: 'var(--accent)' } }, 'Edit manually')
        ),

        h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', marginBottom: 16 } },
          h('strong', null, 'How to set up:'), h('br'),
          '1. Create an email account for this agent in your email system (e.g., Microsoft 365 Admin Center or Google Admin Console)', h('br'),
          '2. Create an app password for that account (regular passwords may not work with 2FA enabled)', h('br'),
          '3. Enter the email and app password above, select your provider, and hit Save', h('br'),
          '4. Click "Test Connection" to verify everything works'
        )
      ),

      // ─── Microsoft OAuth Config ─────────────────────
      form.provider === 'microsoft' && h(Fragment, null,
        h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', marginBottom: 16 } },
          h('strong', null, 'Setup Instructions:'), h('br'),
          '1. Go to ', h('a', { href: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', target: '_blank', style: { color: 'var(--accent)' } }, 'Azure Portal → App Registrations'), h('br'),
          '2. Click "New Registration" → name it (e.g., "AgenticMail Agent") → set redirect URI to: ', h('code', { style: { background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 } }, window.location.origin + '/api/engine/oauth/callback'), h('br'),
          '3. Under "Certificates & Secrets" → create a Client Secret', h('br'),
          '4. Under "API Permissions" → add Microsoft Graph: Mail.ReadWrite, Mail.Send, offline_access', h('br'),
          '5. Copy the Application (client) ID and Client Secret below'
        ),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'Application (Client) ID *'),
            h('input', { style: inputStyle, value: form.oauthClientId, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', onChange: function(e) { set('oauthClientId', e.target.value); } })
          ),
          h('div', null,
            h('label', { style: labelStyle }, 'Client Secret *'),
            h('input', { style: inputStyle, type: 'password', value: form.oauthClientSecret, placeholder: 'Enter client secret', onChange: function(e) { set('oauthClientSecret', e.target.value); } })
          )
        ),
        h('div', { style: { marginBottom: 16 } },
          h('label', { style: labelStyle }, 'Tenant ID'),
          h('input', { style: Object.assign({}, inputStyle, { maxWidth: 400 }), value: form.oauthTenantId, placeholder: 'common (or your tenant ID)', onChange: function(e) { set('oauthTenantId', e.target.value); } }),
          h('p', { style: helpStyle }, 'Use "common" for multi-tenant, or your org\'s tenant ID for single-tenant apps')
        ),

        emailConfig && emailConfig.status === 'awaiting_oauth' && h('div', { style: { padding: '12px 16px', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 13 } }, 'Authorization Required'),
          h('p', { style: { fontSize: 12, margin: '0 0 8px', color: 'var(--text-secondary)' } }, 'Click the button below to sign in with the agent\'s Microsoft account and grant email permissions.'),
          h('button', { className: 'btn btn-primary btn-sm', onClick: openOAuth }, 'Authorize with Microsoft')
        )
      ),

      // ─── Google OAuth Config ────────────────────────
      form.provider === 'google' && (function() {
        var hasOrg = emailConfig && emailConfig.orgEmailConfig && emailConfig.orgEmailConfig.provider === 'google';
        return h(Fragment, null,
        hasOrg
          ? h('div', { style: { padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 'var(--radius)', fontSize: 12, marginBottom: 16 } },
              h('strong', null, '\u2705 Using organization Google Workspace credentials'), h('br'),
              'Client ID: ', h('code', { style: { fontSize: 11 } }, emailConfig.orgEmailConfig.oauthClientId), h('br'),
              h('span', { style: { color: 'var(--text-muted)' } }, 'Just click "Save Configuration" then authorize with the agent\'s Google account.')
            )
          : h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', marginBottom: 16 } },
              h('strong', null, 'Setup Instructions:'), h('br'),
              '1. Go to ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', style: { color: 'var(--accent)' } }, 'Google Cloud Console \u2192 Credentials'), h('br'),
              '2. Create an OAuth 2.0 Client ID (Web application) \u2192 add redirect URI: ', h('code', { style: { background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 } }, window.location.origin + '/api/engine/oauth/callback'), h('br'),
              '3. Enable the Gmail API in your project', h('br'),
              '4. Copy the Client ID and Client Secret below'
            ),

        !hasOrg && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'OAuth Client ID *'),
            h('input', { style: inputStyle, value: form.oauthClientId, placeholder: 'xxxx.apps.googleusercontent.com', onChange: function(e) { set('oauthClientId', e.target.value); } })
          ),
          h('div', null,
            h('label', { style: labelStyle }, 'Client Secret *'),
            h('input', { style: inputStyle, type: 'password', value: form.oauthClientSecret, placeholder: 'Enter client secret', onChange: function(e) { set('oauthClientSecret', e.target.value); } })
          )
        ),

        emailConfig && emailConfig.status === 'awaiting_oauth' && h('div', { style: { padding: '12px 16px', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 13 } }, 'Authorization Required'),
          h('p', { style: { fontSize: 12, margin: '0 0 8px', color: 'var(--text-secondary)' } }, 'Click the button below to sign in with the agent\'s Google account and grant Gmail permissions.'),
          h('button', { className: 'btn btn-primary btn-sm', onClick: openOAuth }, 'Authorize with Google')
        )
      ); })(),

      // ─── Test Result ─────────────────────────────────
      testResult && h('div', { style: { padding: '12px 16px', borderRadius: 'var(--radius)', marginBottom: 16, background: testResult.success ? 'var(--success-soft)' : 'var(--danger-soft)' } },
        testResult.success
          ? h(Fragment, null,
              h('div', { style: { fontWeight: 600, color: 'var(--success)', marginBottom: 4, fontSize: 13 } }, 'Connection Successful'),
              testResult.inbox && h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Inbox: ', testResult.inbox.total, ' messages (', testResult.inbox.unread, ' unread)'),
              testResult.email && h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Email: ', testResult.email)
            )
          : h(Fragment, null,
              h('div', { style: { fontWeight: 600, color: 'var(--danger)', marginBottom: 4, fontSize: 13 } }, 'Connection Failed'),
              h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, testResult.error || 'Unknown error')
            )
      ),

      // ─── Error display ────────────────────────────────
      emailConfig && emailConfig.lastError && h('div', { style: { padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--danger)', marginBottom: 16 } },
        h('strong', null, 'Last Error: '), emailConfig.lastError
      ),

      // ─── Actions ──────────────────────────────────────
      h('div', { style: { display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, flexWrap: 'wrap' } },
        h('button', { className: 'btn btn-primary', disabled: saving, onClick: handleSave }, saving ? 'Saving...' : 'Save Configuration'),
        emailConfig && emailConfig.configured && h('button', { className: 'btn btn-secondary', disabled: testing, onClick: handleTest }, testing ? 'Testing...' : 'Test Connection'),
        emailConfig && emailConfig.status === 'connected' && emailConfig.oauthProvider === 'google' && h('button', {
          className: 'btn btn-secondary',
          onClick: function() {
            engineCall('/bridge/agents/' + agentId + '/email-config/reauthorize', { method: 'POST', body: JSON.stringify({}) })
              .then(function(r) {
                if (r.oauthAuthUrl) {
                  toast('Opening Google re-authorization with ' + r.scopeCount + ' scopes...', 'info');
                  window.open(r.oauthAuthUrl, '_blank', 'width=600,height=700');
                } else {
                  toast('Failed: ' + (r.error || 'Unknown'), 'error');
                }
              })
              .catch(function(e) { toast('Error: ' + e.message, 'error'); });
          }
        }, 'Re-authorize (Update Scopes)'),
        emailConfig && emailConfig.configured && h('button', { className: 'btn btn-danger btn-ghost', onClick: function() { if (confirm('Disconnect email? The agent will no longer be able to send/receive.')) handleDisconnect(); } }, 'Disconnect')
      )
    )
  );
}

var _tsSectionTitle = { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 8 };

function TSToggle(props) {
  var checked = props.checked;
  var onChange = props.onChange;
  var label = props.label;
  var inherited = props.inherited;
  return h('div', { style: _tsToggleRow },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('span', { style: { fontSize: 13, fontWeight: 500 } }, label),
      inherited && h('span', { style: { fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontWeight: 600 } }, 'ORG DEFAULT')
    ),
    h('label', { style: { position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: checked, onChange: function(e) { onChange(e.target.checked); }, style: { opacity: 0, width: 0, height: 0 } }),
      h('span', { style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: checked ? 'var(--brand-color, #6366f1)' : 'var(--bg-tertiary, #374151)',
        borderRadius: 11, transition: 'background 0.2s'
      } },
        h('span', { style: {
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18,
          background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        } })
      )
    )
  );
}

function TSRateLimitEditor(props) {
  var overrides = props.overrides || {};
  var onChange = props.onChange;
  var DEFAULT_LIMITS = { bash: { max: 10, rate: 10 }, browser: { max: 20, rate: 20 }, web_fetch: { max: 30, rate: 30 }, web_search: { max: 30, rate: 30 }, read: { max: 60, rate: 60 }, write: { max: 60, rate: 60 }, edit: { max: 60, rate: 60 }, glob: { max: 60, rate: 60 }, grep: { max: 60, rate: 60 }, memory: { max: 60, rate: 60 } };
  var tools = Object.keys(DEFAULT_LIMITS);

  var setOverride = function(tool, field, value) {
    var current = overrides[tool] || { maxTokens: DEFAULT_LIMITS[tool].max, refillRate: DEFAULT_LIMITS[tool].rate };
    var next = Object.assign({}, overrides);
    next[tool] = Object.assign({}, current);
    next[tool][field] = parseInt(value) || 0;
    onChange(next);
  };

  return h('div', { style: { fontSize: 12 } },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 4, marginBottom: 4 } },
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)' } }, 'Tool'),
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' } }, 'Max/min'),
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' } }, 'Refill/min')
    ),
    tools.map(function(tool) {
      var def = DEFAULT_LIMITS[tool];
      var ov = overrides[tool];
      return h('div', { key: tool, style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 4, marginBottom: 2 } },
        h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 0' } }, tool),
        h('input', { className: 'input', type: 'number', min: 1, max: 1000, style: { fontSize: 11, padding: '2px 6px', textAlign: 'center' }, value: ov ? ov.maxTokens : def.max, onChange: function(e) { setOverride(tool, 'maxTokens', e.target.value); } }),
        h('input', { className: 'input', type: 'number', min: 1, max: 1000, style: { fontSize: 11, padding: '2px 6px', textAlign: 'center' }, value: ov ? ov.refillRate : def.rate, onChange: function(e) { setOverride(tool, 'refillRate', e.target.value); } })
      );
    })
  );
}

function ToolSecuritySection(props) {
  var agentId = props.agentId;

  var app = useApp();
  var toast = app.toast;

  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _orgDefaults = useState({});
  var orgDefaults = _orgDefaults[0]; var setOrgDefaults = _orgDefaults[1];
  var _agentOverrides = useState({});
  var agentOverrides = _agentOverrides[0]; var setAgentOverrides = _agentOverrides[1];
  var _merged = useState({});
  var merged = _merged[0]; var setMerged = _merged[1];
  var _dirty = useState(false);
  var dirty = _dirty[0]; var setDirty = _dirty[1];

  var load = function() {
    setLoading(true);
    engineCall('/agents/' + agentId + '/tool-security')
      .then(function(d) {
        setOrgDefaults(d.orgDefaults || {});
        setAgentOverrides(d.agentOverrides || {});
        setMerged(d.toolSecurity || {});
        setDirty(false);
      })
      .catch(function(err) { toast('Failed to load tool security: ' + err.message, 'error'); })
      .finally(function() { setLoading(false); });
  };

  useEffect(function() { load(); }, [agentId]);

  // Track whether a field is overridden at agent level
  var isOverridden = function(section, field) {
    var ao = agentOverrides || {};
    if (section === 'security' || section === 'middleware') {
      return ao[section] !== undefined && ao[section] !== null;
    }
    var sec = ao.security || {};
    var mw = ao.middleware || {};
    var container = (section === 'pathSandbox' || section === 'ssrf' || section === 'commandSanitizer') ? sec : mw;
    if (!container[section]) return false;
    if (field) return container[section][field] !== undefined;
    return true;
  };

  // Update the local overrides (working copy derived from merged)
  var localConfig = dirty ? merged : merged;
  var sec = (localConfig.security || {});
  var mw = (localConfig.middleware || {});

  var updateMerged = function(next) {
    setMerged(next);
    setDirty(true);
  };

  var setSec = function(key, value) {
    var next = Object.assign({}, sec);
    next[key] = value;
    updateMerged({ security: next, middleware: mw });
  };

  var setMw = function(key, value) {
    var next = Object.assign({}, mw);
    next[key] = value;
    updateMerged({ security: sec, middleware: next });
  };

  var patchSec = function(section, field, value) {
    var current = sec[section] || {};
    var next = Object.assign({}, current);
    next[field] = value;
    setSec(section, next);
  };

  var patchMw = function(section, field, value) {
    var current = mw[section] || {};
    var next = Object.assign({}, current);
    next[field] = value;
    setMw(section, next);
  };

  // Compute the diff between merged and orgDefaults to get the overrides to save
  var computeOverrides = function() {
    var overrides = {};
    var orgSec = orgDefaults.security || {};
    var orgMw = orgDefaults.middleware || {};

    // Check each security section
    ['pathSandbox', 'ssrf', 'commandSanitizer'].forEach(function(key) {
      var orgVal = orgSec[key] || {};
      var curVal = sec[key] || {};
      if (JSON.stringify(orgVal) !== JSON.stringify(curVal)) {
        if (!overrides.security) overrides.security = {};
        overrides.security[key] = curVal;
      }
    });

    // Check each middleware section
    ['audit', 'rateLimit', 'circuitBreaker', 'telemetry'].forEach(function(key) {
      var orgVal = orgMw[key] || {};
      var curVal = mw[key] || {};
      if (JSON.stringify(orgVal) !== JSON.stringify(curVal)) {
        if (!overrides.middleware) overrides.middleware = {};
        overrides.middleware[key] = curVal;
      }
    });

    return overrides;
  };

  var save = function() {
    setSaving(true);
    var overrides = computeOverrides();
    engineCall('/agents/' + agentId + '/tool-security', {
      method: 'PATCH',
      body: JSON.stringify({ toolSecurity: overrides, updatedBy: 'dashboard' })
    })
      .then(function() {
        toast('Tool security saved', 'success');
        setAgentOverrides(overrides);
        setDirty(false);
      })
      .catch(function(err) { toast('Save failed: ' + err.message, 'error'); })
      .finally(function() { setSaving(false); });
  };

  var resetAll = function() {
    showConfirm('Reset to Org Defaults', 'This will remove all agent-level tool security overrides and revert to the organization defaults. Continue?', function() {
      setSaving(true);
      engineCall('/agents/' + agentId + '/tool-security', {
        method: 'PATCH',
        body: JSON.stringify({ toolSecurity: {}, updatedBy: 'dashboard' })
      })
        .then(function() {
          toast('Reset to org defaults', 'success');
          load();
        })
        .catch(function(err) { toast('Reset failed: ' + err.message, 'error'); })
        .finally(function() { setSaving(false); });
    });
  };

  if (loading) {
    return h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading tool security config...');
  }

  var ps = sec.pathSandbox || {};
  var ssrf = sec.ssrf || {};
  var cs = sec.commandSanitizer || {};
  var audit = mw.audit || {};
  var rl = mw.rateLimit || {};
  var cb = mw.circuitBreaker || {};
  var tel = mw.telemetry || {};

  var hasOverrides = Object.keys(agentOverrides).length > 0 || dirty;

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h3', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, 'Tool Security'),
        h('p', { style: { margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' } },
          'Configure tool security overrides for this agent. Unmodified settings inherit from ',
          h('strong', null, 'org defaults'),
          '.'
        )
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        hasOverrides && h('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: resetAll,
          disabled: saving
        }, 'Reset to Org Defaults'),
        h('button', {
          className: 'btn btn-primary',
          disabled: saving || !dirty,
          onClick: save
        }, saving ? 'Saving...' : 'Save Overrides')
      )
    ),

    // Overrides indicator
    !dirty && Object.keys(agentOverrides).length > 0 && h('div', {
      style: { padding: '8px 12px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }
    },
      I.info(),
      'This agent has custom overrides for: ',
      h('strong', null,
        [].concat(
          Object.keys(agentOverrides.security || {}),
          Object.keys(agentOverrides.middleware || {})
        ).join(', ') || 'none'
      )
    ),

    // ── SECURITY SECTION ──
    h('div', { style: _tsSectionTitle }, 'Security Sandboxes'),
    h('div', { style: _tsGrid },

      // Path Sandbox
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.folder(), ' Path Sandbox'),
        h('div', { style: _tsCardDesc }, 'Controls which directories this agent can read/write.'),
        h(TSToggle, { label: 'Enable path sandboxing', checked: ps.enabled !== false, inherited: !isOverridden('pathSandbox', 'enabled'), onChange: function(v) { patchSec('pathSandbox', 'enabled', v); } }),
        h(TagInput, { label: 'Allowed Directories', value: ps.allowedDirs || [], onChange: function(v) { patchSec('pathSandbox', 'allowedDirs', v); }, placeholder: '/path/to/allow', mono: true }),
        h(TagInput, { label: 'Blocked Patterns (regex)', value: ps.blockedPatterns || [], onChange: function(v) { patchSec('pathSandbox', 'blockedPatterns', v); }, placeholder: '\\.env$', mono: true })
      ),

      // SSRF Guard
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.globe(), ' SSRF Protection'),
        h('div', { style: _tsCardDesc }, 'Blocks this agent from accessing internal networks and metadata endpoints.'),
        h(TSToggle, { label: 'Enable SSRF protection', checked: ssrf.enabled !== false, inherited: !isOverridden('ssrf', 'enabled'), onChange: function(v) { patchSec('ssrf', 'enabled', v); } }),
        h(TagInput, { label: 'Allowed Hosts', value: ssrf.allowedHosts || [], onChange: function(v) { patchSec('ssrf', 'allowedHosts', v); }, placeholder: 'api.example.com', mono: true }),
        h(TagInput, { label: 'Blocked CIDRs', value: ssrf.blockedCidrs || [], onChange: function(v) { patchSec('ssrf', 'blockedCidrs', v); }, placeholder: '10.0.0.0/8', mono: true })
      )
    ),

    // Command Sanitizer (full width)
    h('div', { style: _tsCardStyle },
      h('div', { style: _tsCardTitle }, I.terminal(), ' Command Sanitizer'),
      h('div', { style: _tsCardDesc }, 'Controls which shell commands this agent can execute.'),
      h(TSToggle, { label: 'Enable command validation', checked: cs.enabled !== false, inherited: !isOverridden('commandSanitizer', 'enabled'), onChange: function(v) { patchSec('commandSanitizer', 'enabled', v); } }),
      h('div', { style: { marginBottom: 12 } },
        h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Mode'),
        h('select', { className: 'input', style: { width: 200 }, value: cs.mode || 'blocklist', onChange: function(e) { patchSec('commandSanitizer', 'mode', e.target.value); } },
          h('option', { value: 'blocklist' }, 'Blocklist (block specific patterns)'),
          h('option', { value: 'allowlist' }, 'Allowlist (only allow specific commands)')
        )
      ),
      h('div', { style: _tsGrid },
        h(TagInput, { label: 'Allowed Commands', value: cs.allowedCommands || [], onChange: function(v) { patchSec('commandSanitizer', 'allowedCommands', v); }, placeholder: 'git, npm, node', mono: true }),
        h(TagInput, { label: 'Blocked Patterns', value: cs.blockedPatterns || [], onChange: function(v) { patchSec('commandSanitizer', 'blockedPatterns', v); }, placeholder: 'curl.*\\|.*sh', mono: true })
      )
    ),

    // ── MIDDLEWARE SECTION ──
    h('div', { style: _tsSectionTitle }, 'Middleware & Observability'),
    h('div', { style: _tsGrid },

      // Audit Logging
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.journal(), ' Audit Logging'),
        h('div', { style: _tsCardDesc }, 'Logs every tool invocation for this agent.'),
        h(TSToggle, { label: 'Enable audit logging', checked: audit.enabled !== false, inherited: !isOverridden('audit', 'enabled'), onChange: function(v) { patchMw('audit', 'enabled', v); } }),
        h(TagInput, { label: 'Keys to Redact', value: audit.redactKeys || [], onChange: function(v) { patchMw('audit', 'redactKeys', v); }, placeholder: 'custom_secret', mono: true })
      ),

      // Rate Limiting
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.clock(), ' Rate Limiting'),
        h('div', { style: _tsCardDesc }, 'Per-tool rate limits for this agent.'),
        h(TSToggle, { label: 'Enable rate limiting', checked: rl.enabled !== false, inherited: !isOverridden('rateLimit', 'enabled'), onChange: function(v) { patchMw('rateLimit', 'enabled', v); } }),
        h(TSRateLimitEditor, { overrides: rl.overrides || {}, onChange: function(v) { patchMw('rateLimit', 'overrides', v); } })
      ),

      // Circuit Breaker
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.pause(), ' Circuit Breaker'),
        h('div', { style: _tsCardDesc }, 'Auto-stops calling failing tools after consecutive failures.'),
        h(TSToggle, { label: 'Enable circuit breaker', checked: cb.enabled !== false, inherited: !isOverridden('circuitBreaker', 'enabled'), onChange: function(v) { patchMw('circuitBreaker', 'enabled', v); } })
      ),

      // Telemetry
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.chart(), ' Telemetry'),
        h('div', { style: _tsCardDesc }, 'Collects execution timing and metrics for this agent\'s tools.'),
        h(TSToggle, { label: 'Enable telemetry', checked: tel.enabled !== false, inherited: !isOverridden('telemetry', 'enabled'), onChange: function(v) { patchMw('telemetry', 'enabled', v); } })
      )
    ),

    // Sticky save bar
    dirty && h('div', { style: { position: 'sticky', bottom: 0, padding: '12px 0', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
      h('button', { className: 'btn btn-secondary', onClick: function() { load(); } }, 'Discard Changes'),
      h('button', { className: 'btn btn-primary', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Tool Security Overrides')
    )
  );
}

// ════════════════════════════════════════════════════════════
// AGENT DETAIL PAGE  (Main Orchestrator)
// ════════════════════════════════════════════════════════════

// ─── Autonomy Settings Section ──────────────────────────

function AutonomySection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var app = useApp();
  var toast = app.toast;

  var defaults = {
    enabled: true,
    clockEnabled: true,
    dailyCatchupEnabled: true, dailyCatchupHour: 9, dailyCatchupMinute: 0,
    weeklyCatchupEnabled: true, weeklyCatchupDay: 1, weeklyCatchupHour: 9, weeklyCatchupMinute: 0,
    goalCheckEnabled: true, goalCheckHours: [14, 17],
    knowledgeContribEnabled: true, knowledgeContribDay: 5, knowledgeContribHour: 15,
    escalationEnabled: true, guardrailEnforcementEnabled: true, driveAccessRequestEnabled: true,
  };

  var existing = (engineAgent?.config?.autonomy) || {};
  var _form = useState(Object.assign({}, defaults, existing));
  var form = _form[0]; var setForm = _form[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _dirty = useState(false);
  var dirty = _dirty[0]; var setDirty = _dirty[1];

  var set = function(key, val) {
    var u = Object.assign({}, form);
    u[key] = val;
    setForm(u);
    setDirty(true);
  };

  var save = function() {
    setSaving(true);
    var ea = engineAgent || {};
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, {
      method: method,
      body: JSON.stringify({ updates: { autonomy: form }, updatedBy: 'dashboard' })
    }).then(function() {
      toast('Autonomy settings saved' + (isRunning ? ' (agent will reload within 10 min)' : ''), 'success');
      setDirty(false);
      setSaving(false);
      if (reload) reload();
    }).catch(function(err) {
      toast(err.message, 'error');
      setSaving(false);
    });
  };

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var toggleStyle = function(on) {
    return {
      width: 40, height: 22, borderRadius: 11,
      background: on ? 'var(--success)' : 'var(--border)',
      cursor: 'pointer', position: 'relative', flexShrink: 0,
      transition: 'background 0.2s', display: 'inline-block',
    };
  };
  var knobStyle = function(on) {
    return {
      width: 18, height: 18, borderRadius: '50%', background: '#fff',
      position: 'absolute', top: 2, left: on ? 20 : 2,
      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    };
  };

  var Toggle = function(p) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      h('div', { style: toggleStyle(p.value), onClick: function() { set(p.field, !p.value); } },
        h('div', { style: knobStyle(p.value) })
      ),
      h('span', { style: { fontSize: 13, fontWeight: 500 } }, p.label),
      p.desc && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, p.desc)
    );
  };

  var TimeSelect = function(p) {
    return h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
      h('select', { className: 'input', style: { width: 80 }, value: p.hour, onChange: function(e) { set(p.hourField, parseInt(e.target.value)); } },
        Array.from({length: 24}, function(_, i) {
          var label = i === 0 ? '12 AM' : i < 12 ? i + ' AM' : i === 12 ? '12 PM' : (i - 12) + ' PM';
          return h('option', { key: i, value: i }, label);
        })
      ),
      h('span', null, ':'),
      h('select', { className: 'input', style: { width: 65 }, value: p.minute, onChange: function(e) { set(p.minuteField, parseInt(e.target.value)); } },
        [0, 15, 30, 45].map(function(m) { return h('option', { key: m, value: m }, String(m).padStart(2, '0')); })
      )
    );
  };

  var DaySelect = function(p) {
    return h('select', { className: 'input', style: { width: 130 }, value: p.value, onChange: function(e) { set(p.field, parseInt(e.target.value)); } },
      DAYS.map(function(d, i) { return h('option', { key: i, value: i }, d); })
    );
  };

  var cardStyle = { marginBottom: 12 };
  var rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' };
  var configRow = { display: 'flex', gap: 12, alignItems: 'center', padding: '8px 16px 8px 48px', borderBottom: '1px solid var(--border)', fontSize: 13 };

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
      h('div', null,
        h('div', { style: { fontSize: 15, fontWeight: 600 } }, 'Agent Autonomy Settings'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Configure automated behaviors — all times use agent timezone')
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        dirty && h('span', { style: { fontSize: 11, color: 'var(--warning)', alignSelf: 'center' } }, 'Unsaved changes'),
        h('button', { className: 'btn btn-primary btn-sm', disabled: !dirty || saving, onClick: save }, saving ? 'Saving...' : 'Save')
      )
    ),

    // Master switch
    h('div', { className: 'card', style: cardStyle },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'enabled', value: form.enabled, label: 'Enable Autonomy System', desc: 'Master switch for all automated agent behaviors' })
      )
    ),

    // Clock In/Out
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'clockEnabled', value: form.clockEnabled, label: 'Auto Clock-In/Out', desc: 'Clock in/out based on work schedule' })
      ),
      form.clockEnabled && h('div', { style: configRow },
        h('span', { style: { color: 'var(--text-muted)' } }, 'Uses times from the Workforce tab schedule')
      )
    ),

    // Daily Catchup
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'dailyCatchupEnabled', value: form.dailyCatchupEnabled, label: 'Daily Manager Catchup', desc: 'Email summary to manager each workday' })
      ),
      form.dailyCatchupEnabled && h('div', { style: configRow },
        h('span', { style: { color: 'var(--text-muted)', fontSize: 12 } }, 'Time configured in Manager & Catch-Up tab')
      )
    ),

    // Weekly Catchup
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'weeklyCatchupEnabled', value: form.weeklyCatchupEnabled, label: 'Weekly Manager Catchup', desc: 'Broader weekly summary + goals, uses same time as daily' })
      ),
      form.weeklyCatchupEnabled && h('div', { style: configRow },
        h('span', null, 'Send on'),
        h(DaySelect, { value: form.weeklyCatchupDay, field: 'weeklyCatchupDay' }),
        h('span', { style: { color: 'var(--text-muted)', fontSize: 12 } }, '(same time as daily catchup)')
      )
    ),

    // Goal Check
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'goalCheckEnabled', value: form.goalCheckEnabled, label: 'Goal Progress Checks', desc: 'Reviews Google Tasks at set hours (last = end-of-day review)' })
      ),
      form.goalCheckEnabled && h('div', { style: configRow },
        h('span', null, 'Check at hours:'),
        h('input', { className: 'input', style: { width: 150 },
          value: (form.goalCheckHours || [14, 17]).join(', '),
          placeholder: '14, 17',
          onChange: function(e) {
            var hrs = e.target.value.split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n) && n >= 0 && n <= 23; });
            set('goalCheckHours', hrs.length > 0 ? hrs : [14, 17]);
          }
        }),
        h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, '(24h format, comma-separated)')
      )
    ),

    // Knowledge Contribution
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'knowledgeContribEnabled', value: form.knowledgeContribEnabled, label: 'Weekly Knowledge Contribution', desc: 'Agent reviews learnings and contributes to role-based knowledge base' })
      ),
      form.knowledgeContribEnabled && h('div', { style: configRow },
        h('span', null, 'Contribute on'),
        h(DaySelect, { value: form.knowledgeContribDay, field: 'knowledgeContribDay' }),
        h('span', null, 'at'),
        h('select', { className: 'input', style: { width: 80 }, value: form.knowledgeContribHour, onChange: function(e) { set('knowledgeContribHour', parseInt(e.target.value)); } },
          Array.from({length: 24}, function(_, i) {
            var label = i === 0 ? '12 AM' : i < 12 ? i + ' AM' : i === 12 ? '12 PM' : (i - 12) + ' PM';
            return h('option', { key: i, value: i }, label);
          })
        )
      )
    ),

    // Smart Escalation
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'escalationEnabled', value: form.escalationEnabled, label: 'Smart Answer Escalation', desc: 'Search memory → Drive → escalate to manager when unsure' })
      )
    ),

    // Guardrail Enforcement
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'guardrailEnforcementEnabled', value: form.guardrailEnforcementEnabled, label: 'Runtime Guardrail Enforcement', desc: 'Evaluate guardrail rules on inbound emails and tool calls' })
      )
    ),

    // Drive Access Requests
    h('div', { className: 'card', style: Object.assign({}, cardStyle, { opacity: form.enabled ? 1 : 0.5 }) },
      h('div', { style: rowStyle },
        h(Toggle, { field: 'driveAccessRequestEnabled', value: form.driveAccessRequestEnabled, label: 'Drive Access Requests', desc: 'When agent cannot access a file, it requests access from manager instead of failing silently' })
      )
    )
  );
}

function AgentDetailPage(props) {
  var agentId = props.agentId;
  var onBack = props.onBack;

  var app = useApp();
  var toast = app.toast;

  var _tab = useState('overview');
  var tab = _tab[0]; var setTab = _tab[1];
  var _agent = useState(null);
  var agent = _agent[0]; var setAgent = _agent[1];
  var _engineAgent = useState(null);
  var engineAgent = _engineAgent[0]; var setEngineAgent = _engineAgent[1];
  var _profile = useState(null);
  var profile = _profile[0]; var setProfile = _profile[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _agents = useState([]);
  var agents = _agents[0]; var setAgents = _agents[1];

  var TABS = ['overview', 'personal', 'email', 'configuration', 'manager', 'tools', 'skills', 'permissions', 'activity', 'communication', 'workforce', 'memory', 'guardrails', 'autonomy', 'budget', 'tool-security', 'deployment'];
  var TAB_LABELS = { 'tool-security': 'Tool Security', 'manager': 'Manager & Catch-Up', 'email': 'Email', 'tools': 'Tools', 'autonomy': 'Autonomy' };

  var load = function() {
    setLoading(true);
    Promise.all([
      engineCall('/bridge/agents/' + agentId + '/full').catch(function() { return null; }),
      apiCall('/agents/' + agentId).catch(function() { return null; }),
      engineCall('/agents?orgId=' + getOrgId()).catch(function() { return { agents: [] }; })
    ]).then(function(results) {
      var fullData = results[0];
      var adminData = results[1];
      var allAgents = results[2]?.agents || results[2] || [];

      if (fullData) {
        setEngineAgent(fullData.agent || fullData);
        setProfile(fullData.permissions || null);
      }
      if (adminData) {
        setAgent(adminData);
      }
      setAgents(allAgents);
      setLoading(false);
    });
  };

  useEffect(function() { load(); }, [agentId]);

  // ─── Derived Values ─────────────────────────────────────

  var ea = engineAgent || {};
  var a = agent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  var state = ea.state || ea.status || a.status || 'unknown';
  var stateColor = { running: 'success', active: 'success', deploying: 'info', starting: 'info', provisioning: 'info', degraded: 'warning', error: 'danger', stopped: 'neutral', draft: 'neutral', ready: 'primary' }[state] || 'neutral';
  var displayName = identity.name || config.name || config.displayName || a.name || 'Unnamed Agent';
  var displayEmail = identity.email || config.email || a.email || '';
  var avatarUrl = identity.avatar && identity.avatar.length > 2 ? identity.avatar : null;
  var avatarInitial = (displayName || '?').charAt(0).toUpperCase();
  var role = identity.role || config.role || a.role || 'agent';
  var isPaused = ea.paused || false;

  // ─── Header Actions ─────────────────────────────────────

  var doAction = function(action) {
    engineCall('/agents/' + agentId + '/' + action, { method: 'POST', body: JSON.stringify({ by: 'dashboard' }) })
      .then(function() { toast(action.charAt(0).toUpperCase() + action.slice(1) + ' initiated', 'success'); setTimeout(load, 1000); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var doPause = function() {
    engineCall('/guardrails/pause/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual pause from dashboard' }) })
      .then(function() { toast('Agent paused', 'success'); load(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var doResume = function() {
    engineCall('/guardrails/resume/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual resume from dashboard' }) })
      .then(function() { toast('Agent resumed', 'success'); load(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  if (loading && !agent && !engineAgent) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading agent...');
  }

  return h(Fragment, null,

    // ─── Header Bar ─────────────────────────────────────
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 } },

      // Back Button
      h('button', { className: 'btn btn-ghost btn-sm', onClick: onBack, title: 'Back to agents', style: { flexShrink: 0 } },
        h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, h('polyline', { points: '15 18 9 12 15 6' })),
        ' Agents'
      ),

      // Avatar
      h('div', { style: {
        width: 44, height: 44, borderRadius: '50%', background: avatarUrl ? 'none' : 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: avatarUrl ? 22 : 18, fontWeight: 700, color: '#fff', flexShrink: 0,
        overflow: 'hidden'
      } },
        avatarUrl
          ? h('img', { src: avatarUrl, style: { width: '100%', height: '100%', objectFit: 'cover' } })
          : avatarInitial
      ),

      // Name + Info
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('h1', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, displayName),
          h('span', { className: 'badge badge-' + stateColor, style: { textTransform: 'capitalize' } }, state)
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 } },
          displayEmail && h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-muted)' } }, displayEmail),
          h('span', { className: 'badge badge-neutral', style: { textTransform: 'capitalize' } }, role)
        )
      ),

      // Action Buttons
      h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
        (state !== 'running' && state !== 'active' && state !== 'deploying') && h('button', { className: 'btn btn-primary btn-sm', onClick: function() { doAction('deploy'); } }, I.play(), ' Deploy'),
        (state === 'running' || state === 'active' || state === 'degraded' || state === 'stopped') && h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { doAction('restart'); } }, I.refresh(), ' Restart'),
        (state === 'running' || state === 'active' || state === 'degraded') && h('button', { className: 'btn btn-danger btn-sm', onClick: function() { doAction('stop'); } }, I.stop(), ' Stop'),
        !isPaused && (state === 'running' || state === 'active') && h('button', { className: 'btn btn-secondary btn-sm', onClick: doPause }, I.pause(), ' Pause'),
        isPaused && h('button', { className: 'btn btn-secondary btn-sm', onClick: doResume }, I.play(), ' Resume')
      )
    ),

    // ─── Tab Bar ────────────────────────────────────────
    h('div', { className: 'tabs', style: { marginBottom: 20 } },
      TABS.map(function(t) {
        return h('div', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: function() { setTab(t); } }, TAB_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1));
      })
    ),

    // ─── Tab Content ────────────────────────────────────
    tab === 'overview' && h(OverviewSection, { agentId: agentId, agent: agent, engineAgent: engineAgent, profile: profile, reload: load, agents: agents, onBack: onBack }),
    tab === 'personal' && h(PersonalDetailsSection, { agentId: agentId, agent: agent, engineAgent: engineAgent, reload: load }),
    tab === 'email' && h(EmailSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'configuration' && h(ConfigurationSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'manager' && h(ManagerCatchUpSection, { agentId: agentId, engineAgent: engineAgent, agents: agents, reload: load }),
    tab === 'tools' && h(ToolsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'skills' && h(SkillsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'permissions' && h(PermissionsSection, { agentId: agentId, profile: profile, reload: load }),
    tab === 'activity' && h(ActivitySection, { agentId: agentId }),
    tab === 'communication' && h(CommunicationSection, { agentId: agentId, agents: agents }),
    tab === 'workforce' && h(WorkforceSection, { agentId: agentId }),
    tab === 'memory' && h(MemorySection, { agentId: agentId }),
    tab === 'guardrails' && h(GuardrailsSection, { agentId: agentId, agents: agents }),
    tab === 'autonomy' && h(AutonomySection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'budget' && h(BudgetSection, { agentId: agentId }),
    tab === 'tool-security' && h(ToolSecuritySection, { agentId: agentId }),
    tab === 'deployment' && h(DeploymentSection, { agentId: agentId, engineAgent: engineAgent, agent: agent, reload: load, onBack: onBack })
  );
}

export { AgentDetailPage };
