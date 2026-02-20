/**
 * AgenticMail Enterprise Dashboard — Audit Routes
 * GET /audit?page=N
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, timeAgo } = require('../utils/helpers');

const router = Router();
const LIMIT = 25;

router.get('/audit', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * LIMIT;

  const result = await apiGet(`/api/audit?limit=${LIMIT}&offset=${offset}`, req.session.token);
  const body = result.status === 200 ? result.body : {};
  const events = body.events
    ? (Array.isArray(body.events) ? body.events : [])
    : (Array.isArray(body) ? body : []);
  const total = body.total || events.length;

  const rows = events.map(ev => [
    esc(ev.action || ev.event || 'unknown'),
    esc(ev.actor || ev.user || ev.email || '-'),
    esc(ev.resource || ev.target || '-'),
    `<span style="color:var(--text-muted)"><code>${esc(ev.ip || ev.ip_address || '-')}</code></span>`,
    `<span style="color:var(--text-muted)">${timeAgo(ev.created_at || ev.timestamp)}</span>`,
  ]);

  const table = buildTable(
    ['Event', 'Actor', 'Resource', 'IP Address', 'Time'],
    rows,
    '&#128220;',
    'No audit events recorded'
  );

  // Pagination
  let pagination = '';
  if (events.length > 0) {
    const prevLink = page > 1
      ? `<a href="/audit?page=${page - 1}">&laquo; Previous</a>`
      : '';
    const nextLink = events.length >= LIMIT
      ? `<a href="/audit?page=${page + 1}">Next &raquo;</a>`
      : '';
    pagination = `<div class="pagination">
      ${prevLink}
      <span class="current">Page ${page}</span>
      ${nextLink}
      <span style="color:var(--text-muted);font-size:12px;margin-left:auto">${total} total events</span>
    </div>`;
  }

  const content = `
    <div class="page-header">
      <h1>Audit Log</h1>
      <p>Security and activity event history</p>
    </div>
    <div class="card">
      ${table}
      ${pagination}
    </div>`;

  res.send(layout('audit', req.session.user, content, flash));
});

module.exports = router;
