import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js?v=2';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';
import { BrandLogo } from '../assets/brand-logos.js';

var DATABASE_TYPES = [
  { section: 'Relational (SQL)', items: [
    { value: 'postgresql', label: 'PostgreSQL' },
    { value: 'mysql', label: 'MySQL' },
    { value: 'mariadb', label: 'MariaDB' },
    { value: 'mssql', label: 'Microsoft SQL Server' },
    { value: 'oracle', label: 'Oracle' },
    { value: 'sqlite', label: 'SQLite' },
  ]},
  { section: 'Cloud-Native SQL', items: [
    { value: 'supabase', label: 'Supabase' },
    { value: 'neon', label: 'Neon' },
    { value: 'planetscale', label: 'PlanetScale' },
    { value: 'cockroachdb', label: 'CockroachDB' },
    { value: 'turso', label: 'Turso / LibSQL' },
  ]},
  { section: 'NoSQL / Key-Value', items: [
    { value: 'mongodb', label: 'MongoDB' },
    { value: 'redis', label: 'Redis' },
    { value: 'upstash', label: 'Upstash Redis' },
    { value: 'dynamodb', label: 'AWS DynamoDB' },
  ]},
];

function dbLogo(type, size) {
  if (BrandLogo[type]) return BrandLogo[type](size || 28);
  var dbType = ALL_DB_TYPES.find(function(d) { return d.value === type; });
  return h('span', { style: { fontSize: (size || 28) * 0.75 + 'px', lineHeight: 1 } }, dbType ? dbType.label.charAt(0) : '?');
}

var ALL_DB_TYPES = DATABASE_TYPES.flatMap(function(s) { return s.items; });

var PERMISSIONS = [
  { value: 'read', label: 'Read', desc: 'SELECT queries', color: 'var(--success)' },
  { value: 'write', label: 'Write', desc: 'INSERT / UPDATE', color: 'var(--warning)' },
  { value: 'delete', label: 'Delete', desc: 'DELETE rows', color: 'var(--danger)' },
  { value: 'schema', label: 'Schema', desc: 'DDL operations', color: 'var(--accent)' },
  { value: 'execute', label: 'Execute', desc: 'Stored procedures', color: 'var(--text-muted)' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

// Convert CSS string to React style object
function css(str) {
  var obj = {};
  str.split(';').forEach(function(pair) {
    var p = pair.trim(); if (!p) return;
    var i = p.indexOf(':'); if (i < 0) return;
    var key = p.slice(0, i).trim();
    var val = p.slice(i + 1).trim();
    // camelCase the key
    key = key.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
    obj[key] = val;
  });
  return obj;
}

var _s = {
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
// Convert all string styles to React style objects
var s = {};
Object.keys(_s).forEach(function(k) { s[k] = css(_s[k]); });

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
      setConnections(Array.isArray(conns) ? conns : []);
      setAgents(Array.isArray(agts) ? agts : []);
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
    await engineCall('/database/connections/' + id, { method: 'DELETE' });
    loadData();
  }, []);

  var testConn = useCallback(async function(id) {
    try {
      var result = await engineCall('/database/connections/' + id + '/test', { method: 'POST' });
      alert(result.success ? 'Connection successful! (' + result.latencyMs + 'ms)' : 'Connection failed: ' + (result.error || 'Unknown error'));
      loadData();
    } catch (e) { alert('Test failed: ' + e.message); }
  }, []);

  return h('div', { style: s.page },
    h('div', { style: s.header },
      h('div', { style: s.title },
        I.database(),
        'Database Access',
        h(HelpButton, { label: 'Database Access' },
          h('p', null, 'Connect your agents to external databases. Each agent can be granted granular permissions (read, write, delete) on specific database connections.'),
          h('p', null, 'Credentials are encrypted in the vault. All queries are sanitized, rate-limited, and logged for audit.'),
        ),
      ),
      h('button', { style: s.btnPrimary, onClick: function() { setShowAdd(true); } }, '+ Add Connection'),
    ),

    // Tabs
    h('div', { style: s.tabs },
      h('div', { style: tab === 'connections' ? s.tabActive : s.tab, onClick: function() { setTab('connections'); } },
        h('span', { style: css('display: inline-flex; align-items: center; gap: 6px;') }, h('span', { style: css('display: flex; transform: scale(0.7);') }, I.database()), 'Connections')),
      h('div', { style: tab === 'agents' ? s.tabActive : s.tab, onClick: function() { setTab('agents'); } },
        h('span', { style: css('display: inline-flex; align-items: center; gap: 6px;') }, h('span', { style: css('display: flex; transform: scale(0.7);') }, I.shield()), 'Agent Access')),
      h('div', { style: tab === 'audit' ? s.tabActive : s.tab, onClick: function() { setTab('audit'); } },
        h('span', { style: css('display: inline-flex; align-items: center; gap: 6px;') }, h('span', { style: css('display: flex; transform: scale(0.7);') }, I.audit()), 'Audit Log')),
    ),

    // Content
    tab === 'connections' && h(ConnectionsTab, { connections: connections, agents: agents, onDelete: deleteConn, onTest: testConn, onEdit: setEditConn, onGrant: setShowGrant, onRefresh: loadData }),
    tab === 'agents' && h(AgentAccessTab, { connections: connections, agents: agents, onRefresh: loadData }),
    tab === 'audit' && h(AuditTab, { auditLog: auditLog, onRefresh: loadAudit }),

    // Modals
    showAdd && h(AddConnectionModal, { onClose: function() { setShowAdd(false); }, onSave: loadData }),
    showGrant && h(GrantAccessModal, { connectionId: showGrant, agents: agents, connections: connections, onClose: function() { setShowGrant(null); }, onSave: loadData }),
    editConn && h(EditConnectionModal, { connection: editConn, onClose: function() { setEditConn(null); }, onSave: loadData }),
  );
}

// ─── Connections Tab ─────────────────────────────────────────────────────────

function ConnectionsTab(props) {
  var connections = props.connections;
  if (connections.length === 0) {
    return h('div', { style: s.emptyState },
      h('div', { style: s.emptyIcon }, I.database()),
      h('div', { style: css('font-size: 16px; font-weight: 600; margin-bottom: 8px;') }, 'No Database Connections'),
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
          h('span', { style: s.cardIcon }, dbLogo(conn.type, 32)),
          h('div', null,
            h('div', { style: s.cardTitle }, conn.name),
            h('div', { style: s.cardType }, dbType ? dbType.label : conn.type),
          ),
          h('span', { style: Object.assign({}, s.badge, statusStyle) }, conn.status),
        ),
        conn.host && h('div', { style: s.meta }, conn.host + (conn.port ? ':' + conn.port : '') + (conn.database ? ' / ' + conn.database : '')),
        conn.description && h('div', { style: s.meta }, conn.description),
        conn.lastError && h('div', { style: css('font-size: 11px; color: var(--danger); margin-top: 4px;') }, conn.lastError),
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

  if (loading) return h('div', { style: css('padding: 40px; text-align: center; color: var(--text-muted);') }, 'Loading agent access...');

  var agentsWithAccess = props.agents.filter(function(a) { return accessMap[a.id] && accessMap[a.id].length > 0; });

  if (agentsWithAccess.length === 0) {
    return h('div', { style: s.emptyState },
      h('div', { style: s.emptyIcon }, I.lock()),
      h('div', { style: css('font-size: 16px; font-weight: 600; margin-bottom: 8px;') }, 'No Agents Have Database Access'),
      h('div', null, 'Grant access from the Connections tab to allow agents to query databases.'),
    );
  }

  return h('div', null,
    agentsWithAccess.map(function(agent) {
      var grants = accessMap[agent.id] || [];
      return h('div', { key: agent.id, style: Object.assign({}, s.card, { marginBottom: '16px' }) },
        h('div', { style: s.cardHeader },
          h('div', { style: css('width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: var(--accent);') }, (agent.displayName || agent.name || '?')[0].toUpperCase()),
          h('div', null,
            h('div', { style: s.cardTitle }, agent.displayName || agent.name),
            h('div', { style: s.cardType }, grants.length + ' database' + (grants.length !== 1 ? 's' : '')),
          ),
        ),
        grants.map(function(grant) {
          var conn = grant.connection || {};
          var dbType = ALL_DB_TYPES.find(function(t) { return t.value === conn.type; });
          return h('div', { key: grant.connectionId, style: s.agentRow },
            h('div', { style: css('display: flex; align-items: center; gap: 8px;') },
              h('span', null, dbLogo(conn.type, 20)),
              h('span', { style: s.agentName }, conn.name || grant.connectionId),
            ),
            h('div', { style: s.agentPerms },
              (grant.permissions || []).map(function(p) {
                var permDef = PERMISSIONS.find(function(x) { return x.value === p; });
                return h('span', { key: p, style: Object.assign({}, s.miniChip, { background: (permDef ? permDef.color : 'var(--text-muted)') + '22', color: permDef ? permDef.color : 'var(--text-muted)' }) }, p);
              })
            ),
            h('button', { style: Object.assign({}, s.btnDanger, { padding: '3px 8px', fontSize: '11px' }), onClick: async function() {
              if (!confirm('Revoke ' + (agent.displayName || agent.name) + ' access to ' + (conn.name || 'this database') + '?')) return;
              await engineCall('/database/connections/' + grant.connectionId + '/agents/' + agent.id, { method: 'DELETE' });
              props.onRefresh();
            }}, 'Revoke'),
          );
        }),
      );
    })
  );
}

// ─── Audit Tab ───────────────────────────────────────────────────────────────

var AUDIT_PAGE_SIZE = 15;

function AuditTab(props) {
  var [search, setSearch] = useState('');
  var [opFilter, setOpFilter] = useState('all');
  var [statusFilter, setStatusFilter] = useState('all');
  var [agentFilter, setAgentFilter] = useState('all');
  var [page, setPage] = useState(0);
  var [expanded, setExpanded] = useState(null);

  // Get unique agents from audit log
  var agents = [];
  var agentSet = {};
  props.auditLog.forEach(function(e) {
    var name = e.agent_name || e.agent_id;
    if (name && !agentSet[name]) { agentSet[name] = true; agents.push(name); }
  });

  // Filter entries
  var filtered = props.auditLog.filter(function(e) {
    if (opFilter !== 'all' && e.operation !== opFilter) return false;
    if (statusFilter === 'ok' && !e.success) return false;
    if (statusFilter === 'fail' && e.success) return false;
    if (agentFilter !== 'all' && (e.agent_name || e.agent_id) !== agentFilter) return false;
    if (search) {
      var q = search.toLowerCase();
      var haystack = ((e.query || '') + ' ' + (e.agent_name || '') + ' ' + (e.connection_name || '') + ' ' + (e.error || '')).toLowerCase();
      if (haystack.indexOf(q) < 0) return false;
    }
    return true;
  });

  var totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  if (page >= totalPages) page = totalPages - 1;
  var paged = filtered.slice(page * AUDIT_PAGE_SIZE, (page + 1) * AUDIT_PAGE_SIZE);

  // Reset page when filters change
  var resetPage = function() { setPage(0); };

  if (props.auditLog.length === 0) {
    return h('div', { style: s.emptyState },
      h('div', { style: s.emptyIcon }, I.audit()),
      h('div', { style: css('font-size: 16px; font-weight: 600; margin-bottom: 8px;') }, 'No Query Activity Yet'),
      h('div', null, 'Queries executed by agents will appear here with full audit details.'),
    );
  }

  var opColor = function(op) {
    return op === 'read' ? 'var(--success)' : op === 'write' ? 'var(--warning)' : op === 'delete' ? 'var(--danger)' : op === 'schema' ? 'var(--accent)' : 'var(--text-muted)';
  };

  var filterBar = css('display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;');
  var filterSelect = css('padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 12px;');
  var searchInput = css('padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 12px; flex: 1; min-width: 180px;');
  var countBadge = css('font-size: 11px; color: var(--text-muted); margin-left: auto; white-space: nowrap;');

  return h('div', null,
    // Filter bar
    h('div', { style: filterBar },
      h('div', { style: css('display: flex; align-items: center; gap: 4px; color: var(--text-muted);') },
        h('span', { style: css('display: flex; transform: scale(0.65);') }, I.search()),
      ),
      h('input', { style: searchInput, placeholder: 'Search queries, agents, databases, errors...', value: search, onInput: function(e) { setSearch(e.target.value); resetPage(); } }),
      h('select', { style: filterSelect, value: opFilter, onChange: function(e) { setOpFilter(e.target.value); resetPage(); } },
        h('option', { value: 'all' }, 'All Operations'),
        h('option', { value: 'read' }, 'Read'),
        h('option', { value: 'write' }, 'Write'),
        h('option', { value: 'delete' }, 'Delete'),
        h('option', { value: 'schema' }, 'Schema'),
        h('option', { value: 'execute' }, 'Execute'),
      ),
      h('select', { style: filterSelect, value: statusFilter, onChange: function(e) { setStatusFilter(e.target.value); resetPage(); } },
        h('option', { value: 'all' }, 'All Status'),
        h('option', { value: 'ok' }, 'Success'),
        h('option', { value: 'fail' }, 'Failed'),
      ),
      agents.length > 1 && h('select', { style: filterSelect, value: agentFilter, onChange: function(e) { setAgentFilter(e.target.value); resetPage(); } },
        h('option', { value: 'all' }, 'All Agents'),
        agents.map(function(a) { return h('option', { key: a, value: a }, a); })
      ),
      h('span', { style: countBadge }, filtered.length + ' of ' + props.auditLog.length + ' entries'),
      h('button', { style: Object.assign({}, s.btn, { padding: '4px 10px', fontSize: '11px' }), onClick: props.onRefresh }, 'Refresh'),
    ),

    // Table
    h('div', { style: css('overflow-x: auto; border: 1px solid var(--border); border-radius: 8px;') },
      h('table', { style: s.auditTable },
        h('thead', null, h('tr', null,
          h('th', { style: s.auditTh }, 'Time'),
          h('th', { style: s.auditTh }, 'Agent'),
          h('th', { style: s.auditTh }, 'Database'),
          h('th', { style: s.auditTh }, 'Operation'),
          h('th', { style: s.auditTh }, 'Query'),
          h('th', { style: s.auditTh }, 'Rows'),
          h('th', { style: s.auditTh }, 'Latency'),
          h('th', { style: s.auditTh }, 'Status'),
        )),
        h('tbody', null,
          paged.length === 0 && h('tr', null,
            h('td', { colSpan: 8, style: Object.assign({}, s.auditTd, { textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }) }, 'No entries match your filters')
          ),
          paged.map(function(entry) {
            var isExpanded = expanded === entry.id;
            return h(Fragment, { key: entry.id },
              h('tr', { style: css('cursor: pointer; transition: background 0.1s;'), onClick: function() { setExpanded(isExpanded ? null : entry.id); } },
                h('td', { style: s.auditTd }, new Date(entry.timestamp).toLocaleString()),
                h('td', { style: Object.assign({}, s.auditTd, { fontWeight: 500 }) }, entry.agent_name || (entry.agent_id ? entry.agent_id.slice(0, 8) + '...' : '—')),
                h('td', { style: s.auditTd }, entry.connection_name || (entry.connection_id ? entry.connection_id.slice(0, 8) + '...' : '—')),
                h('td', { style: Object.assign({}, s.auditTd, { fontWeight: 600, color: opColor(entry.operation) }) }, entry.operation),
                h('td', { style: Object.assign({}, s.auditTd, { fontFamily: 'monospace', fontSize: '11px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }, entry.query),
                h('td', { style: Object.assign({}, s.auditTd, { textAlign: 'right' }) }, entry.rows_affected != null ? entry.rows_affected : '—'),
                h('td', { style: Object.assign({}, s.auditTd, { textAlign: 'right', whiteSpace: 'nowrap' }) }, entry.execution_time_ms != null ? entry.execution_time_ms + 'ms' : '—'),
                h('td', { style: s.auditTd }, entry.success
                  ? h('span', { style: Object.assign({}, s.badge, s.badgeActive) }, 'OK')
                  : h('span', { style: Object.assign({}, s.badge, s.badgeError) }, 'FAIL')
                ),
              ),
              // Expanded row detail
              isExpanded && h('tr', null,
                h('td', { colSpan: 8, style: css('padding: 12px 16px; background: var(--bg-secondary); border-bottom: 1px solid var(--border);') },
                  h('div', { style: css('display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;') },
                    h('div', null,
                      h('div', { style: css('font-weight: 600; margin-bottom: 4px; color: var(--text-muted);') }, 'Full Query'),
                      h('pre', { style: css('margin: 0; padding: 8px; background: var(--bg-primary); border-radius: 6px; overflow-x: auto; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 200px;') }, entry.query || '—'),
                    ),
                    h('div', null,
                      h('div', { style: css('font-weight: 600; margin-bottom: 4px; color: var(--text-muted);') }, 'Details'),
                      h('div', { style: css('display: flex; flex-direction: column; gap: 4px;') },
                        h('div', null, h('strong', null, 'Agent ID: '), entry.agent_id || '—'),
                        h('div', null, h('strong', null, 'Connection ID: '), entry.connection_id || '—'),
                        h('div', null, h('strong', null, 'Rows Affected: '), entry.rows_affected != null ? String(entry.rows_affected) : '—'),
                        h('div', null, h('strong', null, 'Execution Time: '), entry.execution_time_ms != null ? entry.execution_time_ms + 'ms' : '—'),
                        h('div', null, h('strong', null, 'IP: '), entry.ip_address || '—'),
                        !entry.success && entry.error && h('div', { style: css('margin-top: 4px; padding: 6px 8px; background: rgba(239,68,68,0.1); border-radius: 4px; color: var(--danger);') },
                          h('strong', null, 'Error: '), entry.error
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          })
        ),
      ),
    ),

    // Pagination
    totalPages > 1 && h('div', { style: css('display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 16px;') },
      h('button', { style: Object.assign({}, s.btn, { padding: '4px 10px', fontSize: '12px' }), disabled: page === 0, onClick: function() { setPage(0); } }, '«'),
      h('button', { style: Object.assign({}, s.btn, { padding: '4px 10px', fontSize: '12px' }), disabled: page === 0, onClick: function() { setPage(page - 1); } }, '‹'),
      h('span', { style: css('font-size: 12px; color: var(--text-secondary);') }, 'Page ' + (page + 1) + ' of ' + totalPages),
      h('button', { style: Object.assign({}, s.btn, { padding: '4px 10px', fontSize: '12px' }), disabled: page >= totalPages - 1, onClick: function() { setPage(page + 1); } }, '›'),
      h('button', { style: Object.assign({}, s.btn, { padding: '4px 10px', fontSize: '12px' }), disabled: page >= totalPages - 1, onClick: function() { setPage(totalPages - 1); } }, '»'),
    ),
  );
}

// ─── Add Connection Modal ────────────────────────────────────────────────────

function AddConnectionModal(props) {
  var [step, setStep] = useState(1);
  var [dbType, setDbType] = useState('');
  var [form, setForm] = useState({ name: '', host: '', port: '', database: '', username: '', password: '', connectionString: '', ssl: false, description: '' });
  var [saving, setSaving] = useState(false);
  var [testing, setTesting] = useState(false);
  var [testResult, setTestResult] = useState(null); // { success, error, latencyMs }

  var set = function(key, val) { setForm(function(f) { var n = Object.assign({}, f); n[key] = val; return n; }); setTestResult(null); };

  var isConnString = form.connectionString.length > 0;

  var buildBody = function() {
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
    return body;
  };

  var testConnection = async function() {
    setTesting(true);
    setTestResult(null);
    try {
      var result = await engineCall('/database/connections/test', { method: 'POST', body: JSON.stringify(buildBody()) });
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, error: e.message || 'Connection test failed' });
    }
    setTesting(false);
  };

  var save = async function() {
    // Test connection first if not already tested successfully
    if (!testResult || !testResult.success) {
      setTesting(true);
      setTestResult(null);
      try {
        var result = await engineCall('/database/connections/test', { method: 'POST', body: JSON.stringify(buildBody()) });
        setTestResult(result);
        if (!result.success) {
          setTesting(false);
          return; // Don't save if test fails
        }
      } catch (e) {
        setTestResult({ success: false, error: e.message || 'Connection test failed' });
        setTesting(false);
        return;
      }
      setTesting(false);
    }

    setSaving(true);
    try {
      await engineCall('/database/connections', { method: 'POST', body: JSON.stringify(buildBody()) });
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
                  h('div', { style: css('margin-bottom: 4px; display: flex; justify-content: center;') }, dbLogo(item.value, 32)),
                  h('div', { style: css('font-size: 12px; font-weight: 500;') }, item.label),
                );
              })
            ),
          );
        }),
        h('div', { style: css('display: flex; justify-content: flex-end; margin-top: 8px;') },
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
          h('div', { style: css('text-align: center; font-size: 12px; color: var(--text-muted); margin: -8px 0;') }, '— or enter fields —'),
          h('div', { style: s.row },
            h('div', { style: s.col },
              h('div', { style: s.label }, 'Host'),
              h('input', { style: s.input, placeholder: 'localhost', value: form.host, onInput: function(e) { set('host', e.target.value); } }),
            ),
            h('div', { style: css('width: 100px;') },
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
          h('label', { style: css('display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;') },
            h('input', { type: 'checkbox', checked: form.ssl, onChange: function(e) { set('ssl', e.target.checked); } }),
            'Use SSL/TLS',
          ),
        ),
        h('div', null,
          h('div', { style: s.label }, 'Description (optional)'),
          h('input', { style: s.input, placeholder: 'What is this database used for?', value: form.description, onInput: function(e) { set('description', e.target.value); } }),
        ),
        // Connection test result
        testResult && h('div', { style: css('padding: 8px 12px; border-radius: 6px; font-size: 12px; ' + (testResult.success
          ? 'background: rgba(21,128,61,0.1); color: var(--success); border: 1px solid rgba(21,128,61,0.3);'
          : 'background: rgba(239,68,68,0.1); color: var(--danger); border: 1px solid rgba(239,68,68,0.3);')) },
          testResult.success
            ? 'Connection successful! (' + testResult.latencyMs + 'ms)'
            : 'Connection failed: ' + (testResult.error || 'Unknown error'),
        ),

        h('div', { style: css('display: flex; justify-content: space-between; margin-top: 8px;') },
          h('button', { style: s.btn, onClick: function() { setStep(1); } }, '← Back'),
          h('div', { style: css('display: flex; gap: 8px;') },
            h('button', { style: s.btn, disabled: testing || saving || (!isConnString && !form.host), onClick: testConnection }, testing ? 'Testing...' : 'Test Connection'),
            h('button', { style: s.btnPrimary, disabled: testing || saving || (!isConnString && !form.host), onClick: save }, saving ? 'Saving...' : testing ? 'Testing...' : 'Add Connection'),
          ),
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
      await engineCall('/database/connections/' + props.connectionId + '/agents', { method: 'POST', body: JSON.stringify(body) });
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
            }, p.label, h('span', { style: css('font-size: 10px; color: var(--text-muted); margin-left: 4px;') }, p.desc));
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
      h('label', { style: css('display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;') },
        h('input', { type: 'checkbox', checked: logAll, onChange: function(e) { setLogAll(e.target.checked); } }),
        'Log ALL queries (including reads)',
      ),
      h('label', { style: css('display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;') },
        h('input', { type: 'checkbox', checked: requireApproval, onChange: function(e) { setRequireApproval(e.target.checked); } }),
        'Require human approval for write/delete',
      ),
      h('div', { style: css('display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;') },
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
      await engineCall('/database/connections/' + conn.id, { method: 'PUT', body: JSON.stringify({
        name: form.name,
        host: form.host,
        port: form.port ? parseInt(form.port) : undefined,
        database: form.database,
        description: form.description,
        ssl: form.ssl,
      }) });
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
        h('div', { style: css('width: 100px;') },
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
      h('label', { style: css('display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;') },
        h('input', { type: 'checkbox', checked: form.ssl, onChange: function(e) { set('ssl', e.target.checked); } }),
        'Use SSL/TLS',
      ),
      h('div', { style: css('display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;') },
        h('button', { style: s.btn, onClick: props.onClose }, 'Cancel'),
        h('button', { style: s.btnPrimary, disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Changes'),
      ),
    ),
  });
}
