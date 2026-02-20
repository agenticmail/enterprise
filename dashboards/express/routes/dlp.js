/**
 * AgenticMail Enterprise Dashboard — DLP Routes
 * GET /dlp, POST /dlp/rules/create, POST /dlp/rules/:id/delete, POST /dlp/scan
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost, apiDelete } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/dlp', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const rulesResult = await apiGet('/engine/dlp/rules?orgId=default', req.session.token);
  const rules = rulesResult.status === 200
    ? (Array.isArray(rulesResult.body.rules) ? rulesResult.body.rules : (Array.isArray(rulesResult.body) ? rulesResult.body : []))
    : [];

  const violationsResult = await apiGet('/engine/dlp/violations', req.session.token);
  const violations = violationsResult.status === 200
    ? (Array.isArray(violationsResult.body.violations) ? violationsResult.body.violations : (Array.isArray(violationsResult.body) ? violationsResult.body : []))
    : [];

  const ruleRows = rules.map(r => {
    const deleteBtn = `<form method="post" action="/dlp/rules/${esc(r.id)}/delete" style="display:inline" onsubmit="return confirm('Delete this DLP rule?')">
           <button class="btn btn-sm btn-danger" type="submit">Delete</button>
         </form>`;
    return [
      `<strong>${esc(r.name || '-')}</strong>`,
      `<code>${esc(r.pattern || '-')}</code>`,
      statusBadge(r.status || 'enabled'),
      `<span style="color:var(--text-muted)">${esc(r.action || 'block')}</span>`,
      deleteBtn,
    ];
  });

  const ruleTable = buildTable(
    ['Name', 'Pattern', 'Status', 'Action', ''],
    ruleRows,
    '&#128274;',
    'No DLP rules defined. Create one below.'
  );

  const violationRows = violations.map(v => [
    `<strong>${esc(v.rule_name || v.ruleName || '-')}</strong>`,
    `<code>${esc(v.matched || v.content || '-')}</code>`,
    esc(v.agent || v.sender || '-'),
    `<span style="color:var(--text-muted)">${timeAgo(v.created_at || v.createdAt)}</span>`,
  ]);

  const violationTable = buildTable(
    ['Rule', 'Matched Content', 'Agent/Sender', 'Time'],
    violationRows,
    '&#9989;',
    'No DLP violations detected.'
  );

  const content = `
    <div class="page-header">
      <h1>Data Loss Prevention</h1>
      <p>Protect sensitive data with pattern-based scanning rules</p>
    </div>
    <div class="card">
      <h3>Create DLP Rule</h3>
      <form method="post" action="/dlp/rules/create">
        <div class="form-row">
          <div class="form-group">
            <label>Rule Name</label>
            <input type="text" name="name" required placeholder="e.g. Credit Card Numbers">
          </div>
          <div class="form-group">
            <label>Pattern (regex)</label>
            <input type="text" name="pattern" required placeholder="e.g. \\d{4}-\\d{4}-\\d{4}-\\d{4}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Action</label>
            <select name="action">
              <option value="block">Block</option>
              <option value="redact">Redact</option>
              <option value="flag">Flag Only</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" name="description" placeholder="Optional description">
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Create Rule</button>
      </form>
    </div>
    <div class="card">
      <h3>Scan Content</h3>
      <form method="post" action="/dlp/scan">
        <div class="form-group">
          <label>Content to Scan</label>
          <textarea name="content" rows="3" required placeholder="Paste content to test against DLP rules..."></textarea>
        </div>
        <button class="btn btn-primary" type="submit">Scan</button>
      </form>
    </div>
    <div class="card">
      <h3>DLP Rules (${rules.length})</h3>
      ${ruleTable}
    </div>
    <div class="card">
      <h3>Recent Violations (${violations.length})</h3>
      ${violationTable}
    </div>`;

  res.send(layout('dlp', req.session.user, content, flash));
});

router.post('/dlp/rules/create', requireAuth, async (req, res) => {
  const result = await apiPost('/engine/dlp/rules', req.session.token, {
    name: req.body.name,
    pattern: req.body.pattern,
    action: req.body.action,
    description: req.body.description,
  });

  if (result.status < 300) {
    req.session.flash = { message: 'DLP rule created', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to create DLP rule', type: 'danger' };
  }
  res.redirect('/dlp');
});

router.post('/dlp/rules/:id/delete', requireAuth, async (req, res) => {
  const result = await apiDelete(`/engine/dlp/rules/${req.params.id}`, req.session.token);

  if (result.status < 300) {
    req.session.flash = { message: 'DLP rule deleted', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to delete DLP rule', type: 'danger' };
  }
  res.redirect('/dlp');
});

router.post('/dlp/scan', requireAuth, async (req, res) => {
  const result = await apiPost('/engine/dlp/scan', req.session.token, {
    content: req.body.content,
  });

  if (result.status < 300) {
    const matches = result.body.matches || result.body.violations || [];
    if (matches.length > 0) {
      req.session.flash = { message: `Scan complete: ${matches.length} violation(s) found`, type: 'warning' };
    } else {
      req.session.flash = { message: 'Scan complete: no violations found', type: 'success' };
    }
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Scan failed', type: 'danger' };
  }
  res.redirect('/dlp');
});

module.exports = router;
