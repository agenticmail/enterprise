// Audit log page — paginated table

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { renderPageHeader } from '../components/layout.js';
import { renderTable } from '../components/table.js';
import { renderPagination } from '../components/pagination.js';

var auditPage = 0;

export function loadAudit(page) {
  if (typeof page === 'number') {
    auditPage = page;
  }
  var el = document.getElementById('page-content');
  el.innerHTML = renderPageHeader('Audit Log', 'Loading...');
  api('/audit?limit=25&offset=' + (auditPage * 25)).then(function(d) {
    var events = d.events || [];
    var total = d.total || 0;
    if (events.length === 0) {
      el.innerHTML = renderPageHeader('Audit Log', '0 events') +
        '<div class="card"><div class="empty"><div class="empty-icon">\ud83d\udccb</div>No audit events yet</div></div>';
      return;
    }
    var rows = events.map(function(e) {
      return '<tr><td style="font-size:12px;color:var(--text-muted);white-space:nowrap">' + new Date(e.timestamp).toLocaleString() + '</td><td>' + esc(e.actor) + '</td><td style="color:var(--primary);font-weight:500">' + esc(e.action) + '</td><td style="font-size:12px">' + esc(e.resource) + '</td><td style="font-size:12px;color:var(--text-muted)">' + (e.ip || '-') + '</td></tr>';
    }).join('');
    el.innerHTML = renderPageHeader('Audit Log', total + ' total events') +
      '<div class="card">' +
      renderTable(['Time', 'Actor', 'Action', 'Resource', 'IP'], rows) +
      renderPagination(auditPage, total, 25, 'audit-prev', 'audit-next') +
      '</div>';

    // Bind pagination buttons
    var prevBtn = document.getElementById('audit-prev');
    var nextBtn = document.getElementById('audit-next');
    if (prevBtn) {
      prevBtn.onclick = function() {
        auditPage--;
        loadAudit();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = function() {
        auditPage++;
        loadAudit();
      };
    }
  });
}
