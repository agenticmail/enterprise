import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

// ═══════════════════════════════════════════════════════════
// Skill Connections & MCP Hub — Enterprise Integration Center
// ═══════════════════════════════════════════════════════════

// Category display metadata
var CATEGORY_META = {
  'crm': { label: 'CRM & Sales', icon: 'users' },
  'communication': { label: 'Communication', icon: 'messages' },
  'productivity': { label: 'Productivity', icon: 'dashboard' },
  'devops': { label: 'DevOps & CI/CD', icon: 'code' },
  'finance': { label: 'Finance & Billing', icon: 'activity' },
  'marketing': { label: 'Marketing', icon: 'globe' },
  'hr': { label: 'HR & People', icon: 'users' },
  'ecommerce': { label: 'E-Commerce', icon: 'upload' },
  'infrastructure': { label: 'Infrastructure', icon: 'settings' },
  'design': { label: 'Design & Media', icon: 'journal' },
  'security': { label: 'Security', icon: 'shield' },
  'monitoring': { label: 'Monitoring', icon: 'activity' },
  'social': { label: 'Social Media', icon: 'globe' },
  'data-ai': { label: 'Data & AI', icon: 'code' },
  'enterprise': { label: 'Enterprise', icon: 'settings' },
  'cms': { label: 'CMS', icon: 'journal' },
  'general': { label: 'General', icon: 'settings' },
};

var AUTH_TYPE_LABELS = {
  'oauth2': 'OAuth 2.0',
  'api_key': 'API Key',
  'token': 'Bearer Token',
  'credentials': 'Credentials',
};

// ── Section 1: MCP Servers ──────────────────────────────

function McpServersSection() {
  var app = useApp(); var toast = app.toast;
  var _servers = useState([]); var servers = _servers[0]; var setServers = _servers[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _showAdd = useState(false); var showAdd = _showAdd[0]; var setShowAdd = _showAdd[1];
  var _editServer = useState(null); var editServer = _editServer[0]; var setEditServer = _editServer[1];
  var _testing = useState(null); var testing = _testing[0]; var setTesting = _testing[1];
  var _agents = useState([]); var agents = _agents[0]; var setAgents = _agents[1];

  // Add/edit form
  var _form = useState({ name: '', type: 'stdio', command: '', args: '', url: '', apiKey: '', headers: '{}', env: '{}', enabled: true, description: '', autoRestart: true, timeout: 30, assignedAgents: [] });
  var form = _form[0]; var setForm = _form[1];

  var load = useCallback(function() {
    setLoading(true);
    engineCall('/mcp-servers')
      .then(function(d) { setServers(d.servers || []); })
      .catch(function() { setServers([]); })
      .finally(function() { setLoading(false); });
  }, []);

  useEffect(function() { load(); }, [load]);
  useEffect(function() {
    apiCall('/agents').then(function(d) { setAgents((d.agents || d || []).filter(function(a) { return a.status !== 'archived'; })); }).catch(function() {});
  }, []);

  var resetForm = function() {
    setForm({ name: '', type: 'stdio', command: '', args: '', url: '', apiKey: '', headers: '{}', env: '{}', enabled: true, description: '', autoRestart: true, timeout: 30, assignedAgents: [] });
  };

  var openAdd = function() { resetForm(); setEditServer(null); setShowAdd(true); };

  var openEdit = function(server) {
    setForm({
      name: server.name || '',
      type: server.type || 'stdio',
      command: server.command || '',
      args: (server.args || []).join(' '),
      url: server.url || '',
      apiKey: server.apiKey || '',
      headers: JSON.stringify(server.headers || {}, null, 2),
      env: JSON.stringify(server.env || {}, null, 2),
      enabled: server.enabled !== false,
      description: server.description || '',
      autoRestart: server.autoRestart !== false,
      timeout: server.timeout || 30,
      assignedAgents: server.assignedAgents || [],
    });
    setEditServer(server);
    setShowAdd(true);
  };

  var saveServer = function() {
    var payload = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      description: form.description.trim(),
      autoRestart: form.autoRestart,
      timeout: parseInt(form.timeout) || 30,
      assignedAgents: form.assignedAgents || [],
    };
    if (form.type === 'stdio') {
      payload.command = form.command.trim();
      payload.args = form.args.trim().split(/\s+/).filter(Boolean);
      try { payload.env = JSON.parse(form.env || '{}'); } catch { payload.env = {}; }
    } else {
      payload.url = form.url.trim();
      if (form.apiKey) payload.apiKey = form.apiKey;
      try { payload.headers = JSON.parse(form.headers || '{}'); } catch { payload.headers = {}; }
    }

    if (!payload.name) { toast('Server name is required', 'error'); return; }
    if (form.type === 'stdio' && !payload.command) { toast('Command is required for stdio servers', 'error'); return; }
    if (form.type !== 'stdio' && !payload.url) { toast('URL is required for HTTP/SSE servers', 'error'); return; }

    var method = editServer ? 'PUT' : 'POST';
    var url = editServer ? '/mcp-servers/' + editServer.id : '/mcp-servers';
    engineCall(url, { method: method, body: JSON.stringify(payload) })
      .then(function(d) {
        if (d.error) { toast(d.error, 'error'); return; }
        toast(editServer ? 'Server updated' : 'Server added', 'success');
        setShowAdd(false); load();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var _deleteTarget = useState(null); var deleteTarget = _deleteTarget[0]; var setDeleteTarget = _deleteTarget[1];
  var _deleteStep = useState(0); var deleteStep = _deleteStep[0]; var setDeleteStep = _deleteStep[1];
  var _deleteConfirmText = useState(''); var deleteConfirmText = _deleteConfirmText[0]; var setDeleteConfirmText = _deleteConfirmText[1];

  var startDelete = function(server) { setDeleteTarget(server); setDeleteStep(1); setDeleteConfirmText(''); };
  var cancelDelete = function() { setDeleteTarget(null); setDeleteStep(0); setDeleteConfirmText(''); };

  var executeDelete = function() {
    if (!deleteTarget) return;
    engineCall('/mcp-servers/' + deleteTarget.id, { method: 'DELETE' })
      .then(function() { toast('MCP server "' + deleteTarget.name + '" permanently deleted', 'success'); cancelDelete(); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var toggleServer = function(server) {
    engineCall('/mcp-servers/' + server.id, { method: 'PUT', body: JSON.stringify({ enabled: !server.enabled }) })
      .then(function() { toast(server.enabled ? 'Server disabled' : 'Server enabled', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var testServer = function(server) {
    setTesting(server.id);
    engineCall('/mcp-servers/' + server.id + '/test', { method: 'POST' })
      .then(function(d) {
        if (d.error) toast('Connection failed: ' + d.error, 'error');
        else toast('Connected! ' + (d.tools || 0) + ' tools discovered', 'success');
        load();
      })
      .catch(function(e) { toast(e.message, 'error'); })
      .finally(function() { setTesting(null); });
  };

  var typeLabel = function(t) {
    if (t === 'stdio') return 'Local Process (stdio)';
    if (t === 'sse') return 'Server-Sent Events (SSE)';
    return 'HTTP (Streamable)';
  };

  var statusDot = function(server) {
    var color = server.status === 'connected' ? 'var(--success)' : server.status === 'error' ? 'var(--danger)' : server.enabled ? 'var(--warning)' : 'var(--text-muted)';
    return h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 } });
  };

  return h('div', null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('h2', { style: { fontSize: 16, fontWeight: 700, margin: 0 } }, 'MCP Servers'),
        h(HelpButton, { label: 'MCP Servers' },
          h('p', null, 'Connect external Model Context Protocol (MCP) servers to give your agents access to additional tools and capabilities.'),
          h('h4', { style: { marginTop: 12, marginBottom: 6, fontSize: 14 } }, 'Connection Types'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Local Process (stdio)'), ' — Runs a command on your server. The MCP server communicates via stdin/stdout. Best for locally installed tools.'),
            h('li', null, h('strong', null, 'SSE (Server-Sent Events)'), ' — Connects to a remote MCP server via HTTP with SSE for streaming. Best for remote/cloud MCP servers.'),
            h('li', null, h('strong', null, 'HTTP (Streamable)'), ' — Standard HTTP transport. Stateless request/response pattern.')
          ),
          h('h4', { style: { marginTop: 12, marginBottom: 6, fontSize: 14 } }, 'How it works'),
          h('p', null, 'When you add an MCP server, we automatically discover all available tools it provides. These tools become available to your agents alongside the built-in integrations.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13 } },
            h('strong', null, 'Examples: '),
            'npx @modelcontextprotocol/server-filesystem /path/to/dir, ',
            'npx @modelcontextprotocol/server-github, ',
            'docker run -i mcp/postgres, ',
            'Any MCP-compatible server'
          )
        )
      ),
      h('button', { className: 'btn btn-primary btn-sm', onClick: openAdd }, I.plus(), ' Add MCP Server')
    ),

    // Server list
    loading ? h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'Loading MCP servers...')
    : servers.length === 0 ? h('div', { style: { padding: 32, textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' } },
        h('div', { style: { marginBottom: 8 } }, I.terminal()),
        h('p', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, 'No MCP servers connected'),
        h('p', { style: { fontSize: 12 } }, 'Add an MCP server to extend your agents with external tools'),
        h('button', { className: 'btn btn-secondary btn-sm', style: { marginTop: 12 }, onClick: openAdd }, I.plus(), ' Add Your First Server')
      )
    : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        servers.map(function(server) {
          var isTesting = testing === server.id;
          return h('div', { key: server.id, style: {
            padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            opacity: server.enabled === false ? 0.6 : 1,
          } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              statusDot(server),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { style: { fontWeight: 600, fontSize: 14 } }, server.name),
                  h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, server.type === 'stdio' ? 'stdio' : server.type === 'sse' ? 'SSE' : 'HTTP'),
                  server.toolCount > 0 && h('span', { className: 'badge', style: { fontSize: 10, background: 'var(--accent-soft)', color: 'var(--accent)' } }, server.toolCount + ' tools'),
                  !server.enabled && h('span', { className: 'badge', style: { fontSize: 10, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }, 'Disabled')
                ),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  server.type === 'stdio'
                    ? (server.command + ' ' + (server.args || []).join(' ')).trim()
                    : server.url || ''
                ),
                server.description && h('div', { style: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 } }, server.description),
                server.assignedAgents && server.assignedAgents.length > 0 && h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 3 } },
                  'Agents: ' + server.assignedAgents.map(function(aid) {
                    var a = agents.find(function(x) { return x.id === aid; });
                    return a ? (a.display_name || a.name) : aid.slice(0, 8);
                  }).join(', ')
                )
              ),
              h('div', { style: { display: 'flex', gap: 4, flexShrink: 0 } },
                h('button', { className: 'btn btn-ghost btn-sm', title: 'Test connection', disabled: isTesting, onClick: function() { testServer(server); } },
                  isTesting ? '...' : I.refresh()),
                h('button', { className: 'btn btn-ghost btn-sm', title: server.enabled ? 'Disable' : 'Enable', onClick: function() { toggleServer(server); } },
                  server.enabled ? I.pause() : I.play()),
                h('button', { className: 'btn btn-ghost btn-sm', title: 'Edit', onClick: function() { openEdit(server); } }, I.settings()),
                h('button', { className: 'btn btn-ghost btn-sm', title: 'Remove', style: { color: 'var(--danger)' }, onClick: function() { startDelete(server); } }, I.x())
              )
            ),
            // Show tools if expanded (server has discovered tools)
            server.tools && server.tools.length > 0 && h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 4 } },
              server.tools.slice(0, 20).map(function(tool) {
                return h('span', { key: tool.name, style: {
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                } }, tool.name);
              }),
              server.tools.length > 20 && h('span', { style: { fontSize: 10, color: 'var(--text-muted)', padding: '2px 4px' } }, '+' + (server.tools.length - 20) + ' more')
            )
          );
        })
      ),

    // Add/Edit modal
    showAdd && h(Modal, {
      title: editServer ? 'Edit MCP Server' : 'Add MCP Server',
      onClose: function() { setShowAdd(false); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowAdd(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: saveServer }, editServer ? 'Save Changes' : 'Add Server')
      )
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        // Name
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Server Name *', h(HelpButton, { label: 'Server Name' },
            h('p', null, 'A friendly name so you can identify this server in the list. Use something descriptive like "GitHub Tools" or "Company Database".'),
            h('p', null, 'This name is only for your reference — it doesn\'t affect how the server works.')
          )),
          h('input', { className: 'input', placeholder: 'e.g., GitHub MCP, Filesystem, Database', value: form.name,
            onChange: function(e) { setForm(Object.assign({}, form, { name: e.target.value })); } })
        ),
        // Description
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Description'),
          h('input', { className: 'input', placeholder: 'What does this server provide?', value: form.description,
            onChange: function(e) { setForm(Object.assign({}, form, { description: e.target.value })); } })
        ),
        // Type selector
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Connection Type *', h(HelpButton, { label: 'Connection Type' },
            h('p', null, 'How your agents communicate with this MCP server. If you\'re not sure, choose ', h('strong', null, 'Local Process'), ' — it\'s the most common and works out of the box.'),
            h('ul', { style: { paddingLeft: 20, margin: '8px 0' } },
              h('li', null, h('strong', null, 'Local Process'), ' — The server runs as a program on the same machine. Best for most use cases. Just provide the command to start it (like "npx" or "docker").'),
              h('li', null, h('strong', null, 'SSE'), ' — Connects to an MCP server hosted elsewhere (another machine or cloud). Uses a live streaming connection.'),
              h('li', null, h('strong', null, 'HTTP'), ' — Connects to a remote MCP server using simple web requests. Used by some cloud-hosted MCP services.')
            ),
            h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 } },
              h('strong', null, 'Not sure? '), 'Use a Quick Start Template below — it pre-fills everything for you.')
          )),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 } },
            ['stdio', 'sse', 'http'].map(function(t) {
              var selected = form.type === t;
              return h('div', {
                key: t,
                onClick: function() { setForm(Object.assign({}, form, { type: t })); },
                style: {
                  padding: '10px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center',
                  border: '2px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
                  background: selected ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                }
              },
                h('div', { style: { fontWeight: 600, fontSize: 12 } }, t === 'stdio' ? 'Local Process' : t === 'sse' ? 'SSE' : 'HTTP'),
                h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } },
                  t === 'stdio' ? 'Runs on this machine' : t === 'sse' ? 'Remote with live stream' : 'Remote web requests')
              );
            })
          )
        ),
        // stdio fields
        form.type === 'stdio' && h(Fragment, null,
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Command *', h(HelpButton, { label: 'Command' },
              h('p', null, 'The program to run on your server. This is like typing a command in the terminal. Common examples:'),
              h('ul', { style: { paddingLeft: 20, margin: '8px 0' } },
                h('li', null, h('strong', null, 'npx'), ' — Runs Node.js packages without installing them first. Most MCP servers use this.'),
                h('li', null, h('strong', null, 'node'), ' — Runs a JavaScript file directly.'),
                h('li', null, h('strong', null, 'python'), ' or ', h('strong', null, 'python3'), ' — Runs Python-based MCP servers.'),
                h('li', null, h('strong', null, 'docker'), ' — Runs the server inside a Docker container (advanced).')
              ),
              h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 } },
                h('strong', null, 'Tip: '), 'If you chose a Quick Start Template, this is already filled in. Most templates use "npx" which requires Node.js to be installed on your machine.')
            )),
            h('input', { className: 'input', placeholder: 'npx, node, python, docker...', value: form.command,
              onChange: function(e) { setForm(Object.assign({}, form, { command: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'The program to start the MCP server. Must be installed on this machine.')
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Arguments', h(HelpButton, { label: 'Arguments' },
              h('p', null, 'Extra instructions passed to the command. Think of it like telling the program what to do. For example:'),
              h('ul', { style: { paddingLeft: 20, margin: '8px 0' } },
                h('li', null, h('strong', null, '-y @modelcontextprotocol/server-filesystem /home'), ' — Tells npx to run the filesystem MCP server and give it access to /home'),
                h('li', null, h('strong', null, '-y @modelcontextprotocol/server-github'), ' — Tells npx to run the GitHub MCP server')
              ),
              h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 } },
                h('strong', null, 'Tip: '), 'The "-y" flag tells npx to automatically install the package if needed, without asking. Always include it for npx commands.')
            )),
            h('input', { className: 'input', placeholder: '-y @modelcontextprotocol/server-filesystem /home/user/docs', value: form.args,
              onChange: function(e) { setForm(Object.assign({}, form, { args: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Additional options passed to the command. Separate multiple values with spaces.')
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Environment Variables', h(HelpButton, { label: 'Environment Variables' },
              h('p', null, 'Some MCP servers need passwords, API keys, or settings to work. Environment variables are a secure way to pass this information.'),
              h('p', { style: { marginTop: 8 } }, 'Format: a JSON object where each key is the variable name and each value is the secret. For example:'),
              h('pre', { style: { background: 'var(--bg-secondary)', padding: 10, borderRadius: 8, fontSize: 12, marginTop: 8 } },
                '{\n  "GITHUB_TOKEN": "ghp_abc123...",\n  "DATABASE_URL": "postgres://user:pass@host/db"\n}'
              ),
              h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 } },
                h('strong', null, 'Security: '), 'All values are encrypted before being stored. They\'re only decrypted when the server starts.')
            )),
            h('textarea', { className: 'input', rows: 3, placeholder: '{\n  "GITHUB_TOKEN": "ghp_...",\n  "DATABASE_URL": "postgres://..."\n}', value: form.env,
              style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 },
              onChange: function(e) { setForm(Object.assign({}, form, { env: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'API keys, tokens, and passwords needed by this server. Stored encrypted.')
          )
        ),
        // HTTP/SSE fields
        form.type !== 'stdio' && h(Fragment, null,
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Server URL *', h(HelpButton, { label: 'Server URL' },
              h('p', null, 'The web address of the remote MCP server. This is provided by whoever hosts the server.'),
              h('p', { style: { marginTop: 8 } }, 'It usually looks like:'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0' } },
                h('li', null, h('strong', null, 'SSE: '), 'https://mcp.example.com/sse'),
                h('li', null, h('strong', null, 'HTTP: '), 'https://mcp.example.com/mcp')
              ),
              h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 } },
                h('strong', null, 'Tip: '), 'Check the MCP server\'s documentation for the exact URL to use. If it\'s hosted on your local network, use the internal IP (e.g., http://192.168.1.100:3000/mcp).')
            )),
            h('input', { className: 'input', placeholder: form.type === 'sse' ? 'https://mcp.example.com/sse' : 'https://mcp.example.com/mcp', value: form.url,
              onChange: function(e) { setForm(Object.assign({}, form, { url: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'The web address where the MCP server is running.')
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'API Key / Bearer Token', h(HelpButton, { label: 'API Key' },
              h('p', null, 'If the remote server requires authentication, paste the API key or token here. This is like a password that proves you\'re allowed to use the server.'),
              h('p', { style: { marginTop: 8 } }, 'You usually get this from the MCP server provider\'s dashboard or settings page. If the server is open/public, leave this empty.')
            )),
            h('input', { className: 'input', type: 'password', placeholder: 'Optional — only if the server requires authentication', value: form.apiKey,
              onChange: function(e) { setForm(Object.assign({}, form, { apiKey: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Only needed if the server requires authentication. Leave empty for open servers.')
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Custom Headers', h(HelpButton, { label: 'Custom Headers' },
              h('p', null, 'Advanced setting. Some servers need extra information sent with every request (like an organization ID or custom authentication format).'),
              h('p', { style: { marginTop: 8 } }, 'Most users can leave this empty. If you need it, your MCP server provider will tell you what to put here.'),
              h('div', { style: { marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 } },
                h('strong', null, 'Tip: '), 'This is rarely needed. If you\'re not sure, skip it.')
            )),
            h('textarea', { className: 'input', rows: 2, placeholder: '{\n  "X-Custom-Header": "value"\n}', value: form.headers,
              style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 },
              onChange: function(e) { setForm(Object.assign({}, form, { headers: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Advanced. Usually not needed — leave empty unless told otherwise.')
          )
        ),
        // Common settings
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Connection Timeout', h(HelpButton, { label: 'Timeout' },
              h('p', null, 'How long to wait (in seconds) for the server to respond before giving up. The default of 30 seconds works for most servers.'),
              h('p', { style: { marginTop: 8 } }, 'Increase this if the server is slow to start (e.g., Docker containers) or on a slow network.')
            )),
            h('input', { className: 'input', type: 'number', min: 5, max: 300, value: form.timeout,
              onChange: function(e) { setForm(Object.assign({}, form, { timeout: e.target.value })); } }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Seconds to wait. 30 is usually fine.')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 24 } },
              h('input', { type: 'checkbox', checked: form.autoRestart,
                onChange: function(e) { setForm(Object.assign({}, form, { autoRestart: e.target.checked })); } }),
              'Auto-restart on failure',
              h(HelpButton, { label: 'Auto-restart' },
                h('p', null, 'If the MCP server crashes or stops unexpectedly, we\'ll automatically restart it so your agents don\'t lose access to its tools.'),
                h('p', { style: { marginTop: 8 } }, 'Keep this on unless you have a reason to disable it.')
              )
            )
          ),
          // Agent assignment
          agents.length > 0 && h('div', { className: 'form-group', style: { marginTop: 16 } },
            h('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, 'Agent Access', h(HelpButton, { label: 'Agent Access' },
              h('p', null, 'Choose which agents can use this MCP server\'s tools. You must select at least one agent — no agent has access until explicitly granted.'),
              h('p', { style: { marginTop: 8 } }, 'This ensures sensitive tools (like database access) are never accidentally exposed to the wrong agent.')
            )),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              agents.map(function(a) {
                var isSelected = (form.assignedAgents || []).includes(a.id);
                return h('button', {
                  key: a.id,
                  type: 'button',
                  style: {
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    border: '1px solid ' + (isSelected ? 'var(--primary)' : 'var(--border)'),
                    background: isSelected ? 'var(--primary)' : 'var(--bg-secondary)',
                    color: isSelected ? '#fff' : 'var(--text-primary)',
                  },
                  onClick: function() {
                    var current = form.assignedAgents || [];
                    var next = isSelected ? current.filter(function(x) { return x !== a.id; }) : current.concat(a.id);
                    setForm(Object.assign({}, form, { assignedAgents: next }));
                  }
                }, a.display_name || a.name);
              })
            ),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
              form.assignedAgents && form.assignedAgents.length > 0
                ? form.assignedAgents.length + ' agent(s) selected'
                : 'No agents selected — no agent can use this server yet'
            )
          )
        ),
        // Preset templates
        !editServer && h('div', { style: { paddingTop: 12, borderTop: '1px solid var(--border)' } },
          h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 } }, 'Quick Start Templates'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            [
              { label: 'Filesystem', name: 'Filesystem', cmd: 'npx', args: '-y @modelcontextprotocol/server-filesystem /home' },
              { label: 'GitHub', name: 'GitHub', cmd: 'npx', args: '-y @modelcontextprotocol/server-github', envs: '{"GITHUB_PERSONAL_ACCESS_TOKEN": ""}' },
              { label: 'PostgreSQL', name: 'PostgreSQL', cmd: 'npx', args: '-y @modelcontextprotocol/server-postgres', envs: '{"DATABASE_URL": ""}' },
              { label: 'Brave Search', name: 'Brave Search', cmd: 'npx', args: '-y @modelcontextprotocol/server-brave-search', envs: '{"BRAVE_API_KEY": ""}' },
              { label: 'Puppeteer', name: 'Puppeteer', cmd: 'npx', args: '-y @modelcontextprotocol/server-puppeteer' },
              { label: 'Slack', name: 'Slack', cmd: 'npx', args: '-y @modelcontextprotocol/server-slack', envs: '{"SLACK_BOT_TOKEN": "", "SLACK_TEAM_ID": ""}' },
              { label: 'Google Drive', name: 'Google Drive', cmd: 'npx', args: '-y @modelcontextprotocol/server-gdrive' },
              { label: 'Memory', name: 'Memory', cmd: 'npx', args: '-y @modelcontextprotocol/server-memory' },
              { label: 'Sentry', name: 'Sentry', cmd: 'npx', args: '-y @modelcontextprotocol/server-sentry', envs: '{"SENTRY_AUTH_TOKEN": ""}' },
              { label: 'Fetch', name: 'Fetch', cmd: 'npx', args: '-y @modelcontextprotocol/server-fetch' },
            ].map(function(tpl) {
              return h('button', {
                key: tpl.label,
                className: 'btn btn-ghost btn-sm',
                style: { fontSize: 11, padding: '4px 8px' },
                onClick: function() { setForm(Object.assign({}, form, { name: tpl.name, type: 'stdio', command: tpl.cmd, args: tpl.args, env: tpl.envs || '{}' })); }
              }, tpl.label);
            })
          )
        )
      )
    ),

    // ─── 3-Step Delete Confirmation Modal ───
    deleteTarget && h('div', { className: 'modal-overlay', onClick: cancelDelete },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 480, maxHeight: '80vh', overflow: 'auto' } },
        h('div', { className: 'modal-header' },
          h('h2', { style: { fontSize: 16, color: 'var(--danger)' } },
            deleteStep === 1 ? 'Delete MCP Server' : deleteStep === 2 ? 'Agent Impact Warning' : 'Final Confirmation'
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: cancelDelete }, '\u00D7')
        ),
        h('div', { className: 'modal-body', style: { padding: 20 } },
          // Step indicator
          h('div', { style: { display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' } },
            [1, 2, 3].map(function(s) {
              return h('div', { key: s, style: {
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: s === deleteStep ? 'var(--danger)' : s < deleteStep ? 'var(--success)' : 'var(--bg-tertiary)',
                color: s <= deleteStep ? '#fff' : 'var(--text-muted)',
                border: '2px solid ' + (s === deleteStep ? 'var(--danger)' : s < deleteStep ? 'var(--success)' : 'var(--border)')
              } }, s < deleteStep ? '\u2713' : s);
            })
          ),

          // Step 1: What you're deleting
          deleteStep === 1 && h(Fragment, null,
            h('div', { style: { padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', marginBottom: 16 } },
              h('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8 } }, deleteTarget.name),
              h('div', { style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 } },
                deleteTarget.type === 'stdio'
                  ? 'Command: ' + (deleteTarget.command || '') + ' ' + ((deleteTarget.args || []).join(' '))
                  : 'URL: ' + (deleteTarget.url || '')
              ),
              deleteTarget.toolCount > 0 && h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                deleteTarget.toolCount + ' tool(s) will be permanently removed'
              ),
              deleteTarget.tools && deleteTarget.tools.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 } },
                deleteTarget.tools.slice(0, 15).map(function(t) {
                  return h('span', { key: t.name, style: { padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' } }, t.name);
                }),
                deleteTarget.tools.length > 15 && h('span', { style: { fontSize: 10, color: 'var(--text-muted)', padding: '2px 4px' } }, '+' + (deleteTarget.tools.length - 15) + ' more')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 } },
              'This will permanently delete the MCP server configuration and disconnect it from all agents. The server process will be terminated immediately.'
            ),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 } },
              h('button', { className: 'btn btn-ghost', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: function() { setDeleteStep(2); } }, 'Continue')
            )
          ),

          // Step 2: Agent impact
          deleteStep === 2 && h(Fragment, null,
            h('div', { style: { padding: 16, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius)', marginBottom: 16 } },
              h('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#f59e0b' } }, 'Agent Impact'),
              h('ul', { style: { margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 } },
                h('li', null, 'Agents currently using these tools will get errors on their next call'),
                h('li', null, 'Agents may have stored tool names in their memory from previous sessions'),
                h('li', null, 'Running tasks that depend on these tools may fail'),
                h('li', null, h('strong', null, 'Any in-progress work using these tools cannot be recovered'))
              )
            ),
            deleteTarget.assignedAgents && deleteTarget.assignedAgents.length > 0 && h('div', { style: { padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12 } },
              h('div', { style: { fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' } }, 'Affected Agents:'),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                deleteTarget.assignedAgents.map(function(aid) {
                  var a = agents.find(function(x) { return x.id === aid; });
                  return h('span', { key: aid, style: { padding: '3px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.15)' } }, a ? (a.display_name || a.name) : aid.slice(0, 8));
                })
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 } },
              'After deletion, affected agents will be notified that these tools are no longer available. They will not attempt to use them in future sessions.'
            ),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 } },
              h('button', { className: 'btn btn-ghost', onClick: function() { setDeleteStep(1); } }, 'Back'),
              h('button', { className: 'btn btn-danger', onClick: function() { setDeleteStep(3); } }, 'I Understand')
            )
          ),

          // Step 3: Type name to confirm
          deleteStep === 3 && h(Fragment, null,
            h('div', { style: { padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', marginBottom: 16, textAlign: 'center' } },
              h('div', { style: { fontSize: 32, marginBottom: 8 } }, '\u26A0\uFE0F'),
              h('div', { style: { fontWeight: 700, fontSize: 14, color: 'var(--danger)' } }, 'This action is irreversible'),
              h('div', { style: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 } },
                'Type "' + deleteTarget.name + '" to confirm deletion'
              )
            ),
            h('input', {
              className: 'input',
              placeholder: 'Type server name to confirm...',
              value: deleteConfirmText,
              onChange: function(e) { setDeleteConfirmText(e.target.value); },
              style: { marginBottom: 16, borderColor: deleteConfirmText === deleteTarget.name ? 'var(--danger)' : 'var(--border)' }
            }),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-ghost', onClick: function() { setDeleteStep(2); } }, 'Back'),
              h('button', {
                className: 'btn btn-danger',
                disabled: deleteConfirmText !== deleteTarget.name,
                onClick: executeDelete,
                style: { opacity: deleteConfirmText === deleteTarget.name ? 1 : 0.4 }
              }, 'Delete Permanently')
            )
          )
        )
      )
    )
  );
}

// ── Section 2: Built-in Integrations ─────────────────────

function IntegrationsSection() {
  var app = useApp(); var toast = app.toast;
  var _catalog = useState([]); var catalog = _catalog[0]; var setCatalog = _catalog[1];
  var _categories = useState({}); var categories = _categories[0]; var setCategories = _categories[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _search = useState(''); var search = _search[0]; var setSearch = _search[1];
  var _catFilter = useState('all'); var catFilter = _catFilter[0]; var setCatFilter = _catFilter[1];
  var _configModal = useState(null); var configModal = _configModal[0]; var setConfigModal = _configModal[1];
  var _configValues = useState({}); var configValues = _configValues[0]; var setConfigValues = _configValues[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _showAll = useState(false); var showAll = _showAll[0]; var setShowAll = _showAll[1];

  var load = useCallback(function() {
    setLoading(true);
    engineCall('/integrations/catalog')
      .then(function(d) { setCatalog(d.catalog || []); setCategories(d.categories || {}); })
      .catch(function() {})
      .finally(function() { setLoading(false); });
  }, []);

  useEffect(function() { load(); }, [load]);

  // Filtering
  var filtered = catalog.filter(function(item) {
    if (catFilter !== 'all' && item.category !== catFilter) return false;
    if (search) {
      var q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.skillId.toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  var connectedCount = catalog.filter(function(i) { return i.connected; }).length;
  var cats = {};
  catalog.forEach(function(i) { cats[i.category] = (cats[i.category] || 0) + 1; });

  // Save credentials
  var saveCredentials = function() {
    if (!configModal) return;
    setSaving(true);
    engineCall('/integrations/' + configModal.skillId + '/credentials', {
      method: 'PUT',
      body: JSON.stringify(configValues)
    })
      .then(function(d) {
        if (d.error) { toast(d.error, 'error'); }
        else { toast(configModal.name + ' connected!', 'success'); setConfigModal(null); load(); }
      })
      .catch(function(e) { toast(e.message, 'error'); })
      .finally(function() { setSaving(false); });
  };

  var disconnectIntegration = function(skillId) {
    engineCall('/integrations/' + skillId + '/credentials', { method: 'DELETE' })
      .then(function() { toast('Disconnected', 'success'); load(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var openConnect = function(item) {
    if (item.authType === 'oauth2') {
      // Start OAuth flow
      engineCall('/oauth/authorize/' + item.skillId)
        .then(function(d) {
          if (d.authUrl) {
            var w = 600, ht = 700;
            window.open(d.authUrl, 'oauth_popup', 'width=' + w + ',height=' + ht + ',left=' + (screen.width - w) / 2 + ',top=' + (screen.height - ht) / 2);
          }
        })
        .catch(function(e) { toast(e.message, 'error'); });
    } else {
      // Open credentials modal
      var vals = {};
      if (item.fields) item.fields.forEach(function(f) { vals[f] = ''; });
      else vals.token = '';
      setConfigValues(vals);
      setConfigModal(item);
    }
  };

  var displayItems = showAll ? filtered : filtered.slice(0, 24);

  if (loading) return h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'Loading integrations...');

  return h('div', null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('h2', { style: { fontSize: 16, fontWeight: 700, margin: 0 } }, 'Built-in Integrations'),
        h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, catalog.length),
        h('span', { className: 'badge', style: { fontSize: 10, background: 'var(--success)', color: '#fff' } }, connectedCount + ' connected'),
        h(HelpButton, { label: 'Built-in Integrations' },
          h('p', null, 'AgenticMail includes ' + catalog.length + ' pre-built integrations powered by MCP adapters. Each integration provides tools that agents can use to interact with external services.'),
          h('h4', { style: { marginTop: 12, marginBottom: 6, fontSize: 14 } }, 'Authentication Types'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'OAuth 2.0'), ' — Click "Connect" to authorize via the service\'s login page. Tokens auto-refresh.'),
            h('li', null, h('strong', null, 'API Key'), ' — Paste a key from the service\'s developer settings.'),
            h('li', null, h('strong', null, 'Credentials'), ' — Multiple fields (key + domain, key + project ID, etc.).')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13 } },
            h('strong', null, 'Security: '), 'All credentials are encrypted in the vault. OAuth tokens auto-refresh before expiry.')
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('input', { className: 'input', placeholder: 'Search integrations...', value: search,
          style: { width: 220, fontSize: 12 },
          onChange: function(e) { setSearch(e.target.value); } }),
        h('select', { className: 'input', value: catFilter, style: { width: 160, fontSize: 12 },
          onChange: function(e) { setCatFilter(e.target.value); } },
          h('option', { value: 'all' }, 'All categories (' + catalog.length + ')'),
          Object.keys(cats).sort().map(function(cat) {
            var meta = CATEGORY_META[cat] || { label: cat };
            return h('option', { key: cat, value: cat }, meta.label + ' (' + cats[cat] + ')');
          })
        )
      )
    ),

    // Grid
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 } },
      displayItems.map(function(item) {
        var meta = CATEGORY_META[item.category] || {};
        return h('div', { key: item.skillId, style: {
          padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid ' + (item.connected ? 'rgba(21,128,61,0.3)' : 'var(--border)'),
          borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 10,
        } },
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', { style: { fontWeight: 600, fontSize: 13 } }, item.name),
              item.connected && h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 } })
            ),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 } },
              h('span', null, (meta.label || item.category)),
              h('span', null, '\u00B7'),
              h('span', null, AUTH_TYPE_LABELS[item.authType] || item.authType),
              h('span', null, '\u00B7'),
              h('span', null, item.toolCount + ' tools')
            )
          ),
          item.connected
            ? h('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 11, color: 'var(--danger)', flexShrink: 0 },
                onClick: function() { disconnectIntegration(item.skillId); } }, 'Disconnect')
            : h('button', { className: 'btn btn-primary btn-sm', style: { fontSize: 11, flexShrink: 0 },
                onClick: function() { openConnect(item); } }, 'Connect')
        );
      })
    ),

    // Show more
    filtered.length > 24 && !showAll && h('div', { style: { textAlign: 'center', marginTop: 12 } },
      h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setShowAll(true); } },
        'Show all ' + filtered.length + ' integrations')
    ),

    // Credentials modal
    configModal && h(Modal, {
      title: 'Connect ' + configModal.name,
      onClose: function() { setConfigModal(null); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setConfigModal(null); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', disabled: saving, onClick: saveCredentials }, saving ? 'Saving...' : 'Connect')
      )
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)' } },
          'Enter the credentials for ', h('strong', null, configModal.name), '. All values are encrypted in the vault.'
        ),
        configModal.fields ? configModal.fields.map(function(field) {
          var label = (configModal.fieldLabels || {})[field] || field;
          var isSecret = /key|token|secret|password/i.test(field);
          return h('div', { className: 'form-group', key: field },
            h('label', { className: 'form-label' }, label),
            h('input', {
              className: 'input',
              type: isSecret ? 'password' : 'text',
              value: configValues[field] || '',
              placeholder: label,
              onChange: function(e) {
                setConfigValues(function(prev) { var u = Object.assign({}, prev); u[field] = e.target.value; return u; });
              }
            })
          );
        })
        : h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, configModal.authType === 'api_key' ? 'API Key' : 'Access Token'),
            h('input', {
              className: 'input', type: 'password',
              value: configValues.token || '',
              placeholder: 'Paste your ' + (configModal.authType === 'api_key' ? 'API key' : 'access token'),
              onChange: function(e) { setConfigValues({ token: e.target.value }); }
            })
          )
      )
    )
  );
}

// ── Section 3: Community Skills ──────────────────────────

function CommunitySkillsSection() {
  var app = useApp(); var toast = app.toast;
  var _installed = useState([]); var installed = _installed[0]; var setInstalled = _installed[1];
  var _statuses = useState({}); var statuses = _statuses[0]; var setStatuses = _statuses[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _configSkill = useState(null); var configSkill = _configSkill[0]; var setConfigSkill = _configSkill[1];
  var _configSchema = useState(null); var configSchema = _configSchema[0]; var setConfigSchema = _configSchema[1];
  var _configValues = useState({}); var configValues = _configValues[0]; var setConfigValues = _configValues[1];
  var _configSaving = useState(false); var configSaving = _configSaving[0]; var setConfigSaving = _configSaving[1];

  var load = useCallback(function() {
    setLoading(true);
    engineCall('/community/installed')
      .then(function(d) {
        var skills = d.installed || [];
        setInstalled(skills);
        // Load statuses
        var promises = skills.map(function(skill) {
          return engineCall('/oauth/status/' + skill.skillId)
            .then(function(d) { return { skillId: skill.skillId, status: d }; })
            .catch(function() { return { skillId: skill.skillId, status: { connected: false } }; });
        });
        Promise.all(promises).then(function(results) {
          var map = {};
          results.forEach(function(r) { map[r.skillId] = r.status; });
          setStatuses(map);
        });
      })
      .catch(function() {})
      .finally(function() { setLoading(false); });
  }, []);

  useEffect(function() { load(); }, [load]);

  var openConfig = function(skill) {
    setConfigSkill(skill);
    setConfigValues(skill.config || {});
    engineCall('/community/skills/' + skill.skillId + '/config-schema')
      .then(function(d) { setConfigSchema(d.configSchema || {}); })
      .catch(function() { setConfigSchema({}); });
  };

  var saveConfig = function() {
    if (!configSkill) return;
    setConfigSaving(true);
    engineCall('/community/skills/' + configSkill.skillId + '/config', { method: 'PUT', body: JSON.stringify(configValues) })
      .then(function() { toast('Saved', 'success'); setConfigSkill(null); load(); })
      .catch(function(e) { toast(e.message, 'error'); })
      .finally(function() { setConfigSaving(false); });
  };

  if (loading) return h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'Loading community skills...');

  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('h2', { style: { fontSize: 16, fontWeight: 700, margin: 0 } }, 'Community Skills'),
        h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, installed.length),
        h(HelpButton, { label: 'Community Skills' },
          h('p', null, 'Skills installed from the Community Marketplace. These are custom skill packages that add specialized capabilities to your agents.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13 } },
            h('strong', null, 'Tip: '), 'Install more skills from the Community Skills page in the sidebar.')
        )
      ),
      h('button', { className: 'btn btn-secondary btn-sm', onClick: load }, I.refresh())
    ),

    installed.length === 0
      ? h('div', { style: { padding: 32, textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' } },
          h('p', { style: { fontSize: 13 } }, 'No community skills installed. Visit the marketplace to add some.')
        )
      : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 } },
          installed.map(function(skill) {
            var status = statuses[skill.skillId] || {};
            var meta = skill.skill || skill.manifest || skill;
            return h('div', { key: skill.skillId, style: {
              padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', gap: 10,
            } },
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontWeight: 600, fontSize: 13 } }, meta.name || skill.skillId),
                meta.description && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, meta.description)
              ),
              h('div', { style: { display: 'flex', gap: 4, flexShrink: 0 } },
                status.connected
                  ? h('span', { className: 'badge', style: { background: 'var(--success)', color: '#fff', fontSize: 10 } }, 'Connected')
                  : h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, 'Not connected'),
                h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { openConfig(skill); } }, I.settings())
              )
            );
          })
        ),

    // Config modal
    configSkill && h(Modal, {
      title: 'Configure ' + (configSkill.skill?.name || configSkill.skillId),
      onClose: function() { setConfigSkill(null); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setConfigSkill(null); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', disabled: configSaving, onClick: saveConfig }, configSaving ? 'Saving...' : 'Save')
      )
    },
      configSchema && Object.keys(configSchema).length > 0
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            Object.entries(configSchema).map(function(entry) {
              var fieldName = entry[0]; var schema = entry[1];
              var isSecret = schema.type === 'secret' || /key|token|secret/i.test(fieldName);
              return h('div', { className: 'form-group', key: fieldName },
                h('label', { className: 'form-label' }, schema.label || fieldName),
                h('input', {
                  className: 'input',
                  type: isSecret ? 'password' : 'text',
                  value: configValues[fieldName] || '',
                  placeholder: schema.placeholder || schema.default || '',
                  onChange: function(e) { setConfigValues(function(p) { var u = Object.assign({}, p); u[fieldName] = e.target.value; return u; }); }
                }),
                schema.description && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, schema.description)
              );
            })
          )
        : h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)' } }, 'No configuration options available.')
    )
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export function SkillConnectionsPage() {
  var _tab = useState('mcp'); var tab = _tab[0]; var setTab = _tab[1];

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13 };

  return h(Fragment, null,
    // Page Header
    h('div', { style: { marginBottom: 20 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } },
        'Integrations & MCP Hub',
        h(HelpButton, { label: 'Integrations & MCP Hub' },
          h('p', null, 'The central hub for connecting your AI agents to external tools, services, and MCP servers. Everything your agents need to interact with the outside world is managed here.'),
          h('h4', { style: _h4 }, 'Three connection types'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'MCP Servers'), ' — Connect external Model Context Protocol servers (like Claude Code\'s MCP system). Agents get access to all tools the server provides.'),
            h('li', null, h('strong', null, 'Built-in Integrations'), ' — 145+ pre-built adapters for popular services (Slack, GitHub, Salesforce, etc.). Just add credentials.'),
            h('li', null, h('strong', null, 'Community Skills'), ' — Custom skill packages from the marketplace. Install and configure them here.')
          ),
          h('div', { style: _tip }, h('strong', null, 'MCP Protocol: '), 'MCP (Model Context Protocol) is an open standard by Anthropic for connecting AI models to external tools. Any MCP-compatible server works here — same format as Claude Code, Cursor, and other AI tools.')
        )
      ),
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 } },
        'Connect MCP servers, built-in integrations, and community skills to extend your agents')
    ),

    // Tab bar
    h('div', { className: 'tabs', style: { marginBottom: 20 } },
      h('div', { className: 'tab' + (tab === 'mcp' ? ' active' : ''), onClick: function() { setTab('mcp'); } }, I.terminal(), ' MCP Servers'),
      h('div', { className: 'tab' + (tab === 'integrations' ? ' active' : ''), onClick: function() { setTab('integrations'); } }, I.globe(), ' Built-in Integrations'),
      h('div', { className: 'tab' + (tab === 'community' ? ' active' : ''), onClick: function() { setTab('community'); } }, I.users(), ' Community Skills')
    ),

    // Tab content
    tab === 'mcp' && h(McpServersSection),
    tab === 'integrations' && h(IntegrationsSection),
    tab === 'community' && h(CommunitySkillsSection)
  );
}
