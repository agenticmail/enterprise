<?php
/**
 * DLP page — rules table, create form, violations, and test scan.
 * Expects: $ruleItems (array of DLP rules), $violationItems (array of violations)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Create DLP Rule</h3>
    <form method="post" action="/dlp" class="inline-form">
        <input type="hidden" name="_action" value="create_rule">
        <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0">
            <input type="text" name="name" placeholder="Rule name" required>
        </div>
        <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0">
            <input type="text" name="pattern" placeholder="Pattern (regex)" required>
        </div>
        <div class="form-group" style="min-width:120px;margin-bottom:0">
            <select name="action">
                <option value="block">Block</option>
                <option value="alert">Alert</option>
                <option value="redact">Redact</option>
            </select>
        </div>
        <div class="form-group" style="min-width:120px;margin-bottom:0">
            <select name="severity">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">Create</button>
    </form>
</div>

<?php
$headers = ['Name', 'Pattern', 'Action', 'Severity', 'Actions'];
$rows = [];
foreach ($ruleItems as $r) {
    $id       = Helpers::e($r['id'] ?? '');
    $name     = '<strong>' . Helpers::e($r['name'] ?? '-') . '</strong>';
    $pattern  = '<code>' . Helpers::e($r['pattern'] ?? '-') . '</code>';
    $action   = Helpers::statusBadge($r['action'] ?? 'block');
    $severity = Helpers::statusBadge($r['severity'] ?? 'high');

    $deleteForm  = '<form method="post" action="/dlp" style="display:inline">';
    $deleteForm .= '<input type="hidden" name="_action" value="delete_rule">';
    $deleteForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $deleteForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Delete this rule?\')">Delete</button>';
    $deleteForm .= '</form>';

    $rows[] = [$name, $pattern, $action, $severity, $deleteForm];
}
?>

<div class="card">
    <h3>DLP Rules</h3>
    <?= renderTable($headers, $rows) ?>
</div>

<?php
$vHeaders = ['Rule', 'Content', 'Severity', 'Time'];
$vRows = [];
foreach ($violationItems as $v) {
    $rule     = Helpers::e($v['rule'] ?? $v['ruleName'] ?? '-');
    $content  = Helpers::e(mb_strimwidth($v['content'] ?? $v['match'] ?? '-', 0, 80, '...'));
    $severity = Helpers::statusBadge($v['severity'] ?? 'high');
    $time     = Helpers::timeAgo($v['created_at'] ?? $v['timestamp'] ?? '-');
    $vRows[]  = [$rule, $content, $severity, $time];
}
?>

<div class="card">
    <h3>Violations</h3>
    <?= renderTable($vHeaders, $vRows) ?>
</div>

<div class="card">
    <h3>Test Scan</h3>
    <form method="post" action="/dlp">
        <input type="hidden" name="_action" value="scan">
        <div class="form-group">
            <textarea name="content" rows="4" placeholder="Paste content to scan for DLP violations..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Run Scan</button>
    </form>
</div>
