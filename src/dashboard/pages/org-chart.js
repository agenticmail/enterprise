import { h, useState, useEffect, useCallback, useRef, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';

// ─── Layout Constants ────────────────────────────────────
const NODE_W = 220;
const NODE_H = 72;
const H_GAP = 40;   // horizontal gap between siblings
const V_GAP = 80;   // vertical gap between levels
const PAD = 60;      // canvas padding

// ─── Colors ──────────────────────────────────────────────
const STATE_COLORS = {
  running: '#22c55e',
  stopped: '#6b7394',
  error: '#ef4444',
  paused: '#f59e0b',
  deploying: '#06b6d4',
};
const ACCENT = '#6366f1';
const EDGE_COLOR = 'rgba(255,255,255,0.25)';
const EDGE_HIGHLIGHT = 'rgba(99,102,241,0.7)';
const BG = '#0a0c14';

// ─── Tree Layout (Reingold-Tilford inspired, simplified) ─
function layoutTree(nodes) {
  if (!nodes || !nodes.length) return { positioned: [], width: 0, height: 0 };

  const byId = new Map();
  nodes.forEach(n => byId.set(n.agentId, { ...n, children: [], x: 0, y: 0, subtreeW: 0 }));

  // Build parent→children, detect roots
  const roots = [];
  for (const n of byId.values()) {
    if (n.managerId && byId.has(n.managerId)) {
      byId.get(n.managerId).children.push(n);
    } else {
      roots.push(n);
    }
  }

  // Also add external-manager virtual nodes
  const externalManagers = new Map();
  for (const n of byId.values()) {
    if (n.managerType === 'external' && n.managerName) {
      const key = 'ext-' + (n.managerEmail || n.managerName);
      if (!externalManagers.has(key)) {
        externalManagers.set(key, {
          agentId: key,
          name: n.managerName,
          role: 'External Manager',
          state: 'external',
          managerType: 'none',
          managerId: null,
          subordinateIds: [],
          subordinateCount: 0,
          isManager: true,
          level: -1,
          clockedIn: true,
          activeTasks: 0,
          errorsToday: 0,
          isExternal: true,
          children: [],
          x: 0, y: 0, subtreeW: 0,
        });
      }
      const extNode = externalManagers.get(key);
      // Remove from roots, add as child of external
      const idx = roots.indexOf(n);
      if (idx >= 0) roots.splice(idx, 1);
      extNode.children.push(n);
    }
  }
  // Add external managers as roots
  for (const ext of externalManagers.values()) {
    if (ext.children.length > 0) roots.push(ext);
  }

  if (roots.length === 0 && byId.size > 0) {
    // No clear root — just pick all as roots
    roots.push(...byId.values());
  }

  // Pass 1: compute subtree widths bottom-up
  function computeWidth(node) {
    if (node.children.length === 0) {
      node.subtreeW = NODE_W;
      return NODE_W;
    }
    let total = 0;
    node.children.forEach(c => { total += computeWidth(c); });
    total += (node.children.length - 1) * H_GAP;
    node.subtreeW = Math.max(NODE_W, total);
    return node.subtreeW;
  }

  // Pass 2: assign positions top-down
  function assignPositions(node, x, y) {
    node.x = x + node.subtreeW / 2 - NODE_W / 2;
    node.y = y;
    if (node.children.length === 0) return;
    let childX = x;
    const childrenTotalW = node.children.reduce((s, c) => s + c.subtreeW, 0) + (node.children.length - 1) * H_GAP;
    // Center children under parent
    childX = node.x + NODE_W / 2 - childrenTotalW / 2;
    node.children.forEach(c => {
      assignPositions(c, childX, y + NODE_H + V_GAP);
      childX += c.subtreeW + H_GAP;
    });
  }

  // Layout all root trees side by side
  let totalW = 0;
  roots.forEach(r => { totalW += computeWidth(r); });
  totalW += (roots.length - 1) * H_GAP * 2;

  let cx = PAD;
  roots.forEach(r => {
    assignPositions(r, cx, PAD);
    cx += r.subtreeW + H_GAP * 2;
  });

  // Flatten
  const positioned = [];
  let maxX = 0, maxY = 0;
  function flatten(node) {
    positioned.push(node);
    maxX = Math.max(maxX, node.x + NODE_W);
    maxY = Math.max(maxY, node.y + NODE_H);
    node.children.forEach(flatten);
  }
  roots.forEach(flatten);

  return { positioned, width: maxX + PAD, height: maxY + PAD + 40 };
}

// ─── SVG Edge Path (curved, child→parent = reports to) ──
function edgePath(parent, child) {
  const x1 = child.x + NODE_W / 2;
  const y1 = child.y;
  const x2 = parent.x + NODE_W / 2;
  const y2 = parent.y + NODE_H;
  const midY = y1 + (y2 - y1) * 0.5;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

// ─── Main Component ─────────────────────────────────────
export function OrgChartPage() {
  const { toast } = useApp();
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch agents (for avatars) alongside hierarchy
      const [hierRes, agentRes] = await Promise.all([
        engineCall('/hierarchy/org-chart').catch(() => null),
        engineCall('/agents?orgId=' + getOrgId()).catch(() => ({ agents: [] })),
      ]);
      const avatarMap = {};
      (agentRes.agents || []).forEach(a => {
        avatarMap[a.id] = a.config?.identity?.avatar || a.config?.avatar || a.config?.persona?.avatar || null;
      });
      if (hierRes && hierRes.nodes) {
        setNodes(hierRes.nodes.map(n => ({ ...n, avatar: avatarMap[n.agentId] || null })));
      } else {
        // Fallback: build from agents list
        const agents = agentRes.agents || [];
        setNodes(agents.map(a => ({
          agentId: a.id,
          name: a.config?.name || a.id,
          role: a.config?.role || 'Agent',
          state: a.state || 'stopped',
          managerId: a.config?.managerId || null,
          managerType: a.config?.externalManagerEmail ? 'external' : a.config?.managerId ? 'internal' : 'none',
          managerName: a.config?.externalManagerName || null,
          managerEmail: a.config?.externalManagerEmail || null,
          subordinateIds: [],
          subordinateCount: 0,
          isManager: false,
          level: 0,
          clockedIn: a.state === 'running',
          activeTasks: 0,
          errorsToday: 0,
          avatar: a.config?.identity?.avatar || a.config?.avatar || a.config?.persona?.avatar || null,
          comm: a.config?.comm || {},
        })));
      }
    } catch (e) {
      setError(e.message || 'Failed to load hierarchy');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Layout
  const { positioned, width: treeW, height: treeH } = layoutTree(nodes);

  // Zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => Math.min(3, Math.max(0.15, z + delta)));
  }, []);

  // Pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Only start drag on background (not on nodes)
    if (e.target.closest('.org-node')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => { setDragging(false); }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Fit to view
  const fitToView = useCallback(() => {
    if (!containerRef.current || !treeW || !treeH) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 40) / treeW;
    const scaleY = (rect.height - 40) / treeH;
    const scale = Math.min(scaleX, scaleY, 1.5);
    setZoom(scale);
    setPan({
      x: (rect.width - treeW * scale) / 2,
      y: (rect.height - treeH * scale) / 2,
    });
  }, [treeW, treeH]);

  useEffect(() => { if (positioned.length > 0) fitToView(); }, [positioned.length]);

  // Get ancestors + descendants for highlighting
  const getConnected = useCallback((id) => {
    const connected = new Set([id]);
    const byId = new Map();
    positioned.forEach(n => byId.set(n.agentId, n));
    // Walk up
    let cur = byId.get(id);
    while (cur && cur.managerId && byId.has(cur.managerId)) {
      connected.add(cur.managerId);
      cur = byId.get(cur.managerId);
    }
    // Walk down
    function addDesc(node) {
      node.children.forEach(c => { connected.add(c.agentId); addDesc(c); });
    }
    const node = byId.get(id);
    if (node) addDesc(node);
    return connected;
  }, [positioned]);

  const connected = hoveredId ? getConnected(hoveredId) : null;

  // Collect edges
  const edges = [];
  positioned.forEach(node => {
    node.children.forEach(child => {
      edges.push({ parent: node, child });
    });
  });

  // Hovered node for tooltip
  const hoveredNode = hoveredId ? positioned.find(n => n.agentId === hoveredId) : null;

  if (loading) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading organization chart...');
  if (error) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--danger)' } }, 'Error: ' + error);
  if (positioned.length === 0) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } },
    h('div', { style: { fontSize: 48, marginBottom: 16 } }, '\u{1F3E2}'),
    h('div', { style: { fontSize: 18, fontWeight: 600, marginBottom: 8 } }, 'No Organization Hierarchy Yet'),
    h('div', { style: { color: 'var(--text-secondary)' } }, 'Add agents and configure manager relationships to see the org chart.')
  );

  return h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', background: BG, borderRadius: 'var(--radius-lg)', overflow: 'hidden' } },
    // Toolbar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', flexShrink: 0 } },
      h('div', { style: { fontWeight: 700, fontSize: 16, color: '#fff', display: 'flex', alignItems: 'center' } }, 'Organization Chart', h(HelpButton, { label: 'Organization Chart' },
        h('p', null, 'Visual hierarchy of all agents in your organization. Shows reporting relationships, status, and activity at a glance.'),
        h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Interactions'),
        h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
          h('li', null, h('strong', null, 'Hover'), ' — Highlights the agent\'s full chain (managers above, reports below) and shows a detail tooltip.'),
          h('li', null, h('strong', null, 'Scroll'), ' — Zoom in/out.'),
          h('li', null, h('strong', null, 'Click & drag'), ' — Pan the canvas.'),
          h('li', null, h('strong', null, 'Fit'), ' — Auto-zoom to fit all agents in view.')
        ),
        h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Node badges'),
        h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
          h('li', null, h('strong', null, 'MGR'), ' — This agent manages other agents.'),
          h('li', null, h('strong', null, 'N tasks'), ' — Currently active tasks.'),
          h('li', null, h('strong', null, 'N err'), ' — Errors recorded today.')
        ),
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Purple nodes represent external (human) managers. Configure manager relationships in each agent\'s settings.')
      )),
      h('div', { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13 } }, positioned.length + ' agents'),
      h('div', { style: { flex: 1 } }),
      // Legend
      legendDot('#22c55e', 'Running'),
      legendDot('#6b7394', 'Stopped'),
      legendDot('#ef4444', 'Error'),
      legendDot('#f59e0b', 'Paused'),
      legendDot('#8b5cf6', 'External'),
      h('div', { style: { width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 4px' } }),
      // Zoom controls
      h('button', { onClick: () => setZoom(z => Math.min(3, z + 0.2)), style: toolbarBtnStyle }, '+'),
      h('div', { style: { color: 'rgba(255,255,255,0.5)', fontSize: 12, minWidth: 40, textAlign: 'center' } }, Math.round(zoom * 100) + '%'),
      h('button', { onClick: () => setZoom(z => Math.max(0.15, z - 0.2)), style: toolbarBtnStyle }, '\u2212'),
      h('button', { onClick: fitToView, style: { ...toolbarBtnStyle, fontSize: 11, padding: '4px 10px' } }, 'Fit'),
      h('button', { onClick: load, style: { ...toolbarBtnStyle, fontSize: 11, padding: '4px 10px' } }, 'Refresh'),
    ),

    // Canvas
    h('div', {
      ref: containerRef,
      style: { flex: 1, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', position: 'relative' },
      onMouseDown: handleMouseDown,
      onWheel: handleWheel,
    },
      h('div', { style: { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 } },
        // SVG edges
        h('svg', { width: treeW, height: treeH, style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } },
          h('defs', null,
            h('marker', { id: 'arrowhead', markerWidth: 8, markerHeight: 6, refX: 8, refY: 3, orient: 'auto' },
              h('polygon', { points: '0 0, 8 3, 0 6', fill: EDGE_COLOR })
            ),
            h('marker', { id: 'arrowhead-hl', markerWidth: 8, markerHeight: 6, refX: 8, refY: 3, orient: 'auto' },
              h('polygon', { points: '0 0, 8 3, 0 6', fill: EDGE_HIGHLIGHT })
            ),
          ),
          edges.map((e, i) => {
            const isHl = connected && connected.has(e.parent.agentId) && connected.has(e.child.agentId);
            const dim = connected && !isHl;
            return h('path', {
              key: i,
              d: edgePath(e.parent, e.child),
              stroke: isHl ? EDGE_HIGHLIGHT : dim ? 'rgba(255,255,255,0.06)' : EDGE_COLOR,
              strokeWidth: isHl ? 2.5 : 1.5,
              fill: 'none',
              markerEnd: isHl ? 'url(#arrowhead-hl)' : 'url(#arrowhead)',
              style: { transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s', opacity: dim ? 0.3 : 1 },
            });
          })
        ),
        // Nodes
        positioned.map(node => {
          const isHovered = hoveredId === node.agentId;
          const dim = connected && !connected.has(node.agentId);
          const stateColor = node.isExternal ? '#8b5cf6' : (STATE_COLORS[node.state] || '#6b7394');
          return h('div', {
            key: node.agentId,
            className: 'org-node',
            onMouseEnter: (e) => { setHoveredId(node.agentId); setMousePos({ x: e.clientX, y: e.clientY }); },
            onMouseMove: (e) => { if (isHovered) setMousePos({ x: e.clientX, y: e.clientY }); },
            onMouseLeave: () => setHoveredId(null),
            style: {
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: NODE_W,
              height: NODE_H,
              background: isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1.5px solid ${isHovered ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 12,
              padding: '10px 14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: dim ? 0.2 : 1,
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              userSelect: 'none',
            },
          },
            // Status dot + avatar
            h('div', { style: { position: 'relative', flexShrink: 0 } },
              node.avatar
                ? h('img', { src: node.avatar, style: {
                    width: 36, height: 36, borderRadius: '50%',
                    border: `2px solid ${stateColor}`,
                    objectFit: 'cover',
                  }})
                : h('div', { style: {
                    width: 36, height: 36, borderRadius: '50%',
                    background: node.isExternal ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : `linear-gradient(135deg, ${stateColor}33, ${stateColor}11)`,
                    border: `2px solid ${stateColor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: node.isExternal ? '#fff' : stateColor,
                  }}, (node.name || '?').charAt(0).toUpperCase()),
              // Online indicator
              h('div', { style: {
                position: 'absolute', bottom: -1, right: -1,
                width: 10, height: 10, borderRadius: '50%',
                background: stateColor,
                border: '2px solid ' + BG,
              }}),
            ),
            // Text
            h('div', { style: { overflow: 'hidden', flex: 1, minWidth: 0 } },
              h('div', { style: { fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, node.name || node.agentId),
              h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 } },
                node.role || (node.isExternal ? 'External Manager' : 'Agent')
              ),
              // Tags row
              !node.isExternal && h('div', { style: { display: 'flex', gap: 4, marginTop: 4 } },
                node.isManager && h('span', { style: tagStyle('#6366f1') }, 'MGR'),
                node.activeTasks > 0 && h('span', { style: tagStyle('#f59e0b') }, node.activeTasks + ' tasks'),
                node.errorsToday > 0 && h('span', { style: tagStyle('#ef4444') }, node.errorsToday + ' err'),
              ),
            ),
          );
        }),
      ),
    ),

    // Hover tooltip
    hoveredNode && h('div', { style: {
      position: 'fixed',
      left: mousePos.x + 16,
      top: mousePos.y - 10,
      background: 'rgba(15,17,23,0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10,
      padding: '12px 16px',
      pointerEvents: 'none',
      zIndex: 1000,
      minWidth: 200,
      maxWidth: 280,
    }},
      // Header with avatar
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
        hoveredNode.avatar
          ? h('img', { src: hoveredNode.avatar, style: { width: 32, height: 32, borderRadius: '50%', border: '2px solid ' + (STATE_COLORS[hoveredNode.state] || '#6b7394'), objectFit: 'cover' } })
          : h('div', { style: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px solid ' + (STATE_COLORS[hoveredNode.state] || '#6b7394'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' } }, (hoveredNode.name || '?').charAt(0).toUpperCase()),
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, color: '#fff' } }, hoveredNode.name),
          h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)' } }, hoveredNode.role),
        ),
      ),
      // Info rows
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        tooltipRow('State', hoveredNode.state || 'unknown', STATE_COLORS[hoveredNode.state]),
        !hoveredNode.isExternal && tooltipRow('Clocked In', hoveredNode.clockedIn ? 'Yes' : 'No', hoveredNode.clockedIn ? '#22c55e' : '#6b7394'),
        tooltipRow('Type', hoveredNode.isExternal ? 'External (Human)' : 'Internal (AI)'),
        hoveredNode.managerName && tooltipRow('Reports To', hoveredNode.managerName),
        hoveredNode.subordinateCount > 0 && tooltipRow('Direct Reports', String(hoveredNode.subordinateCount), ACCENT),
        hoveredNode.activeTasks > 0 && tooltipRow('Active Tasks', String(hoveredNode.activeTasks), '#f59e0b'),
        hoveredNode.errorsToday > 0 && tooltipRow('Errors Today', String(hoveredNode.errorsToday), '#ef4444'),
        hoveredNode.lastActivityAt && tooltipRow('Last Active', timeAgo(hoveredNode.lastActivityAt)),
      ),
    ),

    // (legend moved to toolbar)
  );
}

// ─── Helpers ─────────────────────────────────────────────
const toolbarBtnStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  padding: '4px 8px',
  cursor: 'pointer',
  lineHeight: '1.2',
};

function tagStyle(color) {
  return {
    fontSize: 9,
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: 4,
    background: color + '22',
    color: color,
    letterSpacing: '0.02em',
  };
}

function tooltipRow(label, value, color) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 } },
    h('span', { style: { color: 'rgba(255,255,255,0.4)' } }, label),
    h('span', { style: { fontWeight: 600, color: color || '#fff' } }, value),
  );
}

function legendDot(color, label) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
    h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: color } }),
    h('span', { style: { color: 'rgba(255,255,255,0.5)' } }, label),
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}
