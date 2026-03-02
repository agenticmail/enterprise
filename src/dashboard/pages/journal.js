import { h, useState, useEffect, Fragment, useApp, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';

export function JournalPage() {
  const { toast } = useApp();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);

  const [agents, setAgents] = useState([]);

  const load = () => {
    engineCall('/journal?orgId=' + getOrgId() + '&limit=50').then(d => { setEntries(d.entries || []); setTotal(d.total || 0); }).catch(() => {});
    engineCall('/journal/stats/default').then(d => setStats(d)).catch(() => {});
    engineCall('/agents?orgId=' + getOrgId()).then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(load, []);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  const rollback = async (id) => {
    try { const r = await engineCall('/journal/' + id + '/rollback', { method: 'POST', body: JSON.stringify({}) }); if (r.success) { toast('Action rolled back', 'success'); load(); } else toast('Rollback failed: ' + (r.error || 'Unknown'), 'error'); } catch (e) { toast(e.message, 'error'); }
  };

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'page-inner' },
    h('div', { className: 'page-header' }, h('h1', { style: { display: 'flex', alignItems: 'center' } }, 'Action Journal', h(HelpButton, { label: 'Action Journal' },
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
