<?php
/**
 * API Keys page — create form + key list + revoke + show-once key banner.
 * Expects: $items (array of key records), $newKey (string|null — newly created key)
 */
include_once __DIR__ . '/components/table.php';

// Show-once key banner — displayed only once after creation
if ($newKey): ?>
<div class="key-banner">
    <strong>&#9888; Save this API key now!</strong> You will not be able to see it again.
    <code><?= Helpers::e($newKey) ?></code>
</div>
<?php endif; ?>

<div class="card">
    <h3>Create API Key</h3>
    <form method="post" action="/api-keys" class="inline-form">
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="name" placeholder="Key name" required>
        </div>
        <div class="form-group" style="min-width:140px;margin-bottom:0">
            <select name="scopes">
                <option value="read">Read</option>
                <option value="read,write">Read + Write</option>
                <option value="admin">Admin</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">Create</button>
    </form>
</div>

<?php
$headers = ['Name', 'Key', 'Scopes', 'Actions'];
$rows = [];
foreach ($items as $k) {
    $id     = Helpers::e($k['id'] ?? '');
    $name   = Helpers::e($k['name'] ?? '-');
    $prefix = '<code>' . Helpers::e($k['prefix'] ?? $k['key'] ?? '****') . '</code>';
    $scopes = Helpers::e($k['scopes'] ?? '-');

    $revokeForm  = '<form method="post" action="/api-keys" style="display:inline">';
    $revokeForm .= '<input type="hidden" name="_action" value="revoke">';
    $revokeForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $revokeForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Revoke this key?\')">Revoke</button>';
    $revokeForm .= '</form>';

    $rows[] = [$name, $prefix, $scopes, $revokeForm];
}
?>

<div class="card">
    <h3>API Keys</h3>
    <?= renderTable($headers, $rows) ?>
</div>
