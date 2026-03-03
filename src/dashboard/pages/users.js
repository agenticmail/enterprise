import { h, useState, useEffect, Fragment, useApp, apiCall, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

// ─── Permission Editor Component ───────────────────

function PermissionEditor({ userId, userName, currentPerms, pageRegistry, onSave, onClose, userObj }) {
  // Deep clone perms (skip _allowedAgents from page grants)
  var [grants, setGrants] = useState(function() {
    if (currentPerms === '*') {
      var all = {};
      Object.keys(pageRegistry).forEach(function(pid) { all[pid] = true; });
      return all;
    }
    var c = {};
    Object.keys(currentPerms || {}).forEach(function(pid) {
      if (pid === '_allowedAgents') return; // skip agent field
      var g = currentPerms[pid];
      c[pid] = g === true ? true : (Array.isArray(g) ? g.slice() : true);
    });
    return c;
  });
  var [fullAccess, setFullAccess] = useState(currentPerms === '*');

  // Agent access control
  var [agents, setAgents] = useState([]);
  var [allowedAgents, setAllowedAgents] = useState(function() {
    if (currentPerms === '*') return '*';
    return (currentPerms || {})._allowedAgents || '*';
  });
  var [allAgentsAccess, setAllAgentsAccess] = useState(function() {
    if (currentPerms === '*') return true;
    return (currentPerms || {})._allowedAgents === '*' || !(currentPerms || {})._allowedAgents;
  });

  // Client org assignment
  var [permOrgs, setPermOrgs] = useState([]);
  var [userOrgId, setUserOrgId] = useState((userObj && userObj.clientOrgId) || '');

  useEffect(function() {
    apiCall('/agents').then(function(d) { setAgents(d.agents || d || []); }).catch(function() {});
    apiCall('/organizations').then(function(d) { setPermOrgs(d.organizations || []); }).catch(function() {});
  }, []);
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
      setAllAgentsAccess(true);
      setAllowedAgents('*');
    } else {
      setGrants({});
      setAllAgentsAccess(true);
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
      var permsToSave;
      if (fullAccess) {
        permsToSave = '*';
      } else {
        permsToSave = Object.assign({}, grants);
        if (!allAgentsAccess && Array.isArray(allowedAgents)) {
          permsToSave._allowedAgents = allowedAgents;
        } else {
          permsToSave._allowedAgents = '*';
        }
      }
      await onSave(permsToSave);
      // Save org assignment
      await apiCall('/users/' + userId, { method: 'PATCH', body: JSON.stringify({ clientOrgId: userOrgId || null }) }).catch(function() {});
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

    // ─── Organization Assignment ──────────────────────
    permOrgs.length > 0 && h('div', { style: { marginTop: 16, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 8 } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
        h('div', null,
          h('strong', { style: { fontSize: 13 } }, 'Client Organization'),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 } }, 'Bind this user to a client org — they will only see that org\'s agents and data')
        )
      ),
      h('select', {
        className: 'input',
        value: userOrgId,
        onChange: function(e) { setUserOrgId(e.target.value); },
        style: { fontSize: 13 }
      },
        h('option', { value: '' }, 'None (Internal User)'),
        permOrgs.filter(function(o) { return o.is_active !== false; }).map(function(o) {
          return h('option', { key: o.id, value: o.id }, o.name);
        })
      ),
      userOrgId && h('div', { style: { fontSize: 11, color: 'var(--warning, #f59e0b)', marginTop: 6 } },
        'This user will only see agents and data belonging to this organization. The org switcher will be locked for them.'
      )
    ),

    // ─── Agent Access ──────────────────────────
    !fullAccess && h('div', { style: { marginTop: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
        h('div', null,
          h('strong', { style: { fontSize: 13 } }, 'Agent Access'),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 } }, 'Which agents this user can see and manage')
        ),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: allAgentsAccess, onChange: function() {
            var newVal = !allAgentsAccess;
            setAllAgentsAccess(newVal);
            if (newVal) setAllowedAgents('*');
            else setAllowedAgents([]);
          }, style: _checkbox }),
          'All Agents'
        )
      ),
      !allAgentsAccess && h('div', { style: { maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 } },
        agents.length === 0
          ? h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 } }, 'No agents found')
          : agents.map(function(a) {
              var checked = Array.isArray(allowedAgents) && allowedAgents.indexOf(a.id) >= 0;
              return h('div', {
                key: a.id,
                style: Object.assign({}, _cs, checked ? { background: 'var(--bg-tertiary)' } : {}),
                onClick: function() {
                  setAllowedAgents(function(prev) {
                    var arr = Array.isArray(prev) ? prev.slice() : [];
                    var idx = arr.indexOf(a.id);
                    if (idx >= 0) arr.splice(idx, 1);
                    else arr.push(a.id);
                    return arr;
                  });
                }
              },
                h('input', { type: 'checkbox', checked: checked, readOnly: true, style: _checkbox }),
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontWeight: 500, fontSize: 13 } }, a.displayName || a.name || a.id),
                  a.role && h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, a.role)
                ),
                a.status && h('span', { className: 'badge badge-' + (a.status === 'active' || a.status === 'running' ? 'success' : 'neutral'), style: { fontSize: 9 } }, a.status)
              );
            })
      ),
      !allAgentsAccess && Array.isArray(allowedAgents) && h('div', { style: { marginTop: 4, fontSize: 11, color: 'var(--text-muted)' } },
        allowedAgents.length === 0 ? 'No agents selected — user will see no agents' : allowedAgents.length + ' agent' + (allowedAgents.length !== 1 ? 's' : '') + ' selected'
      )
    ),

    // Summary
    h('div', { style: { marginTop: 12, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' } },
      fullAccess
        ? 'This user has full access to all pages, tabs, and agents.'
        : 'Access to ' + Object.keys(grants).length + ' of ' + Object.keys(pageRegistry).length + ' pages' +
          (allAgentsAccess ? ', all agents.' : ', ' + (Array.isArray(allowedAgents) ? allowedAgents.length : 0) + ' agents.')
    )
  );
}

// ─── Inline Permission Picker (for create modal) ──

function InlinePermissionPicker({ permissions, pageRegistry, onChange }) {
  var [expandedPage, setExpandedPage] = useState(null);
  var [agents, setAgents] = useState([]);
  useEffect(function() { apiCall('/agents').then(function(d) { setAgents(d.agents || d || []); }).catch(function() {}); }, []);

  // Resolve grants from permissions (skip _allowedAgents)
  var rawGrants = permissions === '*' ? (function() { var a = {}; Object.keys(pageRegistry).forEach(function(p) { a[p] = true; }); return a; })() : (permissions || {});
  var grants = {};
  Object.keys(rawGrants).forEach(function(k) { if (k !== '_allowedAgents') grants[k] = rawGrants[k]; });
  var currentAllowed = permissions === '*' ? '*' : (rawGrants._allowedAgents || '*');
  var allAgentsMode = currentAllowed === '*';

  var emitChange = function(nextGrants, nextAllowed) {
    var result = Object.assign({}, nextGrants);
    if (nextAllowed !== undefined) result._allowedAgents = nextAllowed;
    else if (currentAllowed !== '*') result._allowedAgents = currentAllowed;
    var allPages = Object.keys(nextGrants).length === Object.keys(pageRegistry).length && Object.values(nextGrants).every(function(v) { return v === true; });
    var allAg = (result._allowedAgents || '*') === '*';
    if (allPages && allAg) return onChange('*');
    onChange(result);
  };

  var togglePage = function(pid) {
    var next = Object.assign({}, grants);
    if (next[pid]) { delete next[pid]; if (expandedPage === pid) setExpandedPage(null); }
    else { next[pid] = true; }
    emitChange(next);
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
    emitChange(next);
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
    }),
    // Agent access section
    agents.length > 0 && h('div', { style: { marginTop: 8 } },
      h('div', { style: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '4px 10px 2px' } }, 'Agent Access'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }, onClick: function() {
        emitChange(grants, allAgentsMode ? [] : '*');
      } },
        h('input', { type: 'checkbox', checked: allAgentsMode, readOnly: true, style: { width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' } }),
        h('span', { style: { fontWeight: 500 } }, 'All Agents')
      ),
      !allAgentsMode && agents.map(function(a) {
        var checked = Array.isArray(currentAllowed) && currentAllowed.indexOf(a.id) >= 0;
        return h('div', { key: a.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px 3px 28px', fontSize: 11, cursor: 'pointer' }, onClick: function() {
          var arr = Array.isArray(currentAllowed) ? currentAllowed.slice() : [];
          var idx = arr.indexOf(a.id);
          if (idx >= 0) arr.splice(idx, 1); else arr.push(a.id);
          emitChange(grants, arr);
        } },
          h('input', { type: 'checkbox', checked: checked, readOnly: true, style: { width: 13, height: 13, accentColor: 'var(--primary)', cursor: 'pointer' } }),
          h('span', null, a.displayName || a.name || a.id),
          a.role && h('span', { style: { color: 'var(--text-muted)', marginLeft: 4 } }, '(' + a.role + ')')
        );
      })
    )
  );
}

// ─── Users Page ────────────────────────────────────

export function UsersPage() {
  var app = useApp();
  var toast = app.toast;
  var [users, setUsers] = useState([]);
  var [creating, setCreating] = useState(false);
  var [form, setForm] = useState({ email: '', password: '', name: '', role: 'viewer', permissions: '*', clientOrgId: '' });
  var [resetTarget, setResetTarget] = useState(null);
  var [clientOrgs, setClientOrgs] = useState([]);
  var [newPassword, setNewPassword] = useState('');
  var [resetting, setResetting] = useState(false);
  var [permTarget, setPermTarget] = useState(null);    // user object for permission editing
  var [permGrants, setPermGrants] = useState('*');      // current permissions for target
  var [pageRegistry, setPageRegistry] = useState(null); // page/tab registry from backend

  var load = function() { apiCall('/users').then(function(d) { setUsers(d.users || d || []); }).catch(function() {}); };
  useEffect(function() {
    load();
    apiCall('/page-registry').then(function(d) { setPageRegistry(d); }).catch(function() {});
    apiCall('/organizations').then(function(d) { setClientOrgs(d.organizations || []); }).catch(function() {});
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
      if (form.clientOrgId) body.clientOrgId = form.clientOrgId;
      await apiCall('/users', { method: 'POST', body: JSON.stringify(body) });
      toast('User created. They will be prompted to set a new password on first login.', 'success');
      setCreating(false); setForm({ email: '', password: '', name: '', role: 'viewer', permissions: '*', clientOrgId: '' }); setShowCreatePerms(false); load();
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

  var openEditUser = function(u) {
    setEditUser(u);
    setEditForm({ name: u.name || '', role: u.role || 'viewer', clientOrgId: u.clientOrgId || '' });
  };

  var doEditUser = async function() {
    if (!editUser) return;
    try {
      await apiCall('/users/' + editUser.id, { method: 'PATCH', body: JSON.stringify({ name: editForm.name, role: editForm.role, clientOrgId: editForm.clientOrgId || null }) });
      toast('User updated', 'success');
      setEditUser(null);
      load();
    } catch (e) { toast(e.message || 'Update failed', 'error'); }
  };

  var toggleActive = async function(user) {
    var action = user.isActive === false ? 'reactivate' : 'deactivate';
    var ok = await showConfirm({
      title: action === 'deactivate' ? 'Deactivate User' : 'Reactivate User',
      message: action === 'deactivate'
        ? 'Deactivate "' + (user.name || user.email) + '"? They will be unable to log in and will see a message to contact their organization.'
        : 'Reactivate "' + (user.name || user.email) + '"? They will be able to log in again.',
      danger: action === 'deactivate',
      confirmText: action === 'deactivate' ? 'Deactivate' : 'Reactivate'
    });
    if (!ok) return;
    try {
      await apiCall('/users/' + user.id + '/' + action, { method: 'POST' });
      toast('User ' + action + 'd', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  var [deleteStep, setDeleteStep] = useState(0);
  var [deleteTarget, setDeleteTarget] = useState(null);
  var [deleteTyped, setDeleteTyped] = useState('');
  var [editUser, setEditUser] = useState(null);
  var [editForm, setEditForm] = useState({ name: '', role: '', clientOrgId: '' });

  var startDelete = function(user) { setDeleteTarget(user); setDeleteStep(1); setDeleteTyped(''); };
  var cancelDelete = function() { setDeleteTarget(null); setDeleteStep(0); setDeleteTyped(''); };

  var confirmDelete = async function() {
    try {
      await apiCall('/users/' + deleteTarget.id, { method: 'DELETE', body: JSON.stringify({ confirmationToken: 'DELETE_USER_' + deleteTarget.email }) });
      toast('User permanently deleted', 'success');
      cancelDelete(); load();
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
      // Client organization assignment
      clientOrgs.length > 0 && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Client Organization'),
        h('select', { className: 'input', value: form.clientOrgId, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { clientOrgId: e.target.value }); }); } },
          h('option', { value: '' }, 'None (internal user)'),
          clientOrgs.filter(function(o) { return o.is_active !== false; }).map(function(o) {
            return h('option', { key: o.id, value: o.id }, o.name);
          })
        ),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Assigning to a client org restricts this user to only see that organization\'s agents and data.')
      ),
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
    // Edit User modal
    editUser && h(Modal, {
      title: 'Edit User — ' + (editUser.name || editUser.email),
      onClose: function() { setEditUser(null); },
      width: 420,
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setEditUser(null); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: doEditUser }, 'Save Changes')
      )
    },
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Name'),
        h('input', { className: 'input', value: editForm.name, onChange: function(e) { setEditForm(function(f) { return Object.assign({}, f, { name: e.target.value }); }); } })
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Role'),
        h('select', { className: 'input', value: editForm.role, onChange: function(e) { setEditForm(function(f) { return Object.assign({}, f, { role: e.target.value }); }); } },
          h('option', { value: 'viewer' }, 'Viewer'),
          h('option', { value: 'member' }, 'Member'),
          h('option', { value: 'admin' }, 'Admin'),
          h('option', { value: 'owner' }, 'Owner')
        ),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
          editForm.role === 'owner' ? 'Full access to everything. Cannot be restricted.' :
          editForm.role === 'admin' ? 'Full access by default. Can be restricted via permissions.' :
          editForm.role === 'member' ? 'Access controlled by permissions. Can view and act on assigned pages.' :
          'Read-only access. Can view but not modify.'
        )
      ),
      clientOrgs.length > 0 && h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Client Organization'),
        h('select', { className: 'input', value: editForm.clientOrgId, onChange: function(e) { setEditForm(function(f) { return Object.assign({}, f, { clientOrgId: e.target.value }); }); } },
          h('option', { value: '' }, 'None (Internal User)'),
          clientOrgs.filter(function(o) { return o.is_active !== false; }).map(function(o) {
            return h('option', { key: o.id, value: o.id }, o.name);
          })
        ),
        editForm.clientOrgId && h('div', { style: { fontSize: 11, color: 'var(--warning, #f59e0b)', marginTop: 4 } },
          'This user will only see agents and data from this organization.'
        )
      ),
      h('div', { style: { fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 8 } },
        'Email: ', h('code', null, editUser.email), ' (cannot be changed)'
      )
    ),

    permTarget && pageRegistry && h(PermissionEditor, {
      userId: permTarget.id,
      userName: permTarget.name || permTarget.email,
      currentPerms: permGrants,
      pageRegistry: pageRegistry,
      onSave: savePermissions,
      onClose: function() { setPermTarget(null); },
      userObj: permTarget
    }),

    // 5-step delete confirmation modal
    deleteTarget && h(Modal, {
      title: 'Delete User — Step ' + deleteStep + ' of 5',
      onClose: cancelDelete,
      width: 480,
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: deleteStep === 1 ? cancelDelete : function() { setDeleteStep(deleteStep - 1); } }, deleteStep === 1 ? 'Cancel' : 'Back'),
        deleteStep < 5
          ? h('button', { className: 'btn btn-' + (deleteStep >= 3 ? 'danger' : 'primary'), onClick: function() { setDeleteStep(deleteStep + 1); } }, 'Continue')
          : h('button', { className: 'btn btn-danger', onClick: confirmDelete, disabled: deleteTyped !== deleteTarget.email }, 'Permanently Delete')
      )
    },
      // Step 1: Warning
      deleteStep === 1 && h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--danger-soft, rgba(220,38,38,0.08))', borderRadius: 8, marginBottom: 16 } },
          h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--danger)', strokeWidth: 2 }, h('path', { d: 'M12 9v4m0 4h.01M10.29 3.86l-8.6 14.86A2 2 0 0 0 3.4 21h17.2a2 2 0 0 0 1.71-2.98L13.71 3.86a2 2 0 0 0-3.42 0z' })),
          h('div', null,
            h('strong', null, 'Permanent Deletion'),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, 'This action cannot be undone.')
          )
        ),
        h('p', { style: { fontSize: 13 } }, 'You are about to permanently delete the user account for:'),
        h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, marginTop: 8 } },
          h('strong', null, deleteTarget.name || 'Unnamed'), h('br'),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' } }, deleteTarget.email)
        ),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 12 } }, 'Consider deactivating instead — deactivated users can be reactivated later.')
      ),
      // Step 2: Data loss
      deleteStep === 2 && h('div', null,
        h('h4', { style: { marginBottom: 12 } }, 'Data That Will Be Lost'),
        h('ul', { style: { paddingLeft: 20, fontSize: 13, lineHeight: 1.8 } },
          h('li', null, 'All login sessions will be terminated immediately'),
          h('li', null, 'Audit log entries will be orphaned (no user reference)'),
          h('li', null, 'Any API keys created by this user will be revoked'),
          h('li', null, 'Permission grants and role assignments will be removed'),
          h('li', null, '2FA configuration and backup codes will be destroyed')
        )
      ),
      // Step 3: Impact
      deleteStep === 3 && h('div', null,
        h('h4', { style: { marginBottom: 12 } }, 'Impact Assessment'),
        h('div', { style: { padding: 12, background: 'var(--warning-soft, rgba(245,158,11,0.08))', borderRadius: 8, fontSize: 13, lineHeight: 1.6 } },
          h('p', null, 'If this user manages or supervises any agents, those agents will lose their manager assignment.'),
          h('p', { style: { marginTop: 8 } }, 'If this user created approval workflows, pending approvals may become orphaned.'),
          h('p', { style: { marginTop: 8 } }, 'Any scheduled tasks or cron jobs created by this user will continue to run but cannot be modified.')
        )
      ),
      // Step 4: Alternative
      deleteStep === 4 && h('div', null,
        h('h4', { style: { marginBottom: 12 } }, 'Are You Sure?'),
        h('div', { style: { padding: 16, background: 'var(--success-soft, rgba(21,128,61,0.08))', borderRadius: 8, marginBottom: 16 } },
          h('strong', null, 'Recommended alternative: Deactivate'),
          h('p', { style: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 } }, 'Deactivating blocks login while preserving all data. The user can be reactivated at any time. This is the safe option.')
        ),
        h('div', { style: { padding: 16, background: 'var(--danger-soft, rgba(220,38,38,0.08))', borderRadius: 8 } },
          h('strong', null, 'Permanent deletion'),
          h('p', { style: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 } }, 'Removes the user and all associated data forever. There is no recovery.')
        )
      ),
      // Step 5: Type email to confirm
      deleteStep === 5 && h('div', null,
        h('h4', { style: { marginBottom: 12, color: 'var(--danger)' } }, 'Final Confirmation'),
        h('p', { style: { fontSize: 13, marginBottom: 12 } }, 'Type the user\'s email address to confirm permanent deletion:'),
        h('div', { style: { padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center', marginBottom: 12 } }, deleteTarget.email),
        h('input', {
          className: 'input', type: 'text', value: deleteTyped,
          onChange: function(e) { setDeleteTyped(e.target.value); },
          placeholder: 'Type email to confirm',
          autoFocus: true,
          style: { fontFamily: 'var(--font-mono)', fontSize: 13, borderColor: deleteTyped === deleteTarget.email ? 'var(--danger)' : 'var(--border)' }
        }),
        deleteTyped && deleteTyped !== deleteTarget.email && h('div', { style: { fontSize: 11, color: 'var(--danger)', marginTop: 4 } }, 'Email does not match')
      )
    ),

    // Users table
    h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        users.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No users')
        : h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Role'), h('th', null, 'Organization'), h('th', null, 'Status'), h('th', null, 'Access'), h('th', null, '2FA'), h('th', null, 'Created'), h('th', { style: { width: 240 } }, 'Actions'))),
            h('tbody', null, users.map(function(u) {
              var isRestricted = u.role === 'member' || u.role === 'viewer';
              var isDeactivated = u.isActive === false;
              var isSelf = u.id === ((app || {}).user || {}).id;
              return h('tr', { key: u.id, style: isDeactivated ? { opacity: 0.6 } : {} },
                h('td', null, h('strong', null, u.name || '-')),
                h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, u.email)),
                h('td', null, h('span', { className: 'badge badge-' + (u.role === 'owner' ? 'warning' : u.role === 'admin' ? 'primary' : 'neutral') }, u.role)),
                h('td', null, (function() {
                  var org = u.clientOrgId && clientOrgs.find(function(o) { return o.id === u.clientOrgId; });
                  return org ? h('span', { className: 'badge badge-info', style: { fontSize: 10 } }, org.name) : h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, 'Internal');
                })()),
                h('td', null, isDeactivated
                  ? h('span', { className: 'badge badge-danger', style: { fontSize: 10 } }, 'Deactivated')
                  : h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, 'Active')
                ),
                h('td', null, permBadge(u)),
                h('td', null, u.totpEnabled ? h('span', { className: 'badge badge-success' }, 'On') : h('span', { className: 'badge badge-neutral' }, 'Off')),
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'),
                h('td', null,
                  h('div', { style: { display: 'flex', gap: 4 } },
                    h('button', { className: 'btn btn-ghost btn-sm', title: 'Edit User', onClick: function() { openEditUser(u); } }, I.edit()),
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      title: isRestricted ? 'Edit Permissions' : 'Permissions (Owner/Admin have full access)',
                      onClick: function() { openPermissions(u); },
                      style: !isRestricted ? { opacity: 0.4 } : {}
                    }, I.shield()),
                    h('button', { className: 'btn btn-ghost btn-sm', title: 'Reset Password', onClick: function() { setResetTarget(u); setNewPassword(''); } }, I.lock()),
                    // Impersonate (owner-only, not self)
                    !isSelf && app.user && app.user.role === 'owner' && !isDeactivated && h('button', {
                      className: 'btn btn-ghost btn-sm',
                      title: 'View as ' + (u.name || u.email),
                      onClick: function() { if (app.startImpersonation) app.startImpersonation(u.id); },
                      style: { color: 'var(--primary)' }
                    }, I.agents()),
                    // Deactivate / Reactivate
                    !isSelf && h('button', {
                      className: 'btn btn-ghost btn-sm',
                      title: isDeactivated ? 'Reactivate User' : 'Deactivate User',
                      onClick: function() { toggleActive(u); },
                      style: { color: isDeactivated ? 'var(--success, #15803d)' : 'var(--warning, #f59e0b)' }
                    }, isDeactivated ? I.check() : I.pause()),
                    // Delete (owner only)
                    !isSelf && h('button', { className: 'btn btn-ghost btn-sm', title: 'Delete User Permanently', onClick: function() { startDelete(u); }, style: { color: 'var(--danger)' } }, I.trash())
                  )
                )
              );
            }))
          )
      )
    )
  );
}
