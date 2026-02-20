<?php
/**
 * Compliance Page — Reports table + generate form + download
 */
$reports = am_api('/engine/compliance/reports?orgId=default');

layout_start('Compliance', 'compliance');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Compliance</h2><p class="desc" style="margin:0">Generate and download compliance reports</p></div>
    <button class="btn btn-p" onclick="document.getElementById('modal-compliance').style.display='flex'">+ Generate Report</button>
  </div>
  <div class="card">
    <div class="card-t">Reports</div>
    <?php $list = $reports['reports'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128196;</div>No compliance reports</div>
    <?php else: ?>
      <table><thead><tr><th>Type</th><th>Generated</th><th>Period</th><th>Status</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $r): ?>
        <tr><td style="font-weight:600"><?= e(strtoupper($r['type'] ?? '')) ?></td><td style="font-size:12px;color:var(--muted);white-space:nowrap"><?= isset($r['createdAt']) ? date('M j, Y g:i A', strtotime($r['createdAt'])) : '-' ?></td><td style="font-size:12px"><?= e($r['period'] ?? '') ?></td><td><?= badge($r['status'] ?? 'completed') ?></td><td><a class="btn btn-sm" href="?page=compliance&action=download_report&id=<?= e($r['id'] ?? '') ?>">Download</a></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <!-- Generate Report Modal -->
  <div id="modal-compliance" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Generate Compliance Report</h3>
      <form method="POST"><input type="hidden" name="action" value="generate_report">
        <div class="fg"><label class="fl">Report Type</label><select class="input" name="report_type"><option value="soc2">SOC 2</option><option value="gdpr">GDPR</option><option value="audit">Audit</option></select></div>
        <div class="fg"><label class="fl">Period Start</label><input class="input" type="date" name="period_start" required></div>
        <div class="fg"><label class="fl">Period End</label><input class="input" type="date" name="period_end" required></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Generate</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();
