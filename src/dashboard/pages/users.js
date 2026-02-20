import { h, useState, useEffect, Fragment, useApp, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

export function UsersPage() {
  const { toast } = useApp();
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'viewer' });

  const load = () => apiCall('/users').then(d => setUsers(d.users || d || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await apiCall('/users', { method: 'POST', body: JSON.stringify(form) });
      toast('User created', 'success'); setCreating(false); setForm({ email: '', password: '', name: '', role: 'viewer' }); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null, h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Users'), h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Manage team members and their access')),
      h('button', { className: 'btn btn-primary', onClick: () => setCreating(true) }, I.plus(), ' Add User')
    ),
    creating && h(Modal, { title: 'Add User', onClose: () => setCreating(false), footer: h(Fragment, null, h('button', { className: 'btn btn-secondary', onClick: () => setCreating(false) }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: create, disabled: !form.email || !form.password }, 'Create')) },
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })) })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Email *'), h('input', { className: 'input', type: 'email', value: form.email, onChange: e => setForm(f => ({ ...f, email: e.target.value })) })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Password *'), h('input', { className: 'input', type: 'password', value: form.password, onChange: e => setForm(f => ({ ...f, password: e.target.value })) })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Role'), h('select', { className: 'input', value: form.role, onChange: e => setForm(f => ({ ...f, role: e.target.value })) }, h('option', { value: 'viewer' }, 'Viewer'), h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'owner' }, 'Owner')))
    ),
    h('div', { className: 'card' },
      h('div', { className: 'card-body-flush' },
        users.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No users')
        : h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Role'), h('th', null, 'Created'))),
            h('tbody', null, users.map(u =>
              h('tr', { key: u.id },
                h('td', null, h('strong', null, u.name || '-')),
                h('td', null, u.email),
                h('td', null, h('span', { className: 'badge badge-' + (u.role === 'owner' ? 'warning' : u.role === 'admin' ? 'primary' : 'neutral') }, u.role)),
                h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-')
              )
            ))
          )
      )
    )
  );
}
