import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

export function KnowledgeContributionsPage() {
  var { toast } = useApp();
  var [tab, setTab] = useState('bases');
  var [bases, setBases] = useState([]);
  var [roles, setRoles] = useState([]);
  var [stats, setStats] = useState({});
  var [contributions, setContributions] = useState([]);
  var [schedules, setSchedules] = useState([]);
  var [selectedBase, setSelectedBase] = useState(null);
  var [baseEntries, setBaseEntries] = useState([]);
  var [entryFilters, setEntryFilters] = useState({ category: '', status: '', minQuality: '' });

  // Modals
  var [showCreateBase, setShowCreateBase] = useState(false);
  var [baseForm, setBaseForm] = useState({ name: '', description: '', role: '' });
  var [showTrigger, setShowTrigger] = useState(false);
  var [triggerAgent, setTriggerAgent] = useState('');
  var [triggerBase, setTriggerBase] = useState('');
  var [showCreateSchedule, setShowCreateSchedule] = useState(false);
  var [scheduleForm, setScheduleForm] = useState({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 });
  var [editSchedule, setEditSchedule] = useState(null);

  var loadBases = useCallback(function() {
    engineCall('/knowledge-contribution/bases?orgId=default')
      .then(function(d) { setBases(d.bases || d.knowledgeBases || []); })
      .catch(function() {});
  }, []);

  var loadRoles = useCallback(function() {
    engineCall('/knowledge-contribution/roles')
      .then(function(d) { setRoles(d.roles || []); })
      .catch(function() {});
  }, []);

  var loadStats = useCallback(function() {
    engineCall('/knowledge-contribution/stats?orgId=default')
      .then(function(d) { setStats(d || {}); })
      .catch(function() {});
  }, []);

  var loadContributions = useCallback(function() {
    engineCall('/knowledge-contribution/contributions?orgId=default')
      .then(function(d) { setContributions(d.contributions || d.cycles || []); })
      .catch(function() {});
  }, []);

  var loadSchedules = useCallback(function() {
    engineCall('/knowledge-contribution/schedules?orgId=default')
      .then(function(d) { setSchedules(d.schedules || []); })
      .catch(function() {});
  }, []);

  var load = useCallback(function() {
    loadBases();
    loadRoles();
    loadStats();
    loadContributions();
    loadSchedules();
  }, [loadBases, loadRoles, loadStats, loadContributions, loadSchedules]);

  useEffect(function() { load(); }, [load]);

  var loadBaseEntries = useCallback(function(baseId) {
    var params = new URLSearchParams();
    if (entryFilters.category) params.set('category', entryFilters.category);
    if (entryFilters.status) params.set('status', entryFilters.status);
    if (entryFilters.minQuality) params.set('minQuality', entryFilters.minQuality);
    engineCall('/knowledge-contribution/bases/' + baseId + '/entries?' + params.toString())
      .then(function(d) { setBaseEntries(d.entries || []); })
      .catch(function() {});
  }, [entryFilters]);

  useEffect(function() {
    if (selectedBase) loadBaseEntries(selectedBase.id);
  }, [selectedBase, loadBaseEntries]);

  // Actions
  var createBase = async function() {
    try {
      await engineCall('/knowledge-contribution/bases', {
        method: 'POST',
        body: JSON.stringify({ name: baseForm.name, description: baseForm.description, role: baseForm.role, orgId: 'default' })
      });
      toast('Knowledge base created', 'success');
      setShowCreateBase(false);
      setBaseForm({ name: '', description: '', role: '' });
      loadBases();
      loadStats();
    } catch (e) { toast(e.message || 'Failed to create base', 'error'); }
  };

  var approveEntry = async function(entryId) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/approve', { method: 'PUT' });
      toast('Entry approved', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
      loadStats();
    } catch (e) { toast(e.message || 'Approve failed', 'error'); }
  };

  var rejectEntry = async function(entryId) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/reject', { method: 'PUT' });
      toast('Entry rejected', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
    } catch (e) { toast(e.message || 'Reject failed', 'error'); }
  };

  var archiveEntry = async function(entryId) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/archive', { method: 'PUT' });
      toast('Entry archived', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
    } catch (e) { toast(e.message || 'Archive failed', 'error'); }
  };

  var voteEntry = async function(entryId, direction) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/vote', {
        method: 'POST',
        body: JSON.stringify({ direction: direction })
      });
      toast('Vote recorded', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
    } catch (e) { toast(e.message || 'Vote failed', 'error'); }
  };

  var triggerContribution = async function() {
    if (!triggerAgent) return;
    try {
      await engineCall('/knowledge-contribution/contribute/' + triggerAgent, {
        method: 'POST',
        body: JSON.stringify({ targetBaseId: triggerBase || undefined, orgId: 'default' })
      });
      toast('Contribution triggered', 'success');
      setShowTrigger(false);
      setTriggerAgent('');
      setTriggerBase('');
      loadContributions();
      loadStats();
    } catch (e) { toast(e.message || 'Trigger failed', 'error'); }
  };

  var createSchedule = async function() {
    try {
      await engineCall('/knowledge-contribution/schedules', {
        method: 'POST',
        body: JSON.stringify({
          agentId: scheduleForm.agentId,
          targetBaseId: scheduleForm.targetBaseId,
          frequency: scheduleForm.frequency,
          dayOfWeek: scheduleForm.dayOfWeek,
          minConfidence: parseFloat(scheduleForm.minConfidence) || 0.7,
          orgId: 'default'
        })
      });
      toast('Schedule created', 'success');
      setShowCreateSchedule(false);
      setScheduleForm({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 });
      loadSchedules();
      loadStats();
    } catch (e) { toast(e.message || 'Create schedule failed', 'error'); }
  };

  var updateSchedule = async function() {
    if (!editSchedule) return;
    try {
      await engineCall('/knowledge-contribution/schedules/' + editSchedule.id, {
        method: 'PUT',
        body: JSON.stringify({
          frequency: scheduleForm.frequency,
          dayOfWeek: scheduleForm.dayOfWeek,
          minConfidence: parseFloat(scheduleForm.minConfidence) || 0.7,
          enabled: editSchedule.enabled
        })
      });
      toast('Schedule updated', 'success');
      setEditSchedule(null);
      setScheduleForm({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 });
      loadSchedules();
    } catch (e) { toast(e.message || 'Update schedule failed', 'error'); }
  };

  var toggleSchedule = async function(sched) {
    try {
      await engineCall('/knowledge-contribution/schedules/' + sched.id, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !sched.enabled })
      });
      toast('Schedule ' + (sched.enabled ? 'disabled' : 'enabled'), 'success');
      loadSchedules();
    } catch (e) { toast(e.message || 'Toggle failed', 'error'); }
  };

  var deleteSchedule = async function(schedId) {
    try {
      await engineCall('/knowledge-contribution/schedules/' + schedId, { method: 'DELETE' });
      toast('Schedule deleted', 'success');
      loadSchedules();
      loadStats();
    } catch (e) { toast(e.message || 'Delete failed', 'error'); }
  };

  // Helpers
  var statusColor = function(s) {
    if (s === 'approved' || s === 'completed' || s === 'active') return 'var(--success)';
    if (s === 'pending' || s === 'running' || s === 'in_progress') return 'var(--warning)';
    if (s === 'rejected' || s === 'failed') return 'var(--danger)';
    if (s === 'archived') return 'var(--text-muted)';
    return 'var(--info)';
  };

  var qualityBar = function(score) {
    var pct = Math.round((score || 0) * 100);
    var color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      h('div', { style: { flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 } },
        h('div', { style: { width: pct + '%', height: '100%', background: color, borderRadius: 3 } })
      ),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)', minWidth: 30 } }, pct + '%')
    );
  };

  var roleColor = function(role) {
    if (role === 'support') return 'var(--info)';
    if (role === 'sales') return 'var(--success)';
    if (role === 'engineering') return 'var(--warning)';
    if (role === 'hr') return '#a855f7';
    if (role === 'ops') return '#f97316';
    return 'var(--brand-color)';
  };

  // ── Knowledge Bases Tab ──────────────────────────────
  var renderBases = function() {
    if (selectedBase) return renderBaseDetail();

    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, bases.length + ' knowledge base' + (bases.length !== 1 ? 's' : '')),
        h('button', { className: 'btn btn-primary', onClick: function() { setShowCreateBase(true); } }, I.plus(), ' Create Knowledge Base')
      ),
      bases.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No knowledge bases yet. Create one to get started.')
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 } },
            bases.map(function(base) {
              return h('div', {
                key: base.id,
                className: 'card',
                style: { cursor: 'pointer', transition: 'border-color 0.15s' },
                onClick: function() { setSelectedBase(base); }
              },
                h('div', { className: 'card-body' },
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 } },
                    h('h3', { style: { fontSize: 15, fontWeight: 600 } }, base.name),
                    base.role && h('span', {
                      className: 'badge',
                      style: { background: roleColor(base.role), color: '#fff', fontSize: 10, textTransform: 'uppercase' }
                    }, base.role)
                  ),
                  h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 } },
                    base.description || 'No description'
                  ),
                  h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
                    h('span', { className: 'badge badge-info' }, (base.entryCount || 0) + ' entries'),
                    h('span', { className: 'badge badge-neutral' }, (base.contributorCount || 0) + ' contributors'),
                    base.lastContribution && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                      'Last: ' + new Date(base.lastContribution).toLocaleDateString()
                    )
                  )
                )
              );
            })
          )
    );
  };

  // ── Base Detail View ──────────────────────────────
  var renderBaseDetail = function() {
    var categories = [];
    var catSet = {};
    baseEntries.forEach(function(e) {
      if (e.category && !catSet[e.category]) {
        catSet[e.category] = true;
        categories.push(e.category);
      }
    });

    return h(Fragment, null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setSelectedBase(null); setBaseEntries([]); setEntryFilters({ category: '', status: '', minQuality: '' }); } }, '\u2190 Back'),
        h('div', null,
          h('h2', { style: { fontSize: 16, fontWeight: 600 } }, selectedBase.name),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)' } }, selectedBase.description || '')
        ),
        selectedBase.role && h('span', {
          className: 'badge',
          style: { background: roleColor(selectedBase.role), color: '#fff', fontSize: 10, textTransform: 'uppercase', marginLeft: 'auto' }
        }, selectedBase.role)
      ),

      // Filters
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' } },
        h('select', {
          className: 'input', style: { width: 160 },
          value: entryFilters.category,
          onChange: function(e) { setEntryFilters(function(f) { return Object.assign({}, f, { category: e.target.value }); }); }
        },
          h('option', { value: '' }, 'All Categories'),
          categories.map(function(c) { return h('option', { key: c, value: c }, c); })
        ),
        h('select', {
          className: 'input', style: { width: 140 },
          value: entryFilters.status,
          onChange: function(e) { setEntryFilters(function(f) { return Object.assign({}, f, { status: e.target.value }); }); }
        },
          h('option', { value: '' }, 'All Statuses'),
          ['pending', 'approved', 'rejected', 'archived'].map(function(s) { return h('option', { key: s, value: s }, s.charAt(0).toUpperCase() + s.slice(1)); })
        ),
        h('select', {
          className: 'input', style: { width: 150 },
          value: entryFilters.minQuality,
          onChange: function(e) { setEntryFilters(function(f) { return Object.assign({}, f, { minQuality: e.target.value }); }); }
        },
          h('option', { value: '' }, 'Any Quality'),
          h('option', { value: '0.8' }, '80%+ Quality'),
          h('option', { value: '0.6' }, '60%+ Quality'),
          h('option', { value: '0.4' }, '40%+ Quality')
        ),
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' } }, baseEntries.length + ' entries')
      ),

      // Entries
      baseEntries.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No entries in this knowledge base yet.')
        : h('div', { style: { display: 'grid', gap: 10 } },
            baseEntries.map(function(entry) {
              return h('div', { key: entry.id, className: 'card', style: { padding: 14 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 } },
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                      h('span', { style: { fontWeight: 600, fontSize: 14 } }, entry.title || 'Untitled'),
                      entry.category && h('span', { className: 'badge badge-info', style: { fontSize: 10 } }, entry.category),
                      h('span', {
                        className: 'badge',
                        style: { background: statusColor(entry.status), color: '#fff', fontSize: 10 }
                      }, entry.status || 'pending')
                    ),
                    entry.summary && h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 } }, entry.summary)
                  )
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
                  // Quality bar
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Quality:'),
                    qualityBar(entry.qualityScore || entry.quality)
                  ),
                  // Confidence
                  entry.confidence != null && h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                    'Confidence: ' + Math.round((entry.confidence || 0) * 100) + '%'
                  ),
                  // Tags
                  (entry.tags || []).length > 0 && h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                    entry.tags.map(function(t) { return h('span', { key: t, className: 'badge badge-neutral', style: { fontSize: 10 } }, t); })
                  ),
                  // Vote buttons
                  h('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { fontSize: 14, padding: '2px 6px' },
                      onClick: function() { voteEntry(entry.id, 'up'); },
                      title: 'Vote up'
                    }, '\u25B2', entry.upvotes != null ? h('span', { style: { fontSize: 10, marginLeft: 2 } }, entry.upvotes) : null),
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { fontSize: 14, padding: '2px 6px' },
                      onClick: function() { voteEntry(entry.id, 'down'); },
                      title: 'Vote down'
                    }, '\u25BC', entry.downvotes != null ? h('span', { style: { fontSize: 10, marginLeft: 2 } }, entry.downvotes) : null)
                  ),
                  // Action buttons
                  h('div', { style: { display: 'flex', gap: 4 } },
                    entry.status !== 'approved' && h('button', { className: 'btn btn-primary btn-sm', onClick: function() { approveEntry(entry.id); } }, 'Approve'),
                    entry.status !== 'rejected' && h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function() { rejectEntry(entry.id); } }, 'Reject'),
                    entry.status !== 'archived' && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { archiveEntry(entry.id); } }, 'Archive')
                  )
                )
              );
            })
          )
    );
  };

  // ── Contributions Tab ──────────────────────────────
  var renderContributions = function() {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, contributions.length + ' contribution cycle' + (contributions.length !== 1 ? 's' : '')),
        h('button', { className: 'btn btn-primary', onClick: function() { setShowTrigger(true); } }, I.play(), ' Trigger Contribution')
      ),
      contributions.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No contribution cycles yet.')
        : h('table', { className: 'data-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Agent'),
                h('th', null, 'Knowledge Base'),
                h('th', null, 'Status'),
                h('th', null, 'Scanned'),
                h('th', null, 'Contributed'),
                h('th', null, 'Duplicates Skipped'),
                h('th', null, 'Date')
              )
            ),
            h('tbody', null,
              contributions.map(function(c) {
                return h('tr', { key: c.id },
                  h('td', null, h('span', { style: { fontWeight: 500 } }, c.agentName || c.agentId || '-')),
                  h('td', null, c.baseName || c.targetBaseId || '-'),
                  h('td', null, h('span', {
                    className: 'badge',
                    style: { background: statusColor(c.status), color: '#fff', fontSize: 10 }
                  }, c.status || 'unknown')),
                  h('td', null, c.memoriesScanned != null ? c.memoriesScanned : '-'),
                  h('td', null, c.entriesContributed != null ? c.entriesContributed : '-'),
                  h('td', null, c.duplicatesSkipped != null ? c.duplicatesSkipped : '-'),
                  h('td', null, c.createdAt || c.date ? new Date(c.createdAt || c.date).toLocaleString() : '-')
                );
              })
            )
          )
    );
  };

  // ── Schedules Tab ──────────────────────────────
  var renderSchedules = function() {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, schedules.length + ' schedule' + (schedules.length !== 1 ? 's' : '')),
        h('button', { className: 'btn btn-primary', onClick: function() { setShowCreateSchedule(true); } }, I.plus(), ' Create Schedule')
      ),
      schedules.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No contribution schedules configured.')
        : h('table', { className: 'data-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Agent'),
                h('th', null, 'Target Base'),
                h('th', null, 'Frequency'),
                h('th', null, 'Next Run'),
                h('th', null, 'Enabled'),
                h('th', null, 'Actions')
              )
            ),
            h('tbody', null,
              schedules.map(function(sched) {
                return h('tr', { key: sched.id },
                  h('td', null, h('span', { style: { fontWeight: 500 } }, sched.agentName || sched.agentId || '-')),
                  h('td', null, sched.baseName || sched.targetBaseId || '-'),
                  h('td', null, h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, sched.frequency || '-')),
                  h('td', null, sched.nextRun ? new Date(sched.nextRun).toLocaleString() : '-'),
                  h('td', null,
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { color: sched.enabled ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600, fontSize: 12 },
                      onClick: function() { toggleSchedule(sched); }
                    }, sched.enabled ? 'ON' : 'OFF')
                  ),
                  h('td', null,
                    h('div', { style: { display: 'flex', gap: 4 } },
                      h('button', {
                        className: 'btn btn-ghost btn-sm',
                        onClick: function() {
                          setEditSchedule(sched);
                          setScheduleForm({
                            agentId: sched.agentId || '',
                            targetBaseId: sched.targetBaseId || '',
                            frequency: sched.frequency || 'weekly',
                            dayOfWeek: sched.dayOfWeek || 'monday',
                            minConfidence: sched.minConfidence || 0.7
                          });
                        }
                      }, 'Edit'),
                      h('button', {
                        className: 'btn btn-ghost btn-sm',
                        style: { color: 'var(--danger)' },
                        onClick: function() { deleteSchedule(sched.id); }
                      }, 'Delete')
                    )
                  )
                );
              })
            )
          )
    );
  };

  // ── Stats Tab ──────────────────────────────
  var renderStats = function() {
    var topCategories = stats.topCategories || stats.categories || [];
    var maxCatCount = topCategories.reduce(function(mx, c) { return Math.max(mx, c.count || 0); }, 1);
    var recentTimeline = stats.recentContributions || stats.timeline || [];

    return h(Fragment, null,
      // Stat cards
      h('div', { className: 'stat-grid', style: { marginBottom: 24 } },
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalBases != null ? stats.totalBases : bases.length),
          h('div', { className: 'stat-label' }, 'Total Bases')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalEntries != null ? stats.totalEntries : 0),
          h('div', { className: 'stat-label' }, 'Total Entries')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalContributors != null ? stats.totalContributors : 0),
          h('div', { className: 'stat-label' }, 'Total Contributors')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalSchedules != null ? stats.totalSchedules : schedules.length),
          h('div', { className: 'stat-label' }, 'Total Schedules')
        )
      ),

      // Top categories chart
      topCategories.length > 0 && h('div', { className: 'card', style: { marginBottom: 24 } },
        h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600 } }, 'Top Categories')),
        h('div', { className: 'card-body' },
          topCategories.map(function(cat) {
            var pct = Math.round(((cat.count || 0) / maxCatCount) * 100);
            return h('div', { key: cat.category || cat.name, style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } },
              h('span', { style: { fontSize: 12, fontWeight: 500, minWidth: 100 } }, cat.category || cat.name),
              h('div', { style: { flex: 1, height: 18, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' } },
                h('div', { style: { width: pct + '%', height: '100%', background: 'var(--brand-color)', borderRadius: 4, transition: 'width 0.3s' } })
              ),
              h('span', { style: { fontSize: 11, color: 'var(--text-muted)', minWidth: 30, textAlign: 'right' } }, cat.count || 0)
            );
          })
        )
      ),

      // Recent contributions timeline
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600 } }, 'Recent Contributions')),
        h('div', { className: 'card-body' },
          recentTimeline.length === 0
            ? h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'No recent contributions')
            : recentTimeline.map(function(item, idx) {
                return h('div', {
                  key: idx,
                  style: {
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: idx < recentTimeline.length - 1 ? '1px solid var(--border)' : 'none'
                  }
                },
                  h('div', {
                    style: {
                      width: 8, height: 8, borderRadius: '50%',
                      background: statusColor(item.status), flexShrink: 0
                    }
                  }),
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { fontSize: 13, fontWeight: 500 } },
                      (item.agentName || item.agentId || 'Unknown agent') + ' contributed to ' + (item.baseName || item.targetBaseId || 'unknown base')
                    ),
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                      (item.entriesContributed || 0) + ' entries' +
                      (item.duplicatesSkipped ? ' \u00B7 ' + item.duplicatesSkipped + ' duplicates skipped' : '')
                    )
                  ),
                  h('span', { style: { fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 } },
                    item.createdAt || item.date ? new Date(item.createdAt || item.date).toLocaleDateString() : ''
                  )
                );
              })
        )
      )
    );
  };

  // ── Tab labels ──────────────────────────────
  var tabLabels = {
    bases: 'Knowledge Bases',
    contributions: 'Contributions',
    schedules: 'Schedules',
    stats: 'Stats'
  };

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Knowledge Contributions'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } },
          'Collaborative knowledge building from agent memories and experiences'
        )
      ),
      h('button', { className: 'btn btn-ghost', onClick: load }, I.refresh(), ' Refresh')
    ),

    // Tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      Object.keys(tabLabels).map(function(t) {
        return h('button', {
          key: t,
          className: 'tab' + (tab === t ? ' active' : ''),
          onClick: function() { setTab(t); }
        }, tabLabels[t]);
      })
    ),

    // Tab content
    tab === 'bases' && renderBases(),
    tab === 'contributions' && renderContributions(),
    tab === 'schedules' && renderSchedules(),
    tab === 'stats' && renderStats(),

    // ── Create Base Modal ──────────────────────────────
    showCreateBase && h(Modal, {
      title: 'Create Knowledge Base',
      onClose: function() { setShowCreateBase(false); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowCreateBase(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: createBase, disabled: !baseForm.name }, 'Create')
      )
    },
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Name'),
        h('input', {
          className: 'input', style: { width: '100%' },
          value: baseForm.name,
          onChange: function(e) { setBaseForm(function(f) { return Object.assign({}, f, { name: e.target.value }); }); },
          placeholder: 'e.g. Customer Support Knowledge'
        })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Description'),
        h('textarea', {
          className: 'input', style: { width: '100%', minHeight: 80 },
          value: baseForm.description,
          onChange: function(e) { setBaseForm(function(f) { return Object.assign({}, f, { description: e.target.value }); }); },
          placeholder: 'Describe what this knowledge base is for...'
        })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Role'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: baseForm.role,
          onChange: function(e) { setBaseForm(function(f) { return Object.assign({}, f, { role: e.target.value }); }); }
        },
          h('option', { value: '' }, 'Select a role...'),
          roles.map(function(r) { return h('option', { key: r.id || r.name || r, value: r.id || r.name || r }, r.label || r.name || r); })
        )
      )
    ),

    // ── Trigger Contribution Modal ──────────────────────────────
    showTrigger && h(Modal, {
      title: 'Trigger Contribution',
      onClose: function() { setShowTrigger(false); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowTrigger(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: triggerContribution, disabled: !triggerAgent }, 'Trigger')
      )
    },
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Agent ID'),
        h('input', {
          className: 'input', style: { width: '100%' },
          value: triggerAgent,
          onChange: function(e) { setTriggerAgent(e.target.value); },
          placeholder: 'Enter agent ID...'
        })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Target Knowledge Base (optional)'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: triggerBase,
          onChange: function(e) { setTriggerBase(e.target.value); }
        },
          h('option', { value: '' }, 'All eligible bases'),
          bases.map(function(b) { return h('option', { key: b.id, value: b.id }, b.name); })
        )
      ),
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'This will scan the agent\'s recent memories and contribute qualifying entries to the selected knowledge base.')
    ),

    // ── Create/Edit Schedule Modal ──────────────────────────────
    (showCreateSchedule || editSchedule) && h(Modal, {
      title: editSchedule ? 'Edit Schedule' : 'Create Schedule',
      onClose: function() { setShowCreateSchedule(false); setEditSchedule(null); setScheduleForm({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 }); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowCreateSchedule(false); setEditSchedule(null); } }, 'Cancel'),
        editSchedule
          ? h('button', { className: 'btn btn-primary', onClick: updateSchedule }, 'Update')
          : h('button', { className: 'btn btn-primary', onClick: createSchedule, disabled: !scheduleForm.agentId || !scheduleForm.targetBaseId }, 'Create')
      )
    },
      !editSchedule && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Agent ID'),
        h('input', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.agentId,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { agentId: e.target.value }); }); },
          placeholder: 'Enter agent ID...'
        })
      ),
      !editSchedule && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Target Knowledge Base'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.targetBaseId,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { targetBaseId: e.target.value }); }); }
        },
          h('option', { value: '' }, 'Select a base...'),
          bases.map(function(b) { return h('option', { key: b.id, value: b.id }, b.name); })
        )
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Frequency'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.frequency,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { frequency: e.target.value }); }); }
        },
          h('option', { value: 'hourly' }, 'Hourly'),
          h('option', { value: 'daily' }, 'Daily'),
          h('option', { value: 'weekly' }, 'Weekly'),
          h('option', { value: 'monthly' }, 'Monthly')
        )
      ),
      scheduleForm.frequency === 'weekly' && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Day of Week'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.dayOfWeek,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { dayOfWeek: e.target.value }); }); }
        },
          ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(function(d) {
            return h('option', { key: d, value: d }, d.charAt(0).toUpperCase() + d.slice(1));
          })
        )
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Minimum Confidence Filter'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('input', {
            type: 'range', min: 0, max: 1, step: 0.05,
            style: { flex: 1 },
            value: scheduleForm.minConfidence,
            onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { minConfidence: parseFloat(e.target.value) }); }); }
          }),
          h('span', { style: { fontSize: 13, fontWeight: 600, minWidth: 40 } }, Math.round(scheduleForm.minConfidence * 100) + '%')
        )
      )
    )
  );
}
