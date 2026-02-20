/**
 * AgenticMail Enterprise Dashboard — Skills Routes
 * GET /skills, POST /skills/:id/enable, POST /skills/:id/disable, POST /skills/:id/uninstall
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPut, apiDelete } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, badge, statusBadge } = require('../utils/helpers');

const router = Router();

router.get('/skills', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const [builtinRes, installedRes] = await Promise.all([
    apiGet('/api/engine/skills/by-category', req.session.token),
    apiGet('/api/engine/community/installed?orgId=default', req.session.token),
  ]);

  // Parse builtin skills (grouped by category)
  const categories = builtinRes.status === 200
    ? (builtinRes.body.categories || builtinRes.body || {})
    : {};

  // Parse installed community skills
  const installed = installedRes.status === 200
    ? (Array.isArray(installedRes.body.skills) ? installedRes.body.skills : (Array.isArray(installedRes.body) ? installedRes.body : []))
    : [];

  // Build builtin skills grid
  let builtinHtml = '';
  const categoryEntries = typeof categories === 'object' && !Array.isArray(categories)
    ? Object.entries(categories)
    : [];

  if (categoryEntries.length === 0) {
    builtinHtml = '<div class="empty"><span class="icon">&#9889;</span>No builtin skills found.</div>';
  } else {
    builtinHtml = categoryEntries.map(([catName, skills]) => {
      const skillsList = Array.isArray(skills) ? skills : [];
      const skillCards = skillsList.map(s => `
        <div class="skill-card" style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card-bg, #fff)">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(s.name || s.id || '-')}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;line-height:1.4">${esc(s.description || '')}</div>
          ${s.version ? `<span style="font-size:11px;color:var(--text-muted)">v${esc(s.version)}</span>` : ''}
        </div>`
      ).join('');

      return `
        <div style="margin-bottom:20px">
          <h4 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">${esc(catName)}</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:12px">
            ${skillCards}
          </div>
        </div>`;
    }).join('');
  }

  // Build installed community skills table
  const installedRows = installed.map(s => {
    const isEnabled = s.enabled !== false && s.status !== 'disabled';
    const toggleBtn = isEnabled
      ? `<form method="post" action="/skills/${esc(s.id)}/disable" style="display:inline">
           <button class="btn btn-sm" type="submit">Disable</button>
         </form>`
      : `<form method="post" action="/skills/${esc(s.id)}/enable" style="display:inline">
           <button class="btn btn-sm btn-primary" type="submit">Enable</button>
         </form>`;
    const uninstallBtn = `<form method="post" action="/skills/${esc(s.id)}/uninstall" style="display:inline" onsubmit="return confirm('Uninstall this skill?')">
           <button class="btn btn-sm btn-danger" type="submit">Uninstall</button>
         </form>`;
    return [
      `<strong>${esc(s.name || s.id || '-')}</strong>`,
      `<span style="color:var(--text-muted)">${esc(s.version || '-')}</span>`,
      isEnabled ? badge('enabled', 'success') : badge('disabled', 'danger'),
      `${toggleBtn} ${uninstallBtn}`,
    ];
  });

  const installedTable = buildTable(
    ['Name', 'Version', 'Status', 'Actions'],
    installedRows,
    '&#128230;',
    'No community skills installed.'
  );

  const content = `
    <div class="page-header">
      <h1>Skills</h1>
      <p>Builtin capabilities and community skill extensions</p>
    </div>
    <div class="card">
      <h3>Builtin Skills</h3>
      ${builtinHtml}
    </div>
    <div class="card">
      <h3>Installed Community Skills (${installed.length})</h3>
      ${installedTable}
    </div>`;

  res.send(layout('skills', req.session.user, content, flash));
});

router.post('/skills/:id/enable', requireAuth, async (req, res) => {
  const result = await apiPut(`/api/engine/community/skills/${req.params.id}/enable`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Skill enabled', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to enable skill', type: 'danger' };
  }
  res.redirect('/skills');
});

router.post('/skills/:id/disable', requireAuth, async (req, res) => {
  const result = await apiPut(`/api/engine/community/skills/${req.params.id}/disable`, req.session.token, {});

  if (result.status < 300) {
    req.session.flash = { message: 'Skill disabled', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to disable skill', type: 'danger' };
  }
  res.redirect('/skills');
});

router.post('/skills/:id/uninstall', requireAuth, async (req, res) => {
  const result = await apiDelete(`/api/engine/community/skills/${req.params.id}/uninstall`, req.session.token);

  if (result.status < 300) {
    req.session.flash = { message: 'Skill uninstalled', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to uninstall skill', type: 'danger' };
  }
  res.redirect('/skills');
});

module.exports = router;
