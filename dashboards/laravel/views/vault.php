<?php
/**
 * Vault page — secrets table + add secret form + rotate/delete actions.
 * Expects: $items (array of secret records)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Add Secret</h3>
    <form method="post" action="/vault" class="inline-form">
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="name" placeholder="e.g. AWS_SECRET_KEY" required>
        </div>
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="password" name="value" placeholder="Secret value" required>
        </div>
        <div class="form-group" style="min-width:160px;margin-bottom:0">
            <select name="category">
                <option value="deploy">Deploy Credentials</option>
                <option value="cloud_storage">Cloud Storage</option>
                <option value="api_key">API Key</option>
                <option value="skill_credential">Skill Credential</option>
                <option value="custom" selected>Custom</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">Store Secret</button>
    </form>
    <p style="font-size:11px;color:var(--text-muted);margin-top:6px">The value will be encrypted with AES-256-GCM before storage.</p>
</div>

<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <form method="post" action="/vault" style="display:inline">
        <input type="hidden" name="_action" value="rotate_all">
        <button type="submit" class="btn btn-secondary" onclick="return confirm('Re-encrypt all secrets with fresh keys?')">&#128260; Rotate All</button>
    </form>
</div>

<?php
$catColors = [
    'deploy'           => '#6366f1',
    'cloud_storage'    => '#0ea5e9',
    'api_key'          => '#f59e0b',
    'skill_credential' => '#10b981',
    'custom'           => '#6b7280',
];

$headers = ['Name', 'Category', 'Created By', 'Created', 'Last Rotated', 'Actions'];
$rows = [];
foreach ($items as $s) {
    $id       = Helpers::e($s['id'] ?? '');
    $name     = '<strong>' . Helpers::e($s['name'] ?? '-') . '</strong>';
    $cat      = $s['category'] ?? 'custom';
    $catColor = $catColors[$cat] ?? '#6b7280';
    $catLabel = str_replace('_', ' ', $cat);
    $catBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:' . $catColor . '">' . Helpers::e($catLabel) . '</span>';

    $createdBy = Helpers::e($s['createdBy'] ?? '-');
    $created   = isset($s['createdAt']) ? Helpers::timeAgo($s['createdAt']) : '-';
    $rotated   = isset($s['rotatedAt']) ? Helpers::timeAgo($s['rotatedAt']) : 'Never';

    $rotateForm  = '<form method="post" action="/vault" style="display:inline">';
    $rotateForm .= '<input type="hidden" name="_action" value="rotate">';
    $rotateForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $rotateForm .= '<button type="submit" class="btn btn-sm btn-secondary" onclick="return confirm(\'Rotate encryption for this secret?\')">Rotate</button>';
    $rotateForm .= '</form>';

    $deleteForm  = '<form method="post" action="/vault" style="display:inline">';
    $deleteForm .= '<input type="hidden" name="_action" value="delete">';
    $deleteForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $deleteForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Permanently delete this secret? Any services using it will immediately lose access.\')">Delete</button>';
    $deleteForm .= '</form>';

    $rows[] = [$name, $catBadge, $createdBy, $created, $rotated, $rotateForm . ' ' . $deleteForm];
}
?>

<div class="card">
    <h3>Secrets</h3>
    <?= renderTable($headers, $rows) ?>
</div>
