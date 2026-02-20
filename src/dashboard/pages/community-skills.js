import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';

export function CommunitySkillsPage() {
  const { toast, user } = useApp();
  const [tab, setTab] = useState('browse');
  const [skills, setSkills] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [filters, setFilters] = useState({ category: '', risk: '', sortBy: 'newest' });
  const [detail, setDetail] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: '' });

  // Updates state
  var [updateConfig, setUpdateConfig] = useState({ autoUpdate: false, checkInterval: 'daily', maxRiskLevel: 'medium' });
  var [availableUpdates, setAvailableUpdates] = useState([]);
  var [updateHistory, setUpdateHistory] = useState([]);
  var [updateStats, setUpdateStats] = useState({});
  var [checkingUpdates, setCheckingUpdates] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.risk) params.set('risk', filters.risk);
    params.set('sortBy', filters.sortBy);
    params.set('limit', '50');

    engineCall('/community/skills?' + params.toString())
      .then(d => { setSkills(d.skills || []); setTotal(d.total || 0); })
      .catch(() => {});
    engineCall('/community/installed?orgId=default')
      .then(d => setInstalled(d.installed || []))
      .catch(() => {});
    engineCall('/community/skills/featured')
      .then(d => setFeatured(d.skills || []))
      .catch(() => {});
    engineCall('/community/skills/categories')
      .then(d => setCategories(d.categories || []))
      .catch(() => {});
    engineCall('/community/skills/stats')
      .then(d => setStats(d || {}))
      .catch(() => {});
  }, [filters]);

  var loadUpdates = useCallback(function() {
    engineCall('/skill-updates/config?orgId=default')
      .then(function(d) { setUpdateConfig(d.config || d || { autoUpdate: false, checkInterval: 'daily', maxRiskLevel: 'medium' }); })
      .catch(function() {});
    engineCall('/skill-updates/available?orgId=default')
      .then(function(d) { setAvailableUpdates(d.updates || []); })
      .catch(function() {});
    engineCall('/skill-updates/history?orgId=default')
      .then(function(d) { setUpdateHistory(d.history || d.updates || []); })
      .catch(function() {});
    engineCall('/skill-updates/stats?orgId=default')
      .then(function(d) { setUpdateStats(d || {}); })
      .catch(function() {});
  }, []);

  useEffect(() => { load(); loadUpdates(); }, [load, loadUpdates]);

  const doSearch = useCallback((q) => {
    if (!q) { load(); return; }
    engineCall('/community/skills/search?q=' + encodeURIComponent(q) +
      (filters.category ? '&category=' + filters.category : '') +
      (filters.risk ? '&risk=' + filters.risk : ''))
      .then(d => { setSkills(d.skills || []); setTotal(d.total || 0); })
      .catch(() => {});
  }, [filters, load]);

  const onSearch = (q) => {
    setSearch(q);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => doSearch(q), 300));
  };

  const installSkill = async (skillId) => {
    try {
      await engineCall('/community/skills/' + skillId + '/install', {
        method: 'POST',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Skill installed', 'success');
      load();
    } catch (e) { toast(e.message || 'Install failed', 'error'); }
  };

  const uninstallSkill = async (skillId) => {
    try {
      await engineCall('/community/skills/' + skillId + '/uninstall', {
        method: 'DELETE',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Skill uninstalled', 'success');
      load();
    } catch (e) { toast(e.message || 'Uninstall failed', 'error'); }
  };

  const toggleSkill = async (skillId, enable) => {
    try {
      await engineCall('/community/skills/' + skillId + '/' + (enable ? 'enable' : 'disable'), {
        method: 'PUT',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Skill ' + (enable ? 'enabled' : 'disabled'), 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const openDetail = async (skill) => {
    setDetail(skill);
    const revs = await engineCall('/community/skills/' + skill.id + '/reviews').catch(() => ({ reviews: [] }));
    setReviews(revs.reviews || []);
  };

  const submitReview = async () => {
    if (!detail) return;
    try {
      await engineCall('/community/skills/' + detail.id + '/reviews', {
        method: 'POST',
        body: JSON.stringify({ rating: reviewForm.rating, reviewText: reviewForm.text, userName: user?.name || user?.email || undefined })
      });
      toast('Review submitted', 'success');
      setReviewForm({ rating: 5, text: '' });
      openDetail(detail);
    } catch (e) { toast(e.message, 'error'); }
  };

  const doImport = async () => {
    try {
      const result = await engineCall('/community/skills/import-github', {
        method: 'POST',
        body: JSON.stringify({ repoUrl: importUrl })
      });
      setImportResult(result);
    } catch (e) { toast(e.message, 'error'); }
  };

  const publishImported = async () => {
    if (!importResult?.manifest) return;
    try {
      await engineCall('/community/skills/publish', {
        method: 'POST',
        body: JSON.stringify({ manifest: importResult.manifest })
      });
      toast('Skill published', 'success');
      setShowImport(false);
      setImportResult(null);
      setImportUrl('');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Update actions
  var checkForUpdates = async function() {
    setCheckingUpdates(true);
    try {
      await engineCall('/skill-updates/check', {
        method: 'POST',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Update check complete', 'success');
      loadUpdates();
    } catch (e) { toast(e.message || 'Check failed', 'error'); }
    setCheckingUpdates(false);
  };

  var saveUpdateConfig = async function() {
    try {
      await engineCall('/skill-updates/config', {
        method: 'PUT',
        body: JSON.stringify({
          orgId: 'default',
          autoUpdate: updateConfig.autoUpdate,
          checkInterval: updateConfig.checkInterval,
          maxRiskLevel: updateConfig.maxRiskLevel
        })
      });
      toast('Update configuration saved', 'success');
    } catch (e) { toast(e.message || 'Save failed', 'error'); }
  };

  var applyUpdate = async function(updateId) {
    try {
      await engineCall('/skill-updates/apply/' + updateId, { method: 'POST' });
      toast('Update applied', 'success');
      loadUpdates();
      load();
    } catch (e) { toast(e.message || 'Apply failed', 'error'); }
  };

  var skipUpdate = async function(updateId) {
    try {
      await engineCall('/skill-updates/skip/' + updateId, { method: 'POST' });
      toast('Update skipped', 'success');
      loadUpdates();
    } catch (e) { toast(e.message || 'Skip failed', 'error'); }
  };

  var applyAllUpdates = async function() {
    try {
      await engineCall('/skill-updates/apply-all', {
        method: 'POST',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('All updates applied', 'success');
      loadUpdates();
      load();
    } catch (e) { toast(e.message || 'Apply all failed', 'error'); }
  };

  const installedIds = new Set(installed.map(i => i.skillId));

  // Build a set of skill IDs that have available updates
  var updatableSkillIds = new Set(availableUpdates.map(function(u) { return u.skillId; }));

  const riskColor = (r) =>
    r === 'critical' ? 'var(--danger)' :
    r === 'high' ? 'var(--warning)' :
    r === 'medium' ? 'var(--info)' : 'var(--text-muted)';

  const stars = (n) => '\u2605'.repeat(Math.round(n)) + '\u2606'.repeat(5 - Math.round(n));

  const skillIcon = (icon, size) => {
    size = size || 28;
    if (icon && (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:'))) {
      return h('img', { src: icon, alt: '', style: { width: size, height: size, objectFit: 'contain', borderRadius: 6 } });
    }
    return h('span', { style: { fontSize: size } }, icon || '\ud83e\udde9');
  };

  var updateStatusColor = function(s) {
    if (s === 'applied' || s === 'success') return 'var(--success)';
    if (s === 'pending' || s === 'available') return 'var(--warning)';
    if (s === 'failed') return 'var(--danger)';
    if (s === 'skipped') return 'var(--text-muted)';
    return 'var(--info)';
  };

  var riskChangeIndicator = function(update) {
    var from = update.currentRisk || update.fromRisk || '';
    var to = update.newRisk || update.toRisk || '';
    if (!from && !to) return null;
    if (from === to) return h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Risk: ' + from);
    var levels = ['low', 'medium', 'high', 'critical'];
    var fromIdx = levels.indexOf(from);
    var toIdx = levels.indexOf(to);
    var direction = toIdx > fromIdx ? '\u2191' : '\u2193';
    var color = toIdx > fromIdx ? 'var(--danger)' : 'var(--success)';
    return h('span', { style: { fontSize: 11, color: color, fontWeight: 600 } },
      'Risk: ' + from + ' ' + direction + ' ' + to
    );
  };

  const SkillCard = (s) => h('div', {
    key: s.id,
    className: 'skill-card',
    style: { cursor: 'pointer', position: 'relative' },
    onClick: () => openDetail(s)
  },
    s.verified && h('span', {
      style: { position: 'absolute', top: 8, right: 8, fontSize: 11, color: 'var(--brand-color)', fontWeight: 600 }
    }, '\u2713 Verified'),
    h('div', { style: { marginBottom: 6 } }, skillIcon(s.icon, 28)),
    h('div', { className: 'skill-name' }, s.name),
    h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'by ' + s.author),
    h('div', { className: 'skill-desc' }, s.description),
    h('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' } },
      s.category && h('span', { className: 'badge-tag' }, s.category),
      s.risk && h('span', { style: { fontSize: 11, color: riskColor(s.risk), fontWeight: 600 } }, s.risk),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, (s.downloads || 0) + ' installs'),
      s.rating > 0 && h('span', { style: { fontSize: 11, color: 'gold' } }, stars(s.rating))
    ),
    h('div', { style: { marginTop: 10 }, onClick: e => e.stopPropagation() },
      installedIds.has(s.id)
        ? h('button', { className: 'btn btn-ghost btn-sm', onClick: () => uninstallSkill(s.id) }, 'Uninstall')
        : h('button', { className: 'btn btn-primary btn-sm', onClick: () => installSkill(s.id) }, 'Install')
    )
  );

  // ── Updates Tab Content ──────────────────────────────
  var renderUpdates = function() {
    return h(Fragment, null,
      // Update Configuration Card
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { className: 'card-header' },
          h('h3', { style: { fontSize: 14, fontWeight: 600 } }, 'Update Configuration')
        ),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' } },
            h('div', { className: 'form-group', style: { marginBottom: 0 } },
              h('label', { className: 'form-label' }, 'Auto-Update'),
              h('button', {
                className: 'btn btn-ghost btn-sm',
                style: {
                  color: updateConfig.autoUpdate ? 'var(--success)' : 'var(--text-muted)',
                  fontWeight: 600, fontSize: 12, border: '1px solid var(--border)', padding: '6px 14px'
                },
                onClick: function() { setUpdateConfig(function(c) { return Object.assign({}, c, { autoUpdate: !c.autoUpdate }); }); }
              }, updateConfig.autoUpdate ? 'Enabled' : 'Disabled')
            ),
            h('div', { className: 'form-group', style: { marginBottom: 0 } },
              h('label', { className: 'form-label' }, 'Check Interval'),
              h('select', {
                className: 'input', style: { width: 140 },
                value: updateConfig.checkInterval,
                onChange: function(e) { setUpdateConfig(function(c) { return Object.assign({}, c, { checkInterval: e.target.value }); }); }
              },
                h('option', { value: 'hourly' }, 'Hourly'),
                h('option', { value: 'daily' }, 'Daily'),
                h('option', { value: 'weekly' }, 'Weekly'),
                h('option', { value: 'manual' }, 'Manual Only')
              )
            ),
            h('div', { className: 'form-group', style: { marginBottom: 0 } },
              h('label', { className: 'form-label' }, 'Max Risk Level'),
              h('select', {
                className: 'input', style: { width: 130 },
                value: updateConfig.maxRiskLevel,
                onChange: function(e) { setUpdateConfig(function(c) { return Object.assign({}, c, { maxRiskLevel: e.target.value }); }); }
              },
                h('option', { value: 'low' }, 'Low'),
                h('option', { value: 'medium' }, 'Medium'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'critical' }, 'Critical')
              )
            ),
            h('button', { className: 'btn btn-primary btn-sm', onClick: saveUpdateConfig }, 'Save Configuration')
          )
        )
      ),

      // Check for Updates + Available Updates header
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('h3', { style: { fontSize: 15, fontWeight: 600 } },
          'Available Updates',
          availableUpdates.length > 0 && h('span', {
            className: 'badge',
            style: { background: 'var(--warning)', color: '#fff', fontSize: 10, marginLeft: 8, verticalAlign: 'middle' }
          }, availableUpdates.length)
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', {
            className: 'btn btn-secondary',
            onClick: checkForUpdates,
            disabled: checkingUpdates
          }, I.refresh(), checkingUpdates ? ' Checking...' : ' Check for Updates'),
          availableUpdates.length > 0 && h('button', {
            className: 'btn btn-primary',
            onClick: applyAllUpdates
          }, 'Apply All Updates')
        )
      ),

      // Available Updates list
      availableUpdates.length === 0
        ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', marginBottom: 24 } }, 'All skills are up to date.')
        : h('div', { style: { display: 'grid', gap: 10, marginBottom: 24 } },
            availableUpdates.map(function(update) {
              var meta = update.skill || update.manifest || {};
              return h('div', { key: update.id, className: 'card', style: { padding: 14 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
                    skillIcon(meta.icon || update.icon, 24),
                    h('div', null,
                      h('div', { style: { fontWeight: 600, fontSize: 14 } }, meta.name || update.skillName || update.skillId),
                      h('div', { style: { fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 } },
                        h('span', null, 'v' + (update.currentVersion || update.fromVersion || '?')),
                        h('span', { style: { color: 'var(--brand-color)', fontWeight: 600 } }, '\u2192'),
                        h('span', { style: { fontWeight: 600, color: 'var(--success)' } }, 'v' + (update.newVersion || update.toVersion || '?')),
                        riskChangeIndicator(update)
                      )
                    )
                  ),
                  h('div', { style: { display: 'flex', gap: 8 } },
                    h('button', { className: 'btn btn-primary btn-sm', onClick: function() { applyUpdate(update.id); } }, 'Apply'),
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { skipUpdate(update.id); } }, 'Skip')
                  )
                ),
                update.changelog && h('div', { style: { marginTop: 8, fontSize: 12, color: 'var(--text-muted)', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 6 } }, update.changelog)
              );
            })
          ),

      // Recent Update History
      h('div', { className: 'card' },
        h('div', { className: 'card-header' },
          h('h3', { style: { fontSize: 14, fontWeight: 600 } }, 'Update History')
        ),
        h('div', { className: 'card-body' },
          updateHistory.length === 0
            ? h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'No update history yet.')
            : h('table', { className: 'data-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Skill'),
                    h('th', null, 'Version Change'),
                    h('th', null, 'Status'),
                    h('th', null, 'Date'),
                    h('th', null, 'Applied By')
                  )
                ),
                h('tbody', null,
                  updateHistory.map(function(entry) {
                    return h('tr', { key: entry.id },
                      h('td', null, h('span', { style: { fontWeight: 500 } }, entry.skillName || entry.skillId || '-')),
                      h('td', null,
                        h('span', null, 'v' + (entry.fromVersion || '?')),
                        h('span', { style: { margin: '0 4px', color: 'var(--text-muted)' } }, '\u2192'),
                        h('span', { style: { fontWeight: 600 } }, 'v' + (entry.toVersion || '?'))
                      ),
                      h('td', null, h('span', {
                        className: 'badge',
                        style: { background: updateStatusColor(entry.status), color: '#fff', fontSize: 10 }
                      }, entry.status || 'unknown')),
                      h('td', null, entry.appliedAt || entry.date ? new Date(entry.appliedAt || entry.date).toLocaleString() : '-'),
                      h('td', null, entry.appliedBy || entry.user || '-')
                    );
                  })
                )
              )
        )
      )
    );
  };

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Community Skills Marketplace'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } },
          (stats.totalPublished || 0) + ' skills published \u00B7 ' +
          (stats.totalInstalls || 0) + ' total installs')
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-secondary', onClick: () => setShowImport(true) }, I.upload(), ' Import from GitHub'),
        h('button', { className: 'btn btn-primary', onClick: () => setShowImport(true) }, I.plus(), ' Publish Skill')
      )
    ),

    // Search + Filters (hidden on updates tab)
    tab !== 'updates' && h('div', { style: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      h('div', { style: { position: 'relative', flex: 1, minWidth: 200 } },
        h('input', { className: 'input', style: { paddingLeft: 32, width: '100%' }, value: search, onChange: e => onSearch(e.target.value), placeholder: 'Search community skills...' }),
        h('span', { style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' } }, I.search())
      ),
      h('select', { className: 'input', style: { width: 160 }, value: filters.category, onChange: e => setFilters(f => ({ ...f, category: e.target.value })) },
        h('option', { value: '' }, 'All Categories'),
        categories.map(cat => h('option', { key: cat.category, value: cat.category }, cat.category + ' (' + cat.count + ')'))
      ),
      h('select', { className: 'input', style: { width: 120 }, value: filters.risk, onChange: e => setFilters(f => ({ ...f, risk: e.target.value })) },
        h('option', { value: '' }, 'Any Risk'),
        ['low', 'medium', 'high', 'critical'].map(r => h('option', { key: r, value: r }, r))
      ),
      h('select', { className: 'input', style: { width: 140 }, value: filters.sortBy, onChange: e => setFilters(f => ({ ...f, sortBy: e.target.value })) },
        h('option', { value: 'newest' }, 'Newest'),
        h('option', { value: 'popular' }, 'Most Popular'),
        h('option', { value: 'rating' }, 'Highest Rated'),
        h('option', { value: 'name' }, 'A-Z')
      )
    ),

    // Tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      ['browse', 'installed', 'featured', 'updates'].map(function(t) {
        var label = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === 'installed') label = label + ' (' + installed.length + ')';
        if (t === 'updates' && availableUpdates.length > 0) label = label + ' (' + availableUpdates.length + ')';
        return h('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: function() { setTab(t); } },
          label,
          t === 'updates' && availableUpdates.length > 0 && h('span', {
            style: {
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: 'var(--warning)', marginLeft: 6, verticalAlign: 'middle'
            }
          })
        );
      })
    ),

    // Browse Tab
    tab === 'browse' && h('div', { className: 'skill-grid' }, skills.map(s => SkillCard(s))),
    tab === 'browse' && skills.length === 0 && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No community skills found. Be the first to publish one!'),

    // Installed Tab
    tab === 'installed' && (installed.length === 0
      ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No community skills installed yet.')
      : h('div', { style: { display: 'grid', gap: 12 } },
        installed.map(inst => {
          var meta = inst.skill || inst.manifest || {};
          var hasUpdate = updatableSkillIds.has(inst.skillId);
          return h('div', { key: inst.id, className: 'card', style: { padding: 16 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
              h('div', { style: { position: 'relative' } },
                skillIcon(meta.icon, 24),
                hasUpdate && h('span', {
                  style: {
                    position: 'absolute', top: -4, right: -4,
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--warning)', border: '2px solid var(--bg-primary)'
                  }
                })
              ),
              h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { fontWeight: 600, fontSize: 14 } }, meta.name || inst.skillId),
                  hasUpdate && h('span', {
                    className: 'badge',
                    style: { background: 'var(--warning)', color: '#fff', fontSize: 9, padding: '1px 6px' }
                  }, 'Update Available')
                ),
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
                  'v' + inst.version + ' \u00B7 by ' + (meta.author || 'unknown') + ' \u00B7 installed ' + new Date(inst.installedAt).toLocaleDateString()
                )
              )
            ),
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              h('span', {
                className: 'status-badge',
                style: { background: inst.enabled ? 'var(--success)' : 'var(--warning)', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 11 }
              }, inst.enabled ? 'Enabled' : 'Disabled'),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: () => toggleSkill(inst.skillId, !inst.enabled) }, inst.enabled ? 'Disable' : 'Enable'),
              h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: () => uninstallSkill(inst.skillId) }, 'Uninstall')
            )
          )
        ); })
      )
    ),

    // Featured Tab
    tab === 'featured' && h('div', { className: 'skill-grid' }, featured.map(s => SkillCard(s))),
    tab === 'featured' && featured.length === 0 && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'No featured skills yet.'),

    // Updates Tab
    tab === 'updates' && renderUpdates(),

    // Detail Modal
    detail && h('div', { className: 'modal-overlay', onClick: () => setDetail(null) },
      h('div', { className: 'modal', style: { width: 640, maxHeight: '80vh', overflow: 'auto' }, onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            skillIcon(detail.icon, 28),
            h('div', null,
              h('h2', null, detail.name),
              h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'by ' + detail.author + ' \u00B7 v' + detail.version)
            )
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setDetail(null) }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('p', { style: { marginBottom: 12 } }, detail.description),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 } },
            detail.category && h('span', { className: 'badge-tag' }, detail.category),
            detail.risk && h('span', { className: 'badge-tag', style: { color: riskColor(detail.risk) } }, 'Risk: ' + detail.risk),
            detail.verified && h('span', { className: 'badge-tag', style: { color: 'var(--brand-color)' } }, '\u2713 Verified'),
            detail.featured && h('span', { className: 'badge-tag', style: { color: 'gold' } }, '\u2605 Featured'),
            h('span', { className: 'badge-tag' }, detail.license),
            h('span', { className: 'badge-tag' }, (detail.downloads || 0) + ' installs'),
            detail.rating > 0 && h('span', { className: 'badge-tag', style: { color: 'gold' } }, stars(detail.rating) + ' (' + detail.ratingCount + ')')
          ),
          detail.repository && h('div', { style: { marginBottom: 12 } },
            h('strong', { style: { fontSize: 12 } }, 'Repository: '),
            h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, detail.repository)
          ),

          (detail.tools || []).length > 0 && h('div', { style: { marginBottom: 16 } },
            h('h4', { style: { fontSize: 13, marginBottom: 8 } }, 'Tools (' + detail.tools.length + ')'),
            detail.tools.map((t, i) => h('div', { key: i, style: { padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 6, fontSize: 12 } },
              h('strong', null, t.name || t.id || 'tool-' + i),
              t.description && h('p', { style: { margin: '4px 0 0', color: 'var(--text-muted)' } }, t.description),
              t.risk && h('span', { style: { fontSize: 10, color: riskColor(t.risk) } }, ' ' + t.risk + ' risk')
            ))
          ),

          (detail.tags || []).length > 0 && h('div', { style: { marginBottom: 16 } },
            h('h4', { style: { fontSize: 13, marginBottom: 8 } }, 'Tags'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              detail.tags.map(t => h('span', { key: t, className: 'badge-tag' }, t))
            )
          ),

          // Reviews Section
          h('h4', { style: { fontSize: 13, marginBottom: 8, borderTop: '1px solid var(--border)', paddingTop: 16 } }, 'Reviews (' + reviews.length + ')'),
          reviews.map(r => h('div', { key: r.id, style: { padding: 10, background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 8, fontSize: 12 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { fontWeight: 600, color: 'var(--text-primary)' } }, r.userName || 'Anonymous'),
                h('span', { style: { color: 'gold' } }, stars(r.rating))
              ),
              h('span', { style: { color: 'var(--text-muted)' } }, new Date(r.createdAt).toLocaleDateString())
            ),
            r.reviewText && h('p', { style: { margin: '6px 0 0', color: 'var(--text-secondary)', lineHeight: 1.5 } }, r.reviewText)
          )),

          // Submit Review
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 } }, 'Leave a Review'),
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
              [5, 4, 3, 2, 1].map(n => h('button', {
                key: n,
                className: 'btn btn-ghost btn-sm',
                style: { color: reviewForm.rating >= n ? 'gold' : 'var(--text-muted)', fontSize: 16, padding: '2px 4px' },
                onClick: () => setReviewForm(f => ({ ...f, rating: n }))
              }, '\u2605'))
            ),
            h('textarea', { className: 'input', style: { minHeight: 60, marginBottom: 8, width: '100%' }, placeholder: 'Write a review (optional)...', value: reviewForm.text, onChange: e => setReviewForm(f => ({ ...f, text: e.target.value })) }),
            h('button', { className: 'btn btn-primary btn-sm', onClick: submitReview }, 'Submit Review')
          )
        ),
        h('div', { className: 'modal-footer' },
          installedIds.has(detail.id)
            ? h('button', { className: 'btn btn-ghost', onClick: () => { uninstallSkill(detail.id); setDetail(null); } }, 'Uninstall')
            : h('button', { className: 'btn btn-primary', onClick: () => { installSkill(detail.id); setDetail(null); } }, 'Install Skill')
        )
      )
    ),

    // GitHub Import Modal
    showImport && h('div', { className: 'modal-overlay', onClick: () => { setShowImport(false); setImportResult(null); } },
      h('div', { className: 'modal', style: { width: 560 }, onClick: e => e.stopPropagation() },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Import from GitHub'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: () => { setShowImport(false); setImportResult(null); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 } }, 'GitHub Repository URL'),
          h('input', { className: 'input', style: { width: '100%', marginBottom: 8 }, placeholder: 'https://github.com/owner/agenticmail-skill-example', value: importUrl, onChange: e => setImportUrl(e.target.value) }),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'The repo must contain an agenticmail-skill.json file at the root.'),
          importResult && h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } },
            importResult.validation?.valid
              ? h('div', null,
                h('div', { style: { color: 'var(--success)', fontWeight: 600, marginBottom: 8 } }, '\u2713 Valid manifest found'),
                h('div', { style: { fontSize: 12 } },
                  h('strong', null, importResult.manifest.name), ' v', importResult.manifest.version,
                  ' by ', importResult.manifest.author
                ),
                h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } }, importResult.manifest.description)
              )
              : h('div', null,
                h('div', { style: { color: 'var(--danger)', fontWeight: 600, marginBottom: 8 } }, 'Validation errors:'),
                (importResult.validation?.errors || []).map((e, i) => h('div', { key: i, style: { fontSize: 12, color: 'var(--danger)' } }, '\u2022 ' + e))
              )
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-secondary', onClick: () => { setShowImport(false); setImportResult(null); } }, 'Cancel'),
          !importResult
            ? h('button', { className: 'btn btn-primary', onClick: doImport, disabled: !importUrl }, 'Fetch Manifest')
            : importResult.validation?.valid && h('button', { className: 'btn btn-primary', onClick: publishImported }, 'Publish to Marketplace')
        )
      )
    )
  );
}
