<?php
/**
 * Knowledge page - Knowledge base management
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Knowledge Bases</div>
        <div class="stat-value">7</div>
        <div class="stat-change" style="color: var(--success)">+1 this month</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Total Documents</div>
        <div class="stat-value">1,247</div>
        <div class="stat-change" style="color: var(--success)">+89 this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Storage Used</div>
        <div class="stat-value">2.3GB</div>
        <div class="stat-change" style="color: var(--text-muted)">of 10GB</div>
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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
                    <span>189 documents</span>
                    <span>Updated 1 day ago</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 11px; color: var(--text-muted);">Used by:</span>
                        <span style="font-size: 11px; font-weight: 600;">Diana, Eve</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Manage</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">HR Policies</h4>
                    <span class="badge badge-success">Active</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Employee handbook, policies, procedures, and HR-related information.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
                    <span>67 documents</span>
                    <span>Updated 3 days ago</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 11px; color: var(--text-muted);">Used by:</span>
                        <span style="font-size: 11px; font-weight: 600;">Frank</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Manage</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Marketing Materials</h4>
                    <span class="badge badge-warning">Syncing</span>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Brand guidelines, marketing templates, and campaign resources.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
                    <span>234 documents</span>
                    <span>Updated 1 hour ago</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 11px; color: var(--text-muted);">Used by:</span>
                        <span style="font-size: 11px; font-weight: 600;">Grace, Henry</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Manage</button>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <h3>Recent Activity</h3>
        <button class="btn btn-secondary">View All</button>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Action</th>
                    <th>Knowledge Base</th>
                    <th>Document</th>
                    <th>User</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><span class="badge badge-success">Added</span></td>
                    <td>Customer Support</td>
                    <td>New billing FAQ section</td>
                    <td>Alice</td>
                    <td>2 hours ago</td>
                </tr>
                <tr>
                    <td><span class="badge badge-info">Updated</span></td>
                    <td>Product Documentation</td>
                    <td>API Rate Limiting Guide</td>
                    <td>Diana</td>
                    <td>1 day ago</td>
                </tr>
                <tr>
                    <td><span class="badge badge-danger">Deleted</span></td>
                    <td>HR Policies</td>
                    <td>Outdated vacation policy</td>
                    <td>Frank</td>
                    <td>3 days ago</td>
                </tr>
                <tr>
                    <td><span class="badge badge-primary">Created</span></td>
                    <td>Marketing Materials</td>
                    <td>Q1 Campaign Templates</td>
                    <td>Grace</td>
                    <td>1 week ago</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>