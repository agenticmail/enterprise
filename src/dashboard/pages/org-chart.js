import { h, useState, useEffect, useCallback, useRef, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';

// ─── Inject theme CSS once ───────────────────────────────
var _injected = false;
function injectCSS() {
  if (_injected) return; _injected = true;
  var s = document.createElement('style');
  s.textContent = `
    :root { --oc-bg: var(--bg-primary, #0a0c14); --oc-text: var(--text-primary, #fff); --oc-dim: var(--text-muted, rgba(255,255,255,0.45)); --oc-faint: rgba(255,255,255,0.12); --oc-card: rgba(255,255,255,0.02); --oc-card-h: rgba(255,255,255,0.06); --oc-toolbar: rgba(0,0,0,0.3); --oc-border: rgba(255,255,255,0.08); --oc-edge: rgba(255,255,255,0.25); --oc-edge-dim: rgba(255,255,255,0.06); --oc-tip-bg: rgba(15,17,23,0.95); --oc-btn-bg: rgba(255,255,255,0.08); --oc-btn-border: rgba(255,255,255,0.12); --oc-metrics: rgba(0,0,0,0.12); }
    [data-theme="light"], :root:not(.dark) { --oc-bg: var(--bg-primary, #f8fafc); --oc-text: var(--text-primary, #1e293b); --oc-dim: var(--text-muted, #64748b); --oc-faint: var(--border, rgba(0,0,0,0.08)); --oc-card: rgba(0,0,0,0.02); --oc-card-h: rgba(0,0,0,0.05); --oc-toolbar: rgba(0,0,0,0.03); --oc-border: var(--border, rgba(0,0,0,0.08)); --oc-edge: rgba(0,0,0,0.2); --oc-edge-dim: rgba(0,0,0,0.05); --oc-tip-bg: var(--bg-primary, #fff); --oc-btn-bg: var(--bg-secondary, rgba(0,0,0,0.04)); --oc-btn-border: var(--border, rgba(0,0,0,0.1)); --oc-metrics: rgba(0,0,0,0.02); }
    @media (prefers-color-scheme: light) { :root:not(.dark) { --oc-bg: var(--bg-primary, #f8fafc); --oc-text: var(--text-primary, #1e293b); --oc-dim: var(--text-muted, #64748b); --oc-faint: var(--border, rgba(0,0,0,0.08)); --oc-card: rgba(0,0,0,0.02); --oc-card-h: rgba(0,0,0,0.05); --oc-toolbar: rgba(0,0,0,0.03); --oc-border: var(--border, rgba(0,0,0,0.08)); --oc-edge: rgba(0,0,0,0.2); --oc-edge-dim: rgba(0,0,0,0.05); --oc-tip-bg: var(--bg-primary, #fff); --oc-btn-bg: var(--bg-secondary, rgba(0,0,0,0.04)); --oc-btn-border: var(--border, rgba(0,0,0,0.1)); --oc-metrics: rgba(0,0,0,0.02); } }
  `;
  document.head.appendChild(s);
}

// ─── Layout Constants ────────────────────────────────────
var NODE_W = 220;
var NODE_H = 72;
var H_GAP = 40;
var V_GAP = 80;
var PAD = 60;

var STATE_COLORS = { running: '#15803d', stopped: '#6b7394', error: '#ef4444', paused: '#f59e0b', deploying: '#06b6d4' };
var ACCENT = '#6366f1';

// ─── Tree Layout ─────────────────────────────────────────
function layoutTree(nodes) {
  if (!nodes || !nodes.length) return { positioned: [], width: 0, height: 0 };
  var byId = new Map();
  nodes.forEach(function(n) { byId.set(n.agentId, Object.assign({}, n, { children: [], x: 0, y: 0, subtreeW: 0 })); });
  var roots = [];
  for (var n of byId.values()) {
    if (n.managerId && byId.has(n.managerId)) byId.get(n.managerId).children.push(n);
    else roots.push(n);
  }
  var externalManagers = new Map();
  for (var n2 of byId.values()) {
    if (n2.managerType === 'external' && n2.managerName) {
      var key = 'ext-' + (n2.managerEmail || n2.managerName);
      if (!externalManagers.has(key)) externalManagers.set(key, { agentId: key, name: n2.managerName, role: 'External Manager', state: 'external', managerType: 'none', managerId: null, subordinateIds: [], subordinateCount: 0, isManager: true, level: -1, clockedIn: true, activeTasks: 0, errorsToday: 0, isExternal: true, children: [], x: 0, y: 0, subtreeW: 0 });
      var ext = externalManagers.get(key);
      var idx = roots.indexOf(n2);
      if (idx >= 0) roots.splice(idx, 1);
      ext.children.push(n2);
    }
  }
  for (var e of externalManagers.values()) { if (e.children.length > 0) roots.push(e); }
  if (roots.length === 0 && byId.size > 0) roots.push.apply(roots, Array.from(byId.values()));

  function computeW(node) {
    if (node.children.length === 0) { node.subtreeW = NODE_W; return NODE_W; }
    var t = 0; node.children.forEach(function(c) { t += computeW(c); }); t += (node.children.length - 1) * H_GAP;
    node.subtreeW = Math.max(NODE_W, t); return node.subtreeW;
  }
  function assignPos(node, x, y) {
    node.x = x + node.subtreeW / 2 - NODE_W / 2; node.y = y;
    if (node.children.length === 0) return;
    var cw = node.children.reduce(function(s, c) { return s + c.subtreeW; }, 0) + (node.children.length - 1) * H_GAP;
    var cx = node.x + NODE_W / 2 - cw / 2;
    node.children.forEach(function(c) { assignPos(c, cx, y + NODE_H + V_GAP); cx += c.subtreeW + H_GAP; });
  }
  roots.forEach(function(r) { computeW(r); });
  var cx = PAD; roots.forEach(function(r) { assignPos(r, cx, PAD); cx += r.subtreeW + H_GAP * 2; });
  var positioned = [], maxX = 0, maxY = 0;
  function flatten(node) { positioned.push(node); maxX = Math.max(maxX, node.x + NODE_W); maxY = Math.max(maxY, node.y + NODE_H); node.children.forEach(flatten); }
  roots.forEach(flatten);
  return { positioned: positioned, width: maxX + PAD, height: maxY + PAD + 40 };
}

function edgePath(parent, child) {
  var x1 = child.x + NODE_W / 2, y1 = child.y, x2 = parent.x + NODE_W / 2, y2 = parent.y + NODE_H;
  var midY = y1 + (y2 - y1) * 0.5;
  return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;
}

// ─── Helpers ─────────────────────────────────────────────
var toolbarBtnStyle = { background: 'var(--oc-btn-bg)', border: '1px solid var(--oc-btn-border)', borderRadius: 6, color: 'var(--oc-text)', fontSize: 14, fontWeight: 600, padding: '4px 8px', cursor: 'pointer', lineHeight: '1.2' };
function tagStyle(color) { return { fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: color + '22', color: color, letterSpacing: '0.02em' }; }
function tooltipRow(label, value, color) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 } },
    h('span', { style: { color: 'var(--oc-dim)' } }, label),
    h('span', { style: { fontWeight: 600, color: color || 'var(--oc-text)' } }, value));
}
function legendDot(color, label) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
    h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: color } }),
    h('span', { style: { color: 'var(--oc-dim)', fontSize: 12 } }, label));
}
function timeAgo(iso) {
  var diff = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now'; if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

// ─── Summary Metrics ─────────────────────────────────────
function OrgSummary(props) {
  var nodes = props.nodes;
  var running = 0, stopped = 0, errored = 0, paused = 0, external = 0, managers = 0, totalTasks = 0, totalErrors = 0;
  nodes.forEach(function(n) {
    if (n.isExternal) { external++; return; }
    if (n.state === 'running') running++;
    else if (n.state === 'error') errored++;
    else if (n.state === 'paused') paused++;
    else stopped++;
    if (n.isManager || (n.children && n.children.length > 0)) managers++;
    totalTasks += n.activeTasks || 0;
    totalErrors += n.errorsToday || 0;
  });
  function chip(label, value, color) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--oc-card)', borderRadius: 6 } },
      h('span', { style: { fontSize: 10, color: 'var(--oc-dim)' } }, label),
      h('span', { style: { fontSize: 11, fontWeight: 700, color: color } }, value));
  }
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid var(--oc-border)', background: 'var(--oc-metrics)', flexShrink: 0, overflowX: 'auto', fontSize: 11 } },
    chip('Agents', nodes.length - external, 'var(--oc-text)'),
    chip('Running', running, '#15803d'),
    stopped > 0 && chip('Stopped', stopped, '#6b7394'),
    errored > 0 && chip('Error', errored, '#ef4444'),
    paused > 0 && chip('Paused', paused, '#f59e0b'),
    external > 0 && chip('Human', external, '#8b5cf6'),
    managers > 0 && chip('Managers', managers, ACCENT),
    totalTasks > 0 && h(Fragment, null,
      h('div', { style: { width: 1, height: 14, background: 'var(--oc-faint)' } }),
      chip('Active Tasks', totalTasks, '#f59e0b')
    ),
    totalErrors > 0 && chip('Errors Today', totalErrors, '#ef4444')
  );
}

// ─── Main Component ─────────────────────────────────────
export function OrgChartPage() {
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
  injectCSS();
  var app = useApp();
  var toast = app.toast;
  var _nodes = useState([]); var nodes = _nodes[0]; var setNodes = _nodes[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _error = useState(null); var error = _error[0]; var setError = _error[1];
  var _hoveredId = useState(null); var hoveredId = _hoveredId[0]; var setHoveredId = _hoveredId[1];
  var _zoom = useState(1); var zoom = _zoom[0]; var setZoom = _zoom[1];
  var _pan = useState({ x: 0, y: 0 }); var pan = _pan[0]; var setPan = _pan[1];
  var _dragging = useState(false); var dragging = _dragging[0]; var setDragging = _dragging[1];
  var _dragStart = useState({ x: 0, y: 0 }); var dragStart = _dragStart[0]; var setDragStart = _dragStart[1];
  var _mousePos = useState({ x: 0, y: 0 }); var mousePos = _mousePos[0]; var setMousePos = _mousePos[1];
  var containerRef = useRef(null);

  var load = useCallback(function() {
    setLoading(true); setError(null);
    Promise.all([
      engineCall('/hierarchy/org-chart').catch(function() { return null; }),
      engineCall('/agents?orgId=' + effectiveOrgId).catch(function() { return { agents: [] }; }),
    ]).then(function(res) {
      var hierRes = res[0]; var agentRes = res[1];
      var avatarMap = {};
      (agentRes.agents || []).forEach(function(a) { avatarMap[a.id] = a.config?.identity?.avatar || a.config?.avatar || a.config?.persona?.avatar || null; });
      if (hierRes && hierRes.nodes) {
        setNodes(hierRes.nodes.map(function(n) { return Object.assign({}, n, { avatar: avatarMap[n.agentId] || null }); }));
      } else {
        var agents = agentRes.agents || [];
        setNodes(agents.map(function(a) { return { agentId: a.id, name: a.config?.name || a.id, role: a.config?.role || 'Agent', state: a.state || 'stopped', managerId: a.config?.managerId || null, managerType: a.config?.externalManagerEmail ? 'external' : a.config?.managerId ? 'internal' : 'none', managerName: a.config?.externalManagerName || null, managerEmail: a.config?.externalManagerEmail || null, subordinateIds: [], subordinateCount: 0, isManager: false, level: 0, clockedIn: a.state === 'running', activeTasks: 0, errorsToday: 0, avatar: avatarMap[a.id] || null, comm: a.config?.comm || {} }; }));
      }
    }).catch(function(e) { setError(e.message || 'Failed to load'); });
    setLoading(false);
  }, []);

  useEffect(function() { load(); }, []);

  var layout = layoutTree(nodes);
  var positioned = layout.positioned; var treeW = layout.width; var treeH = layout.height;

  var handleWheel = useCallback(function(e) { e.preventDefault(); setZoom(function(z) { return Math.min(3, Math.max(0.15, z + (e.deltaY > 0 ? -0.08 : 0.08))); }); }, []);
  var handleMouseDown = useCallback(function(e) { if (e.button !== 0 || e.target.closest('.org-node')) return; setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }, [pan]);
  var handleMouseMove = useCallback(function(e) { if (!dragging) return; setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }, [dragging, dragStart]);
  var handleMouseUp = useCallback(function() { setDragging(false); }, []);
  useEffect(function() {
    if (dragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); return function() { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }; }
  }, [dragging, handleMouseMove, handleMouseUp]);

  var fitToView = useCallback(function() {
    if (!containerRef.current || !treeW || !treeH) return;
    var rect = containerRef.current.getBoundingClientRect();
    var scale = Math.min((rect.width - 40) / treeW, (rect.height - 40) / treeH, 1.5);
    setZoom(scale); setPan({ x: (rect.width - treeW * scale) / 2, y: (rect.height - treeH * scale) / 2 });
  }, [treeW, treeH]);
  useEffect(function() { if (positioned.length > 0) fitToView(); }, [positioned.length]);

  var getConnected = useCallback(function(id) {
    var connected = new Set([id]);
    var byId = new Map(); positioned.forEach(function(n) { byId.set(n.agentId, n); });
    var cur = byId.get(id);
    while (cur && cur.managerId && byId.has(cur.managerId)) { connected.add(cur.managerId); cur = byId.get(cur.managerId); }
    function addDesc(node) { node.children.forEach(function(c) { connected.add(c.agentId); addDesc(c); }); }
    var node = byId.get(id); if (node) addDesc(node);
    return connected;
  }, [positioned]);

  var connected = hoveredId ? getConnected(hoveredId) : null;
  var edges = [];
  positioned.forEach(function(node) { node.children.forEach(function(child) { edges.push({ parent: node, child: child }); }); });
  var hoveredNode = hoveredId ? positioned.find(function(n) { return n.agentId === hoveredId; }) : null;

  if (loading) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading organization chart...');
  if (error) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--danger)' } }, 'Error: ' + error);
  if (positioned.length === 0) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } },
    h('div', { style: { width: 48, height: 48, borderRadius: 12, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: ACCENT } }, I.orgChart()),
    h('div', { style: { fontSize: 18, fontWeight: 600, marginBottom: 8 } }, 'No Organization Hierarchy Yet'),
    h('div', { style: { color: 'var(--text-secondary)' } }, 'Add agents and configure manager relationships to see the org chart.')
  );

  return h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--oc-bg)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' } },
    h(orgCtx.Switcher, { style: { margin: '8px 12px 0', borderRadius: 6 } }),
    // Toolbar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--oc-border)', background: 'var(--oc-toolbar)', flexShrink: 0, flexWrap: 'wrap' } },
      h('div', { style: { fontWeight: 700, fontSize: 14, color: 'var(--oc-text)', display: 'flex', alignItems: 'center', gap: 6 } },
        I.orgChart(), 'Organization Chart',
        h(HelpButton, { label: 'Organization Chart' },
          h('p', null, 'Visual hierarchy of all agents in your organization. Shows reporting relationships, status, and activity at a glance.'),
          h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Interactions'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Hover'), ' \u2014 Highlights the agent\'s full chain and shows a detail tooltip.'),
            h('li', null, h('strong', null, 'Scroll'), ' \u2014 Zoom in/out.'),
            h('li', null, h('strong', null, 'Drag'), ' \u2014 Pan the canvas.'),
            h('li', null, h('strong', null, 'Fit'), ' \u2014 Auto-zoom to fit all agents.')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Purple nodes represent external (human) managers.')
        )
      ),
      h('div', { style: { color: 'var(--oc-dim)', fontSize: 12 } }, positioned.length + ' agents'),
      h('div', { style: { flex: 1 } }),
      legendDot('#15803d', 'Running'), legendDot('#6b7394', 'Stopped'), legendDot('#ef4444', 'Error'), legendDot('#f59e0b', 'Paused'), legendDot('#8b5cf6', 'External'),
      h('div', { style: { width: 1, height: 14, background: 'var(--oc-faint)', margin: '0 4px' } }),
      h('button', { onClick: function() { setZoom(function(z) { return Math.min(3, z + 0.2); }); }, style: toolbarBtnStyle }, '+'),
      h('div', { style: { color: 'var(--oc-dim)', fontSize: 11, minWidth: 36, textAlign: 'center' } }, Math.round(zoom * 100) + '%'),
      h('button', { onClick: function() { setZoom(function(z) { return Math.max(0.15, z - 0.2); }); }, style: toolbarBtnStyle }, '\u2212'),
      h('button', { onClick: fitToView, style: Object.assign({}, toolbarBtnStyle, { fontSize: 11, padding: '4px 10px' }) }, 'Fit'),
      h('button', { onClick: load, style: Object.assign({}, toolbarBtnStyle, { fontSize: 11, padding: '4px 10px' }) }, 'Refresh'),
    ),

    // Summary metrics
    h(OrgSummary, { nodes: positioned }),

    // Canvas
    h('div', {
      ref: containerRef,
      style: { flex: 1, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', position: 'relative' },
      onMouseDown: handleMouseDown,
      onWheel: handleWheel,
    },
      h('div', { style: { transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')', transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 } },
        // SVG edges
        h('svg', { width: treeW, height: treeH, style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } },
          h('defs', null,
            h('marker', { id: 'arrowhead', markerWidth: 8, markerHeight: 6, refX: 8, refY: 3, orient: 'auto' },
              h('polygon', { points: '0 0, 8 3, 0 6', fill: 'var(--oc-edge)' })
            ),
            h('marker', { id: 'arrowhead-hl', markerWidth: 8, markerHeight: 6, refX: 8, refY: 3, orient: 'auto' },
              h('polygon', { points: '0 0, 8 3, 0 6', fill: 'rgba(99,102,241,0.7)' })
            )
          ),
          edges.map(function(e, i) {
            var isHl = connected && connected.has(e.parent.agentId) && connected.has(e.child.agentId);
            var dim = connected && !isHl;
            return h('path', { key: i, d: edgePath(e.parent, e.child),
              stroke: isHl ? 'rgba(99,102,241,0.7)' : dim ? 'var(--oc-edge-dim)' : 'var(--oc-edge)',
              strokeWidth: isHl ? 2.5 : 1.5, fill: 'none',
              markerEnd: isHl ? 'url(#arrowhead-hl)' : 'url(#arrowhead)',
              style: { transition: 'stroke 0.2s, opacity 0.2s', opacity: dim ? 0.3 : 1 } });
          })
        ),
        // Nodes
        positioned.map(function(node) {
          var isHovered = hoveredId === node.agentId;
          var dim = connected && !connected.has(node.agentId);
          var stateColor = node.isExternal ? '#8b5cf6' : (STATE_COLORS[node.state] || '#6b7394');
          return h('div', {
            key: node.agentId, className: 'org-node',
            onMouseEnter: function(ev) { setHoveredId(node.agentId); setMousePos({ x: ev.clientX, y: ev.clientY }); },
            onMouseMove: function(ev) { if (isHovered) setMousePos({ x: ev.clientX, y: ev.clientY }); },
            onMouseLeave: function() { setHoveredId(null); },
            style: {
              position: 'absolute', left: node.x, top: node.y, width: NODE_W, height: NODE_H,
              background: isHovered ? 'var(--oc-card-h)' : 'var(--oc-card)',
              border: '1.5px solid ' + (isHovered ? stateColor + '66' : 'var(--oc-faint)'),
              borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
              transition: 'all 0.2s', opacity: dim ? 0.2 : 1, backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', gap: 10, userSelect: 'none',
            },
          },
            h('div', { style: { position: 'relative', flexShrink: 0 } },
              node.avatar
                ? h('img', { src: node.avatar, style: { width: 36, height: 36, borderRadius: '50%', border: '2px solid ' + stateColor, objectFit: 'cover' } })
                : h('div', { style: { width: 36, height: 36, borderRadius: '50%', background: node.isExternal ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : stateColor + '22', border: '2px solid ' + stateColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: node.isExternal ? '#fff' : stateColor } }, (node.name || '?').charAt(0).toUpperCase()),
              h('div', { style: { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: stateColor, border: '2px solid var(--oc-bg)' } })
            ),
            h('div', { style: { overflow: 'hidden', flex: 1, minWidth: 0 } },
              h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--oc-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, node.name || node.agentId),
              h('div', { style: { fontSize: 11, color: 'var(--oc-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 } }, node.role || (node.isExternal ? 'External Manager' : 'Agent')),
              !node.isExternal && h('div', { style: { display: 'flex', gap: 4, marginTop: 4 } },
                node.isManager && h('span', { style: tagStyle(ACCENT) }, 'MGR'),
                node.activeTasks > 0 && h('span', { style: tagStyle('#f59e0b') }, node.activeTasks + ' tasks'),
                node.errorsToday > 0 && h('span', { style: tagStyle('#ef4444') }, node.errorsToday + ' err')
              )
            )
          );
        })
      )
    ),

    // Hover tooltip
    hoveredNode && h('div', { style: {
      position: 'fixed', left: mousePos.x + 16, top: mousePos.y - 10,
      background: 'var(--oc-tip-bg)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--oc-faint)', borderRadius: 10,
      padding: '12px 16px', pointerEvents: 'none', zIndex: 1000, minWidth: 200, maxWidth: 280,
    }},
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
        hoveredNode.avatar
          ? h('img', { src: hoveredNode.avatar, style: { width: 32, height: 32, borderRadius: '50%', border: '2px solid ' + (STATE_COLORS[hoveredNode.state] || '#6b7394'), objectFit: 'cover' } })
          : h('div', { style: { width: 32, height: 32, borderRadius: '50%', background: 'var(--oc-card-h)', border: '2px solid ' + (STATE_COLORS[hoveredNode.state] || '#6b7394'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--oc-text)' } }, (hoveredNode.name || '?').charAt(0).toUpperCase()),
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--oc-text)' } }, hoveredNode.name),
          h('div', { style: { fontSize: 11, color: 'var(--oc-dim)' } }, hoveredNode.role))
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        tooltipRow('State', hoveredNode.state || 'unknown', STATE_COLORS[hoveredNode.state]),
        !hoveredNode.isExternal && tooltipRow('Clocked In', hoveredNode.clockedIn ? 'Yes' : 'No', hoveredNode.clockedIn ? '#15803d' : '#6b7394'),
        tooltipRow('Type', hoveredNode.isExternal ? 'External (Human)' : 'Internal (AI)'),
        hoveredNode.managerName && tooltipRow('Reports To', hoveredNode.managerName),
        hoveredNode.subordinateCount > 0 && tooltipRow('Direct Reports', String(hoveredNode.subordinateCount), ACCENT),
        hoveredNode.activeTasks > 0 && tooltipRow('Active Tasks', String(hoveredNode.activeTasks), '#f59e0b'),
        hoveredNode.errorsToday > 0 && tooltipRow('Errors Today', String(hoveredNode.errorsToday), '#ef4444'),
        hoveredNode.lastActivityAt && tooltipRow('Last Active', timeAgo(hoveredNode.lastActivityAt))
      )
    )
  );
}
