import { h, useState, useEffect, Fragment, useApp, apiCall, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';

export function UsersPage() {
  var { toast } = useApp();
  var [users, setUsers] = useState([]);
  var [creating, setCreating] = useState(false);
  var [form, setForm] = useState({ email: '', password: '', name: '', role: 'viewer' });
  var [resetTarget, setResetTarget] = useState(null); // user object
  var [newPassword, setNewPassword] = useState('');
  var [resetting, setResetting] = useState(false);

  var load = function() { apiCall('/users').then(function(d) { setUsers(d.users || d || []); }).catch(function() {}); };
  useEffect(function() { load(); }, []);

  var create = async function() {
    try {
      await apiCall('/users', { method: 'POST', body: JSON.stringify(form) });
      toast('User created', 'success'); setCreating(false); setForm({ email: '', password: '', name: '', role: 'viewer' }); load();
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

  var generatePassword = function() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    var pw = '';
    for (var i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setNewPassword(pw);
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null, h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Users', h(HelpButton, { label: 'Users' },
        h('p', null, 'Manage dashboard users who can access and administer the AgenticMail Enterprise console. Each user has a role that controls what they can see and do.'),
        h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Roles'),
        h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
          h('li', null, h('strong', null, 'Owner'), ' — Full access including billing, user management, and destructive actions.'),
          h('li', null, h('strong', null, 'Admin'), ' — Can manage agents, policies, and most settings. Cannot manage billing.'),
          h('li', null, h('strong', null, 'Member'), ' — Can view dashboards and interact with agents. Limited config access.'),
          h('li', null, h('strong', null, 'Viewer'), ' — Read-only access to dashboards and reports.')
        ),
        h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, '2FA (Two-Factor Authentication)'),
        h('p', null, 'Users can enable TOTP-based 2FA for extra security. The 2FA column shows whether it\'s active.'),
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Use the lock icon to reset a user\'s password. The "Generate" button creates a secure random password.')
      )), h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Manage team members and their access')),
      h('button', { className: 'btn btn-primary', onClick: function() { setCreating(true); } }, I.plus(), ' Add User')
    ),

    // Create user modal
    creating && h(Modal, { title: 'Add User', onClose: function() { setCreating(false); }, footer: h(Fragment, null, h('button', { className: 'btn btn-secondary', onClick: function() { setCreating(false); } }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: create, disabled: !form.email || !form.password }, 'Create')) },
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { name: e.target.value }); }); } })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Email *'), h('input', { className: 'input', type: 'email', value: form.email, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { email: e.target.value }); }); } })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Password *'), h('input', { className: 'input', type: 'password', value: form.password, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { password: e.target.value }); }); } })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Role'), h('select', { className: 'input', value: form.role, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { role: e.target.value }); }); } }, h('option', { value: 'viewer' }, 'Viewer'), h('option', { value: 'member' }, 'Member'), h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'owner' }, 'Owner')))
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
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Set a new password for ', h('strong', null, resetTarget.name || resetTarget.email), '. The user will need to use this password on their next login.'),
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
        'Make sure to share this password securely with the user. It will not be shown again.'
      )
    ),

    // Users table
    h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        users.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No users')
        : h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Role'), h('th', null, '2FA'), h('th', null, 'Created'), h('th', { style: { width: 160 } }, 'Actions'))),
            h('tbody', null, users.map(function(u) {
              return h('tr', { key: u.id },
                h('td', null, h('strong', null, u.name || '-')),
                h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, u.email)),
                h('td', null, h('span', { className: 'badge badge-' + (u.role === 'owner' ? 'warning' : u.role === 'admin' ? 'primary' : 'neutral') }, u.role)),
                h('td', null, u.totpEnabled ? h('span', { className: 'badge badge-success' }, 'On') : h('span', { className: 'badge badge-neutral' }, 'Off')),
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'),
                h('td', null,
                  h('div', { style: { display: 'flex', gap: 4 } },
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
