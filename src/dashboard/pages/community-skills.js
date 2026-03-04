import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { mapEmojiToIcon } from './agent-detail/tools.js';
import { BrandLogo, SKILL_BRAND_MAP } from '../assets/brand-logos.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

export function CommunitySkillsPage() {
  const { toast, user } = useApp();
  const orgCtx = useOrgContext();
  const effectiveOrgId = orgCtx.selectedOrgId || getOrgId();
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
    engineCall('/community/installed?orgId=' + effectiveOrgId)
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
  }, [filters, effectiveOrgId]);

  var loadUpdates = useCallback(function() {
    engineCall('/skill-updates/config?orgId=' + effectiveOrgId)
      .then(function(d) { setUpdateConfig(d.config || d || { autoUpdate: false, checkInterval: 'daily', maxRiskLevel: 'medium' }); })
      .catch(function() {});
    engineCall('/skill-updates/available?orgId=' + effectiveOrgId)
      .then(function(d) { setAvailableUpdates(d.updates || []); })
      .catch(function() {});
    engineCall('/skill-updates/history?orgId=' + effectiveOrgId)
      .then(function(d) { setUpdateHistory(d.history || d.updates || []); })
      .catch(function() {});
    engineCall('/skill-updates/stats?orgId=' + effectiveOrgId)
      .then(function(d) { setUpdateStats(d || {}); })
      .catch(function() {});
  }, [effectiveOrgId]);

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

  // Credential setup state
  var _credModal = useState(null);
  var credModal = _credModal[0]; var setCredModal = _credModal[1];
  var _credValue = useState('');
  var credValue = _credValue[0]; var setCredValue = _credValue[1];
  var _credFields = useState({}); // { fieldName: value } for multi-field credentials
  var credFields = _credFields[0]; var setCredFields = _credFields[1];
  var _credScope = useState('org'); // 'org' or 'agent'
  var credScope = _credScope[0]; var setCredScope = _credScope[1];
  var _credAgent = useState('');
  var credAgent = _credAgent[0]; var setCredAgent = _credAgent[1];
  var _credSaving = useState(false);
  var credSaving = _credSaving[0]; var setCredSaving = _credSaving[1];
  var _credStatuses = useState({});
  var credStatuses = _credStatuses[0]; var setCredStatuses = _credStatuses[1];
  var _allAgents = useState([]);
  var allAgents = _allAgents[0]; var setAllAgents = _allAgents[1];

  // Load credential statuses for ALL skills from the integration catalog
  useEffect(function() {
    engineCall('/integrations/catalog?orgId=' + effectiveOrgId)
      .then(function(d) {
        var map = {};
        (d.catalog || []).forEach(function(entry) {
          map[entry.skillId] = entry.connected === true;
        });
        setCredStatuses(map);
      })
      .catch(function() {});
  }, [skills]);

  // Load agents list for per-agent credentials
  useEffect(function() {
    engineCall('/agents?orgId=' + effectiveOrgId).then(function(d) {
      setAllAgents(d.agents || d || []);
    }).catch(function() {});
  }, []);

  var saveCredential = function() {
    if (!credModal) return;
    var isMultiField = credModal.authType === 'credentials' && credModal.fields && credModal.fields.length > 0;
    if (isMultiField) {
      // Validate all fields have values
      var allFilled = credModal.fields.every(function(f) { return credFields[f] && credFields[f].trim(); });
      if (!allFilled) return;
    } else {
      if (!credValue.trim()) return;
    }
    setCredSaving(true);
    var payload = isMultiField
      ? { credentials: credModal.fields.reduce(function(o, f) { o[f] = credFields[f].trim(); return o; }, {}), scope: credScope, agentId: credAgent || undefined }
      : { token: credValue.trim(), scope: credScope, agentId: credAgent || undefined };
    engineCall('/oauth/authorize/' + credModal.id + '?orgId=' + effectiveOrgId, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(function() {
        toast(credModal.name + ' credentials saved' + (credScope === 'agent' ? ' (per-agent)' : ' (org-wide)'), 'success');
        setCredModal(null); setCredValue(''); setCredFields({}); setCredScope('org'); setCredAgent('');
        setCredStatuses(function(s) { var n = Object.assign({}, s); n[credModal.id] = true; return n; });
      })
      .catch(function(e) { toast('Failed: ' + (e.message || 'Unknown error'), 'error'); })
      .finally(function() { setCredSaving(false); });
  };

  // Track auth types from integration catalog
  var _authTypes = useState({});
  var authTypes = _authTypes[0]; var setAuthTypes = _authTypes[1];
  var _catalogData = useState({}); // { skillId: { authType, fields, fieldLabels } }
  var catalogData = _catalogData[0]; var setCatalogData = _catalogData[1];
  useEffect(function() {
    engineCall('/integrations/catalog?orgId=' + effectiveOrgId)
      .then(function(d) {
        var map = {};
        var cmap = {};
        (d.catalog || []).forEach(function(e) {
          map[e.skillId] = e.authType;
          cmap[e.skillId] = { authType: e.authType, fields: e.fields, fieldLabels: e.fieldLabels, oauthProvider: e.oauthProvider };
        });
        setAuthTypes(map);
        setCatalogData(cmap);
      })
      .catch(function() {});
  }, []);

  // OAuth app config state
  var _oauthClientId = useState('');
  var oauthClientId = _oauthClientId[0]; var setOauthClientId = _oauthClientId[1];
  var _oauthClientSecret = useState('');
  var oauthClientSecret = _oauthClientSecret[0]; var setOauthClientSecret = _oauthClientSecret[1];
  var _oauthTab = useState('oauth'); // 'oauth' or 'token'
  var oauthTab = _oauthTab[0]; var setOauthTab = _oauthTab[1];
  var _oauthAppConfigured = useState(false);
  var oauthAppConfigured = _oauthAppConfigured[0]; var setOauthAppConfigured = _oauthAppConfigured[1];
  var _oauthSaving = useState(false);
  var oauthSaving = _oauthSaving[0]; var setOauthSaving = _oauthSaving[1];

  var openCredSetup = function(skill) {
    // Attach catalog metadata (fields, fieldLabels, authType, oauthProvider) to skill for modal
    // Resolve auth metadata: 1) integration catalog, 2) skill manifest auth field, 3) configSchema secrets, 4) fallback to token
    var cd = catalogData[skill.id];
    if (cd) {
      skill.authType = cd.authType; skill.fields = cd.fields;
      skill.fieldLabels = cd.fieldLabels; skill.oauthProvider = cd.oauthProvider;
    } else {
      // Use the skill's own auth metadata from manifest
      var auth = skill.auth || (skill.skill && skill.skill.auth) || (skill.manifest && skill.manifest.auth);
      if (auth && auth.type) {
        skill.authType = auth.type;
        skill.oauthProvider = auth.provider;
        if (auth.fields) { skill.fields = auth.fields; skill.fieldLabels = auth.fieldLabels || {}; }
      } else {
        // Derive from configSchema: fields with type "secret" or "password" → credentials mode
        var schema = skill.configSchema || (skill.skill && skill.skill.configSchema) || (skill.manifest && skill.manifest.configSchema);
        if (schema && Object.keys(schema).length > 0) {
          var secretFields = []; var labels = {};
          Object.entries(schema).forEach(function(entry) {
            secretFields.push(entry[0]);
            labels[entry[0]] = (entry[1] && entry[1].label) || entry[0];
          });
          if (secretFields.length === 1 && /key|token|secret/i.test(secretFields[0])) {
            skill.authType = 'api_key';
          } else if (secretFields.length > 0) {
            skill.authType = 'credentials';
            skill.fields = secretFields;
            skill.fieldLabels = labels;
          }
        }
      }
      // Final fallback
      if (!skill.authType) skill.authType = 'token';
    }
    setCredModal(skill);
    setCredValue(''); setCredFields({}); setCredScope('org'); setCredAgent('');
    setOauthClientId(''); setOauthClientSecret(''); setOauthTab('oauth'); setOauthAppConfigured(false);
    // For oauth2 services, check if OAuth app is already configured
    if (skill.authType === 'oauth2' && skill.oauthProvider) {
      engineCall('/oauth/app-config/' + skill.oauthProvider + '?orgId=' + effectiveOrgId)
        .then(function(d) { if (d.configured) setOauthAppConfigured(true); })
        .catch(function() {});
    }
  };

  var saveOauthApp = function() {
    if (!credModal || !credModal.oauthProvider) return;
    if (!oauthClientId.trim() || !oauthClientSecret.trim()) return;
    setOauthSaving(true);
    engineCall('/oauth/app-config/' + credModal.oauthProvider + '?orgId=' + effectiveOrgId, {
      method: 'POST',
      body: JSON.stringify({ clientId: oauthClientId.trim(), clientSecret: oauthClientSecret.trim() })
    })
      .then(function() {
        setOauthAppConfigured(true);
        toast('OAuth app configured for ' + credModal.name, 'success');
        // Now launch OAuth consent flow
        return engineCall('/oauth/authorize/' + credModal.id + '?orgId=' + effectiveOrgId);
      })
      .then(function(d) {
        if (d && (d.authUrl || d.authorizationUrl)) {
          var popup = window.open(d.authUrl || d.authorizationUrl, 'oauth_connect', 'width=600,height=700,popup=yes');
          var check = setInterval(function() {
            if (popup && popup.closed) {
              clearInterval(check);
              setCredStatuses(function(s) { var n = Object.assign({}, s); n[credModal.id] = true; return n; });
              setCredModal(null);
              toast(credModal.name + ' connected via OAuth', 'success');
            }
          }, 500);
          setTimeout(function() { clearInterval(check); }, 120000);
        }
      })
      .catch(function(e) { toast('Failed: ' + (e.message || 'Unknown error'), 'error'); })
      .finally(function() { setOauthSaving(false); });
  };

  var launchOauthFlow = function() {
    if (!credModal) return;
    engineCall('/oauth/authorize/' + credModal.id + '?orgId=' + effectiveOrgId)
      .then(function(d) {
        if (d && (d.authUrl || d.authorizationUrl)) {
          var popup = window.open(d.authUrl || d.authorizationUrl, 'oauth_connect', 'width=600,height=700,popup=yes');
          var check = setInterval(function() {
            if (popup && popup.closed) {
              clearInterval(check);
              setCredStatuses(function(s) { var n = Object.assign({}, s); n[credModal.id] = true; return n; });
              setCredModal(null);
              toast(credModal.name + ' connected via OAuth', 'success');
            }
          }, 500);
          setTimeout(function() { clearInterval(check); }, 120000);
        } else {
          toast('OAuth flow failed — try using an access token instead', 'error');
        }
      })
      .catch(function(e) { toast('OAuth error: ' + (e.message || 'Unknown'), 'error'); });
  };

  const installSkill = async (skillId) => {
    try {
      await engineCall('/community/skills/' + skillId + '/install', {
        method: 'POST',
        body: JSON.stringify({ orgId: effectiveOrgId })
      });
      toast('Skill installed', 'success');
      load();
      // Open credential setup for the installed skill
      var skill = skills.find(function(s) { return s.id === skillId; }) || detail;
      if (skill) {
        setTimeout(function() { openCredSetup(skill); }, 300);
      }
    } catch (e) { toast(e.message || 'Install failed', 'error'); }
  };

  const uninstallSkill = async (skillId) => {
    try {
      await engineCall('/community/skills/' + skillId + '/uninstall', {
        method: 'DELETE',
        body: JSON.stringify({ orgId: effectiveOrgId })
      });
      toast('Skill uninstalled', 'success');
      load();
    } catch (e) { toast(e.message || 'Uninstall failed', 'error'); }
  };

  const toggleSkill = async (skillId, enable) => {
    try {
      await engineCall('/community/skills/' + skillId + '/' + (enable ? 'enable' : 'disable'), {
        method: 'PUT',
        body: JSON.stringify({ orgId: effectiveOrgId })
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
        body: JSON.stringify({ orgId: effectiveOrgId })
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
          orgId: effectiveOrgId,
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
        body: JSON.stringify({ orgId: effectiveOrgId })
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

  const CATEGORY_ICONS = {
    development: E.code, communication: E.chat, productivity: E.bolt, finance: E.barChart,
    sales: E.people, analytics: E.barChart, devops: E.gear, security: E.shield, ai: E.brain,
    infrastructure: E.server, monitoring: E.eye, marketing: E.megaphone, hr: E.people, design: E.palette,
  };
  const _catIcon = (category, size) => {
    var fn = category && CATEGORY_ICONS[category];
    if (fn && typeof fn === 'function') return fn(size);
    return E.puzzle ? E.puzzle(size) : E.sparkle(size);
  };
  const skillIcon = (icon, size, category, skillId) => {
    size = size || 28;
    // 1. Check brand logo map first (inline SVGs, always work)
    var brandKey = skillId && SKILL_BRAND_MAP[skillId];
    if (brandKey && BrandLogo[brandKey]) return BrandLogo[brandKey](size);
    // 2. URL/data URI icons with fallback
    if (icon && (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:'))) {
      return h('span', { style: { display: 'inline-flex' } },
        h('img', { src: icon, alt: '', style: { width: size, height: size, objectFit: 'contain', borderRadius: 6 },
          onError: function(e) { e.target.style.display = 'none'; var fb = e.target.parentNode.querySelector('._skill_fb'); if (fb) fb.style.display = ''; }
        }),
        h('span', { className: '_skill_fb', style: { display: 'none' } }, _catIcon(category, size))
      );
    }
    // 3. Emoji character → map to SVG icon
    if (icon) {
      var mapped = mapEmojiToIcon(icon, size);
      if (mapped !== icon) return h('span', { style: { display: 'inline-flex' } }, mapped);
      return h('span', { style: { fontSize: size } }, icon);
    }
    // 4. Category fallback
    return _catIcon(category, size);
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

  var handleDisconnect = function(skill) {
    if (!confirm('Disconnect ' + skill.name + '? Agents using this integration will lose access.')) return;
    engineCall('/oauth/disconnect/' + skill.id + '?orgId=' + effectiveOrgId, { method: 'DELETE' })
      .then(function() {
        toast(skill.name + ' disconnected', 'success');
        setCredStatuses(function(s) { var n = Object.assign({}, s); n[skill.id] = false; return n; });
      })
      .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  const SkillCard = (s) => {
    var connected = credStatuses[s.id] === true;
    var toolCount = Array.isArray(s.tools) ? s.tools.length : 0;
    return h('div', {
      key: s.id,
      className: 'skill-card',
      style: { cursor: 'pointer', position: 'relative', borderColor: connected ? 'var(--brand-color, #6366f1)' : undefined },
      onClick: () => openDetail(s)
    },
      // Status badge (top-right)
      h('span', {
        style: { position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 600,
          color: connected ? 'var(--success)' : installedIds.has(s.id) ? 'var(--brand-color)' : s.verified ? 'var(--text-secondary)' : 'var(--text-muted)' }
      }, connected ? '\u2713 Connected' : installedIds.has(s.id) ? '\u2713 Installed' : s.verified ? '\u2713 Verified' : ''),
      h('div', { style: { marginBottom: 6 } }, skillIcon(s.icon, 28, s.category, s.id)),
      h('div', { className: 'skill-name' }, s.name),
      h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } },
        toolCount > 0 ? toolCount + ' tool' + (toolCount !== 1 ? 's' : '') + ' \u00B7 ' + (s.category || 'general') : 'by ' + s.author
      ),
      h('div', { className: 'skill-desc' }, s.description),
      h('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' } },
        s.category && h('span', { className: 'badge-tag' }, s.category),
        s.risk && h('span', { style: { fontSize: 11, color: riskColor(s.risk), fontWeight: 600 } }, s.risk),
        s.rating > 0 && h('span', { style: { fontSize: 11, color: 'gold' } }, stars(s.rating))
      ),
      h('div', { style: { marginTop: 10, display: 'flex', gap: 8 }, onClick: e => e.stopPropagation() },
        !installedIds.has(s.id)
          ? h('button', { className: 'btn btn-primary btn-sm', onClick: function() { installSkill(s.id); } }, 'Install')
          : connected
            ? h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { handleDisconnect(s); } }, 'Disconnect')
            : h('button', { className: 'btn btn-primary btn-sm', onClick: function() { openCredSetup(s); } }, 'Connect')
      )
    );
  };

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
                    skillIcon(meta.icon || update.icon, 24, meta.category, update.skillId || meta.id),
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
        h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 } }, 'Community Skills Marketplace',
          h(KnowledgeLink, { page: 'community-skills' }),
          h(HelpButton, { label: 'How Skills Work' },
            h('div', { style: { fontSize: 13, lineHeight: 1.6 } },
              h('h4', { style: { marginBottom: 8 } }, 'How the Skill Marketplace Works'),
              h('p', null, 'Skills are ', h('strong', null, 'integration packages'), ' that give your agents new capabilities — like managing GitHub issues, sending Slack messages, or querying Salesforce.'),

              h('h4', { style: { marginTop: 12, marginBottom: 6 } }, 'Skill Types'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0' } },
                h('li', null, h('strong', null, 'Built-in skills'), ' (Gmail, Calendar, Drive, etc.) — fully implemented, work out of the box with Google OAuth.'),
                h('li', null, h('strong', null, 'Community skills'), ' — integration manifests that define tools. They connect via the MCP bridge or OAuth to external APIs.'),
                h('li', null, h('strong', null, 'GitHub imports'), ' — custom skills you or others build. They define tool schemas and connect to MCP servers or REST APIs.')
              ),

              h('h4', { style: { marginTop: 12, marginBottom: 6 } }, 'Install + Configure Flow'),
              h('ol', { style: { paddingLeft: 20, margin: '4px 0' } },
                h('li', null, h('strong', null, 'Install'), ' — adds the skill to your org. Does NOT require credentials yet.'),
                h('li', null, h('strong', null, 'Configure credentials'), ' — add API key, OAuth token, or bot token for the service.'),
                h('li', null, h('strong', null, 'Assign to agents'), ' — enable the skill per-agent or org-wide in the agent Skills tab.'),
                h('li', null, 'Agent can now use the skill\'s tools.')
              ),

              h('h4', { style: { marginTop: 12, marginBottom: 6 } }, 'Credential Scopes'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0' } },
                h('li', null, h('strong', null, 'Organization-wide'), ' — one API key shared by all agents.'),
                h('li', null, h('strong', null, 'Per-Agent'), ' — different API keys per agent (e.g., agent A has read-only GitHub, agent B has write access).')
              ),

              h('h4', { style: { marginTop: 12, marginBottom: 6 } }, 'GitHub Imports'),
              h('p', null, 'When you import from GitHub, the skill manifest (agenticmail-skill.json) is fetched and registered. The skill definition is stored in your database — NOT in your codebase. Package updates don\'t affect imported skills.'),
              h('p', { style: { color: 'var(--warning)' } }, 'Note: Imported skills need an MCP server or API endpoint to actually execute tools. The manifest alone only defines the tool schemas.'),

              h('h4', { style: { marginTop: 12, marginBottom: 6 } }, 'Where Things Show Up'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0' } },
                h('li', null, h('strong', null, 'Settings > Integrations'), ' — credentials for OAuth/token integrations'),
                h('li', null, h('strong', null, 'Agent > Skills tab'), ' — which skills are enabled per agent'),
                h('li', null, h('strong', null, 'Agent > Tools tab'), ' — individual tool permissions within skills')
              ),

              h('h4', { style: { marginTop: 12, marginBottom: 6 } }, 'Package Updates'),
              h('p', null, 'Community skills stored in the ', h('code', null, 'community-skills/'), ' directory are bundled with the enterprise package. On update, new skills are added and existing ones are refreshed. Skills imported from external GitHub repos are stored in the database only and are ', h('strong', null, 'NOT affected'), ' by package updates.')
            )
          )
        ),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } },
          (stats.totalPublished || 0) + ' skills published \u00B7 ' +
          (stats.totalInstalls || 0) + ' total installs')
      ),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h(orgCtx.Switcher),
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
                skillIcon(meta.icon, 24, meta.category, meta.id),
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
              credStatuses[inst.skillId]
                ? h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, I.check(), ' Connected')
                : h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, 'No credentials'),
              h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { openCredSetup(meta || { id: inst.skillId, name: inst.skillId }); } }, I.settings(), ' Configure'),
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
            skillIcon(detail.icon, 28, detail.category, detail.id),
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
        h('div', { className: 'modal-footer', style: { display: 'flex', justifyContent: 'space-between' } },
          h('div', null,
            credStatuses[detail.id] && h('span', { style: { fontSize: 12, color: 'var(--success)', fontWeight: 600 } }, '\u2713 Connected')
          ),
          h('div', { style: { display: 'flex', gap: 8 } },
            !installedIds.has(detail.id)
              ? h('button', { className: 'btn btn-primary', onClick: function() { installSkill(detail.id); } }, 'Install')
              : credStatuses[detail.id]
                ? h(Fragment, null,
                    h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setDetail(null); openCredSetup(detail); } }, 'Reconfigure'),
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { handleDisconnect(detail); setDetail(null); } }, 'Disconnect')
                  )
                : h(Fragment, null,
                    h('button', { className: 'btn btn-primary', onClick: function() { setDetail(null); openCredSetup(detail); } }, 'Connect'),
                    h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function() { uninstallSkill(detail.id); setDetail(null); } }, 'Uninstall')
                  )
          )
        )
      )
    ),

    // GitHub Import Modal
    // ─── Credential Setup Modal ───────────────────────────
    credModal && h('div', { className: 'modal-overlay', onClick: function() { setCredModal(null); } },
      h('div', { className: 'modal', style: { width: 560 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            skillIcon(credModal.icon, 24, credModal.category, credModal.id),
            h('div', null,
              h('h2', { style: { margin: 0, fontSize: 16 } }, 'Connect ' + (credModal.name || credModal.id)),
              h('span', { style: { fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 } },
                credModal.authType === 'oauth2' ? 'Configure OAuth app or paste access token' :
                credModal.authType === 'credentials' ? 'Enter service credentials' :
                'Enter API key or token',
                h(HelpButton, { label: 'Credential Scopes' },
                  h('div', { style: { fontSize: 13, lineHeight: 1.6 } },
                    h('p', null, h('strong', null, 'Organization-wide:'), ' One set of credentials shared by all agents.'),
                    h('p', null, h('strong', null, 'Per-Agent:'), ' Each agent gets their own credentials for different permission levels.'),
                    h('p', null, 'All credentials are encrypted with AES-256-GCM and stored in the secure vault.')
                  )
                )
              )
            )
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setCredModal(null); } }, I.x())
        ),
        h('div', { className: 'modal-body' },

          // ── Organization Context Banner ──
          orgCtx.selectedOrgId && h('div', { style: { padding: '8px 12px', background: 'var(--info-soft, rgba(14,165,233,0.1))', borderRadius: 'var(--radius)', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 } },
            I.building(),
            h('span', null, 'Credentials will be saved for: ', h('strong', null, (orgCtx.selectedOrg && orgCtx.selectedOrg.name) || orgCtx.selectedOrgId))
          ),

          // ── Single token/API key (api_key, token types) — BEFORE scope selector ──
          (credModal.authType === 'api_key' || credModal.authType === 'token') &&
          h('div', { style: { marginBottom: 16 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } },
              credModal.authType === 'api_key' ? 'API Key' : 'Access Token'
            ),
            h('input', {
              className: 'input', type: 'password',
              placeholder: credModal.authType === 'api_key' ? 'Paste your API key...' : 'Paste your bot token or access token...',
              value: credValue,
              onChange: function(e) { setCredValue(e.target.value); },
              style: { width: '100%', fontFamily: 'var(--font-mono, monospace)' }
            }),
            h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
              'Encrypted with AES-256-GCM and stored in the secure vault.'
            )
          ),

          // ── OAuth2 services: Tabbed interface (OAuth App | Access Token) ──
          credModal.authType === 'oauth2' && h('div', { style: { marginBottom: 16 } },
            // Tab bar
            h('div', { style: { display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' } },
              h('button', {
                style: { padding: '8px 16px', fontSize: 13, fontWeight: oauthTab === 'oauth' ? 600 : 400, color: oauthTab === 'oauth' ? 'var(--accent)' : 'var(--text-secondary)', background: 'none', border: 'none', borderBottom: oauthTab === 'oauth' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 },
                onClick: function() { setOauthTab('oauth'); }
              }, 'OAuth App ', h('span', { style: { fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', marginLeft: 4 } }, 'RECOMMENDED')),
              h('button', {
                style: { padding: '8px 16px', fontSize: 13, fontWeight: oauthTab === 'token' ? 600 : 400, color: oauthTab === 'token' ? 'var(--accent)' : 'var(--text-secondary)', background: 'none', border: 'none', borderBottom: oauthTab === 'token' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 },
                onClick: function() { setOauthTab('token'); }
              }, 'Access Token')
            ),

            // OAuth App tab
            oauthTab === 'oauth' && h('div', null,
              // Already configured notice
              oauthAppConfigured && h('div', {
                style: { padding: '10px 14px', marginBottom: 14, background: 'rgba(34,197,94,0.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 12, color: 'var(--success)', lineHeight: 1.6 }
              }, I.check(), ' OAuth app already configured for this provider. You can re-authorize or update credentials.'),

              h('p', { style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 } },
                'Create an OAuth app in ', credModal.name, '\'s developer portal, then enter the Client ID and Secret below. ',
                'This enables secure OAuth 2.0 authorization for all agents.'
              ),

              // Client ID
              h('div', { style: { marginBottom: 12 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Client ID'),
                h('input', {
                  className: 'input', type: 'text',
                  placeholder: 'e.g. 1234567890.apps.example.com',
                  value: oauthClientId,
                  onChange: function(e) { setOauthClientId(e.target.value); },
                  style: { width: '100%', fontFamily: 'var(--font-mono, monospace)' }
                })
              ),

              // Client Secret
              h('div', { style: { marginBottom: 12 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Client Secret'),
                h('input', {
                  className: 'input', type: 'password',
                  placeholder: 'Client secret from developer portal...',
                  value: oauthClientSecret,
                  onChange: function(e) { setOauthClientSecret(e.target.value); },
                  style: { width: '100%', fontFamily: 'var(--font-mono, monospace)' }
                })
              ),

              h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 14 } },
                'Credentials are encrypted with AES-256-GCM. The redirect URI for your OAuth app should be: ',
                h('code', { style: { fontSize: 11, background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 } },
                  window.location.origin + '/api/engine/oauth/callback'
                )
              ),

              // Buttons
              h('div', { style: { display: 'flex', gap: 8 } },
                !oauthAppConfigured
                  ? h('button', {
                      className: 'btn btn-primary',
                      disabled: oauthSaving || !oauthClientId.trim() || !oauthClientSecret.trim(),
                      onClick: saveOauthApp,
                      style: { flex: 1 }
                    }, oauthSaving ? 'Configuring...' : 'Save & Authorize')
                  : h('button', {
                      className: 'btn btn-primary',
                      onClick: launchOauthFlow,
                      style: { flex: 1 }
                    }, 'Re-authorize with ' + credModal.name)
              )
            ),

            // Token tab
            oauthTab === 'token' && h('div', null,
              h('div', {
                style: { padding: '10px 14px', marginBottom: 14, background: 'rgba(234,179,8,0.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(234,179,8,0.2)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }
              },
                h('strong', null, 'Advanced: '), 'Paste a Personal Access Token or API token from the service\'s developer console. ',
                'This bypasses OAuth but may have limited scopes or expiration.'
              ),
              h('div', { style: { marginBottom: 12 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Access Token'),
                h('input', {
                  className: 'input', type: 'password', placeholder: 'Paste token here...',
                  value: credValue,
                  onChange: function(e) { setCredValue(e.target.value); },
                  style: { width: '100%', fontFamily: 'var(--font-mono, monospace)' }
                })
              )
            )
          ),

          // ── Non-OAuth: Credential scope selector ──
          (credModal.authType !== 'oauth2' || (credModal.authType === 'oauth2' && oauthTab === 'token')) &&
          h('div', { style: { marginBottom: 16 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 } }, 'Credential Scope'),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', {
                className: 'btn btn-sm ' + (credScope === 'org' ? 'btn-primary' : 'btn-ghost'),
                onClick: function() { setCredScope('org'); }
              }, 'Organization-wide'),
              h('button', {
                className: 'btn btn-sm ' + (credScope === 'agent' ? 'btn-primary' : 'btn-ghost'),
                onClick: function() { setCredScope('agent'); }
              }, 'Per-Agent')
            ),
            h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
              credScope === 'org'
                ? 'All agents in this organization will use these credentials.'
                : 'Only the selected agent will use these credentials.'
            )
          ),

          // Agent selector (per-agent mode, non-oauth or oauth token tab)
          (credModal.authType !== 'oauth2' || (credModal.authType === 'oauth2' && oauthTab === 'token')) &&
          credScope === 'agent' && h('div', { style: { marginBottom: 16 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Select Agent'),
            h('select', {
              className: 'input', value: credAgent,
              onChange: function(e) { setCredAgent(e.target.value); }
            },
              h('option', { value: '' }, '-- Select an agent --'),
              allAgents.map(function(a) {
                var name = a.config?.identity?.name || a.config?.displayName || a.name || a.id;
                return h('option', { key: a.id, value: a.id }, name);
              })
            )
          ),

          // ── Multi-field credentials (AWS, Twilio, Datadog, etc.) ──
          credModal.authType === 'credentials' && credModal.fields && credModal.fields.length > 0 &&
          h('div', { style: { marginBottom: 16 } },
            credModal.fields.map(function(field) {
              var label = (credModal.fieldLabels && credModal.fieldLabels[field]) || field;
              var isSensitive = /secret|password|key|token|private/i.test(field);
              return h('div', { key: field, style: { marginBottom: 12 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, label),
                h('input', {
                  className: 'input',
                  type: isSensitive ? 'password' : 'text',
                  placeholder: label + '...',
                  value: credFields[field] || '',
                  onChange: function(e) {
                    setCredFields(function(prev) {
                      var next = Object.assign({}, prev);
                      next[field] = e.target.value;
                      return next;
                    });
                  },
                  style: { width: '100%', fontFamily: 'var(--font-mono, monospace)' }
                })
              );
            }),
            h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
              'Each field is encrypted separately using AES-256-GCM and stored in the secure vault.'
            )
          ),

          // (token input moved above OAuth section)

          // Existing connection status
          credStatuses[credModal.id] && h('div', { style: { padding: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, marginBottom: 12, fontSize: 12, color: 'var(--success)' } },
            I.check(), ' Credentials already configured. Saving new credentials will overwrite them.'
          )
        ),
        // Footer — only show Save for non-OAuth or OAuth token tab
        (credModal.authType !== 'oauth2' || oauthTab === 'token') && h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setCredModal(null); } }, 'Cancel'),
          h('button', {
            className: 'btn btn-primary',
            disabled: credSaving || (credScope === 'agent' && !credAgent) || (function() {
              if (credModal.authType === 'credentials' && credModal.fields && credModal.fields.length > 0) {
                return !credModal.fields.every(function(f) { return credFields[f] && credFields[f].trim(); });
              }
              return !credValue.trim();
            })(),
            onClick: saveCredential
          }, credSaving ? 'Saving...' : 'Save Credentials')
        ),
        // Footer for OAuth tab — just Cancel (Save & Authorize is inline)
        credModal.authType === 'oauth2' && oauthTab === 'oauth' && h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setCredModal(null); } }, 'Cancel')
        )
      )
    ),

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
