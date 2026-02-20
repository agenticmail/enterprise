import { h, useState, useEffect, Fragment, useApp, engineCall, showConfirm, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge } from '../components/utils.js';
import { I } from '../components/icons.js';

export function ApprovalsPage() {
  const { toast } = useApp();
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('pending');

  const [agents, setAgents] = useState([]);

  const load = () => {
    engineCall('/approvals/pending').then(d => setPending(d.requests || [])).catch(() => {});
    engineCall('/approvals/history?limit=50').then(d => setHistory(d.requests || [])).catch(() => {});
    engineCall('/agents?orgId=default').then(d => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  const decide = async (id, decision, reason) => {
    try {
      await engineCall('/approvals/' + id + '/decide', { method: 'POST', body: JSON.stringify({ decision, decidedBy: 'admin', reason }) });
      toast(decision === 'approved' ? 'Approved' : 'Rejected', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return h(Fragment, null,
    h('div', { style: { marginBottom: 20 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Approvals'),
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Review and approve agent actions that require human oversight')
    ),
    h('div', { className: 'tabs' },
      h('div', { className: 'tab' + (tab === 'pending' ? ' active' : ''), onClick: () => setTab('pending') }, 'Pending', pending.length > 0 && h('span', { className: 'badge', style: { marginLeft: 6, background: 'var(--danger)', color: 'white', fontSize: 10, padding: '1px 6px', borderRadius: 10 } }, pending.length)),
      h('div', { className: 'tab' + (tab === 'history' ? ' active' : ''), onClick: () => setTab('history') }, 'History')
    ),
    tab === 'pending' && (pending.length === 0
      ? h('div', { className: 'card' }, h('div', { className: 'card-body' }, h('div', { className: 'empty-state' }, I.approvals(), h('h3', null, 'No pending approvals'), h('p', null, 'When agents need approval for sensitive actions, they\'ll appear here.'))))
      : pending.map(r =>
          h('div', { key: r.id, className: 'card', style: { marginBottom: 12 } },
            h('div', { className: 'card-body' },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                h('div', null,
                  h('h4', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, r.type),
                  h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 } }, r.description || JSON.stringify(r.context)),
                  h('div', { style: { display: 'flex', gap: 6 } },
                    renderAgentBadge(r.agentId, agentData),
                    h('span', { className: 'badge badge-warning' }, r.riskLevel || 'medium')
                  )
                ),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', { className: 'btn btn-primary btn-sm', onClick: () => decide(r.id, 'approved') }, I.check(), ' Approve'),
                  h('button', { className: 'btn btn-danger btn-sm', onClick: async () => { const ok = await showConfirm({ title: 'Reject Request', message: 'Reject this approval request?', danger: true, confirmText: 'Reject' }); if (ok) decide(r.id, 'rejected', ''); } }, I.x(), ' Reject')
                )
              )
            )
          )
        )
    ),
    tab === 'history' && h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        history.length === 0
          ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No approval history')
          : h('table', null,
              h('thead', null, h('tr', null, h('th', null, 'Type'), h('th', null, 'Agent'), h('th', null, 'Decision'), h('th', null, 'By'), h('th', null, 'Date'))),
              h('tbody', null, history.map(r =>
                h('tr', { key: r.id },
                  h('td', null, r.type),
                  h('td', null, renderAgentBadge(r.agentId, agentData)),
                  h('td', null, h('span', { className: 'badge badge-' + (r.decision === 'approved' ? 'success' : 'danger') }, r.decision)),
                  h('td', null, r.decidedBy || '-'),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, r.decidedAt ? new Date(r.decidedAt).toLocaleString() : '-')
                )
              ))
            )
      )
    )
  );
}
