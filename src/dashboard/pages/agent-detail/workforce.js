import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { TimezoneSelect } from '../../components/timezones.js';
import { Badge, StatCard, EmptyState, formatTime } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';
import { AgentTaskPipeline } from '../task-pipeline.js';

// ════════════════════════════════════════════════════════════
// WORKFORCE SECTION
// ════════════════════════════════════════════════════════════

export function WorkforceSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
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

  // Clock history state
  var _clockPage = useState(0);
  var clockPage = _clockPage[0]; var setClockPage = _clockPage[1];
  var _clockSearch = useState('');
  var clockSearch = _clockSearch[0]; var setClockSearch = _clockSearch[1];
  var _clockFilter = useState('all');
  var clockFilter = _clockFilter[0]; var setClockFilter = _clockFilter[1];
  var _selectedRecord = useState(null);
  var selectedRecord = _selectedRecord[0]; var setSelectedRecord = _selectedRecord[1];
  var CLOCK_PAGE_SIZE = 15;

  // Organization context
  var _orgInfo = useState(null);
  var orgInfo = _orgInfo[0]; var setOrgInfo = _orgInfo[1];

  useEffect(function() {
    if (engineAgent && engineAgent.client_org_id) {
      apiCall('/client-orgs/' + engineAgent.client_org_id).then(function(d) { setOrgInfo(d.org || d); }).catch(function() {});
    }
  }, [engineAgent && engineAgent.client_org_id]);

  // Real-time status
  var _rtStatus = useState(null);
  var rtStatus = _rtStatus[0]; var setRtStatus = _rtStatus[1];

  useEffect(function() {
    var fetchStatus = function() {
      engineCall('/agent-status/' + agentId).then(function(d) { setRtStatus(d); }).catch(function() {});
    };
    fetchStatus();
    var interval = setInterval(fetchStatus, 10000);
    return function() { clearInterval(interval); };
  }, [agentId]);

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

    // ─── Organization Context Banner ────────────────────
    engineAgent && engineAgent.client_org_id && h('div', { style: { padding: '10px 16px', marginBottom: 16, background: 'var(--info-bg, rgba(59,130,246,0.1))', border: '1px solid var(--info-border, rgba(59,130,246,0.3))', borderRadius: 'var(--radius, 8px)', fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 } },
      I.info && I.info(),
      h('span', null, 'Work schedule follows ', h('strong', null, orgInfo ? orgInfo.name : 'organization'), ' business hours.'),
      orgInfo && orgInfo.workingHours && h('span', { style: { marginLeft: 8, color: 'var(--text-muted)' } }, '(' + (orgInfo.workingHours.start || '09:00') + ' – ' + (orgInfo.workingHours.end || '17:00') + ', ' + (orgInfo.workingHours.timezone || 'UTC') + ')')
    ),

    // ─── Status Card (Real-Time) ──────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Agent Status', h(HelpButton, { label: 'Agent Status' },
          h('p', null, 'Real-time status of this agent. Shows whether the agent is online, idle, or has errors. Clock in/out controls the agent\'s work schedule.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Clock-in/out can be enforced by the schedule. When clocked out, the agent pauses or queues incoming work depending on off-hours settings.')
        )),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          rtStatus && h('span', {
            className: 'badge badge-' + (rtStatus.status === 'online' ? 'success' : rtStatus.status === 'idle' ? 'info' : rtStatus.status === 'error' ? 'danger' : 'neutral'),
            style: { textTransform: 'capitalize' }
          }, rtStatus.status || 'unknown'),
          (status && status.clockedIn) || (rtStatus && rtStatus.clockedIn)
            ? h('button', { className: 'btn btn-secondary btn-sm', onClick: clockOut }, I.clock(), ' Clock Out')
            : h('button', { className: 'btn btn-primary btn-sm', onClick: clockIn }, I.clock(), ' Clock In')
        )
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
          (status && status.clockedIn) || (rtStatus && rtStatus.clockedIn)
            ? h('span', { className: 'badge badge-success' }, I.check(), ' Clocked In')
            : h('span', { className: 'badge badge-neutral' }, I.clock(), ' Clocked Out'),
          status && status.lastClockIn && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Since: ' + new Date(status.lastClockIn).toLocaleString()),
          status && status.totalHoursToday != null && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Hours today: ' + Number(status.totalHoursToday).toFixed(1))
        ),
        // Real-time activity
        rtStatus && rtStatus.currentActivity && h('div', { style: { marginTop: 10, padding: 8, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 } },
          h('strong', null, 'Currently: '), rtStatus.currentActivity.detail || rtStatus.currentActivity.type,
          rtStatus.currentActivity.tool && h('span', { style: { color: 'var(--text-muted)', marginLeft: 8 } }, '(' + rtStatus.currentActivity.tool + ')')
        )
      )
    ),

    // ─── Schedule Card ──────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Schedule', h(HelpButton, { label: 'Schedule' },
          h('p', null, 'Define when this agent is active. Supports standard hours (e.g., 9-5 M-F), shift patterns, or custom schedules.'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Enforce Clock-In/Out'), ' — Agent must be clocked in to work.'),
            h('li', null, h('strong', null, 'Auto-Wake'), ' — Automatically start the agent at schedule start.'),
            h('li', null, h('strong', null, 'Off-Hours Action'), ' — Pause, stop, or queue work outside schedule.')
          )
        )),
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
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Task Queue', h(HelpButton, { label: 'Task Queue' },
          h('p', null, 'Manually assign tasks to this agent. Tasks have priority (urgent/high/normal/low) and type (email/research/communication/general). The agent processes tasks based on priority order.')
        )),
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

    // ─── Centralized Task Pipeline ─────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Task Pipeline', h(HelpButton, { label: 'Task Pipeline' },
          h('p', null, 'Centralized task pipeline for this agent. Shows all tasks automatically recorded when the agent is spawned for work — including status, duration, model used, and results.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Tasks update in real-time via SSE. Click any task for full details. This is separate from the manual Task Queue above — pipeline tasks are created automatically by the system.')
        ))
      ),
      h('div', { className: 'card-body' },
        h(AgentTaskPipeline, { agentId: agentId })
      )
    ),

    // ─── Clock History ──────────────────────────────────
    (function() {
      // Filter + search
      var filtered = clockRecords.filter(function(rec) {
        var recType = rec.type || rec.action || 'clock-in';
        var isClockIn = recType === 'clock-in' || recType === 'clockIn';
        if (clockFilter === 'in' && !isClockIn) return false;
        if (clockFilter === 'out' && isClockIn) return false;
        if (clockSearch) {
          var s = clockSearch.toLowerCase();
          var recTime = rec.timestamp || rec.createdAt || rec.time || '';
          var note = rec.note || rec.reason || rec.source || '';
          return recTime.toLowerCase().includes(s) || recType.toLowerCase().includes(s) || note.toLowerCase().includes(s);
        }
        return true;
      });
      var totalFiltered = filtered.length;
      var totalPages = Math.ceil(totalFiltered / CLOCK_PAGE_SIZE) || 1;
      var safePage = Math.min(clockPage, totalPages - 1);
      var paged = filtered.slice(safePage * CLOCK_PAGE_SIZE, (safePage + 1) * CLOCK_PAGE_SIZE);

      return h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Clock History', h(HelpButton, { label: 'Clock History' },
            h('p', null, 'Complete record of all clock-in and clock-out events for this agent. Useful for tracking work hours, debugging scheduling issues, and generating time reports. Click any record for details.')
          )),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, totalFiltered + ' record' + (totalFiltered !== 1 ? 's' : ''))
        ),
        // Filters
        h('div', { style: { display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' } },
          h('input', {
            type: 'text', placeholder: 'Search records...',
            value: clockSearch,
            onInput: function(e) { setClockSearch(e.target.value); setClockPage(0); },
            style: { flex: '1 1 180px', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 12, minWidth: 140, outline: 'none' }
          }),
          h('select', {
            value: clockFilter,
            onChange: function(e) { setClockFilter(e.target.value); setClockPage(0); },
            style: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', outline: 'none' }
          },
            h('option', { value: 'all' }, 'All Types'),
            h('option', { value: 'in' }, 'Clock In'),
            h('option', { value: 'out' }, 'Clock Out')
          )
        ),
        paged.length > 0
          ? h('div', { className: 'card-body-flush' },
              h('table', { className: 'data-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Time'),
                    h('th', null, 'Type'),
                    h('th', null, 'Duration'),
                    h('th', null, 'Source'),
                    h('th', null, 'Note')
                  )
                ),
                h('tbody', null,
                  paged.map(function(rec, i) {
                    var recTime = rec.timestamp || rec.createdAt || rec.time;
                    var recType = rec.type || rec.action || 'clock-in';
                    var isClockIn = recType === 'clock-in' || recType === 'clockIn';
                    return h('tr', { key: rec.id || i, onClick: function() { setSelectedRecord(rec); }, style: { cursor: 'pointer' } },
                      h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, recTime ? new Date(recTime).toLocaleString() : '-'),
                      h('td', null, h('span', { className: isClockIn ? 'badge badge-success' : 'badge badge-neutral' }, isClockIn ? 'Clock In' : 'Clock Out')),
                      h('td', { style: { fontSize: 12 } }, rec.duration || rec.durationMinutes ? (rec.durationMinutes || rec.duration) + ' min' : '-'),
                      h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, rec.source || rec.triggeredBy || '-'),
                      h('td', { style: { fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, rec.note || rec.reason || '-')
                    );
                  })
                )
              ),
              // Pagination
              totalPages > 1 && h('div', {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }
              },
                h('span', null, 'Showing ' + (safePage * CLOCK_PAGE_SIZE + 1) + '-' + Math.min((safePage + 1) * CLOCK_PAGE_SIZE, totalFiltered) + ' of ' + totalFiltered),
                h('div', { style: { display: 'flex', gap: 4 } },
                  h('button', {
                    className: 'btn btn-ghost btn-sm', disabled: safePage === 0,
                    onClick: function() { setClockPage(function(p) { return Math.max(0, p - 1); }); }
                  }, '\u2039 Prev'),
                  h('span', { style: { padding: '4px 8px' } }, (safePage + 1) + ' / ' + totalPages),
                  h('button', {
                    className: 'btn btn-ghost btn-sm', disabled: safePage >= totalPages - 1,
                    onClick: function() { setClockPage(function(p) { return Math.min(totalPages - 1, p + 1); }); }
                  }, 'Next \u203A')
                )
              )
            )
          : h('div', { className: 'card-body' },
              h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } },
                clockSearch || clockFilter !== 'all' ? 'No matching records.' : 'No clock records.')
            )
      );
    })(),

    // ─── Clock Record Detail Modal ──────────────────────
    selectedRecord && h('div', { className: 'modal-overlay', onClick: function() { setSelectedRecord(null); } },
      h('div', { className: 'modal', style: { maxWidth: 500 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Clock Record Detail'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setSelectedRecord(null); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            (function() {
              var rec = selectedRecord;
              var recTime = rec.timestamp || rec.createdAt || rec.time;
              var recType = rec.type || rec.action || 'clock-in';
              var isClockIn = recType === 'clock-in' || recType === 'clockIn';
              return h(Fragment, null,
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Type'),
                  h('span', { className: isClockIn ? 'badge badge-success' : 'badge badge-neutral' }, isClockIn ? 'Clock In' : 'Clock Out')
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Time'),
                  h('div', { style: { fontSize: 14, fontWeight: 500 } }, recTime ? new Date(recTime).toLocaleString() : '-')
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Duration'),
                  h('div', null, rec.duration || rec.durationMinutes ? (rec.durationMinutes || rec.duration) + ' min' : '-')
                ),
                h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Source'),
                  h('div', null, rec.source || rec.triggeredBy || 'Manual')
                ),
                rec.ip && h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'IP Address'),
                  h('div', { style: { fontFamily: 'monospace', fontSize: 13 } }, rec.ip)
                ),
                rec.sessionId && h('div', null,
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Session ID'),
                  h('div', { style: { fontFamily: 'monospace', fontSize: 11 } }, rec.sessionId)
                )
              );
            })()
          ),
          selectedRecord.note || selectedRecord.reason ? h('div', { style: { marginTop: 16 } },
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Note'),
            h('div', { style: { padding: 10, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, whiteSpace: 'pre-wrap' } }, selectedRecord.note || selectedRecord.reason)
          ) : null,
          selectedRecord.metadata || selectedRecord.data ? h('div', { style: { marginTop: 16 } },
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Metadata'),
            h('pre', { style: { padding: 10, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, overflow: 'auto', maxHeight: 200 } },
              JSON.stringify(selectedRecord.metadata || selectedRecord.data, null, 2))
          ) : null
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-secondary', onClick: function() { setSelectedRecord(null); } }, 'Close')
        )
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

