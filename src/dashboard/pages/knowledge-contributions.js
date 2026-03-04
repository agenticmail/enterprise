import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, buildAgentDataMap, renderAgentBadge, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

export function KnowledgeContributionsPage() {
  var { toast } = useApp();
  var orgCtx = useOrgContext();
  var [tab, setTab] = useState('bases');
  var [bases, setBases] = useState([]);
  var [roles, setRoles] = useState([]);
  var [stats, setStats] = useState({});
  var [contributions, setContributions] = useState([]);
  var [schedules, setSchedules] = useState([]);
  var [selectedBase, setSelectedBase] = useState(null);
  var [baseEntries, setBaseEntries] = useState([]);
  var [entryFilters, setEntryFilters] = useState({ category: '', status: '', minQuality: '' });

  // Modals
  var [showCreateBase, setShowCreateBase] = useState(false);
  var [baseForm, setBaseForm] = useState({ name: '', description: '', role: '' });
  var [showTrigger, setShowTrigger] = useState(false);
  var [triggerAgent, setTriggerAgent] = useState('');
  var [triggerBase, setTriggerBase] = useState('');
  var [showCreateSchedule, setShowCreateSchedule] = useState(false);
  var [scheduleForm, setScheduleForm] = useState({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 });
  var [editSchedule, setEditSchedule] = useState(null);

  // Agents for badges + filters
  var [agents, setAgents] = useState([]);
  // Contributions pagination/filter
  var [contribPage, setContribPage] = useState(0);
  var [contribSearch, setContribSearch] = useState('');
  var [contribAgent, setContribAgent] = useState('');
  var [selectedContrib, setSelectedContrib] = useState(null);
  var CONTRIB_PAGE_SIZE = 20;

  // Search metrics state
  var [searchMetrics, setSearchMetrics] = useState(null);
  var [searchDays, setSearchDays] = useState(7);
  var [searchAgentFilter, setSearchAgentFilter] = useState('');

  // Effective org ID: uses client org if selected, else default
  var effectiveOrgId = orgCtx.selectedOrgId || getOrgId();

  var loadBases = useCallback(function() {
    Promise.all([
      engineCall('/knowledge-contribution/bases?orgId=' + effectiveOrgId).catch(function() { return { bases: [] }; }),
      engineCall('/knowledge-bases').catch(function() { return { knowledgeBases: [] }; })
    ]).then(function(results) {
      var contribBases = results[0].bases || [];
      var mainBases = (results[1].knowledgeBases || []).map(function(kb) {
        return { id: kb.id, orgId: effectiveOrgId, name: kb.name, description: kb.description, role: 'general', categories: [], contributorCount: 0, entryCount: kb.stats ? kb.stats.documentCount || 0 : 0, createdAt: kb.createdAt, updatedAt: kb.updatedAt, _source: 'main' };
      });
      // Merge: contribution bases first, then main bases not already in contribution
      var ids = {};
      contribBases.forEach(function(b) { ids[b.id] = true; });
      var merged = contribBases.concat(mainBases.filter(function(b) { return !ids[b.id]; }));
      setBases(merged);
    });
  }, []);

  var loadRoles = useCallback(function() {
    engineCall('/knowledge-contribution/roles')
      .then(function(d) { setRoles(d.roles || []); })
      .catch(function() {});
  }, []);

  var loadStats = useCallback(function() {
    engineCall('/knowledge-contribution/stats?orgId=' + effectiveOrgId)
      .then(function(d) { setStats(d || {}); })
      .catch(function() {});
  }, []);

  var loadContributions = useCallback(function() {
    engineCall('/knowledge-contribution/contributions?orgId=' + effectiveOrgId)
      .then(function(d) { setContributions(d.contributions || d.cycles || []); })
      .catch(function() {});
  }, []);

  var loadSchedules = useCallback(function() {
    engineCall('/knowledge-contribution/schedules?orgId=' + effectiveOrgId)
      .then(function(d) { setSchedules(d.schedules || []); })
      .catch(function() {});
  }, []);

  var load = useCallback(function() {
    loadBases();
    loadRoles();
    loadStats();
    loadContributions();
    loadSchedules();
    engineCall('/agents?orgId=' + effectiveOrgId).then(function(d) { setAgents(d.agents || []); }).catch(function() {});
  }, [loadBases, loadRoles, loadStats, loadContributions, loadSchedules]);

  useEffect(function() { load(); }, [load, effectiveOrgId]);

  var loadBaseEntries = useCallback(function(baseId) {
    var params = new URLSearchParams();
    if (entryFilters.category) params.set('category', entryFilters.category);
    if (entryFilters.status) params.set('status', entryFilters.status);
    if (entryFilters.minQuality) params.set('minQuality', entryFilters.minQuality);
    engineCall('/knowledge-contribution/bases/' + baseId + '/entries?' + params.toString())
      .then(function(d) { setBaseEntries(Array.isArray(d.entries) ? d.entries : []); })
      .catch(function() { setBaseEntries([]); });
  }, [entryFilters]);

  useEffect(function() {
    if (selectedBase) loadBaseEntries(selectedBase.id);
  }, [selectedBase, loadBaseEntries]);

  // Actions
  var createBase = async function() {
    try {
      await engineCall('/knowledge-contribution/bases', {
        method: 'POST',
        body: JSON.stringify({ name: baseForm.name, description: baseForm.description, role: baseForm.role, orgId: effectiveOrgId })
      });
      toast('Knowledge base created', 'success');
      setShowCreateBase(false);
      setBaseForm({ name: '', description: '', role: '' });
      loadBases();
      loadStats();
    } catch (e) { toast(e.message || 'Failed to create base', 'error'); }
  };

  var approveEntry = async function(entryId) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/approve', { method: 'PUT' });
      toast('Entry approved', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
      loadStats();
    } catch (e) { toast(e.message || 'Approve failed', 'error'); }
  };

  var rejectEntry = async function(entryId) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/reject', { method: 'PUT' });
      toast('Entry rejected', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
    } catch (e) { toast(e.message || 'Reject failed', 'error'); }
  };

  var archiveEntry = async function(entryId) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/archive', { method: 'PUT' });
      toast('Entry archived', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
    } catch (e) { toast(e.message || 'Archive failed', 'error'); }
  };

  var voteEntry = async function(entryId, direction) {
    try {
      await engineCall('/knowledge-contribution/entries/' + entryId + '/vote', {
        method: 'POST',
        body: JSON.stringify({ direction: direction })
      });
      toast('Vote recorded', 'success');
      if (selectedBase) loadBaseEntries(selectedBase.id);
    } catch (e) { toast(e.message || 'Vote failed', 'error'); }
  };

  var triggerContribution = async function() {
    if (!triggerAgent) return;
    try {
      await engineCall('/knowledge-contribution/contribute/' + triggerAgent, {
        method: 'POST',
        body: JSON.stringify({ targetBaseId: triggerBase || undefined, orgId: effectiveOrgId })
      });
      toast('Contribution triggered', 'success');
      setShowTrigger(false);
      setTriggerAgent('');
      setTriggerBase('');
      loadContributions();
      loadStats();
    } catch (e) { toast(e.message || 'Trigger failed', 'error'); }
  };

  var createSchedule = async function() {
    try {
      await engineCall('/knowledge-contribution/schedules', {
        method: 'POST',
        body: JSON.stringify({
          agentId: scheduleForm.agentId,
          targetBaseId: scheduleForm.targetBaseId,
          frequency: scheduleForm.frequency,
          dayOfWeek: scheduleForm.dayOfWeek,
          minConfidence: parseFloat(scheduleForm.minConfidence) || 0.7,
          orgId: effectiveOrgId
        })
      });
      toast('Schedule created', 'success');
      setShowCreateSchedule(false);
      setScheduleForm({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 });
      loadSchedules();
      loadStats();
    } catch (e) { toast(e.message || 'Create schedule failed', 'error'); }
  };

  var updateSchedule = async function() {
    if (!editSchedule) return;
    try {
      await engineCall('/knowledge-contribution/schedules/' + editSchedule.id, {
        method: 'PUT',
        body: JSON.stringify({
          frequency: scheduleForm.frequency,
          dayOfWeek: scheduleForm.dayOfWeek,
          minConfidence: parseFloat(scheduleForm.minConfidence) || 0.7,
          enabled: editSchedule.enabled
        })
      });
      toast('Schedule updated', 'success');
      setEditSchedule(null);
      setScheduleForm({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 });
      loadSchedules();
    } catch (e) { toast(e.message || 'Update schedule failed', 'error'); }
  };

  var toggleSchedule = async function(sched) {
    try {
      await engineCall('/knowledge-contribution/schedules/' + sched.id, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !sched.enabled })
      });
      toast('Schedule ' + (sched.enabled ? 'disabled' : 'enabled'), 'success');
      loadSchedules();
    } catch (e) { toast(e.message || 'Toggle failed', 'error'); }
  };

  var deleteSchedule = async function(schedId) {
    try {
      await engineCall('/knowledge-contribution/schedules/' + schedId, { method: 'DELETE' });
      toast('Schedule deleted', 'success');
      loadSchedules();
      loadStats();
    } catch (e) { toast(e.message || 'Delete failed', 'error'); }
  };

  // Helpers
  var statusColor = function(s) {
    if (s === 'approved' || s === 'completed' || s === 'active') return 'var(--success)';
    if (s === 'pending' || s === 'running' || s === 'in_progress') return 'var(--warning)';
    if (s === 'rejected' || s === 'failed') return 'var(--danger)';
    if (s === 'archived') return 'var(--text-muted)';
    return 'var(--info)';
  };

  var qualityBar = function(score) {
    var pct = Math.round((score || 0) * 100);
    var color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      h('div', { style: { flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 } },
        h('div', { style: { width: pct + '%', height: '100%', background: color, borderRadius: 3 } })
      ),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)', minWidth: 30 } }, pct + '%')
    );
  };

  var roleColor = function(role) {
    if (role === 'support') return 'var(--info)';
    if (role === 'sales') return 'var(--success)';
    if (role === 'engineering') return 'var(--warning)';
    if (role === 'hr') return '#a855f7';
    if (role === 'ops') return '#f97316';
    return 'var(--brand-color)';
  };

  // ── Knowledge Bases Tab ──────────────────────────────
  var renderBases = function() {
    if (selectedBase) return renderBaseDetail();

    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' } }, bases.length + ' knowledge base' + (bases.length !== 1 ? 's' : ''),
          h(HelpButton, { label: 'Knowledge Bases' },
            h('p', null, 'Each knowledge base is a searchable collection of documents. Agents use these to answer questions with real organizational data instead of guessing.'),
            h('h4', { style: _h4 }, 'How It Works'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Create'), ' a knowledge base and give it a descriptive name (e.g., "HR Policies", "Product Docs").'),
              h('li', null, h('strong', null, 'Import'), ' documents via the Knowledge Import page — upload files, crawl URLs, or paste text.'),
              h('li', null, h('strong', null, 'Assign'), ' the knowledge base to agents in their Deployment tab.'),
              h('li', null, h('strong', null, 'Search'), ' happens automatically when agents use the knowledge_base_search tool.')
            ),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Click on a knowledge base to see its documents and chunks. Chunks are the small pieces of text that get matched during search — smaller chunks give more precise results.')
          )
        ),
        h('button', { className: 'btn btn-primary', onClick: function() { setShowCreateBase(true); } }, I.plus(), ' Create Knowledge Base')
      ),
      bases.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No knowledge bases yet. Create one to get started.')
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 } },
            bases.map(function(base) {
              return h('div', {
                key: base.id,
                className: 'card',
                style: { cursor: 'pointer', transition: 'border-color 0.15s' },
                onClick: function() { setSelectedBase(base); }
              },
                h('div', { className: 'card-body' },
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 } },
                    h('h3', { style: { fontSize: 15, fontWeight: 600 } }, base.name),
                    base.role && h('span', {
                      className: 'badge',
                      style: { background: roleColor(base.role), color: '#fff', fontSize: 10, textTransform: 'uppercase' }
                    }, base.role)
                  ),
                  h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 } },
                    base.description || 'No description'
                  ),
                  h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
                    h('span', { className: 'badge badge-info' }, (base.entryCount || 0) + ' entries'),
                    h('span', { className: 'badge badge-neutral' }, (base.contributorCount || 0) + ' contributors'),
                    base.lastContribution && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                      'Last: ' + new Date(base.lastContribution).toLocaleDateString()
                    )
                  )
                )
              );
            })
          )
    );
  };

  // ── Base Detail View ──────────────────────────────
  var renderBaseDetail = function() {
    var categories = [];
    var catSet = {};
    (Array.isArray(baseEntries) ? baseEntries : []).forEach(function(e) {
      if (e.category && !catSet[e.category]) {
        catSet[e.category] = true;
        categories.push(e.category);
      }
    });

    return h(Fragment, null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setSelectedBase(null); setBaseEntries([]); setEntryFilters({ category: '', status: '', minQuality: '' }); } }, '\u2190 Back'),
        h('div', null,
          h('h2', { style: { fontSize: 16, fontWeight: 600 } }, selectedBase.name),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)' } }, selectedBase.description || '')
        ),
        selectedBase.role && h('span', {
          className: 'badge',
          style: { background: roleColor(selectedBase.role), color: '#fff', fontSize: 10, textTransform: 'uppercase', marginLeft: 'auto' }
        }, selectedBase.role)
      ),

      // Filters
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' } },
        h('select', {
          className: 'input', style: { width: 160 },
          value: entryFilters.category,
          onChange: function(e) { setEntryFilters(function(f) { return Object.assign({}, f, { category: e.target.value }); }); }
        },
          h('option', { value: '' }, 'All Categories'),
          categories.map(function(c) { return h('option', { key: c, value: c }, c); })
        ),
        h('select', {
          className: 'input', style: { width: 140 },
          value: entryFilters.status,
          onChange: function(e) { setEntryFilters(function(f) { return Object.assign({}, f, { status: e.target.value }); }); }
        },
          h('option', { value: '' }, 'All Statuses'),
          ['pending', 'approved', 'rejected', 'archived'].map(function(s) { return h('option', { key: s, value: s }, s.charAt(0).toUpperCase() + s.slice(1)); })
        ),
        h('select', {
          className: 'input', style: { width: 150 },
          value: entryFilters.minQuality,
          onChange: function(e) { setEntryFilters(function(f) { return Object.assign({}, f, { minQuality: e.target.value }); }); }
        },
          h('option', { value: '' }, 'Any Quality'),
          h('option', { value: '0.8' }, '80%+ Quality'),
          h('option', { value: '0.6' }, '60%+ Quality'),
          h('option', { value: '0.4' }, '40%+ Quality')
        ),
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' } }, baseEntries.length + ' entries')
      ),

      // Entries
      baseEntries.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No entries in this knowledge base yet.')
        : h('div', { style: { display: 'grid', gap: 10 } },
            baseEntries.map(function(entry) {
              return h('div', { key: entry.id, className: 'card', style: { padding: 14 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 } },
                  h('div', { style: { flex: 1 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                      h('span', { style: { fontWeight: 600, fontSize: 14 } }, entry.title || 'Untitled'),
                      entry.category && h('span', { className: 'badge badge-info', style: { fontSize: 10 } }, entry.category),
                      h('span', {
                        className: 'badge',
                        style: { background: statusColor(entry.status), color: '#fff', fontSize: 10 }
                      }, entry.status || 'pending')
                    ),
                    entry.summary && h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 } }, entry.summary)
                  )
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
                  // Quality bar
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Quality:'),
                    qualityBar(entry.qualityScore || entry.quality)
                  ),
                  // Confidence
                  entry.confidence != null && h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                    'Confidence: ' + Math.round((entry.confidence || 0) * 100) + '%'
                  ),
                  // Tags
                  (entry.tags || []).length > 0 && h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                    entry.tags.map(function(t) { return h('span', { key: t, className: 'badge badge-neutral', style: { fontSize: 10 } }, t); })
                  ),
                  // Vote buttons
                  h('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { fontSize: 14, padding: '2px 6px' },
                      onClick: function() { voteEntry(entry.id, 'up'); },
                      title: 'Vote up'
                    }, '\u25B2', entry.upvotes != null ? h('span', { style: { fontSize: 10, marginLeft: 2 } }, entry.upvotes) : null),
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { fontSize: 14, padding: '2px 6px' },
                      onClick: function() { voteEntry(entry.id, 'down'); },
                      title: 'Vote down'
                    }, '\u25BC', entry.downvotes != null ? h('span', { style: { fontSize: 10, marginLeft: 2 } }, entry.downvotes) : null)
                  ),
                  // Action buttons
                  h('div', { style: { display: 'flex', gap: 4 } },
                    entry.status !== 'approved' && h('button', { className: 'btn btn-primary btn-sm', onClick: function() { approveEntry(entry.id); } }, 'Approve'),
                    entry.status !== 'rejected' && h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function() { rejectEntry(entry.id); } }, 'Reject'),
                    entry.status !== 'archived' && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { archiveEntry(entry.id); } }, 'Archive')
                  )
                )
              );
            })
          )
    );
  };

  // ── Contributions Tab ──────────────────────────────
  var agentData = buildAgentDataMap(agents);

  var renderContributions = function() {
    // Header with help
    var _contribHeader = h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 } },
      h('span', { style: { fontSize: 14, fontWeight: 600 } }, 'Agent Contributions'),
      h(HelpButton, { label: 'Agent Contributions' },
        h('p', null, 'Every entry here is a piece of knowledge an agent contributed — a fact learned, a decision recorded, a process documented, or an insight captured during work.'),
        h('h4', { style: _h4 }, 'Contribution Details'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Confidence'), ' — How certain the agent is about this knowledge (0-100%). Higher confidence = more reliable. Contributions below your threshold are flagged for review.'),
          h('li', null, h('strong', null, 'Category'), ' — The type of knowledge (fact, process, decision, preference, etc.). Helps organize and filter.'),
          h('li', null, h('strong', null, 'Source'), ' — Where the agent learned this (conversation, email, document, etc.).')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Review low-confidence contributions periodically. You can edit, approve, or delete them. High-quality contributions improve all agents that share this knowledge base.')
      )
    );

    // Filter
    var filtered = contributions;
    if (contribAgent) filtered = filtered.filter(function(c) { return c.agentId === contribAgent; });
    if (contribSearch) {
      var s = contribSearch.toLowerCase();
      filtered = filtered.filter(function(c) {
        return (c.title || '').toLowerCase().includes(s) || (c.agentName || '').toLowerCase().includes(s)
          || (c.content || '').toLowerCase().includes(s) || (c.category || '').toLowerCase().includes(s);
      });
    }
    var totalFiltered = filtered.length;
    var totalPages = Math.ceil(totalFiltered / CONTRIB_PAGE_SIZE);
    var paged = filtered.slice(contribPage * CONTRIB_PAGE_SIZE, (contribPage + 1) * CONTRIB_PAGE_SIZE);

    return h(Fragment, null,
      _contribHeader,
      // Filter bar
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('input', {
          type: 'text', placeholder: 'Search contributions...',
          value: contribSearch,
          onInput: function(e) { setContribSearch(e.target.value); setContribPage(0); },
          style: { flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, minWidth: 180, outline: 'none' },
        }),
        h('select', {
          value: contribAgent,
          onChange: function(e) { setContribAgent(e.target.value); setContribPage(0); },
          style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' },
        },
          h('option', { value: '' }, 'All agents'),
          agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config && a.config.identity && a.config.identity.name || a.config && a.config.displayName || a.name || a.id); })
        ),
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, totalFiltered + ' contribution' + (totalFiltered !== 1 ? 's' : '')),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowTrigger(true); } }, I.play(), ' Trigger')
      ),

      paged.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, contribSearch || contribAgent ? 'No matching contributions.' : 'No contributions yet.')
        : h('table', { className: 'data-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Agent'),
                h('th', null, 'Title'),
                h('th', null, 'Importance'),
                h('th', null, 'Status'),
                h('th', null, 'Date')
              )
            ),
            h('tbody', null,
              paged.map(function(c) {
                return h('tr', { key: c.id, onClick: function() { setSelectedContrib(c); }, style: { cursor: 'pointer' } },
                  h('td', null, renderAgentBadge(c.agentId, agentData)),
                  h('td', { style: { fontWeight: 500, fontSize: 13 } }, c.title || '-'),
                  h('td', null, c.importance ? h('span', { className: 'badge badge-' + (c.importance === 'high' ? 'danger' : c.importance === 'medium' ? 'warning' : 'info') }, c.importance) : '-'),
                  h('td', null, h('span', {
                    className: 'badge',
                    style: { background: statusColor(c.status), color: '#fff', fontSize: 10 }
                  }, c.status || 'unknown')),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, c.createdAt || c.date ? new Date(c.createdAt || c.date).toLocaleString() : '-')
                );
              })
            )
          ),

      // Pagination
      totalPages > 1 && h('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', fontSize: 13, color: 'var(--text-muted)' }
      },
        h('span', null, 'Showing ' + (contribPage * CONTRIB_PAGE_SIZE + 1) + '-' + Math.min((contribPage + 1) * CONTRIB_PAGE_SIZE, totalFiltered) + ' of ' + totalFiltered),
        h('div', { style: { display: 'flex', gap: 4 } },
          h('button', { onClick: function() { setContribPage(function(p) { return Math.max(0, p - 1); }); }, disabled: contribPage === 0, style: _pgBtn(false) }, '\u2039 Prev'),
          h('span', { style: { padding: '4px 8px', fontSize: 12 } }, (contribPage + 1) + ' / ' + totalPages),
          h('button', { onClick: function() { setContribPage(function(p) { return Math.min(totalPages - 1, p + 1); }); }, disabled: contribPage >= totalPages - 1, style: _pgBtn(false) }, 'Next \u203A')
        )
      )
    );
  };

  // Schedules pagination/filter
  var [schedPage, setSchedPage] = useState(0);
  var [schedSearch, setSchedSearch] = useState('');
  var [schedAgentFilter, setSchedAgentFilter] = useState('');
  var [schedEnabledFilter, setSchedEnabledFilter] = useState('');
  var SCHED_PAGE_SIZE = 20;

  // ── Schedules Tab ──────────────────────────────
  var renderSchedules = function() {
    var filteredScheds = schedules;
    if (schedSearch) { var s = schedSearch.toLowerCase(); filteredScheds = filteredScheds.filter(function(sc) { return (sc.baseName || sc.targetBaseId || '').toLowerCase().includes(s) || (sc.frequency || '').toLowerCase().includes(s); }); }
    if (schedAgentFilter) filteredScheds = filteredScheds.filter(function(sc) { return sc.agentId === schedAgentFilter; });
    if (schedEnabledFilter === 'on') filteredScheds = filteredScheds.filter(function(sc) { return sc.enabled; });
    if (schedEnabledFilter === 'off') filteredScheds = filteredScheds.filter(function(sc) { return !sc.enabled; });
    var totalSchedFiltered = filteredScheds.length;
    var totalSchedPages = Math.ceil(totalSchedFiltered / SCHED_PAGE_SIZE);
    var pagedScheds = filteredScheds.slice(schedPage * SCHED_PAGE_SIZE, (schedPage + 1) * SCHED_PAGE_SIZE);

    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('span', { style: { fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' } }, totalSchedFiltered + ' schedule' + (totalSchedFiltered !== 1 ? 's' : ''),
          h(HelpButton, { label: 'Contribution Schedules' },
            h('p', null, 'Schedules automate knowledge contributions. Instead of relying on agents to contribute spontaneously, schedules trigger periodic knowledge synthesis.'),
            h('h4', { style: _h4 }, 'How Schedules Work'),
            h('ul', { style: _ul },
              h('li', null, 'Pick an agent and a target knowledge base.'),
              h('li', null, 'Set the frequency (hourly, daily, weekly, monthly) and a minimum confidence threshold.'),
              h('li', null, 'At each interval, the agent reviews its recent memories and contributes relevant knowledge above the confidence threshold.')
            ),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Weekly schedules with 60%+ confidence work well for most use cases. Daily schedules generate more granular but potentially noisier contributions.')
          )
        ),
        h('button', { className: 'btn btn-primary', onClick: function() { setShowCreateSchedule(true); } }, I.plus(), ' Create Schedule')
      ),
      // Filter bar
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('input', {
          type: 'text', placeholder: 'Search base name...',
          value: schedSearch, onInput: function(e) { setSchedSearch(e.target.value); setSchedPage(0); },
          style: { flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, minWidth: 180, outline: 'none' }
        }),
        h('select', {
          value: schedAgentFilter, onChange: function(e) { setSchedAgentFilter(e.target.value); setSchedPage(0); },
          style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }
        },
          h('option', { value: '' }, 'All Agents'),
          agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config && a.config.identity && a.config.identity.name || a.config && a.config.displayName || a.name || a.id); })
        ),
        h('select', {
          value: schedEnabledFilter, onChange: function(e) { setSchedEnabledFilter(e.target.value); setSchedPage(0); },
          style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }
        },
          h('option', { value: '' }, 'All'),
          h('option', { value: 'on' }, 'Enabled'),
          h('option', { value: 'off' }, 'Disabled')
        )
      ),
      pagedScheds.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, schedSearch || schedAgentFilter || schedEnabledFilter ? 'No matching schedules.' : 'No contribution schedules configured.')
        : h('table', { className: 'data-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Agent'),
                h('th', null, 'Target Base'),
                h('th', null, 'Frequency'),
                h('th', null, 'Next Run'),
                h('th', null, 'Enabled'),
                h('th', null, 'Actions')
              )
            ),
            h('tbody', null,
              pagedScheds.map(function(sched) {
                return h('tr', { key: sched.id },
                  h('td', null, renderAgentBadge(sched.agentId, agentData)),
                  h('td', null, sched.baseName || sched.targetBaseId || '-'),
                  h('td', null, h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, sched.frequency || '-')),
                  h('td', null, sched.nextRun ? new Date(sched.nextRun).toLocaleString() : '-'),
                  h('td', null,
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { color: sched.enabled ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600, fontSize: 12 },
                      onClick: function() { toggleSchedule(sched); }
                    }, sched.enabled ? 'ON' : 'OFF')
                  ),
                  h('td', null,
                    h('div', { style: { display: 'flex', gap: 4 } },
                      h('button', {
                        className: 'btn btn-ghost btn-sm',
                        onClick: function() {
                          setEditSchedule(sched);
                          setScheduleForm({
                            agentId: sched.agentId || '',
                            targetBaseId: sched.targetBaseId || '',
                            frequency: sched.frequency || 'weekly',
                            dayOfWeek: sched.dayOfWeek || 'monday',
                            minConfidence: sched.minConfidence || 0.7
                          });
                        }
                      }, 'Edit'),
                      h('button', {
                        className: 'btn btn-ghost btn-sm',
                        style: { color: 'var(--danger)' },
                        onClick: function() { deleteSchedule(sched.id); }
                      }, 'Delete')
                    )
                  )
                );
              })
            )
          ),
      // Pagination
      totalSchedPages > 1 && h('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', fontSize: 13, color: 'var(--text-muted)' }
      },
        h('span', null, 'Showing ' + (schedPage * SCHED_PAGE_SIZE + 1) + '-' + Math.min((schedPage + 1) * SCHED_PAGE_SIZE, totalSchedFiltered) + ' of ' + totalSchedFiltered),
        h('div', { style: { display: 'flex', gap: 4 } },
          h('button', { onClick: function() { setSchedPage(function(p) { return Math.max(0, p - 1); }); }, disabled: schedPage === 0, style: _pgBtn(false) }, '\u2039 Prev'),
          h('span', { style: { padding: '4px 8px', fontSize: 12 } }, (schedPage + 1) + ' / ' + totalSchedPages),
          h('button', { onClick: function() { setSchedPage(function(p) { return Math.min(totalSchedPages - 1, p + 1); }); }, disabled: schedPage >= totalSchedPages - 1, style: _pgBtn(false) }, 'Next \u203A')
        )
      )
    );
  };

  // ── Stats Tab (Charts) ──────────────────────────────
  var [timelineData, setTimelineData] = useState(null);
  var [chartDays, setChartDays] = useState(30);
  var [chartAgent, setChartAgent] = useState('');

  var loadTimeline = useCallback(function() {
    var url = '/knowledge-contribution/stats/timeline?days=' + chartDays;
    if (chartAgent) url += '&agentId=' + chartAgent;
    engineCall(url).then(function(d) { setTimelineData(d); }).catch(function() {});
  }, [chartDays, chartAgent]);

  useEffect(function() { if (tab === 'stats') loadTimeline(); }, [tab, loadTimeline]);

  // SVG chart helpers — clean background, dark mode, hover tooltips
  var CHART_COLORS = ['#6366f1', '#15803d', '#991b1b', '#ef4444', '#8b5cf6', '#06b6d4', '#9d174d', '#14b8a6'];
  var [tooltip, setTooltip] = useState(null); // { x, y, lines: [] }

  // Shared tooltip overlay (rendered once, positioned absolutely)
  var renderTooltip = function() {
    if (!tooltip) return null;
    return h('div', {
      style: {
        position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px', fontSize: 11, lineHeight: 1.6,
        color: 'var(--text)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        pointerEvents: 'none', zIndex: 9999, maxWidth: 220, whiteSpace: 'nowrap'
      }
    }, tooltip.lines.map(function(l, i) {
      return h('div', { key: i, style: l.bold ? { fontWeight: 600, marginBottom: 2 } : l.color ? { color: l.color } : {} },
        l.dot ? h('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: l.dot, marginRight: 6 } }) : null,
        l.text
      );
    }));
  };

  var _fmtDate = function(raw) {
    if (!raw) return '';
    var d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var day = d.getDate(), mon = months[d.getMonth()], yr = d.getFullYear();
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    var mm = m < 10 ? '0' + m : m;
    return (day < 10 ? '0' : '') + day + ' ' + mon + ' ' + yr + ' at ' + h + ':' + mm + ampm;
  };

  var showTip = function(e, lines) {
    setTooltip({ x: e.clientX, y: e.clientY, lines: lines });
  };
  var hideTip = function() { setTooltip(null); };

  var _noData = function(msg) {
    return h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 } }, msg || 'No data yet');
  };

  // Chart help content for HelpButton modals
  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  var renderLineChart = function(data, opts) {
    if (!data || data.length === 0) return _noData();
    // Single data point: expand into 3 so we get a visible line
    if (data.length === 1) {
      var _d0 = data[0];
      data = [Object.assign({}, _d0, { _synth: true }), _d0, Object.assign({}, _d0, { _synth: true })];
    }
    var W = opts.width || 600, H = opts.height || 200, pad = { top: 16, right: 16, bottom: 32, left: 44 };
    var cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    var vals = data.map(function(d) { return d[opts.valueKey] || 0; });
    var maxV = Math.max.apply(null, vals.concat([1]));
    var minV = opts.minVal != null ? opts.minVal : 0;
    var range = maxV - minV || 1;

    var points = data.map(function(d, i) {
      var x = pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
      var y = pad.top + cH - ((d[opts.valueKey] - minV) / range) * cH;
      return { x: x, y: y, d: d };
    });

    // Smooth curve (catmull-rom → cubic bezier)
    var smoothPath = function(pts) {
      if (pts.length < 2) return 'M' + pts[0].x + ',' + pts[0].y;
      if (pts.length === 2) return 'M' + pts[0].x + ',' + pts[0].y + ' L' + pts[1].x + ',' + pts[1].y;
      var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        var cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
        var cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
      }
      return d;
    };

    var linePath = smoothPath(points);
    // Build area from smooth line — append bottom closure
    var areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (pad.top + cH) + ' L' + points[0].x.toFixed(1) + ',' + (pad.top + cH) + ' Z';
    var color = opts.color || '#6366f1';

    // Y-axis: just min and max labels, no grid lines
    var yLabels = [
      { val: opts.formatY ? opts.formatY(minV) : Math.round(minV), y: pad.top + cH },
      { val: opts.formatY ? opts.formatY(maxV) : Math.round(maxV), y: pad.top }
    ];

    // X-axis labels (max 6)
    var xStep = Math.max(1, Math.ceil(data.length / 6));
    var xLabels = [];
    data.forEach(function(d, i) {
      if (i % xStep === 0 || i === data.length - 1) {
        var x = pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
        var raw = d[opts.labelKey] || '';
        var dateObj = new Date(raw);
        var label = isNaN(dateObj.getTime()) ? raw : dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        xLabels.push({ x: x, label: label });
      }
    });

    return h('div', { style: { position: 'relative' } },
      h('svg', { viewBox: '0 0 ' + W + ' ' + H, style: { width: '100%', maxWidth: W, height: 'auto', display: 'block' } },
        // Gradient fill
        h('defs', null,
          h('linearGradient', { id: 'lineGrad-' + (opts.id || 'default'), x1: 0, y1: 0, x2: 0, y2: 1 },
            h('stop', { offset: '0%', stopColor: color, stopOpacity: 0.2 }),
            h('stop', { offset: '100%', stopColor: color, stopOpacity: 0.02 })
          )
        ),
        // Y labels
        yLabels.map(function(yl, i) {
          return h('text', { key: 'yl' + i, x: pad.left - 8, y: yl.y + 4, textAnchor: 'end', fill: 'var(--text-muted)', fontSize: 10 }, yl.val);
        }),
        // X labels
        xLabels.map(function(xl, i) {
          return h('text', { key: 'xl' + i, x: xl.x, y: H - 6, textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 10 }, xl.label);
        }),
        // Area
        h('path', { d: areaPath, fill: 'url(#lineGrad-' + (opts.id || 'default') + ')' }),
        // Line
        h('path', { d: linePath, fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        // Invisible hit areas for hover (wider than dots) — skip synthetic points
        points.map(function(p, i) {
          if (p.d._synth) return null;
          var d = p.d;
          var label = d[opts.labelKey] || '';
          var val = d[opts.valueKey] || 0;
          var extra = d.avgConfidence != null ? [{ text: 'Avg Confidence: ' + Math.round(d.avgConfidence * 100) + '%', color: 'var(--text-muted)' }] : [];
          return h('circle', {
            key: 'hit' + i, cx: p.x, cy: p.y, r: 14, fill: 'transparent', cursor: 'pointer',
            onMouseEnter: function(e) { showTip(e, [{ text: _fmtDate(d[opts.labelKey]) || label, bold: true }].concat([{ text: (opts.valueLabel || 'Value') + ': ' + val }]).concat(extra)); },
            onMouseMove: function(e) { showTip(e, [{ text: _fmtDate(d[opts.labelKey]) || label, bold: true }].concat([{ text: (opts.valueLabel || 'Value') + ': ' + val }]).concat(extra)); },
            onMouseLeave: hideTip
          });
        }),
        // Visible dots — skip synthetic points
        points.map(function(p, i) {
          if (p.d._synth) return null;
          return h('circle', { key: 'dot' + i, cx: p.x, cy: p.y, r: 4, fill: color, stroke: 'var(--bg-card)', strokeWidth: 2, style: { pointerEvents: 'none' } });
        })
      )
    );
  };

  var renderBarChart = function(data, opts) {
    if (!data || data.length === 0) return _noData();
    // Horizontal bar chart — better for agent names (no truncation, scales to any count)
    var labelMaxLen = data.reduce(function(m, d) { return Math.max(m, (d[opts.labelKey] || '').length); }, 0);
    var labelW = Math.max(80, Math.min(160, labelMaxLen * 7.5));
    var barH = 28, rowGap = 8;
    var W = opts.width || 560;
    var H = data.length * (barH + rowGap) + 24;
    var barAreaW = W - labelW - 60; // space for label + value text

    var vals = data.map(function(d) { return d[opts.valueKey] || 0; });
    var maxV = Math.max.apply(null, vals.concat([1]));

    return h('div', { style: { position: 'relative' } },
      data.map(function(d, i) {
        var val = d[opts.valueKey] || 0;
        var pct = (val / maxV) * 100;
        var color = CHART_COLORS[i % CHART_COLORS.length];
        var label = d[opts.labelKey] || '';
        var extra = d.avgConfidence != null ? [{ text: 'Confidence: ' + Math.round(d.avgConfidence * 100) + '%', color: 'var(--text-muted)' }] : [];
        return h('div', {
          key: 'bar' + i,
          style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: rowGap, cursor: 'pointer' },
          onMouseEnter: function(e) { showTip(e, [{ text: label, bold: true }, { text: 'Contributions: ' + val, dot: color }].concat(extra)); },
          onMouseMove: function(e) { showTip(e, [{ text: label, bold: true }, { text: 'Contributions: ' + val, dot: color }].concat(extra)); },
          onMouseLeave: hideTip
        },
          // Agent name
          h('span', { style: { fontSize: 13, fontWeight: 500, minWidth: labelW, maxWidth: labelW, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
          // Bar
          h('div', { style: { flex: 1, height: barH, background: 'var(--bg-tertiary)', borderRadius: 6, overflow: 'hidden', position: 'relative' } },
            h('div', {
              style: {
                width: Math.max(pct, 2) + '%', height: '100%', borderRadius: 6,
                background: 'linear-gradient(90deg, ' + color + ', ' + color + 'aa)',
                transition: 'width 0.4s ease'
              }
            })
          ),
          // Value
          h('span', { style: { fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: 'right', color: color } }, val)
        );
      })
    );
  };

  var renderDonutChart = function(data, opts) {
    if (!data || data.length === 0) return _noData();
    var size = opts.size || 180, cx = size / 2, cy = size / 2, r = size * 0.38, inner = r * 0.58;
    var total = data.reduce(function(s, d) { return s + (d[opts.valueKey] || 0); }, 0) || 1;
    var slices = [];
    var angle = -Math.PI / 2;
    data.forEach(function(d, i) {
      var pct = (d[opts.valueKey] || 0) / total;
      var startAngle = angle;
      var endAngle = angle + pct * Math.PI * 2;
      var large = pct > 0.5 ? 1 : 0;
      var x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
      var ix1 = cx + inner * Math.cos(startAngle), iy1 = cy + inner * Math.sin(startAngle);
      var ix2 = cx + inner * Math.cos(endAngle), iy2 = cy + inner * Math.sin(endAngle);
      if (pct > 0.001) {
        slices.push({
          d: 'M' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' L' + ix2.toFixed(2) + ',' + iy2.toFixed(2) + ' A' + inner + ',' + inner + ' 0 ' + large + ' 0 ' + ix1.toFixed(2) + ',' + iy1.toFixed(2) + ' Z',
          color: CHART_COLORS[i % CHART_COLORS.length],
          label: d[opts.labelKey] || '',
          count: d[opts.valueKey] || 0,
          pct: Math.round(pct * 100)
        });
      }
      angle = endAngle;
    });

    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' } },
      h('svg', { viewBox: '0 0 ' + size + ' ' + size, style: { width: size, height: size, flexShrink: 0 } },
        slices.map(function(s, i) {
          return h('path', {
            key: i, d: s.d, fill: s.color, cursor: 'pointer',
            style: { transition: 'opacity 0.15s' },
            onMouseEnter: function(e) { showTip(e, [{ text: s.label, bold: true }, { text: s.count + ' contributions (' + s.pct + '%)', dot: s.color }]); e.target.style.opacity = '0.8'; },
            onMouseMove: function(e) { showTip(e, [{ text: s.label, bold: true }, { text: s.count + ' contributions (' + s.pct + '%)', dot: s.color }]); },
            onMouseLeave: function(e) { hideTip(); e.target.style.opacity = '1'; }
          });
        }),
        h('text', { x: cx, y: cy - 6, textAnchor: 'middle', fill: 'var(--text)', fontSize: 20, fontWeight: 700 }, total),
        h('text', { x: cx, y: cy + 12, textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 10 }, 'total')
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        slices.map(function(s, i) {
          return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } },
            h('div', { style: { width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 } }),
            h('span', { style: { fontWeight: 500, color: 'var(--text)' } }, s.label),
            h('span', { style: { color: 'var(--text-muted)' } }, s.count + ' (' + s.pct + '%)')
          );
        })
      )
    );
  };

  var renderConfidenceBand = function(data) {
    if (!data || data.length === 0) return _noData();
    var W = 560, H = 200, pad = { top: 16, right: 16, bottom: 32, left: 44 };
    var cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    var color = '#8b5cf6';

    // Single data point: expand into 3 so we get a visible line
    if (data.length === 1) {
      var d0 = data[0];
      data = [
        Object.assign({}, d0, { _synth: true }),
        d0,
        Object.assign({}, d0, { _synth: true })
      ];
    }

    // Map data to points — same structure as line chart
    var points = data.map(function(d, i) {
      var x = pad.left + (i / (data.length - 1)) * cW;
      return { x: x, y: pad.top + cH - (d.avgConfidence || 0) * cH, d: d };
    });

    // Reuse line chart's smooth curve function (catmull-rom)
    var smoothPath = function(pts) {
      if (pts.length < 2) return 'M' + pts[0].x + ',' + pts[0].y;
      if (pts.length === 2) return 'M' + pts[0].x + ',' + pts[0].y + ' L' + pts[1].x + ',' + pts[1].y;
      var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        var cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
        var cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
      }
      return d;
    };

    var linePath = smoothPath(points);
    var areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (pad.top + cH) + ' L' + points[0].x.toFixed(1) + ',' + (pad.top + cH) + ' Z';

    // Y labels
    var yLabels = [
      { val: '0%', y: pad.top + cH },
      { val: '50%', y: pad.top + cH / 2 },
      { val: '100%', y: pad.top }
    ];

    // X labels
    var xStep = Math.max(1, Math.ceil(data.length / 6));
    var xLabels = [];
    data.forEach(function(d, i) {
      if (i % xStep === 0 || i === data.length - 1) {
        var x = pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
        var raw = d.week || '';
        var label = raw ? new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        xLabels.push({ x: x, label: label });
      }
    });

    var _confTip = function(d) {
      return [
        { text: 'Week of ' + _fmtDate(d.week), bold: true },
        { text: 'Avg: ' + Math.round((d.avgConfidence || 0) * 100) + '%', dot: color },
        { text: 'Min: ' + Math.round((d.minConfidence || 0) * 100) + '%', color: 'var(--text-muted)' },
        { text: 'Max: ' + Math.round((d.maxConfidence || 0) * 100) + '%', color: 'var(--text-muted)' },
        { text: d.count + ' contributions' }
      ];
    };

    return h('div', { style: { position: 'relative' } },
      h('svg', { viewBox: '0 0 ' + W + ' ' + H, style: { width: '100%', maxWidth: W, height: 'auto', display: 'block' } },
        h('defs', null,
          h('linearGradient', { id: 'confGrad', x1: 0, y1: 0, x2: 0, y2: 1 },
            h('stop', { offset: '0%', stopColor: color, stopOpacity: 0.2 }),
            h('stop', { offset: '100%', stopColor: color, stopOpacity: 0.02 })
          )
        ),
        // Y labels
        yLabels.map(function(yl, i) {
          return h('text', { key: 'yl' + i, x: pad.left - 8, y: yl.y + 4, textAnchor: 'end', fill: 'var(--text-muted)', fontSize: 10 }, yl.val);
        }),
        // X labels
        xLabels.map(function(xl, i) {
          return h('text', { key: 'xl' + i, x: xl.x, y: H - 6, textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 10 }, xl.label);
        }),
        // Area fill
        h('path', { d: areaPath, fill: 'url(#confGrad)' }),
        // Line
        h('path', { d: linePath, fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        // Hit areas (invisible, wide) — skip synthetic
        points.map(function(p, i) {
          if (p.d._synth) return null;
          return h('circle', {
            key: 'hit' + i, cx: p.x, cy: p.y, r: 14, fill: 'transparent', cursor: 'pointer',
            onMouseEnter: function(e) { showTip(e, _confTip(p.d)); },
            onMouseMove: function(e) { showTip(e, _confTip(p.d)); },
            onMouseLeave: hideTip
          });
        }),
        // Visible dots — skip synthetic
        points.map(function(p, i) {
          if (p.d._synth) return null;
          return h('circle', { key: 'dot' + i, cx: p.x, cy: p.y, r: 4, fill: color, stroke: 'var(--bg-card)', strokeWidth: 2, style: { pointerEvents: 'none' } });
        })
      )
    );
  };

  var renderStats = function() {
    var td = timelineData || {};
    var timeline = td.timeline || [];
    var byAgent = td.byAgent || [];
    var byCategory = td.byCategory || [];
    var confOverTime = td.confidenceOverTime || [];
    var agentDaily = td.agentDaily || [];

    return h(Fragment, null,
      // Summary stat cards
      h('div', { className: 'stat-grid', style: { marginBottom: 24 } },
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalBases != null ? stats.totalBases : bases.length),
          h('div', { className: 'stat-label' }, 'Knowledge Bases')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalEntries != null ? stats.totalEntries : 0),
          h('div', { className: 'stat-label' }, 'Total Contributions')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' }, stats.totalContributors != null ? stats.totalContributors : 0),
          h('div', { className: 'stat-label' }, 'Active Contributors')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-value' },
            byAgent.length > 0 ? Math.round(byAgent.reduce(function(s, a) { return s + a.avgConfidence; }, 0) / byAgent.length * 100) + '%' : '-'
          ),
          h('div', { className: 'stat-label' }, 'Avg Confidence')
        )
      ),

      // Filter bar
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' } },
        h('select', {
          value: chartDays,
          onChange: function(e) { setChartDays(parseInt(e.target.value)); },
          style: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 12 }
        },
          h('option', { value: 7 }, 'Last 7 days'),
          h('option', { value: 14 }, 'Last 14 days'),
          h('option', { value: 30 }, 'Last 30 days'),
          h('option', { value: 60 }, 'Last 60 days'),
          h('option', { value: 90 }, 'Last 90 days')
        ),
        h('select', {
          value: chartAgent,
          onChange: function(e) { setChartAgent(e.target.value); },
          style: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 12 }
        },
          h('option', { value: '' }, 'All agents'),
          agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.config && a.config.identity && a.config.identity.name || a.name || a.id); })
        ),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: loadTimeline }, I.refresh(), ' Refresh')
      ),

      // Row 1: two charts side by side
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 } },
        h('div', { className: 'card' },
          h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Contributions Over Time', h(HelpButton, { label: 'Contributions Over Time' },
            h('p', null, 'Shows how many knowledge entries agents contributed each day over the selected time period.'),
            h('h4', { style: _h4 }, 'What to look for'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Rising trend'), ' \u2014 Your team is actively learning and sharing more knowledge over time.'),
              h('li', null, h('strong', null, 'Spikes'), ' \u2014 May indicate specific events (new product launch, incident resolution) that generated lots of insights.'),
              h('li', null, h('strong', null, 'Gaps'), ' \u2014 Days with zero contributions. Consider encouraging agents to share what they learn daily.')
            ),
            h('div', { style: _tip }, 'Tip: Hover over any data point to see the exact date and contribution count.')
          ))),
          h('div', { className: 'card-body', style: { padding: 16 } },
            renderLineChart(timeline, { valueKey: 'count', labelKey: 'day', color: '#6366f1', width: 560, height: 200, id: 'contribs', valueLabel: 'Contributions' })
          )
        ),
        h('div', { className: 'card' },
          h('div', { className: 'card-header' },
            h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Confidence Level Over Time', h(HelpButton, { label: 'Confidence Level Over Time' },
              h('p', null, 'Tracks the average confidence level of agent contributions over time. Confidence is a 0\u2013100% score indicating how certain the agent is about the accuracy of the knowledge it shared.'),
              h('h4', { style: _h4 }, 'What to look for'),
              h('ul', { style: _ul },
                h('li', null, h('strong', null, 'High confidence (80%+)'), ' \u2014 Agents are sharing well-verified, reliable knowledge.'),
                h('li', null, h('strong', null, 'Low confidence (<50%)'), ' \u2014 Agents may be sharing uncertain or speculative information. Consider reviewing those entries.'),
                h('li', null, h('strong', null, 'Rising trend'), ' \u2014 Knowledge quality is improving as agents learn and refine what they share.')
              ),
              h('div', { style: _tip }, 'Tip: Hover over data points to see the exact average, min, and max confidence for each week.')
            )),
            h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Average confidence across all contributions')
          ),
          h('div', { className: 'card-body', style: { padding: 16 } },
            renderConfidenceBand(confOverTime)
          )
        )
      ),

      // Row 2: two charts side by side
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 } },
        h('div', { className: 'card' },
          h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Contributions by Agent', h(HelpButton, { label: 'Contributions by Agent' },
            h('p', null, 'Compares how much each agent is contributing to the shared knowledge base over the selected time period.'),
            h('h4', { style: _h4 }, 'What to look for'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Even distribution'), ' \u2014 All agents are actively contributing. Healthy knowledge-sharing culture.'),
              h('li', null, h('strong', null, 'One dominant agent'), ' \u2014 Knowledge may be siloed. Encourage other agents to share their learnings.'),
              h('li', null, h('strong', null, 'Agents with zero'), ' \u2014 May need a contribution schedule or prompting to capture what they learn.')
            ),
            h('div', { style: _tip }, 'Tip: Hover over any bar to see the agent\'s total count and average confidence score.')
          ))),
          h('div', { className: 'card-body', style: { padding: 16 } },
            renderBarChart(byAgent, { valueKey: 'count', labelKey: 'agentName', width: 560, height: 220 })
          )
        ),
        h('div', { className: 'card' },
          h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Category Distribution', h(HelpButton, { label: 'Category Distribution' },
            h('p', null, 'Breaks down contributions by their importance category. Shows what type of knowledge agents are capturing most frequently.'),
            h('h4', { style: _h4 }, 'What to look for'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Mostly "high" importance'), ' \u2014 Agents are focused on capturing critical knowledge. Great for incident response and decision-making.'),
              h('li', null, h('strong', null, 'Mostly "low" importance'), ' \u2014 Consider guiding agents to prioritize more impactful insights.'),
              h('li', null, h('strong', null, 'Balanced mix'), ' \u2014 Healthy distribution across all knowledge types.')
            ),
            h('div', { style: _tip }, 'Tip: Hover over any slice to see the exact count and percentage for that category.')
          ))),
          h('div', { className: 'card-body', style: { padding: 16, display: 'flex', justifyContent: 'center' } },
            renderDonutChart(byCategory, { valueKey: 'count', labelKey: 'category', size: 180 })
          )
        )
      ),

      // 5. Agent Confidence Comparison (horizontal bars)
      byAgent.length > 0 && h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Agent Quality Comparison', h(HelpButton, { label: 'Agent Quality Comparison' },
          h('p', null, 'A side-by-side view of each agent\'s contribution volume and average confidence score. Helps assess both the quantity and quality of knowledge sharing.'),
          h('h4', { style: _h4 }, 'Reading the bars'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Contributions bar'), ' \u2014 How many entries the agent contributed, relative to the top contributor.'),
            h('li', null, h('strong', null, 'Confidence bar'), ' \u2014 The agent\'s average confidence. Green (80%+) = high quality, yellow (50\u201380%) = moderate, red (<50%) = needs review.')
          ),
          h('div', { style: _tip }, 'Tip: An agent with fewer contributions but high confidence may be more valuable than one with many low-confidence entries.')
        ))),
        h('div', { className: 'card-body' },
          byAgent.map(function(agent, i) {
            var confPct = Math.round((agent.avgConfidence || 0) * 100);
            var confColor = confPct >= 80 ? 'var(--success)' : confPct >= 50 ? 'var(--warning)' : 'var(--danger)';
            return h('div', { key: agent.agentId, style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
              h('div', { style: { width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 } }),
              h('span', { style: { fontSize: 13, fontWeight: 500, minWidth: 100 } }, agent.agentName),
              h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3 } },
                // Contribution count bar
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { fontSize: 10, color: 'var(--text-muted)', minWidth: 70 } }, 'Contributions'),
                  h('div', { style: { flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' } },
                    h('div', { style: { width: Math.round((agent.count / (byAgent[0].count || 1)) * 100) + '%', height: '100%', background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 4 } })
                  ),
                  h('span', { style: { fontSize: 11, fontWeight: 600, minWidth: 30 } }, agent.count)
                ),
                // Confidence bar
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { fontSize: 10, color: 'var(--text-muted)', minWidth: 70 } }, 'Confidence'),
                  h('div', { style: { flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' } },
                    h('div', { style: { width: confPct + '%', height: '100%', background: confColor, borderRadius: 4 } })
                  ),
                  h('span', { style: { fontSize: 11, fontWeight: 600, minWidth: 30 } }, confPct + '%')
                )
              )
            );
          })
        )
      ),

      // 6. Daily heatmap-style table if multiple agents
      agentDaily.length > 0 && h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Daily Activity Breakdown', h(HelpButton, { label: 'Daily Activity Breakdown' },
          h('p', null, 'A heatmap showing which agents contributed on which days. Each cell represents one agent\'s activity on one day.'),
          h('h4', { style: _h4 }, 'Reading the heatmap'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Darker cells'), ' \u2014 More contributions on that day. The color intensity scales with the count.'),
            h('li', null, h('strong', null, 'Empty cells'), ' \u2014 No contributions from that agent on that day.'),
            h('li', null, h('strong', null, 'Patterns'), ' \u2014 Look for weekday vs weekend differences, or agents that contribute in bursts vs steadily.')
          ),
          h('div', { style: _tip }, 'Tip: Each agent gets a unique color so you can quickly scan across rows to see activity patterns.')
        ))),
        h('div', { className: 'card-body', style: { overflowX: 'auto' } },
          function() {
            // Build a grid: rows = agents, columns = days
            var agentNames = {};
            var daySet = {};
            agentDaily.forEach(function(r) {
              agentNames[r.agentId] = r.agentName;
              daySet[r.day] = true;
            });
            var uniqueAgents = Object.keys(agentNames);
            var days = Object.keys(daySet).sort();
            var maxCount = agentDaily.reduce(function(m, r) { return Math.max(m, r.count); }, 1);

            return h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
              h('thead', null,
                h('tr', null,
                  h('th', { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' } }, 'Agent'),
                  days.map(function(d) {
                    return h('th', { key: d, style: { textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)' } },
                      new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    );
                  })
                )
              ),
              h('tbody', null,
                uniqueAgents.map(function(agId, ai) {
                  return h('tr', { key: agId },
                    h('td', { style: { padding: '6px 8px', fontWeight: 500 } }, agentNames[agId]),
                    days.map(function(d) {
                      var match = agentDaily.find(function(r) { return r.agentId === agId && r.day === d; });
                      var cnt = match ? match.count : 0;
                      var opacity = cnt > 0 ? 0.2 + (cnt / maxCount) * 0.8 : 0;
                      var bg = cnt > 0 ? CHART_COLORS[ai % CHART_COLORS.length] : 'transparent';
                      return h('td', { key: d, style: { textAlign: 'center', padding: '4px' } },
                        h('div', {
                          style: {
                            width: 28, height: 28, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: bg, opacity: opacity > 0 ? opacity : undefined,
                            color: opacity > 0.5 ? '#fff' : 'var(--text-muted)', fontSize: 10, fontWeight: 600
                          }
                        }, cnt > 0 ? cnt : '')
                      );
                    })
                  );
                })
              )
            );
          }()
        )
      )
    );
  };

  // ── Search Metrics Tab ─────────────────────────

  var loadSearchMetrics = function() {
    var url = '/knowledge-contribution/search-metrics?days=' + searchDays;
    if (searchAgentFilter) url += '&agentId=' + searchAgentFilter;
    engineCall(url).then(function(d) { setSearchMetrics(d); }).catch(function() { setSearchMetrics(null); });
  };

  var renderSearchMetrics = function() {
    if (!searchMetrics && tab === 'searchMetrics') {
      loadSearchMetrics();
    }
    var m = searchMetrics;

    return h('div', null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 } },
        h('span', { style: { fontSize: 14, fontWeight: 600 } }, 'Search Metrics'),
        h(HelpButton, { label: 'Search Metrics' },
          h('p', null, 'Track how agents are searching your knowledge bases. This helps you understand which bases are useful and where there are gaps.'),
          h('h4', { style: _h4 }, 'Key Metrics'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Total Searches'), ' — How many times agents searched knowledge bases in the selected period.'),
            h('li', null, h('strong', null, 'KB vs Hub Searches'), ' — KB searches target a specific knowledge base; Hub searches query across all bases.'),
            h('li', null, h('strong', null, 'Hit Rate'), ' — Percentage of searches that returned useful results. Low hit rates mean agents are searching for things not in your knowledge bases.'),
            h('li', null, h('strong', null, 'Avg Results'), ' — Average number of results per search. Too few = gaps in content; too many = content may be too broad.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'If hit rate is low, check the "Top Queries with No Results" section to see what\'s missing from your knowledge bases, then import relevant content.')
        )
      ),
      // Filters
      h('div', { style: { display: 'flex', gap: 12, marginBottom: 20 } },
        h('select', {
          className: 'input', style: { width: 140 },
          value: searchDays,
          onChange: function(e) { setSearchDays(parseInt(e.target.value)); setTimeout(loadSearchMetrics, 100); }
        },
          h('option', { value: 7 }, 'Last 7 days'),
          h('option', { value: 14 }, 'Last 14 days'),
          h('option', { value: 30 }, 'Last 30 days')
        ),
        agents.length > 0 && h('select', {
          className: 'input', style: { width: 180 },
          value: searchAgentFilter,
          onChange: function(e) { setSearchAgentFilter(e.target.value); setTimeout(loadSearchMetrics, 100); }
        },
          h('option', { value: '' }, 'All Agents'),
          agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.name || a.id); })
        ),
        h('button', { className: 'btn btn-ghost', onClick: loadSearchMetrics }, I.refresh(), ' Refresh')
      ),

      !m ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading search metrics...') :
      m.totalSearches === 0 ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } },
        h('div', { style: { fontSize: 48, marginBottom: 12 } }, I.search()),
        h('div', { style: { fontSize: 18, fontWeight: 600, marginBottom: 8 } }, 'No searches yet'),
        h('div', null, 'Agents will show up here once they start using knowledge_base_search and knowledge_hub_search tools.')
      ) :
      h(Fragment, null,
        // Summary cards
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 } },
          _metricCard('Total Searches', m.totalSearches, I.search()),
          _metricCard('KB Searches', m.kbSearches, I.database()),
          _metricCard('Hub Searches', m.hubSearches, I.brain()),
          _metricCard('Hit Rate', m.hitRate + '%', I.check(), m.hitRate >= 50 ? 'var(--success)' : m.hitRate >= 25 ? 'var(--warning)' : 'var(--error)')
        ),

        // By agent breakdown
        Object.keys(m.byAgent || {}).length > 0 && h('div', { className: 'card', style: { marginBottom: 20, padding: 16 } },
          h('h3', { style: { marginBottom: 12 } }, 'Search Efficiency by Agent'),
          h('table', { className: 'table', style: { width: '100%' } },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Agent'),
                h('th', { style: { textAlign: 'right' } }, 'Total'),
                h('th', { style: { textAlign: 'right' } }, 'Helpful'),
                h('th', { style: { textAlign: 'right' } }, 'Hit Rate')
              )
            ),
            h('tbody', null,
              Object.entries(m.byAgent).map(function(entry) {
                var aid = entry[0], d = entry[1];
                var agentName = (agents.find(function(a) { return a.id === aid; }) || {}).name || aid;
                return h('tr', { key: aid },
                  h('td', null, agentName),
                  h('td', { style: { textAlign: 'right' } }, d.total),
                  h('td', { style: { textAlign: 'right' } }, d.helpful),
                  h('td', { style: { textAlign: 'right', color: d.hitRate >= 50 ? 'var(--success)' : d.hitRate >= 25 ? 'var(--warning)' : 'var(--error)' } },
                    d.hitRate + '%')
                );
              })
            )
          )
        ),

        // Timeline
        (m.timeline || []).length > 0 && h('div', { className: 'card', style: { marginBottom: 20, padding: 16 } },
          h('h3', { style: { marginBottom: 12 } }, 'Search Activity Over Time'),
          h('div', { style: { display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 } },
            m.timeline.map(function(day) {
              var maxVal = Math.max.apply(null, m.timeline.map(function(d) { return d.kb + d.hub; })) || 1;
              var total = day.kb + day.hub;
              var height = Math.max(4, (total / maxVal) * 100);
              var helpfulPct = total > 0 ? day.helpful / total : 0;
              return h('div', { key: day.date, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
                h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 } }, total),
                h('div', {
                  style: {
                    width: '100%', maxWidth: 40, height: height + '%', minHeight: 4,
                    background: helpfulPct >= 0.5 ? 'var(--success)' : helpfulPct >= 0.25 ? 'var(--warning)' : 'var(--primary)',
                    borderRadius: 3, opacity: 0.8
                  },
                  title: day.date + ': ' + total + ' searches (' + day.helpful + ' helpful)'
                }),
                h('div', { style: { fontSize: 9, color: 'var(--text-muted)', marginTop: 4, transform: 'rotate(-45deg)', whiteSpace: 'nowrap' } },
                  day.date.slice(5))
              );
            })
          )
        ),

        // Recent searches
        (m.recent || []).length > 0 && h('div', { className: 'card', style: { padding: 16 } },
          h('h3', { style: { marginBottom: 12 } }, 'Recent Searches'),
          h('table', { className: 'table', style: { width: '100%' } },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Agent'),
                h('th', null, 'Type'),
                h('th', null, 'Query'),
                h('th', { style: { textAlign: 'right' } }, 'Results'),
                h('th', { style: { textAlign: 'right' } }, 'Score'),
                h('th', null, 'Helpful'),
                h('th', null, 'Time')
              )
            ),
            h('tbody', null,
              m.recent.map(function(r) {
                var agentName = (agents.find(function(a) { return a.id === r.agentId; }) || {}).name || r.agentId;
                return h('tr', { key: r.id },
                  h('td', null, agentName),
                  h('td', null, h('span', {
                    className: 'badge',
                    style: { background: r.type === 'knowledge_base' ? 'var(--primary)' : 'var(--info)', color: 'white', fontSize: 11 }
                  }, r.type === 'knowledge_base' ? 'KB' : 'Hub')),
                  h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.query),
                  h('td', { style: { textAlign: 'right' } }, r.results),
                  h('td', { style: { textAlign: 'right' } }, r.topScore ? (r.topScore * 100).toFixed(0) + '%' : '-'),
                  h('td', null, r.helpful ? h('span', { style: { color: 'var(--success)' } }, '\u2713') : h('span', { style: { color: 'var(--text-muted)' } }, '\u2717')),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, _fmtSearchTime(r.timestamp))
                );
              })
            )
          )
        )
      )
    );
  };

  // ── Tab labels ──────────────────────────────
  var tabDefs = [
    { key: 'bases', label: 'Knowledge Bases', icon: I.knowledge },
    { key: 'contributions', label: 'Contributions', icon: I.edit },
    { key: 'schedules', label: 'Schedules', icon: I.calendar },
    { key: 'stats', label: 'Stats', icon: I.chart },
    { key: 'searchMetrics', label: 'Search Metrics', icon: I.search }
  ];

  return h(Fragment, null,
    // Org context switcher
    h(orgCtx.Switcher),

    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Knowledge Contributions',
          h(KnowledgeLink, { page: 'knowledge-contributions' }),
          h(HelpButton, { label: 'Knowledge Contributions' },
            h('p', null, 'This is where your agents build shared organizational knowledge. Agents contribute what they learn from conversations, tasks, and research into knowledge bases that all agents can search.'),
            h('h4', { style: _h4 }, 'Tabs'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Knowledge Bases'), ' — Create and manage knowledge bases. Each is a collection of documents that agents can search via RAG (Retrieval-Augmented Generation).'),
              h('li', null, h('strong', null, 'Contributions'), ' — Browse individual knowledge entries that agents have contributed. Filter by agent, search by content, and review quality.'),
              h('li', null, h('strong', null, 'Schedules'), ' — Automate knowledge contributions on a schedule (e.g., weekly synthesis of learnings).'),
              h('li', null, h('strong', null, 'Stats'), ' — Charts showing contribution volume, confidence levels, category distribution, and agent quality over time.'),
              h('li', null, h('strong', null, 'Search Metrics'), ' — How agents are using knowledge search — query volume, hit rates, and which bases are most useful.')
            ),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Start by creating a knowledge base, then enable knowledge contributions in each agent\'s Autonomy settings. Agents will automatically contribute what they learn.')
          )
        ),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } },
          'Collaborative knowledge building from agent memories and experiences'
        )
      ),
      h('button', { className: 'btn btn-ghost', onClick: load }, I.refresh(), ' Refresh')
    ),

    // Tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      tabDefs.map(function(td) {
        return h('button', {
          key: td.key,
          className: 'tab' + (tab === td.key ? ' active' : ''),
          onClick: function() { setTab(td.key); },
          style: { display: 'flex', alignItems: 'center', gap: 6 }
        }, td.icon(), td.label);
      })
    ),

    // Tab content
    tab === 'bases' && renderBases(),
    tab === 'contributions' && renderContributions(),
    tab === 'schedules' && renderSchedules(),
    tab === 'stats' && renderStats(),
    tab === 'searchMetrics' && renderSearchMetrics(),

    // Tooltip overlay
    renderTooltip(),

    // ── Contribution Detail Modal ────────────────────────
    selectedContrib && h(Modal, {
      title: selectedContrib.title || 'Contribution Detail',
      onClose: function() { setSelectedContrib(null); },
      footer: h('button', { className: 'btn btn-secondary', onClick: function() { setSelectedContrib(null); } }, 'Close')
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { style: { display: 'flex', gap: 20, flexWrap: 'wrap' } },
          h('div', null, h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Agent'), h('div', null, renderAgentBadge(selectedContrib.agentId, agentData))),
          h('div', null, h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Category'), h('div', null, selectedContrib.category || '-')),
          h('div', null, h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Importance'), h('div', null, selectedContrib.importance || '-')),
          h('div', null, h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Confidence'), h('div', null, selectedContrib.confidence != null ? (selectedContrib.confidence * 100).toFixed(0) + '%' : '-')),
          h('div', null, h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Source'), h('div', null, selectedContrib.source || '-')),
          h('div', null, h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Date'), h('div', null, selectedContrib.createdAt || selectedContrib.date ? new Date(selectedContrib.createdAt || selectedContrib.date).toLocaleString() : '-'))
        ),
        selectedContrib.tags && h('div', null,
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Tags'),
          h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 } },
            (Array.isArray(selectedContrib.tags) ? selectedContrib.tags : (selectedContrib.tags || '').split(',')).filter(Boolean).map(function(t) {
              return h('span', { key: t, className: 'badge', style: { fontSize: 11 } }, t.trim());
            })
          )
        ),
        h('div', null,
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Content'),
          h('div', {
            style: { marginTop: 6, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, maxHeight: 400, overflowY: 'auto' }
          }, selectedContrib.content || 'No content')
        )
      )
    ),

    // ── Create Base Modal ──────────────────────────────
    showCreateBase && h(Modal, {
      title: 'Create Knowledge Base',
      onClose: function() { setShowCreateBase(false); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowCreateBase(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: createBase, disabled: !baseForm.name }, 'Create')
      )
    },
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Name'),
        h('input', {
          className: 'input', style: { width: '100%' },
          value: baseForm.name,
          onChange: function(e) { setBaseForm(function(f) { return Object.assign({}, f, { name: e.target.value }); }); },
          placeholder: 'e.g. Customer Support Knowledge'
        })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Description'),
        h('textarea', {
          className: 'input', style: { width: '100%', minHeight: 80 },
          value: baseForm.description,
          onChange: function(e) { setBaseForm(function(f) { return Object.assign({}, f, { description: e.target.value }); }); },
          placeholder: 'Describe what this knowledge base is for...'
        })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Role'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: baseForm.role,
          onChange: function(e) { setBaseForm(function(f) { return Object.assign({}, f, { role: e.target.value }); }); }
        },
          h('option', { value: '' }, 'Select a role...'),
          roles.map(function(r) { return h('option', { key: r.id || r.name || r, value: r.id || r.name || r }, r.label || r.name || r); })
        )
      )
    ),

    // ── Trigger Contribution Modal ──────────────────────────────
    showTrigger && h(Modal, {
      title: 'Trigger Contribution',
      onClose: function() { setShowTrigger(false); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowTrigger(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: triggerContribution, disabled: !triggerAgent }, 'Trigger')
      )
    },
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Agent ID'),
        h('input', {
          className: 'input', style: { width: '100%' },
          value: triggerAgent,
          onChange: function(e) { setTriggerAgent(e.target.value); },
          placeholder: 'Enter agent ID...'
        })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Target Knowledge Base (optional)'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: triggerBase,
          onChange: function(e) { setTriggerBase(e.target.value); }
        },
          h('option', { value: '' }, 'All eligible bases'),
          bases.map(function(b) { return h('option', { key: b.id, value: b.id }, b.name); })
        )
      ),
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'This will scan the agent\'s recent memories and contribute qualifying entries to the selected knowledge base.')
    ),

    // ── Create/Edit Schedule Modal ──────────────────────────────
    (showCreateSchedule || editSchedule) && h(Modal, {
      title: editSchedule ? 'Edit Schedule' : 'Create Schedule',
      onClose: function() { setShowCreateSchedule(false); setEditSchedule(null); setScheduleForm({ agentId: '', targetBaseId: '', frequency: 'weekly', dayOfWeek: 'monday', minConfidence: 0.7 }); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowCreateSchedule(false); setEditSchedule(null); } }, 'Cancel'),
        editSchedule
          ? h('button', { className: 'btn btn-primary', onClick: updateSchedule }, 'Update')
          : h('button', { className: 'btn btn-primary', onClick: createSchedule, disabled: !scheduleForm.agentId || !scheduleForm.targetBaseId }, 'Create')
      )
    },
      !editSchedule && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Agent ID'),
        h('input', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.agentId,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { agentId: e.target.value }); }); },
          placeholder: 'Enter agent ID...'
        })
      ),
      !editSchedule && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Target Knowledge Base'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.targetBaseId,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { targetBaseId: e.target.value }); }); }
        },
          h('option', { value: '' }, 'Select a base...'),
          bases.map(function(b) { return h('option', { key: b.id, value: b.id }, b.name); })
        )
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Frequency'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.frequency,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { frequency: e.target.value }); }); }
        },
          h('option', { value: 'hourly' }, 'Hourly'),
          h('option', { value: 'daily' }, 'Daily'),
          h('option', { value: 'weekly' }, 'Weekly'),
          h('option', { value: 'monthly' }, 'Monthly')
        )
      ),
      scheduleForm.frequency === 'weekly' && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Day of Week'),
        h('select', {
          className: 'input', style: { width: '100%' },
          value: scheduleForm.dayOfWeek,
          onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { dayOfWeek: e.target.value }); }); }
        },
          ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(function(d) {
            return h('option', { key: d, value: d }, d.charAt(0).toUpperCase() + d.slice(1));
          })
        )
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Minimum Confidence Filter'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('input', {
            type: 'range', min: 0, max: 1, step: 0.05,
            style: { flex: 1 },
            value: scheduleForm.minConfidence,
            onChange: function(e) { setScheduleForm(function(f) { return Object.assign({}, f, { minConfidence: parseFloat(e.target.value) }); }); }
          }),
          h('span', { style: { fontSize: 13, fontWeight: 600, minWidth: 40 } }, Math.round(scheduleForm.minConfidence * 100) + '%')
        )
      )
    )
  );
}

function _pgBtn(active) {
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-card)', color: active ? '#fff' : 'var(--text)',
    cursor: 'pointer', fontSize: 12,
  };
}

function _metricCard(label, value, icon, color) {
  return h('div', { className: 'card', style: { padding: 16, textAlign: 'center' } },
    h('div', { style: { fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 } }, icon, ' ', label),
    h('div', { style: { fontSize: 28, fontWeight: 700, color: color || 'var(--text)' } }, value)
  );
}

function _fmtSearchTime(ts) {
  if (!ts) return '-';
  var d = new Date(ts);
  var now = new Date();
  var isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
