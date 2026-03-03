import { h, useState, useEffect, Fragment, apiCall, useApp } from './utils.js';
import { I } from './icons.js';

/**
 * OrgContextSwitcher — Global org context picker for multi-tenant pages.
 *
 * If the current user has a clientOrgId, the switcher is LOCKED to that org
 * (they can only see their org's data). Owners/admins can switch freely.
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

  var _orgs = useState([]);
  var orgs = _orgs[0]; var setOrgs = _orgs[1];
  var _loaded = useState(false);
  var loaded = _loaded[0]; var setLoaded = _loaded[1];

  useEffect(function() {
    apiCall('/organizations').then(function(d) {
      var list = d.organizations || [];
      setOrgs(list);
      setLoaded(true);
      // Auto-select user's org on first load if org-bound
      if (userOrgId && !selectedOrgId) {
        var org = list.find(function(o) { return o.id === userOrgId; });
        if (org) onOrgChange(userOrgId, org);
      }
    }).catch(function() { setLoaded(true); });
  }, [userOrgId]);

  // Don't render if no client orgs and user isn't org-bound
  if (loaded && orgs.length === 0 && !userOrgId) return null;
  if (!loaded) return null;

  var effectiveId = isLocked ? userOrgId : selectedOrgId;
  var selectedOrg = orgs.find(function(o) { return o.id === effectiveId; });

  return h('div', {
    style: Object.assign({
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
      background: 'var(--bg-tertiary)', borderRadius: 'var(--radius, 8px)',
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
  var userOrgId = user.clientOrgId || '';

  var _sel = useState(userOrgId);
  var selectedOrgId = _sel[0]; var setSelectedOrgId = _sel[1];
  var _org = useState(null);
  var selectedOrg = _org[0]; var setSelectedOrg = _org[1];

  // If user changes (e.g. impersonation), update default
  useEffect(function() {
    if (userOrgId && !selectedOrgId) setSelectedOrgId(userOrgId);
  }, [userOrgId]);

  var onOrgChange = function(id, org) {
    setSelectedOrgId(id);
    setSelectedOrg(org);
  };

  var Switcher = function(extraProps) {
    return h(OrgContextSwitcher, Object.assign({
      selectedOrgId: selectedOrgId,
      onOrgChange: onOrgChange
    }, extraProps || {}));
  };

  return { selectedOrgId: selectedOrgId, selectedOrg: selectedOrg, onOrgChange: onOrgChange, Switcher: Switcher };
}
