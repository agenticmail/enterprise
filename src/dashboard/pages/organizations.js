import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { Modal } from '../components/modal.js';
import { invalidateOrgCache } from '../components/org-switcher.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

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
  // Integrations state
  var _integrations = useState([]);
  var integrations = _integrations[0]; var setIntegrations = _integrations[1];
  var _intLoading = useState(false);
  var intLoading = _intLoading[0]; var setIntLoading = _intLoading[1];
  var _showAddInt = useState(false);
  var showAddInt = _showAddInt[0]; var setShowAddInt = _showAddInt[1];
  var _intForm = useState({ provider: 'google', clientId: '', clientSecret: '', email: '', tenantId: '', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', imapHost: '', imapPort: 993, domain: '' });
  var intForm = _intForm[0]; var setIntForm = _intForm[1];
  var _intActing = useState('');
  var intActing = _intActing[0]; var setIntActing = _intActing[1];

  // Roles tab state
  var _availableRoles = useState([]);
  var availableRoles = _availableRoles[0]; var setAvailableRoles = _availableRoles[1];
  var _orgAllowedRoles = useState([]);
  var orgAllowedRoles = _orgAllowedRoles[0]; var setOrgAllowedRoles = _orgAllowedRoles[1];
  var _rolesLoading = useState(false);
  var rolesLoading = _rolesLoading[0]; var setRolesLoading = _rolesLoading[1];
  var _rolesSaving = useState(false);
  var rolesSaving = _rolesSaving[0]; var setRolesSaving = _rolesSaving[1];
  var _roleSearch = useState('');
  var roleSearch = _roleSearch[0]; var setRoleSearch = _roleSearch[1];

  // Pages tab state
  var _orgAllowedPages = useState([]);
  var orgAllowedPages = _orgAllowedPages[0]; var setOrgAllowedPages = _orgAllowedPages[1];
  var _pagesSaving = useState(false);
  var pagesSaving = _pagesSaving[0]; var setPagesSaving = _pagesSaving[1];
  // All extra pages that can be granted to client orgs (not in default set)
  var EXTRA_PAGES = [
    { id: 'polymarket', label: 'Polymarket', desc: 'Prediction market trading dashboard' },
    { id: 'cluster', label: 'Cluster', desc: 'Multi-node cluster management' },
    { id: 'organizations', label: 'Organizations', desc: 'Organization management' },
  ];

  var loadOrgPages = function(org) {
    var ap = org.allowed_pages;
    if (typeof ap === 'string') try { ap = JSON.parse(ap); } catch { ap = null; }
    setOrgAllowedPages(Array.isArray(ap) ? ap : []);
  };

  var saveOrgPages = async function() {
    setPagesSaving(true);
    try {
      await apiCall('/organizations/' + detailOrg.id, {
        method: 'PUT',
        body: JSON.stringify({ allowed_pages: orgAllowedPages })
      });
      toast('Page access updated', 'success');
      setDetailOrg(Object.assign({}, detailOrg, { allowed_pages: orgAllowedPages }));
    } catch (e) { toast(e.message || 'Failed', 'error'); }
    setPagesSaving(false);
  };

  var loadOrgRoles = function(org) {
    setRolesLoading(true);
    Promise.all([
      engineCall('/souls/by-category'),
      apiCall('/roles'),
    ]).then(function(results) {
      var builtIn = Object.values(results[0].categories || {}).flat().map(function(r) { return Object.assign({}, r, { isCustom: false }); });
      var custom = (results[1].roles || []).map(function(r) { return Object.assign({}, r, { isCustom: true }); });
      setAvailableRoles(builtIn.concat(custom));
      var ar = org.allowed_roles;
      if (typeof ar === 'string') try { ar = JSON.parse(ar); } catch { ar = null; }
      setOrgAllowedRoles(Array.isArray(ar) ? ar : []);
      setRolesLoading(false);
    }).catch(function() { setRolesLoading(false); });
  };

  var toggleRole = function(roleId) {
    setOrgAllowedRoles(function(prev) {
      var idx = prev.indexOf(roleId);
      if (idx >= 0) return prev.filter(function(id) { return id !== roleId; });
      return prev.concat([roleId]);
    });
  };

  var selectAllRoles = function() {
    setOrgAllowedRoles(availableRoles.map(function(r) { return r.id || r.slug; }));
  };

  var deselectAllRoles = function() {
    setOrgAllowedRoles([]);
  };

  var saveAllowedRoles = function() {
    if (!detailOrg) return;
    setRolesSaving(true);
    apiCall('/organizations/' + detailOrg.id, {
      method: 'PATCH',
      body: JSON.stringify({ allowed_roles: orgAllowedRoles })
    }).then(function(updated) {
      toast('Allowed roles saved (' + orgAllowedRoles.length + ' roles)', 'success');
      setDetailOrg(Object.assign({}, detailOrg, { allowed_roles: orgAllowedRoles }));
      setRolesSaving(false);
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setRolesSaving(false);
    });
  };

  // Skills tab state
  var _availableSkills = useState([]);
  var availableSkills = _availableSkills[0]; var setAvailableSkills = _availableSkills[1];
  var _orgAllowedSkills = useState([]);
  var orgAllowedSkills = _orgAllowedSkills[0]; var setOrgAllowedSkills = _orgAllowedSkills[1];
  var _skillsLoading = useState(false);
  var skillsLoading = _skillsLoading[0]; var setSkillsLoading = _skillsLoading[1];
  var _skillsSaving = useState(false);
  var skillsSaving = _skillsSaving[0]; var setSkillsSaving = _skillsSaving[1];
  var _skillSearch = useState('');
  var skillSearch = _skillSearch[0]; var setSkillSearch = _skillSearch[1];

  var loadOrgSkills = function(org) {
    setSkillsLoading(true);
    engineCall('/skills/by-category').then(function(d) {
      var all = [];
      Object.entries(d.categories || {}).forEach(function(entry) {
        entry[1].forEach(function(s) { all.push(Object.assign({}, s, { category: entry[0] })); });
      });
      setAvailableSkills(all);
      var as = org.allowed_skills;
      if (typeof as === 'string') try { as = JSON.parse(as); } catch { as = null; }
      setOrgAllowedSkills(Array.isArray(as) ? as : []);
      setSkillsLoading(false);
    }).catch(function() { setSkillsLoading(false); });
  };

  var toggleSkill = function(skillId) {
    setOrgAllowedSkills(function(prev) {
      var idx = prev.indexOf(skillId);
      if (idx >= 0) return prev.filter(function(id) { return id !== skillId; });
      return prev.concat([skillId]);
    });
  };

  var selectAllSkills = function() {
    setOrgAllowedSkills(availableSkills.map(function(s) { return s.id || s.skillId; }));
  };

  var deselectAllSkills = function() {
    setOrgAllowedSkills([]);
  };

  var saveAllowedSkills = function() {
    if (!detailOrg) return;
    setSkillsSaving(true);
    apiCall('/organizations/' + detailOrg.id, {
      method: 'PATCH',
      body: JSON.stringify({ allowed_skills: orgAllowedSkills })
    }).then(function() {
      toast('Allowed skills saved (' + orgAllowedSkills.length + ' skills)', 'success');
      setDetailOrg(Object.assign({}, detailOrg, { allowed_skills: orgAllowedSkills }));
      setSkillsSaving(false);
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setSkillsSaving(false);
    });
  };

  var loadIntegrations = function(orgId) {
    if (!orgId) return;
    setIntLoading(true);
    engineCall('/org-integrations?orgId=' + orgId)
      .then(function(d) { setIntegrations(d.integrations || []); })
      .catch(function() { setIntegrations([]); })
      .finally(function() { setIntLoading(false); });
  };

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
    loadIntegrations(org.id);
  };

  var doCreate = function() {
    setActing('create');
    apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: fname, slug: fslug, contact_name: fcontact, contact_email: femail, description: fdesc, billing_rate_per_agent: fbilling ? parseFloat(fbilling) : 0, currency: fcurrency })
    }).then(function() {
      toast('Organization created', 'success');
      invalidateOrgCache();
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
        invalidateOrgCache();
        loadOrgs();
        if (detailOrg && detailOrg.id === org.id) setDetailOrg(null);
      }).catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setActing(''); });
    });
  };

  var doAssignAgent = async function() {
    if (!assignAgentId || !detailOrg) return;
    // Check if agent already belongs to another org
    var selectedAgent = allAgents.find(function(a) { return a.id === assignAgentId; });
    var existingOrgId = selectedAgent && (selectedAgent.client_org_id || selectedAgent.clientOrgId);
    if (existingOrgId && existingOrgId !== detailOrg.id) {
      var existingOrgName = orgs.find(function(o) { return o.id === existingOrgId; });
      var ok = await window.__showConfirm({
        title: 'Reassign Agent to Different Organization',
        message: 'This agent currently belongs to "' + (existingOrgName ? existingOrgName.name : existingOrgId) + '".\n\nReassigning to "' + detailOrg.name + '" will:\n\n' +
          '\u2022 Clear email configuration (IMAP/SMTP/OAuth) from the previous organization\n' +
          '\u2022 Clear per-agent skill credentials scoped to the previous organization\n' +
          '\u2022 Remove previous organization-level integration access\n\n' +
          'The agent will inherit integrations from "' + detailOrg.name + '" instead.',
        danger: true,
        confirmText: 'Reassign & Clear Credentials'
      });
      if (!ok) return;
    }
    setActing('assign');
    apiCall('/agents/' + assignAgentId + '/assign-org', {
      method: 'POST',
      body: JSON.stringify({ orgId: detailOrg.id })
    }).then(function(d) {
      var msg = 'Agent assigned';
      if (d.reassigned && d.credentialsCleared > 0) msg = 'Reassigned (' + d.credentialsCleared + ' old credential(s) cleared)';
      toast(msg, 'success');
      setAssignAgentId('');
      openDetail(detailOrg);
      loadOrgs();
    }).catch(function(err) { toast(err.message, 'error'); })
    .finally(function() { setActing(''); });
  };

  var doUnassignAgent = async function(agentId) {
    var agentName = (detailAgents.find(function(a) { return a.id === agentId; }) || {}).name || agentId;
    var ok = await window.__showConfirm({
      title: 'Unassign Agent from Organization',
      message: 'Remove "' + agentName + '" from "' + detailOrg.name + '"?\n\nThis will clear:\n\n' +
        '\u2022 Email configuration inherited from this organization\n' +
        '\u2022 Per-agent skill credentials scoped to this organization\n' +
        '\u2022 Organization-level integration access',
      danger: true,
      confirmText: 'Unassign & Clear Credentials'
    });
    if (!ok) return;
    setActing('unassign-' + agentId);
    apiCall('/agents/' + agentId + '/unassign-org', { method: 'POST' })
    .then(function(d) {
      var msg = 'Agent unassigned';
      if (d.credentialsCleared > 0) msg += ' (' + d.credentialsCleared + ' credential(s) cleared)';
      toast(msg, 'success');
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
        h(KnowledgeLink, { page: 'organizations' }),
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
    detailOrg && h(Modal, { title: detailOrg.name || 'Organization Detail', onClose: function() { setDetailOrg(null); }, width: '75vw' },
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
          ['agents', 'roles', 'skills', 'pages', 'integrations', 'billing'].map(function(t) {
            var label = t === 'agents' ? 'Agents (' + detailAgents.length + ')' : t === 'roles' ? 'Visible Roles' : t === 'skills' ? 'Visible Skills' : t === 'pages' ? 'Visible Pages' : t === 'integrations' ? 'Integrations' : 'Billing & Costs';
            return h('button', {
              key: t, type: 'button',
              style: { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: detailTab === t ? 'var(--primary)' : 'var(--text-muted)', borderBottom: detailTab === t ? '2px solid var(--primary)' : '2px solid transparent', fontFamily: 'var(--font)' },
              onClick: function() { setDetailTab(t); if (t === 'roles' && availableRoles.length === 0) loadOrgRoles(detailOrg); if (t === 'skills' && availableSkills.length === 0) loadOrgSkills(detailOrg); if (t === 'pages') loadOrgPages(detailOrg); }
            }, label);
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

        // ── Roles Tab ─────────────────────────────
        detailTab === 'roles' && h(Fragment, null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 700 } }, 'Visible Role Templates'),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Select which role templates users in this organization can see and use. Uncheck all to hide the Roles page entirely.')
            ),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('button', { className: 'btn btn-ghost btn-sm', onClick: selectAllRoles }, 'Select All'),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: deselectAllRoles }, 'Deselect All'),
              h('button', { className: 'btn btn-primary btn-sm', disabled: rolesSaving, onClick: saveAllowedRoles }, rolesSaving ? 'Saving...' : 'Save (' + orgAllowedRoles.length + ')')
            )
          ),

          h('div', { style: { marginBottom: 12 } },
            h('input', { className: 'input', type: 'text', value: roleSearch, onChange: function(e) { setRoleSearch(e.target.value); }, placeholder: 'Search roles...', style: { maxWidth: 300 } })
          ),

          rolesLoading
            ? h('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading roles...')
            : (function() {
                var rs = roleSearch.toLowerCase();
                var filtered = rs ? availableRoles.filter(function(r) { return (r.name || '').toLowerCase().indexOf(rs) >= 0 || (r.category || '').toLowerCase().indexOf(rs) >= 0; }) : availableRoles;
                // Group by category
                var grouped = {};
                filtered.forEach(function(r) {
                  var cat = r.category || 'other';
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(r);
                });
                if (Object.keys(grouped).length === 0) {
                  return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No roles found');
                }
                return h('div', { style: { maxHeight: 400, overflowY: 'auto' } },
                  Object.entries(grouped).map(function(entry) {
                    var cat = entry[0]; var roles = entry[1];
                    var allChecked = roles.every(function(r) { return orgAllowedRoles.indexOf(r.id || r.slug) >= 0; });
                    return h('div', { key: cat, style: { marginBottom: 16 } },
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                        h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
                          h('input', { type: 'checkbox', checked: allChecked, onChange: function() {
                            var ids = roles.map(function(r) { return r.id || r.slug; });
                            if (allChecked) {
                              setOrgAllowedRoles(function(prev) { return prev.filter(function(id) { return ids.indexOf(id) < 0; }); });
                            } else {
                              setOrgAllowedRoles(function(prev) { var s = {}; prev.forEach(function(id) { s[id] = true; }); ids.forEach(function(id) { s[id] = true; }); return Object.keys(s); });
                            }
                          } }),
                          h('span', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' } }, cat.replace(/_/g, ' ') + ' (' + roles.length + ')')
                        )
                      ),
                      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 } },
                        roles.map(function(r) {
                          var rid = r.id || r.slug;
                          var checked = orgAllowedRoles.indexOf(rid) >= 0;
                          return h('label', { key: rid, style: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid ' + (checked ? 'var(--brand-color, #6366f1)' : 'var(--border)'), background: checked ? 'var(--brand-color-alpha, rgba(99,102,241,0.08))' : 'transparent', cursor: 'pointer', fontSize: 12 } },
                            h('input', { type: 'checkbox', checked: checked, onChange: function() { toggleRole(rid); }, style: { marginTop: 2 } }),
                            h('div', null,
                              h('div', { style: { fontWeight: 600, fontSize: 13 } }, r.name, r.isCustom && h('span', { className: 'badge badge-info', style: { fontSize: 9, marginLeft: 6 } }, 'Custom')),
                              r.description && h('div', { style: { color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 } }, r.description.length > 80 ? r.description.slice(0, 80) + '...' : r.description)
                            )
                          );
                        })
                      )
                    );
                  })
                );
              })()
        ),

        // ── Skills Tab ────────────────────────────
        detailTab === 'skills' && h(Fragment, null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 700 } }, 'Visible Skills'),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Select which skills users in this organization can see and configure.')
            ),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('button', { className: 'btn btn-ghost btn-sm', onClick: selectAllSkills }, 'Select All'),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: deselectAllSkills }, 'Deselect All'),
              h('button', { className: 'btn btn-primary btn-sm', disabled: skillsSaving, onClick: saveAllowedSkills }, skillsSaving ? 'Saving...' : 'Save (' + orgAllowedSkills.length + ')')
            )
          ),

          h('div', { style: { marginBottom: 12 } },
            h('input', { className: 'input', type: 'text', value: skillSearch, onChange: function(e) { setSkillSearch(e.target.value); }, placeholder: 'Search skills...', style: { maxWidth: 300 } })
          ),

          skillsLoading
            ? h('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading skills...')
            : (function() {
                var ss = skillSearch.toLowerCase();
                var filtered = ss ? availableSkills.filter(function(s) { return (s.name || '').toLowerCase().indexOf(ss) >= 0 || (s.category || '').toLowerCase().indexOf(ss) >= 0 || (s.description || '').toLowerCase().indexOf(ss) >= 0; }) : availableSkills;
                var grouped = {};
                filtered.forEach(function(s) {
                  var cat = s.category || 'other';
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(s);
                });
                if (Object.keys(grouped).length === 0) {
                  return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No skills found');
                }
                return h('div', { style: { maxHeight: 400, overflowY: 'auto' } },
                  Object.entries(grouped).map(function(entry) {
                    var cat = entry[0]; var items = entry[1];
                    var allChecked = items.every(function(s) { return orgAllowedSkills.indexOf(s.id || s.skillId) >= 0; });
                    return h('div', { key: cat, style: { marginBottom: 16 } },
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                        h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
                          h('input', { type: 'checkbox', checked: allChecked, onChange: function() {
                            var ids = items.map(function(s) { return s.id || s.skillId; });
                            if (allChecked) {
                              setOrgAllowedSkills(function(prev) { return prev.filter(function(id) { return ids.indexOf(id) < 0; }); });
                            } else {
                              setOrgAllowedSkills(function(prev) { var set = {}; prev.forEach(function(id) { set[id] = true; }); ids.forEach(function(id) { set[id] = true; }); return Object.keys(set); });
                            }
                          } }),
                          h('span', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' } }, cat.replace(/_/g, ' ') + ' (' + items.length + ')')
                        )
                      ),
                      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 } },
                        items.map(function(s) {
                          var sid = s.id || s.skillId;
                          var checked = orgAllowedSkills.indexOf(sid) >= 0;
                          return h('label', { key: sid, style: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid ' + (checked ? 'var(--brand-color, #6366f1)' : 'var(--border)'), background: checked ? 'var(--brand-color-alpha, rgba(99,102,241,0.08))' : 'transparent', cursor: 'pointer', fontSize: 12 } },
                            h('input', { type: 'checkbox', checked: checked, onChange: function() { toggleSkill(sid); }, style: { marginTop: 2 } }),
                            h('div', null,
                              h('div', { style: { fontWeight: 600, fontSize: 13 } }, s.name),
                              s.description && h('div', { style: { color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 } }, s.description.length > 80 ? s.description.slice(0, 80) + '...' : s.description)
                            )
                          );
                        })
                      )
                    );
                  })
                );
              })()
        ),

        // ── Pages Tab ──────────────────────────
        detailTab === 'pages' && h(Fragment, null,
          h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 4 } }, 'Visible Pages'),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Grant access to additional dashboard pages beyond the default set. Client org users always see core pages (Dashboard, Agents, Skills, etc). Toggle extra pages here.'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 } },
            EXTRA_PAGES.map(function(pg) {
              var enabled = orgAllowedPages.indexOf(pg.id) !== -1;
              return h('label', { key: pg.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid ' + (enabled ? 'var(--primary)' : 'var(--border)'), background: enabled ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.15s' } },
                h('input', { type: 'checkbox', checked: enabled, onChange: function() {
                  if (enabled) {
                    setOrgAllowedPages(orgAllowedPages.filter(function(p) { return p !== pg.id; }));
                  } else {
                    setOrgAllowedPages(orgAllowedPages.concat([pg.id]));
                  }
                }, style: { cursor: 'pointer', width: 16, height: 16 } }),
                h('div', null,
                  h('div', { style: { fontSize: 13, fontWeight: 600 } }, pg.label),
                  h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, pg.desc)
                )
              );
            })
          ),
          h('button', { className: 'btn btn-primary btn-sm', disabled: pagesSaving, onClick: saveOrgPages }, pagesSaving ? 'Saving...' : 'Save Page Access')
        ),

        // ── Integrations Tab ──────────────────────
        detailTab === 'integrations' && h(Fragment, null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 700 } }, 'Organization Integrations'),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Configure credentials that all agents in this organization will use')
            ),
            h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowAddInt(true); setIntForm({ provider: 'google', clientId: '', clientSecret: '', email: '', tenantId: '', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', imapHost: '', imapPort: 993, domain: '' }); } }, '+ Add Integration')
          ),

          intLoading && h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading...'),

          !intLoading && integrations.length === 0 && h('div', { style: { padding: 32, textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' } },
            h('div', { style: { marginBottom: 8 } }, E.link(32)),
            h('div', { style: { fontWeight: 600, marginBottom: 4 } }, 'No integrations configured'),
            h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 } }, 'Add Google Workspace, Microsoft 365, or SMTP credentials so agents in this organization can access email, calendar, drive, and more.'),
            h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowAddInt(true); } }, 'Add First Integration')
          ),

          !intLoading && integrations.length > 0 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            integrations.map(function(integ) {
              var providerIcon = integ.provider === 'google' ? E.google(16) : integ.provider === 'microsoft' ? E.blueDiamond(16) : integ.provider === 'smtp' ? E.email(16) : E.gear(16);
              var providerLabel = integ.provider === 'google' ? 'Google Workspace' : integ.provider === 'microsoft' ? 'Microsoft 365' : integ.provider === 'smtp' ? 'SMTP / IMAP' : integ.provider;
              var statusColor = integ.status === 'active' ? 'var(--success, #15803d)' : integ.status === 'error' ? 'var(--danger)' : 'var(--text-muted)';
              return h('div', { key: integ.id, className: 'card', style: { padding: 16 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('span', { style: { display: 'inline-flex' } }, providerIcon),
                    h('div', null,
                      h('div', { style: { fontWeight: 600, fontSize: 14 } }, integ.displayName || providerLabel),
                      h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
                        integ.config.email && h('span', null, integ.config.email, ' \u2022 '),
                        h('span', { style: { color: statusColor } }, integ.status),
                        integ.isDefault && h('span', { className: 'badge', style: { marginLeft: 8, background: 'var(--primary)', color: '#fff', fontSize: 10 } }, 'Default'),
                        integ.config._hasRefreshToken && h('span', { className: 'badge', style: { marginLeft: 8, background: 'var(--success, #15803d)', color: '#fff', fontSize: 10 } }, 'OAuth Connected'),
                        integ.config._hasSmtpPass && h('span', { className: 'badge', style: { marginLeft: 8, background: 'var(--info, #0ea5e9)', color: '#fff', fontSize: 10 } }, 'SMTP Configured')
                      )
                    )
                  ),
                  h('div', { style: { display: 'flex', gap: 6 } },
                    (integ.provider === 'google' || integ.provider === 'microsoft') && h('button', {
                      className: 'btn btn-sm',
                      disabled: intActing === 'test-' + integ.id,
                      onClick: function() {
                        setIntActing('test-' + integ.id);
                        engineCall('/org-integrations/' + integ.id + '/test', { method: 'POST' })
                          .then(function(r) {
                            if (r.success) toast('Connected! Email: ' + (r.email || 'verified'), 'success');
                            else toast('Test failed: ' + (r.error || 'Unknown'), 'error');
                          })
                          .catch(function(e) { toast(e.message, 'error'); })
                          .finally(function() { setIntActing(''); });
                      }
                    }, intActing === 'test-' + integ.id ? 'Testing...' : 'Test'),
                    h('button', {
                      className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' },
                      disabled: intActing === 'del-' + integ.id,
                      onClick: function() {
                        if (!confirm('Delete this integration? Agents using it will lose access.')) return;
                        setIntActing('del-' + integ.id);
                        engineCall('/org-integrations/' + integ.id, { method: 'DELETE' })
                          .then(function() { toast('Integration deleted', 'success'); loadIntegrations(detailOrg.id); })
                          .catch(function(e) { toast(e.message, 'error'); })
                          .finally(function() { setIntActing(''); });
                      }
                    }, 'Delete')
                  )
                ),
                // Show config details
                h('div', { style: { marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12, color: 'var(--text-muted)' } },
                  integ.config.clientId && h(Fragment, null, h('span', null, 'Client ID'), h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11 } }, integ.config.clientId.slice(0, 20) + '...')),
                  integ.domain && h(Fragment, null, h('span', null, 'Domain'), h('span', null, integ.domain)),
                  integ.config.tenantId && h(Fragment, null, h('span', null, 'Tenant ID'), h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11 } }, integ.config.tenantId)),
                  integ.config.smtpHost && h(Fragment, null, h('span', null, 'SMTP'), h('span', null, integ.config.smtpHost + ':' + (integ.config.smtpPort || 587))),
                  integ.config.imapHost && h(Fragment, null, h('span', null, 'IMAP'), h('span', null, integ.config.imapHost + ':' + (integ.config.imapPort || 993))),
                  integ.scopes && h(Fragment, null, h('span', null, 'Scopes'), h('span', { style: { fontSize: 10, wordBreak: 'break-all' } }, integ.scopes.split(' ').length + ' scopes granted'))
                )
              );
            })
          ),

          // Add Integration Modal
          showAddInt && h(Modal, { title: 'Add Integration', onClose: function() { setShowAddInt(false); }, width: 520 },
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, padding: 4 } },
              h('div', null,
                h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Provider'),
                h('select', { className: 'input', value: intForm.provider, onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { provider: e.target.value }); }); } },
                  h('option', { value: 'google' }, 'Google Workspace'),
                  h('option', { value: 'microsoft' }, 'Microsoft 365'),
                  h('option', { value: 'smtp' }, 'SMTP / IMAP (Generic)')
                )
              ),

              // OAuth fields (Google / Microsoft)
              (intForm.provider === 'google' || intForm.provider === 'microsoft') && h(Fragment, null,
                h('div', { style: { padding: 12, background: 'var(--info-soft, rgba(14,165,233,0.1))', borderRadius: 'var(--radius)', fontSize: 12 } },
                  intForm.provider === 'google'
                    ? h(Fragment, null,
                        h('strong', null, 'Google Cloud Setup:'), h('br'),
                        '1. Go to ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', style: { color: 'var(--accent)' } }, 'Google Cloud Console'), h('br'),
                        '2. Create an OAuth 2.0 Client ID (Web application)', h('br'),
                        '3. Add redirect URI: ', h('code', { style: { fontSize: 11 } }, window.location.origin + '/api/engine/org-integrations/oauth/callback'), h('br'),
                        '4. Enable required APIs: Gmail, Calendar, Drive, etc.'
                      )
                    : h(Fragment, null,
                        h('strong', null, 'Azure AD Setup:'), h('br'),
                        '1. Go to ', h('a', { href: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps', target: '_blank', style: { color: 'var(--accent)' } }, 'Azure App Registrations'), h('br'),
                        '2. Register a new application', h('br'),
                        '3. Add redirect URI: ', h('code', { style: { fontSize: 11 } }, window.location.origin + '/api/engine/org-integrations/oauth/callback'), h('br'),
                        '4. Create a client secret under Certificates & secrets'
                      )
                ),
                h('div', null,
                  h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Client ID'),
                  h('input', { className: 'input', value: intForm.clientId, placeholder: 'OAuth Client ID', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { clientId: e.target.value }); }); } })
                ),
                h('div', null,
                  h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Client Secret'),
                  h('input', { className: 'input', type: 'password', value: intForm.clientSecret, placeholder: 'OAuth Client Secret', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { clientSecret: e.target.value }); }); } })
                ),
                intForm.provider === 'microsoft' && h('div', null,
                  h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Tenant ID (optional)'),
                  h('input', { className: 'input', value: intForm.tenantId, placeholder: 'Azure AD Tenant ID (or "common")', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { tenantId: e.target.value }); }); } })
                ),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', {
                    className: 'btn btn-primary',
                    disabled: !intForm.clientId || !intForm.clientSecret || intActing === 'oauth',
                    onClick: function() {
                      setIntActing('oauth');
                      engineCall('/org-integrations/oauth/authorize', {
                        method: 'POST',
                        body: JSON.stringify({
                          orgId: detailOrg.id,
                          provider: intForm.provider,
                          clientId: intForm.clientId,
                          clientSecret: intForm.clientSecret,
                          tenantId: intForm.tenantId || undefined,
                          redirectUri: window.location.origin + '/api/engine/org-integrations/oauth/callback',
                        })
                      }).then(function(r) {
                        if (r.authUrl) {
                          // Open OAuth popup
                          var popup = window.open(r.authUrl, 'org-oauth', 'width=600,height=700');
                          // Listen for completion
                          var listener = function(e) {
                            if (e.data && e.data.type === 'org-oauth-result') {
                              window.removeEventListener('message', listener);
                              setIntActing('');
                              if (e.data.status === 'success') {
                                toast('Connected! Email: ' + (e.data.email || 'verified'), 'success');
                                setShowAddInt(false);
                                loadIntegrations(detailOrg.id);
                              } else {
                                toast('OAuth failed: ' + (e.data.message || 'Unknown'), 'error');
                              }
                            }
                          };
                          window.addEventListener('message', listener);
                          // Timeout after 5 min
                          setTimeout(function() { window.removeEventListener('message', listener); setIntActing(''); }, 300000);
                        }
                      }).catch(function(e) { toast(e.message, 'error'); setIntActing(''); });
                    }
                  }, intActing === 'oauth' ? 'Connecting...' : 'Connect with OAuth'),
                  h('button', { className: 'btn btn-ghost', onClick: function() { setShowAddInt(false); } }, 'Cancel')
                )
              ),

              // SMTP fields
              intForm.provider === 'smtp' && h(Fragment, null,
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
                  h('div', null,
                    h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'SMTP Host'),
                    h('input', { className: 'input', value: intForm.smtpHost, placeholder: 'smtp.example.com', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { smtpHost: e.target.value }); }); } })
                  ),
                  h('div', null,
                    h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'SMTP Port'),
                    h('input', { className: 'input', type: 'number', value: intForm.smtpPort, onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { smtpPort: parseInt(e.target.value) || 587 }); }); } })
                  ),
                  h('div', null,
                    h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'IMAP Host'),
                    h('input', { className: 'input', value: intForm.imapHost, placeholder: 'imap.example.com', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { imapHost: e.target.value }); }); } })
                  ),
                  h('div', null,
                    h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'IMAP Port'),
                    h('input', { className: 'input', type: 'number', value: intForm.imapPort, onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { imapPort: parseInt(e.target.value) || 993 }); }); } })
                  )
                ),
                h('div', null,
                  h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Email / Username'),
                  h('input', { className: 'input', value: intForm.email, placeholder: 'agent@company.com', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { email: e.target.value, smtpUser: e.target.value, imapUser: e.target.value }); }); } })
                ),
                h('div', null,
                  h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Password / App Password'),
                  h('input', { className: 'input', type: 'password', value: intForm.smtpPass, placeholder: 'App password', onChange: function(e) { setIntForm(function(f) { return Object.assign({}, f, { smtpPass: e.target.value, imapPass: e.target.value }); }); } })
                ),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', {
                    className: 'btn btn-primary',
                    disabled: !intForm.smtpHost || !intForm.email || intActing === 'smtp',
                    onClick: function() {
                      setIntActing('smtp');
                      engineCall('/org-integrations', {
                        method: 'POST',
                        body: JSON.stringify({
                          orgId: detailOrg.id,
                          provider: 'smtp',
                          providerType: 'smtp',
                          displayName: 'SMTP (' + intForm.email + ')',
                          config: {
                            email: intForm.email,
                            smtpHost: intForm.smtpHost, smtpPort: intForm.smtpPort, smtpUser: intForm.smtpUser || intForm.email, smtpPass: intForm.smtpPass,
                            imapHost: intForm.imapHost, imapPort: intForm.imapPort, imapUser: intForm.imapUser || intForm.email, imapPass: intForm.imapPass || intForm.smtpPass,
                          },
                          isDefault: true,
                        })
                      }).then(function() { toast('SMTP integration created', 'success'); setShowAddInt(false); loadIntegrations(detailOrg.id); })
                        .catch(function(e) { toast(e.message, 'error'); })
                        .finally(function() { setIntActing(''); });
                    }
                  }, intActing === 'smtp' ? 'Saving...' : 'Save SMTP Config'),
                  h('button', { className: 'btn btn-ghost', onClick: function() { setShowAddInt(false); } }, 'Cancel')
                )
              )
            )
          )
        ), // end integrations tab

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
