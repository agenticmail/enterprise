// Compliance page — generate and review reports

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

export function loadCompliance() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">Compliance</h2><p class="page-desc" style="margin:0">Generate and review compliance reports for regulatory frameworks</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-report">+ Generate Report</button></div><div class="card"><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-report').onclick = function() {
    openModal('modal-compliance');
  };

  api('/engine/compliance/reports').then(function(d) {
    var reports = d.reports || [];
    if (reports.length === 0) {
      el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">&#128203;</div>No compliance reports yet. Generate your first one!</div>';
      return;
    }
    var rows = reports.map(function(r) {
      return '<tr><td style="font-weight:600">' + esc(r.name || r.type) + '</td><td>' + esc(r.framework || r.standard) + '</td><td><span class="badge badge-' + (r.status || 'generated') + '">' + (r.status || 'generated') + '</span></td><td style="color:var(--text-muted)">' + (r.score != null ? r.score + '%' : '-') + '</td><td style="color:var(--text-muted);font-size:12px">' + new Date(r.created_at || r.createdAt).toLocaleDateString() + '</td></tr>';
    }).join('');
    el.querySelector('.card').innerHTML = renderTable(['Report', 'Framework', 'Status', 'Score', 'Generated'], rows);
  }).catch(function() {
    el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">&#128203;</div>No compliance reports yet.</div>';
  });
}

export function initComplianceModal() {
  var form = document.querySelector('#modal-compliance form');
  if (form) {
    form.onsubmit = function(e) {
      generateReport(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-compliance .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-compliance');
    };
  }
}

function generateReport(e) {
  e.preventDefault();
  var framework = document.getElementById('compliance-framework').value;
  var endpoints = {
    soc2: '/engine/compliance/reports/soc2',
    gdpr: '/engine/compliance/reports/gdpr',
    audit: '/engine/compliance/reports/audit',
  };
  var endpoint = endpoints[framework] || endpoints.soc2;

  api(endpoint, {
    method: 'POST',
    body: {
      name: document.getElementById('compliance-name').value || undefined,
    },
  })
    .then(function() {
      toast(framework.toUpperCase() + ' report generated!', 'success');
      closeModal('modal-compliance');
      loadCompliance();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
