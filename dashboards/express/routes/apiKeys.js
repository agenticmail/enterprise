/**
 * AgenticMail Enterprise Dashboard — API Keys Routes
 * GET /api-keys, POST /api-keys, POST /api-keys/:id/revoke
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost, apiDelete } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { apiKeyCreateForm } = require('../views/components/modal');
const { esc, badge, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/api-keys', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const result = await apiGet('/api/api-keys', req.session.token);
  const keys = result.status === 200
    ? (Array.isArray(result.body.api_keys) ? result.body.api_keys
      : Array.isArray(result.body.keys) ? result.body.keys
      : Array.isArray(result.body) ? result.body : [])
    : [];

  const rows = keys.map(k => {
    const prefix = k.prefix || k.key_prefix || (k.key ? k.key.substring(0, 12) + '...' : '-');
    const scopes = (k.scopes || []).map(s => badge(s)).join(' ');
    const revokeBtn = (k.status || '').toLowerCase() !== 'revoked'
      ? `<form method="post" action="/api-keys/${esc(k.id)}/revoke" style="display:inline" onsubmit="return confirm('Revoke this API key? This cannot be undone.')">
           <button class="btn btn-sm btn-danger" type="submit">Revoke</button>
         </form>`
      : '';
    return [
      `<strong>${esc(k.name || '-')}</strong>`,
      `<code>${esc(prefix)}</code>`,
      scopes,
      statusBadge(k.status || 'active'),
      `<span style="color:var(--text-muted)">${timeAgo(k.created_at)}</span>`,
      revokeBtn,
    ];
  });

  const table = buildTable(
    ['Name', 'Key Prefix', 'Scopes', 'Status', 'Created', 'Actions'],
    rows,
    '&#128273;',
    'No API keys. Generate one above.'
  );

  // Show-once key banner if a key was just created
  let keyBanner = '';
  if (flash && flash.createdKey) {
    keyBanner = `<div class="key-banner">
      <strong>Save this key now!</strong> It will not be shown again.
      <code>${esc(flash.createdKey)}</code>
    </div>`;
  }

  const content = `
    <div class="page-header">
      <h1>API Keys</h1>
      <p>Manage programmatic access credentials</p>
    </div>
    ${keyBanner}
    ${apiKeyCreateForm()}
    <div class="card">
      <h3>Active Keys (${keys.length})</h3>
      ${table}
    </div>`;

  res.send(layout('keys', req.session.user, content, flash));
});

router.post('/api-keys', requireAuth, async (req, res) => {
  const scopes = (req.body.scopes || '').split(',').map(s => s.trim()).filter(Boolean);
  const result = await apiPost('/api/api-keys', req.session.token, {
    name: req.body.name,
    scopes,
  });

  if (result.status < 300) {
    const plaintext = result.body.key || result.body.api_key || result.body.token || result.body.plaintext;
    req.session.flash = {
      message: 'API key created',
      type: 'success',
      createdKey: plaintext || null,
    };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to create API key', type: 'danger' };
  }
  res.redirect('/api-keys');
});

router.post('/api-keys/:id/revoke', requireAuth, async (req, res) => {
  const result = await apiDelete(`/api/api-keys/${req.params.id}`, req.session.token);

  if (result.status < 300) {
    req.session.flash = { message: 'API key revoked', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to revoke key', type: 'danger' };
  }
  res.redirect('/api-keys');
});

module.exports = router;
