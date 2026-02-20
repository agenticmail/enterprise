import { h, useState, useEffect, useRef, Fragment, useApp, engineCall, buildAgentEmailMap, resolveAgentEmail, buildAgentDataMap, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';

export function MessagesPage() {
  const { toast } = useApp();
  const [messages, setMessages] = useState([]);
  const [agents, setAgents] = useState([]);
  const [topology, setTopology] = useState(null);
  const [mainTab, setMainTab] = useState('messages');
  const [subTab, setSubTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ orgId: 'default', fromAgentId: '', toAgentId: '', subject: '', content: '', priority: 'normal' });
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodePositions, setNodePositions] = useState([]);
  const svgRef = useRef(null);

  const loadMessages = () => {
    engineCall('/messages?orgId=default&limit=100').then(d => setMessages(d.messages || [])).catch(() => {});
  };
  const loadAgents = () => {
    engineCall('/agents?orgId=default').then(d => setAgents(d.agents || [])).catch(() => {});
  };
  const loadTopology = () => {
    engineCall('/messages/topology?orgId=default').then(d => setTopology(d.topology || null)).catch(() => {});
  };
  useEffect(() => { loadMessages(); loadAgents(); loadTopology(); }, []);

  const send = async () => {
    try { await engineCall('/messages', { method: 'POST', body: JSON.stringify(form) }); toast('Message sent', 'success'); setShowModal(false); loadMessages(); loadTopology(); } catch (e) { toast(e.message, 'error'); }
  };

  // Agent name resolution
  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);
  const resolveAgent = (id) => renderAgentBadge(id, agentData);

  // Filtering logic
  const filtered = subTab === 'all' ? messages
    : subTab === 'internal' ? messages.filter(m => m.direction === 'internal')
    : subTab === 'external' ? messages.filter(m => m.direction === 'external_outbound' || m.direction === 'external_inbound')
    : messages.filter(m => m.type === subTab);

  const typeIcon = (t) => t === 'task' ? '\uD83D\uDCCB' : t === 'handoff' ? '\uD83E\uDD1D' : t === 'broadcast' ? '\uD83D\uDCE2' : '\uD83D\uDCAC';
  const channelIcon = (ch) => ch === 'email' ? '\uD83D\uDCE7' : ch === 'task' ? '\uD83D\uDCCB' : '\uD83D\uDCAC';
  const dirBadge = (dir) => {
    if (dir === 'internal') return h('span', { className: 'status-badge', style: { background: 'rgba(59,130,246,0.15)', color: '#3b82f6' } }, 'Internal');
    if (dir === 'external_outbound') return h('span', { className: 'status-badge', style: { background: 'rgba(249,115,22,0.15)', color: '#f97316' } }, 'Ext Out');
    if (dir === 'external_inbound') return h('span', { className: 'status-badge', style: { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } }, 'Ext In');
    return h('span', { className: 'status-badge' }, dir || 'unknown');
  };

  // Stats from topology
  const stats = topology ? topology.stats : { totalMessages: 0, internalMessages: 0, externalOutbound: 0, externalInbound: 0 };

  // ── Force-directed layout for topology ──
  useEffect(() => {
    if (mainTab !== 'topology' || !topology || !topology.nodes.length) { setNodePositions([]); return; }
    const W = svgRef.current ? svgRef.current.getBoundingClientRect().width || 800 : 800;
    const H = 500;
    const nodes = topology.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + (Math.cos(i * 2 * Math.PI / topology.nodes.length) * 150) + (Math.random() - 0.5) * 40,
      y: H / 2 + (Math.sin(i * 2 * Math.PI / topology.nodes.length) * 150) + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0,
    }));
    const idxMap = {};
    nodes.forEach((n, i) => { idxMap[n.id] = i; });
    const edges = topology.edges.filter(e => idxMap[e.from] !== undefined && idxMap[e.to] !== undefined);

    for (let iter = 0; iter < 200; iter++) {
      // Charge repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let force = 3000 / (dist * dist);
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          nodes[i].vx -= fx; nodes[i].vy -= fy;
          nodes[j].vx += fx; nodes[j].vy += fy;
        }
      }
      // Link spring
      for (const e of edges) {
        const a = nodes[idxMap[e.from]], b = nodes[idxMap[e.to]];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = (dist - 120) * 0.05;
        let fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Center gravity
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.01;
        n.vy += (H / 2 - n.y) * 0.01;
      }
      // Apply velocity with damping
      for (const n of nodes) {
        n.vx *= 0.6; n.vy *= 0.6;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(40, Math.min(W - 40, n.x));
        n.y = Math.max(40, Math.min(H - 40, n.y));
      }
    }
    setNodePositions(nodes);
  }, [mainTab, topology]);

  // ── Build topology detail panel ──
  const buildDetailPanel = () => {
    if (!selectedNode || !topology) return null;
    const node = topology.nodes.find(n => n.id === selectedNode);
    if (!node) return null;
    const sentEdges = topology.edges.filter(e => e.from === node.id);
    const recvEdges = topology.edges.filter(e => e.to === node.id);
    const sentCount = sentEdges.reduce((s, e) => s + e.messageCount, 0);
    const recvCount = recvEdges.reduce((s, e) => s + e.messageCount, 0);
    const partners = {};
    sentEdges.forEach(e => { partners[e.to] = (partners[e.to] || 0) + e.messageCount; });
    recvEdges.forEach(e => { partners[e.from] = (partners[e.from] || 0) + e.messageCount; });
    const topPartners = Object.entries(partners).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const resolveTopoName = (id) => {
      const n = topology.nodes.find(nd => nd.id === id);
      return n ? n.name : id;
    };

    return h('div', { className: 'card', style: { marginTop: 16 } },
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          h('div', null,
            h('h3', { style: { margin: '0 0 4px 0' } }, node.name),
            node.email && h('div', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 } }, node.email),
            h('span', { className: 'status-badge ' + (node.state === 'running' ? 'status-success' : node.type === 'external' ? 'status-warning' : 'status-info') },
              node.type === 'external' ? 'External' : (node.state || 'unknown'))
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setSelectedNode(null) }, I.x())
        ),
        h('div', { style: { display: 'flex', gap: 24, margin: '12px 0' } },
          h('div', null, h('div', { style: { fontSize: 20, fontWeight: 700 } }, sentCount), h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Sent')),
          h('div', null, h('div', { style: { fontSize: 20, fontWeight: 700 } }, recvCount), h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Received'))
        ),
        topPartners.length > 0 && h('div', null,
          h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 } }, 'Top Communication Partners'),
          topPartners.map(([pid, cnt]) => h('div', { key: pid, style: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 } },
            h('span', null, resolveTopoName(pid)),
            h('span', { style: { color: 'var(--text-muted)' } }, cnt, ' msgs')
          ))
        )
      )
    );
  };

  // ── Render topology SVG ──
  const renderTopology = () => {
    if (!topology || !topology.nodes.length) {
      return h('div', { className: 'card' },
        h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No topology data. Send messages between agents to see the communication graph.')
      );
    }
    const idxMap = {};
    nodePositions.forEach((n, i) => { idxMap[n.id] = i; });
    const W = svgRef.current ? svgRef.current.getBoundingClientRect().width || 800 : 800;
    const edges = topology.edges.filter(e => idxMap[e.from] !== undefined && idxMap[e.to] !== undefined);

    return h('div', null,
      h('div', { className: 'card' },
        h('svg', { ref: svgRef, width: '100%', height: 500, style: { display: 'block', background: 'var(--bg-secondary)', borderRadius: 8 } },
          // Edges
          edges.map((e, i) => {
            const from = nodePositions[idxMap[e.from]];
            const to = nodePositions[idxMap[e.to]];
            if (!from || !to) return null;
            const sw = Math.min(6, Math.max(1, e.messageCount));
            const color = e.direction === 'internal' ? '#3b82f6' : '#f97316';
            return h('line', { key: 'e' + i, x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: color, strokeWidth: sw, strokeOpacity: selectedNode ? (e.from === selectedNode || e.to === selectedNode ? 1 : 0.15) : 0.6 });
          }),
          // Nodes
          nodePositions.map((n, i) => {
            const isAgent = n.type === 'agent';
            const isSelected = n.id === selectedNode;
            const dimmed = selectedNode && !isSelected && !edges.some(e => (e.from === selectedNode && e.to === n.id) || (e.to === selectedNode && e.from === n.id));
            const opacity = dimmed ? 0.25 : 1;
            return h('g', { key: 'n' + i, style: { cursor: 'pointer', opacity: opacity }, onClick: () => setSelectedNode(n.id === selectedNode ? null : n.id) },
              isAgent
                ? h('circle', { cx: n.x, cy: n.y, r: isSelected ? 18 : 14, fill: n.state === 'running' ? '#22c55e' : '#9ca3af', stroke: isSelected ? '#fff' : 'none', strokeWidth: isSelected ? 3 : 0 })
                : h('rect', { x: n.x - (isSelected ? 12 : 9), y: n.y - (isSelected ? 12 : 9), width: isSelected ? 24 : 18, height: isSelected ? 24 : 18, rx: 3, fill: '#f97316', stroke: isSelected ? '#fff' : 'none', strokeWidth: isSelected ? 3 : 0 }),
              h('text', { x: n.x, y: n.y + (isAgent ? 28 : 26), textAnchor: 'middle', fontSize: 11, fill: 'var(--text-secondary)' }, n.name.length > 16 ? n.name.substring(0, 14) + '..' : n.name)
            );
          })
        )
      ),
      buildDetailPanel()
    );
  };

  return h('div', { className: 'page-inner' },
    // Page header
    h('div', { className: 'page-header' }, h('h1', null, 'Agent Messages'), h('button', { className: 'btn btn-primary', onClick: () => setShowModal(true) }, I.plus(), ' New Message')),

    // Stats cards
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 } },
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.totalMessages), h('div', { className: 'stat-label' }, 'Total')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.internalMessages), h('div', { className: 'stat-label' }, 'Internal')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.externalOutbound), h('div', { className: 'stat-label' }, 'External Out')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.externalInbound), h('div', { className: 'stat-label' }, 'External In'))
    ),

    // Main tabs: Messages | Topology
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      h('button', { className: 'tab' + (mainTab === 'messages' ? ' active' : ''), onClick: () => setMainTab('messages') }, 'Messages'),
      h('button', { className: 'tab' + (mainTab === 'topology' ? ' active' : ''), onClick: () => setMainTab('topology') }, 'Topology')
    ),

    // Messages tab content
    mainTab === 'messages' && h('div', null,
      // Sub-tabs
      h('div', { className: 'tabs', style: { marginBottom: 12 } },
        ['all', 'internal', 'external', 'message', 'task', 'handoff', 'broadcast'].map(t =>
          h('button', { key: t, className: 'tab' + (subTab === t ? ' active' : ''), onClick: () => setSubTab(t) },
            t === 'all' ? 'All' : t === 'internal' ? 'Internal' : t === 'external' ? 'External' : t.charAt(0).toUpperCase() + t.slice(1) + 's')
        )
      ),
      h('div', { className: 'card' },
        h('table', { className: 'data-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Type'), h('th', null, 'Direction'), h('th', null, 'Channel'), h('th', null, 'From'), h('th', null, 'To'), h('th', null, 'Subject'), h('th', null, 'Status'), h('th', null, 'Priority'), h('th', null, 'Time')
          )),
          h('tbody', null, filtered.length === 0
            ? h('tr', null, h('td', { colSpan: 9, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No messages'))
            : filtered.map(m => h('tr', { key: m.id },
              h('td', null, typeIcon(m.type), ' ', m.type),
              h('td', null, dirBadge(m.direction)),
              h('td', null, channelIcon(m.channel), ' ', m.channel || 'direct'),
              h('td', null, resolveAgent(m.fromAgentId)),
              h('td', null, resolveAgent(m.toAgentId)),
              h('td', null, h('strong', null, m.subject)),
              h('td', null, h('span', { className: 'status-badge status-' + (m.status === 'completed' ? 'success' : m.status === 'failed' ? 'error' : m.status === 'read' ? 'info' : 'warning') }, m.status)),
              h('td', null, m.priority),
              h('td', null, new Date(m.createdAt).toLocaleString())
            ))
          )
        )
      )
    ),

    // Topology tab content
    mainTab === 'topology' && renderTopology(),

    // New Message modal (unchanged)
    showModal && h('div', { className: 'modal-overlay', onClick: () => setShowModal(false) },
      h('div', { className: 'modal', onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' }, h('h2', null, 'Send Message'), h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setShowModal(false) }, I.x())),
        h('div', { className: 'modal-body' },
          h('label', { className: 'field-label' }, 'From Agent'),
          h('select', { className: 'input', value: form.fromAgentId, onChange: e => setForm({ ...form, fromAgentId: e.target.value }) },
            h('option', { value: '' }, '-- Select Agent --'),
            agents.map(a => h('option', { key: a.id, value: a.id }, (a.config?.displayName || a.config?.name || a.name || 'Agent') + (a.config?.email?.address ? ' (' + a.config.email.address + ')' : '')))
          ),
          h('label', { className: 'field-label' }, 'To Agent'),
          h('select', { className: 'input', value: form.toAgentId, onChange: e => setForm({ ...form, toAgentId: e.target.value }) },
            h('option', { value: '' }, '-- Select Agent --'),
            agents.map(a => h('option', { key: a.id, value: a.id }, (a.config?.displayName || a.config?.name || a.name || 'Agent') + (a.config?.email?.address ? ' (' + a.config.email.address + ')' : '')))
          ),
          h('label', { className: 'field-label' }, 'Subject'), h('input', { className: 'input', value: form.subject, onChange: e => setForm({ ...form, subject: e.target.value }) }),
          h('label', { className: 'field-label' }, 'Content'), h('textarea', { className: 'input', style: { minHeight: 80 }, value: form.content, onChange: e => setForm({ ...form, content: e.target.value }) }),
          h('label', { className: 'field-label' }, 'Priority'),
          h('select', { className: 'input', value: form.priority, onChange: e => setForm({ ...form, priority: e.target.value }) }, h('option', { value: 'low' }, 'Low'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'high' }, 'High'), h('option', { value: 'urgent' }, 'Urgent'))
        ),
        h('div', { className: 'modal-footer' }, h('button', { className: 'btn btn-ghost', onClick: () => setShowModal(false) }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: send }, 'Send'))
      )
    )
  );
}
