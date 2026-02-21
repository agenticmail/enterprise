<?php
/**
 * Workforce Page — Agent scheduling and workload management
 */

layout_start('Workforce', 'workforce');
?>

<h2 class="title">Workforce</h2>
<p class="desc">Monitor agent schedules, workloads, and availability</p>

<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
  <div class="stat-card">
    <div class="stat-icon">🤖</div>
    <div class="stat-value">0</div>
    <div class="stat-label">Active Agents</div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">⏳</div>
    <div class="stat-value">0</div>
    <div class="stat-label">Pending Tasks</div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">📊</div>
    <div class="stat-value">0%</div>
    <div class="stat-label">Utilization</div>
  </div>
</div>

<div class="tabs">
  <div class="tab active">Schedule</div>
  <div class="tab">Workload</div>
  <div class="tab">Analytics</div>
</div>

<div class="card">
  <div class="card-t">Agent Schedule</div>
  <div class="empty">
    <div class="empty-i">🕐</div>
    <p>No scheduled tasks</p>
    <small>Agent schedules and time allocations will appear here</small>
  </div>
</div>

<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 20px;">
  <div class="card">
    <div class="card-t">Workload Distribution</div>
    <div class="empty">
      <div class="empty-i">⚖️</div>
      <p>No workload data</p>
      <small>Agent workload distribution will appear here</small>
    </div>
  </div>
  
  <div class="card">
    <div class="card-t">Performance Metrics</div>
    <div class="empty">
      <div class="empty-i">📈</div>
      <p>No metrics available</p>
      <small>Performance analytics will appear here</small>
    </div>
  </div>
</div>

<style>
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
}
.stat-icon {
  font-size: 24px;
  margin-bottom: 8px;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-text);
  margin-bottom: 4px;
}
.stat-label {
  font-size: 13px;
  color: var(--text-muted);
}
</style>

<?php layout_end(); ?>