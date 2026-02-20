/**
 * AgenticMail Enterprise Dashboard — Vault Routes
 * GET /vault, POST /vault, POST /vault/:id/delete, POST /vault/:id/rotate
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost, apiDelete } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, badge, timeAgo } = require('../utils/helpers');

const router = Router();

const CATEGORIES = ['deploy', 'cloud_storage', 'api_key', 'skill_credential', 'custom'];

function categoryBadge(category) {
  const colors = {
    deploy: 'primary',
    cloud_storage: 'info',
    api_key: 'warning',
    skill_credential: 'success',
    custom: 'default',
  };
  return badge(category || 'custom', colors[category] || 'default');
}

router.get('/vault', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const result = await apiGet('/api/engine/vault/secrets?orgId=default', req.session.token);
  const secrets = result.status === 200
    ? (Array.isArray(result.body.secrets) ? result.body.secrets : (Array.isArray(result.body) ? result.body : []))
    : [];

  const rows = secrets.map(s => {
    const rotateBtn = `<form method="post" action="/vault/${esc(s.id)}/rotate" style="display:inline" onsubmit="return confirm('Rotate encryption for this secret?')">
           <button class="btn btn-sm" type="submit">Rotate</button>
         </form>`;
    const deleteBtn = `<form method="post" action="/vault/${esc(s.id)}/delete" style="display:inline" onsubmit="return confirm('Delete this secret?')">
           <button class="btn btn-sm btn-danger" type="submit">Delete</button>
         </form>`;
    return [
      `<strong>${esc(s.name || '-')}</strong>`,
      categoryBadge(s.category),
      `<span style="color:var(--text-muted)">${esc(s.createdBy || s.created_by || '-')}</span>`,
      `<span style="color:var(--text-muted)">${timeAgo(s.created_at || s.createdAt)}</span>`,
      `${rotateBtn} ${deleteBtn}`,
    ];
  });

  const table = buildTable(
    ['Name', 'Category', 'Created By', 'Created', 'Actions'],
    rows,
    '&#128274;',
    'No secrets stored yet. Add one above.'
  );

  const categoryOptions = CATEGORIES.map(c =>
    `<option value="${esc(c)}">${esc(c.replace(/_/g, ' '))}</option>`
  ).join('');

  const content = `
    <div class="page-header">
      <h1>Vault</h1>
      <p>Encrypted secrets management</p>
    </div>
    <div class="card">
      <h3>Add Secret</h3>
      <form method="post" action="/vault">
        <div class="form-row">
          <div class="form-group">
            <label>Secret Name</label>
            <input type="text" name="name" required placeholder="e.g. OPENAI_API_KEY">
          </div>
          <div class="form-group">
            <label>Secret Value</label>
            <input type="password" name="value" required placeholder="Enter secret value">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select name="category">
              ${categoryOptions}
            </select>
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end">
            <button class="btn btn-primary" type="submit">Add Secret</button>
          </div>
        </div>
      </form>
    </div>
    <div class="card">
      <h3>Stored Secrets (${secrets.length})</h3>
      ${table}
    </div>`;

  res.send(layout('vault', req.session.user, content, flash));
});

router.post('/vault', requireAuth, async (req, res) => {
  const result = await apiPost('/api/engine/vault/secrets', req.session.token, {
    name: req.body.name,
    value: req.body.value,
    category: req.body.category || 'custom',
    orgId: 'default',
  });

  if (result.status < 300) {
    req.session.flash = { message: 'Secret added', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to add secret', type: 'danger' };
  }
  res.redirect('/vault');
});

router.post('/vault/:id/delete', requireAuth, async (req, res) => {
  const result = await apiDelete(`/api/engine/vault/secrets/${req.params.id}`, req.session.token);

  if (result.status < 300) {
    req.session.flash = { message: 'Secret deleted', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to delete secret', type: 'danger' };
  }
  res.redirect('/vault');
});

router.post('/vault/:id/rotate', requireAuth, async (req, res) => {
  const result = await apiPost(`/api/engine/vault/secrets/${req.params.id}/rotate`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Secret encryption rotated', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to rotate secret', type: 'danger' };
  }
  res.redirect('/vault');
});

module.exports = router;
