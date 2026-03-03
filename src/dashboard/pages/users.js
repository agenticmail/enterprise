import { h, useState, useEffect, Fragment, useApp, apiCall, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

// ─── Permission Editor Component ───────────────────

function PermissionEditor({ userId, userName, currentPerms, pageRegistry, onSave, onClose }) {
  // Deep clone perms
  var [grants, setGrants] = useState(function() {
    if (currentPerms === '*') {
      // Start with all pages selected (all tabs)
      var all = {};
      Object.keys(pageRegistry).forEach(function(pid) { all[pid] = true; });
      return all;
    }
    // Clone existing
    var c = {};
    Object.keys(currentPerms || {}).forEach(function(pid) {
      var g = currentPerms[pid];
      c[pid] = g === true ? true : (Array.isArray(g) ? g.slice() : true);
    });
    return c;
  });
  var [fullAccess, setFullAccess] = useState(currentPerms === '*');
  var [saving, setSaving] = useState(false);
  var [expandedPage, setExpandedPage] = useState(null);

  var sections = { overview: [], management: [], administration: [] };
  Object.keys(pageRegistry).forEach(function(pid) {
    var page = pageRegistry[pid];
    if (sections[page.section]) sections[page.section].push(pid);
  });

  var togglePage = function(pid) {
    setGrants(function(g) {
      var next = Object.assign({}, g);
      if (next[pid]) {
        delete next[pid];
        if (expandedPage === pid) setExpandedPage(null);
      } else {
        next[pid] = true;
      }
      return next;
    });
  };

  var toggleTab = function(pid, tabId) {
    setGrants(function(g) {
      var next = Object.assign({}, g);
      var current = next[pid];
      var allTabs = Object.keys(pageRegistry[pid].tabs || {});

      if (current === true) {
        // Was all tabs — remove this one
        var remaining = allTabs.filter(function(t) { return t !== tabId; });
        next[pid] = remaining.length > 0 ? remaining : true;
      } else if (Array.isArray(current)) {
        var idx = current.indexOf(tabId);
        if (idx >= 0) {
          var arr = current.filter(function(t) { return t !== tabId; });
          if (arr.length === 0) delete next[pid]; // no tabs = remove page
          else next[pid] = arr;
        } else {
          var newArr = current.concat([tabId]);
          if (newArr.length === allTabs.length) next[pid] = true; // all tabs = page access
          else next[pid] = newArr;
        }
      }
      return next;
    });
  };

  var isPageChecked = function(pid) { return !!grants[pid]; };
  var isTabChecked = function(pid, tabId) {
    var g = grants[pid];
    if (!g) return false;
    if (g === true) return true;
    return Array.isArray(g) && g.indexOf(tabId) >= 0;
  };

  var toggleFullAccess = function() {
    var newVal = !fullAccess;
    setFullAccess(newVal);
    if (newVal) {
      var all = {};
      Object.keys(pageRegistry).forEach(function(pid) { all[pid] = true; });
      setGrants(all);
    } else {
      setGrants({});
    }
  };

  var selectAll = function() {
    var all = {};
    Object.keys(pageRegistry).forEach(function(pid) { all[pid] = true; });
    setGrants(all);
  };
  var selectNone = function() { setGrants({}); };

  var doSave = async function() {
    setSaving(true);
    try {
      var permsToSave = fullAccess ? '*' : grants;
      await onSave(permsToSave);
    } catch(e) { /* handled by parent */ }
    setSaving(false);
  };

  var sectionLabels = { overview: 'Overview', management: 'Management', administration: 'Administration' };

  var _cs = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, transition: 'background 0.15s' };
  var _csHover = Object.assign({}, _cs, { background: 'var(--bg-tertiary)' });
  var _tabRow = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 40px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' };
  var _checkbox = { width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' };
  var _sectionTitle = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '16px 12px 4px', marginTop: 4 };

  return h(Modal, {
    title: 'Edit Permissions — ' + (userName || 'User'),
    onClose: onClose,
    width: 560,
    footer: h(Fragment, null,
      h('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
      h('button', { className: 'btn btn-primary', onClick: doSave, disabled: saving }, saving ? 'Saving...' : 'Save Permissions')
    )
  },
    // Full access toggle
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: 12, background: fullAccess ? 'var(--success-soft, rgba(21,128,61,0.1))' : 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid ' + (fullAccess ? 'var(--success, #15803d)' : 'var(--border)') } },
      h('div', null,
        h('strong', { style: { fontSize: 13 } }, 'Full Access'),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Owner and Admin roles always have full access')
      ),
      h('input', { type: 'checkbox', checked: fullAccess, onChange: toggleFullAccess, style: Object.assign({}, _checkbox, { width: 20, height: 20 }) })
    ),

    // Quick actions
    !fullAccess && h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
      h('button', { className: 'btn btn-ghost btn-sm', onClick: selectAll, style: { fontSize: 11 } }, 'Select All'),
      h('button', { className: 'btn btn-ghost btn-sm', onClick: selectNone, style: { fontSize: 11 } }, 'Select None')
    ),

    // Page/tab list grouped by section
    !fullAccess && h('div', { style: { maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 } },
      Object.keys(sections).map(function(sectionKey) {
        var pageIds = sections[sectionKey];
        if (pageIds.length === 0) return null;
        return h(Fragment, { key: sectionKey },
          h('div', { style: _sectionTitle }, sectionLabels[sectionKey]),
          pageIds.map(function(pid) {
            var page = pageRegistry[pid];
            var hasTabs = page.tabs && Object.keys(page.tabs).length > 0;
            var isExpanded = expandedPage === pid;
            var checked = isPageChecked(pid);
            var tabCount = hasTabs ? Object.keys(page.tabs).length : 0;
            var checkedTabCount = 0;
            if (hasTabs && checked) {
              if (grants[pid] === true) checkedTabCount = tabCount;
              else if (Array.isArray(grants[pid])) checkedTabCount = grants[pid].length;
            }

            return h(Fragment, { key: pid },
              h('div', {
                style: Object.assign({}, _cs, checked ? { background: 'var(--bg-tertiary)' } : {}),
                onClick: function(e) {
                  // Don't toggle page when clicking the expand arrow
                  if (e.target.tagName === 'svg' || e.target.tagName === 'path' || e.target.closest?.('[data-expand]')) return;
                  togglePage(pid);
                }
              },
                h('input', { type: 'checkbox', checked: checked, readOnly: true, style: _checkbox }),
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontWeight: 500 } }, page.label),
                  page.description && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 } }, page.description)
                ),
                hasTabs && h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  checked && h('span', { style: { fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' } },
                    checkedTabCount + '/' + tabCount + ' tabs'
                  ),
                  h('button', {
                    'data-expand': true,
                    className: 'btn btn-ghost btn-sm',
                    style: { padding: '2px 4px', minWidth: 0 },
                    onClick: function(e) { e.stopPropagation(); setExpandedPage(isExpanded ? null : pid); }
                  }, isExpanded ? I.chevronDown() : I.chevronRight())
                )
              ),
              // Expanded tabs
              hasTabs && isExpanded && checked && Object.keys(page.tabs).map(function(tabId) {
                return h('div', {
                  key: tabId,
                  style: _tabRow,
                  onClick: function() { toggleTab(pid, tabId); }
                },
                  h('input', { type: 'checkbox', checked: isTabChecked(pid, tabId), readOnly: true, style: _checkbox }),
                  h('span', null, page.tabs[tabId])
                );
              })
            );
          })
        );
      })
    ),

    // Summary
    h('div', { style: { marginTop: 12, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' } },
      fullAccess
        ? 'This user has full access to all pages and tabs.'
        : 'Access to ' + Object.keys(grants).length + ' of ' + Object.keys(pageRegistry).length + ' pages.'
    )
  );
}

// ─── Inline Permission Picker (for create modal) ──

function InlinePermissionPicker({ permissions, pageRegistry, onChange }) {
  var [expandedPage, setExpandedPage] = useState(null);

  // Resolve grants from permissions
  var grants = permissions === '*' ? (function() { var a = {}; Object.keys(pageRegistry).forEach(function(p) { a[p] = true; }); return a; })() : (permissions || {});

  var togglePage = function(pid) {
    var next = Object.assign({}, grants);
    if (next[pid]) { delete next[pid]; if (expandedPage === pid) setExpandedPage(null); }
    else { next[pid] = true; }
    onChange(Object.keys(next).length === Object.keys(pageRegistry).length ? '*' : next);
  };

  var toggleTab = function(pid, tabId) {
    var next = Object.assign({}, grants);
    var current = next[pid];
    var allTabs = Object.keys(pageRegistry[pid].tabs || {});
    if (current === true) {
      var remaining = allTabs.filter(function(t) { return t !== tabId; });
      next[pid] = remaining.length > 0 ? remaining : true;
    } else if (Array.isArray(current)) {
      var idx = current.indexOf(tabId);
      if (idx >= 0) {
        var arr = current.filter(function(t) { return t !== tabId; });
        if (arr.length === 0) delete next[pid];
        else next[pid] = arr;
      } else {
        var newArr = current.concat([tabId]);
        next[pid] = newArr.length === allTabs.length ? true : newArr;
      }
    }
    onChange(Object.keys(next).length === Object.keys(pageRegistry).length && Object.values(next).every(function(v) { return v === true; }) ? '*' : next);
  };

  var isTabChecked = function(pid, tabId) {
    var g = grants[pid];
    if (!g) return false;
    if (g === true) return true;
    return Array.isArray(g) && g.indexOf(tabId) >= 0;
  };

  var sections = { overview: 'Overview', management: 'Management', administration: 'Administration' };
  var grouped = {};
  Object.keys(pageRegistry).forEach(function(pid) { var s = pageRegistry[pid].section; if (!grouped[s]) grouped[s] = []; grouped[s].push(pid); });

  return h('div', { style: { maxHeight: 250, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginTop: 8 } },
    Object.keys(sections).map(function(sKey) {
      var pids = grouped[sKey] || [];
      if (!pids.length) return null;
      return h(Fragment, { key: sKey },
        h('div', { style: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px 2px' } }, sections[sKey]),
        pids.map(function(pid) {
          var page = pageRegistry[pid];
          var checked = !!grants[pid];
          var hasTabs = page.tabs && Object.keys(page.tabs).length > 0;
          var isExpanded = expandedPage === pid;
          return h(Fragment, { key: pid },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: checked ? 'var(--bg-tertiary)' : 'transparent' }, onClick: function(e) {
              if (e.target.closest && e.target.closest('[data-expand]')) return;
              togglePage(pid);
            } },
              h('input', { type: 'checkbox', checked: checked, readOnly: true, style: { width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' } }),
              h('span', { style: { flex: 1 } }, page.label),
              hasTabs && checked && h('button', { 'data-expand': true, className: 'btn btn-ghost', style: { padding: '0 4px', minWidth: 0, fontSize: 10, lineHeight: 1 }, onClick: function(e) { e.stopPropagation(); setExpandedPage(isExpanded ? null : pid); } },
                isExpanded ? I.chevronDown() : I.chevronRight()
              )
            ),
            hasTabs && isExpanded && checked && Object.keys(page.tabs).map(function(tabId) {
              return h('div', { key: tabId, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px 3px 34px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }, onClick: function() { toggleTab(pid, tabId); } },
                h('input', { type: 'checkbox', checked: isTabChecked(pid, tabId), readOnly: true, style: { width: 13, height: 13, accentColor: 'var(--primary)', cursor: 'pointer' } }),
                h('span', null, page.tabs[tabId])
              );
            })
          );
        })
      );
    })
  );
}

// ─── Users Page ────────────────────────────────────

export function UsersPage() {
  var { toast } = useApp();
  var [users, setUsers] = useState([]);
  var [creating, setCreating] = useState(false);
  var [form, setForm] = useState({ email: '', password: '', name: '', role: 'viewer', permissions: '*' });
  var [resetTarget, setResetTarget] = useState(null);
  var [newPassword, setNewPassword] = useState('');
  var [resetting, setResetting] = useState(false);
  var [permTarget, setPermTarget] = useState(null);    // user object for permission editing
  var [permGrants, setPermGrants] = useState('*');      // current permissions for target
  var [pageRegistry, setPageRegistry] = useState(null); // page/tab registry from backend

  var load = function() { apiCall('/users').then(function(d) { setUsers(d.users || d || []); }).catch(function() {}); };
  useEffect(function() {
    load();
    apiCall('/page-registry').then(function(d) { setPageRegistry(d); }).catch(function() {});
  }, []);

  var generateCreatePassword = function() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    var pw = '';
    for (var i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setForm(function(f) { return Object.assign({}, f, { password: pw }); });
  };

  var [showCreatePerms, setShowCreatePerms] = useState(false);

  var create = async function() {
    try {
      var body = { email: form.email, password: form.password, name: form.name, role: form.role };
      if (form.permissions !== '*') body.permissions = form.permissions;
      await apiCall('/users', { method: 'POST', body: JSON.stringify(body) });
      toast('User created. They will be prompted to set a new password on first login.', 'success');
      setCreating(false); setForm({ email: '', password: '', name: '', role: 'viewer', permissions: '*' }); setShowCreatePerms(false); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  var resetPassword = async function() {
    if (!resetTarget || !newPassword) return;
    setResetting(true);
    try {
      await apiCall('/users/' + resetTarget.id + '/reset-password', { method: 'POST', body: JSON.stringify({ password: newPassword }) });
      toast('Password reset for ' + (resetTarget.name || resetTarget.email), 'success');
      setResetTarget(null);
      setNewPassword('');
    } catch (e) { toast(e.message, 'error'); }
    setResetting(false);
  };

  var deleteUser = async function(user) {
    var ok = await showConfirm({
      title: 'Delete User',
      message: 'Are you sure you want to delete "' + (user.name || user.email) + '"? This cannot be undone.',
      warning: 'The user will lose all access immediately.',
      danger: true,
      confirmText: 'Delete User'
    });
    if (!ok) return;
    try {
      await apiCall('/users/' + user.id, { method: 'DELETE' });
      toast('User deleted', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  var openPermissions = async function(user) {
    try {
      var d = await apiCall('/users/' + user.id + '/permissions');
      setPermGrants(d.permissions || '*');
      setPermTarget(user);
    } catch (e) { toast('Failed to load permissions', 'error'); }
  };

  var savePermissions = async function(newPerms) {
    try {
      await apiCall('/users/' + permTarget.id + '/permissions', { method: 'PUT', body: JSON.stringify({ permissions: newPerms }) });
      toast('Permissions updated for ' + (permTarget.name || permTarget.email), 'success');
      setPermTarget(null);
      load();
    } catch (e) { toast(e.message, 'error'); throw e; }
  };

  var generatePassword = function() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    var pw = '';
    for (var i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setNewPassword(pw);
  };

  // Permission badge for display
  var permBadge = function(user) {
    if (user.role === 'owner' || user.role === 'admin') {
      return h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, 'Full');
    }
    var p = user.permissions;
    if (!p || p === '*' || p === '"*"') return h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, 'Full');
    try {
      var parsed = typeof p === 'string' ? JSON.parse(p) : p;
      if (parsed === '*') return h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, 'Full');
      var count = Object.keys(parsed).length;
      var total = pageRegistry ? Object.keys(pageRegistry).length : '?';
      return h('span', { className: 'badge badge-warning', style: { fontSize: 10 } }, count + '/' + total + ' pages');
    } catch { return h('span', { className: 'badge badge-neutral', style: { fontSize: 10 } }, 'Custom'); }
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null, h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Users', h(HelpButton, { label: 'Users' },
        h('p', null, 'Manage dashboard users who can access and administer the AgenticMail Enterprise console. Each user has a role that controls what they can see and do.'),
        h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Roles'),
        h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
          h('li', null, h('strong', null, 'Owner'), ' — Full access to everything. Cannot be restricted.'),
          h('li', null, h('strong', null, 'Admin'), ' — Full access to everything. Cannot be restricted.'),
          h('li', null, h('strong', null, 'Member'), ' — Access based on page permissions. Set via the shield icon.'),
          h('li', null, h('strong', null, 'Viewer'), ' — Read-only. Access based on page permissions.')
        ),
        h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Page Permissions'),
        h('p', null, 'Click the shield icon on a Member or Viewer to control which pages and tabs they can see. Pages with tabs (like Agents) allow tab-level control.'),
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Owner and Admin users always have full access — permissions only apply to Member and Viewer roles.')
      )), h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Manage team members and their access')),
      h('button', { className: 'btn btn-primary', onClick: function() { setCreating(true); } }, I.plus(), ' Add User')
    ),

    // Create user modal
    creating && h(Modal, { title: 'Add User', onClose: function() { setCreating(false); setShowCreatePerms(false); }, width: 520, footer: h(Fragment, null, h('button', { className: 'btn btn-secondary', onClick: function() { setCreating(false); setShowCreatePerms(false); } }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: create, disabled: !form.email || !form.password }, 'Create User')) },
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { name: e.target.value }); }); }, autoFocus: true })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Email *'), h('input', { className: 'input', type: 'email', value: form.email, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { email: e.target.value }); }); } })),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Initial Password *'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('input', { className: 'input', type: 'text', value: form.password, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { password: e.target.value }); }); }, placeholder: 'Min 8 characters', style: { flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 } }),
          h('button', { type: 'button', className: 'btn btn-secondary btn-sm', onClick: generateCreatePassword, title: 'Generate random password', style: { whiteSpace: 'nowrap' } }, I.refresh(), ' Generate')
        ),
        form.password && h('div', { style: { marginTop: 6, padding: 8, background: 'var(--warning-soft, rgba(245,158,11,0.08))', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' } },
          'The user will be required to change this password on their first login. Share it securely.'
        )
      ),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Role'), h('select', { className: 'input', value: form.role, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { role: e.target.value }); }); } }, h('option', { value: 'viewer' }, 'Viewer'), h('option', { value: 'member' }, 'Member'), h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'owner' }, 'Owner'))),
      // Inline permissions for member/viewer
      (form.role === 'member' || form.role === 'viewer') && h('div', { style: { marginTop: 4 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('label', { className: 'form-label', style: { marginBottom: 0 } }, 'Page Permissions'),
          h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: function() { setShowCreatePerms(!showCreatePerms); }, style: { fontSize: 11 } }, showCreatePerms ? 'Hide' : 'Customize')
        ),
        !showCreatePerms && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } }, 'Full access (default). Click "Customize" to restrict.'),
        showCreatePerms && pageRegistry && h(InlinePermissionPicker, {
          permissions: form.permissions,
          pageRegistry: pageRegistry,
          onChange: function(p) { setForm(function(f) { return Object.assign({}, f, { permissions: p }); }); }
        })
      ),
      (form.role === 'owner' || form.role === 'admin') && h('div', { style: { marginTop: 8, padding: 8, background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--info)' } },
        'Owner and Admin roles always have full access to all pages.'
      )
    ),

    // Reset password modal
    resetTarget && h(Modal, {
      title: 'Reset Password',
      onClose: function() { setResetTarget(null); setNewPassword(''); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setResetTarget(null); setNewPassword(''); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: resetPassword, disabled: resetting || newPassword.length < 8 }, resetting ? 'Resetting...' : 'Reset Password')
      )
    },
      h('div', { style: { marginBottom: 16 } },
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Set a new password for ', h('strong', null, resetTarget.name || resetTarget.email), '.'),
        resetTarget.totpEnabled && h('div', { style: { marginTop: 8, padding: 8, background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)' } }, 'This user has 2FA enabled. Password reset will not affect their 2FA setup.')
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'New Password (min 8 characters)'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('input', { className: 'input', type: 'text', value: newPassword, onChange: function(e) { setNewPassword(e.target.value); }, placeholder: 'Enter new password', autoFocus: true, style: { flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 } }),
          h('button', { type: 'button', className: 'btn btn-secondary btn-sm', onClick: generatePassword, title: 'Generate random password' }, I.refresh(), ' Generate')
        )
      ),
      newPassword && h('div', { style: { marginTop: 8, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)' } },
        'Make sure to share this password securely with the user.'
      )
    ),

    // Permission editor modal
    permTarget && pageRegistry && h(PermissionEditor, {
      userId: permTarget.id,
      userName: permTarget.name || permTarget.email,
      currentPerms: permGrants,
      pageRegistry: pageRegistry,
      onSave: savePermissions,
      onClose: function() { setPermTarget(null); }
    }),

    // Users table
    h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        users.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No users')
        : h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Role'), h('th', null, 'Access'), h('th', null, '2FA'), h('th', null, 'Created'), h('th', { style: { width: 180 } }, 'Actions'))),
            h('tbody', null, users.map(function(u) {
              var isRestricted = u.role === 'member' || u.role === 'viewer';
              return h('tr', { key: u.id },
                h('td', null, h('strong', null, u.name || '-')),
                h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, u.email)),
                h('td', null, h('span', { className: 'badge badge-' + (u.role === 'owner' ? 'warning' : u.role === 'admin' ? 'primary' : 'neutral') }, u.role)),
                h('td', null, permBadge(u)),
                h('td', null, u.totpEnabled ? h('span', { className: 'badge badge-success' }, 'On') : h('span', { className: 'badge badge-neutral' }, 'Off')),
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'),
                h('td', null,
                  h('div', { style: { display: 'flex', gap: 4 } },
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      title: isRestricted ? 'Edit Permissions' : 'Permissions (Owner/Admin have full access)',
                      onClick: function() { openPermissions(u); },
                      style: !isRestricted ? { opacity: 0.4 } : {}
                    }, I.shield()),
                    h('button', { className: 'btn btn-ghost btn-sm', title: 'Reset Password', onClick: function() { setResetTarget(u); setNewPassword(''); } }, I.lock()),
                    h('button', { className: 'btn btn-ghost btn-sm', title: 'Delete User', onClick: function() { deleteUser(u); }, style: { color: 'var(--danger)' } }, I.trash())
                  )
                )
              );
            }))
          )
      )
    )
  );
}
