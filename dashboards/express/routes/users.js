/**
 * AgenticMail Enterprise Dashboard — Users Routes
 * GET /users, POST /users
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { userCreateForm } = require('../views/components/modal');
const { esc, badge, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/users', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const result = await apiGet('/api/users', req.session.token);
  const users = result.status === 200
    ? (Array.isArray(result.body.users) ? result.body.users : (Array.isArray(result.body) ? result.body : []))
    : [];

  const rows = users.map(u => [
    `<strong>${esc(u.name || '-')}</strong>`,
    esc(u.email || '-'),
    badge(u.role || 'member', u.role || 'member'),
    statusBadge(u.status || 'active'),
    `<span style="color:var(--text-muted)">${timeAgo(u.created_at)}</span>`,
  ]);

  const table = buildTable(
    ['Name', 'Email', 'Role', 'Status', 'Joined'],
    rows,
    '&#128101;',
    'No users found'
  );

  const content = `
    <div class="page-header">
      <h1>Users</h1>
      <p>Manage user accounts and roles</p>
    </div>
    ${userCreateForm()}
    <div class="card">
      <h3>All Users (${users.length})</h3>
      ${table}
    </div>`;

  res.send(layout('users', req.session.user, content, flash));
});

router.post('/users', requireAuth, async (req, res) => {
  const result = await apiPost('/api/users', req.session.token, {
    name: req.body.name,
    email: req.body.email,
    role: req.body.role,
  });

  if (result.status < 300) {
    req.session.flash = { message: 'User created', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to create user', type: 'danger' };
  }
  res.redirect('/users');
});

module.exports = router;
