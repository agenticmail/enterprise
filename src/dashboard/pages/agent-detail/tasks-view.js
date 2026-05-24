import { h, useState, useEffect, Fragment, useApp, engineCall, showConfirm } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { HelpButton } from '../../components/help-button.js';

// --- TasksSection: view & lightly manage an agent's local task tracker ---

var STATUS_META = {
  needs_action: { label: 'Pending', color: '#64748b' },
  in_progress: { label: 'In Progress', color: '#3b82f6' },
  completed: { label: 'Done', color: '#15803d' },
  blocked: { label: 'Blocked', color: '#ef4444' },
};
var PRIORITY_COLOR = { high: '#f43f5e', normal: '#64748b', low: '#94a3b8' };

export function TasksSection(props) {
  var agentId = props.agentId;
  var app = useApp();
  var toast = app.toast;

  var _tasks = useState([]); var tasks = _tasks[0]; var setTasks = _tasks[1];
  var _stats = useState(null); var stats = _stats[0]; var setStats = _stats[1];
  var _lists = useState([]); var lists = _lists[0]; var setLists = _lists[1];
  var _listFilter = useState(''); var listFilter = _listFilter[0]; var setListFilter = _listFilter[1];
  var _statusFilter = useState(''); var statusFilter = _statusFilter[0]; var setStatusFilter = _statusFilter[1];
  var _expanded = useState(null); var expandedId = _expanded[0]; var setExpandedId = _expanded[1];

  var load = function () {
    var q = '?includeCompleted=true&limit=500';
    if (listFilter) q += '&list=' + encodeURIComponent(listFilter);
    if (statusFilter) q += '&status=' + statusFilter;
    engineCall('/local-tasks/agent/' + agentId + q)
      .then(function (d) { setTasks(d.tasks || []); })
      .catch(function () {});
    engineCall('/local-tasks/agent/' + agentId + '/stats')
      .then(function (d) { setStats(d.stats || null); setLists(d.lists || []); })
      .catch(function () {});
  };

  useEffect(function () { load(); }, [agentId]);
  useEffect(function () { load(); }, [listFilter, statusFilter]);

  var setStatus = function (t, status) {
    engineCall('/local-tasks/agent/' + agentId + '/' + t.id, { method: 'PATCH', body: JSON.stringify({ status: status }) })
      .then(function () { toast('Task updated', 'success'); load(); })
      .catch(function (e) { toast(e.message, 'error'); });
  };
  var del = function (t) {
    showConfirm({ title: 'Delete Task', message: 'Delete "' + (t.title || 'task') + '" and its subtasks?', warning: true, confirmText: 'Delete' })
      .then(function (ok) {
        if (!ok) return;
        engineCall('/local-tasks/agent/' + agentId + '/' + t.id, { method: 'DELETE' })
          .then(function () { toast('Task deleted', 'success'); load(); })
          .catch(function (e) { toast(e.message, 'error'); });
      });
  };
  var clearDone = function () {
    showConfirm({ title: 'Clear Completed', message: 'Remove all completed tasks' + (listFilter ? ' in "' + listFilter + '"' : '') + '?', warning: true, confirmText: 'Clear' })
      .then(function (ok) {
        if (!ok) return;
        engineCall('/local-tasks/agent/' + agentId + '/clear-completed', { method: 'POST', body: JSON.stringify({ list: listFilter || undefined }) })
          .then(function (d) { toast('Cleared ' + (d.removed || 0) + ' task(s)', 'success'); load(); })
          .catch(function (e) { toast(e.message, 'error'); });
      });
  };

  var byStatus = (stats && stats.byStatus) || {};
  var total = (stats && stats.total) || 0;
  var fmtDate = function (d) { if (!d) return ''; var x = new Date(d); return x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Tasks',
        h(HelpButton, { label: 'Tasks' },
          h('p', null, "The agent's local to-do tracker (Google-Tasks-style). The agent adds tasks and updates their status as it works through multi-step or batch jobs. It's reminded about unfinished tasks via heartbeat and the morning catch-up."),
          h('p', null, 'This is the agent\u2019s OWN checklist \u2014 separate from the inter-agent task queue (delegating work to other agents).')
        )
      ),
      h('div', { style: { display: 'flex', gap: 6 } },
        h('button', { className: 'btn btn-ghost btn-sm', onClick: clearDone, title: 'Clear completed tasks' }, I.trash()),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: load }, I.refresh())
      )
    ),
    h('div', { className: 'card-body', style: { padding: 0 } },
      // Stats bar
      h('div', { style: { display: 'flex', gap: 24, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' } },
        h('span', { style: { color: 'var(--text-muted)' } }, 'Total: ', h('strong', null, total)),
        Object.keys(STATUS_META).map(function (s) {
          return h('span', { key: s, style: { color: STATUS_META[s].color, display: 'flex', alignItems: 'center', gap: 4 } },
            STATUS_META[s].label, ': ', h('strong', null, byStatus[s] || 0));
        }),
        h('div', { style: { flex: 1 } }),
        h('span', { style: { color: 'var(--text-muted)' } }, 'Lists: ', h('strong', null, lists.length))
      ),
      // Filters
      h('div', { style: { display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' } },
        h('select', { className: 'input', style: { width: 170, height: 30, fontSize: 12 }, value: listFilter, onChange: function (e) { setListFilter(e.target.value); } },
          h('option', { value: '' }, 'All Lists'),
          lists.map(function (l) { return h('option', { key: l, value: l }, l); })
        ),
        h('select', { className: 'input', style: { width: 140, height: 30, fontSize: 12 }, value: statusFilter, onChange: function (e) { setStatusFilter(e.target.value); } },
          h('option', { value: '' }, 'All Statuses'),
          Object.keys(STATUS_META).map(function (s) { return h('option', { key: s, value: s }, STATUS_META[s].label); })
        )
      ),
      // List
      tasks.length === 0
        ? h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No tasks yet. The agent will add tasks here as it works.')
        : h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px 90px 80px 70px 36px', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' } },
            h('span', null, 'Task'), h('span', null, 'List'), h('span', null, 'Status'), h('span', null, 'Priority'), h('span', null, 'Due'), h('span', null, '')
          ),
          tasks.map(function (t) {
            var isExp = expandedId === t.id;
            var sm = STATUS_META[t.status] || STATUS_META.needs_action;
            return h('div', { key: t.id },
              h('div', {
                style: { display: 'grid', gridTemplateColumns: '1fr 120px 90px 80px 70px 36px', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, alignItems: 'center', background: isExp ? 'var(--bg-tertiary)' : 'transparent' },
                onClick: function () { setExpandedId(isExp ? null : t.id); }
              },
                h('div', { style: { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } },
                  t.parentId && h('span', { style: { color: 'var(--text-muted)', marginRight: 4 } }, '\u21B3'),
                  h('span', { style: { fontWeight: 500, textDecoration: t.status === 'completed' ? 'line-through' : 'none', opacity: t.status === 'completed' ? 0.6 : 1 } }, t.title || 'Untitled')
                ),
                h('span', { style: { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.list || 'Tasks'),
                h('span', { style: { display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: sm.color, whiteSpace: 'nowrap' } }, sm.label),
                h('span', { style: { fontSize: 11, color: PRIORITY_COLOR[t.priority] || '#64748b', fontWeight: 500 } }, t.priority || 'normal'),
                h('span', { style: { fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, fmtDate(t.due)),
                h('span', { style: { color: 'var(--text-muted)' } }, isExp ? '\u25B4' : '\u25BE')
              ),
              isExp && h('div', { style: { padding: '10px 16px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6 } },
                t.notes && h('div', { style: { color: 'var(--text)', marginBottom: 8, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' } }, t.notes),
                h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' } },
                  t.tags && t.tags.length > 0 && h('span', null, 'Tags: ', t.tags.join(', ')),
                  t.createdAt && h('span', null, 'Created: ', fmtDate(t.createdAt)),
                  t.completedAt && h('span', null, 'Done: ', fmtDate(t.completedAt)),
                  h('div', { style: { flex: 1 } }),
                  // Operator status controls
                  t.status !== 'in_progress' && h('button', { className: 'btn btn-ghost btn-sm', style: { height: 24, fontSize: 11 }, onClick: function (e) { e.stopPropagation(); setStatus(t, 'in_progress'); } }, 'Start'),
                  t.status !== 'completed' && h('button', { className: 'btn btn-ghost btn-sm', style: { height: 24, fontSize: 11, color: 'var(--success)' }, onClick: function (e) { e.stopPropagation(); setStatus(t, 'completed'); } }, 'Done'),
                  t.status === 'completed' && h('button', { className: 'btn btn-ghost btn-sm', style: { height: 24, fontSize: 11 }, onClick: function (e) { e.stopPropagation(); setStatus(t, 'needs_action'); } }, 'Reopen'),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { height: 24, fontSize: 11, color: 'var(--danger)' }, onClick: function (e) { e.stopPropagation(); del(t); } }, I.trash())
                )
              )
            );
          })
        )
    )
  );
}
