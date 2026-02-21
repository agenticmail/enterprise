/**
 * Skill Connections page - Manage connections between skills and agents
 */
function renderSkillConnections() {
  return `
    <div class="page-title">Skill Connections</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Active Connections</div>
        <div class="stat-value">156</div>
        <div class="stat-change" style="color: var(--success)">+8 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Skill Networks</div>
        <div class="stat-value">23</div>
        <div class="stat-change" style="color: var(--success)">+2 new</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cross-Agent Skills</div>
        <div class="stat-value">47</div>
        <div class="stat-change" style="color: var(--text-muted)">Shared skills</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Connection Health</div>
        <div class="stat-value" style="color: var(--success)">98%</div>
        <div class="stat-change" style="color: var(--success)">Excellent</div>
      </div>
    </div>

    <div style="display: flex; gap: 16px; margin-bottom: 24px; align-items: center;">
      <input class="input" placeholder="Search connections..." style="flex: 1;">
      <select class="input" style="width: auto;">
        <option>All Agents</option>
        <option>Alice</option>
        <option>Bob</option>
        <option>Charlie</option>
        <option>Diana</option>
      </select>
      <select class="input" style="width: auto;">
        <option>All Skills</option>
        <option>Email Processing</option>
        <option>Data Analysis</option>
        <option>Customer Support</option>
        <option>API Integration</option>
      </select>
      <button class="btn btn-primary">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
        Create Connection
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Connection Map</h3>
        <div>
          <button class="btn btn-secondary">View Network</button>
          <button class="btn btn-secondary" style="margin-left: 8px;">Export</button>
        </div>
      </div>
      <div class="card-body">
        <div style="background: var(--bg-tertiary); border-radius: var(--radius); padding: 40px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 16px;">
            Interactive skill connection visualization would be displayed here
          </div>
          <button class="btn btn-secondary">Launch Network Viewer</button>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; margin: 0 auto 12px;">A</div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">Alice</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Customer Support Agent</div>
            <div style="font-size: 12px;">
              <span class="badge badge-primary" style="margin-right: 4px;">Email</span>
              <span class="badge badge-success" style="margin-right: 4px;">Chat</span>
              <span class="badge badge-info">Analytics</span>
            </div>
          </div>
          
          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; margin: 0 auto 12px;">B</div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">Bob</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Data Analyst</div>
            <div style="font-size: 12px;">
              <span class="badge badge-info" style="margin-right: 4px;">Analytics</span>
              <span class="badge badge-warning" style="margin-right: 4px;">Reports</span>
              <span class="badge badge-primary">API</span>
            </div>
          </div>
          
          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; margin: 0 auto 12px;">C</div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">Charlie</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Integration Specialist</div>
            <div style="font-size: 12px;">
              <span class="badge badge-primary" style="margin-right: 4px;">API</span>
              <span class="badge badge-danger" style="margin-right: 4px;">Security</span>
              <span class="badge badge-info">Webhooks</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <div class="card-header">
        <h3>Active Connections</h3>
        <div>
          <button class="btn btn-secondary">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 14.25V1.75a.75.75 0 0 1 1.5 0v12.5a.75.75 0 0 1-1.5 0zM8.5 1.75a.75.75 0 0 0-1.5 0v12.5a.75.75 0 0 0 1.5 0V1.75zM13 1.75a.75.75 0 0 0-1.5 0v12.5a.75.75 0 0 0 1.5 0V1.75z"/>
            </svg>
            Filter
          </button>
        </div>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Connection</th>
                <th>Skill</th>
                <th>Type</th>
                <th>Usage</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">A</div>
                    <span>Alice</span>
                    <svg width="12" height="12" fill="currentColor" style="color: var(--text-muted);">
                      <path d="M4.5 1a.5.5 0 0 1 .5.5V6h5.5a.5.5 0 0 1 0 1H5v4.5a.5.5 0 0 1-1 0V7H.5a.5.5 0 0 1 0-1H4V1.5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">B</div>
                    <span>Bob</span>
                  </div>
                </td>
                <td>
                  <div>
                    <div style="font-weight: 600;">Data Analytics</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Shared analytics processing</div>
                  </div>
                </td>
                <td><span class="badge badge-primary">Bidirectional</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">847</div>
                  <div style="font-size: 11px; color: var(--text-muted);">calls</div>
                </td>
                <td><span class="badge badge-success">Active</span></td>
                <td>5 mins ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Configure</button>
                  <button class="btn btn-sm btn-danger">Disconnect</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">B</div>
                    <span>Bob</span>
                    <svg width="12" height="12" fill="currentColor" style="color: var(--text-muted);">
                      <path d="M4.5 1a.5.5 0 0 1 .5.5V6h5.5a.5.5 0 0 1 0 1H5v4.5a.5.5 0 0 1-1 0V7H.5a.5.5 0 0 1 0-1H4V1.5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                    <span>Charlie</span>
                  </div>
                </td>
                <td>
                  <div>
                    <div style="font-weight: 600;">API Integration</div>
                    <div style="font-size: 11px; color: var(--text-muted);">External service connections</div>
                  </div>
                </td>
                <td><span class="badge badge-info">Unidirectional</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">234</div>
                  <div style="font-size: 11px; color: var(--text-muted);">calls</div>
                </td>
                <td><span class="badge badge-success">Active</span></td>
                <td>12 mins ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Configure</button>
                  <button class="btn btn-sm btn-danger">Disconnect</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">A</div>
                    <span>Alice</span>
                    <svg width="12" height="12" fill="currentColor" style="color: var(--text-muted);">
                      <path d="M4.5 1a.5.5 0 0 1 .5.5V6h5.5a.5.5 0 0 1 0 1H5v4.5a.5.5 0 0 1-1 0V7H.5a.5.5 0 0 1 0-1H4V1.5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                    <span>Charlie</span>
                  </div>
                </td>
                <td>
                  <div>
                    <div style="font-weight: 600;">Security Scanning</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Email security validation</div>
                  </div>
                </td>
                <td><span class="badge badge-warning">On-demand</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">56</div>
                  <div style="font-size: 11px; color: var(--text-muted);">calls</div>
                </td>
                <td><span class="badge badge-success">Active</span></td>
                <td>1 hour ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Configure</button>
                  <button class="btn btn-sm btn-danger">Disconnect</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">D</div>
                    <span>Diana</span>
                    <svg width="12" height="12" fill="currentColor" style="color: var(--text-muted);">
                      <path d="M4.5 1a.5.5 0 0 1 .5.5V6h5.5a.5.5 0 0 1 0 1H5v4.5a.5.5 0 0 1-1 0V7H.5a.5.5 0 0 1 0-1H4V1.5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">A</div>
                    <span>Alice</span>
                  </div>
                </td>
                <td>
                  <div>
                    <div style="font-weight: 600;">Template Generation</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Dynamic email templates</div>
                  </div>
                </td>
                <td><span class="badge badge-primary">Bidirectional</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">123</div>
                  <div style="font-size: 11px; color: var(--text-muted);">calls</div>
                </td>
                <td><span class="badge badge-warning">Idle</span></td>
                <td>2 hours ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Configure</button>
                  <button class="btn btn-sm btn-danger">Disconnect</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                    <span>Charlie</span>
                    <svg width="12" height="12" fill="currentColor" style="color: var(--text-muted);">
                      <path d="M4.5 1a.5.5 0 0 1 .5.5V6h5.5a.5.5 0 0 1 0 1H5v4.5a.5.5 0 0 1-1 0V7H.5a.5.5 0 0 1 0-1H4V1.5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">D</div>
                    <span>Diana</span>
                  </div>
                </td>
                <td>
                  <div>
                    <div style="font-weight: 600;">Webhook Processing</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Real-time event handling</div>
                  </div>
                </td>
                <td><span class="badge badge-info">Unidirectional</span></td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">445</div>
                  <div style="font-size: 11px; color: var(--text-muted);">calls</div>
                </td>
                <td><span class="badge badge-danger">Error</span></td>
                <td>3 hours ago</td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">Debug</button>
                  <button class="btn btn-sm btn-danger">Disconnect</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export { renderSkillConnections };