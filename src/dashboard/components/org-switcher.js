import { h, useState, useEffect, useCallback, useRef, Fragment, apiCall, useApp } from './utils.js';
import { I } from './icons.js';

// ─── Global org cache (shared across all switcher instances) ────────
var _orgCache = { orgs: null, loading: false, listeners: [], lastFetch: 0 };
var ORG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getOrgsFromCache(forceRefresh) {
  var now = Date.now();
  // Return cached if fresh
  if (!forceRefresh && _orgCache.orgs && (now - _orgCache.lastFetch) < ORG_CACHE_TTL) {
    return Promise.resolve(_orgCache.orgs);
  }
  // Already loading — wait for it
  if (_orgCache.loading) {
    return new Promise(function(resolve) {
      _orgCache.listeners.push(resolve);
    });
  }
  // Fetch
  _orgCache.loading = true;
  return apiCall('/organizations').then(function(d) {
    var list = d.organizations || [];
    _orgCache.orgs = list;
    _orgCache.lastFetch = Date.now();
    _orgCache.loading = false;
    // Notify waiters
    var listeners = _orgCache.listeners;
    _orgCache.listeners = [];
    listeners.forEach(function(fn) { fn(list); });
    return list;
  }).catch(function() {
    _orgCache.loading = false;
    _orgCache.orgs = _orgCache.orgs || [];
    var listeners = _orgCache.listeners;
    _orgCache.listeners = [];
    listeners.forEach(function(fn) { fn(_orgCache.orgs || []); });
    return _orgCache.orgs || [];
  });
}

/** Invalidate org cache (call after creating/deleting orgs) */
export function invalidateOrgCache() {
  _orgCache.orgs = null;
  _orgCache.lastFetch = 0;
}

/**
 * OrgContextSwitcher — Global org context picker for multi-tenant pages.
 *
 * If the current user has a clientOrgId, the switcher is LOCKED to that org
 * (they can only see their org's data). Owners/admins can switch freely.
 *
 * Uses a global cache so /organizations is only fetched once across all pages.
 */
export function OrgContextSwitcher(props) {
  var onOrgChange = props.onOrgChange;
  var selectedOrgId = props.selectedOrgId || '';
  var showLabel = props.showLabel !== false;
  var style = props.style || {};

  var app = useApp();
  var user = app.user || {};
  var userOrgId = user.clientOrgId || null;
  var isLocked = !!userOrgId && user.role !== 'owner' && user.role !== 'admin';

  var _orgs = useState(_orgCache.orgs || []);
  var orgs = _orgs[0]; var setOrgs = _orgs[1];
  var _loaded = useState(!!_orgCache.orgs);
  var loaded = _loaded[0]; var setLoaded = _loaded[1];

  useEffect(function() {
    // If already cached, use immediately (no API call)
    if (_orgCache.orgs && (Date.now() - _orgCache.lastFetch) < ORG_CACHE_TTL) {
      setOrgs(_orgCache.orgs);
      setLoaded(true);
      return;
    }
    getOrgsFromCache(false).then(function(list) {
      setOrgs(list);
      setLoaded(true);
    });
  }, []);

  // Don't render if no client orgs and user isn't org-bound
  if (loaded && orgs.length === 0 && !userOrgId) return null;
  if (!loaded) return null;

  var effectiveId = isLocked ? userOrgId : selectedOrgId;
  var selectedOrg = orgs.find(function(o) { return o.id === effectiveId; });

  return h('div', {
    style: Object.assign({
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 8px)',
      marginBottom: 16, fontSize: 13
    }, style)
  },
    showLabel && h('span', { style: { color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' } }, I.building(), ' Viewing:'),
    isLocked
      ? h('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 } },
          selectedOrg ? selectedOrg.name : 'Your Organization',
          h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, 'Locked')
        )
      : h('select', {
          value: selectedOrgId,
          onChange: function(e) {
            var id = e.target.value;
            var org = orgs.find(function(o) { return o.id === id; });
            onOrgChange(id, org || null);
          },
          style: {
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13,
            cursor: 'pointer', fontWeight: 600, flex: 1, maxWidth: 300
          }
        },
        h('option', { value: '' }, 'My Organization'),
        orgs.filter(function(o) { return o.is_active !== false; }).map(function(o) {
          return h('option', { key: o.id, value: o.id }, o.name + (o.billing_rate_per_agent > 0 ? ' (' + (o.currency || 'USD') + ' ' + parseFloat(o.billing_rate_per_agent).toFixed(0) + '/agent)' : ''));
        })
      ),
    selectedOrg && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } },
      selectedOrg.contact_name ? selectedOrg.contact_name : '',
      selectedOrg.contact_email ? ' \u2022 ' + selectedOrg.contact_email : ''
    ),
    // Impersonation banner
    app.impersonating && h('span', { className: 'badge badge-warning', style: { fontSize: 10, marginLeft: 'auto' } }, 'Impersonating: ' + (user.name || user.email))
  );
}

/**
 * useOrgContext — Hook that provides org switching state.
 * Auto-selects the user's client org if they are org-bound.
 */
export function useOrgContext() {
  var app = useApp();
  var user = app.user || {};
  var userClientOrgId = user.clientOrgId || null;
  var isLocked = !!userClientOrgId && user.role !== 'owner' && user.role !== 'admin';
  // If user is org-bound (locked), always use their clientOrgId regardless of selectedOrgId
  var selectedOrgId = isLocked ? userClientOrgId : (app.selectedOrgId || '');
  var selectedOrg = app.selectedOrg || null;
  var onOrgChange = app.onOrgChange || function() {};

  // Stable Switcher reference
  var Switcher = useCallback(function(extraProps) {
    return h(OrgContextSwitcher, Object.assign({
      selectedOrgId: selectedOrgId,
      onOrgChange: onOrgChange
    }, extraProps || {}));
  }, [selectedOrgId, onOrgChange]);

  return { selectedOrgId: selectedOrgId, selectedOrg: selectedOrg, onOrgChange: onOrgChange, Switcher: Switcher, isLocked: isLocked, clientOrgId: userClientOrgId };
}
