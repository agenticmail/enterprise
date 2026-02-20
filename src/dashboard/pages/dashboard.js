import { h, useState, useEffect, Fragment, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge } from '../components/utils.js';
import { useApp, apiCall, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { DetailModal } from '../components/modal.js';

export function SetupChecklist({ onNavigate }) {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(localStorage.getItem('em_checklist_dismissed') === 'true');

  useEffect(() => {
    fetch('/auth/setup-status', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => { if (d) setStatus(d); }).catch(() => {});
  }, []);

  if (dismissed || !status) return null;

  var cl = status.checklist || status;
  const items = [
    { key: 'admin', label: 'Admin account created', done: cl.adminCreated, nav: 'users' },
    { key: 'company', label: 'Company configured', done: cl.companyConfigured, nav: 'settings' },
    { key: 'email', label: 'Email configured', done: cl.emailConfigured, nav: 'settings' },
    { key: 'agent', label: 'First agent created', done: cl.agentCreated, nav: 'agents' },
    { key: 'invite', label: 'Invite team members', done: cl.teamInvited, nav: 'users' },
  ];

  const doneCount = items.filter(i => i.done).length;
  if (doneCount === items.length) return null;

  const dismiss = () => { setDismissed(true); localStorage.setItem('em_checklist_dismissed', 'true'); };

  return h('div', { className: 'setup-checklist' },
    h('h3', null,
      'Setup Checklist (' + doneCount + '/' + items.length + ')',
      h('button', { className: 'dismiss', onClick: dismiss }, 'Dismiss')
    ),
    h('div', { className: 'checklist-progress' },
      h('div', { className: 'checklist-progress-bar', style: { width: Math.round((doneCount / items.length) * 100) + '%' } })
    ),
    items.map(item =>
      h('div', { key: item.key, className: 'checklist-item' },
        h('div', { className: 'check-circle' + (item.done ? ' done' : '') }, item.done ? h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 3 }, h('polyline', { points: '20 6 9 17 4 12' })) : null),
        h('span', null, item.label),
        !item.done && h('span', { className: 'check-action', onClick: () => onNavigate && onNavigate(item.nav) }, 'Set up \u2192')
      )
    )
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [events, setEvents] = useState([]);

  var _engineAgents = useState([]);
  var engineAgents = _engineAgents[0]; var setEngineAgents = _engineAgents[1];
  var _selectedEvent = useState(null);
  var selectedEvent = _selectedEvent[0]; var setSelectedEvent = _selectedEvent[1];

  useEffect(() => {
    apiCall('/stats').then(setStats).catch(() => {});
    apiCall('/agents').then(d => setAgents(d.agents || d || [])).catch(() => {});
    engineCall('/agents?orgId=default').then(d => setEngineAgents(d.agents || [])).catch(() => {});
    engineCall('/activity/events?limit=10').then(d => setEvents(d.events || [])).catch(() => {});
  }, []);

  // Merge admin + engine agents; engine agents (appended last) win in the data map
  var mergedForMap = [].concat(agents, engineAgents);
  const emailMap = buildAgentEmailMap(mergedForMap);
  const agentData = buildAgentDataMap(mergedForMap);
  const { setPage: navTo } = useApp();

  return h(Fragment, null,
    h(SetupChecklist, { onNavigate: function(pg) { if (navTo) navTo(pg); } }),
    h('div', { className: 'stat-grid' },
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Total Agents'), h('div', { className: 'stat-value' }, stats?.totalAgents ?? agents.length ?? '-')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Active Agents'), h('div', { className: 'stat-value', style: { color: 'var(--success)' } }, (stats?.activeAgents ?? agents.filter(function(a) { return a.status === 'active'; }).length) || '-')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Users'), h('div', { className: 'stat-value' }, stats?.totalUsers ?? '-')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Audit Events'), h('div', { className: 'stat-value' }, stats?.totalAuditEvents ?? '-'))
    ),

    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('h3', null, 'Agents'), h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { navTo('agents'); } }, 'View all')),
        h('div', { className: 'card-body-flush' },
          agents.length === 0
            ? h('div', { className: 'empty-state' }, h('h3', null, 'No agents yet'), h('p', null, 'Create your first agent to get started'))
            : h('table', null,
                h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Role'), h('th', null, 'Status'))),
                h('tbody', null, agents.slice(0, 5).map(a =>
                  h('tr', { key: a.id },
                    h('td', null, h('strong', null, a.name)),
                    h('td', null, a.role || '-'),
                    h('td', null, h('span', { className: 'badge badge-' + (a.status === 'active' ? 'success' : a.status === 'archived' ? 'neutral' : 'warning') }, a.status || 'active'))
                  )
                ))
              )
        )
      ),

      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('h3', null, 'Recent Activity'), h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { navTo('activity'); } }, 'View all')),
        h('div', { className: 'card-body' },
          events.length === 0
            ? h('div', { style: { textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 } }, 'No activity yet')
            : events.slice(0, 8).map(function(ev, i) {
                var evAgent = ev.agentId ? agentData[ev.agentId] : null;
                var evName = evAgent ? (evAgent.name || 'Agent') : null;
                var typeColor = ev.type === 'error' ? 'var(--danger)' : ev.type === 'deployed' || ev.type === 'started' ? 'var(--success)' : ev.type === 'stopped' ? 'var(--warning)' : 'var(--accent)';
                return h('div', { key: i, onClick: function() { setSelectedEvent(ev); }, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 7 && i < events.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13, cursor: 'pointer', borderRadius: 4 } },
                  h('span', { style: { color: 'var(--text-muted)', fontSize: 11, minWidth: 70, flexShrink: 0 } }, new Date(ev.timestamp).toLocaleTimeString()),
                  evAgent && evAgent.avatar
                    ? h('img', { src: evAgent.avatar, style: { width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } })
                    : evName
                      ? h('div', { style: { width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 } }, evName.charAt(0).toUpperCase())
                      : null,
                  h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    evName ? h('strong', { style: { marginRight: 4 } }, evName) : null,
                    ev.type
                  ),
                  h('span', { className: 'badge', style: { background: typeColor, color: '#fff', fontSize: 10, flexShrink: 0 } }, ev.type)
                );
              })
        )
      )
    ),

    // ─── Event Detail Modal ──────────────────────────────
    selectedEvent && (function() {
      var ev = selectedEvent;
      var evAgent = ev.agentId ? agentData[ev.agentId] : null;
      var evName = evAgent ? (evAgent.name || 'Agent') : null;
      var typeColor = ev.type === 'error' ? 'var(--danger)' : ev.type === 'deployed' || ev.type === 'started' ? 'var(--success)' : ev.type === 'stopped' ? 'var(--warning)' : 'var(--accent)';
      return h(DetailModal, {
        title: 'Activity Event',
        onClose: function() { setSelectedEvent(null); },
        badge: { label: ev.type, color: typeColor },
        header: evName ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          evAgent && evAgent.avatar
            ? h('img', { src: evAgent.avatar, style: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' } })
            : h('div', { style: { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 } }, evName.charAt(0).toUpperCase()),
          h('div', null,
            h('div', { style: { fontWeight: 600, fontSize: 14 } }, evName),
            evAgent && evAgent.email ? h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, evAgent.email) : null
          )
        ) : null,
        data: ev,
        exclude: ['agentId']
      });
    })()
  );
}
