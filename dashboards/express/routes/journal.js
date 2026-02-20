/**
 * AgenticMail Enterprise Dashboard — Journal Routes
 * GET /journal, POST /journal/:id/rollback
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/journal', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const entriesResult = await apiGet('/engine/journal', req.session.token);
  const entries = entriesResult.status === 200
    ? (Array.isArray(entriesResult.body.entries) ? entriesResult.body.entries : (Array.isArray(entriesResult.body) ? entriesResult.body : []))
    : [];

  const statsResult = await apiGet('/engine/journal/stats/default', req.session.token);
  const stats = statsResult.status === 200 ? statsResult.body : {};

  const rows = entries.map(e => {
    const rollbackBtn = (e.status || '').toLowerCase() !== 'rolled_back'
      ? `<form method="post" action="/journal/${esc(e.id)}/rollback" style="display:inline" onsubmit="return confirm('Rollback this action? This cannot be undone.')">
           <button class="btn btn-sm btn-warning" type="submit">Rollback</button>
         </form>`
      : `<span class="badge badge-default">Rolled back</span>`;
    return [
      `<strong>${esc(e.action || e.type || '-')}</strong>`,
      esc(e.agent || e.agentName || '-'),
      `<code>${esc(e.resource || e.target || '-')}</code>`,
      statusBadge(e.status || 'completed'),
      `<span style="color:var(--text-muted)">${timeAgo(e.created_at || e.createdAt)}</span>`,
      rollbackBtn,
    ];
  });

  const table = buildTable(
    ['Action', 'Agent', 'Resource', 'Status', 'Time', ''],
    rows,
    '&#128216;',
    'No journal entries yet.'
  );

  const statsHtml = `
    <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px">
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--primary)">${stats.total || 0}</div>
        <div style="color:var(--text-muted);font-size:13px">Total Entries</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--success,#22c55e)">${stats.completed || 0}</div>
        <div style="color:var(--text-muted);font-size:13px">Completed</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--warning,#f59e0b)">${stats.rolled_back || stats.rolledBack || 0}</div>
        <div style="color:var(--text-muted);font-size:13px">Rolled Back</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--danger,#ef4444)">${stats.failed || 0}</div>
        <div style="color:var(--text-muted);font-size:13px">Failed</div>
      </div>
    </div>`;

  const content = `
    <div class="page-header">
      <h1>Journal</h1>
      <p>Track and rollback agent actions with a complete audit trail</p>
    </div>
    ${statsHtml}
    <div class="card">
      <h3>Journal Entries (${entries.length})</h3>
      ${table}
    </div>`;

  res.send(layout('journal', req.session.user, content, flash));
});

router.post('/journal/:id/rollback', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/journal/${req.params.id}/rollback`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Action rolled back successfully', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to rollback action', type: 'danger' };
  }
  res.redirect('/journal');
});

module.exports = router;
