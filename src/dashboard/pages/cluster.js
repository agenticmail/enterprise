import { h, useState, useEffect, useRef, Fragment, useApp, engineCall, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

function AddNodeModal({ onClose, onAdded, toast }) {
  var [tab, setTab] = useState('manual'); // manual | ssh | script
  var [form, setForm] = useState({ nodeId: '', name: '', host: '', port: 3101, sshHost: '', sshUser: 'root', sshKey: '', agentIds: '' });
  var [testing, setTesting] = useState(false);
  var [testResult, setTestResult] = useState(null);
  var [saving, setSaving] = useState(false);
  var [scriptGenerated, setScriptGenerated] = useState('');

  var set = function(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  var testConnection = function() {
    if (!form.host) { toast('Host is required', 'error'); return; }
    setTesting(true); setTestResult(null);
    engineCall('/cluster/test-connection', {
      method: 'POST',
      body: JSON.stringify({ host: form.host, port: form.port || 3101 }),
    }).then(function(d) { setTestResult(d); setTesting(false); })
      .catch(function(e) { setTestResult({ success: false, error: e.message }); setTesting(false); });
  };

  var saveManual = function() {
    if (!form.host) { toast('Host IP/hostname is required', 'error'); return; }
    var nodeId = form.nodeId || form.host.replace(/[^a-zA-Z0-9-]/g, '-');
    setSaving(true);
    engineCall('/cluster/register', {
      method: 'POST',
      body: JSON.stringify({
        nodeId: nodeId,
        name: form.name || nodeId,
        host: form.host,
        port: parseInt(form.port) || 3101,
      }),
    }).then(function(d) { toast('Node added successfully', 'success'); onAdded(); onClose(); })
      .catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  };

  var deploySsh = function() {
    if (!form.sshHost) { toast('SSH host is required', 'error'); return; }
    setSaving(true);
    engineCall('/cluster/deploy-via-ssh', {
      method: 'POST',
      body: JSON.stringify({
        host: form.sshHost,
        user: form.sshUser || 'root',
        privateKey: form.sshKey || undefined,
        agentIds: form.agentIds ? form.agentIds.split(',').map(function(s) { return s.trim(); }) : [],
        port: parseInt(form.port) || 3101,
        name: form.name || form.sshHost,
      }),
    }).then(function(d) { toast('Deployment started: ' + (d.message || 'check progress'), 'success'); onAdded(); onClose(); })
      .catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  };

  var generateScript = function() {
    apiCall('/settings').then(function(settings) {
      var dashUrl = settings?.domainStatus?.url || (typeof location !== 'undefined' ? location.origin : 'https://your-dashboard.agenticmail.io');
      var dbUrl = '<YOUR_DATABASE_URL>';
      var nodeId = form.nodeId || form.name?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'worker-1';
      var script = '#!/bin/bash\n' +
        '# AgenticMail Worker Node Setup Script\n' +
        '# Generated for: ' + (form.name || nodeId) + '\n' +
        '# Run this on the target machine\n\n' +
        'set -e\n\n' +
        '# 1. Install Node.js (if not installed)\n' +
        'if ! command -v node &> /dev/null; then\n' +
        '  echo "Installing Node.js..."\n' +
        '  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\n' +
        '  sudo apt-get install -y nodejs || brew install node\n' +
        'fi\n\n' +
        '# 2. Install AgenticMail Enterprise\n' +
        'npm install -g @agenticmail/enterprise\n\n' +
        '# 3. Create environment file\n' +
        'mkdir -p ~/.agenticmail\n' +
        'cat > ~/.agenticmail/worker.env << \'ENV\'\n' +
        'ENTERPRISE_URL=' + dashUrl + '\n' +
        'WORKER_NODE_ID=' + nodeId + '\n' +
        'WORKER_NAME="' + (form.name || nodeId) + '"\n' +
        'DATABASE_URL=' + dbUrl + '\n' +
        'PORT=' + (form.port || 3101) + '\n' +
        'LOG_LEVEL=warn\n' +
        'ENV\n\n' +
        '# 4. Install PM2 for process management\n' +
        'npm install -g pm2\n\n' +
        '# 5. Start agent (replace <AGENT_ID> with actual ID)\n' +
        '# pm2 start "agenticmail-enterprise agent --id <AGENT_ID>" --name agent-1 --env-path ~/.agenticmail/worker.env\n\n' +
        'echo ""\n' +
        'echo "Worker node setup complete!"\n' +
        'echo "Edit ~/.agenticmail/worker.env to set DATABASE_URL"\n' +
        'echo "Then start agents with: pm2 start \\"agenticmail-enterprise agent --id <AGENT_ID>\\""\n';
      setScriptGenerated(script);
    }).catch(function() {
      toast('Failed to generate script', 'error');
    });
  };

  var S = { padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', fontSize: 13 };

  return h('div', { className: 'modal-overlay', onClick: function(e) { if (e.target.className === 'modal-overlay') onClose(); } },
    h('div', { className: 'modal', style: { maxWidth: 640 } },
      h('div', { className: 'modal-header' },
        h('h3', null, 'Add Worker Node'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: onClose }, 'X')
      ),
      h('div', { className: 'modal-body' },
        // Tabs
        h('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' } },
          ['manual', 'ssh', 'script'].map(function(t) {
            var labels = { manual: 'Manual Registration', ssh: 'Deploy via SSH', script: 'Setup Script' };
            return h('button', {
              key: t,
              style: { padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--accent-text)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' },
              onClick: function() { setTab(t); }
            }, labels[t]);
          })
        ),

        tab === 'manual' && h(Fragment, null,
          h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 } },
            'Register an existing machine that\'s already running AgenticMail. The node will appear in the cluster and start reporting status.'
          ),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', null,
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Node Name'),
              h('input', { style: S, value: form.name, placeholder: 'e.g., Office Mac Mini', onChange: function(e) { set('name', e.target.value); } })
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 } },
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Host IP / Hostname *'),
                h('input', { style: S, value: form.host, placeholder: '192.168.1.50 or worker.example.com', onChange: function(e) { set('host', e.target.value); } })
              ),
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Port'),
                h('input', { style: S, type: 'number', value: form.port, onChange: function(e) { set('port', e.target.value); } })
              )
            ),
            h('div', null,
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Node ID'),
              h('input', { style: S, value: form.nodeId, placeholder: 'Auto-generated from hostname', onChange: function(e) { set('nodeId', e.target.value); } })
            ),
            // Test connection button
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              h('button', { className: 'btn btn-secondary btn-sm', onClick: testConnection, disabled: testing || !form.host }, testing ? 'Testing...' : 'Test Connection'),
              testResult && h('span', { style: { fontSize: 12, color: testResult.success ? 'var(--accent-green)' : 'var(--accent-red)' } },
                testResult.success ? 'Connected! ' + (testResult.version || '') : 'Failed: ' + (testResult.error || 'unreachable')
              )
            ),
          ),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 } },
            h('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
            h('button', { className: 'btn btn-primary', onClick: saveManual, disabled: saving }, saving ? 'Adding...' : 'Add Node')
          )
        ),

        tab === 'ssh' && h(Fragment, null,
          h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 } },
            'Automatically install AgenticMail and configure a worker node on a remote machine via SSH. The dashboard will SSH in, install dependencies, and start the agent process.'
          ),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', null,
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Node Name'),
              h('input', { style: S, value: form.name, placeholder: 'e.g., AWS Instance 1', onChange: function(e) { set('name', e.target.value); } })
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 } },
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'SSH Host *'),
                h('input', { style: S, value: form.sshHost, placeholder: '1.2.3.4 or server.example.com', onChange: function(e) { set('sshHost', e.target.value); } })
              ),
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'SSH User'),
                h('input', { style: S, value: form.sshUser, onChange: function(e) { set('sshUser', e.target.value); } })
              )
            ),
            h('div', null,
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'SSH Private Key (paste or leave blank for default ~/.ssh/id_rsa)'),
              h('textarea', { style: Object.assign({}, S, { height: 80, fontFamily: 'monospace', fontSize: 11 }), value: form.sshKey, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----\n...', onChange: function(e) { set('sshKey', e.target.value); } })
            ),
            h('div', null,
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Agent IDs to deploy (comma-separated, or leave blank)'),
              h('input', { style: S, value: form.agentIds, placeholder: 'agent-uuid-1, agent-uuid-2', onChange: function(e) { set('agentIds', e.target.value); } })
            ),
          ),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 } },
            h('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
            h('button', { className: 'btn btn-primary', onClick: deploySsh, disabled: saving || !form.sshHost }, saving ? 'Deploying...' : 'Deploy Worker')
          )
        ),

        tab === 'script' && h(Fragment, null,
          h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 } },
            'Generate a setup script to run on the target machine. Copy the script, SSH into the machine, and paste it.'
          ),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Node Name'),
                h('input', { style: S, value: form.name, placeholder: 'my-worker', onChange: function(e) { set('name', e.target.value); } })
              ),
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Port'),
                h('input', { style: S, type: 'number', value: form.port, onChange: function(e) { set('port', e.target.value); } })
              )
            ),
            h('button', { className: 'btn btn-primary btn-sm', onClick: generateScript }, 'Generate Setup Script'),
            scriptGenerated && h(Fragment, null,
              h('div', { style: { position: 'relative' } },
                h('pre', { style: { background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 11, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' } }, scriptGenerated),
                h('button', { className: 'btn btn-secondary btn-sm', style: { position: 'absolute', top: 8, right: 8 },
                  onClick: function() { navigator.clipboard.writeText(scriptGenerated); toast('Script copied to clipboard', 'success'); }
                }, 'Copy')
              )
            )
          ),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 } },
            h('button', { className: 'btn btn-secondary', onClick: onClose }, 'Close')
          )
        )
      )
    )
  );
}

function NodeDetailModal({ node, onClose, onRefresh, toast }) {
  var [pinging, setPinging] = useState(false);
  var [pingResult, setPingResult] = useState(null);
  var [agents, setAgents] = useState([]);

  useEffect(function() {
    // Fetch agent details for this node
    if (node.agents && node.agents.length > 0) {
      engineCall('/agents').then(function(d) {
        var all = d.agents || d || [];
        setAgents(all.filter(function(a) { return node.agents.indexOf(a.id) >= 0; }));
      }).catch(function() {});
    }
  }, [node.nodeId]);

  var pingNode = function() {
    setPinging(true); setPingResult(null);
    engineCall('/cluster/test-connection', {
      method: 'POST',
      body: JSON.stringify({ host: node.host, port: node.port }),
    }).then(function(d) { setPingResult(d); setPinging(false); })
      .catch(function(e) { setPingResult({ success: false, error: e.message }); setPinging(false); });
  };

  var restartNode = function() {
    if (!confirm('Restart all agents on ' + node.name + '?')) return;
    engineCall('/cluster/nodes/' + node.nodeId + '/restart', { method: 'POST' })
      .then(function() { toast('Restart signal sent', 'success'); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var statusColor = { online: 'var(--accent-green)', degraded: 'var(--accent-orange)', offline: 'var(--text-muted)' }[node.status] || 'var(--text-muted)';
  var uptime = node.onlineSince ? Math.floor((Date.now() - new Date(node.registeredAt).getTime()) / 86400000) + ' days' : '-';

  return h('div', { className: 'modal-overlay', onClick: function(e) { if (e.target.className === 'modal-overlay') onClose(); } },
    h('div', { className: 'modal', style: { maxWidth: 600 } },
      h('div', { className: 'modal-header' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: statusColor, display: 'inline-block' } }),
          h('h3', { style: { margin: 0 } }, node.name || node.nodeId)
        ),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: onClose }, 'X')
      ),
      h('div', { className: 'modal-body' },
        // Info grid
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 } },
          h('div', null, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Platform'), h('div', { style: { fontWeight: 600 } }, node.platform + '/' + node.arch)),
          h('div', null, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'CPUs'), h('div', { style: { fontWeight: 600 } }, node.cpuCount)),
          h('div', null, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Memory'), h('div', { style: { fontWeight: 600 } }, node.memoryMb >= 1024 ? (node.memoryMb / 1024).toFixed(1) + ' GB' : node.memoryMb + ' MB')),
          h('div', null, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Address'), h('div', { style: { fontWeight: 600, fontFamily: 'monospace', fontSize: 12 } }, node.host + ':' + node.port)),
          h('div', null, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Version'), h('div', { style: { fontWeight: 600 } }, 'v' + (node.version || '?'))),
          h('div', null, h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Registered'), h('div', { style: { fontWeight: 600 } }, node.registeredAt ? new Date(node.registeredAt).toLocaleDateString() : '-')),
        ),

        // Capabilities
        node.capabilities && node.capabilities.length > 0 && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, 'Capabilities'),
          h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
            node.capabilities.map(function(c) { return h('span', { key: c, className: 'badge badge-neutral' }, c); })
          )
        ),

        // Agents on this node
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, 'Agents (' + (node.agents ? node.agents.length : 0) + ')'),
          node.agents && node.agents.length > 0
            ? h('div', { style: { display: 'grid', gap: 6 } },
                agents.length > 0
                  ? agents.map(function(a) {
                      return h('div', { key: a.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6 } },
                        h('span', { style: { fontWeight: 600, fontSize: 13 } }, a.name || a.id),
                        h('span', { style: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' } }, a.email || ''),
                        h('span', { className: 'badge badge-neutral', style: { marginLeft: 'auto' } }, a.role || 'agent')
                      );
                    })
                  : node.agents.map(function(id) {
                      return h('div', { key: id, style: { padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 } }, id);
                    })
              )
            : h('div', { style: { fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' } }, 'No agents running on this node')
        ),

        // Actions
        h('div', { style: { display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' } },
          h('button', { className: 'btn btn-secondary btn-sm', onClick: pingNode, disabled: pinging }, pinging ? 'Pinging...' : 'Ping Node'),
          pingResult && h('span', { style: { fontSize: 12, color: pingResult.success ? 'var(--accent-green)' : 'var(--accent-red)', alignSelf: 'center' } },
            pingResult.success ? 'Reachable (' + (pingResult.latencyMs || '?') + 'ms)' : 'Unreachable: ' + (pingResult.error || '')
          ),
          h('div', { style: { flex: 1 } }),
          h('button', { className: 'btn btn-secondary btn-sm', onClick: restartNode }, 'Restart Agents'),
        )
      )
    )
  );
}

export function ClusterPage() {
  var app = useApp();
  var toast = app.toast;
  var [nodes, setNodes] = useState([]);
  var [stats, setStats] = useState(null);
  var [loading, setLoading] = useState(true);
  var [addingNode, setAddingNode] = useState(false);
  var [selectedNode, setSelectedNode] = useState(null);

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
            if (d.event === 'offline' && idx >= 0) { next[idx] = Object.assign({}, next[idx], { status: 'offline', agents: [] }); }
            else if (idx >= 0) { next[idx] = d; }
            else if (d.event === 'register' || d.event === 'snapshot') { next.push(d); }
            return next;
          });
          // Refresh stats
          engineCall('/cluster/nodes').then(function(dd) { setStats(dd.stats || null); }).catch(function() {});
        }
      } catch(e) {}
    };
    return function() { es.close(); };
  }, []);

  var removeNode = function(e, nodeId) {
    e.stopPropagation();
    if (!confirm('Remove worker node "' + nodeId + '"? This only removes it from the dashboard — agents on it will keep running but stop reporting.')) return;
    engineCall('/cluster/nodes/' + nodeId, { method: 'DELETE' }).then(function() {
      toast('Node removed', 'success');
      load();
    }).catch(function(e) { toast(e.message, 'error'); });
  };

  var statusColor = function(s) { return { online: 'success', degraded: 'warning', offline: 'neutral' }[s] || 'neutral'; };
  var statusDot = function(s) { return { online: 'var(--accent-green)', degraded: 'var(--accent-orange)', offline: 'var(--text-muted)' }[s] || 'var(--text-muted)'; };

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
    addingNode && h(AddNodeModal, { onClose: function() { setAddingNode(false); }, onAdded: load, toast: toast }),
    selectedNode && h(NodeDetailModal, { node: selectedNode, onClose: function() { setSelectedNode(null); }, onRefresh: load, toast: toast }),

    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } }, 'Cluster', h(KnowledgeLink, { page: 'cluster' }),
          h(HelpButton, { label: 'Cluster' },
            h('p', null, 'Manage worker nodes running agents across multiple machines. Scale horizontally by adding machines — each one runs agents that report back to this dashboard.'),
            h('p', { style: { marginTop: 8 } }, h('strong', null, '3 ways to add a worker:'),
              h('ul', { style: { paddingLeft: 16, marginTop: 4 } },
                h('li', null, h('strong', null, 'Manual'), ' — Register an existing machine by IP/hostname'),
                h('li', null, h('strong', null, 'SSH Deploy'), ' — Auto-install on a remote machine via SSH'),
                h('li', null, h('strong', null, 'Setup Script'), ' — Generate a script to run on the target machine')
              )
            )
          )
        ),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Scale your AI workforce across multiple machines')
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-secondary btn-sm', onClick: load }, I.refresh(), ' Refresh'),
        h('button', { className: 'btn btn-primary', onClick: function() { setAddingNode(true); } }, I.plus(), ' Add Worker Node')
      )
    ),

    // Stats cards
    stats && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 } },
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16, textAlign: 'center' } },
        h('div', { style: { fontSize: 28, fontWeight: 700 } }, stats.totalNodes),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Total Nodes')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16, textAlign: 'center' } },
        h('div', { style: { fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' } }, stats.onlineNodes),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Online')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16, textAlign: 'center' } },
        h('div', { style: { fontSize: 28, fontWeight: 700 } }, stats.totalAgents),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Running Agents')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16, textAlign: 'center' } },
        h('div', { style: { fontSize: 28, fontWeight: 700 } }, stats.totalCpus),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Total CPUs')
      )),
      h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 16, textAlign: 'center' } },
        h('div', { style: { fontSize: 28, fontWeight: 700 } }, formatBytes(stats.totalMemoryMb)),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Total Memory')
      ))
    ),

    // Nodes
    nodes.length === 0
      ? h('div', { className: 'card' }, h('div', { className: 'card-body', style: { padding: 40 } },
          h('div', { className: 'empty-state' },
            I.server(),
            h('h3', null, 'No worker nodes'),
            h('p', null, 'Your agents currently run on this machine. Add worker nodes to distribute agents across multiple machines for horizontal scaling.'),
            h('button', { className: 'btn btn-primary', style: { marginTop: 12 }, onClick: function() { setAddingNode(true); } }, I.plus(), ' Add Your First Worker Node')
          )
        ))
      : h('div', { style: { display: 'grid', gap: 12 } },
          nodes.map(function(node) {
            return h('div', { key: node.nodeId, className: 'card', style: { cursor: 'pointer', transition: 'border-color 0.2s' },
              onClick: function() { setSelectedNode(node); },
              onMouseEnter: function(e) { e.currentTarget.style.borderColor = 'var(--accent)'; },
              onMouseLeave: function(e) { e.currentTarget.style.borderColor = ''; }
            },
              h('div', { className: 'card-body', style: { padding: 16 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    // Status dot
                    h('span', { style: { width: 12, height: 12, borderRadius: '50%', background: statusDot(node.status), flexShrink: 0, boxShadow: node.status === 'online' ? '0 0 6px ' + statusDot(node.status) : 'none' } }),
                    h('div', null,
                      h('div', { style: { fontSize: 15, fontWeight: 700 } }, node.name || node.nodeId),
                      h('div', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' } }, node.host + ':' + node.port)
                    )
                  ),
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('span', { className: 'badge badge-' + statusColor(node.status), style: { textTransform: 'capitalize' } }, node.status),
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { removeNode(e, node.nodeId); }, title: 'Remove node' }, I.trash())
                  )
                ),
                // Metrics row
                h('div', { style: { display: 'flex', gap: 24, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' } },
                  h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Platform'),
                    h('div', { style: { fontWeight: 600, fontSize: 13 } }, node.platform + '/' + node.arch)
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'CPUs'),
                    h('div', { style: { fontWeight: 600, fontSize: 13 } }, node.cpuCount || '-')
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Memory'),
                    h('div', { style: { fontWeight: 600, fontSize: 13 } }, formatBytes(node.memoryMb))
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Agents'),
                    h('div', { style: { fontWeight: 600, fontSize: 13 } }, node.agents ? node.agents.length : 0)
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Version'),
                    h('div', { style: { fontWeight: 600, fontSize: 13 } }, 'v' + (node.version || '?'))
                  ),
                  h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Last Seen'),
                    h('div', { style: { fontWeight: 600, fontSize: 13, color: node.status === 'online' ? 'var(--accent-green)' : 'var(--text-muted)' } }, timeSince(node.lastHeartbeat))
                  )
                ),
                // Capabilities
                node.capabilities && node.capabilities.length > 0 && h('div', { style: { display: 'flex', gap: 4, marginTop: 8 } },
                  node.capabilities.map(function(c) { return h('span', { key: c, className: 'badge badge-neutral', style: { fontSize: 10 } }, c); })
                )
              )
            );
          })
        )
  );
}
