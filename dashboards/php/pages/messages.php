<?php
/**
 * Messages Page — Message table + send form
 */
$p = max(0, (int)($_GET['p'] ?? 0));
$messages = am_api('/engine/messages?orgId=default&limit=25&offset=' . ($p * 25));
$total = $messages['total'] ?? 0;
$pages = max(1, ceil($total / 25));

layout_start('Messages', 'messages');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Messages</h2><p class="desc" style="margin:0"><?= $total ?> total messages</p></div>
    <button class="btn btn-p" onclick="document.getElementById('modal-message').style.display='flex'">+ Send Message</button>
  </div>
  <div class="card">
    <?php $list = $messages['messages'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128231;</div>No messages yet</div>
    <?php else: ?>
      <table><thead><tr><th>Time</th><th>From</th><th>To</th><th>Subject</th><th>Direction</th><th>Channel</th><th>Status</th></tr></thead><tbody>
      <?php foreach ($list as $m):
        $dir = $m['direction'] ?? 'inbound';
        $dirColors = ['inbound' => '#3b82f6', 'outbound' => '#22c55e', 'internal' => '#888'];
        $dirColor = $dirColors[$dir] ?? '#888';
        $chan = $m['channel'] ?? 'email';
        $chanColors = ['email' => '#e84393', 'api' => '#f59e0b', 'internal' => '#888', 'webhook' => '#3b82f6'];
        $chanColor = $chanColors[$chan] ?? '#888';
      ?>
        <tr><td style="font-size:12px;color:var(--muted);white-space:nowrap"><?= isset($m['timestamp']) ? date('M j g:i A', strtotime($m['timestamp'])) : '-' ?></td><td style="font-weight:600"><?= e($m['from'] ?? '') ?></td><td><?= e($m['to'] ?? '') ?></td><td style="font-size:12px"><?= e($m['subject'] ?? '') ?></td><td><span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:<?= $dirColor ?>20;color:<?= $dirColor ?>"><?= e($dir) ?></span></td><td><span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:<?= $chanColor ?>20;color:<?= $chanColor ?>"><?= e($chan) ?></span></td><td><?= badge($m['status'] ?? 'sent') ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
        <?php if ($p > 0): ?><a class="btn btn-sm" href="?page=messages&p=<?= $p - 1 ?>">&#8592; Prev</a><?php endif; ?>
        <span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page <?= $p + 1 ?> of <?= $pages ?></span>
        <?php if (($p + 1) * 25 < $total): ?><a class="btn btn-sm" href="?page=messages&p=<?= $p + 1 ?>">Next &#8594;</a><?php endif; ?>
      </div>
    <?php endif; ?>
  </div>
  <!-- Send Message Modal -->
  <div id="modal-message" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Send Message</h3>
      <form method="POST"><input type="hidden" name="action" value="send_message">
        <div class="fg"><label class="fl">From</label><input class="input" name="from" required placeholder="e.g. agent@agenticmail.io"></div>
        <div class="fg"><label class="fl">To</label><input class="input" name="to" required placeholder="e.g. user@agenticmail.io"></div>
        <div class="fg"><label class="fl">Subject</label><input class="input" name="subject" required placeholder="e.g. Weekly report"></div>
        <div class="fg"><label class="fl">Body</label><textarea class="input" name="body" required rows="5" placeholder="Message content..."></textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Send</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();
