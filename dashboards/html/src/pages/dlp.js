// DLP page — rules, violations, scanning

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

export function loadDlp() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">Data Loss Prevention</h2><p class="page-desc" style="margin:0">Protect sensitive data with pattern-based scanning rules</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-dlp-rule">+ New Rule</button></div><div class="card"><h3>Scan Content</h3><div style="display:flex;gap:8px"><textarea id="dlp-scan-input" class="input" rows="2" placeholder="Paste content to test against DLP rules..." style="flex:1"></textarea><button class="btn btn-primary" style="width:auto;align-self:flex-end" id="btn-dlp-scan">Scan</button></div></div><div class="card"><h3>DLP Rules</h3><div class="page-desc">Loading...</div></div><div class="card"><h3>Recent Violations</h3><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-dlp-rule').onclick = function() {
    openModal('modal-dlp-rule');
  };

  document.getElementById('btn-dlp-scan').onclick = function() {
    scanContent();
  };

  var cards = el.querySelectorAll('.card');

  api('/engine/dlp/rules?orgId=default').then(function(d) {
    var rules = d.rules || [];
    if (rules.length === 0) {
      cards[1].innerHTML = '<h3>DLP Rules</h3><div class="empty"><div class="empty-icon">&#128274;</div>No DLP rules defined. Create your first one!</div>';
      return;
    }
    var rows = rules.map(function(r) {
      return '<tr><td style="font-weight:600">' + esc(r.name) + '</td><td><code>' + esc(r.pattern) + '</code></td><td>' + esc(r.action || 'block') + '</td><td><span class="badge badge-' + (r.status || 'enabled') + '">' + (r.status || 'enabled') + '</span></td><td><button class="btn btn-sm btn-danger" data-delete-dlp-rule="' + r.id + '">Delete</button></td></tr>';
    }).join('');
    cards[1].innerHTML = '<h3>DLP Rules (' + rules.length + ')</h3>' + renderTable(['Name', 'Pattern', 'Action', 'Status', ''], rows);

    el.querySelectorAll('[data-delete-dlp-rule]').forEach(function(btn) {
      btn.onclick = function() {
        deleteDlpRule(btn.getAttribute('data-delete-dlp-rule'));
      };
    });
  }).catch(function() {
    cards[1].innerHTML = '<h3>DLP Rules</h3><div class="empty"><div class="empty-icon">&#128274;</div>No DLP rules defined.</div>';
  });

  api('/engine/dlp/violations').then(function(d) {
    var violations = d.violations || [];
    if (violations.length === 0) {
      cards[2].innerHTML = '<h3>Recent Violations</h3><div class="empty"><div class="empty-icon">&#9989;</div>No DLP violations detected.</div>';
      return;
    }
    var rows = violations.map(function(v) {
      return '<tr><td style="font-weight:600">' + esc(v.rule_name || v.ruleName) + '</td><td><code>' + esc(v.matched || v.content) + '</code></td><td>' + esc(v.agent || v.sender) + '</td><td style="color:var(--text-muted);font-size:12px">' + new Date(v.created_at || v.createdAt).toLocaleDateString() + '</td></tr>';
    }).join('');
    cards[2].innerHTML = '<h3>Recent Violations (' + violations.length + ')</h3>' + renderTable(['Rule', 'Matched Content', 'Agent/Sender', 'Time'], rows);
  }).catch(function() {
    cards[2].innerHTML = '<h3>Recent Violations</h3><div class="empty"><div class="empty-icon">&#9989;</div>No violations detected.</div>';
  });
}

function deleteDlpRule(id) {
  if (!confirm('Delete this DLP rule?')) return;
  api('/engine/dlp/rules/' + id, { method: 'DELETE' })
    .then(function() { toast('DLP rule deleted', 'success'); loadDlp(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function scanContent() {
  var content = document.getElementById('dlp-scan-input').value;
  if (!content.trim()) return toast('Enter content to scan', 'error');
  api('/engine/dlp/scan', { method: 'POST', body: { content: content } })
    .then(function(d) {
      var matches = d.matches || d.violations || [];
      if (matches.length > 0) {
        toast('Scan complete: ' + matches.length + ' violation(s) found', 'warning');
      } else {
        toast('Scan complete: no violations found', 'success');
      }
    })
    .catch(function(err) { toast(err.message, 'error'); });
}

export function initDlpModal() {
  var form = document.querySelector('#modal-dlp-rule form');
  if (form) {
    form.onsubmit = function(e) {
      createDlpRule(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-dlp-rule .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-dlp-rule');
    };
  }
}

function createDlpRule(e) {
  e.preventDefault();
  api('/engine/dlp/rules', {
    method: 'POST',
    body: {
      name: document.getElementById('dlp-rule-name').value,
      pattern: document.getElementById('dlp-rule-pattern').value,
      action: document.getElementById('dlp-rule-action').value,
      description: document.getElementById('dlp-rule-description').value || undefined,
    },
  })
    .then(function() {
      toast('DLP rule created!', 'success');
      closeModal('modal-dlp-rule');
      loadDlp();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
