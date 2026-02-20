import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, buildAgentEmailMap, resolveAgentEmail, buildAgentDataMap, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';

export function WorkforcePage() {
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
  const [budgetForm, setBudgetForm] = useState({ dailyTokenCap: 0, weeklyTokenCap: 0, monthlyTokenCap: 0, annualTokenCap: 0 });
  const [agents, setAgents] = useState([]);

  const formatTime = (iso) => iso ? new Date(iso).toLocaleString() : '-';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const formatDays = (days) => days?.map(d => dayNames[d]).join(', ') || '-';

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, schedulesRes, budgetRes, recordsRes] = await Promise.all([
        engineCall('/workforce/status'),
        engineCall('/workforce/schedules'),
        engineCall('/workforce/budget-overview'),
        engineCall('/workforce/clock-records?limit=50'),
      ]);
      setStatus(statusRes);
      setSchedules(schedulesRes.schedules || []);
      setBudgetData(budgetRes);
      setClockRecords(recordsRes.records || []);
      engineCall('/agents?orgId=default').then(d => setAgents(d.agents || [])).catch(() => {});
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
      await engineCall('/workforce/budgets/' + agentId, { method: 'PUT', body: JSON.stringify(budgetForm) });
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
    { key: 'overview', label: 'Overview' },
    { key: 'schedules', label: 'Schedules' },
    { key: 'tasks', label: 'Task Queue' },
    { key: 'budgets', label: 'Budgets' },
    { key: 'history', label: 'Clock History' },
  ];

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' },
      h('h1', null, 'Workforce Management'),
      h('button', { className: 'btn btn-ghost', onClick: loadData }, I.refresh(), ' Refresh')
    ),
    // Tab bar
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      tabs.map(t => h('button', { key: t.key, className: 'tab' + (tab === t.key ? ' active' : ''), onClick: () => setTab(t.key) }, t.label))
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
              ? h('tr', null, h('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No agents found'))
              : status.agents.map(a => h('tr', { key: a.agentId },
                h('td', null, renderAgentBadge(a.agentId || a.id, agentData)),
                h('td', null, statusBadge(a.status)),
                h('td', null, a.schedule
                  ? (a.schedule.type || 'Standard') + ': ' + (a.schedule.start || '-') + ' - ' + (a.schedule.end || '-')
                  : h('span', { style: { color: 'var(--text-muted)' } }, 'None')),
                h('td', null, a.nextEvent ? formatTime(a.nextEvent) : '-'),
                h('td', { style: { display: 'flex', gap: 4 } },
                  a.status !== 'clocked_in' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => handleClockIn(a.agentId) }, I.play(), ' Clock In'),
                  a.status === 'clocked_in' && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => handleClockOut(a.agentId) }, I.pause(), ' Clock Out')
                )
              ))
          )
        )
      )
    ),

    // ===== SCHEDULES TAB =====
    tab === 'schedules' && h(Fragment, null,
      h('div', { style: { marginBottom: 12 } },
        h('button', { className: 'btn btn-primary', onClick: openNewSchedule }, I.plus(), ' Create Schedule')
      ),
      schedules.length === 0
        ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No schedules configured')
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 } },
          schedules.map(s => h('div', { key: s.id, className: 'card', style: { padding: 20 } },
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
        )
    ),

    // ===== TASK QUEUE TAB =====
    tab === 'tasks' && h(Fragment, null,
      h('div', { style: { marginBottom: 12, display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-primary', onClick: () => setShowTaskForm(!showTaskForm) }, I.plus(), ' Add Task'),
        h('button', { className: 'btn btn-ghost', onClick: loadTasks }, I.refresh(), ' Refresh')
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
      tasks.length === 0
        ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No tasks in queue')
        : h('div', { className: 'card' },
          h('table', { className: 'data-table' },
            h('thead', null, h('tr', null,
              h('th', null, 'Agent'), h('th', null, 'Type'), h('th', null, 'Title'), h('th', null, 'Priority'), h('th', null, 'Status'), h('th', null, 'Created'), h('th', null, 'Actions')
            )),
            h('tbody', null,
              tasks.map(t => h('tr', { key: t.id },
                h('td', null, renderAgentBadge(t.agentId, agentData)),
                h('td', null, typeBadge(t.type)),
                h('td', null, h('strong', null, t.title || '-')),
                h('td', null, h('span', { className: 'badge', style: { background: t.priority === 'critical' ? 'var(--danger)' : t.priority === 'high' ? 'var(--warning)' : 'var(--bg-tertiary)' } }, t.priority || 'normal')),
                h('td', null, t.status || '-'),
                h('td', null, formatTime(t.createdAt)),
                h('td', { style: { display: 'flex', gap: 4 } },
                  h('button', { className: 'btn btn-ghost btn-sm', onClick: () => completeTask(t.id) }, I.check(), ' Done'),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: () => cancelTask(t.id) }, I.x(), ' Cancel')
                )
              ))
            )
          )
        )
    ),

    // ===== BUDGETS TAB =====
    tab === 'budgets' && h(Fragment, null,
      !budgetData?.agents || budgetData.agents.length === 0
        ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No budget data available')
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 } },
          budgetData.agents.map(a => h('div', { key: a.agentId, className: 'card', style: { padding: 20 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
              renderAgentBadge(a.agentId || a.id, agentData),
              editingBudgetAgent === a.agentId
                ? h('button', { className: 'btn btn-primary btn-sm', onClick: () => saveBudgetCaps(a.agentId) }, 'Save')
                : h('button', { className: 'btn btn-ghost btn-sm', onClick: () => { setEditingBudgetAgent(a.agentId); setBudgetForm({ dailyTokenCap: a.caps?.daily || 0, weeklyTokenCap: a.caps?.weekly || 0, monthlyTokenCap: a.caps?.monthly || 0, annualTokenCap: a.caps?.annual || 0 }); } }, 'Edit Caps')
            ),
            editingBudgetAgent === a.agentId
              ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Daily Token Cap'),
                  h('input', { className: 'input', type: 'number', value: budgetForm.dailyTokenCap, onChange: e => setBudgetForm({ ...budgetForm, dailyTokenCap: parseInt(e.target.value) || 0 }) })
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Weekly Token Cap'),
                  h('input', { className: 'input', type: 'number', value: budgetForm.weeklyTokenCap, onChange: e => setBudgetForm({ ...budgetForm, weeklyTokenCap: parseInt(e.target.value) || 0 }) })
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Monthly Token Cap'),
                  h('input', { className: 'input', type: 'number', value: budgetForm.monthlyTokenCap, onChange: e => setBudgetForm({ ...budgetForm, monthlyTokenCap: parseInt(e.target.value) || 0 }) })
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Annual Token Cap'),
                  h('input', { className: 'input', type: 'number', value: budgetForm.annualTokenCap, onChange: e => setBudgetForm({ ...budgetForm, annualTokenCap: parseInt(e.target.value) || 0 }) })
                ),
                h('button', { className: 'btn btn-ghost btn-sm', style: { gridColumn: '1 / -1' }, onClick: () => setEditingBudgetAgent(null) }, 'Cancel')
              )
              : h(Fragment, null,
                progressBar(a.usage?.daily?.tokens || 0, a.caps?.daily || 0, 'Daily Tokens'),
                progressBar(a.usage?.weekly?.tokens || 0, a.caps?.weekly || 0, 'Weekly Tokens'),
                progressBar(a.usage?.monthly?.tokens || 0, a.caps?.monthly || 0, 'Monthly Tokens'),
                progressBar(a.usage?.annual?.tokens || 0, a.caps?.annual || 0, 'Annual Tokens'),
                a.usage?.daily?.cost !== undefined && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 } },
                  'Daily cost: $' + (a.usage.daily.cost || 0).toFixed(4) + (a.caps?.dailyCost ? ' / $' + a.caps.dailyCost.toFixed(2) : '')
                )
              )
          ))
        )
    ),

    // ===== CLOCK HISTORY TAB =====
    tab === 'history' && h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null,
          h('th', null, 'Time'),
          h('th', null, 'Agent'),
          h('th', null, 'Event'),
          h('th', null, 'Triggered By'),
          h('th', null, 'Scheduled At'),
          h('th', null, 'Reason')
        )),
        h('tbody', null,
          clockRecords.length === 0
            ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No clock records found'))
            : clockRecords.map((r, i) => h('tr', { key: r.id || i },
              h('td', null, formatTime(r.timestamp || r.createdAt)),
              h('td', null, renderAgentBadge(r.agentId, agentData)),
              h('td', null, eventBadge(r.eventType || r.type)),
              h('td', null, r.triggeredBy || '-'),
              h('td', null, r.scheduledAt ? formatTime(r.scheduledAt) : '-'),
              h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.reason || '-')
            ))
        )
      )
    ),

    // ===== SCHEDULE EDITOR MODAL =====
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
            h('input', { className: 'input', value: schedForm.timezone, onChange: e => setSchedForm({ ...schedForm, timezone: e.target.value }), placeholder: 'UTC' })
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
