import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { DetailModal } from '../../components/modal.js';
import { HelpButton } from '../../components/help-button.js';

// --- ActivitySection ------------------------------------------------

export function ActivitySection(props) {
  var agentId = props.agentId;
  var app = useApp();
  var toast = app.toast;

  var _tab = useState('events');
  var activeTab = _tab[0]; var setActiveTab = _tab[1];

  var _events = useState([]);
  var events = _events[0]; var setEvents = _events[1];
  var _toolCalls = useState([]);
  var toolCalls = _toolCalls[0]; var setToolCalls = _toolCalls[1];
  var _journal = useState([]);
  var journalEntries = _journal[0]; var setJournalEntries = _journal[1];
  var _loading = useState(false);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _selectedItem = useState(null);
  var selectedItem = _selectedItem[0]; var setSelectedItem = _selectedItem[1];

  // Filtering
  var _typeFilter = useState('');
  var typeFilter = _typeFilter[0]; var setTypeFilter = _typeFilter[1];
  var _searchFilter = useState('');
  var searchFilter = _searchFilter[0]; var setSearchFilter = _searchFilter[1];
  var _dateFrom = useState('');
  var dateFrom = _dateFrom[0]; var setDateFrom = _dateFrom[1];
  var _dateTo = useState('');
  var dateTo = _dateTo[0]; var setDateTo = _dateTo[1];

  // Pagination
  var PAGE_SIZE = 25;
  var _page = useState(1);
  var page = _page[0]; var setPage = _page[1];

  var loadEvents = function() {
    engineCall('/activity/events?agentId=' + agentId + '&limit=200')
      .then(function(d) { setEvents(d.events || []); })
      .catch(function() {});
  };
  var loadToolCalls = function() {
    engineCall('/activity/tool-calls?agentId=' + agentId + '&limit=200')
      .then(function(d) { setToolCalls(d.toolCalls || []); })
      .catch(function() {});
  };
  var loadJournal = function() {
    engineCall('/journal?agentId=' + agentId + '&orgId=' + getOrgId() + '&limit=200')
      .then(function(d) { setJournalEntries(d.entries || []); })
      .catch(function() {});
  };

  var loadAll = function() {
    setLoading(true);
    Promise.all([
      engineCall('/activity/events?agentId=' + agentId + '&limit=200').then(function(d) { setEvents(d.events || []); }).catch(function() {}),
      engineCall('/activity/tool-calls?agentId=' + agentId + '&limit=200').then(function(d) { setToolCalls(d.toolCalls || []); }).catch(function() {}),
      engineCall('/journal?agentId=' + agentId + '&orgId=' + getOrgId() + '&limit=200').then(function(d) { setJournalEntries(d.entries || []); }).catch(function() {}),
    ]).then(function() { setLoading(false); }).catch(function() { setLoading(false); });
  };

  useEffect(loadAll, []);

  // Reset page when filters change
  useEffect(function() { setPage(1); }, [typeFilter, searchFilter, dateFrom, dateTo, activeTab]);

  var rollback = function(id) {
    showConfirm({ title: 'Rollback Action', message: 'Reverse this journal entry?', warning: true, confirmText: 'Rollback' }).then(function(ok) {
      if (!ok) return;
      engineCall('/journal/' + id + '/rollback', { method: 'POST', body: JSON.stringify({}) })
        .then(function(r) { if (r.success) { toast('Rolled back', 'success'); loadJournal(); } else toast('Failed: ' + (r.error || ''), 'error'); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var refreshCurrent = function() {
    if (activeTab === 'events') loadEvents();
    else if (activeTab === 'tools') loadToolCalls();
    else if (activeTab === 'journal') loadJournal();
  };

  // Filter helper
  var filterItems = function(items) {
    var filtered = items;
    if (typeFilter) {
      filtered = filtered.filter(function(item) {
        var t = (item.type || item.eventType || item.tool || item.toolName || item.actionType || '').toLowerCase();
        return t.includes(typeFilter.toLowerCase());
      });
    }
    if (searchFilter) {
      var q = searchFilter.toLowerCase();
      filtered = filtered.filter(function(item) {
        var text = JSON.stringify(item).toLowerCase();
        return text.includes(q);
      });
    }
    if (dateFrom) {
      var fromTs = new Date(dateFrom).getTime();
      filtered = filtered.filter(function(item) {
        var ts = new Date(item.timestamp || item.createdAt).getTime();
        return ts >= fromTs;
      });
    }
    if (dateTo) {
      var toTs = new Date(dateTo + 'T23:59:59').getTime();
      filtered = filtered.filter(function(item) {
        var ts = new Date(item.timestamp || item.createdAt).getTime();
        return ts <= toTs;
      });
    }
    return filtered;
  };

  // Get current data source
  var currentItems = activeTab === 'events' ? events : activeTab === 'tools' ? toolCalls : journalEntries;
  var filtered = filterItems(currentItems);
  var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Extract unique types for filter dropdown
  var uniqueTypes = [];
  var typeSet = {};
  currentItems.forEach(function(item) {
    var t = item.type || item.eventType || item.tool || item.toolName || item.actionType || '';
    if (t && !typeSet[t]) { typeSet[t] = true; uniqueTypes.push(t); }
  });
  uniqueTypes.sort();

  var filterBarStyle = { display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' };
  var filterInputStyle = { padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Activity',
        h(HelpButton, { label: 'Agent Activity Log' },
          h('p', null, 'A chronological log of everything this agent has done — conversations, tasks completed, emails sent, tools used, errors encountered, and guardrail interventions.'),
          h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Event Types'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Message'), ' — Chat messages sent or received.'),
            h('li', null, h('strong', null, 'Task'), ' — Tasks started, completed, or failed.'),
            h('li', null, h('strong', null, 'Tool Use'), ' — External tools or APIs the agent called.'),
            h('li', null, h('strong', null, 'Error'), ' — Failures, timeouts, or API errors.'),
            h('li', null, h('strong', null, 'Guardrail'), ' — Policy violations or interventions.'),
            h('li', null, h('strong', null, 'System'), ' — Deploy, restart, config changes.')
          ),
          h('p', null, 'Click on any event to see full details including request/response data.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Use filters to narrow down to specific event types. If debugging an issue, start with "Error" events.')
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, filtered.length + ' items'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: refreshCurrent }, I.refresh())
      )
    ),
    h('div', { style: { borderBottom: '1px solid var(--border)' } },
      h('div', { className: 'tabs', style: { padding: '0 16px' } },
        h('div', { className: 'tab' + (activeTab === 'events' ? ' active' : ''), onClick: function() { setActiveTab('events'); } }, 'Events (' + events.length + ')'),
        h('div', { className: 'tab' + (activeTab === 'tools' ? ' active' : ''), onClick: function() { setActiveTab('tools'); } }, 'Tool Calls (' + toolCalls.length + ')'),
        h('div', { className: 'tab' + (activeTab === 'journal' ? ' active' : ''), onClick: function() { setActiveTab('journal'); } }, 'Journal (' + journalEntries.length + ')')
      )
    ),

    // Filter bar
    h('div', { style: filterBarStyle },
      h('select', { style: Object.assign({}, filterInputStyle, { width: 140 }), value: typeFilter, onChange: function(e) { setTypeFilter(e.target.value); } },
        h('option', { value: '' }, 'All types'),
        uniqueTypes.map(function(t) { return h('option', { key: t, value: t }, t); })
      ),
      h('input', { style: Object.assign({}, filterInputStyle, { width: 180 }), type: 'text', placeholder: 'Search...', value: searchFilter, onChange: function(e) { setSearchFilter(e.target.value); } }),
      h('input', { style: Object.assign({}, filterInputStyle, { width: 130 }), type: 'date', value: dateFrom, onChange: function(e) { setDateFrom(e.target.value); }, title: 'From date' }),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'to'),
      h('input', { style: Object.assign({}, filterInputStyle, { width: 130 }), type: 'date', value: dateTo, onChange: function(e) { setDateTo(e.target.value); }, title: 'To date' }),
      (typeFilter || searchFilter || dateFrom || dateTo) && h('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 11 }, onClick: function() { setTypeFilter(''); setSearchFilter(''); setDateFrom(''); setDateTo(''); } }, 'Clear')
    ),

    h('div', { className: 'card-body-flush' },

      // Events Tab
      activeTab === 'events' && (
        paged.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, filtered.length === 0 && events.length > 0 ? 'No events match filters' : 'No events recorded')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Time'), h('th', null, 'Type'), h('th', null, 'Details'))
              ),
              h('tbody', null,
                paged.map(function(ev, i) {
                  var details = typeof ev.data === 'object' ? JSON.stringify(ev.data) : (ev.details || ev.data || '-');
                  return h('tr', { key: ev.id || i, onClick: function() { setSelectedItem(ev); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(ev.timestamp || ev.createdAt).toLocaleString()),
                    h('td', null, h('span', { className: 'badge badge-info' }, ev.type || ev.eventType || '-')),
                    h('td', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' } }, details)
                  );
                })
              )
            )
      ),

      // Tool Calls Tab
      activeTab === 'tools' && (
        paged.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, filtered.length === 0 && toolCalls.length > 0 ? 'No tool calls match filters' : 'No tool calls recorded')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Time'), h('th', null, 'Tool'), h('th', null, 'Duration'), h('th', null, 'Status'))
              ),
              h('tbody', null,
                paged.map(function(tc, i) {
                  var statusClass = tc.success === true ? 'badge badge-success' : tc.success === false ? 'badge badge-danger' : 'badge badge-neutral';
                  var statusLabel = tc.success === true ? 'OK' : tc.success === false ? 'Failed' : (tc.status || 'Pending');
                  return h('tr', { key: tc.id || i, onClick: function() { setSelectedItem(tc); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(tc.timestamp || tc.createdAt).toLocaleString()),
                    h('td', null, h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, tc.tool || tc.toolName || '-')),
                    h('td', null, tc.durationMs ? tc.durationMs + 'ms' : '-'),
                    h('td', null, h('span', { className: statusClass }, statusLabel))
                  );
                })
              )
            )
      ),

      // Journal Tab
      activeTab === 'journal' && (
        paged.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, filtered.length === 0 && journalEntries.length > 0 ? 'No journal entries match filters' : 'No journal entries')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Time'), h('th', null, 'Tool'), h('th', null, 'Action Type'), h('th', null, 'Reversible'), h('th', null, 'Status'), h('th', null, 'Actions'))
              ),
              h('tbody', null,
                paged.map(function(e) {
                  return h('tr', { key: e.id, onClick: function(evt) { if (evt.target.tagName === 'BUTTON' || evt.target.closest('button')) return; setSelectedItem(e); }, style: { cursor: 'pointer' } },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(e.createdAt).toLocaleString()),
                    h('td', null, e.toolName || e.toolId || '-'),
                    h('td', null, h('span', { className: 'badge-tag' }, e.actionType || '-')),
                    h('td', null, e.reversible ? '\u2705' : '\u274C'),
                    h('td', null, e.reversed ? h('span', { className: 'status-badge status-warning' }, 'Rolled Back') : h('span', { className: 'status-badge status-success' }, 'Active')),
                    h('td', null, e.reversible && !e.reversed && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { rollback(e.id); } }, I.undo(), ' Rollback'))
                  );
                })
              )
            )
      ),

      // Pagination
      totalPages > 1 && h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--border)' } },
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(1); }, style: { fontSize: 11 } }, '«'),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(page - 1); }, style: { fontSize: 11 } }, '‹'),
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 80, textAlign: 'center' } }, 'Page ' + page + ' / ' + totalPages),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(page + 1); }, style: { fontSize: 11 } }, '›'),
        h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(totalPages); }, style: { fontSize: 11 } }, '»')
      )
    ),

    // Detail Modal
    selectedItem && (function() {
      var item = selectedItem;
      var typeLabel = item.type || item.eventType || item.tool || item.toolName || item.actionType || 'Detail';
      var typeColor = typeLabel === 'error' ? 'var(--danger)' : typeLabel === 'deployed' || typeLabel === 'started' ? 'var(--success)' : typeLabel === 'stopped' ? 'var(--warning)' : 'var(--accent)';
      return h(DetailModal, {
        title: activeTab === 'events' ? 'Event Detail' : activeTab === 'tools' ? 'Tool Call Detail' : 'Journal Entry Detail',
        onClose: function() { setSelectedItem(null); },
        badge: { label: typeLabel, color: typeColor },
        data: item,
        exclude: ['agentId']
      });
    })()
  );
}

