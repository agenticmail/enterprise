/**
 * Community Skills page - Browse and install skills from the community
 */
function renderCommunitySkills() {
  return `
    <div class="page-title">Community Skills</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Available Skills</div>
        <div class="stat-value">1,247</div>
        <div class="stat-change" style="color: var(--success)">+23 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Installed</div>
        <div class="stat-value">18</div>
        <div class="stat-change" style="color: var(--success)">+3 this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Updates Available</div>
        <div class="stat-value">5</div>
        <div class="stat-change" style="color: var(--warning)">Requires attention</div>
      </div>
    </div>

    <div style="display: flex; gap: 16px; margin-bottom: 24px; align-items: center;">
      <input class="input" placeholder="Search skills..." style="flex: 1;">
      <select class="input" style="width: auto;">
        <option>All Categories</option>
        <option>Communication</option>
        <option>Data Analysis</option>
        <option>Automation</option>
        <option>Security</option>
        <option>Integration</option>
      </select>
      <select class="input" style="width: auto;">
        <option>Most Popular</option>
        <option>Recently Added</option>
        <option>Most Downloaded</option>
        <option>Highest Rated</option>
      </select>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
      <!-- Skill Card 1 -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Advanced Email Templates</h3>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              by AgenticMail Team
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="font-size: 12px; color: var(--warning);">★★★★★</span>
            <span style="font-size: 11px; color: var(--text-muted);">(248)</span>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Create professional email templates with dynamic content, conditional blocks, and advanced formatting.
          </p>
          <div style="display: flex; gap: 4px; margin-bottom: 12px;">
            <span class="badge badge-primary">Communication</span>
            <span class="badge badge-info">Templates</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            <span>1.2k downloads</span>
            <span>Updated 2 days ago</span>
          </div>
          <button class="btn btn-primary" style="width: 100%;">Install</button>
        </div>
      </div>

      <!-- Skill Card 2 -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Data Visualization</h3>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              by DataViz Inc
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="font-size: 12px; color: var(--warning);">★★★★☆</span>
            <span style="font-size: 11px; color: var(--text-muted);">(156)</span>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Generate beautiful charts, graphs, and interactive dashboards from your data sources.
          </p>
          <div style="display: flex; gap: 4px; margin-bottom: 12px;">
            <span class="badge badge-success">Data Analysis</span>
            <span class="badge badge-info">Charts</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            <span>856 downloads</span>
            <span>Updated 5 days ago</span>
          </div>
          <button class="btn btn-primary" style="width: 100%;">Install</button>
        </div>
      </div>

      <!-- Skill Card 3 -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Slack Integration</h3>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              by Slack
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="font-size: 12px; color: var(--warning);">★★★★★</span>
            <span style="font-size: 11px; color: var(--text-muted);">(492)</span>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Send messages, create channels, and manage Slack workspaces directly from your agents.
          </p>
          <div style="display: flex; gap: 4px; margin-bottom: 12px;">
            <span class="badge badge-warning">Integration</span>
            <span class="badge badge-primary">Communication</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            <span>2.1k downloads</span>
            <span>Updated 1 day ago</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn" style="background: var(--success); color: white; flex: 1;">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
              </svg>
              Installed
            </button>
            <button class="btn btn-secondary" style="width: auto;">Update</button>
          </div>
        </div>
      </div>

      <!-- Skill Card 4 -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Security Scanner</h3>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              by SecureTech
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="font-size: 12px; color: var(--warning);">★★★★☆</span>
            <span style="font-size: 11px; color: var(--text-muted);">(89)</span>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Scan files, URLs, and network connections for security threats and vulnerabilities.
          </p>
          <div style="display: flex; gap: 4px; margin-bottom: 12px;">
            <span class="badge badge-danger">Security</span>
            <span class="badge badge-warning">Scanning</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            <span>234 downloads</span>
            <span>Updated 1 week ago</span>
          </div>
          <button class="btn btn-primary" style="width: 100%;">Install</button>
        </div>
      </div>

      <!-- Skill Card 5 -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Task Automation</h3>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              by AutoFlow
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="font-size: 12px; color: var(--warning);">★★★★★</span>
            <span style="font-size: 11px; color: var(--text-muted);">(367)</span>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Automate repetitive tasks with workflow builders, schedulers, and trigger systems.
          </p>
          <div style="display: flex; gap: 4px; margin-bottom: 12px;">
            <span class="badge badge-info">Automation</span>
            <span class="badge badge-success">Workflow</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            <span>1.5k downloads</span>
            <span>Updated 3 days ago</span>
          </div>
          <button class="btn btn-primary" style="width: 100%;">Install</button>
        </div>
      </div>

      <!-- Skill Card 6 -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3>API Documentation</h3>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              by DevTools Pro
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="font-size: 12px; color: var(--warning);">★★★☆☆</span>
            <span style="font-size: 11px; color: var(--text-muted);">(73)</span>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Automatically generate comprehensive API documentation from your code and schemas.
          </p>
          <div style="display: flex; gap: 4px; margin-bottom: 12px;">
            <span class="badge badge-info">Documentation</span>
            <span class="badge badge-primary">API</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            <span>189 downloads</span>
            <span>Updated 2 weeks ago</span>
          </div>
          <button class="btn btn-primary" style="width: 100%;">Install</button>
        </div>
      </div>
    </div>
  `;
}

export { renderCommunitySkills };