/**
 * AgenticMail Enterprise Dashboard — Dashboard Route
 * GET /
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet } = require('../utils/api');
const { layout } = require('../views/layout');
const { statsGrid } = require('../views/components/stats');
const { buildTable } = require('../views/components/table');
const { esc, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const [statsRes, auditRes] = await Promise.all([
    apiGet('/api/stats', req.session.token),
    apiGet('/api/audit?limit=8', req.session.token),
  ]);

  const stats = statsRes.status === 200 ? statsRes.body : {};
  const events = auditRes.status === 200
    ? (Array.isArray(auditRes.body.events) ? auditRes.body.events : (Array.isArray(auditRes.body) ? auditRes.body : []))
    : [];

  const statCards = statsGrid([
    { label: 'Total Agents', value: stats.agents || stats.total_agents || stats.totalAgents || 0, pink: true },
    { label: 'Total Users', value: stats.users || stats.total_users || stats.totalUsers || 0 },
    { label: 'Messages Today', value: stats.messages_today || stats.messages || 0 },
    { label: 'API Keys', value: stats.api_keys || stats.total_api_keys || stats.totalApiKeys || 0 },
  ]);

  const auditRows = events.map(ev => [
    esc(ev.action || ev.event || 'unknown'),
    esc(ev.actor || ev.user || ev.email || '-'),
    esc(ev.resource || ev.target || '-'),
    `<span style="color:var(--text-muted)">${timeAgo(ev.created_at || ev.timestamp)}</span>`,
  ]);

  const auditTable = buildTable(
    ['Event', 'Actor', 'Resource', 'Time'],
    auditRows,
    '&#128220;',
    'No recent audit events'
  );

  const content = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p>Overview of your AgenticMail Enterprise instance</p>
    </div>
    ${statCards}
    <div class="card">
      <h3>Recent Audit Events</h3>
      ${auditTable}
    </div>`;

  res.send(layout('dashboard', req.session.user, content, flash));
});

module.exports = router;
