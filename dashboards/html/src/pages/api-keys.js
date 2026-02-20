// API Keys page — list, create modal, revoke, key banner

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

export function loadApiKeys() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">API Keys</h2><p class="page-desc" style="margin:0">Manage programmatic access</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-apikey">+ New Key</button></div><div id="apikey-banner"></div><div class="card"><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-apikey').onclick = function() {
    openModal('modal-apikey');
  };

  api('/api-keys').then(function(d) {
    var keys = d.keys || [];
    if (keys.length === 0) {
      el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">\ud83d\udd11</div>No API keys</div>';
      return;
    }
    var rows = keys.map(function(k) {
      return '<tr><td style="font-weight:600">' + esc(k.name) + '</td><td><code style="font-size:12px">' + esc(k.keyPrefix) + '...</code></td><td style="font-size:12px">' + (k.scopes || []).join(', ') + '</td><td style="color:var(--text-muted);font-size:12px">' + (k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never') + '</td><td><span class="badge ' + (k.revoked ? 'badge-archived' : 'badge-active') + '">' + (k.revoked ? 'revoked' : 'active') + '</span></td><td>' + (!k.revoked ? '<button class="btn btn-sm btn-danger" data-revoke-key="' + k.id + '">Revoke</button>' : '') + '</td></tr>';
    }).join('');
    el.querySelector('.card').innerHTML = renderTable(['Name', 'Key', 'Scopes', 'Last Used', 'Status', ''], rows);

    // Bind revoke buttons
    el.querySelectorAll('[data-revoke-key]').forEach(function(btn) {
      btn.onclick = function() {
        revokeApiKey(btn.getAttribute('data-revoke-key'));
      };
    });
  });
}

function revokeApiKey(id) {
  api('/api-keys/' + id, { method: 'DELETE' })
    .then(function() { toast('Key revoked', 'success'); loadApiKeys(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

export function initApiKeyModal() {
  var form = document.querySelector('#modal-apikey form');
  if (form) {
    form.onsubmit = function(e) {
      createApiKey(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-apikey .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-apikey');
    };
  }
}

function createApiKey(e) {
  e.preventDefault();
  api('/api-keys', {
    method: 'POST',
    body: { name: document.getElementById('apikey-name').value },
  })
    .then(function(d) {
      closeModal('modal-apikey');
      var banner = document.getElementById('apikey-banner');
      if (banner) {
        banner.innerHTML = '<div class="card" style="border-color:var(--warning);background:var(--warning-bg)"><div style="font-weight:600;color:var(--warning);margin-bottom:8px">\u26a0\ufe0f Copy this key now \u2014 it won\'t be shown again</div><code style="display:block;background:var(--bg);padding:10px 14px;border-radius:var(--radius);font-size:13px;word-break:break-all;cursor:pointer" id="copy-new-key">' + d.plaintext + '</code><button class="btn btn-sm" style="margin-top:8px" id="dismiss-key-banner">Dismiss</button></div>';
        document.getElementById('copy-new-key').onclick = function() {
          navigator.clipboard.writeText(d.plaintext);
          toast('Copied!', 'success');
        };
        document.getElementById('dismiss-key-banner').onclick = function() {
          this.parentElement.remove();
        };
      }
      loadApiKeys();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
