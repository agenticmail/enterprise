<?php
/**
 * Guardrails Page — Pause/resume/kill agents + interventions + anomaly rules
 */
$interventions = am_api('/engine/guardrails/interventions?orgId=default');
$anomalyRules = am_api('/engine/anomaly-rules?orgId=default');
$agents = am_api('/api/agents');

layout_start('Guardrails', 'guardrails');
?>
  <h2 class="title">Guardrails</h2>
  <p class="desc">Control agent execution, view interventions, and manage anomaly rules</p>
  <div class="card">
    <div class="card-t">Agent Controls</div>
    <?php $agentList = $agents['agents'] ?? []; if (empty($agentList)): ?>
      <div class="empty"><div class="empty-i">&#129302;</div>No agents to control</div>
    <?php else: ?>
      <table><thead><tr><th>Agent</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      <?php foreach ($agentList as $a): ?>
        <tr><td style="font-weight:600"><?= e($a['name']) ?></td><td><?= badge($a['status'] ?? 'active') ?></td><td style="display:flex;gap:6px">
          <form method="POST" style="display:inline"><input type="hidden" name="action" value="guardrail_pause"><input type="hidden" name="id" value="<?= e($a['id']) ?>"><button class="btn btn-sm" type="submit">Pause</button></form>
          <form method="POST" style="display:inline"><input type="hidden" name="action" value="guardrail_resume"><input type="hidden" name="id" value="<?= e($a['id']) ?>"><button class="btn btn-sm" type="submit">Resume</button></form>
          <form method="POST" style="display:inline"><input type="hidden" name="action" value="guardrail_kill"><input type="hidden" name="id" value="<?= e($a['id']) ?>"><button class="btn btn-sm btn-d" type="submit">Kill</button></form>
        </td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <div class="card">
    <div class="card-t">Interventions</div>
    <?php $ilist = $interventions['interventions'] ?? []; if (empty($ilist)): ?>
      <div class="empty"><div class="empty-i">&#9888;&#65039;</div>No interventions recorded</div>
    <?php else: ?>
      <table><thead><tr><th>Time</th><th>Agent</th><th>Type</th><th>Reason</th><th>Status</th></tr></thead><tbody>
      <?php foreach ($ilist as $i): ?>
        <tr><td style="font-size:12px;color:var(--muted);white-space:nowrap"><?= isset($i['timestamp']) ? date('M j g:i A', strtotime($i['timestamp'])) : '-' ?></td><td style="font-weight:600"><?= e($i['agentId'] ?? '') ?></td><td><?= e($i['type'] ?? '') ?></td><td style="font-size:12px"><?= e($i['reason'] ?? '') ?></td><td><?= badge($i['status'] ?? 'active') ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;margin-top:24px">
    <div class="card-t" style="margin:0">Anomaly Rules</div>
    <button class="btn btn-p" onclick="document.getElementById('modal-anomaly').style.display='flex'">+ New Rule</button>
  </div>
  <div class="card">
    <?php $alist = $anomalyRules['rules'] ?? []; if (empty($alist)): ?>
      <div class="empty"><div class="empty-i">&#128200;</div>No anomaly rules</div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Metric</th><th>Threshold</th><th>Action</th><th>Enabled</th></tr></thead><tbody>
      <?php foreach ($alist as $ar): ?>
        <tr><td style="font-weight:600"><?= e($ar['name'] ?? '') ?></td><td><?= e($ar['metric'] ?? '') ?></td><td style="font-size:12px"><code><?= e((string)($ar['threshold'] ?? '')) ?></code></td><td><?= e($ar['action'] ?? '') ?></td><td><?= badge(($ar['enabled'] ?? false) ? 'active' : 'archived') ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <!-- Anomaly Rule Modal -->
  <div id="modal-anomaly" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Create Anomaly Rule</h3>
      <form method="POST"><input type="hidden" name="action" value="create_anomaly_rule">
        <div class="fg"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. Rate limit spike"></div>
        <div class="fg"><label class="fl">Metric</label><select class="input" name="metric"><option>messages_per_minute</option><option>errors_per_hour</option><option>api_calls_per_minute</option><option>token_usage_per_hour</option></select></div>
        <div class="fg"><label class="fl">Threshold</label><input class="input" type="number" name="threshold" required placeholder="e.g. 100"></div>
        <div class="fg"><label class="fl">Action</label><select class="input" name="action_type"><option>pause</option><option>kill</option><option>alert</option><option>log</option></select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Create</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();
