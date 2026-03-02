import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { DetailModal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

var PAGE_SIZE = 50;

export function AuditPage() {
  var [logs, setLogs] = useState([]);
  var [loading, setLoading] = useState(true);
  var [selected, setSelected] = useState(null);
  var [filter, setFilter] = useState('');
  var [page, setPage] = useState(0);
  var [total, setTotal] = useState(0);
  var [hasMore, setHasMore] = useState(false);

  var loadPage = useCallback(function(p) {
    setLoading(true);
    var offset = p * PAGE_SIZE;
    apiCall('/audit?limit=' + PAGE_SIZE + '&offset=' + offset)
      .then(function(d) {
        var arr = d.events || d.entries || d.logs || d;
        arr = Array.isArray(arr) ? arr : [];
        setLogs(arr);
        setTotal(d.total || arr.length);
        setHasMore(arr.length >= PAGE_SIZE);
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }, []);

  useEffect(function() { loadPage(0); }, []);

  var goPage = function(p) { setPage(p); loadPage(p); };

  var actorDisplay = function(l) {
    if (l.details && l.details.email) return l.details.email;
    if (l.actorType === 'system') return 'System';
    return l.actor || l.userId || l.user || '-';
  };

  var actorRole = function(l) {
    if (l.details && l.details.role) return l.details.role;
    return l.actorType || null;
  };

  var filtered = filter
    ? logs.filter(function(l) {
        var s = filter.toLowerCase();
        return (l.action || '').toLowerCase().includes(s)
          || actorDisplay(l).toLowerCase().includes(s)
          || (l.resource || '').toLowerCase().includes(s)
          || (typeof l.details === 'object' && JSON.stringify(l.details).toLowerCase().includes(s));
      })
    : logs;

  var actionColor = function(action) {
    if (!action) return 'badge-neutral';
    var a = action.toLowerCase();
    if (a.includes('create') || a.includes('add')) return 'badge-success';
    if (a.includes('delete') || a.includes('remove') || a.includes('revoke')) return 'badge-danger';
    if (a.includes('update') || a.includes('edit') || a.includes('patch')) return 'badge-warning';
    if (a.includes('login') || a.includes('auth')) return 'badge-info';
    return 'badge-neutral';
  };

  var roleColor = function(role) {
    if (!role) return 'badge-neutral';
    if (role === 'owner') return 'badge-danger';
    if (role === 'admin') return 'badge-warning';
    if (role === 'system') return 'badge-info';
    return 'badge-neutral';
  };

  var resourceDisplay = function(r) {
    if (!r) return '-';
    return r.replace(/^\/api\//, '').replace(/^\//, '');
  };

  var totalPages = Math.max(1, Math.ceil((total || (hasMore ? (page + 2) * PAGE_SIZE : (page + 1) * PAGE_SIZE)) / PAGE_SIZE));

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Audit Log', h(HelpButton, { label: 'Audit Log' },
          h('p', null, 'A tamper-evident record of every administrative action performed in your organization. Essential for security investigations, compliance audits, and change tracking.'),
          h('h4', { style: _h4 }, 'What gets logged'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'User actions'), ' — logins, role changes, user creation/deletion.'),
            h('li', null, h('strong', null, 'Agent changes'), ' — configuration updates, deployments, pauses, kills.'),
            h('li', null, h('strong', null, 'Policy updates'), ' — guardrail rule changes, DLP rule modifications.'),
            h('li', null, h('strong', null, 'System events'), ' — automated interventions, scheduled tasks.')
          ),
          h('h4', { style: _h4 }, 'Color coding'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Green'), ' — Create/add actions.'),
            h('li', null, h('strong', null, 'Red'), ' — Delete/remove/revoke actions.'),
            h('li', null, h('strong', null, 'Yellow'), ' — Update/edit actions.'),
            h('li', null, h('strong', null, 'Blue'), ' — Login/auth actions.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use the filter box to search across actions, users, and targets. Click any row to see full details including IP address and metadata.')
        )),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Complete record of all administrative actions and changes')
      ),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        total > 0 && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, total + ' total'),
        h('input', {
          className: 'input', placeholder: 'Filter by action, user, target...',
          style: { width: 260, fontSize: 13 },
          value: filter, onChange: function(e) { setFilter(e.target.value); }
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
            h('tbody', null, filtered.map(function(l, i) {
              return h('tr', {
                key: i,
                style: { cursor: 'pointer' },
                onClick: function() { setSelected(l); },
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
                h('td', null, h('button', { className: 'btn btn-ghost btn-icon', style: { padding: 4, fontSize: 14, color: 'var(--text-muted)' }, onClick: function(e) { e.stopPropagation(); setSelected(l); } }, '\u203A'))
              );
            }))
          )
      ),

      // Pagination
      (hasMore || page > 0) && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13 } },
        h('span', { style: { color: 'var(--text-muted)' } },
          'Showing ' + (page * PAGE_SIZE + 1) + '–' + (page * PAGE_SIZE + filtered.length) + (total ? ' of ' + total : '')
        ),
        h('div', { style: { display: 'flex', gap: 4 } },
          h('button', {
            className: 'btn btn-secondary btn-sm',
            disabled: page === 0,
            onClick: function() { goPage(page - 1); }
          }, '\u2190 Previous'),
          h('span', { style: { padding: '4px 12px', fontSize: 12, color: 'var(--text-secondary)' } }, 'Page ' + (page + 1)),
          h('button', {
            className: 'btn btn-secondary btn-sm',
            disabled: !hasMore,
            onClick: function() { goPage(page + 1); }
          }, 'Next \u2192')
        )
      )
    ),

    selected && h(DetailModal, {
      title: 'Audit Entry',
      onClose: function() { setSelected(null); },
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
