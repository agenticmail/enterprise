<?php
/**
 * API Keys Page — Create form + list + revoke + key banner
 */
$keys = am_api('/api/api-keys');

layout_start('API Keys', 'api-keys');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">API Keys</h2><p class="desc" style="margin:0">Manage programmatic access</p></div>
    <button class="btn btn-p" onclick="document.getElementById('modal-key').style.display='flex'">+ New Key</button>
  </div>
  <div class="card">
    <?php $list = $keys['keys'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128273;</div>No API keys</div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Key</th><th>Last Used</th><th>Status</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $k): ?>
        <tr><td style="font-weight:600"><?= e($k['name']) ?></td><td><code style="font-size:12px"><?= e($k['keyPrefix']) ?>...</code></td><td style="color:var(--muted);font-size:12px"><?= isset($k['lastUsedAt']) ? date('M j g:i A', strtotime($k['lastUsedAt'])) : 'Never' ?></td><td><?= badge($k['revoked'] ? 'archived' : 'active') ?></td><td><?php if (!($k['revoked'] ?? false)): ?><a class="btn btn-sm btn-d" href="?page=api-keys&action=revoke_key&id=<?= e($k['id']) ?>">Revoke</a><?php endif; ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <div id="modal-key" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Create API Key</h3>
      <form method="POST"><input type="hidden" name="action" value="create_key">
        <div class="fg"><label class="fl">Key Name</label><input class="input" name="name" required placeholder="e.g. CI/CD pipeline"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Create</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();
