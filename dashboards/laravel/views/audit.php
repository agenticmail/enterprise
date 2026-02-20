<?php
/**
 * Audit page — paginated event table.
 * Expects: $items (array of audit events), $currentPage (int)
 */
include_once __DIR__ . '/components/table.php';

$headers = ['Action', 'Actor', 'Target', 'Time'];
$rows = [];
foreach ($items as $ev) {
    $action = Helpers::e($ev['action'] ?? $ev['event'] ?? '-');
    $actor  = Helpers::e($ev['actor'] ?? $ev['user'] ?? '-');
    $target = Helpers::e($ev['target'] ?? $ev['resource'] ?? '-');
    $time   = Helpers::timeAgo($ev['created_at'] ?? $ev['timestamp'] ?? '-');
    $rows[] = [$action, $actor, $target, $time];
}
?>

<div class="card">
    <h3>Audit Log</h3>
    <?= renderTable($headers, $rows) ?>

    <div class="pagination">
<?php if ($currentPage > 1): ?>
        <a href="/audit?page=<?= $currentPage - 1 ?>">&larr; Previous</a>
<?php endif; ?>
        <span class="current">Page <?= $currentPage ?></span>
        <a href="/audit?page=<?= $currentPage + 1 ?>">Next &rarr;</a>
    </div>
</div>
