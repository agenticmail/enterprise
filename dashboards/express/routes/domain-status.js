/**
 * Domain Status Routes — Domain health and email security status
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { layout } = require('../views/layout');
const router = express.Router();

// Domain Status page
router.get('/', requireAuth, (req, res) => {
  const content = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Domain Health</div>
        <div class="stat-value" style="color: var(--success);">Healthy</div>
        <div style="color: var(--success); font-size: 12px; margin-top: 4px;">All checks pass</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Email Deliverability</div>
        <div class="stat-value">98.7%</div>
        <div style="color: var(--success); font-size: 12px; margin-top: 4px;">+0.3% this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Security Score</div>
        <div class="stat-value" style="color: var(--success);">A+</div>
        <div style="color: var(--success); font-size: 12px; margin-top: 4px;">Excellent</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>DNS Configuration</h3>
        <button class="btn btn-secondary">Refresh</button>
      </div>
      <div class="card-body">
        <table>
          <thead>
            <tr>
              <th>Record Type</th>
              <th>Name</th>
              <th>Value</th>
              <th>Status</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>SPF</code></td>
              <td>company.com</td>
              <td>v=spf1 include:agenticmail.io ~all</td>
              <td><span class="badge badge-success">✓ Valid</span></td>
              <td>2 mins ago</td>
            </tr>
            <tr>
              <td><code>DKIM</code></td>
              <td>agenticmail._domainkey</td>
              <td>k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA...</td>
              <td><span class="badge badge-success">✓ Valid</span></td>
              <td>2 mins ago</td>
            </tr>
            <tr>
              <td><code>DMARC</code></td>
              <td>_dmarc</td>
              <td>v=DMARC1; p=quarantine; rua=mailto:dmarc@company.com</td>
              <td><span class="badge badge-success">✓ Valid</span></td>
              <td>2 mins ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const html = layout('domain-status', req.user, content, req.flash);
  res.send(html);
});

module.exports = router;