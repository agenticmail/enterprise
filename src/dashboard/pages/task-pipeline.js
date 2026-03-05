import { h, useState, useEffect, useCallback, useRef, Fragment, useApp, engineCall, apiCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

// ─── Constants ───────────────────────────────────────────
var NODE_W = 200;
var NODE_H = 52;
var AGENT_W = 130;
var AGENT_H = 40;
var H_GAP = 32; // horizontal gap (left→right flow)
var V_GAP = 12; // vertical gap between lanes
var PAD = 16;

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
// Theme-aware: use CSS variables where possible, detect dark/light
function isDark() { try { return window.matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.classList.contains('dark') || document.body.getAttribute('data-theme') === 'dark'; } catch(e) { return true; } }
var BG = 'var(--bg-canvas, var(--bg-primary, #0a0c14))';
var EDGE_COLOR = 'var(--tp-edge, rgba(128,128,128,0.25))';
var EDGE_HL = 'rgba(99,102,241,0.7)';

// ─── CSS Keyframes (injected once) ──────────────────────
var _injected = false;
function injectCSS() {
  if (_injected) return; _injected = true;
  var style = document.createElement('style');
  style.textContent = `
    :root { --tp-bg: #0a0c14; --tp-text: #fff; --tp-text-dim: rgba(255,255,255,0.4); --tp-text-faint: rgba(255,255,255,0.15); --tp-border: rgba(255,255,255,0.08); --tp-card: rgba(255,255,255,0.02); --tp-card-hover: rgba(255,255,255,0.06); --tp-edge: rgba(255,255,255,0.18); --tp-toolbar: rgba(0,0,0,0.3); --tp-metrics: rgba(0,0,0,0.12); }
    [data-theme="light"], .light, :root:not(.dark) { --tp-bg: var(--bg-primary, #f8fafc); --tp-text: var(--text-primary, #1e293b); --tp-text-dim: var(--text-muted, #64748b); --tp-text-faint: rgba(0,0,0,0.06); --tp-border: var(--border, rgba(0,0,0,0.08)); --tp-card: rgba(0,0,0,0.02); --tp-card-hover: rgba(0,0,0,0.05); --tp-edge: rgba(0,0,0,0.2); --tp-toolbar: rgba(0,0,0,0.03); --tp-metrics: rgba(0,0,0,0.02); }
    @media (prefers-color-scheme: light) { :root:not(.dark) { --tp-bg: var(--bg-primary, #f8fafc); --tp-text: var(--text-primary, #1e293b); --tp-text-dim: var(--text-muted, #64748b); --tp-text-faint: rgba(0,0,0,0.06); --tp-border: var(--border, rgba(0,0,0,0.08)); --tp-card: rgba(0,0,0,0.02); --tp-card-hover: rgba(0,0,0,0.05); --tp-edge: rgba(0,0,0,0.2); --tp-toolbar: rgba(0,0,0,0.03); --tp-metrics: rgba(0,0,0,0.02); } }
    @keyframes flowDash { to { stroke-dashoffset: -24; } }
    @keyframes flowPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
    @keyframes taskPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.3); } 50% { box-shadow: 0 0 8px 2px rgba(6,182,212,0.2); } }
    .tp-flow-active { animation: flowDash 1.2s linear infinite; }
    .tp-node-active { animation: taskPulse 2s ease-in-out infinite; }
    .tp-node:hover { transform: scale(1.03); z-index: 10; }
    .tp-chain-tag { font-size: 9px; padding: 1px 5px; border-radius: 4px; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; flex-shrink: 0; }
  `;
  document.head.appendChild(style);
}

// ─── Layout: Left-to-Right Chain Flow ────────────────────
// Tasks flow horizontally. Each chain = a horizontal row.
// Multiple chains stack vertically. Circular flows curve back.

function layoutChains(tasks) {
  if (!tasks.length) return { nodes: [], edges: [], width: 0, height: 0, chains: [] };

  // Group by chainId — but single-task chains are treated as orphans (no chain)
  var chainMap = new Map();
  var orphans = [];
  var tempChains = new Map();
  tasks.forEach(function(t) {
    if (t.chainId) {
      if (!tempChains.has(t.chainId)) tempChains.set(t.chainId, []);
      tempChains.get(t.chainId).push(t);
    } else {
      orphans.push(t);
    }
  });
  // Only keep chains with 2+ tasks; singles become orphans
  tempChains.forEach(function(arr, key) {
    if (arr.length > 1) { chainMap.set(key, arr); }
    else { orphans = orphans.concat(arr); }
  });

  // Sort each chain by chainSeq
  chainMap.forEach(function(arr) { arr.sort(function(a, b) { return (a.chainSeq || 0) - (b.chainSeq || 0); }); });

  // Also group orphans by agent for a simpler layout
  var orphansByAgent = new Map();
  orphans.forEach(function(t) {
    var key = t.assignedTo || 'unassigned';
    if (!orphansByAgent.has(key)) orphansByAgent.set(key, []);
    orphansByAgent.get(key).push(t);
  });

  var allNodes = [];
  var allEdges = [];
  var chainInfos = [];
  var y = PAD;

  // Layout each chain as a horizontal row
  chainMap.forEach(function(chainTasks, chainId) {
    var x = PAD;
    var rowNodes = [];
    var maxH = NODE_H;

    chainTasks.forEach(function(t, i) {
      var node = { id: t.id, task: t, x: x, y: y, w: NODE_W, h: NODE_H, isAgent: false, chainId: chainId };
      rowNodes.push(node);
      allNodes.push(node);

      if (i > 0) {
        var prev = rowNodes[i - 1];
        var dtype = t.delegationType || 'delegation';
        var isReturn = dtype === 'return' || dtype === 'revision';
        // Check for circular: does this task go back to an agent already seen?
        var seenAgents = chainTasks.slice(0, i).map(function(ct) { return ct.assignedTo; });
        var isCircular = seenAgents.indexOf(t.assignedTo) !== -1 && isReturn;

        allEdges.push({
          from: prev, to: node,
          delegationType: dtype,
          isCircular: isCircular,
          isActive: prev.task.status === 'in_progress' || t.status === 'in_progress',
        });
      }

      x += NODE_W + H_GAP;
    });

    // Customer context badge on first node
    var firstTask = chainTasks[0];
    chainInfos.push({
      chainId: chainId,
      y: y,
      taskCount: chainTasks.length,
      customer: firstTask.customerContext,
      status: chainTasks[chainTasks.length - 1].status,
      title: firstTask.title,
    });

    y += maxH + V_GAP + 8; // space between chains
  });

  // Layout orphans horizontally in a single row (with wrap if too many)
  var orphanList = [];
  orphansByAgent.forEach(function(agentTasks) { orphanList = orphanList.concat(agentTasks); });
  if (orphanList.length > 0) {
    var x = PAD;
    orphanList.forEach(function(t) {
      allNodes.push({ id: t.id, task: t, x: x, y: y, w: NODE_W, h: NODE_H, isAgent: false, chainId: null });
      x += NODE_W + H_GAP;
    });
    y += NODE_H + V_GAP;
  }

  var maxX = 0;
  allNodes.forEach(function(n) { maxX = Math.max(maxX, n.x + n.w); });

  return { nodes: allNodes, edges: allEdges, width: maxX + PAD, height: y + PAD, chains: chainInfos };
}

// ─── SVG Edge Paths ──────────────────────────────────────
function horizontalPath(from, to) {
  var x1 = from.x + from.w;
  var y1 = from.y + from.h / 2;
  var x2 = to.x;
  var y2 = to.y + to.h / 2;
  var midX = x1 + (x2 - x1) * 0.5;
  return 'M ' + x1 + ' ' + y1 + ' C ' + midX + ' ' + y1 + ', ' + midX + ' ' + y2 + ', ' + x2 + ' ' + y2;
}

function circularPath(from, to) {
  // Arc back: goes up and curves back left
  var x1 = from.x + from.w;
  var y1 = from.y + from.h / 2;
  var x2 = to.x;
  var y2 = to.y + to.h / 2;
  var lift = 28;
  var topY = Math.min(y1, y2) - lift;
  return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 50) + ' ' + topY + ', ' + (x2 - 50) + ' ' + topY + ', ' + x2 + ' ' + y2;
}

// ─── Helpers ─────────────────────────────────────────────
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
function tag(color, text) { return h('span', { className: 'tp-chain-tag', style: { background: color + '22', color: color } }, text); }

var toolbarBtnStyle = {
  background: 'var(--tp-border)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, color: 'var(--tp-text)', fontSize: 12, fontWeight: 600, padding: '4px 10px', cursor: 'pointer',
};
function legendDot(color, label) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
    h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: color } }),
    h('span', { style: { color: 'var(--tp-text-dim)', fontSize: 11 } }, label)
  );
}
var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

// ─── Customer Profile Mini-Card ──────────────────────────
function CustomerBadge(props) {
  var c = props.customer;
  if (!c) return null;
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: 11, marginBottom: 4 } },
    h('div', { style: { width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tp-text)', fontSize: 9, fontWeight: 700, flexShrink: 0 } }, (c.name || '?').charAt(0).toUpperCase()),
    h('div', { style: { overflow: 'hidden' } },
      h('div', { style: { fontWeight: 600, color: 'var(--tp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, c.name || 'Unknown'),
      h('div', { style: { color: 'var(--tp-text-dim)', fontSize: 9 } },
        c.isNew ? 'New customer' : (c.company || c.email || c.channel || '')
      )
    )
  );
}

// ─── Task Detail Modal ───────────────────────────────────
// ─── Activity Log Component ──────────────────────────────
var ACTIVITY_PAGE_SIZE = 10;
var ACTIVITY_TYPE_COLORS = {
  created: '#6366f1', assigned: '#991b1b', started: '#06b6d4', in_progress: '#06b6d4',
  completed: '#15803d', failed: '#ef4444', cancelled: '#6b7394', delegated: '#a855f7',
  compaction: '#8b5cf6', error: '#ef4444',
  crash: '#dc2626', recovery: '#f59e0b', note: '#3b82f6',
};

function ActivityLog(props) {
  var entries = props.entries || [];
  var _search = useState(''); var search = _search[0]; var setSearch = _search[1];
  var _typeFilter = useState('all'); var typeFilter = _typeFilter[0]; var setTypeFilter = _typeFilter[1];
  var _page = useState(0); var page = _page[0]; var setPage = _page[1];

  // Get unique types for filter dropdown
  var types = [];
  var seen = {};
  entries.forEach(function(e) { if (e.type && !seen[e.type]) { seen[e.type] = true; types.push(e.type); } });

  // Filter
  var filtered = entries.filter(function(e) {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (search) {
      var q = search.toLowerCase();
      return (e.type || '').toLowerCase().includes(q) || (e.detail || '').toLowerCase().includes(q) || (e.agent || '').toLowerCase().includes(q);
    }
    return true;
  });

  var totalPages = Math.max(1, Math.ceil(filtered.length / ACTIVITY_PAGE_SIZE));
  if (page >= totalPages) page = totalPages - 1;
  var pageEntries = filtered.slice(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE);

  return h('div', { style: { marginBottom: 16 } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' } },
      h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' } }, 'ACTIVITY LOG (' + filtered.length + ')'),
      h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
        h('input', {
          placeholder: 'Search...', value: search,
          onChange: function(e) { setSearch(e.target.value); setPage(0); },
          style: { padding: '3px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 120, outline: 'none' }
        }),
        h('select', {
          value: typeFilter,
          onChange: function(e) { setTypeFilter(e.target.value); setPage(0); },
          style: { padding: '3px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }
        },
          h('option', { value: 'all' }, 'All types'),
          types.map(function(t) { return h('option', { key: t, value: t }, t); })
        )
      )
    ),
    h('div', { style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' } },
      pageEntries.map(function(entry, i) {
        var tc = ACTIVITY_TYPE_COLORS[entry.type] || 'var(--text-muted)';
        return h('div', { key: page * ACTIVITY_PAGE_SIZE + i, style: { display: 'flex', gap: 8, padding: '6px 10px', borderBottom: i < pageEntries.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 11, alignItems: 'flex-start' } },
          h('span', { style: { color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 65 } }, entry.ts ? new Date(entry.ts).toLocaleTimeString() : ''),
          h('span', { style: { fontWeight: 600, flexShrink: 0, minWidth: 70, color: tc, padding: '0 4px', borderRadius: 4, background: tc + '15' } }, entry.type),
          h('span', { style: { color: 'var(--text-secondary)', wordBreak: 'break-word' } }, entry.detail)
        );
      }),
      pageEntries.length === 0 && h('div', { style: { padding: '12px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' } }, 'No matching entries')
    ),
    // Pagination
    totalPages > 1 && h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 11 } },
      h('span', { style: { color: 'var(--text-muted)' } }, 'Page ' + (page + 1) + ' of ' + totalPages),
      h('div', { style: { display: 'flex', gap: 4 } },
        h('button', {
          disabled: page === 0,
          onClick: function() { setPage(page - 1); },
          style: { padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'default' : 'pointer' }
        }, 'Prev'),
        h('button', {
          disabled: page >= totalPages - 1,
          onClick: function() { setPage(page + 1); },
          style: { padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: page >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }
        }, 'Next')
      )
    )
  );
}

function TaskDetail(props) {
  var task = props.task;
  var chain = props.chain;
  var onClose = props.onClose;
  var onCancel = props.onCancel;
  if (!task) return null;
  var statusColor = STATUS_COLORS[task.status] || '#6b7394';

  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 640, maxHeight: '85vh', overflow: 'auto' } },
      h('div', { className: 'modal-header' },
        h('h2', { style: { fontSize: 16 } }, task.title),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, '\u00D7')
      ),
      h('div', { className: 'modal-body', style: { padding: 20 } },
        // Status badges
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColor + '22', color: statusColor, border: '1px solid ' + statusColor + '44' } }, task.status.replace('_', ' ').toUpperCase()),
          h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, background: (PRIORITY_COLORS[task.priority] || '#6366f1') + '22', color: PRIORITY_COLORS[task.priority] || '#6366f1' } }, task.priority.toUpperCase()),
          task.source && sourceBadge(task.source),
          task.chainId && h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontFamily: 'var(--font-mono)' } }, 'Chain #' + task.chainId.slice(0, 8)),
          task.delegationType && tag(DELEGATION_COLORS[task.delegationType] || '#6b7394', task.delegationType)
        ),

        // Customer context
        task.customerContext && h('div', { style: { padding: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--tp-text-dim)', marginBottom: 8 } }, 'CUSTOMER'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 } },
            task.customerContext.name && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Name'), h('div', null, task.customerContext.name)),
            task.customerContext.email && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Email'), h('div', null, task.customerContext.email)),
            task.customerContext.company && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Company'), h('div', null, task.customerContext.company)),
            task.customerContext.channel && h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Channel'), h('div', null, task.customerContext.channel)),
            h(Fragment, null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Type'), h('div', null, task.customerContext.isNew ? 'New Customer' : 'Returning'))
          )
        ),

        task.description && h('div', { style: { marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' } }, task.description),

        // Progress
        task.status === 'in_progress' && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } }, h('span', null, 'Progress'), h('span', null, task.progress + '%')),
          h('div', { style: { height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: task.progress + '%', background: STATUS_COLORS.in_progress, borderRadius: 3, transition: 'width 0.3s' } })
          )
        ),

        // Grid details
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13, marginBottom: 16 } },
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Assigned To'), h('div', null, task.assignedToName || task.assignedTo || '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Created By'), h('div', null, task.createdByName || task.createdBy || '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Created'), h('div', null, task.createdAt ? new Date(task.createdAt).toLocaleString() : '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Duration'), h('div', null, formatDuration(task.actualDurationMs))),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Model'), h('div', null, task.modelUsed || task.model || '-')),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Tokens / Cost'), h('div', null, (task.tokensUsed || 0).toLocaleString() + ' / $' + (task.costUsd || 0).toFixed(4))),
          h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Source'), task.source ? sourceBadge(task.source) : h('div', null, '-'))
        ),

        // Task chain timeline (if part of a chain)
        chain && chain.length > 1 && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 } }, 'DELEGATION CHAIN'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 0, overflow: 'auto', padding: '8px 0' } },
            chain.map(function(ct, i) {
              var isMe = ct.id === task.id;
              var sc = STATUS_COLORS[ct.status] || '#6b7394';
              return h(Fragment, { key: ct.id },
                i > 0 && h('div', { style: { display: 'flex', alignItems: 'center', flexShrink: 0 } },
                  h('div', { style: { width: 32, height: 2, background: (DELEGATION_COLORS[ct.delegationType] || '#6366f1') + '66' } }),
                  h('div', { style: { fontSize: 8, color: 'var(--tp-text-dim)', position: 'relative', top: -8 } }, ct.delegationType || '')
                ),
                h('div', { style: {
                  padding: '6px 10px', borderRadius: 8, fontSize: 11, flexShrink: 0,
                  background: isMe ? sc + '22' : 'var(--tp-card)',
                  border: '1px solid ' + (isMe ? sc : 'var(--tp-border)'),
                  fontWeight: isMe ? 700 : 400, color: isMe ? sc : 'var(--tp-text-dim)',
                } },
                  h('div', { style: { fontWeight: 600 } }, ct.assignedToName || ct.assignedTo),
                  h('div', { style: { fontSize: 9, marginTop: 2, opacity: 0.6 } }, ct.status.replace('_', ' '))
                )
              );
            })
          )
        ),

        // Activity log — paginated with filter + search
        task.activityLog && task.activityLog.length > 0 && h(ActivityLog, { entries: task.activityLog }),

        task.error && h('div', { style: { padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13, color: '#ef4444' } }, h('strong', null, 'Error: '), task.error),

        // Actions
        (task.status === 'created' || task.status === 'assigned' || task.status === 'in_progress') && h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 } },
          h('button', { className: 'btn btn-danger btn-sm', onClick: function() { onCancel(task.id); } }, 'Cancel Task')
        )
      )
    )
  );
}

// ─── Metrics Bar ─────────────────────────────────────────
function MetricsBar(props) {
  var s = props.stats;
  function chip(label, value, color) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--tp-card)', borderRadius: 6 } },
      h('span', { style: { fontSize: 10, color: 'var(--tp-text-dim)' } }, label),
      h('span', { style: { fontSize: 11, fontWeight: 700, color: color } }, value)
    );
  }
  var hasActivity = s.total > 0;

  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid var(--tp-border)', background: 'var(--tp-metrics)', flexShrink: 0, overflowX: 'auto', fontSize: 11 } },
    h('span', { style: { fontSize: 9, color: 'var(--tp-text-faint)', fontWeight: 600, letterSpacing: '0.06em', marginRight: 2 } }, 'TODAY'),
    chip('Done', s.todayCompleted || 0, '#15803d'),
    chip('Active', s.inProgress || 0, '#06b6d4'),
    chip('New', s.todayCreated || 0, '#991b1b'),
    s.todayFailed > 0 && chip('Failed', s.todayFailed, '#ef4444'),
    hasActivity && h('div', { style: { width: 1, height: 14, background: 'var(--tp-border)' } }),
    hasActivity && h('span', { style: { fontSize: 9, color: 'var(--tp-text-faint)', fontWeight: 600, letterSpacing: '0.06em' } }, 'ALL'),
    hasActivity && chip('Total', s.total, 'rgba(255,255,255,0.6)'),
    s.avgDurationMs > 0 && chip('Avg', formatDuration(s.avgDurationMs), '#fff'),
    s.totalTokens > 0 && chip('Tokens', s.totalTokens > 999999 ? (s.totalTokens / 1000000).toFixed(1) + 'M' : s.totalTokens > 999 ? (s.totalTokens / 1000).toFixed(1) + 'K' : s.totalTokens, '#a855f7'),
    s.totalCost > 0 && chip('Cost', '$' + s.totalCost.toFixed(2), '#15803d'),
    s.topAgents && s.topAgents.length > 0 && h(Fragment, null,
      h('div', { style: { width: 1, height: 14, background: 'var(--tp-border)' } }),
      s.topAgents.slice(0, 3).map(function(a) {
        return h('div', { key: a.agent, style: { display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: 'var(--tp-card)', borderRadius: 6 } },
          h('div', { style: { width: 12, height: 12, borderRadius: '50%', background: '#6366f133', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: '#6366f1' } }, (a.name || '?').charAt(0).toUpperCase()),
          h('span', { style: { fontSize: 10, color: 'var(--tp-text)', fontWeight: 600 } }, a.name),
          h('span', { style: { fontSize: 9, color: 'var(--tp-text-dim)' } }, a.completed + '/' + a.active)
        );
      })
    )
  );
}

// (ChainFlowInline removed — chain flow now renders inline on canvas)

// ─── Main Page ───────────────────────────────────────────
export function TaskPipelinePage() {
  injectCSS();
  var app = useApp();
  var toast = app.toast;
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
  var _tasks = useState([]);
  var tasks = _tasks[0]; var setTasks = _tasks[1];
  var _stats = useState({ created: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0, cancelled: 0, total: 0, todayCompleted: 0, todayFailed: 0, todayCreated: 0, avgDurationMs: 0, totalCost: 0, totalTokens: 0, topAgents: [] });
  var stats = _stats[0]; var setStats = _stats[1];
  var _expandedTaskId = useState(null);
  var expandedTaskId = _expandedTaskId[0]; var setExpandedTaskId = _expandedTaskId[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _selectedTask = useState(null);
  var selectedTask = _selectedTask[0]; var setSelectedTask = _selectedTask[1];
  var _selectedChain = useState(null);
  var selectedChain = _selectedChain[0]; var setSelectedChain = _selectedChain[1];
  var _hoveredId = useState(null);
  var hoveredId = _hoveredId[0]; var setHoveredId = _hoveredId[1];
  var _zoom = useState(1);
  var zoom = _zoom[0]; var setZoom = _zoom[1];
  var _pan = useState({ x: 0, y: 0 });
  var pan = _pan[0]; var setPan = _pan[1];
  var _dragging = useState(false);
  var dragging = _dragging[0]; var setDragging = _dragging[1];
  var _dragStart = useState({ x: 0, y: 0 });
  var dragStart = _dragStart[0]; var setDragStart = _dragStart[1];
  var _filter = useState('active');
  var filter = _filter[0]; var setFilter = _filter[1];
  var _mousePos = useState({ x: 0, y: 0 });
  var mousePos = _mousePos[0]; var setMousePos = _mousePos[1];
  var containerRef = useRef(null);

  var _agents = useState({});
  var agentMap = _agents[0]; var setAgentMap = _agents[1];

  var loadData = useCallback(function() {
    setLoading(true);
    Promise.all([
      engineCall('/task-pipeline?limit=200'),
      engineCall('/task-pipeline/stats'),
      apiCall('/agents' + (orgCtx.selectedOrgId ? '?clientOrgId=' + orgCtx.selectedOrgId : '')).catch(function() { return { agents: [] }; }),
    ]).then(function(res) {
      var allTasks = res[0]?.tasks || [];
      var orgAgents = res[2]?.agents || [];
      // Build agent avatar/name map
      var map = {};
      orgAgents.forEach(function(a) {
        map[a.id] = { name: a.config?.name || a.name || a.id, avatar: a.config?.identity?.avatar || a.config?.avatar || a.config?.persona?.avatar || null };
      });
      setAgentMap(map);
      // Filter tasks by org's agents when org is selected
      if (orgCtx.selectedOrgId && orgAgents.length > 0) {
        var agentIds = {};
        orgAgents.forEach(function(a) { agentIds[a.id] = true; });
        allTasks = allTasks.filter(function(t) { return agentIds[t.assignedAgent] || agentIds[t.createdBy]; });
      } else if (orgCtx.selectedOrgId && orgAgents.length === 0) {
        allTasks = []; // No agents in this org = no tasks
      }
      setTasks(allTasks);
      // For client org users, compute stats from filtered tasks instead of global stats
      if (orgCtx.isLocked && orgCtx.clientOrgId) {
        var todayStart = new Date(); todayStart.setHours(0,0,0,0); var todayMs = todayStart.getTime();
        var cs = { created: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0, cancelled: 0, total: allTasks.length, todayCompleted: 0, todayFailed: 0, todayCreated: 0, avgDurationMs: 0, totalCost: 0, totalTokens: 0, topAgents: [] };
        var durSum = 0, durCount = 0, am = {};
        allTasks.forEach(function(t) {
          if (t.status === 'created') cs.created++; else if (t.status === 'assigned') cs.assigned++; else if (t.status === 'in_progress') cs.inProgress++; else if (t.status === 'completed') cs.completed++; else if (t.status === 'failed') cs.failed++; else if (t.status === 'cancelled') cs.cancelled++;
          var cMs = new Date(t.createdAt).getTime(); if (cMs >= todayMs) cs.todayCreated++;
          if (t.completedAt && new Date(t.completedAt).getTime() >= todayMs) { if (t.status === 'completed') cs.todayCompleted++; if (t.status === 'failed') cs.todayFailed++; }
          if (t.completedAt && t.createdAt) { var dur = new Date(t.completedAt).getTime() - cMs; if (dur > 0) { durSum += dur; durCount++; } }
          cs.totalTokens += t.tokensUsed || 0; cs.totalCost += t.costUsd || 0;
          var aid = t.assignedAgent || 'unassigned';
          if (!am[aid]) am[aid] = { agent: aid, name: (map[aid] && map[aid].name) || aid, completed: 0, active: 0 };
          if (t.status === 'completed') am[aid].completed++; else if (t.status === 'in_progress') am[aid].active++;
        });
        if (durCount > 0) cs.avgDurationMs = durSum / durCount;
        cs.topAgents = Object.values(am).sort(function(a,b) { return (b.completed + b.active) - (a.completed + a.active); });
        setStats(cs);
      } else {
        setStats(res[1] || stats);
      }
    }).catch(function(err) { console.error('[TaskPipeline]', err); })
      .finally(function() { setLoading(false); });
  }, [effectiveOrgId]);

  // SSE
  useEffect(function() {
    loadData();
    var baseUrl = window.__ENGINE_BASE || '/api/engine';
    var es;
    try {
      es = new EventSource(baseUrl + '/task-pipeline/stream');
      es.onmessage = function(e) {
        try {
          var event = JSON.parse(e.data);
          if (event.type === 'init') {
            if (event.tasks) setTasks(function(prev) {
              var map = new Map();
              prev.forEach(function(t) { map.set(t.id, t); });
              event.tasks.forEach(function(t) { map.set(t.id, t); });
              return Array.from(map.values()).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
            });
            if (event.stats) setStats(event.stats);
          } else if (event.task) {
            setTasks(function(prev) {
              var idx = prev.findIndex(function(t) { return t.id === event.task.id; });
              if (idx >= 0) { var next = prev.slice(); next[idx] = event.task; return next; }
              return [event.task].concat(prev);
            });
            setSelectedTask(function(prev) { return prev && prev.id === event.task.id ? event.task : prev; });
            // Refresh stats on every task event for real-time metrics (skip for client org — stats are computed locally)
            if (!orgCtx.isLocked) engineCall('/task-pipeline/stats').then(function(s) { if (s) setStats(s); }).catch(function() {});
          }
        } catch (err) {}
      };
    } catch (err) {}
    return function() { if (es) es.close(); };
  }, []);

  useEffect(function() {
    if (orgCtx.isLocked) return; // Client org stats computed locally from filtered tasks
    var iv = setInterval(function() {
      engineCall('/task-pipeline/stats').then(function(s) { if (s) setStats(s); }).catch(function() {});
    }, 15000);
    return function() { clearInterval(iv); };
  }, []);

  var cancelTask = useCallback(function(taskId) {
    engineCall('/task-pipeline/' + taskId + '/cancel', { method: 'POST' }).then(function() {
      toast('Task cancelled', 'success');
      setSelectedTask(null);
      loadData();
    }).catch(function(err) { toast(err.message || 'Failed', 'error'); });
  }, []);

  function openTaskDetail(t) {
    setSelectedTask(t);
    if (t.chainId) {
      var chainTasks = tasks.filter(function(ct) { return ct.chainId === t.chainId; });
      chainTasks.sort(function(a, b) { return (a.chainSeq || 0) - (b.chainSeq || 0); });
      setSelectedChain(chainTasks.length > 1 ? chainTasks : null);
    } else {
      setSelectedChain(null);
    }
  }

  // Toggle inline chain flowchart (single click on node)
  function toggleExpand(t) {
    if (expandedTaskId === t.id) {
      setExpandedTaskId(null);
      setSelectedChain(null);
    } else {
      setExpandedTaskId(t.id);
      if (t.chainId) {
        var chainTasks = tasks.filter(function(ct) { return ct.chainId === t.chainId; });
        chainTasks.sort(function(a, b) { return (a.chainSeq || 0) - (b.chainSeq || 0); });
        setSelectedChain(chainTasks.length > 0 ? chainTasks : [t]);
      } else {
        setSelectedChain([t]);
      }
    }
  }

  // Filter
  var filtered = tasks.filter(function(t) {
    if (filter === 'active') return t.status === 'created' || t.status === 'assigned' || t.status === 'in_progress';
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'failed') return t.status === 'failed' || t.status === 'cancelled';
    return true;
  });

  // Layout
  var layout = layoutChains(filtered);
  var nodes = layout.nodes;
  var edges = layout.edges;
  var treeW = layout.width;
  var treeH = layout.height;
  var chainInfos = layout.chains;

  // Zoom/Pan handlers
  var handleWheel = useCallback(function(e) {
    e.preventDefault();
    setZoom(function(z) { return Math.min(3, Math.max(0.15, z + (e.deltaY > 0 ? -0.08 : 0.08))); });
  }, []);
  var handleMouseDown = useCallback(function(e) {
    if (e.button !== 0 || e.target.closest('.tp-node')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);
  var handleMouseMove = useCallback(function(e) {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);
  var handleMouseUp = useCallback(function() { setDragging(false); }, []);
  useEffect(function() {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return function() { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  var fitToView = useCallback(function() {
    // No auto-zoom — keep nodes at full size, use scroll instead
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);
  useEffect(function() { if (nodes.length > 0) fitToView(); }, [nodes.length]);

  var scrollLeft = useCallback(function() {
    if (containerRef.current) containerRef.current.scrollBy({ left: -400, behavior: 'smooth' });
  }, []);
  var scrollRight = useCallback(function() {
    if (containerRef.current) containerRef.current.scrollBy({ left: 400, behavior: 'smooth' });
  }, []);

  // Highlight connected chain on hover
  var hoveredChainId = null;
  if (hoveredId) {
    var hn = nodes.find(function(n) { return n.id === hoveredId; });
    if (hn) hoveredChainId = hn.chainId;
  }

  var hoveredNode = hoveredId ? nodes.find(function(n) { return n.id === hoveredId; }) : null;

  // ─── Toolbar ─────────────────────────────────────────
  var toolbar = h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--tp-border)', background: 'var(--tp-toolbar)', flexShrink: 0, flexWrap: 'wrap' } },
    h('div', { style: { fontWeight: 700, fontSize: 14, color: 'var(--tp-text)', display: 'flex', alignItems: 'center', gap: 6 } },
      I.workflow(), 'Task Pipeline',
      h(KnowledgeLink, { page: 'task-pipeline' }),
      h(HelpButton, { label: 'Task Pipeline' },
        h('p', null, 'Visual flow of all agent tasks. Tasks flow left-to-right showing delegation chains, multi-agent handoffs, and circular review loops.'),
        h('h4', { style: _h4 }, 'Features'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Horizontal flow'), ' \u2014 Tasks move left to right through agents'),
          h('li', null, h('strong', null, 'Chain tracking'), ' \u2014 When a manager delegates to a junior, the chain shows the full flow'),
          h('li', null, h('strong', null, 'Circular flows'), ' \u2014 If a task returns (revision/review), the arc curves back'),
          h('li', null, h('strong', null, 'Animated lines'), ' \u2014 Active tasks show flowing dashes on their connections'),
          h('li', null, h('strong', null, 'Customer profiles'), ' \u2014 Support tasks show the customer\'s info'),
          h('li', null, h('strong', null, 'Real-time SSE'), ' \u2014 Updates stream live, no refresh needed')
        ),
        h('h4', { style: _h4 }, 'Interactions'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Hover'), ' \u2014 Highlights the entire chain'),
          h('li', null, h('strong', null, 'Click'), ' \u2014 Opens detail modal with chain timeline, activity log, customer context'),
          h('li', null, h('strong', null, 'Scroll'), ' \u2014 Zoom'),
          h('li', null, h('strong', null, 'Drag'), ' \u2014 Pan')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Each task has a unique chain ID linking all delegation steps. Even circular review loops (agent A \u2192 B \u2192 A) are tracked.')
      )
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
      h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: '#15803d', animation: 'flowPulse 2s infinite' } }),
      h('span', { style: { color: 'var(--tp-text-dim)', fontSize: 11 } }, 'Live')
    ),
    h('div', { style: { color: 'var(--tp-text-dim)', fontSize: 11 } },
      (stats.inProgress || 0) + ' active \u00B7 ' + (stats.completed || 0) + ' done \u00B7 ' + (stats.total || 0) + ' total'
    ),
    h('div', { style: { flex: 1 } }),
    // Filters
    ['active', 'all', 'completed', 'failed'].map(function(f) {
      return h('button', { key: f, onClick: function() { setFilter(f); }, style: Object.assign({}, toolbarBtnStyle, { fontSize: 11, background: filter === f ? 'rgba(99,102,241,0.3)' : toolbarBtnStyle.background }) }, f.charAt(0).toUpperCase() + f.slice(1));
    }),
    h('div', { style: { width: 1, height: 14, background: 'rgba(255,255,255,0.12)' } }),
    legendDot(STATUS_COLORS.in_progress, 'Active'),
    legendDot(STATUS_COLORS.completed, 'Done'),
    legendDot(STATUS_COLORS.failed, 'Failed'),
    h('div', { style: { width: 1, height: 14, background: 'rgba(255,255,255,0.12)' } }),
    h('button', { onClick: scrollLeft, style: toolbarBtnStyle, title: 'Scroll left' }, '\u2190'),
    h('button', { onClick: scrollRight, style: toolbarBtnStyle, title: 'Scroll right' }, '\u2192'),
    h('button', { onClick: loadData, style: toolbarBtnStyle }, 'Refresh'),
  );

  if (loading) return h(Fragment, null, h(orgCtx.Switcher), h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading task pipeline...'));

  if (nodes.length === 0) return h(Fragment, null, h(orgCtx.Switcher), h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--tp-bg)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' } },
    toolbar,
    h(MetricsBar, { stats: stats }),
    h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' } },
      h('div', { style: { width: 48, height: 48, borderRadius: 12, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#6366f1' } }, I.workflow()),
      h('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--tp-text)' } }, 'No Tasks in Pipeline'),
      h('div', { style: { color: 'var(--tp-text-dim)', fontSize: 13 } }, 'Tasks will appear here as agents are assigned work.')
    )
  ));

  // Build expanded chain for inline flowchart
  var expandedChain = null;
  if (expandedTaskId) {
    var et = tasks.find(function(t) { return t.id === expandedTaskId; });
    if (et && et.chainId) {
      expandedChain = tasks.filter(function(ct) { return ct.chainId === et.chainId; });
      expandedChain.sort(function(a, b) { return (a.chainSeq || 0) - (b.chainSeq || 0); });
    } else if (et) {
      expandedChain = [et];
    }
  }

  return h(Fragment, null, h(orgCtx.Switcher), h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--tp-bg)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' } },
    toolbar,
    // Metrics bar
    h(MetricsBar, { stats: stats }),
    // Canvas — native scroll, no zoom transform
    h('div', {
      ref: containerRef,
      style: { flex: 1, overflow: 'auto', position: 'relative' },
    },
      h('div', { style: { position: 'relative', width: treeW + PAD * 2, minHeight: treeH + PAD * 2 } },

        // Chain labels (left side)
        chainInfos.map(function(ci, i) {
          return h('div', { key: ci.chainId, style: { position: 'absolute', left: 4, top: ci.y - 2, fontSize: 9, color: 'var(--tp-text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', maxWidth: PAD - 8, overflow: 'hidden' } },
            ci.customer && h(CustomerBadge, { customer: ci.customer })
          );
        }),

        // SVG edges with animated flow
        h('svg', { width: treeW + 100, height: treeH + 100, style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' } },
          h('defs', null,
            h('marker', { id: 'tp-arr', markerWidth: 7, markerHeight: 5, refX: 7, refY: 2.5, orient: 'auto' },
              h('polygon', { points: '0 0, 7 2.5, 0 5', fill: EDGE_COLOR })
            ),
            h('marker', { id: 'tp-arr-hl', markerWidth: 7, markerHeight: 5, refX: 7, refY: 2.5, orient: 'auto' },
              h('polygon', { points: '0 0, 7 2.5, 0 5', fill: EDGE_HL })
            ),
            // Animated glow filter
            h('filter', { id: 'tp-glow' },
              h('feGaussianBlur', { stdDeviation: 2, result: 'blur' }),
              h('feMerge', null, h('feMergeNode', { in: 'blur' }), h('feMergeNode', { in: 'SourceGraphic' }))
            )
          ),
          edges.map(function(e, i) {
            var fromId = e.from.id;
            var toId = e.to.id;
            var isHl = hoveredChainId && e.from.chainId === hoveredChainId;
            var dim = hoveredChainId && !isHl;
            var dType = e.delegationType || 'delegation';
            var edgeColor = isHl ? EDGE_HL : dim ? 'rgba(255,255,255,0.06)' : (DELEGATION_COLORS[dType] || EDGE_COLOR) + '88';
            var d = e.isCircular ? circularPath(e.from, e.to) : horizontalPath(e.from, e.to);

            return h(Fragment, { key: i },
              // Base path
              h('path', {
                d: d, stroke: edgeColor, strokeWidth: isHl ? 2.5 : 1.5, fill: 'none',
                markerEnd: isHl ? 'url(#tp-arr-hl)' : 'url(#tp-arr)',
                style: { transition: 'stroke 0.2s, opacity 0.2s', opacity: dim ? 0.2 : 1 },
              }),
              // Animated flow dash overlay for active tasks
              e.isActive && h('path', {
                d: d, stroke: STATUS_COLORS.in_progress, strokeWidth: 2, fill: 'none',
                strokeDasharray: '6 18',
                className: 'tp-flow-active',
                filter: 'url(#tp-glow)',
                style: { opacity: dim ? 0.1 : 0.7 },
              }),
              // Delegation type label on edge
              !dim && dType !== 'delegation' && h('text', {
                x: (e.from.x + e.from.w + e.to.x) / 2,
                y: (e.from.y + e.to.y) / 2 + (e.from.h / 2) - (e.isCircular ? 20 : 6),
                fill: (DELEGATION_COLORS[dType] || 'rgba(255,255,255,0.3)') + (dim ? '33' : ''),
                fontSize: 8, textAnchor: 'middle', fontWeight: 600,
              }, dType)
            );
          })
        ),

        // Task nodes
        nodes.map(function(node) {
          var t = node.task;
          var sc = STATUS_COLORS[t.status] || '#6b7394';
          var isHovered = hoveredId === node.id;
          var isChainHl = hoveredChainId && node.chainId === hoveredChainId;
          var dim = hoveredChainId && !isChainHl;
          var isActive = t.status === 'in_progress';

          var isExpanded = expandedTaskId === node.id;
          return h('div', {
            key: node.id,
            className: 'tp-node' + (isActive ? ' tp-node-active' : ''),
            onClick: function() { toggleExpand(t); },
            onDoubleClick: function() { openTaskDetail(t); },
            onMouseEnter: function(ev) { setHoveredId(node.id); setMousePos({ x: ev.clientX, y: ev.clientY }); },
            onMouseMove: function(ev) { setMousePos({ x: ev.clientX, y: ev.clientY }); },
            onMouseLeave: function() { setHoveredId(null); },
            style: {
              position: 'absolute', left: node.x, top: node.y, width: node.w, height: node.h,
              background: isHovered ? 'var(--tp-card-hover)' : 'var(--tp-card)',
              border: '1px solid ' + (isExpanded ? sc : isHovered || isChainHl ? sc + '66' : 'var(--tp-border)'),
              borderRadius: 6, padding: '5px 8px', cursor: 'pointer', overflow: 'hidden',
              transition: 'all 0.15s', opacity: dim ? 0.15 : 1,
              backdropFilter: 'blur(6px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, userSelect: 'none',
            },
          },
            // Agent + title row
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
              (agentMap[t.assignedTo] && agentMap[t.assignedTo].avatar)
                ? h('img', { src: agentMap[t.assignedTo].avatar, style: { width: 16, height: 16, borderRadius: '50%', border: '1px solid ' + sc + '66', objectFit: 'cover', flexShrink: 0 } })
                : h('div', { style: { width: 16, height: 16, borderRadius: '50%', background: sc + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: sc, flexShrink: 0, border: '1px solid ' + sc + '44' } },
                    (t.assignedToName || t.assignedTo || '?').charAt(0).toUpperCase()
                  ),
              h('span', { style: { fontSize: 10, fontWeight: 600, color: 'var(--tp-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.title)
            ),
            // Status + agent name + time
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' } },
              tag(sc, t.status.replace('_', ' ')),
              h('span', { style: { fontSize: 9, color: 'var(--tp-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, t.assignedToName || t.assignedTo),
              t.source && sourceBadge(t.source),
              t.delegationType && tag(DELEGATION_COLORS[t.delegationType] || '#6b7394', t.delegationType),
              h('span', { style: { fontSize: 9, color: 'var(--tp-text-dim)', marginLeft: 'auto' } }, timeAgo(t.createdAt))
            ),
            // Progress bar
            isActive && t.progress > 0 && h('div', { style: { height: 2, background: 'var(--tp-border)', borderRadius: 1, overflow: 'hidden', marginTop: 1 } },
              h('div', { style: { height: '100%', width: t.progress + '%', background: sc, borderRadius: 1, transition: 'width 0.3s' } })
            )
          );
        }),

        // ── Expanded chain flow (rendered ON the canvas below clicked node) ──
        expandedChain && expandedChain.length > 0 && (function() {
          // Find the clicked node position to anchor below it
          var anchor = nodes.find(function(n) { return n.id === expandedTaskId; });
          if (!anchor) return null;
          var flowY = anchor.y + anchor.h + 20;
          var flowX = anchor.x;
          var STEP_W = 100;
          var STEP_H = 36;
          var STEP_GAP = 32;
          var ARROW_W = STEP_GAP;

          // Build person-centric flow steps: createdBy → assignedTo for each chain task, then final status
          var steps = [];
          expandedChain.forEach(function(ct, i) {
            if (i === 0 && ct.createdBy && ct.createdBy !== 'system') {
              steps.push({ label: ct.createdByName || ct.createdBy, type: 'person', isHuman: ct.createdBy.indexOf('agent') === -1 && ct.createdBy !== 'system', status: null, arrow: ct.delegationType || 'assigned' });
            } else if (i === 0 && ct.createdBy === 'system') {
              steps.push({ label: 'System', type: 'system', isHuman: false, status: null, arrow: 'assigned' });
            }
            var nextArrow = i < expandedChain.length - 1 ? (expandedChain[i + 1].delegationType || 'delegation') : null;
            steps.push({ label: ct.assignedToName || ct.assignedTo, type: 'agent', isHuman: false, status: ct.status, taskId: ct.id, arrow: nextArrow, duration: ct.actualDurationMs, progress: ct.progress });
          });
          // Add final status node + ensure arrow from last agent to terminal
          var lastTask = expandedChain[expandedChain.length - 1];
          var isDone = lastTask.status === 'completed' || lastTask.status === 'failed' || lastTask.status === 'cancelled';
          if (isDone) {
            // Set arrow on the last non-terminal step so the connector draws
            if (steps.length > 0 && !steps[steps.length - 1].arrow) {
              steps[steps.length - 1].arrow = lastTask.status;
            }
            steps.push({ label: lastTask.status === 'completed' ? 'Completed!' : lastTask.status === 'failed' ? 'Failed' : 'Cancelled', type: 'terminal', isHuman: false, status: lastTask.status, arrow: null });
          }

          var totalW = steps.length * STEP_W + (steps.length - 1) * STEP_GAP;

          var maxFlowW = Math.max(totalW + 40, 400);
          var containerW = (containerRef.current ? containerRef.current.getBoundingClientRect().width / zoom : 800) - flowX;
          if (maxFlowW > containerW) maxFlowW = Math.max(containerW, 320);

          return h('div', { style: { position: 'absolute', left: flowX, top: flowY, pointerEvents: 'auto', maxWidth: maxFlowW, zIndex: 20 } },
            // Background card
            h('div', { style: { background: 'var(--bg-primary, rgba(10,12,20,0.95))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 10px 8px', backdropFilter: 'blur(8px)', overflowX: 'auto', overflowY: 'hidden' } },
              // Header
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },
                h('span', { style: { fontSize: 9, fontWeight: 600, color: 'var(--tp-text-dim)', letterSpacing: '0.06em' } }, 'TASK FLOW'),
                expandedChain[0].chainId && h('span', { style: { fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)' } }, '#' + expandedChain[0].chainId.slice(0, 8)),
                h('div', { style: { flex: 1 } }),
                h('button', { className: 'tp-node', onClick: function() { setExpandedTaskId(null); }, style: { background: 'none', border: 'none', color: 'var(--tp-text-dim)', cursor: 'pointer', fontSize: 14, padding: '0 2px' } }, '\u00D7')
              ),
              // Flow
              h('div', { style: { position: 'relative', height: STEP_H + 8, minWidth: totalW } },
                // SVG arrows
                h('svg', { width: totalW, height: STEP_H + 8, style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } },
                  h('defs', null,
                    h('marker', { id: 'fc-arr', markerWidth: 8, markerHeight: 6, refX: 8, refY: 3, orient: 'auto' },
                      h('polygon', { points: '0 0, 8 3, 0 6', fill: 'var(--tp-text-dim, rgba(99,102,241,0.6))' })
                    ),
                    h('marker', { id: 'fc-arr-active', markerWidth: 8, markerHeight: 6, refX: 8, refY: 3, orient: 'auto' },
                      h('polygon', { points: '0 0, 8 3, 0 6', fill: STATUS_COLORS.in_progress })
                    )
                  ),
                  steps.map(function(step, i) {
                    if (!step.arrow || i >= steps.length - 1) return null;
                    var x1 = i * (STEP_W + STEP_GAP) + STEP_W;
                    var x2 = (i + 1) * (STEP_W + STEP_GAP);
                    var y = 4 + STEP_H / 2;
                    var arrowColor = DELEGATION_COLORS[step.arrow] || 'rgba(99,102,241,0.5)';
                    var nextStep = steps[i + 1];
                    var isFlowActive = step.status === 'in_progress' || (nextStep && nextStep.status === 'in_progress');
                    var midX = x1 + (x2 - x1) * 0.5;
                    var d = 'M ' + x1 + ' ' + y + ' C ' + midX + ' ' + y + ', ' + midX + ' ' + y + ', ' + x2 + ' ' + y;
                    return h(Fragment, { key: 'a' + i },
                      h('path', { d: d, stroke: arrowColor, strokeWidth: 2, fill: 'none', markerEnd: 'url(#fc-arr)' }),
                      isFlowActive && h('path', { d: d, stroke: STATUS_COLORS.in_progress, strokeWidth: 2, fill: 'none', strokeDasharray: '4 12', className: 'tp-flow-active', style: { opacity: 0.7 }, markerEnd: 'url(#fc-arr-active)' }),
                      step.arrow !== 'assigned' && step.arrow !== 'delegation' && step.arrow !== 'completed' && step.arrow !== 'failed' && step.arrow !== 'cancelled' && h('text', { x: (x1 + x2) / 2, y: y - 6, fill: arrowColor, fontSize: 8, textAnchor: 'middle', fontWeight: 600 }, step.arrow)
                    );
                  })
                ),
                // Step nodes
                steps.map(function(step, i) {
                  var x = i * (STEP_W + STEP_GAP);
                  var sc = step.type === 'terminal'
                    ? (STATUS_COLORS[step.status] || '#15803d')
                    : step.type === 'person' || step.isHuman
                      ? '#991b1b'
                      : step.status ? (STATUS_COLORS[step.status] || '#6366f1') : '#6366f1';
                  var isTerminal = step.type === 'terminal';
                  var isMe = step.taskId === expandedTaskId;

                  return h('div', {
                    key: i,
                    className: 'tp-node',
                    onClick: function(e) { e.stopPropagation(); if (step.taskId) { var ct = expandedChain.find(function(c) { return c.id === step.taskId; }); if (ct) openTaskDetail(ct); } else if (expandedChain.length > 0) { openTaskDetail(expandedChain[0]); } },
                    style: {
                      position: 'absolute', left: x, top: 4, width: isTerminal ? 'auto' : STEP_W, minWidth: isTerminal ? 90 : undefined, height: STEP_H,
                      background: isTerminal ? sc + '15' : isMe ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                      border: '1px solid ' + (isTerminal ? sc + '44' : isMe ? sc : 'rgba(255,255,255,0.1)'),
                      borderRadius: isTerminal ? 18 : 6,
                      display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
                      cursor: 'pointer',
                    },
                  },
                    // Avatar
                    (function() {
                      // Check if we have an agent avatar for this step
                      var stepAgent = step.taskId && expandedChain.find(function(c) { return c.id === step.taskId; });
                      var agentAvatar = stepAgent && agentMap[stepAgent.assignedTo] && agentMap[stepAgent.assignedTo].avatar;
                      if (!isTerminal && agentAvatar) {
                        return h('img', { src: agentAvatar, style: { width: 18, height: 18, borderRadius: '50%', border: '1px solid ' + sc + '44', objectFit: 'cover', flexShrink: 0 } });
                      }
                      return h('div', { style: {
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        background: isTerminal ? sc + '33' : step.isHuman || step.type === 'person' ? 'linear-gradient(135deg, #991b1b, #f97316)' : step.type === 'system' ? 'var(--tp-card)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isTerminal ? 10 : 8, fontWeight: 700,
                        color: isTerminal ? sc : '#fff',
                        border: '1px solid ' + (isTerminal ? sc + '44' : 'transparent'),
                      } },
                        isTerminal ? (step.status === 'completed' ? '\u2714' : '\u2716') : step.label.charAt(0).toUpperCase()
                      );
                    })(),
                    // Info
                    h('div', { style: { overflow: 'hidden', flex: 1, minWidth: 0 } },
                      h('div', { style: { fontSize: 10, fontWeight: 600, color: isTerminal ? sc : 'var(--tp-text)', whiteSpace: 'nowrap', overflow: isTerminal ? 'visible' : 'hidden', textOverflow: isTerminal ? 'unset' : 'ellipsis' } }, step.label),
                      !isTerminal && h('div', { style: { fontSize: 8, color: 'var(--tp-text-dim)', marginTop: 1 } },
                        step.type === 'person' || step.isHuman ? 'Human' : step.type === 'system' ? 'System' : 'Agent',
                        step.duration ? ' \u00B7 ' + formatDuration(step.duration) : '',
                        step.status === 'in_progress' && step.progress > 0 ? ' \u00B7 ' + step.progress + '%' : ''
                      )
                    )
                  );
                })
              )
            )
          );
        })()
      )
    ),

    // Hover tooltip
    hoveredNode && hoveredNode.task && h('div', { style: {
      position: 'fixed', left: mousePos.x + 16, top: mousePos.y - 10,
      background: 'var(--bg-secondary)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--tp-border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      padding: '10px 14px', pointerEvents: 'none', zIndex: 1000, minWidth: 180, maxWidth: 280,
    }},
      hoveredNode.task.customerContext && h(CustomerBadge, { customer: hoveredNode.task.customerContext }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
        (agentMap[hoveredNode.task.assignedTo] && agentMap[hoveredNode.task.assignedTo].avatar)
          ? h('img', { src: agentMap[hoveredNode.task.assignedTo].avatar, style: { width: 22, height: 22, borderRadius: '50%', border: '1.5px solid ' + (STATUS_COLORS[hoveredNode.task.status] || '#6366f1'), objectFit: 'cover', flexShrink: 0 } })
          : null,
        h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--tp-text)' } }, hoveredNode.task.title)
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { style: { color: 'var(--tp-text-dim)' } }, 'Agent'), h('span', { style: { fontWeight: 600 } }, hoveredNode.task.assignedToName || '-')),
        h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { style: { color: 'var(--tp-text-dim)' } }, 'Status'), h('span', { style: { color: STATUS_COLORS[hoveredNode.task.status] } }, hoveredNode.task.status.replace('_', ' '))),
        hoveredNode.task.chainId && h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { style: { color: 'var(--tp-text-dim)' } }, 'Chain Step'), h('span', null, '#' + ((hoveredNode.task.chainSeq || 0) + 1))),
        hoveredNode.task.delegationType && h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { style: { color: 'var(--tp-text-dim)' } }, 'Type'), h('span', { style: { color: DELEGATION_COLORS[hoveredNode.task.delegationType] } }, hoveredNode.task.delegationType)),
        hoveredNode.task.progress > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { style: { color: 'var(--tp-text-dim)' } }, 'Progress'), h('span', { style: { color: STATUS_COLORS.in_progress } }, hoveredNode.task.progress + '%'))
      )
    ),

    // Detail modal (double-click)
    selectedTask && h(TaskDetail, { task: selectedTask, chain: selectedChain, onClose: function() { setSelectedTask(null); setSelectedChain(null); }, onCancel: cancelTask })
  ));
}

// ─── Agent Task Pipeline (reusable mini for agent-detail workforce tab) ─
export function AgentTaskPipeline(props) {
  var agentId = props.agentId;
  var _tasks = useState([]);
  var tasks = _tasks[0]; var setTasks = _tasks[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _selectedTask = useState(null);
  var selectedTask = _selectedTask[0]; var setSelectedTask = _selectedTask[1];
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
      key: t.id,
      onClick: function() { setSelectedTask(t); },
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
    selectedTask && h(TaskDetail, { task: selectedTask, chain: null, onClose: function() { setSelectedTask(null); }, onCancel: cancelTask })
  );
}
