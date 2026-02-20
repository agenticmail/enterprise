// Journal page — action log with rollback

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { renderTable } from '../components/table.js';

export function loadJournal() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="margin-bottom:24px"><h2 class="page-title">Journal</h2><p class="page-desc" style="margin:0">Track and rollback agent actions with a complete audit trail</p></div><div class="stats-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px"><div class="card" style="text-align:center" id="journal-stat-total"><div style="font-size:28px;font-weight:700;color:var(--primary)">-</div><div style="color:var(--text-dim);font-size:13px">Total Entries</div></div><div class="card" style="text-align:center" id="journal-stat-completed"><div style="font-size:28px;font-weight:700;color:#22c55e">-</div><div style="color:var(--text-dim);font-size:13px">Completed</div></div><div class="card" style="text-align:center" id="journal-stat-rolledback"><div style="font-size:28px;font-weight:700;color:#f59e0b">-</div><div style="color:var(--text-dim);font-size:13px">Rolled Back</div></div><div class="card" style="text-align:center" id="journal-stat-failed"><div style="font-size:28px;font-weight:700;color:#ef4444">-</div><div style="color:var(--text-dim);font-size:13px">Failed</div></div></div><div class="card"><h3>Journal Entries</h3><div class="page-desc">Loading...</div></div>';

  api('/engine/journal/stats/default').then(function(stats) {
    var setVal = function(id, val) {
      var s = document.getElementById(id);
      if (s) s.querySelector('div').textContent = val;
    };
    setVal('journal-stat-total', stats.total || 0);
    setVal('journal-stat-completed', stats.completed || 0);
    setVal('journal-stat-rolledback', stats.rolled_back || stats.rolledBack || 0);
    setVal('journal-stat-failed', stats.failed || 0);
  }).catch(function() {});

  var card = el.querySelector('.card:last-child');

  api('/engine/journal').then(function(d) {
    var entries = d.entries || [];
    if (entries.length === 0) {
      card.innerHTML = '<h3>Journal Entries</h3><div class="empty"><div class="empty-icon">&#128216;</div>No journal entries yet.</div>';
      return;
    }
    var rows = entries.map(function(e) {
      var rollback = (e.status || '').toLowerCase() !== 'rolled_back'
        ? '<button class="btn btn-sm btn-warning" data-rollback-journal="' + e.id + '">Rollback</button>'
        : '<span class="badge badge-default">Rolled back</span>';
      return '<tr><td style="font-weight:600">' + esc(e.action || e.type) + '</td><td>' + esc(e.agent || e.agentName) + '</td><td><code>' + esc(e.resource || e.target) + '</code></td><td><span class="badge badge-' + (e.status || 'completed') + '">' + (e.status || 'completed') + '</span></td><td style="color:var(--text-muted);font-size:12px">' + new Date(e.created_at || e.createdAt).toLocaleDateString() + '</td><td>' + rollback + '</td></tr>';
    }).join('');
    card.innerHTML = '<h3>Journal Entries (' + entries.length + ')</h3>' + renderTable(['Action', 'Agent', 'Resource', 'Status', 'Time', ''], rows);

    el.querySelectorAll('[data-rollback-journal]').forEach(function(btn) {
      btn.onclick = function() {
        rollbackEntry(btn.getAttribute('data-rollback-journal'));
      };
    });
  }).catch(function() {
    card.innerHTML = '<h3>Journal Entries</h3><div class="empty"><div class="empty-icon">&#128216;</div>No journal entries yet.</div>';
  });
}

function rollbackEntry(id) {
  if (!confirm('Rollback this action? This cannot be undone.')) return;
  api('/engine/journal/' + id + '/rollback', { method: 'POST' })
    .then(function() { toast('Action rolled back', 'success'); loadJournal(); })
    .catch(function(err) { toast(err.message, 'error'); });
}
