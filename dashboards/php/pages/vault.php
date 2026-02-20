<?php
/**
 * Vault Page — Secrets table + add secret form + rotate/delete actions
 */
$secrets = am_api('/engine/vault/secrets?orgId=default');

layout_start('Vault', 'vault');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Vault</h2><p class="desc" style="margin:0">Encrypted secrets management with AES-256-GCM</p></div>
    <div style="display:flex;gap:8px">
      <a class="btn" href="?page=vault&action=rotate_all_secrets" onclick="return confirm('Re-encrypt all secrets with fresh keys?')">&#128260; Rotate All</a>
      <button class="btn btn-p" onclick="document.getElementById('modal-vault').style.display='flex'">+ Add Secret</button>
    </div>
  </div>
  <div class="card">
    <div class="card-t">Secrets</div>
    <?php $list = $secrets['secrets'] ?? $secrets['entries'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128274;</div>No secrets stored yet<div style="color:var(--muted);font-size:12px;margin-top:4px">Secrets are encrypted at rest with AES-256-GCM</div></div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Category</th><th>Created By</th><th>Created</th><th>Last Rotated</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $s): ?>
        <?php
          $cat = $s['category'] ?? 'custom';
          $catColors = [
            'deploy' => '#6366f1',
            'cloud_storage' => '#0ea5e9',
            'api_key' => '#f59e0b',
            'skill_credential' => '#10b981',
            'custom' => '#6b7280',
          ];
          $catColor = $catColors[$cat] ?? '#6b7280';
          $catLabel = str_replace('_', ' ', $cat);
        ?>
        <tr>
          <td style="font-weight:600"><?= e($s['name'] ?? '') ?></td>
          <td><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:<?= $catColor ?>"><?= e($catLabel) ?></span></td>
          <td style="color:var(--muted);font-size:13px"><?= e($s['createdBy'] ?? '-') ?></td>
          <td style="color:var(--muted);font-size:12px"><?= isset($s['createdAt']) ? date('M j, Y', strtotime($s['createdAt'])) : '-' ?></td>
          <td style="color:var(--muted);font-size:12px"><?= isset($s['rotatedAt']) ? date('M j, Y', strtotime($s['rotatedAt'])) : 'Never' ?></td>
          <td style="display:flex;gap:6px">
            <a class="btn btn-sm" href="?page=vault&action=rotate_secret&id=<?= e($s['id'] ?? '') ?>" onclick="return confirm('Rotate encryption for this secret?')">Rotate</a>
            <a class="btn btn-sm btn-d" href="?page=vault&action=delete_secret&id=<?= e($s['id'] ?? '') ?>" onclick="return confirm('Permanently delete this secret? Any services using it will immediately lose access.')">Delete</a>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <!-- Add Secret Modal -->
  <div id="modal-vault" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Add Secret</h3>
      <form method="POST"><input type="hidden" name="action" value="create_secret">
        <div class="fg"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. AWS_SECRET_KEY, SMTP_PASSWORD"></div>
        <div class="fg"><label class="fl">Value</label><input class="input" name="value" type="password" required placeholder="The secret value to encrypt"></div>
        <p style="font-size:11px;color:var(--muted);margin:-8px 0 12px">This value will be encrypted with AES-256-GCM before storage.</p>
        <div class="fg"><label class="fl">Category</label><select class="input" name="category">
          <option value="deploy">Deploy Credentials</option>
          <option value="cloud_storage">Cloud Storage</option>
          <option value="api_key">API Key</option>
          <option value="skill_credential">Skill Credential</option>
          <option value="custom" selected>Custom</option>
        </select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Store Secret</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();
