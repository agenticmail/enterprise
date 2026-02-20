// Dashboard page — stats + recent audit

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { renderStats } from '../components/stat-card.js';
import { renderPageHeader } from '../components/layout.js';

export function loadDashboard() {
  var el = document.getElementById('page-content');
  el.innerHTML = renderPageHeader('Dashboard', 'Loading...');
  api('/stats').then(function(s) {
    api('/audit?limit=8').then(function(a) {
      var events = (a.events || []).map(function(e) {
        return '<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">' +
          '<span style="color:var(--primary);font-weight:500">' + esc(e.action) + '</span> on ' + esc(e.resource) +
          '<div style="font-size:11px;color:var(--text-muted)">' + new Date(e.timestamp).toLocaleString() + (e.ip ? ' \u00b7 ' + e.ip : '') + '</div></div>';
      }).join('');
      el.innerHTML = renderPageHeader('Dashboard', 'Overview of your AgenticMail instance') +
        renderStats(s) +
        '<div class="card"><div class="card-title">Recent Activity</div>' +
        (events || '<div class="empty"><div class="empty-icon">\ud83d\udccb</div>No activity yet</div>') +
        '</div>';
    });
  });
}
