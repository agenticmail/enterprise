<?php
/**
 * Activity Page — Real-time activity and tool usage
 */

layout_start('Activity', 'activity');
?>

<h2 class="title">Activity</h2>
<p class="desc">Real-time activity and tool usage across all agents</p>

<div class="tabs">
  <div class="tab active">Events</div>
  <div class="tab">Tool Calls</div>
</div>

<div class="card">
  <div class="card-t">Recent Events</div>
  <div class="empty">
    <div class="empty-i">📋</div>
    <p>No events recorded</p>
    <small>Agent activity will appear here</small>
  </div>
</div>

<div class="card" style="margin-top: 20px;">
  <div class="card-t">Tool Usage</div>
  <div class="empty">
    <div class="empty-i">🛠️</div>
    <p>No tool calls recorded</p>
    <small>Tool usage statistics will appear here</small>
  </div>
</div>

<?php layout_end(); ?>