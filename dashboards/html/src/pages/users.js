// Users page — list, create modal

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

export function loadUsers() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">Users</h2><p class="page-desc" style="margin:0">Manage team members</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-user">+ New User</button></div><div class="card"><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-user').onclick = function() {
    openModal('modal-user');
  };

  api('/users').then(function(d) {
    var users = d.users || [];
    if (users.length === 0) {
      el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">\ud83d\udc65</div>No users yet</div>';
      return;
    }
    var rows = users.map(function(u) {
      return '<tr><td style="font-weight:600">' + esc(u.name) + '</td><td style="color:var(--text-dim)">' + esc(u.email) + '</td><td><span class="badge badge-' + u.role + '">' + u.role + '</span></td><td style="color:var(--text-muted);font-size:12px">' + (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never') + '</td></tr>';
    }).join('');
    el.querySelector('.card').innerHTML = renderTable(['Name', 'Email', 'Role', 'Last Login'], rows);
  });
}

export function initUserModal() {
  var form = document.querySelector('#modal-user form');
  if (form) {
    form.onsubmit = function(e) {
      createUser(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-user .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-user');
    };
  }
}

function createUser(e) {
  e.preventDefault();
  api('/users', {
    method: 'POST',
    body: {
      name: document.getElementById('new-user-name').value,
      email: document.getElementById('new-user-email').value,
      role: document.getElementById('new-user-role').value,
      password: document.getElementById('new-user-password').value,
    },
  })
    .then(function() {
      toast('User created!', 'success');
      closeModal('modal-user');
      loadUsers();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
