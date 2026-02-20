/**
 * AgenticMail Enterprise Dashboard — Compliance Routes
 * GET /compliance, POST /compliance/generate
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/compliance', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const reportsResult = await apiGet('/engine/compliance/reports', req.session.token);
  const reports = reportsResult.status === 200
    ? (Array.isArray(reportsResult.body.reports) ? reportsResult.body.reports : (Array.isArray(reportsResult.body) ? reportsResult.body : []))
    : [];

  const rows = reports.map(r => [
    `<strong>${esc(r.name || r.type || '-')}</strong>`,
    esc(r.framework || r.standard || '-'),
    statusBadge(r.status || 'generated'),
    `<span style="color:var(--text-muted)">${esc(r.score != null ? r.score + '%' : '-')}</span>`,
    `<span style="color:var(--text-muted)">${timeAgo(r.created_at || r.createdAt)}</span>`,
  ]);

  const table = buildTable(
    ['Report', 'Framework', 'Status', 'Score', 'Generated'],
    rows,
    '&#128203;',
    'No compliance reports yet. Generate one below.'
  );

  const content = `
    <div class="page-header">
      <h1>Compliance</h1>
      <p>Generate and review compliance reports for regulatory frameworks</p>
    </div>
    <div class="card">
      <h3>Generate Report</h3>
      <form method="post" action="/compliance/generate">
        <div class="form-row">
          <div class="form-group">
            <label>Framework</label>
            <select name="framework" required>
              <option value="soc2">SOC 2</option>
              <option value="gdpr">GDPR</option>
              <option value="audit">Audit</option>
            </select>
          </div>
          <div class="form-group">
            <label>Report Name</label>
            <input type="text" name="name" placeholder="Optional custom name">
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Generate Report</button>
      </form>
    </div>
    <div class="card">
      <h3>Compliance Reports (${reports.length})</h3>
      ${table}
    </div>`;

  res.send(layout('compliance', req.session.user, content, flash));
});

router.post('/compliance/generate', requireAuth, async (req, res) => {
  const framework = req.body.framework;
  const endpoints = {
    soc2: '/engine/compliance/reports/soc2',
    gdpr: '/engine/compliance/reports/gdpr',
    audit: '/engine/compliance/reports/audit',
  };
  const endpoint = endpoints[framework] || endpoints.soc2;

  const result = await apiPost(endpoint, req.session.token, {
    name: req.body.name || undefined,
  });

  if (result.status < 300) {
    req.session.flash = { message: `${framework.toUpperCase()} compliance report generated`, type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to generate report', type: 'danger' };
  }
  res.redirect('/compliance');
});

module.exports = router;
