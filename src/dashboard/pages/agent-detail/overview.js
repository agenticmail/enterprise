import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, StatCard, EmptyState, formatNumber, formatCost, formatTime, MEMORY_CATEGORIES, memCatColor, memCatLabel, importanceBadgeColor } from './shared.js?v=4';
import { resolveManager } from './manager.js?v=4';
import { HelpButton } from '../../components/help-button.js';

var CATEGORY_COLORS = {
  code_of_conduct: '#6366f1', communication: '#0ea5e9', data_handling: '#f59e0b',
  brand_voice: '#9d174d', security: '#ef4444', escalation: '#8b5cf6', custom: '#64748b'
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

  // ─── Real-Time Agent Status (SSE) ─────────────────────
  var _rtStatus = useState(null);
  var rtStatus = _rtStatus[0]; var setRtStatus = _rtStatus[1];

  useEffect(function() {
    // Fetch initial snapshot
    engineCall('/agent-status/' + agentId).then(function(d) { setRtStatus(d); }).catch(function() {});

    // Subscribe to real-time updates via SSE
    var es = new EventSource('/api/engine/agent-status-stream?agentId=' + agentId);
    es.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'status') setRtStatus(data);
      } catch {}
    };
    es.onerror = function() {
      // Reconnect is automatic with EventSource
    };
    return function() { es.close(); };
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

  // 5-step confirmation delete flow
  var [deleteStep, setDeleteStep] = useState(0); // 0=hidden, 1-5=steps
  var [deleteTyped, setDeleteTyped] = useState('');
  var [deleteChecked, setDeleteChecked] = useState(false);

  var startDelete = function() { setDeleteStep(1); setDeleteTyped(''); setDeleteChecked(false); };
  var cancelDelete = function() { setDeleteStep(0); setDeleteTyped(''); setDeleteChecked(false); };

  var advanceDelete = async function() {
    if (deleteStep < 5) { setDeleteStep(deleteStep + 1); setDeleteChecked(false); return; }
    if (deleteStep === 5) {
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

  // Help tooltip styles
  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

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
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 } },
      h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' } }, 'Today\'s Usage'),
      h(HelpButton, { label: 'Today\'s Usage Stats' },
        h('p', null, 'Real-time performance metrics for this agent over the current day (UTC).'),
        h('h4', { style: _h4 }, 'Metrics Explained'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Tokens Today'), ' — Total input + output tokens consumed by the LLM. Higher token usage means more complex conversations or longer outputs.'),
          h('li', null, h('strong', null, 'Cost Today'), ' — Estimated API cost based on token usage and the agent\'s configured model pricing.'),
          h('li', null, h('strong', null, 'Uptime'), ' — How long the agent has been running since last restart. Resets when the engine restarts.'),
          h('li', null, h('strong', null, 'Error Rate'), ' — Percentage of requests that resulted in errors (timeouts, API failures, guardrail blocks). Above 5% is flagged in red.'),
          h('li', null, h('strong', null, 'Active Sessions'), ' — Currently open conversation sessions. Each chat, email thread, or task is a separate session.')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'If cost is climbing faster than expected, check the Budget tab to set daily/monthly spending limits.')
      )
    ),
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
        h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Onboarding',
          h(HelpButton, { label: 'Agent Onboarding' },
            h('p', null, 'Onboarding ensures the agent acknowledges your organization\'s policies, guardrails, and code of conduct before it starts working.'),
            h('h4', { style: _h4 }, 'How It Works'),
            h('ul', { style: _ul },
              h('li', null, 'When initiated, the agent reads and acknowledges each policy you\'ve configured in Guardrails.'),
              h('li', null, 'The agent must complete onboarding before it can process tasks.'),
              h('li', null, '"Force Complete" skips the acknowledgement process — use this for agents that don\'t need formal onboarding.')
            ),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Set up your guardrail policies first (Guardrails tab), then onboard the agent. The agent will reference these policies in every interaction.')
          )
        )),
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
        h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Guardrails',
          h(HelpButton, { label: 'Guardrails Status' },
            h('p', null, 'Guardrails are safety rules that constrain the agent\'s behavior. When active, the agent is monitored and can be automatically paused if it violates a policy.'),
            h('h4', { style: _h4 }, 'States'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Active'), ' — The agent is running normally with all guardrails enforced.'),
              h('li', null, h('strong', null, 'Paused'), ' — The agent has been paused (manually or by an automated trigger). It will not process new tasks until resumed.')
            ),
            h('h4', { style: _h4 }, 'Interventions'),
            h('p', null, 'The intervention count tracks how many times a guardrail rule has triggered (e.g., blocked a response, flagged content, or paused the agent). High counts may indicate the agent needs reconfiguration.'),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Configure guardrail policies in the Guardrails tab. Use "pause" triggers for critical rules and "log" triggers for monitoring.')
          )
        )),
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
        h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Workforce',
          h(HelpButton, { label: 'Workforce Status' },
            h('p', null, 'Workforce management tracks the agent\'s work schedule and availability, similar to an employee clocking in and out.'),
            h('h4', { style: _h4 }, 'Clock In / Clock Out'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Clocked In'), ' — The agent is on duty and will process incoming tasks, messages, and emails.'),
              h('li', null, h('strong', null, 'Clocked Out'), ' — The agent is off duty. Depending on configuration, tasks may queue until the agent clocks back in.')
            ),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Set up automatic schedules in the Workforce tab so agents clock in/out at specific times (e.g., business hours only).')
          )
        )),
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

    // ─── Organization & Knowledge Access ──────────────────
    h(OrgAndKnowledgeCards, { agentId: agentId, agent: agent, engineAgent: engineAgent, toast: toast }),

    // ─── Real-Time Status Card ────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Live Status',
          h(HelpButton, { label: 'Live Status' },
            h('p', null, 'Real-time status streamed via Server-Sent Events (SSE). Updates automatically without refreshing the page.'),
            h('h4', { style: _h4 }, 'Status Indicators'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Online'), ' — Agent is running and processing requests normally.'),
              h('li', null, h('strong', null, 'Idle'), ' — Agent is running but not currently processing any task.'),
              h('li', null, h('strong', null, 'Busy'), ' — Agent is actively processing a request or task.'),
              h('li', null, h('strong', null, 'Error'), ' — Agent encountered an issue. Check the Activity tab for details.')
            ),
            h('p', null, 'The current task, model, and token count are shown when the agent is actively working.'),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'If the status shows "offline" but the agent should be running, try restarting from Quick Actions.')
          )
        ),
        rtStatus ? h('span', {
          className: 'badge badge-' + (rtStatus.status === 'online' ? 'success' : rtStatus.status === 'idle' ? 'info' : rtStatus.status === 'error' ? 'danger' : 'neutral'),
          style: { textTransform: 'capitalize' }
        }, rtStatus.status === 'online' ? I.check() : rtStatus.status === 'idle' ? I.clock() : '', ' ', rtStatus.status || 'unknown') : null
      ),
      h('div', { className: 'card-body' },
        !rtStatus || rtStatus.status === 'offline'
          ? h('div', { style: { textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 13 } },
              I.clock(), ' Agent is offline',
              rtStatus && rtStatus.lastActivity && h('span', { style: { marginLeft: 8 } }, '(last active: ' + new Date(rtStatus.lastActivity).toLocaleString() + ')')
            )
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
              // Currently working on
              rtStatus.currentActivity
                ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('div', {
                      style: { width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite', flexShrink: 0 }
                    }),
                    h('div', null,
                      h('div', { style: { fontWeight: 600, fontSize: 14 } }, 'Currently: ', rtStatus.currentActivity.detail || rtStatus.currentActivity.type),
                      rtStatus.currentActivity.tool && h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Using: ', rtStatus.currentActivity.tool),
                      h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Started: ', new Date(rtStatus.currentActivity.startedAt).toLocaleTimeString())
                    )
                  )
                : h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('div', { style: { width: 10, height: 10, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 } }),
                    h('div', { style: { fontSize: 14 } }, 'Idle — waiting for tasks')
                  ),
              // Stats row
              h('div', { style: { display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 } },
                h('span', null, 'Sessions: ', h('strong', null, rtStatus.activeSessions || 0)),
                rtStatus.onlineSince && h('span', null, 'Uptime: ', h('strong', null, _formatUptime(rtStatus.uptimeMs))),
                rtStatus.lastHeartbeat && h('span', null, 'Last heartbeat: ', h('strong', null, _timeAgo(rtStatus.lastHeartbeat)))
              )
            )
      )
    ),

    // ─── Quick Actions Bar ──────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Quick Actions',
        h(HelpButton, { label: 'Quick Actions' },
          h('p', null, 'Common agent operations you can perform directly from the overview.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Pause / Resume'), ' — Temporarily stop the agent from processing tasks. Existing sessions are preserved.'),
            h('li', null, h('strong', null, 'Clock In / Out'), ' — Toggle the agent\'s workforce availability.'),
            h('li', null, h('strong', null, 'Restart'), ' — Restart the agent\'s engine if it\'s stuck or behaving unexpectedly.'),
            h('li', null, h('strong', null, 'Redeploy'), ' — Re-deploy with the latest configuration changes.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Pause is instant and safe — it doesn\'t lose any context. Use it when you need to make config changes.')
        )
      )),
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
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 480 } },
        h('div', { className: 'modal-header' },
          h('h2', { style: { color: 'var(--danger)' } },
            ['', 'Step 1: Are you sure?', 'Step 2: Data Loss Warning', 'Step 3: Memory & Knowledge Loss', 'Step 4: Communication & Integration Impact', 'Step 5: Final Confirmation'][deleteStep]
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: cancelDelete }, '\u00D7')
        ),
        // Step indicator
        h('div', { style: { display: 'flex', gap: 4, padding: '0 20px', paddingTop: 12 } },
          [1,2,3,4,5].map(function(s) {
            return h('div', { key: s, style: { flex: 1, height: 4, borderRadius: 2, background: s <= deleteStep ? 'var(--danger)' : 'var(--border)' } });
          })
        ),
        h('div', { className: 'modal-body', style: { padding: 20 } },

          // Step 1 — Initial warning
          deleteStep === 1 && h(Fragment, null,
            h('p', { style: { marginBottom: 12 } }, 'You are about to delete agent ', h('strong', null, engineAgent?.name || agentId), '.'),
            h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 } }, 'This is a destructive action that will permanently remove this agent and everything associated with it. There is no undo, no recycle bin, and no way to recover.'),
            h('p', { style: { fontSize: 13 } }, 'Please proceed through the next steps to understand exactly what will be lost.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'I understand, continue')
            )
          ),

          // Step 2 — Data loss
          deleteStep === 2 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 6 } }, 'ALL AGENT DATA WILL BE DESTROYED'),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13 } },
                h('li', null, 'All email messages (inbox, sent, drafts, folders)'),
                h('li', null, 'All conversation sessions and chat history'),
                h('li', null, 'All tool execution logs and audit trails'),
                h('li', null, 'All configuration, settings, and deployment config'),
                h('li', null, 'All scheduled jobs, cron tasks, and automations')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'If you need any of this data, export it BEFORE proceeding.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'Continue anyway')
            )
          ),

          // Step 3 — Memory & knowledge loss
          deleteStep === 3 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 6 } }, 'MEMORY & KNOWLEDGE PERMANENTLY LOST'),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13 } },
                h('li', null, 'All long-term memory entries the agent has built over time'),
                h('li', null, 'All learned preferences, patterns, and behavioral adaptations'),
                h('li', null, 'All knowledge base contributions and embeddings'),
                h('li', null, 'All training data, fine-tuning, and custom instructions'),
                h('li', null, 'The agent\'s entire personality and relationship context')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'This agent has been learning and building context. Once deleted, this knowledge cannot be reconstructed even if you create a new agent with the same name.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'Continue anyway')
            )
          ),

          // Step 4 — Communication & integration impact
          deleteStep === 4 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 6 } }, 'COMMUNICATION & INTEGRATION IMPACT'),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13 } },
                h('li', null, 'The agent\'s email address will stop working immediately'),
                h('li', null, 'Any external services or APIs relying on this agent will break'),
                h('li', null, 'Other agents that communicate with this agent will lose their connection'),
                h('li', null, 'Active workflows, approval chains, and escalation paths will be disrupted'),
                h('li', null, 'Contacts and external parties will receive bounced emails')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'If this agent is part of a team or workflow, consider reassigning its responsibilities first.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'I accept the consequences')
            )
          ),

          // Step 5 — Type name to confirm
          deleteStep === 5 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, textAlign: 'center' } },
              h('strong', { style: { color: 'var(--danger)', fontSize: 15 } }, 'THIS ACTION IS PERMANENT AND IRREVERSIBLE')
            ),
            h('p', { style: { marginBottom: 12 } }, 'To confirm deletion, type the agent name ', h('strong', { style: { fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 } }, engineAgent?.name || agentId), ' below:'),
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

function _formatUptime(ms) {
  if (!ms) return '-';
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  var hr = Math.floor(m / 60);
  if (hr < 24) return hr + 'h ' + (m % 60) + 'm';
  return Math.floor(hr / 24) + 'd ' + (hr % 24) + 'h';
}

function _timeAgo(ts) {
  if (!ts) return '-';
  var diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  return Math.floor(diff / 3600000) + 'h ago';
}

// ─── Organization & Knowledge Access Cards ────────────────
function OrgAndKnowledgeCards(props) {
  var agentId = props.agentId;
  var toast = props.toast;

  var _orgs = useState([]);
  var orgs = _orgs[0]; var setOrgs = _orgs[1];
  var _currentOrg = useState(null);
  var currentOrg = _currentOrg[0]; var setCurrentOrg = _currentOrg[1];
  var _kbs = useState([]);
  var kbs = _kbs[0]; var setKbs = _kbs[1];
  var _kaGrants = useState([]);
  var kaGrants = _kaGrants[0]; var setKaGrants = _kaGrants[1];
  var _acting = useState('');
  var acting = _acting[0]; var setActing = _acting[1];
  var _selOrg = useState('');
  var selOrg = _selOrg[0]; var setSelOrg = _selOrg[1];

  useEffect(function() {
    // Load orgs list
    apiCall('/organizations').then(function(d) { setOrgs(d.organizations || []); }).catch(function() {});
    // Load agent's current org
    apiCall('/agents/' + agentId).then(function(a) {
      if (a && a.client_org_id) {
        setSelOrg(a.client_org_id);
        apiCall('/organizations/' + a.client_org_id).then(function(o) { setCurrentOrg(o); }).catch(function() {});
      }
    }).catch(function() {});
    // Load knowledge access
    apiCall('/agents/' + agentId + '/knowledge-access').then(function(d) { setKaGrants(d.grants || []); }).catch(function() {});
    // Load knowledge bases
    engineCall('/knowledge').then(function(d) { setKbs(d.knowledgeBases || d || []); }).catch(function() {});
  }, [agentId]);

  var assignOrg = function(orgId) {
    if (!orgId) {
      setActing('unassign');
      apiCall('/agents/' + agentId + '/unassign-org', { method: 'POST' }).then(function() {
        setCurrentOrg(null); setSelOrg(''); toast('Organization unassigned', 'success');
      }).catch(function(e) { toast(e.message, 'error'); }).finally(function() { setActing(''); });
      return;
    }
    setActing('assign');
    apiCall('/agents/' + agentId + '/assign-org', { method: 'POST', body: JSON.stringify({ orgId: orgId }) }).then(function() {
      setSelOrg(orgId);
      var org = orgs.find(function(o) { return o.id === orgId; });
      setCurrentOrg(org || null);
      toast('Organization assigned', 'success');
    }).catch(function(e) { toast(e.message, 'error'); }).finally(function() { setActing(''); });
  };

  return h(Fragment, null,
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
      // Organization card
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, 'Organization'),
        h('div', { className: 'card-body' },
          currentOrg
            ? h('div', null,
                h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 4 } }, currentOrg.name),
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8 } }, currentOrg.slug),
                h('span', { className: 'badge badge-' + (currentOrg.is_active ? 'success' : 'warning') }, currentOrg.is_active ? 'Active' : 'Inactive')
              )
            : h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 } }, 'Unassigned'),
          h('div', { style: { marginTop: 10 } },
            h('select', { className: 'input', value: selOrg, disabled: !!acting, onChange: function(e) { assignOrg(e.target.value); }, style: { width: '100%', fontSize: 12 } },
              h('option', { value: '' }, '— No organization —'),
              orgs.map(function(o) { return h('option', { key: o.id, value: o.id }, o.name); })
            )
          )
        )
      ),
      // Knowledge Access card
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, 'Knowledge Access'),
        h('div', { className: 'card-body' },
          kbs.length === 0
            ? h('div', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No knowledge bases configured')
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                kbs.map(function(kb) {
                  var grant = kaGrants.find(function(g) { return g.knowledge_base_id === kb.id; });
                  var accessType = grant ? grant.access_type : '';
                  return h('div', { key: kb.id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' } },
                    h('span', { style: { fontSize: 13, fontWeight: 500 } }, kb.name || kb.id),
                    h('select', { className: 'input', value: accessType, style: { width: 120, fontSize: 11, padding: '2px 6px' }, onChange: function(e) {
                      var newVal = e.target.value;
                      var newGrants = kaGrants.filter(function(g) { return g.knowledge_base_id !== kb.id; });
                      if (newVal) newGrants.push({ knowledge_base_id: kb.id, access_type: newVal });
                      var payload = newGrants.map(function(g) { return { knowledgeBaseId: g.knowledge_base_id, accessType: g.access_type }; });
                      apiCall('/agents/' + agentId + '/knowledge-access', { method: 'PUT', body: JSON.stringify({ grants: payload }) })
                        .then(function() { setKaGrants(newGrants); toast('Knowledge access updated', 'success'); })
                        .catch(function(err) { toast(err.message, 'error'); });
                    }},
                      h('option', { value: '' }, 'No access'),
                      h('option', { value: 'read' }, 'Read'),
                      h('option', { value: 'contribute' }, 'Contribute'),
                      h('option', { value: 'both' }, 'Both')
                    )
                  );
                })
              )
        )
      )
    )
  );
}

// Inject pulse animation CSS if not already present
if (typeof document !== 'undefined' && !document.getElementById('_pulse_css')) {
  var style = document.createElement('style');
  style.id = '_pulse_css';
  style.textContent = '@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }';
  document.head.appendChild(style);
}

