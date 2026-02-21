/**
 * Knowledge Routes — Knowledge base management
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { layout } = require('../views/layout');
const router = express.Router();

// Knowledge page
router.get('/', requireAuth, (req, res) => {
  const content = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Knowledge Bases</div>
        <div class="stat-value">7</div>
        <div style="color: var(--success); font-size: 12px; margin-top: 4px;">+1 this month</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Documents</div>
        <div class="stat-value">1,247</div>
        <div style="color: var(--success); font-size: 12px; margin-top: 4px;">+89 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Storage Used</div>
        <div class="stat-value">2.3GB</div>
        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">of 10GB</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Knowledge Bases</h3>
        <button class="btn btn-primary">+ New Knowledge Base</button>
      </div>
      <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
          <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <h4 style="font-size: 14px; font-weight: 600;">Customer Support</h4>
              <span class="badge badge-success">Active</span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
              FAQs, troubleshooting guides, and customer service procedures for support agents.
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
              <span>347 documents</span>
              <span>Updated 2 hours ago</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">Used by:</span>
                <span style="font-size: 11px; font-weight: 600;">Alice, Bob, Charlie</span>
              </div>
              <button class="btn btn-sm btn-secondary">Manage</button>
            </div>
          </div>

          <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <h4 style="font-size: 14px; font-weight: 600;">Product Documentation</h4>
              <span class="badge badge-success">Active</span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
              Technical documentation, API references, and integration guides for developers.
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">Used by:</span>
                <span style="font-size: 11px; font-weight: 600;">Diana, Eve</span>
              </div>
              <button class="btn btn-sm btn-secondary">Manage</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const html = layout('knowledge', req.user, content, req.flash);
  res.send(html);
});

module.exports = router;