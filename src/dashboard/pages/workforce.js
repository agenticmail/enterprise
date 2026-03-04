import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, buildAgentEmailMap, resolveAgentEmail, buildAgentDataMap, renderAgentBadge, getOrgId , apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { TimezoneSelect } from '../components/timezones.js';
import { DetailModal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

export function WorkforcePage() {
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
  const { toast } = useApp();
  const [tab, setTab] = useState('overview');
  const [status, setStatus] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [clockRecords, setClockRecords] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [budgetData, setBudgetData] = useState(null);
  const [schedForm, setSchedForm] = useState({
    agentId: '', timezone: 'UTC', scheduleType: 'standard',
    config: { standardHours: { start: '09:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] } },
    enforceClockIn: true, enforceClockOut: true, autoWakeEnabled: true,
    offHoursAction: 'pause', gracePeriodMinutes: 5, enabled: true,
  });
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [taskForm, setTaskForm] = useState({ agentId: '', title: '', description: '', priority: 'normal', type: 'new' });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [editingBudgetAgent, setEditingBudgetAgent] = useState(null);
  const [budgetForm, setBudgetForm] = useState({ dailyTokens: 0, monthlyTokens: 0, dailyCost: 0, monthlyCost: 0, enabled: true });
  const [agents, setAgents] = useState([]);

  // History tab filters
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPerPage, setHistoryPerPage] = useState(10);
  const [historySearch, setHistorySearch] = useState('');
  const [historyEventFilter, setHistoryEventFilter] = useState('');
  const [historyAgentFilter, setHistoryAgentFilter] = useState('');

  // Task tab filters
  const [taskPage, setTaskPage] = useState(1);
  const [taskPerPage, setTaskPerPage] = useState(10);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('');
  const [taskAgentFilter, setTaskAgentFilter] = useState('');

  // Schedule tab filters
  const [schedPage, setSchedPage] = useState(1);
  const [schedPerPage, setSchedPerPage] = useState(10);
  const [schedSearch, setSchedSearch] = useState('');
  const [schedTypeFilter, setSchedTypeFilter] = useState('');
  const [schedStatusFilter, setSchedStatusFilter] = useState('');

  // Budget tab filters
  const [budgetPage, setBudgetPage] = useState(1);
  const [budgetPerPage, setBudgetPerPage] = useState(10);
  const [budgetSearch, setBudgetSearch] = useState('');
  const [budgetStatusFilter, setBudgetStatusFilter] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  const formatTime = (iso) => iso ? new Date(iso).toLocaleString() : '-';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const formatDays = (days) => days?.map(d => dayNames[d]).join(', ') || '-';

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, schedulesRes, budgetRes, recordsRes] = await Promise.all([
        engineCall('/workforce/status?orgId=' + (orgCtx.selectedOrgId || getOrgId())),
        engineCall('/workforce/schedules?orgId=' + (orgCtx.selectedOrgId || getOrgId())),
        engineCall('/workforce/budget-overview?orgId=' + (orgCtx.selectedOrgId || getOrgId())),
        engineCall('/workforce/clock-records?limit=50&orgId=' + (orgCtx.selectedOrgId || getOrgId())),
      ]);
      setStatus(statusRes);
      setSchedules(schedulesRes.schedules || []);
      setBudgetData(budgetRes);
      setClockRecords(recordsRes.records || []);
      engineCall('/agents?orgId=' + (orgCtx.selectedOrgId || getOrgId())).then(d => setAgents(d.agents || [])).catch(() => {});
    } catch (err) { toast('Failed to load workforce data', 'error'); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // --- Actions ---
  const handleClockIn = async (agentId) => {
    try {
      await engineCall('/workforce/clock-in/' + agentId, { method: 'POST' });
      toast('Agent clocked in', 'success');
      loadData();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleClockOut = async (agentId) => {
    try {
      await engineCall('/workforce/clock-out/' + agentId, { method: 'POST' });
      toast('Agent clocked out', 'success');
      loadData();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveSchedule = async () => {
    try {
      if (editingScheduleId) {
        await engineCall('/workforce/schedules/' + editingScheduleId, { method: 'PUT', body: JSON.stringify(schedForm) });
        toast('Schedule updated', 'success');
      } else {
        await engineCall('/workforce/schedules', { method: 'POST', body: JSON.stringify(schedForm) });
        toast('Schedule created', 'success');
      }
      setShowScheduleModal(false);
      setEditingScheduleId(null);
      loadData();
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteSchedule = async (id) => {
    try {
      await engineCall('/workforce/schedules/' + id, { method: 'DELETE' });
      toast('Schedule deleted', 'success');
      loadData();
    } catch (err) { toast(err.message, 'error'); }
  };

  const openEditSchedule = (sched) => {
    setEditingScheduleId(sched.id);
    setSchedForm({
      agentId: sched.agentId || '', timezone: sched.timezone || 'UTC', scheduleType: sched.scheduleType || 'standard',
      config: sched.config || { standardHours: { start: '09:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] } },
      enforceClockIn: sched.enforceClockIn !== false, enforceClockOut: sched.enforceClockOut !== false,
      autoWakeEnabled: sched.autoWakeEnabled !== false, offHoursAction: sched.offHoursAction || 'pause',
      gracePeriodMinutes: sched.gracePeriodMinutes || 5, enabled: sched.enabled !== false,
    });
    setShowScheduleModal(true);
  };

  const openNewSchedule = () => {
    setEditingScheduleId(null);
    setSchedForm({
      agentId: '', timezone: 'UTC', scheduleType: 'standard',
      config: { standardHours: { start: '09:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] } },
      enforceClockIn: true, enforceClockOut: true, autoWakeEnabled: true,
      offHoursAction: 'pause', gracePeriodMinutes: 5, enabled: true,
    });
    setShowScheduleModal(true);
  };

  const addTask = async () => {
    try {
      await engineCall('/workforce/tasks', { method: 'POST', body: JSON.stringify(taskForm) });
      toast('Task added', 'success');
      setShowTaskForm(false);
      setTaskForm({ agentId: '', title: '', description: '', priority: 'normal', type: 'new' });
      loadTasks();
    } catch (err) { toast(err.message, 'error'); }
  };

  const loadTasks = async () => {
    try {
      const res = await engineCall('/workforce/tasks');
      setTasks(res.tasks || []);
    } catch (err) { /* ignore */ }
  };

  const completeTask = async (taskId) => {
    try {
      await engineCall('/workforce/tasks/' + taskId + '/complete', { method: 'POST' });
      toast('Task completed', 'success');
      loadTasks();
    } catch (err) { toast(err.message, 'error'); }
  };

  const cancelTask = async (taskId) => {
    try {
      await engineCall('/workforce/tasks/' + taskId + '/cancel', { method: 'POST' });
      toast('Task cancelled', 'success');
      loadTasks();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveBudgetCaps = async (agentId) => {
    try {
      await engineCall('/agents/' + agentId + '/budget', { method: 'PUT', body: JSON.stringify(budgetForm) });
      toast('Budget caps updated', 'success');
      setEditingBudgetAgent(null);
      loadData();
    } catch (err) { toast(err.message, 'error'); }
  };

  useEffect(() => {
    if (tab === 'tasks') loadTasks();
  }, [tab]);

  const toggleDay = (day) => {
    const days = schedForm.config?.standardHours?.daysOfWeek || [];
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
    setSchedForm({ ...schedForm, config: { ...schedForm.config, standardHours: { ...schedForm.config.standardHours, daysOfWeek: next } } });
  };

  const addShift = () => {
    const shifts = schedForm.config?.shifts || [];
    setSchedForm({ ...schedForm, config: { ...schedForm.config, shifts: [...shifts, { name: 'Shift ' + (shifts.length + 1), start: '09:00', end: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }] } });
  };

  const updateShift = (idx, field, value) => {
    const shifts = [...(schedForm.config?.shifts || [])];
    shifts[idx] = { ...shifts[idx], [field]: value };
    setSchedForm({ ...schedForm, config: { ...schedForm.config, shifts } });
  };

  const removeShift = (idx) => {
    const shifts = (schedForm.config?.shifts || []).filter((_, i) => i !== idx);
    setSchedForm({ ...schedForm, config: { ...schedForm.config, shifts } });
  };

  // --- Progress bar helper ---
  const progressBar = (used, cap, label) => {
    const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
    const color = pct > 80 ? 'var(--danger)' : pct > 50 ? 'var(--warning)' : 'var(--success)';
    return h('div', { style: { marginBottom: 8 } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 } },
        h('span', null, label),
        h('span', null, used.toLocaleString() + ' / ' + cap.toLocaleString())
      ),
      h('div', { style: { height: 8, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden' } },
        h('div', { style: { height: '100%', width: pct + '%', background: color, borderRadius: 4, transition: 'width 0.3s' } })
      )
    );
  };

  // --- Stat card helper ---
  const statCard = (label, value, color) => h('div', { className: 'card', style: { flex: 1, minWidth: 160, padding: 20, textAlign: 'center' } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 } },
      h('div', { style: { width: 10, height: 10, borderRadius: '50%', background: color } }),
      h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, label)
    ),
    h('div', { style: { fontSize: 28, fontWeight: 700 } }, value)
  );

  // --- Badge helpers ---
  const statusBadge = (s) => {
    if (s === 'clocked_in') return h('span', { className: 'badge', style: { background: 'var(--success)', color: '#fff' } }, 'Clocked In');
    if (s === 'clocked_out') return h('span', { className: 'badge', style: { background: 'var(--warning)', color: '#fff' } }, 'Clocked Out');
    return h('span', { className: 'badge', style: { background: 'var(--text-muted)', color: '#fff' } }, 'No Schedule');
  };

  const typeBadge = (t) => {
    const colors = { continue: 'var(--info)', new: 'var(--primary)', scheduled: 'var(--warning)', delegation: 'var(--success)' };
    return h('span', { className: 'badge', style: { background: colors[t] || 'var(--text-muted)', color: '#fff' } }, t || 'unknown');
  };

  const eventBadge = (t) => {
    const map = { clock_in: ['Clocked In', 'var(--success)'], clock_out: ['Clocked Out', 'var(--warning)'], auto_wake: ['Auto Wake', 'var(--info)'], auto_pause: ['Auto Pause', 'var(--text-muted)'] };
    const [label, color] = map[t] || [t, 'var(--text-muted)'];
    return h('span', { className: 'badge', style: { background: color, color: '#fff' } }, label);
  };

  const schedTypeBadge = (t) => {
    const colors = { standard: 'var(--primary)', shift: 'var(--warning)', custom: 'var(--info)' };
    return h('span', { className: 'badge', style: { background: colors[t] || 'var(--text-muted)', color: '#fff' } }, (t || 'standard').charAt(0).toUpperCase() + (t || 'standard').slice(1));
  };

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  if (loading) return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', null, 'Workforce Management')),
    h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading workforce data...')
  );

  // --- Tab definitions ---
  const tabs = [
    { key: 'overview', label: 'Overview', icon: I.dashboard },
    { key: 'schedules', label: 'Schedules', icon: I.calendar },
    { key: 'tasks', label: 'Task Queue', icon: I.workflow },
    { key: 'budgets', label: 'Budgets', icon: I.chart },
    { key: 'history', label: 'Clock History', icon: I.clock },
  ];

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'page-inner' },
    h(orgCtx.Switcher),
    h('div', { className: 'page-header' },
      h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Workforce Management', h(KnowledgeLink, { page: 'workforce' }), h(HelpButton, { label: 'Workforce Management' },
        h('p', null, 'Manage your agents like employees — set work schedules, assign tasks, track budgets, and monitor clock-in/out history.'),
        h('h4', { style: _h4 }, 'Key sections'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Overview'), ' — See which agents are clocked in, off duty, or unscheduled.'),
          h('li', null, h('strong', null, 'Schedules'), ' — Define working hours, shifts, and auto-wake rules.'),
          h('li', null, h('strong', null, 'Task Queue'), ' — Assign and track tasks for specific agents.'),
          h('li', null, h('strong', null, 'Budgets'), ' — Set token caps to control agent spending.'),
          h('li', null, h('strong', null, 'Clock History'), ' — Audit trail of all clock-in/out events.')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use schedules with auto-wake to have agents automatically start working at their scheduled time each day.')
      )),
      h('button', { className: 'btn btn-ghost', onClick: loadData }, I.refresh(), ' Refresh')
    ),
    // Tab bar
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      tabs.map(t => h('button', { key: t.key, className: 'tab' + (tab === t.key ? ' active' : ''), onClick: () => setTab(t.key), style: { display: 'flex', alignItems: 'center', gap: 6 } }, t.icon(), t.label))
    ),

    // ===== OVERVIEW TAB =====
    tab === 'overview' && h(Fragment, null,
      h('div', { style: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' } },
        statCard('Agents Clocked In', status?.totalClocked || 0, 'var(--success)'),
        statCard('Agents Off Duty', status?.totalOff || 0, 'var(--warning)'),
        statCard('Unscheduled', status?.totalUnscheduled || 0, 'var(--text-muted)')
      ),
      h('div', { className: 'card' },
        h('table', { className: 'data-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Agent'),
            h('th', null, 'Status'),
            h('th', null, 'Schedule'),
            h('th', null, 'Next Event'),
            h('th', null, 'Actions')
          )),
          h('tbody', null,
            (!status?.agents || status.agents.length === 0)
              ? h('tr', { key: '_empty' }, h('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No agents found'))
              : status.agents.map(a => h('tr', { key: a.agentId },
                h('td', null, renderAgentBadge(a.agentId || a.id, agentData)),
                h('td', null, statusBadge(a.clockStatus || a.status)),
                h('td', null, a.schedule
                  ? h(Fragment, null,
                      schedTypeBadge(a.schedule.scheduleType || a.schedule.type || 'standard'),
                      ' ',
                      a.schedule.scheduleType === 'standard' && a.schedule.config?.standardHours
                        ? (a.schedule.config.standardHours.start || '09:00') + ' - ' + (a.schedule.config.standardHours.end || '17:00')
                        : a.schedule.scheduleType === 'shift' && a.schedule.config?.shifts?.length
                          ? a.schedule.config.shifts[0].start + ' - ' + a.schedule.config.shifts[0].end
                          : (a.schedule.start || '-') + ' - ' + (a.schedule.end || '-')
                    )
                  : h('span', { style: { color: 'var(--text-muted)' } }, 'None')),
                h('td', null, a.nextEvent
                  ? h(Fragment, null,
                      h('span', { className: 'badge', style: { background: a.nextEvent.type === 'clock_in' ? 'var(--success)' : 'var(--warning)', color: '#fff', marginRight: 4 } }, a.nextEvent.type === 'clock_in' ? 'Clock In' : 'Clock Out'),
                      formatTime(a.nextEvent.at)
                    )
                  : '-'),
                h('td', { style: { display: 'flex', gap: 4 } },
                  (a.clockStatus || a.status) !== 'clocked_in' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => handleClockIn(a.agentId || a.id) }, I.play(), ' Clock In'),
                  (a.clockStatus || a.status) === 'clocked_in' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => handleClockOut(a.agentId || a.id) }, I.pause(), ' Clock Out')
                )
              ))
          )
        )
      )
    ),

    // ===== SCHEDULES TAB =====
    tab === 'schedules' && (function() {
      var filteredScheds = schedules.filter(function(s) {
        if (schedSearch) {
          var name = (agentData[s.agentId]?.name || agentData[s.agentId]?.displayName || s.agentId || '').toLowerCase();
          if (name.indexOf(schedSearch.toLowerCase()) === -1) return false;
        }
        if (schedTypeFilter && (s.scheduleType || 'standard') !== schedTypeFilter) return false;
        if (schedStatusFilter === 'enabled' && s.enabled === false) return false;
        if (schedStatusFilter === 'disabled' && s.enabled !== false) return false;
        return true;
      });
      var sTotal = filteredScheds.length;
      var sStart = (schedPage - 1) * schedPerPage;
      var sEnd = Math.min(sStart + schedPerPage, sTotal);
      var pageScheds = filteredScheds.slice(sStart, sEnd);
      return h(Fragment, null,
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { className: 'btn btn-primary', onClick: openNewSchedule }, I.plus(), ' Create Schedule'),
        h('input', { className: 'input', style: { flex: 1, minWidth: 200 }, placeholder: 'Search agent name...', value: schedSearch, onChange: function(e) { setSchedSearch(e.target.value); setSchedPage(1); } }),
        h('select', { className: 'input', style: { width: 150 }, value: schedTypeFilter, onChange: function(e) { setSchedTypeFilter(e.target.value); setSchedPage(1); } },
          h('option', { value: '' }, 'All Types'),
          h('option', { value: 'standard' }, 'Standard'),
          h('option', { value: 'shift' }, 'Shift'),
          h('option', { value: 'custom' }, 'Custom')
        ),
        h('select', { className: 'input', style: { width: 140 }, value: schedStatusFilter, onChange: function(e) { setSchedStatusFilter(e.target.value); setSchedPage(1); } },
          h('option', { value: '' }, 'All Status'),
          h('option', { value: 'enabled' }, 'Enabled'),
          h('option', { value: 'disabled' }, 'Disabled')
        ),
        h('select', { className: 'input', style: { width: 80 }, value: schedPerPage, onChange: function(e) { setSchedPerPage(Number(e.target.value)); setSchedPage(1); } },
          h('option', { value: 10 }, '10'), h('option', { value: 25 }, '25'), h('option', { value: 50 }, '50')
        )
      ),
      sTotal === 0
        ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No schedules configured')
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 } },
          pageScheds.map(s => h('div', { key: s.id, className: 'card', style: { padding: 20 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
              renderAgentBadge(s.agentId, agentData),
              schedTypeBadge(s.scheduleType)
            ),
            h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 } },
              s.scheduleType === 'standard' && s.config?.standardHours
                ? formatDays(s.config.standardHours.daysOfWeek) + ' ' + (s.config.standardHours.start || '09:00') + ' - ' + (s.config.standardHours.end || '17:00')
                : s.scheduleType === 'shift' && s.config?.shifts
                  ? s.config.shifts.map(sh => sh.name + ': ' + sh.start + '-' + sh.end).join(', ')
                  : 'Custom schedule'
            ),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } }, 'Timezone: ' + (s.timezone || 'UTC')),
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, marginBottom: 12 } },
              s.enforceClockIn !== false && h('span', { className: 'badge', style: { background: 'var(--bg-tertiary)' } }, 'Enforce Clock-In'),
              s.enforceClockOut !== false && h('span', { className: 'badge', style: { background: 'var(--bg-tertiary)' } }, 'Enforce Clock-Out'),
              s.autoWakeEnabled !== false && h('span', { className: 'badge', style: { background: 'var(--bg-tertiary)' } }, 'Auto-Wake'),
              h('span', { className: 'badge', style: { background: 'var(--bg-tertiary)' } }, 'Off-hours: ' + (s.offHoursAction || 'pause'))
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', { className: 'btn btn-ghost btn-sm', onClick: () => openEditSchedule(s) }, 'Edit'),
              h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: () => deleteSchedule(s.id) }, I.trash(), ' Delete')
            )
          ))
        ),
      sTotal > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Showing ' + (sStart + 1) + '-' + sEnd + ' of ' + sTotal),
        h('div', { style: { display: 'flex', gap: 4 } },
          h('button', { className: 'btn btn-ghost btn-sm', disabled: schedPage <= 1, onClick: function() { setSchedPage(schedPage - 1); } }, 'Previous'),
          h('button', { className: 'btn btn-ghost btn-sm', disabled: sEnd >= sTotal, onClick: function() { setSchedPage(schedPage + 1); } }, 'Next')
        )
      )
    ); })(),

    // ===== TASK QUEUE TAB =====
    tab === 'tasks' && (function() {
      var filteredTasks = tasks.filter(function(t) {
        if (taskSearch) {
          var s = taskSearch.toLowerCase();
          var title = (t.title || '').toLowerCase();
          var desc = (t.description || '').toLowerCase();
          if (title.indexOf(s) === -1 && desc.indexOf(s) === -1) return false;
        }
        if (taskStatusFilter && (t.status || '') !== taskStatusFilter) return false;
        if (taskPriorityFilter && (t.priority || 'normal') !== taskPriorityFilter) return false;
        if (taskAgentFilter && t.agentId !== taskAgentFilter) return false;
        return true;
      });
      var tTotal = filteredTasks.length;
      var tStart = (taskPage - 1) * taskPerPage;
      var tEnd = Math.min(tStart + taskPerPage, tTotal);
      var pageTasks = filteredTasks.slice(tStart, tEnd);
      return h(Fragment, null,
      h('div', { style: { marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { className: 'btn btn-primary', onClick: function() { setShowTaskForm(!showTaskForm); } }, I.plus(), ' Add Task'),
        h('button', { className: 'btn btn-ghost', onClick: loadTasks }, I.refresh(), ' Refresh'),
        h('input', { className: 'input', style: { flex: 1, minWidth: 200 }, placeholder: 'Search title, description...', value: taskSearch, onChange: function(e) { setTaskSearch(e.target.value); setTaskPage(1); } }),
        h('select', { className: 'input', style: { width: 140 }, value: taskStatusFilter, onChange: function(e) { setTaskStatusFilter(e.target.value); setTaskPage(1); } },
          h('option', { value: '' }, 'All Status'),
          h('option', { value: 'pending' }, 'Pending'),
          h('option', { value: 'in_progress' }, 'In Progress'),
          h('option', { value: 'completed' }, 'Completed'),
          h('option', { value: 'cancelled' }, 'Cancelled')
        ),
        h('select', { className: 'input', style: { width: 120 }, value: taskPriorityFilter, onChange: function(e) { setTaskPriorityFilter(e.target.value); setTaskPage(1); } },
          h('option', { value: '' }, 'All Priority'),
          h('option', { value: 'low' }, 'Low'),
          h('option', { value: 'normal' }, 'Normal'),
          h('option', { value: 'high' }, 'High'),
          h('option', { value: 'critical' }, 'Critical')
        ),
        h('select', { className: 'input', style: { width: 160 }, value: taskAgentFilter, onChange: function(e) { setTaskAgentFilter(e.target.value); setTaskPage(1); } },
          h('option', { value: '' }, 'All Agents'),
          agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config?.displayName || a.config?.name || a.name || a.id); })
        ),
        h('select', { className: 'input', style: { width: 80 }, value: taskPerPage, onChange: function(e) { setTaskPerPage(Number(e.target.value)); setTaskPage(1); } },
          h('option', { value: 10 }, '10'), h('option', { value: 25 }, '25'), h('option', { value: 50 }, '50')
        )
      ),
      showTaskForm && h('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Agent'),
            h('select', { className: 'input', value: taskForm.agentId, onChange: e => setTaskForm({ ...taskForm, agentId: e.target.value }) },
              h('option', { value: '' }, '-- Select Agent --'),
              agents.map(a => h('option', { key: a.id, value: a.id }, (a.config?.displayName || a.config?.name || a.name || 'Agent') + (a.config?.email?.address ? ' (' + a.config.email.address + ')' : '')))
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Title'),
            h('input', { className: 'input', value: taskForm.title, onChange: e => setTaskForm({ ...taskForm, title: e.target.value }), placeholder: 'Task title...' })
          ),
          h('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            h('label', { className: 'form-label' }, 'Description'),
            h('input', { className: 'input', value: taskForm.description, onChange: e => setTaskForm({ ...taskForm, description: e.target.value }), placeholder: 'Task description...' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Priority'),
            h('select', { className: 'input', value: taskForm.priority, onChange: e => setTaskForm({ ...taskForm, priority: e.target.value }) },
              h('option', { value: 'low' }, 'Low'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'high' }, 'High'), h('option', { value: 'critical' }, 'Critical'))
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Type'),
            h('select', { className: 'input', value: taskForm.type, onChange: e => setTaskForm({ ...taskForm, type: e.target.value }) },
              h('option', { value: 'new' }, 'New'), h('option', { value: 'continue' }, 'Continue'), h('option', { value: 'scheduled' }, 'Scheduled'), h('option', { value: 'delegation' }, 'Delegation'))
          )
        ),
        h('div', { style: { marginTop: 12, display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-primary', onClick: addTask }, 'Add Task'),
          h('button', { className: 'btn btn-ghost', onClick: () => setShowTaskForm(false) }, 'Cancel')
        )
      ),
      tTotal === 0
        ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No tasks in queue')
        : h('div', { className: 'card' },
          h('table', { className: 'data-table' },
            h('thead', null, h('tr', null,
              h('th', null, 'Agent'), h('th', null, 'Type'), h('th', null, 'Title'), h('th', null, 'Priority'), h('th', null, 'Status'), h('th', null, 'Created'), h('th', null, 'Actions')
            )),
            h('tbody', null,
              pageTasks.map(function(t) { return h('tr', { key: t.id },
                h('td', null, renderAgentBadge(t.agentId, agentData)),
                h('td', null, typeBadge(t.type)),
                h('td', null, h('strong', null, t.title || '-')),
                h('td', null, h('span', { className: 'badge', style: { background: t.priority === 'critical' ? 'var(--danger)' : t.priority === 'high' ? 'var(--warning)' : 'var(--bg-tertiary)' } }, t.priority || 'normal')),
                h('td', null, t.status || '-'),
                h('td', null, formatTime(t.createdAt)),
                h('td', { style: { display: 'flex', gap: 4 } },
                  h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { completeTask(t.id); } }, I.check(), ' Done'),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function() { cancelTask(t.id); } }, I.x(), ' Cancel')
                )
              ); })
            )
          )
        ),
      tTotal > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Showing ' + (tStart + 1) + '-' + tEnd + ' of ' + tTotal),
        h('div', { style: { display: 'flex', gap: 4 } },
          h('button', { className: 'btn btn-ghost btn-sm', disabled: taskPage <= 1, onClick: function() { setTaskPage(taskPage - 1); } }, 'Previous'),
          h('button', { className: 'btn btn-ghost btn-sm', disabled: tEnd >= tTotal, onClick: function() { setTaskPage(taskPage + 1); } }, 'Next')
        )
      )
    ); })(),

    // ===== BUDGETS TAB =====
    tab === 'budgets' && (function() {
      var allBudgets = budgetData?.agentBudgets || [];
      var filteredBudgets = allBudgets.filter(function(a) {
        var name = (agentData[a.id]?.name || agentData[a.id]?.displayName || a.name || a.id || '').toLowerCase();
        if (budgetSearch && name.indexOf(budgetSearch.toLowerCase()) === -1) return false;
        if (budgetStatusFilter === 'over') {
          var over = (a.budget?.dailyTokens && a.usage?.tokensToday > a.budget.dailyTokens) || (a.budget?.dailyCost && a.usage?.costToday > a.budget.dailyCost);
          if (!over) return false;
        }
        if (budgetStatusFilter === 'under') {
          var hasBudget = a.budget && (a.budget.dailyTokens || a.budget.monthlyTokens || a.budget.dailyCost || a.budget.monthlyCost);
          var isOver = (a.budget?.dailyTokens && a.usage?.tokensToday > a.budget.dailyTokens) || (a.budget?.dailyCost && a.usage?.costToday > a.budget.dailyCost);
          if (!hasBudget || isOver) return false;
        }
        if (budgetStatusFilter === 'none') {
          var has = a.budget && (a.budget.dailyTokens || a.budget.monthlyTokens || a.budget.dailyCost || a.budget.monthlyCost);
          if (has) return false;
        }
        return true;
      });
      var bTotal = filteredBudgets.length;
      var bStart = (budgetPage - 1) * budgetPerPage;
      var bEnd = Math.min(bStart + budgetPerPage, bTotal);
      var pageBudgets = filteredBudgets.slice(bStart, bEnd);
      return h(Fragment, null,
        // Summary stats
        budgetData && h('div', { style: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' } },
          statCard('Total Daily Tokens', (budgetData.totalDailyTokens || 0).toLocaleString(), 'var(--primary)'),
          statCard('Total Daily Cost', '$' + (budgetData.totalDailyCost || 0).toFixed(4), 'var(--warning)')
        ),
        // Filter bar
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
          h('input', { className: 'input', style: { flex: 1, minWidth: 200 }, placeholder: 'Search agent name...', value: budgetSearch, onChange: function(e) { setBudgetSearch(e.target.value); setBudgetPage(1); } }),
          h('select', { className: 'input', style: { width: 160 }, value: budgetStatusFilter, onChange: function(e) { setBudgetStatusFilter(e.target.value); setBudgetPage(1); } },
            h('option', { value: '' }, 'All Budgets'),
            h('option', { value: 'over' }, 'Over Budget'),
            h('option', { value: 'under' }, 'Under Budget'),
            h('option', { value: 'none' }, 'No Budget Set')
          ),
          h('select', { className: 'input', style: { width: 80 }, value: budgetPerPage, onChange: function(e) { setBudgetPerPage(Number(e.target.value)); setBudgetPage(1); } },
            h('option', { value: 10 }, '10'), h('option', { value: 25 }, '25'), h('option', { value: 50 }, '50')
          )
        ),
        bTotal === 0
          ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No budget data available')
          : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 } },
            pageBudgets.map(function(a) {
              var aid = a.id;
              var agentInfo = agentData[aid] || {};
              return h('div', { key: aid, className: 'card', style: { padding: 20 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
                    agentInfo.avatar
                      ? h('img', { src: agentInfo.avatar, style: { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } })
                      : h('div', { style: { width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 } }, (agentInfo.name || a.name || 'A').charAt(0).toUpperCase()),
                    h('div', { style: { lineHeight: 1.3 } },
                      h('div', { style: { fontWeight: 600, fontSize: 14 } }, agentInfo.name || a.name || 'Agent'),
                      h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, agentInfo.email || aid.slice(0, 8))
                    )
                  ),
                  editingBudgetAgent === aid
                    ? h('button', { className: 'btn btn-primary btn-sm', onClick: function() { saveBudgetCaps(aid); } }, 'Save')
                    : h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditingBudgetAgent(aid); setBudgetForm({ dailyTokens: a.budget?.dailyTokens || 0, monthlyTokens: a.budget?.monthlyTokens || 0, dailyCost: a.budget?.dailyCost || 0, monthlyCost: a.budget?.monthlyCost || 0, enabled: a.budget?.enabled !== false }); } }, 'Edit Caps')
                ),
                editingBudgetAgent === aid
                  ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                    h('div', { className: 'form-group' },
                      h('label', { className: 'form-label' }, 'Daily Token Cap'),
                      h('input', { className: 'input', type: 'number', value: budgetForm.dailyTokens, onChange: function(e) { setBudgetForm({ ...budgetForm, dailyTokens: parseInt(e.target.value) || 0 }); } })
                    ),
                    h('div', { className: 'form-group' },
                      h('label', { className: 'form-label' }, 'Monthly Token Cap'),
                      h('input', { className: 'input', type: 'number', value: budgetForm.monthlyTokens, onChange: function(e) { setBudgetForm({ ...budgetForm, monthlyTokens: parseInt(e.target.value) || 0 }); } })
                    ),
                    h('div', { className: 'form-group' },
                      h('label', { className: 'form-label' }, 'Daily Cost Cap ($)'),
                      h('input', { className: 'input', type: 'number', step: '0.01', value: budgetForm.dailyCost, onChange: function(e) { setBudgetForm({ ...budgetForm, dailyCost: parseFloat(e.target.value) || 0 }); } })
                    ),
                    h('div', { className: 'form-group' },
                      h('label', { className: 'form-label' }, 'Monthly Cost Cap ($)'),
                      h('input', { className: 'input', type: 'number', step: '0.01', value: budgetForm.monthlyCost, onChange: function(e) { setBudgetForm({ ...budgetForm, monthlyCost: parseFloat(e.target.value) || 0 }); } })
                    ),
                    h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, gridColumn: '1 / -1' } },
                      h('input', { type: 'checkbox', checked: budgetForm.enabled, onChange: function(e) { setBudgetForm({ ...budgetForm, enabled: e.target.checked }); } }),
                      'Budget Enabled'
                    ),
                    h('button', { className: 'btn btn-ghost btn-sm', style: { gridColumn: '1 / -1' }, onClick: function() { setEditingBudgetAgent(null); } }, 'Cancel')
                  )
                  : h(Fragment, null,
                    progressBar(a.usage?.tokensToday || 0, a.budget?.dailyTokens || 0, 'Daily Tokens'),
                    progressBar(a.usage?.tokensMonth || 0, a.budget?.monthlyTokens || 0, 'Monthly Tokens'),
                    h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 } },
                      'Daily cost: $' + (a.usage?.costToday || 0).toFixed(4) + (a.budget?.dailyCost ? ' / $' + a.budget.dailyCost.toFixed(2) : '')
                    ),
                    a.budget?.monthlyCost && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } },
                      'Monthly cost: $' + (a.usage?.costMonth || 0).toFixed(4) + ' / $' + a.budget.monthlyCost.toFixed(2)
                    )
                  )
              );
            })
          ),
        bTotal > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' } },
          h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Showing ' + (bStart + 1) + '-' + bEnd + ' of ' + bTotal),
          h('div', { style: { display: 'flex', gap: 4 } },
            h('button', { className: 'btn btn-ghost btn-sm', disabled: budgetPage <= 1, onClick: function() { setBudgetPage(budgetPage - 1); } }, 'Previous'),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: bEnd >= bTotal, onClick: function() { setBudgetPage(budgetPage + 1); } }, 'Next')
          )
        )
      );
    })(),

    // ===== CLOCK HISTORY TAB =====
    tab === 'history' && (function() {
      var filtered = clockRecords.filter(function(r) {
        if (historySearch) {
          var s = historySearch.toLowerCase();
          var name = (agentData[r.agentId]?.name || agentData[r.agentId]?.displayName || r.agentId || '').toLowerCase();
          var reason = (r.reason || '').toLowerCase();
          var trig = (r.triggeredBy || '').toLowerCase();
          if (name.indexOf(s) === -1 && reason.indexOf(s) === -1 && trig.indexOf(s) === -1) return false;
        }
        if (historyEventFilter && (r.eventType || r.type) !== historyEventFilter) return false;
        if (historyAgentFilter && r.agentId !== historyAgentFilter) return false;
        return true;
      });
      var hTotal = filtered.length;
      var hStart = (historyPage - 1) * historyPerPage;
      var hEnd = Math.min(hStart + historyPerPage, hTotal);
      var pageRecords = filtered.slice(hStart, hEnd);
      return h(Fragment, null,
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
          h('input', { className: 'input', style: { flex: 1, minWidth: 200 }, placeholder: 'Search agent, reason, triggered by...', value: historySearch, onChange: function(e) { setHistorySearch(e.target.value); setHistoryPage(1); } }),
          h('select', { className: 'input', style: { width: 150 }, value: historyEventFilter, onChange: function(e) { setHistoryEventFilter(e.target.value); setHistoryPage(1); } },
            h('option', { value: '' }, 'All Events'),
            h('option', { value: 'clock_in' }, 'Clock In'),
            h('option', { value: 'clock_out' }, 'Clock Out'),
            h('option', { value: 'auto_wake' }, 'Auto Wake'),
            h('option', { value: 'auto_pause' }, 'Auto Pause')
          ),
          h('select', { className: 'input', style: { width: 160 }, value: historyAgentFilter, onChange: function(e) { setHistoryAgentFilter(e.target.value); setHistoryPage(1); } },
            h('option', { value: '' }, 'All Agents'),
            agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config?.displayName || a.config?.name || a.name || a.id); })
          ),
          h('select', { className: 'input', style: { width: 80 }, value: historyPerPage, onChange: function(e) { setHistoryPerPage(Number(e.target.value)); setHistoryPage(1); } },
            h('option', { value: 10 }, '10'), h('option', { value: 25 }, '25'), h('option', { value: 50 }, '50')
          )
        ),
        h('div', { className: 'card' },
          h('table', { className: 'data-table' },
            h('thead', null, h('tr', null,
              h('th', null, 'Time'), h('th', null, 'Agent'), h('th', null, 'Event'), h('th', null, 'Triggered By'), h('th', null, 'Scheduled At'), h('th', null, 'Reason')
            )),
            h('tbody', null,
              pageRecords.length === 0
                ? h('tr', { key: '_empty' }, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No clock records found'))
                : pageRecords.map(function(r, i) { return h('tr', { key: r.id || i, onClick: function() { setSelectedRecord(r); }, style: { cursor: 'pointer' }, title: 'Click to view details' },
                  h('td', null, formatTime(r.timestamp || r.createdAt)),
                  h('td', null, renderAgentBadge(r.agentId, agentData)),
                  h('td', null, eventBadge(r.eventType || r.type)),
                  h('td', null, r.triggeredBy || '-'),
                  h('td', null, r.scheduledAt ? formatTime(r.scheduledAt) : '-'),
                  h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.reason || '-')
                ); })
            )
          )
        ),
        hTotal > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' } },
          h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Showing ' + (hStart + 1) + '-' + hEnd + ' of ' + hTotal),
          h('div', { style: { display: 'flex', gap: 4 } },
            h('button', { className: 'btn btn-ghost btn-sm', disabled: historyPage <= 1, onClick: function() { setHistoryPage(historyPage - 1); } }, 'Previous'),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: hEnd >= hTotal, onClick: function() { setHistoryPage(historyPage + 1); } }, 'Next')
          )
        )
      );
    })(),

    // ===== SCHEDULE EDITOR MODAL =====
    // ===== CLOCK RECORD DETAIL MODAL =====
    selectedRecord && h(DetailModal, {
      title: 'Clock Record Details',
      onClose: function() { setSelectedRecord(null); },
      badge: {
        label: (selectedRecord.eventType || selectedRecord.type || 'unknown').replace(/_/g, ' ').toUpperCase(),
        color: (selectedRecord.eventType || selectedRecord.type) === 'clock_in' ? 'var(--success)' : (selectedRecord.eventType || selectedRecord.type) === 'clock_out' ? 'var(--warning)' : 'var(--info)',
      },
      header: h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        renderAgentBadge(selectedRecord.agentId, agentData)
      ),
      data: {
        'Record ID': selectedRecord.id || '-',
        'Event Type': (selectedRecord.eventType || selectedRecord.type || '-').replace(/_/g, ' '),
        'Agent ID': selectedRecord.agentId || '-',
        'Timestamp': formatTime(selectedRecord.timestamp || selectedRecord.createdAt),
        'Triggered By': selectedRecord.triggeredBy || '-',
        'Scheduled At': selectedRecord.scheduledAt ? formatTime(selectedRecord.scheduledAt) : '-',
        'Reason': selectedRecord.reason || '-',
        'Duration': selectedRecord.duration ? (Math.round(selectedRecord.duration / 60) + ' min') : selectedRecord.durationMs ? (Math.round(selectedRecord.durationMs / 60000) + ' min') : '-',
        'Schedule ID': selectedRecord.scheduleId || '-',
        'IP Address': selectedRecord.ip || selectedRecord.ipAddress || '-',
        'Session ID': selectedRecord.sessionId || '-',
        'Metadata': selectedRecord.metadata ? JSON.stringify(selectedRecord.metadata) : '-',
      },
      exclude: [],
    }),

    showScheduleModal && h('div', { className: 'modal-overlay', onClick: () => { setShowScheduleModal(false); setEditingScheduleId(null); } },
      h('div', { className: 'modal', style: { maxWidth: 560 }, onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' },
          h('h2', null, editingScheduleId ? 'Edit Schedule' : 'Create Schedule'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: () => { setShowScheduleModal(false); setEditingScheduleId(null); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          // Agent
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Agent'),
            h('select', { className: 'input', value: schedForm.agentId, onChange: e => setSchedForm({ ...schedForm, agentId: e.target.value }) },
              h('option', { value: '' }, '-- Select Agent --'),
              agents.map(a => h('option', { key: a.id, value: a.id }, (a.config?.displayName || a.config?.name || a.name || 'Agent') + (a.config?.email?.address ? ' (' + a.config.email.address + ')' : '')))
            )
          ),
          // Schedule type
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Schedule Type'),
            h('div', { style: { display: 'flex', gap: 16 } },
              ['standard', 'shift', 'custom'].map(t => h('label', { key: t, style: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' } },
                h('input', { type: 'radio', name: 'schedType', checked: schedForm.scheduleType === t, onChange: () => setSchedForm({ ...schedForm, scheduleType: t }) }),
                t.charAt(0).toUpperCase() + t.slice(1)
              ))
            )
          ),
          // Standard fields
          schedForm.scheduleType === 'standard' && h(Fragment, null,
            h('div', { style: { display: 'flex', gap: 12 } },
              h('div', { className: 'form-group', style: { flex: 1 } },
                h('label', { className: 'form-label' }, 'Start Time'),
                h('input', { className: 'input', type: 'time', value: schedForm.config?.standardHours?.start || '09:00', onChange: e => setSchedForm({ ...schedForm, config: { ...schedForm.config, standardHours: { ...schedForm.config.standardHours, start: e.target.value } } }) })
              ),
              h('div', { className: 'form-group', style: { flex: 1 } },
                h('label', { className: 'form-label' }, 'End Time'),
                h('input', { className: 'input', type: 'time', value: schedForm.config?.standardHours?.end || '17:00', onChange: e => setSchedForm({ ...schedForm, config: { ...schedForm.config, standardHours: { ...schedForm.config.standardHours, end: e.target.value } } }) })
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Days of Week'),
              h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                [0, 1, 2, 3, 4, 5, 6].map(d => h('button', {
                  key: d, type: 'button',
                  className: 'btn btn-sm ' + ((schedForm.config?.standardHours?.daysOfWeek || []).includes(d) ? 'btn-primary' : 'btn-ghost'),
                  onClick: () => toggleDay(d)
                }, dayNames[d]))
              )
            )
          ),
          // Shift fields
          schedForm.scheduleType === 'shift' && h(Fragment, null,
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Shifts'),
              (schedForm.config?.shifts || []).map((sh, idx) => h('div', { key: idx, style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6 } },
                h('input', { className: 'input', style: { flex: 1 }, placeholder: 'Shift name', value: sh.name, onChange: e => updateShift(idx, 'name', e.target.value) }),
                h('input', { className: 'input', type: 'time', style: { width: 110 }, value: sh.start, onChange: e => updateShift(idx, 'start', e.target.value) }),
                h('input', { className: 'input', type: 'time', style: { width: 110 }, value: sh.end, onChange: e => updateShift(idx, 'end', e.target.value) }),
                h('button', { className: 'btn btn-ghost btn-icon btn-sm', onClick: () => removeShift(idx) }, I.x())
              )),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: addShift }, I.plus(), ' Add Shift')
            )
          ),
          // Timezone
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Timezone'),
            TimezoneSelect(h, schedForm.timezone, e => setSchedForm({ ...schedForm, timezone: e.target.value }))
          ),
          // Toggles
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
              h('input', { type: 'checkbox', checked: schedForm.enforceClockIn, onChange: e => setSchedForm({ ...schedForm, enforceClockIn: e.target.checked }) }),
              'Enforce Clock-In'
            ),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
              h('input', { type: 'checkbox', checked: schedForm.enforceClockOut, onChange: e => setSchedForm({ ...schedForm, enforceClockOut: e.target.checked }) }),
              'Enforce Clock-Out'
            ),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
              h('input', { type: 'checkbox', checked: schedForm.autoWakeEnabled, onChange: e => setSchedForm({ ...schedForm, autoWakeEnabled: e.target.checked }) }),
              'Auto-Wake'
            ),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
              h('input', { type: 'checkbox', checked: schedForm.enabled, onChange: e => setSchedForm({ ...schedForm, enabled: e.target.checked }) }),
              'Enabled'
            )
          ),
          // Off-hours action + grace period
          h('div', { style: { display: 'flex', gap: 12, marginTop: 12 } },
            h('div', { className: 'form-group', style: { flex: 1 } },
              h('label', { className: 'form-label' }, 'Off-Hours Action'),
              h('select', { className: 'input', value: schedForm.offHoursAction, onChange: e => setSchedForm({ ...schedForm, offHoursAction: e.target.value }) },
                h('option', { value: 'pause' }, 'Pause'), h('option', { value: 'stop' }, 'Stop'), h('option', { value: 'queue' }, 'Queue'))
            ),
            h('div', { className: 'form-group', style: { flex: 1 } },
              h('label', { className: 'form-label' }, 'Grace Period (min)'),
              h('input', { className: 'input', type: 'number', value: schedForm.gracePeriodMinutes, onChange: e => setSchedForm({ ...schedForm, gracePeriodMinutes: parseInt(e.target.value) || 0 }) })
            )
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: () => { setShowScheduleModal(false); setEditingScheduleId(null); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: saveSchedule }, editingScheduleId ? 'Update Schedule' : 'Create Schedule')
        )
      )
    )
  );
}
