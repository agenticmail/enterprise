/**
 * AgenticMail Enterprise Dashboard — Guardrails Routes
 * GET /guardrails, POST /guardrails/pause, POST /guardrails/resume/:id,
 * POST /guardrails/kill/:id, POST /anomaly-rules/create, POST /anomaly-rules/:id/delete
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost, apiDelete } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/guardrails', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const interventionsResult = await apiGet('/engine/guardrails/interventions', req.session.token);
  const interventions = interventionsResult.status === 200
    ? (Array.isArray(interventionsResult.body.interventions) ? interventionsResult.body.interventions : (Array.isArray(interventionsResult.body) ? interventionsResult.body : []))
    : [];

  const rulesResult = await apiGet('/engine/anomaly-rules', req.session.token);
  const rules = rulesResult.status === 200
    ? (Array.isArray(rulesResult.body.rules) ? rulesResult.body.rules : (Array.isArray(rulesResult.body) ? rulesResult.body : []))
    : [];

  const interventionRows = interventions.map(i => {
    let actions = '';
    const st = (i.status || '').toLowerCase();
    if (st === 'active' || st === 'running') {
      actions = `
        <form method="post" action="/guardrails/pause" style="display:inline">
          <input type="hidden" name="interventionId" value="${esc(i.id)}">
          <button class="btn btn-sm btn-warning" type="submit">Pause</button>
        </form>
        <form method="post" action="/guardrails/kill/${esc(i.id)}" style="display:inline" onsubmit="return confirm('Kill this intervention?')">
          <button class="btn btn-sm btn-danger" type="submit">Kill</button>
        </form>`;
    } else if (st === 'paused') {
      actions = `
        <form method="post" action="/guardrails/resume/${esc(i.id)}" style="display:inline">
          <button class="btn btn-sm btn-primary" type="submit">Resume</button>
        </form>
        <form method="post" action="/guardrails/kill/${esc(i.id)}" style="display:inline" onsubmit="return confirm('Kill this intervention?')">
          <button class="btn btn-sm btn-danger" type="submit">Kill</button>
        </form>`;
    }
    return [
      `<strong>${esc(i.agent || i.agentName || '-')}</strong>`,
      esc(i.reason || i.type || '-'),
      statusBadge(i.status || 'active'),
      `<span style="color:var(--text-muted)">${timeAgo(i.created_at || i.createdAt)}</span>`,
      actions,
    ];
  });

  const interventionTable = buildTable(
    ['Agent', 'Reason', 'Status', 'Time', 'Actions'],
    interventionRows,
    '&#128737;',
    'No active interventions.'
  );

  const ruleRows = rules.map(r => {
    const deleteBtn = `<form method="post" action="/anomaly-rules/${esc(r.id)}/delete" style="display:inline" onsubmit="return confirm('Delete this anomaly rule?')">
           <button class="btn btn-sm btn-danger" type="submit">Delete</button>
         </form>`;
    return [
      `<strong>${esc(r.name || '-')}</strong>`,
      `<code>${esc(r.condition || r.type || '-')}</code>`,
      esc(r.action || 'alert'),
      statusBadge(r.status || 'enabled'),
      deleteBtn,
    ];
  });

  const ruleTable = buildTable(
    ['Name', 'Condition', 'Action', 'Status', ''],
    ruleRows,
    '&#128208;',
    'No anomaly rules defined. Create one below.'
  );

  const content = `
    <div class="page-header">
      <h1>Guardrails</h1>
      <p>Monitor and control AI agent behavior with interventions and anomaly detection</p>
    </div>
    <div class="card">
      <h3>Active Interventions (${interventions.length})</h3>
      ${interventionTable}
    </div>
    <div class="card">
      <h3>Create Anomaly Rule</h3>
      <form method="post" action="/anomaly-rules/create">
        <div class="form-row">
          <div class="form-group">
            <label>Rule Name</label>
            <input type="text" name="name" required placeholder="e.g. High volume sending">
          </div>
          <div class="form-group">
            <label>Condition</label>
            <input type="text" name="condition" required placeholder="e.g. messages_per_hour > 100">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Action</label>
            <select name="action">
              <option value="alert">Alert</option>
              <option value="pause">Pause Agent</option>
              <option value="kill">Kill Agent</option>
              <option value="throttle">Throttle</option>
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
      <h3>Anomaly Rules (${rules.length})</h3>
      ${ruleTable}
    </div>`;

  res.send(layout('guardrails', req.session.user, content, flash));
});

router.post('/guardrails/pause', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/guardrails/pause/${req.body.interventionId}`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Intervention paused', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to pause intervention', type: 'danger' };
  }
  res.redirect('/guardrails');
});

router.post('/guardrails/resume/:id', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/guardrails/resume/${req.params.id}`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Intervention resumed', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to resume intervention', type: 'danger' };
  }
  res.redirect('/guardrails');
});

router.post('/guardrails/kill/:id', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/guardrails/kill/${req.params.id}`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Intervention killed', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to kill intervention', type: 'danger' };
  }
  res.redirect('/guardrails');
});

router.post('/anomaly-rules/create', requireAuth, async (req, res) => {
  const result = await apiPost('/engine/anomaly-rules', req.session.token, {
    name: req.body.name,
    condition: req.body.condition,
    action: req.body.action,
    description: req.body.description,
  });

  if (result.status < 300) {
    req.session.flash = { message: 'Anomaly rule created', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to create anomaly rule', type: 'danger' };
  }
  res.redirect('/guardrails');
});

router.post('/anomaly-rules/:id/delete', requireAuth, async (req, res) => {
  const result = await apiDelete(`/engine/anomaly-rules/${req.params.id}`, req.session.token);

  if (result.status < 300) {
    req.session.flash = { message: 'Anomaly rule deleted', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to delete anomaly rule', type: 'danger' };
  }
  res.redirect('/guardrails');
});

module.exports = router;
