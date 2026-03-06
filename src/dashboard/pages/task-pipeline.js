import { h, useState, useEffect, useCallback, useRef, Fragment, useApp, engineCall, apiCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

// ─── Constants ───────────────────────────────────────────
var PAGE_SIZES = [25, 50, 100];
var STATUS_COLORS = { created: '#6366f1', assigned: '#991b1b', in_progress: '#06b6d4', completed: '#15803d', failed: '#ef4444', cancelled: '#6b7394' };
var PRIORITY_COLORS = { urgent: '#ef4444', high: '#991b1b', normal: '#6366f1', low: '#6b7394' };
var DELEGATION_COLORS = { delegation: '#6366f1', review: '#991b1b', revision: '#f97316', escalation: '#ef4444', return: '#15803d' };

function sourceBadge(src) {
  var meta = { telegram: { color: '#0088cc' }, whatsapp: { color: '#25d366' }, email: { color: '#ea4335' }, google_chat: { color: '#1a73e8' }, internal: { color: '#6b7394' }, api: { color: '#8b5cf6' } };
  var icons = { telegram: E.telegram, whatsapp: E.whatsapp, email: E.email, google_chat: E.google, internal: E.gear, api: E.link };
  var m = meta[src] || { color: '#6b7394' };
  var iconFn = icons[src] || E.email;
  var label = src ? src.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }) : 'Unknown';
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: m.color + '18', color: m.color, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 } }, iconFn(10), ' ', label);
}

function tag(color, text) {
  return h('span', { style: { display: 'inline-block', fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap', background: color + '22', color: color } }, text);
}

function timeAgo(ts) {
  if (!ts) return '-';
  var diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function formatDuration(ms) {
  if (!ms) return '-';
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

// ─── CSS (injected once) ─────────────────────────────────
var _injected = false;
function injectCSS() {
  if (_injected) return; _injected = true;
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes flowPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }',
    '@keyframes taskPulse { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 0 2px rgba(6,182,212,0.15); } }',
    '.tp-row { transition: background 0.15s; }',
    '.tp-row:hover { background: var(--bg-secondary) !important; }',
    '.tp-row-active { animation: taskPulse 3s ease-in-out infinite; }',
    '.tp-tab { padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; background: none; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap; }',
    '.tp-tab:hover { color: var(--text-primary); }',
    '.tp-tab-active { color: var(--text-primary); border-bottom-color: #6366f1; }',
    '@keyframes flowDash { to { stroke-dashoffset: -24; } }',
    '.tp-flow-active { animation: flowDash 1.2s linear infinite; }',
  ].join('\n');
  document.head.appendChild(style);
}

// ─── Stats Cards ─────────────────────────────────────────
function StatsRow(props) {
  var s = props.stats;
  function card(label, value, color, sub) {
    return h('div', { style: { flex: '1 1 0', minWidth: 100, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
      h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, label),
      h('div', { style: { fontSize: 22, fontWeight: 700, color: color, lineHeight: 1 } }, value),
      sub && h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 4 } }, sub)
    );
  }
  return h('div', { style: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' } },
    card('Active', s.inProgress || 0, '#06b6d4', (s.created || 0) + ' created, ' + (s.assigned || 0) + ' assigned'),
    card('Completed', s.completed || 0, '#15803d', (s.todayCompleted || 0) + ' today'),
    card('Failed', (s.failed || 0) + (s.cancelled || 0), '#ef4444', (s.todayFailed || 0) + ' today'),
    card('Total', s.total || 0, 'var(--text-primary)', s.avgDurationMs > 0 ? 'Avg ' + formatDuration(s.avgDurationMs) : ''),
    (s.totalCost > 0 || s.totalTokens > 0) && card('Usage',
      s.totalTokens > 999999 ? (s.totalTokens / 1000000).toFixed(1) + 'M' : s.totalTokens > 999 ? (s.totalTokens / 1000).toFixed(1) + 'K' : s.totalTokens || 0,
      '#a855f7',
      s.totalCost > 0 ? '$' + s.totalCost.toFixed(2) + ' spent' : 'tokens'
    )
  );
}

// ─── Activity Log ────────────────────────────────────────
var ACTIVITY_TYPE_COLORS = {
  created: '#6366f1', assigned: '#991b1b', started: '#06b6d4', in_progress: '#06b6d4',
  completed: '#15803d', failed: '#ef4444', cancelled: '#6b7394', delegated: '#a855f7',
  compaction: '#8b5cf6', error: '#ef4444', crash: '#dc2626', recovery: '#f59e0b', note: '#3b82f6',
};

function ActivityLog(props) {
  var entries = props.entries || [];
  var _page = useState(0); var page = _page[0]; var setPage = _page[1];
  var perPage = 10;
  var totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  var pageEntries = entries.slice(page * perPage, (page + 1) * perPage);

  return h('div', { style: { marginBottom: 16 } },
    h('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 } }, 'ACTIVITY LOG (' + entries.length + ')'),
    h('div', { style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' } },
      pageEntries.map(function(entry, i) {
        var tc = ACTIVITY_TYPE_COLORS[entry.type] || 'var(--text-muted)';
        return h('div', { key: page * perPage + i, style: { display: 'flex', gap: 8, padding: '5px 10px', borderBottom: i < pageEntries.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 11, alignItems: 'flex-start' } },
          h('span', { style: { color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 65 } }, entry.ts ? new Date(entry.ts).toLocaleTimeString() : ''),
          h('span', { style: { fontWeight: 600, flexShrink: 0, minWidth: 70, color: tc, padding: '0 4px', borderRadius: 4, background: tc + '15' } }, entry.type),
          h('span', { style: { color: 'var(--text-secondary)', wordBreak: 'break-word' } }, entry.detail)
        );
      }),
      pageEntries.length === 0 && h('div', { style: { padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' } }, 'No entries')
    ),
    totalPages > 1 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11 } },
      h('span', { style: { color: 'var(--text-muted)' } }, 'Page ' + (page + 1) + '/' + totalPages),
      h('div', { style: { display: 'flex', gap: 4 } },
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page === 0, onClick: function() { setPage(page - 1); } }, 'Prev'),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages - 1, onClick: function() { setPage(page + 1); } }, 'Next')
      )
    )
  );
}

// ─── Chain Flow (inline in detail modal) ─────────────────
function ChainFlow(props) {
  var chain = props.chain;
  var currentId = props.currentId;
  var agentMap = props.agentMap || {};
  if (!chain || chain.length < 2) return null;

  var STEP_W = 110;
  var STEP_H = 40;
  var STEP_GAP = 36;
  var totalW = chain.length * STEP_W + (chain.length - 1) * STEP_GAP;

  // Build steps
  var steps = chain.map(function(ct, i) {
    var nextArrow = i < chain.length - 1 ? (chain[i + 1].delegationType || 'delegation') : null;
    return { task: ct, label: ct.assignedToName || ct.assignedTo, status: ct.status, arrow: nextArrow, duration: ct.actualDurationMs, progress: ct.progress };
  });

  return h('div', { style: { marginBottom: 16 } },
    h('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 } }, 'DELEGATION CHAIN'),
    h('div', { style: { overflowX: 'auto', padding: '4px 0' } },
      h('div', { style: { position: 'relative', height: STEP_H + 12, minWidth: totalW } },
        // SVG arrows
        h('svg', { width: totalW, height: STEP_H + 12, style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } },
          h('defs', null,
            h('marker', { id: 'chain-arr', markerWidth: 7, markerHeight: 5, refX: 7, refY: 2.5, orient: 'auto' },
              h('polygon', { points: '0 0, 7 2.5, 0 5', fill: 'var(--text-muted)' })
            )
          ),
          steps.map(function(step, i) {
            if (!step.arrow || i >= steps.length - 1) return null;
            var x1 = i * (STEP_W + STEP_GAP) + STEP_W;
            var x2 = (i + 1) * (STEP_W + STEP_GAP);
            var y = 6 + STEP_H / 2;
            var arrowColor = DELEGATION_COLORS[step.arrow] || 'rgba(99,102,241,0.5)';
            var isActive = step.status === 'in_progress';
            return h(Fragment, { key: 'a' + i },
              h('line', { x1: x1, y1: y, x2: x2, y2: y, stroke: arrowColor, strokeWidth: 2, markerEnd: 'url(#chain-arr)' }),
              isActive && h('line', { x1: x1, y1: y, x2: x2, y2: y, stroke: '#06b6d4', strokeWidth: 2, strokeDasharray: '4 12', className: 'tp-flow-active', style: { opacity: 0.7 } }),
              step.arrow !== 'delegation' && h('text', { x: (x1 + x2) / 2, y: y - 6, fill: arrowColor, fontSize: 8, textAnchor: 'middle', fontWeight: 600 }, step.arrow)
            );
          })
        ),
        // Step nodes
        steps.map(function(step, i) {
          var x = i * (STEP_W + STEP_GAP);
          var sc = STATUS_COLORS[step.status] || '#6366f1';
          var isMe = step.task.id === currentId;
          var agent = agentMap[step.task.assignedTo];
          return h('div', { key: i, style: {
            position: 'absolute', left: x, top: 6, width: STEP_W, height: STEP_H,
            background: isMe ? sc + '15' : 'var(--bg-secondary)',
            border: '1px solid ' + (isMe ? sc : 'var(--border)'),
            borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', overflow: 'hidden',
          } },
            agent && agent.avatar
              ? h('img', { src: agent.avatar, style: { width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } })
              : h('div', { style: { width: 18, height: 18, borderRadius: '50%', background: sc + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: sc, flexShrink: 0 } }, step.label.charAt(0).toUpperCase()),
            h('div', { style: { overflow: 'hidden', flex: 1, minWidth: 0 } },
              h('div', { style: { fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, step.label),
              h('div', { style: { fontSize: 8, color: 'var(--text-muted)' } }, step.status.replace('_', ' '), step.duration ? ' · ' + formatDuration(step.duration) : '')
            )
          );
        })
      )
    )
  );
}

// ─── Task Detail Modal ───────────────────────────────────
function TaskDetail(props) {
  var task = props.task;
  var chain = props.chain;
  var onClose = props.onClose;
  var onCancel = props.onCancel;
  var agentMap = props.agentMap || {};
  if (!task) return null;
  var sc = STATUS_COLORS[task.status] || '#6b7394';

  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 640, maxHeight: '85vh', overflow: 'auto' } },
      h('div', { className: 'modal-header' },
        h('h2', { style: { fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, task.title),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, '\u00D7')
      ),
      h('div', { className: 'modal-body', style: { padding: 20 } },
        // Badges
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: sc + '22', color: sc, border: '1px solid ' + sc + '44' } }, task.status.replace('_', ' ').toUpperCase()),
          h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, background: (PRIORITY_COLORS[task.priority] || '#6366f1') + '22', color: PRIORITY_COLORS[task.priority] || '#6366f1' } }, (task.priority || 'normal').toUpperCase()),
          task.source && sourceBadge(task.source),
          task.chainId && h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontFamily: 'var(--font-mono)' } }, 'Chain #' + task.chainId.slice(0, 8)),
          task.delegationType && tag(DELEGATION_COLORS[task.delegationType] || '#6b7394', task.delegationType)
        ),

        // Customer
        task.customerContext && h('div', { style: { padding: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 } }, 'CUSTOMER'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 } },
            task.customerContext.name && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Name'), h('div', null, task.customerContext.name)),
            task.customerContext.email && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Email'), h('div', null, task.customerContext.email)),
            task.customerContext.company && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Company'), h('div', null, task.customerContext.company))
          )
        ),

        task.description && h('div', { style: { marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' } }, task.description),

        // Progress
        task.status === 'in_progress' && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } }, h('span', null, 'Progress'), h('span', null, (task.progress || 0) + '%')),
          h('div', { style: { height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: (task.progress || 0) + '%', background: '#06b6d4', borderRadius: 3, transition: 'width 0.3s' } })
          )
        ),

        // Details grid
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13, marginBottom: 16 } },
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Assigned To'), h('div', null, task.assignedToName || task.assignedTo || '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Created By'), h('div', null, task.createdByName || task.createdBy || '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Created'), h('div', null, task.createdAt ? new Date(task.createdAt).toLocaleString() : '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Duration'), h('div', null, formatDuration(task.actualDurationMs))),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Model'), h('div', null, task.modelUsed || (typeof task.model === 'string' ? task.model : (task.model ? (task.model.modelId || task.model.provider || JSON.stringify(task.model)) : '-')))),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Tokens / Cost'), h('div', null, (task.tokensUsed || 0).toLocaleString() + ' / $' + (task.costUsd || 0).toFixed(4))),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Source'), task.source ? sourceBadge(task.source) : h('div', null, '-'))
        ),

        // Chain flow
        chain && chain.length > 1 && h(ChainFlow, { chain: chain, currentId: task.id, agentMap: agentMap }),

        // Activity log
        task.activityLog && task.activityLog.length > 0 && h(ActivityLog, { entries: task.activityLog }),

        // Error
        task.error && h('div', { style: { padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13, color: '#ef4444' } }, h('strong', null, 'Error: '), task.error),

        // Actions
        (task.status === 'created' || task.status === 'assigned' || task.status === 'in_progress') && h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 } },
          h('button', { className: 'btn btn-danger btn-sm', onClick: function() { onCancel(task.id); } }, 'Cancel Task')
        )
      )
    )
  );
}

// ─── Main Page ───────────────────────────────────────────
export function TaskPipelinePage() {
  injectCSS();
  var app = useApp();
  var toast = app.toast;
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();

  var _tasks = useState([]); var tasks = _tasks[0]; var setTasks = _tasks[1];
  var _totalCount = useState(0); var totalCount = _totalCount[0]; var setTotalCount = _totalCount[1];
  var _stats = useState({ created: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0, cancelled: 0, total: 0, todayCompleted: 0, todayFailed: 0, todayCreated: 0, avgDurationMs: 0, totalCost: 0, totalTokens: 0, topAgents: [] });
  var stats = _stats[0]; var setStats = _stats[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _tab = useState('active'); var tab = _tab[0]; var setTab = _tab[1];
  var _page = useState(0); var page = _page[0]; var setPage = _page[1];
  var _pageSize = useState(25); var pageSize = _pageSize[0]; var setPageSize = _pageSize[1];
  var _search = useState(''); var search = _search[0]; var setSearch = _search[1];
  var _sortBy = useState('createdAt'); var sortBy = _sortBy[0]; var setSortBy = _sortBy[1];
  var _sortDir = useState('desc'); var sortDir = _sortDir[0]; var setSortDir = _sortDir[1];
  var _selectedTask = useState(null); var selectedTask = _selectedTask[0]; var setSelectedTask = _selectedTask[1];
  var _selectedChain = useState(null); var selectedChain = _selectedChain[0]; var setSelectedChain = _selectedChain[1];
  var _agentMap = useState({}); var agentMap = _agentMap[0]; var setAgentMap = _agentMap[1];
  var searchTimer = useRef(null);

  // Load agents for avatar/name resolution
  useEffect(function() {
    apiCall('/agents' + (orgCtx.selectedOrgId ? '?clientOrgId=' + orgCtx.selectedOrgId : '')).then(function(res) {
      var agents = res?.agents || res || [];
      if (!Array.isArray(agents)) agents = [];
      var map = {};
      agents.forEach(function(a) {
        map[a.id] = { name: a.config?.name || a.name || a.id, avatar: a.config?.identity?.avatar || a.config?.avatar || a.config?.persona?.avatar || null };
      });
      setAgentMap(map);
    }).catch(function() {});
  }, [effectiveOrgId]);

  // Load tasks
  var loadTasks = useCallback(function() {
    setLoading(true);
    var limit = pageSize;
    var offset = page * pageSize;
    engineCall('/task-pipeline?limit=' + limit + '&offset=' + offset).then(function(res) {
      var allTasks = res?.tasks || [];
      // Client-side filtering (server should ideally do this)
      var filtered = allTasks;
      // Tab filter
      if (tab === 'active') filtered = filtered.filter(function(t) { return t.status === 'created' || t.status === 'assigned' || t.status === 'in_progress'; });
      else if (tab === 'completed') filtered = filtered.filter(function(t) { return t.status === 'completed'; });
      else if (tab === 'failed') filtered = filtered.filter(function(t) { return t.status === 'failed' || t.status === 'cancelled'; });
      // Search
      if (search) {
        var q = search.toLowerCase();
        filtered = filtered.filter(function(t) {
          return (t.title || '').toLowerCase().includes(q)
            || (t.assignedToName || t.assignedTo || '').toLowerCase().includes(q)
            || (t.createdByName || t.createdBy || '').toLowerCase().includes(q)
            || (t.description || '').toLowerCase().includes(q)
            || (t.category || '').toLowerCase().includes(q);
        });
      }
      // Sort
      filtered.sort(function(a, b) {
        var va = a[sortBy] || '';
        var vb = b[sortBy] || '';
        if (sortBy === 'createdAt' || sortBy === 'completedAt') {
          va = new Date(va || 0).getTime();
          vb = new Date(vb || 0).getTime();
        }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      setTasks(filtered);
      setTotalCount(allTasks.length); // approximate
    }).catch(function(err) { console.error('[TaskPipeline]', err); })
      .finally(function() { setLoading(false); });
  }, [effectiveOrgId, tab, page, pageSize, search, sortBy, sortDir]);

  var loadStats = useCallback(function() {
    engineCall('/task-pipeline/stats').then(function(s) { if (s) setStats(s); }).catch(function() {});
  }, [effectiveOrgId]);

  useEffect(function() {
    loadTasks();
    loadStats();
  }, [loadTasks, loadStats]);

  // SSE for real-time updates
  useEffect(function() {
    var baseUrl = window.__ENGINE_BASE || '/api/engine';
    var es;
    try {
      es = new EventSource(baseUrl + '/task-pipeline/stream');
      es.onmessage = function(e) {
        try {
          var event = JSON.parse(e.data);
          if (event.task) {
            var matchesTab = function(status) {
              if (tab === 'all') return true;
              if (tab === 'active') return status === 'created' || status === 'assigned' || status === 'in_progress';
              if (tab === 'completed') return status === 'completed';
              if (tab === 'failed') return status === 'failed' || status === 'cancelled';
              return true;
            };
            setTasks(function(prev) {
              var idx = prev.findIndex(function(t) { return t.id === event.task.id; });
              if (idx >= 0) {
                // Task exists in list — update it, then remove if it no longer matches tab
                if (!matchesTab(event.task.status)) {
                  // Status changed and no longer belongs in this tab — remove it
                  return prev.filter(function(t) { return t.id !== event.task.id; });
                }
                var next = prev.slice();
                next[idx] = Object.assign({}, next[idx], event.task);
                return next;
              }
              // New task — add if it matches current tab
              if (matchesTab(event.task.status)) return [event.task].concat(prev);
              return prev;
            });
            // Update selected task if it's open
            setSelectedTask(function(prev) { return prev && prev.id === event.task.id ? Object.assign({}, prev, event.task) : prev; });
            // Refresh stats
            loadStats();
          }
          if (event.type === 'init' && event.stats) setStats(event.stats);
        } catch (err) {}
      };
    } catch (err) {}
    return function() { if (es) es.close(); };
  }, [tab]);

  // (Tab filtering is handled inline in SSE handler + loadTasks)

  var cancelTask = useCallback(function(taskId) {
    engineCall('/task-pipeline/' + taskId + '/cancel', { method: 'POST' }).then(function() {
      toast('Task cancelled', 'success');
      setSelectedTask(null);
      loadTasks();
    }).catch(function(err) { toast(err.message || 'Failed', 'error'); });
  }, [loadTasks]);

  function openTask(t) {
    setSelectedTask(t);
    if (t.chainId) {
      engineCall('/task-pipeline/chain/' + t.chainId).then(function(res) {
        var chain = res?.chain || [];
        chain.sort(function(a, b) { return (a.chainSeq || 0) - (b.chainSeq || 0); });
        setSelectedChain(chain.length > 1 ? chain : null);
      }).catch(function() { setSelectedChain(null); });
    } else {
      setSelectedChain(null);
    }
  }

  function handleSort(col) {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  function sortIcon(col) {
    if (sortBy !== col) return h('span', { style: { opacity: 0.2, fontSize: 10 } }, '\u2195');
    return h('span', { style: { fontSize: 10 } }, sortDir === 'asc' ? '\u2191' : '\u2193');
  }

  var handleSearch = function(e) {
    var val = e.target.value;
    setSearch(val);
    setPage(0);
  };

  var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Tab counts
  var tabCounts = { active: (stats.inProgress || 0) + (stats.created || 0) + (stats.assigned || 0), completed: stats.completed || 0, failed: (stats.failed || 0) + (stats.cancelled || 0), all: stats.total || 0 };

  return h(Fragment, null, h(orgCtx.Switcher),
    h('div', { style: { padding: 0 } },
      // Header
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          I.workflow(),
          h('h1', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, 'Task Pipeline'),
          h(KnowledgeLink, { page: 'task-pipeline' }),
          h(HelpButton, { label: 'Task Pipeline' },
            h('p', null, 'View and manage all agent tasks. Tasks update in real-time via SSE.'),
            h('ul', { style: { paddingLeft: 20, margin: '8px 0' } },
              h('li', null, 'Click any row to see full details, chain flow, and activity log'),
              h('li', null, 'Use tabs to filter by status'),
              h('li', null, 'Search by title, agent, or description'),
              h('li', null, 'Sort by clicking column headers')
            )
          )
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 } },
          h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: '#15803d', animation: 'flowPulse 2s infinite' } }),
          h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Live')
        ),
        h('div', { style: { flex: 1 } }),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { loadTasks(); loadStats(); } }, 'Refresh')
      ),

      // Stats
      h(StatsRow, { stats: stats }),

      // Tabs + Search
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 0 } },
        ['active', 'completed', 'failed', 'all'].map(function(t) {
          var label = t.charAt(0).toUpperCase() + t.slice(1);
          var count = tabCounts[t] || 0;
          return h('button', {
            key: t,
            className: 'tp-tab' + (tab === t ? ' tp-tab-active' : ''),
            onClick: function() { setTab(t); setPage(0); }
          }, label + ' (' + count + ')');
        }),
        h('div', { style: { flex: 1 } }),
        h('input', {
          type: 'text', placeholder: 'Search tasks...', value: search,
          onChange: handleSearch,
          style: { padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 200, outline: 'none' }
        })
      ),

      // Table
      h('div', { style: { border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius) var(--radius)', overflow: 'hidden' } },
        // Header
        h('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr 100px 80px 90px 80px 60px', gap: 0, padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', userSelect: 'none' } },
          h('div', { style: { cursor: 'pointer' }, onClick: function() { handleSort('title'); } }, 'Task ', sortIcon('title')),
          h('div', { style: { cursor: 'pointer' }, onClick: function() { handleSort('assignedToName'); } }, 'Agent ', sortIcon('assignedToName')),
          h('div', { style: { cursor: 'pointer' }, onClick: function() { handleSort('status'); } }, 'Status ', sortIcon('status')),
          h('div', null, 'Priority'),
          h('div', { style: { cursor: 'pointer' }, onClick: function() { handleSort('createdAt'); } }, 'Created ', sortIcon('createdAt')),
          h('div', null, 'Duration'),
          h('div', null, 'Source')
        ),

        // Rows
        loading && tasks.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'Loading...')
          : tasks.length === 0
            ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } },
                h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, 'No tasks found'),
                h('div', { style: { fontSize: 12 } }, search ? 'Try a different search term' : 'Tasks will appear here as agents are assigned work')
              )
            : tasks.map(function(t) {
                var sc = STATUS_COLORS[t.status] || '#6b7394';
                var agent = agentMap[t.assignedTo];
                var isActive = t.status === 'in_progress';
                return h('div', {
                  key: t.id,
                  className: 'tp-row' + (isActive ? ' tp-row-active' : ''),
                  onClick: function() { openTask(t); },
                  style: { display: 'grid', gridTemplateColumns: '2fr 1fr 100px 80px 90px 80px 60px', gap: 0, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center', fontSize: 12 }
                },
                  // Task title + chain indicator
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' } },
                    t.chainId && h('div', { style: { width: 3, height: 20, borderRadius: 2, background: '#6366f1', flexShrink: 0 } }),
                    h('div', { style: { overflow: 'hidden' } },
                      h('div', { style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.title),
                      (t.category || t.delegationType) && h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 4, alignItems: 'center' } },
                        t.category,
                        t.delegationType && tag(DELEGATION_COLORS[t.delegationType] || '#6b7394', t.delegationType)
                      )
                    )
                  ),
                  // Agent
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' } },
                    agent && agent.avatar
                      ? h('img', { src: agent.avatar, style: { width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } })
                      : h('div', { style: { width: 20, height: 20, borderRadius: '50%', background: sc + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: sc, flexShrink: 0 } },
                          (t.assignedToName || t.assignedTo || '?').charAt(0).toUpperCase()
                        ),
                    h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 } }, t.assignedToName || (agent && agent.name) || t.assignedTo || '-')
                  ),
                  // Status
                  h('div', null,
                    h('span', { style: { padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: sc + '22', color: sc } }, t.status.replace('_', ' ')),
                    isActive && t.progress > 0 && h('div', { style: { height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' } },
                      h('div', { style: { height: '100%', width: t.progress + '%', background: '#06b6d4', borderRadius: 2 } })
                    )
                  ),
                  // Priority
                  h('div', null,
                    h('span', { style: { fontSize: 10, fontWeight: 600, color: PRIORITY_COLORS[t.priority] || '#6366f1' } }, (t.priority || 'normal'))
                  ),
                  // Created
                  h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, timeAgo(t.createdAt)),
                  // Duration
                  h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, formatDuration(t.actualDurationMs)),
                  // Source
                  h('div', null, t.source ? sourceBadge(t.source) : h('span', { style: { fontSize: 10, color: 'var(--text-muted)' } }, '-'))
                );
              })
      ),

      // Pagination
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', fontSize: 12 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' } },
          h('span', null, 'Showing ' + tasks.length + ' of ' + (stats.total || totalCount) + ' tasks'),
          h('select', {
            value: pageSize,
            onChange: function(e) { setPageSize(parseInt(e.target.value)); setPage(0); },
            style: { padding: '3px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }
          },
            PAGE_SIZES.map(function(s) { return h('option', { key: s, value: s }, s + ' per page'); })
          )
        ),
        h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
          h('button', { className: 'btn btn-ghost btn-sm', disabled: page === 0, onClick: function() { setPage(0); } }, 'First'),
          h('button', { className: 'btn btn-ghost btn-sm', disabled: page === 0, onClick: function() { setPage(page - 1); } }, 'Prev'),
          h('span', { style: { padding: '0 8px', color: 'var(--text-muted)' } }, 'Page ' + (page + 1)),
          h('button', { className: 'btn btn-ghost btn-sm', disabled: tasks.length < pageSize, onClick: function() { setPage(page + 1); } }, 'Next')
        )
      )
    ),

    // Detail modal
    selectedTask && h(TaskDetail, { task: selectedTask, chain: selectedChain, onClose: function() { setSelectedTask(null); setSelectedChain(null); }, onCancel: cancelTask, agentMap: agentMap })
  );
}

// ─── Agent Task Pipeline (reusable mini for agent-detail workforce tab) ─
export function AgentTaskPipeline(props) {
  var agentId = props.agentId;
  var _tasks = useState([]); var tasks = _tasks[0]; var setTasks = _tasks[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _selectedTask = useState(null); var selectedTask = _selectedTask[0]; var setSelectedTask = _selectedTask[1];
  var app = useApp();
  var toast = app.toast;

  useEffect(function() {
    setLoading(true);
    engineCall('/task-pipeline/agent/' + agentId + '?completed=true').then(function(res) {
      setTasks(res?.tasks || []);
    }).catch(function() {}).finally(function() { setLoading(false); });
    var baseUrl = window.__ENGINE_BASE || '/api/engine';
    var es;
    try {
      es = new EventSource(baseUrl + '/task-pipeline/stream');
      es.onmessage = function(e) {
        try {
          var event = JSON.parse(e.data);
          if (event.task && event.task.assignedTo === agentId) {
            setTasks(function(prev) {
              var idx = prev.findIndex(function(t) { return t.id === event.task.id; });
              if (idx >= 0) { var next = prev.slice(); next[idx] = event.task; return next; }
              return [event.task].concat(prev);
            });
          }
        } catch (err) {}
      };
    } catch (err) {}
    return function() { if (es) es.close(); };
  }, [agentId]);

  var cancelTask = useCallback(function(taskId) {
    engineCall('/task-pipeline/' + taskId + '/cancel', { method: 'POST' }).then(function() {
      toast('Task cancelled', 'success');
      setSelectedTask(null);
    }).catch(function(err) { toast(err.message, 'error'); });
  }, []);

  if (loading) return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'Loading tasks...');
  if (!tasks.length) return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No pipeline tasks for this agent yet.');

  var active = tasks.filter(function(t) { return t.status === 'created' || t.status === 'assigned' || t.status === 'in_progress'; });
  var completed = tasks.filter(function(t) { return t.status === 'completed'; });
  var failed = tasks.filter(function(t) { return t.status === 'failed' || t.status === 'cancelled'; });

  function renderTaskRow(t) {
    var sc = STATUS_COLORS[t.status] || '#6b7394';
    return h('div', {
      key: t.id, onClick: function() { setSelectedTask(t); },
      style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' },
      onMouseEnter: function(e) { e.currentTarget.style.background = 'var(--bg-secondary)'; },
      onMouseLeave: function(e) { e.currentTarget.style.background = ''; },
    },
      h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 } }),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.title),
        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 4, alignItems: 'center' } },
          t.category,
          t.delegationType && h('span', { style: { color: DELEGATION_COLORS[t.delegationType] || '#6b7394' } }, '\u2192 ' + t.delegationType),
          h('span', null, '\u00B7 ' + timeAgo(t.createdAt))
        )
      ),
      t.status === 'in_progress' && t.progress > 0 && h('span', { style: { fontSize: 10, color: sc, fontWeight: 600 } }, t.progress + '%'),
      h('span', { style: { padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600, background: sc + '22', color: sc, flexShrink: 0 } }, t.status.replace('_', ' ')),
      t.actualDurationMs && h('span', { style: { fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 } }, formatDuration(t.actualDurationMs))
    );
  }

  return h(Fragment, null,
    active.length > 0 && h('div', { style: { marginBottom: 12 } },
      h('div', { style: { fontSize: 11, fontWeight: 600, color: STATUS_COLORS.in_progress, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 } },
        h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS.in_progress, animation: 'flowPulse 2s infinite' } }),
        'Active (' + active.length + ')'
      ),
      h('div', { style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' } }, active.map(renderTaskRow))
    ),
    completed.length > 0 && h('div', { style: { marginBottom: 12 } },
      h('div', { style: { fontSize: 11, fontWeight: 600, color: STATUS_COLORS.completed, marginBottom: 6 } }, 'Completed (' + completed.length + ')'),
      h('div', { style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' } }, completed.slice(0, 10).map(renderTaskRow)),
      completed.length > 10 && h('div', { style: { padding: 6, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' } }, '+ ' + (completed.length - 10) + ' more')
    ),
    failed.length > 0 && h('div', { style: { marginBottom: 12 } },
      h('div', { style: { fontSize: 11, fontWeight: 600, color: STATUS_COLORS.failed, marginBottom: 6 } }, 'Failed (' + failed.length + ')'),
      h('div', { style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' } }, failed.slice(0, 5).map(renderTaskRow))
    ),
    selectedTask && h(TaskDetail, { task: selectedTask, chain: null, onClose: function() { setSelectedTask(null); }, onCancel: cancelTask, agentMap: {} })
  );
}
