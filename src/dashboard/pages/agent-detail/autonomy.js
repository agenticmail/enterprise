import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, EmptyState } from './shared.js?v=4';

// ════════════════════════════════════════════════════════════
// AGENT DETAIL PAGE  (Main Orchestrator)
// ════════════════════════════════════════════════════════════

// ─── Autonomy Settings Section ──────────────────────────

export function AutonomySection(props) {
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

