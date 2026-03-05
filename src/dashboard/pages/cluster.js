import { h, useState, useEffect, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';

export function ClusterPage() {
  var app = useApp();
  var toast = app.toast;
  var [nodes, setNodes] = useState([]);
  var [stats, setStats] = useState(null);
  var [loading, setLoading] = useState(true);

  var load = function() {
    engineCall('/cluster/nodes').then(function(d) {
      setNodes(d.nodes || []);
      setStats(d.stats || null);
      setLoading(false);
    }).catch(function() { setLoading(false); });
  };

  useEffect(function() { load(); }, []);

  // Real-time updates via SSE
  useEffect(function() {
    var es = new EventSource('/api/engine/cluster/stream');
    es.onmessage = function(ev) {
      try {
        var d = JSON.parse(ev.data);
        if (d.type === 'node') {
          setNodes(function(prev) {
            var idx = prev.findIndex(function(n) { return n.nodeId === d.nodeId; });
            var next = prev.slice();
            if (idx >= 0) {
              if (d.event === 'offline') { next[idx] = Object.assign({}, next[idx], { status: 'offline' }); }
              else { next[idx] = d; }
            } else if (d.event === 'register' || d.event === 'snapshot') {
              next.push(d);
            }
            return next;
          });
        }
      } catch(e) {}
    };
    return function() { es.close(); };
  }, []);

  var removeNode = function(nodeId) {
    if (!confirm('Remove worker node "' + nodeId + '"? Agents on it will become unreachable.')) return;
    engineCall('/cluster/nodes/' + nodeId, { method: 'DELETE' }).then(function() {
      toast('Node removed', 'success');
      load();
    }).catch(function(e) { toast(e.message, 'error'); });
  };

  var statusColor = function(s) {
    return { online: 'success', degraded: 'warning', offline: 'neutral' }[s] || 'neutral';
  };

  var formatBytes = function(mb) {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  };

  var timeSince = function(iso) {
    if (!iso) return 'never';
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  if (loading) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading cluster...');

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Cluster'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Manage worker nodes running agents across multiple machines')
      ),
      h('button', { className: 'btn btn-secondary btn-sm', onClick: load }, I.refresh(), ' Refresh')
    ),

    // Stats cards
    stats && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 } },
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16 } },
        h('div', { style: { fontSize: 24, fontWeight: 700 } }, stats.totalNodes),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Total Nodes')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16 } },
        h('div', { style: { fontSize: 24, fontWeight: 700, color: 'var(--accent-green)' } }, stats.onlineNodes),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Online')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16 } },
        h('div', { style: { fontSize: 24, fontWeight: 700 } }, stats.totalAgents),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Running Agents')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16 } },
        h('div', { style: { fontSize: 24, fontWeight: 700 } }, stats.totalCpus),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Total CPUs')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16 } },
        h('div', { style: { fontSize: 24, fontWeight: 700 } }, formatBytes(stats.totalMemoryMb)),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Total Memory')
      ))
    ),

    // Nodes
    nodes.length === 0
      ? h('div', { className: 'card' }, h('div', { className: 'card-body' },
          h('div', { className: 'empty-state' },
            I.server(),
            h('h3', null, 'No worker nodes'),
            h('p', null, 'Worker nodes auto-register when you deploy agents to remote machines.'),
            h('div', { style: { marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'left', maxWidth: 500, margin: '16px auto' } },
              h('div', { style: { fontWeight: 600, marginBottom: 8 } }, 'How to add a worker node:'),
              h('ol', { style: { paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 } },
                h('li', null, 'Install on the remote machine: ', h('code', null, 'npm i -g @agenticmail/enterprise')),
                h('li', null, 'Set environment variables:'),
                h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', margin: '4px 0' } },
                  'ENTERPRISE_URL=https://your-dashboard.agenticmail.io\nWORKER_NODE_ID=mac-mini-2\nWORKER_NAME="Office Mac Mini"\nDATABASE_URL=postgres://...'
                ),
                h('li', null, 'Start agent: ', h('code', null, 'agenticmail-enterprise agent --id <agent-id>')),
                h('li', null, 'The node will auto-register and appear here')
              )
            )
          )
        ))
      : h('div', { style: { display: 'grid', gap: 12 } },
          nodes.map(function(node) {
            return h('div', { key: node.nodeId, className: 'card' },
              h('div', { className: 'card-body', style: { padding: 16 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                  h('div', null,
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                      h('span', { style: { fontSize: 16, fontWeight: 700 } }, node.name || node.nodeId),
                      h('span', { className: 'badge badge-' + statusColor(node.status), style: { textTransform: 'capitalize' } }, node.status)
                    ),
                    h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } },
                      node.host + ':' + node.port, ' | ',
                      node.platform + '/' + node.arch, ' | ',
                      'v' + node.version
                    )
                  ),
                  h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { removeNode(node.nodeId); }, title: 'Remove' },
                    I.trash()
                  )
                ),
                // Resources
                h('div', { style: { display: 'flex', gap: 20, marginTop: 12 } },
                  h('div', null,
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'CPUs'),
                    h('div', { style: { fontWeight: 600 } }, node.cpuCount)
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Memory'),
                    h('div', { style: { fontWeight: 600 } }, formatBytes(node.memoryMb))
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Agents'),
                    h('div', { style: { fontWeight: 600 } }, node.agents ? node.agents.length : 0)
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Last Heartbeat'),
                    h('div', { style: { fontWeight: 600, color: node.status === 'online' ? 'var(--accent-green)' : 'var(--text-muted)' } }, timeSince(node.lastHeartbeat))
                  )
                ),
                // Capabilities
                node.capabilities && node.capabilities.length > 0 && h('div', { style: { display: 'flex', gap: 4, marginTop: 8 } },
                  node.capabilities.map(function(c) {
                    return h('span', { key: c, className: 'badge badge-neutral', style: { fontSize: 10 } }, c);
                  })
                ),
                // Agent list
                node.agents && node.agents.length > 0 && h('div', { style: { marginTop: 8, fontSize: 12, color: 'var(--text-muted)' } },
                  'Running: ', node.agents.join(', ')
                )
              )
            );
          })
        )
  );
}
