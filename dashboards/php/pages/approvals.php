<?php
/**
 * Approvals Page — Pending approval requests
 */

layout_start('Approvals', 'approvals');
?>

<h2 class="title">Approvals</h2>
<p class="desc">Review and manage pending approval requests</p>

<div class="tabs">
  <div class="tab active">Pending</div>
  <div class="tab">Approved</div>
  <div class="tab">Rejected</div>
</div>

<div class="card">
  <div class="card-t">Pending Approvals</div>
  <div class="empty">
    <div class="empty-i">✅</div>
    <p>No pending approvals</p>
    <small>Agent approval requests will appear here</small>
  </div>
</div>

<div class="card" style="margin-top: 20px;">
  <div class="card-t">Approval History</div>
  <div class="empty">
    <div class="empty-i">📋</div>
    <p>No approval history</p>
    <small>Past approvals and rejections will appear here</small>
  </div>
</div>

<?php layout_end(); ?>