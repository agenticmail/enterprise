import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, StatCard, EmptyState, formatNumber, formatCost, formatTime, MEMORY_CATEGORIES, memCatColor, memCatLabel, importanceBadgeColor } from './shared.js?v=4';
import { resolveManager } from './manager.js?v=4';

var CATEGORY_COLORS = {
  code_of_conduct: '#6366f1', communication: '#0ea5e9', data_handling: '#f59e0b',
  brand_voice: '#ec4899', security: '#ef4444', escalation: '#8b5cf6', custom: '#64748b'
};
var ENFORCEMENT_COLORS = { mandatory: '#ef4444', recommended: '#f59e0b', informational: '#0ea5e9' };

// ════════════════════════════════════════════════════════════
// OVERVIEW SECTION
// ════════════════════════════════════════════════════════════

export function OverviewSection(props) {
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

  // Triple-confirmation delete flow
  var [deleteStep, setDeleteStep] = useState(0); // 0=hidden, 1=first, 2=second, 3=type-name
  var [deleteTyped, setDeleteTyped] = useState('');

  var startDelete = function() { setDeleteStep(1); setDeleteTyped(''); };
  var cancelDelete = function() { setDeleteStep(0); setDeleteTyped(''); };

  var advanceDelete = async function() {
    if (deleteStep === 1) { setDeleteStep(2); return; }
    if (deleteStep === 2) { setDeleteStep(3); return; }
    if (deleteStep === 3) {
      var expectedName = (engineAgent?.name || '').trim().toLowerCase();
      if (deleteTyped.trim().toLowerCase() !== expectedName) {
        toast('Agent name does not match', 'error');
        return;
      }
      setActing('delete');
      try {
        await apiCall('/bridge/agents/' + agentId, { method: 'DELETE' });
        toast('Agent deleted', 'success');
        if (props.onBack) props.onBack();
      } catch (err) {
        toast(err.message, 'error');
      }
      setActing('');
      setDeleteStep(0);
    }
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
        h('div', { style: { flex: 1 } })
      )
    ),

    // ─── Danger Zone ──────────────────────────────────────
    h('div', { className: 'card', style: { marginTop: 20, borderColor: 'var(--danger)' } },
      h('div', { className: 'card-header', style: { borderBottomColor: 'var(--danger-soft)' } },
        h('h3', { style: { color: 'var(--danger)' } }, I.warning(), ' Danger Zone')
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('div', null,
            h('div', { style: { fontWeight: 600, marginBottom: 2 } }, 'Delete this agent'),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Permanently remove this agent and all associated data. This cannot be undone.')
          ),
          h('button', { className: 'btn btn-danger btn-sm', onClick: startDelete }, I.trash(), ' Delete Agent')
        )
      )
    ),

    // ─── Triple Confirmation Modals ───────────────────────
    deleteStep >= 1 && h('div', { className: 'modal-overlay', onClick: cancelDelete },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 440 } },
        h('div', { className: 'modal-header' },
          h('h2', { style: { color: 'var(--danger)' } },
            deleteStep === 1 ? 'Are you sure?' : deleteStep === 2 ? 'This is irreversible' : 'Final confirmation'
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: cancelDelete }, '\u00D7')
        ),
        h('div', { className: 'modal-body', style: { padding: 20 } },
          deleteStep === 1 && h(Fragment, null,
            h('p', { style: { marginBottom: 12 } }, 'You are about to delete agent ', h('strong', null, engineAgent?.name || agentId), '.'),
            h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'This will permanently remove the agent, all sessions, memory, and configuration. There is no way to recover this data.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'Yes, I want to delete')
            )
          ),
          deleteStep === 2 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)' } }, 'WARNING: '),
              h('span', null, 'All data for this agent will be permanently destroyed including emails, conversations, memory entries, tool logs, and configurations.')
            ),
            h('p', { style: { marginBottom: 8 } }, 'This action ', h('strong', null, 'CANNOT'), ' be undone. Are you absolutely sure?'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'I understand, continue')
            )
          ),
          deleteStep === 3 && h(Fragment, null,
            h('p', { style: { marginBottom: 12 } }, 'To confirm, type the agent name ', h('strong', { style: { fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 } }, engineAgent?.name || agentId), ' below:'),
            h('input', {
              type: 'text',
              className: 'form-control',
              placeholder: 'Type agent name to confirm...',
              value: deleteTyped,
              autoFocus: true,
              onInput: function(e) { setDeleteTyped(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') advanceDelete(); },
              style: { marginBottom: 16, borderColor: deleteTyped.trim().toLowerCase() === (engineAgent?.name || '').trim().toLowerCase() ? 'var(--danger)' : 'var(--border)' }
            }),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', {
                className: 'btn btn-danger',
                disabled: deleteTyped.trim().toLowerCase() !== (engineAgent?.name || '').trim().toLowerCase() || acting === 'delete',
                onClick: advanceDelete
              }, acting === 'delete' ? 'Deleting...' : 'Permanently delete agent')
            )
          )
        )
      )
    )
  );
}

