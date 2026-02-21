/**
 * Workforce page - Manage agent workforce and deployment
 */
function renderWorkforce() {
  return `
    <div class="page-title">Agent Workforce</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Active Agents</div>
        <div class="stat-value">24</div>
        <div class="stat-change" style="color: var(--success)">+3 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">CPU Usage</div>
        <div class="stat-value">67%</div>
        <div class="stat-change" style="color: var(--warning)">Moderate load</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tasks Completed</div>
        <div class="stat-value">1,847</div>
        <div class="stat-change" style="color: var(--success)">+18% today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Efficiency Score</div>
        <div class="stat-value" style="color: var(--success)">94%</div>
        <div class="stat-change" style="color: var(--success)">Excellent</div>
      </div>
    </div>

    <div style="display: flex; gap: 16px; margin-bottom: 24px; align-items: center;">
      <input class="input" placeholder="Search agents..." style="flex: 1;">
      <select class="input" style="width: auto;">
        <option>All Status</option>
        <option>Running</option>
        <option>Idle</option>
        <option>Stopped</option>
        <option>Error</option>
      </select>
      <select class="input" style="width: auto;">
        <option>All Departments</option>
        <option>Customer Support</option>
        <option>Sales</option>
        <option>Marketing</option>
        <option>Operations</option>
      </select>
      <button class="btn btn-primary">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
        Deploy Agent
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Agent Fleet</h3>
        <div>
          <button class="btn btn-secondary">Start All</button>
          <button class="btn btn-secondary" style="margin-left: 8px;">Stop All</button>
          <button class="btn btn-secondary" style="margin-left: 8px;">Refresh</button>
        </div>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Department</th>
                <th>Status</th>
                <th>Tasks</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Uptime</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">A1</div>
                    <div>
                      <div style="font-weight: 600;">Alice Support</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Customer Service Agent</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-primary">Customer Support</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
                    <span class="status-running">Running</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">247</div>
                  <div style="font-size: 11px; color: var(--text-muted);">completed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">45%</div>
                  <div style="font-size: 11px; color: var(--text-muted);">2.1 GHz</div>
                </td>
                <td>
                  <div style="font-size: 13px;">1.2 GB</div>
                  <div style="font-size: 11px; color: var(--text-muted);">of 4 GB</div>
                </td>
                <td>
                  <div style="font-size: 13px;">12h 34m</div>
                  <div style="font-size: 11px; color: var(--text-muted);">stable</div>
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">View</button>
                  <button class="btn btn-sm btn-danger">Stop</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">B1</div>
                    <div>
                      <div style="font-weight: 600;">Bob Analytics</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Data Analysis Agent</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-info">Operations</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
                    <span class="status-running">Running</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">189</div>
                  <div style="font-size: 11px; color: var(--text-muted);">completed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">78%</div>
                  <div style="font-size: 11px; color: var(--text-muted);">3.2 GHz</div>
                </td>
                <td>
                  <div style="font-size: 13px;">2.8 GB</div>
                  <div style="font-size: 11px; color: var(--text-muted);">of 8 GB</div>
                </td>
                <td>
                  <div style="font-size: 13px;">8h 12m</div>
                  <div style="font-size: 11px; color: var(--text-muted);">stable</div>
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">View</button>
                  <button class="btn btn-sm btn-danger">Stop</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">C1</div>
                    <div>
                      <div style="font-weight: 600;">Charlie Sales</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Sales Assistant Agent</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-success">Sales</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);"></div>
                    <span class="status-stopped">Idle</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">34</div>
                  <div style="font-size: 11px; color: var(--text-muted);">completed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">12%</div>
                  <div style="font-size: 11px; color: var(--text-muted);">0.8 GHz</div>
                </td>
                <td>
                  <div style="font-size: 13px;">0.4 GB</div>
                  <div style="font-size: 11px; color: var(--text-muted);">of 4 GB</div>
                </td>
                <td>
                  <div style="font-size: 13px;">15h 45m</div>
                  <div style="font-size: 11px; color: var(--text-muted);">idle 2h</div>
                </td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Start</button>
                  <button class="btn btn-sm btn-secondary">View</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">D1</div>
                    <div>
                      <div style="font-weight: 600;">Diana Marketing</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Marketing Agent</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-warning">Marketing</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
                    <span class="status-running">Running</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">92</div>
                  <div style="font-size: 11px; color: var(--text-muted);">completed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">23%</div>
                  <div style="font-size: 11px; color: var(--text-muted);">1.4 GHz</div>
                </td>
                <td>
                  <div style="font-size: 13px;">0.9 GB</div>
                  <div style="font-size: 11px; color: var(--text-muted);">of 4 GB</div>
                </td>
                <td>
                  <div style="font-size: 13px;">6h 23m</div>
                  <div style="font-size: 11px; color: var(--text-muted);">stable</div>
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">View</button>
                  <button class="btn btn-sm btn-danger">Stop</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--danger-soft); color: var(--danger); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">E1</div>
                    <div>
                      <div style="font-weight: 600;">Eve Security</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Security Monitor Agent</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-danger">Security</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--danger);"></div>
                    <span class="status-error">Error</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">156</div>
                  <div style="font-size: 11px; color: var(--text-muted);">completed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">0%</div>
                  <div style="font-size: 11px; color: var(--text-muted);">crashed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">0 GB</div>
                  <div style="font-size: 11px; color: var(--text-muted);">of 4 GB</div>
                </td>
                <td>
                  <div style="font-size: 13px;">0h 0m</div>
                  <div style="font-size: 11px; color: var(--danger);">crashed 1h ago</div>
                </td>
                <td>
                  <button class="btn btn-sm" style="background: var(--success); color: white; margin-right: 4px;">Restart</button>
                  <button class="btn btn-sm btn-secondary">Debug</button>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">F1</div>
                    <div>
                      <div style="font-weight: 600;">Frank Integration</div>
                      <div style="font-size: 11px; color: var(--text-muted);">API Integration Agent</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-info">Operations</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
                    <span class="status-running">Running</span>
                  </div>
                </td>
                <td>
                  <div style="font-size: 13px; font-weight: 600;">78</div>
                  <div style="font-size: 11px; color: var(--text-muted);">completed</div>
                </td>
                <td>
                  <div style="font-size: 13px;">34%</div>
                  <div style="font-size: 11px; color: var(--text-muted);">1.8 GHz</div>
                </td>
                <td>
                  <div style="font-size: 13px;">1.5 GB</div>
                  <div style="font-size: 11px; color: var(--text-muted);">of 4 GB</div>
                </td>
                <td>
                  <div style="font-size: 13px;">4h 56m</div>
                  <div style="font-size: 11px; color: var(--text-muted);">stable</div>
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;">View</button>
                  <button class="btn btn-sm btn-danger">Stop</button>
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
          <h3>Resource Usage</h3>
        </div>
        <div class="card-body">
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 12px;">CPU Usage</span>
              <span style="font-size: 12px; font-weight: 600;">67%</span>
            </div>
            <div style="background: var(--bg-tertiary); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: var(--warning); height: 100%; width: 67%; border-radius: 4px;"></div>
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 12px;">Memory Usage</span>
              <span style="font-size: 12px; font-weight: 600;">45%</span>
            </div>
            <div style="background: var(--bg-tertiary); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: var(--success); height: 100%; width: 45%; border-radius: 4px;"></div>
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 12px;">Network I/O</span>
              <span style="font-size: 12px; font-weight: 600;">23%</span>
            </div>
            <div style="background: var(--bg-tertiary); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: var(--accent); height: 100%; width: 23%; border-radius: 4px;"></div>
            </div>
          </div>
          
          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 12px;">Storage Usage</span>
              <span style="font-size: 12px; font-weight: 600;">78%</span>
            </div>
            <div style="background: var(--bg-tertiary); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: var(--danger); height: 100%; width: 78%; border-radius: 4px;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Performance Metrics</h3>
        </div>
        <div class="card-body">
          <div style="space-y: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <div style="font-size: 13px; font-weight: 600;">Average Response Time</div>
                <div style="font-size: 11px; color: var(--text-muted);">Across all agents</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 16px; font-weight: 700; color: var(--success);">234ms</div>
                <div style="font-size: 11px; color: var(--success);">-12ms from yesterday</div>
              </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <div style="font-size: 13px; font-weight: 600;">Tasks per Hour</div>
                <div style="font-size: 11px; color: var(--text-muted);">Current rate</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 16px; font-weight: 700; color: var(--accent);">847</div>
                <div style="font-size: 11px; color: var(--success);">+23 from last hour</div>
              </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <div style="font-size: 13px; font-weight: 600;">Success Rate</div>
                <div style="font-size: 11px; color: var(--text-muted);">Last 24 hours</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 16px; font-weight: 700; color: var(--success);">98.2%</div>
                <div style="font-size: 11px; color: var(--success);">+0.3% improvement</div>
              </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 13px; font-weight: 600;">Error Rate</div>
                <div style="font-size: 11px; color: var(--text-muted);">Last 24 hours</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 16px; font-weight: 700; color: var(--danger);">1.8%</div>
                <div style="font-size: 11px; color: var(--danger);">+0.3% from yesterday</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export { renderWorkforce };