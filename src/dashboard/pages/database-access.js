import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

var DATABASE_TYPES = [
  { section: 'Relational (SQL)', items: [
    { value: 'postgresql', label: 'PostgreSQL', icon: '🐘' },
    { value: 'mysql', label: 'MySQL', icon: '🐬' },
    { value: 'mariadb', label: 'MariaDB', icon: '🦭' },
    { value: 'mssql', label: 'Microsoft SQL Server', icon: '🪟' },
    { value: 'oracle', label: 'Oracle', icon: '🔴' },
    { value: 'sqlite', label: 'SQLite', icon: '📦' },
  ]},
  { section: 'Cloud-Native SQL', items: [
    { value: 'supabase', label: 'Supabase', icon: '⚡' },
    { value: 'neon', label: 'Neon', icon: '🌀' },
    { value: 'planetscale', label: 'PlanetScale', icon: '🪐' },
    { value: 'cockroachdb', label: 'CockroachDB', icon: '🪳' },
    { value: 'turso', label: 'Turso / LibSQL', icon: '🐢' },
  ]},
  { section: 'NoSQL / Key-Value', items: [
    { value: 'mongodb', label: 'MongoDB', icon: '🍃' },
    { value: 'redis', label: 'Redis', icon: '🔴' },
    { value: 'dynamodb', label: 'AWS DynamoDB', icon: '☁️' },
  ]},
];

var ALL_DB_TYPES = DATABASE_TYPES.flatMap(function(s) { return s.items; });

var PERMISSIONS = [
  { value: 'read', label: 'Read', desc: 'SELECT queries', color: 'var(--success)' },
  { value: 'write', label: 'Write', desc: 'INSERT / UPDATE', color: 'var(--warning)' },
  { value: 'delete', label: 'Delete', desc: 'DELETE rows', color: 'var(--danger)' },
  { value: 'schema', label: 'Schema', desc: 'DDL operations', color: 'var(--accent)' },
  { value: 'execute', label: 'Execute', desc: 'Stored procedures', color: 'var(--text-muted)' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

var s = {
  page: 'padding: 24px; max-width: 1200px; margin: 0 auto;',
  header: 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;',
  title: 'font-size: 24px; font-weight: 700; display: flex; align-items: center; gap: 10px;',
  tabs: 'display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border);',
  tab: 'padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-secondary); border-bottom: 2px solid transparent; transition: all 0.15s;',
  tabActive: 'padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--accent); border-bottom: 2px solid var(--accent);',
  grid: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;',
  card: 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; transition: border-color 0.15s;',
  cardHeader: 'display: flex; align-items: center; gap: 10px; margin-bottom: 12px;',
  cardIcon: 'font-size: 24px;',
  cardTitle: 'font-weight: 600; font-size: 15px;',
  cardType: 'font-size: 12px; color: var(--text-muted);',
  badge: 'display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;',
  badgeActive: 'background: rgba(21,128,61,0.15); color: var(--success);',
  badgeInactive: 'background: rgba(107,115,148,0.15); color: var(--text-muted);',
  badgeError: 'background: rgba(239,68,68,0.15); color: var(--danger);',
  meta: 'font-size: 12px; color: var(--text-muted); margin-top: 8px;',
  actions: 'display: flex; gap: 8px; margin-top: 12px;',
  btn: 'padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); transition: all 0.15s;',
  btnPrimary: 'padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: none; background: var(--accent); color: #fff;',
  btnDanger: 'padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: none; background: var(--danger); color: #fff;',
  emptyState: 'text-align: center; padding: 60px 20px; color: var(--text-muted);',
  emptyIcon: 'font-size: 48px; margin-bottom: 12px; opacity: 0.5;',
  form: 'display: flex; flex-direction: column; gap: 16px;',
  label: 'font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--text-secondary);',
  input: 'padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 13px; width: 100%; box-sizing: border-box;',
  select: 'padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 13px; width: 100%;',
  row: 'display: flex; gap: 12px;',
  col: 'flex: 1;',
  permGrid: 'display: flex; flex-wrap: wrap; gap: 8px;',
  permChip: 'padding: 4px 10px; border-radius: 16px; font-size: 12px; cursor: pointer; border: 1px solid var(--border); transition: all 0.15s;',
  permChipActive: 'padding: 4px 10px; border-radius: 16px; font-size: 12px; cursor: pointer; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600;',
  section: 'margin-bottom: 16px;',
  sectionTitle: 'font-size: 14px; font-weight: 600; margin-bottom: 8px;',
  agentRow: 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px; gap: 12px;',
  agentName: 'font-weight: 500; font-size: 13px;',
  agentPerms: 'display: flex; gap: 4px; flex-wrap: wrap;',
  miniChip: 'padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
  auditTable: 'width: 100%; border-collapse: collapse; font-size: 12px;',
  auditTh: 'text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 600;',
  auditTd: 'padding: 8px 10px; border-bottom: 1px solid var(--border); color: var(--text-secondary);',
  dbPicker: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;',
  dbPickerItem: 'padding: 12px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; text-align: center; transition: all 0.15s; background: var(--bg-secondary);',
  dbPickerItemActive: 'padding: 12px; border-radius: 8px; border: 2px solid var(--accent); cursor: pointer; text-align: center; background: var(--accent-soft);',
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export function DatabaseAccessPage() {
  var app = useApp();
  var [tab, setTab] = useState('connections');
  var [connections, setConnections] = useState([]);
  var [agents, setAgents] = useState([]);
  var [auditLog, setAuditLog] = useState([]);
  var [showAdd, setShowAdd] = useState(false);
  var [showGrant, setShowGrant] = useState(null); // connectionId
  var [editConn, setEditConn] = useState(null);
  var [loading, setLoading] = useState(true);

  var loadData = useCallback(async function() {
    setLoading(true);
    try {
      var [conns, agts] = await Promise.all([
        engineCall('/database/connections'),
        engineCall('/agents').catch(function() { return []; }),
      ]);
      setConnections(conns || []);
      setAgents(agts || []);
    } catch (e) { console.error('Load failed:', e); }
    setLoading(false);
  }, []);

  var loadAudit = useCallback(async function() {
    try {
      var logs = await engineCall('/database/audit?limit=50');
      setAuditLog(logs || []);
    } catch { setAuditLog([]); }
  }, []);

  useEffect(function() { loadData(); }, []);
  useEffect(function() { if (tab === 'audit') loadAudit(); }, [tab]);

  var deleteConn = useCallback(async function(id) {
    if (!confirm('Delete this database connection? All agent access grants will be removed.')) return;
    await engineCall('/database/connections/' + id, 'DELETE');
    loadData();
  }, []);

  var testConn = useCallback(async function(id) {
    try {
      var result = await engineCall('/database/connections/' + id + '/test', 'POST');
      alert(result.success ? 'Connection successful! (' + result.latencyMs + 'ms)' : 'Connection failed: ' + (result.error || 'Unknown error'));
      loadData();
    } catch (e) { alert('Test failed: ' + e.message); }
  }, []);

  return h('div', { style: s.page },
    h('div', { style: s.header },
      h('div', { style: s.title },
        I.database(20),
        'Database Access',
        HelpButton({
          title: 'Database Access',
          content: h(Fragment, null,
            h('p', null, 'Connect your agents to external databases. Each agent can be granted granular permissions (read, write, delete) on specific database connections.'),
            h('p', null, 'Credentials are encrypted in the vault. All queries are sanitized, rate-limited, and logged for audit.'),
          ),
        }),
      ),
      h('button', { style: s.btnPrimary, onClick: function() { setShowAdd(true); } }, '+ Add Connection'),
    ),

    // Tabs
    h('div', { style: s.tabs },
      h('div', { style: tab === 'connections' ? s.tabActive : s.tab, onClick: function() { setTab('connections'); } }, 'Connections'),
      h('div', { style: tab === 'agents' ? s.tabActive : s.tab, onClick: function() { setTab('agents'); } }, 'Agent Access'),
      h('div', { style: tab === 'audit' ? s.tabActive : s.tab, onClick: function() { setTab('audit'); } }, 'Audit Log'),
    ),

    // Content
    tab === 'connections' && ConnectionsTab({ connections: connections, agents: agents, onDelete: deleteConn, onTest: testConn, onEdit: setEditConn, onGrant: setShowGrant, onRefresh: loadData }),
    tab === 'agents' && AgentAccessTab({ connections: connections, agents: agents, onRefresh: loadData }),
    tab === 'audit' && AuditTab({ auditLog: auditLog, onRefresh: loadAudit }),

    // Modals
    showAdd && AddConnectionModal({ onClose: function() { setShowAdd(false); }, onSave: loadData }),
    showGrant && GrantAccessModal({ connectionId: showGrant, agents: agents, connections: connections, onClose: function() { setShowGrant(null); }, onSave: loadData }),
    editConn && EditConnectionModal({ connection: editConn, onClose: function() { setEditConn(null); }, onSave: loadData }),
  );
}

// ─── Connections Tab ─────────────────────────────────────────────────────────

function ConnectionsTab(props) {
  var connections = props.connections;
  if (connections.length === 0) {
    return h('div', { style: s.emptyState },
      h('div', { style: s.emptyIcon }, I.database(48)),
      h('div', { style: 'font-size: 16px; font-weight: 600; margin-bottom: 8px;' }, 'No Database Connections'),
      h('div', null, 'Add a connection to let your agents query external databases.'),
    );
  }

  return h('div', { style: s.grid },
    connections.map(function(conn) {
      var dbType = ALL_DB_TYPES.find(function(t) { return t.value === conn.type; });
      var agentCount = 0;
      // Count agents with access
      var statusStyle = conn.status === 'active' ? s.badgeActive : conn.status === 'error' ? s.badgeError : s.badgeInactive;
      return h('div', { key: conn.id, style: s.card },
        h('div', { style: s.cardHeader },
          h('span', { style: s.cardIcon }, dbType ? dbType.icon : '🗄️'),
          h('div', null,
            h('div', { style: s.cardTitle }, conn.name),
            h('div', { style: s.cardType }, dbType ? dbType.label : conn.type),
          ),
          h('span', { style: s.badge + ';' + statusStyle }, conn.status),
        ),
        conn.host && h('div', { style: s.meta }, conn.host + (conn.port ? ':' + conn.port : '') + (conn.database ? ' / ' + conn.database : '')),
        conn.description && h('div', { style: s.meta }, conn.description),
        conn.lastError && h('div', { style: 'font-size: 11px; color: var(--danger); margin-top: 4px;' }, conn.lastError),
        h('div', { style: s.actions },
          h('button', { style: s.btn, onClick: function() { props.onTest(conn.id); } }, 'Test'),
          h('button', { style: s.btnPrimary, onClick: function() { props.onGrant(conn.id); } }, 'Grant Access'),
          h('button', { style: s.btn, onClick: function() { props.onEdit(conn); } }, 'Edit'),
          h('button', { style: s.btnDanger, onClick: function() { props.onDelete(conn.id); } }, 'Delete'),
        ),
      );
    })
  );
}

// ─── Agent Access Tab ────────────────────────────────────────────────────────

function AgentAccessTab(props) {
  var [accessMap, setAccessMap] = useState({});
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    async function load() {
      var map = {};
      for (var agent of props.agents) {
        try {
          var list = await engineCall('/database/agents/' + agent.id + '/connections');
          if (list && list.length > 0) map[agent.id] = list;
        } catch { /* skip */ }
      }
      setAccessMap(map);
      setLoading(false);
    }
    load();
  }, [props.agents]);

  if (loading) return h('div', { style: 'padding: 40px; text-align: center; color: var(--text-muted);' }, 'Loading agent access...');

  var agentsWithAccess = props.agents.filter(function(a) { return accessMap[a.id] && accessMap[a.id].length > 0; });

  if (agentsWithAccess.length === 0) {
    return h('div', { style: s.emptyState },
      h('div', { style: s.emptyIcon }, '🔒'),
      h('div', { style: 'font-size: 16px; font-weight: 600; margin-bottom: 8px;' }, 'No Agents Have Database Access'),
      h('div', null, 'Grant access from the Connections tab to allow agents to query databases.'),
    );
  }

  return h('div', null,
    agentsWithAccess.map(function(agent) {
      var grants = accessMap[agent.id] || [];
      return h('div', { key: agent.id, style: s.card + '; margin-bottom: 16px;' },
        h('div', { style: s.cardHeader },
          h('div', { style: 'width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: var(--accent);' }, (agent.displayName || agent.name || '?')[0].toUpperCase()),
          h('div', null,
            h('div', { style: s.cardTitle }, agent.displayName || agent.name),
            h('div', { style: s.cardType }, grants.length + ' database' + (grants.length !== 1 ? 's' : '')),
          ),
        ),
        grants.map(function(grant) {
          var conn = grant.connection || {};
          var dbType = ALL_DB_TYPES.find(function(t) { return t.value === conn.type; });
          return h('div', { key: grant.connectionId, style: s.agentRow },
            h('div', { style: 'display: flex; align-items: center; gap: 8px;' },
              h('span', null, dbType ? dbType.icon : '🗄️'),
              h('span', { style: s.agentName }, conn.name || grant.connectionId),
            ),
            h('div', { style: s.agentPerms },
              (grant.permissions || []).map(function(p) {
                var permDef = PERMISSIONS.find(function(x) { return x.value === p; });
                return h('span', { key: p, style: s.miniChip + '; background: ' + (permDef ? permDef.color : 'var(--text-muted)') + '22; color: ' + (permDef ? permDef.color : 'var(--text-muted)') }, p);
              })
            ),
            h('button', { style: s.btnDanger + '; padding: 3px 8px; font-size: 11px;', onClick: async function() {
              if (!confirm('Revoke ' + (agent.displayName || agent.name) + ' access to ' + (conn.name || 'this database') + '?')) return;
              await engineCall('/database/connections/' + grant.connectionId + '/agents/' + agent.id, 'DELETE');
              props.onRefresh();
            }}, 'Revoke'),
          );
        }),
      );
    })
  );
}

// ─── Audit Tab ───────────────────────────────────────────────────────────────

function AuditTab(props) {
  if (props.auditLog.length === 0) {
    return h('div', { style: s.emptyState },
      h('div', { style: s.emptyIcon }, '📋'),
      h('div', { style: 'font-size: 16px; font-weight: 600; margin-bottom: 8px;' }, 'No Query Activity Yet'),
      h('div', null, 'Queries executed by agents will appear here with full audit details.'),
    );
  }

  return h('div', { style: 'overflow-x: auto;' },
    h('table', { style: s.auditTable },
      h('thead', null, h('tr', null,
        h('th', { style: s.auditTh }, 'Time'),
        h('th', { style: s.auditTh }, 'Agent'),
        h('th', { style: s.auditTh }, 'Database'),
        h('th', { style: s.auditTh }, 'Op'),
        h('th', { style: s.auditTh }, 'Query'),
        h('th', { style: s.auditTh }, 'Rows'),
        h('th', { style: s.auditTh }, 'Time'),
        h('th', { style: s.auditTh }, 'Status'),
      )),
      h('tbody', null,
        props.auditLog.map(function(entry) {
          var opColor = entry.operation === 'read' ? 'var(--success)' : entry.operation === 'write' ? 'var(--warning)' : entry.operation === 'delete' ? 'var(--danger)' : 'var(--text-muted)';
          return h('tr', { key: entry.id },
            h('td', { style: s.auditTd }, new Date(entry.timestamp).toLocaleString()),
            h('td', { style: s.auditTd }, entry.agent_name || entry.agent_id?.slice(0, 8)),
            h('td', { style: s.auditTd }, entry.connection_name || entry.connection_id?.slice(0, 8)),
            h('td', { style: s.auditTd + '; font-weight: 600; color: ' + opColor }, entry.operation),
            h('td', { style: s.auditTd + '; font-family: monospace; font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }, entry.query),
            h('td', { style: s.auditTd }, entry.rows_affected),
            h('td', { style: s.auditTd }, entry.execution_time_ms + 'ms'),
            h('td', { style: s.auditTd }, entry.success
              ? h('span', { style: s.badge + ';' + s.badgeActive }, 'OK')
              : h('span', { style: s.badge + ';' + s.badgeError, title: entry.error }, 'FAIL')
            ),
          );
        })
      ),
    ),
  );
}

// ─── Add Connection Modal ────────────────────────────────────────────────────

function AddConnectionModal(props) {
  var [step, setStep] = useState(1);
  var [dbType, setDbType] = useState('');
  var [form, setForm] = useState({ name: '', host: '', port: '', database: '', username: '', password: '', connectionString: '', ssl: false, description: '' });
  var [saving, setSaving] = useState(false);

  var set = function(key, val) { setForm(function(f) { var n = Object.assign({}, f); n[key] = val; return n; }); };

  var isConnString = form.connectionString.length > 0;

  var save = async function() {
    setSaving(true);
    try {
      var body = { type: dbType, name: form.name || (ALL_DB_TYPES.find(function(t) { return t.value === dbType; })?.label + ' Connection'), description: form.description, status: 'inactive' };
      if (isConnString) {
        body.connectionString = form.connectionString;
      } else {
        body.host = form.host;
        body.port = form.port ? parseInt(form.port) : undefined;
        body.database = form.database;
        body.username = form.username;
        body.password = form.password;
        body.ssl = form.ssl;
      }
      await engineCall('/database/connections', 'POST', body);
      props.onSave();
      props.onClose();
    } catch (e) { alert('Failed: ' + e.message); }
    setSaving(false);
  };

  return Modal({
    title: step === 1 ? 'Choose Database Type' : 'Connection Details',
    onClose: props.onClose,
    width: step === 1 ? 600 : 480,
    children: h('div', { style: s.form },
      step === 1 && h(Fragment, null,
        DATABASE_TYPES.map(function(section) {
          return h('div', { key: section.section, style: s.section },
            h('div', { style: s.sectionTitle }, section.section),
            h('div', { style: s.dbPicker },
              section.items.map(function(item) {
                var isActive = dbType === item.value;
                return h('div', {
                  key: item.value,
                  style: isActive ? s.dbPickerItemActive : s.dbPickerItem,
                  onClick: function() { setDbType(item.value); },
                },
                  h('div', { style: 'font-size: 24px; margin-bottom: 4px;' }, item.icon),
                  h('div', { style: 'font-size: 12px; font-weight: 500;' }, item.label),
                );
              })
            ),
          );
        }),
        h('div', { style: 'display: flex; justify-content: flex-end; margin-top: 8px;' },
          h('button', { style: s.btnPrimary, disabled: !dbType, onClick: function() { setStep(2); } }, 'Next →'),
        ),
      ),

      step === 2 && h(Fragment, null,
        h('div', null,
          h('div', { style: s.label }, 'Connection Name'),
          h('input', { style: s.input, placeholder: 'e.g. Production DB', value: form.name, onInput: function(e) { set('name', e.target.value); } }),
        ),
        h('div', null,
          h('div', { style: s.label }, 'Connection String (paste full URL)'),
          h('input', { style: s.input, type: 'password', placeholder: 'postgresql://user:pass@host:5432/db', value: form.connectionString, onInput: function(e) { set('connectionString', e.target.value); } }),
        ),
        !isConnString && h(Fragment, null,
          h('div', { style: 'text-align: center; font-size: 12px; color: var(--text-muted); margin: -8px 0;' }, '— or enter fields —'),
          h('div', { style: s.row },
            h('div', { style: s.col },
              h('div', { style: s.label }, 'Host'),
              h('input', { style: s.input, placeholder: 'localhost', value: form.host, onInput: function(e) { set('host', e.target.value); } }),
            ),
            h('div', { style: 'width: 100px;' },
              h('div', { style: s.label }, 'Port'),
              h('input', { style: s.input, placeholder: '5432', value: form.port, onInput: function(e) { set('port', e.target.value); } }),
            ),
          ),
          h('div', null,
            h('div', { style: s.label }, 'Database'),
            h('input', { style: s.input, placeholder: 'mydb', value: form.database, onInput: function(e) { set('database', e.target.value); } }),
          ),
          h('div', { style: s.row },
            h('div', { style: s.col },
              h('div', { style: s.label }, 'Username'),
              h('input', { style: s.input, value: form.username, onInput: function(e) { set('username', e.target.value); } }),
            ),
            h('div', { style: s.col },
              h('div', { style: s.label }, 'Password'),
              h('input', { style: s.input, type: 'password', value: form.password, onInput: function(e) { set('password', e.target.value); } }),
            ),
          ),
          h('label', { style: 'display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;' },
            h('input', { type: 'checkbox', checked: form.ssl, onChange: function(e) { set('ssl', e.target.checked); } }),
            'Use SSL/TLS',
          ),
        ),
        h('div', null,
          h('div', { style: s.label }, 'Description (optional)'),
          h('input', { style: s.input, placeholder: 'What is this database used for?', value: form.description, onInput: function(e) { set('description', e.target.value); } }),
        ),
        h('div', { style: 'display: flex; justify-content: space-between; margin-top: 8px;' },
          h('button', { style: s.btn, onClick: function() { setStep(1); } }, '← Back'),
          h('button', { style: s.btnPrimary, disabled: saving || (!isConnString && !form.host), onClick: save }, saving ? 'Saving...' : 'Add Connection'),
        ),
      ),
    ),
  });
}

// ─── Grant Access Modal ──────────────────────────────────────────────────────

function GrantAccessModal(props) {
  var [agentId, setAgentId] = useState('');
  var [perms, setPerms] = useState(['read']);
  var [maxRowsRead, setMaxRowsRead] = useState('10000');
  var [maxRowsWrite, setMaxRowsWrite] = useState('1000');
  var [maxRowsDelete, setMaxRowsDelete] = useState('100');
  var [logAll, setLogAll] = useState(false);
  var [requireApproval, setRequireApproval] = useState(false);
  var [blockedTables, setBlockedTables] = useState('');
  var [saving, setSaving] = useState(false);

  var conn = props.connections.find(function(c) { return c.id === props.connectionId; });

  var togglePerm = function(p) {
    setPerms(function(prev) {
      return prev.includes(p) ? prev.filter(function(x) { return x !== p; }) : prev.concat([p]);
    });
  };

  var save = async function() {
    if (!agentId) return alert('Select an agent');
    setSaving(true);
    try {
      var body = {
        agentId: agentId,
        permissions: perms,
        queryLimits: {
          maxRowsRead: parseInt(maxRowsRead) || 10000,
          maxRowsWrite: parseInt(maxRowsWrite) || 1000,
          maxRowsDelete: parseInt(maxRowsDelete) || 100,
        },
        logAllQueries: logAll,
        requireApproval: requireApproval,
      };
      if (blockedTables.trim()) {
        body.schemaAccess = { blockedTables: blockedTables.split(',').map(function(t) { return t.trim(); }).filter(Boolean) };
      }
      await engineCall('/database/connections/' + props.connectionId + '/agents', 'POST', body);
      props.onSave();
      props.onClose();
    } catch (e) { alert('Failed: ' + e.message); }
    setSaving(false);
  };

  return Modal({
    title: 'Grant Database Access' + (conn ? ' — ' + conn.name : ''),
    onClose: props.onClose,
    width: 480,
    children: h('div', { style: s.form },
      h('div', null,
        h('div', { style: s.label }, 'Agent'),
        h('select', { style: s.select, value: agentId, onChange: function(e) { setAgentId(e.target.value); } },
          h('option', { value: '' }, '— Select Agent —'),
          props.agents.map(function(a) {
            return h('option', { key: a.id, value: a.id }, a.displayName || a.name);
          })
        ),
      ),
      h('div', null,
        h('div', { style: s.label }, 'Permissions'),
        h('div', { style: s.permGrid },
          PERMISSIONS.map(function(p) {
            var active = perms.includes(p.value);
            return h('div', {
              key: p.value,
              style: active ? s.permChipActive : s.permChip,
              onClick: function() { togglePerm(p.value); },
            }, p.label, h('span', { style: 'font-size: 10px; color: var(--text-muted); margin-left: 4px;' }, p.desc));
          })
        ),
      ),
      h('div', { style: s.row },
        h('div', { style: s.col },
          h('div', { style: s.label }, 'Max Read Rows'),
          h('input', { style: s.input, type: 'number', value: maxRowsRead, onInput: function(e) { setMaxRowsRead(e.target.value); } }),
        ),
        h('div', { style: s.col },
          h('div', { style: s.label }, 'Max Write Rows'),
          h('input', { style: s.input, type: 'number', value: maxRowsWrite, onInput: function(e) { setMaxRowsWrite(e.target.value); } }),
        ),
        h('div', { style: s.col },
          h('div', { style: s.label }, 'Max Delete Rows'),
          h('input', { style: s.input, type: 'number', value: maxRowsDelete, onInput: function(e) { setMaxRowsDelete(e.target.value); } }),
        ),
      ),
      h('div', null,
        h('div', { style: s.label }, 'Blocked Tables (comma-separated)'),
        h('input', { style: s.input, placeholder: 'users_secrets, payment_tokens', value: blockedTables, onInput: function(e) { setBlockedTables(e.target.value); } }),
      ),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;' },
        h('input', { type: 'checkbox', checked: logAll, onChange: function(e) { setLogAll(e.target.checked); } }),
        'Log ALL queries (including reads)',
      ),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;' },
        h('input', { type: 'checkbox', checked: requireApproval, onChange: function(e) { setRequireApproval(e.target.checked); } }),
        'Require human approval for write/delete',
      ),
      h('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' },
        h('button', { style: s.btn, onClick: props.onClose }, 'Cancel'),
        h('button', { style: s.btnPrimary, disabled: saving || !agentId, onClick: save }, saving ? 'Granting...' : 'Grant Access'),
      ),
    ),
  });
}

// ─── Edit Connection Modal ───────────────────────────────────────────────────

function EditConnectionModal(props) {
  var conn = props.connection;
  var [form, setForm] = useState({ name: conn.name || '', host: conn.host || '', port: String(conn.port || ''), database: conn.database || '', description: conn.description || '', ssl: conn.ssl || false });
  var [saving, setSaving] = useState(false);

  var set = function(key, val) { setForm(function(f) { var n = Object.assign({}, f); n[key] = val; return n; }); };

  var save = async function() {
    setSaving(true);
    try {
      await engineCall('/database/connections/' + conn.id, 'PUT', {
        name: form.name,
        host: form.host,
        port: form.port ? parseInt(form.port) : undefined,
        database: form.database,
        description: form.description,
        ssl: form.ssl,
      });
      props.onSave();
      props.onClose();
    } catch (e) { alert('Failed: ' + e.message); }
    setSaving(false);
  };

  return Modal({
    title: 'Edit Connection — ' + conn.name,
    onClose: props.onClose,
    width: 480,
    children: h('div', { style: s.form },
      h('div', null,
        h('div', { style: s.label }, 'Name'),
        h('input', { style: s.input, value: form.name, onInput: function(e) { set('name', e.target.value); } }),
      ),
      h('div', { style: s.row },
        h('div', { style: s.col },
          h('div', { style: s.label }, 'Host'),
          h('input', { style: s.input, value: form.host, onInput: function(e) { set('host', e.target.value); } }),
        ),
        h('div', { style: 'width: 100px;' },
          h('div', { style: s.label }, 'Port'),
          h('input', { style: s.input, value: form.port, onInput: function(e) { set('port', e.target.value); } }),
        ),
      ),
      h('div', null,
        h('div', { style: s.label }, 'Database'),
        h('input', { style: s.input, value: form.database, onInput: function(e) { set('database', e.target.value); } }),
      ),
      h('div', null,
        h('div', { style: s.label }, 'Description'),
        h('input', { style: s.input, value: form.description, onInput: function(e) { set('description', e.target.value); } }),
      ),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;' },
        h('input', { type: 'checkbox', checked: form.ssl, onChange: function(e) { set('ssl', e.target.checked); } }),
        'Use SSL/TLS',
      ),
      h('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' },
        h('button', { style: s.btn, onClick: props.onClose }, 'Cancel'),
        h('button', { style: s.btnPrimary, disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Changes'),
      ),
    ),
  });
}
