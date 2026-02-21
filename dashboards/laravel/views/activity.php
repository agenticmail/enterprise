<?php
/**
 * Activity page - Shows recent agent activity and system events
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Total Events</div>
        <div class="stat-value">2,847</div>
        <div class="stat-change" style="color: var(--success)">+12% this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Agent Actions</div>
        <div class="stat-value">1,923</div>
        <div class="stat-change" style="color: var(--success)">+8% this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">System Events</div>
        <div class="stat-value">924</div>
        <div class="stat-change" style="color: var(--text-muted)">No change</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>Recent Activity</h3>
        <div style="display: flex; gap: 8px;">
            <select class="input" style="width: auto;">
                <option>All Events</option>
                <option>Agent Actions</option>
                <option>System Events</option>
                <option>Security Events</option>
            </select>
            <button class="btn btn-secondary">
                🔍 Filter
            </button>
        </div>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Agent</th>
                    <th>Details</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>2 mins ago</td>
                    <td>Email sent</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">A</div>
                            Alice
                        </div>
                    </td>
                    <td>Sent monthly report to stakeholders</td>
                    <td><span class="badge badge-success">Success</span></td>
                </tr>
                <tr>
                    <td>5 mins ago</td>
                    <td>Knowledge updated</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">B</div>
                            Bob
                        </div>
                    </td>
                    <td>Updated customer service protocols</td>
                    <td><span class="badge badge-success">Success</span></td>
                </tr>
                <tr>
                    <td>12 mins ago</td>
                    <td>Agent deployed</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                            Charlie
                        </div>
                    </td>
                    <td>Deployed to production environment</td>
                    <td><span class="badge badge-success">Success</span></td>
                </tr>
                <tr>
                    <td>18 mins ago</td>
                    <td>Skill learned</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">D</div>
                            Diana
                        </div>
                    </td>
                    <td>Acquired new data analysis skill</td>
                    <td><span class="badge badge-success">Success</span></td>
                </tr>
                <tr>
                    <td>25 mins ago</td>
                    <td>System error</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--danger-soft); color: var(--danger); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">E</div>
                            Eve
                        </div>
                    </td>
                    <td>Failed to connect to external API</td>
                    <td><span class="badge badge-danger">Error</span></td>
                </tr>
                <tr>
                    <td>1 hour ago</td>
                    <td>Approval requested</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">F</div>
                            Frank
                        </div>
                    </td>
                    <td>Requested approval for budget allocation</td>
                    <td><span class="badge badge-warning">Pending</span></td>
                </tr>
            </tbody>
        </table>
    </div>
</div>