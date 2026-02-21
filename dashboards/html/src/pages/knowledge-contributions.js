/**
 * Knowledge Contributions page - Manage community knowledge contributions
 */
function renderKnowledgeContributions() {
  return `
    <div class="page-title">Knowledge Contributions</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total Contributions</div>
        <div class="stat-value">847</div>
        <div class="stat-change" style="color: var(--success)">+12 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Published</div>
        <div class="stat-value">623</div>
        <div class="stat-change" style="color: var(--success)">73% approval rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Review</div>
        <div class="stat-value">34</div>
        <div class="stat-change" style="color: var(--warning)">Needs attention</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Contributors</div>
        <div class="stat-value">89</div>
        <div class="stat-change" style="color: var(--success)">+5 new this week</div>
      </div>
    </div>

    <div style="display: flex; gap: 16px; margin-bottom: 24px; align-items: center;">
      <input class="input" placeholder="Search contributions..." style="flex: 1;">
      <select class="input" style="width: auto;">
        <option>All Status</option>
        <option>Pending</option>
        <option>Published</option>
        <option>Rejected</option>
        <option>Draft</option>
      </select>
      <select class="input" style="width: auto;">
        <option>All Categories</option>
        <option>Company Policies</option>
        <option>Product Information</option>
        <option>Customer Support</option>
        <option>Technical Docs</option>
      </select>
      <button class="btn btn-primary">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
        New Contribution
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Recent Contributions</h3>
        <div>
          <button class="btn btn-secondary">Review Queue</button>
          <button class="btn btn-secondary" style="margin-left: 8px;">Export Data</button>
        </div>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Contributor</th>
                <th>Category</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">New Product Pricing Guide</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Updated pricing structure for Q2 2024</div>
                  </div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">SM</div>
                    <div>
                      <div style="font-size: 13px; font-weight: 500;">Sarah Miller</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Product Manager</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-success">Product Information</span></td>
                <td><span class="badge badge-warning">Pending Review</span></td>
                <td>2 hours ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Reject</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Customer Onboarding Checklist</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Step-by-step guide for new customer setup</div>
                  </div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">JD</div>
                    <div>
                      <div style="font-size: 13px; font-weight: 500;">John Doe</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Support Lead</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-warning">Customer Support</span></td>
                <td><span class="badge badge-success">Published</span></td>
                <td>5 hours ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">View</button>
                  <button class="btn btn-sm btn-secondary">Edit</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">API Rate Limiting Documentation</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Technical details on API usage limits</div>
                  </div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">AJ</div>
                    <div>
                      <div style="font-size: 13px; font-weight: 500;">Alex Johnson</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Developer</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-info">Technical Docs</span></td>
                <td><span class="badge badge-warning">Pending Review</span></td>
                <td>1 day ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Reject</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Security Incident Response</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Emergency procedures for security breaches</div>
                  </div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--danger-soft); color: var(--danger); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">LS</div>
                    <div>
                      <div style="font-size: 13px; font-weight: 500;">Lisa Smith</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Security Officer</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-danger">Security</span></td>
                <td><span class="badge badge-success">Published</span></td>
                <td>2 days ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">View</button>
                  <button class="btn btn-sm btn-secondary">Edit</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Email Template Best Practices</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Guidelines for creating effective email templates</div>
                  </div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">MW</div>
                    <div>
                      <div style="font-size: 13px; font-weight: 500;">Mike Wilson</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Marketing</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-primary">Company Policies</span></td>
                <td>
                  <span class="badge" style="background: var(--text-muted); color: white;">Draft</span>
                </td>
                <td>3 days ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Review</button>
                  <button class="btn btn-sm btn-secondary">Contact</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
      <div class="card">
        <div class="card-header">
          <h3>Top Contributors</h3>
        </div>
        <div class="card-body">
          <div style="space-y: 12px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">SM</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">Sarah Miller</div>
                <div style="font-size: 11px; color: var(--text-muted);">Product Manager</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 13px; font-weight: 600;">47</div>
                <div style="font-size: 11px; color: var(--text-muted);">contributions</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">JD</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">John Doe</div>
                <div style="font-size: 11px; color: var(--text-muted);">Support Lead</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 13px; font-weight: 600;">34</div>
                <div style="font-size: 11px; color: var(--text-muted);">contributions</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">AJ</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">Alex Johnson</div>
                <div style="font-size: 11px; color: var(--text-muted);">Developer</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 13px; font-weight: 600;">28</div>
                <div style="font-size: 11px; color: var(--text-muted);">contributions</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--danger-soft); color: var(--danger); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">LS</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">Lisa Smith</div>
                <div style="font-size: 11px; color: var(--text-muted);">Security Officer</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 13px; font-weight: 600;">23</div>
                <div style="font-size: 11px; color: var(--text-muted);">contributions</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">MW</div>
              <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 600;">Mike Wilson</div>
                <div style="font-size: 11px; color: var(--text-muted);">Marketing</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 13px; font-weight: 600;">19</div>
                <div style="font-size: 11px; color: var(--text-muted);">contributions</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Review Activity</h3>
        </div>
        <div class="card-body">
          <div style="space-y: 12px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Security documentation approved</div>
                <div style="font-size: 11px; color: var(--text-muted);">15 minutes ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--warning);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Pricing guide needs revision</div>
                <div style="font-size: 11px; color: var(--text-muted);">32 minutes ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">API documentation published</div>
                <div style="font-size: 11px; color: var(--text-muted);">1 hour ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--danger);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Template guide rejected</div>
                <div style="font-size: 11px; color: var(--text-muted);">2 hours ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">New contribution submitted</div>
                <div style="font-size: 11px; color: var(--text-muted);">3 hours ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export { renderKnowledgeContributions };