<?php
/**
 * Dashboard Page — Stats grid + recent audit activity
 */
$stats = am_api('/api/stats');
$audit = am_api('/api/audit?limit=8');

layout_start('Dashboard', 'dashboard');

if ($stats):
?>
  <h2 class="title">Dashboard</h2>
  <p class="desc">Overview of your AgenticMail instance</p>
  <?php render_stats($stats); ?>
  <div class="card">
    <div class="card-t">Recent Activity</div>
    <?php $events = $audit['events'] ?? []; if (empty($events)): ?>
      <div class="empty"><div class="empty-i">&#128203;</div>No activity yet</div>
    <?php else: foreach ($events as $ev): ?>
      <div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="color:var(--primary);font-weight:500"><?= e($ev['action']) ?></span> on <?= e($ev['resource']) ?>
        <div style="font-size:11px;color:var(--muted)"><?= date('M j, Y g:i A', strtotime($ev['timestamp'])) ?><?= $ev['ip'] ? " &middot; {$ev['ip']}" : '' ?></div>
      </div>
    <?php endforeach; endif; ?>
  </div>
<?php
endif;

layout_end();
