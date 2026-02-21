<?php
/**
 * Domain Status Page — Domain configuration and health status
 */

layout_start('Domain Status', 'domain-status');
?>

<h2 class="title">Domain Status</h2>
<p class="desc">Monitor domain configuration and security status</p>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
  <div class="card">
    <div class="card-t">Domain Configuration</div>
    <div style="padding: 20px;">
      <div class="status-item">
        <span class="status-indicator status-success"></span>
        <span>Domain connected</span>
      </div>
      <div class="status-item">
        <span class="status-indicator status-success"></span>
        <span>DNS configured</span>
      </div>
      <div class="status-item">
        <span class="status-indicator status-success"></span>
        <span>SSL certificate valid</span>
      </div>
    </div>
  </div>
  
  <div class="card">
    <div class="card-t">Security Status</div>
    <div style="padding: 20px;">
      <div class="status-item">
        <span class="status-indicator status-success"></span>
        <span>DKIM configured</span>
      </div>
      <div class="status-item">
        <span class="status-indicator status-success"></span>
        <span>SPF record valid</span>
      </div>
      <div class="status-item">
        <span class="status-indicator status-warning"></span>
        <span>DMARC recommended</span>
      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-t">Domain Health Monitoring</div>
  <div class="empty">
    <div class="empty-i">📊</div>
    <p>Domain monitoring dashboard</p>
    <small>Real-time domain health metrics will appear here</small>
  </div>
</div>

<style>
.status-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.status-item:last-child {
  border-bottom: none;
}
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-success {
  background: var(--success);
}
.status-warning {
  background: var(--warning);
}
.status-danger {
  background: var(--danger);
}
</style>

<?php layout_end(); ?>