// Guardrails page — interventions, anomaly rules, pause/resume/kill

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

export function loadGuardrails() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">Guardrails</h2><p class="page-desc" style="margin:0">Monitor and control AI agent behavior</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-anomaly-rule">+ New Anomaly Rule</button></div><div class="card"><h3>Active Interventions</h3><div class="page-desc">Loading...</div></div><div class="card"><h3>Anomaly Rules</h3><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-anomaly-rule').onclick = function() {
    openModal('modal-anomaly-rule');
  };

  var cards = el.querySelectorAll('.card');

  api('/engine/guardrails/interventions').then(function(d) {
    var interventions = d.interventions || [];
    if (interventions.length === 0) {
      cards[0].innerHTML = '<h3>Active Interventions</h3><div class="empty"><div class="empty-icon">&#128737;</div>No active interventions.</div>';
      return;
    }
    var rows = interventions.map(function(i) {
      var st = (i.status || '').toLowerCase();
      var actions = '';
      if (st === 'active' || st === 'running') {
        actions = '<button class="btn btn-sm btn-warning" data-pause-intervention="' + i.id + '">Pause</button> <button class="btn btn-sm btn-danger" data-kill-intervention="' + i.id + '">Kill</button>';
      } else if (st === 'paused') {
        actions = '<button class="btn btn-sm btn-primary" data-resume-intervention="' + i.id + '">Resume</button> <button class="btn btn-sm btn-danger" data-kill-intervention="' + i.id + '">Kill</button>';
      }
      return '<tr><td style="font-weight:600">' + esc(i.agent || i.agentName) + '</td><td>' + esc(i.reason || i.type) + '</td><td><span class="badge badge-' + (i.status || 'active') + '">' + (i.status || 'active') + '</span></td><td style="color:var(--text-muted);font-size:12px">' + new Date(i.created_at || i.createdAt).toLocaleDateString() + '</td><td>' + actions + '</td></tr>';
    }).join('');
    cards[0].innerHTML = '<h3>Active Interventions (' + interventions.length + ')</h3>' + renderTable(['Agent', 'Reason', 'Status', 'Time', 'Actions'], rows);

    el.querySelectorAll('[data-pause-intervention]').forEach(function(btn) {
      btn.onclick = function() { pauseIntervention(btn.getAttribute('data-pause-intervention')); };
    });
    el.querySelectorAll('[data-resume-intervention]').forEach(function(btn) {
      btn.onclick = function() { resumeIntervention(btn.getAttribute('data-resume-intervention')); };
    });
    el.querySelectorAll('[data-kill-intervention]').forEach(function(btn) {
      btn.onclick = function() { killIntervention(btn.getAttribute('data-kill-intervention')); };
    });
  }).catch(function() {
    cards[0].innerHTML = '<h3>Active Interventions</h3><div class="empty"><div class="empty-icon">&#128737;</div>No active interventions.</div>';
  });

  api('/engine/anomaly-rules').then(function(d) {
    var rules = d.rules || [];
    if (rules.length === 0) {
      cards[1].innerHTML = '<h3>Anomaly Rules</h3><div class="empty"><div class="empty-icon">&#128208;</div>No anomaly rules defined. Create your first one!</div>';
      return;
    }
    var rows = rules.map(function(r) {
      return '<tr><td style="font-weight:600">' + esc(r.name) + '</td><td><code>' + esc(r.condition || r.type) + '</code></td><td>' + esc(r.action || 'alert') + '</td><td><span class="badge badge-' + (r.status || 'enabled') + '">' + (r.status || 'enabled') + '</span></td><td><button class="btn btn-sm btn-danger" data-delete-anomaly-rule="' + r.id + '">Delete</button></td></tr>';
    }).join('');
    cards[1].innerHTML = '<h3>Anomaly Rules (' + rules.length + ')</h3>' + renderTable(['Name', 'Condition', 'Action', 'Status', ''], rows);

    el.querySelectorAll('[data-delete-anomaly-rule]').forEach(function(btn) {
      btn.onclick = function() { deleteAnomalyRule(btn.getAttribute('data-delete-anomaly-rule')); };
    });
  }).catch(function() {
    cards[1].innerHTML = '<h3>Anomaly Rules</h3><div class="empty"><div class="empty-icon">&#128208;</div>No anomaly rules defined.</div>';
  });
}

function pauseIntervention(id) {
  api('/engine/guardrails/pause/' + id, { method: 'POST' })
    .then(function() { toast('Intervention paused', 'success'); loadGuardrails(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function resumeIntervention(id) {
  api('/engine/guardrails/resume/' + id, { method: 'POST' })
    .then(function() { toast('Intervention resumed', 'success'); loadGuardrails(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function killIntervention(id) {
  if (!confirm('Kill this intervention?')) return;
  api('/engine/guardrails/kill/' + id, { method: 'POST' })
    .then(function() { toast('Intervention killed', 'success'); loadGuardrails(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function deleteAnomalyRule(id) {
  if (!confirm('Delete this anomaly rule?')) return;
  api('/engine/anomaly-rules/' + id, { method: 'DELETE' })
    .then(function() { toast('Anomaly rule deleted', 'success'); loadGuardrails(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

export function initAnomalyRuleModal() {
  var form = document.querySelector('#modal-anomaly-rule form');
  if (form) {
    form.onsubmit = function(e) {
      createAnomalyRule(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-anomaly-rule .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-anomaly-rule');
    };
  }
}

function createAnomalyRule(e) {
  e.preventDefault();
  api('/engine/anomaly-rules', {
    method: 'POST',
    body: {
      name: document.getElementById('anomaly-rule-name').value,
      condition: document.getElementById('anomaly-rule-condition').value,
      action: document.getElementById('anomaly-rule-action').value,
      description: document.getElementById('anomaly-rule-description').value || undefined,
    },
  })
    .then(function() {
      toast('Anomaly rule created!', 'success');
      closeModal('modal-anomaly-rule');
      loadGuardrails();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
