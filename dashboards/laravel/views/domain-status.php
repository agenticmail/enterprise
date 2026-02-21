<?php
/**
 * Domain Status page - Domain health and email security status
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Domain Health</div>
        <div class="stat-value" style="color: var(--success);">Healthy</div>
        <div class="stat-change" style="color: var(--success);">All checks pass</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Email Deliverability</div>
        <div class="stat-value">98.7%</div>
        <div class="stat-change" style="color: var(--success);">+0.3% this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Security Score</div>
        <div class="stat-value" style="color: var(--success);">A+</div>
        <div class="stat-change" style="color: var(--success);">Excellent</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>DNS Configuration</h3>
        <button class="btn btn-secondary">Refresh</button>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Record Type</th>
                    <th>Name</th>
                    <th>Value</th>
                    <th>Status</th>
                    <th>Last Checked</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code>SPF</code></td>
                    <td>company.com</td>
                    <td>v=spf1 include:agenticmail.io ~all</td>
                    <td><span class="badge badge-success">✓ Valid</span></td>
                    <td>2 mins ago</td>
                </tr>
                <tr>
                    <td><code>DKIM</code></td>
                    <td>agenticmail._domainkey</td>
                    <td>k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA...</td>
                    <td><span class="badge badge-success">✓ Valid</span></td>
                    <td>2 mins ago</td>
                </tr>
                <tr>
                    <td><code>DMARC</code></td>
                    <td>_dmarc</td>
                    <td>v=DMARC1; p=quarantine; rua=mailto:dmarc@company.com</td>
                    <td><span class="badge badge-success">✓ Valid</span></td>
                    <td>2 mins ago</td>
                </tr>
                <tr>
                    <td><code>MX</code></td>
                    <td>company.com</td>
                    <td>10 mail.agenticmail.io</td>
                    <td><span class="badge badge-success">✓ Valid</span></td>
                    <td>2 mins ago</td>
                </tr>
                <tr>
                    <td><code>TXT</code></td>
                    <td>_agenticmail</td>
                    <td>agenticmail-verification=abc123def456</td>
                    <td><span class="badge badge-success">✓ Valid</span></td>
                    <td>2 mins ago</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
    <div class="card">
        <div class="card-header">
            <h3>Blacklist Status</h3>
            <button class="btn btn-secondary">Check Now</button>
        </div>
        <div class="card-body">
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Spamhaus SBL</span>
                    <span class="badge badge-success">Clean</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Spamhaus XBL</span>
                    <span class="badge badge-success">Clean</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Spamhaus CSS</span>
                    <span class="badge badge-success">Clean</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>SURBL</span>
                    <span class="badge badge-success">Clean</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Barracuda</span>
                    <span class="badge badge-success">Clean</span>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-header">
            <h3>Certificate Status</h3>
            <button class="btn btn-secondary">Renew</button>
        </div>
        <div class="card-body">
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <strong style="font-size: 13px;">SSL Certificate</strong>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                        Issued by: Let's Encrypt<br>
                        Valid until: March 15, 2025<br>
                        <span class="badge badge-success" style="margin-top: 4px;">Valid</span>
                    </div>
                </div>
                <div>
                    <strong style="font-size: 13px;">Domain Verification</strong>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                        Last verified: 1 hour ago<br>
                        Next check: In 23 hours<br>
                        <span class="badge badge-success" style="margin-top: 4px;">Verified</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <h3>Email Reputation</h3>
        <button class="btn btn-secondary">View Report</button>
    </div>
    <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div style="text-align: center; padding: 16px;">
                <div style="font-size: 24px; font-weight: 700; color: var(--success);">95</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Sender Score</div>
            </div>
            <div style="text-align: center; padding: 16px;">
                <div style="font-size: 24px; font-weight: 700; color: var(--success);">98.7%</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Delivery Rate</div>
            </div>
            <div style="text-align: center; padding: 16px;">
                <div style="font-size: 24px; font-weight: 700; color: var(--success);">0.2%</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Bounce Rate</div>
            </div>
            <div style="text-align: center; padding: 16px;">
                <div style="font-size: 24px; font-weight: 700; color: var(--success);">0.1%</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Complaint Rate</div>
            </div>
        </div>
    </div>
</div>