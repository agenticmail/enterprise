import { h, useState, useEffect, Fragment, engineCall, buildAgentEmailMap, buildAgentDataMap, resolveAgentEmail, renderAgentBadge } from '../components/utils.js';

export function ActivityPage() {
  const [events, setEvents] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);
  const [tab, setTab] = useState('events');

  const [agents, setAgents] = useState([]);

  useEffect(() => {
    engineCall('/activity/events?limit=100').then(d => setEvents(d.events || [])).catch(() => {});
    engineCall('/activity/tool-calls?limit=100').then(d => setToolCalls(d.toolCalls || [])).catch(() => {});
    engineCall('/agents?orgId=default').then(d => setAgents(d.agents || [])).catch(() => {});
  }, []);

  const emailMap = buildAgentEmailMap(agents);
  const agentData = buildAgentDataMap(agents);

  return h(Fragment, null,
    h('div', { style: { marginBottom: 20 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Activity'),
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Real-time activity and tool usage across all agents')
    ),
    h('div', { className: 'tabs' },
      h('div', { className: 'tab' + (tab === 'events' ? ' active' : ''), onClick: () => setTab('events') }, 'Events'),
      h('div', { className: 'tab' + (tab === 'tools' ? ' active' : ''), onClick: () => setTab('tools') }, 'Tool Calls')
    ),
    tab === 'events' && h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        events.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No events recorded')
        : h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Type'), h('th', null, 'Agent'), h('th', null, 'Details'))),
            h('tbody', null, events.map((ev, i) =>
              h('tr', { key: i },
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(ev.timestamp).toLocaleString()),
                h('td', null, h('span', { className: 'badge badge-info' }, ev.type)),
                h('td', null, renderAgentBadge(ev.agentId, agentData)),
                h('td', { style: { fontSize: 12, color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, typeof ev.data === 'object' ? JSON.stringify(ev.data) : ev.data || '-')
              )
            ))
          )
      )
    ),
    tab === 'tools' && h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        toolCalls.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No tool calls recorded')
        : h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Tool'), h('th', null, 'Agent'), h('th', null, 'Duration'), h('th', null, 'Status'))),
            h('tbody', null, toolCalls.map((tc, i) =>
              h('tr', { key: i },
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(tc.timestamp).toLocaleString()),
                h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, tc.tool)),
                h('td', null, renderAgentBadge(tc.agentId, agentData)),
                h('td', null, tc.durationMs ? tc.durationMs + 'ms' : '-'),
                h('td', null, h('span', { className: 'badge badge-' + (tc.success ? 'success' : 'danger') }, tc.success ? 'ok' : 'fail'))
              )
            ))
          )
      )
    )
  );
}
