import { h, useState, useEffect, Fragment, useApp, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { DetailModal } from '../components/modal.js';

export function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    apiCall('/audit?limit=200').then(d => { var arr = d.events || d.entries || d.logs || d; setLogs(Array.isArray(arr) ? arr : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Extract display name: prefer email from details, fall back to actor ID
  const actorDisplay = (l) => {
    if (l.details && l.details.email) return l.details.email;
    if (l.actorType === 'system') return 'System';
    return l.actor || l.userId || l.user || '-';
  };

  // Extract role badge from details
  const actorRole = (l) => {
    if (l.details && l.details.role) return l.details.role;
    return l.actorType || null;
  };

  const filtered = filter
    ? logs.filter(l => {
        const s = filter.toLowerCase();
        return (l.action || '').toLowerCase().includes(s)
          || actorDisplay(l).toLowerCase().includes(s)
          || (l.resource || '').toLowerCase().includes(s)
          || (typeof l.details === 'object' && JSON.stringify(l.details).toLowerCase().includes(s));
      })
    : logs;

  const actionColor = (action) => {
    if (!action) return 'badge-neutral';
    const a = action.toLowerCase();
    if (a.includes('create') || a.includes('add')) return 'badge-success';
    if (a.includes('delete') || a.includes('remove') || a.includes('revoke')) return 'badge-danger';
    if (a.includes('update') || a.includes('edit') || a.includes('patch')) return 'badge-warning';
    if (a.includes('login') || a.includes('auth')) return 'badge-info';
    return 'badge-neutral';
  };

  const roleColor = (role) => {
    if (!role) return 'badge-neutral';
    if (role === 'owner') return 'badge-danger';
    if (role === 'admin') return 'badge-warning';
    if (role === 'system') return 'badge-info';
    return 'badge-neutral';
  };

  // Friendly resource display: "/api/agents/abc123" → "agents/abc123"
  const resourceDisplay = (r) => {
    if (!r) return '-';
    return r.replace(/^\/api\//, '').replace(/^\//, '');
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Audit Log'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Complete record of all administrative actions and changes')
      ),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, filtered.length + ' entries'),
        h('input', {
          className: 'input', placeholder: 'Filter by action, user, target...',
          style: { width: 260, fontSize: 13 },
          value: filter, onChange: e => setFilter(e.target.value)
        })
      )
    ),
    h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        loading ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading...')
        : filtered.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, filter ? 'No matching entries' : 'No audit entries')
        : h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Time'),
              h('th', null, 'Action'),
              h('th', null, 'User'),
              h('th', null, 'Role'),
              h('th', null, 'Resource'),
              h('th', null, 'IP'),
              h('th', { style: { width: 40 } })
            )),
            h('tbody', null, filtered.map((l, i) =>
              h('tr', {
                key: i,
                style: { cursor: 'pointer' },
                onClick: () => setSelected(l),
                title: 'Click to view details'
              },
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } },
                  l.timestamp ? new Date(l.timestamp).toLocaleString() : '-'
                ),
                h('td', null, h('span', { className: 'badge ' + actionColor(l.action) }, l.action || '-')),
                h('td', { style: { fontSize: 13 } }, actorDisplay(l)),
                h('td', null, actorRole(l) ? h('span', { className: 'badge ' + roleColor(actorRole(l)), style: { fontSize: 10 } }, actorRole(l)) : '-'),
                h('td', { style: { fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  resourceDisplay(l.resource)
                ),
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, l.ip || '-'),
                h('td', null, h('button', { className: 'btn btn-ghost btn-icon', style: { padding: 4, fontSize: 14, color: 'var(--text-muted)' }, onClick: e => { e.stopPropagation(); setSelected(l); } }, '\u203A'))
              )
            ))
          )
      )
    ),

    // ─── Detail Modal ──────────────────────────────
    selected && h(DetailModal, {
      title: 'Audit Entry',
      onClose: () => setSelected(null),
      data: {
        timestamp: selected.timestamp,
        action: selected.action,
        user: actorDisplay(selected),
        role: actorRole(selected),
        actorType: selected.actorType,
        resource: selected.resource,
        ip: selected.ip,
        details: selected.details,
        id: selected.id,
      },
      badge: { label: selected.action, color: selected.action && (selected.action.toLowerCase().includes('delete') || selected.action.toLowerCase().includes('remove')) ? 'var(--danger)' : 'var(--accent)' },
    })
  );
}
