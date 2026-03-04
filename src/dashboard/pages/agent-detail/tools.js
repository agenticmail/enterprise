import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, EmptyState } from './shared.js?v=4';
import { BrowserConfigCard, ToolRestrictionsCard } from './meeting-browser.js?v=4';
import { HelpButton } from '../../components/help-button.js';

// ════════════════════════════════════════════════════════════
// TOOL SECURITY SECTION
// ════════════════════════════════════════════════════════════

// _ts* styles moved to tool-security.js
// --- EmailSection -------------------------------------------------------

// ════════════════════════════════════════════════════════════
// TOOLS SECTION — Toggle tool categories per agent
// ════════════════════════════════════════════════════════════

// Map server-side emoji strings to custom SVG icons
var _toolIconMap = {
  '\u2709\uFE0F': 'email', '\u2709': 'email',              // ✉️
  '\uD83D\uDCE7': 'email',                                  // 📧
  '\uD83D\uDCAC': 'chat',                                   // 💬
  '\uD83D\uDCCB': 'clipboard',                              // 📋
  '\uD83D\uDD27': 'gear',                                   // 🔧
  '\uD83D\uDCC5': 'calendar',                               // 📅
  '\uD83D\uDCC4': 'scroll',                                 // 📄
  '\uD83D\uDCDD': 'note',                                   // 📝
  '\uD83D\uDCC1': 'folder',                                 // 📁
  '\uD83D\uDD12': 'lock',                                   // 🔒
  '\uD83C\uDF10': 'globe',                                  // 🌐
  '\uD83D\uDCBB': 'computer',                               // 💻
  '\uD83D\uDCC8': 'barChart',                               // 📈
  '\uD83D\uDCCA': 'barChart',                               // 📊
  '\uD83D\uDC65': 'chat',                                   // 👥
  '\uD83C\uDFA5': 'video',                                  // 🎥
  '\uD83C\uDFA8': 'sparkle',                                // 🎨
  '\u2705': 'checkCircle',                                   // ✅
  '\uD83D\uDDC4\uFE0F': 'database', '\uD83D\uDDC4': 'database', // 🗄️
  '\uD83D\uDDFA\uFE0F': 'map', '\uD83D\uDDFA': 'map',     // 🗺️
  '\u2194\uFE0F': 'biDirectional', '\u2194': 'biDirectional', // ↔️
  '\u26A1': 'bolt', '\u26A1\uFE0F': 'bolt',                // ⚡
  '\uD83D\uDD11': 'key',                                    // 🔑
  '\uD83D\uDCEC': 'mailbox',                                // 📬
  '\uD83D\uDCE6': 'package',                                // 📦
  '\uD83E\uDD9E': 'lobster',                                // 🦞
  '\uD83E\uDD16': 'robot',                                  // 🤖
  '\uD83E\uDDE0': 'brain',                                  // 🧠
  '\uD83D\uDD00': 'shuffle',                                // 🔀
  '\uD83D\uDD17': 'link',                                   // 🔗
  '\uD83D\uDEE1': 'shield', '\uD83D\uDEE1\uFE0F': 'shield', // 🛡
  '\uD83D\uDCCC': 'pin',                                    // 📌
  '\uD83C\uDFDB': 'vault', '\uD83C\uDFDB\uFE0F': 'vault',  // 🏛
  '\uD83D\uDCD3': 'notebook',                               // 📓
  '\uD83D\uDCFD': 'projector', '\uD83D\uDCFD\uFE0F': 'projector', // 📽
  '\uD83D\uDCDA': 'books',                                  // 📚
  '\uD83D\uDC9C': 'heart',                                  // 💜
  '\uD83D\uDD8A': 'pen', '\uD83D\uDD8A\uFE0F': 'pen',     // 🖊
  '\uD83D\uDD35': 'blueCircle',                             // 🔵
  '\uD83D\uDD37': 'blueDiamond',                            // 🔷
  '\u2601': 'cloud', '\u2601\uFE0F': 'cloud',              // ☁
  '\u26C5': 'partlyCloudy',                                 // ⛅
  '\uD83C\uDF24': 'sunCloud', '\uD83C\uDF24\uFE0F': 'sunCloud', // 🌤
  '\uD83D\uDFE0': 'orangeCircle',                           // 🟠
  '\uD83C\uDFD7': 'construction', '\uD83C\uDFD7\uFE0F': 'construction', // 🏗
  '\uD83D\uDE80': 'rocket',                                 // 🚀
  '\uD83D\uDEAB': 'blocked',                                // 🚫
  '\u274C': 'crossCircle',                                   // ❌
  '\u26A0': 'warning', '\u26A0\uFE0F': 'warning',          // ⚠
  '\uD83D\uDDA5\uFE0F': 'terminal', '\uD83D\uDDA5': 'terminal', // 🖥️ → Terminal SVG
  '\uD83D\uDCF2': 'whatsapp',                               // 📲 → WhatsApp SVG
  '\u2708\uFE0F': 'telegram', '\u2708': 'telegram',        // ✈️ → Telegram SVG
  '\u2764': 'redHeart', '\u2764\uFE0F': 'redHeart',        // ❤
  '\uD83D\uDC4D': 'thumbsUp',                               // 👍
  '\u23F3': 'hourglass',                                     // ⏳
  '\u23F0': 'timer',                                         // ⏰
  '\uD83C\uDF05': 'sunrise',                                // 🌅
  '\uD83C\uDFE2': 'building',                               // 🏢
  '\u2699': 'settings', '\u2699\uFE0F': 'settings',        // ⚙
  '\u25B2': 'triangleUp',                                    // ▲
  '\u25BC': 'triangleDown',                                  // ▼
  '\uD83D\uDC41': 'eye', '\uD83D\uDC41\uFE0F': 'eye',     // 👁
};
export function mapEmojiToIcon(emoji, size) {
  if (!emoji) return null;
  var name = _toolIconMap[emoji];
  if (name && E[name]) return E[name](size || 22);
  return emoji; // fallback to raw string if unknown
}
function _mapToolIcon(emoji) {
  return mapEmojiToIcon(emoji, 22);
}

export function ToolsSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent || {};
  var clientOrgId = engineAgent.client_org_id;
  var _d = useApp(); var toast = _d.toast;
  var _orgName = useState(null); var orgName = _orgName[0]; var setOrgName = _orgName[1];
  var _orgToolRestrictions = useState(null); var orgToolRestrictions = _orgToolRestrictions[0]; var setOrgToolRestrictions = _orgToolRestrictions[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _cats = useState([]); var cats = _cats[0]; var setCats = _cats[1];
  var _stats = useState({}); var stats = _stats[0]; var setStats = _stats[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _filter = useState('all'); var filter = _filter[0]; var setFilter = _filter[1];
  var _expanded = useState(null); var expanded = _expanded[0]; var setExpanded = _expanded[1];

  function load() {
    setLoading(true);
    engineCall('/bridge/agents/' + agentId + '/tools')
      .then(function(d) {
        setCats(d.categories || []);
        setStats({ total: d.totalTools, enabled: d.enabledTools });
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }

  useEffect(function() { load(); }, [agentId]);

  // Fetch org info if agent belongs to a client org
  useEffect(function() {
    if (!clientOrgId) return;
    apiCall('/admin/client-orgs/' + clientOrgId).then(function(org) {
      setOrgName(org.name || org.org_name || 'Organization');
      if (org.toolRestrictions || org.tool_restrictions) setOrgToolRestrictions(org.toolRestrictions || org.tool_restrictions);
    }).catch(function() {});
  }, [clientOrgId]);

  function toggle(catId, currentEnabled) {
    setSaving(true);
    var body = {};
    body[catId] = !currentEnabled;
    engineCall('/bridge/agents/' + agentId + '/tools', {
      method: 'PUT',
      body: JSON.stringify(body),
    }).then(function() {
      setCats(function(prev) {
        return prev.map(function(c) {
          return c.id === catId ? Object.assign({}, c, { enabled: !currentEnabled }) : c;
        });
      });
      setStats(function(prev) {
        var cat = cats.find(function(c) { return c.id === catId; });
        var delta = currentEnabled ? -(cat?.toolCount || 0) : (cat?.toolCount || 0);
        return Object.assign({}, prev, { enabled: (prev.enabled || 0) + delta });
      });
      toast((!currentEnabled ? 'Enabled' : 'Disabled') + ' tools', 'success');
      setSaving(false);
    }).catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  function toggleAll(enable) {
    setSaving(true);
    var body = {};
    cats.forEach(function(c) { if (!c.alwaysOn) body[c.id] = enable; });
    engineCall('/bridge/agents/' + agentId + '/tools', {
      method: 'PUT',
      body: JSON.stringify(body),
    }).then(function() {
      load();
      toast(enable ? 'All tools enabled' : 'All optional tools disabled', 'success');
      setSaving(false);
    }).catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  if (loading) return h('div', { className: 'card', style: { padding: 40, textAlign: 'center' } }, 'Loading tools...');

  var filtered = cats.filter(function(c) {
    if (filter === 'enabled') return c.enabled;
    if (filter === 'disabled') return !c.enabled;
    if (filter === 'google') return c.requiresOAuth === 'google' || c.id.startsWith('google_');
    if (filter === 'messaging') return ['whatsapp', 'telegram'].includes(c.id);
    if (filter === 'local') return c.id.startsWith('local_');
    if (filter === 'enterprise') return c.id.startsWith('enterprise_');
    if (filter === 'integrations') return !!c.requiresIntegration;
    return true;
  });

  var googleCats = cats.filter(function(c) { return c.requiresOAuth === 'google' || c.id.startsWith('google_'); });
  var googleAvailable = googleCats.some(function(c) { return c.isAvailable; });

  return h('div', null,
    // Org context banner
    clientOrgId && h('div', { style: { padding: '12px 16px', background: 'var(--info-soft, rgba(14,165,233,0.1))', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--info, #0ea5e9)' } },
      I.building(),
      h('span', null,
        h('strong', null, 'Organization Context: '),
        'Tool access for this agent follows ',
        h('strong', null, orgName || 'organization'),
        ' policies.',
        orgToolRestrictions ? ' This organization has tool-level restrictions in effect.' : ''
      ),
      h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 8px', background: 'var(--info, #0ea5e9)', color: '#fff', marginLeft: 'auto', flexShrink: 0 } }, orgName || 'Org')
    ),
    // Stats bar
    h('div', { style: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      h('div', { className: 'card', style: { padding: '12px 16px', flex: '1 1 auto', minWidth: 150 } },
        h('div', { style: { fontSize: 24, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center' } }, stats.enabled || 0, h(HelpButton, { label: 'Tools' },
          h('p', null, 'Tools are the individual functions an agent can call — like sending email, reading files, searching the web, or executing commands.'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Always On'), ' — Core tools that cannot be disabled (e.g., memory, basic utilities).'),
            h('li', null, h('strong', null, 'OAuth Required'), ' — Tools that need an OAuth connection (e.g., Google Workspace).'),
            h('li', null, h('strong', null, 'Integration'), ' — Tools requiring external service configuration.')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Click any tool category to expand and see the individual tools it contains. Use the toggle to enable/disable entire categories at once.')
        )),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'of ' + (stats.total || 0) + ' tools enabled')
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-sm', disabled: saving, onClick: function() { toggleAll(true); } }, 'Enable All'),
        h('button', { className: 'btn btn-sm btn-danger', disabled: saving, onClick: function() { toggleAll(false); } }, 'Disable Optional')
      )
    ),

    // Google Workspace notice
    !googleAvailable && googleCats.length > 0 && h('div', { style: { padding: '12px 16px', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12 } },
      h('strong', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, E.warning(16), ' Google Workspace tools require OAuth'), ' — ',
      'Connect a Google account in the ', h('strong', null, 'Email'), ' tab to unlock Gmail, Calendar, Drive, Sheets, Docs, and Contacts tools.'
    ),

    // Filter tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [
        { id: 'all', label: 'All' },
        { id: 'enabled', label: 'Enabled' },
        { id: 'disabled', label: 'Disabled' },
        { id: 'google', label: 'Google Workspace' },
        { id: 'messaging', label: 'Messaging' },
        { id: 'local', label: 'Local System' },
        { id: 'enterprise', label: 'Enterprise' },
        { id: 'integrations', label: 'Integrations' },
      ].map(function(f) {
        return h('div', { key: f.id, className: 'tab' + (filter === f.id ? ' active' : ''), onClick: function() { setFilter(f.id); } }, f.label);
      })
    ),

    // Tool category cards
    h('div', { style: { display: 'grid', gap: 12 } },
      filtered.map(function(cat) {
        var isExpanded = expanded === cat.id;
        return h('div', {
          key: cat.id,
          className: 'card',
          style: { opacity: cat.platformUnavailable ? 0.5 : (!cat.isAvailable && cat.requiresOAuth ? 0.6 : 1) }
        },
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' },
            onClick: function() { setExpanded(isExpanded ? null : cat.id); }
          },
            // Icon (map server emoji strings to custom SVG icons)
            h('div', { style: { fontSize: 22, width: 36, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, _mapToolIcon(cat.icon)),
            // Info
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 } },
                h('span', { style: { fontWeight: 600, fontSize: 14 } }, cat.name),
                h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }, cat.toolCount + ' tools'),
                !cat.isAvailable && cat.requiresOAuth && h('span', { className: 'badge badge-warning', style: { fontSize: 10, padding: '1px 6px' } }, 'OAuth Required'),
                cat.platformUnavailable && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: '#dc354520', color: '#dc3545' } }, 'Unavailable'),
                cat.requiresIntegration && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--accent-soft)', color: 'var(--accent-text)' } }, 'Integration'),
                cat.alwaysOn && h('span', { className: 'badge badge-info', style: { fontSize: 10, padding: '1px 6px' } }, 'Always On')
              ),
              h('div', { style: { fontSize: 12, color: cat.platformUnavailable ? '#dc3545' : 'var(--text-muted)' } }, cat.platformUnavailable ? cat.platformMessage : cat.description)
            ),
            // Toggle
            !cat.alwaysOn && !cat.platformUnavailable && h('div', {
              onClick: function(e) { e.stopPropagation(); if (!saving && (cat.isAvailable || cat.enabled)) toggle(cat.id, cat.enabled); },
              style: {
                width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: saving ? 'not-allowed' : 'pointer',
                background: cat.enabled ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0,
              },
            },
              h('div', { style: {
                width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2,
                left: cat.enabled ? 22 : 2, transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              } })
            ),
            cat.alwaysOn && h('div', { style: { width: 44, height: 24, flexShrink: 0 } }),
            // Expand arrow
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 } }, isExpanded ? E.triangleUp(12) : E.triangleDown(12))
          ),

          // Expanded tool list
          isExpanded && h('div', { style: { borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg-secondary)' } },
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              cat.tools.map(function(t) {
                return h('span', {
                  key: t,
                  style: {
                    display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 11,
                    fontFamily: 'var(--font-mono)', background: cat.enabled ? 'var(--accent-soft)' : 'var(--bg-tertiary)',
                    color: cat.enabled ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid ' + (cat.enabled ? 'var(--accent)' : 'var(--border)'),
                  }
                }, t);
              })
            )
          )
        );
      })
    ),

    filtered.length === 0 && h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No tools match this filter.'),

    // ─── Browser Configuration ─────────────────────────
    h(BrowserConfigCard, { agentId: agentId }),

    // ─── Tool Restrictions ─────────────────────────────
    h(ToolRestrictionsCard, { agentId: agentId })
  );
}

