<?php
/**
 * Journal page — stats, entries table, and rollback.
 * Expects: $statData (array of stats), $entryItems (array of journal entries)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Journal Stats</h3>
    <div class="inline-form" style="gap:24px">
        <div>
            <strong>Total Entries:</strong>
            <?= Helpers::e((string)($statData['totalEntries'] ?? $statData['total'] ?? '0')) ?>
        </div>
        <div>
            <strong>Rollbacks:</strong>
            <?= Helpers::e((string)($statData['rollbacks'] ?? '0')) ?>
        </div>
        <div>
            <strong>Last Activity:</strong>
            <?= Helpers::timeAgo($statData['lastActivity'] ?? $statData['last_activity'] ?? '-') ?>
        </div>
    </div>
</div>

<?php
$headers = ['Action', 'Agent', 'Target', 'Status', 'Time', 'Actions'];
$rows = [];
foreach ($entryItems as $e) {
    $id     = Helpers::e($e['id'] ?? '');
    $action = Helpers::e($e['action'] ?? $e['event'] ?? '-');
    $agent  = Helpers::e($e['agent'] ?? $e['agentName'] ?? '-');
    $target = Helpers::e($e['target'] ?? $e['resource'] ?? '-');
    $status = Helpers::statusBadge($e['status'] ?? 'active');
    $time   = Helpers::timeAgo($e['created_at'] ?? $e['timestamp'] ?? '-');

    $rollbackForm  = '<form method="post" action="/journal" style="display:inline">';
    $rollbackForm .= '<input type="hidden" name="_action" value="rollback">';
    $rollbackForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $rollbackForm .= '<button type="submit" class="btn btn-sm btn-warning" onclick="return confirm(\'Rollback this entry?\')">Rollback</button>';
    $rollbackForm .= '</form>';

    $rows[] = [$action, $agent, $target, $status, $time, $rollbackForm];
}
?>

<div class="card">
    <h3>Journal Entries</h3>
    <?= renderTable($headers, $rows) ?>
</div>
