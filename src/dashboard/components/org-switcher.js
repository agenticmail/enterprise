import { h, useState, useEffect, Fragment, apiCall } from './utils.js';
import { I } from './icons.js';

/**
 * OrgContextSwitcher — Global org context picker for multi-tenant pages.
 *
 * Props:
 *   onOrgChange(orgId, org) — called when org selection changes
 *   selectedOrgId — currently selected org ID ('' = my org)
 *   style — optional container style override
 *   showLabel — show "Viewing:" label (default true)
 *
 * The component loads client_organizations from the API and renders a
 * compact dropdown that switches between "My Organization" and client orgs.
 */
export function OrgContextSwitcher(props) {
  var onOrgChange = props.onOrgChange;
  var selectedOrgId = props.selectedOrgId || '';
  var showLabel = props.showLabel !== false;
  var style = props.style || {};

  var _orgs = useState([]);
  var orgs = _orgs[0]; var setOrgs = _orgs[1];
  var _loaded = useState(false);
  var loaded = _loaded[0]; var setLoaded = _loaded[1];

  useEffect(function() {
    apiCall('/organizations').then(function(d) {
      setOrgs(d.organizations || []);
      setLoaded(true);
    }).catch(function() { setLoaded(true); });
  }, []);

  // Don't render if no client orgs exist
  if (loaded && orgs.length === 0) return null;
  if (!loaded) return null;

  var selectedOrg = orgs.find(function(o) { return o.id === selectedOrgId; });

  return h('div', {
    style: Object.assign({
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
      background: 'var(--bg-tertiary)', borderRadius: 'var(--radius, 8px)',
      marginBottom: 16, fontSize: 13
    }, style)
  },
    showLabel && h('span', { style: { color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' } }, I.building(), ' Viewing:'),
    h('select', {
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
    )
  );
}

/**
 * useOrgContext — Hook that provides org switching state.
 * Returns [selectedOrgId, selectedOrg, onOrgChange, OrgSwitcher component]
 */
export function useOrgContext() {
  var _sel = useState('');
  var selectedOrgId = _sel[0]; var setSelectedOrgId = _sel[1];
  var _org = useState(null);
  var selectedOrg = _org[0]; var setSelectedOrg = _org[1];

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
