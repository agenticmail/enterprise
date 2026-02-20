<?php
/**
 * Journal Page — Stats + entries table + rollback action
 */
$stats = am_api('/engine/journal/stats/default');
$p = max(0, (int)($_GET['p'] ?? 0));
$entries = am_api('/engine/journal?orgId=default&limit=25&offset=' . ($p * 25));
$total = $entries['total'] ?? 0;
$pages = max(1, ceil($total / 25));

layout_start('Journal', 'journal');
?>
  <h2 class="title">Journal</h2>
  <p class="desc">Immutable log of all agent actions and system events</p>
  <?php if ($stats): ?>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px">
    <div class="card" style="text-align:center;padding:20px">
      <div style="font-size:28px;font-weight:700;color:var(--primary)"><?= (int)($stats['totalEntries'] ?? 0) ?></div>
      <div style="font-size:12px;color:var(--muted)">Total Entries</div>
    </div>
    <div class="card" style="text-align:center;padding:20px">
      <div style="font-size:28px;font-weight:700;color:var(--primary)"><?= (int)($stats['todayEntries'] ?? 0) ?></div>
      <div style="font-size:12px;color:var(--muted)">Today</div>
    </div>
    <div class="card" style="text-align:center;padding:20px">
      <div style="font-size:28px;font-weight:700;color:var(--primary)"><?= (int)($stats['rollbacks'] ?? 0) ?></div>
      <div style="font-size:12px;color:var(--muted)">Rollbacks</div>
    </div>
    <div class="card" style="text-align:center;padding:20px">
      <div style="font-size:28px;font-weight:700;color:var(--primary)"><?= (int)($stats['agents'] ?? 0) ?></div>
      <div style="font-size:12px;color:var(--muted)">Active Agents</div>
    </div>
  </div>
  <?php endif; ?>
  <div class="card">
    <div class="card-t">Entries</div>
    <?php $list = $entries['entries'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128214;</div>No journal entries</div>
    <?php else: ?>
      <table><thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Resource</th><th>Status</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $j): ?>
        <tr><td style="font-size:12px;color:var(--muted);white-space:nowrap"><?= isset($j['timestamp']) ? date('M j g:i A', strtotime($j['timestamp'])) : '-' ?></td><td style="font-weight:600"><?= e($j['agentId'] ?? '') ?></td><td style="color:var(--primary);font-weight:500"><?= e($j['action'] ?? '') ?></td><td style="font-size:12px"><?= e($j['resource'] ?? '') ?></td><td><?= badge($j['status'] ?? 'completed') ?></td><td><?php if (($j['rollbackable'] ?? false)): ?><a class="btn btn-sm btn-d" href="?page=journal&action=journal_rollback&id=<?= e($j['id'] ?? '') ?>">Rollback</a><?php endif; ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
        <?php if ($p > 0): ?><a class="btn btn-sm" href="?page=journal&p=<?= $p - 1 ?>">&#8592; Prev</a><?php endif; ?>
        <span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page <?= $p + 1 ?> of <?= $pages ?></span>
        <?php if (($p + 1) * 25 < $total): ?><a class="btn btn-sm" href="?page=journal&p=<?= $p + 1 ?>">Next &#8594;</a><?php endif; ?>
      </div>
    <?php endif; ?>
  </div>
<?php
layout_end();
