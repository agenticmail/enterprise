<?php
/**
 * Skill Connections Page — Manage skill relationships and dependencies
 */

layout_start('Skill Connections', 'skill-connections');
?>

<h2 class="title">Skill Connections</h2>
<p class="desc">Visualize and manage relationships between skills</p>

<div style="margin-bottom: 20px;">
  <button class="btn btn-primary">+ Create Connection</button>
  <button class="btn btn-secondary" style="margin-left: 10px;">View Network</button>
</div>

<div class="card">
  <div class="card-t">Skill Network Overview</div>
  <div class="empty">
    <div class="empty-i">🔗</div>
    <p>No skill connections configured</p>
    <small>Create connections between skills to enable complex workflows</small>
  </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
  <div class="card">
    <div class="card-t">Connection Types</div>
    <div style="padding: 20px;">
      <div class="connection-type">
        <span class="connection-indicator depends"></span>
        <span>Dependencies</span>
        <span class="badge">0</span>
      </div>
      <div class="connection-type">
        <span class="connection-indicator enhances"></span>
        <span>Enhancements</span>
        <span class="badge">0</span>
      </div>
      <div class="connection-type">
        <span class="connection-indicator conflicts"></span>
        <span>Conflicts</span>
        <span class="badge">0</span>
      </div>
    </div>
  </div>
  
  <div class="card">
    <div class="card-t">Recent Changes</div>
    <div class="empty">
      <div class="empty-i">📋</div>
      <p>No recent changes</p>
      <small>Connection updates will appear here</small>
    </div>
  </div>
</div>

<style>
.connection-type {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.connection-type:last-child {
  border-bottom: none;
}
.connection-indicator {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
.connection-indicator.depends {
  background: var(--info);
}
.connection-indicator.enhances {
  background: var(--success);
}
.connection-indicator.conflicts {
  background: var(--warning);
}
.connection-type .badge {
  margin-left: auto;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}
</style>

<?php layout_end(); ?>