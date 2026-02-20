<?php
/**
 * Audit Log Page — Paginated event table
 */
$p = max(0, (int)($_GET['p'] ?? 0));
$audit = am_api("/api/audit?limit=25&offset=" . ($p * 25));
$total = $audit['total'] ?? 0;
$pages = max(1, ceil($total / 25));

layout_start('Audit Log', 'audit');
?>
  <h2 class="title">Audit Log</h2>
  <p class="desc"><?= $total ?> total events</p>
  <div class="card">
    <?php $events = $audit['events'] ?? []; if (empty($events)): ?>
      <div class="empty"><div class="empty-i">&#128203;</div>No audit events yet</div>
    <?php else: ?>
      <table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead><tbody>
      <?php foreach ($events as $ev): ?>
        <tr><td style="font-size:12px;color:var(--muted);white-space:nowrap"><?= date('M j g:i A', strtotime($ev['timestamp'])) ?></td><td><?= e($ev['actor']) ?></td><td style="color:var(--primary);font-weight:500"><?= e($ev['action']) ?></td><td style="font-size:12px"><?= e($ev['resource']) ?></td><td style="font-size:12px;color:var(--muted)"><?= $ev['ip'] ?: '-' ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
        <?php if ($p > 0): ?><a class="btn btn-sm" href="?page=audit&p=<?= $p - 1 ?>">&#8592; Prev</a><?php endif; ?>
        <span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page <?= $p + 1 ?> of <?= $pages ?></span>
        <?php if (($p + 1) * 25 < $total): ?><a class="btn btn-sm" href="?page=audit&p=<?= $p + 1 ?>">Next &#8594;</a><?php endif; ?>
      </div>
    <?php endif; ?>
  </div>
<?php
layout_end();
