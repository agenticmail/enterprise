<?php
/**
 * DLP Page — Rules CRUD + violations table + test scan
 */
$rules = am_api('/engine/dlp/rules?orgId=default');
$violations = am_api('/engine/dlp/violations?orgId=default');

layout_start('DLP', 'dlp');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Data Loss Prevention</h2><p class="desc" style="margin:0">Manage DLP rules, view violations, and test scans</p></div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="document.getElementById('modal-dlp-scan').style.display='flex'">Test Scan</button>
      <button class="btn btn-p" onclick="document.getElementById('modal-dlp-rule').style.display='flex'">+ New Rule</button>
    </div>
  </div>
  <div class="card">
    <div class="card-t">Rules</div>
    <?php $list = $rules['rules'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128274;</div>No DLP rules yet</div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Pattern</th><th>Action</th><th>Severity</th><th>Created</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $r): ?>
        <tr><td style="font-weight:600"><?= e($r['name'] ?? '') ?></td><td><code style="font-size:12px"><?= e($r['pattern'] ?? '') ?></code></td><td><?= e($r['action'] ?? '') ?></td><td><?= badge($r['severity'] ?? 'medium') ?></td><td style="color:var(--muted);font-size:12px"><?= isset($r['createdAt']) ? date('M j, Y', strtotime($r['createdAt'])) : '-' ?></td><td><a class="btn btn-sm btn-d" href="?page=dlp&action=delete_dlp_rule&id=<?= e($r['id'] ?? '') ?>">Delete</a></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <div class="card">
    <div class="card-t">Violations</div>
    <?php $vlist = $violations['violations'] ?? []; if (empty($vlist)): ?>
      <div class="empty"><div class="empty-i">&#128683;</div>No violations found</div>
    <?php else: ?>
      <table><thead><tr><th>Time</th><th>Rule</th><th>Agent</th><th>Action Taken</th><th>Match</th></tr></thead><tbody>
      <?php foreach ($vlist as $v): ?>
        <tr><td style="font-size:12px;color:var(--muted);white-space:nowrap"><?= isset($v['timestamp']) ? date('M j g:i A', strtotime($v['timestamp'])) : '-' ?></td><td style="font-weight:600"><?= e($v['ruleName'] ?? '') ?></td><td><?= e($v['agentId'] ?? '') ?></td><td><?= badge($v['actionTaken'] ?? 'blocked') ?></td><td style="font-size:12px"><code><?= e($v['match'] ?? '') ?></code></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <!-- Create Rule Modal -->
  <div id="modal-dlp-rule" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Create DLP Rule</h3>
      <form method="POST"><input type="hidden" name="action" value="create_dlp_rule">
        <div class="fg"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. Block SSN"></div>
        <div class="fg"><label class="fl">Pattern (regex)</label><input class="input" name="pattern" required placeholder="e.g. \d{3}-\d{2}-\d{4}"></div>
        <div class="fg"><label class="fl">Action</label><select class="input" name="action_type"><option>block</option><option>redact</option><option>flag</option><option>log</option></select></div>
        <div class="fg"><label class="fl">Severity</label><select class="input" name="severity"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Create</button></div>
      </form>
    </div>
  </div>
  <!-- Test Scan Modal -->
  <div id="modal-dlp-scan" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Test DLP Scan</h3>
      <form method="POST"><input type="hidden" name="action" value="dlp_scan">
        <div class="fg"><label class="fl">Content to scan</label><textarea class="input" name="content" required rows="5" placeholder="Paste text to test against DLP rules..."></textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Scan</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();
