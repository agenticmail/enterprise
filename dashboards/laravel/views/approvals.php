<?php
/**
 * Approvals page - Pending approvals and approval history
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Pending Approvals</div>
        <div class="stat-value">3</div>
        <div class="stat-change" style="color: var(--warning)">2 urgent</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Approved Today</div>
        <div class="stat-value">12</div>
        <div class="stat-change" style="color: var(--success)">+20% vs yesterday</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Rejected Today</div>
        <div class="stat-value">1</div>
        <div class="stat-change" style="color: var(--text-muted)">Normal</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>Pending Approvals</h3>
        <button class="btn btn-primary">Review All</button>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Request</th>
                    <th>Agent</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Requested</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>Budget Allocation Request</strong><br>
                        <small style="color: var(--text-muted)">Requesting $5,000 for marketing campaign</small>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">F</div>
                            Frank
                        </div>
                    </td>
                    <td><span class="badge badge-primary">Financial</span></td>
                    <td><span class="badge badge-danger">High</span></td>
                    <td>1 hour ago</td>
                    <td>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-sm btn-primary">Approve</button>
                            <button class="btn btn-sm btn-danger">Reject</button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>
                        <strong>New Skill Installation</strong><br>
                        <small style="color: var(--text-muted)">Install advanced analytics skill package</small>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">D</div>
                            Diana
                        </div>
                    </td>
                    <td><span class="badge badge-info">System</span></td>
                    <td><span class="badge badge-warning">Medium</span></td>
                    <td>2 hours ago</td>
                    <td>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-sm btn-primary">Approve</button>
                            <button class="btn btn-sm btn-danger">Reject</button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>
                        <strong>External API Access</strong><br>
                        <small style="color: var(--text-muted)">Request access to CRM integration</small>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                            Charlie
                        </div>
                    </td>
                    <td><span class="badge badge-warning">Security</span></td>
                    <td><span class="badge badge-danger">High</span></td>
                    <td>3 hours ago</td>
                    <td>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-sm btn-primary">Approve</button>
                            <button class="btn btn-sm btn-danger">Reject</button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <h3>Recent Approval History</h3>
        <button class="btn btn-secondary">View All</button>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Request</th>
                    <th>Agent</th>
                    <th>Decision</th>
                    <th>Reviewer</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Email template update</td>
                    <td>Alice</td>
                    <td><span class="badge badge-success">Approved</span></td>
                    <td>Admin</td>
                    <td>30 mins ago</td>
                </tr>
                <tr>
                    <td>Database access request</td>
                    <td>Bob</td>
                    <td><span class="badge badge-success">Approved</span></td>
                    <td>Admin</td>
                    <td>1 hour ago</td>
                </tr>
                <tr>
                    <td>Social media posting</td>
                    <td>Eve</td>
                    <td><span class="badge badge-danger">Rejected</span></td>
                    <td>Admin</td>
                    <td>2 hours ago</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>