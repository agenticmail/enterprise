// Vault page — encrypted secrets management

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { renderTable } from '../components/table.js';

var CATEGORIES = ['deploy', 'cloud_storage', 'api_key', 'skill_credential', 'custom'];

function categoryBadge(category) {
  var colors = {
    deploy: 'primary',
    cloud_storage: 'info',
    api_key: 'warning',
    skill_credential: 'success',
    custom: 'default',
  };
  return '<span class="badge badge-' + (colors[category] || 'default') + '">' + esc(category || 'custom') + '</span>';
}

export function loadVault() {
  var el = document.getElementById('page-content');

  var categoryOptions = CATEGORIES.map(function(c) {
    return '<option value="' + esc(c) + '">' + esc(c.replace(/_/g, ' ')) + '</option>';
  }).join('');

  el.innerHTML = '<div><h2 class="page-title">Vault</h2><p class="page-desc">Encrypted secrets management</p></div>' +
    '<div class="card"><h3>Add Secret</h3>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
    '<div class="form-group" style="flex:1;min-width:160px"><label class="form-label">Secret Name</label><input class="input" id="vault-name" placeholder="e.g. OPENAI_API_KEY" required></div>' +
    '<div class="form-group" style="flex:1;min-width:160px"><label class="form-label">Secret Value</label><input class="input" type="password" id="vault-value" placeholder="Enter secret value" required></div>' +
    '<div class="form-group" style="min-width:140px"><label class="form-label">Category</label><select class="input" id="vault-category">' + categoryOptions + '</select></div>' +
    '<div class="form-group"><button class="btn btn-primary" style="width:auto" id="btn-add-secret">Add Secret</button></div>' +
    '</div></div>' +
    '<div class="card"><h3>Stored Secrets</h3><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-add-secret').onclick = function() {
    addSecret();
  };

  var cards = el.querySelectorAll('.card');

  api('/engine/vault/secrets?orgId=default').then(function(d) {
    var secrets = d.secrets || [];
    if (secrets.length === 0) {
      cards[1].innerHTML = '<h3>Stored Secrets</h3><div class="empty"><div class="empty-icon">&#128274;</div>No secrets stored yet. Add one above.</div>';
      return;
    }
    var rows = secrets.map(function(s) {
      return '<tr>' +
        '<td style="font-weight:600">' + esc(s.name || '-') + '</td>' +
        '<td>' + categoryBadge(s.category) + '</td>' +
        '<td style="color:var(--text-muted);font-size:12px">' + esc(s.createdBy || s.created_by || '-') + '</td>' +
        '<td style="color:var(--text-muted);font-size:12px">' + (s.created_at || s.createdAt ? new Date(s.created_at || s.createdAt).toLocaleDateString() : '-') + '</td>' +
        '<td>' +
        '<button class="btn btn-sm" data-rotate-secret="' + s.id + '">Rotate</button> ' +
        '<button class="btn btn-sm btn-danger" data-delete-secret="' + s.id + '">Delete</button>' +
        '</td></tr>';
    }).join('');
    cards[1].innerHTML = '<h3>Stored Secrets (' + secrets.length + ')</h3>' + renderTable(['Name', 'Category', 'Created By', 'Created', 'Actions'], rows);

    el.querySelectorAll('[data-delete-secret]').forEach(function(btn) {
      btn.onclick = function() {
        deleteSecret(btn.getAttribute('data-delete-secret'));
      };
    });

    el.querySelectorAll('[data-rotate-secret]').forEach(function(btn) {
      btn.onclick = function() {
        rotateSecret(btn.getAttribute('data-rotate-secret'));
      };
    });
  }).catch(function() {
    cards[1].innerHTML = '<h3>Stored Secrets</h3><div class="empty"><div class="empty-icon">&#128274;</div>No secrets stored yet.</div>';
  });
}

function addSecret() {
  var name = document.getElementById('vault-name').value.trim();
  var value = document.getElementById('vault-value').value;
  var category = document.getElementById('vault-category').value;
  if (!name || !value) return toast('Name and value are required', 'error');

  api('/engine/vault/secrets', {
    method: 'POST',
    body: { name: name, value: value, category: category, orgId: 'default' },
  })
    .then(function() { toast('Secret added', 'success'); loadVault(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function deleteSecret(id) {
  if (!confirm('Delete this secret?')) return;
  api('/engine/vault/secrets/' + id, { method: 'DELETE' })
    .then(function() { toast('Secret deleted', 'success'); loadVault(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function rotateSecret(id) {
  if (!confirm('Rotate encryption for this secret?')) return;
  api('/engine/vault/secrets/' + id + '/rotate', { method: 'POST', body: {} })
    .then(function() { toast('Secret encryption rotated', 'success'); loadVault(); })
    .catch(function(err) { toast(err.message, 'error'); });
}
