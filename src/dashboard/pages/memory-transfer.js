import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId, buildAgentDataMap, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

var CATEGORIES = ['org_knowledge','interaction_pattern','preference','correction','skill','context','reflection','session_learning','system_notice'];
var CONFLICT_STRATEGIES = [
  { value: 'skip', label: 'Skip — keep target version' },
  { value: 'overwrite', label: 'Overwrite — replace with source' },
  { value: 'merge', label: 'Merge — combine content' },
  { value: 'append', label: 'Append — create duplicate' },
];
var SCHEDULE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'on_change', label: 'On Change' },
];

export function MemoryTransferPage() {
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
  var { toast } = useApp();
  var [tab, setTab] = useState('transfer');
  var [agents, setAgents] = useState([]);
  var [agentMap, setAgentMap] = useState({});

  // Transfer state
  var [sourceId, setSourceId] = useState('');
  var [sourceStats, setSourceStats] = useState(null);
  var [selectedCats, setSelectedCats] = useState([...CATEGORIES]);
  var [dateFrom, setDateFrom] = useState('');
  var [dateTo, setDateTo] = useState('');
  var [importance, setImportance] = useState('');
  var [searchQuery, setSearchQuery] = useState('');
  var [filterTags, setFilterTags] = useState('');
  var [preview, setPreview] = useState(null);
  var [previewLoading, setPreviewLoading] = useState(false);
  var [targetIds, setTargetIds] = useState([]);
  var [allInOrg, setAllInOrg] = useState(false);
  var [mode, setMode] = useState('copy');
  var [conflictStrategy, setConflictStrategy] = useState('skip');
  var [preserveMetadata, setPreserveMetadata] = useState(true);
  var [executing, setExecuting] = useState(false);
  var [lastResult, setLastResult] = useState(null);

  // History state
  var [history, setHistory] = useState([]);
  var [historyTotal, setHistoryTotal] = useState(0);
  var [historyPage, setHistoryPage] = useState(0);
  var [historyLoading, setHistoryLoading] = useState(false);

  // Schedules state
  var [schedules, setSchedules] = useState([]);
  var [schedulesLoading, setSchedulesLoading] = useState(false);
  var [showScheduleForm, setShowScheduleForm] = useState(false);
  var [schedSourceId, setSchedSourceId] = useState('');
  var [schedTargetIds, setSchedTargetIds] = useState([]);
  var [schedMode, setSchedMode] = useState('copy');
  var [schedConflict, setSchedConflict] = useState('skip');
  var [schedType, setSchedType] = useState('daily');
  var [schedTime, setSchedTime] = useState('02:00');
  var [schedDay, setSchedDay] = useState('monday');

  // Memory detail modal
  var [selectedMemory, setSelectedMemory] = useState(null);

  // Load agents
  useEffect(function() {
    engineCall('/agents?orgId=' + effectiveOrgId).then(function(d) {
      var list = d.agents || d || [];
      setAgents(list);
      var map = {};
      list.forEach(function(a) { map[a.id] = a; });
      setAgentMap(map);
    }).catch(function() {});
  }, [effectiveOrgId]);

  // Load source stats
  useEffect(function() {
    if (!sourceId) { setSourceStats(null); return; }
    engineCall('/memory/agent/' + sourceId + '/stats').then(function(d) {
      setSourceStats(d.stats || d);
    }).catch(function() { setSourceStats(null); });
  }, [sourceId]);

  // Load history
  var loadHistory = useCallback(function() {
    setHistoryLoading(true);
    engineCall('/memory-transfer/history?limit=20&offset=' + (historyPage * 20)).then(function(d) {
      setHistory(d.history || []);
      setHistoryTotal(d.total || 0);
    }).catch(function() {}).finally(function() { setHistoryLoading(false); });
  }, [historyPage]);

  useEffect(function() { if (tab === 'history') loadHistory(); }, [tab, historyPage]);

  // Load schedules
  var loadSchedules = useCallback(function() {
    setSchedulesLoading(true);
    engineCall('/memory-transfer/schedules').then(function(d) {
      setSchedules(d.schedules || []);
    }).catch(function() {}).finally(function() { setSchedulesLoading(false); });
  }, []);

  useEffect(function() { if (tab === 'schedules') loadSchedules(); }, [tab]);

  // All in org toggle
  useEffect(function() {
    if (allInOrg) {
      setTargetIds(agents.filter(function(a) { return a.id !== sourceId; }).map(function(a) { return a.id; }));
    }
  }, [allInOrg, agents, sourceId]);

  function buildFilters() {
    var f = {};
    if (selectedCats.length < CATEGORIES.length) f.categories = selectedCats;
    if (dateFrom || dateTo) f.dateRange = { from: dateFrom, to: dateTo };
    if (importance) f.importance = importance;
    if (searchQuery) f.query = searchQuery;
    if (filterTags) f.tags = filterTags.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    return Object.keys(f).length ? f : undefined;
  }

  async function doPreview() {
    if (!sourceId) return;
    setPreviewLoading(true);
    try {
      var d = await engineCall('/memory-transfer/preview', { method: 'POST', body: JSON.stringify({ sourceAgentId: sourceId, filters: buildFilters() }) });
      setPreview(d);
    } catch (e) { toast(e.message || 'Preview failed', 'error'); }
    setPreviewLoading(false);
  }

  async function doExecute() {
    var targets = allInOrg ? agents.filter(function(a) { return a.id !== sourceId; }).map(function(a) { return a.id; }) : targetIds;
    if (!targets.length) { toast('Select target agents', 'error'); return; }
    if (targets.includes(sourceId)) { toast('Cannot transfer to the same agent', 'error'); return; }

    var sourceName = (agentMap[sourceId] && (agentMap[sourceId].config?.identity?.name || agentMap[sourceId].config?.displayName || agentMap[sourceId].config?.name)) || sourceId;
    var targetNames = targets.map(function(tid) {
      var a = agentMap[tid];
      return (a && (a.config?.identity?.name || a.config?.displayName || a.config?.name)) || tid;
    });
    var memCount = preview ? preview.count : '?';
    var conflictLabels = { skip: 'Skip existing (no duplicates)', overwrite: 'Overwrite existing matches', merge: 'Merge content into existing', append: 'Create as new (allow duplicates)' };

    var modalMsg = 'You are about to ' + (mode === 'move' ? 'MOVE' : 'COPY') + ' ' + memCount + ' memories.\n\n' +
      'FROM: ' + sourceName + '\n' +
      'TO: ' + targetNames.join(', ') + ' (' + targets.length + ' agent' + (targets.length > 1 ? 's' : '') + ')\n\n' +
      'Mode: ' + (mode === 'move' ? 'MOVE — memories will be REMOVED from the source agent after transfer' : 'COPY — memories will be duplicated, source keeps its copies') + '\n' +
      'Conflicts: ' + (conflictLabels[conflictStrategy] || conflictStrategy) + '\n' +
      'Metadata: ' + (preserveMetadata ? 'Preserved (original timestamps, source, confidence)' : 'Reset (new timestamps, admin source)') + '\n\n' +
      (mode === 'move' ? 'WARNING: Move is irreversible. The source agent will lose these memories permanently.' : 'This is safe — no data will be deleted from the source agent.');

    var ok = await window.__showConfirm({
      title: mode === 'move' ? 'Confirm Memory Move' : 'Confirm Memory Copy',
      message: modalMsg,
      danger: mode === 'move',
      confirmText: mode === 'move' ? 'Move ' + memCount + ' Memories' : 'Copy ' + memCount + ' Memories',
    });
    if (!ok) return;

    setExecuting(true);
    try {
      var d = await engineCall('/memory-transfer/execute', {
        method: 'POST',
        body: JSON.stringify({
          sourceAgentId: sourceId,
          targetAgentIds: targets,
          mode: mode,
          conflictStrategy: conflictStrategy,
          filters: buildFilters(),
          preserveMetadata: preserveMetadata,
          orgScope: effectiveOrgId,
        }),
      });
      setLastResult(d);
      toast('Transfer complete: ' + d.results.reduce(function(s, r) { return s + r.transferred; }, 0) + ' memories transferred', 'success');
      setPreview(null);
      if (sourceId) {
        engineCall('/memory/agent/' + sourceId + '/stats').then(function(d2) { setSourceStats(d2.stats || d2); }).catch(function() {});
      }
    } catch (e) { toast(e.message || 'Transfer failed', 'error'); }
    setExecuting(false);
  }

  async function createSchedule() {
    if (!schedSourceId || !schedTargetIds.length) { toast('Select source and target agents', 'error'); return; }
    try {
      await engineCall('/memory-transfer/schedule', {
        method: 'POST',
        body: JSON.stringify({
          sourceAgentId: schedSourceId,
          targetAgentIds: schedTargetIds,
          filters: {},
          mode: schedMode,
          conflictStrategy: schedConflict,
          schedule: { type: schedType, time: schedTime, dayOfWeek: schedType === 'weekly' ? schedDay : undefined },
        }),
      });
      toast('Schedule created', 'success');
      setShowScheduleForm(false);
      loadSchedules();
    } catch (e) { toast(e.message || 'Failed', 'error'); }
  }

  async function deleteSchedule(id) {
    var ok = await window.__showConfirm({ title: 'Delete Schedule', message: 'Remove this transfer schedule?', danger: true, confirmText: 'Delete' });
    if (!ok) return;
    try {
      await engineCall('/memory-transfer/schedules/' + id, { method: 'DELETE' });
      toast('Schedule deleted', 'success');
      loadSchedules();
    } catch (e) { toast(e.message || 'Failed', 'error'); }
  }

  function agentName(id) {
    var a = agentMap[id];
    return a ? (a.config?.displayName || a.config?.name || id) : id;
  }

  function toggleCat(cat) {
    setSelectedCats(function(prev) {
      return prev.includes(cat) ? prev.filter(function(c) { return c !== cat; }) : prev.concat(cat);
    });
  }

  function toggleTarget(id) {
    setAllInOrg(false);
    setTargetIds(function(prev) {
      return prev.includes(id) ? prev.filter(function(i) { return i !== id; }) : prev.concat(id);
    });
  }

  // ─── Render ──────────────────────────────────────────

  var tabStyle = function(t) { return { padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: tab === t ? 'var(--accent)' : 'var(--text-secondary)', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }; };

  return h('div', { style: { padding: 0 } },
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 } },
      h('h2', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, I.brain(), ' Memory Transfer'),
      h(KnowledgeLink, { page: 'memory-transfer' }),
      h(orgCtx.Switcher),
    ),

    // Tabs
    h('div', { style: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 } },
      h('button', { style: tabStyle('transfer'), onClick: function() { setTab('transfer'); } }, I.copy(), ' Transfer'),
      h('button', { style: tabStyle('history'), onClick: function() { setTab('history'); } }, I.clock(), ' History'),
      h('button', { style: tabStyle('schedules'), onClick: function() { setTab('schedules'); } }, I.calendar(), ' Schedules'),
    ),

    // ─── Transfer Tab ────────────────────────────────
    tab === 'transfer' && h(Fragment, null,
      // Source Agent
      h('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
        h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Source Agent'),
        h('select', { className: 'input', value: sourceId, onChange: function(e) { setSourceId(e.target.value); setPreview(null); setLastResult(null); }, style: { maxWidth: 320 } },
          h('option', { value: '' }, '— Select agent —'),
          agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config?.displayName || a.config?.name || a.id); })
        ),
        sourceStats && h('div', { style: { marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' } },
          h('div', { className: 'stat-card', style: { padding: '8px 14px' } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Total'), h('div', { style: { fontSize: 18, fontWeight: 700 } }, sourceStats.total || 0)),
          h('div', { className: 'stat-card', style: { padding: '8px 14px' } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Categories'), h('div', { style: { fontSize: 18, fontWeight: 700 } }, Object.keys(sourceStats.byCategory || {}).length)),
        ),
      ),

      // Filters
      sourceId && h('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
        h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Filters'),

        // Categories
        h('div', { style: { marginBottom: 12 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' } }, 'Categories'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setSelectedCats([...CATEGORIES]); }, style: { fontSize: 11 } }, 'Select All'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setSelectedCats([]); }, style: { fontSize: 11 } }, 'Clear'),
          ),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            CATEGORIES.map(function(cat) {
              var active = selectedCats.includes(cat);
              return h('label', { key: cat, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: active ? 'var(--accent-soft)' : 'var(--bg-tertiary)', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)') } },
                h('input', { type: 'checkbox', checked: active, onChange: function() { toggleCat(cat); }, style: { display: 'none' } }),
                cat.replace(/_/g, ' ')
              );
            })
          ),
        ),

        // Date range + importance + search
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 } },
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'From'),
            h('input', { className: 'input', type: 'date', value: dateFrom, onChange: function(e) { setDateFrom(e.target.value); }, style: { width: 150 } })
          ),
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'To'),
            h('input', { className: 'input', type: 'date', value: dateTo, onChange: function(e) { setDateTo(e.target.value); }, style: { width: 150 } })
          ),
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Importance'),
            h('select', { className: 'input', value: importance, onChange: function(e) { setImportance(e.target.value); }, style: { width: 130 } },
              h('option', { value: '' }, 'Any'),
              ['low', 'medium', 'high', 'critical'].map(function(v) { return h('option', { key: v, value: v }, v); })
            )
          ),
        ),
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
          h('div', { style: { flex: 1, minWidth: 200 } },
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Search'),
            h('input', { className: 'input', placeholder: 'Search memories...', value: searchQuery, onChange: function(e) { setSearchQuery(e.target.value); } })
          ),
          h('div', { style: { flex: 1, minWidth: 200 } },
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Tags (comma-separated)'),
            h('input', { className: 'input', placeholder: 'tag1, tag2', value: filterTags, onChange: function(e) { setFilterTags(e.target.value); } })
          ),
        ),

        // Preview button
        h('div', { style: { marginTop: 16 } },
          h('button', { className: 'btn btn-secondary', onClick: doPreview, disabled: previewLoading || !sourceId }, previewLoading ? 'Loading...' : I.search(), ' Preview'),
        ),

        // Preview results
        preview && h('div', { style: { marginTop: 16, padding: 14, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
            h('div', { style: { fontSize: 14, fontWeight: 600 } }, preview.count + ' memories matched'),
            preview.dateRange && h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, new Date(preview.dateRange.from).toLocaleDateString() + ' — ' + new Date(preview.dateRange.to).toLocaleDateString())
          ),

          // Category breakdown badges
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 } },
            Object.entries(preview.categories || {}).map(function(e) {
              return h('span', { key: e[0], className: 'badge', style: { fontSize: 11 } }, e[0].replace(/_/g, ' ') + ': ' + e[1]);
            })
          ),

          // Memory entries table
          preview.memories && preview.memories.length > 0 && h(Fragment, null,
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' } }, 'Memory Entries:'),
            h('div', { style: { maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                h('thead', null,
                  h('tr', { style: { background: 'var(--bg-secondary)', position: 'sticky', top: 0 } },
                    h('th', { style: { padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600 } }, 'Title'),
                    h('th', { style: { padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, width: 110 } }, 'Category'),
                    h('th', { style: { padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, width: 75 } }, 'Importance'),
                    h('th', { style: { padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, width: 90 } }, 'Created'),
                    h('th', { style: { padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, width: 60 } }, 'Conf.')
                  )
                ),
                h('tbody', null,
                  preview.memories.map(function(m) {
                    var impColor = m.importance === 'critical' ? 'var(--danger)' : m.importance === 'high' ? 'var(--warning)' : 'var(--text-muted)';
                    return h('tr', { key: m.id, style: { borderBottom: '1px solid var(--border)', cursor: 'pointer' }, onClick: function() { setSelectedMemory(m); } },
                      h('td', { style: { padding: '6px 10px' } },
                        h('div', { style: { fontWeight: 500, color: 'var(--accent)' } }, m.title),
                        h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginTop: 2, maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, m.content)
                      ),
                      h('td', { style: { padding: '6px 10px' } },
                        h('span', { className: 'badge', style: { fontSize: 10 } }, m.category.replace(/_/g, ' '))
                      ),
                      h('td', { style: { padding: '6px 10px', color: impColor, fontWeight: 500 } }, m.importance),
                      h('td', { style: { padding: '6px 10px', color: 'var(--text-muted)' } }, new Date(m.createdAt).toLocaleDateString()),
                      h('td', { style: { padding: '6px 10px', color: 'var(--text-muted)' } }, (m.confidence * 100).toFixed(0) + '%')
                    );
                  })
                )
              )
            ),
            preview.count > preview.memories.length && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' } }, 'Showing all ' + preview.memories.length + ' of ' + preview.count + ' entries. Content truncated to 300 chars.')
          ),

          preview.count === 0 && h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)' } }, 'No memories match the current filters. Adjust filters and try again.')
        ),
      ),

      // Target Agents
      sourceId && h('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
        h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Target Agent(s)'),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13, cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: allInOrg, onChange: function() { setAllInOrg(!allInOrg); } }),
          'All agents in organization'
        ),
        !allInOrg && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          agents.filter(function(a) { return a.id !== sourceId; }).map(function(a) {
            var sel = targetIds.includes(a.id);
            return h('label', { key: a.id, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: sel ? 'var(--accent-soft)' : 'var(--bg-tertiary)', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--border)') } },
              h('input', { type: 'checkbox', checked: sel, onChange: function() { toggleTarget(a.id); }, style: { display: 'none' } }),
              a.config?.displayName || a.config?.name || a.id
            );
          })
        ),
      ),

      // Transfer Options
      sourceId && h('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
        h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Transfer Options'),
        h('div', { style: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 } },
          h('div', null,
            h('label', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 } }, 'Mode'),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', { className: 'btn ' + (mode === 'copy' ? 'btn-primary' : 'btn-secondary') + ' btn-sm', onClick: function() { setMode('copy'); } }, I.copy(), ' Copy'),
              h('button', { className: 'btn ' + (mode === 'move' ? 'btn-danger' : 'btn-secondary') + ' btn-sm', onClick: function() { setMode('move'); } }, I.workflow(), ' Move'),
            ),
          ),
          h('div', null,
            h('label', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 } }, 'Conflict Strategy'),
            h('select', { className: 'input', value: conflictStrategy, onChange: function(e) { setConflictStrategy(e.target.value); }, style: { width: 260 } },
              CONFLICT_STRATEGIES.map(function(cs) { return h('option', { key: cs.value, value: cs.value }, cs.label); })
            ),
          ),
        ),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: preserveMetadata, onChange: function() { setPreserveMetadata(!preserveMetadata); } }),
          'Preserve original metadata'
        ),
      ),

      // Execute
      sourceId && h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
        h('button', {
          className: 'btn ' + (mode === 'move' ? 'btn-danger' : 'btn-primary'),
          onClick: doExecute,
          disabled: executing || (!targetIds.length && !allInOrg) || !sourceId || (preview && preview.count === 0),
        }, executing ? 'Transferring...' : (mode === 'move' ? 'Move Memories' : 'Copy Memories')),
        mode === 'move' && h('span', { style: { fontSize: 12, color: 'var(--danger)' } }, I.warning(), ' Move will delete source memories'),
      ),

      // Result
      lastResult && h('div', { className: 'card', style: { padding: 16, marginTop: 16, background: 'var(--success-soft, rgba(34,197,94,0.08))', border: '1px solid var(--success, #22c55e)' } },
        h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--success)' } }, I.check(), ' Transfer Complete'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } }, 'Transfer ID: ' + lastResult.transferId),
        h('table', { className: 'data-table', style: { fontSize: 12 } },
          h('thead', null, h('tr', null,
            h('th', null, 'Target'), h('th', null, 'Transferred'), h('th', null, 'Skipped'), h('th', null, 'Conflicts')
          )),
          h('tbody', null,
            (lastResult.results || []).map(function(r) {
              return h('tr', { key: r.targetAgentId },
                h('td', null, agentName(r.targetAgentId)),
                h('td', null, r.transferred),
                h('td', null, r.skipped),
                h('td', null, r.conflicts),
              );
            })
          )
        ),
      ),
    ),

    // ─── History Tab ─────────────────────────────────
    tab === 'history' && h(Fragment, null,
      historyLoading ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading...')
      : !history.length ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No transfer history')
      : h(Fragment, null,
          h('table', { className: 'data-table' },
            h('thead', null, h('tr', null,
              h('th', null, 'Date'), h('th', null, 'Source'), h('th', null, 'Targets'), h('th', null, 'Mode'), h('th', null, 'Transferred'), h('th', null, 'Skipped'), h('th', null, 'Conflicts')
            )),
            h('tbody', null,
              history.map(function(row) {
                return h('tr', { key: row.id },
                  h('td', { style: { fontSize: 12 } }, new Date(row.createdAt).toLocaleString()),
                  h('td', null, agentName(row.sourceAgentId)),
                  h('td', null, row.targetAgentIds.map(function(id) { return agentName(id); }).join(', ')),
                  h('td', null, h('span', { className: 'badge badge-' + (row.mode === 'move' ? 'danger' : 'info') }, row.mode)),
                  h('td', null, row.totalTransferred),
                  h('td', null, row.totalSkipped),
                  h('td', null, row.totalConflicts),
                );
              })
            )
          ),
          historyTotal > 20 && h('div', { style: { display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' } },
            h('button', { className: 'btn btn-secondary btn-sm', disabled: historyPage === 0, onClick: function() { setHistoryPage(historyPage - 1); } }, 'Previous'),
            h('span', { style: { fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' } }, 'Page ' + (historyPage + 1) + ' of ' + Math.ceil(historyTotal / 20)),
            h('button', { className: 'btn btn-secondary btn-sm', disabled: (historyPage + 1) * 20 >= historyTotal, onClick: function() { setHistoryPage(historyPage + 1); } }, 'Next'),
          ),
        ),
    ),

    // ─── Schedules Tab ───────────────────────────────
    tab === 'schedules' && h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 16 } },
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowScheduleForm(!showScheduleForm); } }, I.plus(), ' New Schedule'),
      ),

      // Schedule form
      showScheduleForm && h('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
        h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Create Schedule'),
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 } },
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Source Agent'),
            h('select', { className: 'input', value: schedSourceId, onChange: function(e) { setSchedSourceId(e.target.value); }, style: { width: 200 } },
              h('option', { value: '' }, '— Select —'),
              agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config?.displayName || a.config?.name || a.id); })
            ),
          ),
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Target Agent(s)'),
            h('select', { className: 'input', multiple: true, value: schedTargetIds, onChange: function(e) { setSchedTargetIds(Array.from(e.target.selectedOptions, function(o) { return o.value; })); }, style: { width: 200, height: 80 } },
              agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config?.displayName || a.config?.name || a.id); })
            ),
          ),
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Mode'),
            h('select', { className: 'input', value: schedMode, onChange: function(e) { setSchedMode(e.target.value); }, style: { width: 120 } },
              h('option', { value: 'copy' }, 'Copy'), h('option', { value: 'move' }, 'Move')
            ),
          ),
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Conflict'),
            h('select', { className: 'input', value: schedConflict, onChange: function(e) { setSchedConflict(e.target.value); }, style: { width: 150 } },
              CONFLICT_STRATEGIES.map(function(cs) { return h('option', { key: cs.value, value: cs.value }, cs.label.split(' — ')[0]); })
            ),
          ),
        ),
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 } },
          h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Schedule Type'),
            h('select', { className: 'input', value: schedType, onChange: function(e) { setSchedType(e.target.value); }, style: { width: 140 } },
              SCHEDULE_TYPES.map(function(st) { return h('option', { key: st.value, value: st.value }, st.label); })
            ),
          ),
          schedType !== 'on_change' && h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Time'),
            h('input', { className: 'input', type: 'time', value: schedTime, onChange: function(e) { setSchedTime(e.target.value); }, style: { width: 120 } }),
          ),
          schedType === 'weekly' && h('div', null,
            h('label', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } }, 'Day'),
            h('select', { className: 'input', value: schedDay, onChange: function(e) { setSchedDay(e.target.value); }, style: { width: 130 } },
              ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(d) { return h('option', { key: d, value: d }, d.charAt(0).toUpperCase() + d.slice(1)); })
            ),
          ),
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-primary btn-sm', onClick: createSchedule, disabled: !schedSourceId || !schedTargetIds.length }, 'Create'),
          h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setShowScheduleForm(false); } }, 'Cancel'),
        ),
      ),

      schedulesLoading ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading...')
      : !schedules.length ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No scheduled transfers. Create one to automate periodic memory syncing between agents.')
      : h('table', { className: 'data-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Source'), h('th', null, 'Targets'), h('th', null, 'Schedule'), h('th', null, 'Mode'), h('th', null, 'Conflict'), h('th', null, 'Actions')
          )),
          h('tbody', null,
            schedules.map(function(s) {
              var schedLabel = s.schedule.type;
              if (s.schedule.time) schedLabel += ' at ' + s.schedule.time;
              if (s.schedule.dayOfWeek) schedLabel += ' on ' + s.schedule.dayOfWeek;
              return h('tr', { key: s.id },
                h('td', null, agentName(s.sourceAgentId)),
                h('td', null, s.targetAgentIds.map(function(id) { return agentName(id); }).join(', ')),
                h('td', null, h('span', { className: 'badge' }, schedLabel)),
                h('td', null, h('span', { className: 'badge badge-' + (s.mode === 'move' ? 'danger' : 'info') }, s.mode)),
                h('td', null, s.conflictStrategy),
                h('td', null, h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { deleteSchedule(s.id); } }, I.trash())),
              );
            })
          )
        ),
    ),

    // ─── Memory Detail Modal ─────────────────────────
    selectedMemory && h(Modal, {
      title: selectedMemory.title || 'Memory Detail',
      onClose: function() { setSelectedMemory(null); },
      footer: h('button', { className: 'btn btn-secondary', onClick: function() { setSelectedMemory(null); } }, 'Close')
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        // Metadata grid
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 } },
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Category'),
            h('span', { className: 'badge', style: { fontSize: 11 } }, (selectedMemory.category || '').replace(/_/g, ' '))
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Importance'),
            h('span', { style: { fontWeight: 600, color: selectedMemory.importance === 'critical' ? 'var(--danger)' : selectedMemory.importance === 'high' ? 'var(--warning)' : 'var(--text)' } }, selectedMemory.importance || '-')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Confidence'),
            h('span', { style: { fontWeight: 600 } }, selectedMemory.confidence != null ? (selectedMemory.confidence * 100).toFixed(0) + '%' : '-')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Created'),
            h('span', null, selectedMemory.createdAt ? new Date(selectedMemory.createdAt).toLocaleString() : '-')
          ),
          selectedMemory.updatedAt && h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Updated'),
            h('span', null, new Date(selectedMemory.updatedAt).toLocaleString())
          ),
          selectedMemory.source && h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Source'),
            h('span', null, selectedMemory.source)
          ),
          selectedMemory.agentId && h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Agent'),
            h('span', null, agentName(selectedMemory.agentId))
          )
        ),

        // Tags
        selectedMemory.tags && selectedMemory.tags.length > 0 && h('div', null,
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Tags'),
          h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
            (Array.isArray(selectedMemory.tags) ? selectedMemory.tags : []).map(function(t) {
              return h('span', { key: t, className: 'badge badge-neutral', style: { fontSize: 11 } }, t);
            })
          )
        ),

        // Content
        h('div', null,
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Content'),
          h('div', {
            style: { padding: 14, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, maxHeight: 400, overflowY: 'auto' }
          }, selectedMemory.content || 'No content')
        ),

        // ID
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'ID: ' + (selectedMemory.id || '-'))
      )
    ),
  );
}
