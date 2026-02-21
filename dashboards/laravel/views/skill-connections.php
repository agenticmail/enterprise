<?php
/**
 * Skill Connections page - Manage skill integrations and connections
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Active Connections</div>
        <div class="stat-value">14</div>
        <div class="stat-change" style="color: var(--success)">All healthy</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Data Flows</div>
        <div class="stat-value">267</div>
        <div class="stat-change" style="color: var(--success)">+23 this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Failed Connections</div>
        <div class="stat-value">1</div>
        <div class="stat-change" style="color: var(--danger)">Needs attention</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>Skill Network</h3>
        <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary">+ New Connection</button>
            <button class="btn btn-secondary">View Map</button>
        </div>
    </div>
    <div class="card-body">
        <div style="background: var(--bg-tertiary); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 12px; color: var(--text-muted);">🔗</div>
            <p style="color: var(--text-muted); font-size: 13px;">Interactive skill network visualization will be displayed here</p>
            <p style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Showing connections between skills, data flows, and dependencies</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Email → CRM Sync</h4>
                    <span class="badge badge-success">Active</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Automatically sync email interactions with CRM contact records
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px;">
                    <span style="background: var(--accent-soft); color: var(--accent-text); padding: 2px 6px; border-radius: 4px;">Email Processing</span>
                    <span>→</span>
                    <span style="background: var(--success-soft); color: var(--success); padding: 2px 6px; border-radius: 4px;">CRM Integration</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">
                    Last sync: 2 mins ago • 47 records processed
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Analytics → Reporting</h4>
                    <span class="badge badge-success">Active</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Feed analytics data into automated reporting dashboards
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px;">
                    <span style="background: var(--info-soft); color: var(--info); padding: 2px 6px; border-radius: 4px;">Data Analytics</span>
                    <span>→</span>
                    <span style="background: var(--warning-soft); color: var(--warning); padding: 2px 6px; border-radius: 4px;">Report Generator</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">
                    Last update: 1 hour ago • 12 reports generated
                </div>
            </div>

            <div style="border: 1px solid var(--danger); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Slack → Notifications</h4>
                    <span class="badge badge-danger">Failed</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Send agent notifications to Slack channels
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px;">
                    <span style="background: var(--accent-soft); color: var(--accent-text); padding: 2px 6px; border-radius: 4px;">Event Handler</span>
                    <span style="color: var(--danger);">✗</span>
                    <span style="background: var(--danger-soft); color: var(--danger); padding: 2px 6px; border-radius: 4px;">Slack API</span>
                </div>
                <div style="font-size: 11px; color: var(--danger); margin-bottom: 8px;">
                    Error: Invalid webhook URL
                </div>
                <button class="btn btn-sm btn-danger">Fix Connection</button>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Knowledge → Search</h4>
                    <span class="badge badge-success">Active</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Enable intelligent search across knowledge bases
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px;">
                    <span style="background: var(--success-soft); color: var(--success); padding: 2px 6px; border-radius: 4px;">Knowledge Base</span>
                    <span>→</span>
                    <span style="background: var(--info-soft); color: var(--info); padding: 2px 6px; border-radius: 4px;">Search Engine</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">
                    Last indexed: 3 hours ago • 1,247 documents
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <h3>Connection Templates</h3>
        <button class="btn btn-secondary">Browse All</button>
    </div>
    <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px;">
            <div style="border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer;" onclick="this.style.borderColor='var(--accent)'">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">📊 Analytics Pipeline</div>
                <div style="font-size: 11px; color: var(--text-muted);">Connect data sources to analytics and reporting</div>
            </div>
            <div style="border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer;" onclick="this.style.borderColor='var(--accent)'">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">🔔 Alert System</div>
                <div style="font-size: 11px; color: var(--text-muted);">Set up automated alerts and notifications</div>
            </div>
            <div style="border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer;" onclick="this.style.borderColor='var(--accent)'">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">🔄 Data Sync</div>
                <div style="font-size: 11px; color: var(--text-muted);">Bidirectional data synchronization</div>
            </div>
            <div style="border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer;" onclick="this.style.borderColor='var(--accent)'">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">🤖 AI Chain</div>
                <div style="font-size: 11px; color: var(--text-muted);">Chain multiple AI processing steps</div>
            </div>
        </div>
    </div>
</div>

<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <h3>Recent Activity</h3>
        <button class="btn btn-secondary">View Logs</button>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Connection</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>2 mins ago</td>
                    <td>Email → CRM Sync</td>
                    <td>Data processed</td>
                    <td><span class="badge badge-success">Success</span></td>
                    <td>47 contact records updated</td>
                </tr>
                <tr>
                    <td>15 mins ago</td>
                    <td>Slack → Notifications</td>
                    <td>Connection failed</td>
                    <td><span class="badge badge-danger">Error</span></td>
                    <td>Invalid webhook URL</td>
                </tr>
                <tr>
                    <td>1 hour ago</td>
                    <td>Analytics → Reporting</td>
                    <td>Report generated</td>
                    <td><span class="badge badge-success">Success</span></td>
                    <td>Weekly performance report</td>
                </tr>
                <tr>
                    <td>3 hours ago</td>
                    <td>Knowledge → Search</td>
                    <td>Index updated</td>
                    <td><span class="badge badge-success">Success</span></td>
                    <td>1,247 documents indexed</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>