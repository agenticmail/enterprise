import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
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
    engineCall('/onboarding/initiate/' + agentId, { method: 'POST', body: JSON.stringify({ orgId: 'default' }) })
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

  // Personality traits — can be object (keyed) or array
  var rawTraits = identity.personality_traits || identity.traits || config.personality_traits || {};
  var traitList = Array.isArray(rawTraits) ? rawTraits : Object.values(rawTraits);

  var tokensToday = usageData?.tokensToday || usageData?.today?.tokens || 0;
  var costToday = usageData?.costToday || usageData?.today?.cost || 0;
  var uptime = usageData?.uptime || usageData?.uptimeSeconds || 0;
  var errorRate = usageData?.errorRate || usageData?.today?.errorRate || 0;
  var activeSessions = usageData?.activeSessions || usageData?.sessions?.active || 0;

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading overview...');
  }

  return h(Fragment, null,

    // ─── Agent Summary Card ─────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 } },
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
              : h('span', { className: 'badge badge-warning' }, 'Not Onboarded')
          ),
          onboardingStatus?.status && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } }, 'Status: ' + onboardingStatus.status),
          !onboardingStatus?.onboarded && h('button', {
            className: 'btn btn-primary btn-sm',
            disabled: acting === 'onboard',
            onClick: initiateOnboarding
          }, acting === 'onboard' ? 'Starting...' : 'Start Onboarding')
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
      engineCall('/policies/agent/' + agentId + '?orgId=default').catch(function() { return { policies: [] }; }),
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

  var tokensToday = usageData?.tokensToday || usageData?.today?.tokens || 0;
  var tokensMonth = usageData?.tokensMonth || usageData?.month?.tokens || usageData?.thisMonth?.tokens || 0;
  var costToday = usageData?.costToday || usageData?.today?.cost || 0;
  var costMonth = usageData?.costMonth || usageData?.month?.cost || usageData?.thisMonth?.cost || 0;
  var sessionsToday = usageData?.sessionsToday || usageData?.today?.sessions || 0;
  var errorsToday = usageData?.errorsToday || usageData?.today?.errors || 0;

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

  var loadEvents = function() {
    engineCall('/activity/events?agentId=' + agentId + '&limit=50')
      .then(function(d) { setEvents(d.events || []); })
      .catch(function() {});
  };
  var loadToolCalls = function() {
    engineCall('/activity/tool-calls?agentId=' + agentId + '&limit=50')
      .then(function(d) { setToolCalls(d.toolCalls || []); })
      .catch(function() {});
  };
  var loadJournal = function() {
    engineCall('/journal?agentId=' + agentId + '&orgId=default&limit=50')
      .then(function(d) { setJournalEntries(d.entries || []); })
      .catch(function() {});
  };

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/activity/events?agentId=' + agentId + '&limit=50').then(function(d) { setEvents(d.events || []); }).catch(function() {}),
      engineCall('/activity/tool-calls?agentId=' + agentId + '&limit=50').then(function(d) { setToolCalls(d.toolCalls || []); }).catch(function() {}),
      engineCall('/journal?agentId=' + agentId + '&orgId=default&limit=50').then(function(d) { setJournalEntries(d.entries || []); }).catch(function() {}),
    ]).then(function() { setLoading(false); }).catch(function() { setLoading(false); });
  };

  useEffect(loadAll, []);

  var rollback = function(id) {
    showConfirm({
      title: 'Rollback Action',
      message: 'Are you sure you want to rollback this journal entry? This will attempt to reverse the original action.',
      warning: true,
      confirmText: 'Rollback'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/journal/' + id + '/rollback', { method: 'POST', body: JSON.stringify({}) })
        .then(function(r) {
          if (r.success) { toast('Action rolled back', 'success'); loadJournal(); }
          else { toast('Rollback failed: ' + (r.error || 'Unknown'), 'error'); }
        })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var refreshCurrent = function() {
    if (activeTab === 'events') loadEvents();
    else if (activeTab === 'tools') loadToolCalls();
    else if (activeTab === 'journal') loadJournal();
  };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Activity'),
      h('button', { className: 'btn btn-ghost btn-sm', onClick: refreshCurrent }, I.refresh(), ' Refresh')
    ),
    h('div', { style: { borderBottom: '1px solid var(--border)' } },
      h('div', { className: 'tabs', style: { padding: '0 16px' } },
        h('div', { className: 'tab' + (activeTab === 'events' ? ' active' : ''), onClick: function() { setActiveTab('events'); } }, 'Events'),
        h('div', { className: 'tab' + (activeTab === 'tools' ? ' active' : ''), onClick: function() { setActiveTab('tools'); } }, 'Tool Calls'),
        h('div', { className: 'tab' + (activeTab === 'journal' ? ' active' : ''), onClick: function() { setActiveTab('journal'); } }, 'Journal')
      )
    ),
    h('div', { className: 'card-body-flush' },

      // Events Tab
      activeTab === 'events' && (
        events.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No events recorded for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Details')
                )
              ),
              h('tbody', null,
                events.map(function(ev, i) {
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
        toolCalls.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No tool calls recorded for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Tool'),
                  h('th', null, 'Duration'),
                  h('th', null, 'Status')
                )
              ),
              h('tbody', null,
                toolCalls.map(function(tc, i) {
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
        journalEntries.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No journal entries for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Tool'),
                  h('th', null, 'Action Type'),
                  h('th', null, 'Reversible'),
                  h('th', null, 'Status'),
                  h('th', null, 'Actions')
                )
              ),
              h('tbody', null,
                journalEntries.map(function(e) {
                  return h('tr', { key: e.id, onClick: function(evt) { if (evt.target.tagName === 'BUTTON' || evt.target.closest('button')) return; setSelectedItem(e); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(e.createdAt).toLocaleString()),
                    h('td', null, e.toolName || e.toolId || '-'),
                    h('td', null, h('span', { className: 'badge-tag' }, e.actionType || '-')),
                    h('td', null, e.reversible ? '\u2705' : '\u274C'),
                    h('td', null,
                      e.reversed
                        ? h('span', { className: 'status-badge status-warning' }, 'Rolled Back')
                        : h('span', { className: 'status-badge status-success' }, 'Active')
                    ),
                    h('td', null,
                      e.reversible && !e.reversed && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { rollback(e.id); } }, I.undo(), ' Rollback')
                    )
                  );
                })
              )
            )
      )
    ),

    // ─── Activity Detail Modal ──────────────────────────────
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
    engineCall('/messages?agentId=' + agentId + '&orgId=default&limit=50')
      .then(function(d) { setMessages(d.messages || []); })
      .catch(function() {});
  };
  var loadInbox = function() {
    engineCall('/messages/inbox/' + agentId + '?orgId=default')
      .then(function(d) { setInbox(d.messages || []); })
      .catch(function() {});
  };
  var loadTopology = function() {
    engineCall('/messages/topology?agentId=' + agentId + '&orgId=default')
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
      orgId: 'default',
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
  var _showCreate = useState(false);
  var showCreateModal = _showCreate[0]; var setShowCreateModal = _showCreate[1];
  var _form = useState({ title: '', content: '', category: 'org_knowledge', importance: 'normal', tags: '' });
  var createForm = _form[0]; var setCreateForm = _form[1];

  var buildQueryParams = function() {
    var params = '?limit=50';
    if (searchQuery) params += '&search=' + encodeURIComponent(searchQuery);
    if (filterCategory) params += '&category=' + filterCategory;
    if (filterImportance) params += '&importance=' + filterImportance;
    return params;
  };

  var loadMemories = function() {
    var params = buildQueryParams();
    engineCall('/memory/agent/' + agentId + params)
      .then(function(d) { setMemories(d.memories || []); })
      .catch(function() {});
  };

  var loadStats = function() {
    engineCall('/memory/agent/' + agentId + '/stats')
      .then(function(d) { setMemoryStats(d); })
      .catch(function() {});
  };

  var loadAll = function() {
    loadMemories();
    loadStats();
  };

  useEffect(loadAll, []);
  useEffect(function() { loadMemories(); }, [filterCategory, filterImportance]);

  var handleSearch = function() {
    loadMemories();
  };

  var createMemory = function() {
    if (!createForm.title || !createForm.content) { toast('Title and content are required', 'error'); return; }
    var tagsArray = createForm.tags ? createForm.tags.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    var body = {
      agentId: agentId,
      orgId: 'default',
      title: createForm.title,
      content: createForm.content,
      category: createForm.category,
      importance: createForm.importance,
      source: 'admin',
      tags: tagsArray
    };
    engineCall('/memory', { method: 'POST', body: JSON.stringify(body) })
      .then(function() {
        toast('Memory created', 'success');
        setShowCreateModal(false);
        setCreateForm({ title: '', content: '', category: 'org_knowledge', importance: 'normal', tags: '' });
        loadAll();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var deleteMemory = function(id) {
    showConfirm({
      title: 'Delete Memory',
      message: 'Are you sure you want to delete this memory entry? This action cannot be undone.',
      danger: true,
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
      message: 'This will remove expired and stale memory entries for this agent. This action cannot be undone.',
      warning: true,
      confirmText: 'Prune'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/agent/' + agentId + '/prune', { method: 'POST' })
        .then(function(d) { toast('Pruned ' + (d.pruned || 0) + ' entries', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var runDecay = function() {
    showConfirm({
      title: 'Run Confidence Decay',
      message: 'This will reduce the confidence score of memories that have not been accessed recently. Decay rate: 10%.',
      warning: true,
      confirmText: 'Run Decay'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/agent/' + agentId + '/decay', { method: 'POST', body: JSON.stringify({ decayRate: 0.1 }) })
        .then(function(d) { toast('Decayed ' + (d.affected || 0) + ' entries', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  // Derive stats values
  var totalMemories = memoryStats ? (memoryStats.totalEntries || memoryStats.total || 0) : 0;
  var categoriesUsed = memoryStats && memoryStats.byCategory ? Object.keys(memoryStats.byCategory).length : 0;
  var avgConfidence = memoryStats && memoryStats.avgConfidence != null ? ((memoryStats.avgConfidence * 100).toFixed(0) + '%') : '-';
  var sourcesCount = memoryStats && memoryStats.bySource ? Object.keys(memoryStats.bySource).length : 0;

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Memory'),
      h('button', { className: 'btn btn-ghost btn-sm', onClick: loadAll }, I.refresh(), ' Refresh')
    ),
    h('div', { className: 'card-body' },

      // Stats Row
      h('div', { className: 'stat-grid', style: { marginBottom: 16 } },
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, totalMemories),
          h('div', { className: 'stat-label' }, 'Total Memories')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, categoriesUsed),
          h('div', { className: 'stat-label' }, 'Categories Used')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, avgConfidence),
          h('div', { className: 'stat-label' }, 'Avg Confidence')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, sourcesCount),
          h('div', { className: 'stat-label' }, 'Sources')
        )
      ),

      // Filter Bar
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
        h('div', { style: { position: 'relative', flex: 1, minWidth: 180 } },
          h('input', {
            className: 'input',
            placeholder: 'Search memories...',
            value: searchQuery,
            onChange: function(e) { setSearchQuery(e.target.value); },
            onKeyDown: function(e) { if (e.key === 'Enter') handleSearch(); }
          })
        ),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: handleSearch }, I.search()),
        h('select', { className: 'input', style: { maxWidth: 170 }, value: filterCategory, onChange: function(e) { setFilterCategory(e.target.value); } },
          h('option', { value: '' }, 'All Categories'),
          MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
        ),
        h('select', { className: 'input', style: { maxWidth: 150 }, value: filterImportance, onChange: function(e) { setFilterImportance(e.target.value); } },
          h('option', { value: '' }, 'All Importance'),
          h('option', { value: 'critical' }, 'Critical'),
          h('option', { value: 'high' }, 'High'),
          h('option', { value: 'normal' }, 'Normal'),
          h('option', { value: 'low' }, 'Low')
        ),
        h('div', { style: { flex: '0 0 auto' } }),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowCreateModal(true); } }, I.plus(), ' Create Memory'),
        h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--warning)' }, onClick: pruneStale }, I.trash(), ' Prune Stale'),
        h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--warning)' }, onClick: runDecay }, I.clock(), ' Run Decay')
      ),

      // Memory Cards List
      memories.length === 0
        ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No memories found for this agent')
        : h('div', { style: { display: 'grid', gap: 10 } },
            memories.map(function(m) {
              var truncatedContent = m.content && m.content.length > 200 ? m.content.substring(0, 200) + '...' : (m.content || '');
              var tags = m.tags || [];
              var confidence = m.confidence != null ? ((m.confidence * 100).toFixed(0) + '%') : '-';
              var created = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-';
              var lastAccessed = m.lastAccessedAt ? new Date(m.lastAccessedAt).toLocaleDateString() : '-';

              return h('div', { key: m.id, style: { padding: '14px 18px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' } },
                // Title
                h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 6 } }, m.title || 'Untitled'),

                // Category + Importance + Source badges row
                h('div', { style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
                  h('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#fff', background: memCatColor(m.category) } }, memCatLabel(m.category)),
                  h('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#fff', background: importanceBadgeColor(m.importance) } }, m.importance || 'normal'),
                  m.source && h('span', { className: 'badge badge-neutral' }, m.source)
                ),

                // Content (truncated)
                h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis' } }, truncatedContent),

                // Tags row
                tags.length > 0 && h('div', { style: { display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' } },
                  tags.map(function(tag, ti) {
                    return h('span', { key: ti, className: 'badge badge-neutral', style: { fontSize: 10 } }, tag);
                  })
                ),

                // Meta row: confidence, created, last accessed, delete button
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--text-muted)' } },
                  h('span', null, 'Confidence: ', h('strong', null, confidence)),
                  h('span', null, 'Created: ', created),
                  h('span', null, 'Last accessed: ', lastAccessed),
                  h('div', { style: { flex: 1 } }),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function() { deleteMemory(m.id); } }, I.trash(), ' Delete')
                )
              );
            })
          )
    ),

    // Create Memory Modal
    showCreateModal && h('div', { className: 'modal-overlay', onClick: function() { setShowCreateModal(false); } },
      h('div', { className: 'modal', style: { maxWidth: 540 }, onClick: function(e) { e.stopPropagation(); } },
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
            h('textarea', { className: 'input', style: { minHeight: 120 }, placeholder: 'Memory content...', value: createForm.content, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { content: e.target.value })); } })
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
            h('input', { className: 'input', placeholder: 'tag1, tag2, tag3', value: createForm.tags, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { tags: e.target.value })); } })
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowCreateModal(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: createMemory }, 'Create Memory')
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

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/workforce/schedules/' + agentId).catch(function() { return null; }),
      engineCall('/workforce/status/' + agentId).catch(function() { return null; }),
      engineCall('/workforce/tasks/' + agentId).catch(function() { return []; }),
      engineCall('/workforce/clock-records/' + agentId).catch(function() { return []; })
    ]).then(function(results) {
      setSchedule(results[0]);
      setStatus(results[1]);
      setTasks(results[2]?.tasks || results[2] || []);
      setClockRecords(results[3]?.records || results[3] || []);
      setLoading(false);
    });
  };

  useEffect(function() { loadAll(); }, [agentId]);

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
      h('div', { className: 'card-header' }, h('span', null, 'Schedule')),
      h('div', { className: 'card-body' },
        schedule
          ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
              h('div', null,
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Schedule Type'),
                h('div', { style: { fontSize: 14, fontWeight: 600 } }, schedule.type || schedule.scheduleType || 'Standard')
              ),
              h('div', null,
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Hours'),
                h('div', { style: { fontSize: 14, fontWeight: 600 } }, schedule.hours || schedule.workHours || '-')
              ),
              h('div', null,
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Timezone'),
                h('div', { style: { fontSize: 14, fontWeight: 600 } }, schedule.timezone || 'UTC')
              ),
              h('div', null,
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Enforcement'),
                h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                  schedule.enforceStart != null && h('span', { className: schedule.enforceStart ? 'badge badge-success' : 'badge badge-neutral' }, schedule.enforceStart ? 'Enforce Start' : 'Flexible Start'),
                  schedule.enforceEnd != null && h('span', { className: schedule.enforceEnd ? 'badge badge-success' : 'badge badge-neutral' }, schedule.enforceEnd ? 'Enforce End' : 'Flexible End'),
                  schedule.enforceBreaks != null && h('span', { className: schedule.enforceBreaks ? 'badge badge-success' : 'badge badge-neutral' }, schedule.enforceBreaks ? 'Enforce Breaks' : 'Flexible Breaks')
                )
              )
            )
          : h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No schedule configured.')
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

  var _subTab = useState('status');
  var subTab = _subTab[0]; var setSubTab = _subTab[1];

  var _guardrailStatus = useState(null);
  var guardrailStatus = _guardrailStatus[0]; var setGuardrailStatus = _guardrailStatus[1];
  var _interventions = useState([]);
  var interventions = _interventions[0]; var setInterventions = _interventions[1];
  var _dlpViolations = useState([]);
  var dlpViolations = _dlpViolations[0]; var setDlpViolations = _dlpViolations[1];
  var _onboardingStatus = useState(null);
  var onboardingStatus = _onboardingStatus[0]; var setOnboardingStatus = _onboardingStatus[1];
  var _onboardingProgress = useState([]);
  var onboardingProgress = _onboardingProgress[0]; var setOnboardingProgress = _onboardingProgress[1];
  var _pendingPolicies = useState([]);
  var pendingPolicies = _pendingPolicies[0]; var setPendingPolicies = _pendingPolicies[1];
  var _pendingApprovals = useState([]);
  var pendingApprovals = _pendingApprovals[0]; var setPendingApprovals = _pendingApprovals[1];
  var _approvalHistory = useState([]);
  var approvalHistory = _approvalHistory[0]; var setApprovalHistory = _approvalHistory[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/guardrails/status/' + agentId).catch(function() { return null; }),
      engineCall('/guardrails/interventions?agentId=' + agentId).catch(function() { return { interventions: [] }; }),
      engineCall('/dlp/violations?agentId=' + agentId).catch(function() { return { violations: [] }; }),
      engineCall('/onboarding/status/' + agentId).catch(function() { return null; }),
      engineCall('/onboarding/progress/' + agentId).catch(function() { return { progress: [] }; }),
      engineCall('/onboarding/pending/' + agentId).catch(function() { return { policies: [] }; }),
      engineCall('/approvals/pending?agentId=' + agentId).catch(function() { return { approvals: [] }; }),
      engineCall('/approvals/history?agentId=' + agentId).catch(function() { return { approvals: [] }; })
    ]).then(function(results) {
      setGuardrailStatus(results[0]);
      setInterventions(results[1]?.interventions || results[1] || []);
      setDlpViolations(results[2]?.violations || results[2] || []);
      setOnboardingStatus(results[3]);
      setOnboardingProgress(results[4]?.progress || results[4] || []);
      setPendingPolicies(results[5]?.policies || results[5] || []);
      setPendingApprovals(results[6]?.approvals || results[6] || []);
      setApprovalHistory(results[7]?.approvals || results[7] || []);
      setLoading(false);
    });
  };

  useEffect(function() { loadAll(); }, [agentId]);

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
    showConfirm({
      title: 'Kill Agent',
      message: 'Are you sure you want to kill this agent? This will immediately terminate all running processes.',
      warning: 'This action cannot be undone.',
      danger: true,
      confirmText: 'Kill Agent'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/guardrails/kill/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual kill from dashboard' }) })
        .then(function() { toast('Agent killed', 'success'); loadAll(); })
        .catch(function(err) { toast(err.message, 'error'); });
    });
  };

  var initiateOnboarding = function() {
    engineCall('/onboarding/initiate/' + agentId, { method: 'POST', body: JSON.stringify({ orgId: 'default' }) })
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
      .then(function() { toast('Request approved', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var rejectRequest = function(id) {
    engineCall('/approvals/' + id + '/reject', { method: 'POST', body: JSON.stringify({ decidedBy: 'dashboard-admin' }) })
      .then(function() { toast('Request rejected', 'success'); loadAll(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading guardrails data...');
  }

  return h(Fragment, null,

    // ─── Sub-Tab Bar ────────────────────────────────────
    h('div', { style: { borderBottom: '1px solid var(--border)', marginBottom: 20 } },
      h('div', { className: 'tabs' },
        h('div', { className: 'tab' + (subTab === 'status' ? ' active' : ''), onClick: function() { setSubTab('status'); } }, 'Status'),
        h('div', { className: 'tab' + (subTab === 'interventions' ? ' active' : ''), onClick: function() { setSubTab('interventions'); } }, 'Interventions'),
        h('div', { className: 'tab' + (subTab === 'dlp' ? ' active' : ''), onClick: function() { setSubTab('dlp'); } }, 'DLP'),
        h('div', { className: 'tab' + (subTab === 'onboarding' ? ' active' : ''), onClick: function() { setSubTab('onboarding'); } }, 'Onboarding'),
        h('div', { className: 'tab' + (subTab === 'approvals' ? ' active' : ''), onClick: function() { setSubTab('approvals'); } }, 'Approvals')
      )
    ),

    // ─── Status Tab ─────────────────────────────────────
    subTab === 'status' && h('div', null,
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' }, h('span', null, 'Guardrail Status')),
        h('div', { className: 'card-body' },
          guardrailStatus && guardrailStatus.paused
            ? h('div', { style: { padding: '12px 16px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid var(--warning)', borderRadius: 8, marginBottom: 16 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                  h('span', { className: 'badge badge-warning' }, I.pause(), ' Paused'),
                  guardrailStatus.pausedAt && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Since: ' + new Date(guardrailStatus.pausedAt).toLocaleString())
                ),
                guardrailStatus.pauseReason && h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 } }, 'Reason: ' + guardrailStatus.pauseReason)
              )
            : h('div', { style: { padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--success)', borderRadius: 8, marginBottom: 16 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { className: 'badge badge-success' }, I.shield(), ' Active')
                )
              ),
          h('div', { style: { display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 } },
            h('span', { style: { color: 'var(--text-muted)' } }, 'Interventions: ', h('strong', null, String(guardrailStatus?.interventionCount || guardrailStatus?.interventions || 0))),
            guardrailStatus?.lastIntervention && h('span', { style: { color: 'var(--text-muted)' } }, 'Last: ' + new Date(guardrailStatus.lastIntervention).toLocaleString())
          ),
          h('div', { style: { display: 'flex', gap: 8 } },
            guardrailStatus && !guardrailStatus.paused && h('button', { className: 'btn btn-secondary btn-sm', onClick: pauseAgent }, I.pause(), ' Pause'),
            guardrailStatus && guardrailStatus.paused && h('button', { className: 'btn btn-primary btn-sm', onClick: resumeAgent }, I.play(), ' Resume'),
            h('button', { className: 'btn btn-danger btn-sm', onClick: killAgent }, I.stop(), ' Kill')
          )
        )
      )
    ),

    // ─── Interventions Tab ──────────────────────────────
    subTab === 'interventions' && h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Interventions')),
      interventions.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Severity'),
                  h('th', null, 'Description'),
                  h('th', null, 'Resolution')
                )
              ),
              h('tbody', null,
                interventions.map(function(inv, i) {
                  var time = inv.timestamp || inv.createdAt;
                  var invType = inv.type || inv.interventionType || 'unknown';
                  var severity = inv.severity || 'medium';
                  var severityColor = severity === 'critical' ? 'badge-danger' : severity === 'high' ? 'badge-warning' : severity === 'medium' ? 'badge-info' : 'badge-neutral';
                  var typeColor = invType === 'block' ? 'badge-danger' : invType === 'warn' ? 'badge-warning' : invType === 'audit' ? 'badge-info' : 'badge-neutral';

                  return h('tr', { key: inv.id || i },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, time ? new Date(time).toLocaleString() : '-'),
                    h('td', null, h('span', { className: 'badge ' + typeColor }, invType)),
                    h('td', null, h('span', { className: 'badge ' + severityColor }, severity)),
                    h('td', { style: { fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, inv.description || inv.message || '-'),
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, inv.resolution || inv.action || '-')
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No interventions recorded.')
          )
    ),

    // ─── DLP Tab ────────────────────────────────────────
    subTab === 'dlp' && h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'DLP Violations')),
      dlpViolations.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Rule'),
                  h('th', null, 'Severity'),
                  h('th', null, 'Content'),
                  h('th', null, 'Status')
                )
              ),
              h('tbody', null,
                dlpViolations.map(function(v, i) {
                  var time = v.timestamp || v.createdAt || v.detectedAt;
                  var rule = v.rule || v.ruleName || v.ruleId || 'Unknown';
                  var severity = v.severity || 'medium';
                  var severityColor = severity === 'critical' ? 'badge-danger' : severity === 'high' ? 'badge-warning' : severity === 'medium' ? 'badge-info' : 'badge-neutral';
                  var content = v.content || v.matchedContent || v.snippet || '';
                  var truncatedContent = content.length > 80 ? content.substring(0, 80) + '...' : content;
                  var violationStatus = v.status || v.action || 'detected';

                  return h('tr', { key: v.id || i },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, time ? new Date(time).toLocaleString() : '-'),
                    h('td', null, h('span', { className: 'badge badge-info' }, rule)),
                    h('td', null, h('span', { className: 'badge ' + severityColor }, severity)),
                    h('td', { style: { fontSize: 12, fontFamily: 'var(--font-mono, monospace)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' } }, truncatedContent || '-'),
                    h('td', null, h('span', { className: 'badge badge-neutral' }, violationStatus))
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No DLP violations detected.')
          )
    ),

    // ─── Onboarding Tab ─────────────────────────────────
    subTab === 'onboarding' && h('div', null,

      // Onboarding Status Card
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', null, 'Onboarding Status'),
          h('div', { style: { display: 'flex', gap: 8 } },
            !onboardingStatus?.onboarded && h('button', { className: 'btn btn-primary btn-sm', onClick: initiateOnboarding }, 'Start Onboarding'),
            onboardingStatus && onboardingStatus.status === 'in_progress' && h('button', { className: 'btn btn-secondary btn-sm', onClick: forceComplete }, 'Force Complete')
          )
        ),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
            onboardingStatus?.onboarded
              ? h('span', { className: 'badge badge-success' }, I.check(), ' Onboarded')
              : h('span', { className: 'badge badge-warning' }, 'Not Onboarded'),
            onboardingStatus?.status && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Status: ' + onboardingStatus.status),
            onboardingStatus?.completedAt && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Completed: ' + new Date(onboardingStatus.completedAt).toLocaleString())
          )
        )
      ),

      // Progress Table
      onboardingProgress.length > 0 && h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' }, h('span', null, 'Onboarding Progress')),
        h('div', { className: 'card-body-flush' },
          h('table', { className: 'data-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Policy'),
                h('th', null, 'Status'),
                h('th', null, 'Acknowledged')
              )
            ),
            h('tbody', null,
              onboardingProgress.map(function(p, i) {
                var pStatus = p.status || 'pending';
                var statusColor = pStatus === 'acknowledged' || pStatus === 'completed' ? 'badge-success' : pStatus === 'in_progress' ? 'badge-info' : 'badge-warning';

                return h('tr', { key: p.id || i },
                  h('td', { style: { fontWeight: 500, fontSize: 13 } }, p.policyName || p.name || p.policyId || '-'),
                  h('td', null, h('span', { className: 'badge ' + statusColor }, pStatus)),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, p.acknowledgedAt ? new Date(p.acknowledgedAt).toLocaleString() : '-')
                );
              })
            )
          )
        )
      ),

      // Pending Policies
      pendingPolicies.length > 0 && h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' }, h('span', null, 'Pending Policies')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'grid', gap: 8 } },
            pendingPolicies.map(function(p, i) {
              return h('div', { key: p.id || i, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' } },
                h('span', { className: 'badge badge-warning' }, 'Pending'),
                h('span', { style: { fontSize: 13, fontWeight: 500 } }, p.name || p.policyName || p.policyId || 'Unnamed Policy'),
                p.category && h('span', { className: 'badge badge-neutral', style: { fontSize: 11 } }, p.category)
              );
            })
          )
        )
      )
    ),

    // ─── Approvals Tab ──────────────────────────────────
    subTab === 'approvals' && h('div', null,

      // Pending Approvals
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' }, h('span', null, 'Pending Approvals')),
        pendingApprovals.length > 0
          ? h('div', { className: 'card-body' },
              h('div', { style: { display: 'grid', gap: 12 } },
                pendingApprovals.map(function(a, i) {
                  var riskLevel = a.riskLevel || a.risk || 'medium';
                  return h('div', { key: a.id || i, style: { padding: '14px 18px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                      h('span', { className: 'badge badge-info' }, a.type || a.actionType || 'action'),
                      h('span', { className: riskBadgeClass(riskLevel) }, riskLevel),
                      a.createdAt && h('span', { style: { fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' } }, new Date(a.createdAt).toLocaleString())
                    ),
                    h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 } }, a.description || a.reason || 'No description'),
                    h('div', { style: { display: 'flex', gap: 8 } },
                      h('button', { className: 'btn btn-primary btn-sm', onClick: function() { approveRequest(a.id); } }, I.check(), ' Approve'),
                      h('button', { className: 'btn btn-danger btn-sm', onClick: function() { rejectRequest(a.id); } }, I.x(), ' Reject')
                    )
                  );
                })
              )
            )
          : h('div', { className: 'card-body' },
              h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No pending approvals.')
            )
      ),

      // Approval History
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' }, h('span', null, 'Approval History')),
        approvalHistory.length > 0
          ? h('div', { className: 'card-body-flush' },
              h('table', { className: 'data-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Type'),
                    h('th', null, 'Decision'),
                    h('th', null, 'Decided By'),
                    h('th', null, 'Date')
                  )
                ),
                h('tbody', null,
                  approvalHistory.map(function(a, i) {
                    var decision = a.decision || a.status || 'unknown';
                    var decisionColor = decision === 'approved' ? 'badge-success' : decision === 'rejected' ? 'badge-danger' : 'badge-neutral';
                    var decidedAt = a.decidedAt || a.updatedAt || a.createdAt;

                    return h('tr', { key: a.id || i },
                      h('td', null, h('span', { className: 'badge badge-info' }, a.type || a.actionType || 'action')),
                      h('td', null, h('span', { className: 'badge ' + decisionColor }, decision)),
                      h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, a.decidedBy || a.reviewer || '-'),
                      h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, decidedAt ? new Date(decidedAt).toLocaleString() : '-')
                    );
                  })
                )
              )
            )
          : h('div', { className: 'card-body' },
              h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No approval history.')
            )
      )
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

    // ─── Deployment Status Card ─────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Deployment Status')),
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
                    h('td', null, String(kb.documentCount || kb.documents || kb.docCount || 0))
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

  var TABS = ['overview', 'personal', 'permissions', 'activity', 'communication', 'workforce', 'memory', 'guardrails', 'budget', 'tool-security', 'deployment'];
  var TAB_LABELS = { 'tool-security': 'Tool Security' };

  var load = function() {
    setLoading(true);
    Promise.all([
      engineCall('/bridge/agents/' + agentId + '/full').catch(function() { return null; }),
      apiCall('/agents/' + agentId).catch(function() { return null; }),
      engineCall('/agents?orgId=default').catch(function() { return { agents: [] }; })
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
    tab === 'permissions' && h(PermissionsSection, { agentId: agentId, profile: profile, reload: load }),
    tab === 'activity' && h(ActivitySection, { agentId: agentId }),
    tab === 'communication' && h(CommunicationSection, { agentId: agentId, agents: agents }),
    tab === 'workforce' && h(WorkforceSection, { agentId: agentId }),
    tab === 'memory' && h(MemorySection, { agentId: agentId }),
    tab === 'guardrails' && h(GuardrailsSection, { agentId: agentId, agents: agents }),
    tab === 'budget' && h(BudgetSection, { agentId: agentId }),
    tab === 'tool-security' && h(ToolSecuritySection, { agentId: agentId }),
    tab === 'deployment' && h(DeploymentSection, { agentId: agentId, engineAgent: engineAgent, agent: agent, reload: load, onBack: onBack })
  );
}

export { AgentDetailPage };
