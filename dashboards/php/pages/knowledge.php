<?php
/**
 * Knowledge Bases Page — Manage knowledge bases and documents
 */

layout_start('Knowledge Bases', 'knowledge');
?>

<h2 class="title">Knowledge Bases</h2>
<p class="desc">Manage and organize knowledge bases for your agents</p>

<div style="margin-bottom: 20px;">
  <button class="btn btn-primary">+ Create Knowledge Base</button>
</div>

<div class="card">
  <div class="card-t">Active Knowledge Bases</div>
  <div class="empty">
    <div class="empty-i">📚</div>
    <p>No knowledge bases created</p>
    <small>Create your first knowledge base to get started</small>
  </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
  <div class="card">
    <div class="card-t">Recent Activity</div>
    <div class="empty">
      <div class="empty-i">📈</div>
      <p>No recent activity</p>
    </div>
  </div>
  
  <div class="card">
    <div class="card-t">Knowledge Stats</div>
    <div class="empty">
      <div class="empty-i">📊</div>
      <p>No statistics available</p>
    </div>
  </div>
</div>

<?php layout_end(); ?>