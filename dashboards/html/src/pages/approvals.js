/**
 * Approvals page - Manage agent action approvals and permissions
 */
function renderApprovals() {
  return `
    <div class="page-title">Approvals</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Pending Approvals</div>
        <div class="stat-value">7</div>
        <div class="stat-change" style="color: var(--warning)">Requires attention</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Approved Today</div>
        <div class="stat-value">23</div>
        <div class="stat-change" style="color: var(--success)">+15% vs yesterday</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Auto-approved</div>
        <div class="stat-value">156</div>
        <div class="stat-change" style="color: var(--text-muted)">Automated</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Pending Approvals</h3>
        <div>
          <button class="btn btn-secondary">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
            </svg>
            Approve All
          </button>
        </div>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Action</th>
                <th>Details</th>
                <th>Risk Level</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">A</div>
                    Alice
                  </div>
                </td>
                <td>Send Email</td>
                <td>Marketing campaign to 5,000 subscribers</td>
                <td><span class="badge badge-warning">Medium</span></td>
                <td>5 mins ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Deny</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">B</div>
                    Bob
                  </div>
                </td>
                <td>Database Update</td>
                <td>Update customer preferences table</td>
                <td><span class="badge badge-danger">High</span></td>
                <td>12 mins ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Deny</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                    Charlie
                  </div>
                </td>
                <td>API Call</td>
                <td>Call external payment processing API</td>
                <td><span class="badge badge-danger">High</span></td>
                <td>18 mins ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Deny</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">D</div>
                    Diana
                  </div>
                </td>
                <td>File Access</td>
                <td>Read sensitive customer data files</td>
                <td><span class="badge badge-warning">Medium</span></td>
                <td>25 mins ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Deny</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">E</div>
                    Eve
                  </div>
                </td>
                <td>System Command</td>
                <td>Execute system maintenance script</td>
                <td><span class="badge badge-success">Low</span></td>
                <td>32 mins ago</td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Approve</button>
                  <button class="btn btn-sm btn-danger">Deny</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <div class="card-header">
        <h3>Approval Rules</h3>
        <button class="btn btn-secondary">Add Rule</button>
      </div>
      <div class="card-body">
        <div class="empty-state">
          <h3>No custom approval rules configured</h3>
          <p>Set up automatic approval rules to streamline your workflow</p>
          <button class="btn btn-secondary">Create Rule</button>
        </div>
      </div>
    </div>
  `;
}

export { renderApprovals };