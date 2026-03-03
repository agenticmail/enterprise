import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function OrganizationsPage() {
  var app = useApp();
  var toast = app.toast;

  var _orgs = useState([]);
  var orgs = _orgs[0]; var setOrgs = _orgs[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _showCreate = useState(false);
  var showCreate = _showCreate[0]; var setShowCreate = _showCreate[1];
  var _editOrg = useState(null);
  var editOrg = _editOrg[0]; var setEditOrg = _editOrg[1];
  var _detailOrg = useState(null);
  var detailOrg = _detailOrg[0]; var setDetailOrg = _detailOrg[1];
  var _detailAgents = useState([]);
  var detailAgents = _detailAgents[0]; var setDetailAgents = _detailAgents[1];
  var _allAgents = useState([]);
  var allAgents = _allAgents[0]; var setAllAgents = _allAgents[1];
  var _assignAgentId = useState('');
  var assignAgentId = _assignAgentId[0]; var setAssignAgentId = _assignAgentId[1];
  var _acting = useState('');
  var acting = _acting[0]; var setActing = _acting[1];

  // Form state
  var _fname = useState('');
  var fname = _fname[0]; var setFname = _fname[1];
  var _fslug = useState('');
  var fslug = _fslug[0]; var setFslug = _fslug[1];
  var _fcontact = useState('');
  var fcontact = _fcontact[0]; var setFcontact = _fcontact[1];
  var _femail = useState('');
  var femail = _femail[0]; var setFemail = _femail[1];
  var _fdesc = useState('');
  var fdesc = _fdesc[0]; var setFdesc = _fdesc[1];
  var _fbilling = useState('');
  var fbilling = _fbilling[0]; var setFbilling = _fbilling[1];
  var _fcurrency = useState('USD');
  var fcurrency = _fcurrency[0]; var setFcurrency = _fcurrency[1];
  var _slugManual = useState(false);
  var slugManual = _slugManual[0]; var setSlugManual = _slugManual[1];
  var _detailTab = useState('agents');
  var detailTab = _detailTab[0]; var setDetailTab = _detailTab[1];
  var _billingSummary = useState([]);
  var billingSummary = _billingSummary[0]; var setBillingSummary = _billingSummary[1];
  var _billingRecords = useState([]);
  var billingRecords = _billingRecords[0]; var setBillingRecords = _billingRecords[1];

  var loadOrgs = useCallback(function() {
    setLoading(true);
    apiCall('/organizations').then(function(data) {
      setOrgs(data.organizations || []);
    }).catch(function(err) {
      toast(err.message, 'error');
    }).finally(function() { setLoading(false); });
  }, []);

  useEffect(function() { loadOrgs(); }, []);

  var loadAllAgents = function() {
    apiCall('/agents?limit=200').then(function(data) {
      setAllAgents(data.agents || []);
    }).catch(function() {});
  };

  var openCreate = function() {
    setFname(''); setFslug(''); setFcontact(''); setFemail(''); setFdesc(''); setFbilling(''); setFcurrency('USD'); setSlugManual(false);
    setShowCreate(true);
  };

  var openEdit = function(org) {
    setFname(org.name || ''); setFslug(org.slug || ''); setFcontact(org.contact_name || ''); setFemail(org.contact_email || ''); setFdesc(org.description || '');
    setFbilling(org.billing_rate_per_agent ? String(org.billing_rate_per_agent) : ''); setFcurrency(org.currency || 'USD');
    setEditOrg(org);
  };

  var openDetail = function(org) {
    setDetailOrg(org);
    setDetailTab('agents');
    loadAllAgents();
    apiCall('/organizations/' + org.id).then(function(data) {
      setDetailAgents(data.agents || []);
      setDetailOrg(data);
    }).catch(function(err) { toast(err.message, 'error'); });
    apiCall('/organizations/' + org.id + '/billing-summary').then(function(d) { setBillingSummary(d.summary || []); }).catch(function() {});
    apiCall('/organizations/' + org.id + '/billing').then(function(d) { setBillingRecords(d.records || []); }).catch(function() {});
  };

  var doCreate = function() {
    setActing('create');
    apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: fname, slug: fslug, contact_name: fcontact, contact_email: femail, description: fdesc, billing_rate_per_agent: fbilling ? parseFloat(fbilling) : 0, currency: fcurrency })
    }).then(function() {
      toast('Organization created', 'success');
      setShowCreate(false);
      loadOrgs();
    }).catch(function(err) { toast(err.message, 'error'); })
    .finally(function() { setActing(''); });
  };

  var doEdit = function() {
    setActing('edit');
    apiCall('/organizations/' + editOrg.id, {
      method: 'PATCH',
      body: JSON.stringify({ name: fname, contact_name: fcontact, contact_email: femail, description: fdesc, billing_rate_per_agent: fbilling ? parseFloat(fbilling) : 0, currency: fcurrency })
    }).then(function() {
      toast('Organization updated', 'success');
      setEditOrg(null);
      loadOrgs();
    }).catch(function(err) { toast(err.message, 'error'); })
    .finally(function() { setActing(''); });
  };

  var doToggle = function(org) {
    setActing('toggle-' + org.id);
    apiCall('/organizations/' + org.id + '/toggle', { method: 'POST' })
    .then(function() {
      toast('Organization ' + (org.is_active ? 'deactivated' : 'activated'), 'success');
      loadOrgs();
      if (detailOrg && detailOrg.id === org.id) openDetail(org);
    }).catch(function(err) { toast(err.message, 'error'); })
    .finally(function() { setActing(''); });
  };

  var doDelete = function(org) {
    if (!window.__showConfirm) return;
    window.__showConfirm({ title: 'Delete Organization', message: 'Are you sure you want to delete "' + org.name + '"? This cannot be undone.' }).then(function(confirmed) {
      if (!confirmed) return;
      setActing('delete-' + org.id);
      apiCall('/organizations/' + org.id, { method: 'DELETE' })
      .then(function() {
        toast('Organization deleted', 'success');
        loadOrgs();
        if (detailOrg && detailOrg.id === org.id) setDetailOrg(null);
      }).catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
    });
  };

  var doAssignAgent = function() {
    if (!assignAgentId || !detailOrg) return;
    setActing('assign');
    apiCall('/agents/' + assignAgentId + '/assign-org', {
      method: 'POST',
      body: JSON.stringify({ orgId: detailOrg.id })
    }).then(function() {
      toast('Agent assigned', 'success');
      setAssignAgentId('');
      openDetail(detailOrg);
      loadOrgs();
    }).catch(function(err) { toast(err.message, 'error'); })
    .finally(function() { setActing(''); });
  };

  var doUnassignAgent = function(agentId) {
    setActing('unassign-' + agentId);
    apiCall('/agents/' + agentId + '/unassign-org', { method: 'POST' })
    .then(function() {
      toast('Agent unassigned', 'success');
      openDetail(detailOrg);
      loadOrgs();
    }).catch(function(err) { toast(err.message, 'error'); })
    .finally(function() { setActing(''); });
  };

  // Show agents not already in THIS org (includes unassigned AND agents from other orgs)
  var assignableAgents = allAgents.filter(function(a) {
    return detailAgents.every(function(da) { return da.id !== a.id; });
  });

  if (loading) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading organizations...');

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Organizations'),
        h(HelpButton, { label: 'Organizations' },
          h('p', null, 'Manage client organizations and assign agents to them. Each organization represents a tenant or client that your agents serve.'),
          h('ul', { style: { paddingLeft: 20, margin: '8px 0' } },
            h('li', null, 'Create organizations for each client or department'),
            h('li', null, 'Assign agents to organizations to control access'),
            h('li', null, 'Toggle organizations active/inactive to suspend all linked agents'),
            h('li', null, 'Delete organizations only after unassigning all agents')
          )
        )
      ),
      h('button', { className: 'btn btn-primary', onClick: openCreate }, I.plus(), ' New Organization')
    ),

    // Org cards
    orgs.length === 0
      ? h('div', { className: 'card', style: { textAlign: 'center', padding: 40 } },
          h('div', { style: { width: 48, height: 48, margin: '0 auto 12px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            h('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--text-muted)', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('path', { d: 'M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01' })
            )
          ),
          h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 } }, 'No organizations yet'),
          h('div', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 } }, 'Create your first client organization to start managing multi-tenant agent deployments.'),
          h('button', { className: 'btn btn-primary', onClick: openCreate }, I.plus(), ' Create Organization')
        )
      : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 } },
          orgs.map(function(org) {
            return h('div', { key: org.id, className: 'card', style: { cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative' }, onClick: function() { openDetail(org); } },
              h('div', { className: 'card-body' },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 } },
                  h('div', null,
                    h('div', { style: { fontSize: 16, fontWeight: 700, marginBottom: 2 } }, org.name),
                    h('div', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' } }, org.slug)
                  ),
                  h('span', { className: 'badge badge-' + (org.is_active ? 'success' : 'warning') }, org.is_active ? 'Active' : 'Inactive')
                ),
                org.description && h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 } }, org.description),
                h('div', { style: { display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' } },
                  h('span', null, I.agents(), ' ', (org.agent_count || 0), ' agent', (org.agent_count || 0) !== 1 ? 's' : ''),
                  org.billing_rate_per_agent > 0 && h('span', { style: { fontWeight: 600, color: 'var(--success, #15803d)' } }, (org.currency || '$') + ' ', parseFloat(org.billing_rate_per_agent).toFixed(2), '/agent/mo'),
                  org.contact_email && h('span', null, I.mail(), ' ', org.contact_email)
                ),
                h('div', { style: { display: 'flex', gap: 6, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }, onClick: function(e) { e.stopPropagation(); } },
                  h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { openEdit(org); } }, I.edit(), ' Edit'),
                  h('button', { className: 'btn btn-ghost btn-sm', disabled: acting === 'toggle-' + org.id, onClick: function() { doToggle(org); } },
                    org.is_active ? 'Deactivate' : 'Activate'
                  ),
                  (org.agent_count || 0) === 0 && h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, disabled: acting === 'delete-' + org.id, onClick: function() { doDelete(org); } }, I.trash(), ' Delete')
                )
              )
            );
          })
        ),

    // Create Modal
    showCreate && h(Modal, { title: 'Create Organization', onClose: function() { setShowCreate(false); } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, padding: 4 } },
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Name *'),
          h('input', { className: 'input', value: fname, onInput: function(e) { setFname(e.target.value); if (!slugManual) setFslug(slugify(e.target.value)); }, placeholder: 'AgenticMail' })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Slug *'),
          h('input', { className: 'input', value: fslug, onInput: function(e) { setFslug(e.target.value); setSlugManual(true); }, placeholder: 'agenticmail', style: { fontFamily: 'var(--font-mono, monospace)' } })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Name'),
          h('input', { className: 'input', value: fcontact, onInput: function(e) { setFcontact(e.target.value); }, placeholder: 'Ope Olatunji' })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Email'),
          h('input', { className: 'input', type: 'email', value: femail, onInput: function(e) { setFemail(e.target.value); }, placeholder: 'ope@agenticmail.io' })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Description'),
          h('textarea', { className: 'input', value: fdesc, onInput: function(e) { setFdesc(e.target.value); }, placeholder: 'Brief description...', rows: 3, style: { resize: 'vertical' } })
        ),
        h('div', { style: { display: 'flex', gap: 12 } },
          h('div', { style: { flex: 1 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Billing Rate / Agent / Month'),
            h('input', { className: 'input', type: 'number', step: '0.01', min: '0', value: fbilling, onInput: function(e) { setFbilling(e.target.value); }, placeholder: '0.00' })
          ),
          h('div', { style: { width: 100 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Currency'),
            h('select', { className: 'input', value: fcurrency, onChange: function(e) { setFcurrency(e.target.value); } },
              h('option', { value: 'USD' }, 'USD'), h('option', { value: 'EUR' }, 'EUR'), h('option', { value: 'GBP' }, 'GBP'), h('option', { value: 'NGN' }, 'NGN'), h('option', { value: 'CAD' }, 'CAD'), h('option', { value: 'AUD' }, 'AUD')
            )
          )
        ),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
          h('button', { className: 'btn btn-secondary', onClick: function() { setShowCreate(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', disabled: !fname || !fslug || acting === 'create', onClick: doCreate }, acting === 'create' ? 'Creating...' : 'Create')
        )
      )
    ),

    // Edit Modal
    editOrg && h(Modal, { title: 'Edit Organization', onClose: function() { setEditOrg(null); } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, padding: 4 } },
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Name'),
          h('input', { className: 'input', value: fname, onInput: function(e) { setFname(e.target.value); } })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Slug'),
          h('input', { className: 'input', value: fslug, disabled: true, style: { fontFamily: 'var(--font-mono, monospace)', opacity: 0.6 } })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Name'),
          h('input', { className: 'input', value: fcontact, onInput: function(e) { setFcontact(e.target.value); } })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Email'),
          h('input', { className: 'input', type: 'email', value: femail, onInput: function(e) { setFemail(e.target.value); } })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Description'),
          h('textarea', { className: 'input', value: fdesc, onInput: function(e) { setFdesc(e.target.value); }, rows: 3, style: { resize: 'vertical' } })
        ),
        h('div', { style: { display: 'flex', gap: 12 } },
          h('div', { style: { flex: 1 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Billing Rate / Agent / Month'),
            h('input', { className: 'input', type: 'number', step: '0.01', min: '0', value: fbilling, onInput: function(e) { setFbilling(e.target.value); }, placeholder: '0.00' })
          ),
          h('div', { style: { width: 100 } },
            h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Currency'),
            h('select', { className: 'input', value: fcurrency, onChange: function(e) { setFcurrency(e.target.value); } },
              h('option', { value: 'USD' }, 'USD'), h('option', { value: 'EUR' }, 'EUR'), h('option', { value: 'GBP' }, 'GBP'), h('option', { value: 'NGN' }, 'NGN'), h('option', { value: 'CAD' }, 'CAD'), h('option', { value: 'AUD' }, 'AUD')
            )
          )
        ),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
          h('button', { className: 'btn btn-secondary', onClick: function() { setEditOrg(null); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', disabled: !fname || acting === 'edit', onClick: doEdit }, acting === 'edit' ? 'Saving...' : 'Save Changes')
        )
      )
    ),

    // Detail Modal
    detailOrg && h(Modal, { title: detailOrg.name || 'Organization Detail', onClose: function() { setDetailOrg(null); }, width: 700 },
      h('div', { style: { padding: 4 } },
        // Org info
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 } },
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 } }, 'Slug'),
            h('div', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 13 } }, detailOrg.slug)
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 } }, 'Status'),
            h('span', { className: 'badge badge-' + (detailOrg.is_active ? 'success' : 'warning') }, detailOrg.is_active ? 'Active' : 'Inactive')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 } }, 'Contact'),
            h('div', { style: { fontSize: 13 } }, detailOrg.contact_name || '—'),
            detailOrg.contact_email && h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, detailOrg.contact_email)
          )
        ),
        // Billing rate in header
        (detailOrg.billing_rate_per_agent > 0 || detailAgents.some(function(a) { return a.billing_rate > 0; })) && h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--success-soft, rgba(21,128,61,0.06))', borderRadius: 8, marginBottom: 16, fontSize: 13, flexWrap: 'wrap' } },
          h('div', null, h('strong', null, 'Default Rate: '), (detailOrg.currency || 'USD') + ' ' + parseFloat(detailOrg.billing_rate_per_agent || 0).toFixed(2) + '/agent/month'),
          h('div', null, h('strong', null, 'Monthly Revenue: '), (function() {
            var total = detailAgents.reduce(function(sum, a) {
              var rate = a.billing_rate > 0 ? parseFloat(a.billing_rate) : parseFloat(detailOrg.billing_rate_per_agent || 0);
              return sum + rate;
            }, 0);
            return (detailOrg.currency || 'USD') + ' ' + total.toFixed(2);
          })()),
          h('div', null, h('strong', null, 'Agents: '), detailAgents.length)
        ),

        detailOrg.description && h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' } }, detailOrg.description),

        // Tabs
        h('div', { style: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 } },
          ['agents', 'billing'].map(function(t) {
            return h('button', {
              key: t, type: 'button',
              style: { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: detailTab === t ? 'var(--primary)' : 'var(--text-muted)', borderBottom: detailTab === t ? '2px solid var(--primary)' : '2px solid transparent', fontFamily: 'var(--font)' },
              onClick: function() { setDetailTab(t); }
            }, t === 'agents' ? 'Agents (' + detailAgents.length + ')' : 'Billing & Costs');
          })
        ),

        // ── Agents Tab ────────────────────────────
        detailTab === 'agents' && h(Fragment, null,
        h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 10 } }, 'Linked Agents'),
        detailAgents.length > 0
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 } },
              detailAgents.map(function(a) {
                var stateColor = { active: 'success', running: 'success', suspended: 'warning', archived: 'neutral' }[a.status] || 'neutral';
                return h('div', { key: a.id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('span', { style: { fontWeight: 600, fontSize: 13 } }, a.name),
                    h('span', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' } }, a.email),
                    h('span', { className: 'badge badge-' + stateColor, style: { fontSize: 10 } }, a.status)
                  ),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, disabled: acting === 'unassign-' + a.id, onClick: function() { doUnassignAgent(a.id); } }, 'Unassign')
                );
              })
            )
          : h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 16 } }, 'No agents assigned to this organization'),

        // Assign agent
        h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, 'Assign Agent'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('select', { className: 'input', value: assignAgentId, onChange: function(e) { setAssignAgentId(e.target.value); }, style: { flex: 1 } },
            h('option', { value: '' }, '— Select an agent to assign —'),
            assignableAgents.map(function(a) {
              var label = a.name + (a.role ? ' (' + a.role + ')' : '');
              if (a.client_org_id) {
                var fromOrg = orgs.find(function(o) { return o.id === a.client_org_id; });
                label += fromOrg ? ' [from ' + fromOrg.name + ']' : ' [assigned elsewhere]';
              }
              return h('option', { key: a.id, value: a.id }, label);
            })
          ),
          h('button', { className: 'btn btn-primary btn-sm', disabled: !assignAgentId || acting === 'assign', onClick: doAssignAgent }, acting === 'assign' ? 'Assigning...' : 'Assign')
        )
        ), // end agents tab

        // ── Billing Tab ───────────────────────────
        detailTab === 'billing' && h(Fragment, null,
          // Revenue vs Cost chart
          billingSummary.length > 0 && h('div', { style: { marginBottom: 20 } },
            h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 12 } }, 'Revenue vs Cost'),
            h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, padding: '0 8px', borderBottom: '1px solid var(--border)' } },
              billingSummary.map(function(m, i) {
                var rev = parseFloat(m.total_revenue) || 0;
                var cost = parseFloat(m.total_cost) || 0;
                var maxVal = Math.max.apply(null, billingSummary.map(function(s) { return Math.max(parseFloat(s.total_revenue) || 0, parseFloat(s.total_cost) || 0); })) || 1;
                var revH = Math.max(4, (rev / maxVal) * 140);
                var costH = Math.max(4, (cost / maxVal) * 140);
                var profit = rev - cost;
                return h('div', { key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 } },
                  h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 2, height: 144 } },
                    h('div', { title: 'Revenue: ' + rev.toFixed(2), style: { width: 14, height: revH, background: 'var(--success, #15803d)', borderRadius: '3px 3px 0 0', minHeight: 4 } }),
                    h('div', { title: 'Cost: ' + cost.toFixed(2), style: { width: 14, height: costH, background: 'var(--danger, #dc2626)', borderRadius: '3px 3px 0 0', minHeight: 4, opacity: 0.7 } })
                  ),
                  h('div', { style: { fontSize: 9, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' } }, m.month ? m.month.slice(5) : ''),
                  h('div', { style: { fontSize: 9, color: profit >= 0 ? 'var(--success, #15803d)' : 'var(--danger)', fontWeight: 600 } }, profit >= 0 ? '+' + profit.toFixed(0) : profit.toFixed(0))
                );
              })
            ),
            h('div', { style: { display: 'flex', gap: 16, marginTop: 8, fontSize: 11 } },
              h('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, h('span', { style: { width: 10, height: 10, borderRadius: 2, background: 'var(--success, #15803d)', display: 'inline-block' } }), 'Revenue'),
              h('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, h('span', { style: { width: 10, height: 10, borderRadius: 2, background: 'var(--danger)', opacity: 0.7, display: 'inline-block' } }), 'Token Cost'),
              (function() {
                var totRev = billingSummary.reduce(function(a, m) { return a + (parseFloat(m.total_revenue) || 0); }, 0);
                var totCost = billingSummary.reduce(function(a, m) { return a + (parseFloat(m.total_cost) || 0); }, 0);
                return h('span', { style: { marginLeft: 'auto', fontWeight: 600, color: (totRev - totCost) >= 0 ? 'var(--success, #15803d)' : 'var(--danger)' } },
                  'Net: ' + (detailOrg.currency || 'USD') + ' ' + (totRev - totCost).toFixed(2)
                );
              })()
            )
          ),

          billingSummary.length === 0 && h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 16 } },
            'No billing data yet. Billing records are created as agents process tasks and accumulate token costs.'
          ),

          // Per-agent billing rates
          detailAgents.length > 0 && h('div', { style: { marginBottom: 20 } },
            h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, 'Per-Agent Billing Rates'),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 } }, 'Set custom billing rates per agent. Leave blank to use the default org rate (' + (detailOrg.currency || 'USD') + ' ' + parseFloat(detailOrg.billing_rate_per_agent || 0).toFixed(2) + '/agent/month).'),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 } },
              detailAgents.map(function(a) {
                var agentRate = a.billing_rate > 0 ? parseFloat(a.billing_rate) : 0;
                var effectiveRate = agentRate > 0 ? agentRate : parseFloat(detailOrg.billing_rate_per_agent || 0);
                return h('div', { key: a.id, style: { padding: 10, background: 'var(--bg-tertiary)', borderRadius: 8 } },
                  h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 6 } }, a.name || a.id),
                  h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, detailOrg.currency || 'USD'),
                    h('input', { className: 'input', type: 'number', step: '0.01', min: '0', value: agentRate > 0 ? agentRate : '',
                      placeholder: effectiveRate.toFixed(2),
                      onChange: function(e) {
                        var val = parseFloat(e.target.value) || 0;
                        apiCall('/agents/' + a.id, { method: 'PATCH', body: JSON.stringify({ billingRate: val }) })
                          .then(function() { toast('Rate updated for ' + (a.name || a.id), 'success'); })
                          .catch(function(err) { toast(err.message, 'error'); });
                      },
                      style: { width: 90, fontSize: 12, padding: '4px 6px' }
                    }),
                    h('span', { style: { fontSize: 10, color: 'var(--text-muted)' } }, '/mo')
                  ),
                  agentRate > 0 && h('div', { style: { fontSize: 10, color: 'var(--success, #15803d)', marginTop: 4 } }, 'Custom rate')
                );
              })
            )
          ),

          // Stats summary
          (function() {
            var totRev = billingSummary.reduce(function(a, m) { return a + (parseFloat(m.total_revenue) || 0); }, 0);
            var totCost = billingSummary.reduce(function(a, m) { return a + (parseFloat(m.total_cost) || 0); }, 0);
            var totIn = billingSummary.reduce(function(a, m) { return a + (parseInt(m.total_input_tokens) || 0); }, 0);
            var totOut = billingSummary.reduce(function(a, m) { return a + (parseInt(m.total_output_tokens) || 0); }, 0);
            var margin = totRev > 0 ? ((totRev - totCost) / totRev * 100) : 0;
            return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 } },
              h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center' } },
                h('div', { style: { fontSize: 18, fontWeight: 700, color: 'var(--success, #15803d)' } }, (detailOrg.currency || 'USD') + ' ' + totRev.toFixed(2)),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Total Revenue')
              ),
              h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center' } },
                h('div', { style: { fontSize: 18, fontWeight: 700, color: 'var(--danger)' } }, (detailOrg.currency || 'USD') + ' ' + totCost.toFixed(4)),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Token Cost')
              ),
              h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center' } },
                h('div', { style: { fontSize: 18, fontWeight: 700, color: margin >= 0 ? 'var(--success, #15803d)' : 'var(--danger)' } }, margin.toFixed(1) + '%'),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Margin')
              ),
              h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center' } },
                h('div', { style: { fontSize: 18, fontWeight: 700 } }, ((totIn + totOut) / 1000).toFixed(1) + 'K'),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Total Tokens')
              )
            );
          })(),

          // Per-agent breakdown table
          billingRecords.length > 0 && h(Fragment, null,
            h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, 'Records'),
            h('div', { style: { overflowX: 'auto' } },
              h('table', null,
                h('thead', null, h('tr', null,
                  h('th', null, 'Month'), h('th', null, 'Agent'), h('th', { style: { textAlign: 'right' } }, 'Revenue'), h('th', { style: { textAlign: 'right' } }, 'Token Cost'), h('th', { style: { textAlign: 'right' } }, 'Profit'), h('th', { style: { textAlign: 'right' } }, 'Tokens')
                )),
                h('tbody', null,
                  billingRecords.map(function(r, i) {
                    var rev = parseFloat(r.revenue) || 0;
                    var cost = parseFloat(r.token_cost) || 0;
                    var agent = detailAgents.find(function(a) { return a.id === r.agent_id; });
                    return h('tr', { key: i },
                      h('td', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, r.month),
                      h('td', null, agent ? agent.name : (r.agent_id ? r.agent_id.slice(0, 8) : 'All')),
                      h('td', { style: { textAlign: 'right', color: 'var(--success, #15803d)' } }, rev.toFixed(2)),
                      h('td', { style: { textAlign: 'right', color: 'var(--danger)' } }, cost.toFixed(4)),
                      h('td', { style: { textAlign: 'right', fontWeight: 600, color: (rev - cost) >= 0 ? 'var(--success, #15803d)' : 'var(--danger)' } }, (rev - cost).toFixed(2)),
                      h('td', { style: { textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' } }, ((parseInt(r.input_tokens) || 0) + (parseInt(r.output_tokens) || 0)).toLocaleString())
                    );
                  })
                )
              )
            )
          )
        ) // end billing tab
      )
    )
  );
}
