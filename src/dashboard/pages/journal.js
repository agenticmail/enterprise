import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';

export function JournalPage() {
  const { toast } = useApp();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);

  const [agents, setAgents] = useState([]);

  const load = () => {
    engineCall('/journal?orgId=default&limit=50').then(d => { setEntries(d.entries || []); setTotal(d.total || 0); }).catch(() => {});
    engineCall('/journal/stats/default').then(d => setStats(d)).catch(() => {});
    engineCall('/agents?orgId=default').then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(load, []);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  const rollback = async (id) => {
    try { const r = await engineCall('/journal/' + id + '/rollback', { method: 'POST', body: JSON.stringify({}) }); if (r.success) { toast('Action rolled back', 'success'); load(); } else toast('Rollback failed: ' + (r.error || 'Unknown'), 'error'); } catch (e) { toast(e.message, 'error'); }
  };

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', null, 'Action Journal')),
    stats && h('div', { className: 'stat-grid', style: { marginBottom: 16 } },
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.total), h('div', { className: 'stat-label' }, 'Total Actions')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.reversible), h('div', { className: 'stat-label' }, 'Reversible')),
      h('div', { className: 'stat-card' }, h('div', { className: 'stat-value' }, stats.reversed), h('div', { className: 'stat-label' }, 'Rolled Back'))
    ),
    h('div', { className: 'card' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Agent'), h('th', null, 'Tool'), h('th', null, 'Type'), h('th', null, 'Reversible'), h('th', null, 'Status'), h('th', null, 'Actions'))),
        h('tbody', null, entries.length === 0
          ? h('tr', null, h('td', { colSpan: 7, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No journal entries'))
          : entries.map(e => h('tr', { key: e.id },
            h('td', null, new Date(e.createdAt).toLocaleString()),
            h('td', null, renderAgentBadge(e.agentId, agentData)),
            h('td', null, e.toolName || e.toolId),
            h('td', null, h('span', { className: 'badge-tag' }, e.actionType)),
            h('td', null, e.reversible ? '\u2705' : '\u274C'),
            h('td', null, e.reversed ? h('span', { className: 'status-badge status-warning' }, 'Rolled Back') : h('span', { className: 'status-badge status-success' }, 'Active')),
            h('td', null, e.reversible && !e.reversed && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => rollback(e.id) }, I.undo(), ' Rollback'))
          ))
        )
      )
    )
  );
}
