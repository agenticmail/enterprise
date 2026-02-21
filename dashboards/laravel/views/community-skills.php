<?php
/**
 * Community Skills page - Browse and install community-contributed skills
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Available Skills</div>
        <div class="stat-value">1,247</div>
        <div class="stat-change" style="color: var(--success)">+23 this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Installed</div>
        <div class="stat-value">18</div>
        <div class="stat-change" style="color: var(--success)">+2 this month</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Updates Available</div>
        <div class="stat-value">3</div>
        <div class="stat-change" style="color: var(--warning)">Action needed</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>Skill Marketplace</h3>
        <div style="display: flex; gap: 8px;">
            <input type="text" class="input" placeholder="Search skills..." style="width: 200px;">
            <select class="input" style="width: auto;">
                <option>All Categories</option>
                <option>Communication</option>
                <option>Data Analysis</option>
                <option>Integration</option>
                <option>Automation</option>
            </select>
            <button class="btn btn-primary">Browse All</button>
        </div>
    </div>
    <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Advanced Email Analytics</h4>
                    <span class="badge badge-success">Popular</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Analyze email performance, engagement metrics, and delivery statistics with advanced reporting.
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="font-size: 11px; color: var(--text-muted);">by</span>
                    <strong style="font-size: 11px;">MarketingPro</strong>
                    <div style="margin-left: auto; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px;">⭐</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">4.8 (127)</span>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge badge-primary">Communication</span>
                    <button class="btn btn-sm btn-primary">Install</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">CRM Integration Suite</h4>
                    <span class="badge badge-warning">New</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Connect with Salesforce, HubSpot, and other CRM systems for seamless data sync.
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="font-size: 11px; color: var(--text-muted);">by</span>
                    <strong style="font-size: 11px;">IntegrationCorp</strong>
                    <div style="margin-left: auto; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px;">⭐</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">4.6 (89)</span>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge badge-info">Integration</span>
                    <button class="btn btn-sm btn-primary">Install</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Smart Document Processing</h4>
                    <span class="badge badge-success">Installed</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    AI-powered document analysis, extraction, and processing for various file formats.
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="font-size: 11px; color: var(--text-muted);">by</span>
                    <strong style="font-size: 11px;">DocumentAI</strong>
                    <div style="margin-left: auto; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px;">⭐</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">4.9 (203)</span>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge badge-success">Data Analysis</span>
                    <button class="btn btn-sm btn-secondary">Update Available</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Social Media Manager</h4>
                    <span class="badge badge-primary">Featured</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Manage social media posts, scheduling, and engagement across multiple platforms.
                </p>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="font-size: 11px; color: var(--text-muted);">by</span>
                    <strong style="font-size: 11px;">SocialPro</strong>
                    <div style="margin-left: auto; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px;">⭐</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">4.7 (156)</span>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge badge-warning">Automation</span>
                    <button class="btn btn-sm btn-primary">Install</button>
                </div>
            </div>
        </div>
    </div>
</div>