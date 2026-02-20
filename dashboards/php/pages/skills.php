<?php
/**
 * Skills Page — Builtin skills grid + installed community skills table
 */
$builtin = am_api('/engine/skills/by-category');
$installed = am_api('/engine/community/installed?orgId=default');

layout_start('Skills', 'skills');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Skills</h2><p class="desc" style="margin:0">Builtin capabilities and community skill integrations</p></div>
  </div>

  <!-- Builtin Skills -->
  <div class="card" style="margin-bottom:24px">
    <div class="card-t">Builtin Skills</div>
    <?php $categories = $builtin['categories'] ?? []; if (empty($categories)): ?>
      <div class="empty"><div class="empty-i">&#128268;</div>No builtin skills found</div>
    <?php else: ?>
      <?php foreach ($categories as $cat => $skills): ?>
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:8px"><?= e(str_replace('-', ' ', $cat)) ?></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
            <?php foreach ($skills as $sk): ?>
              <div style="padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff)">
                <div style="font-weight:600;font-size:14px;margin-bottom:4px"><?= e($sk['name'] ?? '') ?></div>
                <div style="font-size:12px;color:var(--muted);line-height:1.4"><?= e($sk['description'] ?? '') ?></div>
                <?php if (!empty($sk['tools'])): ?>
                  <div style="font-size:11px;color:var(--muted);margin-top:6px"><?= count($sk['tools']) ?> tools</div>
                <?php endif; ?>
              </div>
            <?php endforeach; ?>
          </div>
        </div>
      <?php endforeach; ?>
    <?php endif; ?>
  </div>

  <!-- Installed Community Skills -->
  <div class="card">
    <div class="card-t">Installed Community Skills</div>
    <?php $list = $installed['installed'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128230;</div>No community skills installed yet<div style="color:var(--muted);font-size:12px;margin-top:4px">Install skills from the Community Marketplace to extend your agents</div></div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Version</th><th>Status</th><th>Installed</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $sk):
        $meta = $sk['skill'] ?? $sk['manifest'] ?? $sk;
        $skillName = $meta['name'] ?? $sk['skillId'] ?? '';
        $enabled = $sk['enabled'] ?? false;
      ?>
        <tr>
          <td style="font-weight:600"><?= e($skillName) ?></td>
          <td style="color:var(--muted);font-size:13px">v<?= e($sk['version'] ?? '0.0.0') ?></td>
          <td><?= $enabled ? badge('active') : badge('archived') ?></td>
          <td style="color:var(--muted);font-size:12px"><?= isset($sk['installedAt']) ? date('M j, Y', strtotime($sk['installedAt'])) : '-' ?></td>
          <td style="display:flex;gap:6px">
            <?php if ($enabled): ?>
              <form method="POST" style="display:inline"><input type="hidden" name="action" value="disable_skill"><input type="hidden" name="skill_id" value="<?= e($sk['skillId'] ?? '') ?>"><button class="btn btn-sm" type="submit">Disable</button></form>
            <?php else: ?>
              <form method="POST" style="display:inline"><input type="hidden" name="action" value="enable_skill"><input type="hidden" name="skill_id" value="<?= e($sk['skillId'] ?? '') ?>"><button class="btn btn-sm btn-p" type="submit">Enable</button></form>
            <?php endif; ?>
            <form method="POST" style="display:inline"><input type="hidden" name="action" value="uninstall_skill"><input type="hidden" name="skill_id" value="<?= e($sk['skillId'] ?? '') ?>"><button class="btn btn-sm btn-d" type="submit" onclick="return confirm('Uninstall this skill? Any active connections will be lost.')">Uninstall</button></form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
<?php
layout_end();
