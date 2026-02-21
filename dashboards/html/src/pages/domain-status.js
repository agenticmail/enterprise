/**
 * Domain Status page - Monitor email domain health and deliverability
 */
function renderDomainStatus() {
  return `
    <div class="page-title">Domain Status</div>
    
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Domain Health</div>
        <div class="stat-value" style="color: var(--success)">98%</div>
        <div class="stat-change" style="color: var(--success)">Excellent</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Deliverability Score</div>
        <div class="stat-value" style="color: var(--success)">95</div>
        <div class="stat-change" style="color: var(--success)">High</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">DNS Records</div>
        <div class="stat-value" style="color: var(--success)">12/12</div>
        <div class="stat-change" style="color: var(--success)">All valid</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Blacklist Status</div>
        <div class="stat-value" style="color: var(--success)">Clean</div>
        <div class="stat-change" style="color: var(--success)">0 listings</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Domain Configuration</h3>
        <button class="btn btn-secondary">Refresh Status</button>
      </div>
      <div class="card-body">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Primary Domain</h4>
            <div style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius); margin-bottom: 16px;">
              <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">company.agenticmail.io</div>
              <div style="font-size: 12px; color: var(--text-muted);">Configured 45 days ago</div>
            </div>
            
            <div style="margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background: var(--success);"></div>
                <span style="font-size: 13px; font-weight: 500;">DKIM Signing</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-left: 20px;">
                Keys configured and valid
              </div>
            </div>
            
            <div style="margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background: var(--success);"></div>
                <span style="font-size: 13px; font-weight: 500;">SPF Record</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-left: 20px;">
                v=spf1 include:agenticmail.io ~all
              </div>
            </div>
            
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background: var(--success);"></div>
                <span style="font-size: 13px; font-weight: 500;">DMARC Policy</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-left: 20px;">
                p=quarantine; rua=mailto:dmarc@company.com
              </div>
            </div>
          </div>
          
          <div>
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Delivery Statistics</h4>
            <div style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-size: 12px; color: var(--text-muted);">Delivered</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--success);">98.5%</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-size: 12px; color: var(--text-muted);">Bounced</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--warning);">1.2%</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-size: 12px; color: var(--text-muted);">Marked as Spam</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--danger);">0.3%</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="font-size: 12px; color: var(--text-muted);">Unsubscribed</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">0.1%</span>
              </div>
            </div>
            
            <h4 style="font-size: 14px; font-weight: 600; margin: 20px 0 12px;">Reputation Monitoring</h4>
            <div style="space-y: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 12px;">Google Postmaster</span>
                <span class="badge badge-success">Good</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 12px;">Microsoft SNDS</span>
                <span class="badge badge-success">Green</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 12px;">Sender Score</span>
                <span class="badge badge-success">95</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px;">Talos Intelligence</span>
                <span class="badge badge-success">Good</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <div class="card-header">
        <h3>DNS Records</h3>
        <button class="btn btn-secondary">Verify All</button>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Value</th>
                <th>Status</th>
                <th>Last Checked</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="badge badge-info">MX</span></td>
                <td>company.agenticmail.io</td>
                <td>10 mail.agenticmail.io</td>
                <td><span class="badge badge-success">Valid</span></td>
                <td>2 mins ago</td>
              </tr>
              <tr>
                <td><span class="badge badge-info">TXT</span></td>
                <td>company.agenticmail.io</td>
                <td>v=spf1 include:agenticmail.io ~all</td>
                <td><span class="badge badge-success">Valid</span></td>
                <td>2 mins ago</td>
              </tr>
              <tr>
                <td><span class="badge badge-info">TXT</span></td>
                <td>default._domainkey.company.agenticmail.io</td>
                <td>k=rsa; p=MIGfMA0GCSqGSIb3DQEBA...</td>
                <td><span class="badge badge-success">Valid</span></td>
                <td>2 mins ago</td>
              </tr>
              <tr>
                <td><span class="badge badge-info">TXT</span></td>
                <td>_dmarc.company.agenticmail.io</td>
                <td>v=DMARC1; p=quarantine; rua=mailto:dmarc@company.com</td>
                <td><span class="badge badge-success">Valid</span></td>
                <td>2 mins ago</td>
              </tr>
              <tr>
                <td><span class="badge badge-info">CNAME</span></td>
                <td>mail.company.agenticmail.io</td>
                <td>mail.agenticmail.io</td>
                <td><span class="badge badge-success">Valid</span></td>
                <td>2 mins ago</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export { renderDomainStatus };