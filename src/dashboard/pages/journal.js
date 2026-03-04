import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge, getOrgId , apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

export function JournalPage() {
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
  const { toast } = useApp();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);

  // Pagination, search, filter
  const [page, setPage] = useState(0);
  const [searchQ, setSearchQ] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const PAGE_SIZE = 20;

  const load = () => {
    engineCall('/journal?orgId=' + effectiveOrgId + '&limit=500').then(d => { setEntries(d.entries || []); setTotal(d.total || 0); }).catch(() => {});
    engineCall('/journal/stats/default').then(d => setStats(d)).catch(() => {});
    apiCall('/agents' + (orgCtx.selectedOrgId ? '?clientOrgId=' + orgCtx.selectedOrgId : '')).then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(load, [effectiveOrgId]);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  const rollback = async (id) => {
    try { const r = await engineCall('/journal/' + id + '/rollback', { method: 'POST', body: JSON.stringify({}) }); if (r.success) { toast('Action rolled back', 'success'); load(); } else toast('Rollback failed: ' + (r.error || 'Unknown'), 'error'); } catch (e) { toast(e.message, 'error'); }
  };

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'page-inner' },
    h(orgCtx.Switcher),
    h('div', { className: 'page-header' }, h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Action Journal', h(KnowledgeLink, { page: 'journal' }), h(HelpButton, { label: 'Action Journal' },
      h('p', null, 'A tamper-proof log of every action agents have taken. Think of it as an audit trail — every tool call, every side effect, recorded with full context.'),
      h('h4', { style: _h4 }, 'Why it matters'),
      h('ul', { style: _ul },
        h('li', null, h('strong', null, 'Accountability'), ' — Know exactly what each agent did and when.'),
        h('li', null, h('strong', null, 'Rollback'), ' — Reverse actions that were mistakes or caused issues.'),
        h('li', null, h('strong', null, 'Compliance'), ' — Maintain a full audit trail for regulatory needs.')
      ),
      h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use the Rollback button on reversible actions to undo agent mistakes without manual intervention.')
    ))),
    stats && h('div', { className: 'stat-grid', style: { marginBottom: 16 } },
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.total), h('div', { className: 'stat-label', style: { display: 'flex', alignItems: 'center' } }, 'Total Actions', h(HelpButton, { label: 'Total Actions' },
        h('p', null, 'The total number of tool calls and side effects recorded across all agents.')
      ))),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.reversible), h('div', { className: 'stat-label', style: { display: 'flex', alignItems: 'center' } }, 'Reversible', h(HelpButton, { label: 'Reversible' },
        h('p', null, 'Actions that can be undone (rolled back). Not all actions are reversible — for example, sent emails cannot be unsent.')
      ))),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.reversed), h('div', { className: 'stat-label', style: { display: 'flex', alignItems: 'center' } }, 'Rolled Back', h(HelpButton, { label: 'Rolled Back' },
        h('p', null, 'Actions that have been reversed by an admin. A high number may indicate agents need tighter permissions or better instructions.')
      )))
    ),
    // Filter bar
    h('div', { style: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
      h('input', {
        type: 'text', placeholder: 'Search tool name...',
        value: searchQ, onInput: e => { setSearchQ(e.target.value); setPage(0); },
        style: { flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, minWidth: 180, outline: 'none' }
      }),
      h('select', {
        value: filterAgent, onChange: e => { setFilterAgent(e.target.value); setPage(0); },
        style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }
      },
        h('option', { value: '' }, 'All Agents'),
        agents.map(a => h('option', { key: a.id, value: a.id }, a.config && a.config.identity && a.config.identity.name || a.config && a.config.displayName || a.name || a.id))
      ),
      h('select', {
        value: filterType, onChange: e => { setFilterType(e.target.value); setPage(0); },
        style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }
      },
        h('option', { value: '' }, 'All Types'),
        [...new Set(entries.map(e => e.actionType).filter(Boolean))].sort().map(t => h('option', { key: t, value: t }, t))
      ),
      h('select', {
        value: filterStatus, onChange: e => { setFilterStatus(e.target.value); setPage(0); },
        style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }
      },
        h('option', { value: '' }, 'All Statuses'),
        h('option', { value: 'active' }, 'Active'),
        h('option', { value: 'rolled_back' }, 'Rolled Back')
      )
    ),

    (() => {
      var filtered = entries;
      if (searchQ) { var s = searchQ.toLowerCase(); filtered = filtered.filter(e => (e.toolName || e.toolId || '').toLowerCase().includes(s)); }
      if (filterAgent) filtered = filtered.filter(e => e.agentId === filterAgent);
      if (filterType) filtered = filtered.filter(e => e.actionType === filterType);
      if (filterStatus === 'active') filtered = filtered.filter(e => !e.reversed);
      if (filterStatus === 'rolled_back') filtered = filtered.filter(e => e.reversed);
      var totalFiltered = filtered.length;
      var totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
      var paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      return h(Fragment, null,
        h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 } }, totalFiltered + ' entr' + (totalFiltered !== 1 ? 'ies' : 'y')),
        h('div', { className: 'card' },
          h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Agent'), h('th', null, 'Tool'), h('th', null, 'Type'), h('th', null, 'Reversible'), h('th', null, 'Status'), h('th', null, 'Actions'))),
            h('tbody', null, paged.length === 0
              ? h('tr', null, h('td', { colSpan: 7, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, searchQ || filterAgent || filterType || filterStatus ? 'No matching entries' : 'No journal entries'))
              : paged.map(e => h('tr', { key: e.id },
                h('td', null, new Date(e.createdAt).toLocaleString()),
                h('td', null, renderAgentBadge(e.agentId, agentData)),
                h('td', null, e.toolName || e.toolId),
                h('td', null, h('span', { className: 'badge-tag' }, e.actionType)),
                h('td', null, e.reversible ? I.check() : E.cross()),
                h('td', null, e.reversed ? h('span', { className: 'status-badge status-warning' }, 'Rolled Back') : h('span', { className: 'status-badge status-success' }, 'Active')),
                h('td', null, e.reversible && !e.reversed && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => rollback(e.id) }, I.undo(), ' Rollback'))
              ))
            )
          )
        ),
        totalPages > 1 && h('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', fontSize: 13, color: 'var(--text-muted)' }
        },
          h('span', null, 'Showing ' + (page * PAGE_SIZE + 1) + '-' + Math.min((page + 1) * PAGE_SIZE, totalFiltered) + ' of ' + totalFiltered),
          h('div', { style: { display: 'flex', gap: 4 } },
            h('button', { onClick: () => setPage(p => Math.max(0, p - 1)), disabled: page === 0, className: 'btn btn-ghost btn-sm' }, '\u2039 Prev'),
            h('span', { style: { padding: '4px 8px', fontSize: 12 } }, (page + 1) + ' / ' + totalPages),
            h('button', { onClick: () => setPage(p => Math.min(totalPages - 1, p + 1)), disabled: page >= totalPages - 1, className: 'btn btn-ghost btn-sm' }, 'Next \u203A')
          )
        )
      );
    })()
  );
}
