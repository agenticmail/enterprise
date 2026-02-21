/**
 * Knowledge page - Manage knowledge base and agent learning
 */
function renderKnowledge() {
  return `
    <div class="page-title">Knowledge Base</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Knowledge Items</div>
        <div class="stat-value">1,247</div>
        <div class="stat-change" style="color: var(--success)">+23 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Categories</div>
        <div class="stat-value">18</div>
        <div class="stat-change" style="color: var(--text-muted)">No change</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Agent Queries</div>
        <div class="stat-value">5,432</div>
        <div class="stat-change" style="color: var(--success)">+15% this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Auto-learned</div>
        <div class="stat-value">89</div>
        <div class="stat-change" style="color: var(--success)">From interactions</div>
      </div>
    </div>

    <div style="display: flex; gap: 16px; margin-bottom: 24px;">
      <input class="input" placeholder="Search knowledge base..." style="flex: 1;">
      <select class="input" style="width: auto;">
        <option>All Categories</option>
        <option>Company Policies</option>
        <option>Product Information</option>
        <option>Customer Support</option>
        <option>Technical Docs</option>
        <option>Procedures</option>
      </select>
      <button class="btn btn-primary">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
        Add Knowledge
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Recent Knowledge</h3>
        <div>
          <button class="btn btn-secondary">Import</button>
          <button class="btn btn-secondary" style="margin-left: 8px;">Export</button>
        </div>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Type</th>
                <th>Usage</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Customer Refund Policy</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Complete guidelines for processing refunds</div>
                  </div>
                </td>
                <td><span class="badge badge-primary">Company Policies</span></td>
                <td><span class="badge badge-info">Document</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">156</div>
                  <div style="font-size: 11px; color: var(--text-muted);">queries</div>
                </td>
                <td>2 days ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Edit</button>
                  <button class="btn btn-sm btn-danger">Delete</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Product Feature Matrix</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Comparison of features across all plans</div>
                  </div>
                </td>
                <td><span class="badge badge-success">Product Information</span></td>
                <td><span class="badge badge-warning">Spreadsheet</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">89</div>
                  <div style="font-size: 11px; color: var(--text-muted);">queries</div>
                </td>
                <td>5 days ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Edit</button>
                  <button class="btn btn-sm btn-danger">Delete</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">API Integration Guide</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Step-by-step API integration instructions</div>
                  </div>
                </td>
                <td><span class="badge badge-info">Technical Docs</span></td>
                <td><span class="badge badge-info">Document</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">234</div>
                  <div style="font-size: 11px; color: var(--text-muted);">queries</div>
                </td>
                <td>1 week ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Edit</button>
                  <button class="btn btn-sm btn-danger">Delete</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Escalation Procedures</div>
                    <div style="font-size: 11px; color: var(--text-muted);">When and how to escalate customer issues</div>
                  </div>
                </td>
                <td><span class="badge badge-warning">Customer Support</span></td>
                <td><span class="badge badge-info">Document</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">67</div>
                  <div style="font-size: 11px; color: var(--text-muted);">queries</div>
                </td>
                <td>2 weeks ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Edit</button>
                  <button class="btn btn-sm btn-danger">Delete</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div>
                    <div style="font-weight: 600;">Security Best Practices</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Security guidelines and procedures</div>
                  </div>
                </td>
                <td><span class="badge badge-danger">Procedures</span></td>
                <td><span class="badge badge-info">Document</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">123</div>
                  <div style="font-size: 11px; color: var(--text-muted);">queries</div>
                </td>
                <td>3 weeks ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Edit</button>
                  <button class="btn btn-sm btn-danger">Delete</button>
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
          <h3>Popular Queries</h3>
        </div>
        <div class="card-body">
          <div style="space-y: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 13px;">How to process refunds?</div>
              <div style="font-size: 11px; color: var(--text-muted);">234 times</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 13px;">API rate limits</div>
              <div style="font-size: 11px; color: var(--text-muted);">189 times</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 13px;">Pricing plan differences</div>
              <div style="font-size: 11px; color: var(--text-muted);">167 times</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 13px;">Password reset procedure</div>
              <div style="font-size: 11px; color: var(--text-muted);">145 times</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-size: 13px;">Contact information</div>
              <div style="font-size: 11px; color: var(--text-muted);">123 times</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Learning Activity</h3>
        </div>
        <div class="card-body">
          <div style="space-y: 12px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Auto-learned from customer chat</div>
                <div style="font-size: 11px; color: var(--text-muted);">2 hours ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Knowledge updated manually</div>
                <div style="font-size: 11px; color: var(--text-muted);">4 hours ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">New FAQ pattern detected</div>
                <div style="font-size: 11px; color: var(--text-muted);">6 hours ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--warning);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Knowledge gap identified</div>
                <div style="font-size: 11px; color: var(--text-muted);">8 hours ago</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent);"></div>
              <div style="flex: 1;">
                <div style="font-size: 13px;">Bulk import completed</div>
                <div style="font-size: 11px; color: var(--text-muted);">12 hours ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export { renderKnowledge };