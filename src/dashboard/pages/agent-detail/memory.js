import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, StatCard, EmptyState, formatTime, MEMORY_CATEGORIES, memCatColor, memCatLabel, importanceBadgeColor } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';

// --- MemorySection --------------------------------------------------

export function MemorySection(props) {
  var agentId = props.agentId;
  var app = useApp();
  var toast = app.toast;

  var _memories = useState([]);
  var memories = _memories[0]; var setMemories = _memories[1];
  var _stats = useState(null);
  var memoryStats = _stats[0]; var setMemoryStats = _stats[1];
  var _search = useState('');
  var searchQuery = _search[0]; var setSearchQuery = _search[1];
  var _filterCat = useState('');
  var filterCategory = _filterCat[0]; var setFilterCategory = _filterCat[1];
  var _filterImp = useState('');
  var filterImportance = _filterImp[0]; var setFilterImportance = _filterImp[1];
  var _dateFrom = useState('');
  var dateFrom = _dateFrom[0]; var setDateFrom = _dateFrom[1];
  var _dateTo = useState('');
  var dateTo = _dateTo[0]; var setDateTo = _dateTo[1];
  var _page = useState(1);
  var page = _page[0]; var setPage = _page[1];
  var _expanded = useState(null);
  var expandedId = _expanded[0]; var setExpandedId = _expanded[1];
  var _showCreate = useState(false);
  var showCreateModal = _showCreate[0]; var setShowCreateModal = _showCreate[1];
  var _form = useState({ title: '', content: '', category: 'org_knowledge', importance: 'normal', tags: '' });
  var createForm = _form[0]; var setCreateForm = _form[1];

  var PAGE_SIZE = 10;

  var MEMORY_CATEGORIES = [
    { value: 'org_knowledge', label: 'Org Knowledge' },
    { value: 'preference', label: 'Preference' },
    { value: 'interaction_pattern', label: 'Interaction Pattern' },
    { value: 'context', label: 'Context' },
    { value: 'skill', label: 'Skill' },
    { value: 'processed_email', label: 'Processed Email' },
    { value: 'procedure', label: 'Procedure' },
    { value: 'relationship', label: 'Relationship' },
    { value: 'reflection', label: 'Reflection' },
    { value: 'domain_expertise', label: 'Domain Expertise' },
    { value: 'error_pattern', label: 'Error Pattern' }
  ];

  var buildQueryParams = function() {
    var params = '?limit=200';
    if (searchQuery) params += '&search=' + encodeURIComponent(searchQuery);
    if (filterCategory) params += '&category=' + filterCategory;
    if (filterImportance) params += '&importance=' + filterImportance;
    return params;
  };

  var loadMemories = function() {
    engineCall('/memory/agent/' + agentId + buildQueryParams())
      .then(function(d) { setMemories(d.memories || []); setPage(1); })
      .catch(function() {});
  };

  var loadStats = function() {
    engineCall('/memory/agent/' + agentId + '/stats')
      .then(function(d) { setMemoryStats(d.stats || d); })
      .catch(function() {});
  };

  var loadAll = function() { loadMemories(); loadStats(); };

  useEffect(function() { loadAll(); }, [agentId]);
  useEffect(function() { loadMemories(); }, [filterCategory, filterImportance]);

  var handleSearch = function() { loadMemories(); };

  var createMemory = function() {
    var body = {
      agentId: agentId,
      title: createForm.title,
      content: createForm.content,
      category: createForm.category,
      importance: createForm.importance,
      tags: createForm.tags ? createForm.tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : []
    };
    engineCall('/memory', { method: 'POST', body: JSON.stringify(body) })
      .then(function() { toast('Memory created', 'success'); setShowCreateModal(false); setCreateForm({ title: '', content: '', category: 'org_knowledge', importance: 'normal', tags: '' }); loadAll(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var deleteMemory = function(id) {
    showConfirm({
      title: 'Delete Memory',
      message: 'Are you sure you want to delete this memory entry? This action cannot be undone.',
      warning: true,
      confirmText: 'Delete'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/' + id, { method: 'DELETE' })
        .then(function() { toast('Memory deleted', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var pruneStale = function() {
    showConfirm({
      title: 'Prune Stale Memories',
      message: 'This will remove expired and stale memory entries for this agent.',
      warning: true,
      confirmText: 'Prune'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/agent/' + agentId + '/prune', { method: 'POST' })
        .then(function(d) { toast('Pruned ' + (d.deleted || 0) + ' entries', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var runDecay = function() {
    showConfirm({
      title: 'Run Confidence Decay',
      message: 'This will reduce confidence of memories not accessed recently. Decay rate: 10%.',
      warning: true,
      confirmText: 'Run Decay'
    }).then(function(confirmed) {
      if (!confirmed) return;
      engineCall('/memory/agent/' + agentId + '/decay', { method: 'POST', body: JSON.stringify({ decayRate: 0.1 }) })
        .then(function(d) { toast('Decayed ' + (d.affected || 0) + ' entries', 'success'); loadAll(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  };

  // Date filter client-side
  var filtered = memories;
  if (dateFrom) {
    var fromTs = new Date(dateFrom).getTime();
    filtered = filtered.filter(function(m) { return m.createdAt && new Date(m.createdAt).getTime() >= fromTs; });
  }
  if (dateTo) {
    var toTs = new Date(dateTo + 'T23:59:59').getTime();
    filtered = filtered.filter(function(m) { return m.createdAt && new Date(m.createdAt).getTime() <= toTs; });
  }

  var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  var totalMemories = memoryStats ? (memoryStats.totalEntries || memoryStats.total || 0) : 0;
  var categoriesUsed = memoryStats && memoryStats.byCategory ? Object.keys(memoryStats.byCategory).length : 0;
  var avgConfidence = memoryStats && memoryStats.avgConfidence != null ? ((memoryStats.avgConfidence * 100).toFixed(0) + '%') : '-';
  var sourcesCount = memoryStats && memoryStats.bySource ? Object.keys(memoryStats.bySource).length : 0;

  var catColor = function(c) {
    var m = { preference: '#8b5cf6', interaction_pattern: '#ec4899', context: '#3b82f6', skill: '#10b981', processed_email: '#6366f1', org_knowledge: '#f59e0b', procedure: '#14b8a6', relationship: '#f43f5e', reflection: '#a855f7', domain_expertise: '#0ea5e9', error_pattern: '#ef4444' };
    return m[c] || '#64748b';
  };
  var impColor = function(i) {
    var m = { critical: '#ef4444', high: '#f43f5e', normal: '#3b82f6', low: '#64748b' };
    return m[i] || '#64748b';
  };

  var fmtDate = function(d) { if (!d) return '-'; var dt = new Date(d); return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  var fmtTime = function(d) { if (!d) return ''; var dt = new Date(d); return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Memory', h(HelpButton, { label: 'Memory' },
        h('p', null, 'Agent memory stores learned facts, preferences, interaction patterns, and organizational knowledge. Memories persist across sessions so the agent can recall context.'),
        h('h4', { style: _h4 }, 'Key Concepts'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Categories'), ' — Classify memories (org knowledge, preferences, skills, etc.) to keep them organized.'),
          h('li', null, h('strong', null, 'Confidence'), ' — How certain the agent is about this memory. Decays over time if not accessed.'),
          h('li', null, h('strong', null, 'Importance'), ' — Critical, high, normal, or low. Affects retrieval priority.')
        ),
        h('h4', { style: _h4 }, 'Actions'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Prune'), ' — Removes expired/stale entries with low confidence.'),
          h('li', null, h('strong', null, 'Decay'), ' — Reduces confidence of memories not accessed recently (simulates forgetting).')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Regularly prune stale memories to keep the agent focused on relevant, high-quality knowledge.')
      )),
      h('div', { style: { display: 'flex', gap: 6 } },
        h('button', { className: 'btn btn-ghost btn-sm', onClick: pruneStale, title: 'Prune stale entries' }, I.trash()),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: runDecay, title: 'Run confidence decay' }, I.clock()),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: loadAll }, I.refresh()),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowCreateModal(true); } }, I.plus(), ' Add')
      )
    ),
    h('div', { className: 'card-body', style: { padding: 0 } },

      // Compact stats bar
      h('div', { style: { display: 'flex', gap: 24, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 } },
        h('span', { style: { color: 'var(--text-muted)', display: 'flex', alignItems: 'center' } }, 'Total: ', h('strong', null, totalMemories), h(HelpButton, { label: 'Total Memories' }, h('p', null, 'Total number of memory entries stored for this agent.'))),
        h('span', { style: { color: 'var(--text-muted)', display: 'flex', alignItems: 'center' } }, 'Categories: ', h('strong', null, categoriesUsed), h(HelpButton, { label: 'Categories Used' }, h('p', null, 'Number of distinct memory categories in use. More categories means broader knowledge coverage.'))),
        h('span', { style: { color: 'var(--text-muted)', display: 'flex', alignItems: 'center' } }, 'Avg Conf: ', h('strong', null, avgConfidence), h(HelpButton, { label: 'Average Confidence' }, h('p', null, 'Average confidence score across all memories. Higher is better — it means the agent trusts its stored knowledge. Confidence decays over time for unused memories.'))),
        h('span', { style: { color: 'var(--text-muted)', display: 'flex', alignItems: 'center' } }, 'Sources: ', h('strong', null, sourcesCount), h(HelpButton, { label: 'Sources' }, h('p', null, 'Number of distinct sources that contributed memories (e.g., email processing, user input, agent reflection).'))),
        h('div', { style: { flex: 1 } }),
        h('span', { style: { color: 'var(--text-muted)' } }, 'Showing ', h('strong', null, filtered.length), ' of ', totalMemories)
      ),

      // Filter row
      h('div', { style: { display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' } },
        h('input', {
          className: 'input', style: { flex: 1, minWidth: 140, height: 30, fontSize: 12 },
          placeholder: 'Search...', value: searchQuery,
          onChange: function(e) { setSearchQuery(e.target.value); },
          onKeyDown: function(e) { if (e.key === 'Enter') handleSearch(); }
        }),
        h('select', { className: 'input', style: { width: 130, height: 30, fontSize: 12 }, value: filterCategory, onChange: function(e) { setFilterCategory(e.target.value); } },
          h('option', { value: '' }, 'All Categories'),
          MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
        ),
        h('select', { className: 'input', style: { width: 110, height: 30, fontSize: 12 }, value: filterImportance, onChange: function(e) { setFilterImportance(e.target.value); } },
          h('option', { value: '' }, 'All Levels'),
          h('option', { value: 'critical' }, 'Critical'),
          h('option', { value: 'high' }, 'High'),
          h('option', { value: 'normal' }, 'Normal'),
          h('option', { value: 'low' }, 'Low')
        ),
        h('input', { type: 'date', className: 'input', style: { width: 120, height: 30, fontSize: 12 }, value: dateFrom, onChange: function(e) { setDateFrom(e.target.value); setPage(1); }, title: 'From date' }),
        h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, '–'),
        h('input', { type: 'date', className: 'input', style: { width: 120, height: 30, fontSize: 12 }, value: dateTo, onChange: function(e) { setDateTo(e.target.value); setPage(1); }, title: 'To date' }),
        (dateFrom || dateTo) && h('button', { className: 'btn btn-ghost btn-sm', style: { height: 30, fontSize: 11 }, onClick: function() { setDateFrom(''); setDateTo(''); } }, 'Clear')
      ),

      // Table-style compact list
      filtered.length === 0
        ? h('div', { style: { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No memories found')
        : h(Fragment, null,
          // Header row
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 100px 70px 60px 70px 36px', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' } },
            h('span', null, 'Memory'),
            h('span', null, 'Category'),
            h('span', null, 'Level'),
            h('span', null, 'Conf'),
            h('span', null, 'Date'),
            h('span', null, '')
          ),
          // Rows
          paged.map(function(m) {
            var isExpanded = expandedId === m.id;
            var conf = m.confidence != null ? Math.round(m.confidence * 100) : 0;
            var confBar = conf >= 80 ? 'var(--success)' : conf >= 50 ? 'var(--warning)' : 'var(--danger)';
            return h('div', { key: m.id },
              // Compact row
              h('div', {
                style: { display: 'grid', gridTemplateColumns: '1fr 100px 70px 60px 70px 36px', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, alignItems: 'center', transition: 'background 0.1s', background: isExpanded ? 'var(--bg-tertiary)' : 'transparent' },
                onClick: function() { setExpandedId(isExpanded ? null : m.id); },
                onMouseEnter: function(e) { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-secondary)'; },
                onMouseLeave: function(e) { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }
              },
                // Title + preview
                h('div', { style: { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } },
                  h('span', { style: { fontWeight: 500 } }, m.title || 'Untitled'),
                  m.content && h('span', { style: { color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 } }, m.content.substring(0, 60) + (m.content.length > 60 ? '...' : ''))
                ),
                // Category badge
                h('span', { style: { display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, color: '#fff', background: catColor(m.category), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, (m.category || '').replace(/_/g, ' ')),
                // Importance
                h('span', { style: { fontSize: 11, color: impColor(m.importance), fontWeight: 500 } }, m.importance || 'normal'),
                // Confidence bar
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                  h('div', { style: { flex: 1, height: 4, borderRadius: 2, background: 'var(--border)' } },
                    h('div', { style: { width: conf + '%', height: '100%', borderRadius: 2, background: confBar } })
                  ),
                  h('span', { style: { fontSize: 10, color: 'var(--text-muted)', minWidth: 24 } }, conf + '%')
                ),
                // Date
                h('span', { style: { fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, fmtDate(m.createdAt)),
                // Expand indicator
                h('span', { style: { display: 'inline-flex', color: 'var(--text-muted)' } }, isExpanded ? E.triangleUp(12) : E.triangleDown(12))
              ),
              // Expanded detail
              isExpanded && h('div', { style: { padding: '10px 16px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6 } },
                h('div', { style: { color: 'var(--text)', marginBottom: 8, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' } }, m.content || '(empty)'),
                h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' } },
                  h('span', null, 'Source: ', h('strong', null, m.source || '-')),
                  h('span', null, 'Created: ', h('strong', null, fmtDate(m.createdAt)), ' ', fmtTime(m.createdAt)),
                  m.lastAccessedAt && h('span', null, 'Last accessed: ', h('strong', null, fmtDate(m.lastAccessedAt))),
                  m.tags && m.tags.length > 0 && h('span', null, 'Tags: ', m.tags.join(', ')),
                  h('div', { style: { flex: 1 } }),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)', height: 24, fontSize: 11 }, onClick: function(e) { e.stopPropagation(); deleteMemory(m.id); } }, I.trash(), ' Delete')
                )
              )
            );
          }),

          // Pagination
          totalPages > 1 && h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 16px', borderTop: '1px solid var(--border)' } },
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(1); }, style: { fontSize: 11, height: 28 } }, '«'),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: function() { setPage(page - 1); }, style: { fontSize: 11, height: 28 } }, '‹'),
            h('span', { style: { fontSize: 12, color: 'var(--text-muted)', padding: '0 8px' } }, 'Page ', h('strong', null, page), ' of ', h('strong', null, totalPages)),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(page + 1); }, style: { fontSize: 11, height: 28 } }, '›'),
            h('button', { className: 'btn btn-ghost btn-sm', disabled: page >= totalPages, onClick: function() { setPage(totalPages); }, style: { fontSize: 11, height: 28 } }, '»')
          )
        )
    ),

    // Create Memory Modal
    showCreateModal && h('div', { className: 'modal-overlay', onClick: function() { setShowCreateModal(false); } },
      h('div', { className: 'modal', style: { maxWidth: 500 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Create Memory'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowCreateModal(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Title *'),
            h('input', { className: 'input', placeholder: 'Memory title', value: createForm.title, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { title: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Content *'),
            h('textarea', { className: 'input', style: { minHeight: 100 }, placeholder: 'Memory content...', value: createForm.content, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { content: e.target.value })); } })
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Category'),
              h('select', { className: 'input', value: createForm.category, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { category: e.target.value })); } },
                MEMORY_CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Importance'),
              h('select', { className: 'input', value: createForm.importance, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { importance: e.target.value })); } },
                h('option', { value: 'critical' }, 'Critical'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'normal' }, 'Normal'),
                h('option', { value: 'low' }, 'Low')
              )
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Tags (comma-separated)'),
            h('input', { className: 'input', placeholder: 'tag1, tag2', value: createForm.tags, onChange: function(e) { setCreateForm(Object.assign({}, createForm, { tags: e.target.value })); } })
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowCreateModal(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: createMemory }, 'Create')
        )
      )
    )
  );
}
