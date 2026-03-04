import { h, useState, useEffect, useCallback, Fragment, engineCall, buildAgentDataMap, renderAgentBadge, getOrgId } from '../components/utils.js';
import { DetailModal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';
import { useOrgContext } from '../components/org-switcher.js';

const PAGE_SIZE = 25;

export function ActivityPage() {
  const orgCtx = useOrgContext();
  const effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
  const [tab, setTab] = useState('events');
  const [agents, setAgents] = useState([]);

  // Events state
  const [events, setEvents] = useState([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsAgent, setEventsAgent] = useState('');
  const [eventsType, setEventsType] = useState('');
  const [eventsLoading, setEventsLoading] = useState(false);

  // Tool calls state
  const [toolCalls, setToolCalls] = useState([]);
  const [toolsTotal, setToolsTotal] = useState(0);
  const [toolsPage, setToolsPage] = useState(0);
  const [toolsSearch, setToolsSearch] = useState('');
  const [toolsAgent, setToolsAgent] = useState('');
  const [toolsLoading, setToolsLoading] = useState(false);

  // Event types for filter
  const [eventTypes, setEventTypes] = useState([]);
  // Detail modal
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    engineCall('/agents?orgId=' + effectiveOrgId).then(d => setAgents(d.agents || [])).catch(() => {});
  }, [effectiveOrgId]);

  const agentData = buildAgentDataMap(agents);

  // Fetch events
  const fetchEvents = useCallback(() => {
    setEventsLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(eventsPage * PAGE_SIZE),
      orgId: effectiveOrgId,
    });
    if (eventsSearch) params.set('search', eventsSearch);
    if (eventsAgent) params.set('agentId', eventsAgent);
    if (eventsType) params.set('type', eventsType);
    engineCall('/activity/events?' + params).then(d => {
      setEvents(d.events || []);
      setEventsTotal(d.total || 0);
      // Collect unique types for filter dropdown
      if (!eventsType && eventsPage === 0 && !eventsSearch) {
        const types = [...new Set((d.events || []).map(e => e.type).filter(Boolean))];
        if (types.length > eventTypes.length) setEventTypes(types);
      }
    }).catch(() => {}).finally(() => setEventsLoading(false));
  }, [eventsPage, eventsSearch, eventsAgent, eventsType, effectiveOrgId]);

  // Fetch tool calls
  const fetchTools = useCallback(() => {
    setToolsLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(toolsPage * PAGE_SIZE),
      orgId: effectiveOrgId,
    });
    if (toolsSearch) params.set('search', toolsSearch);
    if (toolsAgent) params.set('agentId', toolsAgent);
    engineCall('/activity/tool-calls?' + params).then(d => {
      setToolCalls(d.toolCalls || []);
      setToolsTotal(d.total || 0);
    }).catch(() => {}).finally(() => setToolsLoading(false));
  }, [toolsPage, toolsSearch, toolsAgent, effectiveOrgId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchTools(); }, [fetchTools]);

  // Also fetch all event types on mount/org change for filter
  useEffect(() => {
    engineCall('/activity/events?limit=500&orgId=' + effectiveOrgId).then(d => {
      const types = [...new Set((d.events || []).map(e => e.type).filter(Boolean))];
      setEventTypes(types.sort());
    }).catch(() => {});
  }, [effectiveOrgId]);

  const eventsPages = Math.ceil(eventsTotal / PAGE_SIZE);
  const toolsPages = Math.ceil(toolsTotal / PAGE_SIZE);

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h(Fragment, null,
    h(orgCtx.Switcher),
    h('div', { style: { marginBottom: 20 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Activity', h(KnowledgeLink, { page: 'activity' }), h(HelpButton, { label: 'Activity' },
        h('p', null, 'A real-time feed of everything your agents are doing — events they generate and tools they call.'),
        h('h4', { style: _h4 }, 'Two views'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Events'), ' — High-level actions: agent started, stopped, deployed, errored, etc.'),
          h('li', null, h('strong', null, 'Tool Calls'), ' — Granular tool usage: which tool, duration, success/failure, parameters and results.')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use the agent and type filters to zero in on specific behavior. Click any row to see full details.')
      )),
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Real-time activity and tool usage across all agents')
    ),

    h('div', { className: 'tabs' },
      h('div', { className: 'tab' + (tab === 'events' ? ' active' : ''), onClick: () => setTab('events') }, 'Events'),
      h('div', { className: 'tab' + (tab === 'tools' ? ' active' : ''), onClick: () => setTab('tools') }, 'Tool Calls')
    ),

    // ─── Events Tab ───
    tab === 'events' && h(Fragment, null,
      FilterBar({
        search: eventsSearch,
        onSearch: v => { setEventsSearch(v); setEventsPage(0); },
        searchPlaceholder: 'Search events...',
        agents, agentData,
        selectedAgent: eventsAgent,
        onAgentChange: v => { setEventsAgent(v); setEventsPage(0); },
        extraFilter: h('select', {
          value: eventsType,
          onChange: e => { setEventsType(e.target.value); setEventsPage(0); },
          style: selectStyle(),
        },
          h('option', { value: '' }, 'All types'),
          ...eventTypes.map(t => h('option', { key: t, value: t }, t))
        ),
      }),

      h('div', { className: 'card', style: { position: 'relative' } },
        eventsLoading && LoadingOverlay(),
        h('div', { className: 'card-body-flush' },
          events.length === 0
            ? EmptyState(eventsLoading ? 'Loading...' : 'No events found')
            : h('table', null,
                h('thead', null, h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Agent'),
                  h('th', null, 'Details'),
                )),
                h('tbody', null, events.map((ev, i) =>
                  h('tr', { key: i, onClick: () => setSelected({ kind: 'event', item: ev }), style: { cursor: 'pointer' }, title: 'Click to view details' },
                    h('td', { style: cellTime() }, formatTime(ev.timestamp)),
                    h('td', null, h('span', { className: 'badge badge-info' }, ev.type)),
                    h('td', null, renderAgentBadge(ev.agentId, agentData)),
                    h('td', { style: cellDetails() }, formatDetails(ev.data)),
                  )
                ))
              )
        ),
        eventsPages > 1 && Pagination({ page: eventsPage, pages: eventsPages, total: eventsTotal, onPage: setEventsPage }),
      )
    ),

    // ─── Tool Calls Tab ───
    tab === 'tools' && h(Fragment, null,
      FilterBar({
        search: toolsSearch,
        onSearch: v => { setToolsSearch(v); setToolsPage(0); },
        searchPlaceholder: 'Search tools...',
        agents, agentData,
        selectedAgent: toolsAgent,
        onAgentChange: v => { setToolsAgent(v); setToolsPage(0); },
      }),

      h('div', { className: 'card', style: { position: 'relative' } },
        toolsLoading && LoadingOverlay(),
        h('div', { className: 'card-body-flush' },
          toolCalls.length === 0
            ? EmptyState(toolsLoading ? 'Loading...' : 'No tool calls found')
            : h('table', null,
                h('thead', null, h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Tool'),
                  h('th', null, 'Agent'),
                  h('th', null, 'Duration'),
                  h('th', null, 'Status'),
                )),
                h('tbody', null, toolCalls.map((tc, i) =>
                  h('tr', { key: i, onClick: () => setSelected({ kind: 'tool', item: tc }), style: { cursor: 'pointer' }, title: 'Click to view details' },
                    h('td', { style: cellTime() }, formatTime(tc.timestamp || tc.timing?.startedAt)),
                    h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, tc.tool || tc.toolId)),
                    h('td', null, renderAgentBadge(tc.agentId, agentData)),
                    h('td', null, tc.durationMs ? tc.durationMs + 'ms' : tc.timing?.durationMs ? tc.timing.durationMs + 'ms' : '-'),
                    h('td', null, h('span', { className: 'badge badge-' + (tc.success !== false ? 'success' : 'danger') }, tc.success !== false ? 'ok' : 'fail')),
                  )
                ))
              )
        ),
        toolsPages > 1 && Pagination({ page: toolsPage, pages: toolsPages, total: toolsTotal, onPage: setToolsPage }),
      )
    ),

    // ─── Detail Modal ───
    selected && selected.kind === 'event' && h(DetailModal, {
      title: 'Event Details',
      onClose: () => setSelected(null),
      data: {
        timestamp: selected.item.timestamp,
        type: selected.item.type,
        agent: agentData[selected.item.agentId]?.name || selected.item.agentId || '-',
        sessionId: selected.item.sessionId || '-',
        ...(typeof selected.item.data === 'object' && selected.item.data !== null ? selected.item.data : { details: selected.item.data || '-' }),
        id: selected.item.id,
      },
      badge: { label: selected.item.type, color: 'var(--accent)' },
    }),

    selected && selected.kind === 'tool' && h(DetailModal, {
      title: 'Tool Call Details',
      onClose: () => setSelected(null),
      data: {
        timestamp: selected.item.timestamp || selected.item.timing?.startedAt,
        tool: selected.item.tool || selected.item.toolName || selected.item.toolId,
        agent: agentData[selected.item.agentId]?.name || selected.item.agentId || '-',
        status: (selected.item.success !== false && selected.item.result?.success !== false) ? 'Success' : 'Failed',
        duration: (selected.item.durationMs || selected.item.timing?.durationMs || '-') + (selected.item.durationMs || selected.item.timing?.durationMs ? 'ms' : ''),
        sessionId: selected.item.sessionId || '-',
        parameters: selected.item.parameters || '-',
        result: selected.item.result || '-',
        error: selected.item.result?.error || selected.item.error || undefined,
        id: selected.item.id,
      },
      badge: {
        label: (selected.item.success !== false && selected.item.result?.success !== false) ? 'Success' : 'Failed',
        color: (selected.item.success !== false && selected.item.result?.success !== false) ? 'var(--success)' : 'var(--danger)',
      },
    }),
  );
}

// ─── Sub-components ───

function FilterBar({ search, onSearch, searchPlaceholder, agents, agentData, selectedAgent, onAgentChange, extraFilter }) {
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = { current: null };

  const handleSearch = (v) => {
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(v), 300);
  };

  return h('div', { style: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
    h('input', {
      type: 'text',
      placeholder: searchPlaceholder,
      value: searchInput,
      onInput: e => handleSearch(e.target.value),
      style: {
        flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, minWidth: 180,
        outline: 'none',
      },
    }),
    h('select', {
      value: selectedAgent,
      onChange: e => onAgentChange(e.target.value),
      style: selectStyle(),
    },
      h('option', { value: '' }, 'All agents'),
      ...agents.map(a => h('option', { key: a.id, value: a.id }, a.config?.identity?.name || a.config?.displayName || a.config?.name || a.name || a.id))
    ),
    extraFilter || null,
  );
}

function Pagination({ page, pages, total, onPage }) {
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  // Build page buttons — show max 7
  const btns = [];
  const maxBtns = 7;
  let startPage = Math.max(0, page - Math.floor(maxBtns / 2));
  let endPage = Math.min(pages, startPage + maxBtns);
  if (endPage - startPage < maxBtns) startPage = Math.max(0, endPage - maxBtns);

  for (let i = startPage; i < endPage; i++) btns.push(i);

  return h('div', {
    style: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13,
      color: 'var(--text-muted)', flexWrap: 'wrap', gap: 8,
    }
  },
    h('span', null, `Showing ${start}-${end} of ${total.toLocaleString()}`),
    h('div', { style: { display: 'flex', gap: 4 } },
      h('button', {
        onClick: () => onPage(0), disabled: page === 0,
        style: pgBtnStyle(false),
      }, '\u00AB'),
      h('button', {
        onClick: () => onPage(page - 1), disabled: page === 0,
        style: pgBtnStyle(false),
      }, '\u2039'),
      ...btns.map(i => h('button', {
        key: i, onClick: () => onPage(i),
        style: pgBtnStyle(i === page),
      }, String(i + 1))),
      h('button', {
        onClick: () => onPage(page + 1), disabled: page >= pages - 1,
        style: pgBtnStyle(false),
      }, '\u203A'),
      h('button', {
        onClick: () => onPage(pages - 1), disabled: page >= pages - 1,
        style: pgBtnStyle(false),
      }, '\u00BB'),
    )
  );
}

function LoadingOverlay() {
  return h('div', {
    style: {
      position: 'absolute', inset: 0, background: 'rgba(var(--bg-card-rgb, 30,30,30),0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 12,
    }
  }, h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Loading...'));
}

function EmptyState(msg) {
  return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, msg);
}

// ─── Helpers ───

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDetails(data) {
  if (!data) return '-';
  if (typeof data === 'string') return data;
  const str = JSON.stringify(data);
  return str.length > 120 ? str.slice(0, 120) + '...' : str;
}

function selectStyle() {
  return {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13,
    cursor: 'pointer', outline: 'none', minWidth: 120,
  };
}

function cellTime() {
  return { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' };
}

function cellDetails() {
  return { fontSize: 12, color: 'var(--text-secondary)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

function pgBtnStyle(active) {
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text)',
    cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
    opacity: 1, minWidth: 32, textAlign: 'center',
  };
}
