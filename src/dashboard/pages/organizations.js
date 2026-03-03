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
  var _slugManual = useState(false);
  var slugManual = _slugManual[0]; var setSlugManual = _slugManual[1];

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
    setFname(''); setFslug(''); setFcontact(''); setFemail(''); setFdesc(''); setSlugManual(false);
    setShowCreate(true);
  };

  var openEdit = function(org) {
    setFname(org.name || ''); setFslug(org.slug || ''); setFcontact(org.contact_name || ''); setFemail(org.contact_email || ''); setFdesc(org.description || '');
    setEditOrg(org);
  };

  var openDetail = function(org) {
    setDetailOrg(org);
    loadAllAgents();
    apiCall('/organizations/' + org.id).then(function(data) {
      setDetailAgents(data.agents || []);
      setDetailOrg(data);
    }).catch(function(err) { toast(err.message, 'error'); });
  };

  var doCreate = function() {
    setActing('create');
    apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: fname, slug: fslug, contact_name: fcontact, contact_email: femail, description: fdesc })
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
      body: JSON.stringify({ name: fname, contact_name: fcontact, contact_email: femail, description: fdesc })
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

  var unassignedAgents = allAgents.filter(function(a) {
    return !a.client_org_id && detailAgents.every(function(da) { return da.id !== a.id; });
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
          h('div', { style: { fontSize: 48, marginBottom: 12 } }, '🏢'),
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
                  org.contact_email && h('span', null, '✉ ', org.contact_email),
                  org.created_at && h('span', null, new Date(org.created_at).toLocaleDateString())
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
          h('input', { className: 'input', value: fname, onInput: function(e) { setFname(e.target.value); if (!slugManual) setFslug(slugify(e.target.value)); }, placeholder: 'Acme Corporation' })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Slug *'),
          h('input', { className: 'input', value: fslug, onInput: function(e) { setFslug(e.target.value); setSlugManual(true); }, placeholder: 'acme-corporation', style: { fontFamily: 'var(--font-mono, monospace)' } })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Name'),
          h('input', { className: 'input', value: fcontact, onInput: function(e) { setFcontact(e.target.value); }, placeholder: 'John Doe' })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Email'),
          h('input', { className: 'input', type: 'email', value: femail, onInput: function(e) { setFemail(e.target.value); }, placeholder: 'john@acme.com' })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Description'),
          h('textarea', { className: 'input', value: fdesc, onInput: function(e) { setFdesc(e.target.value); }, placeholder: 'Brief description...', rows: 3, style: { resize: 'vertical' } })
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
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
          h('button', { className: 'btn btn-secondary', onClick: function() { setEditOrg(null); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', disabled: !fname || acting === 'edit', onClick: doEdit }, acting === 'edit' ? 'Saving...' : 'Save Changes')
        )
      )
    ),

    // Detail Modal
    detailOrg && h(Modal, { title: detailOrg.name || 'Organization Detail', onClose: function() { setDetailOrg(null); }, wide: true },
      h('div', { style: { padding: 4 } },
        // Org info
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 } },
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
        detailOrg.description && h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' } }, detailOrg.description),

        // Linked agents
        h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 10 } }, 'Linked Agents (' + detailAgents.length + ')'),
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
            h('option', { value: '' }, '— Select an unassigned agent —'),
            unassignedAgents.map(function(a) {
              return h('option', { key: a.id, value: a.id }, a.name + (a.role ? ' (' + a.role + ')' : ''));
            })
          ),
          h('button', { className: 'btn btn-primary btn-sm', disabled: !assignAgentId || acting === 'assign', onClick: doAssignAgent }, acting === 'assign' ? 'Assigning...' : 'Assign')
        )
      )
    )
  );
}
